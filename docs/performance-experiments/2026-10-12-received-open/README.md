# Opening deep received history without repeated workspace copies

Signed base: `d1e5e5ea` (foreground audit responsiveness repair). This packet is a bounded cold-open
repair, unpublished. Release validation remains paused. The separate per-keystroke admission
change remains next; none of its proposed speedup is credited here.

## Result

Same synthetic 120-card workspace, 600+ received positions and later edits, 54,211 bytes of exported
Markdown. Fresh Chromium contexts, packaged service-worker application, offline unlock after warmup,
virtual passkeys. The prospective [protocol](./protocol.md) was written before runtime changes.

| Arm | First completed editor frame, median (range) | Polling observer, median (range) | Post-GC heap |
| --- | --- | --- | --- |
| Signed baseline | 7.054 s (6.959–7.246) | 7.422 s (7.342–7.608) | 17.43–17.44 MB |
| Coverage repair only | 2.969 s (2.882–3.097) | 3.330 s (3.262–3.433) | 17.36 MB |
| Also avoid outer receipt re-encoding | 2.725 s (2.654–3.011) | 3.089 s (3.035–3.364) | 17.37 MB |
| Final, including nested frame decoding | **2.622 s (2.502–2.909)** | **2.972 s (2.859–3.270)** | 17.37 MB |

Three unprofiled opens per arm. The final median is 62.8% shorter on the frame metric, exceeding the
prospective 25% improvement bar. **The 2.5-second product budget is still not met.** Neither the
near-boundary minimum nor the unchanged desktop fixture establishes phone performance or bounded
opening time at arbitrary history sizes. A final unchanged-baseline confirmation measured 7.135 s
(frame) / 7.509 s (observer), within 1.2% of the initial medians; the drift trigger was not crossed.

Every open reproduced the same complete archive digest
`c0263df4e70124412d913f42b98161cc87d1bcd261ee39acc5d96d7626b2d994`.
Each of the twelve timing observations also accepted a first edit and recovered it offline. Native
WebCrypto counts between unlock and ready were identical in all ordinary arms: 6,684 imports,
1,353 derives, 2,928 decrypts, 5,420 verifies and 6,171 digests. No signature/owner boundary was omitted.

## What changed

- Cold verification now holds one private content-coverage document for its whole receipt pass,
  disposing it in `finally`. Previously the no-memo cold path rebuilt it once per receipt. The two
  verification ownership boundaries remain separate.
- A conservative, pinned-Yjs positive proof checks that all struct ranges already exist, origin /
  right-origin / parent IDs resolve, origin splitting cannot damage a surrogate, and every deletion
  interval is already deleted. It accepts only canonical V1 framing and documents without pending
  state. This work follows the update and affected structs, not the whole workspace per receipt.
- Anything uncertain goes through the existing independent fork/apply/full-state comparison.
  Missing dependencies, pending structs/deletions, unusual framing and surrogate boundaries are
  not treated as covered. Clocks alone are insufficient. `VITE_ACCOUNT_DIRECT_COVERAGE=0` disables
  the direct proof; the standalone reference and periodic independent audit always keep it off.
- Stored receipt/request/page decoders validate all the same fields, limits, canonical JSON and
  hex without serializing the decoded bytes straight back into hex and JSON. Wire and storage
  formats, signatures and original-receipt verification remain unchanged.

The baseline CPU profile attributes about 2,931 ms inclusive to coverage checks and 1,289 ms to
coverage document construction (separate work); hex/unhex have 642/404 ms sampled self time. The
final isolated profile has about 37 ms inclusive coverage-check time. Hex/unhex still cost about
371/373 ms self time; native signature verification, redundant ownership-boundary parsing and other
startup work remain. Inclusive numbers overlap other ancestors and must not be summed indiscriminately.

## Correctness and scope

Seventy-two focused unit tests pass. Independent fork/apply comparisons cover 120 generated
mixed-type/GC/out-of-order histories; existing append/compaction histories now exercise the direct
mode too. Directed cases include same-ID updates with missing dependencies, surrogate-splitting
origins, duplicate delete-set client sections, missing content, pending state and disposal.
Nine hundred mutated request/page/record frames also retain the original encode-after-decode check.

Six native cases pass, covering actual receipt/content persistence, expired cold replay, missing
content/event/ciphertext, audit disagreement and serialized verification. The relevant coverage
fault-control anchor follows the new verification-local checker. One older combined contract test
initially failed *before* coverage: its ordering mutation expected to bypass verification, but the
existing attempt-by-attempt replay now also requires the active envelope to exist. `deliveryRecord.ts`
was unchanged in this repair. The expectation now records this second refusal boundary; omitting
coverage still admits the prohibited missing-content history. That focused contract test passes.

One existing packaged two-device journey also passes: 600 positions, both-way later edits, complete
matching exports and offline replay. Observed catch-up was 109.017 s with 75 ms added request delay,
largest catch-up task 77 ms and final offline frame 2.517 s. Treat this as a functional regression
check: a short unit/contract check overlapped it, so it is **not** a clean throughput comparison.

Type checking, packaged build, initial bundle/origin checks, pinned-Yjs checks and targeted lint/format
pass. No generalized conformance run, mutation campaign, release qualification, deployment or user-data
migration was run. No receipt format or rollback policy changed. Local ledger retention, pending-heavy
coverage costs and fork-free typing remain open.

## Evidence and reproduction

`probe/cold.spec.ts` is adapted from the retained cold-open harness. Set `DONE_PERF_SOURCE`,
`DONE_PERF_DIST`, `DONE_PERF_ROOT`, `DONE_PERF_RESULTS`, `DONE_REOPEN_FIXTURE`; use
`COLD_REPEATS=3 COLD_RECOVER=1 COLD_NO_DIAGNOSTICS=1`. `EXPECT_ARCHIVE` enforces the digest above.
Run `node node_modules/@playwright/test/cli.js test --config docs/performance-experiments/2026-10-12-received-open/probe/cold.config.ts`.
Use one worker on private ports 53771/53772/53774, with no competing campaigns. `COLD_PROFILE=1`
is a separate one-open profile. `probe/profile.mjs <run-dir> <bundle-dir>` maps CPU samples.

The first `final-profile` overlapped unit tests and is retained as confounded; attribution uses its
isolated repeat. Ordinary timing runs had no overlapping test campaign. Gzipped samples/profiles/logs
are retained here; `identity/` records the signed base, exact patch, code/test hashes, external bundle
and fixture hashes. Credential-bearing fixtures and service state are not included. Earlier bundles
and their source maps retain intermediate identities. `probe/retain.mjs` reproduces the evidence
selection and content redaction; `manifest.json` hashes the packet except itself. Node 26.11.1 and
desktop Playwright Chromium were used, not production Node 24 or a phone.
