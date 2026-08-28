# `S0-9` — independent challenge, PROTOCOL cluster (`RC-1`, `RC-4`)

**Standing:** record — speaks of `5923f510fd9ac3c1cd809e9bec352a7f73751492`, the challenged tip; pinned in
`census.json`, so edits land only as dated addenda under a re-pin.

**Challenger:** independent of every repair author. **Worktree:** detached at `5923f51`, `pnpm install
--frozen-lockfile`. **Date:** 2026-08-28.
**Scope:** `RC-1` client-authenticated recipient authority · `RC-4` exact-byte outbound acceptance machine.

Nothing in this report changes a `status:` in `docs/review/findings/`. Every mutation below was applied from a
snapshot held in memory and written back in a `finally`; no `git checkout --` was used; `pnpm format:fix` was
never run. The worktree is clean apart from this file and the pre-existing untracked `.install.log`.

**Headline.** Both root causes survive the *attacks their findings name* — I reintroduced each defect as its own
text describes it and the credited falsifier refused it, with the right diagnosis. What does not survive is the
layer above: **five defects, all of them the program's own recurring shape — a check that passes while proving
less than it claims.** Two of them are new instances created by the repairs themselves, in the action written to
close that exact defect class.

---

## 1. Verdict table

| | 1 Survival at tip | 2 Causal ancestor | 3 Local theorems | 4 Simpler repair | 5 Actor authority | 6 Crash/retry/concurrency | 7 Named adversarial |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`RC-1`** | ✓ verified at `9edd930`: no `certified`/`eligib` in the transition generator, no `R_pub`/recovery in the enrollment generator | ✓ `c611666` carries both contradictory sentences; `a073574`'s row 11 has no `R_pub` in its transcript | ✗ **`RecoveryBootstrap` is in no normative document.** §13.2 cites §13.8; §13.8 does not contain it. Bootstrap→certified-set→rotate is composed nowhere | ✓ branch B's reasoning holds; I found no materially simpler correct repair — but see D-1, the missing binding is *smaller* than what replaced it | ✗ **the `CertifiedSet` does not name its approver, and `members_digest` binds `W_pub`, not a signing key.** The approval's verification key can only come from the service-signed epoch | ✗ `P-1` criterion 11 has no falsifier; §13.6's six enrollment states are prose only; two sibling sets at one `parent_epoch` are unmodelled | ✗ both named attacks are refused, but **5 of the `CertifiedSet`'s 8 fields are isolated by nothing**, and the construction escapes `pnpm vectors:coverage` entirely |
| **`RC-4`** | ✓ verified at `9edd930`: `network-envelope` reads `version: null, suite: null`; §6.1 has three kinds; §7.4 points refusal at §15 row 15 | ✓ `3bea0e6` created the null carrier legitimately, `992bc91` selected row 4 without amending it, `745e332` introduced "definite refusal" | ✗ **the `outbound` record's `state` field is in no schema and no AAD**, and it drives the same trim path row 3's editable-`kind` argument was written about | ✗ **a deterministic (position, generation) nonce removes the spool entirely.** It was declined for lack of evidence of a problem nobody measured; the chosen repair stores every update twice locally | ✓ `K_accept` signing the refusal is correct and adds no reachable power — a compromised `K_accept` can already forge acceptance | ✗ **"a head at another position is not about me" is unfalsified in the test and absent from the generator's copy of the same rule**; the two copies disagree and nothing checks | ✗ **the successor-licence rule has no field on the wire.** Row 6 says a successor binds its `refusal_id`; row 4 says "none of them a byte" |

Separately, on the third `RC-4` finding:

| | Verdict |
| --- | --- |
| `f-992bc91-network-carrier-registry-stale` | **half closed.** `checkCarriers` refuses the exact tip staleness (MUT-1). Its own validation procedure step 4 — *remove its acceptance row independently; both changes must fail the generator* — does not hold (MUT-2) |

---

## 2. Every ✗ and every doubt, in detail

### D-1 — `RC-1`, axes 5 and 7. The certified set cannot verify its own approval without the service

