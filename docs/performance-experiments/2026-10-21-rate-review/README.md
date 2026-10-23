# Rate and capacity review after cold verification — phase08

The cold repair now lets the original contention workload complete. Both refill levels impose measurable policy delay, but the conservative session-only candidate misses the predeclared native fairness and pressure-typing gates. Keep configured application16/session64/process unchanged. This is evidence-only sequential patch08 after immutable01→07, cumulative tree aadfbab35081da1daea12c72438a834db429c405. No staging/signing/commit/push/preview8443 change/merge/deployment; generalized qualification stays paused.

## Fixed contract and sources

Protocol.md was recorded before measurement. Same patched service/current crypto, exact110-asset patch02 client, encrypted synthetic fixtures, default proof/receipt/native transaction/custody/grant/expiry/queue/guard checks. Temporary variants alter only requestBudget.ts refill literals: D16/64, S32/64 (primary), P16/128, B32/128 (process/interaction diagnostics). Burst120/480, active4/session16/process, session-map1024, invalid-bearer bucket, exact work accounting/refunds, inner limit1/batch<=4, all byte/deadline/retry/resource bounds remain. All17 unchanged budget/accounting cases pass under each policy; all old tests/source classifications/obligations remain. Effective values and803-file arm hashes are independently checked before interpretation. No production config switch is added.

## Native cold factorial and fairness

Fixed restored eight-process plan D,S,P,B then B,P,S,D. Each:1024 hot seed rows, six real scoped sessions×256 original positions, hot500ms writes, independent other-account1000ms writes and250ms reads. No warmup. Existing4291000/2000ms retries,409 abort,120s replay/10s HTTP/1GiB RSS caps. Every offered write and replay proof verifies independently. All8 complete; separate asymmetric single-reader1024-position D/S pair also completes68.654/31.686s (53.85% shorter). Each complete fresh process is an analysis unit; correlated requests/sessions are not independent replications. Duration-dependent background counts are reported.

| Arm session/process | Replay ms in both blocks |429s | Median CPU ms | Median sampled RSS MB |
|---|---|---|---:|---:|
| D | 20141,20745 | 96,91 | 8803.0 | 369.1 |
| S | 20881,20416 | 99,98 | 8460.1 | 372.8 |
| P | 11408,11093 | 26,31 | 8146.2 | 381.2 |
| B | 9845,10142 | 24,30 | 7782.6 | 387.3 |

S leaves the six-session replay near20–21s at the64/process ceiling. P brings it near11s; B near10s. Every original wire/link/signature passes independent read-only cold SQL/OpenSSL audit in all10 stores, with no stored unacknowledged writes. Actual completed-throughput rows include initial burst allowance and are not a sustained saturation maximum. CPU/useful-unit normalizes a changing mix of replay/read/write operations; it is descriptive, not a cost model or container size.

S fails the prospective relative native fairness gate: median per-run hot offered-to-proof p95 182→315.5ms; unrelated peer offered-to-proof p95 607→1133.5ms. Other-writer p95 48.5→57ms remains within the guard. All absolute2.5s interaction/resource ceilings pass. Small per-run quantile samples and1s retry steps are retained; a missed guard is not excused or rerun into a pass. The P/B diagnostics pass the local native review gates, but neither is selected as a qualified global policy.

## Actual unchanged client

Ten restored Chromium journeys: three primary D/S catch-up pairs (D,S;S,D;D,S), one foreground D/S pair, one duplicate-reader-pressure D/S pair. Fixed121 cards/13,000-character Goals/600 missing accepted updates,120 independently scheduled keystrokes150ms, receiver sentinel, whole exports, both-way writing, Undo/Redo and locked offline document reopen. Full results, raw DOM length observations and independent reconstruction remain. Every original deadline/data assertion stays.

