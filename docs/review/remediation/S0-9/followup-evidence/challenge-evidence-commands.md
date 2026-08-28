# `S0-9` independent challenge command/result log

**Standing:** record — speaks of `5923f510fd9ac3c1cd809e9bec352a7f73751492`, the challenged tip; pinned in
`census.json`, so edits land only as dated addenda under a re-pin.

This log records the commands executed by the independent challenger in
`/private/tmp/done-s0-9-evidence`. No repository command was run from another checkout. No network source, other
ref, later object, stash, reflog, or other challenge report was consulted.

## Runner qualification

The checkout's `package.json` pins `pnpm@11.20.0`, and the task states dependencies were installed with that
version. The host `/opt/homebrew/bin/pnpm` was version 11.24.0 but hung without output even for `pnpm --version`; the
attempts were terminated and had no exit code. The available desktop fallback was pnpm 11.19.0 and Node v26.7.0.
All pnpm results below therefore ran the exact repository scripts and preinstalled dependency tree, but with pnpm
11.19.0 rather than the requested 11.20.0 CLI. No install or network access was attempted.

The actual prefix used for pnpm commands was:

```sh
PATH=/Users/thomasingalls/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override:/Users/thomasingalls/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH
```

This runner difference is an environment qualification, not the basis of any repository finding below.

## Checkout identity and information boundary

| Command                                                                      | Exit | Result                                                                                |
| ---------------------------------------------------------------------------- | ---: | ------------------------------------------------------------------------------------- |
| `pwd`                                                                        |    0 | `/private/tmp/done-s0-9-evidence`                                                     |
| `git rev-parse HEAD`                                                         |    0 | `5923f510fd9ac3c1cd809e9bec352a7f73751492`                                            |
| `git status --short` (before reports)                                        |    0 | empty                                                                                 |
| `git merge-base --is-ancestor 9edd9300adebcec3abd2234c946f1dcccdc17eef HEAD` |    0 | proved the reviewed tip is an ancestor before comparison                              |
| `git merge-base --is-ancestor 032d51d HEAD`                                  |    1 | the hash named in `end-state-materiality.md` is not an ancestor; it was not inspected |

Only ancestor-safe history operations were used after the first proof. No prohibited ref/object enumeration was
used.

## Required and directly relevant verification

| Exact command          | Exit | Useful result                                                                                                                                                                                                             |
| ---------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm vectors:check`   |    0 | 16/16 generators current; AAD coverage reported 190 fields and a published isolated negative for each                                                                                                                     |
| `pnpm test`            |    0 | 36 test files passed; 371 tests passed                                                                                                                                                                                    |
| `pnpm trace:check`     |    0 | 85 claims; 27 of 28 current defects have a falsifier; 2 declared owed; generated traceability current                                                                                                                     |
| `pnpm retention:check` |    0 | twelve months agreed across 6 anchors; §14.7 had 5 states and 6 classes; lifecycle words remained disjoint from 3 transition kinds                                                                                        |
| `pnpm status:check`    |    0 | 17 selected, 4 unselected; 5 PRD row-citing sentences checked with no status contradiction                                                                                                                                |
| `pnpm limit:check`     |    0 | 0.0476 µs/byte; 19.6 kB exhausts the budget; 4 extrapolated rows agreed; 16 KiB interim bound below budget and module guard                                                                                               |
| `pnpm wasm:verify`     |    0 | 15 checks, including external KAT, four composition vectors, length boundaries in both directions, and exact key/nonce widths                                                                                             |
| `pnpm wasm:stale`      |    0 | generated module matched the crate; raw WASM 6,465 bytes                                                                                                                                                                  |
| `pnpm build`           |    0 | TypeScript/Vite build passed; JS output 306.3 kB gzip under 350 kB budget; origin scan covered 6 built files and found only allowlisted `w3.org` namespace identifiers                                                    |
| `pnpm typecheck`       |    0 | TypeScript project check passed                                                                                                                                                                                           |
| `pnpm review:check`    |    0 | historical reviewed lineage contained 35 commits from `c611666` to `9edd930`, 0 dirty; 37 validated findings and 16 completed work items; it explicitly reported current checkout `5923f51` outside that historical range |

### Exact destructive-boundary counterexample

Command:

```sh
pnpm exec vitest run test/hostedRetention.test.ts \
  -t 'lets nothing survive the deadline, including a retirement whose handoff never came'
