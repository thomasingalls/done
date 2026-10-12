# Whole-history copies: prospective protocol, 2026-10-12

Base: signed `e88c19a5`, warm exclusive Account loads enabled. No format change, publication or
generalized release campaign. Local retention remains design-only.

Decision: can the private Account verifier own its candidate/result instead of making redundant
detached histories, without lending mutable buffers to callers or weakening full verification?
Start with one isolated CPU-4x profile and copy-call stacks on the retained realistic fixture.
Separate carrier copies, verifier input/retention copies and deep semantic clones. The previous
92.07 MB/120 keys is a measured total, not proof that every byte copy is removable.

Proposed bounded mechanism, subject to that attribution: keep the carrier's detached load boundary,
reuse only byte-equal retained prefix rows inside the private verifier, copy changed/new candidate
rows, transfer the successful verification result and candidate into retained ownership, and erase
only buffers unreachable from the new retained view. Returned projections stay cloned. The generic
verifier remains the reference. No mutable naked carrier view, weaker counter/row check or borrowed
public readback is authorized. Results may share old prefix buffers; success, failure, invalidation
and close must respect that lifetime explicitly. Reference audits remain detached and independent.

Prediction: eliminate the verifier's roughly 59 MB of repeated record copies, leaving approximately
33 MB from the carrier (plus new rows), and remove its whole semantic-result clone. Byte comparisons,
container traversal and carrier copies still grow with history. Hypothesis: at least 25% less total
long-task time than the warm baseline. Failure to reach that size of effect calls for attribution
before default activation, not an unbounded optimization search.

The analysis unit is a freshly restored browser session: the same synthetic 120-card, 600+ received
position fixture, 120 keys at requested 150 ms spacing, offline, CPU-4x, one uninterrupted undo stack.
After the profile, use three unprofiled matched pairs in AB/BA/AB order, no overlapping builds/tests.
Compare session long-task duration totals, maxima, handler and visible-frame median/p95/max, numeric
copied bytes/copy counts, loads and audit rows. Use floor(n*p) sample quantiles. Do not treat keys as
independent trials or pool profiling/pilot runs with final pairs. Report all attempts and failures.

Activation criteria: at least 60% fewer record-copy bytes and 25% lower aggregate long-task duration;
no >10% increase in median-of-session handler medians or frame p95; all safety guards pass. Disclose
worst-frame samples even if worse. These few sessions identify a local mechanism/effect size, not
population significance, a phone budget, arbitrary history growth or current online catch-up speed.
Frame delay begins at dispatch and misses pre-dispatch blocking; retain admission wait spans to
interpret tails. Profile alignment uses the existing CDP clock bridge and reports uncertainty.

Safety: each session must pass full undo/redo and offline reopen. Add focused aliasing/erasure,
failed/late/overlapping verification, prefix mutation and reference-equivalence tests. Run existing
native compaction/audit-refusal/serialization and a packaged two-device text/undo/offline journey.
Keep semantic and physical audit policies unchanged. On safety failure, retain the reference as
default regardless of timings. Use small separate bundles, existing fixtures and compressed numeric
evidence; do not copy source trees or credentials into the packet.
