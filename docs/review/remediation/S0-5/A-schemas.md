# `S0-5` Stage A — durable record schemas

**Standing:** home — sections here are pinned and swept by the authority map; read back by
`pnpm authority:check`.

**Status:** proposed for `S0-8` review · not implemented · consumed by the checkpoint and attribution
generators since Stage D · **amended 2026-08-28 at the `S0-5` return** — §1's admission gains its eligibility
and cardinality resolution (`FU-11`), §4 is the staged install machine that was absent (`ST-06`), and the
falsifier map continues at rows 16–23

Notation is the project's own: `LP(s) = uint16be(byteLength(utf8 s)) || utf8 s`, digests SHA-256, signatures
Ed25519.

## 1. `SemanticAdmission` — `RC-5A`

Closes `f-b997cdb-checkpoint-coverage-unchecked`.

Row 7's manifest is signed by the producing credential and binds `sv`, `ds` and `head_vector_digest`. What that
signature says is *this producer made this manifest*. What it does not say is that `sv` and `ds` describe the
snapshot the manifest names, or that the head vector stops where the snapshot stops. The generators check
signatures, digests, sorting and current-body equality against **independent constants**, so nothing in the
evidence ever derived one from the other.

```
A = LP("done/cp-admit/v1") || LP(dec v) || LP(workspace_id)
    || LP(hex checkpoint_digest) || LP(hex manifest_digest)
    || LP(hex derived_sv) || LP(hex derived_ds)
    || LP(hex head_baseline_digest)
    || LP(derivation_version)
    || LP(admitting_credential) || LP(dec self_admitted)
    || LP(hex decision_parent)

  sig = Ed25519( the admitting client's signing credential ; A )
```

**`derived_sv` and `derived_ds` are the point of the object.** They are not copied from the manifest — they are
what the admitter got by decrypting the checkpoint, materialising the snapshot, and deriving coverage from it.
A restorer does the same and compares three things: its own derivation, the admission's, and the manifest's.
**All three must agree**, and the first comparison needs nobody's signature, which is why it is mandatory even
when the admission verifies. A bug produces this mismatch as readily as a malicious producer.

**`head_baseline_digest` is the half that cannot be re-derived after trim**, and it is the only thing here that
rests on trust. It is row 7's `head_vector_digest`, re-affirmed by a party that checked the snapshot actually
covers it. A fresh restorer's confidence in the baseline is exactly its confidence in the admitting credential,
and the design says so rather than implying the head alone proves anything.

**`derivation_version` names the Yjs derivation used.** `sv` and `ds` are opaque bytes whose encoding belongs to
a library. Without a version, an encoding change turns every stored admission into a silent mismatch that looks
like corruption; with one, it is a legible refusal that names its cause.

**`self_admitted` is honest rather than flattering.** `P-1` selected single-owner authority, so the only
eligible client may be the producer. **A second eligible client must admit when one exists; where none does,
the producer admits its own proposal and the record says it did.** The alternative was requiring a second
admitter, which would leave a single-device workspace unable to checkpoint at all — and therefore retaining
envelopes without bound, the exact condition checkpoints exist to end. A restorer that can see the weaker
provenance can act on it; one that cannot will assume the stronger.

**How a verifier resolves those sentences is part of the schema, and it was not until the return**
(2026-08-28, `FU-11`). The admission's verifier is the signing key the certified recipient set at the
manifest's epoch binds to `admitting_credential` — `S0-2`'s member entry, a lookup into client- or
factor-authenticated state, refusing an uncertified credential before any signature runs. `self_admitted`
must equal the relation the verifier derives — `admitting_credential` is the producing credential, or it is
not — in both directions. And the cardinality rule executes against the same set: **a producer self-admission
is refused while the set holds a second eligible client.** Before the return the evidence imported one
verifier as a constant and accepted the producer's self-admission beside an eligible second client, which is
`ST-06`'s conviction; the certified set and the producer are now inputs, published with the vectors.

**`decision_parent` serialises incomparable admissions.** Two producers can propose against incomparable head
vectors, and **wall clock never orders them** — that is row 7's own rule. The parent puts the decision in the
same authenticated order domain as everything else, so a fork is detectable rather than silent.

