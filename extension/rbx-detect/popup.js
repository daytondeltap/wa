const $ = (id) => document.getElementById(id);
const LABELS = { 0: 'Offline', 1: 'Website', 2: 'In game', 3: 'In Studio', 4: 'Invisible' };
const ONLINE = new Set([1, 2, 3]);

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
}

function relativeTime(iso) {
  if (!iso) return 'Not synced';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function bangkokTimestamp(iso) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(iso));
  } catch (_) { return ''; }
}

function renderPlayers(snapshot) {
  const host = $('players');
  const users = snapshot?.users || [];
  const states = snapshot?.states || {};
  const avatars = snapshot?.avatars || {};
  if (!users.length) {
    host.innerHTML = '<div class="empty">No tracked players linked to this key.</div>';
    $('online-count').textContent = '0 online';
    return;
  }
  let onlineCount = 0;
  host.innerHTML = users.map((user) => {
    const state = states[String(user.id)] || { presence_type: 0, last_location: '' };
    const type = Number(state.presence_type ?? 0);
    if (ONLINE.has(type)) onlineCount++;
    const cls = type === 2 ? 'game' : type === 3 ? 'studio' : type === 1 ? 'website' : '';
    const secondary = type === 2 && state.last_location ? state.last_location : LABELS[type] || 'Unknown';
    const avatar = avatars[String(user.id)]
      ? `<img class="avatar" src="${escapeHtml(avatars[String(user.id)])}" alt="">`
      : '<div class="avatar placeholder">RBX</div>';
    return `<div class="player">
      <div class="player-main">
        ${avatar}
        <div class="player-copy">
          <div class="player-name">${escapeHtml(user.name || state.username || user.id)}</div>
          <div class="player-sub">${escapeHtml(secondary)}</div>
        </div>
        <span class="presence-dot ${cls}"></span>
      </div>
    </div>`;
  }).join('');
  $('online-count').textContent = `${onlineCount} online`;
}

function renderAlerts(alerts) {
  const host = $('alerts');
  if (!alerts?.length) {
    host.innerHTML = '<div class="empty">No online alerts yet.</div>';
    return;
  }
  host.innerHTML = alerts.slice(0, 12).map((alert) => {
    const message = Number(alert.presenceType) === 2 && alert.location ? alert.location : LABELS[Number(alert.presenceType)] || 'Online';
    return `<div class="alert">
      <div class="alert-title">${escapeHtml(alert.name)}</div>
      <div class="alert-time">${escapeHtml(bangkokTimestamp(alert.timestamp))}</div>
      <div class="alert-sub">${escapeHtml(message)}</div>
      <div class="alert-time">BKK</div>
    </div>`;
  }).join('');
}

async function render() {
  const data = await chrome.storage.local.get([
    'siteKey','account','notificationsEnabled','lastSnapshot','lastError','alertHistory','monitorAllowed'
  ]);
  const loggedIn = Boolean(data.siteKey && data.account);
  $('login-view').classList.toggle('hidden', loggedIn);
  $('app-view').classList.toggle('hidden', !loggedIn);
  $('top-dot').classList.toggle('online', loggedIn);
  if (!loggedIn) return;

  $('tier-text').textContent = `${data.account.tier || 'UNKNOWN'} · ${Array.isArray(data.account.tabs) ? data.account.tabs.join(' / ') : ''}`;
  $('notify-toggle').checked = data.notificationsEnabled !== false;

  const snapshot = data.lastSnapshot;
  $('window-pill').textContent = snapshot?.inWindow ? 'ALERT WINDOW ACTIVE' : 'ALERT WINDOW CLOSED';
  $('window-pill').classList.toggle('active', Boolean(snapshot?.inWindow));
  $('window-pill').classList.toggle('closed', !snapshot?.inWindow);
  $('last-sync').textContent = snapshot?.fetchedAt ? `Synced ${relativeTime(snapshot.fetchedAt)}` : 'Not synced';

  const warning = $('monitor-warning');
  if (data.monitorAllowed === false || data.lastError) {
    warning.textContent = data.lastError || 'Monitor access is unavailable for this key.';
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }

  renderPlayers(snapshot);
  renderAlerts(data.alertHistory || []);
}

async function busy(button, text, fn) {
  const old = button.textContent;
  button.disabled = true;
  button.textContent = text;
  try { return await fn(); }
  finally { button.disabled = false; button.textContent = old; }
}

$('login-btn').addEventListener('click', async () => {
  $('login-error').textContent = '';
  const key = $('key-input').value.trim();
  await busy($('login-btn'), 'Connecting…', async () => {
    const result = await send({ type: 'LOGIN', siteKey: key });
    if (!result?.ok) {
      $('login-error').textContent = result?.error || 'Could not connect.';
      return;
    }
    $('key-input').value = '';
    await render();
  });
});

$('key-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('login-btn').click();
});

$('logout-btn').addEventListener('click', async () => {
  await send({ type: 'LOGOUT' });
  await render();
  $('key-input').focus();
});

$('notify-toggle').addEventListener('change', async (event) => {
  await send({ type: 'SET_NOTIFICATIONS', enabled: event.target.checked });
});

$('refresh-btn').addEventListener('click', async () => {
  await busy($('refresh-btn'), 'Refreshing…', async () => {
    const result = await send({ type: 'REFRESH' });
    if (!result?.ok && result?.error) {
      await chrome.storage.local.set({ lastError: result.error });
    }
    await render();
  });
});

$('test-btn').addEventListener('click', async () => {
  await busy($('test-btn'), 'Sending…', async () => {
    await send({ type: 'TEST_NOTIFICATION' });
  });
});

$('clear-alerts').addEventListener('click', async () => {
  await send({ type: 'CLEAR_ALERTS' });
  await render();
});

chrome.storage.onChanged.addListener(() => render());
render();
