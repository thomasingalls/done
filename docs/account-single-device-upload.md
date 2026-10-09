# Single-device account upload

The first account device must upload accepted writing without first connecting another device.
This is bounded product work; release qualification remains paused.

## Work sequence

1. Native activation: use the existing captured, ordered sync owner from the original account epoch.
   Preserve existing local-only Account content and journal entries through a resumable conversion.
2. Product composition and handoff: open that owner from account setup/unlock; permit the first
   two-device checkpoint to include an already accepted prefix, verified against retained envelopes.
3. Focused packaged checks: first-device upload, offline edits/cold reopening/reconnection, recovery
   elsewhere, and the later two-device handoff. Prepare the retained-service update after these pass.

## Native conversion

A fresh frozen account already has an admitted genesis on the service. Flush its raw local journal
before changing to the capture dialect. An older edited local-only account additionally needs its
retained content uploaded. Under the exclusive slot permit, flush the journal, authenticate the
content census, and check each exact record against existing carrier/network bounds. Then retain a
MAC-authenticated v6 conversion fence and census digest before writing any outbound capsule.

Each content record becomes a deterministic, exact-byte capsule. A retry requires the same frozen
content census and identical already-written capsules; it writes only missing capsules. The
conversion clears its fence only after all capsules commit, then installs the v9 sync owner before
allowing edits. Old owners cannot use the conversion marker or v9 custody. No original content is
deleted and no Yjs pending union is merged or re-encoded.

The old local-only journal did not retain per-update actor metadata. Conversion is therefore a
system upload of retained writing, not reconstructed human edit history. Embedded authors remain
unchanged. An old single record exceeding existing network bounds refuses conversion before the
fence; splitting large historical records is separate work. New edits retain ordinary bounded
source capture and attribution.

## Product composition and handoff

Account setup and unlock now open the sync owner directly. After the first slot binding is created,
setup prepares the combined login/unlock challenge before its existing editor-opening assertion.
That assertion establishes the remembered network login without adding a credential prompt. Ordinary
cold unlock retains the existing offline-first behavior and explicit Connect/Reconnect fallback.

The first two-device checkpoint accepts nonzero heads only when they match the authenticated
certification. Its native producer verifies the complete accepted envelope prefix against its retained
spool, includes durable journal edits in the snapshot, and commits the checkpoint and new authority
together. If epoch two was already installed, it retains both exact ledger boundaries. The receiving
device still verifies and replays the accepted stream from zero; no history is pruned or skipped.

## Focused evidence

- Four native activation cases: direct first-device upload/cold reopen, compacted plus journal-only
  old writing through renderer death at the fence, interruption after one capsule commit, and actor
  substitution refused before storage changes.
- Two existing native successor cases: ledger/counter/source preservation through compaction and
  restart, plus queued old sources accepted after an epoch transition.
- Five checkpoint/authority cases: exact publication/admission retry across commit failures, role
  and current-authority checks, retained schema compatibility, nonzero accepted heads with a false
  signed-prefix refusal, and both ledger boundaries with omission/tampering refusals.
- Packaged never-paired account: automatic first-device upload, offline edit, actual tab close,
  cached offline reopening, reconnection upload, recovery elsewhere containing both texts, then
  enrolling another device.
- Packaged session regression: enrollment reuses the remembered login, authenticated notifications,
  two-way writing, service restart/renewal and offline reopening pass.
- Packaged original pair: an explicitly nonzero accepted prefix before the first invitation,
  second-device content, then recovery, detached old copies, further enrollment, rotation and recovery
  again. These are disposable browser/service checks, not physical-device or release qualification.

The first packaged attempt exposed missing login prewarming during fresh setup: the account opened
locally but never submitted writing. It timed out waiting for upload. Preparing the combined challenge
at the new binding boundary repaired it; the same check then passed in 21.3 seconds.

[Recorded commands and evidence](./development-evidence/2026-10-09-single-device-upload.log).

Checkpoint replacement, general pruning, public deployment and release validation remain separate.
The live service is still build `049b9a29` until the operator supplies a fresh quiet point.
