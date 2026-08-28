# Handoff — Stage 0 remediation execution

**Updated:** 2026-08-27 · **Branch:** `claude/stage0-remediation` · **Base:** `9edd930` (the reviewed tip)

Read this first. [`action-tree.md`](./action-tree.md) is the plan; this is where the work actually is, what
state it is in, and what is ready to pick up.

## Where the work lives

| | |
| --- | --- |
| Branch | `claude/stage0-remediation`, 46 commits off `9edd930`, all signed |
| Contains | the review workspace (`docs/review/`, cherry-picked), the repairs, and the decisions |
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
[`end-state-materiality.md`](./end-state-materiality.md) still reads 19/9/5/4. `S0-10` reserves disposition
changes for a separately authorized validation workflow, and this is not it. The repairs are recorded in
[`action-tree.md`](./action-tree.md)'s "Repairs already applied" section instead.

**`docs/review/`'s own manifests are untouched and still verify.** `work-items.tsv`, `lineage.tsv` and
`source-manifest.tsv` are hash-pinned in `config.json`, and `pnpm review:status` checks them. It reports
`ready: none` and `work: 16 complete` — **that is the *review* being complete, not the remediation.** Do not
read it as "nothing to do", and do not edit those files to make it say otherwise.

## State

**Decided — all 7 of the nodes that are choices:** `P-1` recipient authority · `P-2` device-lock gating ·
`P-3` write admission · `P-4` lapse authority · `P-5` closure authority · `P-6` Local archive factor · `P-8`
checkpoint and creation authority. Records in [`decisions/`](./decisions/), each with its falsifiers. **`P-7` is the eighth node and is not a choice** — it
is the standing rule that rows 18, 19 and 21 stay at their own gates and no remediation artifact selects them
by implication. Nothing decides it; every action has to keep obeying it.

**Outstanding decisions: none.** Every remaining item is an action, and no action is waiting on a choice.

**Actions: all eight are complete** — `S0-1` through `S0-7` across all five stages, and `S0-8`'s regenerated
evidence and traceability matrix. **`S0-9`'s independent challenge is what remains**, then `S0-10`'s closure.

**Findings: 29 of 37 are addressed** by the seven actions plus the eight direct repairs, and **all six
high-severity ones are among them**. That is no longer a hand count:
[`traceability.md`](./traceability.md) is generated from claims carried by the evidence and reports **85
falsifiers over 27 of the 28 current design and closure defects**. The 28th, `f-bd87655`'s dated evidence table,
is declared owed at `L-4` rather than counted as covered, and so is `f-66a7c6a`'s append burst on a declared
device population.

**The other 8 are outside Stage 0 by design** — 4 historical-only corrections belonging to `H-1`'s append-only
ledger, and 4 later gates (`f-9860a0b` legacy cutover at `L-2`; the RustCrypto audit gap, the source/artifact
drift check and the support-population floor at `L-4`). No action was ever meant to touch them, and
[`end-state-materiality.md`](./end-state-materiality.md) still reads 19/9/5/4 because no disposition changed.

**Evidence:** 371 tests · 16/16 generators current · 190 AAD fields each isolated · 15 WASM checks · the blob
reproduces from the crate at 6,465 B · **three document-to-artifact checkers** — `pnpm retention:check`,
`pnpm status:check` and `pnpm limit:check`, the last of which recomputes §12's extrapolation rather than
comparing a string — plus the suite generator's own reading of row 1 and §13.10, and **`pnpm trace:check`**,
which resolves every falsifier claim against the artifact that carries it.

## What is ready to pick up, in order

1. **`S0-9`** — the independent challenge, by someone who did not author the repairs, then `S0-10`'s closure.
   Read [`traceability.md`](./traceability.md) first: it is generated, so it is the shortest route from a
   finding to the artifact that refuses it, and it names the two items still owed rather than hiding them in a
   count. Its own honest limit is the place to push — **it proves a falsifier exists and runs; it does not
   prove one isolates.** Isolation is `pnpm vectors:coverage` for AAD fields and the per-action mutation
   batteries for everything else, so a challenge that finds a negative refusing for a second reason is
   attacking the right seam.
2. **`L-1` through `L-4` and `H-1`** are the rest of the plan and are outside Stage 0. Two partial findings and
   four later gates wait there; `H-1`'s append-only ledger holds the four historical-only corrections, and
   `docs/decisions.md`'s stale *eighteen rows are selected* belongs to it rather than to a silent edit.

## The exact next command

```bash
cd /Users/thomasingalls/Code/done/.claude/worktrees/stage0-repairs && pnpm install --frozen-lockfile && pnpm vectors:check && pnpm test
```

That establishes the baseline. Then read [`S0-2/README.md`](./S0-2/README.md) for how an action is staged, and
[`decisions/P-8-checkpoint-and-creation-authority.md`](./decisions/P-8-checkpoint-and-creation-authority.md)
for what `S0-5` has to implement.

## Two things that will bite you

**Never run `pnpm format:fix`.** The four markdown documents it wants to reformat include the TRD, and
reformatting it **breaks the §15.1 register parser**, which silently takes `generate-suite-vectors.mjs` down
with it. The pinned tip already fails `pnpm format` and `pnpm lint` on files unrelated to any repair, so
`pnpm check` has never passed on this branch or its base. Format individual files you have changed, and
re-run `pnpm typecheck` afterwards — a lint-driven `toSorted()` broke typecheck once already.

**`pnpm vectors:check` cannot see document drift.** It compares a generator to its vector and never a document
to its generator. During `S0-2` Stage C the selection rows described constructions the generators did not
produce, and every check reported green throughout. That is the shape of
`f-992bc91-network-carrier-registry-stale`. If you amend a row, the matching generator change is owed in the
same action. **Four checks now read a document against an artifact** — `status:check` (PRD against §15),
`retention:check` (§14.7 against the executable model), `limit:check` (§12's table against the measurements)
and the suite generator's own reading of row 1 §3 and §13.10 — and between them they cover the rows those
sections describe and no others. `trace:check` is not one of them: it catches a *falsifier* going missing, not
a row describing a construction nobody built.

**Never `git checkout --` to undo a mutation.** The mutation batteries run against uncommitted work, so a git
restore reverts the action's own changes along with the mutation — silently, since the check then fails for a
reason that looks like the mutation working. `S0-8`'s first battery destroyed the tags in four files this way.
Snapshot the file contents in memory before applying, and write them back in a `finally`.

## Open question for whoever picks this up

**Answered, and the answer is a file.** The question was where the per-action falsifier tables get collected;
the answer is that they do not — the claim moved to the evidence and
[`traceability.md`](./traceability.md) is read back out of it, so there is nothing to collect and nothing to
keep in step. The seven Stage D tables stay as the narrative of *why* each falsifier is the right one, which is
the part a generated table cannot carry.

**What replaces it for `S0-9`:** the matrix reports 27 of 28, and the 28th is a declared debt rather than a gap.
The interesting challenge is not the count but its last section, **where one artifact carries the whole
demonstration** — 10 of the 28 resolve to a single named falsifier, listed with the file each one lives in. A
single claim is not automatically thin (`check-wasm-seal.mjs` is one claim over fifteen checks), but it is the
shortest list of places where losing one artifact loses the finding. The only high-severity entry on it is
`f-4259822-recovery-replacement-no-forward-rotation`, already marked partial to `L-2`.

That list is derived, and it had to be: this file first said *two*, from a hand count of the rendered table that
missed the rows whose falsifier titles contain the separator it was counting. The number is 10, the matrix
computes it, and that mistake is the action's own subject arriving one more time.
