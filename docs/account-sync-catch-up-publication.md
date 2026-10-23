# Sync catch-up and device connection — production handoff

Prepared 2026-10-23 for [application PR #56](https://github.com/thomasingalls/done/pull/56).
The tested signed runtime source is `51d8550d30585c93e623af0f2b3adf610781eebb`.
Signed evidence commit `fa3af694e96731908baf920338e531d07de81697` and this handoff
add documentation only. All allowlisted image/build inputs remain byte-identical
to that tested source; verify this again after the operator's merge.

## Acceptance decision

The operator explicitly selects the passing local functional/full-unit and exact
artifact checks as this release's acceptance evidence. Hosted GitHub Actions
results are non-blocking for this release because the hosted runs time out.
Preserve their existing results; do not relabel them passing, disable tests or
change branch protection. This is a publication decision, not an assertion that
local testing proves every platform or security property. General qualification
remains paused, with 883 obligations and 339 unresolved entries retained.

The [signed artifact packet](development-evidence/2026-10-23-signed-sync-artifact/README.md)
records 56 packaged browser cases, 307 distinct native cases, 31 container boundary
cases, restart/ownership/precache smoke and an actual production-frontend
upgrade/compatible-rollback journey. One Linux historical comparison could not
launch Git in the intentionally minimal build image; its full 21-case file passes
on host Node 24 with repository history. No failed attempt is erased. The preceding
158-file unit run has 1,879 passes and one existing named skip; all 18 routine local
commands pass on reviewed inputs. This handoff changes no executable test input.

Two exact-image/frontend load journeys pass all 120 keys, background replay,
encrypted pending-writing durability, same-profile offline reopening, reverse
writing/undo, complete exports, independent native audit and clock controls.
Local p95 is 5.7/5.9 ms against 16 ms; complete-peer p95 is 812.2/854.4 ms against 2,500 ms.
The service is supplied by the release image without application-source overlays,
under the existing session-enabled development HTTP fixture. Production entrypoints
have separate smoke checks. These finite observations do not establish phone
performance or universal multi-account capacity.

## What ships

- Empty legacy placeholder databases no longer block fresh startup. Real legacy
  writing remains preserved/refused for migration; setup messages describe actual
  saved attempts and refusal causes. The unexplained production account disappearance
  remains unresolved; retained audits and refresh reproductions are evidence, not a fix claim.
- Device approval batches existing signed history reads, reports verified progress
  and retries only eligible exact bounded transient reads. Ordinary catch-up also
  uses batching and verification reuse. Existing inner signatures and receipts remain.
- Native authority/history proofs are reused only for matching immutable inputs,
  while request, grant, custody, expiry, witness, served-row and final commit checks
  remain fresh. Discovery and catalog verification no longer depend on unrelated
  publisher appends. Live ledgers are captured after authority verification.
- Publisher caches retain verified prefixes across legitimate commits, isolate
  unrelated publishers, bound cold verification and queued work, and preserve
  independent corruption audits. Explicit capacity refusals keep exact retry bytes
  and original deadlines. Only unchanged-live-input cache retirement gains the
  bounded native read retry; owner closure and authority/input changes still refuse.
- Native/browser regressions and precise historical fixture/source repairs are
  retained in routine CI. The optimization-consolidation review makes no runtime
  change; later UI, billing, mascot and consolidation work remains separate.

Account schema 26 and authority schema 1 remain. No database migration, initialization,
restore, key rotation or browser storage reset is required. New transport batches
carry original signed requests/responses and retain older-host fallback. Default
reader stays on, baseline installer and retention stay off; no conversion build
arguments or `.env` overrides entered this image.

## Exact artifact and rollback

- Local image: `done-public:51d8550d`, linux/arm64, Node24.18.0.
- Intended private tag: `ghcr.io/thomasingalls/done:51d8550d`.
- OCI index: `sha256:d16c39c27528d8a541a1a8bb35d7081c384c8c9a6f75d89cca80ea74aa80cb29`.
- ARM64 runtime: `sha256:5cd9998cf76f5607809f21cf712053ebfc0c604290cd620d9baf0cdfbc2627ee`.
- Config: `sha256:d0c501d2723c9de9059a98084bfa4fac2baffa1e8fb134612ef8591514d6683c`.
- Saved image: `/private/tmp/done-sync-publish-51d8550d/candidate-image.tar`,
  SHA-256 `b77f04b200dbb7e5cce275d861a23fe48edd5860590d345f7ea7e3f9542b6947`.

The saved-image hash above must be read from the immutable artifact record before
publishing; use `candidate-image-archive.json` as its canonical source. Never
rebuild and assume equivalence. The production predecessor is source `faf465f7`,
image `ghcr.io/thomasingalls/done@sha256:de9ead770b70113e6e391a128898be63c37c5a3afa9e8fda2f7b5d99f1aeea6b`.
Retain that digest as the ordinary rollback. The tested frontend rollback keeps
the candidate backend; it is not an executed predecessor-server rollback. Schema
and stored receipt compatibility are assessed separately by source and native tests.
An image rollback preserves databases/identity and does not undo accepted writes.
Preserve the separately retained reader-rollback-890fc677 fallback as well.

## Publication sequence

1. Push the signed source/evidence/handoff to PR #56. The operator merges using a
   merge commit, preserving signed commit identities. GitHub Actions is non-blocking
   under the explicit acceptance decision above; do not bypass protection in tooling.
2. Verify signed-source ancestry and every allowlisted runtime/build input against
   merged main. Publish the exact tested local image, verify private visibility,
   remote index/runtime/config hashes and authenticated pull. Preserve the predecessor.
3. Prepare the infrastructure PR from fresh main, changing only the shared immutable
   image pin plus publication evidence. Run its established offline check and compare
   rendered Deployment/operator Jobs; preserve PVC, identity, keys, Secrets, routes,
   security context, backup settings and single-writer Recreate/drain strategy.
4. The operator merges that PR with a merge commit. Reconcile through the infrastructure
   Justfile, then verify Pod readiness/images, public asset hashes/service identity and
   backup health. No migration, initialization, restore or maintenance Job is planned.
5. Actual devices adopt Version 51d8550d through the waiting-worker update without
   clearing storage. Confirm two-way edits, undo preserving received changes, lock/reopen,
   offline reopening and catch-up. Server rollout does not establish cached-client adoption.

[Read-only preflight](development-evidence/2026-10-23-sync-release-preparation/preflight.json)
finds one ready production replica and the exact retained predecessor frontend.
Backup is healthy with zero unprotected change age; its cumulative 15 historical
failures are retained, not called zero. The GHCR package is verified private with
its existing release credential; no credential is recorded. No cluster mutation,
image publication or merge occurs in this preparation.


## Verified publication and production rollout — 2026-10-23

Application PR #56 merged as `6d1baffc58df5c46f414e8ba229d85026d3b610b`;
[Infrastructure PR #20](https://codeberg.org/oxidationlabs/ol-infra/pulls/20) merged
as `67a622f6add9eebed0f0a84ad713b542a1eb973a`, preserving signed infrastructure
commit `d0ce0dc7173202351d20026cf57d45a332e3b6dc` and its exact tree. The exact
tested private image was published, verified remotely and reconciled through
the Justfile. All seven Kustomizations are ready at that merge; the replacement
Pod runs both tested-image containers with zero restarts.

Production serves **Version 51d8550d**. All60 precache URLs and worker bytes
match the tested artifact through normal DNS/TLS; public identity, the original
PVC and non-image Deployment settings remain exact. Backups are healthy with
a successful post-restart upload and no unprotected pending change. The old
process's15 failures remain historical evidence even though the restarted
process counter is zero. No maintenance Job, migration or storage reset ran.

[Rollout evidence](development-evidence/2026-10-23-sync-production-rollout/README.md)
records exact observations, limits and reproduction sources. Actual-device
adoption, two-way typing, catch-up, undo, lock/reopen and offline reopening
remain pending operator confirmation without clearing storage. General
qualification remains paused and the disappearing-account report unresolved.


### Actual-device feedback after rollout

The operator subsequently reports substantially improved catch-up and live sync,
with inter-device delay close to real time and undo included in positive feedback.
[Verbatim feedback and limits](development-evidence/2026-10-23-sync-production-rollout/operator-device-feedback.json)
are retained separately from the server probes. Long-backlog catch-up was not
exercised on actual devices; individual lock/offline outcomes and per-device
version labels were not supplied in that reply. No measured latency or WebSocket
comparison is claimed, and qualification remains paused.
