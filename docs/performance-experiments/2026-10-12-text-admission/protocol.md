# Account text admission: prospective bounded experiment

Base: signed `68ca241d`. No stored-format change or publication in this phase.

## Question and decision
Can plain, single-range text edits avoid workspace forks while retaining exact update semantics, attribution, journal-before-apply, and workspace undo? Retain structural, undo/redo, uncertain and pending-state operations on the reference path. A separate build switch keeps the complete reference available.

## Contract
Prepare bytes without changing either document, selections, or undo. Eligibility requires an already verified projection at the queue's revision and repaired membership. One private candidate owns one human source with exactly its update bytes. The ordered owner persists first, applies to canonical, then applies the same bytes to the unchanged projection under the human origin. Only then change selections/undo metadata and publish. Abort/discard must drain candidates. Remote receive invalidates eligibility. Unsupported Yjs text shapes fall back. Full equality remains at opening, reference transitions and received-page publication.

## Design and measurements
Matched synthetic Account workspace (120 cards, ~54 KB Markdown, 600 received positions), fresh disposable context per arm; use the retained fixture and packaged browser harness. At least three 120-key blocks per arm, reference/candidate interleaved, 150 ms key spacing; keep undo history throughout each block. Primary: synchronous key handler and key-to-visible-frame median/p95. Secondary: forks/projection checks per ordinary text command, long tasks, replay/export identity, undo/redo with remote changes, refusal/retry. Profile separately from unprofiled timing. CPU throttling is a diagnostic, not a physical-phone claim.

Keys within a run are dependent; report run-level ranges, no independent-key significance claim. Stop on correctness failure. Predicted admission cost ~2 ms on the retained desktop is a hypothesis, not an acceptance threshold. Require zero ordinary-text workspace forks, equivalent observable undo/replay, and at least 30% lower median handler cost without a p95 regression before default activation. Otherwise leave opt-in and explain the largest residual cost. Full release validation remains paused.

## Validity limits
Synthetic text is not the user's writing. Desktop timing and throttle do not establish Android latency. Browser scheduling, host contention and background sync/flush influence tails; record overlapped work and rerun contaminated comparisons. This changes per-text admission, not UI projection, cold-open history retention, or maintenance costs.
