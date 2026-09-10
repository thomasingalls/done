# Private Account outbound preparation

The following [source-capture phase](./account-source-capture.md) implements durable admission; this
document retains the preceding preparation findings and the allocation boundary that follows capture.

This phase implements the envelope codec and tests the proposed durability boundary. It does **not**
implement a durable spool, publish edits, authenticate a relay answer, or change the default app. The
private Account editor still has no relay. The next bounded phase is durable source capture at admission;
position allocation and persisted envelopes follow it.

## Corrections established by preparation

The S0-4 model is useful historical evidence, but its `mintAt` combines encryption and commit. Running
its actual declarations three times against the same durable reserved row, discarding each promote,
produces three fresh envelopes with a durable budget of one. Its successor mint also adds no budget.
Counting positions cannot count every encryption invocation. A position reservation and a seal reservation
are different durable facts; an old reservation cannot grant a fresh invocation after restart.

The v1 network derivation also omits the credential even though its counters are per credential. Two
credentials holding the same generation key derive the same AES key. Two individually permitted counts
of 2^31 reach the first disallowed aggregate count, 2^32. The reproduction checks actual HKDF equality and
the arithmetic, not billions of encryptions or an observed nonce collision.

The actual Account editor supplies a third counterexample: a failing outgoing observer cannot revoke an
accepted journalled edit. The edit survives renderer death; the observer does not replay it on reopen,
and compaction leaves a state record without an outbound record. This is correct for the current editor's
document-durability contract. It disproves using that observer as the only source for a future outbox.

## Private v2 envelope

No encrypted network format has been deployed. New private seals therefore require version 2, rather
than preserving a shared-key accounting defect for compatibility. V1 is accepted only when a caller
explicitly requests v1 verification, for historical vector readback. A route requiring v2 refuses v1.
V1 sealing is refused. This codec is internal and grants no credential or publication authority.

The clear fields remain `v, workspace_id, credential_id, epoch, gen, seq, nonce, digest`. `seq` is the
network position, never a local record sequence. The sealed body stays row 4's v1 body encoding:
LP domain, actor ID and kind, then u32 count and u32-length-prefixed original update bytes.

```
K_net = HKDF-SHA256(K_g, salt="",
        info=LP("done/envelope/v2") || LP(workspace_id) || LP(credential_id) || LP(dec gen), L=32)
AAD   = LP("done/env/v2") || LP(dec v) || LP(workspace_id) || LP(credential_id)
        || LP(dec epoch) || LP(dec gen) || LP(dec seq)
sig   = Ed25519(S_device, LP("done/env-sig/v2") || the six AAD fields after its domain
        || LP(hex nonce) || LP(hex SHA256(ciphertext)))
wire  = LP("done/envelope-wire/v2") || the six AAD fields after its domain
        || nonce[12] || digest[32] || u32be(ciphertext length) || ciphertext || signature[64]
```

The random nonce is selected before encryption; it could be included in AAD without circularity. The
historical prose claiming otherwise is incorrect. This construction keeps the chosen split: nonce and
ciphertext digest are signed, while ciphertext digest cannot be an input to its own construction.

LP is u16 byte length followed by printable ASCII. Identifiers use 1–128 ASCII letters, digits, `_` or `-`.
Integers are positive safe integers with canonical decimal encoding. Parsing rejects unknown versions,
domain/version mismatch, leading-zero numbers, malformed lengths and trailing bytes. Initial local limits
are 256 nonempty updates and 4 MiB sealed plaintext, with a bounded wire overhead. These are defensive
codec limits, not a measured batching policy. Input is captured before async crypto; returned bytes are
detached. Plaintext/key copies are erased when operations settle.

The content-blind verifier requires an explicit route and externally resolved device public key, checks
route, ciphertext digest and signature, and returns opaque validated fields. The opener then authenticates
and parses the body. Neither operation proves epoch certification, membership, actor authorization,
acceptance, revocation freshness, predecessor-chain continuity or durable local capture. The future owner
must open the **prepared, certified Account signing credential**, not the original Local signing key.

V2 gives one key domain per workspace/credential/generation. One durable `NetSealCounter` must own every
invocation in that domain across restarts. Credentials are fresh per enrollment; raw profile cloning,
counter rollback, or two independent installations using the same credential are outside this argument.
Restore must enroll fresh credentials or establish an unrewound single counter before sealing.

## Durable capture to build next

Hold the existing exclusive Account slot permit throughout verification, activation, admission and close.
Start capture at an authenticated format fence before the first admitted Account initialization or edit.
The first implementation may start from v4's verified frozen genesis. It must refuse automatic conversion
of an already-editable v5 history: earlier compaction may have erased its per-update attribution. Preserve
that writing; a separately verified catch-up checkpoint would be needed to publish it. There are no real
Accounts yet, so this restriction does not require redoing the author's Local migration.

