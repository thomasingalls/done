# Phase 557 — a reduction plan checks its content rows a batch at a time

The coordinating session asked on 2026-11-13 for the square in the uncached reduction pass's coverage stage to be found and measured, and removed only if that could be done without changing what the check proves and without amending any recorded decision; otherwise the phase was to end as a set of measured options, as phase 555 did.

## Result

**The square was where the brief guessed.** A CPU profile and counters on the phase 556 source show that the plan checked each content row against the candidate snapshot with its own whole-document fork and its own whole-document comparison. At 2,048 own-plus-peer pairs the coverage loop made 4,096 forks (9.0 s) and 4,096 comparisons (12.6 s) of its 25.2 s; applying the rows took 1.5 s. A fork and a comparison each cost time in proportion to the document, and both doubled per doubling of history. See [What the profile showed](#what-the-profile-showed).

**Built.** Content rows are now checked a batch at a time: one fork of the candidate document, every row of the batch applied in turn (64 rows to a Yjs transaction), and one comparison. A batch closes once its rows hold as many bytes as the candidate snapshot. A batch that is not proven is checked again row by row with the unchanged per-row check, so a refusal is the same error at the same row as before. The four conditions of the brief's gate hold:
- the profile shows the square, and the change removes it: a pass now makes 2 forks and 2 comparisons at every size measured, against one of each per content row;
- every verdict is kept, by the argument in [Why every verdict is kept](#why-every-verdict-is-kept), which the new tests exercise;
- no decision, contract text or registered construction is amended (the comment above `contentCoverage` is reworded, and the preparation note gets a pointer);
- no stored format, wire message or limit changes.

**The stop condition is met.** The coverage stage took 94, 194 and 458 ms at 512, 1,024 and 2,048 pairs (medians of 3 runs): 2.07 and 2.36 times per doubling, 2.21 on average from 512 to 2,048, against about 2.3. It was 1,628, 6,247 and 23,866 ms (3.84 and 3.82). One run at 4,096 pairs took 1,008 ms (2.20 times 2,048), against 99,386 ms. The whole uncached pass at 2,048 pairs fell from 33.5 s to 9.6 s, and coverage from 71% of it to 5%; at 4,096 pairs, from 126.4 s to 27.1 s.

**Rows to a transaction were needed for that.** With one Yjs transaction per row, the batched check made the same 2 forks and 2 comparisons but its coverage stage still grew 2.88 and 3.57 times per doubling (168, 483 and 1,724 ms), because Yjs computes a state vector over every client at the start and end of every transaction and this fixture has one client per own position. Applying 64 held rows in one transaction removed that.

## Before and after

The uncached pass by stage, medians over runs, ms. Coverage runs from the plan's first coverage report to the commit; the row loop ends at the plan's bare coverage report, and the final replay and comparison follow it. Forks and comparisons are the coverage loop's, from the median run.

**Phase 556 source:**

| Pairs | Rows | Runs | Opening | Verifying | Building | Coverage | (row loop) | (final replay) | Commit | Total | Forks | Comparisons | Coverage growth |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 512 | 4,608 | 3 | 157 | 1,630 | 55 | 1,628 | 1,596 | 30 | 135 | 3,669 | 1,024 | 1,024 | |
| 1,024 | 9,216 | 3 | 282 | 3,280 | 181 | 6,247 | 6,191 | 58 | 234 | 10,333 | 2,048 | 2,048 | 3.84 |
| 2,048 | 18,432 | 3 | 603 | 7,740 | 745 | 23,866 | 23,760 | 106 | 537 | 33,548 | 4,096 | 4,096 | 3.82 |
| 4,096 | 36,864 | 1 | 1,302 | 20,968 | 3,177 | 99,386 | 99,123 | 263 | 1,065 | 126,436 | 8,192 | 8,192 | 4.16 |

**This phase:**

| Pairs | Rows | Runs | Opening | Verifying | Building | Coverage | (row loop) | (final replay) | Commit | Total | Forks | Comparisons | Coverage growth |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 512 | 4,608 | 3 | 131 | 1,442 | 54 | 94 | 66 | 28 | 130 | 1,891 | 2 | 2 | |
| 1,024 | 9,216 | 3 | 274 | 3,180 | 183 | 194 | 134 | 61 | 275 | 4,138 | 2 | 2 | 2.07 |
| 2,048 | 18,432 | 3 | 469 | 7,260 | 711 | 458 | 349 | 102 | 520 | 9,596 | 2 | 2 | 2.36 |
| 4,096 | 36,864 | 1 | 1,146 | 19,985 | 3,150 | 1,008 | 800 | 209 | 1,273 | 27,123 | 2 | 2 | 2.20 |

**Intermediate, one transaction per row** (same batches, measured before rows were grouped):

| Pairs | Coverage | (row loop) | Time inside the coverage view | Forks | Comparisons | Total | Coverage growth |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 512 | 168 | 138 | 66 | 2 | 2 | 1,936 | |
| 1,024 | 483 | 426 | 266 | 2 | 2 | 4,482 | 2.88 |
| 2,048 | 1,724 | 1,612 | 1,111 | 2 | 2 | 11,332 | 3.57 |

With rows grouped, the time inside the coverage view (the ledger's `coverageCheck` timer: forks, applies and comparisons) is 6, 12 and 36 ms. The rest of the row loop is classifying the other rows, the CPU budget's yields and garbage collection. The final-tree profile at 2,048 pairs (a 362 ms coverage loop) puts 194 ms in classifying receipt rows (`inspectInboundReceipt`), 34 ms in parsing stored rows, about 40 ms in the coverage view (holds, the grouped applies, two forks and two comparisons), 32 ms in yields and 26 ms in garbage collection. At 4,096 pairs the time inside the view is 117 ms (3.2 times 2,048): each group's transaction still computes two state vectors over every client, now once per 64 rows.

**Noise and overlap.** Runs of the coverage stage ranged 92 to 97, 183 to 196 and 363 to 478 ms (this phase) and 1,619 to 1,662, 6,163 to 6,368 and 23,472 to 23,944 ms (phase 556 source). The 2,048-pair spread of this phase is the widest relative to its median; using its fastest or slowest run, growth from 1,024 is 1.9 or 2.5. Before every timed run, `ps` showed no other vitest, Playwright or node test process on this Mac ([overlap log](./overlap.log)); load averages were 4 to 10 from other work. The 4,096-pair runs are one run each, in a process of their own. Seeding a 4,096-pair store took 8.8 to 12.6 minutes in its process, before the timed reduction. Within each size, forks, comparisons and calls into the coverage view were identical across runs.

## What the profile showed

**How it was measured.** The phase 556 probe (`scripts/performance/reduction-cost/`) now also counts and times every whole-document fork (`forkDoc`) and comparison (`sameDocState`) at the module boundary, copies those counters and the ledger's coverage timers at every stage boundary, and marks the plan's bare coverage report after its row loop, so the coverage stage splits into the row loop and the final replay and comparison. With `PROFILE=1` it records a V8 CPU profile (0.5 ms sampling, the process's own inspector session) of the verifying stage and of the coverage loop. `cpuprofile.py` summarises a profile. One uncached run at each of 1,024 and 2,048 pairs was profiled on the phase 556 source, and one at 2,048 on the final tree; the timed runs were not profiled.

**The coverage loop, profiled run, phase 556 source:**

| | 1,024 pairs | 2,048 pairs | Growth |
|---|---:|---:|---:|
| Loop | 6,808 ms | 25,188 ms | 3.7 |
| Row checks | 2,048 | 4,096 | 2.0 |
| Whole-document forks | 2,048, 2,409 ms (1.18 ms each) | 4,096, 8,961 ms (2.19 ms each) | 3.7 |
| Whole-document comparisons | 2,048, 3,305 ms (1.61 ms each) | 4,096, 12,592 ms (3.07 ms each) | 3.8 |
| Applying the rows (checks less forks and comparisons) | 372 ms (0.18 ms each) | 1,482 ms (0.36 ms each) | 4.0 |
| Outside the checks (classifying other rows, yields) | 723 ms | 2,153 ms | 3.0 |
| Final replay and comparison after the loop | 66 ms | 123 ms | 1.9 |

Inside the comparison at 2,048 pairs (inclusive times): two whole-document V1 encodings 7.6 s, the byte comparison 2.8 s (`equalBytes` compares with a closure per byte), two snapshots 1.5 s. Inside the fork: one V2 encoding and one decode and integration of the whole document. The bounded positives index cost 17 ms in all, decoding the rows 18 ms, and garbage collection 0.6 s (self time). The idle time in the profile (1.6 s at 2,048) is the 8 ms CPU budget's `setTimeout` yields.

**What applying a row cost.** Three quarters of it was Yjs computing a state vector over every client at the start and at the end of each transaction (`getStateVector`: 971 of 1,299 ms under `applyUpdate` at 2,048 pairs, 343 of 468 at 1,024). That is proportional to the number of Yjs clients, and this fixture makes one client per own position, so applying a row was itself linear in history here. The intermediate measurement above shows that this alone kept the batched stage superlinear, which is why held rows are applied 64 to a transaction.

**Nothing contradicted the brief.** The square is the per-row fork plus the per-row comparison. It is not the positives index, decoding or garbage collection.

**The verifying stage** (asked about, not changed). It is the first full-history reference replay. In the profiled runs it took 3.44 s at 1,024 pairs and 8.40 s at 2,048:
- about 35% is the main thread idle while WebCrypto runs on Node's threads (1.30 s, then 2.97 s): decryption, signature and HMAC verification, hashing;
- Yjs `applyUpdate` 0.48 s, then 2.24 s, of which building the receipt-coverage document from every content row (the ledger's `coverageRebuild` timer) is 0.34 s, then 1.57 s (4.6 times);
- `getStateVector` alone 0.32 s, then 1.56 s (4.9 times), the same per-transaction cost as above;
- the inbound census 0.35 s, then 0.78 s; `verifyInboundLedger` 0.26 s, then 0.93 s; `verifyDelivery` 0.23 s, then 0.41 s (inclusive times across async resumptions are partial).

So it is mostly linear work with a large constant, plus a quadratic term from applying one content row per Yjs transaction in a document with one client per own position: about 1.6 to 2 s at 2,048 pairs. In the timed runs on the phase 556 source it grew 2.01, 2.36 and 2.71 times per doubling (1.6, 3.3, 7.7 and 21.0 s); the quadratic term's share grows with size. It makes no whole-document fork: peer and own updates are stored verbatim, so its coverage checks hit the originals index. The building stage also grows about four times per doubling (55, 181, 745 and 3,177 ms); it was not profiled.

## The change

**`src/crdt/inboundLedger.ts`.**
- `contentCoverage` keeps one open batch: a fork of its document, made when the batch's first rows are applied; the held updates in order; their bytes; how many are not yet applied; and whether the batch can still prove.
  - `hold(update)` skips an update stored verbatim or already proven, as `check` does. Otherwise it adds the update to the batch, and every 64 held updates it applies the waiting ones to the batch's fork, in order, inside one `Y.transact`. It returns the batch's bytes, or Infinity once the batch can no longer prove anything: when the view's own document holds pending parts, or when the fork or an apply has thrown.
  - `settle()` applies what is still waiting, then compares the batch's fork with the document using the same `sameDocState`. If equal, every held update is recorded as a proven positive. If not, or if anything threw, it returns the held updates for the caller to check alone and records nothing. Either way the batch's fork is destroyed.
  - `clear()` also destroys an open batch.
- The bound view (`createInboundCoverage().bind`) exposes `hold` and `settle` behind the same invalidation guard as `check`.
- `checkInBatches(view, records, budget, checkpoint)` drives a pass: `add(update)` holds it and settles once the batch holds `budget` bytes (or at once on Infinity); `finish()` settles what is open. A batch that is not proven is checked one update at a time with the view's unchanged `check`, in order, with a CPU-budget checkpoint before each.
- The comment above `contentCoverage` now says how a batch proves each update.

**`src/crdt/localRetentionPlan.ts`.** The coverage loop adds each `update` or `state` row to `checkInBatches` over the candidate view, with a budget of the candidate snapshot's length. Content rows sort first in the inventory; the loop settles them before it classifies the first other row, and settles again after the loop. Classifying the other rows is unchanged.

**Why the snapshot's length.** A fork and a comparison each cost about the document's size, which the snapshot's encoding measures. Closing a batch at that many bytes of rows keeps the forks and comparisons a pass makes to about the rows' bytes divided by the snapshot's, plus one: 2 at every size here. **Why 64.** Each Yjs transaction costs two state vectors over every client; 64 rows to a transaction makes that 1/64 of what it was, while one group of applies stays a short synchronous step.

**What is unchanged.** `verifyInboundCoverage` (the per-call reference), the baseline replay's coverage view (`createPassCoverage`, phase 545), the full replay's view, `localBaselineReuse` and the live owner's direct-proof mode, the plan's eligibility, placement, counter, candidate, exhaustive-disposition, final replay and comparison checks, every journal and fence check, every stored format, wire message and limit. `PREPARATION_SLICE_MS = 2000;` and `LOCAL_RETENTION_MIN_RECORDS = 1024;` are untouched.

## Why every verdict is kept

Let D be the candidate document the view builds from the snapshot, and u1, …, uk the rows of one batch that are neither stored verbatim nor already proven. The per-row check accepts ui when a fresh fork of D with ui applied equals D under `sameDocState`, which compares the state vector and delete set, the integrated items and their content (through exact encodings, or failing that a normalized encoding that ignores where items are split and, being made with garbage collection on, the content of deleted items), and the pending structs and pending deletions byte for byte. The batch accepts all of u1, …, uk when one fork of D with u1, …, uk applied in turn equals D.

1. **If the batch is proven, nothing in it changed anything the comparison reads.** Under Yjs apply (13.6.31 with the repository's patch), every compared part only grows: the state vector and delete set never shrink, integrated items are never removed, and content changes only when splitting an item inside a surrogate pair replaces both halves with U+FFFD, which nothing undoes. Pending structs leave the pending set only by integrating, which grows the state vector (the patch's retry fires only when a missing clock is now below the state); pending deletions likewise. Transaction cleanup merges items and can only add deletions (text formatting cleanup); with garbage collection off it removes nothing. D has no pending parts (item 5). So if the fork ends equal to D, every intermediate fork was equal to D as well.
2. **A row that changes nothing on a document equal to D changes nothing on a fresh fork of D.** Apply depends on the document only through its state vector, which items exist and are deleted, its pending parts, and where items are split. The first three are equal. A split changes content only inside a surrogate pair, and such a position is never an item boundary in a document built from encoded bytes: V1 decoding produces well-formed strings, the fork's V2 encoder replaces lone surrogates at a string's edges before joining, and any split there has already replaced both halves. A position where one document must split and the other need not is therefore never inside a pair: splitting there changes only where items are split, which the comparison ignores. A position inside a pair is a boundary in neither, so both split there and both replace the pair. Items 1 and 2 together: a proven batch means each of its rows passes the per-row check.
3. **Sharing a transaction changes nothing compared.** Inside `Y.transact`, each `applyUpdate` runs the same decoding, integration, pending and delete-set steps as on its own; only the transaction's cleanup is deferred to the end of the group. Cleanup merges items (where items are split), may add deletions (formatting cleanup, only for types a row changed), and emits events; the private fork has no observers. The transaction's starting state vector decides only which types count as changed for events and which merges to try. So items 1 and 2 hold for rows applied inside one transaction, and an intermediate document inside a group is still a document built from encoded bytes plus splits, none inside a pair unless content has already changed.
4. **A batch that is not proven decides nothing.** If the comparison fails, the fork or an apply throws, or the comparison throws, no row is accepted on the batch's evidence. Every held row is checked alone with the unchanged per-row check, in order. The first that fails throws exactly what the per-row loop threw; if none fails (which items 1 to 3 say cannot happen for a failed comparison), the plan continues, as the per-row loop would have. Rows of earlier batches were each proven, so the first refused row overall is the one the per-row loop refused first, with the same error.
5. **Pending views never prove a batch.** If the view's document holds pending parts, every row closes its batch at once and is checked alone. The candidate cannot hold them: both ways of building it (`prepareLocalBaselineWithReference` and `rebaseLocalBaseline`) end in `documentState(records, true)`, which refuses pending dependencies as ineligible. The guard is defensive.
6. **Order.** Content rows sort before every other store in the inventory. The plan settles them before classifying the first non-content row, so a classification fault in a later row cannot pre-empt a coverage refusal; that ordering is what the per-row loop gave.
7. **Buffers.** The batch's fork may alias the bytes of the rows applied to it, so the caller keeps them unchanged until the batch settles. The plan's opened rows are one array erased only in its `finally`, after the pass. Positives are stored as copies, as before.
8. **Duplicates and positives.** A row equal to an original or to a row proven by an earlier batch is skipped, as before. A duplicate inside one batch is applied twice, which changes nothing that applying it once did not. A proven batch records its rows in the positives index in order, the same sequence of additions the per-row loop made, so the bounded index clears at the same points.

**Error position, progress and yields.**
- A refusal is raised when the batch holding the row settles: after up to one budget's worth of later content rows has been held, or, for a row that cannot be applied, at the end of its group of 64. The error and the row it names are the same as before.
- Coverage progress counts a content row when it is held, before its batch is proven, so a refused plan may already have reported rows beyond the refused one. Progress is presentation only (`reportRetentionProgress` swallows sink errors and changes no outcome).
- The loop still yields to queued input between rows through the same 8 ms CPU budget. A synchronous step is now one fork, one group of up to 64 applies in one transaction, or one comparison; before, each row's fork, apply and comparison ran as one step. A batch checked again row by row yields before each row. The longest step was not measured.

## What runs less often or differently

Named plainly, although each verdict is kept:
- **The whole-document comparison runs once per batch, not once per content row.** It compares one fork with every row of the batch applied, not one fork per row. The fork is made once per batch.
- **Rows are applied 64 to a Yjs transaction**, so transaction cleanup (merging, formatting cleanup) runs once per group instead of once per row.
- **The per-row fork, apply and comparison runs only for the rows of a batch that is not proven**, and for every row when the view holds pending parts.
- **The ledger's `coverageCheck` timer** now records one call per applied group and one per settle, instead of one per checked row. It is a diagnostic.

No check is removed, and none runs on less input: every content row not stored verbatim or already proven is applied to a fork of the candidate and covered by a comparison.

## Tests

**New: `test/coverageBatches.test.ts` (13 cases).** Real protocol history from `memberFixture` (12, 24 and 96 own-plus-peer pairs), sealed with real WebCrypto and planned with the real `planLocalRetention`. An honest planner cannot hold an uncovered content row, because the candidate is built from the same rows, and its earlier verification refuses most of these rows before coverage runs. So the adversarial rows are put in at the coverage view's boundary: a mock of `createInboundCoverage` swaps in an adversarial update for chosen content rows as the plan holds them, can merge extra content into the bound snapshot, and records holds, settles and rows checked alone. A mock of `checkInBatches` can set the budget so that a batch boundary falls on a chosen row.

1. **Cost.** While history grows fourfold (48 to 192 content rows), the plan's coverage loop makes at most one more whole-document fork and one more comparison than at the smaller size and fewer than one per 16 rows, and its batch forks run at most one Yjs transaction per 16 rows. On the phase 556 source it made 48 and 192 forks.
2. **Refusal wherever the row sits, nine cases** (one test each), each placed at the first content row, in the middle of the first batch, at the last row, as the last row of the first batch and as the first row of the second. For each placement the test asserts that the per-call reference refuses that row; that the plan refuses with the reference's error; that the refused row is that row; that the refusal came when the batch holding it settled, after every earlier batch closed before the row and with no later row held; that the first batch closed at its budget, not at the end of the pass (except when an unreadable row closed it early); and that every row checked alone before the refusal came from the same batch, before the row, and passed. The cases:
   - an uncovered insertion (long enough to be a large row);
   - a row whose origin is in an update the snapshot lacks, so alone it sits pending;
   - two uncovered rows, the later supplying the earlier one's missing dependency;
   - a deletion-only row deleting content the snapshot holds undeleted;
   - a row covered only in part (a merge of a real row and new writing);
   - the same uncovered row twice;
   - an uncovered insertion followed by a row deleting it (alone, that row is a pending deletion);
   - a known item re-sent with an origin inside a surrogate pair, so applying it splits the pair and replaces both halves (the snapshot gets the pair and the item as first written);
   - an uncovered row followed by a malformed one (three 0xff bytes).
3. **Order across stores.** With every content row in one batch and an uncovered last content row, an injected fault in classifying the first receipt row does not pre-empt the coverage refusal; with every content row covered, the same fault is what the plan meets.
4. **Differential against the per-call reference.** Three views (the candidate with the surrogate content merged in; a state after a deletion; a view whose own state holds a pending row), honest rows (real rows, the view's own bytes, an already-applied deletion and duplicates), each of the nine cases inserted at every third position, and budgets of 1 byte, a third of the rows and unbounded: 270 combinations. Then 192 real rows of a 96-pair history in one batch, with each case at rows 62, 63, 64, 127 and 128, across the 64-row groups: 50 more. For every combination, `checkInBatches` gives the same outcome as checking each update alone with `verifyInboundCoverage`: accepted, or refused at the same update with the same message.
5. **A batch that is not proven is checked again one row at a time.** One batch with an uncovered tenth row: nine rows pass alone and the tenth refuses, each after a checkpoint. An honest pass is proven by its batches with no row checked alone. A pending view checks every row alone, one settle per row.

**On the phase 556 source** ([run](./base-tree-run.txt)), with both changed sources restored to `HEAD`, all 13 cases fail. The cost case fails on its assertion: 192 forks against a bound of 49. The others fail because that source has no batches: the plan never holds a row, so no adversarial row is put in and the plan succeeds or meets the injected fault (cases 2 and 3), and `checkInBatches` does not exist (cases 4 and 5). The run used the final test text.

**Mutation controls on the final tree** ([output](./mutation-controls.txt), `scripts/performance/reduction-cost/coverage-mutation-controls.py`). Each mutation, applied alone, makes at least one case fail; the sources were restored byte for byte after each:
- **the comparison skipped** (a batch proven without comparing): 11 cases;
- **the comparison only at the end of the pass**, not per batch: 8 cases (the position cases' batch-end assertions);
- **the reverse, a comparison after every row** (one fork per row again): 10 cases, including the cost case;
- **a failed batch's fork reused** for the rows checked alone and for the next batch: 12 cases (the refusal lands on the batch's first row);
- **content rows left unsettled until after the other rows are classified**: the order case;
- **every row in its own Yjs transaction** (groups of one): the cost case;
- **a view with pending parts allowed to prove a batch**: case 5.

The recorded output is the run on the final text. An earlier run, before rows were grouped into transactions, had five of these mutations (no group or order mutation yet); the pending-view mutation tripped nothing then, which is why case 5 now asserts that a pending view checks every row alone.

**Existing files.** No existing test changed. On the final tree, the 48 test files whose names match retention, preparation, baseline, coverage or reduction, plus `historyInstallBound`, `inboundPageLedger`, `incrementalLedger`, `accountReceiveLedger`, `inboundTurnLedger`, `multiEntryInboundReaders` and `inboundMixedReplay`, pass: 55 files, 572 cases ([run](./related-run.txt)); the same files passed (54 files, 559 cases) with the first version of the change. The typecheck passes. Format (oxfmt) and lint (oxlint) pass on the changed sources, the new test and the probe. The full unit suite was not run here.

## Bookkeeping

Following [development.md](../../../development.md#release-bookkeeping); details in [evidence.json](./evidence.json):
- **Registration.** `test/coverageBatches.test.ts` is in `scripts/release-validation/general-tests.json`. The case denominator goes from 3,044 to 3,057, reviewed Vitest files from 119 to 120, general stages from 304 to 305 and reviewed Vitest stages from 138 to 139, in `test/release-validation/general-tests.test.mjs` and `generated-tests.test.mjs`.
- **Planning inventory.** Recorded with `scripts/release-validation/check.mjs --record` and `plan.mjs --record` after reviewing the drift: the new test file (13 cases), the probe's new hash and the registration file. Obligations go from 1,133 to 1,134; unresolved stay at 561.
- **Runtime census.** Recorded after review. No domain label or crypto call is in a changed line. Two source hashes changed, and three label sites in `localRetentionPlan.ts` moved: `done/source-capture/v1` 504 to 521, `done/account-spool/v1` 510 to 527, `done/account-delivery/v1` 511 to 528.
- **Construction registry.** Those three lines followed in `docs/account-crypto/constructions.json`.
- **Source-text anchors** (phase 556's rule): every string literal of 16 or more characters in `vite/`, `test/` and `scripts/` that occurs in the base versions of the two edited sources occurs the same number of times now, 58 occurrences, with one exception: `performance.now()` occurs 4 times in `inboundLedger.ts` instead of 2; elsewhere it appears only inside comments, not as a split anchor. The harnesses that rewrite `inboundLedger.ts` by text (`vite/inboundAuditFixture.config.ts`, `test/account-receive/fixtures.mjs`, `test/inbound-page/stale-turn-module.ts`, `test/account-liveness/instrument.mjs` by function name) anchor on lines this phase does not touch. `PREPARATION_SLICE_MS = 2000;` and `LOCAL_RETENTION_MIN_RECORDS = 1024;` are untouched.
- **Decision and notes.** A 2026-11-13 entry in `docs/decisions.md` (it records the change and amends nothing), one sentence in `docs/account-local-retention-preparation.md`, the REDUCE-FURTHER entry in `docs/product-backlog.md`, and the seat section of `docs/progress.md`.
- **Raw results** stay outside git; [raw-hashes.json](./raw-hashes.json) holds the SHA-256 of every probe result and profile, and [tables.md](./tables.md) the generated tables.

**Checks run on the final tree:** the typecheck; `vectors:check`, `retention:check`, `status:check`, `limit:check`, `authority:check`, `recipient:check`, `admission:check`, `remediation:check`, `debts:check` and `wasm:verify`, all passing; the runtime census check after recording; `scripts/release-validation/check.mjs` and `plan.mjs` after recording; and `test/release-validation/general-tests.test.mjs`, `generated-tests.test.mjs` and `inventory.test.mjs` (27 cases). Not run: the full unit suite, `pnpm build`, `trace:check`, `account:crypto-audit`, and the browser and native suites.

## What remains

- **The verifying stage** (1.4, 3.2, 7.3 and 20.0 s at 512, 1,024, 2,048 and 4,096 pairs after this phase) is now 76% of the uncached pass at 2,048 and 74% at 4,096. It is mostly linear crypto-bound work, plus a quadratic term from one Yjs transaction per content row while building its receipt-coverage document in a document with one client per own position. Grouping those applies into one transaction would remove that term the same way; that is a different stage and was not touched.
- **The building stage** grows about four times per doubling (0.7 s at 2,048 pairs, 3.2 s at 4,096 on the phase 556 source). Not profiled.
- **The row loop outside the coverage view** (classifying 7 of every 9 rows, yields, garbage collection) is 66, 134, 349 and 800 ms; most of it is classifying receipt rows, which is linear. The time inside the view grows faster (6, 12, 36 and 117 ms) because each group's transaction is still proportional to the number of Yjs clients; a larger group, or one transaction per batch, would shrink that at the cost of a longer synchronous step.
- **A randomized property suite** comparing batches with the per-call reference, wanted later (adversarial property tests backlog).

## At review

The coordinating session read the source diff, the new test file, the fork and comparison in `src/crdt/yjs.ts` and the repository's Yjs patch on 2026-11-13, and followed the argument above against them. It ran the following on the final tree.

- **Full unit suite:** 357 files, 3,712 cases passed, 1 skipped, none failed (3,699 before this phase plus the 13 new cases).
- **Independent control.** With the batch's comparison weakened to the state vector alone, 4 of the 13 cases fail: a pending dependency, a deletion-only row, an origin inside a surrogate pair, and the differential comparison. Source restored byte for byte.
- **Randomised differential (review only, not kept in the tree).** 400 generated histories of 140 to 240 updates from three writers: text with surrogate pairs and formatting, a map and an array, with garbage collection on or off per writer. Each history gave three scenarios. The candidate was the state after a causal prefix or, in about one in eight, a subset with a hole, which leaves the candidate pending. The rows were that prefix, sometimes shuffled, with duplicates, sometimes the candidate's own bytes, and in seven of ten scenarios up to three uncovered rows. Each scenario ran at four batch budgets (one byte, a third of the rows' bytes, the candidate's length, unbounded).
  - 4,800 comparisons with the per-call reference: no difference in the refused row or the error.
  - The reference refused 872 of the 1,200 scenarios, 505 of them at row 64 or later.
  - All 312 fully covered scenarios with a settled candidate were proven by their batches at the unbounded budget, with no row checked alone.
  - 143 scenarios had a pending candidate.
  - Against the weakened comparison the same probe reported 267 differences in 480 comparisons.
- **Re-measured** once per size, with no other test process running: the coverage stage took 92 ms at 512 pairs and 373 ms at 2,048, and the pass 1.9 s and 9.9 s. The medians above are 94 and 458 ms; the 2,048-pair runs behind them spread from 363 to 478 ms.
- **Sliced arms, one run per size.** The sliced arm is what a device runs. At 1,024 pairs it took 7.0 s with the two-second target and 6.8 s with the 0.5 s target, against an uncached pass of 3.9 s in the same process; at 2,048 pairs 15.8 s and 16.1 s against 9.3 s. Each made 2 attempts and 1 fenced save. Phase 556 measured 15.8 s at 1,024 pairs and 43.3 to 43.9 s at 2,048.
  - The seconds a sliced reduction pays over the uncached pass are about what they were (3.1 s at 1,024 pairs, 6.6 s at 2,048; phase 556 had 4.9 s and 7.8 to 8.4 s), but the floor under them is lower.
  - So the ratio to the uncached pass is now 1.81 at 1,024 pairs and 1.71 at 2,048 by wall clock, and 2.08 and 2.16 by CPU. Phase 556's stop condition (at most 1.5 times at every size) is not met against the new floor at either size.

Notes from the review:

- **Worst case.** The number of batches is about the content rows' bytes divided by the snapshot's, 2 at every size here. A history whose content rows are large against the snapshot (many `state` rows, each about the document's size) closes a batch more often, at worst one per row, which is the cost before this phase. Not measured.
- **What an interruption can lose (read from the code, not measured).** The coverage stage is not saved between attempts, and queued input can cut it at any row, so the attempt that finishes has to get through all of it. At 2,048 pairs on this Mac that was 24 s before this phase and is under half a second after.
- **Diagnostic timer.** `settle` times a span that includes the last group's apply, which `applyWaiting` has already timed, so the `coverageCheck` total counts that group twice. The stage times in this record come from progress marks, not from that timer.
- **Randomised suite.** The differential above is not in the repository; a kept property suite is still the backlog item named under What remains.

## Not verified

- No device, browser or Worker. The probe and tests run the plan in Node, not in the composed Account owner Worker.
- The rebase path (a reduced device's next reduction, `rebaseLocalBaseline`) was not measured; it runs the same loop, and the existing `localBaseline` rebase plans pass.
- A history with installed history snapshots (`state` rows) or carried capsules at these sizes, and a device whose Yjs client count is far below its position count, which this fixture does not have.
- The pending-view guard and the settle-before-classifying order against a real candidate or a real damaged row: the candidate cannot hold pending parts and the census refuses such rows before coverage, so both are exercised only by constructed views and an injected fault.
- The sliced (production) arms beyond one run per size at 1,024 and 2,048 pairs (see At review). The other sizes were not re-run, and no spread was taken.
- The longest synchronous step and memory use, before or after.
- That every Yjs path behaves as items 1 to 3 describe for inputs outside the constructed cases; the argument rests on reading Yjs 13.6.31 and the repository's patch.

## Limits

- No device and no browser. The probe is Node with fake in-memory IndexedDB on one shared Mac.
- The probe's fixture has one Yjs client per own position, so per-transaction costs that scale with clients are larger than on a device that writes from few sessions; it has no installed history snapshot or carried capsule at these sizes.
- No commit or deployment.

[Identities and results](./evidence.json).