**What the repair claims.** `P-1`: *"A service-signed epoch is usable for key distribution only when its recipient
set is covered by a client signature over the exact credential-to-`W_pub` bindings and the exact recovery
recipient."* TRD §13.5: *"which the service serialises and cannot author."* `traceability.md` credits
`certified-set-approved-by-an-impostor` with refusing `f-c611666-rotation-reader-eligibility-missing` (high), and
its published `why` reads *"Signed by a key that is neither an eligible client nor the lineage authorization key."*

**What is actually there.** In `scripts/generate-transition-vectors.mjs`:

```js
const approves = async (over, sig = approval) => {
  const ok = await verify(KEYS.owner.public_key, sig, certifiedSetMessage({ members: honestMembers, ...over }));
  if (!ok) throw new Error('the approval does not cover this set');
```

The verification key is a hard-coded constant. Nothing asks whether a key is an eligible client, because nothing
*can*: the `CertifiedSet` message is `label ‖ v ‖ workspace_id ‖ lineage_id ‖ parent_epoch ‖ next_epoch ‖
members_digest ‖ recovery_state_digest` — **it does not name its approver** — and `members_digest` is
`(credential_id ‖ W_pub)*`, a *wrapping* key. There is no client-authenticated binding from a credential to the
Ed25519 signing key whose signature approves a set. An exact-tree search finds device signing keys certified in
exactly one place: the service-signed epoch (`docs/TRD.md:1182`, §13.2's authority table row).

**The demonstration.** Make the verification key what a real verifier must do — look it up — rather than a
constant, and the negative stops being a negative:

```
node scripts/generate-transition-vectors.mjs --check
Error: Negative vector "certified-set-approved-by-an-impostor" succeeded when it must not.
```
(mutation: `approves(over, sig, pub = KEYS.owner.public_key)` and the impostor call passing
`KEYS.impostor.public_key`; spec at `scratchpad/approver.json`.)

So the negative demonstrates that Ed25519 refuses a signature under a *different* public key. It does not
demonstrate that the *right* key was chosen, and the published `why` asserts a rule the artifact does not test.

**Reachable consequence, and it is the finding's own.** The parent certified set binds `LAPTOP → W_pub_LAPTOP`
and says nothing about `LAPTOP`'s signing key. A hostile service publishes an epoch in which `LAPTOP`'s signing
key is one it holds. A verifier asks *is the approver a certified member?* — yes — and *does the approval verify
under that member's key?* — yes, under the substituted one. The service has now approved a successor set adding
its own credential, and the next rotation wraps `K_(g+1)` to it. That is
`f-c611666-rotation-reader-eligibility-missing` steps 1–5 with one extra hop, and the extra hop is free.

**Why this is the sharpest form of the criticism.** The program already knows the correct shape and used it one
carrier along: `head-discovery`'s bootstrap signer is *"committed in the prior `RecoverySet` and sealed beside
`R_priv`"* — a client-authenticated verification key. `members_digest` needed one more field per member. That is
strictly *smaller* than the machinery that was built, which is why axis 4 is marked ✓ with this note rather than
✗: the simpler repair is not an alternative to `RC-1B`, it is a missing part of it.

### D-2 — `RC-1`, axis 7. Five of the `CertifiedSet`'s eight fields are isolated by nothing

The construction is **not registered with `check-aad-coverage.mjs`**, so `pnpm vectors:coverage` — the one
oracle the program names as proving isolation — never sees it. I ran the audit's own procedure by hand: elide
each field from `certifiedSetMessage`, regenerate, and see which negative stops failing.

| field | elided → | |
| --- | --- | --- |
| `label` | every check green | ✗ |
| `v` | every check green | ✗ |
| `workspace_id` | every check green | ✗ |
| `lineage_id` | every check green | ✗ |
| `parent_epoch` | `certified-set-from-another-epoch` succeeded when it must not | ✓ |
| `next_epoch` | every check green | ✗ |
| `members_digest` | `certified-set-with-an-added-member` succeeded when it must not | ✓ |
| `recovery_state_digest` | `certified-set-with-substituted-recovery-state` succeeded when it must not | ✓ |

With `workspace_id` deleted from the signed message and the vector regenerated:

```
BEFORE message_hex: 0015646f6e652f...0131001d77735f3031485a5851374d344b395032523654385630593342354e3744...
AFTER  message_hex: 0015646f6e652f...0131001d6c6e5f3031485a5851374d344b395032523654385630593342354e3744...
AFTER  message desc: CertifiedSet = LP("done/certified-set/v1") || LP(dec v) || LP(workspace_id) || ...
pnpm vectors:check   → 190 AAD fields, each isolated by a published negative.
pnpm trace:check     → 85 claims, 27 of 28 current defects falsified.
pnpm test            → 371 passed
```

The `ws_…` bytes are gone from the signed message; the published prose still says `|| LP(workspace_id) ||`. The
vector now documents a field it does not bind, and every gate is green — while the audit's summary line claims
every field is isolated.

An unbound `workspace_id` or `lineage_id` on a recipient-set approval means an approval collected in one
workspace or one pre-migration lineage verifies in another. TRD §14.2 forbids exactly that replay for transition
intents; the object that decides recipients has no such protection and no negative that would notice.

### D-3 — `RC-1`, axis 3. The object that preserves the four-object theorem is in no normative document

`RC-1`'s own diagnosis: *"requiring an old installer would repair rotation by breaking the validated total-loss
theorem."* `RecoveryBootstrap` is what stops that. Exact-tree search over the normative documents:

```
grep -in "bootstrap" docs/TRD.md   → 1 hit,  line 2275, the §13.2 authority table, citing §13.8
grep -in "bootstrap" docs/PRD.md   → 1 hit,  line 1871, the §7.3 authority table
awk '/^### 13\.8/,/^### 13\.9/' docs/TRD.md | grep -ci "bootstrap\|certified"  → 0
```

**§13.2's authority table cites §13.8, and §13.8 does not carry the construction.** It lives in
`S0-2/A-schemas.md` (a remediation working document), in `generate-head-discovery-vectors.mjs`, and in an
*Amended by* header note on row 9. That is a dangling normative reference — the generator ran ahead of the
document, which is `f-992bc91-network-carrier-registry-stale`'s shape and precisely what `HANDOFF.md` warns
`pnpm vectors:check` cannot see.

**And the second half of `P-1` criterion 6 is composed nowhere.** The criterion is *"A four-object total-loss
bootstrap with no surviving eligible client succeeds, **and a subsequent rotation to the recovered credential
succeeds**."* `S0-2`'s Stage D row 6 claims only the first half. `grep -rn "bootstrap" scripts/generate-transition-vectors.mjs test/*.ts`
returns nothing. §13.7 says a rotator wraps to *"the certified recipient set of its parent epoch"*; after a total
loss that set names only dead credentials, and the `Bootstrap` message produces `new_credential_id ‖ new_W_pub ‖
new_recovery_state_digest` — the ingredients of a certified set, but no rule anywhere turns them into one. As
written, the recovered credential can read and cannot rotate.

### D-4 — `RC-1`, axis 6. `P-1` criterion 11 has no falsifier, and enrollment has no crash model

`P-1` criterion 11: *"Key delivery and set activation either commit together or leave a resumable pending
certificate; every crash point between them is recoverable."* `S0-2`'s Stage D maps this onto falsifier 10,
`test/generationApply.test.ts`. That model's eight steps are openers, coverage, the active-generation marker,
checkpoint admission and opener retirement. **None of them is key delivery or certified-set activation.**

§13.6's six enrollment states — *service-admitted, ceremony-committed, SAS-confirmed,
key-and-recovery-state-delivered, installed-and-countersigned, certified* — are exactly the crash points the
criterion names, and they are prose:

```
grep -rn "ceremony-committed\|SAS-confirmed\|installed-and-countersigned" scripts/ test/   → nothing
```

`S0-4` wrote a crash schedule for its own composition and `S0-2` wrote one for the generation apply. The join
`P-1` explicitly required did not get one.

**Doubt, unfalsified:** two owner devices enrolling different new devices concurrently produce two successor sets
with the same `parent_epoch` and `next_epoch`, differing only in `members_digest`. Row 15's three-way rule
serializes *transitions*; a certified set rides inside an epoch and is not a transition. `next_epoch` appears in
the repository only inside a prose message string. If the loser's set is simply dropped, a device a person
authenticated by typing five symbols is left at *installed-and-countersigned* forever — indistinguishable, in
every artifact, from the admitted-but-uncertified credential the design exists to refuse.

### D-5 — `RC-4`, axis 7. The successor licence has no field on the wire

This is the rule `S0-4`'s README singles out as its own best result: *"What replaced it is load-bearing: a
refusal licenses its own position and no other."* It is asserted in `test/outboundSpool.test.ts` (`submit` reads
`e.parent`), and it is `A-schemas.md` falsifiers 13, 14 and 15.

