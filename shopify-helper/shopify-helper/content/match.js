// Matches book names written in an order note against the order's line-item names.
window.SH = window.SH || {};
SH.match = (() => {
  const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'by', 'and', 'to', 'on', 'for', 'is', 'are', 'was', 'were', 'it']);
  const NOISE = new Set(['missing', 'miss', 'item', 'items', 'book', 'books', 'please', 'pls', 'plz', 'print', 'reprint',
    're', 'need', 'needed', 'not', 'found', 'no', 'out', 'stock', 'this', 'that', 'these', 'those', 'with', 'from', 'order',
    'paperback', 'hardcover', 'novel', 'manga']);

  const words = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);

  function lev(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 3;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  const same = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && lev(a, b) <= (Math.min(a.length, b.length) >= 9 ? 2 : 1));
  const coverage = (seg, pool) => seg.filter((t) => pool.some((p) => same(t, p))).length / seg.length;
  const coreOf = (name) => name.split(' - ')[0].split(/\s+by\s+/i)[0];

  return function match(note, names, keyword) {
    const out = new Set();
    const kw = (keyword || 'missing').trim().toLowerCase();
    if (!note || !kw || !note.toLowerCase().includes(kw)) return out;

    const noise = new Set([...NOISE, ...words(kw)]);
    const clean = (list, extra) => list.filter((t) => !STOP.has(t) && !noise.has(t) && !(extra && extra.has(t)));
    const items = names.map((n) => ({ full: words(n).filter((t) => !STOP.has(t)), core: clean(words(coreOf(n))) }));
    const noteToks = clean(words(note));

    // A) the whole book title appears inside the note
    items.forEach((it, i) => {
      const hit = it.core.filter((t) => noteToks.some((p) => same(t, p))).length;
      if (it.core.length >= 2 ? hit >= 2 && hit / it.core.length >= 0.66 : it.core.length === 1 && it.core[0].length >= 4 && hit === 1) out.add(i);
    });

    // B) a piece of the note (split on , ; | / & + newline) is a partial title, e.g. "little life"
    note.split(/[\n,;|\/&+]+/).forEach((raw) => {
      const seg = clean(words(raw.replace(/^\s*(\d+[.)]|[-•*])\s*/, '')));
      if (!seg.length || (seg.length === 1 && seg[0].length < 4)) return;
      let best = 0, scores = items.map((it) => {
        const cov = coverage(seg, it.full);
        const common = seg.filter((t) => it.full.some((p) => same(t, p))).length;
        return cov * 0.7 + (2 * common / (seg.length + it.full.length || 1)) * 0.3 + (cov >= 0.7 ? 0 : -1);
      });
      best = Math.max(...scores);
      if (best < 0.5) return;
      scores.forEach((s, i) => { if (s >= best - 0.001) out.add(i); });
    });
    return out;
  };
})();
