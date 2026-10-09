# Offline schema maintenance and its pre-migration backup

2026-10-10. This is an operator procedure, distinct from an application-image update and from
[disaster restore](./public-restore.md). Release validation remains paused.

**The first public service uses schema 26. No older public schema has been deployed, and this image
contains no public schema-transition command.** The implemented commands prepare and protect a
verified backup, report interrupted progress, and resume the unchanged service. A future schema change
must ship its specific migration and focused tests in the target image. Neither arbitrary SQL from
configuration nor the private development upgrader is a supported public migration path.

## Before starting

1. Record the current immutable image digest, its full source revision, expected service pin and
   source schema. Review the proposed target image's compatibility with cached clients and schema.
   A same-schema image update normally uses graceful replacement and needs no maintenance job.
2. In ol-infra, suspend the relevant Flux reconciliation or commit an explicit maintenance state,
   withdraw API traffic, set the writer workload to zero and await its termination. Keep that desired
   state until maintenance completes. An ad hoc scale-to-zero while Flux still desires a writer is
   insufficient. This is runbook guidance; the manifests have not been installed yet.
3. Use the **source image** for preparation. Mount the same retained state and independently held
   operator wrapping key and expected pin. Supply its normal B2 configuration and credentials, plus
   the saved age recovery identity only to this offline process. The API and routine worker continue
   to receive only the public recipient. Remove the temporary recovery-identity mount after use.
4. Provision a private ephemeral backup workspace owned by UID 65532. Paths for configuration,
   credentials, wrapping key, expected pin and recovery identity must be outside the workspace;
   backup configuration/credentials/workspace and recovery identity must also be outside retained
   state. Keep this workspace dedicated to the same state owner. It may be replaced between jobs.
   Preparation needs room for a snapshot and decrypted verification copy (each bounded by the current
   1 GiB account-database limit), plus overhead. The retained volume temporarily also holds the
   encrypted archive, up to the existing ciphertext bound. This copy survives a job restart.
5. Choose a new random 32-character lowercase hexadecimal maintenance ID and record it with the
   operator change. Reuse that ID on retries; never use it for a second maintenance operation.

The stable `ownership.sqlite` lock enforces mutual exclusion even if the Kubernetes sequencing is
wrong. Never unlink or replace that inode. Maintenance also creates a durable `maintenance/` fence;
ordinary API startup and initialization refuse while it exists, including after the job dies.

## Commands available now

Use the existing public storage/service variables (`DONE_PUBLIC_ORIGIN`, `DONE_STATE_DIR`,
`DONE_OPERATOR_KEY_FILE`, `DONE_SERVICE_PIN_FILE`, `DONE_BACKUP_CONFIG_FILE`). The immutable source
image supplies `DONE_SOURCE_REVISION`. Set `DONE_MAINTENANCE_ID` to the recorded ID and, for preparation,
`DONE_MAINTENANCE_IDENTITY_FILE` to the temporary externally mounted age identity.

```sh
node scripts/public-account.mjs maintenance-prepare
node scripts/public-account.mjs maintenance-status
```

Preparation records the source file digests, schema, source revision, expected pin, recipient and B2
namespace before capturing anything. It includes nonempty WAL/rollback journals in the source
fingerprint; an unchanged main file is not proof of unchanged state. Empty SQLite sidecars and SHM
are excluded because they do not hold additional committed writing. Unknown files, changed identity,
changed source or incompatible schema cause refusal. It never opens the live account through a
writable core, resets sessions or modifies live counters.

The backup uses SQLite's pinned read point, the existing complete five-file payload, gzip and age.
It is decrypted using the saved recovery identity; archive authentication/bounds, file hashes,
integrity/foreign keys, schema, policy, authority and session custody are checked. A disposable copy
is cold-opened through the ordinary public owner checks. Only then is the ciphertext uploaded and
its exact immutable B2 version downloaded and hashed. Source equality is checked again before
`ready` is persisted. A five-minute attempt deadline bounds encryption and remote transfer; SQLite
copy completion and cleanup are awaited as in routine backups.

The record's phases mean:

| Phase | Meaning / next action |
| --- | --- |
| `incomplete-intent` | Process stopped while first creating the fence. Repeat preparation with the same configuration. |
| `preparing` | Starting state recorded; backup not yet complete. Repeat preparation or resume unchanged. |
| `uploading` | Ciphertext persisted; decryption/upload/readback may still need retry. This does **not** authorize migration. |
| `ready` | Decryption, cold open and exact-version upload/readback succeeded; source remains unchanged and fenced. |
| `resumed-unchanged` | Source equality checked and cancellation/rehearsal resolved. A retry finishes the atomic unfencing if needed. |
| `expired` | Resolved maintenance backup copies were pruned after the retention conditions. The receipt remains. |

