# Location Records — Persistence Fix & Data Reconciliation
**Date:** 2026-07-22 · **Sources:** `AllTablesExport.xlsx` (room-by-room location records) · `AssetRegister_AllYears_20260722.xlsx` (system asset register — source of truth)

---

## 1. Why location records were disappearing (root cause)

Location Records lived only in each browser's `localStorage` (`hospitalLocationRecords`), and the cloud sync handled them destructively:

1. **Wholesale replace at login.** When a user clicked "Sync Now" at login, `performAutoSyncOnLogin` (and the "Sync from Cloud" / restore-backup paths) **replaced** the local location records with whatever the Google Drive backup contained.
2. **Empty skeletons poisoned the cloud.** Any browser that opened the dashboard without ever opening the Location Records page had all canonical departments auto-created with **zero rooms** (`mphEnsureLocationDepartments`). The next auto-sync from that browser uploaded this empty skeleton to Drive.
3. **Combination = data wipe.** The next user to log in anywhere had their full records replaced by the empty skeleton — exactly the "0 rooms • 0 items everywhere" state observed.
4. **Location edits never synced out.** Edits on `locations.html` never set the dashboard's `dataIsDirty` flag, so they were never uploaded — records could not travel between users even when nothing was wiped.
5. **Seed refreshes replaced user data.** Bumping the location seed version replaced the whole database with the new seed (a backup copy was kept, but the live records were reset).

## 2. What was fixed

| # | Fix | Where |
|---|-----|-------|
| 1 | **All cloud download/restore paths now MERGE, never replace.** A shared union merge (`mphMergeLocationRecords` in `asset-normalizer.js`) combines records down to the item level: local data always survives; cloud-only departments/rooms/items are adopted. An empty or older cloud copy can never wipe anything. | `asset-normalizer.js`, `index.html` (login sync, "Sync from Cloud", backup restore, periodic auto-sync merge) |
| 2 | **Deliberate deletions stay deleted.** Deletion tombstones (`hospitalLocationRecordsTombstones`) are recorded when a user deletes an item/room/department, synced through the cloud payload, and honored by every merge — so a union merge doesn't resurrect deleted records. Re-creating a department lifts its tombstone. | `asset-normalizer.js`, `locations.html`, `index.html` |
| 3 | **Location edits now reach the cloud.** Every save on the Location Records page stamps `lastModified`, sets a shared dirty flag, and (when embedded) notifies the dashboard — the existing Drive auto-sync then uploads them with everything else. | `locations.html`, `index.html` |
| 4 | **Location Records is now a page inside the dashboard** (sidebar → Records → Location Records, page 17) embedding `locations.html?embedded=1`. Same origin ⇒ the exact same stored records, now inside the platform's merge/sync/save pipeline. The standalone page still works and stays in sync via storage events. | `index.html`, `locations.html` |
| 5 | **Seed refreshes now merge instead of replace.** A new seed version is unioned into existing records (matched by room title / asset code), so user edits are never lost when new seed data ships. | `locations.html` |
| 6 | **Editing an asset no longer drops hidden fields** (aliases, register origin, disposal flags) — the edit form now merges onto the stored record. | `index.html` |

## 3. Spreadsheet audit & reconciliation

Every row of both workbooks was extracted and cross-referenced using the system's own code-identity logic (`mphCodeKey` — format-insensitive, so `MPH-166-02-AO` ≡ `MPH/AO/166/02`).

### AllTablesExport.xlsx (location records) — 442 sheets, 5,635 asset lines
- **3,455 items (93% of coded items) matched to a register asset** — 3,450 directly in the 2026-07-22 register export, 5 via the structured register seed's historical aliases. Matched items now carry the register's canonical asset code, so the two datasets are linked.
- **263 legacy codes had no register match** (e.g. `MPH/LD/332/03`, `MPH/113/01/LD`) — **kept verbatim**, nothing dropped. They surface in the dashboard's "Reconcile Locations" report for physical verification.
- **1,917 items were recorded without any code** — all kept in full (635 of them have a same-description register asset in the same department, listed as likely matches).
- Serial numbers and 1997/98 catalogue references from the workbook are preserved in each item's remarks; every location string (including misspellings like "Maintainance Department", "Administartive Department") was mapped to its canonical department; floor-level admin areas group under 1st/2nd Floor General Admin as before.
- **Result:** every workbook row seeded into its department and room — zero rows discarded.

