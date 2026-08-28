# `S0-9` — independent challenge, STORAGE cluster (`RC-3`, `RC-5`)

**Standing:** record — speaks of `5923f510fd9ac3c1cd809e9bec352a7f73751492`, the challenged tip; pinned in
`census.json`, so edits land only as dated addenda under a re-pin.

**Challenger:** independent of every repair author. **Worktree:** `.claude/worktrees/s09-storage`, detached at
`5923f51`. **Subject tip:** `9edd930`. **Date:** 2026-08-28.

Nothing in `docs/review/findings/` was edited. Every mutation below was restored from a temp-file snapshot, never
with `git checkout --`; `pnpm format:fix` was never run. The tree was verified clean and green at the end (§3).

---

## 1. Verdict table

|                                                     | 1 survival at tip                                                              | 2 causal ancestor                                                                                         | 3 local theorems                                                                                  | 4 simpler repair                                                                                             | 5 actor authority                                                                      | 6 crash/retry/concurrency                                                                   | 7 named adversarial                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **`RC-3`** total local-write admission              | ✓ all five current defects reproduced at the tip, one byte-for-byte            | ✗ the chain never reaches `K_store`'s key scoping, which is why a per-store count cannot bound the budget | ✗ §15.1 row 3 now contradicts §6.1; the published record vector still asserts the superseded rule | ✗ the p95→per-update-ceiling conversion is unjustified and slicing does not reduce the cost it is chosen for | ✗ the budget is per _key_; the selected comparison counts one _store_                  | ✗ `notDurable` is write-only — the model passes 18/18 with the defect installed             | ✗ two of the three design defects reintroduce with every gate green |
| **`RC-5`** semantic checkpoint / creation authority | ✓ both defects present at the tip and still visible in the repaired generators | ✓ `b997cdb` correctly named; "authentic bytes are not semantic authority" is the right diagnosis          | ✗ two of three published attribution positives carry ids the specified restorer must refuse       | ✗ the finding's own simpler repair (real Yjs bytes; `yjs` is already a dependency) was not taken             | ✗ single-owner `self_admitted` collapses the admission to the producer's own signature | — no crash schedule is modelled for checkpoint install or claim replacement; nothing to run | ✗ the finding's named attack still verifies and reads _exact_       |

Legend: ✓ survives challenge · ✗ fails · — not reachable.

**One-line summary.** The two artifacts that genuinely refuse their own defect are `check-wasm-seal.mjs` and the
journal `wrong-generation-key` negative; both held under direct attack. Everything else in this cluster either
proves less than the traceability matrix credits it with, or is credited to evidence that was already present at
the commit where the defect was validated.

---

## 2. Every ✗ and every doubt

### S-1 · `f-dbfd01f-record-nonce-ceiling-omitted` and `f-3bea0e6-store-sequence-allocation-undefined`: the whole normative repair deletes with every gate green

`traceability.md` credits `f-dbfd01f` to a single falsifier — `§6.1 — the allocator, and the count the budget
reads` in `test/writeAdmission.test.ts` — and `f-3bea0e6` to that test plus two vector negatives. The test is a
**self-contained model**: it imports nothing, defines `reserve`, `mustRotateBefore`, `journalWrite` inside itself,
and hardcodes `const BUDGET = 2 ** 32`. It reads no document and no production constant.

**Mutation M1+M2.** Delete the 2,987 characters of TRD §6.1 that carry the entire repair — the `2^32` ceiling, the
rotate-before-write action, the `reserved[gen]` count, the `SeqCounter` allocator, and the uniqueness argument —
leaving the tip's wording behind.

```
python3: s[:start] + s[end:]   # start = "**That budget has a number and an action…"
                               # end   = "**The journal, and why it is the sharp edge.**"
```

| gate                                                                                       | result             |
| ------------------------------------------------------------------------------------------ | ------------------ |
| `vectors:check` `retention:check` `status:check` `limit:check` `trace:check` `wasm:verify` | **all PASS**       |
| `typecheck`                                                                                | **PASS**           |
| `vitest run test/writeAdmission.test.ts`                                                   | **18 passed (18)** |

