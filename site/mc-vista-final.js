(()=>{
  const q=(s,r=document)=>r.querySelector(s);
  let observer=null;

  function ensureStyle(){
    if(q('#mc-vista-final-css'))return;
    const link=document.createElement('link');
    link.id='mc-vista-final-css';
    link.rel='stylesheet';
    link.href='mc-vista-final.css';
    document.head.appendChild(link);
  }

  function ensureVistaDecor(){
    let decor=q('#mcv-decor');
    if(!decor){
      decor=document.createElement('div');
      decor.id='mcv-decor';
      decor.setAttribute('aria-hidden','true');
      decor.innerHTML='<i class="mcv-orb"></i><i class="mcv-orb"></i><i class="mcv-shine"></i>';
      document.body.appendChild(decor);
    }
    return decor;
  }

  function apply(){
    ensureStyle();
    const decor=ensureVistaDecor();
    decor.hidden=!document.body.classList.contains('mc-mode');
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