The envelope has nowhere to put it. TRD §7.4's selected format:

```
Clear header  v, workspace_id, credential_id, epoch, gen, seq, nonce[12], digest
AAD   = LP("done/env/v1") || LP(dec v) || LP(workspace_id) || LP(credential_id) || LP(dec epoch) || LP(dec gen) || LP(dec seq)
sig   = Ed25519( ... <the AAD's fields> || LP(hex nonce) || LP(hex digest) )
```

`generate-envelope-vectors.mjs`'s bound field list is **byte-identical to `9edd930`'s** — I diffed the two
`aadFields('envelope aad', …)` blocks directly. `grep -rn "parent_refusal" docs/ scripts/ test/` finds it only
inside the `Refuse` message (where it chains refusal to refusal), in `A-schemas.md`, and in the model.

The two rows state the contradiction themselves:

- **row 6**: *"licensing a successor that binds its `refusal_id` — at that refusal's own position and no other"*
- **row 4**: *"three additions, **none of them a byte**"*

A licence in the sealed body would not help: §7.2 has the relay validate the clear header with no content key, so
the acceptance service could not read it. Three of the four rules that distinguish this repair from `RC-4A` are
asserted over a field that does not exist. This is `f-992bc91-network-carrier-registry-stale`'s shape, created
new by the action that closes two of its three sibling findings.

