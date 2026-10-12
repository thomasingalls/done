# Account receive, opening and typing — publication handoff

Prepared 2026-10-12 from signed source `9465fb045e489bdbb2453f6c87da307b7d04f60a`
on `codex/batched-receive`. Application main at preparation is
`1734b2f59e3fe732cab480e94cb5d9a14503e030` (PR #50). This is an ordinary application
update. Release validation remains paused.

## Changes and retained evidence

- `534252e1` removes redundant own-stream polling after accepted progress and compares
  retained custody markers without repeatedly encoding them. The
  [first repair packet](./performance-experiments/2026-10-12-receive-first-repair/README.md)
  follows the [deployed-build attribution](./performance-experiments/2026-10-12-receive-attribution/README.md).
- `54811c93` groups up to four independently signed, original-format receipts under
  shared preparation, one native commit and authenticated readback. A matched desktop
  600-position catch-up fell from 248.795 to 79.125 seconds. Per-entry signatures,
  prefix order, authority and expiry checks remain mandatory. The
  [grouping packet](./performance-experiments/2026-10-12-receive-groups/README.md)
  includes crash/retry, authority changes and cold replay in the pre-group reader.
- `460fefd8` overlaps at most two exact reads outside admission, with four-receipt turns,
  a 250 ms launch window and 4 MiB retained/reserved response bound. Out-of-order replies
  are consumed in cursor order; missing replies retain only a verified prefix, and close
  cancels and drains outstanding work. With 75 ms added per request, a fresh matched
  catch-up fell from 194.602 to 100.978 seconds. The
  [prefetch packet](./performance-experiments/2026-10-12-receive-prefetch/README.md)
  records bounds, cancellation and late-reply controls.
- `d1e5e5ea` makes reference audits inside compaction yield at owned boundaries and retry
  after foreground input. A controlled key collision fell from 2,157 to 24 ms; its
  audit subsequently completed. The existing verified view survives interruption;
  mismatches still refuse. The [stall packet](./performance-experiments/2026-10-12-foreground-stall/README.md)
  distinguishes controlled collisions from natural observations.
- `68ca241d` uses a conservative integrated-struct/deletion coverage proof during full
  verification, retaining fork/apply/compare for uncertain cases, and avoids redundant
  receipt re-encoding. On 120 cards and 600+ received positions, three matched cold
  opens per arm give first-editor-frame median **7.054→2.622 seconds**. Complete archive
  digests and crypto-call counts match. See the
  [received-history packet](./performance-experiments/2026-10-12-received-open/README.md).
- `9465fb04` prepares eligible Account text updates without whole-workspace forks.
  It captures the exact human frame, journals/commits it, then promotes canonical text
  and the existing undo projection. Structural commands, undo/redo, sliced paste and
  uncertain dependencies retain the reference path. Full equality checks remain at
  opening, reference transitions, received-page publication and ordinary close. On the
  same realistic workspace, three matched desktop observations per arm give median
  handler **7.6→2.1 ms** and visible-frame **11.4→6.2 ms**. The
  [text-admission packet](./performance-experiments/2026-10-12-text-admission/README.md)
  includes 244 passing focused tests, generated native-encoder comparisons, mixed
  direct/reference histories, journal-before-apply, refusal and close controls. One
  fork-lifecycle case is inapplicable to direct mode and replaced by direct controls.

These are separate experiments, not additive gains or predictions for the public service.
CPU-4x visible-frame p95 is still 57.1 ms, and received-history opening still exceeds the
2.5-second budget. Neither establishes current physical-phone performance. Local ledger
retention, remaining background/flush work, UI projection and large individual text edits
remain performance work.

## Immutable candidate and publication checks

[Evidence and artifact hashes](./development-evidence/2026-10-12-receive-publication/evidence.json)
pin the clean signed-source archive and exact candidate:

- Local image: `done-public:9465fb04`, `linux/arm64`, Node 24.18.0.
- Index: `sha256:15a11309fd43a3a01d4d377a598dc3e1152734e309664d3d258b600e05ed9963`.
- Runtime manifest: `sha256:896d3d4e6c2246bf249764250e4890cee10bbd5ab4ac461f18b87e177729bb6c`.
- Build, TypeScript, pinned Yjs, origin isolation and bundle checks pass. Initial JS is
  136.7 kB gzipped against the unchanged 350 kB budget. All 31 existing Node 24 container
  runtime/gateway, backup, restore and maintenance checks pass.
- Disposable container smoke passes non-root packaging, scoped APIs, exclusive database
  ownership, every service-worker precache response, retained state after SIGKILL/restart,
  graceful shutdown and cleanup.
- The exact extracted frontend passes the native two-device text journey: both-way
  editing, undo preserving received edits, redo, reconnect and journal-only offline reopening.
- The retained 120-card, 600-position journey also passes with 75 ms added per request:
  catch-up while both devices write, subsequent two-way bursts, identical complete 54,211-byte
  Markdown exports and offline cold reopening. Catch-up is 106.936 seconds and cold opening
  2.861 seconds in this single functional check, not a new matched performance experiment.

The browser checks use the exact frontend extracted from the runtime image and disposable
host Node 26.11.1 services from the same signed archive. They are not browser checks against
the container's Node 24 API; its runtime checks are listed separately above. No production
state, actual user credentials, physical-phone measurement or release qualification is involved.

## Compatibility, publication and rollback

Account schema 26, authority schema 1, signed wire formats and stored receipt formats remain
unchanged. No initialization, migration, restore, re-enrollment or browser-storage reset is
needed. Cached older clients remain compatible and retain their older performance until
accepting the waiting-worker update. The retained pre-group reader check covers new grouped
records; it is not an exhaustive mixed-version qualification.

1. Merge the application PR with a merge commit, preserving the signed source identities.
   The operator retains the merge button; only ordinary application CI runs.
2. Publish this exact tested image as `ghcr.io/thomasingalls/done:9465fb04`. Verify its
   remote index, ARM64 manifest, private visibility and authenticated pull. A rebuild
   needs its own image identity and evidence. This candidate is currently local only.
3. Prepare the ol-infra PR updating the immutable image pin in
   `infra/apps/done/components/runtime/kustomization.yaml`. Keep PVC, keys, identity,
   routes and backup configuration.
4. After the operator merges, reconcile with the infrastructure Justfile commands and
   verify readiness, public assets and backup health. On the actual devices, accept the
   update, confirm build `9465fb04`, check both-way edits and undo, and reopen with retained
   writing. Compare catch-up and opening responsiveness without clearing browser storage.

The currently deployed source is `77657e23`, index
`sha256:21c744f542d6dcd450f7af9e099bce80175de834e2c9d48d6b6a1bf7f1f3d080`.
Reverting that image pin remains an ordinary rollback, subject to clients accepting the older
application. It restores the previous performance and does not restore data. For a diagnostic
frontend build, `VITE_ACCOUNT_TEXT_ADMISSION=reference` restores the previous Account text
preparation while retaining other repairs; `VITE_ACCOUNT_LEDGER=reference` restores the full
reference workspace path. These Vite flags require a separately built and tested frontend;
they are not runtime environment toggles on this image.

This preparation changes no running service or infrastructure configuration.
