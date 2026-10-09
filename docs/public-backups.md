# Public service backups

Implementation of step 3 in [the deployment plan](./public-deployment.md). Public activation and
release qualification remain separate. Coherent SQLite snapshots, a standard encrypted archive,
scoped B2 transfer, the serial backup/retention cycle and API-owned worker are implemented. Container
verification and evidence close this bounded phase; real-provider activation remains later work.

The API's verified state owner owns one backup worker. The worker uses a separate read-only
SQLite connection and an explicit read transaction before calling the online backup API, fixing a
WAL read point while the API can continue writing. The authority database and public metadata are
immutable during that owner's lifetime. Schema, policy, pin and copied SQLite integrity are checked.
Shutdown must stop the worker before releasing lifetime ownership. A backup is not a second writer
or an independent maintenance owner.

The transient recovery set contains only `account.sqlite`, `authority.sqlite`, `pin.json`,
`manifest.json` and `backup.json`. The last file records the source revision, schemas, conservative
capture time, pin and file sizes/hashes. Operator keys, ownership locks and work-directory contents
are excluded. A private transient directory holds database copies; tar output streams through gzip
and age into ciphertext, without a plaintext archive file. One X25519 age recipient is configured;
the independent decryption identity is not mounted into the service. The initial source bound is
1 GiB, with refusal rather than an unbounded disk/memory workload. Restore must authenticate and
validate the full set before publishing anything; a SQLite copy alone does not authorize service
restart after history rollback.

Retention uses snapshot capture time. Keep all snapshots at most five minutes old, the newest in each
of the current and five preceding UTC calendar hours, and the newest in each of the current and six
preceding UTC dates. Deduplicate these selections. Keep the current verified anchor even if older
than seven days, and preserve future-dated objects through clock rollback. Unknown names and other
service namespaces are not candidates. Explicit maintenance backups will use a separate name class
and require a later maintenance disposition; routine retention must not silently release a migration
rollback copy.

## B2 transfer and scheduling contract

Use the B2 Native API rather than S3 hide/delete-marker behavior. The application key must be restricted
to exactly one configured bucket and the configured opaque `done-backups/<32 lowercase hex>/` prefix,
with list/read/write/deleteFiles capabilities. The client checks the authorization response before
transfer and narrows names again to a hash of this service's complete pin. It never contacts an
unconfigured provider: credentials go only to the B2 authorization endpoint, and subsequent endpoints
must be HTTPS B2 hosts without credentials/ports/redirects. API error bodies, credential values and
provider tokens are not logged or exposed through health.

Each ciphertext gets a new name containing capture time, random ID and SHA-256. Upload includes B2's
required length/SHA-1 transport checksum. Success requires reading that exact returned file version
back and matching its length and SHA-256. Only then does that snapshot cover the observed database
version. A lost response or failed readback preserves the dirty state and prevents pruning; retry
uses a fresh name. Incomplete/uncertain remote copies may remain until a later successful cycle.

Retention obtains a bounded, complete version listing (up to 100 pages of 1000) and requires the exact
verified anchor. Before deleting alternatives, it verifies unfamiliar versions chosen as hourly/daily
keepers too: an unverified or corrupted upload cannot displace a good older copy. Successful checks
are cached per immutable file version and metadata for this process. Deletion names each file version
explicitly. Wrong namespace, unknown/maintenance names and incomplete/repeated pagination never
authorize deletion. Object-lock refusal is surfaced, never bypassed. No bucket lifecycle rule should
independently expire these recovery sets or their current anchor.

The worker starts with a fresh backup, then observes changes every 30 seconds. Ticks coalesce while
work is running; they never overlap or queue. SQLite `data_version` is connection-local, so a restart
always requires a fresh verified copy before any retention; it does not reuse a prior process's
counter. Writes arriving after the snapshot remain pending for the next cycle. While unchanged,
there is no upload; every five minutes the worker re-verifies its anchor and applies retention.
Failures preserve the latest verified recovery set and retry at a later tick. Each attempt has a
five-minute transfer/encryption deadline and individual HTTP requests have a two-minute deadline.
SQLite copy completion is awaited before cleanup; the initial 1 GiB capture bound also limits that
work. Slow/failed backups mean an older achieved recovery point, not a guaranteed 30-second RPO.

Temporary plaintext lives only in the configured private workspace, excluded from the recovery set.
Completed/failed attempts remove it; cleanup failure stays unhealthy and must be resolved before
new work. A restarted owner reaps only owned `run-<32 hex>` directories in that dedicated workspace,
refusing unclassified entries. Provision a dedicated ephemeral, size-bounded directory per service
pod; never share it between independent state owners. Process-crash cleanup is not forensic erasure.

## Runtime configuration and health

Set `DONE_BACKUP_CONFIG_FILE` to an absolute, externally mounted JSON file on the **API** process.
The runtime image supplies `DONE_SOURCE_REVISION` from its build revision. A direct Node invocation
must supply the full commit hash (optionally `-dirty` for a development fixture) explicitly.

```json
{
  "v": 1,
  "bucketId": "REPLACE_WITH_B2_BUCKET_ID",
  "prefix": "done-backups/REPLACE_WITH_32_LOWERCASE_HEX/",
  "recipient": "REPLACE_WITH_ONE_AGE_X25519_PUBLIC_RECIPIENT",
  "credentialsFile": "/etc/done/backup-credentials.json",
  "workDirectory": "/backup-work/service"
}
```

