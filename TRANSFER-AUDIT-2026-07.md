# Audit — "transferred assets return to their old department on refresh"

**Date:** 2026-07-31 · **Scope:** `index.html`, `locations.html`, `asset-normalizer.js`
**Reported:** assets transferred from one department to another reappear in the
department they were transferred *out of* when the dashboard refreshes.
**Follow-up requirement:** items deleted from the Location Records must stay
deleted, on every page.

Both are reproduced, root-caused and fixed below. Verified against the real
dataset (58 departments, 12,443 Location-Record items, ~9,500 coded assets) in
headless Chromium, plus 21 unit checks on the shared merge logic.

---

## 1. Root cause — the merge was a union with no memory of a move

Deleting was remembered (a tombstone). **Moving was remembered by nothing.**

`mphMergeLocationRecords` unions incoming records into local ones, matching
items *within a room*: "is this item already in THIS room?" After a transfer,
the item is no longer in the source room — so every older copy of the records
that still showed it there was treated as new information and the item was
added back:

| Path | What it merges | Result before the fix |
|---|---|---|
| Cloud auto-sync | the backup written *before* the transfer | item re-added to the old department, then uploaded — so the cloud permanently held it in **both** |
| Seed refresh (`locations-seed.js`) | the shipped survey snapshot | transfer undone on the next seed version bump |
| Backup restore (Merge **and** Replace) | the backup file | transfer undone |
| A peer device that hadn't synced | its stale records | transfer undone, and re-uploaded |

The cloud path is the one users hit: the very next auto-sync after a transfer
re-created the item in its old department. That is the reported symptom.

### Aggravating factors found in the same sweep

2. **`applyStructureMigration` let the register seed overwrite `department` and
   `room`.** `Object.assign({}, a, _seedToAsset(sa))` — seed fields win. The
   self-heal re-run (fires whenever the live register drops below half the seed)
   therefore reverted *every* transfer on the device to the seed's snapshot.
3. **Bulk Department change never touched the Location Records at all.** The
   register showed the new department, the Location Records kept showing the
   asset under the old one.
4. **Editing an asset's department only mirrored when a room was also set**
   (`if (assetData.room)`), so a department-only change never reached the
   Location Records.
5. **`canonicalizeAllAssetDepartments` re-derived the department from the asset
   code** whenever the department was blank/Unassigned. Asset codes encode the
   department they were *issued* under, so an asset deliberately moved to
   Unassigned snapped back to its original department on every single load.

### Deletion (the follow-up requirement)

6. **Tombstones keyed on the row id only.** Row ids are not stable across
   sources — the seed, the dashboard's assign flow (`assign_i_…`) and a restore
   (`uid('item')`) each mint their own. An id tombstone blocked exactly one
   copy, and the deleted item walked straight back in under a different id on
   the next merge. Reproduced against the pre-fix code.
7. **Restore ignored tombstones entirely.** `mergeIntoDb` re-created every
   incoming row with a fresh id, and "Replace" swapped in the file wholesale.
8. **`syncAssetToLocationRecord` re-created deleted rows** whenever the matching
   register asset was saved for any reason.

---

## 2. The fix

### A transfer ledger (`asset-normalizer.js`)

A move now records **where the item went and where it came from**, keyed by an
identity that survives a re-generated row id (the asset code when there is one,
else the row id). It rides the Google Drive backup exactly like tombstones do
(`locationMoves`), newest transfer wins, and origins union across devices.

```
moves: { "c|MM|100|1|": { dept, deptName, room, roomTitle,
                          from: [{dept, room}, …], at } }
```

New shared API: `mphGetLocationMoves`, `mphSaveLocationMoves`,
`mphRecordLocationMove`, `mphMergeLocationMoves`, `mphApplyLocationMoves`,
`mphIsStaleLocationCopy`, `mphForgetLocationMove`, `mphLocationMoveKey`.

**Why the origin matters — and why this is deliberately narrow.** 449 asset
codes in the real survey data legitimately appear in more than one room (1,222
rows: the same code written on several room sheets). A "one code, one row" rule
would have deleted ~773 of them. The ledger can only ever remove a copy from a
location the user *personally moved that item out of*; every other copy of that
code is left alone. The regression test asserts this explicitly, and the
end-to-end run asserts the total item count only ever drops by the one row
deleted on purpose.

