# Personal application update to 17d87c2

The compatibility phase is signed as `17d87c23fe888ed577b558002c3bf94bca4cad98`. This package also
includes `14901a5`'s waiting-worker policy and update notice. Its content/custody formats match the
currently used package; the update requires no import, new device code, recovery-file upload or cleanup.

## Prepared release

The production package was built from the clean signed source into `.dev/releases/17d87c2/app` in this
worktree. `.dev/releases/17d87c2/build.json` records the source commit and every generated file hash.
The currently served `dist/` remains intact as the compatible predecessor. The build and server stay
in this worktree/Codex session, as requested; no daemon or external deployment is installed.

The packaged test runner now accepts `LOCAL_STARTUP_PREVIEW_ROOT` and `LOCAL_STARTUP_REPORT`, so the
exact candidate is checked without replacing live `dist/` or overwriting a prior report. Three native
cases passed for this package: exact file/HTTP parity and encrypted creation, edit, lock and cold reopen
while offline at both entry points. Budget and origin isolation passed. The previous phase's two-build
campaign also covered update waiting, actual predecessor handoff, crash recovery and compatible rollback.

## Operator handoff, one step at a time

1. The author locks the workspace and closes all done tabs/app windows, then confirms they are closed.
   Previous confirmations from the earlier migration/offline exercise do not stand in for this one.
2. Switch the existing loopback preview on port 8082 to the complete candidate directory. Keep the HTTPS
   origin and Tailscale route unchanged. Verify the served worker, HTML and every precached asset against
   the candidate hashes. If serving fails, restart the intact predecessor; no data-format rollback occurs.
3. The author opens the same URL normally. The predecessor worker may serve one last cached load while
   the new worker installs. The old app does not yet contain the new update notice. Allow installation,
   then close all done windows/tabs again and reopen normally if the old version is still shown.
4. Unlock with the existing device-lock code. Check writing and the **Version** value `17d87c2` in the menu.
   Verify a small new edit survives lock/close/reopen. Guide these observations separately rather than
   assuming an HTTP byte check proves what is running in the personal browser.
5. Perform the cached offline check if needed for this handoff. Keep normal reopening distinct from a
   forced reload that bypasses the worker. Record the author's actual observations before declaring the
   personal update complete.

The account/sync [prep](./account-sync-prep.md) is separate from this package handoff. Relay remains off.
