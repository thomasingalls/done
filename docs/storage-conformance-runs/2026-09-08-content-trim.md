# Exact-coverage content compaction — execution evidence, 2026-09-08

Phase ten was committed as **d7c0f32** before this work. This checkpoint adds explicit
`JournalSession.compactContent()` under the current shared writer lifetime. The [guide](../content-trim.md)
records its disk-union construction, exact byte checks and failure boundaries. No default app, application
archive policy, key format, generation retirement or real user-data cutover changes here. No debt is paid.

| Execution | Cases | Assertions | Mutants detected | Report |
| --- | --- | --- | --- | --- |
| Content compaction | 21 | 128 | 8 | [JSON](./2026-09-08-content-trim.json) |
| Content regression | 13 | 58 | 5 | [JSON](./2026-09-08-trim-content-regression.json) |
| Journal regression | 17 | 93 | 6 | [JSON](./2026-09-08-trim-journal-regression.json) |
| Custody regression | 13 | 73 | 5 | [JSON](./2026-09-08-trim-custody-regression.json) |
| Admission regression | 15 | 64 | 6 | [JSON](./2026-09-08-trim-admission-regression.json) |
| Local clear regression | 17 | 172 | 5 | [JSON](./2026-09-08-trim-clear-regression.json) |
| Local genesis regression | 17 | 160 | 4 | [JSON](./2026-09-08-trim-genesis-regression.json) |
| Retained startup regression | 15 | 96 | 3 | [JSON](./2026-09-08-trim-startup-regression.json) |

All final runs exit zero. The saved JSON is format-normalized with parsed equality checked against the
raw reports. Recorded production and harness hashes match the current inputs. Final raw runs are
`test-results/content-trim/final/report.json` and
`test-results/{content,journal,custody,admission,local-clear,local-genesis,owned-startup}/trim-regression/report.json`.
The browser harness records SHA-256 inventory digests for exact comparisons; an absent row is represented
explicitly, so losing that row is a failed assertion rather than a harness error.

## What the schedules establish

Actual production custody enrollment and content initialization create each disposable fixture store; the
required identity and cross-carrier genesis checkers remain synthetic. The compactor receives its authority
from the production journal-capable session and takes no caller document or coverage set. Native storage,
WebCrypto, WASM journal operations and Web Locks execute on the host. Readback verifies retained custody,
heads/outbound and journal bytes as well as content; no deletion of those reference classes is implied.

The delayed-reservation schedule commits 1, holds 2 before encryption, commits 3, then publishes state 4.
Only after native publication succeeds does 2 commit. Deletion removes precisely 1 and 3; 2 remains identical
and cold recovery produces the semantic union. Overlapping compactors both capture 1 and 2 and publish 3
and 4 before either deletes. The first deletes its exact inputs; the second observes missing coverage and
returns `retained`. Both independently published replacements survive. The allocator retains every
reservation, including abandoned encryption and discarded duplicates.

Wire merging preserves unresolved structs and delete sets through cold replay followed by dependency
arrival. Unit coverage additionally establishes the equal-state-vector deletion-only case. A private
validation document never supplies the replacement; neither a live tab document nor a state vector is
accepted as coverage authority. Heads/outbound are authenticated, retained and excluded from the merge.
Empty content or an already compacted single validated state produces no new reservation.

Before/during/after-publication failures include unreadable retained heads, invalid singleton state bytes,
missing initialized metadata, corrupt journal tags, authenticated malformed journal updates, a newly
committed malformed update, and a damaged replacement. Another adversarial fixture re-encrypts a different
valid update at an existing identity using the known test factor. Both replacement before the final audit
and replacement after its decrypt are refused. That fixture deliberately bypasses production allocation
and immutability; it tests exact-byte coverage independently of tag failure, not a supported write path.
The deleting transaction rechecks its complete authenticated census and synchronously checks the journal.
A changed census is authenticated again before any deletion; known damage closes ordinary session use.

Native request-success-then-abort schedules distinguish publication completion from request success and
verify deletion rolls back every input together. Actual renderer death after reservation, publication and
deletion recovers offline. A fresh invocation handles retained duplicates without a persisted watermark.
Close during held encryption keeps an exclusive successor waiting, drains the owned call and prevents late
publication. An authenticated generation change injected around the lifecycle barrier prevents deletion.
Native callback delivery gates, adapter faults and that deliberate bypass are instrumentation, not claims
to reproduce every browser-native failure mode or a production generation transition.

Eight mutants are detected: sequence-range deletion, partial disk merge, ignored nonce/ciphertext equality,
skipped final content census, skipped journal semantic validation, discarded pending wire state, early
transaction success and skipped final synchronous journal census. These bounded falsifiers do not constitute
an exhaustive protocol proof or independent review.

## Development corrections and verification limits

The initial browser run passed all 18 then-defined baseline cases. Its range-delete mutant really removed
the late record, but the inventory digest helper threw on the missing row; that execution exited two.
The helper now encodes absence and the final mutant fails its intended assertion. Six other initial mutants
were detected. Three later schedules cover missing metadata and journal damage at both earlier and final
checks. Missing initialized metadata is normalized to repair and stale-generation maintenance closes the
session, preserving persistent openers. An intermediate unit run used the wrong expected session label
(`open` versus the existing `active`), and a large exact-array comparison exceeded the five-second test
limit while browser suites ran. The assertion now compares cryptographic byte digests plus exact metadata;
its output-size/refusal condition and default timeout are unchanged.

Full Vitest passes **679 tests / 55 files**, including 13 new compaction tests, without concurrent browser
runs. Typecheck, focused lint/format, build/budget/origin, sixteen vector generators/AAD, WASM and applicable
project/governance/traceability checks pass. Initial JS remains **306.3 kB / 350.0 kB** gzipped. `storage:trim`
is included in the check chain. The literal full chain, geometry and separate unchanged
editor/workspace/lifecycle browser suites were not executed in this checkpoint.

Host: Chromium 151.0.7922.34, Playwright 1.62.0, Node 26.8.1, Vite 8.1.5, macOS arm64. No OS/power-loss,
raw rollback/clone detection, forensic erasure, supported-population, low-end performance or independent
review claim follows. Input memory is proportional to the full disk union; the 4 MiB replacement bound does
not bound input size. Automatic maintenance scheduling, large-state chunking, default UI integration,
Account checkpoint/receive authority, complete reference/generation composition and old-writer/legacy
migration acceptance remain later work. Legacy migration/cutover preparation is the next bounded boundary.
