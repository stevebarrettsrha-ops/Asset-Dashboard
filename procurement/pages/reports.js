/* ==========================================================================
   Reports & PRS (#/reports, #/reports?tab=prs|polog|spend|approvals|compliance|aging|plan)
   • PRS monthly return in the Ministry of Finance layout (LITE + Database_ Transactions)
   • PO Log export in the hospital's layout (one sheet per month)
   • Spend analysis, approvals & cycle time, supplier compliance, payables aging,
     procurement plan vs actual. Every report exports to Excel and prints.
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, K } = Proc;
  const esc = util.esc;
  const PRS_THRESHOLD = 500000; // Database_ Transactions: "all transactions $500,000 and above"

  if (!document.getElementById('css-reports')) document.head.insertAdjacentHTML('beforeend', '<style id="css-reports">' +
    '.rp-period{display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
    '.rp-period select,.rp-period input{height:34px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);padding:0 8px;font-size:13px;outline:none}' +
    '.rp-period input[type=month],.rp-period input[type=date]{padding:0 6px}' +
    '.rp-share{display:flex;height:12px;border-radius:999px;overflow:hidden;background:var(--surface-3)}' +
    '.rp-share>div{height:100%}' +
    '.rp-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--text-2);margin-top:8px}' +
    '.rp-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}' +
    '.rp-fix select,.rp-fix input{height:30px;font-size:12.5px;border:1px solid var(--border-strong);border-radius:6px;background:var(--surface);padding:0 6px;max-width:220px;width:100%}' +
    '.rp-fix select[data-f=method]{min-width:170px}.rp-fix select[data-f=category]{min-width:200px}.rp-fix .missing{border-color:var(--warning);background:var(--warning-bg)}' +
    '.rp-k5{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}@media (max-width:1180px){.rp-k5{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (max-width:640px){.rp-k5{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '#rpBody .grid>.card+.card{margin-top:0}#rpBody td .t-sub{white-space:nowrap}' +
    '.rp-tabs{position:sticky;top:var(--topbar-h);z-index:5;background:var(--bg)}' +
    '@media print{.rp-tabs,.rp-noprint{display:none!important}}' +
    '</style>');

  /* ------------------------------------------------------------ helpers */
  const PALETTE = ['#0b5c8e', '#2e90fa', '#12b76a', '#f79009', '#7a5af8', '#ee46bc', '#06aed4', '#f04438', '#667085'];
  const active = () => store.list('purchaseOrders').filter(p => p.status !== 'Cancelled' && p.status !== 'Draft');
  const inRange = (iso, p) => !!iso && iso >= p.start && iso <= p.end;
  const supplierOf = po => store.get('suppliers', po.supplierId);
  const supName = po => po.supplierName || domain.supplierName(po.supplierId) || '—';
  const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);
  const thisMonth = () => util.today().slice(0, 7);
  const prevMonth = () => { const d = util.parseDate(util.today()); d.setDate(1); d.setMonth(d.getMonth() - 1); return util.toISODate(d).slice(0, 7); };
  const monthEnd = ym => { const [y, m] = ym.split('-').map(Number); return util.toISODate(new Date(y, m, 0)); };
  function fyList() {
    const s = new Set([util.fiscalYear(util.today())]);
    store.list('purchaseOrders').forEach(p => { if (p.date) s.add(util.fiscalYear(p.date)); });
    store.list('plans').forEach(p => { if (p.fy) s.add(p.fy); });
    return Array.from(s).sort().reverse();
  }
  /** Excel serial for an ISO date (no time-zone drift). */
  function serial(iso) { const d = util.parseDate(iso); if (!d) return null; return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000; }
  /** Build and download a workbook. sheets: [{ name, aoa, widths, dateCols:[idx], moneyCols:[idx], fromRow }] */
  function exportBook(filename, sheets) {
    if (!window.XLSX) { ui.toast('Excel library not loaded — check the connection and reload.', 'error'); return; }
    const wb = XLSX.utils.book_new();
    sheets.forEach(sh => {
      const ws = XLSX.utils.aoa_to_sheet(sh.aoa);
      const from = sh.fromRow || 1;
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let r = from; r <= range.e.r; r++) {
        (sh.dateCols || []).forEach(c => { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a] && ws[a].t === 'n') ws[a].z = 'dd/mm/yyyy'; });
        (sh.moneyCols || []).forEach(c => { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a] && ws[a].t === 'n') ws[a].z = '#,##0.00'; });
      }
      if (sh.widths) ws['!cols'] = sh.widths.map(w => ({ wch: w }));
      if (sh.merges) ws['!merges'] = sh.merges;
      XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
    });
    XLSX.writeFile(wb, filename);
  }

  /* Period picker: month / quarter / fiscal year / custom range */
  function periodOf(st) {
    if (st.mode === 'month') { const m = st.month || thisMonth(); return { start: m + '-01', end: monthEnd(m), label: util.monthLabel(m) }; }
    if (st.mode === 'quarter') {
      const y = parseInt(st.fy, 10), q = +st.q || 1;
      const sm = [3, 6, 9, 0][q - 1], sy = q === 4 ? y + 1 : y;
      const start = util.toISODate(new Date(sy, sm, 1)), end = util.toISODate(new Date(sy, sm + 3, 0));
      return { start, end, label: 'Q' + q + ' FY ' + st.fy + ' (' + util.MONTHS[sm].slice(0, 3) + '–' + util.MONTHS[(sm + 2) % 12].slice(0, 3) + ')' };
    }
    if (st.mode === 'range') return { start: st.start || '2000-01-01', end: st.end || '2999-12-31', label: (st.start ? util.date(st.start) : 'Start') + ' – ' + (st.end ? util.date(st.end) : 'today') };
    const r = util.fyRange(st.fy); return { start: r.start, end: r.end, label: 'FY ' + st.fy };
  }
  function periodControls(st) {
    const fys = fyList();
    return '<div class="rp-period rp-noprint"><select data-p="mode">' + ui.options([{ value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'fy', label: 'Fiscal year' }, { value: 'range', label: 'Custom range' }], st.mode) + '</select>' +
      (st.mode === 'month' ? '<input type="month" data-p="month" value="' + esc(st.month) + '">' : '') +
      (st.mode === 'quarter' || st.mode === 'fy' ? '<select data-p="fy">' + ui.options(fys.map(f => ({ value: f, label: 'FY ' + f })), st.fy) + '</select>' : '') +
      (st.mode === 'quarter' ? '<select data-p="q">' + ui.options([1, 2, 3, 4].map(q => ({ value: q, label: 'Q' + q + ' (' + ['Apr–Jun', 'Jul–Sep', 'Oct–Dec', 'Jan–Mar'][q - 1] + ')' })), st.q) + '</select>' : '') +
      (st.mode === 'range' ? '<input type="date" data-p="start" value="' + esc(st.start || '') + '"><span class="muted">to</span><input type="date" data-p="end" value="' + esc(st.end || '') + '">' : '') + '</div>';
  }
  function bindPeriod(root, st, redraw) {
    root.querySelectorAll('[data-p]').forEach(i => i.onchange = () => { st[i.dataset.p] = i.value; redraw(); });
  }
  const PERIOD = { mode: 'fy', fy: util.fiscalYear(util.today()), month: thisMonth(), q: String(Math.floor(((new Date().getMonth() + 9) % 12) / 3) + 1), start: '', end: '' };

  /* ---------------------------------------------------- PRS return data */
  function prsData(month) {
    const p = { start: month + '-01', end: monthEnd(month) };
    const pos = active().filter(po => inRange(po.date, p)).sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.poNumber).localeCompare(String(b.poNumber)));
    return { pos, big: pos.filter(po => (po.total || 0) >= PRS_THRESHOLD), lite: pos.filter(po => (po.total || 0) < PRS_THRESHOLD) };
  }
  function missingFields(po) {
    const m = [];
    if (!po.method) m.push('method');
    if (!po.category) m.push('category');
    if (!po.type) m.push('type');
    if (!po.tendersReceived) m.push('tenders');
    return m;
  }
  /** One Database_ Transactions row (28 columns) for a PO. */
  function prsRow(po) {
    const s = supplierOf(po) || {};
    const prs = po.prs || {};
    const memo = po.memoId ? store.get('memos', po.memoId) : null;
    const cmp = po.comparisonId ? store.get('comparisons', po.comparisonId) : null;
    const req = po.requisitionId ? store.get('requisitions', po.requisitionId) : null;
    const d = iso => (iso ? serial(String(iso).slice(0, 10)) : null);
    const gojep = po.viaGojep === true ? 'Yes' : po.viaGojep === false ? 'No' : '';
    return [
      isNaN(+po.poNumber) || !po.poNumber ? (po.poNumber || '') : +po.poNumber, store.settings().org.publicBody, supName(po), po.description || '', po.estimate || po.total || 0, po.total || 0,
      po.method || '', po.tendersReceived || null, s.country || po.country || 'Jamaica', po.type || '', po.category || '', s.msme ? 'Yes' : 'No', po.priority || 'Normal', gojep,
      prs.manualUpload || (po.viaGojep ? 'N/A - was executed via GOJEP' : ''),
      d(prs.reqReceived || (req && req.date) || po.dateReceived || po.requestDate),
      d(prs.noticePublished || (cmp && cmp.date)),
      d(prs.submissionDeadline || (cmp && cmp.closingDate)),
      d(prs.evaluationCompleted || (memo && memo.date)),
      d(prs.committeeRecommendation || (memo && memo.submittedAt)),
      d(prs.headApproval || (memo && memo.status === 'Approved' && memo.decision && memo.decision.date)),
      d(prs.ppcApproval), d(prs.cabinetApproval),
      d(prs.awardDate || po.date),
      prs.retendered || 'No', prs.retenderReason || '', prs.prsComment || po.comment || '', prs.melissa || 'No'
    ];
  }
  const PRS_HEADERS = ['Unique Contract Number (or Purchase Order Number where no contract exists)', 'Public Body', 'Contractor', 'Project Title', 'Procurement Cost Estimate', 'Contract Award Price',
    'Procurement Method', 'Number of Tenders Received', "Country (Supplier's)", 'Type (goods, service, works, exempt)', 'Transaction category/classification', 'MSME Set-Aside Transaction (Y/N)', 'Priority',
    'Executed via GOJEP ( Yes/No)', 'If NOT executed by GOJEP – was this MANUALLY UPLOADED (Yes, No or N/A)', 'Date requisition received', 'Date procurement notice published or RFQ sent',
    'Date -Quote/Tender submission deadline', 'Date evaluation of bids completed', 'Date - Procurement committee recommendation', 'Date - Head of Entity (or designate) approval of Contract ',
    'Date - PPC Approval of Contract', 'Date - Cabinet Approval of Contract', 'Date - Contract award date', 'Retendered procurement?  (Yes or No)', 'Primary reason for retender',
    'Comment (other retender reason or other comment on transaction)', 'Hurricane Melissa Recovery related? (Yes or No)'];
  Proc.PRS_HEADERS = PRS_HEADERS;
  function exportPRS(month, opts) {
    const { big, lite } = prsData(month);
    const [y, m] = month.split('-').map(Number);
    const monName = util.MONTHS[m - 1];
    const body = store.settings().org.publicBody;
    const liteAoa = [["Please add summary of transactions J$1 and above on this tab. One row per month's summary."], ['Revised Procurement Reporting System - PRS | Ministry of Finance and the Public Service'], [],
      ['Please note: Foreign currencies are calculated at the Rate of Exchange on the last day of the month.'], ['Prepared by:', opts.preparedBy || ''], ['Authorized by:', opts.authorizedBy || ''], [],
      ['Month', 'Year', 'Public Body', 'Number of Procurement Transactions', 'JMD Value of All Procurement Transactions COMMITTED (POs/Contracts)', 'JMD Value of All Procurement Transactions COMMITTED to MSME Suppliers']];
    if (opts.liteMode === 'summary') {
      const all = big.concat(lite);
      liteAoa.push([monName, y, body, all.length, util.round2(util.sum(all, p => p.total)), util.round2(util.sum(all.filter(p => (supplierOf(p) || {}).msme), p => p.total))]);
    } else {
      // As the hospital submits it: one row per transaction under $500,000 — running number, supplier, value.
      lite.forEach((po, i) => liteAoa.push([monName, y, body, i + 1, supName(po), util.round2(po.total || 0)]));
      liteAoa.push([null, null, null, null, 'Total', util.round2(util.sum(lite, p => p.total))]);
    }
    const dbAoa = [['This tab requires the input of all transactions $500,000 and above. One row per transaction/award.'], ['Revised Procurement Reporting System - PRS | Minister of Finance and the Public Service'], PRS_HEADERS]
      .concat(big.map(prsRow));
    const mon3 = monName.slice(0, 3).toUpperCase();
    exportBook('Procurement Reporting System - PRS ' + (store.settings().org.refCode || 'MPH') + ' ' + mon3 + ' ' + y + '.xlsx', [
      { name: 'LITE - ' + mon3 + '. ' + y, aoa: liteAoa, widths: [14, 8, 26, 14, 40, 22], moneyCols: [5].concat(opts.liteMode === 'summary' ? [4] : []), fromRow: 8, merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }] },
      { name: 'Database_ Transactions', aoa: dbAoa, widths: [16, 22, 30, 36, 16, 16, 24, 10, 12, 12, 30, 10, 10, 10, 18].concat(new Array(9).fill(14)).concat([10, 22, 30, 12]),
        dateCols: [15, 16, 17, 18, 19, 20, 21, 22, 23], moneyCols: [4, 5], fromRow: 3 }
    ]);
    Proc.audit('Export PRS', 'PRS return ' + monName + ' ' + y + ': ' + big.length + ' database rows, ' + lite.length + ' LITE transactions');
  }

  /* ------------------------------------------------------------- tabs */
  const TABS = [
    { id: 'prs', label: 'PRS return', icon: 'sheet' }, { id: 'polog', label: 'PO Log', icon: 'cart' }, { id: 'spend', label: 'Spend analysis', icon: 'chart' },
    { id: 'approvals', label: 'Approvals & cycle time', icon: 'clock' }, { id: 'compliance', label: 'Supplier compliance', icon: 'shield' },
    { id: 'aging', label: 'Payables aging', icon: 'wallet' }, { id: 'plan', label: 'Procurement plan', icon: 'calendar' },
    { id: 'pdf', label: 'PDF Reports', icon: 'printer' }
  ];
  // Each tab's matching report on the PDF Reports tab.
  const PDF_FOR = { prs: 'monthly', polog: 'poregister', spend: 'spend', approvals: 'approvals', compliance: 'compliance', aging: 'payables', plan: 'plan' };
  let tab = 'prs';
  const prsState = { month: prevMonth(), liteMode: 'itemised', preparedBy: '', authorizedBy: '' };

  function render(el) {
    const q = Proc.router.parse().query;
    if (q.tab && TABS.some(t => t.id === q.tab)) tab = q.tab;
    el.innerHTML = ui.pageHead({ title: 'Reports & PRS', sub: 'Ministry returns, logs and analysis — all generated from your records.',
      actions: '<button class="btn" id="rpPrint">' + ui.icon('printer', 'sm') + 'Print</button><button class="btn primary" id="rpPdf">' + ui.icon('file', 'sm') + 'PDF on letterhead</button>' }) +
      '<div class="rp-tabs"><div class="tabs wrap">' + TABS.map(t => '<button data-tab="' + t.id + '" class="' + (t.id === tab ? 'on' : '') + '">' + ui.icon(t.icon, 'sm') + esc(t.label) + '</button>').join('') + '</div></div><div id="rpBody"></div>';
    el.querySelector('#rpPrint').onclick = () => window.print();
    const pdfBtn = el.querySelector('#rpPdf');
    const syncPdfBtn = () => { pdfBtn.hidden = tab === 'pdf'; el.querySelector('#rpPrint').hidden = tab === 'pdf'; };
    pdfBtn.onclick = () => { const r = PDF_FOR[tab]; tab = 'pdf'; try { history.replaceState(null, '', '#/reports?tab=pdf' + (r ? '&r=' + r : '')); } catch (e) { /* ignore */ } render(el); };
    syncPdfBtn();
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
      tab = b.dataset.tab; el.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
      try { history.replaceState(null, '', '#/reports?tab=' + tab); } catch (e) { /* ignore */ }
      syncPdfBtn();
      draw(el.querySelector('#rpBody'));
    });
    draw(el.querySelector('#rpBody'));
  }
  function draw(box) {
    const fn = { prs: drawPRS, polog: drawPOLog, spend: drawSpend, approvals: drawApprovals, compliance: drawCompliance, aging: drawAging, plan: drawPlan, pdf: b => Proc.reportPdf.render(b, { embedded: true }) }[tab];
    box.innerHTML = '';
    fn(box);
  }

  /* PRS ---------------------------------------------------------------- */
  function drawPRS(box) {
    const st = prsState;
    if (!st.preparedBy) st.preparedBy = domain.officer().name;
    if (!st.authorizedBy) st.authorizedBy = store.settings().signatories.parishManager.name;
    const { pos, big, lite } = prsData(st.month);
    const incomplete = big.filter(p => missingFields(p).length);
    const msme = util.sum(pos.filter(p => (supplierOf(p) || {}).msme), p => p.total);
    box.innerHTML =
      '<div class="card"><div class="card-h"><div><h3>Monthly PRS return</h3><div class="sub">Ministry of Finance Revised Procurement Reporting System — transactions of $500,000 and above go to “Database_ Transactions”; smaller ones to “LITE”.</div></div>' +
      '<div class="row rp-noprint"><input type="month" class="input sm" id="prsMonth" value="' + esc(st.month) + '" style="width:170px"><button class="btn primary" id="prsExport"' + (pos.length ? '' : ' disabled') + '>' + ui.icon('download', 'sm') + 'Export PRS workbook</button></div></div>' +
      '<div class="card-b"><div class="grid c4">' +
      ui.kpi({ label: 'Transactions', icon: 'list', value: util.int(pos.length), meta: util.monthLabel(st.month) }) +
      ui.kpi({ label: 'Value committed', icon: 'wallet', value: util.moneyShort(util.sum(pos, p => p.total)), title: util.money(util.sum(pos, p => p.total)), meta: 'MSME: ' + util.money(msme, { noCents: true }) }) +
      ui.kpi({ label: 'Database rows (≥ $500K)', icon: 'sheet', value: util.int(big.length), meta: util.money(util.sum(big, p => p.total), { noCents: true }), tone: incomplete.length ? 'warn' : 'ok' }) +
      ui.kpi({ label: 'LITE transactions', icon: 'receipt', value: util.int(lite.length), meta: util.money(util.sum(lite, p => p.total), { noCents: true }) }) + '</div>' +
      '<div class="form-grid mt-3 rp-noprint"><div class="field s4"><label>Prepared by</label><input id="prsPrep" value="' + esc(st.preparedBy) + '"></div>' +
      '<div class="field s4"><label>Authorized by</label><input id="prsAuth" value="' + esc(st.authorizedBy) + '"></div>' +
      '<div class="field s4"><label>LITE sheet layout</label><select id="prsLite">' + ui.options([{ value: 'itemised', label: 'One row per transaction (as MPH submits)' }, { value: 'summary', label: 'One summary row for the month' }], st.liteMode) + '</select></div></div>' +
      (incomplete.length ? '<div class="alert warning mt-3">' + ui.icon('alert') + '<div><div class="t">' + incomplete.length + ' of ' + big.length + ' database rows are missing required fields</div>Fill them in below — changes save to the purchase order immediately.</div></div>'
        : big.length ? '<div class="alert success mt-3">' + ui.icon('check') + '<div>All ' + big.length + ' database rows have method, category, type and number of tenders.</div></div>' : '') +
      '</div></div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>Database_ Transactions</h3><div class="sub">' + big.length + ' transactions of $500,000 and above</div></div></div><div class="card-b flush" id="prsBig"></div></div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>LITE</h3><div class="sub">' + lite.length + ' transactions under $500,000</div></div></div><div class="card-b flush" id="prsLiteT"></div></div>';
    box.querySelector('#prsMonth').onchange = e => { st.month = e.target.value || prevMonth(); drawPRS(box); };
    box.querySelector('#prsPrep').oninput = e => { st.preparedBy = e.target.value; };
    box.querySelector('#prsAuth').oninput = e => { st.authorizedBy = e.target.value; };
    box.querySelector('#prsLite').onchange = e => { st.liteMode = e.target.value; };
    box.querySelector('#prsExport').onclick = () => {
      const stillMissing = prsData(st.month).big.filter(p => missingFields(p).length).length;
      const go = () => { exportPRS(st.month, st); ui.toast('PRS workbook downloaded'); };
      if (stillMissing) ui.confirm(stillMissing + ' database ' + util.plural(stillMissing, 'row is', 'rows are') + ' still missing required fields. Export anyway?', { ok: 'Export anyway' }).then(ok => ok && go());
      else go();
    };
    const save = (id, patch) => { store.upsert('purchaseOrders', Object.assign({ id }, patch)); };
    ui.table(box.querySelector('#prsBig'), {
      rows: big, pageSize: 50, placeholder: 'Search PO, supplier…', search: r => [r.poNumber, supName(r), r.description, r.category].join(' '),
      empty: ui.empty('sheet', 'No transactions of $500,000 or more', 'Nothing to report on Database_ Transactions for ' + util.monthLabel(st.month) + '.'),
      columns: [
        { key: 'poNumber', label: 'PO #', render: r => '<a href="#/orders/' + r.id + '" class="strong">' + esc(r.poNumber || '—') + '</a><div class="t-sub">' + util.date(r.date) + '</div>' },
        { key: 'supplier', label: 'Contractor', sort: r => supName(r), render: r => '<div class="t-title">' + esc(supName(r)) + '</div><div class="t-sub truncate" style="max-width:260px">' + esc(r.description || '') + '</div>' },
        { key: 'total', label: 'Award price', cls: 'num', render: r => util.money(r.total) },
        { key: 'method', label: 'Method', render: r => '<div class="rp-fix"><select data-f="method" data-id="' + r.id + '" class="' + (r.method ? '' : 'missing') + '">' + ui.options(K.METHODS, r.method, '— select —') + '</select></div>' },
        { key: 'type', label: 'Type', render: r => '<div class="rp-fix"><select data-f="type" data-id="' + r.id + '" class="' + (r.type ? '' : 'missing') + '" style="width:100px">' + ui.options(K.TYPES, r.type, '—') + '</select></div>' },
        { key: 'category', label: 'Category', render: r => '<div class="rp-fix"><select data-f="category" data-id="' + r.id + '" class="' + (r.category ? '' : 'missing') + '">' + ui.categoryOptions(r.category, r.type) + '</select></div>' },
        { key: 'tendersReceived', label: 'Tenders', render: r => '<div class="rp-fix"><input type="number" min="1" data-f="tendersReceived" data-id="' + r.id + '" value="' + esc(r.tendersReceived || '') + '" class="' + (r.tendersReceived ? '' : 'missing') + '" style="width:64px"></div>' },
        { key: 'ok', label: '', sort: r => missingFields(r).length, render: r => { const m = missingFields(r); return m.length ? ui.badge(m.length + ' missing', 'warning') : ui.badge('Complete', 'success'); } }
      ],
      footer: rows => '<td colspan="2">Total</td><td class="num">' + util.money(util.sum(rows, r => r.total)) + '</td><td colspan="5"></td>',
      bind: tb => tb.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => {
        const f = inp.dataset.f; const v = f === 'tendersReceived' ? (parseInt(inp.value, 10) || null) : inp.value;
        save(inp.dataset.id, { [f]: v }); inp.classList.toggle('missing', !v);
        const po = store.get('purchaseOrders', inp.dataset.id);
        const cell = inp.closest('tr').lastElementChild; const m = missingFields(po);
        cell.innerHTML = m.length ? ui.badge(m.length + ' missing', 'warning') : ui.badge('Complete', 'success');
        if (f === 'type') { const cs = inp.closest('tr').querySelector('[data-f=category]'); if (cs) cs.innerHTML = ui.categoryOptions(po.category, po.type); }
      })
    });
    ui.table(box.querySelector('#prsLiteT'), {
      rows: lite.map((p, i) => Object.assign({ _n: i + 1 }, p)), pageSize: 25, search: r => [r.poNumber, supName(r)].join(' '),
      empty: ui.empty('receipt', 'No transactions under $500,000', ''),
      columns: [
        { key: '_n', label: 'No.', cls: 'num', width: '60px' },
        { key: 'date', label: 'Date', render: r => '<span class="nowrap">' + util.date(r.date) + '</span>' },
        { key: 'poNumber', label: 'PO #', render: r => '<a href="#/orders/' + r.id + '">' + esc(r.poNumber || '—') + '</a>' },
        { key: 'supplier', label: 'Supplier', sort: r => supName(r), render: r => esc(supName(r)) + ((supplierOf(r) || {}).msme ? ' <span class="chip">MSME</span>' : '') },
        { key: 'total', label: 'Value', cls: 'num', render: r => util.money(r.total) }
      ],
      footer: rows => '<td colspan="4">Total</td><td class="num">' + util.money(util.sum(rows, r => r.total)) + '</td>'
    });
  }

  /* PO Log -------------------------------------------------------------- */
  function drawPOLog(box) {
    const fys = fyList();
    const st = drawPOLog.st = drawPOLog.st || { fy: util.fiscalYear(util.today()) };
    const r = util.fyRange(st.fy);
    const pos = store.list('purchaseOrders').filter(p => p.status !== 'Cancelled' && inRange(p.date, r)).sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.poNumber).localeCompare(String(b.poNumber)));
    const byMonth = util.groupBy(pos, p => util.monthKey(p.date));
    const months = Object.keys(byMonth).sort();
    box.innerHTML = '<div class="card"><div class="card-h"><div><h3>PO Log</h3><div class="sub">Exported in the hospital\'s PO Log layout — one sheet per month, 15 columns, total row.</div></div>' +
      '<div class="row rp-noprint"><select class="input sm" id="plFy" style="width:140px">' + ui.options(fys.map(f => ({ value: f, label: 'FY ' + f })), st.fy) + '</select>' +
      '<button class="btn primary" id="plExport"' + (pos.length ? '' : ' disabled') + '>' + ui.icon('download', 'sm') + 'Export PO Log</button></div></div>' +
      '<div class="card-b flush" id="plMonths"></div></div><div class="card mt-3"><div class="card-h"><h3>Purchase orders in FY ' + esc(st.fy) + '</h3></div><div class="card-b flush" id="plRows"></div></div>';
    box.querySelector('#plFy').onchange = e => { st.fy = e.target.value; drawPOLog(box); };
    box.querySelector('#plExport').onclick = () => {
      const sheets = months.map(mk => {
        const rows = byMonth[mk];
        const aoa = [['REQUEST #', 'REQUEST DATE', 'DATE RECEIVED', 'REQUISITIONER', 'DEPARTMENT', 'NO.', 'ITEM DESCRIPTION', 'SUPPLIER', 'P.O. DATE', 'P.O. #', 'P.O. $', 'INVOICE #', 'INVOICE DATE', 'INVOICE $', 'COMMENT']];
        rows.forEach((p, i) => {
          const inv = store.filter('invoices', x => x.poId === p.id)[0];
          aoa.push([p.requestNo || '', serial(p.requestDate), serial(p.dateReceived), p.requisitioner || '', p.department || '', i + 1, p.description || '', supName(p), serial(p.date),
            isNaN(+p.poNumber) || !p.poNumber ? (p.poNumber || '') : +p.poNumber, p.total || 0, inv ? inv.invoiceNumber : '', inv ? serial(inv.date) : null, inv ? inv.total : null, p.comment || '']);
        });
        aoa.push([null, null, null, null, null, null, null, null, null, 'TOTAL', util.round2(util.sum(rows, p => p.total))]);
        const [y, m] = mk.split('-');
        return { name: util.MONTHS[+m - 1].toUpperCase() + ' ' + y, aoa, widths: [10, 12, 12, 16, 16, 6, 60, 34, 12, 12, 14, 12, 12, 14, 24], dateCols: [1, 2, 8, 12], moneyCols: [10, 13] };
      });
      exportBook('P.O. LOG FY ' + st.fy.replace('/', '-') + '.xlsx', sheets);
      Proc.audit('Export PO Log', 'FY ' + st.fy + ': ' + pos.length + ' POs'); ui.toast('PO Log downloaded');
    };
    const mrows = months.map(mk => ({ mk, n: byMonth[mk].length, v: util.sum(byMonth[mk], p => p.total), sup: new Set(byMonth[mk].map(p => p.supplierId)).size }));
    ui.table(box.querySelector('#plMonths'), {
      rows: mrows, search: false, pageSize: 12, empty: ui.empty('cart', 'No purchase orders in FY ' + st.fy, 'Import your PO Log or issue purchase orders to see them here.', '<a class="btn primary" href="#/import">' + ui.icon('upload', 'sm') + 'Import data</a>'),
      columns: [{ key: 'mk', label: 'Month (sheet)', render: r => '<span class="strong">' + esc(util.monthLabel(r.mk)) + '</span>' }, { key: 'n', label: 'POs', cls: 'num' }, { key: 'sup', label: 'Suppliers', cls: 'num' }, { key: 'v', label: 'P.O. $', cls: 'num', render: r => util.money(r.v) }],
      footer: rows => '<td>Total</td><td class="num">' + util.int(util.sum(rows, r => r.n)) + '</td><td></td><td class="num">' + util.money(util.sum(rows, r => r.v)) + '</td>'
    });
    ui.table(box.querySelector('#plRows'), {
      rows: pos, pageSize: 25, initialSort: { key: 'date', dir: -1 }, search: p => [p.poNumber, supName(p), p.description, p.department].join(' '), onRow: p => Proc.router.go('orders/' + p.id),
      columns: [{ key: 'date', label: 'P.O. date', render: p => '<span class="nowrap">' + util.date(p.date) + '</span>' }, { key: 'poNumber', label: 'P.O. #', render: p => '<span class="strong">' + esc(p.poNumber || '—') + '</span>' },
        { key: 'description', label: 'Item description', render: p => '<div class="truncate" style="max-width:420px" title="' + esc(p.description) + '">' + esc(p.description) + '</div>' },
        { key: 'supplier', label: 'Supplier', sort: p => supName(p), render: p => esc(supName(p)) }, { key: 'total', label: 'P.O. $', cls: 'num', render: p => util.money(p.total) }, { key: 'status', label: 'Status', render: p => ui.badge(p.status) }]
    });
  }

  /* Spend --------------------------------------------------------------- */
  function rollup(pos, keyFn) {
    const m = {};
    pos.forEach(p => { const k = keyFn(p) || '(not recorded)'; const r = m[k] = m[k] || { key: k, n: 0, v: 0 }; r.n++; r.v += p.total || 0; });
    return Object.values(m).sort((a, b) => b.v - a.v);
  }
  function drawSpend(box) {
    const st = drawSpend.st = drawSpend.st || Object.assign({}, PERIOD);
    const per = periodOf(st);
    const pos = active().filter(p => inRange(p.date, per));
    const total = util.sum(pos, p => p.total);
    const bySup = rollup(pos, p => p.supplierId);
    const byMethod = rollup(pos, p => p.method);
    const byCat = rollup(pos, p => p.category);
    const byDept = rollup(pos, p => p.department);
    const byMonth = rollup(pos, p => util.monthKey(p.date)).sort((a, b) => a.key.localeCompare(b.key));
    const ss = byMethod.find(r => r.key === 'Single Source (SS)') || { v: 0, n: 0 };
    const withMethod = util.sum(byMethod.filter(r => r.key !== '(not recorded)'), r => r.v);
    const ssShare = pct(ss.v, withMethod);
    const supLabel = k => domain.supplierName(k, k);
    const table = (rows, label, fmtKey, link) => '<div class="table-wrap"><table class="table compact"><thead><tr><th>' + esc(label) + '</th><th class="num">POs</th><th class="num">Value</th><th class="num">Share</th></tr></thead><tbody>' +
      (rows.length ? rows.map(r => '<tr><td>' + (link ? '<a href="' + link(r.key) + '">' + esc(fmtKey ? fmtKey(r.key) : r.key) + '</a>' : esc(fmtKey ? fmtKey(r.key) : r.key)) + '</td><td class="num">' + util.int(r.n) + '</td><td class="num">' + util.money(r.v) + '</td><td class="num">' + pct(r.v, total) + '%</td></tr>').join('')
        : '<tr><td colspan="4" class="muted center">No data</td></tr>') + '</tbody></table></div>';
    box.innerHTML = '<div class="row between mb-2">' + periodControls(st) + '<button class="btn rp-noprint" id="spExport"' + (pos.length ? '' : ' disabled') + '>' + ui.icon('download', 'sm') + 'Export to Excel</button></div>' +
      '<div class="grid c4">' + ui.kpi({ label: 'Committed spend', icon: 'wallet', value: util.moneyShort(total), title: util.money(total), meta: per.label }) +
      ui.kpi({ label: 'Purchase orders', icon: 'cart', value: util.int(pos.length), meta: 'Average ' + util.money(pos.length ? total / pos.length : 0, { noCents: true }) }) +
      ui.kpi({ label: 'Suppliers used', icon: 'building', value: util.int(bySup.length), meta: bySup[0] ? 'Top: ' + esc(supLabel(bySup[0].key)) : '' }) +
      ui.kpi({ label: 'Single-source share', icon: 'target', value: ssShare + '%', meta: 'of value with a recorded method', tone: ssShare > 60 ? 'warn' : 'ok' }) + '</div>' +
      (ssShare > 60 ? '<div class="alert warning mt-2">' + ui.icon('alert') + '<div><div class="t">High single-source share</div>' + ssShare + '% of committed value used Single Source. Make sure each file holds the justification the Handbook requires, and consider Restricted Bidding or RFQ for recurring needs.</div></div>' : '') +
      (pos.length && withMethod < total * 0.5 ? '<div class="alert mt-2">' + ui.icon('info') + '<div>Procurement method is recorded for ' + pct(withMethod, total) + '% of value. Importing PRS returns fills it in for larger POs.</div></div>' : '') +
      '<div class="grid side mt-3"><div class="card"><div class="card-h"><h3>Spend by month</h3><span class="muted small">' + esc(per.label) + '</span></div><div class="card-b">' +
      (byMonth.length ? ui.bars(byMonth.map(r => ({ label: util.monthLabel(r.key).replace(' 20', " '"), value: r.v, title: util.monthLabel(r.key) + ': ' + util.money(r.v) + ' (' + r.n + ' POs)' })), { height: 200 }) : ui.empty('chart', 'No spend in this period', '')) + '</div></div>' +
      '<div class="card"><div class="card-h"><h3>By method</h3></div><div class="card-b">' + methodShare(byMethod, total) + '</div></div></div>' +
      '<div class="grid c2 mt-3"><div class="card"><div class="card-h"><h3>Top suppliers</h3></div><div class="card-b">' + (bySup.length ? ui.hbars(bySup.slice(0, 10).map(r => ({ label: supLabel(r.key), value: r.v, href: '#/suppliers/' + r.key }))) : '<div class="muted">No data</div>') + '</div></div>' +
      '<div class="card"><div class="card-h"><h3>By category</h3></div><div class="card-b flush">' + table(byCat.slice(0, 12), 'Category') + '</div></div></div>' +
      '<div class="grid c2 mt-3"><div class="card"><div class="card-h"><h3>All suppliers</h3></div><div class="card-b flush">' + table(bySup.slice(0, 25), 'Supplier', supLabel, k => '#/suppliers/' + k) + '</div></div>' +
      '<div class="card"><div class="card-h"><h3>By department</h3></div><div class="card-b flush">' + (byDept.length === 1 && byDept[0].key === '(not recorded)' ? ui.empty('building', 'Departments not recorded', 'The PO Log leaves the DEPARTMENT column blank. Purchase orders raised from requisitions in this system carry the department automatically.') : table(byDept.slice(0, 15), 'Department')) + '</div></div></div>';
    bindPeriod(box, st, () => drawSpend(box));
    box.querySelector('#spExport').onclick = () => {
      const s = (rows, label, f) => [[label, 'POs', 'Value', 'Share %']].concat(rows.map(r => [f ? f(r.key) : r.key, r.n, util.round2(r.v), pct(r.v, total)]));
      exportBook('Spend analysis ' + per.label.replace(/[\/:]/g, '-') + '.xlsx', [
        { name: 'By supplier', aoa: s(bySup, 'Supplier', supLabel), widths: [40, 8, 16, 8], moneyCols: [2] }, { name: 'By month', aoa: s(byMonth, 'Month', util.monthLabel), widths: [12, 8, 16, 8], moneyCols: [2] },
        { name: 'By method', aoa: s(byMethod, 'Method'), widths: [36, 8, 16, 8], moneyCols: [2] }, { name: 'By category', aoa: s(byCat, 'Category'), widths: [44, 8, 16, 8], moneyCols: [2] },
        { name: 'By department', aoa: s(byDept, 'Department'), widths: [30, 8, 16, 8], moneyCols: [2] }]);
    };
  }
  function methodShare(rows, total) {
    if (!rows.length) return '<div class="muted">No data</div>';
    return '<div class="rp-share">' + rows.map((r, i) => '<div style="width:' + (r.v / (total || 1) * 100) + '%;background:' + PALETTE[i % PALETTE.length] + '" title="' + esc(r.key) + ': ' + util.money(r.v) + '"></div>').join('') + '</div>' +
      '<div class="rp-legend" style="flex-direction:column;gap:6px">' + rows.map((r, i) => '<div class="row between"><span><i style="background:' + PALETTE[i % PALETTE.length] + '"></i>' + esc(r.key) + '</span><span class="num strong">' + pct(r.v, total) + '% <span class="muted">(' + r.n + ')</span></span></div>').join('') + '</div>';
  }

  /* Approvals & cycle time ------------------------------------------------ */
  function stats(days) { days = days.filter(d => d !== null && d >= 0).sort((a, b) => a - b); if (!days.length) return null; const mid = Math.floor(days.length / 2); return { n: days.length, avg: Math.round(util.sum(days) / days.length * 10) / 10, median: days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2, max: days[days.length - 1] }; }
  function drawApprovals(box) {
    const memos = store.list('memos');
    const byStatus = K.MEMO_STATUSES.map(s => ({ s, n: memos.filter(m => m.status === s).length, v: util.sum(memos.filter(m => m.status === s), m => util.sum(m.awards || [], a => a.amount)) }));
    const decided = memos.filter(m => m.decision && m.decision.date && m.submittedAt);
    const memoDays = stats(decided.map(m => util.daysBetween(String(m.submittedAt).slice(0, 10), m.decision.date)));
    const pos = active();
    const prsCycle = stats(pos.filter(p => p.prs && p.prs.reqReceived && (p.prs.awardDate || p.date)).map(p => util.daysBetween(p.prs.reqReceived, p.prs.awardDate || p.date)));
    const reqCycle = stats(pos.filter(p => p.requisitionId).map(p => { const r = store.get('requisitions', p.requisitionId); return r ? util.daysBetween(r.date, p.date) : null; }));
    const cmpCycle = stats(pos.filter(p => p.comparisonId).map(p => { const c = store.get('comparisons', p.comparisonId); return c ? util.daysBetween(c.date, p.date) : null; }));
    const byMethod = util.groupBy(pos.filter(p => p.prs && p.prs.reqReceived && p.method), p => p.method);
    const mRows = Object.keys(byMethod).map(k => Object.assign({ method: k }, stats(byMethod[k].map(p => util.daysBetween(p.prs.reqReceived, p.prs.awardDate || p.date))) || { n: 0 })).filter(r => r.n).sort((a, b) => b.n - a.n);
    const fmt = s => (s ? s.avg + ' days' : '—');
    box.innerHTML = '<div class="grid c4">' +
      ui.kpi({ label: 'Memos awaiting decision', icon: 'stamp', value: util.int((byStatus.find(x => x.s === 'Submitted') || {}).n || 0), meta: util.int((byStatus.find(x => x.s === 'Draft') || {}).n || 0) + ' drafts', href: '#/memos', tone: 'warn' }) +
      ui.kpi({ label: 'Memo decision time', icon: 'clock', value: fmt(memoDays), meta: memoDays ? 'median ' + memoDays.median + ' · ' + memoDays.n + ' decided' : 'No decisions recorded yet' }) +
      ui.kpi({ label: 'Requisition → award (PRS)', icon: 'trend', value: fmt(prsCycle), meta: prsCycle ? 'median ' + prsCycle.median + ' days · ' + prsCycle.n + ' contracts' : 'Import PRS returns to measure' }) +
      ui.kpi({ label: 'Comparison → PO', icon: 'scale', value: fmt(cmpCycle), meta: cmpCycle ? cmpCycle.n + ' POs' : (reqCycle ? 'Requisition → PO ' + reqCycle.avg + ' days' : 'Measured as POs are raised') }) + '</div>' +
      '<div class="grid c2 mt-3"><div class="card"><div class="card-h"><h3>Approval memos by status</h3><a class="small" href="#/memos">Open memos</a></div><div class="card-b flush"><div class="table-wrap"><table class="table compact"><thead><tr><th>Status</th><th class="num">Memos</th><th class="num">Recommended value</th></tr></thead><tbody>' +
      byStatus.map(r => '<tr><td>' + ui.badge(r.s) + '</td><td class="num">' + r.n + '</td><td class="num">' + util.money(r.v) + '</td></tr>').join('') + '</tbody></table></div></div></div>' +
      '<div class="card"><div class="card-h"><h3>Requisition → award by method</h3><span class="muted small">From PRS dates</span></div><div class="card-b flush"><div class="table-wrap"><table class="table compact"><thead><tr><th>Method</th><th class="num">Contracts</th><th class="num">Average</th><th class="num">Median</th><th class="num">Longest</th></tr></thead><tbody>' +
      (mRows.length ? mRows.map(r => '<tr><td>' + esc(r.method) + '</td><td class="num">' + r.n + '</td><td class="num">' + r.avg + ' d</td><td class="num">' + r.median + ' d</td><td class="num">' + r.max + ' d</td></tr>').join('') : '<tr><td colspan="5" class="muted center">No PRS dates yet</td></tr>') + '</tbody></table></div></div></div></div>' +
      '<div class="card mt-3"><div class="card-h"><h3>Memos</h3></div><div class="card-b flush" id="apMemos"></div></div>';
    ui.table(box.querySelector('#apMemos'), {
      rows: memos, pageSize: 15, initialSort: { key: 'date', dir: -1 }, search: m => [m.ref, m.subject].join(' '), onRow: m => Proc.router.go('memos/' + m.id),
      empty: ui.empty('stamp', 'No approval memos yet', 'Memos prepared from price comparisons appear here.'),
      columns: [{ key: 'date', label: 'Date', render: m => '<span class="nowrap">' + util.date(m.date) + '</span>' }, { key: 'ref', label: 'Reference', render: m => '<div class="t-title">' + esc(m.ref || '—') + '</div><div class="t-sub">' + esc(m.subject || '') + '</div>' },
        { key: 'amt', label: 'Recommended', cls: 'num', sort: m => util.sum(m.awards || [], a => a.amount), render: m => util.money(util.sum(m.awards || [], a => a.amount)) },
        { key: 'level', label: 'Approval level', sort: false, render: m => esc(domain.approvalRoute(util.sum(m.awards || [], a => a.amount), m.awards).level) },
        { key: 'status', label: 'Status', render: m => ui.badge(m.status) },
        { key: 'days', label: 'Days pending', cls: 'num', sort: m => (m.status === 'Submitted' && m.submittedAt ? util.daysBetween(String(m.submittedAt).slice(0, 10), util.today()) : -1), render: m => (m.status === 'Submitted' && m.submittedAt ? util.daysBetween(String(m.submittedAt).slice(0, 10), util.today()) : '—') }]
    });
  }

  /* Supplier compliance ---------------------------------------------------- */
  function complianceRows(all) {
    const fy = util.fiscalYear(util.today());
    const used = {}; active().forEach(p => { if (util.fiscalYear(p.date) === fy) used[p.supplierId] = (used[p.supplierId] || 0) + (p.total || 0); });
    return store.list('suppliers').filter(s => s.status !== 'Inactive').map(s => {
      const tcc = domain.expiryState(s.tccExpiry), ppc = domain.expiryState(s.ppcExpiry);
      const issues = [];
      if (!s.trn) issues.push('No TRN');
      if (!s.tccExpiry) issues.push('No TCC on file'); else if (tcc.tone !== 'success') issues.push('TCC ' + tcc.label.toLowerCase());
      if (s.ppcExpiry && ppc.tone !== 'success') issues.push('PPC registration ' + ppc.label.toLowerCase());
      if (s.status === 'Suspended' || s.status === 'Debarred') issues.push(s.status);
      return { s, tcc, ppc, issues, spend: used[s.id] || 0, severity: issues.some(i => /expired|Debarred|Suspended/.test(i)) ? 2 : issues.length ? 1 : 0 };
    }).filter(r => all || (r.issues.length && (r.spend > 0 || r.severity === 2)));
  }
  Proc.complianceRows = complianceRows;
  function drawCompliance(box) {
    const st = drawCompliance.st = drawCompliance.st || { all: false };
    const rows = complianceRows(st.all);
    const allRows = complianceRows(true);
    const expired = allRows.filter(r => (r.tcc && r.tcc.tone === 'danger') || (r.ppc && r.ppc.tone === 'danger')).length;
    const expiring = allRows.filter(r => (r.tcc && r.tcc.tone === 'warning') || (r.ppc && r.ppc.tone === 'warning')).length;
    const noTcc = allRows.filter(r => !r.s.tccExpiry && r.spend > 0).length;
    const stateCell = (x, iso) => (x ? ui.badge(x.label, x.tone) + '<div class="t-sub">' + util.date(iso) + (x.days >= 0 ? ' · ' + x.days + ' d left' : '') + '</div>' : '<span class="muted">Not on file</span>');
    box.innerHTML = '<div class="grid c4">' + ui.kpi({ label: 'Expired TCC / PPC', icon: 'alert', value: util.int(expired), tone: expired ? 'bad' : 'ok' }) +
      ui.kpi({ label: 'Expiring within 30 days', icon: 'clock', value: util.int(expiring), tone: expiring ? 'warn' : 'ok' }) +
      ui.kpi({ label: 'Used this FY without a TCC on file', icon: 'shield', value: util.int(noTcc), tone: noTcc ? 'warn' : 'ok' }) +
      ui.kpi({ label: 'Active suppliers', icon: 'building', value: util.int(allRows.length) }) + '</div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>Supplier compliance</h3><div class="sub">Tax Compliance Certificates and PPC registration. Update details on each supplier\'s profile.</div></div>' +
      '<div class="row rp-noprint"><div class="seg"><button data-all="0" class="' + (st.all ? '' : 'on') + '">Needs attention</button><button data-all="1" class="' + (st.all ? 'on' : '') + '">All suppliers</button></div>' +
      '<button class="btn sm" id="cpExport">' + ui.icon('download', 'sm') + 'Export</button></div></div><div class="card-b flush" id="cpT"></div></div>';
    box.querySelectorAll('[data-all]').forEach(b => b.onclick = () => { st.all = b.dataset.all === '1'; drawCompliance(box); });
    box.querySelector('#cpExport').onclick = () => exportBook('Supplier compliance ' + util.today() + '.xlsx', [{ name: 'Compliance', aoa: [['Supplier', 'TRN', 'TCC number', 'TCC expiry', 'PPC registered', 'PPC expiry', 'Status', 'FY spend', 'Issues']]
      .concat(rows.map(r => [r.s.name, r.s.trn || '', r.s.tccNumber || '', serial(r.s.tccExpiry), r.s.ppcRegistered || '', serial(r.s.ppcExpiry), r.s.status || 'Active', util.round2(r.spend), r.issues.join('; ')])), widths: [36, 14, 14, 12, 10, 12, 10, 14, 40], dateCols: [3, 5], moneyCols: [7] }]);
    ui.table(box.querySelector('#cpT'), {
      rows, pageSize: 25, initialSort: { key: 'sev', dir: -1 }, search: r => [r.s.name, r.s.trn, r.issues.join(' ')].join(' '), onRow: r => Proc.router.go('suppliers/' + r.s.id),
      empty: ui.empty('shield', st.all ? 'No suppliers yet' : 'No compliance issues', st.all ? '' : 'Every supplier used this year has current documents on file.'),
      columns: [{ key: 'name', label: 'Supplier', sort: r => r.s.name, render: r => '<div class="t-title">' + esc(r.s.name) + '</div><div class="t-sub">' + (r.s.trn ? 'TRN ' + esc(r.s.trn) : 'No TRN') + '</div>' },
        { key: 'tcc', label: 'Tax Compliance Certificate', sort: r => r.s.tccExpiry || '', render: r => stateCell(r.tcc, r.s.tccExpiry) },
        { key: 'ppc', label: 'PPC registration', sort: r => r.s.ppcExpiry || '', render: r => stateCell(r.ppc, r.s.ppcExpiry) },
        { key: 'spend', label: 'FY spend', cls: 'num', sort: r => r.spend, render: r => util.money(r.spend, { noCents: true }) },
        { key: 'sev', label: 'Issues', sort: r => r.severity * 1e12 + r.spend, render: r => (r.issues.length ? r.issues.map(i => ui.badge(i, /expired|Debarred|Suspended/.test(i) ? 'danger' : 'warning')).join(' ') : ui.badge('OK', 'success')) }]
    });
  }

  /* Payables aging -------------------------------------------------------- */
  const BUCKETS = [{ k: 'cur', l: 'Not yet due' }, { k: 'b30', l: '1–30 days' }, { k: 'b60', l: '31–60 days' }, { k: 'b90', l: '61–90 days' }, { k: 'b90p', l: 'Over 90 days' }];
  function agingRows() {
    return store.list('invoices').filter(i => i.status !== 'Paid').map(i => {
      const due = i.dueDate || (i.date ? util.addDays(i.date, 30) : util.today());
      const late = util.daysBetween(due, util.today());
      const b = late <= 0 ? 'cur' : late <= 30 ? 'b30' : late <= 60 ? 'b60' : late <= 90 ? 'b90' : 'b90p';
      return { inv: i, due, late, bucket: b, total: i.total || i.amount || 0 };
    });
  }
  Proc.agingRows = agingRows;
  function drawAging(box) {
    const rows = agingRows();
    const bySup = {};
    rows.forEach(r => { const k = r.inv.supplierId || '—'; const s = bySup[k] = bySup[k] || { id: k, total: 0, n: 0 }; s.total += r.total; s.n++; s[r.bucket] = (s[r.bucket] || 0) + r.total; });
    const sups = Object.values(bySup).sort((a, b) => b.total - a.total);
    const tot = k => util.sum(rows.filter(r => r.bucket === k), r => r.total);
    box.innerHTML = '<div class="grid c4">' + ui.kpi({ label: 'Outstanding invoices', icon: 'receipt', value: util.moneyShort(util.sum(rows, r => r.total)), title: util.money(util.sum(rows, r => r.total)), meta: rows.length + ' invoices', href: '#/invoices' }) +
      ui.kpi({ label: 'Overdue', icon: 'alert', value: util.moneyShort(util.sum(rows.filter(r => r.late > 0), r => r.total)), meta: rows.filter(r => r.late > 0).length + ' invoices', tone: rows.some(r => r.late > 0) ? 'bad' : 'ok' }) +
      ui.kpi({ label: 'Over 60 days', icon: 'clock', value: util.moneyShort(tot('b90') + tot('b90p')), tone: tot('b90') + tot('b90p') ? 'warn' : 'ok' }) +
      ui.kpi({ label: 'Suppliers owed', icon: 'building', value: util.int(sups.length) }) + '</div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>Aging by supplier</h3><div class="sub">Days past the due date (invoice date + 30 days when no due date is recorded).</div></div><button class="btn sm rp-noprint" id="agExport"' + (rows.length ? '' : ' disabled') + '>' + ui.icon('download', 'sm') + 'Export</button></div><div class="card-b flush" id="agSup"></div></div>' +
      '<div class="card mt-3"><div class="card-h"><h3>Outstanding invoices</h3></div><div class="card-b flush" id="agInv"></div></div>';
    const cols = BUCKETS.map(b => ({ key: b.k, label: b.l, cls: 'num', render: r => (r[b.k] ? util.money(r[b.k]) : '<span class="muted">—</span>') }));
    ui.table(box.querySelector('#agSup'), {
      rows: sups, search: r => domain.supplierName(r.id, r.id), pageSize: 20, initialSort: { key: 'total', dir: -1 }, onRow: r => r.id !== '—' && Proc.router.go('suppliers/' + r.id),
      empty: ui.empty('wallet', 'Nothing outstanding', 'All recorded invoices are paid.'),
      columns: [{ key: 'id', label: 'Supplier', sort: r => domain.supplierName(r.id, r.id), render: r => '<span class="t-title">' + esc(domain.supplierName(r.id, 'Unknown supplier')) + '</span><div class="t-sub">' + r.n + ' ' + util.plural(r.n, 'invoice') + '</div>' }]
        .concat(cols).concat([{ key: 'total', label: 'Total', cls: 'num strong', render: r => util.money(r.total) }]),
      footer: () => '<td>Total</td>' + BUCKETS.map(b => '<td class="num">' + util.money(tot(b.k)) + '</td>').join('') + '<td class="num">' + util.money(util.sum(rows, r => r.total)) + '</td>'
    });
    ui.table(box.querySelector('#agInv'), {
      rows, pageSize: 20, initialSort: { key: 'late', dir: -1 }, search: r => [r.inv.invoiceNumber, domain.supplierName(r.inv.supplierId)].join(' '), onRow: r => Proc.router.go('invoices/' + r.inv.id),
      empty: ui.empty('receipt', 'No outstanding invoices', ''),
      columns: [{ key: 'num', label: 'Invoice', sort: r => r.inv.invoiceNumber, render: r => '<span class="strong">' + esc(r.inv.invoiceNumber || '—') + '</span><div class="t-sub">' + util.date(r.inv.date) + '</div>' },
        { key: 'sup', label: 'Supplier', sort: r => domain.supplierName(r.inv.supplierId), render: r => esc(domain.supplierName(r.inv.supplierId, '—')) },
        { key: 'due', label: 'Due', render: r => util.date(r.due) }, { key: 'late', label: 'Days overdue', cls: 'num', render: r => (r.late > 0 ? '<span class="text-danger strong">' + r.late + '</span>' : '<span class="muted">—</span>') },
        { key: 'status', label: 'Status', sort: r => r.inv.status, render: r => ui.badge(r.late > 0 ? 'Overdue' : r.inv.status) }, { key: 'total', label: 'Amount', cls: 'num', render: r => util.money(r.total) }]
    });
    box.querySelector('#agExport').onclick = () => exportBook('Payables aging ' + util.today() + '.xlsx', [
      { name: 'By supplier', aoa: [['Supplier'].concat(BUCKETS.map(b => b.l)).concat(['Total'])].concat(sups.map(s => [domain.supplierName(s.id, s.id)].concat(BUCKETS.map(b => util.round2(s[b.k] || 0))).concat([util.round2(s.total)]))), widths: [36, 14, 14, 14, 14, 14, 16], moneyCols: [1, 2, 3, 4, 5, 6] },
      { name: 'Invoices', aoa: [['Invoice #', 'Supplier', 'Invoice date', 'Due date', 'Days overdue', 'Status', 'Amount']].concat(rows.map(r => [r.inv.invoiceNumber, domain.supplierName(r.inv.supplierId), serial(r.inv.date), serial(r.due), Math.max(0, r.late), r.inv.status, util.round2(r.total)])), widths: [14, 36, 12, 12, 10, 12, 16], dateCols: [2, 3], moneyCols: [6] }]);
  }

  /* Procurement plan ------------------------------------------------------ */
  const STOP = new Set(['WITH', 'FROM', 'THAT', 'THIS', 'UNIT', 'UNITS', 'SUPPLY', 'SUPPLIES', 'PROCUREMENT', 'MAINTENANCE', 'SERVICE', 'SERVICES', 'REPAIRS', 'REPAIR', 'INSTALLATION', 'LIMITED', 'YEAR']);
  function planMatches(item, pos) {
    const toks = String(item.description || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length >= 4 && !STOP.has(t));
    if (!toks.length) return [];
    return pos.filter(p => { const d = (p.description + ' ' + (p.supplierName || '')).toUpperCase(); return toks.every(t => d.indexOf(t) >= 0); });
  }
  function drawPlan(box) {
    const plans = store.list('plans');
    const fys = Array.from(new Set(plans.map(p => p.fy))).sort().reverse();
    const st = drawPlan.st = drawPlan.st || { fy: fys[0] || util.fiscalYear(util.today()) };
    if (fys.length && fys.indexOf(st.fy) < 0) st.fy = fys[0];
    const items = plans.filter(p => p.fy === st.fy);
    if (!plans.length) { box.innerHTML = '<div class="card">' + ui.empty('calendar', 'No procurement plan loaded', 'Import your annual procurement plan workbook (WORKS, EQUIPMENT, SERVICES…) to track it against actual purchases.', '<a class="btn primary" href="#/import">' + ui.icon('upload', 'sm') + 'Import plan</a>') + '</div>'; return; }
    const r = util.fyRange(st.fy);
    const fyPos = active().filter(p => inRange(p.date, r));
    const typeOf = cat => (/WORK/i.test(cat) ? 'Works' : /SERVICE/i.test(cat) ? 'Services' : 'Goods');
    const cats = util.groupBy(items, p => p.category);
    const catRows = Object.keys(cats).map(c => {
      const planned = util.sum(cats[c], p => p.estimate);
      const matched = cats[c].map(p => planMatches(p, fyPos)).reduce((a, b) => a.concat(b), []);
      const uniq = Array.from(new Set(matched.map(p => p.id))).map(id => fyPos.find(p => p.id === id));
      return { c, n: cats[c].length, planned, matched: util.sum(uniq, p => p.total), typeActual: util.sum(fyPos.filter(p => p.type === typeOf(c)), p => p.total) };
    }).sort((a, b) => b.planned - a.planned);
    const qs = util.groupBy(items, p => p.quarter || '—');
    const total = util.sum(items, p => p.estimate);
    const started = util.today() >= r.start;
    box.innerHTML = '<div class="row between mb-2"><div class="rp-period rp-noprint"><select id="plnFy">' + ui.options(fys.map(f => ({ value: f, label: 'Plan FY ' + f })), st.fy) + '</select></div>' +
      '<button class="btn rp-noprint" id="plnExport">' + ui.icon('download', 'sm') + 'Export plan</button></div>' +
      (started ? '' : '<div class="alert mb-2">' + ui.icon('info') + '<div>FY ' + esc(st.fy) + ' starts on ' + util.dateLong(r.start) + '. Actual purchases will be matched against this plan as purchase orders are raised.</div></div>') +
      '<div class="rp-k5">' + ui.kpi({ label: 'Planned value', icon: 'calendar', value: util.moneyShort(total), title: util.money(total), meta: items.length + ' planned procurements' }) +
      ['Q1', 'Q2', 'Q3', 'Q4'].map(q => ui.kpi({ label: q + ' planned', icon: 'clock', value: util.moneyShort(util.sum(qs[q] || [], p => p.estimate)), meta: (qs[q] || []).length + ' items' })).join('') + '</div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>Plan vs actual by category</h3><div class="sub">“Matched” = purchase orders whose description matches a plan item; “Type total” = all FY purchase orders of that procurement type.</div></div></div><div class="card-b flush"><div class="table-wrap"><table class="table"><thead><tr><th>Category</th><th class="num">Items</th><th class="num">Planned</th><th class="num">Matched POs</th><th class="num">Type total (FY)</th><th style="width:180px">Progress</th></tr></thead><tbody>' +
      catRows.map(x => '<tr><td class="strong">' + esc(x.c) + '</td><td class="num">' + x.n + '</td><td class="num">' + util.money(x.planned, { noCents: true }) + '</td><td class="num">' + util.money(x.matched, { noCents: true }) + '</td><td class="num">' + util.money(x.typeActual, { noCents: true }) + '</td><td><div class="progress"><div style="width:' + Math.min(100, pct(x.matched, x.planned)) + '%"></div></div><div class="t-sub">' + pct(x.matched, x.planned) + '% of plan matched</div></td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="num">' + items.length + '</td><td class="num">' + util.money(total, { noCents: true }) + '</td><td class="num">' + util.money(util.sum(catRows, x => x.matched), { noCents: true }) + '</td><td></td><td></td></tr></tfoot></table></div></div></div>' +
      '<div class="card mt-3"><div class="card-h"><h3>Planned procurements</h3></div><div class="card-b flush" id="plnT"></div></div>';
    box.querySelector('#plnFy').onchange = e => { st.fy = e.target.value; drawPlan(box); };
    box.querySelector('#plnExport').onclick = () => exportBook('Procurement plan FY ' + st.fy.replace('/', '-') + '.xlsx', [{ name: 'Plan', aoa: [['Category', 'Quarter', 'Item description', 'Facility', 'Quantity', 'Source', 'Estimated cost', 'Month needed', 'Method', 'Advertisement', 'Submission of bids', 'Bid evaluation', 'Final approval', 'Award of contract', 'Delivery', 'Matched POs']]
      .concat(items.map(p => [p.category, p.quarter, p.description, p.facility, p.qty, p.source, p.estimate, p.monthNeeded, p.methodCode || p.method].concat(['advertisement', 'submission', 'evaluation', 'approval', 'award', 'delivery'].map(k => { const v = (p.milestones || {})[k]; return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? serial(v) : (v || ''); })).concat([planMatches(p, fyPos).map(x => x.poNumber).join(', ')]))),
      widths: [22, 8, 44, 8, 10, 10, 16, 18, 10, 12, 12, 12, 12, 12, 12, 18], moneyCols: [6], dateCols: [9, 10, 11, 12, 13, 14], fromRow: 1 }]);
    ui.table(box.querySelector('#plnT'), {
      rows: items, pageSize: 25, search: p => [p.description, p.category, p.methodCode, p.quarter].join(' '),
      filters: [{ key: 'category', label: 'All categories', options: Object.keys(cats) }, { key: 'quarter', label: 'All quarters', options: Object.keys(qs).sort() }],
      columns: [{ key: 'quarter', label: 'Qtr' }, { key: 'description', label: 'Item', render: p => '<div class="t-title">' + esc(p.description) + '</div><div class="t-sub">' + esc(p.category) + (p.qty ? ' · qty ' + esc(p.qty) : '') + '</div>' },
        { key: 'method', label: 'Method', render: p => esc(p.method || p.methodCode || '—') }, { key: 'monthNeeded', label: 'Needed' },
        { key: 'estimate', label: 'Estimate', cls: 'num', render: p => util.money(p.estimate, { noCents: true }) },
        { key: 'level', label: 'Approval level', sort: false, render: p => '<span class="small">' + esc(domain.approvalLevel(p.estimate)) + '</span>' },
        { key: 'match', label: 'Status', sort: p => planMatches(p, fyPos).length, render: p => { const m = planMatches(p, fyPos); return m.length ? ui.badge('PO ' + m.map(x => x.poNumber).slice(0, 2).join(', '), 'success') : ui.badge(started ? 'Not started' : 'Planned', started ? 'warning' : 'info'); } }],
      footer: rows => '<td colspan="4">Total</td><td class="num">' + util.money(util.sum(rows, p => p.estimate), { noCents: true }) + '</td><td colspan="2"></td>'
    });
  }

  Proc.page({ id: 'reports', title: 'Reports & PRS', icon: 'chart', section: 'Insights', order: 10, render });
  Proc.quickCreate.push({ label: 'PRS monthly return', icon: 'sheet', order: 80, onClick: () => { location.hash = '#/reports?tab=prs'; } });
  Proc.reports = { prsData, prsRow, exportPRS, missingFields, PRS_THRESHOLD };
})();
