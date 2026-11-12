# The cost of one sent position

A delegated agent's report from 2026-11-11, filed as delivered. Read-only at `ff8578cd0` to `9882e30cd`; no timing. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** Its first fixes are queued; the later steps are SEND-FURTHER in the product backlog.

---

## Send-cost investigation: one sent position on the Account fast path (read-only pass)

Worktree tip moved during this pass: it is now `9882e30cd` (phase 543, committed by the other agent). That commit touches no send-path code; its only change in `contentStore.ts` is in retention preparation at about line 1093, so it shifts later line numbers by about 5. Nothing was built, run or edited.

### Verdict on the operator's belief

**Partly right.** The release made sending much slower in three ways, two of which survive phase 538. But the bulk of the per-position work that grows with history was already there before the release.

**Added by the release (410221ad..759890ca0):**
- **Phase 401 refusal.** This put the device on a full ledger check for every change. It is the main cause, and phase 538 removed it.
- **New walks over the whole retained graph on every adopted ledger extension:**
  - `accountLedgerIndexUsage` → `ownedByteCapacity`, phase 401. It runs twice per adopted extension and once per speculative one. Since 538 its byte result feeds no gate, and no production code reads `ownedBytes`.
  - The receipt syntax turn, phases 409 and 412. `complete()` runs `noParserEscape(result)` and `dispose()` runs `eraseUnretained(…, result)`. Each walks the whole result, even when the turn captured no receipt, which is the case for every send-only extension.
  - Together: about 26 extra full-graph walks per sent position (14 + 12).
- **Unreduced semantic oracle (phases 416 and 417).** It moved into the warm-audit lane and became due every 256 appended rows, every 1,024 positions, or every 5 minutes. Before, it was due only after 1,024 rows *and* a compaction `state` row in the same change. It is a full O(history) reference check that shares the Worker and the storage queue with sending. It can be interrupted, but each attempt starts again with a full physical read.
- **Owner moved into a dedicated Worker (phase 168 onwards).** No app Worker existed in 410221ad. This adds one Worker↔Window round trip per position (`whenDurable`). Otherwise it is the same work on another thread.

**Unchanged by the release (files identical across the range):**
- `verifiedRecords.ts`, `accountEnvelopePreparation.ts`, `accountDelivery.ts`, `deliveryRecord.ts`, `spoolRecord.ts` and `cpuBudget.ts`, plus `driveOutboundStep` in `accountSyncDriver.ts`.
- So the operation sequence, the 18 loads per position, every byte comparison and every large clone predate it.

The lab's 1.8–2.6 s per position at 2,000–3,000 positions came from builds before phases 401, 409 and 417. My estimate (inferred, not measured) is that the release's new walks roughly double the fast-path cost at that size. Nobody has ever measured 410221ad itself at large history.

### Traced path, verified by reading

All paths are under `/Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/src/crdt/`.

This assumes steady typing with the default `coordinated-2000` batching (`accountBatchPolicy.ts`: 300 ms quiet, 2 s max), so there is about one journal flush per position. Each driver operation is a separate job on the serialized storage queue (`accountCapture.ts` `run`, 336–379).

| Job | Code | Loads | Appends | `assertCurrent` |
|---|---|---|---|---|
| T0 journal flush (`persist`) | `accountCapture.ts` 495–553 | 1 | 1 (updates + capsule) | – |
| T1 `deliveryStatus` | `accountReceive.ts` 3169–3177 | 1 | – | – |
| T2 `spoolStatus` | `accountReceive.ts` 3192–3226 | 1 | – | – |
| T3 `prepareNextEnvelope`, after a `whenDurable` Window round trip | `accountEnvelopePreparation.ts` 155–249 | 7 | 3 (position, attempt, envelope) | 4 |
| T4 `prepareSubmission` | `accountDelivery.ts` 375–430 | 3 (1 unselected) | 1 | 3 |
| T5 `submitOwned`, part before the network | `accountDelivery.ts` 284–300 | 1 | – | 2 |
| *HTTP submit (outside the queue)* | | | | |
| T6 `withState` + `record` | `accountDelivery.ts` 316–329, 247–283 | 3 (1 unselected) | 1 | 2 |
| T7 `deliveryStatus` | `accountSyncDriver.ts` 613 | 1 | – | – |
| **Total** | | **18** | **6** (5 spool/delivery + 1 capture) | **11** |

