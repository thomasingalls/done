# Client receive performance and visible recovery

Status: bounded implementation and measurements complete; final verification recorded below.
Release qualification remains paused. This packet uses disposable local services and synthetic
writing, never the production database or the user's browser accounts. No deployment is implied.

## Implemented change

- Compare custody records by their closed scalar/byte values, avoiding repeated hex/JSON/UTF-8
  encoding of large encrypted ceremony/history carriers. The authenticated encoding and all
  authority fences remain unchanged.
- Keep a productive publisher for at most four verified pages before checking other publishers.
  Retain the one-position page bound. Yield through the scheduler after every page; a due sender
  gets its turn. Replace the receive lane's fixed 50 ms progress pause with a zero-delay timer.
- Negotiate content-only advisory notifications. They wake receiving without resetting discovery.
  Control hints still reset it; periodic authenticated discovery remains. Older clients receive
  only their original event alphabet, and newer clients accept the older server's hints.
- Retry unexpected exceptions at 1/2/4/8/16/30 seconds, capped at 30 seconds. Content hints and new
  typing do not reset that failure clock. A fresh subscription handshake can expedite a network
  retry, but never clear a conflict, closed, size or integrity halt.
- After 30 seconds of a continuing online problem, display a fixed editor notice with the affected
  direction, an enumerated selectable reason code, last successful upload/receive check since
  opening, and a lane-specific retry. Account details expose both states and progress counters.
  Offline and local-storage pressure keep their existing notices. Manual retry rechecks evidence;
  it does not discard a row, reset a cursor or restore authority.

## Boundaries checked

The focused checks cover generated scheduler histories, unexpected retry versus integrity halt,
fair send turns, receiver selection, custody equality against its encoded reference, and legacy/
negotiated notification streams through the actual gateway. A packaged two-browser test supplies
malformed receive bytes: the lane stays stopped, its fixed notice appears, and an explicit retry
after removal of the fault converges without reloading. A subsequent reverse-direction edit arrives.
Native checks retain self-submit progress through compaction/reopening and serialized verified loads.
History transport now distinguishes oversized/invalid evidence from interrupted network work, so
known invalid evidence cannot accidentally enter the unexpected-error retry path.

## Measurement design

See [the prospective protocol and recorded amendments](./protocol.md). The baseline is local commit
`86275345`, whose runtime is identical to deployed `c609d8c7`; both builds run locally on this Mac,
not on production hardware. Both use the same unchanged service request budgets and signed fixture.
The candidate service differs only in negotiated notification classification.

One genuinely enrolled pair has 120 roughly 400-character cards, a 12 KB Goals document and 600
separately accepted positions waiting for the offline receiver. Each timed run restores the same
service/browser snapshots, then types 120 further keys on the writer during catch-up and submits
one receiver-side sentinel. After catch-up it measures 12 burst-to-peer deliveries, receiver typing,
complete Markdown export agreement and offline reopening. The unit of comparison is a restored
run, not an individual request or key. A separate identical completed receiver snapshot supplies
matched offline cold-open/typing observations and a separately labelled CPU profile.

| Observation | Deployed-source baseline | Candidate |
| --- | --- | --- |
| 600-position catch-up, first pair | Incomplete at 600 s; last requested peer cursor 387 from initial 7 | 307.083 s |
| 600-position catch-up, reverse pair | Primary deadline missed; continuation finished at 938.398 s | 318.043 s |
| Own/peer reads to complete the reverse-pair primary workload | 599 / 600 | 150 / 600 |
| Catch-up browser long tasks, reverse pair | 8,446; p95 79 ms, maximum 1,235 ms | 1; 53 ms |
| Observed burst-to-peer median after catch-up | 3,642 ms (one completed baseline, 12 bursts) | 2,362 / 2,358 ms (12 each) |
| Receiver next-frame callback p95 during online typing | 77.9 ms | 29.5 / 33.6 ms |
| Distinct new accepted-position reply intervals at depth, median | 2,264 ms (8 intervals) | 2,285 ms (8 intervals) |
| Matched offline reopen, identical completed receiver | 6,966 / 6,891 ms | 6,873 / 6,878 ms |
| Matched offline key-to-visible-text p95 | 18.4 / 23.6 ms | 24.3 / 24.0 ms |
| Matched offline key-to-visible-text median | 14.4 / 14.7 ms | 14.5 / 14.1 ms |
| Matched offline next-frame callback p95 | 23.0 / 24.2 ms | 23.9 / 24.0 ms |
| Matched post-GC JS heap | 18.775 / 18.776 MB | 18.792 / 18.792 MB |

