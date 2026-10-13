# Durable local baseline anchoring and compatibility fences — 2026-10-13

The [authority/checkpoint and reader phase](./account-local-baseline-transitions.md) is committed
signed as **`43fe12aa`** (`G`). This phase implements a **private carrier primitive**, exercised only
against disposable stores. It does not connect an installer to the application, select a baseline
for an ordinary Account reader, or delete history. The full-history reader remains authoritative
in the product. General release validation and publication remain paused. This phase is uncommitted.

## The durable representation

`localBaselineAnchor.ts` defines a closed **counter v3** with the existing allocation fields and an
independently authenticated `baseline` pointer. It is deliberately a separate type/parser from
`ContentCounter`: no ordinary consumer can silently strip the pointer and interpret the store as v2.
The pointer binds:

- Carrier `done/local-baseline-carrier/draft-1`, `history: "complete"`, revision and the **keyed
  commitment** (draft-2 payload MAC) to the exact verified payload.
- Encryption generation, first reserved sequence, chunk count and exact packed plaintext length.
- The counter's existing identity, initialization intent, active generation, all generation
  reservation counts, next sequence and spool witness, under one MAC.

The MAC domain is `done/content-counter/local-baseline-draft-1`. Its canonical tuple includes the
existing allocation payload under its original v2 encoding, plus every pointer field. This is a
component of the new signature, **not** permission to downgrade the stored counter. Neither a v2
counter MAC nor a baseline payload MAC authenticates the pointer.

The original payload MAC plus payload are encrypted in **256 KiB chunks** (the last may be shorter).
The payload retains its current **4 MiB encoded limit**, plus 32 packed MAC bytes: at most 17 chunks.
Chunking bounds an encryption/native value; it does not lift the overall eligibility limit or claim
to cover arbitrary months of writing. Oversize candidates refuse before allocation. Future larger
snapshots and partial/unaccepted-source bounds still need a deliberate extension.

Each chunk uses the existing v1 `heads` sealed-record envelope and content generation key, but lives
at the metadata key `["local-baseline", index]`, **not** among ordinary logical history rows. Its
sequence is reserved from the existing content invocation budget; these records cannot reuse an
ordinary content sequence. The encrypted prefix binds every local identity, carrier, revision/commitment,
generation, allocation range, packed size and chunk index, in addition to the envelope AAD. A moved,
reordered, missing or changed chunk refuses. The metadata MAC is checked before any chunk decryption;
counter/chunk bounds are checked before allocating the assembled plaintext. The reader never learns
its expected commitment/revision from the decrypted payload. The counter MAC is verified
independently, the payload MAC must equal that retained commitment, and the actual payload MAC
is verified before the reader returns anything. Only then is the SHA-256 replay anchor returned.
This bridge preserves the pure replay API without exposing an unkeyed plaintext hash on disk: a
public plaintext hash could otherwise provide an offline test for sufficiently predictable content.
An initial implementation retained that hash; review tightened it to the keyed commitment before
closing this phase.

Only the first revision, one current-generation anchor, and complete physical history are supported
here. Replacements, generation transitions and a trimmed representation are deliberately refused by
this private parser until their owning transitions/readers are implemented. Nothing writes these draft
bytes in the shipped app, so this is not a public stored-format migration.

## Reserve, then commit together

`localBaselineStorage.ts` exposes no deletion operation. Its caller must already own the Account slot
exclusively, hold the admission/authority fence through native settlement, and supply a detached census
and candidate from completed full verification. The candidate MAC is not a substitute for protocol
replay: only the scoped verified builder should produce it. The application installer that establishes
these prerequisites is the **next phase**, not hidden inside this primitive.

The primitive itself:

1. Copies inputs before awaiting. Authenticates the ordinary v2 counter, candidate MAC and independent
   hash; checks identity, generation, exact cut, full reservation map and witness. Checks physical
   placement, unique sequences and the census's last committed sequence.
2. Repeats the complete owner-supplied fresh authority check. In a strict all-store IndexedDB
   transaction, compares every existing key/sealed byte and the exact counter with the verified census,
   repeats the synchronous owner activity/journal check, and reserves all chunk invocations durably.
3. Encrypts each chunk once. Any failure abandons the entire reservation; it is never rolled back or
   reused. A retry must rebuild against the new counter. No candidate/chunk is persisted at this stage.
4. Signs the v3 counter, repeats fresh authority, then repeats the physical census and synchronous
   boundary checks in another strict all-store transaction. That transaction adds every encrypted chunk
   and replaces the counter together. **It changes no history row, custody, journal or service record.**

