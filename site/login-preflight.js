(()=>{
  const MAX=192;
  const valid=value=>{
    const key=String(value??'').trim();
    return key.length>=8&&key.length<=MAX&&/^[\x21-\x7e]+$/.test(key)&&!/[<>"'`\\]/.test(key);
  };
  try{
    const stored=sessionStorage.getItem('lg_site_key');
    if(stored&&!valid(stored))sessionStorage.removeItem('lg_site_key');
  }catch{}
})();
