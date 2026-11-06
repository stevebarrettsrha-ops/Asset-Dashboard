/**
 * May Pen Hospital — online requisition receiver and portal sign-in service (Google Apps Script).
 *
 * 1. Receives requisitions submitted from the public requisition page, keeps each one
 *    in this Google Sheet, emails the Procurement Unit, and hands them to the
 *    Procurement system (which collects them every couple of minutes).
 * 2. Holds a copy of the portal's user accounts (sheet "Accounts", hidden) so a username and
 *    password made by the Administrator work on every computer straight away. Passwords are
 *    kept only as the same one-way hashes the portal uses.
 *
 * Set-up (once, about 5 minutes):
 *  1. Create a new Google Sheet (e.g. "Online Requisitions") with the Procurement Google account.
 *  2. Extensions → Apps Script. Delete what is there and paste this whole file.
 *  3. Change KEY below to a long secret of your own, and NOTIFY_EMAIL to the address that should be alerted.
 *  4. Deploy → New deployment → type "Web app".
 *     Execute as: Me.   Who has access: Anyone.   → Deploy, and allow the permissions it asks for.
 *  5. Copy the Web app URL.
 *     - Online requisitions: Procurement → Requisitions → "Online requests" → paste the URL and the KEY.
 *     - Sign-in for every computer: Portal → Admin console → Cloud Sync → "Sign-in service" → paste the URL and the KEY.
 *
 * Updating an existing copy: paste this file over the old one, then Deploy → Manage deployments →
 * edit (pencil) → Version: "New version" → Deploy. The Web app URL stays the same.
 */
const KEY = 'CHANGE-ME-to-a-long-secret';
const NOTIFY_EMAIL = 'procurement@example.com';
const SHEET = 'Submissions';

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(['ID', 'Received', 'Department', 'Requested by', 'Items', 'Estimate', 'Data (do not edit)']); sh.setFrozenRows(1); }
  return sh;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** A requisition submitted from the public page, or a portal sign-in request. */
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    if (d && d.action) return out_(accountAction_(d));
    if (!d || !d.form || !d.form.department || !(d.form.lines || []).length) return out_({ ok: false, error: 'Incomplete form' });
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    const id = 'ONL-' + Utilities.formatDate(new Date(), 'GMT-5', 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 6).toUpperCase();
    const f = d.form, items = (f.lines || []).map(l => (l.qty || '') + ' ' + (l.unit || '') + ' ' + (l.description || '')).join('\n');
    sheet_().appendRow([id, new Date(), f.department || '', f.requestedBy || '', items, f.estimate || '', JSON.stringify(d).slice(0, 49000)]);
    lock.releaseLock();
    if (NOTIFY_EMAIL && NOTIFY_EMAIL.indexOf('@') > 0) {
      MailApp.sendEmail(NOTIFY_EMAIL, 'New requisition ' + id + ' — ' + (f.department || ''),
        'A requisition was submitted online.\n\nReference: ' + id + '\nDepartment: ' + (f.department || '') + '\nRequested by: ' + (f.requestedBy || '') +
        (f.requesterEmail ? ' (' + f.requesterEmail + ')' : '') + '\nEstimate: ' + (f.estimate || '-') + '\n\nItems:\n' + items + '\n\nJustification:\n' + (f.justification || '') +
        '\n\nIt will appear in Procurement → Requisitions within a couple of minutes.');
    }
    return out_({ ok: true, id: id });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

/** The Procurement system collects submissions with the secret key. */
function doGet(e) {
  const p = e.parameter || {};
  if (p.ping) return out_({ ok: true, service: 'mph-requisitions', accounts: true });
  if (p.key !== KEY) return out_({ ok: false, error: 'Wrong key' });
  const rows = sheet_().getDataRange().getValues().slice(1);
  const since = Number(p.since || 0);
  const items = rows.filter(r => r[0] && new Date(r[1]).getTime() > since).slice(-200).map(r => {
    let data = {}; try { data = JSON.parse(r[6]); } catch (x) { /* row edited by hand */ }
    return { id: r[0], at: new Date(r[1]).getTime(), data: data };
  });
  return out_({ ok: true, items: items });
}

