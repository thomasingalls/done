# `S0-3` Stage A — durable record schemas

**Standing:** home — the write-admission machine stated here is composed and scheduled by
`test/storageSchedule.test.ts`; read back by `pnpm test`.

**Status:** proposed for `S0-8` review · not implemented · `RC-3C` · **amended 2026-08-28 at the `S0-3`
return, under `P-3`'s three ratified joints** — the store identity in §4, the budget's key scope in §5, and
the staged carrier in §6, with the falsifier map continued at rows 16–24

## 1. `MAX_UPDATE` — derived from the budget, never chosen

```
MAX_UPDATE = the largest update whose complete synchronous journal write --
             seal, base64 and setItem -- completes inside §12's budget on the
             declared support population.

  Budget      < 1 ms p95, low-end device (§12)
  Measured    35 µs @ 18 B, 65 µs @ 419 B, 240 µs @ 4 kB   (Pixel 9a, WASM seal)
  Slope       0.0476 µs/byte from the two larger points
  Exhausted   ≈ 20 kB
  Interim     16 kB (0.82× of budget), pending the declared population
```

**This is a rule with a number attached, not a number.** The rule is that the limit follows the budget; the
number follows the rule once `f-bd87655-baseline-not-performance-floor` declares a population to measure on.
The extrapolation above is three points on one device — it is the justification for _about 20 kB, not 64 kB_,
and it is not a measurement of the constant.

**The WASM guard stays where it is and becomes unreachable.** `MAX_PLAINTEXT = 65536` costs `.bss` pages rather
than module bytes, so a generous backstop is free; what changes is that admission refuses long before it. **A
build that reaches the guard is a bug in admission**, and the test asserts exactly that.

## 2. Admission — two mechanisms, and they do different jobs

```
Slicing      No operation may produce an update above MAX_UPDATE. An operation
             that would is applied in bounded slices, each its own Yjs
             transaction, each journalled, each durable before the next.
             Paste, import, migration and bulk maintenance are one rule.

Admission    Before the seal: update.byteLength > MAX_UPDATE -> refuse.
             The backstop, for anything slicing did not catch.
```

**Slicing makes the refusal rare; admission makes it safe.** They are not alternatives. A slicer cannot know an
update's exact size before the transaction commits — it bounds the _input_ and the update is a function of it —
so the check after the fact is what turns an estimate into a guarantee.

**Nothing is refused to the user.** The limit is on updates, not operations, and a large paste appears
progressively rather than failing. That progressive appearance is the blocking progress state `RC-3`'s Branch B
said large writes need, arrived at without the group-commit machinery.

**A kill part-way through a sliced operation leaves a prefix**, which is resumable and honest. One
arbitrary-size update leaves nothing.

## 3. Remote updates leave the journal's contract

**The journal exists so a page kill cannot lose _accepted local work_.** A remote update is not local work, and
§6.1 already protects it by a stronger mechanism: _the content batch commits first and the heads record after
it_, so a crash before the batch leaves the accepted mark below that position and **sync re-delivers**.

**This also removes the only case that cannot be sliced.** A peer's large paste, or an initial sync, arrives as
one update whose size this device does not control and cannot split. It turns out not to need the rule at all.

**The composition to check** is a local update that causally depends on a remote one which was never persisted.
On reload the journal replays the local update against a document missing its dependency; Yjs holds it pending,
the remote update is re-delivered, and it integrates. That is a falsifier below, not an assumption.

## 4. `SeqCounter` — reserve per batch, exactly

`seq` is inside the record's AAD, so it is fixed before encryption and cannot come from an auto-increment key.

```
SeqCounter (one record per store instance)
  store_id       minted from local randomness at store creation, beside this
                 counter; cleartext in the store's metadata, bound in the
                 derivation info and the AAD (P-3 joint 1, ratified). It
                 exists at creation for every store -- the anonymous Local
                 workspace included -- and no two counters ever share it.
  next_seq       the global monotonic allocation point, spanning content and heads
  reserved[gen]  sequences reserved under each content-key generation

Reserve  one readwrite transaction: grant [next_seq, next_seq + k), advance
         next_seq by k, add k to reserved[current_gen]. Two tabs serialize
         because IndexedDB serializes them.

Commit   the batch's committing transaction reads the active-generation
         marker -- its home shares the store's database -- and validates the
         reservation's generation where the commit lands (P-3 joint 3, the
         fence; S0-2 §4 step 5). When the marker moved, the commit aborts
         into re-reservation under the successor; the abandoned range stays
         counted. After marker-advance commits, no record can commit under
         the outgoing generation, so its classification is complete when
         retirement consumes it.
```