### D-6 — `RC-4`, axis 3. The `outbound` record's `state` field is in no schema and no AAD

The whole spool repair rests on four states. `S0-4/A-schemas.md` tabulates them; TRD §7.4 line 1090 names them:
*"the pending set and the retained suffix are the same records at different states — `minted`, `sent`,
`accepted`, `closed` — so what distinguishes them is a field rather than a location."*

That field is in neither selected schema:

```
TRD §6.1  StoredRecord { v, gen, seq, kind: 'update'|'state'|'heads'|'outbound', nonce, ct }
row 3     AAD = LP("done/store/v1") || LP(principal_id) || LP(workspace_id) || LP(dec v) || LP(dec gen) || LP(dec seq) || LP(kind)
```

`grep -rn` for the four state names in `docs/selections/row-3-record-format.md` → nothing.
`test/vectors/record-format.json`'s `store_aad` → unchanged.

Row 3's and §6.1's own argument for binding `kind` is: *"IndexedDB holds a structured clone whose properties the
load path trusts… an editable `kind` is therefore a way to make the store delete its own history through its own
trim path."* The repair introduces a **second** trust-bearing clear property that drives the **same** trim path
— *nothing unresolved is ever trimmed; a resolved record is trimmed only below the second-newest checkpoint* —
and does not bind it. Both of `f-992bc91`'s named surviving failures follow directly:

- flip `minted`/`sent` → `accepted`: the device stops resubmitting a write that was never accepted → indefinite
  write unavailability, and a gap at that position that stalls the chain;
- flip `sent` → `closed` below the floor: it is trimmed → the device-owned migration suffix §14.3 depends on is
  destroyed.

This is not a typo. `state` must be mutable and the AAD covers the record, so binding it means re-sealing —
a fresh nonce and another invocation against `reserved[gen]` — on every transition. That is a real design
question the repair skipped rather than resolved, and no document surfaces it.

### D-7 — `RC-4`, axis 4. The spool is avoidable, and it doubles local write volume

`RC-4`'s own alternatives list includes *"deterministic/reconstructible envelope alternative"*. `S0-4` declined
to reopen row 4 because *"there is no evidence of the spool-size problem that would justify it"* — declining the
simpler option for want of a measurement nobody took.

