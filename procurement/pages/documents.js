/* ==========================================================================
   Documents — every quote, PO, invoice, delivery note, memo and certificate.
   Route: #/documents  (#/documents?doc=<id> highlights one document)
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, K, files, router } = Proc;
  const esc = util.esc;

  if (!document.getElementById('css-documents')) document.head.insertAdjacentHTML('beforeend', '<style id="css-documents">' +
    '.dc-cell{display:flex;align-items:center;gap:10px;min-width:0}' +
    '.dc-cell .fi{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;background:var(--danger-bg);color:var(--danger);font-size:9.5px;font-weight:800;flex:none}' +
    '.dc-cell .fi.img{background:var(--info-bg);color:var(--info)}.dc-cell .fi.xls{background:var(--success-bg);color:var(--success)}.dc-cell .fi.doc{background:var(--primary-50);color:var(--primary)}' +
    '.dc-sup{display:block;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.dc-cell .nm{font-weight:600;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.dc-cloud-ok{color:var(--success)}.dc-cloud-no{color:var(--text-3);opacity:.6}' +
    '.dc-focus{border-color:var(--primary);box-shadow:0 0 0 3px var(--focus)}' +
    '.table tr.hl td{background:var(--primary-50)!important}' +
    '</style>');

  function linksHtml(d) {
    const l = d.links || {}, out = [];
    if (l.poId) { const p = store.get('purchaseOrders', l.poId); if (p) out.push('<a href="#/orders/' + p.id + '">' + esc(p.poNumber ? 'PO ' + p.poNumber : 'Draft PO') + '</a>'); }
    if (l.invoiceId) { const i = store.get('invoices', l.invoiceId); if (i) out.push('<a href="#/invoices/' + i.id + '">Inv ' + esc(i.invoiceNumber) + '</a>'); }
    if (l.comparisonId) { const c = store.get('comparisons', l.comparisonId); if (c) out.push('<a href="#/sourcing/' + c.id + '">' + esc(c.ref || c.subject || 'Comparison') + '</a>'); }
    if (l.memoId) { const m = store.get('memos', l.memoId); if (m) out.push('<a href="#/memos/' + m.id + '">Memo ' + esc(m.ref || '') + '</a>'); }
    if (l.requisitionId) { const r = store.get('requisitions', l.requisitionId); if (r) out.push('<a href="#/requisitions/' + r.id + '">' + esc(r.number || 'Requisition') + '</a>'); }
    return out.join('<br>');
  }

  /** Edit metadata and links of a document. */
  function editDoc(d, done) {
    const sups = store.list('suppliers').sort((a, b) => a.name.localeCompare(b.name));
    const posFor = sid => store.list('purchaseOrders').filter(p => !sid || p.supplierId === sid).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const invFor = sid => store.list('invoices').filter(i => !sid || i.supplierId === sid);
    const l = d.links || {};
    const poOpts = sid => ui.options(posFor(sid).slice(0, 400).map(p => ({ value: p.id, label: (p.poNumber ? 'PO ' + p.poNumber : 'Draft') + ' · ' + (p.supplierName || '') + ' · ' + util.money(p.total) })), l.poId || '', '— None —');
    const invOpts = sid => ui.options(invFor(sid).map(i => ({ value: i.id, label: 'Invoice ' + i.invoiceNumber + ' · ' + domain.supplierName(i.supplierId) + ' · ' + util.money(i.total) })), l.invoiceId || '', '— None —');
    ui.modal({
      title: 'Document details', size: 'lg',
      body: '<div class="form-grid">' +
        '<div class="field s8"><label>Title</label><input name="title" value="' + esc(d.title || '') + '"></div>' +
        '<div class="field s4"><label>Type</label><select name="kind">' + ui.options(K.DOC_KINDS, d.kind) + '</select></div>' +
        '<div class="field s6"><label>Supplier</label><select name="supplierId">' + ui.options(sups.map(s => ({ value: s.id, label: s.name })), d.supplierId || '', '— Not supplier specific —') + '</select></div>' +
        '<div class="field s3"><label>Reference</label><input name="ref" value="' + esc(d.ref || '') + '"></div>' +
        '<div class="field s3"><label>Date</label><input type="date" name="date" value="' + esc(d.date || '') + '"></div>' +
        '<div class="field s6"><label>Linked purchase order</label><select name="poId">' + poOpts(d.supplierId) + '</select></div>' +
        '<div class="field s6"><label>Linked invoice</label><select name="invoiceId">' + invOpts(d.supplierId) + '</select></div>' +
        '<div class="field s4"><label>Amount (JMD)</label><input type="number" step="0.01" name="amount" value="' + esc(d.amount || '') + '"></div>' +
        '<div class="field s8"><label>Notes</label><input name="notes" value="' + esc(d.notes || '') + '"></div>' +
        '<div class="field s12 small muted">File: ' + esc(d.name) + ' · ' + util.fileSize(d.size) + ' · uploaded ' + util.dateTime(d.createdAt) + (d.createdBy ? ' by ' + esc(d.createdBy) : '') + '</div></div>',
      onOpen: el => {
        el.querySelector('[name=supplierId]').onchange = e => { el.querySelector('[name=poId]').innerHTML = poOpts(e.target.value); el.querySelector('[name=invoiceId]').innerHTML = invOpts(e.target.value); };
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (close, el) => {
          const f = ui.formData(el);
          const links = Object.assign({}, d.links || {}, { poId: f.poId || '', invoiceId: f.invoiceId || '' });
          Object.keys(links).forEach(k => { if (!links[k]) delete links[k]; });
          store.upsert('documents', { id: d.id, title: f.title, kind: f.kind, supplierId: f.supplierId, ref: f.ref, date: f.date, amount: util.num(f.amount) || 0, notes: f.notes, links });
          Proc.audit('Update Document', f.kind + ': ' + (f.title || d.name), d.id);
          ui.toast('Document updated');
          done && done();
        }
      }]
    });
  }

  function render(el) {
    const q = router.parse().query;
    const docs = store.list('documents').sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const sups = Array.from(new Set(docs.map(d => d.supplierId).filter(Boolean))).map(id => ({ value: id, label: domain.supplierName(id, '(deleted supplier)') })).sort((a, b) => a.label.localeCompare(b.label));
    const months = Array.from(new Set(docs.map(d => util.monthKey(d.date)).filter(Boolean))).sort().reverse();
    const synced = docs.filter(d => d.driveFileId).length;
    const totalSize = util.sum(docs, d => d.size);
    const focus = q.doc ? store.get('documents', q.doc) : null;

    el.innerHTML = ui.pageHead({
      title: 'Documents', sub: 'Quotations, purchase orders, invoices, delivery notes, approval memos and supplier certificates.',
      actions: '<button class="btn primary" data-act="upload">' + ui.icon('upload', 'sm') + 'Upload documents</button>'
    }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Documents', icon: 'clip', value: util.int(docs.length), meta: util.fileSize(totalSize) + ' stored' }) +
      ui.kpi({ label: 'Quotations', icon: 'scale', tone: 'pur', value: util.int(docs.filter(d => d.kind === 'Quotation').length) }) +
      ui.kpi({ label: 'Invoices & POs', icon: 'receipt', tone: 'ok', value: util.int(docs.filter(d => d.kind === 'Invoice' || d.kind === 'Purchase Order').length) }) +
      ui.kpi({ label: 'Copied to Google Drive', icon: 'cloud', tone: synced === docs.length ? 'ok' : 'warn', value: util.int(synced) + ' / ' + util.int(docs.length), meta: Proc.sync.token() ? 'Drive connected' : 'Drive not connected' }) +
      '</div>' +
      (focus ? '<div class="card dc-focus mb-3"><div class="card-b"><div class="doc-list">' + ui.docRow(focus, { showSupplier: true }) + '</div>' +
        '<div class="row small muted mt-1">' + (linksHtml(focus) ? 'Linked to: ' + linksHtml(focus).replace(/<br>/g, ' · ') : 'Not linked to a PO or invoice') + (focus.notes ? ' · ' + esc(focus.notes) : '') + '<span class="spacer"></span><button class="btn sm" data-act="edit-focus">' + ui.icon('edit', 'sm') + 'Edit details</button></div></div></div>' : '') +
      '<div class="card"><div class="tbl"></div></div>' +
      '<div class="alert mt-3">' + ui.icon('info') + '<div><div class="t">Where files are kept</div><div class="small">Files are saved in this browser’s database on this computer. When Google Drive is connected (sign in on the main asset dashboard), each file is also copied to the <b>Procurement Documents</b> folder on Drive so other computers can open it. Use Settings → Backup regularly.</div></div></div>';

    el.querySelector('[data-act=upload]').onclick = async () => { const r = await ui.uploadDialog({}); if (r) router.refresh(); };
    if (focus) {
      ui.bindDocs(el.querySelector('.dc-focus'), () => router.go('documents'));
      el.querySelector('[data-act=edit-focus]').onclick = () => editDoc(focus, () => router.refresh());
    }

    if (!docs.length) {
      el.querySelector('.tbl').innerHTML = ui.empty('clip', 'No documents yet', 'Upload scanned quotes, signed POs, invoices and supplier certificates. Each one is filed under its supplier.', '<button class="btn primary" data-act="upload2">' + ui.icon('upload', 'sm') + 'Upload documents</button>');
      el.querySelector('[data-act=upload2]').onclick = () => el.querySelector('[data-act=upload]').click();
      return;
    }
    ui.table(el.querySelector('.tbl'), {
      rows: docs, pageSize: 25, placeholder: 'Search file name, reference, supplier…',
      search: d => [d.title, d.name, d.ref, d.notes, d.kind, domain.supplierName(d.supplierId)].join(' '),
      rowCls: d => (focus && d.id === focus.id ? 'dc-hl' : ''),
      filters: [
        { key: 'kind', label: 'All types', options: K.DOC_KINDS.filter(k => docs.some(d => d.kind === k)), test: (d, v) => d.kind === v },
        { key: 'sup', label: 'All suppliers', options: sups, test: (d, v) => d.supplierId === v },
        { key: 'month', label: 'Any month', options: months.map(m => ({ value: m, label: util.monthLabel(m) })), test: (d, v) => util.monthKey(d.date) === v }
      ],
      columns: [
        { key: 'title', label: 'Document', render: d => '<div class="dc-cell">' + ui.fileIcon(d) + '<div style="min-width:0"><div class="nm" title="' + esc(d.name) + '">' + esc(d.title || d.name) + '</div><div class="t-sub truncate" style="max-width:300px">' + esc(d.kind || 'Other') + ' · ' + util.date(d.date) + ' · ' + util.fileSize(d.size) + '</div></div></div>' },
        { key: 'supplier', label: 'Supplier', sort: d => domain.supplierName(d.supplierId), render: d => d.supplierId ? '<a class="dc-sup" title="' + esc(domain.supplierName(d.supplierId)) + '" href="#/suppliers/' + d.supplierId + '/documents">' + esc(domain.supplierName(d.supplierId, '—')) + '</a>' : '<span class="muted">—</span>' },
        { key: 'ref', label: 'Reference / linked to', render: d => '<div class="small nowrap">' + [d.ref ? '<span class="mono">' + esc(d.ref) + '</span>' : '', linksHtml(d).replace(/<br>/g, ' · ')].filter(Boolean).join(' · ') + '</div>' },
        { key: 'amount', label: 'Amount', cls: 'num', render: d => d.amount ? util.money(d.amount) : '' },
        { key: 'drive', label: '', sort: d => (d.driveFileId ? 1 : 0), render: d => '<span title="' + (d.driveFileId ? 'Copied to Google Drive' : 'Only on this computer') + '" class="' + (d.driveFileId ? 'dc-cloud-ok' : 'dc-cloud-no') + '">' + ui.icon('cloud', 'sm') + '</span>' },
        { key: 'actions', label: '', sort: false, cls: 'actions', render: d => '<button class="btn xs ghost icon" data-a="open" data-id="' + d.id + '" title="Open">' + ui.icon('eye', 'sm') + '</button><button class="btn xs ghost icon" data-a="download" data-id="' + d.id + '" title="Download">' + ui.icon('download', 'sm') + '</button><button class="btn xs ghost icon" data-a="edit" data-id="' + d.id + '" title="Edit details / re-link">' + ui.icon('edit', 'sm') + '</button><button class="btn xs ghost icon danger" data-a="delete" data-id="' + d.id + '" title="Delete">' + ui.icon('trash', 'sm') + '</button>' }
      ],
      onRow: d => files.open(d.id),
      bind: tbody => tbody.querySelectorAll('[data-a]').forEach(b => b.onclick = async e => {
        e.stopPropagation();
        const d = store.get('documents', b.dataset.id); if (!d) return;
        if (b.dataset.a === 'open') files.open(d.id);
        if (b.dataset.a === 'download') files.download(d.id);
        if (b.dataset.a === 'edit') editDoc(d, () => router.refresh());
        if (b.dataset.a === 'delete' && await ui.confirm('Delete <b>' + esc(d.name) + '</b>? The file is removed from this computer' + (d.driveFileId ? ' (the Drive copy stays in the Procurement Documents folder)' : '') + '.', { danger: true, ok: 'Delete' })) {
          await files.remove(d.id); Proc.audit('Delete Document', d.name, d.id); ui.toast('Document deleted'); router.refresh();
        }
      })
    });
  }

  Proc.page({ id: 'documents', title: 'Documents', icon: 'folder', section: 'Records', order: 20, render });
  Proc.quickCreate.push({ label: 'Upload document', icon: 'upload', order: 70, onClick: async () => { const r = await ui.uploadDialog({}); if (r && router.current === 'documents') router.refresh(); } });
})();
