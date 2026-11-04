/*
 * Fixed Asset Register — data safety.
 *  - A copy of all data is kept on this computer once a day (last 14 days).
 *  - After each upload, a dated copy goes to Google Drive → "Asset Register Backups" (last 60 days).
 *  - Only one tab can edit at a time; an older tab pauses so tabs never save over each other.
 *  - The browser is asked to keep this site's storage (not clear it to free space).
 *  - Settings → Backups: download a copy, add back missing assets, bring back deleted ones.
 * Uses the register's own globals (buildBackupPayload, _openIDB, IDB_STORE, loadAssetsFromStorage …).
 */
(function () {
  'use strict';
  var LOCAL_KEEP = 14, DRIVE_KEEP = 60, DRIVE_FOLDER = 'Asset Register Backups';
  var PREFIX = 'snapshot-';
  var TAB = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  var paused = false;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function longDate(day) {
    var t = day.split('T'), p = t[0].split('-');
    var s = new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    return t[1] ? s + ', ' + t[1].slice(0, 2) + ':' + t[1].slice(2) + ' (before a restore or import)' : s;
  }
  function download(name, text) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function store(mode) { return _openIDB().then(function (db) { return db.transaction(IDB_STORE, mode).objectStore(IDB_STORE); }); }

  /* ---------------- daily copies on this computer */
  function listLocal() {
    return store('readonly').then(function (st) { return req(st.getAllKeys()); }).then(function (keys) {
      return (keys || []).filter(function (k) { return typeof k === 'string' && /^snapshot-\d{4}-\d{2}-\d{2}(T\d{4})?$/.test(k); }).map(function (k) { return k.slice(PREFIX.length); }).sort().reverse();
    }).catch(function () { return []; });
  }
  function getLocal(day) { return store('readonly').then(function (st) { return req(st.get(PREFIX + day)); }); }
  function prune(st, days) {
    var dated = days.filter(function (d) { return d.indexOf('T') < 0; }).sort().reverse();
    var timed = days.filter(function (d) { return d.indexOf('T') >= 0; }).sort().reverse();
    dated.slice(LOCAL_KEEP).concat(timed.slice(10)).forEach(function (d) { st.delete(PREFIX + d); });
  }
  /** A copy of everything right now (before a restore or import). */
  function copyNow() {
    if (typeof buildBackupPayload !== 'function') return Promise.resolve(false);
    var d = new Date(), key = today() + 'T' + pad(d.getHours()) + pad(d.getMinutes());
    var payload = buildBackupPayload();
    if (!payload || !payload.data || !Array.isArray(payload.data.assets) || !payload.data.assets.length) return Promise.resolve(false);
    return listLocal().then(function (days) {
      return store('readwrite').then(function (st) {
        st.put(payload, PREFIX + key); prune(st, days.concat([key]));
        return new Promise(function (res) { st.transaction.oncomplete = function () { res(true); }; st.transaction.onerror = function () { res(false); }; });
      });
    }).catch(function (e) { console.warn('[Backups] copy failed', e); return false; });
  }
  var snapshotBusy = false;
  function takeDailyCopy() {
    if (paused || snapshotBusy || typeof buildBackupPayload !== 'function') return Promise.resolve(false);
    var day = today();
    snapshotBusy = true;
    return listLocal().then(function (days) {
      if (days.indexOf(day) >= 0) return false;
      var payload = buildBackupPayload();
      // An empty register (e.g. a new computer before its first sync) is not worth a day's slot.
      if (!payload || !payload.data || !Array.isArray(payload.data.assets) || !payload.data.assets.length) return false;
      return store('readwrite').then(function (st) {
        st.put(payload, PREFIX + day);
        prune(st, days.concat([day]));
        return new Promise(function (res) { st.transaction.oncomplete = function () { res(true); }; st.transaction.onerror = function () { res(false); }; });
      });
    }).catch(function (e) { console.warn('[Backups] daily copy failed', e); return false; })
      .then(function (r) { snapshotBusy = false; return r; });
  }

  /* ---------------- daily copies in Google Drive */
  function driveToken() { try { return typeof googleAccessToken !== 'undefined' && googleAccessToken ? googleAccessToken : null; } catch (e) { return null; } }
  function api(url, opts) {
    opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + driveToken() }, opts.headers || {});
    return fetch(url, opts).then(function (r) { if (!r.ok) throw new Error('Drive HTTP ' + r.status); return r; });
  }
  function driveFolderId() {
    var cached = localStorage.getItem('assetBackupFolderId'); if (cached) return Promise.resolve(cached);
    var parent = GOOGLE_DRIVE_CONFIG.FOLDER_ID;
    var q = "name='" + DRIVE_FOLDER + "' and mimeType='application/vnd.google-apps.folder' and '" + parent + "' in parents and trashed=false";
    return api('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id)').then(function (r) { return r.json(); }).then(function (d) {
      if (d.files && d.files.length) return d.files[0].id;
      return api('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) })
        .then(function (r) { return r.json(); }).then(function (f) { return f.id; });
    }).then(function (id) { if (id) localStorage.setItem('assetBackupFolderId', id); return id; });
  }
  function afterUpload(blob) {
    var day = today();
    if (!driveToken() || !blob || localStorage.getItem('assetDriveSnapshotDay') === day) return Promise.resolve();
    var name = 'ASSET_DASHBOARD_BACKUP_' + day + '.json';
    return driveFolderId().then(function (folder) {
      var q = "'" + folder + "' in parents and trashed=false";
      return api('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)&pageSize=300').then(function (r) { return r.json(); }).then(function (d) {
        var files = d.files || [];
        var have = files.some(function (f) { return f.name === name; });
        var make = have ? Promise.resolve() : (function () {
          var form = new FormData();
          form.append('metadata', new Blob([JSON.stringify({ name: name, parents: [folder], mimeType: 'application/json' })], { type: 'application/json' }));
          form.append('file', blob);
          return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: form });
        })();
        return make.then(function () {
          localStorage.setItem('assetDriveSnapshotDay', day);
          var cutoff = new Date(Date.now() - DRIVE_KEEP * 864e5);
          var cut = cutoff.getFullYear() + '-' + pad(cutoff.getMonth() + 1) + '-' + pad(cutoff.getDate());
          return Promise.all(files.filter(function (f) { var m = /_(\d{4}-\d{2}-\d{2})\.json$/.exec(f.name || ''); return m && m[1] < cut; })
            .map(function (f) { return api('https://www.googleapis.com/drive/v3/files/' + f.id, { method: 'DELETE' }).catch(function () {}); }));
        });
      });
    }).catch(function (e) {
      if (/HTTP 404/.test(e.message)) localStorage.removeItem('assetBackupFolderId');
      console.warn('[Backups] Drive daily copy skipped:', e.message);
    });
  }

  /* ---------------- one editing tab at a time */
  var channel = null;
  try { channel = new BroadcastChannel('assetRegisterTabs'); } catch (e) { channel = null; }
  function pause() {
    if (paused) return; paused = true;
    try { if (typeof stopAutoSync === 'function') stopAutoSync(); } catch (e) { /* ignore */ }
    var o = document.createElement('div');
    o.id = 'assetTabPaused';
    o.setAttribute('role', 'alertdialog');
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:16px;';
    o.innerHTML = '<div style="max-width:440px;background:var(--bg-primary,#fff);color:var(--text-primary,#111);border-radius:12px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.35);font-family:inherit">' +
      '<h2 style="margin:0 0 10px;font-size:1.15rem">This tab is paused</h2>' +
      '<p style="margin:0 0 18px;line-height:1.5;color:var(--text-secondary,#444)">The Fixed Asset Register was opened in another tab or window. Only one can make changes at a time, so neither saves over the other. Your work in this tab was already saved.</p>' +
      '<button type="button" id="assetTabTakeOver" style="background:#1d4ed8;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer">Use this tab instead</button></div>';
    document.body.appendChild(o);
    document.getElementById('assetTabTakeOver').onclick = function () {
      if (channel) channel.postMessage({ type: 'opened', tab: TAB });
      this.disabled = true; this.textContent = 'Loading the latest data…';
      setTimeout(function () { location.reload(); }, 700);
    };
  }
  if (channel) {
    channel.onmessage = function (e) { if (e.data && e.data.type === 'opened' && e.data.tab !== TAB) pause(); };
    channel.postMessage({ type: 'opened', tab: TAB });
  }

  /* ---------------- restore */
  function analyse(day) {
    return getLocal(day).then(function (snap) {
      if (!snap || !snap.data) throw new Error('No copy for ' + day);
      var here = loadAssetsFromStorage(), ids = new Set(here.map(function (a) { return a.id; })), codes = new Set(here.map(function (a) { return String(a.assetCode || '').toLowerCase(); }));
      var missing = [], deleted = [];
      (snap.data.assets || []).forEach(function (a) {
        if (!a || ids.has(a.id)) return;
        if (a.id && deletedAssetIds.has(a.id)) { if (!codes.has(String(a.assetCode || '').toLowerCase())) deleted.push(a); }
        else if (!codes.has(String(a.assetCode || '').toLowerCase())) missing.push(a);
      });
      return { snap: snap, missing: missing, deleted: deleted };
    });
  }
  function restore(day, opts) {
    return analyse(day).then(function (r) {
      var list = loadAssetsFromStorage(), now = Date.now(), n = 0, codes = [];
      if (opts.missing) r.missing.forEach(function (a) { list.push(JSON.parse(JSON.stringify(a))); n++; codes.push(a.assetCode); });
      if (opts.deleted) r.deleted.forEach(function (a) {
        // A new id, because every computer remembers the old one as deleted.
        var c = JSON.parse(JSON.stringify(a)); c.restoredFrom = a.id; c.id = generateAssetId(); c._modifiedAt = now;
        list.push(c); n++; codes.push(a.assetCode);
      });
      if (!n) return 0;
      saveAssetsToStorage(list);
      allAssetsData = list;
      if (typeof sortByDateDescending === 'function') sortByDateDescending(allAssetsData);
      filteredData = allAssetsData.slice();
      try { addAuditEntry(codes.slice(0, 20).join(', ') + (codes.length > 20 ? ' …' : ''), 'Restored', '', n + ' asset(s) brought back from the daily copy of ' + day); } catch (e) { /* ignore */ }
      if (typeof refreshAllViews === 'function') refreshAllViews();
      return n;
    });
  }

  /* ---------------- Settings → Backups */
  function modal(title, body, actions) {
    var m = document.createElement('div');
    m.className = 'google-auth-modal'; m.style.display = 'flex'; m.style.zIndex = '100001';
    m.innerHTML = '<div class="cloud-modal-content" style="max-width:520px"><div class="cloud-modal-header"><h2>' + esc(title) + '</h2><button class="close-btn" data-x>&times;</button></div><div style="padding:20px 24px">' + body +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap" data-f></div></div></div>';
    var close = function () { m.remove(); };
    m.querySelector('[data-x]').onclick = close;
    actions.forEach(function (a) {
      var b = document.createElement('button'); b.type = 'button'; b.className = a.primary ? 'btn btn-primary' : 'btn btn-secondary'; b.textContent = a.label;
      b.onclick = function () { var r = a.onClick ? a.onClick(m) : null; if (r !== false) close(); };
      m.querySelector('[data-f]').appendChild(b);
    });
    document.body.appendChild(m);
    return m;
  }
  function note(msg) { modal('Backups', '<p>' + msg + '</p>', [{ label: 'OK', primary: true }]); }

  function renderPanel() {
    var el = document.getElementById('assetBackupsContent'); if (!el) return;
    el.innerHTML = '<p style="color:var(--text-secondary)">Loading…</p>';
    listLocal().then(function (days) {
      return Promise.all(days.map(function (d) { return getLocal(d).then(function (s) { return { day: d, count: s && s.data && s.data.assets ? s.data.assets.length : 0 }; }).catch(function () { return { day: d, count: 0 }; }); }));
    }).then(function (rows) {
      var drive = driveToken();
      el.innerHTML = '<h3 style="margin:0 0 8px;color:var(--text-primary)">💾 Backups &amp; recovery</h3>' +
        '<p style="color:var(--text-secondary);margin:0 0 16px;line-height:1.5">A copy of the whole register is kept on this computer once a day (last ' + LOCAL_KEEP + ' days)' +
        (drive ? ', and in Google Drive under “' + DRIVE_FOLDER + '” (last ' + DRIVE_KEEP + ' days)' : '. Connect Google Drive to also keep dated copies there') +
        '. Restoring adds back assets that are missing here — it never overwrites or removes anything.</p>' +
        '<button type="button" class="btn btn-primary" id="bkFull" style="margin-bottom:16px">⬇ Download full backup now</button>' +
        (rows.length ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.92rem"><thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border-color)">Daily copy</th><th style="text-align:right;padding:8px;border-bottom:1px solid var(--border-color)">Assets</th><th style="padding:8px;border-bottom:1px solid var(--border-color)"></th></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td style="padding:8px;border-bottom:1px solid var(--border-color)">' + esc(longDate(r.day)) + (r.day === today() ? ' <span style="font-size:.75rem;background:var(--bg-secondary);padding:2px 6px;border-radius:10px">today</span>' : '') + '</td>' +
              '<td style="padding:8px;text-align:right;border-bottom:1px solid var(--border-color)">' + r.count.toLocaleString() + '</td>' +
              '<td style="padding:8px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--border-color)"><button type="button" class="btn btn-secondary" data-dl="' + r.day + '">Download</button> <button type="button" class="btn btn-secondary" data-rs="' + r.day + '">Restore…</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<p style="color:var(--text-secondary)">The first daily copy is made shortly after the register loads.</p>');
      document.getElementById('bkFull').onclick = function () {
        download('asset-register-backup-' + today() + '.json', JSON.stringify(buildBackupPayload(), null, 1));
      };
      el.querySelectorAll('[data-dl]').forEach(function (b) {
        b.onclick = function () { getLocal(b.dataset.dl).then(function (s) { download('asset-register-backup-' + b.dataset.dl + '.json', JSON.stringify(s, null, 1)); }); };
      });
      el.querySelectorAll('[data-rs]').forEach(function (b) {
        b.onclick = function () {
          var day = b.dataset.rs;
          analyse(day).then(function (r) {
            if (!r.missing.length && !r.deleted.length) return note('Every asset in the copy of ' + esc(longDate(day)) + ' is already in the register. Nothing to restore.');
            var sample = function (l) { return l.slice(0, 8).map(function (a) { return esc(a.assetCode || a.description || '—'); }).join(', ') + (l.length > 8 ? ' …' : ''); };
            var body = '<p style="margin:0 0 12px">From the copy of <b>' + esc(longDate(day)) + '</b>:</p>' +
              (r.missing.length ? '<label style="display:flex;gap:8px;align-items:flex-start;margin:8px 0"><input type="checkbox" data-o="missing" checked> <span><b>' + r.missing.length + '</b> asset(s) missing here<br><small style="color:var(--text-secondary)">' + sample(r.missing) + '</small></span></label>' : '') +
              (r.deleted.length ? '<label style="display:flex;gap:8px;align-items:flex-start;margin:8px 0"><input type="checkbox" data-o="deleted"> <span><b>' + r.deleted.length + '</b> asset(s) deleted since then — bring back<br><small style="color:var(--text-secondary)">' + sample(r.deleted) + '</small></span></label>' : '') +
              '<p style="margin:12px 0 0;color:var(--text-secondary);font-size:.9rem">Nothing in the register is changed or removed.</p>';
            modal('Restore assets', body, [{ label: 'Cancel' }, { label: 'Restore', primary: true, onClick: function (m) {
              var o = {}; m.querySelectorAll('[data-o]').forEach(function (i) { o[i.dataset.o] = i.checked; });
              restore(day, o).then(function (n) { note(n ? n + ' asset(s) brought back.' : 'Nothing was selected.'); renderPanel(); }).catch(function (e) { note('Restore failed: ' + esc(e.message)); });
            } }]);
          }).catch(function (e) { note(esc(e.message)); });
        };
      });
    });
  }

  /* ---------------- start */
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(function (p) { if (!p) navigator.storage.persist(); }); } catch (e) { /* ignore */ }
  var start = function () {
    var ready = (typeof _idbInitPromise !== 'undefined' && _idbInitPromise) ? _idbInitPromise : Promise.resolve();
    ready.then(function () { setTimeout(takeDailyCopy, 8000); });
    setInterval(takeDailyCopy, 15 * 60 * 1000);   // also picks up the next day if left open overnight
  };
  start();

  window.assetSafety = { takeDailyCopy: takeDailyCopy, copyNow: copyNow, listLocal: listLocal, getLocal: getLocal, analyse: analyse, restore: restore, afterUpload: afterUpload, renderPanel: renderPanel, isPaused: function () { return paused; } };
})();
