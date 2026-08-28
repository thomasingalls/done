# Handoff — Stage 0 remediation execution

**Standing:** home — the one home of the open queue; read back by `pnpm remediation:status`, which checks
the per-decision claims below against the decision records in both directions.

**Updated:** 2026-08-28 · **Branch:** `claude/stage0-remediation` · **Base:** `9edd930` (the reviewed tip)

Read this first. [`action-tree.md`](./action-tree.md) is the plan; the two `S0-9` dispositions are the
verdicts; **this file is the one home of the open queue** — what state the work is in and what is ready to
pick up, in order. An earlier copy of this file disagreed with the dispositions on two points (the X25519 debt
gate, and "outstanding decisions: none"); each time, the disposition won. When this file and a disposition
disagree, the disposition is right and this file is the thing to fix.

## Where the work lives

| | |
| --- | --- |
| Branch | `claude/stage0-remediation`, 77 commits off `9edd930` as of the `S0-4` return, all signed; the current tip rides the worktree branch `claude/s0-4-return-35bb60` until folded back |
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
  epoch. `FU-01`'s conditional resolved at the floor: the carrier is completed, not changed. **Nothing
  remains owed: the `S0-2` return landed the record's falsifiers 12–19 on 2026-08-28** — the approver lookup
  is real and the impostor negative inverted (12–13), the map's four member-key entries flipped with
  `authority:check` green at 6 open joints (14), bootstrap acceptance derives its verifier from the
  factor-opened `RecoveryState` and the retired signer is refused by the rotated commitment (15–16), the
  accepted bootstrap mints the replacement certified set and the recovered credential rotates under it (17),
  the six enrollment states run with crash points and the sibling-successor loser resumes to `certified`
  (18, criterion 11), and `pnpm recipient:check` is the homes-agree readback with `FU-05`'s independent
  reconstruction (19) — with the `CertifiedSet` AAD registration staying at `S0-8` exactly as the record
  reserves it.
