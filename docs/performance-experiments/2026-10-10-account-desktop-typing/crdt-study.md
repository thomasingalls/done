# CRDT requirements study: would a purpose-built engine remove the cost?

2026-10-10, at `23fd688d`. Read-only study by a delegated agent: nothing was built or run. The agent
had not seen the coordinating session's recommendation, but its brief did say that each keystroke
runs on a forked document and why the fork exists, so its agreement with that recommendation is only
partly independent. It was written before the [measurement](./README.md) finished; the closing
section says how the measurement bears on it. Citations use basenames under `src/crdt/` unless a
directory is given.

## Bottom line

A purpose-built CRDT would remove the fork and full-comparison cost, but so would a much smaller
change that keeps Yjs. The cost comes from Yjs's transaction model (mutate in place, emit bytes
afterwards, no abort), not from its merge algorithm, data model or byte format. For text edits that
mismatch can be closed inside the seam with no format change: compute the update bytes without
mutating, journal them, then apply.

The study recommends that restructure first, built so the application owns operation generation.
That is also the first part of any custom engine, so it loses nothing if the project later goes
further. A full custom CRDT with its own format is roughly an order of magnitude more work, and it
does not touch the costs that remain afterwards.

## 1. Data model and operation mix (verified in code)

| Root | Shape | Operations performed |
|---|---|---|
| `meta` | flat `Y.Map`: `schemaVersion`, `createdAt`, `setting.rolloverHour`, `actor:<id>` (plain object), `device-label:<deviceId>` | set only, last-writer-wins (`doc.ts:88-96`, `112-122`; `actors.ts:164-172`, `260`; `workspaceCommands.ts:340-349`) |
| `master` | one plain `Y.Text` | insert/delete (`workspaceCommands.ts:225-230`; `moves.ts:323`, `392-394`, `461-462`, `603`) |
| `cards` | `Y.Map<CardId, Y.Map{id, text: Y.Text, origin, author, createdAt}>` | create, delete; fields other than `text` are write-once (`days.ts:118-126`, `149-153`; `moves.ts:248`, `325`, `542`, `608`) |
| `cardLocations` | `Y.Map<CardId, "date:section">` | set/delete; the single arbiter of membership (`days.ts:85`, `138-146`) |
| `days` | `Y.Map<ISODate, Y.Map{next, scheduled, done: Y.Array<CardId>, archive?: Y.Text}>` | day map created lazily under the system origin; array insert/delete of id strings (`days.ts:213-229`; `moves.ts:180`, `214-217`, `232-233`) |

- **No rich-text features.** No formatting attributes, embeds, XML or subdocuments; foreign content is
  refused (`yjs.ts:400-405`).
- **Archive is legacy read-only.** Destructive compaction is paused (`compaction.ts:46-64`).
- **Move is not a CRDT primitive.** It is array delete plus insert plus a `cardLocations` write,
  reconciled by `repairCardMemberships`, an O(workspace) scan (`days.ts:484-587`). The scan runs before
  and after every non-text command, and before text commands unless the basis is known repaired
  (`workspaceCommands.ts:181`, `355`).
- **Concurrently created day containers lose their arrays.** This is a known schema problem
  (`docs/TRD.md:1902-1950`).
- **Operation mix.** Of 17 command kinds (`workspaceCommands.ts:39-57`), one (`text`) carries
  essentially every latency-critical event; TRD §12 calls 18 bytes the common update size
  (`docs/TRD.md:2419-2420`). The rest are discrete gestures on the 100 ms class of budget. This is
  inferred from the command set and corpus, not from usage telemetry.

**Per-keystroke CRDT work today, Account path (`reference` mode):** three whole-document forks
(`admissionDocument.ts:35`; `admittedWorkspace.ts:262-264` with the redone-link scan and deep
undo-stack copy at `yjs.ts:603-659`; `admissionDocument.ts:71`), two full comparisons
(`admissionDocument.ts:74`; `admittedWorkspace.ts:572`/`610` via `admissionQueue.ts:821`), and a
whole-workspace snapshot (`admittedWorkspace.ts:676-719`). The Local `local-snapshots` path drops the
draft fork but keeps one full comparison per key (`admissionQueue.ts:368-370`), an undo-stack copy
(`yjs.ts:743-749`) and the snapshot.

