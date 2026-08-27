# Handoff — Stage 0 remediation execution

**Updated:** 2026-08-27 · **Branch:** `claude/stage0-remediation` · **Base:** `9edd930` (the reviewed tip)

Read this first. [`action-tree.md`](./action-tree.md) is the plan; this is where the work actually is, what
state it is in, and what is ready to pick up.

## Where the work lives

| | |
| --- | --- |
| Branch | `claude/stage0-remediation`, 40 commits off `9edd930`, all signed |
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

**Actions:** `S0-1`, `S0-2`, `S0-5`, `S0-6` and `S0-7` are **complete** across all five stages. `S0-3` is
unblocked and not started; `S0-4` needs `S0-1` and `S0-2`, which are both now done.

**Findings repaired: 18 of 37**, including five of the six high-severity ones. Seven with mutation-tested
falsifiers, three by document repair, two partial — graded individually in
[`action-tree.md`](./action-tree.md).

**Evidence:** 336 tests · 16/16 generators current · 181 AAD fields each isolated · 15 WASM checks · the blob
reproduces from the crate at 6,465 B · **two document-to-artifact checkers**, `pnpm retention:check` and
`pnpm status:check`, plus the suite generator's own reading of row 1 and §13.10.

## What is ready to pick up, in order

1. **`S0-3`** — total local-write admission, the allocator and the trim budget. Unblocked: `P-3` is decided.
   It is also where three already-applied repairs finish — the glue widths, the rotated-generation fixture and
   the nonce ceiling, the last of which still owes the build-failing boundary test that `P-3`'s
   `reserved[gen]` count now makes writable.
2. **`S0-4`** — the exact-byte outbound spool and refusal protocol. Unblocked: it needed `S0-1` and `S0-2`, and
   both are done. Independent of `S0-3`, so the two can run in either order or together.
4. **`S0-8`** — regeneration and the traceability matrix, then `S0-9`'s challenge and `S0-10`'s closure.
   `P-5` gives the matrix a criterion — one home per fact, read rather than restated, checked in both
   directions by a third party — so it is a readback rather than a survey.

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
same action, and only `S0-8`'s traceability matrix will catch it if you forget.

## Open question for whoever picks this up

`S0-8` wants every repaired finding mapped to the falsifier that proves it. Most of that material exists —
`S0-2`'s Stage D table has 14 of them with their locations — but it is per-action, and nothing collects it
across actions yet. Building that collector early would make `S0-8` a readback rather than an archaeology.
