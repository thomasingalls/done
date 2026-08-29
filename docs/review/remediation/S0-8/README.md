# `S0-8` — regenerated evidence and the traceability matrix

**Standing:** record — speaks of `5923f510fd9ac3c1cd809e9bec352a7f73751492`, the tip at which the evidence suite last ran under `S0-8`; pinned in
`census.json`, so edits land only as dated addenda under a re-pin.

**Started:** 2026-08-27 · **Inputs:** [`P-5`](../decisions/P-5-closure-authority.md) — decided; `S0-1` through
`S0-7` — all complete

The action that checks the other seven. It regenerates every vector against the repaired generators and builds
the matrix from each repaired finding to the falsifier that refuses it — which the plan has wanted since the
first session and which nothing collected, because the mappings were written per action, in prose, in seven
different table shapes.

## Findings this action must close

**None.** `S0-8` closes no finding of its own. What it owes is the property every other action's closure rests
on: that the falsifier each one claims exists, names the finding it refuses, and still runs. A finding whose
falsifier this cannot resolve was never closed — it was asserted.

## The failure mode this had to avoid

Writing the table is Branch B, and `P-5` rejected it. A written matrix is **a second copy of every mapping**,
and this repository has already shipped one of those: `f-992bc91-network-carrier-registry-stale` is a registry
that called a selected carrier unselected and passed every check for four commits, because the check compared
the registry to itself.

`RC-8C` states the rule, and it is the whole design:

> One home per fact; every consumer reads the home; where two artifacts must agree, the agreement is checked in
> both directions by something that is neither of them.

So the claim lives **at the evidence**, [`traceability.md`](../traceability.md) is generated from it, and
[`check-traceability.mjs`](../../../../scripts/check-traceability.mjs) — which is neither the claim nor the
matrix — checks both directions.

## Stages

| | Stage | Output | Status |
| --- | --- | --- | --- |
| **A** | The population, reconciled three ways | no artifact; the reconciliation is section 1 of the checker | **done** — it agreed on the first run |
| **B** | The claim grammar and its two generator carriers | [`scripts/lib/traceability.mjs`](../../../../scripts/lib/traceability.mjs) | **done** |
| **C** | Tag the evidence | 85 claims across 22 files | **done** |
| **D** | The checker and the generated matrix | `scripts/check-traceability.mjs`, `pnpm trace:check`, wired into `check` | **done** — 19 mutations, all caught |
| **E** | Regenerate and re-verify | 16/16 generators, 371 tests, five checkers | **done** |

### Stage A — the population agreed, which was not the interesting part

`S0-8`'s acceptance says **no shared producer inventory is the sole completeness oracle**, and that is the
difficulty in one line: a matrix that decides which findings it must cover is always complete. So the population
is read three ways and all three must agree before anything else runs.

| Source | What it states | Count |
| --- | --- | --- |
| `docs/review/findings/*.md` | the review's own records, one file per finding, frontmatter id and severity | 37 |
| [`end-state-materiality.md`](../end-state-materiality.md) | four closure-effect classes | 37 — 19 · 9 · 5 · 4 |
| the seven `S0-*/README.md` tables and [`action-tree.md`](../action-tree.md)'s repairs row | who owns each repair | 29 |

Only the first predates this remediation. **They agreed on the first run**, which is worth recording precisely
because it is the boring outcome: the accounting in `HANDOFF.md` had been asserted from a hand count, and this
is the first time anything derived it. The 29 owners are the 28 current defects plus `f-66a7c6a`, a later gate
that a direct repair reached anyway.

### Stage B — four carriers, because evidence comes in four shapes

A claim is worth nothing unless the artifact carrying it still runs, so each carrier is paired with an oracle
that is **not** the checker:

| Carrier | Where the claim is written | What proves it still runs |
| --- | --- | --- |
| a published negative | `must_fail[].falsifies` in the vector file | the generator's own published-versus-asserted comparison, in both directions |
| a guard inside a generator | `falsifies()`, published by `claims()`, which emits only what registered during that run | `pnpm vectors:check` regenerates and compares |
| a test | `// falsifies:` above a `describe` | `vitest list` — the tests the default run collects |
| a check script | `falsifies:` in the module docblock | reachable from `pnpm check` or `pnpm build` |

**The first carrier needs no liveness check at all**, and that is the best property in the design: the claim is
a field *on the negative object*, so the claim and the evidence are one thing and cannot disagree. Where that
was available it was taken; the other three exist because tests, guards and checkers have nowhere to put a field.

