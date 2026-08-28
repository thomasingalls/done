# `S0-5` — semantic checkpoint, admission/install, and immutable creation authority

**Standing:** home — the findings table below is an ownership source of the traceability population; read
back by `pnpm trace:check`.

**Started:** 2026-08-27 · **Inputs:** [`P-8`](../decisions/P-8-checkpoint-and-creation-authority.md) decided;
`S0-2` complete, which was its only other dependency

Two findings, both medium, both about the same mistake in two places: **authentic bytes were treated as
semantic authority.** A producer's signature proves a manifest was made by that producer. It does not prove the
manifest describes the snapshot it names, and a CRDT map's "write once" convention does not prove who wrote
first.

## Findings this action must close

| Finding | Severity | Closed in stage |
| --- | --- | --- |
| `f-b997cdb-checkpoint-coverage-unchecked` | medium | A → B → D |
| `f-b997cdb-attribution-self-replacement` | medium | A → B → C → D |

## Stages

| | Stage | Output | Status |
| --- | --- | --- | --- |
| **A** | Durable record schemas | `SemanticAdmission`, `CreationCertificate`, and the card-id derivation that makes replacement structurally impossible | **done** — [`A-schemas.md`](./A-schemas.md), amended at the return: §1's eligibility resolution and §4's `CheckpointInstall` |
| **B** | Normative construction | TRD §§4.8/7.6/10.4 | **done** — §7.6 splits local re-derivation from the trusted baseline; §4.8 derives `card_id` from its creator; §10.4 keeps card and certificate joint; the return adds §7.6's eligibility, seal-discipline and staged-install rules |
| **C** | Selection rows | rows 5/7/8/10/15 | **done** — rows 7 and 8 gain constructions; 5, 10 and 15 take header notes; the return amends row 7 |
| **D** | Executable evidence | checkpoint and attribution generators, one isolated falsifier per property | **done** — 41 checkpoint negatives and 13 attribution as of the return; 193 AAD fields suite-wide, each isolated; the staged install machine scheduled in the composed model |
| **E** | Product surface | PRD provenance and continuity | **done** — §5.3 says authorship stays evidence after the history that produced it is gone, and that a restorer checks coverage itself |

**§4.5 and §13.7 needed no change.** §4.5 separates freeze from compaction and is untouched by any of this;
§13.7's opener predicate was already corrected during `S0-2`, and the checkpoint step it gates now means
*semantically admitted* by reference rather than by restatement.

Same dependency order as `S0-2`, and for the same reasons: `D` cannot write a falsifier for a field that does
not exist, and `E` would be claiming in product terms something `B` and `C` have not yet made true. **Expect
the same intermediate state after `C`** — the rows will describe constructions the generators do not yet
produce, and `pnpm vectors:check` will report green throughout, because it compares a generator to its vector
and never a document to its generator.

## The split that makes this tractable

`P-8` separated two things the plan had treated as one, and only one of them is a trust question:

1. **Snapshot-to-coverage consistency is re-derived locally and is mandatory.** The checkpoint carries the
   snapshot, so any restorer can materialise it, recompute `{sv, ds}`, and compare against the manifest. No
   witness, no signature, no other party. **This half closes by arithmetic**, and it should be checked even
   when the admission verifies, because a bug produces the mismatch as readily as an attacker.
2. **The accepted-head baseline is the trust question**, because proving the head vector did not advance past
   what the snapshot represents needs the accepted events — exactly what trim removes.

Everything in `A` follows from keeping those apart.

### What Stage D found

**My own test had the defect the coverage audit exists to catch, and a mutation caught it.** The first
`admission-derived-sv-disagrees` negative fell through to the signature, which also refuses — so with the local
re-derivation deleted it *still failed*, and the test could not tell whether that check ran at all. Falsifier 8
requires the local half to refuse **without consulting a signature**, and nothing was proving it.

The repair is `admission-signed-over-a-wrong-derivation`: the admitter properly signs an admission whose derived
coverage genuinely disagrees with the snapshot — a colluding admitter, or an honest one with a bug. Every
signature verifies. The refusal can only come from the restorer recomputing `{sv, ds}` itself. The fixture
asserts its own signature is genuine first, so the negative cannot pass for the wrong reason.

**The coverage audit then demanded ten more.** `admit()` checks the local derivation first, on purpose, so its
semantic negatives stop there and never reach the bindings. Ten `aad-only-admission-*` negatives carry exactly
what the restorer expects and change one signed field each, forcing the refusal onto the signature alone. The
suite went from 169 isolated AAD fields to 181.

