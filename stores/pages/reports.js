/* General Stores — Reports: valuation, movements, consumption, expiry, slow-moving,
   GRN register, supplier delivery performance, outstanding purchase orders.
   Every report exports to Excel and prints on the letterhead. */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc;
  const C = Proc.storesC;

  const REPORTS = [
    { id: 'valuation', label: 'Stock valuation', icon: 'wallet', period: false },
    { id: 'movement', label: 'Stock movement', icon: 'refresh', period: true },
    { id: 'consumption', label: 'Consumption by department', icon: 'chart', period: true },
    { id: 'expiry', label: 'Expiry', icon: 'clock', period: false, days: 90 },
    { id: 'slow', label: 'Slow / non-moving', icon: 'history', period: false, days: 90 },
    { id: 'grn', label: 'GRN register', icon: 'truck', period: true },
    { id: 'suppliers', label: 'Supplier delivery performance', icon: 'award', period: true },
    { id: 'outstanding', label: 'Outstanding purchase orders', icon: 'cart', period: false }
  ];
  const fyStart = () => util.fyRange(util.fiscalYear(util.today())).start;
  const monthStart = d => d.slice(0, 8) + '01';
  const PRESETS = [
    ['month', 'This month', () => [monthStart(util.today()), util.today()]],
    ['last', 'Last month', () => { const d = new Date(); d.setDate(0); const e = util.toISODate(d); return [monthStart(e), e]; }],
    ['30', 'Last 30 days', () => [util.addDays(util.today(), -29), util.today()]],
    ['fy', 'This fiscal year', () => [fyStart(), util.today()]],
    ['all', 'All time', () => ['2000-01-01', util.today()]]
  ];
  const state = { from: '', to: '', preset: 'month', days: {} };
  const inPeriod = (d, f, t) => d && d >= f && d <= t;
  const MONEY = 'money', NUM = 'num';

  /* ------------------------------------------------------------ builders
     Each returns { columns: [{ key, label, type }], rows: [ {…} ], totals: { key: value }, note, chart } */
  const build = {
    valuation() {
      const items = C.items();
      const rows = items.map(i => ({ code: i.code, name: i.name, category: i.category || 'General', location: i.location || '', unit: i.unit || '', onHand: util.num(i.onHand), avgCost: util.num(i.avgCost), value: util.num(i.value), state: domain.stockState(i).label }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      const byCat = util.groupBy(rows, r => r.category);
      return { columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'location', label: 'Location' }, { key: 'unit', label: 'Unit' }, { key: 'onHand', label: 'On hand', type: NUM }, { key: 'avgCost', label: 'Avg cost', type: MONEY }, { key: 'value', label: 'Value', type: MONEY }, { key: 'state', label: 'Status' }],
        rows, totals: { value: util.sum(rows, r => r.value), onHand: util.sum(rows, r => r.onHand) }, note: 'As at ' + util.dateLong(util.today()) + ' at weighted average cost.',
        chart: Object.keys(byCat).map(k => ({ label: k, value: util.sum(byCat[k], r => r.value) })).sort((a, b) => b.value - a.value) };
    },
    movement(f, t) {
      const moves = store.list('stockMoves');
      const by = util.groupBy(moves, m => m.itemId);
      const rows = C.items().map(i => {
        const ms = by[i.id] || [];
        const open = util.sum(ms.filter(m => m.date < f), m => m.qty);
        const p = ms.filter(m => inPeriod(m.date, f, t));
        const rec = util.sum(p.filter(m => m.qty > 0 && (m.type === 'Receipt' || m.type === 'Opening')), m => m.qty);
        const iss = -util.sum(p.filter(m => m.type === 'Issue'), m => m.qty);
        const adj = util.sum(p.filter(m => m.type !== 'Issue' && !(m.qty > 0 && (m.type === 'Receipt' || m.type === 'Opening'))), m => m.qty);
        const close = util.round2(open + rec - iss + adj);
        return { code: i.code, name: i.name, unit: i.unit || '', opening: util.round2(open), receipts: util.round2(rec), issues: util.round2(iss), adjustments: util.round2(adj), closing: close, closingValue: util.round2(close * util.num(i.avgCost)) };
      }).filter(r => r.opening || r.receipts || r.issues || r.adjustments || r.closing);
      return { columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'opening', label: 'Opening', type: NUM }, { key: 'receipts', label: 'Received', type: NUM }, { key: 'issues', label: 'Issued', type: NUM }, { key: 'adjustments', label: 'Adjust / returns', type: NUM }, { key: 'closing', label: 'Closing', type: NUM }, { key: 'closingValue', label: 'Closing value', type: MONEY }],
        rows, totals: { closingValue: util.sum(rows, r => r.closingValue) }, note: 'Quantities from the bin cards (stock movements) for ' + util.date(f) + ' – ' + util.date(t) + '. Closing value at current average cost.' };
    },
    consumption(f, t) {
      const iss = store.list('stockMoves').filter(m => m.type === 'Issue' && inPeriod(m.date, f, t));
      const by = util.groupBy(iss, m => m.department || 'Unspecified');
      const rows = Object.keys(by).map(d => {
        const ms = by[d]; const byItem = util.groupBy(ms, m => m.itemName);
        const top = Object.keys(byItem).map(k => ({ k, v: Math.abs(util.sum(byItem[k], m => m.value)) })).sort((a, b) => b.v - a.v).slice(0, 3).map(x => x.k).join(', ');
        return { department: d, issues: new Set(ms.map(m => m.issueId || m.id)).size, lines: ms.length, items: Object.keys(byItem).length, value: util.round2(Math.abs(util.sum(ms, m => m.value))), top };
      }).sort((a, b) => b.value - a.value);
      return { columns: [{ key: 'department', label: 'Department' }, { key: 'issues', label: 'Vouchers', type: NUM }, { key: 'lines', label: 'Lines', type: NUM }, { key: 'items', label: 'Different items', type: NUM }, { key: 'value', label: 'Value issued', type: MONEY }, { key: 'top', label: 'Largest items' }],
        rows, totals: { value: util.sum(rows, r => r.value), lines: util.sum(rows, r => r.lines) }, note: 'Issues ' + util.date(f) + ' – ' + util.date(t) + ' at cost.', chart: rows.slice(0, 10).map(r => ({ label: r.department, value: r.value })) };
    },
    expiry(f, t, days) {
      const rows = C.expiring(days).map(x => ({ code: x.item.code, name: x.item.name, batch: x.batch.batchNo || '—', expiry: x.batch.expiryDate, daysLeft: x.daysLeft, status: x.daysLeft < 0 ? 'Expired' : x.daysLeft <= 30 ? 'Under 30 days' : 'Within ' + days + ' days', qty: util.num(x.batch.qty), unit: x.item.unit || '', value: x.value, location: x.item.location || '' }));
      return { columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' }, { key: 'batch', label: 'Batch' }, { key: 'expiry', label: 'Expiry', type: 'date' }, { key: 'daysLeft', label: 'Days left', type: NUM }, { key: 'status', label: 'Status' }, { key: 'qty', label: 'Qty', type: NUM }, { key: 'unit', label: 'Unit' }, { key: 'location', label: 'Location' }, { key: 'value', label: 'Value', type: MONEY }],
        rows, totals: { value: util.sum(rows, r => r.value) }, note: 'Batches expired or expiring within ' + days + ' days. Issue earliest expiry first; write off or return expired stock.' };
    },
    slow(f, t, days) {
      const today = util.today();
      const rows = C.items().filter(i => util.num(i.onHand) > 0).map(i => {
        const last = i.lastIssued || '';
        const idle = last ? util.daysBetween(last, today) : (i.lastReceived ? util.daysBetween(i.lastReceived, today) : null);
        return { code: i.code, name: i.name, category: i.category || '', onHand: util.num(i.onHand), unit: i.unit || '', value: util.num(i.value), lastIssued: last, lastReceived: i.lastReceived || '', idle: idle === null ? 9999 : idle };
      }).filter(r => r.idle >= days).sort((a, b) => b.value - a.value);
      return { columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'onHand', label: 'On hand', type: NUM }, { key: 'unit', label: 'Unit' }, { key: 'value', label: 'Value', type: MONEY }, { key: 'lastIssued', label: 'Last issued', type: 'date' }, { key: 'lastReceived', label: 'Last received', type: 'date' }, { key: 'idle', label: 'Days idle', type: NUM }],
        rows, totals: { value: util.sum(rows, r => r.value) }, note: 'Items in stock with no issue in ' + days + ' days or more (never issued: counted from last receipt). Consider redeploying or stopping reorders.' };
    },
    grn(f, t) {
      const rows = store.list('deliveries').filter(d => inPeriod(d.date, f, t) && !d.voided).map(d => {
        const po = store.get('purchaseOrders', d.poId) || {}; const its = d.items || [];
        const lines = domain.poLines(po);
        const val = util.sum(its, i => util.num(i.qtyReceived) * util.num(i.unitCost !== undefined && i.unitCost !== '' ? i.unitCost : (typeof i.lineIndex === 'number' && lines[i.lineIndex] ? lines[i.lineIndex].unitPrice : 0)));
        return { grn: d.grn || '—', date: d.date, po: po.poNumber || '—', supplier: po.supplierName || domain.supplierName(d.supplierId), lines: its.length, received: util.sum(its, i => i.qtyReceived), rejected: util.num(d.rejectedQty) || util.sum(its, i => i.qtyRejected), value: util.round2(val), by: d.receivedBy || '', where: d.recordedIn === 'procurement' ? (d.stocked ? 'Procurement · stocked' : 'Procurement · to put away') : 'Stores', status: d.final || !d.partial ? 'Complete' : 'Partial', _id: d.id };
      }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return { columns: [{ key: 'grn', label: 'GRN' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'po', label: 'PO' }, { key: 'supplier', label: 'Supplier' }, { key: 'lines', label: 'Lines', type: NUM }, { key: 'received', label: 'Qty received', type: NUM }, { key: 'rejected', label: 'Rejected', type: NUM }, { key: 'value', label: 'Value', type: MONEY }, { key: 'status', label: 'Delivery' }, { key: 'where', label: 'Recorded in' }, { key: 'by', label: 'Received by' }],
        rows, totals: { value: util.sum(rows, r => r.value), received: util.sum(rows, r => r.received) }, note: 'Goods received ' + util.date(f) + ' – ' + util.date(t) + '.', link: r => '#/grn/' + r._id };
    },
    suppliers(f, t) {
      const dels = store.list('deliveries').filter(d => inPeriod(d.date, f, t) && !d.voided);
      const by = util.groupBy(dels, d => { const po = store.get('purchaseOrders', d.poId) || {}; return po.supplierId || d.supplierId || po.supplierName || '?'; });
      const rows = Object.keys(by).map(k => {
        const ds = by[k]; const po0 = store.get('purchaseOrders', ds[0].poId) || {};
        let onTime = 0, late = 0, lateDays = 0;
        ds.forEach(d => { const po = store.get('purchaseOrders', d.poId); if (!po) return; const dl = util.daysBetween(domain.expectedDate(po), d.date); if (dl > 0) { late++; lateDays += dl; } else onTime++; });
        const rej = util.sum(ds, d => util.num(d.rejectedQty) || util.sum(d.items || [], i => i.qtyRejected));
        const rec = util.sum(ds, d => util.sum(d.items || [], i => i.qtyReceived));
        return { supplier: po0.supplierName || domain.supplierName(k, k), deliveries: ds.length, pos: new Set(ds.map(d => d.poId)).size, onTime, late, onTimePct: ds.length ? Math.round(onTime / ds.length * 100) : 0, avgLate: late ? util.round2(lateDays / late) : 0, partial: ds.filter(d => d.partial && !d.final).length, rejected: rej, rejectPct: rec + rej ? util.round2(rej / (rec + rej) * 100) : 0 };
      }).sort((a, b) => b.deliveries - a.deliveries);
      return { columns: [{ key: 'supplier', label: 'Supplier' }, { key: 'pos', label: 'POs', type: NUM }, { key: 'deliveries', label: 'Deliveries', type: NUM }, { key: 'onTime', label: 'On time', type: NUM }, { key: 'late', label: 'Late', type: NUM }, { key: 'onTimePct', label: 'On-time %', type: 'pct' }, { key: 'avgLate', label: 'Avg days late', type: NUM }, { key: 'partial', label: 'Part deliveries', type: NUM }, { key: 'rejected', label: 'Qty rejected', type: NUM }, { key: 'rejectPct', label: 'Reject %', type: 'pct' }],
        rows, totals: {}, note: 'On time = delivered on or before the expected date (PO expected date, or PO date + ' + (C.S().leadDays || 14) + ' days lead time).' };
    },
    outstanding() {
      const statusCache = {};
      const rows = domain.inbound().map(r => {
        const ls = statusCache[r.po.id] = statusCache[r.po.id] || (domain.lineStatus ? domain.lineStatus(r.po) : []);
        return { po: r.po.poNumber, poDate: r.po.date, supplier: r.po.supplierName || '', item: r.line.description, type: r.type, ordered: r.ordered, received: r.received, outstanding: r.outstanding, value: util.round2(r.outstanding * util.num(r.line.unitPrice)), expected: r.expected, daysLate: r.daysLate, status: (ls[r.index] && ls[r.index].label) || (r.received ? 'Part delivered' : 'On order'), _po: r.po.id };
      }).sort((a, b) => b.daysLate - a.daysLate || (a.expected || '').localeCompare(b.expected || ''));
      return { columns: [{ key: 'po', label: 'PO' }, { key: 'poDate', label: 'PO date', type: 'date' }, { key: 'supplier', label: 'Supplier' }, { key: 'item', label: 'Item' }, { key: 'type', label: 'Type' }, { key: 'ordered', label: 'Ordered', type: NUM }, { key: 'received', label: 'Received', type: NUM }, { key: 'outstanding', label: 'Outstanding', type: NUM }, { key: 'value', label: 'Value due', type: MONEY }, { key: 'expected', label: 'Expected', type: 'date' }, { key: 'daysLate', label: 'Days late', type: NUM }, { key: 'status', label: 'Status' }],
        rows, totals: { value: util.sum(rows, r => r.value) }, note: 'Goods lines (stock and assets) on issued purchase orders not yet fully received.', link: r => '#/inbound?po=' + r._po };
    }
  };

  const fmt = (c, v) => {
    if (v === null || v === undefined || v === '') return '';
    if (c.type === MONEY) return util.money(v);
    if (c.type === NUM) return v === 9999 ? 'never' : util.int(util.round2(v));
    if (c.type === 'pct') return v + '%';
    if (c.type === 'date') return util.date(v);
    return String(v);
  };

  function render(el) {
    const q = router.parse().query;
    const rep = REPORTS.find(r => r.id === q.tab) || REPORTS[0];
    if (!state.from) { const p = PRESETS[0][2](); state.from = p[0]; state.to = p[1]; }
    const days = state.days[rep.id] || rep.days || 90;
    el.innerHTML = ui.pageHead({ title: 'Reports', sub: 'Stock, movements, consumption and supplier performance — from the bin cards and goods received notes.' }) +
      '<div class="tabs">' + REPORTS.map(r => '<button class="' + (r.id === rep.id ? 'on' : '') + '" data-r="' + r.id + '">' + ui.icon(r.icon, 'sm') + esc(r.label) + '</button>').join('') + '</div>' +
      '<div class="card"><div class="toolbar" style="border-bottom:1px solid var(--border)">' +
      (rep.period ? '<div class="seg">' + PRESETS.map(p => '<button data-p="' + p[0] + '" class="' + (state.preset === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div><input type="date" class="input sm" style="width:150px" data-from value="' + state.from + '"><span class="muted">to</span><input type="date" class="input sm" style="width:150px" data-to value="' + state.to + '">' : '') +
      (rep.days ? '<label class="small muted">Days</label><input type="number" class="input sm" style="width:90px" min="1" data-days value="' + days + '">' : '') +
      '<div class="spacer"></div><button class="btn sm" data-x>' + ui.icon('download', 'sm') + 'Excel</button><button class="btn sm" data-print>' + ui.icon('printer', 'sm') + 'Print</button></div>' +
      '<div class="card-b" id="rpHead"></div><div id="rpT"></div></div>';
    el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { location.hash = '#/reports?tab=' + b.dataset.r; });
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const p = PRESETS.find(x => x[0] === b.dataset.p)[2](); state.from = p[0]; state.to = p[1]; state.preset = b.dataset.p; render(el); });
    const fi = el.querySelector('[data-from]'), ti = el.querySelector('[data-to]');
    if (fi) fi.onchange = () => { state.from = fi.value || state.from; state.preset = ''; render(el); };
    if (ti) ti.onchange = () => { state.to = ti.value || state.to; state.preset = ''; render(el); };
    const di = el.querySelector('[data-days]'); if (di) di.onchange = () => { state.days[rep.id] = Math.max(1, util.num(di.value) || rep.days); render(el); };
    const r = build[rep.id](state.from, state.to, days);
    const totalCells = Object.keys(r.totals || {});
    el.querySelector('#rpHead').innerHTML = '<div class="row between"><div><div class="strong">' + esc(rep.label) + '</div><div class="small muted">' + esc(r.note || '') + '</div></div><div class="row gap-3">' +
      '<div class="right"><div class="small muted">Rows</div><div class="strong">' + util.int(r.rows.length) + '</div></div>' + totalCells.filter(k => r.columns.find(c => c.key === k && c.type === MONEY)).map(k => '<div class="right"><div class="small muted">' + esc(r.columns.find(c => c.key === k).label) + '</div><div class="money-big" style="font-size:20px">' + util.money(r.totals[k]) + '</div></div>').join('') + '</div></div>' +
      (r.chart && r.chart.length ? '<div class="mt-3" style="max-width:720px">' + ui.hbars(r.chart.slice(0, 10)) + '</div>' : '');
    ui.table(el.querySelector('#rpT'), {
      rows: r.rows, pageSize: 50, compact: true, placeholder: 'Search this report…',
      search: row => r.columns.map(c => row[c.key]).join(' '),
      onRow: r.link ? (row => { location.hash = r.link(row); }) : null,
      columns: r.columns.map(c => ({ key: c.key, label: c.label, cls: c.type === MONEY || c.type === NUM || c.type === 'pct' ? 'num' : '', sort: row => row[c.key],
        render: row => c.key === 'status' || c.key === 'state' ? statusChip(row[c.key]) : (c.key === r.columns[0].key || c.key === 'name' || c.key === 'department' || c.key === 'supplier' ? '<span class="t-title">' + esc(fmt(c, row[c.key])) + '</span>' : esc(fmt(c, row[c.key]))) })),
      footer: totalCells.length ? (() => r.columns.map((c, i) => '<td class="' + (c.type === MONEY || c.type === NUM ? 'num' : '') + '">' + (i === 0 ? 'Total' : r.totals[c.key] !== undefined ? esc(fmt(c, r.totals[c.key])) : '') + '</td>').join('')) : null,
      empty: ui.empty('chart', 'Nothing to report', rep.period ? 'No records in this period.' : 'No records yet.')
    });
    el.querySelector('[data-x]').onclick = () => {
      const rows = r.rows.map(row => { const o = {}; r.columns.forEach(c => { const v = row[c.key]; o[c.label] = c.type === MONEY || c.type === NUM || c.type === 'pct' ? (v === 9999 ? '' : v) : (c.type === 'date' ? (v || '') : v); }); return o; });
      C.excel([{ name: rep.label, cols: r.columns.map(c => c.type ? 13 : c.key === 'name' || c.key === 'item' ? 40 : 20), rows }], rep.label + (rep.period ? ' ' + state.from + ' to ' + state.to : ' ' + util.today()) + '.xlsx');
      Proc.audit('Export Report', rep.label);
    };
    el.querySelector('[data-print]').onclick = () => printReport(rep, r);
  }
  function statusChip(s) {
    const tone = { Expired: 'danger', 'Under 30 days': 'warning', 'Out of stock': 'danger', Reorder: 'warning', Overstocked: 'info', 'In stock': 'success', Complete: 'success', Partial: 'warning', 'Part delivered': 'warning', 'On order': 'info', 'In stock ': 'success', Registered: 'success', 'Delivered — to register': 'purple', 'Delivered — to put away': 'purple' }[s];
    return ui.badge(s, tone === undefined ? '' : tone);
  }

  function printReport(rep, r) {
    const kit = Proc.pdf && Proc.pdf.kit; if (!kit) return ui.toast('The PDF engine is not loaded.', 'warning');
    try {
      const land = r.columns.length > 7;
      const doc = kit.newDoc(land ? 'landscape' : 'portrait'); const { w } = kit.pageSize(doc); const M = 36; let y = kit.top;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor.apply(doc, kit.BLUE); doc.text(kit.clean(rep.label.toUpperCase()), M, y + 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, kit.GREY);
      doc.text(kit.clean((C.S().storeName || 'General Stores') + ' · ' + (rep.period ? util.date(state.from) + ' - ' + util.date(state.to) : 'As at ' + util.date(util.today())) + ' · ' + r.rows.length + ' rows'), M, y + 28);
      if (r.note) doc.text(doc.splitTextToSize(kit.clean(r.note), w - M * 2), M, y + 40);
      const totalsRow = Object.keys(r.totals || {}).length ? [r.columns.map((c, i) => i === 0 ? 'Total' : r.totals[c.key] !== undefined ? kit.clean(fmt(c, r.totals[c.key])) : '')] : [];
      doc.autoTable({ startY: y + 54, margin: { left: M, right: M, top: kit.top, bottom: 84 }, head: [r.columns.map(c => c.label)], body: r.rows.map(row => r.columns.map(c => kit.clean(fmt(c, row[c.key])))), foot: totalsRow,
        styles: { font: 'helvetica', fontSize: land ? 7.4 : 8.2, cellPadding: 3, lineColor: [215, 220, 228], lineWidth: 0.4, textColor: kit.INK, overflow: 'linebreak' },
        headStyles: { fillColor: [234, 241, 247], textColor: kit.INK, fontStyle: 'bold' }, footStyles: { fillColor: [243, 244, 246], textColor: kit.INK, fontStyle: 'bold' },
        columnStyles: r.columns.reduce((o, c, i) => { if (c.type === MONEY || c.type === NUM || c.type === 'pct') o[i] = { halign: 'right' }; return o; }, {}) });
      kit.finish(doc, { side: false });
      doc.setProperties({ title: rep.label });
      return kit.deliver(doc, kit.fileSafe(rep.label) + ' ' + (rep.period ? state.from + ' to ' + state.to : util.today()) + '.pdf', 'open');
    } catch (e) { console.error(e); ui.toast('Could not create the report: ' + e.message, 'error'); }
  }

  Proc.storesC.reportBuilders = build;
  Proc.page({ id: 'reports', title: 'Reports', icon: 'chart', section: 'Insights', order: 10, render });
})();
