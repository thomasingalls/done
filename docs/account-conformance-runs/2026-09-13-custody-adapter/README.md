# Custody catalogue adapter — bounded evidence

Baseline `d65bda0` (unsigned), plus this phase. This is execution-adapter evidence, not an immutable
release aggregate. Product code, fixture probes, scenario assertions and catalogue patches are unchanged.

| Run | Result |
| --- | --- |
| Full catalogue | 13 baselines, 73 assertions, five intended mutation detections; 43.4-second stage inside 120 seconds. |
| Selected controls | Five mutation-bearing cases, all five mutations. |
| Profile-only baseline | C13: ordinary and planted source/copy pairs; one case, zero mutations. |
| Compaction regression | T11 deletion abort and T15 close/drain, including the transaction-completion mutation. |
| Infrastructure | 15 stages, 62 exact cases plus two static checks. |
| Final gates | Inventory, manifest, 77 non-native tests, types, lint, format, authority and expected release refusal pass. |
| Persistent-browser controls | Initial four controls failed to launch Chromium; repaired four pass: close/copy, timeout, cancellation, worker death. |
| Shared native ownership | All seven existing controls pass after the environment extension. |
| Options | Browser override and existing output refuse; previous report unchanged and identical to owned artifact. |

Original cases retain confirmation before persistence, competing creators, native request-success/
transaction-abort boundaries, interrupted reservation and creation, authenticated metadata, partial/
legacy/missing custody, scope/authority checks, seal ceiling, stale tasks, crypto cancellation and
initialization drain. Five mutations require their own changed bytes and specific previously passing
assertion; unrelated failures do not count.

C13 still closes and copies complete synthetic profiles on the same host. The ordinary copy fails to
supply either tested opener; the planted non-extractable promptless root opens the known-content and
future-receiver probes. Missing factors refuse and the retained external factor opens ordinary copied
content. The parent independently requires all eight named assertions and their expected values.
This is not an exhaustive attacker proof, production reader-wrap validation or native-keychain claim.
Copies retain the original read/decrypt-only scenario; they do not create supported writable histories.

Four additional browsers now use direct, non-detached spawning under the guarded worker group. Closing
a persistent context sends Browser.close, awaits zero-exit process closure and checks singleton-lock
removal. Copying a live/failed source refuses. Directory digests (paths, file bytes and symlink targets)
match before reopening. The copied DevTools endpoint marker is then removed to avoid reconnecting to
the already closed source endpoint. Source/copy identities, process IDs, worker ID, pinned executable,
paths, arguments, endpoints, closure and copy digests are recorded and reconciled. The outer owner
still drains the complete inherited group on timeout/cancellation/death.

The first native controls found Playwright searching beneath the isolated HOME for an uninstalled
browser. The parent now passes its already fingerprinted executable as RELEASE_BROWSER_EXECUTABLE;
workers do not choose another installation. The failed logs, actual temporary helper/subject files and
parent receipts are retained under initial-profile-fixtures. The repaired native tests verify real
cold-copied localStorage, live-copy refusal, absent profile processes and refused CDP listeners after
normal completion or forced termination. A zero-exit leader is not sufficient. The seven preexisting
Chromium ownership controls also pass. Final static checks also found two obsolete unsupported-family
tests naming custody. They now name an unsupported placeholder; prototype-name controls remain. The
first infrastructure failure and both pre-refresh gate runs are retained. Updating those test bytes
required refreshing their inventory snapshot; the final gates and infrastructure pass. Neither the detached-child guard nor deadlines were relaxed.

Five adapter tests include 160 generated selections and evidence faults (seed 130914), plus directed
missing/live/altered/wrong-owner/incomplete-copy and omitted/altered positive-control evidence checks.
There are 77 non-native tests and 2,240 generated runner histories; these are not additional product
histories. The eleven native controls run separately and remain unresolved as nested aggregate stages.

```sh
node scripts/custody/run.mjs
node scripts/custody/run.mjs --case C12.genesis,C12.reservation-abort,C12.interrupted-creation,C12.metadata-authentication,C12.cancel-crypto --output test-results/custody-selected-new
node scripts/custody/run.mjs --case C13.profile-copy --no-mutants --output test-results/custody-profile-new
node scripts/content-trim/run.mjs --case T11.delete-abort,T15.close --output test-results/custody-trim-new
node --test test/release-validation/custody-native.test.mjs
node --test test/release-validation/content-native.test.mjs
node scripts/release-validation/execute.mjs --selection infrastructure
```

Installed dependencies and Playwright Chromium are required; outputs must be fresh. The full manifest
`custody` selection uses the same stage. Package leaf/campaign alias resolve; enclosing wrappers remain
separate. All worker/main-browser groups drained. Persistent processes closed cleanly in passing product
cases; failure controls instead prove outer-group drain and do not credit profile closure. Variant
servers use OS-assigned loopback ports. Process management is cooperative, not OS isolation or zero
background networking. Only synthetic profiles used mock keychain/basic password store. This host is
macOS arm64, Node 26.8.2, Chromium 151.0.7922.34, Playwright 1.62.0. Timings may overlap for selected
runs; they do not qualify platform/workload capacity. Bounds remain 120/90-second worker deadlines,
15-second browser startup, five-second TERM/KILL grace and four-MiB logs/reports; preparation is separate.

[runs.json](./runs.json) records selections, counts, identities and timings.
[archive-files.json](./archive-files.json) maps original/decompressed/normalized hashes to compressed
artifacts. Worktree, browser-cache and disposable prefixes are normalized; Q-08 remains open. The
prospective archive ceiling is 1,500,000 bytes. Profiles, copied dependencies and Vite caches are omitted.
`passing-full/inputs.json.gz` is the base; other inputs use references/deltas. Remove `removeFields`,
replace `fields`, apply `patches` remove/upsert by path and sort rows; canonicalize with sorted keys,
compact JSON and trailing newline. Check `targetNormalizedSha256`. Original closure reconstruction,
executable pins, compressed hashes and receipt artifact hashes were verified before committing.

[preservation.json](./preservation.json) records unchanged personal files (21), prior vectors (31),
append-only completed/decisions and unchanged L-2. Personal profiles/apps/services/builds, real factors,
keys, Account and root `done ` were unused. Historical reviews, debts and previous hashes remain.
The manifest has 606 obligations, 419 unresolved. Write-session is the last catalogue adapter; general
tests/wrappers, P-06, the complete vector chain and immutable aggregate remain afterward.
