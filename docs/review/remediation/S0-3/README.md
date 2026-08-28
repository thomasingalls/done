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

## The `S0-3` return (2026-08-28)

Both `S0-9` rounds returned repairs here — the shared `K_store` scope (round 1 `S-9`, *one live construction
defect*), the refusal window (`FU-08`), `FU-09`'s finish, and `FU-13`'s remaining homes — and the return
landed them under `P-3` falsifiers 14–22, ratified option A at all three joints, with every gate re-run green:

- **Stage A** — [`A-schemas.md`](./A-schemas.md) amended under the ratified rules: the `SeqCounter` gains the
  `store_id` minted beside it (one key per counter), the commit gains the fence, and the refusal path is
  **stage-and-promote** — the reserved mechanism selection, taken here: staging is total where an inverse is
  not, because the two live causes are storage failures no input inspection predicts. The falsifier map
  continues at rows 16–24, each naming the `P-3` falsifier it lands.
- **Stage B** — TRD §6.1 states the per-store scope (*a key's scope can be no wider than the state that
  counts its invocations*), the carrier rule and the fence; §13.2's label sentence carries the scope term;
  §15 row 3's cell is rewritten — *still open* and *a budget that `seq` bounds* died there (`FU-13`, `E3`).
- **Stage C** — row 3 amended: the derivation binds `store_id`, §3's bound names the `D²·2^-33` arithmetic it
  refuses, §4's scope rule is corrected to say what the budget forced, and §5 names the envelope counter the
  census entry cites.
- **Stage D** — the record generator derives per store and publishes the corrected rule string, with
  `wrong-store-subkey` and `record-aad-only-store` as new negatives (193 AAD fields, each isolated);
  `test/writeAdmission.test.ts` consolidates the carrier (the mark is **read** by the forced flush, round 1
  `S-6`'s two green mutations held as permanent negatives) and the fence (`commitReserved` aborts a stale
  reservation where the commit lands); `test/storageSchedule.test.ts` inverts the last two reproductions
  with their schedules kept — the refusal path holds nothing a kill can lose at any boundary, and the
  two-store model derives distinct keys with each counted by its own counter.
- **Stage E** — PRD §7.10 gains the one owed sentence: on the refusal path the document itself waits for its
  carrier, so the screen never shows what §7.10 would have to disclaim.
- **The instruments** — the authority map's `k-store` entry flipped; `k-key-envelopes` and `k-index` entered
  the AEAD census from their homes; the sweep widened to AEAD constructions; **`K_cp`'s absence is a
  declared, checker-policed debt owed at the `S0-5` return**, because its homes state neither a counter nor
  a discipline and its key cannot narrow to a store; and `pnpm admission:check` joined `pnpm check` as
  falsifier 22's homes-agree readback, with the two-store reconstruction inside it.

An 18-mutation battery caught 18 — every restored sentence, dropped counter, tampered vector, silent map
edit, un-struck declaration and model reversion fails a check rather than waiting for a review.

## Not in scope

- **`MAX_UPDATE`'s exact value.** `P-3` selected that it is **derived** from §12's budget on the declared
  support population — which makes it downstream of `f-bd87655-baseline-not-performance-floor`, owed at `L-4`.
  16 kB is an interim floor to build against, and the derivation is what this action records.
- **The slice boundary for each operation kind**, which is Stage 1 implementation once the rule is fixed.
- **The store adapter itself** — Stage 1 and `L-1`. This selects the states it moves through.
- **The `1:` plaintext journal entries** row 2 §7 flags. Its recommendation stands and is not a write-admission
  question.
