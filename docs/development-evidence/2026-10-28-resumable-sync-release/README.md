# Phase157 — signed ARM64 editing, sync and resumable-maintenance candidate

2026-10-28. Canonical phases119–156 are committed individually, all38 signatures verified and every
intermediate tree matched. Signed source **`b6f0160a8fe7251407a3606cb653632f10885c81`** builds **`done-public:b6f0160a`**,
`linux/arm64`, from1,714 allowlisted source inputs. Image index **`sha256:f81bd4ba3621fc5c1fd28979d22c9605d522fd6ba5cf7b06eafde63cd2459872`**,
runtime manifest **`sha256:c82c05b3975dff745db8e0f8b280ec161b6bb277225d1c320242e2e357b1d7bf`**. The exact image archive stays locally
retained; neither it nor source tarballs, dependencies, browser profiles, keys or databases enter
this evidence packet. Later documentation commits do not relabel or rebuild the tested image.

The release improves Goals typing/context/navigation and mobile card reordering; bounds backup
readback to one verification cycle/hour with quota backoff while retaining five-minute local checks;
and improves receive/publication pacing, opening/first-conversion proof reuse, maintenance status and
durable resumable preparation. It preserves writing, undo, authentication, native/witness/authority
and final-commit checks. Local history reduction preserves user-visible writing; it is not automatic
server history deletion. Server service-history automation remains **off**.

## Selected build and exact-artifact checks

The image explicitly compiles `VITE_ACCOUNT_RETENTION_AUTO=1`, `VITE_ACCOUNT_RETENTION_RESUME=1`,
`VITE_ACCOUNT_HISTORY_AUTO=0`, `VITE_ACCOUNT_BATCH=coordinated-2000`. Reader/installer/writer gates
remain coherent. Independent parsing of the actual extracted frontend confirms those gates and
its exact360-input verifier-source fingerprint. Source resume/service defaults remain0; these are
build choices, not live container environment switches. Unknown/stale preparation receipts cannot
supply opening authority; originals remain independently checked and final reduction requires its
existing fresh guards.

- **38 final-image cases pass** at existing deadlines:16 runtime/gateway,10 backup,6 restore,6
  maintenance. The actual distroless Node24.18.0/age1.3.2 image runs as65532, excludes shells/package
  managers, retains CA trust, passes six old/new age round trips and12 wrong-key/tamper refusals.
- The unchanged two-process container smoke passes8 checks: initialization, exact-origin boundaries,
  duplicate-writer refusal, all packaged service-worker assets, SIGKILL/restart ownership and identity,
  graceful shutdown and idempotent initialization. Disposable containers/volumes are cleaned up.
- Both protected original/joined profiles upgrade from the extracted production frontend `dc53fecf`
  through the actual service worker without clearing storage. Queued/offline writing, wrong-code
  refusal, undo/redo, lock/reopen, two-way delivery, automatic conversion, rollback to `dc53fecf` and
  return to this candidate pass. No runtime instrumentation/rebuild is added to either frontend.
  Candidate host Node24 backend remains throughout; this is not a predecessor-server rollback test.
- **7 fresh native source cases pass**: four encrypted-journal crash/abort/commit cases, two composed
  owner/scheduling cases and one progress/cold case. These use disposable native browsers and the
  signed source; they are not represented as tests of the immutable frontend bundle.
- **40 contract/vector leaf commands and175 metadata cases pass** under Node24.18.0. The full
  source-equivalent191-file unit run is reused:2,211 pass/1existing skip. No old tests/assertions or
  deadlines were removed/changed for release prep. Final bookkeeping/build-budget/origin checks are
  recorded separately below; generalized qualification remains paused.
- The exact candidate rejects an untrusted TLS certificate, accepts an explicit disposable CA and
  accepts public HTTPS with default CA verification. Public trust uses a recorded host DNS result;
  no TLS verification is disabled.

All86 candidate frontend files remain byte-exact after rehearsal. All122 runtime source files match
the signed archive; relative to production, only `account-service/backup/b2.ts` and
`account-service/backup/cycle.ts` change in that runtime inventory. Service wire/schema/identity
boundaries remain. The candidate is still the single tested image, not an equivalent later rebuild.

