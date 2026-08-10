# done — Root document architecture

**Status:** Exploration, not a decision
**Date:** 2026-08-10
**Against:** `2f679c7` (main)
**Companion to:** [TRD.md](./TRD.md) §4.2, §4.5, §4.9, §10.4, §10.8 · [PRD.md](./PRD.md) §14 Q3

---

## How to read this

TRD §10.8 records a schema problem, a fix, four costs, and a rule for when to pay them: _"Not
for correctness — the mitigation is tested and holds. Do it if the reconstructed Done order is
visibly wrong in real use, or if something else needs the day map to stop being a
concurrently-created container."_

Neither trigger has fired. This document exists because a third thing happened instead: the
sync work on main changed what the fix costs. It re-examines §10.8's four costs against the
code that is now there and against measurements rather than estimates, finds two costs §10.8
does not list, and names three alternatives §10.8 did not consider.

**It does not recommend doing it now.** It argues the decision has moved from "expensive and
hard to validate" to "cheap and mechanically checkable", and records what the work would
actually be so that when a trigger does fire the answer is not reconstructed from scratch.

Measurements are labelled with what produced them. Where something was not measured it says so.

---

## 1. The problem, restated

`ensureDay` materialises a day as `days.set(date, new Y.Map())`. A `Y.Map` key is
last-write-wins over whole values, so two devices writing to a date neither has touched before
mint two different maps for one key. One wins outright and the loser's map is deleted, taking
its three collection arrays and every id in them.

Nothing is lost, because card content and canonical membership live in roots that merge by id
(`cards`, `cardLocations`) and `repairCardMemberships` re-homes anything located but unfiled.
What is lost is **array position**, and §4.9 recomputes one from `Card.createdAt`.

That reconstruction is the whole of the debt. It is why `createdAt` must be strictly increasing
per device, why `compareInstants` exists, and why PRD §14 Q3 is open.

Measured directly (Yjs 13.6.31; two docs, offline, each composing three cards into
`2026-08-05`, Done taking arrivals at index 0):

```
nested day maps   a: [b#2, b#1, b#0]   b: [b#2, b#1, b#0]      ← three positions destroyed
root types        a: [a#2, a#1, a#0, b#2, b#1, b#0]   b: identical
```

---

## 2. What changed on main, and why it matters here

Three landed changes move this, and only the third was aimed at it.

### 2.1 Day arrays now hold nothing but ids — so the migration is a string copy

Schema v1 embedded `Card` maps, each owning a `Y.Text`, directly in a day's arrays.
`migrateCardsToRegistry` moved them into the canonical `cards` registry and left the arrays
holding ids.

This is the difference between a schema change that is possible and one that is not. **Yjs
cannot move a type between parents.** Relocating a container whose children are live `Y.Text`
means recreating them, which severs every card's collaborative identity and discards the
concurrent edits an offline replica is holding against the old one. That is the same hazard
that pauses destructive compaction (§4.5), applied to a migration nobody could opt out of.

Day arrays today hold UUID strings. Copying strings into a differently-addressed array is not a
CRDT operation at all — it is data movement with no identity to preserve.

### 2.2 The repair already cleans up after a migration two devices run at once

A migration that copies forward runs independently on every replica, so two devices that
migrate while apart both write the same ids into the same root array, and the merge holds each
id twice. Measured:

```
device a and device b each migrate offline, then merge
result on both:  [c3, c2, c1, c3, c2, c1]
```

`repairCardMemberships` already classifies that as `duplicate-in-array` and removes it, and
`syncProperties.test.ts` already asserts the repairs agree across replicas and that the network
goes quiet one round after the last change. The convergence behaviour a migration needs is not
new work — it is the mechanism that shipped in #14/#15, already under property test.

### 2.3 The property harness is what makes the change decidable

`test/replicas.ts` gives a relay, N replicas, seeded-and-replayable client ids, a named defect
vocabulary, and a `converge()` that runs to a fixpoint and reports how many rounds it took.
`syncProperties.test.ts` states seven properties over generated schedules of edits and
partitions.

Every one of those properties is written against `openStore`, `compose`, `cardsIn` and
`placements` — the application surface, not the storage shape. **They re-run against a new
schema unchanged.** That is the acceptance criterion for this work, and before #13 it did not
exist; the change would have been validated by reading it carefully and hoping.

Baseline, on this branch, before any change:

```
test/syncProperties.test.ts test/membership.property.test.ts test/convergence.test.ts
test/multiDevice.test.ts test/syncDefects.test.ts
Test Files  5 passed (5)      Tests  34 passed (34)      31.00s
```

### 2.4 The UI already has the subscription primitive a root-typed world needs

`useYValue(store.days, …)` works because `days` is one root with everything under it.
Root-typed collections have no common parent. The replacement already exists: `useYDocValue`
subscribes to `doc.on('afterTransaction')` with a `shouldRefresh` filter, and
`transactionAffectsMembership` is the shared classifier. Both were built for the recovery panel
in #15. Nothing new is required; three call sites move.

---

## 3. Measurements

A decade of days (3,650 days × 5 cards in Done, all three sections materialised per day), real
UUID card ids, Yjs 13.6.31, node 22 under vitest's jsdom environment. `load` is the median of
five `applyUpdate` calls into a fresh `Y.Doc`. One machine, one synthetic shape — treat the
ratios as indicative and the orders of magnitude as sound.

| shape          | state             | encoded state | `doc.share` | load median |
| -------------- | ----------------- | ------------: | ----------: | ----------: |
| nested day map | live              |       909 KiB |           1 |       38 ms |
| **root types** | live              |   **759 KiB** |      10,950 |   **11 ms** |
| nested day map | compacted (empty) |        75 KiB |           1 |        8 ms |
| **root types** | compacted (empty) |    **82 KiB** |      10,950 |       10 ms |

Two readings, and the first is the one that matters:

**In the world that exists, root types are cheaper.** Destructive compaction is safety-paused
indefinitely (§4.5, §10.4), so days stay live. In that state root types are 17% smaller on the
wire and load 3.5× faster — the nested shape pays for a `Y.Map` and three nested `Y.Array`
types per day as _items_ that must be integrated into a parent, where a root type is a hash
lookup by name.

**In the world §10.8 was worried about, the cost is 7 KiB per decade.** If destructive
compaction ever returns, the nested shape can delete a day map outright and root types can only
be emptied. That is a real asymmetry and §10.8 is right that it falsifies "bounded by the
window, not by history length". It is worth +7 KiB and 10,950 `doc.share` entries per decade.

Both shapes are an order of magnitude inside §12's 500 ms budget for document load.

---

## 4. §10.8's four costs, re-examined

**1. Root types are never removed from `doc.share`.** Still true. Now quantified at +7 KiB and
~11k entries per decade, against a present-day saving of 150 KiB and 27 ms of load. The
property §10.8 worried about falsifying — §4.5's "object count bounded by the window, not by
history length" — **has already been falsified by the compaction pause**, which says so in its
own words: _"The pause deliberately gives up the intended bound on structured card objects:
until a safe protocol replaces deletion, object count can grow with history."_ This cost is
already paid, in full, for a different reason.

**2. A schema migration.** Cheaper than §10.8 assumes, per §2.1 and §2.2: a string copy whose
concurrent execution converges under machinery that is already property-tested.

But the migration has a wrinkle §10.8 does not reach, and it is the same one that paused
compaction: **you can copy the legacy arrays forward, and you cannot safely delete them.** A
device offline across the migration may hold writes against the old containers. So the
migration is not one-shot-on-version; it is an idempotent union that keeps running while any
legacy day array is non-empty, and the legacy `days` root stays readable forever. The cost is
dead weight bounded by pre-migration history, which for this app is months, not decades.

(A straggler's cards are not at risk either way — they return through the registry and the
repair, exactly as they do today. Keeping the legacy read only improves _order_ fidelity for
them.)

**3. `listDays` changes shape.** §10.8 assumes it becomes "a filtered, parsed enumeration of
`doc.share`". It should not be, and the reason is measurable:

```
device a creates day:2026-08-05:next locally, never writes to it, then syncs
share on a:  [day:2026-08-05:next, day:2026-08-06:done]
share on b:  [day:2026-08-06:done]
```

**A root type that is created but never written is not replicated**, so `doc.share` is not a
replica-deterministic enumeration of anything. The right source is `cardLocations` — replicated,
canonical, already the membership authority — plus the legacy `days` keys for archives.
`listDays` becomes the distinct dates in the location map, which is _more_ deterministic than
today's day-map keys, and makes §4.2's "an untouched day occupies nothing" true by construction
rather than by the discipline of only calling `ensureDay` from write paths.

**4. Call sites.** Accurate. Enumerated in §6.

---

## 5. Two costs §10.8 does not list