The separately mounted credentials JSON has exactly `keyId` and `applicationKey`. It must be a
regular file without other-user permissions (projected root-owned/group-readable secrets are allowed).
Configuration, credentials and workspace must resolve outside retained state; the workspace must
not contain either configuration or credentials. Provision the existing workspace directory owned by
UID 65532 with mode 0700 before starting the API. Use a dedicated ephemeral volume with enough room
for both the bounded snapshot and ciphertext, rather than the image's small `/tmp`. Initialization
of this empty workspace is routine pod preparation; it does not initialize or restore the service.

Use a private B2 bucket with an application-specific restricted key/prefix. Supply only the age
**public recipient** here. Keep the corresponding recovery identity off-cluster, recoverable and
tested separately from SOPS/operator wrapping-key custody and B2 access credentials. Before enabling
the real deployment, verify an actual uploaded recovery set using that saved identity; this phase's
test identities were disposable and are not deployment custody.

No backup config means backups are explicitly reported **disabled**, preserving existing development
entry points; the public deployment must configure this feature and check it before activation.
Malformed configuration fails startup. Runtime backup failures do not take down sync or masquerade
as a successful backup. Unexpected worker exit stays unhealthy until the process is restarted.

GET `/backupz` on the loopback API returns JSON and status 200 when backup health is good, 503 for
disabled/not-yet-successful/failed/stale/stopping states. It is not exposed through the app gateway.
`node scripts/public-healthcheck.mjs backup` is an exec check for monitoring/activation, **not** API
liveness: restarting healthy sync repeatedly during a B2 outage would not repair that outage.
The existing app/API readiness probes are independent.

Health reports stage, last failure stage/count, last observation/upload/prune times, snapshot capture
age, snapshot size, latest/total verified-upload bytes and attempted-upload bytes. Attempted bytes are
an upper estimate of wire bytes during uncertain failures; verified bytes do not include failed
attempts. These counters reset on restart. `dirtySince` is the first observed outstanding change,
not a per-edit timestamp; detection waits for a tick, or for an already-running cycle to finish.
More than 90 seconds of
observed pending changes is unhealthy. A five-second worker heartbeat becomes stale after 15 seconds.
An old snapshot can be healthy while unchanged, but its capture age remains visible. No row contents,
credentials, object IDs or provider error payloads appear in this endpoint.

Shutdown withdraws admission, drains admitted API operations, cancels/awaits the backup worker,
then closes databases and releases ownership. An interrupted remote upload may leave an extra
ciphertext version. The next owner takes a fresh verified snapshot before pruning. The service
does not restore a backup automatically or bypass the session/history rollback questions.

## Focused evidence

The snapshot check commits one WAL record, anchors a backup read transaction, then commits another
record through a separate connection. The first snapshot contains only the first record; the next
contains both, with change detection retaining the later write. A genuine age encrypt/decrypt round
trip verifies the exact archive membership and all file hashes; a modified payload fails age
authentication. A changed source pin refuses capture. Directed retention checks cover boundaries,
deduplication, the old verified anchor, clock rollback and ambiguous/missing anchors. These are
implementation checks, not a release campaign.

The controlled loopback B2 fixture checks actual streamed encrypted uploads, exact-version readback,
pagination and permanent version deletion. It exercises broad-key refusal, unexpected upload-host
refusal, lost accepted upload replies, corrupt readback, an unverified hourly keeper, deletion failure
and retry, unrelated/maintenance-file preservation, repeated cursors and coalesced/cancelled work.
No real bucket, credentials or remote deletion were used. A provider-backed upload/readback and
recovery-key rehearsal remain activation checks once deployment inputs are available.

A real API child process and its worker also pass against that fixture: backup readiness, temporary
crash-artifact cleanup, single-owner refusal, acceptance of a registration, SIGKILL/restart, a fresh
backup containing that accepted registration, archive decryption, and graceful stop followed by cold
ownership acquisition. The candidate Node 24.18.0 ARM64 image passes the application build and all
19 focused public-runtime/gateway/backup checks. Host checks used age 1.3.2; the image uses Debian's
age 1.1.1-1+b3. The final clean-source image `done-public:8923599e` passes those 19 checks as UID 65532
and the separate packaged two-container smoke. Its index digest is
`sha256:542f028bd89d103b0b98e1068f061580fd5b57f2a8940857977625007a46e865`.
[Exact source/image evidence, raw build log and limits](./development-evidence/2026-10-09-public-backups.json)
are retained. No image has been published. The packaged smoke checks runtime packaging/restart with
backups disabled; the backup worker's actual upload/readback is exercised in the non-root build tests
against the controlled B2 fixture. Next is maintenance and rollback-safe restore.

## Primary contracts

- [SQLite online backup](https://www.sqlite.org/backup.html).
- [age format and implementation](https://github.com/FiloSottile/age).
- [B2 authorization and scoped keys](https://www.backblaze.com/apidocs/b2-authorize-account).
- [B2 file-version listing](https://www.backblaze.com/apidocs/b2-list-file-versions) and
  [permanent version deletion](https://www.backblaze.com/apidocs/b2-delete-file-version).


## Operator restore addition — 2026-10-10

The [operator recovery command](./public-restore.md) now decrypts selected archives into isolated
storage, verifies identity/schema/integrity, resets session custody and leaves the result quarantined.
It never restores automatically or publishes an older ledger. Archive production now uses `tar-stream`
to emit exactly the five fixed files, avoiding macOS system tar's extra AppleDouble/xattr entries.
The selected backup/retention cadence and B2 availability behavior are unchanged. Future replication
choices are recorded in [recovery options](./recovery-options.md), without selecting a commit log.
