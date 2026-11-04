/* General Stores — Settings (profile, store, locations, categories, classification,
   data + hooks from other stores pages) and the Audit Log. */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc;
  Proc.storesSettingsHooks = Proc.storesSettingsHooks || [];
  const C = Proc.storesC;

  const TABS = [
    { id: 'profile', label: 'My profile', icon: 'user' },
    { id: 'store', label: 'Store', icon: 'building' },
    { id: 'locations', label: 'Locations', icon: 'pin' },
    { id: 'categories', label: 'Categories', icon: 'tag' },
    { id: 'classification', label: 'Stock / asset rules', icon: 'layers' },
    { id: 'data', label: 'Data & backup', icon: 'cloud' }
  ];
  const CSS = '.sa-list{display:flex;flex-wrap:wrap;gap:8px}.sa-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 11px;border:1px solid var(--border);border-radius:999px;background:var(--surface-2);font-size:13px}' +
    '.sa-chip button{border:0;background:transparent;color:var(--text-3);cursor:pointer;width:22px;height:22px;border-radius:50%;display:grid;place-items:center}.sa-chip button:hover{background:var(--danger-bg);color:var(--danger)}' +
    '.sa-test{display:flex;gap:10px;align-items:center}.sa-res{min-width:110px}';
  const S = () => store.settings().stores || {};
  function saveStores(patch) { store.saveSettings({ stores: Object.assign({}, S(), patch) }); }
  const card = (title, sub, body, foot) => '<div class="card"><div class="card-h"><div><h3>' + esc(title) + '</h3>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div></div><div class="card-b">' + body + '</div>' + (foot ? '<div class="card-f">' + foot + '</div>' : '') + '</div>';
  const field = (name, label, value, o) => { o = o || {}; return '<div class="field ' + (o.span || 's6') + '"><label>' + esc(label) + '</label>' + (o.prefix ? '<div class="input-group"><span class="prefix">' + esc(o.prefix) + '</span>' : '') + '<input name="' + name + '" type="' + (o.type || 'text') + '" value="' + esc(value === undefined || value === null ? '' : value) + '"' + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + '>' + (o.prefix ? '</div>' : '') + (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '</div>'; };
  const saveBtn = '<button class="btn primary" data-save>' + ui.icon('check', 'sm') + 'Save changes</button>';

  function renderSettings(el, params) {
    C.css('css-sadmin', CSS);
    const hooks = Proc.storesSettingsHooks;
    const tabs = TABS.concat(hooks.map((h, i) => ({ id: 'hook' + i, label: h.title, icon: h.icon || 'upload' })));
    const tab = tabs.find(t => t.id === params[0]) ? params[0] : 'profile';
    el.innerHTML = ui.pageHead({ title: 'Settings', sub: 'Your details, the store, locations and categories, how purchase-order lines are sorted into stock and assets, and your data.' }) +
      '<div class="tabs">' + tabs.map(t => '<button class="' + (t.id === tab ? 'on' : '') + '" data-tab="' + t.id + '">' + ui.icon(t.icon, 'sm') + esc(t.label) + '</button>').join('') + '</div><div id="saBody"></div>';
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => router.go('settings/' + b.dataset.tab));
    ui.setCrumbs(['Settings', tabs.find(t => t.id === tab).label]);
    const body = el.querySelector('#saBody');
    if (/^hook\d+$/.test(tab)) { try { hooks[+tab.slice(4)].render(body); } catch (e) { body.innerHTML = '<div class="alert danger">' + ui.icon('alert') + '<div>' + esc(e.message) + '</div></div>'; } return; }
    ({ profile, store: storeTab, locations: () => listTab(body, 'locations', 'Locations', 'Bins, shelves and rooms where stock is kept. Offered when receiving and on each item.', 'e.g. Shelf D, Cold Room 2'),
      categories: () => listTab(body, 'categories', 'Categories', 'Stock categories used on items and in the valuation report.', 'e.g. Dental Supplies'), classification, data })[tab](body);
  }

  function profile(body) {
    const u = Proc.auth.user; const off = domain.officer();
    body.innerHTML = '<div class="grid side">' + card('Your details', 'Printed on goods received notes, issue vouchers and stock reports.',
      '<div class="form-grid">' + field('name', 'Name as printed', off.name, { span: 's12', placeholder: 'e.g. Mr. Andre Wallace' }) + field('title', 'Job title', off.title) + field('phone', 'Phone / extension', off.phone) + field('email', 'Email', off.email, { type: 'email', span: 's12' }) + '</div>', saveBtn) +
      card('Signed in as', '', '<dl class="kv tight"><dt>Username</dt><dd>' + esc(u.username) + '</dd><dt>Account name</dt><dd>' + esc(u.displayName) + '</dd><dt>Signed in</dt><dd>' + (u.viaPortal ? 'Through the hospital portal' : 'On this page') + '</dd></dl>') + '</div>';
    body.querySelector('[data-save]').onclick = () => {
      const v = ui.formData(body);
      if (!v.name) return ui.toast('Enter your name as it should be printed.', 'warning');
      const officers = Object.assign({}, store.settings().officers); officers[u.username] = { name: v.name, title: v.title || 'Storekeeper', phone: v.phone, email: v.email };
      store.saveSettings({ officers }); Proc.audit('Update Profile', v.name); Proc.shell.renderTop(); ui.toast('Profile saved');
    };
  }

  function storeTab(body) {
    const s = S();
    body.innerHTML = '<div class="grid side">' + card('Store', 'Used on documents and to work out expected deliveries and expiry warnings.',
      '<div class="form-grid">' + field('storeName', 'Store name', s.storeName, { span: 's12' }) +
      field('leadDays', 'Default delivery lead time (days)', s.leadDays, { type: 'number', hint: 'Expected delivery = PO date + this, unless the PO gives a date.' }) +
      field('expiryWarnDays', 'Warn about expiry (days ahead)', s.expiryWarnDays, { type: 'number' }) +
      field('assetThreshold', 'Fixed asset threshold (unit price)', s.assetThreshold, { type: 'number', prefix: '$', span: 's12', hint: 'A purchase-order line at or above this unit price is treated as a fixed asset unless it is a service. Words like chair, bed, machine or computer mark an asset at any price.' }) + '</div>', saveBtn) +
      card('How this is used', '', '<ul class="list-plain small"><li><b>Expected Deliveries</b> flags POs as overdue after the lead time.</li><li><b>Fixed assets</b> on a PO go to the Fixed Asset Officer to register after you receive them.</li><li><b>Expiry warnings</b> show on the dashboard and in the Expiry report.</li></ul>') + '</div>';
    body.querySelector('[data-save]').onclick = () => {
      const v = ui.formData(body);
      const lead = util.num(v.leadDays), warn = util.num(v.expiryWarnDays), thr = util.num(v.assetThreshold);
      if (!(lead >= 0 && warn > 0 && thr >= 0)) return ui.toast('Enter positive numbers for the lead time, expiry warning and threshold.', 'warning');
      saveStores({ storeName: v.storeName || 'General Stores', leadDays: lead, expiryWarnDays: warn, assetThreshold: thr });
      Proc.audit('Update Settings', 'Store settings'); ui.toast('Store settings saved');
    };
  }

  function listTab(body, key, title, sub, ph) {
    const draw = () => {
      const list = (S()[key] || []).slice();
      const used = key === 'locations' ? new Set(store.list('stockItems').map(i => i.location)) : new Set(store.list('stockItems').map(i => i.category));
      body.innerHTML = card(title, sub, '<div class="row mb-3"><input class="input" style="max-width:340px" data-new placeholder="' + esc(ph) + '"><button class="btn" data-add>' + ui.icon('plus', 'sm') + 'Add</button><span class="muted small">' + list.length + ' in the list</span></div>' +
        '<div class="sa-list">' + (list.length ? list.map((x, i) => '<span class="sa-chip">' + esc(x) + (used.has(x) ? ' <span class="muted small">· in use</span>' : '') + '<button data-del="' + i + '" title="Remove">' + ui.icon('x', 'sm') + '</button></span>').join('') : '<span class="muted">None yet.</span>') + '</div>');
      const inp = body.querySelector('[data-new]');
      const add = () => { const v = inp.value.trim(); if (!v) return; if (list.some(x => x.toLowerCase() === v.toLowerCase())) return ui.toast('“' + v + '” is already in the list.', 'warning'); list.push(v); saveStores({ [key]: list }); Proc.audit('Update Settings', title + ': added ' + v); draw(); body.querySelector('[data-new]').focus(); };
      body.querySelector('[data-add]').onclick = add;
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
      body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const v = list[+b.dataset.del];
        if (used.has(v) && !(await ui.confirm('“' + esc(v) + '” is used on stock items. Remove it from the list anyway? The items keep their value.', { ok: 'Remove' }))) return;
        list.splice(+b.dataset.del, 1); saveStores({ [key]: list }); Proc.audit('Update Settings', title + ': removed ' + v); draw();
      });
    };
    draw();
  }

  function classification(body) {
    const s = S();
    const sample = (domain.inbound ? domain.inbound({ includeServices: true, includeComplete: true }) : []).slice(-12).reverse();
    body.innerHTML = '<div class="grid side">' + card('Sorting purchase-order lines', 'Every line on a purchase order is Stock (goes into the store), Asset (furniture, machinery, tools, equipment — registered by the Fixed Asset Officer) or Service (nothing to receive). An officer can always change the type on a line.',
      '<div class="form-grid"><div class="field s12"><label>Extra words that mean a fixed asset</label><textarea name="assetKeywords" rows="2" placeholder="e.g. sterilizer drum, oxygen regulator">' + esc(s.assetKeywords || '') + '</textarea><div class="hint">Comma separated. Built in: chair, desk, bed, trolley, machine, equipment, computer, printer, refrigerator, air conditioning unit, generator, tools and more.</div></div>' +
      '<div class="field s12"><label>Extra words that mean a service</label><textarea name="serviceKeywords" rows="2" placeholder="e.g. waste collection, licence renewal">' + esc(s.serviceKeywords || '') + '</textarea><div class="hint">Comma separated. Built in: repair, maintenance, rental, installation, collection, disposal, transport, training and more.</div></div>' +
      '<div class="field s12"><label>Try a description</label><div class="sa-test"><input class="input" data-try placeholder="e.g. 12 ea - Industrial wall fans"><input class="input" style="width:150px" type="number" data-price placeholder="Unit price"><span class="sa-res" data-res></span></div></div></div>', saveBtn) +
      card('Recent purchase-order lines', 'How current lines are sorted with the saved rules.', sample.length ? '<table class="table compact"><tbody>' + sample.map(r => '<tr><td><div class="t-title truncate" style="max-width:260px">' + esc(r.line.description) + '</div><div class="t-sub">PO ' + esc(r.po.poNumber) + ' · ' + util.money(r.line.unitPrice) + '</div></td><td class="right">' + typeBadge(r.type) + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">No purchase orders to show yet.</p>') + '</div>';
    const test = () => {
      const d = body.querySelector('[data-try]').value; const p = util.num(body.querySelector('[data-price]').value);
      const saved = S(); const tmp = Object.assign({}, saved, { assetKeywords: body.querySelector('[name=assetKeywords]').value, serviceKeywords: body.querySelector('[name=serviceKeywords]').value });
      store.db.settings.stores = tmp; // test against the unsaved words, then put the saved settings back
      const t = d ? domain.classifyLine({ description: d, unitPrice: p }, null) : '';
      store.db.settings.stores = saved;
      body.querySelector('[data-res]').innerHTML = t ? typeBadge(t) : '';
    };
    body.addEventListener('input', util.debounce(test, 150));
    body.querySelector('[data-save]').onclick = () => {
      const v = ui.formData(body);
      saveStores({ assetKeywords: v.assetKeywords, serviceKeywords: v.serviceKeywords });
      Proc.audit('Update Settings', 'Stock / asset classification words'); ui.toast('Rules saved — expected deliveries and the asset list use them straight away'); classification(body);
    };
  }
  const typeBadge = t => ui.badge(t, t === 'Asset' ? 'purple' : t === 'Service' ? '' : 'info');

  function data(body) {
    const n = c => util.int(store.list(c).length);
    const syncState = { off: 'Not connected', on: 'Connected', busy: 'Syncing…', err: 'Problem — retrying' }[Proc.sync.state];
    body.innerHTML = '<div class="grid c2">' +
      card('Records on this computer', 'General Stores shares its records with Procurement and Fixed Assets.', '<dl class="kv tight"><dt>Stock items</dt><dd>' + n('stockItems') + '</dd><dt>Stock movements</dt><dd>' + n('stockMoves') + '</dd><dt>Issue vouchers</dt><dd>' + n('stockIssues') + '</dd><dt>Stock counts</dt><dd>' + n('stockCounts') + '</dd><dt>Goods received notes</dt><dd>' + n('deliveries') + '</dd><dt>Supplier returns</dt><dd>' + n('supplierReturns') + '</dd><dt>Purchase orders</dt><dd>' + n('purchaseOrders') + '</dd></dl>') +
      card('Google Drive sync', 'Everything syncs through the shared procurement records file, so Procurement sees deliveries as soon as you record them.',
        '<dl class="kv tight"><dt>Status</dt><dd>' + esc(syncState) + '</dd><dt>Last sync</dt><dd>' + (Proc.sync.lastSync ? util.ago(Proc.sync.lastSync) : '—') + '</dd></dl>' +
        (Proc.sync.state === 'off' ? '<div class="alert mt-2">' + ui.icon('info') + '<div>Sign in on the hospital portal (Sync Now) or the Fixed Asset dashboard to connect Google Drive, then reload.</div></div>' : ''),
        '<button class="btn" data-sync' + (Proc.sync.state === 'off' ? ' disabled' : '') + '>' + ui.icon('refresh', 'sm') + 'Sync now</button>') +
      card('Backup', 'Download all records and settings as one JSON file.', '<button class="btn primary" data-export>' + ui.icon('download', 'sm') + 'Download backup</button>') +
      (Proc.storesSettingsHooks.length ? card('More', '', Proc.storesSettingsHooks.map((h, i) => '<a class="btn" href="#/settings/hook' + i + '">' + ui.icon(h.icon || 'upload', 'sm') + esc(h.title) + '</a>').join(' ')) : '') + '</div>';
    body.querySelector('[data-export]').onclick = () => { util.download(new Blob([store.exportJSON()], { type: 'application/json' }), 'stores-and-procurement-backup-' + util.today() + '.json'); Proc.audit('Export Backup', 'JSON backup downloaded'); };
    const sb = body.querySelector('[data-sync]'); if (sb) sb.onclick = async () => { await Proc.sync.run(); data(body); };
  }

  Proc.page({ id: 'settings', title: 'Settings', icon: 'settings', section: 'Administration', order: 10, render: renderSettings });

  /* ---------------------------------------------------------- audit log */
  const STORE_ACTIONS = /stock|issue|requisition|grn|receive|deliver|count|adjust|return|write|item|purchase request|put|login|logout|settings|profile|backup|import|migrat/i;
  Proc.page({
    id: 'audit', title: 'Audit Log', icon: 'history', section: 'Administration', order: 20,
    render(el) {
      let all = false;
      const draw = () => {
        const rows = store.db.auditLog.filter(r => all || STORE_ACTIONS.test(r.action || ''));
        const actions = Array.from(new Set(rows.map(r => r.action))).sort();
        const users = Array.from(new Set(rows.map(r => r.user))).sort();
        el.innerHTML = ui.pageHead({ title: 'Audit Log', sub: 'Receipts, issues, adjustments, counts, sign-ins and settings changes, newest first.', actions: '<label class="check"><input type="checkbox" data-all' + (all ? ' checked' : '') + '> Include Procurement activity</label><button class="btn" data-csv>' + ui.icon('download', 'sm') + 'Export CSV</button>' }) + '<div class="card"><div id="audT"></div></div>';
        ui.table(el.querySelector('#audT'), {
          rows, pageSize: 50, placeholder: 'Search details…', search: r => [r.action, r.details, r.user, r.ref].join(' '),
          filters: [{ key: 'action', label: 'All actions', options: actions }, { key: 'user', label: 'All users', options: users }], initialSort: { key: 'timestamp', dir: -1 },
          columns: [
            { key: 'timestamp', label: 'When', render: r => '<span class="nowrap">' + esc(util.dateTime(r.timestamp)) + '</span>' },
            { key: 'user', label: 'User' }, { key: 'action', label: 'Action', render: r => '<span class="chip">' + esc(r.action) + '</span>' }, { key: 'details', label: 'Details', render: r => esc(r.details) }
          ], empty: ui.empty('history', 'No activity yet')
        });
        el.querySelector('[data-all]').onchange = e => { all = e.target.checked; draw(); };
        el.querySelector('[data-csv]').onclick = () => util.download(new Blob([util.csv(['Timestamp', 'User', 'Action', 'Details', 'Ref'], rows.map(r => [r.timestamp, r.user, r.action, r.details, r.ref || '']))], { type: 'text/csv' }), 'stores-audit-log-' + util.today() + '.csv');
      };
      draw();
    }
  });
})();
