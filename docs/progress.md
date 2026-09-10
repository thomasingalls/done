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

## Active slice: Owned one-device delivery and reconnect (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: not started
blocks_on: lifecycle-owned delivery scheduling and retry contract
debts: consult docs/review/remediation/debts.json
updated: 2026-09-11
```

**Personal checkpoint.** The verified Local release remains `.dev/releases/17d87c2/app`, with predecessor
`dist/` intact. Preview/relay remain stopped; origin/Tailscale routing is unchanged. The author controls the
browser and factors. No real Account, passkey, recovery code, operator key or authority pin is provisioned.
The actual old second device will adopt this device's workspace with fresh custody/store/counters/credentials;
its old writing will not be imported or merged.

**Committed base.** `18ceb40` contains v2 outbound preparation, `7210b7d` source capture, `7082fa7` the
witnessed v7 spool, `81a4655` response/proof verification, `2cb42a2` lifecycle-owned v8 delivery evidence,
and `96a2040` private schema-4 service decisions. Positions and encryption invocation grants are distinct;
exact source capsules, envelopes, wrappers and witnessed response evidence survive restart/compaction.
Closure/conflict/finalization halt outbound work while Local editing and retained evidence remain available.
Edited v5 histories still need a separately verified catch-up checkpoint.

**Private transport/readback completed.** The [contract](./account-transport.md) composes actual private
HTTP with the v8 owner. Submission sends only the earliest already persisted eligible wrapper and commits
original service evidence using the existing witness barrier. Errors and unsigned unknowns preserve exact
retry bytes. Read requests require the current certified device signature, bound to independently pinned
service/origin and retained lineage/credential, fresh nonce, expiry and bounded cursor. Operator access is
separate from content authorization.

The service rechecks its authenticated membership and full witnessed ledger before signing a bounded page.
The page authenticates ciphertext/proof pairs, exact request, extent and continuation, including empty/end
results. The owner verifies every envelope and proof against retained authority and locally reconstructed
predecessors; a returned head cannot establish its own baseline. This phase only inspects the one-device
retained spool, with no decryption/application or durable receive cursor. Lifecycle close aborts and drains
fetch before slot/custody release. No schema or Local format changed.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-transport.md): 17 new tests, 60 generated
service histories and three effective controls; full private HTTP/browser cancellation, lost reply and cold
retry; 32 service delivery, 23 browser delivery, 30 Account core regressions, and all 873 unit tests pass.
The corrected initial failure was an unsupported test-fixture credential state, not a demonstrated protocol
defect. Short expiry windows allow exact-request replay while membership remains current and require clock
agreement. Full scans, unbounded retained history and coordinated state rollback remain limits.

**Next bounded phase.** Build a private lifecycle-owned one-device delivery/reconnect driver. Coalesce
requests to drain durable captures, prepare eligible envelopes and persist submissions, then send through
the existing exact-byte operation. Always resolve an existing pending wrapper first. Keep one network
operation in flight; do not hold the task queue while sleeping between attempts. Unknown or lost replies
retry the retained bytes with bounded backoff; closure, conflict, finalization or local durability failure
stop publication without suppressing Local editing. Keep operator-token lifetime and all event/timer cleanup
attached to close/abort.

Specify the scheduling and restart state machine before wiring it. Exercise rapid edits, offline/online,
lost commits/replies, repeated wakeups, restart with a pending wrapper, and close during fetch/backoff using
the actual owner/service and generated histories. Preserve durable invocation accounting and source capture;
no transport callback may mint ciphertext or install authority. Provide private status/manual retry useful
for the next walkthrough, without provisioning the author's Account or mounting a default-app service.

**Following boundaries.** Authenticated inbound replay (including its durable receive baseline/cursor and
reader fence), Account UI, two-gate second-device enrollment/adoption, general lineage advancement, client
successors, batched proofs/checkpoints, concurrent Account writers, pruning/backlog performance, revocation,
rotation, clear/delete, finalization/recovery, supported platforms, whole-profile residue, production
provisioning/deployment/restore and independent review. No whole debt is paid. L-2's historical clean ref
`d24732b` has no further service work to integrate; host VM/policy research remains stopped. Both client
credential history and service history still assume unrewound, unbranched state.

This outcome was appended to completed.md before this rewrite; L-2 is unchanged.

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
