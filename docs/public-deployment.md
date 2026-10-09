# First public deployment

2026-10-09. Agreed product/operations plan for `done.oxidationlabs.com`.
Implementation and focused checks are authorized. Release validation remains paused until after
publication and explicit operator resumption. The personal history-management walkthrough is deferred.

## Agreed scope

Deploy through `/Users/thomasingalls/Code/ol-infra`, following its Flux/Kubernetes, Gateway API,
cert-manager, SOPS/Kubernetes Secrets and retained-volume conventions. This is a fresh installation
with a new service identity and exact passkey RP `done.oxidationlabs.com`; no Tailscale account,
credential, database or browser-state migration is required. Leaving that installation behind does
not itself instruct deletion of its data or shutdown of the current processes.

Use SQLite with encrypted, consistent full snapshots sent to Backblaze B2, without Litestream for
this first implementation. The precedent in `infra/apps/https-advisory-demo` provides PVC and pod
lifecycle patterns. Its automatic restore and current Litestream backup path cannot simply be reused:
that application's pinned Litestream 0.5.17 rejects client-side age encryption, while ol-infra ADR 0006
requires authenticated encryption before application backups reach B2. Done's encrypted writing does
not encrypt all account metadata in its service database.

Brief sync outages during updates are accepted. Local editing remains independent of network
availability within the existing application contract. Do not claim transparent zero-downtime updates
or a fixed recovery window through network/storage failures.

## Backup contract

- Schedule at most one backup every 30 seconds while durable state changes. Never overlap jobs or
  accumulate a queue of missed ticks. Measure the age of the snapshot's consistent read point once
  its upload completes; a slow or failed run means the achieved recovery point is older.
- Read through SQLite's consistent backup mechanism, including committed WAL state. A raw copy of
  an open main database file is insufficient. Keep slow copying, compression, encryption and upload
  off the account service's request event loop.
- Compress before authenticated encryption using a maintained tool/format. Upload ciphertext only.
  Keep the backup decryption key recoverable independently of the cluster and distinct from the B2
  access credential and application operator wrapping key. Never store a plaintext key beside its
  encrypted backup in B2.
- A complete recovery set includes `account.sqlite`, the initialized authority database, public pin,
  database schema versions and the relevant application artifact identity. The operator wrapping key
  is separately recovered through the approved SOPS/operator custody pathway. Verify the files belong
  to the same service. The authority database is currently immutable after initialization; re-evaluate
  snapshot coordination if that changes.
- Retain roughly ten recent snapshots (30-second cadence over five minutes), one per hour for six
  hours and one per day for seven days, deduplicating overlapping selections. No weekly/monthly tier.
  Exact time-bucket boundaries must be documented and tested. Retention only removes objects belonging
  to this backup set; do not alter infrastructure-state backups or other applications' retention.
- Complete and authenticate a new backup before deleting superseded copies. Preserve the latest
  successful recovery set during failures, even if an outage exceeds the nominal retention window;
  surface that exception rather than deleting the last available backup.
- Create and verify an explicit pre-migration backup too, normally expiring under the same seven-day
  policy. Keep an in-progress migration's rollback copy until its outcome is resolved.
- Track backup age, failures, snapshot size and bytes uploaded. Full snapshots are intentionally a
  small-installation starting point. Increased database size can make upload bandwidth and copying
  expensive even with short retention; report that before silently weakening the cadence.

These are whole-service disaster-recovery copies, not user-facing undo/history. They retain account
metadata and previously deleted ciphertext for their retention period. Application history pruning
is not immediate erasure of backup copies.

## Separate lifecycle procedures

### Ordinary application update

Publish an immutable image and pin its digest in ol-infra. Preserve service identity and use the
existing database only if its schema is compatible. Drain admitted operations and notification streams
before replacing the single writer; expose readiness only after opening and verifying retained state.
Keep packaged app serving and the account service as separate processes, initially colocated in one
pod. The browser still uses the waiting-worker policy, so API compatibility with cached earlier clients
must be explicit. A Git revert can select an earlier image only if it supports the current schema.

### Schema migration

Stop/withdraw the writer, obtain exclusive maintenance ownership, create a complete verified backup,
then run an explicit version-bounded migration from the target image. An interrupted operation must
have an identifiable outcome and safe retry. Verify schema, retained rows/identity and cold open before
serving. Flux reconciliation must respect the maintenance sequence instead of racing a migration Job
with a newly started writer. Prefer forward repair after new writes have been accepted; restoring a
pre-migration database is a data-recovery operation, not an ordinary image rollback.

### Disaster restore

Select a particular complete backup and restore it into an isolated destination. Verify encrypted
payload authentication, archive bounds, database integrity, schema and service identity before making
it eligible for serving. Explicitly distinguish first initialization, ordinary startup and restore;
missing storage must never silently initialize a replacement service identity.

The current session-counter construction requires invalidating restored sessions and outstanding
login/grant capabilities, then refreshing the session-custody salt/key context before issuing again.
Preserve the long-lived service identity and account/content credentials. This repair is necessary
but insufficient by itself: restored membership and acceptance ledgers may lag evidence already held
by clients. Determine an explicit recovery disposition for that case before claiming a restore can
resume ordinary writes. Do not erase client rollback protection or treat an older signed state as fresh.
A focused restore rehearsal is implementation evidence, not a reopened release-validation campaign.

