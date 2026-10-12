# Bounded receive prefetch, unchanged receipts

**2026-10-12.** Working tree on signed `54811c93`, which commits the preceding receipt-grouping
repair. This phase is implemented and measured locally; it is not committed or published.
Release validation remains paused and `docs/progress.md` is unchanged.

The delayed 600-position catch-up takes **100.978 seconds versus 194.602 seconds** for a fresh
grouped baseline: 48.1% less elapsed time, about 1.93× the throughput. Local-server catch-up takes
**68.961 seconds versus the previous grouped observation's 79.125 seconds** (12.8% less; no fresh
local baseline in this phase). These are individual desktop engineering observations, not phone
measurements or estimates for the public service.

## Change and limits

The receive owner still prepares at most four exact, independently signed limit-one requests
through an already authenticated observed tip. A private collector now starts at most two reads
at a time, outside the editor/storage queue. The four-page publisher turn, one `receiveNext`
flight, exact binding, per-entry verification, commit-time expiry/authority/prefix checks and
atomic native witness transition remain. Self reconciliation remains a single request.

Replies may finish out of order; collection and verification use cursor order. A missing first
reply advances nothing. A missing middle reply can commit only its verified prefix. An incorrectly
bound later reply refuses the entire collected group. A terminal/malformed hint can only shorten
collection; it cannot grant authority. Unwanted tails are aborted, awaited and erased. Closing
the workspace drains all launched reads before the held operation settles, erases late buffers,
and prevents publication. Diagnostics are emitted for the attempted prefix, not speculative tails.

The collector reserves space **before** each launch. Its per-page cap is 1,057,280 bytes:
`2 × (512 KiB envelope + 4 KiB proof) + 512 bytes framing`. A focused maximum-frame check covers
the maximum safe integer cursors, digest, signature and existing supported envelope/proof sizes.
Retained pages plus outstanding full-page reservations and 4-byte queue framing must fit **4 MiB**.
A group that cannot reserve another full page returns its prefix; later work fetches the tail.
This lowers the HTTP ceiling for unsupported oversized pages; it does not lower the receiver's
existing supported 512 KiB envelope profile. HTTP stream assembly and canonical parsing have
additional bounded temporary copies; 4 MiB is not a whole-heap limit.

The launch window remains **250 ms**. Already launched reads can finish afterward; this is not a
250 ms operation deadline. Each HTTP read retains its ten-second timeout. Following a cut or
failure the collector cancels/drains speculation. Input remains available during network waits,
and due sending gets a turn between bounded receive groups. Two reads leave capacity within the
service's four-request session concurrency allowance. Retry/back-off policy is unchanged.

There is **no service API, receipt, database, reader-fence or migration change**. Original v1
receipts remain separate. Existing native group limits may retain fewer than the fetched replies;
a fitting tail is fetched again on a later operation. The common group storage path still passes
cold replay in the signed pre-group reference reader.

## Matched observations

See [prospective protocol](./protocol.md). All three restored journeys use the same hashed
synthetic fixture (120 cards, 12 KB Goals, 600 pending positions), ordinary bundles, one browser
worker, private ports and no concurrent build/test work. The fixture's selected day is October 11.
It includes 120 writer keys during catch-up, a receiver edit during catch-up, twelve subsequent
live bursts, 120 receiver keys, whole Markdown export equality and offline cold opening.

| Observation | Fresh grouped, +75 ms | Prefetch, +75 ms | Prefetch, local |
| --- | ---: | ---: | ---: |
| Original backlog catch-up | 194.602 s | 100.978 s | 68.961 s |
| Peer reads through the catch-up observation | 600 | 604 | 600 |
| Repeated peer cursors | 0 | 0 | 0 |
| Own-stream checks | 34 | 18 | 13 |
| Receiver's first submit starts | 2.155 s | 2.066 s | 1.621 s |
| Writer submit-response interval, median | 2.313 s | 2.276 s | 2.270 s |
| Subsequent live burst delay, median | 2.361 s | 2.352 s | 2.338 s |
| Subsequent live burst delay, maximum | 2.866 s | 2.863 s | 2.385 s |
| Offline cold open | 6.905 s | 6.804 s | 6.907 s |
| Catch-up long tasks ≥50 ms | 1 | 1 | 0 |
| Largest catch-up long task | 1.138 s | 1.238 s | — |
| Post-cold-open collected heap | 19,628,132 B | 19,922,172 B | 19,890,372 B |
| Equal export bytes | 54,211 | 54,211 | 54,211 |

