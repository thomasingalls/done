# Pre-active Local import preparation

This bounded L-1 phase follows the Yjs delivery repair (`a465310`). It constructs an unselected Local
destination from a verified diagnostic capture using the explicitly requested `markdown-system-v1` adapter.
It does not select sequencing §5.4's real cutover carrier, implement a fidelity archive, establish production
old-writer exclusion, select a workspace, delete source material or change default application startup.

## Construction

The caller supplies recovery bytes, a separately retained recovery digest, expected source origin/digest,
and the explicit adapter policy. The owner copies the input, verifies the packet through the existing
strict replay, and derives its own bounded logical plan. These are locally confirmed import choices,
not signed source authority: an unkeyed digest does not authenticate a file or prove source quiescence.
No caller document, key, reservation counter or progress value is accepted. Resume requires the same input.

A generated device code must be confirmed before any persistent destination creation. Under the existing
exclusive slot permit, an absent destination slot/custody namespace is claimed with a fresh Local principal,
workspace, store instance, custody root, generation key and reservation history. Existing legacy source is
allowed by this distinct owner; fresh Local genesis's absence rules remain unchanged. Unknown destination
rows, existing index routes, clear markers, name collisions or destination journal entries refuse.

One custody transaction installs the immutable initial factor seal and a separate import claim. A
domain-separated HMAC derived from the factor-opened root covers the initial custody MAC, source binding,
policy, logical plan digest, timestamp and stage. Stages advance custody → content → importing → imported.
Exact previous bytes are compared in each progress transaction. The initial claim never replaces missing
live custody or counters. No normal Local genesis claim or ready slot-index row is created.

Each logical action changes a private Yjs document and writes an immutable, intent-bound receipt for its
consecutive action number in the same Yjs transaction. The resulting update is checked against the 16 KiB limit, then appended through the
existing authenticated content owner. Its durable allocator reservation precedes encryption; aborts spend
reservations. The data and receipt share one encrypted record and one native append transaction, so a crash
after commit cannot leave a receipt without its data or cause resume to repeat the logical action.
Receipts use distinct encrypted meta keys: overwriting one shared cursor accumulates Yjs deletions across
restarted client ids until even tiny updates exceed 16 KiB. No separate per-slice cross-database receipt
is needed. Replay requires all records to be updates, each cursor
to advance exactly once, matching intent/plan, and no pending dependencies. Missing, reordered or duplicate
slice records refuse instead of inferring coverage from a sequence watermark. Counter gaps remain legal.

Each invocation imports at most a caller-selected 1–32 actions (default eight). Logical text actions use at
most 1,024 UTF-16 units without splitting surrogate pairs; card/day initialization is separate from bodies.
The final encoded-size check remains authoritative. Loading and planning still process the whole bounded
input/history; these limits bound writes, not peak memory or elapsed time. This is not a general bulk or
interactive admission adapter.

Completion requires factor-opened replay and semantic comparison with the verified logical payload. The
`imported` result remains pre-active. Every reopen validates all receipts and content again; the final claim
alone cannot authorize success. A later selection owner must independently perform cold verification,
source/exclusion checks and install a durable routing decision before any cleanup is possible.

## Explicit adapter semantics

Master text and canonical day card bodies survive exactly, including multiline/empty cards, all dates and
Next counts beyond three. No freeze or cap is consulted. Nonempty archived day files become ordinary day
collections. Empty archive files retain their empty archive representation so file presence survives
without inventing cards.
Unfiled card bodies remain unfiled, in captured order. Their informational old-id/last-location appendix is
not imported as authority. New deterministic ids are scoped to the fresh import intent; author is `system`,
origin is null and creation time is the immutable import timestamp. Source actor/device/settings/history
metadata is not restored. This lossy attribution policy is for the explicit adapter, not fidelity migration.

## Testing and remaining gates

`pnpm storage:legacy-import` freezes production source and runs the native suite plus sensitivity controls.
Use `--seed`, `--runs`, `--path` or `--replay` with the runner for generated histories; `--mutant baseline`
runs the baseline alone, and a named mutant runs that control alone. Failed properties save input and
shrink paths. [Execution evidence](./storage-conformance-runs/2026-09-09-legacy-import.md) distinguishes
final passes, the reproduced receipt-growth defect and earlier fixture failures.

Fake IndexedDB is used only for focused unit/refusal tests. Native tests exercise factor confirmation,
competing intents, wrong factor/input, ordinary-open exclusion, exact source preservation, ciphertext-only
destination persistence, fresh identities/counters, abort after reservation, request-success/transaction-abort,
renderer death after claim, custody, initialization/progress, reservation and slice commits, plus repeated
cold resume. Before-commit coverage uses native aborts; it is not an exhaustive kill matrix. Generated schedules vary
source text/days/order/duplicates, slice budgets and restarts, checked against an external string ledger.
Saved seeds/shrink paths and sensitivity controls test that data omission, repeated slices,
non-atomic receipts and premature completion are observable. Exceptions/timeouts are not mutant detection.

Production exclusion, chosen real carrier, active selection, cleanup, platform/profile assurance, independent
crypto/storage review and memory/latency acceptance remain separate gates. Pre-active plaintext source is
retained recovery material. No debt status or whole-protocol completion follows from this component.
