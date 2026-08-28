# `P-1` — recipient authority

**Standing:** home — the decision’s current status lives in the header below; read back by
`pnpm remediation:status`, which parses it and checks `HANDOFF.md`’s claim of it in both directions.

**Decided:** 2026-08-26 · **Reopened:** 2026-08-28, at the approver and bootstrap-signer joints ·
**Ratified:** 2026-08-28, option A — the certified set carries the signing keys · **Branch:** `RC-1B`,
client-certified recipient set inside each authorization successor · **Approval policy:** single-owner ·
**Status:** ratified, not yet consolidated — the `S0-2` return owes falsifiers 12–19

This is the decision record only. Consolidating it into the PRD, the TRD, rows 5/9/11/14/15 and their
generators is [`S0-2`](../action-tree.md), which also needs `P-2` and `P-6`. Nothing below is implemented.

**Read the reopening at the end of this record before consuming anything above as settled.** `RC-1B` stands;
what failed both `S0-9` rounds was the resolution of two verification keys this record's carrier consumes —
the set approval's and the total-loss bootstrap signer's — and that rule is now ratified: **option A. The
certified set carries the signing keys, every approval names its approver, and a verifier resolves that key
from the parent set or the factor — never from the service-signed epoch.**

## The defect this closes

Both `RC-1` findings are one failure in two carriers: **authorization alone causes delayed key delivery.**

A malicious authorization service admits a credential it controls, or supplies a new device a substituted
`R_pub`. The immediate ceremony correctly refuses nothing and catches nothing — row 11 authenticates the
genuine `W_pub` and the current head, and neither the typed symbols nor the wrap's `info` covers `R_pub`.
The attack lands *later*: an honest owner rotates for an unrelated reason, follows §13.7, and wraps
`K_(g+1)` to every remaining reader in the service-signed epoch and to `R_pub`. Nothing in the specified
local or shared state distinguishes a service-admitted credential from one whose delivery ceremony
succeeded, or a substituted recovery key from the genuine one.

The service then opens the new generation. That is the central non-custodial guarantee, lost from that
generation forward.

## The decision

**A service-signed epoch is usable for key distribution only when its recipient set is covered by a client
signature over the exact credential-to-`W_pub` bindings and the exact recovery recipient.**

`CertifiedRecipientSet(parent_epoch, next_epoch, members[], recovery_state_digest, client_approvals[])`.
An enrollment completion proposes the next set; each rotation consumes the latest certified set rather
than a service roster. The service serializes epochs and cannot add a recipient without client approval.
Removal is a new successor, never a mutation.

**Single-owner approval:** any one eligible content-holding client may approve a set change.

## Why B rather than A

The defect is that *the roster is service-signed only*. B corrects that roster. A builds a second
client-authenticated structure beside it and must then reconcile the two — and
[`corrected-end-state.md`](../corrected-end-state.md) names the hazard itself: two sources of recipient
truth conflict unless one is merely a projection of the other.

Three facts checked against the pinned tip weakened A's advantages:

| A's claimed advantage | What the tip actually says |
| --- | --- |
| B couples key distribution to content-authority availability | Every operation B gates already requires a content-authority client present. Row 11 types its SAS **from the new device into an existing one**, and §13.7 rotation is performed by the client that holds `K_g` and "wraps it to every remaining reader wrapping key and to `R_pub`". |
| A's certificate is portable where an epoch chain is not | Row 10's package already carries `epochs — enough signed authorization history`. Certified sets travel with it. |
| B blocks when no approving client survives | Both branches carry the same `RecoveryBootstrap`, so the no-surviving-device case is the bootstrap path either way. It does not distinguish them. |

B also inherits anti-equivocation rather than restating it. §13.5's head-vector argument — that an
equivocating service must **fork the lineage** rather than merely withhold — already rests on epochs being
serialized, signed and ancestor-checked. Client approvals ride that machinery; A's certificate would need
its own story for the same property.

## Why single-owner

A hard quorum requirement is circular for a one-device workspace: you would need two devices to enroll
your second, making the recovery bootstrap the only enrollment path. It also buys little against the
threat it appears to address — a compromised content-holding client already holds the keys and can leak
them directly, so a quorum constrains the *persistence* of an added reader rather than the disclosure.

**Deferred, not foreclosed.** `client_approvals[]` is a list. Raising a threshold later is a policy change
in the verifier, not a format migration. If `P-8` or a later threat pass wants N-of-M, the carrier already
admits it.

