# Validation inventory — bounded phase 1 evidence

Parent `d03e473`, plus the source-pinned inventory changes. The final result is
`passing/summary.json`; all six final checks pass:
planning snapshot, checker tests, TypeScript, scoped lint, scoped format and current authority.
The checker has ten tests, including 160 seeded generated package DAGs and directed real-file
omission/drift controls. It does not import or run the test/campaign modules it inventories.

The graph records 122 package scripts, 78 campaign entrypoints, 261 test files (255 required, six
retired v8 product exclusions), 12 catalogues, 29 current vector corpora and 83 constructions.
Every recorded input remained unchanged through the checks. Reproduce using the exact commands
in `passing/summary.json`; the generated graph and human scope live in `docs/release-validation-graph.*`.
The full graph is retained once in the repository, with its SHA-256 in the source manifest.

The separate `pnpm validation:inventory` attempt produced no output and was stopped with SIGTERM.
Its cause is not established, and it is not a passing execution. The two commands in that package
script pass when invoked directly under Node. No package-manager repair is claimed.

`archive-files.json` records raw and normalized hashes. Only workspace prefixes are normalized;
gzip is lossless over those normalized bytes. No browser profile, source tree or old report archive
was copied. This is a planning/checker receipt, not runtime/native/aggregate or release evidence.

The root-level six-check receipt predates the generated-file formatting correction. A separate
format check found the new JSON snapshot needed formatting; the recorder now uses the installed
formatter, and the final format stage includes the generated artifact. The final checker also
refuses previously unknown test-file extensions. Earlier passing scope is retained without relabelling
its inputs as current. `passing/sources.json.gz` binds the final graph and code; all pins match.
