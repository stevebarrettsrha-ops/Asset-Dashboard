/* General Stores — Disaster Stock.
   #/disaster            The emergency reserve (hurricanes, floods, mass-casualty events): what is held against
                         what is required, readiness, expiry, checks, releases to an emergency, and shortfalls.
   #/disaster?check=1    Stock check of the whole reserve on one sheet.
   Disaster items are ordinary stock items marked disaster: true (bin cards, batches, alerts and reports all
   work as usual), kept apart in the disaster store with a required level (disasterTarget). */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc;
  const C = Proc.storesC;
  const GROUPS = ['Water & food', 'Medical & first aid', 'Shelter & bedding', 'Power & lighting', 'Hygiene & sanitation', 'Communication', 'Tools & equipment', 'Fuel', 'Other'];
  const CHECK_DAYS = 90;      // the reserve should be counted at least every 3 months
  const EXPIRY_DAYS = 90;     // rotate stock that expires within 3 months
  /** A starting list a hospital disaster store usually holds. Required levels are set by the hospital. */
  const SUGGESTED = [
    ['Bottled drinking water (5 gal)', 'bottle', 'Water & food', true], ['Bottled water 500 ml', 'case', 'Water & food', true], ['Canned meals / tinned meat', 'case', 'Water & food', true],
    ['Crackers', 'case', 'Water & food', true], ['Infant formula', 'case', 'Water & food', true], ['Oral rehydration salts', 'pack', 'Medical & first aid', true],
    ['First aid kit', 'each', 'Medical & first aid', false], ['Examination gloves', 'box', 'Medical & first aid', true], ['IV fluids (normal saline 1L)', 'case', 'Medical & first aid', true],
    ['Dressings and bandages', 'pack', 'Medical & first aid', true], ['Tarpaulin', 'each', 'Shelter & bedding', false], ['Plastic sheeting', 'roll', 'Shelter & bedding', false],
    ['Blankets', 'each', 'Shelter & bedding', false], ['Cots / stretchers', 'each', 'Shelter & bedding', false], ['Flashlight', 'each', 'Power & lighting', false],
    ['Batteries (D)', 'pack', 'Power & lighting', true], ['Batteries (AA)', 'pack', 'Power & lighting', true], ['Rechargeable lantern', 'each', 'Power & lighting', false],
    ['Generator diesel', 'gal', 'Fuel', false], ['Fuel containers (5 gal)', 'each', 'Fuel', false], ['Two-way radio', 'each', 'Communication', false],
    ['Garbage bags', 'roll', 'Hygiene & sanitation', false], ['Bleach', 'gal', 'Hygiene & sanitation', false], ['Hand sanitizer', 'bottle', 'Hygiene & sanitation', true],
    ['Sandbags', 'each', 'Tools & equipment', false], ['Duct tape', 'roll', 'Tools & equipment', false], ['Rope', 'roll', 'Tools & equipment', false], ['Body bags', 'each', 'Medical & first aid', false]
  ];
  const CSS = '.ds-bar{height:7px;border-radius:99px;background:var(--surface-3);overflow:hidden;margin-top:6px;min-width:90px;max-width:180px}.ds-bar i{display:block;height:100%;border-radius:99px;background:var(--success)}' +
    '.ds-bar.ds-low i{background:var(--warning)}.ds-bar.ds-none i{background:var(--danger)}.ds-ready{display:flex;align-items:center;gap:16px;flex-wrap:wrap}' +
    '.ds-ring{--p:0;width:86px;height:86px;border-radius:50%;background:conic-gradient(var(--primary) calc(var(--p)*1%),var(--surface-3) 0);display:grid;place-items:center;flex:none}' +
    '.ds-ring b{width:66px;height:66px;border-radius:50%;background:var(--surface);display:grid;place-items:center;font-size:18px;font-weight:800}' +
    '.ds-chk td{vertical-align:middle}.ds-chk input.input{height:34px;width:100px}.ds-diff{font-weight:600}.ds-diff.neg{color:var(--danger)}.ds-diff.pos{color:var(--success)}' +
    '.ds-banner{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:12px;background:#fff4e5;border:1px solid #f6c37a;color:#5c3b00;margin-bottom:16px}[data-theme=dark] .ds-banner{background:#2b1f0a;border-color:#6b4a0b;color:#fbd38d}';

  const today = () => util.today();
  const items = () => store.list('stockItems').filter(i => i.disaster && i.status !== 'Inactive').sort((a, b) => (GROUPS.indexOf(a.disasterGroup) - GROUPS.indexOf(b.disasterGroup)) || a.name.localeCompare(b.name));
  const target = i => util.num(i.disasterTarget);
  const held = i => util.num(i.onHand);
  function nearestExpiry(i) { const b = (i.batches || []).filter(x => x.expiryDate && util.num(x.qty) > 0).sort((a, c) => a.expiryDate.localeCompare(c.expiryDate))[0]; return b ? b.expiryDate : ''; }
  function status(i) {
    const exp = nearestExpiry(i), d = exp ? util.daysBetween(today(), exp) : null;
    if (d !== null && d < 0) return { k: 'expired', label: 'Expired stock', tone: 'danger' };
    if (!target(i)) return { k: 'unset', label: 'No required level', tone: '' };
    if (held(i) <= 0) return { k: 'empty', label: 'None held', tone: 'danger' };
    if (held(i) < target(i)) return { k: 'short', label: 'Short', tone: 'warning' };
    if (d !== null && d <= EXPIRY_DAYS) return { k: 'expiring', label: 'Rotate soon', tone: 'info' };
    return { k: 'ready', label: 'Ready', tone: 'success' };
  }
  /** Readiness for the dashboard and this page. */
  function summary() {
    const list = items(), set = list.filter(i => target(i) > 0);
    const cover = set.length ? util.sum(set, i => Math.min(1, held(i) / target(i))) / set.length : 0;
    const short = set.filter(i => held(i) < target(i));
    const exp = list.filter(i => { const e = nearestExpiry(i); return e && util.daysBetween(today(), e) <= EXPIRY_DAYS; });
    const expired = list.filter(i => { const e = nearestExpiry(i); return e && util.daysBetween(today(), e) < 0; });
    const checks = list.map(i => i.disasterCheckedAt || '').filter(Boolean).sort();
    const oldest = list.length && checks.length === list.length ? checks[0] : '';
    const unchecked = list.filter(i => !i.disasterCheckedAt || util.daysBetween(i.disasterCheckedAt.slice(0, 10), today()) > CHECK_DAYS);
    return { list, set, pct: Math.round(cover * 100), ready: set.filter(i => held(i) >= target(i)).length, short, exp, expired, oldest, unchecked,
      value: util.sum(list, i => util.num(i.value)), shortValue: util.sum(short, i => (target(i) - held(i)) * (util.num(i.lastCost) || util.num(i.avgCost))) };
  }
  C.disasterSummary = summary;
  const unitOf = i => i.unit || 'each';
  function bar(i) {
    const t = target(i), h = held(i), p = t ? Math.min(100, h / t * 100) : (h > 0 ? 100 : 0);
    return '<div class="ds-bar ' + (h <= 0 ? 'ds-none' : t && h < t ? 'ds-low' : '') + '"><i style="width:' + p + '%"></i></div>';
  }
  const events = () => Array.from(new Set(store.filter('stockIssues', s => s.disaster && s.event).map(s => s.event))).sort();

  /* ================================================================ PAGE */
  function render(el) {
    C.css('css-disaster', CSS);
    if (router.parse().query.check) return renderCheck(el);
    const s = summary();
    const releases = store.filter('stockIssues', x => x.disaster).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    el.innerHTML = ui.pageHead({ title: 'Disaster Stock', sub: 'The emergency reserve kept for hurricanes, floods and mass-casualty events — what is held against what is required, expiry, checks and releases.',
      actions: '<button class="btn" data-a="print">' + ui.icon('printer', 'sm') + 'Checklist</button><button class="btn" data-a="xls">' + ui.icon('download', 'sm') + 'Excel</button>' +
        '<a class="btn" href="#/disaster?check=1">' + ui.icon('clipboardCheck', 'sm') + 'Stock check</a><button class="btn primary" data-a="add">' + ui.icon('plus', 'sm') + 'Add disaster item</button>' }) +
      (C.navTabs ? C.navTabs('disaster') : '') +
      (s.list.length && (s.short.length || s.expired.length || s.unchecked.length) ? '<div class="ds-banner">' + ui.icon('alert') + '<div><b>Not fully ready.</b> ' +
        [s.short.length ? s.short.length + ' ' + util.plural(s.short.length, 'item') + ' below the required level' : '', s.expired.length ? s.expired.length + ' with expired stock' : '', s.unchecked.length ? s.unchecked.length + ' not checked in the last ' + CHECK_DAYS + ' days' : ''].filter(Boolean).join(' · ') +
        (s.short.length ? ' — <a href="#" data-a="request">request the shortfall from Procurement</a>.' : '.') + '</div></div>' : '') +
      '<div class="grid c4 mb-3">' +
      '<div class="kpi"><div class="lbl"><span class="ic">' + ui.icon('shield', 'sm') + '</span>Readiness</div><div class="ds-ready"><div class="ds-ring" style="--p:' + s.pct + '"><b>' + s.pct + '%</b></div><div class="small muted">' + s.ready + ' of ' + s.set.length + ' items at the required level' + (s.list.length > s.set.length ? '<br>' + (s.list.length - s.set.length) + ' without a required level' : '') + '</div></div></div>' +
      ui.kpi({ label: 'Short', icon: 'alert', tone: s.short.length ? 'warn' : 'ok', value: util.int(s.short.length), meta: s.shortValue ? util.money(s.shortValue) + ' to top up (last cost)' : 'Items below the required level' }) +
      ui.kpi({ label: 'Expiry', icon: 'clock', tone: s.expired.length ? 'bad' : s.exp.length ? 'warn' : 'ok', value: util.int(s.exp.length), meta: (s.expired.length ? s.expired.length + ' expired · ' : '') + 'within ' + EXPIRY_DAYS + ' days — rotate' }) +
      ui.kpi({ label: 'Last full check', icon: 'clipboardCheck', tone: s.unchecked.length ? 'warn' : 'ok', value: s.oldest ? util.date(s.oldest.slice(0, 10)) : 'Never', meta: s.unchecked.length ? s.unchecked.length + ' due a check' : 'Every item checked within ' + CHECK_DAYS + ' days', href: '#/disaster?check=1' }) +
      '</div>' +
      '<div class="card mb-3"><div class="card-h"><div><h3>Disaster reserve</h3><div class="sub">' + s.list.length + ' ' + util.plural(s.list.length, 'item') + ' · ' + util.money(s.value) + ' held</div></div>' +
        '<div class="row"><button class="btn sm" data-a="release">' + ui.icon('arrow-up-right', 'sm') + 'Release for an emergency</button><button class="btn sm" data-a="request"' + (s.short.length ? '' : ' disabled') + '>' + ui.icon('send', 'sm') + 'Request shortfall</button></div></div><div id="dsT"></div></div>' +
      '<div class="grid c2"><div class="card"><div class="card-h"><div><h3>Rotate before expiry</h3><div class="sub">Batches expiring within ' + EXPIRY_DAYS + ' days — issue them for normal use and replace</div></div></div><div class="card-b flush" id="dsExp"></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Releases</h3><div class="sub">Disaster stock issued for an emergency</div></div></div><div class="card-b flush" id="dsRel"></div></div></div>';
    // reserve table
    ui.table(el.querySelector('#dsT'), {
      rows: s.list, pageSize: 50, placeholder: 'Search disaster stock…', initialSort: { key: 'group', dir: 1 },
      search: i => [i.name, i.code, i.disasterGroup, i.location].join(' '),
      filters: [{ key: 'disasterGroup', label: 'All groups', options: GROUPS.filter(g => s.list.some(i => i.disasterGroup === g)) },
        { key: 'st', label: 'Any status', options: [{ value: 'short', label: 'Short / none held' }, { value: 'ready', label: 'Ready' }, { value: 'expiring', label: 'Expired / rotate soon' }, { value: 'unset', label: 'No required level' }, { value: 'due', label: 'Due a check' }],
          test: (i, v) => { const k = status(i).k; return v === 'short' ? (k === 'short' || k === 'empty') : v === 'expiring' ? (k === 'expired' || k === 'expiring') : v === 'due' ? (!i.disasterCheckedAt || util.daysBetween(i.disasterCheckedAt.slice(0, 10), today()) > CHECK_DAYS) : k === v; } }],
      onRow: i => router.go('inventory/' + i.id),
      columns: [
        { key: 'group', label: 'Item', sort: i => GROUPS.indexOf(i.disasterGroup) + '|' + i.name, render: i => '<div class="t-title">' + esc(i.name) + '</div><div class="t-sub">' + esc([i.code, i.disasterGroup, i.location].filter(Boolean).join(' · ')) + '</div>' },
        { key: 'held', label: 'Held / required', sort: i => target(i) ? held(i) / target(i) : 9, render: i => '<span class="strong">' + util.round2(held(i)) + '</span> ' + (target(i) ? 'of ' + util.round2(target(i)) + ' ' : '') + esc(unitOf(i)) + bar(i) },
        { key: 'short', label: 'Shortfall', cls: 'num', sort: i => Math.max(0, target(i) - held(i)), render: i => target(i) > held(i) ? '<span class="text-danger strong">' + util.round2(target(i) - held(i)) + '</span>' : '<span class="muted">—</span>' },
        { key: 'exp', label: 'Nearest expiry', sort: i => nearestExpiry(i) || '9999', render: i => { const e = nearestExpiry(i); if (!e) return '<span class="muted">—</span>'; const d = util.daysBetween(today(), e); return '<span class="nowrap' + (d < 0 ? ' text-danger strong' : d <= EXPIRY_DAYS ? ' strong' : '') + '">' + util.date(e) + '</span><div class="t-sub">' + (d < 0 ? 'expired' : d + ' days') + '</div>'; } },
        { key: 'chk', label: 'Last checked', sort: i => i.disasterCheckedAt || '', render: i => i.disasterCheckedAt ? '<span class="nowrap">' + util.date(i.disasterCheckedAt.slice(0, 10)) + '</span><div class="t-sub">' + esc(i.disasterCheckedBy || '') + '</div>' : '<span class="muted">Never</span>' },
        { key: 'st', label: 'Status', sort: i => status(i).k, render: i => ui.badge(status(i).label, status(i).tone) },
        { key: 'x', label: '', sort: false, cls: 'actions', render: i => '<button class="btn xs" data-rcv="' + i.id + '" title="Add stock">' + ui.icon('plus', 'sm') + '</button> <button class="btn xs" data-chk="' + i.id + '" title="Check">' + ui.icon('clipboardCheck', 'sm') + '</button> <button class="btn xs" data-edit="' + i.id + '" title="Required level, group, location">' + ui.icon('edit', 'sm') + '</button>' }
      ],
      bind: tb => {
        tb.querySelectorAll('[data-rcv]').forEach(b => b.onclick = e => { e.stopPropagation(); receive(b.dataset.rcv); });
        tb.querySelectorAll('[data-chk]').forEach(b => b.onclick = e => { e.stopPropagation(); checkOne(b.dataset.chk); });
        tb.querySelectorAll('[data-edit]').forEach(b => b.onclick = e => { e.stopPropagation(); editItem(b.dataset.edit); });
      },
      empty: ui.empty('shield', 'No disaster stock yet', 'Add the items kept in the disaster store with the quantity the hospital must always hold — or start from a suggested hurricane-preparedness list.',
        '<div class="row" style="justify-content:center"><button class="btn primary" data-a="add">' + ui.icon('plus', 'sm') + 'Add disaster item</button><button class="btn" data-a="suggest">' + ui.icon('clipboard', 'sm') + 'Start from a suggested list</button></div>')
    });
    // rotate
    const rot = [];
    s.list.forEach(i => (i.batches || []).forEach(b => { if (b.expiryDate && util.num(b.qty) > 0 && util.daysBetween(today(), b.expiryDate) <= EXPIRY_DAYS) rot.push({ i, b, d: util.daysBetween(today(), b.expiryDate) }); }));
    rot.sort((a, b) => a.d - b.d);
    el.querySelector('#dsExp').innerHTML = rot.length ? '<table class="table compact"><tbody>' + rot.slice(0, 12).map(r => '<tr><td><div class="t-title">' + esc(r.i.name) + '</div><div class="t-sub">Batch ' + esc(r.b.batchNo || '—') + ' · ' + util.round2(r.b.qty) + ' ' + esc(unitOf(r.i)) + '</div></td><td class="right nowrap">' + (r.d < 0 ? ui.badge('Expired ' + util.date(r.b.expiryDate), 'danger') : util.date(r.b.expiryDate) + '<div class="t-sub">' + r.d + ' days</div>') + '</td></tr>').join('') + '</tbody></table>'
      : ui.empty('check', 'Nothing to rotate', 'No disaster stock expires within ' + EXPIRY_DAYS + ' days.');
    el.querySelector('#dsRel').innerHTML = releases.length ? '<table class="table compact"><tbody>' + releases.slice(0, 10).map(r => '<tr class="click" data-href="#/issues/' + esc(r.id) + '"><td><div class="t-title">' + esc(r.event || 'Emergency') + '</div><div class="t-sub">' + esc(r.number) + ' · ' + esc(r.department || '') + ' · ' + (r.lines || []).length + ' ' + util.plural((r.lines || []).length, 'item') + '</div></td><td class="right nowrap small">' + util.date(r.date) + '</td></tr>').join('') + '</tbody></table>'
      : ui.empty('shield', 'No releases', 'Stock released for an emergency is listed here.');
    el.querySelectorAll('#dsRel tr[data-href]').forEach(tr => tr.onclick = () => { location.hash = tr.dataset.href; });
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = e => { e.preventDefault(); ({
      add: () => addItem(), suggest: () => suggest(), release: () => release(), request: () => requestShortfall(), print: () => printChecklist(), xls: () => exportXls()
    })[b.dataset.a](); });
  }

  /* ---------------------------------------------------------- add / edit */
  function itemPicker() {
    return store.list('stockItems').filter(i => !i.disaster && i.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)).map(i => ({ value: i.id, label: i.code + ' — ' + i.name }));
  }
  async function addItem() {
    const v = await ui.form('Add disaster item', [
      { name: 'existing', label: 'Use an item already in Inventory (optional)', type: 'select', options: [{ value: '', label: '— A new item kept only for disasters —' }].concat(itemPicker()), hint: 'Choose an existing item only when all of its stock is the disaster reserve. Otherwise add a separate item for the disaster store.' },
      { name: 'name', label: 'Item name', placeholder: 'e.g. Bottled drinking water (5 gal)', span: 's8' },
      { name: 'unit', label: 'Unit', value: 'each', span: 's4' },
      { name: 'group', label: 'Group', type: 'select', options: GROUPS, value: 'Water & food', span: 's6' },
      { name: 'target', label: 'Required level (always hold)', type: 'number', required: true, span: 's6' },
      { name: 'location', label: 'Kept in', value: 'Disaster store', span: 's6' },
      { name: 'trackExpiry', label: 'Expiry dates', type: 'checkbox', checkLabel: 'Track batches and expiry dates', value: true, span: 's6' }
    ], { ok: 'Add to disaster stock', size: 'lg' });
    if (!v) return;
    let it;
    if (v.existing) {
      it = store.get('stockItems', v.existing);
      store.upsert('stockItems', { id: it.id, disaster: true, disasterGroup: v.group, disasterTarget: util.num(v.target), reorderLevel: util.num(v.target) || it.reorderLevel, location: v.location || it.location, trackExpiry: !!v.trackExpiry || it.trackExpiry });
    } else {
      if (!String(v.name || '').trim()) return ui.toast('Enter the item name.', 'warning');
      if (items().some(i => i.name.toLowerCase() === v.name.trim().toLowerCase())) return ui.toast('“' + v.name + '” is already in disaster stock.', 'warning');
      it = newDisasterItem(v.name.trim(), v.unit || 'each', v.group, util.num(v.target), v.location || 'Disaster store', !!v.trackExpiry);
    }
    Proc.audit('Disaster Stock', 'Added ' + (it.name || '') + ' — required ' + util.num(v.target) + ' ' + (v.unit || it.unit || ''), it.id);
    ui.toast((it.name || 'Item') + ' added to disaster stock'); router.refresh();
  }
  function newDisasterItem(name, unit, group, tgt, location, trackExpiry) {
    const n = store.next('dst');
    return store.upsert('stockItems', { code: 'DST-' + String(n).padStart(3, '0'), name, unit, category: 'Disaster Stock', location: location || 'Disaster store', reorderLevel: tgt || 0, reorderQty: 0, maxLevel: 0,
      trackExpiry: !!trackExpiry, onHand: 0, avgCost: 0, value: 0, batches: [], status: 'Active', disaster: true, disasterGroup: group || 'Other', disasterTarget: tgt || 0 });
  }
  async function editItem(id) {
    const i = store.get('stockItems', id);
    const v = await ui.form('Disaster stock — ' + i.name, [
      { name: 'target', label: 'Required level (' + unitOf(i) + ')', type: 'number', value: target(i), required: true, span: 's6' },
      { name: 'group', label: 'Group', type: 'select', options: GROUPS, value: i.disasterGroup || 'Other', span: 's6' },
      { name: 'location', label: 'Kept in', value: i.location || 'Disaster store', span: 's6' },
      { name: 'remove', label: 'Remove', type: 'checkbox', checkLabel: 'No longer part of disaster stock', span: 's6' }
    ], { ok: 'Save' });
    if (!v) return;
    if (v.remove) { store.upsert('stockItems', { id, disaster: false }); ui.toast(i.name + ' removed from disaster stock (still in Inventory)'); }
    else { store.upsert('stockItems', { id, disasterTarget: util.num(v.target), reorderLevel: util.num(v.target), disasterGroup: v.group, location: v.location }); ui.toast('Saved'); }
    Proc.audit('Disaster Stock', i.name + (v.remove ? ' removed from disaster stock' : ' — required level ' + util.num(v.target)), id);
    router.refresh();
  }
  async function suggest() {
    const have = new Set(items().map(i => i.name.toLowerCase()));
    const todo = SUGGESTED.filter(s => !have.has(s[0].toLowerCase()));
    if (!todo.length) return ui.toast('The suggested items are already listed.', 'info');
    if (!await ui.confirm('Add <b>' + todo.length + ' suggested items</b> (water, food, first aid, shelter, lighting, fuel, communication, hygiene, tools)? Set each one’s required level afterwards; remove any the hospital does not keep.', { ok: 'Add suggested items' })) return;
    todo.forEach(s => newDisasterItem(s[0], s[1], s[2], 0, 'Disaster store', s[3]));
    Proc.audit('Disaster Stock', todo.length + ' suggested items added');
    ui.toast(todo.length + ' items added — now set the required level of each (✎).'); router.refresh();
  }

  /* ---------------------------------------------------------- add stock */
  function receive(id) {
    const i = store.get('stockItems', id);
    const sups = store.list('suppliers').map(s => s.name).sort();
    ui.form('Add to disaster stock — ' + i.name, [
      { name: 'qty', label: 'Quantity (' + unitOf(i) + ')', type: 'number', required: true, value: Math.max(0, target(i) - held(i)) || '', span: 's4' },
      { name: 'cost', label: 'Unit cost ($)', type: 'number', span: 's4' },
      { name: 'date', label: 'Date', type: 'date', value: today(), span: 's4' },
      { name: 'batch', label: 'Batch / lot', span: 's6' },
      { name: 'expiry', label: 'Expiry date', type: 'date', span: 's6' },
      { name: 'source', label: 'From (supplier, donor or transfer)', list: 'ds-sups', placeholder: 'e.g. ODPEM donation', span: 's12' }
    ], { ok: 'Add stock' }).then(v => {
      if (!v) return;
      if (!(util.num(v.qty) > 0)) return ui.toast('Enter a quantity.', 'warning');
      const sup = v.source && sups.indexOf(v.source) >= 0 ? domain.ensureSupplier(v.source) : null;
      domain.postStock({ itemId: id, type: 'Receipt', qty: util.num(v.qty), unitCost: v.cost === '' ? undefined : util.num(v.cost), date: v.date || today(), batchNo: v.batch || '', expiryDate: v.expiry || '', supplierId: sup ? sup.id : '', ref: 'Disaster stock', notes: 'Disaster stock' + (v.source ? ' · from ' + v.source : '') });
      Proc.audit('Disaster Stock', util.num(v.qty) + ' ' + unitOf(i) + ' ' + i.name + ' added' + (v.source ? ' from ' + v.source : ''), id);
      ui.toast(util.num(v.qty) + ' ' + unitOf(i) + ' added to ' + i.name); router.refresh();
    });
    if (!document.getElementById('ds-sups')) document.body.insertAdjacentHTML('beforeend', '<datalist id="ds-sups">' + sups.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist>');
  }

  /* ---------------------------------------------------------- checks */
  function recordCheck(i, counted, note, when) {
    const diff = util.round2(util.num(counted) - held(i));
    if (diff) domain.postStock({ itemId: i.id, type: 'Adjustment', qty: diff, date: when || today(), ref: 'Disaster stock check', notes: 'Disaster stock check' + (note ? ' — ' + note : '') }, { allowNegative: false, silent: true });
    store.upsert('stockItems', { id: i.id, disasterCheckedAt: new Date().toISOString(), disasterCheckedBy: domain.officer().name, disasterCheckNote: note || '' }, { silent: true });
    return diff;
  }
  async function checkOne(id) {
    const i = store.get('stockItems', id);
    const v = await ui.form('Check — ' + i.name, [
      { name: 'counted', label: 'Counted in the disaster store (' + unitOf(i) + ')', type: 'number', value: held(i), required: true, hint: 'The system shows ' + util.round2(held(i)) + ' ' + unitOf(i) + '. A difference is posted as a stock adjustment.' },
      { name: 'note', label: 'Condition / note', placeholder: 'e.g. Good condition, sealed' }
    ], { ok: 'Record check' });
    if (!v) return;
    const diff = recordCheck(i, v.counted, v.note);
    store.save(); store.emit('change', { coll: 'stockItems' });
    Proc.audit('Disaster Stock', 'Checked ' + i.name + ': ' + util.num(v.counted) + ' ' + unitOf(i) + (diff ? ' (adjusted ' + (diff > 0 ? '+' : '') + diff + ')' : ''), id);
    ui.toast('Check recorded' + (diff ? ' — stock adjusted by ' + (diff > 0 ? '+' : '') + diff : '')); router.refresh();
  }
  function renderCheck(el) {
    const list = items();
    el.innerHTML = ui.pageHead({ back: { label: 'Disaster Stock', href: '#/disaster' }, title: 'Disaster stock check', sub: 'Count every item in the disaster store. Differences are posted as stock adjustments and each item is marked checked today.',
      actions: '<button class="btn" data-a="print">' + ui.icon('printer', 'sm') + 'Print count sheet</button>' }) +
      '<div class="card"><div class="table-wrap"><table class="table compact ds-chk"><thead><tr><th>Item</th><th>Group</th><th class="num">System</th><th class="num">Counted</th><th class="num">Difference</th><th>Condition / note</th></tr></thead><tbody>' +
      (list.length ? list.map(i => '<tr data-id="' + i.id + '"><td><div class="t-title">' + esc(i.name) + '</div><div class="t-sub">' + esc(i.code) + ' · ' + esc(unitOf(i)) + '</div></td><td class="small">' + esc(i.disasterGroup || '') + '</td><td class="num">' + util.round2(held(i)) + '</td>' +
        '<td class="num"><input class="input num" type="number" min="0" step="any" data-c placeholder="' + util.round2(held(i)) + '"></td><td class="num ds-diff" data-d>—</td><td><input class="input" data-n placeholder="Optional"></td></tr>').join('')
        : '<tr><td colspan="6" style="padding:0">' + ui.empty('shield', 'No disaster stock to check') + '</td></tr>') +
      '</tbody></table></div><div class="card-f"><a class="btn ghost" href="#/disaster">Cancel</a><button class="btn" data-same>Everything matches</button><button class="btn primary" data-save>' + ui.icon('check', 'sm') + 'Save check</button></div></div>';
    el.querySelectorAll('[data-c]').forEach(inp => inp.oninput = () => { const tr = inp.closest('tr'); const i = store.get('stockItems', tr.dataset.id); const d = inp.value === '' ? null : util.round2(util.num(inp.value) - held(i)); const c = tr.querySelector('[data-d]'); c.textContent = d === null ? '—' : (d > 0 ? '+' : '') + d; c.className = 'num ds-diff' + (d < 0 ? ' neg' : d > 0 ? ' pos' : ''); });
    el.querySelector('[data-same]').onclick = () => { el.querySelectorAll('tr[data-id]').forEach(tr => { const i = store.get('stockItems', tr.dataset.id); const inp = tr.querySelector('[data-c]'); inp.value = util.round2(held(i)); inp.oninput(); }); };
    el.querySelector('[data-save]').onclick = async () => {
      const rows = Array.from(el.querySelectorAll('tr[data-id]')).filter(tr => tr.querySelector('[data-c]').value !== '');
      if (!rows.length) return ui.toast('Enter at least one count (or press “Everything matches”).', 'warning');
      const changes = rows.filter(tr => { const i = store.get('stockItems', tr.dataset.id); return util.round2(util.num(tr.querySelector('[data-c]').value) - held(i)) !== 0; }).length;
      if (!await ui.confirm('Record the check of <b>' + rows.length + ' ' + util.plural(rows.length, 'item') + '</b>' + (changes ? ' and post <b>' + changes + ' ' + util.plural(changes, 'adjustment') + '</b>' : '') + '?', { ok: 'Save check' })) return;
      let n = 0;
      try { rows.forEach(tr => { recordCheck(store.get('stockItems', tr.dataset.id), tr.querySelector('[data-c]').value, tr.querySelector('[data-n]').value); n++; }); }
      catch (e) { ui.toast(e.message, 'error'); }
      store.save(); store.emit('change', { coll: 'stockItems' });
      Proc.audit('Disaster Stock', 'Stock check: ' + n + ' items' + (changes ? ', ' + changes + ' adjusted' : ''));
      ui.toast('Check saved — ' + n + ' ' + util.plural(n, 'item') + ' checked'); router.go('disaster');
    };
    el.querySelector('[data-a=print]').onclick = () => printChecklist(true);
  }

  /* ---------------------------------------------------------- release for an emergency */
  function release() {
    const list = items().filter(i => held(i) > 0);
    if (!list.length) return ui.toast('Nothing is held in disaster stock yet.', 'warning');
    const lines = [{ itemId: list[0].id, qty: '' }];
    const off = domain.officer();
    ui.modal({
      title: 'Release disaster stock for an emergency', size: 'lg',
      body: '<div class="form-grid"><div class="field s6"><label>Emergency / event<span class="req">*</span></label><input name="event" list="ds-ev" placeholder="e.g. Hurricane — November 2026"><datalist id="ds-ev">' + events().map(e => '<option value="' + esc(e) + '">').join('') + '</datalist></div>' +
        '<div class="field s6"><label>To ward / department / site<span class="req">*</span></label><select name="department" id="dsDept"></select></div>' +
        '<div class="field s6"><label>Received by<span class="req">*</span></label><input name="requestedBy" placeholder="Name"></div><div class="field s6"><label>Date</label><input type="date" name="date" value="' + today() + '"></div></div>' +
        '<div class="table-wrap mt-2"><table class="table compact ds-chk"><thead><tr><th>Item</th><th class="num">Held</th><th class="num">Release</th><th></th></tr></thead><tbody id="dsL"></tbody></table></div>' +
        '<button class="btn sm mt-2" data-add>' + ui.icon('plus', 'sm') + 'Another item</button><label class="check small mt-2" style="display:flex"><input type="checkbox" name="print" checked> Print the issue voucher</label>',
      onOpen: m => {
        C.deptSelect(m.querySelector('#dsDept'), '');
        const tb = m.querySelector('#dsL');
        const draw = () => {
          tb.innerHTML = lines.map((l, k) => { const it = store.get('stockItems', l.itemId); return '<tr data-k="' + k + '"><td><select class="input" data-f="itemId">' + list.map(i => '<option value="' + i.id + '"' + (i.id === l.itemId ? ' selected' : '') + '>' + esc(i.name) + '</option>').join('') + '</select></td><td class="num">' + util.round2(held(it)) + ' ' + esc(unitOf(it)) + '</td><td class="num"><input class="input num" type="number" min="0" step="any" data-f="qty" value="' + esc(l.qty) + '"></td><td class="actions">' + (lines.length > 1 ? '<button class="btn xs ghost icon" data-rm>' + ui.icon('x', 'sm') + '</button>' : '') + '</td></tr>'; }).join('');
          tb.querySelectorAll('[data-f]').forEach(inp => inp.oninput = inp.onchange = () => { lines[+inp.closest('tr').dataset.k][inp.dataset.f] = inp.value; if (inp.dataset.f === 'itemId') draw(); });
          tb.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { lines.splice(+b.closest('tr').dataset.k, 1); draw(); });
        };
        m.querySelector('[data-add]').onclick = () => { const used = new Set(lines.map(l => l.itemId)); lines.push({ itemId: (list.find(i => !used.has(i.id)) || list[0]).id, qty: '' }); draw(); };
        draw();
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Release stock', kind: 'primary', icon: 'arrow-up-right', onClick: (close, m) => {
        const f = ui.formData(m.querySelector('.form-grid')); const print = m.querySelector('[name=print]').checked;
        if (!f.event || !f.department || !f.requestedBy) { ui.toast('Enter the emergency, where it is going and who received it.', 'warning'); return false; }
        const ls = lines.filter(l => util.num(l.qty) > 0);
        if (!ls.length) { ui.toast('Enter how much to release.', 'warning'); return false; }
        for (const l of ls) { const it = store.get('stockItems', l.itemId); if (util.num(l.qty) > held(it)) { ui.toast('Only ' + util.round2(held(it)) + ' ' + unitOf(it) + ' of ' + it.name + ' held.', 'warning'); return false; } }
        const date = f.date || today();
        const siv = store.upsert('stockIssues', { number: 'SIV-' + String(store.next('siv')).padStart(4, '0'), date, department: f.department, requestedBy: f.requestedBy, priority: 'Emergency', notes: 'Disaster stock released — ' + f.event, status: 'Issued', disaster: true, event: f.event,
          approvedBy: off.name, approvedAt: date, issuedBy: off.name, issuedAt: date,
          lines: ls.map(l => { const it = store.get('stockItems', l.itemId); return { itemId: it.id, itemCode: it.code, itemName: it.name, unit: unitOf(it), qtyRequested: util.num(l.qty), qtyApproved: util.num(l.qty), qtyIssued: util.num(l.qty), batches: [] }; }) });
        try {
          const lns = siv.lines.map(ln => { const mv = domain.postStock({ itemId: ln.itemId, type: 'Issue', qty: -util.num(ln.qtyIssued), date, department: f.department, issueId: siv.id, ref: siv.number, notes: 'Disaster release — ' + f.event }, { silent: true }); return Object.assign({}, ln, { batches: mv.batches || [] }); });
          store.upsert('stockIssues', { id: siv.id, lines: lns });
        } catch (e) { store.remove('stockIssues', siv.id); ui.toast(e.message, 'error'); return false; }
        Proc.audit('Disaster Stock', siv.number + ' released for ' + f.event + ' to ' + f.department, siv.id);
        Proc.notify({ to: ['stores'].concat((C.S() || {}).alertProcurement ? ['procurement'] : []), type: 'disaster-release', title: 'Disaster stock released — ' + f.event, body: siv.lines.length + ' ' + util.plural(siv.lines.length, 'item') + ' to ' + f.department + ' (' + siv.number + '). Replace to bring the reserve back to its required level.', link: { app: 'stores', route: '#/disaster' } });
        ui.toast(siv.number + ' — disaster stock released for ' + f.event);
        if (print && C.printSIV) C.printSIV(siv.id);
        setTimeout(() => router.refresh(), 0); return true;
      } }]
    });
  }

  /* ---------------------------------------------------------- shortfall → Procurement */
  async function requestShortfall() {
    const short = summary().short;
    if (!short.length) return ui.toast('Nothing is below its required level.', 'info');
    if (!C.sendRequest) return ui.toast('Purchase requests are not available.', 'warning');
    const v = await ui.form('Request the disaster stock shortfall', [
      { name: 'title', label: 'Title', value: 'Disaster stock replenishment — ' + util.date(today()), required: true },
      { name: 'priority', label: 'Priority', type: 'select', options: ['Normal', 'Emergency'], value: short.some(i => held(i) <= 0) ? 'Emergency' : 'Normal', span: 's6' },
      { name: 'neededBy', label: 'Needed by', type: 'date', value: util.addDays(today(), 14), span: 's6' },
      { name: 'justification', label: 'Justification', type: 'textarea', rows: 3, value: short.length + ' disaster stock ' + util.plural(short.length, 'item is', 'items are') + ' below the required level: ' + short.slice(0, 8).map(i => i.name + ' (' + util.round2(held(i)) + ' of ' + util.round2(target(i)) + ')').join(', ') + (short.length > 8 ? '…' : '') + '.' }
    ], { ok: 'Send to Procurement', size: 'lg' });
    if (!v) return;
    const req = C.sendRequest(short.map(i => ({ item: i, qty: util.round2(target(i) - held(i)), cost: util.num(i.lastCost) || util.num(i.avgCost) })), v);
    store.upsert('requisitions', { id: req.id, disaster: true });
    ui.toast('Purchase request ' + req.number + ' sent to Procurement'); router.go('orders');
  }

  /* ---------------------------------------------------------- printing / export */
  function printChecklist(countSheet) {
    const kit = Proc.pdf && Proc.pdf.kit; if (!kit) return ui.toast('The PDF engine is not loaded.', 'warning');
    const list = items(); const s = summary();
    try {
      const doc = kit.newDoc(); const { w } = kit.pageSize(doc); const M = 40; const y = kit.top; const clean = kit.clean;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor.apply(doc, kit.BLUE); doc.text(countSheet ? 'DISASTER STOCK — COUNT SHEET' : 'DISASTER STOCK CHECKLIST', M, y + 16);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, kit.GREY);
      doc.text(clean((C.S().storeName || 'General Stores') + ' · ' + util.dateLong(today()) + ' · Readiness ' + s.pct + '% (' + s.ready + ' of ' + s.set.length + ' items at the required level)'), M, y + 30);
      const body = []; let last = null;
      list.forEach(i => {
        if (i.disasterGroup !== last) { body.push([{ content: clean(i.disasterGroup || 'Other').toUpperCase(), colSpan: 8, styles: { fontStyle: 'bold', fillColor: [235, 241, 237] } }]); last = i.disasterGroup; }
        const e = nearestExpiry(i);
        body.push([clean(i.code), clean(i.name), clean(unitOf(i)), target(i) ? String(util.round2(target(i))) : '-', String(util.round2(held(i))), countSheet ? '' : (target(i) > held(i) ? String(util.round2(target(i) - held(i))) : '-'), e ? util.date(e) : '-', countSheet ? '' : status(i).label]);
      });
      doc.autoTable({ startY: y + 44, margin: { left: M, right: M }, head: [['Code', 'Item', 'Unit', 'Required', 'System', countSheet ? 'Counted' : 'Short', 'Expiry', countSheet ? 'Condition' : 'Status']], body,
        styles: { fontSize: 8.3, cellPadding: 4 }, headStyles: { fillColor: kit.BLUE }, columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', cellWidth: countSheet ? 60 : 40 } } });
      let sy = doc.lastAutoTable.finalY + 30; if (sy > kit.pageSize(doc).h - 100) { doc.addPage(); sy = kit.top; }
      const sw = (w - 2 * M - 30) / 3;
      [['Checked by', domain.officer().name], ['Witnessed by', ''], ['Date', '']].forEach(([lab, nm], k) => { const x = M + k * (sw + 15); doc.setDrawColor(150); doc.line(x, sy + 26, x + sw, sy + 26); doc.setFontSize(8); doc.setTextColor.apply(doc, kit.GREY); doc.text(lab, x, sy + 38); if (nm) { doc.setFont('helvetica', 'bold'); doc.setTextColor.apply(doc, kit.INK); doc.text(clean(nm), x, sy + 22); doc.setFont('helvetica', 'normal'); } });
      kit.finish(doc, { side: false });
      doc.setProperties({ title: 'Disaster stock ' + (countSheet ? 'count sheet' : 'checklist') });
      return Promise.resolve(kit.deliver(doc, 'Disaster Stock ' + (countSheet ? 'Count Sheet' : 'Checklist') + ' ' + today() + '.pdf', 'open'));
    } catch (e) { console.error(e); ui.toast('Could not create the checklist: ' + e.message, 'error'); }
  }
  function exportXls() {
    C.excel([{ name: 'Disaster stock', cols: [10, 36, 20, 8, 10, 10, 10, 12, 12, 14], rows: items().map(i => ({ Code: i.code, Item: i.name, Group: i.disasterGroup, Unit: unitOf(i), Required: target(i), Held: held(i), Short: Math.max(0, util.round2(target(i) - held(i))),
      'Nearest expiry': nearestExpiry(i), 'Last checked': (i.disasterCheckedAt || '').slice(0, 10), Status: status(i).label })) }], 'Disaster stock ' + today() + '.xlsx');
  }

  if (Proc.SECTIONS.indexOf('Preparedness') < 0) Proc.SECTIONS.splice(Proc.SECTIONS.indexOf('Records'), 0, 'Preparedness');
  Proc.page({ id: 'disaster', title: 'Disaster Stock', icon: 'shield', section: 'Preparedness', order: 10, count: () => { try { const s = summary(); return s.short.length + s.expired.length; } catch (e) { return 0; } }, countAlert: true, render });
  Proc.quickCreate.push({ label: 'Disaster stock', desc: 'Reserve levels, checks and releases', icon: 'shield', order: 27, onClick: () => router.go('disaster') });
})();
