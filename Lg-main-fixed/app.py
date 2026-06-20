from flask import Flask, jsonify, render_template, request, session, redirect, url_for
import os
import time
import hmac
import hashlib
import secrets
import json as jsonlib
import requests
from functools import wraps
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

app = Flask(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_URL     = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL   = "gpt-4o-mini"

THUMBNAIL_URL    = "https://thumbnails.roblox.com/v1/users/avatar-headshot"
_avatar_cache    = {}
AVATAR_CACHE_TTL = 12 * 60 * 60

# ── auth config ───────────────────────────────────────────────────────────────
# Two key sources:
#   1. DEV_KEYS env var — developer keys (full access + Key Generator tab).
#      Default: DAYTONDELTAP_PERSONAL,TINTIN_PERSONAL.
#   2. site_keys table — user keys created by devs through the Key Generator.
#      Each key is prefixed PK_, UPK_, or BK_; the prefix dictates the tier.
#
# Tier → permitted tabs (must match the same map in index.html).
TIER_TABS = {
    "DEV":  ["monitor", "leaderboard", "insights", "history", "adduser", "keys"],
    "PK_":  ["monitor", "leaderboard", "insights", "history", "adduser"],
    "UPK_": ["leaderboard", "adduser"],
    "BK_":  ["monitor", "adduser"],
}
VALID_TIERS = ("PK_", "UPK_", "BK_")  # tiers the dev UI can generate

def _derive_key_id(raw_key: str) -> str:
    """Stable 16-char hex identifier for a raw access key."""
    return hashlib.sha256(raw_key.encode()).hexdigest()[:16]

# DEV keys are env-configured because they bootstrap the whole system —
# they must exist before any DB-driven key can be created.
_DEV_RAW = [k.strip() for k in os.getenv(
    "DEV_KEYS", "DAYTONDELTAP_PERSONAL,TINTIN_PERSONAL"
).split(",") if k.strip()]
DEV_KEY_MAP: dict[str, str] = {k: _derive_key_id(k) for k in _DEV_RAW}
for raw, kid in DEV_KEY_MAP.items():
    print(f"[AUTH] DEV key_id for '{raw[:6]}…': {kid}")

_FLASK_SECRET = os.getenv("FLASK_SECRET_KEY", "").strip()
if not _FLASK_SECRET:
    # IMPORTANT: do NOT fall back to a randomly generated key here. Render
    # runs this app with multiple gunicorn workers (separate processes) —
    # if each process picks its own random secret, a session cookie signed
    # by worker A fails to validate on worker B, which looks like random
    # intermittent logouts / "monitoring stops working" from the user's
    # perspective. Generate one with:
    #   python3 -c "import secrets; print(secrets.token_hex(32))"
    # and set it as FLASK_SECRET_KEY in the web service's environment.
    print("[FATAL] FLASK_SECRET_KEY is not set. Sessions would break randomly "
          "across gunicorn workers. Set FLASK_SECRET_KEY in the environment "
          "(see README) and redeploy.")
    raise RuntimeError("FLASK_SECRET_KEY must be set")
app.secret_key = _FLASK_SECRET
app.permanent_session_lifetime = timedelta(days=7)
# Cookie hardening: session cookie should never be readable by JS and should
# not leak over plain HTTP once deployed behind Render's HTTPS termination.
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("FLASK_ENV") != "development",
)

# ── Supabase (service role — server only, never sent to browser) ──────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = (
    os.getenv("SUPABASE_SERVICE_KEY")
    or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set"
    )

_sb: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def sb() -> Client:
    return _sb


# ── helpers ───────────────────────────────────────────────────────────────────

def current_key_id() -> str:
    """Return the key_id stored in session, or empty string."""
    return session.get("key_id", "")


def current_tier() -> str:
    """Return the tier stored in session (DEV/PK_/UPK_/BK_), or empty string."""
    return session.get("tier", "")


