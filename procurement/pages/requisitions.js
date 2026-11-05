/* ==========================================================================
   Requisitions — #/requisitions, #/requisitions/new, #/requisitions/<id>[/edit]
   The start of every procurement case: what is needed, by whom, and the
   estimated value that decides the approval route.
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, K, router } = Proc;
  const esc = util.esc;

  if (!document.getElementById('css-requisitions')) document.head.insertAdjacentHTML('beforeend', '<style id="css-requisitions">' +
    '.line-grid td{padding:4px 6px;vertical-align:top}.line-grid th{padding:8px 6px}' +
    '.line-grid .input{height:34px}.line-grid input[data-c="0"]{min-width:220px}.line-grid input[data-c="1"]{min-width:84px}.line-grid input[data-c="2"]{min-width:80px}.line-grid input[data-c="3"]{min-width:110px}.line-grid input[data-c="4"]{min-width:150px}.line-grid .ln{color:var(--text-3);font-size:12px;padding-top:12px;text-align:center;width:28px}' +
    '.line-grid td.tot{padding-top:12px;font-weight:600;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}' +
    '.line-grid .rowbtns{white-space:nowrap;padding-top:6px}' +
    '.req-total{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;border-top:1px solid var(--border);background:var(--surface-2);flex-wrap:wrap}' +
    '.case-links .lk{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)}.case-links .lk:last-child{border-bottom:0}' +
    '.case-links .lk .ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--primary-50);color:var(--primary);flex:none}' +
    '@media (max-width:760px){.line-grid .opt{display:none}}' +
    '</style>');

  const STATUS_SEGS = ['All', 'Draft', 'Submitted', 'Approved', 'Sourcing', 'Awarded', 'Ordered', 'Completed', 'Rejected', 'Cancelled'];
  const FINAL = ['Completed', 'Rejected', 'Cancelled'];
  let listSeg = 'All';
  let leaveGuard = null; // flushes an open form when navigating within this page

  const numOf = r => r.number || r.id;
  const estimateOf = items => util.round2(util.sum(items || [], i => util.num(i.qty) * util.num(i.estUnitPrice)));

  /* --------------------------------------------------------------- page */
  Proc.page({
    id: 'requisitions', title: 'Requisitions', icon: 'clipboard', section: 'Workflow', order: 10,
    count() { return store.filter('requisitions', r => r.status === 'Submitted').length; },
    render(el, params) {
      if (leaveGuard) { const g = leaveGuard; leaveGuard = null; g(); }
      if (!params.length) return renderList(el);
      if (params[0] === 'new') return renderForm(el, null);
      const r = store.get('requisitions', params[0]);
      if (!r) { el.innerHTML = ui.pageHead({ title: 'Requisition not found', back: { label: 'Requisitions', href: '#/requisitions' } }) + '<div class="card">' + ui.empty('clipboard', 'This requisition no longer exists', 'It may have been deleted.') + '</div>'; return; }
      ui.setCrumbs(['Requisitions', numOf(r)]);
      if (params[1] === 'edit') return renderForm(el, r);
      return renderDetail(el, r);
    }
  });
  Proc.quickCreate.push({ label: 'Requisition', icon: 'clipboard', order: 10, onClick: () => router.go('requisitions/new') });

  /* --------------------------------------------------------------- list */
  function renderList(el) {
    const all = store.list('requisitions').slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(numOf(b)).localeCompare(String(numOf(a)), undefined, { numeric: true }));
    const counts = {}; all.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const open = all.filter(r => FINAL.indexOf(r.status) < 0);
    const depts = Array.from(new Set(all.map(r => r.department).filter(Boolean))).sort();
    el.innerHTML = ui.pageHead({
      title: 'Requisitions', sub: 'Requests for goods, services and works from hospital departments',
      actions: '<button class="btn" data-up>' + ui.icon('upload', 'sm') + 'Upload requisition form</button><button class="btn" data-online>' + ui.icon('link', 'sm') + 'Online requests</button><a class="btn" href="#/req-form">' + ui.icon('file', 'sm') + 'Requisition form</a><a class="btn primary" href="#/requisitions/new">' + ui.icon('plus', 'sm') + 'New requisition</a>'
    }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Open requisitions', value: util.int(open.length), icon: 'clipboard', meta: util.moneyShort(util.sum(open, r => r.estimate)) + ' estimated' }) +
      ui.kpi({ label: 'Awaiting approval', value: util.int(counts.Submitted || 0), icon: 'clock', tone: counts.Submitted ? 'warn' : '' }) +
      ui.kpi({ label: 'In sourcing', value: util.int((counts.Sourcing || 0) + (counts.Awarded || 0)), icon: 'scale', tone: 'pur' }) +
      ui.kpi({ label: 'Emergency priority', value: util.int(open.filter(r => r.priority === 'Emergency').length), icon: 'alert', tone: open.some(r => r.priority === 'Emergency') ? 'bad' : '' }) +
      '</div>' +
      '<div class="card"><div class="card-h"><div class="seg" id="reqSeg">' + STATUS_SEGS.filter(s => s === 'All' || counts[s] || ['Draft', 'Submitted', 'Approved', 'Sourcing', 'Ordered'].indexOf(s) >= 0)
        .map(s => '<button data-s="' + s + '" class="' + (s === listSeg ? 'on' : '') + '">' + s + '<span class="n">' + (s === 'All' ? all.length : (counts[s] || 0)) + '</span></button>').join('') + '</div></div><div id="reqTable"></div></div>';

    const rowsFor = s => (s === 'All' ? all : all.filter(r => r.status === s));
    const upB = el.querySelector('[data-up]'); if (upB) upB.onclick = () => Proc.reqForm.upload();
    const onB = el.querySelector('[data-online]'); if (onB) onB.onclick = () => Proc.reqForm.onlineDialog();
    const tbl = ui.table(el.querySelector('#reqTable'), {
      rows: rowsFor(listSeg), placeholder: 'Search number, title, department, items…', pageSize: 25,
      search: r => [numOf(r), r.title, r.department, r.requestedBy, r.budgetLine, (r.items || []).map(i => i.description).join(' ')].join(' '),
      filters: [{ key: 'department', label: 'All departments', options: depts }, { key: 'priority', label: 'Any priority', options: K.PRIORITIES }],
      initialSort: null,
      onRow: r => router.go('requisitions/' + r.id),
      empty: ui.empty('clipboard', 'No requisitions yet', 'Record a department’s request to start a procurement case.', '<a class="btn primary" href="#/requisitions/new">' + ui.icon('plus', 'sm') + 'New requisition</a>'),
      columns: [
        { key: 'number', label: 'Number', sort: r => numOf(r), render: r => '<span class="t-title mono">' + esc(numOf(r)) + '</span>' },
        { key: 'date', label: 'Date', render: r => '<span class="nowrap">' + esc(util.date(r.date)) + '</span>' },
        { key: 'title', label: 'Title', render: r => '<div class="t-title">' + esc(r.title || '(untitled)') + '</div><div class="t-sub">' + (r.items || []).length + ' ' + util.plural((r.items || []).length, 'item') + (r.category ? ' · ' + esc(r.category) : '') + '</div>' },
        { key: 'department', label: 'Department', render: r => esc(r.department || '—') },
        { key: 'requestedBy', label: 'Requested by', render: r => esc(r.requestedBy || '—') },
        { key: 'estimate', label: 'Est. value', cls: 'num', sort: r => util.num(r.estimate), render: r => util.money(r.estimate) },
        { key: 'priority', label: 'Priority', render: r => r.priority === 'Emergency' ? ui.badge('Emergency') : '<span class="muted">Normal</span>' },
        { key: 'status', label: 'Status', render: r => ui.badge(r.status) }
      ]
    });
    el.querySelectorAll('#reqSeg button').forEach(b => b.onclick = () => {
      listSeg = b.dataset.s;
      el.querySelectorAll('#reqSeg button').forEach(x => x.classList.toggle('on', x === b));
      tbl.refresh(rowsFor(listSeg));
    });
  }

  /* --------------------------------------------------------------- form */
  function blankLine() { return { id: util.uid('L'), description: '', unit: 'each', qty: '', estUnitPrice: '', spec: '' }; }

  function renderForm(el, existing) {
    const isNew = !existing;
    const r = existing ? util.clone(existing) : {
      date: util.today(), department: '', requestedBy: '', title: '', priority: 'Normal', type: 'Goods', category: '', method: '',
      items: [blankLine(), blankLine(), blankLine()], budgetLine: '', justification: '', neededBy: '', notes: '', status: 'Draft'
    };
    if (!r.items || !r.items.length) r.items = [blankLine()];
    let dirty = false;

    ui.supplierDatalist();
    if (!document.getElementById('dl-units')) document.body.insertAdjacentHTML('beforeend', '<datalist id="dl-units">' + K.UNITS.map(u => '<option value="' + esc(u) + '">').join('') + '</datalist>');

    el.innerHTML = ui.pageHead({
      title: isNew ? 'New requisition' : 'Edit ' + numOf(r),
      sub: isNew ? 'Capture the department’s request. The estimate decides the approval route.' : esc(r.title || ''),
      back: isNew ? { label: 'Requisitions', href: '#/requisitions' } : { label: numOf(r), href: '#/requisitions/' + r.id },
      actions: '<button class="btn ghost" data-act="cancel">Cancel</button><button class="btn" data-act="draft">' + ui.icon('check', 'sm') + 'Save draft</button><button class="btn primary" data-act="submit">' + ui.icon('send', 'sm') + 'Save &amp; submit</button>'
    }) +
      '<div class="grid side">' +
      '<div class="stack">' +
      '<div class="card"><div class="card-h"><h3>Request details</h3></div><div class="card-b"><div class="form-grid" id="reqHead">' +
      '<div class="field s8"><label>Title / what is needed<span class="req">*</span></label><input name="title" value="' + esc(r.title) + '" placeholder="e.g. Medical sundries for surgical wards"></div>' +
      '<div class="field s4"><label>Request date<span class="req">*</span></label><input type="date" name="date" value="' + esc(r.date) + '"></div>' +
      '<div class="field s6"><label>Department<span class="req">*</span></label><select name="department" id="reqDept"></select></div>' +
      '<div class="field s6"><label>Requested by<span class="req">*</span></label><input name="requestedBy" value="' + esc(r.requestedBy) + '" placeholder="Name of requisitioner"></div>' +
      '<div class="field s3"><label>Priority</label><select name="priority">' + ui.options(K.PRIORITIES, r.priority) + '</select></div>' +
      '<div class="field s3"><label>Needed by</label><input type="date" name="neededBy" value="' + esc(r.neededBy) + '"></div>' +
      '<div class="field s3"><label>Type</label><select name="type">' + ui.options(K.TYPES, r.type) + '</select></div>' +
      '<div class="field s3"><label>Budget line / object</label><input name="budgetLine" value="' + esc(r.budgetLine) + '" placeholder="e.g. Object 25"></div>' +
      '<div class="field s6"><label>PRS category</label><select name="category">' + ui.categoryOptions(r.category, r.type) + '</select></div>' +
      '<div class="field s6"><label>Planned method</label><select name="method">' + ui.options(K.METHODS, r.method, 'Decide at sourcing') + '</select>' + (r.legacyMethod ? '<div class="hint">Recorded on the old system as “' + esc(r.legacyMethod) + '”.</div>' : '') + '</div>' +
      '<div class="field s12"><label>Justification</label><textarea name="justification" rows="2" placeholder="Why the items are needed, stock position, usage…">' + esc(r.justification) + '</textarea></div>' +
      '</div></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Items</h3><div class="sub">Tip: copy rows from Excel (Description, Unit, Qty, Unit price) and paste into any cell.</div></div>' +
      '<div class="row"><button class="btn sm" data-act="paste">' + ui.icon('copy', 'sm') + 'Paste rows</button><button class="btn sm" data-act="addline">' + ui.icon('plus', 'sm') + 'Add line</button></div></div>' +
      '<div class="table-wrap"><table class="table line-grid"><thead><tr><th>#</th><th style="min-width:240px">Description</th><th style="width:110px">Unit</th><th style="width:100px" class="num">Qty</th><th style="width:140px" class="num">Est. unit price</th><th class="opt" style="min-width:160px">Specification</th><th class="num" style="width:130px">Line total</th><th></th></tr></thead><tbody id="lines"></tbody></table></div>' +
      '<div class="req-total"><div><div class="muted small">Estimated value</div><div class="money-big" id="estTotal">$0.00</div><div class="words" id="estWords"></div></div><div class="muted small" id="lineCount"></div></div></div>' +
      '<div class="card"><div class="card-h"><h3>Notes</h3></div><div class="card-b"><textarea class="input" name="notes" id="reqNotes" rows="2" placeholder="Internal notes (optional)">' + esc(r.notes) + '</textarea></div></div>' +
      '</div>' +
      '<div class="stack"><div class="card"><div class="card-h"><div><h3>Approval route</h3><div class="sub">Based on the estimated value</div></div><span id="routeLvl"></span></div><div class="card-b" id="routeBox"></div></div>' +
      '<div class="card"><div class="card-b small muted">' + ui.icon('info', 'sm') + ' Thresholds come from Settings: committee review from ' + util.money(store.settings().limits.committeeMin, { noCents: true }) +
      ', Parish Manager delegated authority ' + util.money(store.settings().limits.delegated, { noCents: true }) + ', NCC/PPC endorsement above ' + util.money(store.settings().limits.ncc, { noCents: true }) + ', Cabinet above ' + util.money(store.settings().limits.cabinet, { noCents: true }) + ' (Handbook §2.4).</div></div></div>' +
      '</div>';

    // Department select (shared hospital list), keeping any saved value.
    const dept = el.querySelector('#reqDept');
    if (typeof window.mphPopulateDeptSelect === 'function') {
      try { window.mphPopulateDeptSelect(dept, { firstOption: { value: '', label: 'Select department' } }); } catch (e) { dept.innerHTML = '<option value="">Select department</option>'; }
    } else dept.innerHTML = '<option value="">Select department</option>';
    const knownDepts = Array.from(new Set(store.list('requisitions').map(x => x.department).filter(Boolean)));
    knownDepts.concat(r.department ? [r.department] : []).forEach(d => { if (!Array.from(dept.options).some(o => o.value === d)) dept.insertAdjacentHTML('beforeend', '<option>' + esc(d) + '</option>'); });
    dept.value = r.department || '';

    const tbody = el.querySelector('#lines');
    const COLS = ['description', 'unit', 'qty', 'estUnitPrice', 'spec'];

    function drawLines(focus) {
      tbody.innerHTML = r.items.map((it, i) => '<tr data-i="' + i + '"><td class="ln">' + (i + 1) + '</td>' +
        '<td><input class="input" data-c="0" value="' + esc(it.description) + '" placeholder="Item description"></td>' +
        '<td><input class="input" data-c="1" list="dl-units" value="' + esc(it.unit) + '"></td>' +
        '<td><input class="input num" data-c="2" type="number" min="0" step="any" value="' + esc(it.qty) + '"></td>' +
        '<td><input class="input num" data-c="3" type="number" min="0" step="0.01" value="' + esc(it.estUnitPrice) + '"></td>' +
        '<td class="opt"><input class="input" data-c="4" value="' + esc(it.spec) + '" placeholder="Brand, size, standard…"></td>' +
        '<td class="tot" data-tot>' + util.money(util.num(it.qty) * util.num(it.estUnitPrice)) + '</td>' +
        '<td class="rowbtns"><button class="btn xs ghost icon" data-row="dup" title="Duplicate line">' + ui.icon('copy', 'sm') + '</button><button class="btn xs ghost icon danger" data-row="del" title="Remove line">' + ui.icon('trash', 'sm') + '</button></td></tr>').join('');
      if (focus) { const f = tbody.querySelector('tr[data-i="' + focus[0] + '"] input[data-c="' + focus[1] + '"]'); if (f) f.focus(); }
      updateTotals();
    }
    function updateTotals() {
      const est = estimateOf(r.items);
      el.querySelector('#estTotal').textContent = util.money(est);
      el.querySelector('#estWords').textContent = est ? domain.amountWords(est) : '';
      const n = r.items.filter(i => i.description).length;
      el.querySelector('#lineCount').textContent = n + ' ' + util.plural(n, 'line');
      const route = domain.approvalRoute(est, [{ amount: est }]);
      el.querySelector('#routeBox').innerHTML = est ? ui.routeHtml(route) + (route.needsCabinet ? '<div class="alert danger mt-2">' + ui.icon('alert') + '<div>Above the Cabinet threshold — Cabinet approval required after NCC/PPC endorsement.</div></div>' : route.needsNCC ? '<div class="alert warning mt-2">' + ui.icon('alert') + '<div>Above ' + util.money(store.settings().limits.ncc, { noCents: true }) + ' — NCC/PPC endorsement required before Head of Entity approval.</div></div>' : '')
        : '<div class="muted small">Enter quantities and estimated prices to see who must approve.</div>';
      el.querySelector('#routeLvl').innerHTML = est ? '<span class="badge primary plain">' + esc(route.level) + '</span>' : '';
    }
    tbody.addEventListener('input', e => {
      const inp = e.target.closest('input[data-c]'); if (!inp) return;
      const i = +inp.closest('tr').dataset.i, c = COLS[+inp.dataset.c];
      r.items[i][c] = inp.value; dirty = true;
      if (c === 'qty' || c === 'estUnitPrice') { inp.closest('tr').querySelector('[data-tot]').textContent = util.money(util.num(r.items[i].qty) * util.num(r.items[i].estUnitPrice)); updateTotals(); }
      else if (c === 'description') updateTotals();
    });
    tbody.addEventListener('keydown', e => {
      const inp = e.target.closest('input[data-c]'); if (!inp) return;
      const i = +inp.closest('tr').dataset.i, c = +inp.dataset.c;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (i === r.items.length - 1) { r.items.push(blankLine()); drawLines([i + 1, 0]); }
        else { const n = tbody.querySelector('tr[data-i="' + (i + 1) + '"] input[data-c="' + c + '"]'); if (n) n.focus(); }
      }
    });
    tbody.addEventListener('paste', e => {
      const inp = e.target.closest('input[data-c]'); if (!inp) return;
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
      e.preventDefault();
      pasteRows(text, +inp.closest('tr').dataset.i, +inp.dataset.c);
    });
    tbody.addEventListener('click', e => {
      const b = e.target.closest('[data-row]'); if (!b) return;
      const i = +b.closest('tr').dataset.i;
      if (b.dataset.row === 'dup') { const c = util.clone(r.items[i]); c.id = util.uid('L'); r.items.splice(i + 1, 0, c); }
      if (b.dataset.row === 'del') { r.items.splice(i, 1); if (!r.items.length) r.items.push(blankLine()); }
      dirty = true; drawLines();
    });
    function pasteRows(text, startRow, startCol) {
      const rows = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(l => l.split('\t'));
      rows.forEach((cells, k) => {
        const idx = startRow + k;
        // Reuse an empty trailing line, else append.
        if (!r.items[idx]) r.items.push(blankLine());
        cells.forEach((v, j) => {
          const col = COLS[startCol + j]; if (!col) return;
          let val = String(v).trim();
          if (col === 'qty' || col === 'estUnitPrice') val = val ? String(util.num(val)) : '';
          r.items[idx][col] = val;
        });
      });
      dirty = true; drawLines();
      ui.toast(rows.length + ' ' + util.plural(rows.length, 'row') + ' pasted');
    }
    drawLines();

    el.querySelector('#reqHead').addEventListener('input', () => { dirty = true; });
    el.querySelector('#reqHead').addEventListener('change', e => {
      dirty = true;
      if (e.target.name === 'type') { const cat = el.querySelector('[name=category]'); const v = cat.value; cat.innerHTML = ui.categoryOptions(v, e.target.value); }
    });
    el.querySelector('#reqNotes').addEventListener('input', () => { dirty = true; });

    function collect() {
      const h = ui.formData(el.querySelector('#reqHead'));
      Object.assign(r, h, { notes: el.querySelector('#reqNotes').value.trim() });
      r.items = r.items.map(i => Object.assign(i, { description: String(i.description || '').trim(), qty: i.qty === '' ? '' : util.num(i.qty), estUnitPrice: i.estUnitPrice === '' ? '' : util.num(i.estUnitPrice) }));
      return r;
    }
    function save(status, silent) {
      collect();
      const items = r.items.filter(i => i.description || util.num(i.qty) || util.num(i.estUnitPrice));
      if (!silent) {
        el.querySelectorAll('.field').forEach(f => f.classList.remove('invalid'));
        const need = status === 'Submitted' ? ['title', 'date', 'department', 'requestedBy'] : ['title'];
        const miss = need.filter(k => !r[k]);
        miss.forEach(k => { const f = el.querySelector('[name="' + k + '"]'); if (f) f.closest('.field').classList.add('invalid'); });
        if (miss.length) { ui.toast(status === 'Submitted' ? 'Fill in the title, date, department and requisitioner before submitting.' : 'Give the requisition a title.', 'warning'); return null; }
        if (status === 'Submitted') {
          if (!items.length) { ui.toast('Add at least one item.', 'warning'); return null; }
          const bad = items.filter(i => !i.description || !(util.num(i.qty) > 0));
          if (bad.length) { ui.toast('Every line needs a description and a quantity.', 'warning'); return null; }
        }
      }
      const rec = Object.assign({}, r, { items: items.length ? items : [], estimate: estimateOf(items) });
      if (status) rec.status = status;
      if (!rec.number) rec.number = 'REQ-' + store.next('req');
      if (status === 'Submitted') rec.submittedAt = new Date().toISOString();
      const saved = store.upsert('requisitions', rec);
      Proc.audit(isNew ? 'Create Requisition' : 'Update Requisition', saved.number + ' — ' + (saved.title || '') + ' (' + util.money(saved.estimate) + ')' + (status === 'Submitted' ? ' submitted' : ''), saved.id);
      dirty = false;
      return saved;
    }
    const guard = () => {
      if (!dirty) return true;
      collect();
      if (!r.title && !r.items.some(i => i.description)) return true;
      const s = save(existing ? null : 'Draft', true);
      if (s) ui.toast('Unsaved changes kept as draft ' + s.number, 'info');
      return true;
    };
    router.beforeLeave = guard;
    leaveGuard = guard;
    const onUnload = () => { if (dirty) { guard(); store.flush(); } };
    window.addEventListener('beforeunload', onUnload);

    el.querySelector('[data-act=addline]').onclick = () => { r.items.push(blankLine()); dirty = true; drawLines([r.items.length - 1, 0]); };
    el.querySelector('[data-act=paste]').onclick = () => {
      ui.form('Paste rows from Excel', [{ name: 'text', label: 'Copy the rows in Excel (Description, Unit, Qty, Unit price, Spec) and paste here', type: 'textarea', rows: 8, required: true }], { ok: 'Add rows', size: 'lg' }).then(v => {
        if (!v) return;
        // Drop the empty trailing lines first so pasted rows start at the first free line.
        let start = r.items.length;
        while (start > 0 && !r.items[start - 1].description && !r.items[start - 1].qty) start--;
        r.items.length = Math.max(start, 0);
        pasteRows(v.text, start, 0);
      });
    };
    el.querySelector('[data-act=cancel]').onclick = () => { dirty = false; leaveGuard = null; router.beforeLeave = null; window.removeEventListener('beforeunload', onUnload); router.go(existing ? 'requisitions/' + existing.id : 'requisitions'); };
    el.querySelector('[data-act=draft]').onclick = () => {
      const s = save(existing && existing.status !== 'Draft' ? null : 'Draft');
      if (s) { leaveGuard = null; router.beforeLeave = null; window.removeEventListener('beforeunload', onUnload); ui.toast('Saved ' + s.number); router.go('requisitions/' + s.id); }
    };
    el.querySelector('[data-act=submit]').onclick = () => {
      const keep = existing && ['Draft', 'Rejected'].indexOf(existing.status) < 0;
      const s = save(keep ? null : 'Submitted');
      if (s) { leaveGuard = null; router.beforeLeave = null; window.removeEventListener('beforeunload', onUnload); ui.toast(keep ? 'Saved ' + s.number : s.number + ' submitted for approval'); router.go('requisitions/' + s.id); }
    };
  }

  /* ------------------------------------------------------------- detail */
  function caseOf(r) {
    const cmp = (r.comparisonId && store.get('comparisons', r.comparisonId)) || store.find('comparisons', c => c.requisitionId === r.id);
    const memo = cmp && cmp.memoId ? store.get('memos', cmp.memoId) : store.find('memos', m => m.requisitionId === r.id);
    const pos = store.filter('purchaseOrders', p => p.status !== 'Cancelled' && (p.requisitionId === r.id || (cmp && p.comparisonId === cmp.id)));
    const delivered = pos.length && pos.every(p => ['Delivered', 'Invoiced', 'Paid', 'Closed'].indexOf(p.status) >= 0);
    const paid = pos.length && pos.every(p => ['Paid', 'Closed'].indexOf(p.status) >= 0);
    const done = [
      ['Submitted', 'Approved', 'Sourcing', 'Awarded', 'Ordered', 'Completed'].indexOf(r.status) >= 0,
      !!cmp && ['Open'].indexOf(cmp.status) < 0,
      !!memo && memo.status === 'Approved',
      pos.some(p => p.status !== 'Draft'),
      !!delivered, !!paid
    ];
    let cur = done.indexOf(false); if (cur < 0) cur = done.length;
    return { cmp, memo, pos, cur };
  }

  function renderDetail(el, r) {
    const c = caseOf(r);
    const est = util.num(r.estimate);
    const route = domain.approvalRoute(est, [{ amount: est }]);
    const st = r.status;
    const acts = ['<a class="btn" href="#/req-form/' + r.id + '" title="The SRHA Purchase Requisition / Justification Form — view, edit and download as PDF">' + ui.icon('file', 'sm') + 'Requisition form</a>'];
    if (st === 'Draft') acts.push('<button class="btn" data-act="edit">' + ui.icon('edit', 'sm') + 'Edit</button>', '<button class="btn primary" data-act="submit">' + ui.icon('send', 'sm') + 'Submit</button>');
    if (st === 'Submitted') acts.push('<button class="btn" data-act="edit">' + ui.icon('edit', 'sm') + 'Edit</button>', '<button class="btn danger ghost" data-act="reject">' + ui.icon('x', 'sm') + 'Reject</button>', '<button class="btn success" data-act="approve">' + ui.icon('check', 'sm') + 'Approve</button>');
    if (st === 'Rejected') acts.push('<button class="btn" data-act="edit">' + ui.icon('edit', 'sm') + 'Revise &amp; resubmit</button>');
    if (c.cmp) acts.push('<a class="btn primary" href="#/sourcing/' + c.cmp.id + '">' + ui.icon('scale', 'sm') + 'Open price comparison</a>');
    else if (['Approved', 'Submitted'].indexOf(st) >= 0) acts.push('<button class="btn ' + (st === 'Approved' ? 'primary' : '') + '" data-act="compare">' + ui.icon('scale', 'sm') + 'Start price comparison</button>');
    acts.push('<button class="btn icon" data-act="more" title="More actions">' + ui.icon('more') + '</button>');

    el.innerHTML = ui.pageHead({
      title: numOf(r) + ' · ' + (r.title || 'Requisition'), back: { label: 'Requisitions', href: '#/requisitions' },
      badge: ui.badge(st) + (r.priority === 'Emergency' ? ' ' + ui.badge('Emergency') : ''),
      sub: esc(r.department || 'No department') + ' · requested by ' + esc(r.requestedBy || '—') + ' · ' + esc(util.date(r.date)),
      actions: acts.join('')
    }) +
      (st === 'Rejected' && r.decision ? '<div class="alert danger mb-3">' + ui.icon('alert') + '<div><div class="t">Rejected by ' + esc(r.decision.by) + ' on ' + esc(util.date(r.decision.date)) + '</div>' + esc(r.decision.notes || '') + '</div></div>' : '') +
      '<div class="card mb-3"><div class="card-b">' + ui.stepper(['Requisition', 'Price comparison', 'Approval memo', 'Purchase order', 'Delivered', 'Paid'], c.cur) + '</div></div>' +
      '<div class="grid side"><div class="stack">' +
      '<div class="card"><div class="card-h"><h3>Items</h3><span class="muted small">' + (r.items || []).length + ' ' + util.plural((r.items || []).length, 'line') + '</span></div><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Description</th><th>Unit</th><th class="num">Qty</th><th class="num">Est. unit price</th><th class="num">Line total</th></tr></thead><tbody>' +
      ((r.items || []).length ? r.items.map((i, k) => '<tr><td class="muted">' + (k + 1) + '</td><td><div class="t-title">' + esc(i.description) + '</div>' + (i.spec ? '<div class="t-sub">' + esc(i.spec) + '</div>' : '') + '</td><td>' + esc(i.unit || '') + '</td><td class="num">' + util.int(i.qty) + '</td><td class="num">' + (i.estUnitPrice !== '' && i.estUnitPrice !== undefined ? util.money(i.estUnitPrice) : '—') + '</td><td class="num">' + util.money(util.num(i.qty) * util.num(i.estUnitPrice)) + '</td></tr>').join('')
        : '<tr><td colspan="6">' + ui.empty('list', 'No items', 'Edit the requisition to add items.') + '</td></tr>') +
      '</tbody><tfoot><tr><td colspan="5">Estimated value</td><td class="num">' + util.money(est) + '</td></tr></tfoot></table></div>' +
      (est ? '<div class="card-f" style="justify-content:flex-start"><span class="words">' + esc(domain.amountWords(est)) + '</span></div>' : '') + '</div>' +
      '<div class="card"><div class="card-h"><h3>Details</h3></div><div class="card-b"><dl class="kv">' +
      kv('Department', r.department) + kv('Requested by', r.requestedBy) + kv('Request date', util.dateLong(r.date)) + kv('Needed by', util.dateLong(r.neededBy)) +
      kv('Type', r.type) + kv('PRS category', r.category) + kv('Planned method', r.method || r.legacyMethod) + kv('Budget line', r.budgetLine) +
      kv('Justification', r.justification) + kv('Notes', r.notes) + kv('Created', (r.createdBy ? esc(r.createdBy) + ', ' : '') + util.dateTime(r.createdAt), true) + '</dl></div></div>' +
      '</div><div class="stack">' +
      '<div class="card"><div class="card-h"><h3>Procurement case</h3></div><div class="card-b case-links">' + caseLinks(r, c) + '</div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Approval route</h3><div class="sub">For the estimated value</div></div><span class="badge primary plain">' + esc(route.level) + '</span></div><div class="card-b">' + (est ? ui.routeHtml(route) : '<span class="muted small">No estimate entered.</span>') + '</div></div>' +
      '<div class="card"><div class="card-h"><h3>History</h3></div><div class="card-b"><div class="timeline">' + history(r) + '</div></div></div>' +
      '</div></div>';

    const on = (a, fn) => { const b = el.querySelector('[data-act="' + a + '"]'); if (b) b.onclick = fn; };
    on('edit', () => router.go('requisitions/' + r.id + '/edit'));
    on('submit', () => {
      if (!(r.items || []).length || !r.department || !r.requestedBy) { ui.toast('Complete the department, requisitioner and items first.', 'warning'); router.go('requisitions/' + r.id + '/edit'); return; }
      setStatus(r, 'Submitted', 'Submit Requisition'); ui.toast(numOf(r) + ' submitted');
    });
    on('approve', async () => {
      if (await ui.confirm('Approve <b>' + esc(numOf(r)) + '</b> (' + util.money(est) + ') so sourcing can begin?', { ok: 'Approve' })) {
        store.upsert('requisitions', { id: r.id, status: 'Approved', decision: { status: 'Approved', by: domain.officer().name, date: util.today(), notes: '' } });
        Proc.audit('Approve Requisition', numOf(r) + ' approved', r.id); ui.toast(numOf(r) + ' approved'); router.refresh();
      }
    });
    on('reject', async () => {
      const v = await ui.form('Reject ' + numOf(r), [{ name: 'notes', label: 'Reason for rejection', type: 'textarea', required: true }], { ok: 'Reject requisition' });
      if (!v) return;
      store.upsert('requisitions', { id: r.id, status: 'Rejected', decision: { status: 'Rejected', by: domain.officer().name, date: util.today(), notes: v.notes } });
      Proc.audit('Reject Requisition', numOf(r) + ': ' + v.notes, r.id); ui.toast(numOf(r) + ' rejected', 'info'); router.refresh();
    });
    on('compare', () => startComparison(r));
    on('more', e => {
      const items = [{ label: 'Duplicate requisition', icon: 'copy', onClick: () => duplicate(r) }];
      if (st !== 'Draft' && FINAL.indexOf(st) < 0) items.push({ label: 'Edit details', icon: 'edit', onClick: () => router.go('requisitions/' + r.id + '/edit') });
      if (c.cmp) items.push({ label: 'Open price comparison', icon: 'scale', onClick: () => router.go('sourcing/' + c.cmp.id) });
      if (FINAL.indexOf(st) < 0 && st !== 'Draft') items.push({ sep: true }, { label: 'Cancel requisition', icon: 'x', danger: true, onClick: () => cancel(r) });
      if (st === 'Draft' || st === 'Cancelled' || st === 'Rejected') items.push({ sep: true }, { label: 'Delete', icon: 'trash', danger: true, onClick: () => del(r, c) });
      ui.menu(e.currentTarget, items);
    });
  }

  function kv(k, v, raw) { return v ? '<dt>' + esc(k) + '</dt><dd>' + (raw ? v : esc(v)) + '</dd>' : ''; }

  function caseLinks(r, c) {
    const out = [];
    const link = (icon, title, sub, href, badge) => '<div class="lk"><div class="ic">' + ui.icon(icon, 'sm') + '</div><div style="flex:1;min-width:0"><div class="strong truncate">' + (href ? '<a href="' + href + '">' + esc(title) + '</a>' : esc(title)) + '</div><div class="small muted truncate">' + sub + '</div></div>' + (badge || '') + '</div>';
    if (c.cmp) {
      const res = domain.computeComparison(c.cmp);
      out.push(link('scale', c.cmp.ref || 'Price comparison', (c.cmp.suppliers || []).length + ' suppliers · award ' + util.money(res.awardTotal), '#/sourcing/' + c.cmp.id, ui.badge(c.cmp.status)));
    } else out.push(link('scale', 'Price comparison', 'Not started', '', ''));
    if (c.memo) out.push(link('stamp', c.memo.ref || 'Approval memo', util.money(util.sum(c.memo.awards || [], a => a.amount)), '#/memos/' + c.memo.id, ui.badge(c.memo.status)));
    else out.push(link('stamp', 'Approval memo', 'Not prepared', '', ''));
    if (c.pos.length) c.pos.forEach(p => out.push(link('cart', 'PO ' + (p.poNumber || '(draft)') + ' · ' + (p.supplierName || ''), util.money(p.total), '#/orders/' + p.id, ui.badge(p.status))));
    else out.push(link('cart', 'Purchase orders', 'None yet', '', ''));
    return out.join('');
  }

  function history(r) {
    const ev = store.db.auditLog.filter(a => a.ref === r.id).slice(0, 12);
    const items = ev.length ? ev : [{ timestamp: r.createdAt, action: 'Created', user: r.createdBy || '', details: '' }];
    return items.map(a => '<div class="tl-item"><div class="strong">' + esc(a.action) + '</div><div class="small">' + esc(a.details || '') + '</div><div class="when">' + esc(a.user || '') + ' · ' + util.dateTime(a.timestamp) + '</div></div>').join('');
  }

  function setStatus(r, status, action) {
    const patch = { id: r.id, status }; if (status === 'Submitted') patch.submittedAt = new Date().toISOString();
    store.upsert('requisitions', patch); Proc.audit(action, numOf(r) + ' → ' + status, r.id); router.refresh();
  }
  async function cancel(r) {
    const v = await ui.form('Cancel ' + numOf(r), [{ name: 'reason', label: 'Reason', type: 'textarea', required: true }], { ok: 'Cancel requisition' });
    if (!v) return;
    store.upsert('requisitions', { id: r.id, status: 'Cancelled', cancelReason: v.reason });
    Proc.audit('Cancel Requisition', numOf(r) + ': ' + v.reason, r.id); ui.toast(numOf(r) + ' cancelled', 'info'); router.refresh();
  }
  async function del(r, c) {
    if (c.cmp) { ui.toast('This requisition has a price comparison. Cancel it instead of deleting.', 'warning'); return; }
    if (!(await ui.confirm('Delete <b>' + esc(numOf(r)) + '</b>? This cannot be undone.', { danger: true, ok: 'Delete' }))) return;
    store.remove('requisitions', r.id); Proc.audit('Delete Requisition', numOf(r), r.id); ui.toast(numOf(r) + ' deleted'); router.go('requisitions');
  }
  function duplicate(r) {
    const copy = util.clone(r);
    ['id', 'number', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'comparisonId', 'decision', 'submittedAt', 'cancelReason', '_deleted'].forEach(k => delete copy[k]);
    copy.items = (copy.items || []).map(i => Object.assign(i, { id: util.uid('L') }));
    Object.assign(copy, { date: util.today(), status: 'Draft', number: 'REQ-' + store.next('req'), title: (r.title || '') + ' (copy)' });
    const s = store.upsert('requisitions', copy);
    Proc.audit('Duplicate Requisition', numOf(r) + ' → ' + s.number, s.id); ui.toast('Created ' + s.number); router.go('requisitions/' + s.id + '/edit');
  }

  /** Requisition → price comparison prefilled with its items (hand-off 1). */
  function startComparison(r) {
    const method = r.method || 'Restricted Bidding (RB)';
    const cmp = store.upsert('comparisons', {
      number: store.next('cmp'), ref: domain.suggestRef(r.title, method, util.today()), subject: r.title || '', date: util.today(), closingDate: '',
      requisitionId: r.id, department: r.department || '', method, viaGojep: true, invited: 0, type: r.type || 'Goods', category: r.category || '',
      estimate: util.num(r.estimate), items: (r.items || []).map(i => ({ id: util.uid('L'), description: i.description, unit: i.unit || '', qty: util.num(i.qty), spec: i.spec || '' })),
      suppliers: [], prices: {}, awardMode: 'item', awards: {}, evaluationNote: '', status: 'Open'
    });
    store.upsert('requisitions', { id: r.id, status: 'Sourcing', comparisonId: cmp.id });
    Proc.audit('Start Price Comparison', numOf(r) + ' → ' + (cmp.ref || cmp.id), r.id);
    ui.toast('Price comparison started — add suppliers and their prices');
    router.go('sourcing/' + cmp.id);
  }
  Proc.requisitions = { startComparison, caseOf };
})();
