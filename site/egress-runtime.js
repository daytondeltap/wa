(() => {
  const SB = 'https://jwjxhxvahgrpkvaoyrzw.supabase.co';
  const FAST_EXCHANGE = `${SB}/functions/v1/lg-exchange-summary`;
  const nativeFetch = window.LG_NATIVE_FETCH || window.fetch.bind(window);
  const routedFetch = window.fetch.bind(window); // auth-ck gateway-aware fetch
  const inflight = new Map();
  const apiCache = new Map();
  const exchangeCache = new Map();

  function currentAccount() {
    try { return typeof account !== 'undefined' ? account : null; } catch { return null; }
  }
  function currentSiteKey() {
    try { return typeof SITE_KEY !== 'undefined' ? String(SITE_KEY || '') : ''; } catch { return ''; }
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
    if (!f || !a) return false;
    if (a.auth_method === 'google' || a.tier === 'CK_') return false;
    if (f.slug === 'lg-api' && (/^\/(?:auth|account)(?:\/|$)/.test(f.path) || /^\/keys(?:\/|$)/.test(f.path))) return false;
    return true;
  }
  async function deduped(kind, fn, input, init) {
    if (methodOf(input, init) !== 'GET') return fn(input, init);
    const raw = rawUrl(input), a = currentAccount();
    const key = `${kind}|${a?.key_id || 'boot'}|${raw}`;
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
  // Edge Function. Sending them through lg-gateway first only duplicated an Edge
  // invocation and a site_keys lookup. Google and CK traffic still uses the gateway
  // because it is the permission/security boundary for those login modes.
  window.fetch = function(input, init = {}) {
    const raw = rawUrl(input);
    if (useDirectLegacy(raw)) return deduped('direct', nativeFetch, input, init);
    return deduped('routed', routedFetch, input, init);
  };

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
})();