def allowed_tabs() -> list:
    return TIER_TABS.get(current_tier(), [])


# Note: earlier versions of this app shipped a Supabase anon/JWT token to the
# browser so client-side JS could query Supabase directly, scoped by RLS
# policies keyed on a custom `key_id` JWT claim. That JWT was never actually
# minted (the code that built it was unused — see git history), so the
# browser silently received a plain anon key with no key_id claim, RLS
# rejected the claim check, and every client-side query returned zero rows.
# That was the root cause of "monitoring/history/leaderboard not working".
#
# Fix: the browser now NEVER talks to Supabase directly. Every read/write
# goes through a Flask /api/... route (see below), which uses the
# service-role client and scopes every query to current_key_id() — taken
# from the signed server-side session, not from anything the client can
# influence. This is simpler and strictly more secure than the JWT/RLS
# approach, and it works the same way regardless of which Supabase API-key
# system the project uses (legacy anon/service_role or the newer
# publishable/secret key model).


def fmt_duration(seconds):
    if seconds is None:
        return None
    h, rem = divmod(int(seconds), 3600)
    m, s   = divmod(rem, 60)
    if h:
        return f"{h}h {m}m"
    if m:
        return f"{m}m {s}s"
    return f"{s}s"


def days_cutoff(days: int | None) -> str | None:
    if days is None:
        return None
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def db_error_response(where: str, error: Exception, status: int = 500):
    print(f"[DB ERROR] {where}: {error}")
    return jsonify({
        "error": f"Database error in {where}",
        "detail": str(error),
        "hint": "Run the latest supabase_setup.sql, then restart Render if this keeps happening.",
    }), status


def check_key(submitted: str):
    """Return (key_id, tier) if valid, else (None, None)."""
    submitted = (submitted or "").strip()
    if not submitted:
        return None, None
    # 1) DEV env-configured keys
    for raw, kid in DEV_KEY_MAP.items():
        if hmac.compare_digest(submitted, raw):
            return kid, "DEV"
    # 2) DB-stored generated keys — must start with a known prefix AND be active
    for prefix in VALID_TIERS:
        if submitted.startswith(prefix):
            kid = _derive_key_id(submitted)
            try:
                res = sb().table("site_keys").select(
                    "key_id, tier, active"
                ).eq("key_id", kid).limit(1).execute()
                if res.data:
                    row = res.data[0]
                    if row.get("active") and row.get("tier") == prefix:
                        return kid, prefix
            except Exception as e:
                print(f"[WARN] site_keys lookup failed: {e}")
            return None, None
    return None, None


# ── permission helpers ───────────────────────────────────────────────────────

