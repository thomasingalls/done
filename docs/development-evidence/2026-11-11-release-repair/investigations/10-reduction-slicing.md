# Why a sliced reduction costs the square of history

A delegated agent's report from 2026-11-11, filed as delivered. Read-only at `ff8578cd0`. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** Change A and change D are queued; the further steps are REDUCE-FURTHER in the product backlog.

---

## Reduction slicing: read-only findings (tip ff8578cd0)

I read the five shared files with `git show HEAD:`. I made no edits, builds or test runs. Line numbers below are HEAD.

### Bottom line
- Every slice is a fresh attempt. It rebuilds everything from disk: about 3 full inventory reads and 6 full-history prefix hashes per slice, plus every saved receipt decrypted and re-authenticated twice. Then it adds about 2 s of new work.
- So total work grows with the square of history, and the save that runs under the Window fence also grows with every slice.
- The smallest sound fix is to size each slice's new-work budget in proportion to the setup that attempt has just paid. That makes total work O(history) and touches no check, format or trust argument.
- On an already-reduced device (counter v5) the journal caches only decrypted rows. Re-checking a cached row costs about as much as decrypting it again (one SHA-256 against one AES-GCM). So slicing there is pure overhead.

### 1. Traced path

**Verified by reading**

*Scheduler, `automaticLocalRetention.ts`*
- Constants at 15-18: start at 1,024 records, 10 s of quiet, 60 s retry, 30 min cooldown.
- After `preparation-saved` the next slice is due at once (362-366, delay computed at 249-262).
- An interrupted attempt retries after 10 s if only queue priority interrupted it, otherwise after 60 s (370-374). Input calls `wake()`, which restarts the 10 s quiet (428-433).

*Read task: `accountReceive.ts:1091-1123` → `accountCapture.ts:743-826` → `contentStore.ts:864`*
1. `retentionInventory` reads every row of every content store with `getAll` (contentStore 892, defined at 299).
2. `structuredClone` of the whole inventory, then a sort (localRetentionPlan 262, 90-95).
3. Counter MAC check. On v5, the previous baseline is decrypted.
4. `loadPreparationCheckpoint` (retentionPreparationStorage 241-383):
   - `capturePreparationPrefix` packs all row ciphertext and hashes it with SHA-256 (246; binding 74-162).
   - `matchesPreparationPrefix` does the same again (276-280).
   - Then, for every saved delta: decrypt its chunks, SHA-256 it, HMAC-verify it, decode it, and run `validateResult` on every entry (286-333). Inbound-page results are re-parsed by `captureInboundReceiptSyntax`.
5. `journal.import`, once per delta (retentionPreparation 503-526). Each call copies the whole Map and re-sums all sizes, so cost is deltas × entries.
6. Opening loop (localRetentionPlan 338-371). Each `memo.check` (retentionPreparation 384-472):
   - copies the inputs, encodes a frame and SHA-256s it (406-413);
   - compares the inputs byte for byte;
   - on a hit, decodes the saved result (415-426).
   - The digest is computed on every check, hit or miss.
7. `full()` (localBaselineReplay 200-369), first reduction only:
   - Not memoized: the census over all records (224) and the Yjs coverage build over all content (276-278, `contentCoverage` in inboundLedger 485).
   - A basis hash over all content plaintext (280-293).
   - Every memoized check re-hashes its inputs. Coverage checks hash twice (299-312).
8. Fresh work. The clock starts at the first miss and pauses after 2 s or at 32,767 rows (427-430). Then the delta is HMAC-signed (527-551).

*Save, under the Window fence (`accountReceive.ts:1124-1136`, `contextQueue.run(persist)`)*
- The fence is a `'remote'` job at the head of the Window admission queue (admissionQueue 1172-1213; windowWorkspaceQueues 103-121). It flushes the journal first, and any input typed meanwhile queues behind it.
- `savePreparationDelta` (storage 403-554):
  - `capture` reads the full inventory and checks the counter MAC and context (416; contentStore 816-838);
  - `matchesPreparationPrefix` (419) and `capturePreparationPrefix` (422): two more prefix hashes;
  - authenticates the new delta (424), reserves allocation by CAS on the content counter (445), seals and writes (451-521).
- Readback (522-538): `capture` again (another full inventory read), then `loadPreparationCheckpoint`. That means two more prefix hashes, decrypting and re-authenticating every delta, and a deep compare of all chunks.
- So the fenced save costs O(H + W).

*Interruption*
- Any non-preparation storage job (typing flush, receive, audit) replaces the priority token (accountCapture 341). The read task throws at its next guarded step (766-780).
- Only `PreparationPause` saves a delta (contentStore 1097). Otherwise the journal is disposed (1135).
- An interruption throws away all setup plus up to one slice of fresh work, then waits 10 or 60 s.

*v2 versus v5*
- First reduction (counter v2): memoized work spans the opening loop and `full()`.
- Already-reduced device (v5): only the opening loop uses the memo. `replayLocalBaseline`, `rebaseLocalBaseline`, coverage and compare take no `reuse` (localRetentionPlan 376-444). They run whole, unsliced, in the last attempt.

