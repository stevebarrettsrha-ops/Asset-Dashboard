/* ============================================================
   asset-normalizer.js — shared asset code + department normaliser
   Single source of truth for:
     • the canonical department/location list (mirrors the Location
       Records page; Location Records localStorage is authoritative
       once present)
     • asset-code parsing/normalisation to MPH/DEPT/ITEM/SEQ[/YEAR]
     • department-name canonicalisation (all historical spellings)
   Loaded by index.html, locations.html, stores.html, procurement.html.
   Generated together with register-seed.js on 2026-07-17.
   ============================================================ */
(function () {
'use strict';

window.MPH_CANONICAL_DEPARTMENTS = [{"name": "Accident & Emergency", "token": "AE", "icon": "🚑", "aliases": ["Accident and Emergency Department", "Accident and Emergency", "A&E Casualty", "Triage Area", "Triage Doctors Office", "Triage Medication Room", "Triage Nurse Station"]}, {"name": "Central Sterile Supply Department", "token": "CSSD", "icon": "🧼", "aliases": ["C.S.S.D", "CSSD - Central Sterilization and Storage Department", "Central Sterile and Storge Department"]}, {"name": "Dietary Department", "token": "DD", "icon": "🍽️", "aliases": ["Dietetics/Dietary Department", "Dietetrics Department", "Dietetrics", "Dietetics Department", "Dietetics", "Dietary"]}, {"name": "Female Medical Ward", "token": "FMW", "icon": "🛏️", "aliases": ["Female Medical", "Female medical Ward"]}, {"name": "Field Hospital", "token": "FH", "icon": "⛺", "aliases": ["FIELD HOSPITAL"]}, {"name": "Front Administrative Department", "token": "ADM", "icon": "🏢", "aliases": ["Front Administration Department", "Front Administration - Reception Area", "Front Administration (Telephone Operator)"]}, {"name": "General Stores Department", "token": "GS", "icon": "📦", "aliases": ["GENERAL STORES", "General Stores", "Stores Department", "In Storage", "Incinerator"]}, {"name": "Hospital Blood Bank", "token": "BB", "icon": "🩸", "aliases": ["Blood Bank", "Blood Bank Department"]}, {"name": "Isolation Ward", "token": "ISO", "icon": "🚪", "aliases": ["Isolation"]}, {"name": "Laboratory Department", "token": "LAB", "icon": "🔬", "aliases": ["Laboratory"]}, {"name": "Laundry Department", "token": "LD", "icon": "🧺", "aliases": ["Laundy Department"]}, {"name": "Maintenance Department", "token": "MD", "icon": "🔧", "aliases": []}, {"name": "Male Medical Ward", "token": "MM", "icon": "🛏️", "aliases": ["Male Medical", "Male Medical (MM)"]}, {"name": "Male Surgical Ward", "token": "MS", "icon": "🛏️", "aliases": ["Male Surgical", "Male Surgical ward"]}, {"name": "Maternity Ward", "token": "MAT", "icon": "🤱", "aliases": ["Maternity", "Maternity Ward - Gynocology Consultant"]}, {"name": "Medical Records Department", "token": "MR", "icon": "🗂️", "aliases": ["Medical Records", "Medical Record Department", "Medical Records Out Patient Dept.", "Medical Records-Out Patient Dept."]}, {"name": "Nursing Office", "token": "NO", "icon": "🩺", "aliases": []}, {"name": "Operating Theatre", "token": "OT", "icon": "🔪", "aliases": ["Operating Theatre Department"]}, {"name": "Out Patient Department (OPD)", "token": "OPD", "icon": "🏥", "aliases": ["Out Patient Department", "OPD Department", "OPD Nurse Station", "Outpatient Department (OT)", "OPD Room 2", "OPD Room 5", "OPD Room 8", "OPD Room 9", "OPD Room 13", "OPD Room 14", "OPD Room 15", "OPD Room 16"]}, {"name": "Paediatrics Ward", "token": "PD", "icon": "🧸", "aliases": ["Paediatrics", "Pediatrics & SCN", "Paediatric Ward"]}, {"name": "Radiology Department", "token": "XRAY", "icon": "🩻", "aliases": ["Radiology/Xray", "Radiology/Xray Department", "Xray Department"]}, {"name": "Security Post", "token": "SP", "icon": "🛡️", "aliases": ["Exit Gate"]}, {"name": "Milestone Office", "token": "MLO", "icon": "🏛️", "aliases": []}, {"name": "1st Floor General Admin", "token": "ADM", "icon": "🏢", "aliases": []}, {"name": "2nd Floor General Admin", "token": "ADM", "icon": "🏢", "aliases": []}, {"name": "Female Surgical Ward", "token": "FS", "icon": "🛏️", "aliases": ["Female Surgical"]}, {"name": "Accounts Department", "token": "ACC", "icon": "💰", "aliases": []}, {"name": "Administrative Department", "token": "ADM", "icon": "🏢", "aliases": ["Administration", "Administration - Passage Way", "Administrative Department - Pantry", "Pantry"]}, {"name": "Administrator Office", "token": "ADMTR", "icon": "🖋️", "aliases": ["Administrator", "Administrators Office", "Hospital Administrator - Office"]}, {"name": "Annex Department", "token": "ANNEX", "icon": "🏚️", "aliases": []}, {"name": "Biomedical Engineer Office", "token": "BIOMED", "icon": "⚙️", "aliases": ["Bio-Medical Engineer Office"]}, {"name": "CCTV Office", "token": "CCTV", "icon": "📹", "aliases": ["CCTV Operator - Office"]}, {"name": "Chief Executive Officer Office", "token": "CEO", "icon": "👔", "aliases": ["Chief Executive Officer", "Chief Executive Officer - Office"]}, {"name": "CEO Secretary Office", "token": "SEC", "icon": "🗒️", "aliases": ["CEO Secretary - Office"]}, {"name": "Cashier Office", "token": "CSH", "icon": "💵", "aliases": []}, {"name": "Chief Orderly Office", "token": "CHFO", "icon": "🧑", "aliases": ["Chief Orderly", "Chief Orderly - Office"]}, {"name": "Consultants Office", "token": "CONS", "icon": "🩺", "aliases": ["Consultant Office", "Consultant Office (Medicine)", "Consultant Office (Surgery)", "Dr. Campbell Office"]}, {"name": "Customer Service Department", "token": "CS", "icon": "💁", "aliases": ["Customer Service"]}, {"name": "EHR Department", "token": "EHR", "icon": "💻", "aliases": ["Electronical Health Recoords", "Electronic Health Records", "Electronic Health Record"]}, {"name": "Emergency Operational Centre", "token": "EOC", "icon": "📡", "aliases": ["Emergency Operational Centre - EOC", "EOC Room"]}, {"name": "Fixed Asset Officer Office", "token": "FXA", "icon": "📋", "aliases": ["Fixed Asset Officer - Office"]}, {"name": "Help Desk", "token": "HD", "icon": "🛎️", "aliases": []}, {"name": "Human Resource Department", "token": "HR", "icon": "👥", "aliases": ["Human Resource Department (Personnel Office)", "Human Resource Management Department"]}, {"name": "ICT Department", "token": "ICT", "icon": "🖥️", "aliases": ["ICT (Information Communication and Technology)", "MIS/ICT Department", "M.I.S"]}, {"name": "In Service Department", "token": "INS", "icon": "🎓", "aliases": ["In Service", "In Service Nurse"]}, {"name": "Matron Office (DNS)", "token": "DNS", "icon": "🧑", "aliases": []}, {"name": "Nurses Quarters", "token": "NQ", "icon": "🏠", "aliases": []}, {"name": "Operations Department", "token": "OPS", "icon": "🛠️", "aliases": ["Operations Department (OPR-DEP)", "Operations Department (Assigned for meeting and special events)"]}, {"name": "Operations Manager Office", "token": "OPRM", "icon": "🗄️", "aliases": []}, {"name": "Physiotherapy Department", "token": "PHYSIO", "icon": "🦵", "aliases": ["Physio-therapy Department"]}, {"name": "Procurement Office", "token": "PRMO", "icon": "🧾", "aliases": ["Procurement Officer - Office"]}, {"name": "Senior Medical Officer Office", "token": "SMO", "icon": "🩺", "aliases": ["Senior Medical Officer - Office"]}, {"name": "SMO & DNS Secretary Office", "token": "SMOSEC", "icon": "🗒️", "aliases": ["SMO and DNS Secretary - Officer", "SMO&DNS Secretaries"]}, {"name": "Social Worker Office", "token": "SW", "icon": "🤝", "aliases": []}, {"name": "Special Care Nursery", "token": "SCN", "icon": "👶", "aliases": ["Special Care Nursery Department", "Nursery Ward"]}, {"name": "Staff Clinic", "token": "STC", "icon": "🩹", "aliases": ["Staff Clinic - Department"]}, {"name": "Transport Department", "token": "TD", "icon": "🚐", "aliases": ["Transportation Department"]}, {"name": "Unassigned – Data Needed", "token": "DN", "icon": "❓", "aliases": ["Other", "N/A", "-Data needed-", ""]}];

window.MPH_MULTI_DEPARTMENTS = {"Accident & Emergency Female Medical Isolation Ward Male Medical Male Surgical": ["Accident & Emergency", "Female Medical Ward", "Isolation Ward", "Male Medical Ward", "Male Surgical Ward"], "Accident and Emergency Maternity Paediatrics Male Medical": ["Accident & Emergency", "Maternity Ward", "Paediatrics Ward", "Male Medical Ward"], "Administrator Office, Senior Medical Officer - Office": ["Administrator Office", "Senior Medical Officer Office"], "Administrators Office, Consultants Office": ["Administrator Office", "Consultants Office"], "Female Medical, Female Surgical, Out Patient Department, Accident and Emergency, Male Medical Ward": ["Female Medical Ward", "Female Surgical Ward", "Out Patient Department (OPD)", "Accident & Emergency", "Male Medical Ward"], "Female Medical Male Surgical Maternity": ["Female Medical Ward", "Male Surgical Ward", "Maternity Ward"], "Front Administrative Building - CCTV Room, Accident and Emergency (Dr. Thompson)": ["CCTV Office", "Accident & Emergency"], "Front Administrative Building - Reception Area, Accident and Emergency": ["Front Administrative Department", "Accident & Emergency"], "Isolation Ward and Paediatric Ward": ["Isolation Ward", "Paediatrics Ward"], "Male Medical Ward, Isolation Ward": ["Male Medical Ward", "Isolation Ward"], "Male Surgical Ward, Male Medical Ward, Female Medical Ward, Female Surgical Ward": ["Male Surgical Ward", "Male Medical Ward", "Female Medical Ward", "Female Surgical Ward"], "Maternity Ward, Special Care Nursery": ["Maternity Ward", "Special Care Nursery"], "Out Patient Department, Female Medical Ward, Male Medical Ward": ["Out Patient Department (OPD)", "Female Medical Ward", "Male Medical Ward"], "Out Patient Department, Operating Theatre": ["Out Patient Department (OPD)", "Operating Theatre"], "Paediatrics, Male Surgical Ward": ["Paediatrics Ward", "Male Surgical Ward"], "Special Care Nursery, Accident and Emergency": ["Special Care Nursery", "Accident & Emergency"], "Electronic Health Record Field Hospital Medical Records Administrator Office Accounts Blood Bank": ["EHR Department", "Field Hospital", "Medical Records Department", "Administrator Office", "Accounts Department", "Hospital Blood Bank"]};

var TOKEN_ALIASES = {"A&E": "AE", "AE": "AE", "EMERGENCY": "AE", "A&EEMERGENCY": "AE", "AEEMERGENCY": "AE", "F.H": "FH", "FH": "FH", "GEN.STORES": "GS", "GENSTORES": "GS", "GEN": "GS", "G.S.D": "GS", "GSD": "GS", "PAED": "PD", "PEAD": "PD", "FM": "FMW", "FMW": "FMW", "FSW": "FS", "FS": "FS", "MSW": "MS", "MS": "MS", "M.S": "MS", "MMW": "MM", "MM": "MM", "M.M": "MM", "MAT.": "MAT", "MAT": "MAT", "L.D": "LD", "LD": "LD", "CCSD": "CSSD", "X": "XRAY", "XRAY": "XRAY", "MRO": "MR", "MR": "MR", "S.P": "SP", "SP": "SP", "E.O.C": "EOC", "EOC": "EOC", "E.H.R": "EHR", "EHR": "EHR", "PHY": "PHYSIO", "PHYSIO": "PHYSIO", "HRM": "HR", "HR": "HR", "TRANS": "TD", "TD": "TD", "ISN": "INS", "INS": "INS", "DATANEEDED": "DN", "DN": "DN", "ADMACC": "ACC"};

var UNASSIGNED_DEPT = 'Unassigned – Data Needed';

function K(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }

var ALIAS_TO_CANON = {};
window.MPH_CANONICAL_DEPARTMENTS.forEach(function (d) {
    ALIAS_TO_CANON[K(d.name)] = d.name;
    (d.aliases || []).forEach(function (a) { ALIAS_TO_CANON[K(a)] = d.name; });
});
var MULTI_K = {};
Object.keys(window.MPH_MULTI_DEPARTMENTS).forEach(function (k) {
    MULTI_K[K(k)] = window.MPH_MULTI_DEPARTMENTS[k];
});
var TOKEN_BY_DEPT = {};
var NAME_BY_TOKEN = {};
window.MPH_CANONICAL_DEPARTMENTS.forEach(function (d) {
    TOKEN_BY_DEPT[d.name] = d.token;
    if (!NAME_BY_TOKEN[d.token]) NAME_BY_TOKEN[d.token] = d.name;
});

/* ---- department name canonicalisation ---- */
// returns { names: [canonical...], multi: bool } — names empty if unknown
window.mphCanonicalDepartment = function (raw) {
    var k = K(raw);
    if (MULTI_K[k]) return { names: MULTI_K[k].slice(), multi: true };
    if (ALIAS_TO_CANON[k]) return { names: [ALIAS_TO_CANON[k]], multi: false };
    return { names: [], multi: false };
};
window.mphUnassignedDept = UNASSIGNED_DEPT;
window.mphDeptToken = function (name) { return TOKEN_BY_DEPT[name] || null; };

// Distinctive aliases (name + every alias), longest first, for scanning a
// messy concatenated string like "Accident & Emergency Female Medical
// Isolation Ward Male Medical ...". Generic/empty aliases are excluded so
// they can't over-match.
var _SCAN_STOP = { 'other': 1, 'n/a': 1, '-data needed-': 1, '': 1,
                   'pantry': 1, 'annex': 1, 'isolation': 1 };
var _SCAN_ALIASES = [];
window.MPH_CANONICAL_DEPARTMENTS.forEach(function (d) {
    [d.name].concat(d.aliases || []).forEach(function (a) {
        var k = K(a);
        if (k.length >= 4 && !_SCAN_STOP[k]) _SCAN_ALIASES.push({ key: k, name: d.name });
    });
});
_SCAN_ALIASES.sort(function (a, b) { return b.key.length - a.key.length; });

// Split a messy department string into the canonical Locations named within
// it. Returns [] when nothing recognisable is found (a genuinely custom name).
window.mphSplitDepartmentString = function (raw) {
    // exact match first (single alias or known multi-string)
    var direct = window.mphCanonicalDepartment(raw);
    if (direct.names.length) return direct.names.slice();
    // otherwise scan for embedded location names
    var s = ' ' + K(raw).replace(/[,.\/;]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    var found = [];
    _SCAN_ALIASES.forEach(function (entry) {
        var needle = ' ' + entry.key + ' ';
        while (s.indexOf(needle) !== -1) {
            if (found.indexOf(entry.name) === -1) found.push(entry.name);
            s = s.replace(needle, '  ');
        }
    });
    return found;
};

/* ---- asset-code parsing ---- */
function normToken(t) {
    if (!t) return null;
    t = String(t).trim().toUpperCase();
    if (TOKEN_ALIASES[t]) return TOKEN_ALIASES[t];
    var nd = t.replace(/\./g, '');
    return TOKEN_ALIASES[nd] || nd;
}

// Parse any historical code shape into {dept, item, seq, year}
// Memoized: codes are stable, highly repeated strings and this sits on
// every consolidation/sync/series hot path (tens of thousands of calls
// per popup/render). The cache is keyed on the raw input string; results
// are treated as read-only by all callers.
var _parseCodeCache = new Map();
window.mphParseCode = function (code) {
    if (code == null || !String(code).trim()) return null;
    var raw = String(code);
    if (_parseCodeCache.has(raw)) return _parseCodeCache.get(raw);
    var result = _mphParseCodeUncached(raw);
    // bound the cache so a pathological import can't grow it without limit
    if (_parseCodeCache.size > 50000) _parseCodeCache.clear();
    _parseCodeCache.set(raw, result);
    return result;
};
function _mphParseCodeUncached(code) {
    var c = String(code).trim().toUpperCase();
    var m = c.match(/\(([^)]+)\)/);
    if (m && m[1].indexOf('MPH') !== -1) {
        var inner = window.mphParseCode(m[1]);
        if (inner && (inner.dept || inner.item)) return inner;
    }
    c = c.replace(/\(.*?\)/g, ' ');
    // drop a spurious trailing " -NN" suffix (space before the dash), e.g.
    // "MPH/139/19/A.E -01" -> "MPH/139/19/A.E". A real range like "19-26"
    // has no space and is left intact.
    c = c.replace(/\s+-\s*\d+\s*$/, '');
    c = c.replace(/\\/g, '/').replace(/-/g, '/').replace(/_/g, '/').replace(/\s+/g, '/');
    var parts = c.split('/').filter(function (p) { return p && p !== 'MPH' && p !== 'M.P.H'; });
    // split glued tokens: 20XRAY -> 20|XRAY, ISO193 -> ISO|193, MPH180 -> MPH|180
    var expanded = [];
    parts.forEach(function (p) {
        var g = p.match(/^(\d+)([A-Z&.]{2,})$/) || p.match(/^([A-Z&.]{2,})(\d+)$/);
        if (g) { expanded.push(g[1], g[2]); } else { expanded.push(p); }
    });
    expanded = expanded.filter(function (p) { var n = p.replace(/\./g, ''); return n !== 'MPH' && n !== 'CHMPH'; });
    var year = null, nums = [], alphas = [];
    expanded.forEach(function (p) {
        if (/^20\d\d$/.test(p) && year === null && nums.length >= 1) { year = p; return; }
        if (/^\d+$/.test(p) || /^\d+[A-Z]$/.test(p)) { nums.push(p); }
        else { var a = p.replace(/[^A-Z&]/g, ''); if (a) alphas.push(a); }
    });
    var dept = alphas.length ? normToken(alphas.join('.')) : null;
    var item = null, seq = null;
    if (nums.length >= 2) {
        item = nums[0]; seq = nums.slice(1).join('-');
    } else if (nums.length === 1) {
        if (nums[0].length <= 2) { seq = nums[0]; } else { item = nums[0]; }
    }
    if (!dept && !item) return null;
    return { dept: dept, item: item, seq: seq, year: year };
};

// Canonical string form; deptName (optional) supplies the token when the code has none
window.mphNormalizeCode = function (code, deptName) {
    var p = window.mphParseCode(code);
    if (!p) return null;
    var tok = p.dept;
    // garbled/blended token (no real dept token is longer than 6 chars):
    // fall back to the department's canonical token
    if ((!tok || tok === 'DN' || tok.length > 6) && deptName && TOKEN_BY_DEPT[deptName] && deptName !== UNASSIGNED_DEPT) {
        tok = TOKEN_BY_DEPT[deptName];
    }
    if (!tok || tok.length > 6) tok = 'DN';
    var parts = ['MPH', tok, p.item || '000'];
    if (p.seq) parts.push(p.seq);
    if (p.year) parts.push(p.year);
    return parts.join('/');
};

// Strip a spurious trailing " -NN" suffix (space before the dash) from a code,
// e.g. "MPH/139/19/A.E -01" -> "MPH/139/19/A.E". A real range ("19-26", no
// space) is left untouched. Returns the trimmed string.
window.mphStripCodeSuffix = function (code) {
    return String(code == null ? '' : code).replace(/\s+-\s*\d+\s*$/, '').trim();
};

// Does this string look like an asset code rather than a department name?
window.mphLooksLikeCode = function (s) {
    s = String(s || '');
    if (/\bMPH\b/i.test(s)) return true;
    if (/\bLTH\b/i.test(s)) return true;
    // has a slash/dash-separated numeric segment, e.g. "119/01-03"
    if (/\d+\s*[\/\-]\s*\d+/.test(s) && /[\/\-]/.test(s)) return true;
    return false;
};

// Canonical department NAME an asset code belongs to (via its dept token),
// or null if it can't be resolved.
window.mphDepartmentForCode = function (code) {
    var p = window.mphParseCode(code);
    if (!p || !p.dept) return null;
    return NAME_BY_TOKEN[p.dept] || null;
};

// Identity key used for duplicate detection (case/format-insensitive)
window.mphCodeKey = function (code) {
    var p = window.mphParseCode(code);
    if (!p || (!p.dept && !p.item)) return null;
    var seq = (p.seq || '').replace(/[^0-9A-Z]/g, '').replace(/^0+(?=.)/, '');
    var item = (p.item || '').replace(/^0+(?=.)/, '');
    return [(p.dept || ''), item, seq, (p.year || '')].join('|');
};

/* ---- department list shared source (Location Records is authoritative) ---- */
window.mphGetLocationRecords = function () {
    try {
        var d = window.mphGetLocationRecordsAny ? window.mphGetLocationRecordsAny() : null;
        if (d && Array.isArray(d.departments) && d.departments.length) return d;
    } catch (e) { /* fall through to canonical list */ }
    return null;
};

// All department/location names available to link assets to.
// Sourced from the Location Records page when present, always unioned with
// the canonical list so no department is ever missing from a dropdown.
window.mphGetHospitalDepartments = function () {
    var names = {};
    var order = [];
    function add(n) { if (n && !names[K(n)]) { names[K(n)] = true; order.push(n); } }
    var rec = window.mphGetLocationRecords();
    if (rec) rec.departments.forEach(function (d) { add(d.name); });
    window.MPH_CANONICAL_DEPARTMENTS.forEach(function (d) { add(d.name); });
    return order.sort(function (a, b) {
        if (a === UNASSIGNED_DEPT) return 1;
        if (b === UNASSIGNED_DEPT) return -1;
        return a.localeCompare(b);
    });
};

// Fill a <select> with the shared department list, preserving current value.
window.mphPopulateDeptSelect = function (sel, opts) {
    if (!sel) return;
    opts = opts || {};
    var current = sel.value;
    var keep = [];
    if (opts.firstOption) keep.push(opts.firstOption);   // e.g. {value:'',label:'All Departments'}
    sel.innerHTML = '';
    keep.forEach(function (o) {
        var el = document.createElement('option');
        el.value = o.value; el.textContent = o.label;
        sel.appendChild(el);
    });
    window.mphGetHospitalDepartments().forEach(function (n) {
        var el = document.createElement('option');
        el.value = n; el.textContent = n;
        sel.appendChild(el);
    });
    if (current && Array.prototype.some.call(sel.options, function (o) { return o.value === current; })) {
        sel.value = current;
    }
};

/* ---- reconcile Location Records to the canonical location list ---- */
// Collapses every messy / duplicate / renamed / multi-location department
// record into clean canonical Locations, MERGING rooms so nothing entered by
// a user is lost, then adds any canonical Location still missing. Idempotent:
// running it again on an already-clean store changes nothing. Returns the
// number of canonical Locations added (0 if only merges/renames happened).
function _findMeta(name) {
    for (var i = 0; i < window.MPH_CANONICAL_DEPARTMENTS.length; i++) {
        if (K(window.MPH_CANONICAL_DEPARTMENTS[i].name) === K(name)) {
            return window.MPH_CANONICAL_DEPARTMENTS[i];
        }
    }
    return null;
}
window.mphEnsureLocationDepartments = function () {
    var data = null;
    try { data = window.mphGetLocationRecordsAny ? window.mphGetLocationRecordsAny() : null; } catch (e) { return 0; }
    if (!data || !Array.isArray(data.departments)) data = { departments: [] };

    var before = JSON.stringify(data.departments.map(function (d) { return d.name; }));

    // Build canonical records in a stable order, merging any existing record
    // whose name maps (by alias or multi-split) to each canonical Location.
    var canonByName = {};      // canonical name -> record we are building
    var order = [];
    function ensureCanon(name) {
        if (canonByName[name]) return canonByName[name];
        var meta = _findMeta(name) || { token: 'DN', icon: '🏥' };
        var rec = { id: 'canon_d_' + String(meta.token).toLowerCase() + '_' + (order.length + 1),
                    name: name, icon: meta.icon || '🏥', location: name,
                    note: 'Canonical hospital Location', rooms: [] };
        canonByName[name] = rec;
        order.push(rec);
        return rec;
    }
    // Seed the canonical order first so the list always reads in a known order.
    window.MPH_CANONICAL_DEPARTMENTS.forEach(function (d) { ensureCanon(d.name); });

    var leftovers = [];        // records we could not map to any canonical Location
    data.departments.forEach(function (d) {
        var names = window.mphSplitDepartmentString(d.name);
        // an asset code masquerading as a department -> resolve to its Location
        if (names.length === 0 && window.mphLooksLikeCode(d.name)) {
            var dep = window.mphDepartmentForCode(d.name);
            names = dep ? [dep] : [UNASSIGNED_DEPT];
        }
        if (names.length === 0) {
            // genuine unknown name: keep it verbatim so we never silently drop it
            leftovers.push(d);
            return;
        }
        // map (single or multi) — rooms go to the FIRST target, other targets
        // are just guaranteed to exist (multi-location split of a folder record)
        var first = ensureCanon(names[0]);
        if (d.rooms && d.rooms.length) first.rooms = first.rooms.concat(d.rooms);
        for (var i = 1; i < names.length; i++) ensureCanon(names[i]);
    });

    data.departments = order.concat(leftovers);

    var after = JSON.stringify(data.departments.map(function (d) { return d.name; }));
    if (after !== before) {
        if (window.mphSaveLocationRecords) {
            if (!window.mphSaveLocationRecords(data)) return 0;
        } else {
            try { localStorage.setItem('hospitalLocationRecords', JSON.stringify(data)); }
            catch (e) { return 0; }
        }
    }
    // report how many canonical Locations are now present that weren't before
    return order.length;
};

/* ---- shared theme (dark mode) persistence across all pages ---- */
var THEME_KEY = 'assetDashboardTheme';
// Apply the saved theme as early as possible (call before/at DOMContentLoaded).
window.mphApplySavedTheme = function () {
    try {
        var t = localStorage.getItem(THEME_KEY);
        if (t === 'dark') document.body.classList.add('dark-mode');
        else if (t === 'light') document.body.classList.remove('dark-mode');
    } catch (e) { /* ignore */ }
};
// Persist the current theme; pass a boolean or read the body class.
window.mphSaveTheme = function (isDark) {
    if (typeof isDark === 'undefined') isDark = document.body.classList.contains('dark-mode');
    try { localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    return isDark;
};

/* ============================================================
   Location Records — shared merge + deletion tombstones
   Used by locations.html (seed refresh, cross-tab reload) AND
   index.html (cloud download/restore paths) so location data is
   always UNIONED, never wholesale-replaced. An empty or older
   copy (cloud or seed) can therefore never wipe local records.
   ============================================================ */
var LOC_RECORDS_KEY = 'hospitalLocationRecords';
var LOC_TOMBSTONES_KEY = 'hospitalLocationRecordsTombstones';

// Tombstones remember what a user deliberately deleted so a merge from the
// cloud (or a re-applied seed) doesn't resurrect it.
// Shape: { items: {id: iso}, codes: {codeKey: iso}, rooms: {id: iso},
//          departments: {nameKey: iso} }
//
// `codes` exists because a row id is NOT stable across devices: the same
// physical asset is carried by the seed under one id, by the dashboard's
// assign flow under another, and by a restored backup under a third. An
// id-only tombstone therefore blocked exactly one copy and the deleted item
// walked back in under a different id on the next merge. The asset code is
// the real-world identity, so deleting a coded item tombstones the code and
// the deletion holds on every page and every device.
window.mphGetLocationTombstones = function () {
    try {
        var t = JSON.parse(localStorage.getItem(LOC_TOMBSTONES_KEY) || 'null');
        if (t && typeof t === 'object') {
            return { items: t.items || {}, codes: t.codes || {}, rooms: t.rooms || {}, departments: t.departments || {} };
        }
    } catch (e) { /* ignore */ }
    return { items: {}, codes: {}, rooms: {}, departments: {} };
};
window.mphSaveLocationTombstones = function (t) {
    try { localStorage.setItem(LOC_TOMBSTONES_KEY, JSON.stringify(t)); } catch (e) { /* ignore */ }
};
// kind: 'items' | 'rooms' | 'departments'; key: id (or K(name) for departments)
window.mphAddLocationTombstone = function (kind, key) {
    if (!key) return;
    var t = window.mphGetLocationTombstones();
    if (!t[kind]) t[kind] = {};
    t[kind][key] = new Date().toISOString();
    window.mphSaveLocationTombstones(t);
};
window.mphClearLocationTombstone = function (kind, key) {
    var t = window.mphGetLocationTombstones();
    if (t[kind] && t[kind][key]) { delete t[kind][key]; window.mphSaveLocationTombstones(t); }
};
// Tombstone a deleted item by BOTH identities: its row id and, when it has a
// parseable asset code, that code. Use this everywhere an item is deleted.
window.mphTombstoneLocationItem = function (it) {
    if (!it) return;
    var t = window.mphGetLocationTombstones();
    var now = new Date().toISOString();
    var touched = false;
    if (it.id) { t.items[it.id] = now; touched = true; }
    var ck = window.mphCodeKey(it.assetCode);
    if (ck) { t.codes[ck] = now; touched = true; }
    if (touched) window.mphSaveLocationTombstones(t);
};
// Has this item been deliberately deleted (under either identity)?
window.mphIsItemTombstoned = function (it, tombs) {
    if (!it) return false;
    tombs = tombs || window.mphGetLocationTombstones();
    if (it.id && tombs.items && tombs.items[it.id]) return true;
    var ck = window.mphCodeKey(it.assetCode);
    return !!(ck && tombs.codes && tombs.codes[ck]);
};
// Undo a deletion for an item the user is deliberately (re-)placing.
window.mphUntombstoneLocationItem = function (it) {
    if (!it) return false;
    var t = window.mphGetLocationTombstones();
    var changed = false;
    if (it.id && t.items[it.id]) { delete t.items[it.id]; changed = true; }
    var ck = window.mphCodeKey(it.assetCode);
    if (ck && t.codes[ck]) { delete t.codes[ck]; changed = true; }
    if (changed) window.mphSaveLocationTombstones(t);
    return changed;
};
// Union tombstones arriving from the cloud into the local set.
window.mphMergeLocationTombstones = function (incoming) {
    if (!incoming || typeof incoming !== 'object') return false;
    var t = window.mphGetLocationTombstones();
    var changed = false;
    ['items', 'codes', 'rooms', 'departments'].forEach(function (kind) {
        if (!t[kind]) t[kind] = {};
        var src = incoming[kind] || {};
        Object.keys(src).forEach(function (k) {
            if (!t[kind][k]) { t[kind][k] = src[k]; changed = true; }
        });
    });
    if (changed) window.mphSaveLocationTombstones(t);
    return changed;
};

/* ---- transfer ledger: where each item was last deliberately placed ----
   Deleting is remembered by a tombstone; MOVING was not remembered by
   anything. The merge below is a union, so an older copy of the records
   (the cloud backup written before the move, a re-applied seed, a restored
   backup, or a peer device that hasn't synced yet) still carried the item
   in the department it was transferred FROM — and the union happily added
   it back there. The item then existed in both departments, and the
   department it left showed it again on the next refresh.

   The ledger fixes that at the source: every transfer records where the item
   went AND where it came from, keyed by an identity that survives a
   re-generated row id (the asset code when there is one, else the row id).
   It travels with the cloud backup exactly like tombstones do, newest entry
   wins, and mphApplyLocationMoves has the last word on placement inside
   every merge.

   Recording the ORIGIN is what keeps this surgical. 449 asset codes in the
   real survey data legitimately appear in more than one room (the same code
   written on several room sheets), so "one code, one row" would delete real
   records. A ledger entry can only ever remove a copy from a place the user
   personally moved that item out of; every other copy is left alone.
   Shape: { moves: { "<identity>":
              {dept, deptName, room, roomTitle, from:[{dept,room}], at} } } */
var LOC_MOVES_KEY = 'hospitalLocationRecordsMoves';
var LOC_MOVES_MAX = 20000;
var LOC_BUCKET_TITLE = 'Register Items — Room Not Yet Assigned';
window.mphLocationBucketTitle = LOC_BUCKET_TITLE;

// Identity of a physical item for transfer tracking. The asset code is the
// real-world identity and survives a row being re-created on another device;
// a code-less row can only be tracked by its id.
window.mphLocationMoveKey = function (it) {
    if (!it) return null;
    var ck = window.mphCodeKey(it.assetCode);
    if (ck) return 'c|' + ck;
    return it.id ? 'i|' + it.id : null;
};
window.mphGetLocationMoves = function () {
    try {
        var m = JSON.parse(localStorage.getItem(LOC_MOVES_KEY) || 'null');
        if (m && typeof m === 'object' && m.moves && typeof m.moves === 'object') return m;
    } catch (e) { /* ignore */ }
    return { moves: {} };
};
// Keep the ledger bounded (oldest entries drop first) so it can never grow
// into the localStorage quota that the records themselves had to escape.
function _pruneLocationMoves(m) {
    var keys = Object.keys(m.moves || {});
    if (keys.length <= LOC_MOVES_MAX) return m;
    keys.sort(function (a, b) {
        return String(m.moves[a] && m.moves[a].at || '').localeCompare(String(m.moves[b] && m.moves[b].at || ''));
    });
    keys.slice(0, keys.length - LOC_MOVES_MAX).forEach(function (k) { delete m.moves[k]; });
    return m;
}
window.mphSaveLocationMoves = function (m) {
    try { localStorage.setItem(LOC_MOVES_KEY, JSON.stringify(_pruneLocationMoves(m || { moves: {} }))); return true; }
    catch (e) { return false; }
};
var LOC_MOVE_ORIGINS_MAX = 8;
function _originList(from) {
    if (!from) return [];
    var arr = Array.isArray(from) ? from : [from];
    var out = [];
    arr.forEach(function (o) {
        if (!o || !o.dept) return;
        var e = { dept: K(o.dept), room: K((o.room && String(o.room).trim()) || LOC_BUCKET_TITLE) };
        for (var i = 0; i < out.length; i++) if (out[i].dept === e.dept && out[i].room === e.room) return;
        out.push(e);
    });
    return out;
}
// Record that `item` now lives in deptName › roomTitle, having come from
// `from` ({dept, room} or an array of them). A blank room means the
// department's register bucket. Origins accumulate across repeated moves, so
// an item transferred A → B → C never reappears in A or B.
window.mphRecordLocationMove = function (item, deptName, roomTitle, from) {
    var key = window.mphLocationMoveKey(item);
    if (!key || !deptName) return false;
    var title = (roomTitle && String(roomTitle).trim()) ? String(roomTitle).trim() : LOC_BUCKET_TITLE;
    var destDept = K(deptName), destRoom = K(title);
    var m = window.mphGetLocationMoves();
    var prev = m.moves[key];
    var origins = _originList(from);
    if (prev) {
        // everything the item has already left stays left, and wherever it
        // was before this move is now an origin too
        origins = origins.concat(_originList(prev.from || []));
        if (prev.dept) origins = origins.concat(_originList([{ dept: prev.dept, room: prev.roomTitle || prev.room }]));
    }
    origins = _originList(origins).filter(function (o) {
        return !(o.dept === destDept && o.room === destRoom);   // never disown the destination
    }).slice(0, LOC_MOVE_ORIGINS_MAX);
    m.moves[key] = {
        dept: destDept, deptName: String(deptName),
        room: destRoom, roomTitle: title,
        from: origins,
        itemId: (item && item.id) || '',
        at: new Date().toISOString()
    };
    return window.mphSaveLocationMoves(m);
};
// Is `it`, sitting in deptName › roomTitle, a copy left behind at a place the
// user transferred this item out of?
window.mphIsStaleLocationCopy = function (it, deptName, roomTitle, moves) {
    var key = window.mphLocationMoveKey(it);
    if (!key) return false;
    moves = moves || window.mphGetLocationMoves();
    var mv = (moves.moves || {})[key];
    if (!mv || !Array.isArray(mv.from) || !mv.from.length) return false;
    var d = K(deptName), r = K((roomTitle && String(roomTitle).trim()) || LOC_BUCKET_TITLE);
    if (d === mv.dept && r === mv.room) return false;           // this IS the destination
    for (var i = 0; i < mv.from.length; i++) {
        if (mv.from[i].dept === d && mv.from[i].room === r) return true;
    }
    return false;
};
/* ---- Location Records → Asset Register change queue ----
   The Location Records page is the field-survey view; the Asset Register is
   the financial record. An edit made in the records has to reach the
   register, but the two live in different stores and the records page also
   runs standalone (not embedded in the dashboard), where it cannot call into
   the dashboard at all — so a direct call was only ever made for one action,
   and only when embedded.

   Every change is instead appended here. The dashboard drains the queue on
   load and the moment it is told records changed, so an edit made on the
   standalone page still lands in the register the next time the dashboard is
   opened. Ops are idempotent: replaying one is a no-op.
   Op shape: { op:'place'|'edit'|'code'|'delete', code, ... , at } */
var LOC_REG_QUEUE_KEY = 'hospitalLocationRegisterQueue';
var LOC_REG_QUEUE_MAX = 5000;
window.mphGetRegisterQueue = function () {
    try {
        var q = JSON.parse(localStorage.getItem(LOC_REG_QUEUE_KEY) || 'null');
        if (Array.isArray(q)) return q;
    } catch (e) { /* ignore */ }
    return [];
};
window.mphQueueRegisterChange = function (op) {
    if (!op || !op.op) return false;
    var q = window.mphGetRegisterQueue();
    op.at = new Date().toISOString();
    q.push(op);
    if (q.length > LOC_REG_QUEUE_MAX) q = q.slice(q.length - LOC_REG_QUEUE_MAX);
    try { localStorage.setItem(LOC_REG_QUEUE_KEY, JSON.stringify(q)); return true; }
    catch (e) { return false; }
};
// Read and clear in one step — the caller owns the ops it takes.
window.mphTakeRegisterQueue = function () {
    var q = window.mphGetRegisterQueue();
    if (q.length) { try { localStorage.removeItem(LOC_REG_QUEUE_KEY); } catch (e) { /* ignore */ } }
    return q;
};
// Does any room still list this asset code? Used before a queued delete is
// allowed to remove the register asset: hundreds of codes appear on more than
// one room sheet, and removing one survey row must not delete the asset while
// another room still records it.
window.mphCodeStillInRecords = function (db, code) {
    var key = window.mphCodeKey(code);
    if (!key || !db || !Array.isArray(db.departments)) return false;
    for (var i = 0; i < db.departments.length; i++) {
        var rooms = (db.departments[i] && db.departments[i].rooms) || [];
        for (var j = 0; j < rooms.length; j++) {
            var items = (rooms[j] && rooms[j].items) || [];
            for (var k = 0; k < items.length; k++) {
                if (window.mphCodeKey(items[k].assetCode) === key) return true;
            }
        }
    }
    return false;
};

/* ---- Asset Register: read-only view for pages that do not own it ----
   The register lives in IndexedDB 'AssetDashboardDB'/appData under
   'assetInventoryData' and is written only by index.html. The Location
   Records page needs to READ it so that the next code it offers in a
   series is the same number the register itself would issue. Without
   this the standalone page saw only its own items, so every asset added
   on the register side since the last survey was invisible and the page
   handed out a number the register had already used.
   Read-only: nothing here ever writes to the register. */
var REG_IDB_NAME = 'AssetDashboardDB';
var REG_IDB_STORE = 'appData';
var REG_ASSETS_KEY = 'assetInventoryData';
var REG_DELETED_KEY = 'assetDeletedIds';
var _regCache = null;          // assets array once loaded, else null
var _regLoading = null;        // in-flight load promise

function _regIdbGet(key) {
    return new Promise(function (resolve, reject) {
        // Opened WITHOUT a version so this never fights the owner page over
        // the schema, and never fails because index.html bumped IDB_VERSION.
        var req = indexedDB.open(REG_IDB_NAME);
        req.onupgradeneeded = function () {
            if (!req.result.objectStoreNames.contains(REG_IDB_STORE)) {
                req.result.createObjectStore(REG_IDB_STORE);
            }
        };
        req.onerror = function () { reject(req.error); };
        req.onsuccess = function () {
            var dbh = req.result;
            if (!dbh.objectStoreNames.contains(REG_IDB_STORE)) { dbh.close(); resolve(undefined); return; }
            try {
                var tx = dbh.transaction(REG_IDB_STORE, 'readonly');
                var rq = tx.objectStore(REG_IDB_STORE).get(key);
                rq.onsuccess = function () { resolve(rq.result); dbh.close(); };
                rq.onerror = function () { reject(rq.error); dbh.close(); };
            } catch (e) { dbh.close(); reject(e); }
        };
    });
}
// The owner page falls back to localStorage when IndexedDB is unusable, and
// leaves a crash-safe flush copy mid-write; honour both, newest first.
function _regLegacyRead(key) {
    try {
        var flush = localStorage.getItem('__idbflush_' + key);
        if (flush) { var f = JSON.parse(flush); if (f) return f; }
    } catch (e) { /* ignore */ }
    try {
        var raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
}
/* Load (and cache) the register for read-only use. Resolves to an array —
   empty when this device has no register yet, which is not an error. */
window.mphLoadRegisterAssets = function () {
    if (_regLoading) return _regLoading;
    _regLoading = (function () {
        var read = (typeof indexedDB !== 'undefined')
            ? _regIdbGet(REG_ASSETS_KEY).catch(function () { return null; })
            : Promise.resolve(null);
        return read.then(function (assets) {
            if (!Array.isArray(assets)) assets = _regLegacyRead(REG_ASSETS_KEY);
            if (!Array.isArray(assets)) return [];
            var delRead = (typeof indexedDB !== 'undefined')
                ? _regIdbGet(REG_DELETED_KEY).catch(function () { return null; })
                : Promise.resolve(null);
            return delRead.then(function (del) {
                if (!Array.isArray(del)) del = _regLegacyRead(REG_DELETED_KEY);
                // Match the owner page's own accessor, which hides deleted ids.
                if (Array.isArray(del) && del.length) {
                    var gone = {};
                    del.forEach(function (id) { gone[id] = true; });
                    assets = assets.filter(function (a) { return a && !gone[a.id]; });
                }
                return assets;
            });
        }).then(function (assets) {
            _regCache = assets;
            return assets;
        }).catch(function () { _regCache = []; return []; });
    })();
    return _regLoading;
};
// Synchronous accessor for call sites that cannot await. Empty until
// mphLoadRegisterAssets() has resolved at least once.
window.mphGetRegisterAssetsAny = function () {
    return _regCache || [];
};
// Force the next read to hit storage again (the owner page saved).
window.mphInvalidateRegisterAssets = function () { _regLoading = null; };

/* ---- Next code in a series — one engine, every page ----
   A "series" is (department token, item group): the MPH/AE/133/… family.
   The next code is max(sequence seen) + 1, counting a physical item once
   however many sources mention it (register asset, its historical
   aliases, and the Location Records item that records it).

   This used to exist twice — the register-aware version in index.html and
   a records-only copy in locations.html — so the number you were offered
   depended on which page you asked. One implementation, both pages. */
window.mphNextCodeGroupDesc = function (group) {
    var g = String(group).replace(/^0+(?=.)/, '');
    var lists = [window.ASSET_CODES_1997 || [], window.ASSET_CODES_1998 || []];
    for (var i = 0; i < lists.length; i++) {
        for (var j = 0; j < lists[i].length; j++) {
            if (String(lists[i][j].code).replace(/^0+(?=.)/, '') === g) return lists[i][j].desc;
        }
    }
    return '';
};
window.mphComputeNextCodeSeries = function (deptName, assets, records) {
    var token = (window.mphDeptToken && window.mphDeptToken(deptName)) || null;
    var tokN = token ? token.replace(/[^A-Z&]/gi, '').toUpperCase() : null;
    var deptK = String(deptName || '').replace(/\s+/g, ' ').trim().toLowerCase();
    var groups = {};
    var seen = {};   // code identities already counted, across every source

    function feed(code, ownerDeptName) {
        if (!code) return false;
        var p = window.mphParseCode ? window.mphParseCode(code) : null;
        if (!p || !p.item) return false;
        var pTok = p.dept ? String(p.dept).replace(/[^A-Z&]/gi, '').toUpperCase() : null;
        // the series is defined by the code's own department token;
        // unmapped/custom departments match by assignment instead
        var ownerK = String(ownerDeptName || '').replace(/\s+/g, ' ').trim().toLowerCase();
        var match = tokN ? (pTok === tokN) : (!pTok && ownerK === deptK);
        if (!match) return false;
        var ck = window.mphCodeKey ? window.mphCodeKey(code) : String(code).toUpperCase();
        if (ck && seen[ck]) return true;   // same item, another source
        if (ck) seen[ck] = true;
        var g = groups[p.item] || (groups[p.item] = { group: p.item, count: 0, max: 0, pad: 2 });
        g.count++;
        String(p.seq || '').split('-').forEach(function (sq) {
            var n = parseInt(sq, 10);
            if (!isNaN(n)) {
                if (n > g.max) g.max = n;
                if (/^\d+$/.test(sq)) g.pad = Math.max(g.pad, sq.length);
            }
        });
        return true;
    }

    (assets || []).forEach(function (a) {
        if (!a) return;
        var codes = [a.assetCode].concat(a.aliases || []);
        for (var i = 0; i < codes.length; i++) {
            if (feed(codes[i], a.department)) break;   // one series entry per asset
        }
    });
    ((records && records.departments) || []).forEach(function (d) {
        (d.rooms || []).forEach(function (r) {
            (r.items || []).forEach(function (it) { feed(it.assetCode, d.name); });
        });
    });

    return Object.keys(groups).map(function (k) {
        var g = groups[k];
        var next = g.max + 1;
        return {
            group: g.group,
            count: g.count,
            max: g.max,
            pad: g.pad,
            next: next,
            nextCode: 'MPH/' + (token || 'DN') + '/' + g.group + '/' +
                String(next).padStart(Math.min(g.pad, 3), '0'),
            desc: window.mphNextCodeGroupDesc(g.group)
        };
    }).sort(function (a, b) { return b.count - a.count; });
};

// Drop an item's ledger entry — it was deleted, so it is not "placed"
// anywhere any more and must not be relocated back into the records.
window.mphForgetLocationMove = function (item) {
    var key = window.mphLocationMoveKey(item);
    if (!key) return false;
    var m = window.mphGetLocationMoves();
    if (!m.moves[key]) return false;
    delete m.moves[key];
    return window.mphSaveLocationMoves(m);
};
// Union the ledger arriving from the cloud into the local one; for an item
// both sides know about, the most recent transfer wins.
window.mphMergeLocationMoves = function (incoming) {
    if (!incoming || typeof incoming !== 'object') return false;
    var src = incoming.moves && typeof incoming.moves === 'object' ? incoming.moves : incoming;
    var m = window.mphGetLocationMoves();
    var changed = false;
    Object.keys(src).forEach(function (k) {
        var inc = src[k];
        if (!inc || typeof inc !== 'object' || !inc.dept) return;
        var cur = m.moves[k];
        if (!cur) { m.moves[k] = inc; changed = true; return; }
        // Newest transfer wins for the destination, but origins UNION: a peer
        // may know about a hop this device never saw, and an item must not
        // return to any location it has been moved out of.
        var origins = _originList((cur.from || []).concat(inc.from || []));
        var newest = String(cur.at || '') < String(inc.at || '') ? inc : cur;
        var older = newest === inc ? cur : inc;
        if (older.dept) origins = _originList(origins.concat([{ dept: older.dept, room: older.roomTitle || older.room }]));
        origins = origins.filter(function (o) { return !(o.dept === newest.dept && o.room === newest.room); })
                         .slice(0, LOC_MOVE_ORIGINS_MAX);
        var merged = {
            dept: newest.dept, deptName: newest.deptName, room: newest.room, roomTitle: newest.roomTitle,
            from: origins, itemId: newest.itemId || cur.itemId || '', at: newest.at || cur.at
        };
        if (JSON.stringify(merged) !== JSON.stringify(cur)) { m.moves[k] = merged; changed = true; }
    });
    if (changed) window.mphSaveLocationMoves(m);
    return changed;
};
var _locMoveRoomSeq = 0;
// Enforce the ledger on `db`. For every transferred item:
//   • a copy sitting where it was transferred FROM is removed, and
//   • if the item is nowhere to be found at its destination, that copy is
//     relocated there instead (a device that learned of the transfer only
//     through the synced ledger).
// Copies anywhere else are left untouched — the same asset code legitimately
// appears in several rooms in the survey data, and only the places this item
// was actually moved out of are the app's business. Returns true if the
// records changed.
window.mphApplyLocationMoves = function (db, moves) {
    if (!db || !Array.isArray(db.departments)) return false;
    moves = moves || window.mphGetLocationMoves();
    var table = (moves && moves.moves) || {};
    if (!Object.keys(table).length) return false;
    var changed = false;

    var placements = {};                    // identity -> [{dept, room, item}]
    var deptByKey = {};
    db.departments.forEach(function (d) {
        if (!d) return;
        if (d.name && !deptByKey[K(d.name)]) deptByKey[K(d.name)] = d;
        (d.rooms || []).forEach(function (r) {
            if (!r || !Array.isArray(r.items)) return;
            r.items.forEach(function (it) {
                var k = window.mphLocationMoveKey(it);
                if (!k || !table[k]) return;
                (placements[k] = placements[k] || []).push({ dept: d, room: r, item: it });
            });
        });
    });

    Object.keys(placements).forEach(function (k) {
        var mv = table[k];
        var origins = Array.isArray(mv.from) ? mv.from : [];
        var home = null, stale = [];
        placements[k].forEach(function (p) {
            var d = K(p.dept.name), r = K(p.room.title);
            if (!home && d === mv.dept && r === mv.room) { home = p; return; }
            for (var i = 0; i < origins.length; i++) {
                if (origins[i].dept === d && origins[i].room === r) { stale.push(p); return; }
            }
            // some other room that happens to carry the same code — not ours
        });
        function drop(p) {
            p.room.items = p.room.items.filter(function (x) { return x !== p.item; });
            changed = true;
        }
        if (home) { stale.forEach(drop); return; }   // already home: clear what it left behind
        if (!stale.length) return;                   // nothing of ours to move

        // The item is still sitting at a place it was transferred out of and
        // is absent from its destination: relocate it.
        var destDept = deptByKey[mv.dept];
        if (!destDept) return;               // department not present yet; retry next merge
        destDept.rooms = destDept.rooms || [];
        var destRoom = null;
        for (var i = 0; i < destDept.rooms.length; i++) {
            if (destDept.rooms[i] && K(destDept.rooms[i].title) === mv.room) { destRoom = destDept.rooms[i]; break; }
        }
        if (!destRoom) {
            destRoom = {
                id: 'move_r_' + Date.now().toString(36) + '_' + (++_locMoveRoomSeq),
                title: mv.roomTitle || LOC_BUCKET_TITLE,
                verifiedBy: '', dateUpdated: '', note: '', items: []
            };
            destDept.rooms.push(destRoom);
        }
        destRoom.items = destRoom.items || [];
        var keep = stale.shift();
        drop(keep);
        destRoom.items.push(keep.item);
        stale.forEach(drop);
        changed = true;
    });
    return changed;
};

// Identity of an item independent of its generated id: the asset-code key
// when it has a code, otherwise its text content.
function locItemKey(it) {
    var ck = window.mphCodeKey(it && it.assetCode);
    if (ck) return 'c|' + ck;
    return 't|' + K(it && it.item) + '|' + K(it && it.description) + '|' + K(it && it.remarks);
}

/* ---- Location Records store: IndexedDB-backed, in-memory cached ----
   The records blob is several MB. It used to live in localStorage, whose
   ~5MB per-origin quota it exhausted (helped by full-size seed-upgrade
   backups) — after which every save threw QuotaExceededError and the new
   record was silently lost on reload. The store now works like this:
   - IndexedDB ('MPHLocationRecordsDB'/kv) holds the records — no
     meaningful quota limit. A synchronous in-memory cache (_locCache)
     serves every existing sync call site.
   - mphLocationStoreReady resolves once the cache is loaded. On first
     run it MIGRATES the legacy localStorage copy into IndexedDB and
     removes it, freeing the old quota.
   - Writes update the cache immediately and persist async; a crash-safe
     localStorage flush covers a tab closed mid-write. When IndexedDB is
     unavailable (old browser / private mode) everything falls back to
     the legacy localStorage path with quota recovery.
   - Cross-tab/iframe: saves broadcast on 'mph-location-records'; other
     contexts refresh their cache from IndexedDB and notify listeners
     (mphOnLocationRecordsUpdated). */
var LOC_IDB_NAME = 'MPHLocationRecordsDB';
var LOC_IDB_STORE = 'kv';
var LOC_FLUSH_KEY = '__locflush_' + LOC_RECORDS_KEY;
var _locCache = null;          // latest records object (authoritative once loaded)
var _locLoaded = false;        // init finished
var _locWroteEarly = false;    // a save happened before init finished
var _locPending = 0;           // in-flight IndexedDB writes
var _locHasIDB = (typeof indexedDB !== 'undefined');
var _locListeners = [];
var _locChannel = null;
try { if (typeof BroadcastChannel !== 'undefined') _locChannel = new BroadcastChannel('mph-location-records'); } catch (e) {}

function _locIdbOpen() {
    return new Promise(function (resolve, reject) {
        var req = indexedDB.open(LOC_IDB_NAME, 1);
        req.onupgradeneeded = function () {
            if (!req.result.objectStoreNames.contains(LOC_IDB_STORE)) {
                req.result.createObjectStore(LOC_IDB_STORE);
            }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
    });
}
function _locIdbGet(key) {
    return _locIdbOpen().then(function (dbh) {
        return new Promise(function (resolve, reject) {
            var tx = dbh.transaction(LOC_IDB_STORE, 'readonly');
            var rq = tx.objectStore(LOC_IDB_STORE).get(key);
            rq.onsuccess = function () { resolve(rq.result); dbh.close(); };
            rq.onerror = function () { reject(rq.error); dbh.close(); };
        });
    });
}
function _locIdbPut(key, value) {
    return _locIdbOpen().then(function (dbh) {
        return new Promise(function (resolve, reject) {
            var tx = dbh.transaction(LOC_IDB_STORE, 'readwrite');
            tx.objectStore(LOC_IDB_STORE).put(value, key);
            tx.oncomplete = function () { resolve(); dbh.close(); };
            tx.onerror = function () { reject(tx.error); dbh.close(); };
            tx.onabort = function () { reject(tx.error); dbh.close(); };
        });
    });
}
function _locLegacyRead() {
    try {
        var raw = localStorage.getItem(LOC_RECORDS_KEY);
        if (raw) {
            var d = JSON.parse(raw);
            if (d && Array.isArray(d.departments)) return d;
        }
    } catch (e) {}
    return null;
}
// Legacy localStorage write with quota recovery (fallback when no IndexedDB).
function _locLegacyWrite(db) {
    var raw;
    try { raw = JSON.stringify(db); } catch (e) { return false; }
    try { localStorage.setItem(LOC_RECORDS_KEY, raw); return true; }
    catch (e) { /* storage full — free space and retry below */ }
    try {
        window.mphPruneLocationBackups(0);   // records beat old backups
        localStorage.setItem(LOC_RECORDS_KEY, raw);
        return true;
    } catch (e2) { return false; }
}
window.mphPruneLocationBackups = function (keep) {
    keep = (typeof keep === 'number') ? keep : 1;
    try {
        var prefix = LOC_RECORDS_KEY + '_backup_v';
        var found = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(prefix) === 0) {
                found.push({ key: k, v: parseInt(k.slice(prefix.length), 10) || 0 });
            }
        }
        found.sort(function (a, b) { return b.v - a.v; });   // newest first
        var removed = 0;
        found.slice(keep).forEach(function (b) {
            try { localStorage.removeItem(b.key); removed++; } catch (e) {}
        });
        return removed;
    } catch (e) { return 0; }
};
window.mphLocationStoreReady = (function () {
    if (!_locHasIDB || typeof localStorage === 'undefined') {
        _locCache = (typeof localStorage !== 'undefined') ? _locLegacyRead() : null;
        _locLoaded = true;
        return Promise.resolve();
    }
    return (function () {
        // crash-safe flush (write in flight when the tab last closed) beats
        // the committed IndexedDB value — it is strictly newer.
        var flush = null;
        try { flush = JSON.parse(localStorage.getItem(LOC_FLUSH_KEY) || 'null'); } catch (e) {}
        return _locIdbGet(LOC_RECORDS_KEY).then(function (val) {
            if (flush && Array.isArray(flush.departments)) {
                val = flush;
                try { localStorage.removeItem(LOC_FLUSH_KEY); } catch (e) {}
                return _locIdbPut(LOC_RECORDS_KEY, val).catch(function () {}).then(function () { return val; });
            }
            if (!val) {
                // first run on this device: migrate the legacy localStorage copy
                var legacy = _locLegacyRead();
                if (legacy) {
                    return _locIdbPut(LOC_RECORDS_KEY, legacy).then(function () {
                        try { localStorage.removeItem(LOC_RECORDS_KEY); } catch (e) {}
                        window.mphPruneLocationBackups(1);   // free the old quota
                        return legacy;
                    });
                }
            }
            return val;
        }).then(function (val) {
            // a save issued before init finished is newer than anything on disk
            if (!_locWroteEarly) _locCache = (val && Array.isArray(val.departments)) ? val : null;
            _locLoaded = true;
        }).catch(function () {
            // IndexedDB unusable — stay on the legacy localStorage path
            _locHasIDB = false;
            if (!_locWroteEarly) _locCache = _locLegacyRead();
            _locLoaded = true;
        });
    })();
})();
// Records accessor used by every page. Returns the cached object (or the
// legacy localStorage copy before init) — null when nothing is stored.
window.mphGetLocationRecordsAny = function () {
    if (_locLoaded || _locWroteEarly) return _locCache;
    return _locLegacyRead();
};
window.mphSaveLocationRecords = function (db) {
    if (!db || !Array.isArray(db.departments)) return false;
    _locCache = db;
    if (!_locLoaded) _locWroteEarly = true;
    if (_locHasIDB) {
        _locPending++;
        var write = function () {
            _locIdbPut(LOC_RECORDS_KEY, _locCache).then(function () {
                _locPending--;
                try { localStorage.removeItem(LOC_FLUSH_KEY); } catch (e) {}
                try { if (_locChannel) _locChannel.postMessage('updated'); } catch (e) {}
            }).catch(function () {
                _locPending--;
                _locHasIDB = false;
                // degrade to localStorage rather than lose data; if THAT also
                // fails, surface it so the page can warn instead of pretending
                // the save succeeded (the return value already went out true).
                if (!_locLegacyWrite(_locCache)) _locFireSaveError();
            });
        };
        if (_locLoaded) write(); else window.mphLocationStoreReady.then(write);
        return true;
    }
    var ok = _locLegacyWrite(db);
    if (!ok) _locFireSaveError();
    return ok;
};
// Listeners notified when a save could not be persisted anywhere (async IDB
// failure + localStorage fallback both failed). Lets the UI show a real
// "NOT SAVED" warning even though mphSaveLocationRecords returned optimistically.
var _locSaveErrorListeners = [];
window.mphOnLocationSaveError = function (fn) { if (typeof fn === 'function') _locSaveErrorListeners.push(fn); };
function _locFireSaveError() { _locSaveErrorListeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
// Re-read the store (used when another tab/frame announced a change).
window.mphRefreshLocationRecords = function () {
    if (!_locHasIDB) { _locCache = _locLegacyRead(); return Promise.resolve(_locCache); }
    return _locIdbGet(LOC_RECORDS_KEY).then(function (val) {
        if (val && Array.isArray(val.departments)) _locCache = val;
        return _locCache;
    }).catch(function () { return _locCache; });
};
window.mphOnLocationRecordsUpdated = function (fn) { if (typeof fn === 'function') _locListeners.push(fn); };
if (_locChannel) {
    _locChannel.addEventListener('message', function () {
        window.mphRefreshLocationRecords().then(function () {
            _locListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
        });
    });
}
// A tab closed while an IndexedDB write is still in flight: park the latest
// state in localStorage (there is room now); init prefers + clears it.
try {
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('pagehide', function () {
            if (_locPending > 0 && _locCache) {
                try { localStorage.setItem(LOC_FLUSH_KEY, JSON.stringify(_locCache)); } catch (e) {}
            }
        });
    }
} catch (e) {}
// Startup hygiene: never let more than one historic seed backup accumulate.
try { if (typeof localStorage !== 'undefined') window.mphPruneLocationBackups(1); } catch (e) {}

/* ---- office-room consolidation ----
   Surveyed office rooms historically landed under umbrella departments
   ("Administrative Department", "1st/2nd Floor General Admin", "Front
   Administrative Department") while the office's own department sat empty
   (e.g. "Biomedical Engineer Office — 0 rooms"). This table maps each
   office department to the room titles (all historical variants) that
   belong to it. mphConsolidateOfficeRooms moves those rooms into their
   own department, union-merging items when the same-titled room already
   exists there. It runs inside every location-records merge (seed apply,
   cloud sync, restore), so old layouts — including ones re-introduced by
   an unmigrated device's cloud copy — are cleaned up on every pass. */
var OFFICE_ROOM_SOURCES = [
    'administrative department',
    '1st floor general admin',
    '2nd floor general admin',
    'front administrative department'
];
var OFFICE_ROOM_HOMES = [
    { to: 'Biomedical Engineer Office', titles: ['Biomedical Engineer Office', 'Biomedical Engineer', '114 - Biomedical Engineer'] },
    { to: 'Matron Office (DNS)', titles: ['2nd FL Matron Office', 'Matrons Office', 'Matron - Director of Nursing Services (DNS) Office - 2fl', '2nd FL - Deputy Matron Office', 'Deputy Matrons Office'] },
    { to: 'Accounts Department', titles: ['2nd FL Accounts Department', 'Accounts Department - 2fl', 'General Accounts Office', '2nd FL Accountant Office', 'Accountant Office', "Accountant's Office - 2fl"] },
    { to: 'Human Resource Department', titles: ['2nd FL Human Resource Department', 'Human Resource Management - Main Office', '2nd FL - Senior Human Resource Officer', 'HR Senior - Office'] },
    { to: 'Operations Manager Office', titles: ['2nd FL Operations Manager Office', 'Operations Manager Office - 2nd Fl'] },
    { to: 'ICT Department', titles: ['MIS/ICT Office'] },
    { to: 'EHR Department', titles: ['Electronical Health Records Office'] },
    { to: 'Administrator Office', titles: ['Administrator Office'] },
    { to: 'Chief Executive Officer Office', titles: ['Chief Executive Officer', '(CEO) Chief Executive Officer'] },
    { to: 'CEO Secretary Office', titles: ['CEO Secretary Office', 'Stationery Room'] },
    { to: 'SMO & DNS Secretary Office', titles: ['SMO & DNS - Secretary Office', 'SMO & DNS Secretary Office'] },
    { to: 'Senior Medical Officer Office', titles: ['Senior Medical Officer - Office', 'Senior Medical Officer (SMO)'] },
    { to: 'Social Worker Office', titles: ['Medical Social Worker Office'] },
    { to: 'Consultants Office', titles: ['Dr. Campbell Office', 'Dr. Campbell Office (Consultant of Medicine)', 'Dr. Campbell Office (source #113)', 'Surgeon Office - Consultant'] },
    { to: 'Customer Service Department', titles: ['Customer Service', 'Senior Customer Service Officer - Office'] },
    { to: 'Cashier Office', titles: ['Main Cashier Office - 2B 1012'] },
    { to: 'CCTV Office', titles: ['CCTV Office'] },
    { to: 'Emergency Operational Centre', titles: ['Emergency Operating Centre'] },
    { to: 'Transport Department', titles: ['Transportation', 'Transportation - Sleeping Quarters'] },
    { to: 'In Service Department', titles: ['Room: 2B 1002'] }
];
window.mphConsolidateOfficeRooms = function (db) {
    if (!db || !Array.isArray(db.departments)) return false;
    var changed = false;
    var byName = {};
    db.departments.forEach(function (d) { if (d && d.name) byName[K(d.name)] = d; });
    OFFICE_ROOM_HOMES.forEach(function (map) {
        var titleSet = {};
        map.titles.forEach(function (t) { titleSet[K(t)] = true; });
        var target = byName[K(map.to)];
        OFFICE_ROOM_SOURCES.forEach(function (srcName) {
            var src = byName[srcName];
            if (!src || src === target || !Array.isArray(src.rooms)) return;
            for (var i = src.rooms.length - 1; i >= 0; i--) {
                var r = src.rooms[i];
                if (!r || !titleSet[K(r.title)]) continue;
                if (!target) {
                    target = {
                        id: 'dept_' + K(map.to).replace(/[^a-z0-9]+/g, '_'),
                        name: map.to, icon: '🏢', location: map.to, note: '', rooms: []
                    };
                    db.departments.push(target);
                    byName[K(map.to)] = target;
                }
                target.rooms = target.rooms || [];
                var existing = null;
                for (var j = 0; j < target.rooms.length; j++) {
                    if (K(target.rooms[j].title) === K(r.title)) { existing = target.rooms[j]; break; }
                }
                if (existing) {
                    // same room already at home: union the moved copy's items in
                    existing.items = existing.items || [];
                    var ids = {}, keyCount = {};
                    existing.items.forEach(function (it) {
                        ids[it.id] = true;
                        var k = locItemKey(it);
                        keyCount[k] = (keyCount[k] || 0) + 1;
                    });
                    (r.items || []).forEach(function (it) {
                        if (!it || ids[it.id]) return;
                        var k = locItemKey(it);
                        if (keyCount[k] > 0) { keyCount[k]--; return; }
                        existing.items.push(it);
                        ids[it.id] = true;
                    });
                    ['verifiedBy', 'dateUpdated', 'note'].forEach(function (f) {
                        if (!existing[f] && r[f]) existing[f] = r[f];
                    });
                } else {
                    target.rooms.push(r);   // moved intact — ids preserved
                }
                src.rooms.splice(i, 1);
                changed = true;
            }
        });
    });
    return changed;
};

/* ---- duplicate-room merge ("ghost rooms") ----
   Many devices carry empty duplicate rooms created from the survey PDF
   file names (e.g. "Room IA-068 (Patient Bay)" with 0 items) alongside
   the seeded room that actually holds the data ("Patient Bay - IA 068").
   Rooms in the SAME department are recognised as the same physical room
   when their room-number codes (IA-068, 2B 1002, 3J 010, …) AND their
   remaining significant words match — or, for code-less titles, when
   their significant words match. Duplicates merge item-safe into the
   most-populated copy: code-matched rooms union everything; word-only
   matches merge only empty duplicates (never risking two genuinely
   different rooms' data). Runs inside every merge, so ghosts are cleaned
   on all devices and can't come back through the cloud. */
var ROOM_TITLE_STOPWORDS = { 'room': 1, 'patient': 1, 'general': 1, 'the': 1, 'of': 1, 'and': 1, 'a': 1 };
function mphRoomTitleKey(title) {
    var up = String(title || '').toUpperCase();
    var codes = {};
    var re = /\b(\d?[A-Z]{1,2})[\s\-\.\/]?0*(\d{2,4})([A-Z]?)\b/g, m;
    while ((m = re.exec(up))) {
        var block = m[1] === 'AI' ? 'IA' : m[1];   // common IA/AI transposition
        codes[block + String(parseInt(m[2], 10)) + (m[3] || '')] = true;
    }
    var codeSet = Object.keys(codes).sort().join('|');
    var words = {};
    up.toLowerCase().replace(new RegExp(re.source, 'gi'), ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(/\s+/).forEach(function (w) {
            if (w && !ROOM_TITLE_STOPWORDS[w]) words[w] = 1;
        });
    var wordKey = Object.keys(words).sort().join(' ');
    return codeSet ? { key: codeSet + '::' + wordKey, coded: true }
                   : { key: 'w::' + wordKey, coded: false };
}
window.mphDedupeLocationRooms = function (db) {
    if (!db || !Array.isArray(db.departments)) return false;
    var changed = false;
    db.departments.forEach(function (d) {
        if (!d || !Array.isArray(d.rooms) || d.rooms.length < 2) return;
        var groups = {};
        d.rooms.forEach(function (r) {
            if (!r) return;
            var k = mphRoomTitleKey(r.title);
            (groups[k.key] = groups[k.key] || { coded: k.coded, rooms: [] }).rooms.push(r);
        });
        // dropped rooms are tracked by object reference (a Set), never by
        // r.id — rooms with a missing/undefined id would otherwise collide
        // (drop[undefined]) and take the surviving primary down with them.
        var drop = new Set();
        Object.keys(groups).forEach(function (gk) {
            var g = groups[gk];
            if (g.rooms.length < 2) return;
            // primary = the copy that actually holds the data
            var primary = g.rooms.reduce(function (a, b) {
                return ((b.items || []).length > (a.items || []).length) ? b : a;
            });
            g.rooms.forEach(function (r) {
                if (r === primary) return;
                var n = (r.items || []).length;
                // word-only matches merge empty duplicates only; code matches
                // always merge (same room number + same descriptive words)
                if (!g.coded && n > 0) return;
                if (n > 0) {
                    primary.items = primary.items || [];
                    var ids = {}, keyCount = {};
                    primary.items.forEach(function (it) {
                        ids[it.id] = true;
                        var k = locItemKey(it);
                        keyCount[k] = (keyCount[k] || 0) + 1;
                    });
                    (r.items || []).forEach(function (it) {
                        if (!it || ids[it.id]) return;
                        var k = locItemKey(it);
                        if (keyCount[k] > 0) { keyCount[k]--; return; }
                        primary.items.push(it);
                        ids[it.id] = true;
                    });
                }
                ['verifiedBy', 'dateUpdated', 'note'].forEach(function (f) {
                    if (!primary[f] && r[f]) primary[f] = r[f];
                });
                drop.add(r);
                changed = true;
            });
        });
        if (drop.size) {
            d.rooms = d.rooms.filter(function (r) { return r && !drop.has(r); });
        }
    });
    return changed;
};

// Merge `incoming` location records INTO `local` (both {departments:[...]}).
// Union semantics: local data always survives; incoming-only departments,
// rooms and items are adopted unless tombstoned. Returns {merged, changed}.
//
// The union is POSITION-AWARE, in two narrow ways:
//   • a row id local already holds anywhere is never adopted into a second
//     room (an id identifies one row, so a second sighting of it is a stale
//     snapshot of where that row used to be), and
//   • an item is never adopted into a room the transfer ledger says it was
//     moved OUT of.
// Without those checks an older copy of the records — the cloud backup
// written before a transfer, a re-applied seed, a restored backup — re-added
// every transferred item to the department it left, so the transfer appeared
// to undo itself on the next refresh. Both checks are deliberately narrow:
// hundreds of asset codes legitimately appear in more than one room in the
// survey data, and those are none of the merge's business.
window.mphMergeLocationRecords = function (local, incoming, tombs, moves) {
    tombs = tombs || window.mphGetLocationTombstones();
    moves = moves || window.mphGetLocationMoves();
    var merged = (local && Array.isArray(local.departments)) ? local : { departments: [] };
    var changed = false;
    if (!incoming || !Array.isArray(incoming.departments)) return { merged: merged, changed: false };

    // Every row id local already holds, across ALL departments. The per-room
    // checks further down only ever answered "is it in THIS room?".
    var heldIds = {};
    function noteHeld(it) { if (it && it.id) heldIds[it.id] = true; }
    // Should this incoming row be adopted into deptName › roomTitle?
    function rejected(it, deptName, roomTitle) {
        if (!it) return true;
        if (it.id && heldIds[it.id]) return true;                       // same row, older position
        return window.mphIsStaleLocationCopy(it, deptName, roomTitle, moves);
    }
    merged.departments.forEach(function (d) {
        if (!d) return;
        (d.rooms || []).forEach(function (r) { (r && r.items || []).forEach(noteHeld); });
    });

    var deptByName = {};
    merged.departments.forEach(function (d) { deptByName[K(d.name)] = d; });

    incoming.departments.forEach(function (cd) {
        if (!cd || typeof cd !== 'object') return;
        var dKey = K(cd.name);
        if (!dKey) return;
        if (tombs.departments[dKey]) return;                       // deliberately deleted
        var ld = deptByName[dKey];
        if (!ld) {
            // new department: adopt it minus anything tombstoned inside it,
            // and minus any item we already hold elsewhere (a transferred item
            // must not reappear because an old copy of its former department
            // arrived from the cloud/seed)
            var copy = JSON.parse(JSON.stringify(cd));
            copy.rooms = (copy.rooms || []).filter(function (r) { return r && !tombs.rooms[r.id]; });
            copy.rooms.forEach(function (r) {
                r.items = (r.items || []).filter(function (it) {
                    return it && !window.mphIsItemTombstoned(it, tombs) && !rejected(it, copy.name, r.title);
                });
                r.items.forEach(noteHeld);
            });
            merged.departments.push(copy);
            deptByName[dKey] = copy;
            changed = true;
            return;
        }
        // fill empty presentation fields, never overwrite
        if (!ld.icon && cd.icon) { ld.icon = cd.icon; changed = true; }
        if (!ld.note && cd.note) { ld.note = cd.note; changed = true; }
        ld.rooms = ld.rooms || [];
        var roomById = {}, roomByTitle = {};
        ld.rooms.forEach(function (r) {
            roomById[r.id] = r;
            var tk = K(r.title);
            if (tk && !roomByTitle[tk]) roomByTitle[tk] = r;
        });
        (cd.rooms || []).forEach(function (cr) {
            if (!cr || typeof cr !== 'object') return;
            if (tombs.rooms[cr.id]) return;
            var lr = roomById[cr.id] || roomByTitle[K(cr.title)];
            if (!lr) {
                var rcopy = JSON.parse(JSON.stringify(cr));
                rcopy.items = (rcopy.items || []).filter(function (it) {
                    return it && !window.mphIsItemTombstoned(it, tombs) && !rejected(it, ld.name, rcopy.title);
                });
                rcopy.items.forEach(noteHeld);
                ld.rooms.push(rcopy);
                roomById[rcopy.id] = rcopy;
                var ntk = K(rcopy.title);
                if (ntk && !roomByTitle[ntk]) roomByTitle[ntk] = rcopy;
                changed = true;
                return;
            }
            // fill empty room fields
            ['verifiedBy', 'dateUpdated', 'note'].forEach(function (f) {
                if (!lr[f] && cr[f]) { lr[f] = cr[f]; changed = true; }
            });
            lr.items = lr.items || [];
            // count-aware union so identical uncoded items (e.g. two matching
            // chairs) are matched copy-for-copy instead of duplicated
            var ids = {}, keyCount = {};
            lr.items.forEach(function (it) {
                ids[it.id] = true;
                var k = locItemKey(it);
                keyCount[k] = (keyCount[k] || 0) + 1;
            });
            (cr.items || []).forEach(function (cit) {
                if (!cit || typeof cit !== 'object') return;
                if (window.mphIsItemTombstoned(cit, tombs)) return;
                if (ids[cit.id]) return;
                // this incoming copy is the item's OLD position, left behind in
                // a stale snapshot — adopting it is what put transferred
                // assets back in the department they came from
                if (rejected(cit, ld.name, lr.title)) return;
                var k = locItemKey(cit);
                if (keyCount[k] > 0) { keyCount[k]--; return; }     // same item already here
                var adopted = JSON.parse(JSON.stringify(cit));
                lr.items.push(adopted);
                ids[cit.id] = true;
                noteHeld(adopted);
                changed = true;
            });
        });
    });
    // Honor tombstones on records ALREADY held locally (not just incoming).
    // The union loop above only blocks re-adding tombstoned records; a peer
    // that already holds a department/room/item a user deleted elsewhere
    // would otherwise keep it forever and re-upload it. This prune removes
    // locally-present records whose id (or dept name-key) is tombstoned.
    if (window.mphPruneTombstoned(merged, tombs)) changed = true;
    // normalize: office rooms always live in their own department, and
    // duplicate ghost rooms collapse into the copy that holds the data
    if (window.mphConsolidateOfficeRooms(merged)) changed = true;
    if (window.mphDedupeLocationRooms(merged)) changed = true;
    // The transfer ledger has the last word on WHERE an item lives, so a
    // stale copy that survived any of the passes above (or that predates the
    // ledger) is pulled back to the department it was transferred to.
    if (window.mphApplyLocationMoves(merged, moves)) changed = true;
    if (changed) {
        merged.lastModified = new Date().toISOString();
    }
    return { merged: merged, changed: changed };
};
// Remove records the user deliberately deleted (by tombstone) that are still
// present in `db`. Returns true if anything was removed.
window.mphPruneTombstoned = function (db, tombs) {
    if (!db || !Array.isArray(db.departments)) return false;
    tombs = tombs || window.mphGetLocationTombstones();
    var changed = false;
    var keptDepts = [];
    db.departments.forEach(function (d) {
        if (!d) return;
        if (tombs.departments && tombs.departments[K(d.name)]) { changed = true; return; }  // whole dept deleted
        if (Array.isArray(d.rooms)) {
            var keptRooms = [];
            d.rooms.forEach(function (r) {
                if (!r) return;
                if (tombs.rooms && tombs.rooms[r.id]) { changed = true; return; }            // room deleted
                if (Array.isArray(r.items)) {
                    var before = r.items.length;
                    // by row id AND by asset code — a deleted item that came
                    // back under a fresh id is still a deleted item
                    r.items = r.items.filter(function (it) { return it && !window.mphIsItemTombstoned(it, tombs); });
                    if (r.items.length !== before) changed = true;
                }
                keptRooms.push(r);
            });
            d.rooms = keptRooms;
        }
        keptDepts.push(d);
    });
    db.departments = keptDepts;
    return changed;
};
window.mphLocationRecordsKey = LOC_RECORDS_KEY;

/* ---- accessibility: give every form field an accessible name ---- */
// Associates an aria-label with any input/select/textarea that has no linked
// <label for>, wrapping <label>, or aria-label — sourced from the nearest
// label text or its placeholder. Safe to run repeatedly.
window.mphPatchFormLabels = function () {
    function esc(id) {
        try { return (window.CSS && CSS.escape) ? CSS.escape(id) : id.replace(/([^a-zA-Z0-9_-])/g, '\\$1'); }
        catch (e) { return id; }
    }
    var fields = document.querySelectorAll('input, select, textarea');
    fields.forEach(function (f) {
        var type = (f.getAttribute('type') || '').toLowerCase();
        if (type === 'hidden') return;
        if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby')) return;
        if (f.id) { try { if (document.querySelector('label[for="' + esc(f.id) + '"]')) return; } catch (e) {} }
        if (f.closest && f.closest('label')) return;
        var text = '';
        // nearest previous sibling that is/holds a label
        var prev = f.previousElementSibling;
        while (prev && !text) {
            if (prev.tagName === 'LABEL' || /(^|\s)(label|form-label)(\s|$)/i.test(prev.className || '')) {
                text = prev.textContent || '';
            }
            prev = prev.previousElementSibling;
        }
        // a label inside the same form group / field wrapper
        if (!text && f.closest) {
            var grp = f.closest('.form-group, .input-group, .form-field, .field, .form-row');
            if (grp) { var lb = grp.querySelector('label'); if (lb) text = lb.textContent || ''; }
        }
        if (!text) text = f.getAttribute('placeholder') || '';
        text = text.replace(/\s+/g, ' ').trim().replace(/[*:]\s*$/, '').trim();
        if (text) f.setAttribute('aria-label', text);
    });
};

// Run the a11y patch automatically once the DOM is ready (and shortly after,
// to cover content rendered by scripts).
(function () {
    function run() { try { window.mphPatchFormLabels(); } catch (e) {} }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { run(); setTimeout(run, 1500); });
    } else { run(); setTimeout(run, 1500); }
})();

})();
