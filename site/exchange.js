(() => {
  const state = { markets: [], selected: null, range: 1440, refreshing: false };
  const $x = id => document.getElementById(id);
  const escx = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = n => Number(n || 0);
  const fmtPrice = n => `${num(n).toFixed(2)} TC`;
  const fmtPct = n => `${num(n) >= 0 ? '+' : ''}${num(n).toFixed(2)}%`;
  const fmtVol = n => new Intl.NumberFormat().format(Math.round(num(n)));
  const statusText = p => ({0:'OFFLINE',1:'WEBSITE',2:'IN GAME',3:'STUDIO',4:'INVISIBLE'})[Number(p?.presence_type || 0)] || 'OFFLINE';

  function injectStyles() {
    if (document.getElementById('lg-exchange-style')) return;
    const style = document.createElement('style');
    style.id = 'lg-exchange-style';
    style.textContent = `
      .ex-wrap{padding:1.5rem 2rem;display:flex;flex-direction:column;gap:1.25rem}
      .ex-banner{font-family:var(--font-mono);font-size:.62rem;color:var(--subtext);border:1px solid var(--border);background:var(--surface);border-radius:6px;padding:.65rem .8rem}
      .ex-grid{display:grid;grid-template-columns:minmax(300px,.78fr) minmax(460px,1.45fr);gap:1.2rem;align-items:start}
      .ex-panel{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1rem 1.1rem;min-width:0}
      .ex-market-list{max-height:680px;overflow:auto}
      .ex-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.8rem;align-items:center;padding:.72rem .55rem;border-bottom:1px solid rgba(30,30,46,.75);cursor:pointer}
      .ex-row:hover,.ex-row.active{background:rgba(255,255,255,.025)}.ex-row.active{box-shadow:inset 2px 0 0 var(--accent2)}
      .ex-symbol{font-family:var(--font-mono);font-size:.78rem;font-weight:700;color:var(--text)}.ex-name{font-size:.7rem;color:var(--subtext);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ex-price{font-family:var(--font-mono);font-size:.78rem;text-align:right}.ex-up{color:var(--green)}.ex-down{color:var(--accent)}.ex-flat{color:var(--subtext)}
      .ex-head{display:flex;gap:.8rem;align-items:center;flex-wrap:wrap}.ex-head-main{flex:1;min-width:180px}.ex-big{font-family:var(--font-mono);font-size:1.55rem;font-weight:700;margin-top:.15rem}.ex-change{font-family:var(--font-mono);font-size:.75rem;margin-top:.15rem}
      .ex-stats{display:grid;grid-template-columns:repeat(4,minmax(100px,1fr));gap:.55rem;margin-top:.85rem}.ex-stat{border:1px solid var(--border);border-radius:5px;padding:.55rem .65rem}.ex-stat-k{font-family:var(--font-mono);font-size:.55rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}.ex-stat-v{font-family:var(--font-mono);font-size:.72rem;margin-top:.2rem}
      .ex-chart-shell{height:330px;position:relative;margin-top:.9rem;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--bg)}#ex-canvas{width:100%;height:100%;display:block}
      .ex-toolbar{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;margin-top:.8rem}.ex-range{font-family:var(--font-mono);font-size:.62rem;background:transparent;color:var(--subtext);border:1px solid var(--border);border-radius:4px;padding:.3rem .55rem;cursor:pointer}.ex-range.active,.ex-range:hover{color:var(--accent2);border-color:var(--accent2)}
      .ex-bottom{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}.ex-book{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}.ex-book-col{min-width:0}.ex-book-row{display:grid;grid-template-columns:1fr 1fr;gap:.4rem;font-family:var(--font-mono);font-size:.62rem;padding:.21rem .2rem;border-bottom:1px solid rgba(30,30,46,.45)}.ex-bid{color:var(--green)}.ex-ask{color:var(--accent)}
      .ex-order{display:flex;align-items:end;gap:.55rem;flex-wrap:wrap;margin-top:.85rem;padding-top:.8rem;border-top:1px solid var(--border)}.ex-order label{font-family:var(--font-mono);font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.ex-order select{min-width:90px}.ex-buy,.ex-sell{font-family:var(--font-mono);font-size:.68rem;font-weight:700;border-radius:4px;padding:.5rem .8rem;cursor:pointer;background:transparent}.ex-buy{border:1px solid var(--green);color:var(--green)}.ex-buy:hover{background:rgba(57,255,20,.1)}.ex-sell{border:1px solid var(--accent);color:var(--accent)}.ex-sell:hover{background:rgba(255,60,95,.1)}
      .ex-pressure{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-top:.8rem}.ex-pressure>div{font-family:var(--font-mono);font-size:.6rem;border:1px solid var(--border);border-radius:4px;padding:.45rem}.ex-pressure b{display:block;font-size:.72rem;margin-top:.12rem}
      .ex-tape{max-height:255px;overflow:auto}.ex-tape-row{display:grid;grid-template-columns:72px 1fr 55px 45px;gap:.5rem;align-items:center;font-family:var(--font-mono);font-size:.6rem;padding:.34rem .25rem;border-bottom:1px solid rgba(30,30,46,.45)}
      .ex-empty{font-family:var(--font-mono);font-size:.68rem;color:var(--muted);padding:1rem 0;text-align:center}
      @media(max-width:980px){.ex-grid{grid-template-columns:1fr}.ex-market-list{max-height:360px}.ex-bottom{grid-template-columns:1fr}.ex-stats{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:700px){.ex-wrap{padding-left:1rem;padding-right:1rem}.ex-chart-shell{height:260px}.ex-book{grid-template-columns:1fr}.ex-tape-row{grid-template-columns:65px 1fr 50px}}
    `;
    document.head.appendChild(style);
  }

  function injectPage() {
    if (document.getElementById('page-exchange')) return;
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-exchange';
    page.innerHTML = `
      <div class="ex-wrap">
        <div class="ex-banner">LG EXCHANGE · SHARED PAPER-MARKET SIMULATION · PRICES HAVE NO REAL-WORLD VALUE · BUY/SELL BUTTONS SUBMIT MARKET-PRESSURE SIGNALS ONLY</div>
        <div class="ex-grid">
          <section class="ex-panel">
            <div class="sec-title">Market Watch</div>
            <div id="ex-market-list" class="ex-market-list"><div class="ex-empty">Loading markets…</div></div>
          </section>
          <section class="ex-panel">
            <div id="ex-detail"><div class="ex-empty">Select a player market</div></div>
          </section>
        </div>
      </div>`;
    const history = document.getElementById('page-history');
    if (history) history.before(page); else document.getElementById('app')?.appendChild(page);
  }

  function patchNavigation() {
    if (typeof buildNav !== 'function' || buildNav.__lgExchangePatched) return;
    const original = buildNav;
    const patched = function() {
      original();
      if (!account || !(account.tabs || []).includes('exchange')) return;
      const nav = document.getElementById('page-nav');
      if (!nav || nav.querySelector('[data-tab="exchange"]')) return;
      const b = document.createElement('button');
      b.className = 'page-nav-btn';
      b.dataset.tab = 'exchange';
      b.textContent = 'LG Exchange';
      b.onclick = async () => { await switchPage('exchange', b); await window.LGExchange.refresh(); };
      const lb = nav.querySelector('[data-tab="leaderboard"]');
      if (lb?.nextSibling) nav.insertBefore(b, lb.nextSibling); else nav.appendChild(b);
    };
    patched.__lgExchangePatched = true;
    buildNav = patched;
  }

  function renderMarkets() {
    const box = $x('ex-market-list');
    if (!box) return;
    if (!state.markets.length) { box.innerHTML = '<div class="ex-empty">No player markets yet</div>'; return; }
    box.innerHTML = state.markets
      .slice()
      .sort((a,b) => num(b.volume_24h)-num(a.volume_24h))
      .map(m => {
        const ch = num(m.change_24h), cls = ch > .001 ? 'ex-up' : ch < -.001 ? 'ex-down' : 'ex-flat';
        return `<div class="ex-row ${Number(state.selected)===Number(m.user_id)?'active':''}" data-ex-market="${m.user_id}">
          <div style="display:flex;align-items:center;gap:.55rem;min-width:0">${m.avatar_url?`<img class="avatar avatar-sm" src="${escx(m.avatar_url)}" alt="">`:''}<div style="min-width:0"><div class="ex-symbol">${escx(m.ticker)}</div><div class="ex-name">${escx(m.username)} · ${statusText(m.presence)}</div></div></div>
          <div><div class="ex-price">${fmtPrice(m.current_price)}</div><div class="ex-price ${cls}" style="font-size:.62rem">${fmtPct(ch)}</div></div>
        </div>`;
      }).join('');
    box.querySelectorAll('[data-ex-market]').forEach(el => el.addEventListener('click', async () => {
      state.selected = Number(el.dataset.exMarket); renderMarkets(); await refreshDetail();
    }));
  }

  function market() { return state.markets.find(m => Number(m.user_id) === Number(state.selected)); }

  function drawCandles(rows) {
    const canvas = $x('ex-canvas'); if (!canvas) return;
    const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width*dpr)); canvas.height = Math.max(1, Math.round(rect.height*dpr));
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    const W=rect.width,H=rect.height,pad={l:54,r:12,t:14,b:24}; ctx.clearRect(0,0,W,H);
    const data = (rows||[]).slice(-140);
    if (!data.length) { ctx.fillStyle='#555570';ctx.font='12px Space Mono';ctx.fillText('Waiting for market candles…',18,28); return; }
    const lows=data.map(x=>num(x.low)), highs=data.map(x=>num(x.high)); let lo=Math.min(...lows), hi=Math.max(...highs); if(hi<=lo){hi+=1;lo-=1} const span=hi-lo;
    ctx.strokeStyle='#1e1e2e';ctx.lineWidth=1;ctx.fillStyle='#8888aa';ctx.font='10px Space Mono';ctx.textAlign='right';
    for(let i=0;i<5;i++){const y=pad.t+(H-pad.t-pad.b)*(i/4),v=hi-span*(i/4);ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();ctx.fillText(v.toFixed(2),pad.l-6,y+3)}
    const cw=(W-pad.l-pad.r)/data.length, body=Math.max(2,Math.min(8,cw*.55));
    data.forEach((c,i)=>{const o=num(c.open),cl=num(c.close),h=num(c.high),l=num(c.low);const x=pad.l+cw*i+cw/2;const yy=v=>pad.t+(hi-v)/span*(H-pad.t-pad.b);const up=cl>=o;ctx.strokeStyle=up?'#39ff14':'#ff3c5f';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(x,yy(h));ctx.lineTo(x,yy(l));ctx.stroke();const y=Math.min(yy(o),yy(cl)),bh=Math.max(1,Math.abs(yy(o)-yy(cl)));ctx.fillRect(x-body/2,y,body,bh)});
    ctx.textAlign='left';ctx.fillStyle='#555570';ctx.font='10px Space Mono';ctx.fillText(`${data.length} × 1m candles`,pad.l,H-7);
  }

  function renderBook(book) {
    const bids=(book?.bids||[]).slice(0,8),asks=(book?.asks||[]).slice(0,8);
    return `<div class="ex-book"><div class="ex-book-col"><div class="sec-title">Bids</div>${bids.map(x=>`<div class="ex-book-row"><span class="ex-bid">${num(x.price).toFixed(2)}</span><span>${fmtVol(x.size)}</span></div>`).join('')}</div><div class="ex-book-col"><div class="sec-title">Asks</div>${asks.map(x=>`<div class="ex-book-row"><span class="ex-ask">${num(x.price).toFixed(2)}</span><span>${fmtVol(x.size)}</span></div>`).join('')}</div></div>`;
  }

  function renderTape(rows) {
    if (!rows?.length) return '<div class="ex-empty">No user market signals yet</div>';
    return `<div class="ex-tape">${rows.slice(0,40).map(x=>`<div class="ex-tape-row"><span>${new Date(x.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span><span>${escx(x.ticker)}</span><span class="${x.side==='BUY'?'ex-up':'ex-down'}">${escx(x.side)}</span><span>×${x.strength}</span></div>`).join('')}</div>`;
  }

  async function refreshDetail() {
    const m=market(), box=$x('ex-detail'); if(!box)return;
    if(!m){box.innerHTML='<div class="ex-empty">Select a player market</div>';return}
    const q=new URLSearchParams({user_id:String(m.user_id),minutes:String(state.range)});
    const [hist,book,tape]=await Promise.all([api('/exchange/history?'+q),api('/exchange/orderbook?user_id='+encodeURIComponent(m.user_id)),api('/exchange/tape')]);
    const ch=num(m.change_24h), cls=ch>0?'ex-up':ch<0?'ex-down':'ex-flat';
    box.innerHTML=`
      <div class="ex-head">${m.avatar_url?`<img class="avatar avatar-md" src="${escx(m.avatar_url)}" alt="">`:''}<div class="ex-head-main"><div class="ex-symbol" style="font-size:1rem">${escx(m.ticker)}</div><div class="ex-name">${escx(m.username)} · ${statusText(m.presence)}</div></div><div style="text-align:right"><div class="ex-big">${fmtPrice(m.current_price)}</div><div class="ex-change ${cls}">${fmtPct(ch)} 24H</div></div></div>
      <div class="ex-stats"><div class="ex-stat"><div class="ex-stat-k">24H High</div><div class="ex-stat-v">${fmtPrice(m.high_24h)}</div></div><div class="ex-stat"><div class="ex-stat-k">24H Low</div><div class="ex-stat-v">${fmtPrice(m.low_24h)}</div></div><div class="ex-stat"><div class="ex-stat-k">24H Volume</div><div class="ex-stat-v">${fmtVol(m.volume_24h)}</div></div><div class="ex-stat"><div class="ex-stat-k">Trackers</div><div class="ex-stat-v">${m.tracker_count}</div></div></div>
      <div class="ex-chart-shell"><canvas id="ex-canvas"></canvas></div>
      <div class="ex-toolbar"><span style="font-family:var(--font-mono);font-size:.6rem;color:var(--muted);margin-right:.2rem">RANGE</span>${[[60,'1H'],[360,'6H'],[1440,'1D'],[10080,'7D']].map(([v,l])=>`<button class="ex-range ${state.range===v?'active':''}" data-ex-range="${v}">${l}</button>`).join('')}</div>
      <div class="ex-pressure"><div>USER PRESSURE<b>${num(book.user_net)>=0?'+':''}${(num(book.user_net)*100).toFixed(1)}%</b></div><div>SIM FLOW<b>${num(book.bot_net)>=0?'+':''}${(num(book.bot_net)*100).toFixed(1)}%</b></div><div>ACTIVITY<b>${num(book.activity)>=0?'+':''}${(num(book.activity)*100).toFixed(1)}%</b></div></div>
      <div class="ex-order"><div><label>Signal strength</label><select id="ex-strength"><option value="1">1 × light</option><option value="2">2 ×</option><option value="3" selected>3 × medium</option><option value="4">4 ×</option><option value="5">5 × strong</option></select></div><button class="ex-buy" id="ex-buy">BUY SIGNAL</button><button class="ex-sell" id="ex-sell">SELL SIGNAL</button><span style="font-family:var(--font-mono);font-size:.58rem;color:var(--muted)">Shared price pressure; no wallet or payout.</span></div>
      <div class="ex-bottom"><div>${renderBook(book)}</div><div><div class="sec-title">User Market Tape</div>${renderTape(tape)}</div></div>`;
    drawCandles(hist);
    box.querySelectorAll('[data-ex-range]').forEach(b=>b.onclick=async()=>{state.range=Number(b.dataset.exRange);await refreshDetail()});
    $x('ex-buy').onclick=()=>sendSignal('BUY');$x('ex-sell').onclick=()=>sendSignal('SELL');
  }

  async function sendSignal(side) {
    const m=market(); if(!m)return; const strength=Number($x('ex-strength')?.value||3);
    try{await api('/exchange/signal',{method:'POST',body:JSON.stringify({user_id:Number(m.user_id),side,strength})});if(typeof toast==='function')toast(`${side} pressure sent to ${m.ticker}`);setTimeout(()=>refresh(true),650)}catch(e){if(typeof toast==='function')toast(e.message)}
  }

  async function refresh() {
    if(state.refreshing||typeof api!=='function')return;state.refreshing=true;
    try{state.markets=await api('/exchange/markets');if(!state.selected&&state.markets.length)state.selected=Number(state.markets[0].user_id);if(state.selected&&!state.markets.some(m=>Number(m.user_id)===Number(state.selected)))state.selected=state.markets.length?Number(state.markets[0].user_id):null;renderMarkets();await refreshDetail()}catch(e){if(typeof toast==='function')toast(e.message)}finally{state.refreshing=false}
  }

  injectStyles();injectPage();patchNavigation();
  setInterval(()=>{try{if(typeof activePage!=='undefined'&&activePage==='exchange')refresh()}catch(_){}},10000);
  window.addEventListener('resize',()=>{try{if(typeof activePage!=='undefined'&&activePage==='exchange')refreshDetail()}catch(_){}});
  window.LGExchange={refresh};
})();