## 2. Requirements

**Must**

1. Character-granular text merge, plus last-writer-wins registers and maps, and ordered card placement
   with a single winner under concurrent moves (`docs/TRD.md:126-132`, `246-249`).
2. Updates are idempotent and commutative, and replay in any order. Each stored record is
   independently decryptable (`docs/TRD.md:614-615`, `715`; `admissionDocument.ts:20-24`).
3. Local update bytes must exist, be bounded at or below `MAX_UPDATE` (16 KiB, `journalCodec.ts:6`)
   and be journalled before anything becomes authoritative. A refusal must leave the document equal to
   recoverable state (`docs/TRD.md:739-763`). This is the requirement Yjs does not meet natively.
4. Missing dependencies are tracked explicitly, original frames are retained, and the pending state is
   observable (`yjs.ts:393-394`; `contentCompaction.ts:169-172`; `docs/pending-projection.md`,
   `docs/yjs-delivery.md`).
5. Undo and redo are scoped to the local human actor and session, span text and structure, exclude
   system and received changes, group by command, and restore selection (`yjs.ts:582-589`;
   `admittedWorkspace.ts:328-369`, `607`; `moves.ts:94-99`).
6. Stable anchors that survive concurrent edits and queued predecessors. They are used for queued
   selections, split points, move-from-master lines and undo selection (`workspaceCommands.ts:91-118`;
   `admittedWorkspace.ts:728-761`).
7. Per-transaction bytes with actor attribution, at most 64 per slice (`admittedWorkspace.ts:298-314`;
   `sourceCapture.ts:31`).
8. A full-state snapshot, the ability to merge many deltas into one state record, and a deterministic
   coverage descriptor that covers deletions. A bare state vector is ruled out (`docs/TRD.md:735`,
   `1411-1428`; `yjs.ts:770-776`).
9. Total, bounded validation of untrusted bytes before persistence (`admissionQueue.ts:335-355`;
   `accountInbound.ts:226`).
10. Deleted text content does not persist in state indefinitely (`docs/TRD.md:164-166`).
11. Change events fine enough for incremental projection (`src/editor/admittedText.ts:226-246`;
    `days.ts:168-199`).
12. A decoder for existing Yjs data: legacy import and every stored record and envelope.

**Should**

- Staged apply with rollback for every command, not only text.
- A size bound known before encoding.
- O(1) coverage ("is this operation present").
- A canonical state encoding or hash.
- Writer ids bound to the signing credential. Today the Yjs client id is a random uint32 per session,
  unrelated to credential or actor (`admissionDocument.ts:13-18`; `docs/TRD.md:477-480`).
- A placement model that removes the repair pass and the day-container problem.
- Removal of the vendor patch.

**Not needed**

- Rich text or marks, per-character attribution (deferred, `docs/TRD.md:472-475`), time travel, a tree
  CRDT, peer-to-peer sync protocols, real-time many-writer interleaving quality.
- The CodeMirror binding: the production UI mounts `createAdmittedEditor`, which does not use
  `yCollab` (`src/ui/workspaceUi.tsx:13`, `165`). This weakens the ecosystem argument in TRD §2.1.

## 3. Yjs seam inventory

