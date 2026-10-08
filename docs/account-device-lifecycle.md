# Account device lifecycle: from two devices to repeated membership changes

2026-10-08 · active development plan · release validation remains paused.

Sessions, notifications and the bounded lifecycle are served at the retained `:8443` origin on `2bea3437`.
The operator chose additional devices and removal/revocation before lost-device recovery, and approved
one **Devices** screen in the editor’s Account menu, with the verified list, connect and removal actions.
The existing invitation/code-comparison ceremony stays; pending enrollment is distinct from approval.

## Current development checkpoint

The bounded third-device path, pending cancellation, and first other-device removal/forward rotation
are implemented. Either original or joined devices may initiate removal. Verified observation stops
the old writer; surviving devices activate generation two, and removed devices retain writable,
exportable detached copies without network convergence. Lost replies, interrupted local activation,
offline survivor writing, two-way delivery and cold reopen pass in disposable packaged browsers.
See [the removal contract](./account-device-removal.md) and
[focused final evidence](./development-evidence/2026-10-08-device-removal.json).

The implementation checkpoint is `2bea3437`, now served at the retained origin on schema 20 after a
confirmed quiet point and verified offline backup. Operator browser uptake/writing checks remain pending;
see the [cutover runbook](./packaged-account-development.md).
Later admissions/rotations, self/last-device removal, lost-device recovery, successor checkpoints/pruning,
old-key retirement and public operations remain. The first rotation retains predecessor openers and its
apply record; completion of the user removal action does not claim those maintenance obligations closed.

## Product boundaries at the start of lifecycle work

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
   action until its actual transition exists. This foundation is implemented, checked and served at the retained origin.
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


## First continuation admission checkpoint — 2026-10-08

`account-protocol/membership.ts` verifies the existing signed 1–3 anchor before creating an immutable,
process-branded parent. The version-2 membership-admission proof names the exact parent/head, next epoch,
workspace/lineage, generation, acceptance key, prepared candidate, inherited recipient-certificate digest,
complete roster and complete accepted-head vector. Admission adds only a pending credential with no
capabilities and position zero. Existing identities/keys, certified recipients and recovery approval remain
unchanged. The approval is carried in its original context, not re-signed or reinterpreted. The wire bound
is 64 KiB per proof and 64 credential entries. This is a bounded development protocol, not a device-plan
entitlement. The pure verifier can follow repeated pending admissions; certification/removal are not yet
implemented in this continuation format.

The private service method consumes the first v2 preparation at epoch 3, verifies both current publisher
ledgers, and atomically stores epoch 4, both predecessor witnesses, the current pointer and witnesses
rebound to the new head. It preserves earlier admission, ceremony, transfer and checkpoint rows. Exact
retries verify the retained proof/boundaries and return the same result, including after a lost response
and service restart. Competing prepared parents refuse; they are not rebased. Receipt authority and expiry
are checked under the commit boundary, along with any supplied scoped authorization.

**Integration fence:** this method has no HTTP route. It requires `membershipContinuation: true` on the
session-owning `AccountCore`, and schema 15. Retained schema 14 needs explicit `upgradeFromV14` at an offline
boundary. The ordinary development host still opens schema 14 without this option, and refuses schema 15.
The old delivery/grant/ceremony authority reader refuses a stored continuation instead of treating epoch 3
as current. Thus this checkpoint must not be enabled for the retained service: after private admission,
its ordinary sync path intentionally refuses until general history, ceremony/certification, grants,
discovery and editor adoption are composed. No runtime/host upgrade was performed.

Next: adapt commitment/reveal,
comparison and installation to the verified continuation parent; generalize accepted-history resolution
for all eligible publishers before wiring any public/development route. The operator selected one unfinished connection per account, with Resume/Cancel before another
invitation. Enforce that rule in the service and Devices. Cancellation preserves approved recipients and
their generation; competing authority changes still require a new comparison.


## Continuation comparison and reservation checkpoint — 2026-10-08

Version-2 ceremony contexts resolve either existing approver through the verified parent certificate,
and bind the exact current admission, pending candidate keys and local role. Commitments and reveals
use versioned domains; version-1 bytes remain unchanged. The authenticated relay still needs durable
attempt-keyed storage before this becomes a third-device product flow.

