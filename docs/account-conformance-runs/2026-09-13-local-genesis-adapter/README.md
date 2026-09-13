# Local-genesis catalogue adapter — bounded evidence

Baseline `6348b6c` (unsigned) plus this adapter's changes. This packet covers the Local-genesis execution
adapter, its byte-array evidence repair and focused shared-runner regressions. It changes no production
creation behavior and establishes no release aggregate. Executable and test pins from the passing full
native run were rechecked before archival. Checkpoint/evidence documents and the reproduction guide
were written around/after execution. No immutable whole-release revision is claimed.

## Results

| Run | Result |
| --- | --- |
| Initial full attempt | Failed after publishing G01: the encoder refused non-plain evidence during the creator-race case. The partial report is not catalogue success. Stage 7.9 s; both process groups drained. |
| Full rerun | 17 passing baselines, 160 baseline assertions and four intended mutation detections; worker/browser groups drained. Stage 73.8 s; complete command 95.2 s. |
| Account provenance selection | Seven baselines, 64 assertions and the two applicable mutations; exact selected case IDs and output/report options preserved. |
| Baseline-only counter crash | One generated boundary case, 11 assertions and exactly zero mutations. |
| Selected startup regression | Reclassification/replay baselines, 16 assertions and the intended skipped-classification mutation detection. |
| Disposable infrastructure | Twelve stages: 49 exact cases plus two static checks; all groups drained. |
| Final gates | Eight pass: inventory, manifest, 64 non-native controls, types, lint, format, authority and expected whole-release refusal. |
| Native ownership controls | Seven pass: completion, timeout, cancellation, worker death, browser death, startup deadline and dependency module identity. |
| Option controls | Custom browser override and existing output refuse; no override output is created and the previous report remains identical to the owned artifact. |

The nine generated cases cover claim, reservation, custody, content progress, witness, counter, ready
witness, ready progress and index commits. The fixture holds the native completion callback after the
transaction committed, queues a competing resume owner, then crashes the creator. Each case must retain
the winning identity, authenticate and finish progress, open the workspace, admit an edit, crash again
and recover that edit on a cold reopen. The parent compares case IDs and their separately reviewed
boundary fields; a repeated or relabeled boundary cannot stand in for another case.

Other original cases retain generated-factor confirmation before persistence, two creators with different
factors, transaction abort after request success, crypto cancellation/drain, missing completed content
or custody, damaged progress, legacy index interference, independent slots and closed-slot refusal.
Real IndexedDB, localStorage, Web Locks, WebCrypto, WASM journal sealing, Yjs, CodeMirror and renderer
crashes remain. Production-path database enumeration is disabled and asserted unused; fixture inventory
uses its separately captured native method. All five full-run variant servers bind OS-assigned loopback
ports and record closure. Process ownership is cooperative POSIX management, not an OS containment claim.

All four source anchors occur exactly once:

| Mutation | Source | Required failed assertion |
| --- | --- | --- |
| `skip-factor-confirmation` | `src/crdt/localGenesis.ts` | `mismatched-confirmation-refused` |
| `forget-completed-stage` | `src/crdt/localGenesisStorage.ts` | `missing-complete-refuses` |
| `skip-progress-authentication` | `src/crdt/localGenesisRecord.ts` | `damaged-progress-refuses` |
| `legacy-overwrites-local` | `src/crdt/slotIndex.ts` | `legacy-cannot-close-local` |

Each requires its own changed source bytes and its own assertion passing in the baseline and failing
in the mutant. An unrelated refusal, another mutation's source, shortened patch path or omitted result
refuses credit. Original scenarios and catalogue patches remain unchanged.

## Byte-array evidence repair

The creator race compares the retained initial custody record, which contains Uint8Array fields. The
first native run stopped at the shared encoder's plain-object restriction. Its failed parent receipt,
browser/worker drain evidence, log and last valid partial report are retained. The partial report contains
only the completed first case; it cannot supply the missing race or remaining catalogue evidence.

The reviewed `uint8array` tag extends `tagged-json-v1` with canonical byte contents and an explicit type.
It does not coerce bytes to ordinary arrays or numeric-key objects. Exact Uint8Array instances and
subarray views are supported; extra enumerable properties, Buffer, other typed views and malformed byte
tags refuse. Existing plain tags, product comparisons and product record serialization are unchanged.
The focused probe fails against the earlier encoder and passes after the repair. Its source and both
outputs are retained under `byte-evidence/` through the archive index.

Five new tests include 160 generated catalogue selections (seed 130910) and 160 generated byte-array
comparisons (seed 130911). Selections vary case subsets, mutation options and omission/substitution/
crash-boundary faults. Byte comparisons use native Node equality as the independent oracle across
nested claims, copies, subarray offsets, changed bytes and array/object substitutions. With prior seeds
130901–130909, the 64 non-native controls exercise 1,760 generated validation histories. These are
adapter/evidence controls, not 1,760 additional product histories. Seven native tests are counted separately.

