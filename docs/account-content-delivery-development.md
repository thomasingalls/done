# Development continuation: certify and open writing on the second device

2026-09-18. The operator authorized the next bounded product phase after the real two-device
approval trial. This implements the continuation in [content-approval prep](./account-content-approval-prep.md).
Release qualification remains paused. This is one generation, one admitted candidate and one
certification successor. The subsequently authorized read-only opening is now available for use.

**2026-10-07 walkthrough:** completed through the real Firefox UI with two isolated, disposable
containers and a real Bitwarden passkey saved by the operator. Both sides reached the installed
and certified status, then recovered it after closing both tabs and reopening through the root
splash/chooser with their separate device codes. No new invitation, passkey request or comparison
was needed on reopen. This is desktop development evidence, not a physical-phone or crash/offline
qualification run. The [completed-work record](./completed.md) includes the exact scope and
credential/resume usability observations. The content-opening continuation is implemented below, with a second live walkthrough.

## Resume the existing trial

Use **https://mbp.tail0e0d4.ts.net:8443/** on both devices. On the first, choose **I already have a
workspace → Use another account**, then the existing account's invitation action and unlock with
its device-lock code. On the phone, choose **I already have a workspace**, select its saved
**Device connection**, and unlock with the phone's code. Keep both pages open.

The saved approval continues without another comparison. On the first device, choose **Make writing
available** and use the account passkey. This captures its current writing and enables subsequent
edits to use the existing encrypted delivery path. Return to the chooser to unlock its ordinary editor.
On the second device, choose **Open your writing** and use the account passkey. Its Goals and day
writing appear read-only. **Check for updates** receives later edits from the first device; for this
bounded owner it also requests the passkey. Closing or reloading locks the view. The saved **Device
connection** and device code resume it without a new invitation or comparison.

The second-device view currently needs the preview server available, including on reopen. Its
checkpoint, semantic admission and exact received update evidence are retained under its local
factor; this is durable read-only state, not yet a selected editable Account slot. Two-way writing,
offline opening/convergence, automatic receive polling and ordinary packaged application integration
remain later work. Its old Local writing is not read, imported, replaced or deleted.

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
General sync-client discovery/adoption and multiple-publisher transport remain later integration work. Certification here establishes eligible keys, not a
claim that every account capability has a product path.

## Content opening continuation — 2026-10-07

The operator approved a read-only checkpoint within the shared sync integration, then enabling the
second writer. Yjs remains responsible for applying and merging updates in both directions. The
remaining integration owns authority, encrypted transport, source persistence and restart. A separate
snapshot-transfer feature solely for a read-only demonstration is not the selected approach.

**Transport foundation implemented:** the existing service `read-v2` route now accepts the certified
second reader at epoch 3, with separate reader/publisher lookup and an unchanged single-publisher
ledger. The client verifies the exact admission/certification history, each historical issuance
boundary, original ciphertext, publisher signature, acceptance proof and decrypted update. Reader
eligibility is epoch-specific: later certification does not authorize an earlier pending reader.
The development server mounts the existing submit/read/read-v2 routes, preserving binary framing,
origin/bearer checks and request bounds. This needs no service schema migration.

**Current-source checkpoint and subsequent updates implemented:**

1. The exclusive source lifetime verifies the account/passkey, flushes the encrypted journal and
   cold-replays current content. It creates the TRD §7.6 checkpoint under the existing generation key,
   preserving Yjs state and actor attribution. Full SV and DS, producer signature, certified heads,
   original genesis ancestry and the root-signed passkey binding are verified. The exact checkpoint,
   epoch-3 authority and capture activation commit together in the authenticated promotion marker.
   A publication failure retries the retained bytes. Old local-only owners refuse the newer marker.
2. The original editor then uses the existing v9 sync owner: new original transactions enter source
   capture, spool and ordinary v2 encrypted delivery. The checkpoint is a zero-head baseline for that
   same stream, not an update attributed to a newly invented author. Publication remains safe if
   accepted suffix updates arrive before its HTTP retry; no accepted rows are deleted.
3. The service retains one immutable checkpoint and second-client admission in schema 10's
   `content_checkpoints(workspace_id, checkpoint, admission)`. Signed participant requests at the
   exact certification head distinguish producer publication from candidate admission. The service
   checks authority and signatures but cannot claim semantic verification of encrypted content.
4. The new reader uses its installed key and account-bound passkey proof to decrypt and independently
   replay the checkpoint, compare full SV/DS and check genesis ancestry. It seals the baseline in its
   existing factor-owned approval carrier and reopens that committed baseline before signing its
   semantic admission. The admission is saved before submission; an uncertain response resumes it.
5. The reader authenticates each ordinary `read-v2` response with its own certified signing key and
   the original publisher's history. Exact inbound evidence and the resulting prefix are sealed in
   one save before publication to the view. Reopening replays and verifies all retained evidence,
   including prefix equality and unresolved Yjs dependencies. The static Markdown projection has
   no editing controls; it is only an in-memory view, not an export/import transport.

**Bounded reader ownership:** the receiver continues to use its exclusive enrollment slot and encrypted
approval carrier as a read-only content owner. It does not yet create the regular writable Account
index/selection tuple. Retaining the actual checkpoint and ordinary update proofs gives the next
activation phase a verifiable input; that transition still needs implementation before enabling edits.
The initial snapshot uses the existing 16 MiB genesis/checkpoint bound, with a 72 MiB checkpoint HTTP
limit for hex/coverage framing. The existing 80 MiB approval plaintext limit also bounds the complete
reader state; it caps history at 4096 retained events and reads at most 32 one-entry pages per action.
Larger histories retain progress and require another action, or refuse the supported capacity without
publishing an incomplete new view. General checkpoint replacement/cadence/pruning, additional
successors and multiple publishers are outside this milestone.

**Live result:** after an explicit offline schema-9-to-10 upgrade, the saved Firefox disposable pair
opened the first device's existing two Goals lines. A new day card written in its normal editor then
appeared on the second device through **Check for updates**. Closing and reopening the second tab,
unlocking and using the same passkey recovered both the Goals lines and the later card. The operator
unlocked Bitwarden; computer use completed the remaining actions. This proves the desktop product
path, not physical-phone/offline/crash qualification. The preview remains at
`https://mbp.tail0e0d4.ts.net:8443/`, with live reload disabled; the pre-upgrade backup is
`.dev/account-enrollment-tailnet/backups/schema-9-iRVJk3/`. No personal workspace was opened.

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

The content-opening additions pass the full affected enrollment file (12 browser tests), nine
content-transfer/checkpoint service tests, and 12 selected schema/upgrade tests. Focused cases cover
lost checkpoint replies with byte-identical cold retry, producer-signed false SV coverage, actual
IndexedDB abort before receiver admission, exact publication/admission retries across service commit
failures and restart, wrong roles/keys/current heads, preservation of an accepted suffix, and the
explicit schema-9 upgrade. TypeScript and scoped lint/format checks pass. Release qualification
remains paused; the next product phase is writable second-device activation and two-way delivery.
