# Phase17 — history checkpoint and receive gating

2026-10-22. Source before this phase is cumulative tree16 `c20eb095bc8ae081d750f90f731d172ec99ec167`, after signed `c1177575` plus uncommitted sequential14/15/16. Final status: **held; checkpoint retry mechanism repaired, peer latency and deep replay guards still fail**. General qualification remains paused; no actual stage, commit, push, preview8443 change, merge or deployment.

## Mechanism and repair

The disposable diagnostic records six quiet-receiver history409s explicitly `state-changed`. Each request exhausts four coherent-snapshot attempts: the authority/membership section takes about700ms while ordinary signed writing advances the captured publisher witness. The catalog stays unchanged. Normal receiving checks history before ordinary stream reads; a history transport refusal returns unknown and invokes the existing exponential retry schedule. These are measured observations of this diagnostic, not retroactive reasons for phase16's two uncaptured bodies.

Reuse the protocol's complete branded membership timeline and its historical lookups. When current authority already owns that timeline, do not rebuild it. Otherwise verify the latest complete early timeline once and use its retained earlier memberships. Keep the original presence guard before continuation parsing; a never-connected account has no connection proof chain.

For **catalog reads only**, initial capture owns an authority header, not publisher-tip evidence. Verify current authority, the complete membership and signed request first; then capture live publisher histories, catalog, handoffs and records together. Compare every authority-header input exactly except decision rows and the live delivery witness. The fresh complete census verifies that witness and its ledger. Warm verified-prefix reuse and its asynchronous old-row audit policy remain as before; this does not reread every old row on every request. Existing cut verification, full snapshot/owner/data_version/commit/quarantine checks, current seal, transaction-time scope/session authorization and expiry still apply. `latest`/`previous`/`pending`, source and mutation capture order remains unchanged. No client receive gate, wire/stored format, schema, numeric16/64 rate, four-attempt bound or deadline change.

## Final fixed comparison

Fresh R,C,C,R, same frozen c117 client, three genuine seeded accounts with6/2/2 devices and1024/256/32 source increments, ten contexts/four Chromium roots, Linux1CPU/1GiB/zero swap.120 trusted focused keys offered at500ms intervals. Original30s post-typing writing and600s replay assertions are retained. References that miss writing censor replay at load-stop; a partial peer distribution has no full p95 or R/C ratio. Whole journeys are the comparison units, not independent keystrokes. Local guard16ms and complete peer guard2500ms remain.

| Run | Q1 history409 | Local p95 ms | Complete peer p95 ms | Original delivery | Replay600s |
|---|---:|---:|---:|---|---|
| 1-R | 6 | 3.8 | incomplete (46/120) | False | False |
| 2-C | 0 | 2.6 | 8993.5 | True | False |
| 3-C | 0 | 2.7 | 5090.8 | True | False |
| 4-R | 6 | 2.8 | incomplete (76/120) | False | False |

Reference history409 counts: [6, 6]; candidate: [0, 0]. Heavy acceptance: **False**. Both complete candidate peer p95 values are **8,993.5ms and5,090.8ms**, above the unchanged2,500ms guard. All five H receivers also miss600s. “Checkpoint repaired” is a scoped mechanism finding, not performance acceptance. Read `analysis.json` for every guard and actual background outcome/timestamp. A passing runner establishes continuation/durability checks, not a passing fairness decision.

After load clears, all four retain automatic original-writing recovery, a guaranteed offline pending edit with unchanged accepted position/peer absence, five-second save, lock/full writer-process close, same-profile offline reopen with exact whole archive and no storageState reinjection, automatic whole-export convergence on reconnect, reverse writing, Undo/Redo, account marker isolation and peer cold offline reopen. Native independent OpenSSL checks validate accepted envelope/wrapper/head/prefix evidence; every seeded accepted row stays byte-identical, H/M accepted history is unchanged and added experiment writing belongs only to Q. The inspector body is byte-identical to phase16. This is graceful cold-reopen evidence, not arbitrary power-loss durability.

## Challenges and limitations

17 new directed regressions pass; every old test/import/helper byte is retained. Eight implementation omissions are caught, plus two source-review omissions. Independent raw-event/timing/refusal/identity/cold-archive reconstruction and six evidence/native fault controls pass. The source review recovers the original checkpoint body after only the reviewed catalog capture-order changes and four branded membership-value projections. Resource identities and unchanged client/runtime inputs are pinned.

Affected permitted reference: {'tests': 137, 'pass': 121, 'fail': 16, 'cancelled': 0, 'skipped': 0}; candidate: {'tests': 154, 'pass': 138, 'fail': 16, 'cancelled': 0, 'skipped': 0}. The same16 pre-existing failures remain unresolved; no new failure remains. They are not automatically declared stale. Earlier sandbox listener EPERM failures are preserved separately; the permitted rerun executes those HTTP cases. Crypto domains/construction bytes and all881 obligation rows/337 unresolved remain unchanged after explicit planning-only census/inventory refresh.

The reuse-only pilot passes quiet delivery but retains seven Q1 checkpoint409s; all five H receivers exceed600s. Preserve that failed prototype. The first fixed schedule's reference never reaches setup because the lab selector mounts the service folder as the protocol folder. Its cleanup timeout masks the missing-module startup error; preserve both. The correct-mount candidate in that incomplete sequence is exploratory only. Freeze rejects further runs after the host selector correction; a new independent mount check rejects the original selector before the fresh fixed-v2 comparison. No favorable run replacement or app-source repair occurred between final fixed-v2 runs.

Preserve the real prototype epoch-one regression (unconditional connection-chain parse), the new-test pending-zero-head correction, test-only rearming during external response verification, required handoff-checkpoint fixture correction, unconfirmed finalized-original concern (both original/prototype pass), copy/syntax/type setup errors and every failed control/check. Narrow failures were repaired before final freeze; earlier logs are not erased.

This finite synthetic LAN/CPU case does not qualify physical Android/Firefox/WAN, indefinite overload, arbitrary histories/checkpoint sizes, churn, catastrophic crash, all release contracts or maximum multi-tenant capacity. Initial diagnostic timing and the two exploratory runs are not final comparative evidence. Pending heavy outcomes remain explicit; do not infer general fair service from a quiet-account fix.

## Reproduction and artifacts

Use `protocol.md`, frozen `measurement-identity.json`, `run-plan.json`, receipts, raw compressed runs, source/control/evidence review, native audits and reproduction scripts. Final orchestration is `run-fixed-v2.py` / `freeze-and-run-v2.py`; the v1 and exploratory scripts are retained history, not replacement measurements. The concrete original paths and create-once directories require a fresh private reproduction root. Implemented and tested here; enabled only in disposable services, not deployed or observed on personal devices. The dependency image is a pinned runtime/dependency carrier; mounted source is the actual tested server, not a deployable release image. Seed construction comes from the phase14 packet; the retained private fixture/state/profile/codes/credentials/operator key are excluded. Known-private-value scan is exact-value coverage, not universal DLP. SHA256SUMS/provenance cover public artifacts. Sequential patch17 applies after canonical16; it is already applied in the cumulative checkout and must not be reapplied there.
