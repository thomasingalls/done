# Device approval: attribution before repair

2026-10-16. Signed base `a18d5d1c` follows the separate empty-placeholder repairs and account-disappearance audit. These measurements use disposable accounts and the established Chromium virtual-passkey convention; no production data, phone or user browser profile is touched. This closes attribution only. Later phases own the implementation and matched comparison.

The original device's “Saving and checking this step…” spans durable human comparison, an authenticated replacement-writing snapshot, key delivery and verification of the candidate's installation/countersignature. In the additional-device path, `prepareNativeReplacement` calls `readHistorySource`, which replays accepted writing through its authenticated cuts using one signed one-position read per HTTP round trip. Local writing is separately captured and verified. Existing received writing does not by itself replace that independent accepted-prefix evidence.

| Disposable workload | Button operation | Both devices certified | Approver history reads | Sampled non-idle client CPU over the profiled continuation |
| --- | ---: | ---: | ---: | ---: |
| Fresh pair, then additional device | 2,854 ms | 4,718 ms | 5 | 1,084 ms |
| Same task shape after 24 separately synced Goals bursts | 6,330 ms | 8,634 ms | 29 | 1,143 ms |

Each history-read reply had an imposed 75 ms delay. These are two descriptive attribution runs on different newly created accounts, not paired timing estimates or a phone/WAN benchmark. CPU profiles cover a slightly wider interval than the button timer and include asynchronous waiting; inclusive stacks are not additive. The exact increase of 24 signed HTTP reads identifies a history-dependent round-trip mechanism. It is a plausible explanation for the reported real-account delay, not a diagnosis of that production run.

The prospective protocol defines workload, assignment/observation units, metrics, sampling/precision limits, validity threats and acceptance criteria. A later matched comparison must restore the exact same disposable service/browser snapshots in alternating order, preserve every verification and expiry, compare complete exported Markdown contents, verify two-way writing and reopen, and retain failures. Target: at least 20% primary reduction on the history case, with no consistent fresh-case regression.

No cryptography, local schema, authority check, production setting, preview bundle, protocol deadline or release qualification was changed by this phase. The unresolved Firefox account disappearance remains separate.
