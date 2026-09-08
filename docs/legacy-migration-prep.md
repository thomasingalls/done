# Legacy migration preparation — phase thirteen

This checkpoint prepares a read-only source reader and a disposable native source harness. It does not
implement import, migration progress, active-store selection, source cleanup or a default-app switch.
Phase twelve is committed as `a0811e2`. The governing contracts remain SC-01–09; the source observation
below is not a new authority format. The author's live move remains Stage 2, gated by review 3a and the
still-open carrier/attribution decision in sequencing §5.4. No registered debt is paid here.

## Inventory grounded in the current predecessor

| Carrier / execution path | What it contains or does | Required migration disposition |
| --- | --- | --- |
| `done` IndexedDB v1, `updates` with out-of-line auto-increment keys | Original Yjs v1 updates and provider snapshots; duplicates and gaps are normal | Capture exact keys and bytes in one readonly transaction, keep original update framing and journal-only work; never infer coverage from the largest key |
| `done` / `custom`, out-of-line keys, no auto-increment | Library extension store; no current application caller writes it | Empty in the supported fixture; any retained row refuses this reader rather than being omitted |
| `done.pending-update.done.<session>.<ordinal>` localStorage, `1:` + base64 | Plaintext update WAL, possibly the only copy of an acknowledged edit | Capture before disk; retain exact key/value/bytes, refuse unknown/unreadable framing; eventual cleanup compares exact observed values |
| `done.actor`, `done.device` | Local actor id; device id and user-editable friendly name | Inventory as ancillary plaintext, never infer destination principal authority from them; destination device/actor disposition must follow the selected import policy |
| `done.sync`, `done.sync.last` | Old endpoint/room/bearer configuration; last-sync time/device information | Inventory without logging credentials; no old transport constructed during source reading; retirement/removal belongs to the cutover cleanup manifest |
| Scoped stores through `done.slots`; `done.custody`, modern content/journals and lifecycle markers | Other workspace/Account/Local identity, ciphertext and in-flight control state may coexist | The fixed `done` source reader does not inventory or authorize these; the eventual verified scoped owner must check them and refuse collisions/unknown references |
| `done-precache-*`, service-worker registrations, cached and live old bundles | App shell and future execution paths; the worker has no runtime content cache | Inventory and retire executable legacy routes as part of exclusion. A new worker's `skipWaiting`/`clients.claim` does not stop already executing JavaScript |
| Old relay, BroadcastChannel, other tabs, installed windows and devices | Can deliver/create more legacy operations | Source exclusion includes old local contexts and transport. Turning off the relay alone does not stop local writes. Remote installations require an explicit reconciliation/end-of-source boundary |
| Explicit downloaded Markdown ZIPs; later fidelity archives | User-managed recovery copies, outside ordinary app storage | Preserve a verified recovery copy before irreversible seeded cleanup. Do not claim app-managed residue cleanup deletes user downloads or forensic historical copies |

Source anchors: `src/crdt/persistence.ts`, pinned `y-indexeddb` 9.0.12 in the lockfile,
`src/crdt/index.ts`, `src/crdt/actors.ts`, `src/crdt/sync.ts`, `src/crdt/slotIndex.ts`,
`src/crdt/export.ts`, `src/pwa.ts`, and `vite/precacheServiceWorker.ts`. The default `useStore` still
opens `LEGACY_STORE`. The provider writes an encoded state during initial fetch, and ordinary `openStore`
also initializes actors/schema/repair and may start transport. Neither is a read-only migration reader.
This inventory is of those known paths, not a claim that arbitrary historical origins contain nothing else.
Future whole-profile evidence must also enumerate unexpected IDB, localStorage, Cache Storage and OPFS
carriers in a disposable fixture; application workspace enumeration still goes through the scoped index.

The legacy journal prefix overlaps modern hashed-store prefixes. Only the complete modern key grammar
is excluded. A malformed modern-looking key remains ambiguous and refuses; arbitrary prefix stripping or
“not version 1” filtering would hide material that the eventual cleanup must account for.

## What the reader establishes

