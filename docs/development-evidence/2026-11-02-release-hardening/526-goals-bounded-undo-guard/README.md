# Phase 526 — approved Goals Undo/Redo guard, new frozen version

**Date:** 2026-11-07. The operator accepted 525 outcome(a) and explicitly approved this guard change. No app code changes.

The old frozen spec stays immutable at `/private/tmp/done-goals-gates-478-20261106/stall.spec.ts`, SHA-256 `764f8ca9a5b6b3c650cd54da0f2b79c4949730d00b3a6dd113aceda61d508de4`. The amended copy is `/private/tmp/done-goals-guard-526-20261107/stall.spec.ts`, SHA-256 **`f57e393f748093d2f4fe45de2dce849038adbaa2872c0b17376b50fed13b35ff`**.

The independent line/inverse proof shows only lines90–91 differ. Reversing those exact two replacements recovers the original bytes. All helpers, config, fixture, analyzer and ordinary 510 assets are unchanged. The approved exact diff and both source identities are in526-spec-proof.json and526-approved-guard.patch. This is a versioned experimental-spec artifact; the repository patch records its hash and authority, without rewriting old evidence or adding/removing regression cases.

The new assertions are exactly:

```ts
await expect.poll(() => documentText(p), {timeout: 2500}).not.toBe(beforeUndo);
await expect.poll(() => documentText(p), {timeout: 2500}).toBe(beforeUndo);
```

The timeout reuses the existing 2.5 second peer limit as explicitly directed. No other guard or threshold changes. Each original keyboard chord remains in place. `undoPollElapsedMs` and `redoPollElapsedMs` record driver-clock elapsed milliseconds from immediately before `keyboard.press` through poll success. They include dispatch/polling overhead and have **no threshold**; they are not CPU measurements or additional gates. No new observer or profiler enters the timed runs.

Basis: 522-r2 failed the immediate post-Mod-z read;525reproduced eventual exact Undo/Redo with unchanged immediate reads on all three busy tries and one idle control. The old522-r2failure stays recorded. The operator classifies it as an immediate-read race per 525; the old run’s exact queue state was not saved or retrospectively filled in.

The operator carries 522-r1 desktop and 522-r1 mobile4x into the amended cells because they passed the stricter immediate read and every other step is unchanged. Their new timing fields are **not recorded**, not inferred as zero. The other 21 source-carryover runs and nine native/fairness reruns remain separately qualified.

Four runs were declared before execution, on plain 510: desktopr2, mobile4xr2, desktopr3, mobile4xr3. Case 480 seconds, wrapper 540 seconds, action 30 seconds, original cold 15 seconds and all original diagnostic/host-noise predicates remain. The fresh operator reply was “Ready; keep the host quiet for Goals.” Usual functional stops and the one-retry host-noise rule remain; every failed attempt stays visible. After each run, inspect copies of the profile already saved by the harness with the existing read-only inspector. No original profile is opened by that inspector.

Sequence: 527 runs and endpoint records, then528 Stage 6 amendment and stop. The amendment will keep 522-r2 as the old immediate-read race and add the two requested debts: exact ERR_ABORTED cancellation cause unknown despite the service’s complete accepted/no-refusal ledger, and Undo main-thread cost unmeasured despite525’s 23–241 ms observer gaps. No new attribution experiment, app fix, commit, push, publication or deployment starts here.
