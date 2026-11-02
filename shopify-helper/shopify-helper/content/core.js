// Settings, theme, SPA-safe re-run loop. Feature modules register with SH.register(fn).
(() => {
  const DEFAULTS = { themeOn: true, preset: 'clean', accent: '#5b6cff', radius: 12, rules: [], missingOn: true, missingKeyword: 'missing', missingColor: '#ffe58a' };
  SH.settings = { ...DEFAULTS };
  SH.modules = [];
  SH.register = (fn) => SH.modules.push(fn);

  let timer;
  SH.schedule = () => { clearTimeout(timer); timer = setTimeout(run, 150); };

  let lastRulesCss = null;
  function applyRulesCss(rules) {
    const css = rules
      .filter((r) => r.enabled !== false && /^[\w-]+$/.test(r.id) && /^#[0-9a-f]{3,8}$/i.test(r.color))
      .map((r) => `[role="row"][data-sh-rule="${r.id}"] [role="cell"]{background-color:${r.color} !important;}`)
      .join('\n');
    if (css === lastRulesCss) return;
    lastRulesCss = css;
    let el = document.getElementById('sh-rules-style');
    if (!el) { el = document.createElement('style'); el.id = 'sh-rules-style'; document.head.appendChild(el); }
    el.textContent = css;
  }

  function applyTheme(s) {
    const b = document.body;
    if (!b) return;
    b.classList.toggle('sh-theme-on', !!s.themeOn);
    ['clean', 'soft', 'brand'].forEach((p) => b.classList.toggle('sh-preset-' + p, s.preset === p));
    b.style.setProperty('--sh-accent', /^#[0-9a-f]{3,8}$/i.test(s.accent) ? s.accent : DEFAULTS.accent);
    b.style.setProperty('--sh-missing-color', /^#[0-9a-f]{3,8}$/i.test(s.missingColor) ? s.missingColor : DEFAULTS.missingColor);
    b.style.setProperty('--sh-radius', (Number(s.radius) || 12) + 'px');
  }

  function run() {
    const s = SH.settings;
    applyTheme(s);
    applyRulesCss(s.rules || []);
    SH.modules.forEach((m) => { try { m(s); } catch (e) { console.warn('[Shopify Helper]', e); } });
  }

  // SPA: Shopify never reloads the page, so re-run on any DOM change (debounced).
  new MutationObserver(SH.schedule).observe(document.documentElement, { childList: true, subtree: true });
  let lastUrl = location.href;
  setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; SH.schedule(); } }, 400);

  // Notes seen on the orders list are remembered, so the order page can use them if it can't read its own Notes block.
  SH.noteCache = {};
  SH.rememberNotes = (map) => {
    let changed = false;
    for (const [k, v] of Object.entries(map)) {
      if (v) { if (SH.noteCache[k] !== v) { SH.noteCache[k] = v; changed = true; } }
      else if (k in SH.noteCache) { delete SH.noteCache[k]; changed = true; }
    }
    if (!changed) return;
    const keys = Object.keys(SH.noteCache);
    if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach((k) => delete SH.noteCache[k]);
    try { chrome.storage.local.set({ noteCache: SH.noteCache }); } catch (e) { /* extension reloaded */ }
  };
  chrome.storage.local.get({ noteCache: {} }, (d) => { SH.noteCache = d.noteCache || {}; SH.schedule(); });

  chrome.storage.sync.get(DEFAULTS, (stored) => { SH.settings = { ...DEFAULTS, ...stored }; run(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k in changes) SH.settings[k] = changes[k].newValue;
    run();
  });
})();