### Register fill — no department left empty (seed v4)
The workbook only covers departments that were physically surveyed, which left office-type departments (Administrator Office, CEO Office, HR, ICT, Procurement, Staff Clinic, Transport, …) with 0 items even though the register owns assets for them. Seed v4 therefore also places **every system register asset not matched to a recorded room** into its department under a **"Register Items — Room Not Yet Assigned"** record (6,613 assets), so all **9,291 system assets** now appear in Location Records.
- **Final seed: 58 departments, 498 rooms, 12,248 items** (5,635 from the room-by-room workbook + 6,613 register-fill).
- As staff verify where those assets physically sit, the items can be moved into real room records; the "Room Not Yet Assigned" bucket marks exactly what still needs a walk-through.

### AssetRegister_AllYears_20260722.xlsx (source of truth) — 9,044 assets
- **8,939 assets already exist** in the system's structured register (seed v2).
- **105 assets were missing** (mostly registrations from Oct 2025 – Jul 2026: donated semi-electric beds, lockers, trolleys, IT equipment). They now ship in **`register-additions.js`** and are added **additively** on every device — an asset is only added when no live asset already carries its code identity (or, for code-less rows, its description/date/price fingerprint), so nothing is overwritten and nothing duplicates.
- Ambiguous export codes (e.g. `GEN.STORES-1` vs `GEN.STORES-01`, `MPH 1`…`MPH 8`, blank codes) were resequenced to unique canonical codes with the original preserved as an alias — **all 105 physical items survive**.

## 4. Seeding for the next login

- `LOCATIONS_SEED_VERSION` is now **4**: every user's browser will merge the full reconciled dataset in on next load. Users currently stuck with the empty skeleton get every department, room and item back automatically; users with their own entries keep them (union merge).
- A one-time backup of each browser's previous records is stored under `hospitalLocationRecords_backup_v<old>` before the merge.

## 5. New: room picker when adding assets

In the Add/Edit Asset form, departments that have rooms recorded in Location Records now show an expand button (▸ N rooms). Expanding lists the rooms; picking one selects the department and records the room on the asset (`asset.room`), shown as a removable chip under the Department field.

## 6. Verification (headless Chromium against the real pages)

- Fresh browser seeds v4 fully (58 departments — every one populated — 498 rooms, 12,248 items).
- The observed wiped state (empty-room skeleton) recovers completely on next load; user-created departments/rooms/items survive the merge, including the v3 → v4 seed upgrade (no duplicates, user entries kept).
- Deleted items stay deleted after a full re-merge (tombstones hold).
- An empty cloud copy merged over full local data changes nothing; cloud-only rooms are adopted.
- Saving in the embedded page marks the dashboard dirty for auto-sync; the dirty flag also bridges edits made on the standalone page.
- Register additions applied once (105 assets, idempotent on re-run).
- Room picker renders 34 expandable departments / 445 rooms and writes department + room correctly.

---

# Seed v5 — Reconciliation against the full LOCATION RECORDS document (2026-07-23)

**Sources compared**
- `merged_compressed.pdf` — the complete LOCATION RECORDS document (564 pages, **376 room survey reports** across 38 location headings). This is the printed room-by-room survey record and was used as the reference for "which rooms exist".
- `AllTablesExport.xlsx` (uploaded 2026-07-23) — **byte-identical** to the copy seed v4 was built from (same MD5), so the Access-table export contained nothing new.
- `AssetRegister_AllYears_20260723.xlsx` — newest system register export (8,775 rows).
- `locations-seed.js` v4 + `register-seed.js` v2 + `register-additions.js` v1 — the previous seeding.

**Method.** Every report in the PDF was parsed (location, room title, survey date, asset codes). Rooms were matched to seed v4 rooms first by normalised title, then — for renamed/resurveyed rooms — by asset-code overlap using the system's own code identity (`mphCodeKey`, format-insensitive).

## Rooms: 344 matched · 19 renamed/resurveyed · 8 were missing → now seeded

- **344 reports matched a seed room by title** (all wards, OT, OPD, Radiology, Laboratory, Maternity, Paediatrics, stores, admin offices, …).
- **19 reports are the same physical rooms under different titles/dates** (e.g. *"Doctors Room - 2A 009"* ≙ seed *"Doctors Quarters - 2A 009"*; *"Matron - DNS Office - 2fl"* ≙ *"2nd FL Matron Office"*; the Jul/Nov 2025 admin resurveys of Accounts, HR, Operations Manager, SMO, CEO offices). Verified by code overlap — no action needed.
- **8 surveyed rooms had never been seeded** — these are the rooms that were left out of the first seeding, now added in seed **v5** with their full item lists transcribed from the PDF:

