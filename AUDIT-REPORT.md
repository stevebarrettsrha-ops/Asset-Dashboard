# Asset Dashboard — Comprehensive Audit Report

**Date:** 2026-03-15
**Scope:** Full codebase audit of `index.html` (29,167 lines)
**Audited by:** Automated deep-dive analysis (6 parallel passes)

---

## Executive Summary

The Asset Dashboard is a feature-rich, single-file hospital asset management application. This audit identified **85+ issues** across security, logic bugs, data integrity, CSS conflicts, and consistency problems. The findings are organized below by severity.

### Issue Counts by Category

| Category | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Security / XSS | 5 | 18 | 3 | — | 26 |
| Logic Bugs | — | 8 | 10 | 4 | 22 |
| Data Loss / Integrity | 2 | 4 | 2 | — | 8 |
| CSS / Dark Mode | — | 3 | 9 | 3 | 15 |
| Error Handling | — | 3 | 5 | — | 8 |
| Dead Code / Consistency | — | — | 4 | 5 | 9 |

---

## CRITICAL SEVERITY

### C1. Plaintext Password Storage and Comparison
**Lines:** 10007, 10112, 10159, 13139, 13157, 13216, 13253
**Category:** SECURITY

**Problem:** Passwords are stored, cached, and compared as plaintext strings throughout the entire application. Local user passwords are stored in `localStorage` in plaintext. Credentials fetched from Google Sheets are cached with raw passwords in `localStorage` under the key `assetDashboardCachedCredentials`.

```js
// Line 10112 - Plaintext comparison for local users
const localUser = localUsers.find(u => u.username.toLowerCase() === username && u.password === password);

// Line 10159 - Plaintext comparison for Sheets users
if (user && user.password === password) {

// Line 10007 - Full credentials cached in localStorage
localStorage.setItem('assetDashboardCachedCredentials', JSON.stringify(data));
```

**Impact:** Any XSS vulnerability, browser extension, or physical access to the machine exposes every user's password.

**Fix:** Hash passwords before storage using the Web Crypto API:
```js
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
// Compare hashes instead of raw passwords
const hashedInput = await hashPassword(password);
const localUser = localUsers.find(u => u.username.toLowerCase() === username && u.passwordHash === hashedInput);
```
Do not cache raw passwords in localStorage — cache only a session token or authentication flag.

---

### C2. Credentials Fetched Through Third-Party CORS Proxies
**Lines:** 10026-10089
**Category:** SECURITY

**Problem:** The credential spreadsheet (containing all usernames and plaintext passwords) is fetched through three successive third-party CORS proxy services:
1. `corsproxy.io`
2. `api.allorigins.win`
3. `cors-anywhere.herokuapp.com`

```js
const response = await fetch('https://corsproxy.io/?' +
    encodeURIComponent(`https://docs.google.com/spreadsheets/d/${CREDENTIALS_SHEET_ID}/export?format=csv`));
```

**Impact:** These proxies can intercept, log, and exfiltrate all credential data in transit. A compromised or malicious proxy operator gains access to every user's credentials.

**Fix:** Host your own backend proxy, or better yet, move authentication entirely server-side. Never route credential data through untrusted third parties.

---

### C3. Hardcoded Credentials Spreadsheet ID
**Line:** 9956
**Category:** SECURITY

**Problem:** The Google Sheets ID for the credentials spreadsheet is hardcoded in client-side code:
```js
const CREDENTIALS_SHEET_ID = '1fVBNtjeltelPeHDlGffOyrfa4_vBreT0uNBEL8fvirQ';
```

**Impact:** Anyone viewing the page source can attempt to access this spreadsheet directly, potentially exposing all usernames, passwords, and roles.

**Fix:** Move authentication to a server-side endpoint. The spreadsheet ID should never appear in client-side code.

---

### C4. Top-Level JSON.parse Without Try/Catch Crashes Entire App
**Lines:** 9963, 9972
**Category:** DATA-LOSS / ERROR-HANDLING

**Problem:** Two `JSON.parse` calls at the top level of the script block have no error handling:
```js
let localUsers = JSON.parse(localStorage.getItem('assetDashboardLocalUsers') || '[]');
let localUserSettings = JSON.parse(localStorage.getItem('assetDashboardUserSettings') || '{}');
```
The `|| '[]'` fallback only protects against `null` (when the key doesn't exist), not against corrupted JSON (when the key exists but the value is malformed).

**Impact:** If localStorage data is corrupted (partial write, manual tampering, storage quota exceeded during write), the entire `<script>` block throws an unhandled exception and the application becomes completely non-functional — a total denial of service.

**Fix:**
```js
let localUsers;
try { localUsers = JSON.parse(localStorage.getItem('assetDashboardLocalUsers') || '[]'); }
catch (e) { console.error('Corrupt localUsers data:', e); localUsers = []; }

