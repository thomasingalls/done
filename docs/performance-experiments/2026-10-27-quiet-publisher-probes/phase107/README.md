# Phase107 — Correct the replay needle; preserve interruption and its data evidence

The corrected normal primary reaches the replay wait, whose implementation still requires the
entire original text as a contiguous substring. That contradicts the intended concurrent-marker
workload: Yjs can place the late marker inside that text. Stop the invalid wait with SIGINT after
7.3 minutes instead of spending the rest of600s. Playwright terminates the worker before finally
writes result.json: preserve exit130, interrupted runner/report, missing result and no timing/full-
journey credit. The withheld case remains unrun. Stop only the verified disposable container; keep
its private DB/WAL and profiles outside Git. This is a failed diagnostic, not a passing primary.

A separate3-second cold offline opening of that exact saved H1 profile, without reinjection, proves
what happened: the original substring is absent, removing only the one known marker restores it,
and the entire export with that marker removed exactly equals the complete seed archive. A control
deleting one original character fails. Independently verify all native old envelope/wrapper/head
signatures and prefixes, exactly one new expected publisher position2, and unchanged M/Q. Retain
main+WAL hashes for the interrupted native state rather than pretending the main DB alone identifies
an uncheckpointed database. These checks establish diagnosis/preservation, not missing timings.

Correct only the poll predicate to remove the known marker before finding the original text. Keep
one-marker and full-export equality, all native checks, original600s deadline, single2500ms comparison
and every security guard. Add explicit closed-field partial-result checkpoints so interruption
cannot discard observations already made. Harness types pass. No product or old-test code changes.

Freeze a fresh guarded normal/withheld pair before dispatch with the exact same runtime/fixture/
resources. Neither aborted attempt's latency has been inspected or pooled. No repeated primary is
selected to obtain a favorable timing result; any further unexpected failure stops and remains.
105/106 retain all previous sources/failures; this checkpoint records the narrow harness correction.
All912 obligations/367 unresolved blocks stay; qualification paused. Unsigned107 after106. No commit,
push, preview/API update, release preparation or deployment.
