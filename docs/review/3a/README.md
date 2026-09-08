# Review 3a — storage and journal design review: reviewer input pack

**Input amendment, 2026-09-08:** read [storage-contract.md](../../storage-contract.md) and
[storage-conformance.md](../../storage-conformance.md) with this pack. Mandatory factor genesis replaces
optional default custody; key retirement requires writer exclusion and a fresh journal-inclusive census;
trim is exact authenticated coverage; offline recovery includes causal dependencies. The nonce theorem
excludes raw clones/rollback, and custody seals need reservation accounting including retries. Existing
vectors keep their crypto bytes and do not certify these lifecycle properties. Review the corrected
contracts and implementations against the pending production cases, including the new v2 metadata.

**Standing:** home — the one home of the 3a intake. Outside the remediation census, which walks
`docs/review/remediation/` only; nothing here is pinned by `remediation:check`.

**Prepared:** 2026-08-29, against `1375ee6` · **Scope authority:** [TRD](../../TRD.md) §13.11 ·
**Owed since:** the `S0-8` regeneration (2026-08-29), per
[`action-tree.md`](../remediation/action-tree.md)'s external-review coordination

## What we are asking for

An independent design review of the **encrypted record format, the local half of the key hierarchy, and the
synchronous journal AEAD with its nonce discipline**. The constructions are selected and carry generated,
self-verifying test vectors, so this review reads constructions and vectors rather than a register of open
questions — with three exceptions, named in *The questions* below, where we are asking rather than telling.

**We are not asking you to confirm that we did a good job.** The three prior challenge rounds were machine
adversaries and they failed the package twice; what has never happened here is a human attacking these
constructions. That gap is recorded, not papered over — see *What has already been challenged*.

## Scope, exactly

**In scope**, per TRD §13.11 and §15.1:

| Row | Subject | Selection document |
| --- | --- | --- |
| 1 | Algorithm suite and crypto-agility | [row-1-algorithm-suite.md](../../selections/row-1-algorithm-suite.md) |
| 2 | Synchronous journal AEAD and its nonce discipline | [row-2-journal-aead.md](../../selections/row-2-journal-aead.md) |
| 3 | Encrypted record and local key-envelope formats | [row-3-record-format.md](../../selections/row-3-record-format.md) |
| 13 | Device-lock derivation, enrollment migration and copy | [row-13-device-lock.md](../../selections/row-13-device-lock.md) |
| 14 | Recovery-code entropy and generation — **the storage-facing part only** | [row-14-recovery-code.md](../../selections/row-14-recovery-code.md) |

Normative sections: **§6.1** (the encrypted content store), **§6.5** (the local slot index and store naming),
**§10.10** (the one new primitive), **§13.2** (the key hierarchy), **§13.3** (local custody and the optional
device lock), **§13.10** (the selected suite).

**Out of scope, deliberately.** Rows 4–12, 15–17 and 20, plus row 14's step-up challenge and everything else
network-facing, belong to **review 3b** — authorization, key delivery, envelopes, epochs, rotation, recovery,
downgrade. Rows 18 (persistent search index), 19 (root-type collections) and 21 (first-deployment cutover
attribution) belong to neither review. If a thread you pull leads into 3b's half, say so and stop — we would
rather know where the seam leaked than have it reviewed twice or not at all.

**Row 14's split is the one that needs stating.** The storage-facing part is the 125-bit code, its Crockford
Base32 encoding and generation, and the decision to apply **no stretching at all**. The service step-up
challenge is 3b's.

## When this is answered, and what it gates

**Answered before the first deployment cutover, not before the storage work begins.** The implementation
(Stage 1) is deliberately in flight while this review runs. A defect you find during implementation costs a
rework; the same defect found after cutover has written a real deployment's data under a broken construction —
and **a nonce-reuse fault is retroactive**, so ciphertext already written stays broken.

The only data at risk inside Stage 1 is the author's own development data, and that exposure is accepted
deliberately. No other person's data is anywhere in the system, and none will be before this review answers.

## The five constructions, briefly

Enough to orient before the long documents; each is stated normatively in the TRD and argued in its selection.

1. **Suite 1, selected whole.** AES-256-GCM on every asynchronous path, XChaCha20-Poly1305 on the synchronous
   one, HKDF-SHA-256, Ed25519, HPKE base with X25519, SHA-256. **A carrier version selects the entire suite** —
   there is no per-record algorithm field, so there is nothing to negotiate and nothing to downgrade.