## Performance, proof and device limits

Reuse [phase156](../../performance-experiments/2026-10-28-envelope-projection/phase156/README.md):
both rebuilt clients pass four fixed normal/withheld/full-history/two-receiver journeys, local p95
9.189–9.686ms (16ms gate), peer p951752.818–2419.896ms (2500ms gate) and every marker<=2500ms.
Keep30s late delivery, actual preparation, undo, complete/offline writing, worker/resource and
independent native signature/ciphertext/prefix/old-proof/unrelated-account guards. All prior failed,
invalid and unexecuted cases remain recorded. No new baseline, retry for a better result, or image/
Android performance claim is made. These are four scoped synthetic trajectories, not a universal
latency/capacity guarantee. Numeric observation probes used in timing are absent from this image.

The physical Android walkthrough remains explicitly deferred by the operator. General935 obligations/
389 unresolved qualification remains paused, with no aggregate credit. Continue to distinguish
implemented, tested, enabled, deployed and observed on devices. Shipping this candidate would enable
bounded local preparation resumption while leaving service automation off.

## Production preflight and rollback boundary

Authenticated current infrastructure main **`27369a806d94ee88bb8c55405a3dec536f49cfbd`** passes its offline deployment,
security and operator-operation checks. Two SSH reads closed and anonymous HTTPS refused access;
explicit existing-key IPv4 SSH succeeds, with no global configuration changes. The current paths
remain `infra/apps/done/components/runtime/` and `infra/apps/done/public/`; preserve existing HSTS,
notification-stream timeouts, service identity, PVC and backup configuration in the later pin PR.

Read-only production preflight finds the existing Deployment ready1, retained Bound10Gi PVC and
exact established immutable public service pin. It still runs `dc53fecf` at the retained index
`sha256:1869aa2c05c0e6ba5b6c3b85df7bf9bca50a4692c80201fe5af39424c2a37cbf`. Backup health is200/healthy, no unprotected change; the historical
failure counter is1484, not zero. No backup download, account-content read, storage reset or cluster
mutation is requested. Recheck current main and live health before any later pin/reconciliation.

The exact production frontend rollback is rehearsed on both newly reduced profiles. Retain that
image/source tag and the earlier reader-only `d8b3f22b` fallback; authenticate remote pulls again
before the infrastructure PR. The reader-only fallback can stop future automatic maintenance as
cached clients adopt it, but it is not newly rehearsed here. Rolling back an image does not restore
removed technical history or undo accepted writing. Auxiliary preparation journals are recomputable,
not new content authority; preserve account/browser storage and server identity throughout.

## Handoff

[Source/image/verification identities](verification.json), [signed phase mapping](signed-commits.json),
[source-equivalent carry-forward checks](carry-forward.json) and the indexed raw evidence accompany
this checkpoint. Source/image archives stay outside Git. Final13 ordinary checks and their receipt-
bound traceability are recorded in `ordinary-results.json`; refresh machine-local receipts after
signing because committing changes their tree identity.

1. Commit this documentation checkpoint, independently compare all1,714 build inputs, push the
   signed application branch and open its PR. Preserve signed identities with a merge commit.
2. **The operator keeps both merge buttons**, per the [publication procedure](../../account-local-retention-publication.md#publication-sequence-and-rollback).
   After the application merge, verify merged inputs again and publish this exact tested image to
   the established private registry only after the exact destination/tag/digest approval required
   by the publication step. Verify remote digests, visibility and authenticated pull.
3. Refresh current ol-infra and prepare the minimal immutable image-pin/evidence PR. Its operator
   merge precedes reconciliation through the current Justfile and Flux tiers; publication and
   deployment remain distinct operations. No schema migration/operator job is part of this release.
4. Verify actual running image/assets, identity/PVC/readiness/backup health and cached-client adoption
   separately. No storage clearing or credential sharing. Phone performance remains unobserved.

This checkpoint publishes no image and changes no infrastructure or deployment.