**Cost formula**

Symbols:
- H: rows and ciphertext of the full history
- W_k: saved receipt bytes before attempt k, with W_k ≈ (k−1)·w
- w: receipt bytes produced per slice
- V: uncached fresh verification time
- K ≈ V / 2 s: number of slices

Costs:
- Attempt k: T_k ≈ αH + βW_k + γ·(k−1)·E + 2 s
- Fenced save k: S_k ≈ α′H + β′W_{k+1}
- Total: K(α+α′)H + (β+β′)·w·K²/2 + 2K s, which is Θ(H²) when V ∝ H. The fenced total is also Θ(H²), and each save's fenced time grows linearly with k.
- The growth stops at the 32 MiB journal cap. From there phase 541 runs the rest uncached in one pass.

**Inferred from phase 309 (lab desktop, older creation-time clock)** — `docs/performance-experiments/2026-10-29-worker-catchup/phase309/attempts.csv`, idle-paused case
- Time before the first fresh check grew from 0.21 s to 2.42 s over 11 attempts as the saved journal grew to 21.6 MB.
- Attempt duration minus setup minus the 2 s clock gives a fenced save of about 0.61-0.73 s.
- The design target for a fenced exchange was 250 ms (phase 125 README; design doc line 114).

### 2. Why the re-hash exists, and what a resume must check

**Origin**
- Phase 127 (decisions.md 5806) and `docs/account-local-retention-preparation-journal.md`: "Each result is bound to the entire operation context and every input byte", and semantic reducers are rebuilt fresh on resume.
- Storage decisions (5815, 5819): fresh serialized re-authentication before allocation, and exact authenticated readback.
- Phase 187 (6042): saves at the real Window head.
- The design's own stated goal was that typing and sync "must not force it to reverify the entire same prefix". The design doc warned not to call a full rescan constant-cost and said measuring it was part of implementation. I found no such measurement.

**What protects the journal today**
- Each chunk and the head are AES-GCM sealed under the content key, with (gen, seq) reserved from the main allocator.
- The head stores each delta's SHA-256.
- Each delta carries an HMAC over [domain, 'receipts', context, payload].
- The context is itself an HMAC over the verifier source identity, scope, authority, route, installation and keys.
- The head commits to the physical prefix: digest of all ciphertext below `through`, plus allocations and the spool witness.

**What a resume genuinely needs**
- That what it reuses is authentic. This costs in proportion to the bytes it loads; AEAD plus the hash in the head already makes the per-delta HMAC redundant.
- That each reused result's inputs equal the current inputs. That is the per-entry digest, and it touches all reused inputs, which is O(H).
- The prefix match makes the per-entry digest redundant for `opened:` entries.
- My reading, which needs review: with exact-input digests in place, the six prefix hashes are not needed for soundness, only for invalidation. Dropping them would amend phase 127.

**Constant-size or chained alternatives**
- A running digest or a chained per-slice commitment would only shorten the save's prefix check.
- The read side still has to re-read rows and results. Nothing constant-size helps an attempt that restarts from disk.
- Getting O(slice) per slice means keeping the state in memory between slices.
- So the cheap sound lever is to restart less often.

### 3. The slice budget and the fence

**Why 2 s**
- It was a provisional target, never measured: phase 125 and the design doc line 105; the journal contract says it "is not a wall-clock slice bound".

**What the fence protects**
- The allocation reserve on the shared content counter.
- A flushed Window journal.
- Fresh readiness, authority and journal checks at the head (phase 187).
- In 410221ad the save was serialized on the storage tail only, with no Window fence.

**Cost to the person typing**
- A read-only slice yields every 8 ms of CPU (cpuBudget) and stops as soon as input queues.
- So a longer slice adds no input latency beyond the indivisible operations (one Yjs apply, the coverage build), and those exist at any slice length. It only raises the work lost per interruption.
- What the typist waits on is the fenced save, which is O(H + W) regardless of slice length.

**Why the waiting message shows**
- The fence job counts in `pendingItems` (admissionQueue 330).
- `admittedEditor.ts:351` and `workspaceUi.tsx:317` show "Input is waiting to be saved." whenever `pendingItems` is non-zero.
- So it appears for every save even without typing. Inferred link: that the editor's status is this Window queue's status.

**Larger slices or one pass**
- A held or idle device can safely run larger slices. Phase 541's uncached path already runs one pass.

### 4. Recommendation

**Change A: scale the new-work budget to the setup just paid**

At the first fresh check:

