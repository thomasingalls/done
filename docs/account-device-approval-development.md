# Two-device approval development walkthrough

2026-09-16. Experiential product checkpoint after signed `46694766`. The operator explicitly
replaced the broader C/D qualification plan with one usable development path and focused checks.
Release validation remains paused; no campaign, mutation controls or inventory refresh was run.

## Try it

The dedicated preview is available on **https://mbp.tail0e0d4.ts.net:8443/** inside the tailnet.
It has dedicated development state. Port 443 and the existing service routes are unchanged.

1. On the first device, open the preview, choose **I already have a workspace**, then
   **Create a new account**. Save and confirm its device-lock and recovery codes, and create/use
   its passkey. Use a passkey that the second device can use, either synced or through the
   browser's cross-device passkey option. Add a little test writing.
2. Open **Use another account** from the editor or unlock screen. In the account chooser,
   choose **Use another account** to open **Connect devices**. Under **Invite another device**,
   click **Create invitation for [name]**, enter its device-lock code, and choose
   **Unlock and get invitation**. This navigation does not ask for a passkey.
3. Copy the invitation link to the second device, with Tailscale connected. Open that link, or
   follow **I already have a workspace → Use another account** and paste it under **Use an invitation**;
   choose **Prepare this device**, save/confirm its separate device-lock code, then use the
   account's passkey. Save this device's code in a separate, clearly device-labeled password-manager
   record or field; do not overwrite the first device's code. This is the same account with a
   different local unlock code. Existing writing on that device is not imported or replaced.
4. Keep both pages open. The new device displays five characters. Type them on the existing
   device and select **Compare and approve**. Both screens report **Device approved**.
5. Stop there. This checkpoint ends at durable approval. It does not deliver a content key,
   certify a second reader, open writing on that device, or enable sync in the first-device preview.

Only a connected account can create an invitation. If this browser has only a local-only
workspace, open it and choose **Connect this workspace**, then finish the passkey and recovery-code
setup before step 2. The invitation screen explains this prerequisite when no account is ready.

On a shared computer, **Use another account** is also available from the local-only editor and
its lock screen. The chooser offers **Create a new account** for another person and
**Open local-only workspace** to return to the existing Local writing. Choosing the local-only
workspace does not start account promotion.

The preview's root `/` always opens the splash, including after refresh with a saved account,
Local workspace or unfinished setup. **I already have a workspace** opens the chooser. Under
**Saved on this device**, accounts and retained setup appear alongside **Device connection**
entries identified by their full workspace ID. Select a connection and enter that device's lock
code to resume its verified progress or approval. The chooser does not assert approval while
locked. The private setup and Local entry URLs retain their existing resume behavior.

The preview now uses TanStack Router. Back/Forward navigate within the credential flow;
reloading `/accounts` retains the chooser, and reloading an account or connection route inspects
its saved progress and requires unlocking. `/` still starts at the splash. Back between code
saving and confirmation redisplays the same code within the original unfinished ceremony.
Leaving recovery setup warns before discarding its displayed copy. Leaving unlocked or pending
approval returns to the chooser and closes its owner without cancelling the attempt. Completed
steps are not repeated through history. The [approved navigation contract](./account-preview-navigation.md)
records each screen's destination and the exact secret-lifetime boundary.

For a connection created before this routing repair, reopen its original invitation and unlock
once. The operator approved this one-time step for the development phone. Its verified invitation
is then saved inside encrypted enrollment state, so subsequent resumes need only the chooser and
device code. New attempts retain it with their first encrypted progress write. The saved route
contains no code or approval authority; altered routes and wrong factors cannot open another
workspace's retained approval. No new account or comparison attempt is created by resuming.

Pages poll quietly while waiting, preserving unchanged content and the invitation link for the
current unlocked page. A button action during a poll waits for it to finish and rechecks authority.
**Check again** retries after a connection failure. After closing or
reloading, select the saved connection from the chooser (or reopen the same invitation/account)
and use the saved device-lock code. A saved comparison
result is resumed without another entry. A mismatch, cancellation, comparison expiry or competing authority
stops the attempt; replacement admission is still unavailable in this single-child development
protocol. Do not delete custody to simulate retrying the same credential.

If the initial passkey challenge expires before any proof is saved, **Use account passkey** now
renews that challenge under the same pending device custody. A new retry identity is durably
saved before requesting it, so a lost response resumes the same challenge. A new invitation
is unnecessary. Saved proofs, receipts, admissions and comparison outcomes are not reset.

