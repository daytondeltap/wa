# LG Presence Suite

Static GitHub Pages frontend for **RBX Detect**, **MC Detector**, **LG Cards**, and the **LG Exchange**. Production data and authentication are backed by the `LgBackend` Supabase project. Backend source is maintained in `daytondeltap/Lg`.

> **TC is a closed, site-only fictional unit. It has no cash value, cannot be redeemed, and is not a real financial asset. Standard randomized card packs are free.**

## Production architecture

```text
Browser / GitHub Pages
        |
        |-- LG access key (x-site-key)
        |-- OR Supabase Google session (Bearer token)
        |
        +-- auth-ck.js
        |      Google/key login + CK gateway routing
        |
        +-- ck-key-manager.js (DEV key administration)
        |      -> lg-key-admin
        |           -> atomic service-role-only Postgres RPCs
        |
        +-- ck-feature-guard.js
        |      keeps disabled/all-off CK pages out of the active UI
        |
        +-- RBX / Cards / MC / Exchange modules
               -> Supabase Edge Functions

Supabase Edge Functions -> Postgres + scheduled pollers
```

The Pages build starts from `site/index.html` and injects additive compatibility modules in a controlled order. Existing key login remains backward-compatible.

## Authentication

LG supports two login methods that resolve to the same LG key/account.

### Access key

The browser keeps the raw key in `sessionStorage` for the current browser session and sends it as `x-site-key`. Server-side functions hash it with SHA-256 and use the first 16 hex characters as the stable `site_keys.key_id`.

### Google OAuth

A Google account can be linked to an LG key by a DEV user. Supabase Auth validates the Google session, the confirmed normalized email is resolved through `public.site_key_emails`, and the linked LG key supplies the permissions. Google login does not create a second LG permission model or bypass a revoked key.

Production OAuth values:

- Google OAuth client ID: `116418828646-25qo5updqnfpv3g7qb68v7j51pj8osoh.apps.googleusercontent.com`
- Google Authorized JavaScript origin: `https://daytondeltap.github.io`
- Google Authorized redirect URI: `https://jwjxhxvahgrpkvaoyrzw.supabase.co/auth/v1/callback`
- Supabase Auth Site URL: `https://daytondeltap.github.io/wa/`
- Supabase Redirect URL allow-list entry: `https://daytondeltap.github.io/wa/`

The Google client secret belongs only in **Supabase Dashboard → Authentication → Providers → Google** and must never be committed to this repository.

## Feature Pipeline for Tiers

The standard tier pipeline is authoritative in both `lg-api` and `lg-gateway`.

### Basic Version — `BK_`

- RBX Monitor
- Leaderboard
- User Adding
- Cards

Basic does **not** include History, LG Exchange, MC Detector, Join Game, or Key Generator.

### Upgraded — `UPK_`

- RBX Monitor
- Leaderboard
- User Adding
- Cards
- History

Upgraded does **not** include LG Exchange, MC Detector, Join Game, or Key Generator.

### Deluxe — `PK_`

- RBX Monitor / Roblox Detector
- Leaderboard
- User Adding
- Cards
- History
- LG Exchange
- MC Detector
- Join Game
- All normal product features except Key Generator

### Developer — `DEV`

DEV has the full product plus Key Generator / key administration.

### Custom — `CK_`

`CK_` can independently enable or disable:

- Monitor
- Leaderboard
- LG Exchange
- History
- User Adding
- LG Cards
- MC Detector
- Join Game

A CK may have **zero enabled features**, any subset, or all features. The browser presentation is not the security boundary: CK requests pass through server-side authorization and disabled features are rejected even if the UI is bypassed.

The production `site_keys_tier_check` permits `DEV`, `PK_`, `UPK_`, `BK_`, and `CK_`.

## DEV Key Generator and CK manager

`site/ck-key-manager.js` is the hardened DEV administration layer. The DEV manager can:

- generate `BK_`, `UPK_`, `PK_`, or `CK_` keys;
- assign a label;
- link up to five Google email addresses;
- toggle every CK feature independently;
- use **Select all** or **Clear all**;
- edit permissions and linked emails later;
- revoke or reactivate keys;
- prepare older keys for Google login by supplying the original raw key once.

CK controls are explicit button switches. On generate or **Save & Verify**, the frontend compares the server-returned permission map with the selected switch state and does not show success when they differ.

### Atomic key administration

DEV key-management traffic uses the dedicated `lg-key-admin` Edge Function. Key creation and configuration are transactional across `public.site_keys`, `public.site_key_emails`, and `public.site_key_login_secrets`, preventing partially-written key/email states.

