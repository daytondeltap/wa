(()=>{
  const SB='https://jwjxhxvahgrpkvaoyrzw.supabase.co';
  const PUB='sb_publishable_T9WqodoC7td8fZ50GBu1qg_dq4528-r';
  const GATE=`${SB}/functions/v1/lg-gateway`;
  const OAUTH_KEY='lg_google_session';
  const PLACEHOLDER='__LG_GOOGLE_OAUTH__';
  const nativeFetch=window.fetch.bind(window);
  const fnMap={
    'lg-api':'api',
    'lg-cards':'cards',
    'lg-card-verify':'card-verify',
    'lg-card-names':'card-names',
    'lg-card-gifts':'card-gifts',
    'lg-mc':'mc',
  };
  const featureDefs=[
    ['monitor','Monitor'],
    ['leaderboard','Leaderboard'],
    ['exchange','LG Exchange'],
    ['history','History'],
    ['adduser','User Adding'],
    ['cards','LG Cards'],
    ['mc','MC Detector'],
    ['join','Join Game'],
  ];
  let googleSession=null,keyRows=[],booting=false;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parseEmails=v=>[...new Set(String(v||'').split(/[\n,;]/).map(x=>x.trim().toLowerCase()).filter(Boolean))];
  const normalizePerms=v=>Object.fromEntries(featureDefs.map(([k])=>[k,v?.[k]===true]));
  const enabledNames=v=>featureDefs.filter(([k])=>v?.[k]===true).map(([,n])=>n);

  function readStoredSession(){try{const s=JSON.parse(sessionStorage.getItem(OAUTH_KEY)||'null');if(s?.access_token&&s?.refresh_token)return s}catch{}return null}
  function saveSession(s){googleSession=s;sessionStorage.setItem(OAUTH_KEY,JSON.stringify(s))}
  function clearGoogle(){googleSession=null;sessionStorage.removeItem(OAUTH_KEY)}
  function absorbOAuthHash(){
    const h=new URLSearchParams(location.hash.replace(/^#/,''));
    const access=h.get('access_token'),refresh=h.get('refresh_token');
    if(!access||!refresh)return false;
    const expires=Math.max(60,Number(h.get('expires_in')||3600));
    saveSession({access_token:access,refresh_token:refresh,expires_at:Date.now()+expires*1000,token_type:h.get('token_type')||'bearer'});
    history.replaceState(null,'',location.pathname+location.search);
    return true;
  }
  async function ensureGoogle(){
    if(!googleSession)googleSession=readStoredSession();
    if(!googleSession)return null;
    if(Number(googleSession.expires_at||0)>Date.now()+60000)return googleSession;
    try{
      const r=await nativeFetch(`${SB}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:PUB,'content-type':'application/json'},body:JSON.stringify({refresh_token:googleSession.refresh_token})});
      if(!r.ok)throw Error('Google session expired');
      const j=await r.json();
      saveSession({access_token:j.access_token,refresh_token:j.refresh_token||googleSession.refresh_token,expires_at:Date.now()+Math.max(60,Number(j.expires_in||3600))*1000,token_type:j.token_type||'bearer'});
      return googleSession;
    }catch{clearGoogle();return null}
  }
  function rewriteUrl(raw){
    let u;try{u=new URL(raw,location.href)}catch{return null}
    if(u.origin!==SB)return null;
    const m=u.pathname.match(/^\/functions\/v1\/(lg-api|lg-cards|lg-card-verify|lg-card-names|lg-card-gifts|lg-mc)(\/.*)?$/);
    if(!m)return null;
    u.pathname=`/functions/v1/lg-gateway/${fnMap[m[1]]}${m[2]||''}`;
    return u.href;
  }
  window.fetch=async function(input,init={}){
    const raw=typeof input==='string'||input instanceof URL?String(input):input?.url;
    const next=raw&&rewriteUrl(raw);
    if(!next)return nativeFetch(input,init);
    const h=new Headers(input instanceof Request?input.headers:undefined);
    new Headers(init.headers||{}).forEach((v,k)=>h.set(k,v));
    const gs=await ensureGoogle();
    if(gs){h.delete('x-site-key');h.set('authorization',`Bearer ${gs.access_token}`)}
    if(input instanceof Request){const req=new Request(next,input);return nativeFetch(req,{...init,headers:h})}
    return nativeFetch(next,{...init,headers:h});
  };

  function injectCss(){
    if($('lg-auth-ck-style'))return;
    const s=document.createElement('style');s.id='lg-auth-ck-style';s.textContent=`
      .oauth-divider{display:flex;align-items:center;gap:.6rem;margin:1rem 0;color:var(--muted);font:400 .58rem var(--font-mono);text-transform:uppercase;letter-spacing:.08em}.oauth-divider:before,.oauth-divider:after{content:'';height:1px;background:var(--border);flex:1}.google-login{width:100%;font:700 .7rem var(--font-mono);letter-spacing:.04em;border:1px solid var(--border);background:#fff;color:#181818;border-radius:4px;padding:.62rem .7rem;cursor:pointer}.google-login:hover{border-color:var(--accent2)}.google-note{font:400 .58rem var(--font-mono);color:var(--muted);line-height:1.45;margin-top:.55rem;text-align:center}.tb-ck{color:#c69cff!important;border-color:#c69cff!important;box-shadow:0 0 8px rgba(198,156,255,.2)}
      .ck-box{display:none;flex:1 1 100%;border:1px solid var(--border);border-radius:6px;padding:.75rem;background:rgba(255,255,255,.015)}.ck-box.show{display:block}.ck-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.45rem}.ck-check{display:flex;align-items:center;gap:.45rem;font:400 .62rem var(--font-mono);color:var(--subtext)}.ck-check input{accent-color:var(--accent2)}.key-email-input{min-height:68px;resize:vertical}.key-meta{font:400 .58rem var(--font-mono);color:var(--subtext);line-height:1.5}.key-meta b{color:var(--text)}.key-action-row{display:flex;gap:.35rem;flex-wrap:wrap}.key-config-overlay{position:fixed;inset:0;z-index:1300;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;padding:1rem}.key-config{width:min(620px,96vw);max-height:90vh;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:1rem}.key-config h3{font-size:.9rem;margin-bottom:.75rem}.key-config .adduser-field{margin-bottom:.75rem}.key-config-actions{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem}.key-chip{display:inline-block;border:1px solid var(--border);border-radius:99px;padding:.1rem .32rem;margin:.08rem;font:400 .52rem var(--font-mono);color:var(--subtext)}
      @media(max-width:760px){#keys-table th:nth-child(3),#keys-table td:nth-child(3),#keys-table th:nth-child(6),#keys-table td:nth-child(6){display:none}.key-action-row{min-width:110px}}
    `;document.head.appendChild(s);
  }
  function injectLogin(){
    const form=$('login-form');if(!form||$('google-login'))return;
    const d=document.createElement('div');d.innerHTML=`<div class="oauth-divider">or</div><button type="button" id="google-login" class="google-login">Continue with Google</button><div class="google-note">Works only when this Google email is linked to an LG key.</div>`;
    form.after(d);
    $('google-login').onclick=()=>{
      sessionStorage.removeItem('lg_site_key');
      clearGoogle();
      const back=location.origin+location.pathname;
      location.href=`${SB}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
    };
    const sub=document.querySelector('.login-sub');if(sub)sub.textContent='RESTRICTED ACCESS — KEY OR LINKED GOOGLE ACCOUNT';
  }
  function showLoginError(msg){const e=$('login-error');if(!e)return;e.textContent=msg;e.classList.remove('hidden')}
  function hideLoginError(){$('login-error')?.classList.add('hidden')}

  function patchTier(){
    window.applyTier=function(){
      const map={DEV:['DEV','tb-dev'],PK_:['DELUXE','tb-pk'],UPK_:['UPGRADED','tb-upk'],BK_:['BASIC','tb-bk'],CK_:['CUSTOM','tb-ck']};
      const pair=map[account?.tier]||[account?.tier||'',''];const b=$('tier-badge');if(!b)return;b.textContent=pair[0];b.className='tier-badge '+pair[1];
      if(account?.auth_method==='google'&&account?.email)b.title=`Google · ${account.email}`;
    };
  }
  function applyGuards(){
    if(!account)return;const f=account.features||{};
    document.querySelectorAll('[data-tab="cards"]').forEach(x=>x.classList.toggle('hidden',f.cards===false));
    const cp=$('page-cards');if(cp&&f.cards===false){cp.classList.remove('active');cp.style.display='none'}else if(cp)cp.style.display='';
    document.querySelectorAll('.mcx-toggle').forEach(x=>x.classList.toggle('hidden',f.mc===false));
    if(f.mc===false){try{localStorage.lg_detector_mode='rbx';document.body.classList.remove('mc-mode');document.getElementById('mcx-sw')?.classList.remove('on')}catch{}}
  }
  function observeGuards(){const mo=new MutationObserver(()=>applyGuards());mo.observe(document.body,{subtree:true,childList:true})}
  async function completeLogin(){
    account=await api('/auth',{method:'POST'});
    $('auth')?.classList.add('hidden');$('app')?.classList.remove('hidden');
    applyTier();buildNav();applyGuards();
    await refreshTracked();
    const first=(account.tabs||[])[0];
    if(first)await switchPage(first);
    else if(account.features?.cards&&$('page-cards')){activePage='cards';document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));$('page-cards').classList.add('active');document.querySelector('[data-tab="cards"]')?.classList.add('active')}
    else {activePage='monitor';const p=$('page-monitor');if(p)p.classList.add('active')}
    clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(activePage==='monitor'&&account?.features?.monitor!==false)refreshMonitor(false)},10000);
  }
  async function googleLogin(){
    const gs=await ensureGoogle();if(!gs)throw Error('Google sign-in session is missing or expired');
    SITE_KEY=PLACEHOLDER;
    sessionStorage.removeItem('lg_site_key');
    await completeLogin();
  }
  async function keyLogin(key){
    clearGoogle();SITE_KEY=String(key||'').trim();if(!SITE_KEY)throw Error('Enter an access key');
    await completeLogin();sessionStorage.setItem('lg_site_key',SITE_KEY);
  }
  window.logout=function(){
    clearInterval(refreshTimer);const token=googleSession?.access_token;clearGoogle();sessionStorage.removeItem('lg_site_key');SITE_KEY='';account=null;
    $('app')?.classList.add('hidden');$('auth')?.classList.remove('hidden');if($('login-key'))$('login-key').value='';
    if(token)nativeFetch(`${SB}/auth/v1/logout`,{method:'POST',headers:{apikey:PUB,authorization:`Bearer ${token}`}}).catch(()=>{});
  };
  function patchLogin(){
    const form=$('login-form');if(form)form.onsubmit=async e=>{e.preventDefault();hideLoginError();try{await keyLogin($('login-key').value)}catch(ex){showLoginError(ex.message);SITE_KEY=''}};
    if($('logout-btn'))$('logout-btn').onclick=logout;
  }

  function checklistHtml(prefix,perms={},disabled=false){return `<div class="ck-grid">${featureDefs.map(([k,n])=>`<label class="ck-check"><input type="checkbox" data-${prefix}-perm="${k}" ${perms?.[k]===true?'checked':''} ${disabled?'disabled':''}> ${esc(n)}</label>`).join('')}</div>`}
  function patchKeygenUi(){
    const tier=$('keygen-tier'),form=$('keygen-form');if(!tier||!form)return;
    if(![...tier.options].some(o=>o.value==='CK_'))tier.add(new Option('CK_ — Custom feature access','CK_'));
    if(!$('keygen-emails')){
      const label=$('keygen-label')?.closest('.adduser-field');
      const f=document.createElement('div');f.className='adduser-field';f.innerHTML='<label for="keygen-emails">Linked Google email(s)</label><textarea class="ask-input key-email-input" id="keygen-emails" maxlength="1600" placeholder="name@example.com\nsecond@example.com"></textarea><div class="adduser-hint">Optional · up to 5. Each email can belong to one LG key.</div>';label?.after(f);
      const c=document.createElement('div');c.id='keygen-ck';c.className='ck-box';c.innerHTML='<div class="sec-title">CK Feature Checklist</div>'+checklistHtml('keygen',{monitor:true,leaderboard:true,history:true,adduser:true,cards:true,mc:true});form.appendChild(c);
    }
    const toggle=()=>{$('keygen-ck')?.classList.toggle('show',tier.value==='CK_')};tier.onchange=toggle;toggle();
    form.onsubmit=async e=>{
      e.preventDefault();try{
        const t=tier.value,permissions={};document.querySelectorAll('[data-keygen-perm]').forEach(x=>permissions[x.dataset.keygenPerm]=x.checked);
        const payload={tier:t,label:$('keygen-label').value.trim(),emails:parseEmails($('keygen-emails').value),permissions:t==='CK_'?permissions:{}};
        const x=await api('/keys/generate',{method:'POST',body:JSON.stringify(payload)});
        const feats=t==='CK_'?enabledNames(x.permissions||permissions):[];
        $('keygen-result').innerHTML=`<div class="adduser-hint">Copy this now. It remains usable for normal key login.</div><div class="key-output">${esc(x.raw_key)}</div>${x.emails?.length?`<div class="key-meta" style="margin-top:.45rem">Google: <b>${x.emails.map(esc).join(', ')}</b></div>`:''}${feats.length?`<div class="key-meta">CK: ${feats.map(n=>`<span class="key-chip">${esc(n)}</span>`).join('')}</div>`:''}`;
        $('keygen-label').value='';$('keygen-emails').value='';await refreshKeys();
      }catch(ex){toast(ex.message)}
    };
  }
  function configModal(row){
    document.querySelector('.key-config-overlay')?.remove();const ov=document.createElement('div');ov.className='key-config-overlay';
    ov.innerHTML=`<div class="key-config"><h3>Configure ${esc(row.tier)} key</h3><div class="key-meta" style="margin-bottom:.8rem">Key ID <b>${esc(row.key_id)}</b></div><div class="adduser-field"><label>Label</label><input id="cfg-label" class="ask-input" maxlength="60" value="${esc(row.key_label||'')}"></div><div class="adduser-field"><label>Linked Google email(s)</label><textarea id="cfg-emails" class="ask-input key-email-input" maxlength="1600">${esc((row.emails||[]).join('\n'))}</textarea><div class="adduser-hint">Up to 5. Removing an email immediately removes Google-login access for it.</div></div>${row.tier==='CK_'?`<div class="ck-box show"><div class="sec-title">CK Feature Checklist</div>${checklistHtml('cfg',row.permissions||{})}</div>`:''}${!row.google_ready?'<div class="adduser-field" style="margin-top:.75rem"><label>Original raw key (only if enabling Google login)</label><input id="cfg-raw" class="ask-input" type="password" autocomplete="off" placeholder="Needed once for older keys"><div class="adduser-hint">New keys are Google-ready automatically. Older keys need the original key once so the gateway can create its encrypted compatibility record.</div></div>':''}<div id="cfg-msg" class="error-msg hidden"></div><div class="key-config-actions"><button id="cfg-cancel" class="btn">Cancel</button><button id="cfg-save" class="ask-submit">Save</button></div></div>`;
    document.body.appendChild(ov);$('cfg-cancel').onclick=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)ov.remove()};
    $('cfg-save').onclick=async()=>{try{const permissions={};ov.querySelectorAll('[data-cfg-perm]').forEach(x=>permissions[x.dataset.cfgPerm]=x.checked);const payload={label:$('cfg-label').value.trim(),emails:parseEmails($('cfg-emails').value)};if(row.tier==='CK_')payload.permissions=permissions;if($('cfg-raw')?.value)payload.raw_key=$('cfg-raw').value.trim();await api(`/keys/${row.key_id}/config`,{method:'POST',body:JSON.stringify(payload)});ov.remove();await refreshKeys();toast('Key configuration saved')}catch(ex){const m=$('cfg-msg');m.textContent=ex.message;m.classList.remove('hidden')}};
  }
  window.refreshKeys=async function(){
    if(account?.tier!=='DEV')return;try{
      keyRows=await api('/keys');const tb=$('keys-table')?.querySelector('tbody');if(!tb)return;
      const head=$('keys-table')?.querySelector('thead tr');if(head)head.innerHTML='<th>Tier</th><th>Label</th><th>Key ID</th><th>Google / CK</th><th>Status</th><th>Created</th><th>Actions</th>';
      tb.innerHTML=keyRows.length?keyRows.map(x=>{const feats=x.tier==='CK_'?enabledNames(x.permissions||{}):[];return `<tr><td>${esc(x.tier)}</td><td>${esc(x.key_label||'—')}</td><td><code>${esc(x.key_id)}</code></td><td><div class="key-meta">${x.emails?.length?x.emails.map(e=>`<div>${esc(e)}</div>`).join(''):'No linked email'}${x.tier==='CK_'?`<div style="margin-top:.2rem">${feats.length?feats.map(n=>`<span class="key-chip">${esc(n)}</span>`).join(''):'No features'}</div>`:''}${x.google_ready?'<div>Google ready</div>':''}</div></td><td>${x.active?'Active':'Revoked'}</td><td>${fmtHistTs(x.created_at)}</td><td><div class="key-action-row"><button class="btn" data-key-config="${x.key_id}">Configure</button><button class="btn ${x.active?'danger':''}" data-key-action="${x.key_id}" data-action="${x.active?'revoke':'reactivate'}">${x.active?'Revoke':'Reactivate'}</button></div></td></tr>`}).join(''):'<tr><td colspan="7" class="empty">No generated keys</td></tr>';
      tb.querySelectorAll('[data-key-config]').forEach(b=>b.onclick=()=>configModal(keyRows.find(x=>String(x.key_id)===String(b.dataset.keyConfig))));
      tb.querySelectorAll('[data-key-action]').forEach(b=>b.onclick=async()=>{await api(`/keys/${b.dataset.keyAction}/${b.dataset.action}`,{method:'POST'});await refreshKeys()});
    }catch(e){toast(e.message)}
  };

  async function bootstrap(){
    if(booting)return;booting=true;try{
      absorbOAuthHash();googleSession=readStoredSession();
      if(googleSession){try{await googleLogin();return}catch(e){clearGoogle();SITE_KEY='';showLoginError(e.message||'This Google account is not linked to an active LG key.')}}
      const saved=window.LG_LEGACY_SITE_KEY||sessionStorage.getItem('lg_site_key')||'';
      if(saved){try{await keyLogin(saved)}catch{logout()}}
    }finally{booting=false}
  }

  injectCss();injectLogin();patchTier();patchLogin();patchKeygenUi();observeGuards();
  setTimeout(bootstrap,0);
  window.LGAuth={bootstrap,logout,googleLogin,keyLogin,applyGuards};
})();
