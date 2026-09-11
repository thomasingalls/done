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


## Active slice: Service-issued refusal and conflict composition (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: not started
blocks_on: service decision triggers and browser owner state inventory before conformance work
debts: consult docs/review/remediation/debts.json
updated: 2026-09-11
```

**Roadmap position.** Personal Local cutover, source cleanup and packaged offline upgrades are exercised.
Account remains at [Stage 4 §3.5](./sequencing.md#35-stage-4--the-service), item 5's internal creating-member
ciphertext round trip. Composition `6398e33`, bounds `4f71bac`, activation `2ba50aa`, prep `9cf5c98`,
A `43b42b1`, B `e74fbaa`, C `a20e439`, D1 `32d4074`, D2 `437bc86`, D3 `10fef3d`, D4 `1500379`,
D5 `ed1a930`, D6 `862a9d7`, D7 `5555238`, D8 `393ef43`, aggregate audit `ec889d9` and F-15 `c10dee3`
are committed signed. All eleven C/D1–D8/audit/F-15 signatures verify. The signing reminder is paused;
the original unsigned chain remains under the
[recorded backup](./account-conformance-runs/2026-09-11-signed-contract-history.json).
No real Account receipt exists. The new F-21.3 phase is complete, unstaged/uncommitted.

**Completed boundary.** [F-05/F-06](./review/implementation/account-crypto-closure.md) remain closed for
the current private first-epoch byte contracts. [F-15](./review/implementation/reservation-durability.md)
is fixed under explicit persistence assumptions: strict reporting cannot attest physical flush or repair
past undercounts, and writable profile restores/clones remain outside the argument.

[F-21.3](./review/implementation/account-isolation.md) is now closed for the current private admission
capability boundary. Two genuinely recognized accounts share one core/authority with distinct identities.
Mixed tokens, requests, recovery proofs, challenges and completions refuse without changing any logical
service/authority row. Legal retries, activation and binding readback work. Three real source omission
controls expose the original unknown-token coverage gap, a missing explicit target check and unscoped
proposal cancellation. No production defect was found and no production code or byte format changed.

[Evidence](./account-conformance-runs/2026-09-11-account-isolation.md): 44 passing stages, 205 Node tests,
865 matching source pins, types, 30 vector commands, census/map/registry, lint and format. The 23 new tests
include 148 directed mixed requests, eight live-recovery swaps, 160 generated histories with shrinking,
complete before/after-commit reply-loss histories, six SIGKILL cases and two simultaneous service processes.
The generated control shrinks a neighboring-row mutation to a short history. Affected admission,
activation, recovery, account-core, handoff, bounds and service-delivery regressions pass, including their
selected native cases. Full Vitest, broad storage campaigns and the aggregate crypto audit were not rerun.

**Limits.** The new two-account requests are synthetic content-blind service fixtures; inherited native
campaigns exercise real encrypted content and browser custody. The state oracle is independent of core
predicates but observes random first-issued bytes before pinning them. It is not an independent crypto
implementation. Process death is not power failure. This result does not close other F-21 subfindings,
HTTP exposure, general recovery, enrollment, platform qualification or independent review.

**Next bounded phase — service-issued refusal/conflict composition (F-21.7), prep included.**
`test/account-service-delivery/native.test.mjs` still covers actual service acceptance/lost acceptance
only. Existing client refusal/conflict fixtures sign with `fixtureAcceptance`, bypassing actual service
issuance. Those tests remain useful but do not prove issuer and client behavior together.

- Inventory legitimate triggers for permanent refusal and competing-digest/head evidence, the service's
  durable decision/witness state, and the real browser delivery/sync owner's required dispositions.
  Distinguish a signed permanent decision from unsigned failure, temporary unavailability and unknown
  commit outcome. Do not invent a client repair policy to make a fixture pass.
- Exercise genuine `decideSubmission` issuance through the actual browser owner. Cover both ordinary
  handling and loss of the service response, local persistence interruption and cold restart. Preserve
  exact pending submission, source coverage, counters, retained decision bytes and visible writing as
  required by the disposition; compare full durable propositions, not only a state label.
- Add generated order/retry histories and effective omission controls for the new boundary. Preserve and
  repair only demonstrated production counterexamples. Fixture keys must not directly mint the decision
  under test. Keep current exact-retry, refusal and accepted-head contracts intact.
- Run affected service/client/native/transport/vector checks, preserve evidence and archive the outcome
  before replacing only L-1. No real provisioning or second-device adoption is part of this phase.

**Personal checkpoint.** All 21 hashes in `dist/` and `.dev/releases/17d87c2/app`, all 31 prior vector
files, historical review and L-2 are unchanged. Personal preview/relay remain stopped. No real browser,
Account, factor, operator key, pin, origin or routing change occurred. Fixtures were disposable; new
bundles stayed in memory. Unrelated root `done ` and `reviewpacket96a20401ceb88d.md` remain untouched.
Host VM/policy research stays stopped. The actual old second device will adopt the first workspace
with fresh custody/store/counters/credentials, without importing or merging its previous writing.

**Other gates.** Remaining parser negatives, delivery-oracle and neutral-residue evidence, diagnostics/
salvage, measured maintenance/performance and accepted review follow-ups remain. General lineage,
successor checkpoints, concurrent membership, pruning/backlog scale, enrollment/device management,
revocation/rotation, clear/delete, finalization/total-loss recovery, PRF enrollment, supported platforms,
whole-profile residue, deployment/restore and independent review remain separate. L-2's historical ref
`d24732b` has no further service work to integrate. No personal server restart is authorized here.

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
