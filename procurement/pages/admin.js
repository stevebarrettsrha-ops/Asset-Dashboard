/* Administration: Settings (profile, organisation, signatories, approval limits,
   letterhead, officers, backup/restore) and the Audit Log. */
(function () {
  'use strict';
  const { util, ui, store, domain } = Proc;
  const esc = util.esc;

  const TABS = [
    { id: 'profile', label: 'My profile', icon: 'user' },
    { id: 'org', label: 'Organisation', icon: 'building' },
    { id: 'approvals', label: 'Signatories & limits', icon: 'stamp' },
    { id: 'letterhead', label: 'Letterhead', icon: 'file' },
    { id: 'officers', label: 'Officers', icon: 'user' },
    { id: 'data', label: 'Data & backup', icon: 'cloud' }
  ];

  function field(name, label, value, o) {
    o = o || {};
    const v = value === undefined || value === null ? '' : value;
    let input;
    if (o.type === 'textarea') input = '<textarea name="' + name + '" rows="' + (o.rows || 4) + '">' + esc(v) + '</textarea>';
    else if (o.type === 'checkbox') input = '<label class="check"><input type="checkbox" name="' + name + '"' + (v ? ' checked' : '') + '> ' + esc(o.checkLabel || '') + '</label>';
    else input = (o.prefix ? '<div class="input-group"><span class="prefix">' + esc(o.prefix) + '</span>' : '') +
      '<input name="' + name + '" type="' + (o.type || 'text') + '" value="' + esc(v) + '"' + (o.step ? ' step="' + o.step + '"' : '') + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + '>' + (o.prefix ? '</div>' : '');
    return '<div class="field ' + (o.span || 's6') + '"><label>' + esc(label) + '</label>' + input + (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '</div>';
  }
  const card = (title, sub, body, foot) => '<div class="card"><div class="card-h"><div><h3>' + esc(title) + '</h3>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div></div><div class="card-b">' + body + '</div>' + (foot ? '<div class="card-f">' + foot + '</div>' : '') + '</div>';
  const saveBtn = '<button class="btn primary" data-save>' + ui.icon('check', 'sm') + 'Save changes</button>';

  function renderSettings(el, params) {
    const tab = TABS.find(t => t.id === params[0]) ? params[0] : 'profile';
    el.innerHTML = ui.pageHead({ title: 'Settings', sub: 'How the system prints memos and purchase orders, who approves what, and your data.' }) +
      '<div class="tabs">' + TABS.map(t => '<button class="' + (t.id === tab ? 'on' : '') + '" data-tab="' + t.id + '">' + ui.icon(t.icon, 'sm') + esc(t.label) + '</button>').join('') + '</div><div id="setBody"></div>';
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => Proc.router.go('settings/' + b.dataset.tab));
    const body = el.querySelector('#setBody');
    ui.setCrumbs(['Settings', TABS.find(t => t.id === tab).label]);
    ({ profile, org, approvals, letterhead, officers, data })[tab](body);
  }

  function profile(body) {
    const u = Proc.auth.user; const off = domain.officer();
    body.innerHTML = '<div class="grid side">' + card('Your details', 'Printed as the “From” officer on approval memos and as “Prepared by” on purchase orders and comparison sheets.',
      '<div class="form-grid">' + field('name', 'Name as printed', off.name, { span: 's12', placeholder: 'e.g. Ms. Christine Crawford', hint: 'Include Mr./Ms./Mrs. as on your letters.' }) +
      field('title', 'Job title', off.title) + field('phone', 'Phone / extension', off.phone) + field('email', 'Email', off.email, { type: 'email', span: 's12' }) + '</div>', saveBtn) +
      card('Signed in as', '', '<dl class="kv tight"><dt>Username</dt><dd>' + esc(u.username) + '</dd><dt>Account name</dt><dd>' + esc(u.displayName) + '</dd><dt>Role</dt><dd>' + esc(u.role || '') + '</dd></dl>') + '</div>';
    body.querySelector('[data-save]').onclick = () => {
      const v = ui.formData(body);
      if (!v.name) return ui.toast('Enter your name as it should be printed.', 'warning');
      const officers = Object.assign({}, store.settings().officers); officers[u.username] = { name: v.name, title: v.title || 'Public Procurement Officer', phone: v.phone, email: v.email };
      store.saveSettings({ officers }); Proc.audit('Update Profile', v.name); Proc.shell.renderTop(); ui.toast('Profile saved');
    };
  }

  function org(body) {
    const o = store.settings().org;
    body.innerHTML = card('Organisation', 'Used on the letterhead, purchase orders and the PRS return.',
      '<div class="form-grid">' + field('hospital', 'Facility / hospital', o.hospital) + field('authority', 'Regional authority', o.authority) +
      field('parishServices', 'Parish health services', o.parishServices) + field('publicBody', 'Public body (PRS)', o.publicBody, { hint: 'Exactly as it should appear in the PRS “Public Body” column.' }) +
      field('refCode', 'Reference code', o.refCode, { span: 's3', hint: 'Used in refs like RFQ-…-MPH/102026' }) + field('parish', 'Parish', o.parish, { span: 's3' }) +
      field('address', 'Address', o.address, { span: 's12' }) + field('tel', 'Telephone', o.tel, { span: 's4' }) + field('fax', 'Fax', o.fax, { span: 's4' }) + field('website', 'Website', o.website, { span: 's4' }) +
      field('values', 'Values line', o.values, { span: 's12' }) + field('deliveryAddress', 'Default delivery address on POs', o.deliveryAddress, { span: 's12' }) + '</div>', saveBtn);
    body.querySelector('[data-save]').onclick = () => { store.saveSettings({ org: Object.assign({}, o, ui.formData(body)) }); Proc.audit('Update Settings', 'Organisation'); ui.toast('Organisation details saved'); };
  }

  function approvals(body) {
    const s = store.settings(), S = s.signatories, L = s.limits;
    const person = (k, label, withTitle) => '<div class="form-section-title">' + esc(label) + '</div>' + field(k + '.name', 'Name', S[k].name, { span: withTitle ? 's4' : 's6' }) +
      (withTitle ? field(k + '.title', 'Title', S[k].title, { span: 's4' }) : '') + field(k + '.org', 'Organisation', S[k].org, { span: withTitle ? 's4' : 's6' });
    body.innerHTML = '<div class="grid side">' + card('Memo signatories', 'Who the approval memos are addressed to.',
      '<div class="form-grid">' + person('committee', 'Procurement committee (Thru, on committee memos)') + person('parishManager', 'Parish Manager (To on committee memos; From on Head of Entity memos)', true) +
      person('ceo', 'Chief Executive Officer (Thru, on Head of Entity memos)', true) + person('regionalDirector', 'Regional Director — Head of Entity (To, on Head of Entity memos)', true) + '</div>', saveBtn) +
      '<div>' + card('Approval limits (JMD)', 'Drives the approval route, which memos are produced, and warnings.',
        '<div class="form-grid">' + field('committeeMin', 'Committee review from', L.committeeMin, { type: 'number', prefix: '$', span: 's12', hint: 'Handbook §2.2.5(i): the lower limit should be no greater than $1.5M.' }) +
        field('delegated', 'Parish Manager delegated authority', L.delegated, { type: 'number', prefix: '$', span: 's12', hint: 'Awards above this need a Head of Entity memo to the Regional Director.' }) +
        field('ncc', 'NCC / PPC endorsement above', L.ncc, { type: 'number', prefix: '$', span: 's12', hint: 'Handbook §2.4: above J$15M.' }) +
        field('cabinet', 'Cabinet approval above', L.cabinet, { type: 'number', prefix: '$', span: 's12', hint: 'Handbook §2.4: above J$40M.' }) +
        field('gctRate', 'GCT rate (%)', util.round2(s.gctRate * 100), { type: 'number', step: '0.01', span: 's6' }) +
        field('approvalBlock', 'Memo approval box', s.memo.approvalBlock, { type: 'checkbox', checkLabel: 'Print Approved / Not approved box', span: 's6' }) + '</div>') +
      '<div class="card"><div class="card-h"><h3>Route preview</h3></div><div class="card-b" id="routePrev"></div></div></div></div>';
    const prev = () => { body.querySelector('#routePrev').innerHTML = '<div class="small muted mb-2">Example: award of ' + util.money(2534577) + '</div>' + ui.routeHtml(domain.approvalRoute(2534577)); };
    prev();
    body.querySelector('[data-save]').onclick = () => {
      const v = ui.formData(body);
      const sig = util.clone(S);
      Object.keys(v).forEach(k => { const [a, b] = k.split('.'); if (b && sig[a]) sig[a][b] = v[k]; });
      const limits = { committeeMin: util.num(v.committeeMin), delegated: util.num(v.delegated), ncc: util.num(v.ncc), cabinet: util.num(v.cabinet) };
      if (!(limits.delegated > 0 && limits.ncc > limits.delegated && limits.cabinet > limits.ncc)) return ui.toast('Limits must increase: delegated < NCC < Cabinet.', 'warning');
      store.saveSettings({ signatories: sig, limits, gctRate: util.num(v.gctRate) / 100, memo: Object.assign({}, s.memo, { approvalBlock: !!v.approvalBlock }) });
      Proc.audit('Update Settings', 'Signatories and approval limits'); prev(); ui.toast('Signatories and limits saved');
    };
  }

  function letterhead(body) {
    const lh = store.settings().letterhead;
    const facText = lh.facilities.map(b => b.join('\n')).join('\n\n');
    body.innerHTML = '<div class="grid c2">' + card('Board footer', 'Printed across the bottom of every memo page. Words ending in “:” print in bold.',
      '<div class="form-grid">' + field('footer', 'Footer text', lh.footer, { type: 'textarea', rows: 8, span: 's12' }) + '</div>') +
      card('Facilities column', 'Printed down the left side of the letterhead. One facility per block; leave a blank line between blocks. The first line of each block prints in bold.',
        '<div class="form-grid">' + field('facilities', 'Facilities', facText, { type: 'textarea', rows: 18, span: 's12' }) + '</div>') + '</div>' +
      '<div class="row end mt-2"><button class="btn" data-sample>' + ui.icon('eye', 'sm') + 'Preview a sample memo</button>' + saveBtn + '</div>';
    body.querySelector('[data-save]').onclick = () => {
      const v = ui.formData(body);
      const facilities = v.facilities.split(/\n\s*\n/).map(b => b.split('\n').map(x => x.replace(/\s+$/, '')).filter(x => x.trim())).filter(b => b.length);
      store.saveSettings({ letterhead: { footer: v.footer, facilities } }); Proc.audit('Update Settings', 'Letterhead'); ui.toast('Letterhead saved');
    };
    body.querySelector('[data-sample]').onclick = () => {
      if (!(Proc.pdf && Proc.pdf.memo)) return ui.toast('The PDF engine is not loaded.', 'warning');
      Proc.pdf.memo({ ref: 'RFQ-SAMPLE-' + (store.settings().org.refCode || 'MPH') + '/' + util.today().slice(5, 7) + util.today().slice(0, 4), subject: 'Medical Sundries', date: util.today(), method: 'Restricted Bidding (RB)', viaGojep: true, invited: 3,
        bids: [{ supplier: 'Sample Supplier A Ltd.', price: 2450000, compliant: true }, { supplier: 'Sample Supplier B Ltd.', price: 2610000, compliant: true }],
        awards: [{ supplier: 'Sample Supplier A Ltd.', amount: 2450000 }], from: domain.officer() }, { which: 'all', output: 'open' });
    };
  }

  function officers(body) {
    const offs = store.settings().officers;
    const rows = Object.keys(offs).map(k => Object.assign({ username: k }, offs[k]));
    body.innerHTML = '<div class="card"><div class="card-h"><div><h3>Officer profiles</h3><div class="sub">Names saved by each user the first time they signed in. Used on memos they prepare.</div></div></div><div class="card-b flush" id="offT"></div></div>';
    ui.table(body.querySelector('#offT'), {
      rows, search: false, columns: [
        { key: 'username', label: 'Username', render: r => '<span class="mono">' + esc(r.username) + '</span>' },
        { key: 'name', label: 'Printed name', render: r => '<span class="t-title">' + esc(r.name) + '</span>' },
        { key: 'title', label: 'Title' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
        { key: 'x', label: '', sort: false, cls: 'actions', render: r => '<button class="btn sm ghost" data-edit="' + esc(r.username) + '">' + ui.icon('edit', 'sm') + 'Edit</button>' }
      ],
      empty: ui.empty('user', 'No officer profiles yet', 'Each officer is asked for their printed name the first time they sign in.'),
      bind: tb => tb.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => {
        const k = b.dataset.edit, cur = offs[k] || {};
        const v = await ui.form('Edit officer — ' + k, [{ name: 'name', label: 'Printed name', value: cur.name, required: true }, { name: 'title', label: 'Title', value: cur.title, span: 's6' }, { name: 'phone', label: 'Phone', value: cur.phone, span: 's6' }, { name: 'email', label: 'Email', value: cur.email }]);
        if (!v) return;
        const all = Object.assign({}, store.settings().officers); all[k] = v; store.saveSettings({ officers: all }); Proc.shell.renderTop(); ui.toast('Officer updated'); officers(body);
      })
    });
  }

  function data(body) {
    const db = store.db;
    const counts = store.COLLECTIONS.map(c => ({ c, n: store.list(c).length }));
    const label = { suppliers: 'Suppliers', requisitions: 'Requisitions', comparisons: 'Price comparisons', memos: 'Approval memos', purchaseOrders: 'Purchase orders', deliveries: 'Deliveries', invoices: 'Invoices', documents: 'Documents', plans: 'Plan lines' };
    const syncState = { off: 'Not connected', on: 'Connected', busy: 'Syncing…', err: 'Problem — retrying' }[Proc.sync.state];
    body.innerHTML = '<div class="grid c2">' +
      card('Records on this computer', '', '<dl class="kv tight">' + counts.map(x => '<dt>' + esc(label[x.c] || x.c) + '</dt><dd>' + util.int(x.n) + '</dd>').join('') + '<dt>Audit entries</dt><dd>' + util.int(db.auditLog.length) + '</dd></dl><div class="small muted mt-2" id="quota"></div>') +
      card('Google Drive sync', 'Records sync every few seconds to <span class="mono">PROCUREMENT_BACKUP.json</span> in the shared Drive folder; uploaded documents are copied to its “Procurement Documents” folder.',
        '<dl class="kv tight"><dt>Status</dt><dd>' + esc(syncState) + '</dd><dt>Last sync</dt><dd>' + (Proc.sync.lastSync ? util.ago(Proc.sync.lastSync) : '—') + '</dd></dl>' +
        (Proc.sync.state === 'off' ? '<div class="alert mt-2">' + ui.icon('info') + '<div>To connect, sign in to Google on the main Fixed Asset dashboard, then reload this page. All computers that connect share the same records and documents.</div></div>' : ''),
        '<button class="btn" data-sync' + (Proc.sync.state === 'off' ? ' disabled' : '') + '>' + ui.icon('refresh', 'sm') + 'Sync now</button>') +
      card('Backup', 'Download everything (records and settings) as a JSON file, or merge a backup back in. Documents are not inside the backup file.',
        '<div class="row"><button class="btn primary" data-export>' + ui.icon('download', 'sm') + 'Download backup</button><label class="btn">' + ui.icon('upload', 'sm') + 'Restore / merge backup<input type="file" accept=".json,application/json" hidden data-restore></label></div>' +
        '<div class="small muted mt-2">Merging keeps the newest version of each record.</div>') +
      card('Danger zone', 'Remove every procurement record from this computer. Use only when instructed.',
        '<button class="btn danger" data-wipe>' + ui.icon('trash', 'sm') + 'Erase all procurement data</button>') + '</div>';
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { const q = body.querySelector('#quota'); if (q) q.textContent = 'Browser storage used: ' + util.fileSize(e.usage) + ' of ' + util.fileSize(e.quota) + ' available.'; });
    body.querySelector('[data-export]').onclick = () => { util.download(new Blob([store.exportJSON()], { type: 'application/json' }), 'procurement-backup-' + util.today() + '.json'); Proc.audit('Export Backup', 'JSON backup downloaded'); };
    body.querySelector('[data-restore]').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const n = store.merge(JSON.parse(r.result)); Proc.audit('Restore Backup', f.name + ' (' + n + ' changes)'); ui.toast(n ? 'Backup merged — ' + n + ' changes' : 'Nothing new in that backup', n ? 'success' : 'info'); data(body); } catch (err) { ui.toast('That file is not a valid backup: ' + err.message, 'error'); } };
      r.readAsText(f); e.target.value = '';
    };
    const sb = body.querySelector('[data-sync]'); if (sb) sb.onclick = async () => { await Proc.sync.run(); data(body); };
    body.insertAdjacentHTML('beforeend', '<div class="mt-3" id="bkPanel"></div>');
    ui.backupPanel(body.querySelector('#bkPanel'));
    body.querySelector('[data-wipe]').onclick = async () => {
      const v = await ui.form('Erase all procurement data', [{ name: 'confirm', label: 'Type ERASE to confirm', required: true, hint: 'A full backup file is downloaded automatically first. Erasing also removes these records from every computer that syncs with Google Drive.' }], { ok: 'Erase everything' });
      if (!v || v.confirm !== 'ERASE') { if (v) ui.toast('Nothing erased — confirmation text did not match.', 'warning'); return; }
      // Always keep a copy first: download a full backup before anything is removed.
      util.download(new Blob([store.exportJSON()], { type: 'application/json' }), 'procurement-backup-before-erase-' + util.today() + '.json');
      await store.flush();
      const settings = store.db.settings;
      store.COLLECTIONS.forEach(c => { store.list(c).forEach(r => store.remove(c, r.id)); });
      store.db.settings = settings; Proc.audit('Erase Data', 'All procurement records erased'); store.flush(); ui.toast('All procurement records erased'); data(body);
    };
  }

  Proc.page({ id: 'settings', title: 'Settings', icon: 'settings', section: 'Administration', order: 10, render: renderSettings });

  /* ---------------------------------------------------------- audit log */
  Proc.page({
    id: 'audit', title: 'Audit Log', icon: 'history', section: 'Administration', order: 20,
    render(el) {
      const rows = store.db.auditLog.slice();
      const actions = Array.from(new Set(rows.map(r => r.action))).sort();
      const users = Array.from(new Set(rows.map(r => r.user))).sort();
      el.innerHTML = ui.pageHead({ title: 'Audit Log', sub: 'Every sign-in, record change, upload and export, newest first.', actions: '<button class="btn" data-csv>' + ui.icon('download', 'sm') + 'Export CSV</button>' }) + '<div class="card"><div id="audT"></div></div>';
      ui.table(el.querySelector('#audT'), {
        rows, pageSize: 50, placeholder: 'Search details…',
        search: r => [r.action, r.details, r.user, r.ref].join(' '),
        filters: [{ key: 'action', label: 'All actions', options: actions }, { key: 'user', label: 'All users', options: users }],
        initialSort: { key: 'timestamp', dir: -1 },
        columns: [
          { key: 'timestamp', label: 'When', render: r => '<span class="nowrap">' + esc(util.dateTime(r.timestamp)) + '</span>' },
          { key: 'user', label: 'User' },
          { key: 'action', label: 'Action', render: r => '<span class="chip">' + esc(r.action) + '</span>' },
          { key: 'details', label: 'Details', render: r => esc(r.details) }
        ],
        empty: ui.empty('history', 'No activity yet')
      });
      el.querySelector('[data-csv]').onclick = () => util.download(new Blob([util.csv(['Timestamp', 'User', 'Action', 'Details', 'Ref'], rows.map(r => [r.timestamp, r.user, r.action, r.details, r.ref || '']))], { type: 'text/csv' }), 'procurement-audit-log-' + util.today() + '.csv');
    }
  });
})();
