# Phase 558 — no argument spread over arrays that grow

The coordinating session asked on 2026-11-13 for every place that appends an array by spreading it as call arguments (`target.push(...items)` and its relatives) to be surveyed, and for the ones whose array can grow without a stated bound to be replaced by something with no argument limit and the same result. Investigation 07 had flagged one such spread on the content owner's reopen path (its "line 412", now `src/crdt/contentStore.ts:423`), and phase 542 had recorded Chromium throwing at about 200,000 spread arguments. The affected desktop never reduced its history and its row count is unknown.

Base: phase 557, index tree `44f4ba6abeda7ddd08f55ea0ab84ad4fe1b41a86`, staged on commit `bfb512c70`.

## Result

**The limit is lower where the content owner runs.** In a dedicated Worker, Chromium 151 throws at 63,512 spread arguments and WebKit 26.5 at 50,291. Phase 542's figure was measured on a page's main thread, where Chromium throws at 123,580 and WebKit at 638,677. The content owner and the receive owner's coverage view run in the Account owner's dedicated Worker, so the threshold that matters for them is about 50,000 rows in WebKit and 63,500 in Chromium. That is a quarter of the figure in the brief. Phase 554's fixture holds 21,602 physical rows at 3,000 own positions, about 7.2 per position. On that shape a device that has not reduced would reach the WebKit Worker limit near 7,000 positions and the Chromium one near 8,800. This is an estimate: rows per position vary. See [Engine limits](#engine-limits).

**What failed.** A complete read that reuses the opened view spread every row of the content generation into one `push`. That read runs on the first load after a return to the app, among other times. Once the generation held more rows than the limit, that load threw a RangeError, which clears the view, so the next load decrypted every row again. Each later return threw again. This is read from the code and reproduced in Node at 150,000 rows. It was not observed on a device.

**Built.** The survey found 67 argument spreads in the 526 source files under `src`, `account-service` and `account-protocol`. Seven were changed, and each is now a loop with the same result, order and element identity. The other 60 are left, each with what bounds it, in [survey.md](./survey.md). The brief's count of about 34 came from a text search. The syntax-tree survey also counts one-element conditional spreads, wrappers that forward their own fixed parameters, SQL parameter lists and `Reflect.apply`.

