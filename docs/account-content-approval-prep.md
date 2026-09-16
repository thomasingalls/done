# Backend phase three: device-to-device content approval

2026-09-16. Defined against signed `ca828c5f`, which completes the bounded
[admission-only phase](./account-successor-admission-prep.md). **Preparation and chunk A complete;
authenticated exchange and durable approval remain open.** Release validation remains paused.

## Outcome and first boundary

Give the existing certified device an explicit, durable decision about the exact new device's
wrapping and signing keys. Account admission cannot make that decision. The person reads five
Crockford symbols from the new device and types them into the existing one. Both devices must be
awake. A match is useful only for the one authenticated, committed transcript that produced it.

The first implementation chunks stop at durable approval. They release no content key and create
no certified recipient. Delivery, factor-protected installation, countersignature and certification
need their own bounded continuation. The full second-device milestone also needs bootstrap and
multiple-publisher delivery. Ordinary Account entry and deployment stay disabled throughout this
private work; the author's actual old second device will adopt the first device's writing, never
import its pre-encryption writing.

## What the existing runtime does and does not supply

| Boundary at `ca828c5f` | Consequence |
| --- | --- |
| One original certified writer, one pending candidate, one epoch-1-to-2 admission successor | Start the ceremony at the verified epoch-2 head. Do not imply arbitrary successors, additional candidates or replacement admission already work. |
| Candidate possession was proven during account preparation; its receipt is historical after consumption | Resolve the exact candidate through the authenticated admission successor. Do not demand that the old preparation deadline remain live or treat its receipt as a new operation grant. |
| The existing owner durably installs admission history and preserves its original certified set/recovery state | Derive ceremony context from that held authority. A service-supplied roster is not a source of existing approver keys or new recovery state. |
| Discovery/read endpoints accept only the original certified writer | The pending device needs a separate bounded ceremony channel, with possession proof and no ciphertext-read capability. Do not relax ordinary read authorization. |
| Published row-11 vectors define commitments, transcript, SAS and wrap info | Reproduce those bytes unchanged. New relay framing is a separate versioned contract, not an excuse to replace the selected SAS. |
| `test/enrollmentStates.test.ts` models the former automatic sibling-rebuild policy without transcript bytes | Its crash-carrier and recipient-isolation examples remain informative; its rebase liveness result is historical and does not establish the new restart policy. Add a model that contains authority head, transcript identity, one-attempt state and release state. |

## Settled restart policy

The operator selected **restart on a competing epoch change**. This amends the automatic sibling
rebuild paragraph of TRD §13.6 and clarifies row 11 §7:

- Before completion, a verified unexpected authority head invalidates this ceremony, including a
  successful but unactivated code comparison. Do not rebase the old approval or transplant its
  transcript hash. A new attempt needs fresh credential identity and keys, new admission, fresh
  nonces and typed code. A fresh transcript under the same credential would reset the stated budget.
- Exact resumption is different from restart: same credential, context, commitments, nonces,
  transcript and durable decision. It never draws another nonce or asks the person for a second
  guess. Missing or unauthenticated durable state fails closed.
- The ceremony's own expected certification successor is completion, not a competing change. It
  must authenticate the exact staged certificate and installation countersignature; a matching
  epoch number alone is insufficient. Lost completion replies recover that exact outcome.
- An unsigned stale-parent/error response is not proof of a competing successor. Pause/retry or
  fetch authenticated authority; do not let an untrusted refusal erase durable pending state.
- After release, the old device may already possess the key. Keep the immutable delivery and
  pending-certificate evidence, mark it superseded/uncertified when appropriate, and refuse activation
  under the changed parent. Restart is not cryptographic erasure or revocation. Removing access to
  future generations requires the rotation/exclusion protocol; this phase does not implement it.

The current single-child admission runtime cannot admit the fresh replacement required by this
policy. The initial private ceremony may therefore report `restart-required` and stop safely. A
replacement-admission/general-history extension is a prerequisite to offering an in-product retry;
resetting a test workspace or recycling the old credential is not that implementation. This is an
explicit availability boundary, not permission to spend the same credential twice.

## Context and commit/reveal ownership

Hold the pinned authority, account/principal, workspace/lineage, exact current epoch/head, original
certified set and recovery-state digest, and both credential identities with their exact public keys.
The existing signing key resolves from the held parent certified set. The pending signing/wrapping
keys resolve from the admitted candidate and must equal the new device's locally owned keys.
Check eligibility again before each irreversible local transition and before later release/activation.
Ordinary ciphertext appends do not change this context or interrupt the ceremony.

The existing row-11 primitives remain:

1. Each side privately generates and saves 32 random nonce bytes. Its commitment binds role and
   nonce using `done/enroll-commit/v1`.
2. Before either nonce is revealed, each side durably fixes its own context/commitment and verifies
   the peer's authenticated commitment to that same context. The service's claim that both arrived
   is insufficient. Signed relay messages bind the complete context, role and operation identity;
   the exact signed pair must be retained. Context or commitment substitution conflicts.
