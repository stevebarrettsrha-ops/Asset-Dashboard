/* ==========================================================================
   Price Comparison — #/sourcing, #/sourcing/new, #/sourcing/<id>
   Quotes from every supplier side by side, the lowest compliant price
   picked per line (or for the whole lot), the approval route that follows,
   and one-click hand-off to the approval memo and purchase orders.
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, K, files, router } = Proc;
  const esc = util.esc;

  if (!document.getElementById('css-sourcing')) document.head.insertAdjacentHTML('beforeend', '<style id="css-sourcing">' +
    '.cmp-matrix{width:100%}.cmp-matrix tfoot td{position:static}.cmp-matrix tfoot td.sticky-l{position:sticky;left:0;bottom:auto;z-index:2}' +
    '.cmp-matrix th.sticky-l,.cmp-matrix td.sticky-l{min-width:290px;max-width:360px;box-shadow:1px 0 0 var(--border)}' +
    '.cmp-matrix .item-cell{display:flex;align-items:center;gap:6px}.cmp-matrix .item-cell .ln{width:20px;text-align:right;color:var(--text-3);font-size:12px;flex:none}' +
    '.cmp-matrix .item-cell input{flex:1;min-width:0}.cmp-matrix .spec{margin:4px 0 0 26px}.cmp-matrix .spec input{height:26px;font-size:12px;width:calc(100% - 26px)}' +
    '.cmp-matrix input.input.sm{height:30px;padding:0 8px}.cmp-matrix td.u input{width:74px}.cmp-matrix td.q input{width:76px;text-align:right}' +
    '.cmp-matrix td.cell input{text-align:right}.cmp-matrix td.cell .ext{display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:11.5px;color:var(--text-3);padding:0 6px 2px;min-height:18px;font-variant-numeric:tabular-nums}' +
    '.cmp-matrix td.cell .aw{border:0;background:none;cursor:pointer;color:var(--text-3);opacity:0;padding:0;display:inline-grid;place-items:center}' +
    '.cmp-matrix td.cell:hover .aw{opacity:.7}.cmp-matrix td.cell.awarded .aw{opacity:1;color:var(--success)}' +
    '.cmp-matrix td.cell.lowest .ext{color:var(--success)}' +
    '.cmp-matrix td.cell.noncompliant input{color:var(--text-3);text-decoration:line-through}' +
    '.cmp-matrix .cmp-sh{vertical-align:top;min-width:168px;max-width:220px}.cmp-matrix .cmp-sh .top{display:flex;align-items:flex-start;gap:4px;justify-content:space-between}' +
    '.cmp-matrix .cmp-sh .nm a{color:var(--text)}.cmp-matrix .cmp-sh .ctl{display:flex;gap:10px;margin-top:6px;font-weight:500;flex-wrap:wrap}' +
    '.cmp-matrix .cmp-sh .ctl label{display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-size:11.5px;color:var(--text-2)}' +
    '.cmp-matrix .cmp-sh .ctl input{width:14px;height:14px;accent-color:var(--primary)}.cmp-matrix .cmp-sh .mt{font-size:11px;color:var(--text-3);margin-top:4px;font-weight:400}' +
    '.cmp-matrix .cmp-sh.nc .nm a{color:var(--text-3);text-decoration:line-through}' +
    '.cmp-matrix td.awd{min-width:180px}.cmp-matrix td.awd select{width:100%}.cmp-matrix td.awd .amt{font-size:11.5px;color:var(--text-3);text-align:right;margin-top:2px;font-variant-numeric:tabular-nums}' +
    '.cmp-matrix tfoot td.lbl{text-align:right;color:var(--text-2);font-weight:600}.cmp-matrix tfoot tr.tot td{font-size:14px;color:var(--text)}.cmp-matrix tfoot td.best{color:var(--success)}' +
    '.cmp-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--border)}' +
    '.cmp-toolbar .add-sup{display:flex;gap:6px;flex:1 1 280px;max-width:420px}.cmp-toolbar .add-sup input{flex:1}' +
    '.saved-ind{display:inline-flex;align-items:center;gap:5px}.saved-ind .d{width:7px;height:7px;border-radius:50%;background:var(--success)}.saved-ind.busy .d{background:var(--warning)}' +
    '.award-list .aw-row{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);align-items:flex-start}.award-list .aw-row:last-child{border-bottom:0}' +
    '.award-list .aw-row .nm{font-weight:600}.award-list .aw-row .sub{font-size:12px;color:var(--text-3)}' +
    '.metric{display:flex;justify-content:space-between;font-size:13px;padding:5px 0}.metric span:first-child{color:var(--text-3)}' +
    '.cmp-empty-hint{padding:26px;text-align:center;color:var(--text-3)}' +
    /* Comparison sheet: laid out like the procurement workbook — item columns, then one column group per
       supplier; the supplier chosen for an item has its cells shaded grey, as in the sheet. */
    '.xl-wrap{overflow:auto;max-height:72vh;border-top:1px solid var(--border);background:#fff}' +
    'table.xl{border-collapse:collapse;font:12px/1.3 Arial,Helvetica,sans-serif;color:#111;background:#fff;min-width:100%}' +
    'table.xl th,table.xl td{border:1px solid #bfbfbf;padding:3px 6px;vertical-align:middle;background:#fff;color:#111}' +
    'table.xl thead th{font-weight:700;text-transform:uppercase;font-size:11px;text-align:left;white-space:normal;position:sticky;z-index:1}' +
    'table.xl thead tr.nm th{top:0;height:34px;font-size:11.5px}table.xl thead tr.hd th{top:34px}' +
    'table.xl td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}table.xl td.c{text-align:center}' +
    'table.xl td.d{min-width:230px;max-width:360px;font-weight:600;text-transform:uppercase}table.xl td.ino{text-align:center;color:#444}' +
    'table.xl th.gs{border-left:2px solid #7f7f7f}table.xl td.gs{border-left:2px solid #7f7f7f}' +
    'table.xl .won,table.xl thead th.won{background:#7f7f7f!important;color:#000}' +
    'table.xl td.q{cursor:default}table.xl.click td.q{cursor:pointer}table.xl.click td.q:hover{outline:2px solid #1f6feb;outline-offset:-2px}' +
    'table.xl tfoot td{font-weight:700;background:#fff}table.xl tfoot td.lbl{text-transform:uppercase}' +
    'table.xl td.low{box-shadow:inset 0 -2px 0 #2e7d32}' +
    '.xl-legend{display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--text-2);padding:8px 14px;border-top:1px solid var(--border)}' +
    '.xl-legend i{display:inline-block;width:22px;height:13px;vertical-align:-2px;margin-right:6px;border:1px solid #bfbfbf}' +
    '.xl-legend i.g{background:#7f7f7f}.xl-legend i.l{background:#fff;box-shadow:inset 0 -2px 0 #2e7d32}' +
    '.grid.side.sheet-wide{grid-template-columns:minmax(0,1fr)}.grid.side.sheet-wide>.stack+.stack{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:var(--gap,16px);align-items:start}' +
    '@media (max-width:760px){.cmp-matrix th.sticky-l,.cmp-matrix td.sticky-l{min-width:170px;max-width:190px}.cmp-matrix .item-cell .ln{display:none}.cmp-matrix .cmp-sh{min-width:140px}.cmp-toolbar .add-sup{max-width:none}}' +
    '</style>');

  let editorCleanup = null;
  const ACTIVE = ['Open', 'Evaluated'];

  Proc.page({
    id: 'sourcing', title: 'Price Comparison', icon: 'scale', section: 'Workflow', order: 20,
    count() { return store.filter('comparisons', c => ACTIVE.indexOf(c.status) >= 0).length; },
    render(el, params) {
      if (editorCleanup) { const f = editorCleanup; editorCleanup = null; f(); }
      if (!params.length) return renderList(el);
      if (params[0] === 'new') {
        const q = router.parse().query;
        const req = q.req ? store.get('requisitions', q.req) : null;
        if (req && Proc.requisitions) { Proc.requisitions.startComparison(req); return; }
        const c = store.upsert('comparisons', blank());
        history.replaceState(null, '', '#/sourcing/' + c.id);
        router.params = [c.id];
        return renderEditor(el, c.id);
      }
      const c = store.get('comparisons', params[0]);
      if (!c) { el.innerHTML = ui.pageHead({ title: 'Comparison not found', back: { label: 'Price comparisons', href: '#/sourcing' } }) + '<div class="card">' + ui.empty('scale', 'This price comparison no longer exists', 'It may have been deleted.') + '</div>'; return; }
      return renderEditor(el, c.id);
    }
  });
  Proc.quickCreate.push({ label: 'Price comparison', icon: 'scale', order: 20, onClick: () => router.go('sourcing/new') });

  function blank() {
    return {
      number: store.next('cmp'), ref: '', subject: '', date: util.today(), closingDate: '', requisitionId: '', department: '', method: 'Restricted Bidding (RB)',
      viaGojep: true, invited: 0, type: 'Goods', category: '', estimate: 0, items: [newItem(), newItem(), newItem()], suppliers: [], prices: {}, awardMode: 'item', awards: {},
      lotSupplierId: '', evaluationNote: '', status: 'Open'
    };
  }
  /** Lines that received quotes but are not awarded (unquoted lines do not block evaluation). */
  function pendingLines(r) { return r.lines.filter(l => !l.awardSid && Object.keys(l.quotes).length); }
  function unquotedLines(r) { return r.lines.filter(l => !Object.keys(l.quotes).length && String(l.item.description || '').trim()); }
  function newItem(o) { return Object.assign({ id: util.uid('L'), description: '', unit: '', qty: '', spec: '' }, o || {}); }
  const isBlankItem = i => !String(i.description || '').trim() && !util.num(i.qty);
  const cmpTitle = c => c.ref || c.subject || 'Price comparison #' + (c.number || '');

  /* =============================================================== LIST */
  let listSeg = 'Active';
  /** The comparison laid out like the workbook. opts.click: cells can be clicked to award the item. */
  function sheetTable(c, r, opts) {
    opts = opts || {};
    const sups = (c.suppliers || []).filter(s => r.bySupplier[s.supplierId]);
    const n2 = v => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const unitFmt = v => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    const awarded = sid => r.awards.find(a => a.supplierId === sid);
    let h = '<table class="xl' + (opts.click ? ' click' : '') + '"><thead><tr class="nm"><th colspan="4"></th>' +
      sups.map(s => '<th colspan="4" class="gs' + (awarded(s.supplierId) ? ' won' : '') + '">' + esc(r.bySupplier[s.supplierId].name) + (s.compliant === false ? ' <span style="font-weight:400;text-transform:none">(non-compliant)</span>' : '') + '</th>').join('') + '</tr>' +
      '<tr class="hd"><th>Item #</th><th>Quantity</th><th>Unit of measure</th><th>Item description</th>' +
      sups.map(s => { const w = awarded(s.supplierId) ? ' won' : ''; return '<th class="gs' + w + '">Unit cost</th><th class="' + w + '">Extended cost</th><th class="' + w + '">Total</th><th class="' + w + '">T/NT</th>'; }).join('') + '</tr></thead><tbody>';
    r.lines.forEach((l, i) => {
      h += '<tr><td class="ino">' + esc(l.item.itemNo || (i + 1)) + '</td><td class="n">' + (l.qty ? util.int(l.qty) : '') + '</td><td>' + esc(l.item.unit || '') + '</td><td class="d">' + esc(l.item.description || '') + '</td>';
      sups.forEach(s => {
        const q = l.quotes[s.supplierId], won = l.awardSid === s.supplierId ? ' won' : '', low = !won && l.lowestSid === s.supplierId ? ' low' : '';
        const at = q && opts.click ? ' data-aw-item="' + esc(l.item.id) + '" data-aw-sid="' + esc(s.supplierId) + '" title="Award this item to ' + esc(r.bySupplier[s.supplierId].name) + '"' : '';
        if (!q) { h += '<td class="gs"></td><td></td><td></td><td></td>'; return; }
        h += '<td class="n q gs' + won + low + '"' + at + '>' + unitFmt(q.unit) + '</td><td class="n q' + won + '"' + at + '>' + n2(q.eff) + '</td><td class="n q' + won + '"' + at + '>' + n2(q.extInc) + '</td><td class="c q' + won + '"' + at + '>' + (s.gct ? 'T' : 'NT') + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody><tfoot><tr><td colspan="4" class="lbl" style="text-align:right">Total</td>' +
      sups.map(s => { const b = r.bySupplier[s.supplierId]; return '<td class="gs lbl">Total</td><td></td><td class="n">' + (b.quoted ? n2(b.total) : '') + '</td><td></td>'; }).join('') + '</tr>' +
      '<tr><td colspan="4" class="lbl" style="text-align:right">Awarded</td>' +
      sups.map(s => { const a = awarded(s.supplierId); return '<td class="gs' + (a ? ' won' : '') + '"></td><td class="' + (a ? 'won' : '') + '"></td><td class="n' + (a ? ' won' : '') + '">' + (a ? n2(a.total) : '') + '</td><td class="' + (a ? 'won' : '') + '"></td>'; }).join('') + '</tr></tfoot></table>';
    return h;
  }

  function renderList(el) {
    const all = store.list('comparisons').slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || 0) - (a.number || 0));
    const rows = all.map(c => {
      const r = domain.computeComparison(c);
      return {
        id: c.id, ref: c.ref, subject: c.subject, date: c.date, method: c.method, status: c.status, suppliers: (c.suppliers || []).length, bids: r.bidsReceived,
        invited: util.num(c.invited) || (c.suppliers || []).length, items: (c.items || []).filter(i => !isBlankItem(i)).length, award: r.awardTotal,
        awardees: r.awards.map(a => a.name), fy: util.fiscalYear(c.date), memoId: c.memoId, poCount: (c.poIds || []).length, number: c.number
      };
    });
    const fy = util.fiscalYear(util.today());
    const counts = { Active: rows.filter(r => ACTIVE.indexOf(r.status) >= 0).length, All: rows.length };
    K.CMP_STATUSES.forEach(s => { counts[s] = rows.filter(r => r.status === s).length; });
    const segs = ['Active', 'All'].concat(K.CMP_STATUSES.filter(s => counts[s]));
    const fyRows = rows.filter(r => r.fy === fy && r.status !== 'Cancelled');

    el.innerHTML = ui.pageHead({
      title: 'Price Comparison', sub: 'Compare quotations side by side and award to the lowest compliant supplier',
      actions: '<button class="btn" id="cmpReport">' + ui.icon('printer', 'sm') + 'Print report</button><a class="btn primary" href="#/sourcing/new">' + ui.icon('plus', 'sm') + 'New comparison</a>'
    }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Open comparisons', value: util.int(counts.Active), icon: 'scale', meta: 'Collecting or evaluating quotes' }) +
      ui.kpi({ label: 'Memo prepared', value: util.int(counts['Memo Prepared'] || 0), icon: 'stamp', tone: counts['Memo Prepared'] ? 'warn' : '', meta: 'Awaiting approval' }) +
      ui.kpi({ label: 'Approved, no PO yet', value: util.int(counts.Approved || 0), icon: 'cart', tone: counts.Approved ? 'pur' : '' }) +
      ui.kpi({ label: 'Recommended awards ' + fy, value: util.moneyShort(util.sum(fyRows, r => r.award)), icon: 'award', tone: 'ok', meta: fyRows.length + ' ' + util.plural(fyRows.length, 'comparison') }) +
      '</div>' +
      '<div class="card"><div class="card-h"><div class="seg" id="cmpSeg">' + segs.map(s => '<button data-s="' + esc(s) + '" class="' + (s === listSeg ? 'on' : '') + '">' + esc(s) + '<span class="n">' + (counts[s] || 0) + '</span></button>').join('') + '</div></div><div id="cmpTable"></div></div>';

    const rowsFor = s => s === 'All' ? rows : s === 'Active' ? rows.filter(r => ACTIVE.indexOf(r.status) >= 0) : rows.filter(r => r.status === s);
    const methods = Array.from(new Set(rows.map(r => r.method).filter(Boolean)));
    const tbl = ui.table(el.querySelector('#cmpTable'), {
      rows: rowsFor(listSeg), placeholder: 'Search reference, subject, supplier…',
      search: r => [r.ref, r.subject, r.method, r.awardees.join(' '), r.number].join(' '),
      filters: [{ key: 'method', label: 'Any method', options: methods }],
      onRow: r => router.go('sourcing/' + r.id),
      empty: ui.empty('scale', 'No price comparisons here', 'Start one from an approved requisition, or create one directly — for example this week’s ground provisions.', '<a class="btn primary" href="#/sourcing/new">' + ui.icon('plus', 'sm') + 'New comparison</a>'),
      columns: [
        { key: 'ref', label: 'Reference', sort: r => r.ref || r.subject, render: r => '<div class="t-title">' + esc(r.ref || '(no reference)') + '</div><div class="t-sub">' + esc(r.subject || '') + '</div>' },
        { key: 'date', label: 'Date', render: r => '<span class="nowrap">' + esc(util.date(r.date)) + '</span>' },
        { key: 'method', label: 'Method', render: r => r.method ? '<span class="chip">' + esc(K.METHOD_SHORT[r.method] || r.method) + '</span>' : '—' },
        { key: 'items', label: 'Lines', cls: 'num' },
        { key: 'bids', label: 'Bids', cls: 'num', render: r => r.bids + '<span class="muted"> / ' + r.invited + '</span>' },
        { key: 'awardees', label: 'Recommended', sort: r => r.awardees.join(), render: r => r.awardees.length ? '<div class="truncate" style="max-width:240px">' + esc(r.awardees[0]) + '</div>' + (r.awardees.length > 1 ? '<div class="t-sub">+ ' + (r.awardees.length - 1) + ' more</div>' : '') : '<span class="muted">—</span>' },
        { key: 'award', label: 'Award total', cls: 'num', render: r => r.award ? util.money(r.award) : '<span class="muted">—</span>' },
        { key: 'status', label: 'Status', render: r => ui.badge(r.status) }
      ]
    });
    el.querySelectorAll('#cmpSeg button').forEach(b => b.onclick = () => {
      listSeg = b.dataset.s; el.querySelectorAll('#cmpSeg button').forEach(x => x.classList.toggle('on', x === b)); tbl.refresh(rowsFor(listSeg));
    });
    el.querySelector('#cmpReport').onclick = () => reportDialog(all);
  }
  /** Print a report of the comparisons for a month (or all): summary, totals by supplier, then each sheet. */
  async function reportDialog(all) {
    const months = Array.from(new Set(all.map(c => (c.date || '').slice(0, 7)).filter(Boolean))).sort().reverse();
    const label = ym => util.MONTHS[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4);
    if (!months.length) { ui.toast('There are no price comparisons to report on yet.', 'info'); return; }
    const v = await ui.form('Print price comparison report', [
      { name: 'month', label: 'Month', type: 'select', options: months.map(m => ({ value: m, label: label(m) })).concat([{ value: 'all', label: 'All months' }]), value: months[0] },
      { name: 'which', label: 'Include', type: 'select', options: [{ value: 'all', label: 'Every comparison' }, { value: 'awarded', label: 'Only comparisons with a recommended award' }, { value: 'multi', label: 'Only comparisons with two or more quotes' }], value: 'all' },
      { name: 'save', label: '', type: 'checkbox', checkLabel: 'Download the PDF instead of opening it to print' }
    ], { ok: 'Print report' });
    if (!v) return;
    let list = all.filter(c => v.month === 'all' || (c.date || '').slice(0, 7) === v.month);
    if (v.which !== 'all') list = list.filter(c => { const r = domain.computeComparison(c); return v.which === 'awarded' ? r.awards.length : r.bidsReceived >= 2; });
    list.sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.ref || '').localeCompare(String(b.ref || ''), undefined, { numeric: true }));
    if (!list.length) { ui.toast('No comparisons match — try another month or include every comparison.', 'info'); return; }
    ui.toast('Preparing the report (' + list.length + ' ' + util.plural(list.length, 'comparison') + ')…', 'info');
    try { await Proc.pdf.comparisonReport(list, { title: v.month === 'all' ? 'All months' : label(v.month), output: v.save ? 'save' : 'open' }); Proc.audit('Print Comparison Report', (v.month === 'all' ? 'All months' : label(v.month)) + ' · ' + list.length + ' comparisons'); }
    catch (e) { ui.toast('Could not make the report: ' + e.message, 'error'); }
  }

  /* ============================================================= EDITOR */
  function renderEditor(el, id) {
    let c = util.clone(store.get('comparisons', id));
    c.items = c.items || []; c.suppliers = c.suppliers || []; c.prices = c.prices || {}; c.awards = c.awards || {};
    if (!c.items.length) c.items.push(newItem());
    let pending = false, deleted = false, showSpecs = c.items.some(i => i.spec);
    ui.supplierDatalist();
    if (!document.getElementById('dl-units')) document.body.insertAdjacentHTML('beforeend', '<datalist id="dl-units">' + K.UNITS.map(u => '<option value="' + esc(u) + '">').join('') + '</datalist>');

    /* ---------- persistence ---------- */
    function autoStatus() {
      if (ACTIVE.indexOf(c.status) < 0) return;
      const r = domain.computeComparison(c);
      c.status = r.awards.length && !pendingLines(r).length ? 'Evaluated' : 'Open';
    }
    function persist() {
      if (deleted) return;
      autoStatus();
      store.upsert('comparisons', util.clone(c));
      pending = false;
      setSaved();
      const b = el.querySelector('#cmpBadge'); if (b) b.innerHTML = ui.badge(c.status);
    }
    const saveSoon = util.debounce(persist, 500);
    function touch() { pending = true; setSaved(true); saveSoon(); }
    function flush() { if (pending) persist(); }
    function setSaved(busy) {
      const s = el.querySelector('#savedInd'); if (!s) return;
      s.className = 'saved-ind' + (busy ? ' busy' : '');
      s.innerHTML = '<span class="d"></span>' + (busy ? 'Saving…' : 'All changes saved');
    }
    const isEmpty = () => !c.subject && !c.ref && !c.suppliers.length && !c.items.some(i => String(i.description || '').trim()) && !c.requisitionId;
    const cleanup = () => {
      window.removeEventListener('beforeunload', onUnload);
      if (deleted) return;
      if (isEmpty() && !c.memoId && !(c.poIds || []).length) { store.remove('comparisons', c.id); return; }
      flush();
    };
    const onUnload = () => { flush(); store.flush(); };
    window.addEventListener('beforeunload', onUnload);
    editorCleanup = cleanup;
    router.beforeLeave = () => { if (editorCleanup === cleanup) editorCleanup = null; cleanup(); return true; };

    /* ---------- skeleton ---------- */
    el.innerHTML = '<div id="cmpHead"></div>' +
      '<div id="cmpBanner"></div>' +
      '<div class="grid side">' +
      '<div class="stack" style="min-width:0">' +
      '<div class="card"><div class="card-h"><div><h3>Details</h3><div class="sub">Reference, method and dates used on the memo and the PRS return</div></div></div><div class="card-b"><div class="form-grid" id="cmpDetails">' +
      '<div class="field s5"><label>Reference #</label><div class="row" style="flex-wrap:nowrap;gap:6px"><input name="ref" value="' + esc(c.ref) + '" placeholder="RFQ-MEDSUNDRIES-MPH/092026"><button class="btn sm" type="button" data-act="suggest" title="Suggest a reference in the hospital’s format">Suggest</button></div></div>' +
      '<div class="field s7"><label>Subject (what is being procured)<span class="req">*</span></label><input name="subject" value="' + esc(c.subject) + '" placeholder="e.g. Medical Sundries"><div class="hint">Printed on the memo: “the procurement of <i>subject</i>”.</div></div>' +
      '<div class="field s4"><label>Method</label><select name="method">' + ui.options(K.METHODS, c.method) + '</select></div>' +
      '<div class="field s2"><label>Invited</label><input type="number" min="0" name="invited" value="' + esc(c.invited || '') + '"></div>' +
      '<div class="field s3"><label>Quote date</label><input type="date" name="date" value="' + esc(c.date) + '"></div>' +
      '<div class="field s3"><label>Closing date</label><input type="date" name="closingDate" value="' + esc(c.closingDate) + '"></div>' +
      '<div class="field s3"><label>Type</label><select name="type">' + ui.options(K.TYPES, c.type || 'Goods') + '</select></div>' +
      '<div class="field s5"><label>PRS category</label><select name="category">' + ui.categoryOptions(c.category, c.type) + '</select></div>' +
      '<div class="field s4"><label>Estimate (JMD)</label><input type="number" step="0.01" min="0" name="estimate" value="' + esc(c.estimate || '') + '"></div>' +
      '<div class="field s6"><label>Linked requisition</label><select name="requisitionId">' + reqOptions(c.requisitionId) + '</select></div>' +
      '<div class="field s3"><label>Department</label><input name="department" value="' + esc(c.department) + '"></div>' +
      '<div class="field s3" style="align-self:end;padding-bottom:9px"><label class="check"><input type="checkbox" name="viaGojep"' + (c.viaGojep !== false ? ' checked' : '') + '> Solicited via GOJEP</label></div>' +
      '</div></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Quotations</h3><div class="sub">Unit prices per supplier. Lowest compliant price is highlighted; paste columns straight from Excel.</div></div>' +
      '<div class="row"><div class="seg" id="cmpView"><button data-v="entry">Enter prices</button><button data-v="sheet">Comparison sheet</button></div><div class="seg" id="awardMode"><button data-m="item">Split by line</button><button data-m="lot">Whole lot</button></div></div></div>' +
      '<div class="cmp-toolbar"><div class="add-sup"><input class="input sm" id="supAdd" list="dl-suppliers" placeholder="Add supplier — type a name from the directory or a new one"><button class="btn sm primary" data-act="addsup">' + ui.icon('plus', 'sm') + 'Add supplier</button></div>' +
      '<span id="newSupNote" class="small text-success"></span><div class="spacer"></div><span id="lotPick"></span>' +
      '<label class="check small"><input type="checkbox" id="specToggle"' + (showSpecs ? ' checked' : '') + '> Specs</label>' +
      '<button class="btn sm" data-act="additem">' + ui.icon('plus', 'sm') + 'Item</button>' +
      '<button class="btn sm" data-act="pasteitems">' + ui.icon('copy', 'sm') + 'Paste rows</button>' +
      (c.requisitionId ? '<button class="btn sm" data-act="loadreq">' + ui.icon('clipboard', 'sm') + 'Load from requisition</button>' : '') +
      '</div>' +
      '<div class="matrix-wrap" id="mxWrap"><table class="matrix cmp-matrix" id="mx"></table></div>' +
      '<div id="sheetView" hidden><div class="xl-wrap" id="xlWrap"></div><div class="xl-legend"><span><i class="g"></i>Shaded = supplier chosen for that item (as on the workbook)</span><span><i class="l"></i>Lowest price</span><span>Extended cost and Total include GCT where T/NT is “T”. Click a supplier’s price to award the item to them.</span>' +
      '<span style="margin-left:auto;display:flex;gap:8px"><button class="btn sm" data-act="sheetprint">' + ui.icon('printer', 'sm') + 'Print report</button><button class="btn sm" data-act="sheetpdf">' + ui.icon('download', 'sm') + 'Download PDF</button></span></div></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Evaluation note</h3><div class="sub">Printed on the approval memo before the recommendation table</div></div><button class="btn sm" data-act="usenote">Use suggested wording</button></div><div class="card-b">' +
      '<textarea class="input" id="evalNote" rows="3">' + esc(c.evaluationNote || '') + '</textarea><div class="hint small muted mt-1">Leave blank to use the suggested wording shown in grey.</div></div></div>' +
      '</div>' +
      '<div class="stack" style="min-width:0"><div class="card"><div class="card-h"><h3>Recommended award</h3><span id="modeBadge"></span></div><div class="card-b" id="awardBox"></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Approval route</h3><div class="sub" id="routeSub"></div></div><span id="routeLvl"></span></div><div class="card-b" id="routeBox"></div></div>' +
      '<div class="card"><div class="card-h"><h3>Case file</h3></div><div class="card-b" id="linkBox"></div></div></div>' +
      '</div>';

    /* ---------- header ---------- */
    function drawHead() {
      const memo = c.memoId ? store.get('memos', c.memoId) : null;
      const pos = (c.poIds || []).map(id => store.get('purchaseOrders', id)).filter(Boolean);
      const acts = [];
      acts.push('<button class="btn" data-act="print">' + ui.icon('printer', 'sm') + 'Print sheet</button>');
      acts.push('<button class="btn" data-act="excel">' + ui.icon('sheet', 'sm') + 'Excel</button>');
      if (memo) acts.push('<a class="btn ' + (memo.status === 'Approved' ? '' : 'primary') + '" href="#/memos/' + memo.id + '">' + ui.icon('stamp', 'sm') + 'Open memo</a>');
      else acts.push('<button class="btn primary" data-act="memo">' + ui.icon('stamp', 'sm') + 'Prepare approval memo</button>');
      if (pos.length) acts.push('<a class="btn" href="#/orders?cmp=' + c.id + '">' + ui.icon('cart', 'sm') + 'View ' + pos.length + ' ' + util.plural(pos.length, 'PO') + '</a>');
      else acts.push('<button class="btn ' + (memo && memo.status === 'Approved' ? 'primary' : '') + '" data-act="pos">' + ui.icon('cart', 'sm') + 'Create purchase orders</button>');
      acts.push('<button class="btn icon" data-act="more" title="More">' + ui.icon('more') + '</button>');
      el.querySelector('#cmpHead').innerHTML = ui.pageHead({
        title: cmpTitle(c), back: { label: 'Price comparisons', href: '#/sourcing' }, badge: '<span id="cmpBadge">' + ui.badge(c.status) + '</span>',
        sub: (c.subject && c.ref ? esc(c.subject) + ' · ' : '') + esc(util.date(c.date)) + ' · <span id="savedInd" class="saved-ind"><span class="d"></span>All changes saved</span>',
        actions: acts.join('')
      });
      ui.setCrumbs(['Price Comparison', c.ref || c.subject || 'New']);
      const on = (a, fn) => { const b = el.querySelector('#cmpHead [data-act="' + a + '"]'); if (b) b.onclick = fn; };
      on('print', printSheet); on('excel', exportExcel); on('memo', prepareMemo); on('pos', createOrders);
      on('more', e => {
        const items = [{ label: 'Duplicate for a new round', icon: 'copy', onClick: duplicate }];
        if (c.requisitionId) items.push({ label: 'Open requisition', icon: 'clipboard', onClick: () => router.go('requisitions/' + c.requisitionId) });
        items.push({ label: 'Attach a quotation…', icon: 'clip', onClick: () => attachQuote(null) });
        items.push({ sep: true });
        if (c.status === 'Cancelled') items.push({ label: 'Reopen comparison', icon: 'refresh', onClick: () => { c.status = 'Open'; persist(); drawAll(); ui.toast('Comparison reopened'); } });
        else items.push({ label: 'Cancel comparison', icon: 'x', danger: true, onClick: cancelCmp });
        items.push({ label: 'Delete', icon: 'trash', danger: true, onClick: deleteCmp });
        ui.menu(e.currentTarget, items);
      });
      const banner = el.querySelector('#cmpBanner');
      if (pos.length) banner.innerHTML = '<div class="alert info mb-3">' + ui.icon('info') + '<div>Purchase orders were created from this comparison. Price changes made here will not update them.</div></div>';
      else if (memo && memo.status === 'Approved') banner.innerHTML = '<div class="alert success mb-3">' + ui.icon('check') + '<div>The approval memo was approved' + (memo.decision && memo.decision.date ? ' on ' + esc(util.date(memo.decision.date)) : '') + '. Changing prices now would need a revised memo.</div></div>';
      else if (c.status === 'Cancelled') banner.innerHTML = '<div class="alert warning mb-3">' + ui.icon('alert') + '<div>This comparison is cancelled.</div></div>';
      else banner.innerHTML = '';
    }

    /* ---------- details form ---------- */
    const det = el.querySelector('#cmpDetails');
    det.addEventListener('input', e => {
      const t = e.target; if (!t.name) return;
      if (t.type === 'checkbox') c[t.name] = t.checked;
      else if (t.name === 'invited' || t.name === 'estimate') c[t.name] = t.value === '' ? 0 : util.num(t.value);
      else if (t.tagName !== 'SELECT') c[t.name] = t.value;
      if (t.name === 'ref' || t.name === 'subject') { const h = el.querySelector('#cmpHead h1'); if (h) h.textContent = cmpTitle(c); ui.setCrumbs(['Price Comparison', c.ref || c.subject || 'New']); }
      if (t.name === 'invited') refresh();
      touch();
    });
    det.addEventListener('change', e => {
      const t = e.target; if (!t.name) return;
      if (t.type === 'checkbox') c[t.name] = t.checked; else c[t.name] = t.value;
      if (t.name === 'type') { const cat = det.querySelector('[name=category]'); cat.innerHTML = ui.categoryOptions(cat.value, t.value); }
      if (t.name === 'requisitionId') linkRequisition(t.value);
      if (t.name === 'viaGojep' || t.name === 'method') refresh();
      touch();
    });
    det.querySelector('[data-act=suggest]').onclick = () => {
      if (!c.subject) { ui.toast('Enter the subject first, e.g. "Medical Sundries".', 'warning'); det.querySelector('[name=subject]').focus(); return; }
      c.ref = domain.suggestRef(c.subject, c.method, c.date); det.querySelector('[name=ref]').value = c.ref;
      const h = el.querySelector('#cmpHead h1'); if (h) h.textContent = cmpTitle(c); touch();
    };
    function linkRequisition(rid) {
      const old = c.requisitionId && c.requisitionId !== rid ? store.get('requisitions', c.requisitionId) : null;
      if (old && old.comparisonId === c.id && old.status === 'Sourcing') store.upsert('requisitions', { id: old.id, comparisonId: '', status: 'Approved' });
      c.requisitionId = rid;
      const r = rid ? store.get('requisitions', rid) : null;
      if (r) {
        const patch = { id: r.id, comparisonId: c.id };
        if (['Submitted', 'Approved'].indexOf(r.status) >= 0) patch.status = 'Sourcing';
        store.upsert('requisitions', patch);
        if (!c.department) { c.department = r.department || ''; det.querySelector('[name=department]').value = c.department; }
        if (!c.estimate) { c.estimate = util.num(r.estimate); det.querySelector('[name=estimate]').value = c.estimate || ''; }
        if (!c.subject) { c.subject = r.title || ''; det.querySelector('[name=subject]').value = c.subject; }
        if (!c.items.some(i => !isBlankItem(i)) && (r.items || []).length) { loadFromRequisition(true); }
      }
      // Show / hide the toolbar button.
      const tb = el.querySelector('.cmp-toolbar');
      let btn = tb.querySelector('[data-act=loadreq]');
      if (rid && !btn) { tb.insertAdjacentHTML('beforeend', '<button class="btn sm" data-act="loadreq">' + ui.icon('clipboard', 'sm') + 'Load from requisition</button>'); btn = tb.querySelector('[data-act=loadreq]'); btn.onclick = () => loadFromRequisition(false); }
      if (!rid && btn) btn.remove();
      drawLinks();
    }

    /* ---------- matrix ---------- */
    const mx = el.querySelector('#mx');
    const supById = sid => c.suppliers.find(s => s.supplierId === sid);
    const priceOf = (iid, sid) => (c.prices[iid] && c.prices[iid][sid] !== undefined ? c.prices[iid][sid] : '');
    const quoteDocs = sid => files.forLink('comparisonId', c.id).filter(d => d.supplierId === sid);
    const fmtPrice = v => (v === '' || v === undefined || v === null ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

    function drawMatrix() {
      const nS = c.suppliers.length;
      const lot = c.awardMode === 'lot';
      let h = '<thead><tr><th class="sticky-l">Item</th><th>Unit</th><th class="num">Qty</th>';
      c.suppliers.forEach((s, j) => {
        const n = quoteDocs(s.supplierId).length;
        h += '<th class="cmp-sh' + (s.compliant === false ? ' nc' : '') + '" data-sj="' + j + '"><div class="top"><span class="nm"><a href="#/suppliers/' + esc(s.supplierId) + '" title="Open supplier profile">' + esc(domain.supplierName(s.supplierId, s.name)) + '</a></span>' +
          '<button class="btn xs ghost icon" data-supmenu="' + j + '" title="Supplier options">' + ui.icon('more', 'sm') + '</button></div>' +
          '<div class="ctl"><label title="Meets the technical specifications"><input type="checkbox" data-comp="' + j + '"' + (s.compliant !== false ? ' checked' : '') + '>Compliant</label>' +
          '<label title="Prices exclude GCT — add ' + Math.round(store.settings().gctRate * 100) + '%"><input type="checkbox" data-gct="' + j + '"' + (s.gct ? ' checked' : '') + '>+GCT</label></div>' +
          '<div class="mt">' + (n ? ui.icon('clip', 'sm') + ' ' + n + ' ' + util.plural(n, 'quote') : '<a href="javascript:void 0" data-attach="' + j + '">Attach quote</a>') + (s.deliveryDays ? ' · ' + esc(s.deliveryDays) + ' days' : '') + '</div></th>';
      });
      h += '<th class="awd">' + (lot ? 'Lot award' : 'Award to') + '</th></tr></thead><tbody>';
      c.items.forEach((it, i) => {
        h += '<tr data-r="' + i + '"><td class="sticky-l"><div class="item-cell"><span class="ln">' + (i + 1) + '</span><input class="input sm" data-r="' + i + '" data-col="0" data-f="description" value="' + esc(it.description) + '" placeholder="Item description">' +
          '<button class="btn xs ghost icon" data-delitem="' + i + '" title="Remove item" tabindex="-1">' + ui.icon('x', 'sm') + '</button></div>' +
          (showSpecs ? '<div class="spec"><input class="input sm" data-r="' + i + '" data-f="spec" value="' + esc(it.spec || '') + '" placeholder="Specification" tabindex="-1"></div>' : '') + '</td>' +
          '<td class="u"><input class="input sm" list="dl-units" data-r="' + i + '" data-col="1" data-f="unit" value="' + esc(it.unit || '') + '"></td>' +
          '<td class="q"><input class="input sm" inputmode="decimal" data-r="' + i + '" data-col="2" data-f="qty" value="' + esc(it.qty === 0 ? '0' : (it.qty || '')) + '"></td>';
        c.suppliers.forEach((s, j) => {
          h += '<td class="cell" data-r="' + i + '" data-s="' + j + '"><input inputmode="decimal" data-r="' + i + '" data-col="' + (3 + j) + '" data-p="' + j + '" value="' + esc(fmtPrice(priceOf(it.id, s.supplierId))) + '" placeholder="—">' +
            '<div class="ext"><span data-ext></span>' + (lot ? '' : '<button class="aw" data-aw="' + j + '" title="Award this line to ' + esc(s.name) + '" tabindex="-1">' + ui.icon('award', 'sm') + '</button>') + '</div></td>';
        });
        h += '<td class="awd" data-awd="' + i + '"></td></tr>';
      });
      h += '</tbody><tfoot>';
      const foot = (cls, label, key) => '<tr class="' + cls + '"><td class="sticky-l lbl" colspan="3">' + label + '</td>' + c.suppliers.map((s, j) => '<td class="num" data-foot="' + key + '" data-s="' + j + '"></td>').join('') + '<td class="num" data-foot="' + key + '" data-s="award"></td></tr>';
      h += foot('', 'Subtotal', 'sub') + foot('', 'GCT', 'gct') + foot('tot', 'Total bid', 'tot') + foot('', 'Lines quoted', 'quoted') + foot('', 'Lowest compliant on', 'low') + foot('', 'Awarded', 'awarded');
      h += '</tfoot>';
      if (!nS) h += '<tbody><tr><td colspan="4"><div class="cmp-empty-hint">' + ui.icon('building', 'lg') + '<div class="strong mt-1" style="color:var(--text)">Add the suppliers who quoted</div><div class="small">Use the box above — pick from the directory or type a new name and a supplier profile is created for you.</div></div></td></tr></tbody>';
      mx.innerHTML = h;
      refresh();
    }

    function refresh() {
      const r = domain.computeComparison(c);
      const lot = c.awardMode === 'lot';
      // Cells
      r.lines.forEach((l, i) => {
        c.suppliers.forEach((s, j) => {
          const td = mx.querySelector('td.cell[data-r="' + i + '"][data-s="' + j + '"]'); if (!td) return;
          const q = l.quotes[s.supplierId];
          td.classList.toggle('lowest', l.lowestSid === s.supplierId);
          td.classList.toggle('awarded', !!q && l.awardSid === s.supplierId);
          td.classList.toggle('noncompliant', s.compliant === false);
          td.querySelector('[data-ext]').textContent = q ? util.money(q.ext) : '';
          const aw = td.querySelector('.aw'); if (aw) aw.hidden = !q;
        });
        const at = mx.querySelector('td[data-awd="' + i + '"]'); if (!at) return;
        const awName = l.awardSid ? (r.bySupplier[l.awardSid] || {}).name : '';
        if (lot) at.innerHTML = l.awardSid ? '<div class="strong truncate" style="max-width:200px">' + esc(awName) + '</div><div class="amt">' + util.money(l.quotes[l.awardSid].ext) + '</div>' : '<span class="muted small">' + (Object.keys(l.quotes).length ? 'Not quoted by lot winner' : 'No quotes') + '</span>';
        else if (document.activeElement && document.activeElement.closest && document.activeElement.closest('td[data-awd="' + i + '"]')) { /* keep open select */ }
        else {
          const ov = c.awards[l.item.id];
          const lowName = l.lowestSid ? r.bySupplier[l.lowestSid].name : '';
          const val = ov === undefined || ov === null ? '__auto' : ov === '' ? '__none' : ov;
          at.innerHTML = '<select class="input sm" data-award="' + i + '">' +
            '<option value="__auto"' + (val === '__auto' ? ' selected' : '') + '>' + esc(lowName ? 'Lowest: ' + lowName : 'Auto (lowest compliant)') + '</option>' +
            c.suppliers.filter(s => l.quotes[s.supplierId]).map(s => '<option value="' + esc(s.supplierId) + '"' + (val === s.supplierId ? ' selected' : '') + '>' + esc(r.bySupplier[s.supplierId].name) + (s.compliant === false ? ' (non-compliant)' : '') + '</option>').join('') +
            '<option value="__none"' + (val === '__none' ? ' selected' : '') + '>Do not award</option></select>' +
            '<div class="amt">' + (l.awardSid ? (l.overridden ? '<span class="text-warning" title="Not the lowest compliant price">Override · </span>' : '') + util.money(l.quotes[l.awardSid].ext) : (Object.keys(l.quotes).length ? '<span class="text-warning">Not awarded</span>' : '')) + '</div>';
        }
      });
      // Footer
      const lowestTotal = Math.min.apply(null, Object.values(r.bySupplier).filter(b => b.compliant && b.complete).map(b => b.total).concat([Infinity]));
      c.suppliers.forEach((s, j) => {
        const b = r.bySupplier[s.supplierId];
        const aw = r.awards.find(a => a.supplierId === s.supplierId);
        const set = (k, v, cls) => { const td = mx.querySelector('td[data-foot="' + k + '"][data-s="' + j + '"]'); if (td) { td.innerHTML = v; td.classList.toggle('best', !!cls); } };
        set('sub', b.quoted ? util.money(b.subtotal) : '—');
        set('gct', b.gctApplies ? util.money(b.gct) : (b.quoted ? '<span class="muted">incl. / n/a</span>' : '—'));
        set('tot', b.quoted ? util.money(b.total) : '—', b.complete && b.compliant && b.total === lowestTotal);
        set('quoted', b.quoted + ' / ' + r.lines.length);
        set('low', b.lowestCount ? b.lowestCount + ' ' + util.plural(b.lowestCount, 'line') : '—');
        set('awarded', aw ? util.money(aw.total) : '—', !!aw);
      });
      const fa = (k, v) => { const td = mx.querySelector('td[data-foot="' + k + '"][data-s="award"]'); if (td) td.innerHTML = v; };
      fa('sub', ''); fa('gct', ''); fa('quoted', ''); fa('low', '');
      fa('tot', r.awardTotal ? '<span class="strong">' + util.money(r.awardTotal) + '</span>' : '');
      fa('awarded', r.awards.length ? r.awards.length + ' ' + util.plural(r.awards.length, 'supplier') : '');
      drawSidebar(r);
      if (view === 'sheet') drawSheet(r);
    }
    /* ---------- comparison sheet (workbook look) ---------- */
    const VIEW_KEY = 'procCmpView';
    let view = (() => { try { return localStorage.getItem(VIEW_KEY) || (c.sheet ? 'sheet' : 'entry'); } catch (e) { return c.sheet ? 'sheet' : 'entry'; } })();
    function drawSheet(r) {
      r = r || domain.computeComparison(c);
      const wrap = el.querySelector('#xlWrap'); if (!wrap) return;
      wrap.innerHTML = r.lines.length && c.suppliers.length ? sheetTable(c, r, { click: true }) : '<div class="cmp-empty-hint">Add suppliers and prices under “Enter prices” — the comparison sheet fills in from them.</div>';
    }
    function setView(v) {
      view = v; try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* ignore */ }
      el.querySelector('#mxWrap').hidden = v === 'sheet';
      el.querySelector('#sheetView').hidden = v !== 'sheet';
      el.querySelector('.cmp-toolbar').style.display = v === 'sheet' ? 'none' : '';
      // The sheet is wide: give it the full width and move the award summary below it.
      el.querySelector('.grid.side').classList.toggle('sheet-wide', v === 'sheet');
      el.querySelectorAll('#cmpView button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
      if (v === 'sheet') drawSheet();
    }

    /* ---------- sidebar ---------- */
    function drawSidebar(r) {
      r = r || domain.computeComparison(c);
      const L = store.settings().limits;
      const box = el.querySelector('#awardBox');
      el.querySelector('#modeBadge').innerHTML = '<span class="chip">' + (c.awardMode === 'lot' ? 'Whole lot' : 'Split by line') + '</span>';
      const invited = util.num(c.invited) || c.suppliers.length;
      if (!r.awards.length) {
        box.innerHTML = '<div class="muted small">' + (c.suppliers.length ? 'Enter unit prices to see the recommended award.' : 'Add suppliers and their unit prices to see the recommended award.') + '</div>' +
          '<div class="metric mt-2"><span>Bids received</span><span>' + r.bidsReceived + ' of ' + invited + ' invited</span></div>';
      } else {
        box.innerHTML = '<div class="money-big">' + util.money(r.awardTotal) + '</div><div class="words mb-2">' + esc(domain.amountWords(r.awardTotal)) + '</div>' +
          '<div class="award-list">' + r.awards.map(a => '<div class="aw-row"><div style="min-width:0"><div class="nm"><a href="#/suppliers/' + esc(a.supplierId) + '">' + esc(a.name) + '</a></div><div class="sub">' + a.items.length + ' ' + util.plural(a.items.length, 'line') + (a.gct ? ' · GCT ' + util.money(a.gct) : '') + '</div>' +
            (a.total > L.delegated ? '<span class="badge warning plain mt-1">Head of Entity memo</span>' : '') + '</div><div class="num strong">' + util.money(a.total) + '</div></div>').join('') + '</div>' +
          '<div class="divider"></div>' +
          '<div class="metric"><span>Bids received</span><span>' + r.bidsReceived + ' of ' + invited + ' invited</span></div>' +
          '<div class="metric"><span>Compliant bidders</span><span>' + Object.values(r.bySupplier).filter(b => b.compliant && b.quoted).length + '</span></div>' +
          (r.savingVsHighest > 0 ? '<div class="metric"><span>Saved vs highest compliant prices</span><span class="text-success strong">' + util.money(r.savingVsHighest) + '</span></div>' : '') +
          (c.estimate ? '<div class="metric"><span>Against estimate ' + util.money(c.estimate) + '</span><span class="' + (r.awardTotal > c.estimate ? 'text-danger' : 'text-success') + ' strong">' + (r.awardTotal > c.estimate ? '+' : '') + util.money(r.awardTotal - c.estimate) + '</span></div>' : '');
      }
      const warns = [];
      const pend = pendingLines(r), unq = unquotedLines(r);
      if (pend.length) warns.push('<div class="alert warning mt-2">' + ui.icon('alert') + '<div>' + pend.length + ' quoted ' + util.plural(pend.length, 'line is', 'lines are') + ' not awarded.</div></div>');
      if (unq.length && r.awards.length) warns.push('<div class="alert mt-2">' + ui.icon('info') + '<div>No quotes for ' + esc(domain.joinNames(unq.slice(0, 4).map(l => l.item.description))) + (unq.length > 4 ? ' and ' + (unq.length - 4) + ' more' : '') + '.</div></div>');
      const nc = c.suppliers.filter(s => s.compliant === false);
      if (nc.length) warns.push('<div class="alert mt-2">' + ui.icon('info') + '<div>' + esc(domain.joinNames(nc.map(s => domain.supplierName(s.supplierId, s.name)))) + (nc.length === 1 ? ' is' : ' are') + ' marked non-compliant and excluded from automatic awards.</div></div>');
      if (c.awardMode === 'lot' && !r.lotSid && c.suppliers.length) warns.push('<div class="alert warning mt-2">' + ui.icon('alert') + '<div>No compliant supplier quoted every line. Choose the lot supplier or switch to split by line.</div></div>');
      box.insertAdjacentHTML('beforeend', warns.join(''));

      // Route
      const route = domain.approvalRoute(r.awardTotal, r.awards.map(a => ({ amount: a.total })));
      el.querySelector('#routeLvl').innerHTML = r.awardTotal ? '<span class="badge primary plain">' + esc(route.level) + '</span>' : '';
      el.querySelector('#routeSub').textContent = r.awardTotal ? (route.needsCommittee ? '1 committee memo' : 'Memo optional') + (route.hoeCount ? ' + ' + route.hoeCount + ' Head of Entity ' + util.plural(route.hoeCount, 'memo') : '') : 'Based on the recommended award';
      el.querySelector('#routeBox').innerHTML = r.awardTotal ? ui.routeHtml(route) +
        (route.needsCabinet ? '<div class="alert danger mt-2">' + ui.icon('alert') + '<div><div class="t">Cabinet approval required</div>An award exceeds ' + util.money(L.cabinet, { noCents: true }) + ' (Handbook §2.4).</div></div>' : '') +
        (route.needsNCC ? '<div class="alert warning mt-2">' + ui.icon('alert') + '<div><div class="t">NCC / PPC endorsement required</div>An award exceeds ' + util.money(L.ncc, { noCents: true }) + '. Obtain endorsement before Head of Entity approval.</div></div>' : '')
        : '<div class="muted small">The route appears once an award is recommended.</div>';

      // Lot picker
      const lp = el.querySelector('#lotPick');
      if (c.awardMode === 'lot') {
        lp.innerHTML = '<select class="input sm" id="lotSel" style="max-width:260px"><option value="">Lot to: cheapest complete bid' + (r.lotSid && !c.lotSupplierId ? ' (' + esc(r.bySupplier[r.lotSid].name) + ')' : '') + '</option>' +
          c.suppliers.map(s => '<option value="' + esc(s.supplierId) + '"' + (c.lotSupplierId === s.supplierId ? ' selected' : '') + '>' + esc(r.bySupplier[s.supplierId].name) + (r.bySupplier[s.supplierId].complete ? '' : ' (incomplete)') + '</option>').join('') + '</select>';
        lp.querySelector('#lotSel').onchange = e => { c.lotSupplierId = e.target.value; touch(); refresh(); };
      } else lp.innerHTML = '';
      el.querySelector('#evalNote').placeholder = domain.autoEvaluationNote(c.suppliers.filter(s => r.bySupplier[s.supplierId].quoted).map(s => ({ supplier: r.bySupplier[s.supplierId].name, compliant: s.compliant !== false }))) || 'The evaluation committee noted that …';
      drawLinks();
    }

    function drawLinks() {
      const out = [];
      const rq = c.requisitionId ? store.get('requisitions', c.requisitionId) : null;
      const memo = c.memoId ? store.get('memos', c.memoId) : null;
      const pos = (c.poIds || []).map(id => store.get('purchaseOrders', id)).filter(Boolean);
      const docs = files.forLink('comparisonId', c.id);
      const row = (icon, html, badge) => '<div class="row" style="flex-wrap:nowrap;padding:7px 0;border-bottom:1px solid var(--border)">' + ui.icon(icon, 'sm') + '<div style="flex:1;min-width:0" class="truncate">' + html + '</div>' + (badge || '') + '</div>';
      out.push(rq ? row('clipboard', '<a href="#/requisitions/' + rq.id + '">' + esc(rq.number || rq.id) + '</a> <span class="muted small">' + esc(rq.department || '') + '</span>', ui.badge(rq.status)) : row('clipboard', '<span class="muted">No requisition linked</span>'));
      out.push(memo ? row('stamp', '<a href="#/memos/' + memo.id + '">Approval memo' + (memo.number ? ' #' + memo.number : '') + '</a>', ui.badge(memo.status)) : row('stamp', '<span class="muted">Memo not prepared</span>'));
      if (pos.length) pos.forEach(p => out.push(row('cart', '<a href="#/orders/' + p.id + '">PO ' + esc(p.poNumber || '(draft)') + '</a> <span class="muted small">' + esc(p.supplierName || '') + '</span>', ui.badge(p.status))));
      else out.push(row('cart', '<span class="muted">No purchase orders yet</span>'));
      out.push('<div class="row mt-2" style="justify-content:space-between"><span class="small muted">' + docs.length + ' ' + util.plural(docs.length, 'document') + ' attached</span><span class="row" style="gap:6px">' + (docs.length ? '<button class="btn xs" data-act="viewdocs">View</button>' : '') + '<button class="btn xs" data-act="attach">' + ui.icon('clip', 'sm') + 'Attach</button></span></div>');
      const lb = el.querySelector('#linkBox'); lb.innerHTML = out.join('');
      const vb = lb.querySelector('[data-act=viewdocs]'); if (vb) vb.onclick = () => viewDocs(null);
      lb.querySelector('[data-act=attach]').onclick = () => attachQuote(null);
    }

    /* ---------- matrix events ---------- */
    mx.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.p !== undefined) {
        const i = +t.dataset.r, j = +t.dataset.p;
        const iid = c.items[i].id, sid = c.suppliers[j].supplierId;
        const v = t.value.trim();
        c.prices[iid] = c.prices[iid] || {};
        if (v === '' || v === '-' || !(util.num(v) > 0)) delete c.prices[iid][sid]; else c.prices[iid][sid] = util.num(v);
        refresh(); touch(); return;
      }
      if (t.dataset.f) {
        const i = +t.dataset.r;
        c.items[i][t.dataset.f] = t.dataset.f === 'qty' ? (t.value.trim() === '' ? '' : util.num(t.value)) : t.value;
        if (t.dataset.f === 'qty') refresh();
        touch();
      }
    });
    mx.addEventListener('focusout', e => {
      const t = e.target;
      if (t.dataset && t.dataset.p !== undefined) { const v = priceOf(c.items[+t.dataset.r].id, c.suppliers[+t.dataset.p].supplierId); t.value = fmtPrice(v); }
    });
    mx.addEventListener('focusin', e => {
      const t = e.target;
      if (t.dataset && t.dataset.p !== undefined) { const v = priceOf(c.items[+t.dataset.r].id, c.suppliers[+t.dataset.p].supplierId); t.value = v === '' ? '' : String(v); setTimeout(() => t.select(), 0); }
    });
    mx.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.comp !== undefined) { c.suppliers[+t.dataset.comp].compliant = t.checked; drawMatrix(); touch(); }
      else if (t.dataset.gct !== undefined) { c.suppliers[+t.dataset.gct].gct = t.checked; refresh(); touch(); }
      else if (t.dataset.award !== undefined) {
        const iid = c.items[+t.dataset.award].id;
        if (t.value === '__auto') delete c.awards[iid]; else if (t.value === '__none') c.awards[iid] = ''; else c.awards[iid] = t.value;
        t.blur(); refresh(); touch();
      }
    });
    mx.addEventListener('click', e => {
      const aw = e.target.closest('[data-aw]');
      if (aw) {
        const i = +aw.closest('td').dataset.r, j = +aw.dataset.aw;
        const iid = c.items[i].id, sid = c.suppliers[j].supplierId;
        const l = domain.computeComparison(c).lines[i];
        if (l.awardSid === sid && c.awards[iid] === sid) delete c.awards[iid]; // toggle back to automatic
        else c.awards[iid] = sid;
        refresh(); touch(); return;
      }
      const del = e.target.closest('[data-delitem]');
      if (del) { removeItem(+del.dataset.delitem); return; }
      const sm = e.target.closest('[data-supmenu]');
      if (sm) { supplierMenu(sm, +sm.dataset.supmenu); return; }
      const at = e.target.closest('[data-attach]');
      if (at) { e.preventDefault(); attachQuote(c.suppliers[+at.dataset.attach].supplierId); }
    });
    mx.addEventListener('keydown', e => {
      const t = e.target; if (t.dataset.col === undefined) return;
      const r = +t.dataset.r, col = +t.dataset.col;
      const go = (rr, cc) => { const n = mx.querySelector('input[data-r="' + rr + '"][data-col="' + cc + '"]'); if (n) { n.focus(); e.preventDefault(); return true; } return false; };
      const atStart = () => { try { return t.selectionStart === 0 && t.selectionEnd === 0 || (t.selectionStart === 0 && t.selectionEnd === t.value.length); } catch (x) { return true; } };
      const atEnd = () => { try { return t.selectionEnd === t.value.length; } catch (x) { return true; } };
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        if (!go(r + 1, col) && e.key === 'Enter') { c.items.push(newItem()); drawMatrix(); touch(); go(r + 1, col); }
        else e.preventDefault();
      } else if (e.key === 'ArrowUp') go(r - 1, col);
      else if (e.key === 'ArrowRight' && atEnd()) go(r, col + 1);
      else if (e.key === 'ArrowLeft' && atStart()) go(r, col - 1);
    });
    mx.addEventListener('paste', e => {
      const t = e.target; if (t.dataset.col === undefined) return;
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
      e.preventDefault();
      pasteGrid(text, +t.dataset.r, +t.dataset.col);
    });

    /** Paste a block from Excel. Columns: Description, Unit, Qty, then one price column per supplier. */
    function pasteGrid(text, row, col) {
      const lines = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(l => l.split('\t'));
      let added = 0, prices = 0;
      lines.forEach((cells, k) => {
        const i = row + k;
        if (!c.items[i]) {
          if (col >= 3) return; // price columns never add rows
          c.items.push(newItem()); added++;
        }
        const it = c.items[i];
        cells.forEach((raw, m) => {
          const cc = col + m, v = String(raw).trim();
          if (cc === 0) it.description = v;
          else if (cc === 1) it.unit = v;
          else if (cc === 2) it.qty = v === '' ? '' : util.num(v);
          else {
            const s = c.suppliers[cc - 3]; if (!s) return;
            c.prices[it.id] = c.prices[it.id] || {};
            if (v === '' || v === '-' || !(util.num(v) > 0)) delete c.prices[it.id][s.supplierId]; else { c.prices[it.id][s.supplierId] = util.num(v); prices++; }
          }
        });
      });
      drawMatrix(); touch();
      ui.toast('Pasted ' + lines.length + ' ' + util.plural(lines.length, 'row') + (prices ? ' · ' + prices + ' ' + util.plural(prices, 'price') : '') + (added ? ' · ' + added + ' new ' + util.plural(added, 'item') : ''));
    }

    /* ---------- items ---------- */
    async function removeItem(i) {
      const it = c.items[i];
      const hasPrices = c.prices[it.id] && Object.keys(c.prices[it.id]).length;
      if (hasPrices && !(await ui.confirm('Remove <b>' + esc(it.description || 'this line') + '</b> and its prices?', { danger: true, ok: 'Remove' }))) return;
      c.items.splice(i, 1); delete c.prices[it.id]; delete c.awards[it.id];
      if (!c.items.length) c.items.push(newItem());
      drawMatrix(); touch();
    }
    function loadFromRequisition(silent) {
      const r = c.requisitionId ? store.get('requisitions', c.requisitionId) : null;
      if (!r || !(r.items || []).length) { if (!silent) ui.toast('The linked requisition has no items.', 'warning'); return; }
      const existing = new Set(c.items.map(i => String(i.description || '').trim().toLowerCase()));
      c.items = c.items.filter(i => !isBlankItem(i));
      let n = 0;
      r.items.forEach(ri => { if (existing.has(String(ri.description || '').trim().toLowerCase())) return; c.items.push(newItem({ description: ri.description, unit: ri.unit || '', qty: util.num(ri.qty), spec: ri.spec || '' })); n++; });
      if (!c.items.length) c.items.push(newItem());
      if (r.items.some(i => i.spec)) { showSpecs = true; el.querySelector('#specToggle').checked = true; }
      drawMatrix(); touch();
      if (!silent) ui.toast(n ? n + ' ' + util.plural(n, 'item') + ' loaded from ' + (r.number || 'the requisition') : 'All requisition items are already listed', n ? 'success' : 'info');
    }
    el.querySelector('[data-act=additem]').onclick = () => { c.items.push(newItem()); drawMatrix(); touch(); const n = mx.querySelector('input[data-r="' + (c.items.length - 1) + '"][data-col="0"]'); if (n) n.focus(); };
    el.querySelector('[data-act=pasteitems]').onclick = async () => {
      const v = await ui.form('Paste rows from Excel', [{ name: 'text', label: 'Columns: Description, Unit, Qty, then one unit-price column per supplier in the order shown (' + (c.suppliers.map(s => s.name).join(', ') || 'add suppliers first to paste prices') + ')', type: 'textarea', rows: 10, required: true }], { ok: 'Add rows', size: 'lg' });
      if (!v) return;
      let start = c.items.length; while (start > 0 && isBlankItem(c.items[start - 1]) && !Object.keys(c.prices[c.items[start - 1].id] || {}).length) start--;
      c.items.length = start;
      pasteGrid(v.text, start, 0);
    };
    const lr = el.querySelector('[data-act=loadreq]'); if (lr) lr.onclick = () => loadFromRequisition(false);
    el.querySelector('#specToggle').onchange = e => { showSpecs = e.target.checked; drawMatrix(); };

    /* ---------- award mode ---------- */
    const seg = el.querySelector('#awardMode');
    const drawSeg = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', (c.awardMode || 'item') === b.dataset.m));
    seg.querySelectorAll('button').forEach(b => b.onclick = () => { c.awardMode = b.dataset.m; drawSeg(); drawMatrix(); touch(); });
    drawSeg();

    /* ---------- suppliers ---------- */
    const supInput = el.querySelector('#supAdd');
    const newSups = [];
    function addSupplier() {
      const name = supInput.value.trim();
      if (!name) { supInput.focus(); return; }
      const existed = !!domain.findSupplier(name);
      const s = domain.ensureSupplier(name);
      if (!s) return;
      if (c.suppliers.some(x => x.supplierId === s.id)) { ui.toast(s.name + ' is already in this comparison', 'info'); supInput.select(); return; }
      c.suppliers.push({ supplierId: s.id, name: s.name, compliant: true, gct: false, deliveryDays: '', validity: '', notes: '' });
      if (util.num(c.invited) < c.suppliers.length) { c.invited = c.suppliers.length; det.querySelector('[name=invited]').value = c.invited; }
      supInput.value = '';
      if (!existed) { ui.supplierDatalist(); newSups.push(s.name); }
      const nn = el.querySelector('#newSupNote');
      if (nn) nn.innerHTML = newSups.length ? ui.icon('check', 'sm') + ' New supplier ' + util.plural(newSups.length, 'profile') + ' created: ' + esc(domain.joinNames(newSups.slice(-3))) + (newSups.length > 3 ? ' (+' + (newSups.length - 3) + ')' : '') : '';
      drawMatrix(); touch(); supInput.focus();
    }
    el.querySelector('[data-act=addsup]').onclick = addSupplier;
    supInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSupplier(); } });

    function supplierMenu(anchor, j) {
      const s = c.suppliers[j];
      const n = quoteDocs(s.supplierId).length;
      ui.menu(anchor, [
        { header: domain.supplierName(s.supplierId, s.name) },
        { label: 'Quote details & terms…', icon: 'edit', onClick: () => editSupplier(j) },
        { label: 'Attach quotation…', icon: 'clip', onClick: () => attachQuote(s.supplierId) },
        n ? { label: 'View quotations (' + n + ')', icon: 'eye', onClick: () => viewDocs(s.supplierId) } : null,
        { label: 'Open supplier profile', icon: 'building', onClick: () => router.go('suppliers/' + s.supplierId) },
        { sep: true },
        j > 0 ? { label: 'Move left', icon: 'chevron-left', onClick: () => { c.suppliers.splice(j - 1, 0, c.suppliers.splice(j, 1)[0]); drawMatrix(); touch(); } } : null,
        j < c.suppliers.length - 1 ? { label: 'Move right', icon: 'chevron-right', onClick: () => { c.suppliers.splice(j + 1, 0, c.suppliers.splice(j, 1)[0]); drawMatrix(); touch(); } } : null,
        { label: 'Clear prices', icon: 'refresh', onClick: () => { Object.keys(c.prices).forEach(k => { delete c.prices[k][s.supplierId]; }); drawMatrix(); touch(); } },
        { label: 'Remove from comparison', icon: 'trash', danger: true, onClick: () => removeSupplier(j) }
      ].filter(Boolean));
    }
    async function editSupplier(j) {
      const s = c.suppliers[j];
      const v = await ui.form('Quote from ' + domain.supplierName(s.supplierId, s.name), [
        { name: 'compliant', label: 'Technical compliance', type: 'checkbox', checkLabel: 'Meets the technical specifications', value: s.compliant !== false },
        { name: 'gct', label: 'GCT', type: 'checkbox', checkLabel: 'Prices exclude GCT — add ' + Math.round(store.settings().gctRate * 100) + '% to the bid', value: !!s.gct },
        { name: 'deliveryDays', label: 'Delivery (days)', type: 'number', value: s.deliveryDays, span: 's6' },
        { name: 'validity', label: 'Quote valid until', type: 'date', value: s.validity, span: 's6' },
        { name: 'notes', label: 'Evaluation notes', type: 'textarea', value: s.notes, hint: 'e.g. includes installation, warranty, spare parts availability' }
      ], { ok: 'Save' });
      if (!v) return;
      Object.assign(s, { compliant: !!v.compliant, gct: !!v.gct, deliveryDays: v.deliveryDays, validity: v.validity, notes: v.notes });
      drawMatrix(); touch();
    }
    async function removeSupplier(j) {
      const s = c.suppliers[j];
      const has = Object.values(c.prices).some(p => p[s.supplierId] !== undefined);
      if (has && !(await ui.confirm('Remove <b>' + esc(s.name) + '</b> and all of their prices from this comparison?', { danger: true, ok: 'Remove' }))) return;
      c.suppliers.splice(j, 1);
      Object.keys(c.prices).forEach(k => { delete c.prices[k][s.supplierId]; });
      Object.keys(c.awards).forEach(k => { if (c.awards[k] === s.supplierId) delete c.awards[k]; });
      if (c.lotSupplierId === s.supplierId) c.lotSupplierId = '';
      drawMatrix(); touch();
    }
    async function attachQuote(sid) {
      flush();
      const s = sid ? supById(sid) : null;
      const out = await ui.uploadDialog({ title: s ? 'Attach quotation — ' + domain.supplierName(sid, s.name) : 'Attach documents to this comparison', supplierId: sid || '', lockSupplier: !!sid, kind: 'Quotation', ref: c.ref, links: { comparisonId: c.id, requisitionId: c.requisitionId || '' } });
      if (out) { Proc.audit('Attach Quotation', (c.ref || c.subject || c.id) + ': ' + out.map(d => d.name).join(', '), c.id); drawMatrix(); }
    }
    function viewDocs(sid) {
      const docs = files.forLink('comparisonId', c.id).filter(d => !sid || d.supplierId === sid);
      const m = ui.modal({ title: sid ? 'Quotations — ' + domain.supplierName(sid) : 'Documents attached to this comparison', size: 'lg', body: '<div class="doc-list">' + (docs.length ? docs.map(d => ui.docRow(d, { showSupplier: !sid })).join('') : ui.empty('clip', 'No documents', '')) + '</div>' });
      ui.bindDocs(m.el, () => { m.close(); drawMatrix(); });
    }

    /* ---------- evaluation note ---------- */
    const note = el.querySelector('#evalNote');
    note.addEventListener('input', () => { c.evaluationNote = note.value; touch(); });
    el.querySelector('[data-act=usenote]').onclick = () => { note.value = note.placeholder; c.evaluationNote = note.value; touch(); note.focus(); };

    /* ---------- actions ---------- */
    async function prepareMemo() {
      flush();
      const r = domain.computeComparison(c);
      if (!c.subject) { ui.toast('Enter the subject first — it is printed on the memo.', 'warning'); det.querySelector('[name=subject]').focus(); return; }
      if (!r.awards.length) { ui.toast('Enter prices so at least one line is awarded.', 'warning'); return; }
      const pend = pendingLines(r);
      if (pend.length && !(await ui.confirm(pend.length + ' quoted ' + util.plural(pend.length, 'line is', 'lines are') + ' not awarded. Prepare the memo anyway?', { ok: 'Prepare memo' }))) return;
      if (!c.ref) { c.ref = domain.suggestRef(c.subject, c.method, c.date); det.querySelector('[name=ref]').value = c.ref; }
      const m = store.upsert('memos', Object.assign(domain.memoFromComparison(c), { from: domain.officer(), number: store.next('memo') }));
      c.memoId = m.id; c.status = 'Memo Prepared';
      persist();
      Proc.audit('Prepare Approval Memo', (c.ref || c.subject) + ' — ' + util.money(r.awardTotal) + ' to ' + r.awards.map(a => a.name).join(', '), c.id);
      ui.toast('Approval memo prepared');
      router.go('memos/' + m.id);
    }
    async function createOrders() {
      flush();
      const r = domain.computeComparison(c);
      if (!r.awards.length) { ui.toast('Nothing is awarded yet — enter prices first.', 'warning'); return; }
      const memo = c.memoId ? store.get('memos', c.memoId) : null;
      const route = domain.approvalRoute(r.awardTotal, r.awards.map(a => ({ amount: a.total })));
      const list = '<ul style="margin:10px 0 0 18px">' + r.awards.map(a => '<li><b>' + esc(a.name) + '</b> — ' + util.money(a.total) + ' (' + a.items.length + ' ' + util.plural(a.items.length, 'line') + ')</li>').join('') + '</ul>';
      let msg = 'Create <b>' + r.awards.length + '</b> draft purchase ' + util.plural(r.awards.length, 'order') + ':' + list;
      if (!memo || memo.status !== 'Approved') msg = '<div class="alert warning mb-2">' + ui.icon('alert') + '<div>' + (memo ? 'The approval memo is <b>' + esc(memo.status) + '</b>, not approved.' : 'No approval memo has been prepared.') + (route.needsCommittee || route.hoeCount ? ' This award needs approval (' + esc(route.level) + ') before POs are issued.' : '') + '</div></div>' + msg;
      if (!(await ui.confirm(msg, { title: 'Create purchase orders', ok: 'Create draft POs' }))) return;
      let ids = [];
      store.batch(() => {
        ids = domain.ordersFromComparison(c).map(o => store.upsert('purchaseOrders', Object.assign(o, { source: 'comparison', memoId: c.memoId || '' }), { silent: true }).id);
        c.poIds = ids; c.status = 'Ordered';
        persist();
        if (c.requisitionId) store.upsert('requisitions', { id: c.requisitionId, status: 'Ordered' }, { silent: true });
      });
      Proc.audit('Create Purchase Orders', ids.length + ' draft POs from ' + (c.ref || c.subject), c.id);
      ui.toast(ids.length + ' draft purchase ' + util.plural(ids.length, 'order') + ' created');
      router.go('orders?cmp=' + c.id);
    }
    async function duplicate() {
      flush();
      const v = await ui.form('Duplicate for a new round', [
        { name: 'subject', label: 'Subject', value: c.subject, required: true },
        { name: 'date', label: 'Quote date', type: 'date', value: util.today(), span: 's6' },
        { name: 'keepPrices', label: 'Prices', type: 'checkbox', checkLabel: 'Copy last round’s prices as a starting point', value: false, span: 's6' }
      ], { ok: 'Create copy' });
      if (!v) return;
      const idMap = {};
      const items = c.items.filter(i => !isBlankItem(i)).map(i => { const n = newItem({ description: i.description, unit: i.unit, qty: i.qty, spec: i.spec }); idMap[i.id] = n.id; return n; });
      const prices = {};
      if (v.keepPrices) Object.keys(c.prices).forEach(k => { if (idMap[k]) prices[idMap[k]] = Object.assign({}, c.prices[k]); });
      const copy = store.upsert('comparisons', {
        number: store.next('cmp'), ref: domain.suggestRef(v.subject, c.method, v.date), subject: v.subject, date: v.date, closingDate: '', requisitionId: '', department: c.department || '',
        method: c.method, viaGojep: c.viaGojep, invited: c.suppliers.length, type: c.type, category: c.category, estimate: 0, items: items.length ? items : [newItem()],
        suppliers: c.suppliers.map(s => ({ supplierId: s.supplierId, name: s.name, compliant: true, gct: !!s.gct, deliveryDays: s.deliveryDays || '', validity: '', notes: '' })),
        prices, awardMode: c.awardMode || 'item', awards: {}, lotSupplierId: '', evaluationNote: '', status: 'Open'
      });
      const rr = domain.computeComparison(copy);
      if (rr.awards.length && !pendingLines(rr).length) store.upsert('comparisons', { id: copy.id, status: 'Evaluated' });
      Proc.audit('Duplicate Price Comparison', (c.ref || c.subject) + ' → ' + copy.ref, copy.id);
      ui.toast('New comparison created — enter this round’s prices');
      router.go('sourcing/' + copy.id);
    }
    async function cancelCmp() {
      if (!(await ui.confirm('Cancel this price comparison? It stays on file and can be reopened.', { danger: true, ok: 'Cancel comparison' }))) return;
      c.status = 'Cancelled'; persist(); Proc.audit('Cancel Price Comparison', c.ref || c.subject, c.id); drawHead(); ui.toast('Comparison cancelled', 'info');
    }
    async function deleteCmp() {
      if ((c.poIds || []).some(id => store.get('purchaseOrders', id))) { ui.toast('Purchase orders were created from this comparison. Cancel it instead.', 'warning'); return; }
      const memo = c.memoId ? store.get('memos', c.memoId) : null;
      if (!(await ui.confirm('Delete <b>' + esc(cmpTitle(c)) + '</b>?' + (memo ? ' Its approval memo will remain on file.' : '') + ' This cannot be undone.', { danger: true, ok: 'Delete' }))) return;
      deleted = true;
      store.remove('comparisons', c.id);
      const rq = c.requisitionId ? store.get('requisitions', c.requisitionId) : null;
      if (rq && rq.comparisonId === c.id) store.upsert('requisitions', { id: rq.id, comparisonId: '', status: rq.status === 'Sourcing' ? 'Approved' : rq.status });
      Proc.audit('Delete Price Comparison', cmpTitle(c), c.id);
      ui.toast('Comparison deleted'); router.go('sourcing');
    }

    function printSheet() {
      flush();
      if (Proc.pdf && Proc.pdf.comparison) { Proc.pdf.comparison(store.get('comparisons', c.id) || c, { output: 'open' }).catch(e => ui.toast(e.message, 'error')); return; }
      printHtml(c);
    }
    function exportExcel() {
      flush();
      if (!window.XLSX) { ui.toast('Excel library not loaded — check the internet connection.', 'error'); return; }
      const wb = buildWorkbook(c);
      XLSX.writeFile(wb, (c.ref || c.subject || 'price-comparison').replace(/[\\/:*?"<>|]+/g, '-') + '.xlsx');
      Proc.audit('Export Price Comparison', c.ref || c.subject, c.id);
    }

    function drawAll() { drawHead(); drawMatrix(); }
    el.querySelectorAll('#cmpView button').forEach(b => b.onclick = () => setView(b.dataset.v));
    const sheetReport = output => { flush(); Proc.pdf.comparison(store.get('comparisons', c.id) || c, { layout: 'sheet', output }).then(() => Proc.audit('Print Comparison Sheet', c.ref || c.subject, c.id)).catch(e => ui.toast(e.message, 'error')); };
    el.querySelector('[data-act=sheetprint]').onclick = () => sheetReport('open');
    el.querySelector('[data-act=sheetpdf]').onclick = () => sheetReport('save');
    el.querySelector('#xlWrap').addEventListener('click', e => {
      const t = e.target.closest('[data-aw-item]'); if (!t) return;
      if (c.awardMode === 'lot') c.lotSupplierId = t.dataset.awSid;
      else c.awards[t.dataset.awItem] = t.dataset.awSid;
      drawMatrix(); touch();
    });
    drawAll();
    setView(view);
    setSaved();
    if (!c.subject && !c.suppliers.length) setTimeout(() => { const f = det.querySelector('[name=subject]'); if (f) f.focus(); }, 50);
  }

  function reqOptions(selected) {
    const reqs = store.list('requisitions').filter(r => r.id === selected || ['Submitted', 'Approved', 'Sourcing'].indexOf(r.status) >= 0)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return '<option value="">— None —</option>' + reqs.map(r => '<option value="' + esc(r.id) + '"' + (r.id === selected ? ' selected' : '') + '>' + esc((r.number || r.id) + ' · ' + (r.title || '') + (r.department ? ' (' + r.department + ')' : '')) + '</option>').join('');
  }

  /* =========================================================== EXPORTS */
  function buildWorkbook(c) {
    const r = domain.computeComparison(c);
    const org = store.settings().org;
    const sups = c.suppliers || [];
    const aoa = [];
    aoa.push([org.authority + ' — ' + org.hospital]);
    aoa.push(['Price Comparison' + (c.ref ? ' — ' + c.ref : '')]);
    aoa.push(['Subject', c.subject || '']);
    aoa.push(['Method', c.method || '', '', 'Date', util.date(c.date)]);
    aoa.push(['Suppliers invited', util.num(c.invited) || sups.length, '', 'Bids received', r.bidsReceived]);
    aoa.push([]);
    const head = ['No.', 'Description', 'Unit', 'Qty'];
    sups.forEach(s => { const nm = r.bySupplier[s.supplierId].name + (s.compliant === false ? ' (non-compliant)' : ''); head.push(nm + ' — unit', nm + ' — total'); });
    head.push('Awarded to', 'Award amount');
    aoa.push(head);
    r.lines.forEach((l, i) => {
      const row = [i + 1, l.item.description || '', l.item.unit || '', l.qty];
      sups.forEach(s => { const q = l.quotes[s.supplierId]; row.push(q ? q.unit : '', q ? q.ext : ''); });
      row.push(l.awardSid ? r.bySupplier[l.awardSid].name : '', l.awardSid ? l.quotes[l.awardSid].ext : '');
      aoa.push(row);
    });
    const footRow = (label, fn) => { const row = ['', label, '', '']; sups.forEach(s => { row.push('', fn(r.bySupplier[s.supplierId])); }); return row; };
    aoa.push(footRow('Subtotal', b => b.subtotal));
    aoa.push(footRow('GCT', b => b.gct));
    const tot = footRow('Total bid', b => b.total); tot.push('Award total', r.awardTotal); aoa.push(tot);
    aoa.push(footRow('Lines quoted', b => b.quoted + ' of ' + r.lines.length));
    aoa.push([]);
    aoa.push(['Recommended award']);
    aoa.push(['', 'Supplier', 'Lines', 'Subtotal', 'GCT', 'Total']);
    r.awards.forEach(a => aoa.push(['', a.name, a.items.length, a.subtotal, a.gct, a.total]));
    aoa.push(['', 'Total', '', '', '', r.awardTotal]);
    aoa.push(['', domain.amountWords(r.awardTotal)]);
    if (c.evaluationNote) { aoa.push([]); aoa.push(['Evaluation', c.evaluationNote]); }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 6 }, { wch: 42 }, { wch: 9 }, { wch: 9 }].concat(sups.map(() => [{ wch: 14 }, { wch: 15 }]).flat()).concat([{ wch: 30 }, { wch: 15 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comparison');
    const aw = [['Supplier', 'Description', 'Unit', 'Qty', 'Unit price', 'Total']];
    r.awards.forEach(a => {
      a.items.forEach(i => aw.push([a.name, i.description, i.unit, i.qty, i.unitPrice, i.total]));
      aw.push([a.name + ' — subtotal', '', '', '', '', a.subtotal]);
      if (a.gct) aw.push([a.name + ' — GCT', '', '', '', '', a.gct]);
      aw.push([a.name + ' — TOTAL', '', '', '', '', a.total]);
      aw.push([]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(aw);
    ws2['!cols'] = [{ wch: 36 }, { wch: 42 }, { wch: 9 }, { wch: 9 }, { wch: 13 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Awards by supplier');
    return wb;
  }

  /** Printable evaluation sheet used when the PDF engine is not available. */
  function printHtml(c) {
    const r = domain.computeComparison(c);
    const org = store.settings().org, off = domain.officer();
    const sups = c.suppliers || [];
    const m = v => util.money(v);
    const w = window.open('', '_blank');
    if (!w) { ui.toast('Allow pop-ups to print the comparison sheet.', 'warning'); return; }
    const head = '<tr><th>No.</th><th>Description</th><th>Unit</th><th>Qty</th>' + sups.map(s => '<th colspan="2">' + esc(r.bySupplier[s.supplierId].name) + (s.compliant === false ? '<br><small>(non-compliant)</small>' : '') + '</th>').join('') + '<th>Awarded to</th></tr>' +
      '<tr class="sub"><th></th><th></th><th></th><th></th>' + sups.map(() => '<th>Unit</th><th>Total</th>').join('') + '<th></th></tr>';
    const body = r.lines.map((l, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(l.item.description) + '</td><td>' + esc(l.item.unit || '') + '</td><td class="n">' + util.int(l.qty) + '</td>' +
      sups.map(s => { const q = l.quotes[s.supplierId]; const cls = (l.awardSid === s.supplierId ? 'aw' : l.lowestSid === s.supplierId ? 'lo' : ''); return q ? '<td class="n ' + cls + '">' + m(q.unit) + '</td><td class="n ' + cls + '">' + m(q.ext) + '</td>' : '<td class="n">—</td><td class="n">—</td>'; }).join('') +
      '<td>' + (l.awardSid ? esc(r.bySupplier[l.awardSid].name) : '—') + '</td></tr>').join('');
    const foot = ['Subtotal', 'GCT', 'Total bid'].map((lab, k) => '<tr class="ft"><td></td><td colspan="3">' + lab + '</td>' + sups.map(s => { const b = r.bySupplier[s.supplierId]; return '<td></td><td class="n">' + (b.quoted ? m([b.subtotal, b.gct, b.total][k]) : '—') + '</td>'; }).join('') + '<td></td></tr>').join('');
    const awards = r.awards.map((a, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(a.name) + '</td><td class="n">' + a.items.length + '</td><td class="n">' + m(a.total) + '</td></tr>').join('');
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(c.ref || 'Price comparison') + '</title><style>' +
      'body{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#111;margin:24px}h1{font-family:Times,serif;color:#a3161d;text-align:center;margin:0;font-size:20px}h2{font-family:Times,serif;color:#a3161d;text-align:center;margin:2px 0 4px;font-size:16px}' +
      '.c{text-align:center}.t{font-size:15px;font-weight:bold;text-align:center;margin:14px 0 8px;text-transform:uppercase;letter-spacing:.04em}table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #888;padding:4px 5px;vertical-align:top}th{background:#eef2f6;font-size:10.5px}' +
      'tr.sub th{font-weight:normal;font-size:9.5px}.n{text-align:right;white-space:nowrap}.lo{background:#e9f7ef}.aw{background:#c9efd8;font-weight:bold}tr.ft td{background:#f6f7f9;font-weight:bold}' +
      'table.xl{font-size:10px}table.xl th,table.xl td{border:1px solid #888;padding:3px 4px}table.xl thead th{text-transform:uppercase;font-size:9px}table.xl td.d{text-transform:uppercase;font-weight:bold}' +
      'table.xl .won{background:#7f7f7f!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}table.xl td.c,table.xl td.ino{text-align:center}table.xl tfoot td{font-weight:bold}' +
      '.meta td{border:0;padding:2px 6px}.sig{display:flex;gap:30px;margin-top:40px}.sig div{flex:1;border-top:1px solid #333;padding-top:4px}@page{size:landscape;margin:12mm}</style></head><body>' +
      '<h1>' + esc(org.authority) + '</h1><h2>' + esc(org.hospital) + '</h2><div class="c">' + esc(org.address) + '</div>' +
      '<div class="t">Price Comparison / Evaluation Sheet</div>' +
      '<table class="meta"><tr><td><b>Ref #:</b> ' + esc(c.ref || '') + '</td><td><b>Subject:</b> ' + esc(c.subject || '') + '</td><td><b>Date:</b> ' + esc(util.dateLong(c.date)) + '</td></tr>' +
      '<tr><td><b>Method:</b> ' + esc(c.method || '') + (c.viaGojep !== false ? ' (GOJEP)' : '') + '</td><td><b>Suppliers invited:</b> ' + (util.num(c.invited) || sups.length) + ' · <b>Bids received:</b> ' + r.bidsReceived + '</td><td><b>Award basis:</b> ' + (c.awardMode === 'lot' ? 'Whole lot' : 'Lowest compliant price per line') + '</td></tr></table>' +
      sheetTable(c, r) +
      '<p style="font-size:9.5px;color:#444;margin:4px 0 0">Shaded cells: supplier chosen for that item. Extended cost and Total include GCT where T/NT is “T”.</p>' +
      '<div class="t" style="font-size:13px">Recommended award</div><table style="width:60%"><thead><tr><th>No.</th><th>Supplier</th><th>Lines</th><th>Amount</th></tr></thead><tbody>' + awards +
      '<tr class="ft"><td></td><td>Total</td><td></td><td class="n">' + m(r.awardTotal) + '</td></tr></tbody></table><p><i>' + esc(domain.amountWords(r.awardTotal)) + '</i></p>' +
      '<p>' + esc(c.evaluationNote || domain.autoEvaluationNote(sups.filter(s => r.bySupplier[s.supplierId].quoted).map(s => ({ supplier: r.bySupplier[s.supplierId].name, compliant: s.compliant !== false })))) + '</p>' +
      '<div class="sig"><div>Prepared by: ' + esc(off.name) + '<br>' + esc(off.title) + '</div><div>Evaluation Committee Member</div><div>Evaluation Committee Member</div><div>Date</div></div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    w.document.close();
  }

  Proc.sourcing = { buildWorkbook, printHtml };
})();
