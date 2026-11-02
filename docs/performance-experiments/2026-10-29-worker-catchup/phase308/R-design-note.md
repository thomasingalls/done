# R: small scheduling-only lab probe

One content-hint counter per live scheduler; one last-completed-read hint count per peer.
The existing verified completedRead hook already carries the quiet-read token, publisher and
verified outcome. A received quiet read with a previous read and unchanged content-hint count
sets repairUntil=now+30s; each further such find rearms it. Hot drain reads have no quiet token
and do not activate/rearm. While active, only the scheduler's idle interval becomes1.5s.
Content hints increment the counter. Ready/health/control do not pretend to be content hints.
No activation for a first-ever read. Closure removes state. No new storage/verification/API port;
no backoff, error handling, publication/local flush, byte limits, quiet750ms or rate-limit change.
The expected first no-backlog miss still waits for the original repair interval; R is reactive.
D remains an independent optional hint extension. Every activation/read/hint is observed.

Counter interpretation: repairActivations counts arm AND rearm events. In the healthy-hint
screen there were seven such events within one active episode (one arm, six extensions), not
seven independent episodes; normal-r-activation-detail.json reconstructs this from at/until.
The screen's typing-window net token counts1483/1476 are a single descriptive pair, not proof
of unchanged expected traffic. The per-peer counter is recorded on completion, not request
start; an in-flight hint can be consumed by that completion. This is a mechanism to examine,
not an established attribution of the observed normal episode. The no-backlog first miss and
post-activation2530.834ms p95 stay failed against2.5s; rearming does not erase either result.