The earlier count of "about five appends" is correct. Adopted ledger changes are 6 (5 + capture), plus 2 speculative extensions.

**Fixed work on every warm load** (`contentStore.ts` `load`, 577–699):
- 1 IDB transaction for the shape check (`warmContent.ts` `check`, 62–120): the counter plus `count()`, first key and last key on 3 stores.
- 1 HMAC verify.
- 1 IDB transaction for the rolling audit slice (≤16 rows / 128 KiB).
- `crypt.validate` → `verified.verify`.

**Fixed work per append** (`appendRecords`, 700–808): about 3 read-only and 2 read-write IDB transactions, 2 signs and a seal. Rough total per position: about 62 read-only and 10 read-write IDB transactions, 11 custody reads and 1 HTTP request.

**Work that grows with history, per sent position:**

1. **Piece 1: verifier comparisons** (`verifiedRecords.ts` 170–177 and 184–198).
   - 12 full byte compares on unchanged loads (L0, L2, L3, L4, L5, L7, L10, L11, L13, L14, L15, L17).
   - 6 prefix compares on changed loads (L1, L6, L8, L9, L12, L16). These are one async `sameRecordsCooperatively([a],[b])` call per row.
   - 2 more synchronous `sameRecords` inside `verified.read(rows)`.
   - Total: 20 comparisons of all retained plaintext.
   - None of these share buffers: the verifier holds copies and the carrier passes its own `openedView.opened`, so every one is a real byte compare.
2. **Piece 2: `selectEnvelopeSources`** (61–116). Runs once. It builds the used set over every position, then decodes **every** retained capsule (`decodeSourceCapsule`: UTF-8, JSON, hex, re-encode and a canonical compare) and skips the used ones. It is fed by 3 deep clones of `envelopePreparationState` (the `sources` map with all capsule bytes plus all positions with their wires) at L3, L6 and L9 (`accountReceive.ts` 3185–3188).
3. **Piece 3: detached census copy** (`accountReceive.ts` 3065–3074). Runs twice (T4 and T6). Each time it deep-clones all of `census.delivery` (spool sources, positions, `sourceRecords`, events, entries, ledger) **and** all of `DeliveryState`. Submissions and responses are never pruned, so that state carries every submission and every response.
4. **Missed: `expectedPosition` chain** (`deliveryRecord.ts` 196–219, called from `accountDelivery.ts` 256 in `record`). Once per position it decodes every envelope and runs one async SHA-256 `acceptanceLink` per position since the origin. The verified view already holds this answer in `indexes.expected`.
5. **Missed: the speculative proposal check** (`accountReceive.ts` 3082–3156, from `accountDelivery.ts` `persist` 210–240). Runs twice (submission and response). Each run:
   - does an unselected load (`copyRecords` of every row);
   - calls `verified.read(rows)`, which compares and then deep-clones the **whole** `AccountLedgerView`;
   - runs a speculative `extendAccountLedger`;
   - erase-walks both the clone and the candidate.
6. **Missed: full-graph walks**, about 42 per position:
   - 12 at adoption: `eraseUnretained([value, retained], [result, candidate])`, 2 per adopted extension (`verifiedRecords.ts` 217). Predates the release.
   - 14 from `ownedByteCapacity` (`incrementalAccountLedger.ts` 112–115; callers 319–325 and `accountReceive.ts` 897–901). Added by the release.
   - 12 from the receipt turn (`accountInbound.ts` 875–888 and 992–1021). Added by the release.
   - 4 erase walks in the proposal check. Predate the release.
