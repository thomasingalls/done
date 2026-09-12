# Equivalent projection comparison and bounded archive memo — F-17

Eleven stages pass, with all 914 source pins unchanged: 1,015 unit tests, 150 generated comparisons
against the always-normalizing reference, 100 archive mutation histories, the existing 500 pending
fork histories, 100 native pending/workspace histories and 100 native delivery/handoff histories.
Equal-clock unequal-content and publication drift controls detect deliberately removed checks.
The actual packaged fresh/migration/privacy regressions also pass. Large/raw JSON is gzip compressed;
`archive-files.json` records original names and hashes. The native subcampaign snapshots are retained.

After SV/DS/pending checks, byte-for-byte equal **full integrated encodings** establish equality without
normalization. Differing encodings still receive the full GC-normalized comparison. This preserves
runtime undo-retention and split-boundary equivalence; no periodic guard or authoritative document cache
was introduced. The archive memo is derived, capped at 512 days/2 Mi characters counting source and
parsed strings, uses exact current text, detaches arrays, handles live-section masks after copying,
evicts absent dates and clears with the owner. Those counters do not bound total JS heap use.

The sequential single-host Node/M1 Pro profile holds visible text at 100,000 characters, with one
warmup and five measured samples per item count. The carrier is controlled and memory-only; inclusive
command time includes the actual admission/workspace path but excludes browser paint and network.

| Yjs items | Command acceptance median before | After |
| --- | ---: | ---: |
| 1,000 | 15.8 ms | 15.3 ms |
| 10,000 | 28.2 ms | 22.6 ms |
| 100,000 | 190.2 ms | 121.2 ms |

At 100,000 items, full comparison median drops from 97.4 to 23.8 ms. Warm reads of 300 archived days
fall from 0.56 to 0.38 ms; archive parsing was not the dominant measured cost. The profile scripts,
individual samples, baseline `70e6d5b`, machine and bundle hashes are retained. Exploratory results
(including probes overlapping other native validation) stay separate from this sequential campaign.
Yjs emitted its existing client-id reassignment warnings during controlled command preparation; no
unexpected content/result divergence occurred.

F-17 remains partial for very large/dense/deletion-heavy histories, fallback comparison, forks, browser
input-to-paint and supported-device capacity. The 100,000-item result is still perceptible latency.
This phase improves a measured path while preserving the guard; it does not establish a universal
responsive-history bound. Release validation must declare the workload/device envelope.
