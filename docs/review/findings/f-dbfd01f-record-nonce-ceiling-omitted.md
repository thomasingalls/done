---
schema: 1
kind: finding
id: f-dbfd01f-record-nonce-ceiling-omitted
status: validated
type: implementation-hazard
severity: low
confidence: high
introduced_by: dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9
work_item: B-04
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# `The normative record format carries a random-nonce budget but omits the rotate-before-write ceiling that enforces it`

## Affected requirement or guarantee

Encrypted content records use AES-256-GCM with random 96-bit nonces under a per-generation invocation budget. The
selection makes that conditional safety argument enforceable by requiring generation rotation before the next store
sequence would cross `2^32`.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§6.1 and 15 row 3 require individually decryptable,
order-independent authenticated records with a selected concrete format (`OC-024`, `OC-065`). The original contract
does not choose the random-nonce discipline; that guard arrives with the selection.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, `docs/selections/row-3-record-format.md` §3 still says a store
whose next `seq` would cross `2^32` must rotate its generation before writing. `docs/TRD.md` §§6.1 and 15 row 3 say
only that random nonces operate under a per-generation budget bounded by `seq` and that `seq` does not reset at trim;
neither gives the writer the ceiling or required transition. No implementation-side ceiling exists at the pinned
snapshot because the encrypted store has not yet landed.

## First introduction and propagation

`3bea0e69469e47b790fe6214d7fbed42bcf84441` chooses the random-nonce format and records the exact enforcement
point as one comparison before write. `dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9` folds the conclusion into the
normative TRD but preserves only the budget rationale and non-reset rule. The concrete rotate-before-write action is
still present only in the historical selection at the tip.

## Reachable consequence

An implementation can monotonically preserve `seq` and still continue writing indefinitely under one generation,
believing it satisfies the normative summary. Once invocations exceed the selected random-IV budget, the documented
collision bound no longer follows. The threshold is extremely remote for ordinary use and the encrypted writer is
not present yet, so severity is low; the missing branch is nevertheless the only enforcement behind the claimed
cryptographic bound.

## Supporting evidence

The row-3 selection at `3bea0e6` lines 108–117 derives the `2^32` limit from NIST SP 800-38D §8.3 and states
“must rotate its generation before writing.” The fold at `dbfd01f:docs/TRD.md` §15 row 3 says only “under a
per-generation budget that `seq` bounds.” [NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final) §8
requires IV uniqueness and constrains invocations for RBG-based IV constructions; a counter that is observed but
never compared does not enforce that constraint.

## Counterevidence and disconfirmation attempt

I tested whether “under a ... budget that `seq` bounds” unambiguously implies the required branch. It signals that a
limit exists but does not name its value, whether equality is permitted, or whether the operation refuses, rotates,
or resets. The linked selection resolves all three, so a diligent implementer can recover the rule. That lowers the
severity but does not repair the normative document's claim that it states current truth and wins on disagreement.

## Validation procedure

1. Add a boundary test with `next_seq = 2^32 - 1`, `2^32`, and `2^32 + 1` to the eventual encrypted writer.
2. Assert that the first disallowed write cannot occur under the existing generation and that rotation preserves the
   monotonic store sequence.
3. Require the normative TRD to name the same ceiling and transition as the selection.
4. Mutation-test removal of the comparison so the test demonstrates an independent oracle.

## Disposition

Clarify before Stage 1 implementation: put the numeric ceiling and rotate-before-write transition in the normative
record algorithm, then encode the boundary as a build-failing test.
