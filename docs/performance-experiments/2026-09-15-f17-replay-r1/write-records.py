from pathlib import Path
r=Path('/Users/thomasingalls/.codex/worktrees/c030/done')
report='''# F-17 replay buffers: cost accounting and bounded equivalence

The first buffer phase is committed and signature-verified as **`aa54be31`**. This final bounded
optimization round recommends **R3 + membership-repair eligibility + replay buffers** for the RC
combination. Main runtime/defaults remain unchanged while the candidate is preserved in scratch and
patches. [Protocol, source and evidence](./performance-experiments/2026-09-15-f17-replay-r1/README.md).

## What the added work costs

Four fixed instrumented application sessions separate the guarded prototype's catch-up work from
fresh-fork preparation. The following are means of session means in milliseconds per measured
preparation,40calls per component/block/session; they are diagnostic timings, not inferred speedups.

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

**227tests /16files pass**, including100new generated replay histories and60retained workspace
histories. The new histories compare integrated/deleted state, per-clock redone relations, full stacks,
nested-value detachment, native cold replay and complete subsequent undo/redo, including BMP text,
splits and deletions after multi-hop redone prefixes. Workspace controls cover selections, slicing,
refusal/retry/discard, remote/structural reset, pending state and write-lease close. Four faults are
caught: missing idle fence, premature retirement, omitted replay and shared mutable stacks.
TypeScript project compilation and scoped formatting pass. Initial tooling mistakes are retained
with corrections; no in-contract replay counterexample remains from this bounded campaign.
[Controls and limits](./performance-experiments/2026-09-15-f17-replay-r1/control-findings.md).

Six separate **uninstrumented-cost** application sessions compare selected R3+repair against the replay
candidate. Both still have symmetric build-only preparation counters. Actual React Compiler builds,
Chromium151, Pixel7settings/1280×900, CPU4,20days×15cards and400Goals lines match the previous screen.
The fixed S/C/C/S ordinary and S/C Unicode sequence provides480measured keys/624warmups. All exact
text, bounded undo/redo, corpus marker/count, edited-card cold-reopen and process-drain checks pass.
Each ordinary candidate block records40actual reuses; selected and Unicode record0.

| Ordinary-text block | Selected median | Replay median | Paired median gain | Paired p95 gain |
| --- | ---: | ---: | ---: | ---: |
| Early | 45.90 ms | 36.20 ms | 21.1% | 21.5% |
| Later | 45.65 ms | 36.30 ms | 20.5% | 19.8% |

Latency cells are medians of session statistics; effects are median paired ratios. Both individual
ordinary pairs improve median and p95. Unicode fallback improves median2.6% early and regresses0.7%
later, with p95 improvements9.3%/1.5%; one fallback pair does not establish a speedup. This candidate
still excludes **surrogates anywhere in the guarded history, including valid emoji**. Its ordinary
screen does not promise this gain for all user writing.
[All raw results and paired analysis](./performance-experiments/2026-09-15-f17-replay-r1/performance-analysis.json).

These are small descriptive host comparisons, with dependent keys,40-sample p95 and JIT/GC/host drift.
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

Release status is unchanged:618obligations;263files/2,121dispositions(11not applicable);
0test-file/96command/63campaign unresolved. F-17 remains partial; last actual gate is12.2/75.1ms
desktop/CPU4card p95 and54.2msAndroid focus. This screen adds no release receipt or budget pass.
Previous packet,52personal/package/vector pins, root perspective, append-only record prefixes,
L-2 and main runtime/tests verify unchanged. All10browser sessions drain. This new phase is uncommitted.
'''
replacements = {
"**227tests /16files pass**":"**227 tests /16 files pass**", "including100new":"including 100 new", "and60retained":"and 60 retained", "Chromium151":"Chromium 151", "Pixel7settings/1280×900":"Pixel 7 settings /1280×900", "CPU4,20days×15cards":"CPU4, 20 days×15 cards", "and400Goals":"and 400 Goals", "provides480measured keys/624warmups":"provides 480 measured keys /624 warmups", "records40actual":"records 40 actual", "record0":"record 0", "median2.6%":"median 2.6%", "regresses0.7%":"regresses 0.7%", "improvements9.3%/1.5%":"improvements 9.3%/1.5%", "dependent keys,40-sample":"dependent keys, 40-sample", "unchanged:618obligations;263files/2,121dispositions(11not applicable);":"unchanged: 618 obligations; 263 files /2,121 dispositions (11 not applicable);", "0test-file/96command/63campaign":"0 test-file /96 command /63 campaign", "is12.2/75.1ms":"is 12.2/75.1 ms", "desktop/CPU4card p95 and54.2msAndroid":"desktop/CPU4 card p95 and 54.2 ms Android", "packet,52personal/package/vector":"packet, 52 personal/package/vector", "All10browser":"All 10 browser", "preparation,40calls":"preparation, 40 calls", "Six separate **uninstrumented-cost** application sessions":"Six separate application sessions without component timers"
}
for a,b in replacements.items():report=report.replace(a,b)
(r/'docs/f17-replay-r1.md').write_text(report)
outcome = """

## 2026-09-15 — F-17 replay cost accounting and bounded equivalence

The first buffer phase is signed and signature-verified as `aa54be31`. Four fixed instrumented application sessions /320 measured keys separate the added comparison (11.03/10.75 ms early/later) from native replay (0.95/0.97 ms), full catch-up stack copying (0.09/0.47 ms) and the selected fresh document fork (8.97/8.85 ms). These are component means, with inclusive scopes distinguished; no quantile subtraction or causal speedup is inferred from them.

The replay variant replaces only the prototype's added full comparison with an exact-predecessor/native-delta invariant and an idle transaction fence. Every existing full post-admission canonical comparison, writer/revision/slice check and complete detached history copy remains. Transactional drift still refuses before another append. Raw private-field/payload/stack/delta mutation is explicitly outside the sole-mutator contract and not validated by replay; a directed test demonstrates that limitation. The later canonical check is not used to justify a wrong pre-write basis. Pinned-source reasoning covers normalization exclusions, text-only transitions, old redone links, reset and disposal.

All 227 tests /16 files pass, including three new cases /100 generated replay histories (seed 171511) and the retained 60 workspace histories (171510). The new histories compare integrated/deleted state, per-clock redone relations, full stacks, nested-value detachment, native replay and later complete undo/redo. Four faults detect a missing idle fence, premature retirement, omitted replay and shared mutable stacks. TypeScript project compilation and scoped formatting pass. The failed formatter path and ineffective initial compiler invocation survive with corrections; no in-contract counterexample remains from this bounded campaign.

Six separate application sessions /480 measured keys /624 warmups pass text, bounded undo/redo, marker/count corpus checks, edited-card reopen and owned process drain. Both ordinary pairs favor replay: median paired gains 21.1% early /20.5% later, with p95 gains 21.5%/19.8%. Medians of session medians move 45.90→36.20 ms early and 45.65→36.30 ms later. Every ordinary candidate block actually reuses 40 histories; selected and Unicode reuse zero. The Unicode fallback median improves 2.6% early and regresses 0.7% later; its p95 improves 9.3%/1.5%. All ten diagnostic/performance sessions remain separate and retained. One host, two ordinary pairs, dependent keys and an unverified later history depth limit inference. Surrogates anywhere in the guarded history, including valid emoji, still disable reuse.

Recommend R3 + repair eligibility + replay buffers for the RC combination. Park the UI/publication candidates and the first guarded buffer variant. At the operator's direction this closes the optimization round: choose/freeze the combination, integrate it and qualify native ownership/crash/close/memory, shared Account effects and the unchanged application gate. Larger rewrites, incremental stack mirroring, broader normalization and incremental canonical verification become later work. Record any accepted latency shortfall explicitly as release debt without changing a failing receipt. This phase does not activate defaults or complete RC qualification.

Main runtime/tests and release counts remain unchanged: 618 obligations; 263 files /2,121 dispositions (11 not applicable); 0 test-file /96 command /63 campaign unresolved. F-17 remains partial; last actual gate remains 12.2/75.1 ms desktop/CPU4 card p95 and 54.2 ms Android focus. Both source/build freezes, the preceding packet, 52 personal/package/vector pins, root perspective, append-only prefixes and L-2 verify unchanged. Personal app/server, phone, relay and deployment remain untouched. New phase is uncommitted. [Assessment](./f17-replay-r1.md); [source and evidence](./performance-experiments/2026-09-15-f17-replay-r1/README.md).
"""
# Record the completed outcome before rewriting the active slice.
for file in ['docs/completed.md','docs/performance.md']:
 with (r/file).open('a') as f:f.write(outcome)
