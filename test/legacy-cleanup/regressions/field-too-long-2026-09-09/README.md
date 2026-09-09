# Confirmed cleanup size failure

This input failed in the user's native `2026-09-09T19-10-29.708Z` run, at generated history 21.
`diagnostic.json` records the original `Field too long` stack through database fingerprinting;
`report.json` records the later shrink timeout. `provenance.json` pins exact copies of all three
artifacts. Shrinking did not finish, so this input is not claimed to be minimal.

The source reader accepts this database, but v1 cleanup converts all rows to hex JSON and passes
that value into one 65,535-byte field. The bounded repair introduces a cleanup-only v2 encoding
while preserving existing v1 records. The saved input now passes the isolated native replay,
including the observed injected-abort boundary and journal-only destination edit.

```sh
pnpm storage:legacy-cleanup --mutant baseline --replay test/legacy-cleanup/regressions/field-too-long-2026-09-09/input.json
```

[Focused repair evidence](../../../../docs/storage-conformance-runs/2026-09-09-legacy-cleanup-size-repair.md)
records the runs and remaining acceptance work. This is a regression input, not evidence that the
full cleanup campaign or migration phase is complete.
