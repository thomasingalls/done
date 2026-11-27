# The desktop's "size limit" refusal

A delegated agent's report from 2026-11-11, filed as delivered. Read-only. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** Led to phases 541 and 542.

---

## Desktop "History on this device" capacity park: likely cause, size accounting, options

Tags: (R) = verified by reading at HEAD `dab256e45`. (M) = measured by me. (I) = inferred. The size-relevant files are byte-identical between production `759890ca0` and HEAD. Only `automaticLocalRetention.ts` differs, by the phase 539 hold; its parking logic is the same (R, `git diff --stat`). I ran three small Node scripts in the scratchpad against the repo's yjs 13.6.31. Nothing in the repo was touched.

### Conclusions
- **Most likely limit: the encoded-baseline guard.** That is `localBaselineRecord.ts:261`, which `localRetentionPlan.ts:448-449` maps to `capacity` (I). The encoding writes every carried byte as hex, so it doubles. A device that has installed a service snapshot also carries that snapshot inside the baseline hexed a second time, about 4.4× the snapshot's raw size. That is the strongest candidate for an overage the desktop has and the phone did not.
- **Second candidate: the 32 MiB preparation budget** (`retentionPreparation.ts:429` and `:489`). The journal caches the decrypted plaintext of every stored row (`localRetentionPlan.ts:354-361`) (R). On a device that has never reduced, this fires once its rows exceed about 32 MB (I).
- **The screen does not say which site fired.** Both paths end in the same `capacity` reason (`automaticLocalRetention.ts:268-269`, `LocalHistoryMaintenance.tsx:56-57`) (R).
- **The service path has a tighter limit** (a document of about 1.3 MiB), and it threatens every device, not only devices that are behind.

### 1. Telling the sites apart without DevTools
- **Baseline refusal:** happens only after the screen has shown "Building a smaller history snapshot…". That stage is reported when the full reference completes (`localRetentionPlan.ts:435-437`, `localBaselineReplay.ts:417`); the encode follows at `:562` (R).
- **Site 429:** fires while the screen shows "Reading saved history: X of Y records…" or "Verifying saved history…" (R).
- **Site 489 and the 64 MiB binding:** run while the saved journal loads, before any record count appears (`retentionPreparationStorage.ts:216`, `:235`; `localRetentionPlan.ts:330` runs before `:332`). Only the generic line shows (R).
- **Storage sites 433 and 476:** fire when a slice is saved after a pause (`contentStore.ts:1076-1105`) (R).
- **Record count:** Y in "X of Y" is the row count, to compare with the 131,072-entry limit (R).
- **Chrome's storage figure for the site:** if the site stores less than about 30 MB, the 32 and 64 MiB budgets are effectively ruled out (I).
- **Smallest diagnostic addition:** separate closed sub-reasons ("baseline" at `localRetentionPlan.ts:449`, "preparation" at `automaticLocalRetention.ts:268`), plus the encoded-size-to-limit ratio. Status lives only in memory, so this changes no format (R).

### 2. What the encoded baseline contains
The baseline is a JSON array (`localBaselineRecord.ts:97-131`) in which every byte field is lowercase hex (`:83-86`) (R):
- **Snapshot (`:112`): 2R**, where R is `encodeStateAsUpdate` of a `gc:false` document (`localBaselineReplay.ts:185-191`).
- **Own receipt (`:113`):** envelope plus proof, ×2. The own stream's receipt is serialized again in `streams` (`:115-122`, `localBaselineReplay.ts:520-531`). When the self-receive position equals the accepted position these are the same receipt (I), so the last own envelope counts ×4. Envelopes are at most 512 KiB (`account-protocol/envelope.ts:12`).
- **Each peer stream (up to 128):** its last receipt, ×2.
- **Unconsumed source capsules (`:114`, `localBaselineReplay.ts:502-516`):** ×2.
- **History (`:123`, `localBaselineReplay.ts:554`, `inboundLedger.ts:245`):** the whole latest install event. That event is JSON whose checkpoint ciphertext is already hex (`historyCheckpoint.ts:125`, `historyInstall.ts:54-67`), with the state vector and delete set in hex twice (manifest and admission). In the baseline this comes to about 4.4× the service snapshot.
- **Phase 442 check:** 5,763,419 − 2 × 2,779,095 = 205,229 bytes outside the snapshot.

How each factor scales:
- **Document size:** R only grows (every Doc is `gc:false`). Cursor typing with backspaces costs 3.2 bytes per keystroke (M). Deleted pastes are kept in full.
- **Deleted text:** never shrinks R; in my test the delete set was about 5% of R (M).
- **Number of devices/writers:** 50 Yjs clients instead of 1 made no measurable difference to R (M). Each publisher adds one receipt (above).
- **Undo history:** undo stacks are not stored; undo and redo add items like typing does (I).
- **Unsent local work:** unsent positions make the device ineligible rather than larger (`:484-489`); unallocated sources make it larger.

### 3. Why the phone could reduce and the desktop cannot
Differences that could push the desktop over 4 MiB:
- **(a) Installed snapshot.** If the desktop installed a service snapshot after the phone reduced, the desktop's baseline is about 6.4R against the phone's 2R. With R near the snapshot size, a document of 0.66 to 1.3 MiB reduces on the phone, parks on the desktop, and still installs (I).
- **(b) Large last own envelope.** The desktop's last envelope after draining in batches could be up to 512 KiB, counted ×4, which is up to 2 MiB.
- **(c) Later growth.** R grew as the desktop's backlog reached the document after the phone had reduced.
- **(d) Unallocated sources** on the desktop.
- **(e) Journal size.** The never-reduced desktop's rows against the phone's smaller, earlier set.

