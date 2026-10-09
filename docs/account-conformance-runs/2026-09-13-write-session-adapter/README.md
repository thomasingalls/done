# Write-session catalogue adapter — bounded evidence

Baseline `2c5f4b9` (unsigned), plus this phase. All eleven current catalogue families now have adapters.
This is staged adapter evidence, not an immutable whole-release aggregate. Product code and mutation
patches are unchanged. The navigation scenario's wait boundary changed; its safety assertions did not.

| Run | Result |
| --- | --- |
| Initial full | Twelve cases pass; C04.navigation times out awaiting load after restoration. All five mutations detected, but the campaign fails and receives no success credit. |
| Focused navigation repair | Restored document stays closed, its saved callback refuses, and the old permit releases. |
| Full rerun | 13 baseline cases, 56 assertions and five intended mutation detections; 33.3-second stage within 120 seconds. |
| Selected controls | Freeze, drain/cleanup, detached work, stale task: four cases/all five mutations. |
| Baseline-only | Dedicated-worker lifetime: one case, zero mutations. |
| Custody regression | Session lifetime and crypto cancellation: two cases/one mutation. |
| Infrastructure | 16 stages, 66 exact cases plus two static checks. |
| Final gates | Inventory, manifest, 81 non-native tests, types, lint, format, authority and expected release refusal pass. |
| Options | Browser override and existing output refuse; previous report remains identical to its owned artifact. |

The component retains real Web Locks in tabs and dedicated workers, freeze/resume, renderer death,
worker termination, cancellation, initialization/cleanup failures and navigation. The five mutations
split coordination names, bypass closing-session checks, release before native work drains, skip cache
cleanup and revive a completed task. Each needs its own source bytes and specific baseline-passing/
mutant-failing assertion; two mutations sharing the drain case remain distinct obligations.

Candidate `write-session`, scope `C04-component-browser` and the implicit fixed patch source
`src/crdt/writeSession.ts` are explicit bindings. Only this adapter supplies a default file to the
finite catalogue reader. Conflicting filenames refuse; missing files elsewhere still refuse. Source
path/hash/original fields remain in the report alongside the complete runtime source map. The worker
uses that full overlay, including promotion dependencies, inside the disposable checkout. Empty
unexpected-page-error artifacts are separately required for every baseline and mutant. Tagged evidence
preserves absent receipts and nested values. Four adapter tests include 160 generated selection and
mutation/evidence faults (seed 130915), totaling 2,400 generated runner histories across 81 non-native
tests. These are validation controls, not extra product histories. The unchanged eleven native ownership
controls retain passing evidence in the preceding custody packet.

The first campaign's navigation failure was a test wait: the browser had restored the old document,
whose session was already closed, while Playwright awaited a fresh load event. `goBack({waitUntil:
'commit'})` now waits for the navigation boundary, followed by existing page readiness and capability
checks. The eight-second timeout remains. Both the focused case and full rerun reached the restored
callback refusal assertion. The complete before/after input closures and failed parent receipt are
retained; no failure was converted to success by dropping a case. This is one-host restored-document
evidence, not a guarantee about all BFCache/platform behavior.

```sh
node scripts/write-session/run.mjs
node scripts/write-session/run.mjs --case C04.navigation --no-mutants --output test-results/session-navigation-new
node scripts/write-session/run.mjs --case C04.freeze-barrier,C04.drain-cleanup,C04.detached-work,C04.stale-task --output test-results/session-selected-new
node scripts/write-session/run.mjs --case C04.worker-lifetime --no-mutants --output test-results/session-worker-new
node scripts/custody/run.mjs --case C12.session-lifetime,C12.cancel-crypto --output test-results/session-custody-new
node scripts/release-validation/execute.mjs --selection infrastructure
```

Installed dependencies and Playwright Chromium are required; outputs must be fresh. The manifest's
`write-session` selection uses the same full stage. Package leaf/campaign alias resolve without crediting
enclosing wrappers. All recorded groups drained and all full-run variant servers closed on OS-assigned
loopback ports. Process management is cooperative, not OS isolation or zero background networking.
Only disposable fixtures ran on macOS arm64, Node 26.8.2, Chromium 151.0.7922.34, Playwright 1.62.0.
Selected runs may overlap; timings do not qualify device/workload performance. Bounds remain 120/90
seconds for multi/single-case workers, 15-second startup, five-second TERM/KILL grace and four-MiB
logs/reports. Preparation is separate. Synthetic cache/write probes do not certify full product
transitions, factors, opener retirement, Account authority or supported-platform capacity.

[runs.json](./runs.json) records exact selections, counts, identities and timings.
[archive-files.json](./archive-files.json) maps original/decompressed/normalized hashes to compressed
artifacts. Worktree, browser-cache and disposable prefixes are normalized; Q-08 remains open. The
prospective retention ceiling is 1,500,000 bytes. Profiles, copied dependencies/sources and caches are
omitted. `passing-full/inputs.json.gz` is the base closure. Other inputs use references/deltas: remove
`removeFields`, replace `fields`, apply `patches` remove/upsert by path, sort rows and canonicalize with
sorted keys, compact JSON and trailing newline. Verify `targetNormalizedSha256`. Original input
reconstruction, executable pins, compressed hashes and receipt artifact hashes were checked.

[preservation.json](./preservation.json) records 21 unchanged personal files, 31 prior vectors,
append-only completed/decisions and unchanged L-2. Personal apps/profiles/services/builds, recovery
files, factors, keys, Account and root `done ` were unused. Historical reviews, debts and prior hashes
remain. All eleven catalogues resolve (163 cases/54 mutations). The manifest still refuses release:
416 unresolved rows comprise 257 test-file, 96 command and 63 campaign obligations. General test and
wrapper adapters, P-06, the full vector prerequisite chain and immutable aggregate remain.