def require_tab(tab: str):
    """Decorator: only allow endpoint if caller's tier permits `tab`."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            if tab not in allowed_tabs():
                return jsonify({"error": "Forbidden"}), 403
            return fn(*a, **kw)
        return wrapper
    return deco


def require_dev(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        if current_tier() != "DEV":
            return jsonify({"error": "Forbidden"}), 403
        return fn(*a, **kw)
    return wrapper


# ── auth middleware ───────────────────────────────────────────────────────────

@app.before_request
def require_login():
    if request.endpoint in ("login", "static"):
        return
    if session.get("authenticated") and session.get("key_id"):
        return
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not authenticated"}), 401
    return redirect(url_for("login", next=request.path))


# ── avatar helper ─────────────────────────────────────────────────────────────

def fetch_avatar_urls(user_ids):
    if not user_ids:
        return {}
    resp = requests.get(THUMBNAIL_URL, params={
        "userIds":    ",".join(str(i) for i in user_ids),
        "size":       "420x420",
        "format":     "Png",
        "isCircular": "false",
    }, timeout=10)
    resp.raise_for_status()
    out = {}
    for item in resp.json().get("data", []):
        if item.get("state") == "Completed" and item.get("imageUrl"):
            out[item["targetId"]] = item["imageUrl"]
    return out


# ── API — avatars ─────────────────────────────────────────────────────────────

@app.route("/api/avatars")
def api_avatars():
    raw = request.args.get("user_ids", "")
    try:
        ids = [int(x) for x in raw.split(",") if x.strip()]
    except ValueError:
        return jsonify({"error": "user_ids must be comma-separated integers."}), 400
    if not ids:
        return jsonify({})

    now = time.time()
    result, to_fetch = {}, []
    for uid in ids:
        cached = _avatar_cache.get(uid)
        if cached and (now - cached["ts"]) < AVATAR_CACHE_TTL:
            result[uid] = cached["url"]
        else:
            to_fetch.append(uid)

    if to_fetch:
        try:
            fetched = fetch_avatar_urls(to_fetch)
        except requests.RequestException as e:
            print(f"[WARN] Avatar fetch failed: {e}")
            fetched = {}
        for uid in to_fetch:
            url = fetched.get(uid, "")
            _avatar_cache[uid] = {"url": url, "ts": now}
            result[uid] = url

    return jsonify(result)


# ── API — poll trigger ────────────────────────────────────────────────────────

@app.route("/api/poll", methods=["POST"])
@require_tab("monitor")
def api_poll():
    kid = current_key_id()
    try:
        sb().table("poll_triggers").insert({
            "key_id":       kid,
            "triggered_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── API — leaderboard ─────────────────────────────────────────────────────────

@app.route("/api/leaderboard")
@require_tab("leaderboard")
def api_leaderboard():
    kid = current_key_id()
    try:
        res  = sb().table("leaderboard").select("*").eq("key_id", kid).execute()
        rows = res.data or []
    except Exception:
        rows = []

    for r in rows:
        r["total_fmt"]   = fmt_duration(r.get("total_seconds"))
        r["avg_fmt"]     = fmt_duration(r.get("avg_seconds"))
        r["longest_fmt"] = fmt_duration(r.get("longest_seconds"))
    return jsonify(rows)


@app.route("/api/top_games")
@require_tab("leaderboard")
def api_top_games():
    kid = current_key_id()
    try:
        rows = (
            sb().table("sessions")
            .select("location_name, duration_seconds")
            .eq("key_id", kid)
            .not_.is_("end_time", "null")
            .not_.is_("location_name", "null")
            .execute()
            .data or []
        )
    except Exception as e:
        return db_error_response("top_games", e)

    games: dict[str, dict] = {}
    for row in rows:
        name = row.get("location_name") or "Unknown"
        duration = row.get("duration_seconds") or 0
        if name not in games:
            games[name] = {"location_name": name, "sessions": 0, "total_seconds": 0}
        games[name]["sessions"] += 1
        games[name]["total_seconds"] += duration
    return jsonify(sorted(games.values(), key=lambda g: g["total_seconds"], reverse=True)[:25])


# ── API — account info (frontend reads tier + permitted tabs) ────────────────

@app.route("/api/account")
def api_account():
    return jsonify({
        "key_id": current_key_id(),
        "tier":   current_tier(),
        "tabs":   allowed_tabs(),
    })


# ── API — tracked users (add/list/remove) ─────────────────────────────────────
# All reads/writes go through Flask (service-role client) rather than the
# browser talking to Supabase directly. This guarantees isolation: the
# key_id is taken from the server-side session, never from client input, so
# one account can never read or write another account's tracked_users rows
# regardless of RLS/JWT configuration on the Supabase project.

@app.route("/api/tracked_users")
@require_tab("adduser")
def api_tracked_users_list():
    kid = current_key_id()
    try:
        res = (sb().table("tracked_users")
                 .select("id, name")
                 .eq("key_id", kid)
                 .order("name")
                 .execute())
        return jsonify(res.data or [])
    except Exception as e:
        return db_error_response("tracked_users_list", e)


@app.route("/api/tracked_users", methods=["POST"])
@require_tab("adduser")
def api_tracked_users_add():
    kid  = current_key_id()
    body = request.get_json(silent=True) or {}
    try:
        user_id = int(body.get("id"))
    except (TypeError, ValueError):
        return jsonify({"error": "User ID must be a positive integer."}), 400
    name = (body.get("name") or "").strip()
    if user_id <= 0:
        return jsonify({"error": "User ID must be a positive integer."}), 400
    if not name:
        return jsonify({"error": "Display name is required."}), 400
    if len(name) > 50:
        return jsonify({"error": "Display name too long (max 50)."}), 400

    try:
        existing = (sb().table("tracked_users")
                      .select("id, name")
                      .eq("key_id", kid).eq("id", user_id)
                      .limit(1).execute())
        if existing.data:
            return jsonify({
                "error": f"ID {user_id} already tracked as '{existing.data[0]['name']}'."
            }), 409
        sb().table("tracked_users").insert({
            "key_id": kid, "id": user_id, "name": name,
        }).execute()
        return jsonify({"ok": True, "id": user_id, "name": name})
    except Exception as e:
        return db_error_response("tracked_users_add", e)


@app.route("/api/tracked_users/<int:user_id>", methods=["DELETE"])
@require_tab("adduser")
def api_tracked_users_remove(user_id):
    kid = current_key_id()
    try:
        sb().table("tracked_users").delete().eq("key_id", kid).eq("id", user_id).execute()
        return jsonify({"ok": True})
    except Exception as e:
        return db_error_response("tracked_users_remove", e)


# ── API — monitor (live presence, events, totals, sessions, charts) ──────────
# Everything here is scoped to current_key_id() server-side. Each account
# only ever sees rows it owns.

def _monitor_filters():
    uid  = request.args.get("user_id", type=int)
    days = request.args.get("days", type=int)
    return uid, days


@app.route("/api/monitor/presence")
@require_tab("monitor")
def api_monitor_presence():
    kid = current_key_id()
    uid, _ = _monitor_filters()
    try:
        tq = sb().table("tracked_users").select("id, name").eq("key_id", kid)
        if uid:
            tq = tq.eq("id", uid)
        tracked = tq.execute().data or []
        if not tracked:
            return jsonify({"users": [], "open_sessions": {}, "latest_events": {}})

        ids = [t["id"] for t in tracked]

        open_res = (sb().table("sessions")
                      .select("user_id, username, location_name, start_time, place_id, game_id")
                      .eq("key_id", kid).is_("end_time", "null")
                      .in_("user_id", ids).execute())
        open_map = {r["user_id"]: r for r in (open_res.data or [])}

        ev_res = (sb().table("events")
                    .select("user_id, event_type, new_status, timestamp")
                    .eq("key_id", kid).neq("event_type", "SCRIPT_STARTED")
                    .in_("user_id", ids)
                    .order("id", desc=True).limit(len(ids) * 10)
                    .execute())
        latest_event = {}
        for e in (ev_res.data or []):
            latest_event.setdefault(e["user_id"], e)

        return jsonify({
            "users": tracked,
            "open_sessions": open_map,
            "latest_events": latest_event,
        })
    except Exception as e:
        return db_error_response("monitor_presence", e)


@app.route("/api/monitor/events")
@require_tab("monitor")
def api_monitor_events():
    kid = current_key_id()
    uid, _ = _monitor_filters()
    try:
        q = (sb().table("events")
               .select("timestamp, username, event_type, old_location, new_location, old_status, new_status")
               .eq("key_id", kid)
               .order("id", desc=True).limit(50))
        if uid:
            q = q.eq("user_id", uid)
        return jsonify(q.execute().data or [])
    except Exception as e:
        return db_error_response("monitor_events", e)


@app.route("/api/monitor/totals")
@require_tab("monitor")
def api_monitor_totals():
    kid = current_key_id()
    uid, _ = _monitor_filters()
    try:
        q = (sb().table("sessions")
               .select("user_id, username, duration_seconds")
               .eq("key_id", kid).not_.is_("end_time", "null"))
        if uid:
            q = q.eq("user_id", uid)
        rows = q.execute().data or []
    except Exception as e:
        return db_error_response("monitor_totals", e)

    totals: dict = {}
    for r in rows:
        u = totals.setdefault(r["user_id"], {
            "user_id": r["user_id"], "username": r["username"],
            "sessions": 0, "total_seconds": 0,
        })
        u["sessions"] += 1
        u["total_seconds"] += r.get("duration_seconds") or 0
    return jsonify(sorted(totals.values(), key=lambda x: x["total_seconds"], reverse=True))


@app.route("/api/monitor/top_games")
@require_tab("monitor")
def api_monitor_top_games():
    kid = current_key_id()
    uid, days = _monitor_filters()
    try:
        q = (sb().table("sessions")
               .select("location_name, duration_seconds, start_time, user_id")
               .eq("key_id", kid)
               .not_.is_("end_time", "null").not_.is_("location_name", "null"))
        if uid:
            q = q.eq("user_id", uid)
        if days:
            q = q.gte("start_time", days_cutoff(days))
        rows = q.execute().data or []
    except Exception as e:
        return db_error_response("monitor_top_games", e)

    games: dict = {}
    for r in rows:
        n = r["location_name"]
        g = games.setdefault(n, {"location_name": n, "sessions": 0,
                                  "total_seconds": 0, "max_seconds": 0})
        d = r.get("duration_seconds") or 0
        g["sessions"] += 1
        g["total_seconds"] += d
        if d > g["max_seconds"]:
            g["max_seconds"] = d
    out = sorted(games.values(), key=lambda x: x["total_seconds"], reverse=True)[:15]
    for g in out:
        g["avg_seconds"] = round(g["total_seconds"] / g["sessions"]) if g["sessions"] else 0
    return jsonify(out)


@app.route("/api/monitor/sessions")
@require_tab("monitor")
def api_monitor_sessions():
    kid = current_key_id()
    uid, days = _monitor_filters()
    try:
        q = (sb().table("sessions")
               .select("username, location_name, start_time, end_time, duration_seconds")
               .eq("key_id", kid)
               .order("id", desc=True).limit(20))
        if uid:
            q = q.eq("user_id", uid)
        if days:
            q = q.gte("start_time", days_cutoff(days))
        return jsonify(q.execute().data or [])
    except Exception as e:
        return db_error_response("monitor_sessions", e)


@app.route("/api/monitor/charts")
@require_tab("monitor")
def api_monitor_charts():
    kid = current_key_id()
    uid, days = _monitor_filters()
    try:
        daily_q = (sb().table("sessions").select("start_time, duration_seconds")
                     .eq("key_id", kid).not_.is_("end_time", "null")
                     .gte("start_time", days_cutoff(days or 30)))
        if uid:
            daily_q = daily_q.eq("user_id", uid)
        daily_rows = daily_q.execute().data or []

        hourly_q = sb().table("sessions").select("start_time, duration_seconds").eq("key_id", kid)
        if uid:
            hourly_q = hourly_q.eq("user_id", uid)
        hourly_rows = hourly_q.execute().data or []
    except Exception as e:
        return db_error_response("monitor_charts", e)

    daily: dict = {}
    for r in daily_rows:
        day = r["start_time"][:10]
        daily[day] = daily.get(day, 0) + (r.get("duration_seconds") or 0)

    hourly = {h: 0 for h in range(24)}
    for r in hourly_rows:
        h = int(r["start_time"][11:13])
        hourly[h] += r.get("duration_seconds") or 0

    return jsonify({
        "daily":  [{"day": d, "total_seconds": s} for d, s in sorted(daily.items())],
        "hourly": [{"hour": h, "total_seconds": hourly[h]} for h in range(24)],
    })


# ── API — history (per-account game history + session drill-down) ───────────

@app.route("/api/history/games")
@require_tab("history")
def api_history_games():
    kid = current_key_id()
    uid, days = _monitor_filters()
    try:
        q = (sb().table("sessions")
               .select("user_id, username, location_name, duration_seconds, start_time, end_time")
               .eq("key_id", kid)
               .not_.is_("end_time", "null").not_.is_("location_name", "null"))
        if uid:
            q = q.eq("user_id", uid)
        if days:
            q = q.gte("start_time", days_cutoff(days))
        rows = q.execute().data or []
    except Exception as e:
        return db_error_response("history_games", e)

    games: dict = {}
    by_player: dict = {}
    for r in rows:
        n = r["location_name"]
        d = r.get("duration_seconds") or 0
        g = games.setdefault(n, {
            "location_name": n, "sessions": 0, "total_seconds": 0,
            "max_seconds": 0, "unique_players": set(),
            "first_played": r["start_time"], "last_played": r["start_time"],
        })
        g["sessions"] += 1
        g["total_seconds"] += d
        if d > g["max_seconds"]:
            g["max_seconds"] = d
        g["unique_players"].add(r["user_id"])
        if r["start_time"] < g["first_played"]:
            g["first_played"] = r["start_time"]
        if r["start_time"] > g["last_played"]:
            g["last_played"] = r["start_time"]

        key = (n, r["user_id"])
        p = by_player.setdefault(key, {"username": r["username"], "sessions": 0,
                                        "total_seconds": 0, "last_played": r["start_time"]})
        p["sessions"] += 1
        p["total_seconds"] += d
        if r["start_time"] > p["last_played"]:
            p["last_played"] = r["start_time"]

    out = []
    for n, g in games.items():
        players = sorted(
            [v for (gn, _), v in by_player.items() if gn == n],
            key=lambda x: x["total_seconds"], reverse=True,
        )
        out.append({
            "location_name": n,
            "sessions": g["sessions"],
            "total_seconds": g["total_seconds"],
            "max_seconds": g["max_seconds"],
            "avg_seconds": round(g["total_seconds"] / g["sessions"]) if g["sessions"] else 0,
            "unique_players": len(g["unique_players"]),
            "first_played": g["first_played"],
            "last_played": g["last_played"],
            "players": players,
        })
    out.sort(key=lambda x: x["total_seconds"], reverse=True)
    return jsonify(out)


@app.route("/api/history/sessions")
@require_tab("history")
def api_history_sessions():
    kid  = current_key_id()
    game = request.args.get("game", "")
    uid, days = _monitor_filters()
    if not game:
        return jsonify({"error": "game is required"}), 400
    try:
        q = (sb().table("sessions")
               .select("username, start_time, end_time, duration_seconds")
               .eq("key_id", kid).eq("location_name", game)
               .order("start_time", desc=True).limit(500))
        if uid:
            q = q.eq("user_id", uid)
        if days:
            q = q.gte("start_time", days_cutoff(days))
        return jsonify(q.execute().data or [])
    except Exception as e:
        return db_error_response("history_sessions", e)


# ── API — key generator (DEV only) ────────────────────────────────────────────

def _generate_raw_key(tier: str) -> str:
    """tier is one of PK_/UPK_/BK_. Returns a fresh raw key like 'PK_a1b2…'."""
    return f"{tier}{secrets.token_urlsafe(18)}"


@app.route("/api/keys", methods=["GET"])
@require_dev
def api_keys_list():
    try:
        res = sb().table("site_keys").select(
            "key_id, key_label, tier, active, created_at, created_by"
        ).order("created_at", desc=True).execute()
        rows = [r for r in (res.data or []) if r.get("tier") in VALID_TIERS]
    except Exception as e:
        return jsonify({"error": f"Database setup incomplete: {e}. Re-run the latest supabase_setup.sql, then retry."}), 500
    return jsonify(rows)


@app.route("/api/keys/generate", methods=["POST"])
@require_dev
def api_keys_generate():
    body  = request.get_json(silent=True) or {}
    tier  = (body.get("tier") or "").strip()
    label = (body.get("label") or "").strip() or None
    if tier not in VALID_TIERS:
        return jsonify({"error": "tier must be one of PK_, UPK_, BK_"}), 400

    last_error = None
    # Retry only on the (vanishingly unlikely) chance of a key_id collision.
    for _ in range(5):
        raw = _generate_raw_key(tier)
        kid = _derive_key_id(raw)
        try:
            sb().table("site_keys").insert({
                "key_id":     kid,
                "key_label":  label,
                "tier":       tier,
                "active":     True,
                "created_by": current_key_id(),
            }).execute()
            # Raw key is returned ONCE so the dev can copy it; never stored.
            return jsonify({
                "key_id": kid, "tier": tier, "label": label,
                "raw_key": raw, "active": True,
            })
        except Exception as e:
            last_error = e
            print(f"[WARN] key insert failed, retrying: {e}")
            if "duplicate" not in str(e).lower() and "23505" not in str(e):
                return jsonify({"error": f"Database setup incomplete: {e}. Re-run the latest supabase_setup.sql, then retry."}), 500
    return jsonify({"error": f"Failed to generate a unique key: {last_error}"}), 500


@app.route("/api/keys/<key_id>/revoke", methods=["POST"])
@require_dev
def api_keys_revoke(key_id):
    try:
        sb().table("site_keys").update({"active": False}).eq("key_id", key_id).execute()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/keys/<key_id>/reactivate", methods=["POST"])
@require_dev
def api_keys_reactivate(key_id):
    try:
        sb().table("site_keys").update({"active": True}).eq("key_id", key_id).execute()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── AI insights ───────────────────────────────────────────────────────────────

def build_data_summary(days: int = 30) -> dict:
    kid    = current_key_id()
    cutoff = days_cutoff(days)

    try:
        all_sessions = (
            sb().table("sessions")
            .select("user_id, username, duration_seconds, location_name, start_time")
            .eq("key_id", kid)
            .not_.is_("end_time", "null")
            .gte("start_time", cutoff)
            .execute()
            .data or []
        )
    except Exception as e:
        raise RuntimeError(f"Database read failed while building insights: {e}") from e

    user_map:   dict = {}
    game_map:   dict = {}
    daily_map:  dict = {}
    hourly_map: dict = {}

    for r in all_sessions:
        uid  = r["user_id"]
        d    = r["duration_seconds"] or 0
        day  = r["start_time"][:10]
        h    = int(r["start_time"][11:13])
        name = r["location_name"] or "Unknown"

        if uid not in user_map:
            user_map[uid] = {"user_id": uid, "username": r["username"],
                             "sessions": 0, "total_seconds": 0, "sum": 0}
        user_map[uid]["sessions"]      += 1
        user_map[uid]["total_seconds"] += d
        user_map[uid]["sum"]           += d

        if name not in game_map:
            game_map[name] = {"location_name": name, "sessions": 0, "total_seconds": 0}
        game_map[name]["sessions"]      += 1
        game_map[name]["total_seconds"] += d

        daily_map[day] = daily_map.get(day, 0) + d
        hourly_map[h]  = hourly_map.get(h, 0) + d

    user_totals = sorted(
        [{"user_id": v["user_id"], "username": v["username"],
          "sessions": v["sessions"], "total_seconds": v["total_seconds"],
          "avg_seconds": v["sum"] / v["sessions"] if v["sessions"] else 0}
         for v in user_map.values()],
        key=lambda x: x["total_seconds"], reverse=True
    )
    top_games = sorted(game_map.values(),
                       key=lambda x: x["total_seconds"], reverse=True)[:10]
    daily  = [{"day": d, "total_seconds": s} for d, s in sorted(daily_map.items())]
    hourly = [{"hour": h, "total_seconds": hourly_map.get(h, 0)} for h in range(24)]

    return {
        "window_days":     days,
        "user_totals":     user_totals,
        "top_games":       top_games,
        "daily_playtime":  daily,
        "hourly_activity": hourly,
    }


def call_openai(messages, max_tokens=600):
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("paste-"):
        raise RuntimeError(
            "OPENAI_API_KEY is not configured. Add a valid key to your .env file."
        )
    resp = requests.post(
        OPENAI_URL,
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}",
                 "Content-Type":  "application/json"},
        json={"model": OPENAI_MODEL, "messages": messages,
              "max_tokens": max_tokens, "temperature": 0.4},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


SYSTEM_PROMPT = (
    "You are a data analyst for a Roblox presence-tracking dashboard. "
    "You're given aggregated session statistics (playtime per user, top games, "
    "daily and hourly activity patterns) as JSON. Give concise, specific "
    "insights grounded only in the numbers provided — never invent figures. "
    "Use plain text, short paragraphs or a few dashes for lists, no markdown "
    "headers. Keep responses focused and under 200 words unless the user asks "
    "for more detail."
)


@app.route("/api/ai_insights")
@require_tab("insights")
def api_ai_insights():
    days    = request.args.get("days", 30, type=int)
    try:
        summary = build_data_summary(days=days)
    except RuntimeError as e:
        return db_error_response("ai_insights", e)

    if not summary["user_totals"]:
        return jsonify({"insight": "Not enough session data yet to generate insights."})

    try:
        content = call_openai([
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content":
                "Here is the aggregated tracking data as JSON:\n\n"
                f"{jsonlib.dumps(summary)}\n\n"
                "Summarize the most interesting patterns: who plays the most, "
                "which games dominate, and when activity peaks. "
                "3-5 short observations."},
        ])
        return jsonify({"insight": content})
    except requests.RequestException as e:
        return jsonify({"error": f"OpenAI request failed: {e}"}), 502
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/ai_ask", methods=["POST"])
@require_tab("insights")
def api_ai_ask():
    body     = request.get_json(silent=True) or {}
    question = (body.get("question") or "").strip()
    days     = body.get("days", 30)

    if not question:
        return jsonify({"error": "No question provided."}), 400
    if len(question) > 500:
        return jsonify({"error": "Question is too long (max 500 characters)."}), 400

    try:
        summary = build_data_summary(days=days)
    except RuntimeError as e:
        return db_error_response("ai_ask", e)

    try:
        content = call_openai([
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content":
                "Aggregated tracking data as JSON:\n\n"
                f"{jsonlib.dumps(summary)}\n\n"
                f"Question: {question}"},
        ])
        return jsonify({"answer": content})
    except requests.RequestException as e:
        return jsonify({"error": f"OpenAI request failed: {e}"}), 502
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


# ── auth pages ────────────────────────────────────────────────────────────────

@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        key_id, tier = check_key(request.form.get("key"))
        if key_id:
            session.clear()
            session["authenticated"] = True
            session["key_id"]        = key_id
            session["tier"]          = tier
            session.permanent        = True
            dest = request.form.get("next") or url_for("index")
            return redirect(dest)
        error = "Invalid access key."
    return render_template("login.html", error=error,
                           next=request.args.get("next", ""))


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


# ── main page ─────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    # The browser never talks to Supabase directly anymore — every read/write
    # goes through a Flask /api/... route, scoped server-side to
    # current_key_id(). No Supabase URL/key needs to reach the client at all.
    return render_template(
        "index.html",
        key_id=current_key_id(),
        tier=current_tier(),
        allowed_tabs=jsonlib.dumps(allowed_tabs()),
    )



if __name__ == "__main__":
    app.run(debug=True, port=5000)

