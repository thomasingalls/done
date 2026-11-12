# Node probe: a reduced device rebuilds its document once per saved batch

A delegated agent's report from 2026-11-11, filed as delivered. Measured in Node with in-memory storage at `9882e30cd`. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** Fixed in phase 545, whose record holds the probe and its before and after output.

---

## Node probe: the replay multiplier is real, and cold start pays it too

**Short answer.** The multiplier is confirmed, and it is linear in the number of source capsules saved since the last reduction:
- Each forced read rebuilds the whole document **7 + N** times (N is the capsule count; it is 6 when N is 0).
- Each rebuild hashes, decodes and applies the full snapshot plus every saved update since the reduction.
- **A cold open pays exactly the same counts.** So this is a start-up cost on every reduced device, not only a cost of returning to the app.
- Records that do not carry a capsule add no rebuilds, only linear verification time.
- A probe-only emulation of one shared coverage view per replay brings the rebuilds down to 4 and makes forced reads and cold opens roughly flat in N.

### How it ran
- The probe and its outputs are under `/private/tmp/claude-502/-Users-thomasingalls-Code-done--claude-worktrees-l2-onboarding-863db1/a2cb3ea1-c2ed-4b47-b08f-dc5bb9d6e506/scratchpad/warm-view/`:
  - `forced-read.probe.ts` and `vitest.config.mjs` (the config has no imports and sets its cache directory to the scratchpad);
  - `summarize.py`;
  - raw results in `out/*.jsonl`.
- It ran from the worktree root with `node_modules/.bin/vitest run --config <that dir>/vitest.config.mjs --configLoader runner`, with `PROBE_*` variables and `VITE_ACCOUNT_LEDGER_PROFILE=1`.
- Source was `9882e30cd`. Your commit landed at 21:41:18, before my first run, and `git status` was clean before and after.
- Nothing was created in the worktree. The modification times of `node_modules/.vite*` are unchanged, and `find -newer` against a marker file found nothing.
- No builds, installs, unit suite or browser suites.

**Fixture.**
- A real `createContentOwner` with the warm-load settings, using the `memberFixture` and `cryptFor` helpers from `test/local-baseline`, on the fake in-memory IndexedDB.
- I grew the document, reduced it with `removeHistory`, then added accepted own positions with `appendOwn`, one capsule and 7 records each.
- Counts come from the always-on `coverageRebuild` timing, the profiled `work` counters, and wrappers I installed with `vi.mock` around the project's `Y` export and `verifyInboundCoverage`. The wrappers record the call site.

**What each timing means.**
- **Warm:** `loadAccount` with no invalidation.
- **Forced:** `invalidateWarm()` then `loadAccount`, which is what returning to the app triggers.
- **Cold:** a new owner, `initialize`, then the first load.

The machine's load average was 5 to 17 throughout.

### Counts per replay (forced read and cold open are identical)
These were checked exactly at N = 0, 1, 2, 5, 10, 20, 50, 100 and 200.

| Call site in `localBaselineReplay.ts` | Count |
|---|---|
| 662, receipt coverage | 3, fixed |
| 834, self-receive advance | 1 when N ≥ 1 |
| 840, one per source capsule in the census | N |
| Coverage for the continuation cache (`createBaselineReuse`) | 1 |
| Document-state builds | 2 |
| **Total full-document builds** | **7 + N** (6 when N = 0) |

- Data applied per replay grows with N. At a 4 MB snapshot it was 22.9 MiB at N = 0, 218 MiB at N = 50 and 791 MiB at N = 200.
- **Records with no capsule:** 0, 50 and 200 peer receipts kept the rebuild count at 6. Time still grew linearly: 24, 195 and 394 ms at a 0.1 MB snapshot, from signature and ledger checks.
- Line 724 (one rebuild per source carried in the baseline) was never exercised, because every fixture carried 0 sources. By reading, it adds one rebuild per carried source.

### Timings
Median with [min–max] in ms, 3 runs per cell unless noted. "Encoded" is the baseline's ciphertext size.

**Single-run text** (the phase 542 shape):

| Encoded | N | Warm | Forced | Cold |
|---|---|---|---|---|
| ≈2.0 MiB | 0 | 2.3 [1.6–2.5] | 145 [138–156] | 152 [141–158] |
| | 50 | 4.0 [3.4–7.3] | 634 [630–650] | 645 [595–703] |
| | 200 | 7.1 [7.1–7.6] | 2,853 [2,728–3,028] | 2,794 [2,752–2,803] |
| ≈4.0 MiB | 0 | 2.5 [2.4–3.3] | 285 [267–299] | 279 [272–339] |
| | 50 | 6.4 [4.8–11.8] | 1,041 [1,008–1,149] | 1,064 [1,038–1,086] |
| | 200 | 10.2 [8.4–12.0] | 4,027 [4,026–4,128] | 4,015 [3,849–4,092] |
| ≈8.0 MiB | 0 | 4.8 [4.4–5.8] | 561 [554–638] | 635 [562–656] |
| | 50 | 6.7 [4.3–10.3] | 1,939 [1,898–1,981] | 1,931 [1,918–2,053] |
| | 200 | 11.6 [11.1–14.6] | 6,609 [6,572–6,610] | 6,660 [6,517–6,662] |

