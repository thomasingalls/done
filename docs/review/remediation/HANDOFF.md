# Handoff — Stage 0 remediation execution

**Updated:** 2026-08-28 · **Branch:** `claude/stage0-remediation` · **Base:** `9edd930` (the reviewed tip)

Read this first. [`action-tree.md`](./action-tree.md) is the plan; the two `S0-9` dispositions are the
verdicts; **this file is the one home of the open queue** — what state the work is in and what is ready to
pick up, in order. An earlier copy of this file disagreed with the dispositions on two points (the X25519 debt
gate, and "outstanding decisions: none"); each time, the disposition won. When this file and a disposition
disagree, the disposition is right and this file is the thing to fix.

## Where the work lives

| | |
| --- | --- |
| Branch | `claude/stage0-remediation`, 51 commits off `9edd930`, all signed |
| Contains | the review workspace (`docs/review/`, cherry-picked), the repairs, the decisions, and both `S0-9` challenge rounds |
| Not on it | nothing — this branch is the whole picture, deliberately |
| Superseded | `claude/remediation-findings-review-997ab5` holds the review workspace at its original SHAs. Redundant once this branch is accepted |

The review branch forked at `dbfd01f`, **27 commits before the tip it reviews**, so it never contained the
files under review. That is why the repairs could not be made there and why the two were consolidated.

## The boundary changed, deliberately, and that is the thing to know

The review's own sessions carried a standing constraint: *do not change production code, PRD/TRD, selections,
generators, vectors, tests, requirements, or finding dispositions.* **This work changes all but the last of
those, on the user's explicit instruction**, because it is no longer a review — it is the remediation the
review's plan calls for.

**Finding dispositions are still untouched.** Every `status:` in `docs/review/findings/` reads as it did, and
[`end-state-materiality.md`](./end-state-materiality.md) still reads 19/9/5/4 — including for the ten findings
round 1 reopened; their reopening lives in the dispositions, not in `status:` edits. `S0-10` reserves
disposition changes for a separately authorized validation workflow, and this is not it.

**`docs/review/`'s own manifests are untouched and still verify.** `work-items.tsv`, `lineage.tsv` and
`source-manifest.tsv` are hash-pinned in `config.json`, and `pnpm review:status` checks them. It reports
`ready: none` and `work: 16 complete` — **that is the *review* being complete, not the remediation.** Do not
read it as "nothing to do", and do not edit those files to make it say otherwise.

## State

**All seven decision nodes were taken** — `P-1` recipient authority · `P-2` device-lock gating · `P-3` write
admission · `P-4` lapse authority · `P-5` closure authority · `P-6` Local archive factor · `P-8` checkpoint
and creation authority — records in [`decisions/`](./decisions/), each with its falsifiers. **`P-7` is the
eighth node and is not a choice** — it is the standing rule that rows 18, 19 and 21 stay at their own gates;
nothing decides it, every action keeps obeying it.

**`S0-9` has now run twice against `5923f51`, and the package failed both rounds. `S0-10` is blocked.**

- **Round 1** — four parallel non-author challengers: [`S0-9/DISPOSITION.md`](./S0-9/DISPOSITION.md). Every
  root cause has at least one failing axis, two high findings reopen at their decisions, and one live
  construction defect — `K_store` derives identically on every device, so the §6.1 budget bounds no key —
  returns to `P-3`.
- **Round 2** — three serial non-author challengers, reconciled:
  [`S0-9/FOLLOWUP-DISPOSITION.md`](./S0-9/FOLLOWUP-DISPOSITION.md). Sixteen further blockers, `FU-01`–`FU-16`,
  four of them high. The strongest convergence across all seven challengers is the zero-handoff retirement
  deletion (`FU-04`); the Local-archive wrap (`FU-02`) converges across both rounds.

**Outstanding decision work: three reopened questions, plus one decision that never existed. `P-4` is ratified
and out of the sprint.**

- **`P-1`** owes the `CertifiedSet` an approver its verifier can resolve without the service-signed epoch
  (round 1) — and `FU-01` reopens it further if the selected carrier cannot carry the recovery-bootstrap
  authority. **Drafted 2026-08-28:** the record carries the reopened question, the floor — which resolves
  `FU-01`'s conditional: the carrier is completed, not changed — options A/B/C and falsifiers 12–19.
  Ratification is the open step.
