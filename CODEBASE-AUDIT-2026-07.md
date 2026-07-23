# Codebase Audit — Asset Dashboard (2026-07-23)

A full read-only audit was run across five dimensions (correctness, persistence/sync
races, performance, architecture, security) against the real code at scale
(~9,300 register assets, ~12,400 Location-Record items, 58 departments / 499 rooms,
a 4.7 MB `register-seed.js` and 1.6 MB `locations-seed.js`). This document records
**what was found, what was fixed in this pass, and the prioritized roadmap** for the
larger items intentionally deferred (they change auth/sync semantics or require a
build step and should be decided deliberately, not slipped in).

Every fix below was verified in headless Chromium against the real pages (login,
seed, merge, move, assign, next-code, search, backup payload). Zero page errors.

---

## A. Fixed in this pass (concrete, low-risk, high-value)

### Correctness / data-integrity
1. **XSS via the Assign-to-Room modal** (`index.html`). Department/room names were
   spliced into `onclick="assignRoomChoose('…')"` with a `&#39;` guard the HTML
   parser decodes back to `'`, so a room title like `x');alert(1)//` executed on
   click. Rewritten to carry names in `data-*` attributes read via `dataset` with a
   single delegated handler — the JS-string-injection vector is gone. Verified: a
   malicious title no longer runs.
2. **`syncAssetToLocationRecord` duplicated code-less items** (`index.html`). When an
   asset had no parseable code, `mphCodeKey` returned null, the "already present"
   check was always false, and every save appended another row. Now de-dupes by code
   identity when a code exists, else by a description/serial fingerprint.
3. **`mphDedupeLocationRooms` could delete the surviving room** (`asset-normalizer.js`).
   Dropped rooms were tracked by `r.id`; two id-less duplicates collided on
   `drop[undefined]` and took the merged primary down with them. Now tracked by object
   reference (a `Set`). Verified: id-less duplicates merge to one surviving room.
4. **`moveItemTo` dropped an item when the destination held its code** (`locations.html`).
   The row was spliced from the source but only re-added if no code-match existed in
   the target, silently losing differing fields. Now fills blank fields on the
   existing item instead of discarding the moved one.
5. **`mphSaveLocationRecords` reported success before the async IndexedDB write**
   (`asset-normalizer.js`). The "⚠️ NOT SAVED — storage full" guard keyed off the
   return value, so an async IDB failure + full localStorage fallback lost the edit
   silently. Added `mphOnLocationSaveError` listeners; `locations.html` registers its
   warning so a genuinely failed save always surfaces.

### Persistence / sync (multi-device correctness)
6. **`dataIsDirty` cleared before the upload** (`index.html performAutoSync`). A failed
   upload never restored it, so an asset edit was dropped from sync forever until an
   unrelated future edit re-set the flag. Now cleared **only** after a confirmed
   successful upload; any failure leaves it set to retry next cycle.
7. **Transient download failure still overwrote the cloud** (`index.html`). A non-401
   (5xx/network) cloud read failure skipped the merge and PATCHed un-merged local
   data over newer records another device had uploaded. Now aborts the upload unless
   the download succeeded (or the file is genuinely 404/absent).
8. **Location deletions never propagated to peers that already held the record**
   (`asset-normalizer.js`). Tombstones only blocked *re-adding*; a deleted
   department/room/item stayed forever on any device that already had it. New
   `mphPruneTombstoned` pass removes locally-present tombstoned records inside every
   merge. Verified: a tombstoned room is pruned from existing local data.
9. **Register self-heal resurrected deleted/disposed assets** (`index.html`). The
   re-apply-when-under-half path re-added every unmatched seed asset with no regard
   for deletion tombstones — a hospital that legitimately disposed >half its register
   got them re-injected. Now skips any seed asset whose id is in the deleted-id
   tombstones.

### Performance (cheap wins at real scale)
10. **Memoized `mphParseCode`/`mphCodeKey`** (`asset-normalizer.js`) — they sat un-cached
    on every consolidation/sync/series hot path (a series-popup open re-parsed ~25k
    codes). Now cached on the raw string (bounded to 50k entries). This is the single
    highest-leverage change; it also cuts the cost of the startup passes and merges.
11. **Register-search and Location-Records-search debounced** (~160 ms) — each keystroke
    re-filtered ~9,300 assets / re-scanned ~12,400 items and rebuilt the view.
12. **Released the 4.7 MB register seed from memory** after the startup migration
    (`index.html`) — `MPH_REGISTER_SEED.assets`/`MPH_REGISTER_ADDITIONS.assets` are
    nulled once migration is done (only `.review`/`.version`/`.stats` are needed
    afterwards), roughly halving resident register memory for the session.
13. **Register table: one disposal-map per render** instead of two full disposal-list
    scans per row (`displayAssetRegister`).

### Architecture / maintainability
14. **One `buildBackupPayload()`** replaces three verbatim-duplicated 22-line cloud-backup
    payload builders (`index.html`) — a new backed-up field or version bump can no
    longer be added to some sync paths and forgotten in others (a divergence that only
    surfaced at restore).
