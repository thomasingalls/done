# Two-tab protection and setup investigation

**Signed repair and local preview checkpoint, 2026-10-15.** Runtime source
`fcb659c32116d8af27598bba2fade1ac49cdd0e2` is signed and serves preview 8443. The operator reported that preview `5afdd0ad` still failed in Firefox private
browsing with Bitwarden. Protecting an automatic Local list retires another open tab. That second
tab subsequently accepts the generated code; the original setup tab rejects it even after the other
tab is closed and the original is hard-reloaded. Passkey creation saves a Bitwarden item before the
generic setup error. The retained-state defect was subsequently reproduced and repaired as recorded below.

## Bounded outcome and evidence

Reproduce the shared-storage two-tab transition before selecting a repair. The generated confirmed
factor must continue to open the original Local writing independently of registration failure.
Account continuation must distinguish a failed setup step from factor rejection. Preserve PRD §7.2
and TRD §13.3: external factor required after protection, no persisted plaintext code, no automatic
fallback, authenticated routing, unchanged service verification, and coordinated writer retirement.

The new packaged browser cases open two tabs in one context, protect through the sync entry, leave
the other tab retired or unlock it with the new code, create an authenticator credential, reload
setup, and check the same factor through setup and independent Local reopening. They first run
against the unchanged saved `5afdd0ad` build. Virtual-authenticator outcomes cannot establish the
Firefox/Bitwarden result; a disposable real-provider two-tab walkthrough was required before
claiming the reported issue fixed and has now completed. Only a read-only boolean/stage summary was inspected on the
operator's reported tab; writing, factors and credential bytes were not copied into this packet.

The operator subsequently confirmed that a single-tab attempt succeeds. The failing route is
`/setup/local/confirm-passkey`, with “The passkey step could not finish. Try again. Your setup progress
has been kept.” This narrows the first reported failure to passkey assertion/continuation after
creation. The new cases therefore also perform that assertion before reloading setup.

Existing assertions remain intact; approved fixture changes are recorded below. The previous
full-suite run and approved harness follow-ups are retained in the neighboring functional-suite
packet. Release qualification, merge and production deployment remain paused. This investigation
does not include the separately reported migration/removal flow.

## Discriminating evidence and implementation

The original tab loaded `AccountSetupApp-BQqbzmO4.js`, retained `credential-confirmed` setup with no
pending passkey proof, and had a service pin matching the public POST configuration. Its legacy
recovery record had different account, retry, principal and workspace identities. The first
diagnostic used GET on the POST-only configuration endpoint; its false pin comparison is excluded.
The corrected POST comparison matches. The read-only inspection did not retry setup or change data.

The packaged retained-state regression reproduces the exact generic passkey error on unchanged
`5afdd0ad`. A separate Local tab accepts the generated code and opens the writing; closing it and
reloading setup yields the exact “Could not unlock this workspace” error for that same code. The
four initial unit cases report three failures and one pass before the repair, including a staged
write that recreates recovery progress after its selected setup was removed.

The repair preserves matching current drafts and atomically parks a structurally valid foreign
draft under an account/retry key before saving the current attempt. Changed sources and occupied
destinations refuse without replacement. The selected setup, pin and removal fence guard metadata
operations. Removal cleans its scoped/identified current and retained progress. The claim/custody
factor verifier still decides whether a code is valid; later preparation failures use the retry/Local
continuation state. The existing exclusive writer barrier remains intact and now explains a wait.

Six new unit cases cover foreign preservation, matching legacy resume and context refusal, a staged
write crossing removal, scoped removal, post-passkey error classification, and atomic collision
refusal. New packaged cases cover the retained-state journey and two shared-storage tab schedules.
The initial unlocked-tab test expected immediate progress, observed a held writer permit, and
resumed after closing that tab. That is retained as a diagnostic, not the original generic-error
reproduction. The final test requires the barrier, its explanation and safe progress after closing.

## Actual Firefox and Bitwarden

The approved disposable origin was `https://mbp.tail0e0d4.ts.net:8445`, with new service state on
53242 and frontend 53241. It preserved preview 8443 and its service. Firefox Developer Edition's
installed bundle reports 158.0; the installed Bitwarden extension performed the real ceremonies.
One explicitly approved item, “done — disposable two-tab repair test 2026-10-15”, was created. The
operator directly approved its replacement for the second disposable account; no existing real
credential was changed.

