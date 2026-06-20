# Roblox Presence Dashboard

A multi-account Roblox presence tracker: a background worker polls Roblox for
"online/in-game" status on whichever users each account is tracking, and a
Flask web dashboard shows monitoring, leaderboard, history, and AI insights
— all scoped per account, never shared between accounts.

## Architecture

```
┌─────────────────┐        ┌──────────────────┐        ┌────────────────┐
│  Detect.py       │ writes │  Supabase         │  reads │  app.py (Flask) │
│  background      │──────▶│  (service_role     │◀──────│  web dashboard   │
│  worker           │        │  key only)         │        │  + Key Generator │
└─────────────────┘        └──────────────────┘        └────────────────┘
                                                                  ▲
                                                                  │ session cookie
                                                                  │ (key_id, tier)
                                                            ┌──────────┐
                                                            │  Browser  │
                                                            └──────────┘
```

**The browser never talks to Supabase directly.** Every read or write the
dashboard needs goes through a Flask `/api/...` route. Flask holds the
Supabase **service_role** key (server-only) and scopes every query by the
account's `key_id`, which it reads from the signed Flask session cookie —
never from anything the browser sends. This is what guarantees one account
can never see another account's tracked users, sessions, events, or history.

`Detect.py` is a single worker process that polls presence for **every**
tracked user across **every** account in one pass (one HTTP call per 100
unique Roblox user IDs, regardless of how many accounts are tracking them),
then logs events and opens/closes sessions scoped to the correct
`(key_id, user_id)` pair. There's no per-account worker and no `KEY_ID` env
var to configure — accounts are looked up live from the `tracked_users`
table.

## Accounts & access tiers

Two ways an "account" (really: an access key) comes to exist:

1. **`DEV_KEYS`** — a comma-separated env var on the web service. These are
   full-access developer keys; each one bootstraps its own account and can
   see the **Key Generator** tab to mint more keys for other people.
2. **Generated keys** — created from the Key Generator tab by a DEV key
   holder, stored in the `site_keys` table, and prefixed by tier:

   | Prefix | Tabs available |
   |---|---|
   | `PK_`  | monitor, leaderboard, insights, history, adduser |
   | `UPK_` | leaderboard, adduser |
   | `BK_`  | monitor, adduser |
   | (DEV)  | all of the above + keys |

Every key — dev or generated — maps to a stable 16-hex-char `key_id`
(`sha256(raw_key)[:16]`). That `key_id` is the partition boundary for every
table: `tracked_users`, `sessions`, `events`, and the `leaderboard` view are
all filtered by it on every query.

## Data flow per feature

- **Add User** — client picks a Roblox user to track. Goes through
  `POST /api/tracked_users`, written with the caller's `key_id`. Detect.py
  picks it up on its next poll (within `POLL_INTERVAL` seconds, or instantly
  if you hit the manual refresh button, which inserts a `poll_triggers` row
  Detect.py is waiting on).
- **Monitoring** — `Detect.py` polls Roblox presence, writes `events` and
  `sessions` rows tagged with `key_id`. The dashboard's Monitor tab reads
  them back through `/api/monitor/*`, which always filters by the logged-in
  account's `key_id`. Two different accounts tracking the same Roblox user
  get fully independent session/event history.
- **Leaderboard** — backed by a Postgres view (`leaderboard`) aggregating
  `sessions`, read through `/api/leaderboard` — scoped by `key_id` the same
  way.
- **History** — per-account game/session history via `/api/history/*`.
  Never aggregated across accounts.
- **Key Generator** — DEV-tier only. `/api/keys/*` routes, backed by the
  `site_keys` table, using the service-role client (RLS doesn't apply to it,
  so generation/revocation always works regardless of anon policies).

## Database security model

`supabase_setup.sql` enables RLS on every table and intentionally creates
**no anon-facing policies** — the anon key (if it ever leaked) cannot read or
write a single row anywhere. `service_role` always bypasses RLS, so Flask
and Detect.py work normally. This is simpler and more robust than the
previous design, which tried to scope anon access via a custom `key_id`
claim on a Supabase-signed JWT that was never actually being minted — every
anon query silently returned zero rows, which was the root cause of
"monitoring / history / leaderboard show nothing."

Run the latest `supabase_setup.sql` in the Supabase SQL editor whenever you
pull updates — it's idempotent (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`, policy drops before re-creates) and safe to
re-run against an existing database.

## Environment variables

### Web service (`app.py`)

| Var | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | yes | service_role key. `SUPABASE_SERVICE_ROLE_KEY` also accepted. **Never** expose this to the browser. |
| `DEV_KEYS` | yes | comma-separated raw developer keys, e.g. `MYNAME_PERSONAL,OTHER_PERSONAL` |
| `FLASK_SECRET_KEY` | yes | random 32+ char string. **Must** be set explicitly — with `gunicorn --workers 2`, an unset secret means each worker process gets a different random key, causing sessions signed by one worker to fail validation on another (random, intermittent logouts). Generate with `python3 -c "import secrets; print(secrets.token_hex(32))"`. |
| `OPENAI_API_KEY` | no | only needed for the AI Insights tab |

### Background worker (`Detect.py`)

| Var | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | same project as the web service |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | `SUPABASE_SERVICE_KEY` also accepted |
| `ROBLOX_COOKIE` | strongly recommended | raw `.ROBLOSECURITY` value (no `_\|WARNING:-DO-NOT-SHARE...` prefix wrapper, just the cookie value). Without it, Roblox's presence API only returns accurate data for users whose presence privacy is set to "Everyone" — most accounts will show as OFFLINE regardless of their real status. |
| `POLL_INTERVAL` | no | seconds between polls, default `10` |

## Deploying

1. Run `supabase_setup.sql` in your Supabase project's SQL editor.
2. Deploy both services from `render.yaml` (Render Blueprint, or create the
   web service + background worker manually with the start commands shown
   there).
3. Set the env vars above in each service's dashboard.
4. Log in at `/login` with one of your `DEV_KEYS` values.
5. Add a tracked Roblox user from the Add User tab — Detect.py will pick it
   up on its next poll and presence should appear in Monitor within one
   `POLL_INTERVAL`.

## Troubleshooting

- **Monitor/History/Leaderboard show nothing** — almost always means either
  (a) `supabase_setup.sql` hasn't been (re-)run against this database, or
  (b) `Detect.py` isn't running / can't reach Supabase. Check the worker's
  logs on Render for `[FATAL]` or `[ERROR]` lines.
- **Tracked users show OFFLINE even when actually playing** — set
  `ROBLOX_COOKIE` on the worker. Check the worker logs for the
  `[AUTH] ROBLOX_COOKIE valid — authenticated as ...` line on startup; if you
  instead see `[ERROR] ROBLOX_COOKIE is invalid or expired`, regenerate the
  cookie from a logged-in Roblox browser session.
- **Randomly logged out** — make sure `FLASK_SECRET_KEY` is set (see above).
- **Key Generator fails** — re-run `supabase_setup.sql`; the `site_keys`
  table must exist with the `key_id, key_label, tier, active, created_at,
  created_by` columns.
