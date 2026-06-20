"""
Detect.py — Roblox presence poller. Single worker process, multi-account aware.

This worker polls Roblox presence for EVERY tracked user across EVERY account
(key_id) in one pass, then logs events / opens-closes sessions per
(key_id, user_id) so accounts stay fully isolated from each other in the
database. One Detect.py process is enough for the whole site — there is no
per-account worker and no KEY_ID env var; the account scoping comes entirely
from the key_id column already stored on each tracked_users row.

Required env vars (set on the Render background worker):
    ROBLOX_COOKIE              .ROBLOSECURITY value (no prefix, no quotes)
    SUPABASE_URL               https://xxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY  service_role key, server-only
                                (SUPABASE_SERVICE_KEY also accepted)

Optional:
    POLL_INTERVAL              seconds between polls (default 10)
"""

import os
import time
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

load_dotenv()

ROBLOX_COOKIE = os.getenv("ROBLOX_COOKIE", "").strip()
SUPABASE_URL  = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY  = (os.getenv("SUPABASE_SERVICE_ROLE_KEY")
                 or os.getenv("SUPABASE_SERVICE_KEY")
                 or "").strip()
POLL_INTERVAL = max(3, int(os.getenv("POLL_INTERVAL", "10")))

PRESENCE_URL = "https://presence.roblox.com/v1/presence/users"
AUTH_CHECK_URL = "https://users.roblox.com/v1/users/authenticated"

OFFLINE, WEBSITE, IN_GAME, IN_STUDIO = 0, 1, 2, 3
PRESENCE_LABELS = {
    OFFLINE: "OFFLINE", WEBSITE: "WEBSITE",
    IN_GAME: "IN_GAME", IN_STUDIO: "IN_STUDIO",
}

if not SUPABASE_URL or not SUPABASE_KEY:
    raise SystemExit("[FATAL] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("[CONFIG] Supabase connected. Multi-account mode — polling all key_ids "
      "with tracked users in a single pass.")

# ---------------------------------------------------------------------------
# Roblox HTTP session — real browser-like headers, CSRF retry, cookie check
# ---------------------------------------------------------------------------

_session = requests.Session()
_session.headers.update({
    "Content-Type": "application/json",
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"),
    "Accept": "application/json",
    "Origin": "https://www.roblox.com",
    "Referer": "https://www.roblox.com/",
})
if ROBLOX_COOKIE:
    _session.cookies.set(".ROBLOSECURITY", ROBLOX_COOKIE,
                          domain=".roblox.com")

_CSRF = {"token": ""}


def _headers():
    h = {}
    if _CSRF["token"]:
        h["X-CSRF-TOKEN"] = _CSRF["token"]
    return h


def validate_cookie() -> bool:
    """Confirm ROBLOX_COOKIE is actually authenticated before polling starts."""
    if not ROBLOX_COOKIE:
        print("[WARN] ROBLOX_COOKIE is not set. Roblox's presence API only "
              "returns accurate data for users with public presence privacy "
              "when called unauthenticated — most users will show OFFLINE. "
              "Set ROBLOX_COOKIE for accurate detection.")
        return False
    try:
        r = _session.get(AUTH_CHECK_URL, timeout=10)
        if r.status_code == 200:
            data = r.json()
            print(f"[AUTH] ROBLOX_COOKIE valid — authenticated as "
                  f"{data.get('name', '?')} (id={data.get('id', '?')}).")
            return True
        if r.status_code == 401:
            print("[ERROR] ROBLOX_COOKIE is invalid or expired. Refresh it "
                  "in the Render worker's environment variables.")
            return False
        print(f"[WARN] Could not verify ROBLOX_COOKIE (HTTP {r.status_code}); "
              "continuing anyway.")
        return True
    except requests.RequestException as e:
        print(f"[WARN] Cookie validation request failed: {e}; continuing anyway.")
        return True


