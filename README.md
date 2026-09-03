# LG Presence Suite

A static GitHub Pages frontend for **RBX Detect**, **MC Detector**, **LG Cards**, and the **LG Exchange**. The site talks to server-side Supabase Edge Functions and keeps Roblox and Minecraft detector data scoped to the same LG account while keeping the two detector modes logically separate.

> **TC is a closed, site-only fictional unit. It has no cash value, cannot be redeemed, and is not a real financial asset. Standard randomized card packs are free.**

## Architecture

```text
Browser / GitHub Pages
        |
        |-- LG access key (x-site-key)
        |-- OR Supabase Google session (Authorization: Bearer ...)
        v
lg-gateway
        |
        +-- resolves both login methods to the same LG key/account
        +-- enforces CK feature permissions
        +-- proxies to existing LG Edge Functions
        |
        +-- RBX presence / history / key-scoped data
        +-- Cards / verification / gifts / exchange
        +-- MC server tracking / watchlists / history
        v
Postgres + scheduled background pollers
```

The production frontend lives in `site/`. The Pages workflow starts from `site/index.html`, installs the authentication/gateway layer first, then injects the feature modules. The backend source is maintained in the `daytondeltap/Lg` repository.

## Login methods

LG supports two ways to enter the same account:

1. **Access key** — the original login method. The raw key is kept in browser `sessionStorage` for the current tab/session and requests are authorized through `x-site-key`.
2. **Sign in with Google** — a Google account can be linked to an LG key by a DEV user. Supabase Auth validates the Google session, the gateway matches the confirmed Google email to a linked LG key, and all permissions/data are then taken from that key.

Google login does **not** create a second LG account and does not bypass key permissions. If the linked key is revoked, the linked Google login is revoked too. Logging out clears both local key state and Google-session state.

### Google OAuth configuration

Production site:

- **Google OAuth client ID:** `116418828646-25qo5updqnfpv3g7qb68v7j51pj8osoh.apps.googleusercontent.com`
- **Authorized JavaScript origin in Google Cloud:** `https://daytondeltap.github.io`
- **Authorized redirect URI in Google Cloud:** `https://jwjxhxvahgrpkvaoyrzw.supabase.co/auth/v1/callback`
- **Supabase Auth Site URL:** `https://daytondeltap.github.io/wa/`
- **Supabase Auth Redirect URL allow-list entry:** `https://daytondeltap.github.io/wa/`

In **Supabase Dashboard → Authentication → Providers → Google**, enable Google and paste the client ID above plus the Google client secret. The client secret belongs only in Supabase/Google configuration and must never be committed to this repository.

For local development, add the exact local origin you actually use (for example `http://localhost:8000`) to Google Authorized JavaScript origins and the corresponding page URL (for example `http://localhost:8000/`) to Supabase Redirect URLs. The Google provider callback remains the Supabase callback URL shown above.

## Access keys and tiers

Existing tiers remain supported:

- `BK_` — Basic access.
- `UPK_` — Upgraded access.
- `PK_` — Full standard access.
- `DEV` — developer/admin access and Key Generator.
- `CK_` — **Configurable Key**. DEV users choose its allowed features with a checklist.

The CK checklist can independently allow or deny:

- Monitor
- Leaderboard
- LG Exchange
- History
- User Adding
- LG Cards
- MC Detector
- Join Game

The backend is authoritative. Hiding a disabled feature in the browser is only presentation; `lg-gateway` also rejects requests for CK features that are switched off.

## Key Generator

The DEV Key Generator can:

- generate `BK_`, `UPK_`, `PK_`, or `CK_` keys;
- assign an optional label;
- link up to five Google email addresses to a key;
- choose CK permissions from a checklist;
- edit a generated key's label, linked Google emails, and CK permissions later;
- revoke or reactivate keys.

An email can be linked to only one LG key at a time. New keys are automatically prepared for Google login. Older keys created before Google-login support can still be linked, but the DEV UI asks for the original raw key once so the gateway can create the encrypted compatibility record required to proxy legacy Edge Functions. The raw key is never placed in the frontend source.

## RBX Detect

RBX Detect is the default detector mode. It includes live presence, player totals, charts, recent sessions/events, leaderboard data, retained game history, and key-scoped tracked-user management. Presence states include `OFFLINE`, `WEBSITE`, `IN GAME`, `STUDIO`, and `INVISIBLE`.

Join controls remain permission-aware. A CK key with Join Game disabled does not receive usable join capability even if Monitor is enabled.