2. **The journal AEAD.** XChaCha20-Poly1305, **24 random bytes per record, no counter and no durable state**,
   so a page kill has nothing to lose. The subkey is derived once at open from `K_g`. The implementation is the
   RustCrypto `chacha20poly1305` crate compiled to a **6 465-byte** `no_std` wasm module, instantiated
   synchronously — *audited* is the word we are deliberately not using here, for the reason in question 1.
3. **The record format.** AES-256-GCM under domain-separated subkeys, and **every cleartext field is in the
   AAD** — IndexedDB hands back a structured clone whose properties the load path would otherwise trust. The
   store subkey **binds the store instance**: one key per `SeqCounter`, because a key's scope can be no wider
   than the state that counts its invocations. 12 random nonce bytes under a per-(store, generation) budget
   counted by `reserved[gen]`, **reserved before encryption** so an abandoned invocation is still counted, and
   `seq` does not reset at trim. The budget is NIST SP 800-38D §8.3's 2³² invocations per key, with the store
   rotating **before** the 2³²-th reservation — equality is the first disallowed value. This assumes an
   unrewound, unbranched key/counter history (SC-09); raw profile clones duplicate that history.
4. **The device lock.** A generated 125-bit code **always**, with WebAuthn PRF as an additional seal of the
   same scoped `L_lock`. Factors are mandatory from persistent genesis and cold start. Legacy migration
   replaces promptless future receivers and rotates content forward; protection remains pending until
   durable local activation/retirement complete. Complete profile-copy tests remain owed.
5. **The recovery code, storage half.** 125 bits, Crockford Base32, five groups of five, **no stretching**.

## The questions

Most of this pack is telling. These are asking.

1. **The RustCrypto audit delta — this is the one we owe you, and it is a registered debt naming you as its
   owner.** The audit is genuine and it is old: NCC Group, a five-person-day engagement in **December 2019**,
   covering the RustCrypto ChaCha20+Poly1305 implementation family. The graph we ship is
   `chacha20poly1305 0.10.1`, `chacha20 0.9.1`, `poly1305 0.8.0`, `aead 0.5.2`. Neither the audit nor the
   changelog establishes that *this* source and dependency graph received that review. We need **the source
   delta from the audited snapshot to the locked graph, with your named scope** — what you evaluated and what
   you did not. A citation of the audit alone is explicitly refused as payment, and so is our own assertion;
   we wrote that refusal against ourselves before asking you. See *The debt this review owns*.
2. **The nonce discipline under a crash, specifically.** Row 2's whole argument is that 24 random bytes with no
   counter and no durable state cannot lose anything to a page kill, because there is nothing to lose. We
   believe that is right and we would like it attacked. The composed crash model is in
   `test/scheduler.ts` and `test/storageSchedule.test.ts`.
3. **Whether the AAD rule is actually total.** "Every cleartext field is in the AAD" is enforced by an audit
   that elides each field and requires a declared negative to catch it — 205 fields today. The rule we cannot
   check is whether a field that *should* be cleartext-and-bound was never added to a construction at all.

We would also rather hear it early than late if you think the row 1 / row 2 boundary is wrong: half of row 1
was decided by row 2 before either row noticed, which row 1 §1 documents.

## The debt this review owns

One entry in [`debts.json`](../remediation/debts.json) names **review 3a intake** as its owner and blocks the
`L-4` gate until it is paid:

```
id:        rustcrypto-audit-delta
owner:     review 3a intake
property:  The audit's exact scope: the 2019 snapshot diffed to the locked 0.10.1 graph, with review 3a
           naming what it evaluated — the audit preserved as related history, never as exact-version proof.
artifact:  the source-delta review from the audited snapshot to the locked graph, with reviewer 3a's named
           scope and readback
falsifier: the 2019 audit citation cannot mark this paid without the exact commit-to-0.10.1 delta and review
           3a's named scope; a citation alone is refused as payment
```

Three further registered debts sit inside this review's subject matter but are **not** yours to pay — they
belong to the platform and toolchain tracks, and are listed so you know what is already known:

- `declared-device-population` — the journal p95 budget rests on samples from a declared hardware population;
  today it rests on one Pixel 9a.
