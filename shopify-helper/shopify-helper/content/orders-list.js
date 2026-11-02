// Orders list: note-based row coloring + range select with gap check.
(() => {
  // ---------- 1. Highlight rows by note ----------
  function matchRule(note, rules) {
    if (!note) return null;
    const n = note.toLowerCase();
    for (const r of rules) {
      if (r.enabled === false || !r.text) continue;
      const t = r.text.trim().toLowerCase();
      if (!t) continue;
      if (r.match === 'exact' ? n === t : n.includes(t)) return r; // first match wins
    }
    return null;
  }

  function highlight(settings) {
    const notes = {};
    for (const { row, num } of SH.getOrderRows()) {
      const note = SH.readNote(row);
      notes[num] = note;
      const rule = matchRule(note, settings.rules || []);
      const want = rule ? rule.id : null;
      if ((row.getAttribute('data-sh-rule') || null) !== want) {
        want ? row.setAttribute('data-sh-rule', want) : row.removeAttribute('data-sh-rule');
      }
    }
    SH.rememberNotes(notes);
  }

  // ---------- 2. Range select panel (Shadow DOM so Shopify CSS can't touch it) ----------
  const HOST_ID = 'sh-range-host';
  let ui = {};

  function say(html, kind) {
    ui.msg.className = kind || '';
    ui.msg.innerHTML = html;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function selectRange() {
    let from = parseInt(ui.from.value, 10);
    let to = parseInt(ui.to.value, 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return say('Enter both a From and a To order number.', 'err');
    if (from > to) [from, to] = [to, from];
    if (to - from > 2000) return say('That range is too large (max 2000).', 'err');

    const rows = SH.getOrderRows();
    if (!rows.length) return say('No order rows found on this page yet.', 'err');
    const byNum = new Map(rows.map((r) => [r.num, r]));

    const missing = [];
    for (let n = from; n <= to; n++) if (!byNum.has(n)) missing.push(n);

    if (missing.length && !ui.force.checked) {
      const shown = missing.slice(0, 25).map((n) => '#' + n).join(', ');
      const more = missing.length > 25 ? ` and ${missing.length - 25} more` : '';
      return say(
        `<b>${missing.length} order${missing.length > 1 ? 's' : ''} missing on this page:</b><br>${esc(shown)}${more}` +
        `<br><br>Nothing was selected. They may be on another page, filtered out, or sorted differently. ` +
        `Increase the page size or change the filter, then try again. ` +
        `If you know they don't exist, tick "Proceed anyway".`,
        'err'
      );
    }

    const targets = rows.filter((r) => r.num >= from && r.num <= to);
    targets.forEach((r) => { if (!r.checkbox.checked) r.checkbox.click(); }); // real click so React updates

    setTimeout(() => {
      const done = targets.filter((r) => r.checkbox.checked).length;
      done === targets.length
        ? say(`Selected ${done} order${done !== 1 ? 's' : ''} (#${from} to #${to}).`, 'ok')
        : say(`Selected ${done} of ${targets.length}. Some checkboxes did not respond, try again.`, 'err');
    }, 300);
  }

  function clearSelection() {
    let n = 0;
    SH.getOrderRows().forEach((r) => { if (r.checkbox.checked) { r.checkbox.click(); n++; } });
    say(n ? `Cleared ${n} selected order${n !== 1 ? 's' : ''}.` : 'Nothing was selected.', n ? 'ok' : '');
  }

  function buildPanel() {
    const host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .box { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; width: 270px;
          font: 13px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2430;
          background: #fff; border-radius: 14px; box-shadow: 0 8px 30px rgba(16,24,40,.18); overflow: hidden; }
        .head { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;
          background: #5b6cff; color: #fff; font-weight: 600; cursor: pointer; user-select: none; }
        .body { padding: 12px 14px 14px; display: grid; gap: 10px; }
        .collapsed .body { display: none; }
        .row { display: flex; gap: 8px; }
        input[type=number] { width: 100%; box-sizing: border-box; padding: 7px 9px; border: 1px solid #d5d9e4; border-radius: 8px; font: inherit; }
        label.small { display: flex; gap: 6px; align-items: center; color: #5b6272; font-size: 12px; }
        button { flex: 1; padding: 8px; border: 0; border-radius: 8px; font: inherit; font-weight: 600; cursor: pointer; }
        .primary { background: #5b6cff; color: #fff; } .ghost { background: #eef0f6; color: #1f2430; }
        #msg { font-size: 12px; border-radius: 8px; padding: 0; }
        #msg.err { background: #fdecec; color: #8a1f1f; padding: 8px 10px; }
        #msg.ok { background: #e8f6ec; color: #1d6b37; padding: 8px 10px; }
      </style>
      <div class="box" id="box">
        <div class="head" id="head"><span>Range select</span><span id="chev">▾</span></div>
        <div class="body">
          <div class="row"><input type="number" id="from" placeholder="From #"><input type="number" id="to" placeholder="To #"></div>
          <label class="small"><input type="checkbox" id="force"> Proceed even if some are missing</label>
          <div class="row"><button class="primary" id="go">Select</button><button class="ghost" id="clear">Clear</button></div>
          <div id="msg"></div>
        </div>
      </div>`;
    ui = {
      host, box: root.getElementById('box'), from: root.getElementById('from'), to: root.getElementById('to'),
      force: root.getElementById('force'), msg: root.getElementById('msg'),
    };
    root.getElementById('go').onclick = selectRange;
    root.getElementById('clear').onclick = clearSelection;
    root.getElementById('head').onclick = () => ui.box.classList.toggle('collapsed');
    document.body.appendChild(host);
  }

  SH.register((settings) => {
    const existing = document.getElementById(HOST_ID);
    if (!SH.isOrdersList()) { existing?.remove(); return; }
    if (!existing) buildPanel();
    highlight(settings);
  });
})();
