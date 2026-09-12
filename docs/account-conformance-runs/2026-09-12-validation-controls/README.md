# Restored validation controls — Q-01 / Q-04

Parent: unsigned `409fbd0`; tested working-source hashes are in `passing/sources.json.gz`.
The bounded campaign passes all 13 stages with 936 source pins unchanged through completion.
Run it with `node scripts/validation-controls/run.mjs`. The exact pre-run contract is retained as
`passing/protocol.tested.md`; the current [phase record](../../review/implementation/validation-controls.md)
adds the result after the run. This is not the full release or crypto-contract aggregate.

| Check | Result |
| --- | --- |
| Construction inventory | 165 sources, 89 labels/templates, 22 groups, ten manual entrypoints; 83 constructions retain 78 specified / 4 inherited / 1 excluded classifications |
| Directed omission controls | All three pass; inbound startup/full and receive/reuse guards each refuse independently, while their joint omission admits the missing-content history |
| Registry/census and origin controls | 18 Node tests pass, including 300 generated label histories and stale/missing classification controls |
| Full content carrier | 13 cases pass; all five mutants detected, including unreadable-record swallowing |
| Full receive | 45 unit cases and 17 native tests pass, including 12 generated crash/reopen histories |
| Full receive transport | 14 unit cases, nine native tests, four omission controls and 16 generated histories pass |
| Liveness runner integration | 16 stages pass, including the new prerequisites and existing ownership, service and growth evidence |
| Residue runner integration | 11 stages pass, including the new prerequisites and existing R1 calibration/lifecycle/generated evidence |
| Private failure phase integration | 14 stages pass, including the new prerequisites, full 1,015-test unit suite and existing genuine-service/refusal regressions |
| Scoped lint and formatting | Pass |

The fresh disposable Vite build is recorded under `build/`; assets were not installed or served to the
personal browser. Origin isolation runs against that selected output. The eight initial gate checks
(authority, origin, retention, selection status, update limit, WASM, debts and traceability) pass under
`gates-pilot/`. Final receipt refresh after checkpoint edits is retained separately under `gates-final/`.
Receipts describe their exact working tree and do not stay fresh across later edits/commits.

`before/` retains the three original failures and reviewed census delta. `first-repair-attempt/`
retains the failed reuse-only mutation, which revealed that startup also checks the full fallback.
`origin-fixture-attempt/` retains a failed fixture assertion: removing the allowlisted namespace made
the unused-allowlist check fail before remote-code detection. The corrected fixture retains that
namespace and then proves remote code is rejected. Neither failure is silently credited as passing.

`archive-files.json` records every selected report's original path/hash and its publishable copy/hash.
Copies normalize only the absolute workspace prefix; large files/logs use lossless gzip. Raw outputs
remain at the listed local `test-results` paths. Repeated residue carrier dumps are listed by hash in
`local-carrier-reports.json`, with compact verdicts in `regression-checkpoints.json`; they are not
duplicated here and this phase makes no new privacy-qualification claim. Copied source trees and
build/profile duplicates are excluded: source pins, mutation text, code, case outcomes, generated
histories and failures are kept.
This limits new repository growth without pretending there is a durable external archive or closing
Q-08's broader retention/history-publication work.

The seven new runtime sources and twenty changed sources were reviewed before recording the census.
All domain labels, kinds and site paths match the previous census after removing line coordinates;
the eight site changes are only line shifts. Four unlabelled verification/recovery entrypoints are now
explicit in the registry. No production code, cryptographic values, previous vectors, historical review
packets, personal packages or L-2 document changed in this phase.

Q-01/Q-04 are repaired within this boundary. Dependent full contract/crypto audits and a complete
immutable release aggregate were not rerun; F-20/N-06/P-05 remains open. Q-02/Q-03 liveness costs,
Q-05 expiry diagnostics, P-06 prose and other platform/recovery/release obligations remain separate.
