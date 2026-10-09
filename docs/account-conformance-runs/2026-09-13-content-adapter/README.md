# Content catalogue adapter — bounded evidence

Baseline `f14c68f` (unsigned) plus the content adapter changes. This packet covers the content
catalogue's execution/report/process adapter, not a release aggregate or new production storage
behavior. Exact runtime sources, dependency bytes and Chromium bundle identity are pinned. The
checkpoint and this evidence archive were written around/after execution; no single immutable
whole-release revision is claimed. All executable/test input pins from the repaired full run were
checked against the final working files before archival.

## Recorded results

| Selection | Result | Stage time | Whole command time |
| --- | --- | ---: | ---: |
| Repaired full standalone content | 13 baselines pass; all 5 mutations detected at their named assertions; both groups drained | 47.3 s | 70.4 s |
| Repaired manifest unreadable-load control | 1 baseline pass; 1 mutation detected; both groups drained | 16.3 s | 39.9 s |
| Repaired standalone selected baseline | 1 baseline pass; exactly 0 mutations; explicit output/report files preserved | 10.8 s | 34.7 s |
| Disposable infrastructure | 6 stages; 23 exact cases pass plus 2 static checks; all groups drained | per-stage times in runs.json | 41.0 s |
| Native Vite/Chromium ownership controls | all 6 controls pass, including expected failure receipts and listener/process cleanup | 14.9 s for test command | separate control run |
| Final gates | all 8 pass; 35 non-native tests, 640 generated histories, inventory, manifest, types, lint, format, authority and expected release refusal | exact times in gate summary | separate gate run |

The 35 non-native tests include 160 new generated omissions/false-detection histories (seed 130904)
and the prior 480 generated DAG/catalogue/report controls (130901–130903). Directed controls refuse
stale nonces, omitted baseline assertions, missing/duplicate cases, unrelated failing assertions,
surviving mutants, wrong patch/source hashes, duplicate assertions, changed server variants and
unclosed servers. These test the adapter's ability to detect incomplete or contradictory evidence;
they are not another 640 product-level storage histories.

The six native controls cover normal completion, worker deadline, cancellation after a real page
loads, worker death, unexpected browser death and browser startup deadline. Five intentionally
produce failed stage receipts. Controls require explicit process-group disappearance, no matching
disposable-profile processes and connection refusal on the opened server/CDP ports. The final
fixtures use real Vite, occupy its configured port and require OS-assigned binding elsewhere.

The first three campaign attempts passed their assertions, but their URLs exposed Vite's high-level
port-zero fallback to 5173. They are retained under `initial-*`; they do not establish the repaired
port contract. The first six ownership controls used a simple HTTP server. The final controls use
Vite and the occupied-port check. No mutation assertion or production content implementation changed.

The final full report records six distinct loopback server ports, each closed. Browser/CDP ownership
is cooperative POSIX process-group management, not an OS sandbox. Chromium's background error logs
are retained; no claim of zero browser background networking is made. Existing content-carrier
limits (including platform, raw profile rollback and lack of whole-store integration) still apply.

## Reproduction

Use the repository's installed dependencies and Playwright Chromium; these commands do not install
dependencies or use personal profiles. Run from the worktree, with permission for disposable browser
processes and loopback listeners. New outputs are required; existing output paths refuse.

```sh
node scripts/release-validation/check.mjs
node scripts/release-validation/plan.mjs
node --test --test-concurrency=1 test/release-validation/*.test.mjs
node scripts/content/run.mjs
node scripts/release-validation/execute.mjs --selection content-control
node scripts/content/run.mjs --case C09.unreadable-load --no-mutants --output test-results/content-selected-new
node scripts/release-validation/execute.mjs --selection infrastructure
```

`execute.mjs --selection content` uses the same full stage factory as the exercised standalone
command. `plan.mjs --require-complete` and release execution must still refuse: the manifest contains
596 obligations with 445 unresolved rows. Ten other catalogues (150 cases/49 mutants), general test
adapters and wrapper selections/postconditions remain. This phase gives none of them execution credit.

## Artifact and preservation policy

The prospective ceiling is **1,500,000 bytes** for this packet. Store compressed detailed reports,
receipts, logs, input identities and small summaries; omit disposable profiles, full source overlays,
dependency copies and Vite caches. The full input snapshot pins 13,943 source/document/evidence paths,
8,761 installed dependency entries, Node 26.8.2 on macOS arm64 and 339 Chromium bundle entries.

[runs.json](./runs.json) is the readable run index. [archive-files.json](./archive-files.json) maps
each original artifact to its compressed archive, original/decompressed hashes and normalized hashes.
Identical normalized artifacts share one archive. Worktree, Playwright cache and disposable fixture
prefixes are normalized; other runtime paths and test-generated IDs retain their recorded meaning.
This local evidence packet is not a completed public-redaction policy.

`passing-full/inputs.json.gz` is the base input closure. Other runs use either a reference or a delta:
remove `removeFields`, replace `fields`, remove/upsert rows in each named `patches` collection and
sort those arrays by `path`. Canonicalize with sorted object keys, compact JSON and a trailing newline.
The reconstructed normalized document must match `targetNormalizedSha256`. Reconstruction of every
original unnormalized input was also checked before archiving. Runtime result hashes in receipts
refer to original artifacts; the archive index preserves that correspondence after normalization.

[preservation.json](./preservation.json) records unchanged 21 personal package files, 31 prior vector
files, append-only completed/decision records and the exact L-2 suffix. Root `done ` was not read or
changed. No personal app/profile/service/build, recovery material, Account, factor or key was used.
Prior review packets/intake manifests and formal debts remain untouched. The content phase is
uncommitted; `f14c68f` and earlier unsigned hashes are preserved for the in-flight review.