The candidate's delayed read cursors are 7–610, versus 7–606 for the baseline: it has already
requested four entries from the concurrent writer when the original backlog becomes visible.
The additional reads are not duplicates. The delayed baseline is within 0.8% of the previous
193.074-second result, so the prospective drift rule did not require another pair. Delayed gain
exceeds the prespecified 15% acceptance threshold and the initial 20–40% prediction. The local
result has no timing regression against the retained result. All three journeys pass; no failed
run or deadline continuation is omitted.

Every primary-window HTTP response has status 200, with **zero 429s**. Browser request-failure
events still appear after HTTP 200: 112/71/53 `net::ERR_ABORTED` events in the table's order. Those
are retained in the numeric evidence, not described as zero network failures. The complete
writing/cold-recovery checks pass; intentional offline checks also produce failures outside the
primary window. Response bodies are not retained: the writer interval uses HTTP 200 response
timestamps as a proxy for acceptance, with eventual delivery checked separately by full exports.
The key probe measures key-to-next-frame, not key-to-admitted-text latency. Heap is a post-GC
endpoint, not a peak-allocation measurement.

The remaining ~1.2-second delayed foreground task is similar to the prior grouping observation
and is still unattributed. Cold opening remains near seven seconds, above the 2.5-second goal.
This repair neither bounds local retained history nor establishes phone performance. Public
rollout and the next performance target require separate work.

## Focused verification

- **52 unit checks** pass across collector ordering/loss/drain/byte/time bounds, receipt framing,
  publisher selection, ordered queue, receive driver and HTTP transport.
- **21 native cases** pass: six real-browser group/prefetch HTTP cases, eleven common grouped
  storage cases and four affected receive/self-stream regressions. They cover reversed replies,
  missing first/middle replies, single-flight exclusion, simultaneous local input, close/drain,
  wrong request binding, streamed byte refusal, atomic crash/retry, expiry/authority changes,
  native record/byte bounds, old-reader compatibility and exact self reconciliation.
- Ordinary packaged build, TypeScript, targeted lint/format and whitespace checks pass.
- **Three packaged journeys** pass full both-way writing/export/reopen checks. No full suite,
  mutation campaign or resumed release-validation campaign was run. The previously recorded
  unrelated self-binding mutation control remains outside this repair.

Commands and their outputs are retained in `logs/`. Targeted commands:

```sh
node node_modules/vitest/vitest.mjs run test/receivePrefetch.test.ts test/receiveGroup.test.ts test/receiveSelection.test.ts test/ownedReceiveQueue.test.ts test/accountReceiveDriver.test.ts test/privateDeliveryHttp.test.ts
node --test --test-concurrency=1 test/account-receive/groups-transport.test.mjs test/account-receive/groups.test.mjs
node --test --test-concurrency=1 --test-name-pattern='owned request, atomic|lost reply and unavailable|verifying an empty self check|own-stream reconciliation refuses' test/account-receive/native.test.mjs test/account-sync/native.test.mjs test/account-sync/self-poll.test.mjs
```

For a journey, set `DONE_PERF_SOURCE`, `DONE_PERF_FIXTURE_ROOT`, `DONE_PERF_DIST`,
`DONE_PERF_RESULTS` and `RECEIVE_DELAY_MS` (0 or 75), then run the unchanged
[attribution configuration](../2026-10-12-receive-attribution/probe/receive.config.ts).
Baseline bundle: `/tmp/done-receive-groups-20261012/candidate-dist`, verified against all 59
retained asset hashes. Candidate and raw outputs: `/tmp/done-receive-prefetch-20261012/`.
Node 26.11.1, Vite 8.1.5 and Playwright 1.62.0/Chromium 151 were used, not production's Node 24.

`identity/` records source/bundle/fixture hashes and raw-result locations. `samples/*.json.gz`
retain timing/count/status data; document samples are replaced with lengths and database names
are removed. Credential-bearing replay snapshots remain external and must not be published.
Decompress a sample to `result.json`, run the existing `probe/analyze.mjs` from the attribution
packet and this packet's [supplementary analyzer](./probe/observations.mjs); both reproduced all
three retained outputs. `manifest.json` hashes the retained packet, excluding itself.
