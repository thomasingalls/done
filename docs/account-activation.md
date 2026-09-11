# Fresh account assertion for first activation

2026-09-11, L-1. Prep for review F-04, after descriptor versioning `4f71bac`.
This phase is private first activation; no onboarding UI, real provisioning or enrollment.

## Contract before implementation

After the client retains its exact signed completion, the service issues a fresh, fixed-purpose
WebAuthn challenge. It binds the independent service pin, account ID, complete admission request digest,
offered epoch head, closed completion digest, actual confirmed registration's passkey ID, a service-owned
random 32-byte nonce and expiration. Signing credential IDs and passkey IDs are different namespaces.
The client verifies the service signature and exact operation before invoking its assertion callback.

`ActivationContext` is closed and fixed-order: `{v:1, pin, accountId, requestDigest, offerHead,
completionDigest, credentialId, nonce, expiresAt}`. Digests/nonces are lowercase hex; account/passkey
IDs are canonical base64url. Expiration is an integer service Unix millisecond timestamp.

```
completionDigest = SHA256(UTF8(JSON.stringify(parseCompletion(completion))))
contextDigest = SHA256(UTF8(JSON.stringify(parseActivationContext(context))))
WebAuthn challenge bytes = SHA256(LP("done/promotion-activation/v1") || LP(hex contextDigest))
challenge signature = Ed25519(K_auth,
  LP("done/promotion-activation-challenge/v1") || LP(hex contextDigest))
```

The signed challenge object is `{v:1, kind:"promotion-activation-challenge", context, signature}`.
Request options are reconstructed from that context: the configured RP, exact allowCredentials ID,
user verification required, and a ten-minute timeout. The service checks WebAuthn type, challenge,
origin/RP, user presence/verification, actual credential key and account userHandle using its existing
assertion verifier. Authenticator counters are observed, not treated as the replay fence.

Schema 5 adds one nullable activation record on the promotion row. The record retains the signed
challenge and, after consumption, a hash of the canonical assertion response. The first challenge fixes
the completion digest. Exact retries return the same unexpired challenge. After ten minutes, an exact
request can renew it with a fresh nonce; no assertion against the superseded/expired challenge works.
A different completion cannot replace that commitment. No caller clock or nonce selects authority.

First activation rechecks the current registration/recovery, offer, completion, credential, challenge
record and expiration after asynchronous verification, inside BEGIN IMMEDIATE. One FULL-synchronous
commit consumes the proof, records the receipt, updates the observed counter and marks the account active.
No epoch/receipt escapes before commit. A second finish with the same proof returns the same result;
an altered proof conflicts. Exact begin/challenge readback can recover an already committed receipt
without another assertion, even after expiry: that reads the existing result and does not activate again.

Receipt format advances to **v2**, signing `done/promotion-receipt/v2` over its closed fixed-order body.
It retains the existing offer/completion/epoch signature plus `activation: {context, proofHash}`. This
records what the service attests it consumed; it does not publish the assertion or prove honest service
execution. Client receipt verification checks context against the request/offer/completion and pin.
The slot binding and service delivery must use the passkey identified by that receipt.

## Lifetime and compatibility

The private Local admission owner holds its existing slot/custody permit across challenge, assertion
and completion. The assertion callback receives owned request options and the task's AbortSignal.
Cancellation is forwarded and all started work drains before releasing exclusion. No new client progress
stage, challenge cache or raw assertion persistence is needed: the retained completion plus service
challenge/result is the restart authority. A lost committed reply cold-recovers the exact receipt without
showing another prompt. User-cancelled assertion leaves the offered Local carrier intact; retry can prompt
again. Abandoning the pending promotion wins over any later assertion and cannot cancel an active account.

Schema 4 requires explicit offline upgrade; old proposed rows acquire a null activation field and can
continue. Existing private receipt v1 artifacts are retained but refused by new owners; they are not
rewritten or given invented fresh-proof history. No real Account receipt exists. Old clients/services
refuse schema 5 / receipt v2 or the new finish shape. Ciphertext, manifest/admission v2, service root and
acceptance-key seals are unchanged. The small challenge response is signed; the completion-bearing
challenge request shares the existing 72 MiB admission route bound. Assertion data is separately bounded.

## Conformance

Reproduce activation with no fresh assertion on immutable `4f71bac`. Test the repaired service with
independent WebAuthn signatures and an independent context/LP oracle. Cover missing/wrong/stale proof,
changed signed completion, account/credential/origin/RP swaps, renewal, exact retry, races, abandonment,
process death on both sides of challenge/activation commits, and deliberate omitted-check controls.
Use shrinking-enabled generated histories with an independent activation state machine. Native cases
cover client context checks before prompt, cancelled/deferred assertion lifetime, renderer death and
lost final replies. Retain admission/descriptor/handoff/composed-sync regressions and isolated build checks.

The remaining Account crypto registry/recovery alignment, invocation power-loss accounting and rollout
requirements remain separate gates. Personal packages, browser, stopped servers, historical review and
L-2 checkpoint stay unchanged.

## Completed bounded outcome

Implemented and validated on 2026-09-11. [Preserved evidence](./account-conformance-runs/2026-09-11-account-activation.md)
records the immutable missing-assertion reproduction, independent proof/context checks, shrinking histories,
effective omissions, native cancellation/cold recovery and affected regressions. This closes private F-04;
it does not register the remaining crypto constructions or enable a real Account.