- **`P-3`** owes `K_store` per-device scoping (round 1), the admission ruling for `FU-08`'s post-mutation
  async crash window, `FU-09`'s reservation fence if the transaction shape changes, and `FU-13`'s projection
  sync — TRD §15 and the `P-3` record still publish superseded write-admission claims.
- **`P-4` is ratified (2026-08-28): option B, with intrinsic acceptance.** Every `retire` intent carries the
  erasure acceptance in its signed payload; the destructive boundary is `retired_at + RETENTION`, written once
  at the `cause` overwrite; ceiling erasure terminates in `deleted-without-receipt`, never a state a reader
  can take for a receipt. What remains is not a decision: the `S0-7` return, composed with `S0-6`, owes the
  record's falsifiers 11–19 (queue item 4).
- **`P-5`** owes closure authority over the remediation's own documents — `corrected-end-state.md` is an
  explicit `S0-9` input that no checker reads and that still publishes rejected content (`FU-07`).
- **`RC-9` never had a decision at all**, and `action-tree.md` makes choosing between its branches a
  prerequisite of `L-4`.
- `P-6` reopens only if `FU-02` forces the archive-factor choice to change.

**What the challenges did not discard:** 371 tests across 36 files · 16/16 generators current · 190 AAD
fields each with an isolated negative · 15 WASM checks · the blob reproducing from the crate at 6,465 B · the
four document-to-artifact checks (`retention:check`, `status:check`, `limit:check`, and the suite generator's
own reading of row 1 and §13.10) · `trace:check` resolving every falsifier claim. Both dispositions preserve
these as **local theorems that narrow the repairs**; they do not close the missing authority and concurrency
joints. The matrix's five stated limits — relation, recency, liveness, the non-recursive scan, the unpinned
population — are printed in the matrix itself and repair at `S0-8`.

## The three shapes the open blockers take

Worth knowing before picking anything up, because a repair that ignores its class reintroduces the class:

1. **Unbound authority joints** — an acceptance step trusts a key or predicate that no factor-authenticated
   state resolves (`FU-01`, `FU-02`, `FU-03`, `FU-06`, `FU-11`, the `P-1` approver, and `FU-04`'s
   clock-replaces-custody).
2. **Interleavings the pure models cannot schedule** — crash points and second writers that are unexpressible
   rather than refuted (`FU-08`, `FU-09`, `FU-10`, `FU-12`, `K_store`).
3. **One fact, two homes** — `RC-8C`, the rule this remediation wrote for itself, violated by the remediation,
   including by its gate: at the challenged tip `pnpm check` stopped at lint, so "runs through the gate" was
   command-text reachability, not execution (`FU-05`, `FU-07`, `FU-13`, `FU-14`, `FU-15`, `FU-16`). The gate
   was descoped to the evidence suite on 2026-08-28 and now passes end to end; `FU-14`'s receipts are still
   owed at `S0-8`.

## The queue

In order. An item is done when its disposition entry's earliest-return stage has re-run its own gates.

1. **Hygiene — done in this commit.** `FU-15`: the X25519 dated-evidence debt blocks `S0-10`, per TRD §10.11's
   own sentence; the `OWED` declaration, the regenerated matrix and this file now agree with
   `action-tree.md`. `FU-16`: `end-state-materiality.md` retitled to the ancestor it classifies against, with
   the non-ancestor authoring commit kept as a body note.
2. **The decision sprint.** The five records above — `P-4`, `P-1`, `P-3`, `P-5`, `RC-9` — each updated with
   its reopened question, options and falsifiers, then ratified. Nothing downstream is safe to build first.
   **`P-4` is done (ratified 2026-08-28, option B with intrinsic acceptance) and set the pattern the other
   joints follow: elapsed time executes a factor-authenticated instruction, or it does nothing.** Next is
   `P-1`, whose reopened section is drafted and awaits ratification; `P-3`, `P-5` and `RC-9` follow,
   untouched so far.
3. **Two structural artifacts, before per-finding patches.** (a) An **authority-derivation map** at `S0-2`
   Stage A/B: for every verifier key and acceptance predicate, the factor-authenticated state that resolves
   it, with a checker that fails on a dangling edge — class 1 closes as a class or not at all. (b) A
   **scheduler for the storage models** at the `S0-2`/`S0-3` interface: explicit crash points and two-writer
   interleavings, so class 2's defects become expressible states instead of unschedulable ones.
