# Private cold-start host diagnostic

This experiment creates synthetic profiles inside a dedicated Debian Lima VM. It does not accept real
profiles, issue migration authority, call the coordinator, or change default startup. Read
[the contract](../../docs/legacy-host-cold-start.md) and the
[execution record](../../docs/storage-conformance-runs/2026-09-10-legacy-host-cold.md) before interpreting its verdict.

## Provision a separate runtime

Requires macOS Apple Silicon, Lima with VZ support, installed repository dependencies and access to the pinned
Debian image/packages. A missing historical package is a runtime-availability failure; do not silently install
another browser version. `lima.yaml` has no host mounts or agent forwarding. Never use an existing personal VM
or browser profile. Provisioning needs network access; each browser campaign runs in a fresh network namespace
with loopback only, separately from provisioning.

```sh
LIMA_HOME=/private/tmp/done-cold-lima limactl start --name=probe --timeout=10m -y scripts/legacy-host-cold/lima.yaml
LIMA_HOME=/private/tmp/done-cold-lima limactl copy scripts/legacy-host-cold/provision.sh probe:/tmp/provision.sh
LIMA_HOME=/private/tmp/done-cold-lima limactl copy scripts/legacy-host-cold/policies.sh probe:/tmp/policies.sh
LIMA_HOME=/private/tmp/done-cold-lima limactl shell probe sudo sh /tmp/provision.sh
pnpm storage:legacy-host-cold --lima-home /private/tmp/done-cold-lima --machine probe
LIMA_HOME=/private/tmp/done-cold-lima limactl stop probe
```

The runner requires the explicit runtime arguments, a temporary Lima home, plain mode and an empty mount list.
It will not provision, start or stop a VM implicitly. It builds the pinned predecessor, copies only fixture
assets and bundled probes, creates a new guest output directory, and collects reports without copying profiles.
Use `--output <new-directory>` to choose the local artifact directory. The equivalent direct entry point is
`node scripts/legacy-host-cold/run.mjs`; no package-manager signature checks are bypassed by the runner.

## Read the result

`report.json` separates `diagnosticsPassed` from `hostSupported`, which is always false in this prototype.
Exit zero means the implemented diagnostics finished successfully. Early runtime/transport/build errors and
failed controls are failed runs; a timeout is never a successful control. Inspect `phases`, `native/*.json`,
first-failure files and `native.log`. The original run directories and failed evidence are never overwritten.

Four invalid-policy canaries require a real native first-script write. Recommended-only policy has a separate
configuration-refusal diagnostic: its attempted user override did not write on the measured browser, so that
execution control remains unproven. The ordinary-page/worker and actual predecessor positive controls use
the same executables as denial tests. The origin-only control requires the foreign-top-level frame to write.
The observer facade rejects evaluation, storage deletion and execution-setting mutations.

The closed-source fixture includes real legacy Yjs rows/journal values, 23 generated binary rows, Unicode keys,
and unknown local values. Clean reopen verifies the baseline. The cached predecessor fixture additionally
cold-replays its stored master text. Positive-control reads may retry a recorded moving-source refusal while
intentional writers run; denied reads fail immediately on drift. Inert observation pages retain their fixture
service-worker bypass until closed; cached/direct executable tests use separate documents. No storage-read
operation enables website JavaScript.

Twenty generated command sequences use seed 8941 and the same unchanged synthetic source. Each sequence
kills a separate controller process, observes a markup navigation without a debugger connected, kills and
cold-restarts the browser, and compares exact carriers. Inputs and the executed prefix are saved before failure.
Native shrinking is deliberately disabled: reusing a contaminated profile to shrink a failed sequence would
invalidate its baseline. Replay the saved full campaign from a fresh run; this version has no single-history
replay flag. The seven Node tests independently use shrinking property checks for byte and pagination faults.

Bounds: 30 seconds per operation upper bound (CDP calls 15 seconds; polling 10 seconds), 120 seconds per directed
case/history, ten minutes per guest phase, ten seconds per browser teardown, and 30 minutes overall. A separate
root `timeout` owns each PID namespace; controller/browser processes cannot remove its readonly policy mount.
The host gathers partial evidence after a failed phase. Profile artifacts remain synthetic and closed in the VM.
Stop only the dedicated VM when finished.

The guest browser/controller process tree inherits Linux `NoNewPrivs=1`, and its attempted `sudo -n true`
must fail. Lima's guest account otherwise has passwordless sudo; ordinary readonly-file refusal alone would
not establish this privilege boundary. The privileged host-side namespace/watchdog remains a separate owner.

These finite probes do not establish independently delivered service-worker background events, actual BFCache,
installed windows, lossless live-source shutdown, all transports/other devices, or lasting retirement after denial
is removed. The protocol census is not an atomic multi-store snapshot, a general IndexedDB serializer, a recovery
packet, or an authenticated cleanup capability. Unsupported values, bounds, moving metadata and changed contexts
refuse. Source/packet parity and the production host remain separate work.
