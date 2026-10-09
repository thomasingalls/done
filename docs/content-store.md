# Encrypted content carrier — implementation phase three

**Status:** component implemented, 2026-09-08. This is the byte carrier beneath future journal,
admission and owned startup. [custody.ts](../src/crdt/custody.ts) owns its keys and lifetime;
[contentStore.ts](../src/crdt/contentStore.ts) owns initialization, allocation, insertion and loading.
The production editor still uses its earlier persistence. No release obligation is paid by this phase.

**Later checkpoint:** [exact-coverage trim](./content-trim.md) adds `JournalSession.compactContent()`
above this byte carrier. It merges authenticated disk updates and rechecks exact coverage before deletion;
the lower-level content-only capability still exposes no deletion or caller-supplied coverage authority.

## Capability and scope

`initializeContentStore(authority, code, {checkCreation, signal?})` opens current factor custody under
the exclusive slot permit and initializes its content counter. `checkCreation` is required: the startup
owner must establish authorized fresh genesis, or resumption of the matching intent, against all other
identity/index/journal/clear/creation carriers. A missing database alone does not establish freshness.
The fixture supplies a synthetic authority and checker; actual Local/Account identity verification,
slot registration and the complete startup census remain separate work.

`openContentSession(authority, code, {signal?})` obtains the shared lifetime permit before resolving
identity or reading custody. It opens current keys, authenticates the initialization witness and counter,
and validates every record in one consistent disk snapshot before returning a capability. The returned
methods are `appendBatch`, `loadRecords` and `close`; only identities, generation and public credentials
are otherwise exposed. No private key, encryption primitive or reusable reservation is public.
The existing `openCustodySession` remains a separate read-only custody capability.

`appendBatch([{kind, bytes}, ...])` captures independent copies of the caller's bytes before its first
await, reserves exactly the batch's length, encrypts each record once, and atomically inserts all records.
Its receipt contains the store id, generation and immutable sequence list, and arrives only after the
content transaction completes. Request success is provisional. Cancellation or a lost response may leave
a completed batch without a receipt; retries may therefore store duplicate update bytes at new sequences.
Future admission must handle that uncertainty, preserve pending input and promote only after a carrier
receipt. The component does not mutate a document, advance accepted heads or send transport messages.

One call accepts at most 256 records and 4 MiB of plaintext, then refuses with `batch-too-large` so its
caller can split the batch. This is a component resource bound, not the synchronous journal's `MAX_UPDATE`
or a measured latency claim. A received update above 16 KiB is accepted within the batch bound. There is
no internal input queue or global backpressure policy; the later admission owner must bound outstanding
input across calls. Caller-owned buffers and successfully returned plaintext remain that caller's cleanup
responsibility. The component clears its private input copies when each append settles.

## Initialization without resetting an existing counter

The content database uses the existing §6.5 name derivation:
`done.` followed by the first 16 SHA-256 bytes of
`LP("done/store-name/v1") || LP(principalId) || LP(workspaceId)`, in lowercase hex.
It has version 1 and four stores without key paths, indexes or auto-increment:

| Object store | Exact key and value |
| --- | --- |
| `meta` | `"counter"` → authenticated `ContentCounter` |
| `content` | numeric sequence → selected v1 `update` or `state` record |
| `heads` | numeric sequence → selected v1 `heads` record |
| `outbound` | numeric sequence → selected v1 `outbound` record |

An authenticated initialization witness lives beside custody in `done.custody/entries`, at the distinct
array key `[slotId, principalId, workspaceId, "content-v1"]`. It does not change the v2 custody entry,
factor seals or generation envelope. Initialization commits `creating` with a random 128-bit intent id,
then installs the counter with `next_seq: 1` and `reserved[1]: 0`, then commits witness state `ready`.
No content write is possible through this API before `ready`.

A restart with a `creating` witness rechecks the same authenticated intent under exclusion. It can
install the missing empty database/counter, or verify the matching unused counter, then finish `ready`.
Unexpected rows, used reservations, malformed layouts or mismatched identities refuse without replacement.
Normal open never initializes. A ready witness beside a missing database or counter refuses; explicit
initialization also refuses an already ready witness. Thus deleting the content database cannot reset
the still-retained key's invocation history. Arbitrary rollback/removal of multiple authentic history
carriers is not detected: SC-09's unrewound, unbranched history remains a precondition, and fresh creation
requires the startup owner's authorization rather than an inference from absent files.

The ready witness completes this content component only. It does not replace the future cross-carrier
workspace genesis intent, establish legacy cutover, register routing, or permit an application to announce
that the entire workspace is protected.

## Authenticated allocation and commit

