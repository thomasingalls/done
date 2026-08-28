# `P-3` — write admission for oversize and storage failure

**Decided:** 2026-08-27 · **Reopened:** 2026-08-28, at the shared subkey, the refusal window and the
reservation fence · **Branch:** `RC-3C`, bound the operation rather than the write-ahead log ·
**Allocator:** per-batch exact reservation, in IndexedDB · **Budget baseline:** sequences _reserved_ under a
generation, not sequences committed · **Status:** reopened — question, options and falsifiers drafted below;
ratification pending

Consolidation is [`S0-3`](../action-tree.md). Evidence:
[`probes/journal-append-probe.md`](../probes/journal-append-probe.md), TRD §12, `docs/performance.md`.

**Read the reopening at the end of this record before consuming anything above as settled.** `RC-3C` stands;
what failed both `S0-9` rounds is what contains an admitted write at three joints its models cannot schedule —
the key every store's nonces share, the crash window behind a journal refusal, and a reservation that crosses a
generation advance — plus this record's own superseded trim claims (`FU-13`), now annotated in place where they
occur. The reopened question, its floors, the options and falsifiers 14–22 are drafted below; ratification is
the open step.

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

*[Superseded 2026-08-28, `FU-13`. `S0-3` Stage D retired the watermark claim by mutation: swapping a
covered-set trim for a range trim changed no result, because with unique sequences the two agree. What the
allocator hands the trimmer is **uniqueness** — a trim deletes what its state record covered, and "what it
covered" is expressible only because one `seq` is issued once. TRD §6.1, row 3 and `S0-3/A-schemas.md` already
say so; this record now does too. See the reopening below.]*

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
   *[Superseded 2026-08-28, `FU-13`: the trim consumes the covered set, and uniqueness is what the allocator
   supplies — see the note in the allocator section and the reopening below.]*
5. `reserved[gen]` and the rotate-before-the-2^32nd-invocation comparison, which is the build-failing boundary
   test `f-dbfd01f-record-nonce-ceiling-omitted` still owes.
6. The single not-durable state for quota and unavailability, wired to PRD §7.10 rather than to new copy.
7. The character-denominated back-pressure watermark.

## Falsifiers

*Reopened 2026-08-28: falsifiers 1–10, 12 and 13 stand. Falsifier 11's property survives and its stated
mechanism does not — the correction is annotated in place. The list was also not sufficient: nothing below
schedules a kill between a refusal and the forced batch's commit, an interleaving across the generation
marker, or a second store under the same key. It continues at falsifiers 14–22, below.*

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
    *[Corrected 2026-08-28, `FU-13`: the property stands and the because-clause was retired at `S0-3` —
    the trim consumes the covered set, and duplicate sequences are what would break it. The test is `S0-3`'s
    falsifier 9, not a `next_seq` boundary.]*
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

---

## Reopened 2026-08-28 — the shared subkey, the refusal window, and the unfenced reservation (round 1 `S-9`, round 2 `FU-08`/`FU-09`/`FU-13`)

**Everything above stands except what contains an admitted write at three joints, and no model this record's
evidence runs on can schedule any of the three.** Round 1's storage challenger built the first from the shipped
construction ([`challenge-storage.md`](../S0-9/challenge-storage.md) `S-9`), and
[`DISPOSITION.md`](../S0-9/DISPOSITION.md) files it as *one live construction defect, not an evidence
weakness*: **"this returns to `P-3`, not to a vector."** Round 2's storage challenger, serial and blind to
round 1, found the second and third ([`ST-03`](../S0-9/followup-storage/challenge-storage.md) and `ST-04`,
reconciled as `FU-08` and `FU-09` in [`FOLLOWUP-DISPOSITION.md`](../S0-9/FOLLOWUP-DISPOSITION.md)) — `FU-08`
returns here outright, and `FU-09` returns to the `S0-2`/`S0-3` interface *"and `P-3` if its reserve/re-reserve
transaction shape changes"*; resolving that conditional is part of this reopening's job. The evidence
challenger found the fourth defect in this record itself (`E3`/`E4`, reconciled as `FU-13`): the register and
this document still published write-admission claims `S0-3` had already retired. That one is not a decision —
the in-place annotations above discharge the record's half of it, and the remaining homes are consolidation.

