# Reproduction

Run one browser experiment at a time, with installed pinned dependencies, Node and the same Chromium.
Do not use a real browser profile or real service directory. Raw saved fixture files contain disposable
private keys and lock codes and must remain outside the repository. A whole run, not a key, is the unit.

1. Create a clean `git archive` of packet `source.json`'s base in a scratch directory. Apply the recorded
   condition patch from that base; use the installed dependencies. The original baseline patch adds
   numeric instrumentation only. Build with `VITE_ACCOUNT_LEDGER_PROFILE=1`, the appropriate
   `VITE_ACCOUNT_BATCH` value (reference for baseline), full `APP_BUILD_REVISION` and `APP_BUILD_DATE`.
   The old baseline source predates this flag and keeps its original scheduling without it.
2. Set `DONE_PERF_ROOT`, `DONE_PERF_SOURCE` and `DONE_PERF_RESULTS` to explicit scratch paths. Run
   `node docs/performance-experiments/2026-10-11-account-batching/probe/campaign.mjs diagnostic`.
   It uses local app/service ports 53771/53772 and creates a disposable account, an uninterrupted
   2,320-edit history, a cold-open profile and a private `fixture-<results-name>.json` file under root.
3. For each fixed-history arm, copy that saved fixture's service-state directory to a fresh private
   directory and set the copy's `state` field in a fresh fixture JSON. Do not modify its browser storage
   or credentials. Keep the origin/ports identical; the service and browser snapshot must be paired.
   Set `DONE_REOPEN_FIXTURE` to that JSON, source/results to the desired arm, then run `campaign.mjs matched`.
   It cold-opens the retained history and profiles 300 additional keys. The recorded order is baseline,
   publication-1000, coordinated-1000, coordinated-2000, baseline-repeat. Each uses a fresh original copy.
4. Run the selected candidate's `diagnostic` with no fixture to measure its complete new-history growth,
   retained undo, compaction and cold-open costs, separate from the old-history comparison.
5. For paired application testing, set `REQUEST_SOURCE`, `REQUEST_DIST`, `REQUEST_OUTPUT`,
   `REQUEST_CONDITION=baseline` or `candidate`, and `REQUEST_DEVICES=2`. Run installed Playwright with
   `--config docs/performance-experiments/2026-10-11-account-batching/paired.config.ts`. Each run creates
   a new disposable two-device account on local ports 53221/53222. Run baseline then selected candidate.
6. `python3 probe/summarize.py <scratch-root>` reproduces `comparisons.json` from numeric raw captures.
   It also accepts this packet's gzip-compressed captures. CPU profiles already have their numeric
   aggregates in the summary; inspect the retained profile against the corresponding built/source maps
   for further sampling analysis. Stable DOM arrival uses the final crossing after any editor rollback,
   not just the native input's first appearance.

The measured candidate patch precedes the final default-selection patch and post-durability hidden-page
wake. Those later changes are covered by focused verification; the final source/asset hashes are recorded
separately. The comparison data must not be silently relabelled as a byte-identical final build run.

Fixtures, service SQLite databases, credential exports and browser screenshots are excluded from the
packet. The retained results contain synthetic key events, timings, counters, path/status/byte-size
request metadata, source patches and CPU profiles; no request bodies, headers or real writing.
