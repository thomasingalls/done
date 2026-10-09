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

## Starting point

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
3. **Atomic recovery transition and retained installation — implemented.** After explicit confirmation, establish
   exact accepted-write cutoffs for the old devices; retrieve and authenticate the complete available
   recovery representation, opening every generation it requires with the code. Refuse missing
   dependencies or bounds before an irreversible membership replacement. Prepare a fresh content key,
   its new-device and recovery wraps, and durable exact intent under the new device's factor custody.
   Commit the replacement certified set, old-device exclusion/finalization, rotation and exact outcome
   together. A competing parent requires an explicit restart; a lost reply retries the same bytes.
   Extend membership/history verification so the recovered device can manage later devices, not just
   read. Cold-install the recovered writing and resume ordinary send/receive before declaring success.
4. **Product screens and disposable walkthroughs — implemented; live upgrade pending.** Review the exact steps with the operator,
   then mount sign-in, saved-code entry, new local device-lock setup, consequences confirmation,
   truthful progress/resume and the editor. Demonstrate recovery with the original contexts closed,
   both at first-device-only state and after rotation. Check wrong factors, interrupted commit/install,
   old-device detachment, and subsequent enrollment/editing. Stop for operator use when the flow works.

**Current status:** all four implementation steps and the focused disposable product checks pass.
First-device-only recovery, interrupted installation/commit retry, previous-device detachment and
onward enrollment/rotation/recovery are covered by the evidence below. The retained development
service still needs its quiet backup and schema-21-to-24 upgrade before operator use.

Preparation keeps no persistent writer fence. Commit compares the exact accepted cuts and checkpoint
publication fingerprint at its final transaction boundary. A stale cut or competing head requires
fresh preparation; committed exact outcomes remain resolvable after expiry. The existing history
bounds and 4 MiB recovery output limit remain. General pruning and retention redesign are separate.

The following sections record the successive checkpoints; their “remaining” statements describe
that point in the implementation, not the current status above.

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


## Candidate custody checkpoint

Fresh Local creation accepts candidate keys generated during the earlier passkey/code steps. The
initial claim atomically retains those keys and progress encrypted by the newly confirmed device-lock
factor, using a separate salt/domain. Restart finishes installing exactly those credentials under the
existing root custody, with nonce reservation before encryption. The live protected record no longer
contains the seed; the authenticated initial claim retains its encrypted copy. This does not authorize
a recovery commit by itself: the recovery owner must validate the retained exact intent and authority
before sending it, and cold-verify its checkpoint before installing writing.


## Combined login and local verification checkpoint

New preparations can explicitly opt into `recovery-and-login-v1`. Its assertion uses a separate domain
and binds the fresh candidate, attempt, service and login purpose. The same high-entropy retry capability
identifies the two linked operations in separate tables; the signed context binds the session attempt
and retry hash. One transaction saves preparation and issuance after a separately committed encryption
nonce reservation. Only exact finish proof retries return login credentials. Begin/resume return no
login secret; cancellation revokes it. Old proofs do not gain the new purpose.

The signed preparation also supplies the existing account's verified offline passkey binding. The
client independently checks the fresh combined assertion against it and its in-memory client nonce.
The upcoming native owner must bind that check to the new slot and current opening, never treat a
serialized assertion or saved preparation as permission to reopen later. Schema 24 needs explicit
offline upgrade; no live upgrade has run. Approved screens and installation are still unmounted.


## Native installation checkpoint

The joined-account owner accepts a dedicated recovery reading/marker. Its checkpoint digest and
successor are anchored in verified history, its signed passkey binding belongs to the original
account, and its candidate keys must match the actual Local custody. Cold replay requires complete
Yjs integration and current actor schema. Content, initial generation, index selection and active
marker use the existing restartable installation path. Subsequent opening uses both local factors.

Recovery baseline cuts also feed ordinary receive/rotation and future replacement-source replay.
A new epoch-two recovered device can adopt an epoch-three admission and prepare a replacement
snapshot, including its unuploaded durable edits, with only its current key. A disposable native
restart/edit/enrollment-source check and existing activation regressions pass. The coordinator must
still seal intent before submission, resolve an uncertain reply, and consume only a freshly verified
in-memory passkey opening when avoiding a duplicate initial prompt. Approved UI remains to mount.


## Product coordinator checkpoint

The retained owner now seals candidate custody and exact replayed intent before submission, stores
login credentials before acknowledgement, resolves unknown commit outcomes, and installs/opens the
verified recovery checkpoint. A fresh module-owned one-use grant reuses the initial combined passkey
check only for its exact new installation. Stored bytes never recreate that permission; browser
restart requires normal unlock. Native tests cover the live path and a lost reply across browser
and service restart. UI, previous-device recovery detachment and a packaged walkthrough remain.


## Packaged product checkpoint

The approved screens and chooser resume now compose the native owner. A packaged disposable
walkthrough reaches an editable recovered account, publishes fresh writing and reopens it.
Recovery source now includes retained content/replacement/recovery snapshots as well as genesis
and accepted streams: handoff snapshots can hold writing that never appeared in those streams.
Authenticated snapshot reads are preparation-scoped; the service preparation fingerprints checkpoint
state and refuses if publication changes it before commit. Missing optional unpublished baselines
are reported as signed absence; a committed recovery checkpoint must exist. No history is pruned.
Previous-device recovery-specific detachment and the live schema upgrade remain to complete.


## Previous-device detachment checkpoint

A recovery finalization now authorizes a removed credential's narrow terminal discovery proof. Native
custody retains a distinct recovery detachment, preserving any old rotation openers. Normal unlock
verifies its accepted prefix and opens an editable detached copy with delivery/subscriptions off.
The packaged walkthrough covers both original and joined old devices; the service check also covers
recovery directly after first admission. Onward enrollment/rotation and a second product recovery are
the remaining focused product checks before the quiet live upgrade.


## Continuing lifecycle checkpoint

The packaged walkthrough now connects a device from the recovered account, receives its writing,
removes it, publishes after rotation and recovers again with the unchanged original factors. The
second recovery preserves accepted writing while the browser retains its separate detached slot.
This walkthrough began with an originally paired account. The remaining focused product check covers
recovery before any second device has been admitted; the quiet live schema-21-to-24 upgrade follows.


## Early-account product checkpoint

A real packaged never-paired account now recovers, uploads and admits another device through code
comparison into the editor. Removed original-pair assumptions from relay eligibility, the comparison
epoch parser and public binding lookup. Exact verified history, candidate signatures, credential key
consistency and final transaction checks remain required. Both full packaged journeys and focused
authority-boundary regressions pass.
[Evidence](./development-evidence/2026-10-09-recovery-early-account.log). Only the quiet retained-service
upgrade and operator use remain in this bounded phase.


## Retained-service handoff prepared

Implementation `049b9a29` has a separate packaged build at
`.dev/account-enrollment-tailnet/builds/049b9a29`. The still-running development service is schema 21,
with read-only integrity/foreign-key checks passing. The next operation is the existing offline
backup/upgrade utility followed by the same two-process app/API composition at the unchanged :8443
origin. This waits for the operator's confirmation that pages on both devices are locked and closed.
No personal account recovery will be performed automatically.
