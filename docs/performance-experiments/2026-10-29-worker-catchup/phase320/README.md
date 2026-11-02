# Phase 320 — all thirty-six frozen lab journeys

**Evidence and documentation only. Lab builds never land and earn no acceptance credit. No hardening, release preparation, merge or deployment.** All36predeclared journeys ran once in their declared order: ten original cells ×3 plus grown normal/withheld ×3each, reported separately. Same313application/build and pinned Chrome156. G8/R1000/S1Y1/P1,V0,D0; range4, quiet750. All original gates, deadlines, logical rate/fairness and1CPU/1GiBlimits remain. Each run has a5sexternal host-load log. No build, heavy analysis or freezer ran concurrently.

## Outcome and remaining failures

All36functional journeys and their original cold/data/Undo/durability guards pass. No no-Fcold failure occurred, so no declared cell was withheld. The eight non-maintenance original cells and both separate grown cells meet their defined predicates in all3replicates. **The two original1,024-position maintenance cells fail**: all6runs miss the unchanged>=60overlap predicate, with19–31keys. Their other original predicates pass, including writer completion and the retained historical153+10%numeric backlog check. One failed replicate fails a cell; these6failures are not erased or credited as passes. The grown fixture is a separate demonstrated exposure, not a retroactive repair of the old results.

All6grown runs meet>=60overlap (85–120keys),16msinput,2,500mspeer/every-marker,600sbacklog,30sfinal-new-delivery,120swriter-completion, trust/fault and both offline-profile guards. Existing mutation-inputp95is at most6.550ms across the measured late/maintenance/fairness cases. Worst peerp95is1,854.768ms; every marker is below2,500ms. Native original deep runs take17.384/17.586/18.565s against30s. These are the original prepared-v5 native fixture, not a substituted measurement of the newer unreduced fixture.

The separate3,072diagnostic remains qualified: P1fits27,886,589map bytes and has one maintenance timeout/one completion; P0halts at capacity twice. Its detailed buffers filled before the index boundary, so the **exact first index fallback position remains unmeasured** in all four. The uncapped request curve/scalars support the proposed bend but do not replace that missing event. See[phase317](../phase317/README.md). No estimated position is called an observation.

## Every declared journey

Functional/cold is pass in every row. “Predicates” retains every original numeric/exposure test. Goals rows are the original paragraph/lifecycle diagnostic: key-to-rAF is not the16msmutation gate or a peer test. All individual runs and cell verdicts remain in[run CSV](./final-gates-runs.csv),[analysis](./final-gates-analysis.json)and[cell results](./final-gates-cells.json).

