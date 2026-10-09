# Lost-device recovery: first product flow

2026-10-09. The operator authorized recovery work with focused implementation checks and unsigned
intermediate commits. Release validation remains paused. This is the recovery product journey, not
the account-creation recovery-code ceremony documented in [account-recovery.md](./account-recovery.md).

## Agreed product boundary

- The first flow requires an existing account passkey and the saved recovery code. Losing every
  connected device is supported by the intended flow; losing the account passkey too is a separate,
  explicitly unsupported account-access recovery path until designed.
- The confirmation is **Recover on this device and disconnect the previous devices**. Successful
  recovery makes the new device the sole approved content device and rotates future writing to a
  fresh generation. Old copies cannot be erased. This changes device membership, not the person's
  account passkey; account authentication and content authority remain separate.
- With a surviving usable content device, use the existing invitation/approval and removal paths.
  Ordinary connection does not require the recovery code. A lost device's edits that never reached
  another copy cannot be reconstructed from the hosted copy.
- Keep the existing recovery code and recovery state. Replacing a lost/exposed recovery code is a
  separate operation; this flow must not claim to repair recovery-code exposure.
- Recovery is additive to any other local account/workspace on the replacement device. It does not
  bypass an existing slot's local unlock, overwrite that slot, or merge unrelated local writing.

The operator approved this screen sequence: **Use another account → Recover with a saved recovery
code → choose the existing account passkey → enter recovery code → save and confirm a new device-lock
code → review “Recover on this device and disconnect the previous devices” → recover and open the
editor**. Retained recovery progress appears in the chooser. A missing passkey or recovery code must
show the actual requirement, not redirect to account creation.

## What exists and what does not

`src/account/recovery.ts` already opens the code-sealed X25519 recovery key, root commitment and
Ed25519 bootstrap signer. It verifies those private/public key relationships and the sealed root.
Generation wrapping, authenticated content replay, factor-sealed device custody, live sessions and
repeated membership transitions also exist. The existing `/recovery/begin` and `/recovery/finish`
operations confirm account-creation recovery material; they are not lost-device recovery endpoints.

The runtime had no recovery bootstrap, no account-authorized hosted recovery read, and no durable
all-device recovery commit or editor installation. Existing membership verification starts with the
first enrollment/certification anchor in several paths; recovery must also work when the only device
ever enrolled was the first device. A surviving-device invitation cannot be a hidden prerequisite.

## Bounded implementation sequence

1. **Recovery proof boundary — implemented.** Verify a nonce-bound head assertion and bind the
   factor-opened bootstrap signature plus the new device's countersignature to the exact held target.
   This does not log in, consume an attempt, read content, replace membership or install any key.
2. **Durable service preparation and recovery reads — implemented.** Introduce an explicit fresh
   recovery-purpose account challenge, tied to the candidate keys and an exact retained attempt.
   Discover the selected account without an invitation. Bind its current recovery state and complete
   verified history to the head assertion; keep the original nonce/bytes across retry. A historical
   account-proof or enrollment receipt is insufficient. Keep recovery reads separately scoped from
   ordinary device grants, with bounds and account checks at the actual read. No code or private
   recovery key goes to the service. Account login issuance must have an explicit combined purpose
   if composed with this challenge; it cannot be inferred from a successful bootstrap signature.
3. **Atomic recovery transition and retained installation.** After explicit confirmation, establish
   exact accepted-write cutoffs for the old devices; retrieve and authenticate the complete available
   recovery representation, opening every generation it requires with the code. Refuse missing
   dependencies or bounds before an irreversible membership replacement. Prepare a fresh content key,
   its new-device and recovery wraps, and durable exact intent under the new device's factor custody.
   Commit the replacement certified set, old-device exclusion/finalization, rotation and exact outcome
   together. A competing parent requires an explicit restart; a lost reply retries the same bytes.
   Extend membership/history verification so the recovered device can manage later devices, not just
   read. Cold-install the recovered writing and resume ordinary send/receive before declaring success.
