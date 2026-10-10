# Packaged two-device failures: independent reproduction

2026-10-10 and 2026-10-11. An independent reproduction of the intermittent packaged history failures
that held default activation of `VITE_ACCOUNT_LEDGER=incremental`, with two causal diagnostics and a
check of the enrollment repair in `95923cd8`. Release validation remains paused. Nothing here is a
budget run, a passing verification or a deployment.

## Provenance: what this packet is and is not

**Every number in this packet was produced by delegated agents of the Claude review session, in
scratch checkouts on private ports.** None was measured in the `c030` worktree, and none is taken
from or pooled with these packets, which the implementing session produced there:

| Packet | Who ran it | What it measured |
| --- | --- | --- |
| [2026-10-10-account-consumers](../2026-10-10-account-consumers/README.md) | implementing session, `c030` worktree, default ports | single packaged runs per build (`packaged-*.log`): the original failures and passes |
| [2026-10-10-account-browser-failures](../2026-10-10-account-browser-failures/README.md) | implementing session, `c030` worktree | two natural passing runs with scheduler snapshots, a forced six-failure back-off control, a deterministic injected two-refusal enrollment test, before and after `95923cd8` |
| this packet | review session's agents, scratch checkouts from `git archive`, ports 53781/53782 | failure rates over 37 runs across five builds, the ordering of two service requests in every pairing, 429 counts by path, two causal diagnostics, and the natural rate after `95923cd8` |

Where this packet and those agree on a mechanism, that is two separate observations of it. Where a
figure appears here, it comes from the tables in `tables/`, which the scripts in `scripts/` derive from
the per-run logs listed in [logs-manifest.json](./logs-manifest.json).

Two read-only analyses ran beside the measurement and are kept here because their findings are not
recorded elsewhere: [forensics.md](./forensics.md), from the retained logs and committed code, and
[code-review.md](./code-review.md), an independent review of `343c4bce..0332a9ea`. Neither ran anything.

## Findings

1. **The switch does not cause the enrollment failure.** At `0332a9ea` it failed 24 of 50 pairings,
   on the ordinary build as well as the incremental one. At `4500d9b6` it failed 0 of 12.
2. **One ordering separates all 62 pairings of the main campaign.** A pairing fails exactly when the
   joining device's `ceremony/transfer install` reaches the service before the approving device's
   second `ceremony/transfer deliver`.
3. **`95923cd8` removes the failure without removing the race.** The race was still lost in 6 of 12
   pairings; all 6 recovered, and 0 of 12 pairings failed.
4. **The post-maintenance delivery deadline was never missed** in 21 budget-limited observations, but
   came within 33 ms of it once.
5. **The service's shared request budget is exhausted in every two-device journey on every build.**
   With the budgets lifted, delivery time became constant.

## Builds

Scratch checkouts from `git archive <commit>`, `node_modules` symlinked read-only from the complete
install in the `c030` worktree, built with `APP_BUILD_REVISION=<commit> APP_BUILD_DATE=2026-10-10` and
`vite build`. [builds.json](./builds.json) records each build's commit, environment, a digest over
every file in `dist/`, and the hashes of its entry files.

| Arm | Commit | Ledger path | `dist` digest (first 16) |
| --- | --- | --- | --- |
| A | `0332a9ea67aeaf9dce4248128e4833fb116a1b78` | reference (ordinary build) | `d80c477dc5066d9c` |
| B | `0332a9ea67aeaf9dce4248128e4833fb116a1b78` | `VITE_ACCOUNT_LEDGER=incremental` | `d31d395eca2d0845` |
| C | `4500d9b61b7c67b0d2abcabfc7f377ab449e23d6` | `VITE_ACCOUNT_LEDGER=incremental` | `a215d30ce2545fde` |
| E | `95923cd871617ab70cfe4ae2fa8a51b488fed5f9` | reference (ordinary build) | `772d95ea749d8fd3` |
| F | `95923cd871617ab70cfe4ae2fa8a51b488fed5f9` | `VITE_ACCOUNT_LEDGER=incremental` | `3b804d4185d4c9a3` |

