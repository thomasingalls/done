# Account attachment and encrypted sync — first implementation slice

Prepared after signed `17d87c2` (storage compatibility) and `14901a5` (compatible static updates and
personal source cleanup). This is implementation prep, not an account enrollment or a new active
service. The author's current encrypted workspace remains the authoritative writing to carry forward.

## Existing work reconciled

The `claude/l2-onboarding-863db1` ref and its retained worktree are at `d24732b`. The worktree is clean.
Its last implementation is `b8c267a`, the device-local slot verifier. Its `src/account/slotUnlock.ts` and
`test/slotUnlock.test.ts` have no diff against this branch. No account-service or enrollment code is
waiting there to be integrated. L-2's section of progress.md remains unchanged; this preparation records
what was inspected rather than rewriting that seat's historical checkpoint.

| Existing component | Reuse boundary |
| --- | --- |
| `src/account/slotUnlock.ts`, `test/slotUnlock.test.ts` | Verify service-signed offline slot bindings before using their passkey public keys; verify assertions over the bound local-unlock challenge. This grants no account session or network capability |
| `scripts/lib/webauthn.mjs`, account-credential vectors | Ceremony bytes and negative-case inventory. This is generator/test code; it is not a registration verifier or an account service |
| Custody, journal, admission, owned startup and scoped index | Keep the current mandatory factor, source identity, exact recovery coverage and writer lifetime. Add account attachment through an owner; raw index edits cannot promote a Local workspace |
| Recovery, enrollment, head-discovery, envelope and transition selections/vectors | Inputs for subsequent implementation and conformance. They do not certify a complete runtime protocol |
| Existing `relay/` and `src/crdt/sync.ts` | Legacy shared-token/Yjs transport and decoded `.ydoc` persistence. These cannot serve encrypted sync by reconnecting them to the new editor |

Current authority is TRD §§13.1–13.9, PRD §§6.1–6.3, the S0 remediation amendments, and
[SC-01–09](./storage-contract.md). Historical prose in row 12/row 14 and PRD §6.1 still refers to optional
custody or promptless first use. Those descriptions do not override mandatory factor custody. Do not
restore an optional or promptless receiver while implementing accounts.

## The author's path

1. **First device:** promote the currently selected Local workspace. Preserve its principal, workspace,
   content root and generation under the never-admitted-lineage rule. Establish account access, confirmed
   content recovery, fresh service-bound device signing/wrapping credentials, the first authorization head
   and the authenticated genesis checkpoint. Promotion has an authenticated restart outcome; it does not
   copy the writing to a replacement workspace or leave a divergent Local duplicate.
2. **Second device:** the author's actual pre-encryption installation signs in and enrolls to this existing
   account workspace. Do not feed its old Yjs database or journal into the new workspace. Bootstrap from
   the first device/verified hosted encrypted state after both authorization and content-delivery gates.
   Create fresh local store/custody, counters and device credentials rather than cloning a profile.
3. **After adoption:** ordinary two-way encrypted sync includes new edits from both devices. Keeping the
   second device's old source temporarily is an isolated recovery choice; deleting it is a later explicit
   step. The first device's earlier cleanup authorization does not delete the second device's source.

The product's general start-fresh/picker flow is later work; this personal route is already selected by
the author. The device-lock code, account passkey and content-recovery code remain different powers:

| Credential | Purpose | Boundary |
| --- | --- | --- |
| Account passkey | Account authentication; local proof for reopening a closed Account slot | Does not decrypt content or independently authorize delivery of a content key |
| Existing device-lock code | Unlock this device's retained factor custody | Does not become an account credential or the account's recovery factor |
| Newly generated and re-entered recovery code | Seal content-recovery private material, bootstrap signer and root commitment | Service receives only the opaque sealed object; account recovery alone does not recover content |

## First bounded code phase: account challenge and passkey verification core

Build the service-side ceremony boundary and its test adapter before exposing account creation in the
ordinary app. Follow sequencing §3.5 item 1 while leaving the account **pending** until item 2's saved,
re-entered recovery ceremony and the later promotion owner can complete. A passkey created in an
abandoned attempt is not an active account, an admitted device or a workspace promotion.

