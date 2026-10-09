# Public runtime and explicit initialization

This implements the runtime boundary from [the public deployment plan](./public-deployment.md).
It reuses the current account protocol, remembered sessions, scoped grants and membership flows.
It does not deploy an origin, migrate the Tailscale installation, implement backups/restores or
resume release qualification. The development entry points remain separate and available.

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

The key and expected pin must resolve outside retained state. Kubernetes projected-file symlinks
are permitted there; internal state directories/files must be private, owned and nonsymlinked.
The API exposes only the session-enabled composition: there is no development bootstrap bearer token.
Origin and Host checks remain exact; forwarded headers do not confer authority. The gateway streams
requests without inventing credentials or retrying possibly accepted work.

Both processes expose minimal GET/HEAD `/healthz` and `/readyz` endpoints. App readiness means the
immutable assets are loaded; API readiness requires a successfully opened retained service. API probes
must execute against loopback from inside the pod. Withdraw readiness during shutdown, stop streams
and drain dispatched operations before closing databases and releasing ownership. Lost replies still
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
migration flags. Missing, empty, mismatched or older state refuses. Schema migrations and rollback-safe
restore remain separate future maintenance work; do not point the development upgrader at this layout.
Operator keys belong in the agreed SOPS/Kubernetes custody path, never in the PVC or application image.

## Focused evidence — 2026-10-09

TypeScript passes. Nine public state/HTTP/lifetime checks plus five existing gateway regressions pass
on local Node 26.11.0: explicit initialization, lost reply/complete-stage retry, partial-stage refusal,
missing/empty/older database refusal, wrong pin/origin/key refusal, separate-process exclusion and
SIGKILL reopening, shutdown admission/drain, exact public-origin request boundaries and independent
app/API restarts with a retained registration attempt. These are bounded implementation checks,
not a generalized campaign. Container/Node 24 execution is the next implementation checkpoint.