| Department | Room (as surveyed) | Survey date | Items |
|---|---|---|---|
| Field Hospital | Open Area - FH | 9 Dec 2024 | 36 |
| Field Hospital | Room One | 9 Dec 2024 | 40 |
| Field Hospital | Room Two | 9 Dec 2024 | 21 |
| Field Hospital | Staff Area | 9 Dec 2024 | 50 |
| Accident & Emergency | Treatment and Observation Area - 2A 019 - 2A 020 | 20 Nov 2024 | 38 |
| Accident & Emergency | Passage of Nurses Quarters | 20 Nov 2024 | 8 |
| Accident & Emergency | Soiled Utility Room - 2A 018 | 20 Nov 2024 | 4 |
| Accident & Emergency | Security Post | 26 Jun 2025 | 2 |

**Total seed v5: 58 departments, 506 rooms, 12,447 items** (v4 was 498 rooms / 12,248 items). New rooms are appended *after* the whole v4 structure is built, so every existing seed4 room/item id is byte-identical — user tombstones (deliberate deletions) and the union merge keep working exactly as before. `LOCATIONS_SEED_VERSION` bumped 4 → 5; devices union-merge the new rooms on next load, user data untouched.

## Register: 20260723 export reconciled — 2 assets added

All 8,775 rows of `AssetRegister_AllYears_20260723.xlsx` already exist in the system register (seed v2 + additions) **except two Consultants Office plastic chairs** — `MPH/COADM/133/01` and `MPH/COADM/133/02` (01-FEB-2021, $6,900 each). They ship in `register-additions.js` **v2** and are added additively (never overwriting) on each device's next load.

## Why some departments look "empty" (not actually missing)

The PDF document itself files the admin-office surveys under **Administrative Department** (and 1st/2nd FL variants) — which is where the seed also keeps their room records (e.g. *Administrative Department → 2nd FL Matron Office / 2nd FL Accounts Department / Biomedical Engineer Office*, *1st/2nd Floor General Admin → CEO / Administrator / SMO offices*). The separate one-per-office departments in the dashboard (Human Resource Department, Matron Office (DNS), Operations Manager Office, CEO Secretary Office, …) therefore contain only their *"Register Items — Room Not Yet Assigned"* bucket. Nothing is lost — but if you'd prefer each office's room record to live inside its own department instead of under "Administrative Department", that's a rename/move we can do next.

## Flagged for physical verification (not auto-merged)

Resurveys of *existing* rooms sometimes list codes the seed doesn't have — usually because items were re-tagged or relocated between survey rounds. These were **not** auto-added (risk of double-counting the same physical item); verify on the floor:
- *Accountant Office (24 Oct 2024 survey)*: `MPH/ADM/AC/173/01` (document holder) and `MPH/ADM/AC/112/01` (bin) are marked **"Relocated to Area MPH/112/02/ADM/OPRM"**; laptop `MPH/ADM/AC/405/01` (SRHA/MIS/2970) not in the Nov 2025 resurvey.
- *A&E Doctors Office Two - 2A 008 (26 Jun 2025 resurvey)*: adds `MPH/138/01/CSSD`, `MPH/113/17/AE`, `MPH/174/01/AE`, `MPH/725/06/AE`, label `MPH-I-L-0046`.
- Isolated one-off codes in ward reports that appear nowhere in the register (e.g. `MPH/BOS/01/PD`, `MPH-IL-…`/`MPH-ID-…` inventory labels in Maternity/Medical Records/OPD reports) — kept out of the seed; they surface in the dashboard's "Reconcile Locations" report when entered.

---

# Seed v6 — Office rooms moved into their own departments (2026-07-23)

**Problem reported:** searching a department like *Biomedical Engineer Office* showed three entries — the umbrella departments that actually held the record (*Administrative Department*, *1st Floor General Admin*) and the office's own department showing **0 rooms • 0 items**, even though the LOCATION RECORDS document clearly has records for it (same for Matron Office, Accounts Department / Accountant Office, CEO, HR, SMO, Operations Manager, CCTV, Cashier, Customer Service, Transport, EOC, ICT, EHR, Social Worker, Consultants…).