- `wasm-toolchain-provenance` — `wasm:verify` binds the crate source to the shipped blob and **detects drift,
  never forgery**. A reproduced build under a pinned toolchain is owed and unpaid.
- `journal-append-burst` — the append burst is measured by a fixed-slot microbenchmark, which is useful history
  and not product-shaped evidence.

## The evidence, and how to run it

Everything below executes. Nothing in this pack asks you to take a claim on our word where a command exists.

```bash
pnpm install --frozen-lockfile && pnpm check
```

That is the whole gate: typecheck, sixteen vector generators re-derived and compared, the AAD coverage audit,
the document-to-artifact checks, the authority map, the debt manifest, the wasm source↔blob binding, 445 tests
across 39 files, 90 browser geometry specs, and a traceability matrix that credits a check script's claim only
by an execution receipt that script just wrote.

The vectors in this review's scope, all generated and self-verifying:

| File | Published negatives |
| --- | --- |
| `test/vectors/algorithm-suite.json` | separation rules, no `must_fail` block |
| `test/vectors/journal-aead.json` | 10 |
| `test/vectors/record-format.json` | 20 |
| `test/vectors/device-lock.json` | 16 |
| `test/vectors/recovery-code.json` | 16 |

`pnpm vectors:coverage` currently reports **205 AAD fields, each isolated by a published negative** — a field
that is bound but that no negative catches fails the build. `pnpm wasm:verify` runs 18 checks including the
published KAT and the source↔blob binding.

## What has already been challenged, and exactly what that is worth

This matters more than the green gate, so it is stated precisely rather than favourably.

**Three independent challenge rounds have run against these constructions, all of them machine adversaries.**

- **Rounds 1 and 2 failed the package.** Four parallel non-author challengers, then three serial ones. They
  produced a live construction defect — `K_store` derived identically on every device, so the §6.1 budget
  bounded no key — plus sixteen further blockers. The constructions you are reading are the ones rebuilt in
  response.
- **Round 3, from a different model family, found the constructions sound.** Byte-level review of the
  length-prefixing and domain tags, the retention and reseed inversions, the importer's order probes; 19 of 19
  expected-fail probes caught. What failed was our own instrumentation, narrowly, and was repaired the same day.

**The independence bar, exactly:** author-independent seven times, family-independent once, **human-independent
never**. No human has rerun the battery or the gates, and no human has attacked the judgement calls. Stage 0
closed on that bar as an explicit recorded decision rather than a waiver — the full record is
[`S0-10/README.md`](../remediation/S0-10/README.md).

**You are the first human to look at this.** Please do not read the green gate or the three rounds as a
prior that the constructions are sound; read them as the reason the obvious attacks are probably already
covered, so your time is better spent where judgement lives than where a test would have caught it.

## Known limits inside this scope

- **Firefox 154's `deriveBits` rejection edge.** Every success-path X25519 operation passes on all four core
  engines; Firefox misses the six small-order all-zero rejection subtests and the non-multiple-of-8 length
  subtest. Recorded at TRD §10.11's dagger note. The DHKEM layer carries its own RFC 9180 all-zero abort on
  every engine as a consequence — that layer is 3b's, noted here because the observation is shared.
- **The journal budget's tail.** TRD §12 specifies `< 1 ms p95` on a low-end device. On a Pixel 9a the full
  write measures **35 µs, 65 µs and 240 µs p95** across the three sizes, the last with 4.2× of margin. CPU
  throttling under CDP stalls the thread rather than modelling a slower core, so the browser profile yields a
  trustworthy mean and no trustworthy tail — which is why the hardware number exists at all.
- **The property fleet does not exercise persistence.** It runs `persist: false`, so the suite would keep
  passing whatever the encrypted store does. The encrypted store carries its own tests (TRD §11.1); a
  `persist: true` fleet variant is owed with the encrypted-store work.
- **`vectors:check` cannot see document drift.** It compares a generator to its vector, never a document to its
  generator. Four checks read a document against an artifact and cover the sections they name and no others.

## What "answered" means

A reviewer result is a finding or a statement of no finding, in your words, against a named scope. We will
record it as such. We will not record a booking as a result — an earlier draft of our own tracking said
"reviews booked" in a place that read like "reviews passed", and the challenge rounds convicted it.

If you find something that changes a selected construction, it returns to the owning decision node and the
downstream work reopens with it. That is the outcome this review is scheduled early enough to afford.
