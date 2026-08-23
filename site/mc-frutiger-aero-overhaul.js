(()=>{
  const q=(s,r=document)=>r.querySelector(s);
  let observer=null;

  function ensureStyle(){
    if(q('#mc-frutiger-aero-overhaul-css'))return;
    const l=document.createElement('link');
    l.id='mc-frutiger-aero-overhaul-css';
    l.rel='stylesheet';
    l.href='mc-frutiger-aero-overhaul.css';
    document.head.appendChild(l);
  }

  function ensureBubbles(){
    let b=q('#mca-bubbles');
    if(!b){
      b=document.createElement('div');
      b.id='mca-bubbles';
      b.setAttribute('aria-hidden','true');
      b.innerHTML='<i></i><i></i><i></i><i></i><i></i>';
      document.body.appendChild(b);
    }
    return b;
  }

  function apply(){
    ensureStyle();
    const b=ensureBubbles();
    b.hidden=!document.body.classList.contains('mc-mode');
  }

  function boot(){
    apply();
    if(!observer){
      observer=new MutationObserver(apply);
      observer.observe(document.body,{attributes:true,attributeFilter:['class']});
    }
    addEventListener('pageshow',apply,{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
