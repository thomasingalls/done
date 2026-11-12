# Phase 556 — size each preparation slice to what its attempt paid, and open every saved row each attempt

The coordinating session asked on 2026-11-12 for the first two changes of [investigation 10](../investigations/10-reduction-slicing.md), in order:
1. a baseline with no source change;
2. change A, then a measurement;
3. change D, then a measurement;
4. ρ tuned only if the numbers asked for it.

E (shrinking the fenced save), G (which jobs count for the waiting message) and F (a continuous pass) need the operator and were not started.

What was built:
- **A measurement probe** (`scripts/performance/reduction-cost/`): one real local reduction on the real Account content owner. It runs either sliced through the resumable journal (the production profile) or as one uncached pass (RESUME off, the floor).
- **Change A.** A slice's fresh-work budget grows with what its attempt already paid. It never plans past the moment routine sync resumes.
- **Change D.** Every attempt decrypts every saved row itself; no decrypted row is reused from the journal.

**What changed in the checks.** No check is weakened or narrowed:
- Eligibility, row placement, the counter check, candidate building and comparison, plan coverage, inventory equality at commit, readback and the reload replay all run exactly as before.
- Every journal guard runs as before.
- The fence and everything it protects (the allocation reserve, a flushed Window journal, fresh readiness, authority and journal checks at the head) are untouched.
- No stored format and no limit changes.

Change D makes one check run more often: opening a row now always runs authenticated decryption.

## Result

**The square is gone from repeated work.**
- On an emulated four-times-slower device, the phase 555 source made 1, 2, 4, 9 to 11 and 21 fenced saves from 128 to 2,048 own-plus-peer pairs. Full inventory reads went 8, 11, 17, 32 and 68, and prefix hashes 7, 13, 25, 55 and 127.
- After A and D the counts are flat at every size: at most 1 save, 8 full reads and 7 prefix hashes.

**The cost falls to about the uncached pass at the largest size.** At 2,048 pairs on the emulated slower device:
- before: 281.9 s, 7.7 times the 36.7 s uncached pass;
- now: 43.9 s, 1.24 times;
- with the production 2 s target: 98.0 s (2.67 times) before, 43.3 s (1.22 times) now.

