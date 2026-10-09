# Browser receive-transport fixtures — bounded runner evidence

All three files / fourteen cases pass in **411.739 seconds**, with every worker and browser group
drained. Four omission controls and sixteen generated histories retain their existing assertions,
seed and bounds. Shared helpers, control/generated tests and product source are unchanged. A stale
native overflow assertion now requires the exact R-01 refusal, retaining cursor/storage checks. The
first owned run's failed native assertion and eight passing native cases are retained in full.

Transport service fixtures remain staged at tree `6abb609`; the SSH signing agent refused the requested commit. Signing is pending; new phase changes remain unstaged.
The exact source patch uses that prior phase's tree `6abb6097a81f47ac050d96e1730a7e39477ef707` as its
base. The execution itself records `a20e678558d4de16fbef2bfbd6af0b9b83084d1d` plus its complete frozen input
identity. This packet does not claim an immutable aggregate or a signed commit that does not exist.

- Controls: 4 cases; 90-second complete-file deadline.
- Generated: 16 histories in one case, seed 9112042, endOnFailure:true; 300-second inner timeout,
  330-second file deadline; all six action kinds occur with text/prefix/source-count comparison.
- Native: 9 cases; 120-second file deadline. One case uses real v2 service HTTP. Others use signed
  fixture pages or controlled failures, including publication, cancellation, renderer crash and retry.
- Ownership: 15-second browser startup, five-second drain grace; 12 native owner controls pass.
- Planning: 92 pure runner checks pass, with direct TypeScript, scoped lint/format, authority and
  snapshot checks. Complete release planning still refuses. Prior Node owner/Vitest-process evidence
  is pinned. The first new planning assertion used a nonexistent polling path; its retained failure
  is corrected to the actual still-blocked receive-driver path.

Read [summary.json](./summary.json) for exact scope, timing, input identity, artifact hashes and limits;
[final-gates.json](./final-gates.json) and [preservation.json](./preservation.json) record validation.
Compressed artifacts retain full top-level stage receipts/logs/case reports, Chromium identity, exact
patch, initial failed-selection receipts, prior contracts and source/helper pins. Machine paths in evidence are normalized; both raw and
normalized hashes are recorded. Binary stage files are retained as hashed base64 values. Full raw
source/dependency inputs remain at the local run path recorded in the summary.

All 167 prior general contracts / 1,413 identities remain unchanged. General execution now covers
170 files / 1,427 cases; 247 manifest obligations remain. Same-context page reopen and renderer crash
are distinct from full browser death or power loss. Fixture-page histories do not establish generated
real-service/network histories. Optional JSON reports and original wrapper prerequisites/order remain
separate. The ledger phase's initial expected-positive orphan classification is still unresolved.
Personal servers/profile/package files, recovery/factors, prior vectors, L-2 and historical archives
were not changed. Next: browser receive-driver polling/reconnect fixtures.
