// Order details: a checkbox beside each line item + "Mark as missing" button -> notepad.
(() => {
  const HOST_ID = 'sh-missing-host';
  const selected = new Map();   // key -> item, survives React re-renders of the rows
  let ui = null;
  let currentPath = '';
  let detected = 0;
  let matchedCount = 0;
  let noteFlag = false;

  const clean = (s) => s.replace(/\s+/g, ' ').trim();
  const isNoise = (t) =>
    /^[×x]$/i.test(t) || /^\D{0,3}[\d.,]+$/.test(t) || /price|quantity|total|discount|restock/i.test(t);

  const isHidden = SH.isHidden;
  const visText = SH.visText;

  // Quantity = the number right after the "×" sign. Also returns the element of the quantity block.
  function findQty(container, link) {
    const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let afterTimes = false;
    while (w.nextNode()) {
      const n = w.currentNode;
      const t = clean(n.nodeValue || '');
      if (!t || link.contains(n) || n.parentElement.closest('.sh-miss-cb, s-internal-tooltip')) continue;
      let qty = null;
      const same = t.match(/^×\s*(\d+)$/);
      if (same) qty = +same[1];
      else if (t === '×') { afterTimes = true; continue; }
      else if (afterTimes && /^\d+$/.test(t) && !isHidden(n.parentElement)) qty = +t;
      if (qty === null) continue;
      // climb to the outer box that contains only this number (the grey quantity block)
      let el = n.parentElement;
      while (el.parentElement && el.parentElement !== container && visText(el.parentElement) === String(qty)) el = el.parentElement;
      return { qty, el };
    }
    const m = container.textContent.match(/×\s*(\d+)/);   // fallback
    return { qty: m ? +m[1] : 1, el: null };
  }

  function parseItem({ container, link }) {
    const itemName = clean(link.textContent);
    const extra = [];
    let sku = '';
    const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      const t = clean(n.nodeValue || '');
      if (!t || link.contains(n) || n.parentElement.closest('.sh-miss-cb, s-internal-tooltip')) continue;
      if (isHidden(n.parentElement)) continue;                  // visually hidden labels
      const skuM = t.match(/^SKU[:\s]*(.+)$/i);
      if (skuM) { sku = skuM[1]; continue; }
      if (isNoise(t) || extra.includes(t)) continue;
      extra.push(t);
    }
    return { orderNumber: SH.getOrderNumber(), itemName, variant: extra.join(' / '), sku, qty: findQty(container, link).qty };
  }

  const keyOf = (it) => `${it.itemName}|${it.variant}`;

  function inject(settings) {
    const items = SH.getLineItems();          // removed items are already filtered out
    detected = items.length;

    // Note says "missing" -> find the book names in the note and color those rows
    const kw = (settings.missingKeyword || 'missing').trim().toLowerCase();
    const note = SH.getOrderNote() || SH.noteCache[SH.getOrderNumber()] || '';
    noteFlag = settings.missingOn !== false && !!kw && note.toLowerCase().includes(kw);
    const hits = noteFlag ? SH.match(note, items.map((li) => clean(li.link.textContent)), kw) : new Set();
    matchedCount = hits.size;

    const live = new Set(items.map((li) => li.container));
    document.querySelectorAll('input.sh-miss-cb').forEach((cb) => { if (!live.has(cb.parentElement)) cb.remove(); });

    items.forEach((li, idx) => {
      const c = li.container;
      c.classList.toggle('sh-note-match', hits.has(idx));

      // quantity > 1 -> black block with larger white number
      const q = findQty(c, li.link);
      c.querySelectorAll('.sh-qty-big').forEach((x) => { if (x !== q.el || q.qty <= 1) x.classList.remove('sh-qty-big'); });
      if (q.el && q.qty > 1) q.el.classList.add('sh-qty-big');

      if (c.querySelector(':scope > input.sh-miss-cb')) return;
      if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'sh-miss-cb';
      cb.title = 'Mark as missing';
      cb.checked = selected.has(keyOf(parseItem(li)));
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        const item = parseItem(li);
        cb.checked ? selected.set(keyOf(item), item) : selected.delete(keyOf(item));
        refresh();
      });
      c.prepend(cb);
    });
  }

  function say(text, kind) { ui.msg.textContent = text; ui.msg.className = kind || ''; }

  function refresh() {
    ui.btn.textContent = `Mark as missing (${selected.size})`;
    ui.btn.disabled = selected.size === 0;
    ui.info.textContent = detected
      ? `${detected} items detected` + (noteFlag ? ` · note mentions missing: ${matchedCount} highlighted` : '')
      : `No items detected (links ${SH.stats.links}, rows ${SH.stats.rows}, timeline ${SH.stats.timeline}, removed ${SH.stats.removed})`;
    ui.info.className = detected ? '' : 'warn';
  }

  function commit() {
    chrome.storage.local.get({ missingItems: [] }, (d) => {
      const list = d.missingItems;
      let added = 0, dup = 0;
      selected.forEach((it) => {
        const exists = list.some((x) => x.orderNumber === it.orderNumber && x.itemName === it.itemName && x.variant === it.variant);
        if (exists) dup++; else { list.push({ ...it, markedAt: Date.now() }); added++; }
      });
      chrome.storage.local.set({ missingItems: list }, () => {
        document.querySelectorAll('input.sh-miss-cb').forEach((cb) => (cb.checked = false));
        selected.clear();
        refresh();
        say(`Added ${added} item${added !== 1 ? 's' : ''}` + (dup ? ` (${dup} already in list)` : '') + '. Open the extension icon to view the notepad.', 'ok');
      });
    });
  }

  function buildPanel() {
    const host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .box { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; width: 250px; padding: 12px 14px;
          font: 13px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2430; background: #fff;
          border-radius: 14px; box-shadow: 0 8px 30px rgba(16,24,40,.18); display: grid; gap: 8px; }
        button { padding: 9px; border: 0; border-radius: 8px; font: inherit; font-weight: 600; cursor: pointer; background: #5b6cff; color: #fff; }
        button:disabled { background: #d5d9e4; color: #8b92a5; cursor: default; }
        #info { font-size: 12px; color: #6b7280; } #info.warn { color: #b42318; }
        #msg { font-size: 12px; } #msg.ok { color: #1d6b37; }
      </style>
      <div class="box"><div id="info"></div><button id="btn"></button><div id="msg"></div></div>`;
    ui = { host, btn: root.getElementById('btn'), info: root.getElementById('info'), msg: root.getElementById('msg') };
    ui.btn.onclick = commit;
    document.body.appendChild(host);
  }

  SH.register((settings) => {
    const existing = document.getElementById(HOST_ID);
    if (!SH.isOrderDetail()) { existing?.remove(); ui = null; return; }
    if (currentPath !== location.pathname) { currentPath = location.pathname; selected.clear(); }
    if (!existing || !ui) { existing?.remove(); buildPanel(); }
    inject(settings);
    refresh();
  });
})();
