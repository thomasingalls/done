# Incremental verification and coverage evidence

Parent: unsigned `280221e`. Source pins describe this runtime/test patch. All eight campaign stages
passed. Native complete-view controls also compare incremental spool/witness/delivery/inbound results
with their full verifiers before publishing each changed view. Warm status, seven disk tamper controls,
compaction and cold replay pass. The 40 generated inbound histories compare full and reused results,
including pending originals, deletion, reordered/duplicate inputs, missing coverage, changed authority
and altered event bytes. The 150 spool histories add warm source/envelope/witness mutation checks.
The memo has detached-result, changed-context, stale-completion and pruning controls.

The 24-job run took 59,263 ms, versus 128,091 ms after phase 1 and 256,010 ms in the initial campaign.
These are descriptive runs on one host. Full metadata enumeration, semantic replay and exact input
comparison remain proportional to retained history. Cold opens verify every event. Network hold and
late expiry still reproduce here; their repair is the next boundary. No schema/crypto bytes or personal
installation changed. Coverage reconstruction has a separate new probe; baseline coverage counters
measured calls to the old per-event reconstruction function and are not interchangeable.

The separately run full unit suite passed 996 tests in 91 files (33.72 seconds); TypeScript build checks and scoped production lint passed.