`src/crdt/legacySource.ts` is deliberately absent from the default application exports/startup. It probes
only the fixed known database name, aborts the absent-database upgrade, verifies the exact predecessor
layout, and reads both stores in one native readonly transaction. Completion, rather than a cursor request's
success, resolves the read. It creates no database, provider, actor, destination, key, marker or index entry.
The caller's SessionTask owns cancellation and native draining; it does not fence old writers.

The reader captures the legacy WAL and four known ancillary keys before the disk read, then checks them
again by exact key/value equality. Observed drift refuses. An unkeyed SHA-256 digest binds a domain label,
database-presence bit, ordered `(record key, original update hex)` pairs and sorted `(local key, value)`
pairs encoded as JSON UTF-8. The digest describes only that observation; it is neither an authenticated
manifest, a quiescence certificate nor a deletion receipt. ABA changes and writes after the last read are
possible. No finite series of matching censuses excludes a paused nonparticipating writer.

Private Yjs replay validates decoder/application acceptance and reports whether pending structs or deletion
sets remain. It retains every original update even when dependencies are missing. Missing dependencies
block any future claim of a complete semantic export: recover the source basis or explicitly resolve the
loss before proceeding. The reader does not turn partial visibility into an empty successful import, and
does not merge partial updates (phase twelve's pinned-Yjs regression applies here too). Integration does
not establish supported application schema, attribution authenticity, archive fidelity or export correctness.

This reader refuses more than 4096 captured local entries or update rows, more than 16 MiB of encoded
local key/value UTF-16 storage, or more than 16 MiB of update bytes. Unknown custom rows, layouts, record
types, journal versions and malformed updates refuse without cleanup. These are preparatory refusal bounds,
not a product capacity or memory/performance guarantee. Native structured cloning may allocate a large row
before the byte check. Returned plaintext stays in the private preparatory caller; never log it or persist
it as a new ordinary app carrier. It is not an import archive format.

## Authority and old-writer exclusion before the next writer exists

The native harness demonstrates the missing mechanism: the actual legacy `openLocalStore` appends a `1:`
WAL entry and completes its database batch while another page holds the new slot's exclusive Web Lock.
The observation changes afterward. A matching digest, new bundle, broadcast request, IDB version fence,
relay shutdown, timeout or a typed `writersStopped: true` flag cannot pay SC-03.

For the next seeded cutover harness, the test controller must own the entire disposable browser context:
close or crash every old page/worker, disable legacy network/relay routes and service-worker startup,
and admit only the migration fixture. Hold that external exclusion across restarts, source capture,
destination verification, selection and cleanup. Deliberately reopening a legacy writer invalidates the
fixture's exclusion and must prevent completion. This is an enforceable test precondition in the controlled
context, not a production browser capability or proof for the author's installation.

**Production supported-version exclusion remains unresolved.** It needs an implemented deployment/browser
procedure that stops all old contexts and prevents old cached bundles and network endpoints from reopening
them. A fresh destination origin isolates new keys but does not by itself stabilize or clean the old origin.
An in-page migration owner cannot infer this authority from the current primitives. Do not give it a public
boolean/callback that pretends otherwise. Prove the procedure on seeded profiles before selecting a live
cutover route; if that procedure cannot establish exclusion, automatic same-origin cleanup must refuse.
The user need not choose attribution to run these read-only preparation tests.

Destination authority is separate: verify the selected Local identity (or later Account binding), bind the
source origin/carrier and digest, carrier version and attribution choice, immutable migration intent, and
full destination scope. Confirm a generated factor. Mint a fresh `store_id`, store-key scope, custody root
(or use an intact owned destination root) and reservation history. Import accepts verified logical payload,
never exported writable keys/counters. Repeated import cannot repeat a previously committed system write.
The existing fresh Local genesis refuses surviving unassigned legacy material; do not bypass that guard
with synthetic absence or write a normal ready genesis/index row before migration verification. Migration
needs its own authenticated resumable owner and pre-active destination, still to be built.

## Proposed resumable order and seeded interruption matrix

The following is a plan to test a future production owner, not an implemented protocol or executed kill
matrix. Its progress must live outside the source carriers being removed, bind exact source/destination
identity and choices, remain factor-authenticated after cleanup, and never contain plaintext content or
promptless openers. The concrete record/MAC construction needs review before implementation.

| Boundary to kill before and after | Restart evidence and required outcome |
| --- | --- |
| External old-writer exclusion and source observation | Reestablish exclusion and recapture; no write/selection/deletion authorized by a saved observation |
| Verified export / recovery copy | Source database and WAL remain intact; verify the selected carrier contains journal-only edits, every day and required dependencies; identify the recoverable pre-cutover state |
| Factor confirmation and immutable destination intent | Resume the same identity, root, store instance and reservation history; wrong factor or conflicting intent refuses; no remint over partial ciphertext |
| Each bounded import slice reservation and native commit | Resume from authenticated receipts without duplicate logical import; abandoned reservations stay spent; destination remains unavailable to ordinary editing/transport |
| Cold destination replay and semantic/fidelity verification | Recover with the factor in a new runtime; compare against the external source ledger and chosen carrier policy, including pending-input refusal, not a digest manufactured by the importer |
| Active selection intent and native scoped-index commit | Selection is one durable, verifiable decision; interrupted index/control progress converges to one verified destination or a verified pre-cutover state; no source deletion before verified destination selection |
| Each exact journal removal and source DB deletion | Preserve source until the verified destination is recoverable; deletion block/abort is pending, never completion; keep exclusion while a native deletion can still settle |
| Ancillary keys, old-shell/worker/network retirement and residue scan | Partial cleanup resumes by its bound manifest; changed/unknown/reappearing material refuses; destination remains recoverable; credentials and friendly names are included in the app-managed plaintext census |
| Final completion record and restart | Cold verified encrypted route, no old writer execution, no recognizable app-managed plaintext. Pre-completion retained legacy plaintext is allowed recovery material, as the debt explicitly says |

Every boundary gets renderer death and where applicable native request-success/transaction-abort cases,
quota failures, changed key/value, unknown references and stale resumers. Cross-database operations are not
one native transaction. An abort before selection can preserve the verified pre-cutover source; after
verified destination selection and the first source deletion, recovery completes cleanup rather than
reconstructing a partially deleted source. Source mutation invalidates the current intent/census; it cannot
be waved through by a sequence watermark or by a newer source digest without re-verification.

Generated schedules should vary delivery order and duplicates, dependency-only journal entries, import
slice sizes, competing intents/factors, reservation/record aborts, index and cleanup interruptions, and
restarts. Keep an external operation ledger and check both allowed terminal states; never read expected
coverage from importer receipts. Save and shrink failures, replay against native production, and require
controls that lose a journal-only operation, select before cold verification, restore counters, repeat an
import slice, clear by prefix, or resume after exclusion loss to fail named invariants. These controls are
future acceptance work, not the four reader mutants run in this checkpoint.

The next bounded implementation is **verified export capture under controlled seeded exclusion**, with a
replayable recovery artifact and independent ten-day/journal-only/dependency checks. Keep the carrier
adapter explicit; do not silently select the open Markdown/system-attribution versus fidelity-archive policy.
After that, build the authenticated pre-active destination/import owner and its interruption tests before
connecting selection or deletion. General large-update adapters and the 16 KiB admission limit still apply.

## Run the preparatory evidence

`node scripts/legacy-source/run.mjs --output <fresh-directory>` freezes source/harness/guide inputs, uses
native IndexedDB/localStorage/Web Locks in disposable Chromium, compares exact bytes to an external
source ledger over 100 seeded/shrinkable delivery partitions, and saves failure seed/path/counterexample.
Its fixtures include pending insertion/deletion dependencies, journal-only data, readonly abort, observed
WAL drift, an old-writer lock counterexample and one source-reader renderer death. Four focused source
mutants probe omitted WAL, ignored dependencies/custom data and a writable inspection transaction.
Unit tests additionally exercise absence/layout/framing refusals and generated delivery partitions.
This is not the future migration kill matrix and does not verify supported writer exclusion, destination
custody, import semantics, old-profile erasure or real-data cutover.

For additional source partitions use `--seed <integer> --runs <positive-integer>`. A failed property writes
`counterexample.json`; replay it with `--replay <path>` or use the saved `--seed` and `--path`. Named
native scenarios and all four focused sensitivity controls still run on replay. The generated payload
population here is five fixed causal text updates (three roots, one cross-client insertion and its later
deletion); only their delivery partitions, order and duplication are generated. Application-shaped exports
and generated import/cutover state machines remain the next harness work.