**One key per counter is what the `store_id` buys** (`P-3` joint 1). `K_store`'s derivation binds it — row 3
§§3–4 — so `reserved[gen]` counts every invocation of the key it bounds: the sum over devices is a sum over
distinct keys, and the rotate-before-2^32 comparison is again the whole enforcement, firing on time for its
own key instead of up to `D` times too late for a shared one. Two stores holding one `K_g` never derive one
subkey (`wrong-store-subkey`, the published negative), and a record that lands in the wrong store fails at the
key as well as the AAD.

**Per batch, exactly sized — which is neither of the options the review offered.** The adapter already writes a
whole batch in one transaction, so it already knows `k` when it needs it. One extra transaction per batching
window is about four a second; one per record would be one per keystroke; a per-tab lease introduces ranges that
can be abandoned in part.

**And what it gives the trimmer is uniqueness, not a watermark** — which is a correction the executable model
forced. A trim deletes what its state record covered, and _what it covered_ is expressible only because one
`seq` is issued once. Two tabs each choosing `max + 1` put two records at one number, and then no rule stated
over numbers separates the one the snapshot saw from the one it did not. **The race is upstream of the trim's
rule, in the numbering**, so the repair is the allocator rather than a cleverer trim — and a mutation swapping
a covered-set trim for a range trim changes no result, because with unique numbers the two agree.

**`PositionCounter` is the same shape at §7.4's `seq`**, which is a different number — the credential's outbound
and accepted position (`S0-4`). Both need a reservation and both need a per-generation count, and saying so once
here is what stops the two being conflated a third time.

## 5. `reserved[gen]` — the count the 2^32 comparison reads

§6.1 states the gap precisely: `seq` is global and does not reset, the budget is per generation, and a literal
`next seq ≥ 2^32` test is conservative until the first rotation and then refuses every write afterwards.

**And the key the budget bounds is per (store, generation)** (`P-3` joint 1, ratified 2026-08-28): a key's
scope can be no wider than the state that counts its invocations, this counter is per store, and IndexedDB is
device-local — so the derivation binds the `store_id` beside the workspace, and the `D`-devices-one-key sum
round 1 computed is structurally zero for every `D`.

**`reserved[gen]` is the right count for a reason beyond arithmetic.** NIST SP 800-38D §8.3 bounds
**invocations**, and an encryption abandoned before commit is an invocation. A count recovered from committed
records cannot see it. Reserving before encrypting counts it by construction — the gap a crash leaves _is_ the
record of an invocation that happened.

```
Rule  reserved[current_gen] + k ≥ 2^32  ->  rotate BEFORE the write.
      Equality is the first disallowed value.
```

**A batch that reserved under generation _g_ and finds _g+1_ active re-reserves under _g+1_.** The abandoned
range stays counted against _g_, which is conservative in the safe direction and is exactly what a gap is for.

## 6. The one not-durable state, and the watermark in front of it

**Quota exhaustion and unavailable storage are the same state, not two**, and so is an admission refusal that
slicing failed to prevent:

```
JournalAdmission  ok | refused('oversize' | 'quota' | 'unavailable')

The write path stages before it promotes (P-3 joint 2, ratified; S0-3):
  stage    the input runs against staged state and produces the update
           bytes; the authoritative document is untouched
  admit    the gate above, on the produced bytes
  ok       the synchronous journal write carries the update; the promotion
           and the acknowledgement ride it, in the same handler
  refused  the store is marked not-durable -- a mark the forced flush READS
           the input is held as pending; the document is NOT mutated
           the batch is forced
           the commit is the carrier: the record lands, the update is
           promoted to the document, the acknowledgement fires, the mark
           clears -- sliced when oversize was the cause
```

**Nothing becomes authoritative without a durable carrier — the mechanism is stage-and-promote.** The ratifier
reserved the inversion-vs-staging choice to this stage, and staging is selected because it is total where an
inverse is not: the two live causes are storage failures no input inspection predicts, an update's exact size
exists only after the transaction produces it, and producing it somewhere not yet authoritative is exactly what
admission-after-the-authority could never be. A handler that meets a refusal returns with the document equal to
recoverable state, so the milliseconds before the forced commit hold no update a kill can lose — the kill point
is scheduled, and falsifier 19 below asserts the rule at every boundary on the path. The recorded cost stands:
under storage pressure a keystroke appears when it is durable rather than immediately (PRD §7.10).

