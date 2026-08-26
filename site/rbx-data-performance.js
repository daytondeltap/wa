(()=>{
  /* RBX data-performance layer.
     Keeps all RBX features/data, but avoids rebuilding large DOM trees every poll. */
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const perf=()=>document.body.classList.contains('lg-perf-lite')?'lite':document.body.classList.contains('lg-perf-balanced')?'balanced':'full';
  const isHidden=()=>document.hidden||q('#app')?.classList.contains('hidden')||document.body.classList.contains('mc-mode');
  const imgAttrs='loading="lazy" decoding="async" fetchpriority="low"';
  const cache={presence:'',totals:'',charts:'',games:'',sessions:'',events:'',leaderboard:''};
  const virtual=new WeakMap();
  let monitorBusy=false,pendingFull=false,lastHeavy=0,lastFilter='';

  function fastSig(rows,fields){
    if(!Array.isArray(rows))return String(rows??'');
    const n=rows.length;if(!n)return '0';
    const pick=x=>fields.map(k=>String(x?.[k]??'')).join('~');
    const a=rows[0],b=rows[Math.floor(n/2)],c=rows[n-1];
    return `${n}|${pick(a)}|${pick(b)}|${pick(c)}`;
  }
  function presenceSig(data){
    const users=data?.users||[],states=data?.states||{};
    return users.map(u=>{const s=states[String(u.id)]||{};return [u.id,u.name,s.presence_type,s.last_location,s.place_id,s.game_id,s.updated_at,data?.avatars?.[String(u.id)]||''].join('~')}).join('|');
  }

  function ensurePresenceDelegation(){
    const grid=q('#presence-grid');if(!grid||grid.dataset.lgPerfClick)return;
    grid.dataset.lgPerfClick='1';
    grid.addEventListener('click',e=>{const card=e.target.closest?.('[data-join]');if(!card)return;try{openJoin(JSON.parse(card.dataset.join))}catch{}},{passive:true});
  }

  if(typeof renderPresence==='function')renderPresence=function(data){
    const users=data?.users||[],states=data?.states||{},avatars=data?.avatars||{},grid=q('#presence-grid');
    if(!grid)return;
    const sig=presenceSig(data);if(sig===cache.presence)return;cache.presence=sig;
    ensurePresenceDelegation();
    if(!users.length){grid.innerHTML='<div class="empty">No tracked users</div>';return}
    q('.empty',grid)?.remove();
    const label={0:['offline','OFFLINE','status-offline'],1:['website','ON WEBSITE','status-website'],2:['ingame','IN GAME','status-ingame'],3:['studio','IN STUDIO','status-studio'],4:['invisible','INVISIBLE','status-invisible']};
    const keep=new Set();
    for(const u of users){
      const id=String(u.id),s=states[id]||{presence_type:0},info=label[Number(s.presence_type)]||label[0],img=avatars[id]||'',join=Number(s.presence_type)===2&&account?.can_join&&s.place_id;
      keep.add(id);
      let card=q(`.presence-card[data-rbx-user="${CSS.escape(id)}"]`,grid);
      if(!card){
        card=document.createElement('div');card.dataset.rbxUser=id;
        card.innerHTML='<div class="card-head"><div class="avatar avatar-md lg-avatar-slot"></div><div><div class="card-username"></div><div class="tracked-id"></div></div></div><span class="card-status"></span><div class="card-game"></div><div class="card-time"></div>';
        grid.appendChild(card);
      }
      card.className=`presence-card ${info[0]}`;
      if(join)card.dataset.join=JSON.stringify({id:u.id,name:u.name,game:s.last_location||'',place:s.place_id,instance:s.game_id||'',avatar:img});else delete card.dataset.join;
      const head=q('.card-head',card),slot=q('.lg-avatar-slot',card)||q('.avatar',card);
      if(img){
        let im=slot?.tagName==='IMG'?slot:null;
        if(!im){im=document.createElement('img');im.className='avatar avatar-md lg-avatar-slot';im.alt='';im.loading='lazy';im.decoding='async';im.fetchPriority='low';slot?.replaceWith(im)}
        if(im.src!==img)im.src=img;
      }else if(slot?.tagName==='IMG'){
        const ph=document.createElement('div');ph.className='avatar avatar-md lg-avatar-slot';slot.replaceWith(ph);
      }
      const name=q('.card-username',card),tid=q('.tracked-id',card),status=q('.card-status',card),game=q('.card-game',card),time=q('.card-time',card);
      if(name&&name.textContent!==String(u.name||''))name.textContent=u.name||'';
      if(tid&&tid.textContent!==id)tid.textContent=id;
      if(status){status.className=`card-status ${info[2]}`;if(status.textContent!==info[1])status.textContent=info[1]}
      if(game){const text=s.last_location?`🎮 ${s.last_location}`:'';game.hidden=!text;if(game.textContent!==text)game.textContent=text}
      if(time){const text=s.updated_at?'Updated '+fmtTs(s.updated_at):'Waiting for first poll';if(time.textContent!==text)time.textContent=text}
      if(head)head.style.minWidth='0';
    }
    qa('.presence-card[data-rbx-user]',grid).forEach(card=>{if(!keep.has(card.dataset.rbxUser))card.remove()});
  };

  if(typeof renderTotals==='function')renderTotals=function(rows,avatars){
    const host=q('#user-totals');if(!host)return;
    const sig=fastSig(rows,['user_id','username','total_seconds','sessions']);if(sig===cache.totals)return;cache.totals=sig;
    host.innerHTML=rows?.length?rows.map(x=>`<div class="user-tile">${avatars?.[String(x.user_id)]?`<div class="tile-head"><img class="avatar avatar-sm" ${imgAttrs} width="32" height="32" src="${esc(avatars[String(x.user_id)])}" alt=""><div class="tile-name">${esc(x.username)}</div></div>`:`<div class="tile-head"><div class="tile-name">${esc(x.username)}</div></div>`}<div class="tile-stat">Total <span>${fmtSeconds(x.total_seconds)}</span></div><div class="tile-stat">Sessions <span>${x.sessions}</span></div></div>`).join(''):'<div class="empty">No completed sessions yet</div>';
  };

  function chartOptions(){
    const lite=perf()==='lite';
    return {responsive:true,maintainAspectRatio:false,animation:false,normalized:true,devicePixelRatio:Math.min(window.devicePixelRatio||1,lite?1:1.5),interaction:{mode:'nearest',intersect:false},plugins:{legend:{display:false}},elements:{point:{radius:lite?0:2,hoverRadius:3}},scales:{x:{ticks:{color:'#8888aa',maxTicksLimit:lite?7:12},grid:{display:!lite,color:'#1e1e2e'}},y:{ticks:{color:'#8888aa',maxTicksLimit:lite?5:8,callback:v=>fmtSeconds(v)},grid:{display:!lite,color:'#1e1e2e'}}}};
  }
  if(typeof renderCharts==='function')renderCharts=function(data){
    if(typeof Chart==='undefined')return;
    const d=data?.daily||[],h=data?.hourly||[],sig=fastSig(d,['day','total_seconds'])+'|'+fastSig(h,['hour','total_seconds']);if(sig===cache.charts)return;cache.charts=sig;
    const opts=chartOptions();
    if(!dailyChart){dailyChart=new Chart(q('#daily-chart'),{type:'line',data:{labels:[],datasets:[{data:[],borderColor:'#00e5ff',backgroundColor:'rgba(0,229,255,.08)',fill:true,tension:.2,pointRadius:opts.elements.point.radius}]},options:opts})}
    dailyChart.data.labels=d.map(x=>x.day);dailyChart.data.datasets[0].data=d.map(x=>x.total_seconds);dailyChart.options.devicePixelRatio=opts.devicePixelRatio;dailyChart.options.animation=false;dailyChart.update('none');
    if(!hourlyChart){hourlyChart=new Chart(q('#hourly-chart'),{type:'bar',data:{labels:[],datasets:[{data:[],backgroundColor:'rgba(255,60,95,.55)',borderColor:'#ff3c5f',borderWidth:1}]},options:opts})}
    hourlyChart.data.labels=h.map(x=>String(x.hour).padStart(2,'0'));hourlyChart.data.datasets[0].data=h.map(x=>x.total_seconds);hourlyChart.options.devicePixelRatio=opts.devicePixelRatio;hourlyChart.options.animation=false;hourlyChart.update('none');
  };

  function setVirtualTable(tbody,rows,rowHtml,cols,empty,cacheKey){
    if(!tbody)return;
    const wrap=tbody.closest('.table-wrap'),threshold=perf()==='lite'?45:90;
    if(!rows?.length){virtual.delete(tbody);wrap?.classList.remove('lg-vtable-wrap');tbody.innerHTML=`<tr><td colspan="${cols}" class="empty">${empty}</td></tr>`;return}
    if(rows.length<=threshold){virtual.delete(tbody);wrap?.classList.remove('lg-vtable-wrap');tbody.innerHTML=rows.map(rowHtml).join('');return}
    wrap?.classList.add('lg-vtable-wrap');
    let st=virtual.get(tbody);
    if(!st){
      st={rows:[],rowHtml,cols,rowH:perf()==='lite'?43:40,lastStart:-1,lastEnd:-1,raf:0};virtual.set(tbody,st);
      wrap?.addEventListener('scroll',()=>{if(st.raf)return;st.raf=requestAnimationFrame(()=>{st.raf=0;drawVirtual(tbody)})},{passive:true});
    }
    st.rows=rows;st.rowHtml=rowHtml;st.cols=cols;st.rowH=perf()==='lite'?43:40;st.cacheKey=cacheKey;st.lastStart=-1;st.lastEnd=-1;
    drawVirtual(tbody,true);
  }
  function drawVirtual(tbody,force=false){
    const st=virtual.get(tbody),wrap=tbody.closest('.table-wrap');if(!st||!wrap||wrap.offsetParent===null)return;
    const view=Math.max(260,wrap.clientHeight||440),overscan=8,start=Math.max(0,Math.floor(wrap.scrollTop/st.rowH)-overscan),count=Math.ceil(view/st.rowH)+overscan*2,end=Math.min(st.rows.length,start+count);
    if(!force&&start===st.lastStart&&end===st.lastEnd)return;st.lastStart=start;st.lastEnd=end;
    const top=start*st.rowH,bottom=Math.max(0,(st.rows.length-end)*st.rowH);
    tbody.innerHTML=`${top?`<tr class="lg-vspace"><td colspan="${st.cols}" style="height:${top}px"></td></tr>`:''}${st.rows.slice(start,end).map(st.rowHtml).join('')}${bottom?`<tr class="lg-vspace"><td colspan="${st.cols}" style="height:${bottom}px"></td></tr>`:''}`;
  }
  function redrawVirtuals(){virtual.forEach?.(()=>{});qa('.lg-vtable-wrap tbody').forEach(t=>drawVirtual(t,true))}

  if(typeof renderGames==='function')renderGames=function(rows){
    const sig=fastSig(rows,['location_name','sessions','total_seconds','avg_seconds','max_seconds']);if(sig===cache.games)return;cache.games=sig;
    const body=q('#games-table tbody');if(body)body.innerHTML=rows?.length?rows.map(x=>`<tr><td>${esc(x.location_name)}</td><td>${x.sessions}</td><td>${fmtSeconds(x.total_seconds)}</td><td>${fmtSeconds(x.avg_seconds)}</td><td>${fmtSeconds(x.max_seconds)}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">No game data yet</td></tr>';
  };
  if(typeof renderSessions==='function')renderSessions=function(rows){
    const sig=fastSig(rows,['id','user_id','username','location_name','start_time','end_time','duration_seconds']);if(sig===cache.sessions)return;cache.sessions=sig;
    setVirtualTable(q('#sessions-table tbody'),rows,x=>`<tr><td>${esc(x.username)}</td><td>${esc(x.location_name||'—')}</td><td>${fmtTs(x.start_time)}</td><td>${x.end_time?fmtTs(x.end_time):'LIVE'}</td><td>${x.end_time?fmtSeconds(x.duration_seconds):'LIVE'}</td></tr>`,5,'No sessions yet','sessions');
  };
  if(typeof renderEvents==='function')renderEvents=function(rows){
    const sig=fastSig(rows,['id','timestamp','username','event_type','old_location','new_location','old_status','new_status']);if(sig===cache.events)return;cache.events=sig;
    const cls=x=>x==='ENTERED_GAME'?'tag-entered':x==='LEFT_GAME'?'tag-left':x==='SWITCHED_GAME'?'tag-switched':'tag-started';
    setVirtualTable(q('#events-table tbody'),rows,x=>`<tr><td>${fmtTs(x.timestamp)}</td><td>${esc(x.username)}</td><td><span class="tag ${cls(x.event_type)}">${esc(x.event_type)}</span></td><td>${esc(x.old_location||x.old_status||'—')}</td><td>${esc(x.new_location||x.new_status||'—')}</td></tr>`,5,'No events yet','events');
  };

  if(typeof refreshLeaderboard==='function')refreshLeaderboard=async function(){
    try{
      const rows=await api('/leaderboard'),sig=fastSig(rows,['rank','user_id','username','title','total_seconds','sessions','avatar_url']);if(sig===cache.leaderboard)return;cache.leaderboard=sig;
      const max=Math.max(1,...rows.map(x=>Number(x.total_seconds||0))),body=q('#lb-table tbody');if(!body)return;
      body.innerHTML=rows.length?rows.map((x,i)=>`<tr><td class="lb-rank lb-rank-${i+1}">${x.rank}</td><td><div class="lb-user-cell">${x.avatar_url?`<img class="avatar avatar-md" ${imgAttrs} width="44" height="44" src="${esc(x.avatar_url)}" alt="">`:''}<div><div class="lb-username">${esc(x.username)}</div>${x.title?`<div class="lb-title">${esc(x.title)}</div>`:''}<div class="lb-userid">${x.user_id}</div></div></div></td><td class="lb-bar-cell"><div class="lb-bar-track"><div class="lb-bar-fill" style="width:${Math.max(2,Math.round(Number(x.total_seconds||0)/max*100))}%"></div></div></td><td class="lb-time">${fmtSeconds(x.total_seconds)}</td><td class="lb-sessions">${x.sessions}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">No players yet</td></tr>';
    }catch(e){toast(e.message)}
  };

  if(typeof refreshMonitor==='function')refreshMonitor=async function(mark=true){
    if(!account||!SITE_KEY)return;
    if(!mark&&isHidden())return;
    if(monitorBusy){if(mark)pendingFull=true;return}
    monitorBusy=true;
    try{
      const uid=q('#user-filter')?.value||'',days=q('#days-filter')?.value||'',filter=`${uid}|${days}`,changed=filter!==lastFilter,mode=perf(),heavyEvery=mode==='lite'?30000:mode==='balanced'?20000:10000,full=Boolean(mark||changed||Date.now()-lastHeavy>=heavyEvery);
      const requests=[apiGet('/monitor/presence',{user_id:uid}),apiGet('/monitor/totals',{user_id:uid})];
      if(full)requests.push(apiGet('/monitor/charts',{user_id:uid,days:days||30}),apiGet('/monitor/top_games',{user_id:uid,days}),apiGet('/monitor/sessions',{user_id:uid,days}),apiGet('/monitor/events',{user_id:uid}));
      const out=await Promise.all(requests),presence=out[0],totals=out[1];
      renderPresence(presence);renderTotals(totals,presence?.avatars||{});
      if(full){renderCharts(out[2]);renderGames(out[3]);renderSessions(out[4]);renderEvents(out[5]);lastHeavy=Date.now();lastFilter=filter}
      if(mark&&q('#last-update'))q('#last-update').textContent=new Date().toLocaleTimeString();
    }catch(e){if(mark||!document.hidden)toast(e.message)}finally{
      monitorBusy=false;
      if(pendingFull){pendingFull=false;setTimeout(()=>refreshMonitor(true),0)}
    }
  };

  function boot(){
    ensurePresenceDelegation();
    document.addEventListener('click',e=>{if(e.target.closest?.('[data-inner-tab]'))setTimeout(redrawVirtuals,0)},{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&typeof activePage!=='undefined'&&activePage==='monitor'&&!document.body.classList.contains('mc-mode'))setTimeout(()=>refreshMonitor(false),120)},{passive:true});
    addEventListener('resize',()=>requestAnimationFrame(redrawVirtuals),{passive:true});
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
