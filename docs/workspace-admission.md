# Workspace command admission — implementation phase seven

This bounded checkpoint adds `openAdmittedWorkspace` above the factor-unlocked ordered owner. One
workspace facade serves Goals text, card text, moves and actor-scoped human content undo. It returns
detached projections, command receipts and accepted export/update bytes. Mounted editors receive a
text surface without authority to close the shared workspace or access a writable document. The
default application still uses its earlier store; this component does not enable an application cutover.

Each queued command executes the existing application rules against a private document and private
undo manager at the admission head. The adapter covers compose, movement/reorder/removal, split/merge,
copy/file, bulk movement, settings, actor registration/update and membership repair. It rechecks freeze
and Next capacity there. Source locations are resolved there; explicit text/split positions are relative
anchors captured against accepted text. A receipt with `value: false`, `null` or `0` can represent an
evaluated business refusal or no-op; it is not a claim that a requested mutation happened. Storage
failure instead blocks the queue with retry/discard pressure and keeps the prepared result private.

The accepted document and runtime human history advance together only with their carrier. Text edits
and structural commands share one history over master, days, cards and cardLocations, matching the
earlier content undo scope. Metadata settings/actor changes are admitted but outside that scope. Bulk
movement, day materialization and membership repair retain separate system transactions and do not
enter human history. Received work commits locally before reaching the projection and is excluded
from human history. Initialization registers the supplied actor, opens the application schema and
repairs memberships through admission, then completes a disk barrier before returning the facade.
This is application-content initialization, not the full Local/Account genesis/index/classification proof.

The private preparation document is separate from the ordered owner's draft: its outer transaction
would otherwise swallow nested system origins. `forkWorkspaceHistory` in the pinned Yjs 13.6.31 seam
copies undo/redo delete sets, selection metadata and local-only Item.redone links omitted by wire
updates. This depends on version-sensitive Yjs internals. It retains deleted content in a gc:false
runtime document until disposal and adds another whole-document clone per prepared command. History
is not persisted; reopening starts fresh history. Disposal is not a JavaScript-memory zeroization claim.
This strategy needs performance/memory and independent correctness review before application acceptance.
The phase-six preparation timings do not measure this extra work or pass the low-end input-to-paint budget.

[Core repair phase 2](./pending-projection.md) now preserves exact pending struct/deletion bytes and
missing-clock bookkeeping separately from integrated serialization, including the initial projection.
After every accepted local or remote transition, the owner checks integrated content and pending state
against canonical before publishing views/export or sending local bytes. A detected runtime mismatch
closes access with `projection-mismatch`, preserving durable records and the original failure through
initialization shutdown. It is not evidence of corrupted storage or authority to clear it. The additional
state scans/copies still need performance and memory acceptance.

Typing and card/Goals paste use the existing Markdown commands. Paste slices preserve surrogate pairs,
contain at most 1000 UTF-16 units and share one undo step. The 16 KiB encoded-delta guard remains. Since
phase 548 (2026-11-12) the workspace adapter keeps every prepared change within it: a compose longer than
14 KiB of UTF-8 creates its card from the first text slice and completes it with text slices in the same
undo step, and any other command whose change would exceed the guard (duplicate, Done for now, merge, split,
copy or move from Goals, Next to Goals, undo/redo, formatting over many lines) completes as a refused no-op
with the result `too-large-for-one-action`, so the queue never blocks on it. One action carries at most
1,048,576 UTF-16 units of text and at most an encoded intent the 4 MiB queue reservation can hold; larger
input is refused before queueing. Native composition/device acceptance and layout-dependent editing shortcuts remain
the phase-six gates. This checkpoint mounts real Goals and card editors in the browser harness; the
application React card/day controls and startup have not yet switched to this facade.

`connectWorkspaceChannel` exchanges accepted snapshots when a same-origin tab joins, then accepted
updates. Both directions of the handshake are needed because a tab's initialization can precede its
channel creation and become a dependency of later updates. All received bytes enter the ordered durable
receive path. The namespace includes slot, principal and workspace. It is coordination for participating
tabs, not Account envelope authority, reliable network delivery, old-writer exclusion or arbitrary
snapshot-size support. The owner enforces its receive queue budget; refusals reach the required error
callback. Snapshot traffic is not a coverage/trim certificate. Close/repair shuts down the channel.
Pending donor serialization and arbitrary original-update ordering remain separate library/transport gates;
the runtime-fork repair does not change this wire protocol or prove those cases safe.

`node scripts/workspace-admission/run.mjs` runs isolated Chromium schedules and named source mutants.
The runner freezes all production source and hashes source, fixture, contract and guide inputs. It uses
real IndexedDB completion/abort, synchronous encrypted journalling, native crypto gates, mounted
CodeMirror and renderer crashes. Enrollment identities and receive validators are synthetic. Evidence
is limited to the named schedules on one Chromium/macOS host, not OS/power-loss or the complete protocol.

Full startup/classification/clear and scoped identity onboarding, exact trim, legacy migration/cutover,
Account verification/discovery, factor/platform population, generation retirement/reference rules and
independent review remain separate work. No destructive coverage shortcut is introduced here.

The [phase-three delivery suite](./yjs-delivery.md) separately tests original-record ordering and pending
channel handoff with the exact-version Yjs wake-up repair. The existing snapshot wire encoding and scoped
channel API are unchanged. Initial and hello-response snapshots retain pending structs/deletions through
receive admission; later missing originals complete without the donor. This does not authorize partial
compaction, migration or a default-application switch.

## 2026-10-12 — Owned Account text specialization

The current Account editor can use [direct text admission](./account-text-admission.md) for a
single plain-text replacement. It computes the update without a workspace fork and persists
before changing canonical, projection or undo. Full equality is established at opening, reference
transitions, received pages and ordinary close; eligible text preserves it through identical-byte
application to unchanged verified private bases. Unsupported or pending cases retain the native
fork/source/replay/full-comparison path described above. Source format and human undo semantics
are unchanged; the full reference remains a build-time oracle and rollback.
