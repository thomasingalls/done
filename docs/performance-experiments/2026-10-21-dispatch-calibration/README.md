# Phase 10 — typing dispatch, focus and independent browser roots

This [prospective protocol](./protocol.md) is an evidence-only measurement phase after immutable patches01–09 (tree f753a1ad6da2edc024976823cd50248d9d1c96dd). No working runtime/default/test/security changes, real staging/commit/push/preview8443/merge/deployment or generalized qualification. Keep16/session,64/process, all 881 obligations / 337 unresolved obligations and 97 construction statuses. Other-seat progress and deferred formatting stay exact.

## Question and design

Does a shared browser or focus explain the composite typing miss, or does input queue behind app work in the sender renderer? Freeze the exact phase09 temporary B32/128 service (803 source files), exact 110-asset patch02 client and encrypted 121-card/13k-Goals/600-missing-position fixtures. No rate, crypto, authority, work reservation/refund, retry/deadline, native guard, cold lane, custody or receipt changes. Original phase09 budget checks already cover these exact sources; this phase does not rerun or claim a full suite.

Two static native-input controls first, then10fresh restored app journeys in two fixed reversed blocks. One journey is the analysis unit, not120dependent keystrokes. OE=shared/original editor ordering; FE=shared/explicitly focused editor; IE=two browser roots/explicitly focused editor; FP/IP=native textarea on the app sender page in shared/two-root cases. Fixed OE,FE,IE,FP,IP then IP,FP,IE,FE,OE. No favorable reruns or early stopping. All 10 app journeys preserve 600-position catchup, exports, receiver writing, Undo/Redo and locked offline reopen. Six editor journeys additionally verify all 120 new A keys reach B. Four plain controls deliberately omit those editor admissions: A's existing600positions reach B; B sentinel and new guard writing reach A. They do not establish120new A-keystroke transport and do not have identical new-writing coverage. Native control fields are removed before export. No physical Android/Firefox/WAN, population precision, maximum-capacity or policy-adoption claim.

## Sensor calibration and pipeline observations

All 12 journeys complete; every one of 1,440 beforeinput observations is trusted, focused and visible, including the original ordering. SystemInfo root IDs independently verify shared vs separate ownership. Actual fresh root executables are read/hash-attested (not merely executablePath API): HeadlessChrome/151.0.7922.34, SHA256 7687bff7cb2db075f250e6d5848bbc8838cac3802ac3952a899c574f8eccab45. Every root binary matches.

Record host offer/return; browser keydown event timestamp and renderer capture arrival; beforeinput→original numeric DOM-length/native textarea input; nextRAF; EventTiming when available;16 ms renderer timer gaps;20 ms Node worker/parent timer gaps and 500 ms resources. Root/binary, clock brackets, actual target/focus, roles, all raw numeric rows and independent DOM reconstruction remain. TimeStamp is browser-created, not a hardware clock. Mutation/RAF is not displayed pixels. Heartbeat overlap is temporal evidence, not per-function causal proof. No CPU profiler is running.

| Run | Offer→DOM p95 ms | Keydown stamp→handler p95 ms | Beforeinput→DOM p95 ms | Renderer timer lateness p95 ms | Worker/parent timer lateness p95 ms |
|---|---:|---:|---:|---:|---|
|control-normal|4.9|0.6|0.6|2|3/3|
|control-fault|6.2|0.6|0.6|1.9|3/2|
|1-OE|9.8|8.5|1.6|18.8|2/2|
|1-FE|14.4|12.4|1.4|18|2/2|
|1-IE|16.4|14.5|1.5|19.3|2/2|
|1-FP|4.2|0.6|0.5|1.9|2/2|
|1-IP|4|0.6|0.6|1.6|2/2|
|2-IP|3.8|0.6|0.5|1.9|3/2|
|2-FP|6.8|1.1|0.7|1.6|3/2|
|2-IE|11.5|9.6|1.8|19.2|2/2|
|2-FE|14.6|12.8|1.5|21.2|2/2|
|2-OE|8.4|6.9|1.8|17.2|2/3|

