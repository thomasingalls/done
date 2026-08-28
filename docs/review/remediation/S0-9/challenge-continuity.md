# `S0-9` — independent challenge, CONTINUITY cluster

**Standing:** record — speaks of `5923f510fd9ac3c1cd809e9bec352a7f73751492`, the challenged tip; pinned in
`census.json`, so edits land only as dated addenda under a re-pin.

**Challenger:** independent of every repair in this cluster; authored none of `S0-2`, `S0-6` or `S0-7`.
**Subject:** detached checkout at `5923f51`. No later commit, branch, worktree or reflog was consulted.
**Reviewed tip:** `9edd930`, read directly with `git show` for the survival axis.
**Cluster:** `RC-2` (6 findings) · `RC-6` (4 findings) · `RC-7` (1 finding).

**Baseline, established before any mutation and re-established after the last one:** all nine gates pass,
371 tests over 36 files, 190 AAD fields isolated, 85 traceability claims over 27 of 28 defects. The worktree
is clean; `git diff` against `5923f51` is empty.

---

## 1. Verdict table

| | Survival at tip | Causal ancestor | Local theorems | Simpler repair | Actor authority | Crash / retry / concurrency | Named adversarial |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`RC-2`** | ✓ three lanes verified at `9edd930` by reading it | ✓ the three lanes are genuinely independent; the composition label is honest | ✓ nothing that held was weakened; the checkpoint predicate is strictly stronger | ✗ **C-1** a document check would be simpler *and* stronger than the lambda that shipped | ✓ nothing found; `P-2`'s credential-replacement authority is sound | ✗ **C-2, C-3** the rollback claim is a tautology; step 4's whole effect is dead state | ✗ **C-4** `P-2`'s requirement 9 is unmodelled, and the model violates it |
| **`RC-6`** | ✓ `rootCommitment`/`TerminalHandoff` absent at the tip; row 10's false claim present verbatim | ✓ two distinct roots, correctly refused a single ancestor | ✓ | ✗ **C-5** the archive needed the paired negative the account package already had — same file, ~8 lines | ✗ **C-6** receiver binding unenforced; absences are a count; class 6 missing from the gate | ✓ per-class ledger and idempotency properly modelled and mutation-tested | ✗ **C-5** the fresh mint is built for the account package and never for the archive |
| **`RC-7`** | ✓ three kinds only, no §14.7, no carrier at the tip | ✓ single ancestor, correctly identified | ✗ **C-7** `S0-6`'s "only a durable handoff authorizes a class" stops holding once §14.7's inherited clock is composed with it | ✓ scope exceeded the finding, but the §14.4/§16.6 contradiction genuinely forced it | ✗ **C-7** the entitlement signer alone starts the clock that later nullifies the retirement gate | ✗ **C-7, C-8** retire-after-elapsed-lapse is an order no test runs | ✗ **C-8** the compromise test proves the deadline cannot be *shortened*; it can be *lengthened* without bound |

**Seven ✗ findings, ordered by what I think they cost.** `C-7` is the one I would not ship past.

---

## 2. Every ✗ and every doubt, in detail

### `C-7` — the retirement handoff gate is inert whenever an inherited lapse deadline has already elapsed

**Severity: this reopens `f-4259822-retirement-safe-survivor-gate-undefined` (high) at the repaired tip.**

TRD §14.4: *"**Only a durable handoff authorizes a hosted deletion class**, one class at a time."*
TRD §14.7: *"Lapse-then-retire: the class set widens to include class 6 and the gate becomes the handoff,
while `stopped_at` and `deadline` do not move, **because it is the same stop**."*
TRD §14.7 again: *"**For a retirement the ceiling is a backstop and not a target** … the ceiling binds only
the case where no survivor ever appears."*

