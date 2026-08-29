# `S0-2` Stage A — durable record schemas

**Standing:** home — sections here are pinned and swept by the authority map; read back by
`pnpm authority:check`.

**Status:** proposed for `S0-8` review · amended 2026-08-28 at the `S0-2` return under `P-1`'s ratified rule
(the member triple, the named approver, the factor-carried bootstrap signer) and `P-3`'s ratified fence (§4
step 5) · the enrollment, head-discovery and transition generators consume §§1–3, and
`test/storageSchedule.test.ts` composes §4's machine

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
                            || ( LP(credential_id) || LP(hex W_pub) || LP(hex S_pub) )*
                               sorted by credential_id )

  recovery_state_digest = SHA-256( LP("done/recovery-state/v1")
                            || LP(dec counter) || LP(hex R_pub)
                            || LP(hex recovery_envelope_digest)
                            || LP(hex root_commitment)
                            || LP(hex bootstrap_signer) )

  approval = Ed25519( the named approver's signing credential ;
              LP("done/certified-set-approval/v1") || LP(approver_credential_id) || CertifiedSet )
  approvals[] — entries (approver_credential_id, approval); one suffices (P-1
                single-owner); the list is the carrier, so a threshold is later a
                verifier policy change, not a format migration.

  uniqueness — credential_id is the sort key and carries at most one entry.
               A set holding two entries under one credential_id is malformed
               and a verifier refuses the whole set; it does not pick one.

  resolution — a verifier resolves the named approver's member entry
               (credential_id ‖ W_pub ‖ S_pub) in the PARENT certified set and
               nothing else. The chain grounds at its two edges: the genesis set
               verifies under the creating credential's key, and a
               bootstrap-minted replacement set verifies under the
               factor-resolved bootstrap signer (§2). The service-signed epoch
               resolves no recipient-authority key — it carries the sets,
               serializes them, and vouches for none of them (P-1, ratified
               2026-08-28).
```

**Why `W_pub` is inside `members_digest` rather than beside it.** §13.5's epoch already enumerates credentials; the
defect was never that the service failed to list them, it was that a service-signed list alone caused key delivery.
Binding the credential *to the exact wrapping key a rotator will encrypt to* is what makes a service-admitted
credential unable to receive `K_(g+1)`: there is no approved `(credential, W_pub)` pair for it.

**Why `S_pub` joined it (2026-08-28, `P-1` reopened at the approver joint).** Both `S0-9` rounds convicted the
approval's own verifier: the set named no approver, `members_digest` bound wrapping keys only, and the one
credential-to-signing-key certification in the tree was §13.2's service-signed epoch — so a hostile service
could substitute a member's signing key, "approve" a successor adding its own credential, and delayed key
delivery by authorization alone survived the repair built to end it. The member entry now binds the signing
key, every approval names its approver in its signed bytes, and the resolution rule above is the one the
authority map checks for every key in the workspace: **a verification key resolves through client- or
factor-authenticated state, or it does not verify.** Flipping the named approver breaks the signature, so one
eligible member cannot replay another's approval as its own; an approval that does not name its approver is
malformed. `bootstrap_signer` enters `recovery_state_digest` for the same rule at the factor edge — see §2,
which the commitment makes true rather than aspirational.

**Why the recovery recipient is in the same object.** `f-a073574` is the same attack through a different carrier —
substitute `R_pub` and the honest new device wraps future generations to the attacker. One object, approved once,
covers both, and a rotator that consumes the certified set cannot wrap to a recovery key nobody approved.

**Why uniqueness is stated rather than assumed** (`R3-4`, `S0-9` round 3, 2026-08-29). A certified set
carrying two member entries for the same `credential_id` is malformed, and a verifier refuses the set rather
than resolving under either entry. The rule had no home before this sentence: `members_digest` sorts by
`credential_id` alone, so a duplicate leaves the order undetermined at the tie, and two conforming verifiers
could digest the same members into different bytes and resolve the same approval under different `S_pub`.
That is not a privilege escalation — under single-owner approval a rogue member can mint worse than a
duplicate — it is an interop and determinism hole at the construction every chain grounds in, and it
falsifies the stated idempotency-key property directly: *two devices building the same object produce the
same digest* is only true while the sort key is unique. **Refusing beats picking.** A verifier that resolved
the first, the last or the lexicographically-lesser entry would be a conforming verifier that disagrees with
another conforming verifier about who approved a set, which is the failure the rule exists to make
impossible. The generator's representation cannot express the case — `members` is keyed by `credential_id`,
so `Object.entries` deduplicates by construction — and that is why no published negative covers it; the
duty lands on the verifier `L-2` builds, which parses a wire list rather than a JavaScript object and must
check what the object made unrepresentable.

**Consumption rule.** A rotator wraps to exactly the `(credential, W_pub)` pairs in the certified set for its
parent epoch, and to exactly that `R_pub`. Never to an epoch roster, never to a service-supplied key, never to a
boolean.

## 2. `RecoveryBootstrap` — `P-1`, no surviving eligible device

Preserves the validated four-object total-loss theorem. Without this, `CertifiedRecipientSet` would silently
require a fifth independently held object: a surviving approver.

```
RecoveryState = { counter, R_pub, recovery_envelope_digest, root_commitment,
                  bootstrap_signer }
  — the factor-opened current recovery state. §1's recovery_state_digest is its
    commitment, and the certified set carries that digest, so the state resolves
    through client-authenticated state everywhere a client survives and through
    the factor at total loss. bootstrap_signer is the Ed25519 verification key;
    its signing half is sealed beside R_priv in row 14's envelope.

