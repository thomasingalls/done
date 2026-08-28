# `S0-2` Stage A — durable record schemas

**Standing:** home — sections here are pinned and swept by the authority map; read back by
`pnpm authority:check`.

**Status:** proposed for `S0-8` review · not implemented · no generator or vector consumes these yet

Notation is the project's own: `LP(s) = uint16be(byteLength(utf8 s)) || utf8 s`, digests are SHA-256, signatures
Ed25519. Every multi-member digest sorts by name for row 15's stated reason — two devices building the same object
must produce the same idempotency key, and a map in insertion order would not.

## 1. `CertifiedRecipientSet` — `P-1`

Closes `f-c611666-rotation-reader-eligibility-missing` and `f-a073574-enrollment-recovery-key-unbound`.

```
CertifiedSet = LP("done/certified-set/v1") || LP(dec v)
               || LP(workspace_id) || LP(lineage_id)
               || LP(dec parent_epoch) || LP(dec next_epoch)
               || LP(hex members_digest)
               || LP(hex recovery_state_digest)

  members_digest = SHA-256( LP("done/certified-members/v1")
                            || ( LP(credential_id) || LP(hex W_pub) )*
                               sorted by credential_id )

  recovery_state_digest = SHA-256( LP("done/recovery-state/v1")
                            || LP(dec counter) || LP(hex R_pub)
                            || LP(hex recovery_envelope_digest)
                            || LP(hex root_commitment) )

  approval = Ed25519( an eligible content-holding client's signing credential ; CertifiedSet )
  approvals[] — one suffices (P-1 single-owner); the list is the carrier, so a
                threshold is later a verifier policy change, not a format migration.
```

**Why `W_pub` is inside `members_digest` rather than beside it.** §13.5's epoch already enumerates credentials; the
defect was never that the service failed to list them, it was that a service-signed list alone caused key delivery.
Binding the credential *to the exact wrapping key a rotator will encrypt to* is what makes a service-admitted
credential unable to receive `K_(g+1)`: there is no approved `(credential, W_pub)` pair for it.

**Why the recovery recipient is in the same object.** `f-a073574` is the same attack through a different carrier —
substitute `R_pub` and the honest new device wraps future generations to the attacker. One object, approved once,
covers both, and a rotator that consumes the certified set cannot wrap to a recovery key nobody approved.

**Consumption rule.** A rotator wraps to exactly the `(credential, W_pub)` pairs in the certified set for its
parent epoch, and to exactly that `R_pub`. Never to an epoch roster, never to a service-supplied key, never to a
boolean.

## 2. `RecoveryBootstrap` — `P-1`, no surviving eligible device

Preserves the validated four-object total-loss theorem. Without this, `CertifiedRecipientSet` would silently
require a fifth independently held object: a surviving approver.

```
Bootstrap = LP("done/recovery-bootstrap/v1") || LP(dec v)
            || LP(workspace_id) || LP(lineage_id)
            || LP(dec observed_epoch) || LP(hex observed_head_digest)
            || LP(hex service_nonce)
            || LP(hex prior_recovery_state_digest)
            || LP(hex recovered_root)
            || LP(new_credential_id) || LP(hex new_W_pub)
            || LP(hex new_recovery_state_digest)
            || LP(hex conflict_parent)

  sig        = Ed25519( the bootstrap signer ; Bootstrap )
  countersig = Ed25519( the new credential ; Bootstrap )
```

**The bootstrap signer is sealed beside `R_priv` under the same content factor**, so possession of the recovery
code yields it and no fifth object is introduced. The prior `RecoverySet` commits its verification key, which is
what makes this transition unforgeable by the service.

`observed_epoch`, `observed_head_digest` and `service_nonce` carry row 9's existing nonce-bound signed head
assertion unchanged. The freshness bound is the one already documented: a hostile service can withhold, not forge.
`conflict_parent` lets the service serialise competing bootstraps without being able to choose the winner's
contents.

## 3. Transition payload parts — corrected

Closes `f-4259822-recovery-replacement-payload-bytes-unbound` and
`f-4259822-recovery-replacement-no-forward-rotation`.

The defect is an inconsistency inside one generator. `rotationPayload` already binds exact bytes:

```
  cutoff        credential:seq:link, sorted, joined
  excluded      credential ids, sorted
  recovery-wrap the exact wrap bytes
  wraps         credential:wrapbytes, sorted
```

while `replace-recovery` binds only:

```
  new-recovery-public-key   ab..ab
  rewrapped-generations     "1|2|3|4|5"      <- generation NUMBERS, not bytes
```

So a signed replacement says *which* generations were rewrapped and not *to what*. Atomic replacement cannot mean
"one exact complete set won" when the set's contents are outside the signature. Corrected, mirroring rotate:

```
replacePayload parts:
  counter                   dec, the replacement counter
  new-recovery-public-key   hex R_pub
  recovery-envelope         hex — the EXACT sealed envelope bytes, tag included
  root-commitment           hex — P-6's factor-sealed (workspace, lineage, auth_root)
  wraps                     gen:wrapbytes, sorted by gen — EXACT bytes, every retained generation
  successor-generation      dec g+1, or "none-lost-not-copied"
```

**`successor-generation` is the forward-rotation binding.** Row 14 states replacement exists for the user who has
"lost — or **exposed**" the code, but replacement rewraps the *same still-active* generation, so an exposed
`R_priv` still opens current content. The corrected payload requires a successor generation, and the only way to
avoid one is the explicit `none-lost-not-copied` value — which the product may use only where copy distinguishes
that state and can establish it. An unbound choice is what let the exposed-code promise be claimed without being
kept.