## What `S0-2` must satisfy

*Reopened 2026-08-28: these criteria stand, and they were not sufficient — criterion 6's second half was
composed nowhere, criterion 11 had no falsifier, and nothing below resolves the verification key an approval
or a bootstrap is checked against. The list continues at falsifiers 12–19, below.*

From `P-1`'s acceptance criteria and branch B's closure falsifiers. Each is a test, not a claim:

1. A future rotator that did not run the ceremony **rejects** a service-only admitted credential, while
   retaining every legitimate installed reader.
2. An `R_pub` substitution with a genuine `W_pub` is rejected — the recovery recipient is inside the
   certified set, not beside it.
3. Unauthorized set insertion by the service fails verification.
4. A stale certified set cannot be replayed against a later parent.
5. Two parents with incomparable approvals serialize; the loser rebuilds against the signed winner, as in
   row 15.
6. A four-object total-loss bootstrap with **no** surviving eligible client succeeds, and a subsequent
   rotation to the recovered credential succeeds.
7. A recovery-created replacement set that conflicts with a live set resolves deterministically.
8. A service that omits a legitimate installed reader is detectable.
9. A service-only forged recovery successor fails.
10. An authorized-but-unkeyed credential remains outside the certified set and receives no wrap.
11. Key delivery and set activation either commit together or leave a resumable pending certificate; every
    crash point between them is recoverable.

## What this reopens

Epoch schema and signatures; rows 5/9/11/15; transition and enrollment vectors; device-list semantics;
hostile-service and fork tests. **Row 5 is the real cost of this branch** — the accepted-head vector rides
the epoch payload, so changing what covers an epoch puts finalization in scope. `S0-4` consumes the result.

## Rollback

Reconsider before any epoch or certified-set byte format is declared selected. After that, a switch to `A`
is a protocol/version migration rather than a decision.

## What this does **not** decide

- `P-2` — locked-device future-generation gating. Now unblocked; this record fixes the recipient authority
  it depends on.
- `P-6` — Local archive factor/root, which `S0-2` also needs.
- `P-8` — checkpoint semantic and creation authority. Its quorum question is answered *by precedent* here,
  not settled: single-owner is the recommendation this record establishes, and `P-8` should adopt or
  explicitly diverge from it rather than deciding independently.
- The recovery bootstrap's exact bytes. Both branches required it identically, so this decision did not
  discriminate on it and `S0-2` still selects its encoding.

---

## Reopened 2026-08-28 — the approver's key and the bootstrap signer (round 1 `D-1`, round 2 `FU-01`)

**Everything above stands except what two lookups are allowed to trust, and each `S0-9` round found one.**
Round 1's protocol challenger built the first from the shipped artifacts
([`challenge-protocol.md`](../S0-9/challenge-protocol.md) `D-1`), and
[`DISPOSITION.md`](../S0-9/DISPOSITION.md) returns
[`f-c611666-rotation-reader-eligibility-missing`](../../findings/f-c611666-rotation-reader-eligibility-missing.md)
— high — here rather than to any vector. Round 2's authority challenger, serial and blind to round 1, found
the second ([`A-01`](../S0-9/followup-authority/challenge-authority.md), reconciled as `FU-01` in
[`FOLLOWUP-DISPOSITION.md`](../S0-9/FOLLOWUP-DISPOSITION.md)) with a return that is conditional on this
record: `S0-2` Stage A/B/D, reopening `P-1` only if the selected carrier cannot carry the recovery-bootstrap
authority. Resolving that conditional is part of this reopening's job.

**The first key: nothing client-authenticated resolves a set approval's verifier.** The `CertifiedSet`
message is eight fields and none of them names its approver; `members_digest` binds `(credential_id ‖
W_pub)*` — wrapping keys, not signing keys. The decision above says an approval comes from *an eligible
content-holding client*, and no client-authenticated state says which Ed25519 key that is: device signing
keys are certified in exactly one place, §13.2's authority table, which is the service-signed epoch — the
object this decision exists to dethrone. The credited negative hides the gap: its verification key is a
hard-coded constant, so it demonstrates that Ed25519 refuses a *different* key, never that the right key was
chosen. Round 1 made the generator do what a real verifier must — look the key up — and
`certified-set-approved-by-an-impostor` succeeded when it must not. The reachable consequence is the
finding's own attack with one free hop: a hostile service publishes an epoch substituting a member's signing
key, "approves" a successor set adding its own credential, and the next honest rotation wraps `K_(g+1)` to
it. Delayed key delivery by authorization alone — the failure this record opens with — survives the repair
built to end it.

