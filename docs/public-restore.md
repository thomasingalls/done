# Operator-led public backup recovery

2026-10-10. Implements isolated backup recovery under the operator's selected
[first-publication scope](./recovery-options.md). It does not implement automatic history reconciliation,
automatic failover, an older-schema migration, or a command that publishes rewound account history.

## Operator procedure

1. For a real incident, stop public account traffic and fence the old writer before considering any
   replacement. Coordinate Flux reconciliation so it does not restart a writer during maintenance.
   Preserve the existing volume, logs, service pin and wrapping key. A storage outage is not evidence
   that data is gone; recover intact current storage rather than restoring an older copy when possible.
   A rehearsal may run alongside the service because its destination is independent.
2. Select a specific complete B2 backup version. Download ciphertext and record its exact version ID,
   SHA-256, capture time and source image/revision in the incident record. Use the digest from the
   selected verified upload, not an arbitrary replacement file. Keep the original ciphertext. There
   is no automatic latest-backup selection or B2 download in the restore command.
3. Recover the matching operator wrapping key and independently recorded public pin. Supply the age
   recovery identity through a temporary, private operator mount. Do not mount that identity into
   the normal API, put it beside the backup in B2, or print it in command output.
4. Use the compatible runtime image and an isolated destination owned by its UID (65532). The parent
   directory must already exist. The destination may be absent or empty, or contain this exact restore's
   retained progress. It must not be the live state directory. The command acquires the same stable
   ownership lock as initialization and serving, and refuses live/unclassified state.

```sh
export DONE_PUBLIC_ORIGIN=https://done.oxidationlabs.com
export DONE_STATE_DIR=/data/recovery/incident-001
export DONE_OPERATOR_KEY_FILE=/run/recovery/operator.key
export DONE_SERVICE_PIN_FILE=/run/recovery/expected-pin.json
export DONE_RESTORE_ARCHIVE=/run/recovery/selected.tar.gz.age
export DONE_RESTORE_SHA256=REPLACE_WITH_SELECTED_CIPHERTEXT_SHA256
export DONE_RESTORE_IDENTITY_FILE=/run/recovery/age-identity.txt
# The packaged image supplies DONE_SOURCE_REVISION. Direct Node runs must supply its full source hash.
node scripts/public-account.mjs restore
```

Use the runtime image's `restore` entrypoint argument in Kubernetes. It needs writable space for the
original recovered snapshot and a separate candidate, each bounded by the archive limits, plus SQLite
working space. Provision a size-bounded volume with headroom; do not use the runtime's small `/tmp`.
The command opens no listener, starts no backup worker, and needs no provider credentials or network.
Missing paths, schemas or custody never initialize substitute state.

5. Read the JSON result. Success is **`phase: quarantined`**, with **`servingAllowed: false`** and
   **`historyContinuity: not-established`**. It records the backup and restore revisions, capture time,
   file digests, schema and counts of invalidated session records. It is evidence of a verified backup
   and prepared candidate, not authorization to resume the service.
6. Make and record the incident's recovery disposition as described below. Remove the temporary
   recovery-key mount when finished. Preserve or explicitly remove isolated plaintext artifacts according
   to incident needs; process cleanup is not forensic erasure.

## What is verified and retained

Extraction uses a streaming tar parser with exactly five allowed regular filenames. It refuses links,
directories, duplicate or missing entries and path traversal. The account database is limited to 1 GiB,
the authority database to 1 MiB, and each JSON file to 8 KiB; ciphertext and total decompression also
have bounds. Archive/decryption has a five-minute deadline. Partial plaintext may be written only in
the private isolated snapshot directory. SQLite is not opened until complete age authentication and
the selected ciphertext SHA-256 both succeed.

The tool checks exact manifest fields and file hashes, schema 26/account and 1/authority, SQLite
integrity and foreign keys, the independently supplied pin/origin, sealed authority opening with the
operator key, and the retained session-custody key check. This verifies internal consistency and
decryption, not that a backup contains the newest history or that every application artifact has been
semantically revalidated. Digest selection is not a new service-signature protocol.

The output layout is intentionally not an API-serving layout:

