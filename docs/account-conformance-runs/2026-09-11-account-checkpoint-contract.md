# Account genesis checkpoint and persisted startup — 2026-09-11

**D7 complete; new work remains unstaged/uncommitted.** D6 was committed unsigned as `3585a1b`.
The existing reminder now includes all seven unsigned C/D1–D6 commits. D7 changes contracts,
conformance tests and registration only; production code and valid stored formats are unchanged.

[Contract](../account-crypto/checkpoint.md), [vectors](../../test/vectors/account-checkpoint.json),
[summary](./2026-09-11-account-checkpoint-contract/summary.json),
[source pins](./2026-09-11-account-checkpoint-contract/sources.json),
[preservation](./2026-09-11-account-checkpoint-contract/preservation.json),
[patch](./2026-09-11-account-checkpoint-contract/working.patch),
[manifest](./2026-09-11-account-checkpoint-contract/patch.json).

Execution: `node scripts/account-checkpoint-contract/run.mjs`, Node v26.8.2,
`test-results/account-checkpoint-contract/2026-09-11T19-19-00.561Z`.
Started 2026-09-11T19:19:00.661Z; completed 2026-09-11T19:22:48.813Z.
All **49 stages pass**, with no timeout and **849 matching source pins** after execution.
The package command is `pnpm account:checkpoint-contract`. Native bundles use Vite `write:false`,
disposable Chromium contexts and synthetic loopback Account servers. No personal package/server or
real Account, factor, operator secret or pin is used.

The inherited row-7 cipher agrees exactly with both current helpers and the independent encoder.
Its generation 3 / epoch 9 / `ws_...` identifier are outside the current genesis-only parser, and its
plaintext is descriptive prose, not a Yjs update. This is cipher agreement, not a future-checkpoint
startup receipt. Manifest/admission v2 and cipher/AAD v1 remain unchanged. Current startup rederives
checkpoint coverage and requires genesis already present in recovered database/journal; successful
AEAD decryption does not replace service, member, factor, passkey, scope or replay checks.

| Evidence | Result |
| --- | --- |
| [Fixed bytes](./2026-09-11-account-checkpoint-contract/checkpoint-contract/fixed.json) | Six independent KDF/AEAD cases, including current genesis shape, inherited cipher and decimal helper framing. Private KDF helper and protocol AAD agree; non-extractable key usages checked. |
| [Bindings](./2026-09-11-account-checkpoint-contract/checkpoint-contract/bindings.json) | 48 discriminating KDF/AAD/cipher/salt/nonce/tag checks and 15 encoded-field omission witnesses. |
| [Parser](./2026-09-11-account-checkpoint-contract/checkpoint-contract/parser.json) | 44 counted field/version/width/shape/size refusals, plus protocol non-ASCII rejection. Current generation/epoch/cipher version are fixed at 1; plaintext bound 16 MiB. |
| [Cipher properties](./2026-09-11-account-checkpoint-contract/checkpoint-contract/cipher-properties.json) | 250 shrinking-enabled histories, seed 5110930, match Node/OpenSSL and reject changed salt/epoch. No counterexample. |
| [Replay properties](./2026-09-11-account-checkpoint-contract/checkpoint-contract/replay-properties.json) | 200 shrinking-enabled histories, seed 5110931: deletion changes DS with identical SV; reordered updates converge; missing dependency cannot become a checkpoint; containment does not repair the original document. No counterexample. |
| [Source omissions](./2026-09-11-account-checkpoint-contract/checkpoint-contract/source-controls.json) | Seven actual source controls omit both KDF-info components or each of the five AAD fields. Real crypto remains operative and independent bytes/refusal detect every omission. |
| [Native bytes](./2026-09-11-account-checkpoint-contract/checkpoint-native/native-bytes.json) | Actual producer seal independently reconstructed from synthetic factor-opened custody; retained retry seals once. Offline startup uses exact decrypt-only KDF/AAD and no storage writes. Removing startup workspace from KDF refuses otherwise valid state. Observed checkpoint buffers clear on return. |
| [Native data loss](./2026-09-11-account-checkpoint-contract/checkpoint-native/native-coverage.json) | Removing the actual journal refuses selected startup; erasing database/journal refuses active startup. Omitting each coverage check really accepts the damaged carrier. Later editor text survives cold reopen. Refusals leave storage unchanged and clear observed checkpoint plaintext. |
| [Native authority](./2026-09-11-account-checkpoint-contract/checkpoint-native/native-authority.json) | Five local-MAC-authenticated alterations to receipt/candidate/salt/nonce/ciphertext refuse before checkpoint decryption; a changed valid-shaped authority pin refuses. Original restored carrier classifies. |
| [Native properties](./2026-09-11-account-checkpoint-contract/checkpoint-native/native-properties.json) | 24 shrinking-enabled fresh scopes, seed 5110932, cold-replay generated insertions/deletions/orderings, refuse missing admitted journal and succeed after restoration. No counterexample. |
| [Genesis regressions](./2026-09-11-account-checkpoint-contract/genesis-regressions.log) and [handoff regressions](./2026-09-11-account-checkpoint-contract/handoff-regressions.log) | Existing genuine-signature/wrong-snapshot/wrong-wrap, interrupted commit, renderer restart, assertion, index, provenance, cancellation and generated native checks pass. Their historical generated tests retain their existing settings; the new D7 properties explicitly enable shrinking. |
| [Registry controls](./2026-09-11-account-checkpoint-contract/registry/checkpoint-registry-controls.json) | Six new omission controls require inherited bytes, native startup, bounded genesis disposition, shrinking replay and encoded omission evidence, including a changed corpus with its aggregate pin refreshed. |
| [Units](./2026-09-11-account-checkpoint-contract/unit.log) and tools | 983 unit tests in 88 files, typecheck, earlier A/B/C/D1–D6 byte contracts, 29 vector commands, authority map, census, lint and formatting pass. D7 adds six helper tests and four native tests. |

The independent encoder imports no production byte builders. Node/OpenSSL and browser WebCrypto may
share underlying primitives; this is independent byte reconstruction, not an independent cryptographic
implementation. The seven helper controls and three native controls are explicit source transformations
with unique-anchor assertions; no production source file is changed. Test-only export access to the
private checkpoint-key helper does not widen the shipped API.

Early harness corrections were not production findings: the first changed-epoch property accidentally
resealed with the changed AAD instead of retaining the original ciphertext; the native coverage test
initially expected a different refusal message. Both checks were corrected and rerun. No runtime
counterexample was found in this bounded phase. Native renderer death and logical buffer clearing do
not establish power-loss persistence or whole-profile erasure. The per-seal randomness and restore/clone
assumptions remain explicit.

Two constructions replace `remaining-genesis-checkpoint`: **74 specified, one open, one exclusion**.
The map has 77 entries, 96 permitted-root chains and 18 swept homes; the runtime census is unchanged
at 158 sources and 89 labels/templates. Service receipt/routing authority remains a bounded availability
entry, separate from factor/client content authority. F-05/F-06 and F-15 remain open.

All 21 personal package hashes, 29 prior tracked vector files, production code, historical review and
L-2 are preserved. Unrelated root files remain untouched. All 171 raw campaign files are copied
exactly and listed in [the raw manifest](./2026-09-11-account-checkpoint-contract/raw-files.json).
The next bounded phase is **D8: disposition of the remaining Local/migration provenance group**:
identify live Account dependencies versus legacy-only carriers, bridge what is required and preserve
explicit exclusions/limits. This does not restart migration tooling, onboarding or deployment work.