A prepared version-2 enrollment reserves the single connection while live under the same authority.
The reservation is made only after both passkey and candidate possession proofs, atomically with the
receipt and optional login. Multiple unproved challenges can exist; they cannot block a legitimate
connection. Cancellation/expiry of preparation releases that reservation. After admission, the actual
verified membership/ceremony transition must govern cancellation instead.

The approved product boundary is **Cancel connection before comparison approval**, **Remove device
afterward**. Approval can expose the content key before certification. Remove must rotate forward,
preserve uncertain outcomes as possible access, and explain that existing copies cannot be erased.
A pending roster is not evidence that the candidate lacks a key.


## Durable continuation ceremony checkpoint — 2026-10-08

The private relay now shares the original ordering/terminal-state checks, with version-2 signed requests
binding workspace, exact admission head and preparation identity. A separate admission-keyed table
retains the chosen certified approver, commitments, reveals and signed decision/cancellation; the
original two-device ceremony is preserved. Neither competing approvers nor a late cancellation can
replace an approved pair. Empty and populated reads use the actual service authorization boundary.

This requires private schema 16 (explicit offline `upgradeFromV15` for private schema 15, or the existing
explicit schema-14 upgrade). The ordinary host remains schema 14; no continuation route is exposed.
Consumed continuation preparation resumes as admitted and cannot be cancelled through the preparation
capability. Completing cancellation of a pending member still needs its own authenticated transition;
storing a cancelled exchange does not claim to remove that member. Approved/uncertain key access still
requires removal and forward rotation. Content delivery/certification and complete sync composition
remain next. Focused evidence is recorded in `completed.md`.


## Continuation delivery proof checkpoint — 2026-10-08

Version-2 recipient certificates explicitly sign workspace, lineage, parent, resulting epoch,
generation, full recipient keys, recovery digest and approver. Key delivery binds that certificate
to the exact version-2 comparison and pending preparation. The candidate signs the delivery hash
after installation; only the resulting verified certification gives it publisher rights. The pure
verifier preserves all prior recipients and accepted heads and starts the candidate at position zero.
No service-root signature can replace the device approval or candidate installation proof.

The first implementation verifies these bytes; atomic service retention, actual client key installation
and the general delivery/history owner remain required before exposing the third-device product path.


## Atomic private transfer checkpoint — 2026-10-08

An admission-keyed transfer table now preserves the exact approved delivery and resulting installation
certificate. The certification transaction advances the current head and both existing publisher
witnesses together; exact retries survive restart and a lost commit reply. Earlier ceremony, delivery,
checkpoint and admission bytes are retained. The consumed preparation remains resumable as admitted.

This is private schema 17, with explicit offline `upgradeFromV16` for private schema 16; earlier approved
offline upgrade paths also install the new table. The retained/default development service stays at
schema 14. The private service still fences ordinary delivery after continuation admission. Its transfer
verifier requires the exact frozen epoch-3 accepted prefixes, including both old and rebound witnesses.
General per-publisher issuance history and accepted-boundary replay must replace this temporary fence
before ongoing writing and the third-device editor are enabled. This is the next implementation step,
not an operator restriction on the eventual product.


## Per-publisher history checkpoint — 2026-10-08

Verified history now extends through continuation admission/certification and keeps each publisher's
actual starting epoch, every accepted cut and the reader set at each authenticated head. A device
certified at epoch 5 cannot acquire an epoch-3 publication history. Queued old payloads may still be
accepted in a later eligible interval, with acceptance issuance checked separately from payload epoch.
This is client proof composition; the service ledger owner, discovery/grants and client installation
remain to be connected before removing the private continuation fence.


## Continuation service ledger checkpoint — 2026-10-08

The private delivery and transfer owners now compose the signed continuation history and per-publisher
ledger boundaries. This replaces the temporary frozen epoch-3 ledger requirement: existing publishers
can write through admission and certification, while the candidate can read or publish only after its
verified installation and certification. Accepted cuts and refused events are replayed under their
actual issuance authorities; exact historical retries remain valid after subsequent writing.

