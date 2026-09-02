(()=>{
  const GOOGLE_SENTINEL='__LG_GOOGLE_SESSION__';
  const q=(s,r=document)=>r.querySelector(s);
  const nativeGatewayFetch=window.fetch.bind(window);

  // MC's legacy wrapper checks that SITE_KEY is truthy before calling fetch.
  // For Google sessions use an in-memory sentinel, then strip it here before
  // the Google gateway shim sees the request. It is never persisted.
  window.fetch=function(input,init={}){
    const headers=new Headers(input instanceof Request?input.headers:undefined);
    if(init.headers)new Headers(init.headers).forEach((v,k)=>headers.set(k,v));
    if((headers.get('x-site-key')||'')===GOOGLE_SENTINEL){
      headers.delete('x-site-key');
      const tok=window.LGGoogleAuth?.getAccessToken?.();
      if(tok)headers.set('authorization',`Bearer ${tok}`);
    }
    return nativeGatewayFetch(input,{...init,headers});
  };

  function mcAllowed(){return account?.features?.mc!==false}
  function cardsAllowed(){return account?.features?.cards!==false}

  function setMcMode(on){
    const sw=q('#mcx-sw');if(!sw)return false;
    const current=document.body.classList.contains('mc-mode');
    if(Boolean(on)!==current)sw.click();
    return true;
  }
  function syncMc(){
    const wrap=q('.mcx-toggle'),ok=mcAllowed();
    if(wrap)wrap.style.display=ok?'':'none';
    if(!ok&&document.body.classList.contains('mc-mode'))setMcMode(false);
  }
  window.LGMCDetector={setMode:setMcMode,syncAccess:syncMc};

  function prune(){
    if(account?.features?.cards===false){
      q('.page-nav-btn[data-tab="cards"]')?.remove();
      q('#page-cards')?.classList.remove('active');
    }
    syncMc();
  }

  // Run after Exchange/Cards have wrapped buildNav, so CK restrictions get the
  // final say over what the logged-in user can see.
  if(typeof buildNav==='function'&&!buildNav.__lgFeatureAccess){
    const old=buildNav;
    const patched=function(){old();prune()};
    patched.__lgFeatureAccess=true;
    buildNav=patched;
  }

  function openOnlyFeature(){
    if((account?.tabs||[]).length)return;
    if(cardsAllowed()){
      const b=q('.page-nav-btn[data-tab="cards"]');
      if(b){b.click();return}
    }
    if(mcAllowed())setTimeout(()=>setMcMode(true),0);
  }

  window.addEventListener('lg-account-ready',e=>{
    if(e.detail?.auth_method==='google')SITE_KEY=GOOGLE_SENTINEL;
    prune();
    setTimeout(()=>{try{buildNav()}catch{};prune();openOnlyFeature()},0);
  });

  // Cards/MC modules may finish their own DOM boot immediately after this file.
  // A few cheap retries handle that startup ordering without a permanent observer.
  function boot(){let n=0;const t=setInterval(()=>{prune();if(account)openOnlyFeature();if(++n>=12)clearInterval(t)},100)}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
