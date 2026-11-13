/* ==========================================================================
   Budget (#/budget) — monthly "Procurement for Approval" sheet and live
   budget-vs-actual for the fiscal year.

   Records (shared dataset, synced like everything else):
     budgetLines  { id, fy:'2026/27', name, suppliers, monthlyAllocation, contractual, keywords, order, active }
     budgetMonths { id, month:'2026-11', fy, commitment, contractualOverride, status:'Draft'|'Submitted'|'Approved',
                    entries:[{ id, lineId, supplier, amount, approved, comment, contractual }],
                    submittedAt, approvedAt, approvedBy, importedFrom, notes }
   Purchase orders can carry budgetLineId; otherwise they are matched to a line
   by its keywords and suppliers so the live view works without extra typing.

   Tabs: Monthly approval · Budget vs actual · Purchase orders · Budget lines.
   PDFs: "Procurement for Approval – <Month>" and "Budget vs Actual", on the letterhead
   (also listed on Reports & PRS → PDF Reports).
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain } = Proc;
  const esc = util.esc;
  const num = util.num;

  /* ------------------------------------------------------------ months & FY */
  const today = () => util.today();
  const ymOf = iso => String(iso || '').slice(0, 7);
  const addMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const monthName = ym => { const [y, m] = ym.split('-').map(Number); return util.MONTHS[m - 1] + ' ' + y; };
  const shortMonth = ym => { const [, m] = ym.split('-').map(Number); return util.MONTHS[m - 1]; };
  const fyOf = ym => util.fiscalYear(ym + '-01');
  const fyMonths = fy => { const s = util.fyRange(fy).start.slice(0, 7); const out = []; for (let i = 0; i < 12; i++) out.push(addMonth(s, i)); return out; };
  const fyEndYm = fy => util.fyRange(fy).end.slice(0, 7);

  /* ------------------------------------------------------------ defaults
     The hospital's budget lines, in the order of the monthly approval sheet,
     with words that identify their purchase orders. */
  const DEFAULT_LINES = [
    ['Drugs', 'NHF-Contractual', 'drug,pharm,medication,tablet,capsule,injection', true],
    ['Medical Supplies', 'NHF', 'medical suppl,sundr,glove,syringe,gauze,catheter,needle,bandage,dressing', false],
    ['Laboratory Supplies', 'NHF Contractual', 'lab,reagent,tube,specimen,blood bank,test kit', false],
    ['Cleaning Sanit. Chemical & Toiletries', 'Manpower / Bioden / Liquid Chem / Zep Products', 'clean,chemical,bleach,toilet,sanit,detergent,disinfect,soap,tissue', false],
    ['Food and Drink', '', 'food,grocery,chicken,meat,fish,vegetable,produce,juice,provision,dietary,bread,milk,rice,flour', false],
    ['Stationery Supplies', '', 'stationery,paper,pen,folder,envelope,file', false],
    ['Printing', '', 'print,toner,cartridge,ink', false],
    ['Clothing and Bedding', '', 'linen,sheet,uniform,bedding,pillow,blanket,towel,scrub', false],
    ['Cooking Fuel', 'Massy Gas', 'cooking gas,lpg,propane,massy gas', false],
    ['Bulk Oxygen', 'IGL-Contractual', 'oxygen,igl', true],
    ['Bulk Gas Oil (Diesel)', 'JAA', 'diesel,gas oil', false],
    ['Small Equipment & Appliances', '', 'appliance,kettle,microwave,fan,small equipment', false],
    ['Furn. Mach. and Equipment', '', 'furniture,chair,desk,cabinet,table,washing machine,machine,stove,refrigerator', false],
    ['Scientific & Medical Equipment', 'Arel', 'monitor,ventilator,defibrillator,medical equipment,scientific,ecg,ultrasound,suction', false],
    ['Staff Welfare', '', 'welfare,staff party,staff function', false],
    ['Maintenance & Electrical Supplies', '', 'electrical,plumbing,maintenance suppl,bulb,cable,breaker,pipe,fitting', false],
    ['Repair to Government Facilities', 'National Selfserve Wholesale', 'repair to building,renovation,door,roof,building repair,construction,paint', false],
    ['Repair to Machine and Equipment', '', 'repair to machine,servicing,service of,equipment repair', false],
    ['Coffee Break', '', 'coffee break,refreshment,catering', false],
    ['Rental of Building', '', 'rental of building,rent', false],
    ['Rental of Machinery/Equipment', '', 'rental of equipment,rental of machine,equipment rental,hire of', false],
    ['Security', 'Modern Investigation', 'security,guard,modern investigation', false],
    ['Janitorial / Waste Disposal', 'Milestone / SPM Waste Mgmt / Leomaxx', 'janitorial,waste,pest,garbage,disposal,milestone,spm,leomaxx', false]
  ];
  const ALIASES = { 'staff well fare': 'staff welfare', 'staff wellfare': 'staff welfare', 'janitorial waste': 'janitorial waste disposal' };
  const key = s => { const k = key0(s); return ALIASES[k] || k; };
  const key0 = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|of|and)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const isContractual = supplier => /\b(nhf|igl)\b|contract/i.test(String(supplier || ''));

  /* ------------------------------------------------------------ data access */
  const linesFor = fy => store.list('budgetLines').filter(l => l.fy === fy && l.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
  const monthRec = ym => store.find('budgetMonths', m => m.month === ym) || null;
  function ensureLines(fy) {
    if (linesFor(fy).length) return linesFor(fy);
    // Copy last year's lines when they exist; otherwise start from the hospital's standard list.
    const prevFy = util.fiscalYear(util.addDays(util.fyRange(fy).start, -1));
    const prev = linesFor(prevFy);
    const src = prev.length ? prev.map(l => [l.name, l.suppliers, l.keywords, l.contractual, l.monthlyAllocation]) : DEFAULT_LINES;
    src.forEach((d, i) => store.upsert('budgetLines', { fy, name: d[0], suppliers: d[1] || '', keywords: d[2] || '', contractual: !!d[3], monthlyAllocation: num(d[4]), order: (i + 1) * 10, active: true }, { silent: true }));
    store.emit('change', { coll: 'budgetLines', action: 'create' });
    return linesFor(fy);
  }
  /** Sum of entries, the contractual part, and the figures under the sheet. */
  function totals(m, lines) {
    const es = (m && m.entries) || [];
    const allocation = util.sum(lines, l => num(l.monthlyAllocation));
    const amount = util.sum(es, e => num(e.amount));
    const approved = util.sum(es, e => num(e.approved !== undefined && e.approved !== null && e.approved !== '' ? e.approved : 0));
    const contractualCalc = util.sum(es.filter(e => e.contractual), e => num(e.amount));
    const contractual = m && m.contractualOverride !== undefined && m.contractualOverride !== null && m.contractualOverride !== '' ? num(m.contractualOverride) : contractualCalc;
    const afterContractual = util.round2(amount - contractual);
    const commitment = num(m && m.commitment);
    return { allocation, amount, approved, contractual, contractualCalc, afterContractual, commitment, variance: util.round2(commitment - afterContractual) };
  }
  /** The approved figure of an entry (falls back to the amount once the month is approved). */
  const approvedOf = (m, e) => (e.approved !== undefined && e.approved !== null && e.approved !== '' ? num(e.approved) : (m.status === 'Approved' ? num(e.amount) : 0));
  const lineApproved = (m, lineId) => m ? util.sum((m.entries || []).filter(e => e.lineId === lineId), e => approvedOf(m, e)) : 0;
  /** Last month's approved figure for each row of a line (row by row, as on the sheet; extra rows add to the last). */
  function prevRows(pm, lineId, count) {
    const out = new Array(Math.max(1, count)).fill(0);
    if (!pm) return out;
    (pm.entries || []).filter(e => e.lineId === lineId).forEach((e, i) => { out[Math.min(i, out.length - 1)] += approvedOf(pm, e); });
    return out.map(util.round2);
  }
  const lineAmount = (m, lineId) => m ? util.sum((m.entries || []).filter(e => e.lineId === lineId), e => num(e.amount)) : 0;

  /** Which budget line a purchase order belongs to: chosen line, else by supplier, else by words. */
  function lineForPO(po, lines) {
    if (po.budgetLineId) { const l = lines.find(x => x.id === po.budgetLineId); if (l) return { line: l, how: 'set' }; }
    const sup = key(po.supplierName || domain.supplierName(po.supplierId));
    const text = ' ' + key([po.description, po.category, (po.items || []).map(i => i.description).join(' ')].join(' ')) + ' ';
    for (const l of lines) {
      const sups = String(l.suppliers || '').split(/[\/,;]+/).map(key).filter(s => s && s.length > 2 && !/^(nhf|contractual|nhf contractual)$/.test(s));
      if (sup && sups.some(s => sup.indexOf(s) >= 0 || s.indexOf(sup) >= 0)) return { line: l, how: 'supplier' };
    }
    let best = null, bestScore = 0;
    lines.forEach(l => {
      const words = String(l.keywords || '').split(',').map(key).filter(Boolean);
      const score = words.reduce((n, w) => n + (text.indexOf(' ' + w) >= 0 ? w.length : 0), 0);
      if (score > bestScore) { bestScore = score; best = l; }
    });
    return best ? { line: best, how: 'words' } : { line: null, how: '' };
  }
  const activePOs = () => store.list('purchaseOrders').filter(p => p.status !== 'Cancelled' && p.status !== 'Draft');
  function posByLine(fy, uptoYm, lines) {
    const range = { start: util.fyRange(fy).start, end: (uptoYm ? uptoYm + '-31' : util.fyRange(fy).end) };
    const out = {}; lines.forEach(l => { out[l.id] = { n: 0, v: 0, month: 0, monthN: 0 }; }); out._none = { n: 0, v: 0, month: 0, monthN: 0 };
    activePOs().filter(p => p.date && p.date >= range.start && p.date <= range.end).forEach(p => {
      const r = lineForPO(p, lines); const k = r.line ? r.line.id : '_none';
      out[k].n++; out[k].v += num(p.total);
      if (uptoYm && ymOf(p.date) === uptoYm) { out[k].monthN++; out[k].month += num(p.total); }
    });
    return out;
  }
  /** Figures for each line for the fiscal year, up to and including the chosen month. */
  function budgetVsActual(fy, uptoYm) {
    const lines = linesFor(fy), months = fyMonths(fy).filter(ym => ym <= uptoYm);
    const recs = months.map(monthRec);
    const pos = posByLine(fy, uptoYm, lines);
    const rows = lines.map(l => {
      const annual = num(l.monthlyAllocation) * 12, todate = num(l.monthlyAllocation) * months.length;
      const approved = util.round2(util.sum(recs, m => lineApproved(m, l.id)));
      const requested = util.round2(util.sum(recs, m => lineAmount(m, l.id)));
      return { line: l, annual, todate, approved, requested, poValue: util.round2(pos[l.id].v), poCount: pos[l.id].n, balance: util.round2(todate - approved), annualLeft: util.round2(annual - approved), pct: annual ? approved / annual * 100 : 0 };
    });
    const byMonth = fyMonths(fy).map(ym => { const m = monthRec(ym); return { ym, allocation: util.sum(lines, l => num(l.monthlyAllocation)), approved: m ? util.sum(m.entries || [], e => approvedOf(m, e)) : 0, requested: m ? util.sum(m.entries || [], e => num(e.amount)) : 0, status: m ? m.status : '' }; });
    return { lines, months, rows, pos, byMonth };
  }

  /* ------------------------------------------------------------ import the workbook */
  const MONTH_RE = /(january|february|march|april|may|june|july|august|september|october|november|december)\s*,?\s*(\d{4})?/i;
  async function importWorkbook(file) {
    if (!window.XLSX) throw new Error('The Excel library did not load. Check the internet connection and reload.');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sn = wb.SheetNames.find(n => /amount\s*for\s*approval/i.test(n)) || wb.SheetNames.find(n => {
      const r = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }).slice(0, 8);
      return r.some(x => (x || []).some(c => /monthly\s*allocation/i.test(String(c || ''))));
    });
    if (!sn) throw new Error('No “Amount for Approval” sheet (with a Monthly Allocation column) was found in this workbook.');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null });
    const hi = rows.findIndex(r => (r || []).some(c => /^\s*description\s*$/i.test(String(c || ''))) && (r || []).some(c => /monthly\s*allocation/i.test(String(c || ''))));
    if (hi < 0) throw new Error('Could not find the header row (Description · Monthly Allocation · Amount for Approval).');
    const H = rows[hi].map(c => String(c || ''));
    const col = re => H.findIndex(h => re.test(h));
    const cDesc = col(/^\s*description/i), cSup = col(/supplier/i), cAlloc = col(/monthly\s*allocation/i), cAmt = col(/amount\s*for\s*approval/i), cPrev = col(/approved/i), cCom = col(/comment/i);
    // Month of the sheet: title row, else the "Amount for Approval <Month>" header, else the file name.
    const title = rows.slice(0, hi).map(r => (r || []).filter(Boolean).join(' ')).join(' ');
    // Prefer "<Month> <year>" (the title reads "MAY PEN HOSPITAL NOVEMBER 2026" — "May" there is the town).
    const withYear = txt => { const re = new RegExp(MONTH_RE.source, 'gi'); let x; while ((x = re.exec(String(txt || '')))) { if (x[2]) return x; } return null; };
    const cleanName = file.name.replace(/^[0-9a-f]{8}-/i, '').replace(/may\s*pen/ig, '');
    let mt = withYear(title) || withYear(H[cAmt]) || withYear(cleanName) || MONTH_RE.exec(String(H[cAmt] || '')) || MONTH_RE.exec(cleanName);
    if (!mt) throw new Error('Could not tell which month this sheet is for.');
    const mIdx = util.MONTHS.findIndex(x => x.toLowerCase() === mt[1].toLowerCase());
    const yr = Number(mt[2] || (withYear(cleanName) || [])[2] || new Date().getFullYear());
    const ym = yr + '-' + String(mIdx + 1).padStart(2, '0');
    const prevYm = addMonth(ym, -1);
    const fy = fyOf(ym);
    const lines = ensureLines(fy);
    const byKey = new Map(lines.map(l => [key(l.name), l]));
    const entries = [], prevEntries = [];
    let current = null, order = 0, contractualCur = null, contractualPrev = null, commitment = null, inSummary = false;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const d = String(r[cDesc] || '').trim(), sup = String(cSup >= 0 ? r[cSup] || '' : '').trim();
      const val = c => (c >= 0 && typeof r[c] === 'number' ? r[c] : (c >= 0 && /^[\s\-–]*$/.test(String(r[c] || '')) ? 0 : num(r[c])));
      if (/^sub\s*total/i.test(d)) { inSummary = true; continue; }
      if (/contractual/i.test(d) && /less/i.test(d)) { contractualCur = val(cAmt); contractualPrev = val(cPrev); continue; }
      if (/total\s+after/i.test(d)) continue;
      if (/^variance/i.test(d)) { commitment = val(cAlloc); continue; }
      if (/^\s*$/.test(d) && /^commitment$/i.test(sup)) { commitment = val(cAlloc); continue; }
      if (inSummary) continue;   // only the totals block follows the Sub Total row
      if (d) {
        if (/^\$|^description/i.test(d)) continue;
        let line = byKey.get(key(d)) || lines.find(l => key(l.name).indexOf(key(d)) === 0 || key(d).indexOf(key(l.name)) === 0);
        if (!line) { line = store.upsert('budgetLines', { fy, name: d.replace(/\s+/g, ' ').trim(), suppliers: sup, keywords: key(d), contractual: isContractual(sup), monthlyAllocation: 0, order: 900 + order, active: true }); lines.push(line); byKey.set(key(line.name), line); }
        const alloc = val(cAlloc);
        const patch = { id: line.id, order: (++order) * 10 };
        if (alloc) patch.monthlyAllocation = util.round2(alloc);
        if (sup && !line.suppliers) patch.suppliers = sup;
        store.upsert('budgetLines', patch, { silent: true });
        current = line;
      }
      if (!current) continue;
      const amt = val(cAmt), prev = val(cPrev), com = cCom >= 0 && typeof r[cCom] === 'string' ? r[cCom].trim() : '';
      if (!d && !sup && !amt && !prev && !com) continue;
      entries.push({ id: util.uid('BE'), lineId: current.id, supplier: sup, amount: util.round2(amt), approved: null, comment: com, contractual: isContractual(sup) });
      prevEntries.push({ id: util.uid('BE'), lineId: current.id, supplier: sup, amount: util.round2(prev), approved: util.round2(prev), comment: '', contractual: isContractual(sup) });
    }
    if (!entries.length) throw new Error('No budget lines were found under the header row.');
    // Keep one empty row for lines on the sheet with nothing requested so every line shows.
    const existing = monthRec(ym);
    const rec = store.upsert('budgetMonths', Object.assign({}, existing ? { id: existing.id } : {}, {
      month: ym, fy, commitment: commitment !== null ? util.round2(commitment) : num(existing && existing.commitment),
      contractualOverride: contractualCur !== null && Math.abs(contractualCur - util.sum(entries.filter(e => e.contractual), e => e.amount)) > 0.5 ? util.round2(contractualCur) : null,
      entries, status: existing && existing.status === 'Approved' ? 'Approved' : 'Submitted', importedFrom: file.name, submittedAt: (existing && existing.submittedAt) || new Date().toISOString()
    }));
    let prevNote = '';
    const pm = monthRec(prevYm);
    if (!pm && prevEntries.some(e => e.amount)) {
      store.upsert('budgetMonths', { month: prevYm, fy: fyOf(prevYm), commitment: commitment !== null ? util.round2(commitment) : 0, contractualOverride: contractualPrev !== null && Math.abs(contractualPrev - util.sum(prevEntries.filter(e => e.contractual), e => e.amount)) > 0.5 ? util.round2(contractualPrev) : null,
        entries: prevEntries.filter(e => e.amount), status: 'Approved', approvedAt: new Date().toISOString(), approvedBy: 'From the ' + monthName(ym) + ' sheet', importedFrom: file.name });
      prevNote = ' ' + monthName(prevYm) + '’s approved amounts were added from the same sheet.';
    } else if (pm && pm.status !== 'Approved' && !(pm.entries || []).some(e => e.approved !== null && e.approved !== undefined) && prevEntries.some(e => e.amount)) {
      // The month before was imported from its own sheet (requests only): this sheet's
      // "Amount approved" column records what was approved — row by row, per budget line.
      const ents = (pm.entries || []).map(e => Object.assign({}, e)), used = new Set();
      prevEntries.forEach(pe => {
        const i = ents.findIndex((e, k) => !used.has(k) && e.lineId === pe.lineId && (!pe.supplier || !e.supplier || key(e.supplier) === key(pe.supplier)));
        if (i >= 0) { used.add(i); ents[i].approved = pe.amount; }
        else if (pe.amount) ents.push(Object.assign({}, pe, { amount: 0 }));
      });
      ents.forEach((e, k) => { if (!used.has(k) && (e.approved === null || e.approved === undefined)) e.approved = 0; });
      store.upsert('budgetMonths', { id: pm.id, entries: ents, status: 'Approved', approvedAt: new Date().toISOString(), approvedBy: 'From the ' + monthName(ym) + ' sheet' });
      prevNote = ' ' + monthName(prevYm) + '’s approved amounts were recorded from the same sheet.';
    }
    Proc.audit('Import Budget', monthName(ym) + ' approval sheet from ' + file.name, rec.id);
    return { ym, entries: entries.length, note: prevNote };
  }

  /* ------------------------------------------------------------ PDFs */
  function kit() { const k = Proc.pdf && Proc.pdf.kit; if (!k) throw new Error('The PDF engine is not loaded.'); return k; }
  /** The monthly "Procurement for Approval" sheet on the letterhead. */
  function approvalPdf(ym, output) {
    const K = kit(), clean = K.clean, fy = fyOf(ym), lines = linesFor(fy), m = monthRec(ym), pm = monthRec(addMonth(ym, -1));
    if (!m) throw new Error('There is no approval sheet for ' + monthName(ym) + ' yet.');
    const t = totals(m, lines), tp = pm ? totals(pm, lines) : null;
    const doc = K.newDoc('landscape'), { w, h } = K.pageSize(doc), M = 36; let y = K.top;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor.apply(doc, K.BLUE);
    doc.text(clean('PROCUREMENT FOR APPROVAL - ' + monthName(ym).toUpperCase()), M, y + 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, K.GREY);
    doc.text(clean(store.settings().org.hospital + '  ·  Fiscal year ' + fy + '  ·  Status: ' + (m.status || 'Draft') + (m.approvedAt ? ' ' + util.date(String(m.approvedAt).slice(0, 10)) : '')), M, y + 26);
    doc.text(clean('Generated ' + util.dateTime(Date.now()) + ' by ' + domain.officer().name), w - M, y + 12, { align: 'right' });
    const body = [];
    lines.forEach(l => {
      const es = (m.entries || []).filter(e => e.lineId === l.id);
      const pr = prevRows(pm, l.id, es.length);
      if (!es.length) { body.push([l.name, l.suppliers || '', num(l.monthlyAllocation) ? util.money(l.monthlyAllocation) : '', '-', pr[0] ? util.money(pr[0]) : '-', '']); return; }
      es.forEach((e, i) => body.push([i === 0 ? l.name : '', e.supplier || (i === 0 ? l.suppliers || '' : ''), i === 0 && num(l.monthlyAllocation) ? util.money(l.monthlyAllocation) : '', num(e.amount) ? util.money(e.amount) : '-', pr[i] ? util.money(pr[i]) : '-', (e.contractual ? '[Contractual] ' : '') + (e.comment || '')]));
    });
    const foot = [
      ['Sub Total', '', util.money(t.allocation), util.money(t.amount), tp ? util.money(tp.approved || tp.amount) : '', ''],
      ['Less MOH Contractual Amount', 'NHF, IGL', '', util.money(t.contractual), tp ? util.money(tp.contractual) : '', ''],
      ['Total after Contractual Amount Deducted', '', '', util.money(t.afterContractual), tp ? util.money(tp.afterContractual) : '', ''],
      ['Commitment', '', util.money(t.commitment), '', '', ''],
      ['Variance (Commitment - Total after contractual)', '', '', (t.variance < 0 ? '-' : '') + util.money(Math.abs(t.variance)), tp ? (tp.variance < 0 ? '-' : '') + util.money(Math.abs(tp.variance)) : '', t.variance < 0 ? 'Over commitment' : 'Within commitment']
    ];
    doc.autoTable({
      startY: y + 40, margin: { left: M, right: M, top: K.top, bottom: 84 }, theme: 'grid',
      head: [['Description', 'Suppliers', 'Monthly Allocation', 'Amount for Approval ' + shortMonth(ym), 'Amount Approved ' + shortMonth(addMonth(ym, -1)), 'Comments']],
      body: body.map(r => r.map(clean)), foot: foot.map(r => r.map(clean)), showFoot: 'lastPage',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3.2, lineColor: [215, 220, 228], lineWidth: 0.4, textColor: K.INK, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: K.BLUE, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [234, 241, 247], textColor: K.INK, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 170, fontStyle: 'bold' }, 1: { cellWidth: 130 }, 2: { cellWidth: 92, halign: 'right' }, 3: { cellWidth: 100, halign: 'right' }, 4: { cellWidth: 100, halign: 'right' } },
      didParseCell: d => { if ((d.section === 'head' || d.section === 'foot') && d.column.index >= 2 && d.column.index <= 4) d.cell.styles.halign = 'right'; if (d.section === 'foot' && d.row.index === 4 && d.column.index === 3 && t.variance < 0) d.cell.styles.textColor = [185, 28, 28]; }
    });
    y = doc.lastAutoTable.finalY + 14;
    if (m.notes) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, K.INK); const l = doc.splitTextToSize(clean('Notes: ' + m.notes), w - M * 2); if (y + l.length * 10 > h - 150) { doc.addPage(); y = K.top; } doc.text(l, M, y + 6); y += l.length * 10 + 6; }
    if (y > h - 150) { doc.addPage(); y = K.top; }
    y += 34;
    const S = store.settings().signatories || {}, off = domain.officer(), cw = (w - M * 2 - 40) / 3;
    [['Prepared by', off.name, off.title], ['Checked by', '', ''], ['Approved by', (S.parishManager || {}).name || '', (S.parishManager || {}).title || '']].forEach(([lab, nm, ti], i) => {
      const x = M + i * (cw + 20);
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.5); doc.line(x, y, x + cw, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, K.GREY); doc.text(lab.toUpperCase() + '   DATE: ____________', x, y + 10);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, K.INK); if (nm) doc.text(clean(nm), x, y + 22);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); if (ti) doc.text(clean(ti), x, y + (nm ? 33 : 22));
    });
    K.finish(doc, { side: false, alwaysNumber: true, pageLabel: 'Procurement for Approval ' + monthName(ym) });
    doc.setProperties({ title: 'Procurement for Approval - ' + monthName(ym) });
    return K.deliver(doc, 'Procurement for Approval - ' + monthName(ym) + '.pdf', output || 'open');
  }

  /* Report definitions for Reports & PRS → PDF Reports (and the PDF button on this page). */
  const REPORT_DEFS = [
    {
      id: 'budget-approval', group: 'Budget', title: 'Procurement for Approval (monthly)', icon: 'wallet', period: true,
      desc: 'The monthly approval sheet: allocation, amount for approval, last month approved, contractual deduction, commitment and variance. Uses the month the period starts in.',
      build(p) {
        const ym = ymOf(p.from), fy = fyOf(ym), lines = linesFor(fy), m = monthRec(ym), pm = monthRec(addMonth(ym, -1));
        if (!m) return { subtitle: monthName(ym), sections: [{ title: 'Approval sheet', columns: [{ label: 'Description' }], rows: [], empty: 'There is no approval sheet for ' + monthName(ym) + ' yet. Prepare it on the Budget page.' }] };
        const t = totals(m, lines), tp = pm ? totals(pm, lines) : null;
        const rows = [];
        lines.forEach(l => { const es = (m.entries || []).filter(e => e.lineId === l.id); const pr = prevRows(pm, l.id, es.length); (es.length ? es : [{ supplier: '', amount: 0, comment: '' }]).forEach((e, i) => rows.push([i ? '' : l.name, e.supplier || (i ? '' : l.suppliers || ''), i ? '' : num(l.monthlyAllocation), num(e.amount), pr[i] || '', e.comment || ''])); });
        return {
          subtitle: monthName(ym) + ' · ' + (m.status || 'Draft'),
          kpis: [{ label: 'Amount for approval', value: util.moneyShort(t.amount) }, { label: 'Less MOH contractual', value: util.moneyShort(t.contractual) }, { label: 'After contractual', value: util.moneyShort(t.afterContractual), note: 'Commitment ' + util.moneyShort(t.commitment) }, { label: 'Variance', value: (t.variance < 0 ? '-' : '') + util.moneyShort(Math.abs(t.variance)), note: t.variance < 0 ? 'Over commitment' : 'Within commitment' }],
          sections: [{ title: 'Procurement for approval', columns: [{ label: 'Description' }, { label: 'Suppliers' }, { label: 'Monthly allocation', type: 'money' }, { label: 'For approval ' + shortMonth(ym), type: 'money' }, { label: 'Approved ' + shortMonth(addMonth(ym, -1)), type: 'money' }, { label: 'Comments' }], rows,
            totals: [['Sub Total', '', t.allocation, t.amount, tp ? tp.approved : '', ''], ['Less MOH contractual (NHF, IGL)', '', '', t.contractual, tp ? tp.contractual : '', ''], ['Total after contractual', '', '', t.afterContractual, tp ? tp.afterContractual : '', ''], ['Commitment', '', t.commitment, '', '', ''], ['Variance', '', '', t.variance, tp ? tp.variance : '', t.variance < 0 ? 'Over commitment' : '']] }],
          orientation: 'landscape'
        };
      }
    },
    {
      id: 'budget-actual', group: 'Budget', title: 'Budget vs Actual', icon: 'chart', period: true,
      desc: 'For the fiscal year up to the end of the period: allocation, approved, purchase orders raised and balance for every budget line.',
      build(p) {
        const ym = ymOf(p.to), fy = fyOf(ym), r = budgetVsActual(fy, ym);
        const T = k => util.round2(util.sum(r.rows, x => x[k]));
        return {
          subtitle: 'Fiscal year ' + fy + ' · April to ' + monthName(ym) + ' (' + r.months.length + ' ' + util.plural(r.months.length, 'month') + ')',
          kpis: [{ label: 'Annual allocation', value: util.moneyShort(T('annual')) }, { label: 'Allocation to date', value: util.moneyShort(T('todate')) }, { label: 'Approved to date', value: util.moneyShort(T('approved')), note: T('todate') ? Math.round(T('approved') / T('todate') * 100) + '% of allocation to date' : '' }, { label: 'POs raised to date', value: util.moneyShort(T('poValue')) }],
          chart: { title: 'Approved to date by budget line', rows: r.rows.map(x => ({ label: x.line.name, value: x.approved })).sort((a, b) => b.value - a.value), money: true },
          sections: [
            { title: 'By budget line', columns: [{ label: 'Budget line' }, { label: 'Annual allocation', type: 'money' }, { label: 'Allocation to date', type: 'money' }, { label: 'Approved to date', type: 'money' }, { label: 'POs raised', type: 'money' }, { label: 'Balance to date', type: 'money' }, { label: 'Annual remaining', type: 'money' }, { label: 'Used of year', type: 'pct' }],
              rows: r.rows.map(x => [x.line.name, x.annual, x.todate, x.approved, x.poValue, x.balance, x.annualLeft, util.round2(x.pct)]), totals: [['Total', T('annual'), T('todate'), T('approved'), T('poValue'), T('balance'), T('annualLeft'), T('annual') ? util.round2(T('approved') / T('annual') * 100) : 0]] },
            { title: 'By month', columns: [{ label: 'Month' }, { label: 'Allocation', type: 'money' }, { label: 'Requested', type: 'money' }, { label: 'Approved', type: 'money' }, { label: 'Status' }], rows: r.byMonth.filter(x => x.ym <= ym).map(x => [monthName(x.ym), x.allocation, x.requested, x.approved, x.status || 'Not prepared']) }
          ],
          notes: ['Allocation to date = monthly allocation x months of the fiscal year so far. Purchase orders are counted against the budget line chosen on the Budget page, or matched by supplier and description.'],
          orientation: 'landscape'
        };
      }
    }
  ];
  if (Proc.reportPdf) Proc.reportPdf.register(REPORT_DEFS);

  /* ------------------------------------------------------------ page */
  const S = { ym: '', tab: 'month' };
  const CSS = '.bg-sheet td,.bg-sheet th{vertical-align:middle}.bg-sheet .ln td{border-top:1px solid var(--border)}' +
    '.bg-sheet input.input{height:32px;min-width:0}.bg-sheet .amt{width:150px;text-align:right}.bg-sheet .sup{min-width:150px}.bg-sheet .com{min-width:200px}' +
    '.bg-sheet tfoot td{font-weight:700;background:var(--surface-2)}.bg-sheet .muted-cell{color:var(--text-3)}.bg-sheet .lnname{font-weight:650}' +
    '.bg-bar{height:8px;border-radius:99px;background:var(--surface-3);overflow:hidden;min-width:90px}.bg-bar i{display:block;height:100%;border-radius:99px;background:var(--primary)}.bg-bar i.over{background:var(--danger)}.bg-bar i.warn{background:var(--warning)}' +
    '.bg-month{display:inline-flex;align-items:center;gap:6px}.bg-month .lbl{min-width:150px;text-align:center;font-weight:650}' +
    '.bg-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:2px 9px;border-radius:99px;background:var(--surface-3);color:var(--text-2)}';

  function render(el) {
    if (!document.getElementById('bgCss')) document.head.insertAdjacentHTML('beforeend', '<style id="bgCss">' + CSS + '</style>');
    const q = Proc.router.parse().query || {};
    if (q.m && /^\d{4}-\d{2}$/.test(q.m)) S.ym = q.m;
    if (q.tab) S.tab = q.tab;
    if (!S.ym) { const months = store.list('budgetMonths').map(m => m.month).sort(); S.ym = months.length ? months[months.length - 1] : ymOf(today()); }
    const fy = fyOf(S.ym), lines = ensureLines(fy), m = monthRec(S.ym), t = totals(m, lines);
    const tabs = [['month', 'Monthly approval', 'clipboard'], ['actual', 'Budget vs actual', 'chart'], ['pos', 'Purchase orders', 'cart'], ['lines', 'Budget lines', 'settings']];
    el.innerHTML = ui.pageHead({
      title: 'Budget', sub: 'Plan each month’s procurement against the allocation, record what is approved, and watch spending live against the budget.',
      actions: '<button class="btn" id="bgImport">' + ui.icon('upload', 'sm') + 'Import approval sheet</button><button class="btn primary" id="bgPdf">' + ui.icon('file', 'sm') + 'PDF</button>'
    }) +
      '<div class="toolbar" style="padding:0;margin-bottom:14px;gap:10px;flex-wrap:wrap"><div class="bg-month"><button class="btn icon" id="bgPrev" title="Previous month">' + ui.icon('arrow-left', 'sm') + '</button><span class="lbl">' + esc(monthName(S.ym)) + '</span><button class="btn icon" id="bgNext" title="Next month">' + ui.icon('chevron-right', 'sm') + '</button></div>' +
      '<span class="bg-chip">' + ui.icon('calendar', 'sm') + 'FY ' + esc(fy) + '</span>' + (m ? ui.badge(m.status || 'Draft', { Draft: '', Submitted: 'warning', Approved: 'success' }[m.status || 'Draft']) : '<span class="bg-chip">Not prepared</span>') +
      (m && m.importedFrom ? '<span class="small muted">Imported from ' + esc(m.importedFrom.replace(/^[0-9a-f]{8}-/i, '')) + '</span>' : '') + '</div>' +
      '<div class="grid c4">' +
      ui.kpi({ label: 'Monthly allocation', icon: 'wallet', value: util.moneyShort(t.allocation), title: util.money(t.allocation), meta: util.int(lines.length) + ' budget lines' }) +
      ui.kpi({ label: 'Amount for approval', icon: 'clipboard', value: util.moneyShort(t.amount), title: util.money(t.amount), meta: 'Less contractual ' + util.moneyShort(t.contractual) }) +
      ui.kpi({ label: 'After contractual vs commitment', icon: 'target', value: util.moneyShort(t.afterContractual), title: util.money(t.afterContractual), meta: 'Commitment ' + util.moneyShort(t.commitment) }) +
      ui.kpi({ label: 'Variance', icon: 'trend', tone: !m ? '' : t.variance < 0 ? 'bad' : 'ok', value: (t.variance < 0 ? '−' : '') + util.moneyShort(Math.abs(t.variance)), title: util.money(t.variance), meta: !m ? 'No sheet yet' : t.variance < 0 ? 'Over the commitment' : 'Within the commitment' }) + '</div>' +
      '<div class="tabs wrap mt-3">' + tabs.map(x => '<button data-t="' + x[0] + '" class="' + (S.tab === x[0] ? 'on' : '') + '">' + ui.icon(x[2], 'sm') + x[1] + '</button>').join('') + '</div><div id="bgBody"></div>';
    const go = ym => { S.ym = ym; history.replaceState(null, '', '#/budget?m=' + ym + '&tab=' + S.tab); render(el); };
    el.querySelector('#bgPrev').onclick = () => go(addMonth(S.ym, -1));
    el.querySelector('#bgNext').onclick = () => go(addMonth(S.ym, 1));
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.tab = b.dataset.t; history.replaceState(null, '', '#/budget?m=' + S.ym + '&tab=' + S.tab); render(el); });
    el.querySelector('#bgPdf').onclick = () => {
      try { if (S.tab === 'actual') Proc.reportPdf ? Proc.reportPdf.generate('budget-actual', { from: util.fyRange(fy).start, to: S.ym + '-28' }, 'open') : null; else approvalPdf(S.ym, 'open'); Proc.audit('PDF Report', (S.tab === 'actual' ? 'Budget vs Actual ' : 'Procurement for Approval ') + monthName(S.ym)); }
      catch (e) { ui.toast(e.message, 'warning'); }
    };
    el.querySelector('#bgImport').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.xlsm';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        try { const r = await importWorkbook(f); ui.toast(monthName(r.ym) + ': ' + r.entries + ' rows imported.' + r.note, 'success', 8000); S.ym = r.ym; S.tab = 'month'; render(el); }
        catch (e) { console.error(e); ui.toast(e.message, 'error', 9000); }
      };
      inp.click();
    };
    const body = el.querySelector('#bgBody');
    ({ month: drawMonth, actual: drawActual, pos: drawPOs, lines: drawLines }[S.tab] || drawMonth)(body, fy, lines, m, () => render(el));
  }

  /* Monthly approval sheet ------------------------------------------------- */
  function drawMonth(box, fy, lines, m, redraw) {
    const pm = monthRec(addMonth(S.ym, -1));
    if (!m) {
      box.innerHTML = '<div class="card"><div class="card-b">' + ui.empty('clipboard', 'No approval sheet for ' + monthName(S.ym), 'Start one from the budget lines' + (pm ? ' (suppliers carried over from ' + monthName(pm.month) + ')' : '') + ', or import the month’s PROCUREMENT workbook.',
        '<div class="row" style="justify-content:center;gap:8px"><button class="btn primary" id="bgStart">' + ui.icon('plus', 'sm') + 'Start ' + esc(monthName(S.ym)) + '</button></div>') + '</div></div>';
      box.querySelector('#bgStart').onclick = () => {
        const src = pm ? (pm.entries || []) : [];
        const entries = lines.map(l => { const prev = src.filter(e => e.lineId === l.id); return (prev.length ? prev : [{ supplier: l.suppliers || '', contractual: !!l.contractual }]).map(e => ({ id: util.uid('BE'), lineId: l.id, supplier: e.supplier || '', amount: 0, approved: null, comment: '', contractual: e.contractual !== undefined ? !!e.contractual : isContractual(e.supplier) })); }).reduce((a, b) => a.concat(b), []);
        store.upsert('budgetMonths', { month: S.ym, fy, commitment: pm ? num(pm.commitment) : 0, entries, status: 'Draft' });
        Proc.audit('Start Budget Month', monthName(S.ym)); redraw();
      };
      return;
    }
    const locked = m.status === 'Approved';
    const pos = posByLine(fy, S.ym, lines);
    const save = util.debounce(() => { store.upsert('budgetMonths', { id: m.id, entries: m.entries, commitment: m.commitment, notes: m.notes }); refreshFoot(); }, 400);
    const rows = lines.map(l => {
      const es = (m.entries || []).filter(e => e.lineId === l.id);
      const live = pos[l.id] || { month: 0, monthN: 0 };
      const pr = prevRows(pm, l.id, es.length);
      const list = es.length ? es : [null];
      return list.map((e, i) => '<tr class="' + (i === 0 ? 'ln' : '') + '">' +
        '<td>' + (i === 0 ? '<div class="lnname">' + esc(l.name) + '</div>' + (l.suppliers ? '<div class="t-sub">' + esc(l.suppliers) + '</div>' : '') : '') + '</td>' +
        '<td>' + (e ? '<input class="input sup" data-e="' + e.id + '" data-k="supplier" value="' + esc(e.supplier || '') + '" placeholder="Supplier"' + (locked ? ' disabled' : '') + '>' : '<button class="btn sm ghost" data-add="' + l.id + '">' + ui.icon('plus', 'sm') + 'Add row</button>') + '</td>' +
        '<td class="num">' + (i === 0 ? (num(l.monthlyAllocation) ? util.money(l.monthlyAllocation) : '<span class="muted">—</span>') : '') + '</td>' +
        '<td class="num">' + (e ? '<input class="input amt" inputmode="decimal" data-e="' + e.id + '" data-k="amount" value="' + (num(e.amount) ? util.round2(e.amount) : '') + '" placeholder="0.00"' + (locked ? ' disabled' : '') + '>' : '') + '</td>' +
        (locked ? '<td class="num">' + (e ? '<input class="input amt" inputmode="decimal" data-e="' + e.id + '" data-k="approved" value="' + util.round2(approvedOf(m, e)) + '">' : '') + '</td>' : '') +
        '<td class="num muted-cell">' + (pr[i] ? util.money(pr[i]) : '—') + '</td>' +
        '<td class="num">' + (i === 0 ? (live.monthN ? '<a href="#/budget?m=' + S.ym + '&tab=pos&line=' + l.id + '">' + util.money(live.month) + '</a><div class="t-sub">' + live.monthN + ' ' + util.plural(live.monthN, 'PO') + '</div>' : '<span class="muted">—</span>') : '') + '</td>' +
        '<td>' + (e ? '<label class="check small" title="Paid centrally by the Ministry (NHF, IGL) — deducted below"><input type="checkbox" data-e="' + e.id + '" data-k="contractual"' + (e.contractual ? ' checked' : '') + (locked ? ' disabled' : '') + '> MOH</label>' : '') + '</td>' +
        '<td>' + (e ? '<input class="input com" data-e="' + e.id + '" data-k="comment" value="' + esc(e.comment || '') + '" placeholder="Comment"' + (locked ? ' disabled' : '') + '>' : '') + '</td>' +
        '<td class="nowrap">' + (e && !locked ? (i === es.length - 1 ? '<button class="icon-btn" title="Add a supplier row" data-add="' + l.id + '">' + ui.icon('plus', 'sm') + '</button>' : '') + '<button class="icon-btn" title="Remove row" data-del="' + e.id + '">' + ui.icon('x', 'sm') + '</button>' : '') + '</td></tr>').join('');
    }).join('');
    const next = { Draft: ['Submitted', 'Mark as submitted for approval', 'send'], Submitted: ['Approved', 'Record approval', 'check'], Approved: ['Submitted', 'Reopen', 'undo'] }[m.status || 'Draft'];
    box.innerHTML = '<div class="card"><div class="card-h"><div><h3>Procurement for approval — ' + esc(monthName(S.ym)) + '</h3><div class="sub">Type the amount for approval against each budget line. Tick <b>MOH</b> on rows paid centrally (NHF, IGL) — they are deducted before comparing with the commitment. “POs this month” is live from purchase orders.</div></div>' +
      '<div class="row" style="gap:8px"><button class="btn" data-status="' + next[0] + '">' + ui.icon(next[2], 'sm') + next[1] + '</button></div></div>' +
      '<div class="table-wrap"><table class="table compact bg-sheet"><thead><tr><th>Description</th><th>Suppliers</th><th class="num">Monthly allocation</th><th class="num">Amount for approval ' + esc(shortMonth(S.ym)) + '</th>' + (locked ? '<th class="num">Approved</th>' : '') + '<th class="num">Approved ' + esc(shortMonth(addMonth(S.ym, -1))) + '</th><th class="num">POs this month</th><th>MOH</th><th>Comments</th><th></th></tr></thead><tbody>' + rows + '</tbody><tfoot id="bgFoot"></tfoot></table></div>' +
      '<div class="card-b"><div class="form-grid"><div class="field s4"><label>Commitment for ' + esc(monthName(S.ym)) + '</label><input class="input" inputmode="decimal" id="bgCommit" value="' + (num(m.commitment) ? util.round2(m.commitment) : '') + '" placeholder="0.00"' + (locked ? ' disabled' : '') + '><div class="hint">The cash commitment the total after contractual is compared with.</div></div>' +
      '<div class="field s8"><label>Notes for the approval sheet</label><input class="input" id="bgNotes" value="' + esc(m.notes || '') + '" placeholder="Optional — printed under the table"></div></div></div></div>';
    const cols = locked ? 10 : 9;
    function refreshFoot() {
      const t = totals(m, lines), tp = pm ? totals(pm, lines) : null;
      const row = (lab, a, b, c, cls) => '<tr class="' + (cls || '') + '"><td colspan="2">' + lab + '</td><td class="num">' + a + '</td><td class="num">' + b + '</td>' + (locked ? '<td class="num"></td>' : '') + '<td class="num">' + c + '</td><td colspan="' + (cols - 6) + '"></td></tr>';
      box.querySelector('#bgFoot').innerHTML =
        row('Sub Total', util.money(t.allocation), util.money(t.amount), tp ? util.money(tp.approved) : '') +
        row('Less MOH Contractual Amount (NHF, IGL)' + (m.contractualOverride !== null && m.contractualOverride !== undefined && m.contractualOverride !== '' ? ' <span class="muted small">— as on the imported sheet</span>' : ''), '', util.money(t.contractual), tp ? util.money(tp.contractual) : '') +
        row('Total after Contractual Amount Deducted', '', util.money(t.afterContractual), tp ? util.money(tp.afterContractual) : '') +
        row('Commitment', util.money(t.commitment), '', tp ? util.money(tp.commitment) : '') +
        row('Variance <span class="muted small">(commitment − total after contractual)</span>', '', '<span class="' + (t.variance < 0 ? 'text-danger' : 'text-success') + '">' + (t.variance < 0 ? '−' : '') + util.money(Math.abs(t.variance)) + '</span>', tp ? (tp.variance < 0 ? '−' : '') + util.money(Math.abs(tp.variance)) : '');
    }
    refreshFoot();
    const ent = id => (m.entries || []).find(e => e.id === id);
    box.querySelectorAll('[data-e]').forEach(inp => {
      const handler = () => { const e = ent(inp.dataset.e); if (!e) return; const k = inp.dataset.k; e[k] = k === 'contractual' ? inp.checked : (k === 'amount' || k === 'approved' ? util.round2(num(inp.value)) : inp.value); save(); };
      inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', handler);
      if (inp.classList.contains('amt')) inp.addEventListener('blur', () => { const v = num(inp.value); if (inp.value !== '') inp.value = util.round2(v); });
    });
    box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { m.entries = (m.entries || []).concat([{ id: util.uid('BE'), lineId: b.dataset.add, supplier: '', amount: 0, approved: null, comment: '', contractual: false }]); store.upsert('budgetMonths', { id: m.id, entries: m.entries }); redraw(); });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { m.entries = (m.entries || []).filter(e => e.id !== b.dataset.del); store.upsert('budgetMonths', { id: m.id, entries: m.entries }); redraw(); });
    const ci = box.querySelector('#bgCommit'); ci.oninput = () => { m.commitment = util.round2(num(ci.value)); save(); };
    const ni = box.querySelector('#bgNotes'); ni.oninput = () => { m.notes = ni.value; save(); };
    box.querySelector('[data-status]').onclick = async () => {
      const to = box.querySelector('[data-status]').dataset.status;
      if (to === 'Approved') {
        const d = await ui.form('Record approval — ' + monthName(S.ym), [{ name: 'by', label: 'Approved by', value: (store.settings().signatories.parishManager || {}).name || '', required: true, span: 's6' }, { name: 'date', label: 'Date approved', type: 'date', value: today(), required: true, span: 's6' }], { ok: 'Record approval' });
        if (!d) return;
        (m.entries || []).forEach(e => { if (e.approved === null || e.approved === undefined || e.approved === '') e.approved = num(e.amount); });
        store.upsert('budgetMonths', { id: m.id, entries: m.entries, status: 'Approved', approvedBy: d.by, approvedAt: d.date });
      } else store.upsert('budgetMonths', { id: m.id, status: to, submittedAt: to === 'Submitted' ? (m.submittedAt || new Date().toISOString()) : m.submittedAt });
      Proc.audit('Budget ' + to, monthName(S.ym), m.id); redraw();
    };
  }

  /* Budget vs actual -------------------------------------------------------- */
  function drawActual(box, fy) {
    const r = budgetVsActual(fy, S.ym > fyEndYm(fy) ? fyEndYm(fy) : S.ym);
    const T = k => util.sum(r.rows, x => x[k]);
    const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
    const bar = (a, b) => { const p = b ? a / b * 100 : 0; return '<div class="bg-bar" title="' + Math.round(p) + '%"><i class="' + (p > 100 ? 'over' : p > 85 ? 'warn' : '') + '" style="width:' + Math.min(100, p) + '%"></i></div>'; };
    box.innerHTML = '<div class="grid c4">' +
      ui.kpi({ label: 'Annual allocation', icon: 'wallet', value: util.moneyShort(T('annual')), title: util.money(T('annual')), meta: 'FY ' + esc(fy) }) +
      ui.kpi({ label: 'Allocation to date', icon: 'calendar', value: util.moneyShort(T('todate')), title: util.money(T('todate')), meta: r.months.length + ' of 12 months' }) +
      ui.kpi({ label: 'Approved to date', icon: 'check', value: util.moneyShort(T('approved')), title: util.money(T('approved')), meta: pct(T('approved'), T('todate')) + '% of allocation to date', tone: T('approved') > T('todate') ? 'bad' : 'ok' }) +
      ui.kpi({ label: 'POs raised to date', icon: 'cart', value: util.moneyShort(T('poValue')), title: util.money(T('poValue')), meta: util.int(util.sum(r.rows, x => x.poCount)) + ' purchase orders' }) + '</div>' +
      '<div class="grid side mt-3"><div class="card"><div class="card-h"><h3>Approved by month</h3><span class="muted small">Against the monthly allocation (' + util.moneyShort(r.byMonth[0] ? r.byMonth[0].allocation : 0) + ')</span></div><div class="card-b">' +
      ui.bars(r.byMonth.map(x => ({ label: shortMonth(x.ym).slice(0, 3), value: x.approved || x.requested, title: monthName(x.ym) + ': ' + util.money(x.approved || x.requested) + (x.status ? ' (' + x.status + ')' : ' (not prepared)') })), { height: 200 }) + '</div></div>' +
      '<div class="card"><div class="card-h"><h3>Largest lines to date</h3></div><div class="card-b">' + ui.hbars(r.rows.filter(x => x.approved > 0).sort((a, b) => b.approved - a.approved).slice(0, 8).map(x => ({ label: x.line.name, value: x.approved }))) + '</div></div></div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>Budget vs actual — FY ' + esc(fy) + ' to ' + esc(monthName(r.months[r.months.length - 1] || S.ym)) + '</h3><div class="sub">Live: approved sheets and purchase orders as they are recorded.</div></div></div><div class="table-wrap"><table class="table compact"><thead><tr><th>Budget line</th><th class="num">Annual allocation</th><th class="num">Allocation to date</th><th class="num">Approved to date</th><th>Used to date</th><th class="num">POs raised</th><th class="num">Balance to date</th><th class="num">Annual remaining</th></tr></thead><tbody>' +
      r.rows.map(x => '<tr><td class="t-title">' + esc(x.line.name) + '</td><td class="num">' + util.money(x.annual) + '</td><td class="num">' + util.money(x.todate) + '</td><td class="num strong">' + util.money(x.approved) + '</td><td>' + bar(x.approved, x.todate) + '</td><td class="num">' + (x.poCount ? '<a href="#/budget?m=' + S.ym + '&tab=pos&line=' + x.line.id + '">' + util.money(x.poValue) + '</a>' : '<span class="muted">—</span>') + '</td><td class="num ' + (x.balance < 0 ? 'text-danger' : '') + '">' + util.money(x.balance) + '</td><td class="num">' + util.money(x.annualLeft) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="num">' + util.money(T('annual')) + '</td><td class="num">' + util.money(T('todate')) + '</td><td class="num">' + util.money(T('approved')) + '</td><td>' + bar(T('approved'), T('todate')) + '</td><td class="num">' + util.money(T('poValue')) + '</td><td class="num">' + util.money(T('balance')) + '</td><td class="num">' + util.money(T('annualLeft')) + '</td></tr></tfoot></table></div></div>';
  }

  /* Purchase orders against budget lines ------------------------------------ */
  function drawPOs(box, fy, lines) {
    const q = Proc.router.parse().query || {};
    const onlyLine = q.line || '';
    const rows = activePOs().filter(p => p.date && ymOf(p.date) === S.ym).map(p => ({ po: p, match: lineForPO(p, lines) }))
      .filter(x => !onlyLine || (x.match.line && x.match.line.id === onlyLine));
    box.innerHTML = '<div class="card"><div class="card-h"><div><h3>Purchase orders — ' + esc(monthName(S.ym)) + (onlyLine ? ' · ' + esc((lines.find(l => l.id === onlyLine) || {}).name || '') : '') + '</h3><div class="sub">Each PO is counted against a budget line: the one chosen here, else matched by supplier or description. Change the line if the match is wrong.</div></div>' + (onlyLine ? '<a class="btn sm" href="#/budget?m=' + S.ym + '&tab=pos">Show all</a>' : '') + '</div><div class="card-b flush" id="bgPoT"></div></div>';
    ui.table(box.querySelector('#bgPoT'), {
      rows, pageSize: 25, compact: true, placeholder: 'Search PO, supplier, description…', initialSort: { key: 'date', dir: -1 },
      search: x => [x.po.poNumber, x.po.supplierName, x.po.description, x.match.line ? x.match.line.name : ''].join(' '),
      filters: [{ key: 'how', label: 'All matches', options: [{ value: 'set', label: 'Chosen' }, { value: 'supplier', label: 'By supplier' }, { value: 'words', label: 'By description' }, { value: 'none', label: 'Not matched' }], test: (x, v) => (x.match.how || 'none') === v }],
      empty: ui.empty('cart', 'No purchase orders in ' + monthName(S.ym), 'Purchase orders dated this month appear here.'),
      columns: [
        { key: 'date', label: 'Date', sort: x => x.po.date, render: x => '<span class="nowrap">' + util.date(x.po.date) + '</span>' },
        { key: 'po', label: 'PO', sort: x => x.po.poNumber, render: x => '<a class="strong" href="#/orders/' + x.po.id + '">' + esc(x.po.poNumber || 'Draft') + '</a>' },
        { key: 'sup', label: 'Supplier / description', sort: x => x.po.supplierName, render: x => '<div class="t-title">' + esc(x.po.supplierName || domain.supplierName(x.po.supplierId) || '—') + '</div><div class="t-sub truncate" style="max-width:420px">' + esc(x.po.description || (x.po.items || []).map(i => i.description).join(', ')) + '</div>' },
        { key: 'total', label: 'Value', cls: 'num', sort: x => num(x.po.total), render: x => util.money(x.po.total) },
        { key: 'line', label: 'Budget line', sort: x => x.match.line ? x.match.line.name : 'zzz', render: x => '<select class="input" style="height:32px;min-width:220px" data-po="' + x.po.id + '"><option value="">' + (x.match.line && x.match.how !== 'set' ? 'Auto: ' + esc(x.match.line.name) : '— Not matched —') + '</option>' + lines.map(l => '<option value="' + l.id + '"' + (x.po.budgetLineId === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select>' },
        { key: 'how', label: 'How', sort: x => x.match.how, render: x => ui.badge({ set: 'Chosen', supplier: 'Supplier', words: 'Description' }[x.match.how] || 'Not matched', { set: 'success', supplier: 'info', words: '' }[x.match.how] || 'warning') }
      ],
      footer: () => '<td colspan="3">Total</td><td class="num">' + util.money(util.sum(rows, x => num(x.po.total))) + '</td><td colspan="2"></td>'
    });
    box.addEventListener('change', e => {
      const sel = e.target.closest('[data-po]'); if (!sel) return;
      store.upsert('purchaseOrders', { id: sel.dataset.po, budgetLineId: sel.value || null });
      ui.toast(sel.value ? 'Budget line saved on the purchase order' : 'Back to automatic matching');
    });
  }

  /* Budget lines (allocations) ---------------------------------------------- */
  function drawLines(box, fy, lines, m, redraw) {
    const save = util.debounce((id, patch) => store.upsert('budgetLines', Object.assign({ id }, patch)), 400);
    box.innerHTML = '<div class="card"><div class="card-h"><div><h3>Budget lines — FY ' + esc(fy) + '</h3><div class="sub">Monthly allocation for each line (annual = monthly × 12). Suppliers and match words link purchase orders to the line automatically.</div></div><button class="btn" id="bgAddLine">' + ui.icon('plus', 'sm') + 'Add line</button></div>' +
      '<div class="table-wrap"><table class="table compact bg-sheet"><thead><tr><th>Budget line</th><th>Usual suppliers</th><th class="num">Monthly allocation</th><th class="num">Annual</th><th>Paid by MOH</th><th>Match words</th><th></th></tr></thead><tbody>' +
      lines.map(l => '<tr><td><input class="input" style="min-width:220px" data-l="' + l.id + '" data-k="name" value="' + esc(l.name) + '"></td><td><input class="input sup" data-l="' + l.id + '" data-k="suppliers" value="' + esc(l.suppliers || '') + '"></td>' +
        '<td class="num"><input class="input amt" inputmode="decimal" data-l="' + l.id + '" data-k="monthlyAllocation" value="' + (num(l.monthlyAllocation) ? util.round2(l.monthlyAllocation) : '') + '" placeholder="0.00"></td><td class="num" data-annual="' + l.id + '">' + util.money(num(l.monthlyAllocation) * 12) + '</td>' +
        '<td><label class="check small"><input type="checkbox" data-l="' + l.id + '" data-k="contractual"' + (l.contractual ? ' checked' : '') + '> NHF / IGL</label></td><td><input class="input com" data-l="' + l.id + '" data-k="keywords" value="' + esc(l.keywords || '') + '" placeholder="words in PO descriptions, comma separated"></td>' +
        '<td><button class="icon-btn" title="Remove line" data-rm="' + l.id + '">' + ui.icon('trash', 'sm') + '</button></td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="2">Total</td><td class="num" id="bgLM">' + util.money(util.sum(lines, l => num(l.monthlyAllocation))) + '</td><td class="num" id="bgLA">' + util.money(util.sum(lines, l => num(l.monthlyAllocation)) * 12) + '</td><td colspan="3"></td></tr></tfoot></table></div></div>';
    box.querySelectorAll('[data-l]').forEach(inp => inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
      const k = inp.dataset.k, v = k === 'contractual' ? inp.checked : k === 'monthlyAllocation' ? util.round2(num(inp.value)) : inp.value;
      const l = lines.find(x => x.id === inp.dataset.l); if (l) l[k] = v;
      save(inp.dataset.l, { [k]: v });
      if (k === 'monthlyAllocation') { box.querySelector('[data-annual="' + inp.dataset.l + '"]').textContent = util.money(num(v) * 12); box.querySelector('#bgLM').textContent = util.money(util.sum(lines, x => num(x.monthlyAllocation))); box.querySelector('#bgLA').textContent = util.money(util.sum(lines, x => num(x.monthlyAllocation)) * 12); }
    }));
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      const l = lines.find(x => x.id === b.dataset.rm);
      if (!await ui.confirm('Remove the budget line <b>' + esc(l.name) + '</b> for FY ' + esc(fy) + '? Amounts already entered against it stay on the monthly sheets but are no longer listed.', { ok: 'Remove', danger: true })) return;
      store.upsert('budgetLines', { id: l.id, active: false }); Proc.audit('Remove Budget Line', l.name + ' FY ' + fy); redraw();
    });
    box.querySelector('#bgAddLine').onclick = async () => {
      const d = await ui.form('Add budget line — FY ' + fy, [{ name: 'name', label: 'Budget line', required: true }, { name: 'monthlyAllocation', label: 'Monthly allocation', type: 'number', step: '0.01', span: 's6' }, { name: 'suppliers', label: 'Usual suppliers', span: 's6' }, { name: 'keywords', label: 'Match words', hint: 'Words that appear in its purchase orders, comma separated.' }]);
      if (!d) return;
      store.upsert('budgetLines', { fy, name: d.name, monthlyAllocation: util.round2(num(d.monthlyAllocation)), suppliers: d.suppliers || '', keywords: d.keywords || '', contractual: isContractual(d.suppliers), order: (lines.length + 1) * 10 + 1000, active: true });
      redraw();
    };
  }

  Proc.budget = { importWorkbook, approvalPdf, budgetVsActual, totals, lineForPO };
  Proc.page({ id: 'budget', title: 'Budget', icon: 'wallet', section: 'Workflow', order: 5, render });
})();
