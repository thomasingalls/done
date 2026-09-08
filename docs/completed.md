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

---

### Shared encrypted-store browser harness — pinned candidate executions

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Stage:** L-1 implementation evidence, not L-1 closure

**Exit.** The Step 2 contracts were committed as `f87997d`. The shared
[harness](./storage-harness.md) now invokes actual candidate storage, key, editor, application and clear
paths through thin adapters. It archives three immutable commits, injects browser-primitive failures,
crashes/freezes renderers, copies complete synthetic profiles, and records source hashes, assertions and
storage inventories. It does not merge or repair candidate production code.

**Evidence.** The [dated execution](./storage-conformance-runs/2026-09-08.md) preserves 57 unmodified
candidate subcases and three detected trim mutants, with zero harness errors. All three candidates fail
the corrected contract. In particular, all lose the larger remote dependency and dependent local edit
after a renderer crash, leak pending input into ordinary editor/export/undo, and delete a trim input
whose bytes changed after snapshot commit. Contract-pass passes the independent-writer, late-reservation
and unreadable-trim controls. All three copied Chromium test profiles reopen without a factor. The full
unit suite passes 507 tests in 43 files, including nine harness-reporting tests; TypeScript passes.

**Remaining.** The catalog names 15 remaining-obligation rows per candidate, keeping all 16 acceptance
requirements visible. These include unavailable integrated transition/custody/import APIs, complete
clear/startup interruption matrices, factor controls and supported-platform evidence. The three new
conformance debts remain open. The next implementation unit is the admission/lifetime coordinator,
with selected donor components repaired and evaluated through this harness. No release gate is paid,
candidate merged or live Stage 2 cutover executed by this result.

---

### Encrypted-store implementation phase one — write-session lifecycle

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Stage:** L-1 component checkpoint, not L-1 closure

**Exit.** The agreed first implementation phase is complete. [writeSession.ts](../src/crdt/writeSession.ts)
acquires a shared slot permit before initialization, requires cleanup for initialization, invalidates
closed sessions and finished tasks, drains tracked work, clears caches and awaits native release.
Exclusive operations use the same lifecycle after the initiating writer closes; there is no upgrade,
timeout or stealing path. Failed cleanup disables writes and retains the permit. Reacquisition creates
fresh capabilities and reruns initialization.

**Evidence.** The [recorded browser execution](./storage-conformance-runs/2026-09-08-write-session.md)
passes 13 scenarios and detects five deliberate regressions, with zero harness or unexpected page errors.
It covers concurrent/frozen tab holders, task and session invalidation, detached work, partial initializer
failure, delayed/failed cleanup, queued cancellation, exclusive failure, renderer death, dedicated-worker
shutdown/termination and navigation. BFCache restoration was not observed. The full Vitest run passes
514 tests in 44 files; TypeScript, focused lint/format and the production build pass. `pnpm storage:session`
is included in `pnpm check`.

**Remaining.** This is the production lifecycle component with synthetic key-cache/write probes, exported
but not yet wired into the application. Mandatory-factor custody is the next phase; encrypted admission,
editor/receive integration and complete journal/generation/retirement composition follow. The C04 evidence
cell and its three existing debt pins were refreshed without changing obligations or paying any gate.
The independent L-2 record and earlier candidate outcomes remain unchanged. The component guide is
[write-session.md](./write-session.md).


---

### Encrypted-store implementation phase two — mandatory-factor custody

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Stage:** L-1 component checkpoint, not L-1 closure

**Exit.** The preceding harness and lifecycle checkpoint were committed as `ccfcbf0`. The
[custody component](./custody.md) now generates and confirms the mandatory code, stages sealed custody
under exclusion, commits root-seal reservations before encryption, and resumes an authenticated creation
intent without changing its identity or resetting its history. Cold unlock rereads authority/custody under
the shared lifetime permit and imports scoped store, wrapping and signing keys into owned memory. Closing
invalidates tasks, drains work and clears capabilities; nested crypto continuations also check the task.
No private-key or promptless persistence API is exposed. The component supplies authenticated record reads
for the next phase, without content writes or admission.

