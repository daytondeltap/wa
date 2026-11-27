(() => {
  const get = id => document.getElementById('activity-code-' + id);
  const dialog = get('dialog');
  const picker = get('player');
  let users = [], request = 0;
  let optionsSignature = '';

  function clearCode() {
    get('value').value = '';
    get('result').hidden = true;
    get('status').textContent = '';
  }

  get('open').onclick = () => {
    clearCode();
    dialog.showModal();
  };
  get('close').onclick = () => dialog.close();
  dialog.onclose = () => {
    request++;
    get('generate').disabled = false;
    clearCode();
  };
  picker.onchange = () => {
    request++;
    get('generate').disabled = false;
    clearCode();
  };

  get('form').onsubmit = async event => {
    event.preventDefault();
    const userId = Number(picker.value);
    if (!users.some(user => Number(user.id) === userId)) return;
    const version = ++request;
    const viewer = account?.key_id || SITE_KEY;
    const current = () => dialog.open && request === version && (account?.key_id || SITE_KEY) === viewer;
    clearCode();
    get('generate').disabled = true;
    get('status').textContent = 'Generating code…';
    try {
      const result = await api('/monitor/activity-code', {
        method:'POST', body:JSON.stringify({user_id:userId}),
      });
      if (!current()) return;
      get('value').value = result.code;
      get('result').hidden = false;
      get('status').textContent = 'Expires at ' + fmtTs(result.expires_at) + '.';
    } catch (error) {
      if (current()) get('status').textContent = error.message;
    } finally {
      if (current()) get('generate').disabled = false;
    }
  };
  get('copy').onclick = async () => {
    const input = get('value');
    try {
      await navigator.clipboard.writeText(input.value);
      if (dialog.open && input.value) get('status').textContent = 'Code copied.';
    } catch (_) {
      input.focus();
      input.select();
    }
  };

  const app = document.getElementById('app');
  new MutationObserver(() => {
    if (!app.classList.contains('hidden')) return;
    get('open').hidden = true;
    if (dialog.open) dialog.close();
    for (const note of app.querySelectorAll('.activity-checkin-note')) {
      note.hidden = true;
      note.textContent = '';
    }
  }).observe(app, {attributes:true,attributeFilter:['class']});

  window.LGActivityCheckin = {
    update(data) {
      users = data.activity_checkin_enabled && account?.tier === 'DEV' ? data.users ?? [] : [];
      get('open').hidden = !users.length;
      if (!users.length && dialog.open) dialog.close();
      const signature = JSON.stringify(users.map(({id,name}) => [id,name]));
      if (signature === optionsSignature) return;
      optionsSignature = signature;
      const previous = picker.value;
      picker.replaceChildren(...users.map(user => new Option(user.name, String(user.id))));
      if (users.some(user => String(user.id) === previous)) picker.value = previous;
      else if (dialog.open) picker.onchange();
    },
  };
})();
