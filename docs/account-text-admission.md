# Account text admission without workspace forks

This is a format-compatible optimization of the owned Account editor. The reference command
path remains selectable with `VITE_ACCOUNT_TEXT_ADMISSION=reference`. It does not enable the
Local retired-buffer capability for Account writers, change journal acknowledgement, or change
source capsules, network envelopes, receipts or writer-clock allocation.

## Eligibility and preparation

The private ordered owner supplies its revision, writer and current writer clock, never its
canonical document. The workspace must already hold a fully verified projection at that revision
and an established membership-repair fact. A once-per-history normalization guard excludes
pending dependencies and values which the reference runtime fork would normalize. Remote apply
invalidates repair/normalization eligibility; the next reference command re-establishes it.

The shared CodeMirror planner still computes the existing text command and selection. Only a
single, nonempty replacement range without a remaining paste slice is eligible. The pinned Yjs
seam reads the target's item IDs and deletion ranges to encode the corresponding V1 update. It
creates no document, performs no transaction or item split, and changes no undo state. Formatting,
embeds, unknown shapes, unresolved dependencies and unsafe UTF-16 splits use the reference path.
Paired surrogates at safe boundaries are supported. Structural commands, undo/redo, multicursor
edits with multiple changes and sliced paste retain native preparation and full comparison.

One eligible update is also its single human source frame, with exact byte-buffer identity checked
by admission; the existing Account carrier authenticates the principal and capture route. There
is no historical relabelling or inferred merge of system and human transactions.

## Persistence and promotion

The same queue and size/reservation checks still govern admission. A successful synchronous
journal append, or completed forced content transaction after refusal, precedes all canonical,
projection, selection and undo changes. Retry retains the exact prepared update. Discard and
close erase pending byte buffers; the Account carrier already copies bytes synchronously at its
write boundary. Closing drains native settlement and prevents late promotion.

After durability, canonical receives the prepared bytes. Before any publication, the adapter
requires the same projection identity, revision, unchanged transaction count and exact bytes.
It applies those bytes to its projection in an enclosing local human transaction, allowing the
existing Yjs UndoManager to track the edit without rotating the writer as a remote collision.
It checks the expected text, writer clock and absence of pending dependencies, then records the
existing before/after selection metadata and undo grouping. A disagreement closes admission,
retains durable data and publishes no mismatching projection. It does not retry a durable edit.

## Equality and undo

Opening, reference transitions and complete received-page publication still establish full
canonical/projection equality. Eligible text extends that equality by induction: unchanged equal
bases receive identical, independently tested update bytes; both documents remain private and
ordered. This replaces the repeated full workspace comparison for that bounded transition only.
Ordinary close performs a full projection audit. This is a trusted internal adapter contract,
not a sandbox against hostile same-origin code or a promise to catch raw private-field mutation.

All surfaces still share one human undo history. Direct edits use the existing stack/selection
metadata; returning to native preparation forks that history including retained deleted content
and local redone links. Undo and redo themselves remain native. Remote edits are not attributed
to the human and must survive local undo. Reopening still starts a fresh runtime undo history.

## Evidence and limits

The [measurement packet](./performance-experiments/2026-10-12-text-admission/README.md) records the
paired real Account fixture, build switches and focused results. Tests compare the encoder against
native Y.Text across generated deletions and interleaved writers, true concurrent delivery orders,
nested text and Unicode; workspace histories cover native/direct transitions, undo/redo,
selections, refusal, discard, close, source identity, writer collisions and cold replay. An injected
projection mutation between preparation and persistence is refused before publication.

The optimization removes whole-workspace forks and comparisons from ordinary text admission.
Planning still reads the target text; UI projection and Markdown work remain. It does not make
all per-key work constant in workspace size, accelerate structural/undo commands, trim local
history, or establish physical-phone latency. Release validation remains paused.
