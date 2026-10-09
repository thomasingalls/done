# Composed Account campaign preparation

Read-only inventory at signed `3af765d3d96e452488242b51b2969b4da81b66ef`.
No campaign or test was imported/executed. No release obligation resolves in this phase.
The [plan](../../release-validation-composed-campaigns.md) records child contracts, retirement,
report namespaces, historical inputs, prerequisite ordering and qualification requirements.

`inspect.mjs` reads selected array expressions through a finite AST interpreter. It rejects unknown
calls and never evaluates JavaScript extracted from a campaign. The reviewed helper/run-loop behavior
is pinned by each campaign source hash; this tool is a preparation inventory, not a replacement
production compiler. Full Vitest and nested component populations remain explicitly unexpanded.

From the repository root, reproduce the frozen inventory without running its campaigns:

```sh
node docs/account-conformance-runs/2026-09-16-composed-campaign-prep/inspect.mjs --baseline > /tmp/done-composed-inventory.json
diff -u docs/account-conformance-runs/2026-09-16-composed-campaign-prep/inventory.json /tmp/done-composed-inventory.json
```

Omit `--baseline` to inspect current source and reveal drift. The tool uses installed Babel to parse
source; it does not reconstruct the dependency installation. Two internal negative probes confirm
unrecognized calls refuse. The first draft incorrectly counted a test filename passed to style tools;
the reader now only counts files in an actual `--test` invocation. The discarded draft inventory is
preserved as `initial-inventory.json`, not credited as correct evidence.

`report-size-sample.json` records four complete-file byte counts and hashes from three already
preserved owned campaigns (activation, service-delivery and admission-bounds), with their receipt keys.
The originals remain in those phase archives. Their sum exceeds the existing 4 MiB report-set cap;
this is a historical size sample, not a new execution or a guarantee about the combined run.
No raw report is truncated or copied here. The entire preparation directory is below 1,000,000 bytes.
