# Daily account access — product slice

2026-09-16. Follows the private first-device setup preview. This slice is in progress;
it does not enable ordinary-app account entry or resume release validation.

## Starting product decisions

PRD §§5.1 and 6.1 request a person's name once, at account creation. It is a display
label and remains editable in settings. It is not a login identifier or a name for
a workspace. Later device sign-in does not repeat naming or recovery setup.

PRD §6.8 exposes a selector only when the active person's local slot contains more
than one list. The selector cannot enumerate another person's closed slot. The
current preview promotes one existing list and therefore needs no list picker.

The author chose to show the name on the lock screen. The remembered name is
explicit display metadata outside the encrypted writing, never an authority or
account selector. The encrypted identity remains the source of the displayed
name after unlock; changing the remembered label cannot select a different account.

New setup asks for the name before creating the passkey. An existing Local name
prefills the form. The credential username is the full generated account ID, and
its display name includes the person's name plus that ID. The service-issued user
handle and challenge are unchanged. Full IDs are visible in the account menu and
on the lock screen; matching display names cannot collapse account identity.
It is applied through the existing admitted actor command when setup finishes.
The account menu identifies the person, and name edits are remembered at lock.

Older preview accounts remain openable. An existing named identity is reused;
the old unnamed `You` identity gets one name prompt after authenticated unlock.
This compatibility step neither repeats registration nor changes the credential.
An already-saved passkey may therefore retain the previous `Pending done account`
or name-only label in its password manager. Updating saved browser credential labels after
an account rename is not implemented in this increment.

## Choosing another account

The author selected name plus generated account ID rather than a unique username.
`Use another account` is available on the locked screen and in the account menu.
It closes the current owner before opening a separate discoverable passkey flow.
The choice survives a tab reload. The picker presents saved accounts as clickable,
keyboard-operable rows showing name and full account ID. Selecting a row opens
that account's locked screen. `Use another account` and `Create a new account` are
separate actions below the list. Each account created here has its own selectable
row. Matching names remain distinct through their full generated account IDs.

In this development preview, `/`, `/local.html` and `/private/account-setup.html`
use the same account-aware entry. The welcome screen's `I already have a workspace`
action closes Local startup and opens the chooser. The ordinary build retains its
existing bootstrap; the development server supplies this entry mapping.

The existing service `authenticate` ceremony verifies the chosen account without
restricting the browser to the saved credential. The result must match the returned
credential and its user handle. A lost finish response retries the exact proof in
the live owner. Cancellation or leaving the screen destroys that owner. There is
no account session, relay grant or local-open capability in the historical receipt.

Selecting the saved account leads back to its ordinary factor/passkey unlock.
Verifying an account that is not saved here displays its full verified ID and
explains that its writing cannot yet be linked to this device. Device admission,
key delivery and content installation are still required for an account created
elsewhere. Verification alone does not open encrypted writing.

## Creating another account on this device

`Create a new account` reserves a new random local slot and starts with an empty
list. It asks for a name, generates a separate device-lock code and requires its
saved-copy confirmation, then uses the existing passkey, recovery and promotion
owners. The previous account's slot and encrypted writing are preserved.

The chooser enumerates only the preview's explicit display/progress records. It
does not inspect other accounts' encrypted stores. The selected slot is remembered
per tab; every open still validates that slot's code, signed promotion, account
binding and fresh passkey proof. With several accounts and no remembered selection,
the preview opens the chooser.

One unfinished new-account attempt is resumable from both its row and
`Continue new account setup`. Leaving before device-code confirmation cancels the
in-memory enrollment; returning generates a new code. After confirmation, reload
requires the saved code and resumes the same workspace. Recovery progress for new
slots uses the recovery owner's opt-in per-slot key, with the same binding checks
and profile-wide exclusion. Existing callers and the original preview account keep
their `pending` record unchanged. Starting over after abandoning an unsaved recovery
code retains the new local slot. No route replaces or deletes another account.

## First implementation increment

- Completed account access explains the current device-lock-code plus passkey
  sequence and says that local unlock works offline. Its button reads
  `Confirm code and unlock with passkey`.
- Local and account unlock, account choice and setup share the welcome screen's
  static workspace preview behind a readable foreground panel. The backdrop is
  inert and hidden from assistive technology; it mounts no editor and reads no
  saved writing.
- A cancelled or failed unlock stays in unlock. It does not offer to restart
  account creation or show the recovery setup checklist.
- A wrong device-lock code is rejected before invoking the authenticator. Failure
  clears the submitted code from the form and coordinator; another attempt asks
  for it again.
- The new optional `connected: true` setup-progress field is presentation only.
  Older preview records remain readable. The hint is written after an authenticated
  account open; every open still verifies the promotion,
  binding, device factor and a fresh offline passkey proof. Altering this hint grants
  no account access and cannot replace those checks.
- The optional `name` field is a remembered display label. `requestedName` holds
  the initial name chosen in setup across interruption; it is removed after the
  admitted name change and completed opening. No device-lock or recovery code is
  stored in these fields. Malformed display labels are dropped without blocking
  account access.

## Next decisions and acceptance

Work through the implemented name and account-context screens with the author.
Then address the repeated setup ceremonies and the
choice of routine content-unlock factor. Runtime custody currently supports the
generated code; passkey-derived custody needs its own implementation and evidence.
An account assertion by itself cannot become a content decryption key.

The daily path should finish setup, retain writing, lock, reload, and reopen offline
with one passkey assertion per successful ordinary unlock. Cancelling and retrying
must preserve writing and never restart account/recovery enrollment. Real passkey
interaction is checked by the author; disposable browser tests cover repeatable
failures and state transitions.

## Increment evidence

All twelve dedicated account-setup browser tests pass, including the two daily
access/naming cases. Chromium's virtual authenticator retains the chosen name for
a newly created passkey. The compatibility test removes the new UI fields to
exercise the previous preview record, supplies the missing name after unlock, and
checks a later settings edit through lock/reload/reopen without another credential.
The daily access test observes zero credential prompts for a wrong device code,
one cancelled request, then one assertion per successful unlock and zero service
requests. Two further cases create two real active accounts with the same name,
verify distinct IDs and credential usernames, select the second credential with
no allow-list, recover a lost reply without another prompt, and verify the first
slot remains unchanged and its writing remains closed. Cancellation and choosing
the saved account still require the ordinary local unlock. Both affected Local
startup regressions, TypeScript, scoped lint/format
and diff whitespace checks pass. A screenshot of the named return screen was
visually checked, as was the different-account verification screen. Physical passkey interaction and the author's product review
remain the next hands-on checkpoint.

Two additional cases create two accounts in one profile with the same name, verify
separate principal/workspace/store identities, resume both device-code and recovery
stages after reload, switch accounts, and reopen offline with isolated writing.
Leaving before code confirmation retains one resumable draft and preserves the
first account. The native recovery regression also checks that opt-in per-slot
progress preserves legacy progress and refuses a changed account or workspace
binding. Desktop and narrow two-account chooser screenshots are checked.
The homepage case follows the welcome action through account creation, then
reopens the same account through all three preview URLs with the explicit
code-and-passkey button.
