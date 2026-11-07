# Phase 309 — unfixed grown-maintenance trace, 31 October 2026

**Evidence only. No qualification credit, runtime adoption or hardening.** The operator approved trying the remaining host conditions after stopping kubectl-radar; Firefox and WindowServer stayed running. All timed runs have external five-second CPU/executable-name logs. The frozen phase308 root remains intact.

The ordered investigation stops after step1: **pausing periodic idle polls eliminated the interruptions, and the unchanged preparation algorithm completed in 36.012 seconds from its first attempt, then passed actual offline cold reopen.** This contradicts the prediction that verification would still fail to finish. S, Y and P were not built. Later screens, the 3,072-position diagnostic, new D pairs and original-gate replicates were not run; their criteria are unchanged.

## 0. Full unit suite, actual child exit

One unchanged run: **283 files passed; 2,855 tests passed; one existing skip; actual Vitest child exit 0; wrapper exit 0**. Vitest reports123.96s (124.59s child wall time). Python waits on the actual child; no zsh `status` variable. The [raw log](./evidence/step0-full-units/console.log.gz), [receipt](./evidence/step0-full-units/receipt.json.gz) and [host log](./evidence/step0-full-units/host-load.jsonl.gz) preserve this. All1,552 canonical inputs match their starting hashes. This does not erase phase306 or the qualified phase308 wrapper result.

## 1. Every unfixed trace case

G=1/R=1/V=0/D=0 throughout; range4/native8, quiet750ms, session16/s/process64/s,1CPU/1GiB, service automation off. Full prefix comparison stays on. The private I diagnostic delays only periodic idle receive scheduling beyond the case window, using a finite24-hour timer; it suppresses no hint-triggered/active turn, send, retry, audit or guard. It is not a proposed repair. Initial startup/hint/sweep work still runs. All cases use independent copies of the same real-app-grown civil31 fixture, with no fake clock, data reinjection after cold or format mutation.

|Case|Child exit|Maintenance result|Writer attempts / saves / interruptions|Overlapping keys|Cold|
|---|---:|---|---|---:|---|
|trace-grown-normal|1|120s completion timeout|12 / 8 / 4|120|not reached|
|trace-grown-withheld|1|120s completion timeout|21 / 17 / 4|120|not reached|
|trace-idle-polls|0|120s completion timeout|9 / 7 / 2|not a typing case|not reached|
|trace-idle-paused|0|complete,36.012s from first attempt|11 / 10 / 0|not a typing case|pass|

Both typing journeys retained all120 offered keys, the >=60 overlap predicate, exact original archive plus only the offered append, Undo and peer convergence. Their backlog drains took138.648s normal and121.130s withheld; the original600s bound stayed. They then failed the original120s maintenance wait. Neither reached cold. The idle-polls diagnostic intentionally records a timeout as an observed outcome while its Playwright observation test exits0; that green harness exit is **not a maintenance pass**. The paused case is the only actual cold attempt in this phase and passes; no no-F cold failure occurred.

The public app, accounts and preview were not opened or changed. The pinned Chromium executable and container identity/limits are preserved in the run artifacts.

## What the trace establishes

There are66 completed attempt records across all owners and14 recorded interruptions. Twelve interruptions follow an unhinted/non-continuing receive turn by0.4–6.2ms: `receive → refreshAuthority → membership-discovery preparation → runCaptureTask → run`. The tagged job is `accountReceive.ts:2487:prepared` in the instrumented lab source. All twelve throw with queuePriority=true, suspended=false and shadowActivity=false. No journal, handoff or authority-stamp condition fired in these observed interruptions. The [queue tags](./evidence/queue-job-tags.json.gz), [source-site inventory](./evidence/trace-site-inventory.json.gz) and [interruption timeline](./interruption-analysis.json) preserve source attribution and each boolean. No claim is made that unexercised guards cannot fire.

