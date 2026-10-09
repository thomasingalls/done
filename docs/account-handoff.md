# Private Local-to-Account handoff and startup classification

This phase consumes a retained, verified admission receipt. It selects the existing store as Account
without copying content or changing its principal, workspace, generation, counters, factor seal or
credentials. It is a private handoff/classification API. The default editor and relay remain disconnected;
a subsequent Account writer owner must attach the classified result to its editing lifetime. No raw
classification result grants ongoing read/write authority after its exclusive permit ends.

## Binding and factors

The private service supplies the exact confirmed registration credential as a row-12 `SlotBinding`,
signed under the independently pinned first-epoch authorization root. Its inputs come from the admitted
promotion and credential rows, never caller-supplied keys. The original registration retry capability
and exact request digest select that result. Current active account/admitted promotion and unchanged
credential/offer/receipt are checked before and after signing. This deterministic public binding needs
no new secret, ceremony or schema migration; retries recover identical bytes from retained rows.
The response's request digest and epoch head must match the independently verified admission. Those
wrapper fields are consistency checks, not separate authority. Existing binding bytes are unchanged.

Before handoff, the client verifies the service root, both saved content factors, the candidate's exact
wraps and checkpoint against database-plus-journal replay, and the retained receipt. It verifies the
binding signature and exact account/principal/RP/epoch before invoking a fresh local unlock assertion.
The account passkey proof is scoped to local access, with a new random nonce on every acquisition.
The callback returns only the browser's assertion; callers cannot supply a nonce or substitute a key.
The existing device-lock code still decrypts custody. The recovery code is required to finish handoff,
including an interrupted handoff, but is not required for subsequent Account startup classification.

## Durable handoff

A version-4 promotion carrier retains the exact service binding, expected Account index row and
`handoff-prepared` progress before any index mutation. Older readers refuse. The Account row carries
an explicit versioned handoff identity, the stored binding and the one existing store route. Its
expected bytes are authenticated by the promotion carrier. The old Local claim remains as authenticated
provenance under that same interlock, not as a second selectable Local workspace.

Under the slot's exclusive permit, a strict IndexedDB transaction compares the one exact Local row
and replaces it with the exact Account row. A retry accepts only one of those two rows; missing, closed,
extra, changed or foreign routing refuses. After that commit, strict replacement advances the carrier
to `handoff-selected`. A selected carrier with the old Local index is a regression and refuses; it does
not silently reselect. An Account index paired with prepared progress resumes the final marker write.

There is no claim/index transaction across two databases. The prepared carrier deliberately owns that
interval, excludes ordinary Local/legacy access and tells restart exactly which operation may resume.
An aborted index transaction leaves the Local row plus prepared handoff; loss of the acknowledgement
leaves the Account row plus prepared handoff. Neither state permits an alternate workspace or cleanup.
Cancellation retains the exclusive permit until native work settles. No timer authorizes a retry winner.

## Owned startup classification

Startup takes an independently configured authority pin and device-lock code, rereads/authenticates the
claim, custody, marker and exact Account index under its own permit, and requires selected progress.
It revalidates the admitted first epoch and binding before requesting a fresh account passkey proof.
Then it cold-replays the existing database and journal and compares the checkpoint's full integrated
state and coverage using the device wrap. Unknown records, incomplete dependencies, missing/changed
routing, invalid binding/assertion or wrong factor refuse. No network or recovery code is required.

The result identifies the Account, exact source and authenticated store routing. It grants no relay
session, epoch mutation, source cleanup or write capability. Local clear, old index methods and ordinary
Local editing continue to refuse the retained interlock. Account editing/lifetime integration follows
as a separate bounded component before encrypted relay work. Passkey revocation freshness while offline,
additional credentials/epochs, Account close/delete and production pin distribution remain later gates.

## Conformance

Exercise abort and renderer death before/after prepared/index/selected commits, exact cold retries,
competing owners, cancellation/drain, offline restart without recovery code, altered signed binding,
wrong account/key/pin/assertion/nonce, and disappearance or substitution of index/custody/marker carriers.
Generated histories need independent source inventories and replay expectations. Fault controls must
actually classify/select a bad result when a guard is disabled. Preserve reproducible logs and source
hashes; do not claim whole-protocol, profile-rollback, power-loss or full device-matrix correctness.


## ES256 assertion boundary corrected during integration

WebAuthn's [signature encoding contract](https://www.w3.org/TR/webauthn-3/#sctn-signature-attestation-types)
requires DER for ES256. The earlier offline verifier passed those bytes directly to WebCrypto, which
expects fixed-width r || s. Its unit fixture used subtle.sign and therefore supplied the same raw format.
A disposable Chromium virtual authenticator reproduced refusal under the committed `beed8cf` verifier.
The verifier now converts strict canonical DER to the 64-byte WebCrypto representation, rejecting
negative, overlong, padded, truncated or trailing encodings. Slot binding and challenge bytes are
unchanged. Tests use independent OpenSSL DER signatures and an actual navigator.credentials.get result;
this is not evidence about the author's personal authenticator or the full platform matrix.

The current [activation receipt v2](./account-activation.md) identifies the actual registration passkey.
The slot-binding verifier requires that same passkey ID, in addition to its existing account/scope/key
checks. This ID is distinct from the workspace signing credential. Old private receipt-v1 artifacts refuse
without rewriting retained Local carriers.