## Reproduction and limits

Use installed repository dependencies and Playwright Chromium. Commands do not install dependencies
or use a personal profile/server. Native commands need permission to launch disposable browsers and
loopback listeners. Choose fresh output directories.

```sh
node scripts/release-validation/check.mjs
node scripts/release-validation/plan.mjs
node --test --test-concurrency=1 test/release-validation/*.test.mjs
node scripts/local-genesis/run.mjs
node scripts/local-genesis/run.mjs --case G03.kill-claim,G06.kill-progress-content,G10.kill-progress-ready,G11.kill-index,G12.abort,G14.missing,G15.auth --output test-results/genesis-provenance-new
node scripts/local-genesis/run.mjs --case G08.kill-counter --no-mutants --output test-results/genesis-counter-new
node scripts/owned-startup/run.mjs --case O11.recheck,O12.replay --output test-results/genesis-startup-new
node scripts/release-validation/execute.mjs --selection infrastructure
```

`execute.mjs --selection local-genesis` uses the same full stage factory as the exercised standalone
command. Its candidate is `genesis` and scope `local-genesis-browser`. Seven catalogue families are
explicitly reviewed; compatibility with another family is not inferred. Case/no-mutant/output options
and JSON/Markdown reports remain. The guide's former custom Chromium instruction now matches the
owner's installed-browser pinning and refusal of overrides.

The seven-case selection is the one called by `scripts/account-local-provenance/run.mjs`. Its two
mutations are missing-completed-state and progress-authentication controls. This standalone regression
does not discharge that wrapper's remaining prerequisites, nested stages or report postconditions.
Default catalogue, exact package leaf and campaign alias resolve; enclosing wrappers remain separate.

The passing full campaign ran before the focused regressions. Selected native runs and ownership
controls could overlap; their timings are not comparative performance measurements. This is one macOS
arm64 host, Chromium 151.0.7922.34, Playwright 1.62.0 and Node 26.8.2. No personal creation, Account
onboarding, additional workspace creation, migration, clear or default-app cutover is performed here.
Native IME/device capacity, OS/power loss, raw rollback/profile clones and independent cryptographic
review remain outside this catalogue's evidence.

Worker deadlines remain 120 seconds for multiple cases and 90 seconds for one case, browser startup
15 seconds and per-group TERM/KILL grace 5 seconds. Worker/browser logs and parsed reports each retain
4 MiB ceilings. Copying/fingerprinting is separate preparation. Browser logs are retained; no claim of
zero background network activity is made. The startup selection is a focused regression, not a new
complete startup campaign. The report failure was repaired without raising deadlines or weakening an oracle.

The manifest has 602 obligations, 427 unresolved. Four catalogue adapters remain (64 cases and 23
mutations). Local clear's 17 cases/five mutations is next, then other adapters and wrappers before P-06
and complete aggregate qualification. Whole-release execution still refuses.

## Artifacts and preservation

The prospective retention ceiling is **1,500,000 bytes**. Retain compressed reports, receipts, logs,
source/dependency/browser identities and summaries; omit disposable profiles, copied dependencies,
source overlays and Vite caches. The passing base closure pins 14,479 source/document/evidence paths,
8,761 installed dependency entries, the Node executable and 339 Chromium bundle entries. The runtime
overlay contains 162 source files, including the shared Account protocol and generated journal seal.

[runs.json](./runs.json) lists attempts, results and timings. [archive-files.json](./archive-files.json)
maps original bytes and decoded/normalized hashes to compressed archives, deduplicating identical
normalized artifacts. Worktree, Playwright cache and disposable fixture prefixes are normalized; other
runtime paths and test-generated IDs retain their recorded meaning. This does not close Q-08's public
evidence policy. Receipt artifact hashes refer to original bytes; the index preserves their correspondence.

`passing-full/inputs.json.gz` is the base closure. Other runs use a reference or delta: remove
`removeFields`, replace `fields`, remove/upsert each `patches` collection, then sort its rows by `path`.
Canonicalize with sorted object keys, compact JSON and a trailing newline. The reconstructed hash must
equal `targetNormalizedSha256`. Original unnormalized reconstruction was also checked before archival.
The failed attempt's delta retains the earlier encoder/test/manifest identities.

[preservation.json](./preservation.json) records 21 unchanged personal package files, 31 unchanged prior
vector files, append-only completed/decision records and the unchanged L-2 suffix. Root `done ` was
not read or changed. No personal app/profile/service/build, recovery material, Account, factor or key
was used. Historical review packets/intake manifests and formal debts remain unchanged. This adapter
is uncommitted; `6348b6c` and earlier unsigned hashes remain preserved for the in-flight review.
