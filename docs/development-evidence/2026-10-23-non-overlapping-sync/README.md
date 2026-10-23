# Non-overlapping linked-device sessions — 2026-10-23

Bounded phase54. Signed source77669ec79f78779d77e500d0f163c0299156b968 follows the
committed37–53 UX sequence. This phase adds regression coverage and evidence only.
The PRD§2.4 explicitly includes devices never online at the same time. Ordinary linked
account sync is expected to retrieve server-retained encrypted writing independently
of the sender’s live session. Pairing is a separate ceremony and may overlap.

## Exact test and outcome

The two cases reverse creating-device/enrolled-device roles. Each uses the existing
packaged-account browser convention: two isolated Chromium contexts with their own
IndexedDB/service-worker installation and virtual passkeys, plus real packaged frontend
and loopback session/membership API. No existing browser profile, real account or
Bitwarden vault is used. Enrollment is the only overlapping writing-session setup.

1. Require the sender idle and record its verified accepted position. Close every receiver
   page and disable that context’s network before making a new unique writing change.
2. Capture the exact submit request and binary accepted response. Bind workspace,
   credential, position, epoch and digest. Independently read the server SQLite database
   through a read-only connection; require exactly one matching committed submission
   and response byte-for-byte. Require the client’s verified accepted frontier to match.
3. Close every sender page and disable its network. Restart the API on its retained
   state while neither device has an open page, ruling out sender state and volatile
   server queues as the delivery source.
4. Open/unlock the receiver offline from its installed shell. An uncached POST must fail;
   existing writing must be present and the new marker absent. Restore only the receiver’s
   network and require the new writing within the existing-style20-second functional
   assertion deadline, with the sender still closed.
5. Close/reopen the receiver offline again and require the new writing from durable
   local storage. No test-only durability flush or plaintext-import shortcut is used.

Both directions pass twice after instrumentation corrections. The final clean command
also runs the existing offline/API/application-restart and remembered-session journeys:
**4 passed, no retries/skips**. Ten inventory tests, TypeScript, build, budget/origin
isolation, focused lint and formatting pass. Build identity hashes all110 emitted files.

The observed catch-up was about1.8 seconds per direction in these small local runs;
this is an observation, not a distribution, mobile benchmark, new speed guarantee or
replacement for the separate2.5-second contention acceptance gate.

## Sensitivity controls and preserved failures

Temporary copies of only the new spec withhold either upload or download. Withholding
upload fails at the required acceptance wait. Withholding download fails at the required
receiver marker assertion after upload verification/restart. Both controls use unchanged
assertion deadlines and their source/reports are retained. The copies were removed;
production code and every pre-existing test remain unchanged.

The initial run hit unavailable Chromium response-body capture and a gateway shutdown
 timeout. Response capture now follows the existing route.fetch/fulfill convention, and
both disposable contexts close before service shutdown. Two subsequent runs caught an
invalid emulator assumption: network denial left navigator.onLine=true in the new page.
A separate uncached POST failed, proving transport isolation; that proof replaces the
hint assumption, and the hint is retained as an observation. This intentionally exercises
network failure while the connectivity hint remains optimistic. It does not claim a
physical airplane-mode/browser online-event test. Original failures/source snapshots
remain here and do not count as sync passes.

## Limits and security boundary

These are two isolated profiles in one Chromium process, with new documents and real
browser storage, rather than two browser engines, full browser-process restarts or
physical phones. The API restart is clean, not power loss. A single new Done card and
small history per case do not establish large-backlog performance or OS background
execution. This did not reproduce a simultaneous-online dependency after confirmed
acceptance; it does not establish why the operator experienced delayed propagation or
whether their source writing had finished uploading before suspension.

No authorization, keys, protocol, retention, crypto verification, storage admission,
workspace lifecycle or sync scheduling changes. The acceptance observer reads only
these disposable test databases. No credentials, recovery/unlock factors, database files
or private runtime state are included in this packet. Ordinary browser receive still
performs its production authority/history checks and durable admission.

The planning inventory adds only this required test file and its hash/count; all existing
inputs, dispositions and manifest rows are independently compared unchanged. Its formal
adapter remains unreviewed/uncredited. Qualification stays paused/blocked at892
obligations/348 unresolved. This local functional evidence is not aggregate qualification.

## Reproduction and identity

Normal repository command: `pnpm test:packaged-account non-overlapping-sessions.spec.ts`.
Build the packaged frontend first. The retained scratch configs use Node24.18.0, the
installed Chromium executable and loopback53221/53222; adapt those paths explicitly on
another machine. `reproduction/` retains the final config and exact control variants;
control copies temporarily live alongside the spec so its relative fixture imports work.
Run controls separately with `--grep first-to-second`; each must fail at its stated check.
Remove them before inventory/type checking. Reports are not retried or silently filtered.

`checks/source-identity.json` records source identity and confirms the inspected server,
protocol, account and principal delivery/scheduler paths are unchanged since release
51d8550d. `checks/build-identity.json` records exact artifacts. `process-cleanup.json`
confirms test servers stopped and preview gateway29351/API52585 stayed unchanged.
No preview update, real staging, commit, push, merge or deployment. Patch54 is prepared
for later signing; old37–53 patch files and signed commits remain intact.
