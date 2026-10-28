# Durable preparation receipt journal — 2026-10-28

Continues the [phase125 design](account-local-retention-resumption-design.md). Preparation-only:
all original rows remain. A receipt journal is neither a service checkpoint nor a local deletion
plan. Service automation stays off. General qualification/release preparation remain paused.

## Contract chosen before native wiring

Preserve individual completed checks, then rebuild semantic reducers fresh on resume. Do not
serialize `AccountLedgerView`, a partially advanced accepted cursor, a generic success flag, or
live verifier capabilities. The new receipt records a fixed operation family/slot, exact-input
digest and detached canonical result of its actual successful verifier callback. It is accepted
only from an authenticated journal under the same freshly resolved owner/verifier context.

The operation grammar covers opened physical rows, spool witnesses, installed-admission prefix,
spool positions, acceptance links, delivery signatures/decisions, inbound/history evidence and
content coverage. Unknown slots and mismatched result variants refuse. The canonical binary value
grammar allows bounded plain objects, arrays, integers, strings, booleans, null/undefined and bytes;
no classes, functions, getters, symbols, prototypes, cycles, sparse arrays or trailing bytes.
It is a representation for individual verifier results, never a deserializer for authority.

Each result is bound to the entire operation context and every input byte. Completed deltas are
HMAC-authenticated under the actual unlocked metadata key with
`done/local-preparation/draft-1`, purpose `receipts`, owner context and payload. An opaque
process-local capability is minted only after authenticating and parsing that delta. Import is
allowed only before checks start; result/byte ownership is detached; disposal, failed checks and
late results cannot add success. A two-second slice target pauses before starting new unchecked
work once some useful work has completed. It does not preempt one crypto/native/Yjs operation.

Semantic ordering, actor/source relationships, current authorization, witness completeness,
coverage against actual content and final cut/commit guards still run. Reusing a signed response's
completed verification cannot turn it into a new acceptance decision. Candidate and installed
readback replays remain independent; they must not consume this reference-preparation journal.
This is a refinement of125's full-frontier approach: retain exact checked evidence while deriving
the logical frontier again, rather than inventing a cross-lifetime partially accepted ledger.

## Native storage and resume requirements

Native wiring must bind the context to complete custody/local/account scope, intent, generation,
installation/authority and key material plus a build-time fingerprint of the actual verifier source
closure. Any change invalidates reuse. A version label alone must not let a new, stricter verifier
consume a result accepted by old code. Ordinary development HMR must not silently preserve receipts
across source changes. Missing/unrecognized identity disables resume, never supplies a default.

Use an auxiliary preparation database derived from the selected content database, with a closed,
versioned layout. Keep content/custody formats unchanged. Existing readers can ignore this
recomputable cache and still verify originals; a reader of an unsupported auxiliary format must
not overwrite it. Locked removal must delete it without credentials. Rotation, recovery,
replacement, retirement and mismatched scope must not let it become another opening authority.
No key is retained across lock and no remember-me/background-execution promise is added.

Persist encrypted append-only receipt deltas and an authenticated exact manifest. Before every
seal reserve its invocation in the existing authenticated content allocator; interrupted writes
burn that range. Each sealed chunk is scope/purpose/order bound. Strict atomic auxiliary exchange
and exact authenticated readback preserve the previous checkpoint on failure. Save under owned
serialized storage, after the read-only preparation task has settled; never write a reservation
from the discretionary read lane. Input/journal/authority/ownership checks retain their existing
roles. Saving a cache is not permission to perform the final content cut.

On resume, read/authenticate fresh native metadata and counter, establish the exact captured
physical prefix and baseline/era, then authenticate deltas. Unchanged appends beyond the captured
boundary can remain eligible; a changed/missing prefix or extra low key cannot. Allocation burns
must remain monotonic. Fingerprints of writing-derived bytes stay inside authenticated encryption;
no public unkeyed writing oracle or telemetry. Parse and memory/capacity limits are explicit.
Unknown/malformed cache data never creates a content repair or deletion proof.

A saved preparation slice should release its storage task and yield to foreground work. The
existing quiet/readiness policy may continue useful slices without adding polling or erasing
refusal backoff. Normal editing, source/journal durability, the final strict atomic exchange,
independent candidate/reference/readback comparisons and the **2.5s peer p95 gate** remain.
Fixed-prefix retirement with live suffix writes is still a separate reader-first representation;
this journal does not weaken v5's allocation/cut equality.

## Bounded phases and falsifiers

127 implements only the canonical receipt model and authenticated import; no runtime is wired.
Subsequent patches must implement native encrypted persistence/cleanup, actual verifier adapters,
and owned scheduling, then demonstrate interruption/reopen and unchanged performance gates.

Model regressions distinguish raw versus authenticated capabilities; changed role/input/scope/key;
MAC/payload corruption; bare pass flags; failed/late/disposed callbacks; codec ambiguity and
observer/getter attacks; and useful progress across a slice/reopen. Native falsifiers must kill or
abort at reservation, chunk write, manifest exchange and readback boundaries, keep original writing,
and compare resumed versus uninterrupted/reference results. Changed/unknown prefix, appends,
nonce burns, generation/authority/source changes, lock erasure, cleanup and offline reopen remain
separate obligations. A tiny fixture or a passing model cannot establish phone bounds.

## Implemented boundary, phases128–130

Encrypted auxiliary native storage, exact prefix/source binding, source-closure identity, first-reference
adapters and fresh serialized account handoff now exist. The read task authenticates and erases its
receipt delta before settlement; a new serialized task repeats readiness, custody/authority, native
prefix and delta authentication before allocating any sealing invocation. Owner disposal retires
queued handoffs. A saved slice releases the task and permits the local policy to continue after an
event-loop yield, with the existing input quiet/readiness and refusal clocks intact. Original rows
stay until the unchanged final candidate/cut/readback proof succeeds. Credential-free device removal
also deletes the derived auxiliary cache. A successful authenticated cut removes its stale cache.

Activation is a separate boundary: `VITE_ACCOUNT_RETENTION_RESUME=1` plus all existing reader/writer
gates, production (no HMR) and the generated verifier identity are required. The new opt-in defaults
off. `VITE_ACCOUNT_HISTORY_AUTO` remains off. Functional/native tests do not establish the existing
2.5s peer p95 gate under heavy preparation competing with editing. Prefix capture/load/hash/save,
semantic reconstruction and final independent validation are outside the2s new-work target; one
crypto/Yjs operation is not preempted. Phone short-session benefit and total slice bounds remain
unmeasured; do not advertise2s whole-operation completion or activate service automation from this.
