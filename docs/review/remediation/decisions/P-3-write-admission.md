# `P-3` — write admission for oversize and storage failure

**Decided:** 2026-08-27 · **Branch:** `RC-3C`, bound the operation rather than the write-ahead log ·
**Allocator:** per-batch exact reservation, in IndexedDB · **Budget baseline:** sequences _reserved_ under a
generation, not sequences committed · **Status:** decided, not yet consolidated

Consolidation is [`S0-3`](../action-tree.md). Evidence:
[`probes/journal-append-probe.md`](../probes/journal-append-probe.md), TRD §12, `docs/performance.md`.

## The question is not the one the options document asks

`RC-3`'s two branches differ over whether the product accepts a size cap. Branch A takes one and refuses
oversize operations; Branch B refuses the cap and pays for a segmented or enlarged synchronous WAL. Both read
the 64 KiB boundary as the constraint, because that is where the seal throws.

**It is not the constraint.** TRD §12 requires the whole synchronous journal write — seal, base64 and
`setItem` — to complete in **under 1 ms p95 on a low-end device**, and calls that budget _a correctness budget
in disguise_, because the write happens inside a handler that must not return until it has. The Pixel 9a
measurements in `performance.md` are 35 µs at 18 B, 65 µs at 419 B and **240 µs at 4 kB**. Fitting the two
larger points gives 0.0476 µs per byte:

| Update     | Synchronous write, extrapolated | Against the budget      |
| ---------- | ------------------------------- | ----------------------- |
| 8 kB       | 435 µs                          | 0.43×                   |
| 16 kB      | 825 µs                          | 0.82×                   |
| **~20 kB** | **≈ 1 000 µs**                  | **the budget, exactly** |
| 32 kB      | 1 605 µs                        | 1.6× over               |
| **64 kB**  | **3 164 µs**                    | **3.2× over**           |

**So the budget runs out at roughly 20 kB and the seal's buffer is about three times past it.** An update that
reaches the guard has already blown a budget the design calls a correctness property — and Branch B, which
exists to remove the cap, makes that worse rather than better: **chunking does not reduce the work.** A
segmented WAL seals every byte on the same thread inside the same handler, so an arbitrary-size synchronous WAL
is an arbitrary-length main-thread block. It trades a bounded data-loss window for an unbounded freeze.

**A cap exists in both branches whatever the document says.** localStorage has a quota, and the append probe
measured this origin's at about **5.3 M UTF-16 characters** — the wall is real, not hypothetical. Branch B does
not remove the ceiling; it moves it from a place where the failure is a clean refusal to a place where the
failure is a `setItem` that throws mid-flight.

## The decision

**`RC-3C`: bound what an _operation_ produces, so the write-ahead log never meets something it cannot take.**

```
Admission        One update, one journal entry, always. No group, no chunk, no
                 reassembly. Nothing changes in the WASM module.

The limit        MAX_UPDATE is derived from §12's budget on the declared support
                 population, NOT chosen and NOT inherited from the seal buffer.
                 Interim value 16 kB (0.82x of budget on a Pixel 9a); the exact
                 number is owed with the population (f-bd87655, L-4).

Operations       No operation may produce an update above MAX_UPDATE. An operation
                 that would is applied in bounded slices, each its own Yjs
                 transaction, each journalled, each durable before the next.
                 Paste, import, migration and bulk maintenance are one rule.

Remote updates   NOT journalled. They are covered by the accepted-head ordering
                 (§6.1): the heads record commits after the content batch, so an
                 update lost to a page kill is re-delivered rather than lost.

Residual         Quota exhaustion and unavailable storage are ONE refusal state,
                 not two. The store is marked not-durable, the batch is forced,
                 and the edit is not acknowledged until IndexedDB commits.
                 PRD §7.10 already governs this and nobody had connected it.

Back-pressure    The outstanding-journal watermark is measured in STORED
                 CHARACTERS, never in entries. At 18 B an origin holds ~60,000
                 entries; at 16 kB it holds ~241.
```

