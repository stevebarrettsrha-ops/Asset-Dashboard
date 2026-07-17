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

window.MPH_CANONICAL_DEPARTMENTS = [{"name": "Accident & Emergency", "token": "AE", "icon": "🚑", "aliases": ["Accident and Emergency Department", "Accident and Emergency", "A&E Casualty", "Triage Area", "Triage Doctors Office", "Triage Medication Room", "Triage Nurse Station"]}, {"name": "Central Sterile Supply Department", "token": "CSSD", "icon": "🧼", "aliases": ["C.S.S.D", "CSSD - Central Sterilization and Storage Department", "Central Sterile and Storge Department"]}, {"name": "Dietary Department", "token": "DD", "icon": "🍽️", "aliases": ["Dietetics/Dietary Department"]}, {"name": "Female Medical Ward", "token": "FMW", "icon": "🛏️", "aliases": ["Female Medical", "Female medical Ward"]}, {"name": "Field Hospital", "token": "FH", "icon": "⛺", "aliases": ["FIELD HOSPITAL"]}, {"name": "Front Administrative Department", "token": "ADM", "icon": "🏢", "aliases": ["Front Administration Department", "Front Administration - Reception Area", "Front Administration (Telephone Operator)"]}, {"name": "General Stores Department", "token": "GS", "icon": "📦", "aliases": ["GENERAL STORES", "General Stores", "Stores Department", "In Storage", "Incinerator"]}, {"name": "Hospital Blood Bank", "token": "BB", "icon": "🩸", "aliases": ["Blood Bank", "Blood Bank Department"]}, {"name": "Isolation Ward", "token": "ISO", "icon": "🚪", "aliases": ["Isolation"]}, {"name": "Laboratory Department", "token": "LAB", "icon": "🔬", "aliases": ["Laboratory"]}, {"name": "Laundry Department", "token": "LD", "icon": "🧺", "aliases": ["Laundy Department"]}, {"name": "Maintenance Department", "token": "MD", "icon": "🔧", "aliases": []}, {"name": "Male Medical Ward", "token": "MM", "icon": "🛏️", "aliases": ["Male Medical", "Male Medical (MM)"]}, {"name": "Male Surgical Ward", "token": "MS", "icon": "🛏️", "aliases": ["Male Surgical", "Male Surgical ward"]}, {"name": "Maternity Ward", "token": "MAT", "icon": "🤱", "aliases": ["Maternity", "Maternity Ward - Gynocology Consultant"]}, {"name": "Medical Records Department", "token": "MR", "icon": "🗂️", "aliases": ["Medical Records", "Medical Record Department", "Medical Records Out Patient Dept.", "Medical Records-Out Patient Dept."]}, {"name": "Nursing Office", "token": "NO", "icon": "🩺", "aliases": []}, {"name": "Operating Theatre", "token": "OT", "icon": "🔪", "aliases": ["Operating Theatre Department"]}, {"name": "Out Patient Department (OPD)", "token": "OPD", "icon": "🏥", "aliases": ["Out Patient Department", "OPD Department", "OPD Nurse Station", "Outpatient Department (OT)", "OPD Room 2", "OPD Room 5", "OPD Room 8", "OPD Room 9", "OPD Room 13", "OPD Room 14", "OPD Room 15", "OPD Room 16"]}, {"name": "Paediatrics Ward", "token": "PD", "icon": "🧸", "aliases": ["Paediatrics", "Pediatrics & SCN", "Paediatric Ward"]}, {"name": "Radiology Department", "token": "XRAY", "icon": "🩻", "aliases": ["Radiology/Xray", "Radiology/Xray Department", "Xray Department"]}, {"name": "Security Post", "token": "SP", "icon": "🛡️", "aliases": ["Exit Gate"]}, {"name": "Milestone Office", "token": "MLO", "icon": "🏛️", "aliases": []}, {"name": "1st Floor General Admin", "token": "ADM", "icon": "🏢", "aliases": []}, {"name": "2nd Floor General Admin", "token": "ADM", "icon": "🏢", "aliases": []}, {"name": "Female Surgical Ward", "token": "FS", "icon": "🛏️", "aliases": ["Female Surgical"]}, {"name": "Accounts Department", "token": "ACC", "icon": "💰", "aliases": []}, {"name": "Administrative Department", "token": "ADM", "icon": "🏢", "aliases": ["Administration", "Administration - Passage Way", "Administrative Department - Pantry", "Pantry"]}, {"name": "Administrator Office", "token": "ADMTR", "icon": "🖋️", "aliases": ["Administrator", "Administrators Office", "Hospital Administrator - Office"]}, {"name": "Annex Department", "token": "ANNEX", "icon": "🏚️", "aliases": []}, {"name": "Biomedical Engineer Office", "token": "BIOMED", "icon": "⚙️", "aliases": ["Bio-Medical Engineer Office"]}, {"name": "CCTV Office", "token": "CCTV", "icon": "📹", "aliases": ["CCTV Operator - Office"]}, {"name": "Chief Executive Officer Office", "token": "CEO", "icon": "👔", "aliases": ["Chief Executive Officer", "Chief Executive Officer - Office"]}, {"name": "CEO Secretary Office", "token": "SEC", "icon": "🗒️", "aliases": ["CEO Secretary - Office"]}, {"name": "Cashier Office", "token": "CSH", "icon": "💵", "aliases": []}, {"name": "Chief Orderly Office", "token": "CHFO", "icon": "🧑", "aliases": ["Chief Orderly", "Chief Orderly - Office"]}, {"name": "Consultants Office", "token": "CONS", "icon": "🩺", "aliases": ["Consultant Office", "Consultant Office (Medicine)", "Consultant Office (Surgery)", "Dr. Campbell Office"]}, {"name": "Customer Service Department", "token": "CS", "icon": "💁", "aliases": ["Customer Service"]}, {"name": "EHR Department", "token": "EHR", "icon": "💻", "aliases": ["Electronical Health Recoords", "Electronic Health Records", "Electronic Health Record"]}, {"name": "Emergency Operational Centre", "token": "EOC", "icon": "📡", "aliases": ["Emergency Operational Centre - EOC", "EOC Room"]}, {"name": "Fixed Asset Officer Office", "token": "FXA", "icon": "📋", "aliases": ["Fixed Asset Officer - Office"]}, {"name": "Help Desk", "token": "HD", "icon": "🛎️", "aliases": []}, {"name": "Human Resource Department", "token": "HR", "icon": "👥", "aliases": ["Human Resource Department (Personnel Office)", "Human Resource Management Department"]}, {"name": "ICT Department", "token": "ICT", "icon": "🖥️", "aliases": ["ICT (Information Communication and Technology)", "MIS/ICT Department", "M.I.S"]}, {"name": "In Service Department", "token": "INS", "icon": "🎓", "aliases": ["In Service", "In Service Nurse"]}, {"name": "Matron Office (DNS)", "token": "DNS", "icon": "🧑", "aliases": []}, {"name": "Nurses Quarters", "token": "NQ", "icon": "🏠", "aliases": []}, {"name": "Operations Department", "token": "OPS", "icon": "🛠️", "aliases": ["Operations Department (OPR-DEP)", "Operations Department (Assigned for meeting and special events)"]}, {"name": "Operations Manager Office", "token": "OPRM", "icon": "🗄️", "aliases": []}, {"name": "Physiotherapy Department", "token": "PHYSIO", "icon": "🦵", "aliases": ["Physio-therapy Department"]}, {"name": "Procurement Office", "token": "PRMO", "icon": "🧾", "aliases": ["Procurement Officer - Office"]}, {"name": "Senior Medical Officer Office", "token": "SMO", "icon": "🩺", "aliases": ["Senior Medical Officer - Office"]}, {"name": "SMO & DNS Secretary Office", "token": "SMOSEC", "icon": "🗒️", "aliases": ["SMO and DNS Secretary - Officer", "SMO&DNS Secretaries"]}, {"name": "Social Worker Office", "token": "SW", "icon": "🤝", "aliases": []}, {"name": "Special Care Nursery", "token": "SCN", "icon": "👶", "aliases": ["Special Care Nursery Department", "Nursery Ward"]}, {"name": "Staff Clinic", "token": "STC", "icon": "🩹", "aliases": ["Staff Clinic - Department"]}, {"name": "Transport Department", "token": "TD", "icon": "🚐", "aliases": ["Transportation Department"]}, {"name": "Unassigned – Data Needed", "token": "DN", "icon": "❓", "aliases": ["Other", "N/A", "-Data needed-", ""]}];

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
window.MPH_CANONICAL_DEPARTMENTS.forEach(function (d) { TOKEN_BY_DEPT[d.name] = d.token; });

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

