# Distroless runtime candidate — 2026-10-23

**Outcome: blocked for complete cross-platform verification.** Implementation and the native ARM64 checks pass. Two AMD64 builds fail an existing backup-worker readiness deadline under emulation, in the unchanged Debian builder stage before final-runtime construction. No AMD64 final image was produced. This is not a release artifact or a claim that all platforms are fixed.

## Finding, invariant and scope

The supplied report identifies vulnerable npm dependencies and unused Debian packages in the runtime image. Their presence is confirmed by image inventory/scanning. This work does not establish that those packages had a remotely reachable exploit through done. The entrypoint runs Node, not npm.

The invariant is a minimal runtime retaining exact application authorization/origin/pin checks, retained SQLite ownership and lifecycle behavior, external key custody, UID/GID 65532, read-only root compatibility, working worker/child processes, TLS trust and existing age-encrypted backups. Application/protocol source, package.json, pnpm-lock.yaml and public entrypoint/probe sources are unchanged from release 51d8550d.

Changed files: Dockerfile; new scripts/test-runtime-image.mjs; docs/public-runtime.md; appended docs/completed.md; generated docs/release-validation-graph.json records only the new harness source identity beyond prepared patch54. No old test was edited, removed or given a longer deadline. Patch54 is preserved separately.

## Strategy

Use digest-pinned gcr.io/distroless/cc-debian13:nonroot, copying only the existing Node24.18.0 executable and license. This avoids silently upgrading Node to the version currently in the stock distroless Node24 image. Copy no builder libc, shell, package manager, npm/corepack tree, Go compiler, age plugins or development tree.

An initial exact-age-binary candidate exposed Go1.19.8 embedded in Debian age1.1.1: 3 critical/33 high language findings. The baseline scanner did not expose this same binary as a Golang target; do not interpret the new visibility as proof the migration introduced those vulnerable bytes. Retaining it would leave the remediation incomplete.

Build stable age v1.3.2 with digest-pinned Go1.27.3, CGO_ENABLED=0 and GOTOOLCHAIN=local. Preserve actual compiler/module checksums and all linked-module licenses. The application still supports its existing age1 X25519 recipient, with no new key format, plugin or protocol.

## Ordered checks and exact commands

Commands ran from the managed temporary workspace; REPO denotes /Users/thomasingalls/.codex/worktrees/7fda/done and evidence output paths are under artifacts/55-distroless. Full commands/results and original failure logs are in evidence.zip.

1. **Syntax/import/build boundary**
   - Node24.18.0 --check REPO/scripts/test-runtime-image.mjs: pass.
   - oxfmt --config REPO/.oxfmtrc.json --check and oxlint --config REPO/.oxlintrc.json on the new harness: pass.
   - docker buildx build --platform linux/arm64 --build-arg APP_BUILD_REVISION=77669ec79f78779d77e500d0f163c0299156b968-dirty --build-arg APP_BUILD_DATE=2026-10-23 --load -t done-distroless:55-arm64 REPO: pass, including existing Yjs/type/build/budget/origin and all four original builder test groups.
   - Same command with linux/amd64 / done-distroless:55-amd64: fail twice at test/public-backup/worker.test.mjs:127, “Backup health did not become ready.” Application build and runtime/gateway checks pass before that failure.
   - Node scripts/release-validation/check.mjs --record then read-only check, and node --test test/release-validation/inventory.test.mjs: pass (10 cases). Initial stale-source inventory failure is retained.

2. **Reported issue and negative controls**
   - Trivy0.75.0 image pinned to sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa. Database updated 2026-10-23T07:12:39.66827463Z, downloaded once. Scans use saved image archives with --offline-scan --skip-db-update --skip-java-db-update --scanners vuln --list-all-pkgs --format json, and scanner container --network none. No host Docker socket, credentials or home mounted. Database-download container had no application files.
   - Same-database release baseline: 5 critical / 78 high / 121 medium / 91 low / 5 unknown. This is a fresh scanner/database result, not an attempt to reproduce the supplied report’s 5/21 denominator.
   - Initial exact-old-age candidate: 3 critical / 33 high / 77 medium / 12 low.
   - Repaired ARM64 candidate: **0 critical / 0 high / 25 medium / 8 low / 1 unknown**. No suppression file or ignore-unfixed switch.
   - Unmounted final-image inventory rejects the baseline for present shells/package managers/archive tools and accepts the candidate. Verifies Node version, age build/module identity, CA bundle and /data owner/mode. These results demonstrate removal of the named runtime packages rather than merely changing scanner expectations.
   - Residual Go module findings are two medium x/crypto/ssh DoS advisories and one unknown openpgp module advisory. Module-level presence is not call-graph reachability evidence; no zero-vulnerability claim. Full lower-severity OS findings remain in the raw report.
   - Debian’s tracker says Bookworm’s vulnerable MiniZip code was not built into its zlib binaries. The baseline zlib1g CVE-2023-45853 package finding is retained with this applicability caveat, not represented as a confirmed vulnerable zlib library.

