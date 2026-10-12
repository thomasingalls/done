# Candidate 9465fb04

The [handoff](../../account-performance-publication.md) records scope, results and rollout order.
`evidence.json` hashes every other file in this directory. Logs are gzip-compressed; browser
records contain only numeric outcomes. Synthetic credential-bearing fixtures remain outside Git.

The candidate was built from `git archive 9465fb045e489bdbb2453f6c87da307b7d04f60a`, extracted into
`/tmp/done-receive-publish-9465fb04/source`. Commands from this session:

```sh
docker buildx build --platform linux/arm64 --load --tag done-public:9465fb04 \
  --build-arg APP_BUILD_REVISION=9465fb045e489bdbb2453f6c87da307b7d04f60a \
  --build-arg APP_BUILD_DATE=2026-10-12 --metadata-file build-metadata.json source
node source/scripts/smoke-public-container.mjs done-public:9465fb04
```

`dist` was extracted from this image into the signed source directory. That directory uses the
workspace's locked `node_modules` through a symlink. The text journey runs there with:

```sh
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts \
  test/packaged-account/text-admission.spec.ts
```

The deep-receive journey uses the archived
`docs/performance-experiments/2026-10-12-foreground-stall/probe/stall.config.ts`,
with `DONE_PERF_SOURCE` set to the signed source directory, `DONE_PERF_DIST` to its extracted
`dist`, `DONE_PERF_FIXTURE_ROOT=/tmp/done-client-receive`,
`DONE_PERF_RESULTS=/tmp/done-receive-publish-9465fb04/deep-receive` and `RECEIVE_DELAY_MS=75`.
The synthetic fixture SHA-256 is
`b02e7d7167ab2655f10281801be988c2ee0821b69e379a39315f044b71cea985`.
No diagnostic switches are enabled. The browser journeys run serially, after the container
checks, with no overlapping build or test campaign. These are functional publication checks;
phase-specific comparative measurements remain in their own packets.

The smoke script starts only disposable Docker volumes and containers and cleans them up.
The browser tests use separate loopback services and copied synthetic state. No production
store, registry push, infrastructure mutation or generalized validation run is involved.