**The first joint: every store derives the same key, so the budget bounds no key.** Row 3's derivation is
`K_store = HKDF-SHA256(K_g, info = LP("done/store/v1") || LP(workspace_id))` — no principal, no device, no
store. Every device holding `K_g` derives the identical subkey. The enforcement this record selected counts per
store: one `SeqCounter` per _(principal, workspace)_ **per profile**, whose `reserved[gen]` no sibling store
can see, because IndexedDB is device-local by construction. NIST SP 800-38D §8.3 bounds **a key** to 2^32
random-nonce invocations; with `D` stores each granted 2^32 under one shared key, `q = D·2^32` and the 96-bit
collision probability is ≈ `D²·2^-33` — above §6.1's claimed 2^-32 for every `D ≥ 2`. §6.1 takes care to argue
the budget stays *"the single comparison it was argued as rather than a sum over two sequences"* across the
content and heads object stores — and says nothing about the sum over devices, which is the larger one. Row 3
§4's own rule made the gap invisible: *"derivation names what the key is scoped to"*, and adding the principal
*"would claim a scope the key does not have"* — the rule is right and the premise was backwards, because the
budget forces the scope: **a key's scope can be no wider than the state that counts its invocations.** The
question was inside [`f-3bea0e6-store-sequence-allocation-undefined`](../../findings/f-3bea0e6-store-sequence-allocation-undefined.md)'s
own text — *"establish when a fresh generation receives a fresh invocation budget"* — and `RC-3`'s causal chain
never reached the derivation, which is why the named ancestor was incomplete rather than wrong. Row 2 is
untouched: the journal's 24 random bytes need no invocation budget, which is exactly the asymmetry that makes
the 96-bit GCM path the one that needed a counter — and got one with the wrong scope.

**The second joint: the refusal path leaves the document ahead of everything durable, and the model cannot say
so.** §6.1 states the failure it repairs in one sentence — *"the document has the change and nothing durable
does"* — and the residual rule above reopens it: the Yjs mutation is authoritative, the synchronous journal
refuses (oversize, quota, unavailable), the forced IndexedDB batch is **asynchronous**, and a page kill in
between loses the only copy of an update the user watched appear. *Not acknowledged* is true of the UI and
irrelevant to the bytes. The executable model cannot schedule this: `commitBatch` is a total synchronous
function, so *"there is no kill point between the journal write and the IndexedDB commit anywhere in the
file"* (round 1 `S-6`) — and the same round showed the refusal state is write-only: never marking `notDurable`
passes 18/18, and acknowledging an unjournallable edit immediately — the verbatim reachable consequence of
[`f-9b49b74-journal-seal-64k-gap`](../../findings/f-9b49b74-journal-seal-64k-gap.md) — passes 18/18. `S0-3`
Stage A concedes the cause honestly: exact update size is known only after the transaction commits, so
admission sits *"before the seal"* — which is after the authority.

**The third joint: a granted reservation can cross the generation advance it was granted before.**
`S0-2`'s step 5 claims the marker advances *"only once no new write can select g"*, and nothing enforces it: a
writer reserves under `g`, `GenerationApply` classifies the durable old-generation objects, the marker advances,
and the writer — holding an already-granted range — encrypts and commits a `g` record **after** classification
closed. Step 7 may then retire the last `g` opener because the late record was in no `GenerationReferences`
snapshot, leaving a record sealed under a generation nothing can open. The re-reserve rule this record states —
*a batch that finds `g+1` active re-reserves under it* — is checked when the batch happens to look, not where
the commit lands. Both suites pass while the composition fails, because `test/writeAdmission.test.ts` rotates
and only then re-reserves, and `test/generationApply.test.ts` runs against immutable arrays with no concurrent
writer ([`f-4259822-generation-switch-local-durability-undefined`](../../findings/f-4259822-generation-switch-local-durability-undefined.md)
composed with `f-3bea0e6`).

