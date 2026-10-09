# Cross-account admission isolation — current F-21.3 disposition

2026-09-11. Base: signed `c10dee3c850c5e56ced82657fe0dbb8b2ac3d053`, plus the test-only patch
recorded in the [campaign source pins](../../account-conformance-runs/2026-09-11-account-isolation/sources.json).
The [historical review](./af8941e-96a2040.md#f-21-test-gaps-carried-forward) remains unchanged.

**F-21.3 is closed for the current private registration/recovery/admission capability boundary.**
Importance remains medium authorization evidence. The missing test was real; this phase found no
production capability-confusion defect and changes no production code or protocol bytes.

The original generated admission `wrong` command rejects an unknown retry key. The older activation
swap test also gives each account its own database and authority. Neither establishes what happens when
the tested service recognizes both capabilities. The new fixture places two completed registrations,
independent recovery keys and real Ed25519/ES256 passkeys in one database under one authority, with
distinct principal/workspace/lineage/signing identities. Those distinct identities also prevent a
workspace-uniqueness refusal from masquerading as successful isolation.

The directed matrix makes 148 mixed-input checks in both directions across pending, offered,
challenged, active and cancelled states. Eight more swaps exercise live unconfirmed recovery ceremonies.
Every negative must refuse for a reason other than malformed input and preserve every logical row in
both service and authority databases. Legal requests still confirm recovery, obtain offers, activate,
return account-bound slot bindings and resume exact receipts. A complete valid request for B is valid B
authority; the tests do not incorrectly require it to fail merely because the caller previously used A.

The generated oracle predicts per-account lifecycle, cancellation, credential counter, activation proof
hash and retained receipt, comparing full durable inventories. Random first-issued offer/seal bytes are
observed once and pinned; challenges are independently inspected and receipts cryptographically verified.
This is an independent state/isolation oracle, not an independent implementation of every cryptographic
primitive. It executes 160 histories with shrinking, plus directed histories covering every before/after
commit reply-loss boundary. Six SIGKILL cases exercise actual service process death and cold retry; a
seventh case admits both accounts through simultaneous live service processes.

All three source omission controls are detected:

- Accepting any recognized registration capability before selecting the requested account still refuses
  the old unknown token, but returns A's genuine signed offer for B's valid token. The new test catches it.
- Removing the pending account comparison accepts a crossed abandonment request and cancels the token
  owner's account instead of refusing the mismatch.
- Removing the account predicate from proposal cancellation mutates the neighboring proposal. The
  generated oracle shrinks this failure with seed `112104`, path `0:1:1:2:2:2`, to a two-command suffix
  after two offered accounts; the first abandonment already violates the neighbor-row invariant.

[The final campaign](../../account-conformance-runs/2026-09-11-account-isolation.md) passes 44 stages,
205 Node tests (23 new), types, 30 vector commands, census/map/registry, lint and format with 865 matching
source pins. The affected admission, activation, recovery, account-core, handoff, bounds and service
delivery regressions pass, including their selected native browser cases. No test was skipped or timed out.

This is bounded private-service evidence. The new two-account admission payloads are synthetic,
content-blind fixtures; actual encrypted Yjs/local custody is exercised by the inherited native campaigns.
Process death is not power failure. This does not qualify HTTP exposure, enrollment, general recovery,
concurrent membership, hostile platform behavior or every possible interleaving. Other F-21 subfindings
retain their separate dispositions. In particular, service-issued refusal/conflict composition is next;
parser negatives, the delivery oracle and neutral residue scanning are not closed by this result.