**The second is the one that had to be built.** Several falsifiers are not vectors — `checkCarriers` reading each
row's own status line, the opener predicate refusing to drop a generation something still needs, the
`rotation_owed` derivation table. A claim written *about* one of those in a comment is the second copy again:
delete the guard and the comment survives. So the claim registers at run time and `claims()` publishes only what
registered, which makes the regeneration diff the oracle — machinery that already existed, doing one more job.

**The checkpoint generator proved the mechanism is strict**, immediately and by failing. Its guards run inside
`verify(doc)`, which is called *after* the document literal is built, so `falsifies: claims()` published nothing.
The fix is two lines and the lesson is the point: the claim is only in the file if the run reached it.

### Stage C — 85 claims, and what they are not

53 negatives, 19 tests, 8 guards, 5 check scripts. The rule applied throughout: **tag a negative only when its
failure would reintroduce the finding's defect.** Most of the 292 published negatives exist for local theorems
and carry nothing.

Two claims are **partial**, and the grammar says so rather than rounding up:

- `f-4259822-recovery-replacement-no-forward-rotation -> L-2`. What the replacement-payload variants falsify is
  the *binding* — `successor` is inside the signed digest, so a replacement cannot be re-served with a different
  one. That the exposed code then **opens nothing** is a runtime property of the generation switch. `S0-2` said
  so in prose; this is the first time the artifact says it.
- The two entries in the checker's `OWED` list, which is a declaration of debt rather than a coverage claim —
  `f-bd87655`'s dated evidence table and `f-66a7c6a`'s declared-population burst, both at `L-4`.

### Stage D — nineteen mutations, and three of them corrected the design

Every mutation is applied, the check is run, and the file is restored **from an in-memory snapshot**. Not from
git: none of this work was committed yet, and a `git checkout --` restore reverts the action's own changes along
with the mutation. That was learned the direct way — the first battery destroyed the uncommitted tags in four
files and had to be re-applied.

| # | Mutation | Result |
| --- | --- | --- |
| 1 | a negative loses its only tag | caught — the finding has no falsifier and no declared debt |
| 2 | a claim-carrying test file drops out of the run | caught — vitest collects nothing from it |
| 3 | a guard stops being called | caught — the regenerated file lost the claim |
| 4 | a check script is unwired from every gate | caught — evidence nothing runs proves nothing |
| 5 | a claim names a finding that does not exist | caught |
| 6 | a claim is made on a historical-only finding | caught — `H-1`'s ledger has no surviving defect to falsify |
| 7 | a finding is dropped from the materiality table | caught — a record with no class |
| 8 | a finding loses its owning action | caught — Stage 0 cannot close over a finding nothing owns |
| 9 | a standing debt is struck from the owed list | caught |
| 10 | a paid debt stays declared | caught — the vacuity guard |
| 11 | the matrix is edited by hand | caught — stale |
| 12 | a tagged `describe` is skipped | caught |
| 13 | a **guard** claim names a gate nothing defines | refused at registration, so the vector never changes |
| 13b | a **negative** claim names a gate nothing defines | caught — that path does not go through `falsifies()` |
| 14 | the matrix is deleted | caught — stale |
| 15 | a tagged `describe` is renamed | caught, by staleness — see below |
| 16 | a test tag is detached from its `describe` | caught — added by the re-check below |
| 17 | a claim is written in a generator docblock | caught — the wrong carrier for a generator |
| 18 | a second claim sits below a check script's docblock | caught |

**Mutation 14 of the first battery deleted a claim I had written into two docblocks.** It moved `falsifies()`
from inside the guard body to its call site, and **changed no result** — because either way, deleting the
guard's invocation deletes the claim. The placement was published as what proves the guard ran, and it is not:
what proves it is that `claims()` emits only what registered during that run. The call stays inside the body
because a reader checking the guard should find the claim beside it, and both docblocks now say that instead.

That is the third time this session a mutation has retired an unfalsifiable rule, after `S0-4`'s successor slot
and `S0-3`'s trim watermark. The pattern is stable enough to state: **a rule whose removal changes no result is
not a weak rule, it is not a rule** — and the only way to find out is to remove it.

**Mutation 15 is caught for a weaker reason than it looks.** A `// falsifies:` comment sits directly above its
`describe`, so renaming the block renames what the tag points at *simultaneously* — the comment cannot go stale
against the line beneath it. What changes is the generated matrix, and `--check` sees that. Renaming a test is
not a defect anyway; the defect that carrier guards against is the block leaving the run, which is mutation 2.

