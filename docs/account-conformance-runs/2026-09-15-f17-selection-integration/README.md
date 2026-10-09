# Explicit private Local selection-snapshot integration

The [integration](../../f17-selection-integration.md) connects the snapshot owner through all four
selection metadata sites in the internal `local-snapshots` variant: group capture, history fork,
undo/redo transfer and restore. Histories are explicitly owner-bound, including empty histories;
generic forks refuse that private mode. Default Local/Account and both earlier comparison paths
remain. No performance measurement or default activation occurs in this phase.

The workspace suite passes **86 cases**; the new seam suite passes five, including **120** generated
retained-branch/cursor histories (seed 150906). The existing accepted-state and independent master/
card selection ledgers run **80 histories per variant** under reference, Local handoff and Local
snapshots (140925/150902). Thirteen affected/timing-follow-up owned suites pass **215 cases** with
no skips/retries and process groups drained. Five deliberate faults are detected: missing history
binding, cloned tokens, stale after capture, omitted undo transfer and early owner close.

A directed startup test found a cleanup gap in the first integration: Promise.catch missed a
synchronous opener throw. A surrounding try/catch now closes the empty owner for both synchronous
and asynchronous failures. The original source/test and red/green runs survive. This occurred
before history allocation and does not demonstrate content loss.

Full units first pass **99 files / 1,141 tests** before the startup repair. The following run times
out in the two unchanged five-second Account-liveness and position-decision cases seen previously.
Both pass individually in the owned run, and one unchanged full repeat passes **99 files / 1,141
tests** after repair. All three logs and command/exit records remain. A cause is not established;
these bounded passes do not close loaded-host or whole-wrapper qualification.

Native pending-state and original-order delivery each pass their directed cases plus **100
generated histories** (8941), using the new variant in disposable Chromium profiles. The owned
workspace catalogue passes **10 cases and four mutations**, with browser/process drain. Its first
run passed every case but the pending-history mutation destroyed the active candidate before the
privacy assertion and ended in a timeout. The revised fault exposes the pending undo stack without
replacing the accepted document. The same privacy assertion and limits now detect it. Both native
runs, catalogue definitions and the exact derived variant-hash change are retained.

All **21 selected runner checks**, types, scoped format/lint, inventory/manifest, census and
authority checks pass. The registration review adds five seam cases and thirty workspace cases,
updates the denominator title, and permits only the reviewed native mutation/derived variant
change. Every prior case and deadline remains. General integration is **263 files / 2,121 case
dispositions (11 not applicable)**; 96 command and 63 campaign obligations remain open.

[Summary and registration review](./summary.json). `artifacts.json.gz` stores content-addressed
UTF-8 source/tests, exact changes, owned cases/receipts/logs, native histories, controls, counterexamples,
gates and preservation checks. The packet stays below 400 KB while retaining both native attempts.
Large frozen source/dependency inventories and prior planning snapshots remain local, bound by
[raw hashes](./raw-artifacts.json). Runtime bytes are unchanged since the final full unit repeat and the native campaigns;
the later mutation-catalogue repair is explicitly bound to the earlier owned input's original bytes.
The catalogue review guard initially refused its changed derived variant hash; refreshing that exact
hash repaired the planning record. No functional assertion or deadline was relaxed.

Run `python3 docs/account-conformance-runs/2026-09-15-f17-selection-integration/verify.py --raw`
while local inputs exist; omit `--raw` to check retained reports, exact sources and preservation.
The verifier checks cases/nonces/contracts, exit/drain, histories, mutations, the retained failures,
registrations, six earlier packets, 52 personal/vector pins, unchanged runtime files, append-only
prefixes and L-2. Its initial delivery check incorrectly compared the recorded pre-undo text directly
to the remote-only expectation; the corrected check removes the fixture's one local marker, matching
the actual campaign assertion. That initial verifier and failure remain, without changing test data.
Earlier packets retain their historical source identities; their current-tree verifiers need not
pass after later source/test additions.

Next specify the balanced performance comparison against reference, existing Local handoff and
an appropriate signed baseline, followed by the unchanged application gate. F-17 remains partial;
functional agreement is not evidence of a speedup or an immutable release pass.
