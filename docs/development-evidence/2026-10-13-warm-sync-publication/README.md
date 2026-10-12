# Candidate f516a958

The [handoff](../../account-warm-sync-publication.md) records scope, limits and rollout order.
`evidence.json` hashes the other files here. Logs are gzip-compressed; browser records contain
only test names, numeric outcomes and statuses. Credentials, writing and disposable service/browser
snapshots are excluded. The source archive itself is retained only at the recorded scratch path.

The candidate comes from `git archive f516a958e88b17d17f7dc5cb65b1fa386dbec45f`, extracted into
`/tmp/done-warm-publish-f516a958/source`. The Docker context allowlist excludes docs/evidence,
private notes and runtime state. Commands:

```sh
docker buildx build --platform linux/arm64 --load --tag done-public:f516a958 \
  --build-arg APP_BUILD_REVISION=f516a958e88b17d17f7dc5cb65b1fa386dbec45f \
  --build-arg APP_BUILD_DATE=2026-10-13 --metadata-file build-metadata.json source
node source/scripts/smoke-public-container.mjs done-public:f516a958
```

The image's `dist` was extracted into the signed source directory. That directory links the
workspace's locked `node_modules`. The two focused packaged tests ran there, one worker/no retries:

```sh
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts \
  test/packaged-account/text-admission.spec.ts test/packaged-account/membership-custody.spec.ts
```

The retained deep-receive journey follows those tests, with no overlapping agent-owned build/test.
It uses `docs/performance-experiments/2026-10-12-foreground-stall/probe/stall.config.ts` from this
same archive. `DONE_PERF_SOURCE` names the source directory, `DONE_PERF_DIST` its extracted `dist`,
`DONE_PERF_FIXTURE_ROOT=/tmp/done-client-receive`,
`DONE_PERF_RESULTS=/tmp/done-warm-publish-f516a958/deep-receive`, and `RECEIVE_DELAY_MS=75`.
All diagnostic switches are unset. This is one functional check, not a new matched latency study.
`environment.json` records host runtime and fixture hash. `frontend-files.json` hashes the extracted
assets before and after browser checks; `browser-source-files.json` pins test helpers.

The focused units ran from the same archive, `--maxWorkers=2`, selecting `warmContent`,
`verificationOwnership`, `verifiedRecords`, `accountAuthority`, `admissionQueue`, `cpuBudget`,
`custodyBulkRead`, `finalApplyGate`, `workspaceAdmission`, `workspaceUiStatus` and `ownedReceiveQueue`.
The initial Git metadata warning is expected in a clean archive; those unit tests pass. The actual
container build receives explicit source revision/date and the browser tests use its frontend.
The implementation packet separately retains the seven passing native immediate-handoff controls.

The operator's report of heavy VM use during recent testing is retained as an unquantified timing
confound. No timing from this publication check is used to override earlier mixed results or claim
an isolated speedup. General release validation and the physical account comparison remain paused/
pending. No production data, registry push, infrastructure mutation or rollout is involved.
