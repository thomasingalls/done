# Phase314 — paired grown maintenance, every owner and every run

**Lab only, evidence/docs only, no credit or hardening.** Same frozen source/build as phase313; no format, guard, scheduler, gate or deadline change during these eight cells. Exact mixed order declared before the screen. G8/range4,R1500,S1Y1,Poff/on,V/Doff,quiet750ms,16/s/64/s,1CPU/1GiB,serviceautomationoff. Genuine paired2,048-position cohorts and legacy source identities are recorded in phase313. These are distinct from the original old maintenance fixture and phase311's single-entry writer history.

## All eight runs

|Run|P / hints|Writer attempts / completed|Writer completion after last key s|Cold|Overlapkeys|Input / peer p95 ms|All measured predicates|
|---|---|---:|---:|---|---:|---:|---|
|01|0 /normal|4 /0|not reached|not reached|120|4.309 /1,818.281|**FAIL** writer|
|02|1 /withheld|9 /1|81.406|both pass|115|8.274 /1,523.013|pass|
|03|1 /normal|6 /1|27.981|both pass|120|9.104 /940.257|pass|
|04|0 /withheld|5 /0|not reached|not reached|120|9.966 /2,618.261|**FAIL** writer and peer|
|05|1 /withheld|6 /1|44.143|both pass|114|6.493 /1,506.222|pass|
|06|0 /normal|4 /0|not reached|not reached|120|4.658 /1,861.151|**FAIL** writer|
|07|0 /withheld|5 /0|not reached|not reached|120|5.391 /2,190.977|**FAIL** writer|
|08|1 /normal|8 /1|46.195|both pass|120|7.440 /1,015.348|pass|

The original **writer-only120swait** remains. All four Poffwriters encounter PreparationCapacity and fail completion; none reaches cold. All four Ponwriters complete within it and pass both actual offline persistent-profile reopens, with no storage reinjection. All four also satisfy the measured16msinput/2,500mspeer/every-marker, final-new-delivery30s, backlog600s, trusted/focused/visible input, fault and>=60overlap predicates. Poffrun04also misses peer2,500ms; its other metric predicates pass. One failure fails its exploratory cell. Eight physical-profile cold reopens pass, no no-Fcold failure. These are not three-replicate original gates or qualification credit.

Both formats preserve exact original archive plus only offered writing, Undo and peer convergence before the maintenance outcome. Pofffailure does not mean writing was lost. Backlog drains are142.27/149.98/147.75/143.24sPoff and71.77/100.92/71.28/96.64sPon, in their declared mixed order. These descriptive journeys include editing/preparation/host contention; they are not a pure throughput estimate.

## Reader outcomes stay separate

Durable peak is the maximum observed **authenticated saved payload bytes**, not current physical cache size after successful cleanup. Map bytes have their own accounting and the unchanged33,554,432byte cap. Missing observations are not zero bytes or a capacity pass.

|Run|Owner|Attempts / completed|Capacity refusals|Durable peak bytes|Map peak bytes|
|---|---|---:|---:|---:|---:|
|01|reader|0 /0|0 observed|not observed|not observed|
|01|writer|4 /0|1|28,476,549|33,545,616|
|02|reader|7 /1|0|18,265,242|19,939,277|
|02|writer|9 /1|0|16,578,161|19,308,574|
|03|reader|0 /0|0 observed|not observed|not observed|
|03|writer|6 /1|0|17,085,637|19,294,972|
|04|reader|2 /0|0 observed|28,509,286|28,615,080|
|04|writer|5 /0|1|28,416,127|33,541,962|
|05|reader|2 /0|0 observed|no save observed|4,410,061|
|05|writer|6 /1|0|17,068,883|19,300,635|
|06|reader|0 /0|0 observed|not observed|not observed|
|06|writer|4 /0|1|28,442,743|33,541,745|
|07|reader|2 /0|0 observed|28,533,654|28,496,830|
|07|writer|5 /0|1|28,435,143|33,543,805|
|08|reader|3 /0|0 observed|9,395,718|9,355,468|
|08|writer|8 /1|0|16,631,452|19,302,611|

Only one reader completion is observed. Other readers are interrupted, active or not yet started when the unchanged writer-controlled test moves to cold; they are censored, not established to finish within120sof their own first attempt. Run02does demonstrate a complete reader preparation within cap in that journey. The separate3,072reader diagnostic remains necessary. No reader's missing capacity event is a proof of universal fit.

Across all16owners there are **zero new attempt starts during typing** and zero reader starts during backlog drain. The initial preparation active at typing start remains required by the original exposure design. This supports Y's quiet-window behavior in these finite cases; it does not replace the unrun non-priority/authority/handoff/suspension/journal fault controls.

## What fills the journal

Disposal-only family accounting identifies the large initial component. Poffwriters retain about28.38–28.41MB in `opened`, then reach capacity with only337–341`inbound`memo entries (~4.60–4.65MB), plus witnesses/delivery/coverage. Ponwriters retain about4.25MB in `opened` and all2,052`inbound`entries (~14.39MB), plus the smaller families, and finish. The completed Ponreader has4.42MB`opened` and15.11MB`inbound`, fitting at19.94MBtotal.

Thus Pshrinks the large opened-record component as hypothesized; it does not remove transient per-entry verification results or pretend the memo is one physical row. The remaining inbound memo is material. This is not F: every admitted entry is still checked and the page is physically stored. No alias/registry supplies it at cold reopen. The finite examples do not prove3,072fits or eliminate the capacity-refusal policy/UX issue: raw PreparationCapacity still becomes owner-error/halted, not a user-friendly capacity result.

[Every attempt](./grown-attempts.csv)retains stage, start/end/censoring, first miss, replay time, completed/lookup misses, entries/pending/hits, map/durable cap, deltas/chunks, exact interruption flags/job tags and family totals. First misses can still exceed2s in both formats; Sstarts the slice at the first miss, so that replay does not consume the new-work budget. No guard is relaxed. [All analysis](./grown-analysis.json)retains every owner, metric predicate and retry clock; no favorable reruns replace failures.

## Load, selection and continuation

External5sCPU/top-executable logs cover every run. Aggregate busy medians including the tests are44.9–58.2%, with peaks60.5–78.4%. fseventsd, WindowServer, Firefox and other OS activity remain; separate build work was paused. No concurrent build, benchmark, heavy analysis or patch freezer ran during this timed matrix. Host variation and two replicates/condition limit causal claims; the successful runs remain lab evidence only.

Continue **G/R/S1Y1/P1,V0,D0** to the already requested R1500/1000screen. P1has passed three deep30sreplicates plus these four grown journeys; this is a lab stack selection, not qualification. Then grow/report3,072past the index limit with reader diagnostics, run three more Dpairs and every original plus separate grown three-replicate cell. Keep all original predicates, especially120s/60keys. Any actual no-Fcold failure stops immediately. No hardening starts.

Landing remains separate for Sclock, Ypure-priority reason/quiet windows, Glogical fairness, Radaptive pacing, Dnamed-hint fallback, and P's final operator-chosen format, parser/readers/bounds/crypto/commit/interruption/cut/retired-key/cold contracts, old-tab fences, rollback, v2conversion and encrypted handoff versioning. Pslot grammar does not belong in a standalone Slanding. Vcomparison-only,Creserve,Fnever, default-off writer/v2development-only/serviceautomationoff remain.

[Evidence index](./evidence-index.json),[copy check](./evidence-check.json)and[selection](./selection.json)preserve every result/failed run, full declarations, source/asset identity, apparatus and load logs. Application source/builds/profiles/credentials stay outside landing patches.
