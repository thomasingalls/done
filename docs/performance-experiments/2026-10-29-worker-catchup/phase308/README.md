# Phase 308 — suffix-validation and repair-polling lab, 30–31 October 2026

This is the operator-approved fictional-only lab lane. **No qualification or landing credit.** Only this evidence, test apparatus and design notes enter the patch series; experimental app/service source, builds, profiles and databases stay outside the repo. No production source or old test was changed in this phase. No release preparation, merge or deployment occurred.

G+V is promising as a performance upper bound: the subsequent three original deep gates took **19.221, 19.628 and 23.256 s**. It is not an adoptable repair: V assumes immutable plaintext that the current API does not enforce. R reduces late hint-loss delay substantially, but its post-drain p95 still exceeds 2.5 s. The larger maintenance fixture exposed a separate completion blocker in all six runs.

## Contract and identities

Signed HEAD is `0ab9cbc8937e32c6542aaeeca697c87ba116c3be`, with cumulative prepared phases 241–307 before this evidence-only phase. All 1,552 canonical inputs from the unit run remained byte-identical. The real index stays empty. The same 612-asset lab build was used throughout; source/asset hashes are in the [frozen inputs](./evidence/deep-inputs.json.gz). The only later apparatus repair forwards the already-implemented named-hint opt-in through the private loopback gateway. It changes no client asset or service verification.

Runtime bits are G/V/R/D. Network range remains 4; G changes the native position allowance from 4 to 8. C is absent and the per-publisher quiet budget stays **750 ms**. A/B/E are absent; F is absent and never lands. Session/process budgets remain **16/s and 64/s**, with the same 1 CPU/1 GiB service. R changes only the idle repair interval to 1.5 s for 30 s after an eligible quiet find. Service automation remains off. The range writer remains default off outside explicit lab builds.

The original 16 ms input p95, 2.5 s whole-journey peer p95 and every-marker checks, 30 s deep/final delivery, 600 s backlog, 15 s public cold bound and original case deadlines remain. Three replicates per original cell were declared before the screen; one failed replicate fails its cell. No actual no-F cold-reopen failure occurred. Six grown cases failed earlier and **never reached cold**.

There are **65 application journeys**, including the six unexposed named-hint attempts, plus three untimed fixture-preparation runs and six metadata-only inspections of copied profiles. Independent journeys, not individual keys or positions, are the comparison units. Small samples, fixed counterbalanced order and host noise support descriptive comparisons; no significance, equivalence or production-phone claim is made.

## 0. One quiet full unit run

The unchanged full Vitest run reports **283 files, 2,855 passed tests and one existing skip**, in 152.78 s. It was run once, without other agent benchmark/build work. A post-run shell wrapper used zsh’s reserved `status` variable and failed after the green summary; the child exit status was not captured. The [raw output](./evidence/step0-full-units/console.log.gz) and [qualified receipt](./evidence/step0-full-units/receipt.json.gz) preserve both facts. This does not erase phase306’s earlier two failures under load or prove their cause.

## 1. Fully caught up, no backlog, hints withheld

The all-factors-off diagnostic confirmed the predicted idle regime: the first key took **19.696 s**, whole-run peer p95 was **19.753 s**, and 85 content hints were withheld server-side while ready/heartbeat traffic continued. All 120 keys were typed after the drain; both actual offline cold profiles matched exactly. Arrival bursts were near 19.7, 40.2 and 65.9 s. The stop condition for a missing sawtooth was therefore not triggered. See the [diagnostic](./evidence/step1-idle-diagnostic/run01/result.json.gz).

## 2. V and the existing comparison

Ordinary live loads obtain the prefix from the same carrier’s already-opened warm plaintext: they borrow it or make detached copies after current counter, shape and bounded sealed-row audit checks. These are not normally full disk rereads. Every deep run recorded warm views and zero full physical loads during the drain.

V skips old-prefix comparisons under ephemeral same-owner provenance and checks the suffix. Required detached copies and other linear census/index work remain. Full/reference validation and the existing state-gated 1,024-new-record audit are unchanged; the deep drain did not itself trigger that audit. V supplies **no immutable-prefix proof**. A lease serializes operations; a counter authenticates allocation/generation/witness state; neither proves that a mutable plaintext buffer still equals the prior verified projection. A bounded disk audit checks a different surface, and a deferred reference audit is not a per-operation equality proof.

The [V note](./V-design-note.md) records the fresh-row origin, audit predicate and concrete old-buffer mutation falsifier. V never becomes a production shortcut merely because valid fictional journeys pass.

## 3. R and hint-loss exposure

R uses the existing verified quiet-read completion hook, one hint counter and a per-peer previous-read count. An unhinted new quiet find arms/rearms 1.5 s idle repair for 30 s; hot drain reads do not count. No new storage, authority, coordinator or retry/backoff mechanism was added. The [R note](./R-design-note.md) explains its limitations.

