/* ==========================================================================
   Procurement Management System — core
   Shared by every page module (procurement/pages/*.js):
     Proc.util    formatting, ids, dates, escaping
     Proc.K       reference lists (PRS methods, types, terms, statuses…)
     Proc.store   records: list/get/upsert/remove, persistence, change events
     Proc.files   document blobs (IndexedDB) + optional Google Drive copy
     Proc.domain  procurement rules: approval routing, amount in words,
                  supplier matching, price comparison maths, memo/PO builders
     Proc.ui      icons, toasts, modals, confirm, data tables, charts, drop zones
     Proc.router  hash routes (#/suppliers/SUP-…) and the navigation
     Proc.auth    login (Google Sheet, portal accounts, default account)
     Proc.sync    Google Drive backup/merge
   ========================================================================== */
(function () {
  'use strict';
  const Proc = window.Proc = window.Proc || {};
  /** Which app this page is. procurement.html, stores.html and asset-intake.html share the same records. */
  const APP = Proc.APP = Object.assign({ id: 'procurement', system: 'procurement', name: 'Procurement', defaultUser: 'procurement', profileWhere: 'memos and purchase orders' }, window.PROC_APP || {});
  APP.audience = APP.system === 'intake' ? 'assets' : APP.system; // who notifications for this app are addressed to
  Proc.APP_URLS = { procurement: 'procurement.html', stores: 'stores.html', intake: 'asset-intake.html', assets: 'index.html' };

  /* ------------------------------------------------------------------ util */
  const util = Proc.util = {};
  util.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  util.uid = function (prefix) {
    return (prefix ? prefix + '-' : '') + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  };
  util.round2 = n => Math.round((Number(n) || 0) * 100) / 100;
  util.num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v === null || v === undefined) return 0;
    const n = parseFloat(String(v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
    return isFinite(n) ? n : 0;
  };
  util.money = function (n, opts) {
    opts = opts || {};
    const v = Number(n) || 0;
    const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: opts.noCents ? 0 : 2, maximumFractionDigits: opts.noCents ? 0 : 2 });
    return (v < 0 ? '-' : '') + '$' + s;
  };
  util.moneyShort = function (n) {
    const v = Number(n) || 0, a = Math.abs(v);
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (a >= 1e3) return '$' + (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
    return '$' + v.toFixed(0);
  };
  util.int = n => (Number(n) || 0).toLocaleString('en-US');
  util.today = function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  util.toISODate = function (v) {
    if (!v) return '';
    if (v instanceof Date) {
      if (isNaN(v)) return '';
      return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    }
    if (typeof v === 'number') { // Excel serial date
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    }
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); // dd/mm/yyyy (Jamaica)
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return y + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0'); }
    const d = new Date(s);
    return isNaN(d) ? '' : util.toISODate(d);
  };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  util.MONTHS = MONTHS;
  util.parseDate = function (iso) { if (!iso) return null; const p = String(iso).slice(0, 10).split('-'); if (p.length < 3) return null; return new Date(+p[0], +p[1] - 1, +p[2]); };
  util.date = function (iso) { const d = util.parseDate(iso); if (!d || isNaN(d)) return ''; return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); };
  util.dateLong = function (iso) { const d = util.parseDate(iso); if (!d || isNaN(d)) return ''; return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); };
  util.dateTime = function (ts) { const d = new Date(ts); if (isNaN(d)) return ''; return util.date(util.toISODate(d)) + ' ' + d.toTimeString().slice(0, 5); };
  util.ago = function (ts) {
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (!isFinite(s)) return '';
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
    return util.date(util.toISODate(new Date(ts)));
  };
  util.daysBetween = function (a, b) { const x = util.parseDate(a), y = util.parseDate(b); if (!x || !y) return null; return Math.round((y - x) / 86400000); };
  util.addDays = function (iso, n) { const d = util.parseDate(iso) || new Date(); d.setDate(d.getDate() + n); return util.toISODate(d); };
  /** Government fiscal year runs April–March. Returns e.g. "2026/27". */
  util.fiscalYear = function (iso) {
    const d = util.parseDate(iso) || new Date();
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return y + '/' + String((y + 1) % 100).padStart(2, '0');
  };
  util.fyRange = function (fy) { const y = parseInt(fy, 10); return { start: y + '-04-01', end: (y + 1) + '-03-31' }; };
  util.monthKey = iso => (iso || '').slice(0, 7);
  util.monthLabel = function (key) { if (!key) return ''; const [y, m] = key.split('-'); return MONTHS[+m - 1].slice(0, 3) + ' ' + y; };
  util.debounce = function (fn, ms) { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms); }; };
  util.initials = function (name) {
    const parts = String(name || '?').replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, '').split(/\s+/).filter(Boolean);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  };
  util.plural = (n, one, many) => (n === 1 ? one : (many || one + 's'));
  util.fileSize = function (b) { if (!b) return '0 KB'; if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB'; return (b / 1024 / 1024).toFixed(1) + ' MB'; };
  util.sum = (arr, fn) => arr.reduce((s, x) => s + (Number(fn ? fn(x) : x) || 0), 0);
  util.groupBy = function (arr, fn) { const m = {}; arr.forEach(x => { const k = fn(x); (m[k] = m[k] || []).push(x); }); return m; };
  util.clone = o => JSON.parse(JSON.stringify(o));
  util.download = function (blob, filename) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  util.csv = function (headers, rows) {
    const q = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [headers.map(q).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\n');
  };
  util.slug = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 18);
  util.titleCase = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());

  /* ------------------------------------------------------- reference lists */
  const K = Proc.K = {};
  /** Procurement methods exactly as the Ministry of Finance PRS lists them. */
  K.METHODS = ['Single Source (SS)', 'Restricted Bidding (RB)', 'Request for Quotations', 'Open - NCB', 'Open - ICB', 'Framework Agreement',
    'Request for Proposals with Consecutive Negotiation', 'Request for Proposals without Negotiation'];
  K.METHOD_NAME = { // wording used in memo sentences ("The ___ Methodology was utilized")
    'Single Source (SS)': 'Single Source', 'Restricted Bidding (RB)': 'Restricted Bidding', 'Request for Quotations': 'Request for Quotations',
    'Open - NCB': 'Open National Competitive Bidding', 'Open - ICB': 'Open International Competitive Bidding', 'Framework Agreement': 'Framework Agreement',
    'Request for Proposals with Consecutive Negotiation': 'Request for Proposals', 'Request for Proposals without Negotiation': 'Request for Proposals'
  };
  K.METHOD_SHORT = { 'Single Source (SS)': 'SS', 'Restricted Bidding (RB)': 'RB', 'Request for Quotations': 'RFQ', 'Open - NCB': 'NCB', 'Open - ICB': 'ICB',
    'Framework Agreement': 'FA', 'Request for Proposals with Consecutive Negotiation': 'RFP', 'Request for Proposals without Negotiation': 'RFP' };
  K.TYPES = ['Goods', 'Services', 'Works', 'Exempt'];
  K.PRIORITIES = ['Normal', 'Emergency'];
  K.TERMS = ['Cash before delivery', 'Deposit %', 'Pay on receipt of Invoice', '7 days credit', '14 days credit', '21 days credit', '30 days credit', '60 days credit', '90 days credit', 'Other'];
  K.PARISHES = ['Clarendon', 'Hanover', 'Kingston', 'Manchester', 'Portland', 'St. Andrew', 'St. Ann', 'St. Catherine', 'St. Elizabeth', 'St. James', 'St. Mary', 'St. Thomas', 'Trelawny', 'Westmoreland'];
  K.RETENDER_REASONS = ['All bids non-responsive', 'Awarded supplier refused to enter into contract', 'Bid price exceeding comparable estimate', 'Cancelled by PPC or Cabinet due to procedural irregularity',
    'Change in bill of quantities', 'Incorrect specification', 'Material irregularities in tender documents issued by Procuring Entity', 'No bid received', 'OTHER', 'Re-scoping of requirements', 'VFM cannot be achieved'];
  K.DOC_KINDS = ['Quotation', 'Purchase Order', 'Invoice', 'Delivery Note / GRN', 'Approval Memo', 'Evaluation Report', 'Contract', 'Tax Compliance Certificate', 'PPC / NCC Registration', 'Business Registration', 'Monthly Report', 'Budget Approval', 'Template', 'Reference', 'Other'];
  K.REQ_STATUSES = ['Draft', 'Submitted', 'Approved', 'Sourcing', 'Awarded', 'Ordered', 'Completed', 'Rejected', 'Cancelled'];
  K.CMP_STATUSES = ['Open', 'Evaluated', 'Memo Prepared', 'Approved', 'Ordered', 'Cancelled'];
  K.MEMO_STATUSES = ['Draft', 'Submitted', 'Approved', 'Rejected'];
  K.PO_STATUSES = ['Draft', 'Issued', 'Partially Delivered', 'Delivered', 'Invoiced', 'Paid', 'Closed', 'Cancelled'];
  K.INV_STATUSES = ['Pending', 'Certified', 'Paid', 'Disputed'];
  K.SUPPLIER_STATUSES = ['Active', 'Inactive', 'Suspended', 'Debarred'];
  K.UNITS = ['each', 'pk', 'box', 'case', 'ctn', 'bottle', 'roll', 'pair', 'set', 'kg', 'lb', 'litre', 'gallon', 'drum', 'bag', 'doz', 'ream', 'lot', 'job', 'month'];
  /** Status → badge colour. Pages call Proc.ui.badge(status). */
  K.STATUS_TONE = {
    Draft: '', Submitted: 'warning', Approved: 'success', Sourcing: 'info', Awarded: 'purple', Ordered: 'primary', Completed: 'success', Rejected: 'danger', Cancelled: '',
    Open: 'info', Evaluated: 'purple', 'Memo Prepared': 'warning', Issued: 'primary', 'Partially Delivered': 'warning', Delivered: 'info', Invoiced: 'purple',
    Paid: 'success', Closed: '', Pending: 'warning', Certified: 'info', Disputed: 'danger', Overdue: 'danger',
    Active: 'success', Inactive: '', Suspended: 'warning', Debarred: 'danger', Expired: 'danger', 'Expiring': 'warning', Valid: 'success', Emergency: 'danger', Normal: ''
  };
  K.DEMO_SUPPLIER_NAMES = ['Jamaica Medical Supplies Ltd', 'Caribbean Office Solutions', 'TechIsland Systems'];

  /* ------------------------------------------------------------- defaults */
  const DEFAULT_SETTINGS = {
    org: {
      hospital: 'May Pen Hospital', authority: 'Southern Regional Health Authority', parishServices: 'Clarendon Health Services',
      publicBody: 'May Pen Hospital', refCode: 'MPH', parish: 'Clarendon',
      address: '1 Muirhead Ave., May Pen, Clarendon, Jamaica WI', tel: '(876) 986-2528/7708/6938', fax: '(876) 986-2650', website: 'www.srha.gov.jm',
      values: 'Compassion | Accountability | Respect | Efficiency', deliveryAddress: 'May Pen Hospital, 1 Muirhead Avenue, May Pen, Clarendon'
    },
    signatories: {
      committee: { name: 'Parish Procurement Committee', org: 'Clarendon Health Services' },
      parishManager: { name: 'Mr. Joseph Grant', title: 'Parish Manager', org: 'Clarendon Health Services' },
      ceo: { name: 'Mrs. Eugena Clarke-James', title: 'Chief Executive Officer', org: 'May Pen Hospital' },
      regionalDirector: { name: 'Mr. Michael Bent', title: 'Regional Director', org: 'Southern Regional Health Authority' }
    },
    limits: {
      committeeMin: 1500000,  // Handbook §2.2.5(i): committee reviews from no higher than $1.5M
      delegated: 2000000,     // Parish Manager's delegated approving authority (approval letters)
      ncc: 15000000,          // Handbook §2.4: above $15M needs NCC/PPC endorsement
      cabinet: 40000000       // Handbook §2.4: above $40M needs Cabinet approval
    },
    gctRate: 0.15,
    memo: { approvalBlock: true },
    letterhead: {
      footer: 'Chairman: Michael Stern; Vice Chairman: Simone Scarlett, Board Members: Wayne Chen, Lorraine Green Mason, Marcus Greenwood, Winston Maragh, Dr. Lloyd Reynolds, Omar Miller, Denise Edwards, Sherill Morgan, Permanent Secretary’s Nominee: Howard Lynch, Regional Director and Secretary: Michael Bent; Regional Technical Director: Dr. Vitillius Holder; CEO, Mandeville Regional Hospital: Alwyn Miller; SMO, Mandeville Regional Hospital: Dr. Everton McIntosh',
      facilities: [
        ['Mandeville Reg. Hospital', '32 Hargreaves Avenue', 'Mandeville', 'Ph: (876) 962-2067/2744/1094', 'Fax: (876) 625-8493'],
        ['May Pen Hospital', '1 Muirhead Avenue', 'May Pen', 'Ph: (876) 986-2528/7708/6938', 'Fax: (876) 986-2650'],
        ['Black River Hospital', '45 High Street', 'Black River', 'Ph: (876) 965-2224/2212', '       (876) 634-3700', 'Fax: (876) 965-9294'],
        ['Percy Junor Hospital', 'Spalding P.O.', 'Clarendon', 'Ph: (876) 964-1181/2222/2322', 'Fax: (876) 964-1548'],
        ['Lionel Town Hospital', 'Bustamante Drive', 'Vere, Clarendon', 'Ph: (876) 986-3226', 'Fax: (876) 986-3373'],
        ['Chapelton Hospital', 'Chapelton P.O.', 'Clarendon', 'Ph: (876) 987-2215'],
        ['Manchester Health Dept.', '5-7 Ward Avenue', 'Mandeville', 'Ph: (876) 962-2288/7033', '       (876) 625-3433', 'Fax: (876) 962-2171'],
        ['Clarendon Health Dept.', '1-3 Jackson St. Denbigh', 'May Pen', 'Ph: (876) 986-7869', 'Fax: (876) 986-9713'],
        ['St. Elizabeth Health Dept', '1 Brigade Street', 'Black River', 'Ph: (876) 965-9174-5', 'Fax: (876) 965-2701']
      ]
    },
    officers: {},              // username -> { name: 'Ms. Christine Crawford', title: 'Public Procurement Officer' }
    counters: { req: 1000, po: 0, memo: 0, cmp: 0, grn: 0, siv: 0, itm: 0, cnt: 0, rtn: 0, adj: 0 },
    /** General Stores and Fixed Asset intake */
    stores: {
      storeName: 'General Stores',
      leadDays: 14,             // expected delivery = PO date + this, unless the PO gives a date
      assetThreshold: 50000,    // a line at or above this unit price is treated as a fixed asset (unless it is a service)
      expiryWarnDays: 90,
      locations: ['Main Store', 'Shelf A', 'Shelf B', 'Shelf C', 'Cold Room', 'Bulk Store'],
      categories: ['Medical Supplies', 'Laboratory Supplies', 'Cleaning & Sanitation', 'Office & Stationery', 'Kitchen / Dietary', 'Linen & Bedding', 'Maintenance & Electrical', 'Personal Protective Equipment', 'IT Consumables', 'General'],
      assetKeywords: '',        // extra words that mark a line as an asset (comma separated)
      serviceKeywords: ''       // extra words that mark a line as a service
    },
    poPrefix: '',              // official PO numbers are typed in (e.g. 1124590); prefix only for system-generated drafts
    updatedAt: 0
  };
  Proc.DEFAULT_SETTINGS = DEFAULT_SETTINGS;

  /* ----------------------------------------------------------------- store */
  const STORAGE_KEY = 'procurementData';
  const IDB_NAME = 'ProcurementDB';
  const IDB_VERSION = 2;               // v2 adds the "files" store for documents
  const COLLECTIONS = ['suppliers', 'requisitions', 'comparisons', 'memos', 'purchaseOrders', 'deliveries', 'invoices', 'documents', 'plans', 'poBooks',
    'stockItems', 'stockMoves', 'stockIssues', 'stockCounts', 'supplierReturns', 'assetRegistrations', 'notifications', 'budgetLines', 'budgetMonths', 'prsLite'];
  const ID_PREFIX = { suppliers: 'SUP', requisitions: 'REQ', comparisons: 'CMP', memos: 'MEMO', purchaseOrders: 'PO', deliveries: 'GRN', invoices: 'INV', documents: 'DOC', plans: 'PLAN', poBooks: 'BOOK',
    stockItems: 'ITM', stockMoves: 'MOV', stockIssues: 'SIV', stockCounts: 'CNT', supplierReturns: 'RTN', assetRegistrations: 'AREG', notifications: 'NTF', budgetLines: 'BL', budgetMonths: 'BM', prsLite: 'PRSL' };
  const listeners = {};
  let idbPromise = null;
  let saveTimer = null;
  let suppressEmit = 0;
  let pendingEvents = [];

  function openIDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      };
      req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
      req.onerror = () => { idbPromise = null; reject(req.error); };
      req.onblocked = () => console.warn('[Proc] IndexedDB upgrade blocked by another open tab');
    });
    return idbPromise;
  }
  function idb(storeName, mode, fn) {
    return openIDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const st = tx.objectStore(storeName);
      let result;
      const r = fn(st);
      if (r && typeof r === 'object' && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
      else result = r;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  function emptyDb() {
    const db = { schemaVersion: 2, settings: util.clone(DEFAULT_SETTINGS), auditLog: [], tombstones: {} };
    COLLECTIONS.forEach(c => { db[c] = []; });
    return db;
  }

  function deepDefaults(target, defaults) {
    Object.keys(defaults).forEach(k => {
      const dv = defaults[k];
      if (target[k] === undefined || target[k] === null) target[k] = util.clone(dv);
      else if (dv && typeof dv === 'object' && !Array.isArray(dv) && typeof target[k] === 'object' && !Array.isArray(target[k])) deepDefaults(target[k], dv);
    });
    return target;
  }

  /** Upgrade data saved by the original procurement page (no schemaVersion). */
  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return emptyDb();
    if (raw.schemaVersion >= 2) {
      const db = raw;
      COLLECTIONS.forEach(c => { if (!Array.isArray(db[c])) db[c] = []; });
      if (!Array.isArray(db.auditLog)) db.auditLog = [];
      if (!db.tombstones) db.tombstones = {};
      db.settings = deepDefaults(db.settings || {}, DEFAULT_SETTINGS);
      return db;
    }
    const db = emptyDb();
    const now = Date.now();
    // updatedAt 1: converted old-format records never win over a real edit when copies are merged (e.g. a stale old page still syncing).
    const stamp = r => Object.assign(r, { createdAt: r.createdAt || new Date(now).toISOString(), updatedAt: 1 });
    const legacyPOs = Array.isArray(raw.purchaseOrders) ? raw.purchaseOrders : [];
    const usedSupplierIds = new Set(legacyPOs.map(p => p && p.supplier && p.supplier.id).filter(Boolean));
    (raw.suppliers || []).forEach(s => {
      if (!s || !s.name) return;
      if (K.DEMO_SUPPLIER_NAMES.indexOf(s.name) >= 0 && !usedSupplierIds.has(s.id)) return; // seeded sample rows
      db.suppliers.push(stamp({
        id: s.id || util.uid('SUP'), name: s.name, trn: s.trn || '', contactPerson: s.contact || '', phone: s.phone || '', email: s.email || '',
        address: s.address || '', categories: s.category ? [s.category] : [], ppcRegistered: s.ncc === 'Yes' ? 'Yes' : (s.ncc === 'Pending' ? 'Pending' : 'No'),
        country: 'Jamaica', status: 'Active'
      }));
    });
    (raw.requisitions || []).forEach(r => {
      if (!r || !r.id) return;
      const items = (r.items || []).map(i => ({ id: util.uid('L'), description: i.description, unit: i.unit, qty: util.num(i.qty), estUnitPrice: util.num(i.unitPrice) }));
      db.requisitions.push(stamp({
        id: r.id, number: r.id, date: r.date || '', department: r.department || '', requestedBy: r.requestedBy || '', priority: r.priority === 'Emergency' ? 'Emergency' : 'Normal',
        title: (items[0] && items[0].description) || 'Requisition', items, estimate: util.num(r.totalValue), budgetLine: r.budgetLine || '', justification: r.justification || '',
        method: K.METHODS.indexOf(r.method) >= 0 ? r.method : '', legacyMethod: K.METHODS.indexOf(r.method) >= 0 ? '' : (r.method || ''),
        status: ({ 'Quotation Requested': 'Sourcing', Evaluated: 'Awarded', 'PO Issued': 'Ordered' })[r.status] || (K.REQ_STATUSES.indexOf(r.status) >= 0 ? r.status : 'Submitted')
      }));
    });
    legacyPOs.forEach(p => {
      if (!p || !p.id) return;
      let sid = p.supplier && p.supplier.id;
      if (sid && !db.suppliers.find(s => s.id === sid) && p.supplier.name) db.suppliers.push(stamp({ id: sid, name: p.supplier.name, categories: [], status: 'Active', country: 'Jamaica' }));
      db.purchaseOrders.push(stamp({
        id: p.id, poNumber: p.id, date: p.date || '', supplierId: sid || '', supplierName: (p.supplier && p.supplier.name) || '', requisitionId: p.requisitionRef || '',
        description: (p.items && p.items[0] && p.items[0].description) || '', items: (p.items || []).map(i => ({ description: i.description, unit: i.unit, qty: util.num(i.qty), unitPrice: util.num(i.unitPrice), total: util.num(i.total) })),
        subtotal: util.num(p.totalValue), gct: util.num(p.gctAmount), total: util.num(p.grandTotal || p.totalValue), deliveryAddress: p.deliveryAddress || '', paymentTerms: p.paymentTerms || '',
        instructions: p.instructions || '', status: K.PO_STATUSES.indexOf(p.status) >= 0 ? p.status : 'Issued', source: 'legacy'
      }));
    });
    (raw.deliveries || []).forEach(d => { if (d && d.poId) db.deliveries.push(stamp({ id: d.id || util.uid('GRN'), poId: d.poId, date: d.date, grn: d.grn, receivedBy: d.receivedBy, condition: d.condition, notes: d.notes })); });
    (raw.invoices || []).forEach(i => {
      if (!i || !i.poId) return;
      const po = db.purchaseOrders.find(p => p.id === i.poId);
      db.invoices.push(stamp({ id: i.id || util.uid('INV'), poId: i.poId, supplierId: po ? po.supplierId : '', invoiceNumber: i.invoiceNumber, date: i.date, amount: util.num(i.amount), gct: util.num(i.gctAmount),
        total: util.num(i.totalAmount), dueDate: i.dueDate || '', status: i.status === 'Paid' ? 'Paid' : 'Pending', paidDate: i.paidDate || '', notes: i.notes || '' }));
    });
    db.auditLog = Array.isArray(raw.auditLog) ? raw.auditLog.slice(0, 2000) : [];
    if (raw.reqCounter) db.settings.counters.req = Math.max(db.settings.counters.req, raw.reqCounter);
    if ((raw.quotations || []).length || (raw.evaluations || []).length) db.legacy = { quotations: raw.quotations || [], evaluations: raw.evaluations || [] };
    db.migratedFrom = 1;
    return db;
  }

  const store = Proc.store = {
    db: emptyDb(),
    ready: null,
    COLLECTIONS,
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => { listeners[evt] = listeners[evt].filter(f => f !== fn); }; },
    emit(evt, payload) {
      if (evt === 'change' && suppressEmit) { pendingEvents.push(payload); return; }
      (listeners[evt] || []).slice().forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
    },
    /** Run many writes and emit one change event at the end. */
    batch(fn) {
      suppressEmit++;
      try { return fn(); } finally {
        suppressEmit--;
        if (!suppressEmit && pendingEvents.length) { const ev = pendingEvents; pendingEvents = []; store.emit('change', { batch: ev }); }
      }
    },
    list(coll) { return (store.db[coll] || []).filter(r => !r._deleted); },
    get(coll, id) { if (!id) return null; return (store.db[coll] || []).find(r => r.id === id && !r._deleted) || null; },
    find(coll, pred) { return store.list(coll).find(pred) || null; },
    filter(coll, pred) { return store.list(coll).filter(pred); },
    upsert(coll, rec, opts) {
      opts = opts || {};
      if (!store.db[coll]) store.db[coll] = [];
      const arr = store.db[coll];
      const now = Date.now();
      if (!rec.id) rec.id = util.uid(ID_PREFIX[coll] || 'REC');
      const idx = arr.findIndex(r => r.id === rec.id);
      if (idx >= 0) {
        const merged = Object.assign(arr[idx], rec, { updatedAt: now, updatedBy: Proc.auth.userName() });
        delete merged._deleted;
        rec = merged;
      } else {
        rec.createdAt = rec.createdAt || new Date(now).toISOString();
        rec.createdBy = rec.createdBy || Proc.auth.userName();
        rec.updatedAt = now;
        arr.push(rec);
      }
      if (store.db.tombstones[coll]) delete store.db.tombstones[coll][rec.id];
      store.save();
      if (!opts.silent) store.emit('change', { coll, id: rec.id, action: idx >= 0 ? 'update' : 'create' });
      return rec;
    },
    remove(coll, id) {
      const arr = store.db[coll] || [];
      const idx = arr.findIndex(r => r.id === id);
      if (idx < 0) return;
      arr.splice(idx, 1);
      (store.db.tombstones[coll] = store.db.tombstones[coll] || {})[id] = Date.now();
      store.save();
      store.emit('change', { coll, id, action: 'delete' });
    },
    settings() { return store.db.settings; },
    saveSettings(patch) {
      Object.assign(store.db.settings, patch || {});
      store.db.settings.updatedAt = Date.now();
      store.save();
      store.emit('change', { coll: 'settings' });
    },
    /** Next sequential number for a counter key (req, memo, cmp, grn…). Shared across open tabs so numbers never repeat. */
    next(counter) {
      const c = store.db.settings.counters;
      let shared = {};
      try { shared = JSON.parse(localStorage.getItem(COUNTER_KEY) || '{}') || {}; } catch (e) { shared = {}; }
      c[counter] = Math.max(c[counter] || 0, shared[counter] || 0) + 1;
      shared[counter] = c[counter];
      try { localStorage.setItem(COUNTER_KEY, JSON.stringify(shared)); } catch (e) { /* the record still carries the counter */ }
      store.save();
      return c[counter];
    },
    save() {
      pendingSave = true;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(store.flush, 150);
    },
    /** Write now. Other tabs' saves are merged in first (in the same transaction), so no tab overwrites another's work. */
    flush() {
      clearTimeout(saveTimer);
      pendingSave = false;
      return persist();
    },
    load() {
      let cached = null, rawCache = null;
      try { rawCache = localStorage.getItem(STORAGE_KEY); if (rawCache) cached = JSON.parse(rawCache); } catch (e) { cached = null; }
      // Keep the original once, before the old page's data is converted.
      if (cached && !(cached.schemaVersion >= 2)) { try { if (!localStorage.getItem(STORAGE_KEY + '_v1_backup')) localStorage.setItem(STORAGE_KEY + '_v1_backup', rawCache); } catch (e) { /* IndexedDB copy below */ } }
      store.db = migrate(cached);
      store.ready = idb('kv', 'readonly', st => st.get(STORAGE_KEY)).then(async durable => {
        if (durable && !(durable.schemaVersion >= 2)) await idb('kv', 'readwrite', st => st.put(durable, STORAGE_KEY + '_v1_backup')).catch(() => {});
        if (durable) {
          // Merge the database copy and the browser cache record by record (newest wins) rather than choosing one.
          const base = migrate(durable);
          if (cached) mergeInto(base, store.db);
          store.db = base;
        }
        lastSeenSavedAt = store.db._savedAt || 0;
        if (store.db.migratedFrom === 1) { delete store.db.migratedFrom; store.db._migratedAt = Date.now(); }
        await store.flush();
        store.emit('change', { coll: '*', action: 'load' });
      }).catch(e => { console.warn('[Proc] IndexedDB unavailable; using browser cache only', e); idbBroken = true; });
      return store.ready;
    },
    exportJSON() { return JSON.stringify({ version: '2.0', type: 'procurement', exportedAt: new Date().toISOString(), data: store.db }, null, 1); },
    /** Merge another copy of the data (backup file or Drive). Newest record wins; deletions travel as tombstones. */
    merge(other) {
      const changed = mergeInto(store.db, migrate(util.clone(other && other.data ? other.data : other)));
      if (changed) { store.save(); store.emit('change', { coll: '*', action: 'merge' }); }
      return changed;
    },
    /** Daily copies of the data kept on this computer (last 14 days). */
    snapshots: {
      async list() { const keys = await idb('kv', 'readonly', st => st.getAllKeys()).catch(() => []); return (keys || []).filter(k => /^snapshot-\d{4}-\d{2}-\d{2}$/.test(k)).map(k => k.slice(9)).sort().reverse(); },
      get(day) { return idb('kv', 'readonly', st => st.get('snapshot-' + day)); },
      async restore(day) { const d = await store.snapshots.get(day); if (!d) throw new Error('No copy for ' + day); return store.merge(d); },
      /** Records in the copy that were deleted here since (blocked by a newer deletion mark). */
      async deleted(day) {
        const d = await store.snapshots.get(day); if (!d) throw new Error('No copy for ' + day);
        const copy = migrate(util.clone(d)), out = {};
        COLLECTIONS.forEach(c => {
          if (c === 'notifications') return;
          const here = new Set((store.db[c] || []).map(r => r.id)), tomb = (store.db.tombstones || {})[c] || {};
          const gone = (copy[c] || []).filter(r => r && r.id && !here.has(r.id) && tomb[r.id]);
          if (gone.length) out[c] = gone;
        });
        return out;
      },
      /** Bring back records deleted since the copy was made (they are re-saved as new edits so the undelete travels to other computers). */
      async undelete(day, colls) {
        const found = await store.snapshots.deleted(day); let n = 0; const now = Date.now();
        Object.keys(found).forEach(c => {
          if (colls && colls.indexOf(c) < 0) return;
          found[c].forEach(r => {
            if (store.db.tombstones[c]) delete store.db.tombstones[c][r.id];
            r.updatedAt = now; r.updatedBy = Proc.auth.userName(); delete r._deleted;
            (store.db[c] = store.db[c] || []).push(r); n++;
          });
        });
        if (n) { store.save(); store.emit('change', { coll: '*', action: 'merge' }); }
        return n;
      },
      async download(day) { const d = await store.snapshots.get(day); if (!d) throw new Error('No copy for ' + day); util.download(new Blob([JSON.stringify({ version: '2.0', type: 'procurement', exportedAt: day, data: d })], { type: 'application/json' }), 'procurement-backup-' + day + '.json'); }
    }
  };

  /* ---------------- persistence helpers */
  const COUNTER_KEY = 'procurementCounters';
  const TAB_ID = util.uid('TAB');
  let pendingSave = false, lastSeenSavedAt = 0, idbBroken = false, lastSnapshotDay = '', saveErrorShownAt = 0;
  let channel = null;
  try { channel = new BroadcastChannel('procurementData'); } catch (e) { channel = null; }

  /** Merge `incoming` (an already-migrated dataset) into `target`. Returns the number of changes. */
  function mergeInto(target, incoming) {
    let changed = 0;
    target.tombstones = target.tombstones || {};
    COLLECTIONS.forEach(c => {
      const local = target[c] = target[c] || [];
      const byId = new Map(local.map(r => [r.id, r]));
      const tomb = target.tombstones[c] || {};
      (incoming[c] || []).forEach(r => {
        if (!r || !r.id) return;
        if (tomb[r.id] && tomb[r.id] >= (r.updatedAt || 0)) return;
        const mine = byId.get(r.id);
        if (!mine) { local.push(r); byId.set(r.id, r); changed++; }
        else if ((r.updatedAt || 0) > (mine.updatedAt || 0)) { Object.keys(mine).forEach(k => delete mine[k]); Object.assign(mine, r); changed++; }
      });
      const theirTomb = (incoming.tombstones || {})[c] || {};
      Object.keys(theirTomb).forEach(id => {
        const mine = byId.get(id);
        if (mine && theirTomb[id] >= (mine.updatedAt || 0)) { local.splice(local.indexOf(mine), 1); changed++; }
        tomb[id] = Math.max(tomb[id] || 0, theirTomb[id]);
      });
      target.tombstones[c] = tomb;
    });
    const inS = incoming.settings || {}, myS = target.settings = target.settings || {};
    if ((inS.updatedAt || 0) > (myS.updatedAt || 0)) {
      const officers = Object.assign({}, inS.officers, myS.officers), counters = Object.assign({}, myS.counters);
      target.settings = Object.assign({}, inS, { officers, counters }); changed++;
    } else if (inS.officers) {
      Object.keys(inS.officers).forEach(u => { if (!(myS.officers || {})[u]) { myS.officers = Object.assign({}, myS.officers, { [u]: inS.officers[u] }); changed++; } });
    }
    const tc = target.settings.counters = target.settings.counters || {};
    Object.keys(inS.counters || {}).forEach(k => { if ((inS.counters[k] || 0) > (tc[k] || 0)) { tc[k] = inS.counters[k]; changed++; } });
    target.auditLog = target.auditLog || [];
    const seen = new Set(target.auditLog.map(a => a.timestamp + '|' + a.action + '|' + a.user));
    (incoming.auditLog || []).forEach(a => { const k = a.timestamp + '|' + a.action + '|' + a.user; if (!seen.has(k)) { target.auditLog.push(a); seen.add(k); changed++; } });
    target.auditLog.sort((x, y) => (y.timestamp > x.timestamp ? 1 : -1));
    if (target.auditLog.length > 3000) target.auditLog.length = 3000;
    // Other top-level lists (import history…): keep the union by id.
    ['importLog'].forEach(k => {
      if (!Array.isArray(incoming[k])) return;
      const mine = target[k] = Array.isArray(target[k]) ? target[k] : [];
      const ids = new Set(mine.map(e => e.id));
      incoming[k].forEach(e => { if (e && e.id && !ids.has(e.id)) { mine.push(e); changed++; } });
    });
    return changed;
  }

  async function persist() {
    let idbOk = false;
    if (!idbBroken) {
      try {
        const db = await openIDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('kv', 'readwrite'); const st = tx.objectStore('kv');
          const g = st.get(STORAGE_KEY);
          g.onsuccess = () => {
            const theirs = g.result;
            // Another tab saved since we last looked: take its records first.
            if (theirs && theirs._writer !== TAB_ID && (theirs._savedAt || 0) > lastSeenSavedAt) {
              if (mergeInto(store.db, migrate(theirs))) setTimeout(() => store.emit('change', { coll: '*', action: 'tab-merge' }), 0);
            }
            store.db._savedAt = Date.now(); store.db._writer = TAB_ID; lastSeenSavedAt = store.db._savedAt;
            st.put(store.db, STORAGE_KEY);
            const day = util.today();
            if (lastSnapshotDay !== day) { st.put(store.db, 'snapshot-' + day); lastSnapshotDay = day; pruneSnapshots(st); }
          };
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        });
        idbOk = true;
      } catch (e) { console.error('[Proc] IndexedDB save failed', e); }
    }
    let lsOk = false;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.db)); lsOk = true; }
    catch (e) {
      // The browser cache is only a convenience — drop it only when the database copy is safely written.
      if (idbOk) { try { localStorage.removeItem(STORAGE_KEY); } catch (e2) { /* ignore */ } }
    }
    if (!idbOk && !lsOk) {
      store.emit('saveError', new Error('This computer could not save the latest changes (browser storage is full or blocked).'));
      return false;
    }
    if (channel) { try { channel.postMessage({ type: 'saved', tab: TAB_ID, at: store.db._savedAt }); } catch (e) { /* ignore */ } }
    store.emit('saved');
    return true;
  }
  function pruneSnapshots(st) {
    const r = st.getAllKeys();
    r.onsuccess = () => { (r.result || []).filter(k => /^snapshot-\d{4}-\d{2}-\d{2}$/.test(k)).sort().reverse().slice(14).forEach(k => st.delete(k)); };
  }
  /** Another tab saved: pull its records in. */
  const pullFromOtherTab = util.debounce(async () => {
    try {
      const theirs = await idb('kv', 'readonly', st => st.get(STORAGE_KEY));
      if (!theirs || theirs._writer === TAB_ID || (theirs._savedAt || 0) <= lastSeenSavedAt) return;
      const n = mergeInto(store.db, migrate(theirs));
      lastSeenSavedAt = theirs._savedAt || lastSeenSavedAt;
      if (n) store.emit('change', { coll: '*', action: 'tab-merge' });
    } catch (e) { /* next save merges anyway */ }
  }, 250);
  if (channel) channel.onmessage = e => { if (e.data && e.data.type === 'saved' && e.data.tab !== TAB_ID) pullFromOtherTab(); };
  window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) pullFromOtherTab(); });
  // Never lose the last change when the page is closed, reloaded or hidden.
  const flushIfPending = () => {
    if (!pendingSave) return;
    // The database write is asynchronous and may not finish before the page closes, so write the
    // browser cache straight away too (it is merged back in on the next load).
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.db)); } catch (e) { /* full: the database write below still runs */ }
    store.flush();
  };
  window.addEventListener('pagehide', flushIfPending);
  window.addEventListener('beforeunload', flushIfPending);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushIfPending(); });

  function latestStamp(db) {
    let m = (db.settings && db.settings.updatedAt) || 0;
    COLLECTIONS.forEach(c => (db[c] || []).forEach(r => { if ((r.updatedAt || 0) > m) m = r.updatedAt; }));
    return m;
  }

  /* --------------------------------------------------------------- audit */
  Proc.audit = function (action, details, ref) {
    store.db.auditLog.unshift({ timestamp: new Date().toISOString(), user: Proc.auth.userName(), action, details: details || '', ref: ref || '' });
    if (store.db.auditLog.length > 3000) store.db.auditLog.length = 3000;
    store.save();
  };

  /* --------------------------------------------------------------- files */
  /** Document blobs live in IndexedDB ("files" store); metadata in store.documents.
      When Google Drive is connected the file is also copied to Drive so other
      computers can open it. */
  const files = Proc.files = {
    putBlob(id, blob) { return idb('files', 'readwrite', st => st.put(blob, id)); },
    getBlob(id) { return idb('files', 'readonly', st => st.get(id)); },
    deleteBlob(id) { return idb('files', 'readwrite', st => st.delete(id)); },
    /**
     * Save a file and its metadata.
     * meta: { supplierId, kind, title, ref, date, amount, notes, links: { poId, invoiceId, comparisonId, memoId, requisitionId } }
     */
    async add(file, meta) {
      meta = meta || {};
      const id = util.uid('DOC');
      await files.putBlob(id, file);
      const rec = store.upsert('documents', Object.assign({
        id, name: file.name || (meta.title || 'document') + '.pdf', mime: file.type || 'application/octet-stream', size: file.size || 0,
        kind: meta.kind || 'Other', title: meta.title || (file.name || '').replace(/\.[^.]+$/, ''), date: meta.date || util.today(), links: meta.links || {},
        app: APP.system
      }, meta, { id }));
      Proc.audit('Upload Document', (rec.kind || 'Document') + ': ' + rec.name, rec.id);
      Proc.sync.uploadDoc(rec).catch(() => {});
      return rec;
    },
    async blob(docId) {
      let b = await files.getBlob(docId).catch(() => null);
      if (!b) {
        const doc = store.get('documents', docId);
        if (doc && doc.seedFile) { b = await fetch(doc.seedFile).then(x => (x.ok ? x.blob() : null)).catch(() => null); if (b) await files.putBlob(docId, b).catch(() => {}); }
        if (!b && doc && doc.driveFileId) { b = await Proc.sync.downloadDoc(doc).catch(() => null); if (b) await files.putBlob(docId, b).catch(() => {}); }
      }
      return b || null;
    },
    async open(docId) {
      const win = window.open('', '_blank');
      const b = await files.blob(docId);
      if (!b) { if (win) win.close(); Proc.ui.toast('This file is not on this computer yet. Connect Google Drive on the main dashboard to fetch it.', 'warning'); return; }
      const url = URL.createObjectURL(b);
      if (win) win.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    },
    async download(docId) {
      const doc = store.get('documents', docId); const b = await files.blob(docId);
      if (!b) { Proc.ui.toast('File not available on this computer.', 'warning'); return; }
      util.download(b, (doc && doc.name) || 'document');
    },
    async remove(docId) { store.remove('documents', docId); await files.deleteBlob(docId).catch(() => {}); },
    forSupplier(supplierId) { return store.filter('documents', d => d.supplierId === supplierId).sort((a, b) => (b.date || '').localeCompare(a.date || '')); },
    forLink(key, id) { return store.filter('documents', d => d.links && d.links[key] === id); }
  };

  /* -------------------------------------------------------------- domain */
  const domain = Proc.domain = {};
  const SMALL = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function under1000(n) {
    const h = Math.floor(n / 100), r = n % 100; const parts = [];
    if (h) parts.push(SMALL[h] + ' Hundred');
    if (r) {
      const w = r < 20 ? SMALL[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + SMALL[r % 10] : '');
      parts.push(w);
    }
    return parts.join(' and ');
  }
  /** Whole number to words: 2534577 → "Two Million, Five Hundred and Thirty-Four Thousand, Five Hundred and Seventy-Seven". */
  domain.numberWords = function (n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n === 0) return 'Zero';
    const scales = [[1e12, 'Trillion'], [1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
    const parts = [];
    scales.forEach(([v, name]) => { if (n >= v) { parts.push(under1000(Math.floor(n / v)) + ' ' + name); n %= v; } });
    if (n) parts.push((parts.length && n < 100 ? 'and ' : '') + under1000(n));
    return parts.join(', ').replace(', and ', ' and ');
  };
  /** Amount in the wording used on approval letters, e.g. "Two Million and Twenty-Three Thousand… Dollars and Seventy-Eight Cents". */
  domain.amountWords = function (amount) {
    const v = util.round2(Math.abs(Number(amount) || 0));
    const dollars = Math.floor(v), cents = Math.round((v - dollars) * 100);
    let s = domain.numberWords(dollars) + (dollars === 1 ? ' Dollar' : ' Dollars');
    if (cents) s += ' and ' + domain.numberWords(cents) + (cents === 1 ? ' Cent' : ' Cents');
    return s;
  };
  /** Small counts in words for sentences: 7 → "Seven". */
  domain.countWord = n => (n >= 0 && n < 20 ? SMALL[n] : String(n));
  /** "A", "A and B", "A, B and C". */
  domain.joinNames = function (names) {
    names = names.filter(Boolean);
    if (names.length <= 1) return names[0] || '';
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  };

  /* Supplier identity: the same company appears as "IGL LTD.", "IGL Ltd." and "IGL Limited". */
  const SUFFIX = /\b(LIMITED|LTD|CO|COMPANY|INC|INCORPORATED|JA|JAMAICA LTD)\b\.?$/;
  domain.supplierKey = function (name) {
    let s = String(name || '').toUpperCase().replace(/&/g, ' AND ').replace(/[.,'’"()\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^THE /, '');
    let prev;
    do { prev = s; s = s.replace(SUFFIX, '').trim(); } while (s !== prev);
    return s.replace(/\s+/g, '');
  };
  domain.findSupplier = function (name) {
    if (!name) return null;
    const key = domain.supplierKey(name);
    if (!key) return null;
    return store.find('suppliers', s => domain.supplierKey(s.name) === key || (s.aliases || []).some(a => domain.supplierKey(a) === key));
  };
  /** Find a supplier by name, creating a profile if it is new. */
  domain.ensureSupplier = function (name, extra, opts) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (!name) return null;
    const found = domain.findSupplier(name);
    if (found) {
      // Prefer a normal-case spelling ("Promedical Distribution Ltd.") over an ALL-CAPS one from the PRS.
      const caps = x => /[A-Z]/.test(x) && x === x.toUpperCase();
      if (caps(found.name) && !caps(name) && /[a-z]/.test(name)) {
        const old = found.name;
        store.upsert('suppliers', { id: found.id, name, aliases: Array.from(new Set((found.aliases || []).concat([old]))) }, { silent: true });
        store.list('purchaseOrders').forEach(p => { if (p.supplierId === found.id && p.supplierName === old) store.upsert('purchaseOrders', { id: p.id, supplierName: name }, { silent: true }); });
      }
      if (extra) {
        const patch = {}; let any = false;
        Object.keys(extra).forEach(k => { if (extra[k] && !found[k]) { patch[k] = extra[k]; any = true; } });
        if (any) store.upsert('suppliers', Object.assign({ id: found.id }, patch), opts);
      }
      return found;
    }
    return store.upsert('suppliers', Object.assign({ name, categories: [], status: 'Active', country: 'Jamaica' }, extra || {}), opts);
  };
  domain.supplierName = function (id, fallback) { const s = store.get('suppliers', id); return s ? s.name : (fallback || ''); };

  /** Expiry state for TCC / registration dates. */
  domain.expiryState = function (iso) {
    if (!iso) return null;
    const days = util.daysBetween(util.today(), iso);
    if (days === null) return null;
    if (days < 0) return { tone: 'danger', label: 'Expired', days };
    if (days <= 30) return { tone: 'warning', label: 'Expiring', days };
    return { tone: 'success', label: 'Valid', days };
  };

  /**
   * Approval route for a recommended award.
   * total: the whole recommendation (committee memo); awards: per-supplier amounts.
   * Follows the approval letters (Parish Manager delegated $2M) and Handbook §2.4.
   */
  domain.approvalRoute = function (total, awards) {
    const L = store.settings().limits, S = store.settings().signatories;
    awards = (awards && awards.length ? awards : [{ amount: total }]).map(a => util.num(a.amount));
    const maxAward = Math.max.apply(null, awards.concat([0]));
    const steps = [];
    const needsCommittee = total >= L.committeeMin;
    const hoeCount = awards.filter(a => a > L.delegated).length;
    steps.push({ key: 'officer', title: 'Procurement Officer prepares recommendation', detail: 'Evaluation and recommendation memo' });
    if (needsCommittee) steps.push({ key: 'committee', title: S.committee.name + ' review', detail: 'Committee memo to the ' + S.parishManager.title });
    steps.push({ key: 'pm', title: S.parishManager.title + (hoeCount ? ' recommends' : ' approves'), detail: hoeCount ? 'Award above the ' + util.money(L.delegated) + ' delegated authority' : 'Within the ' + util.money(L.delegated) + ' delegated authority' });
    if (hoeCount) {
      steps.push({ key: 'ceo', title: 'Through ' + S.ceo.title, detail: S.ceo.org });
      if (maxAward > L.ncc) steps.push({ key: 'ncc', title: 'NCC / PPC endorsement', detail: 'Award above ' + util.money(L.ncc, { noCents: true }) + ' (Handbook §2.4)', warn: true });
      steps.push({ key: 'rd', title: S.regionalDirector.title + ' approves (Head of Entity)', detail: S.regionalDirector.org });
      if (maxAward > L.cabinet) steps.push({ key: 'cabinet', title: 'Cabinet approval', detail: 'Award above ' + util.money(L.cabinet, { noCents: true }) + ' (Handbook §2.4)', warn: true });
    }
    const level = maxAward > L.cabinet ? 'Cabinet' : maxAward > L.ncc ? 'NCC/PPC + Head of Entity' : hoeCount ? 'Head of Entity (Regional Director)' : needsCommittee ? 'Committee + Parish Manager' : 'Parish Manager';
    return { steps, needsCommittee, hoeCount, maxAward, level, needsNCC: maxAward > L.ncc, needsCabinet: maxAward > L.cabinet };
  };
  /** Short label for tables. */
  domain.approvalLevel = function (amount) { return domain.approvalRoute(amount, [{ amount }]).level; };

  /** Suggested reference in the hospital's style: RFQ-MEDSUNDRIES-MPH/112026 */
  domain.suggestRef = function (subject, method, iso) {
    const d = util.parseDate(iso) || new Date();
    const pre = method === 'Single Source (SS)' ? 'SS' : method && /^Open/.test(method) ? 'NCB' : 'RFQ';
    return pre + '-' + (util.slug(subject) || 'ITEMS') + '-' + (store.settings().org.refCode || 'MPH') + '/' + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear();
  };

  /**
   * Price comparison maths. A comparison record:
   *   items:     [{ id, description, unit, qty, spec }]
   *   suppliers: [{ supplierId, name, compliant, gct (prices exclude GCT → add it), deliveryDays, validity, notes }]
   *   prices:    { [itemId]: { [supplierId]: unitPrice } }
   *   awardMode: 'item' (lowest compliant per line) | 'lot' (one supplier for everything)
   *   awards:    { [itemId]: supplierId | '' }  manual overrides for item mode
   *   lotSupplierId: supplier chosen in lot mode (blank = cheapest complete compliant bid)
   * Returns everything the matrix, memo and POs need.
   */
  domain.computeComparison = function (cmp) {
    const rate = store.settings().gctRate;
    const sups = (cmp.suppliers || []);
    const prices = cmp.prices || {};
    const bySupplier = {};
    sups.forEach(s => { bySupplier[s.supplierId] = { supplierId: s.supplierId, name: s.name || domain.supplierName(s.supplierId), compliant: s.compliant !== false, gctApplies: !!s.gct, quoted: 0, subtotal: 0, gct: 0, total: 0, complete: false, lowestCount: 0 }; });
    const lines = (cmp.items || []).map(item => {
      const qty = util.num(item.qty) || 0;
      const quotes = {};
      let lowest = null;
      sups.forEach(s => {
        const raw = prices[item.id] ? prices[item.id][s.supplierId] : undefined;
        if (raw === undefined || raw === null || raw === '') return;
        const unit = util.num(raw);
        if (unit <= 0) return;
        const eff = unit * (s.gct ? 1 + rate : 1);
        quotes[s.supplierId] = { unit, eff, ext: util.round2(unit * qty), extInc: util.round2(eff * qty) };
        const b = bySupplier[s.supplierId];
        b.quoted++; b.subtotal += unit * qty; if (s.gct) b.gct += unit * qty * rate;
        if (s.compliant !== false && (!lowest || eff < quotes[lowest].eff)) lowest = s.supplierId;
      });
      if (lowest) bySupplier[lowest].lowestCount++;
      return { item, qty, quotes, lowestSid: lowest };
    });
    Object.values(bySupplier).forEach(b => { b.subtotal = util.round2(b.subtotal); b.gct = util.round2(b.gct); b.total = util.round2(b.subtotal + b.gct); b.complete = b.quoted === lines.length && lines.length > 0; });

    let lotSid = '';
    if (cmp.awardMode === 'lot') {
      lotSid = cmp.lotSupplierId || '';
      if (!lotSid) {
        const cands = Object.values(bySupplier).filter(b => b.compliant && b.complete).sort((a, b) => a.total - b.total);
        lotSid = cands.length ? cands[0].supplierId : '';
      }
    }
    const awardsMap = {};
    lines.forEach(l => {
      let sid;
      if (cmp.awardMode === 'lot') sid = lotSid && l.quotes[lotSid] ? lotSid : '';
      else {
        const o = cmp.awards ? cmp.awards[l.item.id] : undefined;
        sid = o !== undefined && o !== null && (o === '' || l.quotes[o]) ? o : (l.lowestSid || '');
        l.overridden = o !== undefined && o !== null && o !== (l.lowestSid || '');
      }
      l.awardSid = sid;
      if (sid) {
        const q = l.quotes[sid];
        const s = sups.find(x => x.supplierId === sid);
        const a = awardsMap[sid] = awardsMap[sid] || { supplierId: sid, name: bySupplier[sid].name, gctApplies: !!(s && s.gct), items: [], subtotal: 0, gct: 0, total: 0 };
        a.items.push({ itemId: l.item.id, description: l.item.description, unit: l.item.unit || '', qty: l.qty, unitPrice: q.unit, total: q.ext });
        a.subtotal += q.ext;
      }
    });
    const awards = Object.values(awardsMap).map(a => {
      a.subtotal = util.round2(a.subtotal); a.gct = a.gctApplies ? util.round2(a.subtotal * rate) : 0; a.total = util.round2(a.subtotal + a.gct); return a;
    }).sort((a, b) => b.total - a.total);
    const awardTotal = util.round2(util.sum(awards, a => a.total));
    const unawarded = lines.filter(l => !l.awardSid && Object.keys(l.quotes).length).length; // quoted but not awarded
    // Value for money: what the award would have cost at each line's highest compliant price.
    const highest = util.round2(util.sum(lines, l => { const v = Object.entries(l.quotes).filter(([sid]) => bySupplier[sid].compliant).map(([, q]) => q.extInc); return v.length ? Math.max.apply(null, v) : 0; }));
    const awardedInc = util.round2(util.sum(lines, l => (l.awardSid ? l.quotes[l.awardSid].extInc : 0)));
    return { lines, bySupplier, awards, awardTotal, unawarded, lotSid, savingVsHighest: util.round2(highest - awardedInc), bidsReceived: Object.values(bySupplier).filter(b => b.quoted > 0).length };
  };

  /** Default evaluation sentence used on memos when the officer has not written one. */
  domain.autoEvaluationNote = function (bids) {
    const ok = (bids || []).filter(b => b.compliant !== false).map(b => b.supplier);
    if (!ok.length) return '';
    return 'The evaluation committee noted that ' + domain.joinNames(ok) + (ok.length === 1 ? ' was' : ' were') + ' compliant with Technical Specifications.';
  };

  /** Build a memo record from a price comparison. */
  domain.memoFromComparison = function (cmp) {
    const r = domain.computeComparison(cmp);
    const bids = (cmp.suppliers || []).filter(s => r.bySupplier[s.supplierId].quoted > 0).map(s => ({
      supplierId: s.supplierId, supplier: r.bySupplier[s.supplierId].name, price: r.bySupplier[s.supplierId].total, compliant: s.compliant !== false
    }));
    return {
      comparisonId: cmp.id, requisitionId: cmp.requisitionId || '', ref: cmp.ref || '', subject: cmp.subject || cmp.title || '', date: util.today(),
      method: cmp.method || 'Restricted Bidding (RB)', viaGojep: cmp.viaGojep !== false, invited: Number(cmp.invited) || (cmp.suppliers || []).length,
      bids, awards: r.awards.map(a => ({ supplierId: a.supplierId, supplier: a.name, amount: a.total })), evaluationNote: cmp.evaluationNote || '', status: 'Draft'
    };
  };

  /** Draft purchase orders (one per awarded supplier) from a comparison. */
  domain.ordersFromComparison = function (cmp) {
    const r = domain.computeComparison(cmp);
    const req = cmp.requisitionId ? store.get('requisitions', cmp.requisitionId) : null;
    return r.awards.map(a => ({
      supplierId: a.supplierId, supplierName: a.name, comparisonId: cmp.id, memoId: cmp.memoId || '', requisitionId: cmp.requisitionId || '',
      ref: cmp.ref || '', description: cmp.subject || cmp.title || '', department: req ? req.department : (cmp.department || ''), requisitioner: req ? req.requestedBy : '',
      date: util.today(), items: a.items.map(i => ({ description: i.description, unit: i.unit, qty: i.qty, unitPrice: i.unitPrice, total: i.total })),
      subtotal: a.subtotal, gct: a.gct, total: a.total, method: cmp.method || '', category: cmp.category || '', type: cmp.type || 'Goods',
      tendersReceived: r.bidsReceived, estimate: req ? req.estimate : (cmp.estimate || 0), viaGojep: cmp.viaGojep !== false,
      deliveryAddress: store.settings().org.deliveryAddress, paymentTerms: '30 days credit', status: 'Draft', poNumber: ''
    }));
  };

  /** Recompute a PO's status from its deliveries and invoices. */
  domain.refreshOrderStatus = function (poId) {
    const po = store.get('purchaseOrders', poId);
    if (!po || po.status === 'Cancelled' || po.status === 'Draft') return po;
    const dels = store.filter('deliveries', d => d.poId === poId && !d.voided);
    const invs = store.filter('invoices', i => i.poId === poId);
    let status = 'Issued';
    if (dels.length) status = dels.some(d => d.partial) && !dels.some(d => d.final) ? 'Partially Delivered' : 'Delivered';
    if (invs.length) status = 'Invoiced';
    const paid = util.sum(invs.filter(i => i.status === 'Paid'), i => i.total);
    if (invs.length && invs.every(i => i.status === 'Paid') && paid >= (po.total || 0) * 0.98) status = 'Paid';
    if (po.status === 'Closed' && status === 'Paid') status = 'Closed';
    if (status !== po.status) store.upsert('purchaseOrders', { id: po.id, status });
    return po;
  };

  /** Rolled-up figures for a supplier profile and directory. */
  domain.supplierSummary = function (sid) {
    const pos = store.filter('purchaseOrders', p => p.supplierId === sid && p.status !== 'Cancelled');
    const invs = store.filter('invoices', i => i.supplierId === sid);
    const fy = util.fiscalYear(util.today());
    const fyPos = pos.filter(p => util.fiscalYear(p.date) === fy);
    const last = pos.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const outstanding = invs.filter(i => i.status !== 'Paid');
    const cmps = store.filter('comparisons', c => (c.suppliers || []).some(s => s.supplierId === sid));
    let wins = 0; cmps.forEach(c => { const r = domain.computeComparison(c); if (r.awards.some(a => a.supplierId === sid)) wins++; });
    return {
      poCount: pos.length, spend: util.sum(pos, p => p.total), fySpend: util.sum(fyPos, p => p.total), fyCount: fyPos.length, fy,
      lastDate: last ? last.date : '', invoices: invs.length, outstanding: outstanding.length, outstandingAmount: util.sum(outstanding, i => i.total),
      docs: store.filter('documents', d => d.supplierId === sid).length, bids: cmps.length, wins
    };
  };

  /** Officer identity printed on memos and POs. */
  domain.officer = function () {
    const u = Proc.auth.user;
    const prof = (u && store.settings().officers[u.username]) || {};
    return { name: prof.name || (u ? u.displayName : 'Procurement Officer'), title: prof.title || 'Public Procurement Officer', org: store.settings().org.hospital, phone: prof.phone || '', email: prof.email || (u && u.email) || '' };
  };

  /* ========================================================= supply chain
     Shared by Procurement, General Stores and Fixed Asset intake.
     A PO line is Stock (consumable, goes into the store), Asset (fixed asset:
     furniture, machinery, tools, equipment…) or Service (nothing to receive). */
  const ASSET_WORDS = 'chair|chairs|desk|desks|table|tables|cabinet|cabinets|cupboard|shelving|locker|lockers|bed|beds|bedside|sofa|bench|stool|trolley|trolleys|wheelchair|wheelchairs|stretcher|stretchers|crib|cot|incubator|incubators|resuscitaire|ventilator|ventilators|defibrillator|defibrillators|ecg machine|ctg machine|ctg|abg machine|ultrasound|x-ray machine|autoclave|steriliser|sterilizer|microscope|centrifuge|analyser|analyzer|machine|machines|equipment|computer|computers|laptop|laptops|desktop|printer|printers|photocopier|scanner|projector|television|camera|cctv|nvr|nvrs|dvr|server|router|ups|generator|refrigerator|fridge|freezer|air condition|air-condition|air conditioning|airconditioning|a/c unit|ac unit|ac units|condensing unit|water cooler|water coolers|wall fan|wall fans|industrial fan|stand fan|ceiling fan|stove|oven|microwave|washing machine|dryer|vehicle|motor vehicle|pump|compressor|drill|grinder|chainsaw|welder|welding machine|ladder|toolkit|tool set|tool box|toolbox|weighing scale|suction|infusion pump|oxygen concentrator|telephone set|two-way radio|mattress|mattresses|filing cabinet|emergency cart|crash cart|medication trolley|hospital bed|railed bed';
  const SERVICE_WORDS = 'repair|repairs|servicing|service|maintenance|rental|rent|hire|collection|disposal|removal|installation|install|labour|labor|fabrication|renovation|construction|treatment|consultancy|training|transport|courier|uninstall|recommission|leak check|re-install|reinstall|calibration|inspection|cleaning service|adjustment|adjustments|adjustemnts|modification|remove and replace|pest control|security service';
  function wordRe(list, extra) {
    const words = list.split('|').concat(String(extra || '').split(',').map(w => w.trim()).filter(Boolean));
    return new RegExp('\\b(' + words.map(w => w.replace(/[.*+?^${}()[\]\\/]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|') + ')\\b', 'i');
  }
  const STOCK_WORDS = 'milk|food|foods|rice|flour|sugar|oil|juice|water|bread|chicken|meat|fish|vegetable|vegetables|fruit|fruits|grocery|groceries|ground provision|ground provisions|cereal|oats|beans|soup|ketchup|macaroni|powder|soap|detergent|bleach|disinfectant|sanitizer|sanitiser|cleaner|deodorizer|chemical|chemicals|paper|tissue|towel|towels|bed roll|bed rolls|napkin|napkins|cup|cups|plate|plates|spoon|spoons|fork|forks|foil|lunch box|glove|gloves|syringe|syringes|needle|needles|gauze|bandage|bandages|suture|sutures|catheter|catheters|cannula|cannulas|tube|tubes|tubing|swab|swabs|mask|masks|gown|gowns|reagent|reagents|test kit|test kits|strip|strips|cartridge|cartridges|toner|ink|pen|pens|pencils|stationery|envelope|envelopes|folder|folders|battery|batteries|bulb|bulbs|lamp|lamps|oxygen|gas|diesel|fuel|medication|medicine|drug|drugs|tablet|tablets|capsule|capsules|vaccine|vaccines|sundries|supplies|linen|sheets|pillow|pillowcase|uniform|uniforms|log book|logbook|card|cards|form|forms|tape|label|labels|filter|filters|spare part|spare parts|slide|slides|pipette|pipettes|fluid|fluids|calibrant|solution|solutions|scrub|brush|brushes|airway|tips|sponge|sponges|badge|badges|handle|handles|cushion|cushions|hose|hoses|refrigerant|lock|locks|hinge|hinges|caster|casters|wheel|wheels|replacement|refill|refills|electrode|electrodes|cuff|cuffs|diathermy pencil|drape|drapes|container|containers|bag|bags|bin liner|bin liners|calico|fabric|material|cement|paint|plumbing|fitting|fittings|screws|nails|wire|cable';
  const QTY_ITEM = /\d+(\.\d+)?\s*(ea|each|c\/s|cs|case|cases|gal|gals|lbs?|pk|pks|pack|packs|box|boxes|bx|kg|rolls?|reams?|bags?|doz|btl|bottles?|units?|pcs?|pieces?|tins?|cans?)\b/gi;
  /** 'Stock' | 'Asset' | 'Service' for one PO line. A line's own itemType (set by an officer) always wins. */
  domain.classifyLine = function (line, po) {
    line = line || {};
    if (line.itemType) return line.itemType;
    const S = store.settings().stores || {};
    const d = String(line.description || '') + ' ' + (po && (!po.items || po.items.length <= 1) ? String(po.description || '') : '');
    if ((po && (po.type === 'Services' || po.type === 'Works')) || wordRe(SERVICE_WORDS, S.serviceKeywords).test(d)) return 'Service';
    const assetRe = wordRe(ASSET_WORDS, S.assetKeywords), stockRe = wordRe(STOCK_WORDS);
    // Decide by the main noun: "microscope slides" are slides; "battery for ventilator" is a battery;
    // "bed rolls" are bed rolls (the longer match wins when both start together).
    const head = text => {
      const am = text.match(assetRe), sm = text.match(stockRe);
      if (am && sm) {
        if (am.index === sm.index) return sm[0].length >= am[0].length ? 'Stock' : 'Asset';
        const f = am.index < sm.index ? am : sm, g = f === am ? sm : am;
        const between = text.slice(f.index + f[0].length, g.index);
        return (/\b(for|of|to suit|compatible with|from)\b/i.test(between) ? f : g) === am ? 'Asset' : 'Stock';
      }
      return am ? 'Asset' : sm ? 'Stock' : '';
    };
    const many = (d.match(QTY_ITEM) || []).length >= 2 || (d.match(/,/g) || []).length >= 2;
    // A list of items in one line: judge by the first item, then the whole line.
    const byWords = (many ? head(d.split(/,\s*/)[0]) : '') || head(d);
    if (byWords) return byWords;
    // Price rule only for a single countable item — not a bulk order written as one "lot" line.
    const unit = String(line.unit || '').toLowerCase();
    if (!many && ['lot', 'job', 'month', 'case', 'cs', 'c/s', 'box', 'pk', 'gal', 'kg', 'lb', 'lbs', 'ream', 'roll', 'bag', 'doz', 'litre', 'drum'].indexOf(unit) < 0 &&
        util.num(line.unitPrice) >= util.num(S.assetThreshold || 50000)) return 'Asset';
    return 'Stock';
  };
  domain.ITEM_TYPES = ['Stock', 'Asset', 'Service'];
  /** PO lines, with a single fallback line for POs that only have a total. */
  domain.poLines = function (po) {
    if (po && po.items && po.items.length) return po.items;
    return [{ description: (po && po.description) || 'Goods / services as per PO', unit: 'lot', qty: 1, unitPrice: po ? (po.subtotal || po.total || 0) : 0, total: po ? (po.subtotal || po.total || 0) : 0 }];
  };
  const DONE_STATUSES = ['Delivered', 'Invoiced', 'Paid', 'Closed'];
  /** Quantity received so far on each line of a PO (array, same order as poLines). */
  domain.lineReceived = function (po) {
    const lines = domain.poLines(po);
    const got = lines.map(() => 0);
    const dels = store.filter('deliveries', d => d.poId === po.id && !d.voided);
    if (!dels.length) {
      // Imported history / older POs with no delivery records: treat finished POs as fully received.
      if (DONE_STATUSES.indexOf(po.status) >= 0 || po.historic) return lines.map(l => util.num(l.qty) || 1);
      return got;
    }
    dels.forEach(d => {
      const items = d.items || [];
      if (!items.length) { if (d.final || !d.partial) lines.forEach((l, i) => { got[i] = Math.max(got[i], util.num(l.qty) || 1); }); return; }
      items.forEach(it => {
        let i = typeof it.lineIndex === 'number' ? it.lineIndex : -1;
        if (i < 0) i = lines.findIndex((l, j) => String(l.description || '').trim().toLowerCase() === String(it.description || '').trim().toLowerCase() && got[j] < (util.num(l.qty) || 1));
        if (i < 0) i = lines.findIndex(l => String(l.description || '').trim().toLowerCase() === String(it.description || '').trim().toLowerCase());
        if (i >= 0) got[i] += util.num(it.qtyReceived !== undefined ? it.qtyReceived : it.qty);
      });
    });
    return got;
  };
  /** Expected delivery date for a PO. */
  domain.expectedDate = function (po) {
    if (po.expectedDate) return po.expectedDate;
    return util.addDays(po.issuedAt || po.date || util.today(), util.num((store.settings().stores || {}).leadDays || 14));
  };
  /**
   * Every PO line still to be delivered (issued, not cancelled), with what has arrived.
   * opts: { type: 'Stock'|'Asset'|'Service'|'' , includeServices: false, poId }
   * Row: { po, line, index, type, ordered, received, outstanding, expected, overdue, daysLate }
   */
  domain.inbound = function (opts) {
    opts = opts || {};
    const out = []; const today = util.today();
    store.list('purchaseOrders').forEach(po => {
      if (opts.poId && po.id !== opts.poId) return;
      if (!po.poNumber || po.status === 'Draft' || po.status === 'Cancelled' || po.historic) return;
      if (!opts.poId && DONE_STATUSES.indexOf(po.status) >= 0 && !store.find('deliveries', d => d.poId === po.id)) return;
      const lines = domain.poLines(po); const got = domain.lineReceived(po); const exp = domain.expectedDate(po);
      lines.forEach((line, i) => {
        const type = domain.classifyLine(line, po);
        if (type === 'Service' && !opts.includeServices && opts.type !== 'Service') return;
        if (opts.type && type !== opts.type) return;
        const ordered = util.num(line.qty) || 1, received = got[i] || 0, outstanding = Math.max(0, util.round2(ordered - received));
        if (!outstanding && !opts.includeComplete) return;
        const daysLate = util.daysBetween(exp, today);
        out.push({ po, line, index: i, type, ordered, received, outstanding, expected: exp, overdue: outstanding > 0 && daysLate > 0, daysLate: Math.max(0, daysLate || 0) });
      });
    });
    return out;
  };
  /** Fixed-asset lines: ordered, received, registered (assetRegistrations). Row adds { registered, toRegister }. */
  domain.assetLines = function () {
    const regs = store.list('assetRegistrations');
    const out = [];
    store.list('purchaseOrders').forEach(po => {
      if (!po.poNumber || po.status === 'Draft' || po.status === 'Cancelled') return;
      // History from before this system (no delivery records but already delivered) is not re-registered.
      if (po.historic || (DONE_STATUSES.indexOf(po.status) >= 0 && !store.find('deliveries', d => d.poId === po.id))) return;
      const lines = domain.poLines(po); let got = null;
      lines.forEach((line, i) => {
        if (domain.classifyLine(line, po) !== 'Asset') return;
        got = got || domain.lineReceived(po);
        const ordered = util.num(line.qty) || 1, received = got[i] || 0;
        const registered = util.sum(regs.filter(r => r.poId === po.id && r.lineIndex === i), r => r.qty);
        out.push({ po, line, index: i, ordered, received, registered, outstanding: Math.max(0, ordered - received), toRegister: Math.max(0, received - registered), expected: domain.expectedDate(po) });
      });
    });
    return out;
  };

  /** Stores put goods into stock (GRN by Stores, or put-away of a delivery Procurement recorded). Tells Procurement. */
  domain.afterStocked = function (delivery, moves) {
    const po = store.get('purchaseOrders', delivery.poId); if (!po) return;
    moves = (moves || store.filter('stockMoves', m => m.grnId === delivery.id && m.type === 'Receipt'));
    if (!moves.length) return;
    const text = moves.slice(0, 3).map(m => util.num(m.qty) + ' ' + (m.unit || '') + ' ' + m.itemName + (m.location ? ' → ' + m.location : '')).join('; ') + (moves.length > 3 ? '…' : '');
    Proc.notify({ to: ['procurement'], type: 'stocked', poId: po.id, title: 'Put into stock — PO ' + po.poNumber + ' · ' + (po.supplierName || ''), body: 'GRN ' + (delivery.grn || '') + ' · ' + text, link: { app: 'procurement', route: '#/orders/' + po.id } });
  };
  /** The Fixed Asset Officer registered assets from a PO line. Tells Procurement (and Stores). */
  domain.afterRegister = function (reg) {
    const po = store.get('purchaseOrders', reg.poId); if (!po) return;
    const codes = (reg.assetCodes || []).filter(Boolean);
    Proc.notify({ to: ['procurement', 'stores'], type: 'asset-registered', poId: po.id, title: util.num(reg.qty) + ' ' + util.plural(util.num(reg.qty), 'asset') + ' registered — PO ' + po.poNumber, body: (reg.description || '') + (codes.length ? ' · ' + codes.slice(0, 4).join(', ') + (codes.length > 4 ? '…' : '') : '') + (reg.department ? ' · ' + reg.department : ''), link: { app: 'procurement', route: '#/orders/' + po.id } });
  };
  /**
   * Everything that has happened to a PO after it was issued, newest last — for Procurement's PO page.
   * Event: { at (ISO date), kind: 'issued'|'delivered'|'stocked'|'rejected'|'returned'|'registered'|'invoiced'|'paid', title, detail, by, app, link }
   */
  domain.poTrail = function (po) {
    const ev = [];
    if (po.poNumber && po.status !== 'Draft') ev.push({ at: po.issuedAt || po.date, kind: 'issued', title: 'PO ' + po.poNumber + ' issued', detail: (po.supplierName || '') + ' · ' + util.money(po.total), by: po.createdBy || '' });
    store.filter('deliveries', d => d.poId === po.id).forEach(d => {
      const got = (d.items || []).filter(i => util.num(i.qtyReceived) > 0);
      ev.push({ at: d.date, kind: d.voided ? 'rejected' : 'delivered', title: (d.voided ? 'GRN voided — ' : 'Delivered — ') + (d.grn || 'delivery'), detail: (got.length ? got.map(i => util.num(i.qtyReceived) + ' ' + (i.unit || '') + ' ' + bareName(i.description)).slice(0, 4).join('; ') + (got.length > 4 ? '…' : '') : (d.final ? 'Full delivery' : 'Part delivery')) + (d.rejectedQty ? ' · ' + d.rejectedQty + ' rejected' : '') + (d.condition ? ' · ' + d.condition : ''), by: d.receivedBy || d.createdBy || '', app: d.recordedIn === 'procurement' ? 'Procurement' : 'General Stores', link: d.recordedIn === 'procurement' ? '' : (Proc.APP_URLS.stores + '#/grn/' + d.id) });
      const moves = d.voided ? [] : store.filter('stockMoves', m => m.grnId === d.id && m.type === 'Receipt');
      if (d.voided && store.find('stockMoves', m => m.grnId === d.id)) ev.push({ at: d.voidedAt ? String(d.voidedAt).slice(0, 10) : d.date, kind: 'rejected', title: 'Stock reversed — ' + (d.grn || ''), detail: 'GRN voided; its stock receipts were reversed', by: d.voidedBy || '', app: 'General Stores' });
      else if (moves.length) ev.push({ at: moves[0].date, kind: 'stocked', title: 'Put into stock', detail: moves.map(m => util.num(m.qty) + ' ' + (m.unit || '') + ' ' + m.itemName + (m.location ? ' (' + m.location + ')' : '')).slice(0, 4).join('; ') + (moves.length > 4 ? '…' : ''), by: moves[0].by || '', app: 'General Stores', link: Proc.APP_URLS.stores + '#/inventory/' + moves[0].itemId });
      else if (d.recordedIn === 'procurement' && !d.stocked) ev.push({ at: d.date, kind: 'pending', title: 'Waiting for Stores to put away', detail: d.grn || '', by: '', app: 'General Stores' });
    });
    store.filter('supplierReturns', r => r.poId === po.id).forEach(r => ev.push({ at: r.date, kind: 'returned', title: 'Returned to supplier — ' + (r.number || ''), detail: (r.items || []).map(i => util.num(i.qty) + ' ' + i.description + (i.reason ? ' (' + i.reason + ')' : '')).join('; ') + ' · ' + (r.status || ''), by: r.createdBy || '', app: 'General Stores' }));
    store.filter('assetRegistrations', r => r.poId === po.id).forEach(r => ev.push({ at: (r.registeredAt || r.createdAt || '').slice(0, 10), kind: 'registered', title: util.num(r.qty) + ' ' + util.plural(util.num(r.qty), 'asset') + ' registered', detail: (r.description || '') + ((r.assetCodes || []).filter(Boolean).length ? ' · ' + r.assetCodes.filter(Boolean).join(', ') : ' · asset codes to follow') + (r.department ? ' · ' + r.department : ''), by: r.registeredBy || r.createdBy || '', app: 'Fixed Assets', link: Proc.APP_URLS.intake + '#/registered' }));
    store.filter('invoices', i => i.poId === po.id).forEach(i => {
      ev.push({ at: i.date, kind: 'invoiced', title: 'Invoice ' + (i.invoiceNumber || ''), detail: util.money(i.total) + ' · ' + (i.status || ''), by: i.createdBy || '' });
      if (i.status === 'Paid') ev.push({ at: i.paidDate || i.date, kind: 'paid', title: 'Paid — invoice ' + (i.invoiceNumber || ''), detail: util.money(i.paidAmount || i.total) + (i.paymentRef ? ' · ' + i.paymentRef : ''), by: '' });
    });
    return ev.filter(e => e.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  };
  /** Per-line status for a PO, for Procurement and Stores: { type, ordered, received, stocked, registered, label } */
  domain.lineStatus = function (po) {
    const lines = domain.poLines(po); const got = domain.lineReceived(po);
    const regs = store.filter('assetRegistrations', r => r.poId === po.id);
    const dels = store.filter('deliveries', d => d.poId === po.id && !d.voided);
    return lines.map((l, i) => {
      const type = domain.classifyLine(l, po), ordered = util.num(l.qty) || 1, received = got[i] || 0;
      const registered = util.sum(regs.filter(r => r.lineIndex === i), r => r.qty);
      const stocked = util.sum(dels.filter(d => d.recordedIn !== 'procurement' || d.stocked).map(d => (d.items || []).find(x => x.lineIndex === i)).filter(Boolean), x => x.qtyReceived);
      let label = 'On order';
      if (type === 'Service') label = received >= ordered ? 'Completed' : 'Service';
      else if (received >= ordered) label = type === 'Asset' ? (registered >= received ? 'Registered' : 'Delivered — to register') : (stocked >= received ? 'In stock' : 'Delivered — to put away');
      else if (received > 0) label = 'Part delivered';
      return { type, ordered, received, stocked: type === 'Stock' ? stocked : 0, registered, label };
    });
  };

  /* ---------------- stock ledger */
  domain.stockKey = s => String(s || '').toLowerCase().replace(/^\d+(\.\d+)?\s*(ea|each|pk|pks|pcs|box|boxes|cs|c\/s|case|cases|lbs?|kg|gal|lt|ltr|litres?|rolls?|rms?|reams?|bags?|doz|btl|bottles?)\b\s*[-–:]?\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  domain.findStockItem = function (text) {
    const t = String(text || '').trim(); if (!t) return null;
    const byCode = store.find('stockItems', i => i.code && i.code.toLowerCase() === t.toLowerCase());
    if (byCode) return byCode;
    const k = domain.stockKey(t);
    return store.find('stockItems', i => domain.stockKey(i.name) === k || (i.aliases || []).some(a => domain.stockKey(a) === k)) || null;
  };
  /** Find a stock item by code/name, or create it (code STK-0001…). extra: { unit, category, location, supplierId, reorderLevel… } */
  domain.ensureStockItem = function (name, extra, opts) {
    const found = domain.findStockItem(name);
    if (found) return found;
    const n = store.next('itm');
    return store.upsert('stockItems', Object.assign({ code: 'STK-' + String(n).padStart(4, '0'), name: String(name || 'Item').trim(), unit: 'each', category: 'General', location: '',
      reorderLevel: 0, reorderQty: 0, maxLevel: 0, trackExpiry: false, onHand: 0, avgCost: 0, value: 0, batches: [], status: 'Active' }, extra || {}), opts);
  };
  /**
   * Post one stock movement and update the item (balance, weighted average cost, batches).
   * move: { itemId, type: 'Receipt'|'Issue'|'Adjustment'|'Return to supplier'|'Transfer'|'Opening'|'Write-off', qty (+ in / − out),
   *         unitCost, batchNo, expiryDate, date, ref, poId, grnId, issueId, department, supplierId, notes }
   * Issues consume batches first-expiry-first-out. Throws if stock would go below zero (unless opts.allowNegative).
   */
  domain.postStock = function (move, opts) {
    opts = opts || {};
    const item = store.get('stockItems', move.itemId);
    if (!item) throw new Error('Stock item not found');
    const qty = util.num(move.qty); if (!qty) throw new Error('Quantity is zero');
    const before = util.num(item.onHand);
    const after = util.round2(before + qty);
    if (after < 0 && !opts.allowNegative) throw new Error('Only ' + before + ' ' + (item.unit || '') + ' of ' + item.name + ' in stock');
    let avg = util.num(item.avgCost);
    const cost = move.unitCost !== undefined && move.unitCost !== '' ? util.num(move.unitCost) : avg;
    if (qty > 0 && (move.type === 'Receipt' || move.type === 'Opening' || (move.type === 'Adjustment' && move.unitCost !== undefined))) avg = after > 0 ? util.round2(((Math.max(before, 0) * avg) + qty * cost) / Math.max(after, qty)) : cost;
    let batches = (item.batches || []).map(b => Object.assign({}, b));
    const used = [];
    if (qty > 0 && (move.batchNo || move.expiryDate)) {
      const b = batches.find(x => (x.batchNo || '') === (move.batchNo || '') && (x.expiryDate || '') === (move.expiryDate || ''));
      if (b) b.qty = util.round2(b.qty + qty); else batches.push({ batchNo: move.batchNo || '', expiryDate: move.expiryDate || '', qty, receivedDate: move.date || util.today() });
    } else if (qty < 0 && batches.length) {
      // First-expiry-first-out. Issues and transfers never hand out expired batches (write-offs and
      // count adjustments may). Stock that is not tracked by batch is used after the dated batches.
      let need = -qty;
      const today = util.today();
      const clearing = move.type === 'Write-off' || move.type === 'Adjustment' || move.type === 'Return to supplier';
      const usable = b => b.qty > 0 && (clearing || (move.batchNo && b.batchNo === move.batchNo) || !b.expiryDate || b.expiryDate >= today);
      const unbatched = Math.max(0, util.round2(before - util.sum(batches, b => b.qty)));
      const order = batches.filter(usable).sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
      if (move.batchNo) order.sort((a, b) => (a.batchNo === move.batchNo ? -1 : b.batchNo === move.batchNo ? 1 : 0));
      order.forEach(b => { if (need <= 0) return; const take = Math.min(b.qty, need); b.qty = util.round2(b.qty - take); need = util.round2(need - take); used.push({ batchNo: b.batchNo, expiryDate: b.expiryDate, qty: take }); });
      if (need > 0) need = util.round2(need - Math.min(unbatched, need));
      if (need > 0 && !opts.allowNegative) {
        const expired = util.sum(batches.filter(b => b.qty > 0 && b.expiryDate && b.expiryDate < today), b => b.qty);
        throw new Error('Only ' + util.round2(-qty - need) + ' ' + (item.unit || '') + ' of ' + item.name + ' can be issued' + (expired ? ' — ' + expired + ' more are in expired batches (write them off)' : ''));
      }
      batches = batches.filter(b => b.qty > 0);
    }
    const rec = store.upsert('stockMoves', Object.assign({ date: util.today(), by: auth.userName() }, move, { itemId: item.id, itemCode: item.code, itemName: item.name, unit: item.unit, qty, unitCost: cost, value: util.round2(qty * cost), balanceAfter: after, batches: used.length ? used : undefined }), { silent: true });
    const patch = { id: item.id, onHand: after, avgCost: avg, value: util.round2(after * avg), batches };
    if (qty > 0 && move.type === 'Receipt') { patch.lastReceived = move.date || util.today(); patch.lastCost = cost; if (move.supplierId) patch.supplierIds = Array.from(new Set((item.supplierIds || []).concat([move.supplierId]))); }
    if (qty < 0 && move.type === 'Issue') patch.lastIssued = move.date || util.today();
    store.upsert('stockItems', patch, opts.silent ? { silent: true } : undefined);
    return rec;
  };
  domain.stockState = function (item) {
    const on = util.num(item.onHand);
    if (on <= 0) return { label: 'Out of stock', tone: 'danger' };
    if (util.num(item.reorderLevel) && on <= util.num(item.reorderLevel)) return { label: 'Reorder', tone: 'warning' };
    if (util.num(item.maxLevel) && on > util.num(item.maxLevel)) return { label: 'Overstocked', tone: 'info' };
    return { label: 'In stock', tone: 'success' };
  };

  /* ---------------- notifications */
  /** Proc.notify({ to: ['procurement'|'stores'|'assets'], type, title, body, link: { app: 'procurement'|'stores'|'intake'|'assets', route: '#/…' }, poId }) */
  Proc.notify = function (n) {
    return store.upsert('notifications', Object.assign({ to: [], type: 'info', title: '', body: '', link: null, at: Date.now(), from: APP.audience, fromUser: auth.userName(), readBy: {} }, n));
  };
  Proc.notifications = {
    mine() { return store.list('notifications').filter(n => (n.to || []).indexOf(APP.audience) >= 0).sort((a, b) => (b.at || 0) - (a.at || 0)); },
    unread() { const u = auth.user ? auth.user.username : ''; return Proc.notifications.mine().filter(n => !(n.readBy || {})[u]); },
    markRead(ids) { const u = auth.user ? auth.user.username : ''; if (!u) return; ids.forEach(id => { const n = store.get('notifications', id); if (n && !(n.readBy || {})[u]) store.upsert('notifications', { id, readBy: Object.assign({}, n.readBy, { [u]: Date.now() }) }, { silent: true }); }); store.save(); store.emit('change', { coll: 'notifications' }); },
    href(n) { if (!n.link) return ''; const app = n.link.app; const same = app === APP.id || (app === 'intake' && APP.id === 'intake'); return (same ? '' : (Proc.APP_URLS[app] || '')) + (n.link.route || ''); }
  };
  /** Item name without a leading ordered quantity ("100 box - Gloves" → "Gloves"), for sentences that state their own quantity. */
  const bareName = t => String(t || '').replace(/^\s*\d+(\.\d+)?\s*[a-z\/.]{0,6}\s*[-–:]\s*/i, '');
  /** After a PO is issued: tell Stores what to expect, and Fixed Assets about any assets. */
  domain.afterIssue = function (po) {
    if (!po || !po.poNumber) return;
    const lines = domain.poLines(po); const types = lines.map(l => domain.classifyLine(l, po));
    const goods = types.filter(t => t !== 'Service').length; const assets = types.filter(t => t === 'Asset').length;
    const when = util.date(domain.expectedDate(po));
    if (goods) Proc.notify({ to: ['stores'], type: 'po-issued', poId: po.id, title: 'PO ' + po.poNumber + ' issued — ' + (po.supplierName || ''), body: goods + ' ' + util.plural(goods, 'line') + ' to receive · ' + util.money(po.total) + ' · expected by ' + when, link: { app: 'stores', route: '#/inbound?po=' + po.id } });
    if (assets) Proc.notify({ to: ['assets'], type: 'asset-ordered', poId: po.id, title: assets + ' fixed ' + util.plural(assets, 'asset') + ' ordered — PO ' + po.poNumber, body: (po.supplierName || '') + ' · expected by ' + when, link: { app: 'intake', route: '#/onorder?po=' + po.id } });
  };
  /** After goods arrive (recorded by Stores or Procurement): tell Procurement, and Fixed Assets for asset lines. */
  domain.afterDelivery = function (delivery, opts) {
    opts = opts || {};
    const po = store.get('purchaseOrders', delivery.poId); if (!po) return;
    const lines = domain.poLines(po); const got = domain.lineReceived(po);
    const complete = lines.every((l, i) => (got[i] || 0) >= (util.num(l.qty) || 1));
    const items = (delivery.items || []).filter(i => util.num(i.qtyReceived) > 0);
    const summary = items.slice(0, 3).map(i => util.num(i.qtyReceived) + ' ' + (i.unit || '') + ' ' + bareName(i.description)).join('; ') + (items.length > 3 ? '…' : '');
    if (opts.by !== 'procurement') Proc.notify({ to: ['procurement'], type: 'delivered', poId: po.id, title: (complete ? 'Delivered in full' : 'Part delivery') + ' — PO ' + po.poNumber + ' · ' + (po.supplierName || ''), body: 'GRN ' + (delivery.grn || '') + (summary ? ' · ' + summary : '') + (delivery.rejectedQty ? ' · ' + delivery.rejectedQty + ' rejected' : ''), link: { app: 'procurement', route: '#/orders/' + po.id } });
    else Proc.notify({ to: ['stores'], type: 'put-away', poId: po.id, title: 'Procurement recorded a delivery — PO ' + po.poNumber, body: 'Put the goods into stock: ' + (summary || po.description || ''), link: { app: 'stores', route: '#/inbound?tab=putaway' } });
    const assetQty = util.sum(items.filter(i => { const l = typeof i.lineIndex === 'number' ? lines[i.lineIndex] : lines.find(x => x.description === i.description); return l && domain.classifyLine(l, po) === 'Asset'; }), i => i.qtyReceived);
    if (assetQty) Proc.notify({ to: ['assets'], type: 'asset-delivered', poId: po.id, title: assetQty + ' fixed ' + util.plural(assetQty, 'asset') + ' delivered — PO ' + po.poNumber, body: (po.supplierName || '') + ' · tag and register them in the asset register', link: { app: 'intake', route: '#/register?po=' + po.id } });
  };

  /* ------------------------------------------------------------------ ui */
  const ui = Proc.ui = {};
  const ICONS = {
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    stamp: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    settings: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>', 'chevron-left': '<path d="m15 18-6-6 6-6"/>', 'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>', 'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
    sheet: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
    trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    wallet: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    list: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    'arrow-up-right': '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    'arrow-down-left': '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
    clipboardCheck: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',
    barcode: '<path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/>'
  };
  ui.icon = (name, cls) => '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.file) + '</svg>';
  ui.ICONS = ICONS;

  ui.badge = function (status, tone) {
    const t = tone !== undefined ? tone : (K.STATUS_TONE[status] || '');
    return '<span class="badge ' + t + '">' + util.esc(status || '—') + '</span>';
  };
  ui.empty = function (icon, title, text, actionHtml) {
    return '<div class="empty"><div class="ic">' + ui.icon(icon || 'folder', 'lg') + '</div><h3>' + util.esc(title) + '</h3>' + (text ? '<p>' + text + '</p>' : '') + (actionHtml || '') + '</div>';
  };
  /** Standard page header. opts: { title, sub, back: {label, href}, actions (html), badge (html) } */
  ui.pageHead = function (o) {
    return (o.back ? '<a class="back-link" href="' + o.back.href + '">' + ui.icon('arrow-left', 'sm') + ' ' + util.esc(o.back.label) + '</a>' : '') +
      '<div class="page-head"><div><div class="title-row"><h1>' + util.esc(o.title) + '</h1>' + (o.badge || '') + '</div>' + (o.sub ? '<div class="sub">' + o.sub + '</div>' : '') + '</div>' +
      (o.actions ? '<div class="actions">' + o.actions + '</div>' : '') + '</div>';
  };
  ui.kpi = function (o) {
    return '<div class="kpi ' + (o.tone || '') + (o.href ? ' link" onclick="location.hash=\'' + o.href + '\'' : '') + '"><div class="lbl"><span class="ic">' + ui.icon(o.icon || 'chart', 'sm') + '</span>' + util.esc(o.label) + '</div>' +
      '<div class="val" title="' + util.esc(o.title || '') + '">' + o.value + '</div>' + (o.meta ? '<div class="meta">' + o.meta + '</div>' : '') + '</div>';
  };
  ui.options = function (list, selected, placeholder) {
    return (placeholder !== undefined ? '<option value="">' + util.esc(placeholder) + '</option>' : '') +
      list.map(o => { const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; return '<option value="' + util.esc(v) + '"' + (String(v) === String(selected === undefined ? '' : selected) ? ' selected' : '') + '>' + util.esc(l) + '</option>'; }).join('');
  };
  ui.categoryOptions = function (selected, type) {
    const cats = (Proc.PRS_CATEGORIES || []).filter(c => !type || c[0].indexOf(type === 'Works' ? 'Works' : type) === 0 || type === 'Exempt');
    const seen = new Set();
    return '<option value="">Select category…</option>' + cats.filter(c => { if (seen.has(c[1])) return false; seen.add(c[1]); return true; })
      .map(c => '<option value="' + util.esc(c[1]) + '"' + (c[1] === selected ? ' selected' : '') + '>' + util.esc(c[1]) + '</option>').join('') +
      (selected && !seen.has(selected) ? '<option selected>' + util.esc(selected) + '</option>' : '');
  };

  /** Collect named inputs inside a container into an object (numbers stay strings; checkboxes → boolean). */
  ui.formData = function (root) {
    const o = {};
    root.querySelectorAll('[name]').forEach(el => {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value.trim ? el.value.trim() : el.value;
    });
    return o;
  };

  /* Toasts */
  ui.toast = function (msg, type, ms) {
    type = type || 'success';
    let root = document.getElementById('toasts');
    if (!root) { root = document.createElement('div'); root.id = 'toasts'; root.className = 'toasts'; document.body.appendChild(root); }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = ui.icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : type === 'warning' ? 'alert' : 'info') + '<div>' + util.esc(msg) + '</div><span class="x">' + ui.icon('x', 'sm') + '</span>';
    el.querySelector('.x').onclick = () => el.remove();
    root.appendChild(el);
    while (root.children.length > 3) root.firstChild.remove();
    setTimeout(() => el.remove(), ms || (type === 'error' ? 7000 : 4000));
  };

  /* Modals */
  /**
   * ui.modal({ title, body (html), size: 'sm'|'lg'|'xl', actions: [{label, kind, onClick(close, el) → false keeps it open}], onOpen(el, close) })
   */
  ui.modal = function (o) {
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.innerHTML = '<div class="modal ' + (o.size || '') + '" role="dialog" aria-modal="true"><div class="modal-h"><h3>' + util.esc(o.title || '') + '</h3><button class="icon-btn" data-x>' + ui.icon('x') + '</button></div>' +
      '<div class="modal-b">' + (o.body || '') + '</div>' + ((o.actions || []).length ? '<div class="modal-f"></div>' : '') + '</div>';
    const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); if (o.onClose) o.onClose(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    scrim.querySelector('[data-x]').onclick = close;
    scrim.addEventListener('mousedown', e => { if (e.target === scrim && !o.sticky) close(); });
    const foot = scrim.querySelector('.modal-f');
    (o.actions || []).forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.kind || '');
      b.innerHTML = (a.icon ? ui.icon(a.icon, 'sm') : '') + util.esc(a.label);
      b.onclick = async () => {
        if (!a.onClick) return close();
        b.disabled = true;
        try { const r = await a.onClick(close, scrim.querySelector('.modal')); if (r !== false) close(); }
        catch (err) { console.error(err); ui.toast(err.message || String(err), 'error'); }
        finally { b.disabled = false; }
      };
      foot.appendChild(b);
    });
    document.body.appendChild(scrim);
    const first = scrim.querySelector('.modal-b input:not([type=hidden]):not([readonly]), .modal-b select, .modal-b textarea');
    if (first && !o.noFocus) setTimeout(() => first.focus(), 30);
    if (o.onOpen) o.onOpen(scrim.querySelector('.modal'), close);
    return { el: scrim.querySelector('.modal'), close };
  };
  ui.confirm = function (message, o) {
    o = o || {};
    return new Promise(resolve => {
      let done = false;
      ui.modal({
        title: o.title || 'Please confirm', size: 'sm', body: '<p>' + message + '</p>',
        onClose: () => { if (!done) resolve(false); },
        actions: [{ label: o.cancel || 'Cancel', kind: 'ghost', onClick: () => { done = true; resolve(false); } },
          { label: o.ok || 'Confirm', kind: o.danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } }]
      });
    });
  };
  /** Ask for a few fields. fields: [{name, label, type, value, options, required, hint, span}] → Promise<object|null> */
  ui.form = function (title, fields, o) {
    o = o || {};
    return new Promise(resolve => {
      let done = false;
      const body = '<div class="form-grid">' + fields.map(f => {
        const v = f.value === undefined || f.value === null ? '' : f.value;
        let input;
        if (f.type === 'select') input = '<select name="' + f.name + '">' + ui.options(f.options || [], v, f.placeholder) + '</select>';
        else if (f.type === 'textarea') input = '<textarea name="' + f.name + '" rows="' + (f.rows || 3) + '">' + util.esc(v) + '</textarea>';
        else if (f.type === 'checkbox') input = '<label class="check"><input type="checkbox" name="' + f.name + '"' + (v ? ' checked' : '') + '> ' + util.esc(f.checkLabel || '') + '</label>';
        else input = '<input type="' + (f.type || 'text') + '" name="' + f.name + '" value="' + util.esc(v) + '"' + (f.step ? ' step="' + f.step + '"' : '') + (f.placeholder ? ' placeholder="' + util.esc(f.placeholder) + '"' : '') + (f.list ? ' list="' + f.list + '"' : '') + '>';
        return '<div class="field ' + (f.span || 's12') + '"><label>' + util.esc(f.label) + (f.required ? '<span class="req">*</span>' : '') + '</label>' + input + (f.hint ? '<div class="hint">' + f.hint + '</div>' : '') + '</div>';
      }).join('') + '</div>';
      ui.modal({
        title, body, size: o.size, onClose: () => { if (!done) resolve(null); },
        actions: [{ label: 'Cancel', kind: 'ghost', onClick: () => { done = true; resolve(null); } }, {
          label: o.ok || 'Save', kind: 'primary', onClick: (close, el) => {
            const data = ui.formData(el);
            const missing = fields.filter(f => f.required && !data[f.name]);
            el.querySelectorAll('.field').forEach(x => x.classList.remove('invalid'));
            if (missing.length) { missing.forEach(f => { const inp = el.querySelector('[name="' + f.name + '"]'); if (inp) inp.closest('.field').classList.add('invalid'); }); ui.toast('Please fill in the required fields.', 'warning'); return false; }
            done = true; resolve(data);
          }
        }]
      });
    });
  };

  /** Dropdown menu attached to a button. items: [{label, icon, onClick, danger, sep, header}] */
  ui.menu = function (anchor, items, o) {
    o = o || {};
    document.querySelectorAll('.dd-menu.floating').forEach(m => m.remove());
    const m = document.createElement('div');
    m.className = 'dd-menu floating';
    m.style.position = 'fixed';
    items.forEach(it => {
      if (it.sep) { m.insertAdjacentHTML('beforeend', '<div class="dd-sep"></div>'); return; }
      if (it.header) { m.insertAdjacentHTML('beforeend', '<div class="dd-label">' + util.esc(it.header) + '</div>'); return; }
      const a = document.createElement('div');
      a.className = 'dd-item' + (it.danger ? ' danger' : '');
      a.innerHTML = (it.icon ? ui.icon(it.icon, 'sm') : '') + '<span>' + util.esc(it.label) + '</span>' + (it.hint ? '<span class="k">' + util.esc(it.hint) + '</span>' : '');
      a.onclick = e => { e.stopPropagation(); m.remove(); it.onClick && it.onClick(); };
      m.appendChild(a);
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    let left = o.align === 'left' ? r.left : r.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    setTimeout(() => {
      const off = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } };
      document.addEventListener('mousedown', off);
    }, 0);
    return m;
  };

  /**
   * Data table with search, sort, filters and paging.
   * ui.table(container, {
   *   columns: [{ key, label, render(row) → html, sort: (row) → value | true, cls: 'num', width }],
   *   rows, search: (row) → string, pageSize, onRow(row), empty: html, rowCls(row),
   *   toolbar: html (extra controls), filters: [{ key, label, options:[...], value, test(row, value) }],
   *   footer(rows) → html (tfoot cells), initialSort: { key, dir }
   * }) → { refresh(rows), state }
   */
  ui.table = function (container, o) {
    const st = { q: '', page: 0, sortKey: o.initialSort ? o.initialSort.key : null, dir: o.initialSort ? o.initialSort.dir : 1, filters: {} };
    (o.filters || []).forEach(f => { st.filters[f.key] = f.value || ''; });
    let rows = o.rows || [];
    const pageSize = o.pageSize || 25;
    container.innerHTML = '<div class="toolbar">' + (o.search !== false ? '<div class="search">' + ui.icon('search', 'sm') + '<input type="search" placeholder="' + util.esc(o.placeholder || 'Search…') + '"></div>' : '') +
      (o.filters || []).map(f => '<select data-filter="' + f.key + '" title="' + util.esc(f.label) + '">' + ui.options(f.options, st.filters[f.key], f.label) + '</select>').join('') +
      '<div class="spacer"></div>' + (o.toolbar || '') + '</div><div class="table-wrap"><table class="table ' + (o.compact ? 'compact' : '') + '"><thead></thead><tbody></tbody><tfoot></tfoot></table></div><div class="pager"></div>';
    const thead = container.querySelector('thead'), tbody = container.querySelector('tbody'), tfoot = container.querySelector('tfoot'), pager = container.querySelector('.pager');
    const inp = container.querySelector('.toolbar input[type=search]');
    if (o.search === false && !(o.filters || []).length && !o.toolbar) container.querySelector('.toolbar').remove();
    if (inp) inp.addEventListener('input', util.debounce(() => { st.q = inp.value.trim().toLowerCase(); st.page = 0; draw(); }, 120));
    container.querySelectorAll('[data-filter]').forEach(sel => sel.addEventListener('change', () => { st.filters[sel.dataset.filter] = sel.value; st.page = 0; draw(); }));
    function sortVal(col, r) { if (typeof col.sort === 'function') return col.sort(r); const v = r[col.key]; return v === undefined || v === null ? '' : v; }
    function visible() {
      let list = rows;
      (o.filters || []).forEach(f => { const v = st.filters[f.key]; if (v) list = list.filter(r => (f.test ? f.test(r, v) : String(r[f.key]) === v)); });
      if (st.q) {
        const terms = st.q.split(/\s+/);
        list = list.filter(r => { const hay = (o.search ? o.search(r) : Object.values(r).join(' ')).toLowerCase(); return terms.every(t => hay.indexOf(t) >= 0); });
      }
      if (st.sortKey) {
        const col = o.columns.find(c => c.key === st.sortKey);
        if (col) list = list.slice().sort((a, b) => { const x = sortVal(col, a), y = sortVal(col, b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * st.dir; });
      }
      return list;
    }
    function draw() {
      thead.innerHTML = '<tr>' + o.columns.map(c => '<th class="' + (c.cls || '') + (c.sort !== false ? ' sortable' : '') + '" data-k="' + c.key + '"' + (c.width ? ' style="width:' + c.width + '"' : '') + '>' + util.esc(c.label || '') +
        (st.sortKey === c.key ? '<span class="arr">' + (st.dir > 0 ? '▲' : '▼') + '</span>' : '') + '</th>').join('') + '</tr>';
      thead.querySelectorAll('th.sortable').forEach(th => th.onclick = () => { const k = th.dataset.k; if (st.sortKey === k) st.dir = -st.dir; else { st.sortKey = k; st.dir = 1; } draw(); });
      const list = visible();
      const pages = Math.max(1, Math.ceil(list.length / pageSize));
      if (st.page >= pages) st.page = pages - 1;
      const slice = list.slice(st.page * pageSize, st.page * pageSize + pageSize);
      if (!slice.length) tbody.innerHTML = '<tr><td colspan="' + o.columns.length + '" style="padding:0">' + (o.empty || ui.empty('search', rows.length ? 'No matches' : 'Nothing here yet', rows.length ? 'Try a different search or filter.' : '')) + '</td></tr>';
      else tbody.innerHTML = slice.map((r, i) => '<tr data-i="' + i + '" class="' + (o.onRow ? 'click ' : '') + (o.rowCls ? o.rowCls(r) : '') + '">' + o.columns.map(c => '<td class="' + (c.cls || '') + '">' + (c.render ? c.render(r) : util.esc(r[c.key])) + '</td>').join('') + '</tr>').join('');
      if (o.onRow) tbody.querySelectorAll('tr.click').forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('button, a, input, select, label')) return; o.onRow(slice[+tr.dataset.i], e); }));
      if (o.bind) o.bind(tbody, slice);
      tfoot.innerHTML = o.footer && list.length ? '<tr>' + o.footer(list) + '</tr>' : '';
      pager.innerHTML = '<span>' + (list.length ? (st.page * pageSize + 1) + '–' + Math.min(list.length, (st.page + 1) * pageSize) + ' of ' + util.int(list.length) : '0 records') + (list.length !== rows.length ? ' (filtered from ' + util.int(rows.length) + ')' : '') + '</span>' +
        (pages > 1 ? '<span class="row"><button class="btn xs" data-p="-1"' + (st.page ? '' : ' disabled') + '>' + ui.icon('chevron-left', 'sm') + '</button><span style="padding:0 6px">Page ' + (st.page + 1) + ' of ' + pages + '</span><button class="btn xs" data-p="1"' + (st.page < pages - 1 ? '' : ' disabled') + '>' + ui.icon('chevron-right', 'sm') + '</button></span>' : '');
      pager.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { st.page += +b.dataset.p; draw(); container.scrollIntoView({ block: 'nearest' }); });
      if (o.onDraw) o.onDraw(list);
    }
    draw();
    return { refresh(newRows) { if (newRows) rows = newRows; draw(); }, state: st, visible };
  };

  /** Vertical bar chart. data: [{label, value, title}] */
  ui.bars = function (data, o) {
    o = o || {};
    const max = Math.max.apply(null, data.map(d => d.value).concat([1]));
    return '<div class="bars" style="height:' + (o.height || 180) + 'px">' + data.map(d => '<div class="b" title="' + util.esc(d.title || (d.label + ': ' + util.money(d.value))) + '"><div class="col" style="height:' + Math.max(1, d.value / max * 100) + '%"></div><div class="x">' + util.esc(d.label) + '</div></div>').join('') + '</div>';
  };
  /** Horizontal ranked bars. data: [{label, value, sub, href}] */
  ui.hbars = function (data, o) {
    o = o || {};
    const max = Math.max.apply(null, data.map(d => d.value).concat([1]));
    return '<div class="hbar">' + data.map(d => '<div class="nm">' + (d.href ? '<a href="' + d.href + '">' + util.esc(d.label) + '</a>' : util.esc(d.label)) + '</div><div class="num strong">' + (o.fmt ? o.fmt(d.value) : util.moneyShort(d.value)) + '</div><div class="track"><div class="fill" style="width:' + (d.value / max * 100) + '%"></div></div>').join('') + '</div>';
  };

  /** Drag-and-drop / click-to-pick file zone. onFiles(FileList) */
  ui.dropzone = function (el, onFiles, o) {
    o = o || {};
    el.classList.add('dropzone');
    el.innerHTML = ui.icon('upload', 'lg') + '<div class="t">' + util.esc(o.title || 'Drop files here or click to browse') + '</div><div class="small">' + util.esc(o.hint || 'PDF, images, Word or Excel — scanned quotes, POs and invoices') + '</div>';
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = o.multiple !== false; input.hidden = true; if (o.accept) input.accept = o.accept;
    el.appendChild(input);
    el.addEventListener('click', e => { if (e.target !== input) input.click(); });
    input.addEventListener('change', () => { if (input.files.length) onFiles(Array.from(input.files)); input.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.remove('over'); }));
    el.addEventListener('drop', e => { if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files)); });
  };
  ui.fileIcon = function (doc) {
    const n = (doc.name || '').toLowerCase(), m = doc.mime || '';
    if (/pdf/.test(m) || n.endsWith('.pdf')) return '<div class="fi">PDF</div>';
    if (/^image\//.test(m)) return '<div class="fi img">IMG</div>';
    if (/sheet|excel|csv/.test(m) || /\.(xlsx?|csv)$/.test(n)) return '<div class="fi xls">XLS</div>';
    if (/word/.test(m) || /\.docx?$/.test(n)) return '<div class="fi doc">DOC</div>';
    return '<div class="fi doc">FILE</div>';
  };
  /** Standard document row with open / download / delete. */
  ui.docRow = function (d, o) {
    o = o || {};
    return '<div class="doc" data-doc="' + d.id + '">' + ui.fileIcon(d) + '<div class="body"><div class="nm" title="' + util.esc(d.name) + '">' + util.esc(d.title || d.name) + '</div><div class="mt">' +
      util.esc(d.kind) + (d.ref ? ' · ' + util.esc(d.ref) : '') + (d.amount ? ' · ' + util.money(d.amount) : '') + ' · ' + util.date(d.date) + ' · ' + util.fileSize(d.size) + (o.showSupplier && d.supplierId ? ' · ' + util.esc(domain.supplierName(d.supplierId)) : '') + '</div></div>' +
      '<button class="btn sm ghost icon" data-act="open" title="Open">' + ui.icon('eye', 'sm') + '</button><button class="btn sm ghost icon" data-act="download" title="Download">' + ui.icon('download', 'sm') + '</button>' +
      (o.noDelete ? '' : '<button class="btn sm ghost icon danger" data-act="delete" title="Delete">' + ui.icon('trash', 'sm') + '</button>') + '</div>';
  };
  /** Wire up buttons rendered by ui.docRow inside a container. */
  ui.bindDocs = function (root, onChange) {
    root.querySelectorAll('.doc[data-doc]').forEach(row => {
      row.querySelectorAll('[data-act]').forEach(b => b.onclick = async e => {
        e.stopPropagation();
        const id = row.dataset.doc;
        if (b.dataset.act === 'open') files.open(id);
        if (b.dataset.act === 'download') files.download(id);
        if (b.dataset.act === 'delete') {
          const d = store.get('documents', id);
          if (await ui.confirm('Delete <b>' + util.esc(d ? d.name : 'this document') + '</b>? This cannot be undone.', { danger: true, ok: 'Delete' })) {
            await files.remove(id); Proc.audit('Delete Document', d ? d.name : id, id); ui.toast('Document deleted'); onChange && onChange();
          }
        }
      });
    });
  };
  /**
   * Upload dialog: pick files, choose kind/supplier/links, save.
   * defaults: { supplierId, kind, links: {...}, ref, amount, lockSupplier }
   */
  ui.uploadDialog = function (defaults) {
    defaults = defaults || {};
    return new Promise(resolve => {
      let picked = [];
      const sups = store.list('suppliers').sort((a, b) => a.name.localeCompare(b.name));
      const body = '<div class="dz"></div><div class="picked small muted mt-1"></div><div class="form-grid mt-2">' +
        '<div class="field s6"><label>Document type</label><select name="kind">' + ui.options(K.DOC_KINDS, defaults.kind || 'Quotation') + '</select></div>' +
        '<div class="field s6"><label>Supplier</label><select name="supplierId"' + (defaults.lockSupplier ? ' disabled' : '') + '>' + ui.options(sups.map(s => ({ value: s.id, label: s.name })), defaults.supplierId || '', '— Not supplier specific —') + '</select></div>' +
        '<div class="field s4"><label>Reference / number</label><input name="ref" value="' + util.esc(defaults.ref || '') + '" placeholder="e.g. Invoice # or PO #"></div>' +
        '<div class="field s4"><label>Document date</label><input type="date" name="date" value="' + util.esc(defaults.date || util.today()) + '"></div>' +
        '<div class="field s4"><label>Amount (JMD)</label><input type="number" step="0.01" name="amount" value="' + util.esc(defaults.amount || '') + '"></div>' +
        '<div class="field s12"><label>Notes</label><input name="notes" value="' + util.esc(defaults.notes || '') + '"></div></div>';
      let done = false;
      ui.modal({
        title: defaults.title || 'Upload documents', size: 'lg', body, noFocus: true, onClose: () => { if (!done) resolve(null); },
        onOpen: el => {
          ui.dropzone(el.querySelector('.dz'), fs => { picked = picked.concat(fs); el.querySelector('.picked').innerHTML = picked.map(f => util.esc(f.name) + ' (' + util.fileSize(f.size) + ')').join('<br>'); });
        },
        actions: [{ label: 'Cancel', kind: 'ghost', onClick: () => { done = true; resolve(null); } }, {
          label: 'Upload', kind: 'primary', icon: 'upload', onClick: async (close, el) => {
            if (!picked.length) { ui.toast('Choose at least one file.', 'warning'); return false; }
            const f = ui.formData(el);
            const out = [];
            for (const file of picked) {
              out.push(await files.add(file, { kind: f.kind, supplierId: defaults.lockSupplier ? defaults.supplierId : f.supplierId, ref: f.ref, date: f.date, amount: util.num(f.amount) || 0, notes: f.notes, links: defaults.links || {} }));
            }
            done = true; ui.toast(out.length + ' ' + util.plural(out.length, 'document') + ' saved'); resolve(out);
          }
        }]
      });
    });
  };

  /** Keep a <datalist id="dl-suppliers"> of supplier names for autocomplete inputs. */
  ui.supplierDatalist = function () {
    let dl = document.getElementById('dl-suppliers');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'dl-suppliers'; document.body.appendChild(dl); }
    dl.innerHTML = store.list('suppliers').map(s => '<option value="' + util.esc(s.name) + '">').join('');
    return 'dl-suppliers';
  };
  ui.stepper = function (steps, current) {
    return '<div class="stepper">' + steps.map((s, i) => (i ? '<div class="step-line ' + (i <= current ? 'done' : '') + '"></div>' : '') +
      '<div class="step ' + (i < current ? 'done' : i === current ? 'cur' : '') + '"><span class="dot">' + (i < current ? ui.icon('check', 'sm') : i + 1) + '</span>' + util.esc(s) + '</div>').join('') + '</div>';
  };
  ui.routeHtml = function (route) {
    return '<div class="route">' + route.steps.map((s, i) => '<div class="route-step ' + (s.warn ? 'warn' : '') + '"><div class="n">' + (i + 1) + '</div><div><div class="t">' + util.esc(s.title) + '</div><div class="d">' + util.esc(s.detail || '') + '</div></div></div>').join('') + '</div>';
  };

  /**
   * Backups & recovery panel (used on every app's Settings page): daily copies on this computer,
   * download/merge them back, a full backup file, and documents that exist only on this computer.
   */
  ui.backupPanel = async function (el) {
    const days = await store.snapshots.list();
    const localDocs = store.list('documents').filter(d => !d.driveFileId);
    el.innerHTML = '<div class="card"><div class="card-h"><div><h3>Backups &amp; recovery</h3><div class="sub">A copy of all records is kept on this computer once a day (last 14 days)' + (sync.token() ? ', and in Google Drive under “' + GDRIVE.BACKUP_FOLDER + '” (last 60 days)' : '') + '. Restoring fills in what is missing and can bring back records deleted by mistake — nothing newer is overwritten.</div></div>' +
      '<button class="btn primary" data-full>' + ui.icon('download', 'sm') + 'Download full backup now</button></div>' +
      '<div class="card-b">' + (days.length ? '<div class="table-wrap"><table class="table compact"><thead><tr><th>Daily copy</th><th></th></tr></thead><tbody>' +
        days.map(d => '<tr><td>' + util.dateLong(d) + (d === util.today() ? ' <span class="chip">today</span>' : '') + '</td><td class="actions"><button class="btn sm" data-dl="' + d + '">' + ui.icon('download', 'sm') + 'Download</button> <button class="btn sm" data-rs="' + d + '">' + ui.icon('refresh', 'sm') + 'Restore…</button></td></tr>').join('') +
        '</tbody></table></div>' : '<p class="muted">The first daily copy is made at the next save.</p>') +
      '<div class="divider"></div>' + (localDocs.length ? '<div class="alert warning">' + ui.icon('alert') + '<div><div class="t">' + localDocs.length + ' ' + util.plural(localDocs.length, 'document is', 'documents are') + ' only on this computer</div>' +
        (sync.token() ? 'They are being copied to Google Drive a few at a time.' : 'Connect Google Drive (sign in on the Fixed Asset dashboard) so uploaded quotes, POs and invoices are kept off this computer too, or download them.') +
        ' <button class="btn sm" data-docs style="margin-left:6px">' + ui.icon('download', 'sm') + 'Download them</button></div></div>' : '<div class="alert success">' + ui.icon('check') + '<div>Every uploaded document has a copy in Google Drive.</div></div>') + '</div></div>';
    el.querySelector('[data-full]').onclick = () => { util.download(new Blob([store.exportJSON()], { type: 'application/json' }), 'procurement-backup-' + util.today() + '.json'); Proc.audit('Export Backup', 'Full backup downloaded'); };
    el.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => store.snapshots.download(b.dataset.dl).catch(e => ui.toast(e.message, 'error')));
    el.querySelectorAll('[data-rs]').forEach(b => b.onclick = async () => {
      const day = b.dataset.rs;
      let found = {};
      try { found = await store.snapshots.deleted(day); } catch (e) { return ui.toast(e.message, 'error'); }
      const kinds = Object.keys(found);
      const label = c => util.esc(c.replace(/([A-Z])/g, ' $1').replace(/^./, x => x.toUpperCase()));
      const list = kinds.length ? '<p style="margin-top:10px"><b>Deleted since then</b> — tick what you want back:</p>' + kinds.map(c => '<label class="check" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-undel="' + c + '"> ' + label(c) + ' <span class="chip">' + found[c].length + '</span></label>').join('') : '';
      ui.modal({
        title: 'Restore from ' + util.dateLong(day), size: 'sm',
        body: '<p>Records missing here are added back and older versions are filled in. Nothing changed after that day is overwritten.</p>' + list,
        actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Restore', kind: 'primary', icon: 'refresh', onClick: async (close, m) => {
          const picked = Array.from(m.querySelectorAll('[data-undel]:checked')).map(i => i.dataset.undel);
          const merged = await store.snapshots.restore(day);
          const back = picked.length ? await store.snapshots.undelete(day, picked) : 0;
          const n = merged + back;
          Proc.audit('Restore Backup', 'Daily copy ' + day + ' merged (' + merged + ' changes' + (back ? ', ' + back + ' deleted records brought back: ' + picked.join(', ') : '') + ')');
          ui.toast(n ? n + ' records brought back' : 'Nothing was missing', n ? 'success' : 'info');
        } }]
      });
    });
    const dd = el.querySelector('[data-docs]');
    if (dd) dd.onclick = async () => { for (const d of localDocs) { await files.download(d.id); await new Promise(r => setTimeout(r, 400)); } };
  };
  if (APP.id === 'stores') { Proc.storesSettingsHooks = Proc.storesSettingsHooks || []; Proc.storesSettingsHooks.push({ title: 'Backups & recovery', icon: 'cloud', render: el => ui.backupPanel(el) }); }

  /* --------------------------------------------------------------- auth */
  const CREDENTIALS_SHEET_ID = '1fVBNtjeltelPeHDlGffOyrfa4_vBreT0uNBEL8fvirQ';
  const SESSION_KEY = APP.id === 'procurement' ? 'procSession' : 'procSession-' + APP.id;
  const canUse = systems => (systems || []).indexOf(APP.system) >= 0 || (APP.system === 'intake' && (systems || []).indexOf('assets') >= 0);
  const auth = Proc.auth = {
    user: null,
    userName() { return auth.user ? (domainOfficerName() || auth.user.displayName) : 'System'; },
    async loadCredentials() {
      const url = 'https://docs.google.com/spreadsheets/d/' + CREDENTIALS_SHEET_ID + '/gviz/tq?tqx=out:csv';
      const proxies = [u => u, u => 'https://corsproxy.io/?' + encodeURIComponent(u), u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)];
      for (const p of proxies) {
        try {
          const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
          const resp = await fetch(p(url), { signal: ctl.signal }); clearTimeout(t);
          if (!resp.ok) continue;
          const text = await resp.text();
          if (!window.XLSX) break;
          const wb = XLSX.read(text, { type: 'string' });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: ['username', 'password', 'displayName', 'role', 'email', 'canExport', 'canRefresh'] });
          if (rows.length && String(rows[0].username).toLowerCase() === 'username') rows.shift();
          localStorage.setItem('procCachedCredentials', JSON.stringify(rows));
          return rows;
        } catch (e) { /* try next */ }
      }
      try { return JSON.parse(localStorage.getItem('procCachedCredentials') || 'null'); } catch (e) { return null; }
    },
    portalUsers() {
      try { const u = JSON.parse(localStorage.getItem('portalUserAccounts') || '[]'); return Array.isArray(u) ? u.filter(x => x.dashboard === APP.system || (APP.system === 'intake' && x.dashboard === 'assets')) : []; } catch (e) { return []; }
    },
    async login(username, password, onStatus) {
      const user = String(username || '').trim();
      onStatus && onStatus('Checking your account…');
      const creds = await auth.loadCredentials();
      let match = null;
      if (creds && creds.length) {
        const c = creds.find(r => r.username && String(r.username).trim() === user && r.password && String(r.password).trim() === password);
        if (c) match = { username: String(c.username).trim(), displayName: c.displayName || c.username, role: c.role || 'user', email: c.email || '' };
      }
      if (!match) {
        // Accounts made on the portal are stored as SHA-256 hashes (same salt as the asset dashboard).
        const hashed = await auth.hash(password);
        const p = auth.portalUsers().find(u => String(u.username).toLowerCase() === user.toLowerCase() && (u.passwordHash ? u.passwordHash === hashed : u.password === password));
        if (p) match = { username: p.username, displayName: p.displayName || p.username, role: p.role || 'procurement_officer', email: '' };
      }
      if (!match && APP.defaultUser && user.toLowerCase() === APP.defaultUser && password === '123') match = { username: APP.defaultUser, displayName: APP.name + ' Officer', role: APP.system + '_officer', email: '' };
      if (!match) throw new Error('Invalid username or password');
      auth.user = match;
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(match)); } catch (e) { /* ignore */ }
      Proc.audit('Login', 'Signed in: ' + match.displayName);
      return match;
    },
    async hash(pw) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(pw) + 'AssetDashboard_Salt_2024'));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    },
    /** Signed in already: this tab's own session, or the hospital portal's single sign-on session. */
    restore() {
      try {
        const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
        // A portal sign-in ends when the portal session does (sign-out in another tab, or 12 hours).
        const live = () => { try { const p = JSON.parse(sessionStorage.getItem('mphPortalSession') || localStorage.getItem('mphPortalSession') || 'null'); return p && p.exp > Date.now() && p.username === s.username; } catch (e) { return false; } };
        if (s && s.username && (!s.viaPortal || live())) { auth.user = s; return s; }
        if (s) sessionStorage.removeItem(SESSION_KEY);
      } catch (e) { /* ignore */ }
      try {
        // The portal keeps the sign-in for the tab and, for new tabs, on this computer until it expires.
        const p = JSON.parse(sessionStorage.getItem('mphPortalSession') || localStorage.getItem('mphPortalSession') || 'null');
        if (p && p.exp > Date.now() && canUse(p.systems)) {
          auth.user = { username: p.username, displayName: p.displayName, role: p.role === 'admin' ? 'admin' : p.role === 'operations' ? 'operations' : APP.system + '_officer', portalRole: p.role, email: p.email || '', viaPortal: true };
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(auth.user));
          Proc.audit('Login', 'Signed in through the hospital portal: ' + p.displayName);
        }
      } catch (e) { /* ignore */ }
      return auth.user;
    },
    logout() {
      Proc.audit('Logout', 'Signed out: ' + auth.userName());
      const viaPortal = auth.user && auth.user.viaPortal;
      auth.user = null;
      try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem('mphPortalSession'); localStorage.removeItem('mphPortalSession'); } catch (e) { /* ignore */ }
      void viaPortal;
      location.href = 'portal.html';
    }
  };
  function domainOfficerName() { const p = auth.user && store.db.settings.officers[auth.user.username]; return p && p.name; }

  /* -------------------------------------------------------------- router */
  /**
   * Page modules call Proc.page({ id, title, icon, section, order, render(el, params), count() }).
   * Route "#/suppliers/SUP-1" renders page "suppliers" with params ["SUP-1"].
   */
  Proc.pages = {};
  Proc.SECTIONS = ['Overview', 'Workflow', 'Records', 'Insights', 'Administration'];
  Proc.page = function (def) { Proc.pages[def.id] = def; if (router.started) router.renderNav(); };
  const router = Proc.router = {
    started: false,
    current: null,
    params: [],
    go(path) { location.hash = '#/' + String(path).replace(/^#?\/?/, ''); },
    parse() {
      const h = (location.hash || '').replace(/^#\/?/, '');
      const qi = h.indexOf('?');
      const parts = (qi >= 0 ? h.slice(0, qi) : h).split('/').filter(Boolean).map(decodeURIComponent);
      return { id: parts[0] || 'dashboard', params: parts.slice(1), query: parseQuery(h) };
    },
    async render() {
      const { id, params } = router.parse();
      const page = Proc.pages[id] || Proc.pages.dashboard;
      const view = document.getElementById('view');
      if (!page || !view) return;
      if (router.beforeLeave && router.hash !== location.hash) { const ok = await router.beforeLeave(); if (ok === false) return; }
      router.beforeLeave = null;
      router.current = page.id; router.params = params; router.hash = location.hash;
      document.querySelectorAll('.sb-link').forEach(a => a.classList.toggle('active', a.dataset.page === page.id));
      document.body.classList.remove('sb-open');
      view.innerHTML = '';
      setCrumbs([page.title].concat(params.length ? [params[0]] : []));
      document.title = page.title + ' · ' + APP.name + ' · ' + store.settings().org.hospital;
      try { await page.render(view, params); }
      catch (e) { console.error(e); view.innerHTML = '<div class="alert danger">' + ui.icon('alert') + '<div><div class="t">This page could not be displayed</div>' + util.esc(e.message) + '</div></div>'; }
      window.scrollTo(0, 0);
    },
    /** Re-render the current page (after a save elsewhere). */
    refresh() { if (router.started) router.render(); },
    renderNav() {
      const nav = document.getElementById('sbNav');
      if (!nav) return;
      const pages = Object.values(Proc.pages).filter(p => !p.hidden);
      nav.innerHTML = Proc.SECTIONS.map(sec => {
        const ps = pages.filter(p => (p.section || 'Workflow') === sec).sort((a, b) => (a.order || 50) - (b.order || 50));
        if (!ps.length) return '';
        return '<div class="sb-section"><div class="sb-section-title">' + sec + '</div>' + ps.map(p => {
          let c = ''; try { const n = p.count ? p.count() : 0; if (n) c = '<span class="count ' + (p.countAlert ? 'alert' : '') + '">' + n + '</span>'; } catch (e) { /* ignore */ }
          return '<a class="sb-link' + (router.current === p.id ? ' active' : '') + '" data-page="' + p.id + '" href="#/' + p.id + '">' + ui.icon(p.icon || 'file') + '<span>' + util.esc(p.title) + '</span>' + c + '</a>';
        }).join('') + '</div>';
      }).join('');
    },
    start() {
      router.started = true;
      window.addEventListener('hashchange', router.render);
      router.renderNav();
      router.render();
      store.on('change', util.debounce(() => router.renderNav(), 200));
    }
  };
  function parseQuery(h) { const i = h.indexOf('?'); const q = {}; if (i >= 0) h.slice(i + 1).split('&').forEach(p => { const [k, v] = p.split('='); q[decodeURIComponent(k)] = decodeURIComponent(v || ''); }); return q; }
  function setCrumbs(parts) {
    const el = document.getElementById('crumbs');
    if (!el) return;
    el.innerHTML = '<a href="#/dashboard">' + util.esc(APP.name) + '</a>' + parts.map((p, i) => ui.icon('chevron-right', 'sm') + '<span class="' + (i === parts.length - 1 ? 'cur' : '') + '">' + util.esc(p) + '</span>').join('');
  }
  ui.setCrumbs = setCrumbs;

  /* ------------------------------------------------------- global search */
  Proc.search = function (q) {
    q = String(q || '').trim().toLowerCase();
    if (q.length < 2) return [];
    const hit = (s) => String(s || '').toLowerCase().indexOf(q) >= 0;
    const out = [];
    store.list('suppliers').filter(s => hit(s.name) || hit(s.trn) || hit(s.contactPerson) || (s.aliases || []).some(hit)).slice(0, 6)
      .forEach(s => out.push({ group: 'Suppliers', icon: 'building', title: s.name, sub: [s.trn ? 'TRN ' + s.trn : '', (s.categories || [])[0]].filter(Boolean).join(' · '), href: '#/suppliers/' + s.id }));
    store.list('purchaseOrders').filter(p => hit(p.poNumber) || hit(p.description) || hit(p.supplierName) || hit(p.ref) || (p.items || []).some(i => hit(i.description))).slice(0, 8)
      .forEach(p => out.push({ group: 'Purchase orders', icon: 'cart', title: 'PO ' + (p.poNumber || '(draft)') + ' — ' + (p.supplierName || ''), sub: (p.description || '').slice(0, 80) + ' · ' + util.money(p.total), href: '#/orders/' + p.id }));
    store.list('comparisons').filter(c => hit(c.ref) || hit(c.subject)).slice(0, 5)
      .forEach(c => out.push({ group: 'Price comparisons', icon: 'scale', title: c.ref || c.subject, sub: c.subject, href: '#/sourcing/' + c.id }));
    store.list('memos').filter(m => hit(m.ref) || hit(m.subject)).slice(0, 5)
      .forEach(m => out.push({ group: 'Approval memos', icon: 'stamp', title: m.ref || m.subject, sub: m.subject + ' · ' + util.money(util.sum(m.awards || [], a => a.amount)), href: '#/memos/' + m.id }));
    store.list('requisitions').filter(r => hit(r.number) || hit(r.title) || hit(r.department)).slice(0, 5)
      .forEach(r => out.push({ group: 'Requisitions', icon: 'clipboard', title: (r.number || r.id) + ' — ' + (r.title || ''), sub: r.department, href: '#/requisitions/' + r.id }));
    store.list('invoices').filter(i => hit(i.invoiceNumber)).slice(0, 5)
      .forEach(i => out.push({ group: 'Invoices', icon: 'receipt', title: 'Invoice ' + i.invoiceNumber, sub: domain.supplierName(i.supplierId) + ' · ' + util.money(i.total), href: '#/invoices/' + i.id }));
    store.list('documents').filter(d => hit(d.name) || hit(d.title) || hit(d.ref)).slice(0, 5)
      .forEach(d => out.push({ group: 'Documents', icon: 'clip', title: d.title || d.name, sub: d.kind + (d.supplierId ? ' · ' + domain.supplierName(d.supplierId) : ''), href: '#/documents?doc=' + d.id }));
    return out;
  };

  /* ---------------------------------------------------------------- sync */
  /* Google Drive layout. Inside the hospital folder each unit has its own folder holding its own records:
       Procurement/  PROCUREMENT_RECORDS.json · Backups/ · Documents/
       Stores/       STORES_RECORDS.json      · Backups/ · Documents/
       Operations/   Whole-hospital Backups/ (a daily copy of every unit's records together)
       Administrator/ (the portal's user accounts — written by the portal)
     PROCUREMENT_BACKUP.json, the single shared file used before, is still read so nothing is lost. */
  const GDRIVE = { FOLDER_ID: '1Vocl734yPgv9F36zgjo1DsCB2HCLSNyr', LEGACY_FILE: 'PROCUREMENT_BACKUP.json',
    UNITS: { procurement: { folder: 'Procurement', file: 'PROCUREMENT_RECORDS.json', prefix: 'PROCUREMENT_RECORDS_' }, stores: { folder: 'Stores', file: 'STORES_RECORDS.json', prefix: 'STORES_RECORDS_' } },
    OPERATIONS: 'Operations', WHOLE: 'Whole-hospital Backups', BACKUPS: 'Backups', DOCS: 'Documents', BACKUP_FOLDER: 'Procurement/Backups, Stores/Backups and Operations' };
  /* Which unit's file a collection is saved in. Documents go with the unit that added them. */
  const STORES_COLLS = ['deliveries', 'stockItems', 'stockMoves', 'stockIssues', 'stockCounts', 'supplierReturns'];
  const unitOfColl = c => STORES_COLLS.indexOf(c) >= 0 ? 'stores' : 'procurement';
  const unitOfDoc = d => (d && d.app === 'stores') ? 'stores' : 'procurement';
  function unitData(unit) {
    const db = store.db, out = { schemaVersion: db.schemaVersion || 2, settings: db.settings, tombstones: {} };
    COLLECTIONS.forEach(c => {
      if (c === 'documents') { out.documents = (db.documents || []).filter(d => unitOfDoc(d) === unit); out.tombstones.documents = (db.tombstones || {}).documents || {}; return; }
      if (unitOfColl(c) !== unit) return;
      out[c] = db[c] || []; out.tombstones[c] = (db.tombstones || {})[c] || {};
    });
    if (unit === 'procurement') { out.auditLog = db.auditLog || []; if (db.importLog) out.importLog = db.importLog; }
    return out;
  }
  /* Built-in records (procurement/seed-*.js): added once per computer. A record is left out when this
     computer already holds it — the same id (even one deleted on purpose), or the same purchase order,
     supplier, budget line, budget month or award reference brought in by hand — and links to suppliers
     and budget lines are pointed at the copies already here. On a computer that syncs with Google Drive
     this runs after Drive's copy is merged in, so nothing imported elsewhere is doubled. */
  const SEED_ORDER = ['suppliers', 'budgetLines', 'budgetMonths', 'plans', 'prsLite', 'comparisons', 'requisitions', 'purchaseOrders', 'invoices', 'documents'];
  let seeding = null;
  /** Packs from procurement/seed (window.PROC_SEED_FILES, fetched once) and any loaded inline (window.PROC_SEEDS). */
  function applySeeds() {
    if (seeding) return seeding;
    seeding = (async () => {
      const st = store.settings(); st.seedsApplied = st.seedsApplied || {};
      const packs = (window.PROC_SEEDS || []).filter(p => p && p.id && !st.seedsApplied[p.id]);
      for (const f of (window.PROC_SEED_FILES || [])) {
        if (!f || !f.id || st.seedsApplied[f.id]) continue;
        try { const r = await fetch(f.url, { cache: 'no-cache' }); if (r.ok) packs.push(Object.assign({ id: f.id, label: f.label }, await r.json())); }
        catch (e) { console.warn('[Seed] could not load', f.url, e.message); }   // tried again next time
      }
      let total = 0;
      for (const pack of packs) total += applyPack(pack, st);
      if (packs.length) store.save();
      if (total) store.emit('change', { coll: 'seed', action: 'create' });
      return total;
    })().finally(() => { seeding = null; });
    return seeding;
  }
  function applyPack(pack, st) {
    const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const keyOf = {
      suppliers: r => 'S|' + domain.supplierKey(r.name),
      budgetLines: r => 'L|' + r.fy + '|' + norm(r.name),
      budgetMonths: r => 'M|' + r.month,
      plans: r => 'P|' + r.fy + '|' + norm(r.category) + '|' + norm(r.description) + '|' + util.round2(util.num(r.estimate)),
      prsLite: r => 'T|' + r.ym,
      comparisons: r => 'C|' + r.ref,
      requisitions: r => 'R|' + norm(r.title) + '|' + r.date,
      purchaseOrders: r => r.poNumber ? 'P|' + String(r.poNumber).trim() + '|' + domain.supplierKey(r.supplierName) : 'D|' + norm(r.description) + '|' + r.date,
      invoices: r => 'I|' + r.poId + '|' + norm(r.invoiceNumber),
      documents: r => 'F|' + norm(r.name)
    };
    // A second way to recognise a purchase order already here: same number and amount (the supplier's
    // name may be spelt differently in a log imported by hand).
    const altOf = { purchaseOrders: r => (r.poNumber && util.num(r.total) ? 'Q|' + String(r.poNumber).trim() + '|' + Math.round(util.num(r.total)) : '') };
    const map = {}, sid = id => (id && map[id]) || id;
    let added = 0;
    const blobs = [];
    SEED_ORDER.forEach(coll => {
      const recs = (pack.records || {})[coll] || []; if (!recs.length) return;
      const arr = store.db[coll] = store.db[coll] || [];
      const tomb = (store.db.tombstones && store.db.tombstones[coll]) || {};
      const byKey = new Map(), alt = altOf[coll];
      arr.forEach(r => { if (!r._deleted) { try { byKey.set(keyOf[coll](r), r.id); const a = alt && alt(r); if (a) byKey.set(a, r.id); } catch (e) { /* odd record */ } } });
      const ids = new Set(arr.map(r => r.id));
      recs.forEach(src => {
        if (tomb[src.id] || ids.has(src.id)) { map[src.id] = src.id; return; }
        const r = JSON.parse(JSON.stringify(src));
        // Links to records this computer already had under another id.
        if (r.supplierId) r.supplierId = sid(r.supplierId);
        if (r.poId) r.poId = sid(r.poId);
        if (Array.isArray(r.entries)) r.entries.forEach(e => { if (e.lineId) e.lineId = sid(e.lineId); });
        if (coll === 'comparisons') {
          (r.suppliers || []).forEach(x => { x.supplierId = sid(x.supplierId); });
          Object.keys(r.prices || {}).forEach(i => { const o = {}; Object.keys(r.prices[i]).forEach(k => { o[sid(k)] = r.prices[i][k]; }); r.prices[i] = o; });
          Object.keys(r.awards || {}).forEach(i => { r.awards[i] = sid(r.awards[i]); });
          if (r.lotSupplierId) r.lotSupplierId = sid(r.lotSupplierId);
        }
        const k = keyOf[coll](r), a2 = alt && alt(r);
        if (byKey.has(k)) { map[src.id] = byKey.get(k); return; }
        if (a2 && byKey.has(a2)) { map[src.id] = byKey.get(a2); return; }
        // Running numbers continue this computer's own sequence.
        if (coll === 'comparisons' && r.number) r.number = store.next('cmp');
        if (coll === 'requisitions' && r.number) r.number = 'REQ-' + store.next('req');
        // Compared only with what this computer already had: the pack itself is already de-duplicated
        // (a plan can rightly list the same item twice).
        arr.push(r); ids.add(r.id); map[src.id] = r.id; added++;
        if (coll === 'documents' && r.seedFile) blobs.push(r);
      });
    });
    st.seedsApplied[pack.id] = Date.now();
    if (added) { try { Proc.audit('Built-in records', added + ' records added from ' + (pack.label || pack.id)); } catch (e) { /* audit not ready */ } }
    // The reference documents' files come from the site itself, in the background.
    blobs.forEach(d => { fetch(d.seedFile).then(x => (x.ok ? x.blob() : null)).then(b => b && files.putBlob(d.id, b)).catch(() => {}); });
    return added;
  }
  Proc.applySeeds = applySeeds;

  const sync = Proc.sync = {
    state: 'off', lastSync: null, fileId: null, docsFolderId: null, timer: null, busy: false,
    token() {
      const t = localStorage.getItem('assetDashboardGoogleAccessToken'), exp = localStorage.getItem('assetDashboardGoogleTokenExpiry');
      return t && exp && Date.now() < parseInt(exp, 10) ? t : null;
    },
    setState(s) { sync.state = s; store.emit('sync', s); },
    start() {
      if (sync.timer) return;
      if (!sync.token()) { sync.setState('off'); return; }
      sync.timer = setInterval(sync.run, 20000);
      sync.run();
      store.on('saved', util.debounce(() => { if (sync.token()) sync.run(); }, 3000));
    },
    async api(url, opts) {
      const t = sync.token(); if (!t) throw new Error('not connected');
      opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + t }, opts.headers || {});
      const r = await fetch(url, opts);
      if (r.status === 401) { sync.setState('off'); throw new Error('Google sign-in expired'); }
      if (!r.ok) throw new Error('Drive error ' + r.status);
      return r;
    },
    /** A folder by name inside a parent (created when missing), remembered for the session. */
    async folderIn(parent, name) {
      sync.folders = sync.folders || {};
      const k = parent + '/' + name;
      if (sync.folders[k]) return sync.folders[k];
      const q = "'" + parent + "' in parents and name='" + name.replace(/'/g, "\\'") + "' and mimeType='application/vnd.google-apps.folder' and trashed=false";
      const j = await (await sync.api('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id)')).json();
      if (j.files && j.files.length) return (sync.folders[k] = j.files[0].id);
      const c = await sync.api('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) });
      return (sync.folders[k] = (await c.json()).id);
    },
    folder(name) { return sync.folderIn(GDRIVE.FOLDER_ID, name); },
    unitFolder(unit) { return sync.folder(GDRIVE.UNITS[unit].folder); },
    async filesNamed(parent, name) {
      const q = "'" + parent + "' in parents and name='" + name + "' and trashed=false";
      const r = await sync.api('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&orderBy=modifiedTime%20desc&fields=files(id,modifiedTime)');
      return (await r.json()).files || [];
    },
    async upload(fileId, parent, name, blob) {
      if (fileId) { await sync.api('https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: blob }); return fileId; }
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name, parents: [parent], mimeType: 'application/json' })], { type: 'application/json' }));
      form.append('file', blob);
      const r = await sync.api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: form });
      return (await r.json()).id;
    },
    async run() {
      if (sync.busy) return;
      if (!sync.token()) { sync.setState('off'); return; }
      sync.busy = true; sync.setState('busy');
      try {
        sync.seen = sync.seen || {}; sync.fileIds = sync.fileIds || {};
        const folders = {};
        for (const u of Object.keys(GDRIVE.UNITS)) folders[u] = await sync.unitFolder(u);
        // Read every unit's records (and the old shared file), skipping copies unchanged since last read.
        const sources = [];
        for (const u of Object.keys(GDRIVE.UNITS)) {
          const found = await sync.filesNamed(folders[u], GDRIVE.UNITS[u].file);
          if (found.length) sync.fileIds[u] = found[0].id;
          found.forEach(f => sources.push(f));
        }
        (await sync.filesNamed(GDRIVE.FOLDER_ID, GDRIVE.LEGACY_FILE)).forEach(f => sources.push(f));
        for (const f of sources) {
          if (sync.seen[f.id] && sync.seen[f.id] === f.modifiedTime) continue;
          const text = await (await sync.api('https://www.googleapis.com/drive/v3/files/' + f.id + '?alt=media')).text();
          let cloud = null;
          try { cloud = JSON.parse(text); } catch (e) { cloud = null; }
          // Never write over a shared copy we could not read — it may hold other computers' work.
          if (!cloud || typeof cloud !== 'object') throw new Error('The Google Drive copy could not be read, so nothing was uploaded over it');
          store.merge(cloud);
          sync.seen[f.id] = f.modifiedTime;
        }
        await applySeeds();
        // Each unit's records go back to its own folder.
        const blobs = {};
        for (const u of Object.keys(GDRIVE.UNITS)) {
          blobs[u] = new Blob([JSON.stringify({ version: '2.0', type: 'procurement', unit: u, timestamp: new Date().toISOString(), data: unitData(u) })], { type: 'application/json' });
          sync.fileIds[u] = await sync.upload(sync.fileIds[u], folders[u], GDRIVE.UNITS[u].file, blobs[u]);
          delete sync.seen[sync.fileIds[u]];   // our own upload: no need to read it back, but the next change elsewhere will be
        }
        sync.fileId = sync.fileIds.procurement;
        await sync.dailySnapshot(blobs, folders).catch(e => console.warn('[Proc sync] daily backup skipped', e.message));
        // Copy any documents that have not reached Drive yet.
        for (const d of store.list('documents').filter(x => !x.driveFileId && !x.seedFile).slice(0, 5)) await sync.uploadDoc(d).catch(() => {});
        sync.lastSync = Date.now(); sync.setState('on');
      } catch (e) {
        console.warn('[Proc sync]', e.message); sync.lastError = e.message; sync.setState(sync.token() ? 'err' : 'off');
        if (/could not be read/.test(e.message) && !sync.warnedUnreadable) { sync.warnedUnreadable = true; ui.toast(e.message + '. Your records are safe on this computer; ask the administrator to check the file in Google Drive.', 'error', 12000); }
      }
      finally { sync.busy = false; }
    },
    /** Once a day: each unit's records into its own Backups folder, and every unit together into
        Operations/Whole-hospital Backups. Copies older than 60 days are removed. */
    async dailySnapshot(blobs, folders) {
      const day = util.today();
      if (localStorage.getItem('procDriveSnapshotDay') === day) return;
      const cutoff = util.addDays(day, -60);
      const keep = async (folder, prefix, blob) => {
        const name = prefix + day + '.json';
        const q = "'" + folder + "' in parents and trashed=false";
        const list = (await (await sync.api('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)&pageSize=200')).json()).files || [];
        if (!list.some(f => f.name === name)) await sync.upload(null, folder, name, blob);
        for (const f of list) { const m = new RegExp('^' + prefix + '(\\d{4}-\\d{2}-\\d{2})\\.json$').exec(f.name); if (m && m[1] < cutoff) await sync.api('https://www.googleapis.com/drive/v3/files/' + f.id, { method: 'DELETE' }).catch(() => {}); }
      };
      for (const u of Object.keys(GDRIVE.UNITS)) await keep(await sync.folderIn(folders[u], GDRIVE.BACKUPS), GDRIVE.UNITS[u].prefix, blobs[u]);
      const ops = await sync.folderIn(await sync.folder(GDRIVE.OPERATIONS), GDRIVE.WHOLE);
      await keep(ops, 'WHOLE_HOSPITAL_', new Blob([JSON.stringify({ version: '2.0', type: 'procurement', timestamp: new Date().toISOString(), data: store.db })], { type: 'application/json' }));
      localStorage.setItem('procDriveSnapshotDay', day);
    },
    async docsFolder(unit) { return sync.folderIn(await sync.unitFolder(unit || 'procurement'), GDRIVE.DOCS); },
    async uploadDoc(doc) {
      if (!sync.token() || !doc || doc.driveFileId || doc.seedFile) return;
      const b = await files.getBlob(doc.id); if (!b) return;
      const folder = await sync.docsFolder(unitOfDoc(doc));
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: doc.id + ' - ' + doc.name, parents: [folder] })], { type: 'application/json' }));
      form.append('file', b);
      const r = await sync.api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: form });
      const id = (await r.json()).id;
      store.upsert('documents', { id: doc.id, driveFileId: id }, { silent: true });
    },
    async downloadDoc(doc) { const r = await sync.api('https://www.googleapis.com/drive/v3/files/' + doc.driveFileId + '?alt=media'); return await r.blob(); }
  };

  /* ----------------------------------------------------------- app shell */
  Proc.theme = {
    get() { try { return localStorage.getItem('procTheme') || 'light'; } catch (e) { return 'light'; } },
    set(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('procTheme', t); } catch (e) { /* ignore */ } },
    toggle() { Proc.theme.set(Proc.theme.get() === 'dark' ? 'light' : 'dark'); Proc.shell.renderTop(); }
  };
  Proc.theme.set(Proc.theme.get());

  /** Items in the "+ New" menu. Page modules may push more. */
  Proc.quickCreate = [];

  Proc.shell = {
    renderTop() {
      const u = auth.user; const off = domain.officer();
      const chip = document.getElementById('userChip');
      if (chip && u) chip.innerHTML = '<span class="avatar">' + util.esc(util.initials(off.name)) + '</span><span class="nm truncate">' + util.esc(off.name) + '</span>' + ui.icon('chevron-down', 'sm');
      const th = document.getElementById('themeBtn'); if (th) th.innerHTML = ui.icon(Proc.theme.get() === 'dark' ? 'sun' : 'moon');
    },
    bind() {
      document.getElementById('menuBtn').onclick = () => document.body.classList.toggle('sb-open');
      document.getElementById('sbScrim').onclick = () => document.body.classList.remove('sb-open');
      document.getElementById('themeBtn').onclick = Proc.theme.toggle;
      document.getElementById('userChip').onclick = e => ui.menu(e.currentTarget, [
        { header: domain.officer().title },
        { label: 'My profile & signature name', icon: 'user', onClick: () => Proc.shell.profileDialog() },
        { label: 'Settings', icon: 'settings', onClick: () => router.go('settings') },
        { label: 'Back to portal', icon: 'external', onClick: () => { location.href = 'portal.html'; } },
        { sep: true },
        { label: 'Sign out', icon: 'logout', danger: true, onClick: () => auth.logout() }
      ]);
      document.getElementById('newBtn').onclick = e => ui.menu(e.currentTarget, Proc.quickCreate.slice().sort((a, b) => (a.order || 50) - (b.order || 50)));
      // Global search
      const inp = document.getElementById('gsInput'), box = document.getElementById('gsResults');
      let sel = 0, hits = [];
      const draw = () => {
        if (!hits.length) { box.hidden = !inp.value.trim(); box.innerHTML = '<div class="hit"><span class="s">No matches</span></div>'; if (inp.value.trim().length < 2) box.hidden = true; return; }
        let g = ''; box.hidden = false;
        box.innerHTML = hits.map((h, i) => (h.group !== g ? '<div class="grp">' + (g = h.group) + '</div>' : '') + '<div class="hit ' + (i === sel ? 'sel' : '') + '" data-i="' + i + '">' + ui.icon(h.icon, 'sm') + '<div style="min-width:0"><div class="t truncate">' + util.esc(h.title) + '</div><div class="s truncate">' + util.esc(h.sub || '') + '</div></div></div>').join('');
        box.querySelectorAll('.hit[data-i]').forEach(el => el.onmousedown = e => { e.preventDefault(); go(+el.dataset.i); });
      };
      const go = i => { const h = hits[i]; if (!h) return; location.hash = h.href; inp.value = ''; box.hidden = true; inp.blur(); };
      inp.addEventListener('input', util.debounce(() => { hits = Proc.search(inp.value); sel = 0; draw(); }, 100));
      inp.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { sel = Math.min(hits.length - 1, sel + 1); draw(); e.preventDefault(); }
        if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
        if (e.key === 'Enter') go(sel);
        if (e.key === 'Escape') { inp.value = ''; box.hidden = true; inp.blur(); }
      });
      inp.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
      document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.focus(); inp.select(); } });
      // Sync indicator
      const syncEl = document.getElementById('sbSync');
      const showSync = s => {
        const label = { off: 'Saved on this computer', on: 'Synced to Google Drive', busy: 'Syncing…', err: 'Drive sync problem — retrying' }[s] || '';
        syncEl.innerHTML = '<span class="sync-dot ' + s + '"></span><span>' + label + (s === 'on' && sync.lastSync ? ' · ' + util.ago(sync.lastSync) : '') + '</span>';
      };
      store.on('sync', showSync); showSync(sync.state);
      store.on('saveError', e => {
        syncEl.innerHTML = '<span class="sync-dot err"></span><span>Not saved on this computer — download a backup</span>';
        if (Date.now() - saveErrorShownAt > 60000) { saveErrorShownAt = Date.now(); ui.toast(e.message + ' Download a backup from Settings → Data now, then free some browser storage.', 'error', 15000); }
      });
      store.on('saved', () => { if (/Not saved/.test(syncEl.textContent)) showSync(sync.state); });
      Proc.shell.bindBell();
    },
    /** Notification bell: messages addressed to this app (deliveries, new POs, assets to register…). */
    bindBell() {
      const btn = document.getElementById('bellBtn'); if (!btn) return;
      const draw = () => { const n = Proc.notifications.unread().length; btn.innerHTML = ui.icon('bell') + (n ? '<span class="bell-n">' + (n > 99 ? '99+' : n) + '</span>' : ''); btn.title = n ? n + ' unread notifications' : 'Notifications'; };
      draw(); store.on('change', util.debounce(draw, 300));
      btn.onclick = () => {
        const old = document.getElementById('bellPanel'); if (old) { old.remove(); return; }
        const list = Proc.notifications.mine().slice(0, 30); const u = auth.user ? auth.user.username : '';
        const panel = document.createElement('div'); panel.id = 'bellPanel'; panel.className = 'bell-panel';
        panel.innerHTML = '<div class="bell-h"><b>Notifications</b><button class="btn xs ghost" data-all>Mark all read</button></div>' +
          (list.length ? list.map(n => '<a class="bell-item' + ((n.readBy || {})[u] ? '' : ' unread') + '" data-id="' + n.id + '" href="' + util.esc(Proc.notifications.href(n) || 'javascript:void 0') + '"><div class="t">' + util.esc(n.title) + '</div>' + (n.body ? '<div class="s">' + util.esc(n.body) + '</div>' : '') + '<div class="w">' + util.ago(n.at) + (n.fromUser ? ' · ' + util.esc(n.fromUser) : '') + '</div></a>').join('') : '<div class="empty" style="padding:28px 16px">' + ui.icon('bell', 'lg') + '<p>No notifications yet.</p></div>');
        document.body.appendChild(panel);
        const r = btn.getBoundingClientRect(); panel.style.top = (r.bottom + 8) + 'px'; panel.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
        panel.querySelector('[data-all]').onclick = e => { e.preventDefault(); Proc.notifications.markRead(list.map(n => n.id)); panel.remove(); draw(); };
        panel.querySelectorAll('.bell-item').forEach(a => a.addEventListener('click', () => { Proc.notifications.markRead([a.dataset.id]); panel.remove(); draw(); }));
        setTimeout(() => { const off = e => { if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { panel.remove(); document.removeEventListener('mousedown', off); } }; document.addEventListener('mousedown', off); }, 0);
      };
    },
    profileDialog(first) {
      const u = auth.user; if (!u) return Promise.resolve();
      const cur = store.settings().officers[u.username] || {};
      return ui.form(first ? 'Welcome — how should your name appear on ' + APP.profileWhere + '?' : 'My profile', [
        { name: 'name', label: 'Name as printed on ' + APP.profileWhere, value: cur.name || (u.displayName !== 'Procurement Officer' ? u.displayName : ''), required: true, placeholder: 'e.g. Ms. Christine Crawford', hint: 'Include your title (Mr./Ms./Mrs.) the way it appears on approval letters.' },
        { name: 'title', label: 'Job title', value: cur.title || (APP.defaultTitle || 'Public Procurement Officer'), required: true, span: 's6' },
        { name: 'phone', label: 'Phone / extension', value: cur.phone || '', span: 's6' },
        { name: 'email', label: 'Email', value: cur.email || u.email || '', type: 'email' }
      ], { ok: 'Save profile' }).then(v => {
        if (!v) return;
        const officers = Object.assign({}, store.settings().officers); officers[u.username] = v;
        store.saveSettings({ officers }); Proc.shell.renderTop(); ui.toast('Profile saved — ' + APP.profileWhere + ' will show ' + v.name);
      });
    }
  };

  /** Boot: called by procurement.html once all scripts are loaded. */
  Proc.boot = async function () {
    // Sign-in happens on the hospital portal only: without a portal sign-in for this system, go there.
    if (!auth.restore()) {
      const page = location.pathname.split('/').pop() || 'procurement.html';
      location.replace('portal.html?next=' + encodeURIComponent(page + (location.hash || '')));
      return;
    }
    store.load();
    await store.ready;
    // Not syncing with Drive: add the built-in records now (otherwise after the first Drive merge).
    if (!sync.token()) await applySeeds();
    // Ask the browser to keep this site's data even when the disk is short of space.
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {}); } catch (e) { /* not supported */ }
    const loginEl = document.getElementById('loginScreen'), appEl = document.getElementById('app');
    const enter = async () => {
      loginEl.hidden = true; appEl.hidden = false;
      Proc.shell.bind(); Proc.shell.renderTop(); ui.supplierDatalist();
      store.on('change', util.debounce(() => ui.supplierDatalist(), 400));
      router.start();
      sync.start();
      if (!store.settings().officers[auth.user.username]) setTimeout(() => Proc.shell.profileDialog(true), 400);
    };
    if (auth.restore()) return enter();
    const form = document.getElementById('loginForm'), err = document.getElementById('loginError'), status = document.getElementById('loginStatus');
    try { const h = JSON.parse(localStorage.getItem('portalHeadingSettings') || '{}'); if (h.hospitalName) document.querySelectorAll('[data-hospital]').forEach(e => { e.textContent = h.hospitalName; }); } catch (e) { /* ignore */ }
    form.onsubmit = async e => {
      e.preventDefault(); err.hidden = true;
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try { await auth.login(form.username.value, form.password.value, s => { status.textContent = s; }); status.textContent = ''; enter(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; status.textContent = ''; }
      finally { btn.disabled = false; }
    };
  };
})();
