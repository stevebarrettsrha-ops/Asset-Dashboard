# Production Readiness Report — Asset Dashboard Suite

**Date:** 2026-06-12
**Scope:** Full system — `index.html` (31,446 lines), `portal.html` (2,431), `procurement.html` (3,172), `stores.html` (4,388), repository structure, deployment, data architecture, and operations.
**Method:** Five parallel deep-dive audits (index.html re-audit against the 2026-03-15 AUDIT-REPORT.md, first-ever audits of portal/procurement/stores, and a system-level architecture/operations assessment), consolidated and cross-verified.

---

## 1. Verdict

**The system is NOT production ready.** It is an impressive, feature-rich suite built without a backend, and that single architectural decision drives most of the blocking findings: authentication, authorization, secrets, and data integrity are all enforced only in the browser, where any user can bypass or tamper with them.

For a hospital system holding asset, procurement, and inventory records, the current risk profile is:

| Risk | Level | Why |
|---|---|---|
| Credential breach | **Critical** | Plaintext passwords fetched through public third-party proxies; default `*/123` logins; client-side-only auth |
| Data loss | **Critical** | localStorage is the primary database for two apps; last-write-wins sync; a broken merge feature; single un-versioned cloud backup overwritten every 2 minutes |
| Account takeover / XSS | **High** | Multiple unescaped `innerHTML`/`document.write` sinks across all four apps; a duplicate `escapeHtml()` that silently disables quote-escaping |
| Unauthorized actions | **High** | Roles exist but are never enforced — any logged-in user can approve requisitions, delete suppliers, export everything |
| Outage blindness | **High** | No monitoring, no error reporting, no tests, no CI/CD, no staging |

**Positive note:** real progress has been made since the March audit. Of the 10 Critical/High findings re-verified in `index.html`, **5 are fully fixed** (password hashing, JSON.parse crash guards, OAuth scope narrowed to `drive.file`, sync interval raised 5s→120s with a dirty flag, crypto-secure TOTP secrets) and 2 are partially fixed. The remaining gaps are concentrated in the three never-audited files and in the system architecture itself.

---

## 2. Scorecard

| Area | Grade | Summary |
|---|---|---|
| Security — authentication | ❌ Fail | Client-side only, bypassable in DevTools; hardcoded fallback logins |
| Security — secrets handling | ❌ Fail | Sheet IDs, OAuth Client ID, Drive folder IDs, Apps Script URL all in source; credentials via public CORS proxies |
| Security — XSS | ❌ Fail | Sinks in all four files; broken escaping in index.html |
| Authorization (RBAC) | ❌ Fail | `role`/`canExport` fields stored but never checked |
| Data integrity | ❌ Fail | localStorage as primary store; race conditions; broken merge; mutable audit logs |
| Backup / recovery | ⚠️ Weak | Single Drive JSON file, no versioning, overwritten every 2 min, untested restore |
| Multi-user concurrency | ❌ Fail | Last-write-wins everywhere; no conflict detection; no user isolation on shared devices |
| Performance | ⚠️ Weak | 1.5 MB unminified index.html; works, but slow on hospital Wi-Fi/3G; no compression strategy under author's control |
| Dependencies | ⚠️ Weak | 6 CDN scripts, zero SRI hashes, no offline fallback |
| Code structure | ⚠️ Weak | 41k lines across 4 monolithic files; duplicated auth/sync/sanitize code in each |
| Quality infrastructure | ❌ Fail | No tests, no linting, no CI/CD, no error monitoring, no CSP |
| Accessibility / UX basics | ⚠️ Weak | lang + viewport present; minimal ARIA; silent sync failures strand users |
| Documentation | ⚠️ Weak | 2-line README; good prior audit doc; no architecture/runbook docs |

---

## 3. Status of the March 2026 Audit (index.html)

