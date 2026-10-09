# Private account recovery preparation and finalization

This slice follows signed `e9477aa` (account challenge/passkey core). It implements the next part of
sequencing §3.5: generated recovery material, saved-code re-entry and durable finalization of that
preparation. **The account remains pending.** There is no account without confirmed recovery, and
there is no usable Account workspace until the later promotion owner attaches the exact prepared
recovery state to its authorized lineage, generation wraps and genesis checkpoint.

Nothing here is mounted in the ordinary app or relay. The personal preview and plaintext relay remain
stopped. Tests use synthetic identities, disposable browser profiles and virtual authenticators. No
personal account, passkey, recovery code, content key, custody or workspace index is changed.

## Cryptographic contract

The authority is TRD §§13.8 and 14.2, row 14, and the
[exact private recovery byte contract](./account-crypto/recovery-layout.md). Current row-14 vectors now
seal all 96 payload bytes and agree with the runtime's strict 112-byte ciphertext. The original 48-byte
scalar-only vector is retained under `test/vectors/historical/` and is rejected by the current reader.
`pnpm account:recovery-contract` adds fixed construction, format/omission and generated checks alongside
the existing service/restart/native recovery campaign. Recovery replacement and total-loss recovery
remain outside this implemented preparation protocol.

The app generates 25 random bytes and maps each low five bits to Crockford Base32, displaying five
groups of five symbols. This is a generated 125-bit code, distinct from the device-lock code and account
passkey. Normalization drops whitespace/hyphens, uppercases, folds O to 0 and I/L to 1, and requires
exactly 25 symbols from `0123456789ABCDEFGHJKMNPQRSTVWXYZ`. Input is bounded to 256 characters.
There is no user-chosen-code creation API and no password stretching.

`LP` is uint16-big-endian-length-prefixed text. This private wire profile limits identities to 1–128
ASCII letters, digits, underscore or hyphen, and represents fixed-width binary fields as lowercase hex.
The service's account/attempt/recovery/challenge identifiers remain canonical 32-byte base64url.

```
RootCommitment = SHA256(LP("done/pkg-root/v1") || LP(workspaceId)
                       || LP(lineageId) || LP(hex authRoot))
K_rec = HKDF-SHA256(UTF8(canonical-code), fresh salt[16],
                   LP("done/recovery/v1") || LP(principalId), 32 bytes)
AAD = LP("done/recovery/v1") || LP(principalId) || LP("1") || LP(hex R_pub)
payload = R_priv[32] || RootCommitment[32] || bootstrap-Ed25519-seed[32]
envelope = {v:1, salt:hex[16], nonce:hex[12], ct:hex[112]}
```

X25519 and Ed25519 keys are generated independently through WebCrypto. AES-256-GCM uses a fresh salt
and random nonce for each seal and a 128-bit tag. The payload order preserves S0-6's scalar/commitment
pair and appends S0-2's bootstrap seed; it is fixed by this runtime contract. Re-entry decrypts the one
seal, checks its commitment against the caller's expected workspace/lineage/root, verifies both
private/public key relationships, and signs a purpose-bound confirmation with the opened bootstrap key.
It does not return either private key. Owned plaintext byte buffers are overwritten in finally blocks;
JavaScript strings, engine copies and opaque key handles cannot be promised physical erasure.

The recovery code is returned only by generation and never persisted or transmitted by the owner.
Re-entry proves possession/transcription, not that the user stored it outside this device. The UI must
explain external storage. As approved on 2026-09-18, moving Back between save and confirmation may
redisplay the original result within the same unfinished, in-memory ceremony. Leaving that ceremony,
locking, reloading or creating a signed confirmation retires the display; it must never be persisted
for redisplay or reconstructed on resume. Leaving while a display remains available warns that the
browser will discard its copy. See [the navigation contract](./account-preview-navigation.md).
The current client module uses native WebCrypto; this evidence covers Chromium and Node, not the full
browser/platform matrix. No new dependency was added.

## Exact preparation and proof bytes

`RecoveryDraft` contains `v`, the existing `principalId` and `workspaceId`, proposed `lineageId` and
`authRoot`, `rootCommitment`, `rPub`, `bootstrapSigner`, and the exact envelope. Unknown fields and
wrong widths/versions refuse. These are preparation data, **not service-authorized selectors** for a
Local workspace. The future promotion owner must supply and revalidate their trusted provenance. In
particular, it must establish the service authority root before generating the code; accepting a key
beside a binding as proof of that same binding is forbidden. Tests supply an explicit synthetic root.

The initial recovery counter is zero. The envelope digest encoding and draft digest are pinned here;
the recovery-state digest follows TRD §13.5:

```
envelope_digest = SHA256(LP("done/recovery-envelope/v1") || LP("1")
                        || LP(hex salt) || LP(hex nonce) || LP(hex ct-including-tag))
recovery_state_digest = SHA256(LP("done/recovery-state/v1") || LP("0") || LP(hex R_pub)
                       || LP(hex envelope_digest) || LP(hex root_commitment)
                       || LP(hex bootstrap_signer))
draft_digest = SHA256(LP("done/account-recovery-draft/v1") || LP("1")
               || LP(principalId) || LP(workspaceId) || LP(lineageId) || LP(hex authRoot)
               || LP(hex recovery_state_digest))
challenge = SHA256(LP("done/account/finalize-recovery/v1") || LP(registrationAttemptId)
            || LP(accountId) || LP(recoveryId) || LP(hex draft_digest)
            || LP(rpId) || LP(origin) || LP(base64url fresh-service-nonce[32]))
recoveryProof = Ed25519(bootstrap-private;
               LP("done/account-recovery-confirm/v1") || LP(base64url challenge)
               || LP(hex draft_digest))
```

The passkey signs a fresh WebAuthn assertion over that same challenge. The core verifies it against the
retained confirmed registration credential, requiring the established origin/RP, UP/UV, embedding and
user-handle rules. A previous registration confirmation, sign-in or replacement proof cannot finalize
this operation. The service learns no code or recovery private key. It can check bootstrap-key possession;
it cannot remotely certify an honest client UI or inspect the opaque envelope. The honest owner enforces
re-entry and all sealed-material checks before asking for the passkey assertion.

## Durable owners and restart

The service adds private `beginRecovery`, `resumeRecovery`, `cancelRecovery` and `finishRecovery` calls,
reachable only through the existing token/origin/Host-limited loopback adapter at `/account/recovery/*`.
The original saved registration `retryKey` resolves a completed registration with a confirmed credential
and a still-pending account. It is a sensitive pending-attempt capability, not a bearer account grant.
No caller-supplied account ID or credential selects the target. One immutable draft occupies the account's
recovery row; a competing or changed draft refuses. Its ten-minute challenge starts on `beginRecovery`,
after code generation/display, when the owner begins confirmation.

Finalization snapshots the row and credential together, checks both signatures outside the transaction,
and rechecks eligibility, cancellation, expiry, exact row and retained credential at commit. One SQLite
WAL/FULL transaction consumes both proofs, records their canonical digest and returns one historical
`recovery-confirmed` receipt. A repeated exact proof recovers that receipt; changed proofs refuse. The
receipt includes the exact draft and recovery-state digests. It grants no session, content access,
recipient membership, relay permission or activation. Completed receipts remain historical after expiry
or a later eligibility change; future authority use must revalidate current service state.

Fresh private service databases now use schema version 2. An existing v1 database refuses opening unless
its offline owner explicitly supplies `upgradeFromV1: true`; the additive table/version update is one
transaction. The private HTTP adapter does not opt into that upgrade. Stop existing service processes
and back up their database before that explicit operation. No personal service database was upgraded.
Unknown versions or changed origin/RP policy still refuse, and old binaries refuse version 2.

The browser's `withRecoveryOwner` holds one profile-wide Web Lock and uses the separate
`done.account-recovery-preparation.v1` IndexedDB database. It serializes methods and retains the lock
until outstanding operations settle, including cancellation. The owner stores the sealed draft before
returning the generated code. On reopen it compares account, retry capability and complete context to
its caller's expected values. It never takes a target or replacement draft from a service reply.

After code re-entry and the passkey assertion, it commits the exact two-proof request to IndexedDB
before sending it. Renderer death or a lost response then resumes that request, without persisting the
code or private keys and without replaying a new prompt. The owner compares returned account, draft,
recovery ID and recovery-state digest. A claimed service receipt alone cannot skip local confirmation.
Abort before a progress commit leaves the preceding stage; an ambiguous write can be inspected on reopen.

Cancellation and expiry are terminal for this bounded attempt. An unsaved/lost code cannot be redisplayed.
A future enrollment UI must own abandonment/reset and pending-attempt cleanup, including a crash after
saving the draft but before displaying its code; that case leaves a pending, unusable account. There is
no automatic draft replacement or activation to make it appear successful. The private owner exposes
no ordinary-user onboarding UI, and this slice is not ready for personal enrollment on its own.

## Validation and next bounded phase

`pnpm account:recovery` runs directed and generated histories, independent crypto reconstruction,
real service-process SIGKILL cases, deliberate acceptance controls, and disposable native browser tests.
The runner preserves source pins, streaming output, JUnit, completion/deadline status, and control or
counterexample records. Property tests use a separate expected durable-state ledger; they are not a
proof of an unrepresented host or protocol state. Native tests cover actual IndexedDB abort, owner
exclusion/cancellation settlement, renderer death, browser restart and virtual passkey bytes.

Next: the first authority-root persistence/bootstrap owner and promotion preparation. It must connect
this exact recovery result to the existing unlocked Local identity and never-admitted lineage, prepare
fresh device signing/wrapping credentials under mandatory custody, wrap required generations to `R_pub`,
and define the authenticated genesis/index restart handoff before exposing activation. Content-blind
sync and second-device adoption follow. The second device adopts this workspace without importing its
old plaintext writing. Source cleanup, device enrollment, recovery replacement, sessions, service restore,
rate limiting, deployment and whole-protocol review remain separate work.
