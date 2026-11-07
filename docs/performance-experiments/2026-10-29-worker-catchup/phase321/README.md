# Phase 321 — observe both grown owners through completion or120s

**One diagnostic, not a gate. Evidence/docs only, no acceptance credit or hardening.** Six journeys were declared before running: normal/withheld, withheld/normal, normal/withheld. Same cohort-P1, phase313assets, G8/R1000/S1Y1/P1/V0/D0, range4, quiet750, pinned Chrome156, logical rate/fairness and1CPU/1GiBlimits. No application source/build change. Only one nested observation spec copy was added; it reuses the original config through an exact file filter.

## Observation protocol and result

The complete original writer wait and assertions remain. Afterward the copy samples incomplete/non-halted owners once per second, without focusing pages or generating input, until both terminate or the absolute cutoff `typingFinishedAt +120000`. This is the prior timestamp captured immediately after the last key returns, not another120safter the writer. Native attempt-end events determine completion time; sampling timestamps are retained separately. Then the original cold operations/assertions run unchanged, with per-owner outcome records added. No reader-completion assertion or acceptance verdict is introduced.

**All6readers and all6writers complete within120s.** Readers take43.982–90.905safter the last key; writers53.123–79.245s. No owner halts, no capacity refusal occurs, and all12original offline profile cold checks preserve the exact archive. No actual no-Fcold failure occurs. No new attempt starts during typing or reader drain. All six original writer waits are satisfied.

Five readers finish4.263–22.817safter their writers; one finishes19.492searlier. The added observation lasts0.003–23.127safter the writer wait. This supports the concern that a writer-controlled observation can censor reader completion. These are new journeys, not resumed320profiles: they do not establish what the prior five censored readers would have done. [Temporal context](./owners321-censoring-context.json).

## Every owner

Times are native performance-epoch minus the existing Node last-key reference, as in320; they are diagnostic, not acceptance latencies. The one-second sampling interval does not round completion times. The slowest completion retains about29sof margin, so no result lies at the boundary. Map and saved-payload peaks are decimalMB below; exact bytes/families are in[owner CSV](./owners321-owners.csv),[journal attempts](./owners321-attempts.csv)and[analysis](./owners321-analysis.json). The unchanged map cap is33,554,432bytes. Saved payload is durable preparation-delta payload, not encrypted disk usage.

Job aliases count **guard-condition observations**, which can repeat within one interrupted attempt: P=`accountReceive.ts:2487:prepared`; F=`accountCapture.ts:615:flushJournal`; S=`accountReceive.ts:1608:status`; D=`accountReceive.ts:2809:deliveryStatus`.

|Run /owner|Completion after key s|Attempts|Interrupted attempts|Jobs (conditions)|Peak map /saved MB|Capacity /cold|
|---|---:|---:|---:|---|---:|---|
|owners321-01-r1-normal /reader|83.507|8|3|P:3|19.948 /19.593|0 /passed|
|owners321-01-r1-normal /writer|79.245|10|5|F:1, P:5|19.309 /17.007|0 /passed|
|owners321-02-r1-withheld /reader|90.905|9|4|S:2, P:2|19.844 /19.197|0 /passed|
|owners321-02-r1-withheld /writer|72.804|9|4|F:1, P:3|19.301 /18.031|0 /passed|
|owners321-03-r2-withheld /reader|76.457|8|3|S:2, P:1|19.882 /19.603|0 /passed|
|owners321-03-r2-withheld /writer|61.819|8|3|F:1, P:2|19.309 /17.908|0 /passed|
|owners321-04-r2-normal /reader|82.459|8|3|P:3|19.948 /19.146|0 /passed|
|owners321-04-r2-normal /writer|61.306|9|4|F:1, D:1, P:2|19.309 /17.995|0 /passed|
|owners321-05-r3-normal /reader|43.982|5|0|none|19.948 /19.622|0 /passed|
|owners321-05-r3-normal /writer|63.475|9|4|F:2, P:2|19.309 /18.117|0 /passed|
|owners321-06-r3-withheld /reader|75.939|7|3|S:2, P:1|19.845 /16.511|0 /passed|
|owners321-06-r3-withheld /writer|53.123|7|2|F:1, P:1|19.297 /18.201|0 /passed|

All captured journals are disposed by completion, so their final family accounting is available. An independent check sums each family to its map byte total. Maximum observed reader map is19,948,022bytes, writer19,308,574bytes. No capacity limit or journal grammar changes were made. The3,072position capacity/index diagnostic remains separate.

## Retry clocks and actual waits

There are38interrupted attempts and39guard-condition observations: P25,F7,S6,D1. All38scheduled retry clocks are10,000msand priority-only. No non-priority60sretry is exposed here; its code/guards remain unchanged and still require separate hardening controls. Every exact condition, arriving job, clock, quietUntil/notBefore and actual/censored gap is retained in[retry CSV](./owners321-retries.csv)and[interruption CSV](./owners321-interruptions.csv).

