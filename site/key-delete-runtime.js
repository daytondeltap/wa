(() => {
  const SB = 'https://jwjxhxvahgrpkvaoyrzw.supabase.co';
  const ADMIN_API = `${SB}/functions/v1/lg-key-admin`;
  const nativeFetch = window.LG_NATIVE_FETCH || window.fetch.bind(window);

  function currentAccount() {
    try { return typeof account !== 'undefined' ? account : null; } catch { return null; }
  }
  function currentSiteKey() {
    try { return typeof SITE_KEY !== 'undefined' ? String(SITE_KEY || '') : ''; } catch { return ''; }
  }
  function headers() {
    const h = new Headers({'content-type':'application/json'});
    const a = currentAccount();
    if (a?.auth_method === 'google') {
      try {
        const s = JSON.parse(sessionStorage.getItem('lg_google_session') || 'null');
        if (s?.access_token) h.set('authorization', `Bearer ${s.access_token}`);
      } catch {}
    } else {
      const raw = currentSiteKey().trim();
      if (raw) h.set('x-site-key', raw);
    }
    return h;
  }

  async function deleteKey(keyId) {
    if (currentAccount()?.tier !== 'DEV') throw new Error('DEV authorization required');
    const ok = confirm(`Permanently delete key ${keyId}?\n\nThis cannot be undone. Linked Google access for this key will also be removed.`);
    if (!ok) return false;
    const r = await nativeFetch(`${ADMIN_API}/${encodeURIComponent(keyId)}/delete`, {
      method: 'POST',
      headers: headers(),
      body: '{}',
    });
    let body = null;
    try { body = await r.json(); } catch {}
    if (!r.ok) throw new Error(body?.error || body?.detail || `Delete failed (${r.status})`);
    return true;
  }

  function patch() {
    if (currentAccount()?.tier !== 'DEV') return;
    const tbody = document.querySelector('#keys-table tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(row => {
      if (row.querySelector('[data-ckm-delete]')) return;
      const source = row.querySelector('[data-ckm-config], [data-ckm-active]');
      const keyId = source?.dataset?.ckmConfig || source?.dataset?.ckmActive;
      const actionCell = source?.closest('td');
      if (!keyId || !actionCell) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn danger';
      btn.dataset.ckmDelete = keyId;
      btn.textContent = 'Delete';
      btn.title = 'Permanently delete this key';
      btn.onclick = async e => {
        e.preventDefault();
        e.stopPropagation();
        btn.disabled = true;
        try {
          if (await deleteKey(keyId)) {
            if (typeof toast === 'function') toast('Key permanently deleted');
            if (window.LGCKManager?.refreshKeys) await window.LGCKManager.refreshKeys();
            else if (typeof window.refreshKeys === 'function') await window.refreshKeys();
          }
        } catch (error) {
          if (typeof toast === 'function') toast(error.message || 'Could not delete key');
          else console.error(error);
        } finally {
          btn.disabled = false;
        }
      };
      const holder = actionCell.querySelector('.key-action-row') || actionCell;
      holder.appendChild(btn);
    });
  }

  const install = () => {
    patch();
    const root = document.getElementById('keys-table') || document.body;
    new MutationObserver(() => patch()).observe(root, {subtree:true, childList:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
