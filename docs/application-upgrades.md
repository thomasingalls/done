# Application upgrades

This first bounded phase covers replacement of the packaged application's static files while the
encrypted storage and document formats remain compatible. It follows personal packaged checkpoint
`07d89f6`. The author's live `dist/` and server are retained while new builds are rehearsed separately.

## Three separate versions

- The displayed Git revision identifies an application build.
- The worker's release/cache identifier hashes the base path, final asset names and bytes, and worker
  generator policy. A worker-only change therefore also gets its own cache. Its manifest binds every
  downloaded byte, including fixed-name HTML, icons and the web manifest, to that worker's release.
- Persisted record/custody carrier versions and the document's `schemaVersion` are format contracts.
  Neither is derived from the app revision or cache identifier. This phase changes neither.

## Compatible release handoff

1. Build into an isolated output directory. Do not run an in-place build over the directory a live server
   is serving. Publish a complete release directory and retain the predecessor for a compatible rollback.
2. The new worker fetches with HTTP caching bypassed and refuses redirects, failed responses or any byte
   mismatch. It verifies every response before writing the candidate cache. A failed cache write removes
   only that candidate. Interrupted installation can leave unused candidate bytes; it cannot authorize
   activation. The active worker and its assets remain usable after failed installation.
3. Installation does not call `skipWaiting`. Activation does not call `clients.claim`. Existing controlled
   pages keep their worker until all those tabs/windows close. The first page of a new installation also
   keeps its original loading context; a subsequent navigation is controlled normally.
4. The menu and locked/startup screen report an installed waiting update. The notice asks the user to lock,
   close all app tabs/windows, and reopen. There is no automatic reload, key collection, pending-input
   discard, activation message, or content migration in the worker. Existing writing uses its ordinary
   admission and close/recovery contract throughout.
5. Activation removes obsolete caches only within this worker policy's base-scoped namespace. Other apps'
   caches and the predecessor's older unscoped cache names remain. Their eventual cleanup is a separate
   inventory decision. Cache Storage contains application files; encrypted writing remains in its existing
   database and journal.

The browser waiting lifecycle and refresh overlap are described in
[the service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle).
The manifest detects incomplete/mixed delivery relative to a trusted worker; it is not an independent
release signature or protection against a server deliberately delivering hostile application code.

## Boundary before any incompatible format change

**A waiting worker is not writer exclusion.** A forced refresh, an uncontrolled page or another executable
can run different application code. A tab-count observation cannot authorize changing stored formats.
Compatible A→B and B→A tests do not establish safe downgrade after a format migration.

The [storage compatibility phase](./storage-compatibility.md) now defines the baseline formats and checks
a refusal-only interlock on every shared/exclusive acquisition. It writes no marker or new format. The
first actual incompatible change still needs a concrete authenticated durable migration intent and
predecessor refusal under the existing exclusive lifecycle owner. Old writers must drain or block the transition;
restart must reacquire exclusion and re-read authenticated progress. Unknown/newer data must be preserved
and refused before application repair or writes. Rollback across changed formats requires an explicitly
supported migration/restore route, never raw key/counter cloning or merely serving the older JavaScript.
Existing schema/carrier parser refusals remain useful component evidence, not this complete upgrade gate.

## Rehearsal

`pnpm storage:app-upgrades` builds two compatible releases in a timestamped `test-results/app-upgrades/`
directory and runs a disposable Chromium host/profile campaign. Set `APP_UPGRADE_PREDECESSOR_DIR=dist`
to include a read-only copy of the actual currently served predecessor; the copied bytes are pinned in
the run record. No personal profile is opened and the live directory is not replaced.

Native cases cover exact HTTP/file parity, first-install offline reopening, two old tabs with a waiting
update, edits accepted while waiting, failed/wrong-byte installation and retry, offline updated reopening,
renderer death, compatible rollback, and a deliberately activated worker that violates the waiting rule.
`vite/appUpgradeProperties.test.ts` adds 120 generated failed-download/cache-write histories (seed 8941),
followed by complete retry and scoped activation, plus omitted-byte-check and unscoped-deletion controls.
These execute the generated worker in a controlled Cache/Fetch environment; native tests own browser
lifecycle claims. Supported-platform, disk eviction and incompatible-format migration remain later work.

The [run record](./storage-conformance-runs/2026-09-10-app-upgrades.md) carries results and exact source pins.
