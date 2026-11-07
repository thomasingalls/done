# Phase313 — paired P cohorts and three-replicate deep screen

**Evidence/docs only. Lab builds never land and earn no credit.** New root `/private/tmp/done-dense-page-screen-lab-20261031`; phase308/309/310/311/312roots remain intact. G/Ron,S1Y1,Doff,range4/native8,quiet750ms,R1500ms,16/s/64/s,1CPU/1GiB. Vcomparison-only. Every original gate/deadline is unchanged; service automationoff, range writerdefaultoffoutsideexplicitlab, v2development-only. All12deep runs and all4fixture-preparation attempts remain.

## Every predeclared deep run

|Run|P|V|700 s|1,025 s|Positions30s|Tokens30s / through1,025|30s / cold|
|---|---:|---:|---:|---:|---:|---:|---|
|01|0|0|15.333|27.091|1,025|409 /403|pass /pass|
|02|1|1|11.554|16.885|1,025|359 /353|pass /pass|
|03|0|1|12.978|20.345|1,025|375 /369|pass /pass|
|04|1|0|12.713|19.268|1,025|370 /364|pass /pass|
|05|1|0|13.937|22.011|1,025|382 /376|pass /pass|
|06|0|0|15.807|28.439|1,025|410 /404|pass /pass|
|07|1|1|12.739|18.722|1,025|366 /360|pass /pass|
|08|0|1|13.114|22.774|1,025|388 /382|pass /pass|
|09|0|1|12.902|20.199|1,025|372 /366|pass /pass|
|10|1|0|13.007|19.764|1,025|370 /364|pass /pass|
|11|0|0|18.515|33.468|1,016|411 /416|**FAIL** /pass|
|12|1|1|13.362|19.195|1,025|368 /362|pass /pass|

P1V0passes all three30sruns while retaining full-prefix comparison; P0V0fails the cell because one replicate misses. The native harness intentionally continues after the30ssnapshot to observe actual completion/Undo/cold; its raw functional`outcome:passed`does not turn run11into a30spass. Every run confirms accepted upload before sender close, exact1,025logicalpositions, receive without native failure, peer excluded from Undo and fresh original Page-owner cold reopen. All12cold passes; no no-Fcold failure. This is fresh-owner local reopen, not an offline browser-process restart. Cold implementations are now P-aware and unqualified; no old-reader compatibility is claimed.

This supports carrying **G+R+S+Y+P, Voff, Doff** to the next declared screen, not landing or gate qualification. V0still performs full comparisons. Cstays reserve and Fneverlands. There is no need to revive V or C from this deep result.

## Storage, comparison and stages

Every Poffrun stores13,506.3plaintextbytes and2physicalrows per logical position. Every Ponrun stores1,704.5bytes and1.252rows per position. These counts include required update rows; encrypted overhead is separately retained. No original signed page is physically stored twice in these deep runs by exact-wire hash (all duplicate counts0). This does not count overlap between separately signed fresh pages. Native fitting-prefix/refetch behavior remains possible and is not silently declared solved.

Expanded index charge peaks at13,965,538bytes Poff versus8,541,874Pon; neither falls back at1,025positions. Those are conservative bounded-work/owned-wire charges, **not measured heap size**, and physical reduction is not an8×index-budget reduction. The32MiB/logical-row bounds stay intact. The3,072diagnostic remains necessary.

Total instrumented comparison time P0V0is4,877/4,881/5,127ms; P1V0is955/1,019/973ms. Vcomparisonarms report12–14ms of comparison-wrapper overhead. The full P1curve still grows; it does not reproduce a perfectly flat Fstub curve. Early→late productive round means are101→119,102→142and102→122ms for P1V0, versus103→165,108→172and119→193ms P0V0. Corresponding quiet-round means are49→44,46→51and46→47ms Pon, versus48→77,53→88and58→115ms Poff. Within productive rounds the full-comparison contribution grows about2→8ms Pon versus7→34–35ms Poff. Other validation, native verification and remaining prepare/fetch/handoff also remain material.

[Per100positions](./per-100-positions.csv),[early/late stage partition](./stage-thirds.csv),[per-run storage/index/comparison](./storage-index.csv)and[all analysis](./deep-analysis.json)report every run. Signature-bounded rounds are descriptive; overlapping spans are partitioned by comparison, other validation, native before/after commit, empty/single-page flight, remainder. The remainder is not exclusively Window cost. Position boundaries use first crossing native commit (up to8positions), not fabricated individual completion times. Raw traffic includes request`at`and`headersAt`; budget events use server epoch time with original clock uncertainty.

## Genuine paired grown fixtures

Both arms clone the same frozen2,048-position server/sender history. Actor2starts from **its own** original behind profile, receives all2,048positions through the selected current writer, exports the exact full archive, then locks before local reduction. No identity transplant or encrypted-row rewrite. All other actor/profile hashes match between arms. Both final counters arev2/unreduced.

Poff has2,055heads/27,772,726cipherbytes; Pon520heads/3,480,890cipherbytes. Both have2,054contentrows/110,726cipherbytes and3outboundrows/2,644bytes. Actual drains are91.428sand42.604s, respectively; these single sequential apparatus runs are not a randomized effect estimate or timing credit. The fixture is separately reported from phase311's old single-entry writer history.

Two initial preparation attempts failed before browser launch because this new root lacked the pinned storage serializer text. Both remain; after copying the exact serializer, the two declared format preparations pass. No failed measurement was replaced. [Cohort identity](./cohort-identity.json)records source/profile hashes and physical censuses, without copying credentials or databases into the repo.

## Host and evidence limits

Every timed run has the external5saggregateCPU/top-executable log. The operator paused separate build work; Firefox/WindowServer remain. Aggregate busy medians including the test itself range33–55%; fseventsd, OS security scans, Firefox and other background activity remain visible. Run11is retained with its33.468smiss; host variation cannot prove its cause. Three mixed-order replicates reduce reliance on one journey but do not establish a broad causal/production guarantee. No concurrent agent build, benchmark or heavy analysis ran during the timed cells. Analysis/preservation run only after all12completed.

Clarification to phase312: its sandbox-blocked sampler was **unit attempt4**, the first sampler encountered in the resumed work, not chronological attempt1. The short unit runs with working samplers finish before a5sinterval and contain method/end records with0load samples. They provide no CPU-load estimate. Phase312's focused probes carry no performance credit.

## Next and landing boundaries

Next: eight predeclared mixed-order grown maintenance cells, two/format/hintcondition, with original writer-only120swait and>=60overlap unchanged; report each reader separately, map/durablebytes/capacity and disposal-family accounting. Then the declared R1.5s/1s,3,072,Dpairs and all original plus separate grown three-replicate gates. One failed replicate fails a cell. Any no-Fcold failure stops immediately. No hardening starts.

S/Ystill need their separate clock/retry/wake/quiet/capacity regression/fault contracts before landing. G/R/Dneed their logical accounting, pacing/normal traffic and fairness evidence. Pneeds final schema/operator decision, every reader/corruption/boundary/commit/interruption contract, physical-browser admitted interior-cut/process cold, old-tab fencing, rollback, v2conversion and encrypted handoff versioning. The prototype retains conservative ephemeral legacy encoding and expanded-wire copies; those are not new optimization permissions. Vcomparison-only, Creserve, Fnever. Source/build/profiles/credentials stay outside landing patches.

[Evidence index](./evidence-index.json)and[copy check](./evidence-check.json)preserve every raw result, failure, source/asset identity, declaration and load log. This phase changes only documentation/evidence.
