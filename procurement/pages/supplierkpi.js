/* ==========================================================================
   Supplier KPIs (#/supplier-kpis) — supplier quality, month to date vs the
   previous month, from purchase orders, goods received notes, returns and
   invoices.
     • Suppliers used · Value ordered · Value rejected · On time & in budget
     • Return-to-vendor cost by supplier · Rejection rate by supplier (two
       charts — never one chart with two scales)
     • Spend under management: monthly spend by budget line, last 12 months
     • Supplier scorecard with a 0–100 score and grade
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain } = Proc;
  const esc = util.esc, num = util.num;

  const ymOf = iso => String(iso || '').slice(0, 7);
  const addMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const monthName = ym => { const [y, m] = ym.split('-').map(Number); return util.MONTHS[m - 1] + ' ' + y; };
  const mon3 = ym => util.MONTHS[Number(ym.split('-')[1]) - 1].slice(0, 3);
  const pct = (a, b) => (b ? a / b * 100 : 0);
  const fmtPct = v => (Math.round(v * 10) / 10) + '%';

  /* Categorical slots (validated reference palette, fixed order) + neutral "Other". */
  const SERIES = { light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#8a8f98'], dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#8b9099'] };

  /* ------------------------------------------------------------ measures */
  const activePOs = () => store.list('purchaseOrders').filter(p => p.status !== 'Cancelled' && p.status !== 'Draft');
  const supKey = po => po.supplierId || domain.supplierKey(po.supplierName || '') || '?';
  const supLabel = (k, po) => domain.supplierName(k, (po && po.supplierName) || k);
  function unitPrice(po, item) {
    if (item.unitCost !== undefined && item.unitCost !== '' && item.unitCost !== null) return num(item.unitCost);
    const lines = domain.poLines(po);
    if (typeof item.lineIndex === 'number' && lines[item.lineIndex]) return num(lines[item.lineIndex].unitPrice);
    const l = lines.find(x => String(x.description || '').toLowerCase() === String(item.description || '').toLowerCase());
    return l ? num(l.unitPrice) : 0;
  }
  /** All the figures for one month (and per supplier). */
  function monthFigures(ym) {
    const pos = activePOs().filter(p => ymOf(p.date) === ym);
    const dels = store.list('deliveries').filter(d => !d.voided && ymOf(d.date) === ym);
    const rets = store.list('supplierReturns').filter(r => ymOf(r.date) === ym);
    const by = {};
    const S = (k, po) => (by[k] = by[k] || { key: k, name: supLabel(k, po), pos: 0, ordered: 0, deliveries: 0, onTime: 0, late: 0, lateDays: 0, receivedVal: 0, rejectedVal: 0, rejectedQty: 0, receivedQty: 0, returnCost: 0, inBudget: 0, budgetChecked: 0 });
    pos.forEach(p => { const s = S(supKey(p), p); s.pos++; s.ordered += num(p.total); });
    dels.forEach(d => {
      const po = store.get('purchaseOrders', d.poId) || {}; const s = S(supKey(po) || d.supplierId, po);
      s.deliveries++;
      const exp = po.id ? domain.expectedDate(po) : '';
      const late = exp ? util.daysBetween(exp, d.date) : 0;
      if (late > 0) { s.late++; s.lateDays += late; } else s.onTime++;
      (d.items || []).forEach(i => { const u = unitPrice(po, i); s.receivedVal += num(i.qtyReceived) * u; s.rejectedVal += num(i.qtyRejected) * u; s.receivedQty += num(i.qtyReceived); s.rejectedQty += num(i.qtyRejected); });
      // In budget: everything invoiced against the PO stays within the PO value.
      if (po.id) { const inv = util.sum(store.list('invoices').filter(x => x.poId === po.id), x => num(x.total || x.amount)); s.budgetChecked++; if (!inv || inv <= num(po.total) + 0.5) s.inBudget++; }
    });
    rets.forEach(r => {
      const po = store.get('purchaseOrders', r.poId) || {}; const s = S(supKey(po) || r.supplierId, po);
      s.returnCost += util.sum(r.items || [], i => num(i.qty) * unitPrice(po, i));
    });
    const sups = Object.values(by);
    const T = k => util.sum(sups, s => s[k]);
    const deliveries = T('deliveries');
    const okBoth = sups.reduce((n, s) => n + Math.min(s.onTime, s.inBudget), 0);
    return {
      ym, sups, poCount: pos.length, suppliers: new Set(pos.map(supKey)).size, ordered: T('ordered'), deliveries,
      receivedVal: T('receivedVal'), rejectedVal: T('rejectedVal'), rejectRate: pct(T('rejectedVal'), T('receivedVal') + T('rejectedVal')),
      onTimeRate: pct(T('onTime'), deliveries), inTimeBudget: pct(okBoth, deliveries), returnCost: T('returnCost')
    };
  }
  /** 0–100 score: on time 40, quality (rejections) 30, compliance (TCC) 15, invoicing within PO 15. */
  function score(s) {
    const sup = store.get('suppliers', s.key);
    if (!s.deliveries) return { v: null, grade: '—', tcc: sup && sup.tccExpiry ? domain.expiryState(sup.tccExpiry) : null };   // nothing delivered yet: not scored
    const onTime = s.onTime / s.deliveries;
    const rej = s.receivedQty + s.rejectedQty ? s.rejectedQty / (s.receivedQty + s.rejectedQty) : 0;
    const tcc = sup && sup.tccExpiry ? domain.expiryState(sup.tccExpiry) : null;
    const parts = [[onTime === null ? null : onTime, 40], [Math.max(0, 1 - rej * 4), 30], [tcc ? (tcc.tone === 'success' ? 1 : tcc.tone === 'warning' ? .6 : 0) : .5, 15], [s.budgetChecked ? s.inBudget / s.budgetChecked : null, 15]].filter(p => p[0] !== null);
    const w = util.sum(parts, p => p[1]);
    const v = w ? Math.round(util.sum(parts, p => p[0] * p[1]) / w * 100) : null;
    return { v, grade: v === null ? '—' : v >= 85 ? 'A' : v >= 70 ? 'B' : v >= 50 ? 'C' : 'D', tcc };
  }
  /** Scorecard over a window of months ending at ym. */
  function scorecard(ym, months) {
    const all = {};
    for (let i = 0; i < months; i++) monthFigures(addMonth(ym, -i)).sups.forEach(s => {
      const a = all[s.key] = all[s.key] || Object.assign({}, s, { pos: 0, ordered: 0, deliveries: 0, onTime: 0, late: 0, lateDays: 0, receivedVal: 0, rejectedVal: 0, rejectedQty: 0, receivedQty: 0, returnCost: 0, inBudget: 0, budgetChecked: 0 });
      ['pos', 'ordered', 'deliveries', 'onTime', 'late', 'lateDays', 'receivedVal', 'rejectedVal', 'rejectedQty', 'receivedQty', 'returnCost', 'inBudget', 'budgetChecked'].forEach(k => { a[k] += s[k]; });
    });
    return Object.values(all).map(s => Object.assign(s, { sc: score(s) })).sort((a, b) => b.ordered - a.ordered);
  }
  /** Monthly spend by budget line for the last 12 months: top 4 lines + Other. */
  function spendUnderManagement(ym) {
    const months = []; for (let i = 11; i >= 0; i--) months.push(addMonth(ym, -i));
    const fy = util.fiscalYear(ym + '-01');
    const lines = Proc.budget ? store.list('budgetLines').filter(l => l.fy === fy && l.active !== false) : [];
    const totals = {}, cells = {};
    activePOs().filter(p => months.indexOf(ymOf(p.date)) >= 0).forEach(p => {
      const m = Proc.budget && lines.length ? Proc.budget.lineForPO(p, lines) : { line: null };
      const k = m.line ? m.line.name : '__none';
      totals[k] = (totals[k] || 0) + num(p.total);
      const c = cells[k] = cells[k] || {}; c[ymOf(p.date)] = (c[ymOf(p.date)] || 0) + num(p.total);
    });
    // Unmatched POs never take a colour slot: they go into "Other".
    const ranked = Object.keys(totals).filter(k => k !== '__none').sort((a, b) => totals[b] - totals[a]).concat(totals.__none ? ['__none'] : []);
    const top = ranked.slice(0, 4), rest = ranked.slice(4);
    const series = top.map(k => ({ name: k, values: months.map(m => (cells[k] || {})[m] || 0) }));
    if (rest.length) series.push({ name: rest.indexOf('__none') >= 0 ? (rest.length > 1 ? 'Other lines & unmatched' : 'Not matched to a line') : 'Other (' + rest.length + ' lines)', other: true, values: months.map(m => util.sum(rest, k => (cells[k] || {})[m] || 0)) });
    return { months, series, total: util.sum(Object.values(totals)) };
  }

  /* ------------------------------------------------------------ charts (inline SVG) */
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  /** Horizontal bars with value labels; hover shows the exact figure. */
  function hbarChart(rows, o) {
    if (!rows.length) return '<div class="empty small" style="padding:28px 10px">' + esc(o.empty || 'Nothing to show for this month.') + '</div>';
    const max = Math.max.apply(null, rows.map(r => r.value).concat([o.min || 0, 1e-9]));
    return '<div class="sk-hbars">' + rows.map(r => '<div class="sk-hb" title="' + esc(r.label + ': ' + o.fmt(r.value) + (r.sub ? ' · ' + r.sub : '')) + '"><div class="nm truncate">' + esc(r.label) + '</div><div class="tr"><i style="width:' + Math.max(1.5, r.value / max * 100) + '%"></i></div><div class="v num">' + esc(o.fmt(r.value)) + '</div></div>').join('') + '</div>';
  }
  /** Multi-line chart, one y-scale, legend + end labels, crosshair tooltip. */
  function lineChart(el, data) {
    const W = Math.max(520, Math.round(el.clientWidth || 760)), H = 280, L = 64, R = 170, T = 14, B = 30, pw = W - L - R, ph = H - T - B;
    const cols = SERIES[dark() ? 'dark' : 'light'];
    const max = Math.max(1, Math.max.apply(null, data.series.map(s => Math.max.apply(null, s.values))));
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const m = max / p; return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
    const x = i => L + (data.months.length < 2 ? pw / 2 : i * pw / (data.months.length - 1)), y = v => T + ph - v / nice * ph;
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="sk-line" role="img" aria-label="Monthly spend by budget line, last 12 months">';
    for (let g = 0; g <= 4; g++) { const v = nice * g / 4, yy = y(v); svg += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + yy + '" y2="' + yy + '" class="gr"/><text x="' + (L - 8) + '" y="' + (yy + 4) + '" class="ax" text-anchor="end">' + util.moneyShort(v) + '</text>'; }
    data.months.forEach((m, i) => { svg += '<text x="' + x(i) + '" y="' + (H - 8) + '" class="ax" text-anchor="middle">' + mon3(m) + '</text>'; });
    const ends = [];
    data.series.forEach((s, si) => {
      const c = s.other ? cols[4] : cols[si];
      svg += '<path d="' + s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      s.values.forEach((v, i) => { svg += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3.2" fill="' + c + '" stroke="var(--surface)" stroke-width="2"/>'; });
      ends.push({ y: y(s.values[s.values.length - 1]), name: s.name, c });
    });
    // End labels (de-overlapped), text in ink with a colour key
    ends.sort((a, b) => a.y - b.y); for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    ends.forEach(e => { svg += '<rect x="' + (L + pw + 8) + '" y="' + (e.y - 5) + '" width="10" height="10" rx="2" fill="' + e.c + '"/><text x="' + (L + pw + 22) + '" y="' + (e.y + 4) + '" class="lb">' + esc(e.name.length > 22 ? e.name.slice(0, 21) + '…' : e.name) + '</text>'; });
    svg += '<line class="xh" x1="0" x2="0" y1="' + T + '" y2="' + (T + ph) + '" style="display:none"/>';
    data.months.forEach((m, i) => { const w = pw / Math.max(1, data.months.length - 1); svg += '<rect class="hit" data-i="' + i + '" x="' + (x(i) - w / 2) + '" y="' + T + '" width="' + w + '" height="' + ph + '" fill="transparent"/>'; });
    svg += '</svg>';
    if (!data.series.length) { el.innerHTML = '<div class="empty small" style="padding:28px 10px">No purchase orders in these 12 months.</div>'; return; }
    el.innerHTML = '<div class="sk-legend">' + data.series.map((s, si) => '<span><i style="background:' + (s.other ? cols[4] : cols[si]) + '"></i>' + esc(s.name) + '</span>').join('') + '</div><div class="sk-chartwrap">' + svg + '<div class="sk-tip" hidden></div></div>';
    const svgEl = el.querySelector('svg'), tip = el.querySelector('.sk-tip'), xh = el.querySelector('.xh');
    el.querySelectorAll('.hit').forEach(r => {
      r.addEventListener('mouseenter', () => {
        const i = +r.dataset.i, xx = x(i);
        xh.setAttribute('x1', xx); xh.setAttribute('x2', xx); xh.style.display = '';
        tip.innerHTML = '<div class="h">' + esc(monthName(data.months[i])) + '</div>' + data.series.map((s, si) => '<div class="r"><i style="background:' + (s.other ? cols[4] : cols[si]) + '"></i><span>' + esc(s.name) + '</span><b>' + util.money(s.values[i], { noCents: true }) + '</b></div>').join('');
        tip.hidden = false;
        const box = svgEl.getBoundingClientRect(), sx = box.width / W;
        tip.style.left = Math.min(box.width - 250, Math.max(0, xx * sx + 12)) + 'px'; tip.style.top = '8px';
      });
      r.addEventListener('mouseleave', () => { tip.hidden = true; xh.style.display = 'none'; });
    });
  }

  /* ------------------------------------------------------------ page */
  const CSS = '.sk-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}' +
    '.sk-tile{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px}.sk-tile .l{font-size:12.5px;color:var(--text-2);font-weight:600}' +
    '.sk-tile .v{font-size:30px;font-weight:750;letter-spacing:-.02em;margin-top:6px;font-variant-numeric:tabular-nums}.sk-tile .d{display:flex;align-items:center;gap:6px;font-size:12.5px;margin-top:4px;color:var(--text-3)}' +
    '.sk-tile .d b{font-weight:700}.sk-tile .d .up{color:var(--success)}.sk-tile .d .dn{color:var(--danger)}.sk-tile .d .fl{color:var(--text-3)}' +
    '.sk-meter{height:10px;border-radius:99px;background:var(--surface-3);margin-top:10px;overflow:hidden}.sk-meter i{display:block;height:100%;border-radius:99px;background:var(--primary)}' +
    '.sk-hbars{display:flex;flex-direction:column;gap:9px}.sk-hb{display:grid;grid-template-columns:minmax(90px,170px) 1fr 92px;align-items:center;gap:10px;font-size:13px}.sk-hb .tr{height:12px;background:var(--surface-3);border-radius:0 4px 4px 0}' +
    '.sk-hb .tr i{display:block;height:100%;background:var(--primary);border-radius:0 4px 4px 0}.sk-hb .v{text-align:right;color:var(--text);font-weight:600}' +
    '.sk-line{width:100%;height:auto;display:block}.sk-line .gr{stroke:var(--border);stroke-width:1}.sk-line .ax{fill:var(--text-3);font-size:11px}.sk-line .lb{fill:var(--text-2);font-size:11.5px;font-weight:600}.sk-line .xh{stroke:var(--text-3);stroke-width:1;stroke-dasharray:3 3}' +
    '.sk-chartwrap{position:relative}.sk-tip{position:absolute;min-width:220px;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow);padding:10px 12px;font-size:12.5px;pointer-events:none;z-index:5}' +
    '.sk-tip .h{font-weight:700;margin-bottom:6px}.sk-tip .r{display:flex;align-items:center;gap:8px;padding:2px 0}.sk-tip .r span{flex:1;color:var(--text-2)}.sk-tip i,.sk-legend i{width:10px;height:10px;border-radius:2px;display:inline-block}' +
    '.sk-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:var(--text-2);margin-bottom:8px}.sk-legend span{display:inline-flex;align-items:center;gap:6px}' +
    '.sk-grade{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:8px;font-weight:800}.sk-grade.A{background:var(--success-bg);color:var(--success)}.sk-grade.B{background:var(--info-bg);color:var(--info)}.sk-grade.C{background:var(--warning-bg);color:var(--warning)}.sk-grade.D{background:var(--danger-bg);color:var(--danger)}';
  const S = { ym: '', window: 3 };

  function delta(cur, prev, o) {
    o = o || {};
    if (!prev && !cur) return '<span class="fl">No change</span>';
    if (o.points) { const d = Math.round((cur - prev) * 10) / 10; const good = o.lowerIsBetter ? d < 0 : d > 0; return d === 0 ? '<span class="fl">No change</span>' : '<b class="' + (good ? 'up' : 'dn') + '">' + (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + ' pts</b>'; }
    if (!prev) return '<b class="up">New this month</b>';
    const d = (cur - prev) / prev * 100; const good = o.lowerIsBetter ? d < 0 : d > 0;
    return '<b class="' + (o.neutral ? 'fl' : good ? 'up' : 'dn') + '">' + (d >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(d)) + '%</b>';
  }

  function render(el) {
    if (!document.getElementById('skCss')) document.head.insertAdjacentHTML('beforeend', '<style id="skCss">' + CSS + '</style>');
    const q = Proc.router.parse().query || {};
    if (q.m && /^\d{4}-\d{2}$/.test(q.m)) S.ym = q.m;
    if (!S.ym) S.ym = util.today().slice(0, 7);
    const cur = monthFigures(S.ym), prev = monthFigures(addMonth(S.ym, -1));
    const go = ym => { S.ym = ym; history.replaceState(null, '', '#/supplier-kpis?m=' + ym); render(el); };
    el.innerHTML = ui.pageHead({ title: 'Supplier KPIs', sub: 'Supplier quality month to date against the previous month — from purchase orders, goods received notes, returns and invoices.',
      actions: '<button class="btn primary" id="skPdf">' + ui.icon('file', 'sm') + 'PDF</button>' }) +
      '<div class="toolbar" style="padding:0;margin-bottom:14px;gap:10px"><button class="btn icon" id="skPrev" title="Previous month">' + ui.icon('arrow-left', 'sm') + '</button><span class="strong" style="min-width:150px;text-align:center">' + esc(monthName(S.ym)) + '</span><button class="btn icon" id="skNext" title="Next month">' + ui.icon('chevron-right', 'sm') + '</button><span class="muted small">compared with ' + esc(monthName(addMonth(S.ym, -1))) + '</span></div>' +
      '<div class="sk-tiles">' +
      '<div class="sk-tile"><div class="l">Suppliers used</div><div class="v">' + util.int(cur.suppliers) + '</div><div class="d">' + delta(cur.suppliers, prev.suppliers, { neutral: true }) + ' <span>vs ' + util.int(prev.suppliers) + '</span></div></div>' +
      '<div class="sk-tile"><div class="l">Value ordered</div><div class="v">' + util.moneyShort(cur.ordered) + '</div><div class="d">' + delta(cur.ordered, prev.ordered, { neutral: true }) + ' <span>' + util.int(cur.poCount) + ' POs</span></div></div>' +
      '<div class="sk-tile"><div class="l">Value rejected</div><div class="v">' + fmtPct(cur.rejectRate) + '</div><div class="d">' + delta(cur.rejectRate, prev.rejectRate, { points: true, lowerIsBetter: true }) + ' <span>' + util.moneyShort(cur.rejectedVal) + ' of goods</span></div></div>' +
      '<div class="sk-tile"><div class="l">Delivered on time &amp; in budget</div><div class="v">' + (cur.deliveries ? fmtPct(cur.inTimeBudget) : '—') + '</div><div class="sk-meter"><i style="width:' + Math.min(100, cur.inTimeBudget) + '%"></i></div><div class="d">' + (cur.deliveries ? delta(cur.inTimeBudget, prev.inTimeBudget, { points: true }) + ' <span>' + util.int(cur.deliveries) + ' deliveries</span>' : '<span>No deliveries this month</span>') + '</div></div>' +
      '<div class="sk-tile"><div class="l">Return to vendor cost</div><div class="v">' + util.moneyShort(cur.returnCost) + '</div><div class="d">' + delta(cur.returnCost, prev.returnCost, { lowerIsBetter: true }) + '</div></div></div>' +
      '<div class="grid c2 mt-3"><div class="card"><div class="card-h"><div><h3>Return to vendor cost</h3><div class="sub">By supplier · ' + esc(monthName(S.ym)) + '</div></div></div><div class="card-b" id="skRet"></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Vendor rejection rate</h3><div class="sub">Share of delivered value rejected · ' + esc(monthName(S.ym)) + '</div></div></div><div class="card-b" id="skRej"></div></div></div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>Spend under management</h3><div class="sub">Purchase orders by budget line, last 12 months to ' + esc(monthName(S.ym)) + '</div></div></div><div class="card-b" id="skLine"></div></div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>Supplier scorecard</h3><div class="sub">Score out of 100: on time 40 · quality 30 · tax compliance 15 · invoiced within the PO 15. Grade A 85+, B 70+, C 50+, D below; suppliers with no deliveries yet are not scored.</div></div>' +
      '<div class="seg">' + [[1, 'This month'], [3, '3 months'], [6, '6 months'], [12, '12 months']].map(w => '<button data-w="' + w[0] + '" class="' + (S.window === w[0] ? 'on' : '') + '">' + w[1] + '</button>').join('') + '</div></div><div class="card-b flush" id="skCard"></div></div>';
    el.querySelector('#skPrev').onclick = () => go(addMonth(S.ym, -1));
    el.querySelector('#skNext').onclick = () => go(addMonth(S.ym, 1));
    el.querySelector('#skPdf').onclick = () => { try { Proc.reportPdf.generate('supplier-kpis', { from: S.ym + '-01', to: S.ym + '-28', periodLabel: monthName(S.ym) }, 'open'); Proc.audit('PDF Report', 'Supplier KPIs ' + monthName(S.ym)); } catch (e) { ui.toast(e.message, 'error'); } };
    el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { S.window = +b.dataset.w; render(el); });
    el.querySelector('#skRet').innerHTML = hbarChart(cur.sups.filter(s => s.returnCost > 0).sort((a, b) => b.returnCost - a.returnCost).slice(0, 8).map(s => ({ label: s.name, value: s.returnCost })), { fmt: v => util.moneyShort(v), empty: 'No goods returned to suppliers this month.' });
    el.querySelector('#skRej').innerHTML = hbarChart(cur.sups.filter(s => s.deliveries).map(s => ({ label: s.name, value: pct(s.rejectedVal, s.receivedVal + s.rejectedVal), sub: util.money(s.rejectedVal) + ' rejected' })).sort((a, b) => b.value - a.value).slice(0, 8), { fmt: fmtPct, min: 10, empty: 'No deliveries recorded this month.' });
    lineChart(el.querySelector('#skLine'), spendUnderManagement(S.ym));
    const rows = scorecard(S.ym, S.window);
    ui.table(el.querySelector('#skCard'), {
      rows, pageSize: 15, compact: true, placeholder: 'Search supplier…', search: s => s.name, initialSort: { key: 'ordered', dir: -1 },
      onRow: s => store.get('suppliers', s.key) && Proc.router.go('suppliers/' + s.key),
      empty: ui.empty('award', 'No supplier activity', 'Purchase orders and deliveries in this window appear here.'),
      columns: [
        { key: 'name', label: 'Supplier', render: s => '<span class="t-title">' + esc(s.name) + '</span>' },
        { key: 'pos', label: 'POs', cls: 'num', render: s => util.int(s.pos) },
        { key: 'ordered', label: 'Value ordered', cls: 'num', render: s => util.money(s.ordered, { noCents: true }) },
        { key: 'deliveries', label: 'Deliveries', cls: 'num', render: s => util.int(s.deliveries) },
        { key: 'ot', label: 'On time', cls: 'num', sort: s => (s.deliveries ? s.onTime / s.deliveries : -1), render: s => (s.deliveries ? fmtPct(pct(s.onTime, s.deliveries)) : '<span class="muted">—</span>') },
        { key: 'rj', label: 'Rejected', cls: 'num', sort: s => pct(s.rejectedVal, s.receivedVal + s.rejectedVal), render: s => (s.deliveries ? fmtPct(pct(s.rejectedVal, s.receivedVal + s.rejectedVal)) : '<span class="muted">—</span>') },
        { key: 'returnCost', label: 'Returns', cls: 'num', render: s => (s.returnCost ? util.money(s.returnCost, { noCents: true }) : '<span class="muted">—</span>') },
        { key: 'tcc', label: 'TCC', sort: s => (s.sc.tcc ? s.sc.tcc.label : 'zz'), render: s => (s.sc.tcc ? ui.badge(s.sc.tcc.label, s.sc.tcc.tone) : '<span class="muted small">Not on file</span>') },
        { key: 'score', label: 'Score', cls: 'num', sort: s => (s.sc.v === null ? -1 : s.sc.v), render: s => (s.sc.v === null ? '<span class="muted">—</span>' : '<b>' + s.sc.v + '</b>') },
        { key: 'grade', label: 'Grade', sort: s => s.sc.grade, render: s => '<span class="sk-grade ' + s.sc.grade + '">' + s.sc.grade + '</span>' }
      ]
    });
  }

  /* PDF report (also on Reports & PRS → PDF Reports) */
  if (Proc.reportPdf) Proc.reportPdf.register([{
    id: 'supplier-kpis', group: 'Suppliers & payments', title: 'Supplier Quality KPIs', icon: 'award', period: true,
    desc: 'Suppliers used, value ordered, value rejected, on time & in budget and return-to-vendor cost for the month against the previous month, with the supplier scorecard.',
    build(p) {
      const ym = ymOf(p.from), cur = monthFigures(ym), prev = monthFigures(addMonth(ym, -1)), rows = scorecard(ym, 3);
      const ch = (a, b) => (b ? (a >= b ? '+' : '-') + Math.abs(Math.round((a - b) / b * 100)) + '% vs ' + mon3(addMonth(ym, -1)) : 'previous month: none');
      return {
        subtitle: monthName(ym) + ' compared with ' + monthName(addMonth(ym, -1)),
        kpis: [{ label: 'Suppliers used', value: util.int(cur.suppliers), note: ch(cur.suppliers, prev.suppliers) }, { label: 'Value ordered', value: util.moneyShort(cur.ordered), note: ch(cur.ordered, prev.ordered) },
          { label: 'Value rejected', value: fmtPct(cur.rejectRate), note: 'Previous month ' + fmtPct(prev.rejectRate) }, { label: 'On time & in budget', value: cur.deliveries ? fmtPct(cur.inTimeBudget) : '-', note: cur.deliveries + ' deliveries' },
          { label: 'Return to vendor cost', value: util.moneyShort(cur.returnCost), note: 'Previous month ' + util.moneyShort(prev.returnCost) }],
        chart: { title: 'Value ordered by supplier - ' + monthName(ym), rows: cur.sups.map(s => ({ label: s.name, value: s.ordered })).sort((a, b) => b.value - a.value), money: true },
        sections: [{ title: 'Supplier scorecard (3 months to ' + monthName(ym) + ')', columns: [{ label: 'Supplier' }, { label: 'POs', type: 'num' }, { label: 'Value ordered', type: 'money' }, { label: 'Deliveries', type: 'num' }, { label: 'On time', type: 'pct' }, { label: 'Rejected', type: 'pct' }, { label: 'Returns', type: 'money' }, { label: 'Score', type: 'num' }, { label: 'Grade' }],
          rows: rows.map(s => [s.name, s.pos, s.ordered, s.deliveries, s.deliveries ? util.round2(pct(s.onTime, s.deliveries)) : '', s.deliveries ? util.round2(pct(s.rejectedVal, s.receivedVal + s.rejectedVal)) : '', s.returnCost, s.sc.v === null ? '' : s.sc.v, s.sc.grade]), empty: 'No supplier activity in these months.' }],
        notes: ['Score out of 100: on time 40, quality (rejections) 30, tax compliance certificate 15, invoiced within the PO value 15. Grade A 85+, B 70+, C 50+, D below 50.', 'On time = delivered on or before the PO expected date (PO date + lead time when none is set).']
      };
    }
  }]);

  Proc.supplierKpis = { monthFigures, scorecard, spendUnderManagement };
  Proc.page({ id: 'supplier-kpis', title: 'Supplier KPIs', icon: 'award', section: 'Insights', order: 8, render });
})();