**Fix.** A shared consolidation map (`mphConsolidateOfficeRooms` in `asset-normalizer.js`) now knows which surveyed room titles belong to which office department — including every historical title variant (e.g. *"Matrons Office"*, *"2nd FL Matron Office"*, *"Matron - DNS Office - 2fl"* → **Matron Office (DNS)**). It moves those rooms out of the umbrella departments into the office's own department, union-merging items when the room already exists there (so nothing duplicates and nothing is lost). It is applied:

1. **to the seed itself** at build time (fresh devices start with the clean layout);
2. **inside every location-records merge** — seed apply, login sync, cloud sync, backup restore — so existing devices are migrated on their next load (`LOCATIONS_SEED_VERSION` 5 → 6 forces one merge pass), and an un-migrated device's cloud copy can never re-introduce the old layout.

**Where rooms moved** (source: Administrative Department / 1st–2nd Floor General Admin / Front Administrative Department):
Biomedical Engineer Office · Matron Office (DNS) (incl. Deputy Matron) · Accounts Department (Accountant Office + Accounts Department rooms) · Human Resource Department (Main Office + Senior HR Officer) · Operations Manager Office · ICT Department (MIS/ICT) · EHR Department · Administrator Office · Chief Executive Officer Office · CEO Secretary Office (incl. Stationery Room) · SMO & DNS Secretary Office · Senior Medical Officer Office · Social Worker Office · Consultants Office (Dr. Campbell + Surgeon offices) · Customer Service Department (incl. Senior CSO office) · Cashier Office (Main Cashier 2B 1012) · CCTV Office · Emergency Operational Centre · Transport Department (incl. Sleeping Quarters) · In Service Department (Room 2B 1002).

Rooms that genuinely belong to the umbrella locations stay put (reception/telephone areas, conference area, lunch/recreation rooms, passage ways, kitchen, police/security posts, Nurse Moores Office).

**Verified headless (Chromium):**
- Fresh seed: office departments populated (e.g. Biomedical Engineer Office = its 14-item room + register bucket); totals 58 departments / 504 rooms / 12,447 items (2 duplicate-titled rooms merged, zero items lost).
- A device with the old layout (offices under 1st/2nd Floor General Admin, empty office departments — the reported state) migrates fully on next load: rooms move home, no duplicates, user-created departments/rooms untouched.
- Merging an old-layout cloud backup into a migrated device re-consolidates automatically; extra items from the cloud copy are still unioned in.

---

# Fix: "when I save a new location record, the data gets lost" (2026-07-23)

**Root cause: browser storage quota.** The Location Records database is ~4.2 MB in localStorage, and every past seed upgrade also stored a full-size safety backup beside it (`hospitalLocationRecords_backup_v1`, `_v3`, `_v4`, …). On long-lived devices those backups exhausted the browser's per-site storage quota. From then on, **every save of a new record threw `QuotaExceededError`**: the record appeared on screen (it was in memory) but was never written to storage — the only feedback was a small toast — so it vanished on the next reload or page switch. Reproduced headless: with old backups present, writing one more backup already fails with `QuotaExceededError`.

**Fixes (all verified headless):**
1. **Quota-safe save everywhere** — new shared `mphSaveLocationRecords()` (asset-normalizer.js): if a write fails, it deletes the old seed backups (live records always outrank historic backups) and retries. Used by the Location Records page `save()`, the dashboard's cloud-merge, ensure-departments and add-department paths.
2. **Backups can no longer accumulate** — at startup at most one historic backup is kept (`mphPruneLocationBackups`), and a seed upgrade now prunes before writing its new backup.
3. **No more silent loss** — if storage is genuinely unusable even after recovery, the page now shows a red "⚠️ NOT SAVED — browser storage is full" toast **and** a one-time alert telling the user to click Backup (download their records) before reloading. A failed save can no longer masquerade as a successful one.

**Verified:** save under a full quota now persists (backups auto-pruned, record survives reload); with storage forcibly dead the warning fires and nothing pretends to be saved; all normal save/reload/cloud-merge/consolidation flows unchanged.

---

# Location Records moved to IndexedDB (2026-07-23)

localStorage's ~5MB quota was the root cause of lost saves, and pruning backups only bought headroom — the records blob itself keeps growing. Location Records now live in **IndexedDB** (`MPHLocationRecordsDB`), which has no meaningful size limit:

- **Shared store in `asset-normalizer.js`** — an in-memory cache serves every existing synchronous call site (`mphGetLocationRecordsAny`); writes update the cache instantly and persist to IndexedDB asynchronously (`mphSaveLocationRecords`). Both `locations.html` (standalone + embedded) and `index.html` wait for `mphLocationStoreReady` before touching records.
- **Automatic migration** — on first load the legacy `hospitalLocationRecords` localStorage copy is imported into IndexedDB and removed, freeing ~4MB of quota; historic seed backups are pruned to the newest one. User data, seed upgrades and the office-room consolidation all apply on top as before.
- **Crash safety** — if the tab closes while a write is still in flight, the latest state is parked in localStorage (plenty of room now) and recovered on next load.
- **Cross-tab/iframe sync** — saves broadcast on a `BroadcastChannel`; other tabs and the embedded dashboard frame refresh from IndexedDB and re-render live (the old localStorage `storage`-event path no longer fires for records).
- **Graceful fallback** — browsers without usable IndexedDB (e.g. some private modes) fall back to the previous quota-safe localStorage path, including the loud NOT-SAVED warning.

**Verified headless:** fresh device seeds 58 departments straight into IndexedDB with zero record bytes in localStorage; a legacy localStorage-only device migrates with user data intact (then merges seed v6, old backups pruned); saves survive reload; a save in one tab appears live in another tab; stale-cloud merge + office consolidation work unchanged over the new store.

---

# Google Drive sync verified for the new store + next-code popup (2026-07-23)

**Google sync:** audited end-to-end against the IndexedDB store. All three upload payload builders (auto-sync, silent save, manual save) read records through the shared store accessor; all four download/restore paths (login sync, manual "Sync from Cloud", cloud-backup restore, merge-on-upload) go through the tombstone-aware union merge and save back through the quota-safe store writer; the dirty-flag ride-along from the Location Records page still triggers uploads. Hardened: every upload now refreshes the records cache from IndexedDB first, so an edit saved seconds earlier in another tab or the embedded frame always rides along.

**New: next asset code in series.** When adding a new asset and picking a department, a popup lists every code series (item group) already registered under that department's code token — e.g. *"133 — Chair, Executive · 75 registered · highest number: 65 → Next: MPH/AE/133/66"* — with a search filter; clicking a row fills the Asset Code field. Reopen any time with the 🔢 button beside the code field. Suggestions are computed live from the register (including aliases, ranges like `19-26`, and zero-padding), so they never collide with an existing code. Verified headless via a real login: series list, ground-truth max sequence, click-to-fill, and collision check all pass.

---

# Seed v7 — duplicate "ghost" rooms merged + restore file (2026-07-23)

**Problem reported:** departments showed *two* copies of many rooms — an empty set titled after the survey PDF file names (e.g. *"Room IA-068 (Patient Bay)" — 0 items*) next to the seeded set that actually holds the data (*"Patient Bay - IA 068" — 16 items*). The data was never missing; it lived in the differently-titled twin, and the union merge kept both because it only matches identical titles.

**Fix (`mphDedupeLocationRooms`, runs in every merge + at seed build):** rooms in the same department are recognised as the same physical room when their room-number codes (IA-068, 2B 1002, 3J 010, … — including the IA/AI transposition) and their remaining significant words match; code-less titles match on significant words alone. Duplicates collapse into the copy holding the data. Safety rules: word-only matches merge **empty** duplicates only, code matches union items count-aware — so anything a user typed into a ghost room is preserved, and genuinely different rooms (e.g. *Passage Way (Beside IA-075)* vs *Room IA-075*) never merge. Seed version bumped to **7** so every device runs the cleanup on next load; cloud copies from unupdated devices are re-cleaned on every sync.

**Verified headless** by recreating the reported state (Female Medical Ward with 19 ghost rooms → 42 rooms): after one load it returns to **23 rooms, zero empty**, ghost-typed data preserved, and 5 legitimate double-survey rooms in the seed itself also merged (A&E Staff Lounge 3J 010, Treatment/Observation 2A 019, OT Orderly Lounge 2Q-020, OT Control/Scheduling 2Q-002, FSW Room 2R 005).

**`location-records-restore.json`** (repo root) — the complete reconciled dataset (58 departments · 499 rooms · 12,444 items from the LOCATION RECORDS document + Access export + register), shaped for the Location Records **Restore → Merge** button. Uploading it on any device fills in anything missing; on an up-to-date device it adds exactly nothing (verified idempotent: +0 departments, +0 rooms, +0 items).