4. **Product screens and a real disposable walkthrough.** Review the exact steps with the operator,
   then mount sign-in, saved-code entry, new local device-lock setup, consequences confirmation,
   truthful progress/resume and the editor. Demonstrate recovery with the original contexts closed,
   both at first-device-only state and after rotation. Check wrong factors, interrupted commit/install,
   old-device detachment, and subsequent enrollment/editing. Stop for operator use when the flow works.

Phase 3 must specify how preparation fences are resumed or released, where account/current-head
eligibility is rechecked around asynchronous verification, and how retained checkpoint/suffix coverage
is established. A successful signature test settles none of those transaction or content questions.
The existing history/checkpoint bounds remain; no general history pruning or retention redesign is
part of this work.

## First increment: proof profile and limits

`account-protocol/recoveryBootstrap.ts` implements TRD §§13.5/13.8's selected LP byte order with
closed version-one objects and a 4 KiB proof bound. The head verifier uses a held service pin plus
the exact caller-held workspace/client nonce. Its immutable result is branded so an unverified
lookalike cannot feed bootstrap preparation. Its signed timestamp is display information, not a
client-clock freshness gate. A malicious authority can still give a fresh client a stale consistent
head; later history verification and held-head continuity remain necessary.

The bootstrap binds workspace, lineage, observed head/epoch, nonce, current recovery-state digest,
recovered authority root, exact new credential/wrapping/signing keys, resulting recovery-state digest
and conflict parent. The first flow requires the prior and resulting recovery digests to be equal.
`src/account/recoveryBootstrap.ts` produces the recovery signature only through actual saved-code
opening, and verifies the new signing key's countersignature. Caller-controlled values are copied
before crypto awaits; returned proof/context values are immutable. Preparation includes zero signature
placeholders which are not valid proofs.

**Nonce terminology correction:** TRD §13.5 signs a `client_nonce`; §13.8 and the earlier S0-2 schema
call the same carried value `service_nonce` while requiring it to be unchanged. The runtime calls it
`clientNonce` at both steps and uses the same value in that selected byte position. This is not a new
service-generated nonce or a change in LP ordering. Durable service attempt issuance/consumption is
still required. Exact proof replay passes the pure verifier by design; only the transaction owner
can turn that into safe exact retry or reject a spent/competing attempt.

Public recovery state in the verification context must come from current verified history/service
state, not an incoming bootstrap's proposed verifier. The client additionally opens the factor-sealed
root/signer: even self-consistent attacker-supplied public metadata cannot replace that anchor. This
increment deliberately does not certify that a service-provided history is current or complete.

Focused tests use independent Node LP framing, envelope opening and Ed25519 verification. They cover
request correlation, substituted roots and signers, wrong factors, candidate/parent changes, stale
recovery capability, mutation across awaits, strict parsing, first-epoch input and clock-independent
assertions. No release inventory, generalized campaign or live service change is part of this increment.


## Durable account preparation checkpoint

`lost-device-recovery-v1` is a new discoverable passkey purpose, bound to the service pin, exact
attempt/retry hash, candidate keys, client nonce and fresh service nonce. Candidate possession is
checked separately. The asserted credential selects its active account and admitted workspace;
no invitation, old enrollment receipt, remembered login or supplied account identifier substitutes
for this fresh check. The signed preparation includes the original admission, complete retained
history and nonce-bound head. Client verification checks the history reaches that head before using
the current recovery digest for a bootstrap.

Attempts last ten minutes, with at most 128 retained attempts and two maximum-size preparation
responses worth of retained response bytes globally. Expired attempts are pruned when beginning a
new attempt; recreating the same retry key creates fresh challenge bytes and does not validate an
old assertion. Prepared retries recheck current account/credential and authority identity. Passkey
counter observations and ciphertext appends alone do not invalidate a preparation. Head changes do.
No devices are fenced or disconnected here. The service does not issue network login credentials.

The private session host exposes `/__account-setup/lost-recovery/{begin,finish,resume,cancel}`.
Schema 22 is additive and requires the existing offline upgrade procedure for retained schema 21.
The live installation remains at 21 until a separately coordinated upgrade. Recovery commit and
local installation remain unfinished; these endpoints do not make recovery a usable product yet.


## Hosted read checkpoint

