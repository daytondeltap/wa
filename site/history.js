(() => {
  const byId = id => document.getElementById(id);
  const pageSize = 10;
  const cache = new Map();
  const cacheMs = 60_000;
  const mobile = matchMedia('(max-width: 720px)');
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const numbers = new Intl.NumberFormat();
  const sort = {
    time: (a, b) => b.total_seconds - a.total_seconds,
    recent: (a, b) => b.lastTime - a.lastTime,
    sessions: (a, b) => b.sessions - a.sessions,
    name: (a, b) => collator.compare(a.location_name, b.location_name),
  };
  let scope, filter, selected, sourceRows, games = [], matches = [], sessions = [];
  let gamePage = 0, sessionPage = 0, lists = 0, details = 0, searchTimer;
  const sessionScope = () => account && (account.key_id || SITE_KEY);
  const count = value => numbers.format(value || 0);
  const time = value => fmtSeconds(Math.max(0, Math.floor(Number(value) || 0)));
  const message = text => `<p class="history-message">${esc(text)}</p>`;

  function request(path, params, force = false) {
    const key = JSON.stringify([path, params]);
    const now = Date.now();
    for (const [k, entry] of cache) {
      if (!entry.promise && entry.until <= now) cache.delete(k);
    }
    const hit = cache.get(key);
    if (hit?.promise) return hit.promise;
    if (!force && hit) return Promise.resolve(hit.rows);

    const entry = {};
    entry.promise = apiGet(path, params).then(rows => {
      entry.rows = rows;
      entry.until = Date.now() + cacheMs;
      delete entry.promise;
      if (cache.size > 24 && cache.get(key) === entry) cache.delete(cache.keys().next().value);
      return rows;
    }, error => {
      if (cache.get(key) === entry) cache.delete(key);
      throw error;
    });
    cache.set(key, entry);
    return entry.promise;
  }

  function pager(kind, current, total) {
    const games = kind === 'game';
    const name = games ? 'games' : 'sessions';
    const first = current * pageSize;
    byId(`hist-${kind}-pager`).hidden = total <= pageSize;
    byId(`hist-${kind}-range`).textContent = `${count(first + 1)}–${count(Math.min(first + pageSize, total))} of ${count(total)}`;
    byId(`hist-${name}-prev`).disabled = current === 0;
    byId(`hist-${name}-next`).disabled = first + pageSize >= total;
  }

  function renderMatches() {
    const first = gamePage * pageSize;
    byId('hist-summary').textContent = matches.length === games.length ? `${count(games.length)} games` : `${count(matches.length)} of ${count(games.length)} games`;
    byId('hist-games').innerHTML = matches.slice(first, first + pageSize).map((game, i) => `
      <button type="button" class="history-game" data-game-index="${first + i}" aria-pressed="${game === selected}">
        <strong>${esc(game.location_name || 'Unnamed game')}</strong>
        <span>${time(game.total_seconds)} played · ${count(game.sessions)} sessions <span aria-hidden="true">·</span> ${fmtTs(game.last_played)}</span>
      </button>`).join('') || message(games.length ? 'No games match your search.' : 'No games found for this player and period.');
    pager('game', gamePage, matches.length);
  }

  function findMatches(reset = true) {
    if (reset) gamePage = 0;
    const query = byId('hist-search').value.trim().toLocaleLowerCase();
    const compare = sort[byId('hist-sort').value] ?? sort.time;
    matches = games.filter(game => game.searchName.includes(query))
      .sort((a, b) => compare(a, b) || sort.name(a, b));
    gamePage = Math.min(gamePage, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
    renderMatches();
  }

  function resetDetail() {
    selected = null;
    details++;
    byId('hist-layout').classList.remove('show-detail');
    byId('hist-detail-title').textContent = 'Game details';
    byId('hist-detail-note').hidden = false;
    byId('hist-stats').hidden = true;
    byId('hist-session-section').hidden = true;
    byId('hist-sessions').replaceChildren();
    byId('hist-sessions').setAttribute('aria-busy', 'false');
  }

  function renderSessions() {
    const first = sessionPage * pageSize;
    byId('hist-session-count').textContent = `${count(sessions.length)} shown`;
    byId('hist-sessions').innerHTML = sessions.slice(first, first + pageSize).map(session => `
      <div class="history-session">
        <strong>${esc(session.username)}</strong>
        <span>${fmtHistTs(session.start_time)}${session.end_time ? ' → ' + fmtHistTs(session.end_time) : ''}</span>
        <b>${session.end_time ? time(session.duration_seconds) : 'In progress'}</b>
      </div>`).join('') || message('No sessions for this game.');
    pager('session', sessionPage, sessions.length);
  }

  async function selectGame(game, focus = false, force = false) {
    const version = ++details;
    selected = game;
    byId('hist-layout').classList.add('show-detail');
    for (const button of byId('hist-games').querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(matches[Number(button.dataset.gameIndex)] === game));
    }
    byId('hist-detail-title').textContent = game.location_name || 'Unnamed game';
    if (focus && mobile.matches) byId('hist-detail-title').focus();
    byId('hist-detail-note').hidden = true;
    const stats = [
      ['Playtime', time(game.total_seconds)], ['Sessions', count(game.sessions)], ['Players', count(game.unique_players)],
      ['Average', time(game.avg_seconds)], ['Longest', time(game.max_seconds)], ['First played', fmtHistTs(game.first_played)],
    ];
    byId('hist-stats').innerHTML = stats.map(([key, val]) => `<div><dt>${key}</dt><dd>${esc(val)}</dd></div>`).join('');
    byId('hist-stats').hidden = false;
    byId('hist-session-section').hidden = false;
    byId('hist-session-pager').hidden = true;
    byId('hist-session-count').textContent = '';
    const target = byId('hist-sessions');
    target.setAttribute('aria-busy', 'true');
    target.innerHTML = message('Loading sessions…');
    try {
      const rows = game.location_name ? await request('/history/sessions', { game: game.location_name, ...filter }, force) : [];
      if (version !== details || scope !== sessionScope()) return;
      sessions = rows;
      sessionPage = 0;
      renderSessions();
    } catch (error) {
      if (version !== details || scope !== sessionScope()) return;
      target.innerHTML = message(error.message) + '<button type="button" class="btn" data-retry-sessions>Try again</button>';
    } finally {
      if (version === details && scope === sessionScope()) target.setAttribute('aria-busy', 'false');
    }
  }

  async function load(force = false) {
    const nextScope = sessionScope();
    if (!nextScope) return;
    if (scope !== nextScope) {
      scope = nextScope;
      cache.clear();
      filter = null;
      byId('hist-search').value = '';
    }
    const next = { user_id: byId('hist-user-filter').value, days: byId('hist-days-filter').value };
    const sameFilter = filter?.user_id === next.user_id && filter?.days === next.days;
    const previousGame = sameFilter ? selected?.location_name : null;
    const version = ++lists;
    filter = next;
    const target = byId('hist-games');
    if (!sameFilter) {
      sourceRows = null;
      games = [];
      matches = [];
      gamePage = 0;
      byId('hist-summary').textContent = '';
      byId('hist-game-pager').hidden = true;
      target.innerHTML = message('Loading games…');
      resetDetail();
    }
    target.setAttribute('aria-busy', 'true');
    try {
      const rows = await request('/history/games', next, force);
      if (version !== lists || nextScope !== sessionScope()) return;
      const lastSelected = selected?.location_name ?? previousGame;
      const keepMobileDetail = byId('hist-layout').classList.contains('show-detail');
      if (sourceRows !== rows || !sameFilter) {
        sourceRows = rows;
        games = rows.map(source => ({ ...source, searchName: String(source.location_name ?? '').toLocaleLowerCase(),
          lastTime: Date.parse(source.last_played) || 0 }));
        selected = games.find(game => game.location_name === lastSelected) ?? null;
        findMatches(false);
        if (selected) {
          const loading = selectGame(selected, false, force);
          if (!keepMobileDetail) byId('hist-layout').classList.remove('show-detail');
          await loading;
        } else resetDetail();
      }
    } catch (error) {
      if (version !== lists || nextScope !== sessionScope()) return;
      sourceRows = null;
      games = [];
      matches = [];
      resetDetail();
      byId('hist-summary').textContent = '';
      byId('hist-game-pager').hidden = true;
      target.innerHTML = message(error.message) + '<button type="button" class="btn" data-retry-games>Try again</button>';
    } finally {
      if (version === lists && nextScope === sessionScope()) target.setAttribute('aria-busy', 'false');
    }
  }

  byId('history-refresh').onclick = () => load(true);
  byId('hist-user-filter').onchange = byId('hist-days-filter').onchange = () => load();
  byId('hist-sort').onchange = () => findMatches();
  byId('hist-search').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { if (sourceRows) findMatches(); }, 100);
  };
  byId('hist-games').onclick = event => {
    const button = event.target.closest('button');
    if (button?.hasAttribute('data-retry-games')) load(true);
    const game = button && matches[Number(button.dataset.gameIndex)];
    if (game) selectGame(game, true);
  };
  byId('hist-sessions').onclick = event => {
    if (selected && event.target.closest('[data-retry-sessions]')) selectGame(selected, false, true);
  };
  byId('hist-back').onclick = () => {
    byId('hist-layout').classList.remove('show-detail');
    (byId('hist-games').querySelector('[aria-pressed="true"]') ?? byId('hist-search')).focus();
  };
  for (const [name, direction] of [['prev', -1], ['next', 1]]) {
    byId('hist-games-' + name).onclick = () => {
      gamePage += direction;
      renderMatches();
      byId('hist-games').querySelector('button')?.focus();
    };
    byId('hist-sessions-' + name).onclick = () => {
      sessionPage += direction;
      renderSessions();
      byId('hist-sessions').setAttribute('tabindex', '-1');
      byId('hist-sessions').focus();
    };
  }
  window.LGHistory = { load };
})();
