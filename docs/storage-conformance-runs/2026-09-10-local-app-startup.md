# Local app startup — 2026-09-10

Bounded application integration on `f8fdf1f` plus the uncommitted Local startup slice. Final source/build
hashes and raw reports are in [the manifest](./2026-09-10-local-app-startup/manifest.json). The tests use
disposable Chromium profiles and synthetic writing. They never use the author's browser, backup contents
or relay. [Application scope](../local-app-startup.md) and [cutover choice](../selections/row-21-development-cutover.md)
separate this result from actual migration and the remaining conformance obligations.

| Executed evidence | Result |
| --- | --- |
| Full Vitest run | [800 tests, 68 files, all passing](./2026-09-10-local-app-startup/unit.json) |
| Controller tests within that run | Seven tests; includes 100 generated refusal/action histories and 50 close-timing histories, seed 8941 |
| Native React and storage owners | [Four passing cases](./2026-09-10-local-app-startup/native.json): separate saved-code confirmation, cancel without persistence, wrong factor and offline unlock, legacy refusal with source retention, escaped read-only content removed on lock, interrupted genesis resumed with its original identity |
| Final packaged build | [Two passing cases](./2026-09-10-local-app-startup/packaged.json): ordinary editor and staged Local entry both reload offline; the Local entry unlocks without creating the legacy DB |
| Mobile inspection | [390 × 844 unlock screen](./2026-09-10-local-app-startup/locked-mobile.png), visually inspected |

Directed controller testing exposed an early-drain race when a subscriber closed during the working-state
notification. Installing the operation and closing promise before notification keeps native work owned;
the retained test verifies drain waits for the pending inspection. A second directed case checks that locking
during the ready notification detaches the carrier listener. The properties cover the stated UI action and
microtask schedules; they are not a complete native concurrency model.

The first packaged test [failed on offline navigation](./2026-09-10-local-app-startup/packaged-before-precache-fix.json):
Vite had not emitted the HTML assets when the precache plugin enumerated its bundle, so `/local.html` was absent.
Adding that entry exposed [asset failures on both pages](./2026-09-10-local-app-startup/packaged-after-html-fix.json).
The [header diagnostic](./2026-09-10-local-app-startup/packaged-before-vary-fix.json) records cached assets with
`Vary: Origin`; installation fetches and module/style requests did not match. Static-asset lookup now uses
only this build's cache and ignores Vary for the declared assets and shells. No runtime data is cached.
Final offline cases pass with the same preview host. The failure reports precede the final source/build hashes.

Executed commands used the installed binaries directly: TypeScript, Vite build, focused oxlint/oxfmt,
`vitest run --reporter=default --reporter=json`, and Playwright with `playwright.local-startup.config.ts`
(with `LOCAL_STARTUP_PREVIEW=1` for the packaged cases). The package aliases are `storage:app-startup` and,
after a build, `storage:app-startup:packaged`. The full `pnpm check` chain and geometry/platform campaigns
were not rerun. Existing ordinary-entry online/offline behavior has the explicit packaged smoke control.

The ordinary app still uses its earlier editor entry. This result does not establish all editor mutation
coverage, BFCache behavior across browsers, copied-profile resistance, whole-profile residue removal,
platform support, latency, real migration or independent cryptographic review. No debt status or conformance
matrix payment is changed. The next bounded work is admitted editor integration.
