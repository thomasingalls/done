---
schema: 1
kind: session
session: 2026-08-27-S0-remediation-execution-root
owner: root
work_items: setup
started: 2026-08-26T18:40:00Z
updated: 2026-08-27T10:30:00Z
status: complete
blocked_on: none
---

# Session — Stage 0 remediation execution

## Claim

**This session left the review's boundary, on the user's explicit instruction, and that is the first thing a
reader needs to know.** Every prior session under `docs/review/sessions/` carried the standing constraint *do
not change production code, PRD/TRD, selections, generators, vectors, tests, requirements, or finding
dispositions.* This one changes all of those except the last, because the review is complete and its plan
called for the repair.

It is filed under `work_items: setup` — the schema's value for a session that is not a review work item, as
the machinery session used before it. That is deliberate rather than convenient: `work-items.tsv` is
hash-pinned in `config.json` and `review-status.mjs` verifies it, the review's 16 items are complete, and its
boundary should stay closed. The execution is tracked in
[`remediation/action-tree.md`](../remediation/action-tree.md) and
[`remediation/HANDOFF.md`](../remediation/HANDOFF.md) instead.

**It exists here because the review's own handoff rule points at the last session.** Without it, the newest
session describes *writing* the remediation plan and a fresh reader would get a picture two weeks stale.

## Sources read

- The remediation package in full: `remediation/action-tree.md`, `causal-decision-trees.md`,
  `corrected-end-state.md`, `end-state-materiality.md`, `remediation-options.md`
- Twelve finding files, each read against the artefact it names at `9edd930` rather than taken on trust
- The pinned tip directly, via `git show 9edd930:<path>`: `wasm/journal-seal/src/lib.rs` and its glue, the suite,
  transition, enrollment, package, checkpoint and device-lock generators, TRD §§6.1/9.3/10.11/13.2–13.8, PRD
  §§6.3–6.5/7.2–7.6, and selection rows 3/4/5/7/10/11/13/14/15
- `docs/review/README.md` for the session and handoff conventions this file follows

## Commands and external evidence

- `pnpm install --frozen-lockfile`, then `pnpm vectors:check`, `pnpm test`, `pnpm typecheck`,
  `node scripts/check-{aad-coverage,wasm-seal,retention}.mjs` as the standing baseline
- `node scripts/build-wasm-seal.mjs --check` — cargo reproduced the committed 6,465-byte blob exactly
- `npx playwright test --config playwright.latency.config.ts journal.spec.ts --project=desktop`, twice, for the
  append probe's two arms
- Every falsifier mutation-tested by reverting its guard, confirming the failure and its diagnosis, and restoring
- No external network evidence was gathered. The X25519 support floor deliberately carries **no** dated
  compatibility table for that reason; asserting version rows from memory would be worse than the omission

## Work log

**Independent evaluation of the remediation package**, before anything was changed. Twelve findings verified
against the pinned tip by reading `9edd930` directly rather than trusting the write-up; all twelve held. Two
structural criticisms of the plan followed and were acted on: `RC-5`'s decision was the only Stage-0-blocking
choice not hoisted into the decision list, and roughly nine findings were routed through decision gates they
did not need.

**Eight findings repaired.** Three with mutation-tested falsifiers (WASM glue widths, the rotated-generation
fixture, the stale carrier registry), three by document repair (PRD status contradiction, the `2^32` ceiling,
the checkpoint retention subject), two partial (X25519's absence behaviour without its dated evidence table;
the journal benchmark's harness without its device-population measurement).

**Four decisions taken** — `P-1`, `P-2`, `P-6`, `P-8` — each recorded in
[`remediation/decisions/`](../remediation/decisions/) with the falsifiers it obliges. `P-8` was created during
this session; it did not exist in the plan.

**`S0-2` executed in full**, staged A–E: six durable record schemas, six TRD sections, eight selection rows,
14 falsifiers all mutation-tested, seven PRD passages.

**One probe run.** The immutable-append benchmark, taken before `S0-10` rather than deferred to `L-4` because
the corrected harness made it a single command. It found no material difference between append and hot-key
overwrite, so the synchronous-journal premise survives; its unbounded arm measured a hard `localStorage`
quota wall at ~92k entries, which is an input to `P-3`.

## Artifacts changed

- Added: `remediation/HANDOFF.md`, `remediation/decisions/` (4), `remediation/probes/` (1), `remediation/S0-2/` (2)
- Amended: `remediation/action-tree.md` (the `P-8` node, the repairs-applied section, per-stage status),
  `remediation/remediation-options.md` (`RC-5`'s packet points at `P-8`)
- **Untouched:** every finding's `status:`, `end-state-materiality.md`'s 19/9/5/4 accounting, and all three
  hash-pinned manifests. `S0-10` reserves disposition changes for a separately authorized workflow.

## Findings and null results

**No new findings were raised.** This session repairs the validated population rather than extending it; the
four decisions and the probe are dispositions of existing findings, not additions to them.

**Three null results worth keeping.**

- The append probe found **no material difference** between immutable append and hot-key overwrite — ratios
  0.97×–1.28× across three payload sizes and both seal paths, with an identical 60 µs p95. The finding that
  prompted it does not reopen the row-2 selection or the synchronous-journal architecture.
- A sweep for other PRD passages contradicting the corrected TRD found three, all the same stale phrase, all
  repaired. A fourth check — whether the two authority tables had drifted in length — came back clean after
  the repair and would not have before it.
- The review's own `vectors:check` was confirmed **unable** to detect document-to-generator drift. That is a
  null result about the tooling rather than about the design, and it is recorded in `HANDOFF.md` because it
  will mislead the next person otherwise.

## Hypotheses that remain

- **§7.5 may reopen.** `P-1` puts client approvals inside the epoch, and the accepted-head vector rides the
  same payload. Stage B concluded this is a clarification rather than a change — positions stay the service's
  to assert — and recorded that reasoning so `S0-9` can disagree with it. If it does, §7.5 is where it lands.
- **The portable-witness direction may beat `P-8`'s selected branch.** Making head-baseline correctness
  arithmetic rather than replayed would remove the trust question entirely. Two obstacles are named in the
  `P-8` record; if they clear, it should reopen at `S0-5` rather than waiting for a later stage.
- **Row 21's fidelity-archive branch is now cheaper.** `P-8` selected creator-committed card ids, so creation
  authority would survive the first-deployment cutover instead of being among its documented losses.

## Handoff

### The exact next command

```bash
cd /Users/thomasingalls/Code/done/.claude/worktrees/stage0-repairs && pnpm install --frozen-lockfile && pnpm vectors:check && pnpm test
```

### Next ready work item

**`S0-5`** — semantic checkpoint and immutable creation authority. Unblocked: `P-8` decided its two axes and
`S0-2` cleared its only other dependency. Everything needed to start is in
[`decisions/P-8-checkpoint-and-creation-authority.md`](../remediation/decisions/P-8-checkpoint-and-creation-authority.md).

`P-3`, `P-4` and `P-5` remain undecided and block nothing until `S0-8`; they are available in parallel.
