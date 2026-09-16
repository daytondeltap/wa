(() => {
  const SB = 'https://jwjxhxvahgrpkvaoyrzw.supabase.co';
  const API = `${SB}/functions/v1/lg-api`;
  const nativeFetch = window.LG_NATIVE_FETCH || window.fetch.bind(window);
  const STANDARD = {
    DEV:  {tabs:['monitor','leaderboard','exchange','history','adduser','keys'], features:{monitor:true,leaderboard:true,exchange:true,history:true,adduser:true,cards:true,mc:true,join:true,keys:true}},
    PK_:  {tabs:['monitor','leaderboard','exchange','history','adduser'], features:{monitor:true,leaderboard:true,exchange:true,history:true,adduser:true,cards:true,mc:true,join:true,keys:false}},
    UPK_: {tabs:['monitor','leaderboard','history','adduser'], features:{monitor:true,leaderboard:true,exchange:false,history:true,adduser:true,cards:true,mc:false,join:false,keys:false}},
    BK_:  {tabs:['monitor','leaderboard','adduser'], features:{monitor:true,leaderboard:true,exchange:false,history:false,adduser:true,cards:true,mc:false,join:false,keys:false}},
  };

  const $ = id => document.getElementById(id);
  const tierFromRaw = raw => {
    const k = String(raw || '').trim();
    if (k.startsWith('UPK_')) return 'UPK_';
    if (k.startsWith('BK_')) return 'BK_';
    if (k.startsWith('PK_')) return 'PK_';
    if (k.startsWith('DEV')) return 'DEV';
    return null;
  };
  const bootKey = String(window.LG_LEGACY_SITE_KEY || sessionStorage.getItem('lg_site_key') || '').trim();
  const bootTier = tierFromRaw(bootKey);

  const withTimeout = (promise, ms, label) => {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); }),
    ]).finally(() => clearTimeout(timer));
  };
  const showError = msg => {
    const e = $('login-error');
    if (!e) return;
    e.textContent = String(msg || 'Sign-in failed');
    e.classList.remove('hidden');
  };
  const hideError = () => $('login-error')?.classList.add('hidden');
  const restoreButton = () => {
    const button = $('login-form')?.querySelector('button[type="submit"]');
    if (!button) return;
    button.disabled = false;
    button.textContent = button.dataset.lgOriginalText || 'Access System';
  };

  async function directAuth(raw) {
    const inferred = tierFromRaw(raw);
    if (!inferred) return null;
    const controller = new AbortController();
    let timeoutId;
    try {
      const request = nativeFetch(`${API}/auth`, {
        method: 'POST',
        headers: {'x-site-key': raw, 'content-type':'application/json'},
        body: '{}',
        signal: controller.signal,
        cache: 'no-store',
      });
      const r = await Promise.race([
        request,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error('Sign-in timed out. Please try again.'));
          }, 6500);
        }),
      ]);
      let body = null;
      try { body = await r.json(); } catch {}
      if (r.status === 401) throw new Error('Access key rejected');
      if (!r.ok) throw new Error(body?.error || body?.detail || `Sign-in failed (${r.status})`);
      const tier = String(body?.tier || '');
      if (!STANDARD[tier]) throw new Error('This key is not a standard LG key');
      if (tier !== inferred) throw new Error('Access key tier mismatch');
      const canonical = STANDARD[tier];
      return {
        ...(body || {}),
        tier,
        tabs: [...canonical.tabs],
        features: {...canonical.features},
        can_join: tier === 'DEV' || tier === 'PK_',
        auth_method: 'key',
        email: null,
      };
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('Sign-in timed out. Please try again.');
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function hydrateAfterLogin() {
    try {
      await withTimeout(typeof refreshTracked === 'function' ? refreshTracked() : null, 5000, 'Tracked users');
    } catch (e) {
      console.warn('[LG login] tracked-user hydration failed', e);
    }
    try {
      const first = Array.isArray(account?.tabs) ? account.tabs[0] : null;
      if (first && typeof switchPage === 'function') await withTimeout(switchPage(first), 7000, 'Initial page');
      else {
        activePage = 'monitor';
        $('page-monitor')?.classList.add('active');
      }
    } catch (e) {
      console.warn('[LG login] page hydration failed', e);
      const first = Array.isArray(account?.tabs) ? (account.tabs[0] || 'monitor') : 'monitor';
      activePage = first;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      $(`page-${first}`)?.classList.add('active');
      document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === first));
      if (typeof toast === 'function') toast('Signed in. Some data is still loading.');
    }
  }

  async function standardLogin(rawInput) {
    const raw = String(rawInput || '').trim();
    const inferred = tierFromRaw(raw);
    if (!inferred) return false;
    hideError();
    const acct = await directAuth(raw);

    // Commit authenticated state immediately. Nothing after /auth is allowed to
    // convert a valid standard key back into a login-screen failure.
    SITE_KEY = raw;
    account = acct;
    sessionStorage.setItem('lg_site_key', raw);
    window.LG_LEGACY_SITE_KEY = raw;
    $('auth')?.classList.add('hidden');
    $('app')?.classList.remove('hidden');
    try { if (typeof applyTier === 'function') applyTier(); } catch (e) { console.warn('[LG login] tier UI failed', e); }
    try { if (typeof buildNav === 'function') buildNav(); } catch (e) { console.warn('[LG login] nav UI failed', e); }
    try { window.LGAuth?.applyGuards?.(); } catch (e) { console.warn('[LG login] guard UI failed', e); }

    try {
      clearInterval(refreshTimer);
      refreshTimer = setInterval(() => {
        try {
          if (activePage === 'monitor' && account?.features?.monitor !== false && typeof refreshMonitor === 'function') refreshMonitor(false);
        } catch {}
      }, 10000);
    } catch (e) {
      console.warn('[LG login] refresh timer setup failed', e);
    }

    restoreButton();
    // Do not block the login promise on secondary data.
    void hydrateAfterLogin();
    return true;
  }

  function resetFailedLogin(message) {
    try { SITE_KEY = ''; } catch {}
    try { account = null; } catch {}
    sessionStorage.removeItem('lg_site_key');
    showError(message || 'Sign-in failed');
    $('app')?.classList.add('hidden');
    $('auth')?.classList.remove('hidden');
    restoreButton();
  }

  function install() {
    const form = $('login-form');
    if (!form || form.dataset.standardLoginInstalled === '1') return;
    form.dataset.standardLoginInstalled = '1';
    const button = form.querySelector('button[type="submit"]');
    if (button && !button.dataset.lgOriginalText) button.dataset.lgOriginalText = button.textContent || 'Access System';

    // Capture-phase ownership prevents auth-ck's older target/bubble handler from
    // also running for standard keys. stopImmediatePropagation is intentional.
    form.addEventListener('submit', event => {
      const raw = String($('login-key')?.value || '').trim();
      if (!tierFromRaw(raw)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void standardLogin(raw).catch(e => resetFailedLogin(e?.message || 'Sign-in failed'));
    }, {capture:true});

    const prior = window.LGAuth?.keyLogin;
    if (window.LGAuth) {
      window.LGAuth.keyLogin = async key => {
        if (tierFromRaw(key)) return standardLogin(key);
        return prior ? prior(key) : false;
      };
    }
  }

  // The form already exists because this file is injected at the end of <body>.
  // Install synchronously so auth-ck's already-scheduled setTimeout(0) cannot win
  // the race and enter its older hydration-blocking keyLogin path.
  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});

  if (bootTier) {
    // Neutralize auth-ck's private legacy bootstrap inputs before its timer fires.
    // This module then restores the key only after direct /auth succeeds.
    window.LG_LEGACY_SITE_KEY = '';
    sessionStorage.removeItem('lg_site_key');
    setTimeout(() => {
      const authVisible = !$('auth')?.classList.contains('hidden');
      if (!authVisible || account) return;
      void standardLogin(bootKey).catch(e => resetFailedLogin(e?.message || 'Saved key sign-in failed'));
    }, 0);
  }

  window.LGStandardKeyLogin = {install, standardLogin, directAuth, tierFromRaw};
})();
