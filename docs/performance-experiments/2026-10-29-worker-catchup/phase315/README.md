# Phase315 — post-drain adaptive repair,1.5s versus1s

**Lab only, evidence/docs only, no acceptance credit or hardening.** Six predeclared cells, same frozen application/build as phases313–314. Only the runtime repair dose changes. G8/range4,S1Y1,P1,V/Doff,quiet750ms,16/s/64/s,1CPU/1GiB,serviceautomationoff. R's qualifying quiet-read/no-new-hint predicate,30srearm window and hot-drain exclusion remain unchanged. The original120keys/500ms/three markers, waits, archive and cold guards remain. Before-cold maintenance observations add no new wait. Every run retained with5shost log.

## Every run, including the missed post-drain target

Latency uses the original conservative clock-bracket upper values. `AfterH1 /both`counts keys offered after the measured reader's backlog /both receivers' backlogs ended. All have actual post-drain exposure; none is a no-exposure pass.

|Run|Hints /dose|Input p95 ms|All-key peer p95 ms|PostH1 peer p95 ms|AfterH1 /both keys|Typing /through-delivery tokens|Reader quiet readsΔ|Repair rearmsΔ|Cold /metric outcome|
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
|01|withheld /1500|6.057|2,421.296|2,514.274|56 /19|1,142 /1,161|244|51|both pass /**post-drain FAIL**|
|02|withheld /1000|3.725|1,847.758|1,907.893|66 /32|1,152 /1,163|269|56|both pass /pass|
|03|withheld /1000|5.028|1,857.161|1,951.399|56 /13|1,194 /1,207|266|57|both pass /pass|
|04|withheld /1500|8.840|2,241.079|2,449.546|50 /18|1,145 /1,157|248|55|both pass /pass|
|05|normal /1000|5.105|991.671|863.962|23 /8|1,486 /1,501|595|5|both pass /pass,normal-traffic caveat|
|06|normal /1000|5.632|1,001.068|883.396|21 /5|1,454 /1,468|569|2|both pass /pass,normal-traffic caveat|

All six functional flows and12actual offline profile reopens pass exactly, with no storage reinjection and no no-Fcold failure. All meet the original all-key16msinput/2,500mspeer/every-marker, backlog600s, final-new-delivery30s, trusted/focused/visible and fault predicates. Worst marker latencies are1,272/1,287/1,107/1,015/848/748ms. Nevertheless1500fails the post-drain2,500mstarget in one replicate and therefore fails that cell; all-keyp95alone hides that tail. No deadlines or gates are loosened.

1000passes both withheld runs with post-drainp95under2s, and both normal runs' measured latency/functional/cold predicates. Carry **G8/R1000/S1Y1/P1,V0,D0** to the later declared lab work. This is a conditional lab selection, not a clean normal-traffic claim or qualification. The no-backlog first missing hint remains outside this screen and outside R's remedy; no new first-miss promise is made.

The smaller dose has more reader quiet reads (269/266versus244/248) and modestly more total logical budget units during typing (1,152/1,194versus1,142/1,145) in these two journeys per dose. Tokens are logical budget units, not assumed to equal HTTPrequest count or independent samples. Mixed order/source matching do not remove host variation; this is descriptive, not a precise marginal-cost estimate. Full per-key/post-both-drain distributions, clocks, token windows, worker URL dose exposure and all predicates are in[analysis](./repair-analysis.json).

## Normal repair is not quiescent

The anticipated near-zero-normal-repair result is **not established**. Normal runs record5and2rearm events, each satisfying the implemented condition: a quiet read found live-writer content while its observed global hint counter had not advanced since that peer's previous read. All seven are on the live writer, while the other publisher's backlog is still draining. This does not prove a network hint was lost; stream coalescing/order and read timing can produce the observation.

More significantly, the30srearms merge into **one continuous repair episode per normal run**. Inferred armed coverage spans57.665sof59.505styping (**96.9%**) and30.148sof59.509s(**50.7%**). Repair interval selections are26and21; those are scheduler interval decisions, **not counted timer firings or incremental HTTPrequests**. The same build has no matched normalR1500orRoffcontrol in this declared six-cell screen, so unchanged normal tokens cannot be claimed. That normal-traffic expectation remains unresolved, even though the measured latency predicates pass. Preserve this finding for the landing decision; do not quietly refine R or call it free.

[Normal rearm details](./normal-repair-detail.json)and[armed-window analysis](./normal-repair-coverage.json)retain the observations and their limits. No speculative classification is used as authority or as a reason to shorten a protected retry.

## Maintenance timing is censored

Before original cold, readers have0attempts in five runs and one active attempt in the final normal run. Writers have0or1attempt, no observed completion and no observed capacity refusal. Observed starts occur about10.0safter typing (reader11.2sin the final run), consistent with the existing quiet window in these observations. Most journals have not reached meaningful new work before the test moves to cold. This is **not evidence that1000does or does not delay completion**; extending the old journey's wait would change its exposure and cold precondition, so it was not done. The selected-dose grown three-replicate gates later must retain the original120swriter completion check and reader diagnostics. The3,072reader observation is also still required.

## Boundaries and next work

Application/source/assets are unchanged from313; only runtime URLdose differs, and observed owner URLs confirm it. Rlate's added observations change no assertion/deadline/wait. All six runs have external5sCPU/top-executable logs and preserve every unfavorable result. No simultaneous build, benchmark, heavy analysis or freezer ran during them. This is fictional desktop-browser lab evidence, not a physical Android or foreground/background reliability promise.

Next the declared3,072cohort/index/reader-capacity diagnostic, then three more normalDpairs and all original plus separate grown three-replicate gates. The smallest selected stack excludes V; Creserve,Fnever, writerdefaultoffoutsideexplicitlab,v2development-only andserviceautomationoff remain. Any actual no-Fcold failure stops immediately. Other failed findings stay visible while later declared work continues. No hardening starts.

Landing remains separate: Rneeds exact scheduler/wake/hint-order/fairness controls, its normal-traffic cost resolved or an explicit operator tradeoff, and the selected dose's maintenance evidence. S/Yneed independent clock/pure-priority/quiet/non-priority contracts; Gneeds logical accounting/fairness; Dits exposed comparison/fallback; Pfinal operator-chosen format plus all reader/crypto/bounds/commit/interruption/cut/retired-key/cold, old-tab/rollback/conversion/handoff/version contracts. Nothing in this screen approves the Pprototype format or turns lab evidence into release credit.

[Selection](./repair-selection.json),[evidence index](./evidence-index.json)and[copy check](./evidence-check.json)retain all six runs, exact source/build identities, declaration, old/new observation harnesses, failures and load logs. Application/builds/profiles/databases/credentials stay outside landing patches.