### Merge is now position-aware — in two narrow ways

`mphMergeLocationRecords` rejects an incoming row when:
- its **row id** is already held anywhere locally (an id names one row, so a
  second sighting is a stale snapshot of where it used to be), or
- the ledger says that item was **moved out of** the room the incoming copy
  names.

`mphApplyLocationMoves` then has the last word inside every merge: a copy
sitting at a recorded origin is removed, and a device that learned of the
transfer only through the synced ledger relocates its copy to the destination.

### Deletion holds everywhere

- Tombstones gained a `codes` map. `mphTombstoneLocationItem` records **both**
  the row id and the asset code; `mphIsItemTombstoned` / `mphPruneTombstoned`
  check both, so a deleted item cannot return under a new id from a seed, a
  peer device or a restore.
- Restore (Merge **and** Replace) filters incoming rows through the tombstones
  and re-asserts deletions and transfers afterwards.
- `placeAssetInLocationDb` refuses to re-create a deliberately deleted row.
  Only an explicit re-assignment — which lifts the tombstone first — puts it
  back. Typing or assigning a code in the Location Records lifts it too.
- Both pages re-assert deletions and transfers on load, so the state is the
  same whichever page you open.

### Register side

- `applyStructureMigration` never overwrites `department`/`room` for an asset
  carrying `locationUpdatedAt` (set by every transfer path), and never on a
  self-heal re-run.
- `canonicalizeAllAssetDepartments` no longer re-derives the department from the
  asset code for a deliberately placed asset.
- Bulk Department change mirrors into the Location Records (one read + one write
  for the whole batch, not one per asset) and clears the stale room.
- Editing an asset mirrors a department-only change.
- `assignRoomChoose` and `rehomeAssetToRoom` stamp `locationUpdatedAt`.

---

## 3. Verification

**Unit — 21 checks** on the real `asset-normalizer.js` (`transfer-test.js`):
transfer vs. pre-transfer snapshot; stale snapshot carrying a different row id;
peer device receiving only the ledger; a multi-room code not being collapsed;
multi-hop A→B→C never reappearing in A or B; deletion surviving a new id;
ordinary union merges still adopting genuinely new departments, rooms and items;
two identical uncoded items in different rooms both surviving.

Confirmed these fail on the pre-fix code:
```
✗ PRE-FIX: bed came back to Male Medical Ward after merge  ["MPH/MM/100/01"]
✗ PRE-FIX: deleted item came back as ["MPH/MM/100/01"]
```

**End-to-end — 8 checks** in headless Chromium against `locations.html` with the
full seed (58 departments / 12,443 items): transfer an asset, reload, force a
full seed re-merge — it stays in the destination and never returns to the source
room. Delete an item, force a seed re-merge — it stays deleted. Final item count
is exactly `seed − 1`, proving no survey rows were collaterally destroyed.

**Dashboard — 6 checks** against `index.html` with the full register seed: the
migration runs, the backup payload carries the ledger, a dashboard transfer
records an origin, and there are no page errors.

---

## 4. Open observations (not changed)

- **449 asset codes appear in more than one room** in the survey data (84 span
  more than one department). Some are genuine duplicate survey entries, some are
  probably distinct items sharing a mis-keyed code. Only a data owner can tell
  them apart, so nothing here touches them — but they are worth a cleanup pass.
- **A custom department name that embeds a canonical location name** (e.g. "Old
  Maternity Store" contains "Maternity") is rewritten to the canonical location
  by `canonicalizeAllAssetDepartments` on every load. That is the intended
  messy-name cleanup, but it makes such custom names impossible to keep.
- **Deleting an item from the Location Records does not delete the asset from
  the financial register.** That is deliberate — the register carries
  acquisition cost and depreciation — but it means the two stores can disagree
  by design. The "Reconcile Locations" report on the Asset Register surfaces the
  drift. Say the word if deletion should propagate to the register too.
