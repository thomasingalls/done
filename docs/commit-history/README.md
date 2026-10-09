# Commit identity records

Signing a previously unsigned commit changes its ID, and changes every descendant that names it as
a parent. Historical test evidence keeps the ID that was actually tested. These records connect that
evidence to source-equivalent signed commits; they do not claim that tests ran again.

## 2026-10-09 — Signed product history and PR #41 merge

The operator requested signing the outstanding history after discovering main's original repository
rules: pull requests, verified signatures, linear history and squash-only integration. Before merging,
the operator disabled linear history and made merge commits the only allowed method in both repository
settings and the main ruleset. Required PRs, signatures and force-push/deletion protections remain.
This preserves the validation tooling's existing ancestry model instead of adapting it to a squash.
The JSON crosswalk remains the immutable signing-time record, including the policy at that time.

The [full crosswalk](./2026-10-09-signed-product-history.json) records 102 unsigned commits replaced
with signed commits, plus one signed merge re-signed because its parent changed. Each replacement
preserves its exact tree, message, author and committer metadata; only parent IDs and signature
headers change. All 397 commits in `c61ad005..826bb006` have good local SSH signatures. The final tree
is identical to original `73a1d881`. This required no patch replay and changed no application code.

Original objects remain under local `codex/pre-sign-public-deployment-2026-10-09`. The signed chain
and signed records checkpoint `f1b91985` were published through
[PR #41](https://github.com/thomasingalls/done/pull/41), using a normal fast-forward update from
`d178d349`. GitHub verified all 398 PR commit signatures. The operator merged it as `8c6005f3`, whose
parents are `c61ad005` and `f1b91985`. GitHub verifies the merge signature; its tree exactly equals the
PR head. All 398 PR commits remain ancestors of main. Local main and `codex/first-public-deployment`
were fast-forwarded to that merge. The earlier local merge remains in the backup/crosswalk.

The signing process verified each replacement before saving resumable progress, then verified the
whole range before switching the live branch. The subsequent records checkpoint is signed separately.
The three pre-existing untracked root notes remain excluded, as do private runtime data and keys.

### Reference and workflow consequences

- Existing code, fixtures and scripts have no references to hashes changed by this sweep. Their
  historical source lookups need no substitutions. Historical logs, receipts, manifests, completed
  entries and original review packets retain their original bytes and IDs.
- The retained Tailscale installation still reports its actual build `95433108`. Its source-equivalent
  signed counterpart is `5e47a043`; signing does not rebuild or redeploy the running artifact.
- Main now retains the signed phase commits and their ancestry. Their reachability no longer depends
  on retaining the remote feature branch; no branch was deleted during reconciliation. An old unsigned
  ID can be translated using this crosswalk without publishing the unsigned backup branch.
- The previously identified post-squash ancestry task is obsolete because no squash occurred.
  Ancestry-based tools (including `scripts/remediation-status.mjs`) need no merge-related relaxation.
  This preserves their history input; it is not evidence that the paused validation campaign passed.
- Future PR/deployment commits are signed. If signing cannot complete, leave the work staged instead
  of adding another unsigned checkpoint. Full validation remains explicitly paused; automatic CI
  runs only the existing application build.

Earlier sweeps remain recorded in [September 11's crosswalk](../account-conformance-runs/2026-09-11-signed-contract-history.json)
and [September 13's signing record](../review/implementation/signing-prep-2026-09-13.md).