An aborted reservation leaves the original counter. A failure after reservation leaves ordinary v2
storage with burned invocations. A committed final transaction leaves the complete v3 pointer/chunk
set. Request success is never reported as transaction success. After a lost committed reply, the
private carrier reader discovers the authenticated anchor without reserving or sealing again; blindly
retrying installation refuses. Native work stays behind `SessionTask.wait` through settlement.

The two full physical comparisons are intentional first-installer work, not a new warm-path scan.
This phase does not measure or optimize their cost. No live Yjs document or undo stack is replaced.
Live installer admission/undo continuity still requires its own integration evidence.

## Compatibility and restore boundaries

Ordinary readers/writers accept only counter v1/v2. The new ordinary parser maps v3 to
`app-update-required`; it does not authenticate or authorize it. The actual predecessor parser from
`43fe12aa` already refuses v3 as `repair-required`. It also rejects the additional metadata keys.
The existing Account custody/slot interlocks and exclusive Web Lock still apply; this phase does not
create, remove or bypass the stable `application-upgrade` marker, nor alter shared database layouts.
Before a real installation, all ordinary in-flight work must drain and the installing owner must stop
using its old warm counter/view. No other cooperative Account owner may coexist under the slot lock.

A reader-capable release must precede enabling the writer, or the owning update must explicitly require
compatible clients. The new format must stay fenced after eventual deletion. Reverting an image pin
will not make an anchored profile readable by an older client. The new parser's `history: "complete"`
is a refusal boundary, not rollback permission; no unfence/downgrade API is implemented.

An altered/missing pointer or chunk refuses. An intact, matching older **whole profile** can still pass
its old authentication: revision/hash chaining is not an external monotonic witness. This work makes
no stronger restore/rollback claim. Exact journal/source restore exclusion, old in-flight reads and
old checkpoint-cut evidence remain prerequisites before deleting any history.

## Focused evidence and limits

[Retained logs and source hashes](./development-evidence/2026-10-13-local-baseline-anchoring/README.md):

- **108 Vitest checks across six files**, including 31 new carrier checks. They cover authenticated
  scope/cut/bounds, caller isolation, missing/reordered/corrupt chunks, MAC domain separation,
  counter/row changes, fresh-authority/activity refusal, native transaction abort injection,
  cancellation, reservation-before-encryption, failed-attempt burns and successful rebuild beyond
  those burns. The existing baseline suite retains its generated replay histories; this phase starts
  no generalized fault or mutation campaign.
- **Four focused native Chromium checks**, with real WebCrypto, IndexedDB strict transactions and
  slot Web Locks: successful anchoring; renderer death after reservation; final-transaction abort;
  and renderer death after commit before the caller gets its reply. Cold reads confirm intact physical
  history and the expected representation. Both the current ordinary owner and a bundle using the
  predecessor's exact `contentRecord.ts` refuse anchored storage without changing it.
- These native tests use disposable content and test-generated keys. They test the carrier boundary,
  **not** actual Account custody installation, journal freezing, later rotation, or a baseline-aware
  cold editor. The previous phase's real original/joined journeys remain separate evidence.
- An initial native harness run waited for the `Page.crash` command to reply from a dead renderer,
  timing out two cases. Waiting for the crash event corrected the harness; the rerun passes. The first
  unit activity test also replaced an already-captured callback instead of changing its observed
  activity token; correcting that fixture made it exercise the intended invalidation.
- TypeScript, changed-source lint/format, Yjs patch, ordinary application build, size/origin and
  whitespace checks pass. The ordinary build contains no private carrier writer/format string.
  Timings on this busy host are not performance evidence. Renderer death is not a power-loss test.

## Next bounded phase

Connect a **non-deleting installer and baseline-aware cold reader** to the real Account owner. Mint the
candidate under the scoped census; establish and drain the real activity/journal/authority fence;
retire old warm views after anchoring; reacquire/authenticate metadata on restart; then run complete
protocol/content verification through the shared baseline entry. Continue comparing with intact full
history. Cover original and joined owners, authority/checkpoint transitions, cancellation/lost replies,
and live undo without exposing raw signing or counter-downgrade capabilities.

The remaining full-history-only readers, replacement/rotation transition, historical-flight/checkpoint
policy and journal/restore boundary must be resolved before an atomic deletion phase. No history
removal or deployment is authorized by the carrier primitive alone.