Actual waits can exceed their scheduled retry floor. The pre-typing interrupted writer is held69.196–82.018sbehind intervening typing/readiness. Post-typing waits are usually~10s; observed longer gaps include10.259/10.255/10.371,11.285/11.299and16.800s. These are recorded gaps, not relabeled retry-clock settings or attributed solely to verification. No new timer or classifier is built into the application.

|Run /owner|Scheduled retry s|Actual post-key gaps s|Actual pre-key interruption gaps s|
|---|---|---|---|
|owners321-01-r1-normal /reader|10, 10, 10|10.005, 10.011, 10.010|none|
|owners321-01-r1-normal /writer|10, 10, 10, 10, 10|16.800, 10.005, 10.009, 10.011|69.198|
|owners321-02-r1-withheld /reader|10, 10, 10, 10|10.259, 10.010, 10.007, 10.009|none|
|owners321-02-r1-withheld /writer|10, 10, 10, 10|10.010, 10.006, 10.009|80.766|
|owners321-03-r2-withheld /reader|10, 10, 10|10.255, 10.007, 10.011|none|
|owners321-03-r2-withheld /writer|10, 10, 10|10.004, 10.008|81.796|
|owners321-04-r2-normal /reader|10, 10, 10|10.011, 10.008, 10.002|none|
|owners321-04-r2-normal /writer|10, 10, 10, 10|11.285, 10.011, 10.005|69.196|
|owners321-05-r3-normal /reader|none|none|none|
|owners321-05-r3-normal /writer|10, 10, 10, 10|11.299, 10.011, 10.007|69.205|
|owners321-06-r3-withheld /reader|10, 10, 10|10.371, 10.011, 10.006|none|
|owners321-06-r3-withheld /writer|10, 10|10.007|82.018|

## Original conditions and evidence bounds

The independent AST/body check preserves the original48expectation-call nodes, existing wait-call nodes and test-title AST, and restores the exact original body after removing the declared observations/import-path adjustment. No original spec or config is edited. The original writer wait, typing/marker schedule, withheld injector, archive/Undo checks, cold operations and all timeouts remain. Every list preflight selects exactly one copied test using the original config. [AST check](./evidence/owners321-ast-check.json.gz),[predeclared protocol](./evidence/PHASE321-PROTOCOL.md.gz)and[plan](./evidence/owners321-plan.json.gz).

All6runs have5sexternal hostCPU/top-executable logs. No concurrent build, heavy analysis or freezer ran. Busy medians are36.85/24.74/26.07/30.83/32.59/26.87%; maxima41.39–48.91%. Firefox/WindowServer/system activity remain; this is not an isolated-host or physical-Android result. No rerun-to-green or failure removal. Native completion epochs are independently recomputed, and no trace overflow occurs. [Independent check](./owners321-independent-check.json).

Application source, all frozen assets, the fixture and existing320harness files stay byte-exact. The only added runtime harness file is `phase321/grown-maintenance.spec.ts`. All1,552canonical source inputs match the starting snapshot, and all359phase320evidence files remain byte-exact, including the old failures. [Postflight](./evidence/owners321-postflight.json.gz). No persisted trust, cryptographic check, authority/history/witness/commit check, limit, format, service automation or range-writer policy is changed.

## Operator amendment — prospective from phase321

**From now on, the>=60-key overlap predicate applies only to grown fixtures.** The assumption that a1,024-position backlog lasts long enough for60keys has expired. Future old-maintenance cells report overlap as information, and every other predicate remains required. Future plans/analyses must name this policy version rather than silently reusing the old scope.

**Phase320is not regraded.** Its six recorded overlap failures, two cell verdicts and evidence remain unchanged. This is an append-only amendment, not replacement historical evidence or retroactive acceptance credit. No old analyzer/test is edited in this diagnostic.

For context only,321overlap counts in run order are120/84/83/120/120/80. These are grown fixtures; this diagnostic itself produces no gate/acceptance verdict. The operator prediction of most readers completing by120swithout capacity is supported in all6of these fixed-cohort journeys. It does not promise all histories/devices finish within120s.

No hardening starts. The separate S/Y/G/R/D/Planding requirements recorded in320remain; Sstill needs the specific PreparationCapacity→skipped/capacity mapping and saved-journal/reopen coverage. The missing exact3,072index-fallback observation is not repaired by this run. Vcomparison-only,Creserve,Fnever,range writerdefaultoffoutsideexplicitlab,v2development-only andserviceautomationoff remain.

[Evidence index](./evidence-index.json),[copy check](./evidence-check.json). Every declared journey, raw result, load log, identity and analysis is retained; application source/builds, profiles, credentials and databases stay outside the patch.

[Final record/source check](./owners321-final-check.json) confirms unchanged phase320files, byte-exact prior record prefixes, all1,552canonical inputs unchanged, unchanged signed HEAD, empty real index and a clean whitespace check.
