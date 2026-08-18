# RBX Detect Chrome extension

A minimal Manifest V3 companion for LG / RBX Detect.

## Behavior

- Sign in with the same LG site access key used on the website.
- Syncs the key's tracked-player presence through the existing `lg-api` endpoint.
- Uses Chrome's native notification system.
- Automatic alerts only run from **07:10 through 14:40 Asia/Bangkok**.
- The first sync after login is a silent baseline; it does not notify for players who were already online.
- Alerts fire when a tracked player changes from offline/invisible to Website, In Game, or In Studio.
- Notification history is stored locally in the extension and can be cleared.
- Notifications can be turned on/off without logging out.
- The LG access key is stored only in `chrome.storage.local`, not Chrome Sync.
- Existing LG tier permissions are preserved. A key without Monitor access can authenticate, but the extension will show that monitoring is unavailable.

## Install unpacked

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.
5. Pin **RBX Detect** if desired.

## Files

- `manifest.json` — MV3 configuration and permissions.
- `background.js` — key validation, polling, Bangkok schedule, transition detection, native notifications.
- `popup.html` / `popup.css` / `popup.js` — minimal LG-style UI, tracked users, toggle, history, refresh/logout.
