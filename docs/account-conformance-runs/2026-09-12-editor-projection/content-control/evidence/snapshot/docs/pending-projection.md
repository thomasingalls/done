# Pending document forks and projection consistency

Core repair phase 2 preserves runtime Yjs pending state through private draft/history forks and projection
startup. It does not change the wire encoding, stored records, compaction rule or transport protocol.
[Core repair phase 3](./yjs-delivery.md) adds the separate pinned-library delivery and donor-handoff repair.

The pinned Yjs v13 encoder normally merges pending bytes into an integrated snapshot. Reapplying that
snapshot can change the pending missing-clock map. `forkDoc` instead encodes the integrated store through
a detached read-only encoder view and copies pending struct bytes, missing-clock entries and pending
deletion bytes separately. No source field is temporarily removed and no source buffer/map is shared with
the new document. A runtime history fork also retains its existing undo stacks and redone-link handling.
This is an internal runtime copy, not a new persistence or archive format.

Admission exposes an owned detached `fork()` for initial projections. It never lends canonical state.
Workspace and standalone Goals owners use this path rather than round-tripping the pending wire snapshot.
Every local or remote accepted transition checks projection consistency before notifying views or sending
local updates. The check includes integrated clocks/deletions, normalized integrated content, exact pending
bytes and the missing-clock map. Visible text and integrated state-vector equality alone are insufficient.
Normalization discards differences in deleted content retained only for runtime undo and Item splitting.

An unexpected mismatch reports `projection-mismatch`, closes ordinary owner access and preserves durable
records. Startup classifies it as unavailable / runtime-projection-mismatch, not persisted corruption.
This does not authorize rewriting, clearing or repairing carriers. A later fresh open constructs a new
projection from accepted records; no silent reset of the user's active undo history is attempted.
If a projection listener closes the owner during admitted initialization, that failure survives the
subsequent cancelled durability barrier and remains distinguishable from user cancellation.

The check scans and copies document state after each accepted transition. This phase establishes the
bounded correctness change, not a working-set bound or input-to-paint performance pass. The pinned encoder
read view, pending-store fields and undo internals must be reevaluated on a Yjs upgrade.

## Verification

`test/pendingProjection.test.ts` holds the saved draft/history counterexamples, detached pending buffers,
content/deletion negative controls and 500 generated fork/delivery histories. Arbitrary original framing
could strand in the unpatched library. With the pinned wake-up repair, all generated orders now also own
the complete external-string recovery oracle.

The native suite freezes production and harness bytes and uses actual factor custody, IndexedDB,
localStorage, Web Locks, workspace/Goals owners and CodeMirror. It covers pending recovery startup, later
dependency delivery, pending local pressure/abort/retry, a renderer death after local promotion and
controlled projection-event omission. That omission changes only the projection event; persisted originals
must survive and a fresh projection must recover. Generated histories interleave original remote delivery
with local settings and text input, then require human undo to remove only that local text. Editor/export
are compared against an external source-string oracle when the
original replay completes. Original replay and runtime-fork observations remain separate from claims about
the library's arbitrary-order semantics.

Six current focused mutations remove pending structs/deletions, omit workspace/Goals
checks, ignore content differences despite equal clocks or mask initialization's failure. Detection requires a named assertion, not an
unexpected exception or timeout. Native generated failures save their input history without shrinking;
the unit fork property supports shrinking. Chromium on one macOS host is not platform acceptance.
The report also pins the installed Yjs runtime and the encoder/store source used to assess its internal
read view. `--replay path.json` accepts a saved `{ "history": ... }` record and repeats that native history.

```sh
node scripts/pending-projection/run.mjs --runs 100 --output test-results/pending-projection/new-run
node scripts/pending-projection/run.mjs --mutant drop-pending-structs --output test-results/pending-projection/new-mutant
node_modules/.bin/vitest run test/pendingProjection.test.ts
```

Use a fresh output directory and set `CHROMIUM_PATH` if needed. `--case` selects one named case. Mutation
IDs are defined in the runner. The old `serialize-startup` control is retired: it survives after the phase-three library repair because
serialized pending startup now completes. Its phase-two failure remains historical evidence, not a current
fault claim. Exact runtime forks and publication checks remain the production policy. Migration still
requires its separate preparation and acceptance gates.
`storage:projection` joins the project check chain after the existing workspace suite.
