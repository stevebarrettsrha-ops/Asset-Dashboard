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
window.mphParseCode = function (code) {
    if (code == null || !String(code).trim()) return null;
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
        var raw = localStorage.getItem('hospitalLocationRecords');
        if (raw) {
            var d = JSON.parse(raw);
            if (d && Array.isArray(d.departments) && d.departments.length) return d;
        }
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
    var raw = null;
    try { raw = localStorage.getItem('hospitalLocationRecords'); } catch (e) { return 0; }
    var data;
    try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
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
        try { localStorage.setItem('hospitalLocationRecords', JSON.stringify(data)); }
        catch (e) { return 0; }
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
// Shape: { items: {id: iso}, rooms: {id: iso}, departments: {nameKey: iso} }
window.mphGetLocationTombstones = function () {
    try {
        var t = JSON.parse(localStorage.getItem(LOC_TOMBSTONES_KEY) || 'null');
        if (t && typeof t === 'object') {
            return { items: t.items || {}, rooms: t.rooms || {}, departments: t.departments || {} };
        }
    } catch (e) { /* ignore */ }
    return { items: {}, rooms: {}, departments: {} };
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
// Union tombstones arriving from the cloud into the local set.
window.mphMergeLocationTombstones = function (incoming) {
    if (!incoming || typeof incoming !== 'object') return false;
    var t = window.mphGetLocationTombstones();
    var changed = false;
    ['items', 'rooms', 'departments'].forEach(function (kind) {
        var src = incoming[kind] || {};
        Object.keys(src).forEach(function (k) {
            if (!t[kind][k]) { t[kind][k] = src[k]; changed = true; }
        });
    });
    if (changed) window.mphSaveLocationTombstones(t);
    return changed;
};

// Identity of an item independent of its generated id: the asset-code key
// when it has a code, otherwise its text content.
function locItemKey(it) {
    var ck = window.mphCodeKey(it && it.assetCode);
    if (ck) return 'c|' + ck;
    return 't|' + K(it && it.item) + '|' + K(it && it.description) + '|' + K(it && it.remarks);
}

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

// Merge `incoming` location records INTO `local` (both {departments:[...]}).
// Union semantics: local data always survives; incoming-only departments,
// rooms and items are adopted unless tombstoned. Returns {merged, changed}.
window.mphMergeLocationRecords = function (local, incoming, tombs) {
    tombs = tombs || window.mphGetLocationTombstones();
    var merged = (local && Array.isArray(local.departments)) ? local : { departments: [] };
    var changed = false;
    if (!incoming || !Array.isArray(incoming.departments)) return { merged: merged, changed: false };

    var deptByName = {};
    merged.departments.forEach(function (d) { deptByName[K(d.name)] = d; });

    incoming.departments.forEach(function (cd) {
        if (!cd || typeof cd !== 'object') return;
        var dKey = K(cd.name);
        if (!dKey) return;
        if (tombs.departments[dKey]) return;                       // deliberately deleted
        var ld = deptByName[dKey];
        if (!ld) {
            // new department: adopt it minus anything tombstoned inside it
            var copy = JSON.parse(JSON.stringify(cd));
            copy.rooms = (copy.rooms || []).filter(function (r) { return r && !tombs.rooms[r.id]; });
            copy.rooms.forEach(function (r) {
                r.items = (r.items || []).filter(function (it) { return it && !tombs.items[it.id]; });
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
                rcopy.items = (rcopy.items || []).filter(function (it) { return it && !tombs.items[it.id]; });
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
                if (tombs.items[cit.id]) return;
                if (ids[cit.id]) return;
                var k = locItemKey(cit);
                if (keyCount[k] > 0) { keyCount[k]--; return; }     // same item already here
                lr.items.push(JSON.parse(JSON.stringify(cit)));
                ids[cit.id] = true;
                changed = true;
            });
        });
    });
    // normalize: office rooms always live in their own department
    if (window.mphConsolidateOfficeRooms(merged)) changed = true;
    if (changed) {
        merged.lastModified = new Date().toISOString();
    }
    return { merged: merged, changed: changed };
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