## Why nothing is refused, which is what Branch A was criticized for

Branch A's cost was _a product-visible operation-size refusal_, and that cost is avoidable. **The limit is on
updates, not on operations**, and every operation large enough to matter is one that can be applied in pieces:
a paste is repeated text insertion at a position, an import is per day or per card, a bulk move is per item.
Sliced, each piece is an ordinary update on the ordinary path. The document converges either way because it is
a CRDT, and a kill leaves a prefix — which is resumable and honest, where one arbitrary-size update leaves
nothing.

**So the user is never told no.** A very large paste appears progressively, which is the blocking progress
state `RC-3`'s Branch B says large writes need, arrived at without the group-commit machinery.

## Why remote updates leave the journal's contract

The journal exists so that a page kill cannot lose **accepted local work**. A remote update is not local work,
and §6.1 already protects it by a stronger mechanism: _the content batch commits first and the heads record
after it_, so a crash before the batch leaves the accepted mark below that position and **sync re-delivers**.
Journalling remote updates adds a synchronous main-thread cost on the receive path to duplicate a guarantee the
ordering already makes.

**This also removes the one case that cannot be sliced.** A peer's large paste or an initial sync arrives as
one update whose size we do not control and cannot split — it is the only genuine counterexample to the rule
above, and it turns out not to need the rule at all.

**The composition to check** is a local update that causally depends on a remote one which was never persisted.
On reload the journal replays the local update against a document missing its dependency; Yjs holds it pending,
the remote update is re-delivered, and it integrates. That is a falsifier below rather than an assumption.

## The allocator: per batch, exactly sized

`seq` must be known before encryption because it is in the AAD, so it cannot come from an auto-increment key.
The options offered _one reservation per record_ or _a leased per-tab range_, and the batch makes that a false
choice: **the adapter already writes a whole batch in one IndexedDB transaction**, so it already knows how many
sequences it needs at the moment it needs them.

```
SeqCounter (one record per store)
  next_seq          the global monotonic allocation point
  reserved[gen]     sequences reserved under each generation

Reserve  one readwrite transaction: grant [next_seq, next_seq + k), advance
         next_seq by k, add k to reserved[current_gen]. Two tabs serialize
         here, because IndexedDB serializes them.

Consume  encrypt and write under the granted range. An abandoned batch leaves
         a gap. Gaps are never reused and stay counted.
```

**One extra transaction per batch, not per record** — at a 250 ms batching window that is about four a second,
against one per record which would be one per keystroke.

**And it hands the trimmer an exact watermark, which is the second thing it fixes.** A trim that infers its
boundary from committed records can race a batch that is mid-flight. Reading `next_seq` in the snapshot
transaction gives a boundary that is correct by construction: everything at or above it is reserved by someone
and is not the trim's to sweep.

## The budget baseline: reserved, not committed

TRD §6.1 states this gap exactly — `seq` is global and does not reset, the 2^32 budget is per generation, and a
literal `next seq ≥ 2^32` test is conservative until the first rotation and then refuses forever.

**`reserved[gen]` is the count the comparison reads**, and it is the right one for a reason beyond arithmetic:
NIST SP 800-38D §8.3 bounds **invocations**, and an encryption abandoned before commit is an invocation.
A counter recovered from committed records cannot see it. Reserving before encrypting counts it by
construction — the gap a crash leaves is the record of an invocation that happened.

**A batch that reserved under generation g and finds g+1 active re-reserves under g+1.** The abandoned range
stays counted against g, which is conservative in the safe direction and is exactly what a gap is for.

## What `S0-3` builds

1. `MAX_UPDATE` as a **derived** constant with its derivation recorded, plus the admission check in front of
   the seal, so the WASM guard becomes an unreachable backstop rather than the boundary.
2. Operation slicing for paste, import, migration and bulk maintenance, with the slice boundary chosen so no
   slice can exceed `MAX_UPDATE`.