`f-dbfd01f`'s title is _"The normative record format carries a random-nonce budget but omits the rotate-before-write
ceiling that enforces it."_ Its disposition asks for the ceiling **in the normative document** plus a build-failing
boundary test. The document half was written and nothing checks it; the test half shares no constant with the
document. **The defect the finding describes is reintroducible in one edit with the credited falsifier green.**

### S-2 · The ceiling can drift to a wrong value, and the TRD then contradicts itself

**Mutation M3.** Change §6.1's two occurrences of `2^32` to `2^40` — a ceiling under which the claimed
`2^-32` collision bound no longer holds.

```
### vectors:check -> PASS   ### status:check -> PASS   ### limit:check -> PASS
### trace:check   -> PASS   ### retention:check -> PASS   ### writeAdmission 18/18 PASS
```

After the mutation `docs/TRD.md:659,661` say `2^40` and `docs/TRD.md:3462` (§15.1 row 3) still says `2^32`. **The
normative document contradicts itself in two places and no gate reads either one.**

### S-3 · Two of the three falsifiers credited for `f-3bea0e6` were already present at the tip

`git diff 9edd930 -- scripts/generate-record-vectors.mjs` is **twelve lines, all of them `falsifies:` tags**:

```diff
-  { name: 'kind-swapped', mutate: 'Reinterpret an update record as a state record.' },
-  { name: 'seq-edited', mutate: 'Renumber seq from 1 to 99 to reorder the trim.' },
+  { name: 'kind-swapped', falsifies: ['f-3bea0e6-store-sequence-allocation-undefined'], mutate: … },
+  { name: 'seq-edited',   falsifies: ['f-3bea0e6-store-sequence-allocation-undefined'], mutate: … },
```

Both negatives ran, unchanged, at `9edd930` — the exact commit at which `f-3bea0e6` was validated as a surviving
defect. **A falsifier that was running while the defect survived did not refuse it.** They prove `seq` and `kind`
are authenticated, which was never the finding; the finding is that nothing _allocates_ `seq`.

The same pattern holds for `f-b997cdb-attribution-self-replacement` — see S-14.

### S-4 · §15.1 row 3 states, at HEAD, that the thing `S0-3` selected is still open

§15.1's own preamble: _"this document states what is currently true, and where the two disagree this one wins."_
Row 3 at `docs/TRD.md:3462`:

> The per-generation count that comparison reads, and the crash-safe allocator that issues `seq` across tabs, are
> **still open** (§6.1)

§6.1 at `docs/TRD.md:667` and `:676`:

> **The count that comparison reads is now selected, and it is not `seq`** … **And `seq` is reserved rather than
> read, which is the same decision from the other side** (§15 row 3)

§6.1 cites §15 row 3 as the place the decision is recorded; §15 row 3 says it is not made. `git log -S` puts the
"still open" clause at `4e4d107`, an earlier remediation commit, where it was true; `S0-3` (`f4ce518`) selected the
construction in §6.1 and in `row-3-record-format.md` and did not update the register. `pnpm status:check` reports
_"17 selected and 4 unselected rows, disjoint; 5 PRD sentences cite a row and none contradicts the register"_ — it
compares the PRD to the register and never the register to the section it points at.

**This is `f-992bc91-network-carrier-registry-stale` again, in the register itself, under a green check.**

### S-5 · The published record vector still asserts the rule the repair says is wrong

`scripts/generate-record-vectors.mjs:561`, byte-identical to `9edd930:…:553`:

```js
'12 bytes from crypto.getRandomValues() per record, under a 2^32-per-generation budget bounded by seq',
```

`row-3-record-format.md` now says, of exactly this: _"**But the field it reads is not `seq`, and this row said it
was**"_, and §6.1 says a literal `seq ≥ 2^32` test _"would refuse every write for the rest of the store's life."_
The artifact `traceability.md` points at for this finding still publishes the superseded rule, and
`pnpm vectors:check` reports `record-format.json is current`. Third instance of the same shape as S-4.

### S-6 · `notDurable` is a write-only field; the model passes with the defect installed

The one state `P-3` adds — oversize, quota and unavailable storage collapsing to _not durable_, with the
acknowledgement withheld — is asserted nowhere.

**Mutation A1.** Stop marking it: `store: { ...s, notDurable: refused }` → `store: { ...s }`.
→ **18 passed (18).**

