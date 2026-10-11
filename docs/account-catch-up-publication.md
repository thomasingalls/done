# Account batching, cold opening and service catch-up — publication handoff

Prepared 2026-10-11 from signed source `c609d8c7c77f8e2e006a7d80704b5d6e907a376b`
on `codex/account-burst-batching`. Application main at preparation is
`7b6d8d9f315b03cc0875782e3145fbeafecbc97f`. This is publication preparation;
the live deployment and the paused release-validation campaign are unchanged.

## Included behavior

- [Typing batches](./performance-experiments/2026-10-11-account-batching/README.md):
  Account publication and journal flushing use a 300 ms quiet deadline and two-second maximum.
  Visible acceptance still requires the synchronous encrypted journal. Pressure and explicit
  durability barriers retain their behavior. Hidden-page handling requests best-effort completion;
  suspension can still delay delivery until reopening. Receive pages publish their projection once.
- [Existing-history opening](./performance-experiments/2026-10-11-account-cold-open/README.md),
  [source census](./performance-experiments/2026-10-11-account-cold-census/README.md),
  [preliminary recovery](./performance-experiments/2026-10-11-account-cold-recovery/README.md), and
  [coverage preparation](./performance-experiments/2026-10-11-account-cold-coverage/README.md):
  linear prefix verification, less duplicate parsing, reuse within the exact preliminary ownership
  boundary, and one prepared Yjs baseline per coverage operation. Independent full verification
  remains at the live-owner boundary.
- [Service publisher tips](./performance-experiments/2026-10-11-service-verified-tips/README.md):
  ordinary delivery requests extend compact verified prefixes instead of repeatedly replaying
  the entire publisher history. Returned entries are freshly checked; new signatures extend verified
  evidence. Worker audits run after 256 new events and on backup cycles.

The service's [integrity policy](./account-service-delivery.md#current-verified-tip-integrity-policy-2026-10-11)
is an intentional change in detection timing. Every request checks authority context, witness and
indexed row count; external SQLite writes invalidate reuse. Unread old-row corruption that preserves
those checks can await an audit. Detection quarantines the publisher, reports `ledger-integrity`,
and attempts no repair. Cold verification and audits still grow with history. Indexed COUNT is not
constant-time database work. Audits do not certify an uploaded backup as semantically corruption-free.

## Immutable candidate and focused checks

[Evidence and hashes](./development-evidence/2026-10-11-account-catch-up-publication/evidence.json)
record the clean signed-source archive, local ARM64 image, build logs and disposable checks.

- Image: `done-public:c609d8c7`; Node 24.18.0, `linux/arm64`.
- Local index: `sha256:67da5b75d28947e399b92dbf9da8443819bec99d87993552df1350573faae192`.
- Runtime manifest: `sha256:e072aadecf04bc41a8ceb182f1833afc7972a5f06a891753812544f3ca2e2b4b`.
- Patched Yjs, TypeScript, production application build, bundle budget and origin isolation pass.
  The existing 31 container runtime/gateway/backup/restore/maintenance tests pass.
- The disposable two-process smoke passes: exclusive ownership, scoped APIs, all 34 precache URLs,
  SIGKILL/restart with retained accepted work and identity, graceful stop and initialization retry.
- All 14 publisher-tip controls pass against the actual packaged service with networking disabled.
  The two additional rotated-membership/quarantine controls pass in the same Node version's build
  stage, with test dependencies and a checked-in public fixture supplied separately.

The first build rejected an incorrectly formatted build-date argument; the corrected build uses
`2026-10-11`. Two attempted membership-test invocations lacked test-only Vite or fixture files;
their failures are retained alongside the completed check. No application change was needed.
These checks supplement the linked phase evidence; they add no new typing or network-catch-up metric.

## Publication and rollback

1. Open the application PR and merge with a merge commit, preserving the signed history and evidence
   references. The operator retains the merge button. Only the normal application CI build is required;
   do not resume the generalized release campaign.
2. Publish the tested image as `ghcr.io/thomasingalls/done:c609d8c7`, then verify remote index and
   ARM64 manifest identity, private visibility and authenticated pull. This local image is not yet
   published; a rebuild would be a different artifact needing its own evidence.
3. Prepare the ol-infra PR updating `infra/apps/done/components/runtime/kustomization.yaml` to that
   verified immutable digest. Keep the existing PVC, custody, public service pin, backup configuration
   and routes. Run the existing infrastructure render checks.
4. After the operator merges, verify both serving containers, readiness, public assets and backup
   health. Existing cached pages adopt the application through the waiting-worker update flow.

This is an ordinary application update: no database/schema migration, initialization or restore.
Account schema 26, authority schema 1 and signed wire formats remain unchanged. The protocol helper
change preserves canonical encoding; diagnostics add an unsigned integrity refusal. Compatibility
is based on the bounded checks and source review, not an exhaustive mixed-version campaign.

The current ol-infra source pin is `sha256:ce08e76c89ee402495fabcbac94af998c15dbd3b863942a8b4ec578718718b1a`
(source `5ccee4d0`). Reverting the image pin is the ordinary rollback and restores the slower behavior;
it is not a data restore or corruption repair. `VITE_ACCOUNT_BATCH=reference` can diagnose batching
separately, but requires its own built/tested image and does not disable the service tip repair.

The next client slice remains separate: custody-record comparison, receive-loop scheduling and hint
classification, with due sends retaining a turn during catch-up. Actual two-device catch-up rate,
writer acceptance intervals at depth and keystroke-to-peer latency remain to be measured there.
