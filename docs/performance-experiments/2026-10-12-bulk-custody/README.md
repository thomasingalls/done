# Bounded bulk custody reads: correct, not adopted

2026-10-12. The preceding investigation is committed **signed `902806c9`**. This bounded experiment
implements a complete bulk custody inventory read while preserving the fresh authority check and
live undo. **It did not improve read time consistently. The cursor remains the default**, and
`VITE_ACCOUNT_BULK_CUSTODY=1` selects the experiment. Nothing is published; release validation stays
paused. This is a negative performance result, not a latency pass.

## Prediction and result

The [prospective protocol](protocol.md) predicted at least a 20% reduction in median final-apply
authority read time in both repetitions of both conditions. Each restored session uses 120 cards
(~60 KB), 12 KB Goals, a ~400-character edited card, 120 requested keys at 150 ms gaps, CPU-4x on the
receiver, and 75 ms added request latency. Active means ten peer edits at two-second intervals;
backlog means opening against 600 received positions still to catch up. Both arms use the same
test-only attribution instrumentation, without CPU sampling. Runs are serial; arm order reverses in
repetition two. No real account or physical phone is involved.

| Condition | Repetition | Fresh read median, cursor → bulk | Reduction | Frame p95, cursor → bulk | Final jobs, cursor / bulk |
|---|---:|---:|---:|---:|---:|
| Active peer | 1 | 31.0 → 35.7 ms | −15.2% | 56.3 → 54.1 ms | 7 / 8 |
| Active peer | 2 | 31.0 → 30.3 ms | 2.3% | 54.5 → 53.6 ms | 7 / 9 |
| Backlog | 1 | 31.6 → 40.5 ms | −28.2% | 67.2 → 88.8 ms | 14 / 16 |
| Backlog | 2 | 29.7 → 31.1 ms | −4.7% | 78.0 → 70.1 ms | 15 / 16 |

No pair reaches the predeclared improvement threshold. The first backlog repetition has a 32%
typing-p95 regression; the reverse-order repetition does not reproduce it. There is no basis for
claiming either a consistent typing gain or regression. Actual apply/publication medians stay around
8 ms; exact equality medians stay around 4 ms. Long tasks still reach 117–138 ms in these sessions.

Read spans include fresh database open, layout checking, transaction scheduling, materialization and
task-budget waits. This experiment does not separate those costs or establish which explains the
null result. Fewer cursor callbacks alone are insufficient here. Different completed job counts mean
aggregate work cannot be treated as a matched throughput result. The two repetitions are a bounded
decision check, not a population estimate; automated input and instrumentation have the limitations
recorded in the protocol. Neither the 50 ms working p95 target nor the 16 ms TRD target is met.

## Follow-up diagnostic

After the initial pair, a named follow-up asked whether repeated `IDBRequest.result` access was
re-deserializing the bulk array. The original comparison finished unchanged before the diagnostic.
Five synthetic reads each of binary and string payloads at CPU-4x returned the **same array and row
objects on every second access**. First access cost 1.6–4.1 ms; second access cost 0–0.1 ms. Later
accesses were zero at the timer's resolution except one 0.8 ms sample. Repeated decoding is not the
cause on this Chromium. No second candidate or additional comparison was run.

The synthetic database contains four rows: each has either 128 KiB binary or 256 KiB of hex-like
string characters, plus 100 small nested children. This tests getter behavior, not real inventory
size or end-to-end performance. It is retained as `result-access.json` in the evidence archive.

## Correctness and disposition

All eight comparison sessions pass exact text, last-key undo/redo, peer preservation, convergence,
and cold offline replay. Completed typing-window account requests are all HTTP 200.
[Focused checks](checks.md) pass: 269 unit cases (one pre-existing skip), five native custody cases,
and three prepared-receive cases. TypeScript, scoped lint/format, ordinary production build and its
initial-JS budget pass. Initial fixture/observer failures are retained with their explanations.

The [reader contract](../../account-bulk-custody-reads.md) covers the exact prefix interval, 32-value
bound plus a 33rd-key overflow sentinel, one readonly snapshot, caller isolation, unknown rows,
cancellation and database version changes. Every check still reads the complete current inventory;
the authentication memo and fallback, final authority fence, journal-before-apply and undo are
unchanged. No format change, connection cache, retained-authority shortcut or deferred audit is added.

After measurement, only the selection rule changed: the measured source selected bulk unless the
flag was `0`; the retained source selects it only for `1`. The reader implementation is unchanged.
The exact measured patch and hashes are retained, alongside the final opt-in source identity. Native
tests explicitly select bulk; the default path is also covered by the unit inventory/authentication
test. Preserve this experiment for reuse, but do not enable it on the basis of these results.

The next measured target remains **repeated membership-proof work**: cooperative yielding inside
the proof chain, then safe transfer of a verified result within one owned discovery/adoption operation.
Fresh inventory checks, response signatures, expiry/rollback/competing-authority checks and undo must
remain. If fresh IO is revisited, attribute native open and task-budget waits before another rewrite.
Local retention remains design-only.

## Reproduction and retained evidence

[Summary](summary.json), [source/build identities](source-identity.json), [manifest](manifest.json),
and [numeric evidence archive](evidence.tar.gz). The archive includes every comparison session's
result/analysis/log, the synthetic diagnostic, checks and initial failures. It excludes writing,
credential material, browser/service snapshots and fixture contents; fixture hashes are recorded.
Bundles remain scratch artifacts identified by hashes, not copied into this packet.

For the measured source, reconstruct `902806c9` plus the archive's `measured-runtime.patch` in an
isolated checkout. Build the probe with `VITE_ACCOUNT_LEDGER_PROFILE=1`; set
`VITE_ACCOUNT_BULK_CUSTODY=0` for reference and leave it unset for the measured candidate. On the
retained opt-in source instead, use `0` and `1` explicitly. The harness expects the builds under
`/tmp/done-bulk-custody-20261012/{reference,candidate}` and the private fixture locations recorded in
the identities. `python3 probe/run.py` (from the repository root with this packet's full relative
path) refuses existing session outputs; use a fresh scratch location for new work. The committed
`summarize.py` reconstructs the table from those results. Fixtures are intentionally not public
reproduction inputs; the archive is sufficient to recheck the reported numerical comparisons.