## 2. `CreationCertificate` and the card identity — `RC-5C`

Closes `f-b997cdb-attribution-self-replacement`.

Row 8 puts standing claims in "a write-once map in the content root, keyed by card id." **A mutable CRDT map
cannot enforce write-once.** A compromised credential replaces another source's entry with one naming itself,
signs the complete tuple with its own valid key, and ships it in its own accepted envelope. It verifies. After
trim removes the earlier envelopes, a fresh restorer has neither a prior value nor an accepted creation
position to enforce the rule against, and reports the attacker as verified creator.

```
C = LP("done/creation/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id)
    || LP(creator_credential) || LP(hex creator_nonce)

  card_id  = the first 16 bytes of SHA-256(C), Crockford Base32
  cert_sig = Ed25519( the creating credential ; C )
```

**The identifier is the commitment, and that is the whole repair.** A different credential produces a different
`C`, so it produces a **different card id**. There is no replacement claim to make: a claim naming another
creator for this id cannot exist, because this id is what *that* creator's certificate hashes to. The property
is structural rather than adjudicated — nothing has to be retained, ordered, or asked.

**16 bytes, because that is what the ids are now.** `src/lib/id.ts` produces `crypto.randomUUID()`, so the
width is unchanged and the collision argument is the same one already accepted. The `creator_nonce` is what
distinguishes two cards created by the same credential.

**Row 8's record is unchanged except that `card_id` now means more than it did.** It still binds actor, kind,
credential, epoch and the content commitment; it still says a card edited after creation *verifies and is not
exact*, which remains the honest reading. What changes is that its `card_id` field is no longer an arbitrary
label the claim asserts, but a value the claim's own creator is derivable from.

**Deletion is unchanged in shape and must stay joint.** A card and its creation certificate are destroyed
together or not at all; destroying the certificate alone would leave a card whose identity no longer verifies,
which is a worse state than either. **When a card may be destroyed is a product question** — row 8's compaction
policy — and is not answered here.

## 3. What a fresh restorer does, in order

The order matters, because two of these steps need nobody's signature and should not be skipped when the
signatures happen to verify.

1. Verify `checkpoint_digest` against the ciphertext. **No key needed** — this is the durable store's own check.
2. Decrypt under the generation opener; **verify the opener is authorized for that generation** (`S0-2`).
3. Materialise the snapshot and **derive `{sv, ds}` locally**. Compare against the manifest *and* the
   admission. Any disagreement is a refusal, and it is reached without trusting anyone.
4. Verify the producer's manifest signature.
5. **Resolve the admitting credential from the certified recipient set at the manifest's epoch** (`S0-2`) —
   an uncertified credential refuses here, before any signature — check `self_admitted` equals the derived
   producer relation and that no second eligible client stood by for a self-admission, then verify the
   admission signature under the resolved key. **Read `self_admitted` and surface it** rather than
   discarding it.
6. Take `head_baseline_digest` as the accepted-head baseline for suffix replay. **This is the trusted step**,
   and it is the only one.
7. For each card, recompute `card_id` from its creation certificate and refuse any card whose id does not
   match. **No prior value and no retained event is required**, which is what makes it survive trim.

## 4. `CheckpointInstall` — the staged install machine (the `S0-5` return, 2026-08-28)

Closes `FU-11`'s install half. Before the return no install state machine existed anywhere: `GenerationApply`
step 6 was one array prepend that fused content installation, head activation, semantic admission and
retention, so a partial install, the content-before-head window and the second-newest fallback were
unexpressible rather than refuted (`ST-06`). The machine is modelled and scheduled in
`test/storageSchedule.test.ts`.

```
CheckpointInstall = { gen }        durable from the content commit until the
                                   activation discharges it; what a fresh page
                                   resumes from
```

Two commits, in order, each atomic:

1. **`commit-content`** — the check-and-stage. The tuple's bytes, verified admission and surviving opener are
   read (§3 steps 1–6); the pick is recorded in `CheckpointInstall`; the materialised content commits durably
   into its slot. **Nothing becomes live** — a reader still consumes the prior pair.
