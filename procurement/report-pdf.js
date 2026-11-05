/* ==========================================================================
   Proc.reportPdf — the PDF Reports tab on the Reports page of Procurement and General Stores.

   An app registers a catalogue of reports, then the page lets the officer pick
   a report (or several, as one "report pack"), choose the period and filters,
   preview it and download it on the hospital letterhead.

   Report definition:
   {
     id, group, title, icon, desc,
     period: true            // uses the From–To period
     asAt: true              // "as at" a date instead of a period (optional)
     days: 90, daysLabel     // a number option (e.g. "Expiring within N days")
     filters: [{ key, label, options: () => [[value, label], …] }],
     orientation: 'portrait' | 'landscape'   // default: auto from widest table
     build(p) → {
       subtitle,                                    // optional extra line
       kpis: [{ label, value, note }],              // summary figures
       chart: { title, rows: [{ label, value }], money: true },
       sections: [{ title, note, columns: [{ label, type: 'money'|'num'|'pct'|'date'|'text', width }],
                    rows: [[…cells]], totals: [[…cells]] | null, empty,
                    optional: true }],   // a long list left out when "Detailed lists" is unticked
       notes: ['…']                                 // footnotes
     }
   }
   p = { from, to, asAt, periodLabel, days, filters: { key: value }, opts }
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, APP } = Proc;
  const esc = util.esc;

  const INK = [17, 24, 39], GREY = [100, 112, 128], BLUE = [10, 89, 137], LINE = [215, 220, 228], SOFT = [243, 246, 250];
  const PREF_KEY = 'procPdfReportPrefs_' + APP.id, HIST_KEY = 'procPdfReportHistory_' + APP.id;
  const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full: preferences only */ } };

  /* ------------------------------------------------------------ periods */
  const today = () => util.today();
  const ym = iso => iso.slice(0, 7);
  const monthEnd = iso => { const [y, m] = iso.split('-').map(Number); return util.toISODate(new Date(y, m, 0)); };
  const addMonths = (iso, n) => { const [y, m] = iso.split('-').map(Number); return util.toISODate(new Date(y, m - 1 + n, 1)); };
  /** Government quarters: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar. */
  function quarterOf(iso) {
    const [y, m] = iso.split('-').map(Number);
    const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4;
    const startM = [0, 4, 7, 10, 1][q];
    const start = util.toISODate(new Date(y, startM - 1, 1));
    return { q, start, end: monthEnd(addMonths(start, 2)), fy: util.fiscalYear(iso) };
  }
  const PRESETS = [
    { id: 'month', label: 'This month', range: () => [today().slice(0, 8) + '01', monthEnd(today())] },
    { id: 'lastmonth', label: 'Last month', range: () => { const s = addMonths(today().slice(0, 8) + '01', -1); return [s, monthEnd(s)]; } },
    { id: 'quarter', label: 'This quarter', range: () => { const q = quarterOf(today()); return [q.start, q.end]; } },
    { id: 'lastquarter', label: 'Last quarter', range: () => { const q = quarterOf(addMonths(quarterOf(today()).start, -3)); return [q.start, q.end]; } },
    { id: 'fy', label: 'This fiscal year', range: () => { const r = util.fyRange(util.fiscalYear(today())); return [r.start, r.end]; } },
    { id: 'lastfy', label: 'Last fiscal year', range: () => { const r = util.fyRange(util.fiscalYear(util.addDays(util.fyRange(util.fiscalYear(today())).start, -1))); return [r.start, r.end]; } },
    { id: 'custom', label: 'Custom', range: null }
  ];
  function periodLabel(from, to) {
    if (!from || !to) return '';
    if (from.slice(8) === '01' && to === monthEnd(from)) return util.monthLabel(ym(from)).replace(/^(\w+)/, m => ({ Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December' }[m] || m));
    const fy = util.fiscalYear(from), r = util.fyRange(fy);
    if (from === r.start && to === r.end) return 'Fiscal year ' + fy;
    const q = quarterOf(from);
    if (from === q.start && to === q.end) return 'Q' + q.q + ' FY ' + q.fy + ' (' + util.monthLabel(ym(q.start)).slice(0, 3) + ' - ' + util.monthLabel(ym(q.end)) + ')';
    return util.date(from) + ' - ' + util.date(to);
  }

  /* ------------------------------------------------------------ formatting */
  const fmt = (type, v) => {
    if (v === null || v === undefined || v === '') return '';
    // Labels such as "Total" or "never" in a number/date column print as written.
    if (typeof v === 'string' && (type === 'date' ? !/^\d{4}-\d{2}-\d{2}/.test(v) : isNum(type) && isNaN(Number(v)))) return v;
    if (type === 'money') return util.money(v);
    if (type === 'num') return typeof v === 'number' ? util.int(util.round2(v)) : String(v);
    if (type === 'pct') return (typeof v === 'number' ? util.round2(v) : v) + '%';
    if (type === 'date') return util.date(v);
    return String(v);
  };
  const isNum = t => t === 'money' || t === 'num' || t === 'pct';

  /* ------------------------------------------------------------ PDF drawing */
  function kit() { const k = Proc.pdf && Proc.pdf.kit; if (!k) throw new Error('The PDF engine is not loaded. Reload the page.'); return k; }

  /** Draw one report into doc starting on the current page. Returns nothing; pages are added as needed. */
  function drawReport(doc, def, data, p) {
    const K = kit(), clean = K.clean, { w, h } = K.pageSize(doc), M = 36, top = K.top, bottom = h - 86;
    let y = top;
    const ensure = need => { if (y + need > bottom) { doc.addPage(); y = top + 4; } };
    // Title block
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor.apply(doc, BLUE);
    doc.text(clean(def.title.toUpperCase()), M, y + 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, GREY);
    const unit = APP.id === 'stores' ? ((store.settings().stores || {}).storeName || 'General Stores') : 'Procurement Unit';
    const when = def.period ? p.periodLabel : (def.asAt ? 'As at ' + util.dateLong(p.asAt || today()) : 'As at ' + util.dateLong(today()));
    doc.text(clean([unit, store.settings().org.hospital, when].filter(Boolean).join('  ·  ')), M, y + 28);
    const gen = 'Generated ' + util.dateTime(Date.now()) + (p.opts.preparedBy ? ' by ' + p.opts.preparedBy : '');
    doc.setFontSize(7.5); doc.text(clean(gen), w - M, y + 14, { align: 'right' });
    y += 36;
    const filt = Object.keys(p.filters || {}).filter(k => p.filters[k] && !((def.filters || []).find(x => x.key === k) || {}).quiet).map(k => { const f = (def.filters || []).find(x => x.key === k); const o = f ? (f.options() || []).find(x => String(x[0]) === String(p.filters[k])) : null; return (f ? f.label : k) + ': ' + (o ? o[1] : p.filters[k]); });
    const sub = [data.subtitle, filt.length ? 'Filtered by ' + filt.join(', ') : '', def.days ? (def.daysLabel || 'Days') + ': ' + p.days : ''].filter(Boolean).join('  ·  ');
    if (sub) { doc.setFontSize(8.5); doc.setTextColor.apply(doc, INK); const l = doc.splitTextToSize(clean(sub), w - M * 2); doc.text(l, M, y + 4); y += l.length * 10.5 + 2; }
    doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.8); doc.line(M, y + 2, w - M, y + 2); y += 12;

    // Summary figures
    const kpis = (data.kpis || []).filter(k => k && k.label);
    if (p.opts.summary && kpis.length) {
      const per = Math.min(4, kpis.length), gap = 8, bw = (w - M * 2 - gap * (per - 1)) / per, bh = 48;
      for (let i = 0; i < kpis.length; i += per) {
        ensure(bh + 8);
        kpis.slice(i, i + per).forEach((k, j) => {
          const x = M + j * (bw + gap);
          doc.setFillColor.apply(doc, SOFT); doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.6); doc.roundedRect(x, y, bw, bh, 4, 4, 'FD');
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor.apply(doc, GREY); doc.text(clean(String(k.label).toUpperCase()), x + 8, y + 12, { maxWidth: bw - 16 });
          doc.setFont('helvetica', 'bold'); doc.setTextColor.apply(doc, INK); K.fitSize(doc, clean(String(k.value)), bw - 16, 13, 8); doc.text(clean(String(k.value)), x + 8, y + 29);
          if (k.note) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor.apply(doc, GREY); doc.text(doc.splitTextToSize(clean(k.note), bw - 16)[0], x + 8, y + 41); }
        });
        y += bh + 8;
      }
      y += 4;
    }

    // Bar chart
    const ch = data.chart;
    if (p.opts.chart && ch && ch.rows && ch.rows.filter(r => r.value > 0).length) {
      const rows = ch.rows.filter(r => r.value > 0).slice(0, 10), max = Math.max.apply(null, rows.map(r => r.value));
      ensure(24 + rows.length * 15);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, INK); doc.text(clean(ch.title || 'Summary'), M, y + 8); y += 16;
      const lw = 170, vw = 90, bx = M + lw + 6, bwMax = w - M * 2 - lw - vw - 12;
      rows.forEach(r => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, INK);
        doc.text(doc.splitTextToSize(clean(r.label), lw)[0], M, y + 8);
        doc.setFillColor(235, 240, 245); doc.rect(bx, y + 1, bwMax, 9, 'F');
        doc.setFillColor.apply(doc, BLUE); doc.rect(bx, y + 1, Math.max(1.5, bwMax * r.value / (max || 1)), 9, 'F');
        doc.setTextColor.apply(doc, INK); doc.text(clean(ch.money ? util.moneyShort(r.value) : util.int(util.round2(r.value))), w - M, y + 8, { align: 'right' });
        y += 15;
      });
      y += 8;
    }

    // Tables
    (data.sections || []).forEach(sec => {
      if (!sec || (!p.opts.detail && sec.optional)) return;
      ensure(46);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, INK); doc.text(clean(sec.title || ''), M, y + 8); y += 13;
      if (sec.note) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, GREY); const l = doc.splitTextToSize(clean(sec.note), w - M * 2); doc.text(l, M, y + 5); y += l.length * 9.5 + 2; }
      const cols = sec.columns || [];
      if (!sec.rows || !sec.rows.length) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, GREY); doc.text(clean(sec.empty || 'Nothing to report for this period.'), M, y + 8); y += 20; return;
      }
      const body = sec.rows.map(r => r.map((c, i) => clean(fmt((cols[i] || {}).type, c))));
      const foot = (sec.totals || []).map(r => r.map((c, i) => clean(fmt((cols[i] || {}).type, c))));
      doc.autoTable({
        startY: y + 2, margin: { left: M, right: M, top: top, bottom: 86 }, head: [cols.map(c => clean(c.label))], body, foot, showFoot: 'lastPage',
        styles: { font: 'helvetica', fontSize: cols.length > 8 ? 7.2 : 8, cellPadding: 3.2, lineColor: LINE, lineWidth: 0.4, textColor: INK, overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [234, 241, 247], textColor: INK, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 251, 253] },
        columnStyles: cols.reduce((o, c, i) => { o[i] = {}; if (isNum(c.type)) o[i].halign = 'right'; if (c.width) o[i].cellWidth = c.width; return o; }, {}),
        didParseCell: d => { if (d.section === 'head' && isNum((cols[d.column.index] || {}).type)) d.cell.styles.halign = 'right'; if (d.section === 'foot' && isNum((cols[d.column.index] || {}).type)) d.cell.styles.halign = 'right'; }
      });
      y = doc.lastAutoTable.finalY + 16;
    });

    // Footnotes and the officer's comments
    const notes = (data.notes || []).filter(Boolean);
    if (notes.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor.apply(doc, GREY);
      notes.forEach(n => { const l = doc.splitTextToSize(clean(n), w - M * 2); ensure(l.length * 9.5 + 4); doc.text(l, M, y + 4); y += l.length * 9.5 + 3; });
      y += 6;
    }
    if (p.opts.comments && p.opts.comments.trim()) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const l = doc.splitTextToSize(clean(p.opts.comments.trim()), w - M * 2 - 20);
      ensure(l.length * 11 + 30);
      doc.setFillColor(255, 251, 235); doc.setDrawColor(245, 210, 120); doc.roundedRect(M, y, w - M * 2, l.length * 11 + 22, 4, 4, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor.apply(doc, INK); doc.text('COMMENTS', M + 10, y + 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(l, M + 10, y + 24); y += l.length * 11 + 30;
    }
    // Signatures
    if (p.opts.signatures) {
      const sigs = [['Prepared by', p.opts.preparedBy, p.opts.preparedTitle], ['Checked by', p.opts.checkedBy, p.opts.checkedTitle], ['Approved by', p.opts.approvedBy, p.opts.approvedTitle]];
      ensure(70); y += 34;
      const cw = (w - M * 2 - 40) / 3;
      sigs.forEach(([lab, nm, ti], i) => {
        const x = M + i * (cw + 20);
        doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.5); doc.line(x, y, x + cw, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, GREY); doc.text(lab.toUpperCase() + '   DATE: ____________', x, y + 10);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, INK); if (nm) doc.text(clean(nm), x, y + 22);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); if (ti) doc.text(clean(ti), x, y + (nm ? 33 : 22));
      });
      y += 40;
    }
  }

  function orientationFor(def, data, opts) {
    if (opts.orientation === 'portrait' || opts.orientation === 'landscape') return opts.orientation;
    if (data.orientation) return data.orientation;
    if (def.orientation) return def.orientation;
    const widest = Math.max.apply(null, [0].concat((data.sections || []).filter(Boolean).map(s => (s.columns || []).length)));
    return widest > 7 ? 'landscape' : 'portrait';
  }

  /** Build one report or a pack. items: [{ def, p }]. Returns { blob, filename }. */
  function generate(items, opts, output) {
    const K = kit();
    if (!items.length) throw new Error('Choose a report first.');
    const built = items.map(it => ({ def: it.def, p: it.p, data: it.def.build(it.p) || {} }));
    const pack = built.length > 1;
    const first = built[0];
    const doc = K.newDoc(pack ? 'portrait' : orientationFor(first.def, first.data, opts));
    const starts = [];
    built.forEach((b, i) => {
      const orient = orientationFor(b.def, b.data, opts);
      if (i > 0 || pack) doc.addPage('letter', orient);
      else if (orient !== 'portrait') { /* first page already in this orientation */ }
      starts.push(doc.internal.getNumberOfPages());
      drawReport(doc, b.def, b.data, b.p);
    });
    if (pack) {
      // Cover page with contents (page 1 was left blank for it)
      doc.setPage(1);
      const { w } = K.pageSize(doc), M = 56; let y = K.top + 40;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor.apply(doc, BLUE);
      doc.text(K.clean(opts.packTitle || (APP.id === 'stores' ? 'General Stores Report Pack' : 'Procurement Report Pack')), M, y); y += 22;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor.apply(doc, INK);
      doc.text(K.clean(store.settings().org.hospital + '  ·  ' + (built.some(b => b.def.period) ? first.p.periodLabel : 'As at ' + util.dateLong(today()))), M, y); y += 16;
      doc.setFontSize(9); doc.setTextColor.apply(doc, GREY);
      doc.text(K.clean('Generated ' + util.dateTime(Date.now()) + (opts.preparedBy ? ' by ' + opts.preparedBy : '')), M, y); y += 34;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor.apply(doc, INK); doc.text('Contents', M, y); y += 8;
      doc.setDrawColor.apply(doc, LINE); doc.line(M, y, w - M, y); y += 18;
      built.forEach((b, i) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, INK);
        doc.text((i + 1) + '.  ' + K.clean(b.def.title), M, y);
        doc.setTextColor.apply(doc, GREY); doc.text('page ' + starts[i], w - M, y, { align: 'right' });
        doc.setFontSize(8.5); doc.text(K.clean(b.def.desc || ''), M + 18, y + 12, { maxWidth: w - M * 2 - 80 });
        y += 32;
      });
      if (opts.comments && opts.comments.trim()) {
        y += 8; doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, INK); doc.text('Comments', M, y); y += 12;
        doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(K.clean(opts.comments.trim()), w - M * 2), M, y);
      }
    }
    const title = pack ? (opts.packTitle || 'Report pack') : first.def.title;
    K.finish(doc, { side: false, alwaysNumber: true, pageLabel: title });
    doc.setProperties({ title, subject: pack ? built.map(b => b.def.title).join(', ') : (first.def.desc || ''), creator: APP.id === 'stores' ? 'General Stores' : 'Procurement Management System', author: opts.preparedBy || '' });
    const when = built.some(b => b.def.period) ? first.p.from + ' to ' + first.p.to : today();
    const filename = K.fileSafe(title) + ' ' + when + '.pdf';
    const blob = K.deliver(doc, filename, output || 'blob');
    return { blob, filename, pages: doc.internal.getNumberOfPages() };
  }

  /* ------------------------------------------------------------ page */
  const state = { selected: null, pack: [], preset: 'month', from: '', to: '', asAt: '', days: {}, filters: {}, q: '' };

  function prefs() {
    const off = domain.officer();
    return Object.assign({ orientation: 'auto', summary: true, chart: true, detail: true, signatures: true, preparedBy: off.name, preparedTitle: off.title, checkedBy: '', checkedTitle: '', approvedBy: '', approvedTitle: '', comments: '' }, readJSON(PREF_KEY, {}));
  }

  function render(el, o) {
    o = o || {};
    const cat = Proc.reportPdf.catalog;
    if (!state.from) { const r = PRESETS[0].range(); state.from = r[0]; state.to = r[1]; }
    if (!state.asAt) state.asAt = today();
    const q = Proc.router.parse().query || {};
    if (q.r && cat.some(r => r.id === q.r)) state.selected = q.r;
    if (!state.selected && cat.length) state.selected = cat[0].id;
    const groups = []; cat.forEach(r => { if (groups.indexOf(r.group) < 0) groups.push(r.group); });
    const pr = prefs();
    el.innerHTML = '<style>' +
      '.pr-wrap{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:20px;align-items:start}' +
      '@media (max-width:1180px){.pr-wrap{grid-template-columns:1fr}}' +
      '.pr-side{position:sticky;top:calc(var(--topbar-h) + 16px)}@media (max-width:1180px){.pr-side{position:static}}' +
      '.pr-col{display:flex;flex-direction:column;gap:8px}.pr-wrap [hidden]{display:none!important}' +
      '.pr-search{position:relative;flex:1;min-width:220px;max-width:420px}.pr-search .i{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-3);pointer-events:none}.pr-search .input{padding-left:34px;width:100%}' +
      '.pr-group{margin:18px 0 8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3)}' +
      '.pr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}' +
      '.pr-card{position:relative;display:flex;gap:12px;align-items:flex-start;text-align:left;padding:14px 14px 14px 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);cursor:pointer;transition:border-color .15s,box-shadow .15s;font:inherit;color:inherit;width:100%}' +
      '.pr-card:hover{border-color:var(--primary);box-shadow:var(--shadow-sm)}' +
      '.pr-card.on{border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 18%,transparent)}' +
      '.pr-card .ic{flex:none;width:36px;height:36px;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--primary) 10%,transparent);color:var(--primary)}' +
      '.pr-card .t{font-weight:650;font-size:14px;line-height:1.3;padding-right:24px}.pr-card .d{font-size:12.5px;color:var(--text-2);margin-top:3px;line-height:1.4}' +
      '.pr-card .pk{position:absolute;top:10px;right:10px;width:18px;height:18px;accent-color:var(--primary);cursor:pointer}' +
      '.pr-opt{display:flex;flex-direction:column;gap:12px}.pr-opt .row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.pr-preview{min-height:240px;background:var(--surface-3);border-radius:10px;padding:12px;overflow:auto;max-height:80vh}' +
      '.pr-preview canvas{display:block;margin:0 auto 12px;box-shadow:0 2px 10px rgba(0,0,0,.18);background:#fff;max-width:100%}' +
      '.pr-hist{display:flex;flex-direction:column}.pr-hist button{display:flex;justify-content:space-between;gap:10px;text-align:left;border:0;border-top:1px solid var(--border);background:none;padding:9px 0;font:inherit;color:inherit;cursor:pointer}.pr-hist button:hover .t-title{color:var(--primary)}' +
      '</style>' +
      (o.embedded ? '<p class="muted" style="margin:4px 0 14px">Reports on the hospital letterhead, ready to print, sign and file. Pick one report, or tick several to make one report pack.</p>' : ui.pageHead({ title: 'PDF Reports', sub: 'Reports on the hospital letterhead, ready to print, sign and file. Pick one report, or tick several to make one report pack.' })) +
      '<div class="pr-wrap"><div>' +
      '<div class="toolbar" style="padding:0;gap:12px;flex-wrap:wrap"><div class="pr-search">' + ui.icon('search', 'sm') + '<input class="input" id="prQ" type="search" placeholder="Find a report…" aria-label="Find a report" value="' + esc(state.q) + '"></div>' +
      '<span class="small muted" id="prPackInfo"></span></div>' +
      groups.map(g => {
        const list = cat.filter(r => r.group === g && (!state.q || (r.title + ' ' + (r.desc || '')).toLowerCase().indexOf(state.q.toLowerCase()) >= 0));
        if (!list.length) return '';
        return '<div class="pr-group">' + esc(g) + '</div><div class="pr-grid">' + list.map(r =>
          '<div class="pr-card' + (state.selected === r.id ? ' on' : '') + '" role="button" tabindex="0" data-r="' + r.id + '"><span class="ic">' + ui.icon(r.icon || 'file') + '</span><div><div class="t">' + esc(r.title) + '</div><div class="d">' + esc(r.desc || '') + '</div></div>' +
          '<input type="checkbox" class="pk" title="Add to report pack" aria-label="Add ' + esc(r.title) + ' to report pack" data-pk="' + r.id + '"' + (state.pack.indexOf(r.id) >= 0 ? ' checked' : '') + '></div>').join('') + '</div>';
      }).join('') +
      '<div class="card mt-3"><div class="card-h"><div><h3>Preview</h3><div class="sub" id="prPvSub">Press Preview to see the report here.</div></div></div><div class="card-b"><div class="pr-preview" id="prPv">' + ui.empty('file', 'No preview yet', 'Choose a report and press <b>Preview</b>.') + '</div></div></div>' +
      '</div><div class="pr-side"><div class="card"><div class="card-h"><div><h3 id="prSelTitle"></h3><div class="sub" id="prSelDesc"></div></div></div><div class="card-b pr-opt" id="prOpts"></div>' +
      '<div class="card-f" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="prPreview">' + ui.icon('eye', 'sm') + 'Preview</button><button class="btn" id="prOpen">' + ui.icon('external', 'sm') + 'Open</button><button class="btn primary" id="prSave" style="margin-left:auto">' + ui.icon('download', 'sm') + 'Download PDF</button></div></div>' +
      '<div class="card mt-3"><div class="card-h"><h3>Recently generated</h3></div><div class="card-b pr-hist" id="prHist"></div></div></div></div>';

    const sel = () => cat.find(r => r.id === state.selected);
    const items = () => (state.pack.length > 1 ? state.pack : [state.selected]).map(id => cat.find(r => r.id === id)).filter(Boolean);

    function drawOptions() {
      const list = items(), d = sel(), pack = state.pack.length > 1;
      el.querySelector('#prSelTitle').textContent = pack ? 'Report pack · ' + list.length + ' reports' : (d ? d.title : '');
      el.querySelector('#prSelDesc').textContent = pack ? list.map(r => r.title).join(' · ') : (d ? d.desc || '' : '');
      el.querySelector('#prPackInfo').innerHTML = state.pack.length ? util.int(state.pack.length) + ' ticked for a pack' + (state.pack.length === 1 ? ' — tick one more to make a pack' : '') + ' · <a href="#" id="prClear">clear</a>' : 'Tick the box on a card to add it to a report pack.';
      const clr = el.querySelector('#prClear'); if (clr) clr.onclick = e => { e.preventDefault(); state.pack = []; el.querySelectorAll('[data-pk]').forEach(c => { c.checked = false; }); drawOptions(); };
      const usesPeriod = list.some(r => r.period), usesAsAt = list.some(r => r.asAt);
      const dayDefs = list.filter(r => r.days), filters = [];
      list.forEach(r => (r.filters || []).forEach(f => { if (!filters.some(x => x.key === f.key)) filters.push(f); }));
      const o = el.querySelector('#prOpts');
      o.innerHTML =
        (usesPeriod ? '<div class="field" style="margin:0"><label>Period</label><div class="seg" style="width:100%">' + PRESETS.map(pp => '<button type="button" data-pp="' + pp.id + '" class="' + (state.preset === pp.id ? 'on' : '') + '">' + pp.label + '</button>').join('') + '</div>' +
          '<div class="row2 mt-2"><input type="date" class="input" id="prFrom" value="' + state.from + '" aria-label="From"><input type="date" class="input" id="prTo" value="' + state.to + '" aria-label="To"></div><div class="hint">' + esc(periodLabel(state.from, state.to)) + '</div></div>' : '') +
        (usesAsAt ? '<div class="field" style="margin:0"><label>As at</label><input type="date" class="input" id="prAsAt" value="' + state.asAt + '"></div>' : '') +
        dayDefs.map(r => '<div class="field" style="margin:0"><label>' + esc(r.daysLabel || 'Days') + (list.length > 1 ? ' <span class="muted">(' + esc(r.title) + ')</span>' : '') + '</label><input type="number" min="1" class="input" data-days="' + r.id + '" value="' + (state.days[r.id] || r.days) + '"></div>').join('') +
        filters.map(f => '<div class="field" style="margin:0"><label>' + esc(f.label) + '</label><select class="input" data-f="' + f.key + '"><option value="">All</option>' + (f.options() || []).map(x => '<option value="' + esc(x[0]) + '"' + (String(state.filters[f.key] || '') === String(x[0]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('') + '</select></div>').join('') +
        '<div class="field" style="margin:0"><label>Layout</label><div class="seg">' + [['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']].map(x => '<button type="button" data-or="' + x[0] + '" class="' + (pr.orientation === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div></div>' +
        '<div class="field" style="margin:0"><label>Include</label><div class="pr-col">' +
        [['summary', 'Summary figures'], ['chart', 'Chart'], ['detail', 'Detailed lists (e.g. every PO or GRN)'], ['signatures', 'Signature lines']].map(x => '<label class="check"><input type="checkbox" data-inc="' + x[0] + '"' + (pr[x[0]] ? ' checked' : '') + '> ' + x[1] + '</label>').join('') + '</div></div>' +
        '<div data-sig' + (pr.signatures ? '' : ' hidden') + ' class="pr-col" style="gap:12px">' +
        [['prepared', 'Prepared by'], ['checked', 'Checked by'], ['approved', 'Approved by']].map(x => '<div class="field" style="margin:0"><label>' + x[1] + '</label><div class="row2"><input class="input" data-pref="' + x[0] + 'By" placeholder="Name" value="' + esc(pr[x[0] + 'By'] || '') + '"><input class="input" data-pref="' + x[0] + 'Title" placeholder="Position" value="' + esc(pr[x[0] + 'Title'] || '') + '"></div></div>').join('') + '</div>' +
        '<div class="field" style="margin:0"><label>Comments on the report <span class="muted">(optional)</span></label><textarea class="input" data-pref="comments" rows="3" placeholder="e.g. Explanation of variances, actions taken…">' + esc(pr.comments || '') + '</textarea></div>';
      o.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => {
        const pp = PRESETS.find(x => x.id === b.dataset.pp); state.preset = pp.id;
        if (pp.range) { const r = pp.range(); state.from = r[0]; state.to = r[1]; }
        drawOptions();
      });
      const fi = o.querySelector('#prFrom'), ti = o.querySelector('#prTo'), ai = o.querySelector('#prAsAt');
      if (fi) fi.onchange = () => { if (fi.value) state.from = fi.value; state.preset = 'custom'; if (state.to < state.from) state.to = state.from; drawOptions(); };
      if (ti) ti.onchange = () => { if (ti.value) state.to = ti.value; state.preset = 'custom'; if (state.to < state.from) state.from = state.to; drawOptions(); };
      if (ai) ai.onchange = () => { state.asAt = ai.value || today(); };
      o.querySelectorAll('[data-days]').forEach(i => i.onchange = () => { state.days[i.dataset.days] = Math.max(1, util.num(i.value) || 1); });
      o.querySelectorAll('[data-f]').forEach(s => s.onchange = () => { state.filters[s.dataset.f] = s.value; });
      const save = () => writeJSON(PREF_KEY, pr);
      o.querySelectorAll('[data-or]').forEach(b => b.onclick = () => { pr.orientation = b.dataset.or; save(); o.querySelectorAll('[data-or]').forEach(x => x.classList.toggle('on', x === b)); });
      o.querySelectorAll('[data-inc]').forEach(c => c.onchange = () => { pr[c.dataset.inc] = c.checked; save(); if (c.dataset.inc === 'signatures') o.querySelector('[data-sig]').hidden = !c.checked; });
      o.querySelectorAll('[data-pref]').forEach(i => i.oninput = () => { pr[i.dataset.pref] = i.value; save(); });
      el.querySelector('#prSave').innerHTML = ui.icon('download', 'sm') + (state.pack.length > 1 ? 'Download pack' : 'Download PDF');
    }
    function drawHistory() {
      const h = readJSON(HIST_KEY, []);
      const box = el.querySelector('#prHist');
      box.innerHTML = h.length ? h.map((x, i) => '<button type="button" data-h="' + i + '"><span><span class="t-title">' + esc(x.title) + '</span><div class="t-sub">' + esc(x.period || '') + '</div></span><span class="small muted nowrap">' + esc(util.ago ? util.ago(x.at) : util.dateTime(x.at)) + '</span></button>').join('') : '<div class="small muted">Reports you generate are listed here so you can make them again in one click.</div>';
      box.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
        const x = h[+b.dataset.h]; if (!x) return;
        state.pack = (x.ids || []).length > 1 ? x.ids.slice() : []; state.selected = x.ids[0];
        if (x.from) { state.from = x.from; state.to = x.to; state.preset = 'custom'; }
        state.filters = Object.assign({}, x.filters || {}); state.days = Object.assign({}, x.days || {});
        render(el, o);
      });
    }
    function params(def) {
      const pr2 = prefs();
      return { from: state.from, to: state.to, asAt: state.asAt || today(), periodLabel: periodLabel(state.from, state.to), days: state.days[def.id] || def.days || 0,
        filters: (def.filters || []).reduce((o, f) => { if (state.filters[f.key]) o[f.key] = state.filters[f.key]; return o; }, {}), opts: pr2 };
    }
    function run(output) {
      const list = items();
      if (!list.length) { ui.toast('Choose a report first.', 'warning'); return null; }
      try {
        const pr2 = prefs();
        const res = generate(list.map(d => ({ def: d, p: params(d) })), Object.assign({}, pr2, { packTitle: list.length > 1 ? (APP.id === 'stores' ? 'General Stores Report Pack' : 'Procurement Report Pack') : '' }), output);
        const h = readJSON(HIST_KEY, []);
        const entry = { ids: list.map(d => d.id), title: list.length > 1 ? 'Report pack: ' + list.map(d => d.title).join(', ') : list[0].title, period: list.some(d => d.period) ? periodLabel(state.from, state.to) : 'As at ' + util.date(state.asAt || today()), from: state.from, to: state.to, filters: state.filters, days: state.days, at: Date.now() };
        writeJSON(HIST_KEY, [entry].concat(h.filter(x => x.title !== entry.title || x.period !== entry.period)).slice(0, 10));
        if (output !== 'blob') Proc.audit('PDF Report', entry.title + ' — ' + entry.period);
        drawHistory();
        return res;
      } catch (e) { console.error(e); ui.toast('Could not create the report: ' + e.message, 'error'); return null; }
    }

    el.querySelectorAll('[data-r]').forEach(c => {
      const pick = () => { state.selected = c.dataset.r; el.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('on', x === c)); drawOptions(); };
      c.onclick = e => { if (e.target.matches('[data-pk]')) return; pick(); };
      c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
    });
    el.querySelectorAll('[data-pk]').forEach(cb => cb.onchange = () => {
      const id = cb.dataset.pk;
      state.pack = state.pack.filter(x => x !== id); if (cb.checked) state.pack.push(id);
      drawOptions();
    });
    const qi = el.querySelector('#prQ');
    qi.oninput = util.debounce ? util.debounce(() => { state.q = qi.value; const pos = qi.selectionStart; render(el, o); const n = el.querySelector('#prQ'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }, 250) : null;
    el.querySelector('#prPreview').onclick = async () => {
      const res = run('blob'); if (!res) return;
      const pv = el.querySelector('#prPv'); pv.innerHTML = '<div class="loading"><span class="spinner"></span> Drawing preview…</div>';
      el.querySelector('#prPvSub').textContent = res.filename + ' · ' + res.pages + ' ' + util.plural(res.pages, 'page');
      await Proc.pdf.render(pv, res.blob);
      pv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    el.querySelector('#prOpen').onclick = () => run('open');
    el.querySelector('#prSave').onclick = () => { const r = run('save'); if (r) ui.toast(r.filename + ' downloaded', 'success'); };
    drawOptions(); drawHistory();
  }

  Proc.reportPdf = {
    catalog: [],
    /** Add report definitions (see top of file). */
    register(defs) { Proc.reportPdf.catalog = Proc.reportPdf.catalog.concat(defs); },
    /** Generate without the page (e.g. a "PDF" button elsewhere). */
    generate(id, p, output) {
      const def = Proc.reportPdf.catalog.find(r => r.id === id); if (!def) throw new Error('Unknown report ' + id);
      const pr = prefs();
      const from = (p && p.from) || PRESETS[0].range()[0], to = (p && p.to) || PRESETS[0].range()[1];
      return generate([{ def, p: Object.assign({ from, to, asAt: today(), periodLabel: periodLabel(from, to), days: def.days || 0, filters: {}, opts: pr }, p || {}) }], pr, output || 'open');
    },
    periodLabel, quarterOf, fmt
  };
  Proc.reportPdf.render = render;
  // The PDF reports live as a tab on each app's Reports page; old links still work.
  Proc.page({ id: 'pdf-reports', title: 'PDF Reports', icon: 'printer', hidden: true, render(el) { const r = (Proc.router.parse().query || {}).r; location.replace('#/reports?tab=pdf' + (r ? '&r=' + encodeURIComponent(r) : '')); } });
})();