| Prior finding | Status | Evidence |
|---|---|---|
| C1 Plaintext password storage | ✅ **Fixed** | SHA-256 + salt via `crypto.subtle.digest()` (lines ~10106–10200); legacy plaintext field deleted after migration. *Caveat:* Google-Sheets credentials are still cached plaintext in `assetDashboardCachedCredentials`. |
| C2 Credentials via CORS proxies | ❌ **Still present** | corsproxy.io / allorigins.win / cors-anywhere cascade (lines ~10052–10061) |
| C3 Hardcoded credentials sheet ID | ❌ **Still present** | Line ~9921; plus OAuth CLIENT_ID at ~11504 |
| C4 Top-level JSON.parse crash | ✅ **Fixed** | try/catch with defaults (lines ~9954, 9965) |
| C5 Over-broad Drive OAuth scope | ✅ **Fixed** | Now `drive.file` (line ~11507) — *but portal/procurement/stores still use their own broader config* |
| H1 innerHTML XSS | ⚠️ **Partially fixed** | `escapeHtml()` applied more widely, but a **second definition at line ~28680 overrides the safe one at ~22062** and does not escape single quotes — onclick handlers are re-exposed (see §4.1) |
| H2 Merge uses array indices | ❌ **Still present — now worse** | Selection stores numeric indices (~21509) but lookup compares against string IDs (~10826); they can never match, so merge silently fails or acts on wrong assets |
| H3 5-second auto-sync | ✅ **Fixed** | 120,000 ms + `dataIsDirty` flag (lines ~11522–11523) |
| H5 OAuth token in localStorage | ⚠️ **Partially fixed** | Written to sessionStorage on login (~11776) but fallback reads/writes still hit localStorage (~12738, 12844); portal/procurement/stores write it to localStorage outright |
| H6 TOTP via Math.random() | ✅ **Fixed** | `crypto.getRandomValues()` (lines ~10404–10410) |
| H8 window.open null checks | ⚠️ **Partially fixed** | 8 of 9 sites guarded; Fiscal Year Report print (~16826) still crashes if popups are blocked |

---

## 4. Critical Findings (production blockers)

### 4.1 Cross-cutting — affects the whole suite

**CR-1. Authentication is cosmetic.** All four apps "log in" by hiding a div. Anyone can open `stores.html` or `procurement.html` directly and unhide the app container from DevTools in seconds. There is no session, no token validation, no server. *(procurement.html:1725; stores.html — no auth gate on load; portal.html:1451–1482 syncs users via localStorage only.)*

**CR-2. Hardcoded default credentials.** `procurement`/`123` (procurement.html:1699), `stores`/`123` (stores.html:1844), and the same pair seeded as default portal users (portal.html:1346–1349). These are guessable in one attempt and grant Admin.

**CR-3. Plaintext credentials through public CORS proxies.** All apps fetch the credentials spreadsheet (`1fVBNtjelt…` — hardcoded in index.html:~9921, procurement.html:1539, stores.html:1681) as plaintext CSV through corsproxy.io → allorigins.win → cors-anywhere. Three third-party operators can read every username and password in transit, and the sheet ID is visible to anyone who views source. portal/procurement/stores additionally store and compare passwords in plaintext (portal.html:1390; procurement.html:1673).

**CR-4. Secrets in source.** Google OAuth Client ID (`438550085155-…`, portal.html:1712, index.html:~11504), Drive backup folder ID (`1Vocl734…`, in all four), invoice folder ID (index.html:~18183), and an Apps Script endpoint URL. None of these can be rotated without editing and redeploying every file.

**CR-5. No authorization anywhere.** `role` and `canExport` are stored on every user and **never checked**. Any authenticated user can approve their own requisitions (stores.html:2304; procurement.html — approval workflows unchecked), delete suppliers (procurement.html:2002), bulk-delete inventory (stores.html:3549), and export the full database.

**CR-6. XSS across all four apps.**
- **index.html:** the duplicate `escapeHtml()` at ~28680 (no quote escaping) overrides the correct one at ~22062, so every `onclick="fn('${escapeHtml(x)}')"` handler (≥10 sites: ~15499, 15601, 18642, 18857, 19118, 20456, 26912, 26934…) is breakable with a single quote in a department name or asset code. A manual workaround at ~24743 shows the team has hit this already.
- **portal.html:1520–1532:** usernames concatenated raw into the accounts table — `<img src=x onerror=…>` as a username executes for the admin viewing the list.
- **stores.html:2291–2292:** requisition IDs interpolated raw into `onclick` attributes; 2287/2407/2583 mix sanitized and unsanitized fields.
- **procurement.html:2016/2023/2687:** requisition and supplier names into `innerHTML` unsanitized; `document.write()` print windows (2235) unescaped.

Because credentials, OAuth tokens, and the whole database live in localStorage, **any single XSS = full compromise of that browser's data and Drive token.**

**CR-7. Primary data lives in localStorage with no recovery path.** `procurementData` (procurement.html:1538) and `storesInventoryData` (stores.html:1680) hold the entire operational dataset in one localStorage key each (~5–10 MB quota, silently fails when exceeded). Clearing browser data = losing the hospital's inventory, unless the optional Google Drive sync happened to be connected. index.html is better (IndexedDB for assets), but stores/procurement never got that upgrade. Several `JSON.parse` calls on these stores have no try/catch (stores.html:1688, 1804, 1884; procurement.html:1546, 1649, 3157) — one corrupted write bricks the app.

