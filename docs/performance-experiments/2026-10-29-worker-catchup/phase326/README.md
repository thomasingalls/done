# Phase 326 — repaired historical replay and repeated lab screen

**Lab evidence only. No acceptance credit, landing, hardening, release or production/default changes.** All parent roots and every reached attempt are retained. Canonical source stays unchanged. The deep winner is selected only for later lab stages; the three grown maintenance failures and paired-writing closures block a broader success claim.

## Scope, repair and controls

The private prototype derives an explicit stored/live mode from its saved-record arguments, for both legacy stored and storedPhysical. No network flag can select it. Stored bytes remain untrusted until original signatures, canonical bytes, scope, chain, per-entry crypto and current owner/authority checks pass. Stored request expiry is historical; live expired requests still refuse. Empty/duplicate stored results refuse, and the P branch again requires a received result. Legacy exact-byte equality is distinct from this mode discriminator. V0 full-prefix, witness/ledger/commit checks, erasure rules, G8 and every original admission/byte/session limit remain. [Review and fault controls](./MODE-REPAIR326.md).

Before any timing, new P0/P1 aged-request controls cover all four actual verifyStoredInbound caller paths: inboundLedger, handoffHistory, membershipReading and replacementSource. Requests expire at 30 s and are rechecked at 61 s. Empty/duplicate, corrupted receipt and wrong-scope controls retain their checks. Reintroducing only the old mode omission makes five selected controls fail (direct plus all four callers); restoring source is hash checked. The first fault draft missed two paths because an aliased vi.hoisted did not expose P; that failed sensitivity attempt is retained and corrected in new private tests. The final focused run passes 157 cases in 15 files. Strict TS attempt one reports two unused new-test imports; attempt two passes after import-only cleanup. No full-suite claim follows.

The native interior-cut probe now waits **31 real seconds** before cold reopening. It passes, including the cut inside a page and exact writing after reopen. No clock, deadline or security check was changed. These controls repair the failure identified in phase324; that old failed journey remains failed. The old dense receipt format and range writer remain development-only/default-off outside the lab.

## Declared 27-journey screen

G8/R1000/SY1N/old-dense-on/V0/D0 is fixed; E/B and the new parsed-page P vary. Here P means owned page parsing, not the older dense receipt factor. The same frozen build is used throughout the 27 mixed-block journeys, with five-second external CPU/top-process logs. Every journey is functional and exact-cold passing. All 0 ms deep journeys meet 30 s. Input and peer latency are unexposed in the closed-sender deep cell; 50 ms remains diagnostic, never gate credit.

The rule was amended **before running**: among E1 arms with three exact cold results and passing 0 ms predicates, choose the lowest 50 ms median; within 5%, prefer lower index charge. E1B1P1 wins without needing the tie-break. No phase324 result counts.

|E/B|P|Added RTT|Drain seconds, all three runs|Median seconds|Median client validation ms|Median peak index charge bytes|Cold|
|---|---:|---:|---|---:|---:|---:|---|
|01|0|0 ms|17.177, 17.441, 17.242|17.242|3891.2|14,314,923|3/3|
|10|0|0 ms|18.641, 18.405, 18.476|18.476|3307.8|8,571,434|3/3|
|10|0|50 ms|33.803, 34.393, 33.721|33.803|3737.5|8,571,434|3/3|
|10|1|0 ms|17.159, 17.415, 17.429|17.415|2189.4|4,332,766|3/3|
|10|1|50 ms|29.014, 28.876, 28.835|28.876|2594.4|4,332,766|3/3|
|11|0|0 ms|18.812, 18.659, 18.765|18.765|4025.0|14,188,596|3/3|
|11|0|50 ms|24.512, 25.012, 24.522|24.522|4126.5|14,281,430|3/3|
|11|1|0 ms|13.956, 14.126, 14.265|14.126|2023.9|4,097,774|3/3|
|11|1|50 ms|20.773, 20.888, 20.706|20.773|2235.6|4,096,292|3/3|

Against matched E1B1P0, the selected stack lowers median drain from 18.765 to 14.126 s at 0 ms and 24.522 to 20.773 s at 50 ms. Its 50 ms index charge drops from 14,281,430 to 4,096,292 bytes. Charge is bounded logical accounting, not measured RAM. [Every run, tokens, validation, index and host load](./screen326-runs.csv). Values are journey-level observations; three runs do not establish a population estimate or eliminate host/browser variation.

## Worker CPU, heap and live/grown results