Each scratch checkout carries an instrumentation patch, and only that:

| Patch | SHA-256 | Used by |
| --- | --- | --- |
| `instrumentation.patch` | `cc137cc577276ce02ed5521593d8a6ec5c869b6b39ee17e4cebb2182abbb1de4` | runs 01–06 |
| `instrumentation-v2.patch` | `3dc2b31469119e89a487512bf1137c54b042fe94d0762d1045ab11682ecc4508` | runs 07–32 |
| `instrumentation-95923cd8.patch` | `39a25a147f893d779c22f8f3a23903e678a1cb634319c8fe093b3667cb748a56` | runs 33–38 |

The probe adds an environment-guarded numeric request log on the service (`DONE_FLAKE_LOG`), step
timings and phase marks on the test's standard output, private ports (`DONE_FLAKE_PORT`,
`DONE_FLAKE_SERVICE_PORT`), and two diagnostic switches: `DONE_FLAKE_UNLIMITED=1` holds all four
service request budgets full, and `DONE_FLAKE_DELIVERY_TIMEOUT` with `DONE_FLAKE_TEST_TIMEOUT` extends
the post-maintenance delivery assertions. The first patch lacks aborted-submit times, pairing 4xx
attribution and refusal bodies; those exist from run 07 on. The `95923cd8` patch is the second
adapted by hand to the repaired history test, with every assertion timeout identical to the commit,
the delivery-deadline override removed, and one added step timing around the final snapshot-save
assertion.

## Run conditions

Node 26.11.1, Vite 8.1.5, Playwright 1.62.0 with headless Chromium 151.0.7922.34, macOS 26.5.1 on an
Apple M1 Pro with other applications running. Load average was 3–9 during the main campaign and
3.5–5.8 during the follow-up. Each run starts a fresh service with disposable state and executes

```sh
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts \
  test/packaged-account/history.spec.ts --grep 'two native device owners|returning editor'
```

so one run is two journeys and two pairings. Run counts were fixed before each phase and no run was
repeated for a better result. [runs.jsonl](./runs.jsonl) has one line per run: arm, environment, start
time, duration, exit status, load at start and end, and the fraction of 5-second samples in which
another session's packaged service was listening on 53221/53222.

- **Main campaign**, 31 valid runs, 46.6 minutes: one smoke run of A, then A and B interleaved
  (A B B A A B B A A B B A), then six runs each of D1 (B, budgets lifted), D2 (B, delivery assertion
  at 120 s) and C, not interleaved.
- **Follow-up**, 6 runs, 9.6 minutes: E and F alternating, three each.
- The other session was running packaged tests when the campaign began. Its service was listening
  during 65% of the smoke run's samples and during none of any other run's, so only the smoke run is
  confounded. Foreign browser processes without those ports would not show in that sample.
- `02-ABORTED-harness-relaunch` was stopped 15 seconds in to relaunch the campaign detached. It is
  kept and is not a result.

## Results

### Main campaign: `0332a9ea` and `4500d9b6`

| Group | Build and condition | Runs passing both journeys | Pairings failed | Delivery step reached / over 15 s | Delivery arrival | 429s in the two-device journey |
| --- | --- | --- | --- | --- | --- | --- |
| A | `0332a9ea` ordinary, including the smoke run | 3 / 7 | 4 / 14 | 5 / 0 | 8.9–15.0 s | 31–40 |
| B | `0332a9ea` incremental | 1 / 6 | 6 / 12 | 2 / 0 | 10.9, 13.0 s | 39 |
| D1 | B with all request budgets lifted | 1 / 6 | 8 / 12 | 3 / 0 | 7.89, 7.89, 7.94 s | 0 |
| D2 | B with the delivery assertion at 120 s | 1 / 6 | 6 / 12 | 2 / 0 | 12.5, 13.0 s | 44–45 |
| C | `4500d9b6` incremental | 5 / 6 | 0 / 12 | 6 / 0 | 9.5–13.0 s | 30–34 |

**Enrollment.** The approving device shows "Account authorization refused: authority-changed" in
state `approved` while the joining device is certified, and the 30-second certification assertion
then fails.

