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
nothing decides it, every action keeps obeying it. **`RC-9` is the ninth record and the sprint's last** — the
governance node the original seven never included, ratified 2026-08-28 (below).

**`S0-9` has now run twice against `5923f51`, and the package failed both rounds. `S0-10` is blocked.**

- **Round 1** — four parallel non-author challengers: [`S0-9/DISPOSITION.md`](./S0-9/DISPOSITION.md). Every
  root cause has at least one failing axis, two high findings reopen at their decisions, and one live
  construction defect — `K_store` derives identically on every device, so the §6.1 budget bounds no key —
  returns to `P-3`.
- **Round 2** — three serial non-author challengers, reconciled:
  [`S0-9/FOLLOWUP-DISPOSITION.md`](./S0-9/FOLLOWUP-DISPOSITION.md). Sixteen further blockers, `FU-01`–`FU-16`,
  four of them high. The strongest convergence across all seven challengers is the zero-handoff retirement
  deletion (`FU-04`); the Local-archive wrap (`FU-02`) converges across both rounds.

**Outstanding decision work: none. The sprint completed 2026-08-28 — `P-4`, `P-1`, `P-3`, `P-5` and `RC-9`
are all ratified.** An earlier copy of this file said "none" while `RC-9`'s record did not exist, and the
dispositions convicted it; this "none" differs in kind — the record exists, and its debts are the manifest's
to refuse.

- **`P-1` is ratified (2026-08-28): option A — the certified set carries the signing keys.** A member entry
  binds `(credential_id ‖ W_pub ‖ S_pub)`, every approval names its approver, and a verifier resolves that
  key from the parent certified set or the factor-carried bootstrap signer — never from the service-signed
  epoch. `FU-01`'s conditional resolved at the floor: the carrier is completed, not changed, so its return
  stays at `S0-2` Stage A/B/D. What remains is not a decision: the `S0-2` return owes the record's
  falsifiers 12–19 (queue item 4).
- **`P-3` is ratified (2026-08-28): option A at all three joints.** Each store derives its own `K_store`
  and exactly one `SeqCounter` counts it; nothing becomes authoritative without a durable carrier — a
  journal refusal holds the input, never the document, with the inversion-vs-stage mechanism reserved to
  `S0-3` Stage A; and a batch's commit validates its generation under the same IndexedDB serialization the
  allocator leans on. `FU-09`'s conditional resolved at the floor: the reservation transaction is completed,
  not changed, so its return stays at the `S0-2`/`S0-3` interface. `FU-13`'s record half is discharged by
  in-place annotation; the §15 and record-vector homes ride the `S0-3` return. What remains is not a
  decision: the `S0-3` return owes the record's falsifiers 14–22 (queue item 4).
- **`P-4` is ratified (2026-08-28): option B, with intrinsic acceptance.** Every `retire` intent carries the
  erasure acceptance in its signed payload; the destructive boundary is `retired_at + RETENTION`, written once
  at the `cause` overwrite; ceiling erasure terminates in `deleted-without-receipt`, never a state a reader
  can take for a receipt. What remains is not a decision: the `S0-7` return, composed with `S0-6`, owes the
  record's falsifiers 11–19 (queue item 4).
- **`P-5` is ratified (2026-08-28): option A at both joints, with the computed status projection.** Every
  document under `docs/review/remediation/` declares its standing — `home | projection | record |
  superseded` — and a recursive walker refuses what it cannot classify; where the corpus stands is computed
  from the decision records' own headers and checked both directions against this file's per-decision claims,
  the `review:status` shape, never maintained beside them; and `corrected-end-state.md` is superseded — it
  opens by naming its successors and leaves `S0-9`'s input list, which round 3 replaces with the ratified
  records and the regenerated corpus. The record's own stale status line and its `FU-15` gate parenthetical
  are annotated in place. What remains is not a decision: the `S0-1` return owes the record's falsifiers
  15–22 (queue item 4).
- **`RC-9` is ratified (2026-08-28): option A at both joints — drafted fresh and ratified the same day,
  never a reopening, because the decision never existed.** Every deferred property is one entry in one debt
  manifest — owner, one blocking gate, required artifact, falsifier, expiry, hashed inputs — that blocks its
  gate while unpaid, expired or input-changed, and what-blocks-what is computed from the manifest on demand;
  the mechanism is the lineage review's regime — structured homes, hash pins, a computed status view —
  adopted a third time after `P-5`'s census, extended by the verb the prior instances never needed: block.
  The source↔blob binding splits at the toolchain line: hashes stamped into `seal.generated.ts`'s header,
  compared toolchain-free in `wasm:verify`, with provenance attestation staying a registered `L-4` debt.
  Record: [`decisions/RC-9-later-gate-governance.md`](./decisions/RC-9-later-gate-governance.md). What
  remains is not a decision: the `S0-8` regeneration owes the record's falsifiers 1–12 (queue item 5).
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
   **`P-4` and `P-1` are done (both ratified 2026-08-28) and together state the class-1 pattern the
   remaining joints follow: elapsed time executes a factor-authenticated instruction, or it does nothing —
   and a verification key resolves through client- or factor-authenticated state, or it does not verify.
   `P-3` is done (ratified 2026-08-28, option A at all three joints) and states class 2's: a budget binds
   only what its counter can see, an edit is accepted only when a durable carrier holds it, and a
   reservation is only as current as the commit that consumes it. `P-5` is done (ratified 2026-08-28, option
   A at both joints) and states class 3's: every fact keeps one home; every other page is a projection, a
   dated record, or superseded — and says which; an input a gate or challenge consumes is checked by
   something that executed, or it is not an input; and a checker's printed claim is exactly its scope.**
   `RC-9` is done (ratified 2026-08-28, option A at both joints — the decision that never existed, drafted
   fresh and ratified the same day) and states the deferral pattern: a deferred property is a registered
   debt — owner, one gate, artifact, falsifier, expiry — that blocks its gate when it arrives unpaid, and
   "later" is computed from the manifest, never promised in prose. **The sprint is complete.**