limit = max(2 s, ρ × (time since `prepareHistoryRemoval` started + the last fenced save's duration))

with ρ = 2 to start, then tuned by measurement.

- Why it works: each slice's overhead is then at most its fresh work divided by ρ. Total ≤ V(1 + 1/ρ), which is O(H), and the number of fenced saves drops to roughly log H.
- What it leaves unchanged: every eligibility, row placement, counter, candidate, coverage, inventory-at-commit, readback and reload-replay check; formats; limits; all journal guards.
- Files:
  - `src/crdt/retentionPreparation.ts`: new option and the limit calculation. Leave the line `PREPARATION_SLICE_MS = 2000;` verbatim, because `test/local-baseline/preparation-owner.node.mjs:142` rewrites that exact text.
  - `src/crdt/contentStore.ts`: pass the start time and record the save duration. The other agent is editing this file now, so wait for them.
  - Tests: new cases in `test/retentionPreparationFreshSlice.test.ts`. The existing cases still pass if the start time is injected rather than read at journal creation.
- Paperwork: a decision entry amending the 2 s target (phase 336 and the journal contract), plus the bookkeeping procedure.
- Size: about 20-30 source lines and 3-5 test cases.
- Risks:
  - An interruption loses up to ρ × the attempt's setup.
  - Phase 540's 60 s poll deferral per run can cut a long slice. Cap the budget at the time remaining in it, or re-tune it.
  - Deltas get larger, still bounded by the room cap and the row cap.
  - Changing the verifier source invalidates in-progress journals once at deploy.

**Rejected as the first step**
- Skipping per-entry digests on trust of the MAC'd prefix: changes phase 127's trust argument and removes only one of about eight O(H) passes.
- Running digest or chained commitments: shortens only the save.
- Single pass under the phase 539 hold: forfeits saved progress; A gets O(H) and keeps it.
- Keeping the attempt alive across slices: large, and crosses phase 187's rule that read evidence expires with its read task.

**Further steps, ranked**
1. **D: stop caching `opened:` rows; always decrypt.** It removes checking that costs as much as redoing the work, shrinks W and both fenced reloads, and turns a v5 reduction into one pass. Small; consider landing it with A.
2. **E: shrink the fenced save from O(H + W) to O(H + slice).** Do one prefix capture; read back by exact bytes instead of re-authenticating every delta; skip the second capture. This needs your amendment of the "exact authenticated readback" decisions.
3. **G: count only input jobs for the waiting message**, or move progress saves off the Window head as in 410221ad. The second option amends phase 187.
4. **F: a continuous pass with background saves.** Only if the stop condition still fails after A, D and E.

### 5. What the release changed (410221ad → 759890ca0)
- **New: fenced saves.** Progress saves now sit at the Window admission head through the Worker context queue (phase 187, commit 60734dd1f, not in 410221ad). This is why the waiting message now appears on every slice.
- **New: fresh-work slice clock** (phase 336). Old code got stuck at one entry per slice once replay passed 2 s; new code always adds 2 s but keeps the quadratic growth.
- **New: inbound-page receipt slots**, re-parsed on every load.
- **New: journal overflow parks as `capacity`** (pre-541).
- **New: 10 s retry for priority-only interruptions** (337), and maintenance turns (469).
- **Not new: flags.** The resumable journal (phases 127/128) and the AUTO=1 / RESUME=1 flags were already in place: they were compiled in the 2026-10-28 release b6f0160a, which is an ancestor of 410221ad, and phase 529 says the profile was retained. I did not confirm 410221ad's image flags, so "switched on by this release" is not supported by what I read.

### 6. Measurement plan
**Probe**
- A Node probe outside `test/`, modelled on phase 542's `size-measure-probe.ts.txt` (memberFixture plus fake-indexeddb). I don't know the exact Vitest command 542 used.
- Grow history to 128, 256, 512, 1,024 and 2,048 own+peer pairs.
- Wrap `createPreparationJournal` as `retentionPreparationOwner.test.ts` does, with `now = ++n` and `sliceMs = M`, so each slice does M fresh checks regardless of host speed.
- Loop `prepareHistoryRemoval` → `persist` → commit.

**Record per attempt**
- Time to first miss, fresh time and save time.
- Hits and misses.
- W and delta bytes.
- SHA-256, AES and HMAC call counts and bytes.
- Inventory reads and prefix captures.

**Arms**
- Today's code, and an uncached arm (RESUME off) as the floor.

**Keep green**
- The nine files in the 541 record.
- `retentionPreparationFreshSlice`, `retentionPreparationScheduling`, `automaticLocalRetention` and `reductionSyncHold`.
- `pnpm test --maxWorkers=1`.

**In a real browser**
- `pnpm test:local-baseline` fails 5/5 before any change (phase 542 record), so it needs repair first.
- After that, the phase 309 attempts.csv fields, then your phone.

**Stop condition**
- At every size, the sliced reduction costs at most 1.5× the uncached pass, and the number of fenced saves grows no faster than log N.
- This is stronger than "2N costs about 2× N", because it also separates any super-linearity in V itself.
- Then one phone or Chromium run where time to first miss stays within the ρ ratio as attempts go on.

### Could not determine
- The affected phone's history size, journal size, slice count, interruptions, and whether it hit the cap.
- Cache-hit versus miss cost for each receipt family, and how much of W is decrypted rows.
- Whether V is linear in history: coverage forks the whole document for updates not stored verbatim, and phase 323 saw page re-reads.
- The exact binding between the editor's status and the Window queue.
