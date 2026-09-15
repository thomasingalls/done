# F-17: private Local selection-snapshot performance decision

Prospective protocol, September 15, 2026. The [functional integration](./f17-selection-integration.md)
is complete above signed `0c84e5cc`. This phase measures the existing private implementation;
it does not introduce another optimization or change an application budget.

## Question, comparators and scope

Does owner-bound selection-snapshot reuse materially reduce accepted Local command latency
relative to the existing Local handoff, while preserving the reference and signed-baseline
comparisons? Does its disposable application variant pass the unchanged browser latency gate?
The decision is whether default Local activation is justified. Account activation is separate.

- **B:** the complete runtime source at verified signed `0c84e5cc`, reference preparation.
- **R:** current runtime, explicit `reference`.
- **H:** current runtime, explicit `local-handoff` with generic metadata cloning.
- **S:** current runtime, explicit `local-snapshots`.

R/H/S use the same compiled module bytes, differing only in explicit constructor selection.
All four use the same installed dependency bytes, build settings, seed bytes and actor identity.
The source snapshot, dependencies, Node binary, bundles, protocol and harness are hashed before
timed execution. B is a complete signed source snapshot, not a mixture of selected old files.

This is a blocked, balanced engineering benchmark on this host, not a representative sample
of customers or devices. Assignment/exposure is a fresh process session; observations are
commands nested in sessions; analysis pairs sessions within each workload/block. The product
decision concerns Local preparation. No inference treats thousands of commands as independent
users or uses a significance test to authorize activation.

## Workloads and measurement

Retain the earlier 100,000-visible-character master document, reverse-inserted as 1,000, 10,000
or 100,000 Yjs items. Each of these three strata uses 24 warmup insertions and 64 measured
insertions, each a separate undo group. Add a fourth, explicitly deeper-history stratum:
10,000 seed items, 256 warmup groups and 64 measured groups. This exercises history growth
from 256 to 320 groups without inventing a synthetic metadata shortcut. All strata use one
master selection target. They do not qualify 1,000-group or 100-target capacity.

The continuous outcome is elapsed `performance.now()` time from text-port `input()` through
its accepted promise. Keep the existing controlled in-memory carrier, preparation instrumentation
and full runtime projection checks. This includes command preparation, admission, complete
comparison and publication; it excludes real journal encryption, IndexedDB and paint. Browser
measurement below covers the application gap. No timers are added inside production functions.

Outside each timed interval, assert exact master text, detached caret, revision, undo/redo depth
and one preparation. At session end, assert undo/redo and full canonical cold replay from the
carrier's database plus journal. Record every warmup and measurement, seed hash/item count,
encoded sizes, initial/final depths, bundle hash, exit/error output and session timestamps.
An untimed two-insertion smoke check per variant validates the harness before the fixed campaign.

## Order, analysis and useful-gain rule

Use four balanced orders **BRSH, RHBS, HSRB, SBHR**. Every variant occupies each period once
and each ordered adjacent pair occurs once. Rotate the four workload strata cyclically by
block. Sessions start in fresh processes, sequentially; build and other tests/profiles never
run concurrently with measurements. Fixed total: **64 sessions, 5,248 warmups and 4,096 measured
insertions**. Each session has a 120-second deadline; the campaign has a 30-minute deadline.

Report each session median and nearest-rank p95, all four paired ratios for every contrast,
median paired ratios, and the median of session summaries. Positive skew, JIT/GC effects,
history growth and host drift make within-session timings dependent. Four temporal blocks
give a repeatability check, not credible fleet-level confidence intervals. Sample count is a
bounded engineering budget, not a power calculation; population variance is unavailable.

Predeclared decisions:

1. Primary incremental benefit: S/H median paired session-median ratio <=0.90 in both the
   10,000-item shallow and deeper-history strata, and S faster in at least three of four blocks
   in each. The minimum useful improvement is 10% of whole accepted-command latency.
2. Preserve cumulative benefit: S/R and S/B satisfy the same 10%/three-block rule in the
   10,000-item shallow and 100,000-item strata.
3. Guardrails in every stratum: for S/H, S/R, S/B, H/R, H/B and R/B, neither median nor p95
   may regress by >10% in three or more of four blocks. Every semantic check must pass.
4. Run the unchanged application gate once after a semantically complete campaign, regardless
   of whether the relative-speed rule passes. A correctness/infra failure blocks activation
   and is retained; it is not a missing timing imputed as a fast or slow observation.
5. Default activation requires the functional evidence, all relative criteria and the entire
   application gate. Otherwise keep S private and F-17 open. Null, negative or mixed evidence
   does not authorize relaxing budgets or silently extending this phase to another optimization.

No outlier exclusion, optional stopping for speed, rerun of a valid disappointing session,
or replacement of a failed application measurement. Infrastructure failures may be diagnosed
separately; preserve original output and declare any subsequent changed protocol before use.
Console behavior remains part of the whole-command path; B/R writer-warning overhead is not
separated from runtime cost. Balanced order mitigates host drift but cannot eliminate it.

