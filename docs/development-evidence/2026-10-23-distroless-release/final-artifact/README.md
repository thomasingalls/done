# ARM64 distroless release artifact — d1c2784b

Prepared on 2026-10-23. Patches54–58 were committed in order and every SSH signature was verified. The workspace is clean. This packet prepares the ARM64 artifact; nothing was pushed, published, merged or deployed.

## Source and artifact identities

| Item | Identity |
| --- | --- |
| Signed source | `d1c2784bef0ccc3ea88d99dfd82f1db3a83af384` |
| Git tree | `647e606a9c02f09d478bb1b313bd2a940d94968b` |
| Local image | `done-public:d1c2784b`, linux/arm64 |
| Image index digest | `sha256:a26278f6c36952f074355ca6378ae09c96bd9e3bfbc6ca4fbfb5910fcf3f6ae6` |
| ARM64 runtime manifest | `sha256:5203dad8362c19eb003ce17ca39ddf5e7e691477e23d600ffc25e31a436d4e20` |
| Runtime config | `sha256:4587d730e2edbaa7374e79d7f75dec9a329f5017fb1f864cfa3bc6e90aff09ee` |
| Saved image archive SHA256 | `4d7e2a82579c9174f073ca50264d25b14ca3b21bb193eb76afbecb21643eb17b` |
| Source archive SHA256 | `abee66f306feb3e2cc7d44a6a55b7cabe5ba75a879833c137ddb4322751126e3` |
| Compatible predecessor image | `done-public:51d8550d` |
| Predecessor index digest | `sha256:d16c39c27528d8a541a1a8bb35d7081c384c8c9a6f75d89cca80ea74aa80cb29` |

The source context is an allowlisted Git archive from the signed commit, with no environment files, Git metadata, browser profiles or retained service state. Build arguments are the full source revision and its Git date2026-10-23. No feature overrides were supplied. All122 packaged runtime source files match that archived source. The110 extracted frontend files and predecessor frontend hashes remained unchanged after the browser rehearsal.

The local image archive remains at [candidate-image.tar](/private/var/folders/fj/yj32lxfd3076kt98xnzxkgyh0000gp/T/codex-security-artifacts-67013a46d0d7a12a3d212f4ce16b269b41f48ba83e35de626b532a901919ec94/artifacts/2026-10-23-arm64-release-final/candidate-image.tar), 73,255,424bytes. The corresponding source archive and helpers remain in that directory. These archives are not uploaded as part of the retained evidence ZIP.

## Signed sequence

| Patch | Commit | Change |
| --- | --- | --- |
|54| `7069ab9b41c243c1e0dd4ee7372bf8b5abba30b9` | Non-overlapping linked-device session regression coverage |
|55| `e86bd26cf14e4d396aeccd6613de1be35e9ca7c4` | Distroless runtime and backup compatibility verification |
|56| `df15fd9ff79215cf7163fbc66515d4ed21a1775d` | Collapsed Account navigation and concurrent progress-status fixtures |
|57| `dcb4e9bb34446dd8b2b5b1889a53b81916df2077` | Reap gateway connections with no dispatched HTTP request during shutdown |
|58| `d1c2784bef0ccc3ea88d99dfd82f1db3a83af384` | Shell readiness, requesting-tab focus and exact device-code fixtures |

Patch57 is a real lifecycle repair: speculative TCP connections and incomplete first headers could hold shutdown until the client disconnected. Its two new regressions fail before the repair and pass afterward. An admitted request retains its exact reply and single dispatch while shutdown drains it. Authority inputs, accepted-operation handling, retries, session policy and HTTP framing are unchanged.

## Checks against the final signed artifact

- The native ARM64 Docker build passes the existing typecheck, build/budget/origin checks and33 bounded runtime cases.
- All33 cases also pass inside the exact final image:16 runtime/gateway,5 backup,6 restore and6 maintenance. Existing15s/20s per-case deadlines remain.
- Final-image inventory verifies non-root65532:65532, Node24.18.0, static age1.3.2 built with Go1.27.3, CA availability, data ownership, and absence of shells/package managers/build and OS archive tools.
- Six old/new age payload round trips and12 wrong-key/tamper refusals pass. SQLite, native TypeScript workers and actual age child processes are exercised.
- The uninstrumented disposable API/app container check passes exact-origin/session boundaries, external secret custody, exclusive live-store ownership, precache byte checks, accepted-registration persistence across SIGKILL/restart, and graceful stop.
- TLS rejects an untrusted test certificate, accepts its explicit disposable CA, and accepts public HTTPS through the default trust configuration.
- The existing local infrastructure manifests select ARM64 and use Node commands/probes. The exact backup-workspace initializer passes in the final image with read-only root and a64MiB limit. This is local manifest compatibility, not a cluster observation or infrastructure change.
- The actual production51d8550d frontend → candidate → predecessor → candidate rehearsal passes in31.3s. Both original/joined protected profiles retain queued and offline writing, wrong-code refusal, cold unlock, undo/redo and two-way delivery. HTML hashes and displayed versions are checked. The candidate host Node24 backend runs throughout; this does not claim predecessor-server rollback or physical-device testing.
- The exact saved image scanned with pinned Trivy0.75.0 and the same offline database as the baseline has **0critical,0high,25medium,8low,1unknown** findings. No findings were suppressed.

## Broader regression evidence and limits

The earlier signed e86bd26c unit run passed1,927 cases in160 files, with one existing skip. Its original missing-documents fixture failure is retained alongside the corrected run.

The first full packaged run retained79 passes/11 failures across90 cases. An affected-file rerun retained26 passes/3 failures. The final three-case rerun passes3/3. Every initial failure therefore has a passing rerun; this is not a new single clean90-case run. The new non-overlapping session cases pass in both directions after confirmed upload.

The failures were separated into the gateway shutdown defect, stale sidebar/status/device-name fixtures, and simulated passkey cancellation from an unfocused requesting tab. Every old assertion and deadline remains. The disposable update harness also initially omitted build inputs, then used HTML symlinks that produced outside-root asset paths. Those failed attempts are preserved; the final rerun uses complete regular-file signed inputs.

This packet does not run or award generalized release qualification. AMD64 is outside this ARM64 artifact's acceptance; the earlier emulation limitation remains recorded in patch55's evidence.

## Evidence and next publication boundary

[verification.json](verification.json), [image.json](image.json), [source.json](source.json), [evidence-index.json](evidence-index.json) and [evidence.zip](evidence.zip) identify the final results. The final evidence ZIP SHA256 is `6054c21e1b9b3bfc984fa528d0c6201b997ccb9796a5eac7a7fa0faa35faf4bc` (106,159bytes). It excludes keys, service databases, profiles, source/image archives and dependency trees.

Original failed attempts, controls and broader regression results are retained in [preparation-evidence.zip](../2026-10-23-signed-ux-image/preparation-evidence.zip), SHA256 `fc9f96e8ff7ae549cc528811dd2b128f7adf348b53644549913c02914bc9e4d4`.

The next operation is separate publication: preserve the signed commits through application review/merge, verify merged build inputs, publish the exact tested image to the intended private registry, verify its digest, then prepare the infrastructure pin through its own reviewed PR. The operator retains the merge button. Reconciliation, rollout verification and cached-client adoption follow afterward. No such operation has started.
