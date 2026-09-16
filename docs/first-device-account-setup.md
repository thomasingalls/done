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

## Upgrade an existing preview after integrating the backend

The first-device preview creates service schema 5. The enrollment/successor backend at
`192d2a12` creates schema 7 and requires explicit offline migration of an existing database.
Normal preview startup never opts into migration; it reports the upgrade command instead.

1. Stop the running account preview before starting the merged code.
2. In the merged checkout, set the **original absolute state directory** and original port.
   `.dev` is ignored by Git, so changing worktrees does not carry that state along.
3. Run the upgrade once, then start the preview with those same settings:

   ```sh
   export ACCOUNT_SETUP_STATE=/absolute/path/to/original/checkout/.dev/account-setup
   export ACCOUNT_SETUP_PORT=53210
   node scripts/upgrade-account-setup.mjs
   node scripts/dev-account-setup.mjs
   ```

The upgrade validates the existing authority/key/pin and refuses missing state, changed origins,
newer schemas, or a running preview. It takes a SQLite-consistent backup of both databases,
including committed WAL pages, plus the unchanged operator key and pin, under
`$ACCOUNT_SETUP_STATE/backups/schema-<old-version>-<suffix>/`. The directory is private (0700),
its snapshot files are private (0600), and the preview's existing file-serving deny rule covers it.
A `manifest.json` marks a complete pre-upgrade backup. Migration then uses AccountCore's existing
transactional upgrade; a failure leaves that backup available. It does not regenerate authority,
re-register the passkey, or touch browser storage. Keep the same browser profile and localhost URL.

The target version comes from the running checkout's AccountCore. Running this command before
the backend merge, or again after a successful upgrade, reports that the schema is already current.
The runner and upgrader share a state-directory lock; the upgrader also reserves the pinned port
to detect the older runner. After a forcibly killed process, a stale `maintenance.lock` must only
be removed after verifying that its recorded process and the preview have stopped.

For an immediate rollback before resuming use, keep the failed/upgraded directory for diagnosis,
copy the four state files from a complete backup into a **new empty private directory**, and run
the old checkout against that directory at the original port. Do not overlay old SQLite files onto
a directory containing newer WAL/SHM files. Browser storage is separate from this service backup;
it remains necessary for the original local writing and device factor.

`pnpm test:account-setup-upgrade` checks backups, WAL preservation, idempotence, offline exclusion,
invalid-state refusal and transactional failure. After combining the two branches, the browser
upgrade test uses a separate schema-five checkout with dependencies installed:

```sh
ACCOUNT_SETUP_UPGRADE_BASE=/absolute/path/to/schema-five-checkout \
  pnpm test:account-setup-upgrade-browser
```

Use `7dab01cc` for that baseline. The test creates a disposable account and writing with a virtual
passkey, stops the old service, checks that ordinary new startup refuses schema 5, upgrades to 7,
and verifies every pre-existing database column/row and the authority identity are unchanged.
It then unlocks the retained browser workspace with the original code/passkey/name and verifies
that same account online through the upgraded service. This is a focused integration check,
not a resumption of the release-validation campaign or a physical-authenticator test.

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