## LG Exchange

The Exchange is a shared paper-market simulation around Roblox player markets. Values are site-only, non-redeemable, and have no real-world payout. It includes market watch, simulated price/history views, an order-book-style display, and market-pressure signals.

## LG Cards

LG Cards is the site's collectible-card system. Standard randomized packs are free and use closed, non-redeemable TC for site-only features. It includes Roblox profile verification, packs, inventory actions, collections, direct trades, auctions inside the closed TC system, and DEV-only card tools. DEV operations continue to be checked server-side.

## MC Detector

MC Detector tracks Java/Bedrock servers, server status, player rosters when exposed by the server, per-server watchlists, uptime/history, and watched-player events. FULL/SAMPLE/HIDDEN roster confidence remains explicit so a missing sampled name is not incorrectly treated as proof that a player is offline.

## Companion RBX Detect browser extension

The repository also contains a Chrome/Chromium Manifest V3 companion extension under `extension/rbx-detect/`. It continues to use LG access-key authentication, sync tracked Roblox users, perform background presence checks, and show local desktop notifications during its configured alert window.

## Adaptive performance mode

The frontend can reduce purely decorative GPU work on constrained devices while preserving detector polling, data refresh, Cards actions, Exchange behavior, and watchlists. Ambient decorative animation is paused when the tab is hidden.

## Frontend module map

| File | Purpose |
|---|---|
| `site/index.html` | Stable base login, RBX monitor, leaderboard, history, user/key UI |
| `site/auth-ck.js` | Key + Google login bridge, gateway routing, CK/email Key Generator UI, feature guards |
| `site/exchange.js` | LG Exchange |
| `site/cards.js` | Core Cards pages and APIs |
| `site/profile-verify.js` | Roblox About/profile-code verification UI |
| `site/profile-verify-bootstrap.js` | Reconnects the verifier after login/Cards re-renders |
| `site/cards-polish.js` | Pack reveal and immediate action feedback |
| `site/dev-cards.js` | DEV targeting and known-content gift packs |
| `site/custom-card-tiers.js` | DEV custom tier presets and rendering |
| `site/mc-detector.js` | MC mode, servers, watchlist, history |
| `site/mc-player-lists.js` | Full/sample/hidden player-roster panel |
| `site/mc-aero-final.js` | MC watch-confidence UI + Aero styling layer |
| `site/mc-frutiger-aero-overhaul.js` | MC Frutiger Aero presentation layer |
| `site/rbx-metro.js` | RBX Metro/DORFic theme runtime |
| `site/performance-runtime.js` | Adaptive device performance classification |
| `site/performance.css` | Low-cost visual overrides for constrained devices |

## Security notes

- The Supabase **publishable** key may be present in browser code; the Supabase service-role/secret key is never embedded in the browser.
- Google OAuth tokens are validated by Supabase Auth before the gateway accepts them.
- A Google email is useful only if it maps to an active LG key.
- CK permissions and DEV-only operations are enforced server-side.
- Key/email mapping and wrapped-key tables have Row Level Security enabled and are accessed by server-side code rather than directly by public clients.
- User-controlled values rendered into dynamic HTML are escaped/sanitized in the relevant modules.
- Never commit real LG keys, Roblox cookies, Google OAuth client secrets, Supabase service-role keys, or other private credentials.

## Deployment

GitHub Pages deploys from `.github/workflows/pages.yml` whenever `main` changes under `site/` or the Pages workflow itself changes.

The workflow:

1. checks out the repository;
2. changes saved-key bootstrap so `site/auth-ck.js` owns session selection;
3. injects `auth-ck.js` before feature modules;
4. validates JavaScript syntax;
5. uploads `site/` as the Pages artifact;
6. deploys the artifact with GitHub Pages.

Because the site is aggressively cached by browsers/CDNs, a hard refresh can be useful immediately after a Pages deployment when testing changed JavaScript or CSS.

## Project principles

- Preserve key/client scoping and existing data.
- Keep key login backward-compatible.
- Treat Google as another proof of identity for an existing LG key, not as a permissions bypass.
- Keep RBX and MC tracking data separate.
- Keep DEV capabilities server-gated.
- Keep CK authorization server-enforced.
- Keep standard randomized Cards packs free and TC closed/non-redeemable.
- Prefer additive modules over risky rewrites of the stable base page.
- Update this README whenever architecture or user-visible behavior changes.
