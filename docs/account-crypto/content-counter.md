# Authenticated content counter and witness contracts

D4 pins the current implementation at `24bc3a4`. It qualifies the Account-to-Local metadata bridge:
scoped metadata derivation, initialization witness, counter v1/v2 and their ownership checks. Existing
stored bytes and production code are unchanged. Store/journal AEAD, other custody primitives, checkpoint/
startup and migration-only provenance retain their separate open records.

## 1. Scoped metadata key and encoding boundary

Custody opens the active generation secret `K_g` through the factor-protected root, checks its 32-byte
length, and derives a non-extractable 256-bit HMAC-SHA256 key with WebCrypto HKDF-SHA256:

```
IKM = K_g[32]
salt = empty byte string
info = LP("done/content-metadata/v1") || LP(slotId) || LP(principalId)
    || LP(workspaceId) || LP(storeId)
K_meta = HKDF-SHA256(IKM, salt, info, 32)
```

`LP` is uint16 big-endian **UTF-8 byte length** followed by those bytes. Each field is at most 65,535
encoded bytes; lone surrogates refuse before TextEncoder can alias identities. Valid Unicode is permitted
without normalization. There is no trailing NUL or hex intermediary. The actual `loadKeys` invocation
uses empty salt and a non-extractable HMAC key with both sign/verify usages.

Root ID is deliberately absent from this KDF but present in every metadata message. The active generation
number is not an info field; its opened secret supplies key separation. Store-record and journal derivation
remain different constructions. The public helper's typed arguments do not independently validate custody
or current generation: the admitting custody owner must establish scope and opener authority first.
A non-extractable key is not a claim of filesystem/forensic protection.

## 2. Initialization witness bytes and ownership

Write `S = [slotId, principalId, workspaceId, storeId, rootId]`. The message is compact UTF-8
`JSON.stringify` of this array, with exact order and no added prefix:

```
["done/content-witness/v1", ...S, v, state, intent]
```

It has nine items. The stored witness is a structured-clone plain object with **exactly** `v`, `state`,
`intent`, `mac`: v=1, state=`creating` or `ready`, intent=lowercase hex16, and mac=Uint8Array[32].
The MAC is HMAC-SHA256(K_meta, message), not included in its own message. `parseWitness` copies the MAC.
Input object order is immaterial. There is no decoder for this message array: parsing applies to the
stored structured-clone object, then authentication reconstructs the message.

Custody stores the witness under `[slotId, principalId, workspaceId, "content-v1"]` in `entries`.
Initialization authenticates an existing witness before use. Normal open refuses absent/creating witnesses;
fresh creation refuses an already-ready witness. The creation owner checks the other carriers under its
permit and binds a fixed intent. Writing a witness compares the prior payload **and MAC**, or requires
absence, within the custody transaction before replacement. The content database's initial counter is a
separate write; creating/ready state permits explicit resumption, not a cross-database atomicity claim.
Missing initialized metadata cannot silently become a fresh empty store.

## 3. Counter v1/v2 bytes, parser and comparison

The exact messages are:

```
["done/content-counter/v1", ...S, 1, store_id, intent, active_gen, next_seq,
 [[generationDecimalString, reservedCount], ...]]
["done/content-counter/v2", ...S, 2, store_id, intent, active_gen, next_seq,
 [[generationDecimalString, reservedCount], ...], [events, hash]]
```

V1 has twelve items, v2 thirteen. `store_id` intentionally appears both in the scope and the counter.
Compact JSON uses JavaScript number/string serialization and UTF-8. Reservation entries sort by **numeric**
generation, not lexical property order. Generation labels stay strings, counts stay numbers. MAC is
HMAC-SHA256(K_meta, these exact bytes); the stored MAC is not serialized into the message.

The stored plain object has exactly `v, store_id, intent, active_gen, next_seq, reserved, mac`, plus `spool`
only for v2. Parser requirements:

- v is 1 or 2; store_id and intent exactly match the supplied held identity/initialization intent.
  Their independent validity comes from that admitted context, not another counter ID parser.
- active_gen and next_seq are positive safe integers. `reserved` is a plain object with canonical
  nonzero decimal safe-integer generation keys, each at most active_gen. Missing past generations are
  allowed, but the active generation must have an own entry, including zero before its first reservation.
- Each count is a safe integer, at least zero and **strictly below 2^32**. Their safe-integer sum must
  equal next_seq−1. This is lifetime allocation accounting, not a count of surviving disk records.
- v2 spool is exactly `{events,hash}`: nonnegative safe integer events, lowercase hex32 hash. The parser
  does not prove event count/chain correspondence or require zero hash precisely when count is zero.
  D3's owner verifier establishes those semantics.