Compose them. A lapse at `t=10` sets `deadline = 10 + RETENTION`. §14.7 explicitly permits the deadline to
elapse with **no destructive progress** — *"between the deadline and the first destructive act every byte is
still present, and a resume still restores all of it."* Now the owner retires the workspace at
`deadline + 1`. `stop()` sees `stoppedAt !== null` and does not move the clock, so the retirement is born
with its ceiling already in the past. In `deleteClass`, `past` is therefore true for every class from the
first instant, and the guard

```
if (w.cause === 'retirement' && !past && !w.handoffs.has(cls)) return { ok: false, refused: 'no-handoff' };
```

never fires. The catch-up window §14.4 requires has length **zero**.

**Reproduction** (probe built from the shipped model verbatim — the file's own `lapsed`, `retire`,
`deleteClass`, `deadlineOf`, `CLASSES`, copied above the first `// falsifies:` marker):

```
hosted classes, at the instant the user clicked delete:
  primary          DELETED with no receipt
  replicas         DELETED with no receipt
  checkpoints      DELETED with no receipt
  wraps            DELETED with no receipt
  backups          DELETED with no receipt
  recovery-anchor  DELETED with no receipt
present after : []
```

Every hosted byte, including the recovery anchor, destroyed with `handoffs.size === 0`.

**Why this is a design defect and not only a model defect.** The model is *faithful* to §14.7 here. It
reproduces the hole rather than inventing one. And note that §14.4's own sentence points the other way —
*"Retirement stops hosted synchronization, which starts the one clock"* — which reads as the retirement
starting its own clock. §14.7 overrode that with *"it is the same stop"* and did not work the case where the
inherited clock has already run out.

**Actor authority.** The lapse is reachable by the entitlement signer **alone**: §14.7's own compromise
paragraph grants it `grace` and `stopped` and correctly denies it terminal lineage. But the composed attack
does not need terminal lineage from the attacker — it needs the *owner* to retire, twelve months into a
read-only workspace the attacker created. The attacker supplies the state; the victim supplies the intent.
§14.7's bound — *"the attack is a long, loud read-only state ending in the deletion §15 row 16 already
promises"* — does not mention that it also disarms §14.4's gate.

**`traceability.md` credits two artifacts with this finding and they disagree with each other.**
`scripts/generate-package-vectors.mjs`'s `authorizeDeletion(klass, handoff, sig, verifierKey)` **takes no
time argument at all** — no handoff, no deletion, unconditionally. `test/hostedRetention.test.ts`'s
`deleteClass(w, cls, now)` adds the `past` bypass. Both name `f-4259822-retirement-safe-survivor-gate-undefined`.
Neither observes the other, so the negative `deletion-without-a-handoff` refuses happily while the composed
machine deletes.

**Suggested direction, not a patch:** the ceiling for a retirement should be
`max(inherited deadline, retired_at + a stated catch-up floor)`. That keeps "one clock" for the lapse and
restores a non-zero window for the gate. `S0-7`'s own README already flags the duration as open and asks
`S0-9` to challenge it — this is the sharper version of that question: not *how long*, but *whether it can
be zero*.

---

### `C-6` — three defects in the deletion gate, one of them already drifted in the tree

**(a) `DELETION_CLASSES` is a second copy of §14.7's list and it disagrees with it — five classes, not six.**

`scripts/generate-package-vectors.mjs:433`

```js
const DELETION_CLASSES = ['primary', 'replicas', 'wraps', 'checkpoints', 'backups'];
```

TRD §14.7's table has **six**; `recovery-anchor` is missing. §14.4 warns against exactly this in the
sentence that defines the list: *"**The classes are §14.7's**, and retirement is the cause that reaches all
six — a second copy of that list here is a thing that could disagree with it."*

Consequence: `authorizeDeletion('recovery-anchor', …)` throws `unknown deletion class recovery-anchor`. The
gate cannot authorize the **one class that distinguishes retirement from expiry** — the class the entire
`expiry keeps / retire deletes` distinction exists for. `S0-6`'s README says *"The deletion gate is checked
at all five classes"*; that is five of six.