Both requested 0 ms Worker profiles keep the profiler control session attached through the exact cold stage. At drain, Runtime.getHeapUsage is sampled without requesting GC; it is neither peak nor retained memory. CPU self samples include asynchronous idle time and are source-mapped against the exact build. The comparison changes B and P together and has one profile per arm.

|Profile|Drain s|Index charge B|V8 used B|V8 total B|Backing storage B|Cold|
|---|---:|---:|---:|---:|---:|---|
|profile326-E1B0P0|18.739|8,571,434|27,624,424|97,452,032|59,850,965|exact|
|profile326-winner|14.245|4,106,414|53,677,544|93,650,944|50,682,880|exact|

The winner has higher used V8 heap in this unforced-GC snapshot. Do not claim a RAM reduction from the index-charge reduction. Full self/inclusive CPU tables and raw profiles are retained in the artifact index; inclusive spans overlap and network/IndexedDB waits cannot be assigned CPU from idle samples.

Three original live-writing journeys pass their measured functional, 16 ms input, 2.5 s peer/every-marker and exact-cold predicates. Input p95 is 3.414/3.317/3.406 ms; peer p95 is 729.98/715.67/705.92 ms. These are the existing day-card workload, not a physical Android or 13 k-character Goals claim. The actual saved H Goals has 5,000 characters.

**All three 2,048-position withheld grown journeys fail maintenance completion.** New writing/convergence and latency predicates pass, and overlap is 77/75/85 keys (the >=60 grown predicate is unchanged). Input p95 is 5.078/5.293/7.696 ms and peer p95 1805.78/1878.52/1767.28 ms. Each writer reaches snapshot building and halts with owner-error; the trace records generic Error but no message. The cause is unmeasured. No capacity refusal is recorded: map peaks are about 30.70–30.71 MB of the 33.55 MB cap and durable payload peaks 14.51–14.96 MB. Do not label this a capacity defect.

The original writer wait remains unchanged. Its failure aborts before extended reader observation and cold, so reader completion and cold are **not reached/censored**, not failed cold checks. Per-owner attempts, interrupting jobs, retry clocks, bytes and stage/error traces remain in the preserved grown326 files. No new repair is attempted.

## Index cap prediction

cap326-analysis.json separates the 32 MiB charge and 32,768 logical-work limits. It fits the measured index charge against aggregate dense positions during drain, with observed range, slope, intercept and residuals recorded per run. The three grown-reader fits predict the charge cap near **8,302–8,354 aggregate dense positions**, with logical work later, near 15,776–15,857. Those fits use observations only through 1,357–1,396 positions. This is extrapolation for this page/update mix, not an observed fallback, publisher cursor, durable storage size or heap limit. Writer observations are insufficient and explicitly unmeasured. Maintenance may reset the relation. Deep arms have their own fits; none of these journeys runs to a cap.

## Sender study: all three policies at all declared cadences

The three builds share identical private source and observation hooks; only VITE_ACCOUNT_BATCH differs: coordinated-2000, reference, immediate-inflight. The new arm has no artificial quiet/healthy-send delay; one existing active turn remains, and queued edits use the next bounded immutable envelope. Failure backoff, durable synchronous admission, committed-state dependency, bounds and caps stay. A separate focused run passes 153 cases/11 files and strict TS. Defaults remain unchanged.

The study declares 27 mixed journeys: 120 keys at 500 ms with one writer, or 300 keys per device at 150 ms with two independent persistent browsers, at 0 ms and (paired only) 50 ms. Three markers per writer are additional commands; positions per 100 keys and per 100 input commands are both reported. Setup, Undo and offline guard positions are excluded. Native accepted tips/row deltas are compared with UI tips on successful journeys; retries do not create extra position counts.

The account is genuinely caught up before writing. Its two installations are asymmetric: H1 already has a reduced local baseline, H2 retains the unreduced 2,054-content-row state. Every arm uses those same histories. The actual native execution owners are adopted enrollment Workers, recorded per run; no synthetic accountOwner replacement is forced. This fixture lifecycle limits generalization to other startup compositions. After preserving the original long-card attempts, two fresh short cards are added through public quick entry, all prior writing retained in order and both exported archives exact. New stable card IDs define each stream. This is an explicit new workload, not a regrade of old failures. No focus emulation, storage clearing or manual pruning is used.

