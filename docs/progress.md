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
blocks_on: core-receive fixture execution headroom; application latency disposition; remaining command/campaign and immutable qualification work
debts: consult docs/review/remediation/debts.json
updated: 2026-09-15
```

**Roadmap checkpoint.** All catalogue and test-file adapters are integrated. The selected F-17
combination is now maintained code and passed functional integration. The subsequent Account
qualification remains open on core-receive execution headroom. Default Local activation is still
gated; F-17 remains partial. There are **626 obligations, 290 required test
files, and 271 general files/2,189 dispositions (11 not applicable)**. The unresolved set is
unchanged: **zero test-file /96 command /63 campaign**. These are adapter obligations, not passed
release tests. [Execution overview](./release-validation-execution.md#checkpoint-and-remaining-sequence).

**Just completed.** The selected integration is signed and signature-verified as `132bc7d3`.
[Lifetime/composition qualification](./f17-rc-lifetime.md) passes four controlled-carrier Chromium
sessions, **1,920 main edits/152 collection checkpoints** and three faults. Candidate histories are
bounded and collectible after close; scratch is cleared and capped. This is not complete memory
erasure: the existing canonical document remains reachable while a closed facade is retained in
both modes, then becomes collectible when that facade is dropped. No production changes were made.

**Native qualification result.** Ten complete Account files pass **102 cases**, including all sync,
receive/editor, editing, handoff, capture and admission fixtures. Core receive times out twice at
its unchanged **300-second** stage limit, after 16/17 and 15/17 cases. Both attempts drain and stay
failed. Its last authority-change case passes alone, but that diagnostic does not complete the file.
The planned 119-case selection remains open on core receive. The preceding integration's 1,209
unit tests and owned/native controls retain their own signed evidence; they are not rerun here.
[Current evidence](./account-conformance-runs/2026-09-15-f17-rc-lifetime/README.md).
This new evidence/checkpoint phase is uncommitted.

**Selection boundary.** The operator has ended optimization exploration. Keep existing full
canonical verification and detached stack copies. UI/publication alternatives, the first buffer's
added comparison, incremental stack copying and broader normalization stay out. Transactional
idle drift refuses before another append; raw private-field mutation remains outside the
sole-mutator contract. Emoji-bearing histories still fall back to fresh forks. Production Local
and Account constructors retain the reference mode; shared comparison/editor/command changes
are integrated, while Local buffer use remains explicit and private. Account buffer activation
is excluded.

**Last performance evidence.** The [replay screen](./f17-replay-r1.md) passes six application
sessions/480 measured keys and favors replay in both ordinary pairs: median paired gains
21.1% early/20.5% later, p95 21.5%/19.8%. These are descriptive incremental gains, not additive
percentages or a budget pass. The [last unchanged application gate](./f17-selection-performance.md)
still records **12.2/75.1 ms desktop/CPU4 card p95**, with Android over <16 ms, and Android focus
54.2 ms over <50 ms. No new application gate or timing campaign runs in this functional phase.
Keep the emulation reference; the cancelled physical-device campaign remains a rough 1.5× planning
comparison only. [Phone evidence](./f17-pixel9a.md).

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

**Next bounded phase.** Repair and qualify the existing core-receive fixture's execution headroom.
Use both 300-second failures and the previously recorded 297-second pass to distinguish fixture
setup/body/teardown costs and select a justified bounded repair. Preserve the test's semantic and
individual-case contracts; do not blindly increase its stage limit. Optimization exploration is
closed, and the selected runtime remains fixed unless this investigation finds a defect.

**Following phases.** Run the unchanged application gate on the integrated combination, decide
default Local activation and explicitly record any accepted latency shortfall as release debt.
Retain failing receipts. Resume the 96 command/63 campaign wrappers and remaining qualification
repairs before the immutable aggregate, private Account rehearsal and human recovery/adoption
milestones. Larger rewrites and wider normalization are later work; no release receipt is claimed.

The earlier eight-phase commit backlog is closed in five verified signed commits through
`e2d42fac`. Subsequent optimization and integration records are signed through `132bc7d3`; historical receipts
retain their original revision IDs. The personal packaged app, phone, relay and deployment remain
untouched by this integration.

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
