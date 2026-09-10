# Private Account durable delivery evidence

This bounded phase follows [the v7 spool](./account-spool.md) and
[response verification and submission framing](./account-decisions.md). The private
`openOwnedAccountDeliveryWorkspace` owns exact signed first-attempt submissions and authenticated response
bytes. It adds no relay, dispatch, service decision issuer, successor encryption or default Account UI.

## Reader fence and authority

A verified v7 owner may activate promotion v8, stage `account-delivering`, under its existing exclusive
slot permit. A v8 restart reauthenticates the same selected claim, custody, first-epoch admission receipt,
lineage ID/head, acceptance key and device signing key. It preserves the v7 content counter and witness;
it never resets that witness. V6 must first enter v7. Old parsers and the separate v7 factory refuse v8.
The v8 marker must commit before any delivery entry or editor escapes. Interrupted activation is resumed
from the authenticated marker, not inferred from the presence of rows.

Authority is internal state derived from authenticated storage and the caller's pinned service authority.
No transport-supplied subject, public key, baseline, evidence object or mutable delivery-status setter is
accepted. Every operation verifies the retained ledger and rereads the authenticated promotion/custody.
New entries recheck these again after signing/sealing, immediately before the content commit path, and
validate the proposed transition against a fresh census at its actual reserved outer record sequence.
Existing lifecycle and content-counter checks still fence cancellation, generation and concurrent writes.
This relies on the exclusive owner for conforming marker writers; it does not claim atomicity against an
arbitrary same-origin process changing storage after the final check.

## Retained records and atomic completeness

An encrypted record's canonical UTF-8 JSON plaintext is:

```
["done/account-delivery/v1", 1, workspace, credential, principal, epoch, generation,
 lineageId, authorityHead, type, position, lowercaseHexWire]
```

`submission` uses the outbound store and contains the exact signed submission wire. `response` uses heads
and contains the original canonical signed response wire. The closed parser binds every route/authority
field, positive safe position, carrier, size and canonical bytes. Responses retain the framing limit;
submissions must fit both their wire limit and the existing encrypted-content batch limit.

Merge delivery rows with all original position/invocation/envelope rows in authenticated outer-sequence
order. Extend the existing spool witness over this entire ledger using its unchanged hash rule. The new
row and signed next witness commit together in the same strict transaction, comparing prior authenticated
metadata. Outer storage reservations happen first; aborted final commits may consume those reservations.
They cannot publish a semantic record without its witness. Missing final proofs or submissions refuse
cold open against retained current metadata; coordinated rollback of both metadata and ledger remains
outside this local guarantee.

On each census, verify the original source/envelope relation, full ledger witness, every submission's
device signature and exact envelope bytes, and every response under authenticated acceptance authority.
A delivery entry must follow its persisted envelope. Retain original capsules and all ledger rows through
content compaction. Ordinary Local source capture may continue after outbound publication halts.

## Derived state and first-attempt submission

`deliveryStatus` is derived from verified proof bytes, not persisted flags:

- An accepted head at position n proves this owner's entire retained prefix through n.
- A refusal names its exact owned subject and closes that position. A refusal within an accepted prefix
  is contradictory, in either arrival order. Different refusal IDs for the same position contradict
  the service's obligation to return the same permanent closure message.
- A proved different accepted digest/epoch is conflict. A final head at n conflicts with a higher accepted
  head or a different final cutoff, in either order.
- Conflict takes precedence, then any closure, then finalization, otherwise publication is ready. A valid
  contradictory proof is retained and halts outbound work; it does not make Local writing unreadable.

`prepareSubmission(n)` permits only the earliest unaccepted position, after its original v2 envelope is
persisted. It binds that exact wire and the authenticated lineage with the prepared device signer and
zero parent refusal. It commits the wrapper before returning, then rereads verified stored bytes. An
unknown completion is resolved by census: return the exact saved wrapper or safely retry signing the
same original envelope if no wrapper committed. This invokes no new network encryption. Accepted
positions return `accepted`. Closed/finalized/conflicting state returns `blocked`.

`pendingSubmissions` exposes only the earliest eligible persisted wrapper while publication is ready.
Acceptance removes it from eligibility without deleting it, its envelope or its source capsules. The
next position can then be prepared. Raw envelope inspection remains an audit API; future transport must
use the eligible submission path. There is currently no transport.

`recordResponse(n, bytes)` verifies the original bytes against the owned envelope and reconstructed
prefix. Unknown/invalid responses and exact duplicates write nothing. Persist a new verified response and
derive state again from readback. After the first contradiction, retain existing evidence and refuse new
proof writes (duplicates remain no-ops). A closure/final head can still receive the first contradictory
proof. No original envelope allocation or new submission may follow durable closure/finalization/conflict.

Closing cancels queued work, drains pending WebCrypto/native transactions, withholds late results, and
retains the slot permit until settlement. Device signing stays inside the existing factor/passkey lifetime.
Caller-visible wire is detached from the retained census. A cryptographic signature authenticates the
service's claim; it does not implement service-side permanence.

## Validation and following boundary

The campaign combines an independent set-of-propositions oracle over generated proof histories with
independently signed Node/OpenSSL native cases. Disposable Chromium tests cover v8 activation, submission
and response commits on both sides of renderer death, exact retry, prefix/final contradictions in both
orders, invalid/duplicate no-ops, missing rows, compaction, Local editing under halt, cancellation, changed
authority during signing, and generated restart histories. Actual controls bypass durable return, witness
verification, prefix contradiction checks and authority rechecks; each must demonstrate its predicted
bad outcome. Old-reader rejection uses the committed v7 parser.

Next: define and implement durable service decisions, enforcing one accepted digest or permanent closure,
contiguous acceptance, authenticated device membership and exact retry. Then add content-blind relay
integration and a one-device ciphertext round trip. General lineage advancement, successor minting,
concurrent Account writers, history pruning/backlog performance, recovery/finalization workflows, rotation,
revocation, two-device enrollment and production authority/restore coverage remain separate work. The
first authenticated private epoch and an unrewound, unbranched credential history remain explicit limits.

The following [private service phase](./account-service-delivery.md) implements durable first-epoch
acceptance/refusal transactions and a signed completeness witness. The browser owner is unchanged;
its service consumption is exercised through a test bridge, with relay transport still separate.
