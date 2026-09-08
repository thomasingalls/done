# Ordered admission — implementation phase five

**Scope:** the FIFO owner over generation-1 [journal](./journal-store.md) and [content](./content-store.md)
carriers, with mandatory-factor custody and a private canonical Yjs document. This implements the
SC-01/02 admission boundary in isolation. The existing application still uses its earlier store; the
CodeMirror command/IME/undo, actor/repair and actual transport adapters are subsequent work.

## Ownership and public boundary

`openAdmissionSession(authority, code, { prepare, validateReceive })` obtains the real journal session,
loads its authenticated two-carrier recovery snapshot, and replays all `update`/`state` and journal bytes
before returning. It retains Yjs pending struct/delete-set information and does not approximate coverage
with a state vector. Authenticated but malformed Yjs refuses ordinary open with `repair-required` and
closes/disposes custody. Heads/outbound records remain authenticated carrier data and are not applied as
Yjs updates. This is component replay, not complete Local/Account genesis or cross-carrier classification.

The canonical document never leaves the owner. `snapshot()` returns a detached accepted-state Yjs update;
`subscribe()` publishes detached update copies only after canonical promotion, labelled `local` or
`remote` with a monotonic runtime revision. These are the future projection/transport boundaries, not a
writable `doc` escape hatch. Listener exceptions are isolated from storage outcomes. The later UI must
observe repair/close status and disable affected ordinary editing/export/transport. This checkpoint has
no accepted-head protocol, undo-history wiring or production receive authority verifier.

`submit(intentBytes)` copies a nonempty encoded **intent**, enqueues it, and returns an `AdmissionTicket`.
Its `accepted` promise resolves after the complete intent has promoted, with its source, revision and
slice count. A local head that fits and journals successfully promotes synchronously before the method
returns. Inputs queued behind asynchronous work remain unprepared and private. Mutating a caller buffer,
a returned snapshot/event or a retained draft cannot change canonical state or the captured carrier bytes.

`receive(updateBytes)` joins the same queue. At its head, a required synchronous transport validator must
accept the original captured bytes without rewriting them; Yjs then checks them against a disposable
clone. Refusal rejects that network ticket before storage and lets later valid input proceed. Valid
bytes complete the encrypted content transaction before canonical application or a receive event.
An unresolved update may remain invisible, but its exact bytes are persisted and represented in canonical
pending state. Local preparation can therefore rely only on dependencies with completed local carriers.
Duplicate cross-tab/remote storage is intentionally permitted.

## Private preparation and slices

`prepare(draft, intentBytes, MAX_JOURNAL_UPDATE)` is a **trusted, synchronous application command adapter**.
It receives a disposable clone of accepted canonical state and an owned temporary copy of the head intent.
The owner captures the resulting transaction delta, including deletes; it never applies the draft itself.
Thrown or asynchronous preparation refuses promotion. Required callbacks cannot perform application-side
writes or keep an asynchronous command alive; the component is an ownership API, not a sandbox for
hostile callback code. The actual operation schema and authority belong to the later application adapter.

Each runtime has one private Yjs writer id, reused across successfully prepared local deltas. Rejected
private drafts do not advance accepted clocks. A received update that advances that writer's clock causes
a new writer id before later preparation, following the collision concern rather than blindly continuing
a remote writer. This uses Yjs's existing random client-id space; it does not introduce a cryptographic
identity, detect raw profile clones, or change the store's nonce-accounting assumptions.

For large paste/import/maintenance commands, the adapter performs a bounded slice and returns
`{ remaining: smallerIntentBytes }`. Remaining intent must be nonempty and strictly shorter in bytes,
which bounds continuation count. Each prepared update must be at most the existing interim **16 KiB**.
An adapter exceeding it is blocked with `slice-required` before journal nonce generation or sealing;
arbitrary encoded Yjs updates are not cut into byte fragments. A sliced command uses completed content
commits for each slice before promotion and before preparing its next slice. Later queued commands wait
behind the whole command. Page loss can preserve an accepted prefix and lose an unaccepted remainder.
The application must retain/reconstruct an import source if product-level resumability is required.

