# Refreshed signed-source ARM64 candidate

The publication candidate is local `done-public:d8b3f22b`, built from signed source
`d8b3f22b0790770192a809aa8d83064fd42d9804`. [Source metadata](source.json) binds its clean
allowlisted Git archive, signatures, tree and unchanged switches. [Image metadata](image.json)
is the home of the index, ARM64 manifest, runtime config and saved-archive digests. All122
runtime source files match the signed archive; all110 extracted frontend files retain their
exact population and bytes after the browser rehearsal. The old d1c2784b artifact is historical.

## Results and scope

[Verification](verification.json) records33/33 final-image cases at the original deadlines:
16 runtime/gateway,5 backup,6 restore and6 maintenance. Non-root identity, native SQLite/workers,
six old/new age round trips and12 wrong-key/tamper refusals pass. No shell, package manager or
OS archive tool is present. The uninstrumented two-container smoke passes initialization,
external identity custody, exclusive store ownership, exact-origin/session and precache checks,
accepted state across SIGKILL/restart and graceful shutdown. TLS rejects the untrusted test
certificate, accepts its explicit CA and uses the default public trust bundle successfully.

The actual51d8550d frontend → candidate → predecessor → candidate rehearsal passes for protected
original/joined profiles, queued/offline writing, wrong-code refusal, undo/redo and two-way
delivery. It uses candidate host Node24 services throughout, not predecessor-server rollback.
These are disposable Chromium contexts; no real browser storage or physical device was touched.

The pinned Trivy0.75.0 scan of this saved image, using the same independently hashed offline
database as the retained earlier scans, reports0 critical,0 high,25 medium,8 low and1 unknown.
No suppression or database update. This is a package-inventory result against that database,
not a general security proof. The source and image archives stay local; no private keys,
databases, browser profiles, dependency trees or scanner database are included in this packet.

The exact hosted [run39992803591](https://github.com/thomasingalls/done/actions/runs/39992803591)
passes the security-contract/vector step, complete inventory and release adapters for this
source. [Snapshot](hosted-bookkeeping-status.json) records those steps while the longer unit
step is still running; it does not claim the entire hosted job passed. Twelve actual passing
execution receipts from the clean signed tree are archived for provenance. Live local receipts
remain in the repository's ignored `.receipts/` and must be refreshed after any new commit.

The earlier1927-pass/one-skip unit result and interrupted full-browser run with passing bounded
reruns retain their original source identities and limits in the parent packet. They were not
recast as new uninterrupted full runs. AMD64 acceptance remains unestablished; generalized
qualification stays paused and all892 obligations/348 unresolved blockers remain.

## Reproduction and custody

[Evidence archive](evidence.zip) retains build logs/metadata, the signed-source preparation and
extraction helpers, final-image TAP reports, smoke/TLS results, exact browser probe and result,
scanner command/database identities, compatibility checks and hosted/receipt snapshots.
[Member index](evidence-index.json) binds every included file. [Copy index](artifact-index.json)
binds the archive and adjacent metadata. The complete archive population, each member's bytes
and hashes were independently checked before import. Helpers are reproduction material, not
commands to run against production. Disposable credentials/state and image/source tar archives
are deliberately excluded. Earlier failed attempts remain in the parent packet.

Run the committed `scripts/test-runtime-image.mjs` with this candidate tag and the retained
`done-distroless:55-tools-arm64` helper image to repeat the33 cases. Run
`scripts/smoke-public-container.mjs` from a disposable copy of the signed source for its separate
two-container checks. The archived helpers reproduce extraction, TLS and browser apparatus;
the latter needs the recorded predecessor image and host browser/runtime. Do not substitute
this packet for fresh execution receipts or aggregate qualification.

## Publication boundary

This evidence commit changes repository documentation only; the image stays bound to signed
d8b3f22b. Check every allowlisted build input independently before carrying the image over that
commit and again after the operator merges PR57. The operator retains both merge buttons.
The [input comparison](carry-forward.json) and [reproducer](check-image-carry-forward.py)
check every allowlisted byte and executable mode against the exact signed Git archive.

[Prepared infrastructure patch](infra-image-pin.patch) changes only the image digest and comment
against the recorded local base. Its [receipt](infra-image-pin-preparation.json) checks parsed
YAML equality except the digest, patch applicability and unchanged production command manifests.
It is unapplied; the remote infrastructure base still needs refresh/review. Publish the exact
private image and verify remote index/runtime digests plus authenticated pull before opening
that separate infrastructure PR. Image publication, infrastructure change, merge, reconciliation,
rollout and actual cached-client adoption remain separate. None has happened in this phase.
