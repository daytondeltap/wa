(() => {
  const key = 'lg-rbx-dorfic-mode';
  let lastMcMode = null;

  function getDorfic() {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  }

  function applyMode() {
    const metro = !document.body.classList.contains('mc-mode');
    const dorfic = metro && getDorfic();
    if(document.body.classList.contains('rbx-metro')!==metro)document.body.classList.toggle('rbx-metro',metro);
    document.body.classList.toggle('rbx-dorfic',dorfic);
    const button = document.getElementById('rbxm-theme-toggle');
    button.hidden = !metro;
    button.setAttribute('aria-pressed',String(dorfic));
  }

  function boot() {
    const button = document.createElement('button');
    button.id = 'rbxm-theme-toggle';
    button.type = 'button';
    button.className = 'btn';
    button.textContent = 'DORFic';
    button.setAttribute('aria-label','Toggle DORFic theme');
    button.onclick = () => {
      try { localStorage.setItem(key,getDorfic() ? '0' : '1'); } catch {}
      applyMode();
    };
    document.querySelector('.header-right').prepend(button);
    lastMcMode = document.body.classList.contains('mc-mode');
    applyMode();
    new MutationObserver(()=>{
      const mc=document.body.classList.contains('mc-mode');
      if(mc===lastMcMode)return;
      lastMcMode=mc;
      applyMode();
    }).observe(document.body,{attributes:true,attributeFilter:['class']});
    addEventListener('storage',event=>{ if (event.key===key) applyMode(); });
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
