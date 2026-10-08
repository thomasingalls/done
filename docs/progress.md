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

## Product integration: device lifecycle (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: in flight
scope: repeatable lifecycle; repeated connections and removals complete; durable current-key retry complete; replacement snapshot source and service retention complete; native replacement handoff complete; replacement reading complete; native initial-generation activation next
blocks_on: none
release_validation: paused by operator
updated: 2026-10-08
```

**Live baseline:** `https://mbp.tail0e0d4.ts.net:8443/`, app/proxy 53219, API 53220,
immutable frontend `2bea3437`, schema 20 and original service pin. Both network sessions and membership
continuation are enabled. After the operator confirmed a fresh quiet point, the explicit upgrader saved
`.dev/account-enrollment-tailnet/backups/schema-14-hYJ1yZ` and preserved every prior account/authority
row and column, pin and operator key. Fresh authority proof and all 28 precache URLs/worker bytes pass
through the actual HTTPS gateway. See [the runbook](./packaged-account-development.md) and
[cutover evidence](./development-evidence/2026-10-08-device-lifecycle-cutover.json).

**Completed bounded product work:** Devices navigation, third-device invitation/approval from either
existing device, three-device writing/reopen, pending cancellation, and first other-device removal with
forward key rotation. Cancel before approval; Remove after approval or uncertain key exposure. Existing
copies cannot be erased. The requesting device stays connected; removed devices retain writable,
exportable detached copies without a network driver or successor key.

The actual native owner retains exact removal intent and verified successor under encrypted custody.
Journal-inclusive content activation and custody-pointer installation resume across interruption.
Passive discovery stops the old writer before activation; old-generation writing from a surviving
offline device remains deliverable. Old openers and apply records remain for future checkpoint/retirement
work. The five focused final browser cases pass with original/joined lost-reply retries, interrupted
activation, offline survivor delivery, two-way generation-two writing and detached cold reopen.
[Final product evidence](./development-evidence/2026-10-08-device-removal.json) is `f46978a0`, over
implementation `2bea3437`. The complete checkpoint history is in [completed.md](./completed.md).

**Retained installation check:** reopen the unchanged address online, allow the normal application update to
activate (close/reopen if an old worker remains), then check writing and ordinary sync on both devices.
No personal browser was opened during the cutover; uptake is not yet confirmed. No personal device
needs removal for this initial check.

**Active development:** [repeatable lifecycle](./account-repeatable-lifecycle.md), authorized with
unsigned intermediate commits. Current-parent service admission/approval now passes after cancellation
and rotation, including replacement with only one surviving old device and a second removal.
Forty-nine affected service cases and fifteen protocol cases pass. Native custody now retains installed
generation openers through repeated removal; generation-three activation, second-rotation crash/retry
and detached generation-two reopen pass. Twenty-one focused node and forty inbound unit checks pass.
Repeated generation-one connections now archive completed custody exactly; five handoff and three
retained-coordinator cases pass. The four-device packaged case passes two actual UI removals, a
survivor missing both rotations, old-generation offline delivery, generation-three two-way writing
and cold reopen. The signed current-key service boundary now passes its five affected cases, including lost committed
replies. Durable browser retries now pass the focused native case: exact old ciphertext after a lost
refusal reply, same-position current-key delivery, journal preservation and cold reopen. Four new
retry cases and affected unit checks pass. The replacement checkpoint format, crypto replay and accepted-source verification now pass 24 focused and affected checks, including finalized publisher writing, restart replay and a replacement preparing the next snapshot without generation-one keys. Service retention and version-3 delivery/acknowledgement binding now pass eleven focused service/upgrade cases and 23 affected protocol/replay checks. Schema 21 is ready for an explicit offline upgrade; live remains schema 20. Browser handoff ordering and semantic acknowledgement now pass seven focused and four affected service-coordinator cases. Native producer/current-key wrapping now passes two packaged-browser cases (original and joined), with stale-grant recovery, lost publication reply, cold replay and journal preservation. Replacement reading now retains its verified binding and initializes nonzero receive cuts; ten reader/handoff, 45 inbound and five affected service/browser-reader checks pass. Next: restartable initial-generation joining custody and the full remove/connect/remove flow. Post-rotation connections remain gated. No live
service switch has occurred.

**Further product work:** self/last-device removal, lost-device
recovery, successor checkpoint replacement/pruning and old-key retirement, then production operations.
See [the lifecycle plan](./account-device-lifecycle.md) and [removal contract](./account-device-removal.md).
The retained build still has the first generation-one-to-two removal boundary; current source adds
repeat connections and removals. The account-preview label stays. Release validation remains paused.

Continue unsigned intermediate commits and end-of-phase chat summaries; one signed checkpoint at the
end of the agreed sequence. Consult the operator on product decisions.

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
