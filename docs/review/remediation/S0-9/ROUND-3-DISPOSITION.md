# `S0-9` — round 3 disposition: the different-family read

**Standing:** record — speaks of `cfc6b709f10517ee701eb1ebfe2dd77b8a5c4c70`, the challenged tip; pinned in
`census.json`, so edits land only as dated addenda under a re-pin.

**Run:** 2026-08-29 · **Subject:** `cfc6b70` — the regenerated corpus and the ratified records, per the
amended `S0-9` input list · **Verdict: the seven constructions survive every axis this round ran. The
challenge fails narrowly at the closure instrument itself — one demonstrated drift channel (`R3-1`) — and
`S0-10` stays blocked until that repair lands, the gate re-runs, and the registered X25519 debt is paid.**

## The bar this round stands on

The queue item demanded a changed perspective, twice: seven same-family reads had cleared the
author-independence bar, and the one-perspective bar was the open one. This round was run by **Claude Fable 5,
a Mythos-class model — a different model family from the one that ran all seven prior reads**. It is still one
challenger, in one session, from one vendor; it is not a human red team, and `S0-10` should record the bar
exactly that way: author-independent seven times over, family-independent once, human-independent never.

## How it was run

One challenger, in a fresh worktree at `cfc6b70`, with no repair authorship on this branch. The baseline was
the handoff's own first command, and it held:

- `pnpm install --frozen-lockfile && pnpm check` — **exit 0, end to end**, `trace:check` last, printing:
  *100 claims, 27 of 28 current defects carry a named falsifier, 6 registered debts. Script claims credited
  by execution receipts; recency held against 9edd930.*
- `pnpm authority:check` — 34 entries, 37 chains, **open at their own joint: 0**, blocked through an open
  home: 0. `pnpm vectors:coverage` — 205 AAD fields, each isolated by a published negative. 445 collected
  tests, 16 vector files.
- `node scripts/check-debts.mjs --gate S0-10` — **BLOCKS**, naming `x25519-dated-readback`, exactly as the
  manifest requires. The consult verb is real, not prose.

Three things were then attacked, in the order the queue item names them:

1. **The authority map, by targeted adversarial property tests** — seven map mutations (an open entry with no
   blocker, a pinned-home edit, a construction in an unpinned section, a `deletion`-guard chain rerouted to
   `root:service`, a struck `bound:`, an AEAD entry naming both counter and discipline, and a construction
   added to a document the sweep does not read), plus a byte-level read of every `resolves:` chain against the
   schemas that state them — the catch-up transcript's two-signer split (`terminal-handoff`'s
   `root:trust-root` claim) was verified against `S0-6` §4 and the generator, not taken from the entry text.
2. **The class-1/2/3 constructions, at the byte level, with a different family's lens** — LP framing, domain
   tags and injectivity across `CertifiedSet`, `RecoveryBootstrap`, `ArchiveIdentity`/`ArchiveEnvelope`,
   `CatchupTranscript`, `RetentionMark`, `ReseedSession`; the importer's commitment-before-signer order and
   its probes; `K_store`'s `store_id` binding (row 3); the retention model against `P-4`'s ratified sentences,
   including reseed-against-terminal, retire-then-restore, and the born-elapsed permanent negative.
3. **The gate instruments the `S0-8` regeneration added** — receipts (byte, tree and exit binding), the debt
   manifest (claims both directions, typed payments, the gate consult), the census walker, the AAD identity
   rule, the one-domain scan, the admission byte rules, and the wasm source↔blob header binding — under a
   **fresh 21-probe mutation battery designed from reading the checkers, not copied from any Stage D list**
   ([`round-3-battery.mjs`](./round-3-battery.mjs)). 19 of 19 expected-fail probes were caught with the right
   diagnosis. Two probes were designed to pass, and did — they are findings `R3-1` and `R3-2`. (The battery
   as committed asserts the post-return world: the round-3 return repaired both instruments the same day and
   inverted those two probes into permanent negatives — the scheduler reproductions' own convention — so its
   standing expectation is 21 of 21 caught.)

## What fails

### `R3-1` — the per-decision claims are checked narrower than both homes say (medium)

