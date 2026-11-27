(() => {
const API = 'https://jwjxhxvahgrpkvaoyrzw.supabase.co/functions/v1/lg-mc';
const q = (selector,root=document) => root.querySelector(selector);
const qa = (selector,root=document) => [...root.querySelectorAll(selector)];
const e = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ts = value => value ? new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const dur = value => {
  const seconds = Number(value) || 0;
  const days = Math.floor(seconds/86400), hours = Math.floor(seconds%86400/3600), minutes = Math.floor(seconds%3600/60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};
const say = message => toast(message);
const S = {on:false,tab:'monitor',d:null,c:null,viewer:null,pending:null,checked:0};
const sections = [['monitor','Monitor'],['servers','Servers'],['watchlist','Watchlist'],['history','History']];
const drawCache = new Map();
let cardLimit = 12;
const openRosters = new Set();

async function api(path,options={}) {
  if (!SITE_KEY) throw Error('Log in first');
  const headers = new Headers(options.headers||{});
  headers.set('x-site-key',SITE_KEY);
  if (options.body) headers.set('content-type','application/json');
  const response = await fetch(API+path,{...options,headers});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw Error(body.error||body.detail||`Request failed (${response.status})`);
  return body;
}

function workspace() {
  const navigation = sections.map(([id,label],i)=>`<button type="button" id="mc-tab-${id}" data-mx="${id}" role="tab" aria-selected="${i===0}" aria-controls="mcx-${id}" tabindex="${i===0?0:-1}">${label}</button>`).join('');
  return `<div id="mcx">
    <div class="mcx-banner">
      <div class="mcx-hero">
        <div><h1>Minecraft Detector</h1><p id="mcx-freshness" role="status"></p></div>
        <button type="button" id="mcx-refresh" class="btn">Refresh</button>
      </div>
      <div class="mcx-nav" role="tablist" aria-label="Minecraft workspace">${navigation}</div>
    </div>
    <p id="mcx-load-error" class="mcx-notice" role="status" hidden></p>
    <section class="mcx-page active" id="mcx-monitor" role="tabpanel" aria-labelledby="mc-tab-monitor">
      <div class="mcx-wrap">
        <div id="mcx-stats" class="mcx-stats"></div>
        <div class="mcx-section-head"><h2>Live servers</h2><label>Find a server<input type="search" id="mcx-search" class="mcx-in" placeholder="Name or address" autocomplete="off"></label></div>
        <div id="mcx-grid" class="mcx-grid"></div>
        <button type="button" id="mcx-more-servers" class="btn" hidden>Show more servers</button>
        <section class="mcx-panel"><h2>Recent events</h2><div class="mcx-table-wrap" tabindex="0" aria-label="Recent Minecraft events"><table class="mcx-table"><thead><tr><th>Time</th><th>Server</th><th>Event</th><th>Player</th></tr></thead><tbody id="mcx-recent"></tbody></table></div></section>
      </div>
    </section>
    <section class="mcx-page" id="mcx-servers" role="tabpanel" aria-labelledby="mc-tab-servers" hidden><div class="mcx-wrap">
      <h2>Manage servers</h2>
      <div class="mcx-split">
        <section class="mcx-panel"><h3>Track a server</h3><form id="mcx-server-form" class="mcx-form">
          <label class="mcx-f">Server address<input id="mcx-address" class="mcx-in" placeholder="play.example.net:25565" required></label>
          <label class="mcx-f">Edition<select id="mcx-edition" class="mcx-in"><option value="JAVA">Java</option><option value="BEDROCK">Bedrock</option></select></label>
          <label class="mcx-f">Label (optional)<input id="mcx-label" class="mcx-in" maxlength="50" placeholder="Main SMP"></label>
          <button type="submit" class="ask-submit">Add server</button>
        </form><p id="mcx-server-msg" class="mcx-note" role="status"></p></section>
        <section class="mcx-panel"><h3>Tracked servers</h3><div id="mcx-server-list" class="mcx-list"></div></section>
      </div>
    </div></section>
    <section class="mcx-page" id="mcx-watchlist" role="tabpanel" aria-labelledby="mc-tab-watchlist" hidden><div class="mcx-wrap">
      <h2>Player watchlist</h2>
      <div class="mcx-note mcx-warn">A complete roster can confirm that a player is absent. A sample can confirm a sighting and may omit other players.</div>
      <div class="mcx-split">
        <section class="mcx-panel"><h3>Watch a player</h3><form id="mcx-watch-form" class="mcx-form">
          <label class="mcx-f">Server<select id="mcx-watch-server" class="mcx-in"></select></label>
          <label class="mcx-f">Username<input id="mcx-watch-name" class="mcx-in" maxlength="32" required></label>
          <button type="submit" class="ask-submit">Add player</button>
        </form><p id="mcx-watch-msg" class="mcx-note" role="status"></p></section>
        <section class="mcx-panel"><h3>Watched players</h3><div id="mcx-watch-list" class="mcx-list"></div></section>
      </div>
    </div></section>
    <section class="mcx-page" id="mcx-history" role="tabpanel" aria-labelledby="mc-tab-history" hidden><div class="mcx-wrap mc-history">
<h2>Server history</h2>
<div class="mc-history-controls">
  <label>Server<select id="mcx-hserver" class="mcx-in"></select></label>
  <label>Period<select id="mcx-hours" class="mcx-in"><option value="1">Last hour</option><option value="6">Last 6 hours</option><option value="24" selected>Last 24 hours</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option></select></label>
  <button type="button" id="mcx-history-refresh" class="btn">Refresh</button>
</div>
<section class="mcx-panel" aria-labelledby="mcx-chart-title">
  <h2 class="sec-title" id="mcx-chart-title">Players online</h2>
  <p class="mcx-note" id="mcx-chart-status" role="status"></p>
  <div id="mcx-chart-wrap" hidden>
    <div class="mc-history-chart"><canvas id="mcx-chart" role="img" aria-label="Players online over time"></canvas></div>
    <div class="mc-history-inspector">
      <label for="mcx-sample">Inspect sample</label><input id="mcx-sample" type="range" min="0" max="0" value="0">
      <output id="mcx-sample-value" for="mcx-sample"></output>
    </div>
  </div>
</section>
<details class="mcx-panel" id="mcx-history-events">
  <summary>Recent events for this server</summary>
  <div style="overflow:auto"><table class="mcx-table"><thead><tr><th>Time</th><th>Event</th><th>Player</th><th>Details</th></tr></thead><tbody id="mcx-events"></tbody></table></div>
  <button type="button" id="mcx-more-events" class="btn" hidden>Show more events</button>
</details>
    </div></section>
  </div>`;
}

function canUse() {
  return Boolean(account && SITE_KEY && (account.features?.mc ?? ['DEV','PK_'].includes(account.tier)));
}
function identity() {
  return canUse() && !q('#app').classList.contains('hidden') ? JSON.stringify([account.key_id,SITE_KEY]) : null;
}
function preferredMode() {
  try {return localStorage.lg_detector_mode === 'mc';} catch {return false;}
}
function setPreference(on) {
  try {localStorage.lg_detector_mode=on?'mc':'rbx';} catch {}
  syncMode();
}
function syncMode() {
  const viewer = identity();
  if (viewer !== S.viewer) {
    S.viewer = viewer;
    S.d = null;
    S.pending = null;
    S.checked = 0;
    drawCache.clear();
    openRosters.clear();
    cardLimit = 12;
    q('#mcx-search').value = '';
    for (const id of ['mcx-address','mcx-label','mcx-watch-name']) q('#'+id).value = '';
    for (const id of ['mcx-server-msg','mcx-watch-msg','mcx-chart-status','mcx-freshness']) q('#'+id).textContent = '';
    for (const id of ['mcx-stats','mcx-grid','mcx-recent','mcx-server-list','mcx-watch-list','mcx-events']) q('#'+id).replaceChildren();
    if (S.c) S.c.destroy();
    S.c = null;
    chartVersion++;
    renderKey = null;
    eventSignature = null;
    historyCache.clear();
    q('#mcx-chart-wrap').hidden = true;
    q('#mcx-load-error').hidden = true;
    q('#mcx-history-events').open = false;
    q('#mcx-more-events').hidden = true;
    q('#mcx-more-servers').hidden = true;
    eventLimit = 12;
    // Keep the selected history range, but discard server selections at sign-out.
    selects({servers:[]});
  }
  const wasOn = S.on;
  S.on = Boolean(viewer && preferredMode());
  document.body.classList.toggle('mc-mode',S.on);
  const button = q('#mcx-sw');
  button.closest('.mcx-toggle').hidden = !viewer;
  button.setAttribute('aria-checked',String(S.on));
  const logo = q('#app header .logo');
  const brand = S.on ? 'WA<span>/</span>Minecraft' : 'WA<span>/</span>Roblox';
  if (logo.innerHTML !== brand) logo.innerHTML = brand;
  if (S.on && !wasOn) {
    render();
    load();
  }
}

function selectTab(id) {
  S.tab = id;
  for (const tab of qa('[data-mx]')) {
    const active = tab.dataset.mx === id;
    tab.setAttribute('aria-selected',String(active));
    tab.tabIndex = active ? 0 : -1;
    const section = document.getElementById(tab.getAttribute('aria-controls'));
    section.hidden = !active;
    section.classList.toggle('active',active);
  }
  render();
}

function mount() {
  const area = document.createElement('div');
  area.innerHTML = workspace();
  q('#page-nav').after(area.firstElementChild);
  const toggle = document.createElement('div');
  toggle.className = 'mcx-toggle';
  toggle.innerHTML = '<span class="mcx-lbl" id="mcx-mode-label">Minecraft</span><button id="mcx-sw" class="mcx-sw" type="button" role="switch" aria-labelledby="mcx-mode-label" aria-checked="false"></button>';
  q('#tier-badge').before(toggle);
  q('#mcx-sw').onclick = () => setPreference(!S.on);
  const tabs = qa('[data-mx]');
  tabs.forEach((button,index)=>{
    button.onclick = ()=>selectTab(button.dataset.mx);
    button.onkeydown = event=>{
      const next = ({ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1})[event.key];
      if (next === undefined) return;
      event.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    };
  });
  q('#mcx-refresh').onclick = ()=>S.tab==='history' ? Promise.all([load(),chart(true)]) : load();
  q('#mcx-server-form').onsubmit = addServer;
  q('#mcx-watch-form').onsubmit = addWatch;
  for (const id of ['mcx-hserver','mcx-hours']) q('#'+id).onchange = ()=>{eventLimit=12;renderHistoryEvents();chart()};
  q('#mcx-history-refresh').onclick = ()=>chart(true);
  q('#mcx-sample').oninput = ()=>inspectSample(true);
  q('#mcx-history-events').ontoggle = renderHistoryEvents;
  q('#mcx-more-events').onclick = ()=>{eventLimit+=12;renderHistoryEvents()};
  q('#mcx-search').oninput = ()=>{cardLimit=12;cards(maps())};
  q('#mcx-more-servers').onclick = ()=>{cardLimit+=12;cards(maps())};
  q('#mcx-grid').addEventListener('toggle',event=>{
    const roster = event.target;
    if (!roster.dataset.roster || !roster.isConnected) return;
    const id = Number(roster.dataset.roster);
    if (roster.open) {openRosters.add(id); fillRoster(roster,maps());}
    else openRosters.delete(id);
  },true);
  q('#mcx').addEventListener('click',async event=>{
    const button = event.target.closest('[data-ms],[data-mw]');
    if (!button || !S.on) return;
    try {
      if (button.dataset.ms) {
        if (!confirm('Stop tracking this Minecraft server?')) return;
        await api('/servers/'+button.dataset.ms,{method:'DELETE'});
      } else {
        const [server,watchId] = button.dataset.mw.split(':');
        await api(`/servers/${server}/watchlist/${watchId}`,{method:'DELETE'});
      }
      await refreshAfterChange();
      say('Updated');
    } catch (error) {say(error.message);}
  });
}

function maps() {
  const data = S.d ?? {servers:[],states:[],watchlist:[],events:[],uptime:{}};
  return {...data,sm:new Map(data.states.map(row=>[Number(row.server_id),row])),mm:new Map(data.servers.map(row=>[Number(row.id),row]))};
}
async function load() {
  const viewer = identity();
  if (!S.on || !viewer || document.hidden) return;
  if (S.pending) return S.pending;
  const task = api('/bootstrap').then(data=>{
    if (viewer !== identity() || viewer !== S.viewer || !S.on) return;
    S.d = data;
    S.checked = Date.now();
    q('#mcx-load-error').hidden = true;
    render();
  },error=>{
    if (viewer !== identity() || !S.on) return;
    q('#mcx-load-error').textContent = error.message;
    q('#mcx-load-error').hidden = false;
  }).finally(()=>{if(S.pending===task)S.pending=null});
  S.pending = task;
  return task;
}

async function refreshAfterChange() {
  if (S.pending) await S.pending;
  await load();
}

function change(id,markup) {
  if (drawCache.get(id) === markup) return false;
  drawCache.set(id,markup);
  q('#'+id).innerHTML = markup;
  return true;
}
function render() {
  const data = maps();
  if (!S.d) {
    q('#mcx-freshness').textContent = 'Loading server data…';
    return;
  }
  q('#mcx-freshness').textContent = 'Updated ' + new Date(S.checked).toLocaleTimeString();
  if (S.tab === 'monitor') {
    const stats = [
      ['Tracked servers',data.servers.length],
      ['Online',data.states.filter(state=>state.online).length],
      ['Players online',data.states.reduce((total,state)=>total+(Number(state.players_online)||0),0)],
      ['Watch sightings',data.watchlist.filter(watch=>watch.last_present).length],
    ];
    change('mcx-stats',stats.map(([label,value])=>`<div class="mcx-stat"><span>${label}</span><strong>${value}</strong></div>`).join(''));
    cards(data);
    events(data);
  } else if (S.tab === 'servers') servers(data);
  else if (S.tab === 'watchlist') { selects(data); watch(data); }
  else { selects(data); chart(); renderHistoryEvents(); }
}

const empty = message => `<p class="mcx-empty">${message}</p>`;
function statusBadge(state) {
  const label = state ? state.online ? 'Online' : 'Offline' : 'Awaiting poll';
  return `<span class="mcx-b ${state?.online?'on':''}">${label}</span>`;
}
function roster(state) {
  const list = Array.isArray(state?.player_sample) ? state.player_sample.filter(player=>player?.name) : [];
  const count = Number(state?.players_online)||0;
  const full = Boolean(state?.online && (state.player_list_complete ?? list.length===count));
  return {list,count,full};
}

function cards(data) {
  if (!S.d) return;
  const term = q('#mcx-search').value.trim().toLocaleLowerCase();
  const matching = data.servers.filter(server=>[server.label,server.address].some(value=>String(value||'').toLocaleLowerCase().includes(term)));
  const openBefore = new Set(qa('details[data-roster][open]',q('#mcx-grid')).map(details=>Number(details.dataset.roster)));
  for (const id of openBefore) openRosters.add(id);
  const markup = matching.slice(0,cardLimit).map(server=>{
    const id = Number(server.id), state = data.sm.get(id), info = data.uptime[String(id)] ?? {};
    const {count,full,list} = roster(state);
    const rosterLabel = !state?.online ? 'Player roster' : full ? 'Full roster' : list.length ? 'Sampled roster' : 'Player roster';
    return `<article class="mcx-card ${state?.online?'on':''}">
      <div class="mcx-top"><div><h3>${e(server.label||server.address)}</h3><p class="mcx-sub">${e(server.address)} · ${e(server.edition)}</p></div>${statusBadge(state)}</div>
      <dl class="mcx-meta"><div><dt>Players</dt><dd>${state?.online?count:'—'}${state?.players_max?' / '+Number(state.players_max):''}</dd></div><div><dt>Tracked uptime</dt><dd>${dur(info.seconds)}</dd></div><div><dt>Version</dt><dd>${e(state?.version_name||'—')}</dd></div><div><dt>Sessions</dt><dd>${Number(info.sessions)||0}</dd></div></dl>
      ${state?.motd?`<p class="mcx-motd">${e(state.motd)}</p>`:''}
      <details class="mcx-roster" data-roster="${id}"><summary>${rosterLabel}</summary><div></div></details>
      <p class="mcx-sub">${state?.checked_at?'Checked '+ts(state.checked_at):'Waiting for first poll'}</p>
    </article>`;
  }).join('') || empty(data.servers.length?'No servers match your search.':'No servers tracked yet. Add one in Servers.');
  if (change('mcx-grid',markup)) {
    for (const details of qa('details[data-roster]',q('#mcx-grid'))) {
      if (openRosters.has(Number(details.dataset.roster))) {details.open=true;fillRoster(details,data);}
    }
  } else for (const details of qa('details[data-roster][open]',q('#mcx-grid'))) fillRoster(details,data);
  q('#mcx-more-servers').hidden = cardLimit>=matching.length;
}

function fillRoster(details,data) {
  const id = Number(details.dataset.roster), state = data.sm.get(id);
  const {list,count,full} = roster(state);
  const watched = new Set(data.watchlist.filter(row=>Number(row.server_id)===id).map(row=>String(row.username).toLowerCase()));
  const body = details.querySelector('div');
  const markup = !state ? empty('Waiting for first poll.') : !state.online ? empty('Server is offline.') :
    count === 0 ? empty('No players online.') : !list.length ? empty('This server does not expose player names.') :
    `<p class="mcx-note">${full?'All reported players':`Showing ${list.length} of ${count} reported players`}</p><ul class="mcx-chips">${list.map(player=>`<li class="${watched.has(String(player.name).toLowerCase())?'hit':''}">${e(player.name)}</li>`).join('')}</ul>`;
  if (body.dataset.markup !== markup) { body.innerHTML = markup; body.dataset.markup = markup; }
}

function servers(data) {
  change('mcx-server-list',data.servers.map(server=>{
    return `<div class="mcx-row"><div class="mcx-grow"><strong>${e(server.label||server.address)}</strong><p class="mcx-sub">${e(server.address)} · ${e(server.edition)}</p></div>${statusBadge(data.sm.get(Number(server.id)))}<button type="button" class="btn danger" data-ms="${Number(server.id)}">Remove</button></div>`;
  }).join('') || empty('No tracked servers.'));
}

function watch(data) {
  change('mcx-watch-list',data.watchlist.map(watch=>{
    const id = Number(watch.server_id), server = data.mm.get(id), state = data.sm.get(id), info = roster(state);
    const appears = info.list.some(player=>String(player.name).toLowerCase()===String(watch.username).toLowerCase());
    const [label,kind] = !state ? ['Awaiting poll',''] : !state.online ? ['Server offline',''] :
      appears ? info.full ? ['Online','on'] : ['Seen in sample','on'] :
      info.full ? ['Absent',''] : ['Unconfirmed',''];
    return `<div class="mcx-row"><div class="mcx-grow"><strong>${e(watch.username)}</strong><p class="mcx-sub">${e(server?.label||server?.address||'Server')}${watch.last_seen_at?' · Seen '+ts(watch.last_seen_at):''}</p></div><span class="mcx-b ${kind}">${label}</span><button type="button" class="btn danger" data-mw="${id}:${Number(watch.id)}">Remove</button></div>`;
  }).join('') || empty('No watched players.'));
}

function tag(type) { return type==='WATCH_PLAYER_JOINED'?'join':type==='SERVER_OFFLINE'?'off':''; }
function lbl(type) { return type==='WATCH_PLAYER_JOINED'?'Player join detected':String(type||'').replaceAll('_',' '); }
function events(d) {
  const markup = d.events.slice(0,12).map(x => {
    const server = d.mm.get(+x.server_id);
    return `<tr><td>${ts(x.timestamp)}</td><td>${e(server?.label || server?.address || x.server_id)}</td><td><span class="mcx-tag ${tag(x.event_type)}">${e(lbl(x.event_type))}</span></td><td>${e(x.username || '—')}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="mcx-empty">No MC events yet</td></tr>';
  change('mcx-recent',markup);
}
function selects(d) {
  const options = d.servers.map(s => `<option value="${s.id}">${e(s.label || s.address)} · ${e(s.edition)}</option>`).join('') || '<option value="">Add a server first</option>';
  for (const id of ['#mcx-watch-server', '#mcx-hserver']) {
    const select = q(id);
    if (select.dataset.options === options) continue;
    const value = select.value;
    select.innerHTML = options;
    select.dataset.options = options;
    if ([...select.options].some(option => option.value === value)) select.value = value;
  }
}
async function submitForm(event,path,body,messageId,fields,success) {
  event.preventDefault();
  const button = event.submitter ?? event.currentTarget.querySelector('button[type="submit"]');
  const message = q('#'+messageId);
  button.disabled = true;
  message.textContent = 'Saving…';
  try {
    await api(path,{method:'POST',body:JSON.stringify(body)});
    for (const field of fields) q(field).value = '';
    message.textContent = success;
    await refreshAfterChange();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function addServer(event) {
  return submitForm(event,'/servers',{
    address:q('#mcx-address').value.trim(),edition:q('#mcx-edition').value,label:q('#mcx-label').value.trim(),
  },'mcx-server-msg',['#mcx-address','#mcx-label'],'Server added.');
}
function addWatch(event) {
  const server = Number(q('#mcx-watch-server').value);
  if (!server) {
    event.preventDefault();
    q('#mcx-watch-msg').textContent = 'Add a server first.';
    return;
  }
  return submitForm(event,`/servers/${server}/watchlist`,{username:q('#mcx-watch-name').value.trim()},
    'mcx-watch-msg',['#mcx-watch-name'],'Player added to this server.');
}

const historyCache = new Map();
const historyAge = 120_000;
const tickTime = new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'});
const tickDate = new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
let historyUser, renderKey, chartVersion = 0, eventLimit = 12, eventSignature, inspectionPoints = [];

function historySelection() {
  return [typeof account !== 'undefined' && account?.key_id || SITE_KEY, Number(q('#mcx-hserver').value), Number(q('#mcx-hours').value)];
}
function renderHistoryEvents() {
  if (S.tab !== 'history' || !q('#mcx-history-events').open) return;
  const [user, server, hours] = historySelection();
  const cutoff = Date.now() - hours * 3600000;
  const matches = (S.d?.events ?? []).filter(event => Number(event.server_id) === server && Date.parse(event.timestamp) >= cutoff);
  const page = matches.slice(0, eventLimit);
  const signature = JSON.stringify([user, server, hours, page, matches.length]);
  if (signature === eventSignature) return;
  eventSignature = signature;
  q('#mcx-events').innerHTML = page.map(event => `<tr>
    <td>${ts(event.timestamp)}</td><td><span class="mcx-tag ${tag(event.event_type)}">${e(lbl(event.event_type))}</span></td>
    <td>${e(event.username || '—')}</td><td>${e(event.details?.confidence || event.details?.address || '—')}</td>
  </tr>`).join('') || '<tr><td colspan="4" class="mcx-empty">No recent events in this period</td></tr>';
  q('#mcx-more-events').hidden = matches.length <= eventLimit;
}

function plotPoints(points) {
  const stride = Math.ceil(points.length / 120);
  if (stride <= 1) return points;
  const indices = new Set([0, points.length - 1]);
  for (let start = 0; start < points.length; start += stride) {
    let min = -1, max = -1, gap = -1;
    for (let i = start; i < Math.min(start + stride, points.length); i++) {
      const value = points[i].y;
      if (value === null) { if (gap < 0) gap = i; continue; }
      if (min < 0 || value < points[min].y) min = i;
      if (max < 0 || value > points[max].y) max = i;
    }
    for (const idx of [min, max, gap]) if (idx >= 0) indices.add(idx);
  }
  return [...indices].sort((a, b) => a - b).map(index => points[index]);
}

function inspectSample(highlight = false) {
  const input = q('#mcx-sample'), index = Number(input.value);
  const sample = inspectionPoints[index];
  if (!sample) return;
  const label = `${tickDate.format(sample.x)} · ${sample.y === null ? 'Player count unavailable' : sample.y + ' online'}`;
  q('#mcx-sample-value').textContent = label;
  input.setAttribute('aria-valuetext', label);
  if (highlight && S.c) {
    S.c.setActiveElements([{datasetIndex:0,index}]);
    S.c.update('none');
  }
}

function historyData(key, server, hours, force) {
  const existing = historyCache.get(key);
  if (existing?.pending || (!force && existing?.expires > Date.now())) return existing.promise;
  const entry = {pending:true};
  entry.promise = api(`/history?server_id=${server}&hours=${hours}`).then(rows => {
    entry.expires = Date.now() + historyAge;
    entry.pending = false;
    return rows;
  }, error => {
    if (historyCache.get(key) === entry) historyCache.delete(key);
    throw error;
  });
  historyCache.set(key, entry);
  if (historyCache.size > 12) historyCache.delete(historyCache.keys().next().value);
  return entry.promise;
}

async function chart(force = false) {
  if (!S.on || S.tab !== 'history' || !SITE_KEY) return;
  const [user, server, hours] = historySelection();
  const key = JSON.stringify([user, server, hours]);
  const version = ++chartVersion;
  const status = q('#mcx-chart-status'), wrap = q('#mcx-chart-wrap');
  if (user !== historyUser) {
    historyUser = user;
    renderKey = null;
    historyCache.clear();
  }
  if (!server) {
    wrap.hidden = true;
    status.textContent = 'Select a tracked server.';
    return;
  }
  const cached = historyCache.get(key);
  if (!force && renderKey === key && cached?.expires > Date.now()) return;
  if (renderKey !== key) {
    wrap.hidden = true;
    status.textContent = 'Loading samples…';
  }
  const current = () => version === chartVersion && identity() === S.viewer && S.on && S.tab === 'history' && JSON.stringify(historySelection()) === key;
  try {
    const rows = await historyData(key, server, hours, force);
    if (!current()) return;
    const points = rows.map(row => ({
      x: Date.parse(row.sampled_at),
      y: row.online === false ? 0 : row.players_online == null ? null : Number(row.players_online),
    })).filter(point => Number.isFinite(point.x)).sort((a, b) => a.x - b.x);
    if (!points.length) {
      wrap.hidden = true;
      status.textContent = 'No samples in this period.';
      renderKey = key;
      return;
    }
    const Chart = await loadChart();
    if (!current()) return;
    if (!Chart) throw Error('Chart unavailable. Use Refresh to try again.');
    const peak = points.reduce((max, point) => Math.max(max, point.y ?? 0), 0);
    const range = `${tickDate.format(points[0].x)} – ${tickDate.format(points.at(-1).x)}`;
    status.textContent = `${range} · ${points.length.toLocaleString()} samples · Peak ${peak}`;
    wrap.hidden = false;
    const shown = plotPoints(points);
    const inspector = q('#mcx-sample');
    const oldIndex = Number(inspector.value);
    const pinToLatest = renderKey !== key || oldIndex === inspectionPoints.length - 1;
    inspectionPoints = shown;
    inspector.max = shown.length - 1;
    inspector.value = pinToLatest ? inspector.max : Math.min(oldIndex, shown.length - 1);
    inspector.disabled = shown.length < 2;
    inspectSample();
    const tick = hours > 24 ? tickDate : tickTime;
    const options = {
      responsive:true, maintainAspectRatio:false, animation:false, parsing:false,
      interaction:{mode:'nearest',axis:'x',intersect:false},
      plugins:{legend:{display:false},tooltip:{callbacks:{title:entries=>tickDate.format(entries[0].parsed.x)}}},
      scales:{x:{type:'linear',ticks:{maxTicksLimit:7,callback:value=>tick.format(value)}},
        y:{beginAtZero:true,ticks:{precision:0}}},
    };
    if (!S.c) S.c = new Chart(q('#mcx-chart'),{type:'line',data:{datasets:[{
      label:'Players online',data:shown,borderColor:'#18905d',backgroundColor:'#18905d1a',fill:true,pointRadius:1,pointHoverRadius:5,borderWidth:2,
    }]},options});
    else {
      S.c.options = options;
      S.c.data.datasets[0].data = shown;
      S.c.update('none');
    }
    renderKey = key;
  } catch (error) {
    if (current()) status.textContent = error.message;
  }
}
function boot() {
  mount();
  syncMode();
  new MutationObserver(syncMode).observe(q('#app'),{attributes:true,attributeFilter:['class']});
  addEventListener('pageshow',syncMode,{passive:true});
  document.addEventListener('visibilitychange',()=>{ if (!document.hidden && S.on) load(); });
  setInterval(()=>{ syncMode(); if (S.on) load(); },30_000);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();
