# Local baseline transition/reader evidence — 2026-10-13

Parent: signed **962329a3**, the owned shadow phase. These checks cover the uncommitted follow-on
[transition/reader work](../../account-local-baseline-transitions.md). Exact source hashes, commands,
log sizes and compressed/uncompressed SHA-256 are in [evidence.json](./evidence.json).

| Check | Result | Output |
| --- | --- | --- |
| Focused Vitest | 99 passing tests / 11 files; 22 baseline cases include 30 generated cut histories | [focused.log.gz](./focused.log.gz) |
| Existing protocol/checkpoint Node cases | 26 pass, including two repaired existing omission controls | [protocol.log.gz](./protocol.log.gz) |
| Packaged native original/joined owners | 1 pass: checkpoint 1, admission/cancellation epochs 4/5, cold reopening | [native.log.gz](./native.log.gz) |
| Native journal/lifetime regressions, shadow opt-in | 6 pass; ordinary-only case intentionally skipped | [shadow-native.log.gz](./shadow-native.log.gz) |
| Ordinary native build | 1 pass: experimental method absent | [disabled.log.gz](./disabled.log.gz) |
| TypeScript / changed-source lint / formatting | pass | [typecheck](./typecheck.log.gz), [lint](./lint.log.gz), [format](./format.log.gz) |
| Yjs patch / ordinary build / size / origin isolation | pass; initial JS 137.4 kB gzip | [build.log.gz](./build.log.gz) |
| Whitespace | pass | [whitespace.log.gz](./whitespace.log.gz) |

The packaged test injects an owner handle only in its isolated build and uses disposable accounts,
local virtual passkeys, native IndexedDB/Web Locks and loopback service processes. Its private test
global is absent from the ordinary build. No personal account data was read or changed.

Exploratory native runs found a joined-custody scope assumption and a resume-invalidation regression;
both were repaired and the retained final checks pass. Other failures were test navigation/locator
errors. Two protocol controls were already stale in the parent: they expected the old issuance
expression and a prefix refusal only at `finish()`. Their repaired controls target the current
redundant issuance/prefix checks. This is not a new generalized mutation campaign. Only final outputs
are retained here; exploratory logs were overwritten during iteration.

No history was deleted by this feature. No baseline installer, reader rollout, migration, publication,
release campaign or performance qualification occurred. Busy-host durations cannot support speed
claims. Native transition evidence covers checkpoint/admission/cancellation; rotation and current-key
retry use the signed pure fixture. Full-history-only consumers remain fenced pending durable-reader
integration. Old-operation/checkpoint proof policy and installer undo continuity remain open.
