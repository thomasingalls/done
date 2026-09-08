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

Typing and card/Goals paste use the existing Markdown commands. Paste slices preserve surrogate pairs,
contain at most 1000 UTF-16 units and share one undo step. The 16 KiB encoded-delta guard remains. Large
structural/bulk, deletion, formatting or undo commands can exceed it and block visibly; general large-command
slicing remains owed. Native composition/device acceptance and layout-dependent editing shortcuts remain
the phase-six gates. This checkpoint mounts real Goals and card editors in the browser harness; the
application React card/day controls and startup have not yet switched to this facade.

`connectWorkspaceChannel` exchanges accepted snapshots when a same-origin tab joins, then accepted
updates. Both directions of the handshake are needed because a tab's initialization can precede its
channel creation and become a dependency of later updates. All received bytes enter the ordered durable
receive path. The namespace includes slot, principal and workspace. It is coordination for participating
tabs, not Account envelope authority, reliable network delivery, old-writer exclusion or arbitrary
snapshot-size support. The owner enforces its receive queue budget; refusals reach the required error
callback. Snapshot traffic is not a coverage/trim certificate. Close/repair shuts down the channel.

`node scripts/workspace-admission/run.mjs` runs isolated Chromium schedules and named source mutants.
The runner freezes all production source and hashes source, fixture, contract and guide inputs. It uses
real IndexedDB completion/abort, synchronous encrypted journalling, native crypto gates, mounted
CodeMirror and renderer crashes. Enrollment identities and receive validators are synthetic. Evidence
is limited to the named schedules on one Chromium/macOS host, not OS/power-loss or the complete protocol.

Full startup/classification/clear and scoped identity onboarding, exact trim, legacy migration/cutover,
Account verification/discovery, factor/platform population, generation retirement/reference rules and
independent review remain separate work. No destructive coverage shortcut is introduced here.