| Pair | D catch-up ms | S catch-up ms | Improvement % | Local typing guard | Peer typing guard |
|---|---:|---:|---:|---|---|
| 1 | 33754 | 23136 | 31.46 | True | True |
| 2 | 33776 | 23104 | 31.6 | True | True |
| 3 | 33778 | 23164 | 31.42 | True | True |

Median primary improvement: 31.46%. Repeated D-reference drift: 0.07%. Typing guards across primary/foreground/pressure: False. Every full data/edit/offline guard passes in all10 journeys. Pressure local p95 is12.0→17.8ms against a16ms ceiling; this is a failed gate even though catch-up improves134.359→29.156s. Exact per-mode results and gate booleans live in browser-summary.json; DOM metrics are independently rederived in analysis.json rather than inferred from HTTP200. No higher-latency arm, physical Firefox/Android, full independent browser installations, general authority histories or production-client adoption is measured here. Prior +75ms study remains a limit on generalization.

## Decision and next boundary

{
  "candidate": "32/session64/process",
  "checks": {
    "meaningfulPrimaryBrowserImprovement": true,
    "primaryReferenceDrift": true,
    "allBrowserTypingGuards": false,
    "allTenClientDataGuards": true,
    "nativeSReviewGate": false,
    "asymmetricCompleteAndWithinAbsoluteBounds": true
  },
  "allAdoptionReviewGatesPassed": false,
  "failedChecks": [
    "allBrowserTypingGuards",
    "nativeSReviewGate"
  ],
  "configuredApplicationPolicyRemains": {
    "sessionPerSecond": 16,
    "processPerSecond": 64
  },
  "global128VariantsDiagnosticOnly": true,
  "safeProductionCapacityEstablished": false,
  "scope": "Prospective local decision gates; no p-values, supported-device/container capacity or runtime configuration adoption. Guard misses remain misses, not favorable reruns."
}

Keep16/64 configured. The32/64 candidate cannot advance under these criteria even when ordinary catch-up improves. Global128 evidence identifies shared-budget pressure in this fixed workload, not a safe production rate. Next isolate the pressure local-typing cost while reviewing coupled32/128 on actual client and distinct cold publishers under an identified containerCPU/memory limit. Preserve every current admission/security check. A higher global budget may address fairness; it does not establish a typing fix. No production setting is inferred from idle M1 CPU.

## Evidence, reproduction and artifact limits

Identity.json pins four source maps (803 files each), unchanged test closures, exact client110 assets, browser executablePath API, prior private fixtures and probes. Runtime defaults in the cumulative checkout and every pre-existing test/obligation/construction/classification stay byte-exact. Every881 obligation/337 unresolved and97 construction statuses remain; no aggregate execution/closure credit is created. Existing other-seat progress and deferred formatting remain.

SHA256SUMS pins all packet bytes except itself; artifact-provenance.json records raw/gzip identities. Source snapshots/scripts are .txt; numeric JSON/logs use deterministic gzip. Explicit whitelist excludes databases, fixture JSON/private keys/tokens/codes/browser storage and dependency trees; known-value scan35 exact private strings is not a general secret detector. Private fixtures are required for full load replay and remain outside Git. All receipts/source variants/gate misses remain; no successful-only denominator.

The outer native launcher and first nested native subprocess initially shared a stdout filename. Parent output can overwrite initial stdout bytes. The emitted file and native-stdio-note.md are retained. Independent per-run result JSON, native-runner receipts, server logs and proof audits are complete; no metric or outcome is taken from the collided stdout. Benchmark execution is unaffected.

To reproduce, apply frozen01→08 in sequence with --whitespace=nowarn, reconstruct source-D at patch07 and apply only the exact two temporary refill edits for S/P/B. Use Node24 and pinned dependencies/fixtures/client. Run preflight.py, run-native.py, wait for all child terminal completion, then run-browser.py in the recipe's source directory. Wait again before analysis/validators. Reconstruct all DOM percentiles and original native proofs; keep rejected or censored arms. General qualification, container/platform capacity and publication are separate operations.