**No gate sees it.** `check-retention.mjs` cross-checks §14.7's table against `test/hostedRetention.test.ts`
only. I confirmed both directions:

```
positive control — drift the MODEL's list:
  TRD §14.7 and the executable model disagree on the deletion classes: document-only [recovery-anchor].
the third copy — set generate-package-vectors.mjs to ['primary', 'totally-invented-class']:
  retention:check  →  PASS
  vectors:check    →  PASS   ("every negative still fails")
  trace:check      →  PASS
```

This is `f-992bc91-network-carrier-registry-stale`'s exact shape at a new object, inside the cluster whose
own README quotes that finding as the thing to avoid.

**(b) `known absences` is a count, and a count is a summary.** §14.4 requires *"exact known absences
**enumerated rather than summarised**"*, and the negative's own `why` says *"'Some updates could not be
recovered' is not a known-absence list."* The construction models absences as an integer and refuses only
the sentinel `-1`:

```
PROBE B: a handoff saying "47 things are missing", naming none, was ACCEPTED
```

`caughtUp` is itself accepted with `knownAbsences: 2` and no list. The negative
`handoff-with-unenumerated-absences` refuses a negative number; nothing refuses a summary.

**(c) The receiver binding is not enforced — the negative refuses for a second reason.**

```js
const authorizeDeletion = async (klass, handoff, sig, verifierKey = KEYS.laptop.public_key) => { … }
```

`verifierKey` is a **defaulted parameter**, never resolved from `handoff.receiver`. So:

```
PROBE C: a handoff NAMING the laptop but SIGNED BY the service was ACCEPTED
```

`handoff-signed-by-a-non-receiver` refuses because the caller happened to pass the laptop's key, not because
`receiver` binds anything. Its `why` claims *"The receiver is named in the message, so a service that can
assemble the package cannot also sign for having received it"* — the message does name the receiver, and
nothing resolves the verifier from it. An implementation that verified under `assembled_by` satisfies every
published negative.

---

### `C-5` — the archive got the commitment but not the attack, and its negative does not isolate

`f-745e332-local-archive-portable-wrap-undefined` (high) and the archive-side reach of
`f-745e332-package-root-rewrap-substitution` (high).

**The construction is right.** The shipped `restoreArchive` refuses an attacker's freshly minted archive:

```
[probe] attacker archive under a forged root OPENED under the genuine code: attacker-chosen key recovered
[probe] SHIPPED restorer refused it: archive root commitment does not match the manifest
```

The first line is the point: HPKE base mode is anonymous, `ARCHIVE_PUB` travels in the archive file, so an
attacker seals **their own** generation key to the **genuine** archive identity with `info` naming a root
they minted. The user's genuine code opens it. Only the code-sealed commitment separates it from a real
archive — exactly as `S0-6` argued for the account package.

**The evidence does not prove it.** Delete the commitment check entirely:

```js
// removed from restoreArchive:
if ((await rootCommitment(manifest)) !== sealedCommitment) {
  throw new Error('archive root commitment does not match the manifest');
}
```

→ `package.json is current, and every negative still fails.` **Green.**

The reason, instrumented:

```
[probe] commitment MISMATCHED but the check is disabled; continuing to the wrap
[probe] with the commitment check OFF it still refused, from: OperationError
```

`archive-root-commitment-mismatch` mutates `authRoot`, which `wrapInfo` also binds, so the AEAD open fails
whether or not the commitment was ever consulted. **This is the fails-twice-isolates-nothing shape**, on a
high-severity finding, in the file whose README documents having fixed that shape twice elsewhere:
*"Two of the four archive failures had to be made separable … Those two now carry an envelope sealed for the
mutated manifest, so the commitment agrees and the refusal is the wrap's alone."* The `sealedFor` device was
applied to `archive-wrap-from-another-workspace` and `archive-wrap-of-another-generation`. The **inverse**
was never applied to the commitment negative, which needs the *wrap* to agree so the refusal is the
commitment's alone.

