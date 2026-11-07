# Phase331 — repaired single-writer and deep controls

All four declared controls pass functional/whole-archive/Undo/cold checks. Reused exact329repaired assets, no new build or app change. Device1 (first actor of pair) writes120keys/500ms plus3markers, one run per policy at0ms on the original short sender fixture. Latency predicates remain separate; one sample is not a three-replicate cell or release credit.

| Policy | Peer p50 ms | Peer p95 ms | Every marker ms | Input p95 ms | Positions/100keys | Failed predicates | Cold |
|---|---:|---:|---|---:|---:|---|---|
| coordinated-2000 | 659.448 | 824.602 | 674.969, 653.293, 823.019 | 3.586 | 97.500 | none | both exact |
| reference | 409.115 | 759.183 | 473.624, 395.572, 422.728 | 4.420 | 99.167 | none | both exact |
| immediate-inflight | 344.186 | 563.950 | 420.670, 418.445, 519.363 | 3.169 | 100.000 | none | both exact |

The repaired E1B1P1 deep0control reaches700at9.523s and1,025at14.585s; all1,025are committed by30s. Source accepted before closing, no receive failures, peer excluded from Undo and original cold exactness all pass. No profiler. [Raw summary](./summary331.json), [all single-writer details](./single331-analysis.json).

Operator amendment: a declared negative control is expected to fail; an unexpected pass stops. Harness preconditions can be fixed/rerun while preserving attempts. App refusal, owner closure, real archive difference or cold failure stops; latency misses fail predicates/cells and do not stop. No negative control or harness failure here. Phase329/330old failures remain unchanged. All original gates/security checks/limits remain, no default/hardening/landing/release work or acceptance credit.

Every timed run has5s external host CPU/top-process logs. No heavy parallel work. Source/assets/server/fixture/apparatus maps verified,1552canonical inputs unchanged, real index empty. Exact inert copies are indexed; compiled assets, profiles, credentials and databases remain outside this documentation pack. [Protocol](./PROTOCOL331.md), [independent check](./independent331.json), [index](./evidence-index.json).