The era or format version cannot explain it. Both first reductions write draft-3 with an era (`localRetentionPlan.ts:406-410`; `localBaselineRecord.ts:98,130`), a difference of about 150 bytes (R).

**Prediction under (a):** the phone parks too once it installs a newer snapshot (`localBaselineReplay.ts:554`).

### 4. Is the parking permanent?
- **When it retries:** the parked key is `revision:records` (`automaticLocalRetention.ts:170`, `:295-296`). Any new row changes it, and a retry follows after the 10 s quiet period plus 60 s (`:291-292`). "Check again" and reopening the workspace also clear the park (`:377-386`, `:89`) (R).
- **Why retries keep failing:** only the receipts (replaced at the next accepted position) and sources can shrink. The snapshot never shrinks, a newer install record is larger, and the journal keeps growing (I).

### 5. Service-side risk
- **How the service snapshot is built:** it is the same `gc:false` state of accepted plus local writing (`historyCheckpoint.ts:81-90`). Creation allows up to 16 MiB (R).
- **Install limit:** the install event must be at most 4 MiB, and the event plus the decoded state together at most 4 MiB (`historyInstall.ts:69,155`). That caps the snapshot at about 1.3 MiB raw (I).
- **Who installs:** every device fetches and installs each new latest snapshot, not only devices that are behind (`accountReceive.ts@HEAD:1771-1783, 3608-3620`). A size refusal blocks all receiving (`:4110-4123`) (R).
- **Consequence:** the next snapshot above about 1.3 MiB would halt receive on both devices and on any new one. The prune has removed the fallback of replaying the full history (I).

### 6. Fix options, ranked
1. **Diagnostic split (section 1).** No format change, about 30 lines plus tests. Do this first, together with option 2; it tells us which fix pays off.
2. **Refuse to create a snapshot that cannot be installed.** Check `encodeHistoryInstall` size plus R against the 4 MiB limit before creating (`createHistoryCheckpoint`). Client-only, no format change, small. Older builds could still create an oversize snapshot unless the service also bounds the ciphertext (a service change). Re-prove: create, verify and prune.
3. **Baseline draft-4.** Binary framing (as in `preparationValue.ts`), a single copy of the own receipt, and optionally a higher limit; `BASELINE_MAX_CHUNKS` already derives from the limit (`localBaselineAnchor.ts:17-19`). This changes the stored format.
   - Production and the "compatible reader" build would treat counter v6 as `corrupt()` (`contentRecord.ts:183-195`, `localBaselineMetadata.ts:35-38`), not as app-update-required.
   - So it needs a reader-first release and a new compatible reader image, or the application-upgrade interlock (`storageCompatibility.ts:12-15`) written before the first v6 write.
   - Re-prove: the codec, a new authentication domain, replay and readback, and the retention and rollback rehearsals (phase 530 style).
   - Medium-large. It halves every term, but the install record still costs about 2.2× the snapshot.
4. **Raise the limit alone.** One constant, but the same rollback cost: old readers hit their bounds checks (`localBaselineAnchor.ts:97-98`, `localBaselineRecord.ts:266`), and memory use doubles. Only worth doing together with option 3.
5. **Compression.** A format change, plus deterministic output and decompression-bomb bounds; little gain over option 3.
6. **Larger or binary install path.** The hex ciphertext is part of the service wire format (`account-protocol/historyCheckpoint.ts:118-125`). Medium-large; needed once the document passes about 1.3 MiB.

**Cheapest confirmation before building anything:** the operator observations in section 1, which cost no code.

### 7. What the operator can do on the desktop today
Safe:
- Keep using it online. The capacity outcome changes nothing: retention planning is a dry run (`localRetentionPlan.ts:2, 444-456`) (R).
- Press "Check again" once and watch it. It is read-only until a plan completes and costs minutes of CPU.
- Make one small edit on each device and let it sync. This helps if (b) or (d) is the cause.
- Read Chrome's stored-data figure for the site, without pressing Delete.

Must not:
- Clear site data or uninstall the PWA.
- Remove, re-enrol or add a device.
- Create a new service snapshot.
- Roll back below this release (phase 530 README, line 70).

### Corrections to the "already known" items
- `PREPARATION_ENTRIES` is defined at `retentionPreparation.ts:19`, not in `preparationValue.ts`.
- Parking also clears on reopen and on "Check again", and any new row changes the hint.
- Every device installs each new snapshot, not only devices behind the pruned cut.
- The snapshot bytes are built in `src/crdt/historyCheckpoint.ts:61-140`; `src/account/historyMaintenance.ts` only orchestrates.

### Questions for the operator
1. When were the two snapshots created and verified, and from which device, relative to the phone's reduction and the desktop's drain?
2. During "Check again", what is the last progress line before the capacity message, and what is Y in "X of Y records"?
3. What storage figure does Chrome show for the site on the desktop, and on the phone if you can see it?
4. Was the desktop's backlog mostly its own writing waiting to be sent, or the phone's writing to receive?
5. Have there been large pastes or imports in the document? How big is a Markdown export?
6. Does the phone's "History on this device" still show the normal text?
7. Has either device ever been re-enrolled?