**Simpler repair, and it is strictly stronger than what shipped.** The account package already has the
pattern: build the attacker's object end to end, assert it round-trips under the genuine private key, then
assert the importer refuses. Lines 798–856 do exactly this and **do** isolate — `unwrap` is asserted to
succeed, so only the commitment can throw. Porting those eight lines to the archive block would have closed
this. A fifth negative was added instead.

**By contrast, the account-package path holds under challenge.** Reintroducing the defect the finding
describes — dropping `authRoot` from `rootCommitment` — is caught with the right diagnosis:

```
Error: Negative vector "freshly-minted-package-under-an-attacker-root" succeeded when it must not.
```

---

### `C-2` — `test/generationApply.test.ts`'s rollback claim is a tautology

```js
const rollback = (_w: World): World => initial();
```

`rollback` discards its argument. The test that consumes it therefore asserts `initial().x === initial().x`
three times:

```js
const rolled = rollback(killAfter(k));
expect(rolled.activeGen).toBe(initial().activeGen);
expect(rolled.openers.has(initial().activeGen)).toBe(true);
expect(rolled.journal).toEqual(initial().journal);
```

**Reproduction.** I made steps 1–4 — the ones the file calls reversible — destroy everything they touch:
step 1 wipes `journal`, `batch` and `outbound`; step 2 sets `activeGen: 99` and drops every opener; step 3
deletes all checkpoints; step 4 empties the opener set. Then:

```
$ npx vitest run test/generationApply.test.ts -t 'rolls back cleanly'
✓ rolls back cleanly from any pre-commit step
Tests  1 passed | 7 skipped (8)
```

The other assertions in the file do catch that mutation (5 of 8 fail), so the battery is not worthless — but
the specific claim *"steps 1–4 are reversible"*, which is `COMMIT_POINT`'s entire justification, is proven by
nothing. §13.7 states it normatively: *"Steps 1–4 are reversible; step 5 is not."*

---

### `C-3` — step 4 is dead state: the coverage step can be deleted and all eight assertions pass

Step 4 is §13.7's *"permissible local work covered under `g+1`"* — the step that exists to stop precisely
the data loss `f-4259822-generation-switch-local-durability-undefined` is about. Its entire effect is
`coveredUnder: targetGen`, and `coveredUnder` is **written by step 4 and read by nothing**: it appears at
lines 57 (declared), 68 (initialised) and 91 (assigned), and at no other line in the file.

**Reproduction:**

```js
case 4:
-  return { ...w, coveredUnder: targetGen, apply: rec(4) };
+  return { ...w, apply: rec(4) };
```

```
Tests  8 passed (8)
```

**Related fidelity gaps in the same file**, which is why `C-3` matters more than a stray field:

- §13.7's step 6 is *"successor checkpoint admitted **and local content trimmed**."* The model's step 6
  admits a checkpoint and **never trims**. So the file's most load-bearing assertion — *"loses no old
  journal, batch or unresolved outbound work at any kill point"* — is checked against a machine from which
  the one destructive operation has been removed. No modelled step writes to `journal`, `batch` or
  `outbound` at all.
- §13.7's step 3 is *"old-generation objects classified."* The model's step 3 is a no-op. Classification is
  what would produce the reference ledger `C-4` is about.
- `resume()` starts at `record.step + 1`, and `applyStep` updates the effect and the record in one
  expression. So a crash *inside* a step is unrepresentable, and step 6 can never actually replay. The
  double-prepend bug `S0-2`'s README reports finding is therefore unreachable through `resume`; only the
  synthetic `applyStep(w, k)` idempotence probe touches it.

---

### `C-4` — the drop gate consults one of the eight reference classes §13.7 names

```js
const mayDropGeneration = (gen, checkpoints) => !checkpoints.some((c) => c.gen === gen);
```

