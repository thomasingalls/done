# Automatic local maintenance: activation and reader rollback

2026-10-26 · unsigned phases74–75. This is the build/rollout plan for the existing local-retention
format, not a deployment record. [Product/owner contract](./account-local-retention-automatic.md).
Follow the existing [publication procedure](./account-local-retention-publication.md); operator merge
buttons, signed-source identity, tested immutable image, infrastructure pin and actual cached-client
adoption remain separate. General release qualification stays paused by the operator's instruction.

## Product choice

The selected release will perform eligible maintenance automatically. There is no additional user
opt-in or preference to manage technical history. Small/new accounts do no maintenance. At 1,024
physical records the owner may try after ten quiet seconds while visible and durable; successful
removal has a 30-minute cooldown. Status/refusals/retry follow PRD and phase74. These initial policy
values are deliberately retained rather than retuned without new evidence. The policy is local to
an owner lifetime; successful reduction also resets durable physical growth, while a reopen may
revisit a refusal. No user-visible writing is selected for age-based deletion.

## Coherent build profile

Ordinary builds remain compatible readers with installation, retention and automatic scheduling off.
The release candidate is selected with **`VITE_ACCOUNT_RETENTION_AUTO=1` at build time**. The shared
Vite build policy then defaults all four reader/installer/writer/automatic flags to1. Explicit zero
reader/installer/writer overrides are refused before building, rather than shipping a contradictory
activation. Existing manual private fixtures with scheduling off remain supported.

The Docker build stage accepts `--build-arg VITE_ACCOUNT_RETENTION_AUTO=1` and transfers it only to the
frontend build environment. Its default is0. This flag is compiled into the application; changing a
running container's environment does not change an installed client's behavior. No runtime trust,
server permission, schema or remote deletion capability is added. The storage owner still enforces
its reader/writer gates and all independent proofs.

After signing the sequence, build the identified release source using the established ARM64/image
procedure, adding that build argument to the normal revision/date arguments. Test the exact resulting
image and record its digest and effective flags before publication. The local activated dist in this
phase is from unsigned source and is not that release artifact. No image is published here.

## Rollout and stop conditions

1. Retain an identified compatible **reader-only** rollback artifact. Its compiled flags must be
   reader1/installer0/retention0/automatic0. Counterv5, carrier draft3 and journal-era support are
   required; stopping maintenance must never mean returning to an older unsupported reader.
2. Publish and pin only the tested activated image through the existing application/infrastructure
   handoff. Local conversion is performed by each client, not by server rollout or schema migration.
3. Verify server identity and actual client adoption separately. Confirm that normal writing, undo,
   cold/offline reopening and cross-device sync work after adoption; use fictional/disposable data
   for deliberately interrupted/failing attempts. Existing historical depth/preparation studies select
   the work and are not rerun as broad measurement campaigns for this slice.
4. Persistent capacity/history/ineligible results keep existing history and show Data status. Storage
   or verification halt requires lock/reopen. Unexpected failure, lost writing/undo, unreadable reopen
   or persistent reception failure is a reason to stop expanding adoption and use the compatible reader
   artifact while preserving diagnostic evidence. Do not ask users to clear storage as remediation.

## Reader-only rollback boundary

Select/build with `VITE_ACCOUNT_RETENTION_AUTO=0` and no manual writer overrides. This stops future
automatic conversion **after the client adopts that build**. Already-converted clients keep their
baseline plus authenticated suffix, continue editing and reopen normally; removed operational rows
are not reconstructed. Cached enabled clients can continue running their previous code until they
adopt the update: a server image rollback is not an instant remote maintenance kill switch.

The new native walkthrough converts with the actual activation policy, closes its persistent browser,
reopens with the actual reader-only policy, verifies no removal or scheduling port is available,
edits/undoes/redoes and cold reopens again, retaining counterv5 and the same baseline revision.
The fixture lowers only the growth threshold; the real quiet clock and all proofs/transactions remain.
This demonstrates the current-source compatible rollback profile, not every historical image or a
physical phone. Reader-first lifecycle and old-reader refusal evidence remain in their original
packets. No earlier failure is erased or explained by a passing rerun here.

## Separate work

Automatic service snapshots, independent device admission and server pruning remain separate.
The two retained admitted snapshot rules are unchanged. This local work does not shrink the live
CRDT document or replace the observed production account's missing attribution with an assumption.
Physical-phone pacing and exact signed-image/release/adoption checks remain later operations.
