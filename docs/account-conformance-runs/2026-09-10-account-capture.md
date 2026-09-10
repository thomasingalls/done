# Private durable Account source capture — 2026-09-10

Signed `18ceb40` commits the preceding outbound preparation and v2 key-domain correction. This checkpoint
implements source capture inside private Account admission. Accepted writing retains original transaction
bytes and actors through journal flush, compaction and restart. It does not allocate network positions,
mint envelopes or publish to a relay. [Carrier contract](../account-source-capture.md).

The final capture runner output is `test-results/account-capture/2026-09-10T19-47-17.980Z`.
[Summary](./2026-09-10-account-capture/summary.json),
[423 source hashes](./2026-09-10-account-capture/sources.json),
[native histories](./2026-09-10-account-capture/generated.json) and
[evidence manifest](./2026-09-10-account-capture/manifest.json) preserve the run. Compaction's separately
repaired harness has its final source hashes in its regression report. Historical failed runs are labelled.

| Evidence | Result and scope |
| --- | --- |
| Native capture | 15 cases pass, 102.55 seconds; activation before/after commit, journal-only crash, pressured atomic abort/retry, cleanup overlap, v5/old-reader refusal, actor/undo/system operations, pending structs/deletions, oversized capsule fallback, route/conflict refusal and lifetime drain |
| Native generated histories | 16, seed 9322026; real editing interleaved with flush, compaction, close/reopen and renderer crash; original capsules remain byte-identical |
| Source unit properties | 250 transaction histories, seed 9422026; independent text oracle, exact bytes/actors, reverse delivery and journal/disk overlap |
| Route unit properties | 200 substitutions, seed 9422027; workspace, credential, principal, epoch, generation and actor mismatches refuse |
| Source unit tests | Seven pass, including malformed/canonical bytes, conflicting intent identity, complete prepared-source coverage, real system/human transaction attribution and bounded retry accounting |
| Actual capture controls | Removing the outbound write loses retained attribution after flush while leaving writing visible; removing the route guard accepts a different workspace |
| Accounting regression control | Removing the reservation reset fails the actual queue test: 49,806 reserved bytes versus 33,101 after retry; the repaired five-retry test passes |
| Prior Account editing | All 16 native cases pass, including 24 generated editing histories and 200 ancestry comparisons; direct Node test command under a 180-second wrapper |
| Shared storage regressions | 15 ordered admission, 10 workspace admission and 21 content compaction cases pass; all eight compaction mutation controls are detected |
| Full unit suite | 851 tests / 75 files pass, 55.80 seconds |
| Build and final checks | Isolated app build, TypeScript, scoped lint/format and 13 gates; exact results in adjacent logs/JSON |

[Findings and corrections](./2026-09-10-account-capture/findings.json) distinguish implementation changes
from harness failures. Code review found that retrying an oversized preparation could repeatedly add its
capsule reservation. The fixed owner restores the base reservation; the actual-module control reproduces
the defect. Generated histories found an invalid Unicode assumption in the test: removing one UTF-16 code
unit split an emoji, and the oracle expected a lone surrogate while Yjs normalized it. The corrected
editing domain removes whole codepoints. No new production protocol defect was demonstrated by those
generated histories; they are bounded evidence backed by the bad-retention and bad-route controls.

Compaction regression initially failed to bind port 5185, then remained alive because server startup was
outside its cleanup `finally`. A separate process held that port and was left untouched. The retry then
found that the flat fixture snapshot lacked required promotion modules. The repaired harness uses a
selected free port, always closes failed startup, and copies the full dependency graph. An injected
startup failure exits promptly with the expected code 2. The final 21-case/eight-control campaign
passes. Initial failure logs and the control loader are retained, not counted as passing tests.

The capsule carrier uses authenticated promotion v6 over existing encrypted journal/StoredRecord wrappers
and a tagged `outbound` payload. V4 frozen genesis can activate; already-edited v5 histories retain their
writing and require a later catch-up checkpoint. Capsules are not inferred from callbacks or snapshots,
and compaction cannot discharge them. `listCaptures()` has no deletion or acknowledgement authority.

This phase has no personal Account, browser, factor, operator-key or server operations. The author's
`.dev/releases/17d87c2/app` and predecessor `dist/` remain intact; preview and relay remain off. There is no
physical power-loss, large-backlog performance, rollback/profile-clone, multi-device or whole-protocol
claim, and no conformance debt is paid. Next is position allocation plus exact persisted v2 envelopes;
verified responses/refusal proofs and the content-blind durable relay follow separately.
