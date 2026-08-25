(() => {
  let lastKey = null;
  let lastWake = 0;
  let queued = false;

  function currentKey() {
    try { return typeof SITE_KEY === 'string' ? SITE_KEY.trim() : ''; }
    catch { return ''; }
  }

  function wakeVerifier() {
    lastWake = Date.now();
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function checkSession() {
    const key = currentKey();
    if (!key) { lastKey = ''; return; }
    if (key !== lastKey) {
      lastKey = key;
      queueMicrotask(wakeVerifier);
      setTimeout(wakeVerifier, 250);
      return;
    }
    const staleConnect = document.getElementById('cg-connect');
    const verifier = document.getElementById('pv-root');
    if (staleConnect && !verifier && Date.now() - lastWake > 1800) wakeVerifier();
  }

  function scheduleCheck() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; checkSession(); });
  }

  checkSession();

  // Login/logout always changes the app visibility class, so observe that instead
  // of polling SITE_KEY twice per second forever.
  const app = document.getElementById('app');
  if (app) new MutationObserver(scheduleCheck).observe(app, { attributes:true, attributeFilter:['class'] });

  // Cards can re-render the legacy Connect button. Watch only the Cards subtree.
  const cards = document.getElementById('page-cards');
  if (cards) new MutationObserver(scheduleCheck).observe(cards, { childList:true, subtree:true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleCheck();
  }, { passive:true });
  window.addEventListener('pageshow', scheduleCheck, { passive:true });

  // Very low-frequency fallback for unusual login flows; paused in background tabs.
  setInterval(() => {
    if (document.visibilityState === 'visible' && !document.getElementById('app')?.classList.contains('hidden')) checkSession();
  }, 5000);

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#cg-connect');
    if (!button || !currentKey()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    wakeVerifier();
    setTimeout(wakeVerifier, 100);
  }, true);
})();