15. **One `getLocationRecords()`** accessor replaces the location-records read ternary
    that was duplicated ~8×.

---

## B. Prioritized roadmap (deferred — needs a decision or a build step)

These are real and documented, but each changes auth/sync semantics or needs tooling,
so they should be chosen deliberately rather than bundled into a fix pass.

### Security / data-safety (needs a product decision)
- **P1 — Plaintext portal passwords + 2FA secrets in the Drive backup.**
  `portalUserAccounts` stores cleartext passwords (`portal.html`) and the backup ships
  them (plus `localUserSettings.twoFactorSecret`). Anyone who can read the Drive file
  reads working credentials. Options: hash portal passwords (breaks the current
  plaintext-compare login and the "recover password from Drive" flow — needs a
  migration), or redact credentials from the synced payload. **Decide before relying
  on shared-Drive backups.**
- **P2 — Restore/import trust boundary.** Cloud restore and the Location-Records
  "Replace" path assign parsed JSON straight into storage with only a shape check;
  ids are preserved verbatim and later interpolated into attribute context (register
  rows, audit rows, `rowHtml`), so a poisoned backup is a stored-XSS vector.
  Remediation: on **every** restore/merge path, regenerate ids via `uid()` and
  deep-validate structure/types before persisting (the local-file `processImportData`
  already validates — factor it into a shared `validateBackupData` used by all paths).
- **P3 — User-account injection on restore.** Cloud `localUsers` are pushed with no
  role/shape validation, so a tampered backup can add an `Administrator`. Validate
  role/permissions against an allow-list on merge.
- **P4 — Default `kido` / portal `123` credentials** are shipped in the HTML and
  re-seed on every load, so a deleted default returns. Gate re-seeding so a deleted
  default stays deleted, and/or force a password change on first login.
- **P5 — Password hashing** is unsalted-per-user SHA-256 with one app-wide salt. Move
  to per-user salt + a stretching KDF; until then treat the backup hashes as
  near-cleartext (ties to P1).

### Sync robustness (deeper design)
- **S1 — Concurrent uploads are last-writer-wins.** No `If-Match`/generation
  precondition on the Drive PATCH, so two devices syncing in the same window can
  clobber each other. Use the file's `headRevisionId`/ETag as an `If-Match`
  precondition and re-merge on 412.
- **S2 — Union merges are add-only.** Field-level edits and renames to an existing
  asset/room never propagate between devices (only "Sync from Cloud" wholesale-replace
  adopts them, discarding un-synced local edits). Consider per-field `lastModified`
  timestamps (last-writer-wins per field) so edits converge.
- **S3 — Two-tab / iframe location writes** overwrite the whole blob with no
  compare-and-set; a stale cache can drop a concurrent room. A read-merge-write (or a
  single-writer election) would close it. (The BroadcastChannel refresh mitigates but
  doesn't eliminate the race.)
- **S4 — Asset delete + tombstone are two IndexedDB transactions**; a hard crash
  between them can resurrect the asset on the next cloud merge. Write both in one
  transaction.

### Structure / long-term (needs tooling)
- **T1 — Data as a versioned endpoint, not seed `.js` globals.** ~6.3 MB of asset data
  is `<script>`-parsed on every load and the register/additions split already exists
  because the primary file was too big to regenerate. Move to a fetched JSON manifest
  with an ETag/version so the app pulls deltas and the data stops living in git.
- **T2 — Extract subsystems from the 34k-line `index.html`.** Highest-payoff, lowest-
  coupling first: the 6,347-line inline `<style>` → `styles.css`; then the QR/scanner
  module (~600 contiguous lines); then the import wizard. Namespace each as `MPH.qr`,
  `MPH.import`, … rather than adding to the ~800 flat globals.
- **T3 — Add ESLint + a test beachhead.** No `package.json`, test, or lint exists.
  `asset-normalizer.js` is pure and side-effect-light — the cheapest place to lock in
  behavior (`mphParseCode`, `mphNormalizeCode`, `mphMergeLocationRecords`,
  `mphDedupeLocationRooms`, `mphPruneTombstoned`). ESLint `no-undef`/`no-unused-vars`
  would immediately surface global-collision risk.
- **T4 — Unify the three hand-bumped data-version flags** (`assetStructureVersion`,
  `assetRegisterAdditionsVersion`, `LOCATIONS_SEED_VERSION` — the last is a string
  compared against ints elsewhere) into one manifest derived from a content hash, so
  "applied" reflects actual data state instead of a flag that survives a wipe.

---

## C. How this was audited
Five independent read-only passes over `index.html`, `asset-normalizer.js`,
`locations.html`, and `portal.html`, cross-checked against objective metrics
(816 top-level globals, 3 duplicated payload builders, ~47 interpolated `onclick`
handlers, 82 `loadAssetsFromStorage` call sites). Fixes were then applied centrally and
verified end-to-end in a real browser. The deferred items in section B are tracked here
so they are chosen, not forgotten.