3. Reveals bind the fixed commitment pair and role. Verify the peer's nonce opens that role's
   commitment. Duplicates are exact retries; a different nonce, pair or context refuses. Never
   accept a reveal merely because its resulting five-symbol code happens to match.
4. Derive the unchanged row-11 transcript, its SHA-256 identity, five-symbol HKDF string and HPKE
   info. Display only on the new device; the existing device accepts a typed string. This pure
   derivation proves neither the chronology of message exchange nor a durable human decision.

The relay must be bounded, purpose-specific and content-blind, with exact retries, possession
authentication, finite per-candidate state and an explicit expiry policy. Private adapter tokens
are transport access only. It must not log nonces, the SAS, typed input, private keys or content.
Nonces eventually traverse the channel and the service can compute the SAS; secrecy from the
service is not the SAS guarantee. Prevent adaptive choice by fixing context and both commitments
before disclosure. The durable owner, not the relay's reported stage, enforces that order.

## One comparison, durably

Use one designated existing approver for this first supported ceremony. Its authenticated local
record binds the pending credential to one immutable transcript and decision; its storage lifetime
serializes tabs. The service also retains a terminal spent state, but a hostile service cannot be
the only keeper of the client's attempt budget. Supporting multiple independent approvers later
needs an explicit budget/coordination argument rather than another dialog on each device.

Local shape validation may reject input without comparing it: normalize ASCII lowercase and the
selected O/I/L confusables, then require exactly five allowed symbols. A syntactically valid entry
consumes the single comparison. In one durable transition retain the resulting match/mismatch
against the already fixed transcript before publishing success or enabling release. If the write
aborts, expose no comparison result. A committed result is read back on restart without accepting
another input. A mismatch or explicit abandonment terminally spends this credential; closing the
page alone preserves exact resumption, never silently creates another ceremony.

Do not store the entered code or derived SAS. The authenticated transcript and outcome suffice;
nonce/private-state custody belongs inside the factor-protected lifecycle. Cross-tab, process-death,
lost-write-acknowledgment and storage-pressure tests must establish the budget at the real boundary.
Surviving local state is the rollback anchor: this does not promise protection against restoring an
old whole-profile copy, hostile running origin code or deliberate operator state destruction.

## Delivery continuation, before any key release

Durably stage the exact client-signed recipient successor, transcript-bound wrapped content key,
recovery-state material, delivery identity and resumable status before sending any key-bearing bytes.
Keep the operation retryable without resealing or signing a different successor on a lost response.
The new device must already have factor-protected signing/wrapping custody, then authenticate the
package, durably install matching content/recovery state, and countersign the exact installation.
Only the verified serialized certification successor confers read/publication eligibility.

This continuation must specify the epoch-2-to-3 authority shape, certified-key resolution, exact
pending-certificate bytes, service transaction and both clients' cold-open/install boundaries.
General current/history handling and the first writer's queued-envelope continuity also need an
extension beyond the current admission-only history. No `SAS-confirmed` boolean may bypass those
dependencies. A staged delivery is not evidence that the recipient installed it; a service success
is not evidence of local activation.

## Bounded sequence and evidence

| Chunk | Deliverable and focused exit checks |
| --- | --- |
| A — selected primitive bytes (complete) | Closed, bounded parsers and pure commitment/transcript/SAS/wrap-info functions; reproduce existing honest and negative vectors unchanged. Independent Node oracle, generated input/field perturbations, strict normalization and effective field/role omission controls. No owner or grant. |
| B — authenticated ceremony exchange | Define signed commitment/reveal/context bytes and parsers, peer-key resolution and an explicit attempt identity/deadline. Prove both commitments precede disclosure in a small state model, including malicious relay reordering/equivocation, context substitution, duplicate and cross-role messages. No content key. |
| C — durable attempt and private relay | Factor-owned client record and serialized service state. Enforce one transcript/comparison, exact resume, cancellation and terminal refusal. Directed and generated histories plus native commit/crash/race tests; omission controls must actually permit another guess or premature disclosure when the guard is removed. |
| D — two private device owners | New-device display and existing-device typed approval; owned network/storage cancellation, restart-required behavior and cold resumption through real private HTTP. Keep first-writer sync working. No default Account UI, content access or personal device use. |
| Continuation — delivery/install/certification | First define the dependencies above, then implement in similarly bounded chunks. This is the gate before claiming a second content reader; bootstrap and multiple-publisher convergence follow. |

Record each chunk's inputs and limits, update current crypto inventory when runtime constructions
are introduced, and leave new groups open for qualification. Preserve historical vectors, release
campaign evidence, frozen counts and the other seat's progress section. These product checks do not
restart release validation.

## Chunk A result

Pure primitives and bounded code normalization reproduce the existing vectors. 29 ceremony cases
(including 100 generated contexts and 12 effective omission controls) and 12 registry checks pass;
static checks and current crypto inventory pass. [Evidence](./account-conformance-runs/2026-09-16-ceremony-primitives/README.md).
No exchange owner or approval capability exists yet. Next is chunk B.
