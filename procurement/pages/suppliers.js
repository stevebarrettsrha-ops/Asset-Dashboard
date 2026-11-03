/* ==========================================================================
   Suppliers — directory, supplier file (profile), business details form,
   duplicate finder and merge.
   Routes: #/suppliers · #/suppliers/new · #/suppliers/<id>[/<tab>] · #/suppliers/<id>/edit
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, K, files, router } = Proc;
  const esc = util.esc;

  if (!document.getElementById('css-suppliers')) document.head.insertAdjacentHTML('beforeend', '<style id="css-suppliers">' +
    '.sp-head{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}' +
    '.sp-head .avatar.lg{background:linear-gradient(135deg,var(--primary),var(--primary-700));}' +
    '.sp-head h1{font-size:22px;font-weight:700;letter-spacing:-.015em;line-height:1.25}' +
    '.sp-head .sp-contact{display:flex;gap:6px 18px;flex-wrap:wrap;color:var(--text-2);font-size:13px;margin-top:8px}' +
    '.sp-head .sp-contact span,.sp-head .sp-contact a{display:inline-flex;align-items:center;gap:6px}' +
    '.sp-head .sp-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}' +
    '.sp-stars{display:inline-flex;gap:1px;vertical-align:middle}.sp-stars button{border:0;background:none;padding:0 1px;cursor:pointer;color:var(--border-strong);line-height:1}' +
    '.sp-stars button.on{color:#f5a524}.sp-stars button svg{width:16px;height:16px}.sp-stars button.on svg{fill:#f5a524}' +
    '.sp-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin:18px 0}' +
    '@media(max-width:1180px){.sp-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:640px){.sp-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '.sp-kpis .kpi .val{font-size:20px}' +
    '.sp-info + .sp-info{margin-top:18px;padding-top:16px;border-top:1px dashed var(--border)}' +
    '.sp-docgrp + .sp-docgrp{margin-top:18px}.sp-docgrp h4{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px;display:flex;gap:8px;align-items:center}' +
    '.doc .sp-lnk{font-size:12px}.sp-cats{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.sp-cats .chip button{border:0;background:none;cursor:pointer;color:var(--text-3);padding:0;display:inline-flex}' +
    '.sp-dup{border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:10px}.sp-dup label{display:flex;gap:10px;align-items:center;padding:5px 0;cursor:pointer}' +
    '.sp-alerts .alert{margin-bottom:8px}.sp-form .card{margin-bottom:16px}.sp-form .card + .card{margin-top:0}' +
    '.sp-up{color:var(--danger)}.sp-down{color:var(--success)}' +
    '.sp-itemline{font-size:12px;color:var(--text-3);margin-top:2px;white-space:normal;max-width:520px}' +
    '</style>');

  /* ------------------------------------------------------------ helpers */
  const fmtTRN = function (v) {
    const d = String(v || '').replace(/\D/g, '');
    return d.length === 9 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : String(v || '').trim();
  };
  const short = n => (String(n || '').length > 34 ? String(n).slice(0, 32) + '…' : String(n || ''));
  const validTRN = v => !v || String(v).replace(/\D/g, '').length === 9;
  const validEmail = v => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
  const poHref = p => '#/orders/' + encodeURIComponent(p.id);
  const poLabel = p => (p.poNumber ? 'PO ' + p.poNumber : 'Draft PO');
  const stars = (n, editable) => '<span class="sp-stars" ' + (editable ? 'data-rate' : '') + '>' + [1, 2, 3, 4, 5].map(i => '<button type="button" data-v="' + i + '" class="' + (i <= (n || 0) ? 'on' : '') + '" title="' + i + ' star' + (i > 1 ? 's' : '') + '"' + (editable ? '' : ' tabindex="-1" disabled') + '>' + ui.icon('star') + '</button>').join('') + '</span>';

  function tccBadge(s) {
    const st = domain.expiryState(s.tccExpiry);
    if (!st) return '<span class="badge plain">Not on file</span>';
    return '<span class="badge ' + st.tone + '" title="TCC expires ' + esc(util.date(s.tccExpiry)) + '">' + esc(st.label) + '</span>';
  }

  /** One pass over POs / invoices / docs → per-supplier figures (faster than supplierSummary per row). */
  function directoryStats() {
    const fy = util.fiscalYear(util.today());
    const m = {};
    const get = id => (m[id] = m[id] || { count: 0, spend: 0, fySpend: 0, last: '', outstanding: 0, docs: 0 });
    store.list('purchaseOrders').forEach(p => {
      if (!p.supplierId || p.status === 'Cancelled') return;
      const s = get(p.supplierId);
      s.count++; s.spend += util.num(p.total);
      if (util.fiscalYear(p.date) === fy) s.fySpend += util.num(p.total);
      if ((p.date || '') > s.last) s.last = p.date || '';
    });
    store.list('invoices').forEach(i => { if (i.supplierId && i.status !== 'Paid') get(i.supplierId).outstanding += util.num(i.total); });
    store.list('documents').forEach(d => { if (d.supplierId) get(d.supplierId).docs++; });
    return { fy, m };
  }

  /** Everything that references a supplier (used for delete / merge). */
  function linkedCounts(sid) {
    return {
      pos: store.filter('purchaseOrders', p => p.supplierId === sid).length,
      invoices: store.filter('invoices', i => i.supplierId === sid).length,
      docs: store.filter('documents', d => d.supplierId === sid).length,
      cmps: store.filter('comparisons', c => (c.suppliers || []).some(s => s.supplierId === sid)).length,
      memos: store.filter('memos', m => (m.bids || []).concat(m.awards || []).some(b => b.supplierId === sid)).length
    };
  }

  /* --------------------------------------------------------------- merge */
  /** Move every record from supplier `fromId` onto `toId`, keep the old name as an alias, delete `fromId`. */
  function mergeSuppliers(fromId, toId) {
    const from = store.get('suppliers', fromId), to = store.get('suppliers', toId);
    if (!from || !to || fromId === toId) return;
    store.batch(() => {
      store.filter('purchaseOrders', p => p.supplierId === fromId).forEach(p => store.upsert('purchaseOrders', { id: p.id, supplierId: toId, supplierName: to.name }, { silent: true }));
      store.filter('invoices', i => i.supplierId === fromId).forEach(i => store.upsert('invoices', { id: i.id, supplierId: toId }, { silent: true }));
      store.filter('documents', d => d.supplierId === fromId).forEach(d => store.upsert('documents', { id: d.id, supplierId: toId }, { silent: true }));
      store.list('comparisons').forEach(c => {
        if (!(c.suppliers || []).some(s => s.supplierId === fromId)) return;
        const hasTo = c.suppliers.some(s => s.supplierId === toId);
        const suppliers = hasTo ? c.suppliers.filter(s => s.supplierId !== fromId) : c.suppliers.map(s => s.supplierId === fromId ? Object.assign({}, s, { supplierId: toId, name: to.name }) : s);
        const prices = {};
        Object.keys(c.prices || {}).forEach(it => {
          prices[it] = Object.assign({}, c.prices[it]);
          if (prices[it][fromId] !== undefined) { if (prices[it][toId] === undefined) prices[it][toId] = prices[it][fromId]; delete prices[it][fromId]; }
        });
        const awards = {};
        Object.keys(c.awards || {}).forEach(it => { awards[it] = c.awards[it] === fromId ? toId : c.awards[it]; });
        store.upsert('comparisons', { id: c.id, suppliers, prices, awards, lotSupplierId: c.lotSupplierId === fromId ? toId : c.lotSupplierId }, { silent: true });
      });
      store.list('memos').forEach(mm => {
        const fix = arr => (arr || []).map(b => b.supplierId === fromId ? Object.assign({}, b, { supplierId: toId, supplier: to.name }) : b);
        if ((mm.bids || []).concat(mm.awards || []).some(b => b.supplierId === fromId)) store.upsert('memos', { id: mm.id, bids: fix(mm.bids), awards: fix(mm.awards) }, { silent: true });
      });
      // Keep the richer record: fill empty fields on the survivor.
      const patch = { id: toId, aliases: Array.from(new Set((to.aliases || []).concat([from.name], from.aliases || []).filter(a => a && a !== to.name))) };
      Object.keys(from).forEach(k => {
        if (['id', 'name', 'aliases', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'].indexOf(k) >= 0) return;
        const v = from[k], cur = to[k];
        if (k === 'categories') { patch.categories = Array.from(new Set((cur || []).concat(v || []))); return; }
        if (k === 'notes' && v && cur && cur !== v) { patch.notes = cur + '\n' + v; return; }
        if ((cur === undefined || cur === null || cur === '' || cur === false) && v) patch[k] = v;
      });
      store.upsert('suppliers', patch, { silent: true });
      store.remove('suppliers', fromId);
    });
    Proc.audit('Merge Suppliers', from.name + ' merged into ' + to.name, toId);
  }

  async function mergeDialog(fromId) {
    const from = store.get('suppliers', fromId);
    const others = store.list('suppliers').filter(s => s.id !== fromId).sort((a, b) => a.name.localeCompare(b.name));
    const v = await ui.form('Merge "' + from.name + '" into another supplier', [
      { name: 'to', label: 'Keep this supplier', type: 'select', options: others.map(s => ({ value: s.id, label: s.name })), placeholder: 'Choose the supplier to keep…', required: true,
        hint: 'All purchase orders, invoices, quotes and documents of <b>' + esc(from.name) + '</b> move to the supplier you choose. The old name is kept as an alias so imports still match.' }
    ], { ok: 'Merge suppliers' });
    if (!v || !v.to) return;
    const to = store.get('suppliers', v.to);
    if (!(await ui.confirm('Merge <b>' + esc(from.name) + '</b> into <b>' + esc(to.name) + '</b>? This cannot be undone.', { ok: 'Merge', danger: true }))) return;
    mergeSuppliers(fromId, v.to);
    ui.toast('Merged into ' + to.name);
    router.go('suppliers/' + v.to);
  }

  /** Levenshtein distance (small strings only). */
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function findDuplicateGroups() {
    const sups = store.list('suppliers');
    const keys = sups.map(s => domain.supplierKey(s.name));
    const parent = sups.map((_, i) => i);
    const root = i => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    for (let i = 0; i < sups.length; i++) {
      for (let j = i + 1; j < sups.length; j++) {
        const a = keys[i], b = keys[j];
        if (!a || !b) continue;
        let same = a === b;
        if (!same && Math.min(a.length, b.length) >= 5 && Math.abs(a.length - b.length) <= 3) {
          const d = lev(a, b);
          same = d <= (Math.min(a.length, b.length) >= 12 ? 2 : 1);
        }
        if (!same && Math.min(a.length, b.length) >= 8 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) same = true;
        if (same) parent[root(i)] = root(j);
      }
    }
    const groups = {};
    sups.forEach((s, i) => { (groups[root(i)] = groups[root(i)] || []).push(s); });
    const st = directoryStats().m;
    // Busiest record first so it is the default one to keep.
    return Object.values(groups).filter(g => g.length > 1).map(g => g.sort((a, b) => ((st[b.id] || {}).count || 0) - ((st[a.id] || {}).count || 0) || ((st[b.id] || {}).spend || 0) - ((st[a.id] || {}).spend || 0)));
  }
  function duplicatesDialog() {
    const groups = findDuplicateGroups();
    const st = directoryStats().m;
    if (!groups.length) { ui.toast('No likely duplicate suppliers found.', 'info'); return; }
    const body = '<p class="muted mb-2">These suppliers have very similar names (e.g. "IGL Ltd." and "IGL Limited"). Choose the record to keep in each group and merge. Spelling variants are kept as aliases.</p>' +
      groups.map((g, gi) => '<div class="sp-dup" data-g="' + gi + '">' + g.map((s, i) => '<label><input type="radio" name="keep' + gi + '" value="' + s.id + '"' + (i === 0 ? ' checked' : '') + '><span class="strong">' + esc(s.name) + '</span><span class="muted small">' +
        ((st[s.id] || {}).count || 0) + ' POs · ' + util.money((st[s.id] || {}).spend || 0) + (s.trn ? ' · TRN ' + esc(s.trn) : '') + '</span></label>').join('') +
        '<div class="row end mt-1"><button class="btn sm" data-merge="' + gi + '">' + ui.icon('merge', 'sm') + 'Merge group</button></div></div>').join('');
    const md = ui.modal({
      title: groups.length + ' possible duplicate ' + util.plural(groups.length, 'group'), size: 'lg', body,
      actions: [{ label: 'Done', kind: 'primary' }],
      onOpen: el => {
        el.querySelectorAll('[data-merge]').forEach(b => b.onclick = async () => {
          const gi = +b.dataset.merge, g = groups[gi];
          const keep = el.querySelector('input[name="keep' + gi + '"]:checked').value;
          const others = g.filter(s => s.id !== keep);
          if (!(await ui.confirm('Merge ' + others.map(s => '<b>' + esc(s.name) + '</b>').join(', ') + ' into <b>' + esc(store.get('suppliers', keep).name) + '</b>?', { ok: 'Merge', danger: true }))) return;
          others.forEach(s => mergeSuppliers(s.id, keep));
          el.querySelector('[data-g="' + gi + '"]').innerHTML = '<div class="row">' + ui.icon('check') + '<span>Merged into <b>' + esc(store.get('suppliers', keep).name) + '</b></span></div>';
          ui.toast('Suppliers merged');
        });
      },
      onClose: () => { if (router.current === 'suppliers') router.refresh(); }
    });
    return md;
  }

  function exportDirectory() {
    if (!window.XLSX) { ui.toast('Excel library not loaded — check the internet connection.', 'error'); return; }
    const st = directoryStats();
    const rows = store.list('suppliers').sort((a, b) => a.name.localeCompare(b.name)).map(s => {
      const x = st.m[s.id] || {};
      return {
        'Supplier': s.name, 'Status': s.status || 'Active', 'Type': s.type || '', 'Categories': (s.categories || []).join('; '), 'TRN': s.trn || '',
        'TCC No.': s.tccNumber || '', 'TCC Expiry': s.tccExpiry || '', 'PPC/NCC Registered': s.ppcRegistered || '', 'PPC No.': s.ppcNumber || '', 'PPC Category': s.ppcCategory || '', 'PPC Grade': s.ppcGrade || '', 'PPC Expiry': s.ppcExpiry || '',
        'GOJEP': s.gojepRegistered ? 'Yes' : 'No', 'MSME': s.msme ? 'Yes' : 'No', 'Contact Person': s.contactPerson || '', 'Position': s.position || '', 'Phone': s.phone || '', 'Phone 2': s.phone2 || '', 'Email': s.email || '',
        'Address': s.address || '', 'Parish': s.parish || '', 'Country': s.country || '', 'Bank': s.bankName || '', 'Branch': s.bankBranch || '', 'Account No.': s.bankAccount || '', 'Account Type': s.bankAccountType || '', 'Payment Terms': s.paymentTerms || '',
        'Rating': s.rating || '', 'POs': x.count || 0, ['Spend FY ' + st.fy]: util.round2(x.fySpend || 0), 'Total Spend': util.round2(x.spend || 0), 'Last Purchase': x.last || '', 'Outstanding Invoices': util.round2(x.outstanding || 0), 'Notes': s.notes || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || { a: 1 }).map(k => ({ wch: Math.min(40, Math.max(10, k.length + 2)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
    XLSX.writeFile(wb, 'Supplier Directory ' + util.today() + '.xlsx');
    Proc.audit('Export', 'Supplier directory (' + rows.length + ' suppliers)');
  }

  /* ----------------------------------------------------------- directory */
  function renderDirectory(el) {
    const sups = store.list('suppliers');
    const st = directoryStats();
    const active = sups.filter(s => (s.status || 'Active') === 'Active');
    const tccIssues = sups.filter(s => { const e = domain.expiryState(s.tccExpiry); return e && e.tone !== 'success'; });
    const ppcYes = sups.filter(s => s.ppcRegistered === 'Yes').length;
    const fySpend = util.sum(Object.values(st.m), x => x.fySpend);
    const cats = Array.from(new Set([].concat.apply([], sups.map(s => s.categories || [])))).filter(Boolean).sort();

    el.innerHTML = ui.pageHead({
      title: 'Suppliers', sub: 'Every supplier’s business details, purchases, quotes, invoices and documents in one file.',
      actions: '<button class="btn" data-act="dups">' + ui.icon('merge', 'sm') + 'Find duplicates</button><button class="btn" data-act="export">' + ui.icon('download', 'sm') + 'Export</button><a class="btn primary" href="#/suppliers/new">' + ui.icon('plus', 'sm') + 'Add supplier</a>'
    }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Active suppliers', icon: 'building', value: util.int(active.length), meta: util.int(sups.length) + ' on file' }) +
      ui.kpi({ label: 'Spend FY ' + st.fy, icon: 'wallet', tone: 'ok', value: util.moneyShort(fySpend), title: util.money(fySpend), meta: 'Purchase orders this fiscal year' }) +
      ui.kpi({ label: 'TCC expired / expiring', icon: 'alert', tone: tccIssues.length ? 'warn' : 'ok', value: util.int(tccIssues.length), meta: 'Tax Compliance Certificates within 30 days' }) +
      ui.kpi({ label: 'PPC / NCC registered', icon: 'shield', tone: 'pur', value: (sups.length ? Math.round(ppcYes / sups.length * 100) : 0) + '%', meta: util.int(ppcYes) + ' of ' + util.int(sups.length) + ' suppliers' }) +
      '</div><div class="card"><div class="dir-table"></div></div>';

    el.querySelector('[data-act=export]').onclick = exportDirectory;
    el.querySelector('[data-act=dups]').onclick = duplicatesDialog;

    if (!sups.length) {
      el.querySelector('.dir-table').innerHTML = ui.empty('building', 'No suppliers yet', 'Add suppliers one at a time, or import your PO Log and PRS returns to build the directory automatically.',
        '<div class="row" style="justify-content:center"><a class="btn primary" href="#/suppliers/new">' + ui.icon('plus', 'sm') + 'Add supplier</a><a class="btn" href="#/import">' + ui.icon('upload', 'sm') + 'Import data</a></div>');
      return;
    }
    const rows = sups.map(s => Object.assign({}, s, { _st: st.m[s.id] || { count: 0, spend: 0, fySpend: 0, last: '', outstanding: 0 }, _tcc: domain.expiryState(s.tccExpiry) }));
    ui.table(el.querySelector('.dir-table'), {
      rows, pageSize: 30, placeholder: 'Search name, TRN, contact, category…',
      initialSort: { key: 'spend', dir: -1 },
      search: r => [r.name, (r.aliases || []).join(' '), r.trn, r.contactPerson, r.phone, r.email, (r.categories || []).join(' '), r.parish].join(' '),
      filters: [
        { key: 'cat', label: 'All categories', options: cats, test: (r, v) => (r.categories || []).indexOf(v) >= 0 },
        { key: 'type', label: 'All types', options: K.TYPES, test: (r, v) => r.type === v },
        { key: 'status', label: 'Any status', options: K.SUPPLIER_STATUSES, test: (r, v) => (r.status || 'Active') === v },
        { key: 'comp', label: 'Compliance', options: [{ value: 'expired', label: 'TCC expired' }, { value: 'expiring', label: 'TCC expiring (30 days)' }, { value: 'notcc', label: 'No TCC on file' }, { value: 'noppc', label: 'Not PPC registered' }, { value: 'outstanding', label: 'Has unpaid invoices' }],
          test: (r, v) => v === 'expired' ? r._tcc && r._tcc.label === 'Expired' : v === 'expiring' ? r._tcc && r._tcc.label === 'Expiring' : v === 'notcc' ? !r.tccExpiry : v === 'noppc' ? r.ppcRegistered !== 'Yes' : r._st.outstanding > 0 }
      ],
      onRow: r => router.go('suppliers/' + r.id),
      columns: [
        { key: 'name', label: 'Supplier', render: r => '<div class="t-title">' + esc(r.name) + '</div><div class="t-sub truncate" style="max-width:320px">' + esc((r.categories || [])[0] || r.type || '—') + ((r.categories || []).length > 1 ? ' +' + (r.categories.length - 1) : '') + '</div>' },
        { key: 'trn', label: 'TRN', render: r => r.trn ? '<span class="mono nowrap">' + esc(r.trn) + '</span>' : '<span class="muted">—</span>' },
        { key: 'contactPerson', label: 'Contact', render: r => (r.contactPerson || r.phone) ? '<div>' + esc(r.contactPerson || '') + '</div><div class="t-sub">' + esc(r.phone || r.email || '') + '</div>' : '<span class="muted">—</span>' },
        { key: 'pos', label: 'POs', cls: 'num', sort: r => r._st.count, render: r => util.int(r._st.count) },
        { key: 'fy', label: 'FY ' + st.fy, cls: 'num', sort: r => r._st.fySpend, render: r => r._st.fySpend ? util.money(r._st.fySpend) : '<span class="muted">—</span>' },
        { key: 'spend', label: 'Total spend', cls: 'num', sort: r => r._st.spend, render: r => '<span class="strong">' + util.money(r._st.spend) + '</span>' },
        { key: 'last', label: 'Last purchase', sort: r => r._st.last, render: r => r._st.last ? util.date(r._st.last) : '<span class="muted">—</span>' },
        { key: 'tcc', label: 'TCC', sort: r => r._tcc ? r._tcc.days : 99999, render: tccBadge },
        { key: 'status', label: 'Status', render: r => ui.badge(r.status || 'Active') }
      ],
      footer: list => '<td colspan="3">' + util.int(list.length) + ' suppliers</td><td class="num">' + util.int(util.sum(list, r => r._st.count)) + '</td><td class="num">' + util.money(util.sum(list, r => r._st.fySpend)) + '</td><td class="num">' + util.money(util.sum(list, r => r._st.spend)) + '</td><td colspan="3"></td>'
    });
  }

  /* ---------------------------------------------------------------- form */
  function field(name, label, value, o) {
    o = o || {};
    const v = value === undefined || value === null ? '' : value;
    let input;
    if (o.type === 'select') input = '<select name="' + name + '">' + ui.options(o.options, v, o.placeholder) + '</select>';
    else if (o.type === 'textarea') input = '<textarea name="' + name + '" rows="' + (o.rows || 3) + '" placeholder="' + esc(o.ph || '') + '">' + esc(v) + '</textarea>';
    else if (o.type === 'checkbox') input = '<label class="check" style="height:38px"><input type="checkbox" name="' + name + '"' + (v ? ' checked' : '') + '> ' + esc(o.check || '') + '</label>';
    else input = '<input type="' + (o.type || 'text') + '" name="' + name + '" value="' + esc(v) + '" placeholder="' + esc(o.ph || '') + '"' + (o.list ? ' list="' + o.list + '"' : '') + '>';
    return '<div class="field ' + (o.span || 's6') + '"><label>' + esc(label) + (o.req ? '<span class="req">*</span>' : '') + '</label>' + input + (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '</div>';
  }

  function renderForm(el, sid) {
    const existing = sid ? store.get('suppliers', sid) : null;
    if (sid && !existing) return notFound(el);
    const q = router.parse().query;
    const s = existing ? util.clone(existing) : { name: q.name || '', status: 'Active', country: 'Jamaica', categories: [], ppcRegistered: 'No', type: 'Goods' };
    let cats = (s.categories || []).slice();
    ui.setCrumbs(['Suppliers', existing ? short(existing.name) : 'New supplier'].concat(existing ? ['Edit'] : []));
    el.innerHTML = ui.pageHead({
      title: existing ? 'Edit ' + existing.name : 'Add supplier', sub: existing ? 'Business information shown on the supplier file, POs and the PRS return.' : 'Create a supplier file. Only the name is required — fill in the rest as documents come in.',
      back: { label: existing ? existing.name : 'Suppliers', href: existing ? '#/suppliers/' + existing.id : '#/suppliers' }
    }) +
      '<form class="sp-form" novalidate>' +
      '<div class="card"><div class="card-h"><h3>Business</h3></div><div class="card-b"><div class="form-grid">' +
      field('name', 'Registered business name', s.name, { req: true, span: 's8', ph: 'e.g. Promedical Distribution Ltd.' }) +
      field('status', 'Status', s.status || 'Active', { type: 'select', options: K.SUPPLIER_STATUSES, span: 's4' }) +
      field('aliases', 'Also known as', (s.aliases || []).join(', '), { span: 's8', ph: 'Other spellings used on invoices / PO Log, comma separated', hint: 'Imports match these names to this supplier.' }) +
      field('type', 'Supplies', s.type || '', { type: 'select', options: K.TYPES, placeholder: '—', span: 's4' }) +
      '<div class="field s12"><label>Categories (PRS classification)</label><div class="row"><select class="input" data-cat style="flex:1;min-width:220px">' + ui.categoryOptions('') + '</select><button type="button" class="btn" data-addcat>' + ui.icon('plus', 'sm') + 'Add</button></div><div class="sp-cats"></div></div>' +
      field('website', 'Website', s.website, { span: 's4', ph: 'www.example.com' }) +
      '<div class="field s4"><label>Rating</label><div style="height:38px;display:flex;align-items:center">' + stars(s.rating, true) + '<input type="hidden" name="rating" value="' + esc(s.rating || '') + '"></div></div>' +
      field('msme', 'MSME', !!s.msme, { type: 'checkbox', check: 'Micro, small or medium enterprise', span: 's4' }) +
      '</div></div></div>' +
      '<div class="card"><div class="card-h"><h3>Registration & compliance</h3><span class="sub">Checked before award — Handbook requires TRN, TCC and NCC/PPC registration</span></div><div class="card-b"><div class="form-grid">' +
      field('trn', 'TRN', s.trn, { span: 's4', ph: '000-000-000', hint: '9-digit Taxpayer Registration Number' }) +
      field('tccNumber', 'TCC number', s.tccNumber, { span: 's4' }) +
      field('tccExpiry', 'TCC expiry date', s.tccExpiry, { type: 'date', span: 's4' }) +
      field('ppcRegistered', 'PPC / NCC registered', s.ppcRegistered || 'No', { type: 'select', options: ['Yes', 'No', 'Pending'], span: 's3' }) +
      field('ppcNumber', 'Registration no.', s.ppcNumber, { span: 's3' }) +
      field('ppcCategory', 'Registered category', s.ppcCategory, { span: 's3' }) +
      field('ppcGrade', 'Grade', s.ppcGrade, { span: 's3', ph: 'e.g. Grade 3' }) +
      field('ppcExpiry', 'Registration expiry', s.ppcExpiry, { type: 'date', span: 's4' }) +
      field('businessRegNo', 'Business / company reg. no.', s.businessRegNo, { span: 's4' }) +
      field('gojepRegistered', 'GOJEP', !!s.gojepRegistered, { type: 'checkbox', check: 'Registered on GOJEP', span: 's4' }) +
      '</div></div></div>' +
      '<div class="grid c2"><div class="card"><div class="card-h"><h3>Contact</h3></div><div class="card-b"><div class="form-grid">' +
      field('contactPerson', 'Contact person', s.contactPerson) + field('position', 'Position', s.position) +
      field('phone', 'Phone', s.phone, { type: 'tel', ph: '(876) 000-0000' }) + field('phone2', 'Other phone', s.phone2, { type: 'tel' }) +
      field('email', 'Email', s.email, { type: 'email', span: 's12' }) +
      '</div></div></div><div class="card" style="margin-top:0"><div class="card-h"><h3>Address</h3></div><div class="card-b"><div class="form-grid">' +
      field('address', 'Street address', s.address, { type: 'textarea', rows: 2, span: 's12' }) +
      field('parish', 'Parish', s.parish, { type: 'select', options: K.PARISHES, placeholder: '—' }) + field('country', 'Country', s.country || 'Jamaica') +
      '</div></div></div></div>' +
      '<div class="card mt-3"><div class="card-h"><h3>Banking & payment</h3></div><div class="card-b"><div class="form-grid">' +
      field('bankName', 'Bank', s.bankName, { span: 's3' }) + field('bankBranch', 'Branch', s.bankBranch, { span: 's3' }) +
      field('bankAccount', 'Account number', s.bankAccount, { span: 's3' }) + field('bankAccountType', 'Account type', s.bankAccountType, { type: 'select', options: ['Chequing', 'Savings', 'Current'], placeholder: '—', span: 's3' }) +
      field('paymentTerms', 'Usual payment terms', s.paymentTerms, { type: 'select', options: K.TERMS, placeholder: '—', span: 's4' }) +
      field('notes', 'Notes', s.notes, { type: 'textarea', rows: 3, span: 's12', ph: 'Performance, delivery reliability, special arrangements…' }) +
      '</div></div><div class="card-f"><a class="btn ghost" href="' + (existing ? '#/suppliers/' + existing.id : '#/suppliers') + '">Cancel</a><button class="btn primary" type="submit">' + ui.icon('check', 'sm') + (existing ? 'Save changes' : 'Create supplier') + '</button></div></div></form>';

    const form = el.querySelector('form');
    const chipsEl = form.querySelector('.sp-cats');
    const drawCats = () => {
      chipsEl.innerHTML = cats.length ? cats.map((c, i) => '<span class="chip">' + esc(c) + '<button type="button" data-rm="' + i + '" title="Remove">' + ui.icon('x', 'sm') + '</button></span>').join('') : '<span class="muted small">No categories yet</span>';
      chipsEl.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { cats.splice(+b.dataset.rm, 1); drawCats(); });
    };
    drawCats();
    form.querySelector('[data-addcat]').onclick = () => { const v = form.querySelector('[data-cat]').value; if (v && cats.indexOf(v) < 0) { cats.push(v); drawCats(); } };
    form.querySelector('[data-cat]').onchange = e => { const v = e.target.value; if (v && cats.indexOf(v) < 0) { cats.push(v); drawCats(); } e.target.value = ''; };
    form.querySelectorAll('[data-rate] button').forEach(b => b.onclick = () => {
      const cur = +form.rating.value || 0, v = +b.dataset.v === cur ? 0 : +b.dataset.v;
      form.rating.value = v || '';
      form.querySelectorAll('[data-rate] button').forEach(x => x.classList.toggle('on', +x.dataset.v <= v));
    });
    form.trn.addEventListener('blur', () => { form.trn.value = fmtTRN(form.trn.value); });
    let dirty = false;
    form.addEventListener('input', () => { dirty = true; });
    router.beforeLeave = () => (dirty ? ui.confirm('You have unsaved changes to this supplier. Leave without saving?', { ok: 'Leave', danger: true }) : true);

    form.onsubmit = async e => {
      e.preventDefault();
      const d = ui.formData(form);
      form.querySelectorAll('.field').forEach(f => { f.classList.remove('invalid'); const er = f.querySelector('.err'); if (er) er.remove(); });
      const bad = [];
      const flag = (n, msg) => { const f = form[n].closest('.field'); f.classList.add('invalid'); f.insertAdjacentHTML('beforeend', '<div class="err">' + esc(msg) + '</div>'); bad.push(n); };
      if (!d.name) flag('name', 'Enter the supplier’s name');
      if (!validTRN(d.trn)) flag('trn', 'A TRN has 9 digits, e.g. 123-456-789');
      if (!validEmail(d.email)) flag('email', 'Enter a valid email address');
      if (bad.length) { form[bad[0]].focus(); ui.toast('Please correct the highlighted fields.', 'warning'); return; }
      const dup = domain.findSupplier(d.name);
      if (dup && dup.id !== (existing && existing.id)) {
        const go = await ui.confirm('A supplier called <b>' + esc(dup.name) + '</b> is already on file. Create a separate record anyway?', { ok: 'Save anyway', cancel: 'Go back' });
        if (!go) return;
      }
      const rec = Object.assign({}, d, {
        id: existing ? existing.id : undefined, trn: fmtTRN(d.trn), rating: d.rating ? +d.rating : 0, categories: cats,
        aliases: String(d.aliases || '').split(',').map(x => x.trim()).filter(Boolean)
      });
      if (!rec.id) delete rec.id;
      const saved = store.upsert('suppliers', rec);
      if (existing && existing.name !== saved.name) {
        store.batch(() => store.filter('purchaseOrders', p => p.supplierId === saved.id).forEach(p => store.upsert('purchaseOrders', { id: p.id, supplierName: saved.name }, { silent: true })));
        if ((saved.aliases || []).indexOf(existing.name) < 0) store.upsert('suppliers', { id: saved.id, aliases: (saved.aliases || []).concat([existing.name]) }, { silent: true });
      }
      Proc.audit(existing ? 'Update Supplier' : 'Add Supplier', saved.name, saved.id);
      dirty = false;
      ui.toast(existing ? 'Supplier updated' : 'Supplier created');
      router.go('suppliers/' + saved.id);
    };
  }

  /* -------------------------------------------------------------- profile */
  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'building' },
    { id: 'purchases', label: 'Purchases', icon: 'cart' },
    { id: 'items', label: 'Items & prices', icon: 'tag' },
    { id: 'bids', label: 'Quotes & bids', icon: 'scale' },
    { id: 'invoices', label: 'Invoices', icon: 'receipt' },
    { id: 'documents', label: 'Documents', icon: 'clip' },
    { id: 'activity', label: 'Activity', icon: 'history' }
  ];

  function notFound(el) {
    el.innerHTML = ui.empty('building', 'Supplier not found', 'It may have been merged into another supplier or deleted.', '<a class="btn" href="#/suppliers">Back to suppliers</a>');
  }

  function supplierPOs(sid) { return store.filter('purchaseOrders', p => p.supplierId === sid).sort((a, b) => (b.date || '').localeCompare(a.date || '')); }

  function renderProfile(el, sid, tab) {
    const s = store.get('suppliers', sid);
    if (!s) return notFound(el);
    tab = TABS.find(t => t.id === tab) ? tab : 'overview';
    ui.setCrumbs(['Suppliers', short(s.name)]);
    const sum = domain.supplierSummary(sid);
    const pos = supplierPOs(sid);
    const invs = store.filter('invoices', i => i.supplierId === sid);
    const docs = files.forSupplier(sid);
    const counts = { purchases: pos.length, invoices: invs.length, documents: docs.length, bids: sum.bids };
    const contact = [
      s.contactPerson ? '<span>' + ui.icon('user', 'sm') + esc(s.contactPerson) + (s.position ? ' <span class="muted">· ' + esc(s.position) + '</span>' : '') + '</span>' : '',
      s.phone ? '<a href="tel:' + esc(s.phone.replace(/[^\d+]/g, '')) + '">' + ui.icon('phone', 'sm') + esc(s.phone) + '</a>' : '',
      s.email ? '<a href="mailto:' + esc(s.email) + '">' + ui.icon('mail', 'sm') + esc(s.email) + '</a>' : '',
      (s.address || s.parish) ? '<span>' + ui.icon('pin', 'sm') + esc([s.address, s.parish].filter(Boolean).join(', ')) + '</span>' : ''
    ].filter(Boolean).join('');

    el.innerHTML = '<a class="back-link" href="#/suppliers">' + ui.icon('arrow-left', 'sm') + ' Suppliers</a>' +
      '<div class="card"><div class="card-b"><div class="sp-head">' +
      '<div class="avatar lg">' + esc(util.initials(s.name)) + '</div>' +
      '<div style="flex:1;min-width:240px"><div class="title-row"><h1>' + esc(s.name) + '</h1>' + ui.badge(s.status || 'Active') + (s.msme ? '<span class="badge plain info">MSME</span>' : '') + '</div>' +
      '<div class="row mt-1 small muted gap-2">' + stars(s.rating, true) + (s.trn ? '<span class="mono">TRN ' + esc(s.trn) + '</span>' : '<span>No TRN on file</span>') + '<span>·</span><span>TCC ' + tccBadge(s) + '</span>' + (s.type ? '<span>·</span><span>' + esc(s.type) + '</span>' : '') + '</div>' +
      (contact ? '<div class="sp-contact">' + contact + '</div>' : '<div class="sp-contact muted">No contact details yet — <a href="#/suppliers/' + s.id + '/edit">add them</a></div>') +
      ((s.categories || []).length ? '<div class="sp-chips">' + s.categories.map(c => '<span class="chip">' + esc(c) + '</span>').join('') + '</div>' : '') +
      ((s.aliases || []).length ? '<div class="small muted mt-1">Also appears as: ' + s.aliases.map(esc).join(', ') + '</div>' : '') +
      '</div>' +
      '<div class="row" style="align-self:flex-start"><a class="btn" href="#/suppliers/' + s.id + '/edit">' + ui.icon('edit', 'sm') + 'Edit</a><button class="btn" data-act="upload">' + ui.icon('upload', 'sm') + 'Upload</button>' +
      '<a class="btn primary" href="#/orders/new?supplier=' + s.id + '">' + ui.icon('cart', 'sm') + 'New PO</a><button class="btn icon" data-act="more" title="More actions">' + ui.icon('more') + '</button></div>' +
      '</div></div></div>' +
      '<div class="sp-kpis">' +
      ui.kpi({ label: 'Total spend', icon: 'wallet', value: util.moneyShort(sum.spend), title: util.money(sum.spend), meta: util.int(sum.poCount) + ' purchase ' + util.plural(sum.poCount, 'order') }) +
      ui.kpi({ label: 'FY ' + sum.fy, icon: 'trend', tone: 'ok', value: util.moneyShort(sum.fySpend), title: util.money(sum.fySpend), meta: util.int(sum.fyCount) + ' POs this year' }) +
      ui.kpi({ label: 'Last purchase', icon: 'calendar', value: sum.lastDate ? util.date(sum.lastDate) : '—', meta: sum.lastDate ? util.ago(util.parseDate(sum.lastDate)) : 'No purchases yet' }) +
      ui.kpi({ label: 'Unpaid invoices', icon: 'receipt', tone: sum.outstanding ? 'warn' : '', value: util.moneyShort(sum.outstandingAmount), title: util.money(sum.outstandingAmount), meta: util.int(sum.outstanding) + ' of ' + util.int(sum.invoices) + ' invoices' }) +
      ui.kpi({ label: 'Bids won', icon: 'award', tone: 'pur', value: sum.bids ? util.int(sum.wins) + ' / ' + util.int(sum.bids) : '—', meta: sum.bids ? Math.round(sum.wins / sum.bids * 100) + '% win rate in comparisons' : 'No price comparisons yet' }) +
      ui.kpi({ label: 'Documents', icon: 'clip', value: util.int(sum.docs), meta: 'Quotes, POs, invoices, certificates' }) +
      '</div>' +
      '<div class="card"><div class="tabs">' + TABS.map(t => '<button data-tab="' + t.id + '" class="' + (t.id === tab ? 'on' : '') + '">' + ui.icon(t.icon, 'sm') + esc(t.label) + (counts[t.id] ? '<span class="n">' + counts[t.id] + '</span>' : '') + '</button>').join('') + '</div><div class="tab-body"></div></div>';

    // rating stars in the header save immediately
    el.querySelectorAll('.sp-head [data-rate] button').forEach(b => b.onclick = () => {
      const v = +b.dataset.v === (s.rating || 0) ? 0 : +b.dataset.v;
      store.upsert('suppliers', { id: s.id, rating: v }, { silent: true });
      s.rating = v;
      el.querySelectorAll('.sp-head [data-rate] button').forEach(x => x.classList.toggle('on', +x.dataset.v <= v));
      ui.toast(v ? 'Rated ' + v + ' of 5' : 'Rating cleared');
    });
    el.querySelector('[data-act=upload]').onclick = () => uploadForSupplier(s.id, null, () => rerender('documents'));
    el.querySelector('[data-act=more]').onclick = e => ui.menu(e.currentTarget, moreMenu(s));
    const body = el.querySelector('.tab-body');
    const rerender = t => { const y = window.scrollY; renderProfile(el, sid, t || tab); window.scrollTo(0, y); };
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
      el.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
      tab = b.dataset.tab;
      history.replaceState(null, '', '#/suppliers/' + sid + (tab === 'overview' ? '' : '/' + tab));
      drawTab(body, s, tab, rerender);
    });
    drawTab(body, s, tab, rerender);
  }

  function moreMenu(s) {
    const items = [
      { label: 'New price comparison with this supplier', icon: 'scale', onClick: () => router.go('sourcing/new?supplier=' + s.id) },
      { label: 'Record invoice', icon: 'receipt', onClick: () => router.go('invoices?new=1&supplier=' + s.id) },
      { label: 'Merge into another supplier…', icon: 'merge', onClick: () => mergeDialog(s.id) },
      { sep: true }, { header: 'Status' }
    ];
    K.SUPPLIER_STATUSES.filter(x => x !== (s.status || 'Active')).forEach(st => items.push({
      label: st === 'Active' ? 'Mark active' : 'Mark ' + st.toLowerCase(), icon: st === 'Active' ? 'check' : st === 'Debarred' ? 'lock' : 'alert', danger: st === 'Debarred',
      onClick: async () => {
        const v = st === 'Active' ? {} : await ui.form('Mark ' + s.name + ' as ' + st.toLowerCase(), [{ name: 'reason', label: 'Reason', type: 'textarea', required: st !== 'Inactive', placeholder: st === 'Debarred' ? 'e.g. Debarred by PPC — notice ref.' : 'e.g. Repeated late deliveries' }], { ok: 'Mark ' + st.toLowerCase() });
        if (!v) return;
        const note = v.reason ? '[' + util.date(util.today()) + '] Status ' + st + ': ' + v.reason : '';
        store.upsert('suppliers', { id: s.id, status: st, statusReason: v.reason || '', statusDate: util.today(), notes: note ? ((s.notes ? s.notes + '\n' : '') + note) : s.notes });
        Proc.audit('Supplier Status', s.name + ' → ' + st + (v.reason ? ' (' + v.reason + ')' : ''), s.id);
        ui.toast(s.name + ' marked ' + st.toLowerCase());
        router.refresh();
      }
    }));
    items.push({ sep: true }, {
      label: 'Delete supplier', icon: 'trash', danger: true, onClick: async () => {
        const c = linkedCounts(s.id);
        const total = c.pos + c.invoices + c.docs + c.cmps + c.memos;
        if (total) {
          ui.modal({ title: 'This supplier has records', size: 'sm', body: '<p>' + esc(s.name) + ' is linked to ' + [c.pos && c.pos + ' purchase orders', c.invoices && c.invoices + ' invoices', c.docs && c.docs + ' documents', c.cmps && c.cmps + ' comparisons', c.memos && c.memos + ' memos'].filter(Boolean).join(', ') +
            '. Records with history cannot be deleted — mark the supplier inactive, or merge it into the correct supplier.</p>', actions: [{ label: 'Close', kind: 'ghost' }, { label: 'Merge…', kind: 'primary', onClick: () => { setTimeout(() => mergeDialog(s.id), 50); } }] });
          return;
        }
        if (!(await ui.confirm('Delete <b>' + esc(s.name) + '</b>? This cannot be undone.', { danger: true, ok: 'Delete' }))) return;
        store.remove('suppliers', s.id);
        Proc.audit('Delete Supplier', s.name, s.id);
        ui.toast('Supplier deleted');
        router.go('suppliers');
      }
    });
    return items;
  }

  function drawTab(body, s, tab, rerender) {
    ({ overview: tabOverview, purchases: tabPurchases, items: tabItems, bids: tabBids, invoices: tabInvoices, documents: tabDocuments, activity: tabActivity })[tab](body, s, rerender);
  }

  /* Overview */
  function kvRows(rows) {
    return '<dl class="kv">' + rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + (v === undefined || v === null || v === '' ? '<span class="muted">—</span>' : v) + '</dd>').join('') + '</dl>';
  }
  function tabOverview(body, s) {
    const tcc = domain.expiryState(s.tccExpiry), ppc = domain.expiryState(s.ppcExpiry);
    const alerts = [];
    if (s.status && s.status !== 'Active') alerts.push(['danger', 'Supplier is ' + s.status.toLowerCase(), s.statusReason ? esc(s.statusReason) + (s.statusDate ? ' · ' + util.date(s.statusDate) : '') : 'Do not award new contracts without review.']);
    if (!s.tccExpiry) alerts.push(['warning', 'No Tax Compliance Certificate on file', 'Record the TCC number and expiry, and upload a copy, before the next award.']);
    else if (tcc.tone === 'danger') alerts.push(['danger', 'TCC expired ' + util.date(s.tccExpiry), 'Request a current Tax Compliance Certificate before issuing a PO.']);
    else if (tcc.tone === 'warning') alerts.push(['warning', 'TCC expires in ' + tcc.days + ' ' + util.plural(tcc.days, 'day'), 'Expiry ' + util.date(s.tccExpiry) + '. Ask the supplier for the renewed certificate.']);
    if (ppc && ppc.tone !== 'success') alerts.push([ppc.tone, 'PPC/NCC registration ' + (ppc.tone === 'danger' ? 'expired ' : 'expires ') + util.date(s.ppcExpiry), 'Confirm registration status with the Public Procurement Commission.']);
    if (!s.trn) alerts.push(['info', 'TRN not recorded', 'The TRN is needed for the PRS return and payment processing.']);

    const fy = util.fiscalYear(util.today()), range = util.fyRange(fy);
    const months = [];
    for (let i = 0; i < 12; i++) { const d = util.parseDate(range.start); d.setMonth(d.getMonth() + i); months.push(util.toISODate(d).slice(0, 7)); }
    const pos = supplierPOs(s.id).filter(p => p.status !== 'Cancelled');
    const byMonth = util.groupBy(pos.filter(p => util.fiscalYear(p.date) === fy), p => util.monthKey(p.date));
    const chartData = months.map(m => ({ label: util.monthLabel(m).slice(0, 3), value: util.sum(byMonth[m] || [], p => p.total), title: util.monthLabel(m) + ': ' + util.money(util.sum(byMonth[m] || [], p => p.total)) + ' (' + (byMonth[m] || []).length + ' POs)' }));
    const docs = files.forSupplier(s.id);
    const hasDoc = k => docs.some(d => d.kind === k);

    body.innerHTML = '<div class="card-b"><div class="grid side">' +
      '<div class="stack">' +
      (alerts.length ? '<div class="sp-alerts">' + alerts.map(a => '<div class="alert ' + a[0] + '">' + ui.icon(a[0] === 'info' ? 'info' : 'alert') + '<div><div class="t">' + esc(a[1]) + '</div><div class="small">' + a[2] + '</div></div></div>').join('') + '</div>' : '') +
      '<div><div class="row between mb-1"><div class="section-title" style="margin:0">Spend by month · FY ' + fy + '</div><span class="small muted">' + util.money(util.sum(chartData, d => d.value)) + '</span></div>' + ui.bars(chartData, { height: 150 }) + '</div>' +
      '<div><div class="row between mb-1"><div class="section-title" style="margin:0">Recent purchases</div><a class="small" href="#/suppliers/' + s.id + '/purchases" data-goto="purchases">View all ' + util.int(pos.length) + '</a></div>' +
      (pos.length ? '<div class="table-wrap"><table class="table compact"><thead><tr><th>PO</th><th>Date</th><th>Description</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>' +
        pos.slice(0, 6).map(p => '<tr class="click" data-href="' + poHref(p) + '"><td class="nowrap strong">' + esc(poLabel(p)) + '</td><td class="nowrap">' + util.date(p.date) + '</td><td><div class="truncate" style="max-width:340px">' + esc(p.description || ((p.items || [])[0] || {}).description || '') + '</div></td><td class="num">' + util.money(p.total) + '</td><td>' + ui.badge(p.status) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<div class="muted small">No purchase orders yet.</div>') + '</div>' +
      '</div>' +
      '<div class="stack">' +
      '<div class="sp-info"><div class="section-title">Registration & compliance</div>' + kvRows([
        ['TRN', s.trn ? '<span class="mono">' + esc(s.trn) + '</span>' : ''],
        ['TCC', s.tccNumber || s.tccExpiry ? esc(s.tccNumber || '') + (s.tccExpiry ? ' <span class="muted">exp. ' + util.date(s.tccExpiry) + '</span> ' + tccBadge(s) : '') : ''],
        ['PPC / NCC', s.ppcRegistered ? ui.badge(s.ppcRegistered === 'Yes' ? 'Registered' : s.ppcRegistered === 'Pending' ? 'Pending' : 'Not registered', s.ppcRegistered === 'Yes' ? 'success' : s.ppcRegistered === 'Pending' ? 'warning' : '') : ''],
        ['Registration', [s.ppcNumber, s.ppcCategory, s.ppcGrade].filter(Boolean).map(esc).join(' · ') + (s.ppcExpiry ? ' <span class="muted">exp. ' + util.date(s.ppcExpiry) + '</span>' : '')],
        ['GOJEP', s.gojepRegistered ? 'Registered' : 'Not recorded'],
        ['Business reg.', esc(s.businessRegNo || '')],
        ['Certificates', [hasDoc('Tax Compliance Certificate') ? '<span class="badge success plain">TCC copy</span>' : '<span class="badge plain">No TCC copy</span>', hasDoc('PPC / NCC Registration') ? '<span class="badge success plain">PPC copy</span>' : ''].join(' ')]
      ]) + '</div>' +
      '<div class="sp-info"><div class="section-title">Contact</div>' + kvRows([
        ['Contact', esc(s.contactPerson || '') + (s.position ? ' <span class="muted">· ' + esc(s.position) + '</span>' : '')],
        ['Phone', esc([s.phone, s.phone2].filter(Boolean).join(' / '))], ['Email', s.email ? '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a>' : ''],
        ['Website', s.website ? '<a href="' + esc(/^https?:/.test(s.website) ? s.website : 'https://' + s.website) + '" target="_blank" rel="noopener">' + esc(s.website) + '</a>' : ''],
        ['Address', esc([s.address, s.parish, s.country].filter(Boolean).join(', '))]
      ]) + '</div>' +
      '<div class="sp-info"><div class="section-title">Banking & payment</div>' + kvRows([
        ['Bank', esc([s.bankName, s.bankBranch].filter(Boolean).join(', '))], ['Account', esc([s.bankAccount, s.bankAccountType].filter(Boolean).join(' · '))], ['Terms', esc(s.paymentTerms || '')]
      ]) + '</div>' +
      (s.notes ? '<div class="sp-info"><div class="section-title">Notes</div><div style="white-space:pre-wrap">' + esc(s.notes) + '</div></div>' : '') +
      '<div class="small muted">Supplier since ' + util.date(util.toISODate(new Date(s.createdAt))) + ' · <a href="#/suppliers/' + s.id + '/edit">Edit details</a></div>' +
      '</div></div></div>';
    body.querySelectorAll('tr[data-href]').forEach(tr => tr.onclick = () => { location.hash = tr.dataset.href; });
    const g = body.querySelector('[data-goto]');
    if (g) g.onclick = e => { e.preventDefault(); document.querySelector('.tabs [data-tab=purchases]').click(); };
  }

  /* Purchases */
  function tabPurchases(body, s) {
    const pos = supplierPOs(s.id);
    if (!pos.length) {
      body.innerHTML = ui.empty('cart', 'No purchase orders yet', 'Purchase orders issued to ' + esc(s.name) + ' will be listed here with their items.', '<a class="btn primary" href="#/orders/new?supplier=' + s.id + '">' + ui.icon('plus', 'sm') + 'New purchase order</a>');
      return;
    }
    const fys = Array.from(new Set(pos.map(p => util.fiscalYear(p.date)))).sort().reverse();
    body.innerHTML = '<div class="tbl"></div>';
    ui.table(body.querySelector('.tbl'), {
      rows: pos, pageSize: 20, placeholder: 'Search PO number, items, department…',
      search: p => [p.poNumber, p.description, p.department, p.requisitioner, p.ref, (p.items || []).map(i => i.description).join(' ')].join(' '),
      filters: [
        { key: 'fy', label: 'All fiscal years', options: fys.map(f => ({ value: f, label: 'FY ' + f })), test: (p, v) => util.fiscalYear(p.date) === v },
        { key: 'status', label: 'Any status', options: K.PO_STATUSES, test: (p, v) => p.status === v }
      ],
      onRow: p => { location.hash = poHref(p); },
      columns: [
        { key: 'poNumber', label: 'PO #', render: p => '<a class="strong nowrap" href="' + poHref(p) + '">' + esc(poLabel(p)) + '</a>', sort: p => p.poNumber || '' },
        { key: 'date', label: 'Date', render: p => '<span class="nowrap">' + util.date(p.date) + '</span>' },
        { key: 'description', label: 'Items', render: p => {
          const items = p.items || [];
          const head = esc(p.description || (items[0] || {}).description || '—');
          const lines = items.length > 1 || (items.length === 1 && items[0].description !== p.description) ? '<div class="sp-itemline">' + items.slice(0, 4).map(i => esc((i.qty ? util.int(i.qty) + ' ' + (i.unit || '') + ' ' : '') + i.description)).join(' · ') + (items.length > 4 ? ' · +' + (items.length - 4) + ' more' : '') + '</div>' : '';
          return '<div class="t-title" style="font-weight:500;white-space:normal;max-width:520px">' + head + '</div>' + lines;
        } },
        { key: 'department', label: 'Department', render: p => esc(p.department || '—') },
        { key: 'total', label: 'Amount', cls: 'num', sort: p => util.num(p.total), render: p => '<span class="strong">' + util.money(p.total) + '</span>' },
        { key: 'status', label: 'Status', render: p => ui.badge(p.status) }
      ],
      initialSort: { key: 'date', dir: -1 },
      footer: list => '<td colspan="4">' + util.int(list.length) + ' purchase orders</td><td class="num">' + util.money(util.sum(list, p => p.total)) + '</td><td></td>'
    });
  }

  /* Items & prices */
  const normDesc = d => String(d || '').toLowerCase().replace(/^\s*[\d.,]+\s*(ea|each|pks?|pk|c\/s|cs|case|boxes|box|bxs?|lbs?|kg|lt|ltrs?|litres?|rolls?|pairs?|sets?|bags?|doz|gals?|drums?|bottles?|btls?)?\b\.?\s*[-–]?\s*/, '').replace(/\s+/g, ' ').trim();
  function priceLines(sid) {
    const lines = [];
    supplierPOs(sid).filter(p => p.status !== 'Cancelled').forEach(p => {
      const items = (p.items || []).filter(i => i.description);
      if (items.length) items.forEach(i => lines.push({ source: 'Purchased', description: i.description, unit: i.unit || '', qty: util.num(i.qty), unitPrice: util.num(i.unitPrice), total: util.num(i.total) || util.num(i.qty) * util.num(i.unitPrice), date: p.date, ref: poLabel(p), href: poHref(p) }));
      else if (p.description) lines.push({ source: 'Purchased', description: p.description, unit: '', qty: 0, unitPrice: 0, total: util.num(p.total), date: p.date, ref: poLabel(p), href: poHref(p) });
    });
    store.filter('comparisons', c => (c.suppliers || []).some(x => x.supplierId === sid)).forEach(c => {
      let r; try { r = domain.computeComparison(c); } catch (e) { return; }
      r.lines.forEach(l => {
        const q = l.quotes[sid]; if (!q) return;
        lines.push({ source: l.awardSid === sid ? 'Quoted · won' : 'Quoted', description: l.item.description, unit: l.item.unit || '', qty: l.qty, unitPrice: q.unit, total: q.ext, date: c.date, ref: c.ref || c.subject || 'Comparison', href: '#/sourcing/' + c.id });
      });
    });
    lines.forEach(l => { l.key = normDesc(l.description) || l.description.toLowerCase(); });
    return lines;
  }
  function tabItems(body, s) {
    const lines = priceLines(s.id);
    if (!lines.length) { body.innerHTML = ui.empty('tag', 'No item prices yet', 'Items from purchase orders and quoted prices from price comparisons build a price history for this supplier.'); return; }
    const groups = util.groupBy(lines, l => l.key);
    const summary = Object.keys(groups).map(k => {
      const g = groups[k].slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const priced = g.filter(x => x.unitPrice > 0);
      const bought = g.filter(x => x.source === 'Purchased');
      const lastPaid = bought.find(x => x.unitPrice > 0);
      const prevPaid = bought.filter(x => x.unitPrice > 0)[1];
      return {
        description: g[0].description, unit: (g.find(x => x.unit) || {}).unit || '', times: bought.length, quotes: g.length - bought.length,
        qty: util.sum(bought, x => x.qty), spend: util.sum(bought, x => x.total), last: lastPaid ? lastPaid.unitPrice : 0, lastDate: g[0].date, lastRef: g[0], change: lastPaid && prevPaid ? (lastPaid.unitPrice - prevPaid.unitPrice) / prevPaid.unitPrice : null,
        min: priced.length ? Math.min.apply(null, priced.map(x => x.unitPrice)) : 0, max: priced.length ? Math.max.apply(null, priced.map(x => x.unitPrice)) : 0, lines: g
      };
    });
    body.innerHTML = '<div class="toolbar" style="border-bottom:0;padding-bottom:0"><div class="seg"><button class="on" data-v="sum">By item<span class="n">' + summary.length + '</span></button><button data-v="all">All lines<span class="n">' + lines.length + '</span></button></div><span class="small muted">Last price paid, lowest and highest unit price — use it to check a new quote.</span></div><div class="tbl"></div>';
    const holder = body.querySelector('.tbl');
    const drawSum = () => ui.table(holder, {
      rows: summary, pageSize: 25, placeholder: 'Search items…', search: r => r.description, initialSort: { key: 'lastDate', dir: -1 },
      onRow: r => itemHistory(s, r),
      columns: [
        { key: 'description', label: 'Item', render: r => '<div class="t-title" style="font-weight:500;white-space:normal;max-width:440px">' + esc(r.description) + '</div><div class="t-sub">' + (r.times ? r.times + '× bought' : '') + (r.quotes ? (r.times ? ' · ' : '') + r.quotes + '× quoted' : '') + (r.unit ? ' · ' + esc(r.unit) : '') + '</div>' },
        { key: 'last', label: 'Last price paid', cls: 'num', render: r => r.last ? util.money(r.last) + (r.change !== null && Math.abs(r.change) >= 0.005 ? ' <span class="small ' + (r.change > 0 ? 'sp-up' : 'sp-down') + '">' + (r.change > 0 ? '▲' : '▼') + Math.abs(Math.round(r.change * 100)) + '%</span>' : '') : '<span class="muted">—</span>' },
        { key: 'min', label: 'Lowest', cls: 'num', render: r => r.min ? util.money(r.min) : '<span class="muted">—</span>' },
        { key: 'max', label: 'Highest', cls: 'num', render: r => r.max ? util.money(r.max) : '<span class="muted">—</span>' },
        { key: 'qty', label: 'Qty bought', cls: 'num', render: r => r.qty ? util.int(r.qty) : '<span class="muted">—</span>' },
        { key: 'spend', label: 'Spend', cls: 'num', render: r => r.spend ? util.money(r.spend) : '<span class="muted">—</span>' },
        { key: 'lastDate', label: 'Last seen', render: r => '<span class="nowrap">' + util.date(r.lastDate) + '</span>' }
      ]
    });
    const drawAll = () => ui.table(holder, {
      rows: lines, pageSize: 25, placeholder: 'Search items, PO numbers…', search: r => r.description + ' ' + r.ref + ' ' + r.source, initialSort: { key: 'date', dir: -1 },
      filters: [{ key: 'src', label: 'Bought & quoted', options: ['Purchased', 'Quoted'], test: (r, v) => r.source.indexOf(v) === 0 }],
      columns: [
        { key: 'date', label: 'Date', render: r => '<span class="nowrap">' + util.date(r.date) + '</span>' },
        { key: 'description', label: 'Item', render: r => '<span style="white-space:normal">' + esc(r.description) + '</span>' },
        { key: 'source', label: 'Source', render: r => ui.badge(r.source, r.source === 'Purchased' ? 'primary' : r.source === 'Quoted · won' ? 'success' : '') },
        { key: 'qty', label: 'Qty', cls: 'num', render: r => r.qty ? util.int(r.qty) + ' ' + esc(r.unit) : '' },
        { key: 'unitPrice', label: 'Unit price', cls: 'num', render: r => r.unitPrice ? util.money(r.unitPrice) : '<span class="muted">—</span>' },
        { key: 'total', label: 'Total', cls: 'num', render: r => util.money(r.total) },
        { key: 'ref', label: 'Reference', render: r => '<a href="' + r.href + '" class="nowrap">' + esc(r.ref) + '</a>' }
      ]
    });
    drawSum();
    body.querySelectorAll('.seg button').forEach(b => b.onclick = () => { body.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); b.dataset.v === 'sum' ? drawSum() : drawAll(); });
  }
  function itemHistory(s, r) {
    ui.modal({
      title: r.description, size: 'lg',
      body: '<div class="grid c3 mb-2">' + ui.kpi({ label: 'Last price paid', icon: 'tag', value: r.last ? util.money(r.last) : '—' }) + ui.kpi({ label: 'Lowest', icon: 'trend', tone: 'ok', value: r.min ? util.money(r.min) : '—' }) + ui.kpi({ label: 'Highest', icon: 'alert', tone: 'warn', value: r.max ? util.money(r.max) : '—' }) + '</div>' +
        '<div class="table-wrap"><table class="table compact"><thead><tr><th>Date</th><th>Source</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Total</th><th>Reference</th></tr></thead><tbody>' +
        r.lines.map(l => '<tr><td class="nowrap">' + util.date(l.date) + '</td><td>' + ui.badge(l.source, l.source === 'Purchased' ? 'primary' : l.source === 'Quoted · won' ? 'success' : '') + '</td><td class="num">' + (l.qty ? util.int(l.qty) + ' ' + esc(l.unit) : '') + '</td><td class="num">' + (l.unitPrice ? util.money(l.unitPrice) : '—') + '</td><td class="num">' + util.money(l.total) + '</td><td><a href="' + l.href + '">' + esc(l.ref) + '</a></td></tr>').join('') +
        '</tbody></table></div>',
      actions: [{ label: 'Close', kind: 'primary' }],
      onOpen: (el, close) => el.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', close))
    });
  }

  /* Quotes & bids */
  function tabBids(body, s) {
    const rows = [];
    store.filter('comparisons', c => (c.suppliers || []).some(x => x.supplierId === s.id)).forEach(c => {
      let r; try { r = domain.computeComparison(c); } catch (e) { return; }
      const mine = r.bySupplier[s.id] || {};
      const bidders = Object.values(r.bySupplier).filter(b => b.quoted > 0).sort((a, b) => a.total - b.total);
      const rank = bidders.findIndex(b => b.supplierId === s.id) + 1;
      const award = r.awards.find(a => a.supplierId === s.id);
      rows.push({ date: c.date, ref: c.ref || '—', subject: c.subject || '', href: '#/sourcing/' + c.id, bid: mine.total || 0, quoted: mine.quoted || 0, items: r.lines.length, rank, bidders: bidders.length, compliant: mine.compliant !== false, awarded: award ? award.total : 0, awardTotal: r.awardTotal, status: c.status || 'Open' });
    });
    store.filter('memos', m => !m.comparisonId && (m.bids || []).some(b => b.supplierId === s.id)).forEach(m => {
      const bids = (m.bids || []).slice().sort((a, b) => util.num(a.price) - util.num(b.price));
      const mine = bids.find(b => b.supplierId === s.id);
      const aw = (m.awards || []).find(a => a.supplierId === s.id);
      rows.push({ date: m.date, ref: m.ref || '—', subject: m.subject || '', href: '#/memos/' + m.id, bid: util.num(mine.price), quoted: null, items: null, rank: bids.indexOf(mine) + 1, bidders: bids.length, compliant: mine.compliant !== false, awarded: aw ? util.num(aw.amount) : 0, awardTotal: util.sum(m.awards || [], a => a.amount), status: m.status || 'Draft' });
    });
    if (!rows.length) {
      body.innerHTML = ui.empty('scale', 'No quotes recorded', 'When ' + esc(s.name) + ' is added to a price comparison, its bids, ranking and awards appear here.', '<a class="btn primary" href="#/sourcing/new?supplier=' + s.id + '">' + ui.icon('plus', 'sm') + 'New price comparison</a>');
      return;
    }
    const won = rows.filter(r => r.awarded > 0);
    body.innerHTML = '<div class="card-b" style="padding-bottom:0"><div class="grid c3">' +
      ui.kpi({ label: 'Competitions entered', icon: 'scale', value: util.int(rows.length) }) +
      ui.kpi({ label: 'Won (fully or in part)', icon: 'award', tone: 'ok', value: util.int(won.length), meta: Math.round(won.length / rows.length * 100) + '% win rate' }) +
      ui.kpi({ label: 'Value awarded', icon: 'wallet', tone: 'pur', value: util.moneyShort(util.sum(won, r => r.awarded)), title: util.money(util.sum(won, r => r.awarded)) }) +
      '</div></div><div class="tbl mt-2"></div>';
    ui.table(body.querySelector('.tbl'), {
      rows, pageSize: 20, search: r => r.ref + ' ' + r.subject, initialSort: { key: 'date', dir: -1 }, onRow: r => { location.hash = r.href; },
      columns: [
        { key: 'date', label: 'Date', render: r => '<span class="nowrap">' + util.date(r.date) + '</span>' },
        { key: 'ref', label: 'Reference', render: r => '<div class="t-title">' + esc(r.ref) + '</div><div class="t-sub">' + esc(r.subject) + '</div>' },
        { key: 'bid', label: 'Bid (incl. GCT)', cls: 'num', render: r => util.money(r.bid) + (r.items ? '<div class="t-sub">' + r.quoted + ' of ' + r.items + ' items</div>' : '') },
        { key: 'rank', label: 'Rank', cls: 'num', render: r => r.rank ? '<span class="strong">' + r.rank + '</span><span class="muted"> of ' + r.bidders + '</span>' : '—' },
        { key: 'compliant', label: 'Compliance', render: r => r.compliant ? ui.badge('Compliant', 'success') : ui.badge('Non-compliant', 'danger') },
        { key: 'awarded', label: 'Awarded', cls: 'num', render: r => r.awarded ? '<span class="strong text-success">' + util.money(r.awarded) + '</span>' : '<span class="muted">Not awarded</span>' },
        { key: 'status', label: 'Status', render: r => ui.badge(r.status) }
      ]
    });
  }

  /* Invoices */
  function tabInvoices(body, s) {
    const invs = store.filter('invoices', i => i.supplierId === s.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const newBtn = '<a class="btn primary sm" href="#/invoices?new=1&supplier=' + s.id + '">' + ui.icon('plus', 'sm') + 'Record invoice</a>';
    if (!invs.length) { body.innerHTML = ui.empty('receipt', 'No invoices yet', 'Supplier invoices recorded against purchase orders appear here with their payment status.', newBtn); return; }
    const today = util.today();
    const unpaid = invs.filter(i => i.status !== 'Paid');
    const overdue = unpaid.filter(i => i.dueDate && i.dueDate < today);
    body.innerHTML = '<div class="card-b" style="padding-bottom:0"><div class="grid c3">' +
      ui.kpi({ label: 'Unpaid', icon: 'receipt', tone: unpaid.length ? 'warn' : 'ok', value: util.money(util.sum(unpaid, i => i.total)), meta: unpaid.length + ' ' + util.plural(unpaid.length, 'invoice') }) +
      ui.kpi({ label: 'Overdue', icon: 'alert', tone: overdue.length ? 'bad' : 'ok', value: util.money(util.sum(overdue, i => i.total)), meta: overdue.length + ' past due date' }) +
      ui.kpi({ label: 'Paid to date', icon: 'check', tone: 'ok', value: util.money(util.sum(invs.filter(i => i.status === 'Paid'), i => i.total)) }) +
      '</div></div><div class="tbl mt-2"></div>';
    ui.table(body.querySelector('.tbl'), {
      rows: invs, pageSize: 20, search: i => [i.invoiceNumber, (store.get('purchaseOrders', i.poId) || {}).poNumber, i.notes].join(' '),
      toolbar: newBtn, onRow: i => router.go('invoices/' + i.id),
      filters: [{ key: 'st', label: 'Any status', options: K.INV_STATUSES.concat(['Overdue']), test: (i, v) => v === 'Overdue' ? i.status !== 'Paid' && i.dueDate && i.dueDate < today : i.status === v }],
      columns: [
        { key: 'invoiceNumber', label: 'Invoice #', render: i => '<a class="strong" href="#/invoices/' + i.id + '">' + esc(i.invoiceNumber || '—') + '</a>' },
        { key: 'date', label: 'Date', render: i => '<span class="nowrap">' + util.date(i.date) + '</span>' },
        { key: 'po', label: 'PO', sort: i => (store.get('purchaseOrders', i.poId) || {}).poNumber || '', render: i => { const p = store.get('purchaseOrders', i.poId); return p ? '<a href="' + poHref(p) + '">' + esc(poLabel(p)) + '</a>' : '<span class="muted">—</span>'; } },
        { key: 'dueDate', label: 'Due', render: i => i.dueDate ? '<span class="nowrap ' + (i.status !== 'Paid' && i.dueDate < today ? 'text-danger strong' : '') + '">' + util.date(i.dueDate) + '</span>' : '—' },
        { key: 'age', label: 'Age', cls: 'num', sort: i => i.status === 'Paid' ? -1 : util.daysBetween(i.date, today), render: i => i.status === 'Paid' ? '<span class="muted">Paid ' + util.date(i.paidDate) + '</span>' : util.daysBetween(i.date, today) + ' days' },
        { key: 'total', label: 'Amount', cls: 'num', render: i => '<span class="strong">' + util.money(i.total) + '</span>' },
        { key: 'status', label: 'Status', render: i => ui.badge(i.status !== 'Paid' && i.dueDate && i.dueDate < today ? 'Overdue' : i.status) }
      ],
      footer: list => '<td colspan="5">' + list.length + ' invoices</td><td class="num">' + util.money(util.sum(list, i => i.total)) + '</td><td></td>'
    });
  }

  /* Documents */
  const DOC_ORDER = K.DOC_KINDS;
  function linkLabel(d) {
    const l = d.links || {}, out = [];
    if (l.poId) { const p = store.get('purchaseOrders', l.poId); if (p) out.push('<a class="sp-lnk" href="' + poHref(p) + '">' + esc(poLabel(p)) + '</a>'); }
    if (l.invoiceId) { const i = store.get('invoices', l.invoiceId); if (i) out.push('<a class="sp-lnk" href="#/invoices/' + i.id + '">Invoice ' + esc(i.invoiceNumber) + '</a>'); }
    if (l.comparisonId) { const c = store.get('comparisons', l.comparisonId); if (c) out.push('<a class="sp-lnk" href="#/sourcing/' + c.id + '">' + esc(c.ref || c.subject) + '</a>'); }
    if (l.memoId) { const m = store.get('memos', l.memoId); if (m) out.push('<a class="sp-lnk" href="#/memos/' + m.id + '">Memo ' + esc(m.ref || '') + '</a>'); }
    return out.join(' · ');
  }
  function tabDocuments(body, s, rerender) {
    const docs = files.forSupplier(s.id);
    const kinds = DOC_ORDER.filter(k => docs.some(d => d.kind === k)).concat(Array.from(new Set(docs.map(d => d.kind))).filter(k => DOC_ORDER.indexOf(k) < 0));
    let filterKind = '', q = '';
    body.innerHTML = '<div class="card-b"><div class="dz mb-3"></div>' +
      (docs.length ? '<div class="row mb-2"><div class="seg" data-kinds><button class="on" data-k="">All<span class="n">' + docs.length + '</span></button>' + kinds.map(k => '<button data-k="' + esc(k) + '">' + esc(k) + '<span class="n">' + docs.filter(d => d.kind === k).length + '</span></button>').join('') + '</div>' +
        '<div class="spacer"></div><div class="toolbar" style="padding:0;border:0"><div class="search">' + ui.icon('search', 'sm') + '<input type="search" placeholder="Search documents…"></div></div></div>' : '') +
      '<div class="doc-body"></div></div>';
    ui.dropzone(body.querySelector('.dz'), fs => uploadForSupplier(s.id, fs, () => rerender('documents')), { title: 'Drop quotes, POs, invoices or certificates for ' + s.name, hint: 'Or click to browse. Files are filed under this supplier and can be linked to a PO or invoice.' });
    const holder = body.querySelector('.doc-body');
    const draw = () => {
      const list = docs.filter(d => (!filterKind || d.kind === filterKind) && (!q || [d.title, d.name, d.ref, d.notes, d.kind].join(' ').toLowerCase().indexOf(q) >= 0));
      if (!docs.length) { holder.innerHTML = ui.empty('clip', 'No documents yet', 'Keep the supplier’s quotations, signed POs, invoices, TCC and registration certificates here.'); return; }
      if (!list.length) { holder.innerHTML = '<div class="muted small">No documents match.</div>'; return; }
      const grouped = util.groupBy(list, d => d.kind || 'Other');
      holder.innerHTML = Object.keys(grouped).sort((a, b) => DOC_ORDER.indexOf(a) - DOC_ORDER.indexOf(b)).map(k => '<div class="sp-docgrp"><h4>' + esc(k) + '<span class="chip">' + grouped[k].length + '</span></h4><div class="doc-list">' +
        grouped[k].map(d => { let row = ui.docRow(d); const l = linkLabel(d); if (l) row = row.replace('</div></div><button', ' · ' + l + '</div></div><button'); return row; }).join('') + '</div></div>').join('');
      ui.bindDocs(holder, () => rerender('documents'));
    };
    draw();
    body.querySelectorAll('[data-kinds] button').forEach(b => b.onclick = () => { body.querySelectorAll('[data-kinds] button').forEach(x => x.classList.toggle('on', x === b)); filterKind = b.dataset.k; draw(); });
    const si = body.querySelector('input[type=search]');
    if (si) si.addEventListener('input', util.debounce(() => { q = si.value.trim().toLowerCase(); draw(); }, 120));
  }

  /** Upload dialog scoped to one supplier, with PO / invoice linking. */
  function uploadForSupplier(sid, preFiles, done) {
    const s = store.get('suppliers', sid);
    let picked = (preFiles || []).slice();
    const pos = supplierPOs(sid);
    const invs = store.filter('invoices', i => i.supplierId === sid);
    const guessKind = f => { const n = (f.name || '').toLowerCase(); return /inv/.test(n) ? 'Invoice' : /\bpo\b|purchase.?order|p\.o/.test(n) ? 'Purchase Order' : /quot|qte|rfq|bid/.test(n) ? 'Quotation' : /tcc|tax.?compl/.test(n) ? 'Tax Compliance Certificate' : /ppc|ncc|regist/.test(n) ? 'PPC / NCC Registration' : /grn|deliver|waybill/.test(n) ? 'Delivery Note / GRN' : /memo|approval/.test(n) ? 'Approval Memo' : 'Quotation'; };
    const body = '<div class="dz"></div><div class="picked small mt-1"></div><div class="form-grid mt-2">' +
      '<div class="field s6"><label>Document type</label><select name="kind">' + ui.options(K.DOC_KINDS, picked.length ? guessKind(picked[0]) : 'Quotation') + '</select></div>' +
      '<div class="field s6"><label>Reference / number</label><input name="ref" placeholder="Quote no., invoice no., certificate no."></div>' +
      '<div class="field s6"><label>Link to purchase order</label><select name="poId">' + ui.options(pos.map(p => ({ value: p.id, label: poLabel(p) + ' · ' + util.date(p.date) + ' · ' + util.money(p.total) })), '', '— None —') + '</select></div>' +
      '<div class="field s6"><label>Link to invoice</label><select name="invoiceId">' + ui.options(invs.map(i => ({ value: i.id, label: 'Invoice ' + i.invoiceNumber + ' · ' + util.money(i.total) })), '', '— None —') + '</select></div>' +
      '<div class="field s4"><label>Document date</label><input type="date" name="date" value="' + util.today() + '"></div>' +
      '<div class="field s4"><label>Amount (JMD)</label><input type="number" step="0.01" name="amount"></div>' +
      '<div class="field s4 cert-exp" hidden><label>Certificate expiry</label><input type="date" name="expiry"><div class="hint">Updates the supplier’s compliance record</div></div>' +
      '<div class="field s12"><label>Notes</label><input name="notes"></div></div>';
    ui.modal({
      title: 'Upload documents · ' + s.name, size: 'lg', body, noFocus: true,
      onOpen: el => {
        const showPicked = () => { el.querySelector('.picked').innerHTML = picked.length ? picked.map(f => ui.icon('clip', 'sm') + ' ' + esc(f.name) + ' <span class="muted">(' + util.fileSize(f.size) + ')</span>').join('<br>') : '<span class="muted">No files chosen yet</span>'; };
        ui.dropzone(el.querySelector('.dz'), fs => { picked = picked.concat(fs); if (fs[0]) el.querySelector('[name=kind]').value = guessKind(fs[0]); syncKind(); showPicked(); });
        const kindSel = el.querySelector('[name=kind]');
        const syncKind = () => { el.querySelector('.cert-exp').hidden = ['Tax Compliance Certificate', 'PPC / NCC Registration'].indexOf(kindSel.value) < 0; };
        kindSel.onchange = syncKind; syncKind(); showPicked();
        el.querySelector('[name=poId]').onchange = e => { const p = store.get('purchaseOrders', e.target.value); if (p && !el.querySelector('[name=amount]').value && kindSel.value === 'Purchase Order') el.querySelector('[name=amount]').value = p.total; if (p && !el.querySelector('[name=ref]').value && kindSel.value === 'Purchase Order') el.querySelector('[name=ref]').value = p.poNumber || ''; };
        el.querySelector('[name=invoiceId]').onchange = e => { const i = store.get('invoices', e.target.value); if (i) { if (!el.querySelector('[name=ref]').value) el.querySelector('[name=ref]').value = i.invoiceNumber; if (!el.querySelector('[name=amount]').value) el.querySelector('[name=amount]').value = i.total; if (i.poId) el.querySelector('[name=poId]').value = i.poId; } };
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Upload', kind: 'primary', icon: 'upload', onClick: async (close, el) => {
          if (!picked.length) { ui.toast('Choose at least one file.', 'warning'); return false; }
          const f = ui.formData(el);
          const links = {}; if (f.poId) links.poId = f.poId; if (f.invoiceId) links.invoiceId = f.invoiceId;
          for (const file of picked) await files.add(file, { kind: f.kind, supplierId: sid, ref: f.ref, date: f.date, amount: util.num(f.amount) || 0, notes: f.notes, links });
          if (f.expiry && f.kind === 'Tax Compliance Certificate') store.upsert('suppliers', { id: sid, tccExpiry: f.expiry, tccNumber: f.ref || s.tccNumber || '' });
          if (f.expiry && f.kind === 'PPC / NCC Registration') store.upsert('suppliers', { id: sid, ppcExpiry: f.expiry, ppcNumber: f.ref || s.ppcNumber || '', ppcRegistered: 'Yes' });
          ui.toast(picked.length + ' ' + util.plural(picked.length, 'document') + ' filed under ' + s.name);
          if (done) setTimeout(done, 30);
        }
      }]
    });
  }

  /* Activity */
  function tabActivity(body, s) {
    const ids = new Set([s.id]);
    const pos = supplierPOs(s.id); pos.forEach(p => ids.add(p.id));
    const invs = store.filter('invoices', i => i.supplierId === s.id); invs.forEach(i => ids.add(i.id));
    const docs = files.forSupplier(s.id); docs.forEach(d => ids.add(d.id));
    const dels = store.filter('deliveries', d => ids.has(d.poId));
    const names = [s.name].concat(s.aliases || []).map(n => n.toLowerCase()).filter(n => n.length > 3);
    const ev = [];
    (store.db.auditLog || []).forEach(a => {
      const det = String(a.details || '').toLowerCase();
      if ((a.ref && ids.has(a.ref)) || names.some(n => det.indexOf(n) >= 0)) ev.push({ ts: a.timestamp, title: a.action, detail: a.details, user: a.user });
    });
    const seen = new Set(ev.map(e => e.title + '|' + (e.ts || '').slice(0, 16)));
    const add = (ts, title, detail, href) => { if (!ts) return; const k = title + '|' + String(ts).slice(0, 16); if (seen.has(k)) return; ev.push({ ts, title, detail, href }); };
    pos.forEach(p => add(p.date ? p.date + 'T12:00:00' : p.createdAt, (p.poNumber ? 'PO ' + p.poNumber : 'Draft PO') + ' · ' + util.money(p.total), p.description, poHref(p)));
    invs.forEach(i => { add(i.date ? i.date + 'T12:00:00' : i.createdAt, 'Invoice ' + i.invoiceNumber + ' received · ' + util.money(i.total), '', '#/invoices/' + i.id); if (i.paidDate) add(i.paidDate + 'T13:00:00', 'Invoice ' + i.invoiceNumber + ' paid', i.paymentRef ? 'Ref ' + i.paymentRef : '', '#/invoices/' + i.id); });
    dels.forEach(d => { const p = store.get('purchaseOrders', d.poId); add(d.date ? d.date + 'T11:00:00' : d.createdAt, 'Delivery received' + (d.grn ? ' · GRN ' + d.grn : ''), p ? poLabel(p) + (d.condition ? ' · ' + d.condition : '') : '', p ? poHref(p) : ''); });
    docs.forEach(d => add(d.createdAt, 'Document filed · ' + d.kind, d.title || d.name));
    add(s.createdAt, 'Supplier file created', s.createdBy ? 'By ' + s.createdBy : '');
    ev.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    if (!ev.length) { body.innerHTML = ui.empty('history', 'No activity yet'); return; }
    body.innerHTML = '<div class="card-b"><div class="timeline">' + ev.slice(0, 150).map(e => '<div class="tl-item"><div class="strong">' + (e.href ? '<a href="' + e.href + '">' + esc(e.title) + '</a>' : esc(e.title)) + '</div>' +
      (e.detail ? '<div class="muted" style="white-space:normal">' + esc(e.detail) + '</div>' : '') + '<div class="when">' + util.dateTime(e.ts) + (e.user ? ' · ' + esc(e.user) : '') + '</div></div>').join('') +
      (ev.length > 150 ? '<div class="muted small">Showing latest 150 of ' + ev.length + ' events</div>' : '') + '</div></div>';
  }

  /* ------------------------------------------------------------ register */
  Proc.page({
    id: 'suppliers', title: 'Suppliers', icon: 'building', section: 'Records', order: 10,
    count: () => store.list('suppliers').filter(s => { const e = domain.expiryState(s.tccExpiry); return e && e.tone === 'danger' && (s.status || 'Active') === 'Active'; }).length,
    countAlert: true,
    render(el, params) {
      const [id, sub] = params;
      if (!id) return renderDirectory(el);
      if (id === 'new') return renderForm(el, null);
      if (sub === 'edit') return renderForm(el, id);
      return renderProfile(el, id, sub);
    }
  });
  Proc.quickCreate.push({ label: 'Supplier', icon: 'building', order: 60, onClick: () => router.go('suppliers/new') });

  // Shared helpers for other modules (documents page uses the supplier upload flow).
  Proc.suppliers = { merge: mergeSuppliers, upload: uploadForSupplier, findDuplicates: findDuplicateGroups };
})();
