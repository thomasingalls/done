# Two-device approval development walkthrough

2026-09-16. Experiential product checkpoint after signed `46694766`. The operator explicitly
replaced the broader C/D qualification plan with one usable development path and focused checks.
Release validation remains paused; no campaign, mutation controls or inventory refresh was run.

## Try it

The dedicated preview is available on **https://mbp.tail0e0d4.ts.net:8443/** inside the tailnet.
It has fresh development state. Port 443 and the existing service routes are unchanged.

1. On the first device, open the preview, choose **I already have a workspace**, then
   **Create a new account**. Save and confirm its device-lock and recovery codes, and create/use
   its passkey. Use a passkey that the second device can use, either synced or through the
   browser's cross-device passkey option. Add a little test writing.
2. Click **Connect another device**, choose the saved account and enter its device-lock code.
3. Copy the invitation link to the second device, with Tailscale connected. Open that link;
   choose **Prepare this device**, save/confirm its separate device-lock code, then use the
   account's passkey. Existing writing on that device is not imported or replaced.
4. Keep both pages open. The new device displays five characters. Type them on the existing
   device and select **Compare and approve**. Both screens report **Device approved**.
5. Stop there. This checkpoint ends at durable approval. It does not deliver a content key,
   certify a second reader, open writing on that device, or enable sync in the first-device preview.

Pages poll while waiting. **Check again** retries after a connection failure. After closing or
reloading, reopen the same link/account and use the saved device-lock code. A saved comparison
result is resumed without another entry. A mismatch, cancellation, expiry or competing authority
stops the attempt; replacement admission is still unavailable in this single-child development
protocol. Do not delete custody to simulate retrying the same credential.

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
  the new Tailscale HTTPS route. Physical-device/passkey UX is the operator's next check.

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
