# done — Completed work

**Append-only.** An entry is written when a slice of work closes, and is never edited afterwards. If
something recorded here later turns out to have been incomplete, that is a new entry, not a correction to
an old one — the record of what was believed finished, and when, is worth as much as the record of what
was.

**Chronological, oldest first.** New entries go at the bottom.

**What closes a slice.** Work is complete when its **exit condition** is met, not when the code is written.
Where [sequencing.md](./sequencing.md) states exit criteria for a stage, those are the condition, and the
entry says which of them were demonstrated and how. Where it does not, the entry states its own.

**Why this file exists separately.** Completed work will otherwise creep into either the decision journal
or the active-slice document, and it belongs in neither: [decisions.md](./decisions.md) is append-only but
records _why_, not _what shipped_, and [progress.md](./progress.md) is overwritten wholesale whenever the
active slice changes, so anything left there is lost on purpose. **When a slice closes, its outcome is
written here before `progress.md` is rewritten.** That ordering is the whole discipline.

## The entry format

```markdown
### What closed

**Date:** YYYY-MM-DD · **Commit:** `abc1234` · **Stage:** sequencing.md §x, or —

**Exit.** The condition that was met, and what demonstrated it.

**Notes.** Anything a later reader needs — what was deliberately left out, what it turned out to cost.
```

---

## Before the journal

**These entries are reconstructed from git history**, which is why they are terse. They record what landed
and when, on the evidence of the commits themselves. They do not reconstruct exit criteria that were never
written down: at the time, the phase exit criteria lived in the PRD and were assessed informally rather
than recorded. Entries below the rule are written as work closes and state their own evidence.

| Date       | Commit                | What landed                                                                                                                                                   |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-05 | `fa267e2` … `1d86769` | The PRD and TRD, through six revisions: the hybrid document/collection model, the freeze/compaction split, the actor model, layout as constraints             |
| 2026-08-05 | `4ece5a7`             | **Phase 1: the editor.** Live-preview markdown, one document, local persistence                                                                               |
| 2026-08-06 | `d3284da`             | **Phase 2: the workflow.** Cards, collections, movement, the three-cap, freeze, spatial navigation, three breakpoints, actor attribution, scoped undo, export |
| 2026-08-06 | `db83e7d`             | Hardened GitHub Actions CI                                                                                                                                    |
| 2026-08-07 | `058b96e`             | **Phase 3: sync.** The relay in its development shape, the provider interface with a null default, the sync controller                                        |
| 2026-08-07 | `ab90203`             | Scroll-aware Goals breadcrumb and heading outline                                                                                                             |
| 2026-08-10 | `dff4e68`             | Load-before-connect ordering, closing a data-loss path                                                                                                        |
| 2026-08-10 | `2c940c0`             | Property-based tests for CRDT convergence — the fleet of N stores around a relay hub                                                                          |
| 2026-08-10 | `562fb40`             | Every device's Next items and Done's order preserved across sync                                                                                              |
| 2026-08-10 | `2f679c7`             | Yjs membership repair, recovery, and local durability hardened                                                                                                |
| 2026-08-11 | `0ef0e7b`             | Trusted HTTPS/WSS development through Tailscale Serve                                                                                                         |
| 2026-08-17 | `e4969a0`             | The identity model, and the PRD and TRD rewritten around it — **PRD v9, TRD v8**                                                                              |

**One caveat this table should carry.** Phase 3 landed, but sync "works and occupies no supported
configuration" ([sequencing.md](./sequencing.md) §1): a shared bearer token in a query string, a plaintext
`Y.Doc` on the relay, three fields typed by hand on each device. It is complete as _development_
infrastructure and is not the shipped shape. Its exit criteria — a week of two-device consistency, a week
without falling back — are assessed at PRD §10 Phase 3, which `sequencing.md` splits across Stage 4.

---

### The documentation and tracking structure

**Date:** 2026-08-18 · **Commit:** `e4969a0`, on `claude/docs-tracking-structure-7c6b31` · **Stage:** — (housekeeping)

**Exit.** Project state has one home per kind of state, and no document claims a status it cannot maintain.
Demonstrated by: the README no longer tracking project state; `sequencing.md` carrying **Stage 0** instead
of **Now**, with no remaining reference to a live "now"; and four tracking files existing with their write
rules stated in each — [decisions.md](./decisions.md), [progress.md](./progress.md), this file, and
[performance.md](./performance.md).

