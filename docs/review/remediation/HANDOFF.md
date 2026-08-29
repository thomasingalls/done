# Handoff — Stage 0 remediation execution

**Standing:** home — the one home of the open queue; read back by `pnpm remediation:status`, which checks
each per-decision claim below — its ratification date, its ratified option, and its owed falsifier ranges —
against the decision records in both directions (the option facet joined at the `S0-9` round-3 return,
`R3-1`; prose beyond those facets is this file's own to keep honest).

**Updated:** 2026-08-29 · **Branch:** `claude/stage0-remediation` · **Base:** `9edd930` (the reviewed tip)

Read this first. [`action-tree.md`](./action-tree.md) is the plan; the three `S0-9` dispositions are the
verdicts; **this file is the one home of the open queue** — what state the work is in and what is ready to
pick up, in order. An earlier copy of this file disagreed with the dispositions on two points (the X25519 debt
gate, and "outstanding decisions: none"); each time, the disposition won. When this file and a disposition
disagree, the disposition is right and this file is the thing to fix.

## Where the work lives

| | |
| --- | --- |
| Branch | `claude/stage0-remediation`, 93 commits off `9edd930` through the `S0-10` disposition workflow and Stage 0 closure (`a6ea5fa`), all signed — later commits ride after that anchor, so this sentence cannot silently age. Folded 2026-08-29: this branch carries the tip directly at its own checkout (`.claude/worktrees/stage0-repairs`); the intermediate session branches and worktrees — the returns, the drafts, the challenge sandboxes — are removed, their every report preserved in `S0-9/`, and the last session's seat departs with its session. The superseded review branch `claude/remediation-findings-review-997ab5` stays until acceptance, per the row below |
| Contains | the review workspace (`docs/review/`, cherry-picked), the repairs, the decisions, all three `S0-9` challenge rounds, and the `S0-10` closure — the paid debt, the recorded bar, the authorized dispositions |
| Not on it | nothing — this branch is the whole picture, deliberately |
| Superseded | `claude/remediation-findings-review-997ab5` holds the review workspace at its original SHAs. Redundant once this branch is accepted |

The review branch forked at `dbfd01f`, **27 commits before the tip it reviews**, so it never contained the
files under review. That is why the repairs could not be made there and why the two were consolidated.

## The boundary changed, deliberately, and that is the thing to know

The review's own sessions carried a standing constraint: *do not change production code, PRD/TRD, selections,
generators, vectors, tests, requirements, or finding dispositions.* **This work changes all but the last of
those, on the user's explicit instruction**, because it is no longer a review — it is the remediation the
review's plan calls for.

**Finding dispositions moved 2026-08-29, under the authorization `S0-10` reserved.** The user formally
authorized the disposition workflow with the falsifier-executes evidence standard; the lifecycle gained
`repaired` (`docs/review/README.md` §Finding lifecycle, policed by `review-status.mjs` with its dated-line
rule), and the 28 current design/closure findings moved `validated → repaired`, each naming in a dated
Disposition line the falsifiers that refuse its defect's return. The 5 gate-class findings stay `validated`
beside their registered debts, the 4 historical stay `validated` for `H-1`, and
[`end-state-materiality.md`](./end-state-materiality.md) still reads 19/9/5/4 — class is closure-effect, not
status, and that record is untouched. `pnpm review:check` reads 9 validated · 28 repaired.

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

**`S0-9` has now run three times. Rounds 1–2, against `5923f51`, failed the package. Round 3, against
`cfc6b70` with the changed perspective the queue demanded, found the seven constructions sound and failed
one narrow axis at the closure instrument — repaired the same day at the round-3 return. The `S0-10` arrival
paid the registered X25519 debt (2026-08-29): the dated readback stands in TRD §10.11's table, held to the
payment record in both directions by `pnpm debts:check`, and the gate consult lifts. The disposition
workflow ran later the same day under the user's formal authorization — 28 current findings `repaired`
under the falsifier-executes standard, the deferred five and historical four staying `validated` — and the
closure recording landed in `docs/completed.md` and `docs/progress.md`, in that order. **Stage 0 is closed,
on the recorded bar: author-independent seven times, family-independent once, human-independent never.**

- **Round 1** — four parallel non-author challengers: [`S0-9/DISPOSITION.md`](./S0-9/DISPOSITION.md). Every
  root cause has at least one failing axis, two high findings reopen at their decisions, and one live
  construction defect — `K_store` derives identically on every device, so the §6.1 budget bounds no key —
  returns to `P-3`.
- **Round 2** — three serial non-author challengers, reconciled:
  [`S0-9/FOLLOWUP-DISPOSITION.md`](./S0-9/FOLLOWUP-DISPOSITION.md). Sixteen further blockers, `FU-01`–`FU-16`,
  four of them high. The strongest convergence across all seven challengers is the zero-handoff retirement
  deletion (`FU-04`); the Local-archive wrap (`FU-02`) converges across both rounds.
- **Round 3** — one non-author challenger from a **different model family** (Claude Fable 5, Mythos-class;
  the prior seven reads were one family), 2026-08-29 against the regenerated corpus:
  [`S0-9/ROUND-3-DISPOSITION.md`](./S0-9/ROUND-3-DISPOSITION.md), with its fresh 21-probe battery committed
  beside it ([`S0-9/round-3-battery.mjs`](./S0-9/round-3-battery.mjs)). The constructions survived every axis
  run — byte-level LP/domain-tag review, the map's guard rules, the retention and reseed inversions, the
  importer's order probes — and 19 of 19 expected-fail probes were caught. What failed was the instrument
  class itself, narrowly: `R3-1`, the per-decision claims checked thinner than both homes said (a drifted
  ratified option rode every gate check green); `R3-2`, the map's census sweep omitting `S0-3/A-schemas.md`;
  `R3-3`, the gate reading `docs/trd.md` by case-folding luck. **The round-3 return landed all three the
  same day** — the option facet joined the both-directions comparison with its printed line narrowed to
  scope, the sweep closed over all seven stage documents, the paths took their exact case — and the two
  blind-spot probes are inverted in the committed battery as permanent negatives. `R3-4` (member-entry
  uniqueness unstated at the class-1 core) is recorded low, owed to `S0-2`'s homes before `L-2` implements a
  verifier, and does not block Stage 0 closure.

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
  reconstruction (19) — and the `CertifiedSet` AAD registration landed at the `S0-8` regeneration
  (2026-08-29): eight fields under the identity audit, round 1 `D-2`'s five unisolated fields each dying to
  its own declared negative.
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
  (22) — `FU-13`'s §15 row 3 and record-vector homes landed the same day, and the matrix receipts landed
  at the `S0-8` regeneration (2026-08-29): the traceability matrix credits a check-script claim only by its
  execution receipt.
- **`P-4` is ratified (2026-08-28): option B, with intrinsic acceptance.** Every `retire` intent carries the
  erasure acceptance in its signed payload; the destructive boundary is `retired_at + RETENTION`, written once
  at the `cause` overwrite; ceiling erasure terminates in `deleted-without-receipt`, never a state a reader
  can take for a receipt. **Nothing remains owed: the `S0-7` return landed the record's falsifiers 11–19 on
  2026-08-29** — `C-7`'s born-elapsed reproduction refuses `no-handoff` at the birth instant with all six
  classes present and is the model's permanent negative (11), the property run over arbitrary `stopped_at ≤
  retired_at` pairs finds no earlier execution in any order (12), the boundary is written once at the `cause`
  overwrite with a replayed retirement recomputing nothing (13), a ceiling erasure terminates in the sixth
  retention state `deleted-without-receipt` while the receipt-authorized run stays `cleared` (14), the
  acceptance-less mint refuses at creation in both the model and the transition vectors with the in-transit
  strip a published digest difference (15), the entitlement signer moves the boundary in neither direction in
  the challenge's own order (16), the gate and the model state one published six-class domain with the
  five-entry copy dead (17), every pre-boundary `S0-6` negative still fails (18), and `pnpm retention:check`
  is the homes-agree readback over eight boundary homes with the superseded sentences refused as byte
  rules (19) — composed with `S0-6`'s `TerminalHandoff` exactly as the record reserves.
- **`P-5` is ratified (2026-08-28): option A at both joints, with the computed status projection.** Every
  document under `docs/review/remediation/` declares its standing — `home | projection | record |
  superseded` — and a recursive walker refuses what it cannot classify; where the corpus stands is computed
  from the decision records' own headers and checked both directions against this file's per-decision claims,
  the `review:status` shape, never maintained beside them; and `corrected-end-state.md` is superseded — it
  opens by naming its successors and leaves `S0-9`'s input list, which round 3 replaces with the ratified
  records and the regenerated corpus. The record's own stale status line and its `FU-15` gate parenthetical
  are annotated in place. **Nothing remains owed: the `S0-1` return landed the record's falsifiers 15–22 on
  2026-08-28** — the census walker and computed projection are `pnpm remediation:status`
  (`remediation:check` in `pnpm check`), `census.json` pins all twenty-one record-standing documents (the
  `S0-10` record joined 2026-08-29; the live count is the checker's, as ever), the
  supersession header and input-list swap landed in one commit, and the `originOf` correction and both
  claim narrowings are in — and falsifier 20's receipt mechanism landed at the `S0-8` regeneration
  (2026-08-29): every check script writes an execution receipt at exit, and `trace:check`, now the gate's
  last step, credits only receipts that are present, passing, byte-current and tree-current.
- **`RC-9` is ratified (2026-08-28): option A at both joints — drafted fresh and ratified the same day,
  never a reopening, because the decision never existed.** Every deferred property is one entry in one debt
  manifest — owner, one blocking gate, required artifact, falsifier, expiry, hashed inputs — that blocks its
  gate while unpaid, expired or input-changed, and what-blocks-what is computed from the manifest on demand;
  the mechanism is the lineage review's regime — structured homes, hash pins, a computed status view —
  adopted a third time after `P-5`'s census, extended by the verb the prior instances never needed: block.
  The source↔blob binding splits at the toolchain line: hashes stamped into `seal.generated.ts`'s header,
  compared toolchain-free in `wasm:verify`, with provenance attestation staying a registered `L-4` debt.
  Record: [`decisions/RC-9-later-gate-governance.md`](./decisions/RC-9-later-gate-governance.md). **Nothing
  remains owed: the `S0-8` regeneration landed the record's falsifiers 1–12 on 2026-08-29** — the manifest
  is [`debts.json`](./debts.json), six entries with owner, one gate, artifact, falsifier, expiry, typed
  payment and hashed inputs, validated by `pnpm debts:check` in the gate; a gate arrival consults
  `check-debts.mjs --gate <name>` and blocks while a debt is unpaid, expired or input-changed; and the
  source↔blob header binding compares toolchain-free in `pnpm wasm:verify`, drift detection only, with the
  provenance residue registered as the `wasm-toolchain-provenance` entry.
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
   attacks published as genuine-signature negatives — **and `FU-11` returned 2026-08-28 at the `S0-5`
   return**: the admission's verifier resolves from the certified set's member entry at the manifest's epoch,
   an uncertified credential refuses at the lookup before any signature runs, and the producer's
   self-admission beside a second eligible client — the exact acceptance `ST-06` convicted — is refused by
   cardinality with its world kept and published — **and `FU-02` and `FU-03` returned 2026-08-29 at the
   `S0-6` return**: the archive identity carries a manifest-signing half under the same factor, so the
   never-established manifest verifies only under the signing key the code-sealed commitment commits — the
   composed importer refuses the fresh mint at the commitment, before the signer is consulted and before any
   unwrap — and the deletion gate re-verifies the catch-up transcript its receipt commits: signer resolved
   from the certification in force, never the receiver; links chained from the receiver's own prior head to
   the terminal head; absences named, the signed count checked against the list — **and `FU-04`, the class's
   last member, returned 2026-08-29 at the `S0-7` return**: the destructive boundary is the retirement's own
   (`retired_at + RETENTION`, written exactly once at the `cause` overwrite, never earlier than an inherited
   deadline), the clock executes only the owner's intrinsic erasure acceptance, and a boundary erasure
   terminates in `deleted-without-receipt` — elapsed time is never an authority, at this joint or any other.
   **The map now reads 0 open** (the live count is always the checker's): the class-1 ledger closed entry by
   entry at the returns, never by edict.
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
   the detected negative. **And `FU-12`, the class's last member, returned 2026-08-29 at the `S0-7`
   return**: the reseed branch set is durable, the stale second survivor is refused with its session held
   and joins after re-deriving against the world the winner left, the derive-to-commit window runs on the
   scheduler with a kill and a second writer inside, and the branchless pre-return machine is kept as the
   detected negative. The class is closed.
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
   back by `scripts/check-authority-map.mjs` — `pnpm authority:check`, in `pnpm check`. 34 entries as of the `S0-8`
   regeneration — the live entry count, like the open count, is the checker's, and round 3 caught this line
   still saying 31 (`R3-1`'s second instance); every
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
   day, scheduled and inverted in one motion, with the counter-only world kept as the detected negative. The
   `S0-5` return added the install window (`FU-11`) the same way: the content-commit-to-activation boundary
   takes a kill and a second writer, the pre-return fused installer is refused with the `FU-08` diagnosis,
   and the second-newest fallback is asserted as an install receipt, never opener arithmetic. And the `S0-7`
   return added the class's sixth and last (`FU-12`'s divergent-reseed compare-and-set) the same way: the
   derive-to-commit window takes a kill and a second writer, the stale loser's session is held rather than
   lost and joins after re-deriving, and the branchless pre-return machine — acceptance that replaces — is
   kept as the detected negative.
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
   flipped: 4 joints stay open, none of them this stage's. **The `S0-5` return is done (2026-08-28), and its
   gates re-ran green** — `pnpm check` end to end. It landed `FU-11` (the admission's authority is an input:
   the verifier resolves from the certified set's member entry at the manifest's epoch, an uncertified
   credential refuses at the lookup before any signature runs, a producer self-admission beside a second
   eligible client is refused by cardinality — the exact acceptance `ST-06` convicted, inverted with its
   world kept — `self_admitted` equals the derived relation in both directions, and the eligibility inputs
   are published with the vectors; install is a staged machine whose durable record drives two commits —
   content into its slot, visible to nothing, then one activation flipping content root and head baseline
   together or not at all — with the window demonstrated under a kill and a second writer, the fused
   pre-return installer refused with the `FU-08` diagnosis, recovery completing or rolling back and never
   serving a mixture, trim gated on the active admitted tuple, and the second-newest fallback actually
   installed under all three loss modes) and **the `k-checkpoint` census entry** (`K_cp` derives per seal —
   `cp_salt[16]`, one message per derived key, §13.8's discipline at the fifth subkey, because a checkpoint's
   key must open on every device and so can narrow to a seal but never to a store; the `wrong-cp-salt`
   negative published and the declared absence struck in the same edit, the checker holding both directions).
   An 18-mutation battery caught 18. The map's `checkpoint-admission` entry flipped: 3 joints stay open, none
   of them this stage's; `checkpoint-manifest` and `attribution-record` re-pinned with their rules unchanged.
   `P-8`'s reopen invitation was read and declined — the portable-witness obstacles have not cleared, so the
   selected branch stands. **The `S0-6` return is done (2026-08-29), and its gates re-ran green** — `pnpm
   check` end to end. It landed `FU-02` (the archive identity has two halves under one code: an Ed25519
   manifest-signing keypair joins the X25519 encryption keypair in the envelope, `auth_root` for a
   never-established package is the digest of both public halves, and the manifest verifies only under the
   committed signing half — the verifier resolved through the factor, never read from the package; the
   published package runs the composed importer and reconstructs from its published inputs, the fresh mint
   is refused at the commitment with the order observed by probes, the second door — genuine root,
   uncommitted signing key — has its own negative, the pre-return device-signed acceptance is kept as the
   permanent negative, and the archive envelope joined the AAD coverage audit: 197 fields suite-wide, 44
   package negatives) and `FU-03` (the `TerminalHandoff` catch-up is a construction the gate re-verifies:
   `CatchupTranscript` with `source_epoch`, ordered links and named absences, its full bytes committed by
   `catchup_digest`; the signer resolves from the lineage's certification in force — `FU-06`'s rule, with
   the receiver's own genuine signature refused — the chain runs from the receiver's authenticated prior
   head to the terminal head with three separate refusals for chaining from elsewhere, a broken link and
   stopping short, and the count the receiver signs must equal the enumerated list; the pre-return
   endpoints-hash acceptance and the old positive's count-without-a-list are both kept as permanent
   negatives, and the accepted receipt publishes its transcript). An 18-mutation battery caught 18. The
   map's `local-archive-anchor` and `terminal-handoff` entries flipped: 1 joint stayed open — `S0-7`'s
   `destructive-boundary` — none of them this stage's; `package-manifest`, `terminal-lineage-record` and
   `k-code-sealed-envelopes` re-pinned with their rules unchanged. `P-6`'s reopen condition never
   triggered — the identity grew a half under the same factor, the carrier completed rather than changed —
   so the decided direction stands. **The `S0-7` return is done (2026-08-29), and its gates re-ran green** —
   `pnpm check` end to end. It landed `FU-04` (`P-4` falsifiers 11–19, composed with `S0-6`'s
   `TerminalHandoff`: the destructive boundary is the retirement's own — `retired_at + RETENTION`, written
   exactly once at the `cause` overwrite, never earlier than an inherited deadline, a replayed retirement
   recomputing nothing — so `C-7`'s born-elapsed reproduction refuses `no-handoff` at the birth instant and
   the property run over arbitrary `stopped_at ≤ retired_at` pairs finds no earlier execution in any order;
   every `retire` payload carries the erasure acceptance in its signed bytes, the acceptance-less mint a
   published transition negative and the in-transit strip a published digest difference; a boundary erasure
   terminates in the sixth retention state `deleted-without-receipt`, distinct from `cleared` in the mark
   itself, with the receipt-authorized run staying `cleared`; the entitlement signer moves the boundary in
   neither direction, in `C-7`'s own order; and the gate and the retention model state one published
   six-class deletion-authority domain — the five-entry copy dead — with `pnpm retention:check` grown into
   the one-domain and homes-agree readbacks over eight boundary homes, superseded sentences refused as byte
   rules) and `FU-12` (the reseed branch set is durable: the stale second survivor is refused with its
   session held, re-derives against the advanced revision, and joins the world the winner left — on the
   scheduler, with a kill and a second writer inside the derive-to-commit window, the branchless pre-return
   machine kept as the detected negative). An 18-mutation battery caught 18. The map's
   `destructive-boundary` entry flipped — **the last open joint: the open count reads 0, entry by entry at
   the returns** — with `retention-mark`, `reseed-session`, `terminal-handoff`, `package-manifest`,
   `terminal-lineage-record` and `local-archive-anchor` re-pinned, their rules unchanged (the retention
   mark's bound gaining the boundary immunity). The security returns are complete; the `S0-8`
   regeneration followed 2026-08-29 (item 5), and `S0-9` round 3 with its same-day return followed the same
   day (item 6): **`S0-10` (queue item 7) arrived 2026-08-29 — the debt paid, the bar recorded; its
   remainder is the separately authorized disposition workflow**.
   **Each return flips its authority-map entries and inverts its scheduler reproductions** — editing a
   pinned home fails `authority:check` until the entry is re-read
   and re-pinned or flipped — and, now that the census is landed, edits a pinned record only as a dated
   addendum under a re-pin and gives every new file a standing, or `remediation:check` fails the gate. The
   walker's friction is the map's, designed.
5. **`S0-8` regeneration — done 2026-08-29, and its gates re-ran green** (`pnpm check` end to end, in its
   new order: `trace:check` is now the gate's last step, so every receipt exists before the matrix credits
   it). Addendum: [`S0-8/README.md`](./S0-8/README.md). What landed, item by item as queued: **`FU-14`'s
   gate receipts** — every check script writes an execution receipt at exit (`scripts/lib/receipts.mjs`,
   `.receipts/`, untracked on purpose: a commit cannot carry proof that checks ran on your machine)
   recording its own bytes, its exit and the tree, and `check-traceability.mjs` credits a script-carrier
   claim only by a receipt that is present, passing, byte-current and tree-current — reachability is dead
   as a credit, and a failure is receipted too (`RC-9` falsifier 1's demonstration reads the receipt, not
   the shell). **The five matrix limits** — relation's checkable faces (recency refuses the demonstrated
   mutation; identity binds declared negatives to their fields), recency against the reviewed tip
   `9edd930` (which convicted ten live tags on negatives that ran unchanged while their defects existed —
   across attribution, checkpoint, device-lock, record-format and transition — all ten dropped, every
   affected finding still covered by post-tip evidence), liveness via the receipts, all three scans
   recursive with out-of-carrier claims refused loudly, and the population pinned in `census.json`
   (`findings_population`). **`FU-13`'s independent readback** rode the `S0-3` return as
   `pnpm admission:check`; the receipts now credit its execution. **`vectors:coverage` checks identity** —
   every negative claiming isolation declares `isolates: 'construction.field'` on the published entry (114
   declarations) and the cipher's rescue attribution must equal it exactly; swapped attributions fail.
   **The `CertifiedSet` construction registered** — eight fields through the audit's registry,
   byte-identical encoding, five new `aad-only-certified-set-*` negatives for round 1 `D-2`'s unisolated
   fields, 205 AAD fields now each isolated by its declared negative. **`RC-9`'s consolidation** — the
   `OWED` list grew into [`debts.json`](./debts.json): six entries (the five deferred properties and the
   migrated X25519 `S0-10` entry), each with owner, one blocking gate, required artifact, falsifier,
   expiry, typed payment and hashed inputs; `pnpm debts:check` joins the gate holding the entries, the
   gate-class census, the one-gate agreement (TRD §10.11, `action-tree.md`) and this file's claim in both
   directions; a gate arrival consults `check-debts.mjs --gate <name>` and blocks while a debt is unpaid,
   expired or input-changed; the refusal negatives live in `test/debtManifest.test.ts`; and the source↔blob
   header binding landed — one cargo regeneration stamped `seal.generated.ts` with the source hashes and
   toolchain string, `WASM_BASE64` byte-identical, and `pnpm wasm:verify` compares toolchain-free, drift
   detection only. The registered debts block: `L-1` — 1 (the plaintext cutover kill matrix) · `L-4` — 4
   (population, audit delta, provenance, append burst) — `pnpm debts` computes this and `debts:check` holds
   this sentence to it in both directions; the migrated X25519 entry was paid at the `S0-10` arrival
   (2026-08-29) and blocks nothing. A 21-mutation battery caught 21.
6. **`S0-9` round 3, with a changed perspective — done 2026-08-29, and the round-3 return landed the same
   day.** The bar was met two of the three named ways at once: a **different model family** (Claude Fable 5,
   Mythos-class — the prior seven reads were one family) ran **targeted adversarial property tests against
   the authority map** plus a byte-level construction review and a fresh 21-probe instrument battery.
   Verdict: [`S0-9/ROUND-3-DISPOSITION.md`](./S0-9/ROUND-3-DISPOSITION.md) — the constructions survive; the
   instrument axis failed narrowly (`R3-1` option-drift channel, `R3-2` sweep omission, `R3-3` path case)
   and the return repaired all three with the probes inverted; `R3-4` stays recorded for `S0-2`'s homes,
   low, non-blocking. The human-red-team bar remains open and unclaimed — `S0-10` records the bar exactly:
   author-independent seven times, family-independent once, human-independent never.
7. **`S0-10` — arrived 2026-08-29; two of its three duties are done, in order.** The X25519 dated readback
   is collected and paid: wpt.fyi's stable desktop runs executing §10.11's four operations on the four core
   engines, landed as the evidence table in TRD §10.11 beside the typed `payment_record` on the manifest
   entry, `pnpm debts:check` holding the two to each other in both directions and
   `node scripts/check-debts.mjs --gate S0-10` lifting — with Firefox's `deriveBits` rejection-edge misses
   recorded at the table's dagger note and the DHKEM layer's own all-zero abort named as the Stage-4
   consequence. The independence bar is recorded in its one home, [`S0-10/README.md`](./S0-10/README.md):
   author-independent seven times, family-independent once, human-independent never. **The third duty ran
   later the same day, formally authorized by the user in session**: the disposition workflow under the
   falsifier-executes standard — the lifecycle gained `repaired` with `review-status.mjs` policing its dated
   line, the 28 current findings flipped with Disposition lines naming their falsifiers, and the deferred
   five and historical four stayed `validated` — then the closure recording, in order: the Stage 0 entry in
   `docs/completed.md`, then `docs/progress.md`'s active slice moving to Stage 1 (`L-1`). Rows 18/19/21
   stay correctly open. **Queue item 7 is complete; Stage 0 is closed on the recorded bar.**
8. **`L-1`–`L-4` and `H-1`** are the rest of the plan and are outside Stage 0. `H-1`'s append-only ledger
   holds the four historical-only corrections, and `docs/decisions.md`'s stale *eighteen rows are selected*
   belongs to it rather than to a silent edit.

## The exact next command

```bash
cd /Users/thomasingalls/Code/done/.claude/worktrees/x25519-debt-bar-recording-3c0d10 && pnpm install --frozen-lockfile && pnpm check && pnpm review:check && node scripts/check-debts.mjs --gate L-1
```

That establishes the baseline, mints the execution receipts in one motion (`pnpm check`'s last step consumes
them, so the full chain is the baseline), runs the disposition readback, and then asks the one question the
queue is now at: the `L-1` consult, which **blocks today, correctly**, until the executed cutover kill
matrix is paid. What changed 2026-08-29: the `S0-10` consult **lifts** (`node scripts/check-debts.mjs
--gate S0-10`)
— the X25519 debt is paid into TRD §10.11's table with source, date and expiry, and `debts:check` holds the
table and the payment record to each other. **Queue items 1–7 are complete** — the decision sprint, the two
structural artifacts, the seven security returns, the `S0-8` regeneration, `S0-9` round 3 with its same-day
return, and the `S0-10` arrival and completion: the debt paid, the independence bar recorded in
[`S0-10/README.md`](./S0-10/README.md) — author-independent seven times, family-independent once (round 3),
human-independent never — the dispositions moved under the user's formal authorization, and the closure
recorded. The gate stands as before plus the new readback:
the authority map at **zero** open, the storage scheduler's six windows asserting their repairs, the standing
census comparing each claim's ratified **option** beside its date and owed ranges, the recipient-authority,
write-admission and retention readbacks, the debt manifest on exact-case paths with §10.11's evidence table
held to the payment record, the source↔blob binding inside `pnpm wasm:verify`, and the traceability matrix
crediting execution receipts — 28 of 28 current defects carrying a named falsifier. `pnpm remediation:status`
reads **nothing owed at any return**; `pnpm debts` computes what blocks the gates ahead (`L-1` — 1 ·
`L-4` — 4; the `S0-10` entry is paid).
**Next is `L-1`** — Stage 1's encrypted local store and legacy cutover; `docs/progress.md` is the
active-slice home now, and `action-tree.md`'s node is the plan. It arrives against its registered
kill-matrix debt: `node scripts/check-debts.mjs --gate L-1` names it, and design prose is refused as
payment. `pnpm review:check` is the disposition readback (9 validated · 28 repaired). `R3-4` (member-entry
uniqueness, low) rides to `S0-2`'s homes before `L-2` implements a verifier. The X25519 observation expires
2027-02-28; from that day `debts:check` refuses it exactly as a missing one, and the re-measurement is
review 3b's offered pass.

## Five things that will bite you

**Receipts go stale by design — `pnpm check` is the fix, not a workaround.** Every check script writes an
execution receipt (`.receipts/`, untracked) recording its bytes and the tree it ran against, and
`trace:check` refuses a receipt from an edited script or a changed tree. So after **any** edit, a standalone
`pnpm trace:check` fails with *receipt was written against another tree* — that is `FU-14`'s repair working,
not a bug: yesterday's run does not vouch for today's state. Run the gate (or the affected checks and then
`trace:check`); a fresh clone earns its credits the same way, and the two build-gate receipts
(`check-budget`, `check-origin-isolation`) are minted by `pnpm build`, which `test:geometry`'s web server
runs inside `pnpm check`. If the matrix itself changed, regenerate it (`pnpm trace`) — the matrix file is
excluded from the tree digest precisely so the projection can regenerate without invalidating the receipts
it projects.

**Never reformat the markdown.** Reflowing the TRD **breaks the §15.1 register parser**, which silently takes
`generate-suite-vectors.mjs` down with it. Since 2026-08-28 the formatter cannot reach it — `.prettierignore`,
which oxfmt reads, excludes `*.md` — so the standing rule is: do not remove that ignore entry, and do not
format documents by any other route. After any code formatting, re-run `pnpm typecheck` — a lint-driven
`toSorted()` broke typecheck once already.

**`pnpm check` passes now — know exactly what that means.** On 2026-08-28, on the user's instruction, lint and
format left `pnpm check`; the gate is typecheck plus the evidence suite, and it passed end to end for the
first time in this branch's history that day. Since queue item 3 it also carries `authority:check`, and that
green line means exactly its printed scope: the map's chains resolve and its pinned homes are byte-current,
with the open count at **zero** since the `S0-7` return flipped `destructive-boundary`, the last open joint
(the `S0-2` return flipped the four member-key entries; the `S0-3` return, `k-store`; the `S0-4` return,
`position-refusal`; the `S0-5` return, `checkpoint-admission`; the `S0-6` return, `local-archive-anchor` and
`terminal-handoff`),
the sweep covering AEAD constructions beside signatures, and the `k-checkpoint` entry entered at the `S0-5`
return with its declared absence struck — the checker still refusing the entry and a declaration coexisting,
or both missing — it is the
class-1 and class-2 ledgers staying honest: their members returned at their returns, and the checker is what
keeps the closure from silently reopening. Since the
`S0-1` return it also carries `remediation:check`, whose green line is likewise its printed scope: 48
documents classified, 21 record pins byte-current, the status homes agreeing — the class-3 ledger staying
honest, existence and byte rules, never an execution receipt. Since the `S0-2` return it also carries
`recipient:check`: the recipient-authority homes agree and the enrollment artifact reconstructs from
published inputs — byte rules and one reconstruction, per its printed scope. Since the `S0-3` return it also
carries `admission:check`: the write-admission homes state the ratified scope, carrier and fence, the retired
sentences stay dead, and the record vectors — two stores, two subkeys — reconstruct from published inputs,
per its printed scope. Since the `S0-7` return, `retention:check` also runs the one-domain and homes-agree
scans: the published deletion-authority domain, §14.7's table and the model agree on one six-class order,
and eight destructive-boundary homes carry the ratified sentences with the superseded ones refused — byte
rules, per its printed scope; the boundary's execution semantics are the model tests' to prove. Since the
`S0-8` regeneration it also carries `debts:check` — the manifest's entries, pins, gate-class census and
both-directions agreement, per its printed scope; the *blocking* verb lives at `--gate <name>`, which is
the consuming gate's to run — and `wasm:verify` now holds the source↔blob binding: the crate's source
hashes match the generated header, drift detection only, so round 1's edit-`lib.rs`-rebuild-nothing
mutation fails the normal gate (`wasm:stale` stays manual and cargo-bound for full byte reproduction; the
binding is what moved in-gate). And the gate's **last** step is now `trace:check`, which credits a
check-script claim only by the execution receipt the earlier steps just minted — `FU-14` is repaired, and
the matrix's carrier table states the receipt rule where it used to disclaim reachability. Lint and format
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