**The second key: the bootstrap verifier is carried by nothing at all.** The normative
`recovery_state_digest` has exactly `counter`, `R_pub`, `recovery_envelope_digest` and `root_commitment`;
the envelope seals `R_priv` and the root commitment. [`A-schemas.md`](../S0-2/A-schemas.md) §2 says *"The
prior `RecoverySet` commits its verification key"* — and no `RecoverySet` schema exists anywhere; the digest
one section up cannot carry the commitment the prose asserts. The executable acceptance verifies under a
fixed out-of-band key and never compares `prior_recovery_state_digest` against factor-authenticated current
state, so a service-supplied verifier is indistinguishable from the promised factor-anchored one — and after
a recovery replacement no selected field retires the old signer, so an exposed bootstrap capability can sign
a fresh-nonce successor forever. The validated four-object theorem currently depends on an unbound fifth
authority parameter.

Both keys are one defect class — [`HANDOFF.md`](../HANDOFF.md)'s class 1, an acceptance step trusting a key
that no factor-authenticated state resolves — and `P-4` has already ratified that class's other half:
elapsed time executes a factor-authenticated instruction, or it does nothing. This record owes the
key-resolution half: **a verification key resolves through client- or factor-authenticated state, or it does
not verify.** The rule chosen here is the one `FU-02`, `FU-03`, `FU-06` and `FU-11` will follow through the
authority-derivation map, which is why `P-1` is next in the sprint.

### The reopened question

**Which client- or factor-authenticated state resolves the verification key of a certified set's approval —
and can the selected carrier also resolve, and retire, the total-loss bootstrap signer, or must the carrier
change?**

`RC-1B` itself is not reopened. Both challengers preserved the machine: the certified set inside each
successor, the exact `(credential, W_pub)` and `R_pub` bindings and their refusal negatives, epoch
serialization and §13.5's anti-equivocation inheritance, single-owner approval, and criterion 10's
authorized-but-unkeyed exclusion all held as built. What is reopened is what the approval's own verifier may
trust — and round 1's verdict on the scale of the repair is on record: the missing binding *"is not an
alternative to `RC-1B`, it is a missing part of it."*

### The floor that is not a choice

**Whatever is ratified must refuse the reproduction: no approval verifies under a key whose only voucher is
the service-signed epoch.** The resolution path from any recipient-authority signature — set approval,
bootstrap `sig`, `countersig` — to its verification key terminates in client- or factor-authenticated state,
with no service-only edge. That is the predicate the authority-derivation map
([`HANDOFF.md`](../HANDOFF.md) queue item 3) will check for every key in the workspace, and this ruling is
its first entry.

**The bootstrap edge is forced, not chosen.** At total loss the client-authenticated state *is* the four
objects — there is nothing else a verifier could come from — so the bootstrap verification key must be
factor-carried: committed in `recovery_state_digest`, its signer sealed beside `R_priv` under the same
factor, rotated by every recovery replacement, and the old key refused after. That makes `A-schemas.md` §2's
sentence true instead of aspirational, and it resolves `FU-01`'s conditional inside this record: **the
carrier is not changed, it is completed** — `recovery_state_digest` gains the commitment its own prose
already claims, at `S0-2` Stage A, and `P-1` reopens no further on that axis. Every option below inherits
this edge; what the options decide is where the *approver's* key lives.

**The window is the rollback clause's own.** This record said *reconsider before any epoch or certified-set
byte format is declared selected*. The format is in TRD §13.5, but nothing is closure-selected while `S0-9`
holds `S0-10` blocked — round 1 named this clause the applicable instrument. Amending the member entry now
is a decision correction; after Stage 0 closes it would be the version migration the clause warns about.

And two prior verdicts bind every option: whatever carries the keys either rides the serialized,
ancestor-checked epochs — inheriting §13.5's fork-don't-withhold argument exactly as the set does today — or
brings its own equivocation story; and criterion 10 stays, so the ruling must not force client approval of
mere admission.

### The options considered

One sub-question separates them: where a member's signing key lives.