**Evidence.** The [recorded execution](./storage-conformance-runs/2026-09-08-custody.md) passes 13 real-browser
cases and 73 assertions and detects five deliberate defects, with no harness or unexpected page errors.
It includes actual renderer death during creation, transaction aborts after request success, concurrency,
partial/legacy refusal, metadata tampering, the reservation ceiling and cancellation within key generation.
Complete synthetic same-host profiles have external-factor controls and a planted promptless-root control
that recovers both content and a test future-receiver probe. The full Vitest suite passes 532 tests in
46 files; TypeScript, focused lint/format, the production build, bundle budget and origin checks pass.
Published device-lock/record/recovery vectors and the 205-field AAD audit remain current.
`pnpm storage:custody` is included in `pnpm check`.

**Remaining.** The new component is exported, with required verified-identity and other-carrier checks
for its future caller; the app still uses its earlier persistence. Complete Local/Account startup,
application onboarding, PRF enrollment, legacy migration and real receiver/authorization integration
remain owed. The v2 credential/metadata encodings are detailed in the component guide and decisions.
Next build the encrypted content carrier and allocation/load boundary on these capabilities, then compose
journal/admission and owned startup in subsequent checkpoints. No release debt is paid, and the earlier
candidate comparison and independent L-2 work are unchanged.

### 2026-09-08 — encrypted content carrier, implementation phase three

**Gate/seat:** L-1, `/Users/thomasingalls/.codex/worktrees/c030/done`,
`codex/encrypted-store-contract-corrections`. The preceding mandatory-factor custody checkpoint was
committed as **`a6d39a2`** at the user's request. This entry records the next bounded component.

[content-store.md](./content-store.md) describes the new lifecycle-bound byte carrier. It has resumable
initialization with an authenticated custody-side witness, exact durable per-batch allocation, cumulative
counts including abandoned encryption, atomic immutable insertion across update/state/heads/outbound,
and complete authenticated loading. It copies caller inputs before awaiting, exposes no key or reusable
reservation, and returns a content receipt only on transaction completion. Close drains work before
releasing custody's shared permit. Ordinary open never repairs a missing initialized counter by resetting
it. Ceiling/generation changes refuse; rotation, trim and admission are not implemented by this phase.

The [recorded content run](./storage-conformance-runs/2026-09-08-content.md) passes **13 browser cases /
58 assertions**, detecting **five** independently injected defects. Native cases include two-tab
allocation, request-success/transaction-abort faults, actual renderer death after encryption, initialization
resumption, corrupt/unknown/misplaced records, immutable-row collision and close during crypto. Cold offline
Yjs replay retains a 17 KiB remote dependency, deletion and dependent local edit as exact stored bytes.
The production editor/receive path is not part of that fixture.

The refactored custody owner retains its API behavior: its regression run passes **13 cases / 73 assertions**
and detects all **five** prior mutants, including profile-copy controls. Full Vitest passes **545 tests /
47 files**. Type checking, focused lint/format, build, record/device-lock vectors, AAD coverage, bundle
budget and contract/governance checks pass. Initial gzipped JS stays **306.3 kB / 350.0 kB**; app wiring
is still unchanged. The literal full `pnpm check` chain, geometry and unchanged phase-one browser suite
were not rerun. Reports pin exact source/harness inputs and the Chromium/macOS environment.

**What remains:** the synchronous encrypted journal is the next bounded carrier; ordered admission and
canonical editor/transport integration follow. Exact trim, complete identity/index/startup/clear/migration,
PRF and the supported-platform/transition/reference evidence remain open. Matrix pins are refreshed with
all obligation text and debt statuses unchanged. No release debt or old-writer cutover is paid by this
component. The independent L-2 progress document is preserved.


