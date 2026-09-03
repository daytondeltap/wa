(() => {
  const SB = 'https://jwjxhxvahgrpkvaoyrzw.supabase.co';
  const ADMIN_API = `${SB}/functions/v1/lg-key-admin`;
  const FEATURES = [
    ['monitor', 'Monitor'],
    ['leaderboard', 'Leaderboard'],
    ['exchange', 'LG Exchange'],
    ['history', 'History'],
    ['adduser', 'User Adding'],
    ['cards', 'LG Cards'],
    ['mc', 'MC Detector'],
    ['join', 'Join Game'],
  ];
  const nativeFetch = window.LG_NATIVE_FETCH || window.fetch.bind(window);
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let keyRows = [];
  let installed = false;
  let accountRefreshBusy = false;

  function currentAccount() {
    try { return typeof account !== 'undefined' ? account : null; } catch { return null; }
  }
  function currentSiteKey() {
    try { return typeof SITE_KEY !== 'undefined' ? String(SITE_KEY || '') : ''; } catch { return ''; }
  }
  function parseEmails(value) {
    const out = [];
    for (const raw of String(value || '').split(/[\n,;]/)) {
      const email = raw.trim().toLowerCase();
      if (!email || out.includes(email)) continue;
      out.push(email);
    }
    return out;
  }
  function normalizePermissions(value) {
    const out = {};
    for (const [key] of FEATURES) out[key] = value?.[key] === true;
    return out;
  }
  function enabledLabels(value) {
    const p = normalizePermissions(value);
    return FEATURES.filter(([key]) => p[key]).map(([, label]) => label);
  }
  function samePermissions(a, b) {
    const aa = normalizePermissions(a), bb = normalizePermissions(b);
    return FEATURES.every(([key]) => aa[key] === bb[key]);
  }
  function authHeaders() {
    const h = new Headers({'content-type':'application/json'});
    const a = currentAccount();
    if (a?.auth_method === 'google') {
      try {
        const s = JSON.parse(sessionStorage.getItem('lg_google_session') || 'null');
        if (s?.access_token) h.set('authorization', `Bearer ${s.access_token}`);
      } catch {}
    } else {
      const raw = currentSiteKey().trim();
      if (raw) h.set('x-site-key', raw);
    }
    return h;
  }
  async function admin(path, opts = {}) {
    const headers = authHeaders();
    new Headers(opts.headers || {}).forEach((v, k) => headers.set(k, v));
    const r = await nativeFetch(`${ADMIN_API}${path}`, {...opts, headers});
    let j = null;
    try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error(j?.error || j?.detail || `Key request failed (${r.status})`);
    return j;
  }

  function injectStyles() {
    if ($('lg-ck-manager-style')) return;
    const s = document.createElement('style');
    s.id = 'lg-ck-manager-style';
    s.textContent = `
      .ckm-panel{border:1px solid var(--border);border-radius:7px;padding:.8rem;background:rgba(255,255,255,.015)}
      .ckm-title-row{display:flex;align-items:center;justify-content:space-between;gap:.6rem;flex-wrap:wrap;margin-bottom:.6rem}
      .ckm-actions{display:flex;gap:.35rem;flex-wrap:wrap}
      .ckm-mini{font:600 .55rem var(--font-mono);padding:.28rem .48rem;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--subtext);cursor:pointer}
      .ckm-mini:hover{color:var(--text);border-color:var(--accent2)}
      .ckm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:.45rem}
      .ckm-switch{display:flex;align-items:center;justify-content:space-between;gap:.6rem;width:100%;min-height:38px;padding:.48rem .58rem;border:1px solid var(--border);border-radius:5px;background:rgba(255,255,255,.012);color:var(--subtext);font:600 .61rem var(--font-mono);cursor:pointer;text-align:left;user-select:none}
      .ckm-switch:hover{border-color:#666680;color:var(--text)}
      .ckm-switch.is-on{border-color:var(--accent2);color:var(--text);background:rgba(0,229,255,.055)}
      .ckm-pill{width:30px;height:16px;border-radius:99px;background:#313143;position:relative;flex:0 0 auto;transition:.14s ease}
      .ckm-pill:after{content:'';position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#8a8aa0;transition:.14s ease}
      .ckm-switch.is-on .ckm-pill{background:rgba(0,229,255,.26)}
      .ckm-switch.is-on .ckm-pill:after{left:16px;background:var(--accent2)}
      .ckm-note{font:400 .56rem var(--font-mono);color:var(--muted);line-height:1.45;margin-top:.5rem}
      .ckm-status{font:600 .58rem var(--font-mono);min-height:1rem;margin-top:.45rem;color:var(--subtext)}
      .ckm-status.ok{color:var(--green)}.ckm-status.err{color:var(--accent)}
      .ckm-config-overlay{position:fixed;inset:0;z-index:1600;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:1rem}
      .ckm-config{width:min(670px,97vw);max-height:92vh;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:1rem}
      .ckm-config h3{font-size:.9rem;margin:0 0 .8rem}.ckm-config .adduser-field{margin-bottom:.75rem}
      .ckm-config-actions{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem;flex-wrap:wrap}
      .ckm-chip{display:inline-block;border:1px solid var(--border);border-radius:99px;padding:.1rem .32rem;margin:.08rem;font:400 .52rem var(--font-mono);color:var(--subtext)}
      .ckm-key-meta{font:400 .57rem var(--font-mono);color:var(--subtext);line-height:1.5}
      .ckm-busy{opacity:.58;pointer-events:none}
      @media(max-width:760px){.ckm-grid{grid-template-columns:1fr}.ckm-config{padding:.8rem}.ckm-switch{min-height:42px}}
    `;
    document.head.appendChild(s);
  }

  function switchMarkup(state) {
    return `<div class="ckm-grid">${FEATURES.map(([key, label]) => `<button type="button" class="ckm-switch ${state[key] ? 'is-on' : ''}" data-ckm-feature="${key}" aria-pressed="${state[key] ? 'true' : 'false'}"><span>${esc(label)}</span><span class="ckm-pill" aria-hidden="true"></span></button>`).join('')}</div>`;
  }
  function syncSwitch(btn, on) {
    btn.classList.toggle('is-on', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function bindSwitches(root, state) {
    root.querySelectorAll('[data-ckm-feature]').forEach(btn => {
      syncSwitch(btn, !!state[btn.dataset.ckmFeature]);
      btn.onclick = () => {
        const key = btn.dataset.ckmFeature;
        state[key] = !state[key];
        syncSwitch(btn, state[key]);
      };
    });
    root.querySelector('[data-ckm-all]')?.addEventListener('click', () => {
      for (const [key] of FEATURES) state[key] = true;
      root.querySelectorAll('[data-ckm-feature]').forEach(btn => syncSwitch(btn, true));
    });
    root.querySelector('[data-ckm-none]')?.addEventListener('click', () => {
      for (const [key] of FEATURES) state[key] = false;
      root.querySelectorAll('[data-ckm-feature]').forEach(btn => syncSwitch(btn, false));
    });
  }
  function permissionPanel(state) {
    return `<div class="ckm-panel"><div class="ckm-title-row"><div class="sec-title" style="margin:0">CK Feature Access</div><div class="ckm-actions"><button type="button" class="ckm-mini" data-ckm-all>Select all</button><button type="button" class="ckm-mini" data-ckm-none>Clear all</button></div></div>${switchMarkup(state)}<div class="ckm-note">All features may be switched off. Changes are enforced server-side.</div></div>`;
  }

  function buildGenerator() {
    const form = $('keygen-form');
    if (!form) return;
    const state = normalizePermissions({monitor:true,leaderboard:true,history:true,adduser:true,cards:true,mc:true});
    form.innerHTML = `
      <div class="adduser-field"><label for="keygen-tier">Key Type</label><select class="ask-input" id="keygen-tier" required><option value="PK_">PK_ — Full access</option><option value="UPK_">UPK_ — Leaderboard + User Adding</option><option value="BK_">BK_ — Monitor + User Adding</option><option value="CK_">CK_ — Configurable feature access</option></select></div>
      <div class="adduser-field"><label for="keygen-label">Label (optional)</label><input class="ask-input" id="keygen-label" maxlength="60" placeholder="e.g. client-acme"></div>
      <div class="adduser-field"><label for="keygen-emails">Linked Google email(s)</label><textarea class="ask-input key-email-input" id="keygen-emails" maxlength="1600" placeholder="name@example.com\nsecond@example.com"></textarea><div class="adduser-hint">Optional · up to 5 emails. Each email can belong to one LG key.</div></div>
      <div id="ckm-generate-perms" style="display:none">${permissionPanel(state)}</div>
      <button class="ask-submit" id="ckm-generate" type="submit">+ Generate Key</button>
      <div id="ckm-generate-status" class="ckm-status"></div>`;
    const tier = $('keygen-tier'), perms = $('ckm-generate-perms');
    bindSwitches(perms, state);
    const toggle = () => { perms.style.display = tier.value === 'CK_' ? '' : 'none'; };
    tier.onchange = toggle;
    toggle();
    form.onsubmit = async e => {
      e.preventDefault();
      const btn = $('ckm-generate'), status = $('ckm-generate-status');
      status.className = 'ckm-status'; status.textContent = 'Saving…'; btn.disabled = true;
      try {
        const payload = {
          tier: tier.value,
          label: $('keygen-label').value.trim(),
          emails: parseEmails($('keygen-emails').value),
          permissions: tier.value === 'CK_' ? normalizePermissions(state) : {},
        };
        const saved = await admin('/generate', {method:'POST', body:JSON.stringify(payload)});
        if (tier.value === 'CK_' && !samePermissions(saved.permissions, state)) throw new Error('Saved CK permissions did not match the selected switches');
        const labels = enabledLabels(saved.permissions);
        const result = $('keygen-result');
        if (result) result.innerHTML = `<div class="adduser-hint">Copy this now — plaintext is shown once.</div><div class="key-output">${esc(saved.raw_key)}</div>${saved.emails?.length ? `<div class="ckm-key-meta" style="margin-top:.45rem">Google: <b>${saved.emails.map(esc).join(', ')}</b></div>` : ''}${saved.tier === 'CK_' ? `<div class="ckm-key-meta">CK: ${labels.length ? labels.map(x => `<span class="ckm-chip">${esc(x)}</span>`).join('') : '<b>all features disabled</b>'}</div>` : ''}`;
        $('keygen-label').value = '';
        $('keygen-emails').value = '';
        status.className = 'ckm-status ok'; status.textContent = 'Key created and verified.';
        await refreshKeys();
      } catch (err) {
        status.className = 'ckm-status err'; status.textContent = err.message || 'Key creation failed';
        if (typeof toast === 'function') toast(status.textContent);
      } finally { btn.disabled = false; }
    };
  }

  function openConfig(row) {
    document.querySelector('.ckm-config-overlay')?.remove();
    document.querySelector('.key-config-overlay')?.remove();
    const state = normalizePermissions(row.permissions);
    const overlay = document.createElement('div');
    overlay.className = 'ckm-config-overlay';
    overlay.innerHTML = `<div class="ckm-config"><h3>Configure ${esc(row.tier)} key</h3><div class="ckm-key-meta" style="margin-bottom:.8rem">Key ID <b>${esc(row.key_id)}</b></div><div class="adduser-field"><label for="ckm-cfg-label">Label</label><input id="ckm-cfg-label" class="ask-input" maxlength="60" value="${esc(row.key_label || '')}"></div><div class="adduser-field"><label for="ckm-cfg-emails">Linked Google email(s)</label><textarea id="ckm-cfg-emails" class="ask-input key-email-input" maxlength="1600">${esc((row.emails || []).join('\n'))}</textarea><div class="adduser-hint">Removing an email immediately removes Google-login access for that email.</div></div>${row.tier === 'CK_' ? `<div id="ckm-cfg-perms">${permissionPanel(state)}</div>` : ''}${!row.google_ready ? '<div class="adduser-field" style="margin-top:.75rem"><label for="ckm-cfg-raw">Original raw key</label><input id="ckm-cfg-raw" class="ask-input" type="password" autocomplete="off" placeholder="Required once only when adding Google email"><div class="adduser-hint">Older keys need the original raw key once so Google login can be enabled safely.</div></div>' : ''}<div id="ckm-cfg-status" class="ckm-status"></div><div class="ckm-config-actions"><button type="button" id="ckm-cfg-cancel" class="btn">Cancel</button><button type="button" id="ckm-cfg-save" class="ask-submit">Save & Verify</button></div></div>`;
    document.body.appendChild(overlay);
    if (row.tier === 'CK_') bindSwitches($('ckm-cfg-perms'), state);
    $('ckm-cfg-cancel').onclick = () => overlay.remove();
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    $('ckm-cfg-save').onclick = async () => {
      const save = $('ckm-cfg-save'), status = $('ckm-cfg-status'), card = overlay.querySelector('.ckm-config');
      status.className = 'ckm-status'; status.textContent = 'Saving…'; save.disabled = true; card.classList.add('ckm-busy');
      try {
        const payload = {
          label: $('ckm-cfg-label').value.trim(),
          emails: parseEmails($('ckm-cfg-emails').value),
          permissions: row.tier === 'CK_' ? normalizePermissions(state) : {},
        };
        const raw = $('ckm-cfg-raw')?.value.trim();
        if (raw) payload.raw_key = raw;
        const saved = await admin(`/${row.key_id}/config`, {method:'POST', body:JSON.stringify(payload)});
        if (row.tier === 'CK_' && !samePermissions(saved.permissions, state)) throw new Error('Server verification failed: CK switches did not save correctly');
        if (JSON.stringify([...(saved.emails || [])].sort()) !== JSON.stringify([...payload.emails].sort())) throw new Error('Server verification failed: linked emails did not save correctly');
        status.className = 'ckm-status ok'; status.textContent = 'Saved and verified.';
        await refreshKeys();
        setTimeout(() => overlay.isConnected && overlay.remove(), 350);
        if (typeof toast === 'function') toast('Key configuration saved');
      } catch (err) {
        status.className = 'ckm-status err'; status.textContent = err.message || 'Save failed';
      } finally { save.disabled = false; card.classList.remove('ckm-busy'); }
    };
  }

  async function refreshKeys() {
    const a = currentAccount();
    if (a?.tier !== 'DEV') return;
    const body = $('keys-table')?.querySelector('tbody');
    try {
      keyRows = await admin('/keys');
      if (!Array.isArray(keyRows)) keyRows = [];
      const head = $('keys-table')?.querySelector('thead tr');
      if (head) head.innerHTML = '<th>Tier</th><th>Label</th><th>Key ID</th><th>Google / CK</th><th>Status</th><th>Created</th><th>Actions</th>';
      if (!body) return;
      body.innerHTML = keyRows.length ? keyRows.map(row => {
        const labels = row.tier === 'CK_' ? enabledLabels(row.permissions) : [];
        return `<tr><td>${esc(row.tier)}</td><td>${esc(row.key_label || '—')}</td><td><code>${esc(row.key_id)}</code></td><td><div class="ckm-key-meta">${row.emails?.length ? row.emails.map(email => `<div>${esc(email)}</div>`).join('') : 'No linked email'}${row.tier === 'CK_' ? `<div style="margin-top:.2rem">${labels.length ? labels.map(x => `<span class="ckm-chip">${esc(x)}</span>`).join('') : '<b>All features disabled</b>'}</div>` : ''}${row.google_ready ? '<div>Google ready</div>' : ''}</div></td><td>${row.active ? 'Active' : 'Revoked'}</td><td>${typeof fmtHistTs === 'function' ? fmtHistTs(row.created_at) : esc(row.created_at || '—')}</td><td><div class="key-action-row"><button type="button" class="btn" data-ckm-config="${row.key_id}">Configure</button><button type="button" class="btn ${row.active ? 'danger' : ''}" data-ckm-active="${row.key_id}" data-action="${row.active ? 'revoke' : 'reactivate'}">${row.active ? 'Revoke' : 'Reactivate'}</button></div></td></tr>`;
      }).join('') : '<tr><td colspan="7" class="empty">No generated keys</td></tr>';
      body.querySelectorAll('[data-ckm-config]').forEach(btn => btn.onclick = () => openConfig(keyRows.find(row => String(row.key_id) === String(btn.dataset.ckmConfig))));
      body.querySelectorAll('[data-ckm-active]').forEach(btn => btn.onclick = async () => {
        btn.disabled = true;
        try { await admin(`/${btn.dataset.ckmActive}/${btn.dataset.action}`, {method:'POST', body:'{}'}); await refreshKeys(); }
        catch (err) { if (typeof toast === 'function') toast(err.message); btn.disabled = false; }
      });
    } catch (err) {
      if (body) body.innerHTML = `<tr><td colspan="7" class="empty">${esc(err.message || 'Could not load keys')}</td></tr>`;
      if (typeof toast === 'function') toast(err.message || 'Could not load keys');
    }
  }

  async function refreshCkAccount() {
    const a = currentAccount();
    if (accountRefreshBusy || a?.tier !== 'CK_' || document.visibilityState === 'hidden' || typeof api !== 'function') return;
    accountRefreshBusy = true;
    try {
      const fresh = await api('/auth', {method:'POST'});
      if (!fresh || fresh.tier !== 'CK_') return;
      const changed = JSON.stringify(normalizePermissions(a.features)) !== JSON.stringify(normalizePermissions(fresh.features)) || JSON.stringify(a.tabs || []) !== JSON.stringify(fresh.tabs || []) || !!a.can_join !== !!fresh.can_join;
      if (!changed) return;
      account = fresh;
      if (typeof applyTier === 'function') applyTier();
      if (typeof buildNav === 'function') buildNav();
      window.LGAuth?.applyGuards?.();
      const allowed = new Set(fresh.tabs || []);
      if (typeof activePage !== 'undefined' && !allowed.has(activePage) && !(['cards','mc'].includes(activePage) && fresh.features?.[activePage] !== false)) {
        const next = fresh.tabs?.[0];
        if (next && typeof switchPage === 'function') await switchPage(next);
      }
    } catch (err) { console.warn('CK permission refresh failed', err); }
    finally { accountRefreshBusy = false; }
  }

  function install() {
    if (installed) return;
    installed = true;
    injectStyles();
    buildGenerator();
    window.refreshKeys = refreshKeys;
    window.LGCKManager = {refreshKeys, refreshAccount:refreshCkAccount, normalizePermissions};
    setInterval(refreshCkAccount, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshCkAccount(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 0), {once:true});
  else setTimeout(install, 0);
})();
