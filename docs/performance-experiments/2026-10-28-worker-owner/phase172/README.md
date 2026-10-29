# Phase172 — actual queue-head journal fence

2026-10-29. Add an internal fence capability at the original admission FIFO head, after draining any
existing background copy and flushing the real journal. A prior external durability barrier can be
overtaken by input and is insufficient. Bind the opaque capability to the exact admission carrier,
head and live callback; structural substitutes, another queue and expired tokens refuse. Retain the
original once-only promotion and use an empty handoff for a metadata-only effect. No new method is
exposed on an application workspace. The next Window mirror controller will use this capability for
route/era rebinding; this patch does not yet activate worker receive or mutation paths.

All original admission logic is independently AST-identical apart from the added internal closure
and third bind argument. Original page factory configuration is identical apart from binding the new
capability. Eight new tests plus original admission/page/mirror cases pass (83total). They cover a
journal entry after an earlier external barrier, FIFO exclusion, wrong-owner/forged/expired tokens,
uncertain cleanup/flush retry, close during flush, no empty publication and duplicate promotion.
Removing only the final flush in a private source copy fails the precise remaining-entry assertion
(expected0,received1). The first mutation attempt timed out because its assertion threw inside the
storage-owned callback; move observations outside it to detect the promised property directly.

The first three new tests assumed storage failures rejected immediately. Existing admission instead
keeps the request blocked and pending for retry. Correct those new expectations, retain all failure
logs and verify a later successful retry without issuing an earlier capability. No old tests change.
Type/lint and98 metadata cases pass.431sources retain198domain assignments; source lines only move.
All previous obligations remain exact; newtestrequired/uncredited:949/403blocked.

Original native admission passes all15 ordinary cases and detects its first3 faults. Its remaining3
fault runs time out while observing **initial fixture initialization**, before their assertions or
mutations can be assessed. Full combined campaign therefore FAILS; no aggregate credit. Preserve the
report and unchanged observation/stage limits. This repeats the earlier journal/lifetime observer issue. Next
isolate animation-frame-dependent observation versus genuine initialization failure; do not raise
limits or disable lifecycle/mutation checks to obtain green. No performance acceptance, changed
16ms/2.5s/all-marker/30s gates, service automation, default activation, preview or release work.
