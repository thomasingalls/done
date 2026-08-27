# Probe — does immutable append cost more than a hot-key overwrite?

**Run:** 2026-08-26 · **Harness:** `test/latency/journal-bench.ts` via `journal.spec.ts`, `--project=desktop` ·
**Machine:** development Mac, Chromium 1234 · **Status:** probe, **not** a release measurement

## Why this was run before `S0-10` rather than at `L-4`

`f-66a7c6a-journal-benchmark-overwrites-one-slot` established that every warm-up, probe, batch and single write in
the journal benchmark went to one fixed key, then removed it once at the end. `setItem` over an already-present
value of the same length is the cheap case: the key exists, the store does not grow, nothing accumulates. The
journal writes an immutable record per update into a distinct slot.

The remediation package classified this as a later gate. That was right while fixing the harness was the work; once
the harness was corrected, running it became one command — and the question it answers is not a release question
but an **architectural** one: if immutable append were materially more expensive than hot-key overwrite, the
synchronous-`localStorage`-journal premise itself would be in doubt, and that belongs before Stage 0 closes rather
than after.

## What this probe can and cannot say

It **cannot** produce a release p95. The lineage already established that desktop badly understates a real
handset's journal cost, and `f-bd87655-baseline-not-performance-floor` remains open: the support population is
still undeclared. Absolute numbers here do not transfer.

It **can** answer the relative question, because both arms ran on one machine in one session with the same run
shape. That is what was in doubt.

## Result: no material difference

`setItem` cost, isolated as the `stored` level minus the `framed` level:

| Payload | Path | Hot key | Append | Ratio |
| --- | --- | --- | --- | --- |
| 18 B | JS seal | 0.0141 ms | 0.0140 ms | 0.99× |
| 18 B | WASM seal | 0.0114 ms | 0.0146 ms | 1.28× |
| 419 B | JS seal | 0.0088 ms | 0.0098 ms | 1.11× |
| 419 B | WASM seal | 0.0133 ms | 0.0154 ms | 1.16× |
| 4096 B | JS seal | 0.0109 ms | 0.0131 ms | 1.20× |
| 4096 B | WASM seal | 0.0104 ms | 0.0101 ms | 0.97× |

Two of six ratios fall **below** 1.0, which places the spread inside run-to-run variance rather than showing an
effect. The tail agrees: at 4096 B the p95 over 4,000 single writes is **60 µs in both arms**, identical.

Full encrypted write (WASM, sealed, framed, stored): 0.0172 ms at 18 B, 0.0222 ms at 419 B, 0.0495 ms at 4096 B.

**Conclusion.** On this platform the append shape does not change the cost, and the Stage 0 premise survives the
correction that prompted the probe. The finding's remaining obligation is unchanged — an immutable append burst on
a **declared device population** is still required at `L-4` — but it is no longer a candidate for reopening the
row-2 selection or the synchronous-journal architecture.

## The unbounded arm found a wall, and that is the more useful result

The first run was unbounded: every write took a new slot and nothing was evicted. It died.

```
plaintext at 18 B stopped after 92176 writes (92175 outstanding):
Failed to execute 'setItem' on 'Storage': Setting the value of
'done.pending-update.bench.92175' exceeded the quota.
```

That is roughly **1.7 MB of payload** but about **5.3 M UTF-16 characters** once keys are counted — so at journal
sizes the *key* is a comparable or larger share of stored cost than the record it names. The benchmark reported
where it stopped rather than crashing opaquely, which is what the corrected harness's quota handling is for.

Production does not accumulate 92k entries, because entries live only until the next asynchronous batch commit.
The probe therefore bounds the outstanding set at 256 entries — a production-shaped occupancy — and the numbers
above are taken under that bound. The eviction is a `removeItem` inside the timed operation, which production does
not do on the write path; it lands on about one sample in 256, far outside p95, and the run reports how many
samples carried it rather than asking the reader to trust the estimate.

**The wall itself is an input to `P-3` and `S0-3`, not to this finding.** TRD §6.1 says "journal or batch failures
remain observable and leave recoverable entries intact," but at quota `setItem` throws and *the new write cannot
be journalled at all*. That is the same total-write-admission gap `RC-3` describes for the 64 KiB seal boundary and
for storage failure, now with a measured boundary attached rather than a hypothesised one: a stalled or failing
batch commit has a hard ceiling, and what the writer does on reaching it is unselected.

**`P-3` used it twice** ([`decisions/P-3-write-admission.md`](../decisions/P-3-write-admission.md), 2026-08-27).
It disposes of Branch B's premise that a segmented WAL removes the cap — the cap is the origin's quota and this
number is it — and it turned the back-pressure watermark into a **character** budget rather than an entry
count. 92,176 entries is the 18-byte figure; at the admitted maximum the same quota holds a couple of hundred,
so a design that bounds outstanding entries by count is wrong by two orders of magnitude at the size that
matters.

## Reproducing

```bash
npx playwright test --config playwright.latency.config.ts journal.spec.ts --project=desktop
```

Raw samples land in `test-results/latency.jsonl`, which is git-ignored. To re-run the control arm, replace the
per-write slot in `journal-bench.ts`'s `run` with a single fixed key and compare `stored` minus `framed` across
the two arms.
