/* General Stores — PDF report catalogue for the PDF Reports page (procurement/report-pdf.js).
   Monthly and fiscal-year summaries, stock, receiving and issue reports on the letterhead. */
(function () {
  'use strict';
  const { util, store, domain } = Proc;
  const C = Proc.storesC;
  const B = () => C.reportBuilders || {};
  const inP = (d, p) => !!d && d >= p.from && d <= p.to;
  const money = n => util.money(n), short = n => util.moneyShort(n);
  const abs = n => Math.abs(util.num(n));

  /* ------------------------------------------------------------ filter options */
  const opt = {
    category: () => Array.from(new Set(C.items().map(i => i.category || 'General'))).sort().map(c => [c, c]),
    location: () => Array.from(new Set(C.items().map(i => i.location).filter(Boolean))).sort().map(c => [c, c]),
    department: () => Array.from(new Set(store.list('stockIssues').map(s => s.department).concat(store.list('stockMoves').map(m => m.department)).filter(Boolean))).sort().map(d => [d, d]),
    supplier: () => store.list('suppliers').filter(s => s.status !== 'Inactive').map(s => [s.id, s.name]).sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
    item: () => C.items().slice().sort((a, b) => a.name.localeCompare(b.name)).map(i => [i.id, i.code + ' · ' + i.name]),
    sivStatus: () => ['Requested', 'Approved', 'Issued', 'Part issued', 'Rejected', 'Cancelled'].map(s => [s, s])
  };
  const F = {
    category: { key: 'category', label: 'Category', options: opt.category },
    location: { key: 'location', label: 'Bin location', options: opt.location },
    department: { key: 'department', label: 'Department', options: opt.department },
    supplier: { key: 'supplier', label: 'Supplier', options: opt.supplier },
    item: { key: 'item', label: 'Item', options: opt.item, quiet: true },
    sivStatus: { key: 'status', label: 'Voucher status', options: opt.sivStatus }
  };

  /** Turn one of the on-screen report builders (stores/pages/reports.js) into a PDF section. */
  function fromBuilder(r, title, keep) {
    const cols = r.columns.filter(c => !keep || keep(c));
    const type = c => c.type === 'money' ? 'money' : c.type === 'num' ? 'num' : c.type === 'pct' ? 'pct' : c.type === 'date' ? 'date' : 'text';
    const rows = r.rows.map(row => cols.map(c => (row[c.key] === 9999 ? 'never' : row[c.key])));
    const tk = Object.keys(r.totals || {});
    return { title, note: r.note, columns: cols.map(c => ({ label: c.label, type: type(c) })), rows, totals: tk.length && rows.length ? [cols.map((c, i) => (i === 0 ? 'Total' : r.totals[c.key] !== undefined ? r.totals[c.key] : ''))] : null };
  }
  const itemOf = id => store.get('stockItems', id) || {};
  const moves = () => store.list('stockMoves');
  const issuesIn = p => moves().filter(m => m.type === 'Issue' && inP(m.date, p));
  const receiptsIn = p => moves().filter(m => m.type === 'Receipt' && inP(m.date, p));
  const grnsIn = p => store.list('deliveries').filter(d => !d.voided && inP(d.date, p));

  const fiscalMonths = p => {
    const out = []; let d = p.from.slice(0, 7) + '-01';
    while (d <= p.to && out.length < 24) { out.push(d.slice(0, 7)); const [y, m] = d.split('-').map(Number); d = util.toISODate(new Date(y, m, 1)); }
    return out;
  };

  const REPORTS = [
    /* --------------------------------------------------- Monthly & summary */
    {
      id: 'monthly', group: 'Monthly & summary', title: 'Monthly Stores Report', icon: 'clipboard', period: true,
      desc: 'One report for the month: stock value, goods received, issues by department, items to reorder and expiry alerts.',
      build(p) {
        const rec = receiptsIn(p), iss = issuesIn(p), grns = grnsIn(p);
        const sivs = store.list('stockIssues').filter(s => (s.status === 'Issued' || s.status === 'Part issued') && inP(String(s.issuedAt || s.date).slice(0, 10), p));
        const items = C.items(), stockVal = util.sum(items, i => util.num(i.value));
        const recVal = util.sum(rec, m => abs(m.value)), issVal = util.sum(iss, m => abs(m.value));
        const reorder = C.reorderRows().filter(r => !r.covered), exp = C.expiring(90);
        const byDept = util.groupBy(iss, m => m.department || 'Unspecified');
        const deptRows = Object.keys(byDept).map(d => [d, new Set(byDept[d].map(m => m.issueId || m.id)).size, byDept[d].length, util.round2(util.sum(byDept[d], m => abs(m.value)))]).sort((a, b) => b[3] - a[3]);
        const byCat = util.groupBy(items, i => i.category || 'General');
        const catRows = Object.keys(byCat).sort().map(c => {
          const ids = new Set(byCat[c].map(i => i.id));
          return [c, byCat[c].length, util.round2(util.sum(rec.filter(m => ids.has(m.itemId)), m => abs(m.value))), util.round2(util.sum(iss.filter(m => ids.has(m.itemId)), m => abs(m.value))), util.round2(util.sum(byCat[c], i => util.num(i.value)))];
        });
        return {
          kpis: [
            { label: 'Stock value now', value: short(stockVal), note: items.length + ' active items' },
            { label: 'Goods received', value: short(recVal), note: grns.length + ' ' + util.plural(grns.length, 'GRN') + ' in the period' },
            { label: 'Issued to departments', value: short(issVal), note: sivs.length + ' ' + util.plural(sivs.length, 'voucher') + ' issued' },
            { label: 'Items to reorder', value: util.int(reorder.length), note: exp.filter(x => x.daysLeft < 0).length + ' expired · ' + exp.filter(x => x.daysLeft >= 0).length + ' expiring in 90 days' }
          ],
          chart: { title: 'Value issued by department', rows: deptRows.map(r => ({ label: r[0], value: r[3] })), money: true },
          sections: [
            { title: 'Stock by category', columns: [{ label: 'Category' }, { label: 'Items', type: 'num' }, { label: 'Received', type: 'money' }, { label: 'Issued', type: 'money' }, { label: 'Value on hand', type: 'money' }], rows: catRows,
              totals: catRows.length ? [['Total', items.length, util.round2(recVal), util.round2(issVal), util.round2(stockVal)]] : null },
            { title: 'Issues by department', columns: [{ label: 'Department' }, { label: 'Vouchers', type: 'num' }, { label: 'Lines', type: 'num' }, { label: 'Value', type: 'money' }], rows: deptRows,
              totals: deptRows.length ? [['Total', util.sum(deptRows, r => r[1]), util.sum(deptRows, r => r[2]), util.round2(issVal)]] : null, empty: 'No issues in this period.' },
            { title: 'Goods received', optional: true, columns: [{ label: 'GRN' }, { label: 'Date', type: 'date' }, { label: 'PO' }, { label: 'Supplier' }, { label: 'Qty received', type: 'num' }, { label: 'Rejected', type: 'num' }], empty: 'No goods received in this period.',
              rows: grns.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(d => { const po = store.get('purchaseOrders', d.poId) || {}; return [d.grn || '—', d.date, po.poNumber || '—', po.supplierName || domain.supplierName(d.supplierId) || '', util.sum(d.items || [], i => util.num(i.qtyReceived)), util.num(d.rejectedQty) || util.sum(d.items || [], i => util.num(i.qtyRejected))]; }) },
            { title: 'Items to reorder', columns: [{ label: 'Code' }, { label: 'Item' }, { label: 'Usable', type: 'num' }, { label: 'Reorder at', type: 'num' }, { label: 'On order', type: 'num' }, { label: 'Suggested', type: 'num' }], empty: 'No items are at or below their reorder level.',
              rows: reorder.map(r => [r.item.code, r.item.name, r.usable, util.num(r.item.reorderLevel), r.onOrder, r.suggest]) },
            { title: 'Expiry alerts (90 days)', columns: [{ label: 'Code' }, { label: 'Item' }, { label: 'Batch' }, { label: 'Expiry', type: 'date' }, { label: 'Days left', type: 'num' }, { label: 'Qty', type: 'num' }, { label: 'Value', type: 'money' }], empty: 'No batches expired or expiring within 90 days.',
              rows: exp.map(x => [x.item.code, x.item.name, x.batch.batchNo || '—', x.batch.expiryDate, x.daysLeft, util.num(x.batch.qty), x.value]) }
          ],
          notes: ['Values at cost (weighted average). Stock value is as at the date the report was generated.']
        };
      }
    },
    {
      id: 'fiscal', group: 'Monthly & summary', title: 'Fiscal Year Stores Report', icon: 'calendar', period: true,
      desc: 'Receipts and issues for each month of the period (use "This fiscal year" for April–March), with totals.',
      build(p) {
        const ms = moves().filter(m => inP(m.date, p));
        const rows = fiscalMonths(p).map(k => {
          const mm = ms.filter(m => (m.date || '').slice(0, 7) === k);
          const rec = mm.filter(m => m.type === 'Receipt'), iss = mm.filter(m => m.type === 'Issue'), adj = mm.filter(m => m.type !== 'Receipt' && m.type !== 'Issue' && m.type !== 'Opening');
          return [util.monthLabel(k), rec.length, util.round2(util.sum(rec, m => abs(m.value))), iss.length, util.round2(util.sum(iss, m => abs(m.value))), util.round2(util.sum(adj, m => util.num(m.value)))];
        });
        const tot = i => util.round2(util.sum(rows, r => r[i]));
        return {
          kpis: [{ label: 'Received', value: short(tot(2)), note: tot(1) + ' receipt lines' }, { label: 'Issued', value: short(tot(4)), note: tot(3) + ' issue lines' }, { label: 'Adjustments', value: short(tot(5)), note: 'Counts, write-offs, returns' }, { label: 'Stock value now', value: short(util.sum(C.items(), i => util.num(i.value))) }],
          chart: { title: 'Value issued by month', rows: rows.map(r => ({ label: r[0], value: r[4] })), money: true },
          sections: [{ title: 'By month', columns: [{ label: 'Month' }, { label: 'Receipt lines', type: 'num' }, { label: 'Received', type: 'money' }, { label: 'Issue lines', type: 'num' }, { label: 'Issued', type: 'money' }, { label: 'Adjustments', type: 'money' }], rows, totals: [['Total', tot(1), tot(2), tot(3), tot(4), tot(5)]] }]
        };
      }
    },

    /* --------------------------------------------------- Stock */
    {
      id: 'valuation', group: 'Stock', title: 'Stock Valuation', icon: 'wallet', filters: [F.category, F.location],
      desc: 'Every item on hand at weighted average cost, by category, with totals.',
      build(p) {
        const r = B().valuation();
        r.rows = r.rows.filter(x => (!p.filters.category || x.category === p.filters.category) && (!p.filters.location || x.location === p.filters.location));
        r.totals = { value: util.sum(r.rows, x => x.value), onHand: util.sum(r.rows, x => x.onHand) };
        const byCat = util.groupBy(r.rows, x => x.category);
        return {
          kpis: [{ label: 'Stock value', value: short(r.totals.value) }, { label: 'Items', value: util.int(r.rows.length) }, { label: 'Out of stock', value: util.int(r.rows.filter(x => x.onHand <= 0).length) }, { label: 'Categories', value: util.int(Object.keys(byCat).length) }],
          chart: { title: 'Value by category', rows: Object.keys(byCat).map(k => ({ label: k, value: util.sum(byCat[k], x => x.value) })).sort((a, b) => b.value - a.value), money: true },
          sections: [fromBuilder(r, 'Items')]
        };
      }
    },
    {
      id: 'movement', group: 'Stock', title: 'Stock Movement Summary', icon: 'refresh', period: true, filters: [F.category],
      desc: 'Opening balance, received, issued, adjusted and closing balance for every item in the period.',
      build(p) {
        const r = B().movement(p.from, p.to);
        if (p.filters.category) { const codes = new Set(C.items().filter(i => (i.category || 'General') === p.filters.category).map(i => i.code)); r.rows = r.rows.filter(x => codes.has(x.code)); r.totals = { closingValue: util.sum(r.rows, x => x.closingValue) }; }
        return {
          kpis: [{ label: 'Items moved', value: util.int(r.rows.filter(x => x.receipts || x.issues || x.adjustments).length) }, { label: 'Units received', value: util.int(util.sum(r.rows, x => x.receipts)) }, { label: 'Units issued', value: util.int(util.sum(r.rows, x => x.issues)) }, { label: 'Closing value', value: short(r.totals.closingValue) }],
          sections: [fromBuilder(r, 'By item')]
        };
      }
    },
    {
      id: 'bincard', group: 'Stock', title: 'Bin Card', icon: 'list', period: true, filters: [F.item],
      desc: 'The full stock card for one item: every receipt, issue and adjustment with the running balance.',
      build(p) {
        const it = p.filters.item ? itemOf(p.filters.item) : null;
        if (!it || !it.id) return { subtitle: 'Choose an item in the Item box.', sections: [{ title: 'Movements', columns: [{ label: 'Date' }], rows: [], empty: 'No item chosen. Pick one in the Item box and generate again.' }] };
        const ms = moves().filter(m => m.itemId === it.id).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
        const open = util.sum(ms.filter(m => m.date < p.from), m => util.num(m.qty));
        const inPer = ms.filter(m => inP(m.date, p));
        let bal = open;
        const rows = [[p.from, 'Opening balance', '', '', '', '', util.round2(open), '']].concat(inPer.map(m => {
          bal = util.round2(bal + util.num(m.qty));
          const ref = [m.ref, m.batchNo ? 'Batch ' + m.batchNo : ''].filter(Boolean).join(' · ');
          return [m.date, m.type, ref, m.department || (m.supplierId ? domain.supplierName(m.supplierId) : '') || '', m.qty > 0 ? m.qty : '', m.qty < 0 ? -m.qty : '', bal, m.by || ''];
        }));
        return {
          subtitle: it.code + ' · ' + it.name + ' · ' + (it.category || 'General') + (it.location ? ' · Bin ' + it.location : '') + ' · unit: ' + (it.unit || 'each'),
          kpis: [{ label: 'On hand now', value: util.int(util.num(it.onHand)) + ' ' + (it.unit || '') }, { label: 'Average cost', value: money(it.avgCost) }, { label: 'Value', value: short(it.value) }, { label: 'Reorder level', value: util.num(it.reorderLevel) ? util.int(it.reorderLevel) : '—' }],
          sections: [{ title: 'Movements', columns: [{ label: 'Date', type: 'date' }, { label: 'Type' }, { label: 'Reference' }, { label: 'From / to' }, { label: 'In', type: 'num' }, { label: 'Out', type: 'num' }, { label: 'Balance', type: 'num' }, { label: 'By' }], rows,
            totals: [['Period', '', '', '', util.round2(util.sum(inPer.filter(m => m.qty > 0), m => m.qty)), util.round2(-util.sum(inPer.filter(m => m.qty < 0), m => m.qty)), bal, '']] }],
          orientation: 'landscape'
        };
      }
    },
    {
      id: 'reorder', group: 'Stock', title: 'Items to Reorder', icon: 'alert', filters: [F.category],
      desc: 'Items at or below their reorder level, what is already on order, and a suggested order quantity.',
      build(p) {
        const rows = C.reorderRows().filter(r => !p.filters.category || (r.item.category || 'General') === p.filters.category);
        const need = rows.filter(r => !r.covered);
        return {
          kpis: [{ label: 'At or below reorder', value: util.int(rows.length) }, { label: 'Need ordering', value: util.int(need.length), note: (rows.length - need.length) + ' covered by open POs' }, { label: 'Estimated cost', value: short(util.sum(need, r => r.suggest * r.cost)) }],
          sections: [{ title: 'Items', columns: [{ label: 'Code' }, { label: 'Item' }, { label: 'Usable', type: 'num' }, { label: 'Reorder at', type: 'num' }, { label: 'On order', type: 'num' }, { label: 'Suggested', type: 'num' }, { label: 'Unit cost', type: 'money' }, { label: 'Est. cost', type: 'money' }, { label: 'Last supplier' }],
            rows: rows.map(r => [r.item.code, r.item.name + (r.covered ? ' (covered)' : ''), r.usable, util.num(r.item.reorderLevel), r.onOrder, r.suggest, r.cost, util.round2(r.suggest * r.cost), r.supplier]),
            totals: need.length ? [['Total', '', '', '', '', '', '', util.round2(util.sum(need, r => r.suggest * r.cost)), '']] : null, empty: 'No items are at or below their reorder level.' }],
          notes: ['Usable stock excludes expired batches. "Covered" means stock on hand plus open purchase orders is above the reorder level.']
        };
      }
    },
    {
      id: 'expiry', group: 'Stock', title: 'Expiry Report', icon: 'clock', days: 90, daysLabel: 'Expiring within (days)',
      desc: 'Batches already expired or expiring soon, with quantities and value at risk.',
      build(p) {
        const r = B().expiry(p.from, p.to, p.days);
        const expired = r.rows.filter(x => x.daysLeft < 0);
        return {
          kpis: [{ label: 'Expired batches', value: util.int(expired.length), note: short(util.sum(expired, x => x.value)) + ' value' }, { label: 'Expiring within ' + p.days + ' days', value: util.int(r.rows.length - expired.length), note: short(util.sum(r.rows.filter(x => x.daysLeft >= 0), x => x.value)) + ' value' }, { label: 'Value at risk', value: short(r.totals.value) }],
          sections: [fromBuilder(r, 'Batches')]
        };
      }
    },
    {
      id: 'slow', group: 'Stock', title: 'Slow-moving & Dead Stock', icon: 'history', days: 90, daysLabel: 'Not issued for (days)',
      desc: 'Items in stock that have not been issued for a long time, by value.',
      build(p) {
        const r = B().slow(p.from, p.to, p.days);
        return { kpis: [{ label: 'Items', value: util.int(r.rows.length) }, { label: 'Value tied up', value: short(r.totals.value) }, { label: 'Never issued', value: util.int(r.rows.filter(x => !x.lastIssued).length) }], sections: [fromBuilder(r, 'Items')] };
      }
    },
    {
      id: 'counts', group: 'Stock', title: 'Stock Count Variances', icon: 'clipboardCheck', period: true,
      desc: 'Stock takes in the period: items counted, differences found, reasons and value.',
      build(p) {
        const cs = store.list('stockCounts').filter(c => inP(String(c.postedAt || c.date || '').slice(0, 10), p));
        const rows = [];
        cs.forEach(c => (c.lines || []).forEach(l => {
          const v = util.num(l.variance) || (l.countedQty !== '' && l.countedQty !== undefined && l.countedQty !== null ? util.num(l.countedQty) - util.num(l.systemQty) : 0);
          if (!v) return; const it = itemOf(l.itemId);
          rows.push([c.number, c.status, it.code || '', it.name || l.itemName || '', util.num(l.systemQty), util.num(l.countedQty), v, util.round2(v * util.num(it.avgCost)), l.reason || '']);
        }));
        const lines = util.sum(cs, c => (c.lines || []).length);
        return {
          kpis: [{ label: 'Counts', value: util.int(cs.length), note: cs.filter(c => c.status === 'Posted').length + ' posted' }, { label: 'Lines counted', value: util.int(lines) }, { label: 'Lines with a difference', value: util.int(rows.length), note: lines ? Math.round((lines - rows.length) / lines * 100) + '% accurate' : '' }, { label: 'Net variance value', value: money(util.round2(util.sum(rows, r => r[7]))) }],
          sections: [
            { title: 'Counts', columns: [{ label: 'Count' }, { label: 'Date', type: 'date' }, { label: 'Scope' }, { label: 'Status' }, { label: 'Lines', type: 'num' }, { label: 'Counted by' }], rows: cs.map(c => [c.number, c.date, c.scope + (c.category ? ' · ' + c.category : ''), c.status, (c.lines || []).length, c.countedBy || '']), empty: 'No stock counts in this period.' },
            { title: 'Differences', columns: [{ label: 'Count' }, { label: 'Status' }, { label: 'Code' }, { label: 'Item' }, { label: 'System', type: 'num' }, { label: 'Counted', type: 'num' }, { label: 'Variance', type: 'num' }, { label: 'Value', type: 'money' }, { label: 'Reason' }], rows, totals: rows.length ? [['Total', '', '', '', '', '', util.round2(util.sum(rows, r => r[6])), util.round2(util.sum(rows, r => r[7])), '']] : null, empty: 'Every counted item matched the system.' }
          ]
        };
      }
    },
    {
      id: 'writeoffs', group: 'Stock', title: 'Adjustments & Write-offs', icon: 'trash', period: true,
      desc: 'Every stock adjustment, write-off and return in the period with the reason and who made it.',
      build(p) {
        const ms = moves().filter(m => inP(m.date, p) && m.type !== 'Receipt' && m.type !== 'Issue' && m.type !== 'Opening').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const byType = util.groupBy(ms, m => m.type);
        return {
          kpis: Object.keys(byType).slice(0, 4).map(t => ({ label: t, value: money(util.round2(util.sum(byType[t], m => util.num(m.value)))), note: byType[t].length + ' lines' })),
          sections: [{ title: 'Movements', columns: [{ label: 'Date', type: 'date' }, { label: 'Type' }, { label: 'Code' }, { label: 'Item' }, { label: 'Qty', type: 'num' }, { label: 'Value', type: 'money' }, { label: 'Reason' }, { label: 'Reference' }, { label: 'By' }],
            rows: ms.map(m => [m.date, m.type, m.itemCode || itemOf(m.itemId).code || '', m.itemName || itemOf(m.itemId).name || '', util.num(m.qty), util.num(m.value), m.reason || m.notes || '', m.ref || '', m.by || '']),
            totals: ms.length ? [['Total', '', '', '', '', util.round2(util.sum(ms, m => util.num(m.value))), '', '', '']] : null, empty: 'No adjustments or write-offs in this period.' }]
        };
      }
    },

    /* --------------------------------------------------- Receiving */
    {
      id: 'grn', group: 'Receiving', title: 'Goods Received Register', icon: 'truck', period: true, filters: [F.supplier],
      desc: 'Every goods received note in the period with PO, supplier, quantities, rejections and value.',
      build(p) {
        const r = B().grn(p.from, p.to);
        if (p.filters.supplier) {
          const name = domain.supplierName(p.filters.supplier);
          r.rows = r.rows.filter(x => x.supplier === name); r.totals = { value: util.sum(r.rows, x => x.value), received: util.sum(r.rows, x => x.received) };
        }
        return {
          kpis: [{ label: 'GRNs', value: util.int(r.rows.length) }, { label: 'Value received', value: short(r.totals.value) }, { label: 'Part deliveries', value: util.int(r.rows.filter(x => x.status === 'Partial').length) }, { label: 'Lines with rejections', value: util.int(r.rows.filter(x => x.rejected > 0).length) }],
          sections: [fromBuilder(r, 'Goods received notes', c => c.key !== 'where')]
        };
      }
    },
    {
      id: 'outstanding', group: 'Receiving', title: 'Outstanding Purchase Orders', icon: 'cart', filters: [F.supplier],
      desc: 'Goods on issued purchase orders not yet fully delivered, with days late and value due.',
      build(p) {
        const r = B().outstanding();
        if (p.filters.supplier) { const name = domain.supplierName(p.filters.supplier); r.rows = r.rows.filter(x => x.supplier === name); r.totals = { value: util.sum(r.rows, x => x.value) }; }
        const late = r.rows.filter(x => x.daysLate > 0);
        return {
          kpis: [{ label: 'POs', value: util.int(new Set(r.rows.map(x => x.po)).size), note: r.rows.length + ' lines' }, { label: 'Overdue lines', value: util.int(late.length), note: late.length ? 'Longest ' + Math.max.apply(null, late.map(x => x.daysLate)) + ' days late' : 'All on time' }, { label: 'Value due', value: short(r.totals.value) }],
          sections: [fromBuilder(r, 'Lines outstanding', c => c.key !== 'poDate' && c.key !== 'status')]
        };
      }
    },
    {
      id: 'returns', group: 'Receiving', title: 'Returns to Supplier', icon: 'undo', period: true,
      desc: 'Rejected and returned goods in the period, the reason, and whether they were collected or credited.',
      build(p) {
        const rs = store.list('supplierReturns').filter(r => inP(r.date, p)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const rows = [];
        rs.forEach(r => { const po = store.get('purchaseOrders', r.poId) || {}; (r.items || []).forEach(i => rows.push([r.number, r.date, po.poNumber || '—', domain.supplierName(r.supplierId) || po.supplierName || '', i.description, util.num(i.qty), i.reason || '', r.status])); });
        return {
          kpis: [{ label: 'Returns', value: util.int(rs.length) }, { label: 'Open', value: util.int(rs.filter(r => r.status === 'Open').length) }, { label: 'Credited', value: util.int(rs.filter(r => r.status === 'Credited').length) }],
          sections: [{ title: 'Returned items', columns: [{ label: 'Return' }, { label: 'Date', type: 'date' }, { label: 'PO' }, { label: 'Supplier' }, { label: 'Item' }, { label: 'Qty', type: 'num' }, { label: 'Reason' }, { label: 'Status' }], rows, empty: 'No returns to suppliers in this period.' }]
        };
      }
    },
    {
      id: 'suppliers', group: 'Receiving', title: 'Supplier Delivery Performance', icon: 'award', period: true,
      desc: 'For each supplier: deliveries, on-time rate, average days late, part deliveries and rejections.',
      build(p) {
        const r = B().suppliers(p.from, p.to);
        const all = util.sum(r.rows, x => x.deliveries), on = util.sum(r.rows, x => x.onTime);
        return {
          kpis: [{ label: 'Suppliers', value: util.int(r.rows.length) }, { label: 'Deliveries', value: util.int(all) }, { label: 'On time', value: (all ? Math.round(on / all * 100) : 0) + '%' }, { label: 'Units rejected', value: util.int(util.sum(r.rows, x => x.rejected)) }],
          chart: { title: 'Deliveries by supplier', rows: r.rows.map(x => ({ label: x.supplier, value: x.deliveries })) },
          sections: [fromBuilder(r, 'Suppliers')]
        };
      }
    },

    /* --------------------------------------------------- Issues */
    {
      id: 'consumption', group: 'Issues to departments', title: 'Consumption by Department', icon: 'chart', period: true, filters: [F.department],
      desc: 'What each department drew from Stores in the period, at cost, with its largest items.',
      build(p) {
        const r = B().consumption(p.from, p.to);
        if (p.filters.department) r.rows = r.rows.filter(x => x.department === p.filters.department);
        r.totals = { value: util.sum(r.rows, x => x.value), lines: util.sum(r.rows, x => x.lines) };
        const iss = issuesIn(p).filter(m => !p.filters.department || (m.department || 'Unspecified') === p.filters.department);
        const byItem = util.groupBy(iss, m => m.itemId);
        const items = Object.keys(byItem).map(k => { const it = itemOf(k); return [it.code || '', it.name || byItem[k][0].itemName || '', it.unit || '', util.round2(-util.sum(byItem[k], m => util.num(m.qty))), util.round2(util.sum(byItem[k], m => abs(m.value)))]; }).sort((a, b) => b[4] - a[4]);
        return {
          kpis: [{ label: 'Departments', value: util.int(r.rows.length) }, { label: 'Value issued', value: short(r.totals.value) }, { label: 'Issue lines', value: util.int(r.totals.lines) }, { label: 'Different items', value: util.int(items.length) }],
          chart: { title: 'Value issued by department', rows: r.rows.map(x => ({ label: x.department, value: x.value })), money: true },
          sections: [fromBuilder(r, 'By department'), { title: 'By item', optional: true, columns: [{ label: 'Code' }, { label: 'Item' }, { label: 'Unit' }, { label: 'Qty issued', type: 'num' }, { label: 'Value', type: 'money' }], rows: items, totals: items.length ? [['Total', '', '', '', util.round2(util.sum(items, x => x[4]))]] : null, empty: 'Nothing issued in this period.' }]
        };
      }
    },
    {
      id: 'sivs', group: 'Issues to departments', title: 'Issue Voucher Register', icon: 'receipt', period: true, filters: [F.department, F.sivStatus],
      desc: 'Every stores issue voucher (department requisition) in the period: requested, approved and issued.',
      build(p) {
        const list = store.list('stockIssues').filter(s => inP(s.date, p) && (!p.filters.department || s.department === p.filters.department) && (!p.filters.status || s.status === p.filters.status)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const val = s => util.round2(util.sum(s.lines || [], l => util.num(l.qtyIssued) * util.num(itemOf(l.itemId).avgCost)));
        const byStatus = util.groupBy(list, s => s.status);
        const turn = list.filter(s => s.issuedAt).map(s => util.daysBetween(s.date, String(s.issuedAt).slice(0, 10))).filter(d => d >= 0);
        return {
          kpis: [{ label: 'Vouchers', value: util.int(list.length) }, { label: 'Issued', value: util.int((byStatus.Issued || []).length + (byStatus['Part issued'] || []).length) }, { label: 'Waiting', value: util.int((byStatus.Requested || []).length + (byStatus.Approved || []).length) }, { label: 'Average turnaround', value: turn.length ? util.round2(util.sum(turn) / turn.length) + ' days' : '—' }],
          sections: [{ title: 'Vouchers', columns: [{ label: 'Voucher' }, { label: 'Date', type: 'date' }, { label: 'Department' }, { label: 'Requested by' }, { label: 'Priority' }, { label: 'Lines', type: 'num' }, { label: 'Status' }, { label: 'Issued', type: 'date' }, { label: 'Value issued', type: 'money' }],
            rows: list.map(s => [s.number, s.date, s.department || '', s.requestedBy || '', s.priority || 'Normal', (s.lines || []).length, s.status, s.issuedAt ? String(s.issuedAt).slice(0, 10) : '', val(s)]),
            totals: list.length ? [['Total', '', '', '', '', util.sum(list, s => (s.lines || []).length), '', '', util.round2(util.sum(list, val))]] : null, empty: 'No issue vouchers in this period.' }]
        };
      }
    }
  ];

  Proc.reportPdf.register(REPORTS);
})();
