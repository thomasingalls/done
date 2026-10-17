# Enrollment throughput: bounded development patch sequence

Base: signed `2f1d0b0fd72e4879e96c2a0eeaf052918e3ceb54`. This extends the two separately prepared authority-attribution/reuse patches without changing their bytes. There is no commit, push, preview update, merge, deployment or qualification resumption.

| Patch | Bounded outcome | Evidence |
| --- | --- | --- |
| 01–02 | Prior attribution, fault-route repair and one-group historical-authority reuse | [Prior evidence](../2026-10-16-enrollment-authority-reuse/02-reuse/README.md) |
| 03 | Charge actual sequential reads and hold one live HTTP reservation; retain numeric rates | [Accounting](./03-accounting/README.md) |
| 04 | Attribute sustained replay, same-session writing and second-account load | [Load](./04-sustained-load/README.md) |
| 05 | Verify up to eight transient history entries per page without changing durable receipts | [Density](./05-dense-pages/README.md) |
| 06 | Preserve the concurrent-writing falsifier; defer the unsuccessful cache prototype | [Failed experiment](./06-concurrent-writing/README.md) |
| 07 | Repair complete historical-reader and real counter-read probes; close functional checks | [Final checks](./07-native-fixtures/README.md) |

The rate boundary did contribute to delay. Exact accounting alone still leaves 56–59 seconds of explicit backoff in 1,024-position single-entry replay. Eight-entry pages complete three follow-up API runs in 3.216–3.974 seconds with zero 429s under unchanged rates. Those are mechanism observations, not an independently paired API speedup estimate. In 14 restored browser connections, original/joined 96-edit medians improve a further 10.86%/10.71% after accounting (5,449→4,863 ms / 5,447→4,854 ms); every export, two-way-writing and lock/reopen comparison passes. Fresh-workspace comparison is 3,846→3,863 ms (one pair). These are small desktop/local-service samples.

**Open acceptance blocker:** all six fixed-offer concurrent-writing stress arms refuse replay with 409 unknown/state-changed, including the proposed extra prefix-cache repair. This is not a 429 issue. Reduced census work does not establish completion. The prototype is retained only as deferred evidence; the runtime is restored to exact phase C. These are reviewable development patches, not a release-ready performance change. Next: reproduce the real client's transient state-change handling and establish bounded completion/write latency under the same fixed-offer workload while preserving every authorization, cut, expiry/retirement and corruption check.

All old assertions/cases/deadlines and qualification blocks remain, apart from explicitly replacing the defective three-file-transform census with independent full historical graph identity and renaming the content-read counter case to describe its actual probe. Seven new test files remain blocked from aggregate credit; all 78 specified and 14 open construction statuses remain. Planning is blocked at 874 obligations / 330 unresolved. General qualification, unrelated formatting and the account-disappearance investigation remain separate. Private snapshots, keys and service databases stay outside Git.