|Journey|Predicates|Input p95 ms|Peer p95 ms|Worst marker ms|Deep ms /overlap keys|Failure|
|---|---|---:|---:|---:|---:|---|
|final-gate-r1-native-context|pass|—|—|—|—|—|
|final-gate-r1-native-resumable|pass|—|—|—|—|—|
|final-gate-r1-native-deep|pass|—|—|—|17383.907|—|
|final-gate-r1-late-normal|pass|3.086|725.429|664.502|—|—|
|final-gate-r1-late-withheld|pass|3.419|1817.724|1310.966|—|—|
|final-gate-r1-old-maintenance-normal|FAIL|3.034|681.983|653.535|26|atLeast60KeysDuringCatchup|
|final-gate-r1-old-maintenance-withheld|FAIL|3.225|1698.409|1697.986|19|atLeast60KeysDuringCatchup|
|final-gate-r1-fairness|pass|5.700|754.000|—|—|—|
|final-gate-r1-goals-desktop|pass|—|—|—|—|—|
|final-gate-r1-goals-mobile4x|pass|—|—|—|—|—|
|final-grown-r1-normal|pass|4.862|865.295|771.487|120|—|
|final-grown-r1-withheld|pass|4.025|1832.151|1632.952|86|—|
|final-gate-r2-native-context|pass|—|—|—|—|—|
|final-gate-r2-native-resumable|pass|—|—|—|—|—|
|final-gate-r2-native-deep|pass|—|—|—|17585.960|—|
|final-gate-r2-late-normal|pass|3.164|735.307|716.527|—|—|
|final-gate-r2-late-withheld|pass|3.486|1703.350|1267.418|—|—|
|final-gate-r2-old-maintenance-normal|FAIL|3.239|681.375|627.189|26|atLeast60KeysDuringCatchup|
|final-gate-r2-old-maintenance-withheld|FAIL|3.573|1700.883|1686.598|20|atLeast60KeysDuringCatchup|
|final-gate-r2-fairness|pass|6.500|748.500|—|—|—|
|final-gate-r2-goals-desktop|pass|—|—|—|—|—|
|final-gate-r2-goals-mobile4x|pass|—|—|—|—|—|
|final-grown-r2-withheld|pass|3.888|1754.999|1387.971|85|—|
|final-grown-r2-normal|pass|4.599|865.822|746.064|120|—|
|final-gate-r3-native-context|pass|—|—|—|—|—|
|final-gate-r3-native-resumable|pass|—|—|—|—|—|
|final-gate-r3-native-deep|pass|—|—|—|18564.621|—|
|final-gate-r3-late-normal|pass|3.572|724.840|738.389|—|—|
|final-gate-r3-late-withheld|pass|3.437|1815.601|1082.119|—|—|
|final-gate-r3-old-maintenance-normal|FAIL|3.831|704.009|647.966|31|atLeast60KeysDuringCatchup|
|final-gate-r3-old-maintenance-withheld|FAIL|3.478|1854.768|1077.935|25|atLeast60KeysDuringCatchup|
|final-gate-r3-fairness|pass|4.900|800.300|—|—|—|
|final-gate-r3-goals-desktop|pass|—|—|—|—|—|
|final-gate-r3-goals-mobile4x|pass|—|—|—|—|—|
|final-grown-r3-normal|pass|4.547|933.392|814.524|120|—|
|final-grown-r3-withheld|pass|6.550|1663.336|1492.709|98|—|

## Post-drain R1000 margin, all six late runs

These use the unchanged conservative clock brackets,120keys and3markers. Every run has actual post-H1drain typing. All six post-drainp95values meet2,500ms; the withheld values1.832/1.710/1.824s retain margin. This is not a guarantee for the first unhinted idle miss, which is explicitly out of scope. Full per-key/token/repair-counter and maintenance-censoring data are in[late analysis](./final-late-analysis.json).

|Run|Keys after H1drain|Post-drain p95 ms|Typing logical tokens|
|---|---:|---:|---:|
|final-gate-r1-late-normal|61|616.430|1482|
|final-gate-r1-late-withheld|75|1831.941|1094|
|final-gate-r2-late-normal|56|669.681|1481|
|final-gate-r2-late-withheld|74|1710.361|1104|
|final-gate-r3-late-normal|54|704.011|1485|
|final-gate-r3-late-withheld|71|1823.745|1116|

## Grown maintenance: interruptions and retry waits by owner

The original120swait watches only the writer. It is unchanged. All6writers complete; only the first normal reader completes before that writer-controlled observation ends. The other5reader outcomes are **censored, not completed and not capacity failures**. Every owner has zero new attempt starts during typing; every reader has zero during its drain. No preparation capacity refusal or trace overflow occurs in these12owner observations.

Completion time below is measured from the last offered key, not called verification time and not substituted for the original wait origin. “Interruptions total/post” counts interrupted attempts, not individual duplicate guard observations. All observed retry clocks are pure-queue-priority10s; non-priority60s behavior is not exercised here and remains unchanged, requiring separate hardening controls. After-typing actual gaps include scheduler/readiness work; a dash means the next start was outside the observed window.

