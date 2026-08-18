(() => {
  const CARD_API='https://jwjxhxvahgrpkvaoyrzw.supabase.co/functions/v1/lg-cards';
  const GIFT_API='https://jwjxhxvahgrpkvaoyrzw.supabase.co/functions/v1/lg-card-gifts';
  const NAME_API='https://jwjxhxvahgrpkvaoyrzw.supabase.co/functions/v1/lg-card-names';
  const S={profile:null,boot:null,gifts:[],names:new Map(),busy:false,timer:null};
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const notice=m=>{try{toast(m)}catch{console.log(m)}};
  async function api(base,path,opts={}){const h=new Headers(opts.headers||{});h.set('x-site-key',SITE_KEY);if(opts.body&&!h.has('content-type'))h.set('content-type','application/json');const r=await fetch(base+path,{...opts,headers:h});let j={};try{j=await r.json()}catch{}if(!r.ok){const e=new Error(j.error||j.detail||`Request failed (${r.status})`);e.status=r.status;throw e}return j}
  const capi=(p,o)=>api(CARD_API,p,o),gapi=(p,o)=>api(GIFT_API,p,o),napi=(p,o)=>api(NAME_API,p,o);

  function injectStyles(){if($('#lg-dev-card-style'))return;const s=document.createElement('style');s.id='lg-dev-card-style';s.textContent=`
    #page-cards .cg-card{height:auto;min-width:0}
    #page-cards .cg-card-in{height:auto;min-height:100%;min-width:0}
    #page-cards .cg-card-top{grid-template-columns:minmax(0,1fr) 52px;min-width:0}
    #page-cards .cg-lines,#page-cards .cg-stat{min-width:0}
    #page-cards .cg-name,#page-cards .cg-line,#page-cards .cg-v{overflow-wrap:anywhere;word-break:break-word;white-space:normal}
    #page-cards .cg-card-stats{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
    #page-cards .cg-card-actions{position:relative;z-index:4;align-items:stretch}
    #page-cards .cg-card-actions .btn{max-width:100%;white-space:normal;overflow-wrap:anywhere}
    #page-cards .cg-rarity{max-width:100%;overflow-wrap:anywhere}
    .dg-panel{display:flex;flex-direction:column;gap:.65rem}
    .dg-label{font-family:var(--font-mono);font-size:.49rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.2rem}
    .dg-slot{display:grid;grid-template-columns:28px minmax(0,1fr) minmax(118px,.55fr);gap:.45rem;align-items:center;border:1px solid var(--border);border-radius:5px;padding:.45rem}
    .dg-slotno{font-family:var(--font-mono);font-size:.55rem;color:var(--accent2);text-align:center}
    .dg-preview{margin:.55rem 0;border:1px solid var(--border);border-radius:5px;padding:.5rem;width:100%;text-align:left;background:rgba(0,0,0,.16)}
    .dg-preview-title{font-family:var(--font-mono);font-size:.48rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.3rem}
    .dg-preview-row{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:.4rem;align-items:center;font-family:var(--font-mono);font-size:.52rem;padding:.18rem 0}
    .dg-preview-row b{overflow-wrap:anywhere}.dg-rarity{font-size:.48rem;color:var(--accent2)}
    .dg-dev-badge{font-family:var(--font-mono);font-size:.5rem;color:var(--accent);border:1px solid var(--accent);padding:.18rem .32rem;border-radius:3px}
    .dg-target-wrap{display:flex;flex-direction:column;gap:.2rem}
    @media(max-width:700px){.dg-slot{grid-template-columns:24px minmax(0,1fr)}.dg-slot .cg-select:last-child{grid-column:2}}
  `;document.head.appendChild(s)}

  function isDev(){return S.profile?.tier==='DEV'}
  function clientLabel(c){const parts=[c.alias||c.verified_username||c.key_id];if(c.verified_username&&c.verified_username!==c.alias)parts.push(`@${c.verified_username}`);if(c.is_self)parts.push('(You)');return parts.join(' · ')}
  function clientOptions(selected=''){const rows=S.boot?.clients||[];return rows.map(c=>`<option value="${c.key_id}" ${String(c.key_id)===String(selected)?'selected':''}>${esc(clientLabel(c))}</option>`).join('')}
  function playerOptions(selected=''){const rows=(S.boot?.players||[]).filter(p=>p.enabled!==false);return rows.map(p=>`<option value="${Number(p.user_id)}" ${String(p.user_id)===String(selected)?'selected':''}>${esc(p.username)} (${Number(p.user_id)})</option>`).join('')}
  const rarityOptions=(selected='REGULAR')=>['REGULAR','GOLD','HOLOGRAPHIC','CORRUPTED','PALLADIUM','DEV'].map(r=>`<option value="${r}" ${r===selected?'selected':''}>${r}</option>`).join('');
  const clientSig=()=>JSON.stringify((S.boot?.clients||[]).map(c=>[c.key_id,c.alias,c.verified_username,c.is_self]));

  function removeDevForNonDev(){if(!S.profile||isDev())return;$$('[data-cgtab="dev"]').forEach(x=>x.remove());const v=$('#cg-dev');if(v){v.classList.remove('active');v.innerHTML=''}if(document.querySelector('.cg-tab.active')?.dataset.cgtab==='dev')document.querySelector('[data-cgtab="packs"]')?.click()}

  function patchCardMakerTarget(){if(!isDev()||!S.boot)return;const sel=$('#cg-dev-target');if(!sel)return;const sig=clientSig();if(sel.dataset.dgSig!==sig){const old=sel.value;sel.innerHTML=clientOptions(old||S.boot.self_key_id);if(!sel.value&&S.boot.self_key_id)sel.value=S.boot.self_key_id;sel.dataset.dgSig=sig}if(!sel.parentElement?.classList.contains('dg-target-wrap')){const w=document.createElement('div');w.className='dg-target-wrap';sel.parentNode.insertBefore(w,sel);w.innerHTML='<div class="dg-label">Target client</div>';w.appendChild(sel)}}

  function packGiverMarkup(){const firstPlayer=(S.boot?.players||[]).find(p=>p.enabled!==false)?.user_id||'';return `<div class="sec-title">Card Pack Giver <span class="dg-dev-badge">DEV ONLY</span></div><div class="cg-sub">Choose the recipient and the exact three cards first. The recipient can preview these contents before opening the gift pack.</div><div class="dg-panel" style="margin-top:.2rem"><div><div class="dg-label">Target client</div><select id="dg-target" class="cg-select" style="width:100%">${clientOptions(S.boot?.self_key_id)}</select></div>${[1,2,3].map((n,i)=>`<div class="dg-slot"><div class="dg-slotno">${n}</div><select id="dg-player-${n}" class="cg-select" style="width:100%">${playerOptions(firstPlayer)}</select><select id="dg-rarity-${n}" class="cg-select" style="width:100%">${rarityOptions(i===0?'REGULAR':i===1?'GOLD':'HOLOGRAPHIC')}</select></div>`).join('')}<button class="btn" id="dg-grant">Give known-content pack</button><div id="dg-state" class="cg-sub"></div></div>`}

  function patchDev(){const dev=$('#cg-dev');if(!dev)return;if(!S.profile)return;if(!isDev()){removeDevForNonDev();return}if(!S.boot)return;const grid=$('.cg-dev-grid',dev);if(!grid)return;let first=grid.firstElementChild;if(!first){first=document.createElement('div');first.className='cg-panel';grid.prepend(first)}const sig=`${clientSig()}|${(S.boot.players||[]).length}`;if(first.dataset.dgSig!==sig||!$('#dg-target',first)){first.dataset.dgPackGiver='1';first.dataset.dgSig=sig;first.innerHTML=packGiverMarkup();$('#dg-grant',first).onclick=grantPack}patchCardMakerTarget()}

  async function grantPack(){if(S.busy)return;const btn=$('#dg-grant'),state=$('#dg-state');try{S.busy=true;if(btn){btn.disabled=true;btn.textContent='Giving pack…'}if(state)state.textContent='Creating pack with the exact selected contents…';const target=$('#dg-target')?.value||'',entries=[1,2,3].map(n=>({player_user_id:Number($(`#dg-player-${n}`)?.value),rarity:$(`#dg-rarity-${n}`)?.value||'REGULAR'}));const r=await gapi('/grant',{method:'POST',body:JSON.stringify({target_key_id:target,entries})});if(state)state.textContent=`Pack #${r.pack_id} sent to ${r.target_alias}.`;notice(`Gift pack sent to ${r.target_alias}`);await syncGifts()}catch(e){if(state)state.textContent=e.message;notice(e.message)}finally{S.busy=false;if(btn){btn.disabled=false;btn.textContent='Give known-content pack'}}}

  async function namesFor(ids){const missing=[...new Set(ids.filter(Boolean))].filter(id=>!S.names.has(id));if(missing.length){try{const r=await napi('',{method:'POST',body:JSON.stringify({user_ids:missing})});for(const x of r.users||[])S.names.set(Number(x.id),String(x.name))}catch{}}return S.names}
  async function syncGifts(){try{S.gifts=await gapi('/my');const ids=S.gifts.flatMap(p=>(p.entries||[]).map(e=>Number(e.player_user_id)));await namesFor(ids);patchGiftPreviews()}catch(e){console.warn('LG gift previews:',e)}}
  function patchGiftPreviews(){for(const pack of S.gifts||[]){if(pack.status!=='READY')continue;const btn=$(`[data-openpack="${pack.id}"]`);const box=btn?.closest('.cg-pack');if(!box)continue;let p=$('.dg-preview',box);if(!p){p=document.createElement('div');p.className='dg-preview';box.insertBefore(p,btn)}const html=`<div class="dg-preview-title">Known gift contents</div>${(pack.entries||[]).map(e=>`<div class="dg-preview-row"><span>${Number(e.slot)}</span><b>${esc(S.names.get(Number(e.player_user_id))||`Roblox ${Number(e.player_user_id)}`)}</b><span class="dg-rarity">${esc(e.rarity)}</span></div>`).join('')}`;const sig=JSON.stringify((pack.entries||[]).map(e=>[e.slot,e.player_user_id,e.rarity,S.names.get(Number(e.player_user_id))||'']));if(p.dataset.dgSig!==sig){p.dataset.dgSig=sig;p.innerHTML=html}}}

  async function sync(){try{S.profile=await capi('/profile');removeDevForNonDev();if(isDev()){S.boot=await gapi('/bootstrap');patchDev()}await syncGifts()}catch(e){if(e.status===403){S.boot=null;removeDevForNonDev()}else console.warn('LG DEV Cards:',e)}}
  function schedulePatch(){clearTimeout(S.timer);S.timer=setTimeout(()=>{removeDevForNonDev();patchDev();patchGiftPreviews()},45)}
  function boot(){injectStyles();const obs=new MutationObserver(schedulePatch);obs.observe(document.documentElement,{childList:true,subtree:true});sync();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync()});setInterval(()=>{if(document.visibilityState==='visible'&&$('#page-cards')?.classList.contains('active'))sync()},30000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
