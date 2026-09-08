# Legacy source preparation — execution evidence, 2026-09-09

Phase twelve is committed as **a0811e2**. This bounded checkpoint adds a private read-only predecessor
source observer, [migration preparation plan](../legacy-migration-prep.md) and disposable native harness.
It implements no migration/import/selection/cleanup transition and changes no default application route.

| Execution | Result | Evidence |
| --- | --- | --- |
| Native source reader | 12 named scenario checks; 100 generated delivery histories, 400 byte/inventory comparisons; pass | [JSON](./2026-09-09-legacy-source.json) |
| Focused source mutations | Four detected by named assertions, not harness exceptions | Same JSON |
| Saved JSON replay | `[[0,2,1,3,3],[4]]`; native scenarios and four mutants repeat successfully | [JSON](./2026-09-09-legacy-source-replay.json) |
| Unit suite | 18 new source tests, including 100 generated delivery partitions; full suite 705 tests / 57 files passes | `test/legacySource.test.ts`; raw `test-results/legacy-source/vitest-final.json` |

Chromium **151.0.7922.34**, Node **26.8.1**, macOS arm64. The default property seed is **8941**. The
payload population is five fixed causal text updates, including a cross-client insertion and a later
deletion-only update. Partition, order and duplication across native disk/WAL carriers are generated;
application documents, export semantics and migration commands are not. Expected byte inventories live
in the runner's original operation ledger and never derive from the observer's digest or replay results.
No generated failure occurred in the final run, so the recorded shrink count is zero. JSON replay is
executed separately; a future failure also writes its minimized history and seed/path.

The final reports are copies of `test-results/legacy-source/final/report.json` and
`test-results/legacy-source/replay-check/report.json`; parsed equality and recorded input hashes were checked.
Their source/harness/guide files were frozen before execution. Readonly requests use native IndexedDB
completion/abort events; browser enumeration is disabled for production paths and retained separately for
fixture inventory. Each baseline/replay run includes one actual renderer death during the source digest
boundary. This is reader interruption evidence, not the registered cutover kill matrix.

## Findings and limits

The source observer preserves original database key/update pairs, plaintext WAL key/value/update bytes and
four known ancillary keys. It refuses unknown layouts/custom rows/record types and unreadable or unknown
journal framing. It detects observed WAL drift and valid pending struct/deletion dependencies, retaining
source material. An absent database probe leaves no database behind and returns no origin-freshness or
migration authority. Native abort, unknown custom data and renderer death leave source carriers intact.
The modern-key exclusion is checked by the seeded unrelated encrypted journal and ambiguous-key unit case.

The actual legacy `openLocalStore` provider synchronously journals and commits a later operation while
another page owns the new exclusive Web Lock. Both the held lock and later changed observation are checked.
That confirms the new lifecycle lock does not establish old-writer exclusion. The preparation plan requires
controlled whole-context exclusion for the next seeded harness and leaves production supported-version
exclusion explicitly unresolved. Neither a source digest nor a caller assertion licenses cleanup.

| Mutant | Assertion detecting it |
| --- | --- |
| Omit captured journal | `journal-only-update-retained` |
| Treat pending dependencies as complete | `pending-dependencies-retained` |
| Ignore nonempty custom store | `custom-data-not-omitted` |
| Inspect with a readwrite transaction | `all-native-reads-readonly` |

Each mutation is applied to a copied source file; original bytes/hashes and the exact replacement are
recorded. Baseline named scenarios pass, mutations raise the indicated assertions, and the replay run
repeats all four. They are focused sensitivity controls, not generated/shrunk mutant counterexamples.

Development runs exposed three test issues, all corrected without weakening source-preservation assertions:
the initial jsdom/fake-IDB pairing returned cross-realm byte arrays and refused a valid record (the new
unit suite now uses the repository's existing node-environment carrier-test convention); the first native
run expected one particular error code from a deliberate abort even though a subsequent cursor callback
could surface a native inactive-transaction error (the contract is refusal and preserved source); the
second native run passed all 100 histories and the old-writer counterexample but timed out because its
cursor fault hook consumed the later digest crash gate. The hook now consumes only its own fault types.
Those earlier failed runs are not counted as production defects or passing evidence.

Typecheck, focused lint/format, build/budget, vector/AAD and applicable project/governance/origin/WASM/
traceability checks pass. Initial JS remains **306.3 kB / 350.0 kB** gzipped; the normal Vite chunk-size
warning remains below the repository's actual gzip budget. The literal full `check` chain, geometry and
separate unchanged encrypted lifecycle/custody/content/journal/admission/editor/workspace/startup/genesis/
clear/trim/property browser suites were not rerun in this checkpoint. The native source command is added
to that chain as `storage:legacy-source`.

This does not establish source attribution authority, supported application schema, a verified export,
fresh destination custody/import, authenticated migration progress, safe active selection/cleanup,
full-profile residue absence, supported production exclusion, low-end memory/performance or independent
review. The reader handles the fixed `done` carrier and known ancillary keys, not an arbitrary whole origin.
The live Stage 2 move and sequencing §5.4's carrier choice remain separate. No debt is paid.