TRD §13.7: *"a reference ledger over **journals, batches, outbound envelopes, accepted marks, checkpoints,
suffixes, packages and wraps** is what the drop consults."*
`P-2` requirement 9: *"No opener is deleted while any journal, outbound envelope, retained checkpoint/suffix,
package, or pending transition still references it."*
The finding itself: *"An already-minted `g` envelope whose acceptance reply is outstanding must remain exact
until acceptance or an authenticated refusal."*

The `World` carries `journal`, `batch` and `outbound` — as **untagged strings**, so the model cannot express
"under generation g" and the predicate cannot consult them.

**Reproduction.** I re-ran the model verbatim with one change: each carrier says which generation seals it
(`j0` a gen-3 delta still unflushed, `e31` a gen-3 envelope still unresolved — both states the finding names
explicitly), then asked whether any retained carrier is left without an opener.

```
openers after settle : [ 4, 5 ]
generations still referenced by a retained carrier : [ 3, 4, 5 ]
ORPHANED (referenced, no opener) : [ 3 ]
```

The shipped fixture hides this because every carrier is an untagged string and generation 4 happens to stay
alive through a checkpoint.

**Worth recording:** `scripts/generate-checkpoint-vectors.mjs` has a **better** version of this same
predicate — `mayRetireOpener(gen, opener, retained, openers)` correctly distinguishes *dropping a generation*
from *removing one opener*, and both of its mutations are caught with precise diagnoses (`M5`, `M6` below).
Two artifacts in one cluster model the same rule at two different strengths, and the weaker one is the
single falsifier for the finding.

---

### `C-1` — a documentation-loss finding whose falsifier cannot see the document

`f-dbfd01f-device-lock-rotation-caveat-lost` is, in its own words, the record of the `rotation_owed` caveat
*"having been dropped from normative copy."* Its **single** falsifier is `the rotation_owed derivation` in
`scripts/generate-device-lock-vectors.mjs`:

```js
const rotationOwedAt = (step) => step < 8;
for (const step of [1, 2, 3, 4, 5, 6, 7, 8]) {
  if (rotationOwedAt(step) !== step < 8) throw new Error('rotation_owed is not derived.');
}
if (!rotationOwedAt(5)) throw new Error('rotation_owed cleared at the commit point rather than at settlement.');
if (rotationOwedAt(8)) throw new Error('rotation_owed never clears.');
```

**Test the falsifier against its own defect.** `rotation_owed` occurs exactly once in the TRD (line 2390).
I deleted that sentence and replaced it with copy asserting the opposite — *"the swap completes the lock and
the device is protected from copies from that moment"*, which is the false claim the finding exists about:

```
rotation_owed in TRD: 0
vectors:check   exit=0
retention:check exit=0
status:check    exit=0
limit:check     exit=0
trace:check     exit=0
```

**Every gate green with the caveat deleted.** The falsifier has no path to the document.

**What the guard does test, and its two dead diagnoses.** The loop compares a lambda against a literal
restatement of itself written two lines below its definition. It does catch a mutation of the lambda — I
tried `step < 5`, `false` and `true` — but all three produce the *same* message, `rotation_owed is not
derived.`, because the loop subsumes the two checks beneath it. `'rotation_owed cleared at the commit point
rather than at settlement.'` and `'rotation_owed never clears.'` are **unreachable**: for either to fire the
loop must first have passed, and the loop passing pins the lambda at every step. The falsifier fires; it
never fires with the diagnosis it claims.

**Simpler and strictly stronger repair.** This repository already has four document-to-artifact checkers.
`retention:check` reads §14.7 and compares it to an executable model; `status:check` reads the PRD against
§15. The finding is *the TRD lost a sentence*, so the falsifier that matches it is an anchor check over
§13.3/§13.7 — the same machinery, a few lines, and it would have caught the deletion above.

**Same shape, lower stakes:** `the post-lock wrap set` guard for
`f-f5def83-device-lock-reader-key-bypass` reads a hardcoded object literal defined four lines above it:

```js
const wrapsByGeneration = {
  [GEN]: { [W_PUB_PRELOCK]: 'wrapped before the lock' },
  [SUCCESSOR_GEN]: { [W_PUB_REPLACEMENT]: 'wrapped after it' },
};
```