`/__account-setup/lost-recovery/read` checks the retained fresh
account attempt, current code-backed bootstrap and exact candidate signature. It validates the
complete publisher ledger, then rechecks account/attempt/head/ledger state at the return boundary.
The response contains accepted ciphertext and proofs, with a signed extent and request hash. It can
read historical finalized publishers through verified rotation history. Bounds are 8 KiB requests,
16 entries and 4 MiB responses; invalid extents, changed authority and incomplete history refuse.
The current transport does not fence writers: later pages may observe a larger accepted prefix. The
recovery transition still needs an exact-cut contract before it can replace membership.


## Cold replay and remaining transition boundary

`src/crdt/recoverySource.ts` now opens the recovery wrap for each generation, cold-replays the admitted
genesis plus every accepted publisher prefix, and returns a complete snapshot and exact accepted-head
vector. The caller must erase the snapshot after sealing/using it. Replay includes finalized publishers;
missing dependencies, old-generation key failures and invalid cuts refuse. It creates no local slot,
changes no current authority and does not disconnect devices. Its cuts are a point-in-time observation.

The next transaction must compare that exact head vector with freshly authenticated service ledgers
inside the final write transaction. If accepted writing advanced after replay, the existing snapshot
cannot authorize deletion/exclusion of the newer work: recover a new complete cut and persist its new
intent before retrying. A competing membership head requires the already-agreed fresh preparation.
Preparation/read currently place no persistent writer fence; introducing one would require explicit
resumption/release semantics before mounting it. Membership replacement, generation rotation and
retained exact outcome must be atomic before the app can report recovery success.

The recovered bootstrap is the single-member certificate (TRD §13.8). The current general continuation
paths assume the original two-device certification at epoch 3. They must accept a verified recovery
successor anchored directly in the first admission as well; manufacturing a second-device invitation
or treating a service signature as the recovery signer would violate the approved journey. Both the
service and client history, ordinary grants, delivery and subsequent membership paths need that
extension before installation or UI activation.

The operator approved restarting early factor steps after an actual close/kill before new device-lock
setup. Backgrounding/password-manager use must preserve the in-memory ceremony. Once the lock is
confirmed, sealed candidate keys, verified progress, new generation material and exact transition
intent must support durable restart. The approved screens and chooser resume entry remain to build.


## Recovery successor profile

The recovery intent binds the fresh attempt ID, nonce-bound head and bootstrap, generation increment,
complete accepted-head vector (including previously finalized publishers), checkpoint digest and
new-device/recovery wraps under the new device's signing key. The service successor carries that
intent, the unchanged recovery draft and acceptance-key finalizations for every currently certified
writer. It installs the bootstrap's single member in verified history and retains earlier final cuts.
No membership change is yet performed by these pure verifiers. The native owner must prove and seal
the checkpoint before submitting the intent; the service must compare the exact ledger cut at commit.

Membership chains can now start with recovery immediately after epoch one or two, or continue after
the original two-device certification. An absent original certification requires a recovery successor
as the first continuation. Original content checkpoints still require their actual epoch-three proof;
a recovery-derived later generation cannot borrow that old baseline. Focused tests establish ordinary
later admission and repeated recovery through the same verified membership/history machinery.


## Atomic service commit checkpoint

`/__account-setup/lost-recovery/commit` now accepts the exact signed intent plus its encrypted
checkpoint. It checks the fresh account-bound attempt and code/candidate proofs, authenticates every
ledger named by the replay, and atomically compares all those snapshots before replacing authority.
Concurrent accepted writing causes refusal and requires a newly replayed/sealed intent. There is no
persistent fence to strand. A membership change still requires fresh preparation. Committed exact
outcomes survive the ten-minute preparation expiry; request bytes cannot be substituted on retry.

The immutable successor/checkpoint and final ledger witnesses are schema 23 state. Old devices lose
current authority; the replacement can publish under the new key and authorize subsequent enrollment.
The service has no plaintext or recovery code and cannot perform semantic Yjs verification itself;
`prepareRecoveryCommit` cold-replays before constructing the checkpoint. The native owner must seal
that result and candidate keys before calling commit. Browser custody/installation, combined remembered
login, approved screens and the disposable walkthrough remain. The live service is still untouched.
