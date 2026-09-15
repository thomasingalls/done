# F-17: private Local selection-snapshot integration

Prospective functional integration, September 15, 2026, following the
[unmounted owner](./f17-selection-owner.md). Add an explicit internal `local-snapshots` variant;
default Local/Account and the existing `reference`/`local-handoff` comparison paths remain.
No performance measurement or default activation belongs to this bounded phase.

## Integration contract

One workspace owns one selection-history capability. The Yjs seam creates and forks only histories
recognized by that live capability, including empty histories. A weak mode marker prevents an owned
history from accidentally entering the generic clone path. Snapshot payloads and token recognition
remain in the per-owner WeakMap; the mode marker is not a global snapshot registry. A disposed
history or closed owner refuses; destroying one branch cannot revoke a sibling's tokens.

Convert all four metadata sites together: first group `before` and successive `after` capture,
history fork, undo/redo metadata transfer, and selection restore. Allocate fresh outer Maps while
sharing only recognized tokens. Restore transfers a fresh graph into candidate selection state.
Unknown metadata keys, foreign/cloned tokens and foreign histories refuse. Generic history copying
keeps its full native-clone contract; do not infer private ownership from metadata shape.

The private variant uses the existing Local preparation handoff, revision/job/slice/writer binding,
complete comparison and durable admission. It rejects Account source capture. Initial accepted
history and each successor belong to the same capability. Retry retains the same preparation;
discard destroys only the pending history. Workspace teardown disposes histories before closing
the capability, after the admission owner has drained writes and private preparations. Failed
startup also closes the capability. No token or history handle is exposed by the workspace API.

## Functional gates

Run every existing shared workspace case under all three variants, including generated accepted-
state and master/card selection ledgers, retry/discard, grouped Unicode slices, remote dependencies,
reentrancy and shutdown. Preserve all previous case identities and assertions. Direct seam controls
must reject foreign empty histories, generic fallback, unknown metadata and foreign/cloned tokens;
check detached documents/stacks and retained sibling restoration. Exercise branch/drop/undo/redo
histories against an independent value ledger, and observe actual workspace owner shutdown after
its histories and in-flight write settle. Deliberately break binding, transfer or capture/restore
and require the intended assertions to fail.

Native evidence must exercise the private variant through real encrypted carriers: the workspace
catalogue with every existing mutation; pending-projection and original-order delivery campaigns
with their existing 100 generated histories. Extend browser fixture selection explicitly while
preserving the previous default fixture path and test obligations. Keep mutation anchors exact.

Run affected suites through the owned adapter, then the full unit suite alone at existing limits,
selected runner/registration controls, types, source format/lint, seam, authority/census and graph
checks. Review registration changes rather than accepting denominator drift. Preserve six preceding
packets, 52 personal/vector pins, append-only records and L-2. Retain initial failures and repair
controls if new defects are discovered. Full wrapper/immutable qualification remains separate.

## Following phase

Only after functional gates pass, specify a balanced command-performance comparison against the
current reference, existing Local handoff and appropriate signed baseline. Keep all useful-gain
criteria and the unchanged application gate prospective. Existing 12.9/63.5 ms desktop/CPU-4x
Android card p95 remains the last candidate gate, with Android failing <16 ms. Emulation remains
the reference; the roughly 1.5× Pixel estimate is planning context. F-17, the 96 command / 63
campaign obligations and immutable qualification remain open.


## Observed functional outcome

The new private variant passes the 27 shared workspace cases, alongside both earlier variants.
Additional Local checks bring the workspace suite to **86 cases**; five seam cases include 120
generated retained-history branches (seed 150906). Thirteen affected/timing-follow-up owned suites
pass **215 cases**, without skips/retries and with process drain. The existing 80-history state
and master/card selection ledgers run under all three variants. Five source faults are detected.

A targeted startup test exposes a cleanup gap in the first integration: Promise.catch handles a
rejected opener Promise but misses a synchronous opener throw. A surrounding try/catch now closes
the empty owner in both cases. Original source/test, failed run and repaired pass are retained.
The full unit command first passes 99 files / 1,141 cases before that repair, then times out after
the repair in the same two unchanged Account-liveness/position-decision five-second cases recorded
earlier. Both pass individually in the owned run. One unchanged full repeat passes 99 files /
1,141 tests. All three runs remain; a timing cause is not established and loaded-host qualification
is not closed by a repeat pass.

Native pending-state and original-order delivery each pass directed cases plus **100 histories**
(seed 8941). The owned workspace catalogue passes **ten cases and four mutations**, with browser
and process drain. The first native run passed all ten cases but its whole-state pending-history
mutation destroyed the active candidate and timed out before reaching the privacy assertion. The
replacement fault exposes the candidate undo stack without replacing the accepted document; the
original error run and both catalogue definitions remain, with the same assertion and limits. Each
runner explicitly selects the new variant in its URL; fixtures retain their
prior default when that selection is absent. This remains one host's disposable Chromium evidence.

Twenty-one runner checks, types, scoped format/lint, inventory/manifest, census and authority checks
pass. One five-case suite and thirty workspace cases are added; all previous cases, deadlines and
exclusions survive, apart from the denominator-test title and pending-history mutation target updates.
Current general integration is
**263 files / 2,121 dispositions (11 not applicable)**. Runtime changes are limited to the Yjs seam,
admitted workspace and the owner's descriptive comment; crypto classifications stay fixed. Six
previous packets, 52 personal/vector pins, append-only records and L-2 are preserved.

[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-integration/README.md).
The next bounded phase is the prospective performance comparison above. Functional agreement does
not establish a speedup, default activation, whole-wrapper certification or immutable release pass.


## Subsequent performance checkpoint

The [prospective comparison](./f17-selection-performance.md) completes all 64 sessions and their
semantic checks, but fails the incremental useful-gain rule: 2.9% shallow and 10.3% deeper-history
improvement over the existing handoff, with >=10% required in both. All regression guardrails pass.
The single unchanged application gate records 12.2/75.1 ms desktop/CPU-4x Android card p95;
Android still exceeds <16 ms, and its 54.2 ms focus observation exceeds <50 ms. The functional evidence above remains intact. Default Local/Account
retain the reference; F-17 remains partial. Review and sign the accumulated bounded phases, then profile the snapshot application variant to separate remaining document/history fork, full comparison and publication costs before choosing another repair. Retain the unchanged budgets and failed measurements.
