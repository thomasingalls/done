# `S0-5` Stage A — durable record schemas

**Standing:** home — sections here are pinned and swept by the authority map; read back by
`pnpm authority:check`.

**Status:** proposed for `S0-8` review · not implemented · no generator or vector consumes these yet

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
5. Verify the admission signature, and check the admitting credential was in the certified recipient set at the
   manifest's epoch (`S0-2`). **Read `self_admitted` and surface it** rather than discarding it.
6. Take `head_baseline_digest` as the accepted-head baseline for suffix replay. **This is the trusted step**,
   and it is the only one.
7. For each card, recompute `card_id` from its creation certificate and refuse any card whose id does not
   match. **No prior value and no retained event is required**, which is what makes it survive trim.

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
