(() => {
  for (const input of document.querySelectorAll('[data-filter-list]')) {
    const id = input.dataset.filterList;
    const list = document.getElementById(id);
    const container = list.tBodies?.[0] ?? list;
    const empty = document.querySelector(`[data-empty-list="${id}"]`);
    let timer;
    function apply() {
      const term = input.value.trim().toLocaleLowerCase();
      const rows = [...container.children].filter(row=>!row.matches('.empty') && !row.querySelector('td.empty'));
      let matches = 0;
      for (const row of rows) {
        row.hidden = term && !row.textContent.toLocaleLowerCase().includes(term);
        if (!row.hidden) matches++;
      }
      empty.hidden = !term || !rows.length || matches > 0;
    }
    input.addEventListener('input',()=>{
      clearTimeout(timer);
      timer = setTimeout(apply,90);
    });
    new MutationObserver(apply).observe(container,{childList:true});
  }
  new MutationObserver(()=>{
    if (!document.getElementById('app').classList.contains('hidden')) return;
    for (const input of document.querySelectorAll('[data-filter-list]')) {
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }
    document.getElementById('keygen-result').replaceChildren();
  }).observe(document.getElementById('app'),{attributes:true,attributeFilter:['class']});
})();
