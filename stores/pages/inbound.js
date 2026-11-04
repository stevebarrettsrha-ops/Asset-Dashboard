/* General Stores — inbound.
   #/inbound      Expected deliveries (tabs: expected · put away · GRN register · returns)
   #/inbound?po=  Receive goods against a PO (Goods Received Note)
   #/grn/<id>     GRN detail, print, void
   #/purchases    Everything Procurement has bought (all PO lines)
   Every GRN updates the shared purchase order, posts Stock lines to the bin cards,
   raises a return for rejected goods and notifies Procurement (and Fixed Assets for assets). */
(function () {
  'use strict';
  const { util, ui, store, domain, files, router } = Proc;
  const esc = util.esc;
  const REJECT_REASONS = ['Damaged', 'Wrong item', 'Short-dated / expired', 'Excess quantity', 'Not to specification', 'Other'];
  const CONDITIONS = ['Good', 'Partially damaged', 'Damaged', 'Incomplete'];
  const TYPE_TONE = { Stock: 'info', Asset: 'purple', Service: '' };

  const CSS = '.ib-chips{display:flex;gap:4px;flex-wrap:wrap}.ib-late{color:var(--danger);font-weight:600}.ib-sub>td{background:var(--surface-2)!important;padding:0 0 0 24px!important}.ib-sub table td,.ib-sub table th{background:var(--surface-2)!important}' +
    '.ib-sub table{margin:0}.ib-lines td{vertical-align:top}.ib-lines input.input,.ib-lines select.input{height:32px;font-size:13px;padding:0 8px}' +
    '.ib-lines .w60{width:68px}.ib-lines .w90{width:92px}.ib-lines .w120{width:108px}.ib-lines .w150{width:138px}.ib-lines .w200{min-width:190px}.ib-lines .rej{display:flex;flex-direction:column;gap:4px;align-items:flex-start}' +
    '.ib-res{font-size:11.5px;margin-top:4px;color:var(--text-3)}.ib-res.ok{color:var(--success)}.ib-res.new{color:var(--purple)}' +
    '.ib-asset{font-size:12.5px;color:var(--purple);background:var(--purple-bg);border:1px solid var(--purple-bd);border-radius:8px;padding:8px 10px}' +
    '.ib-svc{font-size:12.5px;color:var(--text-3)}.ib-line-off td{opacity:.55}' +
    '@media(max-width:860px){.ib-lines thead{display:none}.ib-lines,.ib-lines tbody,.ib-lines tr,.ib-lines td{display:block;width:100%}.ib-lines tr{border-bottom:1px solid var(--border);padding:10px 12px}.ib-lines td{border:0!important;padding:4px 0!important}' +
    '.ib-lines td[data-l]::before{content:attr(data-l);display:block;font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}.ib-lines .w60,.ib-lines .w90,.ib-lines .w120,.ib-lines .w150{width:100%}}';
  function css() { if (!document.getElementById('css-inbound')) document.head.insertAdjacentHTML('beforeend', '<style id="css-inbound">' + CSS + '</style>'); }

  const S = () => store.settings().stores || {};
  const pad = (n, w) => String(n).padStart(w || 6, '0');
  const typeChip = t => ui.badge(t, TYPE_TONE[t] || '');
  const supplierOf = po => po.supplierName || domain.supplierName(po.supplierId) || '—';
  const procLink = route => Proc.APP_URLS.procurement + route;
  const isAdmin = () => { const u = Proc.auth.user || {}; return u.role === 'admin' || u.portalRole === 'admin' || /admin/i.test(u.role || ''); };
  /** Description without a leading "20 ea - " quantity, for naming new stock items. */
  const cleanName = d => String(d || '').replace(/^\s*\d+(\.\d+)?\s*[a-z/.]{0,8}\s*[-–:]\s*/i, '').trim() || String(d || '').trim();
  const officerName = () => domain.officer().name;

  /** Unit cost incl. this line's share of PO GCT. */
  function landedCost(po, line) {
    const price = util.num(line.unitPrice);
    const sub = util.num(po.subtotal) || util.sum(domain.poLines(po), l => util.num(l.total) || util.num(l.qty) * util.num(l.unitPrice));
    const share = sub > 0 && util.num(po.gct) > 0 ? util.num(po.gct) / sub : 0;
    return util.round2(price * (1 + share));
  }

  /** Group inbound rows by PO. */
  function groups(rows) {
    const m = new Map();
    rows.forEach(r => {
      if (!m.has(r.po.id)) m.set(r.po.id, { po: r.po, lines: [], expected: r.expected, daysLate: 0, overdue: false, value: 0, types: {} });
      const g = m.get(r.po.id);
      g.lines.push(r);
      g.value += r.outstanding * util.num(r.line.unitPrice);
      g.types[r.type] = (g.types[r.type] || 0) + 1;
      if (r.overdue) { g.overdue = true; g.daysLate = Math.max(g.daysLate, r.daysLate); }
    });
    return Array.from(m.values());
  }
  function overdueCount() { try { return groups(domain.inbound()).filter(g => g.overdue).length; } catch (e) { return 0; } }

  /* ---------------------------------------------------------------- stock item picker */
  function stockDatalist() {
    let dl = document.getElementById('dl-stock');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'dl-stock'; document.body.appendChild(dl); }
    dl.innerHTML = store.list('stockItems').filter(i => i.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name))
      .map(i => '<option value="' + esc(i.code + ' · ' + i.name) + '">').join('');
    return 'dl-stock';
  }
  function resolveItem(text) {
    const t = String(text || '').trim(); if (!t) return null;
    const code = t.split(' · ')[0].trim();
    return domain.findStockItem(code) || domain.findStockItem(t) || null;
  }

  /**
   * Shared line editor for GRN (receive) and put-away.
   * st: [{ i, line, type, ordered, before, outstanding, qty, rej, reason, itemText, unit, category, location, batch, expiry, cost, editable }]
   * mode: 'grn' (receive + reject columns, type select) | 'putaway' (qty fixed from the delivery)
   */
  function lineRows(st, mode) {
    const locs = S().locations || [], cats = S().categories || ['General'];
    return st.map((l, k) => {
      const isStock = l.type === 'Stock', isAsset = l.type === 'Asset';
      const item = isStock ? resolveItem(l.itemText) : null;
      const needExp = item && item.trackExpiry;
      const typeCell = mode === 'grn' ? '<select class="input w90" data-k="type">' + domain.ITEM_TYPES.map(t => '<option' + (t === l.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' : typeChip(l.type);
      let stockCells;
      if (isStock) {
        stockCells = '<td data-l="Stock item" class="w200"><input class="input" data-k="itemText" list="dl-stock" value="' + esc(l.itemText) + '" placeholder="Code or name — Enter">' +
          '<div class="ib-res ' + (item ? 'ok' : 'new') + '">' + (item ? '→ ' + esc(item.code) + ' · on hand ' + util.int(item.onHand) + ' ' + esc(item.unit || '') : 'New item: ' + esc(cleanName(l.line.description)).slice(0, 60) +
            ' <select class="input" data-k="category" style="height:26px;font-size:12px;margin-top:4px;width:100%">' + ui.options(cats, l.category || 'General') + '</select>') + '</div></td>' +
          '<td data-l="Bin"><select class="input w120" data-k="location">' + ui.options(locs, l.location || (item && item.location) || '', '—') + '</select></td>' +
          '<td data-l="Batch / lot"><input class="input w90" data-k="batch" value="' + esc(l.batch) + '" placeholder="Batch"></td>' +
          '<td data-l="Expiry' + (needExp ? ' (required)' : '') + '"><input class="input w150" type="date" data-k="expiry" value="' + esc(l.expiry) + '"' + (needExp ? ' required' : '') + '></td>' +
          '<td data-l="Unit cost" class="num"><input class="input w90 num" type="number" step="0.01" min="0" data-k="cost" value="' + esc(l.cost) + '"></td>';
      } else if (isAsset) {
        stockCells = '<td colspan="5" data-l="Fixed asset"><div class="ib-asset">Fixed asset — not put into stock. The Fixed Asset Officer is notified to tag and register it.</div></td>';
      } else {
        stockCells = '<td colspan="5" data-l="Service"><div class="ib-svc">Service — nothing to put into stock.</div></td>';
      }
      const qtyCells = mode === 'grn'
        ? '<td data-l="Received now" class="num"><input class="input w60 num" type="number" min="0" step="any" data-k="qty" value="' + esc(l.qty) + '"></td>' +
          '<td data-l="Rejected"><div class="rej"><input class="input w60 num" type="number" min="0" step="any" data-k="rej" value="' + esc(l.rej || '') + '" placeholder="0">' +
          (util.num(l.rej) > 0 ? '<select class="input w120" data-k="reason">' + ui.options(REJECT_REASONS, l.reason || '', 'Reason…') + '</select>' : '') + '</div></td>'
        : '<td data-l="Received" class="num strong">' + util.int(l.qty) + ' ' + esc(l.line.unit || '') + '</td>';
      return '<tr data-row="' + k + '" class="' + (mode === 'grn' && !util.num(l.qty) && !util.num(l.rej) ? 'ib-line-off' : '') + '"><td class="muted" data-l="Line">' + (l.i + 1) + '</td>' +
        '<td data-l="Item" style="min-width:170px"><div class="strong">' + esc(l.line.description) + '</div><div class="t-sub">' + esc(l.line.unit || '') + (mode === 'grn' ? ' · ordered ' + util.int(l.ordered) + ' · received before ' + util.int(l.before) + ' · <b>outstanding ' + util.int(l.outstanding) + '</b>' : '') + '</div></td>' +
        '<td data-l="Type">' + typeCell + '</td>' + qtyCells + stockCells + '</tr>';
    }).join('');
  }
  function lineHead(mode) {
    return '<thead><tr><th>#</th><th>Item</th><th>Type</th>' + (mode === 'grn' ? '<th class="num">Received now</th><th class="num">Rejected</th>' : '<th class="num">Received</th>') +
      '<th>Stock item</th><th>Bin</th><th>Batch</th><th>Expiry</th><th class="num">Unit cost</th></tr></thead>';
  }
  /** Read inputs back into state on every change, re-render the row when its structure changes. */
  function bindLines(tbody, st, mode, onType) {
    let swapping = false;
    const upd = (tr, rerender) => {
      if (swapping || !tr.isConnected) return tr; // already being redrawn
      const l = st[+tr.dataset.row];
      tr.querySelectorAll('[data-k]').forEach(inp => { l[inp.dataset.k] = inp.value; });
      if (rerender) {
        // Replacing the row blurs its focused input, which fires another change — ignore that nested one.
        const tmp = document.createElement('tbody'); tmp.innerHTML = lineRows([l], mode).replace('data-row="0"', 'data-row="' + tr.dataset.row + '"'); const nr = tmp.firstElementChild;
        swapping = true; try { tr.replaceWith(nr); } finally { swapping = false; }
        return nr;
      }
      return tr;
    };
    tbody.addEventListener('change', e => {
      if (swapping) return;
      const tr = e.target.closest('tr[data-row]'); if (!tr || !tr.isConnected) return;
      const k = e.target.dataset.k;
      if (k === 'type') { const l = st[+tr.dataset.row]; l.type = e.target.value; onType && onType(l); upd(tr, true); return; }
      const structural = k === 'itemText' || k === 'rej';
      const nr = upd(tr, structural);
      if (structural) { const f = nr.querySelector('[data-k="' + k + '"]'); if (f && k === 'itemText') { const n = nr.querySelector('[data-k=location]'); if (n) n.focus(); } }
      if (k === 'qty' || k === 'rej') nr.classList.toggle('ib-line-off', mode === 'grn' && !util.num(st[+nr.dataset.row].qty) && !util.num(st[+nr.dataset.row].rej));
    });
    tbody.addEventListener('input', e => { const tr = e.target.closest('tr[data-row]'); if (tr && e.target.dataset.k && e.target.dataset.k !== 'type') st[+tr.dataset.row][e.target.dataset.k] = e.target.value; });
    tbody.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.k === 'itemText') { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); } });
  }
  /** Validate stock-line details; returns an error string or ''. */
  function checkStockLines(st, qtyKey) {
    const today = util.today();
    for (const l of st) {
      if (l.type !== 'Stock' || !util.num(l[qtyKey])) continue;
      if (l.expiry && l.expiry < today) return 'Line ' + (l.i + 1) + ': the expiry date ' + util.date(l.expiry) + ' has already passed — reject the goods instead of receiving them.';
      const item = resolveItem(l.itemText);
      if (item && item.trackExpiry && !l.expiry) return 'Line ' + (l.i + 1) + ': ' + item.name + ' is tracked by expiry date — enter the expiry date.';
      if (util.num(l.cost) < 0) return 'Line ' + (l.i + 1) + ': unit cost cannot be negative.';
    }
    return '';
  }
  /** Post one received Stock line to the bin card; returns the stock item. */
  function postLine(l, qty, po, del, refNo) {
    let item = resolveItem(l.itemText);
    if (!item) item = domain.ensureStockItem(cleanName(l.line.description), { unit: l.line.unit || 'each', category: l.category || 'General', location: l.location || '', supplierIds: po.supplierId ? [po.supplierId] : [] }, { silent: true });
    if (l.location && !item.location) store.upsert('stockItems', { id: item.id, location: l.location }, { silent: true });
    const move = domain.postStock({ itemId: item.id, type: 'Receipt', qty: util.num(qty), unitCost: util.num(l.cost), batchNo: l.batch || '', expiryDate: l.expiry || '', location: l.location || '', date: del.date,
      ref: refNo, poId: po.id, grnId: del.id, supplierId: po.supplierId || '', notes: 'PO ' + po.poNumber + ' · ' + refNo }, { silent: true });
    return { item: store.get('stockItems', item.id), move };
  }

  /* ================================================================ RECEIVE (GRN) */
  function renderReceive(el, poId) {
    const po = store.get('purchaseOrders', poId);
    if (!po) { el.innerHTML = ui.empty('truck', 'Purchase order not found', 'It may have been removed or not synced to this computer yet.', '<a class="btn" href="#/inbound">Back to expected deliveries</a>'); return; }
    ui.setCrumbs(['Expected Deliveries', 'Receive PO ' + po.poNumber]);
    const lines = domain.poLines(po), got = domain.lineReceived(po);
    const st = [];
    lines.forEach((line, i) => {
      const type = domain.classifyLine(line, po), ordered = util.num(line.qty) || 1, before = got[i] || 0, outstanding = Math.max(0, util.round2(ordered - before));
      if (!outstanding || type === 'Service') return;
      const found = type === 'Stock' ? (domain.findStockItem(line.description) || domain.findStockItem(cleanName(line.description))) : null;
      st.push({ i, line, type, ordered, before, outstanding, qty: outstanding, rej: '', reason: '', itemText: found ? found.code + ' · ' + found.name : '', category: 'General', location: found ? found.location || '' : '', batch: '', expiry: '', cost: landedCost(po, line) });
    });
    const services = lines.filter((l, i) => domain.classifyLine(l, po) === 'Service').length;
    const nextNo = 'GRN-' + pad((store.settings().counters.grn || 0) + 1);
    let picked = [], dirty = false;
    stockDatalist();
    el.innerHTML = ui.pageHead({
      back: { label: 'Expected deliveries', href: '#/inbound' }, title: 'Receive goods — PO ' + po.poNumber, badge: ui.badge(po.status),
      sub: esc(supplierOf(po)) + ' · ordered ' + util.date(po.date) + ' · expected ' + util.date(domain.expectedDate(po)) + ' · <a href="' + procLink('#/orders/' + po.id) + '">open in Procurement</a>'
    }) +
      (st.length ? '' : '<div class="alert success mb-2">' + ui.icon('check') + '<div><div class="t">Nothing outstanding on this PO</div>Every goods line has been received.' + (services ? ' Service lines are not received in Stores.' : '') + '</div></div>') +
      '<div class="card"><div class="card-h"><div><h3>Goods Received Note</h3><div class="sub">Number <b class="mono">' + nextNo + '</b> is given when you save</div></div></div><div class="card-b"><div class="form-grid" id="grnHead">' +
      '<div class="field s3"><label>Date received<span class="req">*</span></label><input type="date" name="date" value="' + util.today() + '" max="' + util.today() + '"></div>' +
      '<div class="field s3"><label>Received by<span class="req">*</span></label><input name="receivedBy" value="' + esc(officerName()) + '"></div>' +
      '<div class="field s3"><label>Supplier delivery note / invoice #</label><input name="deliveryRef" placeholder="e.g. DN 44821"></div>' +
      '<div class="field s3"><label>Condition on arrival</label><select name="condition">' + ui.options(CONDITIONS, 'Good') + '</select></div>' +
      '<div class="field s4"><label>Vehicle / driver</label><input name="driver" placeholder="Optional"></div>' +
      '<div class="field s8"><label>Notes</label><input name="notes" placeholder="Anything the next person should know"></div></div></div></div>' +
      (st.length ? '<div class="card"><div class="card-h"><div><h3>Lines received</h3><div class="sub">' + st.length + ' ' + util.plural(st.length, 'line') + ' outstanding' + (services ? ' · ' + services + ' service ' + util.plural(services, 'line') + ' not received here' : '') + '. Stock lines go onto the bin cards; assets go to the Fixed Asset Officer.</div></div>' +
        '<div class="row"><button class="btn sm" data-a="all">' + ui.icon('check', 'sm') + 'Receive all outstanding</button><button class="btn sm ghost" data-a="clear">Clear quantities</button></div></div>' +
        '<div class="table-wrap"><table class="table compact ib-lines">' + lineHead('grn') + '<tbody id="grnLines">' + lineRows(st, 'grn') + '</tbody></table></div>' +
        '<div class="card-f" style="justify-content:space-between"><div class="row"><button class="btn sm" data-a="attach">' + ui.icon('clip', 'sm') + 'Attach delivery note</button><span class="small muted" id="grnFiles"></span><input type="file" multiple hidden id="grnFileIn" accept="application/pdf,image/*"></div>' +
        '<div class="row"><a class="btn ghost" href="#/inbound">Cancel</a><button class="btn primary" data-a="save">' + ui.icon('check', 'sm') + 'Save GRN</button></div></div></div>' : '');
    if (!st.length) return;
    const tbody = el.querySelector('#grnLines');
    bindLines(tbody, st, 'grn', l => {
      const cp = util.clone(po.items && po.items.length ? po.items : domain.poLines(po)); cp[l.i] = Object.assign({}, cp[l.i], { itemType: l.type });
      store.upsert('purchaseOrders', { id: po.id, items: cp }, { silent: true }); store.save();
      Proc.audit('Classify PO Line', 'PO ' + po.poNumber + ' line ' + (l.i + 1) + ': ' + l.type, po.id);
      ui.toast('Line ' + (l.i + 1) + ' is now ' + l.type);
    });
    el.addEventListener('input', () => { dirty = true; });
    router.beforeLeave = async () => !dirty || ui.confirm('Leave without saving this GRN? What you entered will be lost.', { ok: 'Leave', danger: true });
    el.querySelector('[data-a=all]').onclick = () => { st.forEach(l => { l.qty = l.outstanding; }); tbody.innerHTML = lineRows(st, 'grn'); };
    el.querySelector('[data-a=clear]').onclick = () => { st.forEach(l => { l.qty = ''; l.rej = ''; }); tbody.innerHTML = lineRows(st, 'grn'); };
    const fi = el.querySelector('#grnFileIn');
    el.querySelector('[data-a=attach]').onclick = () => fi.click();
    fi.onchange = () => { picked = picked.concat(Array.from(fi.files)); el.querySelector('#grnFiles').textContent = picked.map(f => f.name).join(', '); fi.value = ''; };
    el.querySelector('[data-a=save]').onclick = async e => {
      const btn = e.currentTarget;
      const h = ui.formData(el.querySelector('#grnHead'));
      if (!h.date || !h.receivedBy) return ui.toast('Enter the date and who received the goods.', 'warning');
      if (h.date > util.today()) return ui.toast('The date received cannot be in the future.', 'warning');
      for (const l of st) { if (util.num(l.qty) < 0 || util.num(l.rej) < 0) return ui.toast('Line ' + (l.i + 1) + ': quantities cannot be negative.', 'warning'); }
      const act = st.filter(l => util.num(l.qty) > 0 || util.num(l.rej) > 0);
      if (!act.length) return ui.toast('Enter a quantity received (or rejected) on at least one line.', 'warning');
      const noReason = act.find(l => util.num(l.rej) > 0 && !l.reason);
      if (noReason) return ui.toast('Line ' + (noReason.i + 1) + ': choose why the goods were rejected.', 'warning');
      const err = checkStockLines(st, 'qty'); if (err) return ui.toast(err, 'warning');
      const over = act.filter(l => util.num(l.qty) > l.outstanding + 1e-9);
      if (over.length && !await ui.confirm('More than the outstanding quantity is being received on ' + over.map(l => 'line ' + (l.i + 1)).join(', ') + '. Receive the extra anyway?', { ok: 'Receive anyway' })) return;
      btn.disabled = true;
      try {
        const del = saveGrn(po, st, h);
        for (const f of picked) await files.add(f, { kind: 'Delivery Note / GRN', supplierId: po.supplierId, ref: del.grn, date: del.date, links: { poId: po.id, deliveryId: del.id } });
        dirty = false; router.beforeLeave = null;
        ui.toast(del.grn + ' saved — Procurement notified');
        router.go('grn/' + del.id);
      } catch (ex) { console.error(ex); ui.toast(ex.message || String(ex), 'error'); btn.disabled = false; }
    };
  }
  function saveGrn(po, st, h) {
    const grn = 'GRN-' + pad(store.next('grn'));
    let del; const moves = [];
    store.batch(() => {
      const act = st.filter(l => util.num(l.qty) > 0 || util.num(l.rej) > 0);
      del = store.upsert('deliveries', {
        poId: po.id, supplierId: po.supplierId || '', date: h.date, grn, receivedBy: h.receivedBy, deliveryRef: h.deliveryRef || '', driver: h.driver || '', condition: h.condition || 'Good', notes: h.notes || '',
        items: act.map(l => ({ lineIndex: l.i, description: l.line.description, unit: l.line.unit || '', type: l.type, qtyOrdered: l.ordered, qtyReceived: util.num(l.qty), qtyRejected: util.num(l.rej), rejectReason: util.num(l.rej) ? l.reason : '',
          itemId: '', batchNo: l.type === 'Stock' ? l.batch || '' : '', expiryDate: l.type === 'Stock' ? l.expiry || '' : '', location: l.type === 'Stock' ? l.location || '' : '', unitCost: util.num(l.cost) })),
        recordedIn: 'stores', stocked: true, stockedAt: Date.now(), stockedBy: officerName(), rejectedQty: util.sum(act, l => util.num(l.rej))
      }, { silent: true });
      const items = del.items.slice();
      act.forEach((l, k) => { if (l.type === 'Stock' && util.num(l.qty) > 0) { const r = postLine(l, l.qty, po, del, grn); moves.push(r.move); items[k] = Object.assign({}, items[k], { itemId: r.item.id, itemCode: r.item.code }); } });
      const got = domain.lineReceived(Object.assign({}, po)); // includes this delivery
      const complete = domain.poLines(po).every((ln, i) => domain.classifyLine(ln, po) === 'Service' || (got[i] || 0) >= (util.num(ln.qty) || 1));
      store.upsert('deliveries', { id: del.id, items, final: complete, partial: !complete }, { silent: true });
      const rej = act.filter(l => util.num(l.rej) > 0);
      if (rej.length) {
        const rtn = store.upsert('supplierReturns', { number: 'RTN-' + pad(store.next('rtn'), 4), date: h.date, poId: po.id, deliveryId: del.id, supplierId: po.supplierId || '', status: 'Open',
          items: rej.map(l => ({ lineIndex: l.i, description: l.line.description, unit: l.line.unit || '', qty: util.num(l.rej), reason: l.reason })), notes: 'Rejected on ' + grn }, { silent: true });
        Proc.notify({ to: ['procurement'], type: 'goods-rejected', poId: po.id, title: 'Goods rejected — PO ' + po.poNumber + ' · ' + supplierOf(po), body: rej.map(l => util.num(l.rej) + ' ' + (l.line.unit || '') + ' ' + l.line.description + ' (' + l.reason + ')').join('; ') + ' · return ' + rtn.number, link: { app: 'procurement', route: '#/orders/' + po.id } });
      }
    });
    del = store.get('deliveries', del.id);
    domain.refreshOrderStatus(po.id);
    domain.afterDelivery(del, { by: 'stores' });
    if (moves.length) domain.afterStocked(del, moves); // Procurement sees the goods reach the bin cards
    Proc.audit('Goods Received', del.grn + ' · PO ' + po.poNumber + ' · ' + supplierOf(po) + ' · ' + del.items.length + ' ' + util.plural(del.items.length, 'line') + (del.rejectedQty ? ' · ' + del.rejectedQty + ' rejected' : ''), del.id);
    store.save(); store.emit('change', { coll: 'deliveries', id: del.id });
    return del;
  }

  /* ================================================================ PUT AWAY */
  function putAway(delId) {
    const del = store.get('deliveries', delId); if (!del) return;
    const po = store.get('purchaseOrders', del.poId);
    if (!po) return ui.toast('The purchase order for this delivery is not on this computer yet.', 'warning');
    const lines = domain.poLines(po);
    const st = (del.items || []).map((it, k) => {
      const i = typeof it.lineIndex === 'number' ? it.lineIndex : (typeof it.line === 'number' ? it.line : lines.findIndex(l => l.description === it.description));
      const line = lines[i] || { description: it.description, unit: it.unit, unitPrice: 0 };
      const type = domain.classifyLine(line, po);
      const found = type === 'Stock' ? (domain.findStockItem(line.description) || domain.findStockItem(cleanName(line.description))) : null;
      return { k, i: i < 0 ? k : i, line, type, qty: util.num(it.qtyReceived), itemText: found ? found.code + ' · ' + found.name : '', category: 'General', location: found ? found.location || '' : '', batch: it.batchNo || '', expiry: it.expiryDate || '', cost: landedCost(po, line) };
    }).filter(l => l.qty > 0);
    const stockLines = st.filter(l => l.type === 'Stock');
    stockDatalist();
    ui.modal({
      title: 'Put into stock — ' + (del.grn || 'delivery') + ' · PO ' + po.poNumber, size: 'xl', sticky: true,
      body: '<p class="muted mb-2">Procurement recorded this delivery on ' + util.date(del.date) + ' (received by ' + esc(del.receivedBy || '—') + '). Check the stock item, bin, batch and expiry for each stock line, then put it away.</p>' +
        (stockLines.length ? '' : '<div class="alert mb-2">' + ui.icon('info') + '<div>This delivery has no stock lines (only assets or services). Mark it done to clear it from the queue.</div></div>') +
        '<div class="table-wrap"><table class="table compact ib-lines">' + lineHead('putaway') + '<tbody id="paLines">' + lineRows(st, 'putaway') + '</tbody></table></div>',
      onOpen: m => bindLines(m.querySelector('#paLines'), st, 'putaway'),
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: stockLines.length ? 'Put into stock' : 'Mark done', kind: 'primary', icon: 'check', onClick: async () => {
        const err = checkStockLines(st, 'qty'); if (err) { ui.toast(err, 'warning'); return false; }
        const moves = [];
        store.batch(() => {
          const items = (del.items || []).slice();
          st.forEach(l => { if (l.type === 'Stock') { const r = postLine(l, l.qty, po, del, del.grn || 'Delivery ' + util.date(del.date)); moves.push(r.move); const it = r.item; items[l.k] = Object.assign({}, items[l.k], { itemId: it.id, itemCode: it.code, batchNo: l.batch || '', expiryDate: l.expiry || '', location: l.location || '', unitCost: util.num(l.cost), type: 'Stock' }); } else items[l.k] = Object.assign({}, items[l.k], { type: l.type }); });
          store.upsert('deliveries', { id: del.id, items, stocked: true, stockedAt: Date.now(), stockedBy: officerName() }, { silent: true });
        });
        store.save(); store.emit('change', { coll: 'deliveries', id: del.id });
        if (moves.length) domain.afterStocked(store.get('deliveries', del.id), moves); // tell Procurement the goods are on the shelves
        Proc.audit('Put Away', (del.grn || 'Delivery') + ' · PO ' + po.poNumber + ' · ' + stockLines.length + ' stock ' + util.plural(stockLines.length, 'line'), del.id);
        ui.toast(stockLines.length ? 'Put into stock — bin cards updated' : 'Cleared from the put-away queue');
        router.refresh();
      } }]
    });
  }

  /* ================================================================ LIST PAGE */
  const state = { tab: 'expected', services: false };
  function renderInbound(el, q) {
    if (q.po) return renderReceive(el, q.po);
    if (q.tab) state.tab = q.tab;
    const rows = domain.inbound({ includeServices: state.services });
    const gs = groups(rows.filter(r => state.services || r.type !== 'Service'));
    const dels = store.list('deliveries');
    const pending = dels.filter(d => d.recordedIn === 'procurement' && d.stocked === false && !d.voided);
    const rets = store.list('supplierReturns');
    const goods = rows.filter(r => r.type !== 'Service');
    const overdue = gs.filter(g => g.overdue);
    const assetsQty = util.sum(goods.filter(r => r.type === 'Asset'), r => r.outstanding);
    el.innerHTML = ui.pageHead({ title: 'Expected Deliveries', sub: 'Everything Procurement has ordered that has not arrived yet — receive it here with a Goods Received Note.' }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'POs awaiting delivery', icon: 'truck', value: util.int(gs.length), meta: util.int(goods.length) + ' goods ' + util.plural(goods.length, 'line') + ' outstanding' }) +
      ui.kpi({ label: 'Overdue', icon: 'clock', tone: overdue.length ? 'bad' : 'ok', value: util.int(overdue.length), meta: overdue.length ? 'Longest ' + Math.max.apply(null, overdue.map(g => g.daysLate)) + ' days late' : 'All on time' }) +
      ui.kpi({ label: 'Value on order', icon: 'wallet', value: util.moneyShort(util.sum(gs, g => g.value)), title: util.money(util.sum(gs, g => g.value)), meta: 'Outstanding lines at PO prices' }) +
      ui.kpi({ label: 'Fixed assets expected', icon: 'tag', tone: 'pur', value: util.int(assetsQty), meta: 'Units to hand to the Fixed Asset Officer' }) + '</div>' +
      '<div class="card"><div class="tabs">' +
      [['expected', 'Expected', gs.length], ['putaway', 'Put away', pending.length], ['register', 'GRN register', dels.filter(d => !d.voided).length], ['returns', 'Returns to supplier', rets.filter(r => r.status === 'Open').length]]
        .map(t => '<button class="' + (state.tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + (t[2] ? ' <span class="n">' + t[2] + '</span>' : '') + '</button>').join('') +
      '</div><div id="ibBody"></div></div>';
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; history.replaceState(null, '', '#/inbound' + (state.tab === 'expected' ? '' : '?tab=' + state.tab)); renderInbound(el, {}); });
    const body = el.querySelector('#ibBody');
    ({ expected: () => tabExpected(body, gs, el), putaway: () => tabPutaway(body, pending), register: () => tabRegister(body, dels), returns: () => tabReturns(body, rets) })[state.tab]();
  }

  function tabExpected(body, gs, el) {
    const sups = Array.from(new Set(gs.map(g => supplierOf(g.po)))).sort();
    ui.table(body, {
      rows: gs, pageSize: 25, placeholder: 'Search PO #, supplier or item… (Enter)', initialSort: { key: 'expected', dir: 1 },
      search: g => [g.po.poNumber, supplierOf(g.po), g.po.description].concat(g.lines.map(l => l.line.description)).join(' '),
      filters: [
        { key: 'sup', label: 'All suppliers', options: sups, test: (g, v) => supplierOf(g.po) === v },
        { key: 'type', label: 'All types', options: ['Stock', 'Asset'].concat(state.services ? ['Service'] : []), test: (g, v) => !!g.types[v] },
        { key: 'late', label: 'On time & overdue', options: [{ value: 'late', label: 'Overdue only' }], test: g => g.overdue }
      ],
      toolbar: '<label class="check small"><input type="checkbox" id="ibSvc"' + (state.services ? ' checked' : '') + '> Include services</label>',
      onRow: (g, e) => {
        const tr = e.target.closest('tr'); const next = tr.nextElementSibling;
        if (next && next.classList.contains('ib-sub')) { next.remove(); return; }
        const sub = document.createElement('tr'); sub.className = 'ib-sub';
        sub.innerHTML = '<td colspan="7"><table class="table compact"><thead><tr><th>Line</th><th>Item</th><th>Type</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">Outstanding</th><th class="num">Unit price</th></tr></thead><tbody>' +
          g.lines.map(l => '<tr><td class="muted">' + (l.index + 1) + '</td><td>' + esc(l.line.description) + '</td><td>' + typeChip(l.type) + '</td><td class="num">' + util.int(l.ordered) + ' ' + esc(l.line.unit || '') + '</td><td class="num">' + util.int(l.received) + '</td><td class="num strong">' + util.int(l.outstanding) + '</td><td class="num">' + util.money(l.line.unitPrice) + '</td></tr>').join('') + '</tbody></table></td>';
        tr.after(sub);
      },
      columns: [
        { key: 'poNumber', label: 'PO #', sort: g => g.po.poNumber, render: g => '<span class="t-title mono">' + esc(g.po.poNumber) + '</span><div class="t-sub">' + util.date(g.po.date) + '</div>' },
        { key: 'supplier', label: 'Supplier', sort: g => supplierOf(g.po), render: g => '<div class="t-title">' + esc(supplierOf(g.po)) + '</div><div class="t-sub truncate" style="max-width:300px">' + esc(g.po.description || g.lines[0].line.description) + '</div>' },
        { key: 'expected', label: 'Expected', sort: g => g.expected, render: g => '<span class="nowrap">' + util.date(g.expected) + '</span>' + (g.overdue ? '<div class="t-sub ib-late">' + g.daysLate + ' ' + util.plural(g.daysLate, 'day') + ' late</div>' : '') },
        { key: 'lines', label: 'Outstanding', sort: g => g.lines.length, render: g => '<div class="ib-chips">' + Object.keys(g.types).map(t => ui.badge(g.types[t] + ' ' + t, TYPE_TONE[t])).join('') + '</div>' },
        { key: 'status', label: 'PO status', sort: g => g.po.status, render: g => ui.badge(g.po.status) },
        { key: 'value', label: 'Value', cls: 'num', sort: g => g.value, render: g => util.money(g.value) },
        { key: 'x', label: '', sort: false, cls: 'actions', render: g => (Object.keys(g.types).some(t => t !== 'Service') ? '<a class="btn sm primary" href="#/inbound?po=' + g.po.id + '">' + ui.icon('truck', 'sm') + 'Receive</a>' : '<span class="muted small">Service</span>') }
      ],
      footer: list => '<td colspan="5">' + list.length + ' ' + util.plural(list.length, 'PO') + '</td><td class="num">' + util.money(util.sum(list, g => g.value)) + '</td><td></td>',
      empty: ui.empty('truck', 'Nothing expected', 'Issued purchase orders appear here until every goods line has been received.')
    });
    const svc = body.querySelector('#ibSvc'); if (svc) svc.onchange = () => { state.services = svc.checked; renderInbound(el, {}); };
    // Barcode scanners type the PO number + Enter: jump straight to receiving it.
    const inp = body.querySelector('.toolbar input[type=search]');
    if (inp) inp.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const v = inp.value.trim(); const g = gs.find(x => String(x.po.poNumber) === v); if (g) router.go('inbound?po=' + g.po.id); });
  }

  function tabPutaway(body, pending) {
    ui.table(body, {
      rows: pending, search: d => { const po = store.get('purchaseOrders', d.poId) || {}; return [d.grn, po.poNumber, supplierOf(po)].concat((d.items || []).map(i => i.description)).join(' '); },
      initialSort: { key: 'date', dir: 1 },
      columns: [
        { key: 'date', label: 'Received', render: d => '<span class="nowrap">' + util.date(d.date) + '</span><div class="t-sub">' + esc(d.receivedBy || '') + '</div>' },
        { key: 'grn', label: 'GRN', render: d => '<span class="mono">' + esc(d.grn || '—') + '</span>' },
        { key: 'po', label: 'PO / supplier', sort: d => (store.get('purchaseOrders', d.poId) || {}).poNumber || '', render: d => { const po = store.get('purchaseOrders', d.poId) || {}; return '<span class="t-title mono">' + esc(po.poNumber || '—') + '</span><div class="t-sub">' + esc(supplierOf(po)) + '</div>'; } },
        { key: 'items', label: 'Lines', sort: false, render: d => esc((d.items || []).filter(i => util.num(i.qtyReceived) > 0).slice(0, 3).map(i => util.num(i.qtyReceived) + ' ' + (i.unit || '') + ' ' + i.description).join('; ')) },
        { key: 'x', label: '', sort: false, cls: 'actions', render: d => '<button class="btn sm primary" data-put="' + d.id + '">' + ui.icon('box', 'sm') + 'Put into stock</button>' }
      ],
      bind: tb => tb.querySelectorAll('[data-put]').forEach(b => b.onclick = () => putAway(b.dataset.put)),
      empty: ui.empty('box', 'Nothing to put away', 'Deliveries that Procurement records on its Receiving page land here so Stores can put the goods onto the bin cards.')
    });
  }

  function tabRegister(body, dels) {
    ui.table(body, {
      rows: dels, pageSize: 30, placeholder: 'Search GRN, PO, supplier, item…', initialSort: { key: 'date', dir: -1 },
      search: d => { const po = store.get('purchaseOrders', d.poId) || {}; return [d.grn, po.poNumber, supplierOf(po), d.receivedBy, d.deliveryRef].concat((d.items || []).map(i => i.description)).join(' '); },
      filters: [{ key: 'src', label: 'Recorded by anyone', options: [{ value: 'stores', label: 'Recorded by Stores' }, { value: 'procurement', label: 'Recorded by Procurement' }], test: (d, v) => (d.recordedIn || 'procurement') === v },
        { key: 'st', label: 'Any status', options: ['Stocked', 'Awaiting put-away', 'Voided'], test: (d, v) => v === 'Voided' ? !!d.voided : v === 'Stocked' ? d.stocked !== false && !d.voided : d.stocked === false && !d.voided }],
      onRow: d => router.go('grn/' + d.id),
      columns: [
        { key: 'grn', label: 'GRN', render: d => '<span class="t-title mono">' + esc(d.grn || '—') + '</span>' },
        { key: 'date', label: 'Date', render: d => '<span class="nowrap">' + util.date(d.date) + '</span>' },
        { key: 'po', label: 'PO / supplier', sort: d => (store.get('purchaseOrders', d.poId) || {}).poNumber || '', render: d => { const po = store.get('purchaseOrders', d.poId) || {}; return '<span class="mono">' + esc(po.poNumber || '—') + '</span><div class="t-sub">' + esc(supplierOf(po)) + '</div>'; } },
        { key: 'rec', label: 'Received', cls: 'num', sort: d => util.sum(d.items || [], i => i.qtyReceived), render: d => util.int(util.sum(d.items || [], i => i.qtyReceived)) + '<div class="t-sub">' + (d.items || []).length + ' ' + util.plural((d.items || []).length, 'line') + '</div>' },
        { key: 'rej', label: 'Rejected', cls: 'num', sort: d => util.num(d.rejectedQty), render: d => util.num(d.rejectedQty) ? '<span class="text-danger">' + util.int(d.rejectedQty) + '</span>' : '<span class="muted">—</span>' },
        { key: 'receivedBy', label: 'Received by' },
        { key: 'state', label: 'Status', sort: d => d.voided ? 'Voided' : d.stocked === false ? 'Put away' : 'Stocked', render: d => d.voided ? ui.badge('Voided', 'danger') : d.stocked === false ? ui.badge('Awaiting put-away', 'warning') : ui.badge(d.partial ? 'Part delivery' : 'Complete', d.partial ? 'info' : 'success') }
      ],
      empty: ui.empty('clipboardCheck', 'No goods received yet', 'Every GRN — from Stores or Procurement — is listed here.')
    });
  }

  function tabReturns(body, rets) {
    const next = { Open: 'Collected', Collected: 'Credited' };
    ui.table(body, {
      rows: rets, search: r => { const po = store.get('purchaseOrders', r.poId) || {}; return [r.number, po.poNumber, domain.supplierName(r.supplierId)].concat((r.items || []).map(i => i.description)).join(' '); },
      initialSort: { key: 'date', dir: -1 },
      filters: [{ key: 'status', label: 'All statuses', options: ['Open', 'Collected', 'Credited'] }],
      columns: [
        { key: 'number', label: 'Return', render: r => '<span class="t-title mono">' + esc(r.number) + '</span><div class="t-sub">' + util.date(r.date) + '</div>' },
        { key: 'po', label: 'PO / supplier', sort: false, render: r => { const po = store.get('purchaseOrders', r.poId) || {}; return '<span class="mono">' + esc(po.poNumber || '—') + '</span><div class="t-sub">' + esc(domain.supplierName(r.supplierId, supplierOf(po))) + '</div>'; } },
        { key: 'items', label: 'Goods returned', sort: false, render: r => esc((r.items || []).map(i => util.num(i.qty) + ' ' + (i.unit || '') + ' ' + i.description + ' — ' + i.reason).join('; ')) },
        { key: 'status', label: 'Status', render: r => ui.badge(r.status, r.status === 'Open' ? 'warning' : r.status === 'Collected' ? 'info' : 'success') },
        { key: 'x', label: '', sort: false, cls: 'actions', render: r => (next[r.status] ? '<button class="btn sm" data-adv="' + r.id + '">Mark ' + next[r.status].toLowerCase() + '</button> ' : '') + '<button class="btn sm ghost icon" data-print="' + r.id + '" title="Print return note">' + ui.icon('printer', 'sm') + '</button>' }
      ],
      bind: tb => {
        tb.querySelectorAll('[data-adv]').forEach(b => b.onclick = async () => {
          const r = store.get('supplierReturns', b.dataset.adv); const to = next[r.status];
          if (!await ui.confirm('Mark return <b>' + esc(r.number) + '</b> as <b>' + to + '</b>?', { ok: 'Mark ' + to.toLowerCase() })) return;
          store.upsert('supplierReturns', { id: r.id, status: to, [to.toLowerCase() + 'At']: util.today() });
          Proc.audit('Supplier Return', r.number + ' → ' + to, r.id);
          if (to === 'Credited') { const po = store.get('purchaseOrders', r.poId) || {}; Proc.notify({ to: ['procurement'], type: 'return-credited', poId: r.poId, title: 'Return ' + r.number + ' credited — PO ' + (po.poNumber || ''), body: domain.supplierName(r.supplierId, supplierOf(po)) + ' has credited the rejected goods.', link: { app: 'procurement', route: '#/orders/' + r.poId } }); }
          router.refresh();
        });
        tb.querySelectorAll('[data-print]').forEach(b => b.onclick = () => printReturn(store.get('supplierReturns', b.dataset.print)).catch(e => ui.toast(e.message, 'error')));
      },
      empty: ui.empty('undo', 'No returns', 'Goods rejected on a GRN create a return to the supplier here, and Procurement is told.')
    });
  }

  /* ================================================================ GRN DETAIL */
  function renderGrn(el, id) {
    const d = store.get('deliveries', id);
    if (!d) { el.innerHTML = ui.empty('clipboardCheck', 'GRN not found', '', '<a class="btn" href="#/inbound?tab=register">GRN register</a>'); return; }
    const po = store.get('purchaseOrders', d.poId) || {};
    const moves = store.filter('stockMoves', m => m.grnId === d.id).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const docs = store.list('documents').filter(x => x.links && (x.links.deliveryId === d.id || (x.links.poId === d.poId && x.kind === 'Delivery Note / GRN' && x.ref === d.grn)));
    const rtn = store.find('supplierReturns', r => r.deliveryId === d.id);
    ui.setCrumbs(['Expected Deliveries', d.grn || 'Delivery']);
    el.innerHTML = ui.pageHead({
      back: { label: 'GRN register', href: '#/inbound?tab=register' }, title: d.grn || 'Delivery ' + util.date(d.date),
      badge: d.voided ? ui.badge('Voided', 'danger') : d.stocked === false ? ui.badge('Awaiting put-away', 'warning') : ui.badge(d.partial ? 'Part delivery' : 'Complete delivery', d.partial ? 'info' : 'success'),
      sub: 'PO <a href="' + procLink('#/orders/' + po.id) + '">' + esc(po.poNumber || '—') + '</a> · ' + esc(supplierOf(po)) + ' · received ' + util.date(d.date) + ' by ' + esc(d.receivedBy || '—'),
      actions: (d.stocked === false && !d.voided ? '<button class="btn primary" data-a="put">' + ui.icon('box', 'sm') + 'Put into stock</button>' : '') +
        '<button class="btn" data-a="print">' + ui.icon('printer', 'sm') + 'Print GRN</button>' +
        (!d.voided ? '<button class="btn danger ghost" data-a="void"' + (isAdmin() ? '' : ' disabled title="Only an Administrator can void a GRN"') + '>' + ui.icon('x', 'sm') + 'Void</button>' : '')
    }) +
      (d.voided ? '<div class="alert danger mb-2">' + ui.icon('alert') + '<div><div class="t">This GRN was voided</div>' + esc(d.voidReason || '') + ' — ' + esc(d.voidedBy || '') + ', ' + util.dateTime(d.voidedAt) + '. Its stock was reversed.</div></div>' : '') +
      '<div class="grid side"><div class="stack"><div class="card"><div class="card-h"><h3>Lines</h3></div><div class="table-wrap"><table class="table compact"><thead><tr><th>#</th><th>Item</th><th>Type</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">Rejected</th><th>Stock item</th><th>Batch / expiry</th><th>Bin</th><th class="num">Unit cost</th></tr></thead><tbody>' +
      (d.items || []).map(i => { const it = i.itemId ? store.get('stockItems', i.itemId) : null; return '<tr><td class="muted">' + ((typeof i.lineIndex === 'number' ? i.lineIndex : i.line || 0) + 1) + '</td><td>' + esc(i.description) + '</td><td>' + (i.type ? typeChip(i.type) : '') + '</td><td class="num">' + util.int(i.qtyOrdered) + '</td><td class="num strong">' + util.int(i.qtyReceived) + ' ' + esc(i.unit || '') + '</td>' +
        '<td class="num">' + (util.num(i.qtyRejected) ? '<span class="text-danger">' + util.int(i.qtyRejected) + '</span><div class="t-sub">' + esc(i.rejectReason || '') + '</div>' : '—') + '</td>' +
        '<td>' + (it ? '<a href="#/inventory/' + it.id + '">' + esc(it.code) + '</a><div class="t-sub">' + esc(it.name) + '</div>' : '<span class="muted">' + (i.type === 'Asset' ? 'Fixed asset' : '—') + '</span>') + '</td>' +
        '<td class="small">' + esc(i.batchNo || '') + (i.expiryDate ? '<div class="t-sub">exp ' + util.date(i.expiryDate) + '</div>' : '') + '</td><td>' + esc(i.location || '') + '</td><td class="num">' + (i.unitCost ? util.money(i.unitCost) : '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>' +
      (moves.length ? '<div class="card"><div class="card-h"><h3>Stock movements</h3><div class="sub">Posted to the bin cards by this GRN</div></div><div class="table-wrap"><table class="table compact"><thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="num">Qty</th><th class="num">Balance after</th><th>By</th></tr></thead><tbody>' +
        moves.map(m => '<tr><td>' + util.date(m.date) + '</td><td><a href="#/inventory/' + m.itemId + '">' + esc(m.itemCode) + '</a> ' + esc(m.itemName) + '</td><td>' + esc(m.type) + '</td><td class="num ' + (m.qty < 0 ? 'text-danger' : 'text-success') + '">' + (m.qty > 0 ? '+' : '') + util.int(m.qty) + '</td><td class="num">' + util.int(m.balanceAfter) + '</td><td>' + esc(m.by || '') + '</td></tr>').join('') + '</tbody></table></div></div>' : '') +
      '</div><div class="stack"><div class="card"><div class="card-h"><h3>Delivery</h3></div><div class="card-b"><dl class="kv tight">' +
      '<dt>GRN</dt><dd class="mono">' + esc(d.grn || '—') + '</dd><dt>PO</dt><dd><a href="' + procLink('#/orders/' + po.id) + '">' + esc(po.poNumber || '—') + '</a> · ' + ui.badge(po.status || '') + '</dd>' +
      '<dt>Supplier</dt><dd>' + (po.supplierId ? '<a href="' + procLink('#/suppliers/' + po.supplierId) + '">' + esc(supplierOf(po)) + '</a>' : esc(supplierOf(po))) + '</dd>' +
      '<dt>Date</dt><dd>' + util.date(d.date) + '</dd><dt>Received by</dt><dd>' + esc(d.receivedBy || '—') + '</dd>' +
      (d.deliveryRef ? '<dt>Delivery note</dt><dd>' + esc(d.deliveryRef) + '</dd>' : '') + (d.driver ? '<dt>Vehicle / driver</dt><dd>' + esc(d.driver) + '</dd>' : '') +
      '<dt>Condition</dt><dd>' + esc(d.condition || '—') + '</dd><dt>Recorded in</dt><dd>' + (d.recordedIn === 'stores' ? 'General Stores' : 'Procurement') + '</dd>' +
      (d.stockedAt ? '<dt>Put away</dt><dd>' + util.dateTime(d.stockedAt) + ' · ' + esc(d.stockedBy || '') + '</dd>' : '') + (d.notes ? '<dt>Notes</dt><dd>' + esc(d.notes) + '</dd>' : '') +
      (rtn ? '<dt>Return</dt><dd>' + esc(rtn.number) + ' · ' + ui.badge(rtn.status, rtn.status === 'Open' ? 'warning' : 'success') + '</dd>' : '') + '</dl></div></div>' +
      '<div class="card"><div class="card-h"><h3>Documents</h3><button class="btn sm" data-a="up">' + ui.icon('upload', 'sm') + 'Upload</button></div><div class="card-b"><div class="doc-list">' + (docs.length ? docs.map(x => ui.docRow(x)).join('') : '<p class="muted small">No delivery note attached.</p>') + '</div></div></div></div></div>';
    ui.bindDocs(el, () => router.refresh());
    const a = n => el.querySelector('[data-a=' + n + ']');
    if (a('put')) a('put').onclick = () => putAway(d.id);
    a('print').onclick = () => printGrn(d).catch(e => ui.toast(e.message, 'error'));
    a('up').onclick = async () => { const r = await ui.uploadDialog({ kind: 'Delivery Note / GRN', supplierId: po.supplierId, lockSupplier: !!po.supplierId, ref: d.grn, date: d.date, links: { poId: po.id, deliveryId: d.id } }); if (r) router.refresh(); };
    if (a('void')) a('void').onclick = () => voidGrn(d);
  }

  async function voidGrn(d) {
    if (!isAdmin()) return ui.toast('Only an Administrator can void a GRN.', 'warning');
    const moves = store.filter('stockMoves', m => m.grnId === d.id && m.type === 'Receipt');
    const short = moves.map(m => { const it = store.get('stockItems', m.itemId); return it && util.num(it.onHand) < util.num(m.qty) ? it.name + ' (only ' + util.int(it.onHand) + ' left of ' + util.int(m.qty) + ')' : ''; }).filter(Boolean);
    if (short.length) return ui.toast('Cannot void: some goods have already been issued — ' + short.join('; ') + '. Adjust stock with a count instead.', 'error');
    const v = await ui.form('Void ' + (d.grn || 'this GRN'), [{ name: 'reason', label: 'Reason', type: 'textarea', required: true, hint: 'The stock it added is reversed and Procurement is told. This cannot be undone.' }], { ok: 'Void GRN' });
    if (!v) return;
    const po = store.get('purchaseOrders', d.poId) || {};
    store.batch(() => {
      moves.forEach(m => domain.postStock({ itemId: m.itemId, type: 'Adjustment', qty: -util.num(m.qty), unitCost: m.unitCost, batchNo: m.batchNo, expiryDate: m.expiryDate, date: util.today(), ref: 'Void ' + d.grn, grnId: d.id, poId: d.poId, reason: 'GRN voided: ' + v.reason }, { silent: true }));
      store.upsert('deliveries', { id: d.id, voided: true, voidedAt: Date.now(), voidedBy: domain.officer().name, voidReason: v.reason }, { silent: true });
    });
    // Recompute the PO status from the deliveries that still stand.
    if (po.id && ['Issued', 'Partially Delivered', 'Delivered'].indexOf(po.status) >= 0) {
      const got = domain.lineReceived(po), lines = domain.poLines(po);
      const goods = lines.map((l, i) => ({ l, i })).filter(x => domain.classifyLine(x.l, po) !== 'Service');
      const all = goods.every(x => (got[x.i] || 0) >= (util.num(x.l.qty) || 1)), any = goods.some(x => (got[x.i] || 0) > 0);
      store.upsert('purchaseOrders', { id: po.id, status: all ? 'Delivered' : any ? 'Partially Delivered' : 'Issued' }, { silent: true });
    }
    Proc.notify({ to: ['procurement'], type: 'grn-voided', poId: po.id, title: (d.grn || 'GRN') + ' voided — PO ' + (po.poNumber || ''), body: v.reason, link: { app: 'procurement', route: '#/orders/' + po.id } });
    Proc.audit('Void GRN', (d.grn || '') + ' · PO ' + (po.poNumber || '') + ' · ' + v.reason, d.id);
    store.save(); store.emit('change', { coll: 'deliveries', id: d.id });
    ui.toast((d.grn || 'GRN') + ' voided — stock reversed, Procurement told');
    router.refresh();
  }

  /* ================================================================ PDFs */
  function factsRow(doc, kit, facts, x, y, w) {
    const cw = w / facts.length;
    facts.forEach(([k, v], i) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, kit.GREY); doc.text(k.toUpperCase(), x + i * cw, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, kit.INK); kit.fitSize(doc, kit.clean(v || '—'), cw - 8, 9.5, 7); doc.text(kit.clean(v || '—'), x + i * cw, y + 12);
    });
  }
  function signatures(doc, kit, y, labels, names) {
    const { w, h } = kit.pageSize(doc); const M = 40;
    if (y + 60 > h - 84) { doc.addPage('letter', 'portrait'); y = kit.top + 20; }
    const cw = (w - M * 2) / labels.length;
    labels.forEach((lab, i) => {
      const x = M + i * cw;
      doc.setDrawColor(150, 158, 170); doc.setLineWidth(0.6); doc.line(x, y + 30, x + cw - 24, y + 30);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, kit.GREY); doc.text(lab.toUpperCase(), x, y + 41);
      if (names[i]) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, kit.INK); doc.text(kit.clean(names[i]), x, y + 26); }
    });
  }
  function printGrn(d) {
    const kit = Proc.pdf && Proc.pdf.kit; if (!kit) return Promise.reject(new Error('The PDF engine is not loaded.'));
    const po = store.get('purchaseOrders', d.poId) || {}; const sup = store.get('suppliers', po.supplierId) || {};
    const doc = kit.newDoc(); const { w } = kit.pageSize(doc); const M = 40; let y = kit.top;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor.apply(doc, kit.BLUE); doc.text('GOODS RECEIVED NOTE', M, y + 16);
    doc.setFontSize(12); doc.setTextColor.apply(doc, kit.INK); doc.text(kit.clean(d.grn || ''), w - M, y + 16, { align: 'right' });
    if (d.voided) { doc.setFontSize(9); doc.setTextColor(180, 35, 24); doc.text('VOIDED ' + kit.clean(util.date(util.toISODate(new Date(d.voidedAt)))), w - M, y + 28, { align: 'right' }); }
    y += 40;
    factsRow(doc, kit, [['PO number', po.poNumber], ['PO date', util.date(po.date)], ['Date received', util.date(d.date)], ['Delivery note', d.deliveryRef || '—']], M, y, w - M * 2); y += 30;
    factsRow(doc, kit, [['Supplier', supplierOf(po)], ['Received by', d.receivedBy], ['Condition', d.condition], ['Vehicle / driver', d.driver || '—']], M, y, w - M * 2); y += 30;
    if (sup.address || sup.trn) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, kit.GREY); doc.text(kit.clean([sup.address, sup.trn ? 'TRN ' + sup.trn : ''].filter(Boolean).join('  ·  ')).slice(0, 140), M, y); y += 12; }
    doc.autoTable({
      startY: y + 4, margin: { left: M, right: M, top: kit.top, bottom: 84 }, theme: 'grid',
      head: [['#', 'Description', 'Type', 'Ordered', 'Received', 'Rejected', 'Batch', 'Expiry', 'Bin', 'Stock item']],
      body: (d.items || []).map(i => { const it = i.itemId ? store.get('stockItems', i.itemId) : null; return [String((typeof i.lineIndex === 'number' ? i.lineIndex : i.line || 0) + 1), kit.clean(i.description), i.type || '', util.int(i.qtyOrdered), util.int(i.qtyReceived) + ' ' + kit.clean(i.unit || ''), util.num(i.qtyRejected) ? util.int(i.qtyRejected) + (i.rejectReason ? '\n' + kit.clean(i.rejectReason) : '') : '-', kit.clean(i.batchNo || ''), i.expiryDate ? util.date(i.expiryDate) : '', kit.clean(i.location || ''), it ? kit.clean(it.code) : (i.type === 'Asset' ? 'Fixed asset' : '')]; }),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4, lineColor: [210, 216, 224], lineWidth: 0.5, textColor: kit.INK, overflow: 'linebreak' },
      headStyles: { fillColor: kit.BLUE, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 20, halign: 'center' }, 1: { cellWidth: 140 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    });
    y = doc.lastAutoTable.finalY + 14;
    if (d.notes) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, kit.INK); const t = doc.splitTextToSize(kit.clean('Notes: ' + d.notes), w - M * 2); doc.text(t, M, y + 8); y += 8 + t.length * 11; }
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor.apply(doc, kit.GREY);
    doc.text('Goods listed above were received, counted and inspected. Rejected goods are held for return to the supplier.', M, y + 12);
    signatures(doc, kit, y + 20, ['Received by (Stores)', 'Checked by', "Supplier's driver"], [d.receivedBy, '', d.driver || '']);
    kit.finish(doc, { side: false, watermark: d.voided ? 'VOID' : '' });
    doc.setProperties({ title: 'Goods Received Note ' + (d.grn || ''), creator: 'General Stores' });
    return Promise.resolve(kit.deliver(doc, 'GRN ' + kit.fileSafe(d.grn || '') + ' - PO ' + kit.fileSafe(po.poNumber || '') + '.pdf', 'open'));
  }
  function printReturn(r) {
    const kit = Proc.pdf && Proc.pdf.kit; if (!kit) return Promise.reject(new Error('The PDF engine is not loaded.'));
    const po = store.get('purchaseOrders', r.poId) || {}; const d = store.get('deliveries', r.deliveryId) || {};
    const doc = kit.newDoc(); const { w } = kit.pageSize(doc); const M = 40; let y = kit.top;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor.apply(doc, kit.BLUE); doc.text('RETURN TO SUPPLIER', M, y + 16);
    doc.setFontSize(12); doc.setTextColor.apply(doc, kit.INK); doc.text(kit.clean(r.number), w - M, y + 16, { align: 'right' }); y += 40;
    factsRow(doc, kit, [['Supplier', domain.supplierName(r.supplierId, supplierOf(po))], ['PO number', po.poNumber], ['GRN', d.grn], ['Date', util.date(r.date)]], M, y, w - M * 2); y += 32;
    doc.autoTable({ startY: y, margin: { left: M, right: M, top: kit.top, bottom: 84 }, theme: 'grid', head: [['#', 'Description', 'Qty returned', 'Reason']],
      body: (r.items || []).map((i, k) => [String(k + 1), kit.clean(i.description), util.int(i.qty) + ' ' + kit.clean(i.unit || ''), kit.clean(i.reason || '')]),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, lineColor: [210, 216, 224], lineWidth: 0.5, textColor: kit.INK }, headStyles: { fillColor: kit.BLUE, textColor: 255 }, columnStyles: { 0: { cellWidth: 24, halign: 'center' }, 2: { halign: 'right', cellWidth: 90 } } });
    signatures(doc, kit, doc.lastAutoTable.finalY + 20, ['Released by (Stores)', "Collected by (supplier)", 'Date'], [domain.officer().name, '', '']);
    kit.finish(doc, { side: false });
    return Promise.resolve(kit.deliver(doc, 'Return ' + kit.fileSafe(r.number) + '.pdf', 'open'));
  }

  /* ================================================================ PURCHASED ITEMS */
  const pstate = { history: false };
  function renderPurchases(el) {
    const rows = [];
    store.list('purchaseOrders').forEach(po => {
      if (!po.poNumber || po.status === 'Draft' || po.status === 'Cancelled') return;
      if (po.historic && !pstate.history) return;
      const lines = domain.poLines(po); const got = domain.lineReceived(po);
      lines.forEach((line, i) => {
        const type = domain.classifyLine(line, po), ordered = util.num(line.qty) || 1, received = got[i] || 0;
        const status = type === 'Service' ? 'Service' : received >= ordered ? 'Received' : received > 0 ? 'Part received' : 'On order';
        rows.push({ po, line, i, type, ordered, received, status, value: util.num(line.total) || ordered * util.num(line.unitPrice), month: util.monthKey(po.date), fy: util.fiscalYear(po.date) });
      });
    });
    const tone = { 'On order': 'warning', 'Part received': 'info', Received: 'success', Service: '' };
    const sups = Array.from(new Set(rows.map(r => supplierOf(r.po)))).sort();
    const months = Array.from(new Set(rows.map(r => r.month).filter(Boolean))).sort().reverse();
    const fys = Array.from(new Set(rows.map(r => r.fy))).sort().reverse();
    const by = s => rows.filter(r => r.status === s);
    el.innerHTML = ui.pageHead({ title: 'Purchased Items', sub: 'Every line on every purchase order Procurement has issued — what was bought, from whom, and whether it has arrived.',
      actions: '<label class="check small"><input type="checkbox" id="puHist"' + (pstate.history ? ' checked' : '') + '> Include imported history</label><button class="btn" data-a="xls">' + ui.icon('download', 'sm') + 'Export Excel</button>' }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Lines purchased', icon: 'cart', value: util.int(rows.length), meta: util.moneyShort(util.sum(rows, r => r.value)) + ' in total' }) +
      ui.kpi({ label: 'On order', icon: 'truck', tone: 'warn', value: util.int(by('On order').length + by('Part received').length), meta: util.moneyShort(util.sum(by('On order').concat(by('Part received')), r => r.value)) }) +
      ui.kpi({ label: 'Received', icon: 'check', tone: 'ok', value: util.int(by('Received').length), meta: 'Lines delivered in full' }) +
      ui.kpi({ label: 'Fixed assets bought', icon: 'tag', tone: 'pur', value: util.int(util.sum(rows.filter(r => r.type === 'Asset'), r => r.ordered)), meta: 'Units on asset lines' }) + '</div><div class="card" id="puT"></div>';
    const t = ui.table(el.querySelector('#puT'), {
      rows, pageSize: 50, placeholder: 'Search item, PO #, supplier…', initialSort: { key: 'date', dir: -1 },
      search: r => [r.line.description, r.po.poNumber, supplierOf(r.po), r.po.department].join(' '),
      filters: [{ key: 'type', label: 'All types', options: domain.ITEM_TYPES }, { key: 'status', label: 'All statuses', options: ['On order', 'Part received', 'Received', 'Service'] },
        { key: 'sup', label: 'All suppliers', options: sups, test: (r, v) => supplierOf(r.po) === v }, { key: 'month', label: 'All months', options: months.map(m => ({ value: m, label: util.monthLabel(m) })) },
        { key: 'fy', label: 'All fiscal years', options: fys.map(f => ({ value: f, label: 'FY ' + f })) }],
      columns: [
        { key: 'date', label: 'PO date', sort: r => r.po.date || '', render: r => '<span class="nowrap">' + util.date(r.po.date) + '</span>' },
        { key: 'po', label: 'PO #', sort: r => r.po.poNumber, render: r => '<a class="mono" href="' + (r.status === 'On order' || r.status === 'Part received' ? '#/inbound?po=' + r.po.id : procLink('#/orders/' + r.po.id)) + '">' + esc(r.po.poNumber) + '</a>' },
        { key: 'item', label: 'Item', sort: r => r.line.description, render: r => '<div class="t-title">' + esc(r.line.description) + '</div><div class="t-sub">' + esc(supplierOf(r.po)) + '</div>' },
        { key: 'type', label: 'Type', render: r => typeChip(r.type) },
        { key: 'qty', label: 'Received', cls: 'num', sort: r => r.received / r.ordered, render: r => r.type === 'Service' ? '<span class="muted">—</span>' : util.int(r.received) + ' of ' + util.int(r.ordered) + ' ' + esc(r.line.unit || '') },
        { key: 'status', label: 'Status', render: r => ui.badge(r.status, tone[r.status]) },
        { key: 'value', label: 'Value', cls: 'num', sort: r => r.value, render: r => util.money(r.value) }
      ],
      footer: list => '<td colspan="6">' + util.int(list.length) + ' lines</td><td class="num">' + util.money(util.sum(list, r => r.value)) + '</td>',
      empty: ui.empty('cart', 'No purchases yet', 'Lines appear here as soon as Procurement issues a purchase order.')
    });
    el.querySelector('#puHist').onchange = e => { pstate.history = e.target.checked; renderPurchases(el); };
    el.querySelector('[data-a=xls]').onclick = () => {
      if (!window.XLSX) return ui.toast('The Excel library did not load.', 'error');
      const list = t.visible();
      const ws = XLSX.utils.json_to_sheet(list.map(r => ({ 'PO date': r.po.date, 'PO #': r.po.poNumber, Supplier: supplierOf(r.po), Department: r.po.department || '', Item: r.line.description, Type: r.type, Unit: r.line.unit || '', Ordered: r.ordered, Received: r.received, Status: r.status, 'Unit price': util.num(r.line.unitPrice), Value: r.value })));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Purchased items');
      XLSX.writeFile(wb, 'Purchased items ' + util.today() + '.xlsx');
    };
  }

  /* ================================================================ REGISTRATION */
  Proc.page({
    id: 'inbound', title: 'Expected Deliveries', icon: 'truck', section: 'Workflow', order: 10, count: overdueCount, countAlert: true,
    render(el) { css(); renderInbound(el, router.parse().query); }
  });
  Proc.page({ id: 'grn', title: 'Goods Received Note', icon: 'clipboardCheck', hidden: true, render(el, params) { css(); renderGrn(el, params[0]); } });
  Proc.page({ id: 'purchases', title: 'Purchased Items', icon: 'cart', section: 'Workflow', order: 15, render(el) { css(); renderPurchases(el); } });
  Proc.quickCreate.push({ label: 'Receive a delivery', icon: 'truck', order: 5, onClick: () => router.go('inbound') });
  Proc.storesInbound = { putAway, printGrn, saveGrn };
})();
