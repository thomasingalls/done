# Phase252 — existing verified selection speeds catch-up, but input gate still fails

2026-10-30. Same248source/one existing flag difference as251; no product default/runtime edit.
Native guard cohort5pass, before timing. Three fixed new journeys completed without retries.

| Existing selection | Mode | Backlog s | Local p95 ms | Peer p95 ms | Markers ms |
| --- | --- | ---: | ---: | ---: | --- |
| disabled reference250 |normal|236.067|6.692|1461.389|900.028 /1537.572 /2268.649|
| disabled reference250 |withheld|244.416|5.835|1865.042|1167.604 /1491.726 /2526.722|
| enabled |normal|156.551|11.420|1368.828|1891.745 /1366.917 /1891.411|
| enabled |withheld|145.927|38.222|2311.539|1608.164 /1852.144 /1297.935|
| disabled post-control |normal|281.117|9.458|1507.112|see raw prefix; cold guard FAILED|

Enabled normal passes original operational/native guards; enabled withheld passes peer/every-marker
2500ms and archive/offline-cold/no-reinjection, but FAILS local16ms p95 at38.222ms (max129.085ms).
It is not accepted. Original disabled2526.722ms marker failure remains failed; profile switching
cannot waive it. No release/qualification claim. The post-disabled control completes timed keys,
backlog, exact archive and same-writing comparison, then fails original15s offline-opening shell
assertion. Preserve it as a failed full journey, not a passing control or confirmed data loss.
No extended deadline, actor/profile reinjection or rerun. Final detailed shell state not captured.

Enabled ratios0.663166 against original normal and0.556890 against later normal timed prefix;
withheld0.597044 against original. These exceed predeclared>=20% material engineering signal,
qualified by19.1% disabled drift and the post-control cold failure. This supports investigating/
reusing the existing guarded selection path rather than inventing another equivalent cache, not
population precision or proof of which primitive consumes all time. Keys/receivers/modes are
not independent replications. All original raw gates/failures preserved. Fixed server/native clocks/
flags/assets/browser/date and independent key/marker reconstruction retain their stated limits.
All four exact own containers and own browsers absent. No profiles/factors/proofs archived.

Raw input decomposition narrows the new local tail. Actual beforeinput→DOM p95 is0.8ms andmax4.5ms
in enabled-withheld; offered-command→beforeinput upper p95 is37.522ms. For disabled normal, p95
is0.6ms after beforeinput versus6.292ms before. Large delays precede the input handler. That does
NOT prove renderer/Main is healthy: a busy renderer can delay delivery, and driver/CDP/event-loop
scheduling can too. Preserve end-to-end38.222ms gate failure, never substitute0.8ms for it.

Next clear bounded diagnostic: existing raw timing is insufficient to distinguish renderer work
from driver delay. Add browser event-timing/long-task metadata, input event creation/processing
stamps and a driver heartbeat to an isolated fictional same-profile run, arm only after unlock,
retain original workload/guards/gates and distinguish diagnostic overhead. No product mechanism
repair until evidence identifies the cause. In particular, do not blindly remove CPU yielding,
relabel input gates, skip global conflict checks or consume stale receivePage statuses. Existing
source cpuBudget uses an8ms wall-clock checkpoint and timer yield; its Worker cost is a separate
hypothesis, not established by this comparison. No release prep/sign/push/deploy/preview/phone/CUA.