1. Baseline two-tab protection, creation and confirmation succeed with the other tab retired.
2. Remove that disposable Local list through the app and start fresh on the unchanged baseline.
   Create/confirm another actual Bitwarden passkey. The legacy recovery row survives that historical
   removal and causes the exact generic passkey error at `/setup/local/confirm-passkey`.
3. The second tab opens the new Local writing with its unchanged code. Close it, hard-reload the
   original tab, and enter the same code: baseline setup reports the exact invalid-code message.
4. Switch only the disposable frontend to the saved repair build. The same failing setup resumes
   with that original code and displays a new recovery code. Firefox resource inspection explicitly
   observes `/assets/AccountSetupApp-D5oNpqnO.js`; this private tab is not service-worker controlled.
5. Actual Bitwarden assertions confirm recovery, approve encrypted sync, and open the original new
   writing. Lock and reload require the same Local code plus a real Bitwarden assertion; the writing
   remains. No verifier, policy, authenticator or factor fallback was substituted.
6. Leave the disposable account locked, clear live computer-use bindings, stop both disposable
   services and remove only route 8445. The complete pre/post Tailscale route JSON hashes match:
   `e89f043c46877917f1698f0f235c5d2aaed7b51f536e0c63b4516a775d59e537`.

## Current verification and remaining work

All 1,769 unit cases pass with the existing single named skip. The production build, origin and
size checks pass. The affected packaged matrix passes 18 cases, and both existing removal
regressions pass separately. The unchanged recovery campaign passes all 25 cases, including native
IndexedDB, owner exclusion, restart and lost-response behavior. Old test changes are limited to
the operator's explicitly approved census/module-copy/source-list patches; unrelated formatting is
left alone. The regular CI browser step includes all three new packaged cases.

The broad runner recheck passed 288/289 and exposed a stale crypto source census. Its reviewed
refresh adds the metadata helper and updates five source hashes, with all 195 domains unchanged and
no sources removed. The affected registry/gate rerun passes all 87 cases. Inventory/plan retain 843
obligations and 303 unresolved obligations, including the two new browser files. Planning does not
qualify them. The prior full functional run remains red; its other failures are not closed here.
The operator's actual 8443 workspace has not yet been retried on this repair. The repair outcome was appended to
`docs/completed.md` before replacing this active state. [Artifact index](artifact-index.json)
records the retained logs, source/build pins, reproduction patch and non-secret actual-provider
observations. The [approved patch boundary](receipts/approved-old-test-boundary.json) independently
compares every changed old test/harness file with its exact human-approved patches.

These checks use local Node 26.11.1 and the installed dependency tree, with its existing pnpm
patched-dependency warning retained in the logs. CI uses Node 24.18.0. The build's required Yjs patch
check passes; these functional runs do not establish CI/platform or release qualification.

## Signed source and local preview

The first Secretive signing attempt failed without changing the staged patch. The operator authorized
retry, and `fcb659c3` now has a verified SSH signature. Its immutable production rebuild passes all
three new packaged cases without skips or retries. All 466 pinned source hashes still match the
actual-provider candidate. Build metadata changed the setup asset to `AccountSetupApp-BklTor6w.js`;
the actual-provider walkthrough above used `AccountSetupApp-D5oNpqnO.js` before signing.

Only the frontend on 53219 was restarted. Preview
`https://mbp.tail0e0d4.ts.net:8443` serves version `fcb659c3`; its four checked public-file hashes
match the immutable build through the gateway and trusted HTTPS. Backend PID 52585 on 53220,
public configuration and all Tailscale routes remain unchanged. The old `5afdd0ad` build is retained.
The initial probe included a deliberately unavailable source-map URL and failed with 404; the
corrected probe limits verification to public JS/HTML/service-worker files.

The [preview receipt and rollback boundary](preview/checkpoint.json) and its separate
[artifact index](preview/artifact-index.json) preserve the signed rebuild, three-case rerun,
verification scripts and before/after observations. The preview outcome was appended to
`docs/completed.md` before advancing this state. An already open cached client may still need the
app's update action. Original-workspace retry and client adoption remain operator observations;
the broader full suite remains red and general qualification stays paused.
