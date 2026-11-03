/* ==========================================================================
   Proc.pdf — documents drawn directly with jsPDF (vector text).
     memo(memo, { which: 'committee'|'hoe'|'all', hoeIndex, output })
     purchaseOrder(po, { output })
     comparison(cmp, { output })
   output: 'blob' (default) | 'save' | 'open'. Every call returns Promise<Blob>.
   Layout follows the hospital's approval letters: SRHA letterhead on every
   page, facility list down the left side, board list across the foot.
   ========================================================================== */
(function () {
  'use strict';
  const { util, store, domain, K } = Proc;

  const PT = { w: 612, h: 792 };
  const RED = [163, 22, 29], BLUE = [10, 89, 137], INK = [17, 24, 39], GREY = [100, 112, 128], RULE = [170, 178, 189];

  /** jsPDF's built-in fonts are WinAnsi: replace characters they cannot draw. */
  function clean(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
      .replace(/…/g, '...').replace(/ /g, ' ').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');
  }
  const money = n => util.money(n);
  const settings = () => store.settings();

  function newDoc(orientation) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('The PDF library did not load. Check the internet connection and reload the page.');
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter', orientation: orientation || 'portrait', compress: true });
    doc.setLineHeightFactor(1.15);
    return doc;
  }
  function pageSize(doc) { return { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight() }; }

  /* ------------------------------------------------------------ letterhead */
  function drawLetterhead(doc, o) {
    const S = settings(), org = S.org, A = Proc.assets || {};
    const { w } = pageSize(doc);
    const cx = o.side ? 320 : w / 2;
    if (A.mohwLogo) { const lw = 118; doc.addImage(A.mohwLogo, 'PNG', 30, 20, lw, lw / (A.mohwLogoRatio || 2.957), 'mohw', 'FAST'); }
    if (A.srhaLogo) { const sw = 54; doc.addImage(A.srhaLogo, 'PNG', w - 30 - sw, 16, sw, sw / (A.srhaLogoRatio || 1.21), 'srha', 'FAST'); }
    doc.setTextColor.apply(doc, RED);
    doc.setFont('times', 'bold'); doc.setFontSize(17.5);
    doc.text(clean(org.authority), cx, 35, { align: 'center' });
    doc.setFontSize(16); doc.text(clean(org.hospital), cx, 53, { align: 'center' });
    doc.setTextColor.apply(doc, BLUE); doc.setFontSize(9.4);
    doc.text(clean(org.values), cx, 66, { align: 'center' });
    doc.setTextColor.apply(doc, INK); doc.setFont('times', 'normal'); doc.setFontSize(10);
    doc.text(clean(org.address), cx, 81, { align: 'center' });
    labelled(doc, [['Tel', ': ' + org.tel + ' | '], ['Fax', ': ' + org.fax]], cx, 92, 8.6);
    doc.setFont('times', 'bold'); doc.setFontSize(8.6);
    const lbl = 'Website: ', site = clean(org.website);
    const lw2 = doc.getTextWidth(lbl); doc.setFont('times', 'normal'); const sw2 = doc.getTextWidth(site);
    const sx = cx - (lw2 + sw2) / 2;
    doc.setFont('times', 'bold'); doc.text(lbl, sx, 103);
    doc.setFont('times', 'normal'); doc.setTextColor(17, 85, 204); doc.text(site, sx + lw2, 103);
    doc.setDrawColor(17, 85, 204); doc.setLineWidth(0.4); doc.line(sx + lw2, 104.2, sx + lw2 + sw2, 104.2);
    doc.setTextColor.apply(doc, INK);
  }
  function labelled(doc, pairs, cx, y, size) {
    doc.setFontSize(size);
    let total = 0;
    pairs.forEach(([l, v]) => { doc.setFont('times', 'bold'); total += doc.getTextWidth(l); doc.setFont('times', 'normal'); total += doc.getTextWidth(clean(v)); });
    let x = cx - total / 2;
    pairs.forEach(([l, v]) => { doc.setFont('times', 'bold'); doc.text(l, x, y); x += doc.getTextWidth(l); doc.setFont('times', 'normal'); doc.text(clean(v), x, y); x += doc.getTextWidth(clean(v)); });
  }
  function drawSidePanel(doc) {
    const fac = settings().letterhead.facilities || [];
    let y = 140;
    fac.forEach(block => {
      block.forEach((line, i) => {
        doc.setFont('times', i === 0 ? 'bold' : 'normal'); doc.setFontSize(5.8); doc.setTextColor.apply(doc, INK);
        doc.text(clean(line), 22, y); y += 6.9;
      });
      y += 10;
    });
    doc.setDrawColor.apply(doc, RULE); doc.setLineWidth(0.6); doc.line(100, 126, 100, Math.max(y - 4, 560));
  }
  function drawFooter(doc, o) {
    const { w, h } = pageSize(doc);
    const left = o.side ? 96 : 40, right = w - (o.side ? 66 : 40);
    const text = clean(settings().letterhead.footer || '');
    if (!text) return;
    const segs = [];
    // Bold the labels ("Chairman:", "Board Members:" …)
    text.split(/((?:^|[;,]\s*)[A-Z][^:;,]{1,48}:)/).forEach(part => {
      if (!part) return;
      const m = part.match(/^([;,]\s*)?(.*:)$/);
      if (m) { if (m[1]) segs.push({ t: m[1] }); segs.push({ t: m[2], b: true }); } else segs.push({ t: part });
    });
    const ctx = { doc, x: left, w: right - left, y: h - 42, size: 6.3, lh: 7.4, bottom: h, color: INK, newPage: () => {} };
    paragraph(ctx, segs, { justify: false, noBreak: true });
  }
  /** Draw letterhead, side panel, footer and page numbers on every page (called last). */
  function finish(doc, o, segments) {
    const n = doc.internal.getNumberOfPages();
    const { w, h } = pageSize(doc);
    segments = segments || [{ start: 1, end: n }];
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      drawLetterhead(doc, o);
      if (o.side) drawSidePanel(doc);
      drawFooter(doc, o);
      const seg = segments.find(s => p >= s.start && p <= s.end) || { start: 1, end: n };
      const count = seg.end - seg.start + 1;
      if (count > 1 || o.alwaysNumber) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, GREY);
        doc.text('Page ' + (p - seg.start + 1) + ' of ' + count + (o.pageLabel ? '  ·  ' + clean(o.pageLabel) : ''), w - (o.side ? 66 : 40), h - 50, { align: 'right' });
      }
      if (o.watermark) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(96); doc.setTextColor(232, 235, 240);
        doc.text(o.watermark, w / 2 - 150, h / 2 + 120, { angle: 35 });
      }
    }
  }

  /* ---------------------------------------------------- rich text engine */
  /**
   * ctx: { doc, x, w, y (top of next line), size, lh, bottom, newPage(), color }
   * segs: string | [string | {t, b, u}]
   */
  function paragraph(ctx, segs, o) {
    o = o || {};
    const doc = ctx.doc;
    if (!Array.isArray(segs)) segs = [segs];
    const tokens = [];
    segs.forEach(s => {
      const seg = typeof s === 'string' ? { t: s } : s;
      clean(seg.t).split(/(\s+)/).forEach(piece => {
        if (piece === '') return;
        if (/^\s+$/.test(piece)) { if (tokens.length) tokens[tokens.length - 1].sp = true; return; }
        tokens.push({ t: piece, b: !!seg.b, u: !!seg.u, sp: false });
      });
    });
    if (!tokens.length) return ctx.y;
    if (o.keep && !o.noBreak) {
      doc.setFontSize(ctx.size);
      const est = Math.ceil(tokens.reduce((s, tk) => { doc.setFont(o.font || 'helvetica', tk.b ? 'bold' : 'normal'); return s + doc.getTextWidth(tk.t + ' '); }, 0) / ctx.w * 1.06);
      if (est <= 4 && ctx.y + est * ctx.lh > ctx.bottom) ctx.newPage();
    }
    doc.setFontSize(ctx.size);
    const widthOf = tk => { doc.setFont(o.font || 'helvetica', tk.b ? 'bold' : 'normal'); return doc.getTextWidth(tk.t); };
    doc.setFont(o.font || 'helvetica', 'normal');
    const spaceW = doc.getTextWidth(' ');
    const lines = [];
    let line = [], lw = 0, first = true;
    const maxW = () => ctx.w - (first ? (o.firstIndent || 0) : 0);
    tokens.forEach((tk, i) => {
      tk.w = widthOf(tk);
      const prevSp = line.length ? (tokens[i - 1].sp ? spaceW : 0) : 0;
      if (line.length && lw + prevSp + tk.w > maxW()) {
        lines.push({ words: line, w: lw, first }); line = []; lw = 0; first = false;
      }
      tk.gap = line.length ? (tokens[i - 1].sp ? spaceW : 0) : 0;
      line.push(tk); lw += tk.gap + tk.w;
    });
    if (line.length) lines.push({ words: line, w: lw, first, last: true });
    lines.forEach((ln, li) => {
      if (!o.noBreak && ctx.y + ctx.lh > ctx.bottom) ctx.newPage();
      const x0 = ctx.x + (ln.first ? (o.firstIndent || 0) : 0);
      const avail = ctx.w - (ln.first ? (o.firstIndent || 0) : 0);
      const gaps = ln.words.filter((w, i) => i > 0 && w.gap > 0).length;
      const extra = o.justify && !ln.last && gaps ? (avail - ln.w) / gaps : 0;
      let x = o.align === 'center' ? x0 + (avail - ln.w) / 2 : o.align === 'right' ? x0 + avail - ln.w : x0;
      const base = ctx.y + ctx.size * 0.82;
      ln.words.forEach((tk, i) => {
        if (i > 0 && tk.gap > 0) {
          const gw = tk.gap + extra;
          if (tk.u && ln.words[i - 1].u) { doc.setLineWidth(0.6); doc.setDrawColor.apply(doc, ctx.color || INK); doc.line(x, base + 1.4, x + gw, base + 1.4); }
          x += gw;
        }
        doc.setFont(o.font || 'helvetica', tk.b ? 'bold' : 'normal');
        doc.setTextColor.apply(doc, ctx.color || INK);
        doc.text(tk.t, x, base);
        if (tk.u) { doc.setLineWidth(0.6); doc.setDrawColor.apply(doc, ctx.color || INK); doc.line(x, base + 1.4, x + tk.w, base + 1.4); }
        x += tk.w;
      });
      ctx.y += ctx.lh;
    });
    return ctx.y;
  }

  /* --------------------------------------------------------- memo tables */
  function table(ctx, cols, rows, o) {
    o = o || {};
    const doc = ctx.doc, pad = 4, size = o.size || ctx.size, lh = size * 1.22;
    const totalW = cols.reduce((s, c) => s + c.w, 0);
    const scale = ctx.w / totalW;
    cols = cols.map(c => Object.assign({}, c, { w: c.w * scale }));
    const drawRow = (cells, style) => {
      doc.setFontSize(size);
      const wrapped = cells.map((txt, i) => { doc.setFont('helvetica', style.bold || (style.boldCols || []).indexOf(i) >= 0 ? 'bold' : 'normal'); return doc.splitTextToSize(clean(txt), cols[i].w - pad * 2); });
      const hgt = Math.max.apply(null, wrapped.map(w => w.length)) * lh + pad * 1.6;
      if (ctx.y + hgt > ctx.bottom) { ctx.newPage(); if (!style.head && o.head !== false) drawRow(cols.map(c => c.head), { head: true, bold: true }); }
      let x = ctx.x;
      cells.forEach((txt, i) => {
        const c = cols[i];
        if (style.fill) { doc.setFillColor.apply(doc, style.fill); doc.rect(x, ctx.y, c.w, hgt, 'F'); }
        doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.6); doc.rect(x, ctx.y, c.w, hgt, 'S');
        doc.setFont('helvetica', style.bold || (style.boldCols || []).indexOf(i) >= 0 ? 'bold' : 'normal'); doc.setTextColor.apply(doc, INK);
        const align = style.head ? (c.headAlign || 'center') : (c.align || 'left');
        wrapped[i].forEach((ln, k) => {
          const by = ctx.y + pad * 0.8 + size * 0.82 + k * lh;
          if (align === 'right') doc.text(ln, x + c.w - pad, by, { align: 'right' });
          else if (align === 'center') doc.text(ln, x + c.w / 2, by, { align: 'center' });
          else doc.text(ln, x + pad, by);
        });
        x += c.w;
      });
      ctx.y += hgt;
    };
    // Keep at least the header and first two rows together.
    const need = (Math.min(rows.length, 2) + 1) * (lh + pad * 1.6);
    if (ctx.y + need > ctx.bottom) ctx.newPage();
    if (o.head !== false) drawRow(cols.map(c => c.head), { head: true, bold: true });
    rows.forEach(r => drawRow(r.cells || r, r.style || {}));
    ctx.y += o.after === undefined ? 12 : o.after;
  }

  /* ---------------------------------------------------------- memo parts */
  const L = 112, R = 546, TOP = 124, BOTTOM = 728;
  function memoCtx(doc) {
    const ctx = { doc, x: L, w: R - L, y: TOP, size: 10.8, lh: 14.6, bottom: BOTTOM, color: INK };
    ctx.newPage = () => { doc.addPage('letter', 'portrait'); ctx.y = TOP + 6; };
    return ctx;
  }
  function memoHeader(ctx, blocks, re) {
    const doc = ctx.doc;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor.apply(doc, INK);
    doc.text('MEMORANDUM', (L + R) / 2, ctx.y + 10, { align: 'center' });
    ctx.y += 30;
    blocks.forEach(([label, lines]) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
      doc.text(label, L, ctx.y + 9);
      lines.filter(Boolean).forEach((t, i) => doc.text(clean(t), L + 56, ctx.y + 9 + i * 14));
      ctx.y += Math.max(1, lines.filter(Boolean).length) * 14 + 10;
    });
    ctx.y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('Re:', L, ctx.y + 9);
    const sub = { doc, x: L, w: R - L, y: ctx.y, size: 11, lh: 15, bottom: BOTTOM, newPage: ctx.newPage, color: INK };
    paragraph(sub, [{ t: re, b: true, u: true }], { firstIndent: 36 });
    ctx.y = sub.y + 12;
  }
  function gap(ctx, n) { ctx.y += n === undefined ? 10 : n; }
  function para(ctx, segs, o) { paragraph(ctx, segs, Object.assign({ justify: true, keep: true }, o || {})); gap(ctx, 9); }

  function awardRows(awards) {
    const rows = awards.map((a, i) => [String(i + 1), a.supplier, money(a.amount)]);
    if (awards.length > 1) rows.push({ cells: ['', 'Total', money(util.sum(awards, a => a.amount))], style: { bold: true, fill: [243, 244, 246] } });
    return rows;
  }
  const COLS3 = (head3) => [{ w: 36, head: 'No.', align: 'left', headAlign: 'left' }, { w: 254, head: 'Supplier' }, { w: 146, head: head3, align: 'right', headAlign: 'right' }];

  /** "Regards," + signature; when approver is given, an approval box sits to the right. */
  function signature(ctx, name, title, org, approver) {
    const doc = ctx.doc, need = approver ? 104 : 92;
    if (ctx.y + need > ctx.bottom) ctx.newPage();
    const y0 = ctx.y;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.8); doc.setTextColor.apply(doc, INK);
    doc.text('Regards,', L, ctx.y + 9);
    ctx.y += 48;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.5); doc.line(L, ctx.y, L + 170, ctx.y);
    ctx.y += 4;
    doc.setFont('helvetica', 'bold'); doc.text(clean(name || ''), L, ctx.y + 10);
    doc.setFont('helvetica', 'normal');
    const extra = [title, org].filter(Boolean);
    extra.forEach((t, i) => doc.text(clean(t), L + 0, ctx.y + 23.5 + i * 13.5));
    ctx.y += 23.5 + extra.length * 13.5 + 4;
    if (approver) {
      const bx = L + 214, bw = R - bx, by = y0 + 2, bh = 98;
      doc.setDrawColor.apply(doc, RULE); doc.setLineWidth(0.6); doc.setFillColor(248, 250, 252);
      doc.rect(bx, by, bw, bh, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor.apply(doc, GREY);
      doc.text('FOR APPROVAL', bx + 10, by + 14);
      doc.setFontSize(9); doc.setTextColor.apply(doc, INK);
      doc.text(clean(approver.name || ''), bx + 10, by + 27);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(clean(approver.title || ''), bx + 10, by + 38);
      doc.setFontSize(9.5); doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.6);
      doc.rect(bx + 10, by + 48, 8.5, 8.5); doc.text('Approved', bx + 23, by + 55.5);
      doc.rect(bx + 94, by + 48, 8.5, 8.5); doc.text('Not Approved', bx + 107, by + 55.5);
      doc.setLineWidth(0.4);
      doc.text('Signature', bx + 10, by + 78); doc.line(bx + 56, by + 78, bx + bw - 10, by + 78);
      doc.text('Date', bx + 10, by + 92); doc.line(bx + 56, by + 92, bx + bw - 10, by + 92);
      ctx.y = Math.max(ctx.y, by + bh + 6);
    }
  }

  function memoData(memo) {
    const S = settings();
    const awards = (memo.awards || []).filter(a => a && (a.supplier || a.supplierId)).map(a => ({ supplierId: a.supplierId, supplier: clean(a.supplier || domain.supplierName(a.supplierId)), amount: util.num(a.amount) }));
    const bids = (memo.bids || []).filter(b => b && (b.supplier || b.supplierId)).map(b => ({ supplierId: b.supplierId, supplier: clean(b.supplier || domain.supplierName(b.supplierId)), price: util.num(b.price), compliant: b.compliant !== false }));
    const total = util.round2(util.sum(awards, a => a.amount));
    const note = (memo.evaluationNote || '').trim() || domain.autoEvaluationNote(bids);
    return { S, awards, bids, total, note, subject: clean(memo.subject || 'Goods and Services'), ref: clean(memo.ref || ''), from: memo.from || domain.officer() };
  }
  function recommendSentence(n) { return 'The recommendation was made for the awarding of contract' + (n === 1 ? '' : 's') + ' as follows:'; }
  function methodSentence(memo, bids) {
    const name = K.METHOD_NAME[memo.method] || memo.method || 'Restricted Bidding';
    let s = 'The ' + name + ' Methodology was utilized and quotations were solicited ' + (memo.viaGojep !== false ? 'through the GOJEP Platform.' : 'directly from suppliers.');
    const inv = Math.max(Number(memo.invited) || 0, bids.length), b = bids.length;
    const cw = n => domain.countWord(n);
    if (inv <= 1) s += b ? ' One supplier was invited to participate and submitted a bid.' : ' One supplier was invited to participate; no bid was received.';
    else if (b >= inv) s += ' ' + cw(inv) + ' suppliers were invited to participate and all ' + cw(b).toLowerCase() + ' bidders submitted a bid.';
    else s += ' ' + cw(inv) + ' suppliers were invited to participate however, only ' + (b === 1 ? 'one bidder submitted a bid.' : cw(b).toLowerCase() + ' bidders submitted a bid.');
    return s;
  }

  function drawCommittee(doc, memo, d) {
    const S = d.S, ctx = memoCtx(doc), pm = S.signatories.parishManager, cm = S.signatories.committee;
    memoHeader(ctx, [
      ['To:', [pm.name, pm.title, pm.org]],
      ['Thru:', [cm.name, cm.org]],
      ['From:', [d.from.name, d.from.title, d.from.org]],
      ['Date:', [util.dateLong(memo.date) || util.dateLong(util.today())]]
    ], 'Request for approval - Ref #: ' + d.ref);
    para(ctx, ['Approval is being sought for the procurement of ' + d.subject + ' in the amount of ', { t: domain.amountWords(d.total) + ' (' + money(d.total) + ')', b: true }, '.']);
    para(ctx, [(d.note ? d.note + ' ' : '') + recommendSentence(d.awards.length)]);
    table(ctx, COLS3('Recommended Price'), awardRows(d.awards));
    if (memo.note) para(ctx, [memo.note]);
    para(ctx, ['Your approval is therefore respectfully sought to proceed with the procurement from the above-mentioned supplier' + (d.awards.length === 1 ? '' : 's') + ' in keeping with the applicable procurement procedures and guidelines.']);
    gap(ctx, 2);
    signature(ctx, d.from.name, d.from.title, d.from.org, S.memo && S.memo.approvalBlock ? pm : null);
  }
  function drawHoe(doc, memo, d, award) {
    const S = d.S, ctx = memoCtx(doc), sg = S.signatories, rd = sg.regionalDirector, ceo = sg.ceo, pm = sg.parishManager;
    memoHeader(ctx, [
      ['To:', [rd.name, rd.title, rd.org]],
      ['Thru:', [ceo.name, ceo.title, ceo.org]],
      ['From:', [pm.name, pm.title, pm.org]],
      ['Date:', [util.dateLong(memo.date) || util.dateLong(util.today())]]
    ], 'Procurement of ' + d.subject + ' for the ' + S.org.hospital + ' within ' + S.org.authority + '   Ref #: ' + d.ref);
    const amt = { t: domain.amountWords(award.amount) + ' (' + money(award.amount) + ')', b: true };
    para(ctx, ['Approval is being sought for the procurement of ' + d.subject + ' from ', { t: award.supplier, b: true }, ' in the amount of ', amt, '.']);
    para(ctx, [methodSentence(memo, d.bids)]);
    if (d.bids.length) table(ctx, COLS3('Bid Price'), d.bids.map((b, i) => [String(i + 1), b.supplier, money(b.price)]));
    para(ctx, [(d.note ? d.note + ' ' : '') + recommendSentence(d.awards.length)]);
    table(ctx, COLS3('Recommended Price'), awardRows(d.awards));
    para(ctx, ['Due to the value of the authorization requested, this procurement falls outside the ' + money(S.limits.delegated) + ' approving authority delegated to the ' + pm.title + '.']);
    if (memo.hoeNote) para(ctx, [memo.hoeNote]);
    para(ctx, ['Accordingly, your approval is hereby sought to engage ', { t: award.supplier, b: true }, ' in the amount of ', amt, ' for the procurement of ' + d.subject + '.']);
    gap(ctx, 2);
    signature(ctx, pm.name, pm.title, pm.org, S.memo && S.memo.approvalBlock ? rd : null);
    if (d.from && d.from.name) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, GREY);
      if (ctx.y + 12 > ctx.bottom) ctx.newPage();
      doc.text(clean('Prepared by: ' + d.from.name + (d.from.title ? ', ' + d.from.title : '')), L, ctx.y + 8);
      ctx.y += 14;
    }
  }

  /** Awards that need a Head of Entity memo (above the Parish Manager's delegated limit). */
  function hoeAwards(memo) {
    const lim = settings().limits.delegated;
    return memoData(memo).awards.filter(a => a.amount > lim);
  }

  function fileSafe(s) { return clean(s).replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90); }

  function deliver(doc, filename, output) {
    const blob = doc.output('blob');
    if (output === 'save') util.download(blob, filename);
    else if (output === 'open') {
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) util.download(blob, filename);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    }
    return blob;
  }

  const pdf = Proc.pdf = {};
  pdf.clean = clean;

  /* ------------------------------------------------ on-screen preview */
  /** Render a PDF blob into a container as page images (pdf.js, lazy-loaded).
      Falls back to the browser's built-in viewer in an iframe. Works the same on phones. */
  const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let pdfjsPromise = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS_BASE + 'pdf.min.js';
      s.onload = () => { if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js'; resolve(window.pdfjsLib); } else reject(new Error('pdf.js missing')); };
      s.onerror = () => { pdfjsPromise = null; reject(new Error('pdf.js failed to load')); };
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('pdf.js timeout')), 12000);
    });
    return pdfjsPromise;
  }
  pdf.render = async function (container, blob, o) {
    o = o || {};
    const token = (container._pvToken = (container._pvToken || 0) + 1);
    try {
      const lib = await loadPdfJs();
      const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      if (container._pvToken !== token) return;
      const frag = document.createElement('div');
      frag.className = 'pv-pages';
      const width = Math.max(260, (container.clientWidth || 600) - 24);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        const vp1 = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: (width / vp1.width) * dpr });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height; c.style.width = width + 'px'; c.style.height = (vp.height / dpr) + 'px';
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        if (container._pvToken !== token) return;
        frag.appendChild(c);
      }
      container.innerHTML = ''; container.appendChild(frag);
    } catch (e) {
      if (container._pvToken !== token) return;
      if (container._pvUrl) URL.revokeObjectURL(container._pvUrl);
      container._pvUrl = URL.createObjectURL(blob);
      container.innerHTML = '<iframe class="pdf-frame" title="PDF preview" src="' + container._pvUrl + '"></iframe>';
    }
  };
  pdf.hoeAwards = hoeAwards;
  /** List of documents a memo produces: [{ key:'committee'|'hoe:<i>', label, award }] */
  pdf.memoParts = function (memo) {
    const parts = [{ key: 'committee', label: 'Committee memo', title: 'To ' + settings().signatories.parishManager.title + ', thru ' + settings().signatories.committee.name }];
    hoeAwards(memo).forEach((a, i) => parts.push({ key: 'hoe:' + i, label: 'Head of Entity memo – ' + a.supplier, title: 'To ' + settings().signatories.regionalDirector.title + ', thru ' + settings().signatories.ceo.title, award: a }));
    return parts;
  };
  pdf.memoFilename = function (memo, which, hoeIndex) {
    const ref = fileSafe(memo.ref || memo.subject || 'memo');
    if (which === 'committee') return 'Approval Memo - Committee - ' + ref + '.pdf';
    if (which === 'hoe') { const a = hoeAwards(memo)[hoeIndex || 0]; return 'Approval Memo - Head of Entity - ' + fileSafe(a ? a.supplier : '') + ' - ' + ref + '.pdf'; }
    return 'Approval Memos - ' + ref + '.pdf';
  };
  pdf.memoDoc = function (memo, o) {
    o = o || {};
    const which = o.which || 'all';
    const d = memoData(memo);
    const doc = newDoc();
    const segs = [];
    let started = false;
    const start = () => { if (started) doc.addPage('letter', 'portrait'); started = true; return doc.internal.getNumberOfPages(); };
    if (which === 'committee' || which === 'all') { const s = start(); drawCommittee(doc, memo, d); segs.push({ start: s, end: doc.internal.getNumberOfPages() }); }
    const hoes = hoeAwards(memo);
    hoes.forEach((a, i) => {
      if (which === 'all' || (which === 'hoe' && (o.hoeIndex || 0) === i)) { const s = start(); drawHoe(doc, memo, d, a); segs.push({ start: s, end: doc.internal.getNumberOfPages() }); }
    });
    if (!started) drawCommittee(doc, memo, d);
    finish(doc, { side: true }, segs.length ? segs : null);
    doc.setProperties({ title: 'Approval memo ' + (memo.ref || ''), subject: memo.subject || '', author: (d.from && d.from.name) || '', creator: 'Procurement Management System' });
    return doc;
  };
  pdf.memo = function (memo, o) {
    o = o || {};
    try {
      const doc = pdf.memoDoc(memo, o);
      return Promise.resolve(deliver(doc, pdf.memoFilename(memo, o.which || 'all', o.hoeIndex), o.output));
    } catch (e) { return Promise.reject(e); }
  };

  /* ------------------------------------------------------- purchase order */
  pdf.purchaseOrder = function (po, o) {
    o = o || {};
    try {
      const S = settings(), doc = newDoc(), { w, h } = pageSize(doc);
      const M = 40, top = 122;
      const sup = store.get('suppliers', po.supplierId) || {};
      const off = domain.officer();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor.apply(doc, BLUE);
      doc.text('PURCHASE ORDER', M, top + 16);
      // Right-hand facts
      const facts = [['PO No.', po.poNumber || 'DRAFT'], ['Date', util.date(po.date) || util.date(util.today())], ['Reference', po.ref || ''], ['Requisition', po.requestNo || (po.requisitionId ? (store.get('requisitions', po.requisitionId) || {}).number || '' : '')]].filter(f => f[1]);
      let fy = top + 4;
      facts.forEach(([k, v]) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, GREY); doc.text(k.toUpperCase(), w - M - 170, fy + 8);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, INK); doc.text(clean(v), w - M, fy + 8, { align: 'right', maxWidth: 110 });
        fy += 14;
      });
      let y = Math.max(top + 34, fy + 6);
      // Supplier / deliver-to boxes
      const bw = (w - M * 2 - 14) / 2;
      const box = (x, title, lines) => {
        doc.setDrawColor(210, 216, 224); doc.setLineWidth(0.7); doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, y, bw, 92, 4, 4, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor.apply(doc, GREY); doc.text(title, x + 10, y + 15);
        let yy = y + 30;
        lines.filter(l => l && l[1]).slice(0, 6).forEach(([b, t]) => {
          doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.setFontSize(b ? 10.5 : 9); doc.setTextColor.apply(doc, INK);
          doc.text(doc.splitTextToSize(clean(t), bw - 20)[0], x + 10, yy); yy += b ? 14 : 11.5;
        });
      };
      box(M, 'SUPPLIER', [[1, po.supplierName || sup.name], [0, sup.address], [0, sup.trn ? 'TRN: ' + sup.trn : ''], [0, [sup.phone, sup.email].filter(Boolean).join('  ·  ')], [0, sup.contactPerson ? 'Attn: ' + sup.contactPerson : '']]);
      box(M + bw + 14, 'DELIVER TO', [[1, S.org.hospital], [0, po.deliveryAddress || S.org.deliveryAddress], [0, po.department ? 'Department: ' + po.department : ''], [0, po.requisitioner ? 'Requested by: ' + po.requisitioner : ''], [0, 'Tel: ' + S.org.tel]]);
      y += 104;
      // Terms strip
      const strip = [['Procurement method', po.method || '—'], ['Category', po.category || po.type || '—'], ['Payment terms', po.paymentTerms || '—'], ['Approval memo', po.memoId ? ((store.get('memos', po.memoId) || {}).ref || 'On file') : '—']];
      const sw = (w - M * 2) / strip.length;
      strip.forEach(([k, v], i) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, GREY); doc.text(k.toUpperCase(), M + i * sw, y + 8);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, INK); doc.text(doc.splitTextToSize(clean(v), sw - 8)[0], M + i * sw, y + 21);
      });
      y += 34;
      if (po.description) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, INK);
        const lines = doc.splitTextToSize(clean('Description: ' + po.description), w - M * 2);
        doc.text(lines.slice(0, 3), M, y + 8); y += 8 + Math.min(3, lines.length) * 11.5 + 4;
      }
      const items = (po.items || []).length ? po.items : [{ description: po.description || 'As per quotation', unit: '', qty: 1, unitPrice: po.subtotal || po.total, total: po.subtotal || po.total }];
      const subtotal = util.num(po.subtotal) || util.sum(items, i => util.num(i.total));
      const gct = util.num(po.gct), total = util.num(po.total) || subtotal + gct;
      doc.autoTable({
        startY: y, margin: { left: M, right: M, top: top, bottom: 84 }, theme: 'grid',
        head: [['#', 'Description', 'Unit', 'Qty', 'Unit Price', 'Amount']],
        body: items.map((it, i) => [String(i + 1), clean(it.description), clean(it.unit || ''), util.int(it.qty), money(it.unitPrice), money(it.total || util.num(it.qty) * util.num(it.unitPrice))]),
        foot: [['', '', '', '', 'Subtotal', money(subtotal)], ['', '', '', '', 'GCT', money(gct)], ['', '', '', '', 'TOTAL', money(total)]],
        showFoot: 'lastPage',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, lineColor: [210, 216, 224], lineWidth: 0.5, textColor: INK, overflow: 'linebreak' },
        headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [248, 250, 252], textColor: INK, fontStyle: 'bold', halign: 'right' },
        columnStyles: { 0: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 46 }, 3: { cellWidth: 42, halign: 'right' }, 4: { cellWidth: 80, halign: 'right' }, 5: { cellWidth: 88, halign: 'right' } },
        didParseCell: data => { if (data.section === 'foot' && data.column.index < 4) data.cell.styles.lineWidth = 0; }
      });
      y = doc.lastAutoTable.finalY + 14;
      const need = 150;
      if (y + need > h - 84) { doc.addPage('letter', 'portrait'); y = top + 6; }
      const ctx = { doc, x: M, w: w - M * 2, y, size: 9.5, lh: 12.5, bottom: h - 84, newPage: () => { doc.addPage(); ctx.y = top + 6; }, color: INK };
      paragraph(ctx, [{ t: 'Amount in words: ', b: true }, domain.amountWords(total) + ' (JMD)']);
      ctx.y += 4;
      if (po.instructions) { paragraph(ctx, [{ t: 'Instructions: ', b: true }, po.instructions]); ctx.y += 4; }
      paragraph(ctx, [{ t: 'Conditions: ', b: true }, 'Please quote the PO number on all invoices and delivery notes. Goods/services must match the specification and quantities above; deliveries are subject to inspection and acceptance by the receiving department. Invoices are paid on receipt of goods and a valid invoice in accordance with the stated payment terms.']);
      y = ctx.y + 34;
      const cw = (w - M * 2 - 40) / 3;
      const sigs = [['Prepared by', off.name, off.title], ['Authorised by', S.signatories.parishManager.name, S.signatories.parishManager.title], ['Accepted by supplier', '', 'Name, signature & date']];
      sigs.forEach(([lab, nm, ti], i) => {
        const x = M + i * (cw + 20);
        doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.5); doc.line(x, y, x + cw, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, GREY); doc.text(lab.toUpperCase(), x, y + 10);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, INK); if (nm) doc.text(clean(nm), x, y + 22);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(clean(ti || ''), x, y + (nm ? 33 : 22));
      });
      finish(doc, { side: false, watermark: !po.poNumber || po.status === 'Draft' ? 'DRAFT' : (po.status === 'Cancelled' ? 'CANCELLED' : '') });
      doc.setProperties({ title: 'Purchase Order ' + (po.poNumber || 'draft'), creator: 'Procurement Management System' });
      const fn = 'Purchase Order ' + fileSafe(po.poNumber || 'DRAFT') + ' - ' + fileSafe(po.supplierName || sup.name || '') + '.pdf';
      return Promise.resolve(deliver(doc, fn, o.output));
    } catch (e) { return Promise.reject(e); }
  };

  /* ------------------------------------------------- comparison / evaluation */
  pdf.comparison = function (cmp, o) {
    o = o || {};
    try {
      const sups = cmp.suppliers || [];
      const land = sups.length > 4;
      const doc = newDoc(land ? 'landscape' : 'portrait'), { w, h } = pageSize(doc);
      const M = 36, top = 122;
      const r = domain.computeComparison(cmp);
      const S = settings(), off = domain.officer();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor.apply(doc, BLUE);
      doc.text('PRICE COMPARISON & BID EVALUATION', M, top + 14);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor.apply(doc, INK);
      doc.text(clean(cmp.subject || ''), M, top + 31);
      const facts = [['Reference', cmp.ref], ['Date', util.date(cmp.date)], ['Method', cmp.method], ['Invited', String(cmp.invited || sups.length)], ['Bids received', String(r.bidsReceived)], ['Closing date', util.date(cmp.closingDate)], ['Requisition', cmp.requisitionId ? (store.get('requisitions', cmp.requisitionId) || {}).number : '']].filter(f => f[1]);
      const fw = (w - M * 2) / Math.min(facts.length, 7);
      facts.forEach(([k, v], i) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, GREY); doc.text(k.toUpperCase(), M + i * fw, top + 50);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, INK); doc.text(doc.splitTextToSize(clean(v), fw - 8)[0], M + i * fw, top + 63);
      });
      const head = ['#', 'Item', 'Unit', 'Qty'].concat(sups.map(s => clean(s.name || domain.supplierName(s.supplierId)) + (s.compliant === false ? ' (non-compliant)' : '') + (s.gct ? ' +GCT' : '')));
      const body = r.lines.map((l, i) => [String(i + 1), clean(l.item.description), clean(l.item.unit || ''), util.int(l.qty)].concat(sups.map(s => { const q = l.quotes[s.supplierId]; return q ? util.money(q.unit).replace('$', '') + (l.awardSid === s.supplierId ? ' *' : '') : '-'; })));
      const foot = [
        ['', 'Bid total (incl. GCT where applicable)', '', ''].concat(sups.map(s => money(r.bySupplier[s.supplierId].total))),
        ['', 'Lines quoted', '', ''].concat(sups.map(s => r.bySupplier[s.supplierId].quoted + ' / ' + r.lines.length)),
        ['', 'Compliant with specifications', '', ''].concat(sups.map(s => (s.compliant === false ? 'No' : 'Yes')))
      ];
      doc.autoTable({
        startY: top + 76, margin: { left: M, right: M, top: top, bottom: 84 }, theme: 'grid', head: [head], body, foot, showFoot: 'lastPage',
        styles: { font: 'helvetica', fontSize: sups.length > 6 ? 7.5 : 8.5, cellPadding: 4, lineColor: [210, 216, 224], lineWidth: 0.5, textColor: INK },
        headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', valign: 'bottom' },
        footStyles: { fillColor: [248, 250, 252], textColor: INK, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 20, halign: 'center' }, 2: { cellWidth: 36 }, 3: { cellWidth: 34, halign: 'right' } },
        didParseCell: data => {
          if (data.column.index >= 4) data.cell.styles.halign = 'right';
          if (data.section === 'body' && data.column.index >= 4) {
            const l = r.lines[data.row.index], s = sups[data.column.index - 4];
            if (l && s && l.lowestSid === s.supplierId) { data.cell.styles.fillColor = [220, 252, 231]; data.cell.styles.fontStyle = 'bold'; }
          }
        }
      });
      let y = doc.lastAutoTable.finalY + 6;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, GREY);
      doc.text('Unit prices in JMD. Shaded = lowest compliant price for the line (GCT-inclusive comparison).  * = recommended award.', M, y + 8);
      y += 22;
      if (r.awards.length) {
        doc.autoTable({
          startY: y, margin: { left: M, right: M, top: top, bottom: 84 }, theme: 'grid',
          head: [['Recommended award', 'Lines', 'Subtotal', 'GCT', 'Total']],
          body: r.awards.map(a => [clean(a.name), String(a.items.length), money(a.subtotal), money(a.gct), money(a.total)]),
          foot: [['Total recommended', String(util.sum(r.awards, a => a.items.length)), money(util.sum(r.awards, a => a.subtotal)), money(util.sum(r.awards, a => a.gct)), money(r.awardTotal)]],
          styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, lineColor: [210, 216, 224], lineWidth: 0.5, textColor: INK },
          headStyles: { fillColor: [241, 244, 247], textColor: INK, fontStyle: 'bold' }, footStyles: { fillColor: [248, 250, 252], textColor: INK, fontStyle: 'bold' },
          columnStyles: { 1: { halign: 'right', cellWidth: 50 }, 2: { halign: 'right', cellWidth: 100 }, 3: { halign: 'right', cellWidth: 90 }, 4: { halign: 'right', cellWidth: 100 } }
        });
        y = doc.lastAutoTable.finalY + 14;
      }
      const ctx = { doc, x: M, w: w - M * 2, y, size: 9.5, lh: 12.8, bottom: h - 84, newPage: () => { doc.addPage(); ctx.y = top + 6; }, color: INK };
      const bids = sups.filter(s => r.bySupplier[s.supplierId].quoted).map(s => ({ supplier: r.bySupplier[s.supplierId].name, compliant: s.compliant !== false }));
      const note = (cmp.evaluationNote || '').trim() || domain.autoEvaluationNote(bids);
      if (note) { paragraph(ctx, [{ t: 'Evaluation: ', b: true }, note], { justify: true }); ctx.y += 4; }
      if (r.unawarded) { paragraph(ctx, [{ t: 'Note: ', b: true }, r.unawarded + ' line(s) have no compliant quotation and are not awarded.']); ctx.y += 4; }
      if (r.savingVsHighest > 0) { paragraph(ctx, [{ t: 'Value for money: ', b: true }, 'the recommendation is ' + money(r.savingVsHighest) + ' below the highest compliant prices quoted.']); ctx.y += 4; }
      const route = domain.approvalRoute(r.awardTotal, r.awards.map(a => ({ amount: a.total })));
      paragraph(ctx, [{ t: 'Approval route: ', b: true }, route.steps.slice(1).map(s => s.title).join(' > ')]);
      y = ctx.y + 40;
      if (y + 40 > h - 84) { doc.addPage(); y = top + 46; }
      const cw = (w - M * 2 - 40) / 3;
      [['Prepared by', off.name, off.title], ['Checked by', '', ''], ['Chairman, ' + S.signatories.committee.name, '', '']].forEach(([lab, nm, ti], i) => {
        const x = M + i * (cw + 20);
        doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.5); doc.line(x, y, x + cw, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, GREY); doc.text(clean(lab).toUpperCase(), x, y + 10);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, INK); if (nm) doc.text(clean(nm), x, y + 22);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); if (ti) doc.text(clean(ti), x, y + 33);
      });
      finish(doc, { side: false, alwaysNumber: false });
      doc.setProperties({ title: 'Price comparison ' + (cmp.ref || ''), creator: 'Procurement Management System' });
      return Promise.resolve(deliver(doc, 'Price Comparison - ' + fileSafe(cmp.ref || cmp.subject || 'comparison') + '.pdf', o.output));
    } catch (e) { return Promise.reject(e); }
  };
})();