## 4. `GenerationApply` — `RC-2` core

Closes `f-4259822-generation-switch-local-durability-undefined`. Row 15 already names `applying` in its local
order; nothing makes it durable, so a kill inside it is unrecoverable.

```
GenerationApply = { v, transition_id, outcome_digest, target_gen,
                    step, staged, settled_at }

  step ∈ ordered:
    1 outcome-verified      verified outcome persisted, pending payload retained
    2 opener-installed      K_(g+1) recovered and its successor opener durably installed
    3 objects-classified    every old-generation object classified: unminted delta,
                            record batch, exact outbound envelope, accepted mark,
                            checkpoint/suffix, package, recovery wrap
    4 work-covered          permissible local deltas covered under g+1; exact possibly
                            accepted g envelopes retained until authenticated resolution
    5 marker-advanced       active epoch/generation advanced atomically — only once no
                            new write can select g and g+1 is reopenable
    6 checkpoint-admitted   a semantically verified g+1 checkpoint admitted, local
                            content trimmed under g+1
    7 openers-retired       each old opener deleted only where §5 below permits
    8 settled               the apply record itself discharged, last
```

Each step is idempotent and restart resumes at the recorded step. Steps 1–4 are reversible; **step 5 is the
commit point**. `P-2`'s device lock and `replace-recovery` use this same machine rather than each inventing one.

## 5. `GenerationReferences` and the opener-retirement predicate

Completes `f-b997cdb-checkpoint-key-retention-inverted`. The row-7 and TRD sentence was corrected at `4e4d107` —
its subject is now the generation — but the predicate that enforces it did not exist.

```
GenerationReferences(gen) = {
  journals[], batches[], outbound_envelopes[], accepted_marks[],
  checkpoints[], suffixes[], packages[], reader_wraps[], recovery_wraps[]
}

  retire_opener(gen) permitted only when ALL hold:
    a. no journal, batch, outbound envelope or accepted mark references gen
    b. no package requires gen
    c. for EVERY retained checkpoint sealed under gen, at least one authorized
       opener for gen survives outside the object being deleted
    d. row 15's existing three-part gate is satisfied: settled, a checkpoint
       under the successor admitted, and local trim holds a state record under it
```

**(c) is the clause that was missing.** Row 15's gate (d) permits dropping the previous generation once a
successor checkpoint exists; it says nothing about whether the *second-newest* checkpoint — the one §11.3 test 8
mandates falling back to — is still openable. Deleting a local key envelope does not necessarily end access, since
a retained recovery or reader wrap may still open the generation; (c) is stated over openers rather than over any
single carrier for that reason.

## 6. `CustodyRecord`, extended — `P-2`

Row 13's record gains the replacement wrapping credential. Existing fields unchanged.

```
CustodyRecord = { v: 1, state: 'promptless' | 'enrolling' | 'locked',
                  seals: LockSeal[], rotation_owed: boolean,
                  wrapping_credential: {
                    id,
                    custody: 'promptless' | 'staged' | 'factor-sealed',
                    sealed: LockSeal-shaped | absent,
                    predecessor_id | absent
                  } }
```

At lock enable the replacement is generated as extractable bytes, sealed under `L_lock`, and imported
non-extractable after unlock — §13.4's existing PRF-tier pattern with `L_lock` as the factor source, rather than a
new carrier. `predecessor_id` remains until the certified-set successor and the generation winner are both durably
known, which is `P-2`'s selected cutover.

**`rotation_owed` is derived, never asserted.** It is true from step 3 of the custody swap until `GenerationApply`
reaches step 8, and no UI may claim future-copy protection while it is true. That is `f-dbfd01f`'s repair, and it
is a Stage E obligation that this field exists to make checkable.

## Falsifier map

Each of these is one isolated test in Stage D, failing before the schema and passing after.

| # | Falsifier | Schema |
| --- | --- | --- |
| 1 | A service-admitted credential absent from the certified set receives no wrap from a rotator that did not run the ceremony | 1 |
| 2 | A substituted `R_pub` is not wrapped to, even with a genuine `W_pub` | 1 |
| 3 | An authorized-but-unkeyed credential stays outside the set and receives no wrap | 1 |
| 4 | A stale certified set cannot be replayed against a later parent epoch | 1 |
| 5 | Two incomparable approvals serialise; the loser rebuilds against the winner | 1 |
| 6 | Four-object total loss with no surviving eligible client bootstraps, then rotates | 2 |
| 7 | A service-forged bootstrap fails; a stale or forked observed head is detected | 2 |
| 8 | Eliding any single byte of the recovery envelope or any generation wrap changes the replacement digest | 3 |
| 9 | An exposed code does not open content after replacement, unless `none-lost-not-copied` was explicitly selected | 3 |
| 10 | A kill at each of `GenerationApply` steps 1–8 resumes without losing old journal, batch, or unresolved outbound work | 4 |
| 11 | An opener is not retired while a retained checkpoint sealed under it has no surviving opener | 5 |
| 12 | Checkpoint fallback still works after two consecutive rotations | 5 |
| 13 | A pre-lock no-PRF profile cannot open `g+1` after a settled lock | 6 |
| 14 | The same profile can still open everything up to `g`, and `rotation_owed` was true for exactly the interval between custody swap and step 8 | 6 |