| Site (phase 557 line) | Operand | Why it was changed |
|---|---|---|
| `src/crdt/contentStore.ts:423` | every opened row, on a complete read that reuses the view | grows with history; nothing below `CONTENT_LIMIT` = 2^32 bounds it (the queue's site) |
| `src/crdt/contentStore.ts:806` and `:808` | one append batch, sealed and opened | every current caller caps a batch at `MAX_BATCH_RECORDS` = 256, but `append` and `appendRecords` do not check that themselves (the queue named it) |
| `src/crdt/inboundLedger.ts:704` | the content rows added since the coverage view was last prepared | no bound: a view prepared with few rows that then meets a long history appends all of it (the queue's site) |
| `src/crdt/serialize.ts:99` | one entry per line of a card body | document content, which a peer can write; export and the legacy import check both serialize |
| `src/crdt/persistence.ts:242` | every local update since the last committed flush, put back after a failed one | grows by one per edit while IndexedDB keeps failing, plus a recovered crash journal |
| `src/editor/gentleContext.ts:316` | CodeMirror's visible ranges | while printing, CodeMirror measures the whole document (`fullPixelRange` in @codemirror/view 6.43.7), one range per span between hidden spans of 20 or more characters |

No stored format, wire message, limit or recorded decision changes. No check is weakened, narrowed or run on less input.

## The change and why each replacement is equivalent

- **`contentStore.ts:423`**: `if (reuse) opened.push(...copyRecords(openedView!.opened))` becomes `for (const row of copyRecords(...)) opened.push(row)`. The rows are the same fresh copies, in the same order. `opened` was empty before the line in both versions.
- **`contentStore.ts:806` and `:808`**: the sealed batch (`added`, already a `structuredClone`) is pushed one row at a time. The opened rows are still built by the same `records.map` with the same copies of the plaintexts before any is pushed, then pushed one at a time. Any throw inside the step clears the whole view, before and after, so a partial push leaves nothing behind.
- **`inboundLedger.ts:704`**: `rows.push(...added)` becomes a loop over `added`. `rows` and `coverage.append(added)` still share the same row objects, as before.
- **`serialize.ts:99`**: `out.push(...encodeCard(body))` becomes a loop over the same lines.
- **`persistence.ts:242`**: `pending.unshift(...batch)` becomes `const later = pending.splice(0)`, then push every entry of `batch`, then every entry of `later`. `pending` ends as the batch followed by what was queued meanwhile, in place (it is a `const` array other closures hold), with the same entry objects.
- **`gentleContext.ts:316`**: `Math.max(head, ...ranges.map((r) => r.to))` becomes `ranges.reduce((max, r) => Math.max(max, r.to), head)`. A left fold of the two-argument `Math.max` gives the same number as the many-argument call for any numbers, including NaN and signed zeros. Positions are non-negative integers.

**Cost.** In Node, appending 21,602 row objects took a median 0.06 ms with the loop and 0.17 ms with the spread. At 100,000 it was 0.68 and 0.75 ms. The copy that `copyRecords` makes of the same rows took 1.1 and 11.4 ms ([push-cost.txt](./push-cost.txt)). `contentStore.ts:423` is the only site whose operand is large on a normal path, and the loop costs nothing measurable beside the copy. The batch sites are at most 256 rows today, the persistence site runs only after a failed flush, and export and the editor fold are not hot.

## What runs differently

Below the limit, nothing: every site gives the same result as before. Above it, the old code threw a RangeError, and these paths now complete:
- a complete read that reuses the opened view returns its rows instead of throwing and clearing the view;
- an append past the limit extends the warm view instead of throwing (after its rows were committed) and clearing it;
- the receive owner's coverage view appends every added row instead of clearing itself;
- export and the legacy import's canonical check serialize a card past the limit;
- a failed local flush puts its batch back and reports the IndexedDB error. Before, the RangeError replaced that error and the batch left the queue, so the next `whenDurable` could not settle: `flushThrough` would loop on microtasks with an empty queue. That is read from the code; the same loop ran out of heap in a mutation run (see [Mutation controls](#mutation-controls));
- the gentle-context measurement completes while printing a document with that many ranges.

## Engine limits

The smallest array length at which `[].push(...array)` throws, by bisection, measured on one Mac ([engine-limits.txt](./engine-limits.txt); probes [limit-node.mjs.txt](./limit-node.mjs.txt) and [limit-browsers.cjs.txt](./limit-browsers.cjs.txt)):

| Engine and realm | Passes at | Throws at |
|---|---|---|
| Node 26.13.1, main thread (where Vitest's `forks` pool runs tests) | 124,277 | 124,278 |
| Node 26.13.1, main thread, 200 frames deeper | 122,253 | 122,254 |
| Node 26.13.1, `worker_threads` Worker (default limits) | 494,377 | 494,378 |
| Chromium 151.0.7922.34, page main thread | 123,579 | 123,580 |
| Chromium 151.0.7922.34, dedicated Worker | 63,511 | 63,512 |
| WebKit 26.5, page main thread | 638,676 | 638,677 |
| WebKit 26.5, dedicated Worker | 50,290 | 50,291 |

`unshift`, `Math.max` or `Math.min`, `String.fromCharCode` over a `Uint8Array`, and `apply` throw within a few arguments of `push` in each realm. The limit is a stack limit, so a caller already deep in the stack meets it a little earlier. The browsers ran Playwright's bundled builds on a bare page served by `page.route`, with no application and no server, each bounded at 60 s and closed afterwards. Firefox was not measured in this phase; phase 542 recorded it passing at 500,000 and throwing at 1,000,000 on a page.

## Tests

**New: `test/argumentSpreads.test.ts` (9 cases, about 32 s).** `ROWS` = 150,000, above this realm's limit. Every case except the two controls drives the real code path at `ROWS`.

1. **Control: the old expressions throw here.** `push`, `unshift` and `Math.max` with `ROWS` spread arguments throw a RangeError in this realm. This case passes on both sources. If the tests ever run where the limit is higher (a `threads` pool is about 494,000), it fails and says `ROWS` no longer trips the condition.
2. **A complete read after a return reuses the opened view of `ROWS` rows** (`contentStore.ts:423`). This uses the real content owner with real WebCrypto AES-GCM and HMAC over fake IndexedDB, opted into opened-row reuse and warm loads as Account owners are. History is built in six appends of 25,000 rows. Then come a full load, `invalidateWarm()` as a return to the app does, and a load that must reuse the view.
   - That load decrypts nothing, returns every row in order with the right bytes, and returns copies: erasing what the caller got leaves the next reuse intact.
   - The fixture's validator requires its rows in sequence order. A load hands the validator its rows before it sorts what it returns, so the returned order alone cannot show the order pushed. This applies to every case that uses the owner.
3. **One append of `ROWS` rows extends the warm view** (`contentStore.ts:806` and `:808`). The view already holds 3 rows from an earlier append and load, so the batch must land after them.
   - The warm load returns all `ROWS` + 3 rows in order with the right bytes, which checks the opened rows (`:808`).
   - A complete read after `invalidateWarm()` then reuses the view without decrypting. That happens only if every sealed row was added in the same place as on disk, which checks the sealed rows (`:806`).
   - No current caller appends more than 256 rows at once; this drives `append` itself past the limit.
4. **An incremental prepare appends every new row in order** (`inboundLedger.ts:704`). The real `createInboundCoverage({ incremental: true })` is prepared with one row, then with all `ROWS` real Yjs updates (one character each from one writer). The case expects `append`, then `same` for the same rows. The caller then erases its own rows, as owners do after use, and the same rows read again must still be `same`, so the cache holds its own copies. Last, the coverage document must cover the whole state and refuse one more character; a refusal clears the view, so it comes last.
5. **A card of `ROWS` lines serializes and parses back** (`serialize.ts:99`), with blank lines among them, through the real `serializeCardList` and `parseCardList`.
6. **A failed flush of `ROWS` recovered updates is retried whole** (`persistence.ts:242`). The real `openLocalStore` runs (y-indexeddb over fake IndexedDB) with a recovered crash journal of `ROWS` entries. The open's 250 ms flush timer is held with fake `setTimeout`, so the first flush is the awaited one. That flush takes its batch and then cannot open its transaction (a stubbed `IDBDatabase.prototype.transaction` throws `InvalidStateError`).
   - Between the two, two real document edits arrive and are queued behind the flush. They go through the store's own update handler and journal, and y-indexeddb's own transactions pass through the stub.
   - The case expects that exact error from `whenDurable` and from the error report, with the journal intact (`ROWS` + 2 entries).
   - The retry must hand IndexedDB the failed batch first, whole and in journal order, then the two edits in their order, and only then clear the journal.
   - Each add is checked as it is made, and the count is checked when the flush commits. A wrong order or a missing entry therefore fails the retry itself, rather than leaving `whenDurable` waiting on a sequence that was written early or never.
   - The adds are recorded rather than stored: fake IndexedDB takes about 15 s to store that many, and storing them is the unchanged path `test/store.test.ts` covers.
7. **Gentle context dims the same lines as a fresh projection with `ROWS` visible ranges** (`gentleContext.ts:316`). This is the real plugin over a real Markdown `EditorState`, run against the fixed-geometry view harness of `test/gentleContextIncremental.test.ts`. It has two parts.
   - `ROWS` ranges over the whole document. The line after the caret stays clear only if the section is found through the largest visible end.
   - `ROWS` ranges that all end before the caret. The decorations cannot show whether the caret was in the fold, because `gentleContextPlan` itself plans through `max(head, through)`. What shows it is the plugin's plan cache: a plan is reused while the caret stays inside the span it was computed through, and that span ends at `through + 1`. So the unchanged view, measured again, must reuse its plan, meaning no `Tree.resolveInner` call. That happens only if the fold included the caret.
   - The state is given its complete syntax tree by one empty transaction after the parse, as a running editor's state has once its parser is done. Without it, the 150,000-character document's initial tree is partial, and the first measurement's own effect swaps the tree and empties the cache whatever the fold did.
8. **Control: the guard's detector finds the old expressions.** It also finds `f.apply(thisArg, args)` and `Reflect.apply` with an argument list. It ignores array-literal and object spreads and a method named `apply` called with no arguments. Passes on both sources.
9. **Guard: no argument spread returns at the changed sites.** A Babel syntax-tree walk of the five changed files must find no argument spread and no `apply` with an argument list. The one exception is `inspectInbound`'s forwarding of its own fixed parameters.

**On the phase 557 source** ([run](./base-tree-run.txt)), all seven non-control cases fail and both controls pass. Each RangeError's first source frame is the site it guards: `contentStore.ts:423`, `:806`, `inboundLedger.ts:704`, `serialize.ts:99` and `gentleContext.ts:314`, where the `Math.max(` call begins. The persistence case fails on its assertion, because `whenDurable` rejected with the RangeError instead of the IndexedDB error. The guard fails on the five files. The base run wrote the staged text of the five sources over them with `git show :<path>`, ran the final test text, restored them and checked each with `cmp`.

**Coverage levels.** All seven changed sites are driven through their real code at `ROWS` in Node's main thread. None is driven in a browser or in the composed Account Worker, where the limit is lower. The fix removes the spread, so the limit no longer applies there, but no test runs there. Two parts are harnesses rather than the real component: the gentle-context case gets its visible ranges from a fake view, not from CodeMirror printing, and the persistence case's IndexedDB transaction failure and recorded adds are stubs.

## Mutation controls

[Output](./mutation-controls.txt), script [mutation-controls.py.txt](./mutation-controls.py.txt). Each mutation was applied alone to the final tree, the cases that guard that site were run, and the file was restored byte for byte. All 33 trip, each by an assertion.
- **The old spread, one site at a time** (7): each makes its real-path case throw a RangeError and the guard fail.
- **The coordinator's two controls at review** (2):
  - the entries that arrived during the flush put back before the failed batch: update 0 is written out of order;
  - the caret dropped from the fold (0 as its first value): the plan is not computed through the caret.
- **A loop with the wrong result** (24), which shows the cases check each property of the old expression and not only the absence of a throw. One or more per property in [What each replaced expression did](#what-each-replaced-expression-did-and-what-pins-it):
  - rows dropped, at `:423`, `:806`, `:808`, `:704`, `:99` and both halves of `:242`;
  - reversed or swapped order at each site;
  - put in front of what the target already held, at `:806`, `:808`, `:704` and `:99`;
  - aliases instead of copies, at `:423`, `:808` and `:704`;
  - the fold taking the smallest end, or the starts of the ranges.

The first run after review had 33 controls and one did not trip: reversing the reused rows at `contentStore.ts:423`. A load sorts its rows by sequence before returning them (contentStore.ts:578), so the caller never saw the order. The validator, however, is handed the rows before that sort, and the case's validator accepted anything. It now requires sequence order, which every path gave it before this phase, and that control trips. The other 32 tripped in that run too.

Before review, the whole failed batch put back in reverse was tried and left out, because it crashed the run (`whenDurable` looped until the heap ran out) instead of failing an assertion. The retry now checks each add as it is made and the count at commit, so that mutation, and the dropped ones, fail the retry with a message.

## What each replaced expression did, and what pins it

Every property the old expression had, and what fails if the new code loses it (case numbers as under [Tests](#tests)).

| Site | Property of the old expression | Pinned by |
|---|---|---|
| `contentStore.ts:423` | every reused row is present | case 2 row count; control "first reused row dropped" |
| | in sequence order, as handed to the validator (the load sorts what it returns) | case 2 validator check; control "reused rows pushed in reverse" |
| | fresh copies, not the view's rows | case 2 erase-then-reuse check; control "aliased, not copied" |
| | after what `opened` already held | vacuous: `opened` is declared empty above and nothing is pushed before this line, in both versions |
| `contentStore.ts:806` | every row of the batch reaches the sealed view | case 3 reuse needs the sealed view to match disk; control "first sealed row dropped" |
| | in order | control "sealed batch pushed in reverse" |
| | after the rows the view already held | case 3 starts from 3 held rows; control "sealed batch put in front" |
| | the clones in `added` (shared with `warm.appended`), not the objects in `records` | **not pinned**: no current caller changes the records `appendRecords` returns (`append` keeps only their sequences; compaction's `publish` reads `seq`), so the two cannot be told apart today |
| `contentStore.ts:808` | one opened row per appended record | case 3 row count; control "first opened row dropped" |
| | in order, each paired with its record | case 3 bytes and validator check; control "opened batch pushed in reverse" |
| | after the rows the view already held | case 3; control "opened batch put in front" |
| | bytes copied from the plaintexts the append erases afterwards | case 3 bytes; control "opened rows alias the plaintexts" |
| | every row built before any is pushed | not testable without injecting a throw into the step; any throw there clears the whole view in both versions |
| `inboundLedger.ts:704` | every added row | case 4 `same`; control "first appended row dropped" |
| | in order | case 4 `same`; control "appended rows reversed" |
| | after the rows already cached | case 4 `same` (one row cached first); control "appended rows put in front" |
| | the copies `copyRecords` made, shared with `coverage.append`, not the caller's rows | case 4 erases the caller's rows and expects `same` again; control "cached rows alias the caller's rows" |
| `serialize.ts:99` | every line of the card | case 5 line count and round trip; control "first line of each card dropped" |
| | in order | case 5; control "a card's lines reversed" |
| | after the earlier cards and their blank separator | case 5 (three cards); control "a card's lines put before the earlier cards" |
| `persistence.ts:242` | every entry of the failed batch | case 6 per-add check; control "failed batch dropped" |
| | in order | case 6; controls "first two swapped" and "whole batch reversed" |
| | in front of the entries that arrived during the flush | case 6 (two edits arrive in flight); review control |
| | those later entries kept, in their order | case 6 per-add and commit-time checks; controls "arrived meanwhile dropped" and "arrived meanwhile reversed" |
| | the same entry objects, in place in the shared `pending` array | identity is not observable: an entry is read only for `update`, `key` and `value`, which the written bytes and the cleared journal pin. `pending` is a `const`, so it cannot be replaced |
| `gentleContext.ts:316` | the caret is a candidate | case 7 plan-cache check; review control |
| | the largest visible end is a candidate | case 7 "child note" stays clear; controls "smallest end" and "range starts" |
| | ranges in any order | the maximum does not depend on order |

One property is not pinned: which clones `:806` puts in the sealed view. The loop iterates `added` exactly as the spread did, which the diff shows.

## At review

The coordinating session reviewed the change on 2026-11-13. It ran two controls on the final tree that the first version of the test did not detect. The test was strengthened as described under [Tests](#tests) (cases 3, 4, 6 and 7, and the case 2 validator); the case count is unchanged at 9. No source changed: closing the gaps found no defect.

After the test was strengthened, the coordinating session ran the following on the final tree.

- **Full unit suite:** 358 files, 3,721 cases passed, 1 skipped, none failed (3,712 before this phase plus the 9 new cases). No other test process was running when it started.
- **Its two controls again**, both applied together: the persistence case and the gentle-context case fail, the other 7 pass. Sources restored byte for byte.
- **Browser limits re-measured** with the recorded script: the same eight figures, including 63,512 in a Chromium dedicated Worker and 50,291 in a WebKit one. Both are for a shallow call stack; a call made deeper in the owner has less room.
- **The failure path read again** (`openSnapshot` in `src/crdt/contentStore.ts`): the spread sat inside the `try` whose handler clears the view for anything but an interruption and rethrows, which is what the Result section says. What the caller shows the user was not traced.
- Also run: typecheck, build, contract and bookkeeping checks, the history, service delivery and service inbound node tests, and the CI session, authority and quarantine steps.

## Bookkeeping

Following [development.md](../../../development.md#release-bookkeeping); details in [evidence.json](./evidence.json):
- **Registration.** `test/argumentSpreads.test.ts` is in `scripts/release-validation/general-tests.json`. Denominators move in `test/release-validation/general-tests.test.mjs` and `generated-tests.test.mjs`:
  - the case denominator, 3,057 to 3,066;
  - reviewed Vitest files, 120 to 121;
  - general stages, 305 to 306;
  - reviewed Vitest stages, 139 to 140.
- **Planning inventory.** Recorded with `scripts/release-validation/check.mjs --record` and `plan.mjs --record` after reviewing the drift: the new test file and the three registration files. Recorded again after review, when only the test file's hash moved. Obligations go from 1,134 to 1,135; unresolved stay at 561.
- **Runtime census.** Recorded after review. Five source hashes changed, no domain label or crypto call is in a changed line, and no label site moved.
- **Construction registry.** No line moved; `docs/account-crypto/constructions.json` is unchanged. It names functions in two of the changed files, not lines.
- **Source-text anchors** (phase 556's rule): every string literal of 16 or more characters in `vite/`, `test/` and `scripts/` that occurs in the base text of the five sources occurs the same number of times now: 186 occurrences ([anchors.py.txt](./anchors.py.txt)). The new test file is left out of that rule because it quotes the old expressions as its control.
- **Decision and notes.** A 2026-11-13 entry in `docs/decisions.md`, which records the change and amends nothing, and the seat section of `docs/progress.md`. No item under "Held from the release repair" in `docs/product-backlog.md` is affected, and none is added, because no unbounded site is left.

**Checks run on the final tree:**
- `test/argumentSpreads.test.ts` (9 passed);
- the 76 related test files that import the five changed modules or the `src/crdt` barrel: 1,242 passed and 1 skipped ([run](./related-run.txt));
- the typecheck;
- oxfmt and oxlint on the five sources and the new test;
- `vectors:check`, `retention:check`, `status:check`, `limit:check`, `authority:check`, `recipient:check`, `admission:check`, `remediation:check`, `debts:check` and `wasm:verify`;
- the runtime census check and `test/account-crypto-prep` (6 passed);
- `check.mjs` and `plan.mjs` after recording;
- the CI release-adapter step's nine files plus `inventory.test.mjs` (188 passed).

Not run: the full unit suite, `pnpm build`, `trace:check`, `account:crypto-audit`, and the browser and native suites. Before each heavy run, `ps` showed no vitest, node test or Playwright process ([overlap.log](./overlap.log)).

## Not verified

- No device, browser or Worker ran the changed code. The browsers measured only the engine limit on a bare page.
- That the affected desktop ever met the RangeError, or how many rows it holds.
- The return-to-app consequence beyond the owner: what the user saw when the load threw. This is read from the code.
- CodeMirror's printing path itself. The visible ranges come from a harness.
- Real IndexedDB, and the persistence retry's writes, which were recorded and not stored.
- Firefox's Worker limit, and any WebKit or Chromium build other than Playwright's.
- Whether `openLocalStore` runs at all for the affected account.
- Which clones `contentStore.ts:806` puts in the sealed view. The loop iterates `added`, as the spread did, but no test can tell `added` from `records` today.

## Limits

- Node with fake IndexedDB on one shared Mac. The engine limits are from one build of each engine.
- The row estimates for the Worker limits come from one fixture's shape (7.2 physical rows per own position).
- No commit or deployment.

[Identities and results](./evidence.json).