This remains private schema 17. The ordinary host and retained installation remain schema 14. Grants,
current-head discovery/bootstrap and client custody/editor adoption must use the same verified history
before a continuation route or the third-device product action is enabled. Cancellation/removal,
rotation and repeated later connections remain required.


## Scoped continuation authorization checkpoint — 2026-10-08

Network grants now use the verified current continuation chain. Existing certified members and the
candidate can obtain separate, exact-attempt ceremony grants; only certified members receive
workspace grants. Unconsumed preparation requires its unchanged parent and live deadline. The latest
consumed attempt remains available for terminal retry, while unrelated/historical attempts refuse.
Admission, transfer and certification changes retire earlier grants; ordinary ciphertext appends do
not. Scoped authorization still supplements every signed domain operation and its commit-time checks.

Next: bounded authenticated bootstrap/discovery of the complete chain, followed by owned client
adoption and third-device installation. The retained/default host remains unchanged.


## Current-head locator checkpoint — 2026-10-08

Version-2 invitation bootstrap and workspace discovery now authenticate the complete original and
continuation chain. Invitations bind the inviter's certified historical head; bootstrap replies bind
the full captured request and expected service pin. Discovery uses device proof, a fresh nonce/deadline,
exact held ancestry and scoped network authorization. Reader eligibility is checked at the claimed
historical head as well as current membership. A fresh service signature cannot substitute for a
missing device approval or installation proof.

Chain count and byte limits are explicit. Bootstrap is capped at 80 MiB, matching the existing client
response ceiling; over-limit results refuse. The service retries normal signing-time authority changes
at most four times. Discovery preserves the requesting publisher's ledger interlock. The private
methods remain unrouted; HTTP and owned browser adoption are next. These proof readers do not install
keys, grant publication authority or complete a cancellation/removal.


## Opt-in HTTP checkpoint — 2026-10-08

The session handler now exposes `/account/membership/v2/{admit,ceremony,transfer,discover}` only when
its actual AccountCore owns the explicitly enabled schema-17 continuation store. Bootstrap is separately
served at `/__account-setup/membership/bootstrap` under its signed invitation. Default/retained serving
stays schema 14 and returns 404 for these routes. The browser transport preserves enrollment/workspace
route separation. Exact admission-keyed changes drive notifications; terminal retries stay quiet.

Next is the client lifecycle composition: continuation key custody and handoff, complete authority
adoption, checkpoint/loading and third-device editing. The existing product control remains disabled
until that path and cancellation/removal are composed. No operator deployment was performed.


## Continuation client handoff checkpoint — 2026-10-08

The version-2 client handoff now retains the complete approved recipient certificate, exact wrapped
key and candidate installation receipt. Before sending delivery or installation, it re-reads the
committed progress and rejects an unsaved in-memory state. Candidate countersigning requires opening
the persisted installed-key seal. Certification must verify the same delivery and receipt.

This is a generation-one coordinator with focused simulated-custody interruption tests. It is not yet
wired to native slot custody or the enrollment UI. Next: connect the actual original/joined/pending
slot owners while preserving the earlier completed ceremony and its installed key.


## Native continuation custody checkpoint — 2026-10-08

Original, joined and pending slots now share the approval/key primitives under their existing lifecycle
permits. Encrypted progress preserves the original ceremony. Joined writes atomically rebind custody
and marker authentication; a failed ciphertext save consumes its reserved nonce and retains prior
progress. Both existing owners wrap the same account key for a new pending device. A packaged native
check cold-opens all three owners and confirms the original editors still exchange edits.

Next: authenticated historical checkpoint loading and current-authority adoption for the new device.
The original epoch-3 checkpoint includes writing accumulated before ordinary outbound delivery, so
replaying only the original genesis is insufficient. Its baseline and all eligible publisher streams
must be carried into the later installation without reusing the original second device's semantic
admission as the new candidate's approval. Generation replacement/pruning remains later work.


## Historical checkpoint access checkpoint — 2026-10-08

Continuation admission now requires a verified retained epoch-3 baseline and rechecks it at commit.
This preserves writing accumulated before the original Local-to-Account catch-up. Later certified
readers fetch that same immutable baseline through the opt-in version-2 checkpoint route, with current
workspace authorization and device proof. The original publication/admission route remains unchanged.

