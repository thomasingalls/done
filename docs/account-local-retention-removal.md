# Private atomic local Account removal — 2026-10-13

Base: signed **`7a48b86b`** (`G`), the [exact-plan dry run](./account-local-retention-dry-run.md).
This phase implements the [atomic deletion plan](./account-local-retention-deletion.md) privately.
The implementation is uncommitted; its [focused evidence packet](./development-evidence/2026-10-13-local-retention-removal/README.md)
records source hashes. No personal/public profile was converted, service changed or image published.
General release validation remains paused.

## Entry and representation

`removeLocalHistory(expectedRevision)` exists only on a composed Account owner built with **all
three** flags: `VITE_ACCOUNT_BASELINE_INSTALL=1`, `VITE_ACCOUNT_BASELINE_READ=1`, and
`VITE_ACCOUNT_RETENTION=1`. There is no application control or automatic cadence. Detached owners
cannot initiate removal. Expected revision zero selects an unanchored predecessor; later calls name
the current anchor revision.

The writer installs counter **v5**, carrier **`done/local-baseline-carrier/draft-3`**, and explicit
**`history: baseline-plus-suffix`**. Its mandatory journal era was created at this anchor revision.
The counter MAC and chunk prefix bind that mode. v3/v4 retain their complete-history meaning and
encoding. They are never interpreted as reduced merely because old rows are absent. The default
reader and the earlier private reader refuse v5 before admitting writes. Non-deleting installation
or replacement cannot rewrite a reduced pointer into a complete-history pointer.

The baseline payload retains its existing era-bearing draft-3 encoding and 4 MiB limit. Database
stores/schema, service protocol, receipt formats and synchronous journal format are unchanged.
This nevertheless changes local on-disk compatibility: an image lacking the enabled v5 reader
cannot open a converted profile. A reader-first release and a compatible rollback image remain
required before public conversion.

## Atomic boundary

1. Settle admission and committed remote promotion, flush journal originals and finish cleanup.
   Hold the admission FIFO, exclusive slot Web Lock and owned storage task. Check fresh complete
   custody, durable attempts, pending promotions and journal emptiness; retire old network flights
   and unused final-apply permissions.
2. Capture exact raw metadata and every physical logical store/key/sealed row. Authenticate the
   settled current cut. Prepare the candidate from complete history or its authenticated predecessor
   plus suffix; independently replay it and compare retained obligations and next behavior. The
   private plan owns its bytes and lifetime binding. An inspection copy is not write authority.
3. Reserve the candidate's chunk invocations durably in the **predecessor representation**. Old
   rows/pointer/era remain usable. An interruption burns that range; no retry reuses it.
4. Seal chunks and compute the next counter MAC outside IndexedDB. Perform the complete fresh
   authority check again. Inside one strict transaction across `meta`, `content`, `heads` and
   `outbound`, compare the complete post-reservation inventory, recheck owner/activity/journal
   eligibility, install chunks/pointer/counter/era, delete obsolete chunk keys and delete only the
   individually enumerated logical keys. A late low key, changed ciphertext or metadata mismatch
   aborts everything in that exchange. There is no range deletion or resumable partial cut.
5. Compare exact committed bytes, authenticate/replay baseline plus suffix and verify the candidate
   again before releasing admission. Refresh the metadata-backed journal binding and invalidate
   retained views. Preserve the live Y.Doc, editor revision and UndoManager. Failed/uncertain final
   readback closes the owner, preventing a stale-era journal append.

The first current-cut plan summarizes every verified physical logical row; its physical suffix is
empty immediately after commit. That is the result of enumerated coverage, not permission to delete
all rows below a numeric cut. Unaccepted originals remain inside the encrypted baseline, whole and
with their consumed bitmap; only their redundant physical capsule rows disappear. New suffix rows
use absolute sequences beyond the reserved chunks. Reappearing prefix rows are rejected. Subsequent
cuts also dispose of inherited baseline evidence according to the same retained-evidence rules.

The idempotent retry accepts only the immediate reduced successor with the expected era-creation
revision, authenticates its current baseline and suffix, and performs no new reservation or deletion.
Other revisions refuse. A pre-commit network flight deliberately retired by retention may surface a
transient receive refusal at a durability barrier; callers may retry while the owner remains active.
An integrity failure or closed/blocked owner must not be treated as that transient case.

## Failure and lifecycle evidence

Focused tests use disposable native Chromium profiles, real encryption and actual four-store
transactions. They cover abort after a delete, reservation/commit renderer death, lost commit reply,
failed readback, exact retries, queued journal-before-apply input, live undo/redo, closing while crypto
is outstanding, post-cut journal-only and committed-before-cleanup crashes, old-flight rejection,
old-reader refusal and mismatched restored journal evidence. The unpublished-writing control checks
that retained original identities survive a cut and cold open, then publish normally.

Reduced original/joined owners also exercise first handoff, later admission, current-key retry of
offline writing, two rotations, interrupted custody activation, repeated cuts and detached editing.
A checkpoint journey exercises bidirectional writes and undo/redo after removal, refuses removal
while a producer attempt remains unfinished, then carries the verified installation through another
cut and cold opening. The packet distinguishes native evidence from unit and prior-phase controls.
Old openers and custody proofs remain retained. This does not remove service history, keys, backups
or arbitrary browser-profile residue.

## Relationship to the performance work

Ordinary unconverted accounts retain the activated direct text admission, warm storage selections,
prepared receive handoff, synchronous final apply and undo paths. The private removal implementation
does not change their scheduling or authority contract.

A reduced account has fewer physical rows to load and audit, so this creates the mechanism for
reducing history-dependent cost. **That benefit has not been measured.** Current baseline owners use
reference baseline-plus-suffix verification; they deliberately bypass warm/incremental ledger reuse
and ordinary compaction. Consequently conversion could regress warm sync despite shrinking disk
history. The first removal itself prepares/verifies a full candidate and holds admission through a
potentially large exact transaction/readback; it has no bounded typing-pause claim.

Before enabling conversion for everyday use, adapt verified warm/incremental reuse to the retained
origin and measure cold open, online/catch-up typing, heap and maintenance against the same workspace
at multiple retired-history depths. Keep complete authority checks, journal-before-apply and undo.
Public reader-first compatibility/rollback, capacity and unavailable-history product behavior, and
an explicit maintenance trigger/cadence remain separate decisions. No speedup is inferred from
correctness test durations on this busy host.
