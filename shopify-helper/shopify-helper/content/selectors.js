// ALL Shopify DOM knowledge lives here. If Shopify changes its markup, fix this file only.
window.SH = window.SH || {};

SH.sel = {
  TABLE: '[role="table"]',
  ROW: '[role="row"]',
  ORDER_LINK: 'a[data-primary-link][href*="/orders/"], a[href*="/orders/"]',
  CHECKBOX: 'input[type="checkbox"]',
  NOTE_ICON: 's-internal-icon[type="note"]',
};

// Orders list: /store/<name>/orders        Order detail: /store/<name>/orders/<id>
SH.isOrdersList = () => /^\/store\/[^/]+\/orders\/?$/.test(location.pathname);
SH.isOrderDetail = () => /^\/store\/[^/]+\/orders\/\d+/.test(location.pathname);

// Every real order row on the current page (header row has no order link, so it is skipped).
SH.getOrderRows = () => {
  const out = [];
  document.querySelectorAll(`${SH.sel.TABLE} ${SH.sel.ROW}`).forEach((row) => {
    const link = row.querySelector(SH.sel.ORDER_LINK);
    const checkbox = row.querySelector(SH.sel.CHECKBOX);
    if (!link || !checkbox) return;
    const m = (link.textContent || '').match(/\d+/);
    if (!m) return;
    out.push({ row, num: parseInt(m[0], 10), checkbox });
  });
  return out;
};

// Note text for a row ('' if none). The tooltip is already in the DOM, no hover needed.
SH.readNote = (row) => {
  const icon = row.querySelector(SH.sel.NOTE_ICON);
  if (!icon) return '';
  const id = icon.getAttribute('interestfor');
  let tip = id ? document.getElementById(id) : null;
  if (!tip && icon.previousElementSibling?.tagName === 'S-INTERNAL-TOOLTIP') tip = icon.previousElementSibling;
  return (tip?.textContent || '').replace(/\s+/g, ' ').trim();
};

// ---------- Order details: line items ----------
// Shopify renders the product name as <s-internal-link href=".../products/..."> (not an <a>)
SH.sel.PRODUCT_LINK = 'a[href*="/products/"], s-internal-link[href*="/products/"]';

// Finds each line-item row: the smallest ancestor of a product link that shows "×" (qty x price)
// and contains only one distinct product. Anchored on structure, not hashed class names.
// Finds every "Removed" section label, including ones drawn inside web components' shadow DOM
// or set as an attribute (heading="Removed"). Returns elements in the normal (light) DOM.
SH.findRemovedLabels = (root) => {
  const found = [];
  const outer = (el) => { let n = el; while (n.getRootNode() instanceof ShadowRoot) n = n.getRootNode().host; return n; };
  const ATTRS = ['heading', 'label', 'title', 'aria-label', 'accessibilitylabel'];
  const visit = (tree) => {
    tree.querySelectorAll('*').forEach((e) => {
      if (e.tagName.startsWith('S-')) {
        for (const a of ATTRS) { const v = e.getAttribute(a); if (v && /^removed$/i.test(v.trim())) { found.push(outer(e)); break; } }
      }
      if (e.shadowRoot) visit(e.shadowRoot);
    });
    const w = document.createTreeWalker(tree, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (/^removed$/i.test(n.nodeValue.trim()) && n.parentElement && !SH.isHidden(n.parentElement)) found.push(outer(n.parentElement));
    }
  };
  visit(root);
  return found;
};