The finding's own diagnosis is that re-enveloping *"produces different bytes at that position… because part of
it is random"*. Remove the randomness and the problem dissolves: a nonce derived deterministically from
`(credential, position, generation)` is unique under a per-generation key by construction — it is NIST SP
800-38D's *deterministic construction*, which the same document already prefers, and §7.4 already reserves the
position before minting so the input exists. Ed25519 is deterministic, and `digest` is a function of the
ciphertext. The remaining non-determinism is the batch boundary, which is a descriptor, not a ciphertext.

What that removes: an object store, a fourth record kind, a four-state machine, the trim ordering — and D-6's
unbound `state` field with it. Row 6's *"a device retains its own outbound envelopes back to the second-newest
checkpoint"* is then discharged by retaining the inputs, which the journal and content records already hold.

What the chosen repair costs instead, unstated anywhere: `plaintext = the complete envelope — clear header,
sealed body, signature`, re-sealed under the store subkey. **Every update is stored locally twice and encrypted
twice**, once as a content record and once inside an outbound record. `check-budget.mjs` is a bundle-size
budget and `check-update-limit.mjs` is µs/byte; neither sees local storage volume, and §12 was not revisited.

I am not claiming branch A is wrong — I am claiming the axis was decided against an unmeasured hypothetical, in
the direction the author had already chosen, and that the cheaper option removes a defect the chosen one has.

### D-8 — `RC-4`, axis 6. Two copies of `decide`, they disagree, and the rule they disagree about is unfalsified

`test/outboundSpool.test.ts`:

```ts
case 'head':
  if (answer.position !== mine.position) return 'resubmit';
  return answer.digest === mine.digest ? 'accepted' : 'equivocation';
```

`scripts/generate-antireplay-vectors.mjs`:

```js
if (response.kind === 'head') {
  return response.digest === mine.digest ? 'accepted' : 'equivocation';
}
```

**The generator's copy has no position check.** It is also dead: `grep -n "decide(\|verdict("` shows every call
passes a `refusal` or an `unsigned`. Replacing the whole branch with `return 'accepted';` leaves
`antireplay.json is current, and every negative still fails` and `190 AAD fields, each isolated`.

**And the test's copy, which has the rule, is not tested for it.** Deleting the position line from
`outboundSpool.test.ts` leaves `Tests 17 passed (17)` — the only survivor of an 11-mutation battery (the other
ten are listed in §3).

The consequence is the named `RC-4` adversary, *a relay that lies in either direction*. A hostile relay forwards
a genuine `K_accept`-signed head for position *n+1* to a client waiting at *n*. Under the generator's rule the
digests differ, so the verdict is `equivocation` — and §7.5 says an equivocating credential *"reads as a
compromised one"*. The relay makes an honest client convict itself, using bytes the service really signed. The
correct rule exists in one of the two copies and nothing keeps them in step; `A-schemas.md` §4 states it in a
table and no falsifier covers the row.

### D-9 — `f-992bc91-network-carrier-registry-stale`. Half the finding's own validation procedure does not hold

The finding's step 4: *"Mutation-test selected row 4 back to a null carrier **and remove its acceptance row
independently; both changes must fail the generator.**"* Its disposition: *"make its owner/acceptance coverage
register-aware."*

**Owner coverage: closed.** Reverting the carrier to the tip's exact nulls fails with the right diagnosis —

```
Error: Carrier network-envelope is still marked unselected, but row 4, review 3b is selected.
Fill in its version, suite, label and AAD binding from that row.
```

**Acceptance coverage: not implemented.** `checkCarriers` iterates `ACCEPTANCE` and validates each row against
the registry; nothing requires a carrier to *have* rows. Deleting all three `network-envelope` acceptance rows and
regenerating:

```
Wrote suite 1 (11 roles, 0 deferred), 4 carriers, 7 acceptance rows and 4 primitive KATs.
algorithm-suite.json is current; primitive KATs and the §13.2 separation check pass.
190 AAD fields, each isolated by a published negative.
traceability: 85 claims, 27 of 28 current defects falsified.
selection status / update limit / retention: all green
```

The guarded direction is acceptance → carrier (`Acceptance row names unknown carrier X`). The direction the
finding is about — a selected carrier with no defined acceptance behaviour, in *"the artifact that claims to be
the total suite and acceptance registry"* — is unguarded, and a new carrier arriving without acceptance rows
would repeat the finding exactly.

### D-10 — shared machinery. `pnpm vectors:coverage` checks arity, not identity

