# Sync release — verified production rollout

2026-10-23. Production [done](https://done.oxidationlabs.com) serves **Version 51d8550d**,
service-worker version `15a5cf03f50b`. [Infrastructure PR #20](https://codeberg.org/oxidationlabs/ol-infra/pulls/20)
merged as `67a622f6add9eebed0f0a84ad713b542a1eb973a`, preserving verified signed
commit `d0ce0dc7173202351d20026cf57d45a332e3b6dc` and its entire tree. The merged
configuration passes the established offline infrastructure check.

The Justfile reconciled `done`, `flux-system`, then `done-public`. All seven
Kustomizations and the Git source are ready at the verified merge. A single
replacement Pod runs both containers at tested private image index
`sha256:d16c39c27528d8a541a1a8bb35d7081c384c8c9a6f75d89cca80ea74aa80cb29`,
ready with zero restarts. Runtime source is signed `51d8550d30585c93e623af0f2b3adf610781eebb`,
Node 24.18.0. The live Deployment spec changes only its three image references;
Recreate, mounts, settings, credentials and security contexts remain identical.
The original bound 10 GiB PVC retains its UID and complete spec.

Normal DNS/TLS, with default trust and hostname verification, serves all 60
precache URLs with exact tested hashes. The worker also matches exactly. The
account/connect deep routes return the same application shell, HTTP redirects
to HTTPS, public configuration retains the service identity, wrong-origin
configuration refuses with 403, and `/backupz` and `/.env` remain private (404).
All 68 public probes pass; no accounts, credentials or production writing are
created or inspected by these probes. Exact hashes bind the deployed frontend
to the tested compile-time defaults: reader enabled, installer/retention disabled.

Backups report healthy, with a successful upload after restart, no pending
unprotected change and no current failure stage. The previous process had
**15 cumulative failures**; the replacement starts at zero. This process counter
reset does not erase the historical failures. Bounded startup checks find no
ledger-integrity, unhandled rejection, uncaught exception or startup-failure
markers in the last 500 lines from each new container; this is not a full
publisher audit.

[Summary](summary.json), cluster/public observations, signed merge verification,
exact reconciliation logs and read-only probe sources are retained here;
[artifact-index.json](artifact-index.json) hashes every other file. Full private
cluster snapshots and individual public response bodies remain under
`/private/tmp/done-sync-publish-51d8550d/rollout/`, outside this packet.
No production keys, tokens, credentials or account contents are included.

Actual-device adoption remains pending. The operator was asked to confirm
Version 51d8550d through the normal update/reopen, without clearing storage, then
check two-way typing, catch-up, undo, lock/reopen and offline reopening. Server
rollout does not establish those behaviors. The earlier disappearing-account
report remains unexplained. General qualification stays paused; the operator's
local-test acceptance decision and previous finite load evidence are unchanged.
No migration, initialization, restore, maintenance Job or storage reset ran.
Predecessor/reader rollback images remain retained as recorded in the publication
packet; no server rollback was executed during this rollout.

Retained packaging correction: the first documentation-only temporary-index
whitespace check used an unborn HEAD and compared the full historic tree to
empty. The check is scoped to the signed application base before packaging;
no old whitespace, source or test file is changed. See
[initial packaging failure](packaging-initial-failure.json). Production
verification is independent of this documentation packaging step.

## Subsequent operator feedback — 2026-10-23

The operator [reports](operator-device-feedback.json) substantially better
catch-up and live sync on actual devices, with delay close to real time, and
includes undo in the positive feedback. Long-backlog catch-up was not exercised
because a suitable unsynced backlog was unavailable. Individual lock/offline
reopening outcomes and per-device version labels were not supplied in that
reply. This is qualitative device feedback; no measured latency or comparison
with a WebSocket implementation is established. The earlier pending status
above records the state at server verification.
