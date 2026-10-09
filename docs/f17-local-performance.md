# F-17: Local preparation performance and activation decision

## Prospective protocol

Freeze this protocol and the measurement harness before recording timings. The decision is whether
to activate the private Local preparation handoff by default. Account remains separately gated.
The preceding functional checkpoint passes reference, generated, native and mutation controls;
performance does not substitute for those controls.

Compare three implementations: **B**, all runtime source from signed `0c84e5cc`; **R**, the current
functional checkpoint with `reference`; **C**, that same checkpoint with `local-handoff`. Build B
from a complete signed source snapshot, not a partial substitution of two modules into current code.
Use identical installed dependencies, build settings, identity and seed bytes. Retain source,
dependency, runtime and bundle hashes. The workspace's default opener remains unchanged while testing.

The controlled Node benchmark measures elapsed milliseconds from calling one text insertion to its
accepted promise resolving, including private preparation, memory-carrier append, canonical promotion
and publication. It does not measure encryption, IndexedDB, browser scheduling, rendering or paint.
All three synthetic strata have 100,000 visible master-text characters, constructed as 1,000, 10,000
or 100,000 reverse-inserted Yjs items. These stress strata are not a distribution of personal writing.
Each fresh process creates a new workspace, performs 24 warmup insertions and 64 measured insertions,
each with a distinct command group and one master selection target. History therefore grows from
24 to 88 groups during measurement; this is not a deep-history capacity test. Record actual item
counts, encoded sizes, history depths and every warmup and measurement duration.

Use six blocks with variant orders BRC, RCB, CBR, CRB, RBC and BCR. Rotate item-stratum order by block
over the three cyclic permutations. Each variant/stratum session runs in a fresh Node process; no
other tests, browser runs or profiles run concurrently. Build outside timing. The assignment unit is
the session's implementation, the observation is an accepted command, and the analysis unit is the
paired block within a stratum. Host, JIT, GC and sequential-history dependence preclude treating the
3,456 measured commands as independent experimental replicates. Report six session medians and
nearest-rank p95s per variant/stratum, their medians and paired ratios; do not manufacture population
confidence intervals or physical-device claims from this one host.

Outside timing, check exact text, caret, revision advance and undo depth after each insertion. At
session end check undo/redo, replay all captured durable bytes in a fresh document and compare the
complete canonical state. Assert that only C registered the private handoff and that every insertion
prepared once. Any semantic failure invalidates performance acceptance. Keep partial rows/errors.
Stop at six blocks, or after the fixed 30-minute overall deadline or a session's 120-second deadline.
Do not discard outliers or repeat an unfavorable valid observation. An infrastructure failure may be
diagnosed separately, with the original evidence retained; it is not a passing sample.

For this bounded engineering decision, require C's median paired session-median ratio to be at most
0.90 against **each** of R and B in **both** the 10,000- and 100,000-item strata, and C faster in at
least five of six blocks in each comparison. Ten percent is the prospective minimum worthwhile
whole-command improvement, not a product budget or significance threshold. In every stratum, refuse
activation if C's median or p95 is more than 10% slower than either comparator in four or more blocks.
Apply the same regression guardrail to R versus B: sharing command code must not quietly regress the
default reference. Mixed results mean no activation in this phase, not more sampling.

Regardless of the relative benchmark outcome, run the existing owned
`browser-application-latency` selection once on a disposable candidate snapshot. Its sole runtime
variant adds `local-handoff` to the Local opener; retain that exact patch. Preserve the original
adapter, seven cases per project, desktop/CPU-4x Android projects, production build, corpus,
120 trusted keys, measurement contract, numerical budgets, one worker, zero retries and deadlines.
Capture all measurement artifacts, stdout, case report, receipts and process drain, including failure.
The existing strict typing budget is <16 ms on both projects; all other existing budgets also apply.
No simultaneous profiler and no application-gate rerun to seek a pass. Older application measurements
provide context only; they are not a counterbalanced estimate of this candidate's browser speedup.

Default Local activation requires functional preservation, the relative criteria above, **and** a
fully passing unchanged application gate. If the gate fails, retain the candidate privately and leave
F-17 open. Identify the next bounded decision from the evidence instead of broadening this phase into
another optimization. A pass would authorize only Local activation and its focused regressions, not
Account activation, deployment, physical-device qualification or immutable release qualification.

