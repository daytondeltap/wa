(()=>{
  const SUPA='https://jwjxhxvahgrpkvaoyrzw.supabase.co';
  const PUBLISHABLE='sb_publishable_T9WqodoC7td8fZ50GBu1qg_dq4528-r';
  const GOOGLE_CLIENT_ID='116418828646-25qo5updqnfpv3g7qb68v7j51pj8osoh.apps.googleusercontent.com';
  const REDIRECT='https://daytondeltap.github.io/wa/';
  const SDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4';
  const FN_PREFIX=`${SUPA}/functions/v1/`;
  const GATEWAY=`${SUPA}/functions/v1/lg-gateway`;
  const TARGETS={
    'lg-api':'api','lg-cards':'cards','lg-card-verify':'card-verify','lg-card-names':'card-names','lg-card-gifts':'card-gifts','lg-mc':'mc'
  };
  let sb=null,accessToken='',authBusy=false,signingOut=false,providerReady=false;
  const nativeFetch=window.fetch.bind(window);
  const q=(s,r=document)=>r.querySelector(s);

  function rewriteUrl(raw){
    try{
      const u=new URL(raw,location.href);
      if(u.origin!==new URL(SUPA).origin)return null;
      const m=u.pathname.match(/^\/functions\/v1\/(lg-api|lg-cards|lg-card-verify|lg-card-names|lg-card-gifts|lg-mc)(\/.*)?$/);
      if(!m)return null;
      const target=TARGETS[m[1]];if(!target)return null;
      const n=new URL(`${GATEWAY}/${target}${m[2]||''}`);n.search=u.search;return n.toString();
    }catch{return null}
  }

  // Route every browser LG API call through the gateway. Existing feature modules
  // can keep their current x-site-key wrappers unchanged.
  window.fetch=async function(input,init={}){
    const raw=input instanceof Request?input.url:String(input);
    const rewritten=rewriteUrl(raw);
    if(!rewritten)return nativeFetch(input,init);
    const headers=new Headers(input instanceof Request?input.headers:undefined);
    if(init.headers)new Headers(init.headers).forEach((v,k)=>headers.set(k,v));
    const key=(headers.get('x-site-key')||'').trim();
    if(!key){
      headers.delete('x-site-key');
      if(accessToken)headers.set('authorization',`Bearer ${accessToken}`);
    }else headers.delete('authorization');
    if(input instanceof Request){
      const req=new Request(rewritten,input);
      return nativeFetch(req,{...init,headers});
    }
    return nativeFetch(rewritten,{...init,headers});
  };

  function css(){if(q('#lg-google-auth-style'))return;const s=document.createElement('style');s.id='lg-google-auth-style';s.textContent=`
    .lg-auth-or{display:flex;align-items:center;gap:.65rem;margin:.2rem 0;color:var(--muted);font:600 .58rem var(--font-mono);text-transform:uppercase;letter-spacing:.08em}.lg-auth-or::before,.lg-auth-or::after{content:'';height:1px;background:var(--border);flex:1}
    .lg-google-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:.55rem;font:700 .72rem var(--font-mono);padding:.67rem .8rem;border-radius:5px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;transition:border-color .15s,transform .15s}.lg-google-btn:hover{border-color:var(--accent2);transform:translateY(-1px)}.lg-google-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
    .lg-google-g{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#4285f4;font:bold 13px Arial;box-shadow:0 0 0 1px #ddd}
    .tier-badge.tb-ck{color:#d08cff;border-color:#a95cff;box-shadow:0 0 8px rgba(169,92,255,.22)}
  `;document.head.appendChild(s)}

  function injectButton(){
    const form=q('#login-form');if(!form||q('#lg-google-login'))return;
    const or=document.createElement('div');or.className='lg-auth-or';or.textContent='or';
    const b=document.createElement('button');b.type='button';b.id='lg-google-login';b.className='lg-google-btn';b.dataset.googleClientId=GOOGLE_CLIENT_ID;b.innerHTML='<span class="lg-google-g" aria-hidden="true">G</span><span>Sign in with Google</span>';
    b.disabled=!providerReady;b.title=providerReady?'Sign in with the Google account linked to your LG key':'Google OAuth is not enabled in Supabase Auth yet';
    b.onclick=()=>signInGoogle();form.after(or,b);
  }

  function syncGoogleButton(){const b=q('#lg-google-login');if(!b)return;b.disabled=!providerReady||authBusy;b.title=providerReady?'Sign in with the Google account linked to your LG key':'Google OAuth is not enabled in Supabase Auth yet'}
  function setError(message){const el=q('#login-error');if(!el)return;el.textContent=message;el.classList.remove('hidden')}
  function clearError(){q('#login-error')?.classList.add('hidden')}

  async function checkProvider(){
    try{
      const r=await nativeFetch(`${SUPA}/auth/v1/settings`,{headers:{apikey:PUBLISHABLE}});
      if(!r.ok)return false;
      const j=await r.json();
      providerReady=Boolean(j?.external?.google);
      syncGoogleButton();
      return providerReady;
    }catch{providerReady=false;syncGoogleButton();return false}
  }

  function loadSdk(){return new Promise((resolve,reject)=>{
    if(window.supabase?.createClient)return resolve(window.supabase);
    let s=q('#lg-supabase-sdk');if(s){s.addEventListener('load',()=>resolve(window.supabase),{once:true});s.addEventListener('error',reject,{once:true});return}
    s=document.createElement('script');s.id='lg-supabase-sdk';s.src=SDK;s.defer=true;s.onload=()=>resolve(window.supabase);s.onerror=()=>reject(new Error('Could not load Google sign-in'));document.head.appendChild(s);
  })}

  async function chooseInitialPage(){
    const first=(account?.tabs||[])[0];
    if(first){await switchPage(first);return}
    if(account?.features?.cards){
      try{buildNav()}catch{}
      await switchPage('cards');
      try{await window.LGCards?.refresh?.()}catch{}
      return;
    }
    if(account?.features?.mc){
      activePage='';
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      for(let i=0;i<20;i++){
        if(window.LGMCDetector?.setMode){window.LGMCDetector.setMode(true);return}
        await new Promise(r=>setTimeout(r,50));
      }
    }
  }

  async function finishLogin(rawKey){
    if(rawKey!==null){SITE_KEY=String(rawKey||'').trim();if(!SITE_KEY)throw new Error('Enter an access key')}
    else{SITE_KEY='';sessionStorage.removeItem('lg_site_key')}
    account=await api('/auth',{method:'POST'});
    if(rawKey!==null)sessionStorage.setItem('lg_site_key',SITE_KEY);
    q('#auth')?.classList.add('hidden');q('#app')?.classList.remove('hidden');
    applyTier();buildNav();
    window.dispatchEvent(new CustomEvent('lg-account-ready',{detail:account}));
    try{await refreshTracked()}catch{}
    await chooseInitialPage();
    clearInterval(refreshTimer);
    refreshTimer=setInterval(()=>{if(activePage==='monitor'&&!document.body.classList.contains('mc-mode'))refreshMonitor(false)},10000);
    window.LGMCDetector?.syncAccess?.();
    return account;
  }

  // Replace only the session setup around the existing login. The API and all
  // feature functions continue using their original interfaces.
  login=async function(key){
    clearError();
    try{return await finishLogin(String(key??''))}
    catch(e){SITE_KEY='';sessionStorage.removeItem('lg_site_key');throw e}
  };

  const baseLogout=logout;
  logout=function(){
    signingOut=true;
    try{baseLogout()}finally{
      accessToken='';
      if(sb)sb.auth.signOut({scope:'local'}).catch(()=>{}).finally(()=>{signingOut=false});else signingOut=false;
    }
  };

  const baseApplyTier=applyTier;
  applyTier=function(){baseApplyTier();if(account?.tier==='CK_'){const b=q('#tier-badge');if(b){b.textContent='CUSTOM';b.className='tier-badge tb-ck'}}};

  async function googleLogin(session){
    if(authBusy||SITE_KEY||!session?.access_token)return;
    authBusy=true;accessToken=session.access_token;clearError();syncGoogleButton();
    try{await finishLogin(null)}catch(e){
      q('#app')?.classList.add('hidden');q('#auth')?.classList.remove('hidden');
      setError(e?.message==='Access key rejected'?'This Google account is not linked to an active LG key.':(e?.message||'Google sign-in could not be linked to LG.'));
    }finally{authBusy=false;syncGoogleButton()}
  }

  async function signInGoogle(){
    clearError();
    if(!providerReady){setError('Google sign-in is not enabled yet. Configure the Google provider in Supabase Auth first.');return}
    authBusy=true;syncGoogleButton();
    try{
      if(!sb)throw new Error('Google sign-in is still loading. Try again in a moment.');
      if(accessToken)await sb.auth.signOut({scope:'local'}).catch(()=>{});
      const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:REDIRECT,queryParams:{prompt:'select_account'}}});
      if(error)throw error;
    }catch(e){authBusy=false;syncGoogleButton();setError(e?.message||'Could not start Google sign-in')}
  }

  async function init(){
    css();injectButton();
    await checkProvider();
    try{
      const lib=await loadSdk();
      sb=lib.createClient(SUPA,PUBLISHABLE,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
      window.LGGoogleAuth.client=sb;
      sb.auth.onAuthStateChange((event,session)=>{
        accessToken=session?.access_token||'';
        if(!signingOut&&session&&!SITE_KEY&&['SIGNED_IN','TOKEN_REFRESHED','INITIAL_SESSION'].includes(event))setTimeout(()=>googleLogin(session),0);
      });
      const {data}=await sb.auth.getSession();accessToken=data?.session?.access_token||'';
      if(data?.session&&!SITE_KEY)await googleLogin(data.session);
    }catch(e){console.warn('LG Google Auth:',e);const b=q('#lg-google-login');if(b){b.disabled=true;b.title='Google sign-in failed to load'}}
  }

  window.LGGoogleAuth={
    client:null,
    clientId:GOOGLE_CLIENT_ID,
    hasSession:()=>Boolean(accessToken),
    getAccessToken:()=>accessToken,
    providerReady:()=>providerReady,
    refreshProviderStatus:checkProvider,
    signIn:signInGoogle,
    signOut:async()=>{if(sb)await sb.auth.signOut({scope:'local'});accessToken=''},
    redirect:REDIRECT
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
