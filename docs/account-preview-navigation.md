# Development account navigation

The operator approved these Back destinations on 2026-09-18, including recovery-code
redisplay within the same unfinished ceremony. This applies to the account development
preview. It does not activate accounts or new routes in the packaged application.

TanStack Router owns browser history. `/` is the splash, `/accounts` is the shared-device
chooser, and `/local/$step`, `/setup/$slotId/$step` and `/connect/$step` name screens.
The original private HTML entry points remain compatible. A directly opened invitation
gets an internal Connect devices parent. Reloading a routed screen inspects saved progress;
it does not re-run the action named by the URL. Root reload still shows the splash.

## Approved Back behavior

| # | Screen | Back destination and retained state |
|---|---|---|
| 1 | New-account name/introduction | Chooser; keep the non-secret name draft and durable unfinished setup. |
| 2 | Connect existing Local introduction | Local workspace entry; keep its writing and saved setup. |
| 3 | Save device-lock code | Its introduction; retain the same unconfirmed code in the live ceremony. |
| 4 | Confirm device-lock code | Redisplay that same unconfirmed code. |
| 5 | Unlock existing workspace, invitation owner or connection | Selecting screen; discard typed input and close the owner. |
| 6 | Create account passkey | Chooser; retain committed workspace creation. |
| 7 | Try the newly created passkey | Chooser; retain the passkey and pending verification. Resume must not create another. |
| 8 | Save recovery code | Chooser; explicitly warn that leaving discards this browser's displayed copy. Durable setup remains. |
| 9 | Confirm recovery code | Redisplay the same code only in this unfinished, in-memory ceremony. |
| 10 | Name an existing unnamed account | Chooser; lock and leave naming unfinished. |
| 11 | Connect devices menu | Chooser. |
| 12 | Existing device's invitation | Connect devices account selection; lock without revoking the invitation. |
| 13 | New-device invitation landing | Connect devices, including when opened from another website. |
| 14 | New device's account-passkey step | Chooser; retain confirmed custody and enrollment progress. |
| 15 | Waiting for the peer | Chooser; lock without cancelling; expiry keeps running. |
| 16 | Phone's comparison code | As above; resume the same code while the attempt remains valid. |
| 17 | Existing device's comparison input | Chooser; discard unsent input, never submit implicitly. Explicit Cancel remains separate. |
| 18 | Approved | Chooser; old history entries cannot reopen an actionable comparison. |
| 19 | Mismatch, expired, cancelled or authority changed | Chooser; do not reset the attempt or comparison budget. |
| 20 | Editor | Chooser and lock; do not replay completed credential steps. |
| 21 | Native passkey prompt | Native dismissal returns to its invoking application step for retry; the browser/OS owns that prompt's gesture. |
| 22 | Save or network operation pending | Accept the navigation intent, abort/settle and drain the owner, then leave. Preserve uncertain durable outcomes for retry. |

## Ownership and secret lifetime

A route is an untrusted presentation hint. The existing owner verifies custody, registration,
approval and authority before presenting resumed progress. Router loaders and history never
contain generated codes or perform genesis, registration, confirmation, approval or cancellation.

The mounted owner can redisplay unconfirmed device codes and the recovery generation result.
Moving between their save/confirm screens retains that owner. Leaving the flow, locking,
page retirement or reloading retires it. The recovery code is no longer eligible for redisplay
once a signed confirmation exists: its result may already have committed even if a reply is lost.
A wrong re-entry or dismissed passkey prompt can still return to the retained display before
that boundary. Resuming after retirement requires the user's saved copy. There is no physical
erasure guarantee for JavaScript strings or engine copies.

Internal navigation waits for owner closure. Abrupt renderer termination still relies on the
existing durable retry protocol. Browser unload uses its native warning while an unfinished
recovery display exists; the application cannot promise that every platform delivers an unload
event or prompt. Losing focus to a password manager does not retire the flow.

Polling updates the current view without creating repeated history entries. Invalid or completed
history steps leave or are reclassified from saved progress; they never replay protocol actions.
Changing account or participant creates a separate owner. A newly signed invitation on re-unlock
may have different bytes; previously issued invitations are not revoked merely by navigation.

Content delivery, installation/certification, transport notifications, device naming and fewer
credential prompts are separate product work. Release qualification remains paused.
