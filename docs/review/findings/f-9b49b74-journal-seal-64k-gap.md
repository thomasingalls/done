---
schema: 1
kind: finding
id: f-9b49b74-journal-seal-64k-gap
status: candidate
type: contradiction
severity: medium
confidence: high
introduced_by: 9b49b743cb03cb8827682d79fc66405f458cf29b
work_item: X-02
created_by: /root
updated: 2026-08-21
challenged_by: none
superseded_by: none
---

# `The selected synchronous seal rejects updates above 64 KiB without a write state that preserves the journal-before-return guarantee`

## Affected requirement or guarantee

Every Yjs update must be written synchronously to the encrypted crash journal before the update handler returns, so
a page kill before the asynchronous IndexedDB commit cannot lose accepted local work (`OC-025`).

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§6.1 and 10.10, together with
`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §7.1, preserve the existing synchronous write-ahead-log
contract for every update and do not impose an update-size ceiling.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, `wasm/journal-seal/src/lib.rs` fixes
`MAX_PLAINTEXT = 65536`, while `wasm/journal-seal/seal.generated.ts` throws `RangeError` above it. The Rust source
simultaneously says the buffer is not intended to decide what a journal record may hold. `docs/TRD.md` §6.1 and
`docs/selections/row-2-journal-aead.md` still require every update to be sealed synchronously, and select neither
chunking, a larger carrier, nor refusal before the Yjs mutation.

## First introduction and propagation

`9b49b743cb03cb8827682d79fc66405f458cf29b` introduces the fixed-buffer WASM seal to close the measured 4 kB
latency breach. Later commits propagate it as the shipping row-1/row-2 provider and verify both sides of its length
guard, but no later commit defines application behavior at the guard. The pinned application does not yet integrate
the encrypted journal, so the defect remains a Stage-1 construction gap rather than a shipped encrypted-store bug.

## Reachable consequence

A paste, bulk maintenance operation, or future import can produce one Yjs update larger than 65,536 bytes. The seal
then throws after the Yjs transaction has already produced the update. If Stage 1 follows the predecessor's current
error policy—report the journal failure but continue to the asynchronous batch—a page kill in that window loses the
only uncommitted copy. Propagating the exception does not by itself roll back the already-applied CRDT transaction.

## Supporting evidence

The exact pinned WASM checker passes because it deliberately asserts that 65,536 bytes seals and 65,537 refuses; the
limit is therefore real, reproducible behavior rather than a stale-source inference. The row-2 selection measures 18
bytes, 419 bytes, and 4 kB and explicitly leaves oversize behavior to Stage 1. The product requirements permit
arbitrary card text and maintenance/import operations and define no 64 KiB authoring cap.

## Counterevidence and disconfirmation attempt

The common keystroke update is about 18 bytes and the largest measured case is 4 kB, so ordinary typing is far from
the boundary. A caller could also split or reframe a large update, grow the static buffer, or reject the operation
before mutating the document. Each is a valid future resolution, but each changes either the journal carrier, the
WASM artifact, or the product write path; none follows from the current selection. The explicit guard proves this is
not merely hypothetical module failure.

## Validation procedure

1. Produce Yjs updates of 65,536 and 65,537 bytes through the actual editor and system-operation paths.
2. Kill the page after the CRDT transaction, after seal/framing, after `localStorage.setItem`, and before/after the
   IndexedDB transaction completes.
3. Assert the larger operation is either refused before mutation or represented by a synchronously durable,
   authenticated journal carrier that replay reconstructs exactly once.
4. Mutation-test removal of the chosen size gate or chunk/reassembly step.

## Disposition

Reopen before Stage 1 integrates the seal. Select an explicit oversize write state and test it on the same page-kill
schedule as ordinary journal entries.