let localUserSettings;
try { localUserSettings = JSON.parse(localStorage.getItem('assetDashboardUserSettings') || '{}'); }
catch (e) { console.error('Corrupt settings data:', e); localUserSettings = {}; }
```

---

### C5. Overly Broad Google Drive OAuth Scope
**Line:** 11353
**Category:** SECURITY

**Problem:** The OAuth scope requests full Google Drive access:
```js
SCOPES: 'https://www.googleapis.com/auth/drive'
```

**Impact:** The application gains read/write/delete access to the user's entire Google Drive, not just files created by the app.

**Fix:** Use the minimal scope:
```js
SCOPES: 'https://www.googleapis.com/auth/drive.file'
```

---

## HIGH SEVERITY

### H1. Widespread XSS via innerHTML Without Escaping
**Category:** SECURITY / XSS

The codebase has an `escapeHtml()` function (line 21308) and uses it in some places (e.g., `displayAssetRegister()`), but **dozens of other locations** inject user-controlled data into `innerHTML` or `document.write()` without any escaping. Below is a consolidated list:

| Function | Lines | Unescaped Fields |
|---|---|---|
| `updateUserInterface()` | 10272-10280 | `displayName`, `role` |
| `showPage()` (pages 5-13) | 16157-16260 | `displayName`, `username` |
| `renderDeletionTable()` | 26725-26730 | `assetCode`, `description`, `department`, `category` |
| `renderDuplicateGroups()` | 27893-27903 | `assetCode`, `description`, `department`, `category` |
| `displaySearchResults()` | 20850-20853 | `assetCode`, `description`, `supplier` |
| `displaySheetData()` | 19176-19183 | `assetCode`, `description`, `source`, `department` |
| `updateWarrantyStatus()` | 18241-18244 | `description`, `assetCode` |
| `printAssetRegister()` | 26964-26978 | All asset fields via `document.write()` |
| `printCategoryReport()` | 28131-28147 | All asset fields via `document.write()` |
| `generateDetailedReport()` | 19997-20001 | All asset fields via `document.write()` |
| `generateWarrantyPrintReport()` | 20047-20053 | `assetCode`, `description`, `department` |
| `generateAuditTrailPrintReport()` | 20144-20150 | `notes`, `user`, `action`, `description` |
| `renderMyAccount()` | 12919-12927 | `username`, `displayName` in value attributes |
| `populateBulkFilters()` | 27229-27238 | Category/department names in dropdowns |
| Filter dropdown populators | 26494-26501 | Category/department names |
| Invoice list rendering | 18013-18020 | Google Drive `invoice.name` |
| `hospitalName` in print reports | 15185, 26988, 28230 | localStorage-sourced name |

**Fix:** Apply `escapeHtml()` to ALL user-derived values before inserting into innerHTML. For `document.write()` in print windows, the escaping is equally critical since it operates in a new browsing context. Example:
```js
// Before (vulnerable):
<td>${asset.description}</td>

