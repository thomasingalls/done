---
schema: 1
kind: finding
id: f-bd87655-baseline-not-performance-floor
status: validated
type: propagated-assumption
severity: medium
confidence: high
introduced_by: bd876553c8a2be17ff55c399f416d7eed9075935
work_item: B-03
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# Baseline browser interoperability is treated as a lower bound on device performance

## Affected requirement or guarantee

TRD §12 requires the synchronous whole journal write to remain below 1 ms p95 on a low-end device. The
support-floor decision claims Baseline newly available bounds the device population from below and is the only
population against which that budget can be argued when the named handset is not acquired.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §12 makes the budget device-specific and
requires a real low-end-device benchmark; `OC-050`, `OC-051`, and `OC-064` preserve that evidence requirement.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/TRD.md` §10.11 still says a device running a current
stable browser is not from the era that makes the latency budget interesting, while §12 reports one Pixel 9a and
does not define a hardware lower bound for all supported devices.

## First introduction and propagation

Introduced by `bd876553c8a2be17ff55c399f416d7eed9075935` in TRD §10.11. The measurement ledger and row-2
selection inherit the idea that the browser floor bounds the relevant device population after the originally
named handset was not obtained.

## Reachable consequence

A current core browser can run on hardware with CPU, storage, thermal, memory, or load characteristics below the
single measured Pixel. The team can therefore accept a journal implementation as meeting the supported-population
p95 even though the policy used to define that population says only that browser features interoperate. Users on
slower supported devices may experience handler-blocking typing stalls.

## Supporting evidence

The WebDX Baseline definition describes cross-browser feature availability and the 30-month newly/widely timeline;
it contains no device-performance criteria. `bd87655:docs/TRD.md` itself defines Baseline solely by current stable
browser support, then makes the separate hardware inference. The subsequent Pixel evidence is one measured device,
not a proof that all devices on the browser floor are at least as fast.

## Counterevidence and disconfirmation attempt

Current browser releases and OS-update requirements may correlate with newer hardware, and the Pixel 9a is a useful
real-device correction to desktop throttling. But no cited rule turns that correlation into a minimum CPU or
storage service level, and some core browsers continue to support heterogeneous hardware. The inference therefore
cannot carry the p95 guarantee without an explicit hardware policy or representative device set.

## Validation procedure

Define the supported device/OS population independently of Baseline, select reproducible lower-bound devices or a
representative percentile, and run the production-shaped journal append benchmark on them under declared thermal
and storage conditions. Keep Baseline only as the feature-interoperability policy.

## Disposition

Clarify and test. Remove the performance inference from §10.11 or replace it with a separately evidenced hardware
support floor; do not use browser feature status to close the journal p95 budget.
