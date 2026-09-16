# LG Presence Suite

Static GitHub Pages frontend for **RBX Detect**, **MC Detector**, **LG Cards**, and the **LG Exchange**. Production data and authentication are backed by the `LgBackend` Supabase project. Backend source is maintained in `daytondeltap/Lg`.

> **TC is a closed, site-only fictional unit. It has no cash value, cannot be redeemed, and is not a real financial asset. Standard randomized card packs are free.**

## Production architecture

```text
Browser / GitHub Pages
        |
        |-- standard DEV/PK_/UPK_/BK_ raw key
        |      -> lg-api directly for login + normal legacy requests
        |
        |-- CK_ raw key or Google session
        |      -> lg-gateway for identity/permission translation
        |
        +-- auth-ck.js
        |      Google/key login + gateway routing
        |
        +-- login-resilience.js
        |      bounded login/page hydration + safe recovery
        |
        +-- ck-key-manager.js + key-delete-runtime.js
        |      -> lg-key-admin
        |           -> atomic/service-role key administration
        |
        +-- ck-feature-guard.js
        |      keeps disabled/all-off CK pages out of the active UI
        |
        +-- RBX / Cards / MC / Exchange modules
               -> Supabase Edge Functions

Supabase Edge Functions -> Postgres + scheduled pollers
```

The Pages build starts from `site/index.html` and injects additive compatibility modules in a controlled order. Existing raw-key login remains backward-compatible.

## Authentication

LG supports raw access-key login plus Google OAuth linked to an existing LG key.

### Access key

The browser keeps the raw key in `sessionStorage` for the current browser session and sends it as `x-site-key`. Server-side functions hash it with SHA-256 and use the first 16 hex characters as the stable `site_keys.key_id`.

Standard legacy tiers (`DEV`, `PK_`, `UPK_`, `BK_`) authenticate directly against `lg-api`, including the initial `/auth` request before an `account` object exists. This avoids a circular dependency where login itself previously had to pass through `lg-gateway` before the frontend knew the key tier. After successful raw-key auth, the frontend normalizes the standard tier tabs/features to the authoritative tier matrix.

`site/login-resilience.js` keeps successful authentication separate from secondary page hydration. Tracked-user loading is bounded, first-page loading is bounded, and a temporary Monitor/History request failure can no longer make a valid key look rejected or leave the login screen hanging indefinitely.

`site/standard-key-login.js` is the authoritative login owner for standard raw-key tiers. It installs synchronously, intercepts standard-key form submissions in the capture phase, stops the older `auth-ck.js` submit path from also running, authenticates directly against `lg-api`, and commits authenticated UI/session state before any secondary data hydration. Saved standard-key bootstrap also clears the legacy bootstrap inputs before `auth-ck.js`'s scheduled fallback can enter its older hydration-blocking path.

### Google OAuth

A Google account can be linked to an LG key by a DEV user. Supabase Auth validates the Google session, the confirmed normalized email is resolved through `public.site_key_emails`, and the linked LG key supplies the permissions. Google login does not create a second LG permission model or bypass a revoked key.

Google and CK requests continue through `lg-gateway` because they need server-side identity translation and/or custom permission enforcement.

Production OAuth values:

- Google OAuth client ID: `116418828646-25qo5updqnfpv3g7qb68v7j51pj8osoh.apps.googleusercontent.com`
- Google Authorized JavaScript origin: `https://daytondeltap.github.io`
- Google Authorized redirect URI: `https://jwjxhxvahgrpkvaoyrzw.supabase.co/auth/v1/callback`
- Supabase Auth Site URL: `https://daytondeltap.github.io/wa/`
- Supabase Redirect URL allow-list entry: `https://daytondeltap.github.io/wa/`

The Google client secret belongs only in **Supabase Dashboard → Authentication → Providers → Google** and must never be committed to this repository.

## Feature Pipeline for Tiers

The standard tier pipeline is authoritative across frontend normalization, `lg-api`, `lg-gateway`, and feature-specific backend functions.

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
- **permanently delete non-DEV keys** with explicit confirmation;
- prepare older keys for Google login by supplying the original raw key once.

CK controls are explicit button switches. On generate or **Save & Verify**, the frontend compares the server-returned permission map with the selected switch state and does not show success when they differ.