**Attribution needed no negative for its central case, and that is the result.** Under the superseded scheme
the phone could mint a valid claim naming itself. It still can — but the certificate hashes to a *different card
id*, so what it produces is a different card rather than a replacement. `card_5B46KSTYGCJ0A1BX` for the laptop,
`card_SX178ARRP7FKM66N` for the phone's attempt. **There is nothing to refuse at the claim layer**, which is
what "structural rather than adjudicated" means when it is executable.

## The `S0-5` return (2026-08-28)

The `S0-9` follow-up returned one repair here — checkpoint evidence with no eligibility/cardinality input and
no install machine (`FU-11`, storage `ST-06`) — and the `S0-3` return had lodged a second debt: `K_cp`'s
absence from the AEAD census, declared and checker-held because its homes stated neither a counter nor a
discipline. The return landed both, the selected `P-8` branch unchanged, with every gate re-run green:

- **Stage A** — [`A-schemas.md`](./A-schemas.md) amended at both edges. §1's admission gains its resolution
  rule: the verifier is the signing key the certified set at the manifest's epoch binds to the admitting
  credential — a lookup refusing an uncertified credential before any signature runs — `self_admitted` equals
  the derived producer relation in both directions, and a producer self-admission is refused while the set
  holds a second eligible client. §4 is the machine that was absent: `CheckpointInstall`, a durable record
  driving two commits — content into its slot, visible to nothing, then one activation flipping content root
  and head baseline together or not at all, with rollback when the window's second writer made the tuple
  ineligible, trim gated on the *active* admitted tuple, and fallback as an install. The falsifier map
  continues at rows 16–23.
- **Stage B** — TRD §7.6 states the eligibility resolution, the per-seal `K_cp` derivation (`cp_salt[16]`,
  one message per derived key, §13.8's discipline at the fifth subkey — a checkpoint's key must open on every
  device, so it narrows to a seal, never to a store), and the staged install with its trim gate; three new
  *must not happen* clauses; §13.7's step 6 names the sub-machine it runs.
- **Stage C** — row 7's selection block carries the salt, the eligibility lines and the install machine; §7's
  never-partially-applied obligation now points at the machine that executes it; §8 states the grown counts
  and why the authority negatives carry genuine signatures.
- **Stage D** — the generator takes the certified set and the producer as inputs, resolves the admitting
  credential through them, and publishes both admissions with their eligibility worlds (`FU-05`'s rule). Four
  authority negatives — `admission-by-an-uncertified-credential`, `self-admission-beside-a-second-eligible`
  (the exact acceptance `ST-06` convicted, inverted with its world kept), `self-admission-unmarked` and
  `second-party-admission-marked-self` — each asserting its own signature genuine first, plus `wrong-cp-salt`
  for the census discipline (41 negatives, 193 AAD fields each isolated). `test/storageSchedule.test.ts`
  schedules the install machine: the content-commit-to-activation window takes a kill and a second writer
  (`demonstrateBoundary`), the pre-return fused installer is refused with the `FU-08` diagnosis, every kill
  point before activation shows the prior pair live and consistent, recovery resumes through the record with
  the pair flipping together, the second-newest fallback actually installs under all three loss modes —
  bytes, admission, opener — and trim never runs under a tuple nobody admitted.
- **Stage E** — PRD §5.3's *a device restoring from a checkpoint checks that checkpoint's coverage itself*
  already said the product truth; no PRD sentence became false.
- **The instruments** — the authority map's `checkpoint-admission` entry flipped (3 joints stay open, none of
  them this stage's); the `k-checkpoint` entry entered the AEAD census from the amended homes with the
  declared absence struck in the same edit, the checker still holding both directions;
  `checkpoint-manifest` and `attribution-record` re-pinned over the amended sections with their rules
  unchanged.

**`P-8`'s reopen invitation was read and declined.** The record invites reopening at `S0-5` if the
portable-witness obstacles clear; neither has — row 4 still binds no `(clientID, clock range)` mapping and
Yjs client ids remain per-instance — so the selected branch stands, exactly as the record says it should
when the note survives.

An 18-mutation battery caught 18 — every restored fixture verifier, dropped cardinality or flag rule,
re-accepted two-device self-admission, salt-blind derivation, fused installer, mixed activation, arithmetic
fallback, early trim, tampered vector, silent map edit and un-struck declaration fails a named check rather
than waiting for a review.

## Not in scope

- The package format that carries a checkpoint — `S0-6`, taking `A`'s shapes as given.
- Compaction and card deletion policy. `A` says creation authority is destroyed *with* its card and never
  alone; **when a card may be destroyed is a product question** and is not answered here.
- Row 21's first-deployment cutover. `P-8` noted that creator-committed ids make the fidelity-archive branch
  more valuable, since creation authority would survive rather than being among the documented losses. That
  remains a Stage 2 product choice.
