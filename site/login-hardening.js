(()=>{
  const form=document.getElementById('login-form');
  const input=document.getElementById('login-key');
  const error=document.getElementById('login-error');
  if(!form||!input||!error)return;

  const button=form.querySelector('button[type="submit"]');
  const MAX=192;
  // LG keys are opaque tokens. Restrict the browser entry point to printable ASCII
  // and explicitly reject characters useful for HTML/JS/control-sequence injection.
  const validKey=value=>{
    const key=String(value??'').trim();
    return key.length>=8&&key.length<=MAX&&/^[\x21-\x7e]+$/.test(key)&&!/[<>"'`\\]/.test(key);
  };
  const showError=message=>{
    error.textContent=message;
    error.classList.remove('hidden');
  };
  const clearError=()=>{
    error.textContent='';
    error.classList.add('hidden');
  };

  form.setAttribute('autocomplete','off');
  input.maxLength=MAX;
  input.autocomplete='off';
  input.autocapitalize='none';
  input.spellcheck=false;
  input.setAttribute('aria-describedby','login-error');
  input.setAttribute('inputmode','text');

  try{
    const stored=sessionStorage.getItem('lg_site_key');
    if(stored&&!validKey(stored))sessionStorage.removeItem('lg_site_key');
  }catch{}

  input.addEventListener('input',()=>{
    if(input.value.length>MAX)input.value=input.value.slice(0,MAX);
    clearError();
  },{passive:true});

  input.addEventListener('paste',event=>{
    const pasted=event.clipboardData?.getData('text')??'';
    if(!validKey(pasted)){
      event.preventDefault();
      input.value='';
      showError('Invalid access key format.');
    }
  });

  // Replace the original handler: never reflect the key or raw backend errors into the DOM.
  form.onsubmit=async event=>{
    event.preventDefault();
    clearError();
    const key=String(input.value??'').trim();
    if(!validKey(key)){
      input.value='';
      showError('Invalid access key format.');
      return;
    }

    if(button){
      button.disabled=true;
      button.dataset.label=button.textContent||'Enter';
      button.textContent='Checking…';
      button.setAttribute('aria-busy','true');
    }

    try{
      if(typeof login!=='function')throw new Error('Login unavailable');
      await login(key);
      input.value='';
    }catch{
      try{SITE_KEY=''}catch{}
      showError('Access key rejected.');
    }finally{
      if(button){
        button.disabled=false;
        button.textContent=button.dataset.label||'Enter';
        button.removeAttribute('aria-busy');
      }
    }
  };
})();