|Late withheld run|R|Keys after reader drain|Whole-run peer p95 s|Post-drain-only p95 s|Worst marker s|Cold|
|---|---:|---:|---:|---:|---:|---|
|late-withheld-1-R0|0|67|17.928|18.551|0.901|pass|
|late-withheld-2-R1|1|59|2.384|2.560|1.343|pass|
|late-withheld-3-R1|1|69|2.407|2.553|1.187|pass|
|late-withheld-4-R0|0|67|19.038|19.807|1.565|pass|

All four late runs were exposed after drain. The original whole-120-key p95 and marker criteria pass for R-on, but the post-drain-only diagnostic p95 is **2.560/2.553 s**. That subgroup is not a replacement gate; it shows why the whole-run pass does not establish that late hint-loss delay is solved.

Without backlog, R remains reactive: the first R-on key waited **15.569 s**; whole-run p95 was **12.773 s**, and the 88 keys offered after its first activation still had **2,530.834 ms** p95. The first-miss and remaining-tail problems stay unresolved. Both offline cold profiles passed.

With healthy hints, the original R0/R1 pair had peer p95 **1.055/1.089 s**, net typing-window tokens **1,483/1,476**, and quiet reads **603/601**. Seven counted “activations” were one arm plus six rearms within **one active episode**, not seven independent episodes. No stable traffic equivalence follows from this single pair. Every one of the eight R runs is in [r-analysis.json](./r-analysis.json); counts and episode reconstruction are independently retained.

## 4. Deep G × V screen — every run

Screen milestones count native durable positions; the separate original gate still waits for visible writing. The fixed two-runs-per-arm screen used the uncapped time to 700 as its primary measure and continued after 30 s only to measure completion/Undo/cold behavior. Those continuations never rescue a missed 30 s gate. All native/data/Undo/cold guards passed.

All eight times, positions at 30 s and token counts are in [DEEP.md](./DEEP.md) and [deep-analysis.json](./deep-analysis.json). The requested [100-position bins](./deep-position-bins.csv) and [early/late stage splits](./deep-stage-thirds.csv) include every run. Stages are disjoint wall-time partitions of signature-bounded rounds, not CPU attribution; the remainder includes fetch, handoff, preparation and copies. Boundary crossings can contain up to eight positions and are not interpolated. Ledger ciphertext measured about 13.56 KB per position in these v2 range journeys.

Host contention was observed during `deep-r1-G0V1` (including Firefox, WindowServer and a background service). That single snapshot does not attribute earlier differences. The operator confirmed a quiet host only after all eight screen runs; **none was replaced**. Thus the screen contrasts are qualified. G+V took 32.471 and 26.468 s to 1,025; the former stays failed.

A draft protocol incorrectly imposed “both screen repeats must pass” beyond the operator’s exploratory instruction. Its original bytes are retained. The draft condition was withdrawn before later comparisons; selection used G+V as the fastest upper bound with one deep pass and no cold failure. The operator’s original three-replicate/any-fail rule was never relaxed. C was not restored.

## 5. Three replicates of every original cell

All 30 functional journeys passed. The [full table](./GATES.md) retains every run. The three original deep checks were 19.221/19.628/23.256 s; normal two-receiver peer p95 was 1.004/1.024/1.176 s and withheld p95 2.446/2.395/2.366 s, with every marker passing. All three unequal-account fairness journeys passed their original latency, pending-writing durability, eventual convergence, Undo, isolation and cold checks.

Five old maintenance journeys fail only the unchanged exposure predicate: overlap counts are **42, 26, 40, 27, 77, 44** in run order. Only the 77-key run passes it. Both old maintenance cells therefore fail the any-replicate rule. These results remain separate from the grown fixture.

The six Goals paragraph/refocus journeys passed their functional checks. Their key-to-rAF values are diagnostic, **not** the mutation-observer 16 ms gate. Full rAF tails, actual trusted/focused input denominators and deliberate stall controls remain in the raw analyses; no claim that all UI pauses are eliminated is made.

## 6. Grown maintenance: exposure achieved, completion blocked

The first real-app 2,048-position preparation passed, but the civil-day boundary left insufficient time for all remaining runs. It was retained. A fresh actual civil-date cohort was then built with the existing signed-source seed app: three accounts/ten devices with histories 1,024/256/32, then a separate real UI extension to 2,048 and exact writer catch-up/export/counter checks. No fake clock, late-card insertion, synthetic records or frozen-day bypass was used in measurements. Fixture selector transitions and both original identities are retained.

