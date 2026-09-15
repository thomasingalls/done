# done — Active slice

**This file is disposable, and that is its function.** It holds the slice of work that is active right now
and nothing else. Nothing of record value lives here: decisions go to [decisions.md](./decisions.md), and
closed work goes to [completed.md](./completed.md).

## How this file works

**Everything below the rule is replaced wholesale when the active slice changes.** Not amended, not struck
through, not archived in place — deleted and rewritten. A working document that accretes is a working
document nobody reads, and the two files that _are_ records already exist.

**One thing must happen first.** When a slice closes, write its outcome into
[completed.md](./completed.md) _before_ rewriting this file. That ordering is the only thing protecting
the record, because after the rewrite the evidence is gone.

**It grows a tree when the slice deepens.** If work goes deeper without the slice changing — an item turns
out to have four parts, one of which has three — nest it. Nesting is free and says something true about
the shape of the work. What is _not_ allowed is a second top-level slice **inside one document**: two active
slices in one document means it has stopped answering the question it exists to answer, and one of them is
really next-up.

**The file is a stream of documents, one per seat, separated by `---` as YAML separates its own.** The
original rule assumed one slice because it assumed one worker, and that assumption broke the first time two
gates ran in parallel seats — `L-1` in its worktree and `L-2` in another, neither waiting on the other,
neither with anywhere honest to say so. A seat owns its own document and edits nothing below or above the
separator, which is what keeps the wholesale-replacement rule intact per document and keeps two live sessions
out of each other's paragraphs. Each document opens with its keys, because once there is more than one the
first question is always *whose is this, and where is it running* — gate, seat, branch, status, and what
blocks it.

**One document per seat is a ceiling, not a target.** A second document is a claim that two gates genuinely
do not block each other, checkable at `action-tree.md`'s prerequisites — not a place to park work that is
really next-up. When a seat's slice closes, its outcome goes to [completed.md](./completed.md) and **its
document is deleted**, separator and all.

**Status vocabulary**, deliberately small: **not started** · **in flight** · **done** · **blocked** (which
must name what it is blocked on).

**Being wrong here is cheap.** This file is allowed to lag by a day. It is not allowed to describe a slice
that is no longer active.

---


