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
        |      Google/key login + normal CK gateway routing
        |
        +-- ck-key-manager.js (DEV key administration)
        |      -> lg-key-admin
        |           -> atomic service-role-only Postgres RPCs
        |
        +-- ck-feature-guard.js
        |      keeps disabled/all-off CK pages out of the active UI
        |
        +-- established non-CK raw-key reads
        |      -> original LG Edge Functions directly where safe
        |
        +-- Exchange summary/history reads
               -> lg-exchange-summary

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

## Access-key tiers

- `BK_` — Basic access
- `UPK_` — Upgraded access
- `PK_` — Full standard access
- `DEV` — developer/admin access
- `CK_` — configurable feature access

`CK_` can independently enable or disable:

- Monitor
- Leaderboard
- LG Exchange
- History
- User Adding
- LG Cards
- MC Detector
- Join Game

A CK is allowed to have **zero enabled features**, any subset, or all features. The browser presentation is not the security boundary: normal CK requests still pass through `lg-gateway`, which reads the current stored permission map and rejects disabled features server-side.

The production `site_keys_tier_check` permits `DEV`, `PK_`, `UPK_`, `BK_`, and `CK_`.

## DEV Key Generator and CK manager

`site/ck-key-manager.js` is the hardened DEV administration layer. It supersedes the older checkbox editor inside `auth-ck.js` while leaving `auth-ck.js` responsible for login/session/gateway compatibility.

The DEV manager can:

- generate `BK_`, `UPK_`, `PK_`, or `CK_` keys;
- assign a label;
- link up to five Google email addresses;
- toggle every CK feature independently;
- use **Select all** or **Clear all**;
- edit permissions and linked emails later;
- revoke or reactivate keys;
- prepare older keys for Google login by supplying the original raw key once.

CK controls are explicit button switches rather than relying on browser-native checkbox styling/behavior. On generate or **Save & Verify**, the frontend compares the server-returned permission map with the selected switch state. It does not show a successful save if they differ.

### Atomic key administration

DEV key-management traffic uses the dedicated `lg-key-admin` Edge Function. It authenticates a DEV raw key or linked Google DEV session, then calls service-role-only Postgres RPCs. Key creation and configuration are transactional across:

- `public.site_keys`
- `public.site_key_emails`
- `public.site_key_login_secrets`

This prevents partial states such as a key being created while its email or wrapped login secret fails to save. Email conflicts are checked before replacement of an existing key's links.

New generated keys automatically receive the wrapped-key compatibility record required for Google login. Older keys only need their original raw key once when Google linking is first enabled.

### Permission refresh and disabled-page guard

A logged-in CK session periodically refreshes its account permissions and refreshes again when the page becomes visible. Newly disabled tabs are removed from navigation and normal API enforcement remains immediate on the backend.

`site/ck-feature-guard.js` handles UI edge cases after a permission change. If the currently visible feature becomes disabled it moves to the first allowed feature. If no app features are enabled, the site shows a dedicated **No Features Enabled** page instead of leaving the Monitor shell visible. This guard does not make network calls; it only reconciles the UI with the already-loaded CK account state.

## RBX Detect

RBX Detect includes live presence, totals, charts, recent sessions/events, leaderboard, retained game history, and key-scoped tracked-user management. Presence states include `OFFLINE`, `WEBSITE`, `IN GAME`, `STUDIO`, and `INVISIBLE`.

The backend Roblox poller still checks approximately every **10 seconds**. Egress reduction is achieved through batched database work rather than reducing presence freshness.

## LG Exchange

The Exchange is a closed paper-market simulation around Roblox player markets. It has no cash value or payout.

The production candle table can contain hundreds of thousands of one-minute rows, so the frontend uses compact reads:

- `/exchange/markets` -> `lg-exchange-summary/markets`, with 24-hour aggregation performed in Postgres;
- `/exchange/history` -> `lg-exchange-summary/history`, with the selected range sampled in Postgres to a bounded chart result.