2. **`activate`** — the one commit that makes anything live. The content root and the accepted-head baseline
   flip **together, or not at all**, and the record is discharged in the same transaction. The step
   re-verifies against durable state, because a second writer can land inside the window — a store losing the
   tuple's bytes is §11.3 test 8's own event — and when the tuple became ineligible there it **rolls the
   stage back** (content slot and record removed), never serving content under another tuple's heads.

**Recovery is the record's**: a page finding `CheckpointInstall` completes the activation when the tuple still
verifies and rolls the stage back when it does not. Either way, every kill point before the activation shows
**neither content nor heads** moved — the partial install activates nothing.

**Trim reads the active pair, not the newest tuple.** Only an admitted, activated tuple licenses dropping the
envelopes beneath its coverage — the executable form of *signed before any pre-checkpoint envelope may be
trimmed* (falsifier 7), and the reason a tuple nobody admitted can sit newest in the store forever without
costing one envelope.

**Fallback is an install, not arithmetic.** A newest tuple missing bytes, admission or opener is refused as
the pick, and the second-newest complete tuple is installed **through the same two commits** — the assertion
is the machine's receipt, not the opener set's cardinality.

**At a rotation, step 6 runs this machine** (TRD §13.7): the transition's own durable record says *step 6*;
this record says where inside it the install stands; a kill inside the step resumes through both.

## Falsifier map

Each is one isolated test in Stage D, failing before the schema and passing after.

| # | Falsifier | Schema |
| --- | --- | --- |
| 1 | A manifest omitting an accepted insertion fails local re-derivation | 1 |
| 2 | A manifest omitting a deletion fails, with `ds` bound separately from `sv` | 1 |
| 3 | A head vector reaching beyond the snapshot fails admission | 1 |
| 4 | An operation present in the snapshot but not accepted fails | 1 |
| 5 | A producer-signed manifest with no admission is refused where a second eligible client exists | 1 |
| 6 | A self-admitted checkpoint is accepted where none exists, **and the record says it was self-admitted** | 1 |
| 7 | Trim before the admission is signed fails | 1 |
| 8 | An admission whose `derived_sv` disagrees with the restorer's own derivation fails **without consulting a signature** | 1 |
| 9 | A `derivation_version` the restorer does not implement is a named refusal, not a mismatch | 1 |
| 10 | Incomparable admissions serialise by `decision_parent`; wall clock never orders them | 1 |
| 11 | A whole valid self-replacement of another source's creation claim cannot be constructed | 2 |
| 12 | A creation certificate substituted under an existing card id fails the id recomputation | 2 |
| 13 | Two cards created by one credential have distinct ids | 2 |
| 14 | After trim, a fresh restore still reports the original creator | 2 |
| 15 | Destroying a certificate without its card is refused | 2 |

The `S0-5` return (2026-08-28) continues the map at rows 16–23 — the admission's authority first, then the
seal discipline, then the install machine:

| # | Falsifier | Schema |
| --- | --- | --- |
| 16 | A genuinely signed admission naming a credential outside the certified set at the manifest's epoch is refused by the lookup, before any signature runs | 1 |
| 17 | A producer self-admission beside a second eligible client is refused by cardinality — the exact acceptance `ST-06` convicted, inverted with its world kept | 1 |
| 18 | `self_admitted` equals the derived producer relation in both directions, or the admission is refused | 1 |
| 19 | A checkpoint opens under no salt but its own — one message per derived `K_cp` is the whole invocation discipline (the `k-checkpoint` census entry) | 1 |
| 20 | A kill at any point before the activation activates neither content nor heads; the live pair is the prior tuple's | 4 |
| 21 | Content and heads never disagree: the activation is one commit, and the content-committed window recovers by completing or rolling back | 4 |
| 22 | Newest-tuple loss — bytes, admission or opener — falls back to the second-newest complete tuple, installed through the same machine with the receipt to show | 4 |
| 23 | No trim under a tuple nobody admitted, wherever the trim is scheduled | 4 |
