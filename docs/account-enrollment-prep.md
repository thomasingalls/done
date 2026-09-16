# Backend phase one: authenticated enrollment preparation

2026-09-16. Defined against signed product merge `d942cd1c`. **Private implementation complete.**
The phase outcome and evidence are recorded below. Release validation remains paused.

## Outcome and boundary

An account holder can authenticate a request to attach a fresh device signing/wrapping credential
to their existing workspace. The service retains the exact request and its result across retries,
lost replies and restart. Cancellation or changed authority prevents subsequent use. Preparing the
request leaves the creating device's existing delivery path working.

The result is **`prepared`**, not `service-admitted`, `certified`, reader-eligible or ready to sync.
This deliberately splits the previously discussed “second-device admission and current authority”
work: actual admission advances the authorization lineage, which today's delivery runtime cannot
yet consume. Calling a stored request admission would hide that dependency.

The two gates in [TRD §13.6](./TRD.md#136-enrollment-and-promotion) remain independent. Account
authentication may authorize service admission. It cannot authorize content-key delivery, including
delivery during a later rotation. Only the separately certified recipient set supplies that authority.

## Starting point in the integrated tree

| Existing capability | Reuse and limitation |
| --- | --- |
| `account-service/core.ts` and `webauthn.ts` | Durable ceremonies, confirmed passkeys, exact retries and assertion verification. An `account-proof` receipt records past authentication; it is not a session or permission for a new operation. |
| `account-protocol/activation.ts`, `account-service/authority.ts` | First activation already uses a fresh, purpose-bound assertion and independently pinned service authority. Reuse the pattern and verifier, with a separate enrollment purpose and closed types. |
| `account-service/delivery.ts` | Authenticates the original registration, recovery, promotion and activation records. Membership still resolves from the first epoch and creating member. There is no general mutable current-head owner yet. |
| Recovery setup, promotion and v9 sync owners | Useful existing machinery, not implementations of second-device enrollment, lost-device recovery or a production account service. |
| The integrated welcome screen | Account entry buttons remain inactive. This phase supplies a private backend boundary; product screens and their owner integration follow. |

The account passkey and workspace signing credential are different identities. Keep the current
one-confirmed-passkey account policy in this phase. The second-device test uses an existing account
passkey, as can be available through a synced authenticator or cross-device authentication; adding or
replacing account passkeys is separate work. Do not remove `UNIQUE(account_id)` from the passkey table
as a shortcut to multiple workspace devices.

## Deliverables

1. **A verified authority snapshot for the operation.** Resolve the active account, workspace,
   lineage, current epoch/head, certified membership and recovery-state digest from retained,
   verified service records. Factor out only the shared checks needed from delivery; do not create
   a second independently editable “current head” beside the promotion receipt. The first version
   supports the existing first epoch explicitly and refuses unsupported states. Capture an exact
   comparison token for the authority records, excluding ordinary ciphertext-ledger appends.
2. **A closed enrollment candidate and operation challenge.** Bind the independent service pin,
   account/workspace/lineage, expected epoch/head, certified-set and recovery digests, attempt ID,
   fresh device credential ID and exact signing/wrapping public keys. Bind a service-owned nonce
   and expiry to the same context. The account assertion and candidate signing-key possession proof
   cover separate, fixed enrollment purposes over that context. Parsing a wrapping public key does
   not prove its private key is installed; that proof belongs to later key delivery/installation.
3. **A durable preparation owner.** Add private begin/finish/resume/cancel operations, persisted
   challenge consumption, exact input/proof digests, terminal state and an immutable preparation
   receipt. Persist only public candidate material and required authentication evidence; no device
   private key or plaintext content crosses this boundary.
4. **Focused evidence at real persistence boundaries.** Exercise the service through disposable
   SQLite files and its private HTTP adapter. Prove the retry, cancellation and race rules below,
   including process death, and retain the existing creating-device delivery regressions.

For this bounded implementation the caller supplies a public workspace/lineage locator and expected
head from the fixture or later discovery owner. These are untrusted selectors, never authority.
Resolve the account from retained workspace ownership, then require a confirmed passkey belonging
to that account. A caller-supplied account ID, historical receipt or private adapter token cannot
satisfy this check. Product account/workspace discovery is a later integration boundary.

## Persistence and operation rules

The caller saves a random 32-byte retry capability before beginning; retain its hash in service
storage. A public attempt ID cannot resume or cancel a request. The service owns random attempt,
challenge and receipt IDs. Keep the existing configured origin/RP and pinned authority; a key
returned beside a response cannot establish its own trust.

The request's target and candidate are immutable. Exact begin retries recover the same challenge or
current result. A different target, head or key under the same capability refuses. Reject collisions
with existing workspace credential IDs and bind any pending-candidate reservation to authenticated
ownership; an unauthenticated request cannot reserve or spend someone else's credential identity.

Use the existing ten-minute ceremony policy for this first private slice. A successful preparation
is usable for ten minutes after its commit, with that fixed service deadline retained in its receipt.
This is a private availability policy, not a storage-permit timeout. Resume reports expiry rather than
silently renewing authorization. A new attempt requires a fresh assertion; it cannot borrow the
historical receipt. Invalid proofs do not themselves consume a challenge or burn another credential.

Copy and bound input before asynchronous crypto. Verify using one retained challenge/credential/
authority snapshot. In the final `BEGIN IMMEDIATE` transaction, recheck account and passkey eligibility,
exact candidate, authority token, expiry and cancellation. Consume the challenge and commit the prepared
record, proof hashes and receipt together. Publish success only after commit. An ordinary accepted edit
must not invalidate preparation; a changed authority head, certified set or recovery state must.

Exact finish retries recover the committed result without another side effect. Changed proof bytes
conflict. Keep the immutable receipt separate from current request eligibility: resume must report
cancelled, expired or stale preparation honestly even when a successful historical receipt exists.
Cancellation wins against an uncommitted finish; after preparation it makes the request unusable.
Resumption never rolls back a completed cancellation or silently rebases the request to another head.
Later admission must recheck current authority and consume the preparation atomically; the receipt
alone is not a reusable admission capability.

Concurrent completions of one request produce one durable result. Concurrent distinct requests may
both prepare against the same head; neither changes membership. The later admission owner, not this
preparatory state, serializes competing successors. Preparation cancellation is not the SAS-mismatch
credential-spending rule: no enrollment transcript or service-admitted credential exists here yet.

## Implementation sequence and exit checks

Keep this one phase in three reviewable chunks:

1. Freeze the candidate, challenge, possession-proof, receipt and result encodings plus finite request,
   response and retained-state bounds. Use closed parsers, canonical existing ID/key encodings and
   distinct purpose tags; include independent byte fixtures and substitution negatives. Pin deadline encoding,
   duplicate-candidate and terminal-retention policies. Register any new signed construction with the
   existing crypto inventory. Do not reuse first-epoch types to imply a successor format already exists.
2. Implement the shared verified snapshot and SQLite preparation owner, then the private adapter.
   Document the schema change explicitly. There is no deployed Account database to preserve; retain
   historical evidence but do not add compatibility machinery for retired intermediate versions.
3. Run focused conformance and affected account/delivery regressions, record results and sign the
   phase. Do not run every wrapper, refresh release snapshots or resume the aggregate campaign.

The phase closes when all of these have direct evidence:

- A valid existing account assertion and fresh candidate proof prepare exactly one bound request;
  another account's passkey, wrong purpose/origin/RP, substituted key or stale context cannot do so.
- Historical `account-proof`, offline slot unlock, first-activation proofs and the adapter bearer
  token cannot stand in for the fresh enrollment assertion.
- Commit abort, lost reply, competing finish/cancel, expiry and process death on both sides of commit
  recover the correct durable outcome. Use separate service processes for the relevant races.
- A shrinking state-machine test compares generated retries/restarts/cancellations against an
  independent ledger; retain failures and effective omitted-check controls for binding and consumption.
- Unsupported or changed authority refuses before mutation. Until a real successor owner exists,
  tests must label synthetic changed-authority fixtures as such, not claim runtime enrollment coverage.
- Before/after inspection shows no change to membership, epoch/head, certified recipients, recovery,
  content, acceptance keys or delivery positions. The creating device can still submit and read;
  the prepared candidate cannot publish or read ciphertext, obtain a slot binding or receive a key.

The expected patch is concentrated in `account-protocol/`, `account-service/` and their focused tests.
No ordinary-app activation, personal account ceremony, deployment or second-device action is needed.

## What follows

The next phase must define successor-epoch bytes and the durable current-authority transition together
with the delivery behavior needed to keep the existing device working. It may then make the first gate
real: service admission, still without certified content access. Do not ship a head change first and
leave consumers hardcoded to the original receipt.

After that: content approval through the selected committed-nonce/SAS ceremony, durable key delivery
and pending certification, new-device installation/countersigning, certified membership, fresh local
custody and counters, encrypted bootstrap, and multiple-publisher delivery. The author's actual old
second device adopts the first device's workspace; its old writing is not imported. Device management
must include revocation/rotation before release, followed by the remaining recovery/lifecycle and
production session, provisioning, storage/restore and operational work.

These are dependencies, not a claim that the rest is already implementation-ready. The full order remains
[sequencing §3.5](./sequencing.md#35-stage-4--the-service); the author path remains
[account-sync-prep.md](./account-sync-prep.md). Product readiness and an explicit decision to resume
release validation precede any renewed release campaign. Platform-specific UX remains post–first-RC.


## Completed bounded outcome

The private protocol and service owner are implemented. `account-protocol/enrollment.ts` defines the
closed wire and fixed purposes; `account-service/enrollment.ts` owns persistence, current-authority
comparison and candidate reservation. Delivery shares its existing verified snapshot without changing
its original member/epoch policy. The private HTTP adapter exposes only begin/finish/resume/cancel.
[Exact byte/API contract](./account-crypto/enrollment-preparation.md).

Request/result limits are 128 KiB/16 KiB; retained capacity is 64 attempts per workspace and 4,096
service-wide, including terminal history. Completed candidate IDs remain reserved per workspace.
Schema 6 has an explicit additive upgrade from the current private schema 5, retaining the existing
older explicit upgrade paths without introducing new legacy owners. There is no automatic pruning,
public account session or deployment policy in this slice.

Focused checks cover 39 enrollment tests, including 60 shrinking histories and 100 generated key
substitutions; six SIGKILL boundaries and a two-process cancellation race; private HTTP; independent
signature/byte verification; and two effective omitted-check controls. Affected account and delivery
regressions pass (108 tests), as do the construction registry's 12 tests, typecheck, lint and format.
[Preserved evidence](./account-conformance-runs/2026-09-16-enrollment-preparation/README.md).

Four new purpose domains are registered as one open construction-qualification entry. The runtime
crypto census includes this phase and the preceding product merges; frozen release-validation
inventories are unchanged. The open entry prevents the old aggregate crypto-closure result from being
applied to this new protocol without published-vector/authority-map qualification. No aggregate
campaign has run. No real account, device ceremony, personal server or application cutover occurred.

Next, define actual successor admission and compatible delivery together. Content delivery and
certified recipient activation remain later gates; no caller can consume a prepared receipt for those
operations in the present runtime.
