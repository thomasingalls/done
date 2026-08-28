# `S0-3` — total local-write admission, the allocator, and the budget nobody could compute

**Standing:** home — the findings table below is an ownership source of the traceability population; read
back by `pnpm trace:check`.

**Started:** 2026-08-27 · **Inputs:** [`P-3`](../decisions/P-3-write-admission.md) decided (`RC-3C`)

The last of the seven actions, and the one whose cluster the review diagnosed most precisely: _the composition
mistake is treating a record format plus a component benchmark as a total concurrent write-admission machine._
Every individual piece is sound. What is missing is the entry conditions.

## Findings this action must close

| Finding                                         | Severity | What fails today                                                                                                    |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `f-9b49b74-journal-seal-64k-gap`                | medium   | An update over 65,536 bytes throws **after** the CRDT transaction; a page kill then loses the only uncommitted copy |
| `f-3bea0e6-store-sequence-allocation-undefined` | medium   | Two tabs can authenticate two records at one `seq`, and no count can see an encryption that was abandoned           |

And it finishes three already-applied repairs: the glue widths and the rotated-generation fixture are done, and
`f-dbfd01f-record-nonce-ceiling-omitted` still owes **the build-failing boundary test** — which was unwritable
until `P-3` selected the count the comparison reads.

## What `P-3` changed about the question

The seal's 64 KiB guard looked like the constraint. It is not: **§12's 1 ms journal budget runs out at about
20 kB** on the measured handset, so the guard sits about **3.2× past** a budget the design calls a correctness
property. An update that reaches it has already blown the thing the budget protects.

So the repair is not a bigger buffer or a segmented WAL — chunking seals the same bytes on the same thread — but
**bounding what an operation produces**, so the write-ahead log never meets something it cannot take. Nothing is
refused: the limit is on _updates_, not operations, and every operation large enough to matter can be applied in
slices.

## Stages

|       | Stage                  | Output                                                                              | Status                                                         |
| ----- | ---------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **A** | Durable record schemas | `MAX_UPDATE`'s derivation, the two counters, the admission gate, the watermark      | **done** — [`A-schemas.md`](./A-schemas.md)                    |
| **B** | Normative construction | TRD §§6.1/7.4/10.10/12                                                              | **done** — §12 derives the limit, §6.1 answers row 3           |
| **C** | Selection rows         | rows 2, 3, 4                                                                        | **done** — rows 2 and 3                                        |
| **D** | Executable evidence    | the budget boundary as a build-failing test; admission and the allocator as a model | **done** — a derivation check and 18 model tests, 19 mutations |
| **E** | Product surface        | PRD §7.10 and §7.1                                                                  | **done** — §7.10 gains the withheld acknowledgement            |

### Stage D, and the claim a mutation deleted

**`scripts/check-update-limit.mjs` recomputes the derivation rather than comparing a string.** It reads the
Pixel 9a measurements from `docs/performance.md`, the budget from §12's own table, fits the per-byte cost, and
**recomputes every row of §12's extrapolation** — then checks the interim limit against both the budget and the
module's `MAX_PLAINTEXT`. Seven mutations, all caught: a changed measurement, a loosened budget, a drifting
table row, an interim above the ceiling, a module guard below it, a deleted table, and prose that stops saying
where the budget runs out.

**It caught its own author first.** §12's table said _~20 kB ≈ 1 000 µs_; the derivation gives 1 020 µs at
20,480 B, because the budget is exhausted at 19.6 kB. A rounding the prose could carry and the table could not.

`test/writeAdmission.test.ts` — **18 tests, 19 mutations.** Admission and its one refusal state, slicing and the
prefix a kill leaves, the character-denominated watermark, the allocator, and the budget's comparison.

**A mutation deleted a claim and nothing failed, and the claim was in three documents.** Stage A said the
allocator _hands the trimmer an exact watermark_ — read `next_seq` in the snapshot transaction and the sweep is
bounded by construction. Swapping a covered-set trim for a range trim changed no result, because **with unique
sequences the two agree**. What the allocator actually buys the trimmer is **uniqueness**: _what my state record
covered_ is expressible only because one `seq` is issued once, and two tabs both choosing `max + 1` put two
records at one number that no rule stated over numbers can separate. **The race is upstream of the trim's rule,
in the numbering** — so the repair is the allocator and not a cleverer trim, and TRD §6.1, row 3 and Stage A all
now say so.

**That is the second time this session a mutation has retired an unfalsifiable rule** — `S0-4`'s sole-successor
slot was the first — and both times the replacement was something with a falsifier that isolates.

**Two survivors are correct.** A range trim and a covered-set trim agree while sequences are unique, which is
the point rather than a gap; and three weak assertions were rewritten before mutating, one of which — a _held
update integrates later_ that returned what it asserted — was a tautology.

### What Stage E changed

**§7.10 gained the case a single edit can be in.** Its table is about a context that is not durable; an
unjournallable write is that condition at a scale of milliseconds. **What is withheld is the acknowledgement,
not a banner** — a warning that clears in milliseconds is the noise §7.10 already refuses, and a _saved_ that is
not yet true is the thing it exists to prevent.

**§7.1 gained the promise slicing makes.** A very large paste or import arrives in pieces, **nothing is
refused**, and an interruption leaves the pieces that finished. The alternative was one operation too large to
make durable, which fails silently and completely.

## Not in scope

- **`MAX_UPDATE`'s exact value.** `P-3` selected that it is **derived** from §12's budget on the declared
  support population — which makes it downstream of `f-bd87655-baseline-not-performance-floor`, owed at `L-4`.
  16 kB is an interim floor to build against, and the derivation is what this action records.
- **The slice boundary for each operation kind**, which is Stage 1 implementation once the rule is fixed.
- **The store adapter itself** — Stage 1 and `L-1`. This selects the states it moves through.
- **The `1:` plaintext journal entries** row 2 §7 flags. Its recommendation stands and is not a write-admission
  question.
