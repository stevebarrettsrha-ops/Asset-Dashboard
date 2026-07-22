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
