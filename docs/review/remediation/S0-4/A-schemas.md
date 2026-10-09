# `S0-4` Stage A — durable record schemas

**Standing:** home — sections here are pinned and swept by the authority map; read back by
`pnpm authority:check`.

**Status:** proposed for `S0-8` review · not implemented · `RC-4A`, with the attempt cap corrected ·
**amended 2026-08-28 at the `S0-4` return** — the reservation stages its own durable row in §§1–2 (`FU-10`),
and the refusal's subject carries the envelope's epoch with the verifier resolved from the lineage in §3
(`FU-06`), with the falsifier map continued at rows 20–26

## 0. Two numbers are called `seq`, and they are not the same number

§6.1's `seq` is monotonic per _(principal, workspace)_ and spans the content and `heads` stores. §7.4's `seq` is
**the credential's own outbound and accepted position**. They share a name, a type, and a role in a nonce
budget, and they are different sequences with different owners.

**Nothing says so today**, and an implementer reserving "the seq" has an even chance of reserving the wrong one.
It is said here because this review has already found two rows crediting each other with a state neither
carried, and a shared name across two sections is the same mistake with less to notice.

## 1. `OutboundEnvelope` — the spool is the retention, not a queue in front of it

**No new format.** The spool is §6.1's `StoredRecord` at a fourth `kind`, in its own object store:

```
StoredRecord { v, gen, seq, kind: 'outbound', nonce, ct }

  plaintext = the complete envelope of §7.4 -- clear header, sealed body, signature
  AAD       = as row 3 already binds it, with kind = 'outbound'
```

**Its own object store, for `heads`'s reason.** §6.1 puts `heads` in a separate store so the content load path
never meets a record it cannot apply as a Yjs update. An outbound envelope is not an update either, and sharing
the store subkey is safe rather than merely economical **because `kind` is in the associated data** — the
binding that already stops a `heads` record being read as a `state` record stops this one too.

**And it is the retention row 6 already requires.** Row 6 retains a device's own outbound envelopes back to the
second-newest admitted checkpoint; this is where they live. So there is no pending queue _and_ an archive —
there is one store, and `state` distinguishes what is still owed an answer from what is merely retained:

| `state`    | Meaning                                                        | Cleanup                            |
| ---------- | -------------------------------------------------------------- | ---------------------------------- |
| `reserved` | Position granted in the reservation's own transaction; no bytes exist yet (`FU-10`) | Resolve first                      |
| `minted`   | Persisted, never sent                                          | Resolve first                      |
| `sent`     | May have been submitted, no authenticated answer          | Resolve first                      |
| `accepted` | A verified `Head_n` covers this digest                         | Below the second-newest checkpoint |
| `closed`   | A verified refusal permanently closed this digest              | Below the second-newest checkpoint |

**The row exists from the reservation, not from the mint** (the `S0-4` return). A `reserved` row carries the
position and retained exact source capsules, and no network envelope — the sealed bytes arrive when the mint
promotes it to `minted`, in the promote's own transaction. `state` and the position are the store's cleartext
metadata beside the sealed envelope. The private implementation must authenticate position, lifecycle state,
source coverage and budget metadata and compare exact prior bytes at commit. A metadata flag never grants
acceptance or refusal authority. A `sent` flag is written before dispatch and means submission may have
happened; a crash can precede actual network dispatch.

**Nothing is deleted for being old, and nothing unresolved is deleted at all.** Two conditions, and the second
is row 6's floor rather than a new one.

## 2. `PositionCounter` — reserve position and seal permission separately

**Corrected 2026-09-10 during private outbound preparation.** The old model combines encryption and
promotion. Three mints interrupted before promotion consume three invocations while its durable count
remains one; its successor path increments no count. The actual declarations are reproduced by
`test/account-outbound/preparation.test.mjs`. The original model remains historical evidence, not
proof of invocation accounting. [Private v2 contract](../../../account-outbound.md) specifies the
implementation boundary; TRD §7.4 carries its corrected network key domain.

`PositionCounter.next_position` remains per workspace/credential and monotonic. One atomic transaction
advances it and stages a reserved row with that position and exact, durably retained source capsules.
A counter-only grant is forbidden (`FU-10`). Capture must be part of local admission and survive
journal flush and content compaction; an outgoing observer is insufficient. No reserved position can
be skipped, and recovery cannot invent a payload from an unattributed current snapshot.

