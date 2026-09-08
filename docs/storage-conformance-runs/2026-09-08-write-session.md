# Write-session phase one — 2026-09-08 execution

**Result:** 13 browser cases pass (54 assertions); all five deliberate regressions are detected;
zero harness or unexpected page errors. Command exit **0**, scoped to the C04 lifecycle component.
This completes the agreed first implementation phase. It does not complete C04's full storage/retirement
composition or pay any L-1/L-3/L-4 debt.

The [complete JSON record](./2026-09-08-write-session.json) contains observations, expected values,
native LockManager snapshots, event schedules, cache/write probes, source hashes, exact mutant patches
and browser details. It preserves the execution's values with repository formatting. The
[component guide](../write-session.md) explains the API and the following phase's integration boundary.

## Execution

```sh
node scripts/write-session/run.mjs --output test-results/write-session/2026-09-08-final
```

**2026-09-08T15:19:47.624Z → 2026-09-08T15:19:59.282Z**. Chromium **151.0.7922.34**, Playwright
**1.62.0**, darwin/arm64; Node **v26.8.1** and Vite
**8.1.5**. The executable is explicitly selected and recorded. The harness ran the working-tree
component over `f87997d94da9c1fe4ebd587849365f6c5240129d`; the report's file hashes identify the exact code and fixture bytes.
The production component SHA-256 is `c9712ca1a9854aa70ddbff2cec74a92f6d46c7fdd931af244f2854d0e9d983c9`.

The runner tested immutable copies of the component and verified that source/harness inputs remained
unchanged during execution. Mutations touched only isolated copies. This component run is separate from
the [earlier three-candidate comparison](./2026-09-08.md); those pinned implementations and results remain
unchanged. The input contract is SC-03 in `docs/storage-contract.md`, also pinned in this report.

## Scenarios

| Case | Exercised boundary | Result |
| --- | --- | --- |
| `C04.shared-scope` | Shared writers coexist; another slot remains independent | pass |
| `C04.freeze-barrier` | Frozen and remaining writers block exclusivity and subsequent initialization | pass |
| `C04.drain-cleanup` | Close invalidates immediately and waits for work and cache cleanup | pass |
| `C04.detached-work` | Native work remains pinned even when its caller forgot to await it | pass |
| `C04.stale-task` | Finished task callbacks cannot write; reacquisition reads fresh state | pass |
| `C04.cancel-queued` | Cancelled queued acquisition never initializes | pass |
| `C04.cancel-initialize` | Cancellation during initialization drains and disposes before release | pass |
| `C04.initialize-error` | Failed initialization cleans partial resources and releases | pass |
| `C04.cleanup-error` | Failed cleanup retains exclusion until actual context death | pass |
| `C04.renderer-death` | Renderer death releases the permit without application disposal | pass |
| `C04.worker-lifetime` | Dedicated workers participate in the same slot barrier | pass |
| `C04.exclusive-error` | Exclusive operation failure releases through the same cleanup boundary | pass |
| `C04.navigation` | Navigation never revives a writable pre-navigation session | pass |

The initializer-error case first loads a real WebCrypto key into the probe cache, then fails; its
assertions verify that the key was loaded and that disposal cleared the reference. The drain case
attempts a synchronous write from an abort handler and a delayed write from an in-flight callback, then
holds disposal pending while another tab requests exclusive access. Neither caller can write after
invalidation, and exclusivity waits through both work and cleanup.

The dedicated-worker case executes the same production module, checks graceful shutdown and then
actual worker termination. Renderer-death cases use CDP `Page.crash`. Freeze/resume uses CDP lifecycle
control with the exclusive actor in another tab. Navigation created a new document on back; **BFCache
restoration was not observed**, so it is not claimed as verified by that case.

## Guard-removal controls

| Deliberate regression | Required failing assertion | Result |
| --- | --- | --- |
| `split-coordination-domain` | `frozen-writer-blocks-exclusive` | detected |
| `ignore-session-invalidation` | `closing-callback-cannot-write` | detected |
| `release-before-drain` | `detached-work-blocks-exclusive` | detected |
| `skip-cache-cleanup` | `cache-cleared-before-exclusive` | detected |
| `reuse-finished-task` | `finished-task-cannot-write` | detected |

Every control starts from a passing unmodified case and fails its named assertion. Harness errors,
unexpected page errors and unrelated assertions do not count as mutation detection. These five controls
cover the named mechanisms, not every possible future integration error.

## Repository validation and limits

The full Vitest suite passed **514 tests in 44 files**, including seven lifecycle API/type/refusal tests.
TypeScript, focused lint and formatting passed, and the production build succeeded. The lifecycle browser
command is included in `pnpm check`. No cryptographic fixtures or algorithms changed in this phase.

Probe generation metadata and cache/writes are synthetic; the fixture does not supply encrypted-store
admission, factor custody, a retirement census or authorized destructive operations. The production
component is exported but has no application caller yet. Current evidence is one Chromium configuration;
complete supported-platform behavior, participating-version cutover and the composed journal/generation
schedules remain open. The next implementation phase is mandatory-factor custody using this lifecycle.
