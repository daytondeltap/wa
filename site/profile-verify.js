(() => {
  const VERIFY_API = 'https://jwjxhxvahgrpkvaoyrzw.supabase.co/functions/v1/lg-card-verify';
  const S = { status: null, busy: false, timer: null, lastMessage: '' };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const toastSafe = message => { try { toast(message); } catch { console.log(message); } };

  function hasKey() {
    try { return typeof SITE_KEY === 'string' && SITE_KEY.trim().length > 0; }
    catch { return false; }
  }

  async function vapi(path, opts = {}) {
    const headers = new Headers(opts.headers || {});
    headers.set('x-site-key', SITE_KEY);
    if (opts.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(VERIFY_API + path, { ...opts, headers });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const e = new Error(data.error || data.detail || `Verification request failed (${response.status})`);
      e.status = response.status;
      throw e;
    }
    return data;
  }

  function injectStyles() {
    if ($('lg-profile-verify-style')) return;
    const style = document.createElement('style');
    style.id = 'lg-profile-verify-style';
    style.textContent = `
      .pv-wrap{border:1px solid var(--border);border-radius:7px;padding:.8rem;background:rgba(0,0,0,.12)}
      .pv-grid{display:grid;grid-template-columns:1fr auto;gap:.55rem;align-items:end}
      .pv-label{font-family:var(--font-mono);font-size:.52rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.25rem}
      .pv-account{display:flex;align-items:center;gap:.65rem;min-width:0}
      .pv-avatar{width:46px;height:46px;object-fit:cover;border:1px solid var(--border);border-radius:6px;background:var(--bg)}
      .pv-code{font-family:var(--font-mono);font-weight:800;font-size:1.1rem;letter-spacing:.12em;border:1px dashed var(--accent2);border-radius:5px;padding:.58rem .7rem;display:inline-block;background:var(--bg);user-select:all}
      .pv-actions{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.65rem}
      .pv-note{font-family:var(--font-mono);font-size:.56rem;color:var(--subtext);line-height:1.55;margin-top:.45rem}
      .pv-state{font-family:var(--font-mono);font-size:.55rem;color:var(--accent2);margin-top:.45rem;min-height:.9rem}
      @media(max-width:680px){.pv-grid{grid-template-columns:1fr}.pv-grid .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function challengeMarkup(ch) {
    const expiry = new Date(ch.expires_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    return `<div id="pv-root" class="pv-wrap">
      <div class="pv-account">
        ${ch.avatar_url ? `<img class="pv-avatar" src="${esc(ch.avatar_url)}" alt="">` : '<div class="pv-avatar"></div>'}
        <div style="min-width:0;flex:1"><div class="cg-title">${esc(ch.username)}</div><div class="cg-sub">${esc(ch.display_name || '')} · Roblox ID ${Number(ch.user_id)}</div></div>
      </div>
      <div class="pv-note">Put this code anywhere in the <b>About</b> description on this Roblox profile. Keep this page open; LG checks automatically. You can remove the code as soon as verification succeeds.</div>
      <div style="margin-top:.65rem"><div class="pv-label">Your verification code</div><span class="pv-code" id="pv-code">${esc(ch.verification_code)}</span></div>
      <div class="pv-actions">
        <button class="btn" id="pv-copy">Copy code</button>
        <button class="btn" id="pv-profile">Open Roblox profile</button>
        <button class="btn" id="pv-check">I've added it · Verify</button>
        <button class="btn" id="pv-cancel">Use another account</button>
      </div>
      <div class="pv-note">Code expires at ${esc(expiry)}. Roblox profile changes can take a short moment to appear publicly.</div>
      <div class="pv-state" id="pv-state">Waiting for the code to appear…</div>
    </div>`;
  }

  function startMarkup() {
    return `<div id="pv-root" class="pv-wrap">
      <div class="cg-sub"><b>Link your Roblox account.</b> Enter your Roblox username. LG will give you a short profile code to place temporarily in your Roblox About section. No Roblox password, OAuth app, Discord, or verification game is needed.</div>
      <div class="pv-grid" style="margin-top:.65rem">
        <div><div class="pv-label">Roblox username</div><input id="pv-username" class="cg-input" style="width:100%" maxlength="20" autocomplete="off" placeholder="Roblox username"></div>
        <button class="btn" id="pv-start">Get verification code</button>
      </div>
      <div class="pv-state" id="pv-state"></div>
    </div>`;
  }

  function renderVerifier() {
    const host = $('cg-profile');
    if (!host || !S.status || S.status.verified) return;
    const ch = S.status.challenge;
    const desiredKey = ch ? `challenge:${ch.verification_code}` : 'start';
    const current = $('pv-root');
    if (current?.dataset?.key === desiredKey) return;
    host.innerHTML = ch ? challengeMarkup(ch) : startMarkup();
    $('pv-root').dataset.key = desiredKey;

    if (!ch) {
      const begin = () => startVerification();
      $('pv-start').onclick = begin;
      $('pv-username').addEventListener('keydown', e => { if (e.key === 'Enter') begin(); });
      setTimeout(() => $('pv-username')?.focus(), 0);
    } else {
      $('pv-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(ch.verification_code); toastSafe('Verification code copied'); }
        catch { toastSafe('Select the code and copy it manually'); }
      };
      $('pv-profile').onclick = () => window.open(ch.profile_url, '_blank', 'noopener,noreferrer');
      $('pv-check').onclick = () => checkVerification(false);
      $('pv-cancel').onclick = cancelVerification;
    }
    scheduleAutoCheck();
  }

  async function startVerification() {
    if (S.busy) return;
    const username = $('pv-username')?.value.trim() || '';
    const state = $('pv-state');
    try {
      S.busy = true;
      if (state) state.textContent = 'Finding Roblox account…';
      const result = await vapi('/start', { method:'POST', body:JSON.stringify({ username }) });
      S.status = { ...(S.status || {}), verified:false, challenge:result.challenge };
      renderVerifier();
    } catch (e) {
      if (state) state.textContent = e.message;
      else toastSafe(e.message);
    } finally { S.busy = false; }
  }

  async function checkVerification(automatic) {
    if (S.busy || !S.status?.challenge) return;
    const state = $('pv-state');
    try {
      S.busy = true;
      if (state && !automatic) state.textContent = 'Checking Roblox profile…';
      const result = await vapi('/check', { method:'POST' });
      if (result.verified) {
        clearInterval(S.timer); S.timer = null;
        sessionStorage.setItem('lg-profile-verified', '1');
        location.reload();
        return;
      }
      if (state) state.textContent = result.message || 'Code not visible yet. LG will keep checking.';
    } catch (e) {
      if (e.status !== 429 && !automatic) {
        if (state) state.textContent = e.message;
        else toastSafe(e.message);
      }
      if (e.status === 410) await syncStatus(true);
    } finally { S.busy = false; }
  }

  async function cancelVerification() {
    if (S.busy) return;
    try {
      S.busy = true;
      await vapi('/cancel', { method:'POST' });
      await syncStatus(true);
    } catch (e) { toastSafe(e.message); }
    finally { S.busy = false; }
  }

  function scheduleAutoCheck() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    if (!S.status?.challenge || S.status?.verified) return;
    S.timer = setInterval(() => {
      if (document.visibilityState === 'visible' && $('page-cards')?.classList.contains('active') && $('pv-root')) checkVerification(true);
    }, 7000);
  }

  function patchGuide() {
    const guide = $('cg-guide');
    if (!guide) return;
    for (const box of guide.querySelectorAll('.cg-guide > div')) {
      const h = box.querySelector('h4');
      if (h?.textContent.trim() === 'Roblox verification') {
        const p = box.querySelector('p');
        if (p && !p.dataset.profileCodePatched) {
          p.textContent = 'Enter your Roblox username, place the temporary LG code in your Roblox About description, and let LG confirm it from the public profile. One Roblox account can only be linked to one Cards client.';
          p.dataset.profileCodePatched = '1';
        }
      }
    }
  }

  function patchDev() {
    const dev = $('cg-dev');
    if (!dev) return;
    for (const panel of dev.querySelectorAll('.cg-dev-grid > .cg-panel')) {
      if (panel.textContent.includes('Roblox OAuth')) {
        panel.innerHTML = `<div class="sec-title">Roblox Profile Verification</div><div class="cg-sub">No OAuth setup is required. Users verify by placing a temporary LG code in their Roblox About description. Verification challenges expire after 15 minutes.</div>`;
      }
    }
  }

  function patchViews() {
    if (S.status && !S.status.verified) renderVerifier();
    patchGuide();
    patchDev();
  }

  async function syncStatus(silent = false) {
    if (!hasKey()) return;
    try {
      S.status = await vapi('/status');
      patchViews();
      scheduleAutoCheck();
    } catch (e) { if (!silent) console.warn('LG profile verification:', e); }
  }

  function boot() {
    injectStyles();
    if (sessionStorage.getItem('lg-profile-verified') === '1') {
      sessionStorage.removeItem('lg-profile-verified');
      setTimeout(() => toastSafe('Roblox account verified — your Cards packs are ready'), 150);
    }
    const root = $('page-cards');
    if (root) {
      const observer = new MutationObserver(() => patchViews());
      observer.observe(root, { childList:true, subtree:true });
    }
    syncStatus(true);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncStatus(true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
