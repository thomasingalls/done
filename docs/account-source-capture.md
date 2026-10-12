# Private Account source capture

Current capsule, ledger and witness bytes are pinned in the
[Account ledger contract](./account-crypto/account-ledger.md); this phase narrative retains its original scope.


`openOwnedCapturedAccountWorkspace` adds durable source capture to the exclusive Account editing
lifetime. An admitted slice retains its original transaction updates and their actors before it becomes
visible. These retained sources survive journal flush, restart and content compaction. They are inputs
to a future outbound spool, not network envelopes or evidence of server acceptance.

## Activation and ownership

Open under the slot's existing exclusive writer permit. Authenticate the factor, authority pin, passkey,
original genesis ancestry, prepared Account credentials, receipt, destination binding and slot index as
for the preceding Account editor. The source route uses the **prepared Account signing credential**,
not the original Local signer. Require certified human-principal and system actors bound to that signer.

V4's frozen, verified `handoff-selected` genesis may activate. Drain its old raw-update journal to content,
then remove exactly that observed journal. Refuse activation while any cleanup remains or while heads or
outbound rows already exist. Strictly commit authenticated promotion marker **v6, `account-capturing`**
before opening admission or running workspace initialization. A lost completion after this commit resumes
as v6. A failed commit permits no captured initialization. Earlier closed parsers refuse v6; the current
ordinary Account journal factory also explicitly refuses v6.

V5 editable histories refuse automatic activation. A separately verified catch-up checkpoint is needed
because their attribution may already have been compacted away. Their writing is retained. There are no
real Accounts to convert today. The default Local app, its stored formats and the author's installation
remain separate from these private factories.

The lifetime owns capture, admission, projection, undo history, flush and compaction. Native asynchronous
operations serialize and stay under the permit through cancellation/drain. Close immediately revokes
surfaces, waits for native work, erases owned source buffers and destroys documents before release. Public
receive refuses before persistence. Internal carrier functions and `listCaptures()` are module seams for
composition and tests, not authenticated network ingress or public authority to invent an actor.

## Versioned bytes and physical layout

The existing encrypted journal and StoredRecord v1 wrappers remain unchanged. V6 changes the **Account
carrier's plaintext schema**. No physical IndexedDB upgrade is needed: compactable raw updates stay in
`content`; encrypted source capsules occupy the existing noncompactable `outbound` store. `heads` must
remain empty. The authenticated v6 fence separates these semantic formats. A future envelope spool needs
its own explicit tagged union and reader fence; it must not interpret these payloads as envelopes.

One capsule contains this canonical UTF-8 JSON array, without whitespace:

```
["done/source-capture/v1",1,intentId,workspaceId,signingCredentialId,principalId,epoch,generation,
 [[actorId,actorKind,lowercaseHexOriginalYjsUpdate], ...]]
```

Identifiers are exactly 32 lowercase hexadecimal characters, except the literal system actor `system`.
The intent ID is freshly generated random 128-bit identity **once per prepared admission slice**. It
survives journal refusal, database retry and journal/disk overlap. It is neither a network position nor a
local sequence. Epoch is a positive safe integer; this first-generation owner requires generation 1.
Each source actor is either the authenticated principal with kind `human`, or `system` with kind `system`.
The enclosing AEAD authenticates every field; decoding additionally compares every route field to the
verified owner. Unknown versions, malformed Yjs bytes, altered routes and noncanonical encodings refuse.

The workspace adapter observes each actual Yjs transaction on its private history document. It retains
separate updates when one command includes multiple transactions, with their individual actor origins.
Undo operations are attributed to the human; system initialization, repair and bulk moves keep the system
actor. The admission owner independently replays those original updates over accepted state and requires
that they cover the complete prepared change, including pending information. Returned source buffers
transfer to admission and are erased on completion or refusal. An admitted command which makes no Yjs
change retains the explicit `[0,0]` no-op under the invoking human identity; this includes reopening an
already-initialized fixture. It does not reconstruct or relabel historical writing.