## Retention and boundaries

Keep a bounded evidence packet (250,000 bytes before any exception), with lossless compressed logs,
raw observations, protocol/harness, hashes and reconstructable source variants. Large duplicate
inputs may use verified references to the preceding functional packet; record raw local output paths
and hashes. Preserve append-only records from their current working-tree bytes, all 52 personal/vector
pins, the historical L-2 section and the preceding functional packet. Personal browser, installed
package, server, routing, recovery files and unrelated root files remain untouched. The 96 command /
63 campaign integration obligations and immutable aggregate are not reduced by this performance work.


## Observations and decision

The frozen protocol and harness preceded all timings. All six blocks completed: 54 fresh-process
sessions, 1,296 warmups and 3,456 measured insertions. Text, caret, revision, one-preparation,
undo/redo and complete durable-replay checks passed. The signed baseline used its entire runtime
source snapshot; current R and C used the same bundle with different private constructor selections.

Values below are medians of the six session medians, in milliseconds. Improvement uses the median
of paired block ratios, so it is not necessarily the ratio of these displayed aggregate numbers.

| Integrated seed items | Signed B | Current reference R | Candidate C | C gain vs R / B |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 12.71 | 12.64 | 12.20 | 3.5% / 3.8% |
| 10,000 | 21.19 | 20.76 | 18.59 | 10.2% / 12.0% |
| 100,000 | 91.48 | 92.61 | 64.50 | 29.7% / 29.0% |

C was faster in all six medium/large blocks against both comparators. All prospective median/tail
regression guardrails pass, including R versus B. The 10,000-item result clears the 10% rule narrowly;
this is engineering evidence on a synthetic workload, not a precise population effect. A p95 ratio
exceeded 1.10 in one medium block against each comparator, and R did so once against B in the small
stratum; none reaches the predeclared four-block regression rule. All outliers remain.
The reference implementations emit Yjs writer-renewal warnings while applying the command update;
C does not in this probe. Their logging cost remains in the timings and stderr is retained. The
comparison does not isolate logging, fork removal or any other component's individual causal effect.

The unchanged owned application gate then ran once on the candidate-only Local opener variant:
**failed**, exit 1, all processes drained, 130.777 seconds of stage execution. All 30 measurement
rows survive, with 120 observations reported for each typing distribution. Card typing is **12.9 ms
p95 desktop / 63.5 ms CPU-4x Android** against **<16 ms**. Compose is 2.7/10.1 ms and focus is
7.5/43.2 ms; cold/warm startup, content replay and budgeted navigation also meet their limits.
The intentional keyboard navigation animation's settled time remains descriptive, as in the original
suite. The collected Android typing-budget error fails the final afterAll hook; it is not a navigation
failure. The runner correctly issues a failed receipt rather than crediting passing case dispositions.

**Protocol correction:** the prospective prose says seven tests per project. The existing source and
frozen stage declare **six per project / twelve total**, and all twelve ran. The prose count was a
transcription error. The exact adapter, workload, measurement contract, test cases, budgets, worker,
retry and timeout settings were unchanged. The original protocol bytes remain archived.

**Decision: do not activate by default.** The relative command criterion passes, but the unchanged
application gate fails. Preserve the functional candidate privately and leave F-17 partial. The last
reference application observation remains 15.2/69.4 ms; the new 12.9/63.5 ms observation is explicitly
for the private candidate. Different browser runs are not paired evidence of a quantified speedup.
No product source or test-adapter changes were made in this performance phase.

Next, a bounded diagnosis of the private candidate's remaining browser cost can determine whether
retained history copying or another path justifies a further repair. Earlier reference profiles are
not fresh attribution for C. Do not expand this phase into another optimization or rerun the budget
gate seeking a pass. Wrapper certification and the remaining input/output/owner/oracle/style/prose
work still precede the immutable aggregate; 96 command and 63 campaign obligations are unchanged.
Account activation, physical devices and deployment remain separate.

[Evidence and reproduction](./account-conformance-runs/2026-09-14-f17-local-performance/README.md).
