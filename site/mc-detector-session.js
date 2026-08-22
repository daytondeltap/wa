(()=>{
  let last=sessionStorage.getItem('lg_site_key')||'';
  setInterval(()=>{
    const now=sessionStorage.getItem('lg_site_key')||'';
    if(now===last)return;
    last=now;
    const sw=document.getElementById('mcx-sw');
    if(!now)return;
    if(sw&&document.body.classList.contains('mc-mode')){
      sw.click();
      sw.click();
    }
  },500);
})();
