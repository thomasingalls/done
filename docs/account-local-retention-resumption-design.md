# Resumable maintenance preparation — phase125, 2026-10-27

Status: **design, not an implemented format or enabled capability**. Continues
[same-owner reuse, shared first conversion and progress](performance-experiments/2026-10-27-maintenance-continuation/phase124/README.md).
No phone or computer use is needed to establish these source constraints. Desktop work counts
cannot establish a phone time bound. The original phone conversion's duration and restart count
remain unknown; phase124 makes later attempts observable.

## Outcome and boundary

Preparation should make useful progress during short unlocked sessions. Lock, suspension, typing
and sync must not force it to reverify the entire same prefix at the next opportunity. Keep ordinary
editing and the existing 2.5s peer p95 acceptance gate. The final cut remains a single strict atomic
exchange with authenticated readback. A saved cursor, byte count or MAC alone is not a proof that
all protocol obligations through that cursor were verified.

The first implementation slice should preserve **preparation only** across lock/reopen, with every
original record retained. A later slice may retire a fixed verified prefix while newer suffix
writing survives. Keeping those separate makes a resume failure non-destructive before changing
what any reader may delete. No automatic service proposal should depend on a partly verified state.

## Concrete constraints in the current implementation

- `localBaselineStorage.openEncryptedBaselineSnapshot` requires
  `b.cut.nextSequence === p.firstSequence`. The current verifier cut is also the chunk allocation
  start. Reserving chunks at a later live tip cannot encode a previously verified earlier cut.
- The removal planner proves complete physical selection and zero survivors at its current cut.
  It does not install a partial prefix or authorize deletion by a numeric sequence range.
- The current cooperative budget yields around splittable work, but cancels it on activity. Its
  in-memory generator and decoded capsules do not constitute a durable continuation. One decoder,
  Yjs operation, IndexedDB result or GC can still exceed the budget.
- Same-owner reuse in phase122 deliberately keeps ownership, exact fresh bytes and immutable
  authority identity. It grants no proof transfer across lock, a new owner, or an authority change.
- `retentionAttemptsSettled` postpones local retirement while history publication/admission or
  discard progress remains unresolved. A service checkpoint can contain unpublished local
  originals and older cuts. Do not remove this pin merely because its encrypted payload looks
  self-contained. Reopen, source availability and history installation must prove equivalence.

## Chosen approach: bounded, authenticated preparation checkpoints

Prefer explicit verifier continuation state to a generic serialized `AccountLedgerView` or a
persisted `verified: true` cache. The verifier owns both the serializer and the resume reader.
Their contract enumerates every outstanding protocol obligation. The existing authenticated
baseline is a precedent for carrying a completed proof; it does not settle which incomplete state
is sufficient or which fresh checks a resumed verifier owes.

One checkpoint describes a fixed, finite captured prefix. It must bind:

1. Workspace/lineage/local owner scope, storage intent, generation, journal era, predecessor
   baseline revision and commitment; an explicit format version and domain-separated purpose.
2. The exact selected prefix's store/key inventory and sealed-byte commitments, allocation and
   spool-witness boundary. Sequence or row count alone cannot detect replacement or added low keys.
3. The complete verifier frontier: actor/epoch/source ordering, partially consumed whole source
   capsules, accepted decisions, link/position state, inbound/delivery/checkpoint obligations and
   any pending coverage work. No unchecked source becomes accepted by checkpointing it.
4. Proof identities and independently checkable historical authority evidence used for that prefix.
   Current authority is checked afresh, including revocation/successor and key availability. A
   resume does not manufacture service acceptance from locally authenticated state.
5. A bounded continuation payload, next deterministic step, and commitment to the previous saved
   checkpoint. Its sealed state must not expose writing, keys or an unkeyed writing digest.

Before work resumes, authenticate the checkpoint with the actual unlocked custody, validate its
closed schema and limits, reacquire exclusive ownership, verify fresh counter/witness/era and
current authority, then establish exact unchanged prefix evidence. New suffix appends beyond the
captured boundary may remain eligible. Changed/missing prefix rows, extra low keys, rollback,
unknown state or incompatible authority refuse reuse and keep the originals. Do not call a full
prefix rescan a constant-cost resume; measuring that guard is part of the implementation slice.

