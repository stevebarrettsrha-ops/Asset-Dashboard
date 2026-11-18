/* General Stores — Chemicals & Toiletries.
   #/chemicals   Chemicals come in drums and go out to the wards in gallons:
                 · Receive drums  — "2 drums × 55 gal" posts 110 gal to the bin card (cost per drum → cost per gallon)
                 · Issue to ward  — gallons (or the item's own unit for bags, mops, tins…) on a Stores Issue Voucher
                 Level of every chemical (gallons and drums), what each ward used this month, and every movement. */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc;
  const C = Proc.storesC;
  const CAT = 'Chemicals & Toiletries';
  const CSS = '.ch-lvl{height:6px;border-radius:99px;background:var(--surface-3);overflow:hidden;margin-top:6px;max-width:160px}.ch-lvl i{display:block;height:100%;border-radius:99px;background:var(--primary)}' +
    '.ch-lvl.low i{background:var(--warning)}.ch-lvl.out i{background:var(--danger)}.ch-drum{font-size:12px;color:var(--text-3)}.ch-quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.ch-quick button{padding:3px 10px;font-size:12px}' +
    '.ch-lines td{vertical-align:middle}.ch-lines input.input,.ch-lines select.input{height:34px}.ch-in{color:var(--success);font-weight:600}.ch-out{color:var(--warning);font-weight:600}' +
    '.ch-gal{font-variant-numeric:tabular-nums}';

  const isChem = i => i && i.status !== 'Inactive' && (i.chemical || i.category === CAT);
  const chems = () => store.list('stockItems').filter(isChem).sort((a, b) => a.name.localeCompare(b.name));
  const isGal = i => /^gal/i.test(i.unit || '');
  const drumOf = i => util.num(i.drumSize) || (isGal(i) ? 55 : 0);
  const qtyTxt = (i, q) => util.round2(q) + ' ' + (isGal(i) ? 'gal' : (i.unit || ''));
  const drumsTxt = (i, q) => { const d = drumOf(i); if (!isGal(i) || !d || !q) return ''; const n = q / d; return '≈ ' + (Math.round(n * 10) / 10) + ' ' + util.plural(Math.round(n * 10) / 10, 'drum') + ' of ' + d + ' gal'; };
  const month = () => util.today().slice(0, 7);
  const movesOf = ids => store.filter('stockMoves', m => ids.has(m.itemId));
  function levelBar(i) {
    const on = util.num(i.onHand), ro = util.num(i.reorderLevel), cap = Math.max(util.num(i.maxLevel), ro * 3, drumOf(i) * 2, on, 1);
    const cls = on <= 0 ? 'out' : ro && on <= ro ? 'low' : '';
    return '<div class="ch-lvl ' + cls + '"><i style="width:' + Math.min(100, on / cap * 100) + '%"></i></div>';
  }

  /* ================================================================ PAGE */
  function render(el) {
    C.css('css-chem', CSS);
    const items = chems(); const ids = new Set(items.map(i => i.id));
    const moves = movesOf(ids);
    const mk = month();
    const issuedM = moves.filter(m => m.type === 'Issue' && util.monthKey(m.date) === mk);
    const recvM = moves.filter(m => m.type === 'Receipt' && util.monthKey(m.date) === mk);
    const gal = items.filter(isGal);
    const galOnHand = util.sum(gal, i => util.num(i.onHand));
    const galIssued = Math.abs(util.sum(issuedM.filter(m => /^gal/i.test(m.unit || '')), m => m.qty));
    const wards = new Set(issuedM.map(m => m.department).filter(Boolean));
    const low = items.filter(i => util.num(i.reorderLevel) > 0 && util.num(i.onHand) <= util.num(i.reorderLevel));
    const used = id => Math.abs(util.sum(issuedM.filter(m => m.itemId === id), m => m.qty));
    el.innerHTML = ui.pageHead({ title: 'Chemicals & Toiletries', sub: 'Drums received into store and issued to the wards in gallons — with the level of every chemical and what each ward uses.',
      actions: '<button class="btn" data-a="levels">' + ui.icon('edit', 'sm') + 'Reorder levels</button><button class="btn" data-a="issue">' + ui.icon('arrow-up-right', 'sm') + 'Issue to ward</button><button class="btn primary" data-a="receive">' + ui.icon('truck', 'sm') + 'Receive drums</button>' }) +
      (C.navTabs ? C.navTabs('chemicals') : '') +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Gallons in store', icon: 'box', value: util.int(galOnHand) + ' gal', meta: drumsTxt({ unit: 'gal', drumSize: 55 }, galOnHand) || 'Across ' + gal.length + ' gallon chemicals' }) +
      ui.kpi({ label: 'Issued this month', icon: 'arrow-up-right', value: util.int(galIssued) + ' gal', meta: util.int(issuedM.length) + ' ' + util.plural(issuedM.length, 'issue') + ' to ' + wards.size + ' ' + util.plural(wards.size, 'ward') }) +
      ui.kpi({ label: 'Received this month', icon: 'truck', value: util.int(Math.abs(util.sum(recvM.filter(m => /^gal/i.test(m.unit || '')), m => m.qty))) + ' gal', meta: util.int(recvM.length) + ' ' + util.plural(recvM.length, 'delivery', 'deliveries') }) +
      ui.kpi({ label: 'Low or out', icon: 'alert', tone: low.length ? 'warn' : 'ok', value: util.int(low.length), meta: low.length ? low.slice(0, 2).map(i => i.name).join(', ') : 'Set reorder levels to be warned', href: '#/reorder' }) + '</div>' +
      '<div class="sd-grid" style="display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:16px;align-items:start">' +
      '<div class="card"><div class="card-h"><div><h3>Chemicals in store</h3><div class="sub">' + items.length + ' items · gallon chemicals show drums on hand</div></div></div><div id="chT"></div></div>' +
      '<div class="stack"><div class="card"><div class="card-h"><div><h3>Issued by ward — ' + util.monthLabel(mk) + '</h3><div class="sub">Gallons</div></div></div><div class="card-b" id="chWard"></div></div></div></div>' +
      '<div class="card mt-3"><div class="card-h"><div><h3>Deliveries and issues</h3><div class="sub">Every drum received and every gallon issued</div></div><button class="btn sm" data-a="xls">' + ui.icon('download', 'sm') + 'Excel</button></div><div id="chM"></div></div>';
    el.querySelector('.sd-grid').style.gridTemplateColumns = window.innerWidth < 1180 ? 'minmax(0,1fr)' : '';
    ui.table(el.querySelector('#chT'), {
      rows: items, pageSize: 25, placeholder: 'Search chemicals…', initialSort: { key: 'onHand', dir: -1 },
      search: i => [i.name, i.code, (i.aliases || []).join(' ')].join(' '),
      filters: [{ key: 'u', label: 'All units', options: [{ value: 'gal', label: 'Gallon chemicals' }, { value: 'other', label: 'Bags, mops, tins…' }], test: (i, v) => v === 'gal' ? isGal(i) : !isGal(i) },
        { key: 'st', label: 'Any level', options: ['Out of stock', 'Low', 'In stock'], test: (i, v) => { const on = util.num(i.onHand), ro = util.num(i.reorderLevel); return v === 'Out of stock' ? on <= 0 : v === 'Low' ? on > 0 && ro && on <= ro : on > 0 && (!ro || on > ro); } }],
      columns: [
        { key: 'name', label: 'Chemical', render: i => '<a class="t-title" href="#/inventory/' + esc(i.id) + '">' + esc(i.name) + '</a><div class="t-sub">' + esc(i.code) + (i.contract ? ' · contract' : '') + '</div>' },
        { key: 'onHand', label: 'In store', cls: 'num', render: i => '<span class="strong ch-gal">' + esc(qtyTxt(i, util.num(i.onHand))) + '</span><div class="ch-drum">' + esc(drumsTxt(i, util.num(i.onHand))) + '</div>' + levelBar(i), sort: i => util.num(i.onHand) },
        { key: 'ro', label: 'Reorder at', cls: 'num', render: i => util.num(i.reorderLevel) ? esc(qtyTxt(i, util.num(i.reorderLevel))) : '<span class="muted">—</span>', sort: i => util.num(i.reorderLevel) },
        { key: 'used', label: 'Used this month', cls: 'num', render: i => used(i.id) ? esc(qtyTxt(i, used(i.id))) : '<span class="muted">—</span>', sort: i => used(i.id) },
        { key: 'x', label: '', sort: false, cls: 'actions', render: i => '<button class="btn xs" data-rcv="' + i.id + '" title="Receive">' + ui.icon('truck', 'sm') + '</button> <button class="btn xs primary" data-iss="' + i.id + '"' + (util.num(i.onHand) > 0 ? '' : ' disabled') + ' title="Issue to ward">' + ui.icon('arrow-up-right', 'sm') + 'Issue</button>' }
      ],
      bind: tb => { tb.querySelectorAll('[data-rcv]').forEach(b => b.onclick = e => { e.stopPropagation(); receive(b.dataset.rcv); }); tb.querySelectorAll('[data-iss]').forEach(b => b.onclick = e => { e.stopPropagation(); issue(b.dataset.iss); }); },
      empty: ui.empty('box', 'No chemicals yet', 'Chemicals & Toiletries items appear here.')
    });
    // by ward
    const byW = util.groupBy(issuedM.filter(m => /^gal/i.test(m.unit || '')), m => m.department || 'Unspecified');
    const wd = Object.keys(byW).map(k => ({ label: k, value: Math.abs(util.sum(byW[k], m => m.qty)) })).sort((a, b) => b.value - a.value).slice(0, 10);
    el.querySelector('#chWard').innerHTML = wd.length ? ui.hbars(wd, { fmt: v => util.round2(v) + ' gal' }) : ui.empty('chart', 'Nothing issued yet this month');
    // movements
    const mv = moves.filter(m => m.type === 'Receipt' || m.type === 'Issue' || m.type === 'Opening').sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const t = ui.table(el.querySelector('#chM'), {
      rows: mv, pageSize: 20, placeholder: 'Search item, ward, reference…', initialSort: { key: 'date', dir: -1 },
      search: m => [m.itemName, m.department, m.ref, m.notes, m.by].join(' '),
      filters: [{ key: 'type', label: 'Deliveries & issues', options: [{ value: 'Receipt', label: 'Deliveries' }, { value: 'Issue', label: 'Issues' }] },
        { key: 'department', label: 'All wards', options: Array.from(new Set(mv.map(m => m.department).filter(Boolean))).sort() }],
      onRow: m => { if (m.issueId) router.go('issues/' + m.issueId); else router.go('inventory/' + m.itemId); },
      columns: [
        { key: 'date', label: 'Date', render: m => '<span class="nowrap">' + util.date(m.date) + '</span><div class="t-sub">' + esc(m.by || '') + '</div>' },
        { key: 'type', label: '', render: m => m.qty > 0 ? '<span class="ch-in">' + ui.icon('truck', 'sm') + ' In</span>' : '<span class="ch-out">' + ui.icon('arrow-up-right', 'sm') + ' Out</span>' },
        { key: 'itemName', label: 'Chemical', render: m => '<div class="t-title">' + esc(m.itemName) + '</div><div class="t-sub">' + esc(m.notes || m.ref || '') + '</div>' },
        { key: 'department', label: 'Ward / supplier', render: m => esc(m.department || (m.supplierId ? domain.supplierName(m.supplierId) : '') || '—') },
        { key: 'qty', label: 'Quantity', cls: 'num', render: m => '<span class="ch-gal">' + util.round2(Math.abs(m.qty)) + ' ' + esc(/^gal/i.test(m.unit || '') ? 'gal' : m.unit || '') + '</span>', sort: m => Math.abs(m.qty) },
        { key: 'balanceAfter', label: 'Balance after', cls: 'num', render: m => '<span class="ch-gal">' + util.round2(m.balanceAfter) + '</span>' }
      ],
      empty: ui.empty('truck', 'No deliveries or issues yet', 'Receive a drum, then issue gallons to the wards.')
    });
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => ({
      receive: () => receive(), issue: () => issue(), levels: () => router.go('levels?cat=' + encodeURIComponent(CAT)),
      xls: () => C.excel([{ name: 'Chemicals', cols: [12, 10, 36, 26, 10, 8, 12, 30], rows: t.visible().map(m => ({ Date: m.date, Type: m.qty > 0 ? 'Delivery' : 'Issue', Chemical: m.itemName, 'Ward / supplier': m.department || (m.supplierId ? domain.supplierName(m.supplierId) : ''), Quantity: Math.abs(m.qty), Unit: m.unit, 'Balance after': m.balanceAfter, Reference: m.ref || m.notes || '' })) }], 'Chemicals ' + util.today() + '.xlsx')
    })[b.dataset.a]());
  }

  /* ---------------------------------------------------------- receive drums */
  function receive(itemId) {
    const items = chems(); if (!items.length) return ui.toast('No chemicals to receive.', 'warning');
    const sups = store.list('suppliers').filter(s => s.status !== 'Inactive').map(s => s.name).sort();
    ui.modal({
      title: 'Receive chemicals', size: 'md',
      body: '<div class="form-grid">' +
        '<div class="field s12"><label>Chemical<span class="req">*</span></label><select name="item">' + items.map(i => '<option value="' + i.id + '"' + (i.id === itemId ? ' selected' : '') + '>' + esc(i.name + ' (' + (isGal(i) ? 'gal' : i.unit) + ')') + '</option>').join('') + '</select></div>' +
        '<div class="field s4" data-g><label>Drums</label><input name="drums" type="number" min="0" step="any" value="1"></div>' +
        '<div class="field s4" data-g><label>Gallons per drum</label><input name="drumSize" type="number" min="1" step="any"></div>' +
        '<div class="field s4"><label data-ql>Total gallons</label><input name="qty" type="number" min="0" step="any"></div>' +
        '<div class="field s6"><label>Date received</label><input name="date" type="date" value="' + util.today() + '"></div>' +
        '<div class="field s6"><label>Supplier</label><input name="supplier" list="ch-sups" placeholder="Supplier"><datalist id="ch-sups">' + sups.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist></div>' +
        '<div class="field s6"><label data-cl>Cost per drum ($)</label><input name="cost" type="number" min="0" step="any" placeholder="Optional"></div>' +
        '<div class="field s6"><label>PO / delivery note No.</label><input name="ref" placeholder="e.g. PO 1121515"></div>' +
        '<div class="field s12"><label>Batch / lot</label><input name="batch" placeholder="Optional"></div>' +
        '<div class="field s12 small muted" data-sum></div></div>',
      onOpen: m => {
        const sel = m.querySelector('[name=item]'), drums = m.querySelector('[name=drums]'), ds = m.querySelector('[name=drumSize]'), q = m.querySelector('[name=qty]');
        const sync = (fromQty) => {
          const it = store.get('stockItems', sel.value); const g = isGal(it);
          m.querySelectorAll('[data-g]').forEach(f => { f.hidden = !g; });
          m.querySelector('[data-ql]').textContent = g ? 'Total gallons' : 'Quantity (' + (it.unit || 'each') + ')';
          m.querySelector('[data-cl]').textContent = g ? 'Cost per drum ($)' : 'Cost per ' + (it.unit || 'unit') + ' ($)';
          if (g && !fromQty) q.value = util.round2(util.num(drums.value) * util.num(ds.value));
          m.querySelector('[data-sum]').textContent = it.name + ': ' + qtyTxt(it, util.num(it.onHand)) + ' in store now → ' + qtyTxt(it, util.num(it.onHand) + util.num(q.value)) + ' after this delivery.';
        };
        sel.onchange = () => { const it = store.get('stockItems', sel.value); ds.value = drumOf(it) || 55; drums.value = 1; q.value = isGal(it) ? '' : 1; sync(); };
        drums.oninput = ds.oninput = () => sync(); q.oninput = () => sync(true);
        ds.value = drumOf(store.get('stockItems', sel.value)) || 55; sync();
        setTimeout(() => drums.focus(), 30);
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Receive into store', kind: 'primary', icon: 'check', onClick: (close, m) => {
        const f = ui.formData(m.querySelector('.form-grid')); const it = store.get('stockItems', f.item); const g = isGal(it);
        const qty = util.num(f.qty); if (!(qty > 0)) { ui.toast('Enter how much was received.', 'warning'); return false; }
        const size = util.num(f.drumSize) || drumOf(it) || 55;
        const unitCost = util.num(f.cost) ? util.round2(g ? util.num(f.cost) / size : util.num(f.cost)) : undefined;
        const sup = f.supplier ? domain.ensureSupplier(f.supplier.trim()) : null;
        const drums = util.num(f.drums);
        try {
          domain.postStock({ itemId: it.id, type: 'Receipt', qty, unitCost, date: f.date || util.today(), supplierId: sup ? sup.id : '', batchNo: f.batch || '', ref: f.ref || '',
            notes: (g && drums ? drums + ' ' + util.plural(drums, 'drum') + ' × ' + size + ' gal' : '') + (f.ref ? (g && drums ? ' · ' : '') + f.ref : '') });
        } catch (e) { ui.toast(e.message, 'error'); return false; }
        if (g && size !== util.num(it.drumSize)) store.upsert('stockItems', { id: it.id, drumSize: size }, { silent: true });
        Proc.audit('Chemical Delivery', it.name + ' — ' + qtyTxt(it, qty) + (g && drums ? ' (' + drums + ' × ' + size + ' gal)' : '') + (sup ? ' from ' + sup.name : ''), it.id);
        ui.toast(qtyTxt(it, qty) + ' of ' + it.name + ' received'); setTimeout(() => router.refresh(), 0); return true;
      } }]
    });
  }

  /* ---------------------------------------------------------- issue to ward */
  function issue(itemId) {
    const items = chems().filter(i => util.num(i.onHand) > 0);
    if (!items.length) return ui.toast('Nothing in store to issue — receive a drum first.', 'warning');
    const lines = [{ itemId: itemId && items.some(i => i.id === itemId) ? itemId : items[0].id, qty: '' }];
    const off = domain.officer();
    ui.modal({
      title: 'Issue chemicals to a ward', size: 'lg',
      body: '<div class="form-grid"><div class="field s6"><label>Ward / department<span class="req">*</span></label><select name="department" id="chDept"></select></div>' +
        '<div class="field s3"><label>Received by<span class="req">*</span></label><input name="requestedBy" placeholder="Name"></div>' +
        '<div class="field s3"><label>Date</label><input type="date" name="date" value="' + util.today() + '"></div></div>' +
        '<div class="table-wrap mt-2"><table class="table compact ch-lines"><thead><tr><th>Chemical</th><th class="num">In store</th><th class="num" style="width:190px">Issue</th><th></th></tr></thead><tbody id="chL"></tbody></table></div>' +
        '<button class="btn sm mt-2" data-add>' + ui.icon('plus', 'sm') + 'Another chemical</button>' +
        '<label class="check small mt-2" style="display:flex"><input type="checkbox" name="print" checked> Print the issue voucher</label>',
      onOpen: m => {
        C.deptSelect(m.querySelector('#chDept'), '');
        const tb = m.querySelector('#chL');
        const draw = () => {
          tb.innerHTML = lines.map((l, k) => { const it = store.get('stockItems', l.itemId);
            return '<tr data-k="' + k + '"><td><select class="input" data-f="itemId">' + items.map(i => '<option value="' + i.id + '"' + (i.id === l.itemId ? ' selected' : '') + '>' + esc(i.name) + '</option>').join('') + '</select></td>' +
              '<td class="num ch-gal">' + esc(qtyTxt(it, util.num(it.onHand))) + '</td>' +
              '<td class="num"><div class="row" style="justify-content:flex-end;gap:6px"><input class="input num" style="width:96px" type="number" min="0" step="any" data-f="qty" value="' + esc(l.qty) + '"><span class="muted small">' + esc(isGal(it) ? 'gal' : it.unit || '') + '</span></div>' +
              (isGal(it) ? '<div class="ch-quick" style="justify-content:flex-end">' + [1, 2, 5, 10].map(n => '<button class="btn xs" data-q="' + n + '">' + n + ' gal</button>').join('') + '</div>' : '') + '</td>' +
              '<td class="actions">' + (lines.length > 1 ? '<button class="btn xs ghost icon" data-rm>' + ui.icon('x', 'sm') + '</button>' : '') + '</td></tr>'; }).join('');
          tb.querySelectorAll('[data-f]').forEach(inp => inp.oninput = inp.onchange = () => { const l = lines[+inp.closest('tr').dataset.k]; l[inp.dataset.f] = inp.dataset.f === 'qty' ? inp.value : inp.value; if (inp.dataset.f === 'itemId') draw(); });
          tb.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { lines[+b.closest('tr').dataset.k].qty = b.dataset.q; draw(); });
          tb.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { lines.splice(+b.closest('tr').dataset.k, 1); draw(); });
        };
        m.querySelector('[data-add]').onclick = () => { const used = new Set(lines.map(l => l.itemId)); const nx = items.find(i => !used.has(i.id)) || items[0]; lines.push({ itemId: nx.id, qty: '' }); draw(); };
        draw();
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Issue to ward', kind: 'primary', icon: 'arrow-up-right', onClick: (close, m) => {
        const f = ui.formData(m.querySelector('.form-grid')); const print = m.querySelector('[name=print]').checked;
        if (!f.department) { ui.toast('Choose the ward or department.', 'warning'); return false; }
        if (!f.requestedBy) { ui.toast('Enter who received the chemicals.', 'warning'); return false; }
        const ls = lines.filter(l => util.num(l.qty) > 0);
        if (!ls.length) { ui.toast('Enter how much to issue.', 'warning'); return false; }
        for (const l of ls) { const it = store.get('stockItems', l.itemId); if (util.num(l.qty) > util.num(it.onHand)) { ui.toast('Only ' + qtyTxt(it, util.num(it.onHand)) + ' of ' + it.name + ' in store.', 'warning'); return false; } }
        const date = f.date || util.today();
        const siv = store.upsert('stockIssues', { number: 'SIV-' + String(store.next('siv')).padStart(4, '0'), date, department: f.department, requestedBy: f.requestedBy, priority: 'Normal', notes: 'Chemicals issued to the ward', status: 'Issued', chemical: true,
          approvedBy: off.name, approvedAt: date, issuedBy: off.name, issuedAt: date,
          lines: ls.map(l => { const it = store.get('stockItems', l.itemId); return { itemId: it.id, itemCode: it.code, itemName: it.name, unit: isGal(it) ? 'gal' : it.unit, qtyRequested: util.num(l.qty), qtyApproved: util.num(l.qty), qtyIssued: util.num(l.qty), batches: [] }; }) });
        try {
          const lns = siv.lines.map(ln => { const mv = domain.postStock({ itemId: ln.itemId, type: 'Issue', qty: -util.num(ln.qtyIssued), date, department: f.department, issueId: siv.id, ref: siv.number, notes: 'To ' + f.department + ' · received by ' + f.requestedBy }, { silent: true }); return Object.assign({}, ln, { batches: mv.batches || [] }); });
          store.upsert('stockIssues', { id: siv.id, lines: lns });
        } catch (e) { store.remove('stockIssues', siv.id); ui.toast(e.message, 'error'); return false; }
        Proc.audit('Chemical Issue', siv.number + ' — ' + f.department + ': ' + ls.map(l => { const it = store.get('stockItems', l.itemId); return qtyTxt(it, util.num(l.qty)) + ' ' + it.name; }).join(', '), siv.id);
        ui.toast(siv.number + ' — chemicals issued to ' + f.department);
        if (print && C.printSIV) C.printSIV(siv.id);
        setTimeout(() => router.refresh(), 0); return true;
      } }]
    });
  }

  C.receiveChemical = receive; C.issueChemical = issue;
  Proc.page({ id: 'chemicals', title: 'Chemicals', icon: 'drop', section: 'Workflow', order: 25, render });
  Proc.quickCreate.push({ label: 'Chemicals — drum or issue', desc: 'Receive drums, issue gallons to a ward', icon: 'drop', order: 26, onClick: () => router.go('chemicals') });
})();
