(() => {
  const $ = id => document.getElementById(id);
  let overrides = new Map();

  function allowed(){
    try{return typeof account!=='undefined'&&account?.tier==='DEV'}catch{return false}
  }

  function ensureUi(){
    if(!$('lg-sim-css')){
      const s=document.createElement('style');s.id='lg-sim-css';
      s.textContent='.lg-sim-badge{font-family:var(--font-mono);font-size:.55rem;margin-left:.4rem;padding:.1rem .35rem;border:1px solid var(--accent2);border-radius:3px;color:var(--accent2)}#lg-sim-panel{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;padding:.55rem 0}#lg-sim-panel input,#lg-sim-panel select{font-family:var(--font-mono);font-size:.7rem;background:var(--bg);color:var(--text);border:1px solid var(--border);padding:.35rem .5rem;border-radius:4px}#lg-sim-panel[hidden]{display:none!important}';
      document.head.appendChild(s);
    }
    const bar=document.querySelector('#page-monitor .filter-bar');
    if(bar&&!$('lg-sim-toggle')){
      const b=document.createElement('button');b.id='lg-sim-toggle';b.type='button';b.className='btn';b.textContent='Presence Simulation';b.hidden=true;
      b.onclick=()=>{const p=$('lg-sim-panel');p.hidden=!p.hidden;if(!p.hidden)void load()};
      bar.appendChild(b);
      const p=document.createElement('div');p.id='lg-sim-panel';p.hidden=true;p.innerHTML=
        '<select id="lg-sim-user"></select><select id="lg-sim-status"><option value="OFFLINE">Offline</option><option value="WEBSITE">Website</option><option value="IN_GAME">In Game</option></select><input id="lg-sim-game" placeholder="Game name"><label style="font-size:.7rem"><input id="lg-sim-join" type="checkbox"> Join</label><input id="lg-sim-place" inputmode="numeric" placeholder="Place ID"><input id="lg-sim-job" placeholder="Instance ID"><button id="lg-sim-set" class="btn btn-accent" type="button">Set</button><button id="lg-sim-revert" class="btn danger" type="button">Revert to Detector</button>';
      bar.parentNode.insertBefore(p,bar.nextSibling);
      $('lg-sim-status').onchange=syncFields;$('lg-sim-join').onchange=syncFields;$('lg-sim-user').onchange=loadSelected;
      $('lg-sim-set').onclick=setOverride;$('lg-sim-revert').onclick=revertOverride;syncFields();
    }
    updateVisibility();
  }

  function updateVisibility(){const b=$('lg-sim-toggle');if(b)b.hidden=!allowed()}

  function syncFields(){
    const inGame=$('lg-sim-status')?.value==='IN_GAME',join=inGame&&$('lg-sim-join')?.checked;
    if($('lg-sim-game'))$('lg-sim-game').hidden=!inGame;
    if($('lg-sim-join'))$('lg-sim-join').parentElement.hidden=!inGame;
    if($('lg-sim-place'))$('lg-sim-place').hidden=!join;
    if($('lg-sim-job'))$('lg-sim-job').hidden=!join;
  }

  function loadSelected(){
    const id=Number($('lg-sim-user')?.value||0),o=overrides.get(id);
    $('lg-sim-status').value=o?(Number(o.presence_type)===2?'IN_GAME':Number(o.presence_type)===1?'WEBSITE':'OFFLINE'):'OFFLINE';
    $('lg-sim-game').value=o?.last_location||'';$('lg-sim-join').checked=Boolean(o?.join_enabled);
    $('lg-sim-place').value=o?.place_id||'';$('lg-sim-job').value=o?.game_id||'';$('lg-sim-revert').disabled=!o;syncFields();
  }

  async function load(){
    if(!allowed())return;
    const [targets,list]=await Promise.all([api('/dev/presence-targets'),api('/dev/presence-overrides')]);
    overrides=new Map((Array.isArray(list)?list:[]).map(x=>[Number(x.user_id),x]));
    $('lg-sim-user').innerHTML=(Array.isArray(targets)?targets:[]).map(x=>'<option value="'+Number(x.id)+'">'+esc(x.name)+' ('+Number(x.id)+')</option>').join('');
    loadSelected();
  }

  async function setOverride(){
    const id=Number($('lg-sim-user').value||0);if(!id)return;
    const status=$('lg-sim-status').value,inGame=status==='IN_GAME',join=inGame&&$('lg-sim-join').checked;
    const result=await api('/dev/presence-overrides/'+id,{method:'POST',body:JSON.stringify({
      status,game_name:inGame?$('lg-sim-game').value.trim():'',joinable:join,
      place_id:join?(Number($('lg-sim-place').value||0)||null):null,game_id:join?($('lg-sim-job').value.trim()||null):null
    })});
    await load();if(typeof refreshMonitor==='function')setTimeout(()=>refreshMonitor(false),300);
    toast(result?.sync?.pending?'Simulation saved; detector sync pending':'Simulation applied');
  }

  async function revertOverride(){
    const id=Number($('lg-sim-user').value||0);if(!id||!overrides.has(id))return;
    const result=await api('/dev/presence-overrides/'+id,{method:'DELETE'});
    await load();if(typeof refreshMonitor==='function')setTimeout(()=>refreshMonitor(false),350);
    toast(result?.sync?.pending?'Simulation cleared; detector refresh pending':'Reverted to live detector');
  }

  function installBadge(){
    if(typeof renderPresence!=='function'||renderPresence.__lgSimWrapped)return;
    const prior=renderPresence;
    renderPresence=function(data){
      prior(data);
      const users=data?.users||[],states=data?.states||{};
      const cards=document.querySelectorAll('#presence-grid .presence-card');
      users.forEach((u,i)=>{const st=states[String(u.id)];if(st?.source==='DEV_OVERRIDE'&&cards[i]){
        const status=cards[i].querySelector('.card-status');if(status&&!cards[i].querySelector('.lg-sim-badge')){const b=document.createElement('span');b.className='lg-sim-badge';b.textContent='SIMULATED';status.after(b)}
      }});
    };
    renderPresence.__lgSimWrapped=true;
  }

  function boot(){
    ensureUi();installBadge();
    const app=$('app');if(app)new MutationObserver(updateVisibility).observe(app,{attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();