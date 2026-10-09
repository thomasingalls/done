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

## Remaining scope

Connecting another device must still work after upload. The initial checkpoint's accepted heads
will need to permit nonzero positions, with the source proving their exact retained envelope prefix.
The receiving device continues to verify/replay the accepted stream; this phase does not prune it.
Checkpoint replacement, general pruning, public deployment and release validation remain separate.
