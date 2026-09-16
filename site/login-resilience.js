(() => {
  // Authentication should succeed or fail based on /auth only. Secondary page
  // hydration (tracked users, monitor/history data) must never make a valid key
  // look invalid or bounce the user back to the login screen.
  const bootKey = String(window.LG_LEGACY_SITE_KEY || sessionStorage.getItem('lg_site_key') || '').trim();
  const savedRefreshTracked = window.refreshTracked;
  const savedSwitchPage = window.switchPage;

  function report(stage, error) {
    console.warn(`[LG login] ${stage} failed after authentication`, error);
  }

  if (typeof savedRefreshTracked === 'function') {
    window.refreshTracked = async function(...args) {
      try {
        return await savedRefreshTracked.apply(this, args);
      } catch (error) {
        report('tracked-user hydration', error);
        return [];
      }
    };
  }

  if (typeof savedSwitchPage === 'function') {
    window.switchPage = async function(...args) {
      try {
        return await savedSwitchPage.apply(this, args);
      } catch (error) {
        report('initial page hydration', error);
        const name = String(args[0] || 'monitor');
        try {
          if (typeof activePage !== 'undefined') activePage = name;
          document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
          document.getElementById(`page-${name}`)?.classList.add('active');
          document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
        } catch (_) {}
        if (typeof toast === 'function') toast('Signed in. Some page data is still loading.');
        return null;
      }
    };
  }

  // auth-ck schedules its saved-session bootstrap with setTimeout(0). These
  // wrappers are installed synchronously before that timer runs. If an older
  // bootstrap still exits after a transient hydration failure, keep one safe
  // recovery attempt using the key captured before logout clears sessionStorage.
  if (bootKey) {
    setTimeout(async () => {
      const authVisible = !document.getElementById('auth')?.classList.contains('hidden');
      if (!authVisible || !window.LGAuth?.keyLogin) return;
      try {
        await window.LGAuth.keyLogin(bootKey);
      } catch (error) {
        console.warn('[LG login] saved-key recovery failed', error);
      }
    }, 900);
  }

  window.LGLoginResilience = { installed: true };
})();