| Internal used or modified | Where | Why it was needed |
|---|---|---|
| `doc.store.pendingStructs` / `pendingDs` read, copied and nulled in a shallow read view | `yjs.ts:57-61`, `155-172`, `338-349`, `393-394` | The encoder folds pending bytes into the snapshot, and re-applying changes the missing map. Pending state has no public API. |
| Subclassed `UpdateEncoderV2` / `UpdateDecoderV2` with `Y.readUpdateV2`; reserved lib0 tag 0 | `yjs.ts:75-181` | A private in-process fork transport. There is no clone or fork API. |
| `ComparisonEncoder extends UpdateEncoderV1` reaching lib0 `restEncoder.bufs/cbuf/cpos`; normalise-by-reapply fallback | `yjs.ts:184-375` | There is no document equality. State encoding is not canonical: it varies with item splits and garbage-collection retention. |
| Undo internals: `undoStack`/`redoStack` assignment, `lastChange`, stack-item DeleteSets and `meta`, `item.redone`, `getItemCleanStart/End` | `yjs.ts:596-659`; `admittedWorkspace.ts:315-369` | Undo state cannot be forked or serialised, and wire updates do not carry redone links. |
| `store.clients` walks, `Item`/`Content*` instanceof checks, `_start`, `.right`, `_length`, `parentSub` | `yjs.ts:251-269`, `397-405`, `663-709` | Eligibility scans that prove a delta replay equals a fresh fork. |
| `doc.clientID = writer`; re-roll on collision | `admissionDocument.ts:38`; `admittedWorkspace.ts:271`; `admissionQueue.ts:361-364` | The writer id must match between the fork and canonical. |
| `Y.snapshot`, `equalSnapshots`, `encodeSnapshot`, `createSnapshot(ds, new Map())` | `yjs.ts:47-50`, `337`, `770-776` | Coverage descriptors that include deletions. |
| Patch to `integrateStructs` / `readUpdateV2` wake-up bookkeeping | `vendor-patches/yjs@13.6.31.patch` | Cross-client dependency cycles stranded pending structs after all originals had arrived. The application delivers original frames in arbitrary order and never merges incomplete unions. |
| Outside the seam: `Y.decodeUpdate` as validator (5 sites), `Y.mergeUpdates`, the `[0,0]` empty-update literal, `transaction.changed`, derivation tags naming `yjs-13.6.31` | `contentCompaction.ts:61`, `176`; `admissionQueue.ts:538-540`; `account-protocol/admission.ts:25`, `genesis.ts:19` | Yjs semantics leaking past the import seam, which `docs/TRD.md:1816-1820` already concedes. |

Every internal dependency supplies one of four things Yjs does not model: fork or rollback, document
equality or canonical form, visibility of pending-dependency state, and portable undo state. None
concerns merge semantics or the text algorithm. About 45 source modules import the seam's `Y`, and
more than 30 test and script files import `yjs` directly, so "migration touches one file"
(`yjs.ts:9`) is no longer true.

## 4. Cryptographic coupling

| Object | CRDT bytes inside | Protection and binding | Granularity | Dependence on exact encoding |
|---|---|---|---|---|
| Journal entry (localStorage) | Local: one merged Yjs update. Account: source capsule (JSON, hex Yjs updates plus actor). | XChaCha20-Poly1305 in sync WASM; AAD = workspace, generation, storage key (`journalCodec.ts:26-27`, `92-100`) | per admitted slice, ≤16 KiB | opaque |
| StoredRecord `update`/`state` | one Yjs update or merged state | AES-256-GCM; AAD = principal, workspace, store, v, gen, seq, kind (`contentRecord.ts:116-129`) | per record | opaque; trim uses `mergeUpdates` and exact-record coverage (`contentCompaction.ts:169-176`) |
| Source capsule | per-transaction updates plus actor | canonical JSON re-encode check; deduplicated by id and exact bytes (`sourceCapture.ts:98-110`, `156-158`, `185-187`) | per slice, 1–64 sources | exact-byte identity only |
| Envelope v2 | `updates: Bytes[]`, one actor | AES-256-GCM under a per-credential key; Ed25519 over header, nonce and ciphertext digest (`docs/TRD.md:1089-1100`; `account-protocol/envelope.ts:34-38`) | per batch | opaque, but minted bytes are frozen forever: no re-mint (`docs/TRD.md:1160-1169`) |
| Acceptance chain | none (ciphertext digests) | per-credential hash chain, service-signed heads (`docs/TRD.md:1254-1259`) | per position | none |
| Checkpoint and manifest | full Yjs state; manifest signs SHA-256 of `sv` and `ds` | every restorer re-derives `sv`/`ds` and compares bytes (`historyCheckpoint.ts:89-91`, `162-164`; `docs/TRD.md:1467-1477`) | per checkpoint | hard: deterministic Yjs descriptor bytes under a named derivation tag |
| Inbound | `decodeUpdate`, persist, promote; coverage by fork, apply, compare | `inboundLedger.ts:250-280` | per update | exact-byte dedupe |

The cryptography treats CRDT bytes as opaque almost everywhere. Exact encoding matters in two places:
the `sv`/`ds` descriptors, which are versioned by tag, and byte-identity dedupe. The account service
is CRDT-agnostic apart from those tag strings.

What a co-designed CRDT would change, with the study's assessment of each:

- **Staged apply or plan-before-apply.** The one high-value property. It removes the fork, the
  comparison and about 1,000 lines of ownership machinery (`workspacePreparation.ts`, `forkHistory`,
  `sameDocState`).
- **Operations as the sealed and signed unit.** Already effectively true. The gain is that the capsule
  could be the batch itself, with no JSON/hex wrapper and no double validation
  (`accountCapture.ts:321-333` encodes, validates, decodes and revalidates on every key).
- **Hash-chained operations.** Mostly redundant: the envelope layer already chains per credential. A
  per-replica running digest would make "same operations applied" an O(replicas) check. It proves set
  equality, not state equality, and with a single document that check has nothing to compare.
- **Replica ids bound to the credential.** For example `replica = H(credential_id, session nonce)`,
  verified at admission. The study rates this a real gain and infers that Yjs would silently diverge
  if a compromised credential forged items in another device's id space. Profile clone or rollback
  and multiple tabs make stable ids hard, so per-session ids probably remain.
- **Deletions as operations.** A version vector then covers them, `ds` disappears and coverage becomes
  O(1).
- **Canonical snapshot encoding.** Identical checkpoint plaintext from two devices, and a cheap state
  hash.

## 5. Candidates

Effort figures are the study's relative estimates, not measurements.

| Candidate | Per-keystroke CRDT work | Guarantees | Effort and proof | Migration |
|---|---|---|---|---|
| **a1. Keep Yjs: one document, encode-then-apply for text, fork-and-swap for rare commands** | O(edit): resolve anchors, encode about 20–40 bytes, seal, `applyUpdate`, stock undo capture. No fork, no comparison. | Text refusal isolation by construction: nothing is applied before the journal accepts. "Shown equals canonical" by identity. Rare commands keep today's proof. | 1×. New proof: the encoder equals Yjs `insert`/`delete`, differentially against the retained reference path. | None. |
| a2. One small Yjs document per card or day | O(card) fork and comparison | Multi-card atomicity (split, merge, move-from-master) and cross-document undo get harder. Coverage descriptors multiply. | 2–3× | Plaintext framing and manifest coverage change. |
| b. Automerge 3.5 / Loro 1.16 (WASM) | O(edit) plus boundary copies | See notes below. | 4–6× plus budget amendments | Full format migration. A third-party format becomes frozen inside signed envelopes. |
| b. json-joy (pure TypeScript) | O(edit); patches are built before apply | Natural plan-before-apply. Undo exists but needs replay for non-sequence operations. | 4–6× | Full format migration. |
| **c′. Own engine, Yjs V1 wire-compatible subset** | O(edit), rollback for every command | Everything in a1, plus rollback for structure and undo, no patch, no internals. Stock Yjs is an exact byte-level oracle. | 4–6× | None on disk or wire. |
| c. Own engine, own format | O(edit) | Adds O(1) coverage, canonical hash, credential-bound ids, schema fixes. | 8–12×, plus permanent ownership of a CRDT | Full: see section 6. |

**a1, concretely.** The command becomes a pure function from read-only document and intent to update
bytes. For a text edit that is one V1 struct (origin and right-origin ids from the existing
relative-position calls, or the parent when the text is empty) or a delete set, about 200 lines in the
seam. Journal the bytes, then `Y.applyUpdate(doc, bytes, humanOrigin)`. Stock `UndoManager` tracks by
transaction origin and keeps undo-needed items alive on a garbage-collecting document (verified in the
installed yjs 13.6.31, `UndoManager.js:216`, `255`). With no fork, the redone-link and stack-copy code
is dead on the hot path. Structural commands, undo and redo keep prepare-on-fork-then-swap; they are
rare and on the 100 ms budget. One rule needs amending: "every accepted transition checks projection
consistency" (`docs/pending-projection.md:16-18`) becomes identity on the hot path. A variant without
the hand encoder applies first and rebuilds from carriers on the rare refusal; it loses session undo
history on refusal, so the study rates it worse.

**b, facts the study checked by web lookup on the day.**

- `loro-crdt@1.16.4` WASM is 3,398,779 bytes raw; `@automerge/automerge@3.5.0` is 3,644,225 bytes raw
  (jsDelivr listings). The study estimates 1.2–1.5 MB gzipped.
