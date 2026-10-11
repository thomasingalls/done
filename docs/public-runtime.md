# Public runtime and explicit initialization

This implements the runtime boundary from [the public deployment plan](./public-deployment.md).
It reuses the current account protocol, remembered sessions, scoped grants and membership flows.
It does not deploy an origin, migrate the Tailscale installation, implement restore or resume release
qualification. [Encrypted backups](./public-backups.md) are an optional configured worker owned by
this API. The development entry points remain separate and available.

## Process and configuration boundary

`node scripts/public-account.mjs` requires exactly one command:

- `initialize`: create a fresh service explicitly, or verify a completed initialization after a lost
  reply. Print the public pin as JSON; never print or generate the operator key.
- `api`: verify existing state and external identity/key configuration before listening on loopback.
- `app`: load the packaged PWA and proxy to the fixed loopback API. This process requires no state,
  pin or key mounts and can serve assets while the API is unavailable.

| Variable | Required by | Meaning |
| --- | --- | --- |
| `DONE_PUBLIC_ORIGIN` | all | Exact canonical HTTPS origin, initially `https://done.oxidationlabs.com`; RP equals hostname. |
| `DONE_STATE_DIR` | initialize, api | Absolute private directory, e.g. `/data/service`; its parent must exist and be writable. |
| `DONE_OPERATOR_KEY_FILE` | initialize, api | Absolute externally mounted file of exactly 32 raw bytes, with no other-user permissions. A root-owned/group-readable Kubernetes projected Secret is supported. |
| `DONE_SERVICE_PIN_FILE` | api | Absolute externally mounted public pin JSON, provisioned from the initialization result. |
| `DONE_APP_PORT` / `DONE_API_PORT` | app, api | Distinct unprivileged ports; defaults 8080/8081. API always binds `127.0.0.1`. |
| `DONE_APP_ADDRESS` | app | IP bind address; default `0.0.0.0` for pod routing. |
| `DONE_APP_DIST` | app | Packaged build directory; default `dist` relative to the process working directory. |
| `DONE_BACKUP_CONFIG_FILE` | api, when backups enabled | External backup configuration; see [backup custody and workspace requirements](./public-backups.md#runtime-configuration-and-health). |
| `DONE_SOURCE_REVISION` | api, when backups enabled | Full source revision for backup manifests, supplied by the container build. |

The key and expected pin must resolve outside retained state. Kubernetes projected-file symlinks
are permitted there; internal state directories/files must be private, owned and nonsymlinked.
The API exposes only the session-enabled composition: there is no development bootstrap bearer token.
Origin and Host checks remain exact; forwarded headers do not confer authority. The gateway streams
requests without inventing credentials or retrying possibly accepted work.

Both processes expose minimal GET/HEAD `/healthz` and `/readyz` endpoints. App readiness means the
immutable assets are loaded; API readiness requires a successfully opened retained service. API probes
must execute against loopback from inside the pod. Withdraw readiness during shutdown, stop streams
and drain dispatched operations and the backup worker before closing databases and releasing ownership. Lost replies still
use the protocol's existing retained retry mechanism.

## Persistent layout and ownership

```text
/data/service/
  ownership.sqlite          # stable inode; operational ownership, not account content
  store/
    authority.sqlite        # schema 1, sealed service signing authority
    account.sqlite          # schema 26, with live WAL/SHM carriers as applicable
    pin.json                # public identity retained with this store
    manifest.json           # runtime layout version, schema expectations and pin
  initializing/             # exists only during interrupted/unpublished initialization
```

All service and future maintenance entry points must acquire the same SQLite rollback-mode
`BEGIN EXCLUSIVE` transaction on `ownership.sqlite`, holding its connection for their entire lifetime.
This uses OS-backed SQLite locking and releases after process death; it does not rely on a stale PID
file or lock expiry. Never unlink, replace or separately open/close that inode outside this lock owner
while the service runs. The filesystem must provide SQLite's locking semantics: a local retained block
volume is the intended host, not a multi-host network filesystem. The proposed Recreate deployment
is an additional operational aid, not the ownership proof.
See [SQLite locking](https://www.sqlite.org/lockingv3.html) and
[its file-operation caveats](https://www.sqlite.org/howtocorrupt.html).

Initialization builds a complete `initializing` directory, validates cold opening, synchronizes its
files/directory and publishes it through a same-filesystem rename to `store`. An interruption before
publication never makes partial state eligible for serving. An explicit retry can validate and publish
a complete staged store, or verify an already-published store after a lost response. Incomplete staging
refuses and remains for operator inspection; no automatic cleanup or replacement identity is attempted.
After actual use begins, initialization is not a recovery/restore command.

Ordinary startup requires the ownership file, store, manifest, pin, authority and account database.
It checks schema/policy through a read-only database handle before invoking the existing core, checks
SQLite integrity, authenticates the sealed authority against the external pin/key, and enables no
migration flags. Missing, empty, mismatched or older state refuses. The explicit offline `restore`
command now prepares an isolated quarantined candidate; [operator recovery](./public-restore.md)
describes its checks and required disposition. It does not publish rewound history. Schema migrations
remain separate maintenance work; do not point the development upgrader at this layout.
Operator keys belong in the agreed SOPS/Kubernetes custody path, never in the PVC or application image.

## Container boundary

The root `Dockerfile` builds the application and the focused runtime checks under Node 24.18.0.
Its base image is pinned by multi-platform digest; the initial exercised target is `linux/arm64`.
The final image contains the packaged assets, account implementation and production dependencies,
without Vite, tests, a Git checkout or development state. `.dockerignore` allowlists source inputs,
excluding retained data, exports, keys and personal root notes from the build context.

Build from a clean checkout of the intended commit:

```sh
docker build --platform linux/arm64 \
  --build-arg APP_BUILD_REVISION="$(git rev-parse HEAD)" \
  --build-arg APP_BUILD_DATE="$(git show -s --format=%cs HEAD)" \
  -t "done-public:$(git rev-parse --short=12 HEAD)" .
node scripts/smoke-public-container.mjs "done-public:$(git rev-parse --short=12 HEAD)"
```

Both build arguments are required for container builds; the revision is the full source commit and
the date is that commit's `YYYY-MM-DD` date. An exploratory build may append `-dirty` to the revision;
it is not an immutable publication artifact. Publish and select by registry digest later. Building
or running this smoke command does not push an image or modify an existing installation. The smoke
command creates named disposable Docker volumes/containers and records its result below
`test-results/public-runtime/`; it never mounts host service state.

Account operations use incremental ledger verification and the corresponding editor snapshot path
by default. For a diagnostic rollback, add `--build-arg VITE_ACCOUNT_LEDGER=reference` to the image
build, or use `VITE_ACCOUNT_LEDGER=reference pnpm build` for a local application build. This is a
**build-time** choice: changing the running container's environment cannot change cached JavaScript.
Use the normal application-update procedure to deliver the replacement assets. Both paths read the
same stored format, and every cold open still performs full verification; no database migration or
restore is involved. Unset, empty and `incremental` select the default; other values fail the build.
The [activation record](./performance-experiments/2026-10-11-account-activation/README.md) describes
the bounded evidence, retained reference audits and remaining performance limits.

Account publication and local journal flushing also use a 300 ms quiet / 2,000 ms maximum batch
policy by default. To restore the previous scheduling and per-frame receive publication, build with
`--build-arg VITE_ACCOUNT_BATCH=reference` (or `VITE_ACCOUNT_BATCH=reference pnpm build`). This is
independent of the ledger-verification override and likewise requires new application assets. It
changes no stored/wire format and needs no migration. Local-only flushing is unchanged. The
[batching packet](./performance-experiments/2026-10-11-account-batching/README.md) records the measured
tradeoff, journal-before-acknowledgment rule, immediate locking and best-effort hidden-page sending.

The same image has three commands, using exec-form entrypoint `node scripts/public-account.mjs`:

1. Run `initialize` explicitly once with a writable data volume and the externally provisioned
   operator key. Save its public JSON output as the independently mounted expected pin. An incomplete
   initialization requires inspection; do not delete its artifacts or generate another key on retry.
2. Run `api` with that data volume, read-only operator-key and expected-pin mounts, and exact origin.
3. Run `app` with only the exact origin and port configuration, sharing the API's network namespace
   (two containers in one Kubernetes pod). Expose only app port 8080 through the HTTPS gateway.

Initialization is an explicit administrative Job/command, **not** an ordinary-startup init container.
The planned fresh public service must use newly provisioned custody; the smoke's disposable secrets
are generated solely for its fixtures and deleted afterward.

Use UID/GID 65532, no added capabilities, `allowPrivilegeEscalation: false`, a read-only root filesystem
and a small writable `/tmp`. Provision the data mount's parent directory writable to this UID; the
application creates its own private `service` child. State directories/files require owner-only
permissions; projected operator secrets may be root-owned and group-readable (0440, group 65532).
Mount secrets only into API/initialization containers. The image's `/data` ownership is suitable for
a fresh Docker named volume; Kubernetes PVC provisioning must establish equivalent access explicitly.

Exec readiness probes are `node scripts/public-healthcheck.mjs api` and
`node scripts/public-healthcheck.mjs app`; the API listener is intentionally loopback-only. Use
SIGTERM and enough termination grace for admitted requests to drain before SIGKILL. The service
refuses new requests during shutdown. Future offline migration/restore commands must participate
in the same ownership lock; no such maintenance command is implemented by this container phase.

## Initial runtime evidence — 2026-10-09

TypeScript passes. Nine public state/HTTP/lifetime checks plus five existing gateway regressions pass
on local Node 26.11.0: explicit initialization, lost reply/complete-stage retry, partial-stage refusal,
missing/empty/older database refusal, wrong pin/origin/key refusal, separate-process exclusion and
SIGKILL reopening, shutdown admission/drain, exact public-origin request boundaries and independent
app/API restarts with a retained registration attempt. These are bounded implementation checks,
not a generalized campaign.

The candidate ARM64 image passed the existing application build (including TypeScript, Yjs patch,
asset-size and built-origin checks) and the same 14 runtime/gateway checks on Node 24.18.0. Its
disposable two-container smoke also passed: explicit initialization, startup refusal on empty state,
cross-container exclusion, exact-origin session API, all 34 precache assets matching their integrity
hashes, SIGKILL/restart preserving an accepted registration attempt and identity, clean SIGTERM exit,
and same-identity initialization retry. Both processes used a read-only root filesystem and UID 65532;
the app had no key/state mounts. All disposable resources were removed. The initial candidate used
`c0d36c7a` plus packaging changes, labelled `-dirty`. After signing packaging as `0485c12a`, the
clean-source image `done-public:0485c12a` was rebuilt and passed the same build/checks and container
smoke. [Exact source/image evidence and build log](./development-evidence/2026-10-09-public-runtime-container.json)
are retained. Its local image index digest is
`sha256:96a15982bc8d43e661087b12ea2fdcd443d5c7e4e133515ab8378f2024e3c553`;
no registry publication has occurred.

This checks process interruption and packaged HTTP assets, not power-loss behavior or a fresh browser
credential ceremony. No existing service, public deployment, backup/restore or release campaign ran.

The subsequent [backup integration checkpoint](./public-backups.md#focused-evidence) is signed as
`8923599e`. Its clean-source ARM64 image passes the application build and 19 focused checks as the
runtime UID, plus the packaged smoke. It includes age and an opt-in API-owned backup worker. The
older image above is the original runtime checkpoint, not the latest deployment candidate.


## Operator recovery addition — 2026-10-10

`node scripts/public-account.mjs restore` is an offline command in the same image, with no listener
or backup worker. It accepts a selected encrypted archive and external recovery credentials, verifies
and prepares a separate candidate, and explicitly blocks public opening of the recovered root.
See [the runbook](./public-restore.md). Normal `initialize`, `api` and `app` behavior and the
asynchronous backup availability policy are retained.


## Offline maintenance addition — 2026-10-10

`maintenance-prepare`, `maintenance-status`, `maintenance-resume` and `maintenance-prune` share the
public state ownership lock. A persistent `maintenance/` fence also refuses API startup and
initialization after a crashed job. Completed receipts live under `maintenance-history/`; their
presence cannot authorize recreating a missing store. See the [maintenance procedure](./public-maintenance.md).
There is no automatic or generic public schema upgrader; the first public baseline is schema 26.
