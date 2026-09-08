# Owned retained-workspace startup — implementation phase eight

This checkpoint owns retained-workspace open from the scoped index/carrier census through factor unlock,
authenticated replay and admitted application initialization. `inspectWorkspaceStartup` is a read-only
presentation preflight. `openOwnedWorkspace` repeats classification inside the encrypted carrier's own
shared lifetime, before reading custody or selecting keys. It returns a workspace facade only after
replay and the application initialization content barrier complete. Callers mount editors and connect
transport after a `ready` result. The default React application still uses its earlier store.

## Authority and the census

The required authority callback verifies Local identity or the Account binding under the granted permit.
It receives a detached stored slot; that row is not itself a proof. Account results must match the stored
binding's principal, and Local identity does not substitute an Account binding. Real Local identity
onboarding and wiring the Account verifier remain separate work. This component neither creates an
identity nor fabricates a service binding. The actor supplied to the workspace adapter remains distinct
from principal authority.

The owner reads the requested row in `done.slots`, the exact scoped custody entries in `done.custody`,
the recorded/derived content database, its witness/counter/layout, and its journal namespace. Scoped
unknown control records refuse ordinary open. Selected legacy routing remains on a migration-required
path. When no target route/material exists, the fixed unassigned legacy carrier is checked before an
absence disposition. Unrelated indexed workspaces and scoped custody records do not substitute for or
invalidate the requested identity.

Reads use known names, never `indexedDB.databases()`. Probes abort a new database's upgrade transaction;
they do not create empty metadata as a side effect of looking. All record reads settle at transaction
completion. A cancelled probe closes any eventual connection and its late upgrade still aborts. Database
and localStorage errors produce unavailable/repair dispositions, not absence. A row whose value is
undefined still counts as surviving material. A changed/missing route cannot be bypassed by deriving
around the index.

## Dispositions and recovery

`unlock-required` means the relevant stored framing is structurally consistent. It has not authenticated
ciphertext or metadata MACs. `ready` additionally requires the real custody/content/journal authentication,
complete Yjs replay, supported application schema and admitted actor/schema/repair initialization. A bad
factor or damaged factor seal remains the ambiguous `unlock-failed`; other unreadable persisted carriers
produce `repair-required`. No refused open exposes ordinary editing, export or transport.

`fresh` reports absence of the requested known carriers under the verified identity. It is not a genesis
receipt and this module has no creation/enrollment API. An indexed identity with missing custody, a ready
witness with missing content/counter, surviving material without its index, or protected custody without
a content witness refuses repair. None licenses a replacement root, counter reset or empty workspace.

Structurally consistent custody/content creation intents report `creation-pending`. Resumption still
requires the future cross-carrier creation owner to authenticate those intents and establish all expected
identity/index stages under exclusion. This module does not automatically finish them. Likewise, unknown
scoped rows with clearing/cleared/migrating state tags give refusal-only transition dispositions. Those
tags are diagnostic hints, not validated ClearIntent/transition formats, authority to delete or proof that
clear completed. Other unknown scoped records require repair. No clear, migration or retirement executes.

An interrupted *ordinary open* restarts by acquiring a new lifetime and rereading durable state. The
phase-seven initialization is idempotent/admitted: after renderer death before its final barrier, journal
replay recovers its committed work and initialization can finish before exposing the editor. Cancellation
during a native encrypted read keeps the permit until underlying owned work drains; a stale continuation
cannot publish a ready facade. A preflight result is never cached as authority for a later open.

## Evidence boundary

`node scripts/owned-startup/run.mjs` freezes production source and hashes the harness, contract and guide.
It uses actual IndexedDB/localStorage, Web Locks, crypto, factor-opened carriers, admitted initialization,
CodeMirror/channel construction and renderer crashes. The fixture's enrollment, Local identity and index
installation are synthetic: they prepare retained material rather than implement product genesis. Native
database enumeration is disabled for production paths; fixture inventory uses its separately captured
native method to detect unintended creation/deletion. Transition markers exercise refusal hints only.

Fresh Local/Account genesis and its immutable cross-database intent, identity/index onboarding and safe
mutation lifecycle, verified creation/migration resumption, journal-inclusive clear, exact trim, legacy
cutover, Account receive authority, PRF/platform validation and independent review remain separate work.
Existing nonparticipating index writers cannot be made safe by this reader; the application cutover must
bring lifecycle-changing writers under the shared/exclusive discipline. Runtime history cost, large-command
slicing and native IME/input-to-paint acceptance remain the phase-seven gates. No release debt is paid.
