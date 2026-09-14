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


## Active slice: General validation-runner integration — core receive/editor native fixtures (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: not started
blocks_on: none; next bounded phase reviews receive-store and ordered editor native fixtures
debts: consult docs/review/remediation/debts.json
updated: 2026-09-14
```

**Commit boundary.** Receive-driver fixtures are signed `8bd6a07` and verified. Receive transport is
signed `fa80a53`; transport service `b0e7828` matches its recorded staged tree `6abb609`. Historical
receipts keep actual execution identities and signing status at capture. Oracle/parser `a20e678`,
preparation `950fe83`, contracts `8db2ee7`, ledger `54722df`, isolation `01c4447`, delivery/inbound
`dbf5eb5`, service `95fa715`, Account `5334a7c`, generated registrations `f9111ea`, general adapters
`38e4995`, properties `8acdee4`, R-01 `5872dc5` are signed.

**Just completed.** [Account sync/composition fixtures](./release-validation-execution.md#account-synccomposition-fixtures--phase-2aa)
add five files / 29 cases: batch 7, scheduler controls 5, generated 1, native controls 4 and native 12.
Only the four non-scheduler files need owned CDP. File bounds are 300/90/450/150/600 seconds; browser
startup 15 seconds and drain grace five seconds. The preceding phase is committed; this new work is
uncommitted. Product source, wrapper source and all selected case identities are unchanged.

**Evidence.** The owned selection passes in 990.122 seconds; every worker/browser group drains.
Eight generated histories retain seed 9112062, endOnFailure:true and their 420-second case bound.
They use actual synthetic service delivery and compare writing, capture counts, source-to-position
mapping, send/read progress and encryption invocation counts after each action. Six batch cases
crash the renderer on both sides of three storage commits; the seventh verifies exact retry and
later-source grouping after a lost accepted reply. Five scheduler omissions, five omissions across
four native control cases and one native preflight omission remain effective. Twelve native cases
include shared close/permit drain, local admission during sealing, retained receive conflict and
R-01 size refusal with historical sealed/prepared-submission restart. Offline is simulated; page
reopen and renderer crash do not establish second-device, full browser crash or power-loss behavior.

The first focused scheduler run failed all five cases while loading a copied module: its R-01 runtime
protocol import resolved beneath test-results. The fixture now resolves the real current module;
no stub or assertion reduction. Before/after logs and signed-history provenance are retained. The
historical builder's git reads now have five-second/2-MiB bounds. Both pre-R-01 preparation/delivery
files are pinned in the native receipt. All 92 pure runner and 23 Node owner checks pass, including
prelaunch/reuse/midrun drift for both new historical paths. Direct TypeScript, scoped style, planning,
authority and signatures pass. Unchanged Vitest-process/native-owner controls (5/12) retain earlier
evidence. The [packet](./account-conformance-runs/2026-09-14-sync-fixtures/README.md) includes receipts, frozen source/browser identities, exact patch,
prior contracts and preservation. It is not an immutable aggregate. Batch JSON reports written in
the disposable checkout are not retained as output obligations; other optional exports are disabled.

**Open validation observation.** The ledger phase's first owner run reported orphaned-child on an
expected-pass historical service-path control. Its failure log remains; teardown removed its first
receipt. Cause is unresolved despite later passes. Optional pre-cleanup capture now retains later
control receipts. Keep this at the owner/loaded-host reliability gate; this phase establishes no fix.

**Next bounded phase.** Review `test/account-receive/native.test.mjs` and
`test/account-receive-editor/native.test.mjs`: core receive storage and ordered editor publication,
including the historical reader, coverage/witness controls, crash boundaries and close/drain behavior.
General selections now contain 179 files / 1,473 cases: all 96 Vitest and 83 Node files. All 174 prior
contracts / 1,444 identities are unchanged. The 641,301-byte manifest contains 612 obligations /
238 blocked rows: 79 test-file (63 Node, sixteen Playwright), 96 command and 63 campaign. These are
integration obligations, not product defects. All eleven catalogues remain resolved (163 cases /
54 mutations). Other native/Playwright/nested owners and wrapper/output/prerequisite postconditions
follow. Keep retired-v8 exclusions and resolve old wrapper calls without reviving support. R-04
style scopes/full checks and P-06 prose precede the immutable aggregate and private Account prep.

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
