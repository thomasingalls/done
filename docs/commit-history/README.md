# Commit identity records

Signing a previously unsigned commit changes its ID, and changes every descendant that names it as
a parent. Historical test evidence keeps the ID that was actually tested. These records connect that
evidence to source-equivalent signed commits; they do not claim that tests ran again.

## 2026-10-09 — Product history prepared for PR #41

The operator requested signing the outstanding history after discovering main's repository rules:
pull requests, verified signatures, linear history and squash-only integration. This supersedes the
same day's direct local-main merge plan. No repository protection was weakened.

The [full crosswalk](./2026-10-09-signed-product-history.json) records 102 unsigned commits replaced
with signed commits, plus one signed merge re-signed because its parent changed. Each replacement
preserves its exact tree, message, author and committer metadata; only parent IDs and signature
headers change. All 397 commits in `c61ad005..826bb006` have good local SSH signatures. The final tree
is identical to original `73a1d881`. This required no patch replay and changed no application code.

Original objects remain under local `codex/pre-sign-public-deployment-2026-10-09`. The signed chain
continues on `codex/first-public-deployment` and is prepared for the existing
[PR #41](https://github.com/thomasingalls/done/pull/41), using
`codex/encrypted-store-contract-corrections` as its remote head. The remote head checked at
`d178d349` is an ancestor of the replacement chain, so publication requires no force push. Local main
is restored to remote base `c61ad005`; the earlier local merge is preserved in the backup/crosswalk.

The signing process verified each replacement before saving resumable progress, then verified the
whole range before switching the live branch. The subsequent records checkpoint is signed separately.
The three pre-existing untracked root notes remain excluded, as do private runtime data and keys.

### Reference and workflow consequences

- Existing code, fixtures and scripts have no references to hashes changed by this sweep. Their
  historical source lookups need no substitutions. Historical logs, receipts, manifests, completed
  entries and original review packets retain their original bytes and IDs.
- The retained Tailscale installation still reports its actual build `95433108`. Its source-equivalent
  signed counterpart is `5e47a043`; signing does not rebuild or redeploy the running artifact.
- Preserve the signed remote PR branch after squash integration. Repository automatic head deletion
  is currently disabled. A normal full clone can then resolve its phase commits and older executable
  source baselines. An old unsigned ID can be translated using this crosswalk without publishing the
  unsigned backup branch.
- Squash integration gives main a new combined commit, not the phase commits as ancestors. Before
  resuming validation on a branch created from that squash, explicitly reconcile tools that require
  reviewed commits to be ancestors of `HEAD` (including `scripts/remediation-status.mjs`). Keeping
  objects available does not satisfy that ancestry check. Do not relax the proof or silently relabel
  old receipts as new runs. This is an identified post-squash workflow task, not completed validation.
- Future PR/deployment commits are signed. If signing cannot complete, leave the work staged instead
  of adding another unsigned checkpoint. Full validation remains explicitly paused; automatic CI
  runs only the existing application build.

Earlier sweeps remain recorded in [September 11's crosswalk](../account-conformance-runs/2026-09-11-signed-contract-history.json)
and [September 13's signing record](../review/implementation/signing-prep-2026-09-13.md).