Each accepted local update must itself persist an encrypted **intent capsule** containing a stable intent
ID, workspace, prepared signing credential, actor ID/kind, referenced epoch/generation and exact update
bytes. Derive this metadata from the authenticated owner and admitted command, not caller-supplied transport
fields. The synchronous journal write is the admission boundary. A later callback cannot supply missing
durability. A failed or pressured capsule append leaves the edit pending under the existing staging rule.

The database fallback must persist the update and its outbound obligation in the same transaction. On
journal flush, write both before removing exactly the journal entries covered by that commit. A crash in
the duplicate window must deduplicate by intent identity and exact bytes; conflicting reuse refuses.
Content compaction may replace document records only while the corresponding outbound obligations remain
durable. It must not infer outbound coverage from a state vector, local sequence prefix, or snapshot.

Use a versioned Account carrier/layout and retain intent records independently of compactable content.
Old readers must refuse its authenticated activation marker, including after a lost activation reply.
The existing Local journal/store format stays unchanged. The implementation phase must define the exact
capsule bytes, size accounting, layout version, authenticated metadata and cancellation/flush transactions
and test their actual native boundaries before marking this boundary complete.

Replay capsules as exact Yjs updates, including pending structs and deletions. An outbound capsule keeps
its original source attribution even when replay is not yet visible. Remote input must retain its original
authenticated envelope and must never enter this local capsule path. The public Account receive path stays
disabled in this phase. Genesis/checkpoints carry existing state separately; snapshots cannot substitute
for the original envelopes of other writers.

## Allocation and exact retry after capture

1. Under the same owner, select a bounded, homogeneous batch of durable local capsules. Atomically grant
   the next network position and stage its reserved row with exact capsule IDs and bytes (or authenticated
   references whose retention is guaranteed). Never advance the counter without the row. Resolve the
   earliest reserved position before granting further positions in the first serial implementation.
2. Before **each** AES invocation, strictly commit a fresh seal-budget reservation under the current key
   domain. Refuse before its count reaches 2^32. Only the live continuation of that acknowledged reservation
   may invoke encryption once. Cancellation/crash abandons permission and conservatively retains the count.
   Recovery reserves another attempt at the same position; a generation move requires its own new count.
   The local outer StoredRecord seal consumes its existing, separate local-store budget as well.
3. Persist the exact canonical network bytes, their position and exact capsule coverage atomically in the
   authenticated encrypted spool. Only then may a caller obtain bytes for submission. Delete covered intent
   records only in that same commit, or retain them until an exact authenticated follow-up deletion. Local
   record sequence allocation remains independent; a local sequence gap cannot create a network gap.
4. Read the persisted bytes for every submission. Mark an attempted send before dispatch if tracking it;
   that state means **may have been sent**, since a crash can precede actual dispatch. Neither `minted` nor
   `sent` permits new encryption. Lost request, lost response, unsigned errors and unrelated answers all
   leave an unknown outcome and require identical retry.
5. Keep unresolved rows indefinitely. A verified head about another digest at this position is an error,
   not permission to advance. Accepted/closed retention may eventually use the second-newest admitted
   checkpoint floor; there is no time-based deletion or clear-on-send operation.

The first owner will expose no arbitrary `accepted`, `closed`, or `remint` setter. Until the acceptance
and refusal verifiers exist, all exposed delivery outcomes remain unknown and preserve exact bytes.
Successors need the selected current-lineage `K_accept` verification, all five refusal subject fields,
permanent digest closure and the parent's refusal ID. Row 4 has no envelope field for `parent_refusal`;
the submission/proof carrier still needs concrete framing and authentication rules before successors or
a relay are enabled. Do not smuggle it into an unsigned trusted parameter or extend v2 silently.

## Evidence and limits

`pnpm account:outbound` checks unchanged v1 reference vectors, independently generated v2 vectors, codec
properties, actual guard-removal controls, the current model counterexamples, a proposed split-reservation
model and a real Account journal/renderer-crash reproduction. Seeds and generated inputs are retained.
The model uses explicit atomic commits, volatile permissions and an external invocation/admission oracle;
it does not test a native spool, MAC verification, authenticated refusal, accepted heads or real rotation.
Those remain implementation obligations, not credit from a green model. No personal browser or server is
used. This phase pays no whole-protocol conformance debt.

## Private spool continuation

[Account spool](./account-spool.md) implements the next private v7 phase: separate position and
invocation grants, exact persisted v2 wire and an authenticated metadata witness for ledger completeness.
All source obligations remain retained. Response/refusal authority and relay submission remain separate.
