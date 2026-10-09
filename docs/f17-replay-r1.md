# F-17 replay buffers: cost accounting and bounded equivalence

The first buffer phase is committed and signature-verified as **`aa54be31`**. This final bounded
optimization round recommends **R3 + membership-repair eligibility + replay buffers** for the RC
combination. Main runtime/defaults remain unchanged while the candidate is preserved in scratch and
patches. [Protocol, source and evidence](./performance-experiments/2026-09-15-f17-replay-r1/README.md).

## What the added work costs

Four fixed instrumented application sessions separate the guarded prototype's catch-up work from
fresh-fork preparation. The following are means of session means in milliseconds per measured
preparation, 40 calls per component/block/session; they are diagnostic timings, not inferred speedups.

| Component | Early | Later |
| --- | ---: | ---: |
| Fresh document fork (selected) | 8.97 | 8.85 |
| Full fresh history, inclusive (selected) | 9.22 | 9.59 |
| Fresh complete stack copy (selected) | 0.07 | 0.41 |
| Native delta replay (guarded buffer) | 0.95 | 0.97 |
| Complete catch-up stack copy (guarded buffer) | 0.09 | 0.47 |
| Added full catch-up comparison (guarded buffer) | 11.03 | 10.75 |

The added comparison exceeds the saved fork's cost in this corpus. Full stack copying is relatively
small here, though it grows in the later block; this does not bound arbitrary long histories. Inclusive
fresh history includes its document/stack costs and must not be summed with them. Instrumentation
adds overhead; no percentiles are subtracted and no causal user-visible gain is inferred from these
component times. [Raw component analysis](./performance-experiments/2026-09-15-f17-replay-r1/cost-analysis.json).

## When replay establishes the preparation basis

The buffer owner retains the exact earlier accepted history, the exact next accepted native text
delta and the identity of the resulting accepted basis. Only full verified adoption authorizes
retirement; reacquisition consumes an exact owner registration. Remote delivery invalidates before
application/publication. Structural, metadata, undo/redo and unsupported text transitions reset the
spare. Pending dependencies and normalization-sensitive shapes remain excluded. No additional
application API exposes documents or the retained delta.

Within that restricted domain, native replay reproduces the next integrated state. Full detached
undo/redo range and selection-metadata copying restores non-wire history. Existing redone links
remain in the predecessor: pinned Yjs splitting preserves their offsets, merging excludes them,
and eligible text edits create no new links. Undo/redo paths still use the complete fresh fork.
Every existing writer/revision/slice check and **full post-admission canonical verification remains**.
The latter is not a justification for preparing against an incorrect basis before durable append.

The prototype's added full catch-up comparison is replaced by this invariant plus an idle transaction
fence. Any transaction on a retired buffer, even a no-op, refuses reuse before another append. The
observer detaches before authorized replay and on reset/failure/close; scope ownership still governs
borrowed-write cancellation and disposal. The original transactional-corruption test still passes.

**Detection is narrower for out-of-contract mutation.** Raw writes to private Yjs fields, nested payloads,
history stacks or the retained delta are not validated by replay. A deliberate same-clock content
mutation demonstrates this limit. Such access violates the private owner's sole-mutator contract;
it is not made safe by the later canonical check. The old added comparison covered some raw content
drift but did not verify history stacks/redone links either. This is a bounded source argument with
controls, not a generic Yjs validator or formal proof.
[Invariants and pinned-source reasoning](./performance-experiments/2026-09-15-f17-replay-r1/replay-invariants.md).

## Controls and application result

**227 tests /16 files pass**, including 100 new generated replay histories and 60 retained workspace
histories. The new histories compare integrated/deleted state, per-clock redone relations, full stacks,
nested-value detachment, native cold replay and complete subsequent undo/redo, including BMP text,
splits and deletions after multi-hop redone prefixes. Workspace controls cover selections, slicing,
refusal/retry/discard, remote/structural reset, pending state and write-lease close. Four faults are
caught: missing idle fence, premature retirement, omitted replay and shared mutable stacks.
TypeScript project compilation and scoped formatting pass. Initial tooling mistakes are retained
with corrections; no in-contract replay counterexample remains from this bounded campaign.
[Controls and limits](./performance-experiments/2026-09-15-f17-replay-r1/control-findings.md).

Six separate application sessions without component timers compare selected R3+repair against the replay
candidate. Both still have symmetric build-only preparation counters. Actual React Compiler builds,
Chromium 151, Pixel 7 settings /1280×900, CPU4, 20 days×15 cards and 400 Goals lines match the previous screen.
The fixed S/C/C/S ordinary and S/C Unicode sequence provides 480 measured keys /624 warmups. All exact
text, bounded undo/redo, corpus marker/count, edited-card cold-reopen and process-drain checks pass.
Each ordinary candidate block records 40 actual reuses; selected and Unicode record 0.

| Ordinary-text block | Selected median | Replay median | Paired median gain | Paired p95 gain |
| --- | ---: | ---: | ---: | ---: |
| Early | 45.90 ms | 36.20 ms | 21.1% | 21.5% |
| Later | 45.65 ms | 36.30 ms | 20.5% | 19.8% |

Latency cells are medians of session statistics; effects are median paired ratios. Both individual
ordinary pairs improve median and p95. Unicode fallback improves median 2.6% early and regresses 0.7%
later, with p95 improvements 9.3%/1.5%; one fallback pair does not establish a speedup. This candidate
still excludes **surrogates anywhere in the guarded history, including valid emoji**. Its ordinary
screen does not promise this gain for all user writing.
[All raw results and paired analysis](./performance-experiments/2026-09-15-f17-replay-r1/performance-analysis.json).

These are small descriptive host comparisons, with dependent keys, 40-sample p95 and JIT/GC/host drift.
The later block is not a verified deep-history stratum; corpus checks are not every-byte comparison.
Diagnostic and performance observations are separate. No samples are dropped or favorably rerun.
There is no phone, heap/GC, native Account or unchanged application-gate campaign in this phase.

## RC choice and remaining sequence

Recommend freezing the retained primitive-string preparation/value reuse, comparison scratch pool,
editor projection shortcut and membership-repair eligibility together with these Local replay buffers.
Keep full stack copying. Park the UI index, publication experiments and the first buffer comparison.
This ends the requested optimization round; incremental history mirroring, broader normalization,
incremental canonical verification and larger rewrites become later architectural work.

**Next is selected-combination integration and RC qualification**, including its relevant native
ownership/crash/close/memory and shared Account controls, then the unchanged application gate. This
is qualification of a chosen combination, not another search for a one-shot budget cure. The user
intends to accept the best supported combination for the RC with architectural/performance debt.
Any latency shortfall needs an explicit release disposition; a failing unchanged gate remains a
failing receipt. Account buffer activation is not included. After that disposition, resume the
command/campaign wrappers and remaining immutable release-validation work, then private Account
rehearsal and human recovery/adoption. [Decision](./performance-experiments/2026-09-15-f17-replay-r1/decision.md).

Release status is unchanged: 618 obligations; 263 files /2,121 dispositions (11 not applicable);
0 test-file /96 command /63 campaign unresolved. F-17 remains partial; last actual gate is 12.2/75.1 ms
desktop/CPU4 card p95 and 54.2 ms Android focus. This screen adds no release receipt or budget pass.
Previous packet, 52 personal/package/vector pins, root perspective, append-only record prefixes,
L-2 and main runtime/tests verify unchanged. All 10 browser sessions drain. This new phase is uncommitted.
