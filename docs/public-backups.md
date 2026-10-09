# Public service backups

Implementation of step 3 in [the deployment plan](./public-deployment.md). Public activation and
release qualification remain separate. Coherent SQLite snapshots, a standard encrypted archive,
scoped B2 transfer and the serial backup/retention cycle are implemented. API worker composition and
container verification are the final integration checkpoint of this bounded phase.

The API's verified state owner will own one backup worker. The worker uses a separate read-only
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

## Primary contracts

- [SQLite online backup](https://www.sqlite.org/backup.html).
- [age format and implementation](https://github.com/FiloSottile/age).
- [B2 authorization and scoped keys](https://www.backblaze.com/apidocs/b2-authorize-account).
- [B2 file-version listing](https://www.backblaze.com/apidocs/b2-list-file-versions) and
  [permanent version deletion](https://www.backblaze.com/apidocs/b2-delete-file-version).
