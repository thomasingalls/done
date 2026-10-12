# Immediate final authority application — 2026-10-13

**Implemented; the final queue hold is shorter, but typing p95 improvement is inconclusive.**
Signed contract `742e1c14`, exact runtime anchor `5c7ba18a`. This packet accompanies the implementation
commit; publication preparation follows separately. Physical account performance remains pending.

The complete final custody check now runs outside the editor FIFO for ordinary prepared receives.
Its private permission applies synchronously only when the same owner/context remains current and
both queues permit immediate application. It cannot wait in a queued job. Another storage request,
authority change or lifecycle invalidation revokes it before possible effects. A scheduling miss
uses the original complete queue-head check once; actual verification failure still refuses/closes.
Native settlement, journal-before-apply, durable remote dependencies, original frame order, grouped
projection verification and current undo history are retained. See the [implementation and writer
inventory](implementation.md) and [contract](../../account-final-apply-authority-design.md).

## Matched desktop result

[Prospective protocol](protocol.md): twelve fresh serial sessions, 7,200 independently scheduled
keys, CPU-4x, 75 ms request delay, same realistic workspace and 600-position backlog fixtures, both
run orders. Every session passed exact local/peer text, last-key undo/redo, export convergence and
cold offline replay. No failed sessions, favorable reruns or overlapping agent-owned test/build work.

**Post-run host-load qualification (2026-10-13).** The operator subsequently reported heavy VM use
during these tests. Its timing and resource use were not recorded, so overlap with individual runs,
the direction of bias and the size of any effect are unknown. Treat this and potentially earlier
host timing comparisons as subject to an unquantified external-load confound. Preserve every run;
do not attribute a regression to the VM or infer an otherwise hidden improvement. The correctness
outcomes and mechanism counts remain observations; timing differences do not establish an isolated
treatment effect. Publication preparation is proceeding at the operator's request, without a new
latency claim or resuming release qualification.

Event timestamp to first observing rAF p95, milliseconds (pre-paint proxy):

| Condition | Block 1 reference → candidate | Block 2 reference → candidate |
|---|---:|---:|
| Silent peer | 79.6 → 77.5 | 64.3 → 56.0 |
| Active peer | 78.2 → 89.1 | 82.9 → 70.2 |
| Backlog | 59.7 → 60.8 | 63.1 → 57.0 |

Active-peer contrasts are **+10.9 / −12.7 ms**, backlog **+1.1 / −6.1 ms**. Neither meets the
predeclared rule for claiming benefit in receiving conditions. Silent-peer p95 improves in both,
but only one trivial final receive occurred there: this does not establish the intended mechanism
as its cause. Do not pool keys or choose the favorable block. Within-session p99/max and long tasks
remain substantial; for example candidate maxima span 97–376 ms. The 16 ms goal is not met.

The mechanism is established separately:

- **157/161 early checks (97.5%) applied immediately.** Four queue-contention misses used one
  fallback each; 18 already-busy cases skipped speculation. Across 179 candidate final handoffs,
  157 (87.7%) used immediate application. No activity-version misses occurred naturally; focused
  controls exercise them. Only four extra final checks were paid in these typing windows.
- With active peer/backlog, successful synchronous application averaged **7.5–10.5 ms** per page.
  Reference queued final jobs averaged **35.1–46.0 ms**, including storage wait and full check.
  The candidate still makes that full read, outside the FIFO. Its ordinary fallback jobs averaged
  30.1–42.7 ms. These are mechanism timings, not estimates of equal-sized page effects or input p95.
- Total recorded final queue-held work in the four active/backlog candidate windows was
  0.38/0.59/0.38/0.62 seconds (immediate apply plus fallback jobs), versus 1.48/1.99/1.29/2.14 seconds
  in their reference windows. Completed page counts differ: report them alongside these totals.
- Backlog positions reached by the end of typing were **239 → 271** in block 1 and **283 → 267**
  in block 2. All later converged. This is not evidence of a repeatable catch-up throughput gain.
- Full authority-read medians across all checks are roughly **10–13 ms in both arms**. Do not compare
  these directly with previous-phase absolute figures: host/session variation and the obsolete
  final-function probe differ. Unchanged handler medians also vary (6.2–8.4 ms across sessions).

**Disposition:** retain the implementation in the working candidate for the proven shorter final
critical section and successful safety/progress controls. The preregistered rejection conditions
(consistent silent-peer harm, dominant fallback cost, stalled receive or correctness failure) did
not occur. There is no demonstrated receiving-condition p95 win and no justification here to call
input performance solved. The operator has since requested publication preparation, with the host-load
qualification above retained. The next useful attribution is the remaining synchronous
handler/render and main-thread stalls with the current candidate, not weaker authority checks or a
longer-lived ticket. `VITE_ACCOUNT_IMMEDIATE_RECEIVE=0` retains the original scheduling as a reference;
this comparison additionally removed the gate/tracking changes by loading the signed source files.

## Correctness and evidence

292 focused unit tests passed; one existing skip. Seven focused native Chromium tests passed.
TypeScript, changed-source lint/format, ordinary build, bundle budget and origin isolation passed.
The native authority boundary is held just before the complete early check; the existing separate
native transaction-completion hold is also retained. Controlled post-check owned read/clear tasks
prove fallback and refusal, respectively. No direct disk bypass after checking is represented as
something the memory gate can detect.

- [Per-session summary and contrasts](summary.json)
- [Source/build identities and fixture hashes](source-identity.json)
- [Evidence manifest](manifest.json) and [compressed numeric/check evidence](evidence.tar.gz)
- [Reproduction and analysis](probe/): imports the prior independent-cadence recorder and full
  correctness journey. Synthetic fixture paths are recorded by hash; reusable credentials, writing,
  browser/service snapshots and host process lists are excluded from the archive.

Two blocks are a bounded engineering comparison, not powered inference for small effects. This
fixture/desktop/emulation result does not establish physical phone latency, Android IME behavior,
physical screen presentation or performance on larger workspaces/history. Release validation stays
paused, and the separately agreed phone credential walkthrough remains pending.
