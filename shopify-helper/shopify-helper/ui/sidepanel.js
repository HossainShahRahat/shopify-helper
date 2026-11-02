// Items are stored in chrome.storage.local under "missingItems":
// [{ orderNumber, itemName, variant, sku, qty, markedAt }]
const $ = (id) => document.getElementById(id);
let items = [];
let dirty = false; // true once the user hand-edits the text

function format(list, withSku, withOrder) {
  const line = (i) =>
    `${i.itemName}` + (i.variant ? ` - ${i.variant}` : '') + (withSku && i.sku ? ` [${i.sku}]` : '') + ((i.qty || 1) > 1 ? ` ×${i.qty}` : '');
  if (!withOrder) return list.map(line).join('\n');
  const groups = new Map();
  list.forEach((i) => { if (!groups.has(i.orderNumber)) groups.set(i.orderNumber, []); groups.get(i.orderNumber).push(i); });
  return [...groups].map(([order, its]) => `#${order}\n` + its.map(line).join('\n')).join('\n\n');
}

function render() {
  if (!dirty) $('text').value = format(items, $('sku').checked, $('order').checked);
  $('reset').hidden = !dirty;
  const list = $('list');
  list.innerHTML = '';
  let last = null;
  items.forEach((it, idx) => {
    if (it.orderNumber !== last) {
      last = it.orderNumber;
      const g = document.createElement('div'); g.className = 'group'; g.textContent = '#' + it.orderNumber; list.appendChild(g);
    }
    const row = document.createElement('div'); row.className = 'item';
    const label = document.createElement('span');
    label.textContent = `${it.itemName}${it.variant ? ' - ' + it.variant : ''}` + ((it.qty || 1) > 1 ? ` ×${it.qty}` : '');
    const rm = document.createElement('button'); rm.textContent = '✕';
    rm.onclick = () => { items.splice(idx, 1); chrome.storage.local.set({ missingItems: items }); };
    row.append(label, rm); list.appendChild(row);
  });
}

function load() {
  chrome.storage.local.get({ missingItems: [] }, (d) => {
    // keep grouped by order, preserving first-seen order
    const order = [...new Set(d.missingItems.map((i) => i.orderNumber))];
    items = order.flatMap((o) => d.missingItems.filter((i) => i.orderNumber === o));
    render();
  });
}

$('text').addEventListener('input', () => { dirty = true; $('reset').hidden = false; });
$('reset').onclick = () => { dirty = false; render(); };
$('sku').onchange = render;
$('order').onchange = render;
$('copy').onclick = async () => {
  await navigator.clipboard.writeText($('text').value);
  $('status').textContent = 'Copied to clipboard.';
  setTimeout(() => ($('status').textContent = ''), 1800);
};
$('clear').onclick = () => {
  if (confirm('Remove all missing items?')) { dirty = false; chrome.storage.local.set({ missingItems: [] }); }
};
$('opts').onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.missingItems) load(); });
load();
