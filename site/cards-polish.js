(() => {
  const CARD_API='https://jwjxhxvahgrpkvaoyrzw.supabase.co/functions/v1/lg-cards';
  const NAME_API='https://jwjxhxvahgrpkvaoyrzw.supabase.co/functions/v1/lg-card-names';
  const nameCache=new Map();
  const opening=new Set();
  let auctionSyncTimer=null;

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const notice=m=>{try{toast(m)}catch{console.log(m)}};
  const fmtDate=s=>s?new Date(s).toLocaleDateString([],{year:'numeric',month:'short',day:'numeric'}):'—';
  const fmtSec=s=>{s=Number(s||0);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?`${h}h ${m}m`:`${m}m`};

  async function api(base,path,opts={}){
    const h=new Headers(opts.headers||{});h.set('x-site-key',SITE_KEY);
    if(opts.body&&!h.has('content-type'))h.set('content-type','application/json');
    const r=await fetch(base+path,{...opts,headers:h});let j={};try{j=await r.json()}catch{}
    if(!r.ok)throw Object.assign(new Error(j.error||j.detail||`Request failed (${r.status})`),{status:r.status});
    return j;
  }
  const capi=(p,o)=>api(CARD_API,p,o);
  const napi=(p,o)=>api(NAME_API,p,o);

  function injectStyles(){if(q('#lg-card-polish-style'))return;const s=document.createElement('style');s.id='lg-card-polish-style';s.textContent=`
    #page-cards .btn{position:relative;transition:transform .11s ease,border-color .16s ease,color .16s ease,background .16s ease,opacity .16s ease}
    #page-cards .btn:active{transform:translateY(1px) scale(.985)}
    #page-cards .btn.cp-busy{padding-right:1.65rem;pointer-events:none;opacity:.82}
    #page-cards .btn.cp-busy::after{content:'';position:absolute;right:.48rem;top:50%;width:.48rem;height:.48rem;margin-top:-.24rem;border:1px solid currentColor;border-right-color:transparent;border-radius:50%;animation:cpSpin .55s linear infinite}
    .cg-card{transition:transform .28s cubic-bezier(.2,.8,.2,1),opacity .28s ease,filter .28s ease,border-color .28s ease,box-shadow .28s ease}
    .cg-card.cp-freezing{transform:scale(.985);border-color:var(--accent2)!important;box-shadow:0 0 0 1px rgba(0,229,255,.25),0 0 24px rgba(0,229,255,.08)}
    .cg-card.cp-frozen{border-color:rgba(126,245,255,.62)!important;box-shadow:inset 0 0 24px rgba(0,229,255,.05)}
    .cg-card.cp-burning{animation:cpBurn .8s ease forwards;pointer-events:none}
    .cg-card.cp-auctioning{transform:translateY(-3px);border-color:#ffd166!important;box-shadow:0 0 0 1px rgba(255,209,102,.22),0 10px 28px rgba(0,0,0,.28)}
    .cg-card.cp-auctioned{border-style:dashed!important;border-color:#ffd166!important}
    .cp-chip{position:absolute;z-index:5;top:.55rem;right:.55rem;font-family:var(--font-mono);font-size:.46rem;letter-spacing:.08em;padding:.18rem .32rem;border-radius:3px;background:rgba(10,10,15,.88);border:1px solid var(--border);pointer-events:none}
    .cp-chip.freeze{color:#7ef5ff;border-color:rgba(126,245,255,.5)}.cp-chip.burn{color:var(--accent);border-color:rgba(255,60,95,.5)}.cp-chip.auction{color:#ffd166;border-color:rgba(255,209,102,.5)}
    .cp-pack-working{transform:translateY(-3px);border-color:var(--accent2)!important;box-shadow:0 10px 30px rgba(0,0,0,.28);transition:.2s}
    .cp-pack-working::after{content:'OPENING';position:absolute;bottom:.65rem;font-family:var(--font-mono);font-size:.5rem;letter-spacing:.12em;color:var(--accent2);animation:cpPulse 1s ease-in-out infinite}
    .cp-open{position:fixed;inset:0;z-index:10020;background:rgba(6,6,9,.985);display:flex;align-items:center;justify-content:center;flex-direction:column;padding:1rem;overflow:hidden}
    .cp-pack-stage{width:220px;height:310px;border:1px solid #30303d;border-radius:12px;background:linear-gradient(145deg,#15151f,#07070a);display:flex;align-items:center;justify-content:center;font-size:3rem;font-weight:900;letter-spacing:-.12em;box-shadow:0 24px 90px rgba(0,0,0,.7);animation:cpPackFloat 1.1s ease-in-out infinite;position:relative;overflow:hidden}
    .cp-pack-stage::after{content:'';position:absolute;inset:-40%;background:linear-gradient(110deg,transparent 35%,rgba(0,229,255,.11),transparent 65%);animation:cpSweep 1.7s linear infinite}
    .cp-pack-stage.rip{animation:cpPackRip .5s ease forwards}
    .cp-one-wrap{width:min(365px,92vw);display:flex;flex-direction:column;gap:.75rem;align-items:center}
    .cp-one-card{width:100%;opacity:0;transform:translateY(26px) scale(.92) rotateY(12deg);transition:.38s cubic-bezier(.2,.8,.2,1)}
    .cp-one-card.show{opacity:1;transform:none}.cp-one-card.leave{opacity:0;transform:translateX(-42px) scale(.96)}
    .cp-one-card .cg-card{min-height:360px;width:100%}
    .cp-reveal-meta{font-family:var(--font-mono);font-size:.56rem;color:var(--subtext);letter-spacing:.08em}.cp-reveal-meta b{color:var(--text)}
    .cp-next{min-width:150px}.cp-opening-note{font-family:var(--font-mono);font-size:.58rem;color:var(--subtext);margin-top:.8rem;min-height:1rem}
    .cp-confirm-card{border:1px solid var(--border);border-radius:7px;padding:.65rem;margin-top:.7rem;background:var(--bg);font-family:var(--font-mono);font-size:.58rem;color:var(--subtext)}
    @keyframes cpSpin{to{transform:rotate(360deg)}}@keyframes cpPulse{50%{opacity:.35}}@keyframes cpPackFloat{50%{transform:translateY(-8px) rotate(1deg)}}
    @keyframes cpPackRip{0%{transform:scale(1)}55%{transform:scale(1.08) rotate(-3deg)}100%{transform:scale(.18) rotate(12deg);opacity:0;filter:blur(10px)}}
    @keyframes cpSweep{to{transform:translateX(70%)}}@keyframes cpBurn{0%{filter:none;opacity:1}55%{filter:grayscale(.7) contrast(1.2);transform:scale(.985)}100%{filter:blur(8px) grayscale(1);opacity:0;transform:scale(.78) translateY(12px)}}
    @media(max-width:600px){.cp-one-card .cg-card{min-height:330px}}
  `;document.head.appendChild(s)}

  function busy(btn,label){if(!btn||btn.classList.contains('cp-busy'))return null;const old=btn.textContent;btn.dataset.cpOld=old;btn.textContent=label||old;btn.classList.add('cp-busy');setTimeout(()=>{if(btn.isConnected&&btn.classList.contains('cp-busy'))unbusy(btn)},5000);return old}
  function unbusy(btn){if(!btn)return;btn.classList.remove('cp-busy');if(btn.dataset.cpOld!==undefined){btn.textContent=btn.dataset.cpOld;delete btn.dataset.cpOld}}
  function chip(card,type,text){if(!card)return;let x=q(`.cp-chip.${type}`,card);if(!x){x=document.createElement('div');x.className=`cp-chip ${type}`;card.appendChild(x)}x.textContent=text;return x}
  function removeChip(card,type){q(`.cp-chip.${type}`,card)?.remove()}
  function cardId(card){const b=q('[data-auction],[data-freeze],[data-burn]',card);return Number(b?.dataset.auction||b?.dataset.freeze||b?.dataset.burn||0)}
  function userId(card){const line=qa('.cg-line',card).find(x=>x.textContent.trim().startsWith('PLAYER ID'));const m=line?.textContent.match(/(\d+)/);return m?Number(m[1]):0}

  async function officialNames(ids){const want=[...new Set(ids.filter(Boolean))],missing=want.filter(id=>!nameCache.has(id));if(missing.length){try{const r=await napi('',{method:'POST',body:JSON.stringify({user_ids:missing})});for(const u of r.users||[])nameCache.set(Number(u.id),String(u.name))}catch(e){console.warn('LG card usernames:',e)}}return new Map(want.map(id=>[id,nameCache.get(id)]).filter(([,v])=>v))}
  async function fixVisibleNames(){const cards=qa('#page-cards .cg-card').filter(c=>!c.classList.contains('rar-dev'));if(!cards.length)return;const names=await officialNames(cards.map(userId));for(const c of cards){const n=names.get(userId(c));if(n){const el=q('.cg-name',c);if(el&&el.textContent!==n)el.textContent=n}}}
  async function attachNames(cards){const names=await officialNames((cards||[]).map(c=>Number(c.player_user_id)));return(cards||[]).map(c=>({...c,roblox_username:names.get(Number(c.player_user_id))||c.username}))}

  function miniCard(c){const name=c.custom_title||c.roblox_username||c.username||String(c.player_user_id),img=(c.custom_design||{}).image_url||c.avatar_url||'';return`<div class="cg-card rar-${String(c.rarity||'REGULAR').toLowerCase()}"><div class="cg-card-in"><div class="cg-card-top"><div class="cg-lines"><div class="cg-name">${esc(name)}</div><div class="cg-line">PLAYER ID · ${Number(c.player_user_id)}</div><div class="cg-line">STATUS · ${esc(c.status||'—')}</div><div class="cg-line">CREATED · ${esc(fmtDate(c.created_at))}</div></div>${img?`<img class="cg-avatar" src="${esc(img)}" alt="">`:'<div class="cg-avatar"></div>'}</div><span class="cg-rarity">${esc(c.rarity||'REGULAR')}</span><div class="cg-card-stats"><div class="cg-stat"><div class="cg-k">Est. value</div><div class="cg-v">${Number(c.estimated_value_tc||0).toLocaleString()} TC</div></div><div class="cg-stat"><div class="cg-k">Playtime</div><div class="cg-v">${fmtSec(c.lifetime_seconds)}</div></div><div class="cg-stat"><div class="cg-k">Circulation</div><div class="cg-v">${c.circulation_active??'—'}/${c.circulation_printed??'—'}</div></div><div class="cg-stat"><div class="cg-k">Age</div><div class="cg-v">${Number(c.age_days||0).toFixed(1)}d</div></div></div></div></div>`}

  function makePackOverlay(){const o=document.createElement('div');o.className='cp-open';o.innerHTML=`<div class="cp-pack-stage">LG</div><div class="cp-opening-note">Preparing your pack…</div>`;document.body.appendChild(o);return o}
  async function revealOneByOne(o,cards){const pack=q('.cp-pack-stage',o),note=q('.cp-opening-note',o);if(pack){note.textContent='Pack ready';await sleep(320);pack.classList.add('rip');await sleep(520);pack.remove()}const wrap=document.createElement('div');wrap.className='cp-one-wrap';o.insertBefore(wrap,note);for(let i=0;i<cards.length;i++){wrap.innerHTML=`<div class="cp-reveal-meta">CARD <b>${i+1}</b> OF <b>${cards.length}</b></div><div class="cp-one-card">${miniCard(cards[i])}</div><button class="btn cp-next">${i===cards.length-1?'Finish':'Next card'}</button>`;const one=q('.cp-one-card',wrap);requestAnimationFrame(()=>requestAnimationFrame(()=>one.classList.add('show')));note.textContent=i===cards.length-1?'Final card':'Reveal one card at a time';await new Promise(resolve=>{q('.cp-next',wrap).onclick=resolve;one.onclick=resolve});one.classList.add('leave');await sleep(220)}wrap.remove();note.textContent='Pack opened';await sleep(120)}
  async function openPack(btn){const id=Number(btn.dataset.openpack);if(!id||opening.has(id))return;opening.add(id);const pack=btn.closest('.cg-pack');pack?.classList.add('cp-pack-working');busy(btn,'Opening…');const overlay=makePackOverlay();try{const request=capi(`/packs/${id}/open`,{method:'POST'});await sleep(260);let res=await request;res.cards=await attachNames(res.cards||[]);await revealOneByOne(overlay,res.cards);pack?.remove();overlay.remove();notice('Pack added to your inventory');setTimeout(()=>q('.page-nav-btn[data-tab="cards"]')?.click(),50)}catch(e){overlay.remove();pack?.classList.remove('cp-pack-working');unbusy(btn);notice(e.message)}finally{opening.delete(id)}}

  async function freeze(btn){const id=Number(btn.dataset.freeze),card=btn.closest('.cg-card'),old=btn.dataset.frozen==='1',next=!old;if(!id||!card)return;card.classList.add('cp-freezing');chip(card,'freeze',next?'FREEZING…':'UNFREEZING…');busy(btn,next?'Freezing…':'Unfreezing…');try{await capi(`/cards/${id}/freeze`,{method:'POST',body:JSON.stringify({frozen:next})});btn.dataset.frozen=next?'1':'0';btn.textContent=next?'Unfreeze':'Freeze';delete btn.dataset.cpOld;btn.classList.remove('cp-busy');card.classList.remove('cp-freezing');card.classList.toggle('cp-frozen',next);chip(card,'freeze',next?'FROZEN':'LIVE');if(!next)setTimeout(()=>removeChip(card,'freeze'),700);notice(next?'Card frozen':'Card returned to live stats')}catch(e){card.classList.remove('cp-freezing');removeChip(card,'freeze');unbusy(btn);notice(e.message)}}

  function burnDialog(btn){const card=btn.closest('.cg-card'),id=Number(btn.dataset.burn);if(!card||!id)return;const name=q('.cg-name',card)?.textContent||'this card';const m=document.createElement('div');m.className='cg-modal';m.innerHTML=`<div class="cg-modal-box"><div class="sec-title">Remove card from circulation</div><div class="cg-sub">This permanently removes <b>${esc(name)}</b> from your collection and cannot be undone.</div><div class="cp-confirm-card">The circulation count will decrease permanently.</div><div class="cg-row" style="margin-top:.8rem"><button class="btn danger" id="cp-burn-confirm">Delete permanently</button><button class="btn" id="cp-burn-cancel">Cancel</button></div></div>`;document.body.appendChild(m);q('#cp-burn-cancel',m).onclick=()=>m.remove();q('#cp-burn-confirm',m).onclick=async()=>{const yes=q('#cp-burn-confirm',m);busy(yes,'Removing…');try{await capi(`/cards/${id}/burn`,{method:'POST'});m.remove();card.classList.add('cp-burning');chip(card,'burn','REMOVED');notice('Card removed from circulation');setTimeout(()=>card.remove(),780)}catch(e){unbusy(yes);notice(e.message)}}}

  function auctionDialog(btn){const card=btn.closest('.cg-card'),id=Number(btn.dataset.auction);if(!card||!id)return;const name=q('.cg-name',card)?.textContent||'Card';const valueText=qa('.cg-stat',card)[0]?.querySelector('.cg-v')?.textContent||'0';const estimate=Math.max(1,Number(valueText.replace(/[^0-9.]/g,''))||1);const m=document.createElement('div');m.className='cg-modal';m.innerHTML=`<div class="cg-modal-box"><div class="sec-title">List ${esc(name)}</div><div class="cg-sub">Estimated value: ${Math.round(estimate).toLocaleString()} TC</div><div class="cg-row" style="margin-top:.8rem"><input id="cp-start-bid" class="cg-input" type="number" min="1" value="${Math.max(1,Math.round(estimate*.8))}"><select id="cp-duration" class="cg-select"><option value="60">1 hour</option><option value="360">6 hours</option><option value="1440" selected>1 day</option><option value="4320">3 days</option><option value="10080">7 days</option></select></div><div class="cg-row" style="margin-top:.8rem"><button class="btn" id="cp-list">List card</button><button class="btn" id="cp-list-cancel">Cancel</button></div></div>`;document.body.appendChild(m);q('#cp-list-cancel',m).onclick=()=>m.remove();q('#cp-list',m).onclick=async()=>{const b=q('#cp-list',m);busy(b,'Listing…');card.classList.add('cp-auctioning');chip(card,'auction','LISTING…');try{await capi('/auctions',{method:'POST',body:JSON.stringify({card_id:id,start_bid_tc:Number(q('#cp-start-bid',m).value),minutes:Number(q('#cp-duration',m).value)})});m.remove();card.classList.remove('cp-auctioning');card.classList.add('cp-auctioned');chip(card,'auction','AUCTION');btn.textContent='Listed';btn.disabled=true;notice('Card listed');setTimeout(()=>q('.page-nav-btn[data-tab="cards"]')?.click(),500)}catch(e){card.classList.remove('cp-auctioning');removeChip(card,'auction');unbusy(b);notice(e.message)}}}

  async function syncAuctionBadges(){clearTimeout(auctionSyncTimer);auctionSyncTimer=setTimeout(async()=>{if(!SITE_KEY||!q('#page-cards'))return;try{const rows=await capi('/auctions');const active=new Set((rows||[]).filter(a=>a.status==='ACTIVE'&&a.is_mine).map(a=>Number(a.card_id)));for(const card of qa('#cg-inventory .cg-card')){const id=cardId(card),listed=active.has(id);card.classList.toggle('cp-auctioned',listed);if(listed){chip(card,'auction','AUCTION');const b=q('[data-auction]',card);if(b){b.textContent='Listed';b.disabled=true}}else removeChip(card,'auction')}for(const card of qa('#cg-auctions .cg-card'))chip(card,'auction','AUCTION')}catch{}},160)}

  function decorateFrozen(){for(const card of qa('#cg-inventory .cg-card')){const b=q('[data-freeze]',card);const frozen=b?.dataset.frozen==='1';card.classList.toggle('cp-frozen',frozen);if(frozen)chip(card,'freeze','FROZEN')}}
  function tactile(btn,label){if(!btn||btn.classList.contains('cp-busy'))return;busy(btn,label||btn.textContent)}

  document.addEventListener('click',e=>{
    const t=e.target.closest?.('#page-cards button');if(!t)return;
    if(t.matches('[data-openpack]')){e.preventDefault();e.stopImmediatePropagation();openPack(t);return}
    if(t.matches('[data-freeze]')){e.preventDefault();e.stopImmediatePropagation();freeze(t);return}
    if(t.matches('[data-burn]')){e.preventDefault();e.stopImmediatePropagation();burnDialog(t);return}
    if(t.matches('[data-auction]')){e.preventDefault();e.stopImmediatePropagation();auctionDialog(t);return}
    if(t.matches('[data-showcase]'))tactile(t,t.textContent.includes('Un')?'Removing…':'Adding…');
    if(t.matches('[data-bid]'))tactile(t,'Placing…');
    if(t.matches('[data-cancelauction]'))tactile(t,'Cancelling…');
    if(t.matches('[data-tradeact]'))tactile(t,'Updating…');
    if(t.id==='cg-send-trade')tactile(t,'Sending…');
    if(t.id==='cg-save-alias')tactile(t,'Saving…');
    if(t.id==='cg-dev-give')tactile(t,'Creating…');
    if(t.matches('[data-savepool]'))tactile(t,'Saving…');
  },true);

  let patchQueued=false;
  const patch=()=>{if(patchQueued)return;patchQueued=true;queueMicrotask(()=>{patchQueued=false;decorateFrozen();fixVisibleNames();syncAuctionBadges()})};
  function boot(){injectStyles();const mo=new MutationObserver(patch);mo.observe(document.documentElement,{childList:true,subtree:true});patch();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')patch()})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