The invitation authorizes the historical admission proof (including encrypted genesis), not an
account assertion, content key or live read permission. Account admission still requires a fresh
passkey assertion plus the new device's signing-key proof. The existing certified signing key
alone authorizes the comparison result. The service cannot replace either device signature.

## Local development operations

This session's preview uses `.dev/account-enrollment-tailnet`, loopback port **53219**, and HTTPS
port **8443**. Port 53210 was already occupied and its process was left alone. Restart with:

```sh
ACCOUNT_SETUP_PORT=53219 ACCOUNT_SETUP_STATE=.dev/account-enrollment-tailnet ACCOUNT_SETUP_ORIGIN=https://mbp.tail0e0d4.ts.net:8443 node scripts/dev-account-setup.mjs
tailscale serve --bg --https=8443 http://127.0.0.1:53219
```

The preview now defaults to explicit refresh: live updates and their WebSocket are disabled.
Use `ACCOUNT_SETUP_LIVE_UPDATES=1` only while coding, not during a phone walkthrough. Vite's
reconnection reload can erase in-memory code-confirmation steps when a background phone loses
that development connection. This is independent of application locking. Actual page closure,
reload or browser discard still retires the owner and requires unlocking retained progress.

Stop only this preview process and disable only its proxy with
`tailscale serve --https=8443 off`. Do not reset all Serve routes. Keep the origin and state
path when resuming; the service pin and passkey RP are bound to that origin.

Service schema 8 adds one `content_ceremonies` row per workspace for this single admitted child.
Normal opening refuses older schemas. The existing offline preview upgrader now accepts schema 7
as well; no existing personal or preview database was upgraded for this walkthrough.

## Implementation boundary

- The mandatory-factor custody record contains an optional authenticated encrypted approval
  carrier. Removing or replacing it fails the custody MAC. The existing exclusive slot lifetime
  serializes tabs. Existing Account promotion metadata is updated atomically with custody.
- `done/content-approval-state/v1` derives a non-extractable AES-GCM key from the device root with
  empty-salt HKDF-SHA256, scoped to slot and root IDs. Each write first durably advances the existing
  seal reservation. Its 12-byte IV is four zero bytes followed by the big-endian 64-bit reservation;
  AAD binds the domain, slot, root and sequence. An aborted save burns the reservation and retains
  the prior ciphertext. The existing `2^32` budget applies. Raw plaintext buffers are erased.
- The carrier retains the local nonce, exact enrollment proof, commitments, reveals and terminal
  signed outcome. Both signed commitments are saved before preparing a reveal; a signed reveal is
  saved before sending. A syntactically valid comparison commits its outcome before publishing
  it or sending the decision. Neither entered text nor the derived SAS is stored.
- Service requests use `done/enrollment-ceremony-relay/v1`; existing-device invitations use
  `done/enrollment-ceremony-invitation/v1`; fresh nonce-bound bootstrap responses use
  `done/enrollment-ceremony-bootstrap/v1`. These use the existing ordered-JSON/domainMessage
  framing. Relay ingress is 16 KiB. Bootstrap ingress is 4 KiB and its historical proof uses the
  existing admission bounds. These constructions remain unqualified; inventory reconciliation
  belongs to later qualification work, not this milestone.
- The service verifies original certification and exact admitted keys, stores first messages
  immutably, rechecks authority/state/custody/time in its SQLite transaction, and accepts one signed
  existing-device outcome. Terminal state and exact retries do not reset the credential's budget.
  Clients independently retain that budget and authenticate peer messages. Unsigned status labels
  do not establish approval or authorize deleting local state.
- Whole-profile rollback, arbitrary successor chains/replacement admission, concurrent approvers,
  certification, content-key installation and default-app rollout are outside this checkpoint.

## Focused checks

- **2 browser cases passed** through the real preview HTTP adapter, independent browser profiles,
  actual WebCrypto/IndexedDB/Web Locks and virtual passkeys: successful enrollment/approval;
  renderer crash with the same reopened code; lost decision reply; aborted comparison write;
  committed mismatch and reopening without another guess.
- **5 service cases passed**: ordering, lost acknowledgement/cold reopen, device signatures,
  authority/expiry at commit, abort/concurrent reservation, explicit schema-7 upgrade, signed
  invitation and fresh bootstrap nonce.