7. **Missed: `extendAccountLedger` copies (8 calls) and coverage compares (6).**
   - Each call shallow-copies every Map, Set and array in the indexes, the spool (every position object respread) and the delivery state (`incrementalAccountLedger.ts` 359–387).
   - `verifyDelivery` remaps all positions (242–259).
   - `verifyInboundLedger` copies the `retained` map (`inboundLedger.ts` 666–675).
   - `coverage.bind` → `prepare` byte-compares every content row (583–617), once per adopted extension.
8. **Missed: IDB `count()`.** 3 per load, so 54 per position. Chromium's IndexedDB backends count by iterating keys. That they are O(rows) here is inferred, not measured. The existing `warmShapeCheck` timer covers it.
9. **Beside the path: the semantic oracle** (item 3 in the verdict above; `accountReceive.ts` 288–297 and 471–479; `accountCapture.ts` 380–451). The 538 report (4–5 minutes per position on the full path, about 8 full checks per position) implies a full check costs about 30 s at that account's size.

**Reduced devices take a different path.** If 539–542 let the desktop reduce, `validate` takes its baseline branch. Each change then:
- deep-clones `baseline.ledger` and its records;
- runs `localBaselineReuse.advance`, a second verifier instance that does a prefix compare, an extension, `verified.read` deep clones and `copyRecords` of every logical record;
- calls `memo.clear()` on every advance.

That work is bounded by the suffix since the baseline. Both states need measuring.

### Why each piece exists, and whether it must grow with history

- **Unchanged-load byte compare** (2026-09-12 `2623b8308`, 10-11 `46388e4fe`, 10-12 `f4f012280` / `02829405a`).
  - It proves the carrier's in-memory plaintext still equals what the verifier authenticated.
  - Selections answer from the verifier's own retained value, so on an unchanged load the compare only buys early detection of an in-place change to memory. The next change's prefix compare and the oracle would catch it anyway.
  - A constant-size substitute (view identity, which `verified.select` already binds to) is **barred by recorded decisions**: phase 142, "do not … treat a revision/hash as authority", and phase 409, "Do not substitute a persisted alias, lease, counter or later audit for exact retained-row checks". It needs an explicit amendment.
  - Precedent for such an amendment: the 2026-10-12 decision accepted "the live owner continues using previously verified memory" between storage and the carrier view.
- **Prefix compare on change.** Phase 334 says it guards exact bytes before buffers are borrowed into a new candidate. It is needed as long as the verifier and carrier hold separate copies. The only constant-size alternative is a single owner of the plaintext, which is a large change to erasure. Keep it, but make it one cooperative pass.
- **Source selection** (original allocation rule; phase 154 only narrowed the clone). It protects a contiguous run of unused originals within the batch limits.
  - `indexes.sources` (id → epoch plus actor, kind and length per source) and `indexes.used` already hold exactly the metadata it decodes capsules to get, in the same order.
  - A constant-size selection is sound: only the selected capsules need bytes and a hash.
  - Must not weaken: the order, the batch rule, and the extension's source checks.
- **Census and state copies** (phase 143, `f98d857a7`, 2026-10-28, before the release). "Separate detached copies" preserves two independent detached projections.
  - The operations read one position's wire and retries, plus the scalars `acceptedThrough`, `finalThrough`, `conflict` and the refusals, plus that one position's submission and responses.
  - Narrow projections keep the boundary (still two separate detached clones). The expected link comes from verified `indexes.expected`, with `expectedPosition` kept as the fallback when there are no indexes.
- **Proposal check** (2026-10-10 `4500d9b61`; phase 143 says "keep speculative proposal verification"). It must never persist a delivery row the verifier would reject.
  - The gate stays.
  - The whole-view deep clone and the unselected load are a mechanism, not the gate.
- **`ownedByteCapacity`** (phase 401). Since 538 its result is reported only, and nothing reads it in production. It can be computed on request (profile builds and tests). This amends 538's wording "keep measuring", not any check.
- **Receipt turn walks** (phase 409). They protect against parser objects escaping into the retained view, and erase turn outputs. With no captured rows, parsers or outputs, there is nothing to protect, so skipping the walks is sound by construction.

### Fixes, smallest sound change first

Each step is measured before the next.