A separate `NetSealCounter.reserved[gen]` counts invocations under the v2 key derived for that
workspace, credential and generation. Before EVERY invocation, including recovery under the same
generation and each refusal-licensed successor, strictly commit a fresh reservation. Refuse before
its count reaches 2^32. Only the live acknowledged continuation may invoke encryption once. A crash
abandons the permission and keeps the count; a durable abandoned reservation never grants a new seal.
A generation change requires another reservation under the generation actually used (`FU-09`).
Counting at promotion is too late because crypto happens before that transaction.

After encryption, persist exact network bytes and exact capsule coverage atomically before any
submission. A reserved row can be occupied at the same position after restart, with a fresh seal
reservation and its original capsules. A minted row instead requires exact byte retry. Local outer
StoredRecord encryption independently reserves its own local sequence and seal invocation.

V1's derivation shares one network key across credentials, so independent credential counters cannot
bound its aggregate invocations. V2 binds credential and generation into the derivation. This assumes
fresh credentials at enrollment and one unrewound, unbranched counter history per credential. It does
not license raw copied-profile writers. No native allocator, rotation, successor or relay integration
is claimed by this schema correction.

## 3. `PositionDecision` — the answer, signed by the key that already answers

```
Accept = the existing Head_n of §7.5, unchanged.

Refuse = LP("done/position-refuse/v1") || LP(dec v) || LP(workspace_id)
         || LP(credential_id) || LP(dec position) || LP(hex refused_digest)
         || LP(dec epoch) || LP(reason) || LP(hex parent_refusal)

  sig            = Ed25519( K_accept ; Refuse )
  refusal_id     = SHA-256(Refuse)
  parent_refusal = 32 zero bytes for the first attempt at a position
```

**`K_accept` signs it, and that is what keeps the authority from growing.** Acceptance and refusal are two
answers from one decision domain; giving refusal its own key would create an authority that can induce a
re-mint without being able to accept anything, and a client shown one of each for the same position would have
no rule to apply. **A compromised `K_accept` can already forge acceptance heads**, which is strictly worse than
forging a refusal, so this adds no reachable power. §7.5's separation — `K_accept` certified by the
authorization key, rotatable without touching it — is unchanged.

**The subject is five fields, and the fifth is the epoch** (`FU-06`). `epoch` in `Refuse` is the epoch **the
refused envelope itself references** — fixed at mint, inside the envelope's own AAD and signature — so a
refusal names exactly one envelope: `(workspace, credential, position, refused_digest, epoch)`. Before the
return the field was signed and then read by nobody: the client's comparison stopped at position and digest,
so a refusal about an envelope minted under another epoch could still be read as an answer about this one.

**A refusal is permanent, and that is the whole content of the word _definite_.** It closes
`(workspace, credential, position, refused_digest, epoch)` forever. The service must never accept that digest
afterwards, however delayed its arrival, and answers a late resubmission with the same `Refuse` **message** —
under its live `K_accept`, since `refusal_id = SHA-256(Refuse)` binds the message and not the signature, so
the licence and the chain survive an ordinary rotation. Without permanence a client could re-mint on a refusal
and then have its original accepted behind it — two links at one position, which §7.5 reads as a compromised
credential.

**A successor names its licence, and a licence is good for one position.**

- `parent_refusal` names the refusal that licensed this attempt. The first attempt at a position names zeros.
- A successor whose `parent_refusal` names no refusal the service issued is refused.
- **A successor at a position the refusal does not name is refused** — a licence for _n_ spent at _n+1_ is the
  skipping row 4 forbids, arriving through the back door.
- **A successor may itself be refused**, licensing one more. Nothing caps the chain: `RC-4A`'s text caps it at
  attempt 1, which stalls a credential the second time an epoch moves under it.

**And nothing caps the attempts, which is where this record was wrong before the model was written.** Stage A
first departed from `RC-4A` by keeping a _sole successor slot_ per refusal while lifting the chain cap. Writing
the executable model showed the slot forbids nothing: every attempt at a position competes for the one digest
that position will ever accept, so **at most one accepted digest per position already permits only one to win**.
A mutation removing the slot changed no result — which is what _not load-bearing_ looks like when it is measured
rather than argued, and it is the reason the position binding above is here instead.

**What a client may do with one:** resolve `K_accept` from **the epoch in force in its authenticated
lineage** — the same certification the acceptance head resolves through, never a key taken from the answer and
never merely *an* epoch it once held; verify the signature under that key; check that **all five subject
fields are its own envelope's**, the epoch included; then mint exactly one successor at that position binding
`refusal_id`. **Everything else is silence** — an unsigned body, a refusal for another digest, a refusal
naming another epoch, a refusal under a key the lineage does not currently certify — and silence means
resubmit the identical bytes, which is what the spool is for.

