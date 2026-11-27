(() => {
  const get = id => document.getElementById(id);
  const root = get('page-monitor');
  const tabs = [...root.querySelectorAll('[data-monitor-view]')];
  const statusButtons = [...root.querySelectorAll('[data-monitor-status]')];
  const pageSize = 12;
  const cache = new Map();
  const mounted = new Map();
  const cards = new Map();
  const pages = {live:0,totals:0,sessions:0,events:0};
  const chartViews = new Map();
  const number = new Intl.NumberFormat();
  const imgAttrs = 'loading="lazy" decoding="async" fetchpriority="low"';
  let view = 'live', statusFilter = 'all', viewer, lastAvatars = {}, renderVersion = 0;
  let leaderboardSignature = '';
  const duration = seconds => fmtSeconds(Math.max(0, Math.floor(Number(seconds) || 0)));
  const lower = value => String(value ?? '').toLocaleLowerCase();

  const resources = {
    live: [['presence',20_000]],
    playtime: [['totals',60_000],['charts',60_000],['top_games',60_000]],
    sessions: [['sessions',60_000]],
    events: [['events',60_000]],
  };

  function currentViewer() {
    return account && SITE_KEY ? JSON.stringify([account.key_id,SITE_KEY]) : null;
  }

  function display(node,value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function visible() {
    return !document.hidden && activePage === 'monitor' && !get('app').classList.contains('hidden') &&
      !document.body.classList.contains('mc-mode');
  }

  function queryFor(name) {
    const user_id = get('user-filter').value;
    const days = get('days-filter').value;
    if (name === 'charts') return {user_id,days:days || 30};
    if (name === 'sessions' || name === 'top_games') return {user_id,days};
    return {user_id};
  }

  function read(name,params,ttl,force) {
    const key = JSON.stringify([name,params]);
    let entry = cache.get(key);
    if (!entry) {
      entry = {};
      cache.set(key,entry);
    }
    if (!entry.pending && (force || Date.now() - (entry.updated || 0) >= ttl)) {
      entry.pending = apiGet('/monitor/' + name,params,force ? {cache:'no-store'} : undefined).then(data => {
        entry.data = data;
        entry.updated = Date.now();
        return data;
      }).finally(() => {
        entry.pending = null;
        for (const [oldKey,old] of cache) {
          if (cache.size <= 24) break;
          if (!old.pending && oldKey !== key) cache.delete(oldKey);
        }
      });
    }
    return {key,entry};
  }

  function setViewer(next) {
    if (viewer === next) return;
    viewer = next;
    ++renderVersion;
    cache.clear();
    mounted.clear();
    cards.clear();
    lastAvatars = {};
    leaderboardSignature = '';
    get('lb-table').tBodies[0].replaceChildren();
    for (const kind of Object.keys(pages)) pages[kind] = 0;
    statusFilter = 'all';
    for (const search of ['monitor-search','monitor-sessions-search','monitor-events-search']) get(search).value = '';
    window.LGActivityCheckin?.update({});
    get('presence-grid').replaceChildren();
    get('user-totals').replaceChildren();
    for (const id of ['sessions-table','events-table','games-table']) get(id).tBodies[0].replaceChildren();
    for (const chart of chartViews.values()) chart.instance.destroy();
    chartViews.clear();
    get('monitor-chart-row').hidden = true;
    get('monitor-chart-scope').hidden = true;
    display(get('monitor-update'),'');
    if (!next) showView('live');
  }

  function note(text) {
    const target = get('monitor-message');
    target.hidden = !text;
    display(target,text);
  }

  function bounds(kind,length) {
    const max = Math.max(0,Math.ceil(length/pageSize)-1);
    pages[kind] = Math.min(max,Math.max(0,pages[kind]));
    const first = pages[kind]*pageSize;
    const pager = get('monitor-' + kind + '-pager');
    pager.hidden = max === 0;
    pager.querySelector('[data-page-step="-1"]').disabled = pages[kind] === 0;
    pager.querySelector('[data-page-step="1"]').disabled = pages[kind] === max;
    display(pager.querySelector('span'),length ? `${number.format(first+1)}–${number.format(Math.min(first+pageSize,length))} of ${number.format(length)}` : '');
    return [first,first+pageSize];
  }

  function groupFor(state,description) {
    const label = description.label[0];
    if (label === 'ingame') return 'game';
    if (label === 'website' || label === 'studio') return 'online';
    if (label === 'offline' && state?.presence_type === 0) return 'offline';
    return 'other';
  }

  function createCard(id) {
    const node = document.createElement('article');
    node.dataset.rbxUser = id;
    node.innerHTML = '<div class="card-head"><img class="avatar avatar-md" alt="" width="44" height="44" loading="lazy" decoding="async" hidden><span class="avatar avatar-md" aria-hidden="true"></span><div><h3 class="card-username"></h3><div class="tracked-id"></div></div></div><span class="card-status"></span><div class="card-game"></div><div class="activity-checkin-note" hidden></div><div class="monitor-card-actions"><span class="card-time"></span><button type="button" class="btn" hidden></button></div>';
    const [image,placeholder,name,user,status,game,checkin,time,join] =
      ['img','.card-head>span','h3','.tracked-id','.card-status','.card-game','.activity-checkin-note','.card-time','button'].map(selector=>node.querySelector(selector));
    display(user,id);
    return {node,image,placeholder,name,status,game,checkin,time,join};
  }

  function patchCard(card,row,now,data) {
    const {user,id,state,description} = row;
    const [style,label,badge] = description.label;
    const image = data.avatars?.[id] || '';
    const available = description.actionable && Boolean(account?.can_join);
    const checkin = activityCheckinLabel(data.activity_checkins?.[id],now,data.activity_offline_reports?.[id]);
    const signature = JSON.stringify([user.name,style,label,badge,image,description.detail,checkin,state.updated_at,available,state.place_id,state.game_id]);
    if (card.signature === signature) return;
    card.signature = signature;
    card.node.className = 'presence-card ' + style;
    card.status.className = 'card-status ' + badge;
    display(card.name,user.name || id);
    display(card.status,label);
    card.game.hidden = !description.detail;
    display(card.game,description.detail);
    card.checkin.hidden = !checkin;
    display(card.checkin,checkin);
    display(card.time,state.updated_at ? 'Observed ' + fmtTs(state.updated_at) : '');
    if (image && card.image.getAttribute('src') !== image) card.image.src = image;
    card.image.hidden = !image;
    card.placeholder.hidden = Boolean(image);
    card.join.hidden = !available;
    if (available) {
      card.join.dataset.join = JSON.stringify({id:user.id,name:user.name,game:state.last_location,place:state.place_id,instance:state.game_id,avatar:image});
      display(card.join,state.game_id ? 'Join server' : 'Open experience');
    } else delete card.join.dataset.join;
  }

  function renderLive(data) {
    const grid = get('presence-grid'), now = Date.now();
    const counts = {all:0,game:0,online:0,offline:0,other:0};
    const search = lower(get('monitor-search').value.trim());
    const matches = [];
    for (const user of data.users ?? []) {
      const id = String(user.id);
      if (search && !id.includes(search) && !lower(user.name).includes(search)) continue;
      const state = data.states?.[id] || {};
      const description = describePresence(state,now);
      const group = groupFor(state,description);
      counts.all++;
      counts[group]++;
      if (statusFilter === 'all' || statusFilter === group) matches.push({user,id,state,description});
    }
    for (const button of statusButtons) {
      const status = button.dataset.monitorStatus;
      button.setAttribute('aria-pressed',String(statusFilter === status));
      display(button.querySelector('span'),number.format(counts[status]));
    }
    const shown = matches.slice(...bounds('live',matches.length));
    const visibleIds = new Set(shown.map(row=>row.id));
    for (const [id,card] of cards) {
      if (visibleIds.has(id)) continue;
      card.node.remove();
      cards.delete(id);
    }
    if (!shown.length) {
      livePlaceholder(data.users?.length ? 'No players match these filters.' : 'No tracked players.');
      return;
    }
    grid.querySelector('.monitor-message')?.remove();
    for (const [index,row] of shown.entries()) {
      let card = cards.get(row.id);
      if (!card) {
        card = createCard(row.id);
        cards.set(row.id,card);
      }
      patchCard(card,row,now,data);
      const previous = grid.children[index] ?? null;
      if (previous !== card.node) grid.insertBefore(card.node,previous);
    }
  }

  function livePlaceholder(message) {
    const grid = get('presence-grid');
    let p = grid.querySelector('.monitor-message');
    if (!p) {
      p = document.createElement('p');
      p.className = 'monitor-message';
      grid.replaceChildren(p);
    }
    display(p,message);
  }

  const tables = {
    sessions: {
      id:'sessions-table', empty:'No sessions found.', fields:['username','location_name'],
      row:item=>`<td>${esc(item.username)}</td><td>${esc(item.location_name||'—')}</td><td>${fmtTs(item.start_time)}</td><td>${item.end_time ? fmtTs(item.end_time) : 'Live'}</td><td>${item.end_time ? duration(item.duration_seconds) : 'Live'}</td>`,
    },
    events: {
      id:'events-table', empty:'No events found.', fields:['username','event_type','old_location','new_location','old_status','new_status'],
      row:item=>`<td>${fmtTs(item.timestamp)}</td><td>${esc(item.username)}</td><td>${esc(String(item.event_type||'').replaceAll('_',' '))}</td><td>${esc(item.old_location||item.old_status||'—')}</td><td>${esc(item.new_location||item.new_status||'—')}</td>`,
    },
    top_games: {
      id:'games-table', empty:'No game data yet.',
      row:item=>`<td>${esc(item.location_name)}</td><td>${number.format(item.sessions||0)}</td><td>${duration(item.total_seconds)}</td><td>${duration(item.avg_seconds)}</td><td>${duration(item.max_seconds)}</td>`,
    },
  };

  function tableEmpty(name,message) {
    get(tables[name].id).tBodies[0].innerHTML = `<tr><td colspan="5" class="empty">${esc(message)}</td></tr>`;
  }

  function drawTable(name,rows) {
    const {id,empty,fields,row} = tables[name];
    let shown = rows;
    if (fields) {
      const search = lower(get('monitor-' + name + '-search').value.trim());
      const matches = search ? rows.filter(item=>fields.some(field=>lower(item[field]).replaceAll('_',' ').includes(search))) : rows;
      shown = matches.slice(...bounds(name,matches.length));
    }
    if (!shown.length) return tableEmpty(name,empty);
    get(id).tBodies[0].innerHTML = shown.map(item=>`<tr>${row(item)}</tr>`).join('');
  }

  function renderTotals(rows) {
    const shown = rows.slice(...bounds('totals',rows.length));
    get('user-totals').innerHTML = shown.map(row=>{
      const img = lastAvatars[String(row.user_id)];
      return `<div class="user-tile"><div class="tile-head">${img ? `<img class="avatar avatar-sm" ${imgAttrs} width="32" height="32" src="${esc(img)}" alt="">` : ''}<div class="tile-name">${esc(row.username)}</div></div><div class="tile-stat">Playtime <span>${duration(row.total_seconds)}</span></div><div class="tile-stat">Sessions <span>${number.format(row.sessions||0)}</span></div></div>`;
    }).join('') || '<p class="monitor-message">No completed sessions yet.</p>';
  }

  async function renderCharts(data,isCurrent) {
    const Chart = await loadChart();
    if (!isCurrent()) return;
    if (!Chart) throw Error('Charts unavailable.');
    get('monitor-chart-row').hidden = false;
    get('monitor-chart-scope').hidden = Boolean(get('days-filter').value);
    drawChart(Chart,'daily-chart','line',(data.daily||[]).map(row=>[row.day,row.total_seconds]),'#00a6b5');
    drawChart(Chart,'hourly-chart','bar',(data.hourly||[]).map(row=>[String(row.hour).padStart(2,'0'),row.total_seconds]),'#ff3c5f');
  }

  function drawChart(Chart,id,type,points,color) {
    const signature = JSON.stringify(points);
    const existing = chartViews.get(id);
    if (existing?.signature === signature) return;
    const labels = points.map(point=>point[0]), values = points.map(point=>point[1]);
    if (existing) {
      existing.signature = signature;
      existing.instance.data.labels = labels;
      existing.instance.data.datasets[0].data = values;
      existing.instance.update('none');
      return;
    }
    const instance = new Chart(get(id),{
      type, data:{labels,datasets:[{data:values,borderColor:color,backgroundColor:color+'35',borderWidth:2,pointRadius:0}]},
      options:{responsive:true,maintainAspectRatio:false,animation:false,devicePixelRatio:Math.min(devicePixelRatio||1,1.5),
        interaction:{mode:'nearest',axis:'x',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:context=>duration(context.raw)}}},
        scales:{x:{ticks:{maxTicksLimit:8}},y:{beginAtZero:true,ticks:{maxTicksLimit:5,callback:duration}}}},
    });
    chartViews.set(id,{instance,signature});
  }

  function clearResource(name) {
    if (name === 'presence') {
      cards.clear();
      livePlaceholder('Loading live presence…');
      for (const button of statusButtons) display(button.querySelector('span'),'0');
    }
    if (name === 'totals') get('user-totals').replaceChildren();
    if (name === 'charts') {
      get('monitor-chart-row').hidden = true;
      get('monitor-chart-scope').hidden = true;
    }
    if (tables[name]) tableEmpty(name,'Loading…');
  }

  function localUpdate(kind) {
    const name = kind === 'live' ? 'presence' : kind;
    const rendered = mounted.get(name);
    if (!rendered?.data) return;
    if (kind === 'live') renderLive(rendered.data);
    else if (kind === 'totals') renderTotals(rendered.data);
    else drawTable(name,rendered.data);
  }

  async function refresh(force = false) {
    setViewer(currentViewer());
    if (!viewer || !visible()) return;
    const version = ++renderVersion;
    const savedView = view;
    if (view === 'playtime' && !get('monitor-chart-row').hidden) {
      get('monitor-chart-scope').hidden = Boolean(get('days-filter').value);
    }
    const isCurrent = () => version === renderVersion && currentViewer() === viewer && view === savedView && visible();
    const requests = resources[view].map(([name,ttl])=>{
      const {key,entry} = read(name,queryFor(name),ttl,force);
      const previous = mounted.get(name);
      if (previous?.key !== key) {
        mounted.set(name,{key});
        clearResource(name);
      }
      return {name,key,entry};
    });
    const renderedAt = Math.max(...requests.map(({name})=>mounted.get(name)?.updated||0));
    if (!renderedAt) display(get('monitor-update'),'');
    let loading = requests.filter(({entry})=>entry.pending).length;
    let failed = 0;
    if (loading && requests.every(({entry})=>!entry.data)) note('Loading ' + (view === 'live' ? 'live presence' : tabs.find(tab=>tab.dataset.monitorView===view).textContent.toLowerCase()) + '…');
    else note('');
    const section = get('monitor-' + view);
    section.setAttribute('aria-busy',String(Boolean(loading)));
    await Promise.all(requests.map(async ({name,key,entry})=>{
      const pending = entry.pending;
      try {
        if (pending) await pending;
        if (!isCurrent() || !entry.data) return;
        const old = mounted.get(name);
        if (name === 'presence') {
          lastAvatars = {...lastAvatars,...entry.data.avatars};
          window.LGActivityCheckin?.update(entry.data);
          renderLive(entry.data);
        } else if (entry.data !== old.data) {
          if (name === 'charts') await renderCharts(entry.data,isCurrent);
          else if (name === 'totals') renderTotals(entry.data);
          else drawTable(name,entry.data);
        }
        if (!isCurrent()) return;
        mounted.set(name,{key,data:entry.data,updated:entry.updated});
        const latest = Math.max(...resources[view].map(([resource])=>mounted.get(resource)?.updated||0));
        if (latest) display(get('monitor-update'),'Updated ' + new Date(latest).toLocaleTimeString());
      } catch (_) {
        if (!isCurrent()) return;
        failed++;
        if (name === 'presence' && entry.data) renderLive(entry.data);
        if (!entry.data && name === 'presence') livePlaceholder('Live presence unavailable.');
        if (!entry.data && tables[name]) tableEmpty(name,'Unavailable. Use Refresh to try again.');
      } finally {
        if (pending) loading--;
        if (isCurrent()) {
          section.setAttribute('aria-busy',String(loading>0));
          if (failed) note('Some data could not refresh. Use Refresh to try again.');
          else if (!loading) note('');
        }
      }
    }));
  }

  function showView(next) {
    view = next;
    for (const tab of tabs) {
      const active = tab.dataset.monitorView === view;
      tab.tabIndex = active ? 0 : -1;
      tab.setAttribute('aria-selected',String(active));
      get(tab.getAttribute('aria-controls')).hidden = !active;
    }
    get('monitor-period').hidden = view !== 'playtime' && view !== 'sessions';
  }

  tabs.forEach((tab,index)=>{
    tab.onclick = () => { showView(tab.dataset.monitorView); refresh(); };
    tab.onkeydown = event => {
      const target = ({ArrowRight:(index+1)%tabs.length,ArrowLeft:(index+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1})[event.key];
      if (target === undefined) return;
      event.preventDefault();
      tabs[target].focus();
      tabs[target].click();
    };
  });
  for (const button of statusButtons) {
    button.onclick = () => {
      statusFilter = button.dataset.monitorStatus;
      pages.live = 0;
      localUpdate('live');
    };
  }
  for (const [kind,id] of [['live','monitor-search'],['sessions','monitor-sessions-search'],['events','monitor-events-search']]) {
    let timeout;
    get(id).oninput = () => {
      clearTimeout(timeout);
      pages[kind] = 0;
      timeout = setTimeout(()=>localUpdate(kind),90);
    };
  }
  for (const kind of Object.keys(pages)) {
    get('monitor-' + kind + '-pager').onclick = event => {
      const step = event.target.closest('[data-page-step]');
      if (!step) return;
      pages[kind] += Number(step.dataset.pageStep);
      localUpdate(kind);
    };
  }
  get('presence-grid').onclick = event => {
    const button = event.target.closest('button[data-join]');
    if (button) openJoin(JSON.parse(button.dataset.join));
  };
  get('manual-refresh').onclick = () => refresh(true);
  get('user-filter').onchange = get('days-filter').onchange = () => {
    for (const kind of Object.keys(pages)) pages[kind] = 0;
    refresh();
  };
  document.addEventListener('visibilitychange',()=>{ if (visible()) refresh(); });
  new MutationObserver(()=>{
    if (get('app').classList.contains('hidden')) setViewer(null);
  }).observe(get('app'),{attributes:true,attributeFilter:['class']});
  window.LGMonitor = {
    refresh,
    async refreshPresence() {
      for (const [key,entry] of cache) {
        if (key.startsWith('["presence",')) entry.updated = 0;
      }
      if (view === 'live') await refresh(true);
    },
  };

  function fastSig(rows,fields){
    if(!Array.isArray(rows))return String(rows??'');
    let h=2166136261>>>0;
    for(const row of rows){
      for(const k of fields){
        const s=String(row?.[k]??'');
        for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}
        h^=124;h=Math.imul(h,16777619)>>>0;
      }
      h^=10;h=Math.imul(h,16777619)>>>0;
    }
    return `${rows.length}:${h.toString(36)}`;
  }
  if(typeof refreshLeaderboard==='function')refreshLeaderboard=async function(){
    try{
      const viewerAtRequest = currentViewer();
      const rows = await api('/leaderboard');
      if (viewerAtRequest !== currentViewer()) return;
      const sig = fastSig(rows,['rank','user_id','username','title','total_seconds','sessions','avatar_url']);
      if (sig === leaderboardSignature) return;
      const body = get('lb-table').tBodies[0];
      const max = rows.reduce((highest,row)=>Math.max(highest,Number(row.total_seconds||0)),1);
      leaderboardSignature = sig;
      body.innerHTML=rows.length?rows.map((x,i)=>`<tr><td class="lb-rank lb-rank-${i+1}">${x.rank}</td><td><div class="lb-user-cell">${x.avatar_url?`<img class="avatar avatar-md" ${imgAttrs} width="44" height="44" src="${esc(x.avatar_url)}" alt="">`:''}<div><div class="lb-username">${esc(x.username)}</div>${x.title?`<div class="lb-title">${esc(x.title)}</div>`:''}<div class="lb-userid">${x.user_id}</div></div></div></td><td class="lb-bar-cell"><div class="lb-bar-track"><div class="lb-bar-fill" style="width:${Math.max(2,Math.round(Number(x.total_seconds||0)/max*100))}%"></div></div></td><td class="lb-time">${fmtSeconds(x.total_seconds)}</td><td class="lb-sessions">${x.sessions}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">No players yet</td></tr>';
    }catch(e){toast(e.message)}
  };

})();