|Run /owner|Attempts /completions|Completion after key s|Interruptions total/post|Actual post-typing retry gaps s|Peak map /saved payload bytes|
|---|---:|---:|---:|---|---:|
|final-grown-r1-normal /reader|7 /1|65.861|2 /2|10.011, 10.004|19937760 /19755347|
|final-grown-r1-normal /writer|10 /1|76.708|5 /4|11.291, 10.006, 10.002, 10.036|19302619 /18053253|
|final-grown-r1-withheld /reader|7 /0|—|3 /3|10.337, 10.009, 10.006|19862738 /14845612|
|final-grown-r1-withheld /writer|9 /1|74.980|4 /3|10.007, 10.008, 10.005|19306590 /17534517|
|final-grown-r2-withheld /reader|7 /0|—|3 /3|10.405, 10.008, censored|19566155 /19630900|
|final-grown-r2-withheld /writer|8 /1|63.308|3 /2|10.000, 10.011|19308574 /17581381|
|final-grown-r2-normal /reader|7 /0|—|3 /3|10.009, 10.003, censored|19203756 /19267821|
|final-grown-r2-normal /writer|9 /1|65.466|4 /3|11.295, 10.003, 10.008|19308574 /17591377|
|final-grown-r3-normal /reader|3 /0|—|1 /1|censored|12276468 /9390329|
|final-grown-r3-normal /writer|7 /1|41.778|1 /0|none|19308574 /17511408|
|final-grown-r3-withheld /reader|2 /0|—|2 /2|10.004, censored|59179 /None|
|final-grown-r3-withheld /writer|6 /1|40.848|1 /0|none|19308574 /16522589|

There are32interrupted attempts and33recorded guard conditions. The captured causes all show queuePriority=true, suspended=false and shadowActivity=false; Ydoes not use a typing classifier. Writer interruptions before typing schedule10sbut the actual next start is69.172–82.144s later because intervening input/readiness holds the quiet timer. This confirms that a pure-priority result does not permit a retry during typing. Post-typing writer retry gaps are~10s, with two~11.29sreadiness gaps. The longer76.7/75.0swriter completions include four/three post-typing retries; they are not76/75sof verification.

The exact arriving jobs are retained, including `accountReceive.ts:1608:status`, `accountReceive.ts:2487:prepared`, `accountReceive.ts:2809:deliveryStatus` and `accountCapture.ts:615:flushJournal`. Early withheld-reader interruptions include the status/poll chain; later prepared-read jobs still interrupt preparation. The data shows remaining contention. It does not establish that1srepair has no maintenance cost, nor a causal slowdown versus1.5s: there is no contemporaneous matched1.5sgrown arm on this quieter host. No guard or retry policy is weakened to make it finish.

[Per-owner summary](./final-grown-owners.csv),[every retry clock and actual/censored gap](./final-grown-retry-waits.csv),[every interruption condition/job](./final-grown-interruptions.csv),[all journal attempts/families](./final-grown-attempts.csv)and[grown analysis](./final-grown-analysis.json)retain each owner. Family accounting is the preparation map; saved payload bytes are durable delta payload, not post-cleanup encrypted disk size. Partial active maps are not presented as full-account capacity.

## Goals and host qualifications

All6Goalsparagraph/lifecycle runs complete, with exact paragraph, return input, Undo/Redo and lock/reopen guards. No paragraph rAF exceeds100ms in these runs. These are fictional lab desktop/mobile4xprofiles, not physical Android, native-input equivalence or a broad background-execution guarantee. Ranges/individual tails remain visible.

|Run|Beforeinput p95 ms|rAF p95 ms|max rAF ms|rAF >100ms|
|---|---:|---:|---:|---:|
|final-gate-r1-goals-desktop|8.018|17.841|46.870|0|
|final-gate-r1-goals-mobile4x|3.902|15.346|23.674|0|
|final-gate-r2-goals-desktop|7.890|16.527|29.787|0|
|final-gate-r2-goals-mobile4x|3.916|15.629|20.914|0|
|final-gate-r3-goals-desktop|8.284|18.038|28.688|0|
|final-gate-r3-goals-mobile4x|4.112|18.436|46.974|0|

Host-load logs preserve every run. Busy medians span13.70–66.35%; fairness reaches81.79%busy. Block3is visibly busier than earlier blocks. Firefox/WindowServer and system activity remain, as accepted by the operator; no apps were stopped, no busy run discarded and no noisy tail corrected away. There is no isolated-host or precise causal performance claim. The three independent journeys, rather than120keys as independent samples, decide each cell.

