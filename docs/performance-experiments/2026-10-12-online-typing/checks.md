# Checks and reproduction

Runtime is unchanged from signed `9ba0ae63`. This measurement-only slice does not rerun the
full application suite or resume release validation. The previous repair's tests are recorded
in the journal-flush-admission packet committed by that hash.

## Executed

- Source-mapped production-mode probe build with `VITE_ACCOUNT_LEDGER_PROFILE=1`: passed.
- One mismatched fixture setup: refused before measurement; retained separately, not retried
  under the same name or counted as a timing observation.
- Three matched fixture setups: passed authenticated convergence and saved both devices after lock.
- Three separate profiled online diagnostic sessions: passed.
- Sixteen unprofiled comparison sessions, serial, zero automatic retries: passed.
- Numeric completeness check: all 19 timing observations have 120 resolved visible-frame
  samples and successful undo/redo, convergence and cold replay. All online requests started
  during timing have HTTP 200 responses. The diagnostic samples are excluded from comparison tables.
- Scoped probe formatting/lint and `git diff --check`: recorded in the evidence archive.

The browser checks use real admitted input. The measured device types 120 keys, undoes and
redoes the final key, checks its complete text, compares both devices' complete Markdown
exports, locks, then cold-opens offline and checks that export again. Online runs additionally
check all ten peer characters. This is not a new exhaustive undo or fault campaign.

## Reproduction

Use installed dependencies from the retained lockfile and the source at `9ba0ae63` plus this
packet. `probe/build.config.ts` imports the tracked owned-verification, warm-ledger and
text-admission instrumentation; `typing.spec.ts` imports the tracked disposable runtime and
packaged-account authenticator helpers. No running personal server is used. Ports 53771,
53772 and 53774 must be free. Chromium/Node versions are in `environment.json`.

The scratch root is `/tmp/done-online-typing-20261012`. Private fixtures contain disposable
codes, virtual authenticators and browser/service state, so are intentionally not committed.
Their paths and hashes are in `source-identity.json`; retain them to rerun exact matched pairs.
The original matched pair is `/tmp/done-client-receive/fixture.json`. To construct the 12 KB
seed in a fresh scratch root, run the spec with `ONLINE_SEED=1`, `GOALS_CHARS=12000`,
`DONE_PAIR_FIXTURE` pointing to that original pair and `DONE_PERF_RESULTS` ending in
`seed-matched-12000`. Pass `DONE_PERF_SOURCE` as the checkout, `DONE_PERF_DIST` as the probe
bundle, and then use `probe/run.py seeds` to derive 3 KB and 64 KB. No timer is armed in seed mode.

```sh
VITE_ACCOUNT_LEDGER_PROFILE=1 node node_modules/vite/bin/vite.js build \
  --config docs/performance-experiments/2026-10-12-online-typing/probe/build.config.ts \
  --outDir /tmp/done-online-typing-20261012/dist

python3 docs/performance-experiments/2026-10-12-online-typing/probe/run.py diagnostics
python3 docs/performance-experiments/2026-10-12-online-typing/probe/run.py matrix
python3 docs/performance-experiments/2026-10-12-online-typing/probe/summarize.py \
  /tmp/done-online-typing-20261012
```

The retained runner refuses existing output/log names. Use a fresh root/names when repeating;
do not overwrite the evidence from this turn. It runs only one browser benchmark at a time,
stops on failure, and kills its disposable API/app/proxy processes afterward. CPU profiles
are enabled only in diagnostic mode. The original executed build/config/spec files are
also archived before formatting for source provenance.

Run `probe/profile.mjs` and `probe/attribute.mjs` with a diagnostic directory and bundle
directory to recreate source-mapped self/inclusive trees and long-task attribution. The latter
uses the captured CDP monotonic-clock mapping, retains its uncertainty, and clips sample
intervals to long-task bounds. Sampling and nested spans are not interchangeable with exclusive
CPU timing. Summary quantiles use floor(n*p); keys are not independent replications.