**Mutation A2** (A1 plus the defect PRD §7.10 exists to prevent). Replace `localEdit`'s refusal branch with an
immediate acknowledgement and no forced batch:

```ts
const attempt = journalWrite(s, id, bytes);
// report 'saved' the moment the handler returns, whether or not anything durable happened
return { ...attempt.store, acknowledged: [...attempt.store.acknowledged, id] };
```

→ **18 passed (18).** The test named _"does not acknowledge an edit the journal could not take until the batch
commits"_ asserts `acknowledged` **contains** the edit and `notDurable` is `null` — both of which the defect
satisfies. This is `f-9b49b74-journal-seal-64k-gap`'s reachable consequence verbatim: _"report the journal failure
but continue … a page kill in that window loses the only uncommitted copy."_

For calibration, the model **is** sensitive to mutations inside itself: deleting `if (bytes > MAX_UPDATE) …`
fails 3 tests, and replacing `reserve` with a read-`max`-and-add-one allocator fails 3 tests. The weakness is
specific — the model is disconnected from the documents (S-1, S-2) and never observes its own new state.

`commitBatch` is total and infallible in the model, so there is **no kill point between the journal write and the
IndexedDB commit** anywhere in the file. That window is the one `OC-025` exists for.

### S-7 · `MAX_UPDATE`'s value has two homes and they are not compared

`INTERIM_BYTES = 16 * 1024` is a private constant in `scripts/check-update-limit.mjs`. §12 states _"16 kB is the
interim floor to build against"_ in prose. The checker never reads it.

**Mutation L1.** Change §12's prose to `48 kB` — above the 19.6 kB the checker itself computes as the budget's
exhaustion point.

```
update limit: 0.0476 µs/byte from 3 measurements; the budget is exhausted at 19.6 kB and §12's 4 extrapolated
rows agree; the interim 16 kB is under it and under the module's guard.        ← PASS
```

The checker whose docblock invokes `RC-8C`'s _one home per fact_ keeps a second copy of the one number the whole
repair turns on. **`MAX_UPDATE` exists as a value nowhere else**: not in `src/`, not in the TRD as a constant, and
symbolically (`= 64`) in the test.

### S-8 · doubt · a row can be deleted from §12's extrapolation table

`S0-3/README.md` claims seven mutations all caught, including _"a drifting table row"_ and _"a deleted table."_
Both are true. **One deleted row is not**: 4 rows → 3 passes silently (`§12's 3 extrapolated rows agree`), because
the guard is `rows < 3`. Two deleted rows fails. Minor, but the claim is stated more strongly than it holds.

Confirmed genuinely caught: a drifted row value (L4), a loosened budget (L5), a table below three rows (L3).
`check-update-limit.mjs` is the strongest artifact in this cluster and S-7/S-8 are its only gaps.

### S-9 · actor authority · the budget is per key; the selected comparison counts one store

`row-3-record-format.md` §2 and `test/vectors/record-format.json`:

```
K_store = HKDF-SHA256(ikm = K_g, salt = "", info = LP("done/store/v1") || LP(workspace_id), L = 32)
```

**No principal and no device id.** Every device holding `K_g` derives the identical `K_store` for that generation.
The repair's counter is per store: _"One durable `SeqCounter` per (principal, workspace) … adds `k` to
`reserved[gen]` in the same transaction"_, and `mustRotateBefore` reads `s.reserved[s.gen]` for one `Store`.

SP 800-38D §8.3 bounds invocations **per key**. §6.1 claims the bound _"holds the collision probability at or below
2^-32."_ With `D` devices each permitted `2^32` invocations under one shared `K_store`, `q = D·2^32` and the random
96-bit-IV collision probability is ≈ `D²·2^-33` — above the stated bound for every `D ≥ 2`. §6.1 is careful to
argue that one sequence spanning the `content` and `heads` object stores keeps the budget _"the single comparison
it was argued as rather than a sum over two sequences"_ — and says nothing about the sum over devices, which is the
larger one.

This is inside `f-3bea0e6`'s own text (_"establish when a fresh generation receives a fresh invocation budget"_)
and the causal chain does not reach it: `RC-3` blames `3bea0e6` for selecting `seq` without an allocator, never for
the key-scoping decision that makes any per-store allocator insufficient. **The named ancestor is incomplete**
(axis 2).