```text
incident-001/
  ownership.sqlite
  restore.json         preparing or quarantined; never a serving permit
  snapshot/            original five recovered files
  candidate/           separate four-file store with network custody reset
```

Only the candidate is cold-opened through the current account owner. In one transaction it deletes
network sessions, session attempts and enrollment/session links; expires base passkey ceremonies and
open base credential attempts; and installs a fresh random session-custody salt/check with counter zero.
Previously sealed session results cannot be opened under the new key derivation. Access tokens and
scoped grants are process-local and are not recovered. Account credentials, content and service identity
are preserved. Pending domain ceremonies and membership artifacts remain evidence; this is not a claim
that all account lifecycle progress is now safe to resume.

Both cold checks finish and database connections close before completion. The tool refuses nonempty
uncheckpointed WALs, removes empty SQLite sidecars, fsyncs the recovered files/directories, then atomically
publishes the completed report. There is no `store/` directory. The API explicitly refuses a root with
`restore.json`; initialization also rejects it as unclassified state. Never rename `candidate/` to
`store/` or remove the marker to bypass the recovery disposition.

## Interruption and retry

Repeat the same command with the same selected ciphertext digest and expected pin. An interrupted
`preparing` attempt can discard only its classified isolated snapshot/candidate files and rebuild them
from that archive. Wrong inputs or unclassified files refuse and remain available for inspection.
Never point a retry at a production directory or a different selected archive.

A completed retry checks the preserved snapshot and the candidate's recorded hashes and returns the
same report without another custody reset. Modified candidates and nonempty WALs refuse. A process
death releases the ownership lock; the lock inode is never removed or replaced. A very early crash
leaving unbound progress files may require inspection and a new empty destination. Failure leaves no
serving-eligible output. The operator may remove an abandoned isolated attempt once it is not owned;
no automatic cleanup touches a live installation or the external archive/key inputs.

## Recovery disposition and accepted loss

The preferred outcome is to recover intact current storage, which uses ordinary startup rather than
this older-snapshot path. If independent evidence establishes that a candidate has not lost externally
visible decisions, a separate incident-specific promotion procedure can be prepared and reviewed. This
version intentionally supplies no generic promotion command or operator-acknowledgment bypass.

If the snapshot may precede revocation, membership changes or accepted writing, it remains isolated.
Ask affected users to preserve local writing and supported exports while their profiles still open;
do not clear their storage first. Recover what is available through an explicitly fresh service/account
setup and the supported content import flow. This changes identity and may lose content, attribution,
editing history or device associations. A fresh pin will not silently match retained client bindings.
Client setup, archive suitability and any import need incident-specific instructions; the tool does
not claim it can decrypt server-held writing without the user's required factors or convert the
restored database into an import archive.

Where all usable copies or required factors are lost, some writing may be unrecoverable. The operator
accepted that first-release risk; it does not authorize claiming an old revocation is undone or clearing
client rollback evidence. [Recovery choices](./recovery-options.md) records ways to reduce this exposure
later. The normal API remains independent of B2 availability under the existing snapshot policy.

## Focused implementation evidence

The disposable tests exercise real age archives, authenticated credential/session fixtures, preservation
of writing and authority, old-token refusal, fresh custody rejecting old seals, and new session issuance
inside the isolated test candidate. They cover five interruption boundaries, a real SIGKILL after the
reset commit, CLI retry, changed-input/candidate refusal, wrong key/pin/hash, ciphertext tampering,
foreign-key/schema/file-digest failures, malicious archive entries and public startup refusal.

Restore testing exposed macOS system tar adding AppleDouble metadata entries. Backup creation now uses
the same maintained streaming tar package to emit exactly the five recovery files on both platforms.
Archives with extra platform files are refused; no deployed public backups exist that need a compatibility
exception. The library supports USTAR/PAX parsing; extraction still enforces the fixed application allowlist.
See [tar-stream's contract](https://github.com/mafintosh/tar-stream).

These are bounded implementation checks, not resumed release qualification. Public provider-backed
upload/download/decrypt, real recovery-key custody and infrastructure activation remain deployment inputs.