---

### Encrypted-store implementation phase four — synchronous encrypted journal

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Stage:** L-1 component checkpoint, not L-1 closure

**Exit.** Phase three was committed as `468cbe2`. The [synchronous journal](./journal-store.md) now
attaches selected row-2 XChaCha20-Poly1305 bytes to mandatory-factor custody and the shared writer lifetime.
It reports success only after synchronous localStorage completion, refuses oversize/quota/unavailability,
authenticates full scoped snapshots, and preserves unreadable or unknown-generation entries. Recovery
captures journal before content to cover concurrent handoff. Flush commits captured bytes through the
real content allocator in bounded chunks and removes only matching entries after transaction completion.
Failed or changed cleanup retains the journal; no public caller-asserted receipt or clear API exists.

The existing RustCrypto WASM module gained authenticated opening, per-operation staged-buffer clearing
and permanent whole-memory disposal. The raw journal subkey and instance are cleared before the lifetime
permit releases. Selected journal vectors and locked cipher dependencies are unchanged. The shared store
name derivation was extracted without changing slot-index naming behavior. No editor/application wiring
or input-admission coordinator was added.

**Evidence.** The [recorded execution](./storage-conformance-runs/2026-09-08-journal.md) passes **17 cases /
93 assertions** and detects **six** mutants. It covers actual renderer death before flush and between
content completion/cleanup, real quota exhaustion, unreadable entries, concurrent handoff and late suffix,
actual freeze/resume/death with a cached journal key, close/disposal, and failure in a later flush chunk.
The content regression passes **13 cases / 58 assertions / five mutants**; custody passes **13 cases /
73 assertions / five mutants**, including its copied-profile controls. All three exit 0.

Full Vitest passes **554 tests / 48 files**. Type checking, focused lint/format, build/budget/origin checks,
WASM freshness and its **28 assertions**, published vectors and relevant contract/governance checks pass.
The WASM module is 8746 raw bytes; application initial JS remains **306.3 kB / 350.0 kB** gzipped. Desktop
append timings are a coarse-clock smoke observation, not payment of the low-end p95 or platform gate.
The literal full `pnpm check` chain, geometry and unchanged phase-one browser suite were not rerun.
`pnpm storage:journal` is included in the check chain.

**Remaining.** Ordered admission is next: prepare private input, force content on journal refusal, and
promote canonical state only after durable carrier completion. Actual editor/IME/undo/export/transport,
complete Local/Account startup/clear/migration, exact trim, generation/reference/receiver composition,
PRF and supported-platform/independent-review evidence remain owed. C11-prefixed journal-flush cases do
not implement workspace clear. Equality cleanup assumes conforming immutable identities, without an
atomic localStorage compare-and-delete claim. Three matrix pins are refreshed; no obligation text or
debt status changes and no release gate is paid. The independent L-2 progress record remains unchanged.


---

### Encrypted-store implementation phase five — ordered admission

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Stage:** L-1 component checkpoint, not L-1 closure

**Exit.** Phase four was committed as `9e60c6a`. The [ordered admission owner](./ordered-admission.md)
now owns private canonical Yjs state and one FIFO over local intents, received updates and durability
barriers. Journal success promotes synchronously; refusal forces content before promotion. Queued intents
prepare only against the resulting accepted predecessor. Failed content retains exact prepared bytes and
retry remains on the content path. Receive validation precedes encrypted content completion and canonical
application. Recovery preserves unresolved structs/delete sets and refuses malformed persisted Yjs.

The component adds bounded byte/item reservations, explicit whole-suffix discard, retained pressure,
command-supplied slices, a 250 ms flush and `whenDurable()`. Canonical documents do not escape; snapshots
and accepted events are detached copies. Close immediately refuses input/publication, drains native work
and lets the existing lifecycle dispose custody. The owner is exported but not wired into the app.

