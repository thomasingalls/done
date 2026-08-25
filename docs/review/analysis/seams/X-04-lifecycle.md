---
schema: 1
kind: work-item
id: X-04
status: complete
owner: /root
started: 2026-08-25
updated: 2026-08-25
blocked_on: none
---

# `X-04` — lifecycle

## Scope and exclusions

Re-derive enrollment, account unlock, device revocation, content rotation, recovery replacement, lapse,
retirement, and account deletion across the pinned lineage. Test replay, operation substitution, duplicate and
conflicting intents, lost signed outcomes, stale-device return, and total-device-loss recovery. Production changes,
overall synthesis, and the independently owned continuity and platform/evidence seams are excluded.

## Exact sources inspected

- Original boundary: `c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §§2.3–2.5, 6.1–6.11,
  7.2–7.8 and the same SHA's `docs/TRD.md` §§6.5, 7.3–7.6, 11.1–11.3, 13.2–13.9, 14.1–14.4,
  15–16; original claims `OC-002`–`OC-003`, `OC-016`–`OC-022`, `OC-026`–`OC-029`, `OC-033`–`OC-035`,
  `OC-039`, `OC-044`–`OC-046`, `OC-073`–`OC-078`.
- Pinned end state: `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/PRD.md` §§6.1–6.11, 7.2–7.8 and
  `:docs/TRD.md` §§6.5, 11.1–11.4, 13.2–13.9, 14.1–14.4, 15–16; end-state claims `E-03`–`E-04`,
  `E-07`–`E-17` and the F-02 state-machine inventory.
- Exact tip selection records for rows 9–16, with complete reads of the enrollment, account-credential,
  device-lock, recovery, transition, package, head-discovery, and hosted-retention constructions.
- Exact tip generators/vectors for enrollment, account credentials, head discovery, recovery, transitions,
  packages, and device lock, plus `scripts/check-retention.mjs` and the service data inventory.
- Exact diffs/cards and batch analyses for `a073574fcb90f9f2a70fa1be2bae5dc1d9c364f3`,
  `992bc9113093fe04d20df0247aa118d0f8ba365f`, `745e332b061e0e964ae655e853f2f3b393667c66`,
  `f5def83ac6f21873ab7fb589247dd116fc2febd9`, `b9ff071ddb4ee67e47179e549b5ad22a429ac5ee`,
  `4259822828060fe2b9592fa525cd9a17170af285`, `cdd206952b7cc0c6511fc1ee6ccc740c1b129407`, and
  `ff0b48f8ce7f1878ac6abb9c849380800b55370c`.
- Completed F-01/F-02 models, X-01 key-custody analysis, X-02 crash/persistence conclusions, X-03 accepted-state
  analysis/session handoff, and every existing finding touching enrollment, recovery, rotation, checkpoints,
  packages, slot unlock, or lifecycle status.
- Disposable exact `9edd9300adebcec3abd2234c946f1dcccdc17eef` archive `/tmp/lineage-x04.uYnJwV`, Node
  `v26.7.0`: all seven relevant generators passed `--check`; the retention check found twelve months consistently
  across five anchors and every §16 `unselected` cell mechanically bounded.

## Method

Model lifecycle axes separately before following named operations: authorization lineage, hosted bytes, device
grant, local slot, content generation, and recovery set. For each operation, identify the authority, durable input,
commit evidence, local/service cleanup predicate, and state after a lost response. Then test one change at a time:
replay the same signed object, substitute another operation, submit a duplicate or conflict, kill at every named
boundary, return with stale state, and remove all devices. Only after reconstructing these machines compare the
generators, inherited findings, and original/end-state claims.

| Relevant claims/rows/commits | Reconstructed invariant | Actors and durable state | Scenario or counterexample | Evidence | Conclusion |
| --- | --- | --- | --- | --- | --- |
| `OC-016`, rows 9/11/12, `a073574`, `992bc91`, `b9ff071` | Service admission and person-mediated reader delivery are separate; an enrolled device authenticates every recipient it will later trust | Existing and enrolling devices, authorization service; admitted credential, SAS transcript, installed reader/recovery keys | Admit a service key, fail SAS, then rotate; separately substitute `R_pub` while the genuine new `W_pub` and head pass SAS | Row-11 transcript/generator; row-15 wrap map; X-01 reader analysis | `reopen` — the missing durable reader-eligibility object survives, and the recovery public key is a second unauthenticated delayed recipient. |
| `OC-019`, row 12, `b9ff071` | Slot reopen proves the account credential locally and grants only already-local access | Local client and account authenticator; service-signed slot binding, fresh challenge, closed local ciphertext slot | Replay an old assertion, rewrite purpose, use a stale binding after revocation/deletion, then ask for network capability | Exact challenge/verifier and vectors; service-signed binding | `affirmed` for local/network separation, `qualified` by cross-origin policy and missing integrated close/reopen transaction. |
| `OC-017`–`OC-018`, `OC-029`, rows 5/15, `4259822` | Revocation commits successor authorization, new client-generated generation/wraps, and final cutoff; stale devices remain local and may carry accepted pre-cutoff work | Online rotator, stale/removed devices, authorization and content services; pending intent/outcome, successor key, cutoff, journals | Lose outcome, return as excluded device, return as still-authorized offline writer, kill while installing successor key | Signed outcome/vector; X-03 apply-order finding | `affirmed` abstractly, `reopen` locally — signed mine/other/silence and narrow propagation promise are coherent; successor-key/journal/outbound durability is not selected. |
| `OC-034`, rows 14/15, `4259822`, `ff0b48f` | Replacement installs exactly one new recovery set and step-up authorizes that exact operation once | Recovery holder, account authenticator, service; old/new envelopes and wraps, exact pending intent, signed winner | Replay assertion, redirect to retire, race two replacements, mutate envelope/wrap bytes, retain old recovery material and read later same-generation content | Recovery/transition generators and exact payload fields | `affirmed` for purpose/id binding; `reopen` for missing exact payload coverage and missing forward rotation after exposure. |
| `OC-021`, row 16, `cdd206` | Lapse stops hosted sync without retiring lineage; applicable expiry deletes hosted ciphertext/wraps and not local state or recovery identity | Account service, hosted stores, surviving devices; lapse clock, retained recovery identity, hosted inventory | Resume before/after expiry, keep multiple divergent devices, confuse lapse with retire | PRD/TRD, inventory, retention checker | `affirmed` as policy/state separation, `qualified` as unimplemented expiry/reseed transaction. |
| `OC-020`, rows 10/15, `745e332`, `4259822` | Retirement commits terminal lineage with hosted bytes present, distributes safe survivor/package evidence, then deletes service copies | Retiring/current/stale clients and hosted services; terminal record, portable package, deletion inventory | Lose outcome/package reply, retire from only stale devices, kill at each deletion class | Retire vector, package vector, inventory, PRD/TRD ordering | `reopen` — kind/order are sound, but no durable safe-survivor/export acknowledgement or deletion predicate connects the closed rows. |
| `OC-034`, rows 9/10/14, `745e332`, `992bc91` | Total-loss recovery keeps account access, authorization, content factor, and ciphertext independent and gets a once-only first head | Recovering client, account/authorization services, archive; signed head, code-sealed key, wraps, ciphertext/package root | Replay head assertion; let hostile service choose first head; replace package root; remove one recovery object | Head/package/recovery vectors and existing package-root finding | `qualified` — the four-object model and relay nonce survive; hostile-service first contact and the rewrappable package root bound recovery assurance. |

## Analysis

### Lifecycle axes and authorities

The labels `Local`, `Account`, `lapsed`, `revoked`, and `retired` are projections over independent state. Treating
one as the other causes most lifecycle failures:

| Axis | States relevant here | Authoritative evidence | Must not imply |
| --- | --- | --- | --- |
| Authorization lineage | never established · live · retired | Signed epoch/head or terminal record | Hosted bytes, local slot, or current account session |
| Hosted content | absent · current · retained read-only · expired/deleted | Durable-store/inventory state | Live or retired authorization by itself |
| Device grant | admitted-only · reader-eligible · revoked/detached | Service epoch plus independent successful key-delivery evidence | Reader eligibility from service admission alone |
| Local slot | active · closed · removed | Slot index and local unlock binding | Network account/session authority |
| Content generation | `g`, pending `g+1`, committed `g+1`, retained historical openers | Signed transition outcome plus durable local opener/marker | Completion from a service reply alone |
| Recovery set | old · pending replacement · new | Code-sealed envelope, `R_pub`, exact wraps, signed transition | Forward exclusion of a copied old `K_g` without rotation |

This separation affirms several original nuances. Sign-out closes a local slot but neither removes its ciphertext nor
revokes its grant. Removal clears one slot and requests revocation; reset clears every slot it can identify. Remote
revocation cannot wipe a detached replica. Lapse keeps a live lineage while hosted bytes change state. Retirement
ends the lineage while local replicas remain usable.

### Account creation, promotion, and enrollment

Promotion is correctly a move of one never-established workspace rather than a copy or merge. It keeps `K0`, creates
operational/recovery credentials, admits a genesis checkpoint/head, and only then erases unsealed `R_priv`. Start-
fresh creates a parallel account workspace and leaves the Local one intact. A retired workspace cannot take the
genesis shortcut and instead follows migration. The required next-launch invariant—exactly Local or promoted, never
identity and content root out of step—is clear, although the cross-store transaction remains future work.

Ordinary enrollment has two gates:

```
account authentication -> service-admitted credential / successor epoch
person-mediated committed SAS -> existing client releases K_g to authenticated W_pub
```

Commit-before-reveal prevents adaptive SAS grinding; typing rather than comparison makes the person actually convey
the five symbols; the transcript binds epoch/head and both credentials; transcript-bound HPKE prevents wrap swapping.
A mismatch spends the admitted credential and a retry mints a new credential/transcript. Those are sound immediate-
delivery conclusions.

Two later-recipient gaps survive. First, no client-authenticated success object tells another future rotating device
that a service-admitted reader completed delivery; existing high candidate
[`f-c611666-rotation-reader-eligibility-missing`](../../findings/f-c611666-rotation-reader-eligibility-missing.md)
therefore survives the lifecycle test. Second, ordinary enrollment authenticates `W_pub` and the head but not the
workspace `R_pub`/recovery envelope. A malicious authority can let the honest first delivery succeed, substitute its
own recovery recipient, and wait for the new device to wrap a later generation to it. New candidate
[`f-a073574-enrollment-recovery-key-unbound`](../../findings/f-a073574-enrollment-recovery-key-unbound.md) records
that independent delayed path.

The same missing success artifact is the durable enrollment crash gap: authorized-but-unkeyed, mismatch-spent, wrap-
delivered-but-not-installed, and fully reader-eligible must be distinguishable across restart. This analysis does not
duplicate it as a second finding because an exact transferable eligibility state is the common missing object.

### Slot close and account unlock

The service-signed slot binding prevents a local editor from replacing the verifier public key. A fresh client-
generated nonce, purpose label, principal, and credential id bind the WebAuthn assertion to one local reopen attempt.
Verification of binding, returned id, parsed client data, origin, RP ID, UP/UV, and signature grants only the local
slot. A stale binding after revocation or account deletion can reopen bytes already on the device, which is an
explicit residual and not restored service authority.

Replaying an old assertion requires the fresh nonce to repeat; operation substitution to sign-in fails because the
label differs and the service accepts only its own single-use challenges. Recovery can replace a missing account-
credential proof for terminal local rebinding but may not bypass an independent device lock. Existing candidate
`f-b9ff071-webauthn-cross-origin-policy` remains an X-06 platform/policy qualification rather than a new lifecycle
finding.

### One transition protocol and its replay/conflict cases

The generic wire state is coherent:

```
persist signed exact intent before network
  silence / lost response -> resubmit identical bytes
  signed outcome with my id -> apply
  signed outcome with another id -> discard candidate; rebuild at new epoch
