/* ==========================================================================
   Import Data (#/import)
   Brings the hospital's existing Excel records into the system:
     • PO Log (month sheets: REQUEST # … COMMENT)          → purchase orders (+ invoices)
     • PRS return ('Database_ Transactions')               → enrich/create purchase orders
     • Ground provisions weekly comparison ('WEEKEND …')    → price comparisons
     • Monthly PROCUREMENT workbook ('Sheet2' awards)       → price comparisons (award breakdown)
     • Annual procurement plan (WORKS / EQUIPMENT / …)      → plans
     • JSON backup                                          → merged with store.merge
   Every file is previewed before anything is written. Each import is logged
   in store.db.importLog and can be undone.
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, K } = Proc;
  const esc = util.esc;

  if (!document.getElementById('css-import')) document.head.insertAdjacentHTML('beforeend', '<style id="css-import">' +
    '.imp-types{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}' +
    '.imp-type{display:flex;gap:12px;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-2)}' +
    '.imp-type .ic{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:var(--primary-50);color:var(--primary);flex:none}' +
    '.imp-type .t{font-weight:600;font-size:13.5px}.imp-type .d{font-size:12.5px;color:var(--text-3);line-height:1.4}' +
    '.imp-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}' +
    '.imp-stat{border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px}' +
    '.imp-stat .v{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}.imp-stat .l{font-size:12px;color:var(--text-3)}' +
    '.imp-stat.good .v{color:var(--success)}.imp-stat.warn .v{color:var(--warning)}' +
    '.imp-file-h{display:flex;align-items:center;gap:12px;flex-wrap:wrap}' +
    '.imp-file-h .fi{width:38px;height:38px;border-radius:9px;display:grid;place-items:center;background:var(--success-bg);color:var(--success);font-size:10.5px;font-weight:800;flex:none}' +
    '.imp-file-h .fi.json{background:var(--purple-bg);color:var(--purple)}.imp-file-h .fi.bad{background:var(--danger-bg);color:var(--danger)}' +
    '.imp-chips{display:flex;flex-wrap:wrap;gap:6px;max-height:160px;overflow:auto}' +
    'details.imp-more{margin-top:10px;border-top:1px dashed var(--border);padding-top:8px}' +
    'details.imp-more summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--text-2);padding:4px 0}' +
    'details.imp-more ul{margin:6px 0 0 18px;font-size:12.5px;color:var(--text-2);max-height:200px;overflow:auto}' +
    '.imp-steps{display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--text-3);flex-wrap:wrap}' +
    '.imp-steps b{color:var(--text)}' +
    '</style>');

  /* ------------------------------------------------------------ helpers */
  const norm = s => String(s === null || s === undefined ? '' : s).toUpperCase().replace(/[^A-Z0-9#$]/g, '');
  const str = v => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
  const MONTH_IDX = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, SEPT: 8, OCT: 9, NOV: 10, DEC: 11 };
  function isoFromCell(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') return v > 20000 && v < 80000 ? util.toISODate(v) : '';
    if (v instanceof Date) return util.toISODate(v);
    return util.toISODate(String(v).trim());
  }
  function rowsOf(ws) {
    if (!ws || !ws['!ref']) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  }
  function rowOffset(ws) { try { return XLSX.utils.decode_range(ws['!ref']).s.r; } catch (e) { return 0; } }
  /** Parse "250 ea - Item", "6000lt - Oxygen", "138.69kg - Chicken" → {qty, unit, desc} (single-item lines only). */
  function parseQtyLine(text) {
    const t = str(text);
    const m = t.match(/^([\d][\d,]*(?:\.\d+)?)\s*([A-Za-z\/\.']{0,10})\s*[-–]\s*(.+)$/);
    if (!m) return null;
    // A second "N unit - item" after a comma means several items on one PO line.
    if (/,\s*[\d][\d,.]*\s*[A-Za-z\/\.']{0,10}\s*[-–]/.test(m[3])) return null;
    const qty = util.num(m[1]);
    if (!qty) return null;
    return { qty, unit: (m[2] || 'each').replace(/\.$/, '') || 'each', desc: m[3].trim() };
  }
  function parseQtyCell(v) { // "30 pks" → {qty:30, unit:'pks'}
    const m = str(v).match(/^([\d][\d,]*(?:\.\d+)?)\s*(.*)$/);
    return m ? { qty: util.num(m[1]), unit: m[2].trim() || 'each' } : { qty: util.num(v) || 1, unit: 'each' };
  }
  function normMethod(v) {
    const s = str(v); if (!s) return '';
    const exact = K.METHODS.find(m => m.toLowerCase() === s.toLowerCase());
    if (exact) return exact;
    const n = norm(s);
    if (n === 'SS' || /SINGLESOURCE|DIRECT/.test(n)) return 'Single Source (SS)';
    if (n === 'RB' || /RESTRICTED/.test(n)) return 'Restricted Bidding (RB)';
    if (n === 'RFQ' || /QUOTATION/.test(n)) return 'Request for Quotations';
    if (n === 'NCB' || /NCB|NATIONAL/.test(n)) return 'Open - NCB';
    if (n === 'ICB' || /ICB|INTERNATIONAL/.test(n)) return 'Open - ICB';
    if (/FRAMEWORK/.test(n)) return 'Framework Agreement';
    if (/PROPOSAL/.test(n)) return /WITHOUT/.test(n) ? 'Request for Proposals without Negotiation' : 'Request for Proposals with Consecutive Negotiation';
    return s;
  }
  function normType(v) { const s = str(v).toLowerCase(); if (!s) return ''; if (s.indexOf('good') === 0) return 'Goods'; if (s.indexOf('serv') === 0) return 'Services'; if (s.indexOf('work') === 0) return 'Works'; if (s.indexOf('exem') === 0) return 'Exempt'; return util.titleCase(s); }
  function yesNo(v) { const s = str(v).toLowerCase(); if (!s) return null; if (s.indexOf('n/a') === 0) return null; return s[0] === 'y'; }
  function normCategory(v) {
    const s = str(v); if (!s) return '';
    const hit = (Proc.PRS_CATEGORIES || []).find(c => c[1].toLowerCase() === s.toLowerCase());
    return hit ? hit[1] : s;
  }
  function poKey(poNumber, supplierName) { return str(poNumber) + '|' + domain.supplierKey(supplierName); }
  function existingPOIndex() {
    const byKey = new Map(), byNum = new Map();
    store.list('purchaseOrders').forEach(p => {
      const name = p.supplierName || domain.supplierName(p.supplierId);
      byKey.set(poKey(p.poNumber, name), p);
      if (p.poNumber) { const k = str(p.poNumber); (byNum.get(k) || byNum.set(k, []).get(k)).push(p); }
    });
    return { byKey, byNum };
  }
  function monthFromText(s) {
    const m = String(s || '').toUpperCase().replace(/_/g, ' ').match(/\b(JAN|FEB|MAR|APR|MAY|JUNE?|JULY?|AUG|SEPT?|OCT|NOV|DEC)[A-Z.]*[\s_.\-]*((?:20)?\d{2})?/);
    if (!m) return null;
    let y = m[2] ? +m[2] : null; if (y && y < 100) y += 2000;
    return { month: MONTH_IDX[m[1].slice(0, 3)] !== undefined ? MONTH_IDX[m[1].slice(0, 3)] : MONTH_IDX[m[1]], year: y };
  }

  /* --------------------------------------------------------- detection */
  const TYPES = {
    polog: { label: 'PO Log', icon: 'cart', desc: 'Monthly sheets of purchase orders (REQUEST # … P.O. # … COMMENT).' },
    prs: { label: 'PRS return', icon: 'sheet', desc: 'Ministry of Finance Procurement Reporting System workbook (Database_ Transactions).' },
    groundprov: { label: 'Ground provisions comparison', icon: 'scale', desc: 'Weekly vendor price sheets (WEEKEND …) — become price comparisons.' },
    monthly: { label: 'Monthly procurement workbook', icon: 'clipboard', desc: 'Sheet2 award breakdown by supplier — becomes award summaries.' },
    plan: { label: 'Procurement plan', icon: 'calendar', desc: 'Annual plan (WORKS, EQUIPMENT, SERVICES…) with quarters and milestones.' },
    backup: { label: 'System backup (JSON)', icon: 'refresh', desc: 'A backup exported from this system — merged, newest record wins.' }
  };
  function detect(wb) {
    const names = wb.SheetNames;
    if (names.indexOf('Database_ Transactions') >= 0) return 'prs';
    if (names.some(n => /^WEEKEND/i.test(n.trim()))) return 'groundprov';
    if (names.indexOf('Sheet2') >= 0 && names.some(n => /AMOUNT FOR APPROVAL/i.test(n))) return 'monthly';
    for (const n of names) {
      const rows = rowsOf(wb.Sheets[n]).slice(0, 6).map(r => (r || []).map(norm).join('|'));
      if (rows.some(r => r.indexOf('REQUEST#') >= 0 && r.indexOf('PO#') >= 0)) return 'polog';
      if (rows.some(r => r.indexOf('ITEMDESCRIPTION') >= 0 && r.indexOf('PLANNEDPROCUREMENT') >= 0)) return 'plan';
    }
    return null;
  }

  /* ------------------------------------------------------------ parsers
     Each returns a "plan": { type, sheets, parsed, present, updates, unchanged,
     create: { coll: [rec…] }, patches: [{coll, match(), patch}], newSuppliers: [names], warnings: [], info: [] } */

  function newPlan(type) { return { type, sheets: [], parsed: 0, present: 0, updates: 0, unchanged: 0, create: {}, patches: [], supplierNames: [], warnings: [], info: [] }; }
  function addCreate(plan, coll, rec) { (plan.create[coll] = plan.create[coll] || []).push(rec); }
  function finishSuppliers(plan) {
    const seen = new Set(), out = [];
    plan.supplierNames.forEach(n => { const k = domain.supplierKey(n); if (!k || seen.has(k)) return; seen.add(k); if (!domain.findSupplier(n)) out.push(n); });
    plan.newSuppliers = out;
    return plan;
  }

  /* PO Log ------------------------------------------------------------- */
  const POLOG_COLS = {
    reqNo: ['REQUEST#'], reqDate: ['REQUESTDATE'], dateReceived: ['DATERECEIVED'], requisitioner: ['REQUISITIONER'], department: ['DEPARTMENT'],
    no: ['NO'], desc: ['ITEMDESCRIPTION'], supplier: ['SUPPLIER'], poDate: ['PODATE'], poNo: ['PO#'], poAmt: ['PO$'], invNo: ['INVOICE#'],
    invDate: ['INVOICEDATE'], invAmt: ['INVOICE$'], comment: ['COMMENT']
  };
  const POLOG_ORDER = ['reqNo', 'reqDate', 'dateReceived', 'requisitioner', 'department', 'no', 'desc', 'supplier', 'poDate', 'poNo', 'poAmt', 'invNo', 'invDate', 'invAmt', 'comment'];
  function parsePOLog(wb, fileName, ctx) {
    const plan = finishSuppliers(newPlan('polog'));
    const idx = existingPOIndex();
    const seenInFile = new Set();
    const fy = (fileName.match(/(20\d{2})\D{1,12}(20\d{2})/) || []);
    wb.SheetNames.forEach(sn => {
      const ws = wb.Sheets[sn];
      const rows = rowsOf(ws), off = rowOffset(ws);
      const hi = rows.slice(0, 6).findIndex(r => (r || []).map(norm).indexOf('REQUEST#') >= 0);
      if (hi < 0) return;
      if (/TEMPLATE/i.test(sn)) { plan.info.push('Sheet “' + sn + '” is a blank template — skipped.'); return; }
      const hdr = rows[hi].map(norm);
      const col = {};
      POLOG_ORDER.forEach((k, i) => { const j = hdr.findIndex(h => POLOG_COLS[k].indexOf(h) >= 0); col[k] = j >= 0 ? j : i; });
      // Month of the sheet, for rows without a P.O. date.
      const mt = monthFromText(sn);
      const dates = rows.slice(hi + 1).map(r => r && isoFromCell(r[col.poDate])).filter(Boolean);
      let sheetMonth = '';
      if (dates.length) { const c = {}; dates.forEach(d => { c[d.slice(0, 7)] = (c[d.slice(0, 7)] || 0) + 1; }); sheetMonth = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; }
      else if (mt) { const y = mt.year || (fy[1] ? (mt.month >= 3 ? +fy[1] : +fy[2]) : new Date().getFullYear()); sheetMonth = y + '-' + String(mt.month + 1).padStart(2, '0'); }
      let count = 0;
      rows.slice(hi + 1).forEach((r, i) => {
        if (!r) return;
        const rowNo = off + hi + 2 + i;
        const supplier = str(r[col.supplier]), desc = str(r[col.desc]);
        const poNo = str(r[col.poNo]);
        const amtRaw = r[col.poAmt];
        if (!supplier && !desc) return;            // blank / numbering-only rows
        if (!supplier) { plan.warnings.push(sn + ' row ' + rowNo + ': no supplier — skipped (“' + desc.slice(0, 60) + '”).'); return; }
        plan.parsed++; count++;
        let total = typeof amtRaw === 'number' ? amtRaw : util.num(amtRaw);
        let comment = str(r[col.comment]);
        if (amtRaw !== null && amtRaw !== undefined && typeof amtRaw !== 'number' && !util.num(amtRaw)) {
          plan.warnings.push(sn + ' row ' + rowNo + ': amount “' + str(amtRaw) + '” is not a JMD number — imported as $0 with a note.');
          comment = (comment ? comment + ' ' : '') + '[Amount in log: ' + str(amtRaw) + ']'; total = 0;
        } else if (amtRaw === null || amtRaw === undefined || amtRaw === '') plan.warnings.push(sn + ' row ' + rowNo + ': no P.O. amount — imported as $0.');
        const date = isoFromCell(r[col.poDate]) || (sheetMonth ? sheetMonth + '-01' : '');
        const key = poNo ? poKey(poNo, supplier) : 'NOPO|' + domain.supplierKey(supplier) + '|' + desc.toUpperCase() + '|' + date;
        if (seenInFile.has(key)) { plan.warnings.push(sn + ' row ' + rowNo + ': PO ' + (poNo || '(none)') + ' for ' + supplier + ' appears twice in the log — duplicate skipped.'); plan.parsed--; return; }
        seenInFile.add(key);
        const exists = poNo ? idx.byKey.get(key) : store.find('purchaseOrders', p => !p.poNumber && p.description === (desc || 'Purchase order') && domain.supplierKey(p.supplierName) === domain.supplierKey(supplier) && p.date === date);
        if (exists) { plan.present++; return; }
        if (!poNo) plan.warnings.push(sn + ' row ' + rowNo + ': no P.O. number — imported as a Draft PO (' + supplier + ').');
        plan.supplierNames.push(supplier);
        const q = parseQtyLine(desc);
        const item = q ? { description: q.desc, unit: q.unit, qty: q.qty, unitPrice: util.round2(total / q.qty), total }
          : { description: desc || 'Purchase order', unit: 'lot', qty: 1, unitPrice: total, total };
        const invNo = str(r[col.invNo]);
        const po = {
          poNumber: poNo, date, supplierName: supplier, description: desc || 'Purchase order', items: [item], subtotal: total, gct: 0, total,
          requestNo: str(r[col.reqNo]), requestDate: isoFromCell(r[col.reqDate]), dateReceived: isoFromCell(r[col.dateReceived]),
          requisitioner: str(r[col.requisitioner]), department: str(r[col.department]), comment, status: !poNo ? 'Draft' : invNo ? 'Invoiced' : 'Issued',
          source: 'import:polog', logSheet: sn, logRow: rowNo
        };
        if (invNo) po._invoice = { invoiceNumber: invNo, date: isoFromCell(r[col.invDate]) || date, amount: util.num(r[col.invAmt]) || total };
        addCreate(plan, 'purchaseOrders', po);
        if (ctx) ctx.pending.set(str(poNo), po);
      });
      plan.sheets.push(sn + ' (' + count + ')');
    });
    if (!plan.sheets.length) plan.warnings.push('No PO Log sheets found.');
    return finishSuppliers(plan);
  }

  /* PRS ---------------------------------------------------------------- */
  const PRS_COLS = [ // [key, startsWith(normalised header)]
    ['poNumber', 'UNIQUECONTRACTNUMBER'], ['publicBody', 'PUBLICBODY'], ['contractor', 'CONTRACTOR'], ['title', 'PROJECTTITLE'],
    ['estimate', 'PROCUREMENTCOSTESTIMATE'], ['award', 'CONTRACTAWARDPRICE'], ['method', 'PROCUREMENTMETHOD'], ['tenders', 'NUMBEROFTENDERS'],
    ['country', 'COUNTRY'], ['type', 'TYPE'], ['category', 'TRANSACTIONCATEGORY'], ['msme', 'MSME'], ['priority', 'PRIORITY'],
    ['gojep', 'EXECUTEDVIAGOJEP'], ['manual', 'IFNOTEXECUTEDBYGOJEP'], ['reqReceived', 'DATEREQUISITIONRECEIVED'], ['noticePublished', 'DATEPROCUREMENTNOTICE'],
    ['submissionDeadline', 'DATEQUOTETENDERSUBMISSION'], ['evaluationCompleted', 'DATEEVALUATION'], ['committeeRecommendation', 'DATEPROCUREMENTCOMMITTEE'],
    ['headApproval', 'DATEHEADOFENTITY'], ['ppcApproval', 'DATEPPCAPPROVAL'], ['cabinetApproval', 'DATECABINETAPPROVAL'], ['awardDate', 'DATECONTRACTAWARD'],
    ['retendered', 'RETENDERED'], ['retenderReason', 'PRIMARYREASONFORRETENDER'], ['comment', 'COMMENT'], ['melissa', 'HURRICANEMELISSA']
  ];
  const PRS_DATE_KEYS = ['reqReceived', 'noticePublished', 'submissionDeadline', 'evaluationCompleted', 'committeeRecommendation', 'headApproval', 'ppcApproval', 'cabinetApproval', 'awardDate'];
  Proc.PRS_DATE_KEYS = PRS_DATE_KEYS;
  function prsRows(wb) {
    const ws = wb.Sheets['Database_ Transactions'];
    const rows = rowsOf(ws), off = rowOffset(ws);
    const hi = rows.slice(0, 8).findIndex(r => (r || []).some(c => norm(c).indexOf('UNIQUECONTRACTNUMBER') === 0));
    if (hi < 0) return { rows: [], error: 'Header row (“Unique Contract Number …”) not found.' };
    const hdr = rows[hi].map(norm), col = {};
    PRS_COLS.forEach(([k, p]) => { const j = hdr.findIndex(h => h.indexOf(p) === 0); if (j >= 0 && col[k] === undefined) col[k] = j; });
    const out = [];
    rows.slice(hi + 1).forEach((r, i) => {
      if (!r || r.every(c => c === null || c === '')) return;
      const g = k => (col[k] === undefined ? null : r[col[k]]);
      const rec = { rowNo: off + hi + 2 + i, poNumber: str(g('poNumber')), contractor: str(g('contractor')), title: str(g('title')), publicBody: str(g('publicBody')),
        estimate: util.num(g('estimate')), award: util.num(g('award')), method: normMethod(g('method')), tenders: util.num(g('tenders')) || null,
        country: util.titleCase(str(g('country'))), type: normType(g('type')), category: normCategory(g('category')), msme: yesNo(g('msme')),
        priority: /emerg/i.test(str(g('priority'))) ? 'Emergency' : (str(g('priority')) ? 'Normal' : ''), gojep: yesNo(g('gojep')), manual: str(g('manual')),
        retendered: str(g('retendered')), retenderReason: str(g('retenderReason')), comment: str(g('comment')), melissa: str(g('melissa')) };
      PRS_DATE_KEYS.forEach(k => { rec[k] = isoFromCell(g(k)); });
      out.push(rec);
    });
    return { rows: out, columns: Object.keys(col).length };
  }
  function prsPatch(p, fileName) {
    const prs = { file: fileName, publicBody: p.publicBody, manualUpload: p.manual, retendered: p.retendered, retenderReason: p.retenderReason, melissa: p.melissa, prsComment: p.comment };
    PRS_DATE_KEYS.forEach(k => { if (p[k]) prs[k] = p[k]; });
    const patch = { prs };
    if (p.method) patch.method = p.method;
    if (p.category) patch.category = p.category;
    if (p.type) patch.type = p.type;
    if (p.estimate) patch.estimate = p.estimate;
    if (p.tenders) patch.tendersReceived = p.tenders;
    if (p.country) patch.country = p.country;
    if (p.priority) patch.priority = p.priority;
    if (p.gojep !== null) patch.viaGojep = p.gojep;
    return patch;
  }
  function samePatch(po, patch) {
    return Object.keys(patch).every(k => {
      if (k === 'prs') return po.prs && Object.keys(patch.prs).every(d => d === 'file' || (po.prs[d] || '') === (patch.prs[d] || ''));
      return po[k] === patch[k];
    });
  }
  function matchPRS(p, idx, pending) {
    const list = idx.byNum.get(p.poNumber) || [];
    if (list.length > 1) return list.find(x => domain.supplierKey(x.supplierName) === domain.supplierKey(p.contractor)) || list[0];
    if (list.length) return list[0];
    if (pending && pending.has(p.poNumber)) return pending.get(p.poNumber);
    return null;
  }
  function parsePRS(wb, fileName, ctx) {
    const plan = newPlan('prs');
    const res = prsRows(wb);
    plan.sheets = wb.SheetNames.filter(n => n === 'Database_ Transactions' || /^LITE/i.test(n));
    if (res.error) { plan.warnings.push(res.error); return finishSuppliers(plan); }
    const idx = existingPOIndex();
    const lite = wb.SheetNames.filter(n => /^LITE/i.test(n));
    if (lite.length) plan.info.push('LITE sheets (' + lite.join(', ') + ') list transactions under $500,000 without PO numbers — they are already covered by the PO Log and are not imported.');
    res.rows.forEach(p => {
      if (!p.poNumber && !p.contractor) return;
      if (!p.poNumber) { plan.warnings.push('Row ' + p.rowNo + ': no PO / contract number — skipped (' + p.contractor + ').'); return; }
      plan.parsed++;
      const po = matchPRS(p, idx, ctx && ctx.pending);
      const patch = prsPatch(p, fileName);
      if (p.contractor) plan.supplierNames.push(p.contractor);
      if (po && po.id) {
        if (samePatch(po, patch)) { plan.unchanged++; plan.present++; }
        else plan.updates++;
        plan.patches.push({ coll: 'purchaseOrders', poNumber: p.poNumber, contractor: p.contractor, patch, prs: p });
      } else if (po) { // pending from a PO Log in the same import batch
        plan.updates++;
        plan.patches.push({ coll: 'purchaseOrders', poNumber: p.poNumber, contractor: p.contractor, patch, prs: p });
      } else {
        const date = p.awardDate || p.headApproval || p.committeeRecommendation || p.evaluationCompleted || p.submissionDeadline || p.noticePublished || p.reqReceived || '';
        if (!date) plan.warnings.push('Row ' + p.rowNo + ': PO ' + p.poNumber + ' has no dates — imported without a date.');
        const total = p.award || p.estimate;
        const rec = Object.assign({ poNumber: p.poNumber, date, supplierName: p.contractor, description: p.title || p.category || 'Contract ' + p.poNumber,
          items: [{ description: p.title || p.category || 'Contract ' + p.poNumber, unit: 'lot', qty: 1, unitPrice: total, total }], subtotal: total, gct: 0, total,
          status: 'Issued', source: 'import:prs' }, patch);
        addCreate(plan, 'purchaseOrders', rec);
        if (ctx) ctx.pending.set(p.poNumber, rec);
      }
    });
    return finishSuppliers(plan);
  }

  /* Ground provisions ---------------------------------------------------- */
  function weekEnding(rows, sn) {
    for (let i = 0; i < 4; i++) {
      const t = (rows[i] || []).map(str).join(' ');
      const m = t.match(/WEEK\s*ENDING\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i);
      if (m) return util.toISODate(m[1] + '/' + m[2] + '/' + m[3]);
    }
    const d = new Date(sn.replace(/^WEEKEND\s*/i, '').replace(/\(\d+\)/, '').trim());
    return isNaN(d) ? '' : util.toISODate(d);
  }
  function parseGround(wb, fileName) {
    const plan = newPlan('groundprov');
    const usedRefs = new Set(store.list('comparisons').map(c => c.ref));
    const refsInFile = new Set();
    wb.SheetNames.filter(n => /^WEEKEND/i.test(n.trim())).forEach(sn => {
      const ws = wb.Sheets[sn]; const rows = rowsOf(ws);
      const we = weekEnding(rows, sn);
      const sheetDate = isoFromCell((rows[0] || [])[0]) || we;
      const heads = []; rows.forEach((r, i) => { const a = norm((r || [])[0]); if (a === 'ITEMDESCRIPTION' || a === 'DESCRIPTION') heads.push(i); });
      heads.forEach((hi, bi) => {
        const hr = rows[hi] || [];
        const vendors = [];
        for (let c = 1; c < hr.length; c++) { const v = str(hr[c]); if (v && !/^TOTAL|^UNIT/i.test(v)) vendors.push({ name: v, col: c }); }
        const end = bi + 1 < heads.length ? heads[bi + 1] : rows.length;
        const items = [], prices = {};
        for (let i = hi + 2; i < end; i++) {
          const r = rows[i] || []; const a = str(r[0]);
          if (!a) { if (r.some(c => typeof c === 'number')) break; else continue; }
          if (/AMT FOR PURCHASE|TOTAL AMOUNT/i.test(a)) break;
          const qty = util.num(r[1]);
          if (!(qty > 0)) continue;
          const id = util.uid('L');
          items.push({ id, description: a, unit: str(r[2]).toLowerCase() || 'lbs', qty });
          prices[id] = {};
          vendors.forEach(v => { const u = util.num(r[v.col]); if (u > 0) prices[id][v.name] = u; });
        }
        let sheetTotal = 0;
        for (let i = hi; i < end; i++) { const r = rows[i] || []; if (/TOTAL AMOUNT FOR PURCHASE/i.test(str(r[0]))) { sheetTotal = r.slice(1).map(util.num).find(x => x > 0) || 0; break; } }
        const quoted = vendors.filter(v => items.some(it => prices[it.id][v.name]));
        if (!items.length) { plan.info.push(sn + (bi ? ' (block ' + (bi + 1) + ')' : '') + ': no quantities required — skipped.'); return; }
        let ref = 'GP-WE-' + (we || sheetDate) + (bi ? '-S' + bi : '');
        let k = 1; const base = ref; while (refsInFile.has(ref)) ref = base + '-' + String.fromCharCode(65 + k++);
        refsInFile.add(ref);
        plan.parsed++;
        if (usedRefs.has(ref)) { plan.present++; return; }
        quoted.forEach(v => plan.supplierNames.push(v.name));
        addCreate(plan, 'comparisons', {
          ref, subject: 'Ground Provisions – week ending ' + util.date(we || sheetDate) + (bi ? ' (supplementary)' : ''), date: sheetDate, closingDate: we,
          method: 'Request for Quotations', viaGojep: false, invited: quoted.length, category: 'Food & Grocery Items', type: 'Goods', department: 'Dietary',
          items, _vendors: quoted.map(v => v.name), _prices: prices, awardMode: 'item', awards: {}, status: 'Evaluated',
          notes: sheetTotal ? 'Sheet “' + sn + '” total for purchase: ' + util.money(sheetTotal) : '', sheetTotal
        });
      });
      plan.sheets.push(sn);
    });
    return finishSuppliers(plan);
  }

  /* Monthly procurement workbook (Sheet2) --------------------------------- */
  function parseMonthly(wb, fileName) {
    const plan = newPlan('monthly');
    const rows = rowsOf(wb.Sheets['Sheet2']);
    let mt = monthFromText(fileName.replace(/^[0-9a-f]{8}-/i, ''));
    if (!mt || mt.year === null) { const a1 = str((rowsOf(wb.Sheets[wb.SheetNames.find(n => /AMOUNT FOR APPROVAL/i.test(n))]) [0] || [])[0]); mt = monthFromText(a1) || mt; }
    const now = new Date();
    const year = (mt && mt.year) || now.getFullYear(), month = mt ? mt.month : now.getMonth();
    const label = util.MONTHS[month] + ' ' + year;
    const ym = year + String(month + 1).padStart(2, '0');
    plan.sheets = ['Sheet2'].concat(wb.SheetNames.filter(n => /AMOUNT FOR APPROVAL/i.test(n)));
    plan.info.push('“AMOUNT FOR APPROVAL” budget summary detected — shown for reference, not imported.');
    const groups = []; let group = { blocks: [] }, block = null;
    const closeBlock = () => { if (block && block.items.length) group.blocks.push(block); block = null; };
    rows.forEach(r => {
      r = r || [];
      const a = str(r[0]);
      // Subtotal / GCT / TOTAL labels sit in the Items column (D) with the value in Total (E).
      const lab = [r[0], r[3], r[2], r[1]].map(str).find(x => /^(subtotal|gct|total)$/i.test(x));
      if (lab) {
        const nums = r.filter(c => typeof c === 'number');
        const v = typeof r[4] === 'number' ? r[4] : (nums.length ? nums[nums.length - 1] : util.num(r[4]));
        if (block) { if (/^gct$/i.test(lab)) block.gct = v; if (/^total$/i.test(lab)) { block.total = v; closeBlock(); } return; }
        if (/^total$/i.test(lab)) { if (group.blocks.length) { group.total = v; groups.push(group); } group = { blocks: [] }; }
        return;
      }
      if (!a) return;
      if (/^supplier$/i.test(a)) { closeBlock(); return; }
      const qtyCell = r[2], itemCell = str(r[3]), tot = util.num(r[4]);
      if (!block || domain.supplierKey(block.supplier) !== domain.supplierKey(a)) { closeBlock(); block = { supplier: a, address: str(r[1]), items: [], gct: 0, total: 0 }; }
      if (!itemCell || !(tot > 0)) return;
      const q = parseQtyCell(qtyCell);
      block.items.push({ description: itemCell, qty: q.qty || 1, unit: q.unit, total: tot });
    });
    closeBlock();
    if (group.blocks.length) groups.push(group);
    const used = new Set(store.list('comparisons').map(c => c.ref));
    groups.forEach((g, gi) => {
      const ref = 'AWD-' + ym + '-' + (gi + 1);
      plan.parsed++;
      if (used.has(ref)) { plan.present++; return; }
      const items = [], prices = {}, sups = [];
      g.blocks.forEach(b => {
        plan.supplierNames.push(b.supplier);
        if (sups.indexOf(b.supplier) < 0) sups.push(b.supplier);
        b.items.forEach(it => { const id = util.uid('L'); items.push({ id, description: it.description, unit: it.unit, qty: it.qty }); prices[id] = {}; prices[id][b.supplier] = util.round2(it.total / (it.qty || 1)); });
      });
      const gctSup = new Set(g.blocks.filter(b => b.gct > 0).map(b => b.supplier));
      addCreate(plan, 'comparisons', {
        ref, subject: 'Award breakdown – ' + label + ' (group ' + (gi + 1) + ')', date: year + '-' + String(month + 1).padStart(2, '0') + '-01', method: 'Restricted Bidding (RB)',
        viaGojep: true, invited: sups.length, type: 'Goods', items, _vendors: sups, _gct: Array.from(gctSup), _prices: prices, awardMode: 'item', awards: {}, status: 'Evaluated',
        _addresses: g.blocks.reduce((m, b) => { if (b.address) m[b.supplier] = b.address; return m; }, {}),
        notes: 'Imported from ' + fileName + ' (Sheet2). Workbook total: ' + util.money(g.total || 0) + '.', sheetTotal: g.total || 0
      });
    });
    if (!groups.length) plan.warnings.push('No supplier award blocks found on Sheet2.');
    return finishSuppliers(plan);
  }

  /* Procurement plan ---------------------------------------------------- */
  const PLAN_COLS = [['description', 'ITEMDESCRIPTION'], ['facility', 'FACILITY'], ['qty', 'QUANTITY'], ['source', 'FROMWHERE'], ['estimate', 'ESTIMATEDCOST'], ['monthNeeded', 'MONTHNEEDED'],
    ['method', 'PLANNEDPROCUREMENT'], ['advertisement', 'ADVERTISEMENT'], ['submission', 'SUBMISSIONOFBIDS'], ['evaluation', 'BIDEVALUATION'], ['approval', 'FINALAPPROVAL'],
    ['award', 'AWARDOFCONTRACT'], ['delivery', 'DELIVERY']];
  function parsePlan(wb, fileName) {
    const plan = newPlan('plan');
    let fy = '';
    const findFY = t => { const m = String(t || '').match(/(20\d{2})\s*[-–\/]\s*(?:20)?(\d{2})\b/); return m ? m[1] + '/' + m[2] : ''; };
    const existing = new Set(store.list('plans').map(p => [p.fy, p.category, (p.description || '').toUpperCase(), p.estimate].join('|')));
    wb.SheetNames.forEach(sn => {
      const rows = rowsOf(wb.Sheets[sn]);
      if (!fy) for (let i = 0; i < 3 && !fy; i++) fy = findFY((rows[i] || []).map(str).join(' '));
      const hi = rows.slice(0, 8).findIndex(r => (r || []).some(c => norm(c).indexOf('ITEMDESCRIPTION') === 0));
      if (hi < 0) return;
      const hdr = rows[hi].map(norm), col = {};
      PLAN_COLS.forEach(([k, p]) => { const j = hdr.findIndex(h => h.indexOf(p) === 0); if (j >= 0) col[k] = j; });
      let quarter = '', n = 0;
      const category = util.titleCase(sn.trim());
      rows.slice(hi + 1).forEach(r => {
        r = r || [];
        const d = str(r[col.description]);
        const q = d.match(/^quarter\s*(\d)/i);
        if (q && !/total/i.test(d)) { quarter = 'Q' + q[1]; return; }
        if (!d || /total/i.test(d)) return;
        const est = util.num(r[col.estimate]);
        if (!(est > 0)) return;
        plan.parsed++; n++;
        const ms = {};
        ['advertisement', 'submission', 'evaluation', 'approval', 'award', 'delivery'].forEach(k => { const v = r[col[k]]; ms[k] = isoFromCell(v) || str(v); });
        const rec = { fy: fy || findFY(fileName), category, sheet: sn.trim(), quarter, description: d, facility: str(r[col.facility]), qty: str(r[col.qty]), source: str(r[col.source]),
          estimate: est, monthNeeded: str(r[col.monthNeeded]), method: normMethod(r[col.method]), methodCode: str(r[col.method]), milestones: ms };
        if (existing.has([rec.fy, rec.category, d.toUpperCase(), est].join('|'))) { plan.present++; return; }
        addCreate(plan, 'plans', rec);
      });
      if (n) plan.sheets.push(sn.trim() + ' (' + n + ')');
    });
    if (!fy) plan.warnings.push('Could not read the plan year from the title — using the file name.');
    return finishSuppliers(plan);
  }

  /* Backup -------------------------------------------------------------- */
  function parseBackup(obj) {
    const plan = newPlan('backup');
    const data = obj && obj.data ? obj.data : obj;
    if (!data || typeof data !== 'object') { plan.warnings.push('This file is not a procurement backup.'); return finishSuppliers(plan); }
    plan._json = obj;
    store.COLLECTIONS.concat(['quotations']).forEach(c => {
      const arr = Array.isArray(data[c]) ? data[c] : [];
      if (!arr.length) return;
      const ids = new Set(store.list(c).map(r => r.id));
      const fresh = arr.filter(r => r && r.id && !ids.has(r.id)).length;
      plan.parsed += arr.length; plan.present += arr.length - fresh;
      plan.sheets.push(c + ': ' + arr.length + ' (' + fresh + ' new)');
    });
    if (!data.schemaVersion) plan.info.push('Backup from the previous procurement page — it will be upgraded automatically.');
    plan.info.push('Records that exist in both are kept at their most recent version. Backup merges cannot be undone.');
    return finishSuppliers(plan);
  }

  /* ------------------------------------------------------------- apply */
  function ensureSup(name, extra, created) {
    const before = domain.findSupplier(name);
    const s = domain.ensureSupplier(name, extra, { silent: true });
    if (s && !before) created.suppliers.push(s.id);
    return s;
  }
  function tag(rec, importId) { rec.importId = importId; return rec; }
  function applyPlan(plan, fileName) {
    const importId = util.uid('IMP');
    const created = { suppliers: [], purchaseOrders: [], invoices: [], comparisons: [], plans: [] };
    const before = [];
    let updated = 0;
    if (plan.type === 'backup') { const n = store.merge(plan._json); return { importId: null, created, updated: n, before }; }
    store.batch(() => {
      (plan.create.purchaseOrders || []).forEach(src => {
        const po = Object.assign({}, src); const inv = po._invoice; delete po._invoice;
        const sup = ensureSup(po.supplierName, po.country ? { country: po.country, type: po.type } : null, created);
        po.supplierId = sup ? sup.id : ''; po.supplierName = sup ? sup.name : po.supplierName;
        const rec = store.upsert('purchaseOrders', tag(po, importId), { silent: true });
        created.purchaseOrders.push(rec.id);
        if (inv && !store.find('invoices', i => i.poId === rec.id && i.invoiceNumber === inv.invoiceNumber)) {
          const ir = store.upsert('invoices', tag({ poId: rec.id, supplierId: rec.supplierId, invoiceNumber: inv.invoiceNumber, date: inv.date, amount: inv.amount, gct: 0, total: inv.amount, status: 'Pending' }, importId), { silent: true });
          created.invoices.push(ir.id);
        }
      });
      if (plan.patches.length) {
        const idx = existingPOIndex();
        plan.patches.forEach(pt => {
          const po = matchPRS(pt.prs, idx, null);
          if (!po) return;
          if (samePatch(po, pt.patch)) return;
          before.push({ coll: 'purchaseOrders', rec: util.clone(po) });
          const patch = Object.assign({ id: po.id }, pt.patch, { prs: Object.assign({}, po.prs || {}, pt.patch.prs) });
          if (!po.total && pt.prs.award) { patch.total = pt.prs.award; patch.subtotal = pt.prs.award; }
          if (!po.description && pt.prs.title) patch.description = pt.prs.title;
          store.upsert('purchaseOrders', patch, { silent: true });
          updated++;
          const sup = po.supplierId ? store.get('suppliers', po.supplierId) : null;
          if (sup) {
            const sp = {};
            if (!sup.country && pt.prs.country) sp.country = pt.prs.country;
            if (!sup.type && pt.prs.type) sp.type = pt.prs.type;
            if (pt.prs.msme && !sup.msme) sp.msme = true;
            if (pt.prs.category && (sup.categories || []).indexOf(pt.prs.category) < 0) sp.categories = (sup.categories || []).concat([pt.prs.category]);
            if (Object.keys(sp).length) { before.push({ coll: 'suppliers', rec: util.clone(sup) }); store.upsert('suppliers', Object.assign({ id: sup.id }, sp), { silent: true }); }
          }
        });
      }
      (plan.create.comparisons || []).forEach(src => {
        const c = Object.assign({}, src);
        const vendors = c._vendors || [], prices = c._prices || {}, gct = new Set(c._gct || []), addr = c._addresses || {};
        delete c._vendors; delete c._prices; delete c._gct; delete c._addresses;
        const map = {};
        c.suppliers = [];
        vendors.forEach(n => {
          const s = ensureSup(n, addr[n] ? { address: addr[n] } : null, created); map[n] = s.id;
          const have = c.suppliers.find(x => x.supplierId === s.id);
          if (have) { if (gct.has(n)) have.gct = true; return; }
          c.suppliers.push({ supplierId: s.id, name: s.name, compliant: true, gct: gct.has(n) });
        });
        c.prices = {};
        Object.keys(prices).forEach(itemId => { c.prices[itemId] = {}; Object.keys(prices[itemId]).forEach(n => { c.prices[itemId][map[n]] = prices[itemId][n]; }); });
        c.number = store.next('cmp');
        const rec = store.upsert('comparisons', tag(c, importId), { silent: true });
        created.comparisons.push(rec.id);
      });
      (plan.create.plans || []).forEach(p => { created.plans.push(store.upsert('plans', tag(Object.assign({}, p), importId), { silent: true }).id); });
    });
    store.emit('change', { coll: '*', action: 'import' });
    return { importId, created, updated, before };
  }
  function logImport(entry) {
    store.db.importLog = store.db.importLog || [];
    store.db.importLog.unshift(entry);
    // Keep snapshots (for undo) only on the 15 most recent imports.
    store.db.importLog.forEach((e, i) => { if (i >= 15) { delete e.before; delete e.created; e.undoable = false; } });
    if (store.db.importLog.length > 60) store.db.importLog.length = 60;
    store.save();
  }
  function removeMany(coll, ids) {
    if (!ids || !ids.length) return 0;
    const set = new Set(ids), arr = store.db[coll] || [], now = Date.now();
    const tomb = store.db.tombstones[coll] = store.db.tombstones[coll] || {};
    let n = 0;
    for (let i = arr.length - 1; i >= 0; i--) if (set.has(arr[i].id)) { tomb[arr[i].id] = now; arr.splice(i, 1); n++; }
    return n;
  }
  function undoImport(entry) {
    const c = entry.created || {};
    let n = 0;
    ['invoices', 'purchaseOrders', 'comparisons', 'plans'].forEach(coll => { n += removeMany(coll, c[coll]); });
    // Restore records this import changed.
    (entry.before || []).slice().reverse().forEach(b => {
      const arr = store.db[b.coll] || [];
      const i = arr.findIndex(r => r.id === b.rec.id);
      const rec = Object.assign({}, b.rec, { updatedAt: Date.now() });
      if (i >= 0) arr[i] = rec;
    });
    // Remove suppliers this import created, unless something else now uses them.
    const used = new Set();
    ['purchaseOrders', 'invoices', 'documents'].forEach(coll => store.list(coll).forEach(r => r.supplierId && used.add(r.supplierId)));
    store.list('comparisons').forEach(cm => (cm.suppliers || []).forEach(s => used.add(s.supplierId)));
    n += removeMany('suppliers', (c.suppliers || []).filter(id => !used.has(id)));
    entry.undone = new Date().toISOString(); entry.undoable = false;
    store.save(); store.emit('change', { coll: '*', action: 'undo-import' });
    Proc.audit('Undo Import', entry.file + ' — ' + n + ' records removed', entry.id);
    return n;
  }

  /* ---------------------------------------------------------------- UI */
  let staged = []; // [{file, name, size, type, plan, include, error}]

  async function readFile(file) {
    const name = file.name || 'file';
    try {
      if (/\.json$/i.test(name) || file.type === 'application/json') {
        const obj = JSON.parse(await file.text());
        return { file, name, size: file.size, type: 'backup', plan: parseBackup(obj), include: true };
      }
      if (!window.XLSX) throw new Error('The Excel reader did not load — check the internet connection and reload.');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const type = detect(wb);
      if (!type) return { file, name, size: file.size, type: null, error: 'This workbook was not recognised. Supported: PO Log, PRS return, ground provisions comparison, monthly procurement workbook, procurement plan.', sheets: wb.SheetNames, include: false };
      return { file, name, size: file.size, type, wb, include: true };
    } catch (e) { return { file, name, size: file.size, type: null, error: 'Could not read this file: ' + e.message, include: false }; }
  }
  /** Parse all staged workbooks in dependency order (PO Logs before PRS). */
  function planAll() {
    const order = { backup: 0, polog: 1, prs: 2, groundprov: 3, monthly: 4, plan: 5 };
    staged.sort((a, b) => (order[a.type] === undefined ? 9 : order[a.type]) - (order[b.type] === undefined ? 9 : order[b.type]));
    const ctx = { pending: new Map() };
    staged.forEach(s => {
      if (!s.wb) return;
      try {
        s.plan = s.type === 'polog' ? parsePOLog(s.wb, s.name, ctx) : s.type === 'prs' ? parsePRS(s.wb, s.name, ctx) : s.type === 'groundprov' ? parseGround(s.wb, s.name)
          : s.type === 'monthly' ? parseMonthly(s.wb, s.name) : s.type === 'plan' ? parsePlan(s.wb, s.name) : null;
      } catch (e) { console.error(e); s.error = 'Could not interpret this workbook: ' + e.message; s.include = false; }
    });
  }
  function counts(plan) {
    const c = plan.create || {};
    return { pos: (c.purchaseOrders || []).length, inv: (c.purchaseOrders || []).filter(p => p._invoice).length, cmps: (c.comparisons || []).length, plans: (c.plans || []).length };
  }
  function stat(v, l, cls) { return '<div class="imp-stat ' + (cls || '') + '"><div class="v">' + v + '</div><div class="l">' + esc(l) + '</div></div>'; }
  function fileCard(s, i) {
    const T = TYPES[s.type] || {};
    const fiCls = s.error ? 'bad' : s.type === 'backup' ? 'json' : '';
    let body = '';
    if (s.error) body = '<div class="alert danger">' + ui.icon('alert') + '<div>' + esc(s.error) + (s.sheets ? '<div class="small muted mt-1">Sheets: ' + esc(s.sheets.join(', ')) + '</div>' : '') + '</div></div>';
    else {
      const p = s.plan, c = counts(p);
      const newWord = { polog: 'New purchase orders', prs: 'New purchase orders', groundprov: 'New comparisons', monthly: 'New award summaries', plan: 'New plan items', backup: 'Records in file' }[s.type];
      const newVal = s.type === 'backup' ? util.int(p.parsed) : util.int(c.pos || c.cmps || c.plans);
      body = '<div class="imp-stats">' +
        stat(util.int(p.parsed), s.type === 'groundprov' || s.type === 'monthly' ? 'Sheets / groups read' : 'Rows read') +
        stat(newVal, newWord, 'good') +
        (s.type === 'prs' ? stat(util.int(p.updates), 'POs to enrich', p.updates ? 'good' : '') : '') +
        stat(util.int(p.present), s.type === 'backup' ? 'Already here' : 'Already imported') +
        (s.type !== 'plan' && s.type !== 'backup' ? stat(util.int((p.newSuppliers || []).length), 'New suppliers') : '') +
        (c.inv ? stat(util.int(c.inv), 'Invoices') : '') +
        stat(util.int(p.warnings.length), 'Warnings', p.warnings.length ? 'warn' : '') + '</div>' +
        (p.info.length ? '<div class="mt-2">' + p.info.map(t => '<div class="alert">' + ui.icon('info') + '<div class="small">' + esc(t) + '</div></div>').join('') + '</div>' : '') +
        (p.sheets.length ? '<details class="imp-more"><summary>Sheets (' + p.sheets.length + ')</summary><div class="imp-chips mt-1">' + p.sheets.map(n => '<span class="chip">' + esc(n) + '</span>').join('') + '</div></details>' : '') +
        ((p.newSuppliers || []).length ? '<details class="imp-more"><summary>New supplier profiles to create (' + p.newSuppliers.length + ')</summary><div class="imp-chips mt-1">' + p.newSuppliers.map(n => '<span class="chip">' + ui.icon('building', 'sm') + esc(n) + '</span>').join('') + '</div></details>' : '') +
        (p.warnings.length ? '<details class="imp-more"><summary>Warnings (' + p.warnings.length + ')</summary><ul>' + p.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></details>' : '');
    }
    return '<div class="card mt-2" data-i="' + i + '"><div class="card-h"><div class="imp-file-h"><div class="fi ' + fiCls + '">' + (s.type === 'backup' ? 'JSON' : 'XLSX') + '</div><div><div class="strong">' + esc(s.name.replace(/^[0-9a-f]{8}-/i, '')) + '</div><div class="small muted">' +
      (s.error ? 'Not recognised' : esc(T.label || '')) + ' · ' + util.fileSize(s.size) + '</div></div></div>' +
      '<div class="row">' + (s.error ? '' : '<label class="check"><input type="checkbox" data-inc="' + i + '"' + (s.include ? ' checked' : '') + '> Include</label>') +
      '<button class="btn sm ghost icon" data-rm="' + i + '" title="Remove">' + ui.icon('x', 'sm') + '</button></div></div><div class="card-b">' + body + '</div></div>';
  }

  function render(el) {
    const log = store.db.importLog || [];
    el.innerHTML = ui.pageHead({
      title: 'Import Data', sub: 'Bring your existing Excel records into the system. Every file is checked and previewed before anything is saved.',
      actions: '<button class="btn" id="impBackup">' + ui.icon('download', 'sm') + 'Download backup</button>'
    }) +
      '<div class="card"><div class="card-h"><div><h3>1. Choose files</h3><div class="sub">You can select several at once — the file type is detected automatically.</div></div><div class="imp-steps"><b>Choose</b>' + ui.icon('chevron-right', 'sm') + '<span>Review</span>' + ui.icon('chevron-right', 'sm') + '<span>Import</span></div></div>' +
      '<div class="card-b"><div id="impDrop"></div><div class="imp-types mt-3">' + Object.keys(TYPES).map(k => '<div class="imp-type"><div class="ic">' + ui.icon(TYPES[k].icon, 'sm') + '</div><div><div class="t">' + esc(TYPES[k].label) + '</div><div class="d">' + esc(TYPES[k].desc) + '</div></div></div>').join('') + '</div></div></div>' +
      '<div id="impReview"></div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>Import history</h3><div class="sub">Undo removes the records an import created and restores the ones it changed.</div></div></div><div class="card-b flush" id="impHist"></div></div>';
    ui.dropzone(el.querySelector('#impDrop'), async fs => {
      const box = el.querySelector('#impReview');
      box.innerHTML = '<div class="card mt-3"><div class="loading"><div class="spinner"></div><div class="mt-1">Reading ' + fs.length + ' ' + util.plural(fs.length, 'file') + '…</div></div></div>';
      for (const f of fs) staged.push(await readFile(f));
      planAll();
      drawReview(el);
    }, { title: 'Drop Excel workbooks (.xlsx) or a backup (.json) here, or click to browse', hint: 'PO Log · PRS returns · Ground provisions · Monthly procurement workbook · Procurement plan', accept: '.xlsx,.xls,.xlsm,.json' });
    el.querySelector('#impBackup').onclick = () => { util.download(new Blob([store.exportJSON()], { type: 'application/json' }), 'procurement-backup-' + util.today() + '.json'); Proc.audit('Export Backup', 'Downloaded JSON backup'); };
    drawReview(el);
    drawHistory(el, log);
  }

  function drawReview(el) {
    const box = el.querySelector('#impReview');
    if (!staged.length) { box.innerHTML = ''; return; }
    const ok = staged.filter(s => s.include && !s.error);
    const totals = ok.reduce((t, s) => { const c = counts(s.plan); t.pos += c.pos; t.cmps += c.cmps; t.plans += c.plans; t.upd += s.plan.updates || 0; return t; }, { pos: 0, cmps: 0, plans: 0, upd: 0 });
    const sups = new Set(); ok.forEach(s => (s.plan.newSuppliers || []).forEach(n => sups.add(domain.supplierKey(n))));
    const summary = [totals.pos ? util.int(totals.pos) + ' purchase orders' : '', totals.upd ? util.int(totals.upd) + ' PO updates from PRS' : '', totals.cmps ? util.int(totals.cmps) + ' comparisons' : '', totals.plans ? util.int(totals.plans) + ' plan items' : '', sups.size ? util.int(sups.size) + ' new suppliers' : ''].filter(Boolean).join(' · ') || 'Nothing new to import';
    box.innerHTML = '<div class="card mt-3"><div class="card-h"><div><h3>2. Review</h3><div class="sub">' + esc(summary) + '</div></div><div class="row">' +
      '<button class="btn ghost" id="impClear">Clear</button><button class="btn primary" id="impGo"' + (ok.length ? '' : ' disabled') + '>' + ui.icon('upload', 'sm') + 'Import ' + ok.length + ' ' + util.plural(ok.length, 'file') + '</button></div></div>' +
      '<div class="card-b" id="impProg" hidden></div></div>' + staged.map(fileCard).join('');
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { staged.splice(+b.dataset.rm, 1); planAll(); drawReview(el); });
    box.querySelectorAll('[data-inc]').forEach(b => b.onchange = () => { staged[+b.dataset.inc].include = b.checked; drawReview(el); });
    box.querySelector('#impClear').onclick = () => { staged = []; drawReview(el); };
    box.querySelector('#impGo').onclick = () => runImport(el);
  }

  async function runImport(el) {
    const ok = staged.filter(s => s.include && !s.error);
    if (!ok.length) return;
    const prog = el.querySelector('#impProg'); prog.hidden = false;
    el.querySelector('#impGo').disabled = true; el.querySelector('#impClear').disabled = true;
    const results = [];
    for (let i = 0; i < ok.length; i++) {
      const s = ok[i];
      prog.innerHTML = '<div class="row between small"><span>Importing <b>' + esc(s.name.replace(/^[0-9a-f]{8}-/i, '')) + '</b></span><span>' + (i + 1) + ' of ' + ok.length + '</span></div><div class="progress mt-1"><div style="width:' + Math.round(i / ok.length * 100) + '%"></div></div>';
      await new Promise(r => setTimeout(r, 30));
      // Re-plan PRS files against the live data (POs from a PO Log imported a moment ago).
      if (s.type === 'prs') s.plan = parsePRS(s.wb, s.name, null);
      try {
        const res = applyPlan(s.plan, s.name);
        const cr = res.created; const n = Object.keys(cr).reduce((t, k) => t + cr[k].length, 0);
        const entry = { id: res.importId || util.uid('IMP'), at: new Date().toISOString(), user: Proc.auth.userName(), file: s.name.replace(/^[0-9a-f]{8}-/i, ''), type: s.type,
          counts: { purchaseOrders: cr.purchaseOrders.length, invoices: cr.invoices.length, comparisons: cr.comparisons.length, plans: cr.plans.length, suppliers: cr.suppliers.length, updated: res.updated },
          created: cr, before: res.before, undoable: s.type !== 'backup' && (n > 0 || res.updated > 0) };
        logImport(entry);
        Proc.audit('Import', TYPES[s.type].label + ' “' + entry.file + '”: ' + describe(entry.counts), entry.id);
        results.push(entry);
      } catch (e) { console.error(e); results.push({ file: s.name, error: e.message }); }
    }
    store.flush();
    staged = [];
    const okRes = results.filter(r => !r.error);
    const sum = okRes.reduce((t, r) => { Object.keys(r.counts).forEach(k => { t[k] = (t[k] || 0) + r.counts[k]; }); return t; }, {});
    el.querySelector('#impReview').innerHTML = '<div class="card mt-3"><div class="card-b"><div class="alert success">' + ui.icon('check') + '<div><div class="t">Import complete</div>' + esc(describe(sum)) + '.' +
      results.filter(r => r.error).map(r => '<div class="text-danger mt-1">' + esc(r.file) + ': ' + esc(r.error) + '</div>').join('') + '</div></div>' +
      '<div class="row mt-2"><a class="btn primary" href="#/dashboard">' + ui.icon('dashboard', 'sm') + 'Open dashboard</a><a class="btn" href="#/suppliers">' + ui.icon('building', 'sm') + 'Suppliers</a><a class="btn" href="#/orders">' + ui.icon('cart', 'sm') + 'Purchase orders</a>' +
      (sum.comparisons ? '<a class="btn" href="#/sourcing">' + ui.icon('scale', 'sm') + 'Price comparisons</a>' : '') + (sum.plans ? '<a class="btn" href="#/reports?tab=plan">' + ui.icon('calendar', 'sm') + 'Procurement plan</a>' : '') + '</div></div></div>';
    ui.toast('Import complete — ' + describe(sum));
    drawHistory(el, store.db.importLog || []);
  }
  function describe(c) {
    const parts = [];
    if (c.purchaseOrders) parts.push(util.int(c.purchaseOrders) + ' POs');
    if (c.updated) parts.push(util.int(c.updated) + ' updated');
    if (c.invoices) parts.push(util.int(c.invoices) + ' invoices');
    if (c.comparisons) parts.push(util.int(c.comparisons) + ' comparisons');
    if (c.plans) parts.push(util.int(c.plans) + ' plan items');
    if (c.suppliers) parts.push(util.int(c.suppliers) + ' new suppliers');
    return parts.join(', ') || 'no changes';
  }
  function drawHistory(el, log) {
    const box = el.querySelector('#impHist');
    if (!log.length) { box.innerHTML = ui.empty('history', 'No imports yet', 'Imported files will be listed here with an option to undo.'); return; }
    ui.table(box, {
      rows: log, search: false, pageSize: 10,
      columns: [
        { key: 'at', label: 'When', render: r => '<div class="t-title">' + esc(util.dateTime(r.at)) + '</div><div class="t-sub">' + esc(r.user || '') + '</div>' },
        { key: 'file', label: 'File', render: r => '<div class="t-title truncate" style="max-width:320px" title="' + esc(r.file) + '">' + esc(r.file) + '</div><div class="t-sub">' + esc((TYPES[r.type] || {}).label || r.type) + '</div>' },
        { key: 'counts', label: 'Result', sort: false, render: r => esc(describe(r.counts || {})) },
        { key: 'status', label: 'Status', sort: r => (r.undone ? 1 : 0), render: r => r.undone ? ui.badge('Undone', '') : ui.badge('Imported', 'success') },
        { key: 'act', label: '', sort: false, cls: 'actions', render: r => r.undoable && !r.undone ? '<button class="btn sm" data-undo="' + esc(r.id) + '">' + ui.icon('history', 'sm') + 'Undo</button>' : '' }
      ],
      bind: tb => tb.querySelectorAll('[data-undo]').forEach(b => b.onclick = async () => {
        const entry = (store.db.importLog || []).find(e => e.id === b.dataset.undo);
        if (!entry) return;
        if (!await ui.confirm('Undo the import of <b>' + esc(entry.file) + '</b>? This removes ' + esc(describe(Object.assign({}, entry.counts, { updated: 0 }))) + (entry.counts.updated ? ' and restores ' + entry.counts.updated + ' updated records' : '') + '. Records you have since linked to other work are kept.', { danger: true, ok: 'Undo import' })) return;
        const n = undoImport(entry); ui.toast('Import undone — ' + n + ' records removed'); drawHistory(el, store.db.importLog || []);
      })
    });
  }

  Proc.page({ id: 'import', title: 'Import Data', icon: 'upload', section: 'Insights', order: 20, render });
  Proc.quickCreate.push({ label: 'Import Excel records', icon: 'upload', order: 90, onClick: () => Proc.router.go('import') });

  // Exposed for tests and for other modules (e.g. the dashboard's empty state).
  Proc.importer = { detect, parsePOLog, parsePRS, parseGround, parseMonthly, parsePlan, applyPlan, undoImport, parseQtyLine };
})();
