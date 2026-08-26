---
schema: 1
kind: finding
id: f-b9ff071-webauthn-cross-origin-policy
status: validated
type: implementation-hazard
severity: low
confidence: high
introduced_by: b9ff071ddb4ee67e47179e549b5ad22a429ac5ee
work_item: B-01
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# `The selected WebAuthn verifiers do not enforce a cross-origin embedding policy`

## Affected requirement or guarantee

TRD §13.9 and rows 12/14 claim that the offline slot and recovery-replacement step-up verify parsed WebAuthn
client data before trusting the assertion. OC-074/OC-076 require those ceremonies to resist replay and
cross-protocol misuse; the browser origin is also part of the cryptographic boundary under OC-079.

## Original source

At `c6116669030eedeea3d599bca0da3547114e6930`, row 12 and row 14 are open construction choices. The original
contract requires concrete adversarial tests but does not preselect a WebAuthn field policy.

## End-state source

`b9ff071ddb4ee67e47179e549b5ad22a429ac5ee:scripts/generate-account-credential-vectors.mjs` parses
`clientDataJSON` and checks `type`, `challenge`, and `origin`, but never reads `crossOrigin` or `topOrigin`.
`ff0b48f8ce7f1878ac6abb9c849380800b55370c:scripts/lib/webauthn.mjs` centralizes serialization, and
`scripts/generate-recovery-vectors.mjs` repeats the same verification omission for row 14. The positive vectors
always serialize `crossOrigin: false`, so they cannot expose the missing branch.

W3C WebAuthn Level 3 Candidate Recommendation Snapshot, 26 May 2026, §7.2 steps 13–14 requires a relying party
to verify that a `crossOrigin: true` ceremony is expected and to validate any `topOrigin` against allowed
embedding origins: https://www.w3.org/TR/webauthn-3/ (retrieved 2026-08-21).

## First introduction and propagation

`b9ff071ddb4ee67e47179e549b5ad22a429ac5ee` introduces the slot verifier without these checks. `ff0b48f` moves
the common serializer to `scripts/lib/webauthn.mjs` and adds recovery step-up verification with the same omission,
propagating it to both selected ceremonies and the end-state E-12/E-14 evidence model.

## Reachable consequence

If the app origin is permitted to invoke WebAuthn while embedded by an untrusted top-level origin, a correctly
signed assertion with the expected app `origin`, RP ID, challenge, UP, and UV but `crossOrigin: true` and an
unapproved `topOrigin` passes the project verifier. The attacker still needs the user to complete authenticator
verification and cannot read same-origin content directly, so the immediate impact is bounded to ceremony
confusion/clickjacking and any action the framed app exposes. It is not a key-forgery or silent remote-decryption
path, hence low severity.

## Supporting evidence

The W3C verification algorithm treats these fields as relying-party policy, not as redundant signed decoration.
WebAuthn §5.9 gives `publickey-credentials-get` a default Permissions Policy allowlist of `self`, but also defines
explicit iframe delegation. Therefore the browser default reduces ordinary reachability without making RP-side
validation unnecessary. The project's exact verifier has no conditional or allowlist for either member.

## Counterevidence and disconfirmation attempt

I tested whether exact `origin` and `rpIdHash` checks make `crossOrigin` redundant. They do not: in a cross-origin
iframe, the caller can still be the legitimate app origin while the top-level origin differs. I also tested the
default Permissions Policy as a complete defense. It blocks undelegated use, but WebAuthn explicitly permits a
top-level page to delegate `publickey-credentials-get`, after which the signed client data records the condition
for the RP to judge. A deployment-wide anti-framing policy could make the path unreachable, but no such invariant
is part of these selected verifiers and its as-built enforcement is future work.

## Validation procedure

1. Add a project vector whose valid signature covers client data with `crossOrigin: true` and an unapproved
   `topOrigin`, while keeping type, challenge, origin, RP-ID hash, UP, and UV valid.
2. Run both row-12 and row-14 verifier paths; the current model accepts it.
3. Decide the product policy explicitly. If cross-origin ceremonies are forbidden, require `crossOrigin !== true`
   and reject `topOrigin`; otherwise validate `topOrigin` against the ceremony-specific allowlist.
4. Reconcile the choice with frame controls and Permissions Policy in row 17's as-built profile.

## Disposition

Validated by `V-01`. Add the missing ceremony-policy check and negative vectors, or demonstrate a
deployment invariant that makes cross-origin WebAuthn invocation unreachable and bind that invariant into the
row-17 verification evidence.