### S-10 · the derivation is exact arithmetic over measurements the project itself says are unfit

`check-update-limit.mjs` fits its slope from `docs/performance.md`'s budget row. That file states its provenance:

> Batch means, taken on 2026-08-19 against `66a7c6a` plus the device runner

`66a7c6a` is the commit `f-66a7c6a-journal-benchmark-overwrites-one-slot` names, and that finding's conclusion is
that the measurement _"cannot by itself establish that real 18 B/419 B journal appends meet 1 ms."_ The harness
**has** been repaired in this tree — `test/latency/journal-bench.ts` now appends distinct slots with an
`OUTSTANDING = 256` window and reports `evicted` — but:

- `git diff 9edd930 -- docs/performance.md` is **empty**. The numbers were never re-taken.
- Nothing in `performance.md` marks its numbers as superseded by the harness change, and `evicted` has no column.
- Those numbers produce `0.0476 µs/byte`, `19.6 kB`, §12's four-row table, and `MAX_UPDATE`'s entire derivation.

`traceability.md` records `f-66a7c6a` as _"Owed to `L-4`"_, and `HANDOFF.md` describes the debt as _"the append
burst on a declared device population."_ That understates it: what is owed is not only the population but the
**re-measurement with the harness this tree already wrote**, and until it is taken, `limit:check`'s precision is
not evidence about the quantity it names. This is the cluster's own recurring defect — a check that passes while
proving less than it claims — sitting under its flagship checker.

### S-11 · doubt, pressed hard · axis 4, the p95 budget does not license a per-update ceiling

`S0-3/README.md`: _"§12's 1 ms journal budget runs out at about 20 kB … so the guard sits about 3.2× past a budget
the design calls a correctness property. An update that reaches it has already blown the thing the budget
protects."_ That sentence carries the choice of slicing over the two repairs `f-9b49b74-journal-seal-64k-gap`
itself names (refuse before mutation; enlarge the buffer). Three problems with it:

1. **The budget is `< 1 ms p95`, not a per-write cap.** §12's own justification is that exceeding it _"makes typing
   stutter"_ — a statement about the 18-byte keystroke path. A single 64 KiB paste costs ~3.2 ms once and does not
   move the 95th percentile of a keystroke-dominated distribution. Converting a distributional budget into a hard
   per-update ceiling is a category change, and it is the load-bearing step.
2. **Slicing does not reduce the cost.** At `0.0476 µs/byte`, one 1 MB update would take ≈ 50.0 ms; sixty-four
   16 kB slices take `64 × 825 µs` ≈ 52.8 ms, plus 64 key constructions and 64 `setItem` calls. The repair makes
   each _piece_ fit under the line while leaving the user-visible stall the same or worse. It satisfies the metric
   without improving the property the metric proxies — which is the exact criticism `RC-3` levels at the original
   benchmark.
3. **The dismissed alternative is nearly free and the tree says so.** `lib.rs`: _"being `.bss`, it costs memory
   pages rather than module bytes — and the module is not the thing that decides what a journal record may hold."_
   `P-3` records _"Whether the WASM buffer should shrink to `MAX_UPDATE` plus headroom"_ as out of scope, i.e. the
   buffer is acknowledged as free to move in either direction.

I am not asserting slicing is wrong — bounded, resumable slices are a real product benefit and §7.1 states it
well. I am asserting **the argument given for it does not support it**, and the simpler repairs were rejected on
that argument.

### S-12 · `f-b997cdb-checkpoint-coverage-unchecked`: the snapshot is still unrelated to the coverage it claims

The finding: _"the exact generator imports no Yjs implementation, derives no state vector or delete set from
`SNAPSHOT`, and performs no cross-check between `HEADS` and content."_ Its disposition: _"replace the independent
constants with an end-to-end Yjs checkpoint/suffix oracle."_

At HEAD, `scripts/generate-checkpoint-vectors.mjs` still has:

```js
const SV = '01a8e0c9d20503b1c4f70a02';
const DS = '02a8e0c9d2050107b1c4f70a0304';
const SNAPSHOT = utf8(
  'a Yjs full snapshot of the content root, including row 8’s attribution records',
);
```

and the "local re-derivation" the whole repair rests on is:

