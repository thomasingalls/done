# `P-2` — locked-device future-generation gating

**Decided:** 2026-08-26 · **Branch:** `RC-2A`, replace the operational wrapping credential at lock enable ·
**Cutover:** old credential valid until the certified-set successor and generation winner are durably known ·
**Status:** decided, not yet consolidated

Consolidation is [`S0-2`](../action-tree.md), which still needs `P-6`. Depends on and preserves
[`P-1`](./P-1-recipient-authority.md). Nothing below is implemented.

## The defect this closes

Row 13's enrollment is correct about the thing it protects and silent about the thing beside it:

```
1. Generate L_lock; seal it under every factor; write state 'enrolling'.
2. Reseal each retained generation's KeyEnvelope under L_lock, staged.
3. One transaction: swap staged over live, delete L_local, state 'locked'.
4. Rotate the content key forward. rotation_owed until it lands.
```

`L_lock` protects the `KeyEnvelope`. It does not protect the **device wrapping credential**, and TRD §13.4
persists that credential in two tiers keyed on **PRF availability rather than on lock state**:

| Tier | Wrapping private key at rest | Survives a profile copy? |
| --- | --- | --- |
| PRF available | encrypted bytes under a PRF-derived key, imported non-extractable after unlock | no |
| PRF absent | a structured-cloned non-extractable `CryptoKey` | **yes, and usable** |

So a locked, code-only device has a factor-sealed envelope and a promptless credential. Rotation publishes a
reader wrap for that credential; a pre-lock profile copy retrieves it and opens `K_(g+1)` with its copied
handle. The lock is bypassed without being attacked.

**This is the common tier, not an edge case.** Row 13 makes the code factor always enrolled and PRF optional,
and §10.11 says PRF availability is a matrix of OS, browser and authenticator kind, with roaming
authenticators unreachable from iOS and iPadOS entirely.

## The decision

**Enabling the device lock replaces the promptless local opener *and* every promptless credential capable of
receiving future generations.** The replacement wrapping credential is generated at lock enable as extractable
bytes, sealed under `L_lock`, and imported as a non-extractable runtime key after unlock. Successor wraps name
only the replacement credential.

**Cutover:** the old local and operational credentials remain valid until the certified recipient-set successor
and the generation winner are both durably known. After the winner, no new write uses `g`.

## Why A rather than B

**The obvious third option is impossible, and that is worth recording.** You cannot factor-seal the *existing*
wrapping credential: TRD line 2079 states that "WebCrypto cannot later wrap a non-extractable target," and
§13.3 gives the same reason for why the lock cannot adopt `L_local`. A promptless non-extractable key cannot be
exported and re-encrypted. Gating that credential's storage therefore *requires* generating a new one, which is
this branch.

Three arguments then decide it against B:

1. **`P-1` already built A's propagation mechanism.** `CertifiedRecipientSet` carries the exact
   credential-to-`W_pub` bindings, client-approved and epoch-serialized, and each rotation consumes the latest
   certified set. Credential replacement is a certified-set successor, so every future rotator wraps to the
   replacement automatically. A's "authorization churn" cost was priced before `P-1` existed; it is now the
   ordinary path rather than a new burden.
2. **B reintroduces what `P-1` just eliminated.** B requires every other device to hold this recipient's
   lock-wrapping public state. Its own falsifiers include "another device rotates with stale lock metadata,"
   and its tradeoffs admit that inconsistent lock metadata can deny the device future generations. That state
   must live in the certified set — costing B its "fewer epoch changes" advantage — or in a second channel of
   recipient truth, which is the hazard `P-1` rejected.
3. **A reuses a selected pattern; B invents a carrier.** "Extractable bytes sealed under a factor, imported
   non-extractable at unlock" is verbatim §13.4's existing PRF tier, with `L_lock` as the factor source. No new
   format. B adds a nested outer wrap that nothing else in the design uses.

## Why this cutover

It matches the staging discipline row 13 already selects and `RC-2`'s mandatory core already requires: stage,
then swap atomically, and derive completion from durable state. Cutting over at the custody swap would shorten
the exposure window but leaves an interrupted transition unable to receive the next generation until repaired —
trading a bounded, *disclosed* window for an unbounded availability failure.

The window is real and must be stated rather than hidden: **between the custody swap and a settled rotation, a
pre-lock copy still holds `K_g`.** That is exactly what `rotation_owed` exists to say, and
`f-dbfd01f-device-lock-rotation-caveat-lost` is the record of it having been dropped from normative copy.

## The residual, scoped honestly

Replacement stops the copy receiving *future* generations. It does not erase what the copy already holds, and
the copied profile may retain a live account or relay session until it expires or is revoked. That remains
inside the declared no-remote-wipe, no-history-erasure boundary. Product copy must promise future custody, not
retroactive protection.

Same-origin hostile code after factor entry also remains in scope, unchanged.

## What `S0-2` must satisfy

1. A pre-lock no-PRF profile copy **cannot** open `g+1` after the lock has settled.
2. It **can** still open everything up to `g`, and the product says so.
3. `rotation_owed` copy is truthful for the whole interval between custody swap and settled rotation; no UI
   claims future-copy protection while it is true.
4. Kill at every `GenerationApply` step leaves a recoverable state: no lost old journal, unflushed batch, or
   accepted-but-unmarked envelope.
5. Credential replacement does not revoke signing or reader authority on any other device.
6. Factor loss behaves as declared, and disable/re-enable rotates again rather than restoring the old credential.
7. Another device rotating during the transition produces a result the locking device can still apply.
8. Newest-checkpoint loss after two rotations still falls back — the opener for the second-newest survives.
9. No opener is deleted while any journal, outbound envelope, retained checkpoint/suffix, package, or pending
   transition still references it.
10. Old recovery material does not open the active generation after a replacement.

## What this reopens

Rows 3/7/13/14/15; device-lock, recovery, transition, record and checkpoint vectors; credential and key
inventories; row-13 UI copy; tests 5/6/11 and the stale-profile and fallback scenarios.

## Rollback

Reconsider before recipient state or wrap formats are frozen into row 13/15 vectors.

## What this does **not** decide

- **`RC-2`'s mandatory core is not reopened by this choice.** Exposed recovery replacement still produces a
  fresh successor generation; every transition intent still commits the canonical complete payload including
  exact recovery envelope and wrap bytes; `GenerationApply` and the object-reference ledger are still required.
  Those are `S0-2` design work, not a `P-2` branch.
- **`P-6`** — Local archive factor/root, the last input `S0-2` waits on.
- The exact encoding of the replacement credential's seal, and whether signing keys are replaced alongside
  wrapping keys or only wrapping keys. This record decides that *every promptless credential capable of
  receiving future generations* is replaced; which credentials that set contains is `S0-2`'s inventory work.
