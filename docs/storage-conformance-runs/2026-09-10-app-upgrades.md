# Compatible application upgrades and private cleanup helper — 2026-09-10

Base checkpoint: `07d89f6`. The live application build and server were left unchanged. Two isolated builds
and a byte-pinned copy of the actually served predecessor were exercised on a disposable loopback origin.
The agent did not operate the author's browser or delete personal source, and no new build was served to it.

## Results

| Check | Evidence |
| --- | --- |
| Eight native upgrade cases | [Native report](./2026-09-10-app-upgrades/native.json): exact asset/file bytes, first-install offline reopen without claiming the original page, actual predecessor handoff, two old tabs and later edits, missing/wrong-byte downloads and retry, renderer death, offline recovery, compatible rollback, immediate-activation sensitivity control |
| Five native private migration/cleanup cases | [Native report](./2026-09-10-app-upgrades/cleanup-native.json): pasted helper wrong-code refusal and corrected retry, exact source deletion with modern-journal preservation and later-writing reopen; existing import crash/resume, binding/source refusal, abort and worker-presence regressions |
| 37 relevant unit tests | [Report](./2026-09-10-app-upgrades/unit.json): precache versioning, generated worker, private migration, Local startup and workspace admission. Includes 120 generated download/cache-write failure histories at seed 8941 and two guard-removal controls; existing private utility properties retain their own populations |
| Build/static checks | TypeScript and focused lint/format passed; [isolated-build checks](./2026-09-10-app-upgrades/build-checks.json) pass origin isolation and the 350 kB budget at 326.8 kB for both entries. All eleven live-build files still match their recorded hashes |

The generated histories execute the actual generated worker against controlled Fetch/Cache implementations.
Failures at different response/put positions must leave the prior and unrelated caches unchanged; a retry
must publish exactly the expected bytes, and activation may remove only its scoped predecessor caches.
Removing byte verification admits wrong content; removing the namespace guard deletes another app's cache.
The native activation mutant independently proves that the browser actually activates prematurely under
the losing policy. These are sensitivity observations, not claims of an exhaustive fault inventory.

The [predecessor inventory](./2026-09-10-app-upgrades/predecessor.json) and
[worker](./2026-09-10-app-upgrades/predecessor-worker.js) identify the previously served bytes. The new
[A worker](./2026-09-10-app-upgrades/worker-a.js) and [B worker](./2026-09-10-app-upgrades/worker-b.js)
represent compatible real app builds with different displayed build identities. Source/build/report hashes
are pinned in the [manifest](./2026-09-10-app-upgrades/manifest.json).

## Defects and instrumentation corrections

The pre-existing worker called `skipWaiting` and `clients.claim`, and activation deleted every cache except
its own. The new policy removes forced takeover, scopes deletion by base and policy, and verifies complete
release bytes before caching. A fixed-name response with status 200 is insufficient to install.

The cleanup helper's [wrong-code retry initially failed](./2026-09-10-app-upgrades/cleanup-retry-before.json):
the wrapper inspected a stale prior error before loading a corrected attempt. It now acknowledges the host
only on its initial phase; loading files clears a retry's old error. The cleanup owner itself was unchanged.
The isolated blob frame keeps the helper's Yjs instances separate from the application's runtime.

Three test/preparation corrections are not product defects: the first upgrade assertion matched two status
elements, the new cleanup rehearsal initially failed to wait for authenticated import before advancing,
and a legacy-prefix-only absence assertion mistakenly included modern encrypted journals. The final test
checks exact known source keys and exact preservation of modern journal entries. An attempted isolated
`about:blank` frame could not rewrite its history URL; the final same-origin blob realm is natively tested.

## Scope

[Application upgrade rules](../application-upgrades.md) cover compatible static release replacement.
Forced refresh/uncontrolled executables mean the worker waiting phase is not a storage-format fence.
Incompatible migration, old-writer/version exclusion, broader browser/platform behavior, cache eviction,
signed release provenance and public assurance gates remain separate. No storage/debt/matrix obligation
is marked paid. The full runtime suite and full check chain were not rerun.

The author subsequently ran the [one-off cleanup procedure](../private-source-cleanup.md), reported
success, and confirmed encrypted reopening with the writing intact. The exact helper completion text
was not retained and no independent personal census was captured. The new upgrade build is not yet
deployed to the personal installation.
