# Signed ARM64 Goals and automatic local-maintenance candidate

2026-10-26. The tested artifact is **`done-public:dc53fecf`**, built from signed source
**`dc53fecf25ca341cb4b626a154e0df33a29728be`** with
**`VITE_ACCOUNT_RETENTION_AUTO=1`**. [Source metadata](source.json) binds the clean allowlisted
archive, all1,676 inputs and16 verified signatures. [Image metadata](image.json) binds the saved
image, index, ARM64 manifest and runtime config. The publication index is
**`sha256:1869aa2c05c0e6ba5b6c3b85df7bf9bca50a4692c80201fe5af39424c2a37cbf`**.
Do not rebuild and assume an equivalent identity. This follow-up changes documentation only.

The candidate adds gentle Goals context and heading menus, optional card heading breadcrumbs, and
guarded automatic **local operational-history** reduction with status/retry. It does not prune server
history, delete user-visible writing or change the service protocol/schema. All four compiled
reader/installer/retention/automatic gates are1 in the [actual frontend](compiled-flags.json).
The [activation contract](../../account-local-retention-activation.md) retains the1,024-record
threshold, ten quiet visible/durable seconds and30-minute successful-maintenance cooldown, with all
fresh authority, census, interruption, journal and atomic exchange checks.

## Exact-artifact results

[Verification](verification.json) and the [archive](evidence.zip) preserve the following:

- **33/33 final-image cases pass** at original deadlines:16 runtime/gateway,5 backup,6 restore and6
  maintenance. Non-root65532 execution, native SQLite/workers, six old/new age round trips and12
  wrong-key/tamper refusals pass. The distroless image retains Node24.18.0 and age1.3.2; no shell or
  package manager is present. All122 runtime source files equal both signed source and the deployed
  `d8b3f22b` reader. No fresh vulnerability scan is claimed.
- The separate two-container smoke passes explicit initialization/external custody, second-writer
  refusal, scoped session/origin controls, all60 precache responses, accepted state and identity
  across SIGKILL/restart, and graceful stop. Disposable resources were cleaned up.
- TLS rejects a self-signed test certificate and accepts its explicit disposable CA. The first public
  trust probe failed at Docker DNS (`ENOTFOUND nodejs.org`), before TLS; that failed result remains.
  Supplying the host-resolved address with normal hostname/SNI and default certificate validation
  succeeds with HTTP200. This establishes the trust bundle, not reliable default Docker DNS.
- The uninstrumented **production reader → candidate → production reader → candidate** waiting-worker
  rehearsal passes for protected original/joined profiles, queued/offline writing, wrong-code refusal,
  lock/reopen, undo/redo and two-way delivery. One1,000-key real typing burst produces history above the
  real production threshold; both profiles automatically reach counterv5/revision1 with zero suffix
  rows. No threshold, clock or proof is bypassed. The [read-only observation](retention-conversion.json)
  records the transition. After reduction, the actual deployed reader reopens and synchronizes writing,
  then the candidate reopens again. One test passes in53.5seconds, with no retry and a180-second deadline.
- All110 extracted frontend files retain identical population/bytes after the rehearsal. Initial JS is
 232.7KiB gzip against350KiB; origin isolation passes with the existing namespace-only allowlist and
  unchanged static-scanner limitations. Build input bytes/modes remain equal to signed source.

The first browser invocation omitted a frozen helper dependency and reported “No tests found.” Its
raw failure remains; adding the exact pinned predecessor helper allowed execution. Services throughout
the browser rehearsal use candidate host Node24.18.0; predecessor **backend** rollback is not inferred.
All accounts, credentials and profiles in this rehearsal are disposable. No real browser data was read.

The [prior signed-source checkpoint](../2026-10-26-signed-ux-retention-checkpoint/README.md) supplies
2,012 passing unit cases/one existing named skip,216 browser cases/24 existing platform skips,175
CI adapter cases and40 contract/vector leaf commands. Its Node26 host/emulation scope remains;
the1,676 build inputs equal this candidate. Those full runs are reused, not presented as new image
executions. General qualification stays paused and all907 obligations/363 unresolved blockers remain.

The current release-preparation tree also passes the same40 contract/vector leaves and175 CI
adapter cases under host Node24.18.0, plus inventory/planning/census checks. The extra first-authority
wrapper passes its functional/vector stages but fails its final formatter on existing
`docs/account-crypto/constructions.json` layout. That optional wrapper is recorded as failed; no
unrelated formatting or assertions are changed. Traceability initially refuses an older origin-check
receipt as intended; fresh budget/origin executions against the exact frontend restore traceability.
The failed attempts remain with the fresh logs. Live receipts must be refreshed again after signing,
since committing changes their tree identity.