Reservation/nonce discipline follows existing custody practice: persist a fresh reservation before
sealing; interruption burns it. Atomically replace the checkpoint and authenticate exact readback.
Until that succeeds, the last checkpoint and every original remain usable. Lock erases decrypted
continuation buffers and keys normally. No remember-me key, background execution promise, telemetry
or permission change is introduced. Removal from the device must erase the auxiliary state even
when locked; stale format readers must refuse it safely.

Do not silently add an unknown metadata key or overload the existing history/approval/rotation
channels. Select a dedicated, versioned encrypted auxiliary representation only after readers,
writers, locked removal, recovery, generation rotation, migration and rollback behavior agree.
Register the resulting crypto constructions and independent obligations before implementation
credit. That representation is deliberately not assigned bytes in this design-only patch.

## Fixed-cut retirement requires a separate reader-first representation

A later format (working name **v6**, not allocated) must distinguish:

- the verified logical cut and its exact coverage/deletion set;
- the later allocation interval containing the sealed candidate chunks;
- the untouched, independently verified physical suffix and its absolute origin;
- reservations burned in between, inherited baseline evidence and journal-era transition.

An older reader must return update-required before writing. Publish compatible readers first,
retain a rollback image that understands the representation, then enable the writer separately.
Do not weaken the existing v5 equality or reinterpret its meaning in place.

Preparation can finish a fixed prefix while users append. At final commit, recheck current
custody, authority, witness/counter progression, journal and promotion fences. Compare the exact
captured prefix and all required suffix/metadata conditions; delete only enumerated covered keys
inside one strict transaction. Fresh suffix evidence is not discarded. Independently replay the
candidate and retained suffix, compare complete obligations and next behavior, then perform exact
authenticated readback. Uncertain mutation closes the owner. The live document and UndoManager
must remain untouched by this storage exchange.

## Work slicing and truthful progress

Start with a **2s discretionary slice target** and the existing 8ms cooperative budget. These are
engineering targets, not observed device bounds. Yield and persist only at explicit verifier
boundaries. Activity pauses new preparation immediately; do not wait for a full conversion while
holding admission or the ordinary storage queue. A single oversized operation needs a separate
algorithm/worker boundary if it exceeds the slice; a timer cannot preempt it. Workers help main
thread responsiveness but do not themselves survive phone suspension.

Progress reports verified captured work plus newly accumulated tail separately, so appends cannot
move the displayed finish line. Show waiting for another device distinctly from local preparation.
The product must stay useful if the phone grants only short sessions. A provisional final fenced
exchange target is 250ms; evidence must establish it or select smaller cuts. No duration claim
follows from phase124's tiny desktop fixture.

## Implementation slices and falsifiers

| Slice | Evidence required before the next boundary |
| --- | --- |
| Closed continuation model and owned encoder | Compare uninterrupted versus every checkpoint/resume boundary, including partial sources and epochs; mutate each authority/frontier/coverage field and require refusal. Independent fixtures must exercise what the model omits. |
| Encrypted preparation-only storage | Kill/freeze at reservations, every seal/write/readback boundary and every 2s slice; reopen with normal factors; preserve prior checkpoint and all original bytes. No nonce reuse, late installs or plaintext after disposal. |
| Prefix guard and scheduling | Appended suffix resumes; changed prefix/low-key injection/rollback/unknown rows refuse. Activity, lock, authority change, failed writes, capacity and oversized payloads cannot promote partial proof. No storage/admission monopolization. |
| Reader-first fixed-cut representation | Old-reader refusal before writes; mixed-era journal recovery; interrupted atomic exchange; exact coverage and inherited source obligations; retained suffix, undo, cold/offline reopen and compatible rollback. |
| Composed performance | Short-session completion/restarts, main-thread tasks, post-factor open, catch-up competing with editing, unchanged 2.5s peer gate. Actual phone bounds stay pending until a phone is available. |

Never erase a failed attempt with a passing rerun. Each slice needs regression controls showing the
fault it detects. Unit/model correctness does not establish native crash recovery, live editing
latency or phone scheduling. General release qualification and release preparation remain paused.

## Service automation relationship

Keep local reduction and admitted server snapshots separate. Reuse the existing exact saved
service attempt, independent admission and two-unchanged-snapshot prune commands, not local
progress as authority. Service policy can be implemented/tested behind a default-off gate now;
unattended heavy preparation remains an activation blocker until it yields without monopolizing
the owner and completes across short sessions. A saved multi-device proposal may pin local
retirement while another device is offline. Report that wait rather than auto-discarding manual
work or forging a second device's admission. Closing that cross-maintenance dependency needs its
own retained-proof and native-reopen evidence.