with (r/'docs/decisions.md').open('a') as f:f.write("""

## 2026-09-15 — Recommend replay buffers and close the F-17 optimization round

Retain R3 preparation/value-string reuse, comparison pooling, editor projection shortcut and membership-repair eligibility; recommend adding Local replay buffers to the RC combination. Exact predecessor/accepted-delta ownership, conservative normalization and full copied history establish the restricted preparation basis. An idle transaction fence preserves pre-append transactional drift refusal. Raw private-field mutation remains outside that contract; every preexisting full canonical comparison stays unchanged. [Argument, controls and measured result](./f17-replay-r1.md).

Four diagnostic sessions identify the added comparison as about 11 ms against about 9 ms for a fresh document fork, with replay about 1 ms and relatively small stack copying in this corpus. The separate fixed six-session application screen favors replay in both ordinary pairs: median paired gains 21.1% early /20.5% later and p95 gains 21.5%/19.8%, with all correctness/drain checks passing. Emoji-bearing histories still use fresh forks. This is descriptive incremental evidence, not additive cumulative gains or a passing release budget.

The operator explicitly ends optimization exploration after this round and intends to accept the best supported combination for the RC while deferring a larger rewrite. Next choose/freeze and integrate this combination, then qualify its relevant native ownership/crash/memory/shared Account effects and run the unchanged application gate. Record any accepted performance shortfall as explicit release debt; do not relabel failing evidence. UI/publication alternatives, incremental history copying, wider normalization and incremental canonical verification stay out of this release integration. Defaults, F-17's partial status, release counts and immutable receipts remain unchanged in this phase.
""")
p=r/'docs/progress.md';s=p.read_text();a=s.index('**Just completed.**');b=s.index('\n\nThe preceding [publication experiment]',a)
s=s[:a]+"""**Just completed.** The first buffer phase is signed and signature-verified as `aa54be31`. [Replay cost accounting and bounded equivalence](./f17-replay-r1.md) passes **227 tests /16 files**, including 100 new generated histories plus 60 retained workspace histories, TypeScript and four faults. Four diagnostic sessions measure about 11 ms for the added comparison, 1 ms replay and 9 ms fresh document fork, with stack copying about 0.1/0.4–0.5 ms early/later. Six separate application sessions /480 measured keys pass correctness, actual reuse/fallback receipts and drain. Ordinary paired median gains are **21.1% early /20.5% later**, p95 21.5%/19.8%; the Unicode fallback passes with mixed small median changes. Recommend R3 + repair eligibility + replay buffers for RC integration. Every existing full canonical check stays unchanged. Raw private-field mutation remains outside the sole-mutator contract, and emoji-bearing histories still fall back. The operator ends optimization exploration here. Main runtime/defaults, counts and the last actual gate remain unchanged; this new phase is uncommitted."""+s[b:]
a=s.index('**Next bounded phase.**');b=s.index('\n\nThe eight-phase commit backlog',a)
s=s[:a]+"""**Next bounded phase.** Choose/freeze the recommended combination and integrate it for RC qualification: R3 + membership-repair eligibility + Local replay buffers, with complete history copying and existing full verification. Carry its ownership/reset/disposal/normalization controls into the maintained test suite. Park the optional UI/publication and guarded-buffer alternatives. This is the end of the requested optimization search; no incremental history or larger rewrite precedes this selection.

**Following phases.** Qualify the integrated combination's native ownership/crash/close/memory and shared Account effects, then run the unchanged application gate. Give any accepted latency shortfall an explicit release debt/disposition rather than rewriting a failing receipt. Account buffer activation is excluded. Resume the 96 command /63 campaign wrappers and remaining qualification repairs before the immutable aggregate, private Account rehearsal and human recovery/adoption milestones. Broader normalization and architectural rewrites are later work; no release receipt is claimed."""+s[b:];p.write_text(s)
p=r/'docs/release-validation-execution.md';s=p.read_text();a=s.index('The [persistent text-history buffer experiment]');b=s.index('\n\nOnce the application gate',a)
old=s[a:b];old=old[:old.index('New phase is uncommitted.')]+"The phase is signed and signature-verified as `aa54be31`; release counts/defaults/receipts remain unchanged."
new="""

The [replay cost/equivalence phase](./f17-replay-r1.md) completes the operator's final optimization round. Four instrumented sessions measure the added comparison at about 11 ms, native replay at 1 ms and fresh document fork at 9 ms; complete stack copying is about 0.1 ms early /0.4–0.5 ms later. The restricted exact-predecessor/native-delta invariant and idle transaction fence replace only the prototype's added comparison. All existing full canonical checks remain. The raw private-field mutation boundary is explicit. Controls pass 227 tests /16 files, 100 new generated histories plus 60 retained workspace histories, TypeScript and four faults. Six separate application sessions /480 measured keys pass semantics, actual reuse/fallback and drain; ordinary paired median gains are 21.1%/20.5% early/later and p95 gains 21.5%/19.8%. Emoji-bearing histories still fall back, with mixed small fallback median changes.

Recommend R3 + repair eligibility + replay buffers for the RC combination; park UI/publication and the first buffer comparison. Next choose/freeze and integrate this combination, then qualify native ownership/crash/close/memory/shared Account effects and run the unchanged application gate. This ends optimization exploration. An accepted latency shortfall requires explicit release debt/disposition, not a relabeled passing receipt; broader normalization, incremental history/verification and larger rewrites are later work. This new phase is uncommitted. Main runtime/defaults, F-17's partial status, release counts and the last actual gate remain unchanged."""
s=s[:a]+old+new+s[b:];p.write_text(s)
with (r/'docs/f17-buffers-r1.md').open('a') as f:f.write("""

**Subsequent checkpoint.** This phase is now signed and signature-verified as `aa54be31`. Its next cost-accounting/replay step is complete in [the replay assessment](./f17-replay-r1.md); the original guarded measurements and archived packet remain unchanged.
""")
print('Assessment, append-only outcomes/decision and active/release checkpoints updated')
