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
    // profile-verify.js already listens for this event and re-syncs /status
    // whenever the document is visible. Dispatching it after login avoids the
    // fresh-login race where its first boot request ran before SITE_KEY existed.
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

  // Catch both cached sessions and access keys entered after page load.
  checkSession();
  setInterval(checkSession, 500);

  // Belt-and-suspenders: if Cards still rendered the legacy Connect button,
  // wake the profile-code verifier instead of letting the stale OAuth handler win.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#cg-connect');
    if (!button || !currentKey()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    wakeVerifier();
    setTimeout(wakeVerifier, 100);
  }, true);
})();
