# `P-1` — recipient authority

**Decided:** 2026-08-26 · **Branch:** `RC-1B`, client-certified recipient set inside each authorization
successor · **Approval policy:** single-owner · **Status:** decided, not yet consolidated

This is the decision record only. Consolidating it into the PRD, the TRD, rows 5/9/11/14/15 and their
generators is [`S0-2`](../action-tree.md), which also needs `P-2` and `P-6`. Nothing below is implemented.

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
