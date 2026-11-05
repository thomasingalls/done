# Stage 1 checkpoint — phase 338

Y is finished. **The Stage 1 full checkpoint is not green; further hardening is held.**
This is canonical-hardening evidence, not a new lab phase, release qualification or release preparation.
No Stage 2 work, Stage 5 journey, signing, push, merge or deployment followed this checkpoint.

## Passing evidence

- Patches 335–337 remain immutable in `/private/tmp/done-release-hardening-20261102/PATCHES.json`.
- Final strict types and 53 focused cases/7 files pass (337 evidence).
- Full Vitest on the self-contained locked dependency tree: **287 files, 2,880 passed, one existing skip, 2,881 total**. The earlier linked-tree run reaches the same passing population after one capacity-message fixture correction. Both attempts remain.
- `test/localRetentionProgress.test.ts` and `test/automaticLocalRetention.test.ts` pass without edits; each still equals signed HEAD. The diagnostic counter stays `interruptions`; the new metadata map is `interruptedOutcomes`. The new journal fixture has complete `ObservedEntry` fields.
- All 12 pre-unit contract/type/vector/WASM commands pass. All four native storage lifecycle controls pass. The next 25 full-check commands pass, through `storage:private-migration`.
- The reviewed source census is current: 507 sources, 199 unchanged labels, 36 groups. The two construction changes are source line locations only. All 78 specified/16 open constructions and existing blockers remain.
- The reviewed planning graph adds exactly four required tests; no prior test disposition changes. Their execution rows remain blocked pending denominator/ownership-adapter review. Inventory and its ten controls pass. This grants no aggregate execution credit.

`checkpoint.json` records the outcome. `evidence.json` binds 116 retained log/report/input references to their exact archived bytes. Identical files share a hash-addressed object; all original files remain at their recorded locations. Inputs are never regenerated to conceal an earlier failure.

## Browser checkpoint: 10 passed, five failed

`pnpm storage:app-startup` is the first application command that fails. It runs the retained explicit-code/development compatibility fixture, not a release-profile artifact or a Stage 5 journey.

1. Three editor cases expect **“Input is waiting for storage.”** The log observes **“Input is waiting to be saved.”** The failing expectations are stale. Later fault-delivery, pending-writing and durability assertions were not reached; their behavior is not established by those failures. No editor test was changed.
2. `test/local-app/startup.spec.ts:40`, failing at line 70: after wrong-code refusal, the test sets the development context offline and submits the correct code. The ready-shell assertion times out at its existing **5,000 ms**. The failure snapshot shows **“Opening your workspace…” / “Checking encrypted storage.”** It does not show a refusal message or a writing archive. Whether this is a missing fixture prerequisite, slow transition or an app defect is unresolved. No data loss, eventual outcome or causal connection to Y is established. This is not a measured failure of the Stage 5 15-second cold gate, which has not run.
3. `test/local-app/startup.spec.ts:161`, failing at line 192: the interrupted-creation control expects `unavailable`, sees `working`, then no matching startup gate. Its abort-receipt assertion is after the failed wait and was not reached. Fault delivery is unconfirmed; this is not classified as a proven accepted negative control.

The unresolved offline-opening result is held under the operator’s hardened-app/cold-opening stop rule. No further app run, longer deadline, fixture workaround, guard change or Stage 2 implementation was attempted. The next bounded task must distinguish the development fixture’s prerequisites from the actual opening behavior. The remaining geometry, packaged startup, upgrades, compatibility, trace and Account commands are unrun (43 commands after the failed app-startup command).

## Retained failures and environment repairs

- Launcher attempts 1–4 fail before tests: global pnpm waits for version management, a cached-shim probe times out, the non-executable cache shim refuses launch, then automatic dependency refresh aborts without a TTY. Use a local shell shim invoking exact pnpm 11.20.0 under Node 24.18.0. No dependency deletion/reinstall in the linked project was allowed; its 8 KiB project cache is retained outside the checkout.
- Attempt 5 reaches the stale authority census. Review all ten changed/new runtime source files and classification before recording; only the intended changes and two label-line movements exist.
- Full-unit attempt 1: 2,879 passed, one failed, one skipped. The sole failure expects the old snapshot-only capacity message. Change only that expected phrase in `test/localHistoryMaintenance.test.tsx`; keep every assertion.
- Attempt 6: full units pass, then localhost listening is refused by the sandbox before native app execution. Repeat with loopback/browser permission; no guard is changed.
- First native suffix: the identity guard correctly rejects dependencies linked outside this checkout. Preserve the linked tree; prepare an **offline, frozen-lockfile, ignore-scripts, strict-peer** install in a disposable directory and materialize it locally. The unchanged identity guard accepts 9,895 installed paths. Other worktrees remain untouched.
- Attempt 7: full units and native lifecycle pass. The write-session adapter rejects `CHROMIUM_PATH`; use its required installed Playwright browser without the override, preserving its refusal and deadline. The remaining command population is executed sequentially until the browser checkpoint above.

Every attempt has its actual child exit captured in Python, avoiding the former zsh reserved-variable problem. Internal timing fields emitted by legacy functional campaigns are not Stage 5 performance evidence. No full `pnpm check` success or single-revision aggregate qualification is claimed: the command population is partially covered by explicitly identified prefix/suffix logs, then stopped.