```

Result: exit 0; 1 selected test passed and 22 tests in the file were skipped by the title filter. The passing test
constructs a retirement with zero handoffs, enforces the deadline, expects `present.size === 0` and
`state === 'cleared'`, and separately expects `handoffComplete === false`. This is the executable reproduction for
`S0-9-E1`, not a passing safety result.

## Normal gate and hygiene commands

| Exact command | Exit | Useful result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`   |    1 | at least 15 lint errors. Repair-owned examples: `scripts/generate-head-discovery-vectors.mjs:496:32` (`no-shadow`), `scripts/check-selection-status.mjs:139:3` (`no-useless-spread`), `test/outboundSpool.test.ts:383:11` (`no-underscore-dangle`), `test/generationApply.test.ts:174,176` (conditional expectations), `scripts/generate-device-lock-vectors.mjs:191:27` (`no-misused-spread`), and `scripts/generate-checkpoint-vectors.mjs:648,678` (unnecessary boolean comparisons). Other errors were in unrelated predecessor paths. |
| `pnpm format` |    1 | formatting differences reported in 58 files, including remediation documents. `pnpm format:fix` was never run.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm check`  |    1 | `typecheck` passed, then `lint` failed; because the script uses `&&`, format, vectors, retention/status/limit/trace checks, WASM verification, Vitest, and geometry did not execute in this gate run                                                                                                                                                                                                                                                                                                                                       |

The known pre-existing lint/format failure is not treated as a repaired-construction failure. The facts used by the
challenge are narrower: (1) traceability's textual reachability algorithm reports downstream artifacts live even
when the actual `&&` gate does not reach them, and (2) some current lint errors are in files introduced or changed by
the remediation.

## Read-only source/document traces used for findings

| Command or query                                                                       |                              Exit | Result used                                                                                               |
| -------------------------------------------------------------------------------------- | --------------------------------: | --------------------------------------------------------------------------------------------------------- |
| `nl -ba docs/review/remediation/S0-6/A-schemas.md \| sed -n '85,165p'`                 |                                 0 | lines 114-120: only durable `TerminalHandoff` authorizes deletion; lost acknowledgement retains bytes     |
| `nl -ba docs/review/remediation/S0-7/A-schemas.md \| sed -n '100,150p'`                |                                 0 | lines 117-127: deadline is a retirement ceiling and lost acknowledgement retains only until it            |
| `nl -ba test/hostedRetention.test.ts \| sed -n '245,300p'`                             |                                 0 | lines 262-286: after deadline, retirement deletion bypasses handoff                                       |
| `nl -ba test/hostedRetention.test.ts \| sed -n '365,460p'`                             |                                 0 | lines 385 and 441-449: block is tagged to the safe-survivor finding while asserting zero-handoff deletion |
| `nl -ba scripts/generate-package-vectors.mjs \| sed -n '420,445p'`                     |                                 0 | deletion artifact lists five classes                                                                      |
| `nl -ba scripts/generate-package-vectors.mjs \| sed -n '1010,1035p'`                   |                                 0 | package deletion authority refuses unknown classes and missing handoff                                    |
| `nl -ba docs/review/remediation/corrected-end-state.md \| sed -n '1,325p'`             |                                 0 | required artifact retains pre-decision branches and rejected two-attempt refusal cap                      |
| `nl -ba docs/TRD.md \| sed -n '3360,3480p'`                                            |                                 0 | §15 claims winning current authority, while row 3 calls allocator/count open                              |
| `nl -ba docs/TRD.md \| sed -n '660,705p'`                                              |                                 0 | §6.1 defines `next_seq`, `reserved[gen]`, and covered-set trim                                            |
| `nl -ba docs/review/remediation/decisions/P-3-write-admission.md \| sed -n '110,180p'` |                                 0 | decision still claims `next_seq` is the trim watermark/falsifier                                          |
| `nl -ba docs/review/remediation/S0-3/README.md \| sed -n '45,82p'`                     |                                 0 | mutation record says watermark claim was non-load-bearing and retired                                     |
| `nl -ba scripts/check-selection-status.mjs \| sed -n '1,190p'`                         |                                 0 | checker only validates register membership/count and explicit PRD row-status sentences                    |
| `nl -ba scripts/check-traceability.mjs \| sed -n '300,385p'`                           |                                 0 | gate liveness is recursive script-text concatenation plus substring inclusion                             |
| `nl -ba package.json \| sed -n '1,95p'`                                                |                                 0 | `check` orders failing lint/format before all evidence; `wasm:stale` is not in `check` or `build`         |
| `sed -n '93,220p' docs/review/remediation/traceability.md`                             |                                 0 | enumerated the ten sole-falsifier findings for targeted inspection                                        |
| `rg -n 'falsifies:                                                                     | falsifies-rest-at:' scripts test` | 0                                                                                                         | reconciled claim locations with executable carriers |
| `sed -n '1,220p' docs/review/analysis/adversarial-scenarios.md`                        |                                 0 | enumerated `P-01`–`P-11`, `A-01`–`A-07`, and `C-01`–`C-11` for replay                                     |

Pipes in this table are rendered as the actual read-only query shape. They were used only for bounded display of
files in the assigned worktree.

## End state

After writing only the two requested report files, the expected status is:

```text
?? docs/review/remediation/S0-9/
```

No tracked source, test, vector, decision, requirement, or selection file was mutated. No restoration command was
needed, and neither `git checkout --` nor `pnpm format:fix` was used.
