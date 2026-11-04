/* General Stores — Issues & Requisitions:
   department requisitions → approve → issue (FEFO) → Stores Issue Voucher (SIV);
   Reorder: items at reorder level → purchase request to Procurement. */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc;
  const C = Proc.storesC;
  const STATUSES = ['Requested', 'Approved', 'Part issued', 'Issued', 'Rejected', 'Cancelled'];
  const PRIORITIES = ['Normal', 'Urgent', 'Emergency'];
  const CSS = '.si-lines td{vertical-align:middle}.si-lines input.input{height:34px}.si-lines .oh{font-size:12px;color:var(--text-3)}.si-find{position:relative}' +
    '.si-short{color:var(--danger);font-weight:600}.si-ok{color:var(--success)}.si-batch{font-size:12px;color:var(--text-3)}.si-sum{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--text-2)}';

  const itemLabel = i => i.code + ' — ' + i.name;
  function itemsDatalist() {
    let dl = document.getElementById('dl-stock-items');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'dl-stock-items'; document.body.appendChild(dl); }
    dl.innerHTML = C.items().slice().sort((a, b) => a.name.localeCompare(b.name)).map(i => '<option value="' + esc(itemLabel(i)) + '">' + esc(util.num(i.onHand) + ' ' + (i.unit || '') + ' on hand') + '</option>').join('');
    return 'dl-stock-items';
  }
  /** "STK-0001 — Paper", a bare code (barcode scanner) or a name → stock item. */
  function resolveItem(text) {
    const t = String(text || '').trim(); if (!t) return null;
    const code = t.split(' — ')[0].trim();
    return domain.findStockItem(code) || domain.findStockItem(t);
  }
  const lineTotal = s => (s.lines || []).length;
  const issuedValue = s => util.sum(store.filter('stockMoves', m => m.issueId === s.id), m => Math.abs(m.value));

  /* ================================================================ LIST */
  function renderList(el) {
    const q = router.parse().query; const tab = q.tab || 'requisitions';
    const all = store.list('stockIssues');
    const waiting = all.filter(s => C.openIssueStatuses.indexOf(s.status) >= 0).length;
    const reorderN = C.reorderRows().length;
    const sent = store.filter('requisitions', r => r.source === 'stores');
    el.innerHTML = ui.pageHead({ title: 'Issues & Requisitions', sub: 'Department requisitions, stock issues on a Stores Issue Voucher, and purchase requests to Procurement.',
      actions: '<a class="btn primary" href="#/issues/new">' + ui.icon('plus', 'sm') + 'New requisition</a>' }) +
      '<div class="tabs"><button data-t="requisitions" class="' + (tab === 'requisitions' ? 'on' : '') + '">' + ui.icon('clipboard', 'sm') + 'Requisitions & issues<span class="n">' + waiting + '</span></button>' +
      '<button data-t="reorder" class="' + (tab === 'reorder' ? 'on' : '') + '">' + ui.icon('alert', 'sm') + 'Reorder<span class="n">' + reorderN + '</span></button>' +
      '<button data-t="sent" class="' + (tab === 'sent' ? 'on' : '') + '">' + ui.icon('send', 'sm') + 'Purchase requests sent<span class="n">' + sent.length + '</span></button></div><div id="siBody"></div>';
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { location.hash = '#/issues?tab=' + b.dataset.t; });
    const body = el.querySelector('#siBody');
    if (tab === 'reorder') return renderReorder(body);
    if (tab === 'sent') return renderSent(body, sent);
    let seg = q.status || 'open';
    const draw = () => {
      const rows = all.filter(s => seg === 'all' ? true : seg === 'open' ? C.openIssueStatuses.indexOf(s.status) >= 0 : s.status === seg);
      body.innerHTML = '<div class="row mb-2"><div class="seg" id="siSeg">' + [['open', 'Open'], ['Requested', 'Requested'], ['Approved', 'Approved'], ['Part issued', 'Part issued'], ['Issued', 'Issued'], ['Rejected', 'Rejected'], ['all', 'All']].map(([k, l]) =>
        '<button data-s="' + k + '" class="' + (seg === k ? 'on' : '') + '">' + l + '<span class="n">' + (k === 'all' ? all.length : k === 'open' ? waiting : all.filter(s => s.status === k).length) + '</span></button>').join('') + '</div></div><div class="card" id="siT"></div>';
      body.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { seg = b.dataset.s; draw(); });
      const depts = Array.from(new Set(all.map(s => s.department).filter(Boolean))).sort();
      ui.table(body.querySelector('#siT'), {
        rows, placeholder: 'Search SIV, department, item…', initialSort: { key: 'date', dir: -1 },
        search: s => [s.number, s.department, s.requestedBy, s.status].concat((s.lines || []).map(l => l.itemName)).join(' '),
        filters: [{ key: 'department', label: 'All departments', options: depts }, { key: 'priority', label: 'Any priority', options: PRIORITIES }],
        onRow: s => router.go('issues/' + s.id),
        toolbar: '<button class="btn sm" data-x>' + ui.icon('download', 'sm') + 'Excel</button>',
        columns: [
          { key: 'number', label: 'SIV', render: s => '<span class="t-title mono">' + esc(s.number) + '</span>', sort: s => s.number },
          { key: 'date', label: 'Date', render: s => '<span class="nowrap">' + util.date(s.date) + '</span>' },
          { key: 'department', label: 'Department', render: s => '<div class="t-title">' + esc(s.department || '—') + '</div><div class="t-sub">' + esc(s.requestedBy || '') + '</div>' },
          { key: 'lines', label: 'Items', render: s => '<div class="truncate" style="max-width:320px">' + esc((s.lines || []).map(l => l.itemName).join(', ')) + '</div><div class="t-sub">' + lineTotal(s) + ' ' + util.plural(lineTotal(s), 'line') + '</div>', sort: s => lineTotal(s) },
          { key: 'priority', label: 'Priority', render: s => s.priority && s.priority !== 'Normal' ? ui.badge(s.priority, s.priority === 'Emergency' ? 'danger' : 'warning') : '<span class="muted">Normal</span>' },
          { key: 'value', label: 'Issued value', cls: 'num', render: s => { const v = issuedValue(s); return v ? util.money(v) : '<span class="muted">—</span>'; }, sort: s => issuedValue(s) },
          { key: 'status', label: 'Status', render: s => C.sivBadge(s.status) }
        ],
        empty: ui.empty('clipboard', all.length ? 'Nothing in this view' : 'No requisitions yet', 'Departments\' requests for stock are recorded here, approved and issued on a Stores Issue Voucher.', all.length ? '' : '<a class="btn primary" href="#/issues/new">' + ui.icon('plus', 'sm') + 'New requisition</a>')
      });
      body.querySelector('[data-x]').onclick = () => C.excel([{ name: 'Issues', cols: [12, 12, 26, 22, 10, 50, 14, 12], rows: rows.map(s => ({ SIV: s.number, Date: s.date, Department: s.department, 'Requested by': s.requestedBy, Priority: s.priority || 'Normal', Items: (s.lines || []).map(l => l.itemName + ' x' + (l.qtyIssued || l.qtyApproved || l.qtyRequested)).join('; '), 'Issued value': issuedValue(s), Status: s.status })) }], 'Stores issues ' + util.today() + '.xlsx');
    };
    draw();
  }

  /* ---------------------------------------------------------- reorder */
  function renderReorder(body) {
    const rows = C.reorderRows();
    const pick = new Map(rows.map(r => [r.item.id, { on: r.suggest > 0, qty: r.suggest }]));
    body.innerHTML = '<div class="alert mb-2">' + ui.icon('info') + '<div>Items at or below their reorder level. Quantities already on order from Procurement are shown so you don\'t double-order. Tick the items, adjust quantities, and send one purchase request to Procurement — it arrives as a requisition with a notification.</div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Below reorder level</h3><div class="sub" id="roSum"></div></div><div class="row"><button class="btn sm" data-x>' + ui.icon('download', 'sm') + 'Excel</button><button class="btn primary" data-send>' + ui.icon('send', 'sm') + 'Send purchase request</button></div></div><div class="card-b flush"><div class="table-wrap"><table class="table"><thead><tr><th style="width:36px"><input type="checkbox" data-all></th><th>Item</th><th class="num">On hand</th><th class="num">Reorder at</th><th class="num">On order</th><th>Last supplier</th><th class="num">Last cost</th><th class="num" style="width:120px">Order qty</th><th class="num">Est. value</th></tr></thead><tbody>' +
      (rows.length ? rows.map(r => '<tr data-id="' + r.item.id + '"><td><input type="checkbox" data-on' + (pick.get(r.item.id).on ? ' checked' : '') + '></td><td><a class="t-title" href="#/inventory/' + esc(r.item.id) + '">' + esc(r.item.name) + '</a><div class="t-sub">' + esc(r.item.code) + ' · ' + esc(r.item.category || '') + (r.item.lastRequestedAt ? ' · last requested ' + util.date(r.item.lastRequestedAt.slice(0, 10)) : '') + '</div></td>' +
        '<td class="num ' + (util.num(r.item.onHand) <= 0 ? 'si-short' : '') + '">' + util.int(r.item.onHand) + ' ' + esc(r.item.unit || '') + '</td><td class="num">' + util.int(r.item.reorderLevel) + '</td><td class="num">' + (r.onOrder ? util.int(r.onOrder) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + esc(r.supplier || '—') + '</td><td class="num">' + (r.cost ? util.money(r.cost) : '—') + '</td><td class="num"><input class="input sm num" type="number" min="0" step="any" data-qty value="' + r.suggest + '" style="width:100px"></td><td class="num" data-val></td></tr>').join('')
        : '<tr><td colspan="9" style="padding:0">' + ui.empty('check', 'Nothing to reorder', 'Set reorder levels on items in Inventory to have them appear here when stock runs low.') + '</td></tr>') +
      '</tbody></table></div></div></div>';
    const recalc = () => {
      let n = 0, v = 0;
      body.querySelectorAll('tr[data-id]').forEach(tr => { const r = rows.find(x => x.item.id === tr.dataset.id); const on = tr.querySelector('[data-on]').checked; const q = util.num(tr.querySelector('[data-qty]').value); pick.set(r.item.id, { on, qty: q }); const val = q * r.cost; tr.querySelector('[data-val]').textContent = val ? util.money(val) : '—'; if (on && q > 0) { n++; v += val; } });
      const s = body.querySelector('#roSum'); if (s) s.textContent = rows.length + ' ' + util.plural(rows.length, 'item') + ' · ' + n + ' selected · est. ' + util.money(v);
    };
    body.addEventListener('input', recalc); body.addEventListener('change', recalc); recalc();
    const all = body.querySelector('[data-all]'); if (all) all.onchange = () => { body.querySelectorAll('[data-on]').forEach(c => { c.checked = all.checked; }); recalc(); };
    body.querySelector('[data-x]').onclick = () => C.excel([{ name: 'Reorder', cols: [12, 36, 10, 10, 10, 28, 12, 10], rows: rows.map(r => ({ Code: r.item.code, Item: r.item.name, 'On hand': r.item.onHand, 'Reorder level': r.item.reorderLevel, 'On order': r.onOrder, 'Last supplier': r.supplier, 'Last cost': r.cost, 'Order qty': pick.get(r.item.id).qty })) }], 'Reorder list ' + util.today() + '.xlsx');
    body.querySelector('[data-send]').onclick = async () => {
      const chosen = rows.filter(r => pick.get(r.item.id).on && pick.get(r.item.id).qty > 0);
      if (!chosen.length) return ui.toast('Tick at least one item with an order quantity.', 'warning');
      const est = util.sum(chosen, r => pick.get(r.item.id).qty * r.cost);
      const v = await ui.form('Send purchase request to Procurement', [
        { name: 'title', label: 'Title', value: (C.S().storeName || 'General Stores') + ' replenishment — ' + util.date(util.today()), required: true },
        { name: 'priority', label: 'Priority', type: 'select', options: ['Normal', 'Emergency'], value: chosen.some(r => util.num(r.item.onHand) <= 0) ? 'Emergency' : 'Normal', span: 's6' },
        { name: 'neededBy', label: 'Needed by', type: 'date', value: util.addDays(util.today(), 14), span: 's6' },
        { name: 'justification', label: 'Justification', type: 'textarea', rows: 3, value: chosen.length + ' ' + util.plural(chosen.length, 'item is', 'items are') + ' at or below reorder level (' + chosen.filter(r => util.num(r.item.onHand) <= 0).length + ' out of stock). Estimated ' + util.money(est) + ' at last cost.' }
      ], { ok: 'Send to Procurement', size: 'lg' });
      if (!v) return;
      const req = sendRequest(chosen.map(r => ({ item: r.item, qty: pick.get(r.item.id).qty, cost: r.cost })), v);
      ui.toast('Purchase request ' + req.number + ' sent to Procurement');
      location.hash = '#/issues?tab=sent';
    };
  }
  /** Create one Procurement requisition for these items and notify Procurement. lines: [{ item, qty, cost }] */
  function sendRequest(lines, v) {
    const off = domain.officer();
    const items = lines.map(l => ({ id: util.uid('L'), description: l.item.name, unit: l.item.unit || 'each', qty: l.qty, estUnitPrice: util.round2(l.cost), spec: 'Stores code ' + l.item.code + (l.item.category ? ' · ' + l.item.category : ''), stockItemId: l.item.id }));
    const req = store.upsert('requisitions', {
      number: 'REQ-' + store.next('req'), date: util.today(), department: C.S().storeName || 'General Stores', requestedBy: off.name, title: v.title, priority: v.priority === 'Emergency' ? 'Emergency' : 'Normal',
      type: 'Goods', items, estimate: util.round2(util.sum(items, i => i.qty * i.estUnitPrice)), justification: v.justification || '', neededBy: v.neededBy || '', status: 'Submitted', source: 'stores'
    });
    const now = new Date().toISOString();
    lines.forEach(l => store.upsert('stockItems', { id: l.item.id, lastRequestedAt: now, lastRequestId: req.id }, { silent: true }));
    Proc.notify({ to: ['procurement'], type: 'purchase-request', title: 'Purchase request ' + req.number + ' from ' + (C.S().storeName || 'General Stores'), body: items.length + ' ' + util.plural(items.length, 'item') + ' · est. ' + util.money(req.estimate) + (req.priority === 'Emergency' ? ' · EMERGENCY' : ''), link: { app: 'procurement', route: '#/requisitions/' + req.id } });
    Proc.audit('Purchase Request', req.number + ' to Procurement — ' + items.length + ' items, est. ' + util.money(req.estimate), req.id);
    return req;
  }
  Proc.storesC.sendRequest = sendRequest;

  function renderSent(body, sent) {
    const posFor = r => store.filter('purchaseOrders', p => p.requisitionId === r.id || (r.comparisonId && p.comparisonId === r.comparisonId));
    body.innerHTML = '<div class="card" id="snT"></div>';
    ui.table(body.querySelector('#snT'), {
      rows: sent, placeholder: 'Search requests…', initialSort: { key: 'date', dir: -1 },
      search: r => [r.number, r.title, r.status].concat((r.items || []).map(i => i.description)).join(' '),
      columns: [
        { key: 'number', label: 'Request', render: r => '<span class="t-title mono">' + esc(r.number) + '</span><div class="t-sub">' + util.date(r.date) + '</div>' },
        { key: 'title', label: 'Items', render: r => '<div class="t-title">' + esc(r.title) + '</div><div class="t-sub truncate" style="max-width:360px">' + esc((r.items || []).map(i => i.description + ' ×' + i.qty).join(', ')) + '</div>' },
        { key: 'estimate', label: 'Estimate', cls: 'num', render: r => util.money(r.estimate) },
        { key: 'priority', label: 'Priority', render: r => r.priority === 'Emergency' ? ui.badge('Emergency', 'danger') : '<span class="muted">Normal</span>' },
        { key: 'pos', label: 'Purchase orders', render: r => { const p = posFor(r); return p.length ? p.map(x => '<span class="chip">PO ' + esc(x.poNumber || 'draft') + ' · ' + esc(x.status) + '</span>').join(' ') : '<span class="muted">None yet</span>'; }, sort: r => posFor(r).length },
        { key: 'status', label: 'Procurement status', render: r => ui.badge(r.status) }
      ],
      empty: ui.empty('send', 'No purchase requests sent yet', 'Use the Reorder tab to request stock from Procurement.')
    });
  }

  /* ================================================================ NEW */
  function renderNew(el) {
    const off = domain.officer();
    itemsDatalist();
    el.innerHTML = ui.pageHead({ back: { label: 'Issues & Requisitions', href: '#/issues' }, title: 'New requisition', sub: 'Record what a department needs. Save it for approval, or issue straight away.' }) +
      '<div class="card"><div class="card-b"><div class="form-grid">' +
      '<div class="field s4"><label>Department<span class="req">*</span></label><select name="department" id="siDept"></select></div>' +
      '<div class="field s4"><label>Requested by<span class="req">*</span></label><input name="requestedBy" placeholder="Name of the person requesting"></div>' +
      '<div class="field s2"><label>Date</label><input type="date" name="date" value="' + util.today() + '"></div>' +
      '<div class="field s2"><label>Priority</label><select name="priority">' + ui.options(PRIORITIES, 'Normal') + '</select></div>' +
      '<div class="field s12"><label>Notes / purpose</label><input name="notes" placeholder="e.g. Weekly ward top-up"></div></div></div>' +
      '<div class="card-h" style="border-top:1px solid var(--border)"><div><h3>Items</h3><div class="sub">Type or scan an item code or name and press Enter.</div></div></div>' +
      '<div class="card-b"><div class="row mb-2"><div class="si-find" style="flex:1;max-width:520px"><input class="input" id="siFind" list="' + 'dl-stock-items' + '" placeholder="Item code or name — Enter to add" autocomplete="off"></div><button class="btn" id="siAdd">' + ui.icon('plus', 'sm') + 'Add</button></div>' +
      '<div class="table-wrap"><table class="table compact si-lines"><thead><tr><th>#</th><th>Item</th><th class="num">On hand</th><th class="num" style="width:130px">Qty requested</th><th></th></tr></thead><tbody id="siRows"></tbody></table></div></div>' +
      '<div class="card-f"><a class="btn ghost" href="#/issues">Cancel</a><button class="btn" data-save>' + ui.icon('check', 'sm') + 'Save request</button><button class="btn primary" data-issue>' + ui.icon('arrow-up-right', 'sm') + 'Issue now</button></div></div>';
    C.deptSelect(el.querySelector('#siDept'), '');
    const lines = [];
    const tbody = el.querySelector('#siRows');
    const draw = () => {
      tbody.innerHTML = lines.length ? lines.map((l, i) => { const it = store.get('stockItems', l.itemId) || {}; const short = util.num(l.qty) > util.num(it.onHand);
        return '<tr data-i="' + i + '"><td class="muted">' + (i + 1) + '</td><td><div class="t-title">' + esc(it.name) + '</div><div class="t-sub">' + esc(it.code) + ' · ' + esc(it.location || '') + '</div></td><td class="num ' + (short ? 'si-short' : '') + '">' + util.int(it.onHand) + ' ' + esc(it.unit || '') + '</td>' +
          '<td class="num"><input class="input sm num" type="number" min="0" step="any" data-q value="' + esc(l.qty) + '" style="width:110px"></td><td class="actions"><button class="btn xs ghost icon" data-del title="Remove">' + ui.icon('x', 'sm') + '</button></td></tr>'; }).join('')
        : '<tr><td colspan="5" class="muted center" style="padding:24px">No items yet.</td></tr>';
      tbody.querySelectorAll('[data-q]').forEach(inp => inp.oninput = () => { lines[+inp.closest('tr').dataset.i].qty = util.num(inp.value); inp.closest('tr').querySelector('td:nth-child(3)').classList.toggle('si-short', util.num(inp.value) > util.num((store.get('stockItems', lines[+inp.closest('tr').dataset.i].itemId) || {}).onHand)); });
      tbody.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { lines.splice(+b.closest('tr').dataset.i, 1); draw(); });
    };
    const find = el.querySelector('#siFind');
    const add = () => {
      const it = resolveItem(find.value);
      if (!it) { ui.toast('No stock item matches “' + find.value + '”.', 'warning'); find.select(); return; }
      const ex = lines.find(l => l.itemId === it.id);
      if (ex) ex.qty = util.num(ex.qty) + 1; else lines.push({ itemId: it.id, qty: 1 });
      find.value = ''; draw();
      const row = tbody.querySelector('tr[data-i="' + lines.findIndex(l => l.itemId === it.id) + '"] [data-q]'); if (row) { row.focus(); row.select(); }
    };
    find.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    find.addEventListener('change', () => { if (resolveItem(find.value)) add(); });
    el.querySelector('#siAdd').onclick = add;
    draw();
    const collect = () => {
      const f = ui.formData(el.querySelector('.form-grid'));
      const errs = [];
      if (!f.department) errs.push('the department');
      if (!f.requestedBy) errs.push('who is requesting');
      const ls = lines.filter(l => util.num(l.qty) > 0);
      if (!ls.length) errs.push('at least one item with a quantity');
      if (errs.length) { ui.toast('Please add ' + errs.join(', ') + '.', 'warning'); return null; }
      return { f, ls };
    };
    const create = (status, c) => store.upsert('stockIssues', {
      number: 'SIV-' + String(store.next('siv')).padStart(4, '0'), date: c.f.date || util.today(), department: c.f.department, requestedBy: c.f.requestedBy, priority: c.f.priority || 'Normal', notes: c.f.notes, status,
      lines: c.ls.map(l => { const it = store.get('stockItems', l.itemId); return { itemId: it.id, itemCode: it.code, itemName: it.name, unit: it.unit, qtyRequested: util.num(l.qty), qtyApproved: status === 'Approved' ? util.num(l.qty) : null, qtyIssued: 0, batches: [] }; }),
      approvedBy: status === 'Approved' ? off.name : '', approvedAt: status === 'Approved' ? util.today() : ''
    });
    el.querySelector('[data-save]').onclick = () => { const c = collect(); if (!c) return; const s = create('Requested', c); Proc.audit('Stores Requisition', s.number + ' — ' + s.department + ' — ' + s.lines.length + ' lines', s.id); ui.toast(s.number + ' saved for approval'); router.go('issues/' + s.id); };
    el.querySelector('[data-issue]').onclick = async () => {
      const c = collect(); if (!c) return;
      const s = create('Approved', c); Proc.audit('Stores Requisition', s.number + ' — ' + s.department + ' (issued directly)', s.id);
      router.go('issues/' + s.id);
      setTimeout(() => issueDialog(s.id), 120);
    };
    setTimeout(() => find.focus(), 50);
  }

  /* ============================================================= DETAIL */
  function renderDetail(el, id) {
    const s = store.get('stockIssues', id);
    if (!s) { el.innerHTML = ui.empty('clipboard', 'Requisition not found', '', '<a class="btn" href="#/issues">Back</a>'); return; }
    ui.setCrumbs(['Issues & Requisitions', s.number]);
    const step = s.status === 'Requested' ? 0 : s.status === 'Approved' ? 1 : s.status === 'Part issued' ? 1 : s.status === 'Issued' ? 3 : 0;
    const editable = s.status === 'Requested';
    const issuable = s.status === 'Approved' || s.status === 'Part issued';
    const moves = store.filter('stockMoves', m => m.issueId === s.id);
    let primary = '';
    if (editable) primary = '<button class="btn primary" data-a="approve">' + ui.icon('check', 'sm') + 'Approve</button>';
    else if (issuable) primary = '<button class="btn primary" data-a="issue">' + ui.icon('arrow-up-right', 'sm') + 'Issue stock</button>';
    el.innerHTML = ui.pageHead({ back: { label: 'Issues & Requisitions', href: '#/issues' }, title: s.number, badge: C.sivBadge(s.status),
      sub: esc(s.department || '') + ' · requested by ' + esc(s.requestedBy || '') + ' · ' + util.dateLong(s.date) + (s.priority && s.priority !== 'Normal' ? ' · <b>' + esc(s.priority) + '</b>' : ''),
      actions: '<button class="btn" data-a="print">' + ui.icon('printer', 'sm') + 'Issue voucher</button>' + primary + '<button class="btn icon" data-a="more" title="More">' + ui.icon('more') + '</button>' }) +
      (s.status === 'Rejected' || s.status === 'Cancelled' ? '' : '<div class="card mb-3"><div class="card-b">' + ui.stepper(['Requested', 'Approved', 'Issued', 'Received by department'], step) + '</div></div>') +
      (s.rejectReason ? '<div class="alert danger mb-2">' + ui.icon('alert') + '<div><div class="t">' + esc(s.status) + '</div>' + esc(s.rejectReason) + '</div></div>' : '') +
      '<div class="grid side"><div class="card"><div class="card-h"><div><h3>Items</h3>' + (editable ? '<div class="sub">Adjust the approved quantities, then approve.</div>' : '') + '</div></div><div class="card-b flush"><div class="table-wrap"><table class="table si-lines"><thead><tr><th>Item</th><th class="num">On hand</th><th class="num">Requested</th><th class="num">Approved</th><th class="num">Issued</th><th>Batches issued</th></tr></thead><tbody>' +
      s.lines.map((l, i) => { const it = store.get('stockItems', l.itemId) || {}; const outst = util.num(l.qtyApproved !== null && l.qtyApproved !== undefined ? l.qtyApproved : l.qtyRequested) - util.num(l.qtyIssued);
        return '<tr><td><a class="t-title" href="#/inventory/' + esc(l.itemId) + '">' + esc(l.itemName) + '</a><div class="t-sub">' + esc(l.itemCode || '') + ' · ' + esc(l.unit || '') + '</div></td>' +
          '<td class="num ' + (issuable && util.num(it.onHand) < outst ? 'si-short' : '') + '">' + util.int(it.onHand) + '</td><td class="num">' + util.int(l.qtyRequested) + '</td>' +
          '<td class="num">' + (editable ? '<input class="input sm num" type="number" min="0" step="any" data-appr="' + i + '" value="' + esc(l.qtyRequested) + '" style="width:100px">' : (l.qtyApproved !== null && l.qtyApproved !== undefined ? util.int(l.qtyApproved) : '—')) + '</td>' +
          '<td class="num ' + (util.num(l.qtyIssued) && outst <= 0 ? 'si-ok' : '') + '">' + util.int(l.qtyIssued || 0) + '</td><td class="si-batch">' + ((l.batches || []).length ? l.batches.map(b => esc((b.batchNo || 'no batch') + (b.expiryDate ? ' · exp ' + util.date(b.expiryDate) : '') + ' × ' + b.qty)).join('<br>') : '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>' +
      '<div class="stack"><div class="card"><div class="card-h"><h3>Details</h3></div><div class="card-b"><dl class="kv tight">' +
      '<dt>Department</dt><dd>' + esc(s.department || '—') + '</dd><dt>Requested by</dt><dd>' + esc(s.requestedBy || '—') + '</dd><dt>Priority</dt><dd>' + esc(s.priority || 'Normal') + '</dd>' +
      '<dt>Approved by</dt><dd>' + esc(s.approvedBy || '—') + (s.approvedAt ? ' · ' + util.date(s.approvedAt) : '') + '</dd><dt>Issued by</dt><dd>' + esc(s.issuedBy || '—') + (s.issuedAt ? ' · ' + util.date(s.issuedAt) : '') + '</dd>' +
      '<dt>Received by</dt><dd>' + esc(s.receivedBy || '—') + '</dd><dt>Issued value</dt><dd>' + util.money(util.sum(moves, m => Math.abs(m.value))) + '</dd>' + (s.notes ? '<dt>Notes</dt><dd>' + esc(s.notes) + '</dd>' : '') + '</dl></div></div>' +
      (moves.length ? '<div class="card"><div class="card-h"><h3>Stock movements</h3></div><div class="card-b flush"><table class="table compact"><tbody>' + moves.map(m => '<tr><td>' + util.date(m.date) + '</td><td>' + esc(m.itemName) + '</td><td class="num">' + m.qty + '</td><td class="num">' + util.money(Math.abs(m.value)) + '</td></tr>').join('') + '</tbody></table></div></div>' : '') +
      '</div></div>';
    const act = a => el.querySelector('[data-a="' + a + '"]');
    act('print').onclick = () => printSIV(s.id);
    if (act('approve')) act('approve').onclick = () => {
      const lines = s.lines.map((l, i) => Object.assign({}, l, { qtyApproved: util.num(el.querySelector('[data-appr="' + i + '"]').value) }));
      if (!lines.some(l => l.qtyApproved > 0)) return ui.toast('Approve at least one quantity, or reject the requisition.', 'warning');
      store.upsert('stockIssues', { id: s.id, lines, status: 'Approved', approvedBy: domain.officer().name, approvedAt: util.today() });
      Proc.audit('Approve Requisition', s.number + ' — ' + s.department, s.id); ui.toast(s.number + ' approved'); router.refresh();
    };
    if (act('issue')) act('issue').onclick = () => issueDialog(s.id);
    act('more').onclick = e => ui.menu(e.currentTarget, [
      editable ? { label: 'Reject', icon: 'x', onClick: () => closeReq(s, 'Rejected') } : null,
      editable || issuable ? { label: 'Cancel requisition', icon: 'x', onClick: () => closeReq(s, 'Cancelled') } : null,
      s.status === 'Issued' || s.status === 'Part issued' ? { label: 'Record who received it', icon: 'user', onClick: async () => { const v = await ui.form('Received by department', [{ name: 'receivedBy', label: 'Name of person who collected', value: s.receivedBy || '', required: true }]); if (v) { store.upsert('stockIssues', { id: s.id, receivedBy: v.receivedBy }); router.refresh(); } } } : null,
      { label: 'Duplicate as new requisition', icon: 'copy', onClick: () => { const c = store.upsert('stockIssues', { number: 'SIV-' + String(store.next('siv')).padStart(4, '0'), date: util.today(), department: s.department, requestedBy: s.requestedBy, priority: s.priority, notes: s.notes, status: 'Requested', lines: s.lines.map(l => ({ itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, unit: l.unit, qtyRequested: l.qtyRequested, qtyApproved: null, qtyIssued: 0, batches: [] })) }); router.go('issues/' + c.id); } },
      !moves.length ? { sep: true } : null,
      !moves.length ? { label: 'Delete', icon: 'trash', danger: true, onClick: async () => { if (await ui.confirm('Delete ' + esc(s.number) + '?', { danger: true, ok: 'Delete' })) { store.remove('stockIssues', s.id); Proc.audit('Delete Requisition', s.number, s.id); router.go('issues'); } } } : null
    ].filter(Boolean));
  }
  async function closeReq(s, status) {
    const v = await ui.form(status === 'Rejected' ? 'Reject ' + s.number : 'Cancel ' + s.number, [{ name: 'reason', label: 'Reason', type: 'textarea', rows: 3, required: true }], { ok: status === 'Rejected' ? 'Reject' : 'Cancel requisition' });
    if (!v) return;
    store.upsert('stockIssues', { id: s.id, status, rejectReason: v.reason });
    Proc.audit(status === 'Rejected' ? 'Reject Requisition' : 'Cancel Requisition', s.number + ' — ' + v.reason, s.id); router.refresh();
  }

  /** Issue the outstanding approved quantities (FEFO). Short stock → partial issue. */
  function issueDialog(id) {
    const s = store.get('stockIssues', id); if (!s) return;
    const rows = s.lines.map((l, i) => {
      const it = store.get('stockItems', l.itemId) || { onHand: 0 };
      const want = Math.max(0, util.num(l.qtyApproved !== null && l.qtyApproved !== undefined ? l.qtyApproved : l.qtyRequested) - util.num(l.qtyIssued));
      return { i, l, it, want, def: Math.min(want, Math.max(0, util.num(it.onHand))) };
    }).filter(r => r.want > 0);
    if (!rows.length) return ui.toast('Everything approved has been issued.', 'info');
    const fefo = (it, q) => { const out = []; let need = q; (it.batches || []).filter(b => b.qty > 0).sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999')).forEach(b => { if (need <= 0) return; const t = Math.min(b.qty, need); out.push((b.batchNo || 'no batch') + (b.expiryDate ? ' (exp ' + util.date(b.expiryDate) + ')' : '') + ' × ' + t); need -= t; }); return out.join(', '); };
    ui.modal({
      title: 'Issue stock — ' + s.number, size: 'lg', sticky: true,
      body: '<p class="muted small mb-2">Quantities default to what is approved, limited by stock on hand. Batches are taken earliest expiry first.</p><div class="table-wrap"><table class="table compact si-lines"><thead><tr><th>Item</th><th class="num">Outstanding</th><th class="num">On hand</th><th class="num" style="width:120px">Issue now</th><th>Batches (FEFO)</th></tr></thead><tbody>' +
        rows.map(r => '<tr data-i="' + r.i + '"><td><div class="t-title">' + esc(r.l.itemName) + '</div><div class="t-sub">' + esc(r.l.unit || '') + '</div></td><td class="num">' + util.int(r.want) + '</td><td class="num ' + (util.num(r.it.onHand) < r.want ? 'si-short' : '') + '">' + util.int(r.it.onHand) + '</td>' +
          '<td class="num"><input class="input sm num" type="number" min="0" step="any" data-q value="' + r.def + '" max="' + Math.min(r.want, Math.max(0, util.num(r.it.onHand))) + '" style="width:100px"></td><td class="si-batch" data-b>' + esc(fefo(r.it, r.def)) + '</td></tr>').join('') + '</tbody></table></div>' +
        '<div class="form-grid mt-2"><div class="field s6"><label>Issued by</label><input name="issuedBy" value="' + esc(domain.officer().name) + '"></div><div class="field s6"><label>Received by (department)</label><input name="receivedBy" value="' + esc(s.receivedBy || '') + '" placeholder="Person collecting"></div><div class="field s4"><label>Issue date</label><input type="date" name="date" value="' + util.today() + '"></div></div>' +
        (rows.some(r => util.num(r.it.onHand) < r.want) ? '<div class="alert warning mt-2">' + ui.icon('alert') + '<div>Some items are short. What is available will be issued and the requisition stays <b>Part issued</b> until the rest arrives.</div></div>' : ''),
      onOpen: m => m.querySelectorAll('tr[data-i]').forEach(tr => { const r = rows.find(x => x.i === +tr.dataset.i); tr.querySelector('[data-q]').oninput = e => { tr.querySelector('[data-b]').textContent = fefo(r.it, util.num(e.target.value)); }; }),
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Issue', kind: 'primary', icon: 'check', onClick: (close, m) => {
        const f = ui.formData(m.querySelector('.form-grid'));
        const fresh = store.get('stockIssues', id); const lines = fresh.lines.map(l => Object.assign({}, l, { batches: (l.batches || []).slice() }));
        let posted = 0; const errs = [];
        store.batch(() => {
          m.querySelectorAll('tr[data-i]').forEach(tr => {
            const i = +tr.dataset.i; const q = util.num(tr.querySelector('[data-q]').value); if (!(q > 0)) return;
            const r = rows.find(x => x.i === i); const allowed = Math.min(r.want, Math.max(0, util.num((store.get('stockItems', r.l.itemId) || {}).onHand)));
            if (q > allowed + 1e-9) { errs.push(r.l.itemName + ': only ' + allowed + ' can be issued'); return; }
            try {
              const mv = domain.postStock({ itemId: r.l.itemId, type: 'Issue', qty: -q, date: f.date || util.today(), department: fresh.department, issueId: fresh.id, ref: fresh.number, notes: 'Issued to ' + fresh.department + (f.receivedBy ? ' — received by ' + f.receivedBy : '') }, { silent: true });
              lines[i].qtyIssued = util.round2(util.num(lines[i].qtyIssued) + q);
              lines[i].batches = lines[i].batches.concat(mv.batches || []);
              posted++;
            } catch (e) { errs.push(r.l.itemName + ': ' + e.message); }
          });
          if (posted) {
            const done = lines.every(l => util.num(l.qtyIssued) >= util.num(l.qtyApproved !== null && l.qtyApproved !== undefined ? l.qtyApproved : l.qtyRequested) - 1e-9);
            store.upsert('stockIssues', { id, lines, status: done ? 'Issued' : 'Part issued', issuedBy: f.issuedBy, issuedAt: f.date || util.today(), receivedBy: f.receivedBy || fresh.receivedBy || '' });
            Proc.audit('Issue Stock', fresh.number + ' — ' + fresh.department + ' — ' + posted + ' ' + util.plural(posted, 'line') + (done ? '' : ' (part issue)'), id);
          }
        });
        if (errs.length) ui.toast(errs.join(' · '), 'error');
        if (!posted) return false;
        ui.toast(posted + ' ' + util.plural(posted, 'line') + ' issued from stock');
        router.refresh();
      } }]
    });
  }

  /* ---------------------------------------------------------- SIV PDF */
  function printSIV(id) {
    const s = store.get('stockIssues', id);
    const kit = Proc.pdf && Proc.pdf.kit;
    if (!kit) return ui.toast('The PDF engine is not loaded.', 'warning');
    try {
      const doc = kit.newDoc(); const { w } = kit.pageSize(doc); const M = 40; let y = kit.top;
      const clean = kit.clean;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor.apply(doc, kit.BLUE); doc.text('STORES ISSUE VOUCHER', M, y + 16);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, kit.GREY); doc.text(clean(C.S().storeName || 'General Stores'), M, y + 30);
      const facts = [['SIV No.', s.number], ['Date', util.date(s.date)], ['Department', s.department || ''], ['Priority', s.priority || 'Normal'], ['Status', s.status]];
      let fy = y + 2;
      facts.forEach(([k, v]) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, kit.GREY); doc.text(k.toUpperCase(), w - M - 220, fy + 8); doc.setFont('helvetica', 'bold'); doc.setTextColor.apply(doc, kit.INK); kit.fitSize(doc, clean(v), 150, 10, 7); doc.text(clean(v), w - M, fy + 8, { align: 'right' }); fy += 14; });
      y = fy + 10;
      const body = s.lines.map((l, i) => [String(i + 1), clean(l.itemCode || ''), clean(l.itemName), clean(l.unit || ''), util.int(l.qtyRequested), l.qtyApproved === null || l.qtyApproved === undefined ? '' : util.int(l.qtyApproved), util.int(l.qtyIssued || 0),
        clean((l.batches || []).map(b => (b.batchNo || '-') + (b.expiryDate ? ' exp ' + util.date(b.expiryDate) : '') + ' x' + b.qty).join('; '))]);
      doc.autoTable({ startY: y, margin: { left: M, right: M, top: kit.top, bottom: 90 }, head: [['#', 'Code', 'Item', 'Unit', 'Requested', 'Approved', 'Issued', 'Batch / expiry']], body,
        styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 4, lineColor: [210, 216, 224], lineWidth: 0.5, textColor: kit.INK }, headStyles: { fillColor: [234, 241, 247], textColor: kit.INK, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 58 }, 3: { cellWidth: 38 }, 4: { halign: 'right', cellWidth: 54 }, 5: { halign: 'right', cellWidth: 54 }, 6: { halign: 'right', cellWidth: 46 }, 7: { cellWidth: 112 } } });
      y = doc.lastAutoTable.finalY + 14;
      if (s.notes) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, kit.INK); doc.text(doc.splitTextToSize('Notes: ' + clean(s.notes), w - M * 2), M, y); y += 20; }
      const { h } = kit.pageSize(doc);
      if (y + 70 > h - 84) { doc.addPage(); y = kit.top + 10; }
      y += 26;
      const sig = [['Requested by', s.requestedBy], ['Approved by', s.approvedBy], ['Issued by', s.issuedBy], ['Received by', s.receivedBy]];
      const sw = (w - M * 2) / 4;
      sig.forEach(([lab, nm], i) => {
        const x = M + i * sw; doc.setDrawColor(120, 128, 140); doc.setLineWidth(0.6); doc.line(x, y, x + sw - 16, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, kit.GREY); doc.text(lab.toUpperCase(), x, y + 10);
        if (nm) { doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor.apply(doc, kit.INK); doc.text(doc.splitTextToSize(clean(nm), sw - 18)[0], x, y + 22); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, kit.GREY); doc.text('Date: ____________', x, y + 34);
      });
      kit.finish(doc, { side: false, watermark: s.status === 'Cancelled' || s.status === 'Rejected' ? s.status.toUpperCase() : (s.status === 'Requested' ? 'NOT APPROVED' : '') });
      doc.setProperties({ title: 'Stores Issue Voucher ' + s.number });
      return Promise.resolve(kit.deliver(doc, 'Stores Issue Voucher ' + kit.fileSafe(s.number) + ' - ' + kit.fileSafe(s.department || '') + '.pdf', 'open'));
    } catch (e) { console.error(e); ui.toast('Could not create the voucher: ' + e.message, 'error'); }
  }
  Proc.storesC.printSIV = printSIV;

  Proc.page({
    id: 'issues', title: 'Issues & Requisitions', icon: 'clipboard', section: 'Workflow', order: 20,
    count: () => store.filter('stockIssues', s => s.status === 'Requested' || s.status === 'Approved').length,
    render(el, params) {
      C.css('css-sissues', CSS);
      if (params[0] === 'new') return renderNew(el);
      if (params[0]) return renderDetail(el, params[0]);
      renderList(el);
    }
  });
})();
