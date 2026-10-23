# Enrollment approval — attribution and a narrow fixture repair

Base: signed `2f1d0b0fd72e4879e96c2a0eeaf052918e3ceb54`. This phase selects a repeated-work target; it changes no production verifier.

The signed progress indicator is available at https://mbp.tail0e0d4.ts.net:8443, Version **2f1d0b0f**. `preview-receipt.json` records all 55 shell/worker/JS/CSS assets verified byte-for-byte over loopback and trusted HTTPS. The existing API process on port 53220, its identity and state were preserved; its configuration digest and the Tailscale route did not change. That older API uses the tested 404 single-read fallback. This preview update establishes presentation, not activation of the later API reuse optimization.

## Attribution

The prospective `protocol.md` specifies candidate selection, ownership slices, paired comparisons, limits and counterexamples. Two genuine additional-device journeys start from the same synthetic two-device fixture with 96 separately delivered Goals edits (100 accepted rows on the original source and one on the joined source). Diagnostic frontend timers and CPU profiles are separate from ordinary timings.

| Diagnostic span | Original approver | Joined approver |
| --- | ---: | ---: |
| Foreground operation | 9,837 ms | 9,744 ms |
| Accepted-source replay | 5,938.9 ms | 5,991.0 ms |
| Native source open | 32.5 ms | 37.2 ms |
| Local recovery | 177.5 ms | 182.7 ms |
| Snapshot construction | 2.5 ms | 2.3 ms |

The browser profiles are predominantly idle (8,612/8,472 ms of roughly 9,938/9,840 ms sampled windows). A separate API diagnostic records 117 authority verifications taking 6,216 ms summed inclusive elapsed time, 120 ledger censuses taking 636 ms, and 101 served-row checks taking 79 ms. These include overlapping/control requests and are **not additive removable time**. The API CPU profile independently shows repeated decoding/verification work. Together these select repeated historical-authority verification within the existing bounded read group, rather than the already-small local/factor paths.

## Narrow existing-fixture correction

Two replacement-handoff cases initially fail because their stale-authority fault route matches only `read-v2`, while the earlier signed client also uses `read-v2-batch`. Both failures reproduce on the unchanged signed reference implementation. The sole old test change appends `*` to that URL glob. Both pass on the reference after this repair. All existing assertions, including observing the injected refusal, exact saved retry, rotation, cold reopen and writing, remain; deadlines do not change. Preserve the initial candidate failures in phase 2 and the independent signed-reference failure/pass reports here. The first patched-reference invocation ran with the wrong working directory and failed before launching; its log is retained.

## Reproduction and evidence

Node 24.18.0, headless desktop Chromium with virtual authenticators, loopback ports 53221/53222, disposable service identities and synthetic writing. The saved probes/configurations are text; API/client instrumentation patches and compressed numeric profiles/results are retained. Recreate a private fixture before running a probe; raw service databases, keys, codes, storage snapshots and exported writing are deliberately excluded from Git. Profiles contain no invitation/document URLs. Hashes identify every retained artifact.

These observations do not diagnose a physical phone, WAN, screen lock, Firefox or the earlier missing account. General release qualification remains paused. Phase 2 owns implementation, independent invalidation controls and uninstrumented paired timing. No push, production rollout or API preview restart occurred.
