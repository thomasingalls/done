# `S0-9` — challenge of the repaired constructions (author's pass)

> **Superseded in part by [`DISPOSITION.md`](./DISPOSITION.md).** Four independent challengers, none of whom
> authored any repair, later ran from `5923f51` without access to this document. They found what this pass could
> not, and two of its conclusions are wrong: **"no challenge returned a repair to its owning action"** is false —
> two high findings and one construction defect return to `P-1`, `P-3` and `P-4` — and the origin scanner's repair
> is narrower than reported here, since `originOf` discards any URL containing `+` and so misses the archetypal
> Google Fonts link. **The six forms this pass tested were the six its author thought of**, which is the whole
> argument for independence and is why the file below is kept rather than deleted.


**Run:** 2026-08-27 · **Against:** `5923f51`, 47 commits off `9edd930` · **Inputs:** all seven actions, `S0-8`'s
[`traceability.md`](../traceability.md)

## The independence requirement is not met, and that is the first result

`S0-9`'s prerequisite reads **"challenger independent of each repair author"**, and its acceptance ends **"at
least one non-author reruns exact artifacts."** I authored every repair in this branch. **This is a self-challenge
and it cannot clear that bar.** Nothing below should be read as if it had.

What a self-challenge can still do is everything that does not depend on who is asking:

| The bar | What was done | Substitutes for independence? |
| --- | --- | --- |
| a non-author reruns exact artifacts | every gate rerun from a **fresh clone** of the committed branch with `--frozen-lockfile`, touching nothing in the author's working tree | **No.** It removes dependence on my machine's state, not on my judgement |
| challenge each `RC-*` on seven axes | done below | **Partly.** The checkable axes are checked; the judgement axes are argued by the person who made the judgement |
| falsifiers that isolate | 20 reintroduced defects, run against the finding's own falsifier | **Yes, as far as it goes** — a mutation does not care who wrote it, and one of them failed |

**The last row is why this was worth running anyway.** An author cannot audit their own reasoning, but they can
put their reasoning in front of a machine that reintroduces the defect and demands the refusal. That found a real
failure, recorded below.

**What is still owed:** a non-author rerunning [`isolation-battery.mjs`](./isolation-battery.mjs) and the gates,
and a non-author challenging the four judgement axes. `S0-10` must not record this as satisfied.

## What was challenged

### 1. Does the evidence reproduce away from the author's machine?

A fresh `git clone` of `claude/stage0-remediation`, `pnpm install --frozen-lockfile`, then every gate. **All
pass**, including the two that need a toolchain rather than a fixture:

- `pnpm wasm:verify` — 15 checks
- **`pnpm wasm:stale` — the generated module matches the crate, 6,465 B**, rebuilt from Rust source rather than
  compared to a stored copy
- 371 tests · 16/16 generators · 190 AAD fields · retention, status, limit, trace · `review:check` 37 validated

Nothing depends on the working tree it was built in.

### 2. Did any repair delete a theorem?

The strongest preservation check available: compare what was published at the reviewed tip against what is
published now.

| | at `9edd930` | now | removed |
| --- | --- | --- | --- |
| published `must_fail` negatives | 213 | 292 | **0** |
| `it(...)` titles across `test/` | 297 | 363 | **0** |

**Nothing was removed.** Every theorem the reviewed tip published still exists and still runs. That is the
answer to *preservation of local theorems* for the whole package, and it is stronger than reading the diffs,
because a rename would have shown up here as a removal and did not.

### 3. Did the defects actually exist at the tip?

Sampled across four clusters, read out of `9edd930` itself rather than from the finding text:

