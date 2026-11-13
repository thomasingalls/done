# Phase 562 — the all72 receipt-view case compares its bytes with Node's strict deep equality

The coordinating session asked on 2026-11-13 for the unit case that has kept GitHub CI red since 2026-11-07 (CI-UNIT-BUDGET in `docs/product-backlog.md`) to be repaired on the precedent of the 2026-10-16 decision "Keep unit deadlines and exact bytes while bounding hosted contention", test-only, with no deadline, retry or configuration change; for changed-byte and wrong-type controls; and for the next cases nearest the limit to be measured, not changed.

Base: phases 557 to 561, tree `11e047c1c71117ed3655c7b90f5b969f48494966`, uncommitted on commit `bfb512c70`.

## Result

`test/inboundReceiptViews.test.ts` › "all72 admitted extents expose exact positions, predecessor links and original bytes for two publishers", here, six runs each of the whole file with `--maxWorkers=1` and the repository's Vitest config ([runs.txt](./runs.txt)):

| Text | all72, ms | Other seven cases together, ms |
|---|---|---|
| base (`toEqual`) | 2,869 to 3,026 (median 2,930) | 98 to 110 |
| this phase (`assert.deepStrictEqual`) | 50.9 to 52.4 (median 52.1) | 102 to 108 |

That is 56 times faster by medians, and 55 times comparing the slowest new run with the fastest base run. All eight cases of the file pass in every run.

### Where the base case's time went

A copy of the case with a timer around each step, five runs ([lines.test.ts.txt](./lines.test.ts.txt), [lines.jsonl](./lines.jsonl)):

| Step (base line) | ms per run | Share of the loop |
|---|---|---|
| `expect(view.event.page).toEqual(record.page)` (75) | 2,703 to 2,861 | 93.0 to 93.3% |
| `expect(view.event.request).toEqual(record.request)` (74) | 127 to 132 | 4.2 to 4.4% |
| both | | 97.4 to 97.5% |
| everything else (fixtures, encode and inspect, `toMatchObject`, the identity and count checks) | 71 to 74 | |
| for comparison, `assert.deepStrictEqual` on the same two values in the same runs | 4.0 to 4.6 for both | |

A CPU profile of one base run agrees: 97.1% of the samples under the case function are in `equals` called from Vitest's `toEqual` ([profile.md](./profile.md)). The investigation's "about 98%" holds. Its sizes do not: the two arrays are not both about 12 KB. `request` is 536 bytes and `page` 11,483 bytes, and the page comparison alone is 93% of the case.

Why `toEqual` costs this much on a byte array: Vitest 4.1.10's `iterableEquality` walks both arrays element by element through the general recursive `equals`, and then compares `Object.entries(actual)` with `Object.entries(expected)`, which for the page is 11,483 two-element arrays a side, each pair compared through `equals` again. Node compares the two views' bytes in native code.

## The change

```ts
import assert from 'node:assert/strict';
…
          assert.deepStrictEqual(view.event.request, record.request);
          assert.deepStrictEqual(view.event.page, record.page);
          expect(view.event.request).toBe(source.receipt.record.request);
          expect(view.event.page).toBe(source.receipt.record.page);
```

The two `toEqual` lines become `assert.deepStrictEqual` from `node:assert/strict`, imported as `faf465f72` (the commit that implemented the 2026-10-16 decision) imported it in `test/localBaselineAnchor.test.ts` and `test/pendingProjection.test.ts`. The two identity assertions that follow, every other assertion, the fixtures, the two publishers, the 72 extents and the 240 views are unchanged. No other file under `test/` changes.

## What each matcher checks for a `Uint8Array`

Read from `@vitest/expect` 4.1.10 (`equals`, `iterableEquality`, `toEqual`) and from Node 26.13.1's deep strict equality (`objectComparisonStart`, `keyCheck`, and `deepStrictEqual` from `node:assert/strict`, which passes no option that skips prototypes), then run as a matrix of 24 values against the case's own page bytes, each in both argument orders ([matrix.md](./matrix.md), [matrix.test.ts.txt](./matrix.test.ts.txt)). No custom equality testers are registered in this repository.

