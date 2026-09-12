# Q-02 carrier work: preserved natural workload and first reduction

Parent: unsigned `2dcd897`. [Contract and result](../../review/implementation/liveness-followups.md#q-02-carrier-result).
Both the baseline and eight-stage carrier campaign pass; exact commands, sources and tested contracts
are in their run folders. The first workload uses an ordinary bundle (no instrumentation); after cold
reopen one additional edit counts the carrier work. No manual retry is used to drain edits/bursts.

| Observation | Before | Carrier-only repair |
| --- | ---: | ---: |
| Thirty-edit burst after 80 settled edits | 112.7 s | 90.1 s |
| Network positions created by burst | 30 | 30 |
| Instrumented subsequent single-edit loads | 36 | 31 |
| Time inside those loads | 3.67 s | 2.75 s |
| Instrumented edit round trip | 4.93 s | 3.97 s |

The ordinary final five individual edits are 3.61–4.09 s before and 2.76–2.91 s after. Native cold
replay preserves the exact writing. Timing is inclusive and machine-specific; no sample percentile,
thousand-position extrapolation or capacity qualification follows. Batching remains the next subphase.

1,016 unit tests, all 13 content cases/five mutants, 23 native ownership/tamper/held-HTTP/abort tests,
the same workload, types, current authority inventory and scoped lint/format pass. Every load still
collects and authenticates complete rows with their physical keys. Projections detach selected results;
network re-entry and every append retain their fresh publication/commit checks.

Replay `node --test test/account-liveness/workload.test.mjs` for the workload. The runner and complete
commands are retained beside the campaign summary. `archive-files.json` records original local paths
and hashes; only workspace prefixes are normalized, with lossless gzip. No full release aggregate or
change to personal profile, package, keys or server is claimed.
