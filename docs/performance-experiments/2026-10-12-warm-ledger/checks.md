# Focused checks

All completed on 2026-10-12. No generalized qualification campaign was run.

| Check | Result |
| --- | --- |
| `vitest run test/warmContent.test.ts test/contentInterruptedReuse.test.ts test/verifiedRecords.test.ts test/contentCompaction.test.ts test/incrementalLedger.test.ts` | 5 files, 42 tests passed |
| Final matched realistic CPU-4x sessions | 6/6 passed; 120-key undo/redo and offline reopening in each |
| Packaged `text-admission.spec.ts`, ordinary default build | Passed; two-device editing/delivery, undo across received edits, offline journal/reopen |
| Native exclusive warm-load/resume check | Passed; unchanged load no census, visibility/resume/pageshow each forces full read |
| Native submit/compaction/cold-replay check | Passed |
| Native reference-audit mismatch control (`ACCOUNT_LEDGER_AUDIT=every`) | Passed; mismatch refuses owner and cold replay preserves writing |
| Native concurrent-reader serialization check | Passed |
| Native submit/compaction/cold replay with `ACCOUNT_LEDGER_MODE=reference` | Passed; rollback path retained |
| TypeScript, pinned Yjs check, production Vite build, JS budget, origin isolation | Passed; initial JS 136.7 kB gzip / 350 kB budget |
| Scoped oxlint/oxfmt and `git diff --check` | Passed |

The native command was:

```sh
ACCOUNT_LEDGER_AUDIT=every node --test --test-concurrency=1 \
  --test-name-pattern='exclusive warm loads|one owner advances|reference audit disagreement|concurrent Account readers' \
  test/account-sync/native.test.mjs
```

The packaged command was:

```sh
node node_modules/@playwright/test/cli.js test \
  --config playwright.packaged-account.config.ts test/packaged-account/text-admission.spec.ts
```

The package-manager launcher `pnpm build` stalled without output before starting a child build.
That exact process was terminated. The unchanged build script's five commands were then run
sequentially through installed Node binaries, all successfully; see `production-build-direct.log`
and the final `production-build-final.log`.
This is a launcher limitation, not a claimed passing `pnpm build` invocation. No dependencies or
package-manager configuration were changed.

The first baseline probe build also needed the repository's required build-identity environment
pair; omitting the ad-hoc override used its normal Git-derived identity and built successfully.
The runtime comparisons include no failed typing run. Pilot and preliminary comparisons remain
in the archive separately, rather than being mixed with the final paired result.

Final review tightened the audit frontier: capture all rows at the start of each pass, rather than
reuse the previous pass's endpoint. Its fixed endpoint still excludes later appends. The 42 units,
four native checks, production build and packaged two-device journey were rerun successfully
after that change; `native-and-packaged-final.log` records the final browser checks.

The final source enables the warm algorithm by default for exclusive v9 owners only.
`VITE_ACCOUNT_WARM_LOADS=0` restores the physical census; `VITE_ACCOUNT_LEDGER=reference` restores
that path too. The ordinary packaged and native checks exercise the default selection. No image
has been built for publication, pushed or deployed by this slice.
