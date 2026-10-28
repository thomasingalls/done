# Phase126 — experimental automatic service history

Parent125. [Policy and activation contract](../../../account-service-history-automatic.md).
This implements a separate default-off scheduling policy and scoped composed-owner wiring. It
reuses the existing authenticated history commands, with independent peer admission, exact saved
attempts and two unchanged admitted snapshots before pruning. No stored format/server protocol,
crypto primitive, proof or permission changes. Existing local retained-attempt pins remain.

Choose1,024 observed physical-row growth and at least1h between creations within a lifetime, ten
seconds quiet, foreground sync/durability/readiness gates, one flight and at most4 commands per turn.
Keep numeric growth across local cuts and custody hint invalidation; the next real history command
verifies afresh. Park peer/stale work, never initiate discard, and preserve existing discard intent
only through exact resume. Control/reachability/login events wake inspections; content-only hints do
not. There is no periodic catalog poll. Event-gated network retries escalate1–16min and hints cannot
erase backoff. Integrity/unknown failure halts; disposal prevents late publication of status.
Manual/automatic history and local reduction share readiness/cleanup without weakening ownership.

The first older native apparatus uses a development bearer and cannot acquire scoped history:
retain its failed timeout and script, preserve that restriction. The first packaged attempts then
expose missing independent growth-hint gating, and the guarded trace shows ready:true/hint:undefined
after custody refresh. Repair scheduling across invalidation, not authentication. A fresh native
scoped build passes both cases: sole-device automatic creation, manual second snapshot, automatic
pruning and offline reopen; producer waits with no admission while the peer is hidden, then a
separate native credential independently admits, with two-way writing afterward. Only the growth
threshold is lowered; quiet, deadlines and every protocol check stay. Test-only numeric/error
probes are build transforms, not product telemetry. Earlier source/fixture and all failure logs
remain; they are exploratory correctness attempts, not matched performance observations.

Sixteen new policy cases pass. Two deliberate faults (resetting failure escalation after inspection;
acting on a producer waiting for its peer) each trigger the intended assertion. Full units pass178
files:2,123 passed and1 skipped (the existing account-text guarded preparation case). Existing
service-history contracts pass63/63 after a sandbox-localhost denial is retained and retried with
permission. Registry/crypto/general/property/browser adapter regressions pass35/35 unchanged.
Final type/lint/format and ordinary diagnostic build pass. Retain initial fixture/type/lint mistakes
rather than presenting their corrected runs as the only attempts. No old test file is edited.

Reviewed census:410→411 source files,197 domains unchanged; only the new scheduler and two existing
source hashes change. One construction line pin shifts; all prior domains/sites/contracts and
dispositions remain. Two new required test files remain uncredited:918 obligations/373 unresolved
versus916/371. Every earlier qualification block remains. Ordinary checks are recorded separately;
no aggregate qualification, phone performance, catch-up/typing acceptance or2.5s gate claim.

Activation is held: native preparation can still monopolize the storage tail, and an offline peer's
saved proposal can pin local retirement. Phase125 is a design, not implemented durable resumption.
Numeric growth and cadence are ephemeral, not a durable multi-device quota. No computer use, signing,
push, preview replacement, release preparation or deployment.

All13 final ordinary contract/build/bookkeeping checks pass. Independent manifest comparison keeps
every prior916 row exactly equal as JSON and adds only the two uncredited blocked obligations.