3. **Legitimate behavior**
   - Build dependencies helper image using --target dependencies --platform linux/arm64.
   - node REPO/scripts/test-runtime-image.mjs done-distroless:55-arm64 done-distroless:55-tools-arm64 OUTPUT: pass. Actual final-image code/Node/age: 14 runtime/gateway + 5 backup + 6 restore + 6 maintenance = 31 cases, zero skips/cancellations/failures. Original per-case deadlines15000/20000ms remain. Test-only age-keygen/GNUtar/gzip are mounted read-only as independent fixture/oracle tools; they never replace production Node or age, and old tar’s explicit private loader/library path does not affect those executables.
   - Old age1.1.1 → new age1.3.2 and reverse: 6 exact-byte X25519 round trips across empty, binary257-byte and131073-byte payloads; 12 explicit exit-code1 wrong-key/tamper refusals: pass.
   - node REPO/scripts/smoke-public-container.mjs done-distroless:55-arm64: pass in separate uninstrumented containers. Covers non-root/read-only root, explicit init, missing-state and live-owner refusal, exact-origin scoped session API, precache integrity, SIGKILL/restart retaining identity/accepted attempt, SIGTERM and same-identity init retry. Disposable resources removed.
   - check-tls.mjs: pass. Default trust rejects a controlled self-signed certificate; explicitly trusting only the disposable CA is a positive control. Default public HTTPS trust to nodejs.org returns200. No trust bypass.
   - One fresh read-only candidate review: no concrete source-backed bypass/regression. Reviewer could not independently access Docker; its source/evidence perspective is recorded in candidate-review.md.

## AMD64 proof gap

Host is ARM64; Docker has2 CPUs and about4GiB RAM. The readiness failure reproduces using the unchanged Debian dependencies image and original source, with observation-only logging. At the deadline the API’s backup owner reports “starting,” not a proved backup refusal.

A separate explicitly diagnostic, first-startup-only observation with a longer observation window sees readiness at10,245ms. Its copied TAP title retains the original full-test title, but the diagnostic returns after first readiness and is **not** credited as a passing worker regression or a deadline repair. Both canonical failures remain authoritative failures. Repository tests/deadlines are unchanged.

Required next check: on a native AMD64 runner, run the normal Dockerfile build, the new final-image harness and the uninstrumented smoke at unchanged deadlines. If they fail there, investigate the failure before claiming cross-platform verification. Do not weaken the gate or publish the candidate as verified AMD64.

## Identity, preservation and limits

ARM64 exploratory image index: sha256:7e246ec99460ddc06e55716b13a98e3a62d04e07b5562086f435868f33cf1841. Runtime manifest356dad39d3ea7dfbb2d5608cf0d43c4a6e4ed857b29d2596aef76c0dd646c4ea; config1905e2fb574cd0d22ad8e94285591a9800c6501d37df90454a69d7a3711ad96f. source-image-identities.json records source hashes, image identities, platform, entrypoint/user and missing AMD64 candidate.

Retained failures also include invalid initial batch-policy override, scanner-download tmpfs exhaustion, the first harness’s lost stdout, missing test-only parser/gzip fixture closure and initial old-age findings. A later pass does not erase these attempts.

No full suite, formal release qualification, real-account operation, preview restart, commit, push, merge, image publication or deployment. The dirty exploratory image must be rebuilt/tested from signed source during a later authorized publication procedure. This hardens the runtime package boundary; it does not prove absence of all application vulnerabilities or revoke other existing qualification blockers.

## Primary sources

- https://github.com/GoogleContainerTools/distroless
- https://github.com/GoogleContainerTools/distroless/blob/main/nodejs/README.md
- https://github.com/FiloSottile/age/releases/tag/v1.3.2
- https://raw.githubusercontent.com/FiloSottile/age/v1.3.2/go.mod
- https://security-tracker.debian.org/tracker/CVE-2023-45853
- https://trivy.dev/docs/latest/advanced/air-gap/