- In every failed pairing the joining device's `install` reached the service 47–81 ms before the
  approving device's second `deliver`, which received 409
  `{"kind":"authorization-refused","refusal":"authority-changed"}`. That device sent nothing more.
- In every passing pairing at `0332a9ea` the `deliver` arrived 3–15 ms before the `install`. In every
  pairing at `4500d9b6` it arrived 32–92 ms before.
- Rates with 95% exact intervals: all `0332a9ea` 24/50 (34–63%); ordinary 4/14 (8–58%); incremental
  across B, D1 and D2 20/36 (38–72%); `4500d9b6` 0/12 (0–26%).
- Fisher's exact test: all `0332a9ea` against `4500d9b6`, p = 0.002. Ordinary against incremental
  within `0332a9ea`, p = 0.12, which does not distinguish them.
- D1 had no 429s and 8 of 12 failed pairings, so the request budget is not the cause.

**Post-maintenance delivery.** In the 15 instrumented runs that reached it, the first device had
exactly four aborted submits, at +0, +1.2–1.4, +3.2–3.5 and +7.3–7.5 s after the first, and its next
attempt came at +15.3–15.6 s. The test removed its fault at +7.9–9.4 s, so the first accepted submit
came 5.9–7.5 s later. From accepted submit to arrival took a further 3.3–8.5 s with 6–17 capacity
refusals in that window. With the budgets lifted that second part was 1.3–1.4 s and arrival
7.89–7.94 s. The closest approach to the 15-second assertion was 14.967 s, on the ordinary build.
With the assertion at 120 s, both runs that reached the step still arrived inside 15 s, so no late
arrival was observed.

**Request budget.** All 837 capacity refusals came from the scoped handler's token budget and none
from its concurrency cap. The first came 25.5–29.7 s into the two-device journey in every
budget-limited run.

**One further failure.** A run of C timed out at the final "Verified snapshot 2 is saved." assertion,
with 14 capacity refusals on `history/v1/checkpoint` and `delivery/read-v2` in that 12.4-second window.

### Follow-up: `95923cd8`

All six runs passed both journeys.

- **Pairings failed: 0 of 12** (95% exact 0–26%), against 24 of 50 before; Fisher p = 0.002.
- **The race is unchanged.** The `install` arrived first in 6 of 12 pairings, by 47–85 ms: 2 of 6 on
  the ordinary build and 4 of 6 on the incremental one. In the other six the `deliver` was first by
  4–6 ms.
- **Every refused pairing recovered: 6 of 6**, against 0 of 24 before (Fisher p = 2×10⁻⁶). Six
  recoveries leave a 95% upper bound of 46% on a refused pairing still failing.
- **Recovery is not visible.** The approving device showed "certified" 254–700 ms after the refused
  `deliver`. Approval to certified was 787–1,300 ms for refused pairings and 1,287–1,298 ms for the
  rest.

| Run | Build | Delivery arrival | Final snapshot-save | 429s (two-device) | Tokens left at fault removal | Fault removal to first-device submit | Submit to arrival |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 33 | ordinary | 12.5 s | pass, 5.4 s | 42 | 2.9 | 4.7 s | 8.6 s |
| 34 | incremental | 8.9 s | pass, 8.4 s | 40 | 2.0 | 6.7 s | 4.1 s |
| 35 | ordinary | 8.9 s | pass, 5.4 s | 36 | 7.0 | 0.7 s | 9.1 s |
| 36 | incremental | 6.9 s | pass, 6.4 s | 41 | 6.2 | 0.7 s | 7.1 s |
| 37 | ordinary | 7.9 s | pass, 5.4 s | 40 | 7.6 | 0.7 s | 8.1 s |
| 38 | incremental | 8.9 s | pass, 4.4 s | 41 | 2.8 | 4.7 s | 5.1 s |

Delivery now arrives in 6.9–12.5 s. The repaired test's `online` event lets the first device submit
in 0.7 s when 6–8 tokens remain; with 2–3 remaining its submit is refused and accepted 4.7–6.7 s
later. The first 429 came at 23.4–24.7 s. By path over the six two-device journeys the refusals were
`delivery/read-v2` 118, `history/v1/checkpoint` 69, `membership/v2/discover` 40, `delivery/submit` 10
and `grant/v1/begin` 3.

