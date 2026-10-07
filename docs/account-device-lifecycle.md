# Account device lifecycle: from two devices to repeated membership changes

2026-10-08 · active development plan · release validation remains paused.

Sessions and notifications are implemented and served at the retained `:8443` origin on `a07de792`.
The operator chose additional devices and removal/revocation before lost-device recovery, and approved
one **Devices** screen in the editor’s Account menu, with the verified list, connect and removal actions.
The existing invitation/code-comparison ceremony stays; pending enrollment is distinct from approval.

## What the current implementation actually supports

| Boundary | Current behavior | Required extension |
| --- | --- | --- |
| Enrollment preparation | `EnrollmentContext.epoch` is 1; current state is the original promotion. | Bind each fresh preparation to the current verified parent and recipient/recovery state. |
| Membership | `successor.ts` admits the one second credential at epoch 2; `contentDelivery.ts` certifies it at epoch 3. | Repeated, serialized admission and certification with exact parent ancestry. |
| Service retention | One successor, ceremony, transfer and activation checkpoint per workspace. | Retain attempts and immutable transitions by identity; retries cannot overwrite earlier history. |
| Client history | `AdmissionHistory` resolves the first publisher, then the second at epoch 3. | Per-credential eligibility and accepted boundaries across the actual verified transition chain. |
| Live adoption | Receive discovery stops once an admission history is installed. | Discover and install subsequent heads under the actual owner; retain old decision/envelope evidence. |
| Key generation | Generation 1 throughout the working flow. | Owned fresh-generation allocation, certified-reader/recovery wraps and interrupted rotation recovery. |
| Product | Invitation/approval screens; no management list. | One route-backed list, truthful pending/approved/removal states and detached-copy recovery. |

These are deliberate private boundaries. Changing integer unions or accepting arbitrary arrays would
bypass their guarantees rather than implement the missing transitions. Existing signed bytes remain
valid historical evidence; no retained workspace, code or account should need replacement to upgrade.

## Bounded increments

1. **Verified device-list foundation.** Derive membership from the held account’s verified first epoch or
   admission/certification history, including pending credentials. Open Devices from both creating and
   joining editors, preserve the owner on Back, and clearly label retained state. Editable CRDT device
   labels and chooser hints cannot establish membership or custody assurance. Do not enable a removal
   action until its actual transition exists. This increment is in flight.
2. **Repeated-membership contract and service.** Define the versioned continuation of the existing
   first-three-epoch anchor, with bounded proof pages and exact parent links. Preserve current readers,
   their keys and recovery recipient at admission. Certification changes the exact approved recipient
   set only after the existing transcript/install proof. Retain all relevant accepted-head boundaries
   and exact retry outcomes; reject competing parents without rebasing a human approval. Extend
   preparation, ceremony and transfer storage without replacing completed attempts.
3. **Third-device product path.** Integrate the verified continuation with startup, discovery, receive,
   outbound and slot custody; allow an eligible existing content holder to invite/approve. Reuse owned
   session/grant/notification lifetimes. Open the third device’s writing and demonstrate delivery between
   all three, reopen after interruption, and preserve a stale device’s accepted and queued history.
4. **Removal and rotation.** A durable local intent names exact excluded credentials and parent state.
   An eligible client generates the next key, approves exact remaining recipients plus recovery wraps,
   and supplies the transition. The service atomically serializes the successor, key distribution and
   finalized accepted-write cutoff. Exact retries resolve the same intent; unknown outcomes stay pending.
   Verified competing outcomes require rebuilding against the new parent, with exclusions re-evaluated.
5. **Removal product journey.** Enable the removal action only over that owned path. Present requested,
   committed and acknowledged distinctly. A removed device learns exclusion from authenticated evidence,
   retains a readable/writable/exportable detached copy, and receives no new key. Remaining devices
   adopt the new generation before sealing further writing once they learn the change. Offline/local
   opening remains independent of network freshness. Reconnect retains accepted pre-cutoff work.
6. **Lost-device recovery**, then checkpoint replacement/pruning and operational deployment/restore.
   These remain separate product paths, not implied by session sign-out or the presence of a saved code.

The contracts in PRD §§6.4–6.6 and TRD §§7.4–7.5, 13.5–13.8 govern these increments. The existing
operator ruling still requires a fresh ceremony after a competing epoch change. No protocol decision
is licensed by a notification, an HTTP denial, a mutable roster or a guessed browser/device label.

## Focused evidence and product decisions

Use directed tests for actual boundaries touched: forged roster inputs, pending versus approved rights,
exact crash/retry, competing parents, cutoff withholding and interrupted generation installation, plus
the relevant real browser flow. Do not start a conformance inventory, generalized fault campaign or
release qualification. Record small completion checkpoints and commit unsigned as authorized.

The Devices entry point and screen are approved. Device names remain local aliases under the existing
product contract; unknown remote custody details must say unknown, not guess from user agent or the
implementation currently running here. Self-removal/last-device removal placement, recovery UX and any
new prompt or destructive confirmation must be walked through with the operator before enabling them.