- **`P-3` is ratified (2026-08-28): option A at all three joints.** Each store derives its own `K_store`
  and exactly one `SeqCounter` counts it; nothing becomes authoritative without a durable carrier — a
  journal refusal holds the input, never the document; and a batch's commit validates its generation under
  the same IndexedDB serialization the allocator leans on. `FU-09`'s conditional resolved at the floor: the
  reservation transaction is completed, not changed. **Nothing remains owed: the `S0-3` return landed the
  record's falsifiers 14–22 on 2026-08-28** — the derivation binds the `store_id` minted beside the counter
  and the two-store reproduction is inverted with `wrong-store-subkey` published (14–15); the AEAD census
  entries landed with the sweep widened to sealed constructions and `K_cp`'s absence declared to the `S0-5`
  return (16); the refusal path stages before it promotes — Stage A selected stage-and-promote — so every
  kill point on it shows no document ahead of durable state, with `S-6`'s two green mutations held as
  permanent negatives (17–18); the write-admission machine consolidated the fence and the retirement
  composition holds on the reproduction's schedule (19–20); the boundary census stands over the renamed
  steps (21); and `pnpm admission:check` is the homes-agree readback with the two-store reconstruction
  (22) — `FU-13`'s §15 row 3 and record-vector homes landed the same day, and the matrix receipts stay at
  `S0-8` exactly as the record reserves them.
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
  are annotated in place. **Nothing remains owed: the `S0-1` return landed the record's falsifiers 15–22 on
  2026-08-28** — the census walker and computed projection are `pnpm remediation:status`
  (`remediation:check` in `pnpm check`), `census.json` pins all nineteen record-standing documents, the
  supersession header and input-list swap landed in one commit, and the `originOf` correction and both
  claim narrowings are in — with falsifier 20's receipt mechanism staying `S0-8`'s design exactly as the
  record reserves it.
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
   clock-replaces-custody). **`FU-01` and the approver returned 2026-08-28 at the `S0-2` return** — the
   member-key entries resolve through the parent certified set or the factor and the map's class-1 ledger
   read 6 open, none of them a recipient-authority carrier — **and `FU-06` returned the same day at the
   `S0-4` return**: the refusal's subject carries the refused envelope's own epoch and the verifier resolves
   from the lineage's certification in force, never from the answer, with the retired-key and wrong-epoch
   attacks published as genuine-signature negatives; the map now reads 4 open (the live count is always the
   checker's). `FU-02`/`FU-03` ride `S0-6`, `FU-11` rides `S0-5`, `FU-04` rides `S0-7`.
2. **Interleavings the pure models cannot schedule** — crash points and second writers that are unexpressible
   rather than refuted (`FU-08`, `FU-09`, `FU-10`, `FU-12`, `K_store`). **`FU-09`'s interface half returned
   2026-08-28 at the `S0-2` return** — the composed model's commit carries `P-3`'s ratified fence and the
   reservation-fence reproduction is inverted with its schedule kept — **and the class's `S0-3` members
   returned the same day at the `S0-3` return**: `FU-08`'s refusal window stages before it promotes and its
   reproduction is inverted at every kill point, `K_store` derives per store with the two-device reproduction
   inverted, and `FU-09` finished with the write-admission machine consolidating the fence (`P-3` falsifiers
   14–22 all landed). **`FU-10` returned the same day at the `S0-4` return, through the same scheduler**: the
   position grant stages the spool row in its own transaction, the crash between reservation and spool
   insertion is a schedule whose every kill point recovery resolves, and the counter-only world is kept as
   the detected negative. `FU-12` rides `S0-7`, the class's last member.
3. **One fact, two homes** — `RC-8C`, the rule this remediation wrote for itself, violated by the remediation,
   including by its gate: at the challenged tip `pnpm check` stopped at lint, so "runs through the gate" was
   command-text reachability, not execution (`FU-05`, `FU-07`, `FU-13`, `FU-14`, `FU-15`, `FU-16`). The gate
   was descoped to the evidence suite on 2026-08-28 and now passes end to end; `FU-14`'s receipts are still
   owed at `S0-8`. **`FU-07` returned 2026-08-28 at the `S0-1` return** — the census walker now polices this
   class in the gate — **and `FU-05` returned the same day at the `S0-2` return**: the enrollment vector
   publishes every transcript input and `pnpm recipient:check` reconstructs the artifact from them alone;
   **`FU-13`'s remaining homes landed 2026-08-28 at the `S0-3` return** — §15 row 3's cell and the record
   vectors state the ratified count and scope, and `pnpm admission:check` refuses their restoration as byte
   rules; `FU-14` rides `S0-8`, and `FU-15`/`FU-16` were the hygiene item.

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
   chain terminates at a permitted root for its guard; ten joints were declared open as built with their
   blocker and return, six more computing as blocked through the member-key home (the `S0-2` return flipped
   the four member-key entries: six open, none blocked-through — the live count is always the checker's,
   never this file's); an **undeclared** dangling or
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
   schedule. The `S0-2` return inverted `FU-09`'s (2026-08-28): the commit carries the ratified fence, the
   marker advance finalizes the outgoing ledger, and the reproduction's schedule now asserts the permanent
   negative. The `S0-3` return inverted the last two the same day: the write path stages before it promotes,
   so `FU-08`'s kill point holds nothing to lose, and the store derivation binds the store identity, so joint
   1's per-key counts are their own counters — each on the reproduction's own schedule, with the pre-return
   worlds kept as detected negatives. All three windows now assert their repairs — and the `S0-4` return
   added the class's fourth (`FU-10`'s reserve-to-spool crash at `PositionCounter`) to the same file the same
   day, scheduled and inverted in one motion, with the counter-only world kept as the detected negative.
4. **Stage returns — the `S0-1` return first, then the security returns in dependency order.** Reordered
   2026-08-28, for item 3's own reason: a repair that ignores its class reintroduces the class, and the
   census is class 3's instrument — it belongs before the six returns that churn the corpus it classifies,
   not sweeping up after them. **The `S0-1` return is done (2026-08-28), and its gates re-ran green** —
   `pnpm check` end to end with the walker in it, `pnpm build` with the corrected scanner. It landed the
   standing census over all 46 documents and the recursive walker with its computed status projection —
   `remediation:status` (`remediation:check` in `pnpm check`), checked both directions against this file's
   per-decision claims, which makes every later return's handoff mechanically verified instead of
   hand-maintained — superseded `corrected-end-state.md` with the `S0-9` input-list swap in one commit,
   and landed round 1's origin-scanner correction (`+` left `originOf`'s discard set; the Google Fonts
   case now fails by name) and the `status:check`/`trace:check` claim narrowings, with the convicted
   sentences refused as byte rules: `P-5` falsifiers 15–22 paid, falsifier 20's receipt mechanism staying
   `S0-8`'s design exactly as the record reserves it. A 22-mutation battery caught 22. The per-record
   homes-agree readbacks (`P-1` falsifier 19's and `P-3` falsifier 22's checkers) stay with their owning
   returns and `S0-8`, where the consolidations they read exist. **The `S0-2` return is done (2026-08-28),
   and its gates re-ran green** — `pnpm check` end to end, now carrying `recipient:check`. It landed `FU-01`
   (the factor-carried bootstrap verifier: `recovery_state_digest` commits `bootstrap_signer`, acceptance
   derives the verifier only from the factor-opened state, replacement rotates it, and the retired signer is
   refused by the rotated commitment), `FU-05` (every transcript input published; the artifact reconstructs
   from published inputs alone, in the gate), `FU-09`'s interface half (`A-schemas.md` §4 step 5 and §5
   carry `P-3`'s ratified fence; the scheduler's reservation-fence reproduction inverted with its schedule
   kept, `P-3` falsifiers 19–20 finishing at `S0-3`), and `P-1`'s falsifiers 12–19 — the member triple, the
   named approver and the real lookup in §13.2/§13.5 and the transition vectors, §13.8 finally carrying the
   `RecoveryBootstrap` construction §13.2 cites (round 1 `D-3` closed), the bootstrap→certified-set
   composition run in the vectors, the six enrollment states as a crash model with the sibling-successor
   race serialized (`test/enrollmentStates.test.ts`), and `pnpm recipient:check` as falsifier 19's readback.
   A 12-mutation battery caught 12. The map's four member-key entries flipped: 6 joints stay open, none of
   them class 1's recipient-authority carriers. **The `S0-3` return is done (2026-08-28), and its gates
   re-ran green** — `pnpm check` end to end, now carrying `admission:check`. It landed the `K_store` scope
   (the derivation binds the `store_id` minted beside the `SeqCounter` — one key per counter — with the
   `wrong-store-subkey` and `record-aad-only-store` negatives published and the two-device reproduction
   inverted), `FU-08` (the refusal path is stage-and-promote, Stage A's reserved selection: the document
   waits for its carrier, the mark is read by the forced flush, `S-6`'s two green mutations are permanent
   negatives, and no kill point on the path shows a document ahead of durable state), `FU-09`'s finish (the
   write-admission machine consolidates the fence: `commitReserved` aborts a stale reservation where the
   commit lands), `FU-13`'s remaining homes (§15 row 3's cell and the record generator's rule text state the
   ratified count and scope), the AEAD census grown from its homes (`k-key-envelopes`, `k-index`; the sweep
   widened to sealed constructions; **`K_cp`'s absence a declared, checker-policed debt owed at the `S0-5`
   return**, since its homes state neither counter nor discipline and a checkpoint's key cannot narrow to a
   store), and `pnpm admission:check` as `P-3` falsifier 22's readback. An 18-mutation battery caught 18.
   The map's `k-store` entry flipped: 5 joints stay open, none of them class 2's storage carriers. **The
   `S0-4` return is done (2026-08-28), and its gates re-ran green** — `pnpm check` end to end. It landed
   `FU-06` (the refusal's subject is five fields, the fifth the refused envelope's own referenced epoch, and
   the verifier resolves from the lineage's certification in force — never from the answer, never *an epoch
   it holds*; permanence binds the `Refuse` message, so the licence survives an ordinary `K_accept` rotation;
   `refusal-under-a-retired-epoch-key`, `refusal-for-another-epoch` and `refusal-for-another-workspace`
   published as genuine-signature negatives over a published lineage whose subject epoch and tip
   certification deliberately differ) and `FU-10` (`Reserve` stages the spool row in the grant's own
   transaction — a counted position with no durable identity cannot exist — and a `reserved` row is occupied
   at recovery by a fresh first attempt, the row itself durable proof nothing was ever sent; the
   unexecutable closed-by-refusal branch retired; the window scheduled through the composed model with the
   counter-only world kept as the detected negative, and recovery counting its fresh licence where the mint
   seals when the marker moved). An 18-mutation battery caught 18. The map's `position-refusal` entry
   flipped: 4 joints stay open, none of them this stage's. **Next, the remaining security returns, in
   dependency order**: `S0-5` (`FU-11`, and the `k-checkpoint` census entry) and `S0-6` (`FU-02`, `FU-03`
   with TRD §14.4) → `S0-7` (`FU-04`, `FU-12`).
   **Each return flips its authority-map entries and inverts its scheduler reproductions** — editing a
   pinned home fails `authority:check` until the entry is re-read
   and re-pinned or flipped — and, now that the census is landed, edits a pinned record only as a dated
   addendum under a re-pin and gives every new file a standing, or `remediation:check` fails the gate. The
   walker's friction is the map's, designed.
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
cd /Users/thomasingalls/Code/done/.claude/worktrees/s0-4-return-35bb60 && pnpm install --frozen-lockfile && pnpm vectors:check && pnpm test
```

That establishes the baseline. **The decision sprint, the two structural artifacts, and the `S0-1` through
`S0-4` returns are complete** (queue items 2–3 and the front of item 4, 2026-08-28): the authority map with
`pnpm authority:check`, the storage scheduler with its composed model — all four of its reproductions now
inverted — the standing census with `pnpm remediation:check`, the recipient-authority readback with
`pnpm recipient:check`, and the write-admission readback with `pnpm admission:check` — all in the gate.
Then read both dispositions end to end, read the map's four open entries — they are the executable form of
what the dispositions describe — run `pnpm remediation:status` for where every decision stands and what each
return owes, and start the **`S0-5` return**: `FU-11` (checkpoint evidence gains its certified-recipient
eligibility and cardinality input and a durable staged install machine — producer self-admission refused
where a second eligible client exists, partial install activating neither content nor heads, the actual
second-newest fallback exercised; the selected `P-8` branch may remain) and **the `k-checkpoint` census
entry** (`K_cp`'s counter or discipline selected from the checkpoint homes and the declared absence struck —
the checker holds the declaration mechanically until then). `S0-6` (`FU-02`, `FU-03` with TRD §14.4) is the
other open head of the queue and feeds `S0-7`'s composition. A repair that ignores its class reintroduces
the class, and all three class instruments now fail on that rather than waiting for a review: a return is
not done until its map entries flip, its reproductions invert, and the census stays classified.

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
with four joints *declared open* since the `S0-4` return flipped `position-refusal` (the `S0-2` return
flipped the four member-key entries; the `S0-3` return, `k-store`), the sweep covering AEAD constructions
beside signatures, and `K_cp`'s absence held as a declared, checker-policed debt owed at `S0-5` — it is the
class-1 and class-2 ledgers staying honest, not the classes closed. Since the
`S0-1` return it also carries `remediation:check`, whose green line is likewise its printed scope: 46
documents classified, 19 record pins byte-current, the status homes agreeing — the class-3 ledger staying
honest, existence and byte rules, never an execution receipt. Since the `S0-2` return it also carries
`recipient:check`: the recipient-authority homes agree and the enrollment artifact reconstructs from
published inputs — byte rules and one reconstruction, per its printed scope. Since the `S0-3` return it also
carries `admission:check`: the write-admission homes state the ratified scope, carrier and fence, the retired
sentences stay dead, and the record vectors — two stores, two subkeys — reconstruct from published inputs,
per its printed scope. What the green gate does **not** mean: `FU-14`
is repaired. Traceability still credits command-text reachability rather than execution receipts — it now
*says* so wherever it says anything, and the receipts land at `S0-8` — and `wasm:stale` is still in no gate
(`RC-9`). Lint and format are opt-in (`pnpm lint` is correctness-only and currently clean; `pnpm format`
covers code files only, with pre-existing drift left as found).

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