`HANDOFF.md` opens by saying `pnpm remediation:status` *"checks the per-decision claims below against the
decision records in both directions"*, and the checker's green line prints *"HANDOFF agrees in both
directions."* What is actually compared is the **ratification date, the status word, and the owed-falsifier
ranges — never the ratified content**. Demonstrated: editing HANDOFF's claim from *"`P-4` is ratified
(2026-08-28): option B, with intrinsic acceptance"* to *"option A"* passes `remediation:check` — **and every
other document-reading check in the gate** (`authority`, `retention`, `status`, `limit`, `recipient`,
`admission`, `debts`), verified one at a time. A second live instance, found by the same route: HANDOFF's
queue item 3(a) says the map has **31 entries** while the checker computes **34** — descriptive drift in the
one home of the open queue, visible to nothing.

This is the `FU-07`/`FU-13` class — one fact, two homes, the cross-check reading less than it claims —
recurring **at the class-3 instrument itself**, and it violates `P-5`'s own ratified floor: *a checker's
printed claim is exactly its scope.* The repair is the instrument's owner's, in either direction or both:
widen the comparison to the ratified option the record header already carries (`**Ratified:** 2026-08-28,
option B …`), and narrow both printed sentences to the compared facets. Return: the `S0-1` instrument
(`scripts/remediation-status.mjs`), with the probe re-run as the falsifier.

### `R3-2` — the authority map's census sweep omits `S0-3/A-schemas.md` (low)

The sweep's document set is the TRD plus **five** stage schema documents — `S0-2`/`S0-4`/`S0-5`/`S0-6`/`S0-7`
— and the map's §6 prose says so as if it were the full population. `S0-3/A-schemas.md` — the write-admission
machine's own schema home, `standing: home`, amended by the same returns — is outside it. Demonstrated:
appending `ProbeSeal = AEAD(K_probe; …)` to that file passes `pnpm authority:check`. Today the file happens to
contain zero construction tokens, so the omission is latent — but the sweep exists precisely so the map cannot
decide its own census, and a census whose *document population* is a hand-maintained list that omits one
schema home is the fifth-instance shape (*a check that classifies by matching a list silently passes whatever
the list does not name*) one level up. Repair: add `S0-3/A-schemas.md` (and `S0-1/A-policies.md`, closing the
set over all seven stage documents) to `SWEPT`, and correct the map's prose. Return: the map's checker.

### `R3-3` — the gate reads `docs/trd.md`, which exists only on a case-folding filesystem (low)

`check-debts.mjs` reads `'docs/trd.md'` and `debts.json`'s X25519 entry pins the same lowercase path; the file
is `docs/TRD.md`. On this Mac's case-insensitive volume both resolve; on any case-sensitive filesystem — the
default for the CI platforms `L-4`'s freshness gate will run on — the read throws and the gate fails loudly.
Integrity holds (fail-loud, and the receipt records the failure), but *"a fresh clone earns its credits the
same way"* is currently a claim about case-insensitive machines. Repair: two path strings. Return: the debts
checker and manifest.

### `R3-4` — member-entry uniqueness is unstated at the class-1 core (low)

`CertifiedSet`'s `members_digest` sorts entries by `credential_id`, and the ratified resolution rule reads
*"the named approver's member entry"* — singular. Nothing in `S0-2` §1 or TRD §13.5 states that a set carrying
**two** entries for one `credential_id` is malformed, the sort is unstable at the tie, and the generator's
representation (object keys) cannot even express the case, so no negative covers it. Not a privilege
escalation — under single-owner approval a rogue member can mint worse than a duplicate — but an
interop/determinism hole at the construction every chain grounds in: two conforming verifiers could resolve
the same approval under different keys, and the stated idempotency-key property (*two devices building the
same object produce the same digest*) is unproven at the tie. Repair: one malformedness sentence at the
schema and §13.5, under the pin discipline. Return: `S0-2`'s homes, at the owner's convenience before `L-2`
implements a verifier.

## Observations, not blockers

- **The tree digest is blind to untracked-file content** — demonstrated with `treeDigest()`: two different
  contents of an untracked file, one digest. This is receipts.mjs's own documented boundary, and a fresh
  clone has no untracked files; it thins the transitive freshness argument for test-carrier claims only for
  an author defeating their own gate. No repair owed; recorded so the boundary stays deliberate.
