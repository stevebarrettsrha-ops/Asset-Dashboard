/* View-only access, on every dashboard.
   An account set to "View only" in the portal (User Accounts → Access) can open its dashboards, look
   around, search, filter, print and export — but cannot add, change or delete anything, and its computer
   never uploads to Google Drive. Loaded first (in <head>) so the dashboards can ask MPHViewOnly.on.
   Each dashboard also guards its own saves (procurement/core.js for Procurement, Stores and Assets on
   Order; index.html for the Fixed Asset Register and Location Records). */
(function () {
  'use strict';
  function read(store, k) { try { return JSON.parse(store.getItem(k) || 'null'); } catch (e) { return null; } }
  var s = read(sessionStorage, 'mphPortalSession') || read(localStorage, 'mphPortalSession');
  if (s && !(s.exp > Date.now())) s = null;
  // The latest copy of the account on this computer wins, so a change the Administrator made applies
  // without waiting for the person to sign in again.
  var acct = null;
  if (s) { var list = read(localStorage, 'portalAccountsV2') || []; acct = list.filter(function (a) { return a && a.username === s.username; })[0] || null; }
  var on = !!(s && (acct ? acct.access === 'view' : s.viewOnly));
  var lastNote = 0;
  function note(msg) {
    if (Date.now() - lastNote < 1200) return; lastNote = Date.now();
    var t = document.createElement('div');
    t.className = 'mph-vo-toast'; t.setAttribute('role', 'status');
    t.textContent = msg || 'View only — you can look, print and export, but not add or change anything.';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3800);
  }
  window.MPHViewOnly = { on: on, note: note, user: s ? s.displayName || s.username : '' };
  if (!on) return;
  document.documentElement.classList.add('view-only');
  var css = document.createElement('style');
  css.textContent =
    /* the label */
    '.mph-vo-badge{position:fixed;top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:9995;display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;' +
      'font:600 12.5px/1.2 Inter,-apple-system,Segoe UI,Roboto,sans-serif;background:#1e3a8a;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none;white-space:nowrap}' +
    '.mph-vo-badge.in-bar,.mph-vo-badge.in-banner{position:static;transform:none;box-shadow:none;flex:none}.mph-vo-badge.in-banner{margin-top:6px;background:rgba(30,58,138,.85)}' +
    '@media(max-width:640px){.mph-vo-badge.in-bar{padding:5px 8px}.mph-vo-badge.in-bar span{display:none}}' +
    '.mph-vo-toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:100100;max-width:min(460px,calc(100vw - 24px));padding:11px 16px;border-radius:10px;' +
      'font:500 13.5px/1.35 Inter,-apple-system,Segoe UI,Roboto,sans-serif;background:#1f2937;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.3);text-align:center}' +
    /* Procurement, Stores, Assets on Order: the ways in to adding and changing */
    '.view-only #newBtn,.view-only .sd-acts,.view-only .sd-add,.view-only .sd-hero .row,.view-only .page-head .actions .btn.primary,' +
    '.view-only [data-a=new],.view-only [data-a=adjust],.view-only [data-a=opening],.view-only [data-a=receive],.view-only [data-a=issue],.view-only [data-a=levels],.view-only [data-a=edit],.view-only [data-a=approve],' +
    '.view-only [data-rcv],.view-only [data-iss],.view-only [data-del],.view-only [data-rm],.view-only [data-send],.view-only [data-save],.view-only [data-issue],.view-only #lvSave,.view-only #lvFill,' +
    /* Fixed Asset Register */
    '.view-only .manage-assets-btn,.view-only #saveBtn,.view-only .btn-edit,.view-only .btn-delete-inline,.view-only #deleteAssetBtn,.view-only .modal-footer button[type=submit]{display:none!important}' +
    '';
  (document.head || document.documentElement).appendChild(css);
  var WRITE = /\b(save|delete|remove|import|merge|edit|add|create|assign|transfer|dispos|update|restore|upload|reset|apply|approve|reject|issue|receive|record|submit|register|duplicate|rename|move|split|fix|generate|new|bulk|confirm|execute|commit|clean|normali[sz]e|seed|undo|openAssetModal|openTransfer|openAssign|openImport|openBulk|openDisposal|openEdit|openAdd|openNew)\w*\s*\(/i;
  var SAFE = /^\s*(return\s+)?(export|print|download|search|perform\w*Search|filter|view|close|cancel|toggle|show|hide|preview|refresh|load|goto|navigate|switch|sort|page|clearSearch|clearFilter|dashboard(Shift|Toggle|GoTo)|syncFromLoginPage|openAssetCodePicker|showPage|setView|selectTab|expand|collapse)\w*\s*\(/i;
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[onclick]') : null; if (!el) return;
    var code = el.getAttribute('onclick') || '';
    if (/location\.(hash|href)|history\.back/.test(code) || SAFE.test(code)) return;
    if (WRITE.test(code)) { e.preventDefault(); e.stopImmediatePropagation(); note(); }
  }, true);
  document.addEventListener('change', function (e) { if (e.target && e.target.type === 'file') { e.target.value = ''; e.preventDefault(); e.stopImmediatePropagation(); note(); } }, true);
  document.addEventListener('submit', function (e) { var f = e.target; if (f && f.id !== 'loginForm' && !/search/i.test(f.id || f.className || '')) { e.preventDefault(); e.stopImmediatePropagation(); note(); } }, true);
  function badge() {
    if (document.querySelector('.mph-vo-badge')) return;
    var mk = function () { var b = document.createElement('span'); b.className = 'mph-vo-badge'; b.innerHTML = '&#128065;<span> View only</span>'; b.title = 'You can look, print and export, but not add or change anything'; return b; };
    var bar = document.querySelector('.topbar'), lefts = document.querySelectorAll('.header .header-left');
    if (bar) {   // Procurement, Stores, Assets on Order: in the top bar, before the search box
      var b = mk(); b.classList.add('in-bar'); var g = bar.querySelector('.global-search'); if (g) bar.insertBefore(b, g); else bar.appendChild(b);
    } else if (lefts.length) {   // Fixed Asset Register: in the orange banner of every page
      Array.prototype.forEach.call(lefts, function (l) { var b = mk(); b.classList.add('in-banner'); l.appendChild(b); });
    } else document.body.appendChild(mk());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', badge); else badge();
})();
