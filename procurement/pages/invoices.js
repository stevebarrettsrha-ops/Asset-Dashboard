/* ==========================================================================
   Invoices & Payments — supplier invoices matched to POs, certification,
   payment and aging.
   Routes: #/invoices · #/invoices/<id> · #/invoices?new=1&po=<poId>|&supplier=<id>
   ========================================================================== */
(function () {
  'use strict';
  const { util, ui, store, domain, K, files, router } = Proc;
  const esc = util.esc;

  if (!document.getElementById('css-invoices')) document.head.insertAdjacentHTML('beforeend', '<style id="css-invoices">' +
    '.iv-aging{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}' +
    '.iv-aging .iv-bk{border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;background:var(--surface);cursor:pointer}' +
    '.iv-aging .iv-bk:hover{border-color:var(--primary-100)}.iv-aging .iv-bk.on{border-color:var(--primary);box-shadow:0 0 0 3px var(--focus)}' +
    '.iv-aging .iv-bk .l{font-size:12px;color:var(--text-3);font-weight:600}.iv-aging .iv-bk .v{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;margin-top:2px}' +
    '.iv-aging .iv-bk .iv-bar{height:4px;border-radius:999px;margin-top:8px;background:var(--surface-3);overflow:hidden}.iv-aging .iv-bk .iv-bar>div{height:100%}' +
    '@media(max-width:760px){.iv-aging{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '.iv-match{border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;background:var(--surface-2);font-size:13px}' +
    '.iv-match .row{justify-content:space-between}.iv-match .row + .row{margin-top:4px}' +
    '.iv-overdue td:first-child{box-shadow:inset 3px 0 0 var(--danger)}' +
    '.iv-detail .doc .mt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '</style>');

  const poLabel = p => (p.poNumber ? 'PO ' + p.poNumber : 'Draft PO');
  const isOverdue = i => i.status !== 'Paid' && i.dueDate && i.dueDate < util.today();
  const shownStatus = i => (isOverdue(i) && i.status !== 'Disputed' ? 'Overdue' : i.status);
  const ageDays = i => util.daysBetween(i.date, util.today()) || 0;
  const BUCKETS = [
    { key: '0-30', label: '0–30 days', test: d => d <= 30, color: 'var(--success)' },
    { key: '31-60', label: '31–60 days', test: d => d > 30 && d <= 60, color: 'var(--warning)' },
    { key: '61-90', label: '61–90 days', test: d => d > 60 && d <= 90, color: '#f97316' },
    { key: '90+', label: 'Over 90 days', test: d => d > 90, color: 'var(--danger)' }
  ];
  const invoicedOn = (poId, exceptId) => util.sum(store.filter('invoices', i => i.poId === poId && i.id !== exceptId && i.status !== 'Disputed'), i => i.total);

  /* --------------------------------------------------------- invoice form */
  /**
   * New / edit invoice. preset: { poId, supplierId } ; existing invoice record to edit.
   */
  function invoiceForm(existing, preset, onDone) {
    preset = preset || {};
    const inv = existing || {};
    const rate = store.settings().gctRate;
    const pos = store.list('purchaseOrders').filter(p => p.status !== 'Cancelled' && p.status !== 'Draft').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const poKey = p => poLabel(p) + ' — ' + (p.supplierName || domain.supplierName(p.supplierId)) + ' — ' + util.money(p.total);
    const startPo = store.get('purchaseOrders', inv.poId || preset.poId);
    const sups = store.list('suppliers').sort((a, b) => a.name.localeCompare(b.name));
    const supId = inv.supplierId || (startPo && startPo.supplierId) || preset.supplierId || '';
    let picked = [], quotePicked = [];
    const gctOn = existing ? util.num(inv.gct) > 0 : true;
    const body = '<datalist id="dl-inv-pos">' + pos.slice(0, 800).map(p => '<option value="' + esc(poKey(p)) + '">').join('') + '</datalist>' +
      '<div class="form-grid">' +
      '<div class="field s12"><label>Purchase order</label><input name="poPick" list="dl-inv-pos" placeholder="Type a PO number or supplier name…" value="' + esc(startPo ? poKey(startPo) : '') + '" autocomplete="off"><div class="hint">Match the invoice to its PO so billing is checked against the order. Leave blank only for non-PO charges.</div></div>' +
      '<div class="field s12 match-box"></div>' +
      '<div class="field s6"><label>Supplier<span class="req">*</span></label><select name="supplierId">' + ui.options(sups.map(s => ({ value: s.id, label: s.name })), supId, 'Select supplier…') + '</select></div>' +
      '<div class="field s3"><label>Invoice number<span class="req">*</span></label><input name="invoiceNumber" value="' + esc(inv.invoiceNumber || '') + '"></div>' +
      '<div class="field s3"><label>Invoice date<span class="req">*</span></label><input type="date" name="date" value="' + esc(inv.date || util.today()) + '"></div>' +
      '<div class="field s3"><label>Amount before GCT<span class="req">*</span></label><div class="input-group"><span class="prefix">$</span><input type="number" step="0.01" min="0" name="amount" value="' + esc(inv.amount !== undefined ? inv.amount : '') + '"></div></div>' +
      '<div class="field s3"><label>GCT</label><div class="input-group"><span class="prefix">$</span><input type="number" step="0.01" min="0" name="gct" value="' + esc(inv.gct !== undefined ? inv.gct : '') + '"></div><label class="check small mt-1"><input type="checkbox" name="autoGct"' + (gctOn ? ' checked' : '') + '> Add GCT at ' + Math.round(rate * 100) + '%</label></div>' +
      '<div class="field s3"><label>Invoice total</label><div class="input-group"><span class="prefix">$</span><input name="totalShow" readonly></div></div>' +
      '<div class="field s3"><label>Due date</label><input type="date" name="dueDate" value="' + esc(inv.dueDate || util.addDays(inv.date || util.today(), 30)) + '"><div class="hint">Defaults to 30 days</div></div>' +
      '<div class="field s12"><label>Notes</label><input name="notes" value="' + esc(inv.notes || '') + '" placeholder="Partial billing, credit note reference…"></div>' +
      '<div class="field s6"><label>Invoice copy</label><button type="button" class="btn" data-pick="inv" style="width:100%">' + ui.icon('clip', 'sm') + 'Attach invoice (PDF / photo)</button><input type="file" hidden multiple data-file="inv"><div class="hint picked-inv"></div></div>' +
      '<div class="field s6"><label>Supplier’s quotation (optional)</label><button type="button" class="btn" data-pick="quote" style="width:100%">' + ui.icon('clip', 'sm') + 'Attach quote</button><input type="file" hidden multiple data-file="quote"><div class="hint picked-quote"></div></div>' +
      '</div>';
    let currentPo = startPo || null;
    ui.modal({
      title: existing ? 'Edit invoice ' + (inv.invoiceNumber || '') : 'Record supplier invoice', size: 'lg', body,
      onOpen: el => {
        const f = n => el.querySelector('[name=' + n + ']');
        const recalc = () => {
          const amt = util.num(f('amount').value);
          if (f('autoGct').checked) f('gct').value = amt ? util.round2(amt * rate).toFixed(2) : '';
          const total = util.round2(amt + util.num(f('gct').value));
          f('totalShow').value = total ? total.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
          const box = el.querySelector('.match-box');
          if (!currentPo) { box.innerHTML = ''; box.hidden = true; return; }
          box.hidden = false;
          const already = invoicedOn(currentPo.id, inv.id);
          const remaining = util.round2(util.num(currentPo.total) - already);
          const after = util.round2(remaining - total);
          box.innerHTML = '<div class="iv-match"><div class="row"><span class="muted">' + esc(poLabel(currentPo)) + ' · ' + esc(currentPo.supplierName || '') + '</span><a href="#/orders/' + currentPo.id + '" target="_blank">Open PO ' + ui.icon('external', 'sm') + '</a></div>' +
            '<div class="row"><span>PO total</span><span class="num">' + util.money(currentPo.total) + '</span></div><div class="row"><span>Already invoiced</span><span class="num">' + util.money(already) + '</span></div>' +
            '<div class="row"><span>This invoice</span><span class="num">' + util.money(total) + '</span></div><div class="row strong ' + (after < -0.01 ? 'text-danger' : '') + '"><span>' + (after < -0.01 ? 'Over-billed by' : 'Balance remaining on PO') + '</span><span class="num">' + util.money(Math.abs(after)) + '</span></div>' +
            (after < -0.01 ? '<div class="small text-danger mt-1">' + ui.icon('alert', 'sm') + ' This invoice takes billing above the PO value.</div>' : '') + '</div>';
        };
        const setPo = () => {
          const v = f('poPick').value.trim();
          const p = pos.find(x => poKey(x) === v) || pos.find(x => x.poNumber && (v === x.poNumber || v === 'PO ' + x.poNumber));
          currentPo = p || null;
          if (p) {
            if (p.supplierId) f('supplierId').value = p.supplierId;
            if (!existing && !f('amount').value) {
              const rem = util.round2(util.num(p.total) - invoicedOn(p.id));
              const gctShare = util.num(p.total) ? util.num(p.gct) / util.num(p.total) : 0;
              if (rem > 0) {
                f('autoGct').checked = gctShare > 0;
                f('amount').value = util.round2(gctShare > 0 ? rem / (1 + rate) : rem).toFixed(2);
              }
            }
          }
          recalc();
        };
        f('poPick').addEventListener('change', setPo);
        f('poPick').addEventListener('input', util.debounce(setPo, 300));
        ['amount', 'gct'].forEach(n => f(n).addEventListener('input', () => { if (n === 'gct') f('autoGct').checked = false; recalc(); }));
        f('autoGct').onchange = recalc;
        f('date').onchange = () => { if (!existing) f('dueDate').value = util.addDays(f('date').value, 30); };
        el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => el.querySelector('[data-file=' + b.dataset.pick + ']').click());
        el.querySelector('[data-file=inv]').onchange = e => { picked = Array.from(e.target.files); el.querySelector('.picked-inv').textContent = picked.map(x => x.name).join(', '); };
        el.querySelector('[data-file=quote]').onchange = e => { quotePicked = Array.from(e.target.files); el.querySelector('.picked-quote').textContent = quotePicked.map(x => x.name).join(', '); };
        if (startPo && !existing) setPo(); else recalc();
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: existing ? 'Save changes' : 'Record invoice', kind: 'primary', icon: 'check', onClick: async (close, el) => {
          const d = ui.formData(el);
          el.querySelectorAll('.field').forEach(x => x.classList.remove('invalid'));
          const bad = [];
          if (!d.supplierId) bad.push('supplierId');
          if (!d.invoiceNumber) bad.push('invoiceNumber');
          if (!d.date) bad.push('date');
          if (!(util.num(d.amount) > 0)) bad.push('amount');
          if (d.poPick && !currentPo) { el.querySelector('[name=poPick]').closest('.field').classList.add('invalid'); ui.toast('That purchase order was not found — pick one from the list or clear the field.', 'warning'); return false; }
          if (bad.length) { bad.forEach(n => el.querySelector('[name=' + n + ']').closest('.field').classList.add('invalid')); ui.toast('Fill in the supplier, invoice number, date and amount.', 'warning'); return false; }
          const amount = util.round2(util.num(d.amount)), gct = util.round2(util.num(d.gct)), total = util.round2(amount + gct);
          const dup = store.find('invoices', i => i.id !== inv.id && i.supplierId === d.supplierId && String(i.invoiceNumber).trim().toLowerCase() === d.invoiceNumber.toLowerCase());
          if (dup && !(await ui.confirm('Invoice <b>' + esc(d.invoiceNumber) + '</b> from this supplier is already recorded (' + util.money(dup.total) + ', ' + util.date(dup.date) + '). Record it again?', { ok: 'Record anyway' }))) return false;
          if (currentPo) {
            const over = util.round2(invoicedOn(currentPo.id, inv.id) + total - util.num(currentPo.total));
            if (over > 0.01 && !(await ui.confirm('This invoice exceeds the PO value by <b>' + util.money(over) + '</b>. Record it anyway? (Consider disputing the excess.)', { ok: 'Record anyway', danger: true }))) return false;
          }
          const rec = store.upsert('invoices', {
            id: inv.id, poId: currentPo ? currentPo.id : '', supplierId: d.supplierId, invoiceNumber: d.invoiceNumber, date: d.date, amount, gct, total,
            dueDate: d.dueDate || util.addDays(d.date, 30), status: inv.status || 'Pending', notes: d.notes
          });
          for (const file of picked) {
            const doc = await files.add(file, { kind: 'Invoice', supplierId: d.supplierId, ref: d.invoiceNumber, amount: total, date: d.date, links: { poId: rec.poId, invoiceId: rec.id } });
            if (!rec.docId) store.upsert('invoices', { id: rec.id, docId: doc.id }, { silent: true });
          }
          for (const file of quotePicked) await files.add(file, { kind: 'Quotation', supplierId: d.supplierId, date: d.date, links: { poId: rec.poId, invoiceId: rec.id } });
          if (rec.poId) domain.refreshOrderStatus(rec.poId);
          if (existing && existing.poId && existing.poId !== rec.poId) domain.refreshOrderStatus(existing.poId);
          Proc.audit(existing ? 'Update Invoice' : 'Record Invoice', 'Invoice ' + rec.invoiceNumber + ' · ' + domain.supplierName(rec.supplierId) + ' · ' + util.money(total) + (currentPo ? ' · ' + poLabel(currentPo) : ''), rec.id);
          ui.toast(existing ? 'Invoice updated' : 'Invoice ' + rec.invoiceNumber + ' recorded');
          if (onDone) setTimeout(() => onDone(rec), 30);
        }
      }]
    });
  }

  /* -------------------------------------------------------------- actions */
  function setStatus(inv, status, extra, msg) {
    store.upsert('invoices', Object.assign({ id: inv.id, status }, extra || {}));
    if (inv.poId) domain.refreshOrderStatus(inv.poId);
    Proc.audit(status === 'Paid' ? 'Process Payment' : 'Invoice ' + status, 'Invoice ' + inv.invoiceNumber + ' · ' + domain.supplierName(inv.supplierId) + ' · ' + util.money(inv.total) + (extra && extra.paymentRef ? ' · ref ' + extra.paymentRef : '') + (extra && extra.disputeReason ? ' · ' + extra.disputeReason : ''), inv.id);
    ui.toast(msg);
    router.refresh();
  }
  async function markPaid(inv) {
    const v = await ui.form('Mark invoice ' + inv.invoiceNumber + ' as paid', [
      { name: 'paidDate', label: 'Payment date', type: 'date', value: util.today(), required: true, span: 's6' },
      { name: 'amountPaid', label: 'Amount paid', type: 'number', step: '0.01', value: inv.total, span: 's6' },
      { name: 'paymentRef', label: 'Cheque / EFT / voucher reference', value: '', placeholder: 'e.g. CHQ 004512 or PV 2026-0918', required: true }
    ], { ok: 'Mark paid' });
    if (!v) return;
    setStatus(inv, 'Paid', { paidDate: v.paidDate, paymentRef: v.paymentRef, amountPaid: util.num(v.amountPaid) || inv.total }, 'Invoice ' + inv.invoiceNumber + ' marked paid');
  }
  async function dispute(inv) {
    const v = await ui.form('Dispute invoice ' + inv.invoiceNumber, [{ name: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'e.g. Billed for 120 units, only 100 received (GRN 0412)' }], { ok: 'Mark disputed' });
    if (!v) return;
    setStatus(inv, 'Disputed', { disputeReason: v.reason, disputeDate: util.today() }, 'Invoice marked as disputed');
  }
  async function certify(inv) {
    const po = store.get('purchaseOrders', inv.poId);
    const delivered = po && store.filter('deliveries', d => d.poId === po.id).length;
    if (po && !delivered && !(await ui.confirm('No delivery has been recorded for ' + esc(poLabel(po)) + '. Certify the invoice for payment anyway?', { ok: 'Certify anyway' }))) return;
    setStatus(inv, 'Certified', { certifiedBy: domain.officer().name, certifiedDate: util.today() }, 'Invoice certified for payment');
  }
  async function removeInvoice(inv) {
    const docs = files.forLink('invoiceId', inv.id);
    if (!(await ui.confirm('Delete invoice <b>' + esc(inv.invoiceNumber) + '</b>?' + (docs.length ? ' Its ' + docs.length + ' attached ' + util.plural(docs.length, 'file') + ' will stay in the supplier’s documents.' : ''), { danger: true, ok: 'Delete' }))) return;
    store.remove('invoices', inv.id);
    docs.forEach(d => { const links = Object.assign({}, d.links); delete links.invoiceId; store.upsert('documents', { id: d.id, links }, { silent: true }); });
    if (inv.poId) {
      const po = store.get('purchaseOrders', inv.poId);
      if (po && ['Invoiced', 'Paid'].indexOf(po.status) >= 0 && !store.filter('invoices', i => i.poId === po.id).length) store.upsert('purchaseOrders', { id: po.id, status: store.filter('deliveries', d => d.poId === po.id).length ? 'Delivered' : 'Issued' });
      domain.refreshOrderStatus(inv.poId);
    }
    Proc.audit('Delete Invoice', 'Invoice ' + inv.invoiceNumber + ' · ' + domain.supplierName(inv.supplierId), inv.id);
    ui.toast('Invoice deleted');
    router.go('invoices');
  }
  function actionMenu(inv) {
    const items = [];
    if (inv.status === 'Pending' || inv.status === 'Disputed') items.push({ label: 'Certify for payment', icon: 'shield', onClick: () => certify(inv) });
    if (inv.status !== 'Paid') items.push({ label: 'Mark paid…', icon: 'check', onClick: () => markPaid(inv) });
    if (inv.status !== 'Disputed' && inv.status !== 'Paid') items.push({ label: 'Dispute…', icon: 'alert', onClick: () => dispute(inv) });
    if (inv.status === 'Paid' || inv.status === 'Disputed' || inv.status === 'Certified') items.push({ label: 'Reopen as pending', icon: 'refresh', onClick: () => setStatus(inv, 'Pending', { paidDate: '', paymentRef: '' }, 'Invoice reopened') });
    items.push({ label: 'Edit invoice', icon: 'edit', onClick: () => invoiceForm(inv, null, () => router.refresh()) });
    items.push({ label: 'Attach file', icon: 'clip', onClick: async () => { const r = await ui.uploadDialog({ kind: 'Invoice', supplierId: inv.supplierId, lockSupplier: true, ref: inv.invoiceNumber, amount: inv.total, links: { poId: inv.poId, invoiceId: inv.id }, title: 'Attach to invoice ' + inv.invoiceNumber }); if (r) router.refresh(); } });
    items.push({ sep: true }, { label: 'Delete invoice', icon: 'trash', danger: true, onClick: () => removeInvoice(inv) });
    return items;
  }

  /* ------------------------------------------------------------------ list */
  function renderList(el) {
    const q = router.parse().query;
    const invs = store.list('invoices').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const today = util.today();
    const unpaid = invs.filter(i => i.status !== 'Paid');
    const overdue = unpaid.filter(isOverdue);
    const thisMonth = today.slice(0, 7);
    const paidMonth = invs.filter(i => i.status === 'Paid' && util.monthKey(i.paidDate) === thisMonth);
    const paidWithDates = invs.filter(i => i.status === 'Paid' && i.paidDate && i.date);
    const avgDays = paidWithDates.length ? Math.round(util.sum(paidWithDates, i => util.daysBetween(i.date, i.paidDate)) / paidWithDates.length) : null;
    const bucketTotals = BUCKETS.map(b => { const l = unpaid.filter(i => b.test(ageDays(i))); return { b, n: l.length, v: util.sum(l, i => i.total) }; });
    const maxB = Math.max.apply(null, bucketTotals.map(x => x.v).concat([1]));
    let seg = 'open', bucket = '';

    el.innerHTML = ui.pageHead({
      title: 'Invoices & Payments', sub: 'Match supplier invoices to purchase orders, certify them and record payment.',
      actions: '<button class="btn" data-act="export">' + ui.icon('download', 'sm') + 'Export</button><button class="btn primary" data-act="new">' + ui.icon('plus', 'sm') + 'Record invoice</button>'
    }) +
      '<div class="grid c4 mb-3">' +
      ui.kpi({ label: 'Outstanding', icon: 'receipt', tone: unpaid.length ? 'warn' : 'ok', value: util.moneyShort(util.sum(unpaid, i => i.total)), title: util.money(util.sum(unpaid, i => i.total)), meta: unpaid.length + ' unpaid ' + util.plural(unpaid.length, 'invoice') }) +
      ui.kpi({ label: 'Overdue', icon: 'alert', tone: overdue.length ? 'bad' : 'ok', value: util.moneyShort(util.sum(overdue, i => i.total)), title: util.money(util.sum(overdue, i => i.total)), meta: overdue.length + ' past due date' }) +
      ui.kpi({ label: 'Paid this month', icon: 'check', tone: 'ok', value: util.moneyShort(util.sum(paidMonth, i => util.num(i.amountPaid) || i.total)), title: util.money(util.sum(paidMonth, i => util.num(i.amountPaid) || i.total)), meta: paidMonth.length + ' ' + util.plural(paidMonth.length, 'payment') }) +
      ui.kpi({ label: 'Average days to pay', icon: 'clock', tone: 'pur', value: avgDays === null ? '—' : avgDays + ' days', meta: 'Invoice date to payment' }) +
      '</div>' +
      (unpaid.length ? '<div class="card mb-3"><div class="card-h"><h3>Unpaid invoices by age</h3><span class="sub">Click a bucket to filter</span></div><div class="card-b"><div class="iv-aging">' +
        bucketTotals.map(x => '<div class="iv-bk" data-b="' + x.b.key + '"><div class="l">' + x.b.label + '</div><div class="v">' + util.money(x.v) + '</div><div class="small muted">' + x.n + ' ' + util.plural(x.n, 'invoice') + '</div><div class="iv-bar"><div style="width:' + (x.v / maxB * 100) + '%;background:' + x.b.color + '"></div></div></div>').join('') +
        '</div></div></div>' : '') +
      '<div class="card"><div class="toolbar" style="border-bottom:0;padding-bottom:0"><div class="seg" data-seg>' +
      [['open', 'Unpaid', unpaid.length], ['Pending', 'Pending', invs.filter(i => i.status === 'Pending').length], ['Certified', 'Certified', invs.filter(i => i.status === 'Certified').length], ['overdue', 'Overdue', overdue.length], ['Disputed', 'Disputed', invs.filter(i => i.status === 'Disputed').length], ['Paid', 'Paid', invs.length - unpaid.length], ['all', 'All', invs.length]]
        .map(s => '<button data-s="' + s[0] + '" class="' + (s[0] === seg ? 'on' : '') + '">' + s[1] + '<span class="n">' + s[2] + '</span></button>').join('') +
      '</div></div><div class="tbl"></div></div>';

    el.querySelector('[data-act=new]').onclick = () => invoiceForm(null, {}, rec => router.go('invoices/' + rec.id));
    el.querySelector('[data-act=export]').onclick = () => exportInvoices(invs);
    const holder = el.querySelector('.tbl');
    const rowsFor = () => invs.filter(i => {
      if (seg === 'open' && i.status === 'Paid') return false;
      if (seg === 'overdue' && !isOverdue(i)) return false;
      if (['Pending', 'Certified', 'Disputed', 'Paid'].indexOf(seg) >= 0 && i.status !== seg) return false;
      if (bucket) { const b = BUCKETS.find(x => x.key === bucket); if (i.status === 'Paid' || !b.test(ageDays(i))) return false; }
      return true;
    });
    const t = ui.table(holder, {
      rows: rowsFor(), pageSize: 25, placeholder: 'Search invoice no., PO, supplier…', initialSort: { key: 'date', dir: -1 },
      search: i => { const p = store.get('purchaseOrders', i.poId) || {}; return [i.invoiceNumber, p.poNumber, domain.supplierName(i.supplierId), i.notes, i.paymentRef].join(' '); },
      rowCls: i => (isOverdue(i) ? 'iv-overdue' : ''),
      empty: ui.empty('receipt', invs.length ? 'No invoices in this view' : 'No invoices yet', invs.length ? 'Try another tab.' : 'Record supplier invoices against their purchase orders to track what is owed and paid.'),
      onRow: i => router.go('invoices/' + i.id),
      columns: [
        { key: 'invoiceNumber', label: 'Invoice', render: i => '<a class="strong nowrap" href="#/invoices/' + i.id + '">' + esc(i.invoiceNumber) + '</a>', sort: i => i.invoiceNumber },
        { key: 'supplier', label: 'Supplier', sort: i => domain.supplierName(i.supplierId), render: i => '<a href="#/suppliers/' + i.supplierId + '/invoices">' + esc(domain.supplierName(i.supplierId, '—')) + '</a>' },
        { key: 'po', label: 'PO', sort: i => (store.get('purchaseOrders', i.poId) || {}).poNumber || '', render: i => { const p = store.get('purchaseOrders', i.poId); return p ? '<a href="#/orders/' + p.id + '" class="nowrap">' + esc(poLabel(p)) + '</a>' : '<span class="muted">No PO</span>'; } },
        { key: 'date', label: 'Date', render: i => '<span class="nowrap">' + util.date(i.date) + '</span>' },
        { key: 'dueDate', label: 'Due', render: i => i.dueDate ? '<span class="nowrap ' + (isOverdue(i) ? 'text-danger strong' : '') + '">' + util.date(i.dueDate) + '</span>' + (isOverdue(i) ? '<div class="t-sub text-danger">' + util.daysBetween(i.dueDate, today) + ' days late</div>' : '') : '—' },
        { key: 'age', label: 'Age', cls: 'num', sort: i => (i.status === 'Paid' ? -1 : ageDays(i)), render: i => i.status === 'Paid' ? '<span class="muted small">Paid ' + util.date(i.paidDate) + '</span>' : ageDays(i) + 'd' },
        { key: 'total', label: 'Amount', cls: 'num', render: i => '<span class="strong">' + util.money(i.total) + '</span>' },
        { key: 'status', label: 'Status', sort: i => shownStatus(i), render: i => ui.badge(shownStatus(i)) },
        { key: 'act', label: '', sort: false, cls: 'actions', render: i => (i.status !== 'Paid' ? '<button class="btn xs" data-pay="' + i.id + '">Mark paid</button> ' : '') + '<button class="btn xs ghost icon" data-more="' + i.id + '" title="More">' + ui.icon('more', 'sm') + '</button>' }
      ],
      footer: list => '<td colspan="6">' + list.length + ' ' + util.plural(list.length, 'invoice') + '</td><td class="num">' + util.money(util.sum(list, i => i.total)) + '</td><td colspan="2"></td>',
      bind: tb => {
        tb.querySelectorAll('[data-pay]').forEach(b => b.onclick = e => { e.stopPropagation(); markPaid(store.get('invoices', b.dataset.pay)); });
        tb.querySelectorAll('[data-more]').forEach(b => b.onclick = e => { e.stopPropagation(); ui.menu(b, actionMenu(store.get('invoices', b.dataset.more))); });
      }
    });
    el.querySelectorAll('[data-seg] button').forEach(b => b.onclick = () => { seg = b.dataset.s; el.querySelectorAll('[data-seg] button').forEach(x => x.classList.toggle('on', x === b)); t.refresh(rowsFor()); });
    el.querySelectorAll('.iv-aging .iv-bk').forEach(b => b.onclick = () => {
      bucket = bucket === b.dataset.b ? '' : b.dataset.b;
      el.querySelectorAll('.iv-aging .iv-bk').forEach(x => x.classList.toggle('on', x.dataset.b === bucket));
      if (bucket && seg === 'Paid') { seg = 'open'; el.querySelectorAll('[data-seg] button').forEach(x => x.classList.toggle('on', x.dataset.s === 'open')); }
      t.refresh(rowsFor());
    });

    if (q.new) {
      history.replaceState(null, '', '#/invoices');
      setTimeout(() => invoiceForm(null, { poId: q.po, supplierId: q.supplier }, rec => router.go('invoices/' + rec.id)), 50);
    }
  }

  function exportInvoices(invs) {
    if (!window.XLSX) { ui.toast('Excel library not loaded.', 'error'); return; }
    const rows = invs.map(i => { const p = store.get('purchaseOrders', i.poId) || {}; return {
      'Invoice #': i.invoiceNumber, 'Invoice Date': i.date, 'Supplier': domain.supplierName(i.supplierId), 'P.O. #': p.poNumber || '', 'P.O. $': p.total || '', 'Amount': i.amount, 'GCT': i.gct, 'Invoice Total': i.total,
      'Due Date': i.dueDate, 'Status': shownStatus(i), 'Days Outstanding': i.status === 'Paid' ? '' : ageDays(i), 'Paid Date': i.paidDate || '', 'Payment Ref': i.paymentRef || '', 'Notes': i.notes || '' }; });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Invoices');
    XLSX.writeFile(wb, 'Invoices ' + util.today() + '.xlsx');
  }

  /* ---------------------------------------------------------------- detail */
  function renderDetail(el, id) {
    const inv = store.get('invoices', id);
    if (!inv) { el.innerHTML = ui.empty('receipt', 'Invoice not found', 'It may have been deleted.', '<a class="btn" href="#/invoices">Back to invoices</a>'); return; }
    const po = store.get('purchaseOrders', inv.poId);
    const sup = store.get('suppliers', inv.supplierId);
    ui.setCrumbs(['Invoices & Payments', 'Invoice ' + inv.invoiceNumber]);
    const docs = files.forLink('invoiceId', inv.id);
    const poDocs = po ? files.forLink('poId', po.id).filter(d => !docs.some(x => x.id === d.id)) : [];
    const others = po ? store.filter('invoices', i => i.poId === po.id && i.id !== inv.id) : [];
    const dels = po ? store.filter('deliveries', d => d.poId === po.id) : [];
    const billed = po ? invoicedOn(po.id) : 0;
    const status = shownStatus(inv);
    const steps = ['Received', 'Certified', 'Paid'];
    const cur = inv.status === 'Paid' ? 3 : inv.status === 'Certified' ? 2 : 1;
    const primary = inv.status === 'Pending' ? '<button class="btn primary" data-a="certify">' + ui.icon('shield', 'sm') + 'Certify for payment</button>' :
      inv.status === 'Certified' ? '<button class="btn primary" data-a="pay">' + ui.icon('check', 'sm') + 'Mark paid</button>' :
      inv.status === 'Disputed' ? '<button class="btn primary" data-a="certify">' + ui.icon('shield', 'sm') + 'Resolve & certify</button>' : '';

    el.innerHTML = ui.pageHead({
      title: 'Invoice ' + inv.invoiceNumber, badge: ui.badge(status), back: { label: 'Invoices & Payments', href: '#/invoices' },
      sub: esc(domain.supplierName(inv.supplierId, '—')) + ' · ' + util.date(inv.date) + (po ? ' · ' + esc(poLabel(po)) : ''),
      actions: primary + '<button class="btn" data-a="edit">' + ui.icon('edit', 'sm') + 'Edit</button><button class="btn icon" data-a="more" title="More">' + ui.icon('more') + '</button>'
    }) +
      '<div class="card mb-3"><div class="card-b">' + (inv.status === 'Disputed' ? '<div class="alert danger">' + ui.icon('alert') + '<div><div class="t">Disputed ' + (inv.disputeDate ? util.date(inv.disputeDate) : '') + '</div>' + esc(inv.disputeReason || '') + '</div></div>' : ui.stepper(steps, cur)) + '</div></div>' +
      '<div class="grid side iv-detail"><div class="stack">' +
      '<div class="card"><div class="card-h"><h3>Invoice</h3></div><div class="card-b"><div class="grid c3 mb-3">' +
      '<div><div class="small muted">Amount before GCT</div><div class="strong">' + util.money(inv.amount) + '</div></div><div><div class="small muted">GCT</div><div class="strong">' + util.money(inv.gct) + '</div></div><div><div class="small muted">Total</div><div class="money-big">' + util.money(inv.total) + '</div></div></div>' +
      '<dl class="kv"><dt>Invoice number</dt><dd>' + esc(inv.invoiceNumber) + '</dd><dt>Invoice date</dt><dd>' + util.date(inv.date) + '</dd><dt>Due date</dt><dd class="' + (isOverdue(inv) ? 'text-danger' : '') + '">' + util.date(inv.dueDate) + (isOverdue(inv) ? ' · ' + util.daysBetween(inv.dueDate, util.today()) + ' days overdue' : '') + '</dd>' +
      (inv.certifiedBy ? '<dt>Certified</dt><dd>' + esc(inv.certifiedBy) + ' · ' + util.date(inv.certifiedDate) + '</dd>' : '') +
      (inv.status === 'Paid' ? '<dt>Paid</dt><dd>' + util.date(inv.paidDate) + (inv.paymentRef ? ' · ' + esc(inv.paymentRef) : '') + (inv.amountPaid && Math.abs(inv.amountPaid - inv.total) > 0.01 ? ' · ' + util.money(inv.amountPaid) : '') + '</dd>' : '') +
      (inv.notes ? '<dt>Notes</dt><dd>' + esc(inv.notes) + '</dd>' : '') + '<dt>Recorded</dt><dd>' + util.dateTime(inv.createdAt) + (inv.createdBy ? ' by ' + esc(inv.createdBy) : '') + '</dd></dl></div></div>' +
      (po ? '<div class="card"><div class="card-h"><h3>Purchase order ' + esc(po.poNumber || '') + '</h3><a class="btn sm" href="#/orders/' + po.id + '">Open PO</a></div><div class="card-b flush"><div class="table-wrap"><table class="table compact"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Total</th></tr></thead><tbody>' +
        ((po.items || []).length ? po.items.map(i => '<tr><td style="white-space:normal">' + esc(i.description) + '</td><td class="num">' + util.int(i.qty) + ' ' + esc(i.unit || '') + '</td><td class="num">' + util.money(i.unitPrice) + '</td><td class="num">' + util.money(i.total) + '</td></tr>').join('') : '<tr><td colspan="4">' + esc(po.description || '') + '</td></tr>') +
        '</tbody><tfoot><tr><td colspan="3">PO total</td><td class="num">' + util.money(po.total) + '</td></tr></tfoot></table></div></div>' +
        '<div class="card-f" style="justify-content:space-between"><span class="small">Invoiced on this PO: <b>' + util.money(billed) + '</b> of ' + util.money(po.total) + (billed > po.total + 0.01 ? ' <span class="text-danger strong">· over-billed by ' + util.money(billed - po.total) + '</span>' : ' · balance ' + util.money(po.total - billed)) + '</span><span class="small">' + (dels.length ? ui.icon('package', 'sm') + ' ' + dels.length + ' ' + util.plural(dels.length, 'delivery', 'deliveries') + ' recorded' : '<span class="text-warning">No delivery recorded</span>') + '</span></div></div>' : '<div class="alert warning">' + ui.icon('info') + '<div>This invoice is not linked to a purchase order.</div></div>') +
      '</div><div class="stack">' +
      '<div class="card"><div class="card-h"><h3>Supplier</h3></div><div class="card-b">' + (sup ? '<div class="row"><span class="avatar">' + esc(util.initials(sup.name)) + '</span><div><a class="strong" href="#/suppliers/' + sup.id + '">' + esc(sup.name) + '</a><div class="small muted">' + esc([sup.trn ? 'TRN ' + sup.trn : '', sup.phone].filter(Boolean).join(' · ')) + '</div></div></div>' +
        ((sup.bankName || sup.bankAccount) ? '<dl class="kv tight mt-2 small"><dt>Bank</dt><dd>' + esc([sup.bankName, sup.bankBranch].filter(Boolean).join(', ')) + '</dd><dt>Account</dt><dd>' + esc([sup.bankAccount, sup.bankAccountType].filter(Boolean).join(' · ')) + '</dd></dl>' : '') : '<span class="muted">Supplier not found</span>') + '</div></div>' +
      '<div class="card"><div class="card-h"><h3>Documents</h3><button class="btn sm" data-a="attach">' + ui.icon('upload', 'sm') + 'Attach</button></div><div class="card-b">' +
      (docs.length ? '<div class="doc-list">' + docs.map(d => ui.docRow(d)).join('') + '</div>' : '<div class="muted small">No invoice copy attached yet.</div>') +
      (poDocs.length ? '<div class="section-title mt-3">From the purchase order</div><div class="doc-list">' + poDocs.map(d => ui.docRow(d, { noDelete: true })).join('') + '</div>' : '') + '</div></div>' +
      (others.length ? '<div class="card"><div class="card-h"><h3>Other invoices on this PO</h3></div><div class="card-b"><ul class="list-plain">' + others.map(o => '<li class="row between"><a href="#/invoices/' + o.id + '">' + esc(o.invoiceNumber) + '</a><span>' + util.money(o.total) + ' ' + ui.badge(shownStatus(o)) + '</span></li>').join('') + '</ul></div></div>' : '') +
      '</div></div>';

    ui.bindDocs(el, () => router.refresh());
    const on = (a, fn) => { const b = el.querySelector('[data-a=' + a + ']'); if (b) b.onclick = fn; };
    on('certify', () => certify(inv));
    on('pay', () => markPaid(inv));
    on('edit', () => invoiceForm(inv, null, () => router.refresh()));
    on('more', e => ui.menu(e.currentTarget, actionMenu(inv)));
    on('attach', async () => { const r = await ui.uploadDialog({ kind: 'Invoice', supplierId: inv.supplierId, lockSupplier: true, ref: inv.invoiceNumber, amount: inv.total, links: { poId: inv.poId, invoiceId: inv.id }, title: 'Attach to invoice ' + inv.invoiceNumber }); if (r) router.refresh(); });
  }

  Proc.page({
    id: 'invoices', title: 'Invoices & Payments', icon: 'receipt', section: 'Workflow', order: 60,
    count: () => store.filter('invoices', isOverdue).length, countAlert: true,
    render(el, params) { return params[0] ? renderDetail(el, params[0]) : renderList(el); }
  });
  Proc.quickCreate.push({ label: 'Supplier invoice', icon: 'receipt', order: 55, onClick: () => invoiceForm(null, {}, rec => router.go('invoices/' + rec.id)) });
  Proc.invoices = { form: invoiceForm };
})();
