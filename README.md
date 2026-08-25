# LG Presence Suite

A static GitHub Pages frontend for **RBX Detect**, **MC Detector**, **LG Cards**, and the **LG Exchange**. The browser signs in with an LG access key and talks to server-side Supabase Edge Functions; Roblox and Minecraft detector data stay separate even though both modes share the same website and key.

> **TC is a closed, site-only fictional unit. It has no cash value, cannot be redeemed, and is not a real financial asset. Random card packs are free.**

## Architecture

```text
Browser / GitHub Pages
        |
        | x-site-key
        v
Supabase Edge Functions
        |
        +-- RBX presence / history / key-scoped data
        +-- Cards / verification / gifts / exchange
        +-- MC server tracking / watchlists / history
        |
        v
Postgres + scheduled background pollers
```

The production frontend lives in `site/`. The Pages workflow starts from `site/index.html` and injects the feature modules during deployment, so the repository can keep the base page relatively small while Cards, Exchange, MC, verification, themes, and performance code remain separated.

The backend source is maintained separately in the `daytondeltap/Lg` repository.

## Access keys and tiers

- Users sign in with an LG access key.
- The raw key is kept in browser `sessionStorage` for the current tab/session and is sent in the `x-site-key` header.
- The backend resolves the key to a stable client/account and returns its tier and allowed tabs.
- Common generated-key prefixes are `BK_`, `UPK_`, and `PK_`; developer keys use the `DEV` tier.
- Feature/tab access is ultimately enforced by the backend, not only by hidden frontend buttons.
- **DEV Studio is DEV-only** and its DEV endpoints also reject non-DEV keys server-side.
- Logging out clears the browser session key.

## RBX Detect

RBX Detect is the default mode of the website.

### Monitor

- Tracks the Roblox users attached to the current LG key.
- Presence states include:
  - `OFFLINE`
  - `WEBSITE`
  - `IN GAME`
  - `STUDIO`
  - `INVISIBLE`
- Shows avatar, username, current game/location information when available, and update timing.
- Presence automatically refreshes while the Monitor page is active.
- Manual refresh is available without reloading the whole site.
- Data is scoped per LG client, so different clients can track the same Roblox user independently.

### Leaderboard

- Ranks tracked Roblox users from LG-recorded activity.
- Displays accumulated activity/playtime and session counts.
- Includes ranked bars and top-position styling.

### History

- Session and presence-event history for tracked users.
- Historical tables and charts.
- User totals and per-user filtering.
- Event types include entered/started/left/switched-style presence transitions when available from the backend.

### User Adding

- Add Roblox users to the current client's tracker.
- Remove users that should no longer be tracked.
- Tracked-user management remains scoped to the current LG key.

### Key Generator

- Developer/admin feature for creating and managing LG access keys.
- Tier selection is handled by the backend/key-generation API.

## RBX visual modes

### Frutiger Metro / Vectordelia

The RBX side uses the site's dark base palette with cyan, pink, lime, geometric poster graphics, Metro-style navigation, and motion.

### DORFic mode

A small RBX-only toggle switches to the alternate white/orange DORFic skin. The preference is stored locally and the control disappears while MC Detector is active.

## LG Exchange

The Exchange is a **shared paper-market simulation** built around Roblox player markets. It is not a real market and its values cannot be redeemed.

Features include:

- Player-market watch list.
- Current simulated TC price.
- 24-hour change, high, low, and volume.
- One-minute candlestick chart history.
- Multiple chart time ranges.
- Simulated bid/ask order-book view.
- Recent market-signal tape.
- Buy/sell controls that submit **market-pressure signals only**.
- Presence context next to player markets.
- Automatic refresh only while the Exchange is being viewed.

## LG Cards

LG Cards is the site's collectible-card system. Standard random packs are free and use closed, non-redeemable TC for site-only card features.

### Roblox profile verification

Cards clients can link a Roblox account without Discord or a Roblox OAuth app:

1. Enter a Roblox username.
2. LG resolves the public Roblox account.
3. LG generates a short `LG-XXXX-XXXX` verification code.
4. Put the code temporarily in the Roblox profile **About** description.
5. LG checks the public profile automatically.
6. After verification, the account remains linked and the temporary code can be removed.

Verification challenges expire after about 15 minutes. One Roblox account can only be linked to one Cards client.

### Packs

- Standard randomized packs are **free**.
- Packs contain three cards.
- Welcome/starter/self packs are issued according to account tier.
- Current guide schedule:
  - Basic/regular tier: starter set + first free/self packs, then about 1 free pack per week.
  - Upgraded tier: larger starter set + first free/self packs, then about 1 free pack per week.
  - Deluxe tier: larger starter set + first free/self packs, then about 3 free packs per week.
- Normal pack rarities include:
  - Regular
  - Gold
  - Holographic
  - Corrupted
  - Palladium
- Palladium odds increase after the configured 2:40 PM Bangkok cutoff; DEV cards are not randomly rolled in standard packs.
- Opening is idempotent server-side so an accidental duplicate request does not create duplicate cards or fail after a successful first open.
- The opening sequence reveals **one card at a time**.

### Card identity and stats

- Card names resolve to the official Roblox username rather than a local detector/display label.
- Cards can display Roblox avatar/custom art, player ID, status, age, circulation, LG-recorded playtime, and estimated site-only TC value.
- Card age survives ownership transfers.
- Limited circulation is tracked.

### Inventory actions

- **Freeze / Unfreeze**: freeze a card's live-stat progression and reconnect it later.
- **Showcase**: choose public showcase cards.
- **Remove/Burn**: permanently remove a card from active circulation.
- State-specific UI animations/indicators are shown for freeze, removal, and listing actions.

### Collections

- Search Cards clients by trading alias.
- View another client's public showcase.
- View public collection information exposed by the Cards backend.

### Direct trades

- Send direct card trade offers between Cards clients.
- View incoming/outgoing trades.
- Accept, reject, or otherwise update supported trade states.

### Auction House

- List an owned card in the site's closed-TC auction system.
- View current listings and bids.
- TC remains site-only and non-redeemable.
- Card ownership/circulation is updated by the backend when listings settle.

### DEV Studio

DEV Studio is both visually hidden from non-DEV users and server-gated.

Current DEV tools include:

- **Target client selector**, including the DEV user's own client.
- **Known-content Card Pack Giver**:
  - choose the recipient;
  - choose the exact three player cards;
  - choose built-in or custom tiers;
  - recipient can preview the predetermined contents before opening.
- Optional **regular-wrapper skin** for DEV gifts while retaining a disclosure that the gift is predetermined.
- **DEV Card Maker** with target client, player, title, status/challenge text, optional custom image, and design options.
- Pack/player-pool management for enabled players, weights, and display status.
- **Custom Card Tier presets** with reusable:
  - tier name and description;
  - primary/secondary background colors;
  - border, text, and accent colors;
  - gradient/solid/diagonal/grid/scanline patterns;
  - none/holographic/glitch/metal/pulse effects.
- Custom tiers can be used by both the Card Maker and DEV Pack Giver.
- Issued custom cards keep a snapshot of their design so later preset edits do not silently recolor old cards.

## MC Detector

MC Detector is a separate detector mode hosted on the same website. Switching modes does not mix RBX and Minecraft data.

### Server tracking

- Track Minecraft servers by hostname/IP and optional port.
- Java and Bedrock editions are supported by the MC API.
- Optional human-friendly server label.
- Add/remove tracked servers.
- Server cards show:
  - online/offline state;
  - current/max player count;
  - version/software when provided;
  - MOTD;
  - uptime/session information;
  - latest status data.

### Player roster

MC Detector displays every player name that mcstatus.io returns in the server status response.

Roster confidence is shown explicitly:

- **FULL n/n** — a name was returned for every player counted online.
- **SAMPLE n/total** — only a subset of names was exposed.
- **HIDDEN** — players are online but no names were exposed.
- **EMPTY** — server is online with zero players.
- **OFFLINE** — server is offline.