```js
if (fields.derivedSv !== SV) throw new Error('derived sv disagrees with the local derivation');
if (fields.derivedDs !== DS) throw new Error('derived ds disagrees with the local derivation');
```

`yjs@13.6.31` is already a dependency and is imported by ten other test files.

**Mutation C1.** Replace `SNAPSHOT` with `utf8('SHORT')` — five bytes — leaving `SV`, `DS` and `HEADS` untouched.
The manifest now claims coverage of content the snapshot cannot possibly contain.

```
$ node scripts/generate-checkpoint-vectors.mjs
Wrote 1 checkpoint vector and 36 negatives to test/vectors/checkpoint.json
$ node scripts/generate-checkpoint-vectors.mjs --check
checkpoint.json is current, and every negative still fails.
$ node scripts/check-aad-coverage.mjs
190 AAD fields, each isolated by a published negative.
```

**All 36 negatives still refuse, and every gate is green, with a manifest that demonstrably does not describe its
snapshot.** That is the finding, unrepaired.

### S-13 · the negative the `S0-5` README calls decisive refuses for a second reason

`S0-5/README.md` on `admission-signed-over-a-wrong-derivation`: _"Every signature verifies. The refusal **can only**
come from the restorer recomputing `{sv, ds}` itself."_

**Mutation C2.** Implement the honest-looking bug — a restorer that never materialises the snapshot and instead
cross-checks the admission against the manifest it already holds:

```js
if (fields.derivedSv !== manifest.sv)
  throw new Error('derived sv disagrees with the local derivation');
if (fields.derivedDs !== manifest.ds)
  throw new Error('derived ds disagrees with the local derivation');
```

```
checkpoint.json is current, and every negative still fails.
```

All 36 negatives pass, `admission-signed-over-a-wrong-derivation` included. The refusal does **not** require
recomputation; a manifest cross-check is sufficient, and a manifest cross-check is exactly the implementation
`f-b997cdb-checkpoint-coverage-unchecked` says is defective. This is precisely the _"negative refusing for a second
reason"_ seam `HANDOFF.md` points a challenger at, at the one negative the action singles out as its proof.

### S-14 · `f-b997cdb-attribution-self-replacement`: the named attack still verifies

The finding's validation procedure predicts: _"The current record-level verifier will report the replacement as
valid."_ I built it inside the generator (probe inserted before the identity block, removed afterwards): take the
laptop's genuine record for `CARD`, change `actorId` and `credential` to the phone, sign the complete tuple with
the phone's key, verify with the phone's key.

```
PROBE attacker self-consistent replacement claim for card_5B46KSTYGCJ0A1BX -> {"verified":true,"exact":true}
PROBE the claim layer verifies it: true  and it reads as EXACT: true
```

It still verifies, and it reads as **exact** against the current body — the strongest state the UI can show.
`S0-5/README.md` says _"There is nothing to refuse at the claim layer"_, and that is the problem: the repair
deliberately declines to add the check, so the whole defence rests on the reader performing `A-schemas.md` §3
step 7. Three gaps in that:

- **Step 7 has no falsifier.** _"For each card, recompute `card_id` from its creation certificate and refuse any
  card whose id does not match"_ is exercised by nothing. The two new negatives prove the hash is injective in the
  creator field (`creation-certificate-from-another-credential`) and that a certificate signature binds its signer
  (`creation-certificate-signed-by-another-credential`). Neither is the reader check that turns injectivity into a
  refusal.
- **Nothing cross-checks the claim's `credential` against the certificate's `creator_credential`.** Step 7 relates
  the _card id_ to _its_ certificate. A restorer that performs step 7 exactly as written still sees the phone
  named as creator inside a valid claim for a card whose id derives from the laptop's certificate.
- **Two of the three published positives would be refused by step 7.**
  ```
  PROBE published positive card ids: card_5B46KSTYGCJ0A1BX card_01HZXQ9J1N5P3R7T0V4X6Z8B3E card_01HZXQ9J1N5P3R7T0V4X6Z8B4F
  PROBE only this id is certificate-derived: card_5B46KSTYGCJ0A1BX
  ```
  `system-actor-import` and `empty-card` keep tip-era arbitrary ids with no certificate. The evidence publishes as
  valid two records the specified restorer must reject.