## Active slice: General validation-runner integration — release qualification (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: in flight
blocks_on: application latency repair and budget disposition; remaining command/campaign and immutable qualification work
debts: consult docs/review/remediation/debts.json
updated: 2026-09-15
```

**Roadmap checkpoint.** All catalogue and test-file adapters are integrated. This F-17 work
addresses the failing application-latency gate. The comparison is complete and default activation
is refused; F-17 remains open. The 96 command / 63 campaign wrapper obligations and remaining
qualification repairs also precede the immutable aggregate. [Execution overview](./release-validation-execution.md#checkpoint-and-remaining-sequence).
The record audit is signed `0c84e5cc`; the subsequent F-17 backlog is now signed through `e2d42fac`.

**Just completed.** Round three is signed and signature-verified as `55ab217e`. The [fourth exploratory round](./f17-exploration-r4.md) implements shared per-snapshot UI card indexing and verifies its placement in the actual React Compiler build. All **49 focused cases + TypeScript**, including 50 generated publication histories, pass; both deliberate faults are caught. All **six timing sessions /480 measured keys** pass text, bounded undo/redo, cold reopen and closure. Ordinary paired median gains are **0.3% early /2.7% later**; later p95 improves 4.9%, but early p95 worsens 8.0% in both pairs. The explicit-Unicode guard also passes with mixed timing. Preserve the tested UI patch as an optional component; keep round three's preparation + pool + editor + primitive value-string combination as the selected baseline. The mixed tail result drives that decision, not a minimum gain threshold. No CPU/allocation campaign, GC/heap claim or full gate runs this round. Main runtime/tests/defaults and release counts remain unchanged. The evidence and checkpoint are preserved with this phase. Paused at the operator’s request; the next phase below has not started.

**Previous qualification attempt.** The [private Local snapshot comparison](./f17-selection-performance.md)
completes 64 fresh sessions / 5,248 warmups / 4,096 measurements with all semantic checks passing.
Snapshot reuse improves the deeper-history case by 10.3% over the existing handoff, but the
shallow 10,000-item gain is 2.9%; the required >=10% in both strata is missed. All regression
guardrails and cumulative reference/signed-baseline benefits pass. The unchanged application gate
runs once: **12.2/75.1 ms desktop/CPU-4x Android card p95**, with Android still over <16 ms;
Android focus is also over <50 ms at 54.2 ms. Remaining budgeted metrics pass. All twelve cases and thirty measurement rows are retained, with
browser/process/server drain. Default Local and Account retain the reference; F-17 remains partial.

The preceding functional integration remains verified: 86 workspace cases, 215 owned cases,
both 100-history native campaigns, ten workspace catalogue cases/four mutations and five unit
faults. A synchronous startup cleanup gap was fixed. The final full repeat passes 99 files /
1,141 tests; the intervening Account-liveness/position-decision timeouts remain at loaded-host
qualification. This performance phase does not rerun those full functional campaigns.

The physical Pixel 9a companion completes all four fresh R/C/C/R sessions.
All 960 trusted-key samples survive, with full-corpus and exact edited-card cold-reopen checks passing.
Card p95 is **107.9/87.1/86.9/108.3 ms**: candidate reductions are 19.3% and 19.8% in the two
opposite-order pairs, but every card budget still fails <16 ms. Compose, focus, startup and replay
budgets pass. Setup races and every diagnostic observation are retained separately. Actual delivered
key cadence and temperature vary; this is one-phone automated-input evidence, not ordinary keyboard
or fleet qualification. [Protocol](./f17-pixel9a.md);
[evidence](./account-conformance-runs/2026-09-15-f17-pixel9a/README.md).

The preceding prospective B/R/C command comparison passes (54 sessions / 3,456 measured insertions),
but the unchanged candidate application gate still fails at 12.9/63.5 ms desktop/CPU-4x Android card
p95. Default Local and Account retain the reference; the candidate stays private and F-17 partial.
[Prior comparison and gate](./f17-local-performance.md).

The preceding functional integration remains verified: 54 workspace cases, 155 affected owned cases,
97 files / 1,093 full unit tests, native pending/delivery campaigns and 10 workspace cases / 4 mutations.
The general set is now **263 files / 2,121 dispositions (11 not applicable)**. There are still
**zero blocked test-file rows, 96 command rows and 63 campaign rows**. These count adapter obligations,
not passed release tests or remaining product defects.

**Open validation observations.** Both metadata-copy candidates pass focused semantic checks but
miss the prospective performance rule. At 1,000 undo groups the recursive candidate improves one/100
target medians by 5.1%/20.1%, and direct constructors by 10.3%/30.5%; the required gain was >=20% in
both strata. All 720 timings, source variants and sharing controls survive. Production is restored
exactly, while new graph/isolation, fallback and undo/selection regression tests remain. The ownership/verification contract and baseline controls are recorded. The private handoff
now passes the explicit Local integration/reference gates. Default activation and Account source
activation remain separate. Full verification and queue/capture bounds are retained.
The last reference residual profile shows substantial costs for each draft, full comparison and
publication. Its application observation is 15.2/69.4 ms desktop/CPU-4x typing, with focus 7.4/35.7 ms.
The subsequent private candidate observation is 12.9/63.5 ms typing and 7.5/43.2 ms focus. Android
typing fails in both runs; other budgeted measurements pass. Neither run is physical-device
qualification, and the old reference profile cannot attribute candidate costs. Preserve the earlier focus failure,
recorder/scheduler uncertainty and all negative fork controls. These host observations do not
establish handset or immutable qualification. [Rejected metadata assessment](./account-conformance-runs/2026-09-14-f17-metadata/README.md).
[Preparation contract and controls](./f17-preparation-contract.md).
[Private handoff component and evidence](./f17-handoff.md).

The handoff phase's first full unit run, concurrent with runner checks and owned input
fingerprinting/execution, timed out at five seconds in unchanged Account-liveness and position-decision
cases. The same default full command passed alone at unchanged limits. Both runs survive; concurrency
as the cause is not established. Keep this at loaded-host qualification instead of relaxing deadlines.
[Residual profile](./account-conformance-runs/2026-09-14-f17-history-profile/README.md).
[Last reference application gate](./account-conformance-runs/2026-09-14-f17-forks/README.md).

 The residue ZIP controls use host Python: 58 observed file pins match before/after, but external-tool binding is still required in the general frozen-input contract before immutable qualification. The general Node reporter suppresses per-test stdout and removes optional default reports with its disposable checkout; complete wrapper/output retention remains separate. Core receive previously used 297.025 of its 300-second Node bound;
its 301.462-second stage included preparation/drain. Narrow headroom stays at the loaded-host gate.
The ledger phase's first expected-pass historical service-path control reported orphaned-child.
Its log remains; teardown removed its first receipt. Cause is unresolved despite later passes.
Optional pre-cleanup capture retains later receipts; this phase establishes no fix. Capture's generated
comparison-map refresh and overhead byte-length equality remain focused oracle follow-ups. Editing's
timeout/diagnostic and measured deadline repair remain preserved in its earlier packet.

Handoff's original timeout and passing allowance repair remain preserved in its signed packet.

**Delivery-oracle timing.** This pass used 113.095 of 120 seconds of Node execution, leaving
6.905 seconds of headroom. Its 117.760-second stage includes setup/drain. Keep this observation
at the loaded-host aggregate gate; the allowance is unchanged.

**Next bounded phase.** Refresh two full-corpus CPU/allocation profiles of the retained round-three combination, then choose one narrow repair among measured remaining complete-comparison byte work, document/history allocation and membership repair. Earlier profiles predate primitive value-string reuse; their cost ordering is not a current measurement. Preserve full normalization/comparison and ownership. Use focused checks and the common short paired browser screen for a chosen change; retain the UI index and publication patches for optional later composition. Reserve native composition/refusal/pending/remote, private-codec/version, scratch ownership/lifetime and memory qualification, appropriate integration controls and the unchanged application gate for the selected RC.

The eight-phase commit backlog is closed in five verified signed commits through `e2d42fac`;
`15eb389c` is the latest runtime/test integration checkpoint. The following documentation commit
records the [grouping, original evidence identities and reproducible checks](./account-conformance-runs/2026-09-15-f17-commit-backlog/README.md).
No historical commit or receipt is rewritten. There is no remaining F-17 commit backlog through
the final comparison. Remaining phone/manual work is cancelled; test servers and the dedicated
ADB server are stopped. Emulation remains the reference, with the earlier rough 1.5× phone
planning estimate. F-17 and the 96 command / 63 campaign obligations remain open.

**Product position.** Personal Local cutover/cleanup/offline upgrades are exercised. Account remains
the private creating-member ciphertext round trip, Stage 4 §3.5 item 5, unmounted in the personal app;
no real Account admission receipt exists. The author's old second device must adopt the first workspace
with fresh custody, store, counters and credentials, without importing/merging its old writing.
Membership/revocation/rotation, signout/remove/reset, continuity, operations/deployment and public
assurance remain later work. Wider F-21.4 privacy, F-09 Account/key-loss/malicious-member recovery,
F-07/F-17/F-19 workload capacity and Q-08 publication/evidence policy remain visible.

**Preservation.** All 21 pinned personal/package files, 31 prior vectors and L-2 remain byte-identical.
Personal browser/profile/recovery/factor/key/service/origin/routing and root `done ` remain untouched.
Historical review/intake/evidence bytes, formal debts and signing backups are unchanged. The signing
sweep and preceding phase signatures are complete; the aggregate needs its own immutable revision.

---

## Active slice: Stage 4's first pieces — authorization, acceptance and transition integration (`L-2`)

```yaml
gate: L-2
seat: .claude/worktrees/l2-onboarding-863db1
branch: claude/l2-onboarding-863db1 # forked from claude/l1-contract-pass at 1375ee6
status: in flight # R3-4 paid; the slot verifier landed; the account service is next
plan: [sequencing.md §3.5, action-tree.md L-2]
prerequisites: S0-10 (closed 2026-08-29), especially S0-2/S0-4 — not L-1
debts: none # node scripts/check-debts.mjs --gate L-2 lifts
updated: 2026-08-29
```

**Why this runs beside `L-1` rather than after it.** `L-2`'s prerequisites are `S0-10`, especially `S0-2` and
`S0-4` — [action-tree.md](./review/remediation/action-tree.md)'s node names them and does not name `L-1`. The
two rejoin at `L-3`, which lists both. The critical-path diagram in
[sequencing.md](./sequencing.md) §4 draws Stage 4 after Stage 2 because that is the order the *product* ships
in; §5.1 already settled that the service's construction does not wait, since *ships* means someone else's
data and the author synchronizing his own devices is development. So milestones 5 and 6 are reached while
review 3b is out, and what waits for 3b's answer is exposing another person to it.

**What this slice is.** Stage 4's internal order, taken in order (§3.5): the account service, the
authenticator and the device-local slot verifier; the recovery keypair and the code ceremony; the
authorization lineage, first signed head, genesis checkpoint and promotion; device signing and wrapping
credentials; the envelope layer, relay rewrite and content-blind durable store; enrollment's two gates; the
device list; rotation, revocation, acceptance evidence and the finalization boundary. **Mostly indivisible:**
a device list that cannot revoke is worse than no device list, so nothing ships until item 8.

**What has landed.**

- **`R3-4`, first, because it was owed first** (`fbdbfb4`). `S0-9` round 3 returned member-entry uniqueness to
  `S0-2`'s homes *before `L-2` implements a verifier*, and this is that moment. A certified set carrying two
  entries under one `credential_id` is now malformed at both homes, the four map entries pinning them are
  re-pinned with every entry held, and `pnpm recipient:check` carries the sentence as a byte rule — added
  beyond the named repair because the generator's object-keyed `members` cannot express a duplicate, so no
  published negative can ever cover it. Recorded at
  [`S0-2/README.md`](./review/remediation/S0-2/README.md) and as a dated addendum on the disposition.
  **This makes one line of the `L-1` document above stale** — its *not in this slice* paragraph still says
  `R3-4` is owed. Correct then, wrong now, and the `L-1` seat's line to drop rather than this one's to edit:
  the separator only means anything if it holds when crossing it would be convenient.
- **The device-local slot verifier** (`b8c267a`), `src/account/slotUnlock.ts` — TRD §13.9, §15 row 12, item 1's
  half that needs nothing from `L-1`. The service-signed binding is verified before the key it names is used;
  refusals are values rather than messages. Held to `test/vectors/account-credential.json`, with the negatives
  rebuilt against `src/` rather than replayed, and a fifteen-mutation battery run against it — eleven caught,
  four survivors all in the compiled-in encoding set, all closed by two tests that pin the check's *position*
  rather than its presence.

**What is next, in the plan's order.** The account service and the authenticator ceremony that mints these
credentials — the two halves of item 1 the verifier does not cover — then the recovery keypair and the code
ceremony, which §3.5 puts at account creation rather than later because there is no account without it.

**Two things `L-2` needs that it does not own.** §6.5's slot index is where a verified binding is *stored*,
and it is `L-1`'s item 2; the verifier is a pure function over published bytes and did not wait for it, but
the enrollment path will. And §11.2's hostile-relay tests need `relayNetwork()` in `test/replicas.ts` able to
withhold, reorder and deliver late — §3.5 names extending it as far cheaper than a second harness, and it is
worth building before item 5 rather than during it.

**Not in this slice.** `L-1`'s document above, which this seat does not edit. `L-3` and `L-4`, and the four
registered debts at `L-4`. The live Stage 2 cutover. Review 3b's answer gates exposure, not construction
(§5.1) — and reviewer answers that constrain implementation are `L-4` gates.
