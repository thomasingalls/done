# Repeatable account device lifecycle

2026-10-08. The operator authorized continuing through repeated connections and removals, with
unsigned intermediate commits and focused implementation evidence. Release validation remains paused.
The retained development service still serves immutable build `2bea3437` on schema 20; changing source
does not restart that process or switch its build.

## Product boundary

Preserve the approved Devices flow, one unfinished connection per account, cancel before key exposure
and remove afterward, and other-device-only removal. Each competing epoch change restarts comparison.
The target sequence is remove a device, connect its replacement, then remove another device while
preserving accepted and offline writing. No self/last-device removal, recovery UX, pruning or predecessor
key retirement is implied. Existing history-size bounds remain; refusal must precede an irreversible
preparation or an admission without space to finish.

## Implementation sequence

1. **Current-parent service operations.** Enrollment/admission and comparison/key certification follow
   the complete verified history after earlier certification, cancellation or rotation. Preserve
   historical attempts, final publisher witnesses and exact committed outcomes. Do not assume the
   original publisher remains certified. This service boundary and its post-rotation browser composition are implemented.
2. **Repeated native rotation custody and activation.** Retain authenticated generation openers across
   later pending intents, choose the active opener through the authenticated pointer, and resume each
   content/custody transition after interruption. Passive observation must handle missed rotations;
   removed devices open only their detached copy.
3. **Current-generation replacement handoff.** Capture and authenticate complete current writing for
   the joining device, seal it under its approved generation, and retain exact publication/admission
   across retry. The original generation-one checkpoint alone cannot open a generation-two newcomer.
   Existing survivors retain their historical keys; joining devices must not need keys they never had.
4. **Product composition.** Reuse invitation/comparison, expose only complete paths, and exercise the
   repeated lifecycle in disposable packaged browsers, with offline writing and cold reopen. Obtain a
   fresh operator quiet point before any later retained-service upgrade.

## Service evidence

Three new directed cases cover admission after cancellation and replacement after removing either the
original or joined publisher. Both replacement cases lose later admission/certification replies,
restart, recover the retained outcomes and complete another rotation to generation three. Old
admission and rotation retries remain exact; removed publisher witnesses are unchanged.

The service now validates all historical publisher ledgers during admission. Approval uses the exact
latest admission prefix of the verified chain. A later unrelated ceremony cannot borrow an older
attempt. Recipient certificates allow two members after a removal; verification still requires the
exact prior certified set plus the candidate. Admission/certification/cancellation preserve the
original publisher's final witness if it was removed. History capacity checks precede target fencing
and reserve room for admission completion. No schema change is required in this phase.

Focused checks: 49 affected service/ceremony cases pass across the primary run and five-case rerun;
15 membership protocol cases pass. Four primary cases required loopback listener permission; one
fixture was updated to prepare enrollment before the removal fence and separately assert that new
preparation is refused during removal. TypeScript, scoped lint/format and diff checks pass. Logs:
`/tmp/done-repeatable-service-focused.log`, `/tmp/done-repeatable-service-rerun.log`,
`/tmp/done-repeatable-protocol.log`. This does not yet establish a replacement-device browser flow.


## Native rotation increment

Repeated native removal is implemented and tested through generation three. Encrypted v2 progress
retains historical sealed openers while v1 progress remains readable; the active custody pointer stays
on its predecessor until journal-inclusive content conversion and membership installation complete.
Cold reopen, original/joined lost replies and an interrupted second activation pass. Removed devices
retain writable detached copies at their last installed generation. A focused regression fixes old
inbound replies being incorrectly compared with newer membership cutoffs.

The passive observer retains the next uninstalled rotation plus authenticated later history for
sequential restart. The subsequent four-device browser check now passes both missed rotations and
old-generation offline delivery. Current-generation replacement handoff is still required.
See the 2026-10-08 native-custody entry in [completed.md](./completed.md) for checks and logs.


## Repeated connection composition

Generation-one connections can repeat after installed certification/cancellation or exclusion of the
previous candidate. The native owner archives completed progress only for a fresh explicit navigation
attempt; a refresh resumes exact retained progress. Four disposable packaged browsers pass a newly
joined device inviting the fourth device, two actual UI removals, a survivor missing both rotations,
old-generation offline delivery, generation-three two-way writing and cold reopen. Five handoff and
three retained-coordinator cases cover archive/save reply loss and cancellation followed by another
invitation. See the corresponding 2026-10-08 completion entry for logs.

## Approved replacement delivery policy

The operator chose current-key retries, preserving original offline edits, instead of distributing
historical keys. The existing service deliberately accepts historical-key work from surviving devices
after rotation, including after their newer-key uploads. A snapshot of the accepted prefix alone is
therefore insufficient for a replacement holding only the current key. Replacement admission must
establish a durable boundary: already accepted bytes remain exact and enter the snapshot; a later
unaccepted old-key upload receives signed retry evidence, and the client retains its source edits
while retrying under the current generation. Implement and test both sides before exposing the
post-rotation connection button. This is a scoped contract change, not key retirement or pruning.

The service/protocol floor is now implemented. It is derived from signed admissions at each historical
epoch, persists through cancellation, and is evaluated at the original decision boundary during census.
Before/after-commit refusal faults and exact accepted retry pass. Browser durable retry is in flight;
current-generation replacement snapshots remain next. No live service change is implied.


## Durable retry increment

The browser now implements the approved boundary. An append-only retry record preserves its signed
refusal, predecessor ciphertext and fixed source references; new encryption consumes a fresh durable
grant, and its signed wrapper names the refusal. Replay authenticates the full sequence. Only a
retired-generation refusal with installed newer admission authority can trigger automatic retry;
ordinary network failures cannot. Verified membership adoption wakes a closed sender for this check,
without clearing conflict/finalization.

