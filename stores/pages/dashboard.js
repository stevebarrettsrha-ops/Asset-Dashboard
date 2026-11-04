/* General Stores — Dashboard, plus helpers shared by the stores pages
   (issues.js, reports.js, admin.js use Proc.storesC). */
(function () {
  'use strict';
  const { util, ui, store, domain } = Proc;
  const esc = util.esc;
  Proc.storesSettingsHooks = Proc.storesSettingsHooks || [];

  /* ------------------------------------------------------------ helpers */
  const C = Proc.storesC = Proc.storesC || {};
  C.S = () => store.settings().stores || {};
  C.items = () => store.list('stockItems').filter(i => i.status !== 'Inactive');
  C.SIV_TONE = { Requested: 'warning', Approved: 'info', Issued: 'success', 'Part issued': 'purple', Rejected: 'danger', Cancelled: '' };
  C.sivBadge = s => ui.badge(s, C.SIV_TONE[s] !== undefined ? C.SIV_TONE[s] : '');
  C.openIssueStatuses = ['Requested', 'Approved', 'Part issued'];
  /** Batches expiring within `days` (or already expired). Rows: { item, batch, daysLeft, value } */
  C.expiring = function (days) {
    const today = util.today(); const out = [];
    C.items().forEach(it => (it.batches || []).forEach(b => {
      if (!b.expiryDate || !(util.num(b.qty) > 0)) return;
      const d = util.daysBetween(today, b.expiryDate);
      if (d !== null && d <= days) out.push({ item: it, batch: b, daysLeft: d, value: util.round2(util.num(b.qty) * util.num(it.avgCost)) });
    }));
    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  };
  /** Outstanding stock quantity already on order for an item (matches PO line text to the item). */
  C.onOrder = function (item, inbound) {
    const k = domain.stockKey(item.name); const code = (item.code || '').toLowerCase();
    return util.sum((inbound || domain.inbound({ type: 'Stock' })).filter(r => { const d = String(r.line.description || ''); return domain.stockKey(d) === k || (code && d.toLowerCase().indexOf(code) >= 0) || (r.line.itemId && r.line.itemId === item.id); }), r => r.outstanding);
  };
  /** Items at or below their reorder level, with a suggested order quantity. */
  C.reorderRows = function () {
    const inb = domain.inbound({ type: 'Stock' });
    const today = util.today();
    const expiredOf = i => util.sum((i.batches || []).filter(b => b.expiryDate && b.expiryDate < today), b => b.qty);
    return C.items().filter(i => util.num(i.reorderLevel) > 0 && util.num(i.onHand) - expiredOf(i) <= util.num(i.reorderLevel)).map(i => {
      const onOrder = C.onOrder(i, inb);
      const expired = expiredOf(i), usable = Math.max(0, util.num(i.onHand) - expired);
      // Stock position = usable stock on hand + already on order. Only order when it is at or below the reorder level.
      const position = usable + onOrder;
      const covered = position > util.num(i.reorderLevel);
      const suggest = covered ? 0 : Math.max(0, Math.ceil(util.num(i.reorderQty) || Math.max(util.num(i.maxLevel) - position, util.num(i.reorderLevel) * 2 - position, 1)));
      const lastSup = (i.supplierIds || []).slice(-1)[0];
      return { item: i, onOrder, covered, suggest, expired, usable, cost: util.num(i.lastCost) || util.num(i.avgCost), supplier: lastSup ? domain.supplierName(lastSup) : '' };
    }).sort((a, b) => a.usable - b.usable);
  };
  C.putAway = () => store.filter('deliveries', d => d.recordedIn === 'procurement' && !d.stocked && !d.voided);
  C.monthKeys = function (n) { const out = []; const d = new Date(); d.setDate(1); for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')); } return out; };
  C.css = function (id, css) { if (!document.getElementById(id)) document.head.insertAdjacentHTML('beforeend', '<style id="' + id + '">' + css + '</style>'); };
  /** Department <select>: hospital list from Location Records when available. */
  C.deptSelect = function (sel, value) {
    if (typeof window.mphPopulateDeptSelect === 'function') { try { window.mphPopulateDeptSelect(sel, { firstOption: { value: '', label: 'Select department' } }); } catch (e) { /* ignore */ } }
    if (sel.options.length <= 1) {
      const seen = new Set(store.list('stockIssues').map(s => s.department).concat(store.list('stockMoves').map(m => m.department)).filter(Boolean));
      sel.innerHTML = '<option value="">Select department</option>' + Array.from(seen).sort().map(d => '<option>' + esc(d) + '</option>').join('');
    }
    if (value && !Array.from(sel.options).some(o => o.value === value)) sel.insertAdjacentHTML('beforeend', '<option>' + esc(value) + '</option>');
    sel.value = value || '';
  };
  /** Small Excel helper: rows of objects (header → value). */
  C.excel = function (sheets, filename) {
    if (!window.XLSX) return ui.toast('The Excel library did not load.', 'error');
    const wb = XLSX.utils.book_new();
    sheets.forEach(s => { const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Note: 'No records' }]); if (s.cols) ws['!cols'] = s.cols.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31)); });
    XLSX.writeFile(wb, filename);
  };

  /* ---------------------------------------------------------- dashboard */
  const CSS = '.sd-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px;align-items:start}@media(max-width:1180px){.sd-grid{grid-template-columns:minmax(0,1fr)}}' +
    '.sd-att{list-style:none}.sd-att li a{display:flex;gap:12px;align-items:flex-start;padding:12px 18px;border-bottom:1px solid var(--border);color:var(--text);text-decoration:none}.sd-att li:last-child a{border-bottom:0}.sd-att li a:hover{background:var(--surface-2)}' +
    '.sd-att .ic{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:none}.sd-att .ic.warning{background:var(--warning-bg);color:var(--warning)}.sd-att .ic.danger{background:var(--danger-bg);color:var(--danger)}.sd-att .ic.info{background:var(--info-bg);color:var(--info)}.sd-att .ic.purple{background:var(--purple-bg);color:var(--purple)}' +
    '.sd-att .t{font-weight:600;font-size:13.5px}.sd-att .s{font-size:12.5px;color:var(--text-3);margin-top:1px}.sd-att .go{margin-left:auto;color:var(--text-3);align-self:center}' +
    '.sd-pair{display:flex;align-items:flex-end;gap:10px;height:190px;padding-top:8px}.sd-pair .m{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end;min-width:0}' +
    '.sd-pair .cols{display:flex;gap:3px;align-items:flex-end;height:100%;width:100%;justify-content:center}.sd-pair .c{width:42%;max-width:22px;border-radius:5px 5px 2px 2px;min-height:2px}.sd-pair .c.r{background:var(--primary)}.sd-pair .c.i{background:#f59e0b}' +
    '.sd-pair .x{font-size:11px;color:var(--text-3)}.sd-legend{display:flex;gap:14px;font-size:12px;color:var(--text-2)}.sd-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}';

  function attention() {
    const out = [];
    const inb = domain.inbound();
    const byPo = util.groupBy(inb.filter(r => r.overdue), r => r.po.id);
    Object.keys(byPo).sort((a, b) => byPo[b][0].daysLate - byPo[a][0].daysLate).slice(0, 4).forEach(id => {
      const rs = byPo[id], po = rs[0].po;
      out.push({ tone: 'danger', icon: 'truck', t: 'PO ' + po.poNumber + ' overdue ' + rs[0].daysLate + ' ' + util.plural(rs[0].daysLate, 'day') + ' — ' + (po.supplierName || ''), s: rs.length + ' ' + util.plural(rs.length, 'line') + ' outstanding · expected ' + util.date(rs[0].expected), href: '#/inbound?po=' + id });
    });
    const pa = C.putAway();
    if (pa.length) out.push({ tone: 'purple', icon: 'package', t: pa.length + ' ' + util.plural(pa.length, 'delivery', 'deliveries') + ' recorded by Procurement to put into stock', s: pa.slice(0, 3).map(d => 'GRN ' + (d.grn || '—')).join(', '), href: '#/inbound?tab=putaway' });
    const ro = C.reorderRows();
    if (ro.length) out.push({ tone: 'warning', icon: 'alert', t: ro.length + ' ' + util.plural(ro.length, 'item') + ' at or below reorder level', s: ro.slice(0, 3).map(r => r.item.name).join(', ') + ' — request a purchase', href: '#/issues?tab=reorder' });
    const ex = C.expiring(util.num(C.S().expiryWarnDays || 90));
    const expired = ex.filter(x => x.daysLeft < 0);
    if (expired.length) out.push({ tone: 'danger', icon: 'clock', t: expired.length + ' expired ' + util.plural(expired.length, 'batch', 'batches') + ' still in stock', s: util.money(util.sum(expired, x => x.value)) + ' · write off or return', href: '#/reports?tab=expiry' });
    if (ex.length - expired.length) out.push({ tone: 'warning', icon: 'clock', t: (ex.length - expired.length) + ' ' + util.plural(ex.length - expired.length, 'batch', 'batches') + ' expiring within ' + (C.S().expiryWarnDays || 90) + ' days', s: ex.filter(x => x.daysLeft >= 0).slice(0, 3).map(x => x.item.name + ' (' + x.daysLeft + 'd)').join(', '), href: '#/reports?tab=expiry' });
    const waiting = store.filter('stockIssues', s => C.openIssueStatuses.indexOf(s.status) >= 0);
    if (waiting.length) out.push({ tone: 'info', icon: 'clipboard', t: waiting.length + ' department ' + util.plural(waiting.length, 'requisition') + ' waiting', s: waiting.slice(0, 3).map(s => s.number + ' · ' + s.department).join(', '), href: '#/issues' });
    const rtn = store.filter('supplierReturns', r => r.status === 'Open');
    if (rtn.length) out.push({ tone: 'info', icon: 'undo', t: rtn.length + ' supplier ' + util.plural(rtn.length, 'return') + ' awaiting collection', s: rtn.slice(0, 3).map(r => (r.number || '') + ' · ' + domain.supplierName(r.supplierId)).join(', '), href: '#/inbound?tab=returns' });
    const un = Proc.notifications.unread();
    if (un.length) out.push({ tone: 'info', icon: 'bell', t: un.length + ' unread ' + util.plural(un.length, 'notification'), s: un[0].title, href: Proc.notifications.href(un[0]) || '#/inbound' });
    return out;
  }

  function render(el) {
    C.css('css-sdash', CSS);
    const S = C.S(); const off = domain.officer();
    const items = C.items();
    const inb = domain.inbound();
    const today = util.today(), week = util.addDays(today, 7);
    const poIds = new Set(inb.map(r => r.po.id));
    const overduePOs = new Set(inb.filter(r => r.overdue).map(r => r.po.id));
    const dueWeek = new Set(inb.filter(r => !r.overdue && r.expected <= week).map(r => r.po.id));
    const low = items.filter(i => util.num(i.reorderLevel) > 0 && util.num(i.onHand) > 0 && util.num(i.onHand) <= util.num(i.reorderLevel));
    const out = items.filter(i => util.num(i.onHand) <= 0);
    const exp = C.expiring(util.num(S.expiryWarnDays || 90));
    const waiting = store.filter('stockIssues', s => C.openIssueStatuses.indexOf(s.status) >= 0);
    const hour = new Date().getHours();
    const first = String(off.name || '').replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, '').split(' ')[0];
    const fresh = !items.length && !inb.length && !store.list('stockMoves').length;

    el.innerHTML = ui.pageHead({
      title: 'Good ' + (hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening') + (first ? ', ' + first : ''),
      sub: esc(S.storeName || 'General Stores') + ' · ' + util.dateLong(today) + ' · FY ' + util.fiscalYear(today),
      actions: '<a class="btn" href="#/issues/new">' + ui.icon('clipboard', 'sm') + 'New issue</a><a class="btn primary" href="#/inbound">' + ui.icon('truck', 'sm') + 'Receive goods</a>'
    }) +
      (fresh ? '<div class="card mb-3">' + ui.empty('box', 'Welcome to General Stores', 'Purchase orders issued by Procurement appear under Expected Deliveries automatically. Receive them with a goods received note and the items are added to Inventory. If you used the old Stores page, import its data under Settings.',
        '<div class="row" style="justify-content:center"><a class="btn primary" href="#/inbound">' + ui.icon('truck', 'sm') + 'Expected deliveries</a><a class="btn" href="#/inventory">' + ui.icon('box', 'sm') + 'Inventory</a><a class="btn" href="#/settings/' + (Proc.storesSettingsHooks.findIndex(h => h.id === 'migrate') >= 0 ? 'hook' + Proc.storesSettingsHooks.findIndex(h => h.id === 'migrate') : 'data') + '">' + ui.icon('upload', 'sm') + 'Import old Stores data</a></div>') + '</div>' : '') +
      '<div class="grid c3 mb-3" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">' +
      ui.kpi({ label: 'Stock value', icon: 'wallet', value: util.moneyShort(util.sum(items, i => i.value)), title: util.money(util.sum(items, i => i.value)), meta: util.int(items.length) + ' items · ' + util.int(items.filter(i => util.num(i.onHand) > 0).length) + ' in stock', href: '#/inventory' }) +
      ui.kpi({ label: 'Below reorder level', icon: 'alert', tone: low.length ? 'warn' : 'ok', value: util.int(low.length), meta: 'Request a purchase', href: '#/issues?tab=reorder' }) +
      ui.kpi({ label: 'Out of stock', icon: 'box', tone: out.length ? 'bad' : 'ok', value: util.int(out.length), meta: 'Active items with none on hand', href: '#/inventory' }) +
      ui.kpi({ label: 'Expiring soon', icon: 'clock', tone: exp.length ? 'warn' : 'ok', value: util.int(exp.length), meta: 'Batches within ' + (S.expiryWarnDays || 90) + ' days', href: '#/reports?tab=expiry' }) +
      ui.kpi({ label: 'Deliveries due', icon: 'truck', tone: overduePOs.size ? 'bad' : '', value: util.int(dueWeek.size), meta: overduePOs.size ? overduePOs.size + ' overdue · ' + poIds.size + ' POs open' : 'This week · ' + poIds.size + ' POs open', href: '#/inbound' }) +
      ui.kpi({ label: 'Requisitions waiting', icon: 'clipboard', tone: waiting.length ? 'pur' : 'ok', value: util.int(waiting.length), meta: 'To approve or issue', href: '#/issues' }) +
      '</div>' +
      '<div class="sd-grid"><div class="stack">' +
      '<div class="card"><div class="card-h"><div><h3>Receipts and issues</h3><div class="sub">Value by month, last 6 months</div></div><div class="sd-legend"><span><i style="background:var(--primary)"></i>Received</span><span><i style="background:#f59e0b"></i>Issued</span></div></div><div class="card-b" id="sdPair"></div></div>' +
      '<div class="grid c2"><div class="card"><div class="card-h"><div><h3>Recent goods received</h3></div><a class="small" href="#/inbound?tab=received">All GRNs</a></div><div class="card-b flush" id="sdGrn"></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Recent issues</h3></div><a class="small" href="#/issues">All</a></div><div class="card-b flush" id="sdIss"></div></div></div>' +
      '</div><div class="stack">' +
      '<div class="card"><div class="card-h"><h3>Needs your attention</h3></div><ul class="sd-att" id="sdAtt"></ul></div>' +
      '<div class="card"><div class="card-h"><div><h3>Issued this month by department</h3><div class="sub">Value at average cost</div></div></div><div class="card-b" id="sdDept"></div></div>' +
      '</div></div>';

    // Attention
    const att = attention();
    el.querySelector('#sdAtt').innerHTML = att.length ? att.map(a => '<li><a href="' + esc(a.href) + '"><span class="ic ' + a.tone + '">' + ui.icon(a.icon, 'sm') + '</span><span style="min-width:0"><div class="t">' + esc(a.t) + '</div><div class="s">' + esc(a.s || '') + '</div></span><span class="go">' + ui.icon('chevron-right', 'sm') + '</span></a></li>').join('')
      : '<li>' + ui.empty('check', 'All clear', 'No overdue deliveries, shortages or expiring stock.') + '</li>';

    // Receipts vs issues by month
    const moves = store.list('stockMoves');
    const months = C.monthKeys(6);
    const data = months.map(m => ({ m, r: util.sum(moves.filter(x => util.monthKey(x.date) === m && x.qty > 0 && (x.type === 'Receipt' || x.type === 'Opening')), x => x.value), i: Math.abs(util.sum(moves.filter(x => util.monthKey(x.date) === m && x.type === 'Issue'), x => x.value)) }));
    const max = Math.max.apply(null, data.map(d => Math.max(d.r, d.i)).concat([1]));
    el.querySelector('#sdPair').innerHTML = data.some(d => d.r || d.i) ? '<div class="sd-pair">' + data.map(d => '<div class="m" title="' + esc(util.monthLabel(d.m) + ' — received ' + util.money(d.r) + ', issued ' + util.money(d.i)) + '"><div class="cols"><div class="c r" style="height:' + (d.r / max * 100) + '%"></div><div class="c i" style="height:' + (d.i / max * 100) + '%"></div></div><div class="x">' + esc(util.monthLabel(d.m).slice(0, 3)) + '</div></div>').join('') + '</div>'
      : ui.empty('chart', 'No stock movements yet', 'Receipts and issues will chart here.');

    // Department chart
    const mk = util.monthKey(today);
    const iss = moves.filter(x => x.type === 'Issue' && util.monthKey(x.date) === mk);
    const byDept = util.groupBy(iss, x => x.department || 'Unspecified');
    const dd = Object.keys(byDept).map(k => ({ label: k, value: Math.abs(util.sum(byDept[k], x => x.value)) })).sort((a, b) => b.value - a.value).slice(0, 8);
    el.querySelector('#sdDept').innerHTML = dd.length ? ui.hbars(dd) : ui.empty('chart', 'Nothing issued yet this month');

    // Recent GRNs
    const grns = store.list('deliveries').slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 6);
    el.querySelector('#sdGrn').innerHTML = grns.length ? '<table class="table compact"><tbody>' + grns.map(d => { const po = store.get('purchaseOrders', d.poId) || {}; return '<tr class="click" data-href="#/grn/' + esc(d.id) + '"><td><div class="t-title">' + esc(d.grn || 'GRN') + '</div><div class="t-sub">PO ' + esc(po.poNumber || '—') + ' · ' + esc(po.supplierName || domain.supplierName(d.supplierId)) + '</div></td><td class="right nowrap small">' + util.date(d.date) + (d.recordedIn === 'procurement' && !d.stocked ? '<div>' + ui.badge('To put away', 'purple') + '</div>' : '') + '</td></tr>'; }).join('') + '</tbody></table>'
      : ui.empty('truck', 'No goods received yet');
    // Recent issues
    const sivs = store.list('stockIssues').slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 6);
    el.querySelector('#sdIss').innerHTML = sivs.length ? '<table class="table compact"><tbody>' + sivs.map(s => '<tr class="click" data-href="#/issues/' + esc(s.id) + '"><td><div class="t-title">' + esc(s.number) + '</div><div class="t-sub">' + esc(s.department || '') + ' · ' + (s.lines || []).length + ' ' + util.plural((s.lines || []).length, 'line') + '</div></td><td class="right">' + C.sivBadge(s.status) + '</td></tr>').join('') + '</tbody></table>'
      : ui.empty('clipboard', 'No issues yet');
    el.querySelectorAll('tr[data-href]').forEach(tr => tr.onclick = () => { location.hash = tr.dataset.href; });
  }

  Proc.page({ id: 'dashboard', title: 'Dashboard', icon: 'dashboard', section: 'Overview', order: 10, render });
  Proc.quickCreate.push({ label: 'Stores requisition / issue', icon: 'clipboard', order: 20, onClick: () => Proc.router.go('issues/new') });
  Proc.quickCreate.push({ label: 'Purchase request to Procurement', icon: 'send', order: 30, onClick: () => { location.hash = '#/issues?tab=reorder'; } });
})();
