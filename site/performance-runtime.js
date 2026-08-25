(()=>{
  const q=(s,r=document)=>r.querySelector(s);
  let resizeTimer=0;

  function ensureCss(){
    if(q('#lg-performance-css'))return;
    const link=document.createElement('link');
    link.id='lg-performance-css';
    link.rel='stylesheet';
    link.href='performance.css';
    document.head.appendChild(link);
  }

  function classify(){
    const nav=navigator||{};
    const conn=nav.connection||nav.mozConnection||nav.webkitConnection||{};
    const mem=Number(nav.deviceMemory||0);
    const cores=Number(nav.hardwareConcurrency||0);
    const coarse=matchMedia('(pointer:coarse)').matches;
    const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
    const narrow=innerWidth<=900;
    const lite=Boolean(conn.saveData||reduced||(mem>0&&mem<=4)||(cores>0&&cores<=4)||(coarse&&narrow));
    const balanced=!lite&&Boolean((mem>0&&mem<=8)||(cores>0&&cores<=8)||(coarse&&innerWidth<=1200));
    document.body.classList.toggle('lg-perf-lite',lite);
    document.body.classList.toggle('lg-perf-balanced',balanced);
  }

  function visibility(){
    document.body.classList.toggle('lg-page-hidden',document.hidden);
  }

  function boot(){
    ensureCss();
    classify();
    visibility();
    document.addEventListener('visibilitychange',visibility,{passive:true});
    addEventListener('resize',()=>{
      clearTimeout(resizeTimer);
      resizeTimer=setTimeout(classify,220);
    },{passive:true});
    try{navigator.connection?.addEventListener?.('change',classify,{passive:true})}catch{}
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
