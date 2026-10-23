# Application PR57 and publication preparation

Observed 2026-10-23 14:49:12 UTC (16:49:12 Europe/Paris). This advances publication state after the earlier immutable ARM64 preparation packet; it does not replace that packet's test results.

All24 signed commits were pushed to the existing branch in private repository thomasingalls/done. [PR57](https://github.com/thomasingalls/done/pull/57) is open, ready for review and mergeable at signed head `d1c2784bef0ccc3ea88d99dfd82f1db3a83af384`. It is attached to this chat. The application checkout remains clean.

Main `6d1baffc` differs from the branch's merge base only by merge history; its tree matches `b54d9fb8`. No new runtime changes require reconciliation at this observation. The actual post-merge build inputs still need verification before publication.

The PR description includes the final scope, original failures and passing reruns, retained test limits, image/rollback identities and publication sequence. Its source, index and ARM64 manifest identities were independently checked against canonical image.json. Docker still resolves `done-public:d1c2784b` to the exact tested ARM64 index `sha256:a26278f6c36952f074355ca6378ae09c96bd9e3bfbc6ca4fbfb5910fcf3f6ae6`, with the signed-source revision label.

Ordinary CI was in progress at the recorded observation. The explicitly resumed full qualification job was skipped as configured. No generalized qualification was resumed. [Application snapshot](application-pr57-snapshot.json) retains the exact initial check state and PR description.

[Infrastructure patch](infra-image-pin.patch) is prepared against local ol-infra `973fdcc1`. It changes the single image pin and its source comment. An independent YAML comparison confirms all other configuration is identical; git apply --check passes. The existing deployment/initialize/maintenance command manifests still match those checked against the final image. No infrastructure worktree file was changed. Refresh its remote base before an infrastructure PR.

The infrastructure patch is **not applied** and no image was published. First the operator merges the application PR with a merge commit preserving signed identities. Then verify the merged inputs, publish the exact tested image to the intended private package, verify index/runtime digests and authenticated pull, and prepare the infrastructure PR. The operator retains that merge button too. Reconciliation and real-device adoption checks follow afterward.

Canonical records: [artifact preparation](README.md), [publication receipt](publication-preparation.json), [infrastructure receipt](infra-image-pin-preparation.json). This preparation performed no image publication, infrastructure push, merge or deployment.