// After (safe):
<td>${escapeHtml(asset.description)}</td>
```

---

### H2. Merge Uses Array Indices Instead of Asset IDs
**Lines:** 10778-10779, 10857-10858
**Category:** BUG / DATA-LOSS

**Problem:** `selectedForMerge` stores array indices into `filteredData`. Between selection and execution, `filteredData` can change (user sorts, filters, data syncs), causing the wrong assets to be merged and permanently lost.

```js
const asset1 = filteredData[selectedForMerge[0]];
const asset2 = filteredData[selectedForMerge[1]];
```

**Fix:** Store asset IDs instead of indices:
```js
// When selecting:
selectedForMerge.push(asset.id);

// When merging:
const asset1 = allAssetsData.find(a => a.id === selectedForMerge[0]);
const asset2 = allAssetsData.find(a => a.id === selectedForMerge[1]);
if (!asset1 || !asset2) { alert('Selected assets no longer exist.'); return; }
```

---

### H3. Auto-Sync Interval Too Aggressive (5 seconds)
**Line:** 11368
**Category:** BUG / PERFORMANCE

**Problem:** `AUTO_SYNC_INTERVAL_MS = 5000` triggers a full Google Drive download + upload every 5 seconds. This will rapidly exhaust Google API quotas and drain battery/bandwidth.

**Fix:** Increase to 60-120 seconds, and implement a dirty-flag to only sync when local data has actually changed:
```js
const AUTO_SYNC_INTERVAL_MS = 120000; // 2 minutes
let dataIsDirty = false;

function markDirty() { dataIsDirty = true; }

async function autoSync() {
    if (!dataIsDirty) return;
    dataIsDirty = false;
    await syncToCloud();
}
```

---

### H4. CSS Class Redefinitions Cause Visual Bugs
**Category:** CSS / BUG

Several CSS classes are defined multiple times with conflicting values. The last definition wins, overriding earlier intended styles:

| Class/Keyframe | First Definition | Second Definition | Impact |
|---|---|---|---|
| `.btn-primary` | Line 2085: green (`var(--primary-green)`) | Line 3494: purple gradient | All primary buttons show purple instead of green |
| `.btn-secondary` | Line 2102: themed | Line 3499: different bg + border | Secondary buttons have wrong style |
| `.btn-danger` | Line 2118: solid red | Line 3489: gradient red | Danger buttons inconsistent |
| `.modal-content` | Line 1960: `max-width: 900px` | Line 3442: `max-width: 500px` | Asset edit modal too narrow (500px) |
| `.modal-header` | Line 1991: gradient bg | Line 3451: simple bg | Modal headers lose gradient |
| `@keyframes pulse` | Line 241: opacity to 0.4 | Line 2180: opacity to 0.6 | Portal/status dots use wrong pulse |
| `@keyframes slideUp` | Line 274: 30px | Line 843: 20px | Portal cards use wrong slide distance |
| `@keyframes fadeIn` | Line 706: with translateY | Line 1975: without translateY | QR sections lose slide effect |

**Fix:** Use distinct class names for the cloud/2FA modal styles (e.g., `.cloud-modal-content`, `.cloud-btn-primary`) instead of redefining the same classes. Give each `@keyframes` a unique name (e.g., `pulse-dot`, `pulse-status`, `pulse-sync`).

---

### H5. Google OAuth Access Token Stored in localStorage
**Line:** 11618
**Category:** SECURITY

**Problem:** The Google OAuth access token (granting full Drive access) is stored in `localStorage`:
```js
localStorage.setItem('assetDashboardGoogleAccessToken', token);
```

**Fix:** Use `sessionStorage` (clears on tab close) or keep the token only in a JavaScript variable (memory-only).

---

### H6. TOTP Secret and Backup Codes Use Math.random()
**Lines:** 10357-10363, 10418
**Category:** SECURITY

**Problem:** Two-factor authentication secrets and backup codes are generated using `Math.random()`, which is not cryptographically secure:
```js
secret += chars.charAt(Math.floor(Math.random() * chars.length));
```

**Fix:**
```js
const array = new Uint32Array(20);
crypto.getRandomValues(array);
const secret = Array.from(array).map(v => chars[v % chars.length]).join('');
```

---

### H7. Duplicate Management Functions Don't Refresh Views
**Lines:** 28009, 28024-28028, 28049-28052
**Category:** BUG / CONSISTENCY

**Problem:** `mergeGroup()`, `deleteOthersInGroup()`, and `deleteSingleDuplicate()` modify asset data and call `scanForDuplicates()` but do NOT call `refreshAllViews()`. This leaves the Dashboard, Asset Register, and other views showing stale data (including deleted assets) until the user manually navigates away and back.

**Fix:** Add `refreshAllViews()` before `scanForDuplicates()` in all three functions.

---

### H8. Null Pointer Crashes from Unchecked window.open()
**Lines:** 20921, 24607-24608, 26494, 27191-27192, 28247-28248
**Category:** BUG / ERROR-HANDLING

**Problem:** `window.open('', '_blank')` returns `null` if popups are blocked. Multiple locations call `.document.write()` on the return value without checking for null, causing a TypeError crash.

**Fix:**
```js
const printWindow = window.open('', '_blank');
if (!printWindow) {
    alert('Unable to open print window. Please allow popups for this site.');
    return;
}
printWindow.document.write(printContent);
```

---

## MEDIUM SEVERITY

### M1. importFromUrl() References Undefined `event` Variable
**Line:** 15748-15749
**Category:** BUG

**Problem:** `async function importFromUrl()` references a bare `event` variable that is never passed as a parameter. In modern browsers, `event` as an implicit global is deprecated.

**Fix:** Add `event` as a parameter: `async function importFromUrl(event)` or use `document.querySelector` to find the button.

---

### M2. Audit Trail Export Uses Wrong Field Names
**Lines:** 19903, 19906
**Category:** BUG / DATA-LOSS

**Problem:**
- `entry.description` is exported but audit entries often don't store a `description` field (the display function has to look it up from assets)
- `entry.location` is exported for the "Location" column, but the actual field is `entry.department`

**Impact:** The "Description" and "Location" columns in exported audit trail Excel files are always empty.

**Fix:**
```js
// Line 19906: Change entry.location to entry.department
entry.department || ''

