(()=>{
  const q=(s,r=document)=>r.querySelector(s);
  let raf=0;

  function ensureCss(){
    if(q('#rbx-metro-css')) return;
    const l=document.createElement('link');
    l.id='rbx-metro-css';l.rel='stylesheet';l.href='rbx-metro.css';
    document.head.appendChild(l);
  }

  function ensureDecor(){
    if(!q('#rbxm-decor')){
      const d=document.createElement('div');d.id='rbxm-decor';d.setAttribute('aria-hidden','true');
      d.innerHTML='<i class="rbxm-art"></i><i class="rbxm-dots"></i><i class="rbxm-bar"></i>';
      document.body.appendChild(d);
    }
  }

  function mode(){
    ensureCss();ensureDecor();
    const metro=!document.body.classList.contains('mc-mode');
    document.body.classList.toggle('rbx-metro',metro);
    const d=q('#rbxm-decor');if(d)d.hidden=!metro;
  }

  function pointerMotion(e){
    if(!document.body.classList.contains('rbx-metro')||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
      const art=q('.rbxm-art'),bar=q('.rbxm-bar');if(!art)return;
      const x=(e.clientX/innerWidth-.5),y=(e.clientY/innerHeight-.5);
      art.style.marginRight=`${x*-7}px`;art.style.marginBottom=`${y*-5}px`;
      if(bar)bar.style.marginRight=`${x*5}px`;
    });
  }

  function boot(){
    mode();
    new MutationObserver(mode).observe(document.body,{attributes:true,attributeFilter:['class']});
    addEventListener('pointermove',pointerMotion,{passive:true});
    addEventListener('pageshow',mode,{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