`check-aad-coverage.mjs`'s converse rule is *"a negative that calls itself `aad-only-` must isolate one field"* —
and it counts `fields.length === 1` without ever comparing the field to the negative's name.

Swap what two negatives in `generate-transition-vectors.mjs` actually test, keep both names and both published
`why` strings (`aad-only-intent-workspace-id` patches `lineage`, `aad-only-intent-lineage-id` patches
`workspace`):

```
transition.json is current; the keypair and row 1 cross-checks pass.
  ok  scripts/generate-transition-vectors.mjs — transition intent (8), transition outcome (8)
190 AAD fields, each isolated by a published negative.
```

Byte-identical vector, green audit, and both published attributions now describe the wrong attack. The
aggregate claim (*every field is isolated by some negative*) still holds; the per-negative claim that each
`falsifies`/`why` line makes does not, and `traceability.md` is generated from exactly those per-negative claims.

**And three generators exempt most of their negatives from that check entirely**, by passing a partial list to
`reportAudit`. In my cluster:

```
head-discovery: published = 25   subject to the converse check = 9   escaping = 16
```

All ten `aad-only-bootstrap-*` names escape — including `aad-only-bootstrap-service-nonce`, the one `S0-2`'s
README holds up as the fix for *"a negative that fails twice isolates nothing"*. The forward direction still
covers them (it collects every `refuses()` call), and with the bootstrap's current 1:1 field-to-negative mapping
the forward check masks the gap, so this is latent rather than presently exploited. **Outside my cluster and
owed to whoever reconciles:** `checkpoint` 18 of 36 and `package` 15 of 31 have the same asymmetry.

### D-11 — minor, `RC-4`. One half of the refusal subject check has no negative

Fine-grained isolation of `decide`'s subject test in `generate-antireplay-vectors.mjs`:

| guard reduced to | result |
| --- | --- |
| workspace only | `refusal-for-another-credential` succeeded when it must not ✓ |
| **credential only** | **exit 0 — no negative notices the missing workspace check** |
| position only | `refusal-for-another-digest` succeeded when it must not ✓ |
| digest only | `refusal-for-another-position` succeeded when it must not ✓ |

There is a `refusal-for-another-credential` and no `refusal-for-another-workspace`. It is probably not reachable
— `K_accept` is certified per-lineage, so a cross-workspace refusal should fail the signature first — which is
the argument for either deleting the redundant check or publishing the negative, not for leaving an unfalsified
guard where a reader will take it for a tested one.

### D-12 — minor, documentation. `HANDOFF.md` understates the format hazard

`HANDOFF.md`: *"The four markdown documents it wants to reformat include the TRD"* and *"the pinned tip already
fails `pnpm format` and `pnpm lint` on files unrelated to any repair."*

```
pnpm format → Format issues found in above 58 files.   (52 .md + 6 .mjs)
```

Among them: `docs/selections/row-3-record-format.md` and `docs/selections/row-6-antireplay-retention.md` —
rows **this cluster's own repairs amended**. So *"unrelated to any repair"* is false, and someone following
`HANDOFF`'s *"format individual files you have changed"* would run `oxfmt` over row 3 and row 6. Whether that is
harmful I did not test; the count and the "unrelated" claim are both wrong and should be corrected before
`S0-10` relies on them.

---

## What held, under attack

Recorded because *"I attacked this and it held"* is a result.