**All six grown cases failed the original 120 s maintenance-completion wait.** Exposure now reaches 112–120 keys, and the supplemental input, peer and marker timings pass. Archive equality and Undo passed before the timeout. The strict original analyzer failures remain; [GROWN.md](./GROWN.md) explicitly labels its supplemental calculations as failed-case diagnostics. No old-fixture relative comparison receives credit.

Maintenance reported 7–16 attempts and zero completions, ending in the `activity-or-journal` waiting category. Read-only IndexedDB inspection on **copies** of all six closed failed profiles, with app/SW fetch bypassed and zero app scripts/workers, found the original **counter v2** in every case. The v5 conversion had not committed; this is not merely a lost completion message. Original profiles were not opened or modified. These were metadata inspections, not cold-reopen tests. See [inspection evidence](./evidence/post-run-metadata/result.json.gz).

The reason category also covers fencing/interruption paths; it does not prove that a person was still typing or that R caused the restart. Trace the failing preparation guard and retry/wake sequence next. Do not bypass it or lengthen the deadline to turn these runs green. Cold reopen was **not reached** in these six cases, and cannot be credited.

## 7. Named hints with a live writer

The first six nominal D0/D1 runs passed their original functional/latency checks, but all three D1 runs received **zero** named hints. They are retained in [NAMED.md](./NAMED.md) as **not exposed for the D contrast**, not evidence of no benefit. The client already sent the opt-in; the private lab gateway allowlist dropped it. A two-request fake-upstream probe reproduced the missing header, then verified the one-header forwarding repair with origin/framing unchanged. No client rebuild or service-verification change followed.

A new six-run series was declared before running, using the original pair order D0,D1 / D1,D0 / D0,D1 and an exposure guard. All three D1 runs actually received named hints; all six original functional, latency and offline cold checks passed. Every valid run is in [NAMED-WIRED.md](./NAMED-WIRED.md), with counters and episode counts in [named-wired-analysis.json](./named-wired-analysis.json).

|Measure, typing/observed window|D off, three runs|D on, three runs|
|---|---|---|
|Peer p95 ms|866.5 / 847.3 / 978.6|886.4 / 945.4 / 785.4|
|Net typing-window tokens|1487 / 1494 / 1506|1474 / 1469 / 1474|
|Reader quiet reads|645 / 651 / 642|611 / 602 / 604|
|Named hints observed|0 / 0 / 0|120 / 119 / 120|

Median quiet reads fall from 645 to 604 (about 6%); median net tokens from 1,494 to 1,474 (about 1%). Peer p95 changes direction across pairs, so there is no consistent peer-latency gain established here. These are descriptive three-journey comparisons, not a production or equivalence claim. Tokens are net logical service-budget units during the actual typing interval, not network byte totals; retained snapshots preserve clock/window uncertainty.

## 8. Complete-page receipt design only

The [design note](./RECEIPT-DESIGN.md) answers yes in principle: retain the entire original signed request/page once, in bounded raw framing, with no external references or new GC. The v2 duplicated-page component could shrink about eightfold for four-entry pages; that is arithmetic, not a measured new total or a claim about old v1/sender/server storage.

All ten direct decoder/tag/stored-verifier reader files are in [receipt-readers.json](./receipt-readers.json), including `membershipReading.ts` and `replacementSource.ts`, plus the writer/census consumers discussed in the note. Physical rows/witnesses must be separated from logical position budgets, memo keys, coverage and frontiers. Page-straddling authenticated cuts, effective entry prefixes, generation retirement, state-gated audit units, encrypted handoff, old tabs and rollback need explicit contracts. No format, migration or writer was implemented.

## Remaining work and evidence

The next bounded investigation is maintenance completion on the retained 2,048-position cases, including which activity/journal/authority guard interrupts the stable post-edit input and why retries do not finish. V needs an enforceable private immutable-prefix proof and independent faults before any landing. R still has the first idle miss and a small post-drain tail; healthy-hint arm/rearm behavior also needs hardening. G remains a candidate. Named hints have a modest measured traffic gain, not a reason to widen this phase. Any dense receipt proposal must be hardened separately, with full reference checks retained.

The [evidence index](./evidence-index.json) preserves raw results, failed/preflight/build attempts, protocols, immutable identities and non-executing test/analysis apparatus. The complete isolated originals remain at `/private/tmp/done-range-vgr-lab-20261030`. Raw app/service implementations, built assets, browser profiles, fixture credentials and databases are deliberately excluded from the landing patch. General qualification remains paused; no lab result changes a manifest denominator or earns promotion credit.

Documentation closeout: all 777 raw copies and original hashes agree; all 65 planned journeys
are accounted for in both directions. Eight deep milestones and 26 raw latency journeys were
independently recomputed. The direct-reader inventory agrees with source in both directions.
All seven repository contract checks, Markdown links and whitespace checks pass. Only the three
planned closeout appends differ from the preceding prepared series; `progress.md` is untouched.
The real index has no staged content.