### Permission refresh and disabled-page guard

A logged-in CK session periodically refreshes its account permissions. `site/ck-feature-guard.js` redirects away from a newly-disabled feature and renders **No Features Enabled** when a CK has no enabled app features.

## RBX Detect

RBX Detect includes presence, totals, charts, recent sessions/events, leaderboard, retained game history, and key-scoped tracked-user management. Presence states include `OFFLINE`, `WEBSITE`, `IN GAME`, `STUDIO`, and `INVISIBLE`.

### Static two-minute RBX polling

RBX presence is scheduled independently at a static **every-2-minute** cadence (`*/2 * * * *`). The core scheduler may continue running other workloads more frequently; it no longer launches RBX presence polls.

The RBX poller supports up to two authorized Roblox cookies stored server-side. The primary Vault secret is `roblox_cookie`; the optional second secret is `roblox_cookie_2`. When more than one 100-user API chunk is required, work can be distributed across both configured credentials, and either cookie can fail over if the other becomes invalid or rate-limited. This is for reliability/load sharing while respecting Roblox API limits, not for bypassing rate limits.

### Compressed history storage

RBX session/event history uses a hot + archive design:

- the newest **14 days** stay as normal rows for fast writes and recent reads;
- older closed sessions and events are grouped into weekly archive buckets;
- archive rows use compact positional JSON tuples instead of repeating field names;
- timestamps are stored as second offsets from the weekly bucket start;
- PostgreSQL **LZ4** compresses the packed JSONB payloads;
- compatibility views (`player_sessions_all` and `events_all`) reconstruct the original row shape so UI/API behavior is preserved;
- archives retain the existing two-month history window.

The initial migration moved 1,011 older session rows and 2,965 older event rows into compressed archives while preserving the same logical totals: 1,926 visible sessions and 5,597 visible events.

## LG Exchange

The Exchange is a closed paper-market simulation around Roblox player markets. It has no cash value or payout. Compact summary/history reads and frontend GET de-duplication are used to reduce egress.

## LG Cards

LG Cards is the collectible-card system. Standard randomized packs are free. Card profile verification, collections, inventory actions, trades, closed-TC auctions, gifts, and DEV tools remain server-authorized.

## MC Detector

MC Detector tracks configured Java/Bedrock servers, server state/history, available player lists, per-server watchlists, and watched-player events. FULL/SAMPLE/HIDDEN confidence remains explicit so a sampled roster is not treated as a complete roster.

## Frontend modules

| File | Purpose |
|---|---|
| `site/index.html` | Stable base app/login/RBX pages |
| `site/fetch-bootstrap.js` | Captures browser-native `fetch` before routing layers |
| `site/auth-ck.js` | Key + Google login and gateway routing |
| `site/ck-key-manager.js` | Verified DEV key generator/config editor and CK permission switches |
| `site/ck-feature-guard.js` | Redirects away from disabled CK pages and renders the all-off state |
| `site/egress-runtime.js` | GET de-duplication, short caches, and low-egress routing |
| `site/exchange.js` | LG Exchange UI |
| `site/cards.js` | Core Cards UI/API integration |
| `site/mc-detector.js` | MC detector core UI |
| `site/performance-runtime.js` | Adaptive rendering/performance controls |
| `site/performance.css` | Low-cost visual overrides |

## Security notes

- Never put the Supabase service-role/secret key in browser code.
- Never commit Google OAuth client secrets, Roblox cookies, raw LG keys, or wrapped-key plaintext.
- CK authorization remains server-enforced.
- DEV key administration is server-gated through `lg-key-admin` and service-role-only database RPCs.
- The optional second Roblox cookie belongs only in Supabase Vault as `roblox_cookie_2`.
- Key/email/wrapped-secret and archive tables retain RLS and are not directly administered by public browser database calls.

## Deployment and checks

GitHub Pages deploys from `.github/workflows/pages.yml` on changes under `site/` or the Pages workflow. All top-level `site/*.js` files are checked with `node --check`; a separate workflow checks the CK manager contract and disabled-feature guard.

## Project principles

- Preserve existing records and key/client scoping.
- Keep raw-key login backward-compatible.
- Treat Google as identity for an existing key, never a permission bypass.
- Keep CK authorization server-side.
- Keep DEV administration server-side and transactional.
- Keep the Basic/Upgraded/Deluxe feature pipeline synchronized across UI, API, gateway, and documentation.
- Reduce database size using lossless compaction before sacrificing useful retained history.
- Respect upstream API limits; dual credentials are for authorized load sharing and failover.
- Update this README whenever authentication, tiers, key-management, polling, or backend behavior changes.