- **Both `RC-1` defects, reintroduced exactly as their findings describe them, are refused.**
  Stripping `recovery_state_digest` from the enrollment transcript (the tip's shape) →
  `Negative vector "substituted-recovery-state" succeeded when it must not.`
  Adding the service-admitted credential to the rotation's wrap map →
  `The rotation wraps to …PHN, …LAPT, …INTRUDR but the certified set licenses …PHN, …LAPT.`
  Making `recipientsOf` return `ROSTER` also fires, though its diagnosis reads backwards under that direction.
- **The refusal negatives isolate.** Each fine-grained guard removal in the generator's `decide` rescued exactly
  the expected negative, and only that one. The nine `aad-only-refusal-*` negatives genuinely patch the client's
  own envelope alongside the message, so they fail on the signature and not on a subject mismatch; the three
  `wrong_subject` negatives verify their signature is genuine *before* asserting refusal, which is the correct
  defence against a negative that fails for the wrong reason. This is the best-built evidence in the cluster.
- **`test/outboundSpool.test.ts` caught 10 of 11 mutations** (D-8 is the survivor): refusal position, refusal
  digest, refusal signature, refusal permanence, licence position, licence existence, submit idempotency, the
  second-newest floor, the unresolved-record guard, and the position advance.
- **`trace:check` catches a falsifier that stops running.** Removing the `checkCarriers()` call and regenerating →
  `f-992bc91-network-carrier-registry-stale is a current closure defect with no falsifier and no declared debt.`
- **Causal ancestors verified at the commits themselves**, not from prose: `3bea0e6` created the null carrier
  legitimately while row 4 was open; `992bc91` selected row 4 and left it; `745e332` introduced "definite
  refusal" (3 occurrences at that SHA).
- **`RC-4`'s authority argument survives.** `K_accept` signing the refusal is right: a compromised `K_accept` can
  already forge acceptance heads, so refusal adds no reachable power, and a separate refusal key would create an
  authority that can force a re-mint without being able to accept.
- **`RC-4A`'s dropped attempt cap was correctly dropped.** I re-derived it: every successor at a position
  competes for the one digest that position will ever accept, so row 5's rule already admits one winner. The
  mutation removing the slot does change no result.

---

## 3. What I ran

Baseline, from the worktree root, before any mutation:

```
pnpm vectors:check    exit=0   190 AAD fields, each isolated by a published negative
pnpm retention:check  exit=0   12 months across 6 anchors; §14.7's 5 states and 6 classes match
pnpm status:check     exit=0   17 selected / 4 unselected rows, disjoint
pnpm limit:check      exit=0   0.0476 µs/byte; budget exhausted at 19.6 kB; §12's 4 rows agree
pnpm trace:check      exit=0   85 claims, 27 of 28 current defects falsified, 2 declared owed
pnpm wasm:verify      exit=0   15 checks
pnpm test             exit=0   36 files, 371 tests
pnpm review:check     exit=0   work: 16 complete; findings: 37 validated
pnpm wasm:stale       exit=0   generated module matches the crate (6465 B)
pnpm typecheck        exit=0
pnpm lint             exit=1   pre-existing warnings (prefer-readonly-parameter-types)
pnpm format           exit=1   58 files — see D-12
```

Re-run after every mutation was restored: identical. `git status --short` shows only the pre-existing untracked
`.install.log`.

Mutation harness: `scratchpad/mutate.mjs` — snapshot every touched file (and any file named in `preserve`) into a
`Map` before patching, run the command, write the originals back in a `finally`. Specs are JSON; each is named
below. Reproduce with `node scratchpad/mutate.mjs scratchpad/<spec>.json`.

| # | spec | mutation | result |
| --- | --- | --- | --- |
| MUT-1 | `m1.json` | `network-envelope` back to the tip's nulls | ✓ refused, right diagnosis |
| MUT-2 | `m2.json`, `m2b.json` | delete all three `network-envelope` acceptance rows, regenerate | ✗ every gate green — **D-9** |
| MUT-3 | `m3.json` | delete `\| 'outbound'` and its paragraph from TRD §6.1 | ✗ every gate green, 371 tests pass |
| ISO-1..3 | `iso_{workspace,posdig,sigver}.json` | drop each guard in the antireplay `decide` | ✓ each rescued exactly its own negative |
| ISO-4..7 | `only_{ws,cred,pos,dig}.json` | keep one half of each subject check | ✗ `only_cred` green — **D-11** |
| DEAD | `deadhead.json` | gut the generator's `decide` head branch | ✗ every check green — **D-8** |
| OS-1..11 | `os_*.json` | 11 mutations of `outboundSpool.test.ts` | 10 caught; `os_d-head-position` survives — **D-8** |
| ELIDE-1..8 | `elide_*.json`, `elide_ws_full.json` | elide each `CertifiedSet` field, regenerate | 3 caught, 5 green — **D-2** |
| APPROVER | `approver.json` | let the presenter supply the approval's verification key | ✗ negative stops failing — **D-1** |
| RE-1 | `reintro_a073574.json` | strip `recovery_state_digest` from the transcript | ✓ refused |
| RE-2 | `reintro_c611666.json`, `intruder_wrap.json` | rotator reads the roster / wraps to the intruder | ✓ refused both ways |
| SWAP | `swap.json` | swap what two `aad-only-intent-*` negatives test | ✗ every check green — **D-10** |
| GUARD | `guard_gone.json` | remove the `checkCarriers()` call, regenerate | ✓ `trace:check` catches it |

Read-only verification at the pinned tip: `git show 9edd930:scripts/generate-suite-vectors.mjs`,
`…:scripts/generate-transition-vectors.mjs`, `…:scripts/generate-enrollment-vectors.mjs`,
`…:scripts/generate-envelope-vectors.mjs`, `…:docs/TRD.md`; plus `git show c611666:docs/TRD.md`,
`git show a073574:docs/selections/row-11-enrollment-ceremony.md`,
`git show 3bea0e6:scripts/generate-suite-vectors.mjs`, `git show 992bc91:…`, `git show 745e332:…`.
No branch, worktree, reflog or commit later than `5923f51` was consulted.

---

## 4. What I could not check, and why

- **Whether any of this is implemented correctly.** There is no production protocol code: `src/` contains the
  CRDT editor, and the only match for `envelope|epoch|credential` outside `src/crdt/sync.ts`'s relay-token
  comment is `src/lib/date.ts`. Every artifact in this cluster is a document, a generator, a vector, or an
  executable model that defines its own subject in the same file. That is correct for Stage 0, and it bounds
  every ✓ above to *the design is self-consistent*, never *the system behaves this way*. D-8 is what that bound
  looks like when it bites: two models of one rule, disagreeing, both green.
- **Whether D-1's attack is reachable end to end.** I established that no client-authenticated binding from a
  credential to a signing key exists, and that the generator resolves the approver's key from a constant. Whether
  a future §13.5 epoch schema would supply that key in a forgeable way is a design question `S0-2` has not
  answered either way — which is the point, but it means I am reporting a missing binding rather than a
  demonstrated break.
- **Whether reformatting row 3 or row 6 breaks the §15.1 register parser.** `HANDOFF` forbids `format:fix` and I
  obeyed it, so D-12 reports the count and the false *"unrelated to any repair"* claim, not the consequence.
- **`checkpoint` and `package`'s converse-check gaps (D-10).** Measured and reported because the numbers fell out
  of the same probe; they belong to the storage and continuity clusters, and I did not attack them.
- **`pnpm test:geometry`** (Playwright) — not run; no browser session, and nothing in either root cause reaches it.
- **The two declared debts** (`f-bd87655`'s dated table, `f-66a7c6a`'s append burst) are outside this cluster and
  I did not examine them.

---

## 5. What this means for the program

`S0-9`'s rollback rule is *"a failed challenge returns to the earliest affected decision, not a superficial
vector patch."* On that rule:

- **D-1 returns to `P-1`.** The decision's `CertifiedRecipientSet` carrier is under-specified in a way that a
  vector cannot repair: `members_digest` needs the approver's verification key, or the record needs an eligibility
  predicate resolvable from client-authenticated state. `P-1`'s own rollback clause — *"Reconsider before any
  epoch or certified-set byte format is declared selected"* — is the applicable one, and the format is now in TRD
  §13.5. This is the one item I would not let `S0-10` close over.
- **D-5 and D-6 return to `S0-4` Stage A**, not to `P-1` — the schemas are wrong, the decision is not.
- **D-2, D-9 and D-10 are oracle defects**, repairable inside the existing actions: register the `CertifiedSet`
  with `check-aad-coverage.mjs`, require an acceptance row per carrier, and make the converse check compare the
  field to the negative's name and receive every generator's full `must_fail` list.
- **D-3, D-4, D-8, D-11 and D-12 are owed evidence or owed prose** at their existing actions.

The count `27 of 28 current defects falsified` is accurate as `trace:check` defines it and, as that file says
of itself, it *"does not prove that a falsifier isolates."* This challenge found that for two high-severity
findings the credited falsifier proves materially less than its published `why` claims (D-1), and that the one
oracle the program offers for isolation does not see the object those findings turn on (D-2).
