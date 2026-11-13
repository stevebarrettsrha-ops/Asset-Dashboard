/* ==========================================================================
   Built-in data → Google Drive
   The website carries the hospital's data files (register and location seeds,
   room inventory sheets, workbooks, the built-in procurement records — listed
   in builtin-files.json). The first computer that syncs with Google Drive
   copies each of them to "Built-in data" in the hospital's Drive folder, in the
   same sub-folders, so they are kept in Drive and can later be taken off the
   website. Files already in Drive (copied by another computer) are not copied
   again. Progress is kept on this computer, so an interrupted copy carries on.
   ========================================================================== */
(function () {
  'use strict';
  var FOLDER_ID = '1Vocl734yPgv9F36zgjo1DsCB2HCLSNyr';
  var ROOT_NAME = 'Built-in data';
  var STATE_KEY = 'mphBuiltInDrive', LOCK_KEY = 'mphBuiltInDriveLock';
  var folders = {}, running = null;

  function token() {
    try {
      var t = localStorage.getItem('assetDashboardGoogleAccessToken'), e = parseInt(localStorage.getItem('assetDashboardGoogleTokenExpiry') || '0', 10);
      if (!t) return null;
      if (e && e < Date.now()) return null;
      return t;
    } catch (x) { return null; }
  }
  function readState() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; } catch (x) { return {}; } }
  function writeState(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (x) { /* ignore */ } }
  function api(url, opts) {
    var t = token(); if (!t) return Promise.reject(new Error('Google Drive is not connected on this computer'));
    opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + t }, opts.headers || {});
    return fetch(url, opts).then(function (r) { if (!r.ok) throw new Error('Google Drive returned ' + r.status); return r; });
  }
  var q = function (s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); };
  function folderIn(parent, name) {
    var k = parent + '/' + name;
    if (folders[k]) return Promise.resolve(folders[k]);
    var query = "'" + parent + "' in parents and name='" + q(name) + "' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    return api('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(query) + '&fields=files(id)').then(function (r) { return r.json(); }).then(function (j) {
      if (j.files && j.files.length) return (folders[k] = j.files[0].id);
      return api('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) })
        .then(function (r) { return r.json(); }).then(function (c) { return (folders[k] = c.id); });
    });
  }
  /** The Drive folder for a file's path ("01 Female Medical Ward/Ward A/x.pdf" → Built-in data/01 Female Medical Ward/Ward A). */
  function folderFor(path) {
    var parts = path.split('/'); parts.pop();
    var p = folderIn(FOLDER_ID, ROOT_NAME);
    parts.forEach(function (name) { p = p.then(function (id) { return folderIn(id, name); }); });
    return p;
  }
  function existing(folder, name) {
    var query = "'" + folder + "' in parents and name='" + q(name) + "' and trashed=false";
    return api('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(query) + '&fields=files(id,size)').then(function (r) { return r.json(); }).then(function (j) { return (j.files || [])[0] || null; });
  }
  function mimeOf(name) {
    var ext = (name.split('.').pop() || '').toLowerCase();
    return { pdf: 'application/pdf', json: 'application/json', js: 'text/javascript', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[ext] || 'application/octet-stream';
  }
  function manifest() {
    return fetch('builtin-files.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('list of built-in files not found'); return r.json(); });
  }

  /** Copy every built-in file that is not in Drive yet. onProgress({done, total, current}). */
  function run(opts) {
    opts = opts || {};
    if (running) return running;
    if (!token()) return Promise.resolve({ skipped: 'not connected' });
    try { var l = parseInt(localStorage.getItem(LOCK_KEY) || '0', 10); if (l && Date.now() - l < 120000 && !opts.force) return Promise.resolve({ skipped: 'another tab is copying' }); } catch (x) { /* ignore */ }
    running = manifest().then(function (m) {
      var state = readState(), files = m.files || [], total = files.length, done = 0, copied = 0, failed = [];
      files.forEach(function (f) { if (state[f.path] && state[f.path].id) done++; });
      var report = function (cur) { if (opts.onProgress) try { opts.onProgress({ done: done, total: total, current: cur || '' }); } catch (x) { /* ignore */ } };
      report();
      var chain = Promise.resolve();
      files.forEach(function (f) {
        if (state[f.path] && state[f.path].id) return;
        chain = chain.then(function () {
          try { localStorage.setItem(LOCK_KEY, String(Date.now())); } catch (x) { /* ignore */ }
          report(f.path);
          var name = f.path.split('/').pop();
          return folderFor(f.path).then(function (folder) {
            return existing(folder, name).then(function (have) {
              if (have) return have.id;
              return fetch(encodeURI(f.path), { cache: 'no-cache' }).then(function (r) {
                if (!r.ok) throw new Error('not on the website (' + r.status + ')');
                return r.blob();
              }).then(function (blob) {
                var form = new FormData();
                form.append('metadata', new Blob([JSON.stringify({ name: name, parents: [folder], mimeType: mimeOf(name) })], { type: 'application/json' }));
                form.append('file', blob);
                return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: form }).then(function (r) { return r.json(); }).then(function (j) { copied++; return j.id; });
              });
            });
          }).then(function (id) {
            state = readState(); state[f.path] = { id: id, size: f.size, at: Date.now() }; writeState(state); done++; report();
          }).catch(function (e) { failed.push(f.path + ': ' + e.message); if (/not connected|401/.test(e.message)) throw e; });
        });
      });
      return chain.then(function () {
        var s = readState(); s._checked = Date.now(); s._total = total; s._done = done; s._version = m.version || ''; writeState(s);
        return { total: total, done: done, copied: copied, failed: failed };
      });
    }).finally(function () { running = null; try { localStorage.removeItem(LOCK_KEY); } catch (x) { /* ignore */ } });
    return running;
  }
  /** How many built-in files are in Drive, as last seen on this computer. */
  function status() {
    var s = readState(), n = Object.keys(s).filter(function (k) { return k.charAt(0) !== '_' && s[k] && s[k].id; }).length;
    return { done: n, total: s._total || null, checked: s._checked || null, complete: !!(s._total && n >= s._total) };
  }
  /** Read a built-in file from Drive (used when it is no longer on the website). */
  function fromDrive(path) {
    var s = readState();
    var get = function (id) { return api('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media'); };
    if (s[path] && s[path].id) return get(s[path].id);
    var name = path.split('/').pop();
    return folderFor(path).then(function (folder) { return existing(folder, name); }).then(function (f) { if (!f) throw new Error(path + ' is not in Google Drive'); return get(f.id); });
  }
  window.MPHBuiltInDrive = { run: run, status: status, fromDrive: fromDrive, connected: function () { return !!token(); } };
})();
