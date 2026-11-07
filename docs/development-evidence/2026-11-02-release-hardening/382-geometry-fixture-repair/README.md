# Approved geometry fixture repair — phase382

Both complete geometry campaigns pass228cases with the same32existing skips: complete signed-base89b11fe2production sources with identical current test-only fixtures, then the hardened app. The repaired native-focus test also passes both projects on the ordinary app. The actual regression control removes exactly the Goals220ms SNAP_MS timeout and focuses immediately when opening; both projects fail specifically at the new native-touchend false-focus assertion, observing true. No data-goals fallback is needed. [All reports, raw observations, source identity and host/display records](./evidence.json).

An independent Babel AST review reconstructs the mutated source by locating the actual timer assignment/callback, not by reusing the transform's text anchor; its hashes match the tested build. It verifies every old cut expectation remains, every other workflow expectation remains, the one approved focus observation is replaced, and the native fault helper is byte-exact. App/protocol/service/script/WASM inputs stay exact to381. The ordinary app never imports the two test-control configs; its source timer is unchanged.

The test-observed seed-drain wall times, including browser IPC and poll intervals, are recorded for every cut-fault run:

| Project/case | Base ms | Hardened ms |
| --- | ---: | ---: |
| desktop — Copy before refusal | 426.3 | 576.0 |
| desktop — Pending input blocks Cut | 200.0 | 371.4 |
| android — Copy before refusal | 120.6 | 635.4 |
| android — Pending input blocks Cut | 457.9 | 127.9 |

Every initial observation had one pending journal entry and ended at zero. Every one of the eight cases then records one Window journal refusal, one Worker content-write attempt, and confirmation that the original native-abort assertion passed. The original clipboard, no-premature-deletion, pending-input refusal, Retry, discard and cold persistence checks pass. Neither fault is removed: quota refusal must still exercise the native fallback. These are individually visible precondition waits, not isolated flush timings or a causal performance comparison. The old381fault producer was not logged, so its seed-flush attribution stays an inference.

The permanent regression recipe is `pnpm exec playwright test --config playwright.geometry-focus-control.config.ts test/geometry/workflow.spec.ts --grep 'Goals swipes own the editor surface'`. It should fail both projects at “Goals focus at native touchend” with true; generic build, lifecycle, timeout or unrelated errors do not establish sensitivity. The control's build manifest is test-only and proves one actual module mutation. Normal geometry remains `pnpm test:geometry`, with the original browser configuration, parallelism, waits and deadlines apart from the specifically approved fixture precondition/observation change.

Types, four-file scoped lint and formatting pass. Crypto-source inventory still reports512sources/200labels/36groups/15manual. Planning drift was independently reviewed: exactly two new test-control config inputs and two changed test hashes; no other disposition, count, construction, limit or exclusion differs. Record/final check pass:688test files,682required,6old exclusions,99constructions. No denominator or release block is relaxed.

All native runs retain caffeinate -d, actual display power and5s external host samples; all samples are on and no within-run power-log off event appears. Construction formatting and parser-import errors are retained. Optional root pnpm lint remains red only on three byte-unchanged archived study/reproduction paths; it is outside pnpm check and those immutable artifacts are left alone. Changed-file lint passes. The earlier381red full run and diagnostic passes stay immutable.

This closes the approved fixture repair. Next run the remaining42root commands on the frozen patch sequence, preserving every original inner deadline and stop rule. This is a segmented functional checkpoint, not a final monolithic check or Stage5/performance/security-qualification/release result. Stage3.2 floor installation/readers/writer and rollback artifacts remain unfinished. No commit, push, merge or deployment.