The values are English strings; nothing derives the set from a certified set or a rotation payload. That
finding survives because its **other three** falsifiers are real cryptographic negatives over `LockSeal`.
`f-dbfd01f` has no other falsifier, which is why it is a ✗ and this is a doubt.

---

### `C-8` — the retention ceiling is extendable without bound by the entitlement signer

`test/hostedRetention.test.ts`'s adversary section asserts the compromised signer *"cannot reach the lineage,
the anchor, or the deadline"* and demonstrates that a backdated `effective_at` cannot **shorten** the
deadline. Lengthening is never tested. `resume()` clears `stoppedAt` and `deadline`; a fresh `sync-stops`
then starts a new clock from `now`:

```
final deadline after 5 stop/restore cycles : 5100  (first cycle was 1100)
```

The direction is safe for the user's data and wrong for the retention promise: §16.6 *"calls an unbounded
retention a defect rather than an omission, because there is no deletion event in at least twelve months,"*
and §14.7's compromise bound says the attack is *"a long, loud read-only state **ending in the deletion §15
row 16 already promises**."* Under ping-pong that deletion never arrives. I grade this a real gap in the
adversarial axis rather than an exploit: the same behaviour is correct for a genuinely flapping subscription,
and §14.7 explicitly selects *"a workspace that lapses again gets a new and strictly later clock."* What is
wrong is the claim that the deadline is out of the attacker's reach.

---

## 3. Cross-cluster compositions I tested

| Pair of rules | Objects they both bind | Orders tried | Result |
| --- | --- | --- | --- |
| §14.4 *"only a durable handoff authorizes a class"* × §14.7 *"stopped_at and deadline do not move, it is the same stop"* | the hosted deletion classes | lapse→retire (elapsed clock), lapse→retire (live clock), retire→lapse, expiry→retire | ✗ **`C-7`** — deletes all six with no receipt when the inherited clock has elapsed |
| `authorizeDeletion` (S0-6, no time input) × `deleteClass` (S0-7, `past` bypass) | the same gate, both credited with the same high finding | n/a — static | ✗ **`C-7`** — the two artifacts state different gates and neither observes the other |
| §14.7's six classes × `DELETION_CLASSES`'s five × the model's `CLASSES` | the class list, three copies | drift each copy, run all gates | ✗ **`C-6a`** — the checker compares two of the three; the third is already drifted |
| §13.7's reference ledger × §14.7 class 4 (`wraps`) deleted at expiry | the opener for generation `g` | expiry→drop, drop→expiry | ✗ **`C-4`** — the ledger consults only checkpoints, so neither order is decided |
| §13.7 step 7's `mayDropGeneration` × row 7's `mayRetireOpener` | the same predicate, two files | static comparison | ✗ **`C-4`** — modelled at two different strengths; the weaker one carries the finding |
| §14.7 retirement race × §13.5 lineage axis | `lineage` vs `state` vocabularies | retire→entitlement, entitlement→retire, restore after retire | ✓ **holds** — `terminal-lineage` refuses in both orders, vocabularies stay disjoint, `check-retention.mjs` enforces it |
| §14.7 resume × the deletion ledger | `ledger` after a partial run | delete→resume→lapse again | ✓ **holds** — the ledger reset is real, and its absence was a model bug the author found and turned into a test |
| §13.8 replacement payload × §13.7 successor generation | `successor-generation` in the signed digest | field-elision battery | ✓ **holds** — see `M9`–`M11` |

---

## 4. What I ran

**Baseline and final, identical results both times:**