This read provides authenticated historical ciphertext, not a new semantic admission or a claim that
all subsequent writing has been fetched. The client must replay every eligible publisher's accepted
history and retain its own admission before activating a later slot. No new schema or live upgrade
is needed for this read-only addition; continuation serving remains disabled by default.


## Later-device replay checkpoint — 2026-10-08

The client now cold-replays the historical baseline and every current publisher's independently
authenticated stream. A later reader signs its own semantic baseline admission under the current
certified parent after reopening committed ciphertext. Save failures cannot be replaced by in-memory
progress. Missing Yjs dependencies keep the load incomplete, and bounded reads resume from retained
prefixes. This component is tested with actual encrypted Yjs content and service decisions; its
committed-vault port is simulated in those tests.

Next: version the native joined-device record to retain this complete authority and multi-publisher
reading state, attach restartable activation, and then compose current-authority adoption and the
product ceremony. The original two-device owner must continue to open its existing records unchanged.


## Native later-device activation checkpoint — 2026-10-08

Joined-device version 2 stores the full continuation proof chain and multi-publisher reader state.
Its installed key authenticates the exact continuation delivery, and activation checks the retained
baseline, reader admission and actual native content before selecting the Account index. Interrupted
selection can resume after a cold reopen. Version-1 records preserve the first joined-device path.
The original Local/promotion owner refuses either joined activation marker.

Next: current-authority adoption for already active original and joined devices. Keep the immutable
installation baseline/key binding separate from later authority: changing a device's current head
must neither rewrite its activation baseline nor reinterpret its local Account index as a fresh
installation. Verify retained accepted prefixes and local ledger cuts before adopting a newer signed
chain, clear verification caches under the owning permit, and recover a committed adoption on reopen.
Then connect the version-2 ceremony and loader to the product screens.


## Owned membership adoption checkpoint — 2026-10-08

Original and joined receiving owners now separate immutable installation from adopted membership.
The authenticated carrier records a complete verified chain and each exact local ledger cut. Current
routes advance only after verification and native commit; cold reopening rechecks both the frozen
baseline and later cuts. Historical received decisions keep their original issuance authority, and
queued old source updates remain recoverable. The existing owner closes after a committed adoption
whose readback fails; an exact cold retry resumes the retained head.

Version-2 discovery is attached to the same queue/permit and enabled by the private continuation-host
option or retained continuation custody. The default epoch-3 packaged host remains compatible.
Focused native interruption and two-device compatibility checks pass. A test-issued next proof checks
later joined adoption without claiming the service's repeated-admission path is implemented.
Next: wire continuation invitation/preparation/comparison and the existing handoff/reader into product
screens, then demonstrate real original/joined adoption and three-device writing. Cancellation before
approval and removal with rotation afterward still need their actual membership transitions.


## Durable comparison checkpoint — 2026-10-08

The continuation comparison component saves and rereads each nonce/context, commitment, reveal and
decision before sending it. It verifies the approver's signed context, both parties' proof and the exact
transcript. Either certified existing participant may approve. Exact retries survive a service restart
and lost approval response; a competing parent spends the attempt, and a mismatch cannot become approval.
Code redisplay preserves the same retained attempt. The real relay/handoff integration passes for both
approvers. This component still needs invitation/preparation routing and product-screen integration.


## Invitation and enrollment checkpoint — 2026-10-08

Invitations now derive from actual original/joined custody and current verified membership, preserving
frozen installation records. Existing owners reject a stale bootstrap even when the service signs it;
new candidates authenticate the invitation and full current chain. Combined enrollment/login retains
its exact challenge and proof before transmission and survives finish/admission response loss without
another passkey prompt after the proof is durable. Focused real-service retry checks pass with simulated
client persistence. Product coordinator and route wiring remain next; continuation is still disabled in
the default host and has not been served at the retained origin.


## Retained connection coordinator checkpoint — 2026-10-08

One encrypted progress record now composes the continuation components. Reopening authenticates its
saved invitation, account, latest chain and the parent of each in-flight component. Exact admission
and certification advances can finish after lost replies; competing membership requires restarting the
human comparison. Composed real-service tests pass for either approver, and actual encrypted loading
survives interruption at the installation port. These use simulated custody; native browser/session
and route composition remains next. Cancellation and removal are still separate unfinished transitions.


