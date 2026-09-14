# F-17: complete comparison without repeated long-string encoding

This bounded continuation starts at signed `5ffce895`. F-17 already has a sound full-byte fast
path and bounded archive memo (`1fca26e4`, originally `063cd72`). The latest packaged profile
points to both private preparation and projection comparison; this phase targets comparison
only. Document/history forks and their isolation remain unchanged.

## Construction

Run the pinned Yjs V1 encoder over all integrated structs and deletions. Retain values passed through its `writeString` method of at
least 32 UTF-16 units as ordered `(offset, value)` fields; encode every other field normally.
Offsets refer to the remaining byte stream before each string. The remaining bytes plus these
ordered fields reconstruct exactly the ordinary encoding by inserting each length-prefixed UTF-8
string at its offset. Equality of all bytes, offsets and string values is therefore sufficient
for full encoding equality. It does not replace content with a clock, hash or cache.

All existing state-vector, deletion-set and exact pending-byte/bookkeeping checks still run
before this comparison. Any difference reconstructs the full original bytes and preserves the
existing exact-byte and GC-normalized fallback. In particular, distinct JS strings that encode
to the same UTF-8, different item boundaries, and retained undo content keep the old result.
No new representation is persisted or transmitted. Temporary comparison references are released
on return; this is not a JavaScript-memory zeroization claim.

A bounded probe inspects at most 64 structs for a long text item. Without one, use the ordinary
encoder. This is an optimization eligibility heuristic, not a completeness check: both paths
still encode every struct and content field. Long strings after that probe receive ordinary full
verification. The exploratory first implementation slowed the 100k-fragment comparison; retain
that negative observation alongside the revised candidate.

## Validation and decision

Before final performance measurement, compare the candidate with the frozen always-normalizing
reference on the existing 150 generated delivery/deletion/split histories plus 200 generated
long-string and scalar-content histories. Include equal-clock unequal text and scalar content,
root identity, UTF-8 edge cases, the eligibility boundary, retained deleted content and fallback.
Retain the existing 500 fork histories, workspace staging/refused undo/redo checks and native
pending/delivery/publication controls. Deliberately ignoring the retained string values must be
detected; existing content/publication guard-removal controls must remain effective.

Repeat the existing sequential item-count profile: 100k visible characters at 1k, 10k and 100k
actual Yjs items; one warmup and five measured samples for fork, comparison and full command
acceptance. Use the same source baseline and installed dependencies, retain every sample and
bundle identity, and run baseline then candidate with no other validation running. This is a
single-host descriptive comparison, not independent replicated observations or a causal estimate.

The five-sample exploratory dense-history timings were mixed. Before final browser measurement,
add a secondary comparison-only precision check: separate baseline/candidate bundles, ten warmups
each, and twenty alternating AB/BA pairs at each item count. Retain every sample; the pairs share
host/JIT/GC state and do not support a population confidence claim. This check addresses noise and
order sensitivity rather than replacing the full command-acceptance observations.

Then run the unchanged packaged application latency gate. Preserve every metric and any remaining
failure. Accept this bounded optimization only if semantic and fault controls pass and the measured
comparison benefit is useful without a material dense-history regression. If that condition fails,
retain the failed experiment and revise the construction. A partial gain cannot close F-17 or the
16 ms input budget. Keep item count, history density, fallback and device capacity visible.

The earlier control pilot remains the recorder calibration reference. Repeating it is warranted
only if a new observation calls its interpretation into question. Focus/mount cost, further fork
optimization, Account carrier verification, remaining runner integration and immutable release
qualification are separate work.

## Recorded result

The construction passes the final unit, generated, native and deliberate-fault controls. The
comparison-only gain is useful at 1k longer items; dense short-item comparisons remain effectively
unchanged in the alternating check. Sequential whole-command timings remain mixed. The unchanged
application gate still fails: card typing p95 is 16.2 ms desktop / 77.2 ms CPU-4x Android emulation
against <16 ms. F-17 remains partial. See the [measurements](./performance.md) and
[retained evidence](./account-conformance-runs/2026-09-14-f17-comparison/README.md).
