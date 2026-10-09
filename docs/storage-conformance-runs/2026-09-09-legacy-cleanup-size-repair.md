# Focused legacy cleanup size repair — 2026-09-09

This is bounded component evidence, not completion of source cleanup or L-1. The base commit is `4c3c3ab`;
at test time, the repair and prior harness instrumentation were uncommitted. Native reports freeze the exact tested inputs.

The user's [original run](../../test/legacy-cleanup/regressions/field-too-long-2026-09-09/report.json) passed 45 directed
cases and 20 generated histories, then hit `Field too long` on generated history 21. Fast-check continued
shrinking until its two-minute budget expired. The archive under
[test/legacy-cleanup/regressions/field-too-long-2026-09-09](../../test/legacy-cleanup/regressions/field-too-long-2026-09-09/README.md)
retains the confirmed input, original exception, report and hashes; no minimality claim is made.

Before the runtime repair, four new tests failed: the confirmed database at fingerprint construction, a large
local value at fingerprint construction, a large manifest before its intended abort boundary, and a generated
UTF-8 boundary property (shrunk twice). The [before output](./2026-09-09-cleanup-size-before.json)
and [tested hashes](./2026-09-09-cleanup-size-before-hashes.json) retain that evidence.

The repaired seven-test bounds suite covers the captured database, an oversized ancillary value, a valid legacy
journal exceeding the old field width with recovered text, an authenticated/resumable manifest over 64 KiB,
30 generated cases around the old byte boundary, exact v1 message compatibility and v1 intent resumption.
Suffix changes, carrier kind, field boundaries, surrogate identity and authenticated-version changes are checked.
Shared custody framing still refuses over-width fields. The manifest test requires the injected abort to occur.

| Executed check | Result | Artifact |
| --- | --- | --- |
| Confirmed native input, replay only | One pass; zero shrinks; abort receipt observed; journal edit preserved | [report](./2026-09-09-cleanup-size-replay.json) |
| Ten affected native cases | Ten passes; one deliberate renderer death; clean teardown | [report](./2026-09-09-cleanup-size-directed.json) |
| Full Vitest suite | 783 tests / 66 files pass | [report](./2026-09-09-cleanup-size-unit.json) |
| Node harness | 14 tests pass, including first failure versus terminal timeout and false abort refusals | `pnpm storage:legacy-cleanup:harness` |

The ten native cases cover exact cleanup/retry, invalid manifest-key preservation, later journal flush and
compaction, progress aborts at 0/1/7, authenticated progress tampering, blocked-delete cancellation, Local clear
after custody-removal death, and terminal source reappearance. The initial sandboxed replay could not launch
Chromium due to macOS process-registration permissions; it exercised no cleanup history. The successful replay
and ten-case run used disposable Chromium outside that sandbox. Both report unchanged inputs and completed
teardown. This host runs Chromium 151.0.7922.34.

The final test-source edit removes redundant string-literal escapes only. Native report hashes identify their
frozen test versions; all repaired runtime hashes below match both successful native runs and the final tree.

| Runtime file | SHA-256 |
| --- | --- |
| `src/crdt/legacyCleanup.ts` | `407935d4e2f656050136cd3280fc02c1d2c0bad287dd393c2abf8e3389b00d37` |
| `src/crdt/legacyCleanupRecord.ts` | `6d2a2d2d7b14b1f3f88040b8431c9ef989b465e1c745e0efea06e5fd673448d4` |
| `src/crdt/legacyCleanupEncoding.ts` | `26155ef5b7e8fe0fb58d40f6283a5b8830dd8257230edf94a9727942538bc8e2` |
| `src/crdt/localGenesisRecord.ts` | `e319d34bc8e2d70d3a54f2ca1e8db57ba31ff456bdfe9f4afb59f40b600d39d6` |
| `src/crdt/custodyCrypto.ts` | `28c13afbb61ba0e0dab25b882ba7cc06163a3bcd07ef22ea962bd65a93ccb1f6` |

New v2 cleanup MAC framing is explicit; existing v1 progress retains its original encoding and remains resumable.
The parser rejects unknown versions. No source exclusion, lifecycle cancellation or deletion-order contract changed.

The full native generated campaign and seven fault controls were **not** executed in this focused repair. This
checkpoint does not establish max-size performance, other-browser behavior, complete migration safety, production
old-writer exclusion or default-app acceptance. No debt is marked paid and no coordinator work is started.

The available reports above are now committed byte-for-byte, with [copy provenance and hashes](./2026-09-09-cleanup-size-artifacts.json).
The [final seven-test bounds report](./2026-09-09-cleanup-size-bounds.json) covers the final test-source bytes.
Harness instrumentation is committed as `6a5ebe7`, and the failing native run/pre-repair evidence as `082b567`.
This repair checkpoint follows them; the original reports keep their actual run-time commit and file hashes.