/* ------------------------------------------------------------------ portal accounts */
const ACCOUNTS = 'Accounts';
function accSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ACCOUNTS);
  if (!sh) { sh = ss.insertSheet(ACCOUNTS); sh.appendRow(['Username', 'Updated', 'Deleted', 'Data (do not edit)']); sh.setFrozenRows(1); sh.hideSheet(); }
  return sh;
}
/** Every stored account: { username: { row, updatedAt, deletedAt, acc } } */
function accRead_() {
  const sh = accSheet_(), rows = sh.getDataRange().getValues().slice(1), map = {};
  rows.forEach((r, i) => {
    if (!r[0]) return;
    let acc = null; try { acc = JSON.parse(r[3] || 'null'); } catch (x) { acc = null; }
    map[String(r[0]).toLowerCase()] = { row: i + 2, updatedAt: Number(r[1]) || 0, deletedAt: Number(r[2]) || 0, acc: acc };
  });
  return map;
}
function accWrite_(map, username) {
  const sh = accSheet_(), m = map[username];
  const vals = [[username, m.updatedAt || 0, m.deletedAt || 0, m.acc ? JSON.stringify(m.acc) : '']];
  if (m.row) sh.getRange(m.row, 1, 1, 4).setValues(vals); else { sh.appendRow(vals[0]); m.row = sh.getLastRow(); }
}
const live_ = m => m && m.acc && !(m.deletedAt && m.deletedAt >= (m.updatedAt || 0));

function accountAction_(d) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const u = String(d.username || '').trim().toLowerCase();
    const cache = CacheService.getScriptCache();

    if (d.action === 'login') {
      const map = accRead_();
      if (!Object.keys(map).length) return { ok: false, error: 'empty' };
      const m = map[u];
      if (m && !live_(m) && m.deletedAt) return { ok: false, error: 'deleted', at: m.deletedAt };
      if (!live_(m)) return { ok: false, error: 'unknown' };
      const f = JSON.parse(cache.get('fail_' + u) || '{"n":0,"until":0}');
      if (f.until > Date.now()) return { ok: false, error: 'locked', wait: Math.ceil((f.until - Date.now()) / 1000) };
      if (m.acc.passwordHash !== d.hash) {
        f.n += 1; if (f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; }
        cache.put('fail_' + u, JSON.stringify(f), 600);
        return { ok: false, error: 'wrong' };
      }
      cache.remove('fail_' + u);
      if (m.acc.status !== 'active') return { ok: false, error: 'disabled', account: m.acc };
      return { ok: true, account: m.acc };
    }

    if (d.action === 'password') {
      const map = accRead_(), m = map[u];
      if (!live_(m)) return { ok: false, error: 'unknown' };
      if (m.acc.passwordHash !== d.hash || !d.newHash) return { ok: false, error: 'wrong' };
      m.acc.passwordHash = d.newHash; m.acc.mustChangePassword = false; delete m.acc.isDefaultAdmin;
      m.acc.updatedAt = Date.now(); m.acc.updatedBy = u; m.updatedAt = m.acc.updatedAt;
      accWrite_(map, u);
      return { ok: true, account: m.acc };
    }

    if (d.action === 'accounts-sync') {
      if (d.key !== KEY) return { ok: false, error: 'Wrong key' };
      const map = accRead_();
      const deleted = d.deleted || {};
      Object.keys(deleted).forEach(name => {
        const n = String(name).toLowerCase(), t = Number(deleted[name]) || 0, m = map[n];
        if (!m) { map[n] = { updatedAt: 0, deletedAt: t, acc: null }; accWrite_(map, n); }
        else if (t > (m.deletedAt || 0) && t >= (m.updatedAt || 0)) { m.deletedAt = t; m.acc = null; accWrite_(map, n); }
      });
      (d.accounts || []).forEach(a => {
        if (!a || !a.username) return;
        const n = String(a.username).toLowerCase(), t = Number(a.updatedAt) || 0, m = map[n];
        a.username = n; delete a.password; delete a._plain;
        if (m && m.deletedAt && m.deletedAt >= t) return;
        if (!m) { map[n] = { updatedAt: t, deletedAt: 0, acc: a }; accWrite_(map, n); }
        else if (!m.acc || t > (m.updatedAt || 0)) { m.acc = a; m.updatedAt = t; accWrite_(map, n); }
      });
      const accounts = [], tomb = {};
      Object.keys(map).forEach(n => { const m = map[n]; if (live_(m)) accounts.push(m.acc); else if (m.deletedAt) tomb[n] = m.deletedAt; });
      return { ok: true, accounts: accounts, deleted: tomb };
    }
    return { ok: false, error: 'Unknown action' };
  } finally { lock.releaseLock(); }
}
