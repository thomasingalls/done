---
schema: 1
kind: finding
id: f-9b49b74-wasm-glue-key-nonce-lengths
status: repaired
type: implementation-hazard
severity: medium
confidence: high
introduced_by: 9b49b743cb03cb8827682d79fc66405f458cf29b
work_item: B-02
created_by: /root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# `JournalSeal.seal` accepts wrong-sized keys and nonces and reuses stale static-buffer bytes

## Affected requirement or guarantee

TRD §15 row 2 and the original crash-journal contract require XChaCha20-Poly1305 under a 32-byte derived key with
a fresh random 24-byte nonce per record. Nonce repetition under one key violates the construction's load-bearing
stateless safety argument.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§6.1, 10.10, 12 and 15 row 2 require a crash-safe
synchronous AEAD and nonce discipline. `docs/review/analysis/original-contract.md` records this as `OC-025`.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:wasm/journal-seal/seal.generated.ts` exposes
`seal(key: Uint8Array, nonce: Uint8Array, ...)` but checks only AAD and plaintext maxima before `memory.set`.
`9edd9300adebcec3abd2234c946f1dcccdc17eef:wasm/journal-seal/src/lib.rs` reads fixed 32-byte `KEY` and 24-byte
`NONCE` static buffers and cannot see the JavaScript inputs' actual widths.

## First introduction and propagation

Introduced with the wrapper at `9b49b743cb03cb8827682d79fc66405f458cf29b`. The same generated glue survives
to the pinned tip and is named as the shipping row-1 provider by `83fe22cf0e4561de0770df147ae994c3168a73e8`.

## Reachable consequence

A future internal caller that supplies a short key or nonce receives ciphertext rather than a refusal. The missing
tail remains from an earlier call in the same WASM instance. An empty nonce can therefore repeat the entire previous
nonce under the same key; the selected AEAD's confidentiality/integrity argument then fails. A wrong key can also
produce a journal record that the normal derived key cannot reopen after a crash. The pinned app does not yet import
the module, so this is an integration hazard rather than a currently exposed attacker-controlled path.

## Supporting evidence

In a disposable archive of exact commit `9b49b743cb03cb8827682d79fc66405f458cf29b`, Node `v26.7.0` accepted an
empty key after a 32-byte key and produced the identical ciphertext/tag, while a fresh instance with an empty key
produced different bytes. It also accepted an empty nonce after a 24-byte nonce and reproduced the identical
ciphertext/tag under the same key and plaintext. The committed eight-check verifier tests AAD/plaintext lengths but
contains no key/nonce length negative.

## Counterevidence and disconfirmation attempt

The benchmark caller constructs `new Uint8Array(24)` through `crypto.getRandomValues` and passes a derived 32-byte
key, so the current evidence path does not trigger the defect. TypeScript's `Uint8Array` type does not encode either
fixed width, and no integrated application caller exists to make that convention an enforced invariant. Oversize
values can also write past their static buffers; the exact consequence depends on linker layout.

## Validation procedure

Against the exact generated artifact, call `seal` once with a 32-byte key/24-byte nonce and then again with the same
plaintext but an empty key or nonce. Confirm the call does not throw and compare outputs. Add negatives requiring
all key lengths other than 32 and nonce lengths other than 24 to throw before touching WASM memory.

## Disposition

Fix: enforce `key.length === 32` and `nonce.length === 24` in generated glue, exercise both short and long inputs,
and retain the Rust-side AAD/plaintext bounds as defense in depth.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by `check-wasm-seal.mjs`,
the 15-check battery over the exact generated artifact.
