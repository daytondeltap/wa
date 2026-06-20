-- ══════════════════════════════════════════════════════════════════════════════
-- RBX/MONITOR — Supabase Schema Setup (Multi-Account Edition)
-- Run this entire file in the Supabase SQL Editor (one paste, one click Run)
-- ══════════════════════════════════════════════════════════════════════════════


-- ── site_keys — one row per access key; key_id is a short stable hash ─────────
-- key_hash = SHA-256(raw key) stored in hex so the plaintext never hits the DB.
-- key_label is a human-readable name you assign in Render env vars (optional).
CREATE TABLE IF NOT EXISTS public.site_keys (
    key_id     TEXT PRIMARY KEY,   -- first 16 hex chars of SHA-256(raw key)
    key_label  TEXT,
    tier       TEXT NOT NULL DEFAULT 'PK_',   -- one of 'PK_', 'UPK_', 'BK_' (DEV keys live in env, not here)
    active     BOOLEAN NOT NULL DEFAULT TRUE, -- soft-disable; revoked keys keep their data
    created_by TEXT,                          -- key_id of the dev that generated this key
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT ALL ON public.site_keys TO service_role;

-- If the table was just created/changed, force the API schema cache to see it
-- before the app tries to generate/list keys.
NOTIFY pgrst, 'reload schema';

-- Migration for older DBs that already have site_keys without the new columns:
ALTER TABLE public.site_keys ADD COLUMN IF NOT EXISTS key_id     TEXT;
ALTER TABLE public.site_keys ADD COLUMN IF NOT EXISTS key_label  TEXT;
ALTER TABLE public.site_keys ADD COLUMN IF NOT EXISTS tier       TEXT NOT NULL DEFAULT 'PK_';
ALTER TABLE public.site_keys ADD COLUMN IF NOT EXISTS active     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.site_keys ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.site_keys ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
NOTIFY pgrst, 'reload schema';

-- ── events ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
    id              BIGSERIAL PRIMARY KEY,
    key_id          TEXT        NOT NULL DEFAULT 'default',
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id         BIGINT      NOT NULL,
    username        TEXT        NOT NULL,
    event_type      TEXT        NOT NULL,
    old_status      TEXT,
    new_status      TEXT,
    old_location    TEXT,
    new_location    TEXT,
    old_place_id    BIGINT,
    new_place_id    BIGINT
);

-- No anon grant: the browser never queries Supabase directly anymore (see
-- RLS section below) — only the Flask service-role client touches this table.
REVOKE ALL ON public.events FROM anon;
GRANT ALL ON public.events TO service_role;

-- Migration for older DBs: CREATE TABLE IF NOT EXISTS does not add missing columns.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS key_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS user_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS old_status TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS new_status TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS old_location TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS new_location TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS old_place_id BIGINT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS new_place_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_events_key_id  ON public.events (key_id);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON public.events (user_id);
CREATE INDEX IF NOT EXISTS idx_events_type    ON public.events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_ts      ON public.events (timestamp DESC);


-- ── sessions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
    id               BIGSERIAL PRIMARY KEY,
    key_id           TEXT   NOT NULL DEFAULT 'default',
    user_id          BIGINT NOT NULL,
    username         TEXT   NOT NULL,
    place_id         BIGINT,
    root_place_id    BIGINT,
    universe_id      BIGINT,
    game_id          TEXT,
    location_name    TEXT,
    start_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time         TIMESTAMPTZ,
    duration_seconds INTEGER
);

-- No anon grant: same reasoning as events above.
REVOKE ALL ON public.sessions FROM anon;
GRANT ALL ON public.sessions TO service_role;

-- Migration for older DBs: add key_id before indexes/views/policies reference it.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS key_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS place_id BIGINT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS root_place_id BIGINT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS universe_id BIGINT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS game_id TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS location_name TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