Permanent Delete is intentionally separate from Revoke. `site/key-delete-runtime.js` accepts both supported delete route shapes, verifies the server response, and gives an explicit deployment-version error instead of a generic 404 when the backend is stale. DEV keys themselves are protected from permanent deletion.

### Atomic key administration

DEV key-management traffic uses the dedicated `lg-key-admin` Edge Function. Key creation and configuration are transactional across `public.site_keys`, `public.site_key_emails`, and `public.site_key_login_secrets`, preventing partially-written key/email states. Permanent deletion prefers the atomic delete RPC when available; the current Edge Function also contains a compatibility path for an older production migration state and restores removed login links if the final key-row deletion is blocked.

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
| `site/login-resilience.js` | Login/page timeouts, hydration isolation, saved-key recovery |
| `site/standard-key-login.js` | Authoritative synchronous direct login for standard raw-key tiers; blocks legacy double-submit/bootstrap races |
| `site/egress-runtime.js` | Pre-auth legacy direct routing, tier normalization, GET de-duplication, short caches |
| `site/ck-key-manager.js` | Verified DEV key generator/config editor and CK permission switches |
| `site/key-delete-runtime.js` | Confirmed permanent non-DEV key deletion UI |
| `site/ck-feature-guard.js` | Redirects away from disabled CK pages and renders the all-off state |
| `site/exchange.js` | LG Exchange UI |
| `site/cards.js` | Core Cards UI/API integration |
| `site/mc-detector.js` | MC detector core UI |
| `site/performance-runtime.js` | Adaptive rendering/performance controls |
| `site/performance.css` | Low-cost visual overrides |

## Security notes

- Never put the Supabase service-role/secret key in browser code.
- Never commit Google OAuth client secrets, Roblox cookies, raw LG keys, or wrapped-key plaintext.
- CK authorization remains server-enforced.
- DEV key administration is server-gated through `lg-key-admin` and service-role-only database operations.
- The optional second Roblox cookie belongs only in Supabase Vault as `roblox_cookie_2`.
- Key/email/wrapped-secret and archive tables retain RLS and are not directly administered by public browser database calls.
- Permanent deletion never permits a DEV target key.

## Deployment and checks

GitHub Pages deploys from `.github/workflows/pages.yml` on changes under `site/` or the Pages workflow. All top-level `site/*.js` files are checked with `node --check`. Frontend CI also locks the canonical UPK/BK feature matrix, pre-auth direct-routing markers, hydration timeouts, standard-key synchronous/capture ownership, CK manager contract, and delete UI contract.

The backend repository contains `.github/workflows/deploy-supabase-core.yml` for `lg-api`, `lg-gateway`, and `lg-key-admin`. It uses the Supabase CLI with API-based Edge Function deployment and requires the private repository secret `SUPABASE_ACCESS_TOKEN`; no Supabase credential belongs in source.

## Change log

### 2026-09-16 — Standard/UPK login race fix

- Confirmed production contains active UPK keys, so the remaining failure was frontend login control flow rather than missing tier data.
- `standard-key-login.js` now installs synchronously at the end of the page, before `auth-ck.js`'s already-scheduled legacy bootstrap can execute.
- Standard-key form submits are owned in the capture phase with `stopImmediatePropagation()`, preventing both the new direct handler and the older blocking handler from running for one click.
- Saved `DEV`/`PK_`/`UPK_`/`BK_` sessions neutralize the old bootstrap inputs and restore the saved key only after direct `lg-api /auth` succeeds.
- Direct auth has a hard 6.5-second timeout, restores the login control on failure, and never waits for tracked-user/page hydration before treating the user as signed in.
- GitHub Pages cache-bust version advanced to `standard-key-login.js?v=20260916-2`, with CI checks added for the race guards.

## Project principles

- Preserve existing records and key/client scoping.
- Keep raw-key login backward-compatible and independent of the gateway for standard tiers.
- Treat Google as identity for an existing key, never a permission bypass.
- Keep CK authorization server-side.
- Keep DEV administration server-side and transactional/rollback-safe.
- Keep the Basic/Upgraded/Deluxe feature pipeline synchronized across UI, API, gateway, feature endpoints, CI, and documentation.
- Reduce database size using lossless compaction before sacrificing useful retained history.
- Respect upstream API limits; dual credentials are for authorized load sharing and failover.
- Update this README whenever authentication, tiers, key-management, polling, or backend behavior changes.