| What is compared | `toEqual` | `assert.deepStrictEqual` |
|---|---|---|
| element values | each element through `equals` (`Object.is`), once by iteration and again through `Object.entries` | the viewed bytes of both, compared as bytes |
| length | both iterators must end together; the entry counts must match | `byteLength` must match |
| type | `constructor` identity; a plain array or other non-iterable side fails the `Object.prototype.toString` tag | `constructor` identity (Uint8Array is one of Node's well-known constructors), and the typed array's intrinsic kind (the `TypedArray.prototype[Symbol.toStringTag]` getter) must match |
| prototype object | not compared, only `constructor` | not compared for a well-known constructor in Node 26, only `constructor` |
| byte offset | not compared | not compared |
| underlying buffer | not compared | not compared |
| extra own properties | own enumerable string keys, through `Object.entries`, including keys whose value is `undefined` | own enumerable non-index keys, strings and symbols: same count, same values |
| non-enumerable own properties | not compared | not compared |

So the new matcher is no weaker on any row and stricter on two: an extra enumerable symbol property, and a typed array of another kind whose `constructor` property was set to `Uint8Array`. In the matrix `deepStrictEqual` refuses every value `toEqual` refuses, in both argument orders, and also refuses those two, which `toEqual` accepts. Both accept the same bytes at another offset of another buffer, which is the case's own shape: the decoded `request` and `page` are subviews at offsets 239 and 775 of a 12,258-byte copy the decoder owns, and the expected values are standalone arrays at offset 0. That the views belong to the receipt is what the two unchanged `toBe` assertions check, and the file's case "logical originals are owned independently of a mutated backing buffer at a nonzero offset" checks that they survive a mutated input buffer.

## Controls

[controls.txt](./controls.txt), written by [make_controls.py.txt](./make_controls.py.txt). Each control is a copy of the file in the scratch folder, with absolute imports and one change, run alone, filtered to all72, with one worker, the repository's setup file and the `node` environment, under a 300 s bound. Every control was run on this phase's text and on the base text. The repository was not modified.

| Control (each for `request` and, separately, `page`) | This phase's text | Base text |
|---|---|---|
| none (absolute imports only) | passes | passes |
| the decoded view's byte flipped just before the comparison: view 1 of 240 at byte 0, view 120 at the middle byte, view 240 at the last byte | 6 of 6 fail, at that field's comparison | 6 of 6 fail, at that field's comparison |
| the same flip in a copy of the expected bytes, used only in that comparison | 6 of 6 fail, at that field's comparison | 6 of 6 fail, at that field's comparison |
| the actual replaced, at every view, by a plain `Array`, a Node `Buffer`, a `Uint8ClampedArray`, a `Uint8Array` one byte shorter with the same prefix, a `Uint8Array` one byte longer with the actual as its prefix, and a `Uint8Array` of the same bytes with an extra own enumerable property | 12 of 12 fail, at that field's comparison | 12 of 12 fail, at that field's comparison |

The failing statement is mapped from the line in the copy's stack. The time to failure places each flip at its view: on this phase's text 21 to 39 ms at view 1, 40 to 57 ms at view 120 and 57 to 74 ms at view 240 (a page failure takes longer to report), and on the base text 21 to 38 ms, 1,451 to 1,462 ms and 2,859 to 2,926 ms. Two identity assertions still hold under the actual-side flips, because the receipt's own array is the one changed.

## What runs differently

- The two comparisons are Node's assertion instead of Vitest's matcher. A failure is reported as Node's `AssertionError` with its diff, not Vitest's. Vitest's assertion count no longer includes them; the case uses neither `expect.assertions` nor `expect.hasAssertions`.
- Nothing runs less often or on different input. The same two values are compared at each of the 240 views; the workload, sizes, fixtures, the five-second default and the 20-minute job limit are unchanged. No case is added, removed or skipped. No product code, Vitest or CI configuration, deadline, retry, stored format, wire message, limit or recorded decision changes.

## Survey of the next cases nearest the limit

Measured only; nothing changed. Each file was run whole, five times with `--maxWorkers=1` and the repository's config for the times, and three more times with one added setup file that times every `toEqual`, `toStrictEqual` and `toMatchObject` call per case and classifies it by what it compares, outside the timed region ([matcher-timing.setup.ts.txt](./matcher-timing.setup.ts.txt), [vitest.survey.config.mjs.txt](./vitest.survey.config.mjs.txt), [survey_table.py.txt](./survey_table.py.txt)). Shares are of the instrumented case's time, means of three runs; no `toStrictEqual` call occurred in these cases. CI's worst time is from the three failing runs in [ci-history.md](../561-stale-browser-tests/ci-history.md), section 3, on other commits and Node 24.22.1.

| Case | Here, ms (5 runs) | CI worst, ms | `toEqual` on byte arrays of 1 KiB or more | `toEqual` on an object holding one | `toEqual` on smaller byte arrays |
|---|---|---|---|---|---|
| `inboundStaleTurnControl.test.ts:4` | 1,799 to 2,029 | 4,263 | none | none | none (6 other `toEqual` calls, 0.3 ms) |
| `inboundPageCodec.test.ts:26` | 1,806 to 1,829 | 3,818 | 864 ms, 49% (72 calls, up to 12,258 B) | 843 ms, 48% (72 calls; the record holding the 11,483 B page) | none |
| `inboundMixedReplay.test.ts` seed406 | 1,233 to 1,252 | 3,138 | none | none | 277 ms, 22% (874 calls, up to 389 B) |
| seed407 | 1,378 to 1,399 | 3,653 | none | none | 297 ms, 22% (964 calls) |
| seed408 | 1,157 to 1,238 | 2,900 | none | none | 267 ms, 23% (866 calls) |
| `workspaceAdmission.test.ts:1256`, slowest of its five parametrizations (account-snapshots) | 1,026 to 1,051 | 3,385 | none | none | none (5,796 other `toEqual` calls, 28 ms, 3%) |
| `inboundMixedReaders.test.ts:124` | 1,402 to 1,430 | 3,149 | 939 ms, 68% (62 calls, up to 24,591 B) | none | none |
| `preparationReceiptJournal.test.ts` all72 | 1,269 to 1,362 | 2,736 | 850 ms, 66% (72 calls, up to 12,258 B) | none | none |

The full table, with every parametrization, is [survey.md](./survey.md).

Which the same replacement would move:
- `inboundMixedReaders.test.ts:124` (68%: `expect(saved).toEqual(c.raw)`), `preparationReceiptJournal.test.ts` all72 (66%: `expect(result.record).toEqual(compact.record)`) and the byte line of `inboundPageCodec.test.ts:26` (49%: `expect(encodeInboundPageRecord(record)).toEqual(bytes)`) are direct byte-array comparisons, the precedent's shape.
- The other 48% of `inboundPageCodec.test.ts:26` is `expect(decodeInboundPageRecord(bytes)).toEqual(record)`, an object holding the page. Node's strict equality on an object also compares keys whose value is `undefined` and the object's constructor, which `toEqual` ignores, so that would be a stricter assertion and would need its own check that it still passes. It is not the precedent's shape.
- `inboundMixedReplay.test.ts` seeds 406 to 408 spend about a fifth of their time comparing small byte arrays (`kept.envelope`, `kept.proof`, at most 389 bytes, near 900 calls each).
- `inboundStaleTurnControl.test.ts:4` and `workspaceAdmission.test.ts:1256` would not move. The stale-turn case's helper builds a module with Vite twice (read from `test/inbound-page/stale-turn-module.ts`, not profiled).

The cases the replacement would not move are also the ones whose CI worst time is the largest multiple of their time here: 2.3 to 3.3 times for the stale-turn, replay and admission cases, against 2.1 to 2.2 for the three byte-comparison cases and 2.0 for all72. Those ratios mix runner speed, Node 24 against 26 and the code changes since CI's commits, so they are an indication only.

## CI: what this does and does not establish

- No hosted run was made; this phase cannot run GitHub's runner. What is established is the local result: 2,930 ms to 52 ms by medians on this Mac, Node 26.13.1.
- On the three failing hosted runs all72 took 5,545 to 5,840 ms, 1.9 to 2.0 times its median here. At that ratio the new form would take about 0.1 s on a slow runner. That assumes Node's byte comparison scales between this Mac and the runner as Vitest's matcher did, which was not measured; even at ten times that ratio it would stay near 1 s.
- CI runs Node 24.22.1. The matrix, the controls and the reading of Node's comparison code are Node 26.13.1 only; Node 24's code was not read. The precedent's five comparison sites already rely on the same function under CI's Node.
- CI will still not pass from this alone. The 20-minute job limit cuts the packaged browser step before its last specs (CI-JOB-LIMIT, *decision*), and `removal-regressions.spec.ts` fails on a product defect (SETUP-CLOSING-STUCK).

## Runs and other processes

Before every timed run a `ps` snapshot was logged ([overlap.log](./overlap.log), written by [timeit.sh.txt](./timeit.sh.txt)). Throughout, another project (certo) ran Lean, Rust and Python builds at about 100% of one to three of this Mac's ten cores; load average 4.4 to 7.6. No other Vitest, `node --test` or Playwright process was running during any timed run whose numbers are used here. One sizing pass of the six survey files (one run each, `survey-probe` in the log) overlapped that project's Playwright run; its numbers are not used. The per-line probe, the profile and the instrumented survey runs were each preceded by one `ps` check, which found none.

## The investigation and the brief: corrections

- The two compared arrays are 536 and 11,483 bytes, not both about 12 KB; the page comparison is 93% of the case and the request comparison 4%.
- The investigation measured the strict form at 56 to 60 ms; here it is 50.9 to 52.4 ms.
- "Next nearest the limit" does not mean "same cost": two of the six named cases have no binary comparison at all, and the replay seeds compare only small arrays.
- `workspaceAdmission.test.ts:1256` has five parametrizations, at this tree and at CI's commit `3b8394590`, not six as ci-history.md says.

## Bookkeeping

Following [development.md](../../../development.md#release-bookkeeping); details in [evidence.json](./evidence.json).

**Planning inventory.** `check.mjs --record` once, after reviewing the drift: exactly one row changed, the hash of `test/inboundReceiptViews.test.ts` (`de152b8e…` to `5791ac61…`). Its declaration count stays at 8. `plan.mjs --record` then changed only the manifest's `inventoryDigest` (`76d0a07b…` to `6d8ab215…`). Obligations stay at 1,136 and unresolved at 561. The file stays blocked in the manifest pending review of its runtime denominator.

**Registered counts.** None moves: no case is added or removed, and the controls are recorded mutations rather than new cases. The general-test case denominator stays at 3,092.

**Runtime census and construction registry.** Not affected: no file under `src`, `account-protocol` or `account-service` changed.

**Decision and notes.** A 2026-11-13 entry in `docs/decisions.md` names the 2026-10-16 decision as its precedent and amends nothing. The seat section of `docs/progress.md` carries phase 562. CI-UNIT-BUDGET in `docs/product-backlog.md` now says what was done, holds the survey's numbers, and is marked *decision* for widening the replacement to other cases.

**Checks after the edits.** `oxfmt --check` and `oxlint --react-plugin` on the test file; the typecheck (`tsc -b --noEmit`, and a full non-incremental `tsc -p tsconfig.app.json`); `check.mjs` and `plan.mjs`; `pnpm validation:inventory` (10 passed); CI's release execution adapter files (178 passed); the ten CI contract checks (`vectors:check` to `wasm:verify`, all exit 0); `pnpm account:crypto-prep` (the pinned census matched, 6 passed, not recorded). `pnpm trace:check`, last: one failure, the receipt of `check-origin-isolation`, which runs inside `pnpm build` (09:12Z) and was written against an earlier tree; it needs minting on the final tree.

Not run: the full unit suite and `pnpm build`.

## At review

The coordinating session read the two-line change on 2026-11-13 and ran the following on the final tree.

- **Its own control:** with the last byte of the last view's expected page changed in place in the test, the case fails with Node's `AssertionError` at that comparison and the other 7 cases pass. File restored byte for byte.
- **The case as repaired:** 53 ms in a one-worker run of the file, 8 of 8 passing.
- **Full unit suite:** 359 files, 3,746 cases passed, 1 skipped, none failed. No other test process was running.
- Also run: typecheck, build, contract and bookkeeping checks, the history, service delivery and service inbound node tests, and the CI session, authority and quarantine steps.

Not repeated at review: the matrix, the 48 recorded controls, the profile and the survey's measurements.

## Not verified

- Any hosted CI run, and the new form's time on a hosted runner.
- The matrix and the controls under Node 24.22.1, which CI uses.
- Whether replacing the survey cases' comparisons would keep them passing and how far it would move them; their shares are measured, the effect of a change is not.
- Where the stale-turn and admission cases spend their time; neither was profiled.