## What is measured and what is inferred

Measured: the rates, the request ordering in every pairing, the retry schedule, the 429 counts and
sources, the effect of lifting the budgets, and recovery after `95923cd8`.

Inferred:

- That the consumers slice moved the enrollment race by roughly 60–70 ms on both builds. C ran last,
  so machine drift is not excluded, though the margins are tightly clustered.
- That the line-153 delivery failures retained in the consumers packet are the same two delays
  summing past 15 s. No run here failed at that assertion.
- That the budget-driven snapshot failure can recur, since every budget-limited journey runs on an
  empty budget from about 24 s in. It occurred once in 21 such journeys.

Unexplained:

- Why the race margins are bimodal, about +5 ms or about −65 ms, and which change moved them.
- What triggers the approving device's successful retry 192–271 ms after the refusal, faster than the
  commit's 2.5-second timer. The measuring agent did not read the client code.
- Whether the incremental build loses the race more often than the ordinary one: 20/36 against 4/14
  in the main campaign (p = 0.12), and 4 of 6 against 2 of 6 in the follow-up.

## Files

| File | Contents |
| --- | --- |
| [builds.json](./builds.json) | Commit, build environment, `dist` digest and entry-file hashes per arm |
| [runs.jsonl](./runs.jsonl) | Conditions and exit status of all 38 runs, including the aborted one |
| `tables/summary.json` | Per-run step timings, 429 counts and failure signatures, main campaign |
| `tables/pairing-race.json` | The `install`/`deliver` ordering and outcome of all 62 main-campaign pairings |
| `tables/delivery-decomp.json` | Retry schedule and delivery decomposition per instrumented run |
| `tables/stats.json` | Rates and exact intervals per group |
| `tables/followup.json` | Pairings, recovery times, delivery and budget figures for `95923cd8` |
| `instrumentation*.patch` | The three instrumentation patches |
| `scripts/` | `run-one.sh`, the three phase scripts and the analysis scripts that produce `tables/` |
| `phase1.log`, `phase2.log`, `phase3.log` | Campaign driver output |
| [logs-manifest.json](./logs-manifest.json) | Path, size and SHA-256 of all 189 per-run log files, and of one archive of them |
| [forensics.md](./forensics.md), [code-review.md](./code-review.md) | The two read-only analyses |

**The per-run logs are not in this packet.** They are 4.2 MB in 189 files (`run.log`,
`service.jsonl`, `sampler.jsonl`, `meta.json`, `results.json` per run), archived as
`results-logs.tar.gz` (463,528 bytes, SHA-256
`6c0eaa12348952b08c57f35d7d71219533c77cfff5da88aab8a70fed492444b8`). The manifest records where
they were when this packet was written: the review session's scratch directory under `/private/tmp`,
which is not durable. The failed runs' Playwright artifacts (about 21 MB) include disposable service
state and test credentials; they are neither archived nor hashed.

## Reproduction

Make a scratch checkout of each commit with `git archive`, symlink installed dependencies, apply the
matching patch, and build as above. Then, from a directory holding `scripts/` and the arm directories:

```sh
scripts/run-one.sh A some-label                         # one run of an arm
scripts/run-one.sh B some-label DONE_FLAKE_UNLIMITED=1  # the budget diagnostic
scripts/phase1.sh; scripts/phase2.sh B; scripts/phase3.sh
python3 scripts/analyze.py && python3 scripts/pairing-race.py && python3 scripts/delivery-decomp.py \
  && python3 scripts/stats.py && python3 scripts/followup.py
```

The analysis scripts read `results/` beside `scripts/` and write their tables into that same parent
directory; in this packet those outputs are filed under `tables/`. `run-one.sh` refuses to start if its ports are busy, waits up to three minutes for another session's
packaged service to stop listening, and keeps the artifacts of failed runs. Ports 53781/53782 must be
free. It must never be pointed at real service state. D1 and D2 are causal probes; a pass under either
is not a verification result.
