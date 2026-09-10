# Local application startup

Both `/` and `/local.html` now mount the same Local application. It owns the first explicit `local`
slot and calls `inspectLocalStartup`, generated-factor genesis/confirmation, verified resumption,
`listLocalWorkspaces` and `openLocalWorkspace`. It accepts no URL-supplied identity, factor or ready receipt.
The UI adds no plaintext key, code, actor/device cache or workspace copy to browser persistence.

The code is displayed only while saving it. A separate screen requires entry from the saved copy; a mismatch
writes nothing. Failed/partial creation is classified again and resumes the same authenticated intent.
Legacy, clearing, cleared, closed, conflicting and unsupported states never become automatic fresh creation.
The final open repeats authentication and replay; an earlier inspection is presentation only.

The Local human actor ID is the verified principal ID. Its device label is `local:<principal>` and its default
name is “This device”; these are Local-only attribution labels, not Account/device authentication credentials.
The existing admitted initialization registers the human/system roster inside encrypted content and preserves
an existing actor's name. No `done.actor`/`done.device` localStorage fallback is called. Account promotion and
cross-device identity require their own owner. Network receive is refused and no transport is attached.

An unlocked session mounts the [admitted editor](./local-app-editor.md) with neutral read snapshots and
commands owned by the verified workspace. The device display name is stored in encrypted metadata;
changing it does not change the Local principal or credentials.
Lock/cancel/unmount/pagehide erase visible codes/content, abort the current lifetime and await native draining.
A late successful open is closed before retry. The UI does not claim forensic erasure of JavaScript strings.
Editors are disposed before the owner closes. Carrier invalidation removes the editor; restored pages must
reclassify and unlock. A recoverable admission blockage keeps the editor mounted so pending work can be retried
or discarded. The service worker precaches both entry shells; each mounts the same factor-gated application.

This entry is not a migration command or an old-writer exclusion mechanism. Launching it on an origin with
unassigned legacy storage reports migration-required. The real source remains available and no real data was
used in this implementation's native fixtures.

Validation: `storage:app-startup` drives actual React startup and native encrypted owners in disposable Chromium.
After a build, `storage:app-startup:packaged` tests the precached entry on an offline reload. Unit properties vary
refusal/action sequences and close timing. The directed reentrant-close case exposed an early drain result:
installing the operation/close promise before publishing state fixes it. A second directed test covers
listener disposal when locking during the ready handoff. Packaged controls exposed a missing Local HTML
precache entry and static-host `Vary: Origin` cache misses; both entries now reload offline. The service worker
uses its own build cache and ignores Vary only for its declared static assets and entry shells. These are bounded lifecycle/UI checks,
not completion of full application, platform, copied-profile, crypto-review or migration conformance.

The [startup checkpoint](./storage-conformance-runs/2026-09-10-local-app-startup.md) records the earlier
read-only stage. The [editor checkpoint](./storage-conformance-runs/2026-09-10-local-app-editor.md) records
the subsequent default-entry switch and its additional validation.