## Native third-device product checkpoint — 2026-10-08

The packaged continuation adapter now uses actual encrypted custody, remembered sessions, scoped
grants and notifications. A disposable native browser test demonstrates the joined second device
approving a third, saved comparison after reload, historical writing load, edits between all three,
and cold reopening. The original two-device path still passes. Explicit schema-17 host opt-in and
offline upgrade are implemented, but the retained `:8443` service remains on schema 14 / `a07de792`.
Capacity refusals during the rapid test recover through bounded exact-byte retries; limits are unchanged.

Next is the authenticated cancellation transition before approval, then removal with forward key
rotation afterward (including uncertain exposure), repeated later admissions and lost-device recovery.
The existing cancelled-relay record alone does not remove membership. No control may claim otherwise.


## Cancellation proof checkpoint — 2026-10-08

A signed pending-connection cancellation intent and successor now preserve all existing content
recipients and publisher boundaries while withdrawing only the named pending candidate. Full-chain
verification supports the transition. The service must still atomically fence approval/delivery and
retain its exact result; the pure proof does not establish absence of an approval. Cancellation must
refuse once approval/key exposure is possible, and local uncertain outcomes remain removal territory.
No cancellation control is enabled before that service/client composition exists.


## Atomic cancellation service checkpoint — 2026-10-08

The private schema-18 producer now serializes cancellation against comparison approval and key delivery.
It retains exact outcomes and both publisher cutoffs/witnesses atomically. Lost replies resume without
changing the intent; current discovery and continued writing verify the cancelled successor. Approval
winning the race requires removal with rotation; a signed mismatch can still cancel. The retained host
remains on schema 14. HTTP/client cancellation and the product control are the next composition boundary.


## Cancellation product checkpoint and next removal scope — 2026-10-08

Protected cancellation and its retained client/UI path now pass a real packaged browser test with a
discarded committed response and reload. Existing publishers continue syncing; a cancelled candidate
never opens writing. Saved or competing approval requires removal with rotation. Cancellation does not
delete the joining slot. Repeated invitations after cancellation still need the general service
continuation producer; no new invitation is advertised at that unsupported head.

The operator approved **removing other devices only initially**, keeping the requesting device
connected. Self-removal and the last-device case stay with local clearing/recovery. See the concrete
[removal/rotation plan](./account-device-removal.md), including the durable target-cutoff preparation
needed for exact signed retries. The first proof boundary is implemented; service mutation, generation
activation and product controls remain next. Unsigned intermediate commits and continued work remain
authorized. The cancellation checkpoints do not establish removal correctness.


## Retained removal producer checkpoint — 2026-10-08

Other-device removal proof is `3005f387`. The client now produces actual HPKE wraps for the remaining
certified devices and recovery, retains its self-wrap and exact signed intent, and survives simulated
persistence interruptions/lost replies. It proves its retained key can reopen before transmission.
This is the coordinator boundary; native custody, committed membership/history and service producers
remain unfinished. No removal button or new live service version is enabled by this checkpoint.


## Rotation membership/history checkpoint — 2026-10-08

Retained client key production is `c313fc27`. The signed rotation successor and full-chain history now
verify the exact distribution/outcome/finalization together. Historical authorship survives removal;
current reader rights and post-cutoff writes do not. Generation-one native adoption explicitly refuses
this proof until actual generation installation is implemented. Focused composed evidence passes;
service producers, native activation and the product control remain unfinished and undeployed.


## Durable removal preparation checkpoint — 2026-10-08

Rotation membership/history is `c2936353`. Private schema 19 now commits an authenticated stable target
cutoff and durable acceptance fence from actual publisher ledgers. Exact replies survive restart;
survivors keep publishing; competing membership effects cannot invalidate the pending parent. Missing
preparation fails closed through a companion workspace marker. Focused service, grant and host checks
pass. There is no removal HTTP/UI entry point yet: committing the rotation outcome and native activation
must be available before exposing a preparation that needs completion. The retained host stays schema 14.
