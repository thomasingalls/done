# `S0-9` — disposition

**Run:** 2026-08-28 · **Subject:** `5923f51` · **Verdict: the challenge fails. Stage 0 cannot close on this
evidence.**

## How it was run

Four challengers, each in its own detached worktree at `5923f51` — the commit **before** the repair author's own
`S0-9` attempt — with no access to that attempt, to later commits, to other branches or to the reflog. None
authored any repair. The split follows this plan's own *safe parallel work* note.

| Cluster | Root causes | Report |
| --- | --- | --- |
| storage | `RC-3`, `RC-5` | [`challenge-storage.md`](./challenge-storage.md) |
| protocol | `RC-1`, `RC-4` | [`challenge-protocol.md`](./challenge-protocol.md) |
| continuity | `RC-2`, `RC-6`, `RC-7` | [`challenge-continuity.md`](./challenge-continuity.md) |
| platform, evidence and closure | `RC-8`, `RC-9` | [`challenge-platform.md`](./challenge-platform.md) |

All four reran every gate independently, which satisfies *at least one non-author reruns exact artifacts* four
times over. All four left their worktrees clean. **Every root cause has at least one failing axis.**

## Three patterns, found independently and converging

These matter more than any single defect, because each one generated several.

### 1. A falsifier for a documentation finding does not read the document

Three challengers hit this separately, in three clusters.

- **`f-dbfd01f-record-nonce-ceiling-omitted`** — `test/writeAdmission.test.ts` imports only `vitest` and
  hardcodes `BUDGET = 2 ** 32`. Exactly three scripts read `TRD.md`, and none reads §6.1. The whole normative
  paragraph deletes, or drifts to `2^40`, with every gate green.
- **`f-dbfd01f-device-lock-rotation-caveat-lost`** — the guard is a tautology:
  `if (rotationOwedAt(step) !== step < 8)` where `rotationOwedAt = (step) => step < 8`. It cannot throw, and its
  diagnosis is dead code. The TRD sentence can be deleted and replaced with copy asserting the opposite; all
  gates stay green.
- **`f-tip-prd-stale-selection-status`** — the checker only examines sentences matching `/§15 row/`. **The
  reviewed tip's own stale passages say "TRD §15" with no row number**, so they are discarded unread. Restoring
  `9edd930`'s PRD passes the check.

That last is the sharpest result in the pass: **the falsifier does not catch its own finding.** It is a
regression guard for one document edit, credited as proof of the repair — and the author's self-challenge
"repaired" it without noticing it had never worked.

### 2. Evidence credited to a repair that predates the repair

Six negatives in the matrix ran unchanged at `9edd930` — passing *while the defect existed*: `kind-swapped`,
`seq-edited`, `lifted-to-another-card`, `reattributed-actor`, `reattributed-credential`,
`substituted-commitment`. Their only diff on this branch is the `falsifies:` tag.

`check-traceability.mjs` cannot see this, because it checks that a falsifier **exists, names a finding and
runs** — and nothing else. It does not check **relation** (tagging `flipped-tag-bit` as the sequence-allocator's
falsifier passes, 85 → 86 claims) and it does not check **recency**.

### 3. One fact, two homes, and the cross-check reads one of them

`RC-8C` is the rule this remediation wrote for itself, and the remediation breaks it.

- `DELETION_CLASSES` in `generate-package-vectors.mjs` is a second copy of §14.7's class list that **already
  disagrees** — five entries, missing `recovery-anchor`, which is precisely the class §14.7 says expiry keeps
  and retirement does not. `check-retention.mjs` compares §14.7 to the retention model and never to this copy.
- Row 17's A1 control was narrowed by `S0-1`; `test/vectors/web-security-baseline.json`'s A1 entry is
  **byte-identical to `9edd930`**, because `ADDENDUM` is a literal in the generator that never reads the row.
- TRD §10.11 says the X25519 readback is required **before Stage 0 closes**; `traceability.md`'s `OWED` list
  defers it to `L-4`. Nothing checks the pair.

## What reopens

**Two high findings.**

| Finding | Why it is not closed | Returns to |
| --- | --- | --- |
| `f-4259822-retirement-safe-survivor-gate-undefined` | §14.4's *only a durable handoff authorizes a deletion class* composed with §14.7's *a retirement inherits the lapse's clock* lets a retirement be **born with its ceiling already past**, so the `past` bypass is true from the first instant and the gate never fires. Reproduced on the shipped model: all six classes deleted with `handoffs.size === 0`, reachable by the entitlement signer alone | `P-4` / `S0-7`, composed with `S0-6` |
| `f-c611666-rotation-reader-eligibility-missing` | The `CertifiedSet` message has **no approver field** and `members_digest` binds a wrapping key, not a signing key. Nothing client-authenticated resolves an approval's verification key, so a verifier falls back on the service-signed epoch — the object `P-1` says must not decide recipients | **`P-1`** |

