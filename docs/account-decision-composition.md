# Service-issued decisions through the browser owner (F-21.7)

Base: signed `2bbb4c6`. The existing service/browser test covers acceptance and lost acceptance only;
older refusal/conflict client tests directly sign fixture responses. This phase composes actual service
issuance with the retained browser delivery ledger, automatic sender and shared sync scheduler.

## Issuance and expectations

The only current permanent policy is a signed generation mismatch in the known immutable first epoch.
A conforming client does not produce that request. In disposable fixtures, the admitted device signer
restamps its retained envelope with generation 2 and signs a new submission. The ciphertext/digest,
position and epoch are unchanged. The service authenticates the device and permanently refuses that
subject through `decideSubmission`. Retrying the original generation-1 submission must return those exact
bytes. This models a faulty authorized writer, not an unauthenticated relay's ability to forge a stamp.
No production generation policy or client successor mechanism is changed to make a refusal reachable.

For conflict, a fixture uses the same admitted synthetic device to make a second valid encrypted envelope
at the retained position with a fresh nonce. The service accepts it first. The original browser submission
then obtains the service's persisted winning head, whose digest differs from its own. This deliberately
models a branched credential history outside the conforming single-writer assumption. It tests detection
and preservation, not support for operating two copies of one credential. Fixture-only encryption is
excluded from claims about the production allocator; retries must not reseal the browser's own envelope.

| Service answer | Browser proposition / durable effect |
| --- | --- |
| Exact own acceptance | Advance the proved prefix; retain exact response and original submission/capsules/envelope. |
| Matching permanent refusal | Retain exact response; close the position; halt new publication while keeping Local writing usable. |
| Genuine winning head for another digest | Retain exact response; mark conflict and halt publication; preserve the browser's original writing and evidence. |
| Invalid/unsigned/unavailable or lost answer | No permanent decision or remint authority. Retain the exact pending submission for retry. |
| Exact duplicate / cold replay | No duplicate proof record and no network reseal. |

The service's exact decision row and signed completeness witness must survive fresh service connections
and process death. Browser response and spool witness must commit together; an aborted transaction may
consume outer storage reservations but must not publish a decision. If commit completed before renderer
death, cold open must derive the halt without redispatch. Refused/conflicting proof must remain usable
after content compaction and later Local edits.

The composed scheduler has independent lanes. A send-side closure does not itself close receiving;
an empty real read remains idle at position zero. A competing self-stream is refused before inbound
persistence/publication, leaving the editor active; the current receive scheduler exposes this as
`operation-failed`, while send reports its retained `conflict`. This phase does not invent a shared
halt policy or silently rename that existing diagnostic. Cold open must still suppress outbound
redispatch from the retained decision.

## Oracle, faults and scope

Tests compare full retained semantic rows, exact wire bytes, counters/positions and source captures,
not just the state label. Expected status comes from the fixture's issuance history. Independent
Node/OpenSSL response verification checks the actual issuer result. Generated native histories vary
delivery loss, duplicate/invalid responses, edits, compaction and cold restart with shrinking enabled.
A second campaign uses a real issued refusal as a successor parent, then permutes the original refusal
and the genuinely accepted competing head. Refusal-first retains both proofs; conflict-first retains
only the first proof because a conflicted owner refuses new proof writes. Both preserve Local content.
Directed cases force both sides of the service and IndexedDB commit boundaries so random preconditions
cannot erase the critical paths. Source omission controls must produce their predicted bad outcomes.

The current editor may append a canonical empty Yjs update (`[0,0]`) on reopen. Capture comparisons
require every old capsule to remain byte-identical; any otherwise unexplained new capsule must have
the same authenticated route/actor and contain only that exact no-op. Authored edits have separate
text/source retention checks. The no-op's storage cost is not treated as a repaired defect here.

The actual HTTP submission route is used for automatic delivery; no fixture acceptance key mints the
response under test. Native tests use disposable Chromium and synthetic service databases only. No real
Account, personal browser, server, operator key, factor, pin, origin, package build or vector is changed.
This does not qualify general lineage, successor minting, enrollment, physical power loss, whole-profile
residue, arbitrary hostile interleavings, supported platforms or public deployment. Other F-21 gaps
retain their separate dispositions.
