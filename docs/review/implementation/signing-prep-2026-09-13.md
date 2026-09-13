# Prepared signing sweep — 2026-09-13

**Status: thirty signed replacements verified; current workflow reconciled.** The user confirmed
being at the keyboard before signing began. Every replacement has a good configured SSH signature,
the identical original tree, exact message and unchanged author/committer metadata. The live branch
moved once to `3e53b4a`; the eleven intake files and all 103 other original refs were preserved at the
switch. The original history remains under the local backup ref below.

The [per-commit crosswalk and check evidence](../../account-conformance-runs/2026-09-13-signed-review-history.json)
records all thirty full IDs and tree pairs. Three executable historical-source lookups now use their
signed counterparts; their source bytes are identical. Generated plans retain 607 obligations and
416 unresolved IDs. The affected inventory/manifest/stage tests pass 31 cases, and the real old-reader/
batch controls pass two cases. The review intake and this workflow reconciliation accompany a separate
signed checkpoint; its own signature is verified after commit. No production repair or aggregate run
is claimed. R-01/R-03/R-04 remain separately open.

The procedure below records the prepared invariants and the completed sweep. Preflight and intake
JSON remain immutable snapshots of the state before signing; their historical “awaiting” fields are
not current task status.

At assessment `6ba7c22b31590f97d561b543d8918219dc279cc5`, the branch
`codex/encrypted-store-contract-corrections` has **thirty consecutive unsigned commits** after signed
`1372c39f9cd495f75ddf8a438ab314af14df4380`. The chain is linear. The
[preflight inventory](./signing-preflight-2026-09-13.json) records every original commit, tree, parent,
author/committer, message hash and raw-object hash. The original tip tree is
`84dcadd60384c862a5122d8fbb60d6ae186e5c01`.