Both primary pairs meet the predeclared 20% target using the baseline's 600-second lower bound:
at least 48.8% and 47.0% less time. The one completed baseline continuation gives a 66.1% reduction
against its paired candidate (approximately 3x throughput). Do not impute a first baseline completion.
Both candidate journeys and the completed baseline agree on complete Markdown exports and offline
recovery. All four identical-state opens produce the same 54,211-byte export digest. There were no
HTTP 429s or other HTTP refusals in these timed observations. Receiver sentinel uploads completed
during backlog replay, and the short distinct-position observations show no loss of writer liveness
past position 600. They do not show a material writer-acceptance interval improvement.

Offline typing has mixed tails: the first candidate p95 is higher, the second essentially matches.
That satisfies the stated **no consistent >10% regression** guard; it is not evidence of an offline
input speedup or proof of equivalence. Next-frame callbacks can precede admitted DOM changes; the
separate key-to-visible-text observations are the appropriate offline admission measure. The online
frame figures are responsiveness proxies, not proof of hardware presentation latency. Burst-to-peer
numbers include batching and Playwright assertion polling, so they are observed upper bounds rather
than precise in-page arrival timestamps. Only one baseline supplied that secondary comparison.

The candidate retains a 1,162 / 1,527 ms post-catch-up browser task in the two runs. The second run
also ends with content rows compacted from 125 to one; the task/compaction relationship remains an
inference. The separate 160-key diagnostic did not provoke an idle long task: batching means keys
are not content records. No measured compaction duration is claimed from that profile.

Cold opening is essentially unchanged and still exceeds the 2.5-second budget at this depth. Each
matched open records 3,180 decryptions, 5,428 signature/MAC verifications and 6,179 digests. The
separate profile attributes 4.55 seconds inclusive to `verifyInboundLedger`, including 2.82 seconds
in `verifyInboundCoverage`; nested figures overlap and cannot be added. Recovery-protocol hex/unhex
conversion accounts for about 1.02 seconds of sampled self time. These are evidence for future
received-history coverage/representation work, not justification to drop a verification pass now.

The 160-key diagnostic records about 25 ms sampled active CPU per key including flush/idle work;
about 11 ms per key is under ordered input processing. It contains no idle maintenance long task.
Raw profiles and their source-mapped aggregates are under `profiles/`.

## Evidence handling and known limitations

Disposable browser snapshots, passkeys, lock codes and SQLite files stay outside Git. Retained
request metadata has no tokens, content or account/publisher IDs; timing summaries omit database
names. CPU profiles contain code paths and samples, not heap snapshots. `manifest.json` hashes the retained
files; `identity/external-results.json` identifies the original unsanitized synthetic result files. Synthetic text is compared
privately; only export lengths/digests are retained in the packet.

The first two setup attempts failed (sandbox Chromium launch; then an inappropriate synthetic
pagehide shortcut that correctly closed the workspace). The final fixture uses ordinary quiet
publication. The first pair's optional DOM text trace searched for a space removed by Markdown
normalization; the independent completion assertion and request timings remain valid. The trace
was corrected for the second pair. Keep setup failures and primary timeouts as outcomes. The named later network diagnostics identify
HTTP-200 `ERR_ABORTED` request flags, deliberate offline setup refusals and
closed subscription streams. Sequential receiver cursors and complete exports show that those
request-level flags are not evidence of lost pages; we do not describe the runs as having zero
network errors. The first pair retained only the failure boolean, so that finer classification
is unavailable there.

These observations do not establish phone, WAN, three-device, multi-account or indefinite-history
performance. The local Account ledger is still retained; deeper cold open is still full verification.
Foreground maintenance yielding and a bounded authenticated retained baseline remain later work.
The comparison does not resume release qualification or replace existing performance budgets.

## Final verification and remaining limits

