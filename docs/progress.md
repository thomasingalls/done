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

## Active slice: Remaining Local/migration provenance disposition (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: not started
blocks_on: explicit remaining Local provenance disposition before aggregate Account byte-contract closure
debts: consult docs/review/remediation/debts.json
updated: 2026-09-11
```

**Roadmap position.** Personal Local cutover, source cleanup and packaged offline upgrades are exercised.
Account work remains at [Stage 4 §3.5](./sequencing.md#35-stage-4--the-service), item 5's internal
creating-member ciphertext round trip. Composition `6398e33`, descriptor bounds `4f71bac`, activation
`2ba50aa`, prep `9cf5c98`, A `43b42b1`, B `e74fbaa`, C `d098bd4`, D1 `d24ca66`, D2 `1897848`,
D3 `24bc3a4`, D4 `837cd14`, D5 `add6fd7` and D6 `3585a1b` are committed. C and D1–D6 are unsigned at
the user's request; the existing reminder includes all seven. D7 is complete, unstaged/uncommitted.
No real Account receipt exists; this is not Stage 4 completion or second-device enrollment.

**Completed boundary.** [D7 checkpoint/startup contracts](./account-crypto/checkpoint.md) pin exact
checkpoint key/AAD/cipher bytes and native persisted ownership. The inherited row-7 cipher matches;
its generation 3, epoch 9, non-genesis identifier and prose plaintext qualify only byte agreement.
Current parser support stays genesis at generation 1/epoch 1. Successful decryption does not establish
service/member/lineage authority or replace recovery of the admitted content. No production change or
new runtime defect was found. D6's strict state-parser repair remains intact.

[Final evidence](./account-conformance-runs/2026-09-11-account-checkpoint-contract.md): 49 stages
pass with 849 matching source pins. Six vectors, 48 mutations, 15 encoded omissions, 44 parser
refusals and seven helper source controls pass. Shrinking-enabled properties cover 250 cipher cases,
200 deletion/pending/reorder cases and 24 native cold-replay histories. Four native tests prove actual
producer/startup byte agreement, no resealing on retained retry, offline read-only classification,
later-edit recovery, authority refusals and missing database/journal refusal. Removing selected/active
coverage checks accepts the damaged cases; removing startup workspace from KDF refuses valid state.
Inherited genesis/handoff interruption campaigns, 983 units/88 files, typecheck, prior contracts and
29 vector commands pass. Registry: 74 specified, one open, one exclusion. Map: 77 entries/96 permitted
chains/18 swept homes. Census: unchanged 158 sources/89 labels/templates.

**Next bounded phase — D8: disposition of remaining Local/migration provenance.** Complete the last
explicit group in [the construction registry](./account-crypto/constructions.json) under
[group D's gate](./account-crypto-prep.md#4-ordered-implementation-groups-and-acceptance-gates):

- Trace the twelve remaining labels/templates through current Local claims, imported selection/cleanup,
  clear and legacy-source/import carriers. Identify which authenticate a claim actually consumed by
  Account promotion/startup versus carriers reachable only in legacy migration/Local deletion.
- Bridge required live claim KDF/MAC/progress bytes to exact homes, current runtime and independent
  vectors/meaningful negatives. Use existing native evidence where it establishes the same owner;
  add a bounded check for any demonstrated gap. Do not classify a live dependency as an exclusion.
- Give legacy-only carriers explicit, justified dispositions with retained source/home/evidence links
  and limits. Do not rebuild migration machinery or turn this into a fresh whole-Local/WASM audit.
- Preserve current valid formats; change runtime only for a reproduced defect or explicit correction.
  Run the affected registry/vector/owner checks, preserve evidence, append the outcome, then replace
  only L-1. Review aggregate F-05/F-06 closure separately; zero open labels alone is insufficient.

**Personal checkpoint.** All 21 saved package hashes in root `dist/` and
`.dev/releases/17d87c2/app`, 29 prior tracked vector files, production sources, historical review and
L-2 are unchanged. Personal preview/relay remain stopped. No real browser interaction, Account, factor,
operator key, pin, origin or routing change occurred. New bundles stayed in memory; native fixtures were
disposable and synthetic. Unrelated root files `done ` and `reviewpacket96a20401ceb88d.md` remain untouched.
Host VM/policy research stays stopped. The actual old second device will adopt the first workspace with
fresh custody/store/counters/credentials, without importing or merging its old writing.

**Other gates.** F-15 invocation-grant power-loss accounting remains: content requests relaxed durability,
custody no explicit hint; renderer death and transaction completion are not OS/power-loss evidence.
F-05/F-06, salvage/diagnostics, parser/admission/service negatives, performance/maintenance, lock ordering
and accepted review follow-ups remain. Passkey and workspace signing IDs are distinct namespaces.
General lineage advancement, successor/checkpoint baselines/install/fallback, concurrent members,
pruning/backlog scale, enrollment/device management, revocation/rotation, clear/delete,
finalization/total-loss recovery, PRF enrollment, supported platforms, whole-profile residue,
production deployment/restore and independent review remain separate. Client/service histories must
be unrewound/unbranched; fresh-salt/sender constructions require nonrepeating randomness. L-2's historical
clean ref `d24732b` has no further service work to integrate.

The outcome was appended to completed.md before this rewrite; L-2 is unchanged.

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
