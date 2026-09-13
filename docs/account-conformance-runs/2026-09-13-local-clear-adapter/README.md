# Local-clear catalogue adapter — bounded evidence

Baseline `be5d6a0` (unsigned), plus this phase. No production code, fixture hook, scenario assertion
or catalogue patch changed. This is adapter evidence, not a whole-release or immutable aggregate.

| Run | Result |
| --- | --- |
| Full catalogue | 17 baseline cases, 172 assertions, five intended mutation detections; 53.7-second stage within 120-second deadline. |
| Selected controls | Blocked deletion, deletion refusal/order, keyless factor verification and component guards: four cases/four mutations. |
| Baseline-only | `L08.kill-stage-index`: one case, zero mutations. |
| Genesis regression | `G03.kill-claim,G15.auth`: two cases, one mutation. |
| Infrastructure | 13 stages, 53 exact cases plus two static checks. |
| Final gates | Inventory, manifest, 68 non-native tests, types, lint, format, authority, expected release refusal pass. |
| Native ownership | Seven controls pass: completion, timeout, cancellation, worker/browser death, startup timeout, dependency identity. |
| Options | Custom Chromium and existing output refuse; prior report unchanged and identical to owned artifact. |

The seven generated crash cases independently bind intent, content-delete, stage-journal,
stage-custody, stage-index, index-delete and stage-cleared to L04–L10. The fixture holds native
completion after the durable action, crashes the renderer and resumes authenticated cleanup.
Original scenarios also exercise blocked native deletion, partial/no-op/refused journal removal,
request-success/transaction-abort boundaries, writer exclusion, unknown/stale target refusal and
cancelled deletion holding the permit until settlement. Keyless resumption must authenticate after
content openers have been removed. Other slots remain outside the deletion scope.

Five source mutations require exact changed bytes and their specific baseline-passing/mutant-failing
assertions: `blocked-delete-not-complete`, `delete-refusal-keeps-journal`,
`terminal-has-no-content-openers`, `wrong-factor-cannot-finish-keyless-clear`, and
`component-refuses-before-key-access`. Each anchor occurs once. Tagged reports retain nested values
and undefined distinctly from null. Four adapter tests include 160 generated subsets and faults
(seed 130912); the runner total is 1,920 generated validation histories, not extra product histories.

The initial static gates caught a stale registry evidence pin after the guide's obsolete custom-browser
instructions were corrected. Only the `docs/local-clear.md` SHA-256 in `inherited-local-clear` was
refreshed. Its construction, scope, requirements and historical evidence are unchanged. Initial and
passing gates are retained. The native full run precedes that documentation/pin change; executable
pins were checked before archival. Native checks may overlap; timings do not qualify performance.

Reproduce with installed dependencies and installed Playwright Chromium, using fresh output paths:

```sh
node scripts/local-clear/run.mjs
node scripts/local-clear/run.mjs --case L02.blocked,L03.refused,L13.factor,L14.guards --output test-results/clear-selected-new
node scripts/local-clear/run.mjs --case L08.kill-stage-index --no-mutants --output test-results/clear-index-new
node scripts/local-genesis/run.mjs --case G03.kill-claim,G15.auth --output test-results/clear-genesis-new
node scripts/release-validation/execute.mjs --selection infrastructure
```

Full manifest selection `local-clear` uses the same stage factory. Package leaf and campaign alias
resolve without crediting enclosing wrappers. Worker bounds remain 120 seconds multi-case/90 seconds
single-case, browser startup 15 seconds, TERM/KILL grace five seconds, and each log/report four MiB.
Preparation is separate. All recorded browser/worker groups drained and variant servers closed on
OS-assigned loopback ports. Cooperative process ownership is not OS containment or zero networking.
Only disposable fixtures ran on this macOS arm64 host, Chromium 151.0.7922.34, Playwright 1.62.0,
Node 26.8.2. Account removal, multi-workspace custody, partial genesis cleanup, default-app cutover,
physical power loss, profile rollback and forensic erasure remain outside this evidence.

[runs.json](./runs.json) lists exact selections, counts, identities and timings.
[archive-files.json](./archive-files.json) maps original bytes and decompressed/normalized hashes to
compressed artifacts. Worktree, browser-cache and disposable prefixes are normalized. This does not
close Q-08 publication policy. The prospective archive ceiling is 1,500,000 bytes. Profiles, copied
sources/dependencies and caches are omitted. The base closure pins 14,580 paths, 8,761 dependency
entries and 339 Chromium bundle entries plus Node. `passing-full/inputs.json.gz` supplies the base;
other closures use references/deltas. Apply `removeFields`, replace `fields`, apply `patches` remove/
upsert by path, sort rows by path, and canonicalize with sorted keys/compact JSON/trailing newline;
verify `targetNormalizedSha256`. Original-byte reconstruction and receipt artifact hashes were checked.

[preservation.json](./preservation.json) records 21 unchanged personal files, 31 prior vectors,
append-only completed/decisions and identical L-2. Root `done `, personal browser/profile/service/build,
factors, keys and Account were not used. Historical reviews, formal debts and prior unsigned hashes
remain. The manifest retains 424 unresolved rows; content trim, custody and write-session are next.
