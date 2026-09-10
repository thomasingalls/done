# One-off personal source cleanup

The author requested a DevTools paste helper for the sole development installation. This is an operator
step around the existing authenticated cleanup owner, with one form and no new application route or
persistent UI progress. It does not implement automatic migration of other installations.

Run `pnpm storage:private-cleanup:prepare` in this worktree to build `.dev/private-cleanup/paste.js`.
The bundle is outside `dist/`, absent from ordinary app builds and worker precaching, and contains no
personal files or factor. Copy that file's contents to the clipboard, for example:

```sh
pbcopy < .dev/private-cleanup/paste.js
```

At the original origin/profile, keep old sync disconnected and other done tabs/windows closed. Lock the
current Local workspace, paste the helper into DevTools, then select the original saved recovery packet
and binding and enter the existing device-lock code. Choose **Clean up source**. The saved files are read
locally. The factor is not put into console history, logs, a URL or browser persistence. Browser string
memory is not claimed to be forensically erased.

The helper runs its bundled dependencies in an isolated same-origin blob frame and places its form in
the locked app. It makes no server request for code or recovery files. The packaged worker remains in
place. The author, rather than the presence of a worker registration or a source digest, supplies exclusion
of nonparticipating old executables. Existing cooperative Local writers still block the exclusive permit.

File verification, retained claim authentication, selected-destination database/journal replay, exact source
fingerprints, deletion progress and terminal verification are the existing private coordinator/cleanup
operations. The helper cannot enroll, import or select a new destination. A wrong code or changed source
refuses; a corrected code can be retried. Closing waits for outstanding storage effects to settle under
the owner before disposing its frame. After interruption, use the same files and factor again.

Success removes only the authenticated legacy database, journal and ancillary entries. Modern encrypted
journals, the selected Local workspace, external exports/backups and the old relay file are retained.
Close the helper, unlock, and verify writing. Actual personal completion is recorded only after the author
runs it; the native rehearsal alone is not that result. This cleanup is for the migrated first device.
The other pre-encryption device will join the new workspace separately without importing its old writing.

The helper rehearsal seeds a selected import, adds later writing, checks wrong-factor source preservation,
retries with the right factor, verifies source absence and exact modern-journal preservation, then reopens
the ordinary editor. The [run record](./storage-conformance-runs/2026-09-10-app-upgrades.md) preserves evidence.

## Personal result — 2026-09-10

The author reported that cleanup completed successfully, closed the helper, and then unlocked the
encrypted workspace with all writing still present. The exact completion text was not retained. This
records that observation; it does not claim an independently captured personal storage census.
