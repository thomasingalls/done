# Private development migration procedure

This is the operator-assisted path selected in [row 21](./selections/row-21-development-cutover.md) for
the author's sole development installation. The private page at `/private/migration.html` is served by
the Vite development server from this worktree. It is absent from the ordinary production build, service
worker precache, app menu and public application exports. It registers no worker and connects no relay.
The [seeded rehearsal](./storage-conformance-runs/2026-09-10-private-migration.md) and
[personal import/reopen checkpoint](./storage-conformance-runs/2026-09-10-personal-local-import.md) have
passed. The first personal capture refused obsolete day-journal fields; the author permitted omitting
that removed feature, and capture succeeded after the compatibility repair. Original updates retain those
fields in the recovery packet; the durability journal and current writing remain covered. The earlier
Markdown/relay backups remain outside the repository. Newly supplied recovery/export files are ignored
at the worktree root; copies and private verification records were preserved and checked byte-for-byte
beside those earlier backups.

## Operator boundary

The author operates the personal browser. Before any source observation or destination write, editing and
relay sync must be stopped, all other done tabs/installed windows closed, and the old application's service
worker retired **without clearing IndexedDB, localStorage or site data**. Closing the old controlled page
after unregistering its worker releases that page's controller. The utility refuses while it observes a
service-worker controller or registration. It does not unregister workers, remove caches, close windows,
install browser policies or delete source data itself.

The checkbox records the operator's precondition for this sole development client. It is not an exclusion
capability or proof against another old process/profile returning. Keep old clients closed and old relay
transport unavailable throughout the procedure. This deliberately does not revive the automatic host-policy
experiments or assert supported production old-writer exclusion. A worker appearing later blocks the next
utility operation; matching source digests alone are still not an exclusion mechanism.

Use the **same browser profile and exact origin** as the source. A fresh localhost origin cannot see or
authenticate that source, even if it has a copy of the export files. Codex prepares and verifies the chosen
development server behind the existing origin; the author then performs the browser steps. Browser-specific
worker retirement is guided when that step is reached, after server preparation. The author completed
capture, saved-file verification, factor confirmation, import, selection, editor unlock and later-edit
recovery after locking/closing/reopening. The subsequent export comparison preserved all pre-existing writing.
The author then requested keeping the packaged build/server in this worktree and Codex session. After
locking and closing the app, the development server was replaced by Vite preview of `dist/` on the same
loopback port and existing origin route, with relay disconnected. The author loaded the new package online,
confirmed existing writing, and then confirmed cached reopening and later-edit recovery through another
lock/close/reopen while the app server was stopped. The same packaged server is now running again; HTTPS
checks match its app entry and worker to the build. See the
[packaged offline record](./storage-conformance-runs/2026-09-10-packaged-serving.md). At that checkpoint, source cleanup remained
a separate step.

## Steps, one at a time

1. Prepare the pinned worktree's development server at the original origin with relay disconnected. Retire
   the old worker as described above, close its controlled page, and open `/private/migration.html`. Confirm
   the operator conditions and choose **Check this browser**. Do not clear site storage to pass this check.
2. Choose **Capture recovery files**. Save **both** the recovery packet and separate binding file outside
   the browser; keep the optional Markdown preview alongside the existing readable backup. The packet is
   plaintext recovery material and omits ancillary credentials. Its source binding is not a portable
   encrypted archive, a profile restore, or authority to delete anything.
3. Choose **Restart to verify saved files**, re-establish the operator conditions, and select the actual
   saved packet and binding files from disk. Choose **Verify saved files** and inspect the preview. This
   reparses and replays the packet in a fresh private Y.Doc and checks its digest, origin and source binding.
   Hash agreement is integrity relative to the separately saved record, not independent source authenticity.
   The existing owners recheck the live source and retained authenticated state before writing.
4. If the slot is unused, choose **Generate device-lock code**, save the code outside the browser, then
   enter it on the separate confirmation screen. **Confirm and begin import** creates the authenticated
   intent and imports up to eight actions. An existing intent instead offers **Unlock migration** with the
   original saved code; it never offers replacement enrollment.
5. Choose **Continue import** until the authenticated stage is imported. Each invocation is limited to
   eight actions and uses the existing idempotent import owner. After a failure, close/restart, reselect the
   same saved files, and enter the same factor. A missing, changed or unreadable claim is not permission to
   create a new one. A wrong code before the first intent can require a new explicitly chosen ceremony;
   after intent, keep and use the original factor.
6. Choose **Select imported workspace**. The existing selection owner performs cold verification and
   installs the authenticated Local route. **Destination selected** is metadata status, not the end of
   migration or proof of current content recovery.
7. Choose **Open Local editor**, enter the same code, and verify Goals, historical days, frozen dates,
   uncapped imported Next collections and unfiled bodies. Export Markdown and compare its content with the
   recovery preview/known backup. The removed day-journal feature is deliberately omitted. Unfiled provenance,
   card IDs/attribution, preferences and CRDT history have the selected Markdown/system losses. Test a small
   edit, lock, cold reopen and export again before using the new workspace for ongoing writing.

The utility's restart link drains its coordinator and drops visible code/preview. Page closure or renderer
death can leave retained intent; reopen recovers its next step from the existing authenticated records,
not a new UI progress record. Codes, packets, preview and openers are not added to browser persistence.
Claims about memory cover visible removal and owned byte buffers, not forensic erasure of JavaScript strings.

## Stop after verified destination recovery

This phase retains the original plaintext database and journal. It has no cleanup button or automatic
source deletion. The existing authenticated cleanup owner remains available privately, but its actual
source/old-writer preconditions and a separately reviewed operator step still apply. The same saved files
and factor are needed for that maintenance. Opening the new editor can register its ordinary service
worker, so returning to the maintenance utility later requires dealing with that registration again.

The author subsequently chose a [one-off DevTools cleanup helper](./private-source-cleanup.md) instead of
another application ceremony. It uses the same authenticated cleanup owner while the current Local app is
locked, preserves the packaged worker, and relies on the author's exclusion of old executables. Its native
rehearsal passed. The author subsequently reported successful personal cleanup and encrypted reopening
with the writing intact; the exact completion text was not retained.

The author's import/reopen/export check and ordinary packaged cutover at the same origin are complete.
Whole-profile residue testing and cleanup of external backups remain separate decisions. Do not describe the source-retaining checkpoint
as complete encrypted-only custody. Account transport, whole-profile residue, platform/latency evidence and
independent review retain their existing gates. No conformance debt or matrix payment follows from this page.

## Reproduction

`pnpm storage:private-migration` uses a disposable Chromium context and its own loopback Vite server. It saves
and reselects real files, interrupts import with a renderer crash or native transaction abort, resumes
selection, opens the normal editor, compares independently read ZIPs with the external input-string ledger,
and cold-recovers later accepted writing. `test/privateMigration.test.ts` adds 200 generated file/binding
corruptions and 150 generated retained-intent UI histories, seed 8941, plus code and teardown ordering cases.
These properties test the utility boundary with a mocked coordinator; native cases exercise the real owners.
TypeScript includes the private entry. The full check chain invokes the new native suite, but the entire
chain was not rerun for this bounded phase.
