# Generated encrypted-storage histories

`node scripts/storage-properties/run.mjs` runs fast-check histories against actual production
`JournalSession` custody, journal, content and compaction in disposable Chromium contexts. It freezes
production source, records source/harness hashes and versions, and saves every generated attempt. This
is the bounded carrier testing checkpoint before legacy migration, not a default-app cutover.

## Oracle and alphabet

Three source text lanes create insertion, replacement and deletion-only Yjs updates from generated edits.
Generated authors receive earlier source updates before editing, so dependent edits can reference another
client’s undelivered structs.
A plain string model checks each source edit. Original update bytes and acknowledged update IDs form a
separate operation ledger; no disk rows, compaction receipts, sequence watermark or compacted bytes define
expected coverage. Decoded text-struct clock/payload inventories and deletion ranges must always match the ledger, including
otherwise invisible pending material. Visible text and integrated clocks must match when the expected
dependency set integrates completely. Both documents then receive each *unacknowledged* source update,
with comparisons at complete dependency boundaries; final text must match the plain string model. Yjs
can defer different visible portions of an incomplete set depending on update framing/order, so partial
visible equality alone is not used as a preservation oracle. Exact wire inventory is still required. Pinned Yjs supplies wire semantics on both sides: this is independent of the
storage algorithm, not an independent proof of Yjs correctness.

Generated commands deliver updates out of order and with duplicates to the database or synchronous
journal, flush, compact, reopen, refuse journal writes, fail journal removals and abort native transactions
after request success. At the end, missing source dependencies are persisted, the journal is flushed,
compaction must complete or report already compacted, and another cold reopen must recover the full
string model. Two native shared writer sessions can overlap: pause an append/flush after durable
reservation or a compactor at reservation, publication or deletion completion; execute a generated nested
command list through the second session; then release, close or kill the renderer. A separate generated two-operation overlap publishes a
replacement while an earlier append reservation remains pending, commits the late append, then releases
compaction. Callback gates after
publication/deletion delay owner notification only, after actual native commit. A killed renderer is
replaced in the same context; the external model survives outside it. Every normal command and final
reopen checks recovery, monotonic reservation accounting, unique encryption identities and retained
heads/outbound. Compaction and failed removal must preserve exact journal values. Abort receipts must
fail and all previously present content records must survive.

The arrays, edits, IDs, nested commands, interruption point and finish mode all shrink. Modulo selection
keeps commands valid as the source history shrinks; it also means a shrunk ID may select a different edit.
Empty or dependency-incomplete compact/flush backgrounds are reported as inapplicable or deferred; their foreground commands still execute.
This is generated ordering at named boundaries, not an exhaustive scheduler over every browser event.

## Run and replay

- Default: three fixed seeds, 40 histories per seed, then four source-mutant searches. `storage:properties`
  is part of the project check chain. The default campaign also fails if named command/fault/overlap coverage is absent. Native browser runtime is required; there is no fake-IDB fallback.
- Explore: `node scripts/storage-properties/run.mjs --seed 12345 --runs 200 --no-mutants`.
- `--no-shrink` saves the first failure promptly for debugging; normal runs shrink.
- Shrink path: add `--seed <recorded-seed> --path <recorded-path>` with the same fast-check/generator version.
- Durable replay: `--replay <counterexample.json> --no-mutants`; JSON is stable when seed paths become stale.
- Set `CHROMIUM_PATH` for the installed Chromium executable. `--output` must name a fresh directory.

Each failing campaign saves the minimized JSON history, seed, shrink path, shrink count, invariant and
actual/expected observations, and replays it in a new native context. An irrelevant suffix after the first failing command is removed
and rechecked separately; the recorded shrink count/path still describe fast-check’s reduction. A mutant counts as detected only
when the shrunk history repeats a property failure and the same JSON passes on unmodified production.
Harness exceptions/timeouts never count as detected. The current mutants search the full history grammar. The checked-in corpus holds selected minimized
histories as baseline regressions; mutation counterexamples do not claim production bugs.

## Limits

Generation one with generated-code factor unlock and synthetic required identity/creation checks only.
The two sessions share one renderer; renderer death kills both. Browser process death, power loss,
cross-tab storage-event races, real quota exhaustion, full genesis/clear, ordered editor admission,
Account authority, generation/key retirement and migration remain covered by other work or owed.
Payloads are small; this does not assess large-state memory, streaming or latency. One recorded Chromium
host is not the supported-platform population. Unit tests check the oracle's sensitivity, including pending
delete loss, and generated string-model consistency; native histories run in the separate browser command.

## Compaction correction found by generation

Cross-client partial-update histories exposed a production recovery failure in the selected Yjs merge
construction. Even after all missing source updates arrived, a merged partial union could leave text
unintegrated; replaying its original update records recovered it. The checked-in partial-cross-client-merge
corpus isolates four source edits and a three-record partial union. Compaction now validates integration
completeness and returns `retained` without reserving, publishing or deleting while content structs or
deletions are pending. It retries from disk on a later call. Malformed bytes still refuse; the journal
remains independently authenticated. The generated end-of-history check proves compaction resumes after
its complete basis is persisted. This is a conservative maintenance restriction, not a Yjs library fix.

The [phase-three Yjs wake-up repair](./yjs-delivery.md) now recovers the saved partial-merge corpus, including
all later basis updates. The old incomplete-merge mutation is retired from this semantic property battery:
it no longer represents the saved data-loss defect. The directed content-trim suite still detects that
mutation as a violation of the unchanged `retained` policy for incomplete disk unions. Expanding compaction
policy remains separate work; the historical phase-twelve evidence retains its original scope.
