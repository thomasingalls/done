# Service versus test CPU — phase 448

The busy shared Node isolate is dominated by **test reporting overhead**, not
service stacks. One frozen-asset/exact-seed known-backlog normal diagnostic again
fails the original third-sparse visibility assertion. It runs without phase 447's
network or Window observers. The test body, all assertions, waits, offered edits
and deadlines are restored exactly by removing the declared observation edits.
This is a failing-gate diagnosis, not a lab candidate or acceptance measurement.

During the **54.153 s** hot interval, the same **92** `acceptedRows` calls block
synchronously for **41.134 s**. They retain every original tuple assertion.
Maximum call cost grows from 196 ms in the first ten seconds to **1,052 ms** in the
last period. The helper runs in the same Node event loop as the real service,
proxy, gateway and test, so these synchronous checks delay all of them.

| Profile ancestry | Weighted sampling time | Share of all samples |
| --- | ---: | ---: |
| Accepted-row helper and its nested assertions | 40.446 s | 74.37% |
| Service | 3.094 s | 5.69% |
| Other test / Playwright harness | 0.981 s | 1.80% |
| Diagnostic bookkeeping | 0.225 s | 0.41% |
| VM idle | 8.608 s | 15.83% |
| GC, program, other, unattributed protocol | remainder | 1.89% |

The top self frames are Playwright's `_addStep` (**16.812 s**) and
`_findLastPredefinedStep` (**11.002 s**), then matcher reporting (**3.009 s**).
The independently pinned installed Playwright 1.62.0 source recursively searches
the existing step tree while locating the parent for each new reported assertion.
The census rechecks every accepted tuple on each call and creates four reported
assertions per tuple, so the reporting tree keeps growing. These are successful
assertions; deleting a test expectation is not the proposed remedy.

Node process CPU is 47.856 s and measured event-loop utilization is 98.1% over the
hot interval. Sampling weights are diagnostic elapsed-time attribution, not exact
CPU accounting; process CPU can include native/background work. The directly
measured synchronous-helper wall time is the clearer blocking observation.
There is genuine service work, but this result does not establish a service-side
regression or justify changing its work cap, authorization or rate budget.

The failure remains red, with sparse markers 20/40 visible and 60 absent at the
original cutoff. Later archive, Undo and cold steps remain unreached. All older
failures stay intact. Fourteen host samples show swap flat at 15,800.31 MiB and no
non-test sustained full-core noise trigger. Display protection, five-second logs
and windowed power-log storage are unchanged. A failed local dependency-path read
was corrected by using the actual profile URL; no additional app run was needed.

The next bounded phase will use a **private test-only reporting control**: retain
all four accepted-tuple predicates and decoders while using strict Node assertions
instead of creating Playwright report steps for every row. Prove the predicates
and negative controls before the app run. Then examine omitted sparse request
scheduling under the same assets, fixture, workload and deadlines. Canonical tests
and the app remain unchanged until that result is reviewed. No runtime optimization
or service/wire change is made here.

[Evidence](./evidence.json) pins the actual profile, counter log, dependency source
and closed-fixture identities. Sources are referenced by commit/path; no source
archives, profiles or full power logs are duplicated in the repo. Documentation
only; no Stage 5 timing credit, commit, push, publication or deployment.
