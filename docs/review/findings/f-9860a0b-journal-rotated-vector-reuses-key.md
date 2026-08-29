---
schema: 1
kind: finding
id: f-9860a0b-journal-rotated-vector-reuses-key
status: repaired
type: evidence-weakness
severity: medium
confidence: high
introduced_by: 9860a0bc1611b01eac76abcc5584afc51f5ed959
work_item: B-04
created_by: /root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# `The rotated-generation journal vector changes gen but derives from the same K_g as generation 1`

## Affected requirement or guarantee

The synchronous journal record carries a clear generation so replay selects the matching generation-specific
`K_g`, derives `K_journal`, and opens the entry. Rotation must exclude holders of an old generation from future
content, including pending journal writes.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§6.1, 13.2, and 15 row 2 require a
domain-separated journal subkey, a per-record generation, crash-safe nonce discipline, and vectors (`OC-025`,
`OC-029`, `OC-064`).

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef:scripts/generate-journal-vectors.mjs`, one global `KG` is used for
every case. The `rotated-generation` case changes only `gen` from 1 to 2, and the main loop still calls
`deriveJournalKey(KG, workspace)`. The emitted generation-1 and generation-2 vectors therefore contain identical
`k_g` and `k_journal` values. This remains unchanged from the first generator.

## First introduction and propagation

`9860a0bc1611b01eac76abcc5584afc51f5ed959` selects XChaCha20-Poly1305 and introduces the generator. Its
selection §3 correctly says `gen` selects which generation-specific `K_g` replay derives from, but the supposedly
rotated case uses the same fixture key. Later commits strengthen isolated AAD negatives and replace the shipping
cipher implementation, yet retain the same rotated-generation inputs through the pinned tip.

## Reachable consequence

The vector suite cannot distinguish a correct implementation from one that ignores the generation during key lookup
and keeps deriving journal keys from the old `K_g`. Such an implementation can make post-rotation pending writes
readable to a holder of the old generation, defeating forward exclusion; conversely, a correct replay choosing the
new `K_g` would fail to open a record wrongly sealed under the old one and could lose crash-journal data.

## Supporting evidence

At `9860a0b:scripts/generate-journal-vectors.mjs` lines 69–78, the construction explicitly says the record's `gen`
selects which `K_g` to derive from. Lines 132–169 define one `KG` and a case whose only generation-related change is
`gen: 2`; lines 251–278 derive and emit every case from the global `KG`. The checked-in vector confirms that
`keystroke-update` and `rotated-generation` have the same `k_g` and `k_journal`. The existing `wrong-generation`
negative changes AAD only; it does not test generation-key selection.

## Counterevidence and disconfirmation attempt

The current vector genuinely proves that the clear `gen` header is authenticated: replaying gen 1 as gen 2 fails.
That is its stated `why`, so it is not a false vector. I tested whether any other case or negative independently
proves key-generation lookup; none supplies a second generation key. The defect is missing coverage of a distinct
load-path invariant, not invalid ciphertext or a broken XChaCha primitive KAT.

## Validation procedure

1. Give the rotated case a distinct fixed `K_g2` and assert its `K_journal` differs from generation 1.
2. Add a negative that attempts to open the gen-2 record with the gen-1 derived journal key while keeping all AAD
   fields unchanged.
3. Add a replay fixture whose generation map contains both keys and mutation-test lookup that always returns gen 1.
4. Run the generator against both the original and shipping implementations.

## Disposition

Fix the vector fixtures and test generation-key lookup independently from AAD generation binding.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by `wrong-generation-key`
(journal vectors).
