# Phase 318 — named hints and matched normal R-off controls

**Lab only, evidence/docs only, no acceptance credit or hardening.** All eight runs were declared before D pairs, with two Roff controls mixed into the Doff order. Same fictional private1024 fixture, source/build/browser, G8, P1, S1Y1, V0, quiet750. R1000 remains selected; bits10001 disable R without a rebuild. Every original120-key/500ms/three-marker, archive, deadline, trust, rate/fairness and cold assertion remains. Every run has the external5sCPU/top-executable log.

|Run|D /R|H1 /H2 drain s|Typing tokens|Reader quiet reads Δ|Peer p95 ms|PostH1 p95 ms|R arms Δ|Cold /all measured predicates|
|---|---|---:|---:|---:|---:|---:|---:|---|
|named-cost-01-pair1-D0|0 /1|50.197 /53.739|1468|612|949.753|818.889|0|pass /pass|
|named-cost-02-pair1-D1|1 /1|32.067 /40.138|1468|609|804.618|741.278|1|pass /pass|
|named-cost-03-control1-Roff|0 /0|39.078 /40.089|1499|655|742.491|659.019|0|pass /pass|
|named-cost-04-pair2-D1|1 /1|33.089 /40.131|1445|601|796.354|772.374|0|pass /pass|
|named-cost-05-pair2-D0|0 /1|40.612 /41.115|1496|650|775.831|680.313|0|pass /pass|
|named-cost-06-control2-Roff|0 /0|38.583 /41.095|1506|661|765.337|722.457|0|pass /pass|
|named-cost-07-pair3-D0|0 /1|39.620 /41.644|1499|652|779.814|656.224|0|pass /pass|
|named-cost-08-pair3-D1|1 /1|32.030 /39.583|1463|608|766.702|688.115|0|pass /pass|

All eight functional flows,16actual offline reopens and all measured latency/trust/fault/backlog/marker predicates pass. All have post-drain typing exposure. Source/builds are unchanged since313 and neither this screen nor passing gates earn qualification. Tokens are net logical budget units, not HTTPrequests or independent observations. Full per-key, marker, clock, post-both-drain, traffic and host evidence remains in[analysis](./named-cost-analysis.json).

## Matched normal cost, with its limits

Roff/Doff uses1,499/1,506typing-window tokens and655/661reader quiet reads, peerp95 742/765ms and postH1p95 659/722ms. R1000/Doff uses1,468/1,496/1,499tokens and612/650/652quiet reads, peerp95 950/776/780ms and postH1p95 819/680/656ms. Median typing-token contrast is1,496versus1,502.5, about0.4%lower with R on, **not evidence of a meaningful saving**. These2-versus3journeys show no added normal token/read cost; they do not establish statistical equivalence or a latency benefit.

Crucially, all three R1000/Doff runs have exactly0repair-activation and0repair-interval scalar deltas. Thus Rnever entered its repair dose during these measured windows. This is a finite matched result, not a universal normal-quiescence guarantee. Phase315's5/2normal rearms remain valid, and this screen's Donrun02 has1rearm and61interval selections. Those selections are not timer firings. The1s dose stays selected for the withheld post-drain margin; no predicate/classifier was changed. Normal-order/hint-coalescing exposure remains a landing concern.

All reader detailed event buffers overflowed by27,948–45,211events; scalar counters, request records, token snapshots and DOM/key/clock probes are separate and retained. Inferred event-based armed coverage is explicitly incomplete and must not substitute for complete counters. No absent late event is taken as proof of no rearm.

## D gain and which reads changed

D is actually exposed in all three Donruns:120/119/120named-hint deltas; Doff has0. H1drains improve50.197→32.067s,40.612→33.089s,39.620→32.030s. The latter two gains are7.522/7.590s, consistent in direction with308's~9s. Pair1's18.129sgain is qualified by much higher host load and a slower H2as well; it is not a clean18sgain estimate. H2drains are53.739→40.138s,41.115→40.131s,41.644→39.583s: outside the first slower run, gains are~1–2s, not the H1pattern.

During H1drain, logical requests to the advancing backlog remain257/257,258/257,258/257frames per pair. H1requests to unrelated quiet publishers drop254→101,215→106,209→101; live-writer reads drop172→109,144→113,139→110over the shorter drain. The code path narrows a named hint's invalidation to that publisher instead of resetting unrelated publisher checks. These are removed/deferred **quiet-peer probes**, not omitted backlog entries or security checks. Counts are phase-duration dependent: the report also retains per-second rates and whole-typing windows. Across whole typing, quiet-peer frames drop339→293,352→289,352→292; H1backlog-publisher frames increase after the earlier drain, and self checks also change. Total typing tokens are1,468→1,468,1,496→1,445,1,499→1,463; Ddoes not remove all normal traffic.

[Contrasts](./named-cost-contrasts.json) retain every pair and both control groups, both owners, read classes/statuses and rates. No independent per-key sample claim, host-noise correction or unrecorded rerun is used. Host busy medians are60.26/52.63/45.66/47.45/48.63/46.31/49.90/47.91%; maxima58.19–67.89%. The first run includes~101%of one core averaged top-listed fseventsd; background Firefox/WindowServer remain. No simultaneous build, heavy analysis or freezer ran, but the host is not an isolated machine.

## Next declared challenge and landing boundaries

Carry the already selected **G8/R1000/S1Y1/P1,V0,D0** into the smallest-stack original-gate challenge. Dhas a measured separate benefit and remains a separate landing choice; it was not needed for the deep30s stack. Recreate the original single-entry1024caught-up writer fixture on the current civil date rather than accidentally substituting the2,048grown cohort. Retain the original native/Goals prepared-v5 fixture. Declare30original plus6separate grown runs before starting,3replicates per cell, one failure fails its cell. Each grown owner reports interruption causes, scheduled retry delays and actual/censored next-start gaps. Any actual no-Fcold failure stops immediately.

No hardening starts. Sneeds specific PreparationCapacity→skipped/capacity mapping plus parked/reopen coverage, isolated from integrity/storage failures; Yneeds pure-priority10sversus all other60s/quiet/input guards. Gneeds logical accounting/fairness. Rneeds normal-order and selected-dose maintenance evidence. Dneeds named/unnamed/missing/reordered-hint and unchanged-security controls. Pneeds the operator's final format, old-tab/rollback/conversion/handoff/version, parser/size/logical-budget/crypto/cut/interruption/retired-key/cold contracts. Vcomparisononly,Creserve,Fnever,range writerdefaultoffoutsideexplicitlab,v2development-only,serviceautomationoff.

[Evidence index](./evidence-index.json),[copy check](./evidence-check.json). Lab application source/builds, profiles, databases and credentials remain outside landing patches.
