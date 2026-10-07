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
   action until its actual transition exists. This foundation is implemented and checked; it is not yet served at the retained origin.
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


## Continuation preparation checkpoint — 2026-10-08

The first extension is versioned preparation against the existing certified epoch-3 head. It uses
`EnrollmentContext/Challenge/Receipt.v = 2`; v1 still means exactly the original epoch-1 preparation.
Challenge, possession, account assertion and receipt domains carry the context version. A combined
login still has the explicitly selected enrollment-and-login purpose, now in the version-2 assertion
domain. Envelope/context version disagreement is malformed. Original signed v1 bytes are unchanged,
and the v1 successor verifier explicitly requires a v1, epoch-1 preparation.

The service verifies its retained epoch-3 certification, binds the exact head, complete current
recipient-certificate digest, recovery commitment, candidate keys, account and passkey, then uses the
existing durable challenge/proof transaction. A finish retry returns the same receipt and optional
login. Begin/resume never expose issuance secrets. A competing authority invalidates the challenge;
there is no automatic rebase. Schema, old receipts, completed ceremonies, delivery and checkpoint
records remain unchanged. Preparation does not admit a credential or deliver content. The old
admission consumer refuses the new receipt; the Devices screen therefore remains disabled beyond
two devices until the continuation consumer and actual editor path exist.

Next service work needs an append-only continuation ledger, keyed by workspace and epoch/head, with
unique consumed preparation identity. It must retain the existing 1–3 records as the verified anchor,
compare the exact current parent and accepted heads in the admission transaction, carry recipient
approval unchanged for pending admission, and answer an exact retry from its immutable committed
result. Current-head discovery must page proofs without dropping any previously held boundary.
Certification then requires the existing commitment-before-reveal and human comparison rules adapted
to that verified parent, an eligible approver from its certified set, exact key delivery and durable
installation. A service roster, enrollment receipt or network login alone cannot activate recipients.