/* ---- ensure every canonical department exists as a Location Record ---- */
// Adds missing departments (never touches existing ones). Returns number added.
window.mphEnsureLocationDepartments = function () {
    var raw = null;
    try { raw = localStorage.getItem('hospitalLocationRecords'); } catch (e) { return 0; }
    var data;
    try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
    if (!data || !Array.isArray(data.departments)) data = { departments: [] };
    var changed = false;
    // Renamed departments: fold the old record into the new name, keeping rooms.
    var RENAMES = { 'nursery ward': 'Special Care Nursery' };
    Object.keys(RENAMES).forEach(function (oldKey) {
        var newName = RENAMES[oldKey];
        var oldIdx = -1, target = null;
        data.departments.forEach(function (d, i) {
            var k = K(d.name);
            if (k === oldKey) oldIdx = i;
            if (k === K(newName)) target = d;
        });
        if (oldIdx === -1) return;
        var old = data.departments[oldIdx];
        if (target) {
            target.rooms = (target.rooms || []).concat(old.rooms || []);
            data.departments.splice(oldIdx, 1);
        } else {
            old.name = newName;
            old.location = newName;
        }
        changed = true;
    });
    var have = {};
    data.departments.forEach(function (d) { have[K(d.name)] = true; });
    var added = 0;
    window.MPH_CANONICAL_DEPARTMENTS.forEach(function (d) {
        if (!have[K(d.name)]) {
            data.departments.push({
                id: 'canon_d_' + d.token.toLowerCase() + '_' + (++added),
                name: d.name, icon: d.icon || '🏥', location: d.name,
                note: 'Added automatically — canonical hospital department list',
                rooms: []
            });
        }
    });
    if (added || changed) {
        try { localStorage.setItem('hospitalLocationRecords', JSON.stringify(data)); }
        catch (e) { return 0; }
    }
    return added;
};

})();
