# Workspace-admission catalogue adapter — bounded evidence

Baseline `3f1afc5` (unsigned) plus this adapter's changes. This packet covers the workspace catalogue's
execution adapter and focused shared-runner regressions. It does not change production admission
behavior or establish a release aggregate. Executable and test pins from the full native run were
rechecked before archival. Checkpoint/evidence documents were written around/after execution. No
immutable whole-release revision is claimed.

## Results

| Run | Result |
| --- | --- |
| Full standalone workspace-admission | Ten passing baselines, 62 baseline assertions and four intended mutation detections; worker/browser groups drained. Stage 43.1 s; complete command 64.7 s. |
| Selected system/remote/nested history | Three baselines, 19 assertions and all three applicable mutations; explicit output and JSON/Markdown reports preserved. |
| Baseline-only initialization | One baseline, six assertions and exactly zero mutations, including nested undefined values. |
| Selected editor regression | Multicaret and pressure baselines, plus both pressure-case mutation detections. |
| Disposable infrastructure | Ten stages: 40 exact cases plus two static checks; all groups drained. |
| Final gates | Eight pass: inventory, manifest, 55 non-native controls, types, lint, format, authority and expected whole-release refusal. |
| Native ownership controls | Seven pass: completion, timeout, cancellation, worker death, browser death, startup deadline and dependency module identity. |
| Option controls | Custom browser override and existing output refuse; no override output is created and the previous report remains identical to the owned artifact. |

The original workspace cases exercise Goals/card editing, shared human history, structural commands,
private pending/refused work, renderer loss, cross-tab dependencies, system work outside human history,
received updates before undo, nested Yjs redone links, business rules and initialization before editor
mount. Real CodeMirror, IndexedDB, WebCrypto, journal and BroadcastChannel fixtures remain. All five
full-run variant servers use OS-assigned loopback ports and record closure. The owner independently
requires worker and browser group drain. Ownership is cooperative POSIX process management, not an OS
containment guarantee.

All four source anchors occur exactly once:

| Mutation | Source | Required failed assertion |
| --- | --- | --- |
| `pending-history-visible` | `src/crdt/admittedWorkspace.ts` | `pending-history-private` |
| `system-bulk-in-human-history` | `src/crdt/workspaceCommands.ts` | `bulk-outside-human-history` |
| `received-work-in-human-history` | `src/crdt/admittedWorkspace.ts` | `undo-preserves-remote` |
| `lost-redone-links` | `src/crdt/yjs.ts` | `undo-edit-in-restored-card` |

Each mutation requires exact changed source bytes and its own assertion passing in the baseline and
failing in the mutant. Substituting the other mutation of the same file, keeping baseline bytes,
omitting a result or failing an unrelated assertion refuses credit. Original scenarios and patches
remain unchanged. Workspace reports explicitly require tagged assertion evidence: nested undefined
values, null, false, zero and absent fields cannot be conflated.

Four new tests include 160 generated selections with seed 130908. Each varies a nonempty subset of
the ten cases and whether mutations are requested, independently determines applicable mutations,
reconciles a valid result, then checks refusal after omission or substituted history evidence. Together
with seeds 130901–130907, the 55 non-native tests exercise 1,280 generated validation histories. These
are adapter controls, not 1,280 additional product histories. Seven native tests are counted separately.

The first ad-hoc option check expected the obsolete wording `Refusing existing output`; the shared
owner correctly said `Refusing existing execution output`. The corrected control verifies refusal and
unchanged bytes. This was a control expectation correction, not a runtime defect or product repair;
the option summary retains it.

## Reproduction and limits

Use installed repository dependencies and Playwright Chromium. Commands do not install dependencies
or use a personal profile/server. Native commands need permission to launch disposable browsers and
loopback listeners. Choose fresh output directories.

```sh
node scripts/release-validation/check.mjs
node scripts/release-validation/plan.mjs
node --test --test-concurrency=1 test/release-validation/*.test.mjs
node scripts/workspace-admission/run.mjs
node scripts/workspace-admission/run.mjs --case W05.system,W06.remote,W07.history --output test-results/workspace-history-new
node scripts/workspace-admission/run.mjs --case W09.initialize --no-mutants --output test-results/workspace-initialize-new
node scripts/editor-admission/run.mjs --case E12.multicaret,E02.pressure --output test-results/workspace-editor-new
node scripts/release-validation/execute.mjs --selection infrastructure
```

`execute.mjs --selection workspace-admission` uses the same full stage factory as the exercised
standalone command. Its candidate is `workspace` and scope `workspace-admission-browser`. The shared
adapter explicitly allows five reviewed catalogue families; no other family is inferred compatible.
Case, no-mutant and output options remain. The former custom Chromium override refuses because the
owner pins the installed browser bytes.

The full campaign ran before the focused regressions. Selected native runs and ownership controls
could overlap; their timings are not comparative performance measurements. This is one macOS arm64
host, Chromium 151.0.7922.34, Playwright 1.62.0 and Node 26.8.2. Synthetic enrollment/receive authority
remain; the BroadcastChannel scope is not an Account envelope verifier. Full application startup,
classification, migration and trimming remain outside the original fixture. Native IME/device capacity,
OS/power loss and raw rollback/clones are not qualified.

Worker deadlines remain 120 seconds for multiple cases and 90 seconds for one case, browser startup
15 seconds and per-group TERM/KILL grace 5 seconds. Worker/browser logs and parsed reports each retain
4 MiB ceilings. Copying/fingerprinting is separate preparation. Browser logs are retained; no claim of
zero background network activity is made. The editor selection is a focused regression, not a new
complete editor campaign.

The manifest has 600 obligations, 433 unresolved. Six catalogue adapters remain (96 cases and 30
mutations). Passing a catalogue does not discharge enclosing wrapper prerequisites/postconditions.
Owned-startup's 15 cases/three mutations is next, then other adapters and wrappers before P-06 and
complete aggregate qualification. Whole-release execution still refuses.

## Artifacts and preservation

The prospective retention ceiling is **1,500,000 bytes**. Retain compressed reports, receipts, logs,
source/dependency/browser identities and summaries; omit disposable profiles, copied dependencies,
source overlays and Vite caches. The base closure pins 14,308 source/document/evidence paths, 8,761
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
is uncommitted; `3f1afc5` and earlier unsigned hashes are preserved for the in-flight review.