// Line 19903: Either store description in addAuditEntry(), or perform the same
// asset lookup that displayAuditTrail() does
```

---

### M3. Disposal Alert Message Always Says "Added" Even When Updating
**Line:** 23986
**Category:** BUG

**Problem:** `saveDisposalRecord()` checks `currentEditingDisposal` for the alert message, but `closeDisposalModal()` (called on line 23983) already sets `currentEditingDisposal = null`. The alert always says "added" even for updates.

**Fix:**
```js
const wasEditing = !!currentEditingDisposal; // Save state BEFORE closing modal
// ... rest of save logic ...
closeDisposalModal();
alert(wasEditing ? 'Disposal record updated successfully!' : 'Disposal record added successfully!');
```

---

### M4. Cloud Merge Bypasses Active Filters
**Line:** 11834
**Category:** BUG

**Problem:** `mergeCloudIntoLocal()` sets `filteredData = allAssetsData` directly, silently replacing any active filter the user has applied.

**Fix:** After updating `allAssetsData`, re-apply the current filter state rather than overwriting `filteredData` directly. Call the appropriate filter/search function.

---

### M5. addAuditEntry() Treats Value of 0 as Missing
**Line:** 14467
**Category:** BUG

**Problem:** `if (!assetValue)` is falsy for value `0`, causing unnecessary asset lookups and potential overwriting of an intentional zero value.

**Fix:** `if (assetValue === undefined || assetValue === null)`

---

### M6. Warranty Overrides localStorage No-Op
**Lines:** 14517-14519
**Category:** DEAD-CODE

**Problem:** In `saveAllData()`, warranty overrides are read from localStorage and immediately written back to the same key — a complete no-op:
```js
const warrantyOverrides = localStorage.getItem('warrantyOverrides');
if (warrantyOverrides) { localStorage.setItem('warrantyOverrides', warrantyOverrides); }
```

**Fix:** Remove these three lines entirely.

---

### M7. Audit Record Cleanup Filter is a No-Op
**Lines:** 14673-14678
**Category:** DEAD-CODE / BUG

**Problem:** In `syncData()`, the "Clean up orphaned audit records" filter always returns `true` at the end, making the filter pass-through:
```js
const validAuditRecords = auditRecords.filter(record => {
    // ... various checks ...
    return true; // <-- everything passes
});
```

**Fix:** If the intent is to clean orphaned records, remove the final `return true`. If all records should be kept, remove the entire filter block.

---

### M8. Inconsistent ID Generation
**Lines:** 10891, 11296, 11309, 13136, 14432-14433
**Category:** CONSISTENCY / BUG

**Problem:** Asset IDs are generated differently in different places:
- `executeMerge()`: `Date.now().toString()` (no random suffix)
- Various import paths: `Date.now() + Math.random().toString(36).substr(2, 5)` (5-char suffix)
- `generateAssetId()`: `Date.now() + Math.random().toString(36).substr(2, 9)` (9-char suffix)

**Impact:** Merged asset IDs have no random component, creating collision risk. Shorter suffixes reduce entropy.

**Fix:** Use `generateAssetId()` everywhere, or switch to `crypto.randomUUID()`.

---

### M9. Monthly Stats Count Rows Instead of Quantities
**Lines:** 20448 vs 20235
**Category:** BUG / CALCULATION

**Problem:** `processMonthData()` increments `stats.totalItems++` (counting rows), while `loadData()` uses `asset.quantity` (counting actual items). An asset with quantity 5 counts as 1 in monthly stats but 5 in totals.

**Fix:** `stats.totalItems += quantity` instead of `stats.totalItems++` (same for `medicalEquipment` and `furniture` counters).

---

### M10. handleLogout() Missing Null Checks on DOM Elements
**Lines:** 10328-10330
**Category:** BUG

**Problem:** `handleLogout()` accesses `nightModeBtn` and `exportBtn` without null checks, while `completeLogin()` properly checks them. If either element is missing, logout crashes with a TypeError.

**Fix:**
```js
const nightBtn = document.getElementById('nightModeBtn');
if (nightBtn) nightBtn.style.display = 'none';
const exportBtn = document.getElementById('exportBtn');
if (exportBtn) exportBtn.style.display = 'none';
```

---

### M11. detectMonth() DD/MM/YYYY Handling is Dead Code
**Lines:** 22024-22028
**Category:** DEAD-CODE / BUG

**Problem:** The DD/MM/YYYY branch reassigns `month` to the exact same value it already has:
```js
let month = parseInt(parts[1]);
if (parts[0].length <= 2 && parts[2] && parts[2].length === 4) {
    month = parseInt(parts[1]); // Same value!
}
```

**Fix:** Either remove the dead block, or implement the actual intended logic (e.g., `month = parseInt(parts[0])` for MM/DD/YYYY).

---

### M12. Single-Quote Breakout in onclick Handlers
**Lines:** 15253, 15355, 18235
**Category:** BUG

**Problem:** `escapeHtml()` does not escape single quotes. Values like department names or asset codes containing `'` break out of onclick handlers:
```js
onclick="handleRemoveDepartment('${escapeHtml(dept)}')"
// dept = "Women's Ward" → onclick breaks
```