All three are one defect class — [`HANDOFF.md`](../HANDOFF.md)'s class 2, *interleavings the pure models cannot
schedule: crash points and second writers that are unexpressible rather than refuted* — and `K_store` is the
class's limit case: the second writer is on another device, under the same key, invisible to every local
counter. `P-4` and `P-1` have ratified class 1's pattern — elapsed time executes a factor-authenticated
instruction, or it does nothing; a verification key resolves through client- or factor-authenticated state, or
it does not verify. This record owes class 2's: **a budget binds only what its counter can see; an edit is
accepted only when a durable carrier holds it; a reservation is only as current as the commit that consumes
it — and a window the models cannot schedule is an open defect, never a passed test.** The rule chosen here is
the one `FU-10` (`S0-4`'s abandoned position — `PositionCounter` is this allocator's shape at §7.4) and `FU-12`
will follow through the scheduler the queue's structural item builds, which is why `P-3` is next in the sprint.

### The reopened question

**Which state contains an admitted write at each of its three windows — the scope of the key its nonce budget
is counted against, the carrier that holds it when the journal refuses, and the fence that keeps its
reservation inside the generation it was granted under — and can the storage models schedule a kill and a
second writer at every one?**

`RC-3C` itself is not reopened. Both challengers preserved the machine: admission and slicing with the prefix a
kill leaves, `MAX_UPDATE` derived from the budget with the 16 kB interim, the local/remote journal split and
accepted-head re-delivery, per-batch exact reservation with disjoint cross-tab ranges, abandoned-invocation
accounting and rotate-before-the-2^32nd-write, the one refusal state wired to PRD §7.10, the
character-denominated watermark, and the covered-set trim all held as built — round 2's verdict is explicit:
*"Preserve cipher choices, AAD, slicing, per-generation reservation and character watermark. Stage/refuse
before authoritative mutation and fence generation selection."* What is reopened is what each of those
guarantees is enforced **against** when a second writer or a kill arrives inside it.

### The floors that are not choices

**The `K_store` floor: no two `SeqCounter`s count invocations of one key.** Whatever is ratified must refuse
round 1's arithmetic: the collision bound row 3 publishes holds for every device count `D` — by a per-counter
key, a collision-free nonce construction, or a divided budget — and the enforcement is a checkable comparison
or invariant, never an assumption about how many devices a workspace grows. Row 3 §4's rule survives corrected,
not repealed: derivation still names the key's scope, and the budget is what fixes the scope.

**The `FU-08` floor: the window is a scheduled, asserted state.** The kill between a journal refusal and the
forced batch's commit becomes expressible — a crash point the scheduler can take — and whatever the ratified
rule says happens there is asserted **at** it. The refusal state becomes readable: round 1's two green
mutations (`notDurable` never set; an unjournallable edit acknowledged immediately) invert into permanent
negatives. And the three causes keep one stated rule, or state per-cause rules explicitly — no cause is left
with silently different behavior behind the one-state claim.

**The `FU-09` floor: no schedule reaches `openers-retired` while an object sealed under `g` is outside the
retirement predicate's view.** Step 5's *"no new write can select g"* becomes enforced or is explicitly
abandoned for an equivalent guarantee at another boundary — never left as an assertion both test suites step
around. Resolving `FU-09`'s conditional is part of ratification: whether the fence completes this record's
reservation transaction or changes it decides whether the return touches `P-3` at all.

**And the window for amending row 3's bytes is the same one `P-1` used.** The format is *selected, and folded
into the TRD* — and it has been amended twice already (`S0-4`, `S0-2`), nothing is closure-selected while
`S0-9` holds `S0-10` blocked, and no encrypted store is implemented or deployed: the only shipped database is
the plaintext `done` store row 3 §7 already orders deleted. Amending the derivation now is a decision
correction; after Stage 0 closes it would be a format migration over real data.

### The options considered

Three sub-questions, one per joint.

**Joint 1 — what makes the per-key bound true for `D` stores.**

