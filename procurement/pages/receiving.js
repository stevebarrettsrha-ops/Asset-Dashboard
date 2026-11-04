/* ==========================================================================
   Receiving — goods received against purchase orders (GRN), partial or final.
   Route: #/receiving  (#/receiving?po=<poId> opens the delivery form)
   Notifies General Stores (put-away queue) and Fixed Assets through shared notifications.
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, K, files, router } = Proc;
  const esc = util.esc;

  if (!document.getElementById('css-receiving')) document.head.insertAdjacentHTML('beforeend', '<style id="css-receiving">' +
    '.rc-lines input.input{width:110px;text-align:right}.rc-lines td{vertical-align:middle}' +
    '.rc-po{display:flex;gap:16px;flex-wrap:wrap;padding:12px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:14px;font-size:13px}' +
    '.rc-po b{display:block;font-size:12px;color:var(--text-3);font-weight:600}' +
    '.rc-late{color:var(--danger);font-weight:600}' +
    '</style>');

  const AWAITING = ['Issued', 'Partially Delivered'];
  const poLabel = p => (p.poNumber ? 'PO ' + p.poNumber : 'Draft PO');

  /** Quantity already received per PO line index. */
  function receivedSoFar(po) {
    const rec = (po.items || []).map(() => 0);
    store.filter('deliveries', d => d.poId === po.id).forEach(d => (d.items || []).forEach((it, i) => {
      const idx = it.line !== undefined ? it.line : i;
      if (rec[idx] !== undefined) rec[idx] += util.num(it.qtyReceived);
    }));
    return rec;
  }

  function recordDelivery(poId, onDone) {
    const po = store.get('purchaseOrders', poId);
    if (!po) { ui.toast('Purchase order not found', 'error'); return; }
    const items = po.items && po.items.length ? po.items : [{ description: po.description || 'Goods / services as per PO', unit: '', qty: 1, unitPrice: po.subtotal || po.total, total: po.subtotal || po.total }];
    const prior = receivedSoFar(Object.assign({}, po, { items }));
    const prevDels = store.filter('deliveries', d => d.poId === po.id);
    let picked = [];
    const body = '<div class="rc-po"><div><b>Purchase order</b>' + esc(poLabel(po)) + '</div><div><b>Supplier</b>' + esc(po.supplierName || domain.supplierName(po.supplierId)) + '</div><div><b>PO date</b>' + util.date(po.date) + '</div><div><b>Value</b>' + util.money(po.total) + '</div>' +
      (prevDels.length ? '<div><b>Previous deliveries</b>' + prevDels.length + '</div>' : '') + '</div>' +
      '<div class="form-grid">' +
      '<div class="field s3"><label>Date received<span class="req">*</span></label><input type="date" name="date" value="' + util.today() + '"></div>' +
      '<div class="field s3"><label>GRN / receiving report no.<span class="req">*</span></label><input name="grn" placeholder="e.g. GRN-2026-0412"></div>' +
      '<div class="field s3"><label>Received by<span class="req">*</span></label><input name="receivedBy" value="' + esc(domain.officer().name) + '"></div>' +
      '<div class="field s3"><label>Condition</label><select name="condition">' + ui.options(['Good', 'Damaged — partial', 'Damaged — rejected', 'Wrong items', 'Short-shipped'], 'Good') + '</select></div>' +
      '<div class="field s12"><label>Quantities received</label><div class="table-wrap" style="border:1px solid var(--border);border-radius:var(--radius)"><table class="table compact rc-lines"><thead><tr><th>Item</th><th class="num">Ordered</th><th class="num">Received before</th><th class="num">Received now</th></tr></thead><tbody>' +
      items.map((it, i) => { const rem = Math.max(0, util.num(it.qty) - prior[i]); return '<tr><td style="white-space:normal">' + esc(it.description) + (it.unit ? ' <span class="muted">(' + esc(it.unit) + ')</span>' : '') + '</td><td class="num">' + util.int(it.qty) + '</td><td class="num">' + util.int(prior[i]) + '</td><td class="num"><input class="input sm" type="number" min="0" step="any" data-line="' + i + '" value="' + rem + '"></td></tr>'; }).join('') +
      '</tbody></table></div><div class="hint">Defaults to everything still outstanding. Change a line if only part of it arrived.</div></div>' +
      '<div class="field s12"><label class="check"><input type="checkbox" name="final" checked> Final delivery — the order is complete</label><div class="hint final-hint"></div></div>' +
      '<div class="field s8"><label>Notes</label><input name="notes" placeholder="Shortages, damages, batch / expiry numbers…"></div>' +
      '<div class="field s4"><label>Delivery note / GRN copy</label><button type="button" class="btn" data-pick style="width:100%">' + ui.icon('clip', 'sm') + 'Attach file</button><input type="file" hidden multiple data-file><div class="hint picked"></div></div>' +
      '</div>';
    ui.modal({
      title: 'Record delivery · ' + poLabel(po), size: 'lg', body,
      onOpen: el => {
        const fin = el.querySelector('[name=final]');
        const hint = el.querySelector('.final-hint');
        const check = () => {
          const complete = items.every((it, i) => prior[i] + util.num(el.querySelector('[data-line="' + i + '"]').value) >= util.num(it.qty) - 1e-9);
          fin.checked = complete;
          hint.textContent = complete ? 'All ordered quantities will have been received.' : 'Some lines are still outstanding — this will be recorded as a partial delivery.';
        };
        el.querySelectorAll('[data-line]').forEach(i => i.addEventListener('input', check));
        check();
        const fi = el.querySelector('[data-file]');
        el.querySelector('[data-pick]').onclick = () => fi.click();
        fi.onchange = () => { picked = Array.from(fi.files); el.querySelector('.picked').textContent = picked.map(f => f.name).join(', '); };
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Record delivery', kind: 'primary', icon: 'check', onClick: async (close, el) => {
          const f = ui.formData(el);
          const missing = ['date', 'grn', 'receivedBy'].filter(k => !f[k]);
          el.querySelectorAll('.field').forEach(x => x.classList.remove('invalid'));
          if (missing.length) { missing.forEach(k => el.querySelector('[name=' + k + ']').closest('.field').classList.add('invalid')); ui.toast('Enter the date, GRN number and who received the goods.', 'warning'); return false; }
          const lines = items.map((it, i) => ({ line: i, lineIndex: i, description: it.description, unit: it.unit || '', qtyOrdered: util.num(it.qty), qtyReceived: util.num(el.querySelector('[data-line="' + i + '"]').value) }));
          if (!lines.some(l => l.qtyReceived > 0)) { ui.toast('Enter the quantity received for at least one line.', 'warning'); return false; }
          const over = lines.filter((l, i) => prior[i] + l.qtyReceived > l.qtyOrdered + 1e-9);
          if (over.length && !(await ui.confirm('More than the ordered quantity is being received for ' + over.length + ' ' + util.plural(over.length, 'line') + '. Record anyway?', { ok: 'Record anyway' }))) return false;
          const del = store.upsert('deliveries', { poId: po.id, supplierId: po.supplierId, date: f.date, grn: f.grn, receivedBy: f.receivedBy, condition: f.condition, notes: f.notes, items: lines, final: !!f.final, partial: !f.final, recordedIn: 'procurement', stocked: false });
          for (const file of picked) await files.add(file, { kind: 'Delivery Note / GRN', supplierId: po.supplierId, ref: f.grn, date: f.date, links: { poId: po.id } });
          // Earlier partial deliveries no longer flag the PO once the final one is in.
          domain.refreshOrderStatus(po.id);
          // General Stores sees it in its put-away queue; Fixed Assets is told about any asset lines.
          domain.afterDelivery(del, { by: 'procurement' });
          Proc.audit('Record Delivery', poLabel(po) + ' · GRN ' + f.grn + ' · ' + f.condition + (f.final ? ' · final' : ' · partial') + ' · ' + (po.supplierName || ''), po.id);
          ui.toast('Delivery recorded — General Stores notified');
          if (onDone) setTimeout(() => onDone(del), 30);
        }
      }]
    });
  }

  function deliveryDetail(d) {
    const po = store.get('purchaseOrders', d.poId);
    const docs = files.forLink('poId', d.poId).filter(x => x.kind === 'Delivery Note / GRN' && (!x.ref || x.ref === d.grn));
    ui.modal({
      title: 'Delivery · GRN ' + (d.grn || ''), size: 'lg',
      body: '<dl class="kv mb-2"><dt>Purchase order</dt><dd>' + (po ? '<a href="#/orders/' + po.id + '">' + esc(poLabel(po)) + '</a> · ' + esc(po.supplierName || '') : '—') + '</dd><dt>Date received</dt><dd>' + util.date(d.date) + '</dd><dt>Received by</dt><dd>' + esc(d.receivedBy || '') + '</dd>' +
        '<dt>Condition</dt><dd>' + esc(d.condition || '') + '</dd><dt>Type</dt><dd>' + (d.final ? ui.badge('Final', 'success') : ui.badge('Partial', 'warning')) + '</dd>' + (d.notes ? '<dt>Notes</dt><dd>' + esc(d.notes) + '</dd>' : '') + '</dl>' +
        ((d.items || []).length ? '<div class="table-wrap"><table class="table compact"><thead><tr><th>Item</th><th class="num">Ordered</th><th class="num">Received</th></tr></thead><tbody>' + d.items.map(i => '<tr><td>' + esc(i.description) + '</td><td class="num">' + util.int(i.qtyOrdered) + '</td><td class="num">' + util.int(i.qtyReceived) + '</td></tr>').join('') + '</tbody></table></div>' : '') +
        (docs.length ? '<div class="section-title mt-3">Documents</div><div class="doc-list">' + docs.map(x => ui.docRow(x, { noDelete: true })).join('') + '</div>' : ''),
      onOpen: (el, close) => { ui.bindDocs(el); el.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', close)); },
      actions: [{ label: 'Delete delivery', kind: 'ghost danger', onClick: async () => {
        if (!(await ui.confirm('Delete this delivery record (GRN ' + esc(d.grn) + ')? The PO status will be recalculated.', { danger: true, ok: 'Delete' }))) return false;
        store.remove('deliveries', d.id);
        if (po) { if (!store.filter('deliveries', x => x.poId === po.id).length && ['Delivered', 'Partially Delivered'].indexOf(po.status) >= 0) store.upsert('purchaseOrders', { id: po.id, status: 'Issued' }); domain.refreshOrderStatus(po.id); }
        Proc.audit('Delete Delivery', 'GRN ' + d.grn + (po ? ' · ' + poLabel(po) : ''), d.poId);
        ui.toast('Delivery deleted'); router.refresh();
      } }, { label: 'Close', kind: 'primary' }]
    });
  }

  function render(el) {
    const q = router.parse().query;
    const today = util.today();
    const awaiting = store.filter('purchaseOrders', p => AWAITING.indexOf(p.status) >= 0).map(p => Object.assign({}, p, { _age: util.daysBetween(p.date, today) || 0 }));
    const dels = store.list('deliveries').sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.createdAt).localeCompare(String(a.createdAt)));
    const monthKey = today.slice(0, 7);
    const thisMonth = dels.filter(d => util.monthKey(d.date) === monthKey);
    const late = awaiting.filter(p => p._age > 30);
    const problems = dels.filter(d => d.condition && d.condition !== 'Good');

    el.innerHTML = ui.pageHead({ title: 'Receiving', sub: 'Record goods and services received against purchase orders. Each delivery updates the PO and notifies General Stores.' }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Awaiting delivery', icon: 'truck', value: util.int(awaiting.length), meta: util.money(util.sum(awaiting, p => p.total)) + ' on order' }) +
      ui.kpi({ label: 'Over 30 days', icon: 'clock', tone: late.length ? 'warn' : 'ok', value: util.int(late.length), meta: 'Issued more than a month ago' }) +
      ui.kpi({ label: 'Received this month', icon: 'package', tone: 'ok', value: util.int(thisMonth.length), meta: util.MONTHS[+monthKey.slice(5) - 1] + ' deliveries' }) +
      ui.kpi({ label: 'Delivery issues', icon: 'alert', tone: problems.length ? 'bad' : 'ok', value: util.int(problems.length), meta: 'Damaged, short or wrong items' }) +
      '</div>' +
      '<div class="card"><div class="tabs"><button class="on" data-t="await">' + ui.icon('truck', 'sm') + 'Awaiting delivery<span class="n">' + awaiting.length + '</span></button><button data-t="hist">' + ui.icon('history', 'sm') + 'Delivery history<span class="n">' + dels.length + '</span></button></div><div class="tbl"></div></div>';

    const holder = el.querySelector('.tbl');
    const drawAwait = () => ui.table(holder, {
      rows: awaiting, pageSize: 25, placeholder: 'Search PO number, supplier, items…', initialSort: { key: 'date', dir: 1 },
      search: p => [p.poNumber, p.supplierName, p.description, p.department, (p.items || []).map(i => i.description).join(' ')].join(' '),
      empty: ui.empty('truck', 'Nothing awaiting delivery', 'Issued purchase orders appear here until all their goods are received.'),
      columns: [
        { key: 'poNumber', label: 'PO', render: p => '<a class="strong nowrap" href="#/orders/' + p.id + '">' + esc(poLabel(p)) + '</a>' },
        { key: 'supplierName', label: 'Supplier', render: p => p.supplierId ? '<a href="#/suppliers/' + p.supplierId + '">' + esc(p.supplierName || domain.supplierName(p.supplierId)) + '</a>' : esc(p.supplierName || '') },
        { key: 'description', label: 'Description', render: p => '<div class="truncate" style="max-width:360px">' + esc(p.description || ((p.items || [])[0] || {}).description || '') + '</div>' + (p.department ? '<div class="t-sub">' + esc(p.department) + '</div>' : '') },
        { key: 'date', label: 'Issued', render: p => '<span class="nowrap">' + util.date(p.date) + '</span><div class="t-sub ' + (p._age > 30 ? 'rc-late' : '') + '">' + p._age + ' days ago</div>', sort: p => p.date },
        { key: 'total', label: 'Value', cls: 'num', render: p => util.money(p.total) },
        { key: 'status', label: 'Status', render: p => ui.badge(p.status) },
        { key: 'act', label: '', sort: false, cls: 'actions', render: p => '<button class="btn sm primary" data-rcv="' + p.id + '">' + ui.icon('package', 'sm') + 'Receive</button>' }
      ],
      onRow: p => recordDelivery(p.id, () => router.refresh()),
      bind: tb => tb.querySelectorAll('[data-rcv]').forEach(b => b.onclick = e => { e.stopPropagation(); recordDelivery(b.dataset.rcv, () => router.refresh()); })
    });
    const drawHist = () => ui.table(holder, {
      rows: dels, pageSize: 25, placeholder: 'Search GRN, PO, supplier…',
      search: d => { const p = store.get('purchaseOrders', d.poId) || {}; return [d.grn, p.poNumber, p.supplierName, d.receivedBy, d.condition, d.notes].join(' '); },
      filters: [{ key: 'cond', label: 'Any condition', options: ['Good', 'Issues only'], test: (d, v) => v === 'Good' ? d.condition === 'Good' : d.condition !== 'Good' }],
      empty: ui.empty('package', 'No deliveries recorded yet'),
      columns: [
        { key: 'date', label: 'Received', render: d => '<span class="nowrap">' + util.date(d.date) + '</span>' },
        { key: 'grn', label: 'GRN', render: d => '<span class="mono">' + esc(d.grn || '') + '</span>' },
        { key: 'po', label: 'PO', sort: d => (store.get('purchaseOrders', d.poId) || {}).poNumber || '', render: d => { const p = store.get('purchaseOrders', d.poId); return p ? '<a href="#/orders/' + p.id + '">' + esc(poLabel(p)) + '</a>' : '<span class="muted">—</span>'; } },
        { key: 'supplier', label: 'Supplier', sort: d => (store.get('purchaseOrders', d.poId) || {}).supplierName || '', render: d => { const p = store.get('purchaseOrders', d.poId); return p ? esc(p.supplierName || '') : ''; } },
        { key: 'receivedBy', label: 'Received by' },
        { key: 'condition', label: 'Condition', render: d => ui.badge(d.condition || 'Good', d.condition && d.condition !== 'Good' ? 'danger' : 'success') },
        { key: 'final', label: 'Type', render: d => d.final ? ui.badge('Final', 'plain success') : ui.badge('Partial', 'warning') }
      ],
      onRow: d => deliveryDetail(d)
    });
    drawAwait();
    el.querySelectorAll('.tabs [data-t]').forEach(b => b.onclick = () => { el.querySelectorAll('.tabs [data-t]').forEach(x => x.classList.toggle('on', x === b)); b.dataset.t === 'await' ? drawAwait() : drawHist(); });

    if (q.po) {
      history.replaceState(null, '', '#/receiving');
      setTimeout(() => recordDelivery(q.po, () => router.refresh()), 50);
    }
  }

  Proc.page({ id: 'receiving', title: 'Receiving', icon: 'truck', section: 'Workflow', order: 50, render, count: () => store.filter('purchaseOrders', p => AWAITING.indexOf(p.status) >= 0).length });
  Proc.receiving = { record: recordDelivery };
})();