| # | Change | Files | Removes per position | Risk | Size | Decision needed |
|---|---|---|---|---|---|---|
| 0 | Instrumentation only: timers for unchanged vs. prefix compares, `verified.select` clones, index usage, turn walks, proposal check, expected chain; per-op tags in `driveOutboundStep` | `accountLedgerMetrics.ts`, `verifiedRecords.ts`, `incrementalAccountLedger.ts`, `accountInbound.ts`, `accountDelivery.ts`, `accountReceive.ts`, `accountSyncDriver.ts` | – | none | ~80 lines | no |
| F1 | Compute `ownedBytes` lazily (profile builds and tests only) | `incrementalAccountLedger.ts` 94–117; budget tests | 14 graph walks | minimal | ~15 lines | amend 538's "keep measuring" wording |
| F1b | Receipt turn returns early when it captured nothing | `accountInbound.ts` 875–888, 1007–1021 | 12 graph walks (send-only extensions) | minimal | ~6 lines + test | no |
| F2 | Narrow `loadState` projections; `record` uses `indexes.expected` | `accountDelivery.ts`, `accountReceive.ts` | 2 census + 2 state deep clones, 1 hash chain | low–moderate | 120–200 lines + equivalence test | no (boundary kept) |
| F3 | Indexed source selection inside the selection; small reloads after each append; pre-commit check of the position row against the indexes | `accountEnvelopePreparation.ts`, `accountReceive.ts`, helper in `incrementalAccountLedger.ts` | 3 deep clones, 1 decode of every capsule | moderate | 120–180 lines + property test vs. the scan | no |
| F5a/b | One cooperative prefix pass; merge back-to-back loads (`deliveryStatus` + `spoolStatus`; envelope state + publication check) | `verifiedRecords.ts`, `accountReceive.ts`, `accountSyncDriver.ts` | constant-factor gain, ~3 compares | low | 60–80 lines | confirm phase 143's "independently refreshes" |
| F4 | Delivery-scoped speculative check on a small projection, selected load in `beforeCommit` | `accountReceive.ts`, `accountDelivery.ts`, `deliveryRecord.ts` | 2 whole-view deep clones, about 4 walks, 2 full row copies, 2 compares | moderate | 150–250 lines | yes (phase 143 mechanism; phase 142 if it borrows across awaits) |
| F5c | Skip the unchanged-load compare, or give the plaintext one owner | `verifiedRecords.ts` (or carrier and verifier) | about 12 byte compares | low for answers; slower in-memory tamper detection | small / large | yes (amend phases 142 and 409) |
| F7 | Adoption erase limited to buffers the extension actually dropped | `verifiedRecords.ts`, `incrementalAccountLedger.ts` | about 12 walks | hygiene only | medium | yes (phase 142, erasure) |
| F6 | Structural sharing in the extension, `verifyDelivery` and inbound state | `incrementalAccountLedger.ts`, `deliveryRecord.ts`, `inboundLedger.ts` | 8 × O(positions) copies | high | large | no |
| F8 | Oracle trigger proportional to history; no full re-read on every interruption | `accountReceive.ts`, warm-audit lane | background full checks | policy | small | yes (phases 416/417) |
| F9 | Shape check once per storage task instead of per load | `contentStore.ts`, `warmContent.ts` | about 40 IDB `count()` | policy | small | yes (2026-10-12) |

**Must not be weakened:**
- On every load: the counter MAC, shape check and rolling audit.
- Fresh authority before each effect and in each `beforeCommit`.
- The spool-witness compare-and-swap chain.
- The exact prefix compare before borrowing buffers.
- Speculative verification of every delivery row before commit.
- Detached projections, and erasure of every dropped buffer.
- The full-reference fallback and the semantic oracle.
- The allocation rules, checked again by the extension.
- The attempt grant persisted before sealing.

