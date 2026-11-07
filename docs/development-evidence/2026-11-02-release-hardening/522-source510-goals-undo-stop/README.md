# Phase 522 — Goals functional guard stop on plain510

**Date:** 2026-11-07. The fresh operator reply was “Ready; keep the host quiet for Goals.” Six frozen Goals journeys were declared. Three ran: two pass, one fails. The remaining three are **not run**, under the existing functional-failure stop rule. No app, test, assertion, deadline, gate, limit, format or release flag changed. No new observer or profiler was added to any timed run.

| Run | Frozen outcome | Beforeinput p95 ms | Key-to-rAF p95 ms | Cold | Saved end counter / revision / history |
|---|---|---:|---:|---|---|
| r1-goals-desktop | pass | 6.773 | 15.375 | exact, 2497ms | v5 / 1 / baseline-plus-suffix |
| r1-goals-mobile4x | pass | 4.379 | 34.368 | exact, 2331ms | v5 / 1 / baseline-plus-suffix |
| r2-goals-desktop | **FAIL: original Undo assertion** | not scored | not scored | not reached | v2 / 0 / complete |

The successful runs each account for all779 paragraph inputs, with original return, Undo and exact-cold predicates. The starting Goals document is13407characters in both. Key-to-rAF remains the frozen diagnostic; it is not relabelled as the mutation16ms gate and no new threshold is imposed.

## Exact failure and retained limits

`/private/tmp/done-goals-gates-478-20261106/stall.spec.ts:90` reads the Goals document, sends `ControlOrMeta+z`, then immediately asserts a fresh `documentText` differs. The observed text was unchanged. The full original text/error, observation stream, process output and screenshot-context artifact stay in the private run root. `exactParagraph` and `returnInputPreserved` passed. No page errors were recorded. Redo, export and cold were not reached; do not count them as passes or cold failures.

The original final observation has no overflow and records trusted, focused, visible key events around the Undo attempt. It does not prove whether the command eventually completed. The cause remains unresolved: an eventual Undo failure and an immediate assertion racing asynchronous UI publication have not been distinguished. The generated Playwright error-context file is diagnostic output, not authority to apply its suggested fix.

This is a functional **guard** failure, not an isolated latency miss. The controller stopped before another journey. No noise rerun is permitted by the fixed rule: swap stayed12692.44MiB throughout, displayon throughout, no known non-test highCPUstreak, and the largest highCPUstreak of any process was5.004s (a test renderer). The wrapper did not time out.

## End metadata and reachability

After each run and wrapper exited, the inspector copied only the profile the harness already saved. All three original storage-file inventories and native before/after digests remain exact; no original profile was opened by the inspector. The failed run is revision0, complete history, counterv2. Under518’s metadata gate, it cannot seed the reduced baseline warm continuation and reach508’s added `if(logical)clearView()` statement. This narrows attribution; it does not identify a cause or waive the failure.

The new observations do not measure the frequency/cost of qualifying interrupted reduced continuations or input/peer latency under sustained typing on an already reduced owner. That508-specific debt remains unmeasured.

## Remaining declared cases and operator stop

Not run: r2-goals-mobile4x, r3-goals-desktop, r3-goals-mobile4x. Goals-desktop fails its cell on replicate2; Goals-mobile4x is incomplete. No absent result is treated as a pass. Earlier phases520/521 contain nine passing reruns. With this block,12of15declared reruns were attempted:11pass,1fails,3unrun. The21operator-carried runs remain separately identified.

Write the Stage6amendment with this actual incomplete outcome, then stop for the operator. No corrective app or harness patch, assertion/wait adjustment, extra journey, publication or deployment is started. The failure and every earlier record remain immutable.