**Notes.** The README's decision record was migrated rather than dropped, under a rule marking it as taken
against PRD Draft v6–v8 / TRD Draft v4–v7 with a mapping for the PRD section numbers that moved in v9. The
README's "Running it" and "What is here" sections became [development.md](./development.md) and
[codebase.md](./codebase.md); the codebase map gained seven rows for files that existed but were never
indexed, and a note that the property fleet runs with `persist: false`.

[performance.md](./performance.md) was seeded with one real measurement — 306.2 kB of the 350 kB budget —
and `scripts/check-budget.mjs` gained an opt-in `--record` flag that prints an append-ready row. The
latency rows still have no harness; building it is Stage 0's third item.

**What was deliberately not done.** `sequencing.md` §5's decisions were left where they are: that document
cites its own §5 throughout, and moving them would break it. `sessions.md` was not touched.

---

### Stage 0 — select, measure, book: closed on the corrected evidence, at the recorded independence bar

**Date:** 2026-08-29 · **Commit:** `cd8228c` (the `S0-10` record; the dispositions and this entry ride the
commit after it) · **Stage:** [sequencing.md](./sequencing.md) §3.1

**Exit.** Every TRD §15 row selected or correctly open — rows 18, 19 and 21 stay at their own gates by rule.
The lineage review's 37 validated findings answered: the repairs landed and the evidence regenerated
(`S0-8`), the whole gate green end to end — typecheck, sixteen generators, 205 isolated AAD fields, 445
tests across 39 files, the authority map at zero open joints, the standing census, the debt manifest, and
the traceability matrix crediting execution receipts, 28 of 28 current defects carrying a named falsifier.
Independently challenged three times (`S0-9`): rounds 1–2 failed the package as challenged and forced the
returns; round 3, from a different model family, found the constructions sound. The one registered `S0-10`
debt paid by a dated external observation — TRD §10.11's X25519 evidence table, wpt.fyi stable-run
executions on the four engines, expiring 2027-02-28. The closure recorded with its independence bar exact
([`docs/review/remediation/S0-10/README.md`](./review/remediation/S0-10/README.md)): author-independent
seven times, family-independent once, human-independent never. And the 28 current findings moved
`validated → repaired` under the user-authorized falsifier-executes standard, the five later-gate findings
staying open as registered debts (`L-1` — 1 · `L-4` — 4), the four historical riding `H-1`.

**Notes.** What this closure does not claim: human review — review 3a/3b remain bookings, not results, and
proceeding on the machine-adversarial bar was an explicit decision recorded in the `S0-10` record, not an
oversight. The X25519 observation is dated evidence with an expiry; from 2027-02-28 the manifest refuses it
exactly as a missing one, and review 3b's pass is offered the re-measurement. Firefox 154's `deriveBits`
small-order rejection gap is recorded at §10.11's dagger note — the DHKEM layer carries its own all-zero
abort (`L-2`/`L-3`). `R3-4` (member-entry uniqueness, low) rides `S0-2`'s homes before `L-2` implements a
verifier.


---

### Encrypted-store Step 2 — corrected contracts and conformance plan consolidated

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections`, from `af8941e` · **Stage:** L-1 prerequisite, not L-1 closure

**Exit.** The selected corrections now have normative repository homes: [storage-contract.md](./storage-contract.md),
PRD/TRD, affected selections and schemas, with [storage-conformance.md](./storage-conformance.md) specifying
16 acceptance scenarios and their evidence classes. The five outstanding ambiguity dispositions are explicit.
Mandatory factor genesis follows the user's choice. Custody lifecycle/reservation metadata becomes v2 while
the selected cryptographic bytes remain unchanged. Sequencing, action-tree, authority pins and unpaid debts
now distinguish the corrected contracts from the older partial Stage 0 evidence.

**Evidence.** Seven new model/component tests exercise writer-lifetime exclusion and its losing mutant,
Yjs causal dependencies and deletions, exact versus range trim, raw-clone accounting and empty-replica
synchronization. The full Vitest run passed 498 tests in 42 files; TypeScript passed. All 16 vector
generators checked current, and AAD coverage checked 205 field isolations. The record/device-lock fixtures
retain all 119 cryptographic hex values from the baseline. These results concern represented models,
components and byte fixtures; no production conformance or complete copied-profile protection is claimed.

**Remaining.** The shared production-adapter/browser harness is next. Three new unpaid obligations cover
storage conformance at L-1, composed writer/generation lifecycle at L-3, and supported factor/profile
evidence at L-4. Earlier finding dispositions remain historical evidence; this entry does not recertify
the full protocol, merge candidate implementations, or execute the live Stage 2 cutover.