**Evidence.** The [recorded browser execution](./storage-conformance-runs/2026-09-08-admission.md) passes
**15 cases / 64 assertions** and detects **six** mutants. Actual encrypted-storage schedules cover
refused predecessors, exact forced retry, receive-before-promotion, unresolved structs/deletes, slice
interruption, capacity, flush barriers/timer, malformed persisted Yjs, repair refusal and close/exclusion.
Renderer death demonstrates offline accepted-state/prefix recovery. An initially empty second tab
withholds a received update and dependent intent until its own content commit. Fixture projections and
publication inventories observe the real admission owner, not actual editor/transport implementations.

The journal regression passes **17 cases / 93 assertions / six mutants**. Full Vitest passes **574 tests /
49 files**, including 20 new admission tests for controlled failure and callback/ownership schedules.
Type checking, focused lint/format, build/budget/origin, vectors/AAD, WASM verification and relevant
contract/governance/traceability checks pass. Initial JS remains **306.3 kB / 350.0 kB** gzipped. The literal
full `pnpm check` chain, geometry and separate unchanged custody/content/phase-one browser suites were
not rerun. `pnpm storage:admission` is included in the check chain. The evidence records the corrected
native completion observer and the earlier development result without crediting its nonpassing baseline.

**Remaining.** Next is actual editor/command/IME/undo/export and receive/transport integration through the
owner, with preparation-cost profiling before low-end acceptance. Full canonical cloning is an explicit
cost, and 256 jobs/4 MiB reservations do not bound total Yjs memory. Complete identity/index/startup/clear/
migration, exact trim, PRF, receiver/transition/reference composition, supported platforms and independent
review remain owed. Three matrix pins are refreshed; no debt status or obligation text changes, no release
gate or cutover is paid, and the independent L-2 progress record remains unchanged.


---

### Encrypted-store implementation phase six — admitted Goals editor and preparation profile

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Stage:** bounded L-1 integration checkpoint

**Exit.** The [Goals text adapter](./editor-admission.md) connects a real CodeMirror surface to the
phase-five owner. Semantic typing/paste, list/format/task commands, cut, undo/redo and multiple carets
prepare privately at the FIFO head. Accepted text, history and the existing Markdown/ZIP export functions
advance after the carrier receipt. Remote deltas map history without entering local undo. The actual
same-origin scoped BroadcastChannel sends only accepted local bytes, and received bytes complete their
local content commit before text publication or dependent input. The default application startup remains
on its earlier store; this does not integrate the whole workspace or authorize cutover.

Native Blink composition is provisional and its tested final commit enters admission once, including
Blink's missing-compositionend case. Platform-native IME behavior and preedit UX still require validation.
Storage pressure has visible retry/discard controls; repair and close clear/disable the ordinary editor
and refuse ordinary export. Large paste uses bounded Unicode slices with a shared runtime undo step;
other commands whose encoded delta exceeds 16 KiB block rather than bypassing the owner.

**Evidence.** The [recorded execution](./storage-conformance-runs/2026-09-08-editor-admission.md) passes
**12 browser cases / 61 assertions** and detects **three** editor source mutants. Actual renderer crashes
recover accepted prefixes and completed edits offline. The full admission regression passes **15 cases /
64 assertions / six mutants**. Full Vitest passes **588 tests / 50 files**, including 14 new command tests.
Typecheck, focused lint/format, build/budget/origin, vectors/AAD, WASM verification and applicable project
checks pass. The app's initial JS remains **306.3 kB / 350.0 kB** gzipped. The literal full check chain,
geometry and separate unchanged carrier/custody/lifecycle browser suites were not rerun. The new
`storage:editor` runner is in the check chain; source and fixture evidence is frozen and hashed.

Preparation-only profiling records 50 samples each for compact 1 KiB/100 KiB/1 MiB text and a 2000-edit
single-writer history, plus 30 samples for an extreme 2000-writer history. This Mac's p95 ranges from
0.2 ms to 6.1 ms across those shapes. That is neither the complete input-to-paint path nor supported
low-end evidence. Full cloning and native IME remain acceptance gates, with budgets/debt unchanged.
The earlier false empty-Yjs-merge data-loss rationale in `openStore` was corrected without changing its
load-before-connect behavior.

