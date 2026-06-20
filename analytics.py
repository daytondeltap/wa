"""
analytics.py — Multi-Account Edition (Supabase)
Run this for CLI reports against your Supabase sessions table.

Usage:
    python3 analytics.py                              # all reports, all accounts
    python3 analytics.py --key <raw_access_key>       # one account only
    python3 analytics.py --user 1876419070            # filter to one user ID
    python3 analytics.py --days 7                     # last 7 days only
    python3 analytics.py --key <key> --user 1876419070 --days 7
"""

import os
import hashlib
import argparse
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client


def derive_key_id(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()[:16]

load_dotenv()

# ---------------------------------------------------------------------------
# Supabase client
# ---------------------------------------------------------------------------

def get_sb() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env"
        )
    return create_client(url, key)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def fmt_duration(seconds):
    if seconds is None:
        return "in progress"
    h, rem = divmod(int(seconds), 3600)
    m, s   = divmod(rem, 60)
    if h:
        return f"{h}h {m}m {s}s"
    if m:
        return f"{m}m {s}s"
    return f"{s}s"


def since_ts(days):
    if days is None:
        return None
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def fetch_sessions(sb: Client, key_id=None, user_id=None, since=None,
                   completed_only=True) -> list:
    """Pull all relevant session rows in one call; aggregate in Python."""
    q = sb.table("sessions").select(
        "user_id, username, location_name, duration_seconds, "
        "start_time, end_time"
    )
    if completed_only:
        q = q.not_.is_("end_time", "null")
    if key_id:
        q = q.eq("key_id", key_id)
    if user_id:
        q = q.eq("user_id", user_id)
    if since:
        q = q.gte("start_time", since)
    return q.execute().data or []

# ---------------------------------------------------------------------------
# Report 1 — Most played games
# ---------------------------------------------------------------------------

def report_most_played(rows: list):
    section("Most Played Games (by total time)")
    games: dict = {}
    for r in rows:
        name = r["location_name"] or "Unknown"
        d    = r["duration_seconds"] or 0
        if name not in games:
            games[name] = {"sessions": 0, "total": 0, "max": 0, "sum": 0}
        g = games[name]
        g["sessions"] += 1
        g["total"]    += d
        g["sum"]      += d
        if d > g["max"]:
            g["max"] = d

    if not games:
        print("  No completed sessions found.")
        return

    sorted_games = sorted(games.items(),
                          key=lambda x: x[1]["total"], reverse=True)[:15]

    print(f"  {'Game':<35} {'Sessions':>8} {'Total':>12} {'Avg':>10} {'Longest':>10}")
    print(f"  {'-'*35} {'-'*8} {'-'*12} {'-'*10} {'-'*10}")
    for name, g in sorted_games:
        avg = g["sum"] / g["sessions"] if g["sessions"] else 0
        print(f"  {name:<35} "
              f"{g['sessions']:>8} "
              f"{fmt_duration(g['total']):>12} "
              f"{fmt_duration(avg):>10} "
              f"{fmt_duration(g['max']):>10}")

# ---------------------------------------------------------------------------
# Report 2 — Daily playtime
# ---------------------------------------------------------------------------

def report_daily_playtime(rows: list):
    section("Daily Playtime")
    daily: dict = {}
    for r in rows:
        day = r["start_time"][:10]
        daily[day] = daily.get(day, {"sessions": 0, "total": 0})
        daily[day]["sessions"] += 1
        daily[day]["total"]    += r["duration_seconds"] or 0

    if not daily:
        print("  No data found.")
        return

    print(f"  {'Date':<14} {'Sessions':>8} {'Total Playtime':>16}")
    print(f"  {'-'*14} {'-'*8} {'-'*16}")
    for day, d in sorted(daily.items(), reverse=True)[:30]:
        print(f"  {day:<14} {d['sessions']:>8} {fmt_duration(d['total']):>16}")

# ---------------------------------------------------------------------------
# Report 3 — Activity by hour of day
# ---------------------------------------------------------------------------

def report_activity_by_hour(rows: list):
    section("Activity by Hour of Day (UTC)")
    hourly: dict = {}
    for r in rows:
        h = int(r["start_time"][11:13])
        if h not in hourly:
            hourly[h] = {"sessions": 0, "total": 0}
        hourly[h]["sessions"] += 1
        hourly[h]["total"]    += r["duration_seconds"] or 0

    if not hourly:
        print("  No data found.")
        return

    max_s = max(v["sessions"] for v in hourly.values())
    print(f"  {'Hr':>3}  {'Bar':<30} {'Sessions':>8} {'Total Time':>12}")
    print(f"  {'-'*3}  {'-'*30} {'-'*8} {'-'*12}")
    for h in range(24):
        d        = hourly.get(h, {"sessions": 0, "total": 0})
        bar_len  = int(d["sessions"] / max_s * 28) if d["sessions"] else 0
        bar      = "█" * bar_len
        print(f"  {h:>02}:  {bar:<30} {d['sessions']:>8} "
              f"{fmt_duration(d['total']):>12}")

