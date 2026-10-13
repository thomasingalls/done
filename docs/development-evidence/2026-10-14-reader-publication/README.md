# Reader-only candidate 890fc677

The [publication handoff](../../account-local-retention-publication.md) records scope, exact
candidate/rollback digests and the remaining merge/publish steps. The new reader and its rollback
alias name one immutable local ARM64 image; neither has been pushed in this phase. Conversions stay
disabled. This packet is bounded publication evidence, not a resumed release-validation campaign.

## Source and image

`source.json` records the signed commit and SHA-256 of its **tracked build-context archive** at
`/tmp/done-reader-publish-890fc677/source.tar`. The path list contains Docker inputs and test helpers,
not the full documentation/evidence tree. It excludes personal notes, `.env`, browser exports, keys
and live state. The image is built from that archive using the existing allowlisted Dockerfile:

```sh
docker buildx build --platform linux/arm64 --load --tag done-public:890fc677 \
  --build-arg APP_BUILD_REVISION=890fc6770cfdfff164dbda43c2f8040a1998a8dc \
  --build-arg APP_BUILD_DATE=2026-10-14 --metadata-file build-metadata.json source
node source/scripts/smoke-public-container.mjs done-public:890fc677
docker tag done-public:890fc677 done-reader-rollback:890fc677
```

No conversion override is supplied. `vite.config.ts` defaults to reader 1, installer 0, retention 0;
the Dockerfile does not accept installation/retention build arguments. `build-metadata.json` and
`image-identity.json` pin the exact image. All 109 files in `frontend-files.json` match a fresh image
extraction after the browser runs. The deployed predecessor's retained local image is `f516a958`.
Its extracted frontend is separately hashed in `predecessor-frontend-files.json`.

The source archive links the workspace's locked `node_modules` for host browser tests. Its extracted
image `dist` is used directly. The synthetic writer build is separate and never replaces that `dist`.
No runtime file was patched during the browser tests.

## Checks

- `container-build.log.gz`: TypeScript, Yjs, ordinary build, origin isolation, 138.4/350 kB initial
  JS and all 31 pre-existing Node 24 runtime/gateway, backup, restore and maintenance tests pass.
- `container-smoke.log.gz`, `container-smoke.json`: non-root packaging, explicit initialization,
  exclusive ownership, scoped APIs, every precache response, SIGKILL/restart identity/state and
  clean shutdown pass; disposable resources were removed.
- `container-sessions.log.gz`: all 92 focused session/transport tests pass in Node 24.18.0 under the
  build-stage runtime UID. `container-sessions-missing-fixture.log.gz` preserves the first invocation:
  57 tests passed, two suites could not load `docs/account-crypto/first-authority.json`, which the
  production context deliberately excludes. The rerun mounts that exact committed synthetic schema
  read-only. The production image and checks are unchanged.
- `packaged-browser.log.gz` / `packaged-browser.json`: two ordinary journeys use the exact frontend
  and pass native original/joined custody, interrupted progress, two-way text, undo/redo, reconnect
  and offline reopening.
- `reader-image.log.gz`: the retained probe passes private conversion → exact reader → actual
  predecessor refusal → exact reader recovery, with both device roles, offline text/undo/reopen,
  later two-way sync and checkpoint continuation. Baseline/chunks are unchanged during reader use;
  the incompatible predecessor leaves full content/journal inventories unchanged. Its actual error
  messages are retained, without pretending that it has an upgrade prompt. The expected Git warning
  occurs while building the private writer from an archive without `.git`; the writer explicitly sets
  its diagnostic version. The tested reader/predecessor are extracted unchanged image frontends.

The browser services are disposable host Node 26.11.1 processes from the signed archive, not the
container API. Tests are serial on ports 53221/53222, one worker and no retries. All writing and
credentials belong to disposable fixtures; their state/profile files are not in this packet.

## Reproduce the browser and Node 24 checks

Extract `/app/dist` from `done-public:890fc677` to the clean archive's `dist`, and the retained
`done-public:f516a958` frontend to `predecessor-dist` outside it. From the clean source directory:

```sh
node node_modules/@playwright/test/cli.js test -c playwright.packaged-account.config.ts \
  test/packaged-account/text-admission.spec.ts test/packaged-account/membership-custody.spec.ts
```

Copy this packet's `probe/reader-image.spec.ts` to `test/local-baseline/reader-image.spec.ts` in the
archive, then run:

```sh
DONE_PREDECESSOR_DIST=/tmp/done-reader-publish-890fc677/predecessor-dist \
  node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts \
  test/local-baseline/reader-image.spec.ts
```

The probe instruments only the private conversion writer to access its private owner. Both image
frontends remain uninstrumented; cached index bytes, visible version and native read-only inventories
identify/check them. The earlier [reader-first packet](../2026-10-13-local-retention-reader-rollout/README.md)
separately tests the exact writer-capability restrictions and native fences. The
[session repair packet](../2026-10-13-session-reopen/README.md) contains the ninth-token negative control
and two lifecycle journeys without the former backend-restart workaround.

For Node 24, build the same Dockerfile's `build` target tagged `done-reader-check:890fc677` using the
same revision/date. This test-only stage was built after copying the publication probe into the
archive; service/runtime sources are still exact signed bytes. Extract the committed synthetic
`docs/account-crypto/first-authority.json` into `test-docs/account-crypto`, then mount `test-docs`
read-only at `/app/docs`:

```sh
docker run --rm --mount type=bind,source=/tmp/done-reader-publish-890fc677/test-docs,target=/app/docs,readonly \
  --entrypoint node done-reader-check:890fc677 --test --test-timeout=15000 \
  test/account-sessions/renewal-window.test.mjs test/account-sessions/core.test.mjs \
  test/account-sessions/client.test.mjs test/account-sessions/ceremony-login.test.mjs \
  test/account-sessions/scoped-client.test.mjs test/account-sessions/grants.test.mjs \
  test/account-sessions/http.test.mjs test/account-sessions/restart.test.mjs
```

`evidence.json` hashes this packet and the additional helpers/fixture. No general performance study,
phone comparison, registry publication or infrastructure change is claimed. Retain the candidate's
digest and compatible rollback tag; a future conversion release must wait for remote retention and
authenticated pull verification of that compatible image.
