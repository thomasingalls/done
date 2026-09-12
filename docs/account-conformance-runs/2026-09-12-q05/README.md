# Q-05 receive expiry observation and automatic recovery

Parent: unsigned `7cbb063`. [Contract and result](../../review/implementation/liveness-followups.md#q-05-result).
The four-stage outer campaign and nested 18-stage liveness campaign pass with unchanged source pins.
Commands, exact tested contract, runner, source/environment pins, generated results and native logs
are retained below. The complete unit suite passes 1,022 cases. No complete release aggregate is claimed.

Three consecutive native commit expiries leave the receive prefix unchanged and produce exactly three
closed `{operation: read-v2, phase: commit, code: expired}` observations. The receive status reports
`request-expired`, three failures and a future retry deadline. Clearing the clock offset permits
automatic recovery without a manual retry or online wake; five distinct requests are observed over
the interval. The reason/count clear and exact writing survives cold reopen.

Both scheduler forms have 80 generated expiry histories, covering capped backoff, pauses, Local wakes
and automatic recovery after 1–12 consecutive expiries. Another 100 histories cover the existing
32-entry diagnostic bound, closed fields and detached readback. No count-only halt was added.
Existing authoritative conflict, publication, signature, storage, owner and abort checks remain.
Q-03 cache-size controls and Q-02 batch, crash/retry, ordinary workload and growth cases pass again.

Reproduce with `node scripts/account-liveness/run.mjs` and the full-unit/scoped-format/lint commands
in the outer summary. The coverage stage now runs the receive scheduler and diagnostic properties.
The tested source state is the parent plus this Q-05 commit's source changes; the tested contract
is saved before completion prose was appended. Post-campaign documentation is not claimed as a
frozen input of the earlier campaign.

Only absolute workspace prefixes are normalized in these copies; gzip is lossless over normalized
bytes. `archive-files.json` preserves raw source hashes and local report paths. The personal Local
app, browser, profile, factors and relay were not used. Full workload/platform/claim qualification
and the immutable release-validation aggregate remain open.
