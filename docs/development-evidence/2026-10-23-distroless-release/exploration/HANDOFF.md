# Sequential patches54–55

Both patches are already present in the cumulative checkout. Do not reapply them to its working files. The real index is empty and HEAD remains signed commit77669ec79f78779d77e500d0f163c0299156b968. No commit, push, preview update or deployment.

When the operator requests signing, stage each exact patch into the index in order (`git apply --cached PATCH`), verify the expected tree and staged diff, then create that phase’s signed commit. Keep the next patch’s working changes intact. Do not stage the cumulative checkout wholesale for the first commit.

| Phase | Source patch | Base/result tree | SHA256 |
|---|---|---|---|
|54|[non-overlapping device sessions](patches/54-non-overlapping-device-sessions.patch)|77669ec79f78779d77e500d0f163c0299156b968 → a4d5bb8c3bd6f5c61625305b7891d1b11771d235|070372f7bdf864bcc784eac6c61f9fa5c83d7fc62d3aa7bedceb284f9f3e35c6|
|55|[distroless runtime](patches/55-distroless-runtime.patch)|a4d5bb8c3bd6f5c61625305b7891d1b11771d235 → 6dc20f0b2efc8fe133809fff5c2e38ae18dfd1b3|be4e5a3622d43301a8dfe8e5a383e42f5793f4d93ffd9bf02168558e4244ecab|

Patch54 is an exact copy of the original prepared patch in /private/tmp/done-non-overlap-20261023-patches; that packet is unchanged. Its browser/fixture evidence and qualification limits remain intact.

Suggested patch55 subject: `Harden the runtime with distroless packaging and verify backup compatibility`.

Patch55 changes only Dockerfile, new scripts/test-runtime-image.mjs, docs/public-runtime.md, appended docs/completed.md and the generated harness identity in docs/release-validation-graph.json. No old test, deadline, assertion, app/protocol code or dependency lockfile changed.

**Patch55 verification status: ARM64 passed; full cross-platform verification blocked.** Native ARM64 has31 final-image cases, six old/new age round trips,12 explicit rejection cases, TLS controls and the separate serving/restart smoke passing. Current offline scan:0 critical/0 high,25 medium/8 low/1 unknown retained. AMD64 emulation fails the existing eight-second readiness check in the unchanged Debian builder. A diagnostic first startup reaches readiness at10,245ms but does not count as the full regression. Run normal build/final-image/smoke on native AMD64 before claiming that platform verified. Do not adjust deadlines or credit the diagnostic as passing.

Read [verification report](fix-verification.md), [source/image identities](source-image-identities.json), [scanner summary](scan-summary.json), [series](series.json) and [patch replay receipt](patch-verification.json). [Evidence archive](evidence.zip) retains full scans, original logs, failed attempts, helpers, final ARM64 receipts and independent review. No container image archives, scanner database, build trees, real account data or generated private fixture keys are retained in that archive.

The exploratory dirty-source image is not eligible for publication; later authorized release work must rebuild/test identified signed source. General release qualification stays paused/blocked.
