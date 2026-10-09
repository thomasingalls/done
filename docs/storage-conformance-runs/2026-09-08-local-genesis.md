# Verified Local genesis — execution evidence, 2026-09-08

The phase-eight startup checkpoint was committed as **a916d61**. This phase's final runs use that HEAD
plus the recorded dirty source hashes. The [guide](../local-genesis.md) defines the bounded production
API, creation stages, progress authenticator and limitations. This is evidence for the first Local
workspace per fresh slot, not completion of the full conformance matrix or any release/debt payment.

| Execution | Cases | Assertions | Mutants detected | Saved report |
| --- | --- | --- | --- | --- |
| Local genesis | 17 | 160 | 4 | [JSON](./2026-09-08-local-genesis.json) |
| Owned startup regression | 15 | 96 | 3 | [JSON](./2026-09-08-genesis-startup-regression.json) |
| Custody regression | 13 | 73 | 5 | [JSON](./2026-09-08-genesis-custody-regression.json) |
| Content regression | 13 | 58 | 5 | [JSON](./2026-09-08-genesis-content-regression.json) |

Every execution exits zero; expected mutant failures count only when the named baseline assertion passes
and that mutant fails it. Final genesis output is `test-results/local-genesis/verified-final/report.json`; the other
raw outputs are `test-results/owned-startup/genesis-verified-final/report.json` and
`test-results/{custody,content}/genesis-final/report.json`. Saved JSON is
format-normalized with parsed equality checked against those outputs. Production/harness hashes are
checked against the final files. The first browser pass also passed; the final run follows input and
progress-transition validation tightening and an explicit refusal for an undefined-valued retained witness. One unit fixture initially used an invalid human actor color;
correcting that fixture enabled the actual admitted-initialization path.

## What ran

No-op creation/identity checkers are absent from the new genesis path. The real owner generates Local
identity, confirms its factor, atomically adds the immutable claim and first custody, authenticates each
retained stage, initializes the encrypted carrier and installs its index. Startup then uses the real
Local factor verifier and existing replay/admission barrier before CodeMirror construction. The receive
checker remains a fixture seam; these cases do not test Account authorization or transport delivery.

G03–G11 hold the native transaction-completion callback after actual commit, at: atomic claim, custody
reservation, protected custody, content progress, creating witness, initial counter, ready witness, ready
progress and final index. Another tab queues a resumer. The runner kills the renderer without graceful
close, then checks the waiting resumer completes with the **same signed initial identity set**, opens,
admits an edit, and recovers it offline after a second renderer death. These schedules exercise specific
durable boundaries, not every possible instruction, process topology or storage failure.

Other cases check no persistence before correct confirmation; two creators with different codes and one
winner; wrong-code refusal followed by winner-code success; request-success/transaction-abort at the
atomic claim and index; cancellation/drain during native crypto; missing completed content plus removed
index/witness; missing live custody; damaged progress MAC; unknown array-suffix controls; independent and
closed slots; and legacy index writers waiting for a live shared owner before refusing Local mutation.
Production enumeration is disabled; the fixture alone retains native enumeration for before/after
inventory oracles. The new browser suite deliberately does not install identity or routing by hand.

The four mutants omit confirmation, disregard completed progress on missing content, skip progress
authentication, or allow the legacy writer to close a Local slot. All are detected. Earlier custody and
content mutation batteries still detect their respective crypto, reservation and completion regressions.

## Validation and limits

Full Vitest passes **649 tests / 53 files**, including 15 new real-crypto/fake-IDB Local tests. The unit
LockManager is an immediate-grant wiring double; real exclusion evidence comes from the browser runs.
Typecheck, focused lint/format, production build, budget/origin isolation, the sixteen vector generators,
AAD coverage, WASM verification and applicable contract/governance/traceability checks pass. Initial JS
remains **306.3 kB / 350.0 kB** gzipped. `storage:genesis` is in the check chain. The literal full chain,
geometry and separate unchanged journal/admission/editor/workspace/lifecycle browser suites were not rerun.

Host: Chromium 151.0.7922.34, Playwright 1.62.0, Node 26.8.1, Vite 8.1.5, macOS arm64. No supported-population,
low-end timing, native IME, power-loss, profile rollback/clone, forensic erasure or independent review claim
follows. The new progress MAC construction is documented for independent review. Its retained initial
factor seal is an additional opener reference the future clear/rotation owners must account for.

Default React startup/provider and real user data remain on the earlier store. Additional-workspace
registration, Account onboarding/verifier wiring, Local/Account promotion, migration/import, journal-inclusive
clear, exact trim, receiver/generation transitions and cutover remain separate obligations. The next bounded
phase is scoped Local clear with durable resumption and a terminal marker; this phase supplies no delete API.
