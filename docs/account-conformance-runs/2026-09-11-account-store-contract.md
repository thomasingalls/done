# Inherited store and synchronous journal byte bridges — 2026-09-11

**Result: D5 complete; new work remains unstaged/uncommitted.** D4 was committed unsigned as
`837cd14` and added to the existing signing reminder with C `d098bd4`, D1 `d24ca66`, D2 `1897848`
and D3 `24bc3a4`. No production code, valid stored format or personal installation changed.

[Contract](../account-crypto/store-journal.md), [vectors](../../test/vectors/account-store.json),
[summary](./2026-09-11-account-store-contract/summary.json),
[source pins](./2026-09-11-account-store-contract/sources.json),
[preservation](./2026-09-11-account-store-contract/preservation.json),
[patch](./2026-09-11-account-store-contract/working.patch),
[patch manifest](./2026-09-11-account-store-contract/patch.json).

Final execution: `node scripts/account-store-contract/run.mjs`, Node v26.8.2,
`test-results/account-store-contract/2026-09-11T18-23-08.071Z`, 18:23:08–18:24:44 UTC.
All **46 stages pass**, without timeout, with **823 matching input pins** after execution.
The package entry is `pnpm account:store-contract`. Browser profiles and loopback servers are disposable;
the new bundles use Vite write:false. The personal package was not rebuilt or served.

The current store/journal byte construction agrees with inherited vectors. D5 corrects a documentation
overclaim, not a runtime defect: row 2 called random nonce safety unconditional. Its corrected section
states the finite-use collision bound and fresh-randomness assumption, and explains that flushing entries
does not reset lifetime invocations. The affected authority entry was reread and repinned. General
rotation, profile branching/restore, whole-WASM provenance and F-15's power-loss accounting remain open.

| Evidence | Result |
| --- | --- |
| [Fixed bytes](./2026-09-11-account-store-contract/store-contract/fixed.json) | Eleven independent cases: two store names, store and journal KDFs, four record kinds and three journal generation headers. Actual WebCrypto and shipped WASM reproduce exact bytes. Name/KDF substitutions also execute the real helpers. |
| [Inherited bridge](./2026-09-11-account-store-contract/store-contract/inherited.json) | All six row-3 stored-record cases and four row-2 journal cases agree with the independent oracle and current runtime. Inherited key-envelope cases remain outside D5. Both vector files are unchanged. |
| [AAD bindings](./2026-09-11-account-store-contract/store-contract/bindings.json) | All 44 field mutations reject under held keys. Forty-four encoded omission witnesses show the binding disappears when that field is removed while real AES/WASM authentication stays operative. These are distinct from source mutants. |
| [Parser boundaries](./2026-09-11-account-store-contract/store-contract/parsers.json) | 25 counted malformed shape/framing cases refuse, with additional nonce/tag/generation/placement, maximum-size and Unicode checks. A source control admits noncanonical base64 padding bits. Raw record buffers are detached. Custody rejects malformed Unicode before store-name derivation; the low-level name helper itself aliases lone surrogates with U+FFFD. |
| [Generated histories](./2026-09-11-account-store-contract/store-contract/properties.json) | 160 histories, seed 5110919, 1,195 steps, shrinking enabled; no counterexample and no shrink. Unicode scope, four record kinds, generation headers, writer/ordinal identities, cold codec reopening and tampering agree with independent bytes. This is a byte model, not production rotation or concurrent-lifecycle qualification. |
| [Source controls](./2026-09-11-account-store-contract/store-contract/source-controls.json) | Six real source omissions remove record principal/sequence/kind or journal workspace/generation/storage identity. The weakened paths accept changed inputs while baseline refuses; crypto results are not forced true. |
| [Native bytes](./2026-09-11-account-store-contract/store-native/native-bytes.json) | Actual factor-opened store/journal KDF calls match independent info/key bytes and native usages. Four raw records and three raw journal entries decrypt to the exact supplied plaintext. Cold reopening preserves bytes; a new writer resets its ordinal without reusing identity; flush retains all seven exact plaintexts and removes committed journal entries. |
| [Native refusal](./2026-09-11-account-store-contract/store-native/native-refusals.json) | Eight changed fields refuse: record sequence, generation, kind, nonce and tag, plus copied journal writer, ordinal and store identity. Failed recovery preserves the carriers; restoring the original bytes permits recovery. |
| [Native KDF control](./2026-09-11-account-store-contract/store-native/native-control.json) | Removing storeId from the actual custody KDF still allows its own encrypted records to round-trip. Independent raw-byte validation detects the defect. Together with the six helper binding omissions and base64 control, eight new source changes have effective detection evidence. |
| [Inherited content](./2026-09-11-account-store-contract/content-native/native/report.md) | Two directed native cases pass: unreadable/placement refusal and cold byte replay. The unreadable-record source mutant is detected. |
| [Inherited journal](./2026-09-11-account-store-contract/journal-native/native/report.md) | Six directed native cases pass: synchronous renderer-crash recovery, unreadable journal, aborted flush, handoff race, close/disposal and concurrent writers. Four corresponding source mutants are detected: omitted append, premature cleanup, journal reread after content and omitted WASM disposal. A reported mutant-case failure is the expected detection result. |
| [WASM bridge](./2026-09-11-account-store-contract/wasm-bridge.log) | All 28 existing checks pass: published KAT, composition bytes, tag refusal, disposal, length/width guards and source-to-generated-blob hash agreement. No Rust rebuild or new provenance attestation. |
| [Registry](./2026-09-11-account-store-contract/registry/store-registry-controls.json) | Eight new controls enforce native/inherited evidence, AEAD authority, digest role, KDF source, owner entrypoint and negative/omission corpora even after updating aggregate hashes. |
| [Units](./2026-09-11-account-store-contract/unit.log) and tools | All 983 units in 88 files, typecheck, retained A/B/C/D1/D2/D3/D4 contracts, all 27 vector commands and targeted lint/format pass. |

Before the campaigns, the initial native test assumed every store derivation had encrypt permission.
Enrollment also legitimately derives a decrypt-only key; the fixture now checks each usage mode and
requires that the content owner also derives encrypt/decrypt. The first full campaign passed. Final
inspection then strengthened the native assertion from journal plaintext length to its complete bytes,
including all payloads after flush, and the complete final campaign was rerun. Earlier summary/pins and
native output are [preserved with the explanation](./2026-09-11-account-store-contract/preliminary/readme.json).
No production failure was concealed by either test refinement.

The independent byte oracle imports no production encoder/parser/KDF. Node/OpenSSL supplies AES/HKDF;
noble supplies XChaCha independently of RustCrypto WASM. This distinguishes byte reconstruction and
the XChaCha implementations, not every cryptographic dependency. The synthetic native fixture shares
D4's factor-custody setup and exercises real storage owners; it does not provision Account authority.

Four constructions replace the open shared-store record: **67 specified, three open, one exclusion**.
The map has 66 entries, 80 permitted-root chains and 16 swept documents. Runtime census remains
158 sources and 89 labels/templates. F-05/F-06 retain custody, checkpoint and provenance work.

All 21 personal package hashes, 27 prior tracked vector files, production sources, historical review,
L-2 and unrelated root files are preserved. The raw evidence manifest records every raw file and which
151 files were copied exactly. Duplicate frozen source trees are omitted from the document archive;
base-commit production sources, input pins, five targeted native mutant sources and reports are retained.
Next is **D6: inherited factor custody, key envelopes and v2 credential/metadata byte bridges**.
