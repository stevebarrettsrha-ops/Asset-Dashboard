/* Back to where you came from — on every dashboard page.
   Opening Assets on Order, Stores or the Fixed Asset Register from a link in Procurement (or any other
   dashboard) left no way back. This remembers, per browser tab, which dashboard sent you here and shows
   "← Back to Procurement". When you arrived some other way and this is not your own dashboard, it shows
   "← My dashboard" (the dashboard of the badge you signed in with). */
(function () {
  'use strict';
  if (window.top !== window) return;   // pages shown inside another page (Location Records inside the register)
  var APPS = {
    'procurement.html': 'Procurement',
    'stores.html': 'General Stores',
    'asset-intake.html': 'Assets on Order',
    'index.html': 'Fixed Asset Register',
    'locations.html': 'Location Records',
    'portal.html': 'Portal'
  };
  var HOME = { procurement: 'procurement.html', stores: 'stores.html', assets: 'index.html', admin: 'portal.html#console', operations: 'portal.html#hub' };
  var HOME_LABEL = { admin: 'Admin console', operations: 'Operations overview' };
  var LAST = 'mphLastPage', BACKING = 'mphBackNav';
  function page(p) { var f = String(p || '').split('?')[0].split('#')[0].split('/').pop(); return f || 'index.html'; }
  var here = page(location.pathname);
  if (!APPS[here]) return;
  function get(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function put(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }

  // Where this tab was before this page (recorded by the previous page as it was left).
  var last = get(LAST), backing = get(BACKING);
  put(BACKING, null);
  var key = 'mphOrigin:' + here;
  if (last && last.app && last.app !== here && APPS[last.app] && last.app !== 'portal.html') {
    // Arrived from another dashboard. Coming back with the Back button does not start a new trail.
    if (backing && backing.to === here) put(key, null); else put(key, { app: last.app, url: last.url });
  }
  // Remember this page (with its current #route) for the next one.
  function remember() { put(LAST, { app: here, url: location.pathname.split('/').pop() + location.search + location.hash }); }
  window.addEventListener('pagehide', remember);
  window.addEventListener('beforeunload', remember);
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a) remember(); }, true);

  function session() {
    try { var s = JSON.parse(sessionStorage.getItem('mphPortalSession') || localStorage.getItem('mphPortalSession') || 'null'); return s && s.exp > Date.now() ? s : null; } catch (e) { return null; }
  }
  function target() {
    var o = get(key);
    if (o && o.app && o.app !== here) return { url: o.url || o.app, label: 'Back to ' + APPS[o.app], origin: true };
    var s = session(); if (!s) return null;
    var card = s.card || s.role, home = HOME[card];
    if (!home || page(home) === here) return null;
    return { url: home, label: 'My dashboard' + (HOME_LABEL[card] ? ' (' + HOME_LABEL[card] + ')' : APPS[page(home)] ? ' (' + APPS[page(home)] + ')' : ''), origin: false };
  }
  function go(t) {
    put(BACKING, { to: page(t.url) });
    put(key, null);
    try { sessionStorage.setItem('mphEnter:' + page(t.url), '1'); } catch (e) { /* ignore */ }   // let the dashboard in without asking again
    location.href = t.url;
  }
  var ARROW = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>';
  function render() {
    if (here === 'portal.html') return;   // the portal only records where this tab was
    var old = document.getElementById('mphBack'); if (old) old.remove();
    Array.prototype.forEach.call(document.querySelectorAll('.mph-back-inline'), function (x) { x.remove(); });
    var t = target(); if (!t) return;
    var b = document.createElement('button');
    b.id = 'mphBack'; b.type = 'button'; b.title = t.label;
    b.innerHTML = ARROW + '<span class="mph-l">' + t.label + '</span><span class="mph-s">' + (t.origin ? 'Back' : 'Home') + '</span>';
    b.setAttribute('aria-label', t.label);
    b.onclick = function () { go(t); };
    var bar = document.querySelector('.topbar');
    if (bar) {
      // Procurement, Stores, Assets on Order: in the top bar, after the menu button
      b.className = 'btn mph-back-top';
      var menu = document.getElementById('menuBtn');
      if (menu && menu.parentNode === bar) menu.insertAdjacentElement('afterend', b); else bar.insertBefore(b, bar.firstChild);
    } else if (document.querySelector('.header .header-left')) {
      // Fixed Asset Register: inside the orange banner of every page, above the title
      Array.prototype.forEach.call(document.querySelectorAll('.header .header-left'), function (left, i) {
        var c = i ? b.cloneNode(true) : b;
        if (i) c.removeAttribute('id');
        c.className = 'mph-back-inline';
        c.onclick = function () { go(t); };
        left.insertBefore(c, left.firstChild);
      });
    } else {
      // Location Records: a floating button
      b.className = 'mph-back-float';
      document.body.appendChild(b);
    }
  }
  var css = document.createElement('style');
  css.textContent =
    '.mph-back-top{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font-weight:600;border-color:var(--primary);color:var(--primary);background:var(--primary-50)}' +
    '.mph-back-top:hover{background:var(--primary-100)}' +
    '.mph-back-float{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:9985;display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;border:0;cursor:pointer;' +
      'font:600 14px/1.2 Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;background:#1f2937;box-shadow:0 8px 24px rgba(0,0,0,.28)}' +
    '.mph-back-float:hover{background:#111827}' +
    '.mph-back-inline{display:inline-flex;align-items:center;gap:6px;margin:0 0 6px;padding:5px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.18);color:#fff;font:600 13px/1.2 inherit;font-family:inherit;cursor:pointer;white-space:nowrap;max-width:100%}' +
    '.mph-back-inline:hover{background:rgba(255,255,255,.3)}' +
    '.mph-back-inline span{overflow:hidden;text-overflow:ellipsis}' +
    'body:has(.sidebar.mobile-open) .mph-back-float{display:none}' +
    'body:has(#mphSyncBar) .mph-back-float{bottom:calc(150px + env(safe-area-inset-bottom))}' +
    '.mph-s{display:none}' +
    '@media(max-width:640px){.mph-back-top .mph-l{display:none}.mph-back-top .mph-s{display:inline}.mph-back-top{padding:0 10px;flex:none}.mph-back-float{left:10px;bottom:calc(10px + env(safe-area-inset-bottom));padding:9px 14px;font-size:13px}}' +
    '@media print{.mph-back-top,.mph-back-float,.mph-back-inline{display:none!important}}';
  function start() { document.head.appendChild(css); render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.MPHBackNav = { refresh: render };
})();