The earlier eleven-entry Q record was a snapshot at `9ff48b5`; seventeen were unsigned at review tip
`d03e473`. Preserve those records. The new R intake adds current context and fixes the stale
“uncommitted” sentence in `validation-controls.md`. This is the Q-06/Q-07/R-02 continuation of the
[earlier P-04 crosswalk](./findings.md#p-04-historical-commit-crosswalk).

## Procedure used after keyboard confirmation

1. **Recheck the boundary.** Re-read HEAD, index, working diff, refs and relevant worktrees before any
   mutation. Stop and reconcile if another task has moved the branch or changed the proposed files.
   Keep the intake/prep patch outside the replacement commit trees. The unrelated untracked `done `
   and personal recovery/package files stay outside the index. Use explicit file lists, never `git add .`.
2. **Preserve originals first.** Create and verify local backup ref
   `refs/heads/codex/pre-sign-review-history-2026-09-13` at the captured old tip. Retain the earlier
   `codex/pre-sign-contract-history-2026-09-11` ref. Preserve a copy of this preflight/patch and a
   resumable old/new mapping before invoking the configured SSH signer. Do not push a backup branch.
3. **Sign the chain without replaying its patches.** Create signed replacement commit objects in
   oldest-to-newest order using each original tree and the mapped parent. Preserve exact message,
   author and committer metadata, as in the previous signing sweep; verify rather than assume the
   commit-building method preserves them. Only signature headers and parent IDs should differ.
   Preserve any additional original headers or stop if the method cannot. Keep verified partial
   progress under a temporary ref so cancellation need not repeat completed signature prompts.
4. **Verify before changing the branch.** Verify every signature with the configured allowed signer,
   every tree pair, every parent, metadata and message bytes, and final ancestry from `1372c39`.
   Require the replacement tip tree to equal the captured original tip tree. Record failures and
   leave the live branch unchanged on incomplete verification. A signed tag is not a substitute for
   these thirty commit signatures.
5. **Move the branch once.** Use an expected-old-value ref update only after the complete replacement
   chain passes. Preserve the worktree/index patch; the identical tip tree should require no reset,
   checkout or stash. Verify that patch bytes, unrelated files and other worktree refs remain intact.
6. **Reconcile current workflow in one signed follow-up commit.** Write the permanent old/new/tree/
   signature crosswalk under `docs/account-conformance-runs/`, link it from the R/Q/P-04 index and
   current roadmap, migrate the real executable baseline references below, and regenerate affected
   graph/manifest data with their owning tools. Include this intake and append the completed signing
   outcome before updating L-1. Sign that documentation/baseline reconciliation commit as well.
7. **Validate and close.** Confirm thirty verified replacements plus the signed reconciliation commit,
   no remaining unsigned descendants in the selected chain, resolvable current executable baselines,
   identical loaded baseline source bytes, current graph/manifest readback and the affected inventory/
   manifest/stage controls. Record the checks actually run. Recheck preserved archives, vectors,
   personal package hashes and L-2. Mark signing complete only after verification; keep the old backup
   and crosswalk. No personal server/browser/cutover or remote push belongs to this sweep.

## Hash-reference dispositions

The tracked-HEAD text census finds **126 files**: 109 historical evidence/append-only files,
13 current navigation or generated-plan files, and four executable/test files. It excludes compressed
and binary blobs; those remain unchanged. Re-scan after intake and at execution rather than treating
these counts as timeless. Absence from local remote-tracking refs does not prove nobody has a copy.
The reviewer's separate worktree still pins `d03e473`; do not move it or unrelated branches.

| Reference class | Action |
| --- | --- |
| Original review packets/intake manifests, historical `scope.json`, source pins, gzip artifacts, completed/decision entries and commit messages | Preserve the exact old bytes and IDs. Add crosswalk navigation; do not globally replace hashes. A signature proves authorship of its commit, not that a historical campaign reran. |
| `scripts/private-release/run.mjs` before-version arguments `063cd72` and `70e6d5b` | Replace with full signed counterpart IDs after verifying the loaded source/tree is identical. These commands must work in a future checkout without relying on an unpublished backup ref. |
| `test/account-ledger-contract/runtime.mjs` old-reader `git show 77a2753:src/crdt/spoolRecord.ts` | Replace only the revision with its signed counterpart; compare the actual old/new `spoolRecord.ts` bytes. Preserve the deliberate old-reader negative control. |
| `test/release-validation/manifest.test.mjs` and `stage.test.mjs` | Their hash-shaped values are arbitrary argument/identity fixtures, not Git lookups. Keep them unless a real dependency appears; do not spend signatures rewriting labels. |
| Current progress/index/phase navigation | Add mapped signed references where they describe current branch location; retain explicitly historical measurement/source identities. Label which is which. |
| Generated graph and obligation manifest | Regenerate after executable baseline changes; keep exact before-source variants and dependencies. Inspect the diff for only explained baseline/pin changes, unchanged required case counts and unchanged unresolved coverage. Do not hand-edit fingerprints. |
| Current validation execution receipts and `.receipts/` | The bounded runner's identity includes revision, source/dependency hashes and runtime. A signing-only replacement still changes that identity. Preserve old receipts as historical evidence; generate applicable new receipts by executing their owners. Never relabel or copy them into a fresh success. |

The signature-only chain preserves all thirty trees. The subsequent reconciliation commit changes
current documentation and three executable baseline references, so it needs its own applicable
checks and source pins. Historical evidence does **not** require universal reruns merely because
commit signatures changed; the planned final aggregate must still run on its final immutable revision.
It remains blocked on general adapters, R-03/R-04 style/deadline integration, current prose and other
stated prerequisites. Do not run it just to complete signing.

## Signed phase navigation

| Original commit | Signed counterpart | Phase |
| --- | --- | --- |
| `0e07fe4` | `82cb5d5` | Measure sync liveness and define verified-view repair boundaries |
| `280221e` | `2623b83` | Reuse complete verified Account views within the owned lifetime |
| `879ce38` | `f5f166b` | Reuse verified events and exact content coverage in private sync |
| `902d352` | `3a6b6a8` | Keep HTTP waits outside storage order and retry expired reads |
| `f42b4a7` | `1bb711b` | Complete sync liveness with precise wakes and bounded service verification |
| `67304f3` | `115ab78` | Extend privacy evidence through packaged migration and physical carriers |
| `8ebccfd` | `4ea683f` | Preserve bounded failure diagnostics without granting unsigned authority |
| `01b3036` | `8c0d7a8` | Offer authenticated read-only partial Local recovery |
| `70e6d5b` | `0d7d4ca` | Schedule owned exact-coverage content maintenance after durable idle |
| `063cd72` | `1fca26e` | Reduce projection cost while preserving complete state checks |
| `9ff48b5` | `9590472` | Reduce retained promotion duplication and preserve exact authentication |
| `409fbd0` | `95bbed7` | Assess Q review addendum and reconcile remaining validation and liveness work |
| `dceec5c` | `024664d` | Restore reviewed construction inventory and effective validation controls |
| `2dcd897` | `4eacfcc` | Bind service verification reuse to the authenticated request digest |
| `77a2753` | `284a97a` | Reduce redundant carrier work and preserve the natural sync workload |
| `7cbb063` | `87ed35c` | Batch bounded original sources with durable allocation and exact retry |
| `d03e473` | `4e692be` | Expose receive expiry while preserving bounded automatic recovery |
| `f13bdd1` | `a38bb6b` | Inventory release validation coverage and preserve explicit execution gaps |
| `f14c68f` | `568c2a5` | Add bounded validation execution and preserve unresolved release obligations |
| `b9f0984` | `a44f09d` | Integrate content catalogue with owned native validation |
| `1a86453` | `b60a5c7` | Integrate journal catalogue with owned native validation |
| `4fc3af0` | `4eb1071` | Integrate admission catalogue with owned native validation |
| `3f1afc5` | `ad475bc` | Integrate editor catalogue and repair native runner evidence boundaries |
| `ddd77a3` | `de6c65d` | Integrate workspace admission catalogue with owned validation |
| `6348b6c` | `4a908b0` | Integrate owned startup catalogue with bounded validation |
| `be5d6a0` | `ebefde0` | Integrate Local genesis catalogue and byte-array evidence |
| `f1926f9` | `d0e982c` | Integrate authenticated Local-clear catalogue execution |
| `d65bda0` | `893def3` | Integrate exact-coverage compaction catalogue execution |
| `2c5f4b9` | `b32f7c2` | Integrate custody catalogue and owned synthetic profile copies |
| `6ba7c22` | `3e53b4a` | Complete lifecycle catalogue adapter and restored-page validation |

## Remaining release order

After signing, repair R-01 before a durable Account cutover. Continue general test/wrapper integration,
including R-03/N-06 and R-04, then P-06 and the selected immutable aggregate. Preserve workload,
privacy/platform and Account recovery dispositions. Human Account promotion/recovery/enrollment and
second-device adoption follow acceptable private validation; no generic public release is implied.