**Fix:** Also escape single quotes (replace `'` with `&#39;`), or use `data-*` attributes with `addEventListener`.

---

### M13. Async DOMContentLoaded Handler Lacks Error Isolation
**Lines:** 29140-29164
**Category:** ERROR-HANDLING

**Problem:** The `DOMContentLoaded` handler is `async` but has no try/catch. If early init functions throw, `loadCredentials()` never executes and the error becomes an unhandled promise rejection.

**Fix:** Wrap the body in try/catch or wrap each init call individually.

---

### M14. Performance: loadAssetsFromStorage() Called Inside Loop
**Line:** 19643-19649
**Category:** BUG / PERFORMANCE

**Problem:** Inside `displayAuditTrail()`, `loadAssetsFromStorage()` (which parses JSON from localStorage) is called inside a `forEach` loop for every audit record that lacks a description. With hundreds of records, this means hundreds of redundant `JSON.parse()` calls.

**Fix:** Move `const assets = loadAssetsFromStorage()` outside the loop.

---

### M15. Event Listener Leak on Cloud Menu Toggle
**Lines:** 11444-11446
**Category:** BUG / MEMORY-LEAK

**Problem:** Every call to `toggleCloudMenu` adds a new `click` event listener. Rapid toggling accumulates listeners.

**Fix:** Remove existing listener before adding: `document.removeEventListener('click', closeCloudMenuOnClickOutside);` before the `addEventListener` call.

