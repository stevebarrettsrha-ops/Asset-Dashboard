/* General Stores — one-time import of the earlier General Stores page's data
   (localStorage / IndexedDB "storesInventoryData", or a STORES_BACKUP.json file).
   Records get fixed ids derived from the old codes, so running it twice — or on two
   computers that later sync — never creates duplicates. Existing records are never
   overwritten; only missing ones are added. */
(function () {
  'use strict';
  const { util, ui, store, domain } = Proc;
  const esc = util.esc;
  const OLD_KEY = 'storesInventoryData';
  const OLD_DB = 'StoresDB';
  /** The 11 sample items the old page seeded on a fresh install. Skipped unless they were actually used. */
  const DEMO = { 'MED-001': 'Disposable Gloves (Latex)', 'MED-002': 'Face Masks (Surgical)', 'MED-003': 'Hand Sanitizer 500ml', 'CLN-001': 'Bleach (Sodium Hypochlorite) 1 Gal', 'CLN-002': 'Floor Cleaner Concentrate',
    'OFF-001': 'A4 Copy Paper (White)', 'OFF-002': 'Ballpoint Pens (Blue)', 'KIT-001': 'Cooking Oil 5L', 'LIN-001': 'Bed Sheets (Single)', 'PPE-001': 'Safety Goggles', 'MNT-001': 'Light Bulbs (LED 12W)' };
  const slug = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'X';
  const ST = () => store.settings().stores || {};

  /* ------------------------------------------------------------ read old data */
  function readLocal() { try { const raw = localStorage.getItem(OLD_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  async function readIDB() {
    try {
      if (indexedDB.databases) { const dbs = await indexedDB.databases(); if (!dbs.some(d => d.name === OLD_DB)) return null; }
      return await new Promise(resolve => {
        const req = indexedDB.open(OLD_DB, 1);
        req.onupgradeneeded = e => { if (!e.target.result.objectStoreNames.contains('kv')) e.target.result.createObjectStore('kv'); };
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const g = db.transaction('kv', 'readonly').objectStore('kv').get(OLD_KEY);
            g.onsuccess = () => { db.close(); resolve(g.result || null); };
            g.onerror = () => { db.close(); resolve(null); };
          } catch (err) { db.close(); resolve(null); }
        };
      });
    } catch (e) { return null; }
  }
  const weight = d => (d && Array.isArray(d.items) ? d.items.length + (d.transactions || []).length * 2 + (d.requisitions || []).length : -1);
  async function readOld() {
    const a = readLocal(), b = await readIDB();
    return weight(b) >= weight(a) ? (b || a) : a; // IndexedDB was the durable copy; localStorage only a cache
  }
  /** Is there anything worth importing (more than the untouched demo seed)? */
  function realItems(d) {
    const tx = d.transactions || [];
    const used = new Set(tx.map(t => t.itemCode).concat((d.requisitions || []).map(r => r.itemCode)));
    return (d.items || []).filter(it => it && (it.code || it.description) && !(DEMO[it.code] && DEMO[it.code] === it.description && !used.has(it.code)));
  }

  /* ------------------------------------------------------------ convert */
  function txKind(t) {
    const type = String(t.type || ''), q = Math.abs(util.num(t.qty));
    const isCount = /stock count/i.test(t.department || '') || /physical count/i.test(t.reference || '');
    if (isCount) return { type: 'Adjustment', qty: /issu/i.test(type) ? -q : q, reason: 'Count correction' };
    if (/^receiv/i.test(type)) return { type: 'Receipt', qty: q };
    if (/^issu/i.test(type)) return { type: 'Issue', qty: -q };
    if (/adjust/i.test(type)) return { type: 'Adjustment', qty: util.num(t.qty), reason: t.department || '' };
    if (/return/i.test(type)) return { type: 'Adjustment', qty: q, reason: 'Returned from department' };
    if (/write|expir|dispos|damag/i.test(type)) return { type: 'Write-off', qty: -q, reason: type };
    return { type: 'Adjustment', qty: util.num(t.qty), reason: type };
  }
  /**
   * Import old data. Returns a summary. Never overwrites records that already exist.
   * opts: { source: 'browser'|'file' }
   */
  function migrate(d, opts) {
    opts = opts || {};
    const sum = { items: 0, skippedDemo: 0, moves: 0, issues: 0, counts: 0, unknownTx: 0, existing: 0, value: 0 };
    if (!d || !Array.isArray(d.items)) return sum;
    const keep = realItems(d);
    sum.skippedDemo = d.items.length - keep.length;
    const byCode = {};
    const tx = (d.transactions || []).slice().map((t, i) => Object.assign({ _i: i }, t)).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.timestamp || '').localeCompare(String(b.timestamp || '')) || a._i - b._i);
    store.batch(() => {
      const S = Object.assign({}, ST());
      keep.forEach(o => {
        const code = String(o.code || '').trim() || 'OLD-' + slug(o.description);
        const id = 'ITM-OLD-' + slug(code);
        byCode[code] = id;
        if (store.get('stockItems', id)) { sum.existing++; return; }
        const mine = tx.filter(t => t.itemCode === o.code);
        const onHand = util.num(o.qty), cost = util.num(o.unitCost);
        const sup = o.supplier ? domain.findSupplier(o.supplier) : null;
        const batches = (o.batches || []).filter(b => util.num(b.remainingQty !== undefined ? b.remainingQty : b.qty) > 0)
          .map(b => ({ batchNo: b.batchNo || '', expiryDate: util.toISODate(b.expiryDate) || '', qty: util.num(b.remainingQty !== undefined ? b.remainingQty : b.qty), receivedDate: util.toISODate(b.receivedDate) || '', mfgDate: b.mfgDate || '' }));
        const lastRec = mine.filter(t => /^receiv/i.test(t.type || '')).pop(), lastIss = mine.filter(t => /^issu/i.test(t.type || '')).pop();
        store.upsert('stockItems', {
          id, code, name: o.description || code, category: o.category || 'General', unit: o.unit || 'each', location: o.location || '',
          reorderLevel: util.num(o.reorderLevel), reorderQty: Math.max(0, util.num(o.maxLevel) - util.num(o.reorderLevel)), maxLevel: util.num(o.maxLevel),
          trackExpiry: !!o.trackExpiry, shelfLife: util.num(o.shelfLife), onHand, avgCost: cost, lastCost: cost, value: util.round2(onHand * cost), batches,
          supplierIds: sup ? [sup.id] : [], supplierText: o.supplier || '', notes: o.notes || '', status: 'Active', legacy: true,
          lastReceived: lastRec ? util.toISODate(lastRec.date) : '', lastIssued: lastIss ? util.toISODate(lastIss.date) : '', dateAdded: o.dateAdded || ''
        }, { silent: true });
        sum.items++; sum.value += onHand * cost;
        // Bin card history: a brought-forward balance, then every old movement with a running balance.
        const kinds = mine.map(txKind);
        const net = util.sum(kinds, k => k.qty);
        const opening = util.round2(onHand - net);
        const firstDate = mine.length ? util.toISODate(mine[0].date) : '';
        const openDate = [util.toISODate(o.dateAdded), firstDate].filter(Boolean).sort()[0] || util.today();
        let bal = 0, seq = 0;
        const add = (mv) => {
          const mid = 'MOV-OLD-' + slug(code) + '-' + String(seq).padStart(4, '0'); seq++;
          if (store.get('stockMoves', mid)) return;
          bal = util.round2(bal + mv.qty);
          store.upsert('stockMoves', Object.assign({ id: mid, itemId: id, itemCode: code, itemName: o.description || code, unit: o.unit || 'each', unitCost: cost, value: util.round2(mv.qty * cost), balanceAfter: bal, legacy: true, seq }, mv), { silent: true });
          sum.moves++;
        };
        if (opening || !mine.length) add({ date: openDate, type: 'Opening', qty: opening || 0, ref: 'Balance brought forward', reason: 'Opening balance (earlier General Stores page)', by: 'Earlier system' });
        mine.forEach((t, i) => {
          const k = kinds[i];
          const isRec = k.type === 'Receipt';
          const s2 = isRec && t.department && t.department !== 'N/A' ? domain.findSupplier(t.department) : null;
          add({ date: util.toISODate(t.date) || openDate, type: k.type, qty: k.qty, reason: k.reason || '', ref: t.reference && t.reference !== 'N/A' ? t.reference : '',
            department: !isRec && t.department && !/stock count/i.test(t.department) ? t.department : undefined,
            supplierId: s2 ? s2.id : undefined, supplierName: isRec && !s2 && t.department && t.department !== 'N/A' ? t.department : undefined,
            batchNo: t.batchNo || '', expiryDate: util.toISODate(t.expiryDate) || '', notes: t.notes || '', by: t.by || '' });
        });
      });
      sum.unknownTx = tx.filter(t => !keep.some(o => o.code === t.itemCode) && !DEMO[t.itemCode]).length;
      // Department requisitions → stores issue vouchers
      const statusMap = { Pending: 'Requested', Approved: 'Approved', Rejected: 'Rejected', Issued: 'Issued', Cancelled: 'Cancelled' };
      (d.requisitions || []).forEach((r, i) => {
        const iid = byCode[r.itemCode] || (DEMO[r.itemCode] ? null : null);
        const id = 'SIV-OLD-' + slug(r.id || String(i));
        if (store.get('stockIssues', id)) return;
        const st = statusMap[r.status] || 'Requested';
        const q = util.num(r.qty);
        store.upsert('stockIssues', {
          id, number: 'SIV-L' + String((r.id || '').replace(/\D/g, '') || i + 1).padStart(4, '0'), legacyRef: r.id || '', date: util.toISODate(r.date) || util.today(), department: r.department || '', requestedBy: r.requestedBy || '',
          status: st, priority: r.urgent ? 'Urgent' : 'Normal', notes: r.justification || '', approvedBy: r.approvedBy || '', issuedAt: st === 'Issued' ? util.toISODate(r.approvedDate || r.date) : '',
          lines: [{ itemId: iid || '', itemName: r.itemDescription || r.itemCode || '', unit: '', qtyRequested: q, qtyApproved: st === 'Approved' || st === 'Issued' ? q : 0, qtyIssued: st === 'Issued' ? q : 0 }], legacy: true
        }, { silent: true });
        sum.issues++;
      });
      // Stock count history → posted counts
      (d.countHistory || []).forEach((c, i) => {
        const id = 'CNT-OLD-' + String(i + 1).padStart(3, '0') + '-' + slug(c.date);
        if (store.get('stockCounts', id)) return;
        store.upsert('stockCounts', {
          id, number: 'CNT-L' + String(i + 1).padStart(4, '0'), date: util.toISODate(c.date) || util.today(), scope: 'Full', status: 'Posted', blind: false, legacy: true,
          countedBy: c.performedBy || '', postedBy: c.performedBy || '', postedAt: (util.toISODate(c.date) || util.today()) + 'T00:00:00.000Z',
          notes: util.num(c.itemsCounted) + ' items counted, ' + util.num(c.adjustments) + ' adjustments (earlier General Stores page)',
          lines: (c.details || []).map(x => { const iid = byCode[x.code]; const it = iid ? store.get('stockItems', iid) : null; return { itemId: iid || '', code: x.code, name: it ? it.name : x.code, unit: it ? it.unit : '', location: it ? it.location : '', systemQty: util.num(x.systemQty), countedQty: util.num(x.countedQty), variance: util.num(x.variance), reason: x.reason || '', unitCost: it ? util.num(it.avgCost) : 0 }; })
        }, { silent: true });
        sum.counts++;
      });
      // Categories and locations
      const cats = (S.categories || []).slice();
      (d.categories || []).concat(keep.map(o => o.category)).forEach(c => { if (c && cats.indexOf(c) < 0) cats.push(c); });
      const locs = (S.locations || []).slice();
      keep.map(o => o.location).forEach(l => { if (l && locs.indexOf(l) < 0) locs.push(l); });
      store.saveSettings({ stores: Object.assign({}, ST(), { categories: cats, locations: locs, migratedAt: new Date().toISOString(), migrationSummary: Object.assign({ source: opts.source || 'browser' }, sum) }) });
    });
    sum.value = util.round2(sum.value);
    Proc.audit('Import Old Stores Data', sum.items + ' items, ' + sum.moves + ' bin card entries, ' + sum.issues + ' requisitions, ' + sum.counts + ' counts' + (sum.skippedDemo ? ', ' + sum.skippedDemo + ' sample items skipped' : '') + ' (' + (opts.source || 'browser') + ')');
    return sum;
  }
  function describe(sum) {
    return sum.items + ' ' + util.plural(sum.items, 'item') + ' (' + util.money(sum.value) + '), ' + sum.moves + ' bin card ' + util.plural(sum.moves, 'entry', 'entries') + ', ' + sum.issues + ' ' + util.plural(sum.issues, 'requisition') + ' and ' + sum.counts + ' stock ' + util.plural(sum.counts, 'count');
  }

  /** Automatic first-load import. */
  async function run(force) {
    if (!force && ST().migratedAt) return null;
    const d = await readOld();
    if (!d || !Array.isArray(d.items)) { if (!force) store.saveSettings({ stores: Object.assign({}, ST(), { migratedAt: new Date().toISOString(), migrationSummary: { nothing: true } }) }); return { nothing: true }; }
    if (!realItems(d).length && !(d.transactions || []).length && !(d.requisitions || []).length) {
      if (!force) store.saveSettings({ stores: Object.assign({}, ST(), { migratedAt: new Date().toISOString(), migrationSummary: { nothing: true, onlySample: true } }) });
      return { nothing: true, onlySample: true };
    }
    const sum = migrate(d, { source: 'browser' });
    if (sum.items || sum.issues || sum.counts) ui.toast('Brought across from the earlier General Stores page: ' + describe(sum) + '.', 'success', 9000);
    else if (force) ui.toast('Nothing new to bring across — everything from the earlier page is already here.', 'info');
    return sum;
  }
  function fromFile(json) {
    let d = json;
    if (typeof d === 'string') d = JSON.parse(d);
    if (d && d.data && Array.isArray(d.data.items)) d = d.data;
    if (!d || !Array.isArray(d.items)) throw new Error('This is not a General Stores backup (no “items” list found).');
    return migrate(d, { source: 'file' });
  }

  /* ------------------------------------------------------------ settings UI */
  function renderTool(el) {
    const s = ST().migrationSummary;
    el.innerHTML = '<p class="small muted mb-2">Brings the items, balances, batches, history, department requisitions and stock counts from the earlier General Stores page into this one. It runs once automatically; run it again after restoring an old backup. Records already here are never overwritten.</p>' +
      (ST().migratedAt ? '<div class="alert ' + (s && s.nothing ? '' : 'success') + ' mb-2">' + ui.icon(s && s.nothing ? 'info' : 'check') + '<div>' + (s && s.nothing ? (s.onlySample ? 'Checked ' + util.date(String(ST().migratedAt).slice(0, 10)) + ' — the earlier page only had its sample items, so nothing was brought across.' : 'Checked ' + util.date(String(ST().migratedAt).slice(0, 10)) + ' — no earlier General Stores data on this computer.')
        : 'Imported ' + util.date(String(ST().migratedAt).slice(0, 10)) + ' (' + esc((s && s.source) || 'browser') + '): ' + esc(describe(s || { items: 0, moves: 0, issues: 0, counts: 0, value: 0 })) + '.') + '</div></div>' : '') +
      '<div class="row"><button class="btn" data-a="check">' + ui.icon('refresh', 'sm') + 'Check this computer again</button><label class="btn">' + ui.icon('upload', 'sm') + 'Import STORES_BACKUP.json<input type="file" accept=".json,application/json" hidden data-file></label></div><div class="small mt-2" data-out></div>';
    const out = el.querySelector('[data-out]');
    el.querySelector('[data-a=check]').onclick = async () => { const r = await run(true); out.textContent = r && r.nothing ? (r.onlySample ? 'Only the sample items were found — nothing to bring across.' : 'No earlier General Stores data found on this computer.') : r ? 'Brought across: ' + describe(r) + '.' : ''; };
    el.querySelector('[data-file]').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const sum = fromFile(r.result); ui.toast('Imported from ' + f.name + ': ' + describe(sum)); renderTool(el); } catch (err) { ui.toast(err.message, 'error'); } };
      r.readAsText(f); e.target.value = '';
    };
  }
  (Proc.storesSettingsHooks = Proc.storesSettingsHooks || []).push({ id: 'migrate', title: 'Import old General Stores data', render: renderTool });
  // Stand-alone page (also reachable from Settings): #/migrate
  Proc.page({ id: 'migrate', title: 'Import old Stores data', icon: 'upload', section: 'Administration', order: 90, hidden: true,
    render(el) { el.innerHTML = Proc.ui.pageHead({ title: 'Import old General Stores data', sub: 'Bring the earlier page’s records into the new General Stores.' }) + '<div class="card"><div class="card-b" id="migT"></div></div>'; renderTool(el.querySelector('#migT')); } });

  Proc.storesMigrate = { run, fromFile, readOld, migrate };

  // First load: once the shared records are loaded from this computer's database.
  let started = false;
  store.on('change', e => {
    if (started || !e || e.coll !== '*' || e.action !== 'load') return;
    started = true;
    setTimeout(() => { run(false).then(r => { if (r && !r.nothing && Proc.router.started) Proc.router.refresh(); }).catch(err => console.warn('[Stores] import of old data failed', err)); }, 0);
  });
})();
