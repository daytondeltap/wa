(() => {
  const SB = 'https://jwjxhxvahgrpkvaoyrzw.supabase.co';
  const FAST_EXCHANGE = `${SB}/functions/v1/lg-exchange-summary`;
  const LEGACY_API = `${SB}/functions/v1/lg-api`;
  const nativeFetch = window.LG_NATIVE_FETCH || window.fetch.bind(window);
  const routedFetch = window.fetch.bind(window); // auth-ck gateway-aware fetch
  const inflight = new Map();
  const apiCache = new Map();
  const exchangeCache = new Map();

  const LEGACY_TABS = {
    DEV:  ['monitor','leaderboard','exchange','history','adduser','keys'],
    PK_:  ['monitor','leaderboard','exchange','history','adduser'],
    UPK_: ['monitor','leaderboard','history','adduser'],
    BK_:  ['monitor','leaderboard','adduser'],
  };
  const LEGACY_FEATURES = {
    DEV:  {monitor:true, leaderboard:true, exchange:true, history:true, adduser:true, cards:true, mc:true, join:true, keys:true},
    PK_:  {monitor:true, leaderboard:true, exchange:true, history:true, adduser:true, cards:true, mc:true, join:true, keys:false},
    UPK_: {monitor:true, leaderboard:true, exchange:false, history:true, adduser:true, cards:true, mc:false, join:false, keys:false},
    BK_:  {monitor:true, leaderboard:true, exchange:false, history:false, adduser:true, cards:true, mc:false, join:false, keys:false},
  };

  function currentAccount() {
    try { return typeof account !== 'undefined' ? account : null; } catch { return null; }
  }
  function currentSiteKey() {
    try { return typeof SITE_KEY !== 'undefined' ? String(SITE_KEY || '') : ''; } catch { return ''; }
  }
  function legacyTierFromRaw(raw) {
    const key = String(raw || '').trim();
    if (key.startsWith('UPK_')) return 'UPK_';
    if (key.startsWith('BK_')) return 'BK_';
    if (key.startsWith('PK_')) return 'PK_';
    if (key.startsWith('DEV')) return 'DEV';
    return null;
  }
  function normalizeLegacyAccount(value, rawKey) {
    const tier = String(value?.tier || legacyTierFromRaw(rawKey) || '');
    const features = LEGACY_FEATURES[tier] ? {...LEGACY_FEATURES[tier]} : (value?.features || {});
    const tabs = LEGACY_TABS[tier] ? [...LEGACY_TABS[tier]] : (Array.isArray(value?.tabs) ? value.tabs : []);
    const can_join = tier === 'DEV' || tier === 'PK_';
    return {...(value || {}), tier, tabs, features, can_join, auth_method:'key', email:null};
  }
  function rawUrl(input) {
    try { return typeof input === 'string' || input instanceof URL ? String(input) : input?.url || ''; }
    catch { return ''; }
  }
  function methodOf(input, init) {
    return String(init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  }
  function originalFunction(raw) {
    let u; try { u = new URL(raw, location.href); } catch { return null; }
    if (u.origin !== SB) return null;
    const m = u.pathname.match(/^\/functions\/v1\/(lg-api|lg-cards|lg-card-verify|lg-card-names|lg-card-gifts|lg-mc)(\/.*)?$/);
    return m ? { url:u, slug:m[1], path:m[2] || '/' } : null;
  }
  function useDirectLegacy(raw) {
    const f = originalFunction(raw), a = currentAccount();
    if (!f) return false;
    if (a) {
      if (a.auth_method === 'google' || a.tier === 'CK_') return false;
      if (f.slug === 'lg-api' && /^\/keys(?:\/|$)/.test(f.path)) return false;
      return true;
    }
    // Before /auth succeeds there is no account object yet. Infer only the
    // standard legacy tier prefix from the raw key and let the original Edge
    // Function perform the real hash/active-key authorization check.
    if (!legacyTierFromRaw(currentSiteKey())) return false;
    if (f.slug === 'lg-api' && /^\/keys(?:\/|$)/.test(f.path)) return false;
    return true;
  }
  async function deduped(kind, fn, input, init) {
    if (methodOf(input, init) !== 'GET') return fn(input, init);
    const raw = rawUrl(input), a = currentAccount();
    const key = `${kind}|${a?.key_id || legacyTierFromRaw(currentSiteKey()) || 'boot'}|${raw}`;
    let p = inflight.get(key);
    if (!p) {
      p = Promise.resolve(fn(input, init));
      inflight.set(key, p);
      p.finally(() => setTimeout(() => { if (inflight.get(key) === p) inflight.delete(key); }, 150));
    }
    const response = await p;
    return response.clone();
  }

  // Legacy DEV/PK_/UPK_/BK_ raw keys already authenticate inside each original
  // Edge Function. This now applies during login as well as after login, which
  // removes the circular dependency where /auth required lg-gateway before the
  // frontend knew it was a legacy account. Google and CK still use the gateway.
  window.fetch = function(input, init = {}) {
    const raw = rawUrl(input);
    if (useDirectLegacy(raw)) return deduped('direct', nativeFetch, input, init);
    return deduped('routed', routedFetch, input, init);
  };

  async function directLegacyAccount(path, opts = {}) {
    const raw = currentSiteKey().trim();
    const tier = legacyTierFromRaw(raw);
    if (!tier) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const headers = new Headers(opts.headers || {});
      headers.set('x-site-key', raw);
      if (opts.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
      const r = await nativeFetch(`${LEGACY_API}${path}`, {...opts, headers, signal:controller.signal});
      let j = null; try { j = await r.json(); } catch {}
      if (r.status === 401) throw new Error('Access key rejected');
      if (!r.ok) throw new Error(j?.error || j?.detail || `Login request failed (${r.status})`);
      return normalizeLegacyAccount(j, raw);
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('Login timed out. Check your connection and try again.');
      throw e;
    } finally { clearTimeout(timer); }
  }

  function authHeaders() {
    const h = new Headers(), a = currentAccount();
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
  async function fastExchange(path) {
    const now = Date.now(), a = currentAccount();
    const ttl = path.startsWith('/history') ? 30000 : 18000;
    const cacheKey = `${a?.key_id || ''}|${path}`;
    const hit = exchangeCache.get(cacheKey);
    if (hit?.data && hit.until > now) return hit.data;
    if (hit?.promise) return hit.promise;
    const p = (async () => {
      const r = await nativeFetch(FAST_EXCHANGE + path, { headers: authHeaders() });
      let j = null; try { j = await r.json(); } catch {}
      if (!r.ok) throw new Error(j?.error || j?.detail || `Exchange request failed (${r.status})`);
      exchangeCache.set(cacheKey, { data:j, until:Date.now()+ttl });
      return j;
    })();
    exchangeCache.set(cacheKey, { promise:p, until:0 });
    try { return await p; }
    finally {
      const x = exchangeCache.get(cacheKey);
      if (x?.promise === p && !x.data) exchangeCache.delete(cacheKey);
    }
  }

  const baseApi = window.api;
  if (typeof baseApi === 'function') {
    const ttlFor = path => {
      if (path === '/monitor/totals' || path.startsWith('/monitor/charts') || path.startsWith('/monitor/top_games')) return 30000;
      if (path.startsWith('/monitor/sessions') || path.startsWith('/monitor/events')) return 20000;
      if (path === '/leaderboard') return 15000;
      if (path.startsWith('/exchange/orderbook') || path === '/exchange/tape') return 12000;
      return 0;
    };
    const optimizedApi = async function(path, opts = {}) {
      const method = String(opts.method || 'GET').toUpperCase();
      if ((path === '/auth' || path === '/account') && legacyTierFromRaw(currentSiteKey())) {
        const direct = await directLegacyAccount(path, opts);
        if (direct) return direct;
      }
      if (method === 'GET' && path === '/exchange/markets') {
        try { return await fastExchange('/markets'); }
        catch (e) { console.warn('LG fast market summary fallback', e); return baseApi(path, opts); }
      }
      if (method === 'GET' && path.startsWith('/exchange/history?')) {
        try { return await fastExchange('/history?' + path.split('?')[1]); }
        catch (e) { console.warn('LG sampled history fallback', e); return baseApi(path, opts); }
      }
      const ttl = method === 'GET' ? ttlFor(path) : 0;
      if (!ttl) {
        if (method !== 'GET') { apiCache.clear(); exchangeCache.clear(); }
        return baseApi(path, opts);
      }
      const a = currentAccount(), key = `${a?.key_id || ''}|${path}`;
      const now = Date.now(), hit = apiCache.get(key);
      if (hit?.data !== undefined && hit.until > now) return hit.data;
      if (hit?.promise) return hit.promise;
      const p = Promise.resolve(baseApi(path, opts)).then(data => {
        apiCache.set(key, { data, until:Date.now()+ttl });
        return data;
      });
      apiCache.set(key, { promise:p, until:0 });
      try { return await p; }
      finally {
        const x=apiCache.get(key);
        if (x?.promise===p && x.data===undefined) apiCache.delete(key);
      }
    };
    window.api = optimizedApi;
  }

  window.addEventListener('pageshow', () => { apiCache.clear(); exchangeCache.clear(); }, {passive:true});
  window.LGEgressRuntime = {legacyTierFromRaw, normalizeLegacyAccount};
})();
