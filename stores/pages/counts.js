/* General Stores — Stock counts (stock take / cycle counts) and adjustments.
   A count freezes each item's system quantity when it is created; posting applies
   the variance (counted − frozen) as an Adjustment / Write-off through domain.postStock. */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc;
  const S = () => store.settings().stores || {};
  const inv = () => Proc.inventory || {};
  const qtyFmt = n => (inv().qtyFmt ? inv().qtyFmt(n) : util.int(n));
  const REASONS = ['Count correction', 'Damaged', 'Expired', 'Theft / loss', 'Found / surplus', 'Issued without voucher', 'Received without GRN', 'Data entry error', 'Other'];
  const WRITE_OFF = ['Damaged', 'Expired', 'Theft / loss'];

  const CSS = '.cnt-sheet td{vertical-align:middle}.cnt-sheet input.cnt-q{width:110px;text-align:right;font-variant-numeric:tabular-nums}' +
    '.cnt-sheet tr.done td{background:var(--success-bg)}.cnt-sheet tr.var td{background:var(--warning-bg)}.cnt-sheet tr.hit td{box-shadow:inset 3px 0 0 var(--primary)}' +
    '.cnt-blind .cnt-sys,.cnt-blind .cnt-var{filter:blur(5px);user-select:none}.cnt-plus{color:var(--success);font-weight:700}.cnt-minus{color:var(--danger);font-weight:700}' +
    '.cnt-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--border)}.cnt-bar .grow{flex:1}.cnt-bar .inv-scan svg{position:absolute;left:9px;top:9px;color:var(--text-3)}.cnt-bar input[data-scan]:focus{outline:none;border-style:solid;border-color:var(--primary);box-shadow:0 0 0 3px var(--focus)}';
  function css() { if (!document.getElementById('css-counts')) document.head.insertAdjacentHTML('beforeend', '<style id="css-counts">' + CSS + '</style>'); }

  const countable = () => store.list('stockItems').filter(i => i.status !== 'Inactive');
  function lineStats(c) {
    const lines = c.lines || [];
    const counted = lines.filter(l => l.countedQty !== '' && l.countedQty !== null && l.countedQty !== undefined);
    const vars = counted.filter(l => util.round2(util.num(l.countedQty) - util.num(l.systemQty)) !== 0);
    const value = util.sum(vars, l => (util.num(l.countedQty) - util.num(l.systemQty)) * util.num(l.unitCost));
    return { total: lines.length, counted: counted.length, variances: vars.length, value: util.round2(value), plus: util.round2(util.sum(vars.filter(l => l.countedQty > l.systemQty), l => (l.countedQty - l.systemQty) * util.num(l.unitCost))), minus: util.round2(util.sum(vars.filter(l => l.countedQty < l.systemQty), l => (l.countedQty - l.systemQty) * util.num(l.unitCost))) };
  }

  /* ------------------------------------------------------------ new count */
  async function newCount(preselect) {
    const items = countable();
    if (!items.length) { ui.toast('There are no stock items to count yet.', 'warning'); return null; }
    const cats = Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort();
    const locs = Array.from(new Set(items.map(i => i.location).filter(Boolean))).sort();
    return new Promise(resolve => {
      let done = false;
      ui.modal({
        title: 'New stock count', size: 'lg', onClose: () => { if (!done) resolve(null); },
        body: '<div class="form-grid">' +
          '<div class="field s6"><label>What to count</label><select name="scope">' + ui.options(['Full', 'Category', 'Location', 'Selected'].map(v => ({ value: v, label: { Full: 'Full stock take — every item', Category: 'One category', Location: 'One location / bin', Selected: 'Selected items (cycle count)' }[v] })), preselect && preselect.length ? 'Selected' : 'Full') + '</select></div>' +
          '<div class="field s6"><label>Count date</label><input type="date" name="date" value="' + util.today() + '"></div>' +
          '<div class="field s6" data-sc="Category" hidden><label>Category</label><select name="category">' + ui.options(cats) + '</select></div>' +
          '<div class="field s6" data-sc="Location" hidden><label>Location</label><select name="location">' + ui.options(locs.length ? locs : ['(none set)']) + '</select></div>' +
          '<div class="field s12" data-sc="Selected" hidden><label>Items</label><input class="input sm mb-1" data-filter placeholder="Filter items…"><div style="max-height:240px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:6px 10px" data-list>' +
          items.sort((a, b) => a.name.localeCompare(b.name)).map(i => '<label class="check" style="display:flex;padding:3px 0" data-name="' + esc((i.code + ' ' + i.name).toLowerCase()) + '"><input type="checkbox" name="pick" value="' + esc(i.id) + '"' + (preselect && preselect.indexOf(i.id) >= 0 ? ' checked' : '') + '> <span class="mono">' + esc(i.code) + '</span>&nbsp;' + esc(i.name) + '</label>').join('') + '</div></div>' +
          '<div class="field s6"><label>Counted by</label><input name="countedBy" value="' + esc(domain.officer().name) + '"></div>' +
          '<div class="field s6"><label class="lbl-text">Blind count</label><label class="check"><input type="checkbox" name="blind" checked> Hide system quantities while counting</label></div>' +
          '<div class="field s12"><label>Notes</label><input name="notes" placeholder="e.g. Quarterly stock take — witnessed by Internal Audit"></div></div>',
        onOpen: el => {
          const sc = el.querySelector('[name=scope]');
          const sync = () => el.querySelectorAll('[data-sc]').forEach(x => { x.hidden = x.dataset.sc !== sc.value; });
          sc.onchange = sync; sync();
          el.querySelector('[data-filter]').addEventListener('input', e => { const q = e.target.value.toLowerCase(); el.querySelectorAll('[data-list] label').forEach(l => { l.style.display = !q || l.dataset.name.indexOf(q) >= 0 ? 'flex' : 'none'; }); });
        },
        actions: [{ label: 'Cancel', kind: 'ghost', onClick: () => { done = true; resolve(null); } }, { label: 'Create count sheet', kind: 'primary', onClick: (close, el) => {
          const v = ui.formData(el);
          let pick = items;
          if (v.scope === 'Category') pick = items.filter(i => i.category === v.category);
          if (v.scope === 'Location') pick = items.filter(i => i.location === v.location);
          if (v.scope === 'Selected') { const ids = Array.from(el.querySelectorAll('[name=pick]:checked')).map(c => c.value); pick = items.filter(i => ids.indexOf(i.id) >= 0); }
          if (!pick.length) { ui.toast('No items match — choose another scope.', 'warning'); return false; }
          const c = store.upsert('stockCounts', {
            number: 'CNT-' + String(store.next('cnt')).padStart(4, '0'), date: v.date || util.today(), scope: v.scope, scopeValue: v.scope === 'Category' ? v.category : v.scope === 'Location' ? v.location : '',
            status: 'Open', blind: !!v.blind, countedBy: v.countedBy, notes: v.notes,
            lines: pick.sort((a, b) => (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name)).map(i => ({ itemId: i.id, code: i.code, name: i.name, unit: i.unit, location: i.location, systemQty: util.num(i.onHand), unitCost: util.num(i.avgCost), countedQty: '', variance: 0, reason: '' }))
          });
          Proc.audit('Start Stock Count', c.number + ' · ' + c.scope + (c.scopeValue ? ' ' + c.scopeValue : '') + ' · ' + c.lines.length + ' items', c.id);
          done = true; resolve(c);
        } }]
      });
    });
  }

  /* ------------------------------------------------------------ list */
  function renderList(el) {
    const counts = store.list('stockCounts');
    const open = counts.filter(c => c.status === 'Open');
    const last = counts.filter(c => c.status === 'Posted').sort((a, b) => (b.postedAt || b.date || '').localeCompare(a.postedAt || a.date || ''))[0];
    const fyStart = util.fyRange(util.fiscalYear(util.today())).start;
    const fyPosted = counts.filter(c => c.status === 'Posted' && (c.date || '') >= fyStart);
    el.innerHTML = ui.pageHead({ title: 'Stock Counts', sub: 'Physical stock takes and cycle counts. Variances are posted to the bin cards as adjustments.',
      actions: '<button class="btn" data-a="adjust">' + ui.icon('edit', 'sm') + 'Adjustment / write-off</button><button class="btn primary" data-a="new">' + ui.icon('plus', 'sm') + 'New count</button>' }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Counts in progress', icon: 'clipboardCheck', tone: open.length ? 'warn' : '', value: util.int(open.length), meta: open.length ? 'Finish and post them' : 'None open' }) +
      ui.kpi({ label: 'Last posted count', icon: 'calendar', value: last ? util.date(last.date) : '—', meta: last ? last.number + ' · ' + last.scope : 'No counts posted yet' }) +
      ui.kpi({ label: 'Counts this fiscal year', icon: 'list', value: util.int(fyPosted.length), meta: util.fiscalYear(util.today()) }) +
      ui.kpi({ label: 'Net variance this FY', icon: 'scale', tone: util.sum(fyPosted, c => lineStats(c).value) < 0 ? 'bad' : 'ok', value: util.money(util.sum(fyPosted, c => lineStats(c).value)), meta: 'Counted minus system, at cost' }) + '</div>' +
      '<div class="card"><div id="cntT"></div></div>';
    ui.table(el.querySelector('#cntT'), {
      rows: counts, initialSort: { key: 'date', dir: -1 }, placeholder: 'Search count number, scope…',
      search: c => [c.number, c.scope, c.scopeValue, c.countedBy, c.notes].join(' '),
      filters: [{ key: 'status', label: 'All counts', options: ['Open', 'Posted'] }],
      onRow: c => router.go('counts/' + c.id),
      columns: [
        { key: 'number', label: 'Count', render: c => '<span class="t-title mono">' + esc(c.number) + '</span>' + (c.legacy ? '<div class="t-sub">earlier system</div>' : '') },
        { key: 'date', label: 'Date', render: c => util.date(c.date) },
        { key: 'scope', label: 'Scope', render: c => esc(c.scope) + (c.scopeValue ? ' · ' + esc(c.scopeValue) : '') },
        { key: 'items', label: 'Counted', cls: 'num', sort: c => lineStats(c).counted, render: c => { const s = lineStats(c); return s.counted + ' / ' + s.total; } },
        { key: 'var', label: 'Variances', cls: 'num', sort: c => lineStats(c).variances, render: c => lineStats(c).variances || '<span class="muted">0</span>' },
        { key: 'val', label: 'Value variance', cls: 'num', sort: c => lineStats(c).value, render: c => { const v = lineStats(c).value; return '<span class="' + (v < 0 ? 'cnt-minus' : v > 0 ? 'cnt-plus' : '') + '">' + util.money(v) + '</span>'; } },
        { key: 'countedBy', label: 'Counted by' },
        { key: 'status', label: 'Status', render: c => ui.badge(c.status, c.status === 'Open' ? 'warning' : 'success') }
      ],
      empty: ui.empty('clipboardCheck', 'No stock counts yet', 'Start a full stock take or count a few items. Counting a different section each week (cycle counting) keeps the books accurate without closing the store.', '<button class="btn primary" data-a="new">' + ui.icon('plus', 'sm') + 'New count</button>')
    });
    el.querySelectorAll('[data-a=new]').forEach(b => b.onclick = async () => { const c = await newCount(); if (c) router.go('counts/' + c.id); });
    el.querySelector('[data-a=adjust]').onclick = async () => { if (inv().adjust && await inv().adjust()) router.refresh(); };
  }

  /* ------------------------------------------------------------ count sheet */
  function renderSheet(el, id) {
    let c = store.get('stockCounts', id);
    if (!c) { el.innerHTML = ui.empty('clipboardCheck', 'Count not found', '', '<a class="btn" href="#/counts">Back to stock counts</a>'); return; }
    ui.setCrumbs(['Stock Counts', c.number]);
    const posted = c.status === 'Posted';
    let blind = !!c.blind && !posted;
    const draw = () => {
      c = store.get('stockCounts', id);
      const s = lineStats(c);
      el.innerHTML = ui.pageHead({ back: { label: 'Stock counts', href: '#/counts' }, title: c.number + ' — ' + (c.scope === 'Full' ? 'Full stock take' : c.scope + (c.scopeValue ? ': ' + c.scopeValue : '') + ' count'), badge: ui.badge(c.status, posted ? 'success' : 'warning'),
        sub: util.dateLong(c.date) + ' · counted by ' + esc(c.countedBy || '—') + (posted ? ' · posted ' + util.date(String(c.postedAt || '').slice(0, 10)) + ' by ' + esc(c.postedBy || '') : '') + (c.notes ? ' · ' + esc(c.notes) : ''),
        actions: '<button class="btn" data-a="sheet">' + ui.icon('printer', 'sm') + 'Count sheet</button><button class="btn" data-a="report">' + ui.icon('file', 'sm') + 'Variance report</button>' +
          (posted ? '' : '<button class="btn" data-a="save">' + ui.icon('check', 'sm') + 'Save progress</button><button class="btn primary" data-a="post">' + ui.icon('send', 'sm') + 'Post count</button><button class="btn icon" data-a="more" title="More">' + ui.icon('more') + '</button>') }) +
        '<div class="grid c4 mb-3">' +
        ui.kpi({ label: 'Counted', icon: 'clipboardCheck', value: s.counted + ' / ' + s.total, meta: '<div class="progress mt-1"><div style="width:' + (s.total ? Math.round(s.counted / s.total * 100) : 0) + '%"></div></div>' }) +
        ui.kpi({ label: 'Variances', icon: 'alert', tone: s.variances ? 'warn' : 'ok', value: blind ? '—' : util.int(s.variances), meta: blind ? 'Hidden during a blind count' : 'Lines where counted ≠ system' }) +
        ui.kpi({ label: 'Surplus value', icon: 'plus', tone: 'ok', value: blind ? '—' : util.money(s.plus), meta: 'Found on the shelf' }) +
        ui.kpi({ label: 'Shortage value', icon: 'trash', tone: s.minus < 0 ? 'bad' : '', value: blind ? '—' : util.money(s.minus), meta: 'Missing from the shelf' }) + '</div>' +
        '<div class="card"><div class="cnt-bar"><div class="inv-scan" style="position:relative;flex:0 1 280px">' + ui.icon('barcode', 'sm') + '<input data-scan placeholder="Scan / type item code + Enter" autocomplete="off" style="width:100%;height:34px;border:1px dashed var(--border-strong);border-radius:8px;padding:0 10px 0 32px;background:var(--surface)"></div>' +
        (posted ? '' : '<label class="check"><input type="checkbox" data-blind' + (blind ? ' checked' : '') + '> Blind count (hide system quantities)</label>') + '<span class="grow"></span><span class="small muted" data-saved></span></div>' +
        '<div class="table-wrap"><table class="table compact cnt-sheet' + (blind ? ' cnt-blind' : '') + '"><thead><tr><th>Code</th><th>Item</th><th>Location</th><th class="num">System</th><th class="num">Counted</th><th class="num">Variance</th><th class="num">Value</th><th>Reason</th></tr></thead><tbody>' +
        c.lines.map((l, i) => {
          const has = l.countedQty !== '' && l.countedQty !== null && l.countedQty !== undefined;
          const v = has ? util.round2(util.num(l.countedQty) - util.num(l.systemQty)) : 0;
          return '<tr data-i="' + i + '" class="' + (has ? (v ? 'var' : 'done') : '') + '"><td class="mono">' + esc(l.code) + '</td><td><div class="t-title">' + esc(l.name) + '</div><div class="t-sub">' + esc(l.unit || '') + '</div></td><td>' + esc(l.location || '—') + '</td>' +
            '<td class="num cnt-sys">' + qtyFmt(l.systemQty) + '</td>' +
            '<td class="num">' + (posted ? (has ? '<b>' + qtyFmt(l.countedQty) + '</b>' : '<span class="muted">not counted</span>') : '<input class="input sm cnt-q" type="number" step="any" min="0" data-q value="' + esc(has ? l.countedQty : '') + '">') + '</td>' +
            '<td class="num cnt-var" data-v>' + (has ? '<span class="' + (v > 0 ? 'cnt-plus' : v < 0 ? 'cnt-minus' : '') + '">' + (v > 0 ? '+' : '') + qtyFmt(v) + '</span>' : '') + '</td>' +
            '<td class="num cnt-var" data-val>' + (has && v ? util.money(v * util.num(l.unitCost)) : '') + '</td>' +
            '<td>' + (posted ? esc(l.reason || '') : '<select class="input sm" data-r' + (has && v ? '' : ' disabled') + '>' + ui.options(REASONS, l.reason || (v ? 'Count correction' : ''), '—') + '</select>') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      wire();
    };
    const persist = util.debounce(() => { store.upsert('stockCounts', { id, lines: c.lines }); const s = el.querySelector('[data-saved]'); if (s) s.textContent = 'Saved ' + new Date().toTimeString().slice(0, 5); }, 600);
    function wire() {
      const rows = Array.from(el.querySelectorAll('tbody tr[data-i]'));
      rows.forEach(tr => {
        const i = +tr.dataset.i, inp = tr.querySelector('[data-q]'), sel = tr.querySelector('[data-r]');
        if (!inp) return;
        inp.addEventListener('input', () => {
          const l = c.lines[i]; l.countedQty = inp.value === '' ? '' : util.num(inp.value);
          const has = inp.value !== ''; const v = has ? util.round2(util.num(l.countedQty) - util.num(l.systemQty)) : 0; l.variance = v;
          if (v && !l.reason) { l.reason = 'Count correction'; sel.value = l.reason; }
          sel.disabled = !(has && v);
          tr.className = has ? (v ? 'var' : 'done') : '';
          tr.querySelector('[data-v]').innerHTML = has ? '<span class="' + (v > 0 ? 'cnt-plus' : v < 0 ? 'cnt-minus' : '') + '">' + (v > 0 ? '+' : '') + qtyFmt(v) + '</span>' : '';
          tr.querySelector('[data-val]').textContent = has && v ? util.money(v * util.num(l.unitCost)) : '';
          persist();
        });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); const nx = rows[rows.indexOf(tr) + 1]; if (nx) { const n = nx.querySelector('[data-q]'); n.focus(); n.select(); } }
          if (e.key === 'ArrowUp') { e.preventDefault(); const pv = rows[rows.indexOf(tr) - 1]; if (pv) { const n = pv.querySelector('[data-q]'); n.focus(); n.select(); } }
        });
        sel.onchange = () => { c.lines[i].reason = sel.value; persist(); };
      });
      const sc = el.querySelector('[data-scan]');
      sc.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return; e.preventDefault();
        const it = inv().findItem ? inv().findItem(sc.value) : domain.findStockItem(sc.value);
        const i = it ? c.lines.findIndex(l => l.itemId === it.id) : -1;
        if (i < 0) { ui.toast(it ? it.name + ' is not on this count sheet.' : 'No item with code “' + sc.value + '”', 'warning'); sc.select(); return; }
        sc.value = ''; const tr = rows[i]; rows.forEach(r => r.classList.remove('hit')); tr.classList.add('hit'); tr.scrollIntoView({ block: 'center' });
        const q = tr.querySelector('[data-q]'); if (q) { q.focus(); q.select(); }
      });
      const bl = el.querySelector('[data-blind]'); if (bl) bl.onchange = () => { blind = bl.checked; store.upsert('stockCounts', { id, blind, lines: c.lines }); draw(); };
      el.querySelector('[data-a=sheet]').onclick = () => printSheet(store.get('stockCounts', id), blind);
      el.querySelector('[data-a=report]').onclick = () => printVariance(store.get('stockCounts', id));
      if (posted) return;
      el.querySelector('[data-a=save]').onclick = () => { store.upsert('stockCounts', { id, lines: c.lines }); Proc.audit('Save Stock Count', c.number, id); ui.toast('Count saved'); draw(); };
      el.querySelector('[data-a=post]').onclick = () => postCount(id, draw);
      el.querySelector('[data-a=more]').onclick = e => ui.menu(e.currentTarget, [
        { label: 'Fill uncounted lines with system quantity', icon: 'copy', onClick: () => { c.lines.forEach(l => { if (l.countedQty === '' || l.countedQty === undefined || l.countedQty === null) { l.countedQty = util.num(l.systemQty); l.variance = 0; } }); store.upsert('stockCounts', { id, lines: c.lines }); draw(); } },
        { label: 'Refresh system quantities', icon: 'refresh', onClick: async () => { if (!(await ui.confirm('Take today’s system quantities for every line? Use this only if no stock moved since you started counting.', { ok: 'Refresh' }))) return; c.lines.forEach(l => { const it = store.get('stockItems', l.itemId); if (it) { l.systemQty = util.num(it.onHand); l.unitCost = util.num(it.avgCost); } }); store.upsert('stockCounts', { id, lines: c.lines }); draw(); } },
        { sep: true },
        { label: 'Delete count', icon: 'trash', danger: true, onClick: async () => { if (!(await ui.confirm('Delete ' + esc(c.number) + '? Nothing has been posted from it.', { ok: 'Delete', danger: true }))) return; store.remove('stockCounts', id); Proc.audit('Delete Stock Count', c.number, id); router.go('counts'); } }
      ]);
    }
    draw();
  }

  async function postCount(id, redraw) {
    const c = store.get('stockCounts', id); const s = lineStats(c);
    const uncounted = s.total - s.counted;
    const moved = c.lines.filter(l => { const it = store.get('stockItems', l.itemId); return it && util.round2(util.num(it.onHand)) !== util.round2(util.num(l.systemQty)); });
    const msg = '<p>Post <b>' + s.variances + '</b> ' + util.plural(s.variances, 'variance') + ' to the bin cards — surplus ' + util.money(s.plus) + ', shortage ' + util.money(s.minus) + ', net <b>' + util.money(s.value) + '</b>.</p>' +
      (uncounted ? '<p class="mt-1 text-warning">' + uncounted + ' ' + util.plural(uncounted, 'line is', 'lines are') + ' not counted and will be left unchanged.</p>' : '') +
      (moved.length ? '<p class="mt-1 text-warning">' + moved.length + ' ' + util.plural(moved.length, 'item has', 'items have') + ' moved since the count started; the variance is applied on top of today’s balance.</p>' : '') +
      '<p class="mt-1 small muted">This cannot be undone except by another adjustment.</p>';
    if (!(await ui.confirm(msg, { title: 'Post ' + c.number + '?', ok: 'Post count' }))) return;
    const errors = []; let n = 0;
    store.batch(() => {
      c.lines.forEach(l => {
        if (l.countedQty === '' || l.countedQty === null || l.countedQty === undefined) return;
        const v = util.round2(util.num(l.countedQty) - util.num(l.systemQty)); if (!v) return;
        try {
          domain.postStock({ itemId: l.itemId, type: v < 0 && WRITE_OFF.indexOf(l.reason) >= 0 ? 'Write-off' : 'Adjustment', qty: v, unitCost: v > 0 ? util.num(l.unitCost) : undefined, countId: c.id, ref: c.number, reason: l.reason || 'Count correction', date: c.date, notes: 'Stock count: system ' + l.systemQty + ', counted ' + l.countedQty }, { silent: true });
          n++;
        } catch (e) { errors.push(l.code + ': ' + e.message); l.postError = e.message; }
      });
      store.upsert('stockCounts', { id: c.id, status: 'Posted', postedAt: new Date().toISOString(), postedBy: domain.officer().name, lines: c.lines, postErrors: errors }, { silent: true });
    });
    Proc.audit('Post Stock Count', c.number + ' · ' + n + ' adjustments · net ' + util.money(s.value) + (errors.length ? ' · ' + errors.length + ' failed' : ''), c.id);
    if (errors.length) ui.toast('Posted with ' + errors.length + ' problems: ' + errors.slice(0, 2).join('; '), 'warning', 9000);
    else ui.toast(c.number + ' posted — ' + n + ' ' + util.plural(n, 'adjustment') + ' made');
    router.refresh();
  }

  function printSheet(c, blind) {
    if (!inv().pdfTable) return;
    inv().pdfTable({ title: 'STOCK COUNT SHEET — ' + c.number, filename: 'Count sheet ' + c.number, pageLabel: c.number,
      subtitle: [(S().storeName || 'General Stores') + ' · ' + (c.scope === 'Full' ? 'Full stock take' : c.scope + ': ' + (c.scopeValue || 'selected items')) + ' · ' + util.dateLong(c.date), 'Count every item on the shelf and write the quantity in the Counted column. Do not use the system figures.'],
      head: blind ? ['#', 'Code', 'Item', 'Unit', 'Location', 'Counted', 'Remarks'] : ['#', 'Code', 'Item', 'Unit', 'Location', 'System', 'Counted', 'Remarks'],
      body: c.lines.map((l, i) => blind ? [i + 1, l.code, l.name, l.unit || '', l.location || '', '', ''] : [i + 1, l.code, l.name, l.unit || '', l.location || '', qtyFmt(l.systemQty), '', '']),
      columnStyles: blind ? { 0: { cellWidth: 22 }, 1: { cellWidth: 56 }, 3: { cellWidth: 38 }, 5: { cellWidth: 64 }, 6: { cellWidth: 100 } } : { 0: { cellWidth: 22 }, 1: { cellWidth: 56 }, 3: { cellWidth: 38 }, 5: { cellWidth: 46, halign: 'right' }, 6: { cellWidth: 60 }, 7: { cellWidth: 84 } },
      fontSize: 9, signatures: [['Counted by', c.countedBy || ''], ['Witnessed by', ''], ['Date', '']] });
  }
  function printVariance(c) {
    if (!inv().pdfTable) return;
    const s = lineStats(c);
    const vars = c.lines.filter(l => l.countedQty !== '' && l.countedQty !== undefined && l.countedQty !== null && util.round2(l.countedQty - l.systemQty) !== 0);
    inv().pdfTable({ title: 'STOCK COUNT VARIANCE REPORT — ' + c.number, filename: 'Variance report ' + c.number, pageLabel: c.number,
      subtitle: [(S().storeName || 'General Stores') + ' · ' + util.dateLong(c.date) + ' · ' + c.status + (c.postedBy ? ' by ' + c.postedBy : ''), s.counted + ' of ' + s.total + ' lines counted · ' + s.variances + ' variances · surplus ' + util.money(s.plus) + ' · shortage ' + util.money(s.minus) + ' · net ' + util.money(s.value)],
      head: ['Code', 'Item', 'Unit', 'System', 'Counted', 'Variance', 'Unit cost', 'Value', 'Reason'],
      body: vars.map(l => { const v = util.round2(l.countedQty - l.systemQty); return [l.code, l.name, l.unit || '', qtyFmt(l.systemQty), qtyFmt(l.countedQty), (v > 0 ? '+' : '') + qtyFmt(v), util.money(l.unitCost), util.money(v * util.num(l.unitCost)), l.reason || '']; }),
      foot: ['', 'Net variance', '', '', '', '', '', util.money(s.value), ''],
      columnStyles: { 0: { cellWidth: 50 }, 2: { cellWidth: 32 }, 3: { halign: 'right', cellWidth: 42 }, 4: { halign: 'right', cellWidth: 44 }, 5: { halign: 'right', cellWidth: 46 }, 6: { halign: 'right', cellWidth: 54 }, 7: { halign: 'right', cellWidth: 60 } },
      signatures: [['Storekeeper', c.countedBy || ''], ['Verified by', ''], ['Approved by', '']] });
  }

  Proc.page({
    id: 'counts', title: 'Stock Counts', icon: 'clipboardCheck', section: 'Workflow', order: 30,
    count: () => store.filter('stockCounts', c => c.status === 'Open').length,
    render(el, params) {
      css();
      if (params[0] === 'new') { el.innerHTML = ''; newCount().then(c => router.go(c ? 'counts/' + c.id : 'counts')); return; }
      if (params[0]) renderSheet(el, params[0]); else renderList(el);
    }
  });
  Proc.quickCreate.push({ label: 'Stock count', icon: 'clipboardCheck', order: 46, onClick: async () => { const c = await newCount(); if (c) router.go('counts/' + c.id); } });
  Proc.counts = { newCount, lineStats };
})();