The phase should deliver:

- Closed request/result types separating registration, online account authentication and local slot
  unlock. The local slot-unlock challenge must never be accepted by the service as a login proof.
- Server-owned single-use challenges bound to the intended operation/attempt and configured relying
  party/origin policy. Client-supplied IDs or challenge bytes cannot select another account, replace a
  credential, or change the pending promotion target.
- Registration and assertion verification with the selected Ed25519/ES256 policy, user presence and
  verification, exact client-data bytes, correct ceremony type, RP/origin and embedding checks. Do not
  turn the offline assertion verifier into a registration verifier by trusting a client-supplied SPKI.
  Select and review the registration parser/library against the current WebAuthn specification before
  adding a runtime dependency; no provider or new dependency is selected in this prep.
- Transactional challenge consumption, uniqueness, pending-attempt progress and retry lookup. A response
  lost after commit must have one recoverable result; a repeated attempt with different bound bytes
  refuses. Replays and concurrent submissions cannot mint multiple credentials/accounts. Challenge
  expiration, if used, is an explicit ceremony policy; it cannot expire a storage writer permit.
- A private/disposable endpoint adapter for exercising the service. Ordinary app startup, local content,
  custody, index and selected workspace remain outside this first phase's write authority. No relay
  token, recipient membership, account-ready flag or source deletion is issued at this boundary.

Exact wire encodings, the durable service transaction adapter and ceremony expiry policy must be written
alongside their conformance tests in that phase, before public endpoints. An in-memory challenge map alone
is not evidence of restart/idempotency behavior. Service signing keys must have an explicit bootstrap and
persistence owner; a key received next to an unverified binding cannot authenticate that same binding.
The authority-key/epoch handoff to the future first-lineage owner must be specified before minting the
first real slot binding. This phase may verify against synthetic pre-seeded accounts in its harness.

## Tests that decide whether this slice closes

Use a separate expected ledger for generated histories of begin, cancel, retry, expiry, duplicate proof,
concurrent proof, commit abort, lost response and service restart. Assert one logical result, no result
before durable commit, operation/identity separation and no extra authority after refusal. Reopen actual
service persistence after process death; do not substitute a thrown exception for that boundary.

Native browser tests should use disposable profiles and virtual authenticators to exercise real ceremony
bytes and cancellation; retain independent negative vectors for both selected encodings. Recheck the
existing offline slot verifier against service-produced bindings once the binding issuer exists.
Deliberate controls must actually accept a replay, wrong-operation proof or substituted key when their
guard is removed; a timeout or parser crash is not a detected security failure. Preserve failing seeds,
source pins, before/after state and bounded durations as in the storage campaigns.

No real account, personal passkey or new recovery code is needed to test this core. The author's browser
and actual device/authenticator matrix become a separately guided enrollment step after the recovery and
promotion owners are complete. The account origin/RP policy needs a deliberate choice before real passkey
creation; retain the current app origin for the pending package update. A future hostname move must not
silently orphan account credentials or local storage.

## Subsequent bounded phases

1. Recovery seal/confirmation and restart-owned account finalization, preserving separation of all factors.
2. Promotion of this existing workspace: authenticated lineage/genesis checkpoint, stable identity/index
   handoff and durable future device custody. Apply the upgrade interlock if a persisted format changes.
3. Signed encrypted envelopes, a content-blind relay/durable store, accepted outbound tracking and receive
   commit before promotion. First checkpoint: one device's verified ciphertext round trip.
4. Two-gate device enrollment and the author's second-device adoption, followed by two devices converging.
5. Revocation, rotation, finalization, recovery and account lifecycle integration before wider exposure.

The author-only service is development under sequencing §5.1. Other users, deployment outside the requested
worktree/session arrangement and claims of complete protocol assurance remain separate decisions/gates.
The existing plaintext relay stays off. No service or new account UI is started by this prep.
