/* ==========================================================================
   Approval Memos — list (#/memos) and editor (#/memos/new, #/memos/<id>).
   One memo record produces the Committee memo plus a Head of Entity memo for
   every award above the Parish Manager's delegated limit (see Proc.pdf).
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, K, files, router } = Proc;
  const esc = util.esc;

  if (!document.getElementById('css-memos')) document.head.insertAdjacentHTML('beforeend', '<style id="css-memos">' +
    '.memo-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(380px,.92fr);gap:16px;align-items:start}' +
    '.memo-side{position:sticky;top:76px;display:grid;gap:16px}' +
    '@media(max-width:1180px){.memo-grid{grid-template-columns:1fr}.memo-side{position:static}}' +
    '.pv-box{background:var(--surface-3);padding:12px;max-height:78vh;overflow:auto;border-radius:0 0 var(--radius-lg) var(--radius-lg);min-height:220px}' +
    '.pv-box canvas{display:block;margin:0 auto 12px;background:#fff;box-shadow:0 2px 10px rgba(16,24,40,.18);border-radius:2px}' +
    '.pv-box .pv-pages canvas:last-child{margin-bottom:0}' +
    '.pv-box .loading{min-height:200px}' +
    '.edit-table td{padding:5px 6px!important;vertical-align:middle}.edit-table th{padding:7px 6px!important}' +
    '.edit-table .input{width:100%}.edit-table td.idx{width:30px;color:var(--text-3);text-align:center}' +
    '.edit-table td.ck{width:84px;text-align:center}.edit-table td.amt{width:170px}.edit-table td.rm{width:40px;text-align:right}' +
    '.edit-table tfoot td{padding:9px 8px!important}' +
    '.part{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)}.part:last-child{border-bottom:0}' +
    '.part .pi{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--danger-bg);color:var(--danger);font-size:10px;font-weight:800;flex:none}' +
    '.part .pt{font-weight:600;font-size:13.5px}.part .ps{font-size:12px;color:var(--text-3)}' +
    '.save-state{font-size:12.5px;color:var(--text-3);display:inline-flex;align-items:center;gap:6px;margin-right:4px}' +
    '.save-state .dot{width:7px;height:7px;border-radius:50%;background:var(--success)}.save-state.dirty .dot{background:var(--warning)}' +
    'fieldset.lockable{border:0;min-width:0}fieldset.lockable[disabled] .input,fieldset.lockable[disabled] input,fieldset.lockable[disabled] select,fieldset.lockable[disabled] textarea{background:var(--surface-2);color:var(--text-2)}' +
    'fieldset.lockable[disabled] .btn{display:none}' +
    '</style>');

  const memoTotal = m => util.round2(util.sum(m.awards || [], a => util.num(a.amount)));
  const limit = () => store.settings().limits.delegated;
  const hoeCount = m => (m.awards || []).filter(a => util.num(a.amount) > limit()).length;
  const memoNo = m => (m.number ? 'M-' + String(m.number).padStart(4, '0') : 'New');
  const pdfReady = () => Proc.pdf && Proc.pdf.memo;

  Proc.quickCreate.push({ label: 'Approval memo', icon: 'stamp', order: 30, onClick: () => router.go('memos/new') });

  Proc.page({
    id: 'memos', title: 'Approval Memos', icon: 'stamp', section: 'Workflow', order: 30,
    count: () => store.filter('memos', m => m.status === 'Submitted').length,
    render(el, params) {
      if (!params.length) return list(el);
      return editor(el, params[0] === 'new' ? null : params[0]);
    }
  });

  /* =============================================================== list */
  function list(el) {
    const all = store.list('memos').sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || 0) - (a.number || 0));
    let seg = 'All';
    try { seg = sessionStorage.getItem('memosSeg') || 'All'; } catch (e) { /* ignore */ }
    const fy = util.fiscalYear(util.today());
    const approvedFy = all.filter(m => m.status === 'Approved' && util.fiscalYear(m.date) === fy);
    const count = s => (s === 'All' ? all.length : all.filter(m => m.status === s).length);

    el.innerHTML = ui.pageHead({
      title: 'Approval Memos', sub: 'Committee and Head of Entity memos, produced as PDFs on the hospital letterhead with the officer’s name.',
      actions: '<button class="btn primary" data-new>' + ui.icon('plus', 'sm') + 'New memo</button>'
    }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Drafts', value: util.int(count('Draft')), icon: 'edit', meta: 'Being prepared' }) +
      ui.kpi({ label: 'Awaiting decision', value: util.int(count('Submitted')), icon: 'clock', tone: 'warn', meta: 'Submitted for approval' }) +
      ui.kpi({ label: 'Approved ' + fy, value: util.moneyShort(util.sum(approvedFy, memoTotal)), icon: 'check', tone: 'ok', meta: approvedFy.length + ' ' + util.plural(approvedFy.length, 'memo') }) +
      ui.kpi({ label: 'Head of Entity memos', value: util.int(util.sum(all.filter(m => m.status !== 'Rejected'), hoeCount)), icon: 'shield', tone: 'pur', meta: 'Awards above ' + util.moneyShort(limit()) }) +
      '</div><div class="card"><div class="card-h"><div class="seg" id="mSeg">' +
      ['All'].concat(K.MEMO_STATUSES).map(s => '<button data-s="' + s + '" class="' + (s === seg ? 'on' : '') + '">' + s + '<span class="n">' + count(s) + '</span></button>').join('') +
      '</div></div><div id="mTable"></div></div>';

    el.querySelector('[data-new]').onclick = () => router.go('memos/new');
    const rows = () => (seg === 'All' ? all : all.filter(m => m.status === seg));
    const t = ui.table(el.querySelector('#mTable'), {
      rows: rows(), placeholder: 'Search reference, subject or supplier…',
      search: m => [m.ref, m.subject, memoNo(m), (m.awards || []).map(a => a.supplier).join(' '), m.status].join(' '),
      onRow: m => router.go('memos/' + m.id),
      empty: ui.empty('stamp', all.length ? 'No memos in this view' : 'No approval memos yet', all.length ? 'Choose another status above.' : 'Create a memo from a price comparison, or start a blank one.', all.length ? '' : '<button class="btn primary" onclick="location.hash=\'#/memos/new\'">' + ui.icon('plus', 'sm') + 'New memo</button>'),
      columns: [
        { key: 'number', label: 'Memo', sort: m => m.number || 0, render: m => '<div class="t-title mono">' + esc(memoNo(m)) + '</div><div class="t-sub">' + esc(util.date(m.date)) + '</div>' },
        { key: 'ref', label: 'Reference & subject', render: m => '<div class="t-title">' + esc(m.ref || 'No reference') + '</div><div class="t-sub truncate" style="max-width:340px">' + esc(m.subject || '') + '</div>' },
        { key: 'awards', label: 'Recommended suppliers', sort: m => (m.awards || []).length, render: m => { const a = (m.awards || []).filter(x => x.supplier); return a.length ? '<div class="truncate" style="max-width:260px">' + esc(a[0].supplier) + '</div>' + (a.length > 1 ? '<div class="t-sub">+ ' + (a.length - 1) + ' more</div>' : '') : '<span class="muted">—</span>'; } },
        { key: 'total', label: 'Total', cls: 'num', sort: memoTotal, render: m => '<span class="strong">' + util.money(memoTotal(m)) + '</span>' },
        { key: 'route', label: 'Approval', sort: m => memoTotal(m), render: m => { const h = hoeCount(m); return '<span class="chip">' + esc(domain.approvalRoute(memoTotal(m), m.awards).level) + '</span>' + (h ? ' <span class="badge purple plain">' + h + ' HoE</span>' : ''); } },
        { key: 'status', label: 'Status', render: m => ui.badge(m.status || 'Draft') },
        { key: 'act', label: '', sort: false, cls: 'actions', render: m => '<button class="btn sm ghost icon" data-dl="' + m.id + '" title="Download PDF">' + ui.icon('download', 'sm') + '</button>' }
      ],
      bind: tbody => tbody.querySelectorAll('[data-dl]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const m = store.get('memos', b.dataset.dl);
        if (!pdfReady()) return ui.toast('PDF engine not loaded.', 'error');
        Proc.pdf.memo(m, { which: 'all', output: 'save' }).catch(err => ui.toast(err.message, 'error'));
      })
    });
    el.querySelectorAll('#mSeg button').forEach(b => b.onclick = () => {
      seg = b.dataset.s; try { sessionStorage.setItem('memosSeg', seg); } catch (e) { /* ignore */ }
      el.querySelectorAll('#mSeg button').forEach(x => x.classList.toggle('on', x === b));
      t.refresh(rows());
    });
  }

  /* ============================================================= editor */
  function blankMemo() {
    return {
      ref: '', date: util.today(), subject: '', method: 'Restricted Bidding (RB)', viaGojep: true, invited: '',
      bids: [{ supplier: '', price: '', compliant: true }], awards: [{ supplier: '', amount: '' }],
      evaluationNote: '', note: '', hoeNote: '', from: domain.officer(), status: 'Draft'
    };
  }

  function editor(el, id) {
    let rec = id ? store.get('memos', id) : null;
    if (id && !rec) {
      el.innerHTML = ui.pageHead({ title: 'Memo not found', back: { label: 'Approval Memos', href: '#/memos' } }) + ui.empty('stamp', 'This memo no longer exists', 'It may have been deleted on another computer.');
      return;
    }
    const q = router.parse().query;
    let m;
    if (rec) m = util.clone(rec);
    else {
      m = blankMemo();
      const cmp = q.cmp && store.get('comparisons', q.cmp);
      if (cmp) {
        m = Object.assign(m, domain.memoFromComparison(cmp), { from: domain.officer() });
        if (!m.bids.length) m.bids = [{ supplier: '', price: '', compliant: true }];
        if (!m.awards.length) m.awards = [{ supplier: '', amount: '' }];
      }
    }
    if (!m.from || !m.from.name) m.from = domain.officer();
    let dirty = false, saveTimer = null, pvTimer = null, previewKey = 'committee';
    const locked = () => m.status === 'Submitted' || m.status === 'Approved';

    function draw() {
      const cmp = m.comparisonId && store.get('comparisons', m.comparisonId);
      const pos = rec ? store.filter('purchaseOrders', p => p.memoId === rec.id) : [];
      el.innerHTML = ui.pageHead({
        back: cmp ? { label: 'Price comparison ' + (cmp.ref || cmp.subject || ''), href: '#/sourcing/' + cmp.id } : { label: 'Approval Memos', href: '#/memos' },
        title: rec ? (m.ref || m.subject || 'Untitled memo') : 'New approval memo',
        badge: (rec ? '<span class="chip mono">' + esc(memoNo(m)) + '</span>' : '') + ui.badge(m.status || 'Draft'),
        sub: rec ? 'Prepared by ' + esc((m.from && m.from.name) || '') + ' · last saved ' + esc(util.ago(rec.updatedAt)) : 'Fill in the details — the memo PDFs update as you type.',
        actions: '<span class="save-state" id="saveState"></span>' + actionButtons(pos)
      }) +
        (locked() ? '<div class="alert mb-3">' + ui.icon('lock') + '<div><div class="t">This memo is ' + esc(m.status.toLowerCase()) + ' and locked.</div>Return it to draft to make changes. The PDFs below reflect what was sent.</div></div>' : '') +
        (m.status === 'Rejected' && m.decision ? '<div class="alert danger mb-3">' + ui.icon('alert') + '<div><div class="t">Not approved' + (m.decision.by ? ' by ' + esc(m.decision.by) : '') + ' on ' + esc(util.date(m.decision.date)) + '</div>' + esc(m.decision.notes || '') + '</div></div>' : '') +
        '<div class="memo-grid"><fieldset class="lockable stack" id="memoForm"' + (locked() ? ' disabled' : '') + '>' + formHtml(cmp, pos) + '</fieldset><div class="memo-side" id="memoSide"></div></div>';
      bindHeader(pos);
      bindForm();
      drawSide();
      setSaveState();
      schedulePreview(10);
    }

    function actionButtons(pos) {
      let primary = '';
      if (!rec) primary = '<button class="btn primary" data-a="save">' + ui.icon('check', 'sm') + 'Save draft</button>';
      else if (m.status === 'Draft') primary = '<button class="btn primary" data-a="submit">' + ui.icon('send', 'sm') + 'Submit for approval</button>';
      else if (m.status === 'Submitted') primary = '<button class="btn primary" data-a="decision">' + ui.icon('stamp', 'sm') + 'Record decision</button>';
      else if (m.status === 'Approved') primary = pos.length ? '<a class="btn primary" href="#/orders?memo=' + rec.id + '">' + ui.icon('cart', 'sm') + 'View purchase orders (' + pos.length + ')</a>' : '<button class="btn primary" data-a="orders">' + ui.icon('cart', 'sm') + 'Create purchase orders</button>';
      else if (m.status === 'Rejected') primary = '<button class="btn primary" data-a="redraft">' + ui.icon('edit', 'sm') + 'Return to draft</button>';
      return '<button class="btn" data-a="download">' + ui.icon('download', 'sm') + 'Download PDF</button><button class="btn" data-a="print">' + ui.icon('printer', 'sm') + 'Print</button>' + primary +
        (rec ? '<button class="btn icon" data-a="more" title="More actions">' + ui.icon('more') + '</button>' : '');
    }

    function formHtml(cmp, pos) {
      return '<div class="card"><div class="card-h"><div><h3>Memo details</h3><div class="sub">Reference, subject and how quotations were obtained</div></div></div><div class="card-b"><div class="form-grid">' +
        '<div class="field s8"><label>Reference #<span class="req">*</span></label><input data-f="ref" value="' + esc(m.ref) + '" placeholder="e.g. RFQ-MEDSUNDRIES-MPH/092026"><div class="hint"><a href="javascript:void 0" data-a="suggest">Suggest a reference</a> in the hospital’s format</div></div>' +
        '<div class="field s4"><label>Memo date<span class="req">*</span></label><input type="date" data-f="date" value="' + esc(m.date) + '"></div>' +
        '<div class="field s12"><label>Procurement of (subject)<span class="req">*</span></label><input data-f="subject" value="' + esc(m.subject) + '" placeholder="e.g. Medical Sundries"><div class="hint">Reads as “Approval is being sought for the procurement of <b>' + esc(m.subject || '…') + '</b> …”</div></div>' +
        '<div class="field s6"><label>Procurement method</label><select data-f="method">' + ui.options(K.METHODS, m.method) + '</select></div>' +
        '<div class="field s3"><label>Suppliers invited</label><input type="number" min="0" data-f="invited" value="' + esc(m.invited) + '" placeholder="' + ((m.bids || []).filter(b => b.supplier).length || 0) + '"></div>' +
        '<div class="field s3"><label>&nbsp;</label><label class="check" style="height:38px"><input type="checkbox" data-f="viaGojep"' + (m.viaGojep !== false ? ' checked' : '') + '> Via GOJEP</label></div>' +
        '</div></div></div>' +
        '<div class="card"><div class="card-h"><div><h3>Bids received</h3><div class="sub" id="bidsSub"></div></div><div class="row"><button class="btn sm" data-a="lowest">' + ui.icon('award', 'sm') + 'Recommend lowest compliant</button></div></div><div class="card-b flush"><div id="bidsBox"></div></div></div>' +
        '<div class="card"><div class="card-h"><div><h3>Evaluation &amp; recommendation</h3><div class="sub">Recommended award per supplier — each award above ' + util.money(limit()) + ' also produces a Head of Entity memo</div></div></div><div class="card-b">' +
        '<div class="field"><label>Evaluation committee findings</label><textarea data-f="evaluationNote" rows="3" placeholder="' + esc(domain.autoEvaluationNote(normBids()) || 'The evaluation committee noted that …') + '">' + esc(m.evaluationNote || '') + '</textarea>' +
        '<div class="hint">Leave blank to use the standard wording shown. <a href="javascript:void 0" data-a="autonote">Insert standard wording</a> to edit it.</div></div></div>' +
        '<div id="awardsBox"></div></div>' +
        '<div class="card"><div class="card-h"><div><h3>Signatory &amp; extra wording</h3><div class="sub">The officer named here signs the committee memo and is shown as preparer on Head of Entity memos</div></div></div><div class="card-b"><div class="form-grid">' +
        '<div class="field s4"><label>Officer name</label><input data-from="name" value="' + esc(m.from.name || '') + '"></div>' +
        '<div class="field s4"><label>Title</label><input data-from="title" value="' + esc(m.from.title || '') + '"></div>' +
        '<div class="field s4"><label>Facility</label><input data-from="org" value="' + esc(m.from.org || '') + '"></div>' +
        '<div class="field s12"><label>Additional paragraph — committee memo (optional)</label><textarea data-f="note" rows="2" placeholder="e.g. Funds are available under the Medical Sundries allocation.">' + esc(m.note || '') + '</textarea></div>' +
        '<div class="field s12"><label>Additional paragraph — Head of Entity memo (optional)</label><textarea data-f="hoeNote" rows="2">' + esc(m.hoeNote || '') + '</textarea></div>' +
        '</div></div></div>' +
        (pos.length ? '<div class="card"><div class="card-h"><h3>Purchase orders from this memo</h3><a class="btn sm" href="#/orders?memo=' + rec.id + '">Open list</a></div><div class="card-b flush"><table class="table compact"><tbody>' +
          pos.map(p => '<tr class="click" onclick="location.hash=\'#/orders/' + p.id + '\'"><td class="mono">' + esc(p.poNumber || 'Draft') + '</td><td>' + esc(p.supplierName) + '</td><td class="num">' + util.money(p.total) + '</td><td>' + ui.badge(p.status) + '</td></tr>').join('') + '</tbody></table></div></div>' : '');
    }

    function bidsHtml() {
      const bids = m.bids || [];
      const lowest = lowestCompliant();
      return '<div class="table-wrap"><table class="table edit-table"><thead><tr><th class="center">No.</th><th>Supplier</th><th class="num">Bid price (JMD)</th><th class="center">Compliant</th><th></th></tr></thead><tbody>' +
        bids.map((b, i) => '<tr><td class="idx">' + (i + 1) + '</td><td><input class="input sm" list="dl-suppliers" data-bid="' + i + '" data-k="supplier" value="' + esc(b.supplier) + '" placeholder="Supplier name"></td>' +
          '<td class="amt"><input class="input sm num" type="number" step="0.01" min="0" data-bid="' + i + '" data-k="price" value="' + esc(b.price) + '" placeholder="0.00"' + (lowest === i ? ' style="background:var(--success-bg);border-color:var(--success-bd)"' : '') + '></td>' +
          '<td class="ck"><input type="checkbox" data-bid="' + i + '" data-k="compliant"' + (b.compliant !== false ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:var(--primary)"></td>' +
          '<td class="rm"><button class="btn xs ghost icon" data-rmbid="' + i + '" title="Remove">' + ui.icon('x', 'sm') + '</button></td></tr>').join('') +
        '</tbody></table></div><div style="padding:10px 14px;border-top:1px solid var(--border)"><button class="btn sm" data-a="addbid">' + ui.icon('plus', 'sm') + 'Add bid</button></div>';
    }
    function awardsHtml() {
      const aw = m.awards || [];
      return '<div class="section-title mt-2">Recommended awards</div><div class="table-wrap" style="border:1px solid var(--border);border-radius:var(--radius)"><table class="table edit-table"><thead><tr><th class="center">No.</th><th>Supplier</th><th class="num">Recommended price (JMD)</th><th></th></tr></thead><tbody>' +
        aw.map((a, i) => '<tr><td class="idx">' + (i + 1) + '</td><td><input class="input sm" list="dl-suppliers" data-award="' + i + '" data-k="supplier" value="' + esc(a.supplier) + '" placeholder="Supplier name"><div class="t-sub" data-hoe="' + i + '"></div></td>' +
          '<td class="amt"><input class="input sm num" type="number" step="0.01" min="0" data-award="' + i + '" data-k="amount" value="' + esc(a.amount) + '" placeholder="0.00"></td>' +
          '<td class="rm"><button class="btn xs ghost icon" data-rmaward="' + i + '" title="Remove">' + ui.icon('x', 'sm') + '</button></td></tr>').join('') +
        '</tbody><tfoot><tr><td></td><td>Total recommended</td><td class="num" id="awTotal"></td><td></td></tr></tfoot></table></div>' +
        '<div class="mt-2"><button class="btn sm" data-a="addaward">' + ui.icon('plus', 'sm') + 'Add award</button></div>';
    }
    function normBids() { return (m.bids || []).filter(b => b.supplier).map(b => ({ supplier: b.supplier, price: util.num(b.price), compliant: b.compliant !== false })); }
    function lowestCompliant() {
      let idx = -1, best = Infinity;
      (m.bids || []).forEach((b, i) => { const p = util.num(b.price); if (b.supplier && p > 0 && b.compliant !== false && p < best) { best = p; idx = i; } });
      return idx;
    }
    function drawBids() {
      el.querySelector('#bidsBox').innerHTML = bidsHtml();
      updateBidsSub();
    }
    function updateBidsSub() {
      const nb = normBids(), lo = lowestCompliant();
      const sub = el.querySelector('#bidsSub');
      if (sub) sub.textContent = nb.length ? nb.length + ' ' + util.plural(nb.length, 'bid') + ' · ' + nb.filter(b => b.compliant).length + ' compliant' + (lo >= 0 ? ' · lowest compliant ' + util.money(util.num(m.bids[lo].price)) + ' (' + m.bids[lo].supplier + ')' : '') : 'Add each supplier that submitted a bid. Head of Entity memos list these.';
      el.querySelectorAll('[data-bid][data-k=price]').forEach(inp => { const i = +inp.dataset.bid; inp.style.background = i === lo ? 'var(--success-bg)' : ''; inp.style.borderColor = i === lo ? 'var(--success-bd)' : ''; });
      const ta = el.querySelector('[data-f=evaluationNote]');
      if (ta) ta.placeholder = domain.autoEvaluationNote(nb) || 'The evaluation committee noted that …';
    }
    function drawAwards() { el.querySelector('#awardsBox').innerHTML = awardsHtml(); updateAwardsMeta(); }
    function updateAwardsMeta() {
      const t = el.querySelector('#awTotal'); if (t) t.textContent = util.money(memoTotal(m));
      (m.awards || []).forEach((a, i) => {
        const tag = el.querySelector('[data-hoe="' + i + '"]'); if (!tag) return;
        const amt = util.num(a.amount), L = store.settings().limits;
        tag.innerHTML = amt > L.cabinet ? '<span class="text-danger">Cabinet approval required</span>' : amt > L.ncc ? '<span class="text-warning">NCC/PPC endorsement + Head of Entity memo</span>' : amt > L.delegated ? 'Head of Entity memo will be produced' : '';
      });
    }

    /* ---- right column */
    function drawSide() {
      const side = el.querySelector('#memoSide');
      side.innerHTML = '<div class="card" id="memoSummary"></div>' +
        '<div class="card"><div class="card-h"><div class="row gap-1" style="flex:1;min-width:0"><h3>Preview</h3><select class="input sm" id="pvSel" style="max-width:280px;flex:1"></select></div><button class="btn sm ghost icon" data-a="pvopen" title="Open in new tab">' + ui.icon('external', 'sm') + '</button></div><div class="pv-box" id="memoPreview"><div class="loading"><div class="spinner"></div></div></div></div>' +
        (rec ? '<div class="card" id="memoDocs"></div>' : '');
      side.querySelector('#pvSel').onchange = e => { previewKey = e.target.value; schedulePreview(10); };
      side.querySelector('[data-a=pvopen]').onclick = () => outputPart(previewKey, 'open');
      updateSummary();
      drawDocs();
    }
    function updateSummary() {
      const box = el.querySelector('#memoSummary'); if (!box) return;
      const total = memoTotal(m);
      const awards = (m.awards || []).filter(a => a.supplier || util.num(a.amount));
      const route = domain.approvalRoute(total, awards.map(a => ({ amount: util.num(a.amount) })));
      const parts = pdfReady() ? Proc.pdf.memoParts(norm()) : [{ key: 'committee', label: 'Committee memo' }];
      box.innerHTML = '<div class="card-h"><h3>Summary</h3><span class="chip">' + esc(route.level) + '</span></div><div class="card-b">' +
        '<div class="muted small">Total recommended</div><div class="money-big">' + util.money(total) + '</div>' +
        '<div class="words mt-1">' + esc(total ? domain.amountWords(total) : '—') + '</div>' +
        (route.needsCabinet ? '<div class="alert danger mt-2">' + ui.icon('alert') + '<div><div class="t">Cabinet approval required</div>An award exceeds ' + util.money(store.settings().limits.cabinet, { noCents: true }) + ' (Handbook §2.4). Submit through the Accounting Officer after NCC/PPC endorsement.</div></div>' :
          route.needsNCC ? '<div class="alert warning mt-2">' + ui.icon('alert') + '<div><div class="t">NCC / PPC endorsement required</div>An award exceeds ' + util.money(store.settings().limits.ncc, { noCents: true }) + '. The Head of Entity approves only after endorsement (Handbook §2.4).</div></div>' : '') +
        '<div class="section-title mt-3">Approval route</div>' + ui.routeHtml(route) +
        '<div class="section-title mt-3">Documents produced</div><div>' + parts.map(p => '<div class="part"><div class="pi">PDF</div><div style="flex:1;min-width:0"><div class="pt truncate">' + esc(p.label) + '</div><div class="ps">' + esc(p.title || '') + '</div></div>' +
          '<button class="btn xs ghost" data-pv="' + p.key + '">' + ui.icon('eye', 'sm') + 'View</button><button class="btn xs ghost icon" data-pdl="' + p.key + '" title="Download">' + ui.icon('download', 'sm') + '</button></div>').join('') + '</div>' +
        (m.decision && m.status === 'Approved' ? '<div class="alert success mt-3">' + ui.icon('check') + '<div><div class="t">Approved' + (m.decision.by ? ' by ' + esc(m.decision.by) : '') + '</div>' + esc(util.dateLong(m.decision.date)) + (m.decision.notes ? ' — ' + esc(m.decision.notes) : '') + '</div></div>' : '') +
        '</div>';
      box.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => { previewKey = b.dataset.pv; schedulePreview(10); el.querySelector('#memoPreview').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
      box.querySelectorAll('[data-pdl]').forEach(b => b.onclick = () => outputPart(b.dataset.pdl, 'save'));
      const sel = el.querySelector('#pvSel');
      if (sel) {
        if (!parts.find(p => p.key === previewKey)) previewKey = 'committee';
        sel.innerHTML = parts.map(p => '<option value="' + p.key + '"' + (p.key === previewKey ? ' selected' : '') + '>' + esc(p.label) + '</option>').join('');
      }
    }
    function drawDocs() {
      const box = el.querySelector('#memoDocs'); if (!box || !rec) return;
      const docs = files.forLink('memoId', rec.id);
      box.innerHTML = '<div class="card-h"><div><h3>Signed copies &amp; files</h3><div class="sub">Stored with the memo and in each supplier’s file</div></div><button class="btn sm" data-a="upload">' + ui.icon('upload', 'sm') + 'Upload</button></div><div class="card-b">' +
        (docs.length ? '<div class="doc-list">' + docs.map(d => ui.docRow(d, { showSupplier: true })).join('') + '</div>' : '<div class="muted small">No files yet. Upload the signed memo once it comes back, or use <b>More → Save PDFs to supplier files</b>.</div>') + '</div>';
      ui.bindDocs(box, drawDocs);
      box.querySelector('[data-a=upload]').onclick = async () => {
        const aw = (m.awards || []).filter(a => a.supplierId);
        const r = await ui.uploadDialog({ kind: 'Approval Memo', supplierId: aw.length === 1 ? aw[0].supplierId : '', ref: m.ref, links: { memoId: rec.id, comparisonId: m.comparisonId || '' }, title: 'Upload signed memo or attachments' });
        if (r) drawDocs();
      };
    }

    /* ---- preview */
    function schedulePreview(ms) { clearTimeout(pvTimer); pvTimer = setTimeout(renderPreview, ms === undefined ? 600 : ms); }
    async function renderPreview() {
      const box = el.querySelector('#memoPreview'); if (!box || !document.body.contains(box)) return;
      if (!pdfReady()) { box.innerHTML = '<div class="muted small" style="padding:20px">The PDF engine has not loaded.</div>'; return; }
      const [which, idx] = previewKey.split(':');
      try {
        const blob = await Proc.pdf.memo(norm(), { which, hoeIndex: +idx || 0, output: 'blob' });
        await Proc.pdf.render(box, blob);
      } catch (e) { box.innerHTML = '<div class="alert danger">' + ui.icon('alert') + '<div>' + esc(e.message) + '</div></div>'; }
    }
    function outputPart(key, output) {
      if (!pdfReady()) return ui.toast('PDF engine not loaded.', 'error');
      const [which, idx] = String(key || 'all').split(':');
      Proc.pdf.memo(norm(), { which, hoeIndex: +idx || 0, output }).catch(e => ui.toast(e.message, 'error'));
    }

    /* ---- data */
    function norm() {
      const out = util.clone(m);
      out.bids = (m.bids || []).filter(b => (b.supplier || '').trim()).map(b => ({ supplierId: b.supplierId || '', supplier: b.supplier.trim(), price: util.num(b.price), compliant: b.compliant !== false }));
      out.awards = (m.awards || []).filter(a => (a.supplier || '').trim()).map(a => ({ supplierId: a.supplierId || '', supplier: a.supplier.trim(), amount: util.num(a.amount) }));
      out.invited = Number(m.invited) || out.bids.length;
      return out;
    }
    function validate(strict) {
      const n = norm(), errs = [];
      if (!n.ref) errs.push('a reference number');
      if (!n.subject) errs.push('the subject');
      if (strict && !n.awards.length) errs.push('at least one recommended award');
      if (strict && n.awards.some(a => !(a.amount > 0))) errs.push('an amount for every award');
      return errs;
    }
    function save(o) {
      o = o || {};
      clearTimeout(saveTimer);
      const n = norm();
      // Link names to supplier profiles (creating new profiles where needed).
      store.batch(() => {
        n.bids.forEach(b => { const s = domain.ensureSupplier(b.supplier, null, { silent: true }); if (s) { b.supplierId = s.id; b.supplier = s.name === b.supplier ? b.supplier : b.supplier; } });
        n.awards.forEach(a => { const s = domain.ensureSupplier(a.supplier, null, { silent: true }); if (s) a.supplierId = s.id; });
      });
      // Keep empty editing rows in the working copy, but store clean data.
      const isNew = !rec;
      if (isNew) n.number = store.next('memo');
      rec = store.upsert('memos', n);
      m.id = rec.id; m.number = rec.number;
      m.bids.forEach(b => { const x = n.bids.find(y => y.supplier === (b.supplier || '').trim()); if (x) b.supplierId = x.supplierId; });
      m.awards.forEach(a => { const x = n.awards.find(y => y.supplier === (a.supplier || '').trim()); if (x) a.supplierId = x.supplierId; });
      if (n.comparisonId) {
        const cmp = store.get('comparisons', n.comparisonId);
        if (cmp && (cmp.memoId !== rec.id || ['Open', 'Evaluated'].indexOf(cmp.status) >= 0)) store.upsert('comparisons', { id: cmp.id, memoId: rec.id, status: ['Open', 'Evaluated'].indexOf(cmp.status) >= 0 ? 'Memo Prepared' : cmp.status });
      }
      dirty = false;
      if (isNew) {
        Proc.audit('Create Memo', (n.ref || n.subject) + ' — ' + util.money(memoTotal(n)), rec.id);
        ui.toast('Memo saved');
        router.beforeLeave = null;
        location.replace('#/memos/' + rec.id);
        return rec;
      }
      if (!o.quiet) ui.toast(o.msg || 'Memo saved');
      setSaveState();
      return rec;
    }
    function setSaveState() {
      const s = el.querySelector('#saveState'); if (!s) return;
      if (!rec) { s.className = 'save-state dirty'; s.innerHTML = '<span class="dot"></span>Not saved yet'; return; }
      s.className = 'save-state' + (dirty ? ' dirty' : '');
      s.innerHTML = '<span class="dot"></span>' + (dirty ? 'Saving…' : 'All changes saved');
    }
    function changed(structural) {
      dirty = true;
      setSaveState();
      updateSummary();
      updateBidsSub();
      updateAwardsMeta();
      schedulePreview();
      if (rec && !locked()) { clearTimeout(saveTimer); saveTimer = setTimeout(() => save({ quiet: true }), 900); }
      if (structural) { /* rows redrawn by caller */ }
    }
    router.beforeLeave = async () => {
      if (rec && dirty && !locked()) { save({ quiet: true }); return true; }
      if (!rec && dirty) {
        const ok = await ui.confirm('This memo has not been saved. Leave without saving?', { ok: 'Leave', danger: true });
        if (!ok) { history.replaceState(null, '', '#/memos/new'); return false; }
      }
      return true;
    };

    /* ---- bindings */
    function bindForm() {
      const form = el.querySelector('#memoForm');
      drawBids(); drawAwards();
      form.addEventListener('input', e => {
        const t = e.target;
        if (t.dataset.f) { m[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.f === 'subject') { const h = t.closest('.field').querySelector('.hint b'); if (h) h.textContent = t.value || '…'; } }
        else if (t.dataset.bid !== undefined) { const b = m.bids[+t.dataset.bid]; b[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.k === 'supplier') b.supplierId = ''; }
        else if (t.dataset.award !== undefined) { const a = m.awards[+t.dataset.award]; a[t.dataset.k] = t.value; if (t.dataset.k === 'supplier') a.supplierId = ''; }
        else if (t.dataset.from) { m.from = Object.assign({}, m.from, { [t.dataset.from]: t.value }); }
        else return;
        changed();
      });
      form.addEventListener('change', e => { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') { /* input already handled */ } });
      form.addEventListener('click', e => {
        const b = e.target.closest('[data-a],[data-rmbid],[data-rmaward]'); if (!b) return;
        if (b.dataset.rmbid !== undefined) { m.bids.splice(+b.dataset.rmbid, 1); if (!m.bids.length) m.bids.push({ supplier: '', price: '', compliant: true }); drawBids(); changed(); return; }
        if (b.dataset.rmaward !== undefined) { m.awards.splice(+b.dataset.rmaward, 1); if (!m.awards.length) m.awards.push({ supplier: '', amount: '' }); drawAwards(); changed(); return; }
        const a = b.dataset.a;
        if (a === 'addbid') { m.bids.push({ supplier: '', price: '', compliant: true }); drawBids(); const ins = el.querySelectorAll('[data-bid][data-k=supplier]'); ins[ins.length - 1].focus(); }
        if (a === 'addaward') { m.awards.push({ supplier: '', amount: '' }); drawAwards(); const ins = el.querySelectorAll('[data-award][data-k=supplier]'); ins[ins.length - 1].focus(); }
        if (a === 'suggest') { e.preventDefault(); m.ref = domain.suggestRef(m.subject, m.method, m.date); el.querySelector('[data-f=ref]').value = m.ref; changed(); }
        if (a === 'autonote') { e.preventDefault(); m.evaluationNote = domain.autoEvaluationNote(normBids()); el.querySelector('[data-f=evaluationNote]').value = m.evaluationNote; changed(); }
        if (a === 'lowest') {
          const i = lowestCompliant();
          if (i < 0) { ui.toast('Enter at least one compliant bid with a price first.', 'warning'); return; }
          const bid = m.bids[i];
          const filled = (m.awards || []).filter(x => x.supplier || util.num(x.amount));
          if (filled.some(x => (x.supplier || '').trim() === bid.supplier.trim())) { ui.toast(bid.supplier + ' is already recommended.', 'info'); return; }
          m.awards = filled.concat([{ supplier: bid.supplier, supplierId: bid.supplierId || '', amount: bid.price }]);
          drawAwards(); changed(); ui.toast('Added ' + bid.supplier + ' at ' + util.money(util.num(bid.price)));
        }
      });
    }

    function bindHeader(pos) {
      el.querySelectorAll('.page-head [data-a]').forEach(b => b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'save') {
          const errs = validate(false);
          if (errs.length) return ui.toast('Please add ' + errs.join(' and ') + '.', 'warning');
          save();
        }
        if (a === 'download') {
          const parts = pdfReady() ? Proc.pdf.memoParts(norm()) : [];
          if (parts.length <= 1) return outputPart('all', 'save');
          ui.menu(b, [{ header: 'Download' }, { label: 'All memos in one PDF', icon: 'download', onClick: () => outputPart('all', 'save') }, { sep: true }].concat(parts.map(p => ({ label: p.label, icon: 'file', onClick: () => outputPart(p.key, 'save') }))));
        }
        if (a === 'print') outputPart(previewKey, 'open');
        if (a === 'submit') submit();
        if (a === 'decision') decisionDialog();
        if (a === 'orders') createOrders();
        if (a === 'redraft') redraft();
        if (a === 'more') ui.menu(b, moreItems(pos));
      });
    }
    function moreItems(pos) {
      const items = [];
      if (m.status === 'Submitted') items.push({ label: 'Return to draft', icon: 'edit', onClick: redraft });
      if (m.status === 'Approved' && pos.length) items.push({ label: 'Create purchase orders again', icon: 'cart', onClick: createOrders });
      if (m.status !== 'Submitted' && m.status !== 'Approved' && m.status !== 'Rejected') items.push({ label: 'Record decision', icon: 'stamp', onClick: decisionDialog });
      items.push({ label: 'Save PDFs to supplier files', icon: 'folder', onClick: saveToSupplierFiles });
      items.push({ label: 'Duplicate memo', icon: 'copy', onClick: duplicate });
      if (m.comparisonId) items.push({ label: 'Open price comparison', icon: 'scale', onClick: () => router.go('sourcing/' + m.comparisonId) });
      items.push({ sep: true }, { label: 'Delete memo', icon: 'trash', danger: true, onClick: del });
      return items;
    }

    function submit() {
      const errs = validate(true);
      if (errs.length) return ui.toast('Before submitting, add ' + errs.join(', ') + '.', 'warning');
      m.status = 'Submitted'; m.submittedAt = util.today(); m.decision = null;
      save({ quiet: true });
      Proc.audit('Submit Memo', (m.ref || m.subject) + ' for approval — ' + util.money(memoTotal(m)), rec.id);
      ui.toast('Memo submitted for approval. Download and print the PDFs for signature.');
      draw();
    }
    async function redraft() {
      if (!await ui.confirm('Return this memo to draft so it can be edited? Any recorded decision will be cleared.', { ok: 'Return to draft' })) return;
      m.status = 'Draft'; m.decision = null;
      save({ quiet: true });
      Proc.audit('Memo Returned to Draft', m.ref || m.subject, rec.id);
      draw();
    }
    function decisionDialog() {
      const errs = validate(true);
      if (errs.length) return ui.toast('Complete the memo first: ' + errs.join(', ') + '.', 'warning');
      const sg = store.settings().signatories;
      const by = hoeCount(norm()) ? sg.regionalDirector.name + ', ' + sg.regionalDirector.title : sg.parishManager.name + ', ' + sg.parishManager.title;
      let picked = [];
      ui.modal({
        title: 'Record approval decision', size: 'lg',
        body: '<div class="form-grid">' +
          '<div class="field s4"><label>Decision</label><select name="status"><option>Approved</option><option>Rejected</option></select></div>' +
          '<div class="field s4"><label>Decision date</label><input type="date" name="date" value="' + util.today() + '"></div>' +
          '<div class="field s4"><label>Decided by</label><input name="by" value="' + esc(by) + '"></div>' +
          '<div class="field s12"><label>Notes / conditions</label><textarea name="notes" rows="2" placeholder="Optional"></textarea></div>' +
          '<div class="field s12"><label>Signed memo (optional)</label><div class="dz"></div><div class="picked small muted mt-1"></div></div></div>',
        onOpen: mod => ui.dropzone(mod.querySelector('.dz'), fs => { picked = picked.concat(fs); mod.querySelector('.picked').innerHTML = picked.map(f => esc(f.name)).join('<br>'); }, { title: 'Drop the signed memo here', hint: 'PDF or photo — saved to the memo and the supplier files' }),
        actions: [{ label: 'Cancel', kind: 'ghost' }, {
          label: 'Save decision', kind: 'primary', onClick: async (close, mod) => {
            const f = ui.formData(mod);
            m.status = f.status; m.decision = { status: f.status, date: f.date, by: f.by, notes: f.notes };
            save({ quiet: true });
            const n = norm();
            for (const file of picked) {
              const aw = n.awards.length === 1 ? n.awards[0] : null;
              await files.add(file, { kind: 'Approval Memo', title: 'Signed approval memo – ' + (m.ref || m.subject), supplierId: aw ? (rec.awards[0] || {}).supplierId || '' : '', ref: m.ref, date: f.date, amount: memoTotal(m), links: { memoId: rec.id, comparisonId: m.comparisonId || '' } });
            }
            if (f.status === 'Approved' && m.comparisonId) {
              const cmp = store.get('comparisons', m.comparisonId);
              if (cmp && cmp.status !== 'Ordered') store.upsert('comparisons', { id: cmp.id, status: 'Approved' });
            }
            Proc.audit(f.status === 'Approved' ? 'Memo Approved' : 'Memo Rejected', (m.ref || m.subject) + ' — ' + (f.by || '') + (f.notes ? ' — ' + f.notes : ''), rec.id);
            ui.toast(f.status === 'Approved' ? 'Approval recorded. You can now create the purchase orders.' : 'Decision recorded.');
            draw();
          }
        }]
      });
    }
    async function createOrders() {
      if (!rec) return;
      const n = norm();
      const existing = store.filter('purchaseOrders', p => p.memoId === rec.id && p.status !== 'Cancelled');
      if (existing.length && !await ui.confirm(existing.length + ' purchase ' + util.plural(existing.length, 'order has', 'orders have') + ' already been created from this memo. Create another set?', { ok: 'Create again' })) return;
      const cmp = m.comparisonId && store.get('comparisons', m.comparisonId);
      const S = store.settings();
      let drafts;
      if (cmp) drafts = domain.ordersFromComparison(cmp).map(p => Object.assign(p, { memoId: rec.id }));
      else {
        drafts = n.awards.filter(a => a.amount > 0).map(a => {
          const sup = (a.supplierId && store.get('suppliers', a.supplierId)) || domain.ensureSupplier(a.supplier);
          return {
            supplierId: sup ? sup.id : '', supplierName: sup ? sup.name : a.supplier, memoId: rec.id, requisitionId: m.requisitionId || '', ref: m.ref, description: m.subject,
            date: util.today(), items: [{ description: m.subject, unit: 'lot', qty: 1, unitPrice: a.amount, total: a.amount }], subtotal: a.amount, gct: 0, total: a.amount,
            method: m.method, viaGojep: m.viaGojep !== false, tendersReceived: n.bids.length, type: 'Goods', deliveryAddress: S.org.deliveryAddress, paymentTerms: '30 days credit',
            status: 'Draft', poNumber: '', source: 'manual'
          };
        });
      }
      if (!drafts.length) return ui.toast('There are no awards with amounts to order.', 'warning');
      let ids = [];
      store.batch(() => {
        ids = drafts.map(d => store.upsert('purchaseOrders', d, { silent: true }).id);
        if (cmp) store.upsert('comparisons', { id: cmp.id, poIds: (cmp.poIds || []).concat(ids), status: 'Ordered' }, { silent: true });
        const reqId = (cmp && cmp.requisitionId) || m.requisitionId;
        if (reqId && store.get('requisitions', reqId)) store.upsert('requisitions', { id: reqId, status: 'Ordered' }, { silent: true });
      });
      Proc.audit('Create Purchase Orders', ids.length + ' draft PO(s) from memo ' + (m.ref || memoNo(m)), rec.id);
      ui.toast(ids.length + ' draft purchase ' + util.plural(ids.length, 'order') + ' created. Issue each one with its official PO number.');
      router.go('orders?memo=' + rec.id);
    }
    async function saveToSupplierFiles() {
      if (!rec) return;
      if (!pdfReady()) return ui.toast('PDF engine not loaded.', 'error');
      const n = norm();
      const hoes = Proc.pdf.hoeAwards(n);
      let count = 0;
      for (const a of n.awards) {
        const sid = (rec.awards.find(x => x.supplier === a.supplier) || {}).supplierId;
        if (!sid) continue;
        const hi = hoes.findIndex(h => h.supplier === a.supplier);
        const which = hi >= 0 ? 'hoe' : 'committee';
        const blob = await Proc.pdf.memo(n, { which, hoeIndex: hi, output: 'blob' });
        const name = Proc.pdf.memoFilename(n, which, hi);
        await files.add(new File([blob], name, { type: 'application/pdf' }), { kind: 'Approval Memo', title: name.replace(/\.pdf$/, ''), supplierId: sid, ref: m.ref, date: m.date, amount: a.amount, links: { memoId: rec.id, comparisonId: m.comparisonId || '' } });
        count++;
      }
      ui.toast(count ? 'Saved to ' + count + ' supplier ' + util.plural(count, 'file') : 'No linked suppliers to save to.', count ? 'success' : 'warning');
      drawDocs();
    }
    function duplicate() {
      const copy = norm();
      ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'decision', 'submittedAt', 'comparisonId'].forEach(k => delete copy[k]);
      copy.status = 'Draft'; copy.number = store.next('memo'); copy.date = util.today(); copy.from = domain.officer();
      const r = store.upsert('memos', copy);
      Proc.audit('Duplicate Memo', 'From ' + (m.ref || memoNo(m)), r.id);
      ui.toast('Copy created');
      router.go('memos/' + r.id);
    }
    async function del() {
      const pos = store.filter('purchaseOrders', p => p.memoId === rec.id);
      if (!await ui.confirm('Delete memo <b>' + esc(m.ref || memoNo(m)) + '</b>?' + (pos.length ? '<br><br>' + pos.length + ' purchase order(s) reference this memo; they will be kept.' : ''), { danger: true, ok: 'Delete memo' })) return;
      if (m.comparisonId) { const cmp = store.get('comparisons', m.comparisonId); if (cmp && cmp.memoId === rec.id) store.upsert('comparisons', { id: cmp.id, memoId: '', status: cmp.status === 'Memo Prepared' ? 'Evaluated' : cmp.status }); }
      store.remove('memos', rec.id);
      Proc.audit('Delete Memo', m.ref || memoNo(m), rec.id);
      dirty = false; router.beforeLeave = null;
      ui.toast('Memo deleted');
      router.go('memos');
    }

    draw();
  }
})();