Original analyzers are byte-identical to their frozen versions, including the historical153numeric predicate. A second check confirms the36plan, source/build/harness hashes, old fixture hashes, all6old overlap counts/failures, late post-drain targets, balanced24observation-only cold stages, zero typing/drain starts and per-owner retry rows. [Independent check](./final-independent-check.json). The previously recorded canonical full-unit run in[309](../phase309/README.md)remains283files/2,855passing/1skip with actual child0; it is not a newly qualified full suite for the Pprototype. The lab Ptargeted probes are separate312evidence.

## Capacity and reopened devices — no fix built

PreparationCapacity still escapes as owner-error and halts the live automatic controller; it is not parked. Ordinary reopen still validates writing through normal startup recovery. A fresh controller can later retry maintenance, authenticate/decrypt a saved preparation journal and import only receipts matching verifier identity, generation, authenticated context and exact prefix. Stale/invalid saved work is not trusted. Capacity is not the PreparationPause persistence path: unsaved work from the failed attempt is discarded, earlier saved slices remain. Reopening does not raise the cap and can repeat the same refusal. This is a static trace, not a new measured capacity-halted reopen. Mapping that specific refusal to skipped/capacity is an explicit Slanding requirement, not an implemented repair.

## What landing each piece needs — operator decision, no hardening started

|Piece|Separate landing work required|
|---|---|
|S — new-work slice clock|Isolate the clock change from lab instrumentation/Pgrammar; boundary/replay/pending/first-miss controls. Map the specific PreparationCapacity refusal to skipped/capacity; cover parking/new hints/manual retry/reopen/saved journal while keeping integrity, storage and authority failures as errors.|
|Y — priority retry|Use a typed, current pure-queue-priority outcome, not lab telemetry as authority. Prove10sretry stays behind quiet/input/readiness and every suspension, shadow/journal, handoff or authority interruption keeps60s. Preserve all guards.|
|G — eight native positions|Logical-position limits, byte/CPU budgets, atomic admission, rate/fairness and receiver continuation controls for legacy/current readers; no limit increase at the server.|
|R — adaptive repair at1s|Bounded scheduler/hint-counter lifecycle, normal hint order/coalescing, hidden/offline/backoff and quiet-read/hot-drain controls. Retain the observed normal-cost and maintenance limits; no claim about the first unhinted idle miss.|
|D — named hints|Keep hints advisory. Test named/unnamed/missing/reordered/foreign hints, conservative fallback and authorization/history freshness. Measured H1gain remains separate from the smallest Doffstack.|
|P — dense self-contained receipts|Operator chooses the final format. Harden every logical reader/memo index, parser and expanded-work/byte bounds, logical1,024audit frequency, original request/page/extent, per-entry crypto/expiry/authority/witness/commit, inside-page cuts and cold/restart/key retirement. Close the deliberately skipped old-tab fence, rollback, v2conversion, handoff/version and final binary-schema contracts with independent corruption/interruption/fault controls.|
|V|Comparison only; no landing proposed. Full prefix comparison stays on. Cstays reserve, Fneverlands; A/B/Eremain out.|

S/Yare format-independent first hardening candidates **only after the operator chooses to start**. Pneeds its open contracts and the exact index-boundary observation gap addressed separately. No prototype source/build, persisted trust, alias/page registry or weakened verification is promoted. Range writer remains defaultoff outside explicitlab; v2development-only; serviceautomationoff. Every cell earns no acceptance credit, including passing ones.

[Evidence index](./evidence-index.json),[copy check](./evidence-check.json). All raw runs, failures, load logs, identities, analyses and declarations remain. Profiles, credentials, databases and application builds stay outside the patch.

The final canonical check independently matches all1,552source inputs to the start snapshot, retains signed HEAD0ab9cbc8, confirms the real index is empty and git diff --check passes. Its snapshots are preserved in the evidence index. No application source change is included in this evidence phase.