```
pnpm vectors:check   PASS   190 AAD fields, each isolated by a published negative
pnpm retention:check PASS   6 anchors; §14.7's 5 states and 6 classes match the model
pnpm status:check    PASS   17 selected / 4 unselected, disjoint
pnpm limit:check     PASS   0.0476 µs/byte, budget exhausted at 19.6 kB
pnpm trace:check     PASS   85 claims, 27 of 28 defects falsified, 2 declared owed
pnpm wasm:verify     PASS   15 checks
pnpm wasm:stale      PASS   6465 B, reproduces from the crate
pnpm review:check    PASS   37 validated findings
pnpm test            PASS   371 passed (371), 36 files
```

`pnpm check` was **not** run whole: the `HANDOFF` records that `pnpm format` and `pnpm lint` fail at the
pinned tip on files unrelated to any repair, so it has never passed on this branch or its base. I ran the
nine gates individually instead, which is the same reachable closure minus those two.

**Survival at tip** — read directly from `9edd930`, never from a finding's prose:

```
git show 9edd930:docs/TRD.md              | grep -c GenerationApply        → 0
git show 9edd930:docs/TRD.md              | grep -c TerminalHandoff        → 0
git show 9edd930:docs/TRD.md              | grep -c '^### 14.7'            → 0
git show 9edd930:docs/TRD.md              | grep -c rotation_owed          → 0   (row 13 has 5)
git show 9edd930:scripts/generate-package-vectors.mjs | grep -c rootCommitment → 0
git show 9edd930:docs/selections/row-7-checkpoint.md:53
  "Never drop a checkpoint whose generation any retained checkpoint still needs."   ← the inverted subject, verbatim
git show 9edd930:docs/selections/row-10-portable-package.md:57
  "A substituted root derives a different key schedule, so the wrap…"               ← the claim S0-6 says has to go
```

**Mutation battery.** Every mutation was applied by an in-place `python3` string replace and restored from a
copy held in `…/scratchpad/backup/`. **`git checkout --` was never used**, per the `HANDOFF` hazard.

| # | Mutation | Expected | Result |
| --- | --- | --- | --- |
| M1 | `generationApply` steps 1–4 destroy journal/batch/outbound/openers/checkpoints and advance `activeGen` | rollback test fails | ✗ **passes** — `C-2` |
| M2 | step 4 drops `coveredUnder` | something fails | ✗ **8/8 pass** — `C-3` |
| M3 | `mayDropGeneration` → `true` | fails, named | ✓ `checkpoint under generation 4: expected false to be true` |
| M4 | `rootCommitment` drops `authRoot` | fresh-mint negative stops refusing | ✓ `Negative vector "freshly-minted-package-under-an-attacker-root" succeeded when it must not.` |
| M5 | checkpoint `mayDropGeneration` → `true` | fails, named | ✓ `Generation 4 was droppable while the second-newest checkpoint is sealed under it…` |
| M6 | checkpoint `mayRetireOpener` ignores the opener set | fails, named | ✓ `A surviving recovery wrap did not count as an opener.` |
| M7 | `rotationOwedAt` → `step < 5` / `false` / `true` | three distinct diagnoses | ~ all three fire, all three say `rotation_owed is not derived.` — `C-1` |
| M8 | delete the `rotation_owed` sentence from TRD §13.3 | some gate fails | ✗ **all five gates pass** — `C-1` |
| M9 | drop `successor-generation` from the replacement payload | fails, named | ✓ `A replacement differing in the-successor-generation produced the selected payload digest.` |
| M10 | drop the exact recovery-envelope bytes | fails, named | ✓ `…differing in one-byte-of-the-sealed-envelope…` |
| M11 | wraps carry generation numbers only (the superseded construction) | fails, named | ✓ `…differing in one-generations-wrap…` |
| M12 | archive envelope AAD stops binding `archive_pub` | a negative stops failing | ✓ `Negative vector "archive-envelope-repaired-with-another-identity" succeeded when it must not.` |
| M13 | delete the archive root-commitment check entirely | some negative stops failing | ✗ **`package.json is current, and every negative still fails`** — `C-5` |
| M14 | `DELETION_CLASSES` → `['primary','totally-invented-class']` | some gate fails | ✗ **retention/vectors/trace all pass** — `C-6a` |
| M15 | model `CLASSES` renames `recovery-anchor` (positive control) | `retention:check` fails | ✓ `document-only [recovery-anchor]. One of them describes a machine that does not exist.` |