This matters because Minecraft servers can intentionally expose only a sample or no player names at all.

### Player watchlist

- Add watched Minecraft usernames per tracked server.
- On a **FULL** roster, LG can treat absence/presence as authoritative and record confirmed join/leave transitions.
- On a **SAMPLE** roster, LG trusts positive sightings but does not falsely interpret a missing sample entry as offline.
- Watch states include:
  - `ONLINE`
  - `OFFLINE`
  - `SEEN`
  - `UNKNOWN`
- Related MC history can include joined, left, and sample-seen events.
- New watch targets get a baseline so adding somebody who is already present does not generate a fake join event.

### MC history

- Player-count history charts.
- 24-hour, 7-day, and 30-day ranges.
- Server-online/offline event history.
- Watched-player event history.

### MC visual design

The MC side uses a bright Frutiger Aero / Vista-inspired presentation with sky/aqua/green glass surfaces, wallpaper imagery, glossy controls, bubbles, and separate styling from RBX mode.

## Companion RBX Detect browser extension

The repository also contains a Chrome/Chromium Manifest V3 companion extension under `extension/rbx-detect/`.

It includes:

- Login with the same LG access key.
- Sync of the key's tracked Roblox players.
- Background presence checks.
- Native desktop notification when a tracked user transitions from offline/invisible to an online state during the configured **07:10–14:40 Bangkok** alert window.
- Silent baseline after login so already-online users do not create a notification storm.
- Master notification on/off switch.
- Current tracked-player status list.
- Manual refresh.
- Test notification button.
- Recent local notification history.
- Clear history and logout controls.
- Toolbar badge with the current online count.

## Adaptive performance mode

The frontend automatically reduces purely decorative GPU work on devices likely to struggle while preserving functional behavior.

The adaptive layer looks at signals such as:

- `hardwareConcurrency`;
- `deviceMemory` when available;
- coarse/mobile pointer input;
- Save-Data mode;
- the user's reduced-motion preference.

On constrained devices it can reduce/disable expensive blur, large shadows, extra decorative layers, continuous ambient animation, fixed-background repainting, and pointer parallax. It also lets the browser skip rendering expensive off-screen cards. Detector polling, Cards actions, pack opening, Exchange behavior, watchlists, and data refresh remain enabled.

When a tab is hidden, ambient decorative animation is paused.

## Frontend module map

| File | Purpose |
|---|---|
| `site/index.html` | Base login, RBX monitor, leaderboard, history, user/key UI |
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

- The Supabase service-role/secret key is **not** embedded in browser code.
- Browser requests use the current LG access key and backend authorization/scoping.
- Service-role-only tables use RLS/no-public-policy patterns on the backend where applicable.
- DEV-only operations are checked server-side.
- User-controlled values rendered into dynamic HTML are escaped/sanitized in the relevant modules.
- Roblox Cards verification uses a short-lived public profile code rather than asking for a Roblox password.
- Never commit real LG keys, Roblox cookies, Supabase service-role keys, or other secrets to this repository.

## Deployment

GitHub Pages deploys from `.github/workflows/pages.yml` whenever `main` changes under `site/` or the Pages workflow itself changes.

The workflow:

1. checks out the repository;
2. injects the standalone frontend modules into `site/index.html`;
3. uploads `site/` as the Pages artifact;
4. deploys the artifact with GitHub Pages.

Because the site is aggressively cached by browsers/CDNs, a hard refresh can be useful immediately after a new Pages deployment when testing changed JavaScript or CSS.

## Project principles

- Keep RBX and MC tracking data separate.
- Preserve key/client scoping.
- Keep DEV capabilities server-gated.
- Keep standard randomized Cards packs free.
- Keep TC closed and non-redeemable.
- Prefer additive modules over risky rewrites of the stable base page.
- Scale visual effects down before sacrificing functional behavior on slower devices.
