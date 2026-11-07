# Phase 468 — warm audit interrupts retention before preparation

The observation-only rerun reproduces the original 120-second completion failure:
seven interrupted attempts, zero completions. All 120 keys, the full original
archive plus only the offered append, and Undo/peer convergence pass. Cold is not
reached. This diagnostic earns no Stage 5 performance or acceptance credit.

## Discriminating result

Both durability operations succeed on every attempt. Across the six post-typing
retries, `workspace.whenDurable()` takes 1.600–3.500 ms and the native journal flush
1.100–3.400 ms. Preparation then enters `runBaselineShadow`, but a queued
`warm-audit` job changes `preparationActivity`. Its existing guard throws while
the asynchronous journal observation is opening, before the preparation callback
and its first `reading` progress report. The last public status therefore remains
`durability`, although durability completed. This is not a cached failed promise:
all seven interruption objects have different native identities.

| Attempt | Start after last key (s) | Observed request duration (ms) | Interrupting job | Error ID |
| --- | ---: | ---: | --- | ---: |
| 1 | -59.966 | 777.700 | foreground | 1 |
| 2 | 24.757 | 3.600 | warm-audit | 35 |
| 3 | 43.920 | 6.000 | warm-audit | 53 |
| 4 | 62.633 | 6.200 | warm-audit | 71 |
| 5 | 81.718 | 6.000 | warm-audit | 89 |
| 6 | 97.837 | 3.800 | warm-audit | 107 |
| 7 | 116.580 | 4.100 | warm-audit | 125 |

The first attempt reaches verification and yields to an ordinary journal-flush
job during typing. The six subsequent entry failures come from warm audits;
each has queue-priority true, suspension false and shadow-activity false. The
later journal/handoff/authority checks are not inferred to have passed: the
preparation callback is not reached. Each outcome is locally classified as
priority-only and sets exactly the existing 10,000 ms retry floor. Actual starts
remain subject to readiness, input quiet and new events, so the roughly 16–19 s
spacing is not evidence of a different configured retry clock.

## Source explanation and repair boundary

`accountCapture.ts:338` changes the preparation-priority token for every
non-preparation job, including `kind: 'warm-audit'`. Foreground accounting at
`:340` already distinguishes that kind. The audit callback at `:391` enters the
same `run` queue; preparation captures the token at `:748`, and the check at
`:762` rejects a changed token. Storage completion schedules audits at `:357`.
The trace identifies the audit arrivals and the exact refusing check; it does
not measure every audit's due-rule inputs or explain their full CPU cost.

The next bounded repair is arbitration between the two maintenance jobs so a
warm audit cannot repeatedly preempt preparation at entry. Do not catch and ignore
the guard, suppress an integrity failure, shorten the retry, remove audits or
raise the deadline. Preserve audit row/logical pressure, foreground/input and
lifecycle interruption, fresh evidence and final mutation checks. A deterministic
queue-interleaving regression and an uninstrumented maintenance rerun must test
that repair. No repair is implemented here.

## Evidence and limits

A fresh private source copy adds passive boundary/error/job observations only.
Reversing its four-file diagnostic diff recovers canonical source byte for byte;
only those files and the new observer differ under `src`. All 51 assertion/wait
call ASTs in the approved phase 467 case remain exact. All prior phase 467
private files remain unchanged. The API, workload, flags, limits and all case
waits/deadlines remain unchanged; no profiler is used.

The 85 existing focused controls pass unchanged in five files (1.84 s): admission,
preparation journal observation, interruption conditions, priority retry and warm
audit scheduling. They test the individual policies and do not prove freedom
from this integration conflict. No existing test was edited. Preserve the initial
proof-script import error: TypeScript 7 lacks the requested JS parser entry; the
proof uses the installed Babel parser instead, without another app run.

Every build/run has external five-second host/display logs and windowed power
capture. The diagnostic has 42 display-on samples, constant 12,932.44 MiB swap,
and 3.7% peak fseventsd CPU. Console instrumentation adds work, so its durations
are diagnostic observations, not production performance estimates. All raw
profiles/builds/logs stay local behind hashes; no evidence objects enter Git.

Stage 5 remains 15 passing journeys, one failed and 20 unrun. The completion
blocker remains open. No canonical runtime/test change, commit, push, release
preparation or deployment. Stop after recording this bounded diagnosis.