def fetch_presence(user_ids, max_retries=3):
    """POST to the presence API in chunks of <=100 ids, with CSRF + backoff retry."""
    if not user_ids:
        return []

    out = []
    for i in range(0, len(user_ids), 100):  # API caps at 100 ids per call
        chunk = user_ids[i:i + 100]
        backoff = 1.5
        for attempt in range(max_retries):
            try:
                r = _session.post(PRESENCE_URL, json={"userIds": chunk},
                                   headers=_headers(), timeout=15)
            except requests.RequestException as e:
                print(f"[ERROR] Presence request failed (attempt "
                      f"{attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                return out

            # CSRF challenge — capture token, retry same chunk immediately.
            if r.status_code == 403 and "x-csrf-token" in r.headers:
                _CSRF["token"] = r.headers["x-csrf-token"]
                print("[INFO] Captured X-CSRF-TOKEN; retrying chunk.")
                continue

            if r.status_code == 401:
                print("[ERROR] ROBLOSECURITY cookie invalid/expired mid-run. "
                      "Refresh ROBLOX_COOKIE on Render.")
                return out

            if r.status_code == 429:
                print(f"[WARN] Rate limited (429); backing off {backoff:.1f}s.")
                time.sleep(backoff)
                backoff *= 2
                continue

            if not r.ok:
                print(f"[ERROR] Presence HTTP {r.status_code}: {r.text[:200]}")
                if attempt < max_retries - 1:
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                return out

            try:
                out.extend(r.json().get("userPresences", []))
            except ValueError:
                print("[ERROR] Presence response was not valid JSON.")
            break

    return out


def presence_to_state(p):
    return {
        "userPresenceType": p.get("userPresenceType", OFFLINE),
        "lastLocation":     p.get("lastLocation") or "",
        "placeId":          p.get("placeId"),
        "rootPlaceId":      p.get("rootPlaceId"),
        "universeId":       p.get("universeId"),
        "gameId":           p.get("gameId"),
    }


def status_label(t):
    return PRESENCE_LABELS.get(t, f"UNKNOWN({t})")


# ---------------------------------------------------------------------------
# Supabase helpers — every write/read is scoped by key_id
# ---------------------------------------------------------------------------

def load_all_tracked_users():
    """Return {(key_id, user_id): username} for every account, in one query."""
    try:
        res = sb.table("tracked_users").select("key_id,id,name").execute()
        rows = res.data or []
        out = {}
        for r in rows:
            try:
                out[(r["key_id"], int(r["id"]))] = r["name"]
            except (KeyError, TypeError, ValueError):
                continue
        return out
    except Exception as e:
        print(f"[ERROR] load_all_tracked_users: {e}")
        return {}


def log_event(key_id, event_type, user_id, username,
              old_status=None, new_status=None,
              old_location=None, new_location=None,
              old_place_id=None, new_place_id=None):
    ts = datetime.now(timezone.utc).isoformat()
    row = {
        "key_id": key_id,
        "timestamp": ts,
        "user_id": user_id,
        "username": username,
        "event_type": event_type,
        "old_status": old_status,
        "new_status": new_status,
        "old_location": old_location,
        "new_location": new_location,
        "old_place_id": old_place_id,
        "new_place_id": new_place_id,
    }
    try:
        sb.table("events").insert(row).execute()
        print(f"[EVENT] ({key_id}) {event_type} {username} @ {ts}")
    except Exception as e:
        print(f"[ERROR] log_event failed: {e}")


def open_session(key_id, user_id, username, state):
    ts = datetime.now(timezone.utc).isoformat()
    row = {
        "key_id": key_id,
        "user_id": user_id,
        "username": username,
        "place_id": state.get("placeId"),
        "root_place_id": state.get("rootPlaceId"),
        "universe_id": state.get("universeId"),
        "game_id": state.get("gameId"),
        "location_name": state.get("lastLocation"),
        "start_time": ts,
    }
    try:
        res = sb.table("sessions").insert(row).execute()
        sid = res.data[0]["id"] if res.data else None
        print(f"[SESSION] ({key_id}) Opened #{sid} for {username} in "
              f"'{state.get('lastLocation')}'")
        return sid
    except Exception as e:
        print(f"[ERROR] open_session failed: {e}")
        return None


def close_session(session_id, username, key_id=""):
    if session_id is None:
        return
    try:
        res = (sb.table("sessions").select("start_time")
                 .eq("id", session_id).limit(1).execute())
        if not res.data:
            return
        start = datetime.fromisoformat(res.data[0]["start_time"].replace("Z", "+00:00"))
        end   = datetime.now(timezone.utc)
        duration = int((end - start).total_seconds())
        (sb.table("sessions")
           .update({"end_time": end.isoformat(), "duration_seconds": duration})
           .eq("id", session_id).execute())
        m, s = divmod(duration, 60)
        print(f"[SESSION] ({key_id}) Closed #{session_id} for {username} — {m}m {s}s")
    except Exception as e:
        print(f"[ERROR] close_session failed: {e}")


def close_orphaned_sessions():
    """Close any sessions left open from a previous worker run, across all accounts."""
    try:
        res = (sb.table("sessions")
                 .select("id,key_id,user_id,username,location_name,place_id,start_time")
                 .is_("end_time", "null")
                 .execute())
    except Exception as e:
        print(f"[ERROR] close_orphaned_sessions query: {e}")
        return
    rows = res.data or []
    if not rows:
        return
    now = datetime.now(timezone.utc)
    for r in rows:
        try:
            start = datetime.fromisoformat(r["start_time"].replace("Z", "+00:00"))
            duration = int((now - start).total_seconds())
            (sb.table("sessions")
               .update({"end_time": now.isoformat(), "duration_seconds": duration})
               .eq("id", r["id"]).execute())
            log_event(r["key_id"], "LEFT_GAME", r["user_id"], r["username"],
                      old_status="IN_GAME", new_status="OFFLINE",
                      old_location=r.get("location_name"),
                      old_place_id=r.get("place_id"))
            print(f"[DB] Closed orphaned session #{r['id']} ({r['key_id']}) "
                  f"for {r['username']} (~{duration // 60}m)")
        except Exception as e:
            print(f"[WARN] orphan close failed for #{r.get('id')}: {e}")


def consume_poll_triggers():
    """Consume all pending poll_triggers rows. Returns the set of key_ids that
    requested a manual refresh (empty set if none)."""
    try:
        res = sb.table("poll_triggers").select("id,key_id").limit(200).execute()
        rows = res.data or []
        if not rows:
            return set()
        ids = [r["id"] for r in rows]
        sb.table("poll_triggers").delete().in_("id", ids).execute()
        return {r["key_id"] for r in rows}
    except Exception as e:
        print(f"[WARN] consume_poll_triggers: {e}")
        return set()


# ---------------------------------------------------------------------------
# Change detection — operates per (key_id, user_id) so accounts never mix
# ---------------------------------------------------------------------------

def handle_changes(key_id, user_id, username, old, new, active_sessions):
    old_t, new_t = old["userPresenceType"], new["userPresenceType"]

    if old_t != new_t:
        print(f"  [{key_id}/{username}] {status_label(old_t)} -> {status_label(new_t)}")

        if new_t == IN_GAME:
            log_event(key_id, "ENTERED_GAME", user_id, username,
                      old_status=status_label(old_t), new_status=status_label(new_t),
                      new_location=new["lastLocation"], new_place_id=new["placeId"])
            active_sessions[(key_id, user_id)] = open_session(key_id, user_id, username, new)

        elif old_t == IN_GAME:
            log_event(key_id, "LEFT_GAME", user_id, username,
                      old_status=status_label(old_t), new_status=status_label(new_t),
                      old_location=old["lastLocation"], old_place_id=old["placeId"])
            close_session(active_sessions.pop((key_id, user_id), None), username, key_id)

    elif (old_t == IN_GAME and new_t == IN_GAME
          and old["placeId"] != new["placeId"]):
        print(f"  [{key_id}/{username}] SWITCHED_GAME: "
              f"'{old['lastLocation']}' -> '{new['lastLocation']}'")
        log_event(key_id, "SWITCHED_GAME", user_id, username,
                  old_location=old["lastLocation"], new_location=new["lastLocation"],
                  old_place_id=old["placeId"], new_place_id=new["placeId"])
        close_session(active_sessions.pop((key_id, user_id), None), username, key_id)
        active_sessions[(key_id, user_id)] = open_session(key_id, user_id, username, new)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    validate_cookie()
    close_orphaned_sessions()

    tracked = load_all_tracked_users()  # {(key_id, user_id): username}
    accounts = {kid for kid, _ in tracked}
    print(f"[CONFIG] Tracking {len(tracked)} user(s) across "
          f"{len(accounts)} account(s).")

    active_sessions = {}   # (key_id, user_id) -> session_id
    previous_state  = {}   # (key_id, user_id) -> presence state

    def unique_user_ids(t):
        ids = set()
        for _, uid in t:
            ids.add(uid)
        return list(ids)

    def presence_by_uid(ids):
        """One presence call per unique numeric user id (ids are shared safely
        across accounts — Roblox doesn't care which account is asking)."""
        by_uid = {}
        for p in fetch_presence(ids):
            uid = p.get("userId")
            if uid is not None:
                by_uid[uid] = presence_to_state(p)
        return by_uid

    if tracked:
        print("[INIT] Fetching initial presence...")
        by_uid = presence_by_uid(unique_user_ids(tracked))
        for (kid, uid), username in tracked.items():
            state = by_uid.get(uid)
            if state is None:
                continue
            previous_state[(kid, uid)] = state
            label = status_label(state["userPresenceType"])
            loc = f" | {state['lastLocation']}" if state["lastLocation"] else ""
            print(f"  [{kid}/{username}] initial: {label}{loc}")
            if state["userPresenceType"] == IN_GAME:
                log_event(kid, "ENTERED_GAME", uid, username,
                          old_status="OFFLINE", new_status="IN_GAME",
                          new_location=state["lastLocation"],
                          new_place_id=state["placeId"])
                active_sessions[(kid, uid)] = open_session(kid, uid, username, state)

    print(f"[MONITOR] Polling every {POLL_INTERVAL}s across all accounts. Ctrl+C to stop.\n")

    last_poll = time.monotonic()

    while True:
        # Sleep in short increments so a manual /api/poll trigger can cut the
        # wait short, without hammering Supabase in a tight busy-loop.
        triggered_for = set()
        while True:
            elapsed = time.monotonic() - last_poll
            remaining = POLL_INTERVAL - elapsed
            if remaining <= 0:
                break
            time.sleep(min(1.0, remaining))
            triggered_for |= consume_poll_triggers()
            if triggered_for:
                break
        last_poll = time.monotonic()
        if triggered_for:
            print(f"[POLL] Manual refresh triggered for: {', '.join(triggered_for)}")

        try:
            # Reconcile tracked-user list across all accounts.
            latest = load_all_tracked_users()
            gone = [k for k in tracked if k not in latest]
            new  = [k for k in latest if k not in tracked]

            for (kid, uid) in gone:
                username = tracked[(kid, uid)]
                print(f"[CONFIG] User removed: {username} ({uid}) from {kid}")
                close_session(active_sessions.pop((kid, uid), None), username, kid)
                previous_state.pop((kid, uid), None)
                del tracked[(kid, uid)]

            if new:
                for (kid, uid) in new:
                    print(f"[CONFIG] New tracked user: {latest[(kid, uid)]} "
                          f"({uid}) on {kid}")
                tracked.update({k: latest[k] for k in new})

                by_uid = presence_by_uid(list({uid for _, uid in new}))
                for (kid, uid) in new:
                    state = by_uid.get(uid)
                    if state is None:
                        continue
                    username = tracked[(kid, uid)]
                    previous_state[(kid, uid)] = state
                    if state["userPresenceType"] == IN_GAME:
                        log_event(kid, "ENTERED_GAME", uid, username,
                                  old_status="OFFLINE", new_status="IN_GAME",
                                  new_location=state["lastLocation"],
                                  new_place_id=state["placeId"])
                        active_sessions[(kid, uid)] = open_session(kid, uid, username, state)

            if not tracked:
                continue

            by_uid = presence_by_uid(unique_user_ids(tracked))
            for (kid, uid), username in tracked.items():
                new_state = by_uid.get(uid)
                if new_state is None:
                    continue
                old_state = previous_state.get((kid, uid))
                if old_state is None:
                    previous_state[(kid, uid)] = new_state
                    continue
                handle_changes(kid, uid, username, old_state, new_state, active_sessions)
                previous_state[(kid, uid)] = new_state

        except requests.RequestException as e:
            print(f"[ERROR] Network: {e}")
        except Exception as e:
            print(f"[ERROR] {e}")


if __name__ == "__main__":
    main()