|Policy|Workload|RTT|Functional /3|Exact cold /3|All measured predicates /3|Cell passes|
|---|---|---:|---:|---:|---:|---|
|reference|paired150|50 ms|0|0|0|False|
|coordinated-2000|single500|0 ms|3|3|3|True|
|immediate-inflight|single500|0 ms|3|3|3|True|
|coordinated-2000|paired150|50 ms|3|3|0|False|
|immediate-inflight|paired150|0 ms|0|0|0|False|
|reference|paired150|0 ms|0|0|0|False|
|immediate-inflight|paired150|50 ms|0|0|0|False|
|reference|single500|0 ms|3|3|3|True|
|coordinated-2000|paired150|0 ms|3|3|0|False|

[Every directional result](./sender326c-runs.csv) includes offered keys/commands, local and peer p50/p95, missing observations, accepted positions, positions/100 keys/commands, requested logical reads, write attempts, quiet-read deltas and actual offline unlock-to-editable timings. sender326c-cells.json retains the route-specific admitted budget where captured and every individual run. A failed journey may have partial latency observations: its missing keys and sample counts remain explicit, and those p95 values cannot pass a cell or be pooled with complete streams. One failed replicate fails a cell. No latency-only winner/default is selected.

In paired failures a workspace closes while keys are still being offered. Counts then disappear, and subsequent keyboard events target the page, not an editor. The retained Window trace reaches workspaceFinish and then setupClose, but a pending call rejected by shutdown is not an originating cause. The original fail() path/reason is not captured. The operator notes a flush open at close in only4/8 traced runs, no non-200 responses in18 runs with peak13 units/s/device and at most2 active, and closure after17–21 sends versus25 coordinated sends without closure. These are the operator-supplied fault-trace observations, not an identified cause or a send-count threshold. Drop the flush clue; a separate observation build must distinguish root channel reason, Worker error/lifetime and cohort abort, preserve Worker trace before termination and record both directions of channel pending/active high-water and queue-full. This is a functional failure, not an unexplained clock/DOM latency outlier; neither data loss nor a particular root cause is established. No cold stage is reached on those runs. Successful runs retain raw full-archive equality, Undo preserving both streams and two exact offline cold reopen/edit/Undo checks.

The first sender apparatus revision incorrectly required an accountOwner worker filename, while the genuine adopted owner was enrollmentOwner; eleven reached preconditions fail with zero offered keys. Revision B uses the native owner and retains seven exposed failures; its visual marker assertion wrongly expected literal Markdown brackets, and paired runs also expose workspace closure. The copied-profile readback and no-typing focus diagnostic are kept. Both browsers were already focused and visible; focus emulation is not used. Revision C normalizes brackets only for visual checks while exact raw archive assertions remain unchanged, uses the two short cards, and reruns the full grid. All A/B failures, preflights, stage hashes and protocol amendments remain, not silently replaced by C.

The remaining single-writer latency is bracketed in sender326c-attribution.json only where one key can be matched conservatively and recorded spans exist. Export/clock observations are not paint timestamps, sampled Worker event logs can end before typing does, and paired/in-flight coalescing prevents pretending each POST belongs to exactly one key. Any unassigned interval remains unassigned. Read/write request counts differ from admitted work units; failed journeys lack a final budget snapshot, so requested logical reads and HTTP attempts are diagnostic, not fabricated token totals.

## Design and next decisions

[Signed multi-publisher tips](./SIGNED-TIPS326.md) is a read-only contract proposal: exact request/scope binding, authenticated roster completeness, fresh authority before ledger capture and commit-time witness checks, monotonic per-publisher tips, bounded logical fairness, withheld-hint liveness and explicit capability/rollback behavior. It could combine quiet discovery exchanges, not replace per-entry crypto or authorize absent bytes. No endpoint is built.

LANDING326.md lists each piece separately. Stored-mode repair, parsed-page sharing, the unreleased dense format, E/B, R, S/Y/SY1N and sender policy each need their own hardening/compatibility/fairness/fault work if authorized. The separate PreparationCapacity-to-owner-error mapping remains open. Reopened devices keep the durable journal and may encounter the same capacity bound again. The grown building error and paired mirror shutdown need bounded causal traces before claiming those flows work. No hardening begins.

All recorded five-second host load logs are retained, including failures; exact source/assets, test and build inputs, all stage plans, child exits, profiles and inert recipes are in [the artifact index](./evidence-index.json). Browser profiles, credentials, databases and compiled builds remain private and are not copied into the repo. The check distinguishes historical harness revisions from the final harness rather than asserting old inputs equal newly edited apparatus.

Independent closure checks preserve all 1,552 canonical inputs, signed HEAD 0ab9cbc8937e32c6542aaeeca697c87ba116c3be, and an empty real index. No canonical application/test/default, deployment or preview changed. This is evidence and documentation patch326 only.
