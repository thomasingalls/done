# Reproduce

Use pinned installed dependencies and one browser probe at a time. Work in disposable directories;
fixture JSON contains synthetic credentials, device-lock codes and browser storage and must remain
outside the repo. No real service or browser profile is used.

1. Archive parent `4bcac41928dae58a1795d4adb126595b898a56ca` into two scratch source directories,
   symlink installed `node_modules`, and apply `instrumentation.patch` to the baseline and
   `candidate.patch` to the candidate. Build each with `VITE_ACCOUNT_LEDGER_PROFILE=1`, explicit full
   `APP_BUILD_REVISION` and `APP_BUILD_DATE`. Use the existing Vite build and preserve source maps.
   The retained baseline build omitted explicit app-version metadata and displays `unknown`; the
   parent/patch hashes establish its source. This label difference does not select protocol behavior.
2. The deep fixture retained privately for these runs is the previous batching packet's 2,320-edit /
   295-position baseline fixture. To make another, use that packet's `probe/campaign.mjs diagnostic`
   with its original reference scheduling condition, then freeze its exported fixture and service
   directory. A regenerated history is a new instance, not the exact original measured bytes.
3. Set `DONE_PERF_ROOT` (scratch root), `DONE_PERF_SOURCE` (baseline source), and `DONE_PERF_RESULTS`
   (new output directory). `COLD_CREATE=1 ./node_modules/.bin/playwright test --config
   docs/performance-experiments/2026-10-11-account-cold-open/probe/cold.config.ts` creates a real pair,
   delivers 48 separate Goals bursts, and saves `receive-fixture.json` privately under root. Use
   `COLD_CREATE=fresh` to create the fresh Account fixture. These helpers use ports 53771/53772 and
   origin http://localhost:53771; do not run beside another probe using those ports.
4. For an open, set the same three variables plus `DONE_REOPEN_FIXTURE` to a saved fixture and run
   Playwright with that config. Each invocation copies the fixture service directory, restores its
   exact browser storage into a new context, restores its virtual passkey, installs the static app
   cache and reloads before turning the network off. It then unlocks, captures milestones/counters,
   collects heap, and creates a card. Do not reuse output directories containing a prior service copy.
5. `run-pairs.mjs <fixture> <name> <pairs>` alternates baseline/candidate order (AB, BA). Its root and
   source names are explicitly set at the top; adjust them if your scratch paths differ. Outputs are
   `<name>-<pair>-<arm>/opens.json`. The retained comparison uses five `deep` pairs, three `receiver`
   pairs and three `fresh` pairs. Per arm report the median/min/max over opens, not over operations.
6. `COLD_PROFILE=1` records one CPU profile. Aggregate it with the previous consumers packet's
   `probe/lib.mjs` `aggregate(profile, 1)`, using this candidate's source maps. CPU output fields
   inherited as `msPerKey` are per **one open**, not typing. Do not pool that run into primary timings.
7. `COLD_RECOVER=1` verifies that the first card survives lock/reopen. `COLD_ONLINE=1` keeps networking
   available. For an ordinary build without the profiling flag, `COLD_NO_DIAGNOSTICS=1` asserts no
   diagnostic global is exposed. The ordinary checks use their own source directory/build.

`cold.spec.ts` is the final probe, including three setup repairs described in the packet. Failed setup
logs precede those repairs and are not measurement samples. Static-cache installation is outside the
measured window; decryption/document/ledger caches are cold. The virtual authorization itself is inside
the window. First-edit timing is after forced heap collection and includes Playwright UI operations.
