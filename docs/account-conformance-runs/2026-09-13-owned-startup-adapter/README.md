# Owned-startup catalogue adapter — bounded evidence

Baseline `ddd77a3` (unsigned) plus this adapter's changes. This packet covers the retained-workspace
startup catalogue's execution adapter and focused shared-runner regressions. It does not change
production startup behavior or establish a release aggregate. Executable and test pins from the full
native run were rechecked before archival. Checkpoint/evidence documents were written around/after
execution. No immutable whole-release revision is claimed.

## Results

| Run | Result |
| --- | --- |
| Full standalone owned-startup | 15 passing baselines, 96 baseline assertions and three intended mutation detections; worker/browser groups drained. Stage 41.6 s; complete command 62.9 s. |
| Selected absence/orphan/reclassification | Three baselines, 20 assertions and all three applicable mutations; explicit output and JSON/Markdown reports preserved. |
| Baseline-only replay/restart | Two baselines, 15 assertions and exactly zero mutations, including cancellation during decrypt and renderer death during initialization. |
| Selected workspace regression | Nested undo/redo history baseline, nine assertions and its intended redone-link mutation detection. |
| Disposable infrastructure | Eleven stages: 44 exact cases plus two static checks; all groups drained. |
| Final gates | Eight pass: inventory, manifest, 59 non-native controls, types, lint, format, authority and expected whole-release refusal. |
| Native ownership controls | Seven pass: completion, timeout, cancellation, worker death, browser death, startup deadline and dependency module identity. |
| Option controls | Custom browser override and existing output refuse; no override output is created and the previous report remains identical to the owned artifact. |

The original startup cases exercise absent carriers without writes, orphan/missing/misrouted carriers,
legacy routing, interrupted content creation, retained clear markers, corrupt ciphertext, factor unlock,
post-grant reclassification, cancelled authenticated replay, interrupted initialization, future schemas
and independence from another workspace's damage. Refused or pending opens must expose no editor,
transport, accepted writing or export. Successful open requires replay and admitted initialization before
mounting. Real IndexedDB, localStorage, Web Locks, WebCrypto, CodeMirror and renderer crashes remain.

The fixture captures the browser's database enumeration method for its inventories, then disables
`indexedDB.databases()` for production paths and checks it remains unused. The absence probe mutation
must reveal an actual database side effect; merely reporting a fresh disposition is insufficient. All
four full-run variant servers bind OS-assigned loopback ports and record closure. The owner separately
requires worker and browser group drain. Ownership remains cooperative POSIX process management, not
an OS containment guarantee.

All three source anchors occur exactly once:

| Mutation | Source | Required failed assertion |
| --- | --- | --- |
| `probe-creates-database` | `src/crdt/startupStorage.ts` | `preflight-no-database-side-effects` |
| `orphan-is-fresh` | `src/crdt/startupClassification.ts` | `orphan-not-fresh` |
| `skip-open-classification` | `src/crdt/ownedStartup.ts` | `open-rechecks-after-grant` |

Each mutation requires exact changed source bytes and its own assertion passing in the baseline and
failing in the mutant. Another refusal, an earlier preflight result or an unrelated assertion failure
cannot stand in for the specific oracle. Missing/duplicate results, baseline source bytes and shortened
patch paths refuse. Original scenarios and catalogue patches remain unchanged. Tagged assertion evidence
preserves zero mounts/channels and nested undefined writing/export values distinctly from null, false
and absent report fields.

Four new tests include 160 generated selections with seed 130909. Each varies a nonempty subset of the
15 cases and whether mutations are requested, independently determines applicable mutations, reconciles
a valid result, then checks refusal after omission or substituted evidence. Together with seeds
130901–130908, the 59 non-native tests exercise 1,440 generated validation histories. These are adapter
controls, not 1,440 additional product histories. Seven native tests are counted separately.

## Reproduction and limits

Use installed repository dependencies and Playwright Chromium. Commands do not install dependencies
or use a personal profile/server. Native commands need permission to launch disposable browsers and
loopback listeners. Choose fresh output directories.

```sh
node scripts/release-validation/check.mjs
node scripts/release-validation/plan.mjs
node --test --test-concurrency=1 test/release-validation/*.test.mjs
node scripts/owned-startup/run.mjs
node scripts/owned-startup/run.mjs --case O01.absence,O02.orphan,O11.recheck --output test-results/startup-census-new
node scripts/owned-startup/run.mjs --case O12.replay,O13.init-death --no-mutants --output test-results/startup-replay-new
node scripts/workspace-admission/run.mjs --case W07.history --output test-results/startup-workspace-new
node scripts/release-validation/execute.mjs --selection infrastructure
```

`execute.mjs --selection owned-startup` uses the same full stage factory as the exercised standalone
command. Its candidate is `startup` and scope `owned-startup-browser`. The shared adapter explicitly
allows six reviewed catalogue families; no other family is inferred compatible. Case, no-mutant and
output options remain. The former custom Chromium override refuses because the owner pins installed
browser bytes. Default catalogue, exact package leaf and campaign alias resolve; the enclosing package
check chain retains its other obligations.

The full campaign ran before the focused regressions. Selected native runs and ownership controls
could overlap; their timings are not comparative performance measurements. This is one macOS arm64
host, Chromium 151.0.7922.34, Playwright 1.62.0 and Node 26.8.2. Synthetic enrollment, Local identity/index
installation and receive authority remain. Transition markers exercise refusal hints; they grant no
resumption/deletion authority. Fresh genesis, verified creation/migration resumption, clear execution,
trim, default-app cutover and Account authority remain outside the original fixture. Native IME/device
capacity, OS/power loss and raw rollback/clones are not qualified.

Worker deadlines remain 120 seconds for multiple cases and 90 seconds for one case, browser startup
15 seconds and per-group TERM/KILL grace 5 seconds. Worker/browser logs and parsed reports each retain
4 MiB ceilings. Copying/fingerprinting is separate preparation. Browser logs are retained; no claim of
zero background network activity is made. The workspace selection is a focused regression, not a new
complete workspace campaign.

The manifest has 601 obligations, 430 unresolved. Five catalogue adapters remain (81 cases and 27
mutations). Passing a catalogue does not discharge enclosing wrapper prerequisites/postconditions.
Local genesis's 17 cases/four mutations is next, then other adapters and wrappers before P-06 and
complete aggregate qualification. Whole-release execution still refuses.

## Artifacts and preservation

The prospective retention ceiling is **1,500,000 bytes**. Retain compressed reports, receipts, logs,
source/dependency/browser identities and summaries; omit disposable profiles, copied dependencies,
source overlays and Vite caches. The base closure pins 14,392 source/document/evidence paths, 8,761
installed dependency entries, the Node executable and 339 Chromium bundle entries. The runtime overlay
contains 162 source files, including the shared Account protocol and generated journal seal.

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
was used. Historical review packets/intake manifests and formal debts remain unchanged. This adapter
is uncommitted; `ddd77a3` and earlier unsigned hashes are preserved for the in-flight review.