- `docs/TRD.md:2467-2468` requires the application to be fully usable for writing before lazy WASM
  arrives, so either engine breaks that rule or the 350 kB budget.
- Loro has a local per-peer UndoManager with origin-prefix exclusion and cursor hooks. Its stacks
  clear when the peer id changes, and the default depth is 100.
- A third-party repository reports two Loro failures: a panic and poisoned document on a reused peer
  id, and a WASM module left unusable after a movable-tree time-travel crash (loro issues #1117 and
  #1118; fix status unknown). That matters when a compromised credential can send arbitrary bytes.
- Automerge changes are SHA-256-identified with dependency hashes and (actor, counter) operation ids.
  That fits the envelope model well. It keeps full history by design, and the latest evidence found
  (issue #985, late 2024) says there is no core undo; not confirmed for 3.5.
- json-joy: `Model.fork` is an O(nodes) deep clone, there is no transaction rollback, and
  `Log.undo(patch)` builds an inverse patch but needs replay to the pre-patch state for non-sequence
  operations. Pending-dependency behaviour and bundle size were not established.
- diamond-types is plain-text only on main and describes itself as a prototype.
- The repository's own WASM assessment already warns about boundary copy costs
  (`docs/performance-experiments/2026-09-15-f17-r2/wasm-assessment.md`).

**c, sketch.** Three operations: `txtIns(obj, left, right, string)`, `txtDel(obj, idRanges)`,
`regSet(key, value)`. A flat register keyspace with no nested containers. Card placement is one
register `(date, section, orderKey)`, so a move is one write with one winner, which deletes the
arrays, the repair pass and the day-container problem. Run-length-encoded per-replica batches with an
actor and a sparse dependency vector; pending means holding whole batches. A canonical sorted
snapshot. Text as a Fugue- or YATA-family sequence; array-of-runs is enough at card sizes.

To build and prove: convergence under arbitrary order and duplication; a total, canonical,
hostile-input-safe codec with golden vectors from the first day, because bytes are frozen in
envelopes; rollback exactness; snapshot-plus-suffix equivalence; undo laws under concurrent remote
edits; anchor stability; content garbage-collection safety; converter determinism.

Genuinely hard: sequence integration and run-splitting bookkeeping; undo against content garbage
collection (deleted content must be re-supplied, with an old-to-new id redirect for anchors);
order-key ties and growth; replica identity under profile clone; encoding stability forever.

**Yjs as differential oracle.** Sequential command histories through the existing reference runner
(`workspaceCommands.ts:128-129`), comparing `WorkspaceSnapshot`, export, undo counts and selections
after every step. Multi-replica permuted or duplicated delivery, compared exactly when no concurrent
same-position inserts occur and otherwise modulo the order of concurrent runs. Reuse of the existing
generated campaigns (`docs/yjs-delivery.md:30-34`, `docs/pending-projection.md:34-37`). Byte-level
equality of normalised state, `sv`/`ds` and pending state, which is available only to c′.

Many of c's semantic wins are schema choices that Yjs can also express: the placement register, flat
keys, a deletion flag instead of structural delete.

## 6. Migration

- **a1 and c′:** nothing changes on disk or wire.
- **b and c, on disk:** a new StoredRecord version or kinds, a new journal prefix (today `2:`,
  `journalCodec.ts:62-66`), and a staged install of converted state. The checkpoint install machinery
  is the model for that.
- **b and c, on the wire:** a new envelope body domain, a new manifest derivation tag, and a cutover
  checkpoint.
- **The hard part is mixed-format concurrency.** A device offline across the cutover holds signed
  Yjs-format envelopes that must still be admitted (`docs/TRD.md:1239-1240`) and cannot be re-signed
  (`docs/TRD.md:1223`). Either every receiver converts late Yjs updates deterministically, which
  requires the new engine to embed Yjs ids and reproduce YATA ordering and is effectively c′; or a
  flag-day rule requires pre-cutover outbound to drain under the old engine first, which is realistic
  for one user with a few devices but is a protocol change.
- **Conversion of converged state is feasible:** text, registers, placement, `Card.author` and
  creation certificates. Undo stacks are session-scoped, so there is nothing to carry.
- **A Yjs decoder must remain** (lazy-loaded) for legacy import and old records in every candidate.

## 7. Where a custom CRDT would not help

- **The floor.** Recorded bare-CodeMirror control p95 is 7.3–19.0 ms on CPU-4x emulation and up to
  17.9 ms on desktop; plain textarea is 5–7 ms (`docs/performance.md:491-495`, `690-692`). No engine
  beats that. The 16 ms p95 budget may need its own disposition regardless, as
  `docs/latency-diagnosis.md:37-38` already anticipates.
- **Whole-workspace publication** (`admittedWorkspace.ts:676-719`; `src/ui/workspaceUi.tsx`). Yjs
  already provides the events for an incremental projection. The snapshot design is the application's
  choice.
- **`EditorState.create` with the markdown extension on every text command**
  (`workspaceCommands.ts:190-198`). The standalone Goals path already keeps a persistent state
  (`src/editor/admittedText.ts:105`, `196-208`).
- **The synchronous seal and localStorage write.** Recorded at 35–240 µs on a Pixel 9a, already small.
- **Capsule JSON/hex encoding and double validation on the Account path.** A wrapper choice, not an
  engine property.
- **Membership repair scans.** Schema, not engine.

## 8. The study's recommendation

Do a1, with the existing `reference` mode retained as its oracle. Do the non-CRDT items in section 7
in the same slice, or the gate will still fail for unrelated reasons. Treat the operation-generation
layer as the seam where c′ could later replace the integrator without touching bytes.

Do not adopt a WASM engine. Do not start a new format: `docs/sessions.md:3788-3790` records that the
project "does not invent … a new CRDT", and nothing found shows that assumption has expired for the
format. It has expired only for the transaction model.

Evidence that would move the study to c′: after a1, profiles show `applyUpdate`, UndoManager or
observer cost above about 1–2 ms per key on a phone; fork-and-swap for structural commands or undo
breaches 100 ms at multi-year workspace sizes; the hand encoder proves brittle beyond text; Yjs v13
becomes untenable; or the roughly 28 kB gzip is needed back.

Evidence that would move it to c: a protocol requirement Yjs's format cannot carry, such as
credential-bound operation ids as a security property, a canonical state hash in manifests, or
replica-acknowledged garbage collection to re-enable compaction.

Evidence against going further at all: a1 brings card typing within noise of the bare-CodeMirror
control.

## 9. Verified, inferred and recalled

- **Verified by reading code and documents:** everything with a file and line citation. Timing figures
  are quoted from the repository's documents, not measured by the study.
- **Verified by web lookup:** WASM sizes, Loro undo behaviour, the Loro crash reports (a third-party
  repository), the Automerge change format, json-joy `Model` and `Log` behaviour, the diamond-types
  README, the yjs 13.6.27 size.
- **Inferred:** the operation mix; a1's per-key cost; that `applyUpdate` with a tracked origin yields
  correct undo stack items (the origin check is verified, the rest of the handler is from memory); all
  effort multipliers; the gzip estimates; the forged-id divergence in section 4.
- **From memory, unchecked:** Automerge's low-level rollback and clone cost; Loro fork cost; the
  equivalence between Fugue and a modified YATA; that deleted json-joy text keeps only tombstone
  spans. Collabs and cola were not evaluated.

## Checked afterwards

Lines re-read by the coordinating session and found as cited: `docs/performance.md:491-495` and
`:690-692`, `src/crdt/workspaceCommands.ts:185-198`, `docs/sessions.md:3788-3790`. The remaining rows
were not independently re-read.

Against the measurement:

- **The CRDT is not where the measured desktop cost is.** On a small workspace the whole synchronous
  input handler, forks and comparisons included, measured about 3 ms p50 on a fresh account. The
  measured cost is ledger re-validation after storage transactions, which no engine choice changes.
- **One CRDT-adjacent cost was measured.** Under `reference` preparation the handler's p95 grew with
  undo depth to 56 ms after about 2,200 edits, through `forkWorkspaceHistory` and `copyHistoryStacks`.
  Candidate a1 removes that path.
- **Not exercised.** Workspace-size costs: the measured sessions had no seeded corpus, so the
  per-key fork and comparison cost at the September gate's 20-day corpus was not re-measured.
- **The writer-id observation is a security question**, separate from latency, and has not been
  examined beyond the study's inference.
