# `S0-5` — semantic checkpoint, admission/install, and immutable creation authority

**Started:** 2026-08-27 · **Inputs:** [`P-8`](../decisions/P-8-checkpoint-and-creation-authority.md) decided;
`S0-2` complete, which was its only other dependency

Two findings, both medium, both about the same mistake in two places: **authentic bytes were treated as
semantic authority.** A producer's signature proves a manifest was made by that producer. It does not prove the
manifest describes the snapshot it names, and a CRDT map's "write once" convention does not prove who wrote
first.

## Findings this action must close

| Finding | Severity | Closed in stage |
| --- | --- | --- |
| `f-b997cdb-checkpoint-coverage-unchecked` | medium | A → B → D |
| `f-b997cdb-attribution-self-replacement` | medium | A → B → C → D |

## Stages

| | Stage | Output | Status |
| --- | --- | --- | --- |
| **A** | Durable record schemas | `SemanticAdmission`, `CreationCertificate`, and the card-id derivation that makes replacement structurally impossible | **done** — [`A-schemas.md`](./A-schemas.md) |
| **B** | Normative construction | TRD §§4.8/7.6/10.4 | **done** — §7.6 splits local re-derivation from the trusted baseline; §4.8 derives `card_id` from its creator; §10.4 keeps card and certificate joint |
| **C** | Selection rows | rows 5/7/8/10/15 | **done** — rows 7 and 8 gain constructions; 5, 10 and 15 take header notes |
| **D** | Executable evidence | checkpoint and attribution generators, one isolated falsifier per property | not started |
| **E** | Product surface | PRD provenance and continuity | not started |

**§4.5 and §13.7 needed no change.** §4.5 separates freeze from compaction and is untouched by any of this;
§13.7's opener predicate was already corrected during `S0-2`, and the checkpoint step it gates now means
*semantically admitted* by reference rather than by restatement.

Same dependency order as `S0-2`, and for the same reasons: `D` cannot write a falsifier for a field that does
not exist, and `E` would be claiming in product terms something `B` and `C` have not yet made true. **Expect
the same intermediate state after `C`** — the rows will describe constructions the generators do not yet
produce, and `pnpm vectors:check` will report green throughout, because it compares a generator to its vector
and never a document to its generator.

## The split that makes this tractable

`P-8` separated two things the plan had treated as one, and only one of them is a trust question:

1. **Snapshot-to-coverage consistency is re-derived locally and is mandatory.** The checkpoint carries the
   snapshot, so any restorer can materialise it, recompute `{sv, ds}`, and compare against the manifest. No
   witness, no signature, no other party. **This half closes by arithmetic**, and it should be checked even
   when the admission verifies, because a bug produces the mismatch as readily as an attacker.
2. **The accepted-head baseline is the trust question**, because proving the head vector did not advance past
   what the snapshot represents needs the accepted events — exactly what trim removes.

Everything in `A` follows from keeping those apart.

## Not in scope

- The package format that carries a checkpoint — `S0-6`, taking `A`'s shapes as given.
- Compaction and card deletion policy. `A` says creation authority is destroyed *with* its card and never
  alone; **when a card may be destroyed is a product question** and is not answered here.
- Row 21's first-deployment cutover. `P-8` noted that creator-committed ids make the fidelity-archive branch
  more valuable, since creation authority would survive rather than being among the documented losses. That
  remains a Stage 2 product choice.