**Remaining.** Card/workspace and actor-scoped cross-surface undo adapters, actor initialization/repair,
complete startup/clear/migration/onboarding, exact trim, Account receive authority, generation/reference/
receiver composition, PRF and independent/platform review remain owed. This phase and phase five remain
uncommitted. Only evidence cells and their three matrix hash pins change; no obligation or debt status is
paid, and the independent L-2 progress document is unchanged.


---

### Encrypted-store implementation phase seven — admitted workspace commands and shared human history

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Stage:** bounded L-1 integration checkpoint

**Check-in.** Phases five and six were committed as `0b5337a` before this phase began. This new workspace
checkpoint is uncommitted. Existing completed entries describe their status at the time they were written.

**Exit.** The [workspace adapter](./workspace-admission.md) brings Goals/card text, compose/moves/reorder/
remove/split/merge/copy/file/bulk, actor initialization/update, settings and membership repair through one
ordered owner. Existing command rules execute privately at the queue head. One human content undo manager
covers Goals, days, cards and locations; system work and received work stay outside it. Accepted document,
history, export and outgoing bytes advance together after their carrier. Mounted text surfaces share the
workspace lifetime without acquiring a writable document. Application-content initialization completes a
content barrier before a facade/editor can be exposed; failure mounts no editor.

The Yjs seam forks runtime undo/redo delete sets, selection metadata and local-only Item.redone links.
Separate private transactions preserve system origins for day creation, repair and bulk. This retains
deleted runtime content with gc:false and adds a second full clone per preparation, a cost requiring
performance/memory and independent review. History is not persisted. General large-command slicing and
native IME acceptance remain owed; the 16 KiB encoded-delta guard remains in force.

A real same-origin workspace BroadcastChannel exchanges accepted state in both directions on join before
continuing accepted update delivery. That supplies actor/bootstrap structs which later updates may need.
Received bytes still complete local content persistence before projection/dependent work. This channel is
not Account authority, reliable delivery, old-writer exclusion or unbounded snapshot support.

**Evidence.** The [recorded execution](./storage-conformance-runs/2026-09-08-workspace-admission.md) passes
**10 browser cases / 62 assertions** and detects **four** source mutants. Real Goals/card editors, native
input/undo, encrypted carrier aborts, tab joins, system repair and actual renderer crashes exercise the
bounded integration. Reopen recovers accepted state offline with fresh runtime history. Close and known
journal damage disable both ordinary surfaces and refuse export. The mutations discriminate pending
history publication, system bulk in undo, remote work in undo and omitted redone links.

Goals regression passes **12 cases / 61 assertions / three mutants**; admission regression passes
**15 cases / 64 assertions / six mutants**. These preceded only the final workspace null-receipt correction,
which is outside their import paths and is covered by the final workspace run. Full Vitest passes
**607 tests / 51 files**, including 19 workspace tests. Typecheck, focused lint/format, build/budget/origin,
sixteen vector generators/AAD, WASM verification and relevant project/traceability checks pass. Initial
JS remains **306.3 kB / 350.0 kB** gzipped. The literal full check chain, geometry and separate unchanged
carrier/custody/lifecycle browser suites were not rerun. `storage:workspace` is in the check chain.

**Remaining.** The default React application and legacy provider still use the earlier writable store.
Owned startup/classification/clear and scoped identity/index onboarding are the next boundary before
application integration; exact trim and seeded legacy cutover/migration remain separate obligations.
Account verification, PRF, generation/reference/receiver composition, supported-platform performance and
independent review remain owed. Only matrix evidence and three hash pins advance; debt statuses and
obligations do not change, and the independent L-2 progress record remains unchanged.
