(() => {
  let lastKey = null;
  let lastWake = 0;

  function currentKey() {
    try {
      return typeof SITE_KEY === 'string' ? SITE_KEY.trim() : '';
    } catch {
      return '';
    }
  }

  function wakeVerifier() {
    lastWake = Date.now();
    // profile-verify.js already re-syncs verification state when the page becomes
    // visible. Reuse that path after LG login so a boot-time empty SITE_KEY does
    // not leave the legacy OAuth Connect button behind.
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function checkSession() {
    const key = currentKey();
    if (!key) {
      lastKey = '';
      return;
    }

    if (key !== lastKey) {
      lastKey = key;
      queueMicrotask(wakeVerifier);
      setTimeout(wakeVerifier, 250);
      return;
    }

    // If Cards has re-rendered the legacy OAuth prompt (including a disabled
    // Connect button), retry status sync until profile-verify.js replaces it.
    const staleConnect = document.getElementById('cg-connect');
    const verifier = document.getElementById('pv-root');
    if (staleConnect && !verifier && Date.now() - lastWake > 2000) {
      wakeVerifier();
    }
  }

  checkSession();
  setInterval(checkSession, 500);

  // If the stale Connect Roblox button is briefly clickable, consume the click
  // and wake the profile-code verifier instead of running the old OAuth handler.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#cg-connect');
    if (!button || !currentKey()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    wakeVerifier();
    setTimeout(wakeVerifier, 100);
  }, true);
})();