**A — the derivation gains the store's identity: one key per counter.** `info` gains the identifier that
separates `SeqCounter`s — a store-instance id minted at store creation, or the device credential where one
exists; Stage A selects the encoding under one constraint: it exists at creation for every store, the
anonymous Local workspace included, and no two counters ever share it. The buy is that the counter already had
the right scope, so the repair completes the derivation rather than adding machinery: `reserved[gen]` bounds
its own key by construction, the sum over devices becomes a sum over distinct keys, and §6.1's 2^-32 claim is
true again under the same one-comparison enforcement. A record that lands in the wrong store now fails at the
key as well as the AAD — defense in depth for §6.7's two-principals-one-profile case row 3 §2 argues from. The
costs, recorded: row 3's formula, §6.1, §15 row 3 and the record vectors amend together (riding the
regeneration `FU-13` already owes); one new cleartext identifier enters the store's metadata and the AAD; and
the derivation's scope rule is rewritten to say what the budget forced.

**B — one shared key, collision-free nonces.** Keep the derivation; replace 12 random bytes with SP 800-38D
§8.2.1's deterministic construction — a store-distinct tag beside the reserved `seq` — so cross-store collision
is impossible and the 2^32 random-IV budget dissolves. The buy is real and newly available:
reserve-before-encrypt is exactly the discipline deterministic nonces need, and row 3's stated reason for rejecting them —
two tabs computing the same next counter — died when the allocator landed. The costs: the tag needs an
assignment authority that keeps it distinct across stores that share a key, importing a class-1 joint into a
purely local path; a restored backup rewinds `next_seq`, and a rewound deterministic nonce is immediate reuse —
catastrophic — where a rewound random path is a bounded accounting error, the same asymmetry row 2 paid 24
bytes to avoid; and the guarantee becomes what row 2 refused in so many words, *"a claim about application
behaviour that a later change can silently invalidate."*

**C — one shared key, the budget divided.** Each store's comparison reads `2^32 / D_max`. The buy is that no
byte format changes. The costs: the divisor is the workspace's device count — unbounded, roster-shaped, and
resolved only in membership state — so a local write path acquires a coordination dependency on the certified
set; every enrollment re-slices every store's remaining budget; and the enforced bound refuses writes a
per-store key would accept. C imports class 1's problem to avoid class 2's repair.

**Joint 2 — when the journal refuses, what holds the update the document already integrated.**

**A — nothing authoritative without a durable carrier.** A handler that meets a refusal returns only after the
document again equals recoverable state: the refused transaction is inverted before return — or the update is
staged and promoted only once carried; Stage A selects the mechanism, the rule is the option — the input is
held as pending, the forced batch commits, and the input re-applies on the ordinary path, sliced if oversize
was the cause. The buy is §12's contract restored as stated: *the document has the change and nothing durable
does* can no longer outlive a handler, the kill schedule finds nothing to lose, and nothing is refused — the
edit lands late by one batch instead of instantly-and-precariously. The costs: an inverse (or a staging apply)
must exist for every local mutation source; under storage pressure a keystroke appears when it is durable
rather than immediately; and the model gains the crash point plus both `S-6` mutations as permanent negatives.

