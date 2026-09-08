# Journal-inclusive scoped Local clear — execution evidence, 2026-09-08

Phase nine was committed as **ee60528** before this work. This checkpoint implements the explicit Local
clear API in the [guide](../local-clear.md), with a persistent intent and terminal marker. The default app
and real user data remain on the earlier store. No debt status or release obligation is paid here.

| Execution | Cases | Assertions | Mutants detected | Report |
| --- | --- | --- | --- | --- |
| Local clear | 17 | 172 | 5 | [JSON](./2026-09-08-local-clear.json) |
| Local genesis regression | 17 | 160 | 4 | [JSON](./2026-09-08-clear-genesis-regression.json) |
| Retained startup regression | 15 | 96 | 3 | [JSON](./2026-09-08-clear-startup-regression.json) |
| Custody regression | 13 | 73 | 5 | [JSON](./2026-09-08-clear-custody-regression.json) |
| Content regression | 13 | 58 | 5 | [JSON](./2026-09-08-clear-content-regression.json) |
| Journal regression | 17 | 93 | 6 | [JSON](./2026-09-08-clear-journal-regression.json) |
| Admission regression | 15 | 64 | 6 | [JSON](./2026-09-08-clear-admission-regression.json) |

All final runs exit zero. JSON copies are format-normalized with parsed equality checked; the recorded
production and harness hashes match the current files. The clear runner uses inventory digests for exact
before/after comparisons, reducing report size without substituting counts for equality. Its native
enumeration handle belongs only to fixture inventory; production database enumeration is disabled.
Raw final runs are `test-results/local-clear/final/report.json`,
`test-results/local-genesis/clear-final/report.json`, `test-results/owned-startup/clear-final/report.json`
and `test-results/{custody,content,journal,admission}/clear-regression/report.json`.

## What the schedules establish

The fixture creates its Local identity, custody and index through production genesis. It seeds actual
encrypted content and three actual synchronous encrypted journal entries through the production carrier.
Preparation verifies the factor and returns a scoped target; clear rereads after exclusive grant and
persists an authenticated intent before deleting content. Seven schedules kill the renderer after: intent
commit, native content deletion, journal-stage progress, custody-stage progress, atomic opener removal
and index-stage progress, index deletion, and terminal progress. Another tab is already waiting to resume
under exclusion. Each completes with target content, journal, every opener and index absent and only a
non-content terminal control remaining.

The blocked-delete schedule retains a real IndexedDB connection across versionchange. The native delete
request remains blocked and the exclusive writer permit remains held; journal/custody/index stay byte-for-byte
unchanged. The cancellation variant demonstrates the native request cannot be rolled back: it finishes
only when the blocker closes, then the cancelled owner releases with the durable intent and later carriers
retained. Explicit resumption finishes cleanup. A different case injects SecurityError before issuing the
native request; it is an adapter refusal, not a claim to have induced every browser-native delete error.

Journal tests perform one actual removal, inject a throw, kill the renderer and resume with refusal and
silent-no-op variants before allowing completion. All remaining entries and every opener survive those
failures. Transaction aborts after request success cover intent installation, atomic custody removal and
index deletion. Resumption after opener removal needs the valid external factor; a wrong factor cannot
finish even though the live custody and genesis seals are gone.

A real frozen shared writer prevents clear from acquiring its permit; another slot continues opening and
operating. The resumed writer admits late input and closes before clear proceeds. A changed target and
an unknown scoped reference installed while clear is queued are refused after grant. Low-level custody
open, owned startup and fresh genesis refuse a retained intent before key use. Terminal state blocks
accidental genesis and later resumption checks for reappearing residue rather than silently deleting it.

Five mutants are detected: treating a blocked native deletion as completion; removing journal before
content deletion; retaining the genesis opener; skipping resumption MAC verification; and bypassing the
low-level key-access guard. These are bounded falsifiers, not an exhaustive protocol proof.

## Corrections and verification limits

The initial run exposed a preparation bug inherited from startup: the legacy `done` journal prefix also
matches modern encrypted namespaces. Full modern key framing is now distinguished in the legacy-only
census, so an unrelated slot's pending journal does not block fresh Local creation. Legacy/ambiguous keys
still refuse. The initial run also had a mutation text-anchor mismatch; final anchors match and all five
mutants execute. A final unit case verifies a resumer rereads the surviving content layout/counter before
retrying deletion and refuses a different store identity.

Full Vitest passes **666 tests / 54 files**, including 17 new clear/preparation tests. One earlier full run
alongside browser suites failed a static-render assertion; its isolated nine-test file and the final full
run pass without modifying render code or that test. The cause of that non-reproduced failure is not
established. Unit locks are immediate-grant wiring doubles; only browser schedules establish native
exclusion. Typecheck, focused lint/format, build/budget/origin, sixteen vector generators/AAD, WASM and
applicable project/governance/traceability checks pass. Initial JS remains **306.3 kB / 350.0 kB** gzipped.
`storage:clear` is in the check chain. The literal full chain, geometry and separate unchanged
editor/workspace/lifecycle browser suites were not run this phase.

Host: Chromium 151.0.7922.34, Playwright 1.62.0, Node 26.8.1, Vite 8.1.5, macOS arm64. No power-loss,
forensic erasure, old non-participating writer, raw clone/rollback, supported platform, low-end latency,
native IME or independent cryptographic-review claim follows. The factor-derived clear MAC construction
is documented for independent review. Account removal/service revocation, multi-workspace/shared custody,
all-slot handoff, partial genesis cleanup, explicit reuse of a cleared slot, migration/import and default
application integration remain subsequent work. Exact-coverage content trim is the next bounded carrier phase.
