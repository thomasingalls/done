# Phase241 — matched client catch-up comparison before tracing the missed marker

2026-10-29. Decision: determine whether the observed roughly100→200s catch-up difference reproduces
when the comparator and candidate run on the same current apparatus. Do not infer it from dated156
and240 trajectories. Investigation only; no product repair, gate change, release preparation or deploy.

## Question, design and estimand

A controlled, counterbalanced system benchmark on one fixed fictional heavy account and this Mac's
headless Chrome. Before client8d6d42c1c723f3dff7c7822b2358a813dc8c16e6 (Page owners) and after client
0ab9cbc8937e32c6542aaeeca697c87ba116c3be (signed Worker owners), both rebuilt from verified Git source.
Hold server code fixed to after, same existing Node24 image/runtime,1CPU/1GiB/no swap/read-only caps,
fixture, current browser binary, viewport, flags and instrumentation. No production or real profiles.

Primary estimand: after/before ratio and difference in maximum two-receiver complete-backlog time
from common reconnect until both original full-backlog markers appear. The unit of treatment and
analysis is a complete independent journey (two clients sharing one fresh server), not each key,
HTTP call or receiver. Run two matched pairs in opposite orders: before,after,after,before (ABBA).
Each journey has fresh cloned state/profiles and a restarted service. No concurrent builds/tests.
Counterbalance temporal/cache drift; no random-population or statistical significance claim from
four trajectories. This compares the whole client conversion, not one individual mechanism or phones.

## Workload, measurement and guardrails

Use the original two-receiver late-writing workload:120 real keys at its established500ms schedule,
three markers at existing hot-cursor thresholds33/513/993, both clients catching up. Normal hints in
all four journeys first: avoid adding the withheld-hint fault to the primary comparison. Keep original
16ms local p95,2500ms peer p95 AND EVERY marker,30s final-new-delivery,600s complete-backlog limits,
all exact archives, same-profile offline cold reopening and no state reinjection. A helper's startup
15s deadline and these existing operational measures do not replace broader TRD budgets.

Keep original DOM observers, monotonic clock brackets and1ms clock allowance, request metadata and
server CPU/RSS/cgroup counters. Install the same bounded notification observer in Page and actual
Workers for BOTH variants; sum both realms and require a real ready frame. No native authority mock,
credential bypass, serialized proof or restoration of Page ownership in the candidate. Decrypt/auth/
history/witness/commit checks, local journal admission, backoff and local/service automation flags
are the actual implementation. Service history automation remains0. No profiling or extra stage
instrumentation until this matched phase finishes. Later marker attribution is a separate phase.

For each journey record full outcomes, local/peer p95 and markers, per-receiver backlog time,
request/status and cursor progression, actual client/SW/source identities, browser version, server
CPU/memory/noOOM limits and cleanup. Independently reconstruct key/marker bounds from raw events.
Any missing input, clock inconsistency, authority/storage failure or wrong archive invalidates that
journey; retain it and stop for classification. Never substitute a favorable retry. Absolute gate
misses with otherwise-complete functional guards remain misses and do not stop the other fixed runs.

## Analysis, precision and decision

Compare pair1=after02/before01 and pair2=after03/before04. Report all four absolute times and both
ratios; distinguish each receiver and include a descriptive ratio of geometric means. Keys and
receivers within a journey are dependent. Two pairs cannot estimate stable tail uncertainty or
population variation; no p-value/bootstrap confidence claims. Variance inputs for a powered study
are unavailable, and this bounded mechanism decision does not need an invented sample size.

A ratio>1.10 in BOTH opposite-order pairs is a practical reproducible-slowdown signal, not a new
release budget or permission to relax existing gates. Then isolate where candidate time accumulates.
Ratios<=1.10 in both fail to reproduce a substantial slowdown on this fixture; investigate common
server/apparatus costs instead of blaming Workers. Opposite/mixed directions are inconclusive and
require a separately frozen discriminating control, not more opportunistic repetitions. All absolute
gates apply regardless of the ratio. Censored/invalid journeys are never treated as successful zeros.

## Validity and runbook

1. Verify80 signed commits161–240 and clean source; preserve map and the hash-abbreviation-only
   staged-diff check interruption. New investigation work stays in sequential uncommitted patches.
2. Extract exact build roots from both commits; verify source bytes and identical build/dependency
   configuration. Build BOTH clients before timing. Verify maps/assets and pin all selected harness
   inputs. App-version strings and verifier hashes naturally differ; they do not widen proof reuse.
3. Run discovery/closure and isolated server readiness/shutdown QA before any timed journey. Ensure
   exact own prior containers/browsers are absent. Do not clear unrelated storage or stop other work.
4. Freeze this protocol/inputs/phase241 patch. Run all four serial journeys in fixed ABBA order,
   checking cleanup before starting each next journey. Preserve failures and original deadlines.
5. Independently review results and source/asset agreement, append completed before backlog, and
   freeze phase242 evidence. Then trace the missed2.5s marker in a separately identified diagnostic.

The selected source archives omit unused docs/tests from build roots; backend mounts code/scripts,
not documentation. No runtime check is removed. QA must establish the complete actual import/asset
closure before timing. Host workload and thermal/OS cache state cannot be perfectly controlled;
record/order-balance and retain limits. Serial fresh profiles prevent data/cache carryover within
browser sessions; OS cache carryover remains. This fixed synthetic account is not a population of
accounts, Android hardware, hidden/frozen lifecycle or proof that all security contracts are qualified.
No causal attribution to one function from aggregate timing. No release qualification or promotion.