A repeat run at 8 MiB gave forced reads of 513 ms (N = 0) and 6,020 ms (N = 200).

**Fragmented text** (I added this for realism: many small inserts, deletions kept as the document does not garbage-collect):

| Encoded | N | Warm | Forced | Cold |
|---|---|---|---|---|
| ≈2.8 MiB | 0 | 2.9 | 952 [879–985] | 969 [890–1,027] |
| | 50 | 6.4 | 4,462 [4,427–4,761] | 4,663 [4,273–5,622] |
| | 200 | 8.9 | 15,517 [14,911–15,547] | 15,473 [15,306–16,067] |
| ≈5.5 MiB (2 runs) | 0 | 6.1 | 2,222 [2,181–2,263] | 2,385 [2,265–2,504] |
| | 50 | 13.5 | 12,069 [11,767–12,372] | 13,215 [11,783–14,647] |
| | 200 | 9.2 | 35,883 [34,664–37,102] | 39,528 [39,207–39,850] |

**What a rebuild costs.**
- Single-run text at 8 MiB: about 26 ms per rebuild, but `Y.applyUpdate` accounts for only about 2 ms of it.
  - The remainder fits the per-byte FNV hash `updateIndex.add` runs over every record on each rebuild (`inboundLedger.ts` around 455–458), plus decoding. That part is inferred; I did not time it separately.
- Fragmented text: about 70 ms per rebuild at 2.8 MiB and about 170 ms at 5.5 MiB, mostly apply and decode.

**One fixture artifact.** Each fixture capsule comes from a new Yjs client inserting at position 0 of the same text, so applying the saved updates costs more than linear time on every rebuild. That is about 0.8 s of apply time at N = 200, the same at every snapshot size. Real capsules from one device will be cheaper, so the N = 200 single-run figures overstate the share of the post-reduction updates. The 7 + N count does not depend on the fixture, and neither does the snapshot's share of each rebuild.

### What this says about option E, and a better first fix
**Option E** compares every stored byte with the verified copy and reuses the finished replay.
- I measured a stand-in for its foreground work: one read-only transaction over all four stores, plus a byte comparison of every row and chunk against an authenticated copy. It took 3.3 ms at 8 MiB with N = 0 and about 10 ms at N = 200.
- So E would turn a return to the app from 0.15–6.6 s (single-run) or 1–36 s (fragmented) into tens of milliseconds in Node, and more on a real disk.
- **But E does nothing for cold start**, which pays the same multiplier.

**Fixing the multiplier at its source should come first.**
- Every `verifyInboundCoverage` call within one replay receives the same `records` array. So building one coverage view per replay checks the same updates against the same record set; by reading it is equivalent. The full-history path, `full()`, already shares one coverage view this way.
- I emulated this in the probe only, with no source change (`createInboundCoverage().bind(records)`, then `check` for each capsule):

| Case | Forced before | Forced with shared view | Cold with shared view |
|---|---|---|---|
| 8 MiB single, N = 0 | 513–561 | 422 [410–433] | about the same as forced |
| 8 MiB single, N = 200 | 6,020–6,609 | 854 [852–925] | about the same as forced |
| 2.8 MiB fragmented, N = 0 | 952 | 684 [647–723] | about the same as forced |
| 2.8 MiB fragmented, N = 50 | 4,462 | 1,068 [823–1,108] | about the same as forced |
| 2.8 MiB fragmented, N = 200 | 15,517 | 1,075 [1,017–1,080] | about the same as forced |

- Rebuilds drop from 207 to 4, and every replay still completed its checks.
- This helps start-up and resume alike, so it belongs with the start-up sibling as much as with this question.
- E would then remove only the remaining floor on each return, about 0.4 to 2.2 s at these sizes. Whether that is worth building is a separate call.
- The shared view needs review as a construction change. I have not checked what it means for the census or registry bookkeeping.

### What the probe could not reach
- Real browser IndexedDB and phone CPU. The fake store holds everything in memory, so physical reads look cheap; expect a phone to be several times slower.
- The receive layer above the content owner: its validation step (the fixture's is a no-op), custody re-authentication, ledger hints and the Worker queue. Real cold start does more than this probe.
- Sources carried in the baseline (line 724), baselines carrying an installed service snapshot (line 748), unreduced owners that hold a baseline, and the interruption race.
- How many capsules a real phone accumulates. Reduction becomes due at 1,024 physical records, so with one position per capsule that is about 150 capsules between reductions. Batched positions allow more, and while reduction parks the count has no bound.
