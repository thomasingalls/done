# Confirmed cleanup size failure

This input failed in the user's native `2026-09-09T19-10-29.708Z` run, at generated history 21.
`diagnostic.json` records the original `Field too long` stack through database fingerprinting;
`report.json` records the later shrink timeout. `provenance.json` pins exact copies of all three
artifacts. Shrinking did not finish, so this input is not claimed to be minimal.

The source reader accepts this database, but cleanup converts all rows to hex JSON and passes
that value into one 65,535-byte field. The exception occurs before cleanup persists its manifest
or deletes source material. A focused bulk-encoding repair and isolated replay are required next.

[Run evidence](../../../../docs/storage-conformance-runs/2026-09-09-legacy-cleanup-failure.md)
retains the event log and records what completed. The full cleanup campaign remains incomplete.
