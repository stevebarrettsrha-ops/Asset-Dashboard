/* ==========================================================================
   Requisition Form (#/req-form, #/req-form/<requisitionId>) — the SRHA
   "Purchase Requisition / Justification Form" (Public Procurement Unit) on
   screen, with the Ministry and SRHA logos, saved as a requisition and
   downloadable as a 2-page PDF in the same layout.
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc, num = util.num;
  const ROWS = 6;
  const DRAFT_KEY = 'procReqFormDraft';
  const SUPPORT = ['Terms of Reference (TOR)', 'Description of Services', 'Scope of Work', 'Signed Technical Specifications'];
  const CLASSES = ['Goods', 'Works', 'Services', 'Consulting Services', 'Medical Supplies', 'Pharmaceuticals', 'Laboratory Supplies', 'Equipment', 'Furniture', 'Food & Grocery Items', 'Stationery', 'Cleaning & Janitorial', 'Maintenance & Repairs'];
  const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; } };
  const writeDraft = d => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) { /* convenience only */ } };
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } };
  const EMBED = 'MPHREQ1:';
  const b64 = str => btoa(unescape(encodeURIComponent(str)));
  const unb64 = str => decodeURIComponent(escape(atob(str)));
  const blankLine = () => ({ stock: '', qty: '', unit: '', description: '', decision: '' });

  function blank() {
    const S = store.settings();
    return { id: null, number: '', facility: S.org.hospital || 'May Pen Hospital', department: '', date: util.today(), classification: '', to: 'Public Procurement Unit',
      lines: Array.from({ length: ROWS }, blankLine), estimate: '', justification: '', funding: '',
      requestedBy: '', requestedDate: util.today(), supervisor: '', supervisorDate: '', hod: '', hodDate: '',
      totalCost: '', supplier: '', approvedBy: '', approvedDate: '', support: [] };
  }
  function fromReq(r) {
    const f = blank(), fx = r.form || {};
    Object.assign(f, {
      id: r.id, number: r.number || '', department: r.department || '', date: r.date || f.date, classification: fx.classification || r.type || '', facility: fx.facility || f.facility, to: fx.to || f.to,
      estimate: r.estimate ? String(r.estimate) : '', justification: r.justification || '', funding: fx.funding || r.budgetLine || '',
      requestedBy: r.requestedBy || '', requestedDate: fx.requestedDate || r.date || '', supervisor: fx.supervisor || '', supervisorDate: fx.supervisorDate || '', hod: fx.hod || '', hodDate: fx.hodDate || '',
      totalCost: fx.totalCost || '', supplier: fx.supplier || '', approvedBy: fx.approvedBy || '', approvedDate: fx.approvedDate || '', support: fx.support || []
    });
    const items = (r.items || []).map(i => ({ stock: i.stockBalance === undefined ? '' : i.stockBalance, qty: i.qty === undefined ? '' : i.qty, unit: i.unit || '', description: [i.description, i.spec].filter(Boolean).join(' — '), decision: i.decision || '' }));
    f.lines = items.concat(Array.from({ length: Math.max(0, ROWS - items.length) }, blankLine));
    return f;
  }
  const filled = f => f.lines.filter(l => String(l.description || '').trim() || String(l.qty || '').trim());

  /* ------------------------------------------------------------ PDF */
  function reqPdf(f, output) {
    const K = Proc.pdf && Proc.pdf.kit; if (!K) throw new Error('The PDF engine is not loaded.');
    const clean = K.clean, A = Proc.assets || {}, doc = K.newDoc('portrait'), { w } = K.pageSize(doc);
    const BLUE = [22, 84, 133], TEAL = [12, 90, 110], INK = [20, 20, 20], FILL = [10, 40, 90];
    const L = 40, R = w - 40;
    const head = () => {
      if (A.mohwLogo) doc.addImage(A.mohwLogo, 'PNG', 36, 14, 118, 118 / (A.mohwLogoRatio || 2.957), 'mohw', 'FAST');
      if (A.srhaLogo) doc.addImage(A.srhaLogo, 'PNG', w - 36 - 64, 12, 64, 64 / (A.srhaLogoRatio || 1.21), 'srha', 'FAST');
      doc.setFont('times', 'bold'); doc.setFontSize(18); doc.setTextColor.apply(doc, BLUE); doc.text('Southern Regional Health Authority', w / 2 + 12, 34, { align: 'center' });
      doc.setFontSize(10); doc.setTextColor.apply(doc, TEAL); doc.text('Compassion | Accountability | Respect | Efficiency', w / 2 + 12, 52, { align: 'center' });
      doc.setFontSize(14.5); doc.setTextColor.apply(doc, BLUE); doc.text('Public Procurement Unit', w / 2 + 12, 72, { align: 'center' });
      doc.setTextColor.apply(doc, INK);
    };
    const val = (t, x, y, maxW) => { if (!t) return; doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, FILL); doc.text(doc.splitTextToSize(clean(t), maxW)[0] || '', x + 3, y - 2.5); doc.setTextColor.apply(doc, INK); };
    const line = (label, value, y, x0, x1) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, INK); doc.text(label, x0, y);
      const lx = x0 + doc.getTextWidth(label) + 4; doc.setLineWidth(0.6); doc.setDrawColor(30, 30, 30); doc.line(lx, y + 1.5, x1, y + 1.5); val(value, lx, y, x1 - lx - 4);
    };
    const box = (x, y, on) => { doc.setLineWidth(0.8); doc.setDrawColor(30, 30, 30); doc.rect(x, y, 14, 14); if (on) { doc.setLineWidth(1.6); doc.setDrawColor.apply(doc, FILL); doc.line(x + 3, y + 7.5, x + 6, y + 11); doc.line(x + 6, y + 11, x + 11.5, y + 3); } doc.setLineWidth(0.6); doc.setDrawColor(30, 30, 30); };
    const lines = filled(f);
    const chunks = []; for (let i = 0; i < Math.max(1, lines.length); i += 9) chunks.push(lines.slice(i, i + 9));
    chunks.forEach((chunk, ci) => {
      if (ci) doc.addPage();
      head();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.text('PURCHASE REQUISITION/JUSTIFICATION FORM' + (chunks.length > 1 ? ' (' + (ci + 1) + ' of ' + chunks.length + ')' : ''), w / 2 + 2, 104, { align: 'center' });
      if (f.number) { doc.setFontSize(8.5); doc.setTextColor(100, 100, 100); doc.text(clean('Ref: ' + f.number), R, 104, { align: 'right' }); doc.setTextColor.apply(doc, INK); }
      let y = 160;
      line('Facility:', f.facility, y, L, 320); y += 26;
      line('Department:', f.department, y, L, 320); y += 26;
      line('Date of Requisition:', f.date ? util.date(f.date) : '', y, L, 322); y += 26;
      line('Items Classification:', f.classification, y, L, 323); y += 24;
      line('To:', f.to, y, L, 330); y += 18;
      // Table
      const X = [52, 104, 167, 201, 390, 438, 488, 563], top = y, hH = 24, sH = 23, rH = 24;
      const rows = Math.max(ROWS, chunk.length);
      doc.setLineWidth(0.6); doc.setDrawColor(30, 30, 30);
      doc.setFillColor(217, 217, 217); doc.rect(X[4], top + hH, X[7] - X[4], sH, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, INK);
      doc.text('STOCK', (X[0] + X[1]) / 2, top + 10, { align: 'center' }); doc.text('BALANCE', (X[0] + X[1]) / 2, top + 20, { align: 'center' });
      doc.text('QUANTITY', (X[1] + X[2]) / 2, top + 10, { align: 'center' }); doc.text('U/M', (X[2] + X[3]) / 2, top + 10, { align: 'center' });
      doc.text('ITEM DESCRIPTION/SPECIFICATION', X[3] + 18, top + 10); doc.text('For Procurement use only', (X[4] + X[7]) / 2, top + 10, { align: 'center' });
      doc.setFontSize(8.5); doc.text('Yes', (X[4] + X[5]) / 2, top + hH + 11, { align: 'center' }); doc.text('No', (X[5] + X[6]) / 2, top + hH + 11, { align: 'center' }); doc.text('Deferred', (X[6] + X[7]) / 2 + 10, top + hH + 11, { align: 'center' });
      const bottom = top + hH + sH + rows * rH;
      doc.rect(X[0], top, X[7] - X[0], bottom - top);
      [1, 2, 3, 4].forEach(i => doc.line(X[i], top, X[i], bottom));
      [5, 6].forEach(i => doc.line(X[i], top + hH, X[i], bottom));
      doc.line(X[4], top + hH, X[7], top + hH); doc.line(X[0], top + hH + sH, X[7], top + hH + sH);
      for (let r = 0; r < rows; r++) {
        const yy = top + hH + sH + r * rH; if (r) doc.line(X[0], yy, X[7], yy);
        const l = chunk[r] || {};
        ['yes', 'no', 'deferred'].forEach((d, k) => box((X[4 + k] + X[5 + k]) / 2 - 7 + (k === 2 ? 0 : 0), yy + 5, l.decision === d));
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, FILL);
        if (l.stock !== undefined && l.stock !== '') doc.text(clean(String(l.stock)), (X[0] + X[1]) / 2, yy + 15, { align: 'center' });
        if (l.qty !== undefined && l.qty !== '') doc.text(clean(String(l.qty)), (X[1] + X[2]) / 2, yy + 15, { align: 'center' });
        if (l.unit) doc.text(doc.splitTextToSize(clean(l.unit), X[3] - X[2] - 4)[0], (X[2] + X[3]) / 2, yy + 15, { align: 'center' });
        if (l.description) { const d = doc.splitTextToSize(clean(l.description), X[4] - X[3] - 8).slice(0, 2); doc.setFontSize(d.length > 1 ? 7.6 : 9); doc.text(d, X[3] + 4, yy + (d.length > 1 ? 10 : 15)); }
        doc.setTextColor.apply(doc, INK);
      }
      y = bottom + 34;
      if (ci === chunks.length - 1) {
        line('Estimate:', f.estimate ? util.money(num(f.estimate)) : '', y, L, R); y += 26;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.text('Justification:', L, y);
        const jx = L + doc.getTextWidth('Justification:') + 4;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        const jl = doc.splitTextToSize(clean(f.justification || ''), R - L - 8);
        const firstW = R - jx - 6; const firstLine = doc.splitTextToSize(clean(f.justification || ''), firstW)[0] || '';
        const rest = doc.splitTextToSize(clean((f.justification || '').slice(firstLine.length).trim()), R - L - 8);
        doc.setLineWidth(0.6); doc.line(jx, y + 1.5, R, y + 1.5);
        if (firstLine) { doc.setTextColor.apply(doc, FILL); doc.text(firstLine, jx + 3, y - 2.5); }
        for (let i = 0; i < Math.max(10, rest.length); i++) { y += 15.5; doc.setDrawColor(30, 30, 30); doc.line(L, y + 1.5, R, y + 1.5); if (rest[i]) { doc.setTextColor.apply(doc, FILL); doc.text(rest[i], L + 3, y - 2.5); } }
        doc.setTextColor.apply(doc, INK); void jl;
        y += 28; line('Source of Funding:', f.funding, y, L, R);
      }
    });
    // Page 2: signatures, official use, supporting documents
    doc.addPage(); head();
    let y = 160;
    const pair = (lab, v, d, yy) => { line(lab, v, yy, L, 300); line('Date:', d ? util.date(d) : '', yy, 334, 448); };
    pair('Requested by:', f.requestedBy, f.requestedDate, y); y += 27;
    pair('Verified by (Supervisor):', f.supervisor, f.supervisorDate, y); y += 27;
    pair('Verified by (HOD):', f.hod, f.hodDate, y); y += 52;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.text('(For official use only)', 50, y); doc.setLineWidth(0.6); doc.line(50, y + 2, 50 + doc.getTextWidth('(For official use only)'), y + 2);
    y += 22; const bTop = y; doc.setLineWidth(1); doc.rect(L, bTop, 584 - L - 9, 92);
    y += 28; line('Total Cost $', f.totalCost ? util.money(num(f.totalCost)).replace(/^\$/, '') : '', y, 58, 324); line('Supplier/Contractor:', f.supplier, y, 366, 608 - 40);
    y += 30; line('Approved by:', f.approvedBy, y, 56, 324); line('Date:', f.approvedDate ? util.date(f.approvedDate) : '', y, 366, 610 - 40);
    y = bTop + 92 + 32;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(doc.splitTextToSize('N.B. - All requisition forms must be accompanied by one of the approved supporting documents listed below. Technical Specifications must be reviewed and approved by the end user and/or Biomed Technicians prior to submission. The procurement process will commence upon receipt of the requisite documents.', R - 50 - 14), 50, y);
    y += 56;
    SUPPORT.forEach(s => { box(L, y - 10, (f.support || []).indexOf(s) >= 0); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, INK); doc.text(s, L + 20, y + 1); y += 18; });
    // The typed answers travel inside the PDF so "Upload requisition form" can read them back exactly.
    const data = Object.assign({}, f); delete data.id;
    doc.setProperties({ title: 'Purchase Requisition ' + (f.number || ''), creator: 'Procurement Management System', keywords: EMBED + b64(JSON.stringify(data)) });
    const nm = 'Purchase Requisition ' + K.fileSafe(f.number || 'DRAFT') + (f.department ? ' - ' + K.fileSafe(f.department).replace(/[.\s]+$/, '') : '') + '.pdf';
    return K.deliver(doc, nm, output || 'save');
  }

  /* ------------------------------------------------------------ save */
  async function saveForm(f, submit, up) {
    const errs = [];
    if (!String(f.department || "").trim()) errs.push('the department');
    if (!f.date) errs.push('the date of requisition');
    if (!filled(f).length) errs.push('at least one item');
    if (!String(f.requestedBy || "").trim()) errs.push('who it is requested by');
    if (errs.length) { ui.toast('Please enter ' + errs.join(', ') + '.', 'warning'); return null; }
    return saveRecord(f, submit, up && up.how !== 'scan' ? { source: up.how === 'embedded' ? 'online-pdf' : 'pdf-upload' } : up ? { source: 'scan-upload' } : null);
  }
  /** Write a requisition from form values (no checks). extra: fields to add on a new record. */
  function saveRecord(f, submit, extra) {
    const items = filled(f).map(l => ({ id: util.uid('L'), description: String(l.description || '').trim() || 'Item', unit: String(l.unit || '').trim() || 'each', qty: num(l.qty) || 1, stockBalance: l.stock === '' || l.stock === undefined ? '' : num(l.stock), estUnitPrice: '', spec: '', decision: l.decision || '' }));
    if (!items.length) items.push({ id: util.uid('L'), description: 'See attached form', unit: 'each', qty: 1, estUnitPrice: '', spec: '' });
    const existing = f.id ? store.get('requisitions', f.id) : null;
    const rec = {
      date: f.date, department: String(f.department || "").trim(), requestedBy: String(f.requestedBy || "").trim(), title: items[0].description + (items.length > 1 ? ' and ' + (items.length - 1) + ' more' : ''),
      type: /work/i.test(f.classification) ? 'Works' : /service|consult/i.test(f.classification) ? 'Services' : 'Goods', category: f.classification,
      items, estimate: util.round2(num(f.estimate)), justification: f.justification, budgetLine: f.funding,
      form: { facility: f.facility, to: f.to, classification: f.classification, funding: f.funding, requestedDate: f.requestedDate, supervisor: f.supervisor, supervisorDate: f.supervisorDate, hod: f.hod, hodDate: f.hodDate, totalCost: f.totalCost, supplier: f.supplier, approvedBy: f.approvedBy, approvedDate: f.approvedDate, support: f.support }
    };
    if (existing) Object.assign(rec, { id: existing.id });
    else Object.assign(rec, { number: 'REQ-' + store.next('req'), priority: 'Normal', status: submit ? 'Submitted' : 'Draft', source: 'form' }, extra || {});
    if (existing && submit && existing.status === 'Draft') rec.status = 'Submitted';
    if (f.approvedBy && f.approvedDate && (!existing || ['Draft', 'Submitted'].indexOf(existing.status) >= 0)) rec.status = 'Approved';
    rec.form.requesterEmail = f.requesterEmail || ''; rec.form.requesterPhone = f.requesterPhone || '';
    const saved = store.upsert('requisitions', rec);
    Proc.audit(existing ? 'Edit Requisition (form)' : 'Create Requisition (form)', saved.number + ' — ' + saved.department + ' — ' + util.money(saved.estimate), saved.id);
    return saved;
  }

  /* ------------------------------------------------------------ page */
  const CSS = '.rf-wrap{display:flex;justify-content:center}' +
    '.rf-sheet,.rf-sheet *{box-sizing:border-box}.rf-sheet{width:100%;max-width:880px;background:#fff;color:#151515;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.08),0 18px 46px rgba(15,35,60,.16);padding:26px 44px 30px;font-family:"Franklin Gothic Book","Segoe UI",Arial,sans-serif;overflow:hidden}' +
    '[data-theme="dark"] .rf-sheet{box-shadow:0 0 0 1px #2b3a4f,0 18px 46px rgba(0,0,0,.5)}' +
    '.rf-head{display:grid;grid-template-columns:150px 1fr 90px;align-items:start;gap:10px}.rf-head img{max-width:100%;height:auto;display:block}.rf-head .r img{width:84px;margin-left:auto}' +
    '.rf-head .c{text-align:center;font-family:"Times New Roman",Times,serif;font-weight:700;color:#165485}.rf-head .c .a{font-size:26px;line-height:1.15}.rf-head .c .v{font-size:14px;color:#0c5a6e;margin-top:6px}.rf-head .c .u{font-size:21px;margin-top:6px}' +
    '.rf-title{text-align:center;font-size:17px;letter-spacing:.01em;margin:22px 0 34px}.rf-ref{float:right;font-size:12px;color:#6b7280}' +
    '.rf-f{display:flex;align-items:flex-end;gap:6px;font-size:15px;margin:0 0 14px;max-width:470px}.rf-f.wide{max-width:none}.rf-f label{white-space:nowrap}' +
    '.rf-f input,.rf-f select{flex:1;min-width:0;border:0;border-bottom:1.3px solid #222;background:transparent;font:inherit;font-weight:600;color:#0a285a;padding:2px 4px;outline:none;border-radius:0}.rf-f input:focus,.rf-f select:focus{background:#f2f8fd;border-bottom-color:#0b5c8e}' +
    '.rf-table{width:calc(100% - 22px);margin:14px 0 0 22px;border-collapse:collapse;font-size:13.5px}.rf-table th,.rf-table td{border:1px solid #222}.rf-table th{font-weight:400;padding:4px 6px;vertical-align:top;text-align:left}' +
    '.rf-table .sub th{background:#d9d9d9;font-size:13px;padding:6px}.rf-table td{height:37px;padding:0}.rf-table td input{width:100%;height:36px;border:0;background:transparent;font:inherit;color:#0a285a;padding:0 6px;outline:none}.rf-table td input:focus{background:#eef6fd}' +
    '.rf-table .ck{text-align:center}.rf-table .ck input{width:20px;height:20px;accent-color:#0a285a;cursor:pointer;vertical-align:middle}' +
    '.rf-just{margin-top:26px}.rf-just textarea{width:100%;min-height:240px;border:0;resize:vertical;font:inherit;font-size:15px;font-weight:600;color:#0a285a;line-height:29px;padding:0 4px;outline:none;background-image:linear-gradient(transparent 28px,#222 28px,#222 29px);background-size:100% 29px;background-attachment:local}' +
    '.rf-just textarea:focus{background-color:#f7fbfe}.rf-p2{border-top:2px dashed #c6ced8;margin-top:30px;padding-top:26px}' +
    '.rf-grid2{display:grid;grid-template-columns:1.45fr 1fr;gap:0 30px;max-width:640px}.rf-grid2 .rf-f{max-width:none}' +
    '.rf-off{display:inline-block;text-decoration:underline;font-size:15px;margin:22px 0 10px 14px}.rf-box{border:1.5px solid #222;padding:22px 22px 8px;display:grid;grid-template-columns:1fr 1fr;gap:4px 30px}.rf-box .rf-f{max-width:none;min-width:0}.rf-box>*{min-width:0}.rf-grid2>*{min-width:0}' +
    '.rf-nb{font-size:14px;line-height:1.45;margin:22px 0 18px 14px}.rf-support label{display:flex;align-items:center;gap:8px;font-size:15px;margin:2px 0;cursor:pointer}.rf-support input{width:16px;height:16px;accent-color:#0a285a}' +
    '.rf-bar{position:sticky;top:calc(var(--topbar-h) + 8px);z-index:4;display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:16px;box-shadow:var(--shadow-sm)}' +
    '@media (max-width:760px){' +
      '.rf-sheet{padding:16px 14px 20px;border-radius:10px}.rf-head{grid-template-columns:86px 1fr 52px;gap:6px}.rf-head .r img{width:50px}.rf-head .c .a{font-size:15px}.rf-head .c .v{font-size:9px}.rf-head .c .u{font-size:13px}' +
      '.rf-title{font-size:13px;margin:16px 0 18px}.rf-ref{float:none;display:block;text-align:center}' +
      '.rf-f{flex-direction:column;align-items:stretch;gap:0;font-size:12.5px;color:#4b5563;margin-bottom:10px;max-width:none}.rf-f input,.rf-f select{width:100%;font-size:16px;padding:6px 2px}' +
      '.rf-table,.rf-table tbody{display:block;width:100%;margin:10px 0 0;border:0}.rf-table thead{display:none}.rf-table tr{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 8px;border:1px solid #c9d1db;border-radius:10px;padding:10px;margin-top:10px;background:#fbfcfe}' +
      '.rf-table td{border:0!important;height:auto;display:flex;flex-direction:column;min-width:0}.rf-table td::before{content:attr(data-label);font-size:11px;color:#6b7280;margin-bottom:2px}.rf-table td.d{grid-column:1/-1;order:-1}' +
      '.rf-table td input{height:38px;border:1px solid #d5dce5!important;border-radius:7px;background:#fff;font-size:16px}.rf-table td.ck{flex-direction:row;align-items:center;gap:6px;justify-content:flex-start}.rf-table td.ck::before{margin:0}' +
      '.rf-table tr.blank~tr.blank{display:none}.rf-grid2,.rf-box{grid-template-columns:1fr}.rf-box{padding:14px}.rf-just textarea{font-size:16px}.rf-bar{position:static}.rf-bar .row{width:100%}.rf-bar .row .btn{flex:1}' +
    '}';

  function render(el, params, opts) {
    opts = opts || {};
    const pub = !!opts.public;
    if (!document.getElementById('rfCss')) document.head.insertAdjacentHTML('beforeend', '<style id="rfCss">' + CSS + '</style>');
    const id = !pub && params && params[0];
    const req = id ? store.get('requisitions', id) : null;
    const q = pub ? {} : (router.parse().query || {});
    const up = !pub && q.upload && Proc.reqForm.pending ? Proc.reqForm.pending : null;
    let f = req ? fromReq(req) : up ? Object.assign(blank(), up.f || {}) : (pub ? readPubDraft() : readDraft()) || blank();
    if (pub && opts.facility && !f.facility) f.facility = opts.facility;
    const off = pub ? ' disabled title="For Procurement use only"' : '';
    const A = Proc.assets || {};
    const inp = (k, o) => '<input data-k="' + k + '" value="' + esc(f[k] || '') + '"' + (pub && OFFICIAL.indexOf(k) >= 0 ? off : '') + (o && o.type ? ' type="' + o.type + '"' : '') + (o && o.list ? ' list="' + o.list + '"' : '') + (o && o.mode ? ' inputmode="' + o.mode + '"' : '') + ' autocomplete="off">';
    const row = (l, i) => '<tr data-i="' + i + '"><td data-label="Stock balance"><input inputmode="decimal" data-l="stock" value="' + esc(l.stock) + '" style="text-align:center"></td><td data-label="Quantity"><input inputmode="decimal" data-l="qty" value="' + esc(l.qty) + '" style="text-align:center"></td>' +
      '<td data-label="U/M"><input data-l="unit" list="dl-units" value="' + esc(l.unit) + '"></td><td class="d" data-label="Item description / specification"><input data-l="description" value="' + esc(l.description) + '"></td>' +
      ['yes', 'no', 'deferred'].map(d => '<td class="ck" data-label="' + d.charAt(0).toUpperCase() + d.slice(1) + '"><input type="checkbox" data-dec="' + d + '"' + (l.decision === d ? ' checked' : '') + (pub ? ' disabled' : '') + ' title="For Procurement use only" aria-label="' + d + ' line ' + (i + 1) + '"></td>').join('') + '</tr>';
    if (!document.getElementById('dl-units') && Proc.K && Proc.K.UNITS) document.body.insertAdjacentHTML('beforeend', '<datalist id="dl-units">' + Proc.K.UNITS.map(u => '<option value="' + esc(u) + '">').join('') + '</datalist>');
    const head = '<div class="rf-head"><div>' + (A.mohwLogo ? '<img src="' + A.mohwLogo + '" alt="Ministry of Health and Wellness">' : '') + '</div><div class="c"><div class="a">Southern Regional Health Authority</div><div class="v">Compassion | Accountability | Respect | Efficiency</div><div class="u">Public Procurement Unit</div></div><div class="r">' + (A.srhaLogo ? '<img src="' + A.srhaLogo + '" alt="Southern Regional Health Authority">' : '') + '</div></div>';
    function sheetHtml() {
      return '<form class="rf-sheet" autocomplete="off" onsubmit="return false">' + head +
      '<div class="rf-title">' + (f.number ? '<span class="rf-ref">Ref: ' + esc(f.number) + '</span>' : '') + 'PURCHASE REQUISITION/JUSTIFICATION FORM</div>' +
      '<div class="rf-f"><label>Facility:</label>' + inp('facility') + '</div>' +
      '<div class="rf-f"><label>Department:</label>' + inp('department', { list: 'rfDept' }) + '</div>' +
      '<div class="rf-f"><label>Date of Requisition:</label>' + inp('date', { type: 'date' }) + '</div>' +
      '<div class="rf-f"><label>Items Classification:</label>' + inp('classification', { list: 'rfClass' }) + '</div>' +
      '<div class="rf-f"><label>To:</label>' + inp('to') + '</div>' +
      '<datalist id="rfClass">' + CLASSES.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist><datalist id="rfDept"></datalist>' +
      '<table class="rf-table"><colgroup><col style="width:10%"><col style="width:11%"><col style="width:10%"><col><col style="width:9%"><col style="width:9%"><col style="width:14%"></colgroup>' +
      '<thead><tr><th>STOCK<br>BALANCE</th><th>QUANTITY</th><th>U/M</th><th>ITEM DESCRIPTION/SPECIFICATION</th><th colspan="3" style="text-align:center">For Procurement use only</th></tr>' +
      '<tr class="sub"><th style="background:#fff"></th><th style="background:#fff"></th><th style="background:#fff"></th><th style="background:#fff"></th><th style="text-align:center">Yes</th><th style="text-align:center">No</th><th style="text-align:center">Deferred</th></tr></thead><tbody>' +
      f.lines.map(row).join('') + '</tbody></table><div style="margin:8px 0 0 22px"><button type="button" class="btn sm" data-a="row">' + ui.icon('plus', 'sm') + 'Add line</button></div>' +
      '<div class="rf-f wide" style="margin-top:28px"><label>Estimate:</label>' + inp('estimate', { mode: 'decimal' }) + '</div>' +
      '<div class="rf-just"><div class="rf-f wide" style="margin:0"><label>Justification:</label></div><textarea data-k="justification" aria-label="Justification">' + esc(f.justification || '') + '</textarea></div>' +
      '<div class="rf-f wide" style="margin-top:18px"><label>Source of Funding:</label>' + inp('funding', { list: 'rfFund' }) + '</div>' +
      '<datalist id="rfFund"><option value="GOJ Recurrent Budget"><option value="SRHA Recurrent Budget"><option value="Capital Budget"><option value="NHF Grant"><option value="Donor Funds"><option value="Health Fees / Own Source"></datalist>' +
      '<div class="rf-p2"><div class="rf-grid2">' +
      '<div class="rf-f"><label>Requested by:</label>' + inp('requestedBy') + '</div><div class="rf-f"><label>Date:</label>' + inp('requestedDate', { type: 'date' }) + '</div>' +
      '<div class="rf-f"><label>Verified by (Supervisor):</label>' + inp('supervisor') + '</div><div class="rf-f"><label>Date:</label>' + inp('supervisorDate', { type: 'date' }) + '</div>' +
      '<div class="rf-f"><label>Verified by (HOD):</label>' + inp('hod') + '</div><div class="rf-f"><label>Date:</label>' + inp('hodDate', { type: 'date' }) + '</div></div>' +
      '<div class="rf-off">(For official use only)</div><div class="rf-box">' +
      '<div class="rf-f"><label>Total Cost $</label>' + inp('totalCost', { mode: 'decimal' }) + '</div><div class="rf-f"><label>Supplier/Contractor:</label>' + inp('supplier', { list: ui.supplierDatalist ? ui.supplierDatalist() : '' }) + '</div>' +
      '<div class="rf-f"><label>Approved by:</label>' + inp('approvedBy') + '</div><div class="rf-f"><label>Date:</label>' + inp('approvedDate', { type: 'date' }) + '</div></div>' +
      '<div class="rf-nb">N.B. - All requisition forms must be accompanied by one of the approved supporting documents listed below. Technical Specifications must be reviewed and approved by the end user and/or Biomed Technicians prior to submission. The procurement process will commence upon receipt of the requisite documents.</div>' +
      '<div class="rf-support">' + SUPPORT.map(s => '<label><input type="checkbox" data-sup="' + esc(s) + '"' + ((f.support || []).indexOf(s) >= 0 ? ' checked' : '') + '> ' + esc(s) + '</label>').join('') + '</div></div>' +
      '</form>';
    }
    const bar = pub
      ? '<div class="rf-bar"><div class="small muted">Your typing is kept on this device until you submit.</div><div class="row" style="gap:8px"><button class="btn" data-a="pdf">' + ui.icon('download', 'sm') + 'Download PDF</button>' +
        (opts.endpoint ? '<button class="btn primary" data-a="send">' + ui.icon('send', 'sm') + 'Submit to Procurement</button>' : '') + '</div></div>' +
        '<div class="card mb-3"><div class="card-b"><div class="form-grid"><div class="field s6"><label>Your email <span class="muted">(for a reply)</span></label><input class="input" data-c="email" type="email" value="' + esc(f.requesterEmail || '') + '"></div>' +
        '<div class="field s6"><label>Your phone / extension</label><input class="input" data-c="phone" value="' + esc(f.requesterPhone || '') + '"></div></div>' +
        (opts.endpoint ? '' : '<div class="alert info mt-2">' + ui.icon('info') + '<div>When you are done, press <b>Download PDF</b> and email or hand the PDF to the Procurement Unit. They upload it and every line you typed is read in automatically.</div></div>') + '</div></div>'
      : (up ? '<div class="alert ' + (up.how === 'scan' ? 'warning' : 'success') + ' mb-3">' + ui.icon(up.how === 'scan' ? 'clip' : 'check') + '<div><div class="t">' + (up.how === 'scan' ? 'Attached ' + esc(up.file.name) + ' — type the details from it' : 'Read from ' + esc(up.file.name) + ' — check the details and save') + '</div>' +
        (up.how === 'acroform' ? 'Filled in with Adobe Reader / a PDF app. ' : up.how === 'embedded' ? 'Completed on the online requisition page. ' : 'A scan or photo cannot be read automatically. ') + 'The file is attached to the requisition when you save. <a href="#" data-a="view">View the file</a></div></div>' : '');
    if (pub) {
      el.innerHTML = bar + '<div class="rf-wrap">' + sheetHtml() + '</div>';
    } else el.innerHTML = ui.pageHead({
      title: 'Requisition Form', back: req ? { label: req.number || 'Requisition', href: '#/requisitions/' + req.id } : { label: 'Requisitions', href: '#/requisitions' },
      sub: 'The SRHA Purchase Requisition / Justification Form, typed on screen. Save it as a requisition, then download the PDF in the same layout.'
    }) +
      bar + '<div class="rf-bar"><div class="small muted">' + (req ? 'Editing ' + esc(req.number || '') + ' · ' + esc(req.status) : 'New requisition — your typing is kept on this computer until you save.') + '</div><div class="row" style="gap:8px">' +
      (req ? '' : '<button class="btn ghost" data-a="clear">' + ui.icon('x', 'sm') + 'Clear</button>') + '<button class="btn" data-a="pdf">' + ui.icon('download', 'sm') + 'Download PDF</button>' +
      (req ? '<button class="btn primary" data-a="save">' + ui.icon('check', 'sm') + 'Save changes</button>' : '<button class="btn" data-a="draft">Save draft</button><button class="btn primary" data-a="submit">' + ui.icon('send', 'sm') + 'Save &amp; submit</button>') + '</div></div>' +
      (up ? '' : '') + '<div class="rf-wrap">' + sheetHtml() + '</div>';

    const sheet = el.querySelector('.rf-sheet');
    // Hospital departments from Location Records, when available
    try { const dl = el.querySelector('#rfDept'); const s = document.createElement('select'); if (typeof window.mphPopulateDeptSelect === 'function') { window.mphPopulateDeptSelect(s, {}); dl.innerHTML = Array.from(s.options).filter(o => o.value).map(o => '<option value="' + esc(o.value) + '">').join(''); } } catch (e) { /* optional */ }
    el.dataset.sent = '';
    const persist = util.debounce(() => { if (el.dataset.sent) return; if (pub) writePubDraft(f); else if (!req && !up) writeDraft(f); }, 300);
    el.querySelectorAll('[data-c]').forEach(i => i.oninput = () => { f[i.dataset.c === 'email' ? 'requesterEmail' : 'requesterPhone'] = i.value.trim(); persist(); });
    const markBlank = () => sheet.querySelectorAll('tbody tr[data-i]').forEach(tr => { const l = f.lines[+tr.dataset.i]; const empty = !['stock', 'qty', 'unit', 'description'].some(k => String(l[k] || '').trim()) && !l.decision; tr.classList.toggle('blank', empty && !tr.classList.contains('opened')); });
    markBlank();
    sheet.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.k) f[t.dataset.k] = t.value;
      if (t.dataset.l) { f.lines[+t.closest('tr').dataset.i][t.dataset.l] = t.value; markBlank(); }
      persist();
    });
    sheet.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.dec) { const tr = t.closest('tr'), l = f.lines[+tr.dataset.i]; l.decision = t.checked ? t.dataset.dec : ''; tr.querySelectorAll('[data-dec]').forEach(c => { if (c !== t) c.checked = false; }); persist(); }
      if (t.dataset.sup) { f.support = Array.from(sheet.querySelectorAll('[data-sup]:checked')).map(c => c.dataset.sup); persist(); }
    });
    sheet.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.l) { e.preventDefault(); const n = e.target.closest('tr').nextElementSibling; const x = n && n.querySelector('[data-l=' + e.target.dataset.l + ']'); if (x) x.focus(); } });
    el.querySelector('[data-a=row]').onclick = () => {
      const blanks = Array.from(sheet.querySelectorAll('tbody tr.blank'));
      if (blanks.length > 1 && getComputedStyle(blanks[1]).display === 'none') { blanks[0].classList.remove('blank'); blanks[0].classList.add('opened'); markBlank(); return; }
      f.lines.push(blankLine()); if (pub) writePubDraft(f); else persist(); render(el, params, opts);
    };
    el.querySelector('[data-a=pdf]').onclick = () => { try { reqPdf(f, 'save'); if (!pub) Proc.audit('Download Requisition form', (f.number || 'draft') + ' — ' + (f.department || '')); } catch (err) { ui.toast(err.message, 'error'); } };
    const doSave = async submit => {
      const saved = await saveForm(f, submit, up); if (!saved) return;
      if (up) { try { await Proc.files.add(up.file, { kind: 'Requisition', title: 'Requisition form ' + saved.number + ' (' + up.file.name + ')', ref: saved.number, date: saved.date, links: { requisitionId: saved.id } }); } catch (e) { ui.toast('The requisition was saved but the file could not be attached: ' + e.message, 'warning'); } Proc.reqForm.pending = null; }
      else clearDraft(); ui.toast(saved.number + ' saved (' + saved.status + ') — you can download the PDF now.', 'success', 6000); router.go('req-form/' + saved.id); };
    const b1 = el.querySelector('[data-a=save]'); if (b1) b1.onclick = () => doSave(false);
    const b2 = el.querySelector('[data-a=draft]'); if (b2) b2.onclick = () => doSave(false);
    const b3 = el.querySelector('[data-a=submit]'); if (b3) b3.onclick = () => doSave(true);
    const c = el.querySelector('[data-a=clear]'); if (c) c.onclick = async () => { if (!await ui.confirm('Clear everything typed on this form?', { ok: 'Clear', danger: true })) return; clearDraft(); render(el, params); };
    const v = el.querySelector('[data-a=view]'); if (v && up) v.onclick = e => { e.preventDefault(); const u = URL.createObjectURL(up.file); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); };
    const send = el.querySelector('[data-a=send]');
    if (send) send.onclick = async () => {
      const errs = [];
      if (!String(f.department || '').trim()) errs.push('the department');
      if (!filled(f).length) errs.push('at least one item');
      if (!String(f.requestedBy || '').trim()) errs.push('your name (Requested by)');
      if (!String(f.justification || '').trim()) errs.push('the justification');
      if (errs.length) return ui.toast('Please enter ' + errs.join(', ') + '.', 'warning');
      send.disabled = true; send.textContent = 'Sending…';
      const data = Object.assign({}, f); delete data.id;
      try {
        const r = await postOnline(opts.endpoint, { v: 1, form: data, sentAt: new Date().toISOString(), page: location.origin + location.pathname });
        el.dataset.sent = '1'; clearPubDraft();
        el.innerHTML = '<div class="card" style="max-width:640px;margin:30px auto"><div class="card-b" style="text-align:center;padding:40px 24px">' + ui.icon('check', 'lg') +
          '<h2 style="margin:12px 0 6px">Requisition sent</h2><p class="muted">The Procurement Unit has received it' + (r && r.id ? ' — your reference is <b>' + esc(r.id) + '</b>' : '') + '. Keep a copy for your records.</p>' +
          '<div class="row" style="justify-content:center;gap:8px;margin-top:18px"><button class="btn" data-a="copy">' + ui.icon('download', 'sm') + 'Download my copy (PDF)</button><button class="btn primary" data-a="another">' + ui.icon('plus', 'sm') + 'Start another</button></div></div></div>';
        el.querySelector('[data-a=copy]').onclick = () => reqPdf(Object.assign({}, data, { number: r && r.id ? r.id : '' }), 'save');
        el.querySelector('[data-a=another]').onclick = () => render(el, null, opts);
      } catch (err) {
        send.disabled = false; send.innerHTML = ui.icon('send', 'sm') + 'Submit to Procurement';
        ui.toast('Could not send it (' + err.message + '). Your form is kept — try again, or press Download PDF and email it to the Procurement Unit.', 'error', 12000);
      }
    };
  }

  /* ------------------------------------------------------------ public page helpers */
  const PUB_KEY = 'requisitionPublicDraft';
  const OFFICIAL = ['totalCost', 'supplier', 'approvedBy', 'approvedDate'];
  const readPubDraft = () => { try { return JSON.parse(localStorage.getItem(PUB_KEY) || 'null'); } catch (e) { return null; } };
  const writePubDraft = d => { try { localStorage.setItem(PUB_KEY, JSON.stringify(d)); } catch (e) { /* convenience only */ } };
  const clearPubDraft = () => { try { localStorage.removeItem(PUB_KEY); } catch (e) { /* ignore */ } };
  /** Send to the Google receiver. text/plain avoids a CORS pre-flight; if the reply cannot be read, a no-cors resend still delivers it. */
  async function postOnline(url, body) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      const j = await r.json(); if (!j.ok) throw new Error(j.error || 'not accepted'); return j;
    } catch (e) {
      if (/not accepted|Incomplete/.test(e.message)) throw e;
      await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      return { id: '' };
    }
  }

  /* ------------------------------------------------------------ upload a completed form */
  /** Read a completed requisition: our own PDF (exact data), the SRHA fillable PDF (form fields), or a scan/photo (attached only). */
  async function readUpload(file) {
    const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    if (!isPdf) return { file, how: 'scan', f: null };
    const buf = await file.arrayBuffer();
    // 1. Completed on screen (this system or the online page): the answers are inside the PDF.
    const txt = new TextDecoder('latin1').decode(new Uint8Array(buf));
    const m = txt.match(/MPHREQ1:([A-Za-z0-9+\/=]+)/);
    if (m) { try { const f = JSON.parse(unb64(m[1])); f.lines = (f.lines || []).concat(Array.from({ length: Math.max(0, ROWS - (f.lines || []).length) }, blankLine)); delete f.number; return { file, how: 'embedded', f }; } catch (e) { /* fall through */ } }
    // 2. The SRHA fillable PDF filled in with Adobe Reader or a phone PDF app.
    try {
      const lib = await Proc.pdf.lib();
      const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
      const fo = await pdf.getFieldObjects();
      if (fo && Object.keys(fo).length) { const f = fromAcroForm(fo); if (f) return { file, how: 'acroform', f }; }
    } catch (e) { console.warn('[Requisition upload] form fields not read', e); }
    return { file, how: 'scan', f: null };
  }
  function fromAcroForm(fo) {
    const val = n => { const a = fo[n]; if (!a) return ''; const x = a.find(o => o.value !== undefined && o.value !== null && o.value !== '' && o.value !== 'Off'); return x ? String(x.value).trim() : ''; };
    const rect = n => (fo[n] && fo[n][0] && fo[n][0].rect) || null;
    const f = blank();
    // Dates as typed on the PDF: 4/11/2026, 04-11-2026, 2026-11-04, 4 Nov 2026. Day first (Jamaican style) unless that is impossible or far in the future.
    const date = s => {
      s = String(s || '').trim(); if (!s) return '';
      let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
      m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);
      if (m) {
        const y = m[3].length === 2 ? '20' + m[3] : m[3], a = +m[1], b = +m[2];
        const iso = (d, mo) => y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const ok = (d, mo) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
        const dm = ok(a, b) ? iso(a, b) : '', md = ok(b, a) ? iso(b, a) : '';
        if (dm && md && dm > util.addDays(util.today(), 31) && md <= util.addDays(util.today(), 31)) return md;
        return dm || md;
      }
      const d = new Date(s); return isNaN(d) ? '' : util.toISODate(d);
    };
    f.facility = val('Facility') || f.facility; f.department = val('Department'); f.date = date(val('Date of Requisition')) || f.date; f.classification = val('Items Classification'); f.to = val('To') || f.to;
    f.lines = [];
    // Yes / No / Deferred are plain text boxes on this form ("undefined", "undefined_2"…): place each by its position.
    const marks = Object.keys(fo).filter(k => /^undefined(_\d+)?$/.test(k) && val(k)).map(k => ({ r: rect(k) })).filter(x => x.r);
    const yesX = [], rowsY = [];
    for (let i = 1; i <= 7; i++) {
      const l = { stock: val('STOCK BALANCERow' + i), qty: val('QUANTITYRow' + i), unit: val('UMRow' + i), description: val('ITEM DESCRIPTIONSPECIFICATIONRow' + i), decision: '' };
      const rr = rect('QUANTITYRow' + i); rowsY.push(rr ? (rr[1] + rr[3]) / 2 : null);
      f.lines.push(l);
    }
    const allMarks = Object.keys(fo).filter(k => /^undefined(_\d+)?$/.test(k)).map(k => rect(k)).filter(Boolean);
    const xs = Array.from(new Set(allMarks.map(r => Math.round((r[0] + r[2]) / 2)))).sort((a, b) => a - b);
    void yesX;
    marks.forEach(mk => {
      const cy = (mk.r[1] + mk.r[3]) / 2, cx = (mk.r[0] + mk.r[2]) / 2;
      let best = -1, bd = 1e9; rowsY.forEach((y, i) => { if (y !== null && Math.abs(y - cy) < bd) { bd = Math.abs(y - cy); best = i; } });
      const col = xs.length >= 3 ? (cx < (xs[0] + xs[Math.floor(xs.length / 2)]) / 2 ? 0 : cx < (xs[Math.floor(xs.length / 2)] + xs[xs.length - 1]) / 2 ? 1 : 2) : 0;
      if (best >= 0) f.lines[best].decision = ['yes', 'no', 'deferred'][col];
    });
    f.lines = f.lines.filter(l => l.description || l.qty || l.stock).concat([]);
    while (f.lines.length < ROWS) f.lines.push(blankLine());
    const est = [val('Estimate 1'), val('Estimate 2')].filter(Boolean).join(' ');
    const n = String(est).replace(/[^0-9.]/g, ''); f.estimate = n && !isNaN(Number(n)) ? n : est;
    f.justification = ['Justification 1', 'Justification 2', '1', '2', '3', '4', '5', '6', '7', '8'].map(val).filter(Boolean).join(' ');
    f.funding = val('Source of Funding'); f.requestedBy = val('Requested by'); f.requestedDate = date(val('Date'));
    f.supervisor = val('Verified by Supervisor'); f.supervisorDate = date(val('Date_2')); f.hod = val('Verified by HOD'); f.hodDate = date(val('Date_3'));
    f.totalCost = String(val('Total Cost')).replace(/[^0-9.]/g, ''); f.supplier = val('SupplierContractor'); f.approvedBy = val('Approved by');
    f.support = [['Terms of Reference TOR', SUPPORT[0]], ['Description of Services', SUPPORT[1]], ['Scope of Work', SUPPORT[2]], ['Signed Technical Specifications', SUPPORT[3]]].filter(([k]) => val(k)).map(x => x[1]);
    const any = f.department || f.requestedBy || f.lines.some(l => l.description);
    return any ? f : null;
  }
  /** "Upload requisition form" — pick files, read the first, open it on the form to check and save. */
  function uploadDialog() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,image/*'; inp.multiple = false;
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      ui.toast('Reading ' + file.name + '…');
      try { Proc.reqForm.pending = await readUpload(file); router.go('req-form?upload=' + Date.now()); }
      catch (e) { ui.toast('Could not read the file: ' + e.message, 'error'); }
    };
    inp.click();
  }

  /* ------------------------------------------------------------ online requests (Google receiver) */
  const OS = () => (store.settings().onlineForms || {});
  const shareLink = () => { const base = location.href.replace(/[^/]*([?#].*)?$/, ''); const o = OS(); return base + 'request.html#to=' + encodeURIComponent(o.url || '') + '&f=' + encodeURIComponent(store.settings().org.hospital || ''); };
  async function collect(manual) {
    const o = OS(); if (!o.url || !o.key || !Proc.auth || !Proc.auth.user) return 0;
    let n = 0;
    try {
      const r = await fetch(o.url + (o.url.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(o.key) + '&since=' + Number(o.since || 0));
      const j = await r.json(); if (!j.ok) throw new Error(j.error || 'refused');
      let last = Number(o.since || 0);
      (j.items || []).forEach(it => {
        last = Math.max(last, Number(it.at) || 0);
        if (!it.id || !it.data || !it.data.form || store.find('requisitions', x => x.onlineId === it.id)) return;
        const fm = Object.assign(blank(), it.data.form); fm.id = null;
        const saved = saveRecord(fm, true, { onlineId: it.id, source: 'online', requesterEmail: fm.requesterEmail || '', requesterPhone: fm.requesterPhone || '', receivedAt: it.at });
        Proc.notify({ to: ['procurement'], type: 'online-requisition', title: 'Online requisition ' + saved.number + ' — ' + saved.department, body: (saved.requestedBy || '') + ' · ' + saved.title, link: { app: 'procurement', route: '#/requisitions/' + saved.id } });
        Proc.audit('Receive Online Requisition', it.id + ' → ' + saved.number + ' — ' + saved.department, saved.id);
        n++;
      });
      store.saveSettings({ onlineForms: Object.assign({}, OS(), { since: last, lastCheck: Date.now(), lastError: '' }) });
      if (n) ui.toast(n + ' new online ' + util.plural(n, 'requisition') + ' received', 'success', 8000);
      else if (manual) ui.toast('No new online requisitions');
    } catch (e) {
      if (manual) ui.toast('Could not collect online requisitions: ' + e.message, 'error');
      store.saveSettings({ onlineForms: Object.assign({}, OS(), { lastError: e.message, lastCheck: Date.now() }) });
    }
    return n;
  }
  function onlineDialog() {
    const o = OS();
    ui.modal({
      title: 'Online requests', size: 'lg',
      body: '<p>Send a link so anyone can fill in the requisition form online and submit it. Submissions arrive here in Requisitions within a couple of minutes, and an email alert is sent.</p>' +
        '<div class="alert info mt-2">' + ui.icon('info') + '<div><div class="t">One-time set-up (about 5 minutes)</div>The receiver is a small free Google Apps Script in your own Google account — no other service. ' +
        '<a href="procurement/receiver/requisition-receiver.gs" target="_blank" download>Download the receiver script</a> and follow the steps at the top of it: paste it into a Google Sheet (Extensions → Apps Script), set your secret key and email, deploy as a Web app (Anyone), then paste the Web app URL and key below.</div></div>' +
        '<div class="form-grid mt-3"><div class="field s12"><label>Web app URL</label><input name="url" value="' + esc(o.url || '') + '" placeholder="https://script.google.com/macros/s/…/exec"></div>' +
        '<div class="field s6"><label>Secret key</label><input name="key" value="' + esc(o.key || '') + '" autocomplete="off"></div>' +
        '<div class="field s6"><label>Last checked</label><input disabled value="' + (o.lastCheck ? util.dateTime(o.lastCheck) + (o.lastError ? ' — ' + esc(o.lastError) : ' — OK') : 'Not yet') + '"></div></div>' +
        '<div class="field mt-2"><label>Link to send to requesters</label><div class="row" style="gap:8px"><input class="input" id="olLink" readonly value="' + esc(o.url ? shareLink() : '') + '" placeholder="Save the Web app URL first"><button class="btn" type="button" id="olCopy"' + (o.url ? '' : ' disabled') + '>' + ui.icon('copy', 'sm') + 'Copy</button></div>' +
        '<div class="hint">Share it by email or WhatsApp. Without the set-up, people can still use <a href="request.html" target="_blank">request.html</a> to fill in the form and download a PDF for you to upload.</div></div>',
      actions: [{ label: 'Close', kind: 'ghost' }, { label: 'Check now', icon: 'refresh', onClick: async () => { await collect(true); return false; } }, { label: 'Save', kind: 'primary', onClick: (close, m) => {
        const url = m.querySelector('[name=url]').value.trim(), key = m.querySelector('[name=key]').value.trim();
        if (url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { ui.toast('That does not look like a Google Apps Script Web app URL (https://script.google.com/macros/s/…/exec).', 'warning'); return false; }
        store.saveSettings({ onlineForms: Object.assign({}, OS(), { url, key }) });
        m.querySelector('#olLink').value = url ? shareLink() : ''; m.querySelector('#olCopy').disabled = !url;
        ui.toast('Saved' + (url && key ? ' — checking for submissions…' : '')); if (url && key) collect(true); return false;
      } }],
      onOpen: m => { m.querySelector('#olCopy').onclick = () => { const i = m.querySelector('#olLink'); i.select(); try { navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand('copy'); } ui.toast('Link copied'); }; }
    });
  }
  // Collect automatically while Procurement is open (every 2 minutes and when the window comes back into view).
  if (Proc.APP && Proc.APP.id === 'procurement') {
    setTimeout(() => collect(false), 6000);
    setInterval(() => collect(false), 120000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') collect(false); });
  }

  Proc.pdf.requisitionForm = (r, output) => reqPdf(fromReq(r), output);
  Proc.reqForm = { pending: null, upload: uploadDialog, readUpload, onlineDialog, collect, renderPublic: (el, o) => render(el, null, Object.assign({ public: true }, o || {})) };
  Proc.page({ id: 'req-form', title: 'Requisition Form', icon: 'clipboard', section: 'Workflow', order: 11, render });
})();