- **56 focused unit tests pass**, including 400 generated scheduler histories and 100 generated
  custody comparisons; separate regression tests cover capacity/storage retry, truthful acceptance
  times and lane-specific manual retry/batch behavior.
- **Six history/current-key retry Node tests pass**, plus the six notification/gateway tests and two
  native self-submit/reopen/serialization checks. The retry fixture initially failed because it wrote
  only one Vite output chunk; retaining all generated chunks repaired the fixture.
- The packaged invalid-page/notice/manual-retry journey passed on the measured bundle and on the
  final rebuilt bundle. The final build's first attempt failed **before the tested case**, during
  initial enrollment's second-editor opening, with a service-refusal message. An isolated rerun
  passed. The failing attempt did not retain the HTTP refusal body, so its cause and relationship
  to timing remain unresolved. Both outcomes are retained; this is a follow-up before publication,
  not a defect claimed fixed by rerunning. The test now logs content-free route/status diagnostics.
- Typecheck, changed-file lint/format, build, Yjs patch, origin isolation and the initial-JS budget
  pass. The final initial bundle is **136.7 kB gzipped**, against the unchanged 350 kB budget.

`identity/` distinguishes the measured candidate from the final source/bundle. Final corrections
cover exception classification, the newly accepted-upload observation, explicit send retry closing
its own batch, and preserving a known size refusal when stream cancellation itself fails. They do
not change automatic successful receive scheduling or verification, and are covered by final tests.
The performance figures above belong to the measured candidate; no new timing claim is made for
the final rebuilt bundle. All 59 measured frontend files were reconstructed exactly against their
previously recorded SHA-256 hashes; external dependency paths in regenerated maps were restored to
the original relative paths before comparison. Those maps accompany the raw profiles.

The scoped result supports retaining these receive improvements. It is **not a clean publication
sign-off**: the one enrollment refusal needs a bounded investigation, the received-history cold-open
budget is still missed, and no current phone/WAN or long-session guarantee follows. The next agreed
performance phase remains maintenance yielding/foreground stalls, with a genuinely captured compaction
profile. The larger history-retention design remains separate. No code, image or deployment was pushed.

## Reproduction

Use the repository's installed dependencies and disposable directories. Build the archived baseline
source and the candidate with `node node_modules/vite/bin/vite.js build`; keep each `dist` directory
with its source. The shared helper starts application/API processes on **53771/53772**, so run these
observations serially. Set the three environment variables for each observation:

```
DONE_PERF_ROOT=/tmp/done-client-receive
DONE_PERF_SOURCE=<absolute source directory with its own dist>
DONE_PERF_RESULTS=<new, unique absolute output directory>
```

Run `node node_modules/@playwright/test/cli.js test --config
 docs/performance-experiments/2026-10-11-client-receive/probe/receive.config.ts` as a single command.
First add `RECEIVE_SEED=1` using baseline source to create the private fixture. Subsequent runs omit
that flag and restore the fixture. `RECEIVE_FINISH_BASELINE=1` records a missed ten-minute primary
deadline before continuing for secondary observations; it never turns that outcome into a pass.
`RECEIVE_WRITER_ONLY=1` runs only the supplemental 120-key writer block with position metadata.
Never reuse the output directory or run observations together.

For the identical completed receiver, use `probe/steady.config.ts` instead and set
`DONE_REOPEN_FIXTURE` to a passing run's private `deep-received-fixture.json`. Run baseline/candidate
and then candidate/baseline. `RECEIVE_PROFILE=1` adds separate CPU profiles; exclude that run's
elapsed times from the paired unprofiled comparison. The probe compares complete exported content
by digest, records 120 key-to-DOM and key-to-frame observations, and observes two further idle seconds.
`probe/summarize.py <result.json> ...` produces content-free timing summaries. Percentiles use the
nearest-rank convention; individual keystrokes are not independent experimental replicates.

For acceptance-interval summaries, save only the `delivery_decisions.position` integers whose
`kind='accepted'` and `position>607` from each stopped supplemental service into its private
`accepted-positions.json`. The summary joins successful reply observations to that set, deduplicates
by position and excludes the restored prefix. This is a receipt-time proxy for a durable service
acceptance, not the server's exact commit timestamp. The two retained supplemental position lists
are under `samples/` for recomputing these summaries without access to service secrets.