# ---------------------------------------------------------------------------
# Report 4 — Activity by weekday
# ---------------------------------------------------------------------------

def report_activity_by_weekday(rows: list):
    section("Activity by Weekday")
    by_dow: dict = {}
    for r in rows:
        dt  = datetime.fromisoformat(r["start_time"])
        dow = dt.weekday()  # 0=Monday … 6=Sunday (Python convention)
        if dow not in by_dow:
            by_dow[dow] = {"sessions": 0, "total": 0}
        by_dow[dow]["sessions"] += 1
        by_dow[dow]["total"]    += r["duration_seconds"] or 0

    if not by_dow:
        print("  No data found.")
        return

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday",
                 "Friday", "Saturday", "Sunday"]
    max_s     = max(v["sessions"] for v in by_dow.values())

    print(f"  {'Day':<12} {'Bar':<28} {'Sessions':>8} {'Total Time':>12}")
    print(f"  {'-'*12} {'-'*28} {'-'*8} {'-'*12}")
    for d in range(7):
        v        = by_dow.get(d, {"sessions": 0, "total": 0})
        bar      = "█" * int(v["sessions"] / max_s * 26) if v["sessions"] else ""
        print(f"  {day_names[d]:<12} {bar:<28} {v['sessions']:>8} "
              f"{fmt_duration(v['total']):>12}")

# ---------------------------------------------------------------------------
# Report 5 — Recent sessions
# ---------------------------------------------------------------------------

def report_recent_sessions(sb: Client, key_id=None, user_id=None, since=None, limit=20):
    section(f"Recent Sessions (last {limit})")

    q = sb.table("sessions").select(
        "username, location_name, start_time, end_time, duration_seconds"
    ).order("id", desc=True).limit(limit)

    if key_id:
        q = q.eq("key_id", key_id)
    if user_id:
        q = q.eq("user_id", user_id)
    if since:
        q = q.gte("start_time", since)

    rows = q.execute().data or []

    if not rows:
        print("  No sessions found.")
        return

    print(f"  {'User':<20} {'Game':<30} {'Start (UTC)':<22} {'Duration':>12}")
    print(f"  {'-'*20} {'-'*30} {'-'*22} {'-'*12}")
    for r in rows:
        start = r["start_time"][:19].replace("T", " ")
        print(f"  {(r['username'] or ''):<20} "
              f"{(r['location_name'] or 'Unknown'):<30} "
              f"{start:<22} "
              f"{fmt_duration(r['duration_seconds']):>12}")

# ---------------------------------------------------------------------------
# Report 6 — User comparison
# ---------------------------------------------------------------------------

def report_user_comparison(rows: list):
    users: dict = {}
    for r in rows:
        uid = r["user_id"]
        d   = r["duration_seconds"] or 0
        if uid not in users:
            users[uid] = {"username": r["username"], "sessions": 0,
                          "total": 0, "max": 0}
        users[uid]["sessions"] += 1
        users[uid]["total"]    += d
        if d > users[uid]["max"]:
            users[uid]["max"] = d

    if len(users) < 2:
        return

    section("User Comparison")
    print(f"  {'User':<20} {'Sessions':>8} {'Total':>12} {'Avg Session':>12} {'Longest':>12}")
    print(f"  {'-'*20} {'-'*8} {'-'*12} {'-'*12} {'-'*12}")
    for v in sorted(users.values(), key=lambda x: x["total"], reverse=True):
        avg = v["total"] / v["sessions"] if v["sessions"] else 0
        print(f"  {v['username']:<20} "
              f"{v['sessions']:>8} "
              f"{fmt_duration(v['total']):>12} "
              f"{fmt_duration(avg):>12} "
              f"{fmt_duration(v['max']):>12}")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Roblox presence analytics (Supabase, multi-account)")
    parser.add_argument("--key", type=str, default=None,
                        help="Raw access key to scope to a specific account")
    parser.add_argument("--user", type=int, default=None,
                        help="Filter to a specific user ID")
    parser.add_argument("--days", type=int, default=None,
                        help="Only include data from the last N days")
    args = parser.parse_args()

    sb    = get_sb()
    since = since_ts(args.days)
    uid   = args.user
    kid   = derive_key_id(args.key) if args.key else None

    label_parts = []
    if kid:
        label_parts.append(f"key_id={kid}")
    if uid:
        label_parts.append(f"user_id={uid}")
    if since:
        label_parts.append(f"last {args.days} days")
    filter_label = "  Filters: " + ", ".join(label_parts) if label_parts else "  Filters: none (all accounts)"

    print("\nRoblox Presence Analytics (Supabase)")
    print(filter_label)

    # Fetch completed sessions once; pass to all aggregate reports
    rows = fetch_sessions(sb, key_id=kid, user_id=uid, since=since, completed_only=True)

    report_most_played(rows)
    report_daily_playtime(rows)
    report_activity_by_hour(rows)
    report_activity_by_weekday(rows)
    report_recent_sessions(sb, key_id=kid, user_id=uid, since=since)  # uses its own query for ordering
    report_user_comparison(rows)

    print()


if __name__ == "__main__":
    main()