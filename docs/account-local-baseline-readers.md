# Owned baseline-plus-suffix reads, without deletion — 2026-10-13

The [reader inventory and deletion plan](./account-local-retention-readers.md) are signed as
**`bce612c3`**. This phase connects the private logical reader to the original and joined cold/live
Account owners. It is committed signed as **`3ba73cb3`** (`G`), and enabled only with both
`VITE_ACCOUNT_BASELINE_INSTALL=1` and **`VITE_ACCOUNT_BASELINE_READ=1`**. No public setting exposes it.
Every physical history row remains; full-history comparison is mandatory. This is not a speedup or
proof that an owner can operate after physical removal.

## Physical and logical reads

`contentStore.load`, selection leases, the census, allocation, mutation and rotation retain their
physical-row meanings. The carrier authenticates allocation, placement and ciphertext; authenticates
the separately anchored encrypted baseline under fresh complete custody; replays its suffix; compares
with intact full history; and checks authority again. Only then may it give its validator a detached
`AccountBaselineRead` or return one through the explicit `loadAccount` recovery seam.

The logical result contains the authenticated snapshot, exact carried source capsules, physical
suffix, absolute replay origin and verified spool/delivery/receive states. Its synthetic state row
has sequence zero and is never passed to a placement or mutation API. All returned buffers are
isolated from the carrier and verified view. Clearing/closing erases each owner's retained buffers.
A failed anchored verification refuses the read; it cannot silently return full rows as a fallback.

Logical source retirement requires an authenticated **journal era**. A v3/draft-2 anchor without
one continues using complete logical reads, even with the switch set. The existing v4/draft-3 era
boundary provides exact journal/database pairing before retired source identities disappear from
the read catalogue. No counter, baseline, receipt or wire format changes in this phase.

## Connected consumers

- Original and joined cold classification verify the baseline and recover from its logical snapshot,
  carried originals and suffix. Existing genesis/checkpoint coverage remains mandatory. Detached
  prefix verification additionally retains its full-history prerequisite.
- Live recovery uses the same logical result. Source identity/deduplication and envelope selection
  use its catalogue and consumed indexes; new positions continue after the absolute retained head.
  Burned attempts, exact original bytes, signatures and signed decisions retain their meanings.
- The private verified live view is associated with the carrier's exact physical rows and load
  identity, but holds baseline-plus-suffix ledger state. Source/send/receive/status projections use
  that state. A mismatched view fails rather than invoking a zero-origin parser.
- Proposed delivery writes validate the complete logical suffix starting from the authenticated
  terminal acceptance. They do not install speculative state. Reservation and final physical
  compare/write remain under the existing owner and fresh authority checks.
- Checkpoint/self-receive checks consume the logical census. Old-read generations, exact checkpoint
  cut checks, durable receive promotion, complete authority checks and one-use final application
  permission remain unchanged.
- Warm/incremental ledger extension is not used for these anchored logical views. Each such load
  compares a fresh baseline replay against full history. The ordinary and pre-era paths retain their
  existing optimizations. This phase deliberately keeps the expensive oracle until later adapters.

The comparison covers document bytes, accepted/final/conflict/refusal state, suffix submissions and
responses, positions and invocation totals, own/peer frontiers and starting points, installed history,
next allocation/selection, and **all** remaining capsule identities/bytes and consumed indexes.
Checking only the next 32-source batch would miss a lost original beyond that batch; a focused
candidate-omission control now demonstrates and rejects that case. The replay itself also verifies
the authenticated witness, authority continuation, terminal proofs and checkpoint cuts.

## Journal and live document

Era checks happen before capsule deduplication or journal replay. A matching committed capsule is
not manufactured from Yjs coverage. The current era's carried/suffix catalogue still distinguishes
journal-only edits from commit-before-cleanup copies. No new deletion is added to journal handling.
The existing exact durable cleanup remains in use.

The live document and UndoManager are not replaced when switching read representations. Local edits
still journal before application; incoming writing still becomes durable before final application.
The new code supplies recovery/verification data, not permission to reorder admission. The native
checks exercise local undo/redo and journal order, and the joined journey preserves local undo while
remote writing remains present.

## Evidence and remaining boundary

[Focused evidence](./development-evidence/2026-10-13-local-baseline-readers/README.md) includes original
and joined cold/live reads, source reduction with physical rows unchanged, absolute next positions,
matching and mismatched journal recovery, renderer death, stale reads, authority refusal and undo.
The test-only probe observes the real recovery seam; it does not supply a replacement reader.
Ordinary reader refusal and prepared-receive regressions remain covered. One transient packaged
history-inspection lock is recorded with its limits, not explained away as a fixed defect.

**Continuation:** the [lifecycle-reader/rebase phase](./account-local-baseline-lifecycle-readers.md)
adapts prospective authority, detached prefixes, rotation, initial handoff and membership/history
local-source readers, and builds replacement from an old baseline plus suffix. It retains the full
physical oracle and the four guarded full-history entry points. Next is the pure exact physical
deletion-plan dry run; actual removal needs its separate closed carrier and atomic phase.

Generic compaction still returns `retained` for anchored stores. Independent service checkpoint
production/admission, service pruning and recovery do not gain trust from a local baseline. Public
reader-first deployment, rollback, capacity behavior, unavailable-history UX and controlled growth
measurements remain later gates. Required openers remain. Release validation is paused and
`docs/progress.md` remains untouched.
