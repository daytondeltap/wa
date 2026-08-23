(()=>{
  const q=(s,r=document)=>r.querySelector(s);
  const DORFIC_KEY='lg-rbx-dorfic-mode';
  let raf=0,observer=null;

  function getDorfic(){try{return localStorage.getItem(DORFIC_KEY)==='1'}catch{return false}}
  function setDorfic(v){try{localStorage.setItem(DORFIC_KEY,v?'1':'0')}catch{}}

  function ensureCss(){
    if(!q('#rbx-metro-css')){
      const l=document.createElement('link');l.id='rbx-metro-css';l.rel='stylesheet';l.href='rbx-metro.css';document.head.appendChild(l);
    }
    if(!q('#rbx-metro-authentic-css')){
      const l=document.createElement('link');l.id='rbx-metro-authentic-css';l.rel='stylesheet';l.href='rbx-metro-authentic.css';document.head.appendChild(l);
    }
  }

  function ensureDecor(){
    if(q('#rbxm-decor'))return;
    const d=document.createElement('div');d.id='rbxm-decor';d.setAttribute('aria-hidden','true');
    d.innerHTML='<i class="rbxm-art"></i><i class="rbxm-art2"></i><i class="rbxm-dots"></i><i class="rbxm-bar"></i>';
    document.body.appendChild(d);
  }

  function ensureToggle(){
    if(q('#rbxm-theme-toggle'))return;
    const b=document.createElement('button');b.id='rbxm-theme-toggle';b.type='button';b.setAttribute('aria-label','Toggle DORFic mode');
    b.innerHTML='<span class="rbxm-toggle-mark" aria-hidden="true"></span><span class="rbxm-toggle-label">dorfic</span>';
    b.onclick=()=>{setDorfic(!getDorfic());applyMode()};
    document.body.appendChild(b);
  }

  function updateToggle(metro,dorfic){
    const b=q('#rbxm-theme-toggle');if(!b)return;
    b.hidden=!metro;b.classList.toggle('active',dorfic);b.setAttribute('aria-pressed',dorfic?'true':'false');
    b.title=dorfic?'Switch back to Metro':'Switch to DORFic';
    const label=q('.rbxm-toggle-label',b);if(label)label.textContent=dorfic?'dorfic on':'dorfic';
  }

  function applyMode(){
    ensureCss();ensureDecor();ensureToggle();
    const metro=!document.body.classList.contains('mc-mode');
    const dorfic=metro&&getDorfic();
    document.body.classList.toggle('rbx-metro',metro);
    document.body.classList.toggle('rbx-dorfic',dorfic);
    const d=q('#rbxm-decor');if(d)d.hidden=!metro;
    updateToggle(metro,dorfic);
  }

  function pointerMotion(e){
    if(!document.body.classList.contains('rbx-metro')||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
      const x=e.clientX/innerWidth-.5,y=e.clientY/innerHeight-.5;
      const art=q('.rbxm-art'),art2=q('.rbxm-art2'),dots=q('.rbxm-dots'),bar=q('.rbxm-bar');
      if(art)art.style.translate=`${x*-8}px ${y*-6}px`;
      if(art2)art2.style.translate=`${x*7}px ${y*6}px`;
      if(dots)dots.style.translate=`${x*5}px ${y*4}px`;
      if(bar)bar.style.translate=`${x*8}px ${y*-4}px`;
    });
  }

  function boot(){
    applyMode();
    if(!observer){observer=new MutationObserver(applyMode);observer.observe(document.body,{attributes:true,attributeFilter:['class']})}
    addEventListener('pointermove',pointerMotion,{passive:true});
    addEventListener('pageshow',applyMode,{passive:true});
    addEventListener('storage',e=>{if(e.key===DORFIC_KEY)applyMode()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
