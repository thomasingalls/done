# Private account recovery preparation — 2026-09-10

Base: signed `e9477aa`. [Runtime contract](../account-recovery.md).
[Source pins](./2026-09-10-account-recovery/sources.json),
[summary](./2026-09-10-account-recovery/summary.json),
[streaming log](./2026-09-10-account-recovery/run.log),
[JUnit](./2026-09-10-account-recovery/results.xml).

Final command: `node scripts/account-recovery/run.mjs` (`pnpm account:recovery` uses this runner).
Raw run: `test-results/account-recovery/2026-09-10T14-59-47.059Z`.
All **25 tests pass** in 2.72 seconds; runner deadline 120 seconds, not reached.

| Coverage | Result |
| --- | --- |
| 11 directed service cases | Both passkey algorithms; exact retry/conflict; wrong factors/purpose/key; unconfirmed or foreign attempt; current state/expiry/cancellation/key recheck; before/after commit failure; explicit v1 schema upgrade |
| 3 independent crypto cases | Node HKDF/AES-GCM reconstruction of the 96-byte payload; X25519 and Ed25519 public derivation; exact root/confirmation bytes; normalization and separately damaged sealed components |
| Generated durable ledger | 160 histories, seed 9162026, 1–30 commands, end-on-failure with no shrinking; retry, invalid proofs, foreign IDs, competing finalizations, abort, response loss, restart, cancellation, expiry, changed draft |
| Actual process death | Six SIGKILL cases: before/after begin, finalization and cancellation commit; each resumes in a new child process |
| Acceptance controls | Removing recovery proof or passkey verification actually accepts one-factor finalization; removing the client sealed-root check actually accepts a substituted authority root |
| Native browser | Disposable Chromium/virtual passkey, native WebCrypto and IndexedDB; generation/proof-write aborts; full browser restarts; re-entry and no redisplay; cross-tab owner exclusion; cancellation holds ownership until pending work settles; renderer crash before sending saved proof; lost service response; exact proof retry; changed owner context and unexpected finalization stage refuse |

The [control records](./2026-09-10-account-recovery/control-root.json) contain synthetic envelopes,
signatures, results and before/after state. The two one-factor controls each preserve baseline and mutant
records. None contains personal writing or the author's factors. The runner captures generated
counterexamples on failure; the final run has none.

Two harness corrections preceded this result. Seed 9162026, path 36 initially produced
`bad-passkey, changed-draft, expire, expire, foreign-id, bad-code-proof, concurrent`: the expected ledger
incorrectly recorded expiry even when the foreign-ID gate refused first. The implementation retained
an open row until a matching request checked its deadline. The ledger now represents that lazy write.
The expanded browser test initially reached its 40-second deadline while awaiting Chromium's `Page.crash`
command response. It now observes the crash event and closes the crashed page before awaiting the interrupted
operation. These were test defects; the generated campaign did not discover a production defect in this slice.
The raw preliminary outputs were returned by the tool, not saved as complete campaign artifacts.

The [account-core regression](./2026-09-10-account-recovery/core-regression/summary.json) also passes
all **30 tests** at the new schema: 240 generated histories, ten SIGKILL cases, virtual authenticator and
HTTP boundaries, its three acceptance controls and the competing-process confirmation regression.
Its updated control-copy layout includes the new shared protocol dependency; the unknown-schema negative
now uses version 999 because version 2 is this phase's supported layout.

All **825 existing unit tests in 73 files** pass (34.93 seconds).
[Static checks](./2026-09-10-account-recovery/static-checks.json) and
[final gates](./2026-09-10-account-recovery/final-gates.json) record TypeScript, lint, formatting,
the isolated application build's 327.3/350 kB budget and origin isolation, and governance/traceability.
The build is isolated under the earlier run's `app-build` directory; the personal `dist/` and verified
`.dev/releases/17d87c2/app` are untouched. The complete `pnpm check` chain was not run; no debt or matrix
status changed. Evidence hashes are in the [manifest](./2026-09-10-account-recovery/manifest.json).

This closes only the private recovery preparation boundary. Accounts remain pending; the trusted-root
and promotion owner must still authenticate the exact Local context, recovery state, wraps, genesis and
index handoff. There is no account UI, activation, relay, real passkey ceremony or personal-factor change.
The personal preview and legacy relay remain stopped. Full recovery/enrollment/rotation, service backup
rollback, power-loss certification, wider browser support, residue and independent review remain open.
