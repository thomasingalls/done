# Private enrollment preparation — 2026-09-16

Built after signed product merge `d942cd1c`. This is focused backend product evidence. The release
campaign remains paused; these results do not enable account UI, service admission or content delivery.

| Check | Result |
| --- | --- |
| `node --test --test-timeout=30000 test/account-enrollment/*.test.mjs` | 39 passed; about five seconds |
| Account core/recovery/admission/activation and service delivery/inbound regressions | 108 passed |
| `node --test test/account-first-authority/registry.test.mjs` | 12 passed |
| `node node_modules/typescript/bin/tsc -b --noEmit` | passed |
| Scoped `oxlint --react-plugin` and `oxfmt --check` | passed |
| Runtime crypto census and construction inventory | matched; 78 specified, one new open qualification entry, one excluded, four inherited |

The new package command is `pnpm account:enrollment`. It runs just the focused Node suite with a
30-second per-test bound. Its HTTP fixture needs free localhost port 4999 and uses temporary databases
and an operator token. No personal profile, server, passkey or ciphertext store is used.

The 39 cases include independently encoded Node/OpenSSL proofs checked by the production WebAuthn
verifier for both supported algorithms; field/key substitutions; contradictory retained-state refusal;
request and retained-capacity bounds; exact retries; expiry; changed authority; cancellation; six real
SIGKILL cases around begin/finish/cancel commits; and a second process cancelling while the verifier
process is stopped after crypto. Existing-device writes and authenticated readback remain usable; a
prepared candidate cannot publish or read. Fixtures contain synthetic content for the content-blind
service, not a new-device Yjs replay or real successor lineage.

Generated tests use shrinking: 60 histories (seed 160902, up to 30 operations) against a separate state
ledger, plus 100 wrapping-key substitutions (seed 160901). No counterexample occurred. Effective
controls remove candidate possession or the final authority check from copied production sources and
must produce an independently verified signed preparation forbidden by the baseline. A parser crash,
timeout or unrelated failure does not satisfy these controls.

The affected regressions ran these 14 Node files: account-core/core, account-recovery/core,
account-admission/core, account-activation/{core,controls,restart},
account-service-delivery/{core,generated,controls,restart}, and
account-service-inbound/{core,generated,controls,restart}, all with `.test.mjs` suffixes. They passed
before the final enrollment-only result/retained-state consistency guard; the shared delivery/core/
authority/HTTP changes are identical. The complete focused enrollment suite then passed on the final
implementation. No wrapper or aggregate campaign ran. The production app bundle and deployment are
unchanged by this backend phase.

The runtime crypto inventory also reconciles source hashes from the already integrated product
branches. Its new enrollment record is **open for full construction qualification**, with exact private
byte documentation and focused tests attached; it has no invented historical vector or authority-map
credit. The existing aggregate audit will refuse that open entry until it is qualified. Frozen
release-validation manifests/snapshots and historical closure records have not been rewritten.

Raw logs are retained here as gzip files; `inputs.json` pins final implementation, test and contract
sources and generator seeds. `constructions.json` is the final static inventory result. Process tests
show application restart behavior, not filesystem power-loss or coordinated service-backup rollback
protection.
