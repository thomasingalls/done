# Private v9 outbound composition — 2026-09-11

Base: `83eed0b` (receive polling/reconnect). This phase joins original-source publication and signed
v2 readback under one v9 custody/content owner, admission FIFO and completeness witness.
[Contract](../account-outbound-composition.md). This is the synthetic creating-member ciphertext
round-trip milestone in sequencing §3.5, not personal Account activation, enrollment or rollout.

## Validation

The final `account:sync` campaign passed at
`test-results/account-sync/2026-09-11T11-38-17.866Z`. Its runtime and test inputs are frozen in
[campaign sources](./2026-09-11-account-sync/campaign/sources.json).

- Seven directed native cases: real-service round trip; lost response/readback/cold retry; outbound and
  inbound native commit abort; close/drain; local journal admission during a seal; retained signed conflict.
- Eight generated native histories, seed **9112062**, covering edit, offline-edit, lost-send, lost-read,
  compaction and restart with authored-text, exact source/position and wire-retry oracles.
- 400 new deferred clock/event histories, seed **9112061**, with an independent two-lane event model.
  The scoped unit stage also reran the previous receive driver's 500 generated cases and owned queue tests.
- Ten effective copied-source controls: fairness, overlap, halt clearing, observer-pause resume, local wake
  retention, offline/pressure dispatch, union witness omission, self-stream mismatch and refusal classification.
- **980 unit tests / 87 files**, run alone with `--maxWorkers=2`, passed. Complete manual HTTP receive,
  v8 sender, spool and polling-receiver regression campaigns passed sequentially.
- Type, lint, formatting and whitespace checks passed. Isolated build, budget and origin checks passed;
  the app uses 329.6 kB of the script's 350 kB gzipped-JS budget. Fresh prerequisite/trace receipts are
  archived: 101 claims, 28 named defect falsifiers and nine retained debts.

The generated native stage took **291 seconds** and passed its original **300-second** test deadline.
After that run, only its test/runner limits were increased to 420/450 seconds for margin. The seed,
histories, assertions and runtime were unchanged. [Exact executed inputs and the two-file hash delta](./2026-09-11-account-sync/deadline-adjustment.json)
are retained; the passing run used the stricter deadlines. No rerun is claimed for that timeout-only change.

The complete historical aggregate `pnpm check` was not rerun. `e835243` remains its preserved baseline;
this phase uses the affected campaigns, full units and isolated build/trace execution listed above.

The [artifact manifest](./2026-09-11-account-sync/manifest.json) hashes the raw logs, JUnit results,
incremental generated histories, source inventories, controls, receipts, code patch and failed probes.

## Findings and corrections

The self-stream omission control exposed a production error-classification defect: a valid but different
self-stream envelope was refused with `ContentError('repair-required')`. The capture owner interprets that
code as corrupt local storage and closed the editor. The preserved before-repair status shows both drivers
and the editor closed at receive position zero, with the valid local writing still on disk.

The repaired path first authenticates the existing local census. Failure of the candidate envelope's exact
self-stream binding or compatibility with retained decisions then becomes `AdmissionError('receive-refused')`
before any inbound append. Receiving halts and Local stays active. Corrupt retained records still refuse
on load. A copied-source classification mutation now closes the editor again; the baseline retains it.
Known retained receive conflict also blocks outbound work as a protocol halt, and both runtime lanes show
conflict while the local document remains readable.

Harness failures are not credited as conformance evidence. The initial round-trip case shadowed its path
helper with a loop variable. The initial witness control removed an interior event, which another prefix
check also caught; the final control removes the last event. The self-stream probe initially waited only
for blocked/error states and timed out when the defect closed the editor. Its final predicate observes the
terminal state and independently asserts the required active editor. Formatting also invalidated the new
classification mutation's exact source anchor in one campaign; the final anchor is checked and effective.

## Scope and practical limits

Every source capsule/index/hash, envelope and submission keeps its original identity and exact bytes.
Inbound originals pass only through ordered admission and never become newly authored sources. The one
scheduler alternates due lanes, yields after each position/page, retains editor wakes during work, applies
independent unknown backoff, and drains the active pass before permit release. A private HTTP operation is
bounded at ten seconds; this is not a latency guarantee for storage, cryptography or an unbounded backlog.

This creating-member factory requires received envelopes to match its own persisted publication stream.
It does not support a copied/branched credential, an unknown self-stream suffix, another member, a successor
checkpoint or a changed epoch. Manual receive fixtures remain separate from enrollment evidence.
Manifest/admission descriptor bounds/versioning, first-activation assertion binding, cryptographic registry
and recovery-vector alignment, invocation power-loss accounting and other accepted review debts remain open.
No whole-protocol correctness or supported-population performance claim is made.

All native accounts, keys, assertions, profiles and services in these artifacts are disposable synthetic
fixtures. Personal root `dist`, `.dev/releases/17d87c2/app`, browser and routing remain unchanged; no preview
or relay was started. The annotated historical review and L-2 checkpoint remain unchanged.
