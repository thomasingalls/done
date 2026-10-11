# Account editing performance — publication handoff

Prepared 2026-10-11. Activation source: signed
`5ccee4d000d691cde6206e03551e5104ca5e864d`, on `codex/account-self-stream-progress`.
The publication evidence/checkpoint commit after it changes documentation only. Application main
was `23fd688d3fafd0765f90ec4e5ce5faa2cd293411` when preparation started.

The [activation record](./performance-experiments/2026-10-11-account-activation/README.md) links the
correctness, request-volume and default/rollback evidence. Ordinary builds now select incremental
Account verification and editor snapshots. Receipt-derived receive progress, narrower verified
projections, coverage reuse and selection-history changes remove repeated work. The service suppresses
own-content hint echoes and assigns scoped request budgets per session under a process ceiling.
Enrollment retries also recover from repeated competing authority changes.

## Tested immutable candidate

[Machine-readable evidence](./development-evidence/2026-10-11-account-latency-publication.json) and
[container build log](./development-evidence/2026-10-11-account-latency-container.log):

- Local image: `done-public:5ccee4d0`, built from a clean archive of the signed source, `linux/arm64`.
- Local index: `sha256:ce08e76c89ee402495fabcbac94af998c15dbd3b863942a8b4ec578718718b1a`.
- ARM64 runtime manifest: `sha256:cec24741c18d32c8a39f393b6a4ecadf5560e7025d169ad70e890f18d2bdd00d`.
- Node 24.18.0 application build passes, including patched Yjs, TypeScript, bundle budget and origin
  isolation. All 31 existing container runtime/gateway/backup/restore/maintenance checks pass.
- The disposable two-process smoke passes: scoped API boundary, all 34 precache URLs, exclusive
  ownership, SIGKILL/restart with retained accepted work and identity, clean shutdown and init retry.
  Disposable resources were removed. No real service data was mounted.

This image has **not been pushed**. Its local index is a candidate, not evidence that GHCR serves
those bytes. Do not update the infrastructure pin until remote verification succeeds.

## Publication sequence

1. Merge the application PR using a merge commit, preserving the signed commits and evidence hashes.
   The operator retains the merge button. The required application build runs; the full release
   campaign remains paused.
2. Tag the tested image `ghcr.io/thomasingalls/done:5ccee4d0`, push it using the established GHCR
   publishing credential, and compare the remote index bytes/digest and ARM64 runtime manifest to
   the tested image. Verify private package visibility and authenticated pull by immutable digest.
   Rebuilding would produce a new artifact that needs its own identity and smoke record.
3. Prepare an ol-infra PR updating the single image pin in
   `infra/apps/done/components/runtime/kustomization.yaml`. That component covers both serving
   processes and operator Jobs. Retain the PVC, operator key, public service pin, backup secrets,
   configuration and public routes. Run its existing offline render/deployment checks. Record the
   verified publication evidence and rollback information in that PR.
4. After the operator merges the infrastructure PR, let Flux/Recreate replace the single writer.
   Confirm the expected digest on both containers, readiness, public origin/TLS, fresh backup health,
   service identity and packaged asset version. The browser's existing waiting-worker update flow
   controls when cached pages activate the new application. A deployment alone does not replace an
   already running cached page.

This is an **ordinary application update**: account schema 26 and authority schema 1, wire formats,
and persistent record kinds are unchanged. Do not run initialization, schema maintenance or restore.
Cached older clients use the same APIs; the changed notification rule suppresses only the submitting
credential's content echo, preserving peer/control hints and periodic repair. That compatibility
assessment is based on source and the bounded checks, not an exhaustive mixed-version campaign.

For a diagnostic rollback, prefer a build of this source with
`--build-arg VITE_ACCOUNT_LEDGER=reference`, retaining the correctness/enrollment/request repairs.
The reference/default retained-store round trip was tested. That would be a different image: build,
smoke, publish, verify and pin it through the same procedure. The previously recorded infrastructure
pin is `sha256:906630d824f235f32ac754c90e04c6b0adf2e091af668694622fa3b48b23da04`
(source `5501f7b9`); reverting to it also reintroduces the performance and enrollment defects.
No data restore is part of an image rollback.

## Limits

No registry publication, infrastructure mutation, production rollout or new public-origin account
walkthrough occurred during preparation. The latest checks add no typing-latency percentile or
server-capacity claim. Long-history reconstruction, retained bytes, maintenance cost, peer discovery
traffic and burst batching remain opportunities. Release validation is paused.