4. **Stage returns**, in dependency order, at the stages each disposition entry names: `S0-2` (`FU-01`,
   `FU-05`, `FU-09`) → `S0-3` (`FU-08`, `FU-09`) and `S0-4` (`FU-06` with TRD §7.5, `FU-10`) → `S0-5`
   (`FU-11`) and `S0-6` (`FU-02`, `FU-03` with TRD §14.4) → `S0-7` (`FU-04`, `FU-12`) → `S0-1` (`FU-07` after
   `P-5`, plus round 1's origin-scanner correction: `originOf` discards any URL containing `+`).
5. **`S0-8` regeneration.** `FU-14`'s gate receipts — traceability consumes execution results, never shell
   text; the five matrix limits; `FU-13`'s independent readback; `vectors:coverage` checking identity rather
   than arity; and the `CertifiedSet` AAD audit round 1 found missing entirely.
6. **`S0-9` round 3, with a changed perspective.** Seven same-family reads have cleared the
   author-independence bar thoroughly; the one-perspective bar is the open one and is on record twice. A
   different model family, targeted adversarial property tests against the authority map, or a human red-team
   — not an eighth same-family read.
7. **`S0-10`.** Collect the X25519 dated readback (TRD §10.11 offers review 3b's pass for it), record which
   independence bar the closure stands on, and only then touch finding dispositions.
8. **`L-1`–`L-4` and `H-1`** are the rest of the plan and are outside Stage 0. `H-1`'s append-only ledger
   holds the four historical-only corrections, and `docs/decisions.md`'s stale *eighteen rows are selected*
   belongs to it rather than to a silent edit.

## The exact next command

```bash
cd /Users/thomasingalls/Code/done/.claude/worktrees/stage0-repairs && pnpm install --frozen-lockfile && pnpm vectors:check && pnpm test
```

That establishes the baseline. Then read both dispositions end to end, and continue the decision sprint at
[`decisions/P-1-recipient-authority.md`](./decisions/P-1-recipient-authority.md) — `P-4` is ratified, and its
reopened section is the shape the remaining four records should take.

## Four things that will bite you

**Never reformat the markdown.** Reflowing the TRD **breaks the §15.1 register parser**, which silently takes
`generate-suite-vectors.mjs` down with it. Since 2026-08-28 the formatter cannot reach it — `.prettierignore`,
which oxfmt reads, excludes `*.md` — so the standing rule is: do not remove that ignore entry, and do not
format documents by any other route. After any code formatting, re-run `pnpm typecheck` — a lint-driven
`toSorted()` broke typecheck once already.

**`pnpm check` passes now — know exactly what that means.** On 2026-08-28, on the user's instruction, lint and
format left `pnpm check`; the gate is typecheck plus the evidence suite, and it passed end to end for the
first time in this branch's history that day. What it does **not** mean: `FU-14` is repaired. Traceability
still credits command-text reachability rather than execution receipts — that lands at `S0-8` — and
`wasm:stale` is still in no gate (`RC-9`). Lint and format are opt-in (`pnpm lint` is correctness-only and
currently clean; `pnpm format` covers code files only, with pre-existing drift left as found).

**`pnpm vectors:check` cannot see document drift.** It compares a generator to its vector and never a document
to its generator. During `S0-2` Stage C the selection rows described constructions the generators did not
produce, and every check reported green throughout. That is the shape of
`f-992bc91-network-carrier-registry-stale`. If you amend a row, the matching generator change is owed in the
same action. Four checks read a document against an artifact — `status:check`, `retention:check`,
`limit:check` and the suite generator's own reading of row 1 §3 and §13.10 — and between them they cover the
rows those sections describe and no others. `trace:check` is not one of them: it catches a *falsifier* going
missing, not a row describing a construction nobody built.

**Never `git checkout --` to undo a mutation.** The mutation batteries run against uncommitted work, so a git
restore reverts the action's own changes along with the mutation — silently, since the check then fails for a
reason that looks like the mutation working. `S0-8`'s first battery destroyed the tags in four files this way.
Snapshot the file contents in memory before applying, and write them back in a `finally`.
