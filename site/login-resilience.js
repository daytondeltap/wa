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
  function withTimeout(promise, ms, stage) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${stage} timed out`)), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  }
  function showHydrationFallback(name) {
    try {
      if (typeof activePage !== 'undefined') activePage = name;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${name}`)?.classList.add('active');
      document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    } catch (_) {}
  }

  if (typeof savedRefreshTracked === 'function') {
    window.refreshTracked = async function(...args) {
      try {
        return await withTimeout(savedRefreshTracked.apply(this, args), 6000, 'Tracked-user loading');
      } catch (error) {
        report('tracked-user hydration', error);
        return [];
      }
    };
  }

  if (typeof savedSwitchPage === 'function') {
    window.switchPage = async function(...args) {
      try {
        return await withTimeout(savedSwitchPage.apply(this, args), 8000, 'Page loading');
      } catch (error) {
        report('initial page hydration', error);
        const name = String(args[0] || 'monitor');
        showHydrationFallback(name);
        if (typeof toast === 'function') toast('Signed in. Some page data could not load yet.');
        return null;
      }
    };
  }

  // Give the user immediate feedback instead of leaving the login button looking
  // idle while /auth is in flight. Restore it immediately on either success or a
  // displayed auth error; the timeout is only a final network-failure fallback.
  const form = document.getElementById('login-form');
  const button = form?.querySelector('button[type="submit"]');
  if (form && button) {
    const original = button.textContent;
    const restore = () => {
      button.disabled = false;
      button.textContent = original;
    };
    form.addEventListener('submit', () => {
      button.disabled = true;
      button.textContent = 'Signing in…';
      setTimeout(() => {
        if (!document.getElementById('auth')?.classList.contains('hidden')) restore();
      }, 9000);
    }, {capture:true});

    const auth = document.getElementById('auth');
    if (auth) {
      new MutationObserver(() => {
        if (auth.classList.contains('hidden')) restore();
      }).observe(auth, {attributes:true, attributeFilter:['class']});
    }
    const loginError = document.getElementById('login-error');
    if (loginError) {
      new MutationObserver(() => {
        if (!loginError.classList.contains('hidden') && loginError.textContent.trim()) restore();
      }).observe(loginError, {attributes:true, attributeFilter:['class'], childList:true, characterData:true, subtree:true});
    }
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
    }, 1200);
  }

  window.LGLoginResilience = { installed: true };
})();
