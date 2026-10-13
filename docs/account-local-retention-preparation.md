# Responsive private initial retention preparation — 2026-10-13

Base: signed **`77e54ada`**, the [history-depth measurements](./performance-experiments/2026-10-13-retention-depth/README.md).
This bounded implementation follows the [prospective profile/comparison protocol](./performance-experiments/2026-10-13-retention-preparation/protocol.md).
No public conversion, new format, service change or retention cadence is enabled. General release
validation stays paused.

## Attribution and repair

At 1,201 genuine accepted own positions, a diagnostic first cut took 13.717 seconds and contained
an 11.499-second foreground task. The profile attributed 8.674 seconds inclusive to content coverage,
mostly repeated reconstruction/application of the same content rows. Inclusive times overlap.

Full baseline replay now binds one private coverage view to its own captured immutable records.
The exact reference coverage rules remain: byte-identical originals or previously proved identical
bytes, otherwise fork/apply/pending-aware comparison. The direct struct-coverage optimization and
cross-operation memoisation are not used by this repair. Each full replay still starts afresh; none
of the full verification passes has been removed. All distinct originals, including unallocated
sources, are checked. The view and copied buffers are disposed on success or failure.

The deletion planner likewise binds its independently verified candidate snapshot once. It checks
every covered content row and preserves the original source/spool/delivery/receive/history
classification. A sequence map replaces repeated searches only after the existing placement and
uniqueness checks. The exact enumerated deletion set and closed metadata inventory remain required.

The existing 8 ms CPU budget yields between source checks and classifications, before replay crypto,
and while opening the raw inventory. A yield checks owner lifetime before and after suspension;
cryptography retains its original guard too. The cooperative self projector holds its state private
until every original passes coverage. No yielded result can outlive the owner and become a plan.

## Unchanged mutation and admission boundary

The composed owner still settles admission, flushes and checks the journal, authenticates complete
custody, checks durable attempts/promotions, and retires old network flights/final-apply permissions.
Reservation and strict final exchange still compare the exact inventory atomically. There is no yield
inside an IndexedDB transaction and no new row range deletion. Full post-commit authentication,
baseline replay and readback remain before the journal era becomes usable by queued input.

The live Y.Doc and UndoManager remain in place. Input does **not** overtake conversion. CPU yielding
keeps other page work schedulable, but conversion's total duration is still an admission wait.
Moving expensive preparation outside the FIFO, supporting interrupted/replanned work, or changing
retention UX/cadence is separate work, not an implied permission from this optimization.

## Evidence

See the [profile and comparison packet](./performance-experiments/2026-10-13-retention-preparation/README.md)
for completed measurements, focused tests and remaining indivisible costs. At 1,201 own positions,
median conversion falls from 14.069 to 5.796 seconds and maximum foreground task from 11.836
seconds to 431 ms. One CPU-4x observation still takes 22.051 seconds with a 1.704-second task;
initial conversion remains unsuitable as transparent background maintenance. The former reader-first
publication/compatible rollback, capacity/history-required behavior and activation gates still apply.
