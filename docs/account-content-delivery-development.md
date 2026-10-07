# Development continuation: deliver, install and certify

2026-09-18. The operator authorized the next bounded product phase after the real two-device
approval trial. This implements the continuation in [content-approval prep](./account-content-approval-prep.md).
Release qualification remains paused. This is one generation, one admitted candidate and one
certification successor, followed by a stop for use.

**2026-10-07 walkthrough:** completed through the real Firefox UI with two isolated, disposable
containers and a real Bitwarden passkey saved by the operator. Both sides reached the installed
and certified status, then recovered it after closing both tabs and reopening through the root
splash/chooser with their separate device codes. No new invitation, passkey request or comparison
was needed on reopen. This is desktop development evidence, not a physical-phone or crash/offline
qualification run. The [completed-work record](./completed.md) includes the exact scope and
credential/resume usability observations. The next product boundary below is unchanged.

## Resume the existing trial

Use **https://mbp.tail0e0d4.ts.net:8443/** on both devices. On the first, choose **I already have a
workspace → Use another account**, then the existing account's invitation action and unlock with
its device-lock code. On the phone, choose **I already have a workspace**, select its saved
**Device connection**, and unlock with the phone's code. Keep both pages open.

The saved approval continues without another passkey or comparison. **Device approved** remains
the heading; the status changes from finishing content access to **Content access is installed
and certified. Opening your writing is the next development step.** A connection error can be
retried with **Check again**, or by reopening and unlocking the same saved connection.

Stop there. The phone does not yet open the account's writing. Its old local writing is not read,
imported, replaced or deleted. The preview banner remains accurate. Next is authenticated content
bootstrap and opening the first device's writing, then two-way/offline sync and ordinary packaged
application integration.

## Durable boundaries

1. The existing device authenticates the saved pair, reveals, typed decision, admitted exact
   wrapping/signing keys and unchanged recovery state. It signs the two-recipient certificate for
   parent epoch 2 / next epoch 3, resolving its own approval key from the parent's certified set.
2. It HPKE-wraps the existing generation-1 key to the candidate with the selected transcript-bound
   `done/enroll-wrap/v1` info. A device signature binds the complete delivery, including that wrap,
   certificate, recovery draft, both commitments/reveals and approval. The exact delivery is saved
   in factor-protected approval custody **before** any key-bearing HTTP request. Failed/lost sends
   retry those bytes; they do not rewrap or sign a new pending certificate.
3. The service verifies the proof and equality with its retained approved ceremony. Its delivery
   row is immutable and accessible only with one of the admitted participants' signing proofs.
   Pending admission, a relay label or an invitation alone cannot create a delivery. A saved
   approval can continue after its interactive deadline; this does not permit another comparison.
4. The candidate independently verifies the delivery against its own saved ceremony, opens HPKE
   with its existing factor-protected wrapping credential, and seals the key under its local root.
   Delivery/recovery material and the sealed installed key commit together in its encrypted
   approval carrier. Only after reading that committed carrier and successfully reopening its
   sealed key does it countersign the exact delivery hash. That countersignature is saved before
   sending. An aborted installation save therefore sends no installation proof.
5. The service verifies that countersignature, authenticates its complete original-publisher
   ledger and serializes epoch 3 at epoch 2. The immutable certificate/installation, accepted-head
   vector, authority pointer and new ledger witness commit atomically. Both roster members are
   certified with the same account capabilities. Each client verifies this exact successor against
   its staged delivery and retains it. An uncertain reply resumes the same installation/certificate.

A competing verified successor is never a reason to reuse the comparison against another parent.
The pending delivery is retained even if it cannot activate; a released key cannot be taken back.
General successor histories, replacement credentials and rotation are still outside this runtime.

## Concrete carriers and limits

- `account-protocol/contentDelivery.ts`: closed, ordered JSON in the existing domainMessage
  framing. Whole transfer ingress and retained delivery/successor are bounded to 48 KiB.
  Domains are `done/content-key-delivery/v1`, `done/content-key-installed/v1`,
  `done/content-transfer/v1` and `done/device-certification-epoch/v1`. The recipient-set signature
  uses the existing TRD certified-set LP construction with epoch pair 2/3. The delivery hash covers
  the entire signed delivery, not merely its recipient or plaintext-key identity.
- `src/account/contentHandoff.ts`: saved approval continuation. No new factor ceremony, comparison
  budget, route-derived authority or editor selection is introduced.
- `src/account/ceremonyVault.ts`: the existing exclusive mandatory-factor slot owns all work.
  `done/installed-content-key/v1` derives a distinct non-extractable AES-GCM sealing key from the
  root, with slot/root IDs in HKDF info. AAD includes those IDs and the complete delivery hash.
  IV is four zero bytes plus a big-endian 64-bit reserved sequence. The existing global seal
  budget is durably advanced before encryption; abandoned reservations burn. Raw key buffers
  are erased. The sealed key is separate from the pending slot's original empty-local key.
- Schema 9 adds `content_transfers(workspace_id, delivery, artifact, boundary_witness)`. Normal
  opens refuse older schemas; the offline upgrader backs up both SQLite databases, operator key
  and pin before the additive upgrade. No existing attempt or account row is rewritten by upgrade.

The original publisher's service history now verifies issuance at epochs 1, 2 and 3, including
already-queued earlier-epoch envelopes and exact old decision retries. There is still one publisher
ledger. The older epoch-1/2 discovery endpoint refuses at 3 instead of advertising a stale current
head; the preview's fresh nonce-bound bootstrap includes the complete certification successor.
General sync-client discovery/adoption, second-reader content bootstrap and multiple-publisher
transport remain the next integration work. Certification here establishes eligible keys, not a
claim that every account capability has a product path.

## Focused evidence

The new service cases cover approval/role boundaries, changed keys/recovery/transcript/approver,
immutable delivery and lost replies, atomic certification abort/lost reply/restart, original-writer
history across all three epochs, a concurrent authority change, and explicit schema-8 upgrade.
The browser cases use two disposable profiles, real WebCrypto/IndexedDB and virtual passkeys:
sender reload after a lost delivery response; receiver close after installation but before sending;
lost certification reply; and a real IndexedDB abort on the installed-key save with no outgoing
countersignature. Cold resumption preserves the exact delivery, sealed key and installation bytes.

Run the affected browser file with `pnpm test:device-enrollment`; focused service checks with
`node --test --test-timeout=30000 test/account-ceremony/content-transfer.test.mjs`.
The completed-work entry records the final results and preview deployment. These are focused
development checks, not renewed release qualification or a general conformance campaign.
