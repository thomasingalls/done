# Local application startup

The bounded entry is `/local.html`, built alongside the existing app. It owns the first explicit `local`
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

An unlocked session shows escaped, read-only export content. Editors and commands are a subsequent phase.
Lock/cancel/unmount/pagehide erase visible codes/content, abort the current lifetime and await native draining.
A late successful open is closed before retry. The UI does not claim forensic erasure of JavaScript strings.
Carrier invalidation removes the preview; restored pages must reclassify and unlock. The service worker
routes `/local.html` to its own precached entry, retaining the existing route for the ordinary app.

The main editor remains on its earlier entry until the admitted editor integration is ready. This entry is
not a migration command or an old-writer exclusion mechanism. In particular, launching it on an origin with
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
