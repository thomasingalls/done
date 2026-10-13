# Reader-only local history retention — publication handoff

Prepared 2026-10-14 from signed `890fc6770cfdfff164dbda43c2f8040a1998a8dc` on
`codex/warm-ledger-loads`. Application main is `0196c03e` (PR #53). This collects the
23 signed implementation/design/evidence commits since that merge, plus this documentation handoff.
Release validation remains paused. This is reader-first preparation, not conversion activation.

## Candidate and compatible rollback target

The same tested image is both the publication candidate and the compatible fallback to retain
before any future writer-enabled release:

- Signed source: **`890fc6770cfdfff164dbda43c2f8040a1998a8dc`**.
- Local candidate: **`done-public:890fc677`**, `linux/arm64`, Node 24.18.0.
- Local retention alias: **`done-reader-rollback:890fc677`**; this is the same image, not a rebuild.
- Index: **`sha256:fa593e8a4501aa2c363347c21b7ed692a54c262cebd0dd131ea7602f28b143eb`**.
- ARM64 runtime manifest: **`sha256:1183e3cd2f4d62b250fc0cf5985ae1024dabfa2d445bdca9e867f621c875b361`**.
- After application merge, publish this exact image as **`ghcr.io/thomasingalls/done:890fc677`**;
  verify its remote digest and authenticated pull before using the immutable pin in ol-infra.

Both local tags are retained. They are not a remotely recoverable rollback until publication and
pull verification complete. Keep the published digest/source tag available while reduced profiles
may require this compatible reader, or until a separately verified compatible successor explicitly
replaces that fallback. Image cleanup must not discard the only compatible fallback. Do not rebuild
and assume the resulting image has the same identity or evidence.

## What ships, and what stays disabled

Packaged compile-time defaults are **reader on**, **installer off**, **retention off**:
`VITE_ACCOUNT_BASELINE_READ=1`, `VITE_ACCOUNT_BASELINE_INSTALL=0`,
`VITE_ACCOUNT_RETENTION=0`. The clean Docker context contains no `.env` overrides; no conversion
build arguments were supplied. These are build decisions, not environment toggles on the running pod.

The reader understands the existing private v5 baseline-plus-suffix representation, authenticates
the retained baseline and suffix, and supports original/joined opening, warm reuse, checkpoint,
membership, rotation and detached readers. Existing complete-history profiles remain complete-history
profiles. No automatic baseline installation, replacement, history removal, conversion action or
conversion cadence is enabled. Both composed and storage boundaries retain their independent writer
restrictions. The [reader-first contract](./account-local-retention-reader-rollout.md) defines this
separation and the [retention design](./account-local-retention-design.md) records the stored format.

The branch also contains the private preparation, authenticated anchoring, exact deletion planning,
atomic removal and responsiveness work needed for a later conversion phase. Its inclusion in source
does not activate it in this build. No retention performance improvement for ordinary profiles is
claimed here. Public trigger/cadence, capacity/refusal presentation, initial-conversion wait and
current-phone evidence remain separate.

Two correctness repairs are active:

- [Checkpoint/receive ordering](./account-history-receive-ordering.md) prevents maintenance from
  superseding an outstanding prepared receive's final-apply context. Only the private pre-effect
  scheduling conflict retries; generic authority failures and ambiguous effects remain refused.
- [Session renewal](./account-session-renewal-window.md) keeps the newest eight access tokens within
  the same authenticated login instead of refusing a ninth rapid reopen. Retirement occurs after
  live validation; other logins, original deadlines, credential binding and device authority remain.

Complete fresh authority checks, independent cold replay, warm invalidation/audits, journal-before-
apply, restored-pair refusal and live undo remain. No service schema migration or protocol cutover is
required: account schema stays 26, authority schema 1, wire/receipt formats stay unchanged. The shared
admission verifier's retained starting point is optional private local replay input; ordinary service
callers still begin at zero. The current session response format already supports transparent renewal
after a retired access token.

## Bounded artifact checks

The [packet](./development-evidence/2026-10-14-reader-publication/README.md) pins the source archive,
image, all 109 frontend files and reproducible test sources/logs.

- Signed-source build, TypeScript, Yjs patch and origin isolation pass; initial JS is **138.4 kB**
  gzip against the unchanged **350 kB** limit. All **31** existing container runtime/gateway,
  backup, restore and maintenance checks pass.
- **92 session/transport tests pass under container Node 24**, including rapid reopens, token-window
  bounds, live authority/refusal, abort/retry, revocation and process death. The first invocation
  omitted an allowlist-excluded synthetic authority fixture; two suites failed to load. The passing
  rerun mounts that committed fixture read-only. The candidate image was not modified.
- Disposable two-process container smoke passes non-root execution, explicit initialization,
  exclusive store ownership, scoped API, all **59** service-worker precache URLs, accepted state and
  identity across SIGKILL/restart, and clean shutdown. Disposable smoke resources were removed.
- **Two ordinary packaged journeys** pass on the exact extracted frontend: original/joined custody
  and interrupted progress; bidirectional text edits, undo/redo, reconnect and offline reopening.
- **One exact-image rollback journey** converts two disposable profiles with a separate private
  writer, then uses the real waiting-worker path to install this unchanged reader. Both profiles
  open, edit offline, undo/redo, reopen, converge and complete a verified service history snapshot.
  Their encrypted baseline/chunks remain unchanged. The actual deployed predecessor frontend
  refuses both, leaving complete content/journal inventories unchanged. Returning to this reader
  reopens them and restores two-way delivery. Neither image receives runtime instrumentation.

Browser API services are disposable host Node 26.11.1 processes from the signed archive; container
API checks are separate. The prior packets retain native crash, authority/undo and lifecycle controls;
they were not rerun as a generalized release campaign. No new timing/phone claim is made.

## Publication sequence and rollback

1. Merge the application PR with a merge commit, preserving signed identities. The operator keeps
   the merge button. Routine application CI may run; general release validation remains paused.
2. Push the exact tested candidate tag above. Verify private visibility, remote index/runtime
   digests and authenticated pull. Preserve this digest as the compatible reader rollback target.
3. Prepare the ol-infra PR changing only the immutable runtime image pin, preserving service
   identity, PVC, keys, routing and backup configuration. Use the established offline infra checks.
4. After the operator merges, reconcile through the Justfile, then verify readiness, public
   build/assets and backup health. Actual devices accept `890fc677` through the normal waiting
   update and check bidirectional edits, undo, lock/reopen and offline persistence without clearing
   storage. Updating the service does not prove that every cached client has updated.
5. Keep conversions disabled. A writer-enabled product phase needs separate authorization and
   verification, with this remotely retained compatible reader already available.

The currently deployed predecessor is source **`f516a958`**, index
`sha256:5bb003b0a49cb61f0a2734beceabf86799d8f5dc841db9cdd391e93d5af58b1e`.
Before conversion, a normal image rollback to it remains available for ordinary profiles (and
restores its old rapid-reopen limit). **After a profile has reduced history, that predecessor is not
a compatible rollback.** The exact-image check observes its generic unlock/storage refusal, not a
helpful upgrade prompt. Use the retained `890fc677` reader instead; never clear browser storage,
remove its baseline or fabricate missing history to work around the refusal.

Rolling back an image is not restoring data or undoing accepted writes. Retain the current databases
and service identity. A future incompatible service schema or baseline format requires its own
compatibility/rollback decision. No registry push, infrastructure mutation or deployment is performed
by this preparation.