**Probes** (executable, written under `test/__s09probe_*.test.ts`, run, then deleted — the worktree is clean):

- `probe_ledger` — the shipped `generationApply` model verbatim with generation-tagged carriers → `ORPHANED: [3]`.
- `probe_retention` A/B/C — the shipped retention model verbatim, three composed orders → all three fail.
- `probe B-strong` — six classes deleted with zero receipts.
- in-generator probes for `authorizeDeletion` (class 6, summarised absences, receiver binding) and for the
  archive fresh mint.

---

## 5. What I could not check, and why

- **`pnpm check` as a single command.** It fails at the pinned tip on `format` and `lint` for reasons
  predating every repair. I ran the nine gates individually. I did **not** run `pnpm format:fix` at any point.
- **`pnpm test:geometry` / `test:latency`.** Playwright; not attempted, and outside this cluster.
- **Whether the real implementations behave as modelled.** Both `test/generationApply.test.ts` and
  `test/hostedRetention.test.ts` say so themselves, and it is `L-1`/`L-2`/`L-3` work. `C-2`, `C-3`, `C-4` and
  `C-7` are all defects *within* the models' own terms, so this limit does not soften them — but a reader
  should not read `C-7` as a claim about shipped deletion code, because there is none.
- **`f-4259822-recovery-replacement-no-forward-rotation`'s substantive half.** The guard's own comment says
  the binding is falsified here and *"that the exposed code then **opens nothing** is a runtime property …
  and belongs to `L-2`."* I confirmed the binding half holds (M9) and did not attempt the runtime half,
  which has no artifact to attack. This is disclosed in `traceability.md` and the `HANDOFF`; I record it as
  honest rather than as a gap.
- **The `RC-2`/`RC-6` "composition" framing.** I probed it for a hidden single ancestor and did not find
  one — the three `RC-2` lanes diverge at three different commits (`f5def83`, `b997cdb`, `4259822`) and the
  two `RC-6` lanes at two (`745e332`, `4259822`), all verified present at the tip. I am reporting ✓ on that
  axis, but "I looked and found nothing" is weaker evidence than the ✗ rows above.

---

## 6. What held

Said plainly, because a challenge that only reports failures is not calibrated:

- **The account-package root commitment is genuinely repaired and genuinely isolated.** The fresh-mint attack
  is built end to end, asserted to round-trip under the real recovery key, and the negatives can only refuse
  for the commitment because the unwrap succeeds. Reintroducing the defect (M4) is caught. This is the best
  falsifier in the cluster and it is the answer to the highest-severity finding in it.
- **The ordering negative is real.** `attacker-root-refused-before-any-unwrap` uses an unwrap that *succeeds*
  and asserts it never ran. That is the correct construction, and it is the third instance of a mistake this
  project keeps catching.
- **The checkpoint opener predicate is right, and stronger than it had to be.** It separates dropping a
  generation from retiring one opener, and both mutations produce the diagnosis written for them.
- **The replacement payload binding is complete.** Every named part is inside the digest; three separate
  reintroductions are caught by name.
- **The retirement/lapse race is correct in both orders**, by the single rule §14.7 states, and
  `check-retention.mjs` enforces the vocabulary disjointness that the whole of `RC-7` is about. The
  positive control (M15) shows that checker works.
- **The archive's identity binding is real.** `S0-6`'s README reports that a mutation found `archive_pub`
  missing from the envelope's AAD and that the negative was added because of it. I reproduced that mutation
  (M12) and the negative caught it by name. Four of the five archive negatives are sound; only the
  commitment one fails to isolate (`C-5`).
- **`S0-7`'s two "model bugs first" tests are real bugs and real tests** — the widened class set after an
  expiry, and the ledger reset across a resume. I tried to break both and could not.
