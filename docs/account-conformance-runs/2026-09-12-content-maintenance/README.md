# Owned automatic content maintenance — F-16

The passing campaign has nine stages: 1,011 unit tests, 24 generated flush/idle schedules, 35 native
Node cases, plus the full trim component and its deliberately failing controls. Source pins match.
The actual packaged editor made 140 edits, automatically reduced durable content to one encrypted
state record, then cold-reopened the exact input. The seven Account sync cases, twelve ordered receive
cases and fifteen capture cases include original-source/pending/compaction/crash checks, 16 generated
capture histories and ten generated ordered receive histories. `passing/summary.json` records timing.

Two earlier attempts are retained. `typecheck-attempt` caught incomplete receipt types in new test
doubles, corrected before runtime. `grouped-timeout-attempt` used an inadequate shared 240-second
budget for three Account suites: capture and the receive generated histories passed before expiry,
but the last receive case and sync could not complete. The corrected runner gives each suite its own
bounded stage using existing deadlines (180/480/180 seconds), preserving heartbeats and cancellation
census. This does not close the wider aggregate validation/timeout finding F-20.

The thresholds (128 committed content changes or 1 MiB; 750 ms idle after journal drain) are advisory
work triggers, not optimality or hard capacity claims. Maintenance uses the admission flight and the
existing authenticated exact-coverage compactor. New input waits, close invalidates/drains, pending
originals are retained, and ordinary transient maintenance failures do not block durable editing or
spin retries. New growth or fresh open is needed for another attempt. Corruption still refuses use.
No Account proof history, outbound records, heads or journal are pruned by this scheduler. Continuous
activity, unresolved dependencies and a large singleton state remain limits; cold open remains a scan.