The native packaged test passes through an old upload retained before removal, generation-two
replacement admission, a lost refusal reply, exact retransmission, current-key replacement at the same
position, journal delivery and cold reopen. See the 2026-10-08 completion entry and
[passing native output](./development-evidence/2026-10-08-current-key-retry.log). Next: the replacement
snapshot must cover the admission's accepted cuts, including finalized publishers, and the joining
device must start its streams at those authenticated cuts with only its approved generation key.

## Replacement checkpoint increment

The separate signed replacement artifact and current-key encrypt/decrypt path are implemented. Its exact
cutoffs include finalized publishers; local journal additions do not advance them. A candidate signs
an acknowledgement of the complete artifact hash after semantic replay. Eight focused checks pass.
The constructor is an internal primitive, not publication authority: source coverage must still be
proved from an authenticated baseline and each accepted publisher suffix. Service retention, hash
binding into approval, native joining custody and reader prefixes remain before enabling the product.

## Accepted source replay increment

Source verification is implemented for both existing survivors and replacements. Existing survivors
cold-open the original baseline using their retained key. A replacement cold-opens its own admitted
snapshot and starts at its authenticated cutoffs, requiring no earlier generation key. Each source
then verifies signed accepted envelopes through every admission cutoff, including removed publishers;
only after complete replay can it merge durable local originals and create the next snapshot.
Twenty-four focused/affected checks pass, with [preserved output](./development-evidence/2026-10-08-replacement-source.log).

The remaining work is composition with durable owners: persist the exact snapshot before publication,
retain its service result and recipient acknowledgement, bind its hash into approval, install the
joining device's current generation and nonzero receive prefixes, and exercise the complete repeated
lifecycle. These helpers do not expose that unfinished path or upgrade the retained service.


## Service retention increment

Schema 21 retains an immutable replacement snapshot separately from membership proofs. Version-3
key delivery binds its hash; certification requires the candidate's signed acknowledgement.
Enrollment grants bind the transfer to its exact preparation and actor. Interrupted commits and exact
retries preserve the snapshot; substitution and downgrade fail. Eleven focused service/upgrade cases
and 23 affected protocol/replay checks pass. The live service remains on schema 20.

The next owner increment saves the exact snapshot before publication and cold-replays it with the
recipient's durably installed key before acknowledgement. Native producer composition and replacement
activation/receive prefixes remain necessary before enabling the complete product journey.


## Browser handoff ordering increment

The producer retains its exact snapshot before publication and key release. The recipient saves the
snapshot and installed key, cold-replays the writing, then retains its signed acknowledgement before
certification. Interrupted saves and lost replies preserve exact bytes. Seven handoff and four affected
service-coordinator checks pass. Native source capture/current-key wrapping, replacement custody
activation and authenticated receive prefixes remain before enabling post-rotation connections.


## Native producer increment

Original and previously joined devices now capture replacement writing from authenticated native
content/journal plus accepted-prefix replay under their actual slot permit. Current-generation wrapping
uses installed custody. Two packaged-browser checks pass through stale-grant recovery, lost publication
reply, cold restart, certification, and decryption of removed-device/current-generation/journal-only
writing. The journal original remains retained.

The joining device still needs its startup adapter: verified account binding, initial generation and
receive cuts, then editing and a subsequent removal. Post-rotation product invitations remain gated.


## Replacement reading increment

The signed account binding is retained separately from the current-key snapshot. Replacement replay
verifies its certification and signed acknowledgement and initializes current publishers at the
snapshot's authenticated receive cuts. Removed publishers need no historical content opener. Focused
reader, inbound and service/browser-reader checks pass; see the 2026-10-08 completion entry.

Native initial-generation activation remains the next boundary. It must resume an empty-carrier
transition before ordinary writing opens, then preserve the initial opener through later rotations.
The product path remains gated until replacement editing and another removal pass.


## Initial-generation activation increment

A replacement can now initialize native custody directly at its admitted generation, resume either
side of the empty-counter/snapshot transition, edit, deliver in both directions and cold-reopen.
Original and joined producer cases pass, plus the focused unit/protocol checks recorded in completed.md.
Initial openers remain retained through later rotation; no historical network key is distributed.

The next product increment removes the invitation gate and exercises a replacement removing its
remaining peer and inviting another device from its own snapshot baseline. Live service remains
unchanged and release validation remains paused.


## Completed repeated product cycle

The post-rotation Connect action is enabled. Both original and joined producers pass the actual
Devices-to-invitation path, restartable current-generation installation, two-way editing and cold
reopen. The generation-two replacement can then remove its surviving peer, resume the same signed
intent after a lost committed reply, activate generation three and invite a fourth browser from its
own snapshot baseline. Both current browsers exchange edits and reopen them. The excluded peer
opens its writable detached copy and cannot receive or contribute successor-generation writing.

The final composition fixed a native adapter that described every removal owner as the original
publisher; joined replacement owners now carry their verified initial generation. The longer cycle
also exposed obsolete grants exhausting a remembered login's quota; changed-authority grants and
challenges are reclaimed without raising the limit or extending the login. These are implementation
repairs within the existing product decisions.

This completes the bounded repeated lifecycle in disposable packaged browsers. Retained service
uptake is the next step: preserve an immutable build, obtain a fresh locked/closed confirmation, back
up and explicitly upgrade schema 20 to 21, then retain the same origin, pin, accounts and ports.
Self/last-device removal, lost-device recovery, successor snapshot replacement/pruning, key retirement
and production operations remain separate. Release validation stays paused.