CREATE INDEX IF NOT EXISTS idx_sessions_key_id     ON public.sessions (key_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON public.sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON public.sessions (start_time DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_location   ON public.sessions (location_name);
CREATE INDEX IF NOT EXISTS idx_sessions_open       ON public.sessions (end_time) WHERE end_time IS NULL;


-- ── tracked_users ─────────────────────────────────────────────────────────────
-- Primary key is (key_id, id) so different accounts can track the same Roblox user.
CREATE TABLE IF NOT EXISTS public.tracked_users (
    key_id   TEXT   NOT NULL DEFAULT 'default',
    id       BIGINT NOT NULL,
    name     TEXT   NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (key_id, id)
);

-- No anon grant: Add User / Remove User now go through Flask's
-- /api/tracked_users routes (service role), not direct browser writes.
REVOKE ALL ON public.tracked_users FROM anon;
GRANT ALL ON public.tracked_users TO service_role;

-- Migration for older DBs: add key_id before indexes/policies reference it.
ALTER TABLE public.tracked_users ADD COLUMN IF NOT EXISTS key_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.tracked_users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE public.tracked_users ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tracked_key ON public.tracked_users (key_id);


-- ── poll_triggers ─────────────────────────────────────────────────────────────
-- key_id lets each account's web service signal only its own Detect worker.
CREATE TABLE IF NOT EXISTS public.poll_triggers (
    id           BIGSERIAL PRIMARY KEY,
    key_id       TEXT        NOT NULL DEFAULT 'default',
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT ALL ON public.poll_triggers TO service_role;

-- Migration for older DBs: add key_id before indexes reference it.
ALTER TABLE public.poll_triggers ADD COLUMN IF NOT EXISTS key_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.poll_triggers ADD COLUMN IF NOT EXISTS triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_poll_key ON public.poll_triggers (key_id);


-- ── leaderboard view ──────────────────────────────────────────────────────────
-- Includes key_id so Flask can filter with: WHERE key_id = ?
DROP VIEW IF EXISTS public.leaderboard;
CREATE VIEW public.leaderboard AS
SELECT
    key_id,
    user_id,
    username,
    COUNT(*)                              AS sessions,
    SUM(duration_seconds)                 AS total_seconds,
    AVG(duration_seconds)::INTEGER        AS avg_seconds,
    MAX(duration_seconds)                 AS longest_seconds,
    MAX(start_time)                       AS last_seen
FROM public.sessions
WHERE end_time IS NOT NULL
GROUP BY key_id, user_id, username
ORDER BY total_seconds DESC NULLS LAST;


-- ══════════════════════════════════════════════════════════════════════════════
-- Row Level Security  —  default-deny for anon, full access for service_role
--
-- IMPORTANT: this app does NOT use Supabase Auth and the browser never holds
-- a Supabase API key at all anymore. Every read/write the dashboard needs
-- goes through a Flask /api/... route, which uses the service_role key
-- (server-side only) and scopes every query to the account's key_id taken
-- from the signed Flask session cookie. service_role bypasses RLS entirely,
-- so the policies below exist purely as defense-in-depth: even if the anon
-- key were ever leaked or reused by mistake, RLS + the REVOKEs above mean it
-- cannot read or write a single row in any of these tables.
--
-- (An earlier version of this schema tried to scope anon access per-account
-- via a custom `key_id` claim on a Supabase-signed JWT. That JWT was never
-- actually minted by the Flask app, so the claim was always empty and every
-- anon-side query silently returned zero rows — this was the root cause of
-- "monitoring / history / leaderboard show nothing". Routing everything
-- through Flask removes that whole failure mode.)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_keys     ENABLE ROW LEVEL SECURITY;

-- Drop any older policies from previous versions of this file — none of
-- these tables should have anon-facing policies anymore.
DROP POLICY IF EXISTS "anon_read_tracked"     ON public.tracked_users;
DROP POLICY IF EXISTS "anon_insert_tracked"   ON public.tracked_users;
DROP POLICY IF EXISTS "anon_delete_tracked"   ON public.tracked_users;
DROP POLICY IF EXISTS "anon_read_sessions"    ON public.sessions;
DROP POLICY IF EXISTS "anon_read_events"      ON public.events;
DROP POLICY IF EXISTS "scoped_read_tracked"   ON public.tracked_users;
DROP POLICY IF EXISTS "scoped_insert_tracked" ON public.tracked_users;
DROP POLICY IF EXISTS "scoped_delete_tracked" ON public.tracked_users;
DROP POLICY IF EXISTS "scoped_read_sessions"  ON public.sessions;
DROP POLICY IF EXISTS "scoped_read_events"    ON public.events;

-- No CREATE POLICY statements for anon on any table → RLS + no policy means
-- anon (and any other non-service_role role) is denied by default on every
-- table. service_role always bypasses RLS, so Flask and Detect.py are
-- unaffected.



-- ══════════════════════════════════════════════════════════════════════════════
-- Migration helpers: add key_id to existing tables if you're upgrading
-- (safe to run even on a fresh DB — IF NOT EXISTS handles it)
-- ══════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='events' AND column_name='key_id') THEN
        ALTER TABLE public.events ADD COLUMN key_id TEXT NOT NULL DEFAULT 'default';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='sessions' AND column_name='key_id') THEN
        ALTER TABLE public.sessions ADD COLUMN key_id TEXT NOT NULL DEFAULT 'default';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='tracked_users' AND column_name='key_id') THEN
        -- Existing single-PK table needs restructuring; add column first
        ALTER TABLE public.tracked_users ADD COLUMN IF NOT EXISTS key_id TEXT NOT NULL DEFAULT 'default';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='poll_triggers' AND column_name='key_id') THEN
        ALTER TABLE public.poll_triggers ADD COLUMN key_id TEXT NOT NULL DEFAULT 'default';
    END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- Seed example: replace KEY_ID_HERE with the actual key_id values printed
-- by app.py on first start (check logs: "[AUTH] key_id for <label>: <id>")
-- ══════════════════════════════════════════════════════════════════════════════

-- Example (comment out if not needed):
-- INSERT INTO tracked_users (key_id, id, name) VALUES
--     ('KEY_ID_HERE', 4147177098, 'Pruk'),
--     ('KEY_ID_HERE', 1876419070, 'daytondeltap')
-- ON CONFLICT (key_id, id) DO NOTHING;

-- Force PostgREST/Supabase API to refresh its schema cache after table changes.
NOTIFY pgrst, 'reload schema';