| Finding | What the tip actually contains |
| --- | --- |
| `f-3bea0e6-suite-separation-ignores-both-path` | `path: 'both'` at line 134 of the suite generator |
| `f-992bc91-network-carrier-registry-stale` | `suite: null` at line 195, on a carrier whose row is selected |
| `f-9b49b74-journal-seal-64k-gap` | `MAX_PLAINTEXT: usize = 65536`, and **no `MAX_UPDATE` anywhere in the TRD** |
| `f-9860a0b-journal-rotated-vector-reuses-key` | the `rotated-generation` fixture names no `kg:` and **`KG2` does not exist in the file** |
| `f-b9ff071-webauthn-cross-origin-policy` | `clientDataJSON` **hardcodes `crossOrigin: false`** — the fixture could not produce a framed ceremony to verify |

The last two are worth noting: in both cases the tip is *worse* than the finding's wording. A fixture that cannot
express the attack is a stronger statement than "the verifier does not check it."

### 4. Do the thinnest falsifiers refuse the defect they are credited with?

This is the challenge's core, and it attacks `S0-8`'s stated limit head-on. `S0-8` proves a falsifier exists,
names its finding and runs; it says plainly that it **does not prove one isolates**. So for each of the ten
current defects resting on a **single named falsifier**, the battery reintroduces the defect the finding's own
text describes and requires that one falsifier to refuse it.

```bash
node docs/review/remediation/S0-9/isolation-battery.mjs .
```

**20 of 20 caught** — after one repair. The failure is the next section.

## The one failure, and it was the finding's own defect

**`check-selection-status.mjs` did not refuse a PRD sentence calling a selected row open.** That is
`f-tip-prd-stale-selection-status` restated exactly: *current PRD subsections still call rows 5, 11 and part of
14 open while the register closes them.*

The cause is one character class:

```js
const OPEN = /\bstill open\b|\bremains open\b|\bis open\b|\bunselected\b|\bnot (?:yet )?selected\b/iu;
```

Three of the five patterns are **phrases**, and this document's house style puts `**` between the words. So:

| The claim, as it would actually be written | Seen? |
| --- | --- |
| `is open` | yes |
| `is **open**` | **no** |
| `still **open**` | **no** |
| `remains **open**` | **no** |
| `is **selected**` | yes — `\bselected\b` is one word, so the markers fall outside it |

**The check therefore worked in the settled direction and failed in the open one** — the direction the finding is
about — and every real sentence in the PRD is emphasised, so **the natural way to write the stale claim was the
one form invisible to the check written to police it.**

The repair strips emphasis before the claim is read, which deletes the class rather than adding the three
spellings someone happened to think of — the same move `S0-1` made when inverting the origin scanner's default
beat extending its list. Only runs at a word's outer edge go, so `rotation_owed` and `K_g` survive. Six spellings
are now in the battery, and all six are caught.

**This is the fourth instance of one shape in this program.** `S0-1` repaired three — `checkSeparation`'s `both`,
the origin scanner's seven literal syntaxes, the WebAuthn verifiers' field list — and `S0-8`'s re-check found a
fourth in its own scanner. This is the fifth. *A check that classifies by matching a list silently passes
whatever the list does not name*, and it keeps arriving because the list always looks complete to the person who
wrote it.

## The `RC-*` matrix

Seven axes, nine clusters. **S** = survives at tip, **A** = causal ancestor correct, **T** = local theorems
preserved, **R** = no simpler repair, **U** = actor authority sound, **C** = crash/retry/concurrency,
**X** = named adversarial scenarios.

| | S | A | T | R | U | C | X | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `RC-1` recipient authority | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | The total-loss bootstrap forbids the simpler repair: a fresh restorer has no local roster, so the eligibility fact must be a durable object |
| `RC-2` generation apply | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | The 8 steps span `localStorage`, IndexedDB and the relay, so no single transaction covers them. The model is a model — integration is `L-2`/`L-3` |
| `RC-3` write admission | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | The simplest alternative — chunking — is refused **by measurement**: it seals the same bytes on the same thread |
| `RC-4` outbound | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Simpler repair raised and answered below |
| `RC-5` checkpoint/attribution | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Attribution's repair is already the simple one: the card id **is** the certificate hash, so a rival claim makes a different card and there is nothing to adjudicate |
| `RC-6` portable root | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | No simpler repair: after total loss the user holds a code and nothing else, so the root must be sealed under it |
| `RC-7` lapse | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | The simpler repair — a fourth transition kind — is refused because **a lapse is not a request**; nobody sends it |
| `RC-8` closure/evidence | ✓ | ✓ | ✓ | **✗** | ✓ | n/a | ✓ | **The failure above.** The policy was right; one of its five checks was not |
| `RC-9` later gates | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | Governance only; nothing to simplify |

