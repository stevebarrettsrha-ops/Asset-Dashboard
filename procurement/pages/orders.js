/* ==========================================================================
   Purchase Orders — list (#/orders, ?cmp= / ?memo= / ?supplier=), detail
   (#/orders/<id>), new/edit form (#/orders/new, #/orders/<id>/edit).
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, K, files, router } = Proc;
  const esc = util.esc;

  if (!document.getElementById('css-orders')) document.head.insertAdjacentHTML('beforeend', '<style id="css-orders">' +
    '.po-items td .input{width:100%}.po-items td.qty{width:90px}.po-items td.unit{width:96px}.po-items td.price{width:150px}.po-items td.tot{width:140px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600}.po-items td.rm{width:40px}' +
    '.totals{display:grid;grid-template-columns:auto 170px;gap:6px 18px;justify-content:end;align-items:center;font-size:13.5px}.totals .k{color:var(--text-3);text-align:right}.totals .v{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}' +
    '.totals .grand{font-size:17px;font-weight:700}.totals .v .input{text-align:right}' +
    '.sup-card .nm{font-weight:700;font-size:15px}.sup-card .ln{display:flex;gap:8px;align-items:center;color:var(--text-2);font-size:13px;margin-top:6px}' +
    '.sup-card .ln svg{color:var(--text-3)}.mini-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.mini-stats div{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 10px}' +
    '.mini-stats b{display:block;font-size:15px;font-variant-numeric:tabular-nums}.mini-stats span{font-size:11.5px;color:var(--text-3)}' +
    '.filter-banner{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--primary-50);border:1px solid var(--primary-100);border-radius:var(--radius);margin-bottom:16px;font-size:13.5px}' +
    '.po-pv{background:var(--surface-3);padding:12px;max-height:80vh;overflow:auto;border-radius:0 0 var(--radius-lg) var(--radius-lg)}' +
    '.po-pv canvas{display:block;margin:0 auto 12px;background:#fff;box-shadow:0 2px 10px rgba(16,24,40,.18)}' +
    '.drop-kind{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12.5px;color:var(--text-3)}' +
    '</style>');

  const poLabel = p => (p.poNumber ? 'PO ' + p.poNumber : 'Draft PO');
  const normNo = s => String(s || '').trim().toUpperCase();
  const STEPS = ['Draft', 'Issued', 'Delivered', 'Invoiced', 'Paid'];
  const stepIndex = s => ({ Draft: 0, Issued: 2, 'Partially Delivered': 2, Delivered: 3, Invoiced: 4, Paid: 5, Closed: 5 })[s] || 0;
  const SEGS = [
    { k: 'All', test: () => true },
    { k: 'Draft', test: p => p.status === 'Draft' },
    { k: 'Issued', test: p => p.status === 'Issued' || p.status === 'Partially Delivered' },
    { k: 'Delivered', test: p => p.status === 'Delivered' },
    { k: 'Invoiced', test: p => p.status === 'Invoiced' },
    { k: 'Paid', test: p => p.status === 'Paid' || p.status === 'Closed' },
    { k: 'Cancelled', test: p => p.status === 'Cancelled' }
  ];

  Proc.quickCreate.push({ label: 'Purchase order', icon: 'cart', order: 40, onClick: () => router.go('orders/new') });

  Proc.page({
    id: 'orders', title: 'Purchase Orders', icon: 'cart', section: 'Workflow', order: 40,
    count: () => store.filter('purchaseOrders', p => p.status === 'Draft').length,
    render(el, params) {
      if (!params.length) return list(el);
      if (params[0] === 'new') return form(el, null);
      if (params[1] === 'edit') return form(el, params[0]);
      return detail(el, params[0]);
    }
  });

  function poNumberTaken(no, exceptId) {
    const n = normNo(no);
    if (!n) return null;
    return store.find('purchaseOrders', p => p.id !== exceptId && normNo(p.poNumber) === n) || null;
  }
  function docCounts() { const m = {}; store.list('documents').forEach(d => { const id = d.links && d.links.poId; if (id) m[id] = (m[id] || 0) + 1; }); return m; }

  /* =============================================================== list */
  function list(el) {
    const q = router.parse().query;
    let pos = store.list('purchaseOrders');
    let banner = '';
    if (q.cmp) { const c = store.get('comparisons', q.cmp); pos = pos.filter(p => p.comparisonId === q.cmp); banner = 'Showing purchase orders from price comparison <a href="#/sourcing/' + esc(q.cmp) + '"><b>' + esc(c ? (c.ref || c.subject) : q.cmp) + '</b></a>'; }
    else if (q.memo) { const mm = store.get('memos', q.memo); pos = pos.filter(p => p.memoId === q.memo); banner = 'Showing purchase orders from approval memo <a href="#/memos/' + esc(q.memo) + '"><b>' + esc(mm ? (mm.ref || mm.subject) : q.memo) + '</b></a>'; }
    else if (q.supplier) { pos = pos.filter(p => p.supplierId === q.supplier); banner = 'Showing purchase orders for <a href="#/suppliers/' + esc(q.supplier) + '"><b>' + esc(domain.supplierName(q.supplier, q.supplier)) + '</b></a>'; }
    pos.sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.poNumber || '').localeCompare(String(a.poNumber || ''), undefined, { numeric: true }));
    let seg = 'All';
    try { seg = sessionStorage.getItem('ordersSeg') || 'All'; } catch (e) { /* ignore */ }
    if (!SEGS.find(s => s.k === seg)) seg = 'All';
    const fy = util.fiscalYear(util.today());
    const all = store.list('purchaseOrders').filter(p => p.status !== 'Cancelled');
    const fyPos = all.filter(p => util.fiscalYear(p.date) === fy);
    const drafts = all.filter(p => p.status === 'Draft');
    const awaitingDel = all.filter(p => p.status === 'Issued' || p.status === 'Partially Delivered');
    const unpaid = all.filter(p => p.status === 'Delivered' || p.status === 'Invoiced');
    const counts = docCounts();

    el.innerHTML = ui.pageHead({
      title: 'Purchase Orders', sub: 'Every PO raised, its supplier, delivery and payment status.',
      actions: '<button class="btn" data-a="csv">' + ui.icon('download', 'sm') + 'Export CSV</button><button class="btn primary" data-a="new">' + ui.icon('plus', 'sm') + 'New purchase order</button>'
    }) +
      (banner ? '<div class="filter-banner">' + ui.icon('filter', 'sm') + '<div style="flex:1">' + banner + '</div><a class="btn sm" href="#/orders">Show all</a></div>' :
        '<div class="grid c4 mb-3">' +
        ui.kpi({ label: 'Committed ' + fy, value: util.moneyShort(util.sum(fyPos, p => p.total)), icon: 'wallet', meta: util.int(fyPos.length) + ' purchase orders', title: util.money(util.sum(fyPos, p => p.total)) }) +
        ui.kpi({ label: 'Drafts to issue', value: util.int(drafts.length), icon: 'edit', tone: drafts.length ? 'warn' : '', meta: util.money(util.sum(drafts, p => p.total)) }) +
        ui.kpi({ label: 'Awaiting delivery', value: util.int(awaitingDel.length), icon: 'truck', meta: util.money(util.sum(awaitingDel, p => p.total)) }) +
        ui.kpi({ label: 'Delivered, not paid', value: util.int(unpaid.length), icon: 'receipt', tone: 'pur', meta: util.money(util.sum(unpaid, p => p.total)) }) + '</div>') +
      '<div class="card"><div class="card-h"><div class="seg" id="poSeg">' + SEGS.map(s => '<button data-s="' + s.k + '" class="' + (s.k === seg ? 'on' : '') + '">' + s.k + '<span class="n">' + pos.filter(s.test).length + '</span></button>').join('') + '</div></div><div id="poTable"></div></div>';

    const supOpts = Array.from(new Set(pos.map(p => p.supplierId).filter(Boolean))).map(id => ({ value: id, label: domain.supplierName(id, id) })).sort((a, b) => a.label.localeCompare(b.label));
    const fys = Array.from(new Set(pos.map(p => util.fiscalYear(p.date)).filter(Boolean))).sort().reverse();
    const months = Array.from(new Set(pos.map(p => util.monthKey(p.date)).filter(Boolean))).sort().reverse().map(k => ({ value: k, label: util.monthLabel(k) }));
    const rows = () => pos.filter(SEGS.find(s => s.k === seg).test);
    const t = ui.table(el.querySelector('#poTable'), {
      rows: rows(), pageSize: 30, placeholder: 'Search PO #, supplier, description or item…',
      search: p => [p.poNumber, p.supplierName, p.description, p.department, p.requisitioner, p.ref, p.status, (p.items || []).map(i => i.description).join(' ')].join(' '),
      filters: [
        { key: 'supplier', label: 'All suppliers', options: supOpts, test: (p, v) => p.supplierId === v },
        { key: 'fy', label: 'All fiscal years', options: fys, test: (p, v) => util.fiscalYear(p.date) === v },
        { key: 'month', label: 'All months', options: months, test: (p, v) => util.monthKey(p.date) === v }
      ],
      onRow: p => router.go('orders/' + p.id),
      empty: ui.empty('cart', pos.length ? 'No purchase orders in this view' : 'No purchase orders yet', pos.length ? 'Try another status, filter or search.' : 'Create POs from an approved memo or price comparison, import your PO Log, or add one manually.',
        pos.length ? '' : '<div class="row" style="justify-content:center"><a class="btn primary" href="#/orders/new">' + ui.icon('plus', 'sm') + 'New purchase order</a><a class="btn" href="#/import">' + ui.icon('upload', 'sm') + 'Import PO Log</a></div>'),
      columns: [
        { key: 'poNumber', label: 'PO #', sort: p => Number(String(p.poNumber || '').replace(/\D.*$/, '')) || 0, render: p => p.poNumber ? '<span class="t-title mono">' + esc(p.poNumber) + '</span>' + (p.ref ? '<div class="t-sub truncate" style="max-width:170px">' + esc(p.ref) + '</div>' : '') : '<span class="badge plain">Draft</span>' },
        { key: 'date', label: 'Date', render: p => '<span class="nowrap">' + esc(util.date(p.date)) + '</span>' },
        { key: 'supplierName', label: 'Supplier', render: p => p.supplierId ? '<a href="#/suppliers/' + esc(p.supplierId) + '" class="strong">' + esc(p.supplierName || domain.supplierName(p.supplierId)) + '</a>' : esc(p.supplierName || '—') },
        { key: 'description', label: 'Description', render: p => '<div class="truncate" style="max-width:320px" title="' + esc(p.description) + '">' + esc(p.description || ((p.items || [])[0] || {}).description || '') + '</div>' + ((p.items || []).length > 1 ? '<div class="t-sub">' + p.items.length + ' items</div>' : '') },
        { key: 'department', label: 'Department', render: p => '<span class="muted">' + esc(p.department || '—') + '</span>' },
        { key: 'total', label: 'Total', cls: 'num', sort: p => util.num(p.total), render: p => '<span class="strong">' + util.money(p.total) + '</span>' },
        { key: 'status', label: 'Status', render: p => ui.badge(p.status) },
        { key: 'docs', label: '', sort: p => counts[p.id] || 0, render: p => counts[p.id] ? '<span class="chip" title="Documents">' + ui.icon('clip', 'sm') + counts[p.id] + '</span>' : '' }
      ],
      footer: list => '<td colspan="5">' + util.int(list.length) + ' purchase ' + util.plural(list.length, 'order') + '</td><td class="num">' + util.money(util.sum(list, p => p.total)) + '</td><td colspan="2"></td>'
    });
    el.querySelectorAll('#poSeg button').forEach(b => b.onclick = () => {
      seg = b.dataset.s; try { sessionStorage.setItem('ordersSeg', seg); } catch (e) { /* ignore */ }
      el.querySelectorAll('#poSeg button').forEach(x => x.classList.toggle('on', x === b));
      t.refresh(rows());
    });
    el.querySelector('[data-a=new]').onclick = () => router.go('orders/new' + (q.supplier ? '?supplier=' + q.supplier : ''));
    el.querySelector('[data-a=csv]').onclick = () => {
      const vis = t.visible();
      const csv = util.csv(['PO Number', 'PO Date', 'Supplier', 'Description', 'Department', 'Requisitioner', 'Reference', 'Method', 'Category', 'Subtotal', 'GCT', 'Total', 'Status'],
        vis.map(p => [p.poNumber, p.date, p.supplierName, p.description, p.department, p.requisitioner, p.ref, p.method, p.category, util.round2(p.subtotal), util.round2(p.gct), util.round2(p.total), p.status]));
      util.download(new Blob([csv], { type: 'text/csv' }), 'Purchase Orders ' + util.today() + '.csv');
    };
  }

  /* ============================================================= detail */
  function detail(el, id) {
    const po = store.get('purchaseOrders', id);
    if (!po) { el.innerHTML = ui.pageHead({ title: 'Purchase order not found', back: { label: 'Purchase Orders', href: '#/orders' } }) + ui.empty('cart', 'This purchase order no longer exists', 'It may have been deleted.'); return; }
    const sup = store.get('suppliers', po.supplierId);
    const memo = po.memoId && store.get('memos', po.memoId);
    const cmp = po.comparisonId && store.get('comparisons', po.comparisonId);
    const req = po.requisitionId && store.get('requisitions', po.requisitionId);
    const dels = store.filter('deliveries', d => d.poId === po.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const invs = store.filter('invoices', i => i.poId === po.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const items = (po.items || []).length ? po.items : [{ description: po.description || '—', unit: '', qty: 1, unitPrice: po.subtotal || po.total, total: po.subtotal || po.total }];
    const invoiced = util.sum(invs, i => i.total), paid = util.sum(invs.filter(i => i.status === 'Paid'), i => i.total);
    const S = store.settings();

    let primary = '';
    if (po.status === 'Draft') primary = '<button class="btn primary" data-a="issue">' + ui.icon('send', 'sm') + 'Issue PO</button>';
    else if (po.status === 'Issued' || po.status === 'Partially Delivered') primary = '<button class="btn primary" data-a="deliver">' + ui.icon('truck', 'sm') + 'Record delivery</button>';
    else if (po.status === 'Delivered' || po.status === 'Invoiced') primary = '<button class="btn primary" data-a="invoice">' + ui.icon('receipt', 'sm') + 'Record invoice</button>';

    el.innerHTML = ui.pageHead({
      back: { label: 'Purchase Orders', href: '#/orders' },
      title: poLabel(po), badge: ui.badge(po.status),
      sub: esc(po.supplierName || '') + ' · ' + esc(util.dateLong(po.date)) + ' · ' + '<b>' + util.money(po.total) + '</b>',
      actions: '<button class="btn" data-a="pdf">' + ui.icon('printer', 'sm') + 'Print PO</button>' + (po.status !== 'Cancelled' ? '<a class="btn" href="#/orders/' + po.id + '/edit">' + ui.icon('edit', 'sm') + 'Edit</a>' : '') + primary +
        '<button class="btn icon" data-a="more" title="More actions">' + ui.icon('more') + '</button>'
    }) +
      (po.status === 'Cancelled' ? '<div class="alert danger mb-3">' + ui.icon('alert') + '<div><div class="t">Cancelled' + (po.cancelledAt ? ' on ' + esc(util.date(po.cancelledAt)) : '') + '</div>' + esc(po.cancelReason || '') + '</div></div>' :
        '<div class="card mb-3"><div class="card-b">' + ui.stepper(STEPS, stepIndex(po.status)) + '</div></div>') +
      '<div class="grid side"><div class="stack">' +
      // Items
      '<div class="card"><div class="card-h"><div><h3>Items</h3><div class="sub">' + esc(po.description || '') + '</div></div></div><div class="card-b flush"><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Description</th><th>Unit</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>' +
      items.map((it, i) => '<tr><td class="muted">' + (i + 1) + '</td><td>' + esc(it.description) + '</td><td>' + esc(it.unit || '') + '</td><td class="num">' + util.int(it.qty) + '</td><td class="num">' + util.money(it.unitPrice) + '</td><td class="num strong">' + util.money(it.total || util.num(it.qty) * util.num(it.unitPrice)) + '</td></tr>').join('') +
      '</tbody></table></div><div style="padding:14px 18px;border-top:1px solid var(--border)"><div class="totals"><div class="k">Subtotal</div><div class="v">' + util.money(po.subtotal || util.sum(items, i => i.total)) + '</div><div class="k">GCT</div><div class="v">' + util.money(po.gct) + '</div><div class="k grand">Total</div><div class="v grand">' + util.money(po.total) + '</div></div>' +
      '<div class="words right mt-1">' + esc(domain.amountWords(po.total)) + '</div></div></div></div>' +
      // Deliveries
      '<div class="card"><div class="card-h"><div><h3>Deliveries</h3><div class="sub">' + (dels.length ? dels.length + ' recorded' : 'Nothing received yet') + '</div></div>' + (['Issued', 'Partially Delivered', 'Delivered'].indexOf(po.status) >= 0 ? '<a class="btn sm" href="#/receiving?po=' + po.id + '">' + ui.icon('plus', 'sm') + 'Record delivery</a>' : '') + '</div>' +
      (dels.length ? '<div class="card-b flush"><table class="table compact"><thead><tr><th>Date</th><th>GRN</th><th>Received by</th><th>Condition</th><th></th></tr></thead><tbody>' +
        dels.map(d => '<tr><td>' + esc(util.date(d.date)) + '</td><td class="mono">' + esc(d.grn || '—') + '</td><td>' + esc(d.receivedBy || '') + '</td><td>' + esc(d.condition || '') + '</td><td>' + (d.partial ? ui.badge('Partial', 'warning') : ui.badge('Complete', 'success')) + '</td></tr>').join('') + '</tbody></table></div>' : '') + '</div>' +
      // Invoices
      '<div class="card"><div class="card-h"><div><h3>Invoices &amp; payment</h3><div class="sub">' + (invs.length ? 'Invoiced ' + util.money(invoiced) + ' · paid ' + util.money(paid) + ' · balance ' + util.money(util.num(po.total) - paid) : 'No invoice recorded') + '</div></div>' + (po.status !== 'Draft' && po.status !== 'Cancelled' ? '<a class="btn sm" href="#/invoices?po=' + po.id + '&new=1">' + ui.icon('plus', 'sm') + 'Record invoice</a>' : '') + '</div>' +
      (invs.length ? '<div class="card-b flush"><table class="table compact"><thead><tr><th>Invoice #</th><th>Date</th><th>Due</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>' +
        invs.map(i => '<tr class="click" onclick="location.hash=\'#/invoices/' + i.id + '\'"><td class="mono strong">' + esc(i.invoiceNumber || '—') + '</td><td>' + esc(util.date(i.date)) + '</td><td>' + esc(util.date(i.dueDate)) + '</td><td class="num">' + util.money(i.total) + '</td><td>' + ui.badge(i.status) + '</td></tr>').join('') + '</tbody></table></div>' : '') + '</div>' +
      // PDF preview
      '<div class="card"><div class="card-h"><div><h3>Purchase order document</h3><div class="sub">Printed on the hospital letterhead' + (po.poNumber ? '' : ' — marked DRAFT until issued') + '</div></div><div class="row gap-1"><button class="btn sm" data-a="preview">' + ui.icon('eye', 'sm') + 'Preview</button><button class="btn sm" data-a="download">' + ui.icon('download', 'sm') + 'Download</button></div></div><div id="poPv"></div></div>' +
      '</div><div class="stack">' +
      // Supplier
      '<div class="card"><div class="card-h"><h3>Supplier</h3>' + (sup ? '<a class="btn sm ghost" href="#/suppliers/' + sup.id + '">Open file ' + ui.icon('arrow-right', 'sm') + '</a>' : '') + '</div><div class="card-b sup-card">' + supplierCard(po, sup) + '</div></div>' +
      // Details
      '<div class="card"><div class="card-h"><h3>Details</h3></div><div class="card-b"><dl class="kv tight">' +
      kv('PO number', po.poNumber ? '<span class="mono">' + esc(po.poNumber) + '</span>' : '<span class="muted">Not issued</span>') +
      kv('PO date', esc(util.date(po.date))) + kv('Reference', esc(po.ref)) + kv('Department', esc(po.department)) + kv('Requisitioner', esc(po.requisitioner)) +
      kv('Request #', esc(po.requestNo)) + kv('Method', esc(po.method)) + kv('Category', esc(po.category)) + kv('Type', esc(po.type)) + kv('Tenders received', po.tendersReceived ? esc(po.tendersReceived) : '') +
      kv('Payment terms', esc(po.paymentTerms)) + kv('Deliver to', esc(po.deliveryAddress)) + kv('Instructions', esc(po.instructions)) + kv('Comment', esc(po.comment)) +
      kv('Source', esc(({ manual: 'Entered manually', comparison: 'Price comparison', 'import:polog': 'Imported from PO Log', 'import:prs': 'Imported from PRS return', legacy: 'Earlier procurement page' })[po.source] || po.source || '')) +
      kv('Created', esc(util.dateTime(po.createdAt)) + (po.createdBy ? ' by ' + esc(po.createdBy) : '')) +
      '</dl></div></div>' +
      // Linked records
      ((memo || cmp || req) ? '<div class="card"><div class="card-h"><h3>Linked records</h3></div><div class="card-b"><div class="list-plain">' +
        (req ? linkRow('#/requisitions/' + req.id, 'clipboard', 'Requisition ' + (req.number || ''), req.title) : '') +
        (cmp ? linkRow('#/sourcing/' + cmp.id, 'scale', 'Price comparison', cmp.ref || cmp.subject) : '') +
        (memo ? linkRow('#/memos/' + memo.id, 'stamp', 'Approval memo', (memo.ref || '') + ' · ' + memo.status) : '') + '</div></div></div>' : '') +
      // Documents
      '<div class="card" id="poDocs"></div>' +
      '</div></div>';

    function drawDocs() {
      const box = el.querySelector('#poDocs');
      const docs = files.forLink('poId', po.id);
      box.innerHTML = '<div class="card-h"><div><h3>Documents</h3><div class="sub">Signed PO, quotation, invoice, delivery note</div></div><button class="btn sm" data-a="upload">' + ui.icon('upload', 'sm') + 'Upload</button></div><div class="card-b">' +
        '<div class="drop-kind">Save dropped files as <select class="input sm" id="dropKind" style="width:auto">' + ui.options(K.DOC_KINDS, 'Purchase Order') + '</select></div><div id="poDrop"></div>' +
        (docs.length ? '<div class="doc-list mt-2">' + docs.map(d => ui.docRow(d)).join('') + '</div>' : '') + '</div>';
      ui.bindDocs(box, drawDocs);
      ui.dropzone(box.querySelector('#poDrop'), async fs => {
        const kind = box.querySelector('#dropKind').value;
        for (const f of fs) await files.add(f, { kind, supplierId: po.supplierId || '', ref: po.poNumber || po.ref || '', amount: kind === 'Purchase Order' ? po.total : 0, links: { poId: po.id, comparisonId: po.comparisonId || '', memoId: po.memoId || '' } });
        ui.toast(fs.length + ' ' + util.plural(fs.length, 'file') + ' saved to this PO and ' + (po.supplierName || 'the supplier') + '’s file');
        drawDocs();
      }, { title: 'Drop the signed PO or other documents here', hint: 'Also filed under the supplier automatically' });
      box.querySelector('[data-a=upload]').onclick = async () => {
        const r = await ui.uploadDialog({ kind: 'Purchase Order', supplierId: po.supplierId, lockSupplier: !!po.supplierId, ref: po.poNumber || '', amount: po.total, links: { poId: po.id, comparisonId: po.comparisonId || '', memoId: po.memoId || '' } });
        if (r) drawDocs();
      };
    }
    drawDocs();

    const pdfOut = output => { if (!(Proc.pdf && Proc.pdf.purchaseOrder)) return ui.toast('PDF engine not loaded.', 'error'); return Proc.pdf.purchaseOrder(po, { output }).catch(e => ui.toast(e.message, 'error')); };
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === 'pdf') pdfOut('open');
      if (a === 'download') pdfOut('save');
      if (a === 'preview') {
        const box = el.querySelector('#poPv');
        if (box.innerHTML) { box.innerHTML = ''; box.className = ''; return; }
        box.className = 'po-pv'; box.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        const blob = await pdfOut('blob'); if (blob && Proc.pdf.render) Proc.pdf.render(box, blob);
      }
      if (a === 'issue') issue(po);
      if (a === 'deliver') location.hash = '#/receiving?po=' + po.id;
      if (a === 'invoice') location.hash = '#/invoices?po=' + po.id + '&new=1';
      if (a === 'more') ui.menu(b, moreItems(po));
    });
  }
  function kv(k, v) { return v ? '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>' : ''; }
  function linkRow(href, icon, label, sub) { return '<li><a href="' + href + '" class="row" style="gap:10px;text-decoration:none">' + ui.icon(icon, 'sm') + '<span><span class="strong" style="color:var(--text)">' + esc(label) + '</span><br><span class="small muted">' + esc(sub || '') + '</span></span></a></li>'; }
  function supplierCard(po, sup) {
    if (!sup) return '<div class="nm">' + esc(po.supplierName || 'No supplier') + '</div><div class="muted small mt-1">Not linked to a supplier profile.</div>';
    const sm = domain.supplierSummary(sup.id);
    const tcc = domain.expiryState(sup.tccExpiry);
    return '<div class="nm">' + esc(sup.name) + '</div>' +
      (sup.trn ? '<div class="ln">' + ui.icon('tag', 'sm') + 'TRN ' + esc(sup.trn) + '</div>' : '') +
      (sup.contactPerson ? '<div class="ln">' + ui.icon('user', 'sm') + esc(sup.contactPerson) + '</div>' : '') +
      (sup.phone ? '<div class="ln">' + ui.icon('phone', 'sm') + esc(sup.phone) + '</div>' : '') +
      (sup.email ? '<div class="ln">' + ui.icon('mail', 'sm') + '<a href="mailto:' + esc(sup.email) + '">' + esc(sup.email) + '</a></div>' : '') +
      (sup.address ? '<div class="ln">' + ui.icon('pin', 'sm') + esc(sup.address) + '</div>' : '') +
      (tcc ? '<div class="ln">' + ui.icon('shield', 'sm') + 'TCC ' + ui.badge(tcc.label, tcc.tone) + '</div>' : '') +
      '<div class="mini-stats"><div><b>' + util.moneyShort(sm.fySpend) + '</b><span>Spend ' + esc(sm.fy) + '</span></div><div><b>' + util.int(sm.poCount) + '</b><span>Purchase orders</span></div></div>';
  }

  function moreItems(po) {
    const items = [];
    if (po.status === 'Draft') items.push({ label: 'Issue PO', icon: 'send', onClick: () => issue(po) });
    if (po.status !== 'Draft' && po.status !== 'Cancelled') {
      items.push({ label: 'Record delivery', icon: 'truck', onClick: () => { location.hash = '#/receiving?po=' + po.id; } });
      items.push({ label: 'Record invoice', icon: 'receipt', onClick: () => { location.hash = '#/invoices?po=' + po.id + '&new=1'; } });
    }
    items.push({ label: 'Download PO PDF', icon: 'download', onClick: () => Proc.pdf && Proc.pdf.purchaseOrder(po, { output: 'save' }) });
    items.push({ label: 'Duplicate', icon: 'copy', onClick: () => duplicate(po) });
    if (po.status === 'Paid') items.push({ label: 'Close PO', icon: 'lock', onClick: () => { store.upsert('purchaseOrders', { id: po.id, status: 'Closed' }); Proc.audit('Close PO', poLabel(po), po.id); router.refresh(); } });
    items.push({ sep: true });
    if (po.status !== 'Cancelled' && po.status !== 'Draft') items.push({ label: 'Cancel PO', icon: 'x', danger: true, onClick: () => cancel(po) });
    if (po.status === 'Draft' || po.status === 'Cancelled') items.push({ label: 'Delete', icon: 'trash', danger: true, onClick: () => del(po) });
    return items;
  }

  async function issue(po) {
    let first = true;
    for (;;) {
      const v = await ui.form('Issue purchase order', [
        { name: 'poNumber', label: 'Official PO number', value: po.poNumber || '', required: true, placeholder: 'e.g. 1124590', hint: first ? 'The number from the finance system. Ranges such as 1124595-96 are fine.' : '<span class="text-danger">That PO number is already used — enter another.</span>', span: 's6' },
        { name: 'date', label: 'PO date', type: 'date', value: po.date || util.today(), required: true, span: 's6' },
        { name: 'paymentTerms', label: 'Payment terms', type: 'select', options: K.TERMS, value: po.paymentTerms || '30 days credit', span: 's12' }
      ], { ok: 'Issue PO' });
      if (!v) return;
      const taken = poNumberTaken(v.poNumber, po.id);
      if (taken) { first = false; ui.toast('PO ' + v.poNumber + ' is already used for ' + taken.supplierName + '.', 'error'); continue; }
      store.upsert('purchaseOrders', { id: po.id, poNumber: v.poNumber.trim(), date: v.date, paymentTerms: v.paymentTerms, status: 'Issued', issuedAt: util.today() });
      domain.refreshOrderStatus(po.id);
      Proc.audit('Issue PO', 'PO ' + v.poNumber + ' — ' + po.supplierName + ' — ' + util.money(po.total), po.id);
      ui.toast('PO ' + v.poNumber + ' issued. Print it, sign it, and upload the signed copy.');
      router.refresh();
      return;
    }
  }
  async function cancel(po) {
    const v = await ui.form('Cancel purchase order', [{ name: 'reason', label: 'Reason for cancellation', type: 'textarea', required: true }], { ok: 'Cancel PO' });
    if (!v) return;
    store.upsert('purchaseOrders', { id: po.id, status: 'Cancelled', cancelReason: v.reason, cancelledAt: util.today() });
    Proc.audit('Cancel PO', poLabel(po) + ' — ' + v.reason, po.id);
    ui.toast('Purchase order cancelled');
    router.refresh();
  }
  async function del(po) {
    if (!await ui.confirm('Delete <b>' + esc(poLabel(po)) + '</b> for ' + esc(po.supplierName || '') + '? This cannot be undone.', { danger: true, ok: 'Delete' })) return;
    if (po.comparisonId) { const c = store.get('comparisons', po.comparisonId); if (c && (c.poIds || []).indexOf(po.id) >= 0) store.upsert('comparisons', { id: c.id, poIds: c.poIds.filter(x => x !== po.id) }); }
    store.remove('purchaseOrders', po.id);
    Proc.audit('Delete PO', poLabel(po) + ' — ' + (po.supplierName || ''), po.id);
    ui.toast('Purchase order deleted');
    router.go('orders');
  }
  function duplicate(po) {
    const c = util.clone(po);
    ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'poNumber', 'issuedAt', 'cancelReason', 'cancelledAt', 'prs'].forEach(k => delete c[k]);
    Object.assign(c, { status: 'Draft', date: util.today(), source: 'manual' });
    const r = store.upsert('purchaseOrders', c);
    Proc.audit('Duplicate PO', 'From ' + poLabel(po), r.id);
    ui.toast('Draft copy created — review and save');
    router.go('orders/' + r.id + '/edit');
  }

  /* ============================================================== form */
  function form(el, id) {
    const existing = id ? store.get('purchaseOrders', id) : null;
    if (id && !existing) { el.innerHTML = ui.empty('cart', 'Purchase order not found', ''); return; }
    const q = router.parse().query;
    const S = store.settings();
    const pre = q.supplier && store.get('suppliers', q.supplier);
    const po = existing ? util.clone(existing) : { date: util.today(), status: 'Draft', supplierName: pre ? pre.name : '', supplierId: pre ? pre.id : '', items: [], gct: 0, paymentTerms: '30 days credit', deliveryAddress: S.org.deliveryAddress, type: 'Goods', method: 'Single Source (SS)', source: 'manual' };
    let items = (po.items || []).map(i => Object.assign({}, i));
    if (!items.length) items = existing ? [{ description: po.description || '', unit: 'lot', qty: 1, unitPrice: util.num(po.subtotal || po.total) }] : [{ description: '', unit: 'each', qty: '', unitPrice: '' }];
    let gct = util.num(po.gct);
    let gctAuto = false; // true after "15%" is chosen: GCT follows the subtotal
    let dirty = false;

    el.innerHTML = ui.pageHead({
      back: existing ? { label: poLabel(existing), href: '#/orders/' + existing.id } : { label: 'Purchase Orders', href: '#/orders' },
      title: existing ? 'Edit ' + poLabel(existing) : 'New purchase order',
      sub: existing ? ui.badge(existing.status) : 'Enter the PO details. Save as a draft, or issue it now with the official PO number.'
    }) +
      '<div class="stack" id="poForm">' +
      '<div class="card"><div class="card-h"><h3>Supplier &amp; order</h3></div><div class="card-b"><div class="form-grid">' +
      '<div class="field s6"><label>Supplier<span class="req">*</span></label><input name="supplierName" list="dl-suppliers" value="' + esc(po.supplierName) + '" placeholder="Start typing a supplier name"><div class="hint" id="supHint"></div></div>' +
      '<div class="field s3"><label>PO number</label><input name="poNumber" value="' + esc(po.poNumber || '') + '" placeholder="e.g. 1124590"><div class="hint">Leave blank for a draft</div></div>' +
      '<div class="field s3"><label>PO date<span class="req">*</span></label><input type="date" name="date" value="' + esc(po.date) + '"></div>' +
      '<div class="field s12"><label>Description<span class="req">*</span></label><input name="description" value="' + esc(po.description || '') + '" placeholder="e.g. 250 ea – Surgical Full Drapes"></div>' +
      '<div class="field s4"><label>Department</label><select name="department" id="poDept"><option value="">Select department</option></select></div>' +
      '<div class="field s4"><label>Requisitioner</label><input name="requisitioner" value="' + esc(po.requisitioner || '') + '"></div>' +
      '<div class="field s4"><label>Request #</label><input name="requestNo" value="' + esc(po.requestNo || '') + '"></div>' +
      '<div class="field s4"><label>Procurement method</label><select name="method">' + ui.options(K.METHODS, po.method, 'Select method') + '</select></div>' +
      '<div class="field s2"><label>Type</label><select name="type">' + ui.options(K.TYPES, po.type) + '</select></div>' +
      '<div class="field s6"><label>Category (PRS)</label><select name="category">' + ui.categoryOptions(po.category) + '</select></div>' +
      '<div class="field s4"><label>Reference / RFQ #</label><input name="ref" value="' + esc(po.ref || '') + '"></div>' +
      '<div class="field s4"><label>Payment terms</label><select name="paymentTerms">' + ui.options(K.TERMS, po.paymentTerms) + '</select></div>' +
      '<div class="field s4"><label>Priority</label><select name="priority">' + ui.options(K.PRIORITIES, po.priority || 'Normal') + '</select></div>' +
      '<div class="field s12"><label>Deliver to</label><input name="deliveryAddress" value="' + esc(po.deliveryAddress || '') + '"></div>' +
      '<div class="field s12"><label>Special instructions</label><textarea name="instructions" rows="2">' + esc(po.instructions || '') + '</textarea></div>' +
      '</div></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Line items</h3><div class="sub">Paste rows from Excel (Description, Unit, Qty, Unit price) into any description box</div></div></div><div class="card-b flush"><div class="table-wrap"><table class="table edit-table po-items"><thead><tr><th class="center">#</th><th>Description</th><th>Unit</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th><th></th></tr></thead><tbody id="poItems"></tbody></table></div>' +
      '<div class="row between" style="padding:12px 18px;border-top:1px solid var(--border);align-items:flex-start"><button class="btn sm" data-a="additem">' + ui.icon('plus', 'sm') + 'Add line</button>' +
      '<div class="totals" id="poTotals"></div></div></div></div>' +
      '<div class="row end">' + '<a class="btn ghost" href="' + (existing ? '#/orders/' + existing.id : '#/orders') + '">Cancel</a>' +
      (!existing || existing.status === 'Draft' ? '<button class="btn" data-a="draft">Save as draft</button><button class="btn primary" data-a="issue">' + ui.icon('send', 'sm') + 'Save &amp; issue</button>' : '<button class="btn primary" data-a="save">' + ui.icon('check', 'sm') + 'Save changes</button>') +
      '</div></div>';

    const root = el.querySelector('#poForm');
    const dept = root.querySelector('#poDept');
    if (typeof window.mphPopulateDeptSelect === 'function') { try { window.mphPopulateDeptSelect(dept, { firstOption: { value: '', label: 'Select department' } }); } catch (e) { /* ignore */ } }
    if (po.department && !Array.from(dept.options).some(o => o.value === po.department)) dept.insertAdjacentHTML('beforeend', '<option>' + esc(po.department) + '</option>');
    dept.value = po.department || '';
    const supInput = root.querySelector('[name=supplierName]');
    const supHint = () => { const s = domain.findSupplier(supInput.value); root.querySelector('#supHint').innerHTML = !supInput.value.trim() ? '' : s ? ui.icon('check', 'sm') + ' Existing supplier' + (s.trn ? ' · TRN ' + esc(s.trn) : '') : 'New supplier — a profile will be created'; };
    supInput.addEventListener('input', supHint); supHint();

    const rate = S.gctRate;
    const subtotal = () => util.round2(util.sum(items, i => util.num(i.qty) * util.num(i.unitPrice)));
    function drawItems() {
      root.querySelector('#poItems').innerHTML = items.map((it, i) => '<tr><td class="idx">' + (i + 1) + '</td>' +
        '<td><input class="input sm" data-i="' + i + '" data-k="description" value="' + esc(it.description) + '" placeholder="Item description"></td>' +
        '<td class="unit"><input class="input sm" list="dl-units" data-i="' + i + '" data-k="unit" value="' + esc(it.unit || '') + '"></td>' +
        '<td class="qty"><input class="input sm num" type="number" step="any" min="0" data-i="' + i + '" data-k="qty" value="' + esc(it.qty) + '"></td>' +
        '<td class="price"><input class="input sm num" type="number" step="0.01" min="0" data-i="' + i + '" data-k="unitPrice" value="' + esc(it.unitPrice) + '"></td>' +
        '<td class="tot" data-tot="' + i + '">' + util.money(util.num(it.qty) * util.num(it.unitPrice)) + '</td>' +
        '<td class="rm"><button class="btn xs ghost icon" data-rm="' + i + '" title="Remove">' + ui.icon('x', 'sm') + '</button></td></tr>').join('');
      drawTotals();
    }
    function drawTotals() {
      const st = subtotal();
      root.querySelector('#poTotals').innerHTML = '<div class="k">Subtotal</div><div class="v">' + util.money(st) + '</div>' +
        '<div class="k">GCT <button class="btn xs ghost" data-a="gct15" title="Apply ' + Math.round(rate * 100) + '% GCT">' + Math.round(rate * 100) + '%</button><button class="btn xs ghost" data-a="gct0" title="No GCT">None</button></div><div class="v"><input class="input sm" type="number" step="0.01" min="0" id="gctIn" value="' + util.round2(gct) + '"></div>' +
        '<div class="k grand">Total</div><div class="v grand">' + util.money(st + gct) + '</div>';
      root.querySelector('#gctIn').addEventListener('input', e => { gct = util.num(e.target.value); gctAuto = false; dirty = true; root.querySelector('#poTotals .v.grand').textContent = util.money(subtotal() + gct); });
    }
    if (!document.getElementById('dl-units')) document.body.insertAdjacentHTML('beforeend', '<datalist id="dl-units">' + K.UNITS.map(u => '<option value="' + u + '">').join('') + '</datalist>');
    gctAuto = gct > 0 && Math.abs(gct - util.round2(subtotal() * rate)) < 0.05;
    drawItems();

    root.addEventListener('input', e => {
      const t = e.target; dirty = true;
      if (t.dataset.i === undefined) return;
      items[+t.dataset.i][t.dataset.k] = t.value;
      if (t.dataset.k === 'qty' || t.dataset.k === 'unitPrice') {
        const it = items[+t.dataset.i];
        root.querySelector('[data-tot="' + t.dataset.i + '"]').textContent = util.money(util.num(it.qty) * util.num(it.unitPrice));
        if (gctAuto) gct = util.round2(subtotal() * rate);
        drawTotals();
      }
    });
    // Paste a block from Excel into a description cell → fills rows.
    root.addEventListener('paste', e => {
      const t = e.target; if (t.dataset.k !== 'description') return;
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!/\t|\n/.test(text.trim())) return;
      e.preventDefault();
      const start = +t.dataset.i;
      const rows = text.replace(/\r/g, '').split('\n').filter(r => r.trim());
      rows.forEach((r, k) => {
        const c = r.split('\t');
        const row = items[start + k] || (items[start + k] = { description: '', unit: '', qty: '', unitPrice: '' });
        row.description = (c[0] || '').trim(); if (c[1] !== undefined) row.unit = c[1].trim(); if (c[2] !== undefined) row.qty = util.num(c[2]) || ''; if (c[3] !== undefined) row.unitPrice = util.num(c[3]) || '';
      });
      dirty = true; if (gctAuto) gct = util.round2(subtotal() * rate); drawItems(); ui.toast(rows.length + ' ' + util.plural(rows.length, 'row') + ' pasted');
    });
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-a],[data-rm]'); if (!b) return;
      if (b.dataset.rm !== undefined) { items.splice(+b.dataset.rm, 1); if (!items.length) items.push({ description: '', unit: 'each', qty: '', unitPrice: '' }); dirty = true; if (gctAuto) gct = util.round2(subtotal() * rate); drawItems(); return; }
      const a = b.dataset.a;
      if (a === 'additem') { items.push({ description: '', unit: 'each', qty: '', unitPrice: '' }); drawItems(); const ins = root.querySelectorAll('[data-k=description]'); ins[ins.length - 1].focus(); }
      if (a === 'gct15') { gctAuto = true; gct = util.round2(subtotal() * rate); drawTotals(); dirty = true; }
      if (a === 'gct0') { gctAuto = false; gct = 0; drawTotals(); dirty = true; }
      if (a === 'draft') submit('draft');
      if (a === 'issue') submit('issue');
      if (a === 'save') submit('save');
    });

    function submit(mode) {
      const f = ui.formData(root);
      root.querySelectorAll('.field').forEach(x => x.classList.remove('invalid'));
      const bad = [];
      const mark = n => { const inp = root.querySelector('[name=' + n + ']'); if (inp) inp.closest('.field').classList.add('invalid'); };
      if (!f.supplierName) { bad.push('supplier'); mark('supplierName'); }
      if (!f.date) { bad.push('PO date'); mark('date'); }
      const clean = items.filter(i => (i.description || '').trim()).map(i => ({ description: i.description.trim(), unit: (i.unit || '').trim(), qty: util.num(i.qty), unitPrice: util.num(i.unitPrice), total: util.round2(util.num(i.qty) * util.num(i.unitPrice)) }));
      if (!clean.length || !clean.some(i => i.total > 0)) bad.push('at least one priced line item');
      if (!f.description) { if (clean.length) f.description = clean.length === 1 ? (clean[0].qty ? clean[0].qty + ' ' + (clean[0].unit || '') + ' - ' : '') + clean[0].description : clean[0].description + ' and ' + (clean.length - 1) + ' other item(s)'; else { bad.push('description'); mark('description'); } }
      if (mode === 'issue' && !f.poNumber) { bad.push('the official PO number (to issue)'); mark('poNumber'); }
      if (bad.length) return ui.toast('Please add ' + bad.join(', ') + '.', 'warning');
      const taken = poNumberTaken(f.poNumber, existing && existing.id);
      if (taken) { mark('poNumber'); return ui.toast('PO ' + f.poNumber + ' is already used (' + taken.supplierName + ').', 'error'); }
      const sup = domain.ensureSupplier(f.supplierName);
      const st = util.round2(util.sum(clean, i => i.total));
      const rec = Object.assign({}, existing ? { id: existing.id } : {}, {
        supplierId: sup.id, supplierName: sup.name, poNumber: f.poNumber, date: f.date, description: f.description, department: f.department, requisitioner: f.requisitioner,
        requestNo: f.requestNo, method: f.method, type: f.type, category: f.category, ref: f.ref, paymentTerms: f.paymentTerms, priority: f.priority,
        deliveryAddress: f.deliveryAddress, instructions: f.instructions, items: clean, subtotal: st, gct: util.round2(gct), total: util.round2(st + gct)
      });
      if (!existing) rec.source = 'manual';
      if (mode === 'issue') { rec.status = 'Issued'; rec.issuedAt = util.today(); }
      else if (!existing) rec.status = 'Draft';
      const saved = store.upsert('purchaseOrders', rec);
      if (saved.status !== 'Draft') domain.refreshOrderStatus(saved.id);
      Proc.audit(existing ? 'Edit PO' : 'Create PO', poLabel(saved) + ' — ' + sup.name + ' — ' + util.money(saved.total), saved.id);
      dirty = false;
      ui.toast(mode === 'issue' ? 'PO ' + saved.poNumber + ' issued' : existing ? 'Changes saved' : 'Draft purchase order saved');
      router.go('orders/' + saved.id);
    }
    router.beforeLeave = async () => {
      if (!dirty) return true;
      const ok = await ui.confirm('You have unsaved changes on this purchase order. Leave without saving?', { ok: 'Leave', danger: true });
      if (!ok) history.replaceState(null, '', existing ? '#/orders/' + existing.id + '/edit' : '#/orders/new');
      return ok;
    };
  }
})();