**Mutation 5 exposed a crash rather than a diagnosis.** A claim naming a finding that does not exist was recorded
as a failure and then the matrix was rendered anyway, looking up a severity for an id with no record. The report
now runs before anything is rendered: a population that has not reconciled has nothing to render from.

**Mutations 16 to 18 come from re-checking this action after it was committed, and they close a defect it had.**
The test and script scanners matched a pattern and ignored everything else, so a `// falsifies:` comment not
immediately above a `describe`, a claim written in a generator's docblock instead of through `falsifies()`, or a
second `falsifies:` line below a check script's docblock would all have **vanished silently** — the claim gone,
the finding then reported as uncovered or, worse, still covered by a different artifact while one claim
evaporated.

That is `S0-1`'s subject exactly: *a check that classifies by matching a list silently passes whatever the list
does not name.* It repaired three instances of it, and the file written to prove those repairs had a fourth. No
tag was actually orphaned — the count was 17 offered and 17 attached — which is why nothing caught it and why
the audit had to be run rather than reasoned about. Each scanner now compares what is **offered** against what
it could **attach**, and refuses the difference.

### What Stage E regenerated

All 16 generators, all 16 vector files, 371 tests, and the five document-to-artifact checkers. `pnpm trace:check`
joins `retention:check`, `status:check` and `limit:check` in `pnpm check`.

**Nothing was stale.** Every vector already matched its generator, which is what `vectors:check` has been saying
throughout — and the point of `S0-8` is that this was never the question. `vectors:check` compares a generator to
its own output and cannot see a document describing a construction the generator does not produce, or a finding
whose falsifier was renamed out from under it. That is the gap this action closes, and it is why the matrix
resolves claims against artifacts rather than counting them.

## What this does not prove, stated rather than discovered

It proves a falsifier exists, names the finding it refuses, and still runs. **It does not prove the falsifier
isolates.** A negative that refuses for a second reason satisfies every check here and demonstrates nothing —
this project's recurring defect, met three times in `S0-2`, `S0-5` and `S0-6`.

That is covered by different oracles on purpose: `pnpm vectors:coverage` elides each AAD field and requires a
negative to stop failing, and the mutation batteries recorded in each action's Stage D cover the rest. Building
isolation into this check would make it its own oracle, which is the shape of every defect the action exists to
catch.

## Not in scope

- **Changing any finding's `status:`.** `S0-10` reserves disposition changes, and 27 of 28 falsified is a fact
  about the evidence rather than a disposition. [`end-state-materiality.md`](../end-state-materiality.md) still
  reads 19/9/5/4.
- **`S0-9`'s independent challenge.** The matrix is what a challenger reads first; it is not the challenge.
- **The two owed items.** `f-bd87655`'s dated table needs an external source and `f-66a7c6a`'s burst needs a
  declared device population. Both are `L-4`, and both are now visible in a generated document rather than in a
  paragraph somebody has to remember.

## Addendum — the post-challenge regeneration, 2026-08-29 (queue item 5)

Both `S0-9` rounds convicted parts of the mechanism this record describes, and the queue's item 5 is the
regeneration that repairs them. It ran 2026-08-29 on the remediation branch; this addendum records it under a
re-pin, and the current mechanism claims live in the regenerated [`traceability.md`](../traceability.md), the
[`RC-9` record](../decisions/RC-9-later-gate-governance.md) and [`HANDOFF.md`](../HANDOFF.md) — this section
is the dated report, not a second home.

