# First-device account setup — private product preview

2026-09-16. Branch `codex/first-device-account-setup`, based on integrated product merge
`d942cd1c`. This is the first-device product track alongside second-device enrollment preparation.

## Try it

Run `pnpm dev:account-setup`, then open
`http://localhost:53210/`. The private URL `/private/account-setup.html` and
`/local.html` use the same account entry in this development server.

Create a disposable Local workspace and save its device-lock code. Add some writing, then choose
**Menu → Connect this workspace**. The flow closes the Local editor before acquiring promotion
ownership, asks for a name and the existing device-lock code, creates and confirms a real browser passkey,
generates and confirms the recovery code, and promotes the same workspace through the existing
genesis, admission and index-handoff owners. It opens the first-device Account editor afterward.

From **Use another account**, the chooser also offers **Create a new account**.
This creates a separate empty workspace with its own confirmed device-lock code,
passkey and recovery code. Each completed account appears in the saved-account
list with its name and generated ID. An unfinished new account can be resumed;
choosing it never replaces the previous account's writing.
The welcome screen's **I already have a workspace** action opens this same chooser.

This origin is separate from the author's daily installation. Passkeys created here belong to the
localhost development relying party. The ordinary app's Account entry points remain inactive.
The preview says that device sync is not enabled; its editor does not start a delivery driver.
No second-device API, wire format or service implementation is changed by this track.

## Ownership and retained state

- A dedicated Web Lock owns the setup UI across idle screens, browser ceremonies and editor use.
  Another tab cannot replace its pending attempt. Closing the tab releases the lock.
- The additional IndexedDB database `done.first-device-setup.v1` retains only service/slot selectors,
  display names, a retry capability, registration progress and the exact public WebAuthn response awaiting delivery.
  It grants no workspace authority. Existing factor-verified promotion and Account startup owners
  recheck the source, pin, account, signed records and local passkey before exposing writing.
- The original Local promotion retains its `current` UI record and legacy recovery key.
  Additional accounts use random slot IDs, separate UI records and opt-in per-slot recovery
  records. Their empty sources are created through the existing factor-confirmed Local genesis
  owner before promotion. The profile-wide setup and recovery locks remain in place.
- Registration proof bytes are committed before submission. Recovery confirmation and activation
  continue to use their existing durable owners. Lost replies retry those same operations.
- Device-lock and recovery codes stay in memory; neither is added to the new progress record.
  A recovery code is shown once. After a reload, the user must enter their saved copy. Before
  promotion starts, an unsaved recovery draft can be abandoned through the pinned service owner.
- Lock/page exit retires editors, aborts ceremonies, drains the current operation and releases the
  workspace before another setup owner starts. Reopening a connected workspace verifies its local
  passkey and device factor without requiring an online account session.

The dev runner binds only `127.0.0.1`, checks the exact localhost Host/Origin, and requires its private
adapter token on API requests. It retains the service databases, authority pin and operator wrapping
key in ignored `.dev/account-setup` so a restart keeps the same service identity. Vite cannot serve
that directory or SQLite/key files. These are local development credentials, not production key
provisioning or account-session infrastructure. Keep the same port and state directory on restart.
`ACCOUNT_SETUP_PORT` and `ACCOUNT_SETUP_STATE` allow separate disposable test services.

## Evidence and limits

`pnpm test:account-setup` runs focused Chromium browser tests with disposable contexts and virtual
authenticators. Twelve cases pass: existing writing/identity/name preservation through recovery reload,
wrong code, lost activation reply and offline Account reopen; idle-screen two-tab exclusion; private
API and file refusal; wrong local factor and lost registration reply without an extra passkey; and
abandonment of an unsaved recovery code with unchanged Local writing; wrong-factor/cancelled-passkey
daily unlock and offline retry; naming an older preview account plus remembering later name edits;
same-name account selection with distinct IDs and a lost verification reply; and cancelled discovery
or selection of the saved account followed by ordinary local unlock; creation and offline switching
between two accounts in one profile with isolated writing and factors; and leaving/resuming a new
account before code confirmation without duplicating the draft or changing the original account.
The homepage welcome route also completes first-account creation and reopens the
same account through all three preview entry URLs.
The native recovery regression checks separate new-slot progress, unchanged legacy progress and
continued account/workspace binding refusal.

The two affected Local startup regressions pass. Typechecking, scoped lint/format, and an isolated
ordinary-app Vite build pass; the build retains the existing large-chunk warning. These focused checks
do not resume the release-validation campaign or establish physical-authenticator/browser coverage.

The [daily account access increment](./daily-account-access.md) adds the initial name, account identity
in the menu and remembered name/ID at unlock, plus a discoverable alternate-account verification screen.
Opening an account created elsewhere still requires device linking. Continue the hands-on
product pass one screen at a time. Activating the welcome screen's primary create button, production
sessions/provisioning, sync and second-device admission remain separate work.
The existing owners currently ask for several distinct passkey assertions
during setup; any later reduction must preserve their separate operation-bound proofs.
