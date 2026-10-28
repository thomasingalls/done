# Next bounded repair: preserve an already-due publication window

Outcome: a publication window that has reached its due time stays due while receiving or an async
send prelude finishes. A later accepted local edit must not erase that expired opportunity. Keep the
existing quiet300/max2000 collection policy for windows that are not due. Use the existing close/
clear lifecycle in the publication scheduler, independently of local journal flush batching.

The shared batchWindow helper also serves admissionQueue's local flush. A broad default change there
would alter typing/storage policy. Prefer the publication call site: before noting later local work,
close an existing due window whose deadline has passed. This is a candidate design, not implemented
or proved sufficient by the current phase. Actual retained pre-HTTP intervals do not expose which
prelude or local task ran; the pinned success-only scheduler counterexamples demonstrate possibility.

Preserve persisted wire retries, position/capsule ownership, whenDurable barriers, source selection,
all authority/history/signature/witness/authorization/final-commit checks and original frames. No
extra concurrency, rate-limit increase, failure-backoff bypass or admission/crypto/storage shortcut.
A due window is scheduling urgency, not evidence of persistence or permission to allocate/send.
Cancellation/lock clears it; a fresh window begins only after the existing new-envelope boundary
consumes it. Already-sealed submissions retain their exact retry bytes and original failure clock.

Before repair turn the finite receive-slot and async-prelude schedules into regression cases, plus
not-yet-due quiet collection, fresh-window-after-clear, failed old submission retry, local input during
retry, hidden flush, lock/cancel, repeated notes and local flush independence. Keep old assertions.
Use omission controls for expiry latching; do not tune a fake quantum to make a repaired model win.

Then freeze/rebuild both signed-reference and candidate clients. Experimental candidate may combine
latching and750ms quiet reuse, but keep the product default held until full original R,C,C,R heavy
and nonoverlap comparisons plus fixed two-receiver normal/withheld cases pass. Complete120-key2.5s
peer p95, each marker2.5s, local16ms, all replay/delivery/continuation/full archive/native prefix/
signature/cold/undo/fairness guards stay. Retain catch-up gains with the original nonregression/drift
rules. No subset quantile or repeated run for a win. Reuse the same actual5kH fixture and qualified
1CPU/1GiB service, not an unstated13k workload. No release preparation or deployment.

Capacity pacing is a second bounded target. H1 capacity no-read intervals overlap6/7 normal and12/13
withheld candidate keys above2.5s. A four-page batch costs4 actual work units under the existing16/s
session policy; a refusal currently delays the whole receive lane for about1s, including a fresh
peer. The native response identifies capacity, not the exact acquire/top-up branch. Do not quietly
ignore429 or let content notifications override its failure clock. If latching is insufficient,
trace/implement capacity-aware pacing that reserves interactive opportunities before refusal while
retaining server-enforced budgets and multi-account fairness. Any rate-policy change needs separate
capacity evidence; current constants explicitly are policy, not measured machine capacity.

Either repair can change interference and publication/discovery timing. Existing stage intervals or
fake-clock outcomes are not predictions of a counterfactual p95. Re-measure the whole candidate before
enabling quiet reuse. Generalized qualification remains paused912/367; no release gate is relaxed.