- **5 preview maintenance cases**, **2 affected schema-5/6 regressions**, and **6 custody-record
  regressions** passed. Typecheck and scoped lint/format passed. Both pages return HTTP 200 over
  the new Tailscale HTTPS route. The operator subsequently completed the physical-device trial
  after the navigation, development reload and expired-challenge repairs recorded in completed.md.

The first UI run caught a candidate comparison dependent on property order; parsing to the
canonical candidate fixes it. Crash-test failures came from awaiting the CDP crash command and
trying to reuse a crashed target; the test now waits for the crash event and opens a new tab in
that same profile. These are focused implementation checks, not qualification evidence.

```sh
pnpm test:device-enrollment
node --test --test-timeout=30000 test/account-ceremony/development-service.test.mjs
node --test test/first-device-upgrade/state.test.mjs
node --test --test-name-pattern=schema test/account-enrollment/core.test.mjs test/account-successor/service.test.mjs
pnpm exec vitest run test/custodyRecord.test.ts
pnpm typecheck
```

## Operator outcome and follow-up notes — 2026-09-16

The operator reports successful two-device approval over Tailscale, but found the process messy.
This is the experiential checkpoint's outcome, not qualification or evidence of content transfer.
Implementation pauses for use and discussion; these notes do not start another phase.

- **Visible polling jitter.** At the trial, every 2.5-second refresh used the foreground action's busy
  state, inserts/removes a status paragraph and disables/enables controls. The inviting device also
  generates another signed invitation link on each refresh. These are code-level sources of churn;
  their relative contribution on the physical phone was not traced. Proposed first repair: stable
  invitation presentation, quiet background progress and preservation of layout, focus and input,
  while retaining serialized operations and durable transitions. Switching transport alone would
  not fix those UI behaviors. Vite's disabled live-update WebSocket was a separate reload channel.
- **Event delivery.** The operator wants a scalable alternative to continual polling. A future
  service notification layer could wake an authenticated read over WebSocket, SSE or another
  chosen transport, with Redis-backed fan-out if the hosting design calls for it. Notifications
  must not become approval authority; missed events and reconnects still need durable catch-up.
  No transport or Redis architecture is selected or implemented by this note.
- **Password-manager guidance.** Before saving the second device's code, explain that it belongs
  in a separate device-labeled record or field, not over the first device's code. Example labels:
  `done — laptop unlock` and `done — phone unlock`. The account passkey and account recovery code
  have different scopes; the short comparison code is temporary and is not saved. The walkthrough
  and application's save-code screen now include this guidance (2026-09-17).
- **Reduce ceremony overhead.** Candidate improvements include recognizable device names, carrying
  an already unlocked authorized session into invitation creation through an owned handoff,
  invitation QR/deep-link routing, automatic safe progress and explicit instructions about which
  device acts next. A routing QR would not replace the typed comparison. Group instructions by
  task and show only the credential needed now. These are proposals, not implemented behavior.
  Keep save confirmation, authenticated comparison before key release, and restart/retry authority
  checks. Combining or removing cryptographic factors is a separate design change: current custody
  requires a generated device code, with PRF only an additional seal (TRD §13.3/row 13).

The 2026-09-17 bounded pass makes polls quiet, preserves unchanged view state and keeps one signed
invitation per unlocked owner. Each bootstrap retains its fresh nonce and authentication. User
actions wait behind an in-flight poll rather than being discarded or running concurrently;
failures still stop polling and expose the existing manual retry. The five focused browser cases
pass, including queued approval, peer cancellation, stable selection/layout, and existing crash/
retry checks. Typecheck, scoped lint and formatting pass.

The operator explicitly wants consultation before product decisions. Navigation, step structure,
unlock prompts, credential roles and transport are unchanged in this pass. Device names, invitation
QRs, session handoff and fewer prompts need operator input before implementation. Content-key
delivery, installation and certification remain future work, followed by content bootstrap and
multi-device writing. Release validation is still paused.

The operator subsequently clarified and authorized the root/chooser navigation described above:
root always opens the splash, and saved connection/progress entries belong in the chooser. This
follow-up is implemented. Ten focused browser cases pass across the initial run and targeted
root rerun, including pending/approved resume, the accepted one-time old-invitation repair, wrong
factor/altered route refusal, Local and multi-account preservation, and existing crash/retry cases.
An initial test refreshed before new-account draft creation completed; it now waits for the setup
screen before testing restoration. Typecheck and scoped static checks pass. Other product choices
remain open; no qualification work was resumed.
