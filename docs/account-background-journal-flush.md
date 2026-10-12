# Account journal copies alongside admission

Timed Account journal flushing may run alongside synchronous local admission. This is a
scheduling change in the exclusive Account owner, with the same encrypted journal, content
records, source capsules and storage verification. Generic Local sessions keep their FIFO
timer barrier. Explicit `whenDurable()` barriers remain FIFO in both modes.

## Boundary

The background operation reads a journal snapshot, persists its sources through the normal
serialized Account storage tail, and removes only the exact captured key/value pairs after
their content commit. It never changes the canonical editor document. A local intent may
therefore prepare, synchronously seal/write its own new journal entry, and only then promote
while that older snapshot is being copied. Undo and source attribution use the same admission
path. The acknowledgement still comes from successful synchronous journal storage.

Foreground inputs remain in one FIFO. A remote handoff or explicit durability barrier waits
for the background copy and fences all inputs after it. If a local head cannot journal, it
retains its prepared bytes and pressure state, waits for the copy, flushes remaining journal
work and commits through the forced content path before promotion. Its successors wait too.
No remote dependency is exposed before its local durable receipt. Publication's explicit
durability barrier is unchanged.

## Suffix accounting and failures

The admission owner records its journal revision and byte total when the copy starts. It
starts a new batch window for subsequent journal admissions. Completion subtracts only that
starting byte total; a changed revision leaves the journal dirty and preserves the new window.
The actual snapshot may be captured later on the serialized storage tail and include some of
those newer entries. That can cause a redundant follow-up flush, never a false clean state or
deletion of an unobserved entry. Receipt counts, not estimated bytes, count content records.

Only one timed copy runs at a time. If its successor deadline passes during the copy, the
next timer runs after settlement. Compaction cannot start while either a copy or a dirty
journal remains. There is no polling loop while a fence waits for the copy.

Storage/cleanup failure blocks admission and rejects pending barriers, retaining all
acknowledged carriers. A refused local head cannot start its forced commit after the copy
fails until explicit retry. Discard is allowed only after both foreground and background
flights have settled. Close immediately disables admission, drains both flights, and releases
the private canonical document and custody only through the existing lifecycle. Renderer
death relies on the same journal/content overlap recovery and capsule deduplication.

## Scope and evidence

The background mode is controlled at Account composition with
`VITE_ACCOUNT_BACKGROUND_FLUSH`: enabled by default, with `=0` retaining timed FIFO barriers. Activation and measured
outcomes are recorded in the [experiment packet](./performance-experiments/2026-10-12-journal-flush-admission/README.md).
There is no stored-format or integrity-audit change. Full-record consumers, cold verification,
cryptographic work, explicit barriers and remote admission can still occupy foreground time.
This is not a claim that every input stall is eliminated or that online/phone latency meets
the budget. Local retention remains separate design work; release validation remains paused.
