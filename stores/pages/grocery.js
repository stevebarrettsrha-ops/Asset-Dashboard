/* General Stores — Grocery Order.
   #/grocery          The month's grocery picture: Food and Drink budget, grocery lists sent to
                      Procurement, grocery purchase orders and what has been delivered.
   #/grocery/new      Prepare a grocery list (start from a past order or food items at reorder level).
   #/grocery/<id>     Open / edit / print / send a grocery list.
   A grocery list is a Procurement requisition (category "Food & Grocery Items", source "stores",
   grocery: true), so Procurement sources and orders it exactly like any other request. */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc;
  const C = Proc.storesC;
  const CATEGORY = 'Food & Grocery Items';
  const CSS = '.gr-lines td{vertical-align:middle}.gr-lines input.input{height:34px}.gr-lines .w80{width:84px}.gr-lines .w110{width:112px}.gr-lines .w200{min-width:220px}' +
    '.gr-sec td{background:var(--surface-2)!important;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--primary)!important;padding:8px 10px!important}' +
    '.gr-note{font-size:12px;color:var(--text-3);margin-top:3px}.gr-zero td{opacity:.6}' +
    '.gr-tools{display:flex;gap:8px;flex-wrap:wrap}.gr-bud{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--text-2)}.gr-bud b{color:var(--text)}.gr-over{color:var(--danger);font-weight:600}' +
    '@media(max-width:860px){.gr-lines thead{display:none}.gr-lines,.gr-lines tbody,.gr-lines tr,.gr-lines td{display:block;width:100%}.gr-lines tr{border-bottom:1px solid var(--border);padding:10px 12px}.gr-lines td{border:0!important;padding:4px 0!important}' +
    '.gr-lines td[data-l]::before{content:attr(data-l);display:block;font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}.gr-lines .w80,.gr-lines .w110,.gr-lines .w200{width:100%}}';
  const state = { month: '' };

  /* ---------------------------------------------------------- what counts as grocery */
  function foodLine() { return store.list('budgetLines').find(l => l.active !== false && /food/i.test(l.name || '')) || null; }
  function foodWords() {
    const l = foodLine();
    // "dietary" names the department, not food: a pest-control PO for the Dietary kitchen is not groceries.
    const words = ((l && l.keywords) || 'food,grocery,chicken,meat,fish,vegetable,produce,juice,provision,bread,milk,rice,flour').split(',').map(w => w.trim()).filter(w => w && !/^dietary$/i.test(w))
      .concat(['oats', 'sugar', 'cereal', 'macaroni', 'ketchup', 'beans', 'mackerel', 'sardine', 'yam', 'potato', 'banana', 'cabbage', 'carrot', 'callaloo', 'egg', 'cheese', 'butter', 'margarine', 'ensure', 'glucerna']);
    return new RegExp('\\b(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'i');
  }
  function groceryTest() {
    const re = foodWords();
    const supIds = new Set(store.filter('suppliers', s => (s.categories || []).some(c => /food|grocer/i.test(c))).map(s => s.id));
    const reqIds = new Set(store.filter('requisitions', r => r.grocery || r.category === CATEGORY).map(r => r.id));
    return po => !!po && po.status !== 'Draft' && po.status !== 'Cancelled' &&
      (reqIds.has(po.requisitionId) || po.category === CATEGORY || /dietary/i.test(po.department || '') || supIds.has(po.supplierId) || re.test(po.description || '') || (po.items || []).some(i => re.test(i.description || '')));
  }
  const groceryLists = () => store.filter('requisitions', r => r.grocery);
  const monthOf = r => r.groceryMonth || (r.date || '').slice(0, 7);
  const supplierOf = po => po.supplierName || domain.supplierName(po.supplierId) || '—';
  const poValue = po => util.num(po.total) || util.sum(po.items || [], i => util.num(i.total) || util.num(i.qty) * util.num(i.unitPrice));
  function receivedValue(pos, month) {
    const ids = new Set(pos.map(p => p.id));
    return util.sum(store.filter('deliveries', d => !d.voided && ids.has(d.poId) && (!month || (d.date || '').slice(0, 7) === month)), d => {
      const po = store.get('purchaseOrders', d.poId) || {}; const lines = domain.poLines(po);
      return util.sum(d.items || [], i => util.num(i.qtyReceived) * (util.num(i.unitCost) || util.num((lines[i.lineIndex] || {}).unitPrice)));
    });
  }
  function received(po) { const got = domain.lineReceived(po); const lines = domain.poLines(po); const done = lines.every((l, i) => (got[i] || 0) >= (util.num(l.qty) || 1)); return po.status === 'Delivered' || po.status === 'Completed' || done ? 'Received' : got.some(x => x > 0) ? 'Part received' : 'On order'; }
  function budgetFor(month) {
    const l = foodLine(); if (!l) return null;
    const fy = util.fiscalYear(month + '-15');
    const line = store.list('budgetLines').find(x => x.fy === fy && x.active !== false && /food/i.test(x.name || '')) || l;
    const bm = store.list('budgetMonths').find(m => m.month === month);
    const approved = bm ? util.sum((bm.entries || []).filter(e => e.lineId === line.id), e => e.amount) : 0;
    return { name: line.name, allocation: util.num(line.monthlyAllocation), approved };
  }

  /* ---------------------------------------------------------- catalogue of grocery items */
  /** Past grocery POs write lines as "12 c/s - Lasco Rolled Oats 400g, 6 c/s - …": read them back as items. */
  function splitLumped(text) {
    return String(text || '').split(/,\s*(?=\d)/).map(p => p.trim()).filter(Boolean).map(p => {
      const m = /^(\d+(?:\.\d+)?)\s*([a-z][a-z\/.]*)?\s*-\s*(.+)$/i.exec(p);
      return m ? { qty: +m[1], unit: (m[2] || '').replace(/\.$/, ''), description: m[3].trim() } : { qty: 1, unit: '', description: p };
    });
  }
  function poAsLines(po) {
    const out = [];
    (po.items || []).forEach(i => {
      const parts = (util.num(i.qty) <= 1 && /,\s*\d/.test(i.description || '')) ? splitLumped(i.description) : [{ qty: util.num(i.qty) || 1, unit: i.unit || '', description: i.description || '', price: util.num(i.unitPrice) }];
      // A line bought as "1 lot" carries the price of the whole lot, not a unit price: no estimate from it.
      parts.forEach(p => out.push({ description: p.description, unit: p.unit && p.unit !== 'lot' ? p.unit : 'each', qty: p.qty, price: /^lot$/i.test(p.unit || '') ? 0 : (p.price || 0), supplier: supplierOf(po) }));
    });
    return out;
  }
  function catalogue() {
    const map = new Map();
    const add = (name, o) => { const k = String(name || '').trim().toLowerCase(); if (!k) return; map.set(k, Object.assign({ description: String(name).trim() }, map.get(k) || {}, o)); };
    const isG = groceryTest();
    store.list('purchaseOrders').filter(isG).sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(po => poAsLines(po).forEach(l => add(l.description, { unit: l.unit, price: l.price || (map.get(l.description.toLowerCase()) || {}).price || 0, supplier: l.supplier, lastQty: l.qty })));
    const re = foodWords();
    C.items().filter(i => /food|grocer|dietary|kitchen/i.test(i.category || '') || re.test(i.name || '')).forEach(i => add(i.name, { unit: i.unit || 'each', price: util.num(i.lastCost) || util.num(i.avgCost), stockItemId: i.id, code: i.code }));
    return map;
  }
  function itemsDatalist(cat) {
    let dl = document.getElementById('dl-grocery'); if (!dl) { dl = document.createElement('datalist'); dl.id = 'dl-grocery'; document.body.appendChild(dl); }
    dl.innerHTML = Array.from(cat.values()).sort((a, b) => a.description.localeCompare(b.description)).map(c => '<option value="' + esc(c.description) + '">' + esc([c.unit, c.supplier].filter(Boolean).join(' · ')) + '</option>').join('');
  }
  function usedLast30(itemId) { const from = util.addDays(util.today(), -30); return Math.abs(util.sum(store.filter('stockMoves', m => m.itemId === itemId && m.type === 'Issue' && (m.date || '') >= from), m => m.qty)); }

  /** The standard monthly grocery list new orders start from: the one saved with "Save as standard list",
      otherwise the hospital's November 2026 sheet (stores/grocery-standard.js). */
  function standardList() {
    const saved = (C.S() || {}).groceryStandard;
    if (saved && Array.isArray(saved.items) && saved.items.length) return saved;
    return window.MPH_GROCERY_STANDARD || null;
  }
  const SECTION_ORDER = ['Groceries', 'Meat, fish and poultry', 'Infant formula', 'Disposables', 'Green groceries', 'Medical nutritional'];

  /* ================================================================ LIST */
  function monthsAvailable(pos) {
    const set = new Set([util.today().slice(0, 7), util.today().slice(0, 7) > '' ? util.addDays(util.today().slice(0, 7) + '-01', 32).slice(0, 7) : '']);
    pos.forEach(p => set.add((p.date || '').slice(0, 7))); groceryLists().forEach(r => set.add(monthOf(r)));
    return Array.from(set).filter(Boolean).sort().reverse();
  }
  function renderList(el) {
    const q = router.parse().query;
    const isG = groceryTest();
    const allPos = store.list('purchaseOrders').filter(p => p.poNumber && isG(p));
    const months = monthsAvailable(allPos);
    const month = state.month = q.m || state.month || util.today().slice(0, 7);
    const pos = allPos.filter(p => (p.date || '').slice(0, 7) === month);
    const lists = groceryLists();
    const monthLists = lists.filter(r => monthOf(r) === month);
    const b = budgetFor(month);
    const ordered = util.sum(pos, poValue), requested = util.sum(monthLists.filter(r => r.status !== 'Draft' && r.status !== 'Cancelled'), r => r.estimate);
    const recv = receivedValue(allPos, month);
    const limit = b ? (b.approved || b.allocation) : 0;
    el.innerHTML = ui.pageHead({ title: 'Grocery Order', sub: 'The Dietary grocery orders — prepare the list, send it to Procurement, and follow the purchase orders and deliveries against the Food and Drink budget.',
      actions: '<select class="input" id="grMonth" style="width:auto">' + months.map(m => '<option value="' + m + '"' + (m === month ? ' selected' : '') + '>' + util.monthLabel(m) + '</option>').join('') + '</select>' +
        '<a class="btn primary" href="#/grocery/new?m=' + month + '">' + ui.icon('plus', 'sm') + 'New grocery order</a>' }) +
      (C.navTabs ? C.navTabs('grocery') : '') +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Food & Drink budget', icon: 'wallet', value: b ? util.moneyShort(limit) : '—', title: b ? util.money(limit) : '', meta: b ? (b.approved ? 'Approved for ' + util.monthLabel(month) : 'Monthly allocation') : 'No Food and Drink budget line' }) +
      ui.kpi({ label: 'Ordered (POs)', icon: 'cart', value: util.moneyShort(ordered), title: util.money(ordered), meta: util.int(pos.length) + ' grocery ' + util.plural(pos.length, 'PO') + ' in ' + util.monthLabel(month) }) +
      ui.kpi({ label: 'Remaining', icon: 'scale', tone: b && ordered > limit ? 'bad' : 'ok', value: b ? util.moneyShort(limit - ordered) : '—', title: b ? util.money(limit - ordered) : '', meta: b ? (limit ? Math.round(ordered / limit * 100) + '% used' : '') : '' }) +
      ui.kpi({ label: 'Delivered', icon: 'truck', value: util.moneyShort(recv), title: util.money(recv), meta: util.int(pos.filter(p => received(p) !== 'Received').length) + ' still to arrive' }) + '</div>' +
      '<div class="card mb-3"><div class="card-h"><div><h3>Grocery lists</h3><div class="sub">Prepared here and sent to Procurement as a purchase request' + (requested ? ' · ' + util.money(requested) + ' requested for ' + util.monthLabel(month) : '') + '</div></div></div><div id="grLists"></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Grocery purchase orders — ' + util.monthLabel(month) + '</h3><div class="sub">Food and grocery POs issued by Procurement</div></div><button class="btn sm" data-x>' + ui.icon('download', 'sm') + 'Excel</button></div><div id="grPos"></div></div>';
    el.querySelector('#grMonth').onchange = e => { state.month = e.target.value; location.hash = '#/grocery?m=' + e.target.value; };
    const posFor = r => store.filter('purchaseOrders', p => p.requisitionId === r.id || (r.comparisonId && p.comparisonId === r.comparisonId));
    ui.table(el.querySelector('#grLists'), {
      rows: lists, pageSize: 10, placeholder: 'Search grocery lists…', initialSort: { key: 'month', dir: -1 },
      search: r => [r.number, r.title, r.status].concat((r.items || []).map(i => i.description)).join(' '),
      filters: [{ key: 'mo', label: 'All months', options: Array.from(new Set(lists.map(monthOf))).sort().reverse().map(m => ({ value: m, label: util.monthLabel(m) })), test: (r, v) => monthOf(r) === v }],
      onRow: r => router.go('grocery/' + r.id),
      columns: [
        { key: 'month', label: 'Month', sort: r => monthOf(r), render: r => '<span class="t-title">' + util.monthLabel(monthOf(r)) + '</span><div class="t-sub mono">' + esc(r.number) + '</div>' },
        { key: 'title', label: 'List', render: r => '<div class="t-title">' + esc(r.title) + '</div><div class="t-sub truncate" style="max-width:360px">' + (r.items || []).length + ' items · ' + esc((r.items || []).slice(0, 5).map(i => i.description).join(', ')) + '</div>' },
        { key: 'estimate', label: 'Estimate', cls: 'num', render: r => util.money(r.estimate) },
        { key: 'pos', label: 'Purchase orders', sort: r => posFor(r).length, render: r => { const p = posFor(r); return p.length ? p.map(x => '<span class="chip">PO ' + esc(x.poNumber || 'draft') + '</span>').join(' ') : '<span class="muted">None yet</span>'; } },
        { key: 'status', label: 'Status', render: r => r.status === 'Draft' ? ui.badge('Draft — not sent', 'warning') : ui.badge(r.status) }
      ],
      empty: ui.empty('cart', 'No grocery lists yet', 'Prepare the grocery order here — start from a past order — and send it to Procurement in one step.', '<a class="btn primary" href="#/grocery/new?m=' + month + '">' + ui.icon('plus', 'sm') + 'New grocery order</a>')
    });
    const tone = { 'On order': 'warning', 'Part received': 'info', Received: 'success' };
    ui.table(el.querySelector('#grPos'), {
      rows: pos, pageSize: 25, placeholder: 'Search PO #, supplier, item…', initialSort: { key: 'date', dir: -1 },
      search: p => [p.poNumber, supplierOf(p), p.description].concat((p.items || []).map(i => i.description)).join(' '),
      filters: [{ key: 'sup', label: 'All suppliers', options: Array.from(new Set(pos.map(supplierOf))).sort(), test: (p, v) => supplierOf(p) === v },
        { key: 'st', label: 'Any delivery status', options: ['On order', 'Part received', 'Received'], test: (p, v) => received(p) === v }],
      columns: [
        { key: 'poNumber', label: 'PO #', render: p => '<span class="t-title mono">' + esc(p.poNumber) + '</span><div class="t-sub">' + util.date(p.date) + '</div>', sort: p => p.poNumber },
        { key: 'supplier', label: 'Supplier / items', sort: p => supplierOf(p), render: p => '<div class="t-title">' + esc(supplierOf(p)) + '</div><div class="t-sub truncate" style="max-width:420px">' + esc(p.description || (p.items || []).map(i => i.description).join(', ')) + '</div>' },
        { key: 'value', label: 'Value', cls: 'num', sort: poValue, render: p => util.money(poValue(p)) },
        { key: 'st', label: 'Delivery', sort: received, render: p => ui.badge(received(p), tone[received(p)]) },
        { key: 'x', label: '', sort: false, cls: 'actions', render: p => received(p) !== 'Received' && !p.historic ? '<a class="btn sm primary" href="#/inbound?po=' + p.id + '">' + ui.icon('truck', 'sm') + 'Receive</a>' : '' }
      ],
      footer: list => '<td colspan="2">' + list.length + ' ' + util.plural(list.length, 'PO') + '</td><td class="num">' + util.money(util.sum(list, poValue)) + '</td><td colspan="2"></td>',
      empty: ui.empty('cart', 'No grocery purchase orders in ' + util.monthLabel(month), 'Grocery POs Procurement issues for this month appear here.')
    });
    el.querySelector('[data-x]').onclick = () => C.excel([{ name: 'Grocery POs', cols: [12, 12, 30, 60, 14, 14], rows: pos.map(p => ({ 'PO #': p.poNumber, Date: p.date, Supplier: supplierOf(p), Items: p.description || (p.items || []).map(i => i.description).join('; '), Value: poValue(p), Delivery: received(p) })) }], 'Grocery orders ' + month + '.xlsx');
  }

  /* ================================================================ EDITOR */
  function renderEditor(el, id) {
    const q = router.parse().query;
    const existing = id && id !== 'new' ? store.get('requisitions', id) : null;
    if (id && id !== 'new' && !existing) { el.innerHTML = ui.empty('cart', 'Grocery list not found', '', '<a class="btn" href="#/grocery">Back</a>'); return; }
    const off = domain.officer();
    const month = existing ? monthOf(existing) : (q.m || util.today().slice(0, 7));
    const d = existing ? JSON.parse(JSON.stringify(existing)) : { groceryMonth: month, title: 'Grocery order — ' + util.monthLabel(month), department: 'Dietary', neededBy: month + '-01' > util.today() ? month + '-01' : util.addDays(util.today(), 7), justification: '', items: [] };
    const locked = existing && existing.status !== 'Draft';
    const cat = catalogue(); itemsDatalist(cat);
    const lines = (d.items || []).map(i => ({ description: i.description, unit: i.unit, qty: i.qty, price: util.num(i.estUnitPrice), supplier: i.supplier || '', stockItemId: i.stockItemId || '',
      section: i.section || '', brand: i.brand || '', note: i.note || '', stockBalance: i.stockBalance }));
    const fromStandard = std => std.items.map(x => { const c = cat.get(String(x.description).trim().toLowerCase()) || {};
      return { description: x.description, unit: x.unit || c.unit || 'each', qty: util.num(x.qty), price: util.num(x.price) || util.num(c.price), supplier: x.supplier || c.supplier || '', stockItemId: c.stockItemId || '',
        section: x.section || '', brand: x.brand || '', note: x.note || '', stockBalance: x.stockBalance }; });
    const std0 = !existing && q.blank === undefined ? standardList() : null;
    if (std0) {
      lines.push.apply(lines, fromStandard(std0));
      if (d.occupancy === undefined) d.occupancy = std0.occupancy || '';
      if (d.ngFeeds === undefined) d.ngFeeds = std0.ngFeeds || '';
    }
    el.innerHTML = ui.pageHead({ back: { label: 'Grocery Order', href: '#/grocery?m=' + month }, title: existing ? d.title : 'New grocery order', badge: existing ? (existing.status === 'Draft' ? ui.badge('Draft — not sent', 'warning') : ui.badge(existing.status)) : '',
      sub: locked ? 'Sent to Procurement as ' + esc(existing.number) + ' — it is sourced and ordered from there.' : 'List the groceries for the month, then send them to Procurement as one purchase request.',
      actions: '<button class="btn" data-print>' + ui.icon('printer', 'sm') + 'Print list</button>' }) +
      (C.navTabs ? C.navTabs('grocery') : '') +
      '<div class="card mb-3"><div class="card-b"><div class="form-grid">' +
      '<div class="field s3"><label>Month</label><input type="month" name="groceryMonth" value="' + esc(month) + '"' + (locked ? ' disabled' : '') + '></div>' +
      '<div class="field s5"><label>Title</label><input name="title" value="' + esc(d.title) + '"' + (locked ? ' disabled' : '') + '></div>' +
      '<div class="field s2"><label>For department</label><input name="department" value="' + esc(d.department || 'Dietary') + '"' + (locked ? ' disabled' : '') + '></div>' +
      '<div class="field s2"><label>Needed by</label><input type="date" name="neededBy" value="' + esc(d.neededBy || '') + '"' + (locked ? ' disabled' : '') + '></div>' +
      '<div class="field s3"><label>Patient occupancy on day of order</label><input type="number" min="0" name="occupancy" value="' + esc(d.occupancy === undefined || d.occupancy === null ? '' : d.occupancy) + '"' + (locked ? ' disabled' : '') + '></div>' +
      '<div class="field s3"><label>Patients on NG feeds</label><input type="number" min="0" name="ngFeeds" value="' + esc(d.ngFeeds === undefined || d.ngFeeds === null ? '' : d.ngFeeds) + '"' + (locked ? ' disabled' : '') + '></div>' +
      '<div class="field s6"><label>Notes for Procurement</label><input name="justification" value="' + esc(d.justification || '') + '" placeholder="e.g. Monthly grocery order for the patients’ kitchen"' + (locked ? ' disabled' : '') + '></div></div>' +
      '<div class="gr-bud mt-2" id="grBud"></div></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Grocery items</h3><div class="sub">' + (std0 ? 'Filled in from the standard monthly list — change any quantity, remove a line or add items, then send it to Procurement.' : 'Type an item (past grocery items and food stock are suggested) and press Enter.') + '</div></div>' +
      (locked ? '' : '<div class="gr-tools"><button class="btn sm" data-std>' + ui.icon('refresh', 'sm') + 'Use standard list</button><button class="btn sm" data-savestd>' + ui.icon('check', 'sm') + 'Save as standard list</button><button class="btn sm" data-from>' + ui.icon('copy', 'sm') + 'Start from a past order</button><button class="btn sm" data-low>' + ui.icon('alert', 'sm') + 'Add food at reorder level</button></div>') + '</div>' +
      (locked ? '' : '<div class="card-b"><div class="row"><input class="input" id="grFind" list="dl-grocery" placeholder="Grocery item — Enter to add" autocomplete="off" style="flex:1;max-width:520px"><button class="btn" id="grAdd">' + ui.icon('plus', 'sm') + 'Add</button></div></div>') +
      '<div class="table-wrap"><table class="table compact gr-lines"><thead><tr><th>#</th><th>Item</th><th>Unit</th><th class="num">Qty</th><th class="num">Est. unit price</th><th class="num">Est. total</th><th>Usual supplier</th><th></th></tr></thead><tbody id="grRows"></tbody><tfoot><tr><td colspan="5" class="strong">Total</td><td class="num strong" id="grTot"></td><td colspan="2"></td></tr></tfoot></table></div>' +
      '<div class="card-f">' + (locked ? '<a class="btn" href="#/grocery?m=' + month + '">Back</a>' : '<a class="btn ghost" href="#/grocery?m=' + month + '">Cancel</a>' + (existing ? '<button class="btn ghost danger" data-del>' + ui.icon('trash', 'sm') + 'Delete draft</button>' : '') + '<button class="btn" data-save>' + ui.icon('check', 'sm') + 'Save draft</button><button class="btn primary" data-send>' + ui.icon('send', 'sm') + 'Send to Procurement</button>') + '</div></div>';
    const tbody = el.querySelector('#grRows');
    const total = () => util.round2(util.sum(lines, l => util.num(l.qty) * util.num(l.price)));
    const budget = () => {
      const m = locked ? month : (el.querySelector('[name=groceryMonth]').value || month);
      const b = budgetFor(m); const box = el.querySelector('#grBud'); if (!b) { box.innerHTML = ''; return; }
      const isG = groceryTest(); const ordered = util.sum(store.list('purchaseOrders').filter(p => p.poNumber && isG(p) && (p.date || '').slice(0, 7) === m && (!existing || p.requisitionId !== existing.id)), poValue);
      const limit = b.approved || b.allocation, left = limit - ordered, t = total();
      box.innerHTML = '<span>' + esc(b.name) + ' ' + (b.approved ? 'approved for ' : 'allocation ') + util.monthLabel(m) + ': <b>' + util.money(limit) + '</b></span><span>Already ordered: <b>' + util.money(ordered) + '</b></span><span>This list: <b>' + util.money(t) + '</b></span><span class="' + (t > left ? 'gr-over' : '') + '">' + (t > left ? 'Over the budget by ' + util.money(t - left) : 'Left after this list: <b>' + util.money(left - t) + '</b>') + '</span>';
    };
    const draw = () => {
      const grouped = lines.some(l => l.section);
      let lastSec = null;
      tbody.innerHTML = lines.length ? lines.map((l, i) => {
        const it = l.stockItemId ? store.get('stockItems', l.stockItemId) : null;
        const info = [l.brand ? 'Brand: ' + l.brand : '', l.note ? 'Sheet: ' + l.note : '', l.stockBalance !== undefined && l.stockBalance !== '' && l.stockBalance !== null ? 'Stock balance: ' + l.stockBalance : ''].filter(Boolean).join(' · ');
        const extra = (it ? '<div class="t-sub">' + esc(it.code) + ' · ' + util.int(it.onHand) + ' ' + esc(it.unit || '') + ' on hand · ' + util.int(usedLast30(it.id)) + ' used in 30 days</div>' : '') + (info ? '<div class="gr-note">' + esc(info) + '</div>' : '');
        const sec = grouped ? (l.section || 'Other items') : null;
        const head = grouped && sec !== lastSec ? '<tr class="gr-sec"><td colspan="8">' + esc(sec) + '</td></tr>' : '';
        lastSec = sec;
        return head + '<tr data-i="' + i + '"' + (util.num(l.qty) > 0 ? '' : ' class="gr-zero"') + '><td class="muted">' + (i + 1) + '</td>' +
          (locked ? '<td data-l="Item"><div class="t-title">' + esc(l.description) + '</div>' + extra + '</td><td data-l="Unit">' + esc(l.unit) + '</td><td class="num" data-l="Qty">' + util.num(l.qty) + '</td><td class="num" data-l="Est. unit price">' + util.money(l.price) + '</td>'
            : '<td class="w200" data-l="Item"><input class="input" data-k="description" value="' + esc(l.description) + '">' + extra + '</td><td data-l="Unit"><input class="input w80" data-k="unit" value="' + esc(l.unit) + '"></td><td class="num" data-l="Qty"><input class="input num w80" type="number" min="0" step="any" data-k="qty" value="' + esc(l.qty) + '"></td><td class="num" data-l="Est. unit price"><input class="input num w110" type="number" min="0" step="any" data-k="price" value="' + esc(l.price || '') + '"></td>') +
          '<td class="num" data-l="Est. total" data-t>' + util.money(util.num(l.qty) * util.num(l.price)) + '</td><td data-l="Usual supplier">' + (locked ? esc(l.supplier) : '<input class="input" data-k="supplier" value="' + esc(l.supplier) + '" list="dl-suppliers-gr">') + '</td>' +
          '<td class="actions">' + (locked ? '' : '<button class="btn xs ghost icon" data-rm title="Remove">' + ui.icon('x', 'sm') + '</button>') + '</td></tr>';
      }).join('') : '<tr><td colspan="8" class="muted center" style="padding:24px">No items yet — type one above, or start from a past order.</td></tr>';
      el.querySelector('#grTot').textContent = util.money(total());
      tbody.querySelectorAll('[data-k]').forEach(inp => inp.oninput = () => { const l = lines[+inp.closest('tr').dataset.i]; l[inp.dataset.k] = inp.type === 'number' ? util.num(inp.value) : inp.value; if (inp.dataset.k === 'qty') inp.closest('tr').classList.toggle('gr-zero', !(util.num(inp.value) > 0)); inp.closest('tr').querySelector('[data-t]').textContent = util.money(util.num(l.qty) * util.num(l.price)); el.querySelector('#grTot').textContent = util.money(total()); budget(); });
      tbody.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { lines.splice(+b.closest('tr').dataset.i, 1); draw(); });
      budget();
    };
    if (!document.getElementById('dl-suppliers-gr')) document.body.insertAdjacentHTML('beforeend', '<datalist id="dl-suppliers-gr">' + store.filter('suppliers', s => (s.categories || []).some(c => /food|grocer/i.test(c))).map(s => '<option value="' + esc(s.name) + '">').join('') + '</datalist>');
    const addLine = o => {
      const k = String(o.description || '').trim().toLowerCase(); if (!k) return;
      const ex = lines.find(l => String(l.description).trim().toLowerCase() === k);
      if (ex) { ex.qty = util.num(ex.qty) + util.num(o.qty || 1); return; }
      const c = cat.get(k) || {};
      lines.push({ description: o.description.trim(), unit: o.unit || c.unit || 'each', qty: util.num(o.qty) || c.lastQty || 1, price: util.num(o.price) || util.num(c.price), supplier: o.supplier || c.supplier || '', stockItemId: o.stockItemId || c.stockItemId || '',
        section: o.section || (lines.some(l => l.section) ? 'Other items' : ''), brand: o.brand || '', note: o.note || '' });
    };
    const find = el.querySelector('#grFind');
    if (find) {
      const add = () => { if (!find.value.trim()) return; addLine({ description: find.value }); find.value = ''; draw(); const r = tbody.querySelector('tr:last-child [data-k=qty]'); if (r) { r.focus(); r.select(); } };
      find.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      el.querySelector('#grAdd').onclick = add;
    }
    const from = el.querySelector('[data-from]');
    if (from) from.onclick = async () => {
      const isG = groceryTest();
      const past = groceryLists().filter(r => !existing || r.id !== existing.id).map(r => ({ value: 'R:' + r.id, label: util.monthLabel(monthOf(r)) + ' — ' + r.title + ' (' + (r.items || []).length + ' items)', date: r.date }))
        .concat(store.list('purchaseOrders').filter(p => p.poNumber && isG(p)).map(p => ({ value: 'P:' + p.id, label: 'PO ' + p.poNumber + ' · ' + util.date(p.date) + ' · ' + supplierOf(p) + ' (' + poAsLines(p).length + ' items)', date: p.date })))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 150);
      if (!past.length) return ui.toast('No past grocery orders to start from yet.', 'info');
      const v = await ui.form('Start from a past order', [{ name: 'src', label: 'Past grocery list or purchase order', type: 'select', options: past, required: true }], { ok: 'Add its items' });
      if (!v || !v.src) return;
      const [kind, sid] = [v.src.slice(0, 1), v.src.slice(2)];
      if (kind === 'R') (store.get('requisitions', sid).items || []).forEach(i => addLine({ description: i.description, unit: i.unit, qty: i.qty, price: i.estUnitPrice, supplier: i.supplier, stockItemId: i.stockItemId, section: i.section, brand: i.brand, note: i.note }));
      else poAsLines(store.get('purchaseOrders', sid)).forEach(addLine);
      draw(); ui.toast('Items added — adjust the quantities for this month.');
    };
    const useStd = el.querySelector('[data-std]');
    if (useStd) useStd.onclick = async () => {
      const std = standardList(); if (!std) return ui.toast('No standard list yet.', 'info');
      if (lines.length && !await ui.confirm('Replace the ' + lines.length + ' items on this order with the standard list (' + std.items.length + ' items, the standard quantities)?', { ok: 'Use standard list' })) return;
      lines.length = 0; lines.push.apply(lines, fromStandard(std));
      const o = el.querySelector('[name=occupancy]'), g = el.querySelector('[name=ngFeeds]');
      if (o && !o.value && std.occupancy) o.value = std.occupancy; if (g && !g.value && std.ngFeeds) g.value = std.ngFeeds;
      draw(); ui.toast('Standard list filled in — change any quantity before sending.');
    };
    const saveStd = el.querySelector('[data-savestd]');
    if (saveStd) saveStd.onclick = async () => {
      const keep = lines.filter(l => String(l.description).trim());
      if (!keep.length) return ui.toast('Nothing to save.', 'warning');
      if (!await ui.confirm('Make these ' + keep.length + ' items and quantities the standard list that every new grocery order starts from?', { ok: 'Save as standard list' })) return;
      const v = n => (el.querySelector('[name=' + n + ']') || {}).value || '';
      const std = { name: 'Standard list saved ' + util.date(util.today()), month: v('groceryMonth') || month, savedAt: Date.now(), savedBy: off.name, occupancy: util.num(v('occupancy')) || '', ngFeeds: util.num(v('ngFeeds')) || '',
        items: keep.map(l => ({ section: l.section || 'Other items', description: String(l.description).trim(), brand: l.brand || '', unit: l.unit || 'each', qty: util.num(l.qty), note: l.note || '', price: util.num(l.price) || 0, supplier: l.supplier || '' })) };
      store.saveSettings({ stores: Object.assign({}, C.S(), { groceryStandard: std }) });
      Proc.audit('Grocery Order', 'Standard grocery list saved — ' + keep.length + ' items');
      ui.toast('Saved — new grocery orders will start from this list.');
    };
    const low = el.querySelector('[data-low]');
    if (low) low.onclick = () => {
      const re = foodWords();
      const rows = C.reorderRows().filter(r => r.suggest > 0 && (/food|grocer|dietary|kitchen/i.test(r.item.category || '') || re.test(r.item.name || '')));
      if (!rows.length) return ui.toast('No food items are at their reorder level.', 'info');
      rows.forEach(r => addLine({ description: r.item.name, unit: r.item.unit, qty: r.suggest, price: r.cost, supplier: r.supplier, stockItemId: r.item.id }));
      draw(); ui.toast(rows.length + ' ' + util.plural(rows.length, 'item') + ' at reorder level added.');
    };
    const collect = () => {
      const v = n => (el.querySelector('[name=' + n + ']') || {}).value || '';
      const items = lines.filter(l => String(l.description).trim() && util.num(l.qty) > 0).map(l => ({ id: util.uid('L'), description: String(l.description).trim(), unit: l.unit || 'each', qty: util.num(l.qty), estUnitPrice: util.round2(util.num(l.price)),
        supplier: l.supplier || '', section: l.section || '', brand: l.brand || '', note: l.note || '', stockBalance: l.stockBalance,
        spec: [l.brand ? 'Brand: ' + l.brand : '', l.supplier ? 'Usual supplier: ' + l.supplier : '', l.section ? l.section : '', l.note ? 'Note: ' + l.note : '', l.stockItemId ? 'Stores code ' + ((store.get('stockItems', l.stockItemId) || {}).code || '') : ''].filter(Boolean).join(' · '), stockItemId: l.stockItemId || '' }));
      const m = v('groceryMonth') || month;
      const occ = v('occupancy'), ngf = v('ngFeeds');
      const facts = [occ ? 'Patient occupancy on day of order: ' + occ : '', ngf ? 'Patients on NG feeds: ' + ngf : ''].filter(Boolean).join('. ');
      return { groceryMonth: m, title: v('title') || 'Grocery order — ' + util.monthLabel(m), department: v('department') || 'Dietary', neededBy: v('neededBy'), occupancy: occ === '' ? '' : util.num(occ), ngFeeds: ngf === '' ? '' : util.num(ngf),
        justification: [v('justification'), facts].filter(Boolean).join(' — '), items, estimate: util.round2(util.sum(items, i => i.qty * i.estUnitPrice)) };
    };
    const save = status => {
      const c = collect();
      if (!c.items.length) { ui.toast('Add at least one grocery item with a quantity.', 'warning'); return null; }
      const base = existing ? { id: existing.id } : { number: 'REQ-' + store.next('req'), date: util.today(), requestedBy: off.name, priority: 'Normal', type: 'Goods', source: 'stores', grocery: true };
      return store.upsert('requisitions', Object.assign(base, c, { category: CATEGORY, budgetLine: (foodLine() || {}).name || '', status }));
    };
    const sv = el.querySelector('[data-save]');
    if (sv) sv.onclick = () => { const r = save('Draft'); if (!r) return; Proc.audit('Grocery Order', r.number + ' saved as a draft — ' + r.items.length + ' items, est. ' + util.money(r.estimate), r.id); ui.toast('Grocery list saved (not sent yet).'); router.go('grocery/' + r.id); };
    const sd = el.querySelector('[data-send]');
    if (sd) sd.onclick = async () => {
      const c = collect(); if (!c.items.length) return ui.toast('Add at least one grocery item with a quantity.', 'warning');
      if (!await ui.confirm('Send <b>' + c.items.length + ' grocery ' + util.plural(c.items.length, 'item') + '</b> (est. <b>' + util.money(c.estimate) + '</b>) to Procurement for ' + esc(util.monthLabel(c.groceryMonth)) + '?', { ok: 'Send to Procurement' })) return;
      const r = save('Submitted'); if (!r) return;
      Proc.notify({ to: ['procurement'], type: 'purchase-request', title: 'Grocery order ' + r.number + ' — ' + util.monthLabel(r.groceryMonth), body: r.items.length + ' items · est. ' + util.money(r.estimate) + ' · for ' + r.department, link: { app: 'procurement', route: '#/requisitions/' + r.id } });
      Proc.audit('Grocery Order', r.number + ' sent to Procurement — ' + r.items.length + ' items, est. ' + util.money(r.estimate), r.id);
      ui.toast('Grocery order ' + r.number + ' sent to Procurement'); router.go('grocery?m=' + r.groceryMonth);
    };
    const dl = el.querySelector('[data-del]');
    if (dl) dl.onclick = async () => { if (!await ui.confirm('Delete this draft grocery list?', { ok: 'Delete', danger: true })) return; store.remove('requisitions', existing.id); ui.toast('Draft deleted'); router.go('grocery?m=' + month); };
    el.querySelector('[data-print]').onclick = () => printList(Object.assign({}, d, existing || {}, locked ? {} : collect(), { number: existing ? existing.number : '(draft)' }));
    draw();
  }

  /* ---------------------------------------------------------- printable list */
  function printList(r) {
    const kit = Proc.pdf && Proc.pdf.kit; if (!kit) return ui.toast('The PDF engine is not loaded.', 'warning');
    try {
      const doc = kit.newDoc(); const { w } = kit.pageSize(doc); const M = 40; const y = kit.top; const clean = kit.clean;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor.apply(doc, kit.BLUE); doc.text('GROCERY ORDER', M, y + 16);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, kit.GREY); doc.text(clean((C.S().storeName || 'General Stores') + ' · for ' + (r.department || 'Dietary')), M, y + 30);
      let fy = y + 2;
      [['Request No.', r.number], ['Month', util.monthLabel(monthOf(r))], ['Needed by', r.neededBy ? util.date(r.neededBy) : ''], ['Status', r.status || 'Draft']]
        .concat(r.occupancy !== undefined && r.occupancy !== '' ? [['Occupancy', String(r.occupancy)]] : []).concat(r.ngFeeds !== undefined && r.ngFeeds !== '' ? [['On NG feeds', String(r.ngFeeds)]] : []).forEach(([k, v]) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, kit.GREY); doc.text(k.toUpperCase(), w - M - 200, fy + 8);
        doc.setFont('helvetica', 'bold'); doc.setTextColor.apply(doc, kit.INK); doc.text(clean(String(v || '')), w - M - 110, fy + 8); fy += 13;
      });
      const items = (r.items || []).filter(i => util.num(i.qty) > 0 || !r.status || r.status === 'Draft');
      const grouped = items.some(i => i.section);
      const body = []; let lastSec = null, n = 0;
      items.forEach(i => {
        const sec = grouped ? (i.section || 'Other items') : null;
        if (grouped && sec !== lastSec) { body.push([{ content: clean(sec).toUpperCase(), colSpan: 7, styles: { fontStyle: 'bold', fillColor: [235, 241, 237], textColor: kit.INK } }]); lastSec = sec; }
        n++;
        body.push([String(n), clean(i.description) + (i.note ? '\n(' + clean(i.note) + ')' : ''), clean(i.brand || ''), clean(i.unit || ''), util.num(i.qty) ? String(util.num(i.qty)) : '-', util.num(i.estUnitPrice) ? util.money(i.estUnitPrice) : '', util.num(i.qty) * util.num(i.estUnitPrice) ? util.money(util.num(i.qty) * util.num(i.estUnitPrice)) : '']);
      });
      doc.autoTable({ startY: Math.max(fy, y + 40) + 10, margin: { left: M, right: M },
        head: [['#', 'Item', 'Brand', 'Unit', 'Qty', 'Est. unit price', 'Est. total']],
        body,
        foot: [['', 'Total', '', '', '', '', util.money(util.sum(items, i => util.num(i.qty) * util.num(i.estUnitPrice)))]],
        styles: { fontSize: 8.5, cellPadding: 4 }, headStyles: { fillColor: kit.BLUE }, footStyles: { fillColor: [235, 238, 243], textColor: kit.INK, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 22 }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } });
      let sy = doc.lastAutoTable.finalY + 24;
      if (r.justification) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor.apply(doc, kit.INK); doc.text(doc.splitTextToSize(clean(r.justification), w - 2 * M), M, sy); sy += 24; }
      if (sy > kit.pageSize(doc).h - 120) { doc.addPage(); sy = kit.top; }
      const sw = (w - 2 * M - 30) / 3;
      [['Prepared by', r.requestedBy || domain.officer().name], ['Dietary / Food Services', ''], ['Approved by', '']].forEach(([lab, nm], i) => {
        const x = M + i * (sw + 15);
        doc.setDrawColor(150); doc.line(x, sy + 30, x + sw, sy + 30);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, kit.GREY); doc.text(lab, x, sy + 42);
        if (nm) { doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor.apply(doc, kit.INK); doc.text(clean(nm), x, sy + 26); }
      });
      kit.finish(doc, { side: false, watermark: !r.status || r.status === 'Draft' ? 'DRAFT' : '' });
      doc.setProperties({ title: 'Grocery order ' + r.number });
      return Promise.resolve(kit.deliver(doc, 'Grocery Order - ' + kit.fileSafe(util.monthLabel(monthOf(r))) + '.pdf', 'open'));
    } catch (e) { console.error(e); ui.toast('Could not create the grocery list: ' + e.message, 'error'); }
  }

  C.groceryLists = groceryLists;
  Proc.quickCreate.push({ label: 'Grocery order', desc: 'The month\u2019s Dietary grocery list', icon: 'cart', order: 25, onClick: () => router.go('grocery/new') });
  Proc.page({
    id: 'grocery', title: 'Grocery Order', icon: 'cart', section: 'Workflow', order: 24,
    count: () => groceryLists().filter(r => r.status === 'Draft').length,
    render(el, params) {
      C.css('css-grocery', CSS);
      if (params[0]) return renderEditor(el, params[0]);
      renderList(el);
    }
  });
})();