**CR-8. Sync is last-write-wins with no conflict handling.** Every app independently merges the single Drive backup file with no timestamps, locking, or 3-way merge (portal.html:2068–2075 even overwrites local *passwords* from cloud unconditionally). Two tabs or two devices editing concurrently silently lose data (stores.html:2177–2186 stock issue race). The backup file itself is one JSON blob, re-uploaded every 2 minutes, with no version history — a corrupted upload destroys the only backup.

### 4.2 App-specific criticals

| # | File | Finding |
|---|---|---|
| CR-9 | index.html | **Merge feature is broken** (H2): index-vs-ID mismatch means merging either no-ops or hits the wrong assets — direct data-loss path through a supported UI action. |
| CR-10 | procurement.html | Delivery notifications pushed into `storesDeliveryNotifications` localStorage with no validation (2718–2729) — stores inventory can be credited for deliveries that never happened. |
| CR-11 | procurement.html / stores.html | IDs generated from bare `Date.now()` (`'QR-'+Date.now()` etc., procurement.html:2540–2771) — same-millisecond operations collide and overwrite records. |
| CR-12 | All | Audit logs are mutable client data: stored in the same localStorage blob (procurement.html:1599), trimmed to 500 entries (stores.html:1751), erasable from the console. No non-repudiation for approvals. |

---

## 5. High-severity findings

1. **OAuth access token in localStorage** in portal/procurement/stores (`assetDashboardGoogleAccessToken`, portal.html:1760, procurement.html:2948, stores.html:4216) and as a fallback in index.html — XSS or any extension can take the Drive grant. Standardize on memory/sessionStorage only.
2. **Zero SRI on 6 CDN scripts** (xlsx 0.18.5, chart.js 3.9.1, qrcodejs 1.0.0, html5-qrcode 2.3.8, otpauth 9.2.1, Google GSI). A compromised CDN serves arbitrary code into a hospital system. Also: app is fully dead if cdnjs/jsdelivr/unpkg are unreachable — no local fallback, no service worker.
3. **No CSP or security headers** in any file — nothing limits where scripts load from or what an injected script can do, which amplifies every XSS above.
4. **Cloud merge without schema validation** (procurement.html:3003; stores.html:4324) — a malformed/hostile backup file merges straight into local data.
5. **window.open print crash** still in index.html ~16826 (popups blocked → TypeError).
6. **Silent failure modes:** auto-sync errors logged only to console (procurement.html:3046); IndexedDB-unavailable fallback is silent; portal login cards stay disabled forever if the initial Drive sync fails, with no actionable error (portal.html:1114, 2281).
7. **Duplicate function definitions** in index.html: `escapeHtml` ×2 (the root cause of CR-6) and `generateAssetId` ×2 (~14669, ~24366) — symptomatic of the file being too large to keep coherent.
8. **GCT (tax) computed independently in four places** in procurement.html (2051, 2098, 2282, 2869) — UI, print, and CSV export can disagree; finance reconciliation risk.

---

## 6. Medium / low findings (fix during hardening)

- Stock percentage divides by zero when `maxLevel` is 0 (stores.html:2062); requisition approval doesn't verify stock (2304); expiry-date math produces NaN on malformed dates (2379).
- Numeric inputs accepted via `prompt()` with no range validation — negative prices, NaN totals (procurement.html:2555–2557); items addable with qty/cost silently defaulted to 0 (stores.html:2007–2010).
- No undo for destructive operations; category deletion mass-reassigns items with no rollback (stores.html:3382).
- Memory leaks: `oninput` handlers re-attached per view switch (portal.html:1658–1663).
- Excel import dedupes by item code only (stores.html:4042); units not normalized ("Box"/"box"/"BOX").
- Hardcoded "May Pen Hospital" strings despite a settings mechanism existing (procurement.html:1481, 2108, 2210).
- Minimal ARIA labeling; no pagination on user/asset tables; `document.write()` (deprecated) in print paths.
- README is 2 lines; no architecture documentation, no runbooks.

---

## 7. Architecture & operations assessment

