(()=>{
  const q=(s,r=document)=>r.querySelector(s);
  let resizeTimer=0,longWindowStart=0,longCount=0,longObserver=null;

  function ensureCss(){
    if(q('#lg-performance-css'))return;
    const link=document.createElement('link');
    link.id='lg-performance-css';
    link.rel='stylesheet';
    link.href='performance.css';
    document.head.appendChild(link);
  }

  function forceDownOneLevel(){
    if(document.body.classList.contains('lg-perf-lite'))return;
    if(document.body.classList.contains('lg-perf-balanced')){
      document.body.classList.remove('lg-perf-balanced');
      document.body.classList.add('lg-perf-lite');
      try{sessionStorage.setItem('lg_perf_runtime_downshift','lite')}catch{}
    }else{
      document.body.classList.add('lg-perf-balanced');
      try{sessionStorage.setItem('lg_perf_runtime_downshift','balanced')}catch{}
    }
  }

  function classify(){
    const nav=navigator||{};
    const conn=nav.connection||nav.mozConnection||nav.webkitConnection||{};
    const mem=Number(nav.deviceMemory||0);
    const cores=Number(nav.hardwareConcurrency||0);
    const coarse=matchMedia('(pointer:coarse)').matches;
    const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
    const narrow=innerWidth<=900;
    const slowNet=/^(slow-2g|2g|3g)$/i.test(String(conn.effectiveType||''));
    let lite=Boolean(conn.saveData||slowNet||reduced||(mem>0&&mem<=4)||(cores>0&&cores<=4)||(coarse&&narrow));
    let balanced=!lite&&Boolean((mem>0&&mem<=8)||(cores>0&&cores<=8)||(coarse&&innerWidth<=1200));
    try{
      const runtime=sessionStorage.getItem('lg_perf_runtime_downshift');
      if(runtime==='lite'){lite=true;balanced=false}
      else if(runtime==='balanced'&&!lite)balanced=true;
    }catch{}
    document.body.classList.toggle('lg-perf-lite',lite);
    document.body.classList.toggle('lg-perf-balanced',balanced);
  }

  function visibility(){
    document.body.classList.toggle('lg-page-hidden',document.hidden);
  }

  function watchLongTasks(){
    if(!('PerformanceObserver'in window))return;
    try{
      longObserver=new PerformanceObserver(list=>{
        if(document.hidden||document.body.classList.contains('lg-perf-lite'))return;
        const now=performance.now();
        if(!longWindowStart||now-longWindowStart>8000){longWindowStart=now;longCount=0}
        for(const entry of list.getEntries())if(entry.duration>=80)longCount++;
        if(longCount>=4){forceDownOneLevel();longWindowStart=now;longCount=0}
      });
      longObserver.observe({type:'longtask',buffered:false});
    }catch{}
  }

  function boot(){
    ensureCss();
    classify();
    visibility();
    watchLongTasks();
    document.addEventListener('visibilitychange',visibility,{passive:true});
    addEventListener('resize',()=>{
      clearTimeout(resizeTimer);
      resizeTimer=setTimeout(classify,220);
    },{passive:true});
    try{navigator.connection?.addEventListener?.('change',classify,{passive:true})}catch{}
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
