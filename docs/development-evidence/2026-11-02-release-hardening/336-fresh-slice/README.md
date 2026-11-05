# Hardening 336 — fresh preparation slice

The existing two-second wall clock starts at the first fresh journal miss, after exact authenticated hit lookup. A replayed prefix does not spend this new slice. Hits still work after expiry; another miss pauses before verification once completed fresh work exists. One indivisible verifier call is not preempted. All input/task/digest/revision/capacity/pause/erasure guards remain. No format or limit changed.

37 focused cases across seven files pass, including64authenticated replayed hits taking64simulated seconds followed by8fresh250ms checks, exact two-second refusal of the next miss, no clock read on a hit, unchanged per-check interruption, saved-journal/cold owner/ownership regressions, and no new attempt during input quiet or receive drain. No speed measurement or new lab phase; Stage 1 full-suite checkpoint is still pending Y.