Bootstrap = LP("done/recovery-bootstrap/v1") || LP(dec v)
            || LP(workspace_id) || LP(lineage_id)
            || LP(dec observed_epoch) || LP(hex observed_head_digest)
            || LP(hex service_nonce)
            || LP(hex prior_recovery_state_digest)
            || LP(hex recovered_root)
            || LP(new_credential_id) || LP(hex new_W_pub) || LP(hex new_S_pub)
            || LP(hex new_recovery_state_digest)
            || LP(hex conflict_parent)

  sig        = Ed25519( the bootstrap signer ; Bootstrap )
  countersig = Ed25519( the new credential ; Bootstrap )

  acceptance — from the four objects and nothing else (P-1 falsifier 15):
    1. prior_recovery_state_digest equals the digest of the factor-opened
       current RecoveryState, or the bootstrap is refused as an authority
       failure — a stale or forked head, not merely a broken signature.
    2. sig verifies under current.bootstrap_signer, derived only from that
       state; a service-supplied verifier is nothing acceptance ever consumes.
    3. countersig verifies under the carried new_S_pub — the one key the parent
       set cannot carry, vouched by the binding the factor-resolved sig covers.

  replacement — every replace-recovery seals a fresh signer beside the new
    R_priv and commits it in the successor recovery_state_digest; a fresh-nonce
    successor signed by the prior capability is refused, and the refusal cites
    the rotated commitment, never an envelope decryption failure (falsifier 16).

  composition — an accepted Bootstrap's binding IS the replacement certified
    set: one member entry (new_credential_id ‖ new_W_pub ‖ new_S_pub) and
    new_recovery_state_digest, at parent_epoch = observed_epoch, verifying under
    the factor-resolved signer per §1's resolution rule. The recovered
    credential can then rotate, not merely read (falsifier 17).
