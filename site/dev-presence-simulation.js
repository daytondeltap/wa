(() => {
  const $ = id => document.getElementById(id);
  let overrides = new Map();

  function allowed() {
    try { return typeof account !== 'undefined' && account?.tier === 'DEV'; }
    catch { return false; }
  }

  function ensureStyles() {
    if ($('lg-override-css')) return;
    const s = document.createElement('style');
    s.id = 'lg-override-css';
    s.textContent = `
      #lg-override-open{margin-left:auto}
      .lg-override-overlay{position:fixed;inset:0;z-index:1500;background:rgba(4,5,12,.76);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:1rem}
      .lg-override-overlay.hidden{display:none!important}
      .lg-override-modal{width:min(560px,100%);background:linear-gradient(180deg,rgba(16,17,27,.98),rgba(10,11,20,.98));border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,.45);overflow:hidden}
      .lg-override-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:1.15rem 1.2rem;border-bottom:1px solid var(--border)}
      .lg-override-title{font-size:.95rem;font-weight:800;letter-spacing:.02em}
      .lg-override-sub{font-family:var(--font-mono);font-size:.62rem;color:var(--muted);margin-top:.25rem}
      .lg-override-close{border:0;background:transparent;color:var(--subtext);font-size:1.1rem;cursor:pointer;padding:.1rem .35rem}
      .lg-override-body{padding:1.15rem 1.2rem;display:grid;gap:1rem}
      .lg-override-grid{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
      .lg-override-field{display:flex;flex-direction:column;gap:.35rem}
      .lg-override-field.full{grid-column:1/-1}
      .lg-override-field label{font-family:var(--font-mono);font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;color:var(--subtext)}
      .lg-override-field input,.lg-override-field select{width:100%;font-family:var(--font-mono);font-size:.74rem;background:#0b0c14;color:var(--text);border:1px solid var(--border);padding:.55rem .65rem;border-radius:6px;outline:none}
      .lg-override-field input:focus,.lg-override-field select:focus{border-color:var(--accent2)}
      .lg-override-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;border:1px solid var(--border);border-radius:8px;padding:.7rem .8rem;background:rgba(255,255,255,.015)}
      .lg-override-row strong{font-size:.72rem}
      .lg-override-row span{font-family:var(--font-mono);font-size:.58rem;color:var(--muted)}
      .lg-override-switch{display:flex;align-items:center;gap:.5rem;font-family:var(--font-mono);font-size:.68rem;color:var(--subtext)}
      .lg-override-actions{display:flex;justify-content:flex-end;gap:.6rem;padding:1rem 1.2rem;border-top:1px solid var(--border);background:rgba(255,255,255,.015)}
      .lg-override-actions .btn{min-width:120px}
      .lg-override-state{font-family:var(--font-mono);font-size:.6rem;color:var(--muted)}
      .lg-override-state.active{color:var(--accent2)}
      .lg-override-hidden{display:none!important}
      @media(max-width:620px){.lg-override-grid{grid-template-columns:1fr}.lg-override-field.full{grid-column:auto}.lg-override-actions{flex-direction:column-reverse}.lg-override-actions .btn{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function ensureUI() {
    ensureStyles();

    const bar = document.querySelector('#page-monitor .filter-bar');
    if (bar && !$('lg-override-open')) {
      const b = document.createElement('button');
      b.id = 'lg-override-open';
      b.type = 'button';
      b.className = 'btn';
      b.textContent = 'Status Override';
      b.hidden = true;
      b.onclick = openModal;
      bar.appendChild(b);
    }

    if (!$('lg-override-overlay')) {
      const wrap = document.createElement('div');
      wrap.id = 'lg-override-overlay';
      wrap.className = 'lg-override-overlay hidden';
      wrap.innerHTML = `
        <div class="lg-override-modal" role="dialog" aria-modal="true" aria-labelledby="lg-override-title">
          <div class="lg-override-head">
            <div>
              <div class="lg-override-title" id="lg-override-title">Roblox Presence Override</div>
              <div class="lg-override-sub">Fallback control for detector outages</div>
            </div>
            <button class="lg-override-close" id="lg-override-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="lg-override-body">
            <div class="lg-override-grid">
              <div class="lg-override-field full">
                <label>Player</label>
                <select id="lg-override-user"></select>
              </div>
              <div class="lg-override-field">
                <label>Status</label>
                <select id="lg-override-status">
                  <option value="OFFLINE">Offline</option>
                  <option value="WEBSITE">Website / Idle</option>
                  <option value="IN_GAME">In Game</option>
                </select>
              </div>
              <div class="lg-override-field lg-game-only">
                <label>Game name</label>
                <input id="lg-override-game" maxlength="120" placeholder="e.g. Arsenal">
              </div>
            </div>

            <div class="lg-override-row lg-game-only">
              <div>
                <strong>Join support</strong>
                <div><span>Provide place / instance data for the existing Join flow</span></div>
              </div>
              <label class="lg-override-switch"><input id="lg-override-join" type="checkbox"> Enabled</label>
            </div>

            <div class="lg-override-grid lg-join-only">
              <div class="lg-override-field">
                <label>Place ID</label>
                <input id="lg-override-place" inputmode="numeric" placeholder="Required for Join">
              </div>
              <div class="lg-override-field">
                <label>Instance / Job ID</label>
                <input id="lg-override-job" maxlength="160" placeholder="Optional">
              </div>
            </div>

            <div id="lg-override-state" class="lg-override-state">Detector is active for this player</div>
          </div>
          <div class="lg-override-actions">
            <button class="btn danger" id="lg-override-revert" type="button">Revert to Detector</button>
            <button class="btn btn-accent" id="lg-override-set" type="button">Apply Override</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);

      $('lg-override-close').onclick = closeModal;
      $('lg-override-status').onchange = syncFields;
      $('lg-override-join').onchange = syncFields;
      $('lg-override-user').onchange = loadSelected;
      $('lg-override-set').onclick = setOverride;
      $('lg-override-revert').onclick = revertOverride;
      wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
      addEventListener('keydown', e => { if (e.key === 'Escape' && !$('lg-override-overlay')?.classList.contains('hidden')) closeModal(); });
    }

    updateVisibility();
  }

  function updateVisibility() {
    const b = $('lg-override-open');
    if (b) b.hidden = !allowed();
  }

  function syncFields() {
    const inGame = $('lg-override-status')?.value === 'IN_GAME';
    const join = inGame && $('lg-override-join')?.checked;
    document.querySelectorAll('.lg-game-only').forEach(el => el.classList.toggle('lg-override-hidden', !inGame));
    document.querySelectorAll('.lg-join-only').forEach(el => el.classList.toggle('lg-override-hidden', !join));
  }

  function loadSelected() {
    const id = Number($('lg-override-user')?.value || 0);
    const o = overrides.get(id);
    const status = o ? (Number(o.presence_type) === 2 ? 'IN_GAME' : Number(o.presence_type) === 1 ? 'WEBSITE' : 'OFFLINE') : 'OFFLINE';

    $('lg-override-status').value = status;
    $('lg-override-game').value = o?.last_location || '';
    $('lg-override-join').checked = Boolean(o?.join_enabled);
    $('lg-override-place').value = o?.place_id || '';
    $('lg-override-job').value = o?.game_id || '';
    $('lg-override-revert').disabled = !o;

    const state = $('lg-override-state');
    if (o) {
      state.textContent = 'Manual override is active for this player';
      state.classList.add('active');
    } else {
      state.textContent = 'Detector is active for this player';
      state.classList.remove('active');
    }

    syncFields();
  }

  async function load() {
    if (!allowed()) return;
    const [targets, list] = await Promise.all([
      api('/dev/presence-targets'),
      api('/dev/presence-overrides')
    ]);

    overrides = new Map((Array.isArray(list) ? list : []).map(x => [Number(x.user_id), x]));
    const select = $('lg-override-user');
    const previous = Number(select?.value || 0);
    const rows = Array.isArray(targets) ? targets : [];

    select.innerHTML = rows.map(x => `<option value="${Number(x.id)}">${esc(x.name)} (${Number(x.id)})</option>`).join('');
    if (previous && rows.some(x => Number(x.id) === previous)) select.value = String(previous);
    loadSelected();
  }

  async function openModal() {
    if (!allowed()) return;
    try {
      await load();
      $('lg-override-overlay').classList.remove('hidden');
    } catch (e) {
      toast(e?.message || 'Could not load override controls');
    }
  }

  function closeModal() {
    $('lg-override-overlay')?.classList.add('hidden');
  }

  async function setOverride() {
    const id = Number($('lg-override-user')?.value || 0);
    if (!id) return;

    const status = $('lg-override-status').value;
    const inGame = status === 'IN_GAME';
    const joinable = inGame && $('lg-override-join').checked;
    const payload = {
      status,
      game_name: inGame ? $('lg-override-game').value.trim() : '',
      joinable,
      place_id: joinable ? Number($('lg-override-place').value || 0) || null : null,
      game_id: joinable ? $('lg-override-job').value.trim() || null : null
    };

    const btn = $('lg-override-set');
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Applying…';

    try {
      const result = await api('/dev/presence-overrides/' + id, {method:'POST', body:JSON.stringify(payload)});
      await load();
      if (typeof refreshMonitor === 'function') setTimeout(() => refreshMonitor(false), 250);
      toast(result?.sync?.pending ? 'Override saved; detector sync pending' : 'Override applied');
    } catch (e) {
      toast(e?.message || 'Override failed');
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  async function revertOverride() {
    const id = Number($('lg-override-user')?.value || 0);
    if (!id || !overrides.has(id)) return;

    const btn = $('lg-override-revert');
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Reverting…';

    try {
      const result = await api('/dev/presence-overrides/' + id, {method:'DELETE'});
      overrides.delete(id);
      loadSelected();
      if (typeof refreshMonitor === 'function') {
        await Promise.resolve(refreshMonitor(false)).catch(() => {});
        setTimeout(() => refreshMonitor(false), 450);
      }
      toast(result?.sync?.pending ? 'Override cleared; detector refresh pending' : 'Detector restored');
    } catch (e) {
      toast(e?.message || 'Revert failed');
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  function boot() {
    ensureUI();
    const app = $('app');
    if (app) new MutationObserver(updateVisibility).observe(app, {attributes:true, attributeFilter:['class']});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) updateVisibility(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();

  window.LGPresenceOverride = {open:openModal, refreshVisibility:updateVisibility};
})();