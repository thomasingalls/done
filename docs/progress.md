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


## Active slice: General validation-runner integration — remaining suites (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: in flight
blocks_on: application latency repair and budget disposition; remaining command/campaign and immutable qualification work
debts: consult docs/review/remediation/debts.json
updated: 2026-09-14
```

**Just completed.** Reduce detached document fork cost while preserving runtime semantics completes the bounded runtime-fork repair; the unchanged packaged application gate still fails on CPU-4x Android card typing. All 12 project/cases execute without skips or retries and retain all 30 measurements. Desktop card typing is 15.2 ms and meets <16; Android is 69.4 ms and fails <16. Focus is 7.4/35.7 ms against <50. Startup/replay, compose and navigation also meet their unchanged bounds. One project teardown reports the collected overrun and the process group drains. Previous typing was 16.2/77.2 ms; this cross-run change is descriptive, not a controlled causal estimate. Both projects seed and cold-verify 300 cards and 400 Goals lines through the real Local UI, with seeded editor work at 1280x900. No threshold, deadline, recorder, personal app or deployment changes; this is not handset or immutable-release qualification. Only src/crdt/yjs.ts changes production behavior. Detached documents use V2 struct compression with paired private encoder/decoder overrides for V1 legacy JSON and independent UTF-8 string semantics. Binary views, including leaves nested inside arbitrary arrays/objects, detach before temporary update bytes are cleared. Pending update bytes, missing-clock maps and pending deletions still copy exactly without replay; runtime redone links and deep undo stacks remain. Both private drafts, per-transition comparison, admission order and persistent/outbound V1 formats are unchanged. The naïve public-codec swap fails three tests; its exact patch and original added test source are retained. The signed baseline fails the new nested-binary regression, establishing a pre-existing V1 temporary-buffer aliasing defect; the repair preserves those values without claiming personal writing was affected. The final unit suite passes 96 files / 1,035 tests. Two hundred generated Unicode/nested-content cases compare with the frozen V1 reference and test isolation both ways; 150 generated undo/redo histories compare repeated forks with an unforked reference and check selection-metadata isolation. Existing 500 fork and 350 comparison histories remain. Pending-map aliasing and omission of redone links each fail their intended control. Native pending and original-order delivery each pass 100 generated histories plus their directed crash/pressure cases. The owned workspace-admission catalogue passes ten cases and four mutations with process drain. Final alternating fork medians are 0.695/0.415, 3.119/1.779 and 36.897/22.252 ms baseline/candidate at 1k/10k/100k items over 100k visible characters. That satisfies the prospective >=20% fork-gain rule with no consistent >10% regression in another stratum. Sequential whole-command timings remain mixed: 13.585/15.210, 26.115/23.815 and 130.601/116.110 ms. Every pilot/final sample and bundle identity survives; the naïve pilot is not evidence for the revised candidate. These are dependent single-host observations, not population or causal estimates. The prospective protocol, refinement prompted by semantic failures, final source patch/pins and negative controls are retained.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `e2c93b05` has a verified signature. 259 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,015 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: isolate the remaining undo-history and duplicate-preparation costs with the revised runtime, then choose a bounded ownership or history-copy repair that preserves staging and full verification; remaining command/campaign adapters and immutable qualification follow.

[Evidence](./account-conformance-runs/2026-09-14-f17-forks/README.md).

**Open validation observations.** The complete-comparison and detached-fork repairs pass semantic and fault controls. Desktop card typing meets <16 ms in the latest observation at 15.2 ms, but CPU-4x Android remains over it at 69.4 ms. Focus is 7.4/35.7 ms against <50; startup/replay, compose and navigation also meet their bounds. Preserve the earlier focus failure and recorder/scheduler limitations. Alternating fork medians improve at all declared item counts, satisfying the prospective rule; sequential whole-command timings remain mixed. Both detached drafts and deep undo copying remain, so isolate their residual cost before a larger ownership change. A pre-existing V1 nested-binary temporary-buffer alias is reproduced and repaired; the naïve V2 swap's JSON/string/binary failures are separately retained. These are host observations, not handset or immutable qualification. [Latest evidence](./account-conformance-runs/2026-09-14-f17-forks/README.md). [Prior diagnostic](./account-conformance-runs/2026-09-14-application-latency-diagnosis/README.md).

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

**Next bounded phase.** Isolate the remaining undo-history and duplicate-preparation costs with the revised runtime, then choose a bounded ownership or history-copy repair that preserves staging and full verification; remaining command/campaign adapters and immutable qualification follow. All declared suite adapters are integrated. Continue bounded measured performance work with signed intermediate commits; stop if signing blocks.

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
