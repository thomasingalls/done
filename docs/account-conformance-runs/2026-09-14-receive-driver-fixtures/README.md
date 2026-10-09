# Receive-driver polling/reconnect fixtures — bounded runner evidence

All four files / seventeen cases pass in the final owned run in **424.417 seconds**. Every worker
and browser group drains. Product source, selected tests and helpers are unchanged. Assertions,
populations and per-case limits are unchanged. The native file's 120-second outer bound, set before
four R-01 cases were added, timed out after seven passes. Both adapter and wrapper now allow
180 seconds. The initial failure, partial report and signed history are retained.

- Scheduler controls: 5 cases, virtual clock and copied current/mutated scheduler, no browser; 90 seconds.
- Generated: 10 browser histories in 1 case, seed 9112052, endOnFailure:true; 240-second test and
  270-second file bound. Five-to-seven-action histories require all six action types and compare
  writing, durable progress and source count, including reopen cursor.
- Native dispatch controls: 2 cases, instrumented baseline versus bypass at offline/pressure boundary;
  90 seconds. Baseline dispatches zero times; bypass dispatches once.
- Native: 9 cases, real service polling plus controlled failure/retry/cold-reopen scenarios; 180 seconds.
- All 92 pure runner checks, direct TypeScript, scoped style, snapshots, authority and signatures pass.
  Unchanged Node owner/Vitest-process/native controls (23/5/12) retain pinned earlier evidence.

Read [summary.json](./summary.json) for timing, input identity, artifact hashes and scope;
[final-gates.json](./final-gates.json) and [preservation.json](./preservation.json) record checks.
Compressed artifacts retain complete top-level stage receipts/logs/case reports, browser identity,
exact patch, initial failed receipts and partial report, bound provenance, prior contracts, source/helper
pins and signature verification. Machine paths are
normalized with raw and normalized hashes retained; binary files are hashed base64 values. Full raw
source/dependency inputs remain at the local run path recorded in the summary.

The preceding transport service phase is signed `b0e7828`, exactly matching the recorded `6abb609`
staged tree, and receive transport is signed `fa80a53`. Historical receipts and status-at-capture
bytes remain unchanged. This phase runs with `fa80a53` as its base and remains uncommitted.

General selections now contain 174 files / 1,444 cases; all 170 prior contracts / 1,427 identities
are unchanged. There are 243 unresolved obligations. Simulated navigator signals and signed fixture
pages do not establish real network loss or generated service delivery; same-context page reopen does
not establish browser crash, power-loss or second-device behavior. Whole-wrapper order/prerequisites,
optional JSON outputs and immutable aggregate qualification remain separate. The ledger phase's
initial expected-positive owner orphan classification is still unresolved. Personal profiles/servers,
package build, prior vectors, historical evidence and L-2 remain unchanged.

Next: five Account sync/composition fixtures, including historical-source and ownership review.
