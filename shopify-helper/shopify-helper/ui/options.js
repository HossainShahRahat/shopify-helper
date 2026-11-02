const DEFAULTS = { themeOn: true, preset: 'clean', accent: '#5b6cff', radius: 12, rules: [], missingOn: true, missingKeyword: 'missing', missingColor: '#ffe58a' };
const $ = (id) => document.getElementById(id);
let s = { ...DEFAULTS };
let t;

function save() {
  clearTimeout(t);
  t = setTimeout(() => chrome.storage.sync.set(s, () => {
    $('saved').textContent = 'Saved';
    setTimeout(() => ($('saved').textContent = ''), 1200);
  }), 250);
}

function renderRules() {
  const box = $('rules');
  box.innerHTML = '';
  if (!s.rules.length) box.innerHTML = '<div class="hint">No rules yet. Example: text "phone off" with a red color.</div>';
  s.rules.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'rule';
    const en = Object.assign(document.createElement('input'), { type: 'checkbox', checked: r.enabled !== false });
    en.onchange = () => { r.enabled = en.checked; save(); };
    const text = Object.assign(document.createElement('input'), { type: 'text', value: r.text || '', placeholder: 'Text to find in note' });
    text.oninput = () => { r.text = text.value; save(); };
    const match = document.createElement('select');
    [['contains', 'contains'], ['exact', 'exactly']].forEach(([v, l]) => match.add(new Option(l, v, false, r.match === v)));
    match.onchange = () => { r.match = match.value; save(); };
    const color = Object.assign(document.createElement('input'), { type: 'color', value: r.color || '#ffd6d6' });
    color.oninput = () => { r.color = color.value; save(); };
    const tools = document.createElement('span');
    const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; return b; };
    tools.append(
      mk('↑', () => { if (i > 0) { [s.rules[i - 1], s.rules[i]] = [s.rules[i], s.rules[i - 1]]; renderRules(); save(); } }),
      mk('↓', () => { if (i < s.rules.length - 1) { [s.rules[i + 1], s.rules[i]] = [s.rules[i], s.rules[i + 1]]; renderRules(); save(); } }),
      mk('✕', () => { s.rules.splice(i, 1); renderRules(); save(); })
    );
    row.append(en, text, match, color, tools);
    box.appendChild(row);
  });
}

function renderTheme() {
  $('themeOn').checked = s.themeOn; $('preset').value = s.preset; $('accent').value = s.accent;
  $('radius').value = s.radius; $('radiusVal').textContent = s.radius;
  $('missingOn').checked = s.missingOn; $('missingKeyword').value = s.missingKeyword; $('missingColor').value = s.missingColor;
}

$('themeOn').onchange = (e) => { s.themeOn = e.target.checked; save(); };
$('preset').onchange = (e) => { s.preset = e.target.value; save(); };
$('accent').oninput = (e) => { s.accent = e.target.value; save(); };
$('radius').oninput = (e) => { s.radius = +e.target.value; $('radiusVal').textContent = s.radius; save(); };
$('missingOn').onchange = (e) => { s.missingOn = e.target.checked; save(); };
$('missingKeyword').oninput = (e) => { s.missingKeyword = e.target.value; save(); };
$('missingColor').oninput = (e) => { s.missingColor = e.target.value; save(); };
$('add').onclick = () => {
  s.rules.push({ id: 'r' + Date.now().toString(36), text: '', match: 'contains', color: '#ffd6d6', enabled: true });
  renderRules(); save();
};

chrome.storage.sync.get(DEFAULTS, (d) => { s = { ...DEFAULTS, ...d }; renderTheme(); renderRules(); });
