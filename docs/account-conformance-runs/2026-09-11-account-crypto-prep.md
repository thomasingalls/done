# Account crypto-contract prep — 2026-09-11

**Result: bounded prep complete; F-05/F-06 remain open.** Runtime baseline is `2ba50aa`, which committed
fresh first activation. This phase changes docs, a source-inventory checker, focused probes and package
commands. It does not change runtime cryptography, the historical authority map or published recovery vectors.

[Contract and ordered follow-ups](../account-crypto-prep.md),
[machine results](./2026-09-11-account-crypto-prep/summary.json),
[executed source pins](./2026-09-11-account-crypto-prep/sources.json),
[probe output](./2026-09-11-account-crypto-prep/contract-probes.json),
[focused test log](./2026-09-11-account-crypto-prep/focused.log) and
[JUnit](./2026-09-11-account-crypto-prep/focused.xml).

The census matches 157 production TS/TSX sources and 89 labels/templates classified into 22 groups.
Six manual entrypoints and the scanner's stated limitations remain explicit. Six focused tests pass,
including 300 seeded shrinking-enabled generated scanner cases (seed `5110911`). The negative controls
remove a classification, duplicate it, retain a stale label, remove template resolution, change an
unlabelled primitive and add a new production source. Each triggers the corresponding inventory failure.
These are inventory controls, not a complete mutation audit of Account cryptography.

An independent Node encoder, driven by the reviewed field-order schema rather than production parsers,
matches candidate, origin request, epoch, offer, receipt-v2 and activation-context messages. All six
signatures verify independently; reversed nested input-property order preserves the bytes. The probe
also checks request/completion hashes, the domain-wrapped epoch head and WebAuthn nonce. Changing an
included nested offer signature invalidates the receipt signature. These random synthetic fixtures are
**not fixed interoperable vectors or exhaustive field negatives**; those remain phase A.

The genesis probe records both head-vector digests: empty is
`f472f85be176aa75e6acb88c4ed194815fba51d39f1d64b7afa04576ad99e475`; the fixture's explicit
member/position-zero entry is
`b7fc8fd676e0cd222bb19a7abb9a713f815f2903cac0996d3825f56a485e4121`. Current runtime uses only the former.
The selected ruling is limited to first genesis, with the corresponding normative amendments still owed.

Independent HKDF/AES-GCM decryption reproduces the old published 48-byte ciphertext as a 32-byte scalar.
It opens the runtime's 112-byte ciphertext into the 96-byte scalar/root/bootstrap payload, derives both
public keys independently and verifies the sealed root and envelope/state/draft digest chain. Current
parsing refuses the old length. No generated code or private key bytes are written into these artifacts.
The synthetic service fixture supplies dummy checkpoint content, so this probe makes no new claim about
Yjs coverage, browser custody, semantic admission or native crash behavior.

The unchanged authority-map check passes for its **eight existing swept documents**. All 19 commands
in the existing vector-currentness/coverage chain pass. That includes the historically correct generator
output for the old recovery payload; passing it does not resolve F-06. Targeted lint and code/JSON format
checks pass. Exact commands, exit codes and individual logs are in the summary. The global/system and
cached pnpm launchers both stalled before script output and were stopped; validation used the installed
Node executables and the checked package script bodies. Do not report a successful pnpm invocation.
After validation, the byte-contract prose was clarified to say printable ASCII and distinguish the field-order
schema from a complete predicate validator. The summary and [exact documentation delta](./2026-09-11-account-crypto-prep/first-authority-doc-clarification.patch)
preserve that change; no executable input changed after validation.

No full unit, native browser, build or historical `pnpm check` campaign was repeated for this prep-only
change. No personal server/browser/factor, Account authority or deployment was started. All 21 personal
package hashes, the historical review hash and L-2 remain unchanged. Two unrelated root files (`done `
and `reviewpacket96a20401ceb88d.md`) appeared during the turn and were left untouched.

Next is **phase A: exact first-authority formats, mapped dependencies and published vectors**. Recovery,
transport and custody/ledger groups follow separately. The prep and this evidence remain uncommitted.