---

### M16. completeLogin() Error Leaves UI in Broken State
**Line:** 10267
**Category:** ERROR-HANDLING

**Problem:** If `completeLogin()` throws after hiding the login page and showing the dashboard, the catch block shows an alert but leaves the UI stuck — login hidden, dashboard half-initialized.

**Fix:** In the catch block, call `handleLogout()` to cleanly reset the UI state.

---

### M17. Credential Cache Has No Expiry Check
**Lines:** 10008, 10014-10023
**Category:** SECURITY

**Problem:** Credentials are cached with a timestamp but `loadCachedCredentials()` never validates whether the cache has expired. Stale credentials remain in localStorage indefinitely.

**Fix:** Add expiry logic:
```js
function loadCachedCredentials() {
    const cachedTime = localStorage.getItem('assetDashboardCachedCredentialsTime');
    if (cachedTime && (Date.now() - parseInt(cachedTime)) > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('assetDashboardCachedCredentials');
        return null; // Expired
    }
    // ... existing parse logic
}
```

---

## LOW SEVERITY

### L1. Dark Mode Gaps — Hardcoded Colors
Multiple UI components use hardcoded colors instead of CSS variables, causing visual issues in dark mode:

| Component | Lines | Hardcoded Colors |
|---|---|---|
| Scan results | 881-912 | `white`, `#f8f9fa`, `#666`, `#333` |
| Public asset viewer | 2317-2361 | `white`, `#2C3E50`, `#666` |
| 2FA login elements | 6346-7173 | `#666`, `#f8f9fa` |
| Merge modal warning | 9821 | `#FFF3E0`, `#FF9800` |
| Smart merge options | 9890 | `#E3F2FD`, `#1565C0` |
| Various inline styles | Throughout | Mixed hardcoded values |

**Fix:** Replace hardcoded colors with CSS variable references.

---

### L2. Hardcoded Copyright Year
**Line:** 15185
**Category:** BUG

**Problem:** `'&copy; 2025 '` is hardcoded while elsewhere `new Date().getFullYear()` is correctly used (line 18997).

**Fix:** `'&copy; ' + new Date().getFullYear() + ' '`

---

### L3. Valuation Report "100%" Hardcoded
**Line:** 20096
**Category:** BUG / CALCULATION

**Problem:** The Total row always shows "100%" but the individual percentages may not sum to 100% due to floating-point rounding (e.g., 33.3% + 66.6% = 99.9%).

**Fix:** Calculate dynamically or note it is a display simplification.

---

### L4. Duplicate @keyframes spin
**Lines:** 1650, 3436
**Category:** DEAD-CODE

**Problem:** `@keyframes spin` is defined identically twice.

**Fix:** Remove the duplicate at line 3436.

---

### L5. Split :root CSS Variable Blocks
**Lines:** 24, 3506
**Category:** CONSISTENCY

**Problem:** CSS variables are defined in two separate `:root` blocks, making maintenance harder.

**Fix:** Consolidate into a single `:root` block.

---

