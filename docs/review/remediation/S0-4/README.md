# `S0-4` — the outbound spool and the refusal nobody could sign

**Started:** 2026-08-27 · **Inputs:** [`S0-1`](../S0-1/README.md) and [`S0-2`](../S0-2/README.md) complete;
branch `RC-4A` recommended by the review and taken

The last of the seven actions. Its two findings are the same defect from opposite ends: **`seq` is one number
serving two roles, and neither the bytes that claim a position nor the answer that closes one is durable.**

## Findings this action must close

| Finding                                       | Severity | What fails today                                                                                                       |
| --------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `f-992bc91-outbound-envelope-spool-undefined` | medium   | A crash after minting loses the exact nonce, digest, signature and link; no re-send is possible and no re-mint is safe |
| `f-745e332-envelope-refusal-carrier-missing`  | medium   | _A definite refusal is the only thing that licenses a re-mint_ — and no object can express one                         |

## Why they are one action and not two

Row 4 made **exact bytes load-bearing** — a random nonce, a signature over them, a digest of the ciphertext —
without selecting anywhere to keep them. Row 6 made **definite refusal load-bearing** — the only license to
re-mint — while pointing at row 15's transition `Outcome`, which names a `(kind, workspace, lineage, target)`
and cannot identify an envelope at all.

Each is sound about its own half. Composed, they describe a client that must resubmit bytes it no longer has,
or act on an answer nothing can send it. **Both halves are about one position number**, and a repair to either
alone leaves the credential stalled.

## What `RC-4A` already got right, and the one place this departs from it

Branch A is taken as recommended: an encrypted local spool plus a signed refusal, preserving row 4's carrier
and following row 15's already-validated _persist the exact bytes before the first network byte_ pattern.

**The departure is the attempt cap, and it took two passes to get right.** The options record says a refusal
creates _the sole attempt-1 slot_ and that attempt 1 _cannot create attempt 2_. Read literally that caps the
chain at two, which fails liveness: an epoch that moves twice refuses both attempts and the credential is
stalled with no licence left. Stage A therefore lifted the chain cap and kept the slot.

**Stage D's model showed the slot forbids nothing.** Every attempt at a position competes for the one digest
that position will ever accept, so _at most one accepted digest per position_ — a rule row 5 already had —
already permits only one of them to win. A mutation removing the slot changed no result, which is what _not
load-bearing_ looks like when it is measured instead of argued. **What replaced it is load-bearing**: a refusal
licenses its own position and no other, so a licence for _n_ cannot be spent at _n+1_ — which would be the
skipping row 4 forbids, arriving through the back door.

## Stages

|       | Stage                  | Output                                                                   | Status                                                     |
| ----- | ---------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **A** | Durable record schemas | the spool record, the position counter, and the signed position decision | **done** — [`A-schemas.md`](./A-schemas.md)                |
| **B** | Normative construction | TRD §§6.1/7.4/7.5                                                        | **done** — §6.1 gains a fourth kind, §7.5 the other answer |
| **C** | Selection rows         | rows 3, 4, 5, 6                                                          | **done** — rows 3, 4, 5, 6                                 |
| **D** | Executable evidence    | refusal bytes and negatives; the crash schedule as a model               | **done** — 15 published negatives, 17 tests, 12 mutations  |
| **E** | Product surface        | PRD §7.5 and §7.12                                                       | **done** — §7.5 gains the lie in the other direction       |

### Stage D, and the two things it changed about Stage A

**Two artifacts, on the project's own split: bytes go in vectors, sequences go in tests.**

`test/vectors/antireplay.json` gains the refusal — its message, its `K_accept` signature, and **fifteen
negatives**. Nine are the bound fields one at a time, and each is built so **the client's own envelope follows
the patch**: four of those fields are read twice, once by the signature and once by _is this about me?_, so a
negative that changed only the message would refuse on the mismatch and prove nothing about the binding. Three
more carry **genuine signatures for the wrong subject** — the service really did sign them, and they are not
about this envelope, which the field negatives structurally cannot reach. The last two are the silence cases:
an unsigned error body, and a refusal under a key no epoch certifies. The AAD audit went from 181 fields to 190.

`test/outboundSpool.test.ts` is the part that is not a value — **17 tests, 12 mutations, all caught**: a kill
between minting and sending, a kill between sending and the reply, two tabs reserving, a reservation abandoned
before minting, the successor chain, the permanence of a refusal against a delayed original, and the retention
floor.

**A mutation deleted a rule and nothing failed, which is how the design got better.** Stage A had departed from
`RC-4A` once already — lifting its cap on chain _length_, which would stall a credential the second time an
epoch moved under it — while keeping its _sole successor slot_ per refusal. Removing that slot from the model
changed no result: every attempt at a position competes for the one digest that position will ever accept, so
row 5's _at most one accepted digest per position_ already permits only one to win. **The slot forbade nothing.**

What replaced it does forbid something: **a refusal licenses its own position and no other**, so a licence for
_n_ cannot be spent at _n+1_ — which would be the skipping row 4 forbids, arriving through the back door. That
rule has a falsifier that isolates, and the one it replaced never could.

**A second mutation found a verdict nobody tested.** Making `decide` license a re-mint on _any_ signed refusal
broke nothing, because the model checked the position and never the digest. The generator publishes that case
as bytes; the model now has it as a verdict, and a signed refusal at my position for somebody else's attempt is
silence.

**One thing is deliberately not tested here.** An `outbound` record cannot be read as `state`, `update` or
`heads` — and the negative that proves it is `heads-record-read-as-state`, which already exercises the `kind`
field of the same AAD in the same generator. A fourth value of a field whose binding is under test adds a case,
not a property, and claiming otherwise would be the shape of finding this action exists to close.

### What Stage E changed

**§7.5 described one direction of a hostile relay and not the other.** Withholding an envelope from the
accepted set is there in detail; **withholding an acceptance and returning an error instead** was not, and it
is the one that costs a user their writes rather than their privacy. An error is now explicitly not an answer,
and the client's response to one is to re-send **the same bytes**.

**And §7.5 now says why a device keeps its writes rather than only its edits.** An edit can be re-made; the
write that carried it cannot be re-made identically, because part of it is random. A device that kept only the
edit would have nothing safe to send after a crash and would have to choose between stalling and equivocating.
Test 6 gains the mirror case.

## Not in scope

- **The relay and acceptance service implementation** — Stage 4. This selects the decision object and the
  states a client moves through, not the service that issues them.
- **The local database schema.** `RC-4A` says so explicitly and it is right: which object store and which index
  is Stage 1's, once the record shape is fixed.
- **Row 4's carrier bytes**, which stay exactly as selected. Branch B would have reopened them and there is no
  evidence of the spool-size problem that would justify it.
