# Account receive performance and enrollment repair — publication handoff

Prepared 2026-10-11 from signed source `203a0655bc67fdcb5480ae98cfc4e4ddb2a9f6ce`
on `codex/account-receive-performance`, including signed client change `34f9b0b9`.
Application main at preparation is `9fe66395c2db4f684c1bad328c7fc19ac06f5c20` (PR #48).
This prepares an ordinary application update. Release qualification remains paused.

## Result and scope

The [receive packet](./performance-experiments/2026-10-11-client-receive/README.md) records the
matched local two-device experiment: a realistic synthetic workspace with 600 queued positions.
Candidates catch up in 307/318 seconds; both baseline primary runs miss 600 seconds, and the one
completed baseline continuation takes 938 seconds. That completed pair improves by 66%, about
three times the throughput. Observed post-catch-up burst-to-peer medians improve from 3.64 seconds
to 2.36 seconds, including batching and assertion polling. These are desktop/local observations,
not phone/WAN guarantees. Cold opening of the deep received history remains about 6.9 seconds;
offline typing tails are mixed. No new performance budget or release claim is introduced.

The implementation compares custody scalars/bytes directly using the existing authenticated tuple,
gives each productive publisher up to four verified pages before rotating, yields after every page
and lets a due sender run. It removes the fixed 50 ms receive-progress delay, preserving the one-position
page bound and ordered verification/admission. Content hints wake receiving without restarting
discovery; control hints and periodic authenticated discovery retain their roles.

Unexpected lane errors retry with capped backoff. After 30 seconds of a continuing online problem,
a fixed notice explains the affected direction, gives an enumerated reason and last-success time,
and offers a lane-specific retry. Account details show both lanes. Known integrity, size, closed and
conflict stops require explicit retry; no retry discards evidence or restores authority. Offline and
storage-pressure messages remain separate.

The [enrollment follow-up](./performance-experiments/2026-10-11-enrollment-history-race/README.md)
reproduces a regression from deployed service optimization `c609d8c7`: an ordinary upload between
history snapshots made an already certified second device fail to open with `409 unavailable`.
The repair restarts full verification for those explicit snapshot mismatches, within the existing
four-attempt bound. Three of six natural pairings failed before the repair; six of six passed after.
Directed controls retain authority/damage refusal and the finite retry bound. The original unlogged
refusal cannot be diagnosed retrospectively; the new reproductions identify this concrete cause.

## Immutable candidate

[Evidence and artifact hashes](./development-evidence/2026-10-11-account-receive-publication/evidence.json)
record the signed-source archive and local ARM64 image:

- Image: `done-public:203a0655`; Node 24.18.0, `linux/arm64`.
- Local index: `sha256:df225ef4f95306b7668aa0ca45788ff46c0301ddcd48777993f5f2567f242ae9`.
- Runtime manifest: `sha256:f501ab1a4c1dd241ce1be799c0a262fe30c49e429165b3c13b31e8ce3383d4e2`.
- Application build, TypeScript, patched Yjs, origin isolation and bundle check pass; initial JS is
  136.7 kB gzipped against the unchanged 350 kB budget. All 31 existing container runtime/gateway,
  backup, restore and maintenance checks pass.
- Nine targeted Node 24 build-stage checks pass: five history-race/boundary controls and four
  notification/gateway controls, including legacy and negotiated event behavior. They run without
  external networking and with the signed public crypto fixture mounted read-only. The build stage
  provides test-only Vite dependencies; the runtime image contains no tests or build tools.
- The disposable two-process container smoke passes, including every precache response, exclusive
  database ownership, scoped APIs, SIGKILL/restart with retained state, and graceful cleanup.
- Both browser journeys using the extracted container frontend pass: certified second-device opening,
  and invalid receive evidence followed by the delayed notice, explicit retry and two-way editing.

The first build invocation mistakenly supplied an incorrect full revision label. That artifact is
excluded; its metadata/log are retained. The corrected build and smoke verify the exact source SHA
above. The final browser checks use the exact frontend extracted from this corrected image, with
disposable host Node 26 services from the same signed archive; they are not browser tests against
the container's Node 24 API. Node 24 service behavior is covered by the checks above.

## Compatibility, publication and rollback

No schema migration, initialization or restore is needed: account schema 26 and authority schema 1
remain. Signed wire formats and custody MAC encoding are unchanged. The only new notification event
is negotiated through `X-Done-Notification-Events: 2`; old clients still receive `hint`, and new
clients retain the original event alphabet. Compatibility evidence is focused, not an exhaustive
mixed-version campaign. Existing pages adopt the new frontend through the waiting-worker update flow.

1. Merge the application PR with a merge commit, retaining signed source identities. The operator
   retains the merge button. Run the normal application CI build; do not resume the full campaign.
2. Publish this exact tested image as `ghcr.io/thomasingalls/done:203a0655`, verify its remote index
   and ARM64 runtime manifest, private visibility and authenticated pull. A rebuild would need its
   own identity/evidence. The image is currently local only.
3. Prepare the ol-infra PR updating `infra/apps/done/components/runtime/kustomization.yaml` to the
   verified immutable digest. Keep the current PVC, keys, service pin, routes and backup settings.
4. After the operator merges that PR, verify readiness, public assets and backup health.

The current ol-infra source is `c609d8c7`, pinned to
`sha256:67da5b75d28947e399b92dbf9da8443819bec99d87993552df1350573faae192`.
Reverting the image pin is the ordinary rollback; it restores slower receive behavior and the known
history-opening race. It is neither a data restore nor a corruption repair. This preparation changes
no live service or infrastructure configuration.

Foreground maintenance stalls and deep received-history cold opening remain open performance work.
The larger authenticated retained-baseline design and local ledger trimming remain separate.