**5. Undo scope is fixed at construction.** `createUndoManager` is called once over
`[master, days, cards, cardLocations]`. Day collections as root types are created _after_ that,
so they are outside the scope and their changes are not undoable. Yjs exposes
`UndoManager.addToScope`, and `collectionAt` already runs before the operation's transaction —
that is the hook. The alternative is scoping the manager to the `Doc`, which is simpler and
newly includes `meta`, making a settings change undoable when it currently is not.

Either is fine. Neither is free, and the failure mode is quiet: undo works for every day that
existed at load and silently does nothing for one created since.

**6. The membership classifier loses its parent, and the obvious fix is O(`doc.share`).**
`transactionAffectsMembership` currently recognises a day collection by walking up to the `days`
map. With root types there is no parent to walk to. Yjs's `findRootTypeKey` looks like the
answer and is a linear scan over `doc.share` that throws when the type is not a root — 11k
comparisons per changed type, on a classifier that runs on every transaction, i.e. on the
keystroke path §12 budgets at 16 ms.

The fix is a reverse map maintained where the collections are created, not a lookup. Cheap and
exact — but it has to be built deliberately, because the wrong version passes every test and
only shows up as a document that has been open for years.

---

## 6. What Option A would touch

`day:ISODate:section` as root arrays, per §10.8's own fix.