**Gain ranking (estimates, to be replaced by step 0's numbers):**
1. F1 + F1b. Release-introduced, about 26 walks; plausibly about 1 s or more per position at 3,000 positions.
2. F4.
3. F2.
4. F3 and F5c.
5. F7.
6. F5a/b, F6, F9, F8.

The constant floor (about 70 IDB transactions per position) is separate.

**Protocol.** One position per round trip is **not** the dominant cost. Each position makes one HTTP submit (p95 22–82 ms in phase 334) against 0.35 to over 2.6 s of local work. If local cost falls to about 100 ms, the next step is pipelining position N+1's preparation during N's submit, which needs no wire change. Multi-position submits would be a separate wire proposal.

### Measurement plan and stop condition

**Build.** Production defaults plus `VITE_ACCOUNT_LEDGER_PROFILE=1`, applied to the Worker bundle as well.

**Harness.**
- `test/inbound-continuation` driver and fixture (the real composed Worker owner via `openAccountWorkerSession`, two devices, local account service), or `test/packaged-account/devices.ts` (`pairedEditors`, `add`, `position`, `idle`).
- Seeds at 300, 1,000 and 3,000 own positions, built once and cloned per run (the `cloneSeed` pattern). Keep seeds out of git; record hashes only.
- Measure both an unreduced fast-path device and a reduced device.

**Reading metrics.** `__doneLedgerMetrics` lives in the **Worker realm**: read it with `page.workers().find(w => /accountOwner\.worker/.test(w.url())).evaluate(() => globalThis.__doneLedgerMetrics())`. Existing tests read the page realm only.

**Per position**, take deltas over K = 30 positions after 5 warm-up positions, 3 repetitions, with the peer idle and then with the peer typing:
- timings: `storageOperation`, `loadElapsed`, `installOwned`, `readProjection`, `envelopeSelection`, `warmShapeCheck`, `storageQueueWait`, `incremental`, `full`;
- work counters: `loads`, `selectedLoads`, `recordCopyBytes`, `sourceParses`, `sourceParseBytes`, `deliveryPrefixLinks`, `authorityChecks`, `positions`, `loadedRows`;
- audit counters: `audits`, `auditCompletions`, `auditInterruptions`;
- the new step-0 timers.

Check `ps` for concurrent timed journeys under `/private/tmp` first.

**Stop condition**, a tightening of your proposal:
- **(a) Counters, enforced as unit tests** (like `accountLedgerCloneBudget.test.ts` and `publicationMetadataSelection.test.ts`). On the fast path, per position, independent of history:
  - `recordCopyBytes` = 0;
  - verifier projection bytes bounded by the position's own size;
  - 0 full-graph walks on send-only extensions;
  - `sourceParses` no more than the capsules selected;
  - `deliveryPrefixLinks` ≤ 1.
- **(b) Timing on the desktop.** Median local cost per sent position at 3,000 ≤ 1.2 × the cost at 300, and ≤ about 250 ms, so a continuously typing user stays inside the 300 ms batching quiet window. p95 ≤ 2 × median.
- **(c) Symptom.** In 60 s of typing on the 3,000 seed, "Input is waiting to be saved" never lasts more than 1 s, and the accepted tip trails by ≤ 2 batch windows.

**What ends the work:** (a)–(c) hold on both seeds. If, after F1–F3 and F5a/b, the remaining slope comes only from the exact per-change compares and is still within (b), stop and do not take F5c, F6 or F7 to the operator. If it is not within (b), bring F4, F5c and F7 to the operator with the measured numbers.

### What I could not determine

- **Any timing.** The ranking between walks, clones and compares is inferred from object and byte counts.
- **The affected account's row and byte counts.** The 32,768-row index bound (rows plus received-position extents) is still a cliff that 538 does not remove. At about 7 or more rows per own position plus peer rows, it sits near 2,000–4,000 positions per device. Past it, the device is back on a full check per change, so the stop condition must be tested where the index is still eligible, and reduction must keep rows under the bound.
- Whether the desktop has reduced since 539–542.
- The number of sources (update rows) per position on the real account.
- The actual oracle cadence and the cost of each interruption.
- That the profile define reaches the Worker bundle (likely, but unverified).
- Whether Chromium's `count()` cost matters at this size.