The counter is the closed shape
`{v:1, store_id, intent, active_gen, next_seq, reserved:{[generation]: count}, mac}`.
The witness is `{v:1, state:"creating"|"ready", intent, mac}`. Unknown fields, malformed numbers and
inconsistent counts refuse. `next_seq - 1` must equal the total retained reservation counts; trim cannot
reset either. The implementation currently opens generation 1 only.

Both metadata records use HMAC-SHA256 under a distinct non-extractable key derived from `K_g`, with
HKDF-SHA256, empty salt and info
`LP("done/content-metadata/v1") || LP(slotId) || LP(principalId) || LP(workspaceId) || LP(storeId)`.
Their payloads are the closed UTF-8 JSON tuples in
[contentRecord.ts](../src/crdt/contentRecord.ts), with separate `done/content-counter/v1` and
`done/content-witness/v1` labels. Each binds slot/principal/workspace/store/root identities and every
trusted field except its own MAC. Reservation entries are ordered numerically; object insertion order
does not change authentication. These are local metadata encodings, not new network or v1 record bytes.

WebCrypto cannot await inside an IndexedDB transaction. The owner reads and authenticates the counter,
signs the next value, then compares the exact authenticated bytes in a readwrite transaction before
installing it. A concurrent change causes a fresh read/authentication/retry. That completed transaction
grants a unique global range across every tab and all four record kinds. No range or key escapes the
owner; every failed encryption or insertion abandons the reserved range permanently.

`reserved[active_gen] + batch.length >= 2^32` refuses before any record encryption. There is no rotation
implementation in this phase; `rotation-required` is the handoff to that later owner. The global sequence
also refuses unsafe integer overflow. The selected AES-256-GCM record construction is unchanged: fresh
12-byte random nonce, store-scoped HKDF key, and AAD binding principal/workspace/store/version/generation/
sequence/kind. Published record vectors are exercised independently by unit tests.

After sealing, insertion again reads and authenticates current metadata and compares its exact bytes
inside the transaction spanning `meta`, `content`, `heads` and `outbound`. It checks the active generation
there and uses `add`, so an existing immutable record causes the whole batch to abort. A changed marker
returns `generation-changed`; no automatic successor activation or re-reservation is claimed. The caller
must obtain the later transition owner's current custody/session before retrying. Abandoned old counts
remain recorded. A conforming activation also requires the exclusive lifetime barrier; the browser fence
probe deliberately bypasses that barrier to test the independent committing-transaction check.

## Complete snapshots and lifetime

`loadRecords()` reads the counter and every row from all three record stores in one readonly transaction.
It authenticates metadata, validates record placement, sequence uniqueness and allocation bounds, then
decrypts every record before returning any result. It returns all records ordered by sequence. A `state`
kind does not suppress earlier updates. It does not interpret Yjs, accepted-head or outbound-envelope
semantics, infer a complete reference census, or prove a record deleted outside the supported history never
existed. One unknown/malformed/unreadable record refuses the whole load and preserves all carriers;
plaintext already opened within the failed load is cleared. There is no trim or deletion API here.

Close invalidates immediately, rejects new/late work, aborts live transactions where possible, drains
tracked crypto and database operations, closes connections and drops owned keys before releasing the
shared permit. A native encryption that was already started can finish during draining, but its reservation
was already durable and its late continuation cannot insert content. Reopening requires a fresh factor
unlock and a full current load. Relaxed IndexedDB completion covers page/navigation loss, not general
OS or power failure.

## Evidence and next boundary

Run `pnpm storage:content` or `node scripts/content/run.mjs`. The command is included in `pnpm check`,
uses strict loopback port 5177, rejects external browser requests, freezes the production modules and
records a fresh ignored output directory. It accepts `--output`, `--case` and `--no-mutants`.
The [recorded run](./storage-conformance-runs/2026-09-08-content.md) contains 13 scenarios and five
targeted mutations over real Chromium IndexedDB/WebCrypto/Web Locks, including actual renderer death.
Its Yjs test replays a large remote dependency, deletion and dependent local edit without redelivery;
this establishes byte preservation, not the app's still-owed receive/promotion order.

The next bounded carrier is the synchronous encrypted journal attached to the same lifecycle. Admission,
the canonical document/editor/transport boundary, exact authenticated trim, full startup and migration
remain subsequent checkpoints. Generation transitions and full reference accounting remain L-3 work;
supported-platform/performance/independent-review evidence remains L-4 work.

The current counter/witness metadata bytes and Account v2 bridge are pinned in
[the D4 counter contract](./account-crypto/content-counter.md). The retained record-AEAD vectors do not
cover those metadata MACs. The counter contract links the F-15 strict-reservation policy and its explicit platform/loss limits.
