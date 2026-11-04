/* General Stores — Inventory: item master, stock on hand, bin cards, batches & expiry,
   purchases and issues per item, adjustments / write-offs, opening balances.
   Stock quantities only ever change through Proc.domain.postStock. */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc;
  const S = () => store.settings().stores || {};

  const CSS = '.inv-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px;margin-bottom:18px}' +
    '.inv-scan{position:relative;flex:0 1 260px}.inv-scan input{width:100%;height:34px;border:1px dashed var(--border-strong);border-radius:8px;padding:0 10px 0 32px;background:var(--surface);font-size:13px;outline:none}' +
    '.inv-scan input:focus{border-style:solid;border-color:var(--primary);box-shadow:0 0 0 3px var(--focus)}.inv-scan svg{position:absolute;left:9px;top:9px;color:var(--text-3)}' +
    '.inv-in{color:var(--success);font-weight:600}.inv-out{color:var(--danger);font-weight:600}.inv-bal{font-weight:700}' +
    '.inv-head{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}.inv-ic{width:52px;height:52px;border-radius:12px;background:var(--primary-50);color:var(--primary);display:grid;place-items:center;flex:none}' +
    '.inv-pre{max-height:260px;overflow:auto;border:1px solid var(--border);border-radius:8px}' +
    '@media(max-width:640px){.inv-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.inv-scan{flex:1 1 100%}}';
  function css() { if (!document.getElementById('css-inventory')) document.head.insertAdjacentHTML('beforeend', '<style id="css-inventory">' + CSS + '</style>'); }

  /* ------------------------------------------------------------ helpers */
  const items = () => store.list('stockItems');
  const activeItems = () => items().filter(i => i.status !== 'Inactive');
  const movesFor = id => store.filter('stockMoves', m => m.itemId === id).sort(chrono);
  function chrono(a, b) { return (a.date || '').localeCompare(b.date || '') || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || (a.seq || 0) - (b.seq || 0); }
  function nearestExpiry(item) {
    const d = (item.batches || []).filter(b => util.num(b.qty) > 0 && b.expiryDate).map(b => b.expiryDate).sort()[0];
    return d || '';
  }
  function expiryState(iso) {
    if (!iso) return null;
    const days = util.daysBetween(util.today(), iso);
    if (days < 0) return { tone: 'danger', label: 'Expired', days };
    if (days <= util.num(S().expiryWarnDays || 90)) return { tone: 'warning', label: 'Expires ' + util.date(iso), days };
    return { tone: '', label: util.date(iso), days };
  }
  function expiryChip(iso) {
    const e = expiryState(iso); if (!e) return '<span class="muted">—</span>';
    return e.tone ? ui.badge(e.tone === 'danger' ? 'Expired ' + util.date(iso) : e.label, e.tone) : '<span class="small">' + esc(e.label) + '</span>';
  }
  function stateOf(item) { return item.status === 'Inactive' ? { label: 'Inactive', tone: '' } : domain.stockState(item); }
  const stateChip = item => { const s = stateOf(item); return ui.badge(s.label, s.tone); };
  const qtyFmt = n => { const v = util.num(n); return Number.isInteger(v) ? util.int(v) : v.toLocaleString('en-US', { maximumFractionDigits: 2 }); };
  /** Average daily issues over the last 90 days → days of cover. */
  function daysOfCover(item) {
    const from = util.addDays(util.today(), -90);
    const out = -util.sum(store.filter('stockMoves', m => m.itemId === item.id && m.type === 'Issue' && (m.date || '') >= from), m => m.qty);
    if (!out) return null;
    return Math.floor(util.num(item.onHand) / (out / 90));
  }
  function refLink(m) {
    const parts = [];
    if (m.grnId) { const d = store.get('deliveries', m.grnId); parts.push('<a href="#/grn/' + esc(m.grnId) + '">' + esc((d && d.grn) || 'GRN') + '</a>'); }
    if (m.issueId) { const s = store.get('stockIssues', m.issueId); parts.push('<a href="#/issues/' + esc(m.issueId) + '">' + esc((s && s.number) || 'Issue voucher') + '</a>'); }
    if (m.countId) { const c = store.get('stockCounts', m.countId); parts.push('<a href="#/counts/' + esc(m.countId) + '">' + esc((c && c.number) || 'Stock count') + '</a>'); }
    if (m.poId) { const p = store.get('purchaseOrders', m.poId); if (p) parts.push('<a href="procurement.html#/orders/' + esc(p.id) + '">PO ' + esc(p.poNumber || '') + '</a>'); }
    if (!parts.length && m.ref) parts.push(esc(m.ref));
    return parts.join(' · ') || '<span class="muted">—</span>';
  }
  function refText(m) {
    const p = [];
    if (m.grnId) { const d = store.get('deliveries', m.grnId); p.push((d && d.grn) || 'GRN'); }
    if (m.issueId) { const s = store.get('stockIssues', m.issueId); p.push((s && s.number) || 'SIV'); }
    if (m.countId) { const c = store.get('stockCounts', m.countId); p.push((c && c.number) || 'Count'); }
    if (m.poId) { const po = store.get('purchaseOrders', m.poId); if (po) p.push('PO ' + po.poNumber); }
    if (!p.length && m.ref) p.push(m.ref);
    return p.join(' / ');
  }
  function partyText(m) {
    if (m.department) return m.department;
    if (m.supplierId) return domain.supplierName(m.supplierId);
    return m.reason || '';
  }
  /** Items whose name matches an outstanding PO line. */
  function onOrderFor(item) {
    const keys = [item.name].concat(item.aliases || []).map(domain.stockKey).filter(Boolean);
    return domain.inbound({}).filter(r => r.type !== 'Service' && (r.line.itemId === item.id || keys.indexOf(domain.stockKey(r.line.description)) >= 0));
  }

  /** Item finder used by every scan / search box: exact code, then name. */
  function findItem(text) {
    const t = String(text || '').trim(); if (!t) return null;
    return domain.findStockItem(t) || items().find(i => (i.name || '').toLowerCase() === t.toLowerCase()) || null;
  }
  /** Datalist of "CODE — Name" for item pickers. */
  function itemDatalist() {
    let dl = document.getElementById('dl-stock'); if (!dl) { dl = document.createElement('datalist'); dl.id = 'dl-stock'; document.body.appendChild(dl); }
    dl.innerHTML = activeItems().sort((a, b) => a.name.localeCompare(b.name)).map(i => '<option value="' + esc(i.code) + '">' + esc(i.name) + '</option>').join('');
    return 'dl-stock';
  }
  function bindScan(input, onItem) {
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const it = findItem(input.value);
      if (it) { input.value = ''; onItem(it); }
      else if (input.value.trim()) { ui.toast('No item with code or name “' + input.value.trim() + '”', 'warning'); input.select(); }
    });
  }

  /* ------------------------------------------------------------ PDF */
  /** Table document on the letterhead. o: { title, subtitle[], head[], body[][], foot[], columnStyles, filename, orientation, signatures[] } */
  function pdfTable(o) {
    const kit = Proc.pdf && Proc.pdf.kit;
    if (!kit) { ui.toast('The PDF engine is not loaded.', 'error'); return null; }
    try {
      const doc = kit.newDoc(o.orientation); const { w, h } = kit.pageSize(doc); const M = 40; let y = kit.top;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor.apply(doc, kit.BLUE); doc.text(kit.clean(o.title), M, y + 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, kit.GREY);
      (o.subtitle || []).filter(Boolean).forEach((s, i) => doc.text(kit.clean(s), M, y + 30 + i * 12));
      y += 30 + (o.subtitle || []).filter(Boolean).length * 12 + 6;
      doc.autoTable({
        startY: y, margin: { left: M, right: M, top: kit.top, bottom: 84 }, theme: 'grid',
        head: [o.head], body: o.body.map(r => r.map(c => kit.clean(c === null || c === undefined ? '' : String(c)))),
        foot: o.foot ? [o.foot.map(c => kit.clean(String(c === undefined ? '' : c)))] : undefined, showFoot: 'lastPage',
        styles: { font: 'helvetica', fontSize: o.fontSize || 8.5, cellPadding: 4, lineColor: [210, 216, 224], lineWidth: 0.5, textColor: kit.INK, overflow: 'linebreak' },
        headStyles: { fillColor: kit.BLUE, textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [248, 250, 252], textColor: kit.INK, fontStyle: 'bold' },
        columnStyles: o.columnStyles || {}
      });
      y = doc.lastAutoTable.finalY + 30;
      if (o.signatures && o.signatures.length) {
        if (y + 50 > h - 84) { doc.addPage(); y = kit.top + 20; }
        const sw = (w - M * 2) / o.signatures.length;
        o.signatures.forEach((sig, i) => {
          const x = M + i * sw;
          doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.6); doc.line(x, y + 18, x + sw - 24, y + 18);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, kit.GREY); doc.text(kit.clean(sig[0]).toUpperCase(), x, y + 29);
          if (sig[1]) { doc.setFont('helvetica', 'bold'); doc.setTextColor.apply(doc, kit.INK); doc.text(kit.clean(sig[1]), x, y + 40); }
        });
      }
      kit.finish(doc, { side: false, alwaysNumber: true, pageLabel: o.pageLabel || '' });
      doc.setProperties({ title: o.title, creator: (store.settings().stores || {}).storeName || 'General Stores' });
      return kit.deliver(doc, kit.fileSafe(o.filename || o.title) + '.pdf', o.output || 'open');
    } catch (e) { console.error(e); ui.toast('Could not make the PDF: ' + e.message, 'error'); return null; }
  }

  /* ------------------------------------------------------------ item form */
  const UNITS = ['each', 'box', 'pk', 'case', 'ctn', 'ream', 'roll', 'pair', 'set', 'bottle', 'gallon', 'litre', 'kg', 'lb', 'bag', 'doz', 'tube', 'vial', 'tin'];
  function itemFields(it, isNew) {
    const cats = (S().categories || []).slice(); if (it.category && cats.indexOf(it.category) < 0) cats.push(it.category);
    const locs = (S().locations || []).slice(); if (it.location && locs.indexOf(it.location) < 0) locs.push(it.location);
    let dl = document.getElementById('dl-units'); if (!dl) { dl = document.createElement('datalist'); dl.id = 'dl-units'; document.body.appendChild(dl); }
    dl.innerHTML = UNITS.map(u => '<option value="' + u + '">').join('');
    let dll = document.getElementById('dl-locs'); if (!dll) { dll = document.createElement('datalist'); dll.id = 'dl-locs'; document.body.appendChild(dll); }
    dll.innerHTML = locs.map(u => '<option value="' + esc(u) + '">').join('');
    const f = [
      { name: 'name', label: 'Item name', value: it.name, required: true, span: 's8', placeholder: 'e.g. A4 Copy Paper 80gsm' },
      { name: 'code', label: 'Item code', value: it.code, span: 's4', placeholder: isNew ? 'Leave blank to number it' : '', hint: isNew ? 'Barcode or your own code' : '' },
      { name: 'category', label: 'Category', type: 'select', options: cats, value: it.category || 'General', span: 's4' },
      { name: 'unit', label: 'Unit of issue', value: it.unit || 'each', list: 'dl-units', span: 's4', required: true },
      { name: 'location', label: 'Bin / location', value: it.location || '', list: 'dl-locs', span: 's4' },
      { name: 'reorderLevel', label: 'Reorder level', type: 'number', value: it.reorderLevel || 0, span: 's4', hint: 'Flag for reorder at or below this' },
      { name: 'reorderQty', label: 'Reorder quantity', type: 'number', value: it.reorderQty || 0, span: 's4' },
      { name: 'maxLevel', label: 'Maximum level', type: 'number', value: it.maxLevel || 0, span: 's4' },
      { name: 'trackExpiry', label: 'Expiry', type: 'checkbox', checkLabel: 'Track batches and expiry dates', value: !!it.trackExpiry, span: 's6' },
      { name: 'aliases', label: 'Other names (comma separated)', value: (it.aliases || []).join(', '), span: 's6', hint: 'Names suppliers use on POs — matches deliveries to this item' }
    ];
    if (isNew) f.push(
      { name: 'openQty', label: 'Opening quantity', type: 'number', value: '', span: 's3' },
      { name: 'openCost', label: 'Unit cost (JMD)', type: 'number', step: '0.01', value: '', span: 's3' },
      { name: 'openBatch', label: 'Batch / lot', value: '', span: 's3' },
      { name: 'openExpiry', label: 'Expiry date', type: 'date', value: '', span: 's3' });
    f.push({ name: 'notes', label: 'Notes', type: 'textarea', rows: 2, value: it.notes || '' });
    return f;
  }
  async function newItem(prefill) {
    const v = await ui.form('New stock item', itemFields(prefill || {}, true), { ok: 'Create item', size: 'lg' });
    if (!v) return null;
    const dupe = domain.findStockItem(v.code || v.name) || domain.findStockItem(v.name);
    if (dupe && !(await ui.confirm('<b>' + esc(dupe.code + ' — ' + dupe.name) + '</b> already looks like this item. Create a separate item anyway?', { ok: 'Create anyway' }))) { router.go('inventory/' + dupe.id); return null; }
    if (v.code && store.find('stockItems', i => (i.code || '').toLowerCase() === v.code.toLowerCase())) { ui.toast('Item code ' + v.code + ' is already used.', 'warning'); return null; }
    const extra = { unit: v.unit, category: v.category, location: v.location, reorderLevel: util.num(v.reorderLevel), reorderQty: util.num(v.reorderQty), maxLevel: util.num(v.maxLevel),
      trackExpiry: !!v.trackExpiry, aliases: v.aliases ? v.aliases.split(',').map(s => s.trim()).filter(Boolean) : [], notes: v.notes };
    if (v.code) extra.code = v.code.trim();
    const it = store.upsert('stockItems', Object.assign({ code: extra.code || 'STK-' + String(store.next('itm')).padStart(4, '0'), name: v.name, onHand: 0, avgCost: 0, value: 0, batches: [], status: 'Active' }, extra));
    if (util.num(v.openQty) > 0) {
      try { domain.postStock({ itemId: it.id, type: 'Opening', qty: util.num(v.openQty), unitCost: util.num(v.openCost), batchNo: v.openBatch, expiryDate: v.openExpiry, ref: 'Opening balance', reason: 'Opening balance' }); }
      catch (e) { ui.toast(e.message, 'error'); }
    }
    Proc.audit('Create Stock Item', it.code + ' — ' + it.name, it.id);
    ui.toast('Item ' + it.code + ' created');
    return it;
  }
  async function editItem(it) {
    const v = await ui.form('Edit ' + it.code, itemFields(it, false), { ok: 'Save', size: 'lg' });
    if (!v) return;
    if (v.code && v.code !== it.code && store.find('stockItems', i => i.id !== it.id && (i.code || '').toLowerCase() === v.code.toLowerCase())) return ui.toast('Item code ' + v.code + ' is already used.', 'warning');
    store.upsert('stockItems', { id: it.id, name: v.name, code: v.code || it.code, unit: v.unit, category: v.category, location: v.location, reorderLevel: util.num(v.reorderLevel), reorderQty: util.num(v.reorderQty),
      maxLevel: util.num(v.maxLevel), trackExpiry: !!v.trackExpiry, aliases: v.aliases ? v.aliases.split(',').map(s => s.trim()).filter(Boolean) : [], notes: v.notes });
    Proc.audit('Edit Stock Item', it.code + ' — ' + v.name, it.id);
    ui.toast('Item saved'); router.refresh();
  }

  /* ------------------------------------------------------------ adjust / write-off */
  const ADJ_REASONS = ['Damaged', 'Expired', 'Theft / loss', 'Found / surplus', 'Count correction', 'Transfer in', 'Transfer out', 'Returned from department', 'Data entry error', 'Other'];
  const WRITE_OFF = ['Damaged', 'Expired', 'Theft / loss'];
  /** Adjust stock for one item (or pick one). opts: { direction: 'in'|'out', reason, batchNo } */
  function adjust(itemId, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      let it = itemId ? store.get('stockItems', itemId) : null;
      const dl = itemDatalist();
      const body = '<div class="form-grid">' +
        (it ? '' : '<div class="field s12"><label>Item<span class="req">*</span></label><input name="item" list="' + dl + '" placeholder="Scan or type the item code" autocomplete="off"><div class="hint" data-ih></div></div>') +
        '<div class="field s6"><label>Adjustment</label><select name="dir"><option value="out"' + (opts.direction !== 'in' ? ' selected' : '') + '>Remove from stock (−)</option><option value="in"' + (opts.direction === 'in' ? ' selected' : '') + '>Add to stock (+)</option></select></div>' +
        '<div class="field s6"><label>Quantity<span class="req">*</span></label><input name="qty" type="number" step="any" min="0"></div>' +
        '<div class="field s6"><label>Reason<span class="req">*</span></label><select name="reason">' + ui.options(ADJ_REASONS, opts.reason || 'Damaged') + '</select></div>' +
        '<div class="field s6" data-batchsel><label>Batch</label><select name="batchOut"></select></div>' +
        '<div class="field s6" data-batchin hidden><label>Batch / lot</label><input name="batchNo"></div><div class="field s6" data-batchin hidden><label>Expiry date</label><input type="date" name="expiryDate"></div>' +
        '<div class="field s6" data-costin hidden><label>Unit cost (JMD)</label><input name="unitCost" type="number" step="0.01"></div>' +
        '<div class="field s12"><label>Notes</label><input name="notes" placeholder="What happened? Reference to any report."></div></div><div class="small muted" data-now></div>';
      let done = false;
      ui.modal({
        title: it ? 'Adjust stock — ' + it.name : 'Stock adjustment / write-off', body, size: 'lg', onClose: () => { if (!done) resolve(null); },
        onOpen: el => {
          const dir = el.querySelector('[name=dir]'), bsel = el.querySelector('[name=batchOut]');
          const sync = () => {
            const isIn = dir.value === 'in';
            el.querySelectorAll('[data-batchin]').forEach(x => { x.hidden = !isIn; });
            el.querySelector('[data-costin]').hidden = !isIn;
            el.querySelector('[data-batchsel]').hidden = isIn || !it || !(it.batches || []).length;
            if (it) {
              bsel.innerHTML = '<option value="">First to expire</option>' + (it.batches || []).filter(b => b.qty > 0).map(b => '<option value="' + esc(b.batchNo) + '"' + (opts.batchNo === b.batchNo ? ' selected' : '') + '>' + esc((b.batchNo || 'No batch') + ' · ' + qtyFmt(b.qty) + ' · exp ' + (b.expiryDate ? util.date(b.expiryDate) : '—')) + '</option>').join('');
              el.querySelector('[name=unitCost]').placeholder = util.round2(it.avgCost) || '';
              el.querySelector('[data-now]').textContent = 'In stock now: ' + qtyFmt(it.onHand) + ' ' + (it.unit || '') + ' · average cost ' + util.money(it.avgCost);
            }
          };
          dir.onchange = sync;
          el.querySelector('[name=reason]').onchange = e => { if (/Found|Transfer in|Returned/.test(e.target.value)) dir.value = 'in'; else if (WRITE_OFF.indexOf(e.target.value) >= 0 || e.target.value === 'Transfer out') dir.value = 'out'; sync(); };
          const pick = el.querySelector('[name=item]');
          if (pick) { const upd = () => { it = findItem(pick.value); el.querySelector('[data-ih]').textContent = it ? it.name + ' · ' + qtyFmt(it.onHand) + ' ' + (it.unit || '') : ''; sync(); }; pick.addEventListener('input', upd); pick.addEventListener('change', upd); }
          sync();
        },
        actions: [{ label: 'Cancel', kind: 'ghost', onClick: () => { done = true; resolve(null); } }, {
          label: 'Post adjustment', kind: 'primary', onClick: (close, el) => {
            const v = ui.formData(el);
            if (!it) { ui.toast('Choose the item.', 'warning'); return false; }
            const q = util.num(v.qty); if (!(q > 0)) { ui.toast('Enter a quantity above zero.', 'warning'); return false; }
            const isIn = v.dir === 'in';
            const type = !isIn && WRITE_OFF.indexOf(v.reason) >= 0 ? 'Write-off' : /Transfer/.test(v.reason) ? 'Transfer' : 'Adjustment';
            try {
              const n = store.next('adj');
              const mv = domain.postStock({ itemId: it.id, type, qty: isIn ? q : -q, unitCost: isIn && v.unitCost !== '' ? util.num(v.unitCost) : undefined, batchNo: isIn ? v.batchNo : v.batchOut, expiryDate: isIn ? v.expiryDate : '',
                ref: 'ADJ-' + String(n).padStart(4, '0'), reason: v.reason, notes: v.notes, department: /Returned/.test(v.reason) ? v.notes : undefined });
              Proc.audit(type === 'Write-off' ? 'Write-off Stock' : 'Adjust Stock', it.code + ' ' + (isIn ? '+' : '−') + q + ' ' + (it.unit || '') + ' · ' + v.reason, it.id);
              ui.toast(type + ' posted — ' + it.name + ' now ' + qtyFmt(mv.balanceAfter) + ' ' + (it.unit || ''));
              done = true; resolve(mv);
            } catch (e) { ui.toast(e.message, 'error'); return false; }
          }
        }]
      });
    });
  }

  /* ------------------------------------------------------------ opening balances */
  const COLS = { code: /^(item\s*)?code|^sku|barcode/i, name: /name|description|item$/i, unit: /^u\/?m$|unit/i, category: /categ/i, location: /locat|bin|shelf/i, qty: /^qty|quantity|on\s*hand|balance|stock/i, cost: /cost|price/i, reorder: /reorder|min/i, batch: /batch|lot/i, expiry: /expir|exp\.?\s*date/i };
  function parseRows(rows) {
    if (!rows.length) return [];
    let head = rows[0].map(c => String(c || '').trim());
    const map = {};
    head.forEach((h, i) => { Object.keys(COLS).forEach(k => { if (map[k] === undefined && COLS[k].test(h)) map[k] = i; }); });
    let body = rows.slice(1);
    if (map.name === undefined) { // no header row: code, name, unit, category, location, qty, cost, reorder, batch, expiry
      ['code', 'name', 'unit', 'category', 'location', 'qty', 'cost', 'reorder', 'batch', 'expiry'].forEach((k, i) => { map[k] = i; });
      body = rows;
    }
    const g = (r, k) => (map[k] === undefined ? '' : r[map[k]]);
    return body.map(r => ({ code: String(g(r, 'code') || '').trim(), name: String(g(r, 'name') || '').trim(), unit: String(g(r, 'unit') || '').trim(), category: String(g(r, 'category') || '').trim(), location: String(g(r, 'location') || '').trim(),
      qty: util.num(g(r, 'qty')), cost: util.num(g(r, 'cost')), reorder: util.num(g(r, 'reorder')), batch: String(g(r, 'batch') || '').trim(), expiry: util.toISODate(g(r, 'expiry')) }))
      .filter(r => r.name || r.code);
  }
  function openingImport() {
    let rows = [];
    const body = '<p class="small muted mb-2">Paste from Excel (with a header row: code, name, unit, category, location, qty, unit cost, reorder level, batch, expiry) or choose an Excel/CSV file. Existing items are matched by code, then name; their quantity is added as an opening balance.</p>' +
      '<textarea class="input" data-paste rows="5" placeholder="Paste rows here…"></textarea><div class="row mt-1"><label class="btn sm">' + ui.icon('upload', 'sm') + 'Choose file<input type="file" accept=".xlsx,.xls,.csv" hidden data-file></label><span class="small muted" data-sum></span></div><div class="inv-pre mt-2" data-pre hidden></div>';
    ui.modal({
      title: 'Opening balances', size: 'xl', body,
      onOpen: el => {
        const show = () => {
          const newN = rows.filter(r => !findItem(r.code) && !findItem(r.name)).length;
          el.querySelector('[data-sum]').textContent = rows.length ? rows.length + ' rows · ' + newN + ' new items · ' + util.money(util.sum(rows, r => r.qty * r.cost)) + ' value' : '';
          const pre = el.querySelector('[data-pre]'); pre.hidden = !rows.length;
          pre.innerHTML = '<table class="table compact"><thead><tr><th>Code</th><th>Name</th><th>Unit</th><th>Category</th><th>Location</th><th class="num">Qty</th><th class="num">Unit cost</th><th>Batch</th><th>Expiry</th><th></th></tr></thead><tbody>' +
            rows.slice(0, 200).map(r => { const ex = findItem(r.code) || findItem(r.name); return '<tr><td class="mono">' + esc(r.code) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.unit) + '</td><td>' + esc(r.category) + '</td><td>' + esc(r.location) + '</td><td class="num">' + qtyFmt(r.qty) + '</td><td class="num">' + util.money(r.cost) + '</td><td>' + esc(r.batch) + '</td><td>' + esc(r.expiry ? util.date(r.expiry) : '') + '</td><td>' + (ex ? '<span class="chip">' + esc(ex.code) + '</span>' : ui.badge('New', 'info')) + '</td></tr>'; }).join('') + '</tbody></table>';
        };
        el.querySelector('[data-paste]').addEventListener('input', util.debounce(e => { rows = parseRows(e.target.value.split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t'))); show(); }, 200));
        el.querySelector('[data-file]').onchange = e => {
          const f = e.target.files[0]; if (!f || !window.XLSX) return;
          const r = new FileReader();
          r.onload = () => { try { const wb = XLSX.read(r.result, { type: 'array', cellDates: true }); rows = parseRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })); show(); } catch (err) { ui.toast('Could not read that file: ' + err.message, 'error'); } };
          r.readAsArrayBuffer(f);
        };
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Import', kind: 'primary', icon: 'upload', onClick: () => {
        if (!rows.length) { ui.toast('Nothing to import yet.', 'warning'); return false; }
        let created = 0, posted = 0;
        store.batch(() => {
          rows.forEach(r => {
            let it = (r.code && findItem(r.code)) || findItem(r.name);
            if (!it) {
              it = store.upsert('stockItems', { code: r.code || 'STK-' + String(store.next('itm')).padStart(4, '0'), name: r.name || r.code, unit: r.unit || 'each', category: r.category || 'General', location: r.location,
                reorderLevel: r.reorder, reorderQty: 0, maxLevel: 0, trackExpiry: !!(r.batch || r.expiry), onHand: 0, avgCost: 0, value: 0, batches: [], status: 'Active' }, { silent: true });
              created++;
            }
            if (r.qty > 0) { try { domain.postStock({ itemId: it.id, type: 'Opening', qty: r.qty, unitCost: r.cost, batchNo: r.batch, expiryDate: r.expiry, ref: 'Opening balance', reason: 'Opening balance' }, { silent: true }); posted++; } catch (e) { console.warn(e); } }
          });
        });
        Proc.audit('Opening Balances', created + ' items created, ' + posted + ' balances posted');
        ui.toast(created + ' items created · ' + posted + ' opening balances posted'); router.refresh();
      } }]
    });
  }

  /* ------------------------------------------------------------ list page */
  function exportItems(list) {
    if (!window.XLSX) return ui.toast('Excel library not loaded.', 'error');
    const rows = list.map(i => ({ Code: i.code, Item: i.name, Category: i.category, Location: i.location, Unit: i.unit, 'On hand': util.num(i.onHand), 'Reorder level': util.num(i.reorderLevel), 'Reorder qty': util.num(i.reorderQty), 'Max level': util.num(i.maxLevel),
      'Avg cost': util.round2(i.avgCost), Value: util.round2(i.value), Status: stateOf(i).label, 'Nearest expiry': nearestExpiry(i), 'Last received': i.lastReceived || '', 'Last issued': i.lastIssued || '' }));
    const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = [{ wch: 11 }, { wch: 38 }, { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 11 }, { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, 'Inventory ' + util.today() + '.xlsx'); Proc.audit('Export Inventory', list.length + ' items');
  }
  function printStockList(list) {
    const sorted = list.slice().sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    pdfTable({ title: 'STOCK LIST', filename: 'Stock list ' + util.today(), subtitle: [(S().storeName || 'General Stores') + ' · as at ' + util.dateLong(util.today()), sorted.length + ' items · total value ' + util.money(util.sum(sorted, i => i.value))],
      head: ['Code', 'Item', 'Category', 'Location', 'Unit', 'On hand', 'Avg cost', 'Value'],
      body: sorted.map(i => [i.code, i.name, i.category || '', i.location || '', i.unit || '', qtyFmt(i.onHand), util.money(i.avgCost), util.money(i.value)]),
      foot: ['', 'Total', '', '', '', '', '', util.money(util.sum(sorted, i => i.value))],
      columnStyles: { 0: { cellWidth: 52 }, 4: { cellWidth: 34 }, 5: { halign: 'right', cellWidth: 46 }, 6: { halign: 'right', cellWidth: 60 }, 7: { halign: 'right', cellWidth: 68 } },
      signatures: [['Prepared by', domain.officer().name], ['Checked by', ''], ['Date', '']] });
  }

  function renderList(el) {
    const all = items();
    const act = all.filter(i => i.status !== 'Inactive');
    const warn = util.num(S().expiryWarnDays || 90);
    const exp = act.filter(i => { const d = nearestExpiry(i); return d && util.daysBetween(util.today(), d) < 0; });
    const expiring = act.filter(i => { const d = nearestExpiry(i); if (!d) return false; const n = util.daysBetween(util.today(), d); return n >= 0 && n <= warn; });
    const reorder = act.filter(i => stateOf(i).label === 'Reorder');
    const out = act.filter(i => util.num(i.onHand) <= 0);
    el.innerHTML = ui.pageHead({ title: 'Inventory', sub: 'Every item held in ' + esc(S().storeName || 'General Stores') + ' — balances, bin cards, batches and expiry.',
      actions: '<button class="btn" data-a="opening">' + ui.icon('upload', 'sm') + 'Opening balances</button><button class="btn" data-a="adjust">' + ui.icon('edit', 'sm') + 'Adjust / write off</button><button class="btn primary" data-a="new">' + ui.icon('plus', 'sm') + 'New item</button>' }) +
      '<div class="inv-kpis">' +
      ui.kpi({ label: 'Items in stock', icon: 'box', value: util.int(act.filter(i => util.num(i.onHand) > 0).length), meta: util.int(act.length) + ' active items' }) +
      ui.kpi({ label: 'Stock value', icon: 'wallet', value: util.moneyShort(util.sum(act, i => i.value)), title: util.money(util.sum(act, i => i.value)), meta: 'At average cost' }) +
      ui.kpi({ label: 'At or below reorder', icon: 'alert', tone: reorder.length ? 'warn' : 'ok', value: util.int(reorder.length), meta: 'Raise a purchase request' }) +
      ui.kpi({ label: 'Out of stock', icon: 'x', tone: out.length ? 'bad' : 'ok', value: util.int(out.length), meta: 'Nothing on the shelf' }) +
      ui.kpi({ label: 'Expiring soon', icon: 'clock', tone: expiring.length ? 'warn' : 'ok', value: util.int(expiring.length), meta: 'Within ' + warn + ' days' }) +
      ui.kpi({ label: 'Expired stock', icon: 'trash', tone: exp.length ? 'bad' : 'ok', value: util.int(exp.length), meta: exp.length ? 'Write off or return' : 'None' }) + '</div>' +
      '<div class="card"><div id="invT"></div></div>';
    const cats = Array.from(new Set(all.map(i => i.category).filter(Boolean))).sort();
    const locs = Array.from(new Set(all.map(i => i.location).filter(Boolean))).sort();
    const STATUS = [{ value: 'active', label: 'Active items' }, { value: 'In stock', label: 'In stock' }, { value: 'Reorder', label: 'At / below reorder' }, { value: 'Out of stock', label: 'Out of stock' },
      { value: 'Overstocked', label: 'Overstocked' }, { value: 'expiring', label: 'Expiring soon' }, { value: 'expired', label: 'Has expired stock' }, { value: 'Inactive', label: 'Inactive' }];
    const q = Proc.router.parse().query;
    const t = ui.table(el.querySelector('#invT'), {
      rows: all, pageSize: 50, placeholder: 'Search code, item, category…', initialSort: { key: 'name', dir: 1 },
      search: i => [i.code, i.name, i.category, i.location, (i.aliases || []).join(' ')].join(' '),
      toolbar: '<div class="inv-scan">' + ui.icon('barcode', 'sm') + '<input data-scan placeholder="Scan item code + Enter" autocomplete="off"></div><button class="btn sm" data-a="xls">' + ui.icon('download', 'sm') + 'Excel</button><button class="btn sm" data-a="print">' + ui.icon('printer', 'sm') + 'Stock list</button>',
      filters: [
        { key: 'status', label: 'All items', value: q.status || 'active', options: STATUS, test: (i, v) => v === 'active' ? i.status !== 'Inactive' : v === 'Inactive' ? i.status === 'Inactive' : v === 'expiring' ? expiring.indexOf(i) >= 0 : v === 'expired' ? exp.indexOf(i) >= 0 : i.status !== 'Inactive' && stateOf(i).label === v },
        { key: 'category', label: 'All categories', options: cats },
        { key: 'location', label: 'All locations', options: locs }],
      onRow: i => router.go('inventory/' + i.id),
      columns: [
        { key: 'code', label: 'Code', render: i => '<span class="mono">' + esc(i.code) + '</span>' },
        { key: 'name', label: 'Item', render: i => '<div class="t-title">' + esc(i.name) + '</div><div class="t-sub">' + esc(i.category || '') + '</div>' },
        { key: 'location', label: 'Location', render: i => esc(i.location || '—') },
        { key: 'onHand', label: 'On hand', cls: 'num', sort: i => util.num(i.onHand), render: i => '<b>' + qtyFmt(i.onHand) + '</b> <span class="muted small">' + esc(i.unit || '') + '</span>' },
        { key: 'reorderLevel', label: 'Reorder at', cls: 'num', sort: i => util.num(i.reorderLevel), render: i => util.num(i.reorderLevel) ? qtyFmt(i.reorderLevel) : '<span class="muted">—</span>' },
        { key: 'status', label: 'Status', sort: i => stateOf(i).label, render: stateChip },
        { key: 'avgCost', label: 'Avg cost', cls: 'num', sort: i => util.num(i.avgCost), render: i => util.money(i.avgCost) },
        { key: 'value', label: 'Value', cls: 'num', sort: i => util.num(i.value), render: i => util.money(i.value) },
        { key: 'expiry', label: 'Nearest expiry', sort: i => nearestExpiry(i) || '9999', render: i => expiryChip(nearestExpiry(i)) },
        { key: 'lastReceived', label: 'Last received', render: i => i.lastReceived ? '<span class="nowrap">' + util.date(i.lastReceived) + '</span>' : '<span class="muted">—</span>' }
      ],
      footer: list => '<td colspan="7">' + util.int(list.length) + ' items</td><td class="num">' + util.money(util.sum(list, i => i.value)) + '</td><td colspan="2"></td>',
      empty: all.length ? null : ui.empty('box', 'No stock items yet', 'Items are created when Stores receives a delivery against a purchase order, or add them here with their opening balances.',
        '<button class="btn primary" data-a="new">' + ui.icon('plus', 'sm') + 'New item</button> <button class="btn" data-a="opening">' + ui.icon('upload', 'sm') + 'Opening balances</button>')
    });
    const wire = () => {
      el.querySelectorAll('[data-a=new]').forEach(b => b.onclick = async () => { const it = await newItem(); if (it) router.go('inventory/' + it.id); });
      el.querySelectorAll('[data-a=opening]').forEach(b => b.onclick = openingImport);
      el.querySelector('[data-a=adjust]').onclick = async () => { if (await adjust()) router.refresh(); };
      el.querySelector('[data-a=xls]').onclick = () => exportItems(t.visible());
      el.querySelector('[data-a=print]').onclick = () => printStockList(t.visible());
      const sc = el.querySelector('[data-scan]'); bindScan(sc, it => router.go('inventory/' + it.id)); setTimeout(() => { if (!document.querySelector('.modal')) sc.focus(); }, 60);
    };
    wire();
  }

  /* ------------------------------------------------------------ item page */
  const TABS = [['card', 'Bin card', 'list'], ['batches', 'Batches & expiry', 'calendar'], ['purchases', 'Purchases', 'cart'], ['suppliers', 'Suppliers', 'building'], ['issues', 'Issues by department', 'arrow-up-right']];
  function printBinCard(it) {
    const mv = movesFor(it.id);
    pdfTable({ title: 'BIN CARD / STOCK RECORD CARD', filename: 'Bin card ' + it.code, pageLabel: it.code,
      subtitle: [it.code + ' — ' + it.name, 'Unit of issue: ' + (it.unit || '') + '  ·  Location: ' + (it.location || '—') + '  ·  Reorder level: ' + qtyFmt(it.reorderLevel) + '  ·  Maximum: ' + (util.num(it.maxLevel) ? qtyFmt(it.maxLevel) : '—'), 'Printed ' + util.dateLong(util.today()) + ' · balance ' + qtyFmt(it.onHand) + ' ' + (it.unit || '')],
      head: ['Date', 'Reference', 'Received from / Issued to', 'Received', 'Issued', 'Balance', 'Unit cost', 'Initials'],
      body: mv.map(m => [util.date(m.date), refText(m) || m.type, partyText(m) || m.type, m.qty > 0 ? qtyFmt(m.qty) : '', m.qty < 0 ? qtyFmt(-m.qty) : '', qtyFmt(m.balanceAfter), util.money(m.unitCost), util.initials(m.by || '')]),
      columnStyles: { 0: { cellWidth: 58 }, 3: { halign: 'right', cellWidth: 50 }, 4: { halign: 'right', cellWidth: 50 }, 5: { halign: 'right', cellWidth: 52, fontStyle: 'bold' }, 6: { halign: 'right', cellWidth: 58 }, 7: { cellWidth: 40, halign: 'center' } } });
  }
  function renderItem(el, id, tab) {
    const it = store.get('stockItems', id);
    if (!it) { el.innerHTML = ui.empty('box', 'Item not found', 'It may have been merged or deleted.', '<a class="btn" href="#/inventory">Back to inventory</a>'); return; }
    tab = TABS.some(t => t[0] === tab) ? tab : 'card';
    ui.setCrumbs(['Inventory', it.code]);
    const cover = daysOfCover(it);
    const onOrder = onOrderFor(it);
    const st = stateOf(it);
    el.innerHTML = ui.pageHead({ back: { label: 'Inventory', href: '#/inventory' }, title: it.name, badge: stateChip(it),
      sub: '<span class="mono">' + esc(it.code) + '</span> · ' + esc(it.category || 'General') + ' · ' + esc(it.location || 'No location') + ' · issued in ' + esc(it.unit || 'each') + (it.trackExpiry ? ' · batch & expiry tracked' : ''),
      actions: '<button class="btn" data-a="print">' + ui.icon('printer', 'sm') + 'Bin card</button><button class="btn" data-a="edit">' + ui.icon('edit', 'sm') + 'Edit</button><button class="btn primary" data-a="adjust">' + ui.icon('refresh', 'sm') + 'Adjust stock</button><button class="btn icon" data-a="more" title="More">' + ui.icon('more') + '</button>' }) +
      (st.label === 'Reorder' || st.label === 'Out of stock' ? '<div class="alert ' + (st.label === 'Out of stock' ? 'danger' : 'warning') + ' mb-2">' + ui.icon('alert') + '<div><div class="t">' + (st.label === 'Out of stock' ? 'Out of stock' : 'At or below the reorder level') + '</div>' +
        (onOrder.length ? util.int(util.sum(onOrder, r => r.outstanding)) + ' ' + esc(it.unit || '') + ' on order (PO ' + esc(onOrder.map(r => r.po.poNumber).join(', ')) + ').' : 'Nothing on order — raise a purchase request' + (util.num(it.reorderQty) ? ' for ' + qtyFmt(it.reorderQty) + ' ' + esc(it.unit || '') : '') + '.') + '</div></div>' : '') +
      (it.status === 'Inactive' ? '<div class="alert mb-2">' + ui.icon('info') + '<div>This item is inactive — it is hidden from pickers but its history is kept.</div></div>' : '') +
      '<div class="inv-kpis">' +
      ui.kpi({ label: 'On hand', icon: 'box', value: qtyFmt(it.onHand) + ' <span class="muted" style="font-size:14px">' + esc(it.unit || '') + '</span>', meta: onOrder.length ? util.int(util.sum(onOrder, r => r.outstanding)) + ' on order' : 'Nothing on order' }) +
      ui.kpi({ label: 'Stock value', icon: 'wallet', value: util.money(it.value), meta: 'At average cost' }) +
      ui.kpi({ label: 'Average cost', icon: 'tag', value: util.money(it.avgCost), meta: 'Last paid ' + (it.lastCost !== undefined ? util.money(it.lastCost) : '—') }) +
      ui.kpi({ label: 'Reorder level', icon: 'alert', tone: st.label === 'Reorder' ? 'warn' : '', value: util.num(it.reorderLevel) ? qtyFmt(it.reorderLevel) : '—', meta: 'Reorder qty ' + (util.num(it.reorderQty) ? qtyFmt(it.reorderQty) : '—') + ' · max ' + (util.num(it.maxLevel) ? qtyFmt(it.maxLevel) : '—') }) +
      ui.kpi({ label: 'Days of cover', icon: 'clock', tone: cover !== null && cover < 14 ? 'warn' : '', value: cover === null ? '—' : util.int(cover), meta: cover === null ? 'No issues in 90 days' : 'At the last 90 days’ usage' }) +
      ui.kpi({ label: 'Nearest expiry', icon: 'calendar', tone: (expiryState(nearestExpiry(it)) || {}).tone === 'danger' ? 'bad' : (expiryState(nearestExpiry(it)) || {}).tone === 'warning' ? 'warn' : '', value: nearestExpiry(it) ? util.date(nearestExpiry(it)) : '—', meta: (it.batches || []).length + ' ' + util.plural((it.batches || []).length, 'batch', 'batches') }) + '</div>' +
      '<div class="card"><div class="tabs">' + TABS.map(t => '<button class="' + (t[0] === tab ? 'on' : '') + '" data-tab="' + t[0] + '">' + ui.icon(t[2], 'sm') + t[1] + '</button>').join('') + '</div><div id="itTab"></div></div>';
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { history.replaceState(null, '', '#/inventory/' + it.id + '/' + b.dataset.tab); renderItem(el, it.id, b.dataset.tab); });
    el.querySelector('[data-a=print]').onclick = () => printBinCard(it);
    el.querySelector('[data-a=edit]').onclick = () => editItem(it);
    el.querySelector('[data-a=adjust]').onclick = async () => { if (await adjust(it.id)) renderItem(el, it.id, tab); };
    el.querySelector('[data-a=more]').onclick = e => ui.menu(e.currentTarget, [
      { label: 'Add stock (found / returned)', icon: 'plus', onClick: async () => { if (await adjust(it.id, { direction: 'in', reason: 'Found / surplus' })) renderItem(el, it.id, tab); } },
      { label: 'Write off damaged / expired', icon: 'trash', onClick: async () => { if (await adjust(it.id, { direction: 'out', reason: 'Damaged' })) renderItem(el, it.id, tab); } },
      { sep: true },
      it.status === 'Inactive' ? { label: 'Reactivate item', icon: 'refresh', onClick: () => { store.upsert('stockItems', { id: it.id, status: 'Active' }); Proc.audit('Reactivate Stock Item', it.code, it.id); router.refresh(); } }
        : { label: 'Deactivate item', icon: 'lock', danger: true, onClick: async () => {
          if (!(await ui.confirm(util.num(it.onHand) ? esc(it.name) + ' still has ' + qtyFmt(it.onHand) + ' ' + esc(it.unit || '') + ' in stock. Deactivate anyway? Its history is kept.' : 'Deactivate ' + esc(it.name) + '? It will be hidden from item pickers; its history is kept.', { ok: 'Deactivate', danger: true }))) return;
          store.upsert('stockItems', { id: it.id, status: 'Inactive' }); Proc.audit('Deactivate Stock Item', it.code, it.id); router.refresh();
        } }
    ]);
    const body = el.querySelector('#itTab');
    ({ card: tabCard, batches: tabBatches, purchases: tabPurchases, suppliers: tabSuppliers, issues: tabIssues })[tab](body, it, () => renderItem(el, it.id, tab));
  }

  function tabCard(el, it) {
    const mv = movesFor(it.id);
    mv.forEach((m, i) => { m._i = i; });
    const t = ui.table(el, {
      rows: mv, pageSize: 40, placeholder: 'Search references, departments…', initialSort: { key: '_i', dir: 1 },
      search: m => [m.type, refText(m), partyText(m), m.notes, m.batchNo, m.by].join(' '),
      filters: [{ key: 'type', label: 'All movements', options: Array.from(new Set(mv.map(m => m.type))).sort() }],
      columns: [
        { key: '_i', label: 'Date', sort: m => m._i, render: m => '<span class="nowrap">' + util.date(m.date) + '</span>' + (m.legacy ? '<div class="t-sub">earlier system</div>' : '') },
        { key: 'type', label: 'Type', render: m => '<span class="chip">' + esc(m.type) + '</span>' },
        { key: 'ref', label: 'Reference', sort: false, render: refLink },
        { key: 'party', label: 'From / to', sort: false, render: m => esc(partyText(m) || '—') + (m.batchNo || (m.batches && m.batches.length) ? '<div class="t-sub">Batch ' + esc(m.batchNo || m.batches.map(b => b.batchNo || '—').join(', ')) + '</div>' : '') + (m.notes ? '<div class="t-sub">' + esc(m.notes) + '</div>' : '') },
        { key: 'in', label: 'Received', cls: 'num', sort: m => (m.qty > 0 ? m.qty : 0), render: m => m.qty > 0 ? '<span class="inv-in">' + qtyFmt(m.qty) + '</span>' : '' },
        { key: 'out', label: 'Issued', cls: 'num', sort: m => (m.qty < 0 ? -m.qty : 0), render: m => m.qty < 0 ? '<span class="inv-out">' + qtyFmt(-m.qty) + '</span>' : '' },
        { key: 'balanceAfter', label: 'Balance', cls: 'num', render: m => '<span class="inv-bal">' + qtyFmt(m.balanceAfter) + '</span>' },
        { key: 'unitCost', label: 'Unit cost', cls: 'num', render: m => util.money(m.unitCost) },
        { key: 'by', label: 'By', render: m => '<span class="small">' + esc(m.by || '') + '</span>' }
      ],
      empty: ui.empty('list', 'No movements yet', 'Receipts, issues, counts and adjustments appear here as they happen — the item’s bin card.')
    });
    t.state.page = 1e6; t.refresh(); // open on the latest entries, like turning to the current page of a bin card
  }
  function tabBatches(el, it, redraw) {
    const b = (it.batches || []).filter(x => util.num(x.qty) > 0).sort((a, c) => (a.expiryDate || '9999').localeCompare(c.expiryDate || '9999'));
    const unbatched = util.round2(util.num(it.onHand) - util.sum(b, x => x.qty));
    el.innerHTML = '<div class="card-b">' + (b.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Batch / lot</th><th>Expiry</th><th>Received</th><th class="num">Quantity</th><th class="num">Value</th><th></th></tr></thead><tbody>' +
      b.map((x, i) => { const e = expiryState(x.expiryDate); return '<tr><td class="mono">' + esc(x.batchNo || '—') + '</td><td>' + expiryChip(x.expiryDate) + (e && e.days >= 0 && e.tone ? '<div class="t-sub">' + e.days + ' days left</div>' : '') + '</td><td>' + (x.receivedDate ? util.date(x.receivedDate) : '—') + '</td><td class="num"><b>' + qtyFmt(x.qty) + '</b> ' + esc(it.unit || '') + '</td><td class="num">' + util.money(x.qty * util.num(it.avgCost)) + '</td><td class="actions">' +
        '<button class="btn xs ' + (e && e.tone === 'danger' ? 'danger' : 'ghost') + '" data-wo="' + i + '">' + ui.icon('trash', 'sm') + 'Write off</button></td></tr>'; }).join('') + '</tbody></table></div>' : ui.empty('calendar', 'No batches', it.trackExpiry ? 'Batches and expiry dates are recorded on each goods received note.' : 'This item is not batch-tracked. Turn on “Track batches and expiry dates” in Edit to record them on receipt.')) +
      (b.length && unbatched > 0 ? '<p class="small muted mt-2">' + qtyFmt(unbatched) + ' ' + esc(it.unit || '') + ' held without a batch number.</p>' : '') +
      '<p class="small muted mt-2">Issues always take the batch that expires first (FEFO).</p></div>';
    el.querySelectorAll('[data-wo]').forEach(btn => btn.onclick = async () => {
      const x = b[+btn.dataset.wo]; const expired = (expiryState(x.expiryDate) || {}).tone === 'danger';
      if (!(await ui.confirm('Write off batch <b>' + esc(x.batchNo || '—') + '</b> — ' + qtyFmt(x.qty) + ' ' + esc(it.unit || '') + ' (' + util.money(x.qty * util.num(it.avgCost)) + ')' + (expired ? ' as expired' : '') + '?', { ok: 'Write off', danger: true }))) return;
      try {
        const n = store.next('adj');
        domain.postStock({ itemId: it.id, type: 'Write-off', qty: -x.qty, batchNo: x.batchNo, ref: 'ADJ-' + String(n).padStart(4, '0'), reason: expired ? 'Expired' : 'Damaged', notes: 'Batch ' + (x.batchNo || '—') + (x.expiryDate ? ' exp ' + x.expiryDate : '') });
        Proc.audit('Write-off Stock', it.code + ' batch ' + (x.batchNo || '—') + ' −' + x.qty, it.id); ui.toast('Batch written off'); redraw();
      } catch (e) { ui.toast(e.message, 'error'); }
    });
  }
  function tabPurchases(el, it) {
    const rec = movesFor(it.id).filter(m => m.type === 'Receipt' || m.poId).reverse();
    const ord = onOrderFor(it);
    el.innerHTML = '<div class="card-b"><div class="section-title">On order</div>' + (ord.length ? '<div class="table-wrap mb-3"><table class="table compact"><thead><tr><th>PO</th><th>Supplier</th><th>Line</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">Outstanding</th><th>Expected</th></tr></thead><tbody>' +
      ord.map(r => '<tr><td><a href="procurement.html#/orders/' + esc(r.po.id) + '">PO ' + esc(r.po.poNumber) + '</a><div class="t-sub">' + util.date(r.po.date) + '</div></td><td>' + esc(r.po.supplierName || '') + '</td><td>' + esc(r.line.description) + '</td><td class="num">' + qtyFmt(r.ordered) + '</td><td class="num">' + qtyFmt(r.received) + '</td><td class="num"><b>' + qtyFmt(r.outstanding) + '</b> ' + esc(r.line.unit || '') + '</td><td>' + (r.overdue ? ui.badge(r.daysLate + ' days late', 'danger') : util.date(r.expected)) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p class="muted mb-3">Nothing on order for this item.</p>') +
      '<div class="section-title">Received</div>' + (rec.length ? '<div class="table-wrap"><table class="table compact"><thead><tr><th>Date</th><th>PO / GRN</th><th>Supplier</th><th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Value</th></tr></thead><tbody>' +
      rec.map(m => '<tr><td class="nowrap">' + util.date(m.date) + '</td><td>' + refLink(m) + '</td><td>' + esc(m.supplierId ? domain.supplierName(m.supplierId) : (m.department || '—')) + '</td><td class="num">' + qtyFmt(m.qty) + '</td><td class="num">' + util.money(m.unitCost) + '</td><td class="num">' + util.money(m.value) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p class="muted">No receipts yet.</p>') + '</div>';
  }
  function tabSuppliers(el, it) {
    const rec = movesFor(it.id).filter(m => m.type === 'Receipt' && m.supplierId);
    const ids = Array.from(new Set((it.supplierIds || []).concat(rec.map(m => m.supplierId))));
    const rows = ids.map(id => { const r = rec.filter(m => m.supplierId === id); const last = r[r.length - 1]; return { id, name: domain.supplierName(id, '(unknown supplier)'), qty: util.sum(r, m => m.qty), last, low: r.length ? Math.min.apply(null, r.map(m => util.num(m.unitCost))) : null }; })
      .sort((a, b) => ((b.last && b.last.date) || '').localeCompare((a.last && a.last.date) || ''));
    el.innerHTML = '<div class="card-b">' + (rows.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Supplier</th><th class="num">Received</th><th class="num">Last cost</th><th class="num">Lowest cost</th><th>Last delivery</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td><a href="procurement.html#/suppliers/' + esc(r.id) + '" class="t-title">' + esc(r.name) + '</a></td><td class="num">' + qtyFmt(r.qty) + ' ' + esc(it.unit || '') + '</td><td class="num">' + (r.last ? util.money(r.last.unitCost) : '—') + '</td><td class="num">' + (r.low !== null ? util.money(r.low) : '—') + '</td><td>' + (r.last ? util.date(r.last.date) : '—') + '</td></tr>').join('') + '</tbody></table></div>'
      : ui.empty('building', 'No suppliers yet', 'Suppliers are linked when this item is received against a purchase order.')) + '</div>';
  }
  function tabIssues(el, it) {
    const iss = movesFor(it.id).filter(m => m.type === 'Issue');
    const by = util.groupBy(iss, m => m.department || 'Not recorded');
    const rows = Object.keys(by).map(d => ({ d, qty: -util.sum(by[d], m => m.qty), value: -util.sum(by[d], m => m.value), n: by[d].length, last: by[d][by[d].length - 1].date })).sort((a, b) => b.qty - a.qty);
    el.innerHTML = '<div class="card-b">' + (rows.length ? '<div class="grid c2"><div><div class="section-title">Quantity issued</div>' + ui.hbars(rows.slice(0, 10).map(r => ({ label: r.d, value: r.qty })), { fmt: v => qtyFmt(v) + ' ' + (it.unit || '') }) + '</div>' +
      '<div class="table-wrap"><table class="table compact"><thead><tr><th>Department</th><th class="num">Issues</th><th class="num">Qty</th><th class="num">Value</th><th>Last</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + esc(r.d) + '</td><td class="num">' + r.n + '</td><td class="num">' + qtyFmt(r.qty) + '</td><td class="num">' + util.money(r.value) + '</td><td>' + util.date(r.last) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="num">' + util.int(iss.length) + '</td><td class="num">' + qtyFmt(util.sum(rows, r => r.qty)) + '</td><td class="num">' + util.money(util.sum(rows, r => r.value)) + '</td><td></td></tr></tfoot></table></div></div>'
      : ui.empty('arrow-up-right', 'Not issued yet', 'Issues to departments appear here, grouped by department.')) + '</div>';
  }

  /* ------------------------------------------------------------ register */
  Proc.page({
    id: 'inventory', title: 'Inventory', icon: 'box', section: 'Records', order: 10, countAlert: true,
    count: () => activeItems().filter(i => util.num(i.reorderLevel) > 0 && util.num(i.onHand) <= util.num(i.reorderLevel)).length,
    render(el, params) {
      css();
      if (params[0] === 'new') { el.innerHTML = ''; router.go('inventory'); setTimeout(async () => { const it = await newItem(); if (it) router.go('inventory/' + it.id); }, 50); return; }
      if (params[0]) renderItem(el, params[0], params[1]); else renderList(el);
    }
  });
  Proc.quickCreate.push({ label: 'Stock item', icon: 'box', order: 20, onClick: async () => { const it = await newItem(); if (it) router.go('inventory/' + it.id); } });
  Proc.quickCreate.push({ label: 'Stock adjustment / write-off', icon: 'edit', order: 45, onClick: async () => { if (await adjust()) router.refresh(); } });
  Proc.inventory = { adjust, newItem, findItem, bindScan, itemDatalist, pdfTable, nearestExpiry, expiryChip, expiryState, stateChip, qtyFmt, movesFor, ADJ_REASONS, WRITE_OFF };
})();