**`FU-14`'s execution receipts.** The fourth carrier's oracle was reachability in command text, and the
challenged tip's gate exited at lint while the matrix said everything ran. Now every check script installs
`scripts/lib/receipts.mjs`, which writes `.receipts/<script>.json` at process exit — the script's own SHA-256,
the exit, and the tree (HEAD plus a digest of every uncommitted change) — and `check-traceability.mjs`
credits a script-carrier claim only by a receipt that is present, passing, written by the script's current
bytes, and written against the current tree. `pnpm check` reordered so `trace:check` is its **last** step:
every receipt is minted (the two build-gate ones inside `test:geometry`'s web server) before the matrix
credits anything. The receipts directory is untracked on purpose — a commit cannot carry proof that checks
ran on your machine — so a fresh clone earns its credits by running the gate once. Failures are receipted
too: `RC-9` falsifier 1's demonstration reads `ok: false` and the named mismatch out of the receipt, never
shell text.

**The five matrix limits** (round 1's list, printed in the matrix since the dispositions):

1. *Relation* — repaired at its checkable faces and stated at its residue: recency refuses the demonstrated
   mutation (a reviewed-tip negative re-tagged for any finding fails), identity binds declared negatives to
   their fields through the cipher, and a **new** artifact deliberately mis-tagged stays the batteries' and
   the challenge's subject — the matrix says exactly that instead of overclaiming.
2. *Recency* — every claim is compared against the reviewed tip `9edd930`. The rule convicted ten live tags
   on negatives that ran unchanged while their defects existed — four on `attribution.json`, two on
   `checkpoint.json`, one on `device-lock.json`, two on `record-format.json`, one on `transition.json` —
   the exact shape round 1 counted six of. All ten tags were dropped; the negatives stay published as local
   theorems; every affected finding still carries post-tip evidence (the `S0-2`–`S0-7` returns' guards,
   tests and inversions), two of them now honestly in the single-falsifier leverage list.
3. *Check-script liveness* — the receipts above; a gutted or edited script no longer keeps its claim.
4. *The recursive scan* — all three scans walk recursively, and a claim in a file the carrier rules do not
   admit (a helper, `scripts/lib/`, a Playwright spec) fails loudly instead of vanishing.
5. *The population pin* — `census.json` gained `findings_population` (37 ids, hash over the sorted list),
   read by `scripts/lib/findings.mjs` for `trace:check` and `debts:check` at once.

**Identity, not arity, in the AAD audit.** Every negative claiming isolation now declares its target on the
published entry — `isolates: 'construction.field'`, 114 declarations across the corpus — and
`check-aad-coverage.mjs` holds the cipher's rescue attribution to the declaration exactly: rescued by
nothing, by two fields, or by a different field than declared each fails, and an `aad-only-*` name without a
declaration is refused. Round 1's swapped-attribution demonstration now fails by construction. The
`CertifiedSet` construction registered with the audit — eight fields through `aadFields`, byte-identical
encoding — with five new `aad-only-certified-set-*` negatives for the fields round 1 found isolated by
nothing, and the three existing field negatives declaring theirs: the audit grew from 197 to **205 fields,
each isolated by its declared negative**.

**`RC-9`'s consolidation.** The checker's `OWED` list — *a declaration of debt, not a coverage claim*, per
its own docblock — grew into [`debts.json`](../debts.json): six entries, each carrying owner, one blocking
gate, required artifact, falsifier, expiry, typed payment and hashed inputs. `scripts/check-debts.mjs`
(`pnpm debts:check`, in the gate) validates the entries, holds the gate-class census total (an *Explicit
later* finding with no entry, or a future deferral outside the manifest, fails rather than entering no
bucket), enforces one-debt-one-gate against TRD §10.11 and `action-tree.md`, and checks `HANDOFF.md`'s
what-blocks-what claim against the computed projection in both directions; `--gate <name>` evaluates an
arrival and blocks while a debt is unpaid, expired or input-changed. The refusal floor is executable:
`test/debtManifest.test.ts` holds twenty negatives — a KAT presented as provenance, an audit citation as
the delta review, a Baseline citation as the population, an undated observation, an authority-less waiver —
each refused by a check, not a convention. And the source↔blob header binding landed: one cargo
regeneration stamped `seal.generated.ts` with the SHA-256 of `src/lib.rs`, `Cargo.toml` and `Cargo.lock`
plus the toolchain string (`WASM_BASE64` byte-identical, which is the reproduction proof), and
`check-wasm-seal.mjs` recomputes the source-side hashes with Node alone inside `pnpm check` — drift
detection only, the printed claim held to that scope by a byte rule, with provenance attestation registered
as the `wasm-toolchain-provenance` debt at `L-4`.

**The battery.** Twenty-one mutations, all caught, each asserted on its specific diagnostic rather than a
bare exit code, files restored from in-memory snapshots in a `finally` (this record's own Stage D rule):
the five receipt forgeries (deleted, re-hashed, edited-script, moved tree, hidden failure), eight manifest
mutations (deleted gate-class entry, struck `S0-10` debt, the `FU-15` two-gate shape, duplicated finding,
paid-without-receipt, dropped falsifier field, changed pinned input, a wrong `HANDOFF` count), the
`action-tree` byte rule, the widened wasm claim, round 1's lib.rs mutation (failing receipted) and the
header edited alone, the `scripts/lib` and non-test-file claim refusals, the population pin, and a
reviewed-tip negative re-tagged (the recency conviction, reproduced on demand).
