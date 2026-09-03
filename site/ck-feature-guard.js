(() => {
  const $ = id => document.getElementById(id);
  let installed = false;
  let moving = false;

  function acct() {
    try { return typeof account !== 'undefined' ? account : null; } catch { return null; }
  }
  function pageName() {
    try { return typeof activePage !== 'undefined' ? String(activePage || '') : ''; } catch { return ''; }
  }
  function setPageName(value) {
    try { activePage = value; } catch {}
  }
  function enabled(a, name) {
    if (!a || a.tier !== 'CK_') return true;
    if (name === 'keys') return false;
    if (['monitor','leaderboard','exchange','history','adduser','cards','mc'].includes(name)) return a.features?.[name] === true;
    return true;
  }
  function firstAllowed(a) {
    if (!a || a.tier !== 'CK_') return null;
    for (const name of a.tabs || []) {
      if (enabled(a, name) && $(`page-${name}`)) return name;
    }
    if (a.features?.cards === true && $('page-cards')) return 'cards';
    return null;
  }
  function hasAnyFeature(a) {
    if (!a || a.tier !== 'CK_') return true;
    return ['monitor','leaderboard','exchange','history','adduser','cards','mc','join'].some(k => a.features?.[k] === true);
  }
  function injectEmptyPage() {
    if ($('page-ck-empty')) return;
    const p = document.createElement('div');
    p.className = 'page';
    p.id = 'page-ck-empty';
    p.innerHTML = '<div class="insights-wrap"><section class="insight-card" style="max-width:720px;margin:0 auto"><div class="sec-title">No Features Enabled</div><div style="color:var(--subtext);font-size:.78rem;line-height:1.65">This CK is active, but its feature checklist currently has no enabled app features. A DEV can change the key permissions from Key Generator. Access updates automatically after the account permission refresh.</div></section></div>';
    const app = $('app');
    if (app) app.appendChild(p);
  }
  function showEmpty() {
    injectEmptyPage();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    $('page-ck-empty')?.classList.add('active');
    document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.remove('active'));
    setPageName('ck-empty');
  }
  async function go(name) {
    if (!name || moving) return;
    moving = true;
    try {
      if (name === 'cards') {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        $('page-cards')?.classList.add('active');
        document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'cards'));
        setPageName('cards');
        if (window.LGCards?.refresh) await window.LGCards.refresh();
      } else if (typeof switchPage === 'function') {
        await switchPage(name, document.querySelector(`.page-nav-btn[data-tab="${CSS.escape(name)}"]`) || undefined);
      }
    } catch (e) {
      console.warn('CK safe navigation failed', e);
    } finally { moving = false; }
  }
  async function enforce() {
    const a = acct();
    if (!a || a.tier !== 'CK_') {
      $('page-ck-empty')?.classList.remove('active');
      return;
    }
    const next = firstAllowed(a);
    if (!hasAnyFeature(a) || (!next && a.features?.mc !== true && a.features?.join !== true)) {
      showEmpty();
      return;
    }
    const current = pageName();
    if (current === 'ck-empty') {
      if (next) await go(next);
      else showEmpty();
      return;
    }
    if (current && !enabled(a, current)) {
      if (next) await go(next);
      else showEmpty();
    }
  }
  function install() {
    if (installed) return;
    installed = true;
    injectEmptyPage();
    const nav = $('page-nav');
    if (nav) new MutationObserver(() => enforce()).observe(nav, {childList:true, subtree:true});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') enforce(); });
    setInterval(enforce, 1800);
    setTimeout(enforce, 0);
    window.LGCKGuard = {enforce};
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
