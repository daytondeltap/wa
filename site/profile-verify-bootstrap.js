(() => {
  let lastKey = null;

  function currentKey() {
    try {
      return typeof SITE_KEY === 'string' ? SITE_KEY.trim() : '';
    } catch {
      return '';
    }
  }

  function wakeVerifier() {
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
    }
  }

  checkSession();
  setInterval(checkSession, 500);

  // If the stale Connect Roblox button is visible for a moment, consume that
  // click and wake the profile-code verifier instead of running the old OAuth path.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#cg-connect');
    if (!button || !currentKey()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    wakeVerifier();
    setTimeout(wakeVerifier, 100);
  }, true);
})();
