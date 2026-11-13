/* PO Book: purchase orders handwritten in the pre-numbered PO books.
   - Register each book and its serial range (e.g. Book 23: 1124551–1124600).
   - Record each handwritten PO; it becomes a normal purchase order (source 'book')
     so it shows in supplier files, Receiving, Invoices, the PO Log and PRS return.
   - Void spoilt / cancelled leaves, and reconcile the book: every serial is
     recorded, voided, or unused; unused serials below the last one written are gaps. */
(function () {
  'use strict';
  const { util, ui, store, domain, K, files, router } = Proc;
  const esc = util.esc;
  const MAX_GRID = 2000;
  const VOID_REASONS = ['Spoilt (written in error)', 'Cancelled', 'Missing / lost leaf', 'Used for another purpose', 'Other'];

  const CSS = '.pb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:6px}' +
    '.pb-cell{border:1px solid var(--border);border-radius:7px;padding:5px 6px;font-size:11.5px;font-variant-numeric:tabular-nums;background:var(--surface);cursor:pointer;line-height:1.25;min-height:44px}' +
    '.pb-cell .n{font-weight:650;color:var(--text)}.pb-cell .s{color:var(--text-3);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.pb-cell:hover{border-color:var(--primary)}.pb-cell.used{background:var(--success-bg);border-color:var(--success-bd)}.pb-cell.void{background:var(--neutral-bg);border-color:var(--neutral-bd);text-decoration:line-through}' +
    '.pb-cell.gap{background:var(--warning-bg);border-color:var(--warning-bd)}.pb-cell.next{box-shadow:0 0 0 2px var(--primary)}' +
    '.pb-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--text-2)}.pb-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-2px;border:1px solid var(--border)}' +
    '.pb-books{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}.pb-book{cursor:pointer}.pb-book:hover{border-color:var(--primary-100);box-shadow:var(--shadow)}' +
    '.pb-items td{padding:4px 6px}.pb-items input{width:100%}';

  /* ------------------------------------------------------------ helpers */
  /** "1124595" → [1124595]; "1124595-96" → [1124595, 1124596]; "1124701-04" → 4 serials. */
  function serialsOf(poNumber) {
    const s = String(poNumber || '').replace(/\s+/g, '');
    if (/^\d+$/.test(s)) return [Number(s)];
    const m = s.match(/^(\d+)[-–](\d+)$/);
    if (!m) return [];
    let a = m[1], b = m[2];
    if (b.length < a.length) b = a.slice(0, a.length - b.length) + b;
    const x = Number(a), y = Number(b);
    if (!(y >= x) || y - x > 200) return [x];
    const out = []; for (let n = x; n <= y; n++) out.push(n); return out;
  }
  const books = () => store.list('poBooks').sort((a, b) => String(b.bookNo).localeCompare(String(a.bookNo), undefined, { numeric: true }));
  const bookLabel = b => 'Book ' + b.bookNo;
  const inRange = (b, n) => n >= Number(b.firstSerial) && n <= Number(b.lastSerial);
  function bookFor(n) { return books().find(b => inRange(b, n)) || null; }

  /* Books for the purchase orders already on record. The POs are handwritten in pre-numbered books of
     50 leaves (e.g. 1124551–1124600), so each number on record belongs to the book whose 50-number block
     holds it. A missing book is registered once, named by its range until its cover number is entered;
     books registered by hand are never changed. */
  const LEAVES = 50;
  function ensureBooks() {
    const have = books();
    const covered = n => have.some(b => inRange(b, n));
    const starts = new Set();
    store.list('purchaseOrders').forEach(p => serialsOf(p.poNumber).forEach(n => {
      if (String(n).length !== 7 || covered(n)) return;   // 7-digit PO serials only (a mistyped number is left out)
      starts.add(Math.floor((n - 1) / LEAVES) * LEAVES + 1);
    }));
    let made = 0;
    // Books before the one holding the highest number on record were used up long ago: they are registered
    // as completed (the record of them is partial — before the P.O. Log only the large PRS orders are on file).
    let top = 0; store.list('purchaseOrders').forEach(p => serialsOf(p.poNumber).forEach(n => { if (String(n).length === 7 && n > top) top = n; }));
    const currentFirst = top ? Math.floor((top - 1) / LEAVES) * LEAVES + 1 : Infinity;
    Array.from(starts).sort((a, b) => a - b).forEach(first => {
      const last = first + LEAVES - 1;
      if (have.some(b => Number(b.firstSerial) <= last && Number(b.lastSerial) >= first)) return;   // overlaps a registered book
      const past = last < currentFirst;
      const rec = store.upsert('poBooks', Object.assign({ bookNo: first + '–' + last, firstSerial: first, lastSerial: last, receivedDate: '', custodian: '', voids: [], auto: true,
        notes: 'Registered automatically from the purchase orders on record. Change the book number to the one printed on its cover.' }, past ? { status: 'Completed', pastBook: true } : {}), { silent: true });
      have.push(rec); made++;
    });
    if (made) store.emit('change', { coll: 'poBooks', action: 'create' });
    return made;
  }
  /** The book a purchase order's number falls in (null when it is in none). */
  function bookOfPO(p) { const n = serialsOf(p.poNumber)[0]; return n ? bookFor(n) : null; }

  /** Map serial → PO for every purchase order whose number falls in the book's range. */
  function usage(book) {
    const first = Number(book.firstSerial), last = Number(book.lastSerial);
    const used = new Map();
    store.list('purchaseOrders').forEach(p => {
      if (p.status === 'Cancelled' && p.source !== 'book') return;
      serialsOf(p.poNumber).forEach(n => { if (n >= first && n <= last && !used.has(n)) used.set(n, p); });
    });
    const voids = new Map((book.voids || []).map(v => [Number(v.serial), v]));
    let maxUsed = 0; used.forEach((p, n) => { if (n > maxUsed) maxUsed = n; }); voids.forEach((v, n) => { if (n > maxUsed) maxUsed = n; });
    const gaps = [];
    let next = null;
    for (let n = first; n <= last; n++) {
      if (used.has(n) || voids.has(n)) continue;
      if (maxUsed && n < maxUsed) gaps.push(n); else if (next === null) next = n;
    }
    if (next === null && gaps.length) next = gaps[0];
    const total = last - first + 1;
    const value = util.sum(Array.from(new Set(used.values())), p => p.total);
    return { first, last, total, used, voids, gaps, next, value, done: used.size + voids.size };
  }
  function bookState(book, u) {
    if (book.status === 'Completed') return 'Completed';
    if (!u.done) return 'Not started';
    return u.done >= u.total ? 'Full' : 'In use';
  }
  const STATE_TONE = { 'Not started': '', 'In use': 'info', Full: 'warning', Completed: 'success' };

  /** Next serial to write: the current in-use book's next unused serial. */
  function suggestNext(bookId) {
    const list = bookId ? [store.get('poBooks', bookId)].filter(Boolean) : books().filter(b => b.status !== 'Completed');
    for (const b of list.sort((a, c) => Number(a.firstSerial) - Number(c.firstSerial))) { const u = usage(b); if (u.next !== null) return { book: b, serial: u.next }; }
    return { book: list[0] || null, serial: null };
  }

  /* ---------------------------------------------------------- book form */
  async function bookDialog(existing) {
    const b = existing || {};
    const v = await ui.form(existing ? 'Edit ' + bookLabel(b) : 'Register a PO book', [
      { name: 'bookNo', label: 'Book number', value: b.bookNo || '', required: true, span: 's4', placeholder: 'e.g. 23' },
      { name: 'firstSerial', label: 'First PO number in book', type: 'number', value: b.firstSerial || '', required: true, span: 's4', placeholder: 'e.g. 1124551' },
      { name: 'lastSerial', label: 'Last PO number in book', type: 'number', value: b.lastSerial || '', required: true, span: 's4', placeholder: 'e.g. 1124600' },
      { name: 'receivedDate', label: 'Date received', type: 'date', value: b.receivedDate || util.today(), span: 's4' },
      { name: 'custodian', label: 'Custodian (kept by)', value: b.custodian || domain.officer().name, span: 's8' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, value: b.notes || '' }
    ], { ok: existing ? 'Save book' : 'Register book', size: 'lg' });
    if (!v) return null;
    const first = Number(v.firstSerial), last = Number(v.lastSerial);
    if (!(first > 0) || !(last >= first)) { ui.toast('The last PO number must be the same as or after the first.', 'warning'); return bookDialog(Object.assign({}, b, v)); }
    if (last - first >= MAX_GRID) { ui.toast('A book can hold at most ' + MAX_GRID + ' numbers — check the range.', 'warning'); return bookDialog(Object.assign({}, b, v)); }
    const clash = books().find(o => o.id !== b.id && !(last < Number(o.firstSerial) || first > Number(o.lastSerial)));
    if (clash) { ui.toast('That range overlaps ' + bookLabel(clash) + ' (' + clash.firstSerial + '–' + clash.lastSerial + ').', 'warning'); return bookDialog(Object.assign({}, b, v)); }
    const dupNo = books().find(o => o.id !== b.id && String(o.bookNo).trim().toLowerCase() === String(v.bookNo).trim().toLowerCase());
    if (dupNo) { ui.toast('Book ' + v.bookNo + ' is already registered.', 'warning'); return bookDialog(Object.assign({}, b, v)); }
    const rec = store.upsert('poBooks', Object.assign({ id: b.id, voids: b.voids || [], status: b.status || 'Open' }, v, { firstSerial: first, lastSerial: last }));
    store.list('purchaseOrders').filter(p => p.bookId === rec.id).forEach(p => store.upsert('purchaseOrders', { id: p.id, bookNo: rec.bookNo }, { silent: true }));
    Proc.audit(existing ? 'Edit PO Book' : 'Register PO Book', bookLabel(rec) + ': ' + first + '–' + last, rec.id);
    ui.toast(bookLabel(rec) + (existing ? ' saved' : ' registered — ' + (last - first + 1) + ' PO numbers'));
    return rec;
  }

  /* ------------------------------------------------- record a written PO */
  function lineRow(it) {
    it = it || {};
    return '<tr><td><input class="input sm" data-k="description" value="' + esc(it.description || '') + '" placeholder="Item / service as written"></td>' +
      '<td style="width:80px"><input class="input sm" data-k="qty" type="number" step="any" value="' + esc(it.qty === undefined ? 1 : it.qty) + '"></td>' +
      '<td style="width:90px"><input class="input sm" data-k="unit" list="dl-units" value="' + esc(it.unit || '') + '" placeholder="ea"></td>' +
      '<td style="width:130px"><input class="input sm num" data-k="unitPrice" type="number" step="0.01" value="' + esc(it.unitPrice || '') + '"></td>' +
      '<td class="num" style="width:120px" data-total></td><td style="width:34px"><button type="button" class="btn xs ghost icon" data-del title="Remove line">' + ui.icon('x', 'sm') + '</button></td></tr>';
  }

  /**
   * Record one handwritten PO. opts: { bookId, serial, po (existing to edit) }.
   * Resolves with the saved PO, or 'next' when "Save & record next" was used.
   */
  function recordDialog(opts) {
    opts = opts || {};
    const editing = opts.po || null;
    const sug = editing ? { book: store.get('poBooks', editing.bookId), serial: editing.poNumber } : suggestNext(opts.bookId);
    const book = sug.book;
    if (!book && !editing) { ui.toast('Register the PO book first, then record its POs.', 'warning'); return bookDialog().then(b => b ? recordDialog({ bookId: b.id }) : null); }
    const sups = ui.supplierDatalist();
    const last = store.list('purchaseOrders').filter(p => p.source === 'book').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
    const po = editing ? util.clone(editing) : { date: last ? last.date : util.today(), department: '', method: 'Single Source (SS)', paymentTerms: last ? last.paymentTerms : '30 days credit', items: [{ qty: 1 }] };
    const bookOpts = books().map(b => ({ value: b.id, label: bookLabel(b) + ' (' + b.firstSerial + '–' + b.lastSerial + ')' }));
    let scan = null;
    const body = '<datalist id="dl-units">' + K.UNITS.map(u => '<option value="' + u + '">').join('') + '</datalist>' +
      '<div class="form-grid">' +
      '<div class="field s4"><label>PO book<span class="req">*</span></label><select name="bookId">' + ui.options(bookOpts, (book && book.id) || '') + '</select></div>' +
      '<div class="field s4"><label>PO number (from the leaf)<span class="req">*</span></label><input name="poNumber" value="' + esc(sug.serial || '') + '" inputmode="numeric" autocomplete="off"><div class="hint" data-nohint></div></div>' +
      '<div class="field s4"><label>PO date<span class="req">*</span></label><input type="date" name="date" value="' + esc(po.date || util.today()) + '"></div>' +
      '<div class="field s8"><label>Supplier<span class="req">*</span></label><input name="supplierName" list="' + sups + '" value="' + esc(po.supplierName || '') + '" autocomplete="off" placeholder="Start typing — new names create a supplier file"></div>' +
      '<div class="field s4"><label>Method</label><select name="method">' + ui.options(K.METHODS, po.method || 'Single Source (SS)') + '</select></div>' +
      '<div class="field s4"><label>Department</label><select name="department" data-dept></select></div>' +
      '<div class="field s4"><label>Requisitioner</label><input name="requisitioner" value="' + esc(po.requisitioner || '') + '"></div>' +
      '<div class="field s4"><label>Request / requisition #</label><input name="requestNo" value="' + esc(po.requestNo || '') + '"></div>' +
      '<div class="field s12"><label>Description (as written on the PO)</label><input name="description" value="' + esc(po.description || '') + '" placeholder="e.g. Monthly grocery order — October"></div>' +
      '<div class="s12 full"><div class="lbl-text">Items</div><div class="table-wrap"><table class="table compact pb-items"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th class="num">Unit price</th><th class="num">Line total</th><th></th></tr></thead><tbody>' +
      (po.items && po.items.length ? po.items : [{ qty: 1 }]).map(lineRow).join('') + '</tbody></table></div>' +
      '<div class="row between mt-1"><button type="button" class="btn sm" data-add>' + ui.icon('plus', 'sm') + 'Add line</button>' +
      '<div class="row"><label class="check"><input type="checkbox" name="gctOn"' + (po.gct ? ' checked' : '') + '> Add GCT (' + util.round2(store.settings().gctRate * 100) + '%)</label>' +
      '<span class="muted small">or total as written</span><input class="input sm num" style="width:150px" name="writtenTotal" type="number" step="0.01" placeholder="Total on PO" value="' + esc(editing && !editing.items.length ? editing.total : '') + '"></div></div>' +
      '<div class="row end mt-1"><span class="muted">PO total</span><span class="money-big" data-grand style="font-size:20px">$0.00</span></div><div class="words right" data-words></div></div>' +
      '<div class="field s6"><label>Payment terms</label><select name="paymentTerms">' + ui.options(K.TERMS, po.paymentTerms || '30 days credit') + '</select></div>' +
      '<div class="field s6"><label>Scan / photo of the PO leaf</label><input type="file" name="scanFile" accept="application/pdf,image/*"><div class="hint">Optional — saved to the supplier\'s documents.</div></div>' +
      '<div class="field s12"><label>Notes</label><input name="comment" value="' + esc(po.comment || '') + '"></div></div>';

    return new Promise(resolve => {
      let done = false;
      let recalcFn = () => ({ sub: 0, gct: 0, grand: 0 });
      ui.modal({
        title: editing ? 'Edit handwritten PO ' + editing.poNumber : 'Record a PO from the book', size: 'xl', body, sticky: true,
        onClose: () => { if (!done) resolve(null); },
        onOpen: (el) => {
          const dept = el.querySelector('[data-dept]');
          if (typeof window.mphPopulateDeptSelect === 'function') { try { window.mphPopulateDeptSelect(dept, { firstOption: { value: '', label: 'Select department' } }); } catch (e) { /* ignore */ } }
          if (dept.options.length <= 1 && po.department) dept.innerHTML = '<option value=""></option>';
          if (po.department && !Array.from(dept.options).some(o => o.value === po.department)) dept.insertAdjacentHTML('beforeend', '<option>' + esc(po.department) + '</option>');
          dept.value = po.department || '';
          const tbody = el.querySelector('.pb-items tbody');
          const recalc = () => {
            let sub = 0;
            tbody.querySelectorAll('tr').forEach(tr => {
              const q = util.num(tr.querySelector('[data-k=qty]').value), p = util.num(tr.querySelector('[data-k=unitPrice]').value);
              const t = util.round2(q * p); sub += t; tr.querySelector('[data-total]').textContent = t ? util.money(t) : '';
            });
            const written = util.num(el.querySelector('[name=writtenTotal]').value);
            const gct = el.querySelector('[name=gctOn]').checked ? util.round2(sub * store.settings().gctRate) : 0;
            const grand = sub ? util.round2(sub + gct) : written;
            el.querySelector('[data-grand]').textContent = util.money(grand);
            el.querySelector('[data-words]').textContent = grand ? domain.amountWords(grand) : '';
            return { sub: util.round2(sub), gct, grand };
          };
          el.addEventListener('input', recalc); el.addEventListener('change', recalc);
          el.querySelector('[data-add]').onclick = () => { tbody.insertAdjacentHTML('beforeend', lineRow({ qty: 1 })); tbody.lastElementChild.querySelector('input').focus(); };
          tbody.addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b && tbody.children.length > 1) { b.closest('tr').remove(); recalc(); } });
          tbody.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-k=unitPrice]') && e.target.closest('tr') === tbody.lastElementChild) { e.preventDefault(); el.querySelector('[data-add]').click(); } });
          // Live check of the PO number against the book and existing POs.
          const noEl = el.querySelector('[name=poNumber]'), hint = el.querySelector('[data-nohint]'), bookSel = el.querySelector('[name=bookId]');
          const check = () => {
            const ns = serialsOf(noEl.value); const b = store.get('poBooks', bookSel.value);
            let msg = '';
            if (!noEl.value.trim()) msg = '';
            else if (!ns.length) msg = '<span class="text-danger">Use digits, or a range such as 1124595-96.</span>';
            else if (b && ns.some(n => !inRange(b, n))) { const other = bookFor(ns[0]); msg = '<span class="text-warning">Outside ' + esc(bookLabel(b)) + ' (' + b.firstSerial + '–' + b.lastSerial + ')' + (other ? ' — it belongs to ' + esc(bookLabel(other)) : '') + '.</span>'; }
            else {
              const taken = store.find('purchaseOrders', p => (!editing || p.id !== editing.id) && serialsOf(p.poNumber).some(n => ns.indexOf(n) >= 0));
              const voided = b && (b.voids || []).find(v => ns.indexOf(Number(v.serial)) >= 0);
              if (taken) msg = '<span class="text-warning">Already on file: ' + esc(taken.supplierName || '') + ' · ' + util.money(taken.total) + (taken.source !== 'book' ? ' (from the ' + (taken.source === 'import:polog' ? 'PO Log' : 'system') + ') — saving will link it to this book' : '') + '.</span>';
              else if (voided) msg = '<span class="text-danger">This leaf is recorded as void (' + esc(voided.reason) + ').</span>';
              else msg = '<span class="text-success">Available in ' + esc(b ? bookLabel(b) : 'the book') + '.</span>';
            }
            hint.innerHTML = msg;
          };
          noEl.addEventListener('input', check); bookSel.addEventListener('change', () => { if (!editing) { const s = suggestNext(bookSel.value); if (s.serial) noEl.value = s.serial; } check(); });
          el.querySelector('[name=scanFile]').addEventListener('change', e => { scan = e.target.files[0] || null; });
          check(); recalc();
          setTimeout(() => el.querySelector('[name=supplierName]').focus(), 40);
          recalcFn = recalc;
        },
        actions: [
          { label: 'Cancel', kind: 'ghost', onClick: () => { done = true; resolve(null); } },
          editing ? null : { label: 'Save & record next', kind: '', icon: 'plus', onClick: async (close, el) => { const r = await save(el); if (!r) return false; done = true; resolve('next'); } },
          { label: editing ? 'Save changes' : 'Save PO', kind: 'primary', icon: 'check', onClick: async (close, el) => { const r = await save(el); if (!r) return false; done = true; resolve(r); } }
        ].filter(Boolean)
      });

      async function save(el) {
        const v = ui.formData(el);
        const errs = [];
        const ns = serialsOf(v.poNumber);
        const b = store.get('poBooks', v.bookId);
        if (!b) errs.push('the PO book');
        if (!ns.length) errs.push('a valid PO number');
        if (!v.date) errs.push('the PO date');
        if (!v.supplierName) errs.push('the supplier');
        const tot = recalcFn();
        if (!tot.grand) errs.push('the amount (unit prices or the total as written)');
        if (errs.length) { ui.toast('Please enter ' + errs.join(', ') + '.', 'warning'); return null; }
        if (b && ns.some(n => !inRange(b, n)) && !await ui.confirm('PO ' + esc(v.poNumber) + ' is outside ' + esc(bookLabel(b)) + '\'s range (' + b.firstSerial + '–' + b.lastSerial + '). Save it anyway?', { ok: 'Save anyway' })) return null;
        const voided = b && (b.voids || []).filter(x => ns.indexOf(Number(x.serial)) >= 0);
        if (voided && voided.length) {
          if (!await ui.confirm('This leaf is recorded as void (' + esc(voided[0].reason) + '). Remove the void and record the PO?', { ok: 'Record PO' })) return null;
          store.upsert('poBooks', { id: b.id, voids: (b.voids || []).filter(x => ns.indexOf(Number(x.serial)) < 0) });
        }
        const items = [];
        el.querySelectorAll('.pb-items tbody tr').forEach(tr => {
          const d = tr.querySelector('[data-k=description]').value.trim(), q = util.num(tr.querySelector('[data-k=qty]').value), u = tr.querySelector('[data-k=unit]').value.trim(), p = util.num(tr.querySelector('[data-k=unitPrice]').value);
          if (d || p) items.push({ description: d || v.description || 'Item', qty: q || 1, unit: u, unitPrice: p, total: util.round2((q || 1) * p) });
        });
        const sup = domain.ensureSupplier(v.supplierName);
        const desc = v.description || (items[0] && items[0].description) || 'Purchase order';
        const lines = tot.sub ? items : [{ description: desc, qty: 1, unit: 'lot', unitPrice: tot.grand, total: tot.grand }];
        const rec = {
          poNumber: v.poNumber.trim(), date: v.date, supplierId: sup.id, supplierName: sup.name, description: desc, department: v.department, requisitioner: v.requisitioner, requestNo: v.requestNo,
          items: lines, subtotal: tot.sub || tot.grand, gct: tot.gct, total: tot.grand, method: v.method, paymentTerms: v.paymentTerms, comment: v.comment,
          bookId: b.id, bookNo: b.bookNo, deliveryAddress: store.settings().org.deliveryAddress
        };
        // Same number already on file (e.g. imported from the PO Log): link it rather than duplicate.
        const existing = editing || store.find('purchaseOrders', p => serialsOf(p.poNumber).some(n => ns.indexOf(n) >= 0));
        let saved;
        if (existing) {
          const patch = editing ? rec : { bookId: b.id, bookNo: b.bookNo };
          if (!editing) ['department', 'requisitioner', 'requestNo', 'comment', 'method', 'paymentTerms'].forEach(k => { if (rec[k] && !existing[k]) patch[k] = rec[k]; });
          if (!editing && Math.abs((existing.total || 0) - rec.total) > 0.5 && await ui.confirm('PO ' + esc(existing.poNumber) + ' is already on file for <b>' + esc(existing.supplierName) + '</b> at ' + util.money(existing.total) + '. Replace it with what is written in the book (' + esc(rec.supplierName) + ', ' + util.money(rec.total) + ')?', { ok: 'Use the book entry', cancel: 'Keep the existing figures' })) Object.assign(patch, rec);
          saved = store.upsert('purchaseOrders', Object.assign({ id: existing.id }, patch));
        } else {
          saved = store.upsert('purchaseOrders', Object.assign(rec, { status: 'Issued', source: 'book', issuedAt: v.date }));
          domain.afterIssue(saved);
        }
        domain.refreshOrderStatus(saved.id);
        if (scan) await files.add(scan, { kind: 'Purchase Order', supplierId: saved.supplierId, ref: saved.poNumber, date: saved.date, amount: saved.total, title: 'PO ' + saved.poNumber + ' (book ' + b.bookNo + ')', links: { poId: saved.id } });
        Proc.audit(editing ? 'Edit Book PO' : 'Record Book PO', 'PO ' + saved.poNumber + ' — ' + saved.supplierName + ' — ' + util.money(saved.total) + ' (' + bookLabel(b) + ')', saved.id);
        ui.toast('PO ' + saved.poNumber + (existing && !editing ? ' linked to ' : ' recorded in ') + bookLabel(b));
        return saved;
      }
    });
  }
  /** Record POs one after another until the officer stops. */
  async function recordLoop(bookId, serial) {
    for (;;) {
      const r = await recordDialog({ bookId, serial });
      if (r !== 'next') { if (r) router.refresh(); return r; }
      serial = null;
    }
  }

  async function voidDialog(book, serial) {
    const u = usage(book);
    const v = await ui.form('Void a leaf in ' + bookLabel(book), [
      { name: 'serial', label: 'PO number', type: 'number', value: serial || u.next || '', required: true, span: 's6' },
      { name: 'date', label: 'Date', type: 'date', value: util.today(), required: true, span: 's6' },
      { name: 'reason', label: 'Reason', type: 'select', options: VOID_REASONS, value: VOID_REASONS[0], required: true },
      { name: 'notes', label: 'Explanation', type: 'textarea', rows: 2, hint: 'Keep the spoilt leaf (all copies) in the book, marked VOID.' }
    ], { ok: 'Void leaf' });
    if (!v) return;
    const n = Number(v.serial);
    if (!inRange(book, n)) return ui.toast('PO ' + n + ' is not in ' + bookLabel(book) + ' (' + book.firstSerial + '–' + book.lastSerial + ').', 'warning');
    if (u.used.has(n)) return ui.toast('PO ' + n + ' is already recorded for ' + (u.used.get(n).supplierName || 'a supplier') + '. Cancel that PO instead.', 'warning');
    const voids = (book.voids || []).filter(x => Number(x.serial) !== n).concat([{ serial: n, date: v.date, reason: v.reason, notes: v.notes, by: domain.officer().name }]);
    store.upsert('poBooks', { id: book.id, voids });
    Proc.audit('Void PO Leaf', 'PO ' + n + ' in ' + bookLabel(book) + ' — ' + v.reason, book.id);
    ui.toast('PO ' + n + ' marked void'); router.refresh();
  }

  /* ------------------------------------------------------------ exports */
  function exportBook(book) {
    const u = usage(book);
    const rows = [];
    for (let n = u.first; n <= u.last; n++) {
      const p = u.used.get(n), v = u.voids.get(n);
      rows.push({ 'PO #': n, Status: p ? 'Recorded' : v ? 'Void' : u.gaps.indexOf(n) >= 0 ? 'GAP — not recorded' : 'Unused', Date: p ? p.date : v ? v.date : '', Supplier: p ? p.supplierName : '',
        Description: p ? p.description : v ? v.reason + (v.notes ? ' — ' + v.notes : '') : '', Department: p ? p.department || '' : '', Amount: p ? p.total : '', 'PO status': p ? p.status : '' });
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 11 }, { wch: 20 }, { wch: 11 }, { wch: 34 }, { wch: 50 }, { wch: 22 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, ('Book ' + book.bookNo).slice(0, 31));
    XLSX.writeFile(wb, 'PO Book ' + book.bookNo + ' register.xlsx');
    Proc.audit('Export PO Book', bookLabel(book), book.id);
  }
  function printReconciliation(book) {
    const u = usage(book), S = store.settings();
    const row = n => { const p = u.used.get(n), v = u.voids.get(n); return '<tr' + (u.gaps.indexOf(n) >= 0 ? ' style="background:#fff3cd"' : '') + '><td>' + n + '</td><td>' + (p ? 'Recorded' : v ? 'VOID' : u.gaps.indexOf(n) >= 0 ? 'GAP' : 'Unused') + '</td><td>' + esc(p ? util.date(p.date) : v ? util.date(v.date) : '') + '</td><td>' + esc(p ? p.supplierName : v ? v.reason : '') + '</td><td>' + esc(p ? p.description : v ? v.notes || '' : '') + '</td><td style="text-align:right">' + (p ? util.money(p.total) : '') + '</td></tr>'; };
    let body = ''; for (let n = u.first; n <= u.last; n++) body += row(n);
    const w = window.open('', '_blank'); if (!w) return ui.toast('Allow pop-ups to print.', 'warning');
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>PO Book ' + esc(book.bookNo) + ' reconciliation</title><style>body{font:12px Arial,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0}h2{font-size:13px;font-weight:normal;margin:4px 0 14px;color:#444}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#eee}.sum td{border:0;padding:2px 12px 2px 0}.sig{margin-top:40px;display:flex;gap:60px}.sig div{border-top:1px solid #000;padding-top:4px;width:240px}</style></head><body>' +
      '<h1>' + esc(S.org.hospital) + ' — PO Book ' + esc(book.bookNo) + ' reconciliation</h1><h2>PO numbers ' + u.first + ' to ' + u.last + ' · printed ' + util.dateLong(util.today()) + '</h2>' +
      '<table class="sum" style="width:auto;margin-bottom:12px"><tr><td>Leaves in book</td><td><b>' + u.total + '</b></td><td>Recorded POs</td><td><b>' + u.used.size + '</b></td><td>Void</td><td><b>' + u.voids.size + '</b></td><td>Gaps</td><td><b>' + u.gaps.length + '</b></td><td>Unused</td><td><b>' + (u.total - u.done - u.gaps.length) + '</b></td><td>Value</td><td><b>' + util.money(u.value) + '</b></td></tr></table>' +
      '<table><thead><tr><th>PO #</th><th>Status</th><th>Date</th><th>Supplier / reason</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + body + '</tbody></table>' +
      '<div class="sig"><div>Prepared by: ' + esc(domain.officer().name) + '</div><div>Checked by</div></div><script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  }

  /* --------------------------------------------------------------- pages */
  function renderList(el) {
    ensureBooks();
    const all = books();
    // Every purchase order on record — the same list as the Purchase Orders page — with the book its number is in.
    const bookPOs = store.list('purchaseOrders').map(p => { const b = p.bookId ? store.get('poBooks', p.bookId) || bookOfPO(p) : bookOfPO(p); return Object.assign({}, p, { bookId: b ? b.id : '', bookNo: b ? b.bookNo : '' }); });
    const stats = all.map(b => ({ b, u: usage(b) }));
    const open = stats.filter(s => bookState(s.b, s.u) !== 'Completed');
    const gaps = util.sum(stats.filter(s => !s.b.pastBook), s => s.u.gaps.length);
    const nxt = suggestNext();
    el.innerHTML = ui.pageHead({
      title: 'PO Book', sub: 'Purchase orders written by hand in the pre-numbered PO books — record each one, void spoilt leaves, and reconcile every book.',
      actions: '<button class="btn" data-a="book">' + ui.icon('plus', 'sm') + 'Register a book</button><a class="btn" href="#/po-form" title="Type a PO on the Government of Jamaica form and download it as a PDF">' + ui.icon('file', 'sm') + 'Digital PO form</a><button class="btn primary" data-a="record">' + ui.icon('edit', 'sm') + 'Record a PO from the book</button>'
    }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Books in use', icon: 'file', value: util.int(open.length), meta: all.length + ' registered' }) +
      ui.kpi({ label: 'Next PO number', icon: 'edit', tone: 'pur', value: nxt.serial ? String(nxt.serial) : '—', meta: nxt.book ? bookLabel(nxt.book) : 'Register a book' }) +
      ui.kpi({ label: 'Handwritten POs', icon: 'cart', value: util.int(bookPOs.length), meta: util.money(util.sum(bookPOs, p => p.total), { noCents: true }) + ' recorded' }) +
      ui.kpi({ label: 'Gaps to explain', icon: 'alert', tone: gaps ? 'warn' : 'ok', value: util.int(gaps), meta: gaps ? 'Unrecorded numbers before the last one used' : 'Every used number is accounted for' }) +
      '</div>' +
      (all.length ? '<div class="section-title">Books</div><div class="pb-books mb-3">' + stats.map(({ b, u }) => {
        const st = bookState(b, u);
        return '<div class="card pb-book" data-book="' + b.id + '"><div class="card-b"><div class="row between"><div class="strong" style="font-size:16px">' + esc(bookLabel(b)) + '</div>' + ui.badge(st, STATE_TONE[st]) + '</div>' +
          '<div class="muted small mt-1">PO ' + u.first + ' – ' + u.last + ' · ' + u.total + ' leaves' + (b.custodian ? ' · kept by ' + esc(b.custodian) : '') + '</div>' +
          '<div class="progress mt-2"><div style="width:' + Math.round(u.done / u.total * 100) + '%"></div></div>' +
          '<div class="row between small mt-1"><span>' + u.used.size + ' recorded · ' + u.voids.size + ' void' + (u.gaps.length ? ' · <b class="text-warning">' + u.gaps.length + ' ' + util.plural(u.gaps.length, 'gap') + '</b>' : '') + '</span><span class="strong">' + util.moneyShort(u.value) + '</span></div>' +
          (u.next ? '<div class="small muted mt-1">Next number: <b>' + u.next + '</b></div>' : '') + '</div></div>';
      }).join('') + '</div>' : '<div class="card mb-3">' + ui.empty('file', 'No PO books registered yet', 'Register each pre-numbered PO book with its first and last PO number. The system then suggests the next number, flags gaps and links POs already imported from the PO Log.', '<button class="btn primary" data-a="book">' + ui.icon('plus', 'sm') + 'Register a book</button>') + '</div>') +
      '<div class="card"><div class="card-h"><div><h3>Handwritten purchase orders</h3><div class="sub">Every purchase order on record, with the book its number is in — the same list as Purchase Orders and each supplier\'s file.</div></div></div><div id="pbT"></div></div>';
    ui.table(el.querySelector('#pbT'), {
      rows: bookPOs, placeholder: 'Search PO #, supplier, description…', initialSort: { key: 'poNumber', dir: -1 },
      search: p => [p.poNumber, p.supplierName, p.description, p.department, p.bookNo].join(' '),
      filters: [{ key: 'bookId', label: 'All books', options: all.map(b => ({ value: b.id, label: bookLabel(b) })) }],
      onRow: p => router.go('orders/' + p.id),
      columns: [
        { key: 'poNumber', label: 'PO #', render: p => '<span class="t-title mono">' + esc(p.poNumber) + '</span>', sort: p => serialsOf(p.poNumber)[0] || 0 },
        { key: 'bookNo', label: 'Book', render: p => p.bookNo ? '<span class="chip">Book ' + esc(p.bookNo) + '</span>' : '<span class="muted">—</span>', sort: p => serialsOf(p.poNumber)[0] || 0 },
        { key: 'date', label: 'Date', render: p => '<span class="nowrap">' + util.date(p.date) + '</span>' },
        { key: 'supplierName', label: 'Supplier', render: p => '<a href="#/suppliers/' + esc(p.supplierId) + '">' + esc(p.supplierName) + '</a>' },
        { key: 'description', label: 'Description', render: p => '<div class="truncate" style="max-width:340px">' + esc(p.description) + '</div><div class="t-sub">' + esc(p.department || '') + '</div>' },
        { key: 'total', label: 'Amount', cls: 'num', render: p => util.money(p.total), sort: p => p.total || 0 },
        { key: 'status', label: 'Status', render: p => ui.badge(p.status) }
      ],
      footer: list => '<td colspan="5">Total</td><td class="num">' + util.money(util.sum(list, p => p.total)) + '</td><td></td>',
      empty: ui.empty('cart', 'No handwritten POs recorded yet', 'Use “Record a PO from the book” as each PO is written.')
    });
    el.querySelectorAll('[data-a=book]').forEach(b => b.onclick = async () => { const r = await bookDialog(); if (r) router.go('pobook/' + r.id); });
    el.querySelector('[data-a=record]').onclick = () => recordLoop();
    el.querySelectorAll('[data-book]').forEach(c => c.onclick = () => router.go('pobook/' + c.dataset.book));
  }

  function renderBook(el, id) {
    const book = store.get('poBooks', id);
    if (!book) { el.innerHTML = ui.empty('file', 'PO book not found', 'It may have been deleted.', '<a class="btn" href="#/pobook">Back to PO Book</a>'); return; }
    const u = usage(book), st = bookState(book, u);
    ui.setCrumbs(['PO Book', bookLabel(book)]);
    el.innerHTML = ui.pageHead({
      back: { label: 'PO Book', href: '#/pobook' }, title: bookLabel(book), badge: ui.badge(st, STATE_TONE[st]),
      sub: 'PO numbers ' + u.first + ' – ' + u.last + ' · ' + u.total + ' leaves' + (book.receivedDate ? ' · received ' + util.date(book.receivedDate) : '') + (book.custodian ? ' · kept by ' + esc(book.custodian) : ''),
      actions: '<button class="btn" data-a="print">' + ui.icon('printer', 'sm') + 'Print reconciliation</button><button class="btn" data-a="excel">' + ui.icon('download', 'sm') + 'Excel</button>' +
        '<button class="btn" data-a="void">' + ui.icon('x', 'sm') + 'Void a leaf</button><button class="btn primary" data-a="record"' + (st === 'Completed' ? ' disabled' : '') + '>' + ui.icon('edit', 'sm') + 'Record PO' + (u.next ? ' ' + u.next : '') + '</button><button class="btn icon" data-a="more" title="More">' + ui.icon('more') + '</button>'
    }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Recorded POs', icon: 'cart', value: util.int(u.used.size), meta: util.money(u.value, { noCents: true }) }) +
      ui.kpi({ label: 'Void leaves', icon: 'x', value: util.int(u.voids.size), meta: 'Spoilt, cancelled or missing' }) +
      ui.kpi({ label: 'Gaps', icon: 'alert', tone: u.gaps.length ? 'warn' : 'ok', value: util.int(u.gaps.length), meta: u.gaps.length ? 'e.g. ' + u.gaps.slice(0, 4).join(', ') + (u.gaps.length > 4 ? '…' : '') : 'None' }) +
      ui.kpi({ label: 'Remaining', icon: 'file', tone: 'pur', value: util.int(u.total - u.done - u.gaps.length), meta: u.next ? 'Next: ' + u.next : 'Book is full' }) + '</div>' +
      (u.gaps.length ? '<div class="alert warning mb-2">' + ui.icon('alert') + '<div><div class="t">' + u.gaps.length + ' ' + util.plural(u.gaps.length, 'number is', 'numbers are') + ' unaccounted for</div>Every leaf of an accountable PO book must be either recorded or voided. Click an amber number to record the PO written on it, or void it with an explanation.</div></div>' : '') +
      '<div class="card"><div class="card-h"><div><h3>Leaves</h3><div class="sub">Click a number to open, record or void it.</div></div><div class="pb-legend"><span><i style="background:var(--success-bg);border-color:var(--success-bd)"></i>Recorded</span><span><i style="background:var(--warning-bg);border-color:var(--warning-bd)"></i>Gap</span><span><i style="background:var(--neutral-bg)"></i>Void</span><span><i></i>Unused</span></div></div>' +
      '<div class="card-b"><div class="pb-grid" id="pbGrid"></div></div></div>' +
      (book.voids && book.voids.length ? '<div class="card"><div class="card-h"><h3>Void leaves</h3></div><div class="card-b flush"><div class="table-wrap"><table class="table compact"><thead><tr><th>PO #</th><th>Date</th><th>Reason</th><th>Explanation</th><th>By</th><th></th></tr></thead><tbody>' +
        book.voids.slice().sort((a, b) => a.serial - b.serial).map(v => '<tr><td class="mono">' + v.serial + '</td><td>' + util.date(v.date) + '</td><td>' + esc(v.reason) + '</td><td>' + esc(v.notes || '') + '</td><td>' + esc(v.by || '') + '</td><td class="actions"><button class="btn xs ghost" data-unvoid="' + v.serial + '">Undo</button></td></tr>').join('') + '</tbody></table></div></div></div>' : '');
    const grid = el.querySelector('#pbGrid');
    let html = '';
    for (let n = u.first; n <= u.last; n++) {
      const p = u.used.get(n), v = u.voids.get(n), gap = u.gaps.indexOf(n) >= 0;
      const cls = p ? 'used' : v ? 'void' : gap ? 'gap' : '';
      const sub = p ? (p.supplierName || '') : v ? 'VOID' : gap ? 'not recorded' : '';
      html += '<div class="pb-cell ' + cls + (n === u.next ? ' next' : '') + '" data-n="' + n + '" title="' + esc(p ? p.supplierName + ' · ' + util.money(p.total) + ' · ' + util.date(p.date) : v ? v.reason : gap ? 'Gap — record or void this number' : 'Unused') + '"><div class="n">' + String(n).slice(-4) + '</div><div class="s">' + esc(sub) + '</div></div>';
    }
    grid.innerHTML = html;
    grid.onclick = e => {
      const c = e.target.closest('[data-n]'); if (!c) return;
      const n = Number(c.dataset.n), p = u.used.get(n);
      if (p) return router.go('orders/' + p.id);
      ui.menu(c, [{ header: 'PO ' + n }, { label: 'Record the PO written on this leaf', icon: 'edit', onClick: () => recordLoop(book.id, n).then(() => router.refresh()) }, { label: 'Void this leaf', icon: 'x', onClick: () => voidDialog(book, n) }], { align: 'left' });
    };
    el.querySelector('[data-a=record]').onclick = () => recordLoop(book.id).then(() => router.refresh());
    el.querySelector('[data-a=void]').onclick = () => voidDialog(book);
    el.querySelector('[data-a=excel]').onclick = () => exportBook(book);
    el.querySelector('[data-a=print]').onclick = () => printReconciliation(book);
    el.querySelectorAll('[data-unvoid]').forEach(b => b.onclick = async () => {
      const n = Number(b.dataset.unvoid);
      if (!await ui.confirm('Remove the void on PO ' + n + '?', { ok: 'Remove void' })) return;
      store.upsert('poBooks', { id: book.id, voids: (book.voids || []).filter(v => Number(v.serial) !== n) }); Proc.audit('Undo Void PO Leaf', 'PO ' + n + ' in ' + bookLabel(book), book.id); router.refresh();
    });
    el.querySelector('[data-a=more]').onclick = e => ui.menu(e.currentTarget, [
      { label: 'Edit book details', icon: 'edit', onClick: () => bookDialog(book).then(r => { if (r) router.refresh(); }) },
      st === 'Completed' ? { label: 'Reopen book', icon: 'refresh', onClick: () => { store.upsert('poBooks', { id: book.id, status: 'Open', closedDate: '' }); router.refresh(); } }
        : { label: 'Mark book completed', icon: 'check', onClick: async () => {
          if (u.gaps.length || u.total - u.done - u.gaps.length) { if (!await ui.confirm('This book still has ' + (u.total - u.done) + ' leaves not recorded or voided. Mark it completed anyway?', { ok: 'Mark completed' })) return; }
          store.upsert('poBooks', { id: book.id, status: 'Completed', closedDate: util.today() }); Proc.audit('Complete PO Book', bookLabel(book), book.id); router.refresh();
        } },
      { sep: true },
      { label: 'Delete book', icon: 'trash', danger: true, onClick: async () => {
        const linked = store.list('purchaseOrders').filter(p => p.bookId === book.id);
        if (!await ui.confirm('Delete ' + esc(bookLabel(book)) + '? ' + (linked.length ? linked.length + ' recorded POs stay in Purchase Orders but lose their book link.' : ''), { danger: true, ok: 'Delete book' })) return;
        linked.forEach(p => store.upsert('purchaseOrders', { id: p.id, bookId: '', bookNo: '' }, { silent: true }));
        store.remove('poBooks', book.id); Proc.audit('Delete PO Book', bookLabel(book), book.id); router.go('pobook');
      } }
    ]);
  }

  Proc.page({
    id: 'pobook', title: 'PO Book', icon: 'edit', section: 'Workflow', order: 45,
    count: () => books().reduce((s, b) => s + (b.status === 'Completed' ? 0 : usage(b).gaps.length), 0), countAlert: true,
    render(el, params) {
      if (!document.getElementById('css-pobook')) document.head.insertAdjacentHTML('beforeend', '<style id="css-pobook">' + CSS + '</style>');
      if (params[0]) renderBook(el, params[0]); else renderList(el);
    }
  });
  Proc.quickCreate.push({ label: 'PO from the PO book', icon: 'edit', order: 41, onClick: () => recordLoop() });
  Proc.pobook = { serialsOf, usage, record: recordLoop, books };
})();
