# Handoff — Stage 0 remediation execution

**Updated:** 2026-08-27 · **Branch:** `claude/stage0-remediation` · **Base:** `9edd930` (the reviewed tip)

Read this first. [`action-tree.md`](./action-tree.md) is the plan; this is where the work actually is, what
state it is in, and what is ready to pick up.

## Where the work lives

| | |
| --- | --- |
| Branch | `claude/stage0-remediation`, 28 commits off `9edd930`, all signed |
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

**Decided (4 of 7):** `P-1` recipient authority · `P-2` device-lock gating · `P-6` Local archive factor ·
`P-8` checkpoint and creation authority. Records in [`decisions/`](./decisions/), each with its falsifiers.

**Outstanding decisions (3):** `P-3` write admission · `P-4` lapse authority · `P-5` policy and closure
authority. **None blocks anything until `S0-8`.** They are genuinely parallel work.

**Actions:** `S0-2`, `S0-5` and `S0-6` are **complete** across all five stages. `S0-1`, `S0-3`, `S0-4` and
`S0-7` are not started. **`S0-7` is now unblocked on its action dependencies** — it had `S0-2` and `S0-6` —
but still needs `P-4`, which is undecided.

**Findings repaired: 14 of 37**, including five of the six high-severity ones. Three with mutation-tested falsifiers, three by document repair, two partial —
graded individually in [`action-tree.md`](./action-tree.md).

**Evidence:** 313 tests · 16/16 generators current · 169 AAD fields each isolated · 15 WASM checks · the blob
reproduces from the crate at 6,465 B.

## What is ready to pick up, in order

1. **`P-4`** — lapse authority. It is now the *only* thing standing between here and `S0-7`, and it is a small
   decision beside the ones already taken: who initiates a lapse, and who wins a lapse-versus-retire race.
2. **`S0-7`** — lifecycle and destructive deletion, which consumes `P-4` and `S0-6`'s `TerminalHandoff`.
3. **`S0-1`, `S0-3`, `S0-4`** — each needs its own decision first (`P-5`, `P-3`, and `S0-1`/`S0-2` respectively).
3. **`P-3`, `P-5`, `P-4`** — parallel, any order, any time, by anyone. `P-3` now has evidence attached: the
   journal probe measured a hard `localStorage` quota wall at ~92k entries, which its oversize and
   storage-failure branch has to handle. See [`probes/journal-append-probe.md`](./probes/journal-append-probe.md).
4. **`S0-8`** — regeneration and the traceability matrix. Not startable until `S0-1`–`S0-7` are stable.

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
