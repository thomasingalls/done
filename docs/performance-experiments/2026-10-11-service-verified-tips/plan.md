# Service verified publisher tips — protocol recorded before implementation

Baseline: `39914c69` (runtime is `c15ced0e`). The imported catch-up packet is independent
measurement on deployed `7b6d8d9f`, not a matched baseline for this change.
Release qualification remains paused. Work here is a bounded performance/correctness repair.

## Approved integrity policy

A publisher is fully verified at first use after process start or cache invalidation. Ordinary
operations may reuse a compact verified tip and verify only the suffix. Retain no historical
submission, envelope or response arrays in that tip. Keep authority verification, custody checks,
transaction fencing and fixed-purpose signing. Scope reuse to exact authenticated membership.

Every request compares the retained witness and indexed row count with its verified evidence.
An indexed COUNT returns a scalar without loading ciphertext, but SQLite may scan index entries:
this is not a claim of O(1) database work. Do not introduce a schema counter silently.
Rows returned to clients must undergo fresh signature and binding verification. New witness/link
signatures extend the verified tip, never a hash recomputed from unchecked old bytes.
Other-connection writes (SQLite data_version), membership changes, pruning, close and failed
verification invalidate reuse. Historical retries can use a fresh full census initially.

Full audits run outside the request event loop on a read snapshot. Schedule after 256 appended
rows and at backup cycles, coalescing work per publisher; no five-minute inline request stall.
Startup is still a full census. Failure quarantines the affected publisher with fixed diagnostic
`ledger-integrity`, signals the operator without content or identifiers in logs, and never repairs
or signs for that publisher. Stale/closed audit results cannot reinstall evidence.

This deliberately changes detection time: an unread old row altered without changing count,
witness or SQLite change tracking can remain undetected until audit. Extensions before detection
still commit to the previously verified bytes; this does NOT promise that latent disk corruption
immediately stops all signatures. Whole-store coordinated rollback remains outside this mechanism.

## Fixed measurement and decisions

Seed real signed epoch-1 decisions directly into disposable SQLite fixtures; fully verify the
seed before measurements. Measure 0, 128, 512, 1024 and 3072 positions. Separate cold first use,
warm read, next-position submit and history-catalog requests. Five sequential warm observations
per cell, same machine, no parallel heavy tests. Retain raw times and every failed attempt.
Measure bytes/rows retained by the tip and verification counts independently of wall time.

Predictions before coding: warm crypto work and loaded decision bytes become independent of
prefix length (one served entry or new suffix); full startup/audit work remains linear. At 3072,
warm useful-read median should be below 100 ms and below 25% of baseline, without the 512-row
cliff. These are experimental acceptance targets, not release latency guarantees. Count-query and
membership costs can leave a residual slope. Record it rather than hiding it in cache capacity.

Focused controls: malformed canonical hex; fresh served-row tamper; missing rows/witness change;
external writer; abort and unknown commit; authority/pruning; overlapping verification; audit
mismatch, stale audit and close. Existing delivery/inbound/history regression suites run once
following repair. No generalized fault/mutation/qualification campaign.

Next client slice explicitly targets custodyRecord.recordEqual, sticky publisher selection,
content/control hints and bounded receive sweeps with due-send fairness. Its matched two-device
measurements include receiver long tasks, writer accepted-position intervals beyond 500, and
keystroke-to-peer delay with batching on both devices. Service repair need not wait for it.

### Measurement amendment after first comparison, before general-membership comparison

The first probe used the original epoch-1 core fixture without general membership enabled and did
not exercise catalogue reads. Keep it and both result files as an initial diagnostic, not evidence
for catalogue performance. Repeat both arms with the supported general-membership/session
configuration enabled, still at epoch 1, adding five signed catalogue requests per depth and
candidate census/served-check counters. Both arms run the same revised probe. Baseline source is
an isolated archive of `39914c69`; candidate is the working implementation. No measurements pooled.

### Final audit overlap control

After focused checks, repeat the final candidate's general-membership probe. Only after finishing
its 3072-position timing cells, request one real worker census while issuing empty-tail reads with
10 ms gaps. Retain the entire request-latency array and total audit duration. This demonstrates
request progress during a full audit; it does not promise zero CPU contention or measure mobile
latency. No audit is started during the matched cells above.
