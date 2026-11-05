/* ==========================================================================
   Digital PO Form (#/po-form, #/po-form/<poId>) — the Government of Jamaica
   purchase order form ("Preparation and Issue of Purchase Orders") as an
   on-screen form, saved as a purchase order and downloadable as a PDF in the
   same layout.
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc, num = util.num;
  const ROWS = 15;                          // lines on the printed form
  const DRAFT_KEY = 'procPoFormDraft';
  const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; } };
  const writeDraft = d => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) { /* draft is a convenience only */ } };
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } };

  /* ------------------------------------------------------------ model */
  function blank() {
    const off = domain.officer();
    return { id: null, poNumber: '', date: util.today(), supplierName: '', address: '', phone: '', fax: '', email: '', trn: '', requiredDate: '', deliveryMethod: '', other: '',
      lines: Array.from({ length: ROWS }, () => ({ qty: '', code: '', description: '', unitPrice: '' })), preparedBy: off.name, preparedDate: util.today(), authorizedBy: (store.settings().signatories.parishManager || {}).name || '', authorizedDate: '' };
  }
  /** Form values from a saved purchase order. */
  function fromPO(po) {
    const sup = store.get('suppliers', po.supplierId) || {};
    const snap = po.supplierSnapshot || {};
    const f = blank();
    Object.assign(f, {
      id: po.id, poNumber: po.poNumber || '', date: po.date || util.today(), supplierName: po.supplierName || sup.name || '',
      address: snap.address || sup.address || '', phone: snap.phone || sup.phone || '', fax: snap.fax || sup.fax || '', email: snap.email || sup.email || '', trn: snap.trn || sup.trn || '',
      requiredDate: po.requiredDate || '', deliveryMethod: po.deliveryMethod || '', other: po.otherInstructions || po.instructions || '',
      preparedBy: po.preparedBy || f.preparedBy, preparedDate: po.preparedDate || po.date || f.preparedDate, authorizedBy: po.authorizedBy || f.authorizedBy, authorizedDate: po.authorizedDate || ''
    });
    const items = (po.items || []).map(i => ({ qty: i.qty === undefined ? '' : i.qty, code: i.code || '', description: i.description || '', unitPrice: i.unitPrice === undefined ? '' : i.unitPrice }));
    f.lines = items.concat(Array.from({ length: Math.max(0, ROWS - items.length) }, () => ({ qty: '', code: '', description: '', unitPrice: '' })));
    return f;
  }
  const lineTotal = l => util.round2(num(l.qty) * num(l.unitPrice));
  const filled = f => f.lines.filter(l => String(l.description || '').trim() || num(l.unitPrice) || String(l.code || '').trim());
  const total = f => util.round2(util.sum(filled(f), lineTotal));

  /* ------------------------------------------------------------ PDF in the form's layout */
  function gojPdf(f, output) {
    const K = Proc.pdf && Proc.pdf.kit; if (!K) throw new Error('The PDF engine is not loaded.');
    const clean = K.clean, doc = K.newDoc('portrait'), { w, h } = K.pageSize(doc), M = 42;
    const INK = [20, 20, 20];
    const lines = filled(f);
    const pages = [];
    for (let i = 0; i < Math.max(1, lines.length); i += ROWS) pages.push(lines.slice(i, i + ROWS));
    const dotted = (x1, x2, y) => { doc.setLineDashPattern([0.6, 2.2], 0); doc.setLineWidth(0.6); doc.setDrawColor(60, 60, 60); doc.line(x1, y, x2, y); doc.setLineDashPattern([], 0); };
    const field = (label, value, y, x2) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor.apply(doc, INK); doc.text(label, M, y);
      const lx = M + doc.getTextWidth(label) + 3; dotted(lx, x2, y + 1.5);
      if (value) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(10, 40, 90); doc.text(doc.splitTextToSize(clean(value), x2 - lx - 4)[0], lx + 4, y - 1.5); doc.setTextColor.apply(doc, INK); }
    };
    pages.forEach((chunk, pi) => {
      if (pi) doc.addPage();
      let y = 52;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor.apply(doc, INK); doc.text('PURCHASE ORDER', w / 2, y, { align: 'center' });
      doc.setFont('times', 'normal'); doc.setFontSize(13); doc.text('SOUTHERN REGIONAL HEALTH AUTHORITY', w / 2, y + 18, { align: 'center' });
      // Number block (right)
      doc.setFont('courier', 'bold'); doc.setFontSize(20); doc.text(clean('No. ' + (f.poNumber || '_______')), w - M - 10, y + 50, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text('Purchase Order Number', w - M - 70, y + 64, { align: 'right' });
      if (pages.length > 1) { doc.setFontSize(8.5); doc.setTextColor(110, 110, 110); doc.text('Page ' + (pi + 1) + ' of ' + pages.length, w - M, 30, { align: 'right' }); doc.setTextColor.apply(doc, INK); }
      y += 98;
      const mid = 345;
      field('Supplier Name', f.supplierName, y, mid);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Purchase Order Date', mid + 14, y);
      doc.setLineWidth(0.6); doc.setDrawColor(60, 60, 60); doc.line(mid + 118, y + 1.5, w - M, y + 1.5);
      if (f.date) { doc.setFont('helvetica', 'bold'); doc.setTextColor(10, 40, 90); doc.text(clean(util.date(f.date)), mid + 122, y - 1.5); doc.setTextColor.apply(doc, INK); }
      y += 21; field('Supplier Address', f.address, y, mid);
      y += 21; field('Telephone Number', f.phone, y, mid);
      y += 21; field('Fax Number', f.fax, y, mid);
      y += 21; field('Email Address', f.email, y, mid);
      y += 21; field('Tax Registration Number', f.trn, y, mid);
      y += 22; doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.text('SPECIAL  INSTRUCTIONS:', M, y);
      y += 14; field('Date When Goods Are Required', f.requiredDate ? util.date(f.requiredDate) : '', y, mid);
      y += 21; field('Method of Delivery', f.deliveryMethod, y, mid);
      y += 21; field('Other', f.other, y, mid);
      y += 14;
      // Lines table
      const cols = [M, M + 82, M + 128, M + 352, M + 434, w - M];
      doc.setLineWidth(1.2); doc.setDrawColor(20, 20, 20); doc.line(M, y, w - M, y);
      const rowH = 16, headH = 18, tTop = y;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      [['Quantity', 0], ['Code', 1], ['Description', 2], ['UNIT PRICE', 3], ['LINE TOTAL', 4]].forEach(([t, i]) => doc.text(t, (cols[i] + cols[i + 1]) / 2, y + 12.5, { align: 'center' }));
      y += headH; doc.setLineWidth(0.6); doc.line(M, y, w - M, y);
      doc.setFontSize(9); doc.text('$', (cols[3] + cols[4]) / 2, y + 12, { align: 'center' }); doc.text('$', (cols[4] + cols[5]) / 2, y + 12, { align: 'center' });
      y += rowH; doc.line(M, y, w - M, y);
      for (let r = 0; r < ROWS; r++) {
        const l = chunk[r];
        if (l) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(10, 40, 90);
          if (l.qty !== '' && l.qty !== null) doc.text(clean(String(l.qty)), (cols[0] + cols[1]) / 2, y + 12, { align: 'center' });
          if (l.code) doc.text(doc.splitTextToSize(clean(l.code), cols[2] - cols[1] - 6)[0], cols[1] + 3, y + 12);
          doc.text(doc.splitTextToSize(clean(l.description || ''), cols[3] - cols[2] - 8)[0] || '', cols[2] + 4, y + 12);
          if (l.unitPrice !== '' && l.unitPrice !== null) doc.text(clean(util.money(l.unitPrice).replace(/^\$/, '')), cols[4] - 4, y + 12, { align: 'right' });
          if (lineTotal(l)) doc.text(clean(util.money(lineTotal(l)).replace(/^\$/, '')), cols[5] - 4, y + 12, { align: 'right' });
          doc.setTextColor.apply(doc, INK);
        }
        y += rowH; doc.setLineWidth(0.5); doc.line(M, y, w - M, y);
      }
      doc.setLineWidth(0.6); [1, 2, 3, 4].forEach(i => doc.line(cols[i], tTop, cols[i], y)); doc.line(M, tTop, M, y); doc.line(w - M, tTop, w - M, y);
      // Total
      y += 20; doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text('TOTAL', cols[4] - 26, y, { align: 'right' }); doc.setFontSize(15); doc.text('$', cols[4] - 10, y + 1, { align: 'right' });
      doc.setLineWidth(0.6); doc.line(cols[4], y + 3, w - M, y + 3);
      if (pi === pages.length - 1) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(10, 40, 90); doc.text(clean(util.money(total(f)).replace(/^\$/, '')), w - M - 4, y, { align: 'right' }); doc.setTextColor.apply(doc, INK); }
      else { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.text('continued', w - M - 4, y, { align: 'right' }); }
      // Signatures
      y += 36;
      const sig = (x1, x2, label, name, yy) => { doc.setLineWidth(0.6); doc.line(x1, yy, x2, yy); if (name) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(10, 40, 90); doc.text(clean(name), x1 + 4, yy - 4); doc.setTextColor.apply(doc, INK); } doc.setFont('helvetica', 'italic'); doc.setFontSize(12); doc.text(label, x1, yy + 15); };
      sig(M, 300, 'Prepared by', f.preparedBy, y); sig(330, w - M, 'Authorized by', f.authorizedBy, y);
      y += 34; sig(M, 300, 'Date', f.preparedDate ? util.date(f.preparedDate) : '', y); sig(330, w - M, 'Date', f.authorizedDate ? util.date(f.authorizedDate) : '', y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
      doc.text('Government of Jamaica - Preparation and Issue of Purchase Orders', M, h - 22);
      doc.text(clean(store.settings().org.hospital + ' - prepared in the Procurement Management System'), w - M, h - 22, { align: 'right' });
      doc.setTextColor.apply(doc, INK);
    });
    doc.setProperties({ title: 'Purchase Order ' + (f.poNumber || 'draft'), creator: 'Procurement Management System' });
    return K.deliver(doc, 'Purchase Order ' + K.fileSafe(f.poNumber || 'DRAFT') + (f.supplierName ? ' - ' + K.fileSafe(f.supplierName).replace(/[.\s]+$/, '') : '') + '.pdf', output || 'save');
  }

  /* ------------------------------------------------------------ save to the system */
  function bookFor(poNumber) {
    const n = Number(String(poNumber || '').replace(/\D/g, ''));
    return n ? store.list('poBooks').find(b => n >= Number(b.firstSerial) && n <= Number(b.lastSerial)) || null : null;
  }
  async function saveForm(f) {
    const errs = [];
    if (!f.supplierName.trim()) errs.push('the supplier name');
    if (!f.date) errs.push('the purchase order date');
    if (!filled(f).length) errs.push('at least one line');
    if (errs.length) { ui.toast('Please enter ' + errs.join(', ') + '.', 'warning'); return null; }
    const dupe = f.poNumber && store.find('purchaseOrders', p => p.poNumber === f.poNumber.trim() && p.id !== f.id);
    if (dupe && !await ui.confirm('PO <b>' + esc(f.poNumber) + '</b> is already on file for <b>' + esc(dupe.supplierName || '') + '</b> (' + util.money(dupe.total) + '). Save this form over it?', { ok: 'Replace it', danger: true })) return null;
    const sup = domain.ensureSupplier(f.supplierName.trim());
    // Fill in the supplier's file from the form where it is blank there.
    const patch = { id: sup.id }; [['address', 'address'], ['phone', 'phone'], ['fax', 'fax'], ['email', 'email'], ['trn', 'trn']].forEach(([a, b]) => { if (f[a] && !sup[b]) patch[b] = f[a]; });
    if (Object.keys(patch).length > 1) store.upsert('suppliers', patch);
    const items = filled(f).map(l => ({ qty: num(l.qty) || 1, code: String(l.code || '').trim(), description: String(l.description || '').trim() || 'Item', unit: '', unitPrice: num(l.unitPrice), total: lineTotal(Object.assign({}, l, { qty: num(l.qty) || 1 })) }));
    const tot = util.round2(util.sum(items, i => i.total));
    const book = bookFor(f.poNumber);
    const existing = f.id ? store.get('purchaseOrders', f.id) : (dupe || null);
    const rec = {
      poNumber: f.poNumber.trim(), date: f.date, supplierId: sup.id, supplierName: sup.name, description: items[0].description + (items.length > 1 ? ' and ' + (items.length - 1) + ' more' : ''),
      items, subtotal: tot, gct: 0, total: tot, requiredDate: f.requiredDate, deliveryMethod: f.deliveryMethod, otherInstructions: f.other, instructions: f.other,
      supplierSnapshot: { address: f.address, phone: f.phone, fax: f.fax, email: f.email, trn: f.trn },
      preparedBy: f.preparedBy, preparedDate: f.preparedDate, authorizedBy: f.authorizedBy, authorizedDate: f.authorizedDate, expectedDate: f.requiredDate || undefined
    };
    if (book) { rec.bookId = book.id; rec.bookNo = book.bookNo; }
    let saved;
    if (existing) saved = store.upsert('purchaseOrders', Object.assign({ id: existing.id }, rec, rec.poNumber && existing.status === 'Draft' ? { status: 'Issued', issuedAt: f.date } : {}));
    else {
      saved = store.upsert('purchaseOrders', Object.assign(rec, { source: book ? 'book' : 'form', status: rec.poNumber ? 'Issued' : 'Draft', issuedAt: rec.poNumber ? f.date : undefined, deliveryAddress: store.settings().org.deliveryAddress }));
      if (saved.status === 'Issued') domain.afterIssue(saved);
    }
    domain.refreshOrderStatus(saved.id);
    Proc.audit(existing ? 'Edit PO (form)' : 'Create PO (form)', 'PO ' + (saved.poNumber || 'draft') + ' — ' + saved.supplierName + ' — ' + util.money(saved.total) + (book ? ' (Book ' + book.bookNo + ')' : ''), saved.id);
    return saved;
  }

  /* ------------------------------------------------------------ page */
  const CSS = '.gf-wrap{display:flex;justify-content:center}' +
    '.gf-sheet{width:100%;max-width:880px;background:#fff;color:#151515;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.08),0 18px 46px rgba(15,35,60,.16);padding:34px 40px 26px;font-family:Arial,Helvetica,sans-serif;position:relative}' +
    '[data-theme="dark"] .gf-sheet{box-shadow:0 0 0 1px #2b3a4f,0 18px 46px rgba(0,0,0,.5)}' +
    '.gf-sheet h2{text-align:center;font-size:27px;font-weight:800;letter-spacing:.01em;margin:0}.gf-sheet .auth{text-align:center;font-family:"Times New Roman",Times,serif;font-size:18px;letter-spacing:.04em;margin-top:2px}' +
    '.gf-no{display:flex;flex-direction:column;align-items:flex-end;margin-top:12px}.gf-no .n{display:flex;align-items:baseline;gap:10px;font-family:"Courier New",Courier,monospace;font-weight:700;font-size:30px}' +
    '.gf-no input{font:inherit;width:190px;border:0;border-bottom:1.5px dashed #9aa4b2;background:transparent;color:#a10d0d;padding:0 2px;outline:none}.gf-no input:focus{border-bottom-color:#0b5c8e}.gf-no .cap{font-size:14px;margin-right:46px}' +
    '.gf-top{display:grid;grid-template-columns:1.55fr 1fr;gap:6px 26px;margin-top:22px}.gf-f{display:flex;align-items:flex-end;gap:6px;font-size:14.5px;min-height:30px}.gf-f label{white-space:nowrap}' +
    '.gf-f input{flex:1;min-width:0;border:0;border-bottom:1.5px dotted #6b7280;background:transparent;font:inherit;font-weight:600;color:#0a285a;padding:2px 4px;outline:none}.gf-f input:focus{border-bottom:1.5px solid #0b5c8e;background:#f2f8fd}' +
    '.gf-f.solid input{border-bottom-style:solid}.gf-spec{font-size:14.5px;margin-top:10px}' +
    '.gf-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}.gf-table th{font-weight:400;padding:6px 4px;border-bottom:1px solid #222}.gf-table thead tr:first-child th{border-top:2px solid #222}' +
    '.gf-table td{border-bottom:1px solid #444;padding:0;height:30px}.gf-table td+td,.gf-table th+th{border-left:1px solid #444}.gf-table input{width:100%;height:30px;border:0;background:transparent;font:inherit;color:#0a285a;padding:0 6px;outline:none}' +
    '.gf-table input:focus{background:#eef6fd}.gf-table .r{text-align:right}.gf-table .c{text-align:center}.gf-table .lt{text-align:right;padding-right:6px;color:#0a285a;font-weight:600;font-variant-numeric:tabular-nums}.gf-table .cur td{height:22px;text-align:center;font-size:13px;color:#333}' +
    '.gf-total{display:flex;justify-content:flex-end;align-items:flex-end;gap:10px;margin-top:10px;font-size:15px}.gf-total b{min-width:160px;border-bottom:1.5px solid #222;text-align:right;font-size:16px;color:#0a285a;padding:0 6px 2px}.gf-total .d{font-size:24px;line-height:1}' +
    '.gf-sign{display:grid;grid-template-columns:1fr 1fr;gap:18px 48px;margin-top:30px}.gf-sign .s input{width:100%;border:0;border-bottom:1.5px solid #333;background:transparent;font:inherit;font-weight:600;color:#0a285a;padding:3px 4px;outline:none}' +
    '.gf-sign .s label{display:block;font-style:italic;font-size:17px;margin-top:3px;color:#222}.gf-foot{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:#444;margin-top:20px}' +
    '.gf-bar{position:sticky;top:calc(var(--topbar-h) + 8px);z-index:4;display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:16px;box-shadow:var(--shadow-sm)}' +
    '@media (max-width:760px){.gf-sheet{padding:22px 14px}.gf-top{grid-template-columns:1fr}.gf-sign{grid-template-columns:1fr}.gf-table{font-size:12.5px}.gf-hide-sm{display:none}.gf-no .n{font-size:22px}.gf-no input{width:140px}}';

  function render(el, params) {
    if (!document.getElementById('gfCss')) document.head.insertAdjacentHTML('beforeend', '<style id="gfCss">' + CSS + '</style>');
    const id = params && params[0];
    const po = id ? store.get('purchaseOrders', id) : null;
    const q = router.parse().query || {};
    let f = po ? fromPO(po) : (readDraft() || blank());
    if (!po && q.book) { const b = store.get('poBooks', q.book); if (b && !f.poNumber) f.poNumber = q.serial || ''; }
    const sups = ui.supplierDatalist ? ui.supplierDatalist() : '';
    const inp = (k, o) => '<input data-k="' + k + '" value="' + esc(f[k] || '') + '"' + (o && o.type ? ' type="' + o.type + '"' : '') + (o && o.list ? ' list="' + o.list + '"' : '') + ' autocomplete="off">';
    el.innerHTML = ui.pageHead({
      title: 'Digital PO Form', back: po ? { label: 'PO ' + (po.poNumber || 'draft'), href: '#/orders/' + po.id } : { label: 'Purchase orders', href: '#/orders' },
      sub: 'The Government of Jamaica purchase order form, typed on screen. Save it to the system, then download the PDF in the same layout.'
    }) +
      '<div class="gf-bar"><div class="small muted" id="gfState">' + (po ? 'Editing PO ' + esc(po.poNumber || 'draft') + ' · ' + esc(po.status) : 'New purchase order — your typing is kept on this computer until you save.') + '</div>' +
      '<div class="row" style="gap:8px">' + (po ? '' : '<button class="btn ghost" data-a="clear">' + ui.icon('x', 'sm') + 'Clear form</button>') +
      '<button class="btn" data-a="pdf">' + ui.icon('download', 'sm') + 'Download PDF</button><button class="btn primary" data-a="save">' + ui.icon('check', 'sm') + (po ? 'Save changes' : 'Save purchase order') + '</button></div></div>' +
      '<div class="gf-wrap"><form class="gf-sheet" autocomplete="off" onsubmit="return false">' +
      '<h2>PURCHASE ORDER</h2><div class="auth">SOUTHERN REGIONAL HEALTH AUTHORITY</div>' +
      '<div class="gf-no"><div class="n">No. ' + inp('poNumber') + '</div><div class="cap">Purchase Order Number</div><div class="small" id="gfBook" style="margin-right:46px;color:#5b6573"></div></div>' +
      '<div class="gf-top">' +
      '<div class="gf-f"><label>Supplier Name</label>' + inp('supplierName', { list: sups }) + '</div><div class="gf-f solid"><label>Purchase Order Date</label>' + inp('date', { type: 'date' }) + '</div>' +
      '<div class="gf-f"><label>Supplier Address</label>' + inp('address') + '</div><div></div>' +
      '<div class="gf-f"><label>Telephone Number</label>' + inp('phone') + '</div><div></div>' +
      '<div class="gf-f"><label>Fax Number</label>' + inp('fax') + '</div><div></div>' +
      '<div class="gf-f"><label>Email Address</label>' + inp('email', { type: 'email' }) + '</div><div></div>' +
      '<div class="gf-f"><label>Tax Registration Number</label>' + inp('trn') + '</div><div></div>' +
      '<div class="gf-spec">SPECIAL INSTRUCTIONS:</div><div></div>' +
      '<div class="gf-f"><label>Date When Goods Are Required</label>' + inp('requiredDate', { type: 'date' }) + '</div><div></div>' +
      '<div class="gf-f"><label>Method of Delivery</label>' + inp('deliveryMethod', { list: 'gfDel' }) + '</div><div></div>' +
      '<div class="gf-f"><label>Other</label>' + inp('other') + '</div><div></div></div>' +
      '<datalist id="gfDel"><option value="Supplier to deliver to the hospital"><option value="Collection by hospital transport"><option value="Courier"><option value="Delivery to General Stores"></datalist>' +
      '<table class="gf-table"><colgroup><col style="width:13%"><col style="width:10%"><col><col style="width:14%"><col style="width:15%"></colgroup>' +
      '<thead><tr><th>Quantity</th><th>Code</th><th>Description</th><th>UNIT PRICE</th><th>LINE TOTAL</th></tr></thead><tbody><tr class="cur"><td></td><td></td><td></td><td>$</td><td>$</td></tr>' +
      f.lines.map((l, i) => '<tr data-i="' + i + '"><td><input class="c" inputmode="decimal" data-l="qty" value="' + esc(l.qty) + '" aria-label="Quantity line ' + (i + 1) + '"></td><td><input data-l="code" value="' + esc(l.code) + '" aria-label="Code line ' + (i + 1) + '"></td>' +
        '<td><input data-l="description" value="' + esc(l.description) + '" aria-label="Description line ' + (i + 1) + '"></td><td><input class="r" inputmode="decimal" data-l="unitPrice" value="' + esc(l.unitPrice) + '" aria-label="Unit price line ' + (i + 1) + '"></td><td class="lt" data-lt>' + (lineTotal(l) ? util.money(lineTotal(l)).replace(/^\$/, '') : '') + '</td></tr>').join('') +
      '</tbody></table><div class="row between" style="margin-top:8px"><button type="button" class="btn sm" data-a="row">' + ui.icon('plus', 'sm') + 'Add line</button>' +
      '<div class="gf-total"><span>TOTAL</span><span class="d">$</span><b id="gfTotal">' + (total(f) ? util.money(total(f)).replace(/^\$/, '') : '') + '</b></div></div>' +
      '<div class="small" id="gfWords" style="text-align:right;color:#5b6573;margin-top:4px">' + (total(f) ? esc(domain.amountWords(total(f))) : '') + '</div>' +
      '<div class="gf-sign"><div class="s">' + inp('preparedBy') + '<label>Prepared by</label></div><div class="s">' + inp('authorizedBy') + '<label>Authorized by</label></div>' +
      '<div class="s">' + inp('preparedDate', { type: 'date' }) + '<label>Date</label></div><div class="s">' + inp('authorizedDate', { type: 'date' }) + '<label>Date</label></div></div>' +
      '<div class="gf-foot"><span>Government of Jamaica – Preparation and Issue of Purchase Orders</span><span class="gf-hide-sm">' + esc(store.settings().org.hospital) + '</span></div>' +
      '</form></div>';

    const sheet = el.querySelector('.gf-sheet');
    const persist = util.debounce(() => { if (!po) writeDraft(f); }, 300);
    const refreshTotals = () => {
      sheet.querySelectorAll('tbody tr[data-i]').forEach(tr => { const l = f.lines[+tr.dataset.i]; tr.querySelector('[data-lt]').textContent = lineTotal(l) ? util.money(lineTotal(l)).replace(/^\$/, '') : ''; });
      const t = total(f); el.querySelector('#gfTotal').textContent = t ? util.money(t).replace(/^\$/, '') : ''; el.querySelector('#gfWords').textContent = t ? domain.amountWords(t) : '';
    };
    const bookHint = () => { const b = bookFor(f.poNumber); el.querySelector('#gfBook').textContent = f.poNumber ? (b ? 'From PO Book ' + b.bookNo + ' (' + b.firstSerial + '–' + b.lastSerial + ')' : 'Not in a registered PO book') : 'Leave blank to save as a draft'; };
    bookHint();
    sheet.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.k) { f[t.dataset.k] = t.value; if (t.dataset.k === 'poNumber') bookHint(); }
      if (t.dataset.l) { f.lines[+t.closest('tr').dataset.i][t.dataset.l] = t.value; refreshTotals(); }
      persist();
    });
    // Choosing a known supplier fills in the address, numbers and TRN from their file.
    sheet.querySelector('[data-k=supplierName]').addEventListener('change', e => {
      const s = domain.findSupplier ? domain.findSupplier(e.target.value) : null; if (!s) return;
      [['address', 'address'], ['phone', 'phone'], ['fax', 'fax'], ['email', 'email'], ['trn', 'trn']].forEach(([a, b]) => { if (!f[a] && s[b]) { f[a] = s[b]; sheet.querySelector('[data-k=' + a + ']').value = s[b]; } });
      persist();
    });
    // Enter moves down the column, like a paper form.
    sheet.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.dataset.l) return;
      e.preventDefault(); const tr = e.target.closest('tr'), next = tr.nextElementSibling;
      const col = e.target.dataset.l; const target = next ? next.querySelector('[data-l=' + col + ']') : null; if (target) target.focus();
    });
    el.querySelector('[data-a=row]').onclick = () => { f.lines.push({ qty: '', code: '', description: '', unitPrice: '' }); persist(); render(el, params); };
    el.querySelector('[data-a=pdf]').onclick = () => {
      if (!filled(f).length && !f.supplierName) return ui.toast('Fill in the form first.', 'warning');
      try { gojPdf(f, 'save'); Proc.audit('Download PO form', 'PO ' + (f.poNumber || 'draft') + ' — ' + (f.supplierName || '')); } catch (err) { ui.toast(err.message, 'error'); }
    };
    el.querySelector('[data-a=save]').onclick = async () => {
      const saved = await saveForm(f); if (!saved) return;
      clearDraft();
      ui.toast('PO ' + (saved.poNumber || '(draft)') + ' saved' + (saved.bookNo ? ' in PO Book ' + saved.bookNo : '') + ' — you can download the PDF now.', 'success', 6000);
      router.go('po-form/' + saved.id);
    };
    const clr = el.querySelector('[data-a=clear]');
    if (clr) clr.onclick = async () => { if (!await ui.confirm('Clear everything typed on this form?', { ok: 'Clear', danger: true })) return; clearDraft(); render(el, params); };
  }

  Proc.pdf.gojPurchaseOrder = (po, output) => gojPdf(fromPO(po), output);
  Proc.page({ id: 'po-form', title: 'Digital PO Form', icon: 'file', section: 'Workflow', order: 46, render });
})();
