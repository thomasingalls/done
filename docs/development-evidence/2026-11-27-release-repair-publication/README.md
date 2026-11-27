# Release repair publication preparation

**2026-11-27 · source `913b586423eb6fa8e1a42525381aea471ea0730d` · PR #65.**

The [publication handoff](../../account-release-repair-publication.md) is the human-readable record
of scope, outcomes, known failures and rollout/rollback rules. [evidence.json](./evidence.json)
binds the retained files and local images. [commits.txt](./commits.txt) records the 31 locally
verified signatures. No runtime/test implementation changed, and no image is published or deployed.

## Results

| Check | Result | Scope |
| --- | --- | --- |
| Current hosted CI | 3,746 unit passes, one skip; earlier steps pass; job cancelled during browser step | Exact PR head; not an overall green run |
| ARM64 candidate and compatible reader | Both builds pass, 38 build-stage cases each | Existing production flags, dense writer differs |
| Final-container smoke | Both pass eight checks | Disposable init, ownership, origin, precache, restart and shutdown |
| Card controls | 8 pass | Exact candidate assets, desktop/Android emulation |
| Text admission | 1 pass | Exact candidate assets, two devices, Undo, sync, offline reopening |
| Known removal regressions | 2 fail | Existing closing-screen defect; later assertions not reached |
| Dense-reader rollback | 1 pass | Both exact image frontends; candidate-source host backend |
| Large carrier | Chromium and WebKit pass | Real storage code inside native Workers, fixture custody context |
| Service history | 51 pass | Node 24.22.1; scoped caches, snapshots, pruning and refusals |
| Origin and traceability | Pass after fresh origin receipt | No whole qualification campaign |

The native carrier probe uses 2.25 MiB of synthetic text, yielding a baseline above 4 MiB. Each
operation runs in a fresh Worker, and the cold read also uses a new page. It verifies a real
membership proof in that realm, supplies a fixture custody context, and uses real WebCrypto,
Web Locks and IndexedDB. The old reader bundle comes from the complete `src`/`account-protocol`
graph at main `e9ec1e697`, not a single old module mixed with current code. Package and lockfile
declarations are unchanged between the two revisions. This is native storage evidence, not an
unmodified packaged-app or real-account test. The candidate's full unit suite separately covers
the new bounds and phase-550 replay checks.

## Reproduction inputs

`source.json.gz` enumerates the 2,118 allowlisted build inputs by size/hash and archive mode. The
recording script additionally compares each to its Git blob and executable bit. The build metadata
contains the explicit arguments; the initial timestamp-format rejection is preserved separately
from the successful build. Images and source archives are deliberately not checked in.

The native-probe scripts are retained as `.txt`: `prepare-native-fixture.mjs.txt`,
`carrier-worker.ts.txt`, `carrier-old-worker.ts.txt`, `carrier-native.mjs.txt`. They live outside
the application/build graph. To repeat, place them in a disposable directory, remove `.txt`, and
adjust their two explicit checkout/scratch roots. Generate the fixture with the locked dependencies
and Node 24.22.1. Archive the predecessor's `src`, `account-protocol`, shared anchor fixture,
`vendor-patches`, WASM generated file and package/lockfile under `predecessor/`; resolve the same
locked dependencies there. The old Worker entry differs only in its source root. Run the native
driver with installed Chromium and WebKit. No user's browser profile, writing, keys or tokens are
inputs. Do not install these fixture modules into a shipped application.

`430-writer-{0,1}-assets.json.gz` retain the existing rollback harness's historical input filenames;
their contents identify the new images, not phase 430. Both frontends were extracted from Docker,
not rebuilt by Playwright. The card config keeps the existing assertions, projects and deadlines,
uses one worker and previews those extracted assets on a dedicated port. Its Vite preview emits
“not a git repository” while loading metadata in the source archive; it does not rebuild or replace
the extracted frontend. The rollback and text-admission tests were otherwise unmodified.

## Failed preliminary attempts and limits

- The first container invocation supplied an ISO timestamp where the existing build contract requires
  `YYYY-MM-DD`; it refused before bundling. The corrected invocation uses `2026-11-27`.
- The existing baseline/checkpoint spec fails at an undefined page-side owner handle. Its failure
  remains in `baseline-existing-browser.log.gz`; no reduction was reached.
- One removal run was interrupted when its default `dist` was found absent; it supplies no candidate
  credit. A scratch invocation of `pnpm exec` then refused a symlinked dependency directory rather
  than reinstalling it. The direct installed Playwright CLI ran the actual extracted-image checks.
- Preparing the standalone native probe initially exposed fixture-file URL bundling, package-entry
  and Vite-result-shape mistakes in the new driver. These were corrected before any native result;
  no application implementation was changed. Initial native success and the later predecessor
  refusal extension are distinguished in the retained logs.
- Traceability initially refused the old worktree's October origin receipt. The origin check was
  rerun against the extracted candidate assets, and traceability then passed without editing or
  relabeling receipts.
- The read-only public preflight initially tried an undocumented well-known path (404), then used
  `/__account-setup/config`. It records public identity/headers and asset hashes only; no live build
  version was inferred from an absent literal and no cluster readiness/backup-health claim is made.

No full 32 MiB native run, phone run, affected-account result, phase-550 packaged installation-window
rehearsal, predecessor-server rollback, public registry check or cluster mutation is claimed here.
The known removal failures and stale lifecycle suite remain open. Historical full validation remains
paused; these results do not close its inventory obligations.
