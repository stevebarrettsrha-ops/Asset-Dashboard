# System Audit — May Pen Hospital Asset Dashboard
**Date:** 2026-07-13 · **Scope:** `index.html`, `stores.html`, `procurement.html`, `portal.html`, `locations.html` (+ `locations-*.js`)
**Focus:** long-term structural soundness · no data loss · IndexedDB for large storage · feature correctness · cross-page data consistency

---

## 1. Executive summary

The application is, overall, **structurally sound**. A static integrity sweep found **no dead buttons** (all 296 inline handlers resolve to real definitions), **no duplicate element IDs**, **no fatal duplicate `const` declarations**, fully-wired page navigation, and no initialization race on the main login→render path. Depreciation and salvage math are centralized and consistent across every view.

The real risks were concentrated in three areas: **storage durability**, a few **duplicate function definitions** that silently shadowed the intended implementation, and **accounting inconsistencies** where disposed/deleted assets are filtered differently by different views.

The storage/data-loss and IndexedDB items — the highest-severity findings and the core of the request — have been **fixed and verified**. The remaining accounting-consistency items are documented below with recommendations; several change displayed totals and need a business decision on the intended behaviour before being applied.

---

## 2. Fixed and verified in this pass

### Storage durability & "never lose data" (index.html)
| # | Issue | Fix |
|---|-------|-----|
| C1 | Async IndexedDB writes could be lost if the tab closed in the split second before the transaction committed. No unload flush existed. | On `pagehide`/`visibilitychange:hidden`, any not-yet-committed write is mirrored to localStorage and **recovered on next load**, then cleared once the async write confirms. |
| H1 | `saveAssetsToStorage`'s try/catch was dead code — `_dbSet` is fire-and-forget, so write failures only reached the console. Users saw "saved" when nothing persisted. | Genuine IndexedDB write failures now raise a one-time visible warning telling the user to export a backup. |
| H2 | The localStorage fallback re-introduced the ~5MB quota risk for the large keys, failing silently. | Fallback failures now surface the same warning instead of vanishing. |
| M1 | Writes issued before IndexedDB finished initializing were cache-only and then clobbered by the values loaded from disk. | Pre-init writes are queued and flushed after init; init no longer overwrites a key with a pending write. |
| M2 | `qrCodeRegistry` duplicated **full asset records** into localStorage and grew unbounded — a real quota risk. | Moved into the IndexedDB layer (durable, uncapped). |
| M3 | `disposalDeletedIds` (tombstones preventing deleted disposals from re-syncing) was not re-seeded after IndexedDB init, unlike `deletedAssetIds`. | Re-seeded from the cache during init. |

### Storage durability (stores.html & procurement.html)
These modules stored their **entire growing dataset** (inventory items, transactions, batches, purchase orders, quotations, deliveries, invoices) in a single localStorage blob with **no error handling and no IndexedDB** — once past ~5MB, saves failed silently.
- `saveData` now persists to **IndexedDB** (durable, effectively uncapped), with localStorage kept only as a fast read cache.
- The cache write is guarded; a full cache warns the user once (data is still saved to IndexedDB).
- On load, the page **hydrates from IndexedDB** (source of truth) after the DOM is ready, so data survives localStorage eviction/quota loss.
- **Verified:** data persists across reloads and is recovered from IndexedDB even after localStorage is wiped.

### Correctness / duplicate-shadow fixes (index.html)
- **`stringSimilarity`** was defined twice; the weaker (case-only, not null-safe) copy won. Removed it so the null-safe, punctuation-insensitive version is canonical → **better duplicate detection** (`"X-Ray"` vs `"X Ray"`).
- **`escapeHtml`** was defined twice; the copy that *didn't* escape single quotes won. Removed it so the attribute-safe version is canonical.
- **`generateAssetId`** duplicate removed (identical body).
- **`printCategoryReport`** counted Purchased/Donated by row count while every other view uses summed quantity → now consistent.
- **`refreshAllViews`** now also refreshes the Fiscal Year Report when it is the active page.
- **`removeDisposalRecordsForAsset`** now prefers precise `assetId` matching and only falls back to code matching for records with no `assetId`, so deleting one duplicate can no longer wipe another asset's disposal record that shares the same code.
- Dashboard aggregation coerces `quantity`/`totalPrice` to numbers, preventing a single bad value from turning totals into `NaN`.
- **Form 7C ↔ Board of Survey link:** added a "Populate from Board of Survey" button so the Boarded Items form can seed itself from the disposal ledger (description, asset code, original value, reason, method → recommendation) instead of being fully standalone.

All changes were verified in a headless browser: pages load with no JS errors, storage round-trips (including crash-recovery and IndexedDB-after-wipe), and the edited functions run cleanly.

---

## 3. Open findings — recommendations (not yet applied)

These are real but either change displayed numbers (needing a business decision) or are larger structural/security items. Ordered by impact.

### A. Disposal-accounting is applied inconsistently across views *(needs decision)*
Disposed assets are excluded **only when a toggle is on** in the Dashboard and Register, but **always** in the Fiscal Year Report, and **never** in the printed Register/Category totals (which tag rows "DISPOSED" but still add their value). BOS import / `syncBosAssets()` can also represent one item as **both** an active asset **and** a disposal record. The result: the same data yields different totals in different views.
**Recommended:** treat "disposed" as removed from all *active* aggregates everywhere (the toggle then only affects row visibility/greying), and represent a boarded/disposed item once (flag the asset rather than keeping an active copy). *This changes displayed totals, so confirm the intended rule first.*

### B. Dashboard "Medical vs Furniture" split is a hardcoded binary
The dashboard buckets everything that isn't exactly `"Medical Equipment"` as "furniture", so `"Industrial Medical Equipment"`, `"Electronics"`, etc. land under furniture — disagreeing with the register/category views that group by the real category. **Recommended:** a single `getCategoryBucket()` helper used by the dashboard KPIs, charts, and every grouped aggregate.

### C. Cross-module / security items
- **Procurement → Stores delivery handoff is a dead write:** procurement writes `storesDeliveryNotifications` but stores never reads it, so received goods never flow into inventory. Either implement a stores-side "pending deliveries to receive" queue or remove the write.
- **Portal "Account Settings" opens with no authentication** and user passwords are stored/displayed in **plaintext** in `portalUserAccounts`. Recommend gating the panel and hashing at rest.
- **Login case/precedence differ** between stores (portal-first, lowercased) and procurement (Sheet-first, case-sensitive) for the same credentials. Recommend a single normalized username comparison and documented precedence. *(Auth-flow change — left untouched pending confirmation as it's high blast-radius.)*
- **index ↔ locations asset drift:** the register (`assetInventoryData`, IndexedDB) and location records (`hospitalLocationRecords`, localStorage) describe the same assets with **different asset-code formats** and no sync. Recommend one canonical code and a defined source of truth.

### D. Consistent by design (verified OK)
`portalUserAccounts`, `portalHeadingSettings`, and the Google OAuth token keys have consistent schemas across all pages; depreciation/salvage math is centralized; no base64/image blobs are written to storage anywhere.

---

## 4. Verification method
All fixes were exercised in a headless Chromium browser driving the real files: page load (no console/page errors), IndexedDB read/write round-trips across reloads, crash-recovery of an uncommitted write, IndexedDB recovery after a localStorage wipe, and direct invocation of every edited function against edge-case data. Note: some features that depend on CDN libraries (SheetJS, Chart.js) cannot be exercised in the sandbox because outbound CDN access is blocked there; those load normally in a real browser.
