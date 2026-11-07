# Phase 529 — current-main security baseline and release preflight

**Date:** 2026-11-07. The operator resumed release preparation after signing all 85 phases 444–528. This bounded phase preserves their signed first-parent head `154d3da402fdfb040bbf5fc60c61d5d4c9c1340c` and integrates main `ed49238937cf2bfb917263083647df45967488c3` (PR 60) through a merge, without rebasing or rewriting the hardening history.

Main already carries the Node 24.22.1 CA distrust update. Retain its pinned Node base, CI pins, runtime-version assertions and publication record. The application, Account protocol/service/storage/verifier sources, Vite policy and dependency lock are byte-identical to the signed hardening head. Docker retains this branch's range-writer build path as well as main's updated base. The merge is prepared for signature; the next phase records its actual signed identity before any release image build.

## Reviewed bookkeeping and old-test changes

The generated graph conflict is resolved from the current source. Preserve every existing classification, test and obligation; update actual source hashes and regenerate the execution manifest with the unchanged compiler. The old execution snapshot omitted 67 already-committed hardening test obligations. All 1,035 old obligation IDs remain; there are now 1,102 obligations and 551 unresolved, up from 488. No unresolved ID is removed and status stays **blocked**. This is planning coverage, not aggregate qualification credit.

The first authority check refused four stale construction source-site censuses introduced by the earlier approved clock-skew change (phase 457). The independent proof binds the exact pre-457 source lines and their current identical bytes: 15 line numbers move within four constructions. All identifiers, labels, roles, statuses, authority/home/vector pins, tests and checker bytes remain exact. A first private helper refused a serialization layout change before writing anything; that helper is preserved, and the final repair changes only numeric line fields. The unchanged authority checker then passes.

The first adapter run passed 176/178 cases. The operator explicitly approved the exact three-value patch: general census 2,562→2,616; open crypto count 15→16; exact nonzero-release-refusal text 15→16. Every assertion, case, deadline and block remains. All 17 affected tests first passed on private copies; the canonical full retry passes **178/178**. Old failures and the proposal are retained.

## Checks and identity boundaries

- Node 24.22.1 macOS archive is checked against its official SHA-256; pnpm remains 11.20.0.
- Full units pass: **333 files, 3,231 cases, one existing skip**, suite 131.96 s / wrapper 132.57 s under the unchanged 240 s hang guard. That run preceded the line-only metadata and three-value fixture repairs; the fresh 178-case adapter run covers those bookkeeping changes. No app/test case or unit deadline changed.
- Types, lint, Yjs, vectors, retention, selection status, update limit, authority after the narrow repair, recipient authority, write admission, remediation, debts, WASM, inventory and execution-manifest checks pass. The manifest's blocked result is expected and retained.
- The first traceability run correctly refuses four stale execution receipts after metadata/tree changes. It is not claimed green. After the merge is signed and the exact frontend exists, rerun the four unchanged credited scripts against that settled source, using the extracted candidate for origin isolation, then rerun traceability. Never relabel or transplant old receipts.
- Five-second host/display/swap logs and power-window captures are retained. Full power-log hashes and sizes are recorded without duplicating the full log. Tracked reproduction sources are referenced by commit/path; contexts, archives, dependencies, keys and profiles remain outside Git.

The production predecessor was pulled by its exact recorded private index `sha256:ad463efe357065bf227f47bb557496feda1b79acdb824ba04a3f36d5dc80d8af`, signed source `410221adf55e2a6259c484fc3eddd6ba65b11ab4`. Its extracted HTML is byte-identical to public production; 86 retained frontend files are individually hashed. No production account, storage, identity or state was opened or changed.

## Next bounded artifact phase

After signing, freeze only the clean allowlisted source and build both native ARM64 distroless images from that same source. Candidate `RANGE_RECEIVE=1`; compatible reader rollback `RANGE_RECEIVE=0`; other effective flags retain the approved profile: baseline read/install, local retention/auto/resume on; service history automation off; incremental ledger, coordinated-2000 sender, ledger profiling off. Ordinary defaults remain unchanged.

Check actual final-image runtime/gateway, backup, restore and maintenance; two-container ownership/restart/asset smoke; stale-tab dense/legacy rollback and ordinary offline cold; and packaged upgrade behavior. Independently record source/context/OCI/frontend identities and absence of lab hooks. Stage 5's 36 supported passes and every source/spec carryover qualification remain in phase 528; this phase adds no timed-journey or generalized qualification credit. Preserve all RC debts, including unmeasured post-reduction typing and Undo main-thread costs.

**Rollback boundary:** a compatible same-source writer-off reader artifact must be retained. Rolling back to any build before this release locks out devices that wrote dense rows. Disabling the writer does not undo saved rows or their authenticated floor. Do not clear storage or rewrite receipts.

No image has been built, pushed or published in this phase; no infrastructure or deployment is changed. Both application and infrastructure merge buttons remain with the operator. The later release checkpoint will bind exact artifacts and define the publication handoff.
