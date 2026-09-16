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

  async function directAuth(raw) {
    const inferred = tierFromRaw(raw);
    if (!inferred) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const r = await nativeFetch(`${API}/auth`, {
        method: 'POST',
        headers: {'x-site-key': raw, 'content-type':'application/json'},
        body: '{}',
        signal: controller.signal,
        cache: 'no-store',
      });
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
      clearTimeout(timer);
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

    // Commit authenticated state immediately. Network/data hydration is deliberately
    // decoupled so a valid UPK can never sit forever on “Signing in…”.
    SITE_KEY = raw;
    account = acct;
    sessionStorage.setItem('lg_site_key', raw);
    $('auth')?.classList.add('hidden');
    $('app')?.classList.remove('hidden');
    if (typeof applyTier === 'function') applyTier();
    if (typeof buildNav === 'function') buildNav();
    try { window.LGAuth?.applyGuards?.(); } catch {}

    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      try {
        if (activePage === 'monitor' && account?.features?.monitor !== false && typeof refreshMonitor === 'function') refreshMonitor(false);
      } catch {}
    }, 10000);

    // Do not block the login promise on secondary data.
    hydrateAfterLogin();
    return true;
  }

  function install() {
    const form = $('login-form');
    if (!form || form.dataset.standardLoginInstalled === '1') return;
    form.dataset.standardLoginInstalled = '1';
    const previousSubmit = form.onsubmit;
    form.onsubmit = async event => {
      const raw = String($('login-key')?.value || '').trim();
      if (!tierFromRaw(raw)) {
        if (typeof previousSubmit === 'function') return previousSubmit.call(form, event);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      try {
        await standardLogin(raw);
      } catch (e) {
        SITE_KEY = '';
        account = null;
        sessionStorage.removeItem('lg_site_key');
        showError(e?.message || 'Sign-in failed');
      }
    };

    const prior = window.LGAuth?.keyLogin;
    if (window.LGAuth) {
      window.LGAuth.keyLogin = async key => {
        if (tierFromRaw(key)) return standardLogin(key);
        return prior ? prior(key) : false;
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  window.LGStandardKeyLogin = {install, standardLogin, directAuth, tierFromRaw};
})();
