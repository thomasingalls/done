---
schema: 1
kind: finding
id: f-66a7c6a-journal-benchmark-overwrites-one-slot
status: validated
type: evidence-weakness
severity: medium
confidence: high
introduced_by: 66a7c6a85cc743896568a0ffc678431c1ebaf579
work_item: B-03
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# The whole-journal-write benchmark overwrites one hot localStorage slot instead of appending immutable entries

## Affected requirement or guarantee

TRD §§6.1 and 12 require each accepted edit to be synchronously journaled before handler return and
set a `< 1 ms p95` low-end-device budget on the whole durable write. The B-03 measurements claim the
common 18 B and 419 B writes meet that budget and use the 4 kB breach to choose the next implementation.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §6.1 describes immutable per-page,
per-store journal entries removed only after IndexedDB commit, and §12 names the p95 budget. Original
claims `OC-025` and `OC-064` require crash-safe synchronous journal behavior and its low-end benchmark.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:test/latency/journal-bench.ts` still uses
`const slot = 'done.pending-update.bench'` for every warm-up, probe, batch, and single operation, then
removes it once after the entire level. `docs/performance.md` uses those results as the whole-write rows.

## First introduction and propagation

Introduced by `66a7c6a85cc743896568a0ffc678431c1ebaf579` in the first whole-write harness.
Commit `3670591` runs the same module on a Pixel 9a and propagates its means/p95 into TRD, the row-2
selection, decisions, performance, and progress. `138a5f8` and `9b49b74` reuse its non-cipher remainder
to project or report WASM full-write performance.

## Reachable consequence

Production is specified to create distinct immutable journal entries that accumulate until an
asynchronous batch commit clears them. The benchmark instead repeatedly replaces one already-present,
same-length value at one hot key. New-key insertion, key construction, storage growth, quota/accounting,
and any cost that changes with outstanding-entry count are absent. The measured p95 therefore cannot by
itself establish that real 18 B/419 B journal appends meet 1 ms, and the projected post-WASM margin may
understate the now-more-visible storage term.

## Supporting evidence

At `66a7c6a:test/latency/journal-bench.ts`, `run()` sets one fixed `slot`, warms it with 200 writes,
uses it for the sizing probe, all 30 batches, and all 4,000 individually timed writes, then calls
`localStorage.removeItem(slot)` once. The AAD likewise uses a separate fixed `journalKey`. In contrast,
the same file and TRD describe production as immutable per-update records, and the row-2 selection
binds `journal_storage_key` because entries occupy distinct slots.

## Counterevidence and disconfirmation attempt

The cipher, nonce generation, framing, base64 conversion, and JavaScript-to-storage call are genuinely
measured; at 4 kB the cipher dominates, so the qualitative pure-JS breach remains strong. Browsers may
implement same-origin localStorage such that overwriting versus inserting similarly sized entries has
little marginal cost, but the committed evidence does not measure or establish that. The mismatch matters
most after WASM reduces the cipher and storage becomes a larger fraction.

## Validation procedure

Add a production-shaped mode that generates a fresh journal storage key and matching AAD for each write,
retains a realistic 250 ms burst of entries, then clears only after the batch. Measure cold/first append,
steady burst positions, and cleanup separately on the declared support-floor devices. Compare its p95 and
storage-growth curve with the fixed-slot microbenchmark.

## Disposition

Test and clarify. Keep the fixed-slot levels as component microbenchmarks, but do not call them the whole
production journal write or close the p95 budget without an immutable-entry run.
