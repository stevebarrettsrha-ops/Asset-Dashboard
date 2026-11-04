/* ==========================================================================
   Dashboard (#/dashboard)
   Greeting, fiscal-year KPIs, "needs your attention", spend by month,
   top suppliers, workflow pipeline, recent activity and quick actions.
   Fresh installs get a guided empty state pointing to Import Data.
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain } = Proc;
  const esc = util.esc;

  if (!document.getElementById('css-dashboard')) document.head.insertAdjacentHTML('beforeend', '<style id="css-dashboard">' +
    '.db-grid>.card+.card{margin-top:0}' +
    '.db-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px}@media (max-width:1320px){.db-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (max-width:640px){.db-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.db-kpis .kpi .val{font-size:20px}}' +
    '.db-hello h1{font-size:24px}.db-hello .sub{font-size:14px}' +
    '.db-att{list-style:none}.db-att li{display:flex;gap:12px;align-items:flex-start;padding:11px 18px;border-bottom:1px solid var(--border);cursor:pointer}' +
    '.db-att li:last-child{border-bottom:0}.db-att li:hover{background:var(--surface-2)}' +
    '.db-att .ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;flex:none;background:var(--info-bg);color:var(--info)}' +
    '.db-att .ic.warning{background:var(--warning-bg);color:var(--warning)}.db-att .ic.danger{background:var(--danger-bg);color:var(--danger)}.db-att .ic.purple{background:var(--purple-bg);color:var(--purple)}' +
    '.db-att .t{font-weight:600;font-size:13.5px}.db-att .s{font-size:12.5px;color:var(--text-3)}.db-att .go{margin-left:auto;color:var(--text-3);align-self:center}' +
    '.db-pipe{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:0;align-items:stretch}' +
    '.db-pipe .st{text-align:center;padding:14px 6px;position:relative;border-right:1px solid var(--border);cursor:pointer;border-radius:8px}' +
    '.db-pipe .st:hover{background:var(--surface-2)}.db-pipe .st:last-child{border-right:0}' +
    '.db-pipe .n{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}.db-pipe .l{font-size:12px;color:var(--text-3);margin-top:2px}' +
    '.db-pipe .v{font-size:11.5px;color:var(--text-2);margin-top:4px}' +
    '@media (max-width:760px){.db-pipe{grid-template-columns:repeat(3,minmax(0,1fr))}.db-pipe .st:nth-child(3){border-right:0}}' +
    '.db-act{list-style:none}.db-act li{display:flex;gap:10px;padding:10px 18px;border-bottom:1px solid var(--border);font-size:13px}.db-act li:last-child{border-bottom:0}' +
    '.db-act li>div{min-width:0;flex:1}.db-act .ln{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.db-act .a{font-weight:600}.db-act .w{margin-left:auto;color:var(--text-3);font-size:12px;white-space:nowrap}' +
    '.db-quick{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}' +
    '.db-quick a{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);font-weight:600;font-size:13.5px;text-decoration:none}' +
    '.db-quick a:hover{border-color:var(--primary-100);background:var(--primary-50);color:var(--primary)}' +
    '.db-quick a svg{color:var(--primary)}' +
    '.db-hero{display:grid;grid-template-columns:1.2fr 1fr;gap:24px;align-items:center;padding:28px}' +
    '.db-hero h2{font-size:22px;letter-spacing:-.01em}.db-hero p{color:var(--text-2);margin-top:8px}' +
    '.db-steps{display:grid;gap:12px}.db-steps .s{display:flex;gap:12px;padding:14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-2)}' +
    '.db-steps .n{width:28px;height:28px;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px;flex:none}' +
    '[data-theme=dark] .db-steps .n{color:#06121e}' +
    '@media (max-width:900px){.db-hero{grid-template-columns:1fr;padding:20px}}' +
    '</style>');

  const ACTIVE = p => p.status !== 'Cancelled' && p.status !== 'Draft';
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function firstName(name) { return String(name || '').replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, '').split(/\s+/)[0] || name; }

  function attention() {
    const out = [];
    const L = store.settings().limits;
    // Memos waiting on a decision
    store.list('memos').filter(m => m.status === 'Submitted').forEach(m => {
      const d = m.submittedAt ? util.daysBetween(String(m.submittedAt).slice(0, 10), util.today()) : 0;
      if (d > 7) out.push({ tone: 'warning', icon: 'stamp', t: 'Memo ' + (m.ref || m.subject) + ' awaiting decision', s: d + ' days since submission · ' + util.money(util.sum(m.awards || [], a => a.amount)), href: '#/memos/' + m.id, w: 80 + d });
    });
    const drafts = store.list('memos').filter(m => m.status === 'Draft');
    if (drafts.length) out.push({ tone: 'info', icon: 'stamp', t: drafts.length + ' approval ' + util.plural(drafts.length, 'memo') + ' still in draft', s: 'Review and submit for approval', href: drafts.length === 1 ? '#/memos/' + drafts[0].id : '#/memos', w: 40 });
    // Requisitions waiting for action
    const reqs = store.list('requisitions');
    const sub = reqs.filter(r => r.status === 'Submitted'), appr = reqs.filter(r => r.status === 'Approved');
    if (sub.length) out.push({ tone: 'purple', icon: 'clipboard', t: sub.length + ' ' + util.plural(sub.length, 'requisition') + ' awaiting approval', s: sub.slice(0, 3).map(r => r.number || r.id).join(', '), href: '#/requisitions', w: 60 });
    if (appr.length) out.push({ tone: 'purple', icon: 'scale', t: appr.length + ' approved ' + util.plural(appr.length, 'requisition') + ' ready for price comparison', s: appr.slice(0, 3).map(r => r.title || r.number).join(', '), href: '#/requisitions', w: 55 });
    // Comparisons with lines not yet awarded, or evaluated but no memo (only live work, not imported history)
    store.list('comparisons').filter(c => !c.importId && (c.status === 'Open' || c.status === 'Evaluated')).forEach(c => {
      const r = domain.computeComparison(c);
      if (r.unawarded && (c.items || []).length) out.push({ tone: 'warning', icon: 'scale', t: (c.ref || c.subject) + ': ' + r.unawarded + ' ' + util.plural(r.unawarded, 'line') + ' not awarded', s: 'Enter missing quotes or choose a supplier', href: '#/sourcing/' + c.id, w: 50 });
      else if (c.status === 'Evaluated' && !c.memoId && r.awardTotal >= L.committeeMin) out.push({ tone: 'info', icon: 'stamp', t: (c.ref || c.subject) + ' evaluated — prepare the approval memo', s: util.money(r.awardTotal) + ' · ' + domain.approvalRoute(r.awardTotal, r.awards.map(a => ({ amount: a.total }))).level, href: '#/sourcing/' + c.id, w: 45 });
    });
    // Approved memos without purchase orders
    store.list('memos').filter(m => m.status === 'Approved' && m.comparisonId).forEach(m => {
      const c = store.get('comparisons', m.comparisonId);
      if (c && !(c.poIds || []).length) out.push({ tone: 'info', icon: 'cart', t: 'Raise purchase orders for ' + (m.ref || m.subject), s: 'Memo approved ' + util.date(m.decision && m.decision.date), href: '#/memos/' + m.id, w: 70 });
    });
    // Draft POs waiting for a PO number
    const draftPOs = store.list('purchaseOrders').filter(p => p.status === 'Draft');
    // Goods that reached the hospital this week (GRNs from Stores or Procurement)
    const weekAgo = util.addDays(util.today(), -7);
    const recent = store.list('deliveries').filter(d => !d.voided && d.date && d.date >= weekAgo);
    if (recent.length) out.push({ tone: 'info', icon: 'truck', t: recent.length + ' ' + util.plural(recent.length, 'delivery', 'deliveries') + ' received this week', s: Array.from(new Set(recent.map(d => (store.get('purchaseOrders', d.poId) || {}).poNumber).filter(Boolean))).slice(0, 4).map(n => 'PO ' + n).join(', '), href: '#/orders', w: 35 });
    if (draftPOs.length) out.push({ tone: 'info', icon: 'cart', t: draftPOs.length + ' draft purchase ' + util.plural(draftPOs.length, 'order') + ' to issue', s: 'Enter the official PO number to issue', href: '#/orders', w: 58 });
    // POs issued > 30 days ago without a delivery
    const cutoff = util.addDays(util.today(), -30);
    const stale = store.list('purchaseOrders').filter(p => (p.status === 'Issued' || p.status === 'Partially Delivered') && p.source !== 'import:prs' && p.date && p.date < cutoff && util.fiscalYear(p.date) === util.fiscalYear(util.today()));
    if (stale.length) out.push({ tone: 'warning', icon: 'truck', t: util.int(stale.length) + ' purchase ' + util.plural(stale.length, 'order') + ' issued over 30 days ago with no delivery recorded', s: util.money(util.sum(stale, p => p.total), { noCents: true }) + ' · record deliveries in Receiving to keep statuses accurate', href: '#/receiving', w: 30 });
    // Overdue invoices
    const aging = Proc.agingRows ? Proc.agingRows() : [];
    const overdue = aging.filter(r => r.late > 0);
    if (overdue.length) out.push({ tone: 'danger', icon: 'receipt', t: overdue.length + ' overdue ' + util.plural(overdue.length, 'invoice'), s: util.money(util.sum(overdue, r => r.total)) + ' · oldest ' + Math.max.apply(null, overdue.map(r => r.late)) + ' days', href: '#/reports?tab=aging', w: 90 });
    // Supplier compliance (suppliers used this FY)
    const comp = Proc.complianceRows ? Proc.complianceRows(false) : [];
    const expired = comp.filter(r => (r.tcc && r.tcc.tone === 'danger') || (r.ppc && r.ppc.tone === 'danger'));
    const expiring = comp.filter(r => (r.tcc && r.tcc.tone === 'warning') || (r.ppc && r.ppc.tone === 'warning'));
    if (expired.length) out.push({ tone: 'danger', icon: 'shield', t: expired.length + ' ' + util.plural(expired.length, 'supplier') + ' with an expired TCC or PPC registration', s: expired.slice(0, 3).map(r => r.s.name).join(', '), href: '#/reports?tab=compliance', w: 85 });
    if (expiring.length) out.push({ tone: 'warning', icon: 'shield', t: expiring.length + ' ' + util.plural(expiring.length, 'supplier') + ' with documents expiring within 30 days', s: expiring.slice(0, 3).map(r => r.s.name).join(', '), href: '#/reports?tab=compliance', w: 65 });
    // Last month's PRS return completeness
    if (Proc.reports) {
      const d = util.parseDate(util.today()); d.setDate(1); d.setMonth(d.getMonth() - 1);
      const mk = util.toISODate(d).slice(0, 7);
      const big = Proc.reports.prsData(mk).big;
      const miss = big.filter(p => Proc.reports.missingFields(p).length);
      if (miss.length) out.push({ tone: 'warning', icon: 'sheet', t: 'PRS return for ' + util.monthLabel(mk) + ': ' + miss.length + ' of ' + big.length + ' rows incomplete', s: 'Add method, category, type or tenders before submitting', href: '#/reports?tab=prs', w: 75 });
      else if (big.length) out.push({ tone: 'info', icon: 'sheet', t: 'PRS return for ' + util.monthLabel(mk) + ' is ready', s: big.length + ' database rows · export in the Ministry format', href: '#/reports?tab=prs', w: 20 });
    }
    return out.sort((a, b) => b.w - a.w);
  }

  function render(el) {
    const off = domain.officer();
    const today = util.today();
    const fy = util.fiscalYear(today), r = util.fyRange(fy);
    const pos = store.list('purchaseOrders').filter(ACTIVE);
    const fyPos = pos.filter(p => p.date >= r.start && p.date <= r.end);
    const now = new Date();
    const hello = ui.pageHead({
      title: greeting() + ', ' + firstName(off.name),
      sub: 'FY ' + esc(fy) + ' · ' + now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + esc(store.settings().org.hospital),
      actions: (Proc.pages.requisitions ? '<a class="btn" href="#/requisitions/new">' + ui.icon('clipboard', 'sm') + 'New requisition</a>' : '') +
        (Proc.pages.sourcing ? '<a class="btn primary" href="#/sourcing/new">' + ui.icon('scale', 'sm') + 'New price comparison</a>' : '')
    }).replace('class="page-head"', 'class="page-head db-hello"');

    const isEmpty = !store.list('purchaseOrders').length && !store.list('requisitions').length && !store.list('comparisons').length && !store.list('memos').length;
    if (isEmpty) {
      el.innerHTML = hello + '<div class="card"><div class="db-hero"><div><span class="badge primary plain">Getting started</span><h2 class="mt-2">Load your records and the system does the rest</h2>' +
        '<p>Bring in the PO Log and PRS returns you already keep in Excel. Every supplier gets a profile with their purchase history, and your dashboard, PRS return and reports fill in automatically.</p>' +
        '<div class="row mt-3"><a class="btn primary" href="#/import">' + ui.icon('upload', 'sm') + 'Import PO Log & PRS returns</a>' + (Proc.pages.requisitions ? '<a class="btn" href="#/requisitions/new">' + ui.icon('clipboard', 'sm') + 'Start a requisition</a>' : '') + '</div></div>' +
        '<div class="db-steps"><div class="s"><div class="n">1</div><div><div class="strong">Import your Excel records</div><div class="small muted">PO Log, PRS returns, ground provisions sheets, procurement plan — checked and previewed before saving.</div></div></div>' +
        '<div class="s"><div class="n">2</div><div><div class="strong">Complete supplier files</div><div class="small muted">TRN, TCC expiry, PPC registration, contacts and bank details — plus quotes, POs and invoices.</div></div></div>' +
        '<div class="s"><div class="n">3</div><div><div class="strong">Run the workflow</div><div class="small muted">Requisition → price comparison → approval memo PDF → purchase order → delivery → payment.</div></div></div></div></div></div>' +
        '<div class="card mt-3"><div class="card-h"><h3>Your profile</h3></div><div class="card-b"><div class="row between"><div><div class="strong">' + esc(off.name) + '</div><div class="muted small">' + esc(off.title) + ' · signs approval memos and purchase orders</div></div><button class="btn" id="dbProf">' + ui.icon('user', 'sm') + 'Edit profile</button></div></div></div>';
      const b = el.querySelector('#dbProf'); if (b) b.onclick = () => Proc.shell.profileDialog();
      return;
    }

    // KPI figures
    const fySpend = util.sum(fyPos, p => p.total);
    const fySpendCmp = util.sum(fyPos.filter(p => p.source !== 'import:prs' && p.date <= today), p => p.total);
    const lastR = util.fyRange(String(parseInt(fy, 10) - 1));
    const sameDayLast = util.toISODate(new Date(util.parseDate(today).setFullYear(util.parseDate(today).getFullYear() - 1)));
    // PRS-only records cover just the large contracts, so they would distort a year-on-year comparison.
    const lastSpend = util.sum(pos.filter(p => p.source !== 'import:prs' && p.date >= lastR.start && p.date <= sameDayLast), p => p.total);
    const yoy = lastSpend ? Math.round((fySpendCmp - lastSpend) / lastSpend * 100) : null;
    const mk = today.slice(0, 7);
    const monthPos = pos.filter(p => util.monthKey(p.date) === mk);
    const cmpOpen = store.list('comparisons').filter(c => c.status === 'Open' || (c.status === 'Evaluated' && !c.importId));
    const memosWaiting = store.list('memos').filter(m => m.status === 'Submitted');
    const memoDraft = store.list('memos').filter(m => m.status === 'Draft');
    const aging = Proc.agingRows ? Proc.agingRows() : [];
    const comp = Proc.complianceRows ? Proc.complianceRows(false) : [];
    const compDated = comp.filter(x => (x.tcc && x.tcc.tone !== 'success') || (x.ppc && x.ppc.tone !== 'success') || /Debarred|Suspended/.test(x.s.status || ''));
    const compNoTcc = comp.filter(x => !x.s.tccExpiry && x.spend > 0).length;
    const kpis = '<div class="db-kpis">' +
      ui.kpi({ label: 'FY ' + fy + ' committed', icon: 'wallet', value: util.moneyShort(fySpend), title: util.money(fySpend), href: '#/reports?tab=spend',
        meta: util.int(fyPos.length) + ' POs' + (yoy !== null ? ' · <span class="' + (yoy > 0 ? 'text-warning' : 'text-success') + '">' + (yoy > 0 ? '+' : '') + yoy + '%</span> vs last FY to date' : '') }) +
      ui.kpi({ label: 'POs this month', icon: 'cart', value: util.int(monthPos.length), meta: util.money(util.sum(monthPos, p => p.total), { noCents: true }) + ' · ' + util.monthLabel(mk), href: '#/orders' }) +
      ui.kpi({ label: 'Open price comparisons', icon: 'scale', value: util.int(cmpOpen.length), meta: store.list('comparisons').length + ' on file', href: '#/sourcing', tone: 'pur' }) +
      ui.kpi({ label: 'Memos awaiting decision', icon: 'stamp', value: util.int(memosWaiting.length), meta: memoDraft.length + ' in draft', href: '#/memos', tone: memosWaiting.length ? 'warn' : 'ok' }) +
      ui.kpi({ label: 'Outstanding invoices', icon: 'receipt', value: util.moneyShort(util.sum(aging, x => x.total)), title: util.money(util.sum(aging, x => x.total)), meta: aging.length + ' unpaid · ' + aging.filter(x => x.late > 0).length + ' overdue', href: '#/invoices', tone: aging.some(x => x.late > 0) ? 'bad' : '' }) +
      ui.kpi({ label: 'Expired / expiring TCC & PPC', icon: 'shield', value: util.int(compDated.length), meta: compNoTcc ? util.int(compNoTcc) + ' suppliers used this FY have no TCC on file' : 'All suppliers used this FY have a TCC on file', href: '#/reports?tab=compliance', tone: compDated.some(x => x.severity === 2) ? 'bad' : compDated.length || compNoTcc ? 'warn' : 'ok' }) + '</div>';

    // Spend by month (April → March)
    const months = [];
    for (let i = 0; i < 12; i++) { const d = new Date(parseInt(fy, 10), 3 + i, 1); months.push(util.toISODate(d).slice(0, 7)); }
    const byMonth = util.groupBy(fyPos, p => util.monthKey(p.date));
    const bars = ui.bars(months.map(m => ({ label: util.MONTHS[+m.slice(5) - 1].slice(0, 3), value: util.sum(byMonth[m] || [], p => p.total), title: util.monthLabel(m) + ': ' + util.money(util.sum(byMonth[m] || [], p => p.total)) + ' · ' + (byMonth[m] || []).length + ' POs' })), { height: 210 });

    // Top suppliers (FY)
    const bySup = {};
    fyPos.forEach(p => { bySup[p.supplierId] = (bySup[p.supplierId] || 0) + (p.total || 0); });
    const top = Object.keys(bySup).map(k => ({ label: domain.supplierName(k, 'Unknown'), value: bySup[k], href: '#/suppliers/' + k })).sort((a, b) => b.value - a.value).slice(0, 8);

    // Pipeline (FY)
    const inFY = iso => !!iso && iso >= r.start && iso <= r.end;
    const reqN = store.list('requisitions').filter(x => inFY(x.date)).length;
    const cmpN = store.list('comparisons').filter(x => inFY(x.date)).length;
    const memoN = store.list('memos').filter(x => inFY(x.date));
    const delivered = fyPos.filter(p => ['Delivered', 'Invoiced', 'Paid', 'Closed'].indexOf(p.status) >= 0);
    const paid = fyPos.filter(p => p.status === 'Paid' || p.status === 'Closed');
    const pipe = [
      { n: reqN, l: 'Requisitions', href: '#/requisitions' }, { n: cmpN, l: 'Price comparisons', href: '#/sourcing' },
      { n: memoN.length, l: 'Approval memos', v: memoN.filter(m => m.status === 'Approved').length + ' approved', href: '#/memos' },
      { n: fyPos.length, l: 'Purchase orders', v: util.moneyShort(fySpend), href: '#/orders' },
      { n: delivered.length, l: 'Delivered', v: util.moneyShort(util.sum(delivered, p => p.total)), href: '#/receiving' },
      { n: paid.length, l: 'Paid', v: util.moneyShort(util.sum(paid, p => p.total)), href: '#/invoices' }];

    const att = attention();
    const acts = (store.db.auditLog || []).filter(a => a.action !== 'Login' && a.action !== 'Logout').slice(0, 7);

    el.innerHTML = hello + kpis +
      '<div class="grid side mt-3 db-grid"><div class="card"><div class="card-h"><div><h3>Committed spend by month</h3><div class="sub">FY ' + esc(fy) + ' · purchase orders by P.O. date</div></div><a class="small" href="#/reports?tab=spend">Spend analysis</a></div><div class="card-b">' +
      (fyPos.length ? bars : ui.empty('chart', 'No purchase orders in FY ' + fy + ' yet', '')) + '</div></div>' +
      '<div class="card"><div class="card-h"><h3>Needs your attention</h3>' + (att.length ? '<span class="badge ' + (att.some(a => a.tone === 'danger') ? 'danger' : 'warning') + '">' + att.length + '</span>' : '') + '</div>' +
      (att.length ? '<ul class="db-att">' + att.slice(0, 8).map(a => '<li data-href="' + esc(a.href) + '"><div class="ic ' + a.tone + '">' + ui.icon(a.icon, 'sm') + '</div><div style="min-width:0"><div class="t">' + esc(a.t) + '</div><div class="s">' + esc(a.s || '') + '</div></div><span class="go">' + ui.icon('chevron-right', 'sm') + '</span></li>').join('') + '</ul>'
        : ui.empty('check', 'All caught up', 'Nothing needs your attention right now.')) + '</div></div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>Procurement pipeline</h3><div class="sub">FY ' + esc(fy) + ' — from requisition to payment</div></div></div><div class="card-b"><div class="db-pipe">' +
      pipe.map(s => '<div class="st" data-href="' + s.href + '"><div class="n">' + util.int(s.n) + '</div><div class="l">' + esc(s.l) + '</div>' + (s.v ? '<div class="v">' + esc(s.v) + '</div>' : '') + '</div>').join('') + '</div></div></div>' +
      '<div class="grid c3 mt-3 db-grid"><div class="card"><div class="card-h"><h3>Top suppliers this FY</h3><a class="small" href="#/suppliers">All suppliers</a></div><div class="card-b">' + (top.length ? ui.hbars(top) : '<div class="muted">No purchase orders yet</div>') + '</div></div>' +
      '<div class="card"><div class="card-h"><h3>Recent activity</h3><a class="small" href="#/audit">Audit log</a></div>' +
      (acts.length ? '<ul class="db-act">' + acts.map(a => '<li><div><div class="ln" title="' + esc(a.details || '') + '"><span class="a">' + esc(a.action) + '</span> <span class="muted">' + esc(String(a.details || '')) + '</span></div><div class="small muted">' + esc(a.user || '') + '</div></div><span class="w">' + esc(util.ago(a.timestamp)) + '</span></li>').join('') + '</ul>'
        : ui.empty('history', 'No activity yet', '')) + '</div>' +
      '<div class="card"><div class="card-h"><h3>Quick actions</h3></div><div class="card-b"><div class="db-quick">' +
      [Proc.pages.requisitions && ['#/requisitions/new', 'clipboard', 'New requisition'], Proc.pages.sourcing && ['#/sourcing/new', 'scale', 'Compare prices'], Proc.pages.memos && ['#/memos', 'stamp', 'Approval memos'],
        Proc.pages.orders && ['#/orders', 'cart', 'Purchase orders'], Proc.pages.suppliers && ['#/suppliers', 'building', 'Supplier files'], Proc.pages.documents && ['#/documents', 'clip', 'Documents'],
        ['#/reports?tab=prs', 'sheet', 'PRS return'], ['#/import', 'upload', 'Import Excel']].filter(Boolean).map(q => '<a href="' + q[0] + '">' + ui.icon(q[1], 'sm') + esc(q[2]) + '</a>').join('') + '</div></div></div></div>';

    el.querySelectorAll('[data-href]').forEach(x => x.onclick = () => { location.hash = x.dataset.href; });
  }

  Proc.page({ id: 'dashboard', title: 'Dashboard', icon: 'dashboard', section: 'Overview', order: 10, render });
})();
