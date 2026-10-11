# Sync recovery and foreground compaction — publication handoff

Prepared 2026-10-11 from signed source `77657e23c994727c8db56201a8c3d4cfe310b7b9`
on `codex/foreground-compaction`. Application main at preparation is
`e948c52af392268083f603012c57c220815395c3` (PR #49). This is an ordinary application
update; release qualification remains paused.

## Changes and evidence

- `ae30694a` lets automatic content compaction yield to foreground work at safe owned
  boundaries. Admission remains ordered and waits for in-flight native work to settle.
  The final deletion transaction still rechecks the exact authenticated census, using
  paired bulk reads instead of per-row cursors. In four deliberately induced desktop
  collisions, key-to-visible time fell from 181–189 ms to 25–31 ms. These are individual
  measurements, not a latency percentile or phone result. Synchronous work and a native
  operation already running can still delay input. See the
  [maintenance packet](./performance-experiments/2026-10-11-foreground-maintenance/README.md)
  for the 51 unit checks, eight selected native cases and measurement limits.
- `cb8884a3` reports `sign-in-required` when a passkey check is needed, and offers
  Connect/Reconnect sync in the fixed notice. Ordinary lane retries cannot replace that
  check. Cancelling a required prompt preserves the actionable status; completing it
  wakes work without clearing a separate integrity/conflict halt. The existing online
  notice delay and offline suppression remain.
- `77657e23` gives signed history requests clock headroom: clients request a 30-second
  lifetime within the unchanged 60-second verifier maximum. On the real phone, discovery
  succeeded but checkpoint requests returned `409 unavailable`; its measured clock lead
  was 656–717 ms. A disposable two-device reproduction with +700 ms reproduced successful
  upload and failed receiving before the repair, then two-way delivery afterward. All six
  history request construction sites use the shared lifetime. Expiry checks, signatures
  and authority binding remain mandatory. Large clock errors can still fail.

The [sync incident packet](./performance-experiments/2026-10-11-sync-recovery/README.md)
retains only route/status/refusal/timing observations from the real phone, plus synthetic
test evidence. It records 55 focused scheduler/UI, login and history cases, the packaged
reproductions, and build/type/lint checks. No real browser data was reset or edited.
**The real phone has not yet tested this updated frontend.**

## Immutable candidate

[Publication evidence and hashes](./development-evidence/2026-10-11-sync-recovery-publication/evidence.json)
pin the clean signed-source archive and image:

- Local image: `done-public:77657e23`, `linux/arm64`, Node 24.18.0.
- Index: `sha256:21c744f542d6dcd450f7af9e099bce80175de834e2c9d48d6b6a1bf7f1f3d080`.
- Runtime manifest: `sha256:448facb4ee929624bfcec90c5b988cc800c29dec4f487df354830f4c1d44e294`.
- Build, TypeScript, patched Yjs, origin isolation and bundle check pass; initial JS is
  136.7 kB gzipped against the unchanged 350 kB budget. All 31 existing container
  runtime/gateway, backup, restore and maintenance checks pass.
- All 32 focused Node 24 history-service and login-client checks pass in the build stage,
  without external networking and with the signed public crypto fixture mounted read-only.
- The disposable two-process runtime smoke passes: non-root packaging, scoped APIs,
  exclusive database ownership, every precache response, retained state after SIGKILL/restart,
  and graceful shutdown/cleanup.
- Both serial browser journeys pass using the extracted frontend: the +700 ms device
  receives and uploads writing, and required sign-in presents the passkey action and resumes
  both directions without a reload.

The browser evidence uses the exact frontend extracted from this runtime image with disposable
host Node 26.11.1 services from the same signed archive. It is not a browser check against the
container's Node 24 API; Node 24 behavior is checked separately above. No production request,
physical-phone measurement or release qualification is implied by these disposable checks.

## Publication, compatibility and rollback

Account schema 26 and authority schema 1 remain unchanged. No initialization, database migration,
restore, re-enrollment or browser-storage reset is needed. Wire formats and server expiry limits
are unchanged. Cached older clients remain compatible but retain their old behavior until the
waiting-worker update is accepted.

1. Merge the application PR with a merge commit, preserving the signed source identities.
   The operator retains the merge button; run ordinary application CI only.
2. Publish this exact tested image as `ghcr.io/thomasingalls/done:77657e23`. Verify the remote
   index and ARM64 manifest, private visibility and authenticated pull. A rebuild would need
   its own artifact identity and evidence. The candidate is currently local only.
3. Prepare the ol-infra PR changing the immutable image pin in
   `infra/apps/done/components/runtime/kustomization.yaml`. Keep the existing PVC, keys,
   identity, routes and backup settings.
4. After the operator merges, reconcile with the infrastructure Justfile commands, verify
   readiness/public assets and backup health, then confirm the actual phone receives a new
   desktop edit on build `77657e23` and still sends its own edit. If a passkey check is required,
   confirm the notice offers Reconnect sync. Preserve both devices' browser storage.

The currently deployed source is `203a0655`, index
`sha256:df225ef4f95306b7668aa0ca45788ff46c0301ddcd48777993f5f2567f242ae9`.
Reverting that image pin is an ordinary rollback; it restores the known clock-skew receive failure,
misleading login warning and foreground compaction stalls. It does not restore or repair data.
This preparation changes no running service or infrastructure configuration.

Deep received-history cold opening, remaining synchronous/flush stalls and authenticated local
ledger retention remain separate performance work.