**The stop condition is met on saves, and on wall time at most sizes, but not on every measure.**
- **Saves.** The condition says fenced saves grow no faster than log N. They are now constant (0 or 1) at every size.
- **Wall time.** The condition says at most 1.5 times the uncached pass. That holds with the 2 s target at every size (1.16, 0.77, 1.19, 1.44, 1.22). On the emulated slower device it holds except at 128 pairs (1.72, on 0.65 s) and 1,024 pairs (1.59).
- **CPU time.** The probe also records process CPU, which counts WebCrypto's worker threads. On CPU, 1,024 pairs is 1.88 and 1.86, and the slower device is 1.54 at 512 and 1.51 at 2,048.
- **What the remainder is.** A reduction that needs more than one slice pays one extra attempt's setup, one fenced save, and the journal's own bookkeeping per check. See [What remains](#what-remains).

**V is not linear in history; the report could not tell.**
- The uncached pass took 0.65, 1.4, 3.6, 10.9 and 35.5 s from 128 to 2,048 pairs.
- Its coverage stage alone took 0.15, 0.6, 1.7, 6.5 and 24.7 s, about four times per doubling.
- That stage checks every update row against the candidate snapshot (`localRetentionPlan.ts`, the coverage loop). Each check of a row not stored verbatim forks the whole candidate document.
- Verifying grows about 2.3 times per doubling.

This quadratic is in the floor itself, in a check this phase may not change. It is recorded under REDUCE-FURTHER. It contradicts nothing in the report, which named the coverage fork as the likely cause and set the stop condition relative to the uncached pass for that reason.

## How it was measured

**The probe** (`reduction.probe.ts`, run through `run.sh` with `vitest.config.ts`) uses:
- the real content owner, real WebCrypto and fake in-memory IndexedDB;
- the fixture of phase 542's size probe (`memberFixture`): each pair is one own position with its spool, delivery and response rows, plus one received peer receipt, so 9 rows a pair;
- the history built and sealed once per size, then copied byte for byte into a fresh store for every run.

**What it records per attempt** (instrumentation wraps module boundaries only):
- time to the first fresh check, fresh time, fenced save time;
- hits and misses, delta bytes and saved journal size W;
- SHA-256, AES and HMAC calls and bytes;
- full inventory reads and prefix captures;
- process wall and CPU time.

**Arms:**
- uncached (RESUME off);
- sliced with the production 2 s target;
- sliced with a 0.5 s target. A device k times slower with the 2 s target slices like this host with a 2/k s target, so the 0.5 s arm emulates a four-times-slower device. On this desktop the 2 s target rarely slices below 512 pairs.

**Runs.**
- Three runs per arm up to 1,024 pairs, two at 2,048.
- The phase 555 source's second 0.5 s run at 2,048 ran out of memory in its shared process after 282 s; its first run stands alone.
- Times are medians. Counts are the median run's.

**Host.**
- One Mac, with load averages of 4 to 12 from other work, and no other test run of mine overlapping (checked before each run).
- Wall times vary by up to 30% between runs: the A-and-D uncached runs at 256 pairs took 2.4, 1.4 and 2.3 s. Counts do not vary with load.

**What it is not.** It is not a device and not a browser. `pnpm test:local-baseline` fails before any change (its repair is queued separately), so this phase's evidence is this probe and the unit tests.

Full tables: [tables.md](./tables.md). Raw results stay outside git; the hash of each is in [raw-hashes.json](./raw-hashes.json).

## Baseline: the phase 555 source

| Pairs | Uncached s | 2 s target: sliced s (wall, CPU ratio) | saves | 0.5 s target: sliced s (wall, CPU ratio) | saves | full reads | prefix hashes |
|---:|---:|---|---:|---|---:|---:|---:|
| 128 | 0.7 | 0.8 (1.13, 0.95) | 0 | 1.1 (1.66, 1.69) | 1 | 8 | 7 |
| 256 | 1.4 | 2.0 (1.37, 1.29) | 0 | 3.1 (2.17, 2.51) | 2 | 11 | 13 |
| 512 | 3.7 | 6.6 (1.76, 2.09) | 1 | 9.2 (2.46, 3.94) | 4 | 17 | 25 |
| 1024 | 10.6 | 20.0 (1.89, 2.71) | 2 | 43.2 (4.09, 8.46) | 9–11 | 32 | 55 |
| 2048 | 36.7 | 98.0 (2.67, 4.91) | 4–6 | 281.9 (7.68, 15.74) | 21 | 68 | 127 |

Full reads and prefix hashes are for the 0.5 s arm. At 2,048 pairs on that arm:
- the time to the first fresh check grew from 0.4 to 15.3 s over 22 attempts;
- fenced saves took 1.3 to 7.6 s each;
- fresh work stayed at 0.5 s per slice;
- the first attempt's slice was spent entirely on caching decrypted rows: 18,432 of them, 19.0 MB of the 30 MB journal at the 2 s target.

The investigation's account of the square holds as measured.

**The uncached pass by stage** (A and D, which leave this pass alone; ms):

| Pairs | Rows | Opening | Verifying | Building | Coverage | Commit | Total |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 128 | 1152 | 34 | 372 | 15 | 148 | 64 | 650 |
| 256 | 2304 | 66 | 1506 | 25 | 615 | 65 | 2292 |
| 512 | 4608 | 136 | 1420 | 56 | 1702 | 211 | 3553 |
| 1024 | 9216 | 328 | 3487 | 195 | 6522 | 349 | 10946 |
| 2048 | 18432 | 722 | 8467 | 838 | 24655 | 570 | 35377 |

## Change A: a slice's budget grows with what its attempt paid

**The change.**
- **`src/crdt/retentionPreparation.ts`.** `createPreparationJournal` takes four new options: the attempt's start (`setupSince`), the last fenced save's duration (`carriedMs`), an optional `deadline` and a `ratio` (`PREPARATION_SETUP_RATIO = 2`).
  - At the first fresh check the budget is fixed at max(`PREPARATION_SLICE_MS`, 2 × (time since the attempt began + the last save's duration)).
  - It is never planned past `deadline` less that save.
  - Without `setupSince` the budget is the plain target, as before. The line `export const PREPARATION_SLICE_MS = 2000;` is unchanged.
- **`src/crdt/contentStore.ts`.** `prepareHistoryRemoval` notes its start, keeps the duration of the last successful fenced save, and places the scheduler's window on its own clock. After a slice is cut short, the next keeps the plain target until one saves.
- **`src/crdt/automaticLocalRetention.ts`.** Each attempt is told when routine sync resumes (`protectedUntil`).
- **`src/crdt/accountReceive.ts`** passes that moment to the owner.

**Why it bounds the total.**
- An attempt's setup (re-reading the inventory, re-hashing the prefix and every saved input, reloading the journal) and its save are what repeat.
- A slice at least ρ times that long keeps the repeats under 1/ρ of the fresh work.
- Each slice is longer than the last as W grows, so the number of slices grows about with the logarithm of the work.

**Under phase 540's poll deferral (any device).**
- The deferral lasts 60 s from a run's first slice, and slices that follow at once share it.
- A grown slice is capped so that it and its save end inside what is left.
- Once the deferral lapses, idle polls resume, and in the yield that follows each slice keeps the plain target. A routine poll therefore never cuts a slice it was meant to protect.
- If a run's setup alone outlasts the deferral, the slice keeps the plain target and can be cut, as before.

**Under phase 546's progress-bounded hold (a device on the full check).**
- The settled hold's budget is five minutes. A grown slice is capped to end, with its save, before the budget lapses. After that the yield applies as above.
- Because a grown slice saves inside the window, the held window ends with progress, and phase 546 lets it return after its yield.

**What can still cut a long slice.** A content hint, input, an authority change or any other queued storage job, exactly as before.
- The loss is bounded by the slice: at most ρ × (setup + last save).
- After such a cut the next slice keeps the plain target, so a device interrupted at a steady rhythm still finishes. It is slower than before this phase in that regime: see [At review](#at-review).

**What does not change.** A read-only slice still checks the owner's guard at every guarded step (every storage and crypto call) and yields every 8 ms of CPU. Input still stops it at its next guarded step, whatever its length.

**After change A:**

| Pairs | Uncached s | 2 s target: sliced s (wall, CPU ratio) | saves | 0.5 s target: sliced s (wall, CPU ratio) | saves | full reads | prefix hashes |
|---:|---:|---|---:|---|---:|---:|---:|
| 128 | 0.7 | 0.8 (1.23, 1.23) | 0 | 1.2 (1.76, 2.03) | 1 | 8 | 7 |
| 256 | 1.4 | 1.9 (1.42, 1.40) | 0 | 2.4 (1.77, 1.97) | 1 | 8 | 7 |
| 512 | 3.8 | 6.5 (1.70, 2.08) | 1 | 6.9 (1.80, 2.71) | 2 | 11 | 13 |
| 1024 | 10.7 | 15.5 (1.45, 1.96) | 1 | 17.2 (1.61, 2.16) | 1–2 | 11 | 13 |
| 2048 | 37.5 | 44.1 (1.18, 1.56) | 1 | 56.7 (1.51, 2.13) | 2 | 11 | 13 |

Saves and full reads are flat. What still costs is the first attempt's slice: it caches every decrypted row (19 MB at 2,048 pairs), and every later attempt and save re-hashes, reloads and re-authenticates those rows.

## Change D: every attempt opens every saved row

**The change.** `src/crdt/localRetentionPlan.ts`: the opening loop always decrypts a row with authenticated decryption. Before, it returned a decrypted copy from the journal whose input it had re-hashed. The `opened:` receipt slot stays in the journal grammar, so an older journal still authenticates; no code consults it.

**Why.**
- Reusing a cached row cost a hash of the same ciphertext, about what authenticated decryption costs.
- It also cost the row's share of every save, readback and load of the journal.
- At 2,048 pairs the saved journal falls from 19.0 MB to 4.6 MB after the first slice. Decryptions per attempt rise from a few hundred to one per row (20,500), and the time to the first fresh check rises accordingly.

**A journal in progress across an update.**
- The verifier identity is a digest of the whole source tree and the build flags (`vite/retentionPreparationIdentity.ts`). Every release, this one included, therefore changes the context a journal is bound to.
- The first attempt after the update reads the saved journal as `stale` and runs with an empty journal.
- Its first fenced save replaces the old head and chunks: `savePreparationDelta` clears both when no head was imported.
- The reduction finishes; nothing halts or parks. The cost is the work saved before the update, once.
- If the identity were unchanged (development builds), old `opened:` receipts would be imported and never consulted.

The test "a journal in progress across an update restarts cleanly and finishes" shows this: a saved slice under one identity, then a reopened owner under another; no reuse, no halt or park, completion, and no opened receipt checked.

**After A and D:**

| Pairs | Uncached s | 2 s target: sliced s (wall, CPU ratio) | saves | 0.5 s target: sliced s (wall, CPU ratio) | saves | full reads | prefix hashes |
|---:|---:|---|---:|---|---:|---:|---:|
| 128 | 0.7 | 0.8 (1.16, 1.05) | 0 | 1.1 (1.72, 1.64) | 0–1 | 8 | 7 |
| 256 | 2.3 | 1.8 (0.77, 0.94) | 0 | 2.2 (0.97, 1.30) | 1 | 8 | 7 |
| 512 | 3.6 | 4.2 (1.19, 1.17) | 0 | 5.1 (1.45, 1.54) | 1 | 8 | 7 |
| 1024 | 10.9 | 15.8 (1.44, 1.88) | 1 | 17.4 (1.59, 1.86) | 1 | 8 | 7 |
| 2048 | 35.5 | 43.3 (1.22, 1.47) | 1 | 43.9 (1.24, 1.51) | 1 | 8 | 7 |

(The 256-pair uncached median is high: its three runs took 2.4, 1.4 and 2.3 s under load.)

## ρ was tried at 4 and left at 2

With ρ = 4, larger histories often finish in one attempt. At 2,048 pairs that gives 1.15 and 1.08 times by wall clock, and 1.30 and 1.16 by CPU. The other sizes moved within the run-to-run noise:
- 1,024 pairs stayed at 1.41 times wall and 1.79 CPU on the 2 s target;
- 256 pairs on the slower device became 1.62.

Meanwhile the work one interruption can lose doubles, to 4 × (setup + save). The numbers do not clearly ask for it, so ρ stays 2. Full rows are in [tables.md](./tables.md).

## What remains

At 1,024 pairs with the 2 s target, the reduction pays 15.8 s against the uncached 10.9 s. The first attempt's budget is 2.2 s (twice a 1.1 s setup), less than the 3.5 s of verification left, so it pauses once. The roughly 4.8 s extra is:
- **The second attempt's setup, 1.9 s:**
  - one more full inventory read and two prefix hashes;
  - loading and re-authenticating the 2.1 MB journal;
  - re-hashing 10,470 saved inputs;
  - rebuilding the census and coverage view, which the design rebuilds on every resume.
- **The journal's setup in the first attempt, about 0.7 s:** two prefix hashes and an empty checkpoint load.
- **One fenced save, 0.8 s:** two more full inventory reads, four prefix hashes, the readback's full re-authentication, and the seal.
- **The journal's own bookkeeping per fresh check, the remaining 1.4 s or so:** hashing the input, then encoding and validating the result.

The CPU ratio is higher than the wall ratio because those hashes run on WebCrypto's threads.
- E would shrink the save to one read and one prefix hash plus the new slice.
- The resume setup is the design's (exact-input receipts and fresh reconstruction, phase 127).
- The per-check bookkeeping is the price of a resumable cache.

None of these is approved for this phase.

## Tests

**New: `test/retentionSliceBudget.test.ts` (9 cases).** The real content owner, real WebCrypto and fake IndexedDB, at 24 and 96 own-plus-peer pairs (216 and 864 rows). The clock counts work: each WebCrypto call costs one unit plus one per KiB, and each fresh check ten. A fixed slice therefore shows the square in counts, not in wall time.
1. Fenced saves and full inventory reads stay within 2 and 6 of the smaller history's while history grows fourfold. On the base source they went from 39 to 156 saves.
2. A slice pays for the last fenced save as well as its own setup: with saves costing far more than setup, every resumed slice's fresh work is at least ρ times the save it carried.
3. Every attempt decrypts every saved row itself, and no `opened:` receipt is checked.
4. A journal in progress across an update restarts cleanly and finishes (as above).
5. An interrupted long slice loses at most ρ × (setup + last save), and the next attempt saves.
6. A device interrupted in every long slice still finishes. Each interruption is followed by a plain-target slice that saves, then a grown slice again.
7. Queued input stops a long slice (past four plain targets) at its next guarded step: no further check starts once input is queued.
8. A slice never plans past the window that keeps routine sync off it, and uses that window rather than stopping at the plain target.
9. The scheduler tells each attempt when routine sync resumes:
   - the settled hold's budget end, shared by the slices that follow at once;
   - the poll deferral's end, counted from the run's first slice;
   - now, when nothing holds sync off.

**On the phase 555 source** (the five changed sources restored to `HEAD`), all 9 new cases fail, and so does the restated case below ([base-tree run](./base-tree-run.txt)). In the run with the final test text, cases 2 and 8 fail because `PREPARATION_SETUP_RATIO` does not exist there. The record keeps an earlier run in which they used the literal 2 (the constant's value) and failed on their assertions.

**Mutation controls on the final tree** ([output](./mutation-controls.txt), `scripts/performance/reduction-cost/mutation-controls.py`). Each mutation, applied alone, makes at least one case fail:
- **a fixed 2 s budget:** 6 cases fail;
- **a budget that ignores the last save's duration:** case 2;
- **a budget that ignores the window:** case 8;
- **no plain slice after an interruption:** cases 5 and 6;
- **the scheduler not passing the window:** case 9;
- **a cached row accepted without its check** (opened rows reused from the journal): cases 3, 4 and 8, and the restated owner case.

**Existing cases that changed, in `test/retentionPreparationOwner.test.ts`** (a phase 541 file):
- **Its journal mock now drops `setupSince`, `carriedMs` and `deadline`.** Its cases force a pause with a clock that charges 2.1 s per read. With the start time injected, the budget grows with the setup measured on that same clock, so four cases stopped pausing. They test the checkpoint handoff, not slice sizing, which the new file covers. Their bodies are unchanged.
- **"a paused read task returns only a sealed handoff…" asserted that a resumed attempt does not open row 1 again.** That was the opened-row cache change D removes. It now asserts that row 1 is opened again.

No other existing case changed. These pass unmodified:
- the other phase 541 files;
- `retentionPreparationFreshSlice`, `retentionPreparationScheduling`, `automaticLocalRetention` and `reductionSyncHold`;
- the timing tests of phases 539, 540 and 546 (`retentionReductionHold`, `reductionHoldDutyCycle`, `retentionFenceCollision`).

**Related files on the final tree.** The full unit suite was not run here (the coordinator runs it once before the commit). 36 retention, preparation, baseline, hold, fence, queue and maintenance files pass, 381 cases ([run](./related-run.txt)). The typecheck passes, and format and lint pass on the changed files.

## Bookkeeping

Bookkeeping follows [development.md](../../../development.md#release-bookkeeping); see [evidence.json](./evidence.json) for:
- the denominators;
- the planning inventory;
- the runtime census (five changed sources);
- the construction registry line that followed `accountReceive.ts`;
- the source-text anchor check.

The decision entry amends the 2 s slice target of the journal contract and of hardening 336. `docs/account-local-retention-preparation-journal.md` carries a one-line pointer.

## At review

The coordinating session read the diff of the five sources and both test files, the journal's pause and capacity rules, the scheduler's hold and poll-deferral code and the verifier identity, on 2026-11-13.

**Run on the final tree.**
- The full unit suite: 356 files, 3,699 cases passed, 1 skipped, none failed.
- One independent control: with the budget fixed at the plain target, case 1 fails with 97 saves against a bound of 26. The source was restored byte for byte.
- Typecheck, build, the contract and bookkeeping checks, the history, service delivery and service inbound node tests, and the CI session, authority and quarantine steps.

**Corrected.** This record said a device interrupted at a steady rhythm "finishes as it did before this phase". It finishes, but not at the same cost.
- After a cut, one plain-target slice saves, and the slice after it is grown again.
- If that grown slice is cut too, its fresh work is lost. Case 6 shows exactly this alternation.
- A device whose grown slices are all cut therefore advances only by its plain-target slices and loses a grown slice between each pair. Before this phase every slice was a plain one.
- How much slower that is was not measured. It is recorded under REDUCE-FURTHER.

**Noted, not changed.**
- **A first slice has no margin for its save.** Before any save has been timed, `carriedMs` is 0. A slice capped by the window is then planned to end as the window ends, and its save begins as routine sync resumes. The cap binds only when the setup exceeds about a third of the window: 20 s under the 60 s poll deferral, 100 s under the five-minute hold. If that save is cut, the next slice keeps the plain target.
- **The carried save outlives its reduction.** The content owner keeps the last save's duration until the next save or a reopen. The first slice of a later reduction is therefore sized with the previous reduction's last save. That can only lengthen the slice, and the window still caps it.

**Not exercised at review either.** The composed Worker path, and the window plumbing at run time.

## Limits

- No device and no browser. The probe is Node with fake in-memory IndexedDB on one shared Mac. The slower device is emulated by the slice target, not measured.
- The probe's fixture has one Yjs client per own update and no installed history snapshot or carried capsule at these sizes.
- The window placement trusts the scheduler's wall-clock moment, converted once at the attempt's start. A wall-clock jump during an attempt does not move it.
- No commit or deployment.

[Identities and results](./evidence.json).