**The four judgement axes (A, R, U, X) are argued by the author.** S, T and C are checked by artifacts — §§1–4
above — and are the ones a reader should weight.

### `RC-4`'s simpler repair, raised and answered

**The challenge:** row 4 selects a **random** 12-byte nonce. A *deterministic* nonce over
`(credential, position, epoch)` would let a client re-derive the exact envelope bytes after a crash — Ed25519
signing is deterministic too — which would remove `S0-4`'s spool entirely. That is a materially simpler repair
and row 4 does not consider it.

**The answer, from the artifacts rather than from memory:** the spool stores *"the whole immutable byte string:
nonce, ciphertext, signature"*, and the ciphertext is the part that cannot be re-derived. An envelope carries a
**batch** whose membership is decided by a time-based flush window, so after a crash the same updates need not
batch the same way, and the plaintext is gone with the window. **A deterministic nonce makes the nonce
reproducible and leaves the ciphertext exactly as unreproducible as it was.** The spool's job survives the
simplification intact.

Worth recording rather than discarding: the *reason* the spool exists is the batch, not the nonce, and row 4
never says so.

## Observations that are not failures

**One of my own, retracted.** I recorded that `MAX_UPDATE` bounds an update while nothing bounds an outbound
envelope, and that no relay message limit exists anywhere — a composition gap between `S0-3` and `RC-4`. **That
is wrong.** Row 4 §4 sets a byte cap on the batch, with grounds stated (it bounds one retained object, and is not
CPU-bound because §12 budgets envelope signing at 5 ms p95 off the edit path) and explicitly as a tunable pending
measurement. The bound is there; I had not read far enough. It is recorded because a challenge that only reports
its hits is not reporting its method.

**Composition across actions was probed and held.** The one place two actions constrained the same object and
disagreed — `S0-6`'s deletion gate against row 16's retention ceiling — was found and resolved *during* `S0-7`.
Re-probing the neighbours found nothing further: the journal's narrowing to locally originated updates is stated
in §6.1 with the re-delivery that makes it safe, and the two surviving quotations of the superseded
origin-isolation claim are both inside the explanation of why it was narrowed, which is correct usage.

## What an independent challenger should do first

1. **Rerun the battery and the gates.** Neither needs my judgement, and the commands are above.
2. **Attack the four judgement axes**, starting with `R` (simpler repair) — the axis where the author is
   structurally blind, and where `RC-4` above shows the question is not always idle.
3. **Attack isolation beyond the thinnest ten.** The battery covers findings resting on one falsifier. A finding
   with six negatives can still have six that all fail for the same second reason; nothing here would see it, and
   the AAD audit only covers fields bound in an AAD.
4. **Read `traceability.md`'s claim assignments as judgements, not facts.** 53 negatives were tagged by hand on
   the rule *tag a negative only when its failure would reintroduce the finding's defect*. The weakest of those
   calls is `kind-swapped` → `f-3bea0e6-store-sequence-allocation-undefined`: it protects the record-kind
   distinction the trim depends on, which is real but indirect.

## Disposition

**No challenge returned a repair to its owning action.** The one failure was in a check's implementation, not in
a decision: `P-5`'s policy — one home per fact, checked in both directions by something that is neither end —
was correct, and `check-selection-status.mjs` did not implement it over the whole class of claims it reads.
Repaired in place, mutation-tested six ways, and no `RC-*` reopens.

**Nothing here changes a finding's `status:`.** `S0-10` reserves that.
