# Approved local disk cleanup

The user approved the three previously enumerated groups. Cleanup completed before performance
measurements: 29 duplicated documentation trees in temporary source snapshots, three publication
source archives (`203a0655`, `77657e23`, `9465fb04`), and fourteen synthetic browser-profile
directories under `test-results/legacy-host/*/profiles`.

Removed allocation: **16,083,345,408 bytes**. This is `du` accounting, not a measured physical
free-space delta on APFS. Source archive headers were verified against the named Git revisions.
The cleanup checked 536,858 documentation files. Any document differing from its current
repository counterpart was preserved by content hash before deleting the duplicate trees:
415 original paths, deduplicated into approximately **11.19 MB** including manifests.

The exact deletion list, preservation map and saved document variants remain in
`/private/tmp/done-cleanup-preserved-20261012/`. The source file list for approved documentation
copies was `/tmp/done-cleanup-candidates-20261012.json`; execution script and verification remain
at `/tmp/done-approved-cleanup-20261012.py`. No broad `/tmp`, Docker or test-results cleanup ran.

The fixture files `/tmp/done-client-receive/fixture.json` and
`/tmp/done-foreground-stall-20261012/diagnostic-before-2/deep-received-fixture.json` were hashed before
and after cleanup and were unchanged. Their associated service/browser state, other fixtures,
source trees outside their duplicated docs subdirectories, committed evidence, raw performance
profiles/logs/patches, `.dev`, dependencies and container images were retained. The first new
typing/undo/offline-reopen probe also successfully used the retained deep fixture afterward.
