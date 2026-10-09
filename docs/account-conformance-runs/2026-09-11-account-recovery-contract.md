# Private recovery byte alignment — 2026-09-11

**Result: group B complete; F-12 export-format omission repaired.** First-authority group A was
committed as `43b42b1`. TRD §13.8, row 14, the recovery byte home and current generator/vectors now
agree with the existing 96-byte plaintext / 112-byte ciphertext. The only runtime change is checking
both private-key exports for exact PKCS#8 length and algorithm prefix before raw extraction.
No private wire version, signed message, service schema or personal Account state changed.

[Exact contract](../account-crypto/recovery-layout.md),
[current corpus](../../test/vectors/account-recovery.json),
[historical corpus provenance](../../test/vectors/historical/README.md),
[summary](./2026-09-11-account-recovery-contract/summary.json),
[source pins](./2026-09-11-account-recovery-contract/sources.json).

Final execution: `node scripts/account-recovery-contract/run.mjs`, Node v26.8.2, run
`test-results/account-recovery-contract/2026-09-11T14-49-46.059Z`. All **35 stages pass**, no timeout.
The package command is `pnpm account:recovery-contract`; the installed Node entry was used directly.
The summary records exact commands. Native tests received permission for a disposable loopback server
and synthetic Chromium profile. There was no sudo, personal server, deployment or real credential use.

| Evidence | Result |
| --- | --- |
| [Recovery construction tests](./2026-09-11-account-recovery-contract/formats.log) | Ten tests; 13 fixed constructions reproduce with independent Node/OpenSSL encodings and actual generator/opener, digest, challenge, signature and HPKE calls. Both published key pairs checked. |
| [Encoded bindings](./2026-09-11-account-recovery-contract/formats/encoded-bindings.json) | 64 field substitutions and 64 omissions; ten signature checks and eight recovery AEAD refusals for valid wrong-encoded messages. These are primitive controls, not blanket composite-verifier bypass claims. |
| [Authentic payload refusals](./2026-09-11-account-recovery-contract/formats/payload-refusals.json) | Wrong private/public pairs, sealed roots, scope, segment order/length, versions and ciphertext bindings refuse before releasing keys. Wrong code and confirmation-purpose/scope cases also pass. |
| [Production guard controls](./2026-09-11-account-recovery-contract/formats/production-guard-controls.json) | Removing each context, sealed-root, X25519-pair or bootstrap-pair check from a disposable source copy rescues its authentic counterexample. No production file is edited by the controls. |
| [Export defect before repair](./2026-09-11-account-recovery-contract/pkcs8-before.log) | Changing the X25519 export OID unexpectedly succeeded with the original suffix-only extraction. The repair refuses wrong OID, prefix, truncated prefix and extra bytes for each key (eight cases), performs no seal and clears exported buffers. Omitting the assertion recreates all eight acceptances. |
| [New generated checks](./2026-09-11-account-recovery-contract/formats/properties.json) | 200 cases, seed 5110913, shrinking enabled: root/scope, normalization and authentic payload segment faults. No additional runtime defect found. |
| [Native/service recovery regressions](./2026-09-11-account-recovery-contract/recovery-regressions.log) | All 25 tests, including 160 independent-ledger histories, two-proof controls, browser restart/renderer death, IDB aborts, owner exclusion and six real service SIGKILL cases. |
| [HPKE regressions](./2026-09-11-account-recovery-contract/genesis-crypto.log) | Published AES-256 generation wrap opens in runtime and independent oracle; 100 generated seals, changed info/ciphertext and low-order recipients checked. |
| [First authority](./2026-09-11-account-recovery-contract/first-authority.log) | Retained 17 fixed vectors, 399 input negatives, 333 encoded omissions, six production omissions and 200 reorderings pass. Original vector bytes unchanged. |
| [Registry](./2026-09-11-account-recovery-contract/registry.log) | Existing 19 omission controls plus seven new corpus/phase/primitive/factor controls pass. Missing negative data fails even after updating its vector hash. |
| [Map](./2026-09-11-account-recovery-contract/authority.log) | 45 entries, 53 chains, ten swept documents; 23 specified records, 13 explicitly open records, one non-crypto exclusion. |
| [Full unit suite](./2026-09-11-account-recovery-contract/unit.log) | All 980 tests in 87 files pass. Typecheck, 12 admission-core tests (80 histories), 28 slot-verifier tests and prep probes pass. |
| Current vectors / tooling | All 21 vector commands pass, including the retained 225-field AAD isolation audit, row-14 normalization/encoding/step-up evidence, and targeted lint/format checks. |

The strict current reader continues to refuse historical scalar-only ciphertext. Row 14's primary seal
now equals the separately reconstructed current corpus; the second-principal seal and every normalization
positive also open in the runtime. Test secrets and HPKE sender randomness are fixed only in synthetic
fixtures. Independent construction code does not mean independent underlying cryptographic libraries.
The service proof/retry hash rules are also checked; their broader ledger uses remain group D.

F-12 is a low-severity portability/correctness omission: export bytes originate in WebCrypto, not in an
attacker-supplied PKCS#8 file. No exploitation of the pinned provider was demonstrated. The new format
assertion fails before the owner can retain a malformed draft. Source buffers are cleared; this does not
promise erasure of all provider/JavaScript copies.

The first bounded run stopped at sandbox `listen EPERM`; all non-native cases in that stage passed.
The next run (`14-46-24.486Z`) passed all 32 then-configured stages. Inspection found generic historical
evidence filenames could overwrite earlier stages' auxiliary JSON. The runner now gives each stage its
own evidence directory and suppresses optional unit-suite evidence dumping; the final 35-stage run
separates first-authority, registry, prep and recovery reports. Intermediate runs remain in test-results.
The before-repair log predates test formatting; current deliberate omission controls reproduce its result.

The recovery recipient bridge is complete; checkpoint/startup qualification remains explicitly group D.
One-seal/fresh-sender disciplines still depend on nonrepeating randomness across restores/clones. Group C
is next: envelope/submission/read/response/service-witness bytes. F-05/F-06 remain open for the remaining
constructions. No total-loss recovery, replacement, enrollment, rotation, real Account or whole-protocol
qualification is implied. No full production build or historical aggregate was rerun; the native recovery
bundle was built in memory without touching the personal package.

All 21 personal package hashes, the historical review and L-2 remain unchanged. Personal preview/relay
remain stopped; unrelated root files remain untouched. Source pins match the final tested inputs.
This evidence report and progress/completed narrative were written afterward. New group B work is uncommitted.