### L6. User Info Display Inconsistency Across Pages
**Lines:** 10278 vs 16157-16260
**Category:** CONSISTENCY

**Problem:** Pages 1-4 show the user's role alongside their name. Pages 5-13 show only the name without the role.

**Fix:** Update all `userInfo` elements consistently in `updateUserInterface()`.

---

### L7. mergeGroup() Price Merge Uses Truthy Checks on Numbers
**Lines:** 27975-27979
**Category:** BUG

**Problem:** `!primary.totalPrice || primary.totalPrice === 0` uses truthy checks, but prices could be strings from imports. String `"0"` is falsy, potentially causing incorrect overwrites.

**Fix:** Use `parseFloat()` for numeric comparisons.

---

### L8. Mixed Types in Disposal Records
**Line:** 23957
**Category:** CONSISTENCY

**Problem:** `disposalValue` is saved as a string from form input but falls back to number `0`, creating mixed types.

**Fix:** Consistently parse to number: `parseFloat(value) || 0`.

---

### L9. IndexedDB Init Promise Has No Catch Handler
**Line:** 15007-15008
**Category:** ERROR-HANDLING

**Problem:** `_idbInitPromise` is assigned but has no `.catch()`. If IndexedDB initialization fails (private browsing, permission denied), it becomes an unhandled rejection.

**Fix:** Add `.catch(err => console.warn('IndexedDB init failed:', err))`.

---

### L10. Google Auth Modal Can Be Duplicated
**Line:** 11557
**Category:** BUG / MEMORY-LEAK

**Problem:** `showGoogleAuthModal()` inserts HTML into `document.body` without checking for an existing modal first. Calling it multiple times creates duplicate modals.

**Fix:** Add `const existing = document.getElementById('googleAuthModal'); if (existing) existing.remove();` before insertion.

---

### L11. parseCatalogPrice() Missing Guard for log10(0)
**Line:** 28952
**Category:** BUG

**Problem:** If `low` is 0, `Math.log10(0)` returns `-Infinity`, making the correction logic produce unexpected results.

**Fix:** Add guard: `if (high < low && low > 0)`.

---

### L12. Password Literal "********" Sentinel Value
**Line:** 13156
**Category:** BUG

**Problem:** Existing passwords are displayed as `"********"` and skipped on save if unchanged. If a user's actual password is literally `"********"`, it can never be updated.

**Fix:** Use an empty placeholder with a "change password" checkbox, or track whether the field was modified.

---

## Recommendations Summary

### Immediate Actions (Critical)
1. **Move authentication server-side** — eliminate client-side credential fetching, CORS proxies, and plaintext password storage
2. **Hash all passwords** before storage and comparison
3. **Remove credential caching** from localStorage (or cache only hashed session tokens)
4. **Narrow the Google Drive scope** to `drive.file`

### Short-Term Actions (High)
5. **Apply `escapeHtml()` consistently** to ALL user-derived data before innerHTML insertion (26+ locations identified)
6. **Store asset IDs instead of indices** for merge selections
7. **Add null checks** for `window.open()` return values and DOM element lookups
8. **Fix CSS class/keyframe redefinitions** by using distinct names for modal and cloud UI styles
9. **Increase auto-sync interval** to 60+ seconds with dirty-flag optimization

### Medium-Term Actions
10. Fix audit trail export field names (`location` → `department`)
11. Fix disposal alert message ordering bug
12. Add error isolation to `DOMContentLoaded` handler
13. Standardize ID generation on `crypto.randomUUID()` or `generateAssetId()`
14. Move `loadAssetsFromStorage()` outside the audit trail rendering loop
15. Fix monthly stats to count quantities, not rows
16. Use `crypto.getRandomValues()` for TOTP secret generation

### Long-Term / Architectural
17. Break the 29,167-line single file into modular components
18. Replace inline event handlers with `addEventListener` and data attributes
19. Replace all hardcoded colors with CSS variables for complete dark mode support
20. Implement proper session management with expiring tokens
21. Add automated testing for data integrity and security