## Implementation sequence

1. Complete: record this plan and integrate the signed history through PR #41's merge commit
   `8c6005f3`, preserving phase ancestry and the original-to-signed crosswalk. Continue implementation
   on `codex/first-public-deployment` from that merge.
2. Complete: the routine-build/paused-full-check CI split, public service entry, explicit
   initialization and container packaging with immutable configuration, single-writer ownership,
   graceful stop and readiness. Development entry points remain available. The bounded ARM64
   container checks and operating contract are recorded in [public runtime](./public-runtime.md).
3. Implement isolated consistent snapshot creation, encryption, B2 upload, bounded scheduling,
   retention and health reporting. Use disposable state and a controlled object destination first.
4. Implement the versioned maintenance/migration and restore procedures, including the session and
   client-history restore boundaries above. Exercise focused interruption/identity cases and one
   complete backup/restore rehearsal.
5. Prepare a dedicated done application directory in ol-infra, separate from existing applications:
   retained PVC, service/app processes, backup owner, secrets references, probes, HTTPS listener/route,
   DNS opt-in and image pins. Match ARM64 and the existing cluster's security/resource conventions.
   Enforce exclusive state ownership in the application/maintenance entry too; a Recreate rollout
   alone is not a general proof that competing processes can never overlap.
6. Resolve the remaining environment inputs, present the concrete deployment for approval, then
   publish through the infrastructure repository's normal workflow and check the actual origin.
   Do not start generalized qualification or the deferred personal history walkthrough.

## Git and remaining environment inputs

The operator selected ordinary PR merge commits to preserve the validation tools' ancestry model,
disabled linear history and made merge the only allowed method in both settings layers. Main still
requires PRs and verified signatures and blocks force pushes/deletions. PR #41 merged as `8c6005f3`;
its parents are the previous main `c61ad005` and signed PR head `f1b91985`. Its tree equals the PR head,
all 398 PR commits remain ancestors, and GitHub verifies the merge signature. The
[signing record and crosswalk](./commit-history/README.md) preserve traceability for 102 unsigned
replacements plus one re-signed descendant. Historical evidence is unchanged. Local main and the
deployment branch were fast-forwarded; no history rewrite or squash-specific validation adaptation
is needed. Three existing root notes remain untracked and excluded. New PR/deployment commits are signed.

The merged CI configuration separates automatic `pnpm build` from the manually opted-in full
`pnpm check`. The application build passed on the PR. The full check includes broad validation
campaigns and remains paused; it was skipped by the PR run.

Implementation need not wait for these final environment inputs: image registry/repository and push
access (the infra precedent uses Codeberg), B2 bucket/region/prefix and restricted application key,
backup recipient/recovery-key custody, and the new operator wrapping key. Prepare references and verify
existing operator tooling without decrypting unrelated credentials. Generate or apply service identity
only in an explicit initialization step. The operator authorized publishing the signed work through
the PR route. Public application deployment and infrastructure publication remain separate steps.

## References

- `ol-infra/infra/apps/https-advisory-demo/LITESTREAM.md` and its manifests: existing SQLite deployment.
- `ol-infra/docs/adr/0006-client-side-encryption-and-backblaze-dr.md`: encryption and off-cluster custody.
- [Session restore requirement](./account-session-core.md#custody-transactions-and-retention).
- [Packaged application](./packaged-account-development.md) and [history management](./account-history-management.md).
- [Litestream encryption support](https://litestream.io/reference/config/#encryption).


## Repository preparation checkpoint — 2026-10-09

Historical checkpoint before the operator identified the main protections. The later
[PR/signing reconciliation](./commit-history/README.md) supersedes its local-main integration route.

The agreed plan was recorded in `37795ea6`. Local main now includes the prior branch through signed
merge `a4473d5e` (parents `c61ad005` and `37795ea6`). Its SSH signature was verified against the
configured signing public key, and the merge tree exactly matches the source branch. Existing commit
hashes and all evidence files remain intact. The broad old-main-to-branch whitespace check reports
historical logs/patches; those archival bytes were not reformatted as part of this integration.

Work continues on `codex/first-public-deployment`. CI separation is prepared there: push/PR/default
manual runs perform the existing application build; the full `pnpm check` job requires the explicit
manual `run_full_check` input. Automatic CI is named Application build and does not claim unit, native
or release qualification. The complete build command's constituent checks passed locally on Node
26.11.0: Yjs patch/runtime checks, TypeScript, bundling, 136.6 kB initial JS against the unchanged
350 kB limit, and the built-origin scan. Workflow YAML parses. The pinned CI Node version remains
24.18.0; this is not evidence of a GitHub-hosted run. No broad campaign was run.

Neither repository was pushed. Main must include this CI separation before its first push; its signed
integration commit alone still contains the earlier automatic full-check workflow. The infrastructure
repository and running Tailscale processes were unchanged. Next is the public runtime/initialization
and container implementation. Environment credentials are only needed at the publication boundary.
