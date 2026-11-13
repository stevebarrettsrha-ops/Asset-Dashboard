/* Offline copy of the site (service worker).
   Every page, script and library is kept on this computer the first time the site opens with internet,
   so Location Records, the Fixed Asset Register, Procurement, Stores and the portal open without internet.
   With internet, pages always load fresh from the website (and the copy is refreshed); records stay in this
   computer's storage and go to Google Drive at the next sync. Google sign-in and Drive are never cached. */
const CACHE = 'mph-site-v1';
const SITE = [
"asset-codes.js",
"asset-intake.html",
"asset-normalizer.js",
"asset-register-safety.js",
"builtin-drive.js",
"builtin-files.json",
"index.html",
"intake/pages/intake.js",
"locations-assets.js",
"locations-seed.js",
"locations.html",
"portal.html",
"portal/portal.css",
"portal/portal.js",
"procurement.html",
"procurement/app.css",
"procurement/assets.js",
"procurement/core.js",
"procurement/pages/admin.js",
"procurement/pages/budget.js",
"procurement/pages/dashboard.js",
"procurement/pages/documents.js",
"procurement/pages/gojform.js",
"procurement/pages/guide.js",
"procurement/pages/import.js",
"procurement/pages/invoices.js",
"procurement/pages/memos.js",
"procurement/pages/orders.js",
"procurement/pages/pdfreports.js",
"procurement/pages/pobook.js",
"procurement/pages/receiving.js",
"procurement/pages/reports.js",
"procurement/pages/reqform.js",
"procurement/pages/requisitions.js",
"procurement/pages/sourcing.js",
"procurement/pages/supplierkpi.js",
"procurement/pages/suppliers.js",
"procurement/pdf.js",
"procurement/report-pdf.js",
"procurement/seed/manifest.js",
"procurement/seed/records-2026.json",
"register-additions.js",
"register-seed.js",
"request.html",
"stores.html",
"stores/pages/admin.js",
"stores/pages/counts.js",
"stores/pages/dashboard.js",
"stores/pages/inbound.js",
"stores/pages/inventory.js",
"stores/pages/issues.js",
"stores/pages/migrate.js",
"stores/pages/pdfreports.js",
"stores/pages/reports.js"
];
const LIBS = [
"https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
"https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
"https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
"https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js",
"https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
"https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js",
"https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx-js-style.min.js",
"https://cdn.jsdelivr.net/npm/otpauth@9.2.1/dist/otpauth.umd.min.js",
"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
"https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Manrope:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap"
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(
    SITE.map(p => c.add(new Request(encodeURI(p), { cache: 'reload' })).catch(() => null))
      .concat(LIBS.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => null)))
  )).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('mph-site-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const NEVER = /(^|\.)googleapis\.com$|accounts\.google\.com$|script\.google(usercontent)?\.com$|oauth2/;
const LIB_HOSTS = /^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), ms)); }
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // The website: fresh from the network when it answers, else the copy on this computer.
    e.respondWith(Promise.race([fetch(req), timeout(req.mode === 'navigate' ? 6000 : 15000)]).then(res => {
      if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(url.pathname === '/' || url.pathname.endsWith('/') ? new Request(url.origin + url.pathname + 'index.html') : new Request(url.origin + url.pathname), copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.open(CACHE).then(c => c.match(url.pathname.endsWith('/') ? url.origin + url.pathname + 'index.html' : url.origin + url.pathname, { ignoreSearch: true }))
      .then(hit => hit || new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><body style="font:16px system-ui;padding:40px;color:#0c2440">This page has not been opened on this computer with internet yet, so it is not available offline.</body>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }))));
    return;
  }
  if (NEVER.test(url.hostname) && !/^fonts\.googleapis\.com$/.test(url.hostname)) return;   // sign-in and Drive: always live
  if (LIB_HOSTS.test(url.hostname)) {
    // Libraries and fonts: the copy on this computer first; fetched (and kept) when missing.
    e.respondWith(caches.open(CACHE).then(c => c.match(req.url).then(hit => hit || fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req.url, res.clone()).catch(() => {}); return res; }))));
  }
});