| File                                              | Change                                                                                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/crdt/yjs.ts`                                 | `rootArray(doc, name)` — the seam is the only file allowed to name `yjs`, enforced by `test/seam.test.ts`                                                                                                   |
| `src/crdt/days.ts`                                | `collectionOf` becomes doc-addressed; `ensureDay` → `ensureCollection`; `listDays` derives from `cardLocations`; `dayAt`/`Day` shrink to the legacy-archive accessor; the Done branch of `rehomeIndex` goes |
| `src/crdt/doc.ts`                                 | `SCHEMA_VERSION` 5, and the idempotent forward-copy migration of §4-cost-2                                                                                                                                  |
| `src/crdt/moves.ts`                               | `collectionAt` calls `ensureCollection` and extends the undo scope; nine `dayAt(…)` lookups become doc-addressed                                                                                            |
| `src/crdt/compaction.ts`                          | `hasCards` / `compactDay` read root collections; the deletion path stays paused                                                                                                                             |
| `src/crdt/freeze.ts`, `export.ts`, `serialize.ts` | `listDays` source only                                                                                                                                                                                      |
| `src/ui/Collection.tsx`, `RecoveryPanel.tsx`      | `useYValue(store.days, …)` → `useYDocValue(store.doc, …, transactionAffectsMembership)`                                                                                                                     |
| `src/ui/StaleBanner.tsx`                          | raw `store.days.observeDeep` → `doc.on('afterTransaction')`                                                                                                                                                 |
| `src/crdt/index.ts`                               | undo scope, per §5                                                                                                                                                                                          |

**What it deletes:** the Done branch of `rehomeIndex`, the strictly-increasing requirement on
`createdAt` and the monotonic clock behind it, and `compareInstants` from `src/`.
`repairCardMemberships` keeps its array reconciliation — it still covers the undo defects in
`syncDefects.test.ts` — but its "located card that no array holds" branch stops being a
routine path and becomes the rare one.

---

## 7. A behaviour change nobody has written down

Root types do not simply preserve the order. They change what a cross-device merge _looks
like_, and in one case they lose something.

Today there are two cases:

- **The day exists on both devices.** Both insert at index 0 of the same array. Yjs breaks the
  concurrent-insert tie by client id, so each device's run lands as a block. **Device-grouped.**
- **Neither device has written to the day.** One array is destroyed and its cards are re-homed
  by `createdAt`, which merges the two records _by time_. **Time-interleaved.**

With root types both cases become the first. Measured, three devices, each completing three
things while apart:

```
[a#2, a#1, a#0, b#2, b#1, b#0, c#2, c#1, c#0]
```

So the change makes the two cases consistent and removes a time-interleave that exists today
only as an accident of the repair. TRD §4.9 already licenses this — _"Two devices may still tie,
and there the tie is real — nothing happened first — so any deterministic choice is correct as
long as every replica makes the same one"_ — and device-grouping is a deterministic choice.

What it definitively fixes is PRD §14 Q3's actual complaint: a card written in Next in the
morning and finished in the evening comes back where it was _finished_, because the position is
the insertion position and the insertion happened at completion. Nothing is reconstructed from
a write time that was never the right key.

Worth naming before it is discovered.

---

## 8. Three alternatives

**B — a subdocument per day.** Rejected. Each subdoc carries its own load lifecycle and its own
provider room: §6.1's load-before-connect becomes N races instead of one, y-indexeddb needs a
store per subdoc, the relay stops being a dumb pipe for one document and becomes a
room-per-day router, `Y.UndoManager` does not span subdocs, and export and search must wait for
subdocs to load. It buys history-scoped loading, and §3 measures a decade at 759 KiB and 11 ms.
Nothing is being bought.

**C — no containers at all: ordering as a key in the canonical register.** Make the
`cardLocations` value `date:section:order`, with `order` a fractional index, and derive
collections from it. This deletes every container race, the day map, and the array-reconciliation
half of `repairCardMemberships` at once; the undo scope stays three stable roots forever.

It also gives up the sequence CRDT. Concurrent reorder becomes last-write-wins on a key, two
devices inserting "at the top" pick the same index and need a tie-break, and concurrent
insertion interleaving is the classic fractional-index problem rather than something Yjs
handles. TRD §4.3 chose arrays deliberately and this walks it back. Not now — but it is the
shape to reach for if the repair ever becomes the problem rather than the fix.

**D — three global root arrays.** `order:next`, `order:scheduled`, `order:done` for all time,
with a day's collection being the subsequence whose ids `cardLocations` places there.

This is the interesting one, because it dominates Option A on four of the six costs: the
container count is fixed at three forever, so `doc.share` stops growing and §10.8's cost 1
disappears entirely; the undo scope is static, so §5's cost 5 disappears; the classifier stays
trivial, so cost 6 disappears; and compaction _can_ delete entries from these arrays, so growth
stays reclaimable. Sequence-CRDT ordering is preserved natively, and a move is still one splice
plus one insert in one transaction, so §4.3's argument survives intact. Positions stay honest
too — a card moved into Done is inserted at the head of `order:done` at the moment it is moved.

Its cost is that reading one day becomes a filter over all history where today it is O(day).
A decade is ~18k ids; a `toArray()` and filter at that size is sub-millisecond, but it lands on
`cardsIn` and `countIn`, which run inside the Collection snapshot key on every transaction —
which is to say, on the keystroke path. Mitigable with a derived date→ids index, and §10.3 is
already the standing warning about derived state that can drift.

**Not measured.** If a trigger fires and this is being decided seriously, measure D's read cost
against §12's 16 ms keystroke budget at a decade of history before choosing between A and D.

---

## 9. Where it stands

Option A is recommended if and when a trigger fires: it is §10.8's own fix, it is the smallest
semantic departure, its costs are now measured rather than estimated, and in the world that
actually exists — compaction paused — it is a net saving on both document size and load time
rather than a cost at all.

Option D deserves the measurement in §8 first, and becomes the better answer if destructive
compaction ever returns, because it is the only shape whose growth is reclaimable.

**Neither trigger from §10.8 has fired**, and this document does not claim one has. What has
changed is the standing of the argument: the migration went from impossible-without-loss to a
string copy (§2.1), the convergence it needs is already tested (§2.2), the acceptance criteria
already exist and are green (§2.3), and the largest stated cost turns out to be a present-day
saving (§3, §4).

If the work is taken up, the tests to write are:

- Every property in `syncProperties.test.ts`, unchanged. That is the point of them.
- The two tests in `a day both devices create at once` keep their names and lose their reason:
  no array is destroyed, so nothing is re-homed. Strengthen the second to assert the merge is
  device-grouped, per §7 — that becomes the contract.
- A property that `createdAt` is no longer load-bearing: pin it to a constant across a fleet and
  assert Done's order still holds. A dependency you believe is gone should be falsifiable.
- A migration property: a fleet where replicas migrate at different times, including one that
  writes to a legacy array while offline across the migration, converges with nothing stranded.
- Whatever guards §5's cost 6 against becoming an O(`doc.share`) scan on the keystroke path.

---

## Sources

- [Yjs](https://github.com/yjs/yjs) · [Subdocuments](https://docs.yjs.dev/api/subdocuments) · [UndoManager](https://docs.yjs.dev/api/undo-manager)
- Measurements in §3 and the merge behaviour in §1 and §7 were produced against `2f679c7` with
  a throwaway spike under `vitest`, not retained; the shapes are reproducible from the tables.
