/**
 * May Pen Hospital — online requisition receiver (Google Apps Script).
 *
 * Receives requisitions submitted from the public requisition page, keeps each one
 * in this Google Sheet, emails the Procurement Unit, and hands them to the
 * Procurement system (which collects them every couple of minutes).
 *
 * Set-up (once, about 5 minutes):
 *  1. Create a new Google Sheet (e.g. "Online Requisitions") with the Procurement Google account.
 *  2. Extensions → Apps Script. Delete what is there and paste this whole file.
 *  3. Change KEY below to a long secret of your own, and NOTIFY_EMAIL to the address that should be alerted.
 *  4. Deploy → New deployment → type "Web app".
 *     Execute as: Me.   Who has access: Anyone.   → Deploy, and allow the permissions it asks for.
 *  5. Copy the Web app URL. In Procurement → Requisitions → "Online requests", paste the URL and the KEY.
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

/** A requisition submitted from the public page. */
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents || '{}');
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
  if (p.ping) return out_({ ok: true, service: 'mph-requisitions' });
  if (p.key !== KEY) return out_({ ok: false, error: 'Wrong key' });
  const rows = sheet_().getDataRange().getValues().slice(1);
  const since = Number(p.since || 0);
  const items = rows.filter(r => r[0] && new Date(r[1]).getTime() > since).slice(-200).map(r => {
    let data = {}; try { data = JSON.parse(r[6]); } catch (x) { /* row edited by hand */ }
    return { id: r[0], at: new Date(r[1]).getTime(), data: data };
  });
  return out_({ ok: true, items: items });
}
