# Local application editor — 2026-09-10

Integration on startup commit `46d9cd6` plus this uncommitted editor slice. [Scope](../local-app-editor.md)
defines the mutation and lifecycle boundary. [The manifest](./2026-09-10-local-app-editor/manifest.json)
pins final source/build bytes and retained reports. All writing and browser profiles in these checks are
synthetic; no personal browser, backup content or relay was used.

| Executed evidence | Result |
| --- | --- |
| Full Vitest | [804 tests in 69 files, all passing](./2026-09-10-local-app-editor/unit.json) |
| Whole-line deletion property | 1,000 cases, seed 8941; independent oracle joins unselected original lines, including empty and Unicode lines |
| Existing startup controller properties | 150 histories, seed 8941, plus the added editor-before-owner teardown and recoverable-blockage case |
| Native application | [Eight passing cases](./2026-09-10-local-app-editor/native.json), including the four earlier startup cases; compose retry, editor discard/lock, Goals copy/remove/undo, and 20 generated compose/undo/redo histories with cold reopen |
| Existing geometry/workflow suite | [84 passing, 10 existing device-specific skips](./2026-09-10-local-app-editor/geometry.json); real enrollment/unlock replaces legacy implicit open |
| Packaged offline application | [Two passing cases](./2026-09-10-local-app-editor/packaged.json): both `/` and `/local.html` enroll, compose, lock, reload offline and unlock with content retained and no legacy DB |
| Native admitted editor campaign | [E01–E12 pass; three injected faults rejected](./2026-09-10-local-app-editor/editor-admission.json) |
| Native admitted workspace campaign | [W01–W10 pass; four injected faults rejected](./2026-09-10-local-app-editor/workspace-admission.json) |
| Native pending projection campaign | [12 passing cases](./2026-09-10-local-app-editor/pending-projection.json), including 100 generated histories, seed 8941 |
| Final visual inspection | [Desktop, 1280 × 900](./2026-09-10-local-app-editor/editor-desktop.png) and [mobile, 390 × 844](./2026-09-10-local-app-editor/editor-mobile.png) |

## Defects and test corrections retained

The line-removal property found an implementation defect after 18 cases and shrank it five times to
`[['', '', ''], [2, 1]]`, seed 8941, path `17:2:2:2:3:2`. Deleting adjacent trailing lines left an extra
blank line. Treating a contiguous terminal selection as one group and consuming its preceding separator
repairs the mismatch. [Before](./2026-09-10-local-app-editor/master-lines-before-fix.log) and
[after](./2026-09-10-local-app-editor/master-lines-after-fix.log) are retained with the permanent property.

A native Goals case [failed after copy](./2026-09-10-local-app-editor/native-before-selection-fix.json):
an accepted command that changed cards but not master text reset CodeMirror to the last submitted text
caret, losing the current selected lines before a separate Remove. Projection now preserves the live
selection when this editor's text is unchanged. Text-changing projection still uses the accepted surface
selection. The [repaired directed case](./2026-09-10-local-app-editor/goals-after-selection-fix.log), final
application suite and existing native editor campaign pass. This does not claim new general remote-selection
mapping behavior.

The first geometry run [caught two missing actor-display assertions](./2026-09-10-local-app-editor/geometry-initial.json).
The accepted actor name and swatch are restored. An earlier native run
[missed its injected database boundary](./2026-09-10-local-app-editor/native-before-harness-fix.json):
the fixture patched `put` while content uses `add`. The repaired case injects at `add` and asserts both
journal and database refusal counters are positive. It also replaces an invalid Playwright key spelling
with portable navigation keys. An initial device-label test incorrectly expected metadata in content undo;
its [failure](./2026-09-10-local-app-editor/device-label-test-before-contract-fix.log) is retained and the
test now pins the existing metadata exclusion. These fixture corrections are not protocol defects.

The mobile screenshot was recaptured in a fresh mobile context after panel-bound assertions; an immediate
desktop-to-mobile capture had sampled the resize animation. The existing geometry suite polls the responsive
panel transition. [Measured mobile bounds](./2026-09-10-local-app-editor/mobile-inspection.json) place Today
inside the viewport and the closed Menu and Goals outside it.

## Execution and limits

The application history generator samples 20 inputs with fast-check, seed 8941, and saves them in the native
report attachment. Each history has its own browser context and a separate compose/undo/redo ledger, checked
after each action and cold reopen. This native test does not shrink and does not generate every UI command.
The unit line-removal property does shrink. Existing component reports retain their own generated inputs,
source pins, injected faults and stated limits; the pending-projection rerun is the default campaign, not
the complete historical mutation matrix.

Executed installed binaries: TypeScript, focused oxlint/oxfmt, Vite production build, full Vitest with JSON
reporting, Playwright geometry and `playwright.local-startup.config.ts` (also `LOCAL_STARTUP_PREVIEW=1`),
and the native `scripts/editor-admission/run.mjs`, `scripts/workspace-admission/run.mjs` and
`scripts/pending-projection/run.mjs`. The package aliases remain `test:geometry`, `storage:app-startup`,
`storage:app-startup:packaged`, `storage:editor`, `storage:workspace` and `storage:projection`.
The final build is within the 350 kB gzip initial-JS limit at 326.6 kB per entry and passes origin isolation.

The Local no-relay UI test replaces the old entry's relay-settings UI test because that transport is no
longer attached. Legacy sync core tests remain in the unit suite; this result does not establish Account or
encrypted transport integration. The complete `pnpm check` chain, wider platform/latency campaigns,
whole-browser/power-loss recovery, copied-profile resistance, whole-profile residue, real migration and
independent review were not performed here. No debt status or conformance matrix payment changed.

The final source manifest follows formatting and a comment-only correction to LocalApp's description;
that comment correction does not alter the tested runtime. Earlier failure reports describe preceding
implementations/fixtures, not the final source hashes. The main-entry switch is built and tested locally;
it has not replaced the author's personal installation. Next is private import/cutover rehearsal.