**PRD §7.10 already governs this and nobody had connected it.** _An app whose central claim is local-first must
not be quiet about a context where the data is not durable._ An unjournallable write is exactly that context, at
a shorter timescale — so what is withheld is the acknowledgement, not a new warning, because §7.10's own rule is
that a warning which cannot be cleared is noise.

**The watermark is denominated in stored characters, never entries.**

```
The append probe measured this origin's wall at ~5.3 M UTF-16 characters.
  at 18 B/update    ≈ 60,000 entries
  at 16 kB/update   ≈ 241 entries
```

**A design that bounds the outstanding set by count is wrong by two orders of magnitude at the size that
matters.** Entries live only until the next batch commit, so approaching the wall means the batch is not
committing — and the response is to force a flush at a watermark well below quota rather than to discover it at
`setItem`.

## Falsifier map

| #   | Falsifier                                                                                                     | Schema |
| --- | ------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | No admitted update exceeds `MAX_UPDATE`, and `MAX_UPDATE` is under what §12's budget permits                  | 1      |
| 2   | **A build that reaches the WASM length guard fails**: admission makes it unreachable                          | 1, 2   |
| 3   | A paste an order of magnitude over the limit is applied in full, in slices, with nothing refused              | 2      |
| 4   | A kill part-way through a sliced operation leaves a **prefix** — every completed slice durable, none partial  | 2      |
| 5   | A remote update is not journalled, and a kill before its batch leaves the accepted mark below it              | 3      |
| 6   | A local update depending on an unpersisted remote update replays, holds pending, and integrates               | 3      |
| 7   | Two tabs allocating concurrently receive disjoint ranges; no `seq` is issued twice                            | 4      |
| 8   | A kill after reservation and before commit leaves a gap that is never reused and stays counted                | 4, 5   |
| 9   | A trim snapshot concurrent with a batch does not sweep it, and duplicate `seq`s are what would break that     | 4      |
| 10  | **`reserved[gen]` counts an abandoned encryption; a committed-record count does not**                         | 5      |
| 11  | At `reserved[gen] + k ≥ 2^32` the writer rotates **before** the write; equality is disallowed                 | 5      |
| 12  | A fresh generation starts a fresh budget without resetting the global trim order                              | 5      |
| 13  | A batch that rotates mid-flight re-reserves, and the abandoned range stays counted against the old generation | 5      |
| 14  | Oversize, quota and unavailable reach **one** state, and the edit is unacknowledged until IndexedDB commits   | 6      |
| 15  | The watermark is characters: large updates back-pressure after hundreds, keystrokes after tens of thousands   | 6      |

Continued at the `S0-3` return (2026-08-28), under `P-3`'s ratified joints — each row names the `P-3`
falsifier it lands:

| #   | Falsifier                                                                                                      | Schema | `P-3` |
| --- | -------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| 16  | Two stores holding one `K_g` never derive one `K_store`; deriving for another store fails to open (`wrong-store-subkey`) | 4      | 14    |
| 17  | Every invocation of each `K_store` instance is counted by exactly one `SeqCounter`, and a `D`-writer model at the budget's edge shows no key over budget | 4, 5   | 15    |
| 18  | Every AEAD key on the write path names its counter or its discipline in one home, and an entry with neither fails `pnpm authority:check` | 4, 5   | 16    |
| 19  | A kill between a journal refusal and the forced commit shows no document ahead of what durable state rebuilds — at every boundary on the path | 6      | 17    |
| 20  | The mark is read and the acknowledgement is load-bearing: a model that never marks, or acknowledges before the commit, fails a permanent negative | 6      | 18    |
| 21  | A granted reservation cannot outlive its generation: the late commit aborts into re-reservation and the abandoned range stays counted | 4      | 19    |
| 22  | No schedule reaches `openers-retired` while a sealed object is outside the retirement predicate's view — `writeAdmission` × `GenerationApply` composed | 4      | 20    |
| 23  | Every check-to-commit pair is schedulable — a kill and a second writer land in each window — and a fused pair fails the census with the `FU-08` diagnosis | 2, 4, 6 | 21   |
| 24  | The homes agree: `pnpm admission:check` refuses any home still publishing *still open*, a budget `seq` bounds, the exact-watermark rule, or the store-shared derivation | 1–6    | 22    |
