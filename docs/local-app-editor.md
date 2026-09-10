# Admitted Local editor

Both application entries now open the factor-gated Local lifecycle and hand its verified workspace to the
existing editor UI. The active UI no longer opens the legacy Store or writes directly to a Y.Doc. Read
snapshots supply cards, membership, archive text, actors, preferences and history availability. CodeMirror
uses the existing admitted text surface; semantic operations use workspace commands.

The connected surfaces are Goals typing/paste/copy/separate removal; card typing, split, merge, move,
remove and reorder; Done compose; stale-card actions; unfiled placement; undo/redo; and identity/preferences.
Retained legacy archive Markdown remains readable in frozen days and exports. Unfiled bodies are static
until filed, because the existing admitted card surface requires live membership. Navigation, gestures,
panel geometry, breadcrumbs and static/live card rendering retain their existing controls.

Visible editor text and card lists project accepted work. Under storage pressure, compose retains its
unsubmitted draft and suppresses duplicate submission until its command settles. Other pending input is
owned by admission and has a status notice with retry/discard. A refused or no-op command reports a failure
without pretending that it changed content. Lock and carrier invalidation destroy mounted editors before
retiring the workspace; reopening requires the saved factor and authenticated replay again. These statements
use the existing admission durability boundary, not a new OS/power-loss or forensic-memory-erasure guarantee.

Preferences use an explicit Save action and await each changed command. They are separate operations, so a
failure can leave earlier fields accepted; the UI reports success only after all changed fields finish.
The device display label lives in encrypted metadata under the existing Local device ID, is nonempty and
bounded to 80 characters after trimming, and does not change credentials. Actor, device-label and rollover
metadata retain the existing exclusion from content undo. No plaintext identity cache is restored.

The menu exports the accepted workspace through the existing readable Markdown ZIP exporter and exposes
explicit Lock, Undo and Redo controls. This is a recovery export, not a factor backup or authenticated
migration source packet. Local has no attached relay; the old relay configuration UI is no longer reachable
from this entry. Account/transport integration remains a separate phase. No new automatic trim/archiving
scheduler was attached here.

[Preserved evidence](./storage-conformance-runs/2026-09-10-local-app-editor.md) includes the generated
whole-line deletion counterexample, a native copy/remove selection regression, generated compose/history
sequences, storage refusals, cold reopen, geometry/workflow and packaged offline cases. The older native
editor/workspace/pending-projection campaigns also pass against the integration. This is bounded application
evidence, not completion of the encrypted-store conformance matrix or independent review.

The next bounded phase is a rehearsal of the private capture/recovery/import/selection procedure, followed
by the author's personal cutover with the author operating the browser. The existing backups remain the
recovery basis. No personal source, origin, browser profile, import selection or cleanup changed in this
editor phase; automatic migration-host research is not resumed.

The subsequent [private page and rehearsal](./private-migration-procedure.md) now exercise that import,
restart, selection and editor handoff using synthetic source. The author's browser cutover remains next.