**A — the certified set carries the signing keys. (Ratified.)** A member entry becomes `(credential_id ‖
W_pub ‖ S_pub)`; an approval names its approver in its signed bytes; a verifier resolves the named
approver's `S_pub` from the **parent** certified set and nothing else. The chain grounds at its two edges: the genesis
set verifies under the creating credential's key — the trust root workspace creation already writes — and a
bootstrap-minted replacement set verifies under the factor-resolved bootstrap signer, the floor's edge. This
is round 1's *"one more field per member"*, which it judged *"strictly smaller than the machinery that was
built"*, and `A-01`'s simpler-repair paragraph is this option's bootstrap half. The buy is one resolution
rule for every recipient-authority key in the workspace: set-chain or factor, no third root. The costs,
recorded: the `CertifiedSet` and enrollment formats amend inside the rollback window; row 11's ceremony
transcript must bind `S_pub`, so the SAS vouches for the signing key as well as the wrapping key (`S0-2`
Stage C/D rework, with `FU-05`'s vector republication riding the same regeneration); and a member's
signing-key rotation becomes a set successor — one more successor cause for the serializer, priced by the
machinery removal already uses.

**B — the epoch keeps the signing keys, and the certified set countersigns the epoch's key table.** The set
gains a digest over the epoch's credential-to-signing-key table; a verifier reads `S_pub` from the epoch but
refuses unless that table hashes to what the latest approval covered. The buy is the smallest diff to §13.5
and an untouched ceremony. The costs: the signed object is composed by the service, so a service
serialization detail becomes normative for clients; and the digest must choose between covering the whole
table — where admitting an authorized-but-unkeyed credential, criterion 10's deliberately service-side case,
invalidates the standing approval and forces clients to re-approve mere admission — or covering the member
subset, where the same member-to-key fact lives in two homes with any checker reading one: `RC-8C`'s shape,
this program's most-recurring defect, rebuilt at its most security-critical joint. And B still needs the
floor's factor path for the bootstrap, so the authority map gets two resolution rules where A has one.

**C — a certificate chain beside the set.** Enrollment issues a client-signed certificate binding the new
credential to its `S_pub`, chaining to genesis; an approval travels with its chain. The buy is the shape
every PKI reader expects, resolvable without the set chain at hand. The costs are the ones that buried
branch `A` above: a second client-authenticated structure whose truth must be reconciled with the set's;
certificates outlive membership, so removal — a set successor — no longer retires the removed member's power
to *approve* unless a revocation object joins, and the set already is that object; and the chain does not
ride the serialized epochs, so anti-equivocation needs exactly the separate story this record declined to
write the first time. C re-derives the set's machinery beside the set.

### Ratified 2026-08-28 — A, the certified set carries the signing keys

**The ruling.** A member entry binds `(credential_id ‖ W_pub ‖ S_pub)`; every approval names its approver in
its signed bytes; a verifier resolves the named approver's `S_pub` from the parent certified set and nothing
else. The chain grounds at its two edges and nowhere else: the genesis set verifies under the creating
credential's key — the trust root workspace creation writes — and a bootstrap-minted replacement set
verifies under the factor-resolved bootstrap signer, per the floor. A member's signing-key rotation is a set
successor, priced by the machinery removal already uses. **The service-signed epoch resolves no
recipient-authority key** — it carries the sets, serializes them, and vouches for none of them. `FU-01`'s
conditional is thereby determinate: the carrier is completed, not changed — `recovery_state_digest` gains
the signer commitment at `S0-2` Stage A, and `FU-01`'s return stays there rather than here. Falsifiers 12,
13 and 18's ratified home is the parent certified set.

**Why A.** It is the only option with one resolution rule: every key an acceptance predicate consumes
resolves through the set chain or the factor, so the authority-derivation map gets a single root and the
sibling joints (`FU-02`, `FU-03`, `FU-06`, `FU-11`) get one pattern to follow. It is round 1's own scale
judgment made normative — *"one more field per member"*, *"strictly smaller than the machinery that was
built"*, a missing part of `RC-1B` rather than an alternative to it — and `A-01`'s simpler-repair paragraph
is its bootstrap half. B countersigns a service-composed document and must either invalidate standing
approvals on mere admission, breaking criterion 10, or split the member-to-key fact across two homes —
`RC-8C`'s shape at the most security-critical joint. C rebuilds the set's machinery beside the set and
forfeits the inherited equivocation story. The cost is accepted with eyes open: row 11's transcript binds
`S_pub`, and that binding is now load-bearing — falsifiers 12–13 and the `S0-8` AAD registration exist so it
is tested rather than prose.

### Falsifiers 12–19

Continuing the eleven above, under the ratified rule. Each is a test, not a claim; 12, 13 and 18 resolve
against the parent certified set.

12. **The reproduction fails with the lookup real.** The approval verifier resolves its key from the
    ratified home rather than a constant, and `certified-set-approved-by-an-impostor` still fails — round
    1's mutation, inverted into the permanent shape of the negative. A service-published epoch that
    substitutes a member's signing key yields an approval that does not verify.
13. **An approval names its approver, and the naming is covered.** An approval without its approver in its
    signed bytes is malformed; flipping the named approver breaks the signature; one eligible member cannot
    replay another's approval as its own.
14. **No service-only edge.** For every verification key an acceptance predicate consumes — approval,
    bootstrap `sig`, `countersig` — the authority-derivation map resolves it to client- or
    factor-authenticated state, and a dangling or service-only edge fails the map's checker rather than a
    review.
15. **The bootstrap verifier is factor-carried.** Acceptance derives it only from the factor-opened current
    `RecoveryState`; a service-substituted verifier is refused; `prior_recovery_state_digest` is compared
    against factor-authenticated current state, so a stale or forked bootstrap head fails as an authority
    refusal, not merely as a broken signature. At total loss, acceptance consumes the four objects and
    nothing else.
16. **Replacement retires the old signer.** After `replace-recovery`, a fresh-nonce successor signed by the
    prior bootstrap capability is refused — `A-01`'s standing attack — and the refusal cites the rotated
    commitment, not an envelope decryption failure.
17. **Bootstrap output becomes rotation capability.** Criterion 6's second half, composed at last: the rule
    that turns `new_credential_id ‖ new_W_pub ‖ new_recovery_state_digest` into the active certified set
    exists and runs, and a subsequent rotation by the recovered credential succeeds. The recovered
    credential can rotate, not merely read.
18. **Sibling successors serialize, and the loser resumes.** Two enrollments at one `parent_epoch` produce
    two sets differing only in `members_digest`; exactly one activates; the loser's device reaches
    `certified` through a rebuilt successor against the winner rather than stranding at
    `installed-and-countersigned` — round 1 `D-4`'s unfalsified doubt, made a test at the join criterion 11
    names.
19. **The homes agree.** §13.2's authority-table row for device signing keys, §13.5, §13.8, rows 9/11/14,
    [`A-schemas.md`](../S0-2/A-schemas.md) §§1–2 and this record state the ratified rule, and a readback
    fails while any of them still publishes epoch-only signing-key certification or the uncarried
    `RecoverySet` commitment — the `FU-07`/`FU-13` shape, refused here as `P-4` refused it at its boundary.

### Consolidation owed at `S0-2`, regenerated at `S0-8`

- §13.2's authority table: the device signing-key row names the ratified home; §13.5's `CertifiedSet`
  formula and [`A-schemas.md`](../S0-2/A-schemas.md) §1 amend together, per the ratified option.
- §13.8 gains the `RecoveryBootstrap` construction §13.2 already cites — round 1 `D-3`'s dangling normative
  reference closes in the same edit; `recovery_state_digest` gains the signer commitment; row 14's envelope
  seals the bootstrap signer beside `R_priv`.
- The composition rule for falsifier 17, and the enrollment crash model criterion 11 has always owed —
  §13.6's six states become executable states with crash points (round 1 `D-4`), at the `S0-2`/`S0-3`
  scheduler the queue's structural item builds.
- Row 11's transcript binds `S_pub` — A is ratified — and `FU-05`'s formula and vector inputs republish in
  the same regeneration.
- At `S0-8`: the amended `CertifiedSet` registers with `check-aad-coverage.mjs` — round 1 `D-2`'s five
  unisolated fields die there — and the impostor negative's published `why` is rewritten to what the
  artifact then proves.

### What this reopening does not decide

- **Single-owner approval.** Neither round challenged cardinality; the threshold remains a verifier policy
  change on the `client_approvals[]` carrier, exactly as decided above.
- **The sibling class-1 joints** — `FU-02` (`S0-6`), `FU-03` (`S0-6`), `FU-06` (`S0-4`), `FU-11` (`S0-5`).
  This record sets the resolution pattern they follow through the authority map; their rulings stay at
  their own returns.
- **`K_store` scoping** — `P-3`, next in the sprint.
- **The exact bytes** of the amended member entry, `RecoveryState` and `Bootstrap` — `S0-2` Stage A selects
  encodings under the ratified rule, exactly as this record already reserved for the bootstrap.
