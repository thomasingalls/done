# Private retirement fences with no history deletion — 2026-10-13

The [evidence policy](./account-local-retention-evidence.md) is signed as **`8c694d55`**.
This implementation, committed signed as **`bcca1aa1`**, applies it to the private Account owner behind
`VITE_ACCOUNT_BASELINE_INSTALL=1`. The ordinary application exposes no installer. Every logical
content, source and receipt row remains stored and full/reference replay remains mandatory.
`advanceLocalRetention(expectedRevision)` exercises the prospective retirement boundary with an
**empty logical deletion set**. It does not claim to implement reduced-history activation.

## Transaction and journal pairing

An existing baseline can advance to a closed **counter v4 / carrier draft-2 / baseline draft-3**.
The authenticated pointer and encrypted baseline both carry a random 256-bit journal era, its
predecessor, and the baseline revision that created that era. Legacy private counter v3 / baseline
draft-2 remains readable. Ordinary readers refuse both private counters; older private v3 readers
refuse v4. This is not an optional field silently ignored by an older decoder.

The transition drains prepared remote promotion, enters ordered admission, flushes the scoped
journal and verifies it empty, checks fresh complete authority and authenticated durable attempts,
then verifies the candidate against full history. Reservation commits before encryption. The final
transaction rechecks the exact old counter, chunks and all history rows, and atomically replaces the
baseline and era. A failed attempt burns its reserved invocations while retaining the old era and
anchor. A lost final reply can cold-reopen and retry the expected revision without another reservation.
The creation revision distinguishes that retry from an ordinary replacement that retained the era.
Uncertain transition failure closes the owner; it cannot lend a journal writer with a stale binding.

New synchronous journal plaintext has a bounded binary header inside the existing AEAD. The header
binds slot/principal/workspace/store/root, initialization intent and current era. Its remainder is
**the exact existing source capsule**. Published envelopes, capsule hashes and source identities do
not change. Scope and era are checked before deduplication or replay; neither Yjs coverage nor a
journal-supplied era can authorize recovery. Wrapped size counts against existing journal limits;
the existing durable oversize path remains available. Ordinary unwrapped admission does not acquire
an extra framing copy.

The ordinary custody owner and the separate rotation journal reader both obtain their binding from
the authenticated content owner. Generation rotation retains the era and required openers. Ordinary
baseline replacement also retains the era; only the explicit transition changes it. Logical history
is never deleted. As before, replacing a smaller baseline may remove superseded **metadata chunks**.

Cross-era and reintroduced legacy journal values refuse reopening and remain intact. Renderer death
with journal-only work, or after database commit before journal removal, recovers normally when the
pair matches. Equal eras are not proof of dependency completeness, freshness or unused nonces after
an arbitrary partial/whole-profile restore. No automatic raw backup-restore path is added.

## Old reads and final application

The owner has a process-local retirement generation. Preparing single/group requests and history
fetches captures it. Every baseline installation/replacement invalidates the old generation, clears
outstanding request identities and unused final-apply permission, and aborts transport waits. Generation
checks still reject late promises even when cancellation loses the race. Preparation, receipt commit
and final application check the captured generation; stale network work is refetched as transient
scheduling, without persisting its reply. The existing four-flight/single-position wire receipts remain.

Committed receive work is tracked until its actual final application. The transition waits for the
admission barrier or skips a pending promotion. It cannot invalidate committed writing and then
silently continue editing without it. Fresh authority authentication, the synchronous one-use final
application gate and the existing live UndoManager remain in place. Installing an anchor alone
publishes no document replacement or content revision. A permanent close cannot be undone by a late
release of the retirement pause.

## Checkpoint evidence and unfinished work

Reduced replay retains the exact latest installed checkpoint cuts in addition to terminal stream
proofs and starting points. Per-publisher comparisons distinguish known links from unavailable old
ancestry. A different known link refuses; an unknown old cut returns `history-required`. Suffix
checkpoint installs retain their newly verified cuts too. Zero origins cannot claim a nonzero link.
Live era owners apply this cut check before accepting a new checkpoint even though full history is
still physically available. This exercises the future reduced-reader refusal, without deleting its
reference data or weakening the independent checkpoint producer/admitter.

An exact duplicate installation may authenticate and decrypt normally, then return a private no-op;
it cannot append another durable installation. Cold ledger replay still refuses duplicate durable
installations. An unavailable cut is not saved and does not stop local editing. The owner avoids
refetching that same candidate body until its identity/authority changes or another baseline boundary
invalidates the skip. Catalog discovery continues. Exposing this condition when reduced history is
actually enabled remains later product work.

Under the existing exclusive permit, retention reads encrypted history, approval and rotation
progress. An unfinished checkpoint publication/discard, enrollment or rotation postpones the cut.
Completed membership proof chains and the exact selected completed rotation can remain retained,
including their old openers. Retention does not cancel or rewrite these attempts. The paired-device
checkpoint control explicitly finishes the producer's saved attempt through its existing retry before
advancing the era. A detached copy may keep editing but cannot start this transition.

## Evidence and next step

Focused parser, carrier, real-owner, renderer-crash and packaged lifecycle evidence is recorded in
[the evidence packet](./development-evidence/2026-10-13-local-retention-fences/README.md). These tests
use disposable data. There is no new performance claim, product activation, publication or release
qualification. `docs/progress.md` remains untouched.

The subsequent [reader inventory](./account-local-retention-readers.md) and
[exact deletion plan](./account-local-retention-deletion.md) are now recorded. Next implement the
owned reduced-reader seam with all physical predecessors retained, then lifecycle/rebase adapters and
a non-mutating exact-plan dry run. Atomic logical deletion is a separate phase. Cold/open and per-task
growth targets, capacity limits, public reader-first compatibility and rollback procedure remain
separate gates.
