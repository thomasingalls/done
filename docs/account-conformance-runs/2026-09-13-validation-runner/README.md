# Validation execution foundation — bounded evidence

Baseline: unsigned `f13bdd1` plus this phase's source pins. No existing commit was rewritten. The
protocol and remaining execution blockers are in [release-validation-execution.md](../../release-validation-execution.md).

## Final results

| Evidence | Result and boundary |
| --- | --- |
| `passing-gates/summary.json.gz` | All eight gates pass: inventory, manifest, 32 checker/runner tests, types, scoped lint, scoped format, authority and expected whole-release refusal. Sources unchanged. |
| Generated controls | 160 package DAGs (seed 130901), 160 catalogue omissions (130902), 160 actual-case omissions/outcome mutations (130903): 480 generated histories, alongside real subprocess controls. |
| `passing/summary.json.gz` | All five disposable stages pass: 4 identity, 10 inventory and 6 manifest cases; authority/registry and inventory freshness checks. Every group drained. Started 08:57:57 UTC, completed 08:58:38 UTC. |
| `passing/inputs.json.gz` | 13,867 current source/document/evidence pins and 8,761 installed dependency file/link pins, baseline revision and Node executable/runtime identity. Original and disposable inputs matched and stayed unchanged during the selection. |
| Release control | `plan.mjs --require-complete` exits 1 for an unresolved execution obligation. The 593-row manifest contains 447 blocked rows; these are not credited as passes. |

The source pins include dirty working-tree changes; this is not a clean committed release revision.
Evidence/checkpoint prose was appended after execution. The exact final runner/checker code pins still
match; the entire subsequently documented tree is not claimed identical to the frozen selection.
No native campaign, crypto-audit campaign, vector selection, complete vector chain, `pnpm check`,
P-06 prose sweep or release aggregate ran. No browser, personal profile, server, root build or Account
operation was used. The crypto-audit input-scope repair is covered by the fresh-population/dependency
tests, not a rerun of that full campaign.

## Failures and discriminating follow-up

An initial standalone control run threw `kill EPERM` from an output callback while stopping a flood.
Its transcript observation is preserved in `initial-control-observation.json`; no missing full raw
log is invented. Stopping became idempotent and signal/log errors were converted into failed results.

The full `failed-gates` attempt then passed seven gates but failed its 31-test control gate: 30 cases
passed; a flood returned `log-limit: cleanup failure EPERM`. The runner did not credit uncertain drain.
All logs, commands, results and then-current source pins for that attempt are retained.

The exact same focused probe was run 30 times under the sandbox and 30 times outside it. Uncertain
drain occurred 10 and 9 times respectively. Captured syscall sequences show a successful TERM followed
by `kill(group, 0)` returning EPERM. This rules out the sandbox-only explanation; it does not establish
a general kernel diagnosis. The repaired runner retries uncertain probes within its existing grace
period and requires ESRCH to prove the group is gone. All 30 repaired probes stopped for `log-limit`
and proved drain. An injected persistent-EPERM control still refuses within the bound; uncertainty is
never success. These observations live in `flood/{sandbox,host,repaired}.json.gz` with the probe source.

Other real controls remove/skip Node case registrations, omit/duplicate/change reported outcomes,
replay a stale nonce, change helper or installed dependency bytes, survive a mutation, cancel or time
out a TERM-resistant leader/child, orphan a child after leader exit, and catch a detached-spawn refusal.
They check the specific failure rather than accepting arbitrary nonzero exits as mutation detection.

`initial/summary.json.gz` records the earlier five-stage disposable run with 19 cases, before the
dependency-order test and final probe repair. It is historical intermediate evidence, not relabeled
as a test of the final runner.

## Archive integrity and size

Prospective ceiling: **1,500,000 bytes** for this evidence directory. The archive is approximately
1.08 MB. Historical reports and vectors are untouched. Raw attempts remain under ignored
`test-results/release-validation`, `test-results/validation-runner-gates` and the three flood-probe
JSON files. Captured logs/reports normalize workspace and disposable directory prefixes to
`$WORKTREE` / `$DISPOSABLE`; raw/decompressed/normalized/archive hashes are in `archive-files.json`.
Normalization does not produce a new raw execution identity; receipt keys refer to the raw attempt.

The full final input snapshot is stored once. `initial/inputs.delta.json.gz` losslessly reconstructs
the earlier input object from it: replace top-level `fields`, then apply each `patches` map by path
(remove listed paths, upsert listed rows, sort by path). Canonical sorted-key compact JSON plus a
newline must match `targetDecompressedSha256`. That reconstruction was checked while archiving.
The input snapshots themselves contain relative source/dependency paths and are not normalized.

`preservation.json` records unchanged 21 personal package files, 31 prior vectors, exact L-2 suffix,
append-only completion and no personal operation. The temporary execution checkouts were removed
after explicit process-group drain. This packet closes the runner foundation only; native content
catalogue census/ownership integration is next.
