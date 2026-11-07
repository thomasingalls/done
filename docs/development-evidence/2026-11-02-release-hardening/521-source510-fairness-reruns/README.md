# Phase 521 — source510 fairness reruns

2026-11-07. Operator-scoped rerun after518/519, on exact plain510. Frozen specs, fixtures, analyzers, gates, deadlines, browser and resource bounds are unchanged. No profiler or new observer was added. Original status/presentation/HTTP observations are the frozen apparatus.

**Result:** 3/3 attempts pass, 3 declared replicates; noise retries 0. One failed replicate fails its cell. Every attempt remains retained.

| Run | Applicable frozen predicates | Deep ms | Input p95 ms | Peer p95 ms | Goals beforeinput / rAF p95 ms | Cold max ms | Saved end baseline revision / history |
|---|---|---:|---:|---:|---|---:|---|
| 521-r1-fairness | pass | — | 4.500 | 1107.100 | — / — | 2872 | private-profile-Q0: 1/baseline-plus-suffix; private-profile-Q1: 0/complete |
| 521-r2-fairness | pass | — | 6.800 | 1343.000 | — / — | 3294 | private-profile-Q0: 1/baseline-plus-suffix; private-profile-Q1: 0/complete |
| 521-r3-fairness | pass | — | 9.100 | 927.100 | — / — | 2784 | private-profile-Q0: 1/baseline-plus-suffix; private-profile-Q1: 0/complete |

All saved profiles were inspected **after** the timed wrapper exited, on disposable copies, using518’s native digest and metadata seam. Original storage-file inventories remain byte-identical and native before/after digests agree. No original profile was opened by the inspector and no app was loaded during inspection. Only profiles actually saved by the harness are reported; ephemeral peer/background end snapshots are not added or invented. These endpoint observations do not timestamp reduction during the measured interval.

The operator already carried21runs fromseven cells citing518. 9/15 newly scoped journeys are now complete; 6 remain. The post-reduction typing/full-reauth frequency and continued-typing input/peer cost stays **unmeasured debt**; end-state inspection does not measure that mechanism. No app, gate, limit, format, sender default or release flag changed. All failures from earlier phases stay immutable.

No publication, deployment, staging or signed-source claim. Continue the declared bounded sequence.
