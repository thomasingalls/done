# Post-release repairs for sync setup and local history

The candidate for [PR #66](https://github.com/thomasingalls/done/pull/66) is signed source `dc6003f2d930e9ca82ca61e70ac113e7aeca5880` on production main `5d0705fc2`. The browser displays **dc6003f2**. This packet records release preparation on 2026-11-27. The public rollout of the preceding version is recorded in [ol-infra PR #76](https://codeberg.org/oxidationlabs/ol-infra/pulls/76).

## Changes and operator review

- Removing this device's data in another tab ends a waiting sync setup. The new notice for review reads “Sync setup stopped because another tab began removing this device’s data. Reload this tab to continue.” A setup that misses the notice still checks durable state when its delayed registration reply arrives. The related enrollment and recovery screens have a separate open issue, CEREMONY-STALE-AFTER-REMOVAL. [Phase 563](../2026-11-27-post-release-repair/563-setup-closing-notice/README.md)
- An online reduction can extend the time it gets to reach its first durable save. Offline work sizes its slices from the device’s measured setup time. **If an attempt hangs before its first save, routine polls, or sends on a device that requires full ledger checks, can wait until the workspace reopens.** Repeated interruptions, compaction that invalidates saved progress, and the existing capacity limits can still prevent completion. Review the [bounds table](../2026-11-27-post-release-repair/564-reduction-slice-windows/README.md#fixed-bounds-on-the-reduction-path).
- The History panel distinguishes checking, building and saving. It reports saved work and repeated work, and gives time estimates when it has measured enough activity. Early estimates were about five times too optimistic in one replay. Deep-history evidence comes from synthetic fixtures. Reduction completion and the panel’s accuracy on the affected devices remain field checks. [Phase 565](../2026-11-27-post-release-repair/565-reduction-progress-display/README.md)

## Exact local images

| Role | Local tag | ARM64 image index |
| --- | --- | --- |
| Candidate | `done-public:dc6003f2d` | `sha256:b1643edb173bf2219cd56543725b7d0a95237ffa8cba246fbc42cbd0ec2ae255` |
| Compatible reader | `done-reader-rollback:dc6003f2d` | `sha256:0b037dd1ae4200b0873548493716c22876c2ae96adf2c72ed585692af54bbd75` |

Both images use the current production settings and Node 24.22.1. The candidate writes dense receipts and the reader disables their creation. The release worktree retains the two OCI archives under `test-results/release-repair-publication/dc6003f2d/`. The [artifact record](images.json) identifies the archives, runtime manifests and configs. All 2,121 allowlisted files and executable bits match the signed source. Every blob in each archive passed its digest check.

## Checks

- The full unit suite on Node 24.22.1 passed all 361 files, with 3,810 cases passing and one existing skip (499 seconds). [Unit output](unit.log.gz)

- Each image passed the 38 build-stage service and operations cases and the eight final-container checks, including storage ownership, restart, public-origin handling and precached assets.
- Against the extracted candidate frontend, all four removal cases and the two-device editing, Undo and journal-only offline reopening journey passed. Both prompt removal and delayed registration after a missed notice were exercised, including Start fresh.
- The dense-to-legacy receipt journey passed twice, once with the candidate’s reader and once with the retained `913b58642-reader` frontend. Each run checked exports, stale tabs, subsequent writes, Undo and offline cold reopening. Both used the candidate-source service and synthetic browser profiles.
- Local contract receipts were refreshed and the traceability check passed. The phase records contain the reduction controls and the limits of the browser measurements. The older Worker-owner baseline browser harness remains a separate open repair. General qualification remains paused.

## After application merge

Compare the merged build inputs with [the source manifest](source.json.gz), including executable modes. On a match, publish the retained reader first (`ghcr.io/thomasingalls/done:dc6003f2d-reader`), then the retained candidate (`:dc6003f2d`). Verify the remote index, runtime and config, authenticated pulls, and cluster pull access before proposing the candidate digest in ol-infra.

These three phases preserve the stored and wire formats. Both service schemas remain at their deployed versions. For a regression in these repairs, the preceding production pin `sha256:4c83dc99c55c3d3ae18d7f4faca08379196ba30c9bb74aa8a76aa7eff9c07b8d` retains the phase 542 and 550 readers. The new same-source compatible reader keeps the three repairs and disables new dense receipts. Both forward and backward changes in preparation identity can restart unfinished verification. The [measured identities](preparation-identities.json) occur in the shipped JavaScript. Preserve browser storage through upgrade and rollback.

After rollout, confirm the displayed version on desktop and phone, unlock and exchange an edit in each direction. On each affected device, observe the History panel through a quiet period and record whether it reaches a first save, resumes from it, and completes or gives a specific refusal.
