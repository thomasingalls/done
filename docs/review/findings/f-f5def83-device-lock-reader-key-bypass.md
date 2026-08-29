---
schema: 1
kind: finding
id: f-f5def83-device-lock-reader-key-bypass
status: repaired
type: guarantee-overstatement
severity: medium
confidence: high
introduced_by: f5def83ac6f21873ab7fb589247dd116fc2febd9
work_item: X-01
created_by: /root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# A copied pre-lock profile can use its promptless reader credential to bypass the rotated device-lock envelope

## Affected requirement or guarantee

Device-lock enrollment is intended to bound a pre-enrollment profile copy to history: after factor-gated custody is
installed and the content generation rotates, the copy should not open content written “from now on.” This finding
is independent of the existing `rotation_owed` finding: it applies even when the ordinary rotation commits.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§13.3–13.4 separates local custody from the device's
operational signing/wrapping credentials. Where PRF is absent, each operational private key persists as a promptless
structured-cloned non-extractable `CryptoKey`; those credentials receive new keys and gate sync, not local startup.
The same SHA's `docs/PRD.md` §7.2 leaves device-lock migration/copy open while promising stronger custody against a
copied profile (`OC-026`, `OC-075`).

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/selections/row-13-device-lock.md` §§4–7 replaces `L_local` with
factor-gated `L_lock` and rotates so a pre-lock copy should not read the new generation. `docs/TRD.md` §13.4 still
persists the device wrapping private key promptlessly when PRF is unavailable, while §13.7 wraps each new generation
to every remaining reader credential. The exact row-15 rotation vector includes a wrap for the rotating laptop as
well as the other remaining reader; device-lock enrollment neither replaces nor revokes that reader key.

## First introduction and propagation

`f5def83ac6f21873ab7fb589247dd116fc2febd9` introduces the temporal “from now on” property through rotation while
leaving the separate operational credential unchanged. `dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9` propagates the
unconditional forward-protection copy. Later enrollment and transition selections make the reader-wrap delivery
path concrete but do not reconcile it with per-slot lock enrollment.

## Reachable consequence

1. On a PRF-absent device, a profile snapshot contains `L_local`, the device's promptless wrapping private
   `CryptoKey`, and potentially a still-live account/relay session.
2. The owner enables the device lock. The current profile atomically installs `L_lock`, removes `L_local`, and
   successfully rotates to `K_(g+1)`.
3. Because the device remains an authorized reader, rotation publishes a reader wrap for the same wrapping key that
   exists in both the live profile and its old snapshot.
4. If the snapshot can connect while its bounded relay/account access remains usable, it retrieves that wrap and
   uses its copied non-extractable key handle to recover `K_(g+1)`, then decrypts the later ciphertext.

The factor correctly protects the local `KeyEnvelope`; the second custody path simply goes around it. The impact is
bounded to copied profiles that can execute the origin and reach the wrapped generation, but that is the exact
profile-copy scenario the stronger tier's temporal copy is meant to address.

## Supporting evidence

Row 13's custody record and vectors cover only `L_local`/`L_lock`, factor seals, local generation envelopes, and
`rotation_owed`; they contain no operational-credential transition. Row 15's concrete rotation payload includes the
rotating laptop in its reader-wrap map. PRD §11 separately acknowledges that a leaked relay token may obtain
ciphertext, and TRD §13.4 says the PRF tier—not non-extractability—protects persisted operational keys from a copied
profile. WebCrypto Level 2 §5.2 specifies persistent `CryptoKey` storage and §6 explains that code with access to a
key handle can exercise it even when raw key bytes are not exposed; `extractable: false` blocks export/wrap, not use:
https://www.w3.org/TR/webcrypto/ (retrieved 2026-08-21).

## Counterevidence and disconfirmation attempt

The attack fails on the optional PRF-protected operational-key tier because the copied profile lacks the
authenticator output, and it fails once all transport/account access held by the copy is unusable. Those are useful
bounds, not a general defense: PRF is explicitly optional, relay credentials are bounded rather than guaranteed
absent at the moment of the copy, and the device lock is presented as a mandatory-code construction independent of
PRF availability. Omitting the rotating device's self-wrap could also block this exact path, but the selected rule
and vector include every remaining reader, and no invariant says a self-wrap is unavailable to the credential it
names.

## Validation procedure

1. Create a two-device account with device `A` on the no-PRF operational-key tier; snapshot `A`'s profile while its
   relay admission remains valid.
2. Enable the device lock on live `A` and complete its ordinary rotation.
3. Confirm the committed package contains the reader wrap addressed to `A`.
4. Run the snapshot as the app origin, retrieve the wrap, and try to open new-generation content using the copied
   wrapping key. The local `L_lock` must never be entered.
5. Repeat with PRF-protected operational credentials as a negative control; that copy should fail before unwrap.

## Disposition

Reopen the lock/reader-credential composition. Either make lock enrollment replace or factor-gate every path by
which that device can obtain future generations, prove and test that its own reader wrap is unreachable to the old
profile, or narrow the temporal promise to the assurance tier and session conditions actually enforced.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by `the post-lock wrap set`
guard with `replacement-credential-seal-as-a-factor-seal` and `replacement-credential-under-a-wrong-code`
(device-lock vectors).
