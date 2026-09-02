(()=>{
  const F=[
    ['monitor','RBX Monitor'],['leaderboard','Leaderboard'],['exchange','LG Exchange'],['history','History'],['adduser','User Adding'],['cards','Cards'],['mc','MC Detector']
  ];
  const S={rows:[]};
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const e=s=>typeof esc==='function'?esc(s):String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=s=>typeof fmtHistTs==='function'?fmtHistTs(s):new Date(s).toLocaleString();

  function style(){if(q('#lg-keygen-style'))return;const s=document.createElement('style');s.id='lg-keygen-style';s.textContent=`
    .lg-key-extra{display:flex;flex-direction:column;gap:.35rem;flex:1;min-width:240px}.lg-key-extra label,.lg-ck-title{font-size:.65rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--subtext)}
    .lg-ck-box{display:none;margin-top:.85rem;padding:.8rem;border:1px solid var(--border);border-radius:7px;background:rgba(255,255,255,.018)}.lg-ck-box.show{display:block}.lg-ck-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:.45rem;margin-top:.55rem}.lg-ck-check{display:flex;gap:.4rem;align-items:center;font:600 .65rem var(--font-mono);color:var(--subtext);border:1px solid var(--border);border-radius:5px;padding:.45rem .5rem}.lg-ck-check input{accent-color:var(--accent2)}
    .lg-feature-list{display:flex;gap:.25rem;flex-wrap:wrap;max-width:340px}.lg-feature-chip{font:600 .51rem var(--font-mono);border:1px solid var(--border);border-radius:99px;padding:.12rem .3rem;color:var(--subtext)}.lg-feature-chip.on{color:var(--accent2);border-color:color-mix(in srgb,var(--accent2) 55%,var(--border))}
    .lg-email-cell{font:600 .58rem var(--font-mono);color:var(--subtext);max-width:240px;overflow-wrap:anywhere}.lg-google-ready{font-size:.5rem;color:var(--green);margin-top:.2rem}.lg-google-old{font-size:.5rem;color:var(--muted);margin-top:.2rem}
    .lg-key-modal{position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:1rem}.lg-key-modal-box{width:min(620px,96vw);max-height:90vh;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:1rem}.lg-key-modal textarea{min-height:75px;resize:vertical;width:100%}.lg-key-modal .ask-input{width:100%}
    @media(max-width:760px){#keys-table th:nth-child(5),#keys-table td:nth-child(5),#keys-table th:nth-child(7),#keys-table td:nth-child(7){display:none}.lg-key-extra{min-width:100%}}
  `;document.head.appendChild(s)}

  function checklist(prefix,values={},defaultMonitor=false){return `<div class="lg-ck-grid">${F.map(([k,n])=>`<label class="lg-ck-check"><input type="checkbox" data-${prefix}-perm="${k}" ${(values?.[k]||(defaultMonitor&&k==='monitor'))?'checked':''}><span>${n}</span></label>`).join('')}</div>`}
  function readPerms(prefix){const out={};for(const [k]of F)out[k]=Boolean(q(`[data-${prefix}-perm="${k}"]`)?.checked);return out}
  function parseEmails(v){return String(v??'').split(/[\n,;]/).map(x=>x.trim().toLowerCase()).filter(Boolean)}

  function enhanceForm(){
    const form=q('#keygen-form'),tier=q('#keygen-tier');if(!form||!tier||form.dataset.lgEnhanced)return;
    form.dataset.lgEnhanced='1';
    const firstLabel=tier.closest('.adduser-field')?.querySelector('label');if(firstLabel)firstLabel.textContent='Key Type';
    if(![...tier.options].some(o=>o.value==='CK_'))tier.add(new Option('CK_ — Custom feature access','CK_'));
    const email=document.createElement('div');email.className='lg-key-extra';email.innerHTML='<label for="keygen-emails">Google emails (optional)</label><input class="ask-input" id="keygen-emails" maxlength="1000" placeholder="name@example.com · up to 5, comma separated"><div class="adduser-hint">Each linked Google account can sign in as this key. No Gmail permission is requested.</div>';
    const submit=form.querySelector('button[type="submit"]');form.insertBefore(email,submit);
    const box=document.createElement('div');box.id='lg-ck-create';box.className='lg-ck-box';box.innerHTML=`<div class="lg-ck-title">CK allowed features</div><div class="adduser-hint">Checked features are enforced by the backend gateway, not just hidden in the UI.</div>${checklist('create',{},true)}`;form.after(box);
    const toggle=()=>box.classList.toggle('show',tier.value==='CK_');tier.addEventListener('change',toggle);toggle();
    form.onsubmit=async ev=>{
      ev.preventDefault();
      const btn=form.querySelector('button[type="submit"]');if(btn){btn.disabled=true;btn.textContent='Generating…'}
      try{
        const t=tier.value,p=t==='CK_'?readPerms('create'):{};
        if(t==='CK_'&&!Object.values(p).some(Boolean))throw new Error('Select at least one CK feature');
        const x=await api('/keys/generate',{method:'POST',body:JSON.stringify({tier:t,label:q('#keygen-label')?.value.trim()||'',emails:parseEmails(q('#keygen-emails')?.value),permissions:p})});
        const out=q('#keygen-result');if(out)out.innerHTML=`<div class="adduser-hint">Copy this now — plaintext is shown once.</div><div class="key-output">${e(x.raw_key)}</div>${x.emails?.length?`<div class="adduser-hint">Google login linked: ${x.emails.map(e).join(', ')}</div>`:''}`;
        if(q('#keygen-label'))q('#keygen-label').value='';if(q('#keygen-emails'))q('#keygen-emails').value='';
        await refreshKeys();
      }catch(ex){toast(ex.message||'Could not generate key')}
      finally{if(btn){btn.disabled=false;btn.textContent='+ Generate Key'}}
    };
  }

  function fixedFeatures(t){if(t==='PK_')return ['monitor','leaderboard','exchange','history','adduser','cards','mc'];if(t==='UPK_')return ['leaderboard','adduser','cards','mc'];if(t==='BK_')return ['monitor','adduser','cards','mc'];return []}
  function featureHtml(x){const on=x.tier==='CK_'?F.filter(([k])=>x.permissions?.[k]).map(([k,n])=>[k,n]):F.filter(([k])=>fixedFeatures(x.tier).includes(k));return `<div class="lg-feature-list">${on.length?on.map(([k,n])=>`<span class="lg-feature-chip on">${e(n)}</span>`).join(''):'<span class="lg-feature-chip">None</span>'}</div>`}

  refreshKeys=async function(){
    if(account?.tier!=='DEV')return;
    try{
      const rows=await api('/keys');S.rows=rows||[];
      const table=q('#keys-table'),head=table?.querySelector('thead'),body=table?.querySelector('tbody');if(!table||!body)return;
      if(head)head.innerHTML='<tr><th>Type</th><th>Label</th><th>Google Email</th><th>Features</th><th>Key ID</th><th>Status</th><th>Created</th><th>Actions</th></tr>';
      body.innerHTML=S.rows.length?S.rows.map(x=>`<tr data-lg-key-row="${e(x.key_id)}"><td>${e(x.tier)}</td><td>${e(x.key_label||'—')}</td><td class="lg-email-cell">${x.emails?.length?x.emails.map(e).join('<br>'):'—'}<div class="${x.google_ready?'lg-google-ready':'lg-google-old'}">${x.google_ready?'Google-ready':'Older key · raw key needed to add Google'}</div></td><td>${featureHtml(x)}</td><td><code>${e(x.key_id)}</code></td><td>${x.active?'Active':'Revoked'}</td><td>${fmt(x.created_at)}</td><td><div class="cg-row"><button class="btn" data-lg-config="${e(x.key_id)}">Configure</button><button class="btn ${x.active?'danger':''}" data-lg-keyact="${e(x.key_id)}" data-lg-action="${x.active?'revoke':'reactivate'}">${x.active?'Revoke':'Reactivate'}</button></div></td></tr>`).join(''):'<tr><td colspan="8" class="empty">No generated keys</td></tr>';
      qa('[data-lg-config]').forEach(b=>b.onclick=()=>openConfig(b.dataset.lgConfig));
      qa('[data-lg-keyact]').forEach(b=>b.onclick=async()=>{try{b.disabled=true;await api(`/keys/${b.dataset.lgKeyact}/${b.dataset.lgAction}`,{method:'POST'});await refreshKeys()}catch(ex){toast(ex.message)}finally{b.disabled=false}});
    }catch(ex){toast(ex.message)}
  };

  function openConfig(id){
    const x=S.rows.find(r=>String(r.key_id)===String(id));if(!x)return;
    q('#lg-key-config-modal')?.remove();
    const m=document.createElement('div');m.id='lg-key-config-modal';m.className='lg-key-modal';
    m.innerHTML=`<div class="lg-key-modal-box"><div class="sec-title">Configure ${e(x.tier)} key</div><div class="adduser-field"><label>Label</label><input id="lg-cfg-label" class="ask-input" maxlength="60" value="${e(x.key_label||'')}"></div><div class="adduser-field" style="margin-top:.7rem"><label>Google emails · up to 5</label><textarea id="lg-cfg-emails" class="ask-input" placeholder="one@example.com, two@example.com">${e((x.emails||[]).join('\n'))}</textarea><div class="adduser-hint">Only the verified email from Google is used. The linked LG raw key is never sent to Google.</div></div>${x.google_ready?'':`<div class="adduser-field" style="margin-top:.7rem"><label>Original raw key · only required for this older key</label><input id="lg-cfg-raw" class="ask-input" type="password" autocomplete="off" placeholder="Enter once to enable Google login"><div class="adduser-hint">Newly generated keys do not need this step.</div></div>`}${x.tier==='CK_'?`<div class="lg-ck-box show"><div class="lg-ck-title">Allowed features</div>${checklist('config',x.permissions||{})}</div>`:''}<div class="cg-row" style="margin-top:1rem"><button class="btn btn-accent" id="lg-cfg-save">Save</button><button class="btn" id="lg-cfg-cancel">Cancel</button></div></div>`;
    document.body.appendChild(m);
    q('#lg-cfg-cancel',m).onclick=()=>m.remove();m.onclick=ev=>{if(ev.target===m)m.remove()};
    q('#lg-cfg-save',m).onclick=async()=>{
      const b=q('#lg-cfg-save',m);try{b.disabled=true;b.textContent='Saving…';const payload={label:q('#lg-cfg-label',m).value.trim(),emails:parseEmails(q('#lg-cfg-emails',m).value)};if(x.tier==='CK_'){payload.permissions=readPerms('config');if(!Object.values(payload.permissions).some(Boolean))throw new Error('Select at least one CK feature')}const raw=q('#lg-cfg-raw',m)?.value.trim();if(raw)payload.raw_key=raw;await api(`/keys/${x.key_id}/config`,{method:'POST',body:JSON.stringify(payload)});m.remove();toast('Key configuration saved');await refreshKeys()}catch(ex){toast(ex.message)}finally{if(b?.isConnected){b.disabled=false;b.textContent='Save'}}
    };
  }

  function boot(){style();enhanceForm();if(account?.tier==='DEV')refreshKeys().catch(()=>{})}
  window.addEventListener('lg-account-ready',()=>{enhanceForm();if(account?.tier==='DEV')refreshKeys().catch(()=>{})});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