The deliberate static fault blocks beforeinput for 80 ms at keys 30/60/90. Each is independently detected by actual busy interval, host/DOM, beforeinput/DOM, nextRAF, heartbeat and>=50ms longtask sensors. Heartbeat gaps88.8/90.6/94.2ms. The faulted control's overall p95 remains6.2ms because three faults are only2.5% of 120 events: retain per-fault rows and maxima rather than treating a p95 as proof of no stalls.

Editor keydown-stamp→capture p95 spans 6.9–14.5ms, versus 0.6–1.1ms for native controls. Worker/parent timer lateness p95 stays 2–3 ms; editor renderer lateness is 17.2–21.2 ms versus roughly1.6–2ms in native controls. Beforeinput→DOM remains 1.4–1.8 ms in editor runs,0.5–0.7ms in native controls. These are separate distributions; quantiles are not additive. Raw slow-key associations are in summary.json and compressed analysis.json.gz.

## Controlled contrasts and interpretation

Prospective discriminating reduction requires>=3ms AND>=20% in BOTH blocks. None qualifies:

- focus+sentinel-order bundle: block1 9.80→14.40ms, block2 8.40→14.60ms; consistent declared reduction: False.
- independent browser root, equal editor workload: block1 14.40→16.40ms, block2 14.60→11.50ms; consistent declared reduction: False.
- independent browser root, plain input control: block1 4.20→4.00ms, block2 6.80→3.80ms; consistent declared reduction: False.

Reference OE catchup drift 7.33% is within15%; fixed denominator remains. Explicit focus/order changes make this sample slower; their contrast bundles sentinel ordering and focus, so no pure focus effect is identified. Independent browser roots give a mixed editor contrast. Focus/root ownership is not a consistent explanation of the miss in this fixture. Native controls are faster, but they omit new local admitted writes and the background work those cause, so their contrast does not isolate CodeMirror or a specific verifier function.

The pipeline observations support queued renderer input during sender app work. They converge with phase09's separately sampled verification byte comparisons/projections and ownership cleanup. That makes owner-local verification/comparison reuse the next bounded target; no causal function repair is established here. Keep every byte-change/authority/fresh-inventory/invalidation/cleanup/projection-isolation guard and use the existing authenticated carrier/view ownership patterns only where justified. Demonstrate the problem before implementation. No working code repair or increase to16/64 is included.

All instrumented app catchups are32.1–38.7 s. Do not compare these with phase09's25–30s arms: sensors and preparation/target workload differ, so these data do not isolate instrumentation overhead or a runtime regression. Timer/event collection and one-machine scheduling can perturb results. All prior 16 ms misses remain preserved; measurement calibration does not relax the product criterion or grant adoption credit.

## Evidence and reproduction

All six analysis/identity/planning checks pass. All 875 actual working test blobs and803 working runtime source files match their immutable patch09 home; the temporary experiment corpus has exactly four declared harness-file differences. Census/planning/progress/qualification/deferred formatting remain exact. No new discovery/closure/aggregate test credit. Append durable outcomes before advancing state; no active-state file changes here.

SHA256SUMS pins every file except itself; artifact-provenance.json pins raw and deterministic-gzip bytes. Numeric whitelist and known raw/escaped browser fixture value scan excludes codes/private keys/credentials/storage/DBs. Node role labels omit arguments/environment. Native child snapshots can be absent after signal termination and mean unavailable, not zero cost. Actual binary attestation does not attest the full dependency store. Original random private fixture bytes remain outside Git; recreating enrollment changes identities.

To reproduce: apply exact01–10 sequentially with --whitespace=nowarn in a separate checkout; do not reapply over the cumulative worktree. Reconstruct frozen phase09 Bsource/client/fixtures and four temporary harness files. Use Node24/pinned dependencies/browser; preflight, run both controls and all 10 fixed journeys serially, wait actual process exit, then final-checks.py. Retain every raw observation, static injected fault and failed gate. General qualification/publication remain separate.