```

`kind` in both intent and outcome prevents `rotate`, `replace-recovery`, and `retire` substitution. The recovery
step-up signs the intent id and therefore transitively the kind, lineage, parent, target, and selected payload digest;
an assertion for replacement cannot authorize retirement. A duplicate identical intent is idempotent. Conflicting
same-target intents produce one signed winner, and the loser must rebuild because its exclusion/material set was
computed at the old parent. A rotate and retire racing from the same parent are separate at-most-once keys, but the
authorization lineage's serialized single-successor rule must still reject the stale parent; the transition table
alone is not that serialization.

A lost signed outcome is safe only because the pending exact intent remains durable and the service retains its
outcome. No timeout may license discard. This wire conclusion survives. X-03's existing
[`f-4259822-generation-switch-local-durability-undefined`](../../findings/f-4259822-generation-switch-local-durability-undefined.md)
still reopens the local `applying` state: successor `KeyEnvelope`, active marker, pending cleanup, old journal/batch,
and possibly accepted old envelopes have no selected crash order.

Service-issued recovery nonces are specified as retired on use. Their exact persistence/transaction with the
transition table is unselected, but a commit-before-retire crash can only replay the same bound intent and returns
the same outcome; retire-before-commit fails closed by requiring a new user assertion. No separate finding survived
once intent binding and idempotency were applied. A rollback of both durable tables remains an as-built storage/
backup problem rather than evidence against the abstract protocol.

### Revocation, content rotation, and stale-device return

Committed revocation correctly conjoins successor authorization, client-produced `K_(g+1)`/wraps, and a finalized
accepted cutoff. The excluded device keeps history and local writability but cannot add accepted positions after its
final head. A still-authorized device offline across the commit may return with genuine accepted old-epoch work and
continues to be admitted; after it observes the outcome it switches forward. Thus the honest confidentiality promise
is device-observation-relative: content written by devices that observed the commit is closed to the removed reader.
No remote wipe or instant global exclusion is claimed.

The stale-return proof depends on two open joints. Rotation cannot know whom to wrap to without the durable reader-
eligibility object, and a successful device-lock rotation can be bypassed by a copied no-PRF operational wrapping
credential receiving its normal self-wrap. Existing candidate
[`f-f5def83-device-lock-reader-key-bypass`](../../findings/f-f5def83-device-lock-reader-key-bypass.md) survives.
The explicitly reachable `rotation_owed` state also means unconditional “from now on” copy remains overstated in
`f-dbfd01f-device-lock-rotation-caveat-lost`.

### Recovery replacement and total-device-loss recovery

The recovery code construction is internally strong under its generation invariant: 125 generated bits, no user
choice/truncation, and a code-sealed `R_priv` whose salt makes one key per seal. Replacement properly requires
content access by use, a new confirmed code, and a fresh service-nonce WebAuthn assertion over the transition id;
the old code is deliberately not required. A racing replacement loses by signed outcome and must generate a fresh
intent/assertion.

Two replacement conclusions reopen:

1. The exact published replacement payload binds `R_pub` and the names `1|2|3|4|5`, not the sealed envelope or
   actual wrap bytes. A mismatched/corrupted set can therefore receive a valid winning outcome under the exercised
   construction. New candidate
   [`f-4259822-recovery-replacement-payload-bytes-unbound`](../../findings/f-4259822-recovery-replacement-payload-bytes-unbound.md)
   records the availability consequence.
2. Replacement rewraps the same generations. A holder of exposed old code plus retained old envelope/wrap material
   can keep `K_g` and read future ciphertext under `g` until another rotation. That contradicts the broader
   rotate-on-lost-read-access principle and the stated exposed-code use case. New high candidate
   [`f-4259822-recovery-replacement-no-forward-rotation`](../../findings/f-4259822-recovery-replacement-no-forward-rotation.md)
   records the bounded forward-confidentiality failure.

Total-device-loss recovery correctly requires four independent objects: account access, service authorization, a
content factor, and ciphertext. The nonce-bound head assertion prevents relay replay and makes a hostile
authorization service the remaining first-contact authority. The service can still choose a stale self-consistent
head; the usual bound is a stale generation/visible partition. Recovery packages add a separate, surviving high
candidate: `f-745e332-package-root-rewrap-substitution` shows an archive writer can rewrap attacker content to
genuine `R_pub` while choosing an attacker root, so `info` does not authenticate who made the wrap.

### Lapse, expiry, retirement, and deletion

Lapse is correctly not retirement. After grace, hosted synchronization stops, devices remain locally writable, and
the applicable retention clock begins. Twelve months is consistently stated as the minimum promise and the selected
expiry at which hosted ciphertext/wraps are deleted; `R_pub` and the sealed recovery envelope survive so a remaining
device can re-seed. Before expiry, resumption needs no code when a device survives; total loss needs all four
recovery objects. After expiry, multiple surviving replicas still share an ancestor and should converge rather than
choose one.

The expiry deletion and reseed machines remain specification obligations: partial removal across envelopes,
checkpoints, wraps, backups, and later re-upload has no selected durable state. The inventory and generated deletion
tests explicitly defer that to the as-built service, so this is recorded as `qualified` rather than as a claim that
the selected duration is wrong.

Retirement gets the fail-closed first half right: commit the terminal lineage while hosted bytes remain, then
distribute portable evidence, and only then delete. An interrupted deletion must never be live lineage with missing
content. The exact retire intent/outcome establishes kind/idempotency but does not carry a verified-current survivor,
fresh export, package receipt, or catch-up result; the package selection explicitly defers that joint. New high
candidate
[`f-4259822-retirement-safe-survivor-gate-undefined`](../../findings/f-4259822-retirement-safe-survivor-gate-undefined.md)
records the permanent-loss state reachable if the deletion worker has only terminal/account-deletion state.

An offline device may legitimately miss the terminal package, keep its last signed live head, and remain a detached
stale replica. It must not claim retirement, silently mint new identity, or be counted as complete. Importing the
terminal package later upgrades its knowledge. Those narrow residuals are preserved rather than misreported as
deletion failure.

### Evidence boundary

All exact-tip generators relevant to this seam reproduce their committed artifacts. They establish message
encodings, signatures, field-isolating negatives, deterministic sorting, and documented residual examples under one
project model. They do not run an account/authorization service, persist enrollment success, distribute authentic
recovery material, install a successor local key, retire a service nonce, delete hosted objects, or prove a terminal
package reached a safe survivor. The predecessor application/relay remains outside these target machines.

## Affirmative conclusions

- The six lifecycle axes remain distinct. Sign-out, removal, revocation, lapse, hosted expiry, and retirement do not
  inherit each other's destructive effects.
- Promotion keeps a never-established workspace and `K0` without copying or merging; start-fresh preserves the Local
  workspace separately; retired lineage correctly routes to migration instead of genesis.
- Commit/reveal typed SAS, epoch-head and new-reader-key binding, and transcript-bound HPKE give a sound immediate
  enrollment-delivery ceremony at the specification/vector layer.
- The service-signed asymmetric slot binding prevents local verifier-key substitution, and slot unlock grants no
  network authority. A stale binding's already-local scope is stated honestly.
- The signed transition mine/other/silence rule survives replay, duplicate intent, same-target conflict, lost outcome,
  and cross-kind substitution challenges abstractly. Indefinite pending under silence is the fail-closed result.
- Revocation correctly means accepted cutoff plus forward generation for devices that observed it, not remote wipe,
  history erasure, or instantaneous global propagation.
- Recovery keeps account access, authorization, content factor, and ciphertext as four independent requirements.
  Code entropy/no-stretching and nonce-bound operation step-up remain sound under their explicit assumptions.
- Lapse retains a live lineage and writable local devices; retirement creates a terminal lineage and detached Local
  replicas. The twelve-month policy is mechanically consistent across the pinned end state.
- Terminal-before-byte-deletion is the correct fail-closed direction even though the safe-survivor acknowledgement
  connecting those states remains unselected.

## Candidate or validated findings

- New, high/high:
  [`f-a073574-enrollment-recovery-key-unbound`](../../findings/f-a073574-enrollment-recovery-key-unbound.md).
  Enrollment authenticates `W_pub` and the head but not the `R_pub` a new device later trusts for rotation.
- New, high/high:
  [`f-4259822-recovery-replacement-no-forward-rotation`](../../findings/f-4259822-recovery-replacement-no-forward-rotation.md).
  Replacing an exposed code keeps the active generation already opened by retained old recovery material.
- New, medium/high:
  [`f-4259822-recovery-replacement-payload-bytes-unbound`](../../findings/f-4259822-recovery-replacement-payload-bytes-unbound.md).
  The executable replacement payload omits the exact recovery envelope and wrap bytes.
- New, high/high:
  [`f-4259822-retirement-safe-survivor-gate-undefined`](../../findings/f-4259822-retirement-safe-survivor-gate-undefined.md).
  No durable survivor/export/package acknowledgement gates hosted deletion.
- Existing high candidates surviving direct lifecycle challenge:
  [`f-c611666-rotation-reader-eligibility-missing`](../../findings/f-c611666-rotation-reader-eligibility-missing.md)
  and [`f-745e332-package-root-rewrap-substitution`](../../findings/f-745e332-package-root-rewrap-substitution.md).
- Existing medium candidates surviving at the lifecycle joints:
  [`f-4259822-generation-switch-local-durability-undefined`](../../findings/f-4259822-generation-switch-local-durability-undefined.md),
  [`f-f5def83-device-lock-reader-key-bypass`](../../findings/f-f5def83-device-lock-reader-key-bypass.md),
  `f-dbfd01f-device-lock-rotation-caveat-lost`, and `f-b997cdb-checkpoint-key-retention-inverted`.
- Existing `f-b9ff071-webauthn-cross-origin-policy` remains relevant to slot unlock and recovery step-up, but X-06
  owns its platform/policy challenge. All findings remain `candidate`; X-04 does not pre-empt V-01 validation.

## Disconfirmed hypotheses and null results

- **A replacement assertion can be redirected to retirement:** disconfirmed. The WebAuthn challenge binds the
  transition id, whose signed preimage binds `kind`; `replace-recovery` and `retire` differ before payload parsing.
- **An identical transition retry can commit a second operation:** disconfirmed under the selected service table.
  The same bytes have the same id and retrieve the same signed outcome.
- **A losing conflicting intent should be resubmitted at the successor epoch:** disconfirmed. Its exclusion or
  recovery set was computed against the parent; resubmission can remove/retain the wrong recipient. Rebuild is needed.
- **A timeout is safe evidence to discard pending key material:** disconfirmed. Only a verified outcome separates a
  committed request from one still in flight; indefinite pending is intentionally the safer availability failure.
- **A stale slot binding restores an account after revocation/deletion:** disconfirmed. It opens local rows only; a
  service-issued account challenge/session remains separate.
- **Recovery can bypass a device lock:** disconfirmed by the selected authority split. Recovery may replace missing
  account proof or re-enroll a device, but it cannot open the old locked slot without its local factor.
- **A revoked device should stop working locally or lose history:** disconfirmed. The original contract expressly
  preserves its detached replica and past generations; removal governs future accepted/readable content only.
- **A still-authorized offline device's genuine old-epoch writes should be dropped after rotation:** disconfirmed.
  Accepted pre-cutoff work remains part of the CRDT; authorization/acceptance evidence, not observation time, decides.
- **Lapse and retirement differ only in UI:** disconfirmed. The bound `kind` and terminal lineage record make the
  difference cryptographic and durable.
- **The recovery code alone recovers content:** disconfirmed. Account access, service authorization, a factor, and
  ciphertext remain separate; a fidelity archive supplies only ciphertext/package material.
- **An old code with no retained old envelope, wrap, or key remains sufficient after replacement:** disconfirmed.
  The forward-rotation finding requires retained recovery material or an already unwrapped `K_g`; deletion blocks the
  code-only case.
- **The hosted-retention anchors drift:** disconfirmed. The exact tip check reports twelve months consistently at all
  five anchors and no closed-row `unselected` pointer.

## Unresolved questions

- What durable client-authenticated object records successful reader enrollment and binds credential, `W_pub`,
  `R_pub`, recovery envelope, lineage/head, and installing device strongly enough for a different future rotator?
- What exact restart machine distinguishes admitted-only, commitment/reveal, wrap delivered, wrap installed, spent,
  and reader-eligible enrollment states?
- Which local transaction orders successor key installation, active generation, pending cleanup, journal/batch
  coverage, old outbound envelopes, checkpoint admission, and generation deletion?
- Does recovery replacement rotate immediately, and what exact canonical payload binds `R_pub`, sealed `R_priv`,
  every wrap, and the replacement counter?
- What durable service transaction retires a step-up nonce relative to transition commit and backup restoration?
  Idempotency bounds same-intent replay but does not define as-built retention.
- How does lapse expiry delete every hosted class and backup, retain the correct recovery identity, and resume/reseed
  atomically when one or several divergent devices return?
- Which signed/durable acknowledgement proves a current replica or independent export received terminal evidence,
  and what state prevents deletion until its catch-up/package obligations are satisfied?
- How does a terminal package locally rebind a closed slot when ordinary account proof is lost while still preserving
  the independent device-lock gate?
- What authentic root prevents the portable-package rewrap substitution before total-device-loss recovery treats
  archive contents as historical truth?
- What exact product response follows authenticated live/retired lineage with missing local identity? The detection
  rule is selected; refuse/sign-in/quarantine remains a product choice.

## Completion criteria

- [x] Enrollment, account unlock, revocation/rotation, recovery replacement, lapse/expiry, retirement/deletion, and
  total-device-loss recovery are reconstructed from exact boundary objects.
- [x] Replay, operation substitution, duplicate/conflicting intent, lost signed outcome, stale return, and all-device-
  loss scenarios are challenged separately.
- [x] X-03's generation-switch and reader-eligibility joints are carried through lifecycle endpoints.
- [x] Four new candidate findings, inherited concerns, affirmative conclusions, null results, and unresolved
  questions are persisted without editing production artifacts.
- [x] Exact-tip relevant generators/retention check and review validator pass; the final session records the handoff.

## Handoff

X-04 is complete. Run `node scripts/review-status.mjs`, then claim `X-05` by creating
`docs/review/analysis/seams/X-05-continuity.md` and a fresh session without moving the checkout. Carry the new
enrollment recovery-recipient, recovery-forward-rotation/payload, and retirement survivor-gate candidates into
P-01/S-01/V-01. X-05 should challenge package/attribution/root binding and lapse/deletion portability without
duplicating the lifecycle state findings. There is no blocker.
