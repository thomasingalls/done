# Release repair and card changes — publication handoff

**2026-11-27. Prepared locally; not published or deployed.** The tested application source is
`913b586423eb6fa8e1a42525381aea471ea0730d`, the head of
[PR #65](https://github.com/thomasingalls/done/pull/65). All 31 commits above
`e9ec1e697fcc5cb0ab63448c7d1eec2d2b0fe065` verify as signed. GitHub still reports those exact
head/base revisions. Preparation lives on `codex/release-repair-publication`; the implementation
branch and PR have not been changed. There are no application or test-source changes in this preparation.

The [evidence packet](./development-evidence/2026-11-27-release-repair-publication/README.md)
retains image identities, checks, failures and limitations. General release qualification remains
paused. The two known removal-screen failures remain failures, not successful or waived checks.

## What is being released

Phases 535–537 change card arrival order, Done for now, and card controls/spacing. Phases 538–562
address the account full-check fallback, reduction progress and capacity, snapshot eligibility,
replay/copy/encoding costs, snapshot races, oversized actions, interrupted verification, required
history installation/folding, scoped service verification reuse, and truthful refusal messages.
Some phases are measurement or test repair only. The implementation seat in
[progress.md](./progress.md) and its linked phase records retain their detailed evidence and debts.

This is a repair candidate for the account affected by the 8 November release. **It has not been
tested on that account, and preparation does not establish that the original symptoms are resolved.**
The unreduced send path and cold opening still grow with history. Existing replay and capacity limits
still apply; a previously admitted oversized service snapshot is not silently skipped or repaired.

## Exact artifacts

Both are native ARM64 distroless images from the same signed source, using the existing production
profile. They are retained as local Docker images and independent, hash-verified OCI archives under
`test-results/release-repair-publication/913b58642/`. Do not rebuild a substitute after merge.

| Role | Local tag | Immutable index |
| --- | --- | --- |
| Candidate | `done-public:913b58642` | `sha256:4c83dc99c55c3d3ae18d7f4faca08379196ba30c9bb74aa8a76aa7eff9c07b8d` |
| Compatible reader, dense writer off | `done-reader-rollback:913b58642` | `sha256:4e2ab7474f848ef360bf91ed5fe27b9619cae001404b0a71e988548dc5d2b81c` |

The displayed application version is **913b5864**. Node remains **24.22.1**, age **1.3.2**, UID **65532**.
The candidate runtime has no shell, npm or test directory. All 2,118 allowlisted source inputs match
the signed Git objects and working source, including executable modes; each frontend contains 137
files with recorded hashes. Every blob in both retained image archives was verified against its name.

Compiled values, with the `VITE_ACCOUNT_` prefix:

| Selection | Both images |
| --- | --- |
| BASELINE_READ, BASELINE_INSTALL, RETENTION | 1 |
| RETENTION_AUTO, RETENTION_RESUME | 1 |
| HISTORY_AUTO | 0 |
| LEDGER | incremental |
| BATCH | coordinated-2000 |
| LEDGER_PROFILE | unset; disabled |

RANGE_RECEIVE is 1 for the candidate and 0 for the compatible reader; that is the only selected flag
difference. Pod environment cannot change these cached application choices. No service schema
migration is required: Account schema 26 and authority schema 1 remain. No initializer, restore,
maintenance Job or browser-storage reset belongs to this rollout.

## Compatibility is the rollback boundary

1. **Phase 542:** a baseline above 4 MiB uses `done/local-baseline-carrier/draft-4`. The approved
   write ceiling is 8 MiB and read ceiling 32 MiB. Smaller baselines keep draft-3. A pre-542 reader
   cannot open draft-4; a compatible reader can open it again without repairing the device.
2. **Phase 550:** even with a smaller carrier, a verified installation not yet folded requires the
   new replay support. An older application can refuse until a compatible build folds it. Folding
   is not guaranteed to finish before a rollback: closing, capacity or new unsent writing can
   prolong the window. The phase's roughly ten-second observation is not a safe rollback deadline.
3. **Preparation identity changes:** retained resumable preparation may restart under the new
   verifier. Changing the compiled profile can also change that identity. This does not authorize
   deletion of accepted writing or its durable carriers.

The reverse commit order in the implementation seat is a **source-reversion guide**, not permission
to deploy the 8 November image to every profile. Neither that image nor its old writer-off tag is a
general compatible rollback after these boundaries.

The newly prepared same-source reader retains phases 542 and 550 and automatic folding. Its tested
purpose is to disable further dense receipt writing while continuing to read existing receipts.
**It does not undo the release repairs or disable draft-4 writing.** A regression in those repairs
requires a forward fix or a separately built/tested selective revert that retains the necessary
readers and folding support. Do not represent the reader image as a rollback of all 31 commits.
Never clear storage, remove a baseline, rewrite receipts or restore server databases to bypass a
client compatibility refusal.

## Checks and remaining failures

- Hosted CI at this exact candidate passed the build, security contracts/vectors, inventory/adapters,
  **359 unit files / 3,746 tests (one existing skip)**, gateway/transport checks, native sync authority,
  source-history regressions and 17 storage compatibility cases. It was cancelled at the 20-minute
  limit during the packaged browser group. The entire CI job is not green; later steps did not run.
- Both Docker builds passed their existing **38 build-stage runtime/gateway/backup/restore/maintenance
  cases**, and both final images passed the disposable two-container restart/ownership/precache smoke.
  These are distinct checks; 38 final-image test cases are not claimed.
- The exact candidate frontend passed the two-device text/undo/offline-reopen journey and all **eight
  card-control checks** across desktop and Pixel 7 emulation. This is not physical-phone evidence.
- The existing same-source image rollback journey passed with the two extracted frontends: dense
  receipts, stale reader, later legacy receipts, exact exports, Undo and offline cold reopening.
  Its backend is candidate source on host Node 24.22.1. This is not predecessor-server rollback.
- A focused native Chromium/WebKit Worker probe wrote a draft-4 baseline above 4 MiB, aborted an
  exchange without deleting history, reduced successfully, reopened cold, refused the complete
  pre-release storage reader without mutation, reopened with the new reader and reduced again.
  It uses the real storage/protocol modules and native IndexedDB with a disposable fixture custody
  context. It does **not** exercise the packaged credential UI, live undo, a physical phone, the
  full 32 MiB ceiling or the phase-550 installation window. Those limits must remain explicit.
- **51 focused service-history cases** pass under Node 24.22.1, covering scoped cache invalidation,
  pruning, refusal handling and snapshot limits. Fresh origin/traceability receipts pass after
  refreshing the old worktree's origin receipt against the extracted candidate frontend.
- **SETUP-CLOSING-STUCK remains:** both exact-frontend removal regressions fail because a setup tab
  stays at “Locking and finishing storage operations…” after another tab removes its workspace.
  Their expected terminal alert is absent. The prior investigation records Back/reload recovery and
  no recreation of removed data; this run stops at the failed alert assertion and does not re-prove
  those later assertions. This is the existing held product defect, not a new compatibility finding.
- The old baseline/checkpoint browser test still fails before reduction: it reads a page global for
  an owner that now lives in a Worker. This preparation reproduces that failure and does not relabel
  it as a pass or silently weaken it. The focused draft-4 probe closes only the stated native-storage
  gap; the broader stale lifecycle suite still needs adaptation.

## Publication sequence

1. Review this evidence and record the release disposition of the known removal-screen defect.
   Commit this documentation signed. Carry it into the application PR or a separate documentation
   PR without rewriting the 31 signed implementation commits. Refresh tree-bound receipts after
   any documentation commit. The operator retains the merge button for PR #65.
2. After merge, verify the merged build inputs against `source.json.gz`. If they differ, stop and
   identify the difference; do not reuse these artifacts under a changed-source claim.
3. Publish the **retained exact images**, reader first, to the existing private GHCR package.
   Proposed tags are `ghcr.io/thomasingalls/done:913b58642-reader` and
   `ghcr.io/thomasingalls/done:913b58642`. Verify remote index/runtime/config digests, private
   visibility and authenticated pull before preparing the infrastructure pin.
4. Refresh `ol-infra` main and prepare its digest-only runtime pin/evidence PR. Preserve service
   identity, PVC, credentials, backup settings, routing/HSTS and service-history automation. Confirm
   current backup health and compatible artifacts. The operator keeps that merge button too.
5. After infrastructure merge, use its current Justfile Flux commands; verify the merged revision,
   image digests, readiness/restarts, retained PVC and identity, backup health, public TLS/assets and
   CSP. This turn made no cluster change and is not that operational verification.
6. Let both actual devices adopt Version 913b5864 through the normal update flow without clearing
   storage. Confirm unlock, two-way edits, Undo/Redo, lock/reopen and offline reopening. Then observe
   the affected account's opening, send/receive and local-maintenance status. A remaining capacity,
   saved-attempt, replay-bound or oversized-snapshot refusal is a separate diagnosis, not permission
   to discard the account's history.

No publication, PR merge, infrastructure change, real-account access or resumed qualification is
implied by the local checks above.
