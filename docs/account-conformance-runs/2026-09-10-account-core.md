# 2026-09-10 — Private account ceremony core

Base commit: signed `187b636` (personal app upgrade and account prep). This record covers the subsequent
working tree pinned by [sources.json](./2026-09-10-account-core/sources.json), not a claim that the new
implementation was already committed. Contract: [account-core.md](../account-core.md).

`node scripts/account-core/run.mjs` completed successfully in about four seconds in the final campaign. The equivalent package
script is `pnpm account:core`, also included in the check chain. The runner records source pins before
execution, streams output, writes JUnit and completion/timeout status, and has a two-minute deadline.
See [summary](./2026-09-10-account-core/summary.json), [JUnit](./2026-09-10-account-core/results.xml) and
[raw output](./2026-09-10-account-core/run.log).

| Check | Observed result |
| --- | --- |
| Directed core cases | 13 passed, covering both Ed25519 and ES256, origin/RP/UV/UP/embedding, ID/user-handle/key checks, exact signed bytes, purpose, uniqueness, caller mutation and commit-time races |
| Independent registration ledger | 160 histories passed, seed `9142026`; begin/cancel/expiry/retry/abort/lost reply/two-connection concurrency/restart and refused proof |
| Independent sign-in receipt ledger | 80 histories passed, seed `9152026`; synthetic active account, both encodings, wrong purpose, abort/lost reply/replay/concurrency/restart |
| Process death | Ten passed: real SIGKILL immediately before/after begin, registration, confirmation, sign-in and cancellation commits; retry in a new child process |
| Native browser/HTTP | Two passed: disposable Chromium discoverable credential, possession confirmation, service restart/sign-in, browser cancellation; raw Host, Origin, adapter-token and input-bound refusals |
| Sensitivity controls | Three passed by observing actual bad acceptance after temporary-source guard removal: a second receipt on replay, a confirmation proof accepted as sign-in, an attacker-selected verifier key accepted |
| Existing unit suite | 73 files / 825 tests passed in 37.08 seconds |
| Static/build | TypeScript, focused lint/format and whitespace checks pass; isolated app build passes budget (327.2/350 kB) and origin isolation |

The campaign comprises 30 top-level tests; the 240 generated histories are inside two of those tests.
No generated counterexample was found in these runs. Counterexample shrinking is disabled in this bounded
campaign; a failure retains the actual failing history, seed and replay path instead of extending the run
while shrinking. Failure diagnostics also retain the last before/after SQLite table snapshots and command
context. The controls exercise that snapshot writer in the passing campaign: synthetic [replay](./2026-09-10-account-core/control-replay-mutant.json),
[purpose](./2026-09-10-account-core/control-purpose-mutant.json) and [key-substitution](./2026-09-10-account-core/control-key-mutant.json)
records include proofs and state before/after bad acceptance, with corresponding baseline records beside
them. Deliberate controls run against temporary copies; no bypass switch exists in the service.

A directed cross-process test exposed and repaired an implementation defect after the initial 29-test
campaign: the initial transaction read the challenge, then the credential was read separately before
crypto. A competing process could complete confirmation between those reads; the first request then
spuriously rejected a valid proof because the credential had become confirmed. The initial transaction
now snapshots both together, retaining commit-time winner/key/account revalidation. The final campaign
adds the real competing-process regression and passes 30 tests. [Before failure](./2026-09-10-account-core/confirmation-race-before.log),
[after repair](./2026-09-10-account-core/confirmation-race-after.log), and [pre-repair core](./2026-09-10-account-core/confirmation-race-before-core.txt)
are retained. To reproduce in an isolated copy, replace its core.ts with that pre-repair source and run
`node --test --test-name-pattern='competing process' test/account-core/core.test.mjs`. This failure was
found by targeted review/reproduction; it was not discovered by the generated histories.

The first HTTP Host negative used `fetch`, which rewrote that header and therefore never sent the hostile
authority. A raw `node:http` probe corrected the harness and observed refusal. An initial source edit also
nested the sign-in property test under the registration test; both executed, but they were separated
before the preserved campaign. These are harness corrections, not implementation counterexamples.

The attempted newest verifier release (14.0.1) and its required X.509 release were rejected by the
repository's dependency-age policy. Reviewed 14.0.0 and its eligible dependency resolutions installed
without an exception. A sandboxed `pnpm typecheck` launch could not contact the registry for package-manager
identity verification; the installed TypeScript binary was used directly and passed. Dependency installation
itself used pnpm with network access and passed its policy checks.

The [build checks](./2026-09-10-account-core/build-gates.json) used an isolated output directory and retained
the personal release/predecessor files. The [unit/static summary](./2026-09-10-account-core/unit-and-static.json)
records captured tool outcomes; a separate raw Vitest output file was not retained. Initial
[governance output](./2026-09-10-account-core/governance.json) passed nine checks and identified a stale WASM
receipt at traceability; [final gates](./2026-09-10-account-core/final-gates.json) record the refreshed WASM
verification and successful traceability check.

The personal app preview and legacy relay remain off. No personal profile, passkey, code, content, custody,
index or old second-device data was touched. Native coverage is Chromium with a virtual authenticator,
not a hardware/browser matrix. Power loss, historical database restoration, production sessions/hosting,
authority bootstrap and signed binding issuance, recovery/promotion, encrypted sync, enrollment and
independent review remain outside this bounded result. No conformance debt or matrix state was closed.
