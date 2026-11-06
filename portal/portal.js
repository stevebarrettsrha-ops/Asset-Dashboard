/* ==========================================================================
   Hospital Systems Portal
   - "Sync before signing in": pulls the shared account file from Google Drive.
   - One card per role; each opens a sign-in box for that role.
   - This is the only sign-in. The session ("mphPortalSession", in this tab and on this computer for
     12 hours) opens Procurement, General Stores and the Fixed Asset Register directly; those pages
     send anyone not signed in back here (portal.html?next=<page>) and return them after sign-in.
   - Like VocTrain: "Sync now" signs in to Google once on a computer and reads the shared accounts file
     (PORTAL_USER_ACCOUNTS.json); the Administrator's changes are written to it straight away.
   - Administrator console: user accounts (create, edit, enable/disable, reset
     password, delete, export), systems, organisation headings, cloud sync and
     sign-in activity. Operations Manager gets a hub that opens every system.
   Accounts are stored as SHA-256 hashes only (same salt as the asset dashboard).
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------ config */
  const KEYS = {
    accounts: 'portalAccountsV2', legacy: 'portalUserAccounts', headings: 'portalHeadingSettings', log: 'portalSigninLog',
    tomb: 'portalAccountTombstones', session: 'mphPortalSession', theme: 'portalTheme2', lastSync: 'portalLastSync',
    fails: 'portalFailedSignins', lock: 'mphPortalLocked', assetUsers: 'assetDashboardLocalUsers'
  };
  const SALT = 'AssetDashboard_Salt_2024';
  const GDRIVE = {
    CLIENT_ID: '438550085155-noiuiem0qtikha3l6ssup2r41qidfuo4.apps.googleusercontent.com',
    SCOPES: 'https://www.googleapis.com/auth/drive',
    FOLDER_ID: '1Vocl734yPgv9F36zgjo1DsCB2HCLSNyr',
    FILE: 'PORTAL_USER_ACCOUNTS.json'
  };
  const DEFAULT_HEADINGS = { hospitalName: 'May Pen Hospital', orgName: 'Southern Regional Health Authority' };
  const SESSION_HOURS = 12;

  const SYSTEMS = {
    procurement: { label: 'Procurement', url: 'procurement.html', icon: '📋', desc: 'Price comparisons, approval memos, purchase orders, PO books, supplier files and the PRS return.' },
    stores: { label: 'General Stores', url: 'stores.html', icon: '📦', desc: 'Receive deliveries, issue stock, stock levels and reorder points.' },
    assets: { label: 'Fixed Asset Register', url: 'index.html', icon: '🏷️', desc: 'The hospital asset register, asset codes, transfers and fiscal-year reports.' },
    locations: { label: 'Location Records', url: 'locations.html', icon: '📍', desc: 'Room-by-room location records and the asset inventory sheets.' },
    intake: { label: 'Assets on Order', url: 'asset-intake.html', icon: '🚚', desc: 'Fixed assets bought by Procurement: on order, delivered by Stores, and waiting to be registered.' }
  };
  const ROLES = {
    admin: { label: 'Administrator', btn: 'Enter as Admin', short: 'Admin', color: '#4f46e5', icon: '🛡️', home: 'console', systems: ['procurement', 'stores', 'assets', 'locations', 'intake'],
      desc: 'Manage user accounts and sync, set the hospital headings, and open every system.' },
    procurement: { label: 'Procurement Officer', btn: 'Enter Procurement', short: 'Procurement', color: '#0284c7', icon: '📋', home: 'procurement.html', systems: ['procurement'],
      desc: 'Compare prices, prepare approval memos, raise and track purchase orders, and keep supplier files.' },
    stores: { label: 'Stores Keeper', btn: 'Enter Stores', short: 'Stores', color: '#0d9488', icon: '📦', home: 'stores.html', systems: ['stores'],
      desc: 'Receive deliveries, issue stock to departments, and watch stock levels and reorder points.' },
    assets: { label: 'Fixed Asset Officer', btn: 'Enter Fixed Assets', short: 'Fixed Assets', color: '#7c3aed', icon: '🏷️', home: 'index.html', systems: ['assets', 'locations', 'intake'],
      desc: 'Keep the fixed asset register, asset codes, location records, transfers and FY reports.' },
    operations: { label: 'Operations Manager', btn: 'Enter Operations', short: 'Operations', color: '#0891b2', icon: '📊', home: 'hub', systems: ['procurement', 'stores', 'assets', 'locations', 'intake'],
      desc: 'Oversee procurement, stores and fixed assets, and open any system to review activity.' }
  };
  const ROLE_ORDER = ['admin', 'procurement', 'stores', 'assets', 'operations'];
  /* Line icons for the role cards and sign-in window. */
  const svg = d => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const ROLE_SVG = {
    admin: svg('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>'),
    procurement: svg('<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.5V3h6v1.5"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/>'),
    stores: svg('<path d="m3.5 7.5 8.5-4.5 8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>'),
    assets: svg('<path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7 7a1.4 1.4 0 0 1-2 0l-8.1-7.9Z"/><circle cx="8.5" cy="8.5" r="1.6"/>'),
    operations: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>')
  };
  const ICON = { sync: svg('<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>'), check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'), arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'), lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'), moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z"/>'), sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'), pulse: svg('<path d="M3 12h4l2-5 4 10 2-5h6"/>') };
  const DEPARTMENTS = ['Procurement Unit', 'General Stores', 'Fixed Assets', 'Finance', 'Administration', 'Operations', 'Human Resources', 'Maintenance', 'Information Technology', 'Pharmacy', 'Dietary'];

  /* ------------------------------------------------------------- utils */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => (s === null || s === undefined ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.error('[Portal] storage write failed', k, e); try { toast('This computer could not save ' + (k === 'portalAccountsV2' ? 'the user accounts' : 'a setting') + ' — browser storage is full. Free some space and try again.', 'err'); } catch (e2) { /* toast not ready */ } return false; } };
  const uid = () => 'U' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  async function hashPassword(pw) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(pw) + SALT));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const initials = n => { const p = String(n || '?').replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, '').split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
  const fmtDT = ts => { if (!ts) return '—'; const d = new Date(ts); return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toTimeString().slice(0, 5); };
  const ago = ts => { if (!ts) return 'never'; const s = (Date.now() - ts) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };
  const debounce = (fn, ms) => { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; };
  const genPassword = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; let s = ''; const r = crypto.getRandomValues(new Uint32Array(10)); r.forEach(x => { s += c[x % c.length]; }); return s.slice(0, 5) + '-' + s.slice(5); };

  function toast(msg, type) {
    let root = $('#toasts');
    if (!root) { root = document.createElement('div'); root.id = 'toasts'; root.className = 'toasts'; document.body.appendChild(root); }
    const el = document.createElement('div'); el.className = 'toast ' + (type || ''); el.textContent = msg; root.appendChild(el);
    while (root.children.length > 3) root.firstChild.remove();
    setTimeout(() => el.remove(), type === 'err' ? 6500 : 3800);
  }
  /** modal({ title, icon, iconColor, body, size, actions:[{label, cls, onClick(el) → false keeps open}], onOpen(el, close), dismissable }) */
  function modal(o) {
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = '<div class="modal ' + (o.size || '') + '" role="dialog" aria-modal="true"' + (o.iconColor ? ' style="--mc:' + o.iconColor + '"' : '') + '><div class="modal-h">' +
      (o.icon ? '<div class="role-ic" style="background:' + (o.iconColor ? 'color-mix(in srgb,' + o.iconColor + ' 13%,transparent)' : 'var(--surface-3)') + '">' + o.icon + '</div>' : '') +
      '<div><h3>' + esc(o.title) + '</h3>' + (o.sub ? '<div class="muted small">' + o.sub + '</div>' : '') + '</div>' +
      (o.dismissable === false ? '' : '<button class="btn ghost icon x" data-x aria-label="Close">✕</button>') + '</div><div class="modal-b">' + (o.body || '') + '</div><div class="modal-f"></div></div>';
    const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape' && o.dismissable !== false) close(); };
    document.addEventListener('keydown', onKey);
    if (o.dismissable !== false) { scrim.querySelector('[data-x]').onclick = close; scrim.addEventListener('mousedown', e => { if (e.target === scrim) close(); }); }
    const foot = scrim.querySelector('.modal-f');
    (o.actions || []).forEach(a => {
      const b = document.createElement('button'); b.className = 'btn ' + (a.cls || ''); b.textContent = a.label; b.type = a.submit ? 'submit' : 'button';
      b.onclick = async () => { if (!a.onClick) return close(); b.disabled = true; try { const r = await a.onClick(scrim.querySelector('.modal'), close); if (r !== false) close(); } finally { b.disabled = false; } };
      foot.appendChild(b);
    });
    document.body.appendChild(scrim);
    const m = scrim.querySelector('.modal');
    m.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { const p = foot.querySelector('.btn.gold, .btn.green'); if (p) { e.preventDefault(); p.click(); } } });
    if (o.onOpen) o.onOpen(m, close);
    const first = m.querySelector('input:not([type=checkbox]):not([readonly]), select');
    if (first) setTimeout(() => { if (!m.contains(document.activeElement)) first.focus(); }, 40);
    return { el: m, close };
  }
  function confirmBox(title, html, okLabel, danger) {
    return new Promise(res => {
      let done = false;
      const m = modal({ title, body: '<p style="color:var(--text-2)">' + html + '</p>', actions: [
        { label: 'Cancel', cls: 'ghost', onClick: () => { done = true; res(false); } },
        { label: okLabel || 'Confirm', cls: danger ? 'danger' : 'gold', onClick: () => { done = true; res(true); } }] });
      const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) res(false); } });
      obs.observe(document.body, { childList: true });
    });
  }
  const pwField = (name, label, ph) => '<div class="field"><label>' + label + '</label><div class="pw-wrap"><input type="password" name="' + name + '" autocomplete="new-password" placeholder="' + esc(ph || '') + '"><button type="button" data-show>Show</button></div></div>';
  function bindPwToggles(root) { $$('[data-show]', root).forEach(b => b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'Show' : 'Hide'; }); }

  /* ---------------------------------------------------------- accounts */
  const legacyDashRole = { procurement: 'procurement', stores: 'stores', assets: 'assets' };
  function systemsOf(a) {
    const list = (a.systems && a.systems.length ? a.systems : (ROLES[a.role] || ROLES.procurement).systems).slice();
    // Anyone who keeps the Fixed Asset Register also sees the assets Procurement has bought.
    if (list.indexOf('assets') >= 0 && list.indexOf('intake') < 0) list.push('intake');
    return list;
  }

  /** Convert the old per-dashboard list ({username, passwordHash, dashboard, role}) to one account per person. */
  function fromLegacy(list) {
    const by = new Map();
    (list || []).forEach(u => {
      if (!u || !u.username) return;
      const name = String(u.username).trim().toLowerCase();
      const sys = u.dashboard || 'procurement';
      if (!by.has(name)) {
        by.set(name, { id: uid(), username: name, displayName: u.displayName || (name.charAt(0).toUpperCase() + name.slice(1)), email: u.email || '', phone: '', role: legacyDashRole[sys] || 'procurement',
          department: '', status: 'active', passwordHash: u.passwordHash || '', _plain: u.passwordHash ? undefined : (u.password ? String(u.password) : undefined), systems: [], createdAt: Date.now(), updatedAt: 0, migrated: true });
      }
      const a = by.get(name);
      // Keep the permission level each system had (Admin / User / Viewer) so nobody gains rights in the upgrade.
      if (u.role) { a.legacyRoles = a.legacyRoles || {}; a.legacyRoles[sys] = String(u.role); }
      if (sys === 'assets') { if (a.systems.indexOf('assets') < 0) a.systems.push('assets', 'locations'); }
      else if (a.systems.indexOf(sys) < 0) a.systems.push(sys);
      if (!a.passwordHash && u.passwordHash) a.passwordHash = u.passwordHash;
    });
    return Array.from(by.values()).map(a => { const def = ROLES[a.role].systems; if (a.systems.every(s => def.indexOf(s) >= 0) && def.every(s => a.systems.indexOf(s) >= 0)) a.systems = []; return a; });
  }
  function loadAccounts() {
    let a = readJSON(KEYS.accounts, null);
    if (!Array.isArray(a)) {
      const legacy = readJSON(KEYS.legacy, null);
      // Keep the old list once, exactly as it was, before converting it.
      try { if (Array.isArray(legacy) && !localStorage.getItem(KEYS.legacy + '_v1_backup')) localStorage.setItem(KEYS.legacy + '_v1_backup', JSON.stringify(legacy)); } catch (e) { /* ignore */ }
      a = fromLegacy(Array.isArray(legacy) ? legacy : [{ username: 'procurement', password: '123', dashboard: 'procurement' }, { username: 'stores', password: '123', dashboard: 'stores' }]);
      writeJSON(KEYS.accounts, a);
    }
    return a;
  }
  /** Old per-dashboard list kept in step so Procurement, Stores and the asset dashboard keep working. */
  function legacyRoleFor(a, sys) {
    if (a.legacyRoles && a.legacyRoles[sys]) return a.legacyRoles[sys] === 'Administrator' ? 'Admin' : a.legacyRoles[sys];
    if (a.role === 'admin') return 'Admin'; if (a.role === 'operations') return 'User'; return ROLES[a.role].systems.indexOf(sys) >= 0 ? 'Admin' : 'User'; }
  function deriveLegacy(list) {
    const out = [];
    list.filter(a => a.status === 'active' && a.passwordHash).forEach(a => {
      systemsOf(a).filter(s => s === 'procurement' || s === 'stores' || s === 'assets').forEach(sys => out.push({ username: a.username, passwordHash: a.passwordHash, dashboard: sys, role: legacyRoleFor(a, sys), displayName: a.displayName, portalManaged: true }));
    });
    return out;
  }
  function syncAssetUsers(list) {
    try {
      const local = readJSON(KEYS.assetUsers, []);
      const want = list.filter(a => a.status === 'active' && a.passwordHash && systemsOf(a).indexOf('assets') >= 0);
      const names = new Set(want.map(a => a.username));
      let out = local.filter(u => !(u.portalManaged && !names.has(String(u.username).toLowerCase())));
      want.forEach(a => {
        const lr = legacyRoleFor(a, 'assets');
        const role = lr === 'Admin' ? 'Administrator' : lr;
        const found = out.find(u => String(u.username).toLowerCase() === a.username);
        const rec = { username: a.username, passwordHash: a.passwordHash, displayName: a.displayName, role, email: a.email || '', permissions: { canExport: lr !== 'Viewer', canRefresh: lr !== 'Viewer' }, portalManaged: true };
        // The portal account is now the source of truth for this username: mark it managed so
        // disabling or deleting it here also removes the dashboard's own copy.
        if (found) { delete found.password; Object.assign(found, rec); }
        else out.push(rec);
      });
      writeJSON(KEYS.assetUsers, out);
    } catch (e) { console.error('[Portal] asset user sync failed', e); }
  }
  let cloudDirty = false;
  function saveAccounts(list, opts) {
    opts = opts || {};
    list.forEach(a => { delete a.password; });
    writeJSON(KEYS.accounts, list);
    writeJSON(KEYS.legacy, deriveLegacy(list));
    syncAssetUsers(list);
    if (!opts.fromCloud) { cloudDirty = true; scheduleCloudPush(); }
  }
  function touch(a) { a.updatedAt = Date.now(); a.updatedBy = session() ? session().username : 'portal'; return a; }
  async function upgradeAccounts() {
    const list = loadAccounts();
    let changed = false;
    for (const a of list) {
      if (a._plain) { a.passwordHash = await hashPassword(a._plain); delete a._plain; changed = true; }
      if (a.password) { if (!a.passwordHash) a.passwordHash = await hashPassword(a.password); delete a.password; changed = true; }
      if (!a.id) { a.id = uid(); changed = true; }
      if (!a.status) { a.status = 'active'; changed = true; }
    }
    if (!list.some(a => a.role === 'admin')) {
      list.unshift({ id: uid(), username: 'admin', displayName: 'Administrator', email: '', phone: '', role: 'admin', department: 'Administration', status: 'active',
        passwordHash: await hashPassword('admin123'), mustChangePassword: true, isDefaultAdmin: true, systems: [], createdAt: Date.now(), updatedAt: 1 });
      changed = true;
    }
    if (changed) saveAccounts(list, { fromCloud: true });
    else { writeJSON(KEYS.legacy, deriveLegacy(list)); syncAssetUsers(list); }
  }
  const tombstones = () => readJSON(KEYS.tomb, {});

  /* ------------------------------------------------------- sign-in log */
  function logSignin(e) {
    const log = readJSON(KEYS.log, []);
    log.unshift(Object.assign({ ts: Date.now() }, e));
    if (log.length > 1000) log.length = 1000;
    writeJSON(KEYS.log, log);
  }

  /* ----------------------------------------------------------- session */
  function session() {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEYS.session) || localStorage.getItem(KEYS.session) || 'null');
      if (s && s.exp > Date.now()) {
        // The account must still exist, be active and have no pending password change.
        const a = loadAccounts().find(x => x.username === s.username);
        if (a && a.status === 'active' && !a.mustChangePassword) return s;
        endSession();
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  function startSession(a, card) {
    const lr = systemsOf(a).indexOf('assets') >= 0 ? legacyRoleFor(a, 'assets') : '';
    const s = { username: a.username, displayName: a.displayName, email: a.email || '', role: a.role, card, systems: systemsOf(a), assetRole: lr === 'Admin' ? 'Administrator' : lr, at: Date.now(), exp: Date.now() + SESSION_HOURS * 3600e3 };
    // Kept for this tab and, until it expires, for new tabs on this computer, so every dashboard opens straight away.
    sessionStorage.setItem(KEYS.session, JSON.stringify(s));
    try { localStorage.setItem(KEYS.session, JSON.stringify(s)); } catch (e) { /* ignore */ }
    handOverGoogle();
    return s;
  }
  /** The asset dashboard keeps its Google token per tab; pass on the portal's so its cloud-sync step is already connected. */
  function handOverGoogle() {
    try {
      const t = localStorage.getItem('assetDashboardGoogleAccessToken'), e = parseInt(localStorage.getItem('assetDashboardGoogleTokenExpiry') || '0', 10);
      if (t && e > Date.now()) { sessionStorage.setItem('assetDashboardGoogleAccessToken', t); sessionStorage.setItem('assetDashboardGoogleTokenExpiry', new Date(e).toISOString()); }
    } catch (err) { /* ignore */ }
  }
  function endSession() { sessionStorage.removeItem(KEYS.session); sessionStorage.removeItem(KEYS.lock); try { localStorage.removeItem(KEYS.session); } catch (e) { /* ignore */ } }

  /* --------------------------------------------------------- headings */
  const headings = () => Object.assign({}, DEFAULT_HEADINGS, readJSON(KEYS.headings, {}));
  function applyHeadings() {
    const h = headings();
    $$('[data-hospital]').forEach(e => { e.textContent = h.hospitalName; });
    $$('[data-org]').forEach(e => { e.textContent = h.orgName; });
    $$('[data-initial]').forEach(e => { e.textContent = (h.hospitalName || 'M').trim().charAt(0).toUpperCase(); });
    document.title = h.hospitalName + ' · Systems Portal';
  }

  /* --------------------------------------------------------- cloud sync */
  const cloud = { token: null, fileId: null, state: 'off', timer: null, busy: false, client: null };
  function storedToken() { const t = localStorage.getItem('assetDashboardGoogleAccessToken'), e = localStorage.getItem('assetDashboardGoogleTokenExpiry'); return t && e && Date.now() < parseInt(e, 10) ? t : null; }
  function setCloudState(s) { cloud.state = s; renderSyncChip(); }
  function requestToken() {
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return reject(new Error('Google sign-in is still loading — try again in a moment'));
      cloud.client = google.accounts.oauth2.initTokenClient({
        client_id: GDRIVE.CLIENT_ID, scope: GDRIVE.SCOPES,
        callback: r => { if (r.error) return reject(new Error(r.error)); localStorage.setItem('assetDashboardGoogleAccessToken', r.access_token); localStorage.setItem('assetDashboardGoogleTokenExpiry', String(Date.now() + 3500000)); resolve(r.access_token); },
        error_callback: () => reject(new Error('Google sign-in was cancelled'))
      });
      cloud.client.requestAccessToken();
    });
  }
  async function api(url, opts) {
    opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + cloud.token }, opts.headers || {});
    const r = await fetch(url, opts);
    if (r.status === 401) { cloud.token = null; localStorage.removeItem('assetDashboardGoogleAccessToken'); localStorage.removeItem('assetDashboardGoogleTokenExpiry'); setCloudState('off'); throw new Error('Google sign-in expired'); }
    if (!r.ok) throw new Error('Google Drive returned ' + r.status);
    return r;
  }
  async function findFile() {
    if (cloud.fileId) return cloud.fileId;
    const q = "'" + GDRIVE.FOLDER_ID + "' in parents and name='" + GDRIVE.FILE + "' and trashed=false";
    const r = await api('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,modifiedTime)');
    const j = await r.json();
    if (j.files && j.files.length) cloud.fileId = j.files[0].id;
    return cloud.fileId;
  }
  function payload() {
    const list = loadAccounts().map(a => { const c = Object.assign({}, a); delete c.password; delete c._plain; return c; });
    return { version: '2.0', type: 'portal_settings', timestamp: new Date().toISOString(),
      data: { accounts: list, deletedAccounts: tombstones(), userAccounts: deriveLegacy(list), headingSettings: headings(), signinLog: readJSON(KEYS.log, []).slice(0, 500) } };
  }
  /** Merge the shared file into this computer: newest version of each account wins; deletions travel as tombstones. */
  function mergeCloud(d) {
    if (!d) return 0;
    const list = loadAccounts(); const map = new Map(list.map(a => [a.username, a])); const tomb = tombstones(); let changed = 0;
    Object.keys(d.deletedAccounts || {}).forEach(u => { const t = d.deletedAccounts[u]; tomb[u] = Math.max(tomb[u] || 0, t); const a = map.get(u); if (a && (a.updatedAt || 0) <= t) { map.delete(u); changed++; } });
    const legacyCloud = !Array.isArray(d.accounts);
    const incoming = legacyCloud ? fromLegacy(d.userAccounts || []) : d.accounts;
    incoming.forEach(c => {
      if (!c || !c.username) return; const u = String(c.username).toLowerCase(); c.username = u;
      if (tomb[u] && tomb[u] >= (c.updatedAt || 0)) return;
      const m = map.get(u);
      if (!m) { map.set(u, c); changed++; return; }
      const cu = c.updatedAt || 0, mu = m.updatedAt || 0;
      if (cu > mu) { map.set(u, Object.assign({}, c)); changed++; return; }
      // First sync after the upgrade: an account this computer only migrated (never edited since)
      // takes the shared file's password and permission levels — the cloud copy may hold a reset
      // made on another computer, and the old portal treated the cloud as authoritative.
      if (cu === mu && m.migrated && !m.updatedBy) {
        const hash = c.passwordHash || '', plain = c._plain;
        if ((hash && hash !== m.passwordHash) || (!hash && plain)) { if (hash) { m.passwordHash = hash; delete m._plain; } else { m._plain = plain; } changed++; }
        if (c.legacyRoles && JSON.stringify(c.legacyRoles) !== JSON.stringify(m.legacyRoles || {})) { m.legacyRoles = Object.assign({}, m.legacyRoles, c.legacyRoles); changed++; }
        if (legacyCloud && c.systems && c.systems.length) { const sys = new Set(systemsOf(m).concat(c.systems)); m.systems = Array.from(sys); }
      }
    });
    writeJSON(KEYS.tomb, tomb);
    if (changed) saveAccounts(Array.from(map.values()), { fromCloud: true });
    if (d.headingSettings && d.headingSettings.hospitalName) { writeJSON(KEYS.headings, d.headingSettings); applyHeadings(); }
    if (Array.isArray(d.signinLog)) {
      const log = readJSON(KEYS.log, []); const seen = new Set(log.map(e => e.ts + '|' + e.username + '|' + e.result));
      d.signinLog.forEach(e => { const k = e.ts + '|' + e.username + '|' + e.result; if (!seen.has(k)) { log.push(e); seen.add(k); } });
      log.sort((a, b) => b.ts - a.ts); if (log.length > 1000) log.length = 1000; writeJSON(KEYS.log, log);
    }
    return changed;
  }
  async function pull() {
    const id = await findFile(); if (!id) return { found: false, changed: 0 };
    const r = await api('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media');
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { j = null; }
    // Never upload over a shared accounts file we could not read.
    if (!j || typeof j !== 'object') throw new Error('the shared accounts file could not be read, so nothing was uploaded over it');
    const changed = mergeCloud(j && j.data);
    await upgradeAccounts();
    return { found: true, changed };
  }
  async function push() {
    const blob = new Blob([JSON.stringify(payload())], { type: 'application/json' });
    const id = await findFile();
    if (id) await api('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: blob });
    else {
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: GDRIVE.FILE, parents: [GDRIVE.FOLDER_ID], mimeType: 'application/json' })], { type: 'application/json' }));
      form.append('file', blob);
      const r = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: form });
      cloud.fileId = (await r.json()).id;
    }
    cloudDirty = false;
  }
  async function syncNow(interactive) {
    if (cloud.busy) { if (cloudDirty) setTimeout(scheduleCloudPush, 2500); return false; }
    cloud.token = cloud.token || storedToken();
    if (!cloud.token) { if (!interactive) { setCloudState('off'); return false; } cloud.token = await requestToken(); }
    cloud.busy = true; setCloudState('busy');
    try {
      await pull(); await push();
      localStorage.setItem(KEYS.lastSync, String(Date.now()));
      setCloudState('ok'); startAutoSync(); return true;
    } catch (e) { setCloudState(cloud.token ? 'err' : 'off'); throw e; }
    finally { cloud.busy = false; }
  }
  function startAutoSync() {
    if (cloud.timer) return;
    cloud.timer = setInterval(() => { if (cloud.token && !cloud.busy) syncNow(false).then(ch => { if (ch && view === 'console') renderConsole(); }).catch(() => {}); }, 30000);
  }
  const scheduleCloudPush = debounce(() => { if ((cloud.token || storedToken()) && cloudDirty) syncNow(false).catch(() => {}); }, 1500);
  const lastSync = () => parseInt(localStorage.getItem(KEYS.lastSync) || '0', 10);

  /* ============================================================ LANDING */
  let synced = false, view = 'landing';
  function renderLanding() {
    view = 'landing';
    const s = session();
    const SYS_FOR = k => ROLES[k].home === 'console' ? 'Admin console · every system' : ROLES[k].home === 'hub' ? 'Overview · every system' : ROLES[k].systems.map(x => SYSTEMS[x] ? SYSTEMS[x].label : x).slice(0, 2).join(' · ');
    const d0 = new Date(), ticketNo = 'MPH-' + String(d0.getFullYear()).slice(2) + String(d0.getMonth() + 1).padStart(2, '0') + String(d0.getDate()).padStart(2, '0') + '-' + String(d0.getHours()).padStart(2, '0') + String(d0.getMinutes()).padStart(2, '0');
    const DEST = [['←', 'Procurement Unit', 'Requisitions · memos · POs'], ['↑', 'General Stores', 'Receiving · stock · issues'], ['→', 'Fixed Assets', 'Register · locations · intake']];
    $('#app').innerHTML =
      '<header class="lp-top"><div class="lp-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="17" y="5" width="14" height="38" rx="3"/><rect x="5" y="17" width="38" height="14" rx="3"/><path d="M8 24h9l3-6 4 12 3-6h13"/></svg></div>' +
      '<div class="lp-id"><div class="h" data-hospital></div><div class="s"><span data-org></span></div></div><div class="spacer"></div>' +
      '<div class="lp-clock" id="lpClock"></div><button class="icon-btn" id="lpTheme" title="Light / dark" aria-label="Switch light or dark">' + (theme() === 'dark' ? ICON.sun : ICON.moon) + '</button></header>' +
      '<svg class="ecg" viewBox="0 0 1200 46" preserveAspectRatio="none" aria-hidden="true"><path class="glow" d="M0 30 H380 L398 30 L410 12 L424 44 L438 4 L452 38 L462 30 H700 L716 30 L726 20 L738 36 L748 30 H1200"/><path d="M0 30 H380 L398 30 L410 12 L424 44 L438 4 L452 38 L462 30 H700 L716 30 L726 20 L738 36 L748 30 H1200"/></svg>' +
      '<div class="landing"><section class="hero"><div>' +
      '<div class="sign"><div class="small">Welcome to</div><h1>Hospital <em>Systems</em> Portal</h1><ul class="dest">' + DEST.map(x => '<li><span class="ar">' + x[0] + '</span>' + esc(x[1]) + '<small>' + esc(x[2]) + '</small></li>').join('') + '</ul></div>' +
      '<p class="lead">Check in at the desk, pick your staff badge, and sign in once — you go straight to the systems your role uses.</p>' +
      (s ? '<div class="signed-bar"><span class="avatar" style="background:' + ROLES[s.role].color + '">' + esc(initials(s.displayName)) + '</span><span>Signed in as <b>' + esc(s.displayName) + '</b> · ' + esc(ROLES[s.role].label) + '</span><button class="btn gold sm" data-continue>Continue</button><button class="btn ghost sm" data-signout>Sign out</button></div>' : '') +
      '</div><aside class="sync-panel' + (synced ? ' synced' : '') + '" id="syncCard"><div class="ticket-stub"><div class="lbl">Check-in</div><div class="no">TICKET ' + ticketNo + '<br>THIS COMPUTER</div></div>' +
      '<span class="stamp">Checked in</span><div class="ticket-body"><div class="sync-head"><div class="sync-orb" id="syncOrb">' + (synced ? ICON.check : ICON.sync) + '</div><div><div class="t">' + (synced ? 'This computer is up to date' : 'Sync before signing in') + '</div>' +
      '<div class="d">Gets the latest staff accounts and passwords from Google Drive.</div></div></div><div class="msg" id="syncMsg"></div>' +
      '<div class="why"><b>Why check in first?</b> Everyone then signs in with their current password, and disabled accounts stay out.<div class="offline" id="offlineWrap" hidden><a href="javascript:void 0" id="offlineLink">Continue without syncing</a> — accounts may be out of date.</div></div>' +
      '<button class="btn gold" id="syncBtn">' + (synced ? 'Synced' : 'Sync now') + '</button></div></aside></section>' +
      '<div class="section-h"><h2>Pick your badge</h2><ol class="steps" id="steps"><li class="' + (synced ? 'done' : 'now') + '"><span class="n">' + (synced ? ICON.check : '1') + '</span>Check in</li><li class="' + (synced ? 'now' : '') + '"><span class="n">2</span>Pick your badge</li><li><span class="n">3</span>Sign in</li></ol></div>' +
      '<div class="roles' + (synced ? '' : ' locked') + '" id="roles">' + ROLE_ORDER.map((k, i) => {
        const r = ROLES[k];
        return '<div class="role-card" tabindex="0" role="button" aria-label="' + esc(r.btn) + '" style="--rc:' + r.color + ';--i:' + i + '" data-role="' + k + '"><span class="clip"></span><span class="lock-chip">Sync first</span>' +
          '<div class="band"><div class="org" data-hospital></div><span class="tag">' + (k === 'admin' ? 'Admin' : 'Staff') + '</span></div>' +
          '<div class="body"><div class="photo"><div class="ic">' + ROLE_SVG[k] + '</div><div><h2>' + esc(r.label) + '</h2><div class="kicker">' + esc(SYS_FOR(k)) + '</div></div></div><p>' + esc(r.desc) + '</p>' +
          '<div class="barcode" aria-hidden="true"></div><div class="foot-row"><span class="enter-label">Tap to sign in</span><span class="go" aria-hidden="true">' + ICON.arrow + '</span></div></div></div>';
      }).join('') + '</div>' +
      '<footer class="foot"><span><span data-hospital></span> · <span data-org></span></span><span>Need an account or a password reset? Ask the Administrator. <span id="footSync"></span></span></footer></div>';
    applyHeadings();
    const tick = () => { const c = $('#lpClock'); if (!c) return clearInterval(clockTimer); const d = new Date(); c.innerHTML = '<b>' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</b><span>' + d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + '</span>'; };
    clearInterval(clockTimer); tick(); clockTimer = setInterval(tick, 30000);
    $('#lpTheme').onclick = () => { setTheme(theme() === 'dark' ? 'light' : 'dark'); $('#lpTheme').innerHTML = theme() === 'dark' ? ICON.sun : ICON.moon; };
    $('#syncBtn').onclick = runPreSync;
    $('#offlineLink').onclick = () => { synced = true; markSynced(); $('#offlineWrap').hidden = true; setSyncMsg('Continuing without sync — sign-ins use the accounts already on this computer.', 'busy'); };
    $$('#roles [data-role]').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); openSignIn(el.dataset.role); });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSignIn(el.dataset.role); } });
    });
    const c = $('[data-continue]'); if (c) c.onclick = () => { handOverGoogle(); routeHome(session()); };
    const so = $('[data-signout]'); if (so) so.onclick = signOut;
    const ls = lastSync(); if (ls) $('#footSync').textContent = 'Last synced on this computer ' + ago(ls) + '.';
    if (synced) setSyncMsg('Sync complete. Choose your role below.', 'ok');
  }
  let clockTimer = null;
  /** Move the landing page to "synced": unlock the cards and advance the steps. */
  function markSynced() {
    const card = $('#syncCard'); if (card) card.classList.add('synced');
    const orb = $('#syncOrb'); if (orb) { orb.classList.remove('spin'); orb.innerHTML = ICON.check; }
    const t = card && card.querySelector('.t'); if (t) t.textContent = 'This computer is up to date';
    const b = $('#syncBtn'); if (b && !b.disabled && b.textContent === 'Sync now') b.textContent = 'Checked in';
    const roles = $('#roles'); if (roles) roles.classList.remove('locked');
    const st = $$('#steps li'); if (st.length) { st[0].className = 'done'; st[0].querySelector('.n').innerHTML = ICON.check; st[1].className = 'now'; }
  }
  function setSyncMsg(t, cls) { const m = $('#syncMsg'); if (m) { m.textContent = t; m.className = 'msg ' + (cls || ''); } }
  async function runPreSync() {
    const btn = $('#syncBtn'); btn.disabled = true; btn.textContent = 'Syncing…'; const orb = $('#syncOrb'); if (orb) orb.classList.add('spin');
    setSyncMsg(storedToken() ? 'Pulling the latest accounts from Google Drive…' : 'Opening Google sign-in…', 'busy');
    try {
      await syncNow(true);
      synced = true;
      const n = loadAccounts().filter(a => a.status === 'active').length;
      setSyncMsg('Sync complete! ' + n + ' active ' + (n === 1 ? 'account' : 'accounts') + '. You may now sign in.', 'ok');
      btn.textContent = 'Synced'; markSynced(); $('#offlineWrap').hidden = true;
    } catch (e) {
      setSyncMsg('Could not sync: ' + e.message + '. Try again or ask the Administrator.', 'err');
      btn.disabled = false; btn.textContent = 'Retry sync'; $('#offlineWrap').hidden = false; const o2 = $('#syncOrb'); if (o2) o2.classList.remove('spin');
    }
  }
  function nudgeSync() {
    const card = $('#syncCard'); if (!card) return;
    setSyncMsg('Please press “Sync now” first to get the latest accounts before signing in.', 'err');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('attention'); void card.offsetWidth; card.classList.add('attention');
  }

  /* ----------------------------------------------------------- sign in */
  function openSignIn(roleKey) {
    if (!synced) return nudgeSync();
    const r = ROLES[roleKey];
    const def = loadAccounts().find(a => a.isDefaultAdmin && !a.lastLogin && a.status === 'active');
    modal({
      title: 'Sign in as ' + r.label, sub: r.home === 'console' ? 'Administrator console' : r.home === 'hub' ? 'Operations overview' : 'Opens ' + SYSTEMS[r.systems[0]].label,
      icon: ROLE_SVG[roleKey] || r.icon, iconColor: r.color,
      body: '<div class="err-box" data-err hidden></div>' +
        (roleKey === 'admin' && def ? '<div class="info-box">First-time set-up: sign in with username <b>admin</b> and password <b>admin123</b>. You will be asked to choose a new password straight away.</div>' : '') +
        '<div class="field"><label>Username</label><input name="username" autocomplete="username" autocapitalize="off" spellcheck="false"></div>' +
        '<div class="field"><label>Password</label><div class="pw-wrap"><input type="password" name="password" autocomplete="current-password"><button type="button" data-show>Show</button></div></div>',
      onOpen: el => bindPwToggles(el),
      actions: [{ label: 'Cancel', cls: 'ghost' }, { label: 'Sign in →', cls: r.dark ? 'gold' : 'gold', onClick: async (el) => {
        const u = el.querySelector('[name=username]').value.trim().toLowerCase(), p = el.querySelector('[name=password]').value;
        const errEl = el.querySelector('[data-err]');
        const fail = m => { errEl.textContent = m; errEl.hidden = false; return false; };
        if (!u || !p) return fail('Enter your username and password.');
        const fails = readJSON(KEYS.fails, {}); const f = fails[u];
        if (f && f.until > Date.now()) return fail('Too many attempts. Try again in ' + Math.ceil((f.until - Date.now()) / 1000) + ' seconds.');
        const h = await hashPassword(p);
        const list = loadAccounts(); const a = list.find(x => x.username === u);
        if (!a || a.passwordHash !== h) {
          const c = ((f && f.until < Date.now() ? 0 : (f ? f.count : 0)) || 0) + 1;
          fails[u] = { count: c, until: c >= 5 ? Date.now() + 60000 : 0 }; writeJSON(KEYS.fails, fails);
          logSignin({ username: u, role: a ? a.role : '', card: roleKey, result: 'failed', detail: 'Wrong username or password' });
          return fail('Incorrect username or password.' + (c >= 3 && c < 5 ? ' ' + (5 - c) + ' attempts left before a 1-minute wait.' : ''));
        }
        delete fails[u]; writeJSON(KEYS.fails, fails);
        if (a.status !== 'active') { logSignin({ username: u, role: a.role, card: roleKey, result: 'blocked', detail: 'Account disabled' }); return fail('This account is disabled. Ask the Administrator to enable it.'); }
        // Whichever badge was picked, staff go to their own dashboard.
        if (a.role !== roleKey && a.role !== 'admin') roleKey = a.role;
        a.lastLogin = Date.now(); a.loginCount = (a.loginCount || 0) + 1;
        saveAccounts(list);
        logSignin({ username: u, role: a.role, card: roleKey, result: 'success', detail: 'Signed in' });
        // No session exists until a required password change is done.
        if (a.mustChangePassword) { setTimeout(() => forceChangePassword(a.username, () => routeHome(startSession(loadAccounts().find(x => x.username === a.username), roleKey))), 50); return; }
        routeHome(startSession(a, roleKey));
      } }]
    });
  }
  function forceChangePassword(username, then) {
    modal({
      title: 'Choose a new password', sub: 'Your password must be changed before you continue.', icon: '🔑', iconColor: '#f2a91c', dismissable: false,
      body: '<div class="err-box" data-err hidden></div>' + pwField('p1', 'New password', 'At least 6 characters') + pwField('p2', 'Confirm new password'),
      onOpen: el => bindPwToggles(el),
      actions: [{ label: 'Cancel sign-in', cls: 'ghost', onClick: () => { endSession(); renderLanding(); } }, { label: 'Save password', cls: 'gold', onClick: async el => {
        const p1 = el.querySelector('[name=p1]').value, p2 = el.querySelector('[name=p2]').value, err = el.querySelector('[data-err]');
        const fail = m => { err.textContent = m; err.hidden = false; return false; };
        if (p1.length < 6) return fail('Use at least 6 characters.');
        if (p1 !== p2) return fail('The two passwords do not match.');
        if (/^(admin123|123|password|123456)$/i.test(p1)) return fail('Choose a password that is harder to guess.');
        const list = loadAccounts(); const a = list.find(x => x.username === username); if (!a) return true;
        const h = await hashPassword(p1); if (h === a.passwordHash) return fail('The new password must be different from the old one.');
        a.passwordHash = h; a.mustChangePassword = false; delete a.isDefaultAdmin; touch(a); saveAccounts(list);
        logSignin({ username, role: a.role, card: '', result: 'password', detail: 'Password changed at sign-in' });
        toast('Password changed'); then && then();
      } }]
    });
  }
  function routeHome(s) {
    if (!s) return renderLanding();
    const r = ROLES[s.card] || ROLES[s.role];
    // Came from a dashboard link (portal.html?next=stores.html#/...): go back there when the role may use it.
    const next = nextPage();
    if (next) { const k = Object.keys(SYSTEMS).find(x => SYSTEMS[x].url === next.split('#')[0]); if (k && (s.systems || []).indexOf(k) >= 0) { location.href = next; return; } }
    if (r.home === 'console') { location.hash = '#console'; renderConsole(); }
    else if (r.home === 'hub') { location.hash = '#hub'; renderHub(); }
    else location.href = r.home;
  }
  function nextPage() {
    try { const n = new URLSearchParams(location.search).get('next') || ''; return /^[a-z][a-z0-9-]*\.html(#[^\s]*)?$/i.test(n) ? n : ''; } catch (e) { return ''; }
  }
  function signOut() {
    const s = session();
    if (s) logSignin({ username: s.username, role: s.role, card: s.card, result: 'signout', detail: 'Signed out' });
    endSession(); history.replaceState(null, '', location.pathname); renderLanding();
  }

  /* --------------------------------------------------------- top bar */
  function topbar(title, opts) {
    opts = opts || {};
    const s = session(); const r = ROLES[s.role];
    return '<div class="topbar"><div class="title">' + esc(title) + '</div>' + (opts.search ? '<div class="search"><span>⌕</span><input id="tbSearch" placeholder="Search users…" value="' + esc(state.q) + '"></div>' : '') +
      '<div class="spacer"></div><button class="chip-sync" id="syncChip"></button>' +
      '<button class="btn ghost icon" id="themeBtn" title="Light / dark">' + (theme() === 'dark' ? '☀' : '☾') + '</button>' +
      '<div class="me"><span class="avatar" style="background:' + r.color + '">' + esc(initials(s.displayName)) + '</span><div class="txt"><div class="nm">' + esc(s.displayName) + '</div><div class="rl">' + esc(r.label) + '</div></div></div>' +
      '<button class="btn sm" id="lockBtn">🔒 <span class="lbl">Lock</span></button><button class="btn sm danger" id="outBtn">⏻ <span class="lbl">Sign Out</span></button></div>';
  }
  function bindTopbar() {
    $('#themeBtn').onclick = () => { setTheme(theme() === 'dark' ? 'light' : 'dark'); $('#themeBtn').textContent = theme() === 'dark' ? '☀' : '☾'; };
    $('#lockBtn').onclick = lock;
    $('#outBtn').onclick = async () => { if (await confirmBox('Sign out?', 'You will return to the portal sign-in page.', 'Sign out')) signOut(); };
    $('#syncChip').onclick = () => syncNow(true).then(() => { toast('Synced with Google Drive'); if (view === 'console') renderConsole(); }).catch(e => toast('Sync failed: ' + e.message, 'err'));
    renderSyncChip();
  }
  function renderSyncChip() {
    const c = $('#syncChip'); if (!c) return;
    const ls = lastSync();
    const map = { busy: ['busy', '⟳ Syncing…'], ok: ['ok', '✓ Synced ' + ago(ls)], err: ['', '⟳ Sync problem — retry'], off: ['', '⟳ ' + (ls ? 'Synced ' + ago(ls) : 'Not synced yet')] };
    const [cls, txt] = map[cloud.state] || map.off;
    c.className = 'chip-sync ' + cls; c.textContent = txt;
  }
  function lock() {
    sessionStorage.setItem(KEYS.lock, '1');
    const s = session(); const r = ROLES[s.role];
    const el = document.createElement('div'); el.className = 'lock-screen'; el.id = 'lockScreen';
    el.innerHTML = '<div class="lock-card"><span class="avatar" style="background:' + r.color + '">' + esc(initials(s.displayName)) + '</span><h3 style="font-family:var(--serif);font-weight:800;font-size:22px">Locked</h3><p class="muted small" style="margin:4px 0 16px">' + esc(s.displayName) + ' · enter your password to continue</p>' +
      '<div class="err-box" data-err hidden></div><div class="field" style="text-align:left"><div class="pw-wrap"><input type="password" id="unlockPw" autocomplete="current-password" placeholder="Password"><button type="button" data-show>Show</button></div></div>' +
      '<button class="btn gold" style="width:100%" id="unlockBtn">Unlock</button><button class="btn ghost" style="width:100%;margin-top:8px" id="lockOut">Sign out instead</button></div>';
    document.body.appendChild(el); bindPwToggles(el); setTimeout(() => $('#unlockPw').focus(), 30);
    const go = async () => {
      const a = loadAccounts().find(x => x.username === s.username);
      if (a && a.status === 'active' && a.passwordHash === await hashPassword($('#unlockPw').value)) { sessionStorage.removeItem(KEYS.lock); el.remove(); }
      else { const e = el.querySelector('[data-err]'); e.textContent = 'Incorrect password.'; e.hidden = false; $('#unlockPw').select(); }
    };
    $('#unlockBtn').onclick = go; $('#unlockPw').onkeydown = e => { if (e.key === 'Enter') go(); };
    $('#lockOut').onclick = () => { el.remove(); signOut(); };
  }

  /* ========================================================== CONSOLE */
  const state = { tab: 'users', q: '', role: '', status: '', selected: new Set(), page: 0, logFilter: '' };
  const TABS = [['users', 'User Accounts'], ['systems', 'Systems'], ['org', 'Organisation'], ['cloud', 'Cloud Sync'], ['activity', 'Sign-in Activity']];
  function requireAdmin() { const s = session(); if (!s || s.role !== 'admin') { renderLanding(); return null; } return s; }

  function renderConsole() {
    if (!requireAdmin()) return;
    view = 'console';
    $('#app').innerHTML = topbar('Settings', { search: state.tab === 'users' }) + '<div class="wrap"><div class="tabs">' +
      TABS.map(t => '<button class="' + (state.tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><div id="tabBody"></div></div>';
    bindTopbar();
    $$('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; renderConsole(); });
    const tb = $('#tbSearch'); if (tb) tb.addEventListener('input', debounce(() => { state.q = tb.value.trim().toLowerCase(); state.page = 0; drawUsers(); }, 120));
    ({ users: tabUsers, systems: tabSystems, org: tabOrg, cloud: tabCloud, activity: tabActivity })[state.tab]($('#tabBody'));
  }

  /* ---------------- users */
  const roleBadge = k => { const r = ROLES[k] || { label: k, color: '#888' }; return '<span class="badge" style="--bc:' + r.color + '">' + esc(r.label) + '</span>'; };
  function tabUsers(el) {
    const list = loadAccounts();
    const count = (fn) => list.filter(fn).length;
    const tiles = [['', '', list.length, 'Total Users', 'var(--text)'], ['status', 'active', count(a => a.status === 'active'), 'Active', 'var(--ok)'], ['status', 'disabled', count(a => a.status !== 'active'), 'Disabled', 'var(--bad)']]
      .concat(ROLE_ORDER.map(k => ['role', k, count(a => a.role === k), ROLES[k].label + (k === 'admin' ? 's' : 's'), ROLES[k].color]));
    el.innerHTML = '<div class="kpis">' + tiles.map(t => '<div class="kpi' + ((t[0] === 'role' && state.role === t[1]) || (t[0] === 'status' && state.status === t[1]) || (!t[0] && !state.role && !state.status) ? ' on' : '') + '" data-f="' + t[0] + '" data-v="' + t[1] + '"><div class="v" style="color:' + t[4] + '">' + t[2] + '</div><div class="l">' + esc(t[3]) + '</div></div>').join('') + '</div>' +
      '<div class="toolbar"><button class="btn gold" id="newUser">+ Create User</button>' +
      '<select id="fRole"><option value="">All Roles</option>' + ROLE_ORDER.map(k => '<option value="' + k + '"' + (state.role === k ? ' selected' : '') + '>' + esc(ROLES[k].label) + '</option>').join('') + '</select>' +
      '<select id="fStatus"><option value="">All Status</option><option value="active"' + (state.status === 'active' ? ' selected' : '') + '>Active</option><option value="disabled"' + (state.status === 'disabled' ? ' selected' : '') + '>Disabled</option></select>' +
      '<input id="fSearch" placeholder="Search users…" value="' + esc(state.q) + '"><button class="btn" id="exportBtn">📄 Export Selected</button><div class="bulk" id="bulk" hidden></div></div>' +
      '<div class="panel"><div class="panel-h"><h3>User Accounts</h3><span class="muted small" id="showing"></span></div><div class="table-wrap"><table class="tbl"><thead><tr><th style="width:40px"><input type="checkbox" id="selAll" aria-label="Select all"></th><th>User</th><th>Role</th><th>Username</th><th>Department</th><th>Last sign-in</th><th>Status</th><th>Actions</th></tr></thead><tbody id="uBody"></tbody></table></div><div class="pager" id="pager"></div></div>';
    $$('.kpi', el).forEach(k => k.onclick = () => { if (!k.dataset.f) { state.role = ''; state.status = ''; } else if (k.dataset.f === 'role') { state.role = state.role === k.dataset.v ? '' : k.dataset.v; } else { state.status = state.status === k.dataset.v ? '' : k.dataset.v; } state.page = 0; tabUsers(el); });
    $('#fRole').onchange = e => { state.role = e.target.value; state.page = 0; tabUsers(el); };
    $('#fStatus').onchange = e => { state.status = e.target.value; state.page = 0; tabUsers(el); };
    $('#fSearch').addEventListener('input', debounce(e => { state.q = e.target.value.trim().toLowerCase(); state.page = 0; const t = $('#tbSearch'); if (t) t.value = e.target.value; drawUsers(); }, 120));
    $('#newUser').onclick = () => userDialog(null);
    $('#exportBtn').onclick = exportUsers;
    $('#selAll').onchange = e => { visibleUsers().forEach(a => { if (e.target.checked) state.selected.add(a.username); else state.selected.delete(a.username); }); drawUsers(); };
    drawUsers();
  }
  function visibleUsers() {
    const q = state.q;
    return loadAccounts().filter(a => (!state.role || a.role === state.role) && (!state.status || (state.status === 'active' ? a.status === 'active' : a.status !== 'active')) &&
      (!q || [a.displayName, a.username, a.email, a.department, ROLES[a.role] && ROLES[a.role].label].join(' ').toLowerCase().indexOf(q) >= 0))
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || String(a.displayName).localeCompare(String(b.displayName)));
  }
  const PAGE = 50;
  function drawUsers() {
    const body = $('#uBody'); if (!body) return;
    const me = session().username; const all = loadAccounts();
    const activeAdmins = all.filter(a => a.role === 'admin' && a.status === 'active').length;
    const rows = visibleUsers(); const pages = Math.max(1, Math.ceil(rows.length / PAGE)); if (state.page >= pages) state.page = pages - 1;
    const slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);
    $('#showing').textContent = 'Showing ' + rows.length + ' of ' + all.length + ' users';
    body.innerHTML = slice.length ? slice.map(a => {
      const r = ROLES[a.role] || ROLES.procurement; const self = a.username === me; const lastAdmin = a.role === 'admin' && a.status === 'active' && activeAdmins <= 1;
      return '<tr data-u="' + esc(a.username) + '"><td><input type="checkbox" data-sel' + (state.selected.has(a.username) ? ' checked' : '') + ' aria-label="Select ' + esc(a.displayName) + '"></td>' +
        '<td><div class="u"><span class="avatar" style="background:' + r.color + '">' + esc(initials(a.displayName)) + '</span><div><div class="n">' + esc(a.displayName) + (self ? ' <span class="muted small">(you)</span>' : '') + '</div><div class="e">' + esc(a.email || '—') + '</div></div></div></td>' +
        '<td>' + roleBadge(a.role) + (a.legacyRoles ? Object.keys(a.legacyRoles).filter(k => a.legacyRoles[k] !== 'Admin' && a.legacyRoles[k] !== 'Administrator').map(k => '<div class="muted small" style="margin-top:4px">' + esc((SYSTEMS[k] || { label: k }).label) + ': ' + esc(a.legacyRoles[k]) + '</div>').join('') : '') + (a.systems && a.systems.length ? '<div class="muted small" style="margin-top:4px">' + esc(a.systems.map(s => SYSTEMS[s] ? SYSTEMS[s].label : s).join(', ')) + '</div>' : '') + '</td>' +
        '<td class="mono">' + esc(a.username) + (a.mustChangePassword ? '<div class="muted small">must change password</div>' : '') + '</td><td>' + esc(a.department || '—') + '</td>' +
        '<td class="small nowrap">' + (a.lastLogin ? esc(ago(a.lastLogin)) : '<span class="muted">never</span>') + '</td>' +
        '<td><div class="status"><button class="switch' + (a.status === 'active' ? ' on' : '') + '" data-toggle' + (self || lastAdmin ? ' disabled title="' + (self ? 'You cannot disable your own account' : 'The last active Administrator cannot be disabled') + '"' : '') + ' aria-label="Enable or disable"></button>' +
        '<span class="badge" style="--bc:' + (a.status === 'active' ? 'var(--ok)' : 'var(--bad)') + '">' + (a.status === 'active' ? 'Active' : 'Disabled') + '</span></div></td>' +
        '<td><div class="act"><button data-edit title="Edit user">✏️</button><button data-reset title="Reset password">🔑</button><button data-del title="Delete user"' + (self || lastAdmin ? ' disabled' : '') + '>🗑️</button></div></td></tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty">No users match these filters.</div></td></tr>';
    $('#pager').innerHTML = '<span>' + (rows.length ? (state.page * PAGE + 1) + '–' + Math.min(rows.length, (state.page + 1) * PAGE) + ' of ' + rows.length : '0 users') + '</span>' + (pages > 1 ? '<span><button class="btn sm" data-p="-1"' + (state.page ? '' : ' disabled') + '>‹ Prev</button> <button class="btn sm" data-p="1"' + (state.page < pages - 1 ? '' : ' disabled') + '>Next ›</button></span>' : '');
    $$('#pager [data-p]').forEach(b => b.onclick = () => { state.page += +b.dataset.p; drawUsers(); });
    const selAll = $('#selAll'); selAll.checked = rows.length > 0 && rows.every(a => state.selected.has(a.username));
    $$('#uBody tr[data-u]').forEach(tr => {
      const u = tr.dataset.u;
      tr.querySelector('[data-sel]').onchange = e => { if (e.target.checked) state.selected.add(u); else state.selected.delete(u); drawBulk(); selAll.checked = rows.every(a => state.selected.has(a.username)); };
      tr.querySelector('[data-toggle]').onclick = () => setStatus([u], null);
      tr.querySelector('[data-edit]').onclick = () => userDialog(u);
      tr.querySelector('[data-reset]').onclick = () => resetDialog(u);
      tr.querySelector('[data-del]').onclick = () => deleteUsers([u]);
    });
    drawBulk();
  }
  function drawBulk() {
    const b = $('#bulk'); if (!b) return;
    const n = state.selected.size;
    $('#exportBtn').textContent = '📄 Export ' + (n ? 'Selected (' + n + ')' : 'All');
    b.hidden = !n;
    b.innerHTML = '<span class="small muted">' + n + ' selected</span><button class="btn sm" data-b="enable">Enable</button><button class="btn sm" data-b="disable">Disable</button><button class="btn sm danger" data-b="delete">Delete</button><button class="btn sm ghost" data-b="clear">Clear</button>';
    $$('[data-b]', b).forEach(x => x.onclick = () => {
      const users = Array.from(state.selected);
      if (x.dataset.b === 'clear') { state.selected.clear(); drawUsers(); }
      if (x.dataset.b === 'enable') setStatus(users, 'active');
      if (x.dataset.b === 'disable') setStatus(users, 'disabled');
      if (x.dataset.b === 'delete') deleteUsers(users);
    });
  }
  function guardSelfAndLastAdmin(list, users, action) {
    const me = session().username;
    const skipped = [];
    let remaining = users.filter(u => { if (u === me) { skipped.push(u + ' (your own account)'); return false; } return true; });
    const admins = list.filter(a => a.role === 'admin' && a.status === 'active');
    const losing = admins.filter(a => remaining.indexOf(a.username) >= 0);
    if (losing.length && losing.length >= admins.length) { const keep = losing[0].username; remaining = remaining.filter(u => u !== keep); skipped.push(keep + ' (last active Administrator)'); }
    if (skipped.length) toast('Not ' + action + ': ' + skipped.join(', '), 'warn');
    return remaining;
  }
  function setStatus(users, to) {
    const list = loadAccounts();
    if (to !== 'active') users = guardSelfAndLastAdmin(list, users, 'disabled');
    let n = 0;
    users.forEach(u => { const a = list.find(x => x.username === u); if (!a) return; const next = to || (a.status === 'active' ? 'disabled' : 'active'); if (next === 'disabled' && (u === session().username)) return; if (a.status !== next) { a.status = next; touch(a); n++; logSignin({ username: u, role: a.role, card: '', result: 'admin', detail: (next === 'active' ? 'Enabled' : 'Disabled') + ' by ' + session().username }); } });
    if (n) { saveAccounts(list); toast(n + ' ' + (n === 1 ? 'account' : 'accounts') + ' ' + (to === 'active' ? 'enabled' : to === 'disabled' ? 'disabled' : 'updated')); }
    tabUsers($('#tabBody'));
  }
  async function deleteUsers(users) {
    const list = loadAccounts();
    users = guardSelfAndLastAdmin(list, users, 'deleted');
    if (!users.length) return;
    if (!await confirmBox('Delete ' + (users.length === 1 ? 'user' : users.length + ' users') + '?', 'This permanently removes <b>' + esc(users.slice(0, 5).join(', ')) + (users.length > 5 ? '…' : '') + '</b> from every computer at the next sync. They will no longer be able to sign in. To keep their history, disable the account instead.', 'Delete', true)) return;
    const tomb = tombstones(); const now = Date.now();
    users.forEach(u => { tomb[u] = now; state.selected.delete(u); logSignin({ username: u, role: '', card: '', result: 'admin', detail: 'Deleted by ' + session().username }); });
    writeJSON(KEYS.tomb, tomb);
    saveAccounts(list.filter(a => users.indexOf(a.username) < 0));
    toast(users.length + ' ' + (users.length === 1 ? 'user' : 'users') + ' deleted');
    tabUsers($('#tabBody'));
  }
  function userDialog(username) {
    const list = loadAccounts(); const a = username ? list.find(x => x.username === username) : null;
    const isNew = !a; const cur = a || { role: state.role || 'procurement', status: 'active', systems: [] };
    const deptList = Array.from(new Set(DEPARTMENTS.concat(list.map(x => x.department).filter(Boolean)))).sort();
    const sysBoxes = () => Object.keys(SYSTEMS).map(k => '<label class="check"><input type="checkbox" name="sys" value="' + k + '"> ' + SYSTEMS[k].icon + ' ' + esc(SYSTEMS[k].label) + '</label>').join('');
    modal({
      title: isNew ? 'Create user' : 'Edit ' + a.displayName, size: 'lg', icon: isNew ? '👤' : (ROLES[cur.role] || ROLES.procurement).icon, iconColor: (ROLES[cur.role] || ROLES.procurement).color,
      body: '<div class="err-box" data-err hidden></div><div class="grid2">' +
        '<div class="field"><label>Full name<span class="req">*</span></label><input name="displayName" value="' + esc(cur.displayName || '') + '" placeholder="e.g. Ms. Christine Crawford"></div>' +
        '<div class="field"><label>Username<span class="req">*</span></label><input name="username" value="' + esc(cur.username || '') + '"' + (isNew ? '' : ' readonly') + ' autocapitalize="off" spellcheck="false" placeholder="e.g. ccrawford"><div class="hint">' + (isNew ? 'Lower-case letters, numbers, dot, dash or underscore.' : 'Usernames cannot be changed.') + '</div></div>' +
        '<div class="field"><label>Email</label><input name="email" type="email" value="' + esc(cur.email || '') + '"></div>' +
        '<div class="field"><label>Phone / extension</label><input name="phone" value="' + esc(cur.phone || '') + '"></div>' +
        '<div class="field"><label>Role<span class="req">*</span></label><select name="role">' + ROLE_ORDER.map(k => '<option value="' + k + '"' + (cur.role === k ? ' selected' : '') + '>' + esc(ROLES[k].label) + '</option>').join('') + '</select><div class="hint" data-rolehint></div></div>' +
        '<div class="field"><label>Department</label><input name="department" list="deptList" value="' + esc(cur.department || '') + '"><datalist id="deptList">' + deptList.map(d => '<option value="' + esc(d) + '">').join('') + '</datalist></div></div>' +
        '<div class="field"><label>Systems this user can open</label><div class="sys-checks" data-sys>' + sysBoxes() + '</div><div class="hint">Ticked automatically from the role. Change only to give extra access.</div></div>' +
        (isNew ? '<div class="grid2">' + pwField('p1', 'Password<span class="req">*</span>', 'At least 6 characters') + pwField('p2', 'Confirm password<span class="req">*</span>') + '</div><button type="button" class="btn sm" data-gen>Generate a password</button><div class="hint" data-genout style="margin-top:6px"></div>' : '') +
        '<div class="grid2" style="margin-top:12px"><label class="check"><input type="checkbox" name="active"' + (cur.status === 'active' ? ' checked' : '') + '> Account active</label>' +
        '<label class="check"><input type="checkbox" name="mustChange"' + (isNew || cur.mustChangePassword ? ' checked' : '') + '> Ask for a new password at next sign-in</label></div>',
      onOpen: el => {
        bindPwToggles(el);
        const roleSel = el.querySelector('[name=role]');
        const setSys = (fromRole) => { const sys = fromRole ? ROLES[roleSel.value].systems : systemsOf(cur); $$('[name=sys]', el).forEach(c => { c.checked = sys.indexOf(c.value) >= 0; }); el.querySelector('[data-rolehint]').textContent = ROLES[roleSel.value].desc; };
        setSys(false); roleSel.onchange = () => setSys(true);
        const g = el.querySelector('[data-gen]'); if (g) g.onclick = () => { const p = genPassword(); el.querySelector('[name=p1]').value = p; el.querySelector('[name=p2]').value = p; $$('[name=p1],[name=p2]', el).forEach(i => { i.type = 'text'; }); el.querySelector('[data-genout]').innerHTML = 'Give this password to the user: <b class="mono">' + esc(p) + '</b>'; };
      },
      actions: [{ label: 'Cancel', cls: 'ghost' }, { label: isNew ? 'Create user' : 'Save changes', cls: 'gold', onClick: async el => {
        const v = n => { const i = el.querySelector('[name=' + n + ']'); return i ? i.value.trim() : ''; };
        const err = el.querySelector('[data-err]'); const fail = m => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); return false; };
        const displayName = v('displayName'), uname = v('username').toLowerCase(), email = v('email'), role = el.querySelector('[name=role]').value;
        if (!displayName) return fail('Enter the person\'s full name.');
        if (!/^[a-z0-9._-]{3,40}$/.test(uname)) return fail('Usernames are 3–40 characters: lower-case letters, numbers, dot, dash or underscore.');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('That email address does not look right.');
        const fresh = loadAccounts();
        if (isNew && fresh.some(x => x.username === uname)) return fail('The username “' + uname + '” is already taken.');
        let systems = $$('[name=sys]', el).filter(c => c.checked).map(c => c.value);
        if (!systems.length) return fail('Tick at least one system.');
        const def = ROLES[role].systems; if (systems.length === def.length && def.every(s => systems.indexOf(s) >= 0)) systems = [];
        const active = el.querySelector('[name=active]').checked; const mustChange = el.querySelector('[name=mustChange]').checked;
        const me = session().username;
        if (!isNew && uname === me && (!active || role !== 'admin')) return fail('You cannot disable your own account or remove your own Administrator role.');
        if (!isNew && a.role === 'admin' && a.status === 'active' && (role !== 'admin' || !active) && fresh.filter(x => x.role === 'admin' && x.status === 'active').length <= 1) return fail('This is the last active Administrator. Create another Administrator first.');
        if (isNew) {
          const p1 = el.querySelector('[name=p1]').value, p2 = el.querySelector('[name=p2]').value;
          if (p1.length < 6) return fail('The password must be at least 6 characters.');
          if (p1 !== p2) return fail('The two passwords do not match.');
          const rec = { id: uid(), username: uname, displayName, email, phone: v('phone'), role, department: v('department'), status: active ? 'active' : 'disabled', systems,
            passwordHash: await hashPassword(p1), mustChangePassword: mustChange, createdAt: Date.now(), createdBy: me };
          const tomb = tombstones(); if (tomb[uname]) { delete tomb[uname]; writeJSON(KEYS.tomb, tomb); }
          fresh.push(touch(rec)); saveAccounts(fresh);
          logSignin({ username: uname, role, card: '', result: 'admin', detail: 'Created by ' + me });
          toast('User ' + uname + ' created');
        } else {
          const t = fresh.find(x => x.username === uname); if (!t) return fail('This user no longer exists.');
          if (t.role !== role) delete t.legacyRoles;
          Object.assign(t, { displayName, email, phone: v('phone'), role, department: v('department'), status: active ? 'active' : 'disabled', systems, mustChangePassword: mustChange });
          touch(t); saveAccounts(fresh);
          logSignin({ username: uname, role, card: '', result: 'admin', detail: 'Edited by ' + me });
          toast('Changes saved for ' + displayName);
        }
        tabUsers($('#tabBody'));
      } }]
    });
  }
  function resetDialog(username) {
    const a = loadAccounts().find(x => x.username === username); if (!a) return;
    modal({
      title: 'Reset password', sub: esc(a.displayName) + ' · ' + esc(a.username), icon: '🔑', iconColor: '#f2a91c',
      body: '<div class="err-box" data-err hidden></div>' + pwField('p1', 'New password', 'At least 6 characters') + pwField('p2', 'Confirm new password') +
        '<button type="button" class="btn sm" data-gen>Generate a password</button><div class="hint" data-genout style="margin:6px 0 12px"></div><label class="check"><input type="checkbox" name="mustChange" checked> Ask for a new password at next sign-in</label>',
      onOpen: el => { bindPwToggles(el); el.querySelector('[data-gen]').onclick = () => { const p = genPassword(); el.querySelector('[name=p1]').value = p; el.querySelector('[name=p2]').value = p; $$('[name=p1],[name=p2]', el).forEach(i => { i.type = 'text'; }); el.querySelector('[data-genout]').innerHTML = 'Give this password to the user: <b class="mono">' + esc(p) + '</b>'; }; },
      actions: [{ label: 'Cancel', cls: 'ghost' }, { label: 'Reset password', cls: 'gold', onClick: async el => {
        const p1 = el.querySelector('[name=p1]').value, p2 = el.querySelector('[name=p2]').value, err = el.querySelector('[data-err]');
        const fail = m => { err.textContent = m; err.hidden = false; return false; };
        if (p1.length < 6) return fail('Use at least 6 characters.');
        if (p1 !== p2) return fail('The two passwords do not match.');
        const list = loadAccounts(); const t = list.find(x => x.username === username); if (!t) return true;
        t.passwordHash = await hashPassword(p1); t.mustChangePassword = el.querySelector('[name=mustChange]').checked; delete t.isDefaultAdmin; touch(t); saveAccounts(list);
        const fails = readJSON(KEYS.fails, {}); delete fails[username]; writeJSON(KEYS.fails, fails);
        logSignin({ username, role: t.role, card: '', result: 'admin', detail: 'Password reset by ' + session().username });
        toast('Password reset for ' + t.displayName);
        tabUsers($('#tabBody'));
      } }]
    });
  }
  function exportUsers() {
    const all = loadAccounts(); const sel = state.selected.size ? all.filter(a => state.selected.has(a.username)) : visibleUsers();
    const q = s => { s = s === null || s === undefined ? '' : String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['Name', 'Username', 'Email', 'Phone', 'Role', 'Department', 'Systems', 'Status', 'Last sign-in', 'Created']].concat(sel.map(a => [a.displayName, a.username, a.email, a.phone, ROLES[a.role] ? ROLES[a.role].label : a.role, a.department, systemsOf(a).map(s => SYSTEMS[s].label).join('; '), a.status, a.lastLogin ? new Date(a.lastLogin).toISOString() : '', a.createdAt ? new Date(a.createdAt).toISOString() : '']));
    const blob = new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'user-accounts-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(link); link.click(); setTimeout(() => link.remove(), 500);
    toast('Exported ' + sel.length + ' ' + (sel.length === 1 ? 'user' : 'users') + ' (passwords are never exported)');
  }

  /* ---------------- other tabs */
  function systemCards(systems) {
    return '<div class="sys-grid">' + systems.map(k => { const s = SYSTEMS[k]; return '<div class="sys-card"><div class="ic">' + s.icon + '</div><h4>' + esc(s.label) + '</h4><p>' + esc(s.desc) + '</p><div><a class="btn gold sm" href="' + s.url + '">Open ' + esc(s.label) + ' →</a></div></div>'; }).join('') + '</div>';
  }
  function tabSystems(el) { el.innerHTML = '<p class="muted" style="margin-bottom:14px">You are signed in, so each system opens without asking for your password again.</p>' + systemCards(Object.keys(SYSTEMS)); }
  function tabOrg(el) {
    const h = headings();
    el.innerHTML = '<div class="panel" style="max-width:720px"><div class="panel-h"><h3>Organisation headings</h3></div><div class="panel-b">' +
      '<div class="field"><label>Hospital name</label><input name="hospitalName" value="' + esc(h.hospitalName) + '"></div><div class="field"><label>Organisation</label><input name="orgName" value="' + esc(h.orgName) + '"></div>' +
      '<p class="muted small" style="margin-bottom:14px">Shown on this portal and on the Procurement, Stores and Fixed Asset pages. Shared with other computers at the next sync.</p>' +
      '<button class="btn gold" data-save>Save</button> <button class="btn ghost" data-reset>Reset to defaults</button></div></div>';
    el.querySelector('[data-save]').onclick = () => { writeJSON(KEYS.headings, { hospitalName: el.querySelector('[name=hospitalName]').value.trim() || DEFAULT_HEADINGS.hospitalName, orgName: el.querySelector('[name=orgName]').value.trim() || DEFAULT_HEADINGS.orgName }); applyHeadings(); cloudDirty = true; scheduleCloudPush(); toast('Headings saved'); };
    el.querySelector('[data-reset]').onclick = async () => { if (await confirmBox('Reset headings?', 'Restore the default hospital and organisation names?', 'Reset')) { writeJSON(KEYS.headings, DEFAULT_HEADINGS); applyHeadings(); cloudDirty = true; scheduleCloudPush(); tabOrg(el); } };
  }
  function tabCloud(el) {
    const ls = lastSync();
    el.innerHTML = '<div class="panel" style="max-width:820px"><div class="panel-h"><h3>Google Drive sync</h3></div><div class="panel-b"><dl class="kv">' +
      '<dt>Status</dt><dd>' + ({ ok: '✓ Connected', busy: 'Syncing…', err: 'Problem — will retry', off: 'Not connected on this computer' })[cloud.state] + '</dd>' +
      '<dt>Last synced</dt><dd>' + (ls ? fmtDT(ls) + ' (' + ago(ls) + ')' : 'Never on this computer') + '</dd><dt>Shared file</dt><dd class="mono">' + GDRIVE.FILE + '</dd>' +
      '<dt>Accounts</dt><dd>' + loadAccounts().length + ' on this computer · passwords are stored and shared as one-way hashes only</dd></dl>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><button class="btn gold" data-sync>⟳ Sync now</button><button class="btn" data-dl>⬇ Download accounts backup</button><label class="btn">⬆ Restore from backup<input type="file" accept=".json" hidden data-up></label></div>' +
      '<p class="muted small" style="margin-top:14px">Accounts sync automatically every 30 seconds while this console is open, and straight after every change. Deleted users stay deleted on every computer.</p></div></div>';
    el.querySelector('[data-sync]').onclick = () => syncNow(true).then(() => { toast('Synced with Google Drive'); tabCloud(el); }).catch(e => toast('Sync failed: ' + e.message, 'err'));
    el.querySelector('[data-dl]').onclick = () => { const b = new Blob([JSON.stringify(payload(), null, 1)], { type: 'application/json' }); const l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = 'portal-accounts-backup-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(l); l.click(); setTimeout(() => l.remove(), 500); };
    el.querySelector('[data-up]').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const j = JSON.parse(r.result); const n = mergeCloud(j.data || j); cloudDirty = true; scheduleCloudPush(); toast(n ? 'Backup merged — ' + n + ' accounts updated' : 'Nothing newer in that backup'); tabCloud(el); } catch (err) { toast('Not a valid backup file', 'err'); } }; r.readAsText(f); };
  }
  function tabActivity(el) {
    const log = readJSON(KEYS.log, []);
    const tone = { success: 'var(--ok)', failed: 'var(--bad)', blocked: 'var(--warn)', signout: 'var(--text-3)', password: 'var(--info)', admin: 'var(--info)' };
    const label = { success: 'Signed in', failed: 'Failed', blocked: 'Blocked', signout: 'Signed out', password: 'Password', admin: 'Account change' };
    const rows = log.filter(e => !state.logFilter || e.result === state.logFilter);
    el.innerHTML = '<div class="toolbar"><select id="lf"><option value="">All activity</option>' + Object.keys(label).map(k => '<option value="' + k + '"' + (state.logFilter === k ? ' selected' : '') + '>' + label[k] + '</option>').join('') + '</select><span class="muted small">' + rows.length + ' entries · failed sign-ins lock the username for one minute after five tries</span></div>' +
      '<div class="panel"><div class="table-wrap"><table class="tbl"><thead><tr><th>When</th><th>User</th><th>Card used</th><th>Result</th><th>Detail</th></tr></thead><tbody>' +
      (rows.slice(0, 300).map(e => '<tr><td class="nowrap small">' + esc(fmtDT(e.ts)) + '</td><td class="mono">' + esc(e.username) + '</td><td>' + (e.card && ROLES[e.card] ? roleBadge(e.card) : '<span class="muted">—</span>') + '</td><td><span class="badge" style="--bc:' + (tone[e.result] || 'var(--text-3)') + '">' + esc(label[e.result] || e.result) + '</span></td><td class="small">' + esc(e.detail || '') + '</td></tr>').join('') || '<tr><td colspan="5"><div class="empty">No sign-in activity yet.</div></td></tr>') +
      '</tbody></table></div></div>';
    $('#lf').onchange = e => { state.logFilter = e.target.value; tabActivity(el); };
  }

  /* ================================================== OPERATIONS HUB */
  function procurementSnapshot() {
    try {
      const d = JSON.parse(localStorage.getItem('procurementData') || 'null');
      if (!d || !Array.isArray(d.purchaseOrders)) return null;
      const now = new Date(); const fyStart = new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1).toISOString().slice(0, 10);
      const pos = d.purchaseOrders.filter(p => !p._deleted && p.status !== 'Cancelled');
      const fy = pos.filter(p => (p.date || '') >= fyStart);
      const awaiting = pos.filter(p => p.status === 'Issued' || p.status === 'Partially Delivered');
      const unpaid = (d.invoices || []).filter(i => i.status !== 'Paid');
      const memos = (d.memos || []).filter(m => m.status === 'Submitted');
      const money = n => '$' + (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n).toLocaleString());
      const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
      return [['Committed this fiscal year', money(sum(fy, p => p.total)), fy.length + ' purchase orders'], ['Awaiting delivery', awaiting.length, money(sum(awaiting, p => p.total)) + ' on order'],
        ['Unpaid invoices', unpaid.length, money(sum(unpaid, i => i.total))], ['Memos awaiting decision', memos.length, 'Approval memos submitted']];
    } catch (e) { return null; }
  }
  function renderHub() {
    const s = session(); if (!s) return renderLanding();
    view = 'hub';
    const snap = procurementSnapshot();
    $('#app').innerHTML = topbar('Operations') + '<div class="wrap"><div class="hello"><h1>Good ' + (new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening') + ', ' + esc(String(s.displayName).replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, '').split(' ')[0]) + '</h1><p>Open any system to review activity. You are signed in, so each opens without asking for your password again.</p></div>' +
      (snap ? '<div class="stat-row">' + snap.map(x => '<div class="stat"><div class="l">' + esc(x[0]) + '</div><div class="v">' + esc(x[1]) + '</div><div class="m">' + esc(x[2]) + '</div></div>').join('') + '</div><p class="muted small" style="margin:-8px 0 18px">Procurement figures from the records on this computer.</p>' : '') +
      systemCards(s.systems.filter(k => SYSTEMS[k])) + '</div>';
    bindTopbar();
  }

  /* --------------------------------------------------------------- boot */
  const theme = () => { try { return localStorage.getItem(KEYS.theme) || 'light'; } catch (e) { return 'light'; } };
  function setTheme(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem(KEYS.theme, t); } catch (e) { /* ignore */ } }

  async function boot() {
    setTheme(theme());
    await upgradeAccounts();
    applyHeadings();
    let s = session();
    // Already signed in and sent here by a dashboard: go straight back.
    if (s && nextPage()) { routeHome(s); return; }
    if (s && storedToken()) { synced = true; handOverGoogle(); syncNow(false).catch(() => {}); }
    if (s && location.hash === '#console' && s.role === 'admin') renderConsole();
    else if (s && location.hash === '#hub') renderHub();
    else renderLanding();
    if (s && sessionStorage.getItem(KEYS.lock)) lock();
    // A valid Google token on this computer: sync straight away so cards unlock.
    if (!synced && storedToken()) { const b = $('#syncBtn'); if (b) runPreSync(); }
    void s;
  }
  window.addEventListener('hashchange', () => { const s = session(); if (!s) return renderLanding(); if (location.hash === '#console' && s.role === 'admin') renderConsole(); else if (location.hash === '#hub') renderHub(); else if (!location.hash) renderLanding(); });
  window.PortalApp = { loadAccounts, hashPassword, session, mergeCloud, payload };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