In idle-with-polls, ordinary receive starts after initial sweeps occur at21.234,40.609,57.998,76.793,93.949 and114.309s from online. Queue-priority interruptions occur at21.240 and93.950s. The first is followed by a60,006.9ms wait to the next attempt. Thus interruptions need not occur on **every** poll: the60s retry prevents an active preparation attempt during intervening polls. In idle-paused there are only the three startup/sweep turns at0.085/2.893/3.915s and zero interruptions. Eleven uninterrupted attempts finish at36.012s from the first start,46.0s from going online, with ten durable delta saves. All existing guards still execute. Warm-audit jobs are tagged separately; none caused an observed interruption.

Two other interruptions occur just after typing starts, from `flushJournal`, with the **same** queuePriority-only boolean pattern. This matters for Y: a queuePriority flag alone cannot establish that typing was uninvolved. A hardened retry classifier must retain causal job/activity information or otherwise prove the input/journal exclusion. This phase does not implement that policy.

## Slice clock: real cost, different severity

The creation-time2s clock is confirmed unchanged. Per-attempt entries, pending entries, exact hits, completed misses versus lookup misses, first-miss timestamps, replay spans, delta counts/bytes/chunks and all caps are in [attempts.csv](./attempts.csv). A lookup miss that triggers the pause is counted separately from a completed verification miss. Replay spans measure the actual full-reference function, including yields; first-miss offsets measure wall time since journal creation, including reopening/import/hit work, not CPU time. The CSV also preserves the durable checkpoint summary separately from transient journal-map bytes.

The idle-paused late attempts complete **171,298,247,200,78** new verifications, with first misses at1.758–1.857s and full-reference spans1.708–1.768s. Earlier attempts complete4354/2477/837/602/574/441 misses. The last attempt reaches building, coverage, final authority/install/readback and completion. The writer traces under normal/withheld contention also often complete hundreds of new misses; the withheld last saved attempts complete28/122/126. The estimate that **every** late attempt only advances one entry is therefore false on this host/cohort.

There is a narrower matching observation: each caught-up reader reaches a late saved attempt with **one** new completed miss, first miss at2.378/2.340s. Those reader traces cannot be substituted for the writer or idle result. S could still reclaim time consumed before the first miss, but this phase does not establish that it is necessary or sufficient for the maintenance deadline. The idle result directly disproves inevitable verification noncompletion at this fixture size.

The paused writer stores10 deltas,88 chunks and21,618,154 authenticated payload bytes (cap256 deltas/chunks and33,554,432bytes), with transient journal-map bytes21,735,941. No capacity refusal occurs. Neither a256-delta exhaustion nor an index fallback is measured here. Canonical `retentionPreparation.ts` is byte-identical to local main/origin-main and HEAD; exact revisions/hashes are [recorded](./evidence/retention-main-identity.json.gz). The lab adds observations only, not S.

## Host load and instrument limits

The operator stopped radar and explicitly approved trying the remaining Firefox/WindowServer load. No agent build, benchmark or parallel worker ran during a timed case. External sampling uses Mach aggregate CPU tick deltas plus `ps pid,time,comm` cumulative CPU deltas; it queries neither arguments nor environment and includes protected/system processes. Process100%=one core; host percentage is aggregate across ten cores. These are residual-load observations, not a perfectly quiet-host claim.

|Case|Aggregate host busy median / maximum|Samples|Median sampler / ps-child CPU per sample ms|
|---|---:|---:|---:|
|trace-grown-normal|35.2% / 79.5%|55|4.98 / 42.12|
|trace-grown-withheld|39.0% / 58.9%|55|4.93 / 41.51|
|trace-idle-polls|27.1% / 48.3%|28|5.95 / 48.63|
|trace-idle-paused|35.2% / 46.4%|12|4.76 / 40.52|

Sampling intervals run about5.05s, maximum5.143s, including enumeration overhead. First baseline precedes child start; the final sub-five-second tail has an end timestamp but no additional load delta. Top15 process records retain individual PIDs/executable basenames; grouped table entries in the analysis report per-observed-process values, not sums by application. Initial libproc preflights used the wrong timebase and missed protected processes; their process percentages are invalid and remain separately qualified. Aggregate host readings in those preflights were valid. A one-second calibration and all sampler revisions/preflights are retained. The corrected sampler uses cumulative CPU seconds from ps, whose resolution is0.01s.