3. The local/remote split in §6.1's journal contract, and the accepted-head argument written where the journal
   contract is stated rather than two sections away.
4. `SeqCounter`, its reservation transaction, and the trim's use of `next_seq` as a snapshot boundary.
5. `reserved[gen]` and the rotate-before-the-2^32nd-invocation comparison, which is the build-failing boundary
   test `f-dbfd01f-record-nonce-ceiling-omitted` still owes.
6. The single not-durable state for quota and unavailability, wired to PRD §7.10 rather than to new copy.
7. The character-denominated back-pressure watermark.

## Falsifiers

1. No admitted update exceeds `MAX_UPDATE`, and `MAX_UPDATE` is below what §12's budget permits.
2. A paste an order of magnitude over the limit is applied in full, in slices, with no operation refused.
3. A kill part-way through a sliced operation leaves a **prefix** — every completed slice durable, none partial.
4. The WASM length guard is never reached by any admitted path; reaching it is a bug, and the test asserts that.
5. A remote update is not journalled, and a kill before its batch commits leaves the accepted mark below it.
6. A local update that depends on an unpersisted remote update replays, holds pending, and integrates when the
   remote update is re-delivered.
7. Two tabs allocating concurrently receive disjoint ranges; no `seq` is issued twice.
8. A kill after reservation and before commit leaves a gap that is never reused and stays counted.
9. `reserved[gen]` counts an abandoned encryption; a committed-record count does not, and that difference is
   the test.
10. At `reserved[gen] + k ≥ 2^32` the writer rotates **before** the write; equality is the first disallowed
    value, and a fresh generation starts a fresh budget without resetting global order.
11. A trim snapshot concurrent with a batch does not sweep the batch's records, because the boundary is
    `next_seq` and not the highest committed record.
12. At quota, and with storage unavailable, the store enters **one** state, the batch is forced, and the edit
    is not acknowledged until IndexedDB commits.
13. The back-pressure watermark is denominated in stored characters: a workspace writing large updates
    back-pressures after a couple of hundred entries, and one writing keystrokes after tens of thousands.

## The two measurements the plan asked for, and why neither was taken

`P-3`'s prerequisites named _feasibility measurements for staged arbitrary-size WAL and for per-write versus
range allocation_. Neither was run, and both are discharged rather than skipped:

- **Staged arbitrary-size WAL.** The measurement that decides it already exists. `performance.md`'s Pixel 9a
  run gives the per-byte cost of the synchronous write, and §12 gives the budget; the two together say the
  ceiling is ~20 kB. A feasibility run would have measured how long an arbitrary-size synchronous seal takes,
  which is the question the budget already answers — and the answer disqualifies the branch rather than
  costing it.
- **Per-write versus range allocation.** The measurement would discriminate two options that turned out not to
  be the alternatives. The batch is already one transaction and already knows its own size, so the reservation
  is per batch and exactly sized: neither a transaction per record nor a lease that can be abandoned in part.
  There is nothing left to compare.

**What a measurement is still owed for** is `MAX_UPDATE`'s value, and that one cannot be taken yet — it needs
the declared support population, not another run on a Pixel 9a.

## What this does **not** decide

- **The number.** `MAX_UPDATE`'s exact value needs the declared support population, which is
  `f-bd87655-baseline-not-performance-floor` and is owed at `L-4`. What is selected is that it is **derived
  from the budget** rather than chosen — the 16 kB interim is a floor to build against, not the answer. The
  extrapolation above is three points on one device and is a rule's justification, not a measurement.
- **The slice boundary** for each operation kind, which is Stage 1 implementation once the rule is fixed.
- **Whether the WASM buffer should shrink** to `MAX_UPDATE` plus headroom. It costs `.bss` pages rather than
  module bytes, so leaving it generous is free and makes the guard a genuine backstop. Worth revisiting only if
  the module gains an allocator.
- **The `1:` plaintext journal entries** row 2 §7 flags for Stage 1. Its recommendation — refuse and report,
  never replay — is untouched here and is not a write-admission question.