**B — the refusal path gets its own synchronous carrier.** Quota refusals fire at the watermark, which sits
deliberately below the measured wall, so headroom for one entry exists by construction; an oversize update
writes synchronously in bounded segments, breaching the p95 budget once on a path whose rarity is what a
distributional budget licenses (round 1 `S-11`'s point, absorbed rather than fought). The buy is that the
document never rolls back and never waits. The costs: `unavailable` has no carrier by definition — B is not
total and must borrow A or C for exactly the cause least able to afford it; the journal grows a second entry
shape with reassembly on replay, repealing *"no group, no chunk, no reassembly"* on its own backstop; and the
one-state rule fractures into per-cause behavior.

**C — the window stands, stated honestly.** Keep refusal → not-durable → forced batch → withheld
acknowledgement, declare the milliseconds between refusal and commit an accepted loss window for
unacknowledged work, and narrow the WAL theorem at every home that states it — §6.1, §12, PRD §7.10, this
record. It is the smallest diff and the largest concession: it ratifies the exact sentence the journal exists
to refuse, renegotiates `f-9b49b74`'s reachable consequence rather than repairing it, and hands class 2 the
anti-pattern `P-4` refused to hand class 1.

**Joint 3 — where a granted reservation's generation is validated.**

**A — at the record commit, under the serialization the allocator already leans on.** The active marker's home
shares the store's database, so the batch's committing transaction spans it: validate the generation or abort
and re-reserve under the successor — the re-reserve rule this record already states, moved from *when the
batch happens to look* to the one place looking is atomic. IndexedDB serializes overlapping readwrite
transactions, which is the same property the allocator's two-tab argument already rests on; after
marker-advance commits, no transaction can commit a `g` record, so step 3's classification is complete the
moment step 7 consumes it. The buy: the reservation transaction is **completed, not changed** — `FU-09`'s
conditional resolves inside this record, and the fence is one abort branch in a transaction that already
exists. The costs: a raced batch re-encrypts under the successor (bounded by rotation frequency, which is
rare), and the marker's store enters the batch transaction's scope — an `S0-2`/`S0-3` interface amendment.

**B — at the marker advance: leases, drained by step 5.** Reservations carry leases and the marker waits for
`outstanding[g] = 0` or expiry. The buy is an untouched writer path. The costs: a crashed holder blocks
rotation until an expiry, and an expiry is elapsed time deciding a write's validity — the shape `P-4` just
ratified out of the system; and after expiry the zombie's commit must still be refused somewhere, which is
option A again behind a timer. B is A plus a clock.

**C — at retirement: step 7's predicate reads live state in the deleting transaction.** The buy: the reference
ledger `S0-2` already amended into row 3 is the natural home, and late records stay readable instead of
refused. The costs: step 5's published claim is abandoned rather than enforced; writes under a superseded
generation land arbitrarily late; and for the rotation that exists because `g` was **exposed**, a late writer
sealing fresh content under the exposed key is the regression rotation is for. C protects the record and
forfeits the rotation.

### Awaiting ratification

The ratifying edit selects one option per joint, argues each against its floor, resolves `FU-09`'s conditional
explicitly, and instantiates falsifiers 14, 15, 17, 19 and 20 against the selected rules. Until then `S0-3`
may consume nothing in this record as settled — the original sections included, since the derivation and the
batch transaction are in play.

### Falsifiers 14–22

Continuing the thirteen above, under the floors. Each is a test, not a claim; 16, 18, 21 and 22 bind every
option, and the rest read "the ratified rule" as whatever ratification selects.

14. **The reproduction fails with the scope real.** Two stores holding the same `K_g` never derive one
    `K_store` under the ratified rule; today's identical derivation is the mutation that must fail, and
    deriving for another store fails to open — the `wrong-store` sibling of `wrong-workspace-subkey`.
15. **The budget binds a key again.** Every invocation of each `K_store` instance is counted by exactly one
    durable state, and a `D`-writer model at the budget's edge shows no key exceeding 2^32 invocations — the
    sum-over-stores term round 1 computed is structurally zero, or provably bounded, under the ratified rule,
    for every `D`.
16. **No uncounted key.** For every AEAD key on the write path — each `K_store` instance, `K_journal`, the key
    envelopes — one home names either the durable state that counts its invocations or the nonce discipline
    that needs none, and a key with neither fails a checker rather than a review. Row 2's 24 random bytes pass
    by the second clause; today's `K_store` fails by both.
17. **The refusal window is schedulable and survives.** The scheduler kills the model between a journal
    refusal and the forced batch's commit, and the ratified rule's outcome is asserted at that point: for a
    carrier option, no reload shows a document ahead of what durable state can rebuild; a renegotiation
    (option C) must instead assert its bounded, marked loss at the same point and narrow the WAL theorem in
    every home falsifier 22 reads.
18. **Acknowledgement is load-bearing.** Round 1 `S-6`'s two green mutations are permanent negatives: a model
    that never sets `notDurable`, or that acknowledges an unjournallable edit before IndexedDB commits, fails
    a test — the refusal state is read, not write-only.
19. **A granted reservation cannot silently outlive its generation.** The interleaving reserve-under-`g` →
    marker-advance → commit-under-`g` is schedulable, and under the ratified fence the late commit aborts and
    re-reserves, or is re-counted before any retirement — and the abandoned range stays counted against `g`,
    composing with falsifier 8.
20. **The retirement composition fails.** No schedule reaches `openers-retired` while any object sealed under
    `g` is outside the retirement predicate's view — clauses (a)–(c) hold under concurrency, asserted with
    `writeAdmission` and `GenerationApply` composed in one scheduled model rather than two sequential suites.
21. **No unscheduled window on the write path.** For every check-to-commit pair — admission to seal, refusal
    to batch commit, reserve to record commit, classification to retirement — the scheduler expresses a kill
    and a second writer, and its coverage check fails on a write-path boundary it cannot express, rather than
    a review noticing.
22. **The homes agree.** TRD §6.1, §15 row 3's cell, `row-3-record-format.md`, the record generator's
    published rule text, `S0-3/A-schemas.md`, `S0-2`'s step-5 claim and this record state the ratified scope,
    carrier and fence and the covered-set trim — and a readback fails while any home still publishes *still
    open*, a budget *`seq` bounds*, the exact-watermark rule, or the store-shared derivation. The
    `FU-07`/`FU-13` shape, refused here as `P-4` and `P-1` refused it at theirs.

### Consolidation owed at `S0-3`, regenerated at `S0-8`

- TRD §6.1: the scope sentence (*"`K_store` is per generation"* gains the ratified scope), the ratified
  refusal-path rule, and the fence; §15 row 3's cell rewritten — *still open* and *a budget that `seq`
  bounds* both die there (`E3`).
- `row-3-record-format.md` §§3–4: the derivation formula and the corrected scope rule;
  `generate-record-vectors.mjs`: the formula, the published rule string (*"…bounded by seq"*, round 1 `S-5`),
  and the `wrong-store` negative — republication rides the `S0-8` regeneration `FU-05` already shares.
- `S0-2/A-schemas.md`: step 5 and `GenerationReferences` gain the ratified fence; `S0-3/A-schemas.md` §§4–6
  and its falsifier map continue under the same rules.
- `test/writeAdmission.test.ts`: `S-6`'s mutations invert to permanent negatives; the model gains the refusal
  crash point and the marker interleaving through the scheduler the queue's structural item builds, with the
  composed `writeAdmission` × `GenerationApply` schedule for falsifier 20.
- The falsifier-22 readback lands as an independent checker at `S0-1`/`S0-8`, per `E3`/`E4` — the
  `status:check` shape, pointed at the write-admission homes.
- PRD §7.10 and §7.1 amend only if the ratified refusal rule changes the product surface.

### What this reopening does not decide

- **`MAX_UPDATE`'s value** — still derived, never chosen, still `L-4` with the declared population
  (`f-bd87655`). Round 1 `S-10` sharpened the debt without moving it: the Pixel 9a numbers were taken on the
  one-slot harness this tree already replaced, so the population measurement owes a re-run on the repaired
  harness, and `limit:check`'s precision is bounded by that until taken.
- **Round 1 `S-11`'s conversion doubt.** The p95-to-ceiling derivation stands as the rule `RC-3C` ratified;
  the doubt is on record, its live half — whether a rare backstop may breach the budget — is priced inside
  joint 2's option B, and the value question is the same `L-4` return.
- **The sibling class-2 joints** — `FU-10` (`S0-4`'s abandoned position; `PositionCounter` is this
  allocator's shape at §7.4) and `FU-12` (`S0-7`'s reseed branches). This record sets the pattern they follow
  through the scheduler; their rulings stay at their own returns.
- **The scheduler itself** — the queue's structural item 3(b) builds it at the `S0-2`/`S0-3` interface; this
  record's falsifiers consume it and do not specify it.
- **The trim.** Covered-set semantics are `S0-3`'s ratified result; `FU-13` propagates them into this record,
  and nothing here re-decides them.
- **The slice boundaries, the WASM buffer, and the `1:` plaintext entries** — exactly as the original
  not-decided list left them.
- **The exact bytes** — the store identity's encoding, the marker's store, the inverse-or-staging mechanism —
  `S0-3` Stage A selects encodings under the ratified rules, as `P-1` reserved for its bootstrap.