And, as at S-3, **four of the six falsifiers credited to this finding predate it**: `lifted-to-another-card`,
`reattributed-actor`, `reattributed-credential` and `substituted-commitment` all ran unchanged at `9edd930` and
gained only `falsifies:` tags.

The card-id derivation is a good idea and I want to say so plainly — a creator-committed identifier is the right
shape for this problem. What is missing is the half that makes it operative: a restorer-side check with a
falsifier, and a claim record whose creator field is not separately assertable.

### S-15 · doubt · single-owner `self_admitted` collapses the admission

`A-schemas.md` §1: _"`P-1` selected single-owner authority, so the only eligible client may be the producer …
the producer admits its own proposal and the record says it did."_ In the default one-device configuration the
`SemanticAdmission` reduces to the producer signing its own derivation, and `head_baseline_digest` — the one field
`A-schemas` marks as _"the only [step] that rests on trust"_ — is attested by the same party. In the compromise
scenario `RC-5` exists for, that party is the attacker. The design states this honestly rather than hiding it, so
it is a doubt and not a ✗; but it means the trust half of the repair is inert in the common case, and the
arithmetic half is the constant comparison of S-12.

### S-16 · cross-cutting · `check-traceability.mjs` credits any negative that names a finding

The matrix's declared limit is that it does not prove a falsifier **isolates**. It is weaker than that: it does not
prove a falsifier is **related**, and it does not prove one **postdates the defect**.

**Mutation T1.** Tag `flipped-tag-bit` — an AEAD tag-integrity negative — as falsifying the sequence-allocator
finding, and regenerate.

```
Wrote docs/review/remediation/traceability.md: 86 claims over 27 findings, 27 of 28 current defects falsified.
| f-3bea0e6-store-sequence-allocation-undefined | medium | S0-3 | `flipped-tag-bit` (negative) · `kind-swapped` …
```

Accepted without complaint, and the headline count went up. This is the mechanism by which S-3's and S-14's
tip-era negatives came to be credited: adding a tag is the whole of the work, and a "did this artifact exist while
the defect survived?" test — a cheap one, since every finding carries `introduced_by` and the review pins its own
tip — would have caught six of them in this cluster alone.

### What held

Two repairs survived direct attack and deserve saying so:

- **`f-9b49b74-wasm-glue-key-nonce-lengths`.** Removing the width guard from `seal.generated.ts` is caught by
  three independent oracles: `wasm:verify` (7 of 15 checks fail, naming each width), `wasm:stale` (the glue no
  longer matches the crate template), and `typecheck` (`KEY_BYTES` declared and never read). The finding's own
  supporting experiment reproduces exactly — with the guard removed, an empty nonce after a real one returns
  byte-identical ciphertext (`bf73e38b7dab7863f920039a3037a5c83381ad95e0e28246` twice) while a fresh instance
  returns different bytes. The guard is in the right place: the Rust side is handed two lengths, neither of which
  is the key's or the nonce's, and `memory.set` of a short input cannot clear a tail.
- **`f-9860a0b-journal-rotated-vector-reuses-key`.** Deleting `kg: KG2` from the rotated case — restoring the
  tip's fixture exactly — fails immediately and precisely: `Error: Negative vector "wrong-generation-key" succeeded
