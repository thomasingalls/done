# Public service backups

Implementation of step 3 in [the deployment plan](./public-deployment.md). Public activation and
release qualification remain separate. The first component is implemented: coherent SQLite
snapshots, a standard encrypted archive and retention selection. B2 transport, scheduling and runtime
composition follow in this same bounded phase.

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

## Focused evidence

The snapshot check commits one WAL record, anchors a backup read transaction, then commits another
record through a separate connection. The first snapshot contains only the first record; the next
contains both, with change detection retaining the later write. A genuine age encrypt/decrypt round
trip verifies the exact archive membership and all file hashes; a modified payload fails age
authentication. A changed source pin refuses capture. Directed retention checks cover boundaries,
deduplication, the old verified anchor, clock rollback and ambiguous/missing anchors. These are
implementation checks, not a release campaign.

## Primary contracts

- [SQLite online backup](https://www.sqlite.org/backup.html).
- [age format and implementation](https://github.com/FiloSottile/age).
- [B2 authorization and scoped keys](https://www.backblaze.com/apidocs/b2-authorize-account).
- [B2 file-version listing](https://www.backblaze.com/apidocs/b2-list-file-versions) and
  [permanent version deletion](https://www.backblaze.com/apidocs/b2-delete-file-version).
