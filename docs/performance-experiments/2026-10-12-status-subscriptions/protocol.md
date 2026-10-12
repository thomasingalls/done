# Status subscription isolation: prospective comparison

Decision: isolate admission-status rendering from content/actions without changing custody reads,
FIFO admission, durable receive, journal ordering or undo. Baseline/anchor is signed `e730ac57`.
The hypothesis is that queue notifications cause unnecessary React work which delays both input
and fresh-authority callbacks. The previous profiles show association, not this causal effect.

## Design and units

Twelve serial restored browser sessions: baseline and candidate in each of silent-peer, active-peer
and 600-position backlog conditions, in two blocks. First block baseline then candidate; second
block candidate then baseline, same condition order. Each session types 600 keys at an externally
scheduled 150 ms cadence, without reopening. Active peer types every two seconds throughout.
Receiver CPU-4x, 75 ms injected request delay; retained 120-card/~60 KB fixtures, 12 KB Goals where
present. Record actual Goals size for the backlog fixture. Restore both client/service state for each
session; use one worker, no overlapping builds/profiling. No efficacy stopping or extra favorable runs.
A failed session is retained and repaired/repeated only for an identified instrumentation failure.

Assignment is session/build; observations are keys/jobs/tasks; analysis is paired session contrasts.
Keys and nearby callbacks are dependent. Two blocks are a bounded engineering comparison, not a
powered test for a 20% p95 change; unknown between-session variance precludes such a guarantee.
Show every session and both paired differences, without pooled-key confidence claims. This measures
this desktop/emulation/fixture only, not physical phone performance or universal input latency.

## Measurement

Primary: input event timestamp to first rAF callback observing the expected text (a pre-paint proxy),
per-session p95. Also retain legacy handler-to-rAF, dispatch-to-handler, median/p99/max, fraction
above 50/100 ms, actual input cadence, host dispatch lateness/completion and missing input/frame
counts. External CDP injection is scheduled independently of renderer completion with bounded
outstanding commands; exhaustion fails the recorder instead of silently reducing input rate.
Before comparisons, use a known 200 ms main-thread stall and verify input dispatched during it
is retained with increased pre-handler delay. Explicitly supplied CDP timestamps use the host epoch;
measure host/browser clock offset and report it, never silently clamp away negative deltas.
Neither metric claims physical screen presentation. Keep independent long-task counts, maximum
and total excess over 50 ms. Profile only after unsampled runs if needed, separately labelled.

Mechanism outcomes: queue-only content consumer renders in a focused UI regression; complete
fresh authority-read and final job times, read count, live publication cost; completed sync work and
requests. Compare identical authority checks; faster sync can change exposure, so report counts and
backlog overlap rather than equating raw long-task totals across different amounts of work.

Guardrails: immediate pending/blocked/error warning changes; Retry/Discard and unavailable controls;
subscription cleanup and owner replacement; no editor remount. Every browser session checks exact
local text, last-key undo/redo, peer writing, whole-export convergence and cold offline replay.
Focused authority/handoff/undo tests remain applicable; no generalized validation campaign.

## Decision rule and limits

Adopt only with all correctness guardrails passing and proven elimination of queue-only content
fanout. Claim an input benefit only if both block contrasts improve the primary metric in affected
conditions; >=20% or >=10 ms is a useful effect, not a significance threshold. Silent-peer p95 must
not worsen consistently by >10% and >3 ms. Mixed/small results are inconclusive for latency; retain
an isolation-only correctness/maintenance benefit only if no consistent material harm, explaining
that it has not solved the wait. Report authority timing separately: reduced elapsed read time does
not mean faster storage hardware. No interpretation of old cross-phase differences as regression.

The fixed current anchor appears in every block. A separate exact historical authority-reuse vs
prepared-handoff comparison may diagnose earlier drift if source-compatible instrumentation can
be used without changing runtime; do not substitute a current flag-off build for a historical one.
A physical-phone check remains a separate human/device-dependent confirmation before publication.

## Physical companion (authorized before phone timings)

The operator connected the Pixel. Add four serial active-peer sessions in R/C/C/R order, 300 keys
at 150 ms, 22 peer edits, the same restored fixture and 75 ms host proxy delay. No CPU/viewport
emulation; preserve the phone's viewport and keyboard. Report each result separately, never pool
with desktop or turn one device into a population claim. The primary comparison keeps the current signed anchor throughout and tests only status isolation.

Use a dedicated localhost test origin via USB reverse, refuse pre-existing origin data without this
run's ownership marker, and restore only synthetic fixture state. Attach only to the exact test tab;
never inspect writing or modify storage on public/Tailscale origins. Verify the recorder on the
phone with a known stall and align host/phone epoch clocks before injection. Exact text, undo/redo,
peer export convergence and cold reopening with the test services stopped remain guards. Automated
CDP keys do not test Android IME composition/autocorrect or physical screen presentation. Retain
setup failures separately; do not repeat unfavorable valid timing. Stop on semantic failure or after
four successful fixed-order sessions. Read battery/thermal metadata and avoid concurrent desktop work.


## Historical drift companion (fixed before historical timings)

Rebuild exact frontend runtime at signed `08a82089` and `02829405` through a build-only source loader,
using the common online instrumentation available to both (no later authority-read/final-span probes).
Use the current disposable service, same package lock/config (verify equality), same active-peer
fixture and independent 600-key recorder. Four fresh sessions in authority/handoff/handoff/authority
order, all correctness checks retained. Do not pool these with the status-isolation timings: the
instrumentation differs. This tests their relative behavior in one host session; it cannot prove what
caused historical machine drift or supply powered precision for small effects. Report every result.