## Compatible rollback and device limits

Retain the deployed **reader-only `d8b3f22b`** image at index
**`sha256:6f1cb5d644cbee92d2b344d591d182d900ab059670ed5870acc01b556e82cacb`**.
The exact frontend has now opened and synced both genuinely reduced profiles. Verify remote retention
and authenticated pull again before the infrastructure PR. A reader rollback stops future automatic
maintenance only after each cached client adopts it. It does not reconstruct removed operational rows
or undo accepted writing. Preserve browser storage, server data and identity throughout.

The operator chose to proceed with the two-user beta release while deferring a physical Android
first-conversion walkthrough. Chromium desktop/Pixel emulation and these image checks do not establish
phone typing, memory, screen-lock or background behavior. Adoption checks should watch first opening,
typing/undo, maintenance status, peer convergence and offline reopening. Unexpected lost writing,
unreadable reopen, halted verification or persistent reception failure warrants stopping adoption and
using the compatible reader while retaining evidence. No observed production-account diagnosis or
new phone-performance claim is made here.

## Infrastructure and HSTS preparation

The [prepared diff](infra-preparation.patch) is against current ol-infra main `a7fcf5b`, in a separate
worktree. It uses the reorganized Flux dependency `infra-core`; independently reconciled `done` and
`done-public` remain separate from generic apps. The current image pin still lives under
`infra/apps/done/components/runtime/`, and public routing under `infra/apps/done/public/`.

The exact rendered comparison permits only12 image references and two HTTPS response-header filters.
It preserves PVC/custody/backup configuration, both backends, ordinary timeouts and the notification
stream's zero timeouts. HSTS is **`max-age=31536000`**, host-only for `done.oxidationlabs.com`, on ordinary
and notification-stream HTTPS responses. HTTP retains its301 redirect without an HSTS header.
No `includeSubDomains` or preload is requested. Policy rollback needs HTTPS `max-age=0`; merely removing
the header does not erase browser-cached policy. The Gateway API/installed gateway support the
[response header modifier](https://gateway-api.sigs.k8s.io/guides/user-guides/http-header-modifier/).

Baseline/candidate offline checks, independent parsed comparison and four deliberate wrong-policy/
scope/timeout/host counterexamples pass. The historical counterexample label `missing-stream-header`
actually injects zero max-age on the stream; its bytes and refusal are preserved. Server-side dry-run
accepts the routes without applying them. The read-only preflight finds a ready existing deployment,
retained Bound PVC and healthy backups with no unprotected change. The cumulative backup failure
counter is998; that historical counter is retained rather than described as zero failures. Production
currently has no HSTS header. VPN connectivity was needed for the private API; no credentials are saved.

## Handoff and evidence custody

The [member index](evidence-index.json) binds every archive member, and [copy index](artifact-index.json)
binds adjacent files. Reproduction helpers, TAP/raw logs, exact probe, retained apparatus failures,
render comparisons and public preflight metadata are included. Image/source tar archives, private keys,
database/profile data, dependency trees and scanner databases stay out of the repository packet.

1. Run the [carry-forward comparison](check-image-carry-forward.py) and fresh routine bookkeeping on
   the documentation tree, push the signed application branch and open its PR. The operator merges
   with a merge commit, preserving signatures. Compare merged build inputs again before publication.
2. Publish this exact tested image to the existing private package as
   `ghcr.io/thomasingalls/done:dc53fecf`. Verify private visibility, index/runtime digests, authenticated
   pull and retained reader rollback. Publication is separate from deployment.
3. Refresh ol-infra again, preserve unrelated advances, then prepare its signed image/HSTS/evidence PR.
   The operator keeps that merge button too. Reconcile using the current Justfile and Flux tier names.
4. Verify exact running image/build/assets, preserved identity/PVC, readiness, fresh backup upload and
   both HTTPS HSTS paths/HTTP redirect. Check cached-client adoption separately without clearing storage.

No image publication, infrastructure merge or deployment occurred in this checkpoint. The established
[publication procedure](../../account-local-retention-publication.md#publication-sequence-and-rollback)
governs those later operations. The source/image identities above remain the publication authority;
later documentation commits do not silently relabel the artifact.