**What the epoch buys, exactly** (`A-03`). Before the return the verifier was injected beside the answer and
the rule said *an epoch it holds*, so a genuine refusal signed under a **stale or forked** `K_accept` — a
delayed old-key compromise — could name a current envelope's other fields and license a re-mint, discarding
current outbound bytes. Now it is silence both ways: naming the envelope's epoch it fails the signature,
because the resolution is the lineage's current certification and a retired key is not it; naming the retired
key's own epoch it fails the subject. The residual is stated rather than discovered: a client whose lineage
tip is withheld verifies under the certification it last learned — §7.5's stated availability bound, no new
power — and a refusal signed ahead of the client's tip is silence until the lineage catches up, which costs
nothing, because the re-mint the refusal licenses references the current epoch and so needs the same catch-up.

## 4. The three-way rule, at a third object

Row 15 selected it for transitions and row 6 for positions; this is the same rule with the carrier row 6 was
missing:

| What the client has                                             | What it means                          | What it does                                        |
| --------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| Nothing, or anything unauthenticated                            | Unknown — accepted, in flight, or lost | **Resubmit the identical bytes** from the spool     |
| A verified `Head_n` over its own digest                         | Accepted                               | Mark `accepted`, advance                            |
| A verified `Refuse` over its own digest                         | Never accepted, and never will be      | Mint one successor binding `refusal_id`             |
| A verified `Head_n` over a **different** digest at its position | Somebody else's link is there          | Refuse and report: this is §7.5's equivocation case |

**Resubmission is safe in both unknown cases**, which is why silence needs no further distinction: identical
bytes are idempotent against a service that accepts at most one digest per position, whether the first request
was lost before arrival or its reply was lost after acceptance.

## Falsifier map

| #   | Falsifier                                                                                | Schema |
| --- | ---------------------------------------------------------------------------------------- | ------ |
| 1   | A kill after minting and before sending leaves bytes that resubmit **identically**       | 1      |
| 2   | A kill after sending and before the reply resubmits the same digest and is accepted once | 1      |
| 3   | An `outbound` record cannot be read as `state`, `update` or `heads`                      | 1      |
| 4   | An unresolved envelope is never trimmed, whatever the checkpoint floor                   | 1      |
| 5   | A resolved envelope is trimmed only below the **second-newest** checkpoint               | 1      |
| 6   | Two tabs reserving concurrently receive different positions                              | 2      |
| 7   | A reserved-but-unminted position is occupied at recovery, never silently skipped         | 2      |
| 8   | The nonce budget reads `reserved[gen]`, not `next_position`                              | 2      |
| 9   | **An unsigned error body is silence, and the client resubmits rather than re-minting**   | 3, 4   |
| 10  | A refusal signed by a key no epoch certifies is silence                                  | 3      |
| 11  | A refusal naming another digest, position, credential or workspace is silence            | 3      |
| 12  | **A refused digest is never accepted afterwards, however delayed**                       | 3      |
| 13  | A successor binding its parent refusal is accepted                                       | 3      |
| 14  | A successor at a position its refusal does not name is refused                           | 3      |
| 15  | A successor naming no issued refusal is refused                                          | 3      |
| 16  | A successor may itself be refused, and the chain continues                               | 3      |
| 17  | A second digest accepted at one position is refused by every client                      | 4      |
| 18  | Identical resubmission returns the same decision rather than a second one                | 4      |
| 19  | A signed refusal at my position for a digest that is not mine is silence                 | 3      |

The `S0-4` return (2026-08-28) continues the map at rows 20–26 — `FU-10` first, then `FU-06`:

| #   | Falsifier                                                                                        | Schema |
| --- | ------------------------------------------------------------------------------------------------ | ------ |
| 20  | The grant and the `reserved` row are one transaction — no schedule shows a counted position with no durable identity | 2      |
| 21  | A `reserved` row is occupied at recovery by a fresh first attempt at its own position, and the chain advances through it | 1, 2   |
| 22  | Recovery under a moved generation counts the fresh licence where the mint seals; the abandoned licence stays counted | 2      |
| 23  | A kill after the promote resubmits the exact bytes — recovery re-mints only what was never minted | 1      |
| 24  | A genuinely signed refusal naming another epoch is silence                                       | 3      |
| 25  | A refusal under a key certified only at a retired epoch is silence — the verifier resolves from the lineage's current certification, never from the answer | 3      |
| 26  | A refusal signed ahead of the client's tip is silence until the lineage catches up, and the licence works exactly when the re-mint is possible | 3      |