when it must not.` The negative isolates: it uses generation 2's own correct AAD and only the generation-1
  subkey, so nothing but the key lookup can refuse it, which is the half `wrong-generation` cannot reach. The
  published vectors now carry distinct `k_g` (`4a1f8c05…` / `b7e4319d…`) and distinct `k_journal`
  (`5fd6bb30…` / `0279f645…`).

### A note on `pnpm check`

`format` fails on 58 files and `lint` reports 4,284 diagnostics (4,269 warnings, 15 errors), as
`HANDOFF.md` warns. Its characterisation —
_"on files unrelated to any repair"_ — is not accurate at HEAD: **56 of the 58 are files changed since `9edd930`**,
and three are documents this cluster's repairs edited (`docs/TRD.md`, `row-3-record-format.md`,
`row-7-checkpoint.md`). With `format:fix` forbidden because it breaks the §15.1 register parser, `pnpm check`
cannot pass, and the reason now includes the remediation's own edits rather than only inherited ones.

---

## 3. What I ran

All commands from `/Users/thomasingalls/Code/done/.claude/worktrees/s09-storage` at `5923f51`, Node v26.7.0.

**Baseline, unmutated (the non-author rerun `S0-9` requires):**

| command                | result                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `pnpm typecheck`       | PASS                                                                                  |
| `pnpm vectors:check`   | PASS — 16 generators current; `190 AAD fields, each isolated by a published negative` |
| `pnpm retention:check` | PASS — 12 months across 6 anchors; 5 states, 6 deletion classes                       |
| `pnpm status:check`    | PASS — 17 selected, 4 unselected, disjoint                                            |
| `pnpm limit:check`     | PASS — `0.0476 µs/byte from 3 measurements; exhausted at 19.6 kB; 4 rows agree`       |
| `pnpm trace:check`     | PASS — `85 claims, 27 of 28 current defects falsified, 2 declared owed`               |
| `pnpm wasm:verify`     | PASS — `15 checks pass`                                                               |
| `pnpm wasm:stale`      | PASS — `generated module matches the crate (6465 B wasm)`                             |
| `pnpm review:check`    | PASS — `work: 16 complete · ready: none · findings: 37 validated`                     |
| `pnpm test`            | PASS — `36 passed (36)` files, `371 passed (371)` tests                               |
| `pnpm format`          | **FAIL — 58 files** (pre-existing; see the note above)                                |
| `pnpm lint`            | **FAIL — 4,284 diagnostics: 4,269 warnings, 15 errors** (pre-existing)                |

Re-run after every mutation was restored: identical, and `git diff` empty (only the untracked `.install.log`).

**Tip verification (axis 1), by reading `9edd930` rather than the findings' prose:**

```
git show 9edd930:docs/TRD.md                        # §6.1 has no ceiling, no allocator, no MAX_UPDATE
git show 9edd930:wasm/journal-seal/src/lib.rs       # MAX_PLAINTEXT = 65536
git show 9edd930:wasm/journal-seal/seal.generated.ts# one RangeError, no key/nonce width check
git show 9edd930:scripts/generate-journal-vectors.mjs   # one KG; rotated case changes only `gen`
git show 9edd930:scripts/generate-record-vectors.mjs    # kind-swapped, seq-edited already present
git show 9edd930:scripts/generate-attribution-vectors.mjs # 4 of the 6 credited negatives already present
git show 9edd930:test/latency/journal-bench.ts      # one fixed slot
git diff 9edd930 -- docs/performance.md             # empty
```

**Mutation battery** — each applied to a temp-file snapshot and restored from it:

| #     | Mutation                                             | Expected                                         | Got                                                              |
| ----- | ---------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| M1+M2 | delete §6.1's ceiling + allocator (2,987 chars)      | some gate fails                                  | **all gates PASS, 18/18 tests**                                  |
| M3    | §6.1 ceiling `2^32` → `2^40`                         | some gate fails                                  | **all gates PASS, 18/18 tests**                                  |
| A1    | `notDurable` no longer set on refusal                | a test fails                                     | **18/18 PASS**                                                   |
| A2    | acknowledge an unjournallable edit immediately       | a test fails                                     | **18/18 PASS**                                                   |
| A3    | delete the oversize gate                             | 3 tests fail                                     | 3 failed ✓                                                       |
| A4    | `reserve` reads `max + 1`                            | tests fail                                       | 3 failed ✓                                                       |
| L1    | §12 interim floor `16 kB` → `48 kB`                  | `limit:check` fails                              | **PASS, still prints "16 kB"**                                   |
| L2    | delete one §12 table row (4 → 3)                     | fails                                            | **PASS ("3 extrapolated rows agree")**                           |
| L3    | delete two §12 table rows (4 → 2)                    | fails                                            | fails ✓ (`yielded 2 rows`)                                       |
| L4    | §12 `8 kB` row `435` → `500 µs`                      | fails                                            | fails ✓ (recomputed 435)                                         |
| L5    | §12 budget `1 ms` → `2 ms`                           | fails                                            | fails ✓ (`gives 40.1 kB`)                                        |
| M5a   | remove the wasm key/nonce width guard                | `wasm:verify` fails                              | fails ✓ (7 of 15, each width named) + `wasm:stale` + `typecheck` |
| M4    | rotated journal case reuses `KG`                     | `wrong-generation-key` refuses                   | fails ✓ with that exact name                                     |
| C1    | `SNAPSHOT` → 5 bytes, coverage untouched             | some negative fires                              | **36/36 still refuse; `--check` current**                        |
| C2    | `admit()` compares to the manifest, not a derivation | `admission-signed-over-a-wrong-derivation` fires | **36/36 still refuse**                                           |
| T1    | tag `flipped-tag-bit` as falsifying `f-3bea0e6`      | matrix objects                                   | **accepted, 85 → 86 claims**                                     |
| probe | attacker self-signs a replacement claim for `CARD`   | refused                                          | **`{"verified":true,"exact":true}`**                             |
| probe | direct nonce-reuse repro with the guard removed      | identical bytes                                  | identical ✓                                                      |

Snapshots were taken with `cp` into the session scratchpad before each mutation and restored with `cp` afterwards.
`git checkout --` was never used. The two vector files a write-mode regeneration touched
(`test/vectors/checkpoint.json`, `test/vectors/record-format.json`) were restored from snapshot and re-verified.

---

## 4. What I could not check, and why

- **Anything requiring a browser or a device.** `pnpm test:geometry` (Playwright) and `pnpm test:latency` were not
  run; no Pixel 9a and no headless browser here. This is the reason S-10 is stated as _the numbers were never
  re-taken_ rather than _the numbers are wrong_ — I can show the harness changed and the file did not, not what a
  re-run would say.
- **The Rust toolchain.** `pnpm wasm:stale` compares the generated glue to the crate template and passed, but I did
  not rebuild the crate, so I cannot independently confirm the 6,465-byte blob corresponds to `src/lib.rs`.
  `f-9b49b74-wasm-source-artifact-drift-unchecked` is the finding that owns that and is a declared `L-4` gate.
- **Whether the rest of the tree agrees.** I read `RC-3` and `RC-5` and their artifacts. Cross-cluster compositions
  — `S0-2`'s `GenerationApply` against §6.1's trim, `S0-6`'s packages carrying checkpoints — are `S0-9`'s
  reconciliation step and are not in this report.
- **`pnpm format` / `pnpm lint` at `9edd930`.** I did not check out the tip, so I confirmed only that 56 of the 58
  format failures are in files changed since it — enough to qualify `HANDOFF.md`'s claim, not to falsify it.
- **The two `L-4` gates in this cluster** — `f-66a7c6a`'s append burst on a declared population and
  `f-bd87655-baseline-not-performance-floor` — were not challenged as repairs, since neither is claimed as one.
  S-10 is a challenge to what `limit:check` is entitled to conclude while they are open, not to the deferral.

---

## 5. What I think this means

The two direct repairs in this cluster — the wasm width guard and the rotated-generation fixture — are sound, and
their falsifiers refuse their own defects with the right diagnosis. `check-update-limit.mjs` is a genuinely strong
artifact and its derivation is real.

`S0-3`'s and `S0-5`'s design repairs are a different matter. Both wrote the construction into the documents and
then wrote evidence that runs beside the documents rather than against them, and the evidence is credited by a
matrix that cannot tell a new falsifier from an old one. The result is that:

- `f-dbfd01f` and `f-3bea0e6` reintroduce in one document edit with everything green (S-1, S-2);
- `f-b997cdb-checkpoint-coverage-unchecked`'s central claim survives a five-byte snapshot (S-12) and its decisive
  negative refuses for a second reason (S-13);
- `f-b997cdb-attribution-self-replacement`'s named attack still verifies (S-14);
- six of this cluster's credited falsifiers were running while their defects survived (S-3, S-14, S-16).

Per `S0-9`'s rollback rule, that returns `RC-3` to `P-3` and `RC-5` to `P-8` rather than to a vector patch — but
three of the repairs are close, and the missing pieces are small and nameable: a document-to-artifact check for
§6.1 and §15.1 row 3 (the shape of `status:check`, which already exists), a real Yjs derivation in the checkpoint
generator (`yjs` is already a dependency), a restorer-side falsifier for `A-schemas` step 7, and a
did-this-postdate-the-defect test in `check-traceability.mjs`.

The `K_store` key-scoping gap at S-9 is the one that is not small. It is a live defect in the repaired
construction rather than a weakness in its evidence, and I do not think it belongs to `L-1`.
