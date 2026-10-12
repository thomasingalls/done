# Private native inbound storage

**2026-10-12 update:** The composed receiver now groups up to four existing limit-one receipts
under one checked commit and authenticated readback, through previously observed backlog. Exact
v1 receipt bytes, per-entry verification, native bounds and the four-page publisher turn remain.
The bounded owned request set and sequential HTTP collection are described in the
[grouping checkpoint](./performance-experiments/2026-10-12-receive-groups/README.md).
The older phase narrative below describes the original singleton implementation.

Current capsule, ledger and witness bytes are pinned in the
[Account ledger contract](./account-crypto/account-ledger.md); this phase narrative retains its original scope.


This phase attaches the [inbound verifier](./account-inbound-verification.md) to the existing factor-owned
Account lifetime. `openOwnedAccountReceiveStore` is a private storage-only factory. It provides status,
one owned read request, page receipt, compaction and close. It exposes no editor, outbound publisher,
transport endpoint, enrollment operation, raw key, caller-supplied authority or receive-progress setter.
The default application and personal Local installation do not enter this path.

## Admission and activation

The factory acquires the existing exclusive slot permit and runs the actual Account startup checks:
mandatory factor, pinned service, retained creation/admission/binding, fresh passkey assertion, generation
wrap and semantic genesis coverage. The supported transition is v8 `account-delivering` to authenticated
v9 `account-receiving`. A crash leaves intact v8 or resumable v9. The counter remains the existing v2
authenticated completeness witness; this phase introduces no new database schema or key generation.
Current v8 factories and the historical v8 marker parser refuse v9 before returning an editor.

This first receiver uses only the actual admitted creating credential as both reader and publisher, at
epoch 1/generation 1. The retained canonical admission receipt is SHA-256 hashed to identify its genesis
baseline. Keys, principal/system bindings, lineage, head and service pin come from authenticated retained
state. Passing the low-level verifier a fabricated context is not an activation path. Fresh readers,
additional publishers and checkpoint/lineage advancement remain unsupported.

The v9 owner does not attach an editor or sender in this phase. Activating a disposable fixture therefore
fences its older editing factory; the next integration phase must compose editing with this ownership.
No personal Account is activated by tests or by the default application.

## Request and commit ownership

`prepareRead()` signs a bounded v2 request with the held device credential, a fresh nonce, 30-second
expiry and the authenticated durable received position. The owner retains its own byte copy. An optional
earlier position supports duplicate/conflict inspection against retained evidence; it cannot advance
progress. A later request replaces the outstanding request. `receivePage(bytes)` captures the page before
queueing and verifies it against that outstanding request, never a request selected by the response.

Every operation runs on the existing exclusive capture queue. A received entry becomes one native batch:
each original Yjs update in order, followed by one exact signed evidence event in `heads`, plus the updated
metadata witness in the same IndexedDB transaction. `appendInbound` copies and checks the complete batch
before reservation. The first receive bounds remain one envelope, 512 KiB envelope wire, 255 updates and
512 KiB decoded updates, followed by the actual 256-record/4 MiB local check. Conflict stores only evidence.

Sequence/invocation reservation is durably separate from ciphertext commit, as in the existing content
allocator. An aborted commit burns its reservation and retry uses a fresh one. It does not consume a new
network seal or change network position. After sealing and before commit, the owner rechecks authenticated
promotion/custody state, current received state, request expiry and expected witness. A receipt returns
only after commit and authenticated readback. An unknown outcome is resolved through durable replay;
exact duplicates and empty pages create no new event or durable high-water knowledge.

Two different accepted digests at one retained position produce a durable conflict and stop further
receipt. The existing accepted entry is retained, and the conflicting body is never promoted as content.
Outbound acceptance and local record sequences do not determine received progress.

## Cold replay and coverage

The complete v9 metadata census includes spool, submission, response and inbound events in local sequence
order under the existing witness chain. Removing or changing any event is refused. Delivery transitions
keep their own ordering rules. Each inbound event is then reauthenticated from its exact original signed
request/page, envelope and acceptance bytes, starting from the independently admitted zero-link genesis.
The owner reconstructs the received prefix and advertised floor; no cached verified event object survives
restart. Stored request expiry is ignored, while signature, scope, actor and outer metadata checks remain.

Content coverage is checked separately from native AEAD and event completeness. The verifier replays the
actual disk content, then requires each original evidenced update either to remain byte-for-byte present
or to leave a detached fork unchanged when applied. The comparison includes content, deletions, pending
bytes and dependency bookkeeping. A state vector alone is insufficient. Journal input cannot substitute
for missing receive content: remote receipt promises a database batch.

The existing compactor authenticates this census before any deletion and retains all metadata events.
It refuses to merge an incomplete disk union, retaining original pending update framing until dependencies
arrive. Once the disk union integrates, exact-coverage compaction may replace content while retaining the
original signed event. Received updates never enter the local source-capture journal or become new local
source capsules. This storage-only phase performs no remote editor promotion.

Close invalidates queued work and drains crypto/transactions before releasing the permit and custody.
Successful verifier plaintext is owned before the task wrapper's final lifetime check, allowing cleanup
even if closure wins that continuation. Generation-key copies, transient plaintext and outstanding request
buffers are erased by their owners on settlement or disposal.

## Evidence and limits

The native campaign uses actual admitted synthetic Accounts, headless Chromium, IndexedDB and Web Locks.
Acceptance/page signatures are framed independently in Node/OpenSSL. Test-only arbitrary remote envelopes
use the disposable Account's actual credential; they test storage and pending delivery, not issuance of a
second real writer or safe cloning of a credential. No personal browser, factor, server or Account is used.

Directed cases cover activation/receive commit cuts, renderer death, lost acknowledgement, duplicate/conflict,
expired cold replay, pending dependency handoff, missing content/event, tampered ciphertext, valid local
encryption and witness around invalid service evidence, bounds/quota retry, changed authority, input copies,
close draining and old-reader refusal. Actual source mutations demonstrate the importance of content
coverage, completeness, stored service-signature verification and the atomic content/event composition.
Generated native histories compare original authored content and receipt progress across faults; a separate
200-case property checks content/deletion coverage through compaction. New native polling explicitly awaits
bounded predicates and does not use Playwright's previously misleading async-predicate wait.

These results are bounded to one admitted creating stream. Full scans, retained-event growth, current
membership/epoch transitions, general checkpoint baselines, revocation/finalization, restore/rollback,
multi-device issuance, supported-platform testing and independent review remain open. No whole-protocol
debt is paid. The next phase is ordered remote editor promotion under this same owner, followed by the
v2 service route/driver and enrollment/adoption.