**Current shape:** four independent single-file SPAs, loosely coupled through shared localStorage keys (`portalUserAccounts`, `portalHeadingSettings`, `assetDashboardGoogleAccessToken`, `storesDeliveryNotifications`) and a shared Google Drive backup file. No server, no API, no shared code modules — auth, sync, and sanitize logic is copy-pasted into each file and has already drifted (index.html got the security fixes; the other three didn't).

**Deployment:** GitHub Pages (implied by the Search Console verification file — note the app is therefore publicly reachable and indexed), direct pushes to main, no tags/releases, no staging, no rollback procedure, no build step. `index.html` ships 1.5 MB of unminified text (minify+gzip would cut it ~80% to ~300 KB).

**Quality infrastructure:** no tests of any kind, no linting, no type checking, no CI, no error monitoring (114 ad-hoc `console.log`s in index.html are the only telemetry), no uptime monitoring, no status page.

**Multi-user reality check:** this system behaves as a *single-user-per-browser* app with periodic backup, not a multi-user system. Different users on one machine share all localStorage/IndexedDB data (no isolation); different machines converge only through the 2-minute Drive sync with last-write-wins. For a hospital with multiple staff in procurement and stores, silent data loss under concurrent use is a **when**, not an **if**.

---

## 8. Remediation roadmap

### Phase 0 — This week (hours each, do immediately)

1. **Remove the duplicate `escapeHtml()`** at index.html ~28680; keep the quote-escaping version at ~22062. Single highest-leverage XSS fix in the codebase.
2. **Fix the merge feature** (store `item.id`, not array index, at ~21509; the lookup at ~10826 already expects IDs).
3. **Remove/rotate the default `*/123` credentials** in portal.html, procurement.html, stores.html.
4. Add the missing `window.open` null check (index.html ~16826).
5. Wrap the unguarded `JSON.parse` calls in stores.html (1688, 1804, 1884) and procurement.html (1546, 1649, 3157) in try/catch with safe defaults.
6. Add **SRI `integrity` + `crossorigin` attributes** to all six CDN script tags in all four files.
7. Add a **CSP meta tag** to all four files restricting `script-src` to self + the five CDNs + accounts.google.com.
8. Replace bare `Date.now()` IDs with `crypto.randomUUID()` in procurement.html and stores.html.

### Phase 1 — Weeks 1–3: kill the credential exposure

9. **Stand up a minimal backend** (a single Google Apps Script web app, Cloudflare Worker, or small Node service is enough) that: (a) verifies username + password *hash* server-side against the sheet, (b) returns a short-lived session token, (c) never sends the credential list to the browser. This simultaneously eliminates CR-1, CR-2, CR-3, CR-4 (sheet ID moves server-side), and the CORS proxies.
10. Hash all passwords at rest (the index.html SHA-256+salt migration pattern already exists — port it; longer-term use a real KDF server-side).
11. Move the Drive OAuth token handling to sessionStorage/memory only, in all four files.
12. **Enforce roles**: gate approve/delete/export/admin functions on the session's role claim (client-side gating now, server-side once the backend handles data).

### Phase 2 — Weeks 4–8: data integrity

13. Migrate `procurementData` and `storesInventoryData` from localStorage to IndexedDB (reuse index.html's `_dbGet/_dbSet` layer).
14. Add per-record `updatedAt` timestamps and change sync from blob-overwrite to timestamp-aware merge with a conflict log; keep N rotated backup versions in Drive instead of one file.
15. Validate cloud backup schema before merging; validate `storesDeliveryNotifications` payloads on the stores side.
16. Make audit logs append-only and uncapped (move to IndexedDB; ideally mirror to the Apps Script sheet endpoint that already exists half-configured).
17. Centralize the GCT calculation in procurement.html into one function used by UI, print, and export.

### Phase 3 — Weeks 8–16: structure and operations

18. Extract shared code (auth client, sync engine, sanitize/escape, Drive client) into versioned shared `.js` files so fixes stop landing in only one of four copies; then progressively split index.html into modules with a lightweight build (Vite) producing minified output.
19. Add CI (GitHub Actions): HTML validation, ESLint, a smoke-test suite (Playwright: login, add asset, issue stock, create PO, print), and deploy-on-tag with a staging branch.
20. Add error monitoring (Sentry or even a simple `window.onerror` → Apps Script logger), plus a visible sync-status indicator so users know when their data has not been backed up.
21. Add a service worker for offline shell + local copies of the CDN libraries.
22. Write a README covering architecture, the localStorage/Drive data contract between the four apps, and a tested restore-from-backup runbook.

---

## 9. Bottom line

The suite is functionally rich and the March-audit fixes show the codebase is actively improving — but **everything security- and integrity-critical currently runs on the honor system in the user's browser**. The eight Phase 0 items are cheap and should ship this week. The genuine gate to production is Phase 1: until authentication moves off public CORS proxies and out of client-side code, this system should not hold real hospital data, because every username and password in it must be assumed compromised already (they have been transiting third-party proxies in plaintext). Recommend rotating all user passwords and the OAuth client secret as part of Phase 1 regardless of other choices.