**Eight more.** `f-b997cdb-checkpoint-coverage-unchecked` (its `SNAPSHOT` is the UTF-8 of a descriptive
sentence; `SV`/`DS` are unrelated constants, so there is nothing semantic to check);
`f-b997cdb-attribution-self-replacement` (the named attack still verifies `{"verified":true,"exact":true}`);
`f-745e332-local-archive-portable-wrap-undefined` (the root-commitment check deletes with every negative still
failing — the fails-twice shape, on a high finding);
`f-3bea0e6-store-sequence-allocation-undefined` (below); `f-992bc91-network-carrier-registry-stale` (the
finding's own validation step 4 fails); and the three documentation findings in pattern 1.

## One live construction defect, not an evidence weakness

`K_store = HKDF-SHA256(K_g, info = LP("done/store/v1") || LP(workspace_id))` — **no principal, no device.**
Every device in the workspace derives the identical key. TRD §6.1 then says *"SP 800-38D bounds a **key** to
2^32 invocations"* and applies the budget per store, through `reserved[gen]`. Those do not compose: D devices
each get their own 2^32 under one shared key, so the stated 2^-32 collision bound is false for every D ≥ 2.

`RC-3`'s causal chain never reaches this derivation. **This returns to `P-3`, not to a vector.**

## What `S0-10` is blocked on

1. **Both high findings above**, at their decisions rather than their artifacts.
2. **`K_store`'s key scoping**, which is a design change.
3. **The matrix's stated limits are smaller than its real ones.** Beyond isolation, `check-traceability.mjs`
   does not check relation or recency; a **gutted check script keeps its claim** (reachability is not liveness,
   and three of the ten single-falsifier findings rest wholly on that carrier); all three of its `readdirSync`
   calls are **non-recursive**, so a tag under `test/geometry/` or `scripts/lib/` vanishes at exit 0; and
   **nothing pins the population at 37** — deleting a finding from all four places regenerates green.
4. **`RC-9` has no decision at all.** `action-tree.md` makes choosing between its branches a prerequisite of
   `L-4`, which contradicts `HANDOFF.md`'s *"Outstanding decisions: none."* Demonstrated: editing `lib.rs`
   without rebuilding leaves `wasm:verify` (in `check`) green while `wasm:stale` (in no gate) fails.
5. **`pnpm vectors:coverage` checks arity, not identity** — swapping what two `aad-only-intent-*` negatives test
   leaves the vector byte-identical and the audit green with both attributions wrong. And the `CertifiedSet`
   construction is registered with no AAD audit at all, so 5 of its 8 fields are isolated by nothing.

## Corrections to the author's own `S0-9` pass

[`README.md`](./README.md) recorded a self-challenge and said plainly it could not clear the independence bar.
It was right about that, and two of its conclusions are now superseded:

- **"No challenge returned a repair to its owning action" is false.** Two high findings and one construction
  defect return to `P-1`, `P-3` and `P-4`.
- **The origin scanner's repair is narrower than reported.** `originOf` discards any URL containing `+`, so
  `family=Open+Sans` — the archetypal Google Fonts link, and the case the docblock says it was written for — is
  missed. The six forms the author's battery tested all pass; they were the six the author thought of.

Its `RC-4` simpler-repair answer stands, and the protocol challenger reached the same conclusion independently
by a different route, adding that the measurement which would settle it was never taken.

## What held

Worth recording, because a challenge that reports only its hits is not reporting its method.

- **The antireplay refusal negatives genuinely isolate** — the best-built evidence in the program.
- **`check-wasm-seal.mjs`** refuses its own defect with three independent oracles; the byte-identical stale-buffer
  nonce reuse reproduces.
- **`checkSeparation`** is a genuine total classification: `both`, `Async`, `sync `, and an omitted key are all
  caught with the right diagnosis.
- **The account-package fresh-mint negative and its ordering variant**, the **checkpoint opener predicate**, the
  **replacement-payload binding**, and the **retirement/lapse race in both orders** all catch reintroduction by
  name.
- Every one of `RC-1`'s and `RC-4`'s **own named attacks** is refused with the right diagnosis. Both clusters
  fail in the layer *above* their vectors, not in the vectors.

## The honest limit of this challenge

Four challengers, all the same model family. This closes the **author reviewing their own work** problem. It
does not close the **one perspective** problem, and four agents that share a blind spot will share it
independently. `S0-10` should record which of the two bars it is standing on.