- mac is Uint8Array[32] and is copied; reservation and spool objects are reconstructed and detached.
  Arrays, foreign/null prototypes, unknown/missing keys and invalid numeric bounds refuse.

Stored metadata is not a canonical JSON wire blob. Object property order is reconstructed; numeric negative
zero in reserved counts or events is accepted and serializes as zero. The payload helpers consume validated
typed metadata; calling them alone is not parsing. `equalCounter` compares reconstructed payload bytes
**and exact MAC bytes**, so equivalent property order compares equal while changed authentication material
does not. This closes the interval between asynchronous verification and serialized native replacement.

## 4. Allocation, ledger coupling and crash model

`reserveCounter` consumes a validated counter and a positive bounded batch size supplied by its owner.
The low-level helper does not validate an arbitrary caller's count. It refuses a different active generation,
a new per-generation count at or above 2^32, or a next_seq outside safe integers. Otherwise it increases
global next_seq and that generation's allocation by the batch size, preserving the v2 witness. Gaps from
aborted batches are expected. The public batch owner checks 1–256 records and at most 4 MiB first;
internal single-event append always reserves one. This is separate from network attempt-grant accounting.

The content owner reads/parses/authenticates metadata before computing a next value. Its transaction reads
again, requires `equalCounter` with the previously authenticated value, checks the held active generation,
and writes the next counter and any rows atomically. A changed comparison retries from a fresh authenticated
read; it cannot simply overwrite a changed MAC. AES invocations start only after the reservation transaction
completes. Later failure abandons that range; retry consumes another range.

Before final append, retained allocations must still cover the reserved range. Account event append also
requires the same prior spool count/hash and exactly one event-count advancement. The final transaction
stores the encrypted event and newly MACed counter together; an inbound batch includes its content updates
in that same transaction. A failed final commit preserves the earlier burned reservation and publishes
neither event nor witness. A correctly MACed rewind, wrong active generation or incorrect ledger is not
made valid by its MAC; structural placement checks and D3's ordered semantic verifier remain operative.

V2 activation first validates the complete retained store and requires the Account validator. It then
atomically changes a v1 counter to v2 with the empty witness. Existing v2 is not reset. V1 compatibility
is allowed only with an empty event ledger. Ordinary Local content readers refuse v2 without the internal
Account capability. Account receipt/member/editor authority still belongs to the enclosing Account owner;
these lower-level tests do not confer it.

**F-15 persistence policy.** `compareAndWrite` now explicitly requests strict persistence for
allocation, activation and final event/counter commits. The helper verifies reported strict durability
before running the body and waits for native completion/abort, refusing unsupported implementations.
The final encrypted attempt event plus witness is the network grant; the earlier local allocation alone
cannot authorize network AES. Custody writes and promotion reservations follow the same policy.
See [reservation persistence](../account-reservation-durability.md) for the grant inventory, loss model,
platform refusal and evidence. The argument assumes accurate initial budgets, corrected writers and
browser/storage compliance with strict semantics. It is not a physical power-loss measurement, a
retrospective repair of old counts, or a restore/clone guarantee. SC-01 remains page/navigation scope.

## 5. Evidence and limits

`pnpm account:counter-contract` publishes eight independent cases: scoped KDF, both witness states, three
v2 counters and two v1 counters, including numeric multi-generation ordering and generation keys beyond
the ordinary array-index range. Mutation and encoded-omission witnesses execute real HMAC; omission
witnesses are distinct from source mutants. Parsers are tested on structured-clone objects, not on an
invented wire decoder. Two hundred shrinking-enabled histories compare allocation with an independent
integer ledger, then reparse, reauthenticate, reorder and tamper with retained metadata.

Native Chromium fixtures exercise actual factor-opened custody derivation, metadata MACs, activation,
ordinary-reader refusal, correctly MACed false metadata, abort between reservation and final commit,
and requested/reported strict reservation and event durability. Two source controls show that removing exact MAC comparison
overwrites metadata changed after authentication, and removing reservation persistence invokes AES before
allocation even though a later rewind check still refuses. Neither forces a crypto success boolean.
Native owner fixtures supply a synthetic slot/exclusion context and a real chain verifier; they are not
Account onboarding. Existing Account spool/receive regressions retain the full protocol composition.

No whole-Local, WASM, general rotation, power-loss, clone/restore or independent-review claim is made.
The generated helper histories model later-generation accounting syntax; production Account custody in
this phase still admits generation 1. Remaining store/journal/custody/checkpoint/provenance work and
F-05/F-06 remain open. The historical D3 evidence stays unchanged; this document corrects its strict-
transaction wording rather than reinterpreting the earlier test results as a durability proof.
