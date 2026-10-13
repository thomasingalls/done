# Preparation foreground tasks — prospective protocol

Base: signed `127fcf2a`. Private retention work; no activation, stored-format change or release campaign.

## Question and attribution

Which main-thread tasks still block input during preparation outside admission, and can the largest
splittable loops yield without changing verification, authority, journal or undo behavior? The primary
outcome is maximum observed foreground-task duration per conversion on the 1,201 accepted own-position
fixture. Total preparation/conversion time, task counts, timer gaps and final fence are secondary.
Crypto/verification counts, exact cold recovery and cancellation/journal/undo are guardrails.

First align the signed build's retained CPU-4x profile and User Timing trace with its longest main-thread
events. This identifies actual stalled execution, rather than using aggregate self time as attribution.
The two longest TimerFire events are 449.7 and 433.0 ms, with 425/417 ms inclusive samples in
`advanceSelfReceiveCooperatively` → synchronous `advanceSelfReceive`. A 349.0 ms event includes 277 ms
in `compareBaselineReplay` (source selection and obligation projection), and a 213.7 ms event includes
184 ms in `summarizeBaseline`. The raw capture is retained in the preceding evidence packet. TimerFire
is an observed trace event, not a universal task classifier; compare with the Long Tasks observer and
retain all large main-thread events. GC/native materialization and single-record costs remain separate.

## Selected repair and prediction, before new timing

Use the same self-projection algorithm for synchronous and cooperative callers, with budget points
between positions. Preserve full decoding, chain checks and source coverage. The cooperative caller
keeps its state private until completion and erases decoded originals on interruption. Budget the
source scans in baseline summarization, envelope selection and full replay comparison; retain all
sources and all checks. Every yield must recheck owner/activity before continuing. Do not yield inside
the final native transaction, release the final journal fence, remove fresh authority checks, memoize
authentication or replace the live document/UndoManager.

Prediction: the four 200–450 ms history loops split into budgeted continuations. Remaining native
calls, cleanup/GC and individual records may leave a CPU-4x maximum around 150–250 ms; CPU-1x may
fall below 80 ms. Target at least 30% lower paired median CPU-1x maximum task and a lower maximum
in the matched CPU-4x profile, with no correctness failure. Total time may rise from yielding; report
any increase, and investigate if median total rises over 20%. A mixed result retains the evidence
without claiming the responsiveness target met. Stop on integrity or recovery failure.

## Design and limits

Clone the same closed native IndexedDB fixture into isolated contexts: two cards, 12,559-character
Goals, 1,201 genuine accepted own positions / 8,439 rows; synthetic credentials and independent signing
oracle only. No real writing or profile. Freeze reference and candidate bundles. Run three alternating
unprofiled R/C, C/R, R/C pairs, then one CPU-profiled/trace-aligned CPU-4x pair. Retain task durations,
including Long Tasks observer timestamps aligned to the CPU trace by a numeric User Timing mark;
enable the trace's `toplevel` category in both new arms. Older attribution uses the labelled
main-thread trace-event fallback. This instrumentation is identical between the new paired builds.
Retain
timer gaps, nested phase timings, work/native-crypto counts, source identities and exact cold recovery.
Repeat reference/candidate preparation-time input interventions plus candidate CPU-4x, checking
pre-mutation cancellation, journal-before-apply and undo/redo. Handler-to-admission excludes waiting
before the handler: use foreground tasks/timer gaps to describe that separate delay.

The unit of analysis is a conversion repeated on one host/fixture, not independent users. Three pairs
cannot resolve small effects or establish population quantiles. Uncontrolled VM/host activity, GC,
profiling overhead and native-call granularity limit inference; record load and do not run other test
campaigns during timed observations. CPU-4x does not establish phone performance. Compare the new
matched arms, not elapsed times pooled with previous packets. Retain the initial aligned attribution,
raw results/profiles/traces, scripts, frozen builds and focused checks with hashes.

## Focused boundaries

Synchronous/cooperative result equivalence, cancellation inside projection before coverage, decoded
buffer cleanup on interruption, selection of partially consumed capsules and complete outstanding
obligations, owner retirement during new yield points, failed check preventing candidate signing,
fresh retry, and existing native crash/abort/journal/readback/undo and packaged lifecycle controls.
No generalized validation or exhaustive fault campaign.
