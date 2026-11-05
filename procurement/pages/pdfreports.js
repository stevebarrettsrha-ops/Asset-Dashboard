/* Procurement — catalogue for the PDF Reports page (#/pdf-reports).
   Each report is drawn on the letterhead by Proc.reportPdf (procurement/report-pdf.js). */
(function () {
  'use strict';
  if (!Proc.reportPdf) return;
  const { util, store, domain, K } = Proc;

  /* ------------------------------------------------------------ helpers */
  const S = () => store.settings();
  const active = () => store.list('purchaseOrders').filter(p => p.status !== 'Cancelled' && p.status !== 'Draft');
  const inP = (iso, p) => !!iso && iso >= p.from && iso <= p.to;
  const supName = po => po.supplierName || domain.supplierName(po.supplierId) || '—';
  const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);
  const asAt = p => p.asAt || util.today();
  const num = v => util.num(v);
  function rollup(list, keyFn, valFn) {
    const m = {};
    list.forEach(x => { const k = keyFn(x) || '(not recorded)'; const r = m[k] = m[k] || { key: k, n: 0, v: 0 }; r.n++; r.v += num(valFn ? valFn(x) : x.total); });
    return Object.values(m).sort((a, b) => b.v - a.v);
  }
  const shareRows = (rows, total, label) => rows.map(r => [label ? label(r.key) : r.key, r.n, util.round2(r.v), pct(r.v, total)]);
  const shareCols = label => [{ label }, { label: 'POs', type: 'num', width: 50 }, { label: 'Value', type: 'money', width: 100 }, { label: 'Share', type: 'pct', width: 56 }];
  const shareTotal = (rows, total) => [['Total', util.sum(rows, r => r.n), util.round2(total), rows.length ? 100 : 0]];

  const suppliersOpt = () => store.list('suppliers').filter(s => s.status !== 'Inactive').sort((a, b) => String(a.name).localeCompare(String(b.name))).map(s => [s.id, s.name]);
  const deptsOpt = () => {
    const s = new Set();
    store.list('purchaseOrders').forEach(p => { if (p.department) s.add(p.department); });
    store.list('requisitions').forEach(r => { if (r.department) s.add(r.department); });
    return Array.from(s).sort().map(d => [d, d]);
  };
  const methodsOpt = () => {
    const s = new Set(K.METHODS || []);
    store.list('purchaseOrders').forEach(p => { if (p.method) s.add(p.method); });
    return Array.from(s).map(m => [m, m]);
  };
  const SUPPLIER = { key: 'supplier', label: 'Supplier', options: suppliersOpt };
  const DEPT = { key: 'department', label: 'Department', options: deptsOpt };
  const METHOD = { key: 'method', label: 'Procurement method', options: methodsOpt };
  const filterPos = (pos, f) => pos.filter(po => (!f.supplier || po.supplierId === f.supplier) && (!f.method || po.method === f.method) && (!f.department || po.department === f.department));

  const poRow = po => [po.poNumber || '—', po.date, supName(po), po.description || '', po.method || '', po.department || '', po.status || '', num(po.total)];
  const poCols = [{ label: 'PO #', width: 58 }, { label: 'Date', type: 'date', width: 58 }, { label: 'Supplier', width: 110 }, { label: 'Description' }, { label: 'Method', width: 76 }, { label: 'Department', width: 74 }, { label: 'Status', width: 58 }, { label: 'Value', type: 'money', width: 78 }];
  const byDate = (a, b) => (a.date || '').localeCompare(b.date || '') || String(a.poNumber || '').localeCompare(String(b.poNumber || ''), undefined, { numeric: true });

  /** Delivery performance per supplier, from goods received notes in the period. */
  function supplierPerf(p) {
    const dels = store.list('deliveries').filter(d => inP(d.date, p) && !d.voided);
    const pos = active().filter(po => inP(po.date, p));
    const keys = new Set(pos.map(po => po.supplierId || po.supplierName));
    const delBy = util.groupBy(dels, d => { const po = store.get('purchaseOrders', d.poId) || {}; return po.supplierId || d.supplierId || po.supplierName || '?'; });
    Object.keys(delBy).forEach(k => keys.add(k));
    return Array.from(keys).filter(Boolean).map(k => {
      const ps = pos.filter(po => (po.supplierId || po.supplierName) === k), ds = delBy[k] || [];
      let onTime = 0, late = 0, lateDays = 0;
      ds.forEach(d => { const po = store.get('purchaseOrders', d.poId); if (!po) return; const dl = util.daysBetween(domain.expectedDate(po), d.date); if (dl > 0) { late++; lateDays += dl; } else onTime++; });
      const rej = util.sum(ds, d => num(d.rejectedQty) || util.sum(d.items || [], i => num(i.qtyRejected)));
      const rec = util.sum(ds, d => util.sum(d.items || [], i => num(i.qtyReceived)));
      const any = ps[0] || store.get('purchaseOrders', (ds[0] || {}).poId) || {};
      return { name: any.supplierName || domain.supplierName(k, k), pos: ps.length, value: util.sum(ps, po => num(po.total)), deliveries: ds.length, onTimePct: onTime + late ? Math.round(onTime / (onTime + late) * 100) : null, avgLate: late ? util.round2(lateDays / late) : 0, rejected: rej, rejectPct: rec + rej ? util.round2(rej / (rec + rej) * 100) : 0 };
    }).sort((a, b) => b.value - a.value || b.deliveries - a.deliveries);
  }

  const STOP = new Set(['WITH', 'FROM', 'THAT', 'THIS', 'UNIT', 'UNITS', 'SUPPLY', 'SUPPLIES', 'PROCUREMENT', 'MAINTENANCE', 'SERVICE', 'SERVICES', 'REPAIRS', 'REPAIR', 'INSTALLATION', 'LIMITED', 'YEAR']);
  function planMatches(item, pos) {
    const toks = String(item.description || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length >= 4 && !STOP.has(t));
    if (!toks.length) return [];
    return pos.filter(po => { const d = ((po.description || '') + ' ' + (po.supplierName || '')).toUpperCase(); return toks.every(t => d.indexOf(t) >= 0); });
  }
  const memoValue = m => util.sum(m.awards || [], a => num(a.amount));

  /* ------------------------------------------------------------ reports */
  const reports = [
    {
      id: 'monthly', group: 'Monthly & annual reporting', title: 'Monthly Procurement Report', icon: 'calendar', period: true,
      desc: 'POs issued, requisitions, approvals, deliveries and payments for the period, by method, department and supplier.',
      build(p) {
        const pos = active().filter(po => inP(po.date, p)).sort(byDate);
        const total = util.sum(pos, po => num(po.total));
        const reqs = store.list('requisitions').filter(r => inP(r.date, p));
        const memos = store.list('memos').filter(m => m.status === 'Approved' && inP((m.decision && m.decision.date) || m.date, p));
        const dels = store.list('deliveries').filter(d => inP(d.date, p) && !d.voided);
        const paid = store.list('invoices').filter(i => i.status === 'Paid' && inP(i.paidDate, p));
        const paidV = util.sum(paid, i => num(i.amountPaid) || num(i.total) || num(i.amount));
        const byMethod = rollup(pos, po => po.method), byDept = rollup(pos, po => po.department), bySup = rollup(pos, po => po.supplierId || po.supplierName);
        const supLabel = k => domain.supplierName(k, k);
        return {
          kpis: [
            { label: 'Purchase orders issued', value: util.int(pos.length), note: util.money(total) },
            { label: 'Requisitions received', value: util.int(reqs.length), note: util.money(util.sum(reqs, r => num(r.estimate))) + ' estimated' },
            { label: 'Approval memos approved', value: util.int(memos.length), note: util.money(util.sum(memos, memoValue)) },
            { label: 'Deliveries received', value: util.int(dels.length), note: new Set(dels.map(d => d.poId)).size + ' POs' },
            { label: 'Invoices paid', value: util.int(paid.length), note: util.money(paidV) },
            { label: 'Suppliers used', value: util.int(bySup.length) },
            { label: 'Average PO value', value: util.money(pos.length ? total / pos.length : 0) },
            { label: 'Largest PO', value: util.money(Math.max.apply(null, [0].concat(pos.map(po => num(po.total))))) }
          ],
          chart: { title: 'Top suppliers by value', money: true, rows: bySup.slice(0, 10).map(r => ({ label: supLabel(r.key), value: r.v })) },
          sections: [
            { title: 'Purchase orders by procurement method', columns: shareCols('Method'), rows: shareRows(byMethod, total), totals: byMethod.length ? shareTotal(byMethod, total) : null, empty: 'No purchase orders in this period.' },
            { title: 'Purchase orders by department', columns: shareCols('Department'), rows: shareRows(byDept, total), totals: byDept.length ? shareTotal(byDept, total) : null, empty: 'No purchase orders in this period.' },
            { title: 'Top 10 suppliers', columns: shareCols('Supplier'), rows: shareRows(bySup.slice(0, 10), total, supLabel), empty: 'No purchase orders in this period.' },
            { title: 'Purchase orders issued', optional: true, columns: poCols, rows: pos.map(poRow), totals: pos.length ? [['Total', '', pos.length + ' POs', '', '', '', '', total]] : null, empty: 'No purchase orders issued in this period.' }
          ],
          notes: ['Purchase orders exclude drafts and cancelled orders. Memos counted on their decision date; invoices on their payment date.']
        };
      }
    },
    {
      id: 'fiscal', group: 'Monthly & annual reporting', title: 'Fiscal Year Report', icon: 'chart', period: true,
      desc: 'Spend by fiscal month (April to March) and by category. Choose "This fiscal year" for the full year.',
      build(p) {
        const pos = active().filter(po => inP(po.date, p));
        const total = util.sum(pos, po => num(po.total));
        const fy = util.fiscalYear(p.from), y = parseInt(fy, 10);
        const months = []; for (let i = 0; i < 12; i++) { const d = new Date(y, 3 + i, 1); months.push(util.toISODate(d).slice(0, 7)); }
        const byM = util.groupBy(pos, po => util.monthKey(po.date));
        let cum = 0;
        const mRows = months.map(mk => { const l = byM[mk] || []; const v = util.sum(l, po => num(po.total)); cum += v; return [util.monthLabel(mk), l.length, new Set(l.map(po => po.supplierId || po.supplierName)).size, util.round2(v), pct(v, total), util.round2(cum)]; });
        const outside = pos.filter(po => months.indexOf(util.monthKey(po.date)) < 0);
        const byCat = rollup(pos, po => po.category || po.type);
        const L = S().limits;
        const bands = [['Under ' + util.money(L.committeeMin, { noCents: true }), 0, L.committeeMin], [util.money(L.committeeMin, { noCents: true }) + ' - ' + util.money(L.delegated, { noCents: true }), L.committeeMin, L.delegated + 0.001], ['Over ' + util.money(L.delegated, { noCents: true }) + ' (Head of Entity)', L.delegated + 0.001, L.ncc + 0.001], ['Over ' + util.money(L.ncc, { noCents: true }) + ' (NCC/PPC)', L.ncc + 0.001, Infinity]];
        const bandRows = bands.map(([l, a, b]) => { const s = pos.filter(po => num(po.total) >= a && num(po.total) < b); return [l, s.length, util.round2(util.sum(s, po => num(po.total))), pct(util.sum(s, po => num(po.total)), total)]; });
        return {
          subtitle: 'Fiscal year ' + fy + ' (April - March)',
          kpis: [{ label: 'Committed spend', value: util.money(total) }, { label: 'Purchase orders', value: util.int(pos.length) }, { label: 'Suppliers used', value: util.int(new Set(pos.map(po => po.supplierId || po.supplierName)).size) }, { label: 'Monthly average', value: util.money(total / (mRows.filter(r => r[1]).length || 1)) }],
          chart: { title: 'Spend by fiscal month', money: true, rows: months.map((mk, i) => ({ label: util.monthLabel(mk), value: mRows[i][3] })) },
          sections: [
            { title: 'Spend by fiscal month', columns: [{ label: 'Month' }, { label: 'POs', type: 'num' }, { label: 'Suppliers', type: 'num' }, { label: 'Value', type: 'money' }, { label: 'Share', type: 'pct' }, { label: 'Year to date', type: 'money' }], rows: pos.length ? mRows : [], totals: pos.length ? [['Total', pos.length, '', util.round2(total), 100, '']] : null, empty: 'No purchase orders in this period.' },
            { title: 'Spend by category', columns: shareCols('Category'), rows: shareRows(byCat, total), totals: byCat.length ? shareTotal(byCat, total) : null, empty: 'No purchase orders in this period.' },
            { title: 'Purchase orders by value band', columns: [{ label: 'Value band' }, { label: 'POs', type: 'num' }, { label: 'Value', type: 'money' }, { label: 'Share', type: 'pct' }], rows: pos.length ? bandRows : [], empty: 'No purchase orders in this period.' }
          ],
          notes: [outside.length ? outside.length + ' purchase order(s) in the chosen period fall outside fiscal year ' + fy + ' and are included in the totals but not the monthly table.' : '', 'Category is the PO category, or its type (Goods / Services / Works) when no category is recorded.']
        };
      }
    },
    {
      id: 'poregister', group: 'Purchasing', title: 'Purchase Order Register', icon: 'cart', period: true, filters: [SUPPLIER, METHOD, DEPT],
      desc: 'Every purchase order in the period with supplier, method, department, status and value.',
      build(p) {
        const pos = filterPos(store.list('purchaseOrders').filter(po => po.status !== 'Draft' && inP(po.date, p)), p.filters).sort(byDate);
        const live = pos.filter(po => po.status !== 'Cancelled');
        const total = util.sum(live, po => num(po.total));
        const byStatus = rollup(pos, po => po.status);
        return {
          kpis: [{ label: 'Purchase orders', value: util.int(live.length), note: pos.length - live.length ? (pos.length - live.length) + ' cancelled (not totalled)' : '' }, { label: 'Total value', value: util.money(total) }, { label: 'Suppliers', value: util.int(new Set(live.map(po => po.supplierId || po.supplierName)).size) }, { label: 'From PO books', value: util.int(live.filter(po => po.source === 'book' || po.bookId).length), note: 'handwritten' }],
          sections: [
            { title: 'Purchase orders', columns: poCols, rows: pos.map(poRow), totals: pos.length ? [['Total', '', live.length + ' POs', '', '', '', '', total]] : null, empty: 'No purchase orders match.' },
            { title: 'By status', columns: [{ label: 'Status' }, { label: 'POs', type: 'num' }, { label: 'Value', type: 'money' }], rows: byStatus.map(r => [r.key, r.n, util.round2(r.v)]), empty: 'No purchase orders match.' }
          ],
          notes: ['Drafts are excluded. Cancelled purchase orders are listed but not included in the totals.']
        };
      }
    },
    {
      id: 'spend', group: 'Purchasing', title: 'Spend Analysis', icon: 'wallet', period: true, filters: [DEPT],
      desc: 'Committed spend by supplier, category, department and procurement method, with each one\'s share.',
      build(p) {
        const pos = filterPos(active().filter(po => inP(po.date, p)), p.filters);
        const total = util.sum(pos, po => num(po.total));
        const bySup = rollup(pos, po => po.supplierId || po.supplierName), byCat = rollup(pos, po => po.category || po.type), byDept = rollup(pos, po => po.department), byMethod = rollup(pos, po => po.method);
        const supLabel = k => domain.supplierName(k, k);
        const ss = byMethod.find(r => /single source/i.test(r.key)) || { v: 0 };
        const withMethod = util.sum(byMethod.filter(r => r.key !== '(not recorded)'), r => r.v);
        return {
          kpis: [{ label: 'Committed spend', value: util.money(total) }, { label: 'Purchase orders', value: util.int(pos.length), note: 'Average ' + util.money(pos.length ? total / pos.length : 0) }, { label: 'Suppliers used', value: util.int(bySup.length), note: bySup[0] ? 'Top: ' + supLabel(bySup[0].key) : '' }, { label: 'Single-source share', value: pct(ss.v, withMethod) + '%', note: 'of value with a recorded method' }],
          chart: { title: 'Top suppliers', money: true, rows: bySup.slice(0, 10).map(r => ({ label: supLabel(r.key), value: r.v })) },
          sections: [
            { title: 'By supplier', columns: shareCols('Supplier'), rows: shareRows(bySup, total, supLabel), totals: bySup.length ? shareTotal(bySup, total) : null, empty: 'No spend in this period.' },
            { title: 'By category', columns: shareCols('Category'), rows: shareRows(byCat, total), totals: byCat.length ? shareTotal(byCat, total) : null, empty: 'No spend in this period.' },
            { title: 'By department', columns: shareCols('Department'), rows: shareRows(byDept, total), totals: byDept.length ? shareTotal(byDept, total) : null, empty: 'No spend in this period.' },
            { title: 'By procurement method', columns: shareCols('Method'), rows: shareRows(byMethod, total), totals: byMethod.length ? shareTotal(byMethod, total) : null, empty: 'No spend in this period.' }
          ],
          notes: [pos.length && withMethod < total * 0.5 ? 'Procurement method is recorded for only ' + pct(withMethod, total) + '% of the value; importing PRS returns fills it in for larger POs.' : '', 'Committed spend = value of purchase orders issued (drafts and cancelled orders excluded).']
        };
      }
    },
    {
      id: 'requisitions', group: 'Purchasing', title: 'Requisition Status', icon: 'clipboard', period: true, filters: [DEPT],
      desc: 'Requisitions received in the period, their status and how long each has been open.',
      build(p) {
        const reqs = store.list('requisitions').filter(r => inP(r.date, p) && (!p.filters.department || r.department === p.filters.department)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const closed = ['Completed', 'Rejected', 'Cancelled', 'Ordered'];
        const t = asAt(p);
        const rows = reqs.map(r => [r.number || r.requestNo || '—', r.date, r.department || '', r.title || ((r.items || [])[0] || {}).description || '', r.requestedBy || '', r.priority || '', num(r.estimate), r.status || '', closed.indexOf(r.status) >= 0 ? '' : Math.max(0, util.daysBetween(r.date, t))]);
        const by = rollup(reqs, r => r.status, r => r.estimate);
        const open = reqs.filter(r => closed.indexOf(r.status) < 0);
        return {
          kpis: [{ label: 'Requisitions received', value: util.int(reqs.length), note: util.money(util.sum(reqs, r => num(r.estimate))) + ' estimated' }, { label: 'Still open', value: util.int(open.length) }, { label: 'Ordered or completed', value: util.int(reqs.filter(r => r.status === 'Ordered' || r.status === 'Completed').length) }, { label: 'Open over 30 days', value: util.int(open.filter(r => util.daysBetween(r.date, t) > 30).length) }],
          chart: { title: 'Requisitions by status', rows: by.map(r => ({ label: r.key, value: r.n })) },
          sections: [
            { title: 'By status', columns: [{ label: 'Status' }, { label: 'Requisitions', type: 'num' }, { label: 'Estimated value', type: 'money' }], rows: by.map(r => [r.key, r.n, util.round2(r.v)]), empty: 'No requisitions in this period.' },
            { title: 'Requisitions', columns: [{ label: 'Number', width: 60 }, { label: 'Date', type: 'date', width: 58 }, { label: 'Department', width: 80 }, { label: 'Title' }, { label: 'Requested by', width: 76 }, { label: 'Priority', width: 48 }, { label: 'Estimate', type: 'money', width: 76 }, { label: 'Status', width: 58 }, { label: 'Days open', type: 'num', width: 44 }], rows, totals: rows.length ? [['Total', '', '', reqs.length + ' requisitions', '', '', util.round2(util.sum(reqs, r => num(r.estimate))), '', '']] : null, empty: 'No requisitions in this period.' }
          ],
          notes: ['Days open is counted to ' + util.date(t) + ' for requisitions not yet ordered, completed, rejected or cancelled.']
        };
      }
    },
    {
      id: 'outstanding', group: 'Purchasing', title: 'Outstanding Deliveries', icon: 'truck', asAt: true, filters: [SUPPLIER],
      desc: 'Goods on issued purchase orders not yet fully received, with days late and value still due.',
      build(p) {
        const t = asAt(p);
        const rows = (domain.inbound ? domain.inbound() : []).filter(r => !p.filters.supplier || r.po.supplierId === p.filters.supplier).map(r => {
          const late = r.expected ? util.daysBetween(r.expected, t) : 0;
          return [r.po.poNumber || '—', r.po.date, supName(r.po), r.line.description || '', r.type || '', num(r.ordered), num(r.received), num(r.outstanding), util.round2(num(r.outstanding) * num(r.line.unitPrice)), r.expected || '', late > 0 ? late : 0];
        }).sort((a, b) => b[10] - a[10]);
        const late = rows.filter(r => r[10] > 0);
        const value = util.sum(rows, r => r[8]);
        const bySup = {}; rows.forEach(r => { const s = bySup[r[2]] = bySup[r[2]] || { key: r[2], n: 0, v: 0, late: 0 }; s.n++; s.v += r[8]; if (r[10] > 0) s.late++; });
        const supRows = Object.values(bySup).sort((a, b) => b.v - a.v);
        return {
          kpis: [{ label: 'Lines outstanding', value: util.int(rows.length), note: new Set(rows.map(r => r[0])).size + ' purchase orders' }, { label: 'Value still due', value: util.money(value) }, { label: 'Overdue lines', value: util.int(late.length) }, { label: 'Longest delay', value: late.length ? Math.max.apply(null, late.map(r => r[10])) + ' days' : '—' }],
          chart: { title: 'Value due by supplier', money: true, rows: supRows.slice(0, 10).map(s => ({ label: s.key, value: s.v })) },
          sections: [
            { title: 'By supplier', columns: [{ label: 'Supplier' }, { label: 'Lines', type: 'num' }, { label: 'Overdue', type: 'num' }, { label: 'Value due', type: 'money' }], rows: supRows.map(s => [s.key, s.n, s.late, util.round2(s.v)]), empty: 'Nothing outstanding.' },
            { title: 'Outstanding lines', columns: [{ label: 'PO #', width: 56 }, { label: 'PO date', type: 'date', width: 54 }, { label: 'Supplier', width: 100 }, { label: 'Item' }, { label: 'Ordered', type: 'num', width: 44 }, { label: 'Received', type: 'num', width: 46 }, { label: 'Due', type: 'num', width: 40 }, { label: 'Value due', type: 'money', width: 70 }, { label: 'Expected', type: 'date', width: 56 }, { label: 'Days late', type: 'num', width: 40 }], rows: rows.map(r => [r[0], r[1], r[2], r[3] + (r[4] ? ' (' + r[4] + ')' : ''), r[5], r[6], r[7], r[8], r[9], r[10] || '']), totals: rows.length ? [['Total', '', '', rows.length + ' lines', '', '', '', util.round2(value), '', '']] : null, empty: 'Every issued purchase order has been fully received.' }
          ],
          notes: ['Expected date = the PO\'s expected delivery date, or the PO date plus the standard lead time. Late = past the expected date on ' + util.date(t) + '. Service lines are not included.']
        };
      }
    },
    {
      id: 'pobook', group: 'Purchasing', title: 'Physical PO Book Register', icon: 'list', period: true,
      desc: 'Handwritten purchase orders recorded from the PO books, voided leaves, and each book\'s status.',
      build(p) {
        const books = store.list('poBooks');
        const bookNo = id => (store.get('poBooks', id) || {}).bookNo || '';
        const pos = store.list('purchaseOrders').filter(po => (po.source === 'book' || po.bookId) && inP(po.date, p)).sort((a, b) => String(a.poNumber || '').localeCompare(String(b.poNumber || ''), undefined, { numeric: true }));
        const voids = []; books.forEach(b => (b.voids || []).forEach(v => { if (!v.date || inP(v.date, p)) voids.push([b.bookNo || '', v.serial, v.date || '', v.reason || '', v.notes || '', v.by || '']); }));
        const live = pos.filter(po => po.status !== 'Cancelled');
        const bookRows = books.slice().sort((a, b) => String(a.bookNo).localeCompare(String(b.bookNo), undefined, { numeric: true })).map(b => {
          const first = num(b.firstSerial), last = num(b.lastSerial);
          const used = store.list('purchaseOrders').filter(po => { const n = Number(String(po.poNumber || '').replace(/[-–].*$/, '')); return n >= first && n <= last; }).length;
          return [b.bookNo || '', b.firstSerial || '', b.lastSerial || '', last - first + 1 > 0 ? last - first + 1 : '', used, (b.voids || []).length, b.status || 'Open'];
        });
        return {
          kpis: [{ label: 'Handwritten POs', value: util.int(live.length), note: util.money(util.sum(live, po => num(po.total))) }, { label: 'Leaves voided', value: util.int(voids.length) }, { label: 'PO books registered', value: util.int(books.length) }, { label: 'Books in use', value: util.int(books.filter(b => b.status !== 'Completed').length) }],
          sections: [
            { title: 'Handwritten purchase orders', columns: [{ label: 'Book', width: 40 }, { label: 'PO #', width: 60 }, { label: 'Date', type: 'date', width: 58 }, { label: 'Supplier', width: 120 }, { label: 'Description' }, { label: 'Department', width: 80 }, { label: 'Status', width: 60 }, { label: 'Value', type: 'money', width: 80 }], rows: pos.map(po => [po.bookNo || bookNo(po.bookId), po.poNumber || '—', po.date, supName(po), po.description || '', po.department || '', po.status || '', num(po.total)]), totals: pos.length ? [['Total', '', '', live.length + ' POs', '', '', '', util.round2(util.sum(live, po => num(po.total)))]] : null, empty: 'No handwritten purchase orders recorded in this period.' },
            { title: 'Voided leaves', columns: [{ label: 'Book' }, { label: 'Serial' }, { label: 'Date', type: 'date' }, { label: 'Reason' }, { label: 'Notes' }, { label: 'Recorded by' }], rows: voids, empty: 'No leaves voided in this period.' },
            { title: 'PO books', columns: [{ label: 'Book' }, { label: 'First serial' }, { label: 'Last serial' }, { label: 'Leaves', type: 'num' }, { label: 'POs recorded', type: 'num' }, { label: 'Voided', type: 'num' }, { label: 'Status' }], rows: bookRows, empty: 'No PO books registered.' }
          ],
          notes: ['POs recorded counts every purchase order whose number falls in the book\'s serial range, in any period.']
        };
      }
    },
    {
      id: 'suppliers', group: 'Suppliers & payments', title: 'Supplier Performance', icon: 'award', period: true,
      desc: 'Orders, value, deliveries, on-time rate and rejected goods for each supplier.',
      build(p) {
        const rows = supplierPerf(p);
        const withDel = rows.filter(r => r.onTimePct !== null);
        const avgOn = withDel.length ? Math.round(util.sum(withDel, r => r.onTimePct) / withDel.length) : null;
        return {
          kpis: [{ label: 'Suppliers', value: util.int(rows.length) }, { label: 'Deliveries', value: util.int(util.sum(rows, r => r.deliveries)) }, { label: 'Average on-time rate', value: avgOn === null ? '—' : avgOn + '%' }, { label: 'Goods rejected', value: util.int(util.sum(rows, r => r.rejected)), note: 'units' }],
          chart: { title: 'Order value by supplier', money: true, rows: rows.slice(0, 10).map(r => ({ label: r.name, value: r.value })) },
          sections: [{ title: 'Supplier performance', columns: [{ label: 'Supplier' }, { label: 'POs', type: 'num' }, { label: 'Value', type: 'money' }, { label: 'Deliveries', type: 'num' }, { label: 'On time', type: 'pct' }, { label: 'Avg days late', type: 'num' }, { label: 'Rejected', type: 'num' }, { label: 'Reject rate', type: 'pct' }],
            rows: rows.map(r => [r.name, r.pos, util.round2(r.value), r.deliveries, r.onTimePct === null ? '' : r.onTimePct, r.avgLate, r.rejected, r.rejectPct]),
            totals: rows.length ? [['Total', util.sum(rows, r => r.pos), util.round2(util.sum(rows, r => r.value)), util.sum(rows, r => r.deliveries), avgOn === null ? '' : avgOn, '', util.sum(rows, r => r.rejected), '']] : null, empty: 'No orders or deliveries in this period.' }],
          notes: ['POs and value: orders issued in the period. Deliveries: goods received notes in the period. On time = received on or before the expected date (PO expected date, or PO date plus lead time).']
        };
      }
    },
    {
      id: 'compliance', group: 'Suppliers & payments', title: 'Supplier Compliance', icon: 'shield', asAt: true,
      desc: 'Tax Compliance Certificates, PPC registration and other issues for every active supplier.',
      build(p) {
        const all = Proc.complianceRows ? Proc.complianceRows(true) : [];
        const lbl = (x, iso) => (iso ? (x ? x.label : '') + ' (' + util.date(iso) + ')' : 'Not on file');
        const rows = all.slice().sort((a, b) => b.severity - a.severity || b.spend - a.spend).map(r => [r.s.name, r.s.trn || '', r.s.tccNumber || '', lbl(r.tcc, r.s.tccExpiry), lbl(r.ppc, r.s.ppcExpiry), r.s.status || 'Active', util.round2(r.spend), r.issues.length ? r.issues.join('; ') : 'OK']);
        const expired = all.filter(r => (r.tcc && r.tcc.tone === 'danger') || (r.ppc && r.ppc.tone === 'danger')).length;
        const expiring = all.filter(r => (r.tcc && r.tcc.tone === 'warning') || (r.ppc && r.ppc.tone === 'warning')).length;
        const attention = all.filter(r => r.issues.length && (r.spend > 0 || r.severity === 2));
        return {
          kpis: [{ label: 'Active suppliers', value: util.int(all.length) }, { label: 'Expired TCC / PPC', value: util.int(expired) }, { label: 'Expiring within 30 days', value: util.int(expiring) }, { label: 'Need attention', value: util.int(attention.length), note: 'used this FY or expired' }],
          sections: [
            { title: 'Suppliers needing attention', columns: [{ label: 'Supplier' }, { label: 'TRN' }, { label: 'TCC' }, { label: 'PPC' }, { label: 'FY spend', type: 'money' }, { label: 'Issues' }], rows: attention.map(r => [r.s.name, r.s.trn || '', lbl(r.tcc, r.s.tccExpiry), lbl(r.ppc, r.s.ppcExpiry), util.round2(r.spend), r.issues.join('; ')]), empty: 'Every supplier used this year has current documents on file.' },
            { title: 'All active suppliers', optional: true, columns: [{ label: 'Supplier' }, { label: 'TRN' }, { label: 'TCC number' }, { label: 'TCC' }, { label: 'PPC' }, { label: 'Status' }, { label: 'FY spend', type: 'money' }, { label: 'Issues' }], rows, empty: 'No suppliers recorded.' }
          ],
          notes: ['Status of certificates is worked out on the day the report is generated. FY spend = purchase orders this fiscal year. Update details on each supplier\'s profile.']
        };
      }
    },
    {
      id: 'payables', group: 'Suppliers & payments', title: 'Payables Aging', icon: 'receipt', asAt: true, filters: [SUPPLIER],
      desc: 'Unpaid invoices by how long past due, per supplier and invoice by invoice.',
      build(p) {
        const t = asAt(p);
        const B = [['cur', 'Not yet due'], ['b30', '1-30 days'], ['b60', '31-60 days'], ['b90', '61-90 days'], ['b90p', 'Over 90 days']];
        const rows = store.list('invoices').filter(i => i.status !== 'Paid' && (!p.filters.supplier || i.supplierId === p.filters.supplier)).map(i => {
          const due = i.dueDate || (i.date ? util.addDays(i.date, 30) : t);
          const late = util.daysBetween(due, t);
          return { inv: i, due, late, bucket: late <= 0 ? 'cur' : late <= 30 ? 'b30' : late <= 60 ? 'b60' : late <= 90 ? 'b90' : 'b90p', total: num(i.total) || num(i.amount) };
        });
        const sup = {};
        rows.forEach(r => { const k = r.inv.supplierId || '—'; const s = sup[k] = sup[k] || { id: k, n: 0, total: 0 }; s.n++; s.total += r.total; s[r.bucket] = (s[r.bucket] || 0) + r.total; });
        const sups = Object.values(sup).sort((a, b) => b.total - a.total);
        const tot = k => util.sum(rows.filter(r => r.bucket === k), r => r.total);
        const all = util.sum(rows, r => r.total);
        const poNo = id => (store.get('purchaseOrders', id) || {}).poNumber || '';
        return {
          kpis: [{ label: 'Outstanding', value: util.money(all), note: rows.length + ' invoices' }, { label: 'Overdue', value: util.money(util.sum(rows.filter(r => r.late > 0), r => r.total)), note: rows.filter(r => r.late > 0).length + ' invoices' }, { label: 'Over 60 days', value: util.money(tot('b90') + tot('b90p')) }, { label: 'Suppliers owed', value: util.int(sups.length) }],
          chart: { title: 'Outstanding by age', money: true, rows: B.map(b => ({ label: b[1], value: tot(b[0]) })) },
          sections: [
            { title: 'Aging by supplier', columns: [{ label: 'Supplier' }].concat(B.map(b => ({ label: b[1], type: 'money' }))).concat([{ label: 'Total', type: 'money' }]), rows: sups.map(s => [domain.supplierName(s.id, 'Unknown supplier')].concat(B.map(b => util.round2(s[b[0]] || 0))).concat([util.round2(s.total)])), totals: sups.length ? [['Total'].concat(B.map(b => util.round2(tot(b[0])))).concat([util.round2(all)])] : null, empty: 'All recorded invoices are paid.' },
            { title: 'Unpaid invoices', columns: [{ label: 'Invoice' }, { label: 'Date', type: 'date' }, { label: 'Supplier' }, { label: 'PO #' }, { label: 'Due', type: 'date' }, { label: 'Days overdue', type: 'num' }, { label: 'Status' }, { label: 'Amount', type: 'money' }], rows: rows.sort((a, b) => b.late - a.late).map(r => [r.inv.invoiceNumber || '—', r.inv.date || '', domain.supplierName(r.inv.supplierId, '—'), poNo(r.inv.poId), r.due, r.late > 0 ? r.late : 0, r.late > 0 ? 'Overdue' : (r.inv.status || 'Pending'), util.round2(r.total)]), totals: rows.length ? [['Total', '', '', '', '', '', '', util.round2(all)]] : null, empty: 'No unpaid invoices.' }
          ],
          notes: ['Days past the due date on ' + util.date(t) + '. When no due date is recorded, the invoice date plus 30 days is used.']
        };
      }
    },
    {
      id: 'approvals', group: 'Approvals & compliance', title: 'Approvals & Thresholds', icon: 'stamp', period: true,
      desc: 'Approval memos by status, awards by approval level, awards above the delegated, NCC/PPC and Cabinet limits, and single-source use.',
      build(p) {
        const L = S().limits;
        const memos = store.list('memos').filter(m => inP(m.date || String(m.createdAt || '').slice(0, 10), p));
        const byStatus = (K.MEMO_STATUSES || []).map(s => { const l = memos.filter(m => m.status === s); return [s, l.length, util.round2(util.sum(l, memoValue))]; });
        const pos = active().filter(po => inP(po.date, p));
        const level = po => domain.approvalLevel(num(po.total));
        const byLevel = rollup(pos, level);
        const total = util.sum(pos, po => num(po.total));
        const big = pos.filter(po => num(po.total) > L.delegated).sort((a, b) => num(b.total) - num(a.total));
        const ss = pos.filter(po => /single source/i.test(po.method || ''));
        const memoOf = po => (po.memoId ? (store.get('memos', po.memoId) || {}) : null);
        const decided = memos.filter(m => m.decision && m.decision.date && m.submittedAt);
        const days = decided.map(m => util.daysBetween(String(m.submittedAt).slice(0, 10), m.decision.date)).filter(d => d >= 0);
        return {
          kpis: [{ label: 'Memos in period', value: util.int(memos.length), note: util.int((byStatus.find(x => x[0] === 'Submitted') || [0, 0])[1]) + ' awaiting decision' }, { label: 'Average decision time', value: days.length ? util.round2(util.sum(days) / days.length) + ' days' : '—' }, { label: 'Awards over ' + util.moneyShort(L.delegated), value: util.int(big.length), note: 'Head of Entity approval' }, { label: 'Single-source share', value: pct(util.sum(ss, po => num(po.total)), total) + '%', note: ss.length + ' POs' }],
          chart: { title: 'Value by approval level', money: true, rows: byLevel.map(r => ({ label: r.key, value: r.v })) },
          sections: [
            { title: 'Approval memos by status', columns: [{ label: 'Status' }, { label: 'Memos', type: 'num' }, { label: 'Recommended value', type: 'money' }], rows: memos.length ? byStatus : [], empty: 'No approval memos in this period.' },
            { title: 'Purchase orders by approval level', columns: shareCols('Approval level'), rows: shareRows(byLevel, total), totals: byLevel.length ? shareTotal(byLevel, total) : null, empty: 'No purchase orders in this period.' },
            { title: 'Awards above the delegated authority (' + util.money(L.delegated, { noCents: true }) + ')', columns: [{ label: 'PO #' }, { label: 'Date', type: 'date' }, { label: 'Supplier' }, { label: 'Method' }, { label: 'Value', type: 'money' }, { label: 'Approval needed' }, { label: 'Memo' }], rows: big.map(po => { const m = memoOf(po); return [po.poNumber || '—', po.date, supName(po), po.method || '', num(po.total), level(po), m ? (m.ref || 'On file') + (m.status ? ' (' + m.status + ')' : '') : 'Not linked']; }), empty: 'No awards above the delegated authority in this period.' },
            { title: 'Single-source purchase orders', optional: true, columns: [{ label: 'PO #' }, { label: 'Date', type: 'date' }, { label: 'Supplier' }, { label: 'Description' }, { label: 'Value', type: 'money' }], rows: ss.map(po => [po.poNumber || '—', po.date, supName(po), po.description || '', num(po.total)]), empty: 'No single-source purchase orders in this period.' }
          ],
          notes: ['Limits from Settings: committee review from ' + util.money(L.committeeMin, { noCents: true }) + '; Parish Manager delegated authority ' + util.money(L.delegated, { noCents: true }) + '; NCC/PPC endorsement above ' + util.money(L.ncc, { noCents: true }) + '; Cabinet above ' + util.money(L.cabinet, { noCents: true }) + '. Each award above the delegated authority needs a Head of Entity memo on file.']
        };
      }
    },
    {
      id: 'plan', group: 'Approvals & compliance', title: 'Procurement Plan vs Actual', icon: 'target', period: true,
      desc: 'The annual procurement plan against purchase orders actually raised, by category and item.',
      build(p) {
        const fy = util.fiscalYear(p.from);
        const items = store.list('plans').filter(x => x.fy === fy);
        const r = util.fyRange(fy);
        const fyPos = active().filter(po => po.date >= r.start && po.date <= r.end);
        const typeOf = c => (/WORK/i.test(c) ? 'Works' : /SERVICE/i.test(c) ? 'Services' : 'Goods');
        const cats = util.groupBy(items, x => x.category || '(no category)');
        const catRows = Object.keys(cats).map(c => {
          const planned = util.sum(cats[c], x => num(x.estimate));
          const ids = new Set(); cats[c].forEach(x => planMatches(x, fyPos).forEach(po => ids.add(po.id)));
          const matched = util.sum(fyPos.filter(po => ids.has(po.id)), po => num(po.total));
          return [c, cats[c].length, util.round2(planned), util.round2(matched), pct(matched, planned), util.round2(util.sum(fyPos.filter(po => po.type === typeOf(c)), po => num(po.total)))];
        }).sort((a, b) => b[2] - a[2]);
        const total = util.sum(items, x => num(x.estimate));
        const started = util.today() >= r.start;
        const itemRows = items.map(x => { const m = planMatches(x, fyPos); return [x.quarter || '', x.description || '', x.category || '', x.method || x.methodCode || '', x.monthNeeded || '', num(x.estimate), m.length ? m.map(po => po.poNumber).slice(0, 3).join(', ') : (started ? 'Not started' : 'Planned'), util.round2(util.sum(m, po => num(po.total)))]; });
        const qs = util.groupBy(items, x => x.quarter || '—');
        return {
          subtitle: 'Plan for fiscal year ' + fy,
          kpis: [{ label: 'Planned value', value: util.money(total), note: items.length + ' planned procurements' }].concat(['Q1', 'Q2', 'Q3', 'Q4'].map(q => ({ label: q + ' planned', value: util.money(util.sum(qs[q] || [], x => num(x.estimate))), note: (qs[q] || []).length + ' items' }))).slice(0, 4),
          chart: { title: 'Planned value by category', money: true, rows: catRows.map(c => ({ label: c[0], value: c[2] })) },
          sections: [
            { title: 'Plan vs actual by category', columns: [{ label: 'Category' }, { label: 'Items', type: 'num' }, { label: 'Planned', type: 'money' }, { label: 'Matched POs', type: 'money' }, { label: 'Achieved', type: 'pct' }, { label: 'All POs of this type', type: 'money' }], rows: catRows, totals: catRows.length ? [['Total', items.length, util.round2(total), util.round2(util.sum(catRows, c => c[3])), pct(util.sum(catRows, c => c[3]), total), '']] : null, empty: 'No procurement plan loaded for fiscal year ' + fy + '. Import the annual plan workbook on the Import Data page.' },
            { title: 'Planned procurements', optional: true, columns: [{ label: 'Qtr', width: 30 }, { label: 'Item' }, { label: 'Category', width: 90 }, { label: 'Method', width: 70 }, { label: 'Needed', width: 54 }, { label: 'Estimate', type: 'money', width: 76 }, { label: 'Matched POs', width: 90 }, { label: 'PO value', type: 'money', width: 76 }], rows: itemRows, empty: 'No procurement plan loaded for fiscal year ' + fy + '.' }
          ],
          notes: ['Fiscal year taken from the start of the chosen period. "Matched" = purchase orders this fiscal year whose description contains the plan item\'s key words; "All POs of this type" = every PO of the same type (Goods / Services / Works).']
        };
      }
    }
  ];

  Proc.reportPdf.register(reports);
})();
