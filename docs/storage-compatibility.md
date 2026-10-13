# Storage compatibility and the first upgrade-aware lifecycle

Base checkpoint: signed `14901a5`, which records compatible static release handoff and the author's
successful personal source cleanup. This bounded phase adds a refusal interlock to every participating
slot acquisition. It changes no stored format and writes no upgrade metadata to an existing installation.
The personal app remains on its previously served package.

## What this build supports

App revisions and service-worker cache identifiers do not declare data compatibility. The existing
closed carrier parsers and authentication rules still govern the following supported formats:

| Surface | Supported reader/writer contract |
| --- | --- |
| Native custody, slot-index and encrypted content databases | Existing version 1 layouts; no automatic physical-version upgrade on ordinary open |
| Custody | Record v2, code-seal v1, envelope v1, sealed device credentials v2, existing generation 1 construction |
| Local lifecycle | Genesis/selection claim v1; import claim v1; Local clear v1; nested source-cleanup v1 and v2 according to their existing parsers |
| Encrypted content and allocation metadata | Record, counter and content-witness v1 |
| Synchronous journal | Existing v1 framing and generation-bound authenticated bytes |
| Document | Absent version or integer 0–4 admitted through the existing initialization path; initialization writes schema 4. A higher safe integer now produces `app-update-required`; malformed versions still refuse as damaged data |
| Application-upgrade interlock | Absence only. This build understands no populated interlock, including a purported completed/compatible one |

These are accepted carrier versions, not permission to rewrite one into another. Existing genesis,
import, cleanup and document initialization retain their own authenticated/admitted owners. Lower-level
carrier parsers still refuse unsupported records; not every such refusal has the new presentation code.

## Acquisition and refusal

`writeSession.ts` calls `checkStorageCompatibility` after a shared or exclusive grant and before caller
initialization. It probes only `done.custody`, never enumerates database names, and never creates or
upgrades a database. On a fresh profile the provisional creation transaction is aborted. Existing custody
must have the understood native layout. The probe counts the exact key `[slotId, "application-upgrade"]`
in `entries`; its location is independent of app/format versions. A retained `undefined` or `null` value
also blocks. Values in another slot do not block this slot.

Absence is only permission to continue to the existing checks. It authenticates neither identity nor
custody, data, clear progress or migration state. Presence refuses every ordinary reader/writer and every
current exclusive owner, including creation and cleanup; there is no caller-provided bypass. Contents
are not interpreted as instructions or authority. The app presents a compatible-app requirement without
an unlock or creation form. The user can check again after the installation/state has been corrected.

The check is repeated after every acquisition, including one queued behind an exclusive transition.
An existing shared writer retains the stable slot permit through its native work and disposal, so a
cooperative transition cannot write its interlock while that writer can still append a journal entry.
This adds no per-keystroke I/O. It adds one known-name read per lifecycle acquisition.

A database open cannot be cancelled. A blocked probe retains its slot permit until IndexedDB settles;
a cancellation immediately invalidates task authority, but does not release the permit early. A late
connection is closed during cleanup. Presence is decided at transaction completion, not request success.
A failed/aborted probe never becomes an absence observation.

## Required contract for the first actual incompatible migration

No incompatible migration is implemented or scheduled here. Its owner cannot simply reuse this build's
exclusive API to bypass a retained interlock. A concrete format change must first specify and test:

1. The source and destination formats, exact authenticated intent encoding, identity/store binding,
   supported readers/writers, and each progress step. No release/hash number may stand in for these.
2. Exclusive acquisition of the **existing** slot lock after all shared writers drain. Under that permit,
   authenticate the retained source and check the whole database/journal coverage before conversion.
3. Before any incompatible effect, atomically retain the stable interlock and a custody state that
   **pre-interlock executables already refuse**. Existing `parseRecord` refuses `state: "migrating"`.
   The concrete owner must define its authentication and restoration rules; an unauthenticated string
   or this pointer to an existing parser is not an implementation of that owner.
4. Restart must reacquire exclusion and authenticate the exact retained intent. A future privileged
   resumer needs a reviewed entry point; this build intentionally provides none. An unfinished intent
   must never trigger fresh genesis, normal editing, generic cleanup or an inferred rollback.
5. A completed incompatible destination keeps a durable interlock understood by its supported readers
   and retains custody/version framing that predecessor code refuses. It must not erase the interlock
   and thereby appear to this baseline as unchanged storage. Serving older JavaScript is not rollback.
6. Recovery/rollback needs a separately supported route, including key/nonce accounting and dependency
   coverage. Raw key/counter cloning, restoring an arbitrary partial snapshot, or dropping refusal
   markers is not that route. Changing a database layout shared by several slots additionally needs
   exclusion across all those slots, not just this slot's permit.

The new interlock cannot retroactively change cached executables released before it. Worker waiting
alone cannot exclude them either. A migration must prove the predecessor refusal above or explicitly
exclude those executables through the personal operator procedure before changing storage. Arbitrary
same-origin code can bypass cooperative locks; tampering can cause refusal, and marker absence is not
rollback/restore attestation. Those limits are not paid by this component's tests.

## Evidence and next work

`pnpm storage:compatibility` runs disposable Chromium tests for queued openers behind two real Local
writers, exact retention of later writing, renderer death after a synthetic intent commit, cold refusal,
exclusive refusal, cancelled blocked opens, future-schema journal preservation, slot isolation and an
omitted-check control. The synthetic transition writes only a marker; removing it in one test merely
restores unchanged test storage and is explicitly not a migration rollback.

`test/storageCompatibility.test.ts` runs 160 generated marker/reacquisition histories at seed 8941 and
compares every retained value before/after each attempted acquisition. It also covers failed probes,
request-success/transaction-abort ordering and the get-instead-of-count control for `undefined`.
These histories are controlled IndexedDB tests; real lock scheduling belongs to the native cases.
See the [preserved run](./storage-conformance-runs/2026-09-10-storage-compatibility.md).

There is no present need to build a speculative general data-migration framework. After reviewing and
committing this phase, the prepared same-format app release can be handed over through the author's
lock/close/reopen procedure. The next development slice is account attachment and encrypted sync prep:
identify the service/account authority and recovery contract, bind this existing workspace, and specify
how the author's other pre-encryption device adopts it with fresh device custody **without importing or
merging that device's old writing**. Its old-data cleanup remains separate. Relay stays off until the
authenticated encrypted transport path is ready; the plaintext relay is not that path. L-2's separate
checkpoint remains untouched and must be reconciled before overlapping its account work.


## Private local-baseline fence — 2026-10-13

The [durable anchoring phase](./account-local-baseline-anchoring.md) defines a private counter-v3
carrier without activating it in the application. Ordinary `parseCounter` now returns
`app-update-required` for v3; predecessor readers already refused that version. No marker
bypass, database upgrade, automatic conversion, or downgrade is added. The active pointer and
all encrypted chunks commit together; the tested private carrier retains complete history.
Its baseline-aware application reader/installer and later deletion policy remain future work.