A capsule has 1–64 source updates, at most 1 MiB total raw source bytes and at most 2 MiB encoded bytes;
hex framing overhead means the encoded cap can bind sooner. Actual admitted document slices retain the
existing 16 KiB prepared-update limit and existing command slicing. Capsule overhead counts against the
4 MiB pending reservation along with source copies; retrying an oversized preparation restores its base
reservation. The synchronous journal applies its existing update-size and character-pressure limits to
the **encoded capsule**. A capsule can exceed that limit even when its raw prepared update fits, forcing
the atomic database path. There is no unbounded in-memory overflow queue.

## Admission, replay and exact overlap

On the fast path, append one encrypted capsule synchronously. Only successful journal persistence admits
the change into canonical state. The pressured path leaves input pending while it first flushes earlier
journal entries, then strictly commits the original raw source updates **and one outbound capsule** in
one content transaction. Each record uses the existing store-bound encryption and committed invocation
reservation. A capsule's updates and obligation are never split between transactions.

A journal flush may span bounded database batches, but each capsule stays atomic. It removes only the
observed journal entries after all their source groups have committed. A crash or cleanup failure can
leave the same capsule in the database and journal. Deduplicate by intent ID **and exact capsule bytes**;
conflicting reuse refuses before a database write, during replay or before compaction. Repeating Yjs
content does not by itself authorize deleting a source obligation.

Database recovery replays raw content/state. Journal recovery expands capsules to their original source
frames, skipping exact identities already on disk. Never merge pending Yjs frames to hand them off:
original updates and delete sets remain retained even while their dependencies are missing. A controlled
pending-source fixture is test ingress; it does not enable unauthenticated receive. Acknowledged local
commands use the existing staged durability contract for dependencies.

Content compaction validates capsules on every authenticated database census, validates the journal,
then uses the existing exact-coverage content compactor. It retains every outbound row and never treats
a snapshot/state vector as outbound acknowledgement. `listCaptures()` reads a detached, deduplicated
union of database and journal sources. It grants no remove, accepted, closed, remint or send operation.
Sources accumulate until a later verified protocol can discharge them; large-backlog scaling is unproven.

## Evidence and remaining boundary

`pnpm account:capture` invokes the bounded runner. It records source hashes, per-stage deadlines, streamed
progress, the seed and each generated native history before execution, controls and final status. Native
checks use disposable Chromium profiles. Unit properties independently reconstruct visible text and
compare exact original source bytes under reversed delivery and duplicate carrier overlap; route
substitutions and conflicting identities refuse. Retention and route controls remove actual implementation
guards and must exhibit bad acceptance/lost attribution. The same tests also exercise malformed bytes,
source coverage, actor ownership, native abort/crash, v5/old-reader refusal, factor/pin identity checks,
forced database admission, compaction and cancellation/drain.

This is bounded implementation evidence, not proof of the full protocol. The existing unrewound,
unbranched storage-history assumption remains: it does not detect a full profile rollback or deletion
of every piece of local evidence. No operator key/pin distribution, rollback witness, relay, concurrent
Account writers, rotation, receipt/refusal carrier or second-device enrollment is added here.

Next, allocate network positions and persist exact v2 envelopes from these durable sources. Keep position
allocation distinct from each committed encryption-invocation reservation, retain exact retry bytes across
unknown outcomes, and use the prepared certified signer. Verified acceptance/refusal carriers and relay
integration follow separately. See [outbound preparation](./account-outbound.md).

## Private spool continuation

[Account spool](./account-spool.md) implements the next private v7 phase: separate position and
invocation grants, exact persisted v2 wire and an authenticated metadata witness for ledger completeness.
All source obligations remain retained. Response/refusal authority and relay submission remain separate.

## 2026-10-12 — Single-frame text preparation

The owned Account editor's [direct text adapter](./account-text-admission.md) may prepare one human
text frame without executing it speculatively. Its source is that exact update buffer; the queue
checks this identity and the carrier retains its normal actor/route checks. Journal persistence
or the existing forced native commit still precedes applying it under the human origin. This
bounded source-equality proof replaces replaying a separate speculative source document for that
case only. Native structural/system/undo preparation and all stored capsule formats are unchanged.