SH.stats = { links: 0, rows: 0, timeline: 0, removed: 0, fallback: false };
SH.getLineItems = () => {
  const root = document.querySelector('main') || document.body;
  const stats = (SH.stats = { links: 0, rows: 0, timeline: 0, removed: 0, fallback: false });

  // The Timeline lists past edits (added/removed items) with names and quantities: history, not line items.
  // Found by its heading element (same lookup as a section heading), never by loose text.
  const timeline = [...root.querySelectorAll('s-internal-section[heading], s-internal-heading, h1, h2, h3, [role="heading"]')]
    .find((h) => {
      const label = h.matches('s-internal-section') ? h.getAttribute('heading') : h.textContent;
      return (label || '').trim().toLowerCase() === 'timeline';
    });

  const removedLabels = SH.findRemovedLabels(root);
  // an item is "removed" when a Removed label comes before it on the page (the Removed card is listed after the fulfillment cards)
  const underRemoved = (el) => removedLabels.some((l) => (l.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && !el.contains(l));
  const seen = new Set();
  const found = [];
  root.querySelectorAll(SH.sel.PRODUCT_LINK).forEach((first) => {
    stats.links++;
    let el = first;
    while (el.parentElement && el.parentElement !== root) {
      el = el.parentElement;
      const hrefs = new Set([...el.querySelectorAll(SH.sel.PRODUCT_LINK)].map((a) => a.getAttribute('href')));
      if (hrefs.size > 1) { el = null; break; }
      if (el.textContent.includes('×')) break;
    }
    if (!el || el === first || !el.textContent.includes('×') || seen.has(el)) return;
    seen.add(el);
    stats.rows++;
    // the image may be a link too; the title link is the one with text
    const link = [...el.querySelectorAll(SH.sel.PRODUCT_LINK)].find((a) => a.textContent.trim());
    if (!link) return;
    const inTimeline = !!(timeline && (timeline.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && !el.contains(timeline));
    found.push({ container: el, link, inTimeline, removed: inTimeline ? false : (underRemoved(el) || SH.isRemovedItem(el)) });
  });

  stats.timeline = found.filter((f) => f.inTimeline).length;
  stats.removed = found.filter((f) => f.removed).length;
  let out = found.filter((f) => !f.inTimeline && !f.removed);
  if (!out.length && found.length) { out = found.filter((f) => !f.removed); stats.fallback = true; }   // never hide everything
  if (!out.length && found.length) { out = found; stats.fallback = true; }
  return out.map(({ container, link }) => ({ container, link }));
};

// Order number shown in the page heading (falls back to the tab title).
SH.getOrderNumber = () => {
  const h = document.querySelector('h1, [role="heading"][aria-level="1"]');
  const m = (h?.textContent || '').match(/\d{3,}/) || document.title.match(/\d{3,}/);
  return m ? m[0] : '?';
};

// ---------- Shared helpers ----------
SH.isHidden = (el) => { const r = el.getBoundingClientRect(); return r.width <= 1 || r.height <= 1; };
SH.visText = (el) => {
  let s = '';
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) if (!SH.isHidden(w.currentNode.parentElement)) s += w.currentNode.nodeValue;
  return s.replace(/\s+/g, ' ').trim();
};

// Items that were removed from the order (edited out) must not be counted.
// Checks the section label above the row, a "Removed" label before any ancestor, and a "Removed" badge in the row.
SH.isRemovedItem = (container) => {
  const REMOVED = /^removed\b/i;
  // Exact structure seen on real orders: <s-internal-section heading="Removed"> wraps the removed items.
  const sec = container.closest('s-internal-section[heading]');
  if (sec && REMOVED.test((sec.getAttribute('heading') || '').trim())) return true;
  const root = document.querySelector('main') || document.body;
  let label = '';
  root.querySelectorAll('s-internal-heading, h1, h2, h3, [role="heading"]').forEach((h) => {
    if (h.querySelector(SH.sel.PRODUCT_LINK) || container.contains(h)) return;
    if (h.compareDocumentPosition(container) & Node.DOCUMENT_POSITION_FOLLOWING) label = SH.visText(h);
  });
  if (REMOVED.test(label)) return true;

  let a = container;
  for (let i = 0; i < 10 && a.parentElement; i++, a = a.parentElement) {
    const p = a.previousElementSibling;
    if (p) { const t = SH.visText(p); if (t && t.length < 60 && REMOVED.test(t)) return true; }
  }
  const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    if (/^removed$/i.test(w.currentNode.nodeValue.trim()) && !SH.isHidden(w.currentNode.parentElement)) return true;
  }
  return false;
};

// The order note: the text under the "Notes" heading in the right column.
SH.getOrderNote = () => {
  // Primary: <s-internal-section heading="Notes"> (the modal with the same heading is ignored)
  for (const s of document.querySelectorAll('s-internal-section[heading]')) {
    if ((s.getAttribute('heading') || '').trim().toLowerCase() === 'notes') {
      const t = (s.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
  }
  // Fallback: text under a "Notes" label
  for (const root of [document.querySelector('main'), document.body]) {
    if (!root) continue;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      if (w.currentNode.nodeValue.trim().toLowerCase() !== 'notes') continue;
      let el = w.currentNode.parentElement;
      for (let i = 0; i < 6 && el.parentElement; i++) {
        el = el.parentElement;
        const t = SH.visText(el);
        if (t.length > 5 && t.toLowerCase() !== 'notes') return t.replace(/^notes\s*/i, '');
      }
    }
  }
  return '';
};