- **Receipts do not bind `argv`** — a receipt minted under any mode credits the script. Today every
  `check-*.mjs` runs its full validation battery in every mode, so nothing is claimable from a weaker mode;
  a future mode-dependent check script would inherit a real hole. Worth one line in the receipts docblock
  when next edited.
- **TRD restatements of schema-homed rules are pin-covered only for their constructions.** §14.2 restates the
  importer's commitment-first rule and §9.3 the archive's authentication story; neither section is pinned by
  any entry, so prose drift there is invisible to `authority:check` (a *new construction* is caught — probed —
  and the schema homes those sections restate are pinned). `FU-13`'s shape at low materiality, honestly
  outside the map's stated census ("the sweep sees signature constructions, not every predicate prose could
  state"). No mechanical repair proposed; noted for the next reader deciding what the pin census owes.

## What held

Recorded with the same care as the failures, because this round pressed hardest exactly where the prior seven
could share a blind spot:

- **Every construction read at the byte level is LP-framed and domain-tagged**, concatenation is injective
  everywhere it must be (fixed-width halves inside sealed payloads included), and no signature domain is
  reusable across message types. The different-family crypto lens found no binding, framing, replay or
  domain-separation defect in `CertifiedSet`, `Bootstrap`, `ArchiveEnvelope`, `CatchupTranscript`,
  `RetentionMark`, `ReseedSession`, or the package manifest.
- **The catch-up transcript's authority split is real**: the sender-side member key signs `T`, the receiver
  signs `H`, the service signs neither; the receiver's own genuine signature over `T` is a published negative,
  and the absence semantics (`the objects the source could not deliver`, named one by one, count checked
  against the list) are coherent across §14.4, the schema and the generator.
- **The `FU-04` inversion binds**: reintroducing the inherited clock in the retention model fails the
  born-elapsed permanent negative on the spot. Reseed-against-terminal, retire-then-restore, and the
  entitlement signer's boundary immunity are all refused with the right reasons.
- **The map's guard rule has teeth**: a `deletion`-guard chain rerouted to `root:service` fails whatever the
  status line says; so do a struck `bound:`, a both-fields AEAD entry, an open entry with no blocker, and a
  pinned-home edit. A new construction in an unpinned TRD section (§14.2, probed) is caught by the sweep.
- **The `S0-8` instruments bind**: a stale receipt from an edited script or another tree refuses; an orphaned
  script claim fails the matrix; swapped `isolates` attributions fail the identity rule with the
  swapped-attribution diagnosis; the dropped `recovery-anchor` fails at regeneration; the restored watermark
  sentence is refused by name; `lib.rs` edited without a rebuild fails `wasm:verify` in the normal gate; the
  `S0-10` consult blocks on the open X25519 debt.
- **`K_store` binds the store identity** (row 3 §§3–4), the two-store budget defect is closed at the
  derivation, and the census's counter/discipline census is total over the seven AEAD entries.
- The baseline itself: **the whole gate, green, from a fresh worktree, receipts minted and consumed in one
  chain** — the first time a round of this challenge has started from a passing gate.

## What `S0-10` is blocked on

1. **`R3-1`'s instrument repair**, re-run through the gate with the probe as its falsifier — and `R3-2`/`R3-3`
   riding the same return, being two-line repairs to the same class of instrument. `R3-4` is recorded for
   `S0-2`'s homes and does not block Stage 0 closure.
2. **The registered X25519 debt** — `node scripts/check-debts.mjs --gate S0-10` blocks today, correctly, and
   only a typed dated-external-observation payment into TRD §10.11's table lifts it.
3. **Recording the independence bar** exactly as the first section states it.

## The honest limit of this round

One challenger, one session. The battery is fresh but small — twenty probes against the instruments, not a
re-derivation of the 205-field audit or the 445-test suite, which were re-executed (the gate ran them) but
not independently reconstructed. The constructions were read completely; the generators were spot-read at
their negatives, not line by line. A different model family narrows the shared-blind-spot risk and does not
retire it: same vendor, same broad training tradition. The one bar no machine round clears — a human red team
— remains open exactly as wide as before, and nothing here should be read as narrowing it.
