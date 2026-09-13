# Admission catalogue adapter — bounded evidence

Baseline `1a86453` (unsigned) plus this adapter's changes. This packet covers admission's execution
adapter and regressions of the shared content/journal runner. It is not a release aggregate or new
production admission behavior. Executable and test input pins from the full native run were rechecked
before archival. Checkpoint/evidence documents were written around/after execution, including a final
punctuation correction in the guide after the static gates. No immutable whole-release revision is claimed.

## Results

| Run | Result |
| --- | --- |
| Full standalone admission | 15 passing baselines, 64 baseline assertions and six intended mutation detections; worker/browser groups drained. Stage 58.9 s; complete command 81.9 s. |
| Selected refusal-order case | One baseline and both applicable mutations; explicit output and JSON/Markdown reports preserved. |
| Selected baseline-only admission | One refusal-order baseline and exactly zero mutations. |
| Selected content regression | One unreadable-load case and its intended mutation detection. |
| Selected journal regression | One handoff-race case and its intended mutation detection. |
| Disposable infrastructure | Eight stages: 31 exact cases plus two static checks; all groups drained. |
| Final gates | Eight pass: inventory, manifest, 43 non-native controls, types, lint, format, authority and expected whole-release refusal. |
| Native ownership controls | Six pass: completion, timeout, cancellation, worker death, browser death and startup deadline, including failed receipts and listener/process cleanup. |
| Option controls | Custom browser override and existing output both refuse; no override output is created and the previous report hash is unchanged. |

The original admission cases retain renderer death, pending Yjs structs/deletes, synchronous journal
receipt before publication, private refused input, head-only preparation, forced retry, committed
remote dependencies, prefix slicing, capacity, durability barriers, close/key disposal, unreadable
repair and cross-tab delivery. All seven variant servers use OS-assigned loopback ports and record
closure. The owner independently requires browser and worker group drain. Native controls also check
listener refusal and absence of processes using the disposable profile. Ownership remains cooperative
POSIX process management, not an OS containment guarantee.

All six patches target `admissionQueue.ts`; each original anchor occurs exactly once. They are
`publish-before-forced-commit`, `prepare-queued-input-early`, `publish-receive-before-commit`,
`retry-via-journal`, `early-durability-return` and `ignore-byte-capacity`. The first two target the same
case but different assertions. Each needs its own exact patched bytes and a failure at the assertion
that passed in the baseline. A missing/duplicate result, the other mutation's source hash, an unrelated
failure or the label `detected` alone cannot discharge it. Existing scenarios, patches and production
code were not changed.

Four new tests include 160 generated selections with seed 130906. Every generated selection includes
the shared refusal-order case, varies other cases and the explicit mutation option, reconciles valid
results, then checks refusal after an omission or substituted assertion. Together with prior seeds
130901–130905, 43 non-native tests exercise 960 generated validation histories. These are adapter
controls, not 960 additional product histories. Six native ownership tests are counted separately.

## Reproduction and limits

Use installed repository dependencies and Playwright Chromium. Commands do not install dependencies
or use a personal profile/server. Native commands need permission to launch disposable browsers and
loopback listeners. Choose fresh output directories.

```sh
node scripts/release-validation/check.mjs
node scripts/release-validation/plan.mjs
node --test --test-concurrency=1 test/release-validation/*.test.mjs
node scripts/admission/run.mjs
node scripts/admission/run.mjs --case C03.ordered-refusal --output test-results/admission-order-new
node scripts/admission/run.mjs --case C03.ordered-refusal --no-mutants --output test-results/admission-baseline-new
node scripts/release-validation/execute.mjs --selection content-control
node scripts/journal/run.mjs --case C01.handoff-race --output test-results/admission-journal-new
node scripts/release-validation/execute.mjs --selection infrastructure
```

`execute.mjs --selection admission` uses the same full stage factory as the exercised standalone
command. The shared adapter now explicitly allows content, journal and admission; admission retains
its existing `ordered-admission-browser` scope. Its former `CHROMIUM_PATH` override explicitly refuses
because the owner certifies the installed browser bytes. Case, no-mutant and output options remain.

The full admission run preceded the other native runs. Selected regressions and ownership controls
may overlap, so their timings are not comparative performance measurements. This is one macOS arm64
host, Chromium 151.0.7922.34, Playwright 1.62.0 and Node 26.8.2. Admission uses synthetic commands and
projections; actual CodeMirror and transport integration are outside this catalogue. Renderer death
does not establish OS/power-loss behavior. Raw rollback/clones remain outside these component claims.

Worker deadlines remain 120 seconds for multiple cases and 90 seconds for one case, browser startup
15 seconds and per-group TERM/KILL grace 5 seconds. Worker/browser logs and parsed reports each retain
4 MiB ceilings. Copying/fingerprinting is separate preparation. Background browser logs are retained;
zero background networking is not claimed. The content and journal selections are focused regressions,
not new complete campaigns of those families.

The manifest has 598 obligations, 439 unresolved. Eight catalogue adapters remain (118 cases and 37
mutations). Enclosing wrappers retain independent prerequisites and postconditions; a passing nested
catalogue is insufficient. Editor-admission's 12 cases/three mutations is next, then other adapters and
wrappers before P-06 and complete aggregate qualification. Whole-release execution still refuses.

## Artifacts and preservation

The prospective retention ceiling is **1,500,000 bytes**. Retain compressed reports, receipts, logs,
source/dependency/browser identities and summaries; omit disposable profiles, copied dependencies,
source overlays and Vite caches. The base closure pins 14,103 source/document/evidence paths, 8,761
installed dependency entries, the Node executable and 339 Chromium bundle entries.

[runs.json](./runs.json) lists results and timings. [archive-files.json](./archive-files.json) maps
original bytes and decoded/normalized hashes to compressed archives, deduplicating identical normalized
artifacts. Worktree, Playwright cache and disposable fixture prefixes are normalized; other runtime
paths and test-generated IDs retain their recorded meaning. This does not close Q-08's public evidence
policy. Receipt artifact hashes refer to original bytes, with correspondence preserved by the index.

`passing-full/inputs.json.gz` is the base closure. Other runs use a reference or delta: remove
`removeFields`, replace `fields`, remove/upsert each `patches` collection, then sort its rows by `path`.
Canonicalize with sorted object keys, compact JSON and a trailing newline. The reconstructed hash must
equal `targetNormalizedSha256`. Original unnormalized reconstruction was also checked before archival.

[preservation.json](./preservation.json) records 21 unchanged personal package files, 31 unchanged prior
vector files, append-only completed/decision records and the unchanged L-2 suffix. Root `done ` was
not read or changed. No personal app/profile/service/build, recovery material, Account, factor or key
was used. Historical review packets/intake manifests and formal debts remain unchanged. The admission
adapter is uncommitted; `1a86453` and earlier unsigned hashes are preserved for the in-flight review.
