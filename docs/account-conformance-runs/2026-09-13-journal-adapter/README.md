# Journal catalogue adapter — bounded evidence

Baseline `b9f0984` (unsigned) plus this adapter's changes. This packet covers the journal catalogue's
execution adapter, the shared carrier reconciler and the content regression. It is not a release
aggregate, complete Account store-contract campaign or new production storage behavior. Executable
and test input pins from the full journal run were rechecked before archival; checkpoint/evidence
documents were written around/after execution. No single immutable whole-release revision is claimed.

## Results

| Run | Result |
| --- | --- |
| Full standalone journal | All 17 baselines, 93 baseline assertions and six intended mutation detections; both groups drained. Stage 74.7 s; complete command 98.2 s. |
| Full manifest content regression | All 13 baselines and five intended mutation detections; both groups drained. |
| Existing store-contract journal selection | All six selected cases and exactly four applicable mutations; standalone output/report files preserved. |
| Selected baseline-only journal | One handoff-race case, exactly zero mutations, explicit output/report files preserved. |
| Disposable infrastructure | Seven stages: 27 exact cases plus two static checks; all groups drained. |
| Final gates | Eight pass: inventory, manifest, 39 non-native tests, types, lint, format, authority and expected whole-release refusal. |
| Native ownership controls | Six pass: completion, worker timeout, cancellation, worker death, browser death and startup deadline, including expected failed receipts and listener/process cleanup. |
| Command option controls | Unsupported custom browser and existing output both refuse; no browser-override output is created and the existing report's hash is unchanged. |

The catalogue retains real renderer death before journal flush, native quota refusal, unreadable
carrier handling, aborted and chunked flushes, changed exact-entry retention, cleanup failure,
cross-tab handoff, frozen/concurrent writers and WASM key disposal. All seven journal variant servers
used OS-assigned loopback ports and reported closure. The parent independently records browser and
worker process-group drain; native controls additionally require listener refusal and no matching
disposable-profile processes. This is cooperative POSIX ownership, not an OS containment guarantee.

The six mutations are `skip-storage-append`, `acknowledge-refusal`, `remove-changed-entry`,
`cleanup-before-commit`, `reread-journal-after-content` and `skip-wasm-disposal`. The adapter requires
each specific assertion to pass in the baseline and fail in the mutant, with the exact source patch
and changed hash. Nonzero exit, an unrelated failure or the label `detected` alone is insufficient.
Source targets must be independently pinned, and no-op patches refuse. Existing catalogue patches,
scenario assertions and production storage code were not edited.

Four new tests include 160 generated selected-case/mutation combinations (seed 130905). Each valid
subset must reconcile its exact result population; omitting work or substituting an unrelated
failure must then refuse. Together with prior seeds 130901–130904, the 39 non-native runner tests
exercise 800 generated validation histories. These are adapter/control histories, not another 800
product storage histories. Six native ownership tests run separately from those 39 cases.

The journal host-smoke retains 20 unthrottled measurements for each of four payload sizes and exact
distinct carrier counts. This is one host with a coarse browser clock, not supported-population
latency evidence. The full journal run preceded other native campaigns in this phase. Content and
ownership/selected-option regressions may overlap and are not comparative performance measurements.

## Reproduction and scope

Use the installed repository dependencies and Playwright Chromium. These commands do not install
dependencies, launch a personal profile or use the personal server. Native commands need permission
for disposable browser processes and loopback listeners. Choose fresh output directories.

```sh
node scripts/release-validation/check.mjs
node scripts/release-validation/plan.mjs
node --test --test-concurrency=1 test/release-validation/*.test.mjs
node scripts/journal/run.mjs
node scripts/release-validation/execute.mjs --selection content
node scripts/journal/run.mjs --case C01.synchronous-crash,C09.unreadable,C11.abort-flush,C04.close-and-keys,C04.concurrent-writers,C01.handoff-race --output test-results/journal-contract-new
node scripts/journal/run.mjs --case C01.handoff-race --no-mutants --output test-results/journal-baseline-new
node scripts/release-validation/execute.mjs --selection infrastructure
```

`execute.mjs --selection journal` uses the same full stage factory as the exercised standalone
command. The existing store-contract wrapper's exact nested journal selection was run, with six
cases and four mutants; its remaining prerequisites and postconditions were not run or credited.
The manifest contains 597 obligations with 442 unresolved, including nine remaining catalogue
adapters (133 cases/43 mutants). Release execution must still refuse. Admission's 15 cases/six
mutants are next, followed by remaining families/wrappers before P-06 and aggregate qualification.

Both carrier adapters bind their own catalogue, worker, report scope and variant. Shared report
code explicitly allows only content and journal. The journal command's former `CHROMIUM_PATH`
override now fails explicitly because the owned adapter certifies the installed, byte-pinned browser.
Its `--case`, `--no-mutants`, `--output`, JSON and Markdown outputs remain supported.

Worker deadlines remain 120 seconds for multiple cases and 90 seconds for a single case, with
15-second browser startup and separate 5-second TERM/KILL grace periods per group. Worker/browser
logs and the parsed report each retain their 4 MiB ceilings. Copying and fingerprinting are separate
preparation. Browser background logs are retained; zero background networking is not claimed.

## Artifacts and preservation

The prospective retention ceiling is **1,500,000 bytes**. Retain compressed reports, receipts, logs,
source/dependency/browser identities and small summaries. Omit disposable profiles, dependency/source
copies, source overlays and Vite caches. The base input closure pins 14,029 source/document/evidence
paths, 8,761 installed dependency entries, Node 26.8.2 on macOS arm64 and 339 Chromium bundle entries.

[runs.json](./runs.json) lists exact results and timings. [archive-files.json](./archive-files.json)
maps original artifact hashes to compressed archives and normalized hashes; identical normalized
artifacts share storage. Worktree, Playwright cache and disposable fixture prefixes are normalized.
Other runtime paths and test-generated IDs retain their recorded meaning. This local normalization
does not complete Q-08's public evidence policy.

`passing-full/inputs.json.gz` is the base closure. Other runs use a reference or delta: remove
`removeFields`, replace `fields`, remove/upsert rows in each `patches` collection, then sort those
arrays by `path`. Canonicalize with sorted object keys, compact JSON and a trailing newline. Its hash
must equal `targetNormalizedSha256`. Original unnormalized input reconstruction was also verified
before archival. Receipt artifact hashes refer to original bytes; the archive index preserves that
correspondence after normalization.

[preservation.json](./preservation.json) records 21 unchanged personal package files, 31 unchanged
prior vector files, append-only completed/decision records and the unchanged L-2 suffix. Root
`done ` was not read or changed. Personal app/profile/service/build, recovery material, Account,
factors and keys were not used. Historical review packets/intake manifests and formal debts remain
untouched. The journal adapter is uncommitted; `b9f0984` and earlier unsigned hashes are preserved.