```

**The bootstrap signer is sealed beside `R_priv` under the same content factor**, so possession of the recovery
code yields it and no fifth object is introduced. `recovery_state_digest` commits its verification key — the
carrier `FU-01` found missing: this section once asserted the commitment lived in a set object no schema
anywhere defined, while the executable acceptance used a constant; it now rides the digest §1 defines and the
certified set carries — which is what makes this transition unforgeable by the service.

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
    5 marker-advanced       active epoch/generation advanced atomically — and no
                            new write can select g, by the fence below, so g+1
                            is reopenable and step 3's classification is
                            complete the moment step 7 consumes it
    6 checkpoint-admitted   a semantically verified g+1 checkpoint admitted, local
                            content trimmed under g+1
    7 openers-retired       each old opener deleted only where §5 below permits
    8 settled               the apply record itself discharged, last
```

Each step is idempotent and restart resumes at the recorded step. Steps 1–4 are reversible; **step 5 is the
commit point**. `P-2`'s device lock and `replace-recovery` use this same machine rather than each inventing one.

**The fence, and it is the `S0-2`/`S0-3` interface (`P-3` joint 3, ratified 2026-08-28; `FU-09`).** Step 5's
"no new write can select g" was a claim both test suites stepped around: a writer holding a granted reservation
could cross the marker advance and commit a late `g` record after classification closed, into a generation
whose opener step 7 then retires. The ratified rule makes it construction rather than assertion: **the active
marker's home shares the record store's database, and a batch's committing transaction reads it under the same
IndexedDB serialization the allocator leans on — it validates the reservation's generation where the commit
lands, and aborts into re-reservation under the successor when the marker moved.** The abandoned range stays
counted against `g` (`P-3` falsifier 8's gap, doing its job). After marker-advance commits, no `g` record can
commit, so the classification step 7 consumes is complete — the composed model in
`test/storageSchedule.test.ts` schedules the interleaving and asserts the fence at it, inverted 2026-08-28 from
the reproduction the dispositions could only describe. `P-3` falsifiers 19–20 finished at the `S0-3` return
(2026-08-28): the write-admission machine consolidated the fence — `commitReserved` in
`test/writeAdmission.test.ts` validates the reservation's generation where the commit lands — and the composed
retirement assertion holds on the reproduction's own schedule.

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

**And the predicate's view is complete only because of §4's fence** (2026-08-28). Clauses (a)–(c) read what
exists; a record that commits under `gen` after the references were gathered is outside every clause's view,
which is `FU-09`'s mechanism. The fence closes the class: no `gen` record can commit after step 5, so
references gathered at or after the marker advance are the complete population when `retire_opener(gen)` runs.

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

## The `S0-2` return (2026-08-28)

The amendments above landed together with their executable halves, under `P-1` falsifiers 12–19:

- **12/13** — the approval verifier resolves the named approver's `S_pub` from the parent certified set
  (`generate-transition-vectors.mjs`; `certified-set-approved-by-an-impostor` inverted from round 1's mutation,
  plus the naming, replay and non-member negatives).
- **15/16** — bootstrap acceptance derives its verifier from the factor-opened `RecoveryState`, compares
  `prior_recovery_state_digest` against it, and refuses the retired signer citing the rotated commitment
  (`generate-head-discovery-vectors.mjs`).
- **17** — the composition rule above, run: the transition generator reads the accepted bootstrap, mints the
  replacement set, and verifies a successor approval by the recovered credential through the §1 lookup.
- **18 and criterion 11** — `test/enrollmentStates.test.ts`: §13.6's six states as executable states with crash
  points under `test/scheduler.ts`; two sibling successors at one `parent_epoch` serialize and the loser
  resumes to `certified` through a rebuilt successor.
- **14** — the authority map's member-key entries flipped with this edit; `pnpm authority:check` stays the
  class-1 ledger.
- **19** — `pnpm recipient:check` (`scripts/check-recipient-authority.mjs`): the homes-agree readback over
  §13.2/§13.5/§13.8, rows 9/11/14 and this file, plus the `FU-05` independent reconstruction of the enrollment
  transcript from published inputs alone.
- **`FU-09`'s interface half** — §4's fence, inverted in `test/storageSchedule.test.ts`; `P-3` falsifiers
  19–20 finish at the `S0-3` return.