## Pressure, retries and durability

A journal refusal records its cause and forces the content path: first flush the captured journal prefix,
then commit the private candidate. These are successive transactions, not a cross-carrier atomic batch.
If either fails, the candidate and later intents stay private. Retrying a previously refused head retains
its exact prepared bytes and remains on the forced content path; later journal availability cannot turn
that retry into an early acknowledgement. Each abandoned content seal remains counted by the carrier.

`status` exposes active/blocked/closing/closed/failed state, runtime revision, pending item/byte counts,
conservative reserved bytes, durability and a typed pressure code. The queue admits at most **256 jobs**
and **4 MiB reserved bytes**. A local intent reserves twice its byte length plus 16 KiB, covering its owned
input, possible remaining input and prepared update; a receive reserves its captured bytes. Capacity is
checked before copying/enqueueing. Reported pending bytes count the actual retained byte arrays, not
object overhead or Yjs document memory. These are initial queue policy limits, not measured UX budgets.

A failed storage operation blocks the FIFO, clears its timer, rejects outstanding durability barriers and
retains input tickets pending. `retry()` resumes the same head. `discardPending()` is explicit and only
allowed while blocked/quiescent: it rejects and clears the **entire unaccepted suffix**, so a dependent
later command cannot silently run against a different predecessor. Accepted slices/journal data remain.
Repair-required damage latches the owner: ordinary snapshots, new input, retry and pending discard cannot
mask it. Close and a fresh valid recovery are required after external repair; this API does not salvage.

A **250 ms** timer forces a FIFO flush barrier for journalled work. `whenDurable()` immediately enqueues
that barrier after all inputs observed before the call and resolves only when they have promoted and the
captured journal handoff completes in IndexedDB. Later inputs queue behind it and may remain journal-only
after it resolves. Adjacent barriers can share completion. Blocked storage/capacity failures reject the
barrier observably; cleanup failure leaves the journal and does not claim the strong boundary completed.
Recovered journal entries also schedule a flush. There is no indefinite automatic retry loop.

`close()` disables admission immediately, rejects/erases the pending suffix, clears the timer, and drains
in-flight work while the carrier closes its guarded lifecycle. Late continuations cannot promote. The
private canonical document is destroyed after draining; the raw journal key and WASM instance are disposed
before the underlying shared permit releases. Abort/pagehide uses this same path. A failure to dispose
still retains the underlying permit under phase one's rules. This is logical ownership and disposal,
not engine/OS forensic zeroization of all transient JavaScript/Yjs allocations.

## Evidence and remaining work

Run `pnpm storage:admission` or `node scripts/admission/run.mjs` with optional `--output`, `--case`,
`--no-mutants`. The runner freezes the owner, Yjs seam and all carrier dependencies, hashes its fixtures,
required guides/contracts and unit inputs, rejects external browser requests, and uses loopback port 5179.
The [recorded execution](./storage-conformance-runs/2026-09-08-admission.md) separates controlled unit
schedules, actual browser storage/lifecycle scenarios and source mutations.

Browser projections and emitted update inventories are fixture consumers of the production owner's
accepted boundary. They are not CodeMirror, ordinary copy/undo/export or a production transport. The
receive validator and command language are synthetic and cannot certify future adapters. Full draft
cloning deliberately establishes isolation in this checkpoint; its document-size cost and the complete
admission path still require profiling against the low-end interaction budget. No supported-population
latency claim follows from journal primitive timings or passing correctness scenarios.

Next is canonical editor/command/IME/undo/export and receive/transport integration through this owner,
with the actual observation surfaces and their fault tests. Exact trim, complete startup/clear/migration,
identity/index onboarding, PRF, transition/reference/receiver composition and supported-platform or
independent-review obligations remain open. A component pass does not pay a release gate or authorize
old-writer cutover.