This is a one-case-per-condition mechanism screen, not a randomized replicated effect-size estimate. Instrumentation adds diagnostic work and modifies no guard/verification outcome, but there is no matched observer-off overhead experiment. The four timings do not establish production-phone performance, causal total-duration savings or gate acceptance. All earlier lab runs remain; none is replaced.

## Stop and next decision

The poll→queue-priority→60s penalty mechanism is confirmed. The prediction that stopping those polls leaves verification unable to finish is contradicted by completed removal and cold. Accordingly stop before step2; no S/Y factorial or dense P format has been built, and no hardening begins. If exploration resumes, Y needs an explicit distinction between a discovery queue arrival and a typing-driven flush; S remains a possible time-budget efficiency change, not a diagnosed mandatory fix. Neither proposal permits removing the guard or pausing real idle polling in production.

V stays comparison-only. C stays in reserve; F never lands. The P design/contract remains operator-owned, development-only, with the range writer defaultoff outside the lab. No v2 compatibility, old-tab, rollback or dense-format contract is closed by this phase.

## What landing each piece would need — no hardening started

|Piece|Separate evidence/contract needed before landing|
|---|---|
|S, first-miss slice clock|Bounded fresh-work accounting and interruption/resume/capacity tests; preserved exact-evidence and full-reference checks; completion/peer/input gates on old and grown fixtures. Canonical file is currently identical to main; no durable-format change is proposed.|
|Y, priority-only shorter retry|A cause classifier that excludes typing-driven flushes, journal/handoff/authority/suspension interruptions; exact10s/60s/quiet-timer tests and delayed/wake races. The observed flag alone is insufficient.|
|G, eight logical positions|Logical admission/rate/fairness/index bounds and all original gates, with three declared replicates and one failure failing a cell.|
|R, adaptive repair polling|Complete the1.5s/1s post-drain exposure screens and normal traffic/activation checks, then scheduler/hint-counter race controls and maintenance competition. First no-backlog miss remains outside its reach.|
|D, named hints|Three more exposed off/on pairs with H1/H2 drains and removed read attribution; treat hints only as scheduling evidence, preserving discovery/authority checks. Phase308 H1 gain remains unconfirmed by new runs here.|
|P, dense self-contained page receipts|All ten logical readers, indexed memo identity, raw exact request/page plus admitted extent, full per-entry/fresh ledger/witness/commit checks, full-prefix comparison without V, logical audit and expanded index bounds, interior cuts and cold. Before landing also old-tab/rollback, v2 conversion, handoff versioning, final bounded binary schema and compatibility fault/upgrade evidence. No P shortcuts or skips were exercised: P was not built.|
|V|No candidate path authorized; comparison arm only.|

All later screens and original gates remain on the declared protocol; no deadlines, denominators, skips or manifests were changed.

## Preserved evidence

The [protocol](./PROTOCOL.md), [case analysis](./trace-analysis.json), complete [attempt CSV](./attempts.csv), [interruption timeline](./interruption-analysis.json) and [evidence index](./evidence-index.json) identify all runs and raw hashes. One missing-profile-serializer preflight is retained; copying the exact pinned helper fixed apparatus discovery before any browser run. No timed run was replaced. Experimental app/service code, built assets, browser profiles, fixture credentials and databases remain only under `/private/tmp/done-maintenance-syp-lab-20261031`. Phase308 remains under its original root without mutation. The patch contains documentation, non-executing apparatus and raw evidence only.


Evidence closeout verifies99 raw/apparatus copies against originals, every66 attempt rows and
14 causes independently, all777 phase308 archived originals plus its source/assets, and the
unchanged1,552 canonical inputs. Seven repository contracts, links and whitespace checks pass.
The first patch candidate was rejected by reverse-inventory verification because the freezer
merged Git's CRLF warning into binary diff bytes. Its [failure record](./evidence/freeze-attempt1/receipt.json.gz)
is retained; the retry separates stderr and uses LF in the standalone derived CSV, preserving
the archived original CRLF CSV. No experiment was rerun or changed. The real index stays empty.