A lost upload reply is recovered by listing the exact maintenance ID/name/digest, verifying that
immutable version, and persisting its receipt. A lost completion reply does not produce a new backup
or reset credentials. Classified scratch directories left by a killed job are reaped under ownership
on retry/resume (or by the next routine worker). Cleanup is not forensic erasure. Unclassified files
are preserved and cause refusal. An unreadable/tampered record requires inspection; do not delete the
fence to bypass it.

Since no transition ships today, the supported full rehearsal ends by resuming unchanged:

```sh
node scripts/public-account.mjs maintenance-resume
```

This also cancels a failed/incomplete preparation without needing B2 or the age private identity.
It checks the starting source fingerprint before recording resolution and atomically moving the
fenced directory to `maintenance-history/<id>/`. It cannot resume an altered database, even if only
the WAL changed. It cannot promote a quarantined restore. The record and local encrypted archive are
retained. Retry the same command after a lost reply; a completed ID is not reusable. Restart the
compatible source image, check API readiness and backup health, then restore traffic/reconciliation.
Normal session custody and remembered logins are retained; restore's invalidation rules do not apply.

## Contract for the first actual schema transition

Do not manufacture a schema change merely to exercise the machinery. When one is needed:

- Preparation runs with the source image as above. The target image must explicitly recognize the
  source schema and maintenance-record format, the target schema, and the allowed transition. Bind
  target artifact identity to a durable migration intent before any mutation. Recheck source equality
  and the exact protected B2 version; a stale `ready` report by itself is insufficient.
- Keep lifetime ownership and the persistent fence through migration. Use a transactional migration
  where possible, record its before/after outcome durably, and make a lost reply/restart distinguish
  committed target state from unchanged source. Specify recovery for any work outside that transaction.
- Verify retained account/content rows, service identity, session custody/counters, target manifest
  and schema, foreign keys/integrity, and a cold open before issuing the target completion record and
  releasing the fence. That target-image completion path does not exist in this schema-26 image.
- Add focused transaction-abort, process-death, retry, wrong-source/target and authority-continuity
  tests with the actual new schema. Include retention disposition for the resolved backup.
- Before new writes, failure recovery must still use an explicit supported transition or incident
  disposition. After new writes, prefer forward repair. Replacing the database with its pre-migration
  copy is disaster recovery, with its rollback/revocation/session risks, not a Git/image rollback.

## Protected-backup retention

Protected copies use
`<service namespace>/maintenance/<id>/<capture-ms>-<cipher-sha256>.tar.gz.age`.
Routine listing/pruning never selects these names. Active copies remain protected indefinitely,
even beyond seven days; no independent bucket lifecycle rule may expire them. Uncertain duplicate
uploads for the same ID are included when the resolved ID is eventually pruned.

For this first operator procedure, expiry is explicit rather than an online automatic deletion job:

```sh
node scripts/public-account.mjs maintenance-prune
```

Run under offline ownership with the same ID/source-image configuration, after resolution and at
least seven days from preparation. If resolution took longer than seven days, it is eligible once
resolved. The command additionally requires an exact-version verified **routine backup captured
at or after resolution**. It then permanently deletes only versions in that resolved ID's namespace,
removes the local encrypted archive and retains the metadata receipt. It never deletes a routine
anchor or another maintenance ID. Failed verification, incomplete listing, clock rollback, B2
outage/object-lock refusal or a missing newer routine backup preserves the copies and requires retry.
Copies may therefore live longer than seven days; this is deliberate, not silent successful expiry.
The public retention worker's recent/hourly/daily policy is unchanged.

## Focused evidence and boundaries

Disposable tests cover a genuine account/session surviving preparation and resume, competing-owner
refusal, exact ciphertext readback and lost replies, wrong recovery identity, six interruption points,
SIGKILL after upload, recovery of scratch plaintext, live-WAL changes, unsupported schema refusal,
scoped retention and preservation on failures. Missing source after completed maintenance cannot
silently initialize a replacement identity. Type checking and focused runtime/backup/restore
regressions accompany these checks. Signed source `ff3d4295` passes the application build and all 31
focused checks in the ARM64 image as UID 65532. The production-only runtime CLI rehearsal (with no
external network) and packaged two-container smoke pass too.
[Exact source/image evidence and logs](./development-evidence/2026-10-10-public-maintenance.json) are retained.
No real B2 bucket, production maintenance, Tailscale state, schema transition, deployment or release
campaign is exercised by these fixtures. The first real-provider upload/decrypt rehearsal remains an
activation requirement.
