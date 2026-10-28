# Private baseline-aware warm and incremental reuse — 2026-10-13

Base: signed **`72d1b8bf`** (`G`), [private atomic removal](./account-local-retention-removal.md).
Implementation committed signed as **`354c9c59`** (`G`). [Focused evidence](./development-evidence/2026-10-13-local-retention-reuse/README.md).
The public application, personal profiles, service and stored formats are unchanged. Release
validation remains paused; this is a private implementation/correctness phase, not performance qualification.

## Eligibility and lifetime

Only the exclusive live Account owner may reuse a **v5 reduced** baseline. All three existing private
flags (`VITE_ACCOUNT_BASELINE_INSTALL=1`, `VITE_ACCOUNT_BASELINE_READ=1`, `VITE_ACCOUNT_RETENTION=1`)
are still required. Existing reference/disabled-warm modes use complete baseline-plus-suffix replay.
Non-deleting v3/v4 owners retain their physical-history comparison. One-shot lifecycle readers keep
full verification; they are allowed to reconstruct equivalent authority objects on successive checks.

The first full read authenticates the closed counter, exact metadata/chunks and physical suffix,
replays the baseline and all suffix obligations, and seeds the private continuation. The pin includes
the baseline revision/era, local scope, allocation generation, and current verifier-owned authority,
membership/successor, keys, history and checkpoint capabilities. These capabilities are immutable
within the live owner and replaced on adoption. They are not capabilities supplied by stored rows.

Every warm load still performs the complete fresh custody-authority check before and after
continuation. Authority identity comparison is an additional cache-eligibility test, not a substitute
for authentication. A capability changing during full verification cannot seed a live warm view.
Resumed/visible pages, reacquired ownership, replacement, generation rotation, authority changes,
unexpected authenticated counters and failed writes require full verification. Closed/cleared owners
cannot install results of outstanding crypto.

## Physical guard and audit

The warm storage guard authenticates the complete counter **including its reduced pointer and era**.
It checks the exact bounded metadata key set, and each logical store's count and first/last key.
The semantic v2 counter remains only an allocation interface; disk writes retain v5 and its MAC.
Owned reservations advance allocation only. They do not advance the semantic view. Only a completed
owned append extends the retained rows and invalidates the old selection identity.

Baseline chunks join the existing rolling sealed-byte audit. Each warm load checks up to 16 records
and a 128 KiB target; one indivisible baseline chunk can exceed that target (256 KiB plus its framing).
A pass captures its finish line, so appends cannot move it. Missing/extra metadata keys, changed pointer
and logical count/bounds are detected on the next check. Same-shape old ciphertext corruption is
detected by the rolling audit or full reopening. The owner continues to use its previously verified,
isolated memory, never unchecked changed disk bytes. Count/bounds queries are not claimed to be O(1).

## Logical continuation

The authenticated snapshot and whole carried source capsules form the logical prefix. Only an exact
append to its surviving physical suffix may extend the existing incremental reducer. Its origin
includes consumed source indexes, absolute positions/link, burned attempts, spool witness, delivery
responses, received frontiers/retained proofs and installed checkpoint state. No zero-origin replay
is permitted after retirement.

New protocol events retain their exact expected epoch, signatures, witness extension, source ordering,
delivery and inbound checks. New unallocated capsules also require durable content coverage, matching
the full baseline reader. Positive coverage reuse cannot turn a failed coverage check into success.
Checkpoint installation, legacy own-inbound events, changed old rows, or exceeded index bounds take
full replay. Current index limits remain 32,768 rows/sources and 32 MiB; this adapter does not remove
the existing large-suffix fallback. It does not enable generic content compaction on reduced stores.

The private verifier owns its buffers; caller projections remain detached. Selection leases still
bind to the complete validated view. Incremental replacement uses the existing alias-safe ownership
and late-result invalidation mechanism. No live Y.Doc, UndoManager or journal binding is replaced
by a read. No append is displayed before the existing journal/durable-receive fence permits it.

## Reference oracle and interruption

Full baseline-plus-suffix replay becomes due after **256 appended rows or five minutes**, independently
of rolling disk audit completion. The background storage scheduler completes bounded disk slices,
then performs the full semantic reference. If the retained view covers the same rows and authority,
its census/delivery/inbound result must match before the new view can replace it. Disagreement is a
repair-required refusal, not silent cache repair.

Synchronous input invalidates the private discretionary pass before its next guarded effect;
interrupted work stays due and is not moved onto the following foreground load. Async work yields
through the existing CPU budget. This is not a bound on one Yjs/native operation or on total reference
duration, and continuous activity can postpone semantic oracle completion. Rolling sealed-byte
checks still progress on foreground loads without waiting for idleness.

## Evidence and next boundary

The focused packet records independent full-replay comparisons over generated own/peer histories,
unallocated coverage refusal, allocation-only reuse, caller isolation, stale/late verification,
authority invalidation, chunk/key corruption, audit interruption and native lifecycle regressions.
The native work-count check demonstrates eliminated full loads, not a latency improvement.

Next is a bounded growth/cost measurement with equal workspace and pending suffix at multiple retired
history depths: cold open, warm online/catch-up typing, heap and maintenance. Wait for a suitable host
before making latency comparisons. Whole logical projections still copy on changed views, and initial
retention/full oracle work can be substantial. Reader-first publication, compatible rollback,
capacity/history-required UX and an explicit retention trigger/cadence remain separate gates before
personal/public conversion. No automatic deletion or additional public capability is enabled here.

## Measured continuation

The [history-depth packet](./performance-experiments/2026-10-13-retention-depth/README.md) measures
this signed runtime without changing it. Retired-depth cold/warm work and heap materially shrink,
and the packaged received fixture opens in 0.90 s versus 2.34 s on the measured desktop. Initial
conversion is expensive: 14.09 s at 1,201 own positions, with a 12.0 s foreground task in that
complete-history observation. Existing-baseline replacement after a fixed suffix is much cheaper.
Initial-cut responsiveness is the next bounded work; these measurements do not authorize public
conversion or establish phone, pending-heavy or catch-up-typing performance.


## Follow-up2026-10-27 — exact one-shot startup reuse

[Phase122](performance-experiments/2026-10-27-maintenance-continuation/phase122/README.md) adds a
separate explicit immutable-authority opt-in for original/joined startup recovery. It compares all
fresh sealed rows/chunks and authenticates current metadata/authority, then reuses only an exactly
equal completed logical proof within that owner. Distinct reconstructed capabilities fall back.
The live warm/audit policy above is unchanged. No startup proof is transferred into the live owner.
