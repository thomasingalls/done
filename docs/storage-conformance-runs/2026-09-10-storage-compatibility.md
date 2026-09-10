# Storage compatibility interlock — 2026-09-10

Base: signed `14901a5` (compatible app updates and confirmed personal source cleanup). This phase adds
a refusal-only check before every shared/exclusive initialization; it does not perform a format migration
or write an upgrade marker into the author's installation. The live build and preview server remain intact.

| Check | Result and evidence |
| --- | --- |
| Compatibility campaign | [5 native passes](./2026-09-10-storage-compatibility/native.json): two real writers block transition, queued initialization refuses, later writing survives, crash after marker commit retains refusal, Local-clear preparation and exclusive acquisition refuse, blocked native open retains its permit through cancellation, future-schema journal remains byte-for-byte unchanged, slot isolation and omitted-check control |
| Existing lifecycle campaign | [13 native passes and 5 detected fault controls](./2026-09-10-storage-compatibility/lifecycle.json): shared/exclusive locks, freezing, draining, detached work, task expiry, cancellation, partial initialization, failed cleanup, renderer/worker death and navigation |
| Complete unit suite | [825 passes](./2026-09-10-storage-compatibility/unit.json), including 160 generated interlock/reacquisition histories at seed 8941 and get-instead-of-count sensitivity for a retained undefined value |
| Compatible app upgrades | [8 native passes](./2026-09-10-storage-compatibility/app-upgrades.json), using two isolated real builds and a pinned copy of the actual live predecessor |
| Local application | [8 native passes](./2026-09-10-storage-compatibility/local-app.json), including generated compose/history sequences and cold recovery |
| Private migration/cleanup | [5 native passes](./2026-09-10-storage-compatibility/private-migration.json), including saved files, crash/restart, wrong-code retry, selected source cleanup and later-writing recovery |
| Static/build checks | TypeScript, focused lint/format and diff checks passed. Isolated app entries are 327.2 kB gzip against the 350 kB budget; origin isolation passed. [Build checks](./2026-09-10-storage-compatibility/build-checks.json) also verify all eleven live files against their predecessor hashes |

The generated histories vary slot names, marker presence and arbitrary contents, shared/exclusive
acquisition, and repeated reacquisition. A populated marker must prevent caller initialization and leave
all retained values unchanged, including another slot's marker and unrelated bytes. Absence only permits
the existing authentication/classification path. The get-based control actually admits an undefined-valued
retained key; the native omitted-check control actually initializes a writer with an interlock present.
The campaign found no additional production counterexample in this bounded contract.

Native harness corrections: the first fixture passed an extra workspace argument to the existing Local
opener, yielding `unavailable`; its call now matches the production signature. The first crash fixture
continued evaluating in a same-origin renderer affected by deliberate death and timed out. The corrected
fixture waits for the crash event and uses a new page/realm. Neither was counted as a protocol failure.
A final guard also checks task liveness immediately before caller initialization after the awaited probe.
The final compatibility, lifecycle, app-upgrade, Local-app, private-migration and unit runs include it.

The [manifest](./2026-09-10-storage-compatibility/manifest.json) pins source, harness and reports. Build
inventories pin the separately generated packages; test-results paths are disposable local artifacts.
[Storage compatibility](../storage-compatibility.md) defines the baseline and the required future owner.

This evidence does not establish an authenticated format migrator, predecessor exclusion for arbitrary
old code, cross-slot physical database upgrades, incompatible rollback, restored-profile/nonce safety,
whole-profile residue, platform coverage, account/sync correctness or public assurance. The complete
`pnpm check` chain was not run; its other browser campaigns remain outside this result. No debt/matrix
status changed. Personal writing, factors, recovery files and browser profiles were not accessed.
