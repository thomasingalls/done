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


## Active slice: General validation-runner integration — Account suites (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: in flight
blocks_on: signing agent refused lifecycle commit; validated work staged; resume signing before continuing
debts: consult docs/review/remediation/debts.json
updated: 2026-09-14
```

**Commit boundary.** The lifecycle/service-file phase is validated and staged, but `git commit -S` failed with `agent refused operation`; HEAD remains the signed calibration commit `c5e21128`. No unsigned commit was created. Resume signing before the remaining two Account files.  Residue calibration fixtures is signed `c5e2112` and verified. Residue matcher and container fixtures is signed `9e243ca` and verified. Growing-history liveness is signed `de8f421` and verified. Ordinary-scheduling workload is signed `379b115` and verified. Controlled liveness and verified view is signed `c85e548` and verified. Liveness instrument and cache is signed `16d1612` and verified. Failure and recovery is signed `b5b83ce` and verified. Decision restart and history is signed `d1eff10` and verified. Directed decision composition is signed `d0735a6` and verified. Outbound is signed `02a1bfe` and verified. Reservation durability is signed `19dfffe` and verified. Admission bounds is signed `fa9f782` and verified. Local custody is signed `474aeaa` and verified. Local provenance is signed `8fed0da` and verified. Store-contract is signed `fdcf265` and verified. Counter-contract is signed `9a5bf1d` and verified. Checkpoint-contract is signed `3ea2c19` and verified. Promotion-contract is signed `b3b70d8` and verified. Parser-conformance is signed `85d964a` and verified. Delivery-oracle is signed `ed48158` and verified. Service inbound is signed `a946620` and verified. Activation is signed `bc536f3` and verified. Core is signed `76ac103` and verified. Recovery is signed `4a52665` and verified. Authority is signed `be8749f` and verified. Promotion is signed `f59d5f2` and verified. Genesis is signed `25c8be8` and verified. Admission is signed `b201784` and verified. Handoff is signed `bd484a6` and verified. Editing is signed `2e77b02` and verified. Capture is signed `599bba9` and verified. Decisions is signed `fb81e00` and verified. Delivery is signed `d85036e` and verified. Spool is signed `9bf77c7` and verified. Receive/editor `2e05910`, sync/composition
`0a7d6d4`, receive-driver `8bd6a07`, receive transport `fa80a53`, transport service `b0e7828`,
oracle/parser `a20e678`, preparation `950fe83`, contracts `8db2ee7`, ledger `54722df`, isolation
`01c4447`, delivery/inbound `dbf5eb5`, service `95fa715`, Account `5334a7c`, generated registrations
`f9111ea`, general adapters `38e4995`, properties `8acdee4` and R-01 `5872dc5` are signed. Historical
receipts retain actual execution identities and signing status at capture.

**Just completed.** Account residue lifecycle and service-file native fixtures.

The preceding phase is signed and verified as `c5e2112`. **Account residue lifecycle and service-file native fixtures** adds 2 complete
files / 4 cases. The selection passes in 52.677 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-residue-lifecycle-fixtures/README.md).

Four complete unchanged cases retain their existing 240-second file bounds: three lifecycle cases (180/60/60 seconds) and one service-file case (180 seconds). Six registration files, the shared Chromium launcher, two existing owner-control files and generated snapshots change. Product code, the four residue test bodies, synthetic browser/service fixture, acquisition and matching helpers, and wrappers remain unchanged. Five fixture instances run in two owned disposable browsers.

The lifecycle requires at least five synchronous admitted writes held solely in the encrypted journal while content-row counts remain unchanged. Flush must empty that journal; compaction and cold page replacement must preserve the exact projection. Recovery preparation checks the specific allowed retry-key exposures, then actual HTTP selection includes a lost final reply. Later Account edits, compaction and cold replay must retain the expected content. Software authenticators and generated factors exercise the private flow; this is not a human ceremony or a personal Account receipt.

Wrong-factor and cancelled opens refuse access. A real Storage.setItem override throws QuotaExceededError for encrypted journal keys; the test requires that failure to occur and verifies fallback persistence through cold reopen. The paired write-path control deliberately plants a plaintext side record after an acknowledged edit and requires the neutral scanner to detect it. These are directed controls, not generated histories or physical process/power failures.

The separate service-file case drives synthetic Local-to-Account HTTP delivery and observes the actual service directory twice after a barrier. Both observations must agree, the bounded acquired-file scan must be complete with no prohibited writing/factor sentinel, and it must include a real WAL. The intentional retry marker is excluded. This establishes the tested acquired-file result, not physical disk erasure or universal carrier coverage.

Existing host-Python identity binding, default report/stdout retention, owner classification/headroom and capture-oracle follow-ups remain open. Owned case receipts establish these four results; original wrapper campaign and output contracts, immutable validation and personal Account preparation remain separate.

The first native attempt refused all three lifecycle cases with uncaptured-worker, including the empty checkpoint. A separate diagnostic probe identified a chrome-extension worker; no product worker was inferred from that URL. The shared direct Chromium launcher now supplies the two extension-disabling flags already present in installed Playwright defaults. The uncaptured-worker refusal remains unchanged. The native owner control checks an empty worker census then observes a deliberately created real Blob worker; the existing startup control pins both flags. All 24 Node-owner and 14 native-owner cases are rerun, including timeout, cancellation, death and group/listener cleanup. The failed lifecycle receipt and diagnostic probe are retained alongside the passing final run. This changes the browser launch inputs; earlier native receipts retain their original input identities and are not recast as reruns under these flags.

The first ownership recheck passed 13/14 native controls; browser-death cleanup recorded kill EPERM and refused group-drain credit. Its PID was subsequently absent, but that later observation does not repair the failed receipt. Browser signaling now retries EPERM within each existing TERM/KILL grace interval and still requires ESRCH for drain. A new Node-owner control injects transient and persistent signal denial, requiring recovery only in the former and a failed drain result in the latter. Both the failed ownership log/receipt and successful requalification are retained. No deadline was enlarged and persistent uncertainty is not treated as success.

This packet alone uses a 175,000-byte ceiling, expanded from the usual 150,000 to preserve both failed attempts, the diagnostic probe and the full 24/14 owner requalification logs. The next ordinary integration packet returns to the usual ceiling.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 225 prior general contracts / 1,765 identities and exclusions remain unchanged.
General selections now contain 227 files / 1,769 cases (96 Vitest,
131 Node); Account has 121 files / 675 cases.
The 708,782-byte manifest retains 612 obligations / 190 unresolved:
31 test-file (15 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account residue generated native histories. There are 2 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.

**Open validation observations.** The residue ZIP controls use host Python: 58 observed file pins match before/after, but external-tool binding is still required in the general frozen-input contract before immutable qualification. The general Node reporter suppresses per-test stdout and removes optional default reports with its disposable checkout; complete wrapper/output retention remains separate. Core receive previously used 297.025 of its 300-second Node bound;
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

**Next bounded phase.** Account residue generated native histories. 2 Account files remain. Non-Account Node/nested/
Playwright integration and command/campaign contracts follow this authorized Account group. R-04,
P-06, immutable release validation and human Account preparation remain later gates.

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
