const API = 'https://jwjxhxvahgrpkvaoyrzw.supabase.co/functions/v1/lg-api';
const SITE_URL = 'https://daytondeltap.github.io/wa/';
const ALARM = 'rbx-detect-presence';
const BANGKOK_TZ = 'Asia/Bangkok';
const START_MINUTE = 7 * 60 + 10;
const END_MINUTE = 14 * 60 + 40;
const ONLINE_TYPES = new Set([1, 2, 3]);
const LABELS = { 0: 'OFFLINE', 1: 'WEBSITE', 2: 'IN GAME', 3: 'IN STUDIO', 4: 'INVISIBLE' };
const NOTIFICATION_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAB+UlEQVR4nO3SQQ3AIBDAsAP/nuGNAvZoFSzZOjNnyNi5vwfgdQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCQARQJYJIBFApgkgEUCRCR4A1oBBMP1HZEAAAAASUVORK5CYII=';

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function bangkokClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BANGKOK_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = Number(byType.hour || 0);
  const minute = Number(byType.minute || 0);
  return {
    hour,
    minute,
    second: Number(byType.second || 0),
    minuteOfDay: hour * 60 + minute,
    text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  };
}

function inAlertWindow(date = new Date()) {
  const { minuteOfDay } = bangkokClock(date);
  return minuteOfDay >= START_MINUTE && minuteOfDay <= END_MINUTE;
}

async function api(path, siteKey) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'x-site-key': siteKey, 'accept': 'application/json' }
  });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    const error = new Error(data.error || data.detail || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function online(type) {
  return ONLINE_TYPES.has(Number(type));
}

function statusMessage(state) {
  const type = Number(state?.presence_type ?? 0);
  if (type === 2) return state?.last_location ? `Playing ${state.last_location}` : 'Playing Roblox';
  if (type === 3) return 'Using Roblox Studio';
  if (type === 1) return 'Online on Roblox';
  return LABELS[type] || 'Online';
}

async function createOnlineNotification(user, state) {
  const id = `rbx-${user.id}-${Date.now()}`;
  const title = `RBX Detect · ${user.name || state?.username || user.id} is online`;
  const message = statusMessage(state);
  await chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: NOTIFICATION_ICON,
    title,
    message,
    contextMessage: '07:10–14:40 Bangkok alert window',
    priority: 1
  });

  const { alertHistory = [] } = await storageGet(['alertHistory']);
  const next = [{
    id,
    userId: Number(user.id),
    name: user.name || state?.username || String(user.id),
    presenceType: Number(state?.presence_type ?? 0),
    location: state?.last_location || '',
    timestamp: new Date().toISOString()
  }, ...alertHistory].slice(0, 30);
  await chrome.storage.local.set({ alertHistory: next });
}

async function updateBadge(snapshot) {
  const states = snapshot?.states || {};
  const count = Object.values(states).filter((s) => online(s?.presence_type)).length;
  await chrome.action.setBadgeText({ text: count ? String(count) : '' });
  if (count) await chrome.action.setBadgeBackgroundColor({ color: '#ff3c5f' });
}

async function pollPresence({ force = false, establishBaseline = false } = {}) {
  const stored = await storageGet(['siteKey', 'notificationsEnabled', 'lastStates']);
  const siteKey = String(stored.siteKey || '').trim();
  if (!siteKey) return { ok: false, loggedIn: false };

  try {
    const payload = await api('/monitor/presence', siteKey);
    const users = Array.isArray(payload.users) ? payload.users : [];
    const states = payload.states || {};
    const avatars = payload.avatars || {};
    const previous = stored.lastStates || {};
    const current = {};
    const shouldNotify = stored.notificationsEnabled !== false && inAlertWindow();
    const hasBaseline = Object.keys(previous).length > 0 && !establishBaseline;

    for (const user of users) {
      const id = String(user.id);
      const state = states[id] || { user_id: Number(user.id), presence_type: 0, last_location: '' };
      const type = Number(state.presence_type ?? 0);
      current[id] = type;

      if (hasBaseline && shouldNotify && !online(previous[id]) && online(type)) {
        await createOnlineNotification(user, state);
      }
    }

    const snapshot = {
      users,
      states,
      avatars,
      fetchedAt: new Date().toISOString(),
      bangkokTime: bangkokClock().text,
      inWindow: inAlertWindow()
    };

    await chrome.storage.local.set({
      lastStates: current,
      lastSnapshot: snapshot,
      lastError: null,
      monitorAllowed: true
    });
    await updateBadge(snapshot);
    return { ok: true, snapshot };
  } catch (error) {
    const monitorAllowed = error?.status !== 403;
    const lastError = error?.status === 403
      ? 'This key tier does not include Monitor access.'
      : error?.message || 'Could not refresh presence.';
    await chrome.storage.local.set({ lastError, monitorAllowed });
    if (error?.status === 401) {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#ff3c5f' });
    }
    if (force) throw error;
    return { ok: false, error: lastError, status: error?.status || 0 };
  }
}

async function validateLogin(siteKey) {
  const key = String(siteKey || '').trim();
  if (!key) throw new Error('Enter an LG access key.');
  const account = await api('/auth', key);
  await chrome.storage.local.set({
    siteKey: key,
    account,
    notificationsEnabled: true,
    lastStates: {},
    lastSnapshot: null,
    lastError: null,
    monitorAllowed: true
  });
  try {
    await pollPresence({ force: true, establishBaseline: true });
  } catch (error) {
    if (error?.status !== 403) {
      await chrome.storage.local.remove(['siteKey', 'account', 'lastStates', 'lastSnapshot']);
      throw error;
    }
  }
  await ensureAlarm();
  return account;
}

async function logout() {
  await chrome.storage.local.remove([
    'siteKey', 'account', 'lastStates', 'lastSnapshot', 'lastError', 'alertHistory', 'monitorAllowed'
  ]);
  await chrome.action.setBadgeText({ text: '' });
}

async function ensureAlarm() {
  const alarm = await chrome.alarms.get(ALARM);
  if (!alarm) {
    await chrome.alarms.create(ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  chrome.storage.local.get(['notificationsEnabled']).then(({ notificationsEnabled }) => {
    if (typeof notificationsEnabled !== 'boolean') chrome.storage.local.set({ notificationsEnabled: true });
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  pollPresence().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) pollPresence().catch(() => {});
});

chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: SITE_URL });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === 'LOGIN') return { ok: true, account: await validateLogin(message.siteKey) };
    if (message?.type === 'LOGOUT') { await logout(); return { ok: true }; }
    if (message?.type === 'REFRESH') return await pollPresence({ force: true });
    if (message?.type === 'SET_NOTIFICATIONS') {
      await chrome.storage.local.set({ notificationsEnabled: Boolean(message.enabled) });
      return { ok: true };
    }
    if (message?.type === 'CLEAR_ALERTS') {
      await chrome.storage.local.set({ alertHistory: [] });
      return { ok: true };
    }
    if (message?.type === 'TEST_NOTIFICATION') {
      await chrome.notifications.create(`test-${Date.now()}`, {
        type: 'basic',
        iconUrl: NOTIFICATION_ICON,
        title: 'RBX Detect · Notifications are working',
        message: 'You will only get automatic online alerts from 07:10–14:40 Bangkok time.',
        priority: 0
      });
      return { ok: true };
    }
    return { ok: false, error: 'Unknown request' };
  })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || 'Request failed', status: error?.status || 0 }));
  return true;
});

ensureAlarm();
