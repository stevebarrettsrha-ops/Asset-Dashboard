/* Fixed Asset Intake (asset-intake.html) — the Fixed Asset Officer's view of the
   shared purchasing records. Only fixed-asset lines (Proc.domain.assetLines):
   furniture, machinery, tools and equipment ordered by Procurement, followed
   until General Stores receives them and the officer registers them in the
   Fixed Asset Register (index.html). */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc;
  const RESULTS_KEY = 'assetIntakeResults';
  const PREFILL_KEY = 'assetIntakePrefill';

  const CSS = '.ai-hl td{background:var(--warning-bg)!important}.ai-codes{display:flex;flex-wrap:wrap;gap:4px}.ai-codes .chip{font-family:var(--mono);font-size:11.5px}' +
    '.ai-att{list-style:none}.ai-att li{display:flex;gap:12px;align-items:flex-start;padding:12px 16px;border-bottom:1px solid var(--border)}.ai-att li:last-child{border-bottom:0}' +
    '.ai-att .ic{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;flex:none}.ai-att .ic.w{background:var(--warning-bg);color:var(--warning)}.ai-att .ic.d{background:var(--danger-bg);color:var(--danger)}.ai-att .ic.i{background:var(--info-bg);color:var(--info)}' +
    '.ai-att .t{font-weight:600}.ai-att .s{font-size:12.5px;color:var(--text-3)}.ai-unit-grid{display:grid;grid-template-columns:40px 1fr 1fr;gap:6px 10px;align-items:center}.ai-unit-grid .h{font-size:12px;font-weight:600;color:var(--text-3)}' +
    '.ai-flow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--text-3)}';
  function css() { if (!document.getElementById('css-intake')) document.head.insertAdjacentHTML('beforeend', '<style id="css-intake">' + CSS + '</style>'); }

  /* ------------------------------------------------------------ helpers */
  const today = () => util.today();
  /** Unit cost including this line's share of GCT on the PO. */
  function unitCostWithTax(po, line) {
    const u = util.num(line.unitPrice);
    const sub = util.num(po.subtotal), gct = util.num(po.gct);
    return util.round2(sub > 0 && gct > 0 ? u * (1 + gct / sub) : u);
  }
  /** Latest delivery (GRN) that brought in this line. */
  function lastDelivery(po, index) {
    const line = domain.poLines(po)[index] || {};
    const dels = store.filter('deliveries', d => d.poId === po.id && !d.voided).filter(d => {
      const items = d.items || [];
      if (!items.length) return true;
      return items.some(it => (typeof it.lineIndex === 'number' ? it.lineIndex === index : String(it.description || '').trim().toLowerCase() === String(line.description || '').trim().toLowerCase()) && util.num(it.qtyReceived !== undefined ? it.qtyReceived : it.qty) > 0);
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return dels[0] || null;
  }
  const supplierName = po => po.supplierName || domain.supplierName(po.supplierId);
  const keyOf = (po, i) => po.id + ':' + i;
  function rows() {
    return domain.assetLines().map(r => Object.assign(r, {
      key: keyOf(r.po, r.index), supplier: supplierName(r.po), unitCost: unitCostWithTax(r.po, r.line),
      value: util.round2(unitCostWithTax(r.po, r.line) * r.ordered), delivery: r.received > 0 ? lastDelivery(r.po, r.index) : null,
      overdue: r.outstanding > 0 && r.expected < today()
    }));
  }
  function lineLabel(r) { return String(r.line.description || r.po.description || 'Asset'); }

  /** Turn hand-off results written by the Fixed Asset Register (index.html) into registrations. */
  function consumeResults() {
    let list;
    try { list = JSON.parse(localStorage.getItem(RESULTS_KEY) || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list) || !list.length) return 0;
    let made = 0; const keep = [];
    list.forEach(res => {
      if (!res || !res.poId) return;
      const po = store.get('purchaseOrders', res.poId);
      if (!po) { keep.push(res); return; } // records not synced to this computer yet — try again later
      const dup = store.find('assetRegistrations', r => r.intakeKey && r.intakeKey === res.intakeKey);
      if (dup) return;
      const line = domain.poLines(po)[res.lineIndex] || {};
      const codes = (res.assetCodes || []).filter(Boolean);
      const del = lastDelivery(po, res.lineIndex);
      const reg = store.upsert('assetRegistrations', {
        poId: po.id, lineIndex: res.lineIndex, description: res.description || line.description || po.description, qty: util.num(res.qty) || codes.length || 1,
        assetCodes: codes, serials: res.serials || [], department: res.department || '', location: res.location || '',
        registeredAt: res.at ? util.toISODate(new Date(res.at)) : today(), registeredBy: res.by || domain.officer().name, unitCost: unitCostWithTax(po, line),
        supplierId: po.supplierId || '', deliveryId: del ? del.id : '', notes: res.notes || '', intakeKey: res.intakeKey, via: 'register'
      }, { silent: true });
      if (domain.afterRegister) domain.afterRegister(reg);
      Proc.audit('Register Asset', (codes.join(', ') || 'Asset') + ' — PO ' + po.poNumber + ' · ' + (line.description || ''), po.id);
      made++;
    });
    try { if (keep.length) localStorage.setItem(RESULTS_KEY, JSON.stringify(keep)); else localStorage.removeItem(RESULTS_KEY); } catch (e) { /* ignore */ }
    if (made) { store.save(); store.emit('change', { coll: 'assetRegistrations' }); ui.toast(made + ' ' + util.plural(made, 'registration') + ' saved from the Fixed Asset Register'); }
    return made;
  }

  function exportXlsx(name, data) {
    if (!window.XLSX) return ui.toast('The Excel library did not load.', 'error');
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); XLSX.writeFile(wb, name + ' ' + today() + '.xlsx');
  }
  const poLink = r => '<a href="' + Proc.APP_URLS.procurement + '#/orders/' + esc(r.po.id) + '" title="Open in Procurement">PO ' + esc(r.po.poNumber) + '</a>';

  /* --------------------------------------------------------- dashboard */
  function renderDashboard(el) {
    css(); consumeResults();
    const all = rows();
    const onOrder = all.filter(r => r.outstanding > 0);
    const toReg = all.filter(r => r.toRegister > 0).sort((a, b) => ((a.delivery && a.delivery.date) || '').localeCompare((b.delivery && b.delivery.date) || ''));
    const overdue = onOrder.filter(r => r.overdue);
    const fy = util.fiscalYear(today());
    const regsFy = store.list('assetRegistrations').filter(r => util.fiscalYear(r.registeredAt) === fy);
    const off = domain.officer();
    const first = String(off.name || '').replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, '').split(' ')[0];
    const hr = new Date().getHours();
    const att = toReg.slice(0, 6).map(r => ({ ic: 'w', icon: 'tag', t: r.toRegister + ' × ' + lineLabel(r) + ' to register', s: 'Received ' + (r.delivery ? util.date(r.delivery.date) + (r.delivery.grn ? ' · ' + r.delivery.grn : '') : '') + ' · ' + r.supplier + ' · PO ' + r.po.poNumber, href: '#/register?po=' + r.po.id }))
      .concat(overdue.slice(0, 4).map(r => ({ ic: 'd', icon: 'clock', t: 'Overdue: ' + lineLabel(r), s: 'Expected ' + util.date(r.expected) + ' (' + util.daysBetween(r.expected, today()) + ' days late) · ' + r.supplier + ' · PO ' + r.po.poNumber, href: '#/onorder?po=' + r.po.id })));
    const recent = store.list('deliveries').filter(d => all.some(r => r.po.id === d.poId && r.received > 0)).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
    const notes = Proc.notifications.mine().slice(0, 6);
    el.innerHTML = ui.pageHead({ title: 'Good ' + (hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening') + (first ? ', ' + first : ''), sub: 'FY ' + fy + ' · Fixed assets bought through Procurement, from order to the asset register.',
      actions: '<a class="btn" href="index.html">' + ui.icon('external', 'sm') + 'Fixed Asset Register</a><a class="btn primary" href="#/register">' + ui.icon('tag', 'sm') + 'Register delivered assets</a>' }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'On order', icon: 'cart', value: util.int(util.sum(onOrder, r => r.outstanding)), meta: util.moneyShort(util.sum(onOrder, r => r.outstanding * r.unitCost)) + ' · ' + new Set(onOrder.map(r => r.po.id)).size + ' POs', href: '#/onorder' }) +
      ui.kpi({ label: 'Delivered — to register', icon: 'tag', tone: toReg.length ? 'warn' : 'ok', value: util.int(util.sum(toReg, r => r.toRegister)), meta: toReg.length ? 'Received by Stores, not yet in the register' : 'Everything delivered is registered', href: '#/register' }) +
      ui.kpi({ label: 'Registered FY ' + fy, icon: 'check', tone: 'ok', value: util.int(util.sum(regsFy, r => r.qty)), meta: util.moneyShort(util.sum(regsFy, r => util.num(r.unitCost) * util.num(r.qty))) + ' added to the register', href: '#/registered' }) +
      ui.kpi({ label: 'Overdue deliveries', icon: 'clock', tone: overdue.length ? 'bad' : 'ok', value: util.int(overdue.length), meta: overdue.length ? 'Past the expected date' : 'None overdue', href: '#/onorder?overdue=1' }) + '</div>' +
      '<div class="grid c2"><div class="card"><div class="card-h"><h3>Needs your attention</h3><span class="chip">' + att.length + '</span></div>' +
      (att.length ? '<ul class="ai-att">' + att.map(a => '<li><span class="ic ' + a.ic + '">' + ui.icon(a.icon, 'sm') + '</span><div style="flex:1;min-width:0"><a class="t" href="' + a.href + '">' + esc(a.t) + '</a><div class="s">' + esc(a.s) + '</div></div></li>').join('') + '</ul>'
        : ui.empty('check', 'All caught up', 'No delivered assets are waiting and no deliveries are overdue.')) + '</div>' +
      '<div class="card"><div class="card-h"><h3>Notifications</h3><span class="sub">From Procurement and General Stores</span></div>' +
      (notes.length ? '<ul class="ai-att">' + notes.map(n => '<li><span class="ic i">' + ui.icon('bell', 'sm') + '</span><div style="flex:1;min-width:0"><a class="t" href="' + esc(Proc.notifications.href(n) || '#/dashboard') + '">' + esc(n.title) + '</a><div class="s">' + esc(n.body || '') + ' · ' + util.ago(n.at) + '</div></div></li>').join('') + '</ul>'
        : ui.empty('bell', 'No notifications yet', 'You are told here when Procurement orders an asset and when Stores receives one.')) + '</div></div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>Recent asset deliveries</h3><div class="sub">Goods received notes from General Stores that include fixed assets</div></div></div>' +
      (recent.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>GRN</th><th>PO</th><th>Supplier</th><th>Received by</th></tr></thead><tbody>' +
        recent.map(d => { const po = store.get('purchaseOrders', d.poId) || {}; return '<tr><td class="nowrap">' + util.date(d.date) + '</td><td class="mono">' + esc(d.grn || '—') + '</td><td><a href="' + Proc.APP_URLS.procurement + '#/orders/' + esc(po.id) + '">PO ' + esc(po.poNumber || '') + '</a></td><td>' + esc(supplierName(po)) + '</td><td>' + esc(d.receivedBy || '') + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : ui.empty('truck', 'No asset deliveries yet')) + '</div>' +
      '<div class="alert mt-3">' + ui.icon('info') + '<div><div class="t">How assets reach you</div><div class="ai-flow">Procurement issues the PO ' + ui.icon('arrow-right', 'sm') + ' General Stores receives the goods (GRN) ' + ui.icon('arrow-right', 'sm') + ' you tag and register each asset here ' + ui.icon('arrow-right', 'sm') + ' it appears in the Fixed Asset Register.</div></div></div>';
  }

  /* ------------------------------------------------------------ on order */
  function renderOnOrder(el) {
    css(); consumeResults();
    const q = router.parse().query;
    const list = rows().filter(r => r.outstanding > 0).sort((a, b) => (a.expected || '').localeCompare(b.expected || ''));
    const sups = Array.from(new Set(list.map(r => r.supplier))).sort();
    el.innerHTML = ui.pageHead({ title: 'Assets on Order', sub: 'Fixed-asset lines on issued purchase orders that General Stores has not fully received yet.',
      actions: '<button class="btn" data-x>' + ui.icon('download', 'sm') + 'Excel</button>' }) +
      (q.po ? '<div class="alert mb-2">' + ui.icon('info') + '<div>Showing PO <b>' + esc((store.get('purchaseOrders', q.po) || {}).poNumber || '') + '</b> highlighted. <a href="#/onorder">Clear</a></div></div>' : '') +
      '<div class="card"><div id="aiT"></div></div>' +
      '<p class="small muted mt-2">Lines are classed as assets automatically (furniture, machinery, tools, equipment, or a unit price of ' + util.money(util.num((store.settings().stores || {}).assetThreshold || 50000), { noCents: true }) + ' or more). If a line is not really a fixed asset, use “Not an asset” and it moves to General Stores’ stock.</p>';
    const t = ui.table(el.querySelector('#aiT'), {
      rows: list, placeholder: 'Search item, PO, supplier…', initialSort: { key: 'expected', dir: 1 },
      search: r => [lineLabel(r), r.po.poNumber, r.supplier, r.po.department].join(' '),
      filters: [{ key: 'supplier', label: 'All suppliers', options: sups, test: (r, v) => r.supplier === v }, { key: 'overdue', label: 'All deliveries', options: [{ value: '1', label: 'Overdue only' }], value: q.overdue ? '1' : '', test: r => r.overdue }],
      rowCls: r => (q.po && r.po.id === q.po ? 'ai-hl' : ''),
      columns: [
        { key: 'po', label: 'PO', render: r => poLink(r) + '<div class="t-sub">' + util.date(r.po.date) + '</div>', sort: r => r.po.poNumber },
        { key: 'item', label: 'Asset', render: r => '<div class="t-title">' + esc(lineLabel(r)) + '</div><div class="t-sub">' + esc(r.po.department || '') + '</div>', sort: r => lineLabel(r) },
        { key: 'supplier', label: 'Supplier' },
        { key: 'qty', label: 'Received / ordered', cls: 'num', render: r => r.received + ' / ' + r.ordered + ' ' + esc(r.line.unit || ''), sort: r => r.outstanding },
        { key: 'expected', label: 'Expected', render: r => '<span class="nowrap">' + util.date(r.expected) + '</span>' + (r.overdue ? '<div>' + ui.badge(util.daysBetween(r.expected, today()) + ' days late', 'danger') + '</div>' : r.received ? '<div>' + ui.badge('Part delivered', 'warning') + '</div>' : '') },
        { key: 'value', label: 'Value', cls: 'num', render: r => util.money(r.outstanding * r.unitCost), sort: r => r.outstanding * r.unitCost },
        { key: 'act', label: '', sort: false, cls: 'actions', render: r => '<button class="btn xs ghost" data-notasset="' + esc(r.key) + '">Not an asset</button>' }
      ],
      footer: l => '<td colspan="5">' + l.length + ' ' + util.plural(l.length, 'line') + '</td><td class="num">' + util.money(util.sum(l, r => r.outstanding * r.unitCost)) + '</td><td></td>',
      empty: ui.empty('cart', 'No assets on order', 'When Procurement issues a purchase order containing furniture, machinery, tools or equipment, it appears here.'),
      bind: tb => tb.querySelectorAll('[data-notasset]').forEach(b => b.onclick = () => notAsset(b.dataset.notasset))
    });
    el.querySelector('[data-x]').onclick = () => exportXlsx('Assets on order', t.visible().map(r => ({ 'PO': r.po.poNumber, 'PO date': r.po.date, 'Supplier': r.supplier, 'Asset': lineLabel(r), 'Unit': r.line.unit || '', 'Ordered': r.ordered, 'Received': r.received, 'Outstanding': r.outstanding, 'Unit cost (incl. GCT)': r.unitCost, 'Outstanding value': util.round2(r.outstanding * r.unitCost), 'Expected': r.expected, 'Overdue': r.overdue ? 'Yes' : '' })));
  }
  async function notAsset(key) {
    const [poId, idx] = key.split(':'); const i = +idx;
    const po = store.get('purchaseOrders', poId); if (!po) return;
    const lines = domain.poLines(po).map(l => Object.assign({}, l));
    if (!await ui.confirm('Treat <b>' + esc(lines[i].description || 'this line') + '</b> on PO ' + esc(po.poNumber) + ' as stock instead of a fixed asset?<br><br>It moves to General Stores’ stock and will no longer appear here.', { ok: 'Not an asset' })) return;
    lines[i].itemType = 'Stock';
    store.upsert('purchaseOrders', { id: po.id, items: lines });
    Proc.audit('Reclassify Line', 'PO ' + po.poNumber + ' line ' + (i + 1) + ' (' + (lines[i].description || '') + ') marked Stock — not a fixed asset', po.id);
    ui.toast('Moved to General Stores as stock'); router.refresh();
  }

  /* ------------------------------------------------------------ register */
  function renderRegister(el) {
    css(); consumeResults();
    const q = router.parse().query;
    const list = rows().filter(r => r.toRegister > 0);
    const pending = (() => { try { return JSON.parse(sessionStorage.getItem(PREFILL_KEY) || 'null'); } catch (e) { return null; } })();
    el.innerHTML = ui.pageHead({ title: 'To Register', sub: 'Assets General Stores has received that are not yet in the Fixed Asset Register. Tag each one and register it.',
      actions: '<button class="btn" data-x>' + ui.icon('download', 'sm') + 'Excel</button><a class="btn" href="index.html">' + ui.icon('external', 'sm') + 'Fixed Asset Register</a>' }) +
      (pending ? '<div class="alert warning mb-2">' + ui.icon('alert') + '<div><div class="t">Waiting for the Fixed Asset Register</div>' + esc(pending.qty + ' × ' + pending.description) + ' (PO ' + esc(pending.poNumber || '') + ') was sent to the register. When you save it there, it is marked registered here automatically. <a href="index.html">Continue in the register</a> · <a href="javascript:void 0" data-cancelpf>Cancel</a></div></div>' : '') +
      '<div class="card"><div id="aiR"></div></div>';
    const t = ui.table(el.querySelector('#aiR'), {
      rows: list, placeholder: 'Search item, PO, supplier, GRN…', initialSort: { key: 'received', dir: 1 },
      search: r => [lineLabel(r), r.po.poNumber, r.supplier, r.delivery && r.delivery.grn].join(' '),
      rowCls: r => (q.po && r.po.id === q.po ? 'ai-hl' : ''),
      columns: [
        { key: 'item', label: 'Asset', render: r => '<div class="t-title">' + esc(lineLabel(r)) + '</div><div class="t-sub">' + poLink(r) + ' · ' + esc(r.supplier) + '</div>', sort: r => lineLabel(r) },
        { key: 'received', label: 'Received', render: r => r.delivery ? '<span class="nowrap">' + util.date(r.delivery.date) + '</span><div class="t-sub">' + esc(r.delivery.grn || '') + (r.delivery.receivedBy ? ' · ' + esc(r.delivery.receivedBy) : '') + '</div>' : '—', sort: r => (r.delivery && r.delivery.date) || '' },
        { key: 'toRegister', label: 'To register', cls: 'num', render: r => '<b>' + r.toRegister + '</b> of ' + r.received + ' ' + esc(r.line.unit || ''), sort: r => r.toRegister },
        { key: 'unitCost', label: 'Unit cost', cls: 'num', render: r => util.money(r.unitCost) },
        { key: 'act', label: '', sort: false, cls: 'actions', render: r => '<button class="btn sm primary" data-reg="' + esc(r.key) + '">' + ui.icon('tag', 'sm') + 'Register</button>' }
      ],
      empty: ui.empty('check', 'Nothing waiting to be registered', 'Assets appear here once General Stores records their delivery.'),
      bind: tb => tb.querySelectorAll('[data-reg]').forEach(b => b.onclick = () => registerDialog(list.find(r => r.key === b.dataset.reg)))
    });
    const c = el.querySelector('[data-cancelpf]'); if (c) c.onclick = () => { sessionStorage.removeItem(PREFILL_KEY); router.refresh(); };
    el.querySelector('[data-x]').onclick = () => exportXlsx('Assets to register', t.visible().map(r => ({ 'Asset': lineLabel(r), 'PO': r.po.poNumber, 'Supplier': r.supplier, 'GRN': r.delivery ? r.delivery.grn : '', 'Received': r.delivery ? r.delivery.date : '', 'Received qty': r.received, 'Registered': r.registered, 'To register': r.toRegister, 'Unit cost (incl. GCT)': r.unitCost })));
    if (q.po && list.length === 1 && list[0].po.id === q.po && !pending) registerDialog(list[0]);
  }

  function registerDialog(r) {
    if (!r) return;
    const max = r.toRegister;
    const unitGrid = n => '<div class="ai-unit-grid"><span class="h">#</span><span class="h">Serial number</span><span class="h">Asset code (if known)</span>' +
      Array.from({ length: n }, (_, i) => '<span class="small muted">' + (i + 1) + '</span><input class="input sm" data-serial="' + i + '" placeholder="Serial / model"><input class="input sm mono" data-code="' + i + '" placeholder="e.g. MPH-MS-190-01-2026">').join('') + '</div>';
    const body = '<div class="alert mb-2">' + ui.icon('info') + '<div><b>' + esc(lineLabel(r)) + '</b><div class="small">PO ' + esc(r.po.poNumber) + ' · ' + esc(r.supplier) + (r.delivery ? ' · received ' + util.date(r.delivery.date) + ' (' + esc(r.delivery.grn || 'GRN') + ')' : '') + ' · ' + util.money(r.unitCost) + ' each incl. GCT</div></div></div>' +
      '<div class="form-grid"><div class="field s4"><label>Quantity to register</label><input type="number" name="qty" min="1" max="' + max + '" value="' + max + '"><div class="hint">' + max + ' waiting</div></div>' +
      '<div class="field s8"><label>Department / location</label><select name="department" data-dept><option value="">Select department</option></select></div>' +
      '<div class="full" data-units>' + unitGrid(Math.min(max, 25)) + '</div>' +
      '<div class="field s12"><label>Notes</label><input name="notes" placeholder="e.g. tagged and placed in Female Medical Ward"></div></div>' +
      '<p class="small muted mt-2"><b>Open in Fixed Asset Register</b> fills in a new asset there (description, supplier, cost, date in, serial) for you to check, give its code and save — it is then marked registered here. <b>Record as registered</b> is for assets you have already added to the register: type their asset codes above.</p>';
    ui.modal({
      title: 'Register delivered assets', size: 'lg', body,
      onOpen: (m) => {
        const sel = m.querySelector('[data-dept]');
        if (typeof window.mphPopulateDeptSelect === 'function') { try { window.mphPopulateDeptSelect(sel, { firstOption: { value: '', label: 'Select department' } }); } catch (e) { /* ignore */ } }
        if (r.po.department) { if (!Array.from(sel.options).some(o => o.value === r.po.department)) sel.insertAdjacentHTML('beforeend', '<option>' + esc(r.po.department) + '</option>'); sel.value = r.po.department; }
        const qty = m.querySelector('[name=qty]');
        qty.addEventListener('input', () => { const n = Math.max(1, Math.min(max, Math.floor(util.num(qty.value)) || 1)); m.querySelector('[data-units]').innerHTML = unitGrid(Math.min(n, 25)); });
      },
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Record as registered', kind: '', icon: 'check', onClick: (close, m) => save(m, 'manual') },
        { label: 'Open in Fixed Asset Register', kind: 'primary', icon: 'external', onClick: (close, m) => save(m, 'register') }
      ]
    });
    function collect(m) {
      const qty = Math.floor(util.num(m.querySelector('[name=qty]').value));
      const serials = Array.from(m.querySelectorAll('[data-serial]')).map(i => i.value.trim());
      const codes = Array.from(m.querySelectorAll('[data-code]')).map(i => i.value.trim());
      return { qty, serials: serials.slice(0, qty), codes: codes.slice(0, qty), department: m.querySelector('[name=department]').value, notes: m.querySelector('[name=notes]').value.trim() };
    }
    function save(m, via) {
      const v = collect(m);
      if (!(v.qty >= 1 && v.qty <= max)) { ui.toast('Register between 1 and ' + max + '.', 'warning'); return false; }
      if (via === 'manual') {
        const codes = v.codes.filter(Boolean);
        if (codes.length < v.qty) { ui.toast('Type the asset code for each of the ' + v.qty + ' ' + util.plural(v.qty, 'asset') + ' (or use “Open in Fixed Asset Register”).', 'warning'); return false; }
        const clash = codes.find((c, i) => codes.indexOf(c) !== i) || codes.find(c => store.find('assetRegistrations', x => (x.assetCodes || []).some(y => y.toLowerCase() === c.toLowerCase())));
        if (clash) { ui.toast('Asset code ' + clash + ' is already used.', 'warning'); return false; }
        const reg = store.upsert('assetRegistrations', { poId: r.po.id, lineIndex: r.index, description: lineLabel(r), qty: v.qty, assetCodes: codes, serials: v.serials.filter(Boolean), department: v.department, location: v.department,
          registeredAt: today(), registeredBy: domain.officer().name, unitCost: r.unitCost, supplierId: r.po.supplierId || '', deliveryId: r.delivery ? r.delivery.id : '', notes: v.notes, intakeKey: util.uid('AIK'), via: 'manual' });
        if (domain.afterRegister) domain.afterRegister(reg);
        Proc.audit('Register Asset', codes.join(', ') + ' — PO ' + r.po.poNumber + ' · ' + lineLabel(r), r.po.id);
        ui.toast(v.qty + ' ' + util.plural(v.qty, 'asset') + ' recorded as registered'); router.refresh();
        return true;
      }
      const prefill = { intakeKey: util.uid('AIK'), poId: r.po.id, lineIndex: r.index, description: lineLabel(r), supplier: r.supplier, unitPrice: r.unitCost, qty: v.qty,
        dateIn: r.delivery ? r.delivery.date : today(), department: v.department, serials: v.serials.filter(Boolean), codes: v.codes.filter(Boolean), poNumber: r.po.poNumber,
        grn: r.delivery ? r.delivery.grn : '', notes: v.notes, by: domain.officer().name, returnTo: location.href.split('#')[0] + '#/registered' };
      sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
      Proc.audit('Send to Asset Register', v.qty + ' × ' + lineLabel(r) + ' — PO ' + r.po.poNumber, r.po.id);
      store.flush();
      location.href = 'index.html';
      return true;
    }
  }

  /* ---------------------------------------------------------- registered */
  function renderRegistered(el) {
    css(); consumeResults();
    const list = store.list('assetRegistrations').map(g => { const po = store.get('purchaseOrders', g.poId) || {}; return Object.assign({}, g, { _po: po, _sup: supplierName(po) }); });
    el.innerHTML = ui.pageHead({ title: 'Registered Assets', sub: 'Assets bought through Procurement and recorded in the Fixed Asset Register.', actions: '<button class="btn" data-x>' + ui.icon('download', 'sm') + 'Excel</button>' }) + '<div class="card"><div id="aiG"></div></div>';
    const t = ui.table(el.querySelector('#aiG'), {
      rows: list, placeholder: 'Search asset code, item, PO, supplier…', initialSort: { key: 'registeredAt', dir: -1 },
      search: g => [g.description, (g.assetCodes || []).join(' '), (g.serials || []).join(' '), g._po.poNumber, g._sup, g.department].join(' '),
      filters: [{ key: 'fy', label: 'All years', options: Array.from(new Set(list.map(g => util.fiscalYear(g.registeredAt)))).sort().reverse().map(f => ({ value: f, label: 'FY ' + f })), test: (g, v) => util.fiscalYear(g.registeredAt) === v }],
      columns: [
        { key: 'registeredAt', label: 'Registered', render: g => '<span class="nowrap">' + util.date(g.registeredAt) + '</span><div class="t-sub">' + esc(g.registeredBy || '') + '</div>' },
        { key: 'description', label: 'Asset', render: g => '<div class="t-title">' + esc(g.description) + '</div><div class="t-sub">' + esc(g.department || '') + (g.via === 'register' ? ' · via the register' : '') + '</div>' },
        { key: 'codes', label: 'Asset codes', render: g => (g.assetCodes || []).length ? '<div class="ai-codes">' + g.assetCodes.map(c => '<span class="chip">' + esc(c) + '</span>').join('') + '</div>' : '<span class="muted">—</span>', sort: g => (g.assetCodes || [])[0] || '' },
        { key: 'qty', label: 'Qty', cls: 'num' },
        { key: 'po', label: 'PO / supplier', render: g => (g._po.id ? '<a href="' + Proc.APP_URLS.procurement + '#/orders/' + esc(g._po.id) + '">PO ' + esc(g._po.poNumber) + '</a>' : '—') + '<div class="t-sub">' + esc(g._sup) + '</div>', sort: g => g._po.poNumber || '' },
        { key: 'value', label: 'Value', cls: 'num', render: g => util.money(util.num(g.unitCost) * util.num(g.qty)), sort: g => util.num(g.unitCost) * util.num(g.qty) },
        { key: 'act', label: '', sort: false, cls: 'actions', render: g => ((g.assetCodes || []).length < util.num(g.qty) ? '<button class="btn xs" data-codes="' + esc(g.id) + '">Add codes</button> ' : '') + '<button class="btn xs ghost danger" data-undo="' + esc(g.id) + '">Undo</button>' }
      ],
      footer: l => '<td colspan="3">' + l.length + ' ' + util.plural(l.length, 'registration') + '</td><td class="num">' + util.int(util.sum(l, g => g.qty)) + '</td><td></td><td class="num">' + util.money(util.sum(l, g => util.num(g.unitCost) * util.num(g.qty))) + '</td><td></td>',
      empty: ui.empty('tag', 'No assets registered yet', 'Register delivered assets from the “To Register” page.', '<a class="btn primary" href="#/register">To Register</a>'),
      bind: tb => { tb.querySelectorAll('[data-codes]').forEach(b => b.onclick = () => addCodes(b.dataset.codes)); tb.querySelectorAll('[data-undo]').forEach(b => b.onclick = async () => {
        const g = store.get('assetRegistrations', b.dataset.undo); if (!g) return;
        if (!await ui.confirm('Undo the registration of <b>' + esc(g.qty + ' × ' + g.description) + '</b>' + ((g.assetCodes || []).length ? ' (' + esc(g.assetCodes.join(', ')) + ')' : '') + '?<br><br>It goes back to “To Register”. Assets already saved in the Fixed Asset Register are not removed from it.', { danger: true, ok: 'Undo registration' })) return;
        store.remove('assetRegistrations', g.id); Proc.audit('Undo Asset Registration', g.description + ' — ' + (g.assetCodes || []).join(', '), g.poId); ui.toast('Registration undone'); router.refresh();
      }); }
    });
    el.querySelector('[data-x]').onclick = () => exportXlsx('Registered assets', t.visible().map(g => ({ 'Registered': g.registeredAt, 'By': g.registeredBy, 'Asset': g.description, 'Asset codes': (g.assetCodes || []).join(', '), 'Serials': (g.serials || []).join(', '), 'Qty': g.qty, 'Department': g.department, 'PO': g._po.poNumber, 'Supplier': g._sup, 'Unit cost': g.unitCost, 'Value': util.round2(util.num(g.unitCost) * util.num(g.qty)) })));
  }

  /** Asset codes typed in after the registration (e.g. tags printed later). */
  async function addCodes(id) {
    const g = store.get('assetRegistrations', id); if (!g) return;
    const have = (g.assetCodes || []).slice();
    const fields = Array.from({ length: Math.max(0, util.num(g.qty) - have.length) }, (_, i) => ({ name: 'c' + i, label: 'Asset code ' + (have.length + i + 1), span: 's6', placeholder: 'e.g. MPH-MS-190-01-2026' }));
    if (!fields.length) return;
    const v = await ui.form('Add asset codes — ' + g.description, fields, { ok: 'Save codes' });
    if (!v) return;
    const codes = have.concat(Object.keys(v).sort((a, b) => +a.slice(1) - +b.slice(1)).map(k => v[k].trim()).filter(Boolean));
    if (codes.length === have.length) return ui.toast('No codes entered.', 'warning');
    const rec = store.upsert('assetRegistrations', { id: g.id, assetCodes: codes });
    if (domain.afterRegister) domain.afterRegister(Object.assign({}, rec, { qty: codes.length - have.length, assetCodes: codes.slice(have.length) }));
    Proc.audit('Add Asset Codes', g.description + ' — ' + codes.slice(have.length).join(', '), g.poId);
    ui.toast('Asset codes saved'); router.refresh();
  }

  /* ------------------------------------------------------------- admin */
  function renderSettings(el) {
    css();
    const u = Proc.auth.user; const off = domain.officer();
    const S = store.settings().stores || {};
    const syncLabel = { off: 'Not connected on this computer', on: 'Connected', busy: 'Syncing…', err: 'Problem — retrying' }[Proc.sync.state];
    el.innerHTML = ui.pageHead({ title: 'Settings', sub: 'Your details and how this computer shares records with Procurement and General Stores.' }) +
      '<div class="grid c2"><div class="card"><div class="card-h"><h3>My profile</h3></div><div class="card-b"><div class="form-grid">' +
      '<div class="field s12"><label>Name as printed</label><input name="name" value="' + esc(off.name) + '"></div><div class="field s6"><label>Job title</label><input name="title" value="' + esc(off.title || 'Fixed Asset Officer') + '"></div>' +
      '<div class="field s6"><label>Phone / extension</label><input name="phone" value="' + esc(off.phone) + '"></div></div></div><div class="card-f"><button class="btn primary" data-save>' + ui.icon('check', 'sm') + 'Save</button></div></div>' +
      '<div class="card"><div class="card-h"><h3>Shared records</h3></div><div class="card-b"><dl class="kv tight"><dt>Google Drive</dt><dd>' + esc(syncLabel) + '</dd><dt>Last sync</dt><dd>' + (Proc.sync.lastSync ? util.ago(Proc.sync.lastSync) : '—') + '</dd>' +
      '<dt>Asset rule</dt><dd>Furniture, machinery, tools and equipment, or a unit price of ' + util.money(util.num(S.assetThreshold || 50000), { noCents: true }) + ' or more (set in General Stores settings)</dd></dl>' +
      (Proc.sync.state === 'off' ? '<div class="alert mt-2">' + ui.icon('info') + '<div>Sign in through the hospital portal (Sync Now) so this computer shares records with Procurement and Stores.</div></div>' : '') +
      '</div><div class="card-f"><button class="btn" data-sync' + (Proc.sync.state === 'off' ? ' disabled' : '') + '>' + ui.icon('refresh', 'sm') + 'Sync now</button></div></div></div>';
    el.querySelector('[data-save]').onclick = () => {
      const v = ui.formData(el); if (!v.name) return ui.toast('Enter your name.', 'warning');
      const officers = Object.assign({}, store.settings().officers); officers[u.username] = Object.assign({}, officers[u.username], { name: v.name, title: v.title || 'Fixed Asset Officer', phone: v.phone });
      store.saveSettings({ officers }); Proc.shell.renderTop(); ui.toast('Profile saved');
    };
    const sb = el.querySelector('[data-sync]'); if (sb) sb.onclick = async () => { await Proc.sync.run(); router.refresh(); };
  }
  function renderAudit(el) {
    const words = /asset|register|reclassif|login|logout|sign/i;
    const rows = store.db.auditLog.filter(r => words.test(r.action + ' ' + r.details));
    el.innerHTML = ui.pageHead({ title: 'Audit Log', sub: 'Registrations, reclassifications and sign-ins, newest first.' }) + '<div class="card"><div id="aiA"></div></div>';
    ui.table(el.querySelector('#aiA'), {
      rows, pageSize: 50, placeholder: 'Search details…', search: r => [r.action, r.details, r.user].join(' '), initialSort: { key: 'timestamp', dir: -1 },
      filters: [{ key: 'action', label: 'All actions', options: Array.from(new Set(rows.map(r => r.action))).sort() }],
      columns: [{ key: 'timestamp', label: 'When', render: r => '<span class="nowrap">' + esc(util.dateTime(r.timestamp)) + '</span>' }, { key: 'user', label: 'User' }, { key: 'action', label: 'Action', render: r => '<span class="chip">' + esc(r.action) + '</span>' }, { key: 'details', label: 'Details' }],
      empty: ui.empty('history', 'No activity yet')
    });
  }

  /* -------------------------------------------------------------- pages */
  if (Proc.APP.id !== 'intake') return; // this module only runs in asset-intake.html
  Proc.page({ id: 'dashboard', title: 'Dashboard', icon: 'dashboard', section: 'Overview', order: 10, render: renderDashboard });
  Proc.page({ id: 'onorder', title: 'Assets on Order', icon: 'cart', section: 'Workflow', order: 10, render: renderOnOrder,
    count: () => { try { return rows().filter(r => r.overdue).length; } catch (e) { return 0; } }, countAlert: true });
  Proc.page({ id: 'register', title: 'To Register', icon: 'tag', section: 'Workflow', order: 20, render: renderRegister,
    count: () => { try { return util.sum(rows(), r => r.toRegister); } catch (e) { return 0; } } });
  Proc.page({ id: 'registered', title: 'Registered Assets', icon: 'check', section: 'Records', order: 10, render: renderRegistered });
  Proc.page({ id: 'settings', title: 'Settings', icon: 'settings', section: 'Administration', order: 10, render: renderSettings });
  Proc.page({ id: 'audit', title: 'Audit Log', icon: 'history', section: 'Administration', order: 20, render: renderAudit });
  Proc.quickCreate.push({ label: 'Register delivered assets', icon: 'tag', order: 10, onClick: () => router.go('register') });
  Proc.quickCreate.push({ label: 'Open the Fixed Asset Register', icon: 'external', order: 20, onClick: () => { location.href = 'index.html'; } });
  // Results saved in the register on this computer become registrations as soon as the records are loaded.
  store.on('change', e => { if (e && e.coll === '*' && e.action === 'load') setTimeout(consumeResults, 0); });
  Proc.intake = { rows, consumeResults, unitCostWithTax };
})();