3. **Two structural artifacts, before per-finding patches — done 2026-08-28.** (a) The
   **authority-derivation map**: [`S0-2/authority-map.md`](./S0-2/authority-map.md) (standing: home), read
   back by `scripts/check-authority-map.mjs` — `pnpm authority:check`, in `pnpm check`. 31 entries; every
   chain terminates at a permitted root for its guard; ten joints are declared open with their blocker and
   return, six more compute as blocked through the member-key home; an **undeclared** dangling or
   service-only edge, a silent edit to a pinned home, or a flip without a strike fails the gate. A green
   `authority:check` means the rules resolve and their homes are pinned — never that class 1 is closed:
   closure is the open count reaching zero, entry by entry at the returns, and `P-1` falsifier 14's claim is
   discharged at the `S0-2` return, not by the map existing. (b) The **storage-model scheduler**:
   `test/scheduler.ts` (kills at any step boundary, second writers under enforced program order, durable
   versus volatile state with the model's own recovery rule, and a boundary census whose demonstrations are
   execution receipts) plus `test/storageSchedule.test.ts`, which composes the write-admission machine with
   `GenerationApply` in one world. `P-3` falsifier 21's four check-to-commit pairs are all expressible — a
   fused pair now fails the census with the `FU-08` diagnosis — and the three windows the dispositions could
   only describe are reached as states: the refusal-window loss (`FU-08`), the reservation crossing two
   marker advances into a retired-opener generation (`FU-09`, falsifier 20's forbidden composition), and the
   two-device shared-`K_store` budget (`P-3` joint 1). **Those reproduction assertions state the open
   defects, not invariants** — each return inverts its own into the permanent negative and keeps the
   schedule.
4. **Stage returns**, in dependency order, at the stages each disposition entry names: `S0-2` (`FU-01`,
   `FU-05`, `FU-09`) → `S0-3` (`FU-08`, `FU-09`) and `S0-4` (`FU-06` with TRD §7.5, `FU-10`) → `S0-5`
   (`FU-11`) and `S0-6` (`FU-02`, `FU-03` with TRD §14.4) → `S0-7` (`FU-04`, `FU-12`) → `S0-1` (`FU-07` after
   `P-5`, plus round 1's origin-scanner correction: `originOf` discards any URL containing `+`). **Each
   return also flips its authority-map entries and inverts its scheduler reproductions** — editing a pinned
   home fails `authority:check` until the entry is re-read and re-pinned or flipped, which is the designed
   friction, not an obstacle.
5. **`S0-8` regeneration.** `FU-14`'s gate receipts — traceability consumes execution results, never shell
   text; the five matrix limits; `FU-13`'s independent readback; `vectors:coverage` checking identity rather
   than arity; and the `CertifiedSet` AAD audit round 1 found missing entirely. Plus `RC-9`'s consolidation:
   the debt manifest joining the gate — the `OWED` list grown to the ratified fields, six entries — the
   what-blocks-what projection agreeing with this file in both directions, and the source↔blob header binding
   landing in `wasm:verify` (the record's falsifiers 1–12).
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

That establishes the baseline. **The decision sprint is complete, and so are the two structural artifacts**
(queue item 3, 2026-08-28): the authority-derivation map at [`S0-2/authority-map.md`](./S0-2/authority-map.md)
with `pnpm authority:check` in the gate, and the storage-model scheduler at `test/scheduler.ts` with the
composed model in `test/storageSchedule.test.ts`. Then read both dispositions end to end, read the map's ten
open entries and the scheduler's three reproductions — they are the executable form of what the dispositions
describe — and start queue item 4: the stage returns in dependency order, `S0-2` first. A repair that ignores
its class reintroduces the class, and the class instruments now fail on that rather than waiting for a
review: a return is not done until its map entries flip and its reproductions invert.

## Four things that will bite you

**Never reformat the markdown.** Reflowing the TRD **breaks the §15.1 register parser**, which silently takes
`generate-suite-vectors.mjs` down with it. Since 2026-08-28 the formatter cannot reach it — `.prettierignore`,
which oxfmt reads, excludes `*.md` — so the standing rule is: do not remove that ignore entry, and do not
format documents by any other route. After any code formatting, re-run `pnpm typecheck` — a lint-driven
`toSorted()` broke typecheck once already.

**`pnpm check` passes now — know exactly what that means.** On 2026-08-28, on the user's instruction, lint and
format left `pnpm check`; the gate is typecheck plus the evidence suite, and it passed end to end for the
first time in this branch's history that day. Since queue item 3 it also carries `authority:check`, and that
green line means exactly its printed scope: the map's chains resolve and its pinned homes are byte-current,
with ten joints *declared open* — it is the class-1 ledger staying honest, not class 1 closed. What the green
gate does **not** mean: `FU-14` is repaired. Traceability still credits command-text reachability rather than
execution receipts — that lands at `S0-8` — and `wasm:stale` is still in no gate (`RC-9`). Lint and format
are opt-in (`pnpm lint` is correctness-only and currently clean; `pnpm format` covers code files only, with
pre-existing drift left as found).

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