## Unchanged application gate and runbook

After freezing the protocol and helpers, build all variants outside timing and run untimed
semantic smoke checks. Freeze their outcomes, execute the fixed sequence, and analyze it
without changing criteria. Then materialize a disposable current-source/dependency checkout.
Apply exactly one runtime change there: pass `local-snapshots` at the default Local opener.
Assert every other source, dependency and manifest byte matches the frozen input.

Execute the existing `browser-application-latency` owned stage: six tests per project, desktop
and CPU-4x Android emulation, original workload, 120 trusted keys, one worker, zero retries,
original deadlines and all original numeric budgets. Card and compose p95 remain strictly
<16 ms. Keep all measurements even when a deferred budget assertion fails, plus owned receipts,
browser identity, output, source patch and process/server drain. No physical-phone campaign.

Check no runtime/default, adapter/registry or prior packet changed; preserve the 52 personal/vector
pins, append-only record prefixes and the other seat's progress. Retain raw artifacts under
ignored `test-results/f17-selection-performance/` and a lossless bounded documentation packet
under **350,000 bytes**. Large frozen inputs/bundles/build output may be retained by raw hash
reference; the packet must say which artifacts it embeds and which remain local.

Record outcomes before replacing the active L-1 checkpoint. The registered denominator and
96 command / 63 campaign obligations are unchanged by this study. Even a passing result is
not immutable release qualification, Account qualification, loaded-host timing closure, a
memory/forensic guarantee, an attribution of all saved time to metadata, or a phone/fleet claim.


## Recorded outcome

The [prospective four-variant comparison](./f17-selection-performance.md) completes **64 fresh
sessions, 5,248 warmups and 4,096 measured insertions**, with all exact text/caret/revision/history
and canonical cold-replay checks passing. B is complete signed `0c84e5cc`; R/H/S share current
runtime/dependency bytes with explicit reference, Local-handoff and Local-snapshot selection.
Four balanced orders cover three 100,000-character document item-count strata plus a deeper
10,000-item history growing from 256 to 320 undo groups. The memory carrier excludes encryption,
IndexedDB and paint; this is a host engineering comparison, not fleet qualification.

The snapshot increment over H is **2.9%** at 10,000 items with shallow history and **10.3%** with
deeper history. The prospective rule requires >=10% in both, so the relative gate **fails**.
Cumulative S/R and S/B benefits and all median/p95 regression guardrails pass. At 100,000 items
S is 0.7% slower than H by median paired ratio; the substantial cumulative gain comes from the
existing handoff. Preserve the mixed result rather than declaring a broad snapshot speedup.

The unchanged application gate runs **once** on a disposable current-source build with exactly
one runtime patch selecting `local-snapshots` at the Local opener. All twelve cases execute and
all thirty measurement rows are retained; browser, process group and localhost server drain.
Card p95 is **12.2/75.1 ms desktop/CPU-4x Android** against <16 ms. Android focus is
**54.2 ms** against <50 ms; both Android budgets fail. The remaining budgeted metrics pass. The failure is reported through the deferred afterAll budget hook,
not a navigation correctness failure. The earlier H observation (12.9/63.5 ms) is a separate,
unpaired run; its difference from this run is not a controlled browser treatment effect.

Default Local and Account retain the reference. No runtime, adapter, manifest, census or registry
changes occur in this phase. F-17 stays partial; general integration remains **263 files / 2,121
dispositions (11 not applicable)** and unresolved obligations remain **0 test-file / 96 command /
63 campaign**. Seven preceding evidence packets, 52 personal/vector pins, append-only prefixes
and L-2 are preserved. The packet embeds all command observations, helper/protocol bytes,
application measurements/receipts and preservation data; large pinned inputs and bundles remain
under ignored local test-results with hashes. No personal app, phone, relay or deployment changes.

Next: Review and sign the accumulated bounded phases, then profile the snapshot application variant to separate remaining document/history fork, full comparison and publication costs before choosing another repair. Retain the unchanged budgets and failed measurements.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-performance/README.md).

| Seed items / history | Signed B | Current R | Handoff H | Snapshots S |
| --- | ---: | ---: | ---: | ---: |
| 1,000 / 24–88 groups | 12.41 | 12.57 | 12.26 | 11.84 |
| 10,000 / 24–88 groups | 21.06 | 21.21 | 18.53 | 18.06 |
| 100,000 / 24–88 groups | 92.34 | 94.57 | 63.85 | 64.48 |
| 10,000 / 256–320 groups | 22.74 | 22.81 | 20.51 | 18.48 |

Values are medians of four session medians, in milliseconds. Decisions use the retained paired
ratios, not ratios of this summary table. Raw within-session timings are dependent.
