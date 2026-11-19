/* General Stores — low-stock alerts and reorder levels.
   · Whenever stock changes, every item is checked: when an item falls to or below its reorder level
     (or runs out) the Stores officer gets a notification (bell), a message on screen and — when turned
     on — a desktop alert. It is said once; the item is "re-armed" when stock goes back above the level.
   · #/levels  Set reorder levels for many items at once, and choose who is alerted. */
(function () {
  'use strict';
  const { util, ui, store, domain, router } = Proc;
  const esc = util.esc;
  const C = Proc.storesC;
  const RANK = { '': 0, low: 1, out: 2 };
  const DESKTOP_KEY = 'storesDesktopAlerts';

  /** '' (fine), 'low' (at or below the reorder level) or 'out' (none left). */
  function alertState(i) {
    const on = util.num(i.onHand), ro = util.num(i.reorderLevel);
    if (ro > 0 && on <= 0) return 'out';
    if (ro > 0 && on <= ro) return 'low';
    // No reorder level yet: still say when an item that was being used has run out.
    if (on <= 0 && (i.lastIssued || i.lastReceived)) return 'out';
    return '';
  }
  const unitOf = i => (/^gal/i.test(i.unit || '') ? 'gal' : i.unit || '');
  const desktopOn = () => { try { return localStorage.getItem(DESKTOP_KEY) === '1' && 'Notification' in window && Notification.permission === 'granted'; } catch (e) { return false; } };

  let running = false;
  function check(o) {
    o = o || {};
    if (running) return [];
    running = true;
    const fresh = [];
    try {
      store.list('stockItems').forEach(i => {
        if (i.status === 'Inactive') return;
        const now = alertState(i), prev = i.alertState || '';
        if (now === prev) return;
        if (RANK[now] > RANK[prev]) fresh.push({ item: i, state: now });
        store.upsert('stockItems', { id: i.id, alertState: now, alertAt: now ? Date.now() : null }, { silent: true });
      });
      if (!fresh.length) return fresh;
      const S = C.S();
      const to = ['stores'].concat(S.alertProcurement ? ['procurement'] : []);
      const line = f => f.item.name + ' — ' + util.round2(util.num(f.item.onHand)) + ' ' + unitOf(f.item) + ' left' + (util.num(f.item.reorderLevel) ? ' (reorder at ' + util.round2(util.num(f.item.reorderLevel)) + ')' : '');
      if (fresh.length <= 5) {
        fresh.forEach(f => Proc.notify({ to, type: 'low-stock', itemId: f.item.id, title: (f.state === 'out' ? 'Out of stock: ' : 'Low stock: ') + f.item.name,
          body: util.round2(util.num(f.item.onHand)) + ' ' + unitOf(f.item) + ' left' + (util.num(f.item.reorderLevel) ? ' — reorder level is ' + util.round2(util.num(f.item.reorderLevel)) + ' ' + unitOf(f.item) : '') + '. Request a purchase from Procurement.',
          link: { app: 'stores', route: '#/reorder' } }));
      } else {
        const out = fresh.filter(f => f.state === 'out').length;
        Proc.notify({ to, type: 'low-stock', title: fresh.length + ' items low on stock' + (out ? ' (' + out + ' out)' : ''), body: fresh.slice(0, 6).map(line).join('; ') + (fresh.length > 6 ? '; …' : ''), link: { app: 'stores', route: '#/reorder' } });
      }
      try { Proc.audit('Low-stock alert', fresh.map(line).join('; ').slice(0, 900)); } catch (e) { /* audit not ready */ }
      if (!o.quiet) ui.toast((fresh.length === 1 ? (fresh[0].state === 'out' ? 'Out of stock: ' : 'Low stock: ') + line(fresh[0]) : fresh.length + ' items are now at or below their reorder level') + '. See Reorder.', 'warning', 9000);
      if (desktopOn()) {
        try {
          const n = new Notification(fresh.length === 1 ? (fresh[0].state === 'out' ? 'Out of stock: ' : 'Low stock: ') + fresh[0].item.name : fresh.length + ' items low on stock', { body: fresh.slice(0, 4).map(line).join('\n'), tag: 'stores-low-stock' });
          n.onclick = () => { window.focus(); location.hash = '#/reorder'; n.close(); };
        } catch (e) { /* desktop alerts unavailable */ }
      }
    } finally { running = false; }
    return fresh;
  }
  C.checkLowStock = check;
  C.alertState = alertState;

  // Check whenever stock records change (a receipt, issue, count, edit, or another computer's changes arriving).
  const later = util.debounce(() => { if (Proc.auth && Proc.auth.user) check(); }, 900);
  store.on('change', e => {
    const colls = e && e.batch ? e.batch.map(x => x.coll) : [e && e.coll];
    if (colls.some(c => c === 'stockItems' || c === 'stockMoves' || c === '*')) later();
  });
  setTimeout(() => { if (Proc.auth && Proc.auth.user) check({ quiet: false }); }, 2500);

  /* ================================================================ REORDER LEVELS PAGE */
  const st = { cat: '', q: '', only: '' };
  function render(el) {
    const q = router.parse().query; if (q.cat !== undefined && !st.touched) st.cat = q.cat;
    const all = C.items();
    const cats = Array.from(new Set(all.map(i => i.category).filter(Boolean))).sort();
    const S = C.S();
    const supported = 'Notification' in window;
    const perm = supported ? Notification.permission : 'unsupported';
    const desk = desktopOn();
    el.innerHTML = ui.pageHead({ back: { label: 'Reorder', href: '#/reorder' }, title: 'Reorder levels & alerts', sub: 'When an item reaches its reorder level the Stores officer is notified straight away. Set the levels here — for a whole category at once.' }) +
      '<div class="card mb-3"><div class="card-h"><div><h3>Who is alerted</h3><div class="sub">Low-stock alerts appear under the bell, as a message on screen and in the Audit Log</div></div></div><div class="card-b"><div class="row" style="gap:22px;flex-wrap:wrap">' +
        '<label class="check"><input type="checkbox" checked disabled> Stores officer (always)</label>' +
        '<label class="check"><input type="checkbox" id="alProc"' + (S.alertProcurement ? ' checked' : '') + '> Also notify Procurement</label>' +
        '<span class="row" style="gap:10px">' + (desk ? ui.badge('Desktop alerts on', 'success') + '<button class="btn sm" id="alDeskOff">Turn off</button>' : '<button class="btn sm" id="alDesk"' + (supported && perm !== 'denied' ? '' : ' disabled') + '>' + ui.icon('bell', 'sm') + 'Turn on desktop alerts</button>' + (perm === 'denied' ? '<span class="small muted">Blocked in this browser’s settings</span>' : !supported ? '<span class="small muted">Not available in this browser</span>' : '')) + '</span>' +
        '<button class="btn sm" id="alNow">' + ui.icon('refresh', 'sm') + 'Check stock now</button>' +
      '</div></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Reorder levels</h3><div class="sub" id="lvSum"></div></div><div class="row"><button class="btn sm" id="lvFill">Fill blanks…</button><button class="btn primary" id="lvSave">' + ui.icon('check', 'sm') + 'Save levels</button></div></div>' +
      '<div class="card-b"><div class="row" style="gap:10px;flex-wrap:wrap"><select class="input" id="lvCat" style="width:auto"><option value="">All categories</option>' + cats.map(c => '<option' + (c === st.cat ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>' +
        '<input class="input" id="lvQ" type="search" placeholder="Search item or code…" value="' + esc(st.q) + '" style="max-width:300px">' +
        '<select class="input" id="lvOnly" style="width:auto"><option value="">Every item</option><option value="none"' + (st.only === 'none' ? ' selected' : '') + '>No reorder level yet</option><option value="low"' + (st.only === 'low' ? ' selected' : '') + '>At or below level</option></select></div></div>' +
      '<div class="table-wrap"><table class="table compact"><thead><tr><th>Item</th><th>Category</th><th class="num">In store</th><th class="num" style="width:130px">Reorder level</th><th class="num" style="width:130px">Order qty</th><th class="num" style="width:130px">Max level</th><th>Status</th></tr></thead><tbody id="lvRows"></tbody></table></div></div>';
    const edits = new Map();
    const shown = () => all.filter(i => (!st.cat || i.category === st.cat) && (!st.q || (i.name + ' ' + i.code + ' ' + (i.aliases || []).join(' ')).toLowerCase().indexOf(st.q.toLowerCase()) >= 0) &&
      (!st.only || (st.only === 'none' ? !util.num(i.reorderLevel) : alertState(i) !== ''))).sort((a, b) => a.name.localeCompare(b.name));
    const val = (i, k) => (edits.get(i.id) || {})[k] !== undefined ? edits.get(i.id)[k] : (util.num(i[k]) || '');
    const draw = () => {
      const list = shown(); const cap = list.slice(0, 400);
      el.querySelector('#lvRows').innerHTML = cap.length ? cap.map(i => { const s = alertState(i);
        return '<tr data-id="' + i.id + '"><td><div class="t-title">' + esc(i.name) + '</div><div class="t-sub">' + esc(i.code) + '</div></td><td class="small">' + esc(i.category || '') + '</td><td class="num">' + util.round2(util.num(i.onHand)) + ' ' + esc(unitOf(i)) + '</td>' +
          ['reorderLevel', 'reorderQty', 'maxLevel'].map(k => '<td class="num"><input class="input sm num" type="number" min="0" step="any" data-k="' + k + '" value="' + esc(val(i, k)) + '" style="width:100px"></td>').join('') +
          '<td>' + (s === 'out' ? ui.badge('Out', 'danger') : s === 'low' ? ui.badge('Reorder', 'warning') : util.num(i.reorderLevel) ? ui.badge('OK', 'success') : '<span class="muted small">No level</span>') + '</td></tr>'; }).join('')
        : '<tr><td colspan="7" style="padding:0">' + ui.empty('box', 'No items match') + '</td></tr>';
      el.querySelector('#lvSum').textContent = list.length + ' ' + util.plural(list.length, 'item') + (list.length > 400 ? ' (first 400 shown — choose a category)' : '') + ' · ' + all.filter(i => util.num(i.reorderLevel) > 0).length + ' of ' + all.length + ' items have a reorder level' + (edits.size ? ' · ' + edits.size + ' unsaved' : '');
      el.querySelectorAll('#lvRows [data-k]').forEach(inp => inp.oninput = () => { const id = inp.closest('tr').dataset.id; const e = edits.get(id) || {}; e[inp.dataset.k] = inp.value; edits.set(id, e); el.querySelector('#lvSum').textContent = el.querySelector('#lvSum').textContent.replace(/ · \d+ unsaved$/, '') + ' · ' + edits.size + ' unsaved'; });
    };
    el.querySelector('#lvCat').onchange = e => { st.cat = e.target.value; st.touched = true; draw(); };
    el.querySelector('#lvQ').oninput = util.debounce(e => { st.q = e.target.value; draw(); }, 200);
    el.querySelector('#lvOnly').onchange = e => { st.only = e.target.value; draw(); };
    el.querySelector('#lvFill').onclick = async () => {
      const v = await ui.form('Fill blank reorder levels', [{ name: 'level', label: 'Reorder level for every item shown without one', type: 'number', required: true }, { name: 'qty', label: 'Order quantity (optional)', type: 'number' }], { ok: 'Fill' });
      if (!v) return; let n = 0;
      shown().slice(0, 400).forEach(i => { if (util.num(val(i, 'reorderLevel'))) return; const e = edits.get(i.id) || {}; e.reorderLevel = v.level; if (v.qty && !util.num(val(i, 'reorderQty'))) e.reorderQty = v.qty; edits.set(i.id, e); n++; });
      draw(); ui.toast(n + ' ' + util.plural(n, 'item') + ' filled — press Save levels.');
    };
    el.querySelector('#lvSave').onclick = () => {
      if (!edits.size) return ui.toast('Nothing changed.', 'info');
      let n = 0;
      edits.forEach((e, id) => { const p = { id }; Object.keys(e).forEach(k => { p[k] = util.num(e[k]); }); store.upsert('stockItems', p, { silent: true }); n++; });
      edits.clear(); store.save();
      Proc.audit('Reorder levels', n + ' ' + util.plural(n, 'item') + ' updated');
      ui.toast('Reorder levels saved for ' + n + ' ' + util.plural(n, 'item') + '.');
      check(); draw();
    };
    el.querySelector('#alProc').onchange = e => { store.saveSettings({ stores: Object.assign({}, C.S(), { alertProcurement: e.target.checked }) }); ui.toast(e.target.checked ? 'Procurement will also be notified.' : 'Only Stores will be notified.'); };
    const on = el.querySelector('#alDesk');
    if (on) on.onclick = async () => {
      try { const p = await Notification.requestPermission(); if (p === 'granted') { localStorage.setItem(DESKTOP_KEY, '1'); new Notification('Desktop alerts are on', { body: 'You will be told here when stock reaches its reorder level.' }); } else ui.toast('Desktop alerts were not allowed.', 'warning'); } catch (e) { ui.toast(e.message, 'error'); }
      render(el);
    };
    const off = el.querySelector('#alDeskOff'); if (off) off.onclick = () => { try { localStorage.removeItem(DESKTOP_KEY); } catch (e) { /* ignore */ } render(el); };
    el.querySelector('#alNow').onclick = () => { const f = check(); if (!f.length) { const lowNow = all.filter(i => alertState(i)).length; ui.toast(lowNow ? lowNow + ' ' + util.plural(lowNow, 'item is', 'items are') + ' already flagged — see Reorder.' : 'Nothing is at its reorder level.', 'info'); } };
    draw();
  }
  Proc.page({ id: 'levels', title: 'Reorder levels & alerts', icon: 'bell', hidden: true, render });
})();