`site/egress-runtime.js` also performs short caching and in-flight GET de-duplication. Legacy raw-key sessions can skip an unnecessary gateway proxy hop where the original Edge Function already authenticates the key; Google and CK remain on the gateway where required for authorization.

## LG Cards

LG Cards is the collectible-card system. Standard randomized packs are free. Card profile verification, collections, inventory actions, trades, closed-TC auctions, gifts, and DEV tools remain server-authorized.

## MC Detector

MC Detector tracks configured Java/Bedrock servers, server state/history, available player lists, per-server watchlists, and watched-player events. FULL/SAMPLE/HIDDEN confidence remains explicit so a sampled roster is not treated as a complete roster.

## Frontend modules

| File | Purpose |
|---|---|
| `site/index.html` | Stable base app/login/RBX pages |
| `site/fetch-bootstrap.js` | Captures browser-native `fetch` before routing layers |
| `site/auth-ck.js` | Key + Google login, gateway routing, CK feature guards, compatibility bootstrap |
| `site/ck-key-manager.js` | Verified DEV key generator/config editor and CK permission switches |
| `site/ck-feature-guard.js` | Redirects away from newly-disabled CK pages and renders the all-off state |
| `site/egress-runtime.js` | GET de-duplication, short caches, direct legacy routing, low-egress Exchange routing |
| `site/exchange.js` | LG Exchange UI |
| `site/cards.js` | Core Cards UI/API integration |
| `site/profile-verify.js` | Roblox profile verification UI |
| `site/profile-verify-bootstrap.js` | Verifier reconnect/bootstrap |
| `site/cards-polish.js` | Pack/action presentation |
| `site/dev-cards.js` | DEV card tools |
| `site/custom-card-tiers.js` | Custom card-tier presentation |
| `site/mc-detector.js` | MC detector core UI |
| `site/mc-player-lists.js` | MC roster panel |
| `site/mc-aero-final.js` | MC confidence/Aero UI |
| `site/mc-frutiger-aero-overhaul.js` | MC styling layer |
| `site/rbx-metro.js` | RBX Metro/DORFic theme runtime |
| `site/performance-runtime.js` | Adaptive rendering/performance controls |
| `site/performance.css` | Low-cost visual overrides |

## Security notes

- Never put the Supabase service-role/secret key in browser code.
- A Supabase publishable key may be public; it is not an authorization bypass.
- Never commit Google OAuth client secrets, Roblox cookies, raw LG keys, or wrapped-key plaintext.
- CK authorization remains server-enforced through `lg-gateway`.
- DEV key administration is server-gated through `lg-key-admin` and service-role-only database RPCs.
- Key/email/wrapped-secret tables retain RLS and are not directly administered by public browser database calls.
- User-rendered values should remain escaped before insertion into dynamic HTML.

## Deployment and checks

GitHub Pages deploys from `.github/workflows/pages.yml` on changes under `site/` or the Pages workflow. The build injects the authentication/key-management layers before the feature bundle and cache-busts the hardened CK manager/guard so clients do not remain stuck on an older buggy CK script after a deployment.

All top-level `site/*.js` files are checked with `node --check`. The separate frontend workflow also checks the CK manager contract, including the dedicated admin endpoint, switch controls, Clear All support, save-verification logic, and all-off guard.

A hard refresh is still useful immediately after a Pages deployment if the browser retained an older HTML shell.

## Project principles

- Preserve existing records and key/client scoping.
- Keep raw-key login backward-compatible.
- Treat Google as another proof of identity for an existing key, never a permission bypass.
- Keep CK authorization server-side.
- Keep DEV administration server-side and transactional.
- Permit every CK feature combination, including all-off.
- Reduce egress with aggregation, batching, de-duplication, and short caches before reducing detector freshness.
- Prefer additive compatibility modules over risky rewrites of stable app code.
- Update this README whenever authentication, key-management, deployment, or backend behavior changes.
