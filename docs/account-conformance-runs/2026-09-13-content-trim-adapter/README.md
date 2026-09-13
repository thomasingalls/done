# Content-trim catalogue adapter — bounded evidence

Baseline `f1926f9` (unsigned), plus this phase. Production code, fixture hooks, scenario assertions and
mutation patches are unchanged. This packet validates the execution adapter, not a release aggregate.

| Run | Result |
| --- | --- |
| Full catalogue | 21 baseline cases, 128 assertions, eight intended mutation detections; 60.3-second stage within 120 seconds. |
| Selected controls | T02 late commit, T04 pending dependencies, T09 post-publication journal, T21 deletion-time journal: four cases/four mutations. |
| Baseline-only | T13 publication crash: one case, zero mutations. |
| Local-clear regression | L11 journal removal and L17 cancellation: two cases, zero mutations. |
| Infrastructure | 14 stages, 57 exact cases plus two static checks. |
| Final gates | Inventory, manifest, 72 non-native tests, types, lint, format, authority and expected release refusal pass. |
| Options | Custom browser and existing output refuse; prior report unchanged and identical to owned artifact. |

The original native cases cover complete disk union; sequence 2 committing after a snapshot covering
1 and 3; competing replacement publications; pending Yjs structs/delete sets; unreadable, changed or
missing content; damaged replacement/journal; reservation, publication and deletion renderer crashes;
request-success/native-abort boundaries; close during crypto; and generation changes. Input custody,
heads, outbound records and journal bytes retain their original coverage assertions.

Eight mutations require their precise source and baseline-passing/mutant-failing assertion. They remove
exact deletion coverage, disk union, byte identity, the deleting census, the publication journal check,
pending-struct retention, transaction completion and the final journal census. The two journal checks
share an assertion name but have distinct cases and source patches; substitution refuses. Candidate
`trim`, scope `content-trim-browser` and patch prefix `src/crdt/` are explicit. Tagged JSON preserves
unavailable receipt values. Four new tests include 160 generated case-subset/mutation/evidence faults
(seed 130913), bringing generated runner histories to 2,080. These are adapter controls, not additional
product histories. The unchanged seven native ownership controls passed in the Local-clear packet.

```sh
node scripts/content-trim/run.mjs
node scripts/content-trim/run.mjs --case T02.late,T04.dependencies,T09.journal,T21.journal-recheck --output test-results/trim-selected-new
node scripts/content-trim/run.mjs --case T13.kill-publication --no-mutants --output test-results/trim-publication-new
node scripts/local-clear/run.mjs --case L11.journal,L17.cancel --no-mutants --output test-results/trim-clear-new
node scripts/release-validation/execute.mjs --selection infrastructure
```

Installed dependencies and Playwright Chromium are required; outputs must be fresh. The manifest
`content-trim` selection uses the same full stage. Default package leaf/campaign alias resolve without
crediting enclosing wrappers. Full native execution precedes selected regressions; selected timings
may overlap and are not comparative measurements. This is macOS arm64, Node 26.8.2, Chromium
151.0.7922.34, Playwright 1.62.0. Worker deadlines remain 120 seconds multi-case/90 seconds single-case,
startup 15 seconds, TERM/KILL grace five seconds and each log/report four MiB. Preparation is separate.
All recorded groups drained; all nine full-run variant servers closed on OS-assigned loopback ports.
Process ownership is cooperative, not OS isolation or a zero-background-networking claim.

[runs.json](./runs.json) records exact selections, identities, counts and timings.
[archive-files.json](./archive-files.json) maps original and normalized hashes to compressed artifacts.
Worktree, browser cache and disposable prefixes are normalized; Q-08 remains open. The prospective
archive ceiling is 1,500,000 bytes, excluding profiles, copied dependencies/sources and caches.
`passing-full/inputs.json.gz` is the base closure. Other inputs use references/deltas: remove
`removeFields`, replace `fields`, apply `patches` remove/upsert by path and sort rows. Canonicalize
with sorted keys, compact JSON and trailing newline; check `targetNormalizedSha256`. Original closure
reconstruction, executable pins, compressed hashes and receipt artifacts were independently checked.

[preservation.json](./preservation.json) records 21 unchanged personal files, 31 prior vectors,
append-only completed/decisions and unchanged L-2. Personal app/profile/service/build, recovery files,
factors, keys, Account and root `done ` were unused. Historical reviews, formal debts and previous
unsigned hashes remain. Generation retirement, Account admission, default scheduling, physical power
loss and platform/workload qualification remain outside this catalogue. The manifest retains 421
unresolved rows; custody and write-session are next. The vector chain, P-06 and aggregate have not run.
