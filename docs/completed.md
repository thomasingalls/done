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


---

### Encrypted-store implementation phase eight — owned retained-workspace startup and classification

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Stage:** bounded L-1 integration checkpoint

**Check-in.** The phase-seven workspace checkpoint was committed as `a48c090` before this phase. The
new startup checkpoint remains uncommitted; earlier completed entries retain their historical status.

**Exit.** [Owned startup](./owned-startup.md) now reads the scoped slot index, custody/control records,
content witness/counter/layout and journal before selecting keys. Presentation preflight uses read-only
known-name probes that abort would-be database creation. Normal open rereads inside the encrypted
carrier's one shared lifetime, verifies factor/custody/content/journal, replays, validates the application
schema and completes admitted initialization before returning a workspace for editor/channel construction.
The required Local/Account identity verifier remains an external authority seam; a stored index is not
accepted as an identity proof. The default React application remains on its earlier store.

Absent carriers produce a fresh *observation*, not enrollment or genesis authority. Missing/inconsistent
indexed material and orphan carriers refuse repair without reminting/resetting anything. Selected legacy
routing stays on the migration path. Creation-pending and refusal-only clearing/cleared/migration hints
preserve their carriers; this module neither authenticates a full cross-database creation/clear intent nor
executes its resumption/deletion. Ordinary interrupted open reacquires, rereads and recovers admitted
initialization before exposure. Cancellation drains owned crypto before releasing its permit.

**Evidence.** The [recorded execution](./storage-conformance-runs/2026-09-08-owned-startup.md) passes
**15 browser cases / 96 assertions** and detects **three** source mutants: probe creation, orphan-as-fresh
and skipped classification after the grant. Native before/after inventories verify refusal preserves
carriers and no normal database enumeration occurs. Actual locks, encrypted reads, mounted editor/channel,
content-creation interruption and renderer death exercise the retained-open boundary. Wrong factor,
unreadable ciphertext, unsupported application schema and damaged target journal refuse before ordinary
exposure; an independently valid workspace remains usable. The first startup browser run passed.

Workspace regression passes **10 cases / 62 assertions / four mutants**. Full Vitest passes **634 tests /
52 files**, including 27 new startup preflight tests. Typecheck, focused lint/format, build/budget/origin,
sixteen vector generators/AAD, WASM verification and applicable project/governance/traceability checks pass.
Initial JS remains **306.3 kB / 350.0 kB** gzipped. The literal full check chain, geometry and separate
unchanged Goals/admission/carrier/custody/lifecycle browser suites were not rerun; workspace regression
covers the changed existing workspace module. `storage:startup` is in the check chain.

**Remaining.** Next is verified fresh Local genesis and lifecycle-owned scoped indexing, including the
immutable cross-database intent and mandatory factor confirmation. Full creation/migration resumption,
journal-inclusive clear, exact trim, legacy cutover and default application/provider integration remain
owed. Existing index mutations still need the writer/exclusive discipline. Account verifier wiring,
receive authority, PRF/generation/reference composition, runtime-history/IME/performance acceptance and
independent review remain separate work. Evidence and three matrix pins advance; obligations/debt statuses
and the independent L-2 progress record do not change.


---

### Encrypted-store implementation phase nine — verified fresh Local genesis and lifecycle-owned scoped indexing

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Stage:** bounded L-1 integration checkpoint

**Check-in.** Phase eight was committed as `a916d61` before this work. Phase nine remains uncommitted.

**Exit.** [Verified Local genesis](./local-genesis.md) creates the first workspace in a fresh slot without
an Account binding or caller-supplied principal. Exact generated-code confirmation precedes storage.
One exclusive lifetime spans the fresh census, atomic identity/custody claim, custody completion,
authenticated monotone progress, content initialization and scoped index installation. The claim retains
the signed initial custody identity set; its intent also binds content initialization. Resumption verifies
the factor and every surviving stage, consumes existing reservation state, and never restores the initial
snapshot over missing live custody. Ready progress prevents missing initialized carriers from being
recreated even after loss of their witness and index.

Local startup verifies this claim under the eventual writer lifetime, then completes authenticated replay
and admitted initialization before exposure. The picker returns only factor-verified detached routes for
the requested slot. Earlier index APIs now take lifecycle permits and settle slot effects on transaction
completion; add replaces blind creation put. Those APIs refuse Local claims/rows, including incomplete
creation, and cannot bind, close or delete them. The default application still uses its earlier store.

**Evidence.** [Recorded execution](./storage-conformance-runs/2026-09-08-local-genesis.md) passes **17 browser
cases / 160 assertions** and detects **four** mutants. Nine durable-boundary renderer deaths resume the same
winning identity set; each recovered workspace admits text and survives a further offline kill/reopen.
Two creator tabs retain one factor; abort-after-request-success, cancellation/drain, missing/damaged
material, legacy index interference and independent/closed slots are covered. Native database enumeration
is disabled for production and retained only by inventory instrumentation. The first and final browser
runs pass. A unit fixture's invalid actor color was corrected before its real workspace-open assertion.

Startup regression passes **15 cases / 96 assertions / three mutants**; custody passes **13 / 73 / five**;
content passes **13 / 58 / five**. Full Vitest passes **649 tests / 53 files**, with 15 new Local tests.
Typecheck, focused lint/format, build/budget/origin, sixteen vector generators/AAD, WASM verification and
applicable project/governance/traceability checks pass. Initial JS remains **306.3 kB / 350.0 kB** gzipped.
The literal full check chain, geometry and separate unchanged journal/admission/editor/workspace/lifecycle
browser suites were not rerun. `storage:genesis` is now in the check chain.

**Remaining.** Next is journal-inclusive scoped Local clear: authenticated intent, ordered carrier cleanup,
resumable failures and a terminal marker. It must include the retained genesis factor seal as an opener
reference. Adding workspaces to existing slots, Account onboarding/verifier wiring, migration/import,
exact trim and seeded legacy/default-app cutover remain owed. The new progress MAC construction needs
independent review; platform, native IME, runtime history/performance, PRF and generation/receiver/reference
composition remain later gates. Only matrix evidence and three pins advance; no debt status changes.
The independent L-2 progress document is unchanged.


---

### Encrypted-store implementation phase ten — journal-inclusive scoped Local clear

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Stage:** bounded L-1 integration checkpoint

**Check-in.** Phase nine was committed as `ee60528` before this work. Phase ten remains uncommitted.

**Exit.** [Scoped Local clear](./local-clear.md) prepares a factor-verified immutable target, then rereads
under one exclusive slot lifetime and installs an authenticated intent before deletion. Native content
deletion must succeed before journal removal; a blocked request retains exclusion until it settles, even
after cancellation. Exact journal removal and verified absence precede atomic removal of live custody,
the content witness and the retained genesis factor seal together with progress advancement. Exact index
removal follows. A non-content terminal marker prevents automatic genesis and normal key access.

Resumption authenticates progress with the external generated factor, including after every content opener
has gone, and rereads surviving carriers before further effects. Unknown references, changed identity,
damaged metadata and reappearing later-stage carriers refuse. Failed journal cleanup retains remaining
entries and every opener. Initial deletion is limited to the first completed active Local workspace in its
slot; damaged ciphertext can be explicitly deleted within verified ownership. The host owns the deletion
confirmation and closes its initiating writer before clear. No default UI or real user data was changed.

**Evidence.** [Recorded execution](./storage-conformance-runs/2026-09-08-local-clear.md) passes **17 browser
cases / 172 assertions** and detects **five** mutants. Seven durable-boundary renderer deaths resume with
the same authorized target. Native blocked deletion/cancellation, frozen live writers, partial journal
failure, transaction aborts, wrong factor after key removal, queued target changes and independent slots
are covered. The first run exposed the legacy journal prefix overlapping modern namespaces; the legacy-only
census now distinguishes complete modern framing while retaining refusal for ambiguous/legacy keys.

Genesis regression passes **17/160/four mutants**; startup **15/96/three**; custody **13/73/five**; content
**13/58/five**; journal **17/93/six**; admission **15/64/six**. Full Vitest passes **666 tests / 54 files**,
including 17 new tests. One earlier concurrent full run had a static-render assertion failure that did not
reproduce in isolation or the final full run; its cause is unestablished. Typecheck, focused lint/format,
build/budget/origin, sixteen vector generators/AAD, WASM and applicable project/governance/traceability
checks pass. Initial JS remains **306.3 kB / 350.0 kB** gzipped. The literal full check chain, geometry and
separate unchanged editor/workspace/lifecycle browser suites were not run. `storage:clear` joins the chain.

**Remaining.** Exact-coverage content trim/compaction is the next bounded phase. Shared/multiple-workspace
custody, Account removal/revocation, partial-genesis cleanup, cleared-slot reuse, migration/import and
seeded legacy/default-app cutover remain subsequent work. The factor-derived clear MAC needs independent
review. Platform, IME, runtime-history/performance, PRF and generation/receiver/reference composition remain
later gates. Only matrix evidence and three pins advance; no obligations or debt statuses change. The
independent L-2 progress record remains unchanged.


---

### Encrypted-store implementation phase eleven — exact-coverage content trim/compaction

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Stage:** bounded L-1 integration checkpoint

**Check-in.** Phase ten was committed as `d7c0f32` before this work. Phase eleven remains uncommitted.

**Exit.** [Explicit content compaction](./content-trim.md) runs on the journal-capable session under its
existing shared lifetime. It authenticates the disk union, validates content CRDT bytes and merges actual
wire updates, preserving pending structs/deletion sets. The existing allocator durably reserves a new state
record; its committed encrypted bytes precede deletion. A subsequent full authenticated census plus exact
header/nonce/ciphertext comparisons inside the deleting transaction authorize only the initially covered
content records. Heads/outbound, journals, late commits, concurrent replacements and all opener references
remain. Reservation history never shrinks. No caller document or watermark authorizes deletion.

Changed/unreadable records refuse the entire trim; detected damage after publication retains both
replacement and inputs and closes ordinary use. Missing coverage from another compactor or bounded
contention returns `retained` without deletion. Empty or single validated state is unchanged. Deletion
aborts roll back all input removals; interruptions leave either original carriers, safe duplication or the
committed replacement. Fresh maintenance rereads after reacquisition. Close drains pending crypto before
an exclusive successor enters. The default application and paused application-day archival are unchanged.

**Evidence.** [Recorded execution](./storage-conformance-runs/2026-09-08-content-trim.md) passes **21 browser
cases / 128 assertions** and detects **eight** mutants. The 1/3 → state 4 → late 2 schedule preserves 2;
overlapping compactors retain both new states. Valid authenticated record replacement, damage before and
after audit/publication, final journal checking, native transaction aborts, three renderer deaths and
lifetime/generation fencing are covered. The first baseline run passed; an initial mutant harness error on
an absent row was corrected to report its intended failed assertion. New missing-metadata/journal schedules
extend refusal coverage. The evidence records two intermediate unit assertion/performance corrections.

Content regression passes **13/58/five mutants**; journal **17/93/six**; custody **13/73/five**; admission
**15/64/six**; Local clear **17/172/five**; genesis **17/160/four**; startup **15/96/three**. Full Vitest passes
**679 tests / 55 files**, including 13 new tests. Typecheck, focused lint/format, build/budget/origin,
sixteen vector generators/AAD, WASM and applicable project/governance/traceability checks pass. Initial JS
remains **306.3 kB / 350.0 kB** gzipped. The literal full chain, geometry and separate unchanged
editor/workspace/lifecycle browser suites were not run. `storage:trim` joins the check chain.

**Remaining.** Legacy migration/cutover preparation is next: explicit source inventory, old-writer fencing,
fresh key/counter scope and seeded interruption schedules before default-app routing switches. Automatic
maintenance, full-scan memory/performance, large-state chunking, shared/multiple-workspace custody, Account
onboarding/receive/checkpoint authority, PRF and generation/reference transitions remain subsequent work.
Only matrix evidence and three pins advance; no debt status or obligation changes, and the independent
L-2 progress record stays unchanged. Independent review and supported-platform acceptance remain owed.


### 2026-09-09 — production encrypted-storage properties find and repair incomplete compaction

**Outcome.** Phase eleven is committed as `85c7404`. The [native fast-check harness](./storage-properties.md)
now generates, shrinks and replays production journal/content histories with independent source edits,
pending wire inventories and complete-basis recovery. It runs native crypto, storage and writer sessions,
including named overlaps, aborts and real renderer deaths; `storage:properties` joins the project check chain.

Generation found a real pinned-Yjs partial-merge recovery defect. Content compaction now returns `retained`
without reservation/publication/deletion while its disk union has unresolved structs or deletion sets.
Original records and openers survive; a fresh call compacts once the basis reaches content storage. A
four-edit counterexample fails before the fix and passes afterward, including eventual compaction. This
postpones maintenance and may retain growing data; it is not a Yjs library repair or a new byte format.

**Evidence.** [Recorded execution](./storage-conformance-runs/2026-09-09-storage-properties.md) passes
**120 generated histories / 11,461 recovery comparisons**, six corpus replays, 18 renderer deaths and
120 eventual-compaction checks; five source mutants are detected, shrunk and replayed against both faulty
and unmodified production. The updated compaction regression passes **21/128/eight mutants**. Full Vitest
passes **687 tests / 56 files**. Typecheck, focused lint/format, build/budget and applicable project checks
pass. Initial JS remains **306.3 kB / 350.0 kB** gzipped. The evidence distinguishes the initial incomplete-
visibility oracle from the final unconditional wire-inventory/complete-basis oracle and records interrupted
exploration and refined mutation controls honestly. No whole-contract or supported-platform claim follows.

**Remaining.** Legacy migration/cutover preparation is next. The default app, migration, generation/key
retirement, additional/shared Local workspaces, Account authority, PRF and broader editor/interaction
properties remain later work. Full-scan memory/performance, deferred maintenance growth, independent review
and supported-platform acceptance remain owed. Only matrix evidence and its three pins advance; obligations,
debt statuses and the independent L-2 progress record are unchanged. This checkpoint remains uncommitted.


### 2026-09-09 — legacy migration preparation: read-only source and exclusion falsifier

**Check-in.** The completed phase-twelve property tests and compaction deferral were committed as `a0811e2`.
This phase-thirteen preparation checkpoint remains uncommitted.

**Outcome.** Added a private native read-only observer for the predecessor `done` database, its plaintext
`1:` journal and four known ancillary local keys, plus a [migration preparation plan](./legacy-migration-prep.md).
The reader creates no database/provider/identity/keys/route, preserves exact original updates and WAL,
refuses unreadable/unknown bounded input, flags missing CRDT dependencies and detects observed journal
drift. The digest is explicitly an observation, not a quiescence or deletion authority. No default-app
routing, live migration, source cleanup or new cryptographic format is introduced.

**Evidence.** [Recorded native execution](./storage-conformance-runs/2026-09-09-legacy-source.md) passes
100 generated delivery partitions / 400 preservation comparisons and 12 named checks, including one source-
reader renderer death. All four focused source mutants are detected; a saved JSON history replays with
all scenarios and mutants. The actual old provider appends to the plaintext journal and commits while the
new exclusive lock is held, demonstrating that production old-writer exclusion remains owed. Eighteen new
unit tests include another 100 generated partitions; full Vitest passes **705 tests / 57 files**. Typecheck,
focused lint/format, build/budget and applicable project checks pass. Initial JS remains **306.3 kB / 350.0 kB**
gzipped. The evidence records the initial unit-environment and two native fault-harness corrections.

**Next bounded work.** Verified source/export capture under controller-owned exclusion in a seeded browser,
including an independent ten-day, journal-only and dependency oracle. Then an authenticated pre-active
fresh destination/import owner, followed by verified selection and exact resumable cleanup. The plan names
the future cutover kill boundaries; this checkpoint does not execute that matrix. Production exclusion,
carrier/attribution choice and review 3a remain gates for the author's real Stage 2 move. Existing genesis
absence checks must not be bypassed by a synthetic migration caller. General bounded import adapters,
large-state memory/performance and prior L-1/L-3/L-4 acceptance remain owed. Only matrix evidence and three
pins advance; obligations, debt statuses and the independent L-2 record are unchanged.


### 2026-09-09 — verified legacy export capture under controlled seeded exclusion

**Check-in.** Phase thirteen's read-only source observer and migration plan were committed as `e64cd2a`.
This phase-fourteen checkpoint remains uncommitted.

**Outcome.** Added private [capture and replay functions](./legacy-export-capture.md) that preserve original
source record identities, framing and update bytes in a diagnostic recovery packet, alongside an explicit
Markdown preview of all supported authored content. Capture requires complete dependencies, refuses unknown
schema/projection shapes and reobserves the source for drift. Replay checks a separately held packet digest
and reconstructs in a fresh private document without startup/repair/transport. The seeded controller owns
context/worker shutdown and invalidates capture verification after observed exclusion loss. Production
old-writer exclusion, source authority and the real carrier/attribution decision remain separate gates.

Testing caught an initial validator flaw: pinned Yjs can silently skip array items projected as Text,
producing an empty master preview. A live item-kind guard through the pinned seam now refuses it. Capture
also refuses registry cards that ordinary day/unfiled projection would omit because their named collection
exists but lacks their id. Neither correction changes ordinary application export or repairs the source.

**Evidence.** [Recorded execution](./storage-conformance-runs/2026-09-09-legacy-export.md) passes **60 generated
histories / 240 core comparisons**, 16 named checks, seven detected mutants, 64 saved/replayed candidates
and three renderer deaths. Saved JSON replay repeats all named checks and controls. Python ZIP/CRC readback
and a separate input-string ledger verify the ten-day preview, journal-only dependencies and unfiled content.
The source-reader regression passes 100 partitions / 400 comparisons, 12 checks, four mutants and one reader
death. Full Vitest passes **722 tests / 58 files**, including 17 new tests and 100 generated text payloads.
Typecheck, focused lint/format, build/budget, vector/AAD and applicable project checks pass; initial JS remains
**306.3 kB / 350.0 kB** gzipped. The literal full check chain, geometry and separate unchanged encrypted-store
browser suites were not rerun. The evidence records development failures and the limits of each oracle.

**Next bounded work.** An authenticated pre-active destination/import owner, with explicit verified source
and carrier-policy input, mandatory-factor fresh writable store/key/counter scope and bounded idempotent
slices. No import, migration progress, active selection, source cleanup or default-app switch exists in this
checkpoint. The plaintext diagnostic packet is not the fidelity-archive construction. Production exclusion,
the complete cutover kill matrix, Stage 2 carrier choice, review 3a, large-input performance and prior
acceptance obligations remain owed. Only matrix evidence and three pins advance; debt status, obligations
and the independent L-2 progress record are unchanged.


### 2026-09-09 — core review reproductions pause further migration integration

**Check-in.** Phase fourteen's verified export capture was committed as `da5def9`. The user then selected
three core review findings for reproduction before further migration work. This checkpoint changes no
production code and applies no fix; the new reproduction runners, corpus and records remain uncommitted.

**Outcome.** [Recorded reproductions](./core-reproductions.md) establish journal-changed blocking under a
controlled native interleaving, pending-fork projection divergence through actual workspace/editor/export
paths, and pinned Yjs stranding under some original-record delivery orders. The evidence qualifies the
review: ordinary simultaneous keyboard input and uninterrupted snapshot overlap did not reproduce journal
blocking on this Chromium host. A CDP pause can alter event processing. The workspace corpus also heals
through a subsequent Undo command, as well as independent cold reopen. A text-only comparison at promotion
would miss its later dependency-triggered divergence because the visible texts match at promotion.

**Evidence.** Nine native cases complete, including peer append/cleanup while a snapshot is paused,
retained private input until Retry, an uninterrupted 500 ms overlap, independent reopen/Undo controls and
3,200 concurrent keystrokes with/without BroadcastChannel. The bare Yjs campaign executes **150,000 histories**:
169 failures among 50,000 arbitrary permutations, zero observed among 50,000 sender-ordered interleavings,
and zero among 50,000 delayed complete-snapshot joins. A 133-step shrink and saved JSON replay preserve an
original-framing failure. Exhaustive replay of its seven records finds **78 failures / 5,040 permutations**,
with none among the 210 sender-ordered permutations. These frequencies describe the specified generators,
not production risk bounds. Fifty-one existing focused tests, typecheck and focused lint/format pass.
The full unit suite, build and unrelated browser/platform suites were not rerun for this investigation.

**Next.** Design bounded journal-churn handling and pending-projection repair against these reproducible
cases before resuming destination/import work. Complete source/export/import cutover, carrier choice,
production old-writer exclusion, recovery tooling, compaction/costs and prior acceptance remain owed.
The other review findings were not assessed in this selected reproduction pass. No conformance obligation,
matrix pin or debt status changes; the independent L-2 record is preserved.


### 2026-09-09 — core repair phase 1: bounded journal snapshot contention

**Check-in.** The completed core reproductions were committed as `a292103`. The user then authorized
the first bounded repair. This new phase-one checkpoint remains uncommitted.

**Outcome.** Journal initialization, recovery and flush now retry only changed read captures, with three
total attempts under the same live task/permit. Failed captures perform no content work; the content
operation executes once after stable acquisition. Transient churn keeps later input queued and completes
without human Retry. Exhaustion reports `journal-busy`, retains unaccepted input and permits explicit later
Retry/discard. Startup distinguishes busy from unavailable/repair; cancellation clears the pending timer
and retains the lifecycle's cleanup rules. Observed immutable-value replacement latches repair-required.

**Evidence.** [Recorded native execution](./storage-conformance-runs/2026-09-09-journal-contention.md) passes
12 cases, including two controlled cross-tab races and 100 generated read histories; all four focused
mutants are detected. Existing journal/admission/startup regressions pass 17/15/15 cases and detect 6/6/3
mutants. Full Vitest passes **729 tests / 59 files**, with seven new tests including another 100 generated
churn schedules. Typecheck, focused lint/format, build/budget, vectors/AAD and applicable checks pass. Initial
JS remains **306.3 kB / 350.0 kB** gzipped. Evidence records fixture corrections, the narrowed handoff fixture,
and a prose-only clarification after native inputs froze. This does not establish routine contention
frequency; the earlier uninterrupted/simultaneous-typing controls did not reproduce it on Chromium.

**Next.** Core repair phase 2 addresses pending Yjs fork preservation and projection agreement through later
dependency delivery against saved original records, before migration resumes. The compaction mutation path
is not retried; no Yjs/projection repair, generation transition or default-app switch is included. Migration,
source exclusion, large-input performance and prior acceptance remain owed. Only matrix evidence and its
three pins advance; obligations/debt statuses and the independent L-2 record remain unchanged.


### 2026-09-09 — core repair phase 2: exact pending forks and checked projections

**Check-in.** Journal contention repair was committed as `fc1ff41`, using the configured SSH signer.
The user then authorized phase 2. This new checkpoint remains uncommitted.

**Outcome.** Private drafts, runtime history and initial workspace/Goals projections now preserve pending
struct bytes, missing-clock maps and deletion bytes separately from integrated-state serialization. Every
accepted transition checks integrated content and pending state against canonical before ordinary
publication. A mismatch closes access with typed runtime unavailability and preserves durable records.
The initialization error survives its closing session's cancelled barrier. No stored/wire-format, vendor,
transport or migration change is included.

**Evidence.** [Recorded execution](./storage-conformance-runs/2026-09-09-pending-projection.md) passes
12 native cases, 100 generated edit/delivery/undo histories, saved JSON replay and one renderer death;
all seven focused mutants are detected. Tests cover local typing while dependencies are absent, later
editor/export agreement, human-only undo/redo, refused-history privacy and mismatch recovery from retained
originals. Existing admission/editor/workspace/startup regressions pass 15/12/10/15 cases and detect
6/3/4/3 mutants; journal contention passes 12 cases and another 100 generated read histories. Full Vitest
passes **736 tests / 60 files**, including seven new tests and 500 generated repeated-fork histories.
Typecheck, focused lint/format, build/budget, vectors/AAD and applicable checks pass; initial JS remains
**306.3 kB / 350.0 kB** gzipped. Evidence records the two initial fork failures, the newly caught masked
initialization failure and native harness corrections.

**Next.** Resolve the pinned Yjs original-record ordering and pending donor snapshot handoff gates against
saved original bytes before returning to migration. Runtime agreement does not prove canonical semantic
fidelity. Added normalization scans/copies, history retention and pinned internals retain their performance,
memory and independent-review obligations. Default-app cutover, source exclusion and earlier acceptance
remain owed. Only matrix evidence and its three pins advance; debt statuses, obligations and the
independent L-2 record are unchanged.


### 2026-09-09 — core repair phase 3: Yjs delivery order and pending donor handoff

**Check-in.** Phase 2 was committed as `0399567` with the configured signer. The user then authorized
original-record ordering and pending donor handoff work. This new checkpoint remains uncommitted.

**Outcome.** An exact-version patch to Yjs 13.6.31 preserves the earlier cross-client wake-up when an
available reader starts after its dependency. Retry inspection now follows merging the current pending
union, so a newly parked wake-up satisfied later in that pass is drained before returning. Source, ESM,
CJS and transitive peers are pinned and checked before build. Wire/storage formats, scoped channel API,
exact runtime forks, strict projection comparison and incomplete-content retention policy are unchanged.

**Evidence.** [Recorded execution](./storage-conformance-runs/2026-09-09-yjs-delivery.md) passes all 5,040
orders of the saved original bytes and 150,000 generated original/handoff/concurrent histories. Reversing
the earlier wake-up change reproduces exactly 78 failed orders. Eight native cases include 100 generated
channel histories, a saved generated failure, pending deletion/pressure paths and one renderer death
followed by snapshot-only recovery. All five new native controls are detected; explicit Node/native JSON
replays pass. The generator caught a second real bookkeeping mismatch despite identical pending bytes;
draining ready retries fixes it without weakening the projection check. A clean offline frozen-lockfile
installation and ESM/CJS runtime checks pass.

Full Vitest passes **741 tests / 61 files**, including 3,000 new generated histories and 500 repeated-fork
histories. Projection passes 12 cases / 100 histories and six current controls. Admission/editor/workspace/
startup pass 15/12/10/15 cases and 6/3/4/3 controls; trim passes 21 cases / eight controls. Storage properties
pass 120 histories, six corpus replays, 18 renderer deaths and four shrunk/replayed controls. Journal
contention and legacy source/export regressions pass. Typecheck, lint/format, patch guard, build/budget,
vectors/AAD and applicable checks pass; initial JS remains **306.3 kB / 350.0 kB** gzipped. The old serialized-
startup and partial-merge semantic controls are retired because those saved behaviors now recover; the
trim deferral-policy control remains. Development harness corrections are recorded separately.

**Next.** Return to bounded pre-active destination/import preparation, with explicit carrier policy and
verified source input; no migration selection or cleanup follows automatically. Production old-writer
exclusion, source preservation, default-app integration and existing acceptance remain owed. The local
library patch and whole-state checking still need independent review, large-state and low-end performance
acceptance. Only matrix evidence and its three pins advance. No obligation, debt status, payment record or
independent L-2 record changes.


### 2026-09-09 — pre-active Local destination/import owner

The preceding Yjs delivery repair is committed as **a465310**. The next bounded L-1 phase is implemented
and uncommitted: [construction](./legacy-import-preparation.md),
[execution evidence](./storage-conformance-runs/2026-09-09-legacy-import.md). Generated-factor confirmation
installs an authenticated immutable source/policy/plan/identity intent with fresh custody and counters.
The owner imports 1–32 bounded actions per invocation, authenticates consecutive encrypted receipts on
resume, and rereads committed content for semantic verification. The destination remains pre-active,
ordinary opens/index mutations refuse it, and the source retains its exact native/localStorage bytes.
No Local genesis absence check is bypassed; no ready index, source selection/deletion or default-app switch
is installed. The explicit Markdown/system adapter does not settle the real cutover carrier.

A directed restarted-writer stress probe found that replacing one mutable Yjs progress key caused deletion
metadata to exceed 16 KiB at action index 2296. Immutable per-action receipt keys repair that mechanism.
Five generated 2,000–4,000-card writer histories replay each update to a separate receiver; the native
2,601-action stress keeps each update at or below 344 bytes. These simulate distinct runtime writer ids,
not thousands of browser process deaths. Native schedule generation covers real bounded resumes/aborts;
a repeated-write mutant shrinks five times and saves a replayable input.

Final native evidence passes 22 cases, 60 generated histories, ten renderer deaths and all six controls.
Full Vitest passes 755 tests / 63 files. Custody/content/journal/admission/startup/genesis/clear and source
export regressions pass with their controls; export also carries 60 generated histories and three deaths.
The custody runner's missing frozen guard dependency and an early crash-fixture timing error were corrected
before credited runs. Earlier mutable-receipt passes remain development evidence, not final acceptance.

Verified cold destination selection and its interrupted index/progress commits are next. Production old-writer
exclusion, live carrier choice, source cleanup, full cutover terminal-state/residue acceptance, independent
review and performance/profile gates remain owed. Whole-input planning and replay are still in memory.
Only conformance evidence and the three matrix pins advance; no obligation/debt status or payment changes.

### 2026-09-09 — verified Local import selection and ordinary-owner handoff

Pre-active import is committed as `a0072e8`. The [next bounded owner](./legacy-selection-preparation.md)
cold-verifies factor-opened destination records against the same verified source/policy/plan binding. It
checks the current source observation before verification and before the final decision under externally
established seeded exclusion. A signed selecting intent precedes an exact scoped index add; one final
custody transaction replaces the pre-active marker with a signed ready Local claim carrying authenticated
import provenance. The index alone cannot authorize opening. Live custody, keys, content and counters are
preserved. Normal Local factor unlock, picker, replay and admission then own the selected workspace.
Completed retries authenticate the recorded selection without reimporting or comparing later edits against
the old payload. Imported Local clear refuses pending its source cleanup owner.

[Execution evidence](./storage-conformance-runs/2026-09-09-legacy-selection.md) passes 20 native cases,
60 generated source/abort/restart/edit histories, three renderer deaths and five named controls. The damaged
import control shrinks twice and saves an input. Full Vitest passes 765 tests / 64 files; the new suite
includes 30 generated partial states. Pre-active import, genesis, clear and startup regressions pass.
A directed fault found that the first final census accepted a lost route and incorrectly returned selected;
the added route-presence requirement now refuses and resumes safely. Before/after evidence and a native
sensitivity control retain that failure mechanism. It is not an observation of silent native storage loss.

Source cleanup, production supported-version exclusion, real cutover carrier choice, default application
routing, complete legacy cutover/residue acceptance and independent review/platform/performance remain owed.
No source material is deleted and no whole obligation/debt status/payment changes. This checkpoint is
uncommitted; the next bounded phase is authenticated, resumable journal-inclusive legacy source cleanup.

## 2026-09-09 — Cleanup failure preservation and bounded harness diagnostics (`L-1`)

Preserved the interrupted `4c3c3ab` campaign's input and diagnostic with byte hashes and explicit unresolved
provenance. The old generic refusal discarded its browser stack; new fixture wrappers preserve message/stack/cause.
The cleanup harness now checkpoints partial reports and first failures before shrinking, logs trial/operation
progress, and bounds calls, cases, shrinking, campaigns and teardown. A separate supervisor bounds the worker
even when its event loop wedges or it leaves a handle after reporting success. Timeouts cannot satisfy named
fault-control assertions. Saved-input replay now bypasses directed cases and runs once without shrinking.

Thirteen Node-only harness tests pass, covering archival hashes, original error details, failure-before-shrink,
stalled calls/shrinks, campaign limits, independent teardown, deadline options, a wedged worker and its registered
disposable process, post-report leaks, exit status, an orphaned browser and worker import failure. These tests import no cleanup runtime
and launch no real browser. No historical replay or native cleanup campaign ran in this checkpoint; the cleanup
implementation remains unvalidated as a complete phase. The next work is replay and diagnosis, followed by the
full native campaign and controls. No migration coordinator, cutover or debt payment is claimed.

## 2026-09-09 — Focused cleanup size-boundary repair (`L-1`)

The user's native run exposed `Field too long` in generated history 21, then exhausted the shrink budget.
Preserved its confirmed input, diagnostic and partial report with hashes. Four new before-repair tests failed
on database/local fingerprint widths, manifest persistence and generated UTF-8 boundaries. Cleanup now creates
v2 intents using explicit bulk MAC framing, with unchanged shared custody fields and resumable v1 progress.
The generated abort assertion requires an observed transaction boundary; reports retain the original failure
separately from terminal timeouts.

The confirmed native input passes one replay without shrinking. Ten targeted native regressions pass, including
one deliberate renderer death. Full Vitest passes 783 tests / 66 files; the seven new bounds tests include a
large valid legacy journal, large authenticated manifest, 30 generated byte-boundary cases and v1 compatibility.
Fourteen Node harness tests pass. [Executed evidence](./storage-conformance-runs/2026-09-09-legacy-cleanup-size-repair.md)
records the before/after artifacts and runtime hashes. The repair is uncommitted. The complete native campaign
and all seven fault controls remain next; source cleanup is not yet accepted as a complete phase. No migration
coordinator, cutover or debt payment is claimed.

### Cleanup commit checkpoint — 2026-09-09

Harness instrumentation is committed as `6a5ebe7`; the confirmed native failure, complete event log and available
pre-repair evidence as `082b567`. The following repair checkpoint includes the previously recorded focused repair
and exact copies of its passing replay, ten-case native report, full-unit report and final bounds report. Their
original run-time commit/file hashes remain intact. The user is running the full campaign separately; no result
from that in-progress run is claimed here.

## 2026-09-09 — Bounded native source-cleanup validation closed (`L-1`)

The user's exact `pnpm storage:legacy-cleanup` run at `2026-09-09T19-38-39.778Z` completes in 295.304 seconds:
45 directed cases, 60 generated histories (seed 8941), 16 deliberate renderer crashes and all seven named
fault controls pass, with no timeout or teardown failure. The formerly failing history 21 has the same input
hash and now passes. Logged errors are the intended renderer crashes and mutation assertions; baseline has
no first failure. [Preserved evidence](./storage-conformance-runs/2026-09-09-legacy-cleanup.md) includes all eleven
top-level artifacts, a lossless full event log, and copy hashes/provenance. No campaign was rerun to record it.

The report keeps its actual starting commit `4c3c3ab`. All 148 tested file hashes match the frozen baseline,
working files before documentation edits and Git blobs at repair commit `3e7981b`; that identifies the tested
repair despite commits made while the run was in progress. Together with the focused before/after tests,
this closes native validation for the bounded seeded source-cleanup component. It does not pay L-1, full
legacy-cutover/residue, production exclusion, platform/performance or independent-review obligations.

## 2026-09-09 — Migration coordinator and restart preparation (`L-1`)

Prepared the [next bounded implementation contract](./legacy-coordinator-preparation.md): readonly restart
classification and one explicitly requested step through existing import, selection and cleanup owners.
Authenticated component records remain the only durable progress; no duplicate coordinator stage is added.
The preparation distinguishes pre-active recovery from selected editing and manifest-based deletion resume,
requires the same externally saved/cold-verified recovery packet and factor, and specifies stale-dispatch,
clear, missing-input and exclusion-loss behavior. Selected edits remain recoverable without the packet,
although maintenance retries still require it through the current APIs.

The next native harness must connect host exclusion loss to cancellation and native draining; existing epoch
assertions alone do not stop in-flight work. The plan includes cross-owner crash/abort schedules, generated
external-ledger histories and named controls with bounded diagnostics. Production exclusion, recovery-save
ceremony and real carrier choice are explicit default-app prerequisites. This checkpoint is documentation
and retained evidence only: no coordinator runtime, product cutover or new native acceptance is claimed.

## 2026-09-09 — Private migration coordinator and restart composition (`L-1`)

The prior cleanup-validation/preparation checkpoint is committed as `f4ed6bc`. The new private coordinator
inspects an explicit Local slot, owns factor enrollment and dispatches one requested import, selection,
cleanup or verification step. Existing authenticated component records supply restart authority. It copies
recovery input before waiting, disposes owned buffers/ceremonies, refuses retained-state reminting and drains
native work before close completes. A new read-only cleanup verifier requires terminal signed progress under
its own permit, followed by a fresh ordinary Local open; no second progress/completion record is persisted.

[Preserved evidence](./storage-conformance-runs/2026-09-09-legacy-coordinator.md) passes 33 directed cases plus
three focused dispatch-gap cases, 60 generated histories, 19 renderer deaths and ten named controls. Histories
check external source/operation, exact carrier, destination identity and reservation ledgers across saved-file
replay, bounded import, missing input, later journal edits and interrupted cleanup. Source/route/clear changes
between inspection and dispatch refuse without mutation. The first campaign exposed a harness scheduling
assumption: the terminal import abort may need several bounded calls. Its exact first failure and shrink-budget
expiry remain preserved; the corrected schedule passes the saved input and full campaign. No minimality or
coordinator data-loss finding is claimed from that failure.

Full Vitest passes 793 tests / 67 files, including 30 generated coordinator histories; 14 supervisor tests pass.
Native import/selection/cleanup regressions each pass 60 generated histories and all directed cases/controls;
startup and Local clear pass 15/17 cases and three/five controls. Typechecking, targeted lint and formatting
pass. Tested reports retain starting HEAD `f4ed6bc` and the uncommitted source hashes; native runtime inputs
match this implementation. Three dispatch cases were added after the full campaign and run separately.

The default app does not call the coordinator. Production exclusion/recovery-save host preparation is next;
real carrier choice, full-profile residue, platform/performance, independent review and default-app cutover
remain owed. No obligation or debt is paid. This outcome is appended before rewriting the L-1 active slice.

## 2026-09-09 — Production migration host preparation (`L-1`)

Committed the validated private coordinator and its preserved native evidence as `7d238ee`.
Prepared the [host contract](./legacy-host-preparation.md) and a
[pinned static source inventory](./legacy-host-sources.json): 36 repository files across `af8941e` and
`7d238ee`, plus three installed dependency files. The current default app still opens the legacy provider;
its worker can serve cached old executables, and its locks do not exclude unmodified old writers.
The preparation does not establish a production exclusion primitive or new native acceptance.

Specified a disposable persistent-profile preflight with pre-execution containment experiments, actual
cached predecessor shells, full process restarts, independent carrier/operation ledgers, externally saved
packet readback, generated schedules and named controls. It has no destination or deletion authority.
Unsupported target coverage must remain explicit, and a failed mechanism must yield a preserved
counterexample instead of a coordinator bridge. Browser API documentation constrains the candidate;
CDP support alone is not treated as proof of whole-profile exclusion.

Static inspection also found a conditional carrier outside the current cleanup manifest: installed
`y-websocket`/`lib0` can persist base64 protocol messages at a relay/room localStorage key when native
BroadcastChannel is absent and localStorage is available. No deployed footprint or native reproduction is
claimed. The preflight must reproduce/classify this path and refuse unsupported carriers; existing bounded
known-source cleanup evidence remains accurately scoped. No broad deletion is authorized by this discovery.

The contract separates durable source preservation from volatile visible old edits, same-origin coordination
from a future cross-origin move, and local dependency completeness from remote reconciliation. It specifies
packet/factor ownership without a new durable host stage. Production profile access, lasting executable
retirement, actual save UX, carrier/attribution choice, full residue and platform/review gates remain open.
This is documentation only; default startup, runtime, conformance matrix and debt statuses are unchanged.
This outcome is appended before replacing the L-1 checkpoint; the L-2 seat remains untouched.

## 2026-09-10 — Persistent-profile migration host preflight (`L-1`)

Committed host preparation as `0d9c733`. Implemented the private disposable-profile runner and readonly source/
recovery fixture. It builds the actual pinned legacy application/worker, retains persistent browser profiles
across process death, reads native carriers independently and saves/syncs/closes/rereads the recovery file
outside the profile. No destination owner, factor mint, coordinator bridge or default-app cutover is enabled.

[Preserved evidence](./storage-conformance-runs/2026-09-10-legacy-host.md) passes ten directed diagnostic groups,
60 generated native histories (seed 8941), seven controls and one later focused history-omission control.
Seven new Node tests (including 100 filesystem histories), 14 existing supervisor tests, typecheck and focused
lint/format checks pass. Raw reports retain source/build/browser/protocol hashes and the tested dirty snapshots.
Existing encrypted runtime files remain unchanged; old full unit/component native suites were not rerun here.

**The host candidate is unsupported.** First-script page/frame writes occurred during attempted CDP pausing.
A browser crash restored the old cached application at a maintenance URL and changed source. Worker no-write
windows remain finite observations; history reloaded instead of exercising BFCache and installed-window UI is
untested. The final second-process attempt was rejected without observed source write. Native dependency
fallback retained a recoverable plaintext protocol update outside the cleanup manifest; deployed presence is
unknown. Old direct assets wrote and a live provider reconnected after `done.sync` removal.

Two generated failures exposed unsettled localStorage persistence: fresh writes disappeared, and removed old
journal entries reappeared after whole-browser kill. Preserve their first inputs/errors, shrink-budget expiry,
exact replays and reconstruction evidence. Readonly generated histories now declare their baseline only after
clean profile reopen, including after deliberate source drift; a separate negative case retains the unsettled
boundary. This qualification does not establish arbitrary browser/power-loss durability or change encrypted
runtime guarantees. Original externally saved packets still cold-replay the independent operation ledger.

The next bounded work is revised host-strategy preparation around control before profile/session execution,
preservation of unsettled visible source work and lasting executable/transport retirement. Do not bridge this
candidate to the coordinator. Production platform/profile access, recovery UX, actual carrier/attribution,
remote reconciliation, cross-origin transfer, full residue and review/performance remain gates. Matrix pins
and all debt statuses/requirements remain unchanged. This outcome precedes the L-1 checkpoint rewrite.

## 2026-09-10 — Revised cold-start host preparation (`L-1`)

Committed the private preflight, counterexamples and immutable evidence as `fbfc3ba`. Verified its archived
bytes and tested input hashes before commit. Prepared the [replacement experiment](./legacy-host-cold-start.md)
against first-script pages/frames and crash-restored cached executables; no new native acceptance is claimed.

Selected a disposable policy-bearing Linux runtime with mandatory global JavaScript denial installed before
source-profile launch. CDP becomes a bounded storage-observation channel, with no script-enabled maintenance
URL exception. Official policy documentation exposes a further design constraint: origin-scoped blocking is
based on the top-level document and does not contain a source frame inside an allowed foreign page. Dynamic
policy application also does not establish that ongoing work ceased. Worker/background coverage and exact
script-denied storage access remain hypotheses requiring native falsification.

Compared callback/website-only control, origin blocking, the selected global-denial experiment, offline
filesystem extraction and a custom embedded host. Specified immutable policy ownership across controller death,
second-process/restart tests, binary/paged protocol observation, independent source/sentinel/network ledgers,
positive controls, explicit unsupported coverage and a 20-history first campaign. The first build is limited
to denial/observer feasibility; readonly packet parity follows only if it survives. Installed tooling is not
proof of a running Linux runtime; provisioning and pinning that disposable environment is implementation work.

Separated the closed-source fixture precondition from lossless acquisition of live visible edits, and temporary
denial from lasting retirement before modern execution is enabled. Neither source settlement nor full old-code/
transport retirement is implemented by this preparation. Kept mandatory factor custody, source-origin checks,
authenticated cleanup scope and the real carrier/attribution gate intact. Default startup/runtime, existing
native reports, matrix pins and all debt statuses are unchanged. This outcome precedes the L-1 checkpoint rewrite.


## 2026-09-10 — Cold-start global-denial/observer experiment (`L-1`)

Committed the revised preparation as `f8fdf1f`. Built the private cold-start runner in a dedicated Debian/Lima
VM with mandatory global JavaScript denial installed before synthetic source launch, readonly policy mounts,
a separate network/PID namespace and the browser sandbox enabled. No real profile, host policy, coordinator
bridge, factor mint or default-app cutover was introduced. The earlier preflight is unchanged.

[Preserved evidence](./storage-conformance-runs/2026-09-10-legacy-host-cold.md) passes 15 denied and 15 allowed
directed cases, 14 origin-only cases, four native write-producing invalid-policy controls, a recommended-policy
configuration-refusal diagnostic, and 20 generated sequences (seed 8941). Each generated sequence kills a
separate controller and cold-restarts the browser. Exact DB/WAL/binary/unknown-key/cache comparisons pass under
the clean-reopened fixture precondition. Actual cached/direct predecessor controls cold-recover the injected
text from stored Yjs bytes. Native shrinking is disabled; original inputs and prefixes remain preserved.
Seven new Node tests (300 generated byte/pagination cases), all 28 combined harness tests, the installed
TypeScript check and focused static checks pass. Evidence pins the browser/package/launcher, effective policy,
source/build hashes, failed attempts and exact guest bundles. The dedicated VM is stopped after collection.

**Production host support remains unproven.** Origin-only blocking permits the foreign-top-level source frame
to write. Retained worker fetch under denial has no independent delivery proof; background events, actual
BFCache and installed windows remain open. Recommended-only policy's attempted user override did not write,
so only its configuration refusal is credited. Dynamic late policy installation/removal is not a completed
native control. The second invocation was rejected, not shown to be contained after successful entry.

Harness counterexamples repaired an orphan timeout loop, blob notifications, provisional navigation reads,
and cached-app baseline/positive-control races. Allowed writers may cause a recorded moving-source refusal
before a complete read; denial comparisons remain strict. The final complete run required no such retry.
This does not establish lossless live-source shutdown or lasting old-code/transport retirement.

Next is bounded readonly source/packet parity under the same denial, reusing production parser/digest/packet
rules and retaining origin checks. No census may become an authenticated cleanup or coordinator capability.
All production coverage, source settlement, real recovery UX, carrier/attribution, residue and review gates
remain open; no matrix/debt status changed. This outcome is appended before replacing the L-1 checkpoint.


**Runtime-boundary addendum, same phase.** Final review found that the dedicated Lima guest account retains
passwordless sudo. Added inherited Linux `NoNewPrivs=1` to the browser/controller process tree and tested that
`sudo -n true` fails because of it. The full native campaign passes again, with the browser sandbox intact,
in `2026-09-10T06-43-14-597Z`; that is the credited run. Earlier complete and failed runs remain immutable
preceding evidence. No positive-control source-read retries were needed in the credited run. The dedicated
VM was stopped again after collecting this evidence.


## 2026-09-10 — Local application startup and personal-cutover scope (`L-1`)

The author clarified that there is no deployed instance and accepted the existing private
`markdown-system-v1` importer. [Row 21](./selections/row-21-development-cutover.md) records system attribution
and the other metadata losses. PRD, TRD, sequencing and the action tree now agree. Automatic VM/policy host
research is no longer the active cutover work; its bounded evidence remains on record. The author controls
all interaction with the personal browser. Private Markdown and relay backups were preserved outside git;
updated relay replay matched all 24 exported files, then the temporary relay and route were removed. This
was recovery preparation, not import, selection or source cleanup.

Built the [staged Local app entry](./local-app-startup.md) at `/local.html`: read-only classification,
generated device-lock code display and separate confirmation, factor unlock, resumption of the same partial
genesis, and a verified read-only preview. It uses the existing Local lifecycle/custody/admission owners.
Lock, cancellation and page lifetime changes retire the owner and remove the preview. Actor labels derive
from the authenticated Local principal; no plaintext legacy identity cache or transport is attached. The
ordinary app remains at its existing entry until admitted editor integration is ready.

[Evidence](./storage-conformance-runs/2026-09-10-local-app-startup.md): four native startup cases and two
packaged offline cases pass in disposable Chromium profiles; the full unit suite passes 800 tests across
68 files. Seven controller tests include 100 refusal/action histories and 50 close-timing histories, seed
8941. Directed testing exposed early close completion during state notification; the owner now installs
its operation before notifying and drains late opens. A ready-handoff case checks listener disposal.
Packaged tests exposed the missing Local HTML precache and static-host `Vary: Origin` misses; both entries
now reload offline. Static cache lookup is limited to the current build's entries/assets. Each HTML entry
has the same initial-JS budget check. No private content or personal browser profile was used in fixtures.

Next is bounded admitted editor integration, followed by a rehearsal of the operator-assisted private
import and cutover. Full application mutation coverage, real source capture/recovery/import/selection/cleanup,
profile residue, latency/platform evidence and independent review remain open. No conformance debt or matrix
pin is paid by this phase. This outcome was appended before replacing the L-1 checkpoint; L-2 is untouched.

## 2026-09-10 — Admitted Local editor and default entry (`L-1`)

Committed the preserved cold-start experiment as `0aec587` and the Local startup/personal-cutover checkpoint
as `46d9cd6`. Connected the existing editor UI to the verified Local workspace and switched both `/` and
`/local.html` to that factor-gated application. Read snapshots replace active UI access to the legacy Store;
CodeMirror and semantic commands use the existing admission owner. Compose waits for acceptance before
clearing its draft, pending input has retry/discard controls, and locking/invalidation disposes editors
before closing the owner. Goals/card operations, stale/unfiled actions, history, archive reads, export and
explicit preferences are connected. The device display label lives in encrypted metadata and is not a
credential. Local remains disconnected from relay transport.

[Evidence](./storage-conformance-runs/2026-09-10-local-app-editor.md): 804 unit tests in 69 files, eight native
application cases, two packaged offline cases, and 84 geometry/workflow cases pass; ten existing
device-specific geometry skips remain. The native editor and workspace campaigns pass with their seven
combined injected-fault controls, and pending projection passes 12 cases including 100 generated histories.
The new application generator checks 20 compose/undo/redo histories against a separate ledger through cold
reopen, seed 8941. The 1,000-case whole-line deletion property found and shrank a trailing-line separator
defect; native Goals copy/remove exposed selection collapse on unrelated accepted commands. Both are fixed
and retained. Test-boundary/key/metadata-undo mistakes are recorded separately from implementation defects.
TypeScript, focused static checks, production build/budget and origin isolation pass. Desktop and settled
mobile views were inspected using synthetic writing in disposable profiles.

The [bounded contract](./local-app-editor.md) retains explicit limits: no attached Account transport, new
automatic compaction scheduler, real browser cutover, personal source capture/import/selection/cleanup,
whole-profile residue result, wider platform/latency evidence or independent review. The full `pnpm check`
chain was not rerun and no debt or conformance matrix status is paid. Next is operator-assisted private
import/cutover rehearsal, then author-controlled browser steps. Personal backups and the stopped host VM
remain unchanged. This outcome precedes the L-1 checkpoint rewrite; L-2 is untouched.

## 2026-09-10 — Private operator page and import/editor rehearsal (`L-1`)

Committed the admitted editor integration as signed commit `46a17fb`. Built the private development page
at `/private/migration.html` around the existing coordinator, without changing the ordinary app runtime or
adding a production entry. The page captures and downloads separate recovery/binding files, requires saved
file replay after restart, confirms a generated factor separately, resumes bounded import with the original
factor/input, selects through the authenticated owner, and hands off to ordinary Local unlock/editing.
It adds no durable UI progress record, plaintext browser cache, transport, source deletion or exclusion claim.
The [operator procedure](./private-migration-procedure.md) keeps old-client quiescence with the author and
refuses observed service-worker registrations/controllers without deleting site data.

[Preserved evidence](./storage-conformance-runs/2026-09-10-private-migration.md): all 809 unit tests in 70
files and four native private-page cases pass. Five new unit tests include 200 generated packet/binding
corruptions and 150 retained-intent UI histories, seed 8941. Native tests save/reselect actual files, crash
the renderer after partial import, resume with the same factor, cold-select/open the normal editor, compare
both ZIPs against an external string ledger, and recover a later accepted edit after lock/reopen. Original
database/journal/ancillary bytes are retained. Wrong digest/origin, source drift, an observed content-transaction
abort and retained worker registration are covered. The first crash fixture incorrectly awaited the dead
renderer's command response; it now awaits the independent crash event. No new runtime defect was established.
TypeScript, focused static checks and ordinary build pass; private utility code is absent from the built
entries and both remain at 326.6 kB under the gzip gate. Desktop/mobile layouts were inspected.

The real personal source was not captured, imported, selected or deleted, and no personal server/browser
route changed. No complete check chain, new mutation battery, general host exclusion, whole-profile residue
result, platform/latency evidence or independent review is claimed. Source cleanup remains a separate step
under its existing authenticated owner and actual preconditions. Next is preparing this private utility at
the author's existing origin, then guiding the author through service-worker retirement and capture while
preserving site data. This outcome precedes the L-1 checkpoint rewrite; L-2 is untouched.

## 2026-09-10 — Obsolete day-journal capture compatibility (`L-1`)

The private utility/rehearsal is committed as signed `9c2c48f`. The development server now serves it at the
author's existing origin through the unchanged root route, with relay disconnected. The author reached
capture after the service-worker check passed; the first capture refused `unsupported-legacy-day`.
Historical feature removal left day-level `journal: Y.Text` fields in the source. The author explicitly
permits omitting that obsolete prose from the import, recorded in row 21. The validator accepts that known
plain-text shape while retaining all original recovery update bytes and existing refusal boundaries.
The utility explains the omission; this does not change durability-journal recovery or authorize deletion.

[Evidence](./storage-conformance-runs/2026-09-10-obsolete-day-journal.md): the synthetic failure reproduced
before repair; 95 relevant unit tests in eight files and all four native migration/editor cases pass.
The 100-case generated export property now independently varies obsolete prose. Directed checks retain
the raw updates and source digest while omitting empty/nonempty, archived and journal-only day prose from
the independent current-content ledger. Two initial native runs lost their seeding page before capture;
a focused rerun passed, and a separate test dependency cache/explicit entry scan now avoids sharing the
operator server's optimizer cache. The final complete campaign passes from that new cache. The precise
initial reload trigger was not established. TypeScript, focused static checks, production build/budget,
origin isolation and documentation gates pass; ordinary entries remain at 326.6 kB gzip.

Read-only strict replay of the unchanged personal relay backup and in-memory import planning now pass;
all 24 current-content files still match the verified Markdown backup. No real capture, destination intent,
selection or cleanup is yet recorded. Next is the author's capture retry in the same browser/origin.
The complete check chain and older native campaigns were not rerun; no debt or conformance status changes.
This outcome precedes the L-1 checkpoint rewrite; L-2 is untouched.

## 2026-09-10 — Personal Local import, selection and reopen verification (`L-1`)

The author completed the private browser walkthrough after the obsolete day-journal compatibility repair:
saved packet/binding verification, private factor storage and confirmation, bounded import, selected Local
destination, ordinary editor unlock and visual check. The author controlled every browser interaction.
File-only strict replay verified the actual saved packet/binding, and its preview matched all 24 earlier
Markdown backup files. The new Local export preserved Goals and all 22 day files byte-for-byte and all six
unfiled bodies/order; only expected unfiled provenance metadata changed.

The author then added a larger Goals block, locked, closed the tab, reopened the same origin and unlocked.
The author confirmed the addition remained visible. Independent ZIP/CRC comparison of the subsequent export
found exactly one appended Goals block (456 nonblank lines), with all original Goals characters, day files
and unfiled bytes unchanged. The author confirmed that the larger addition was intentional. The new block's
exact expected bytes were not independently supplied; this is a successful personal reopen check, not a
complete failure/conformance proof. See the [walkthrough record](./storage-conformance-runs/2026-09-10-personal-local-import.md).

Private recovery/export files are excluded from Git; detailed hashes/comparisons remain in ignored local
records. The device-lock code stays with the author. No plaintext source cleanup or packaged application
cutover occurred: the existing origin still serves the development app with relay off. Next is committing
the repair/checkpoint, preserving these artifacts alongside earlier backups, and preparing packaged/offline
serving at the same origin. Source cleanup remains a separate operator step. No conformance debt or matrix
status changed. This outcome precedes the L-1 checkpoint rewrite; L-2 is untouched.

## 2026-09-10 — Packaged serving and final-output precache repair (`L-1`)

Committed the personal import/reopen checkpoint as signed `8db7070`. The author chose to keep both the
build and serving process in this worktree/Codex session. New personal recovery/export files and private
verification records were copied and verified beside earlier backups. After the author locked and closed
the personal app, the development server was replaced by Vite preview of this worktree's `dist/` on the
existing loopback port and unchanged Tailscale route. Relay remains disconnected; no source cleanup occurred.

Build inspection caught two nonexistent entry chunks in the precache list: Vite removed them after the
old generator ran, while the preview server's HTML fallback hid their absence from the original offline
tests. The generator now reads final written files, includes public icons/manifest, and versions all cached
bytes including fixed-name files. One unit test and three native packaged cases pass: exact file/HTTP
parity plus new-tab offline opening, editing and recovery after another close/reopen for both entries.
Build, TypeScript, focused static checks, budget and origin isolation pass; ordinary entries stay at
326.6 kB gzip. See [preserved evidence](./storage-conformance-runs/2026-09-10-packaged-serving.md).

Read-only checks through the personal HTTPS URL match all cached asset and worker bytes to the build,
exclude private files and confirm relay rejection. The author has not yet performed the online first load
and offline check of this package. That is next, one browser step at a time. The full runtime/check chain,
new property campaigns, personal source cleanup, residue and independent review are not claimed. This
outcome precedes the L-1 checkpoint rewrite; L-2 is untouched.

## 2026-09-10 — Personal packaged offline recovery confirmed (`L-1`)

The author opened the packaged app at the existing origin, unlocked the existing Local workspace and
confirmed the writing was present. The preview server was then stopped; an independent HTTP request
returned 502, confirming the app backend was unavailable. The author confirmed normal cached reopening,
then made an edit and confirmed it survived locking, closing, normal reopening and unlocking while the
server remained stopped. A forced refresh failed against the unavailable server; a subsequent normal
refresh recovered the cached app. That observation does not establish that the worker cache was cleared.

The same packaged preview was restarted in this worktree/Codex session. Read-only HTTPS checks returned
200 and matched both the application HTML and service worker to the existing build bytes. No rebuild or
browser storage change was needed. The personal browser result is author-reported, with no independent
export comparison of this particular offline edit; the separate synthetic native cases remain preserved
in the [packaged serving record](./storage-conformance-runs/2026-09-10-packaged-serving.md).

The bounded personal packaged cutover is complete. Its build repair and evidence await commit. The build
and server remain here at the author's request, relay remains disconnected, and the original plaintext
source remains retained. Authenticated source cleanup and the broader conformance/review gates are
separate work; no debt or matrix status changed. This outcome precedes the L-1 checkpoint rewrite;
L-2 is untouched.

## 2026-09-10 — Compatible app upgrade handoff and one-off cleanup preparation (`L-1`)

Committed the packaged/offline checkpoint as signed `07d89f6`. The author selected safe upgrades next and
requested a DevTools paste helper for personal source cleanup. Prepared that helper around the existing
authenticated coordinator/cleanup owner, with saved packet/binding verification, existing factor, exact
deletion progress and a separate same-origin dependency realm. Wrong-code retry, source absence, modern
encrypted-journal preservation and later-writing recovery pass in a disposable seeded browser. Actual
personal cleanup remains pending; no personal browser operation or source deletion was performed.

The first bounded upgrade phase verifies every downloaded static asset against the generated worker's
release hashes, waits for old controlled tabs to close, avoids forced reload/takeover and removes only
its own base-scoped older caches. A menu/startup notice describes the normal lock/close/reopen handoff.
Worker policy changes also change the cache identifier. Builds and tests use isolated output directories,
leaving the author's live build and server intact.

Eight native upgrade cases, five native cleanup/migration cases and 37 relevant unit tests pass. The
upgrade properties include 120 generated failure/retry histories and byte-verification/cache-scope controls;
native coverage includes the actually served predecessor, two live old tabs, later edits, failed updates,
offline reopen, renderer death, compatible rollback and an immediate-activation mutant. The new helper's
stale-error retry defect was reproduced and repaired; instrumentation corrections remain named separately.
See the [preserved record](./storage-conformance-runs/2026-09-10-app-upgrades.md).

This is compatible application-file replacement, not authorization for an incompatible storage migration.
The next bounded upgrade work is a reader/writer compatibility and lifecycle migration contract before any
persisted format changes. Personal cleanup and deployment of the prepared policy remain operator steps.
No conformance debt or matrix status changed. This outcome precedes the L-1 checkpoint rewrite; L-2 is
untouched.

## 2026-09-10 — Personal source cleanup confirmed (`L-1`)

The author ran the one-off DevTools helper, reported successful source cleanup, closed it, and then
unlocked the encrypted workspace with the writing still present. The exact completion message was not
retained. This is the author's observed result, not an independently captured personal storage census.
External recovery files, exports and relay backups remain retained; the other pre-encryption device has
not been joined or cleaned. The prepared application-upgrade build has not replaced the live package.
The next bounded implementation is reader/writer compatibility before future persisted-format changes.
This outcome precedes the L-1 checkpoint rewrite; L-2 remains unchanged.

## 2026-09-10 — Storage compatibility interlock and upgrade baseline (`L-1`)

Signed `14901a5` committed the compatible application-update policy, passing evidence, one-off cleanup
helper and the author's successful personal cleanup/reopen report. The next bounded phase now checks
the stable per-slot application-upgrade interlock after every shared/exclusive grant, before caller
initialization. Any populated marker refuses, including null/undefined and a claimed ready state; absence
continues to the existing authentication and carrier checks. The probe writes no data and retains the
permit through cancelled/blocked native opens. Future document schemas receive a compatible-app message
and preserve their encrypted database/journal bytes. No new format or migration owner was introduced.

[Preserved evidence](./storage-conformance-runs/2026-09-10-storage-compatibility.md): 825 unit tests pass,
including 160 generated interlock histories and a get/count fault control. Five new native compatibility
cases, thirteen lifecycle cases plus five detected controls, eight compatible-upgrade cases, eight Local
app cases and five private migration/cleanup cases pass. Static checks, isolated-build budget (327.2 kB)
and origin isolation pass. Test-harness signature/crash-realm corrections are recorded separately.

[The contract](./storage-compatibility.md) specifies what a first actual incompatible migration still
needs: authenticated intent, exclusive ownership, refusal by pre-interlock executables, restart rules
and a supported recovery path. A speculative general migrator is not next. Review/commit this baseline,
then guide the same-format personal app handoff; development next moves to account attachment and
encrypted sync prep, reconciling L-2 before overlap. The author's other pre-encryption device must adopt
this workspace without importing or merging its old writing. Its cleanup is separate.

The live `dist/`, server, origin and relay-off state were retained. The full check chain, broader platform
assurance and debt/matrix closure are not claimed. This outcome precedes the L-1 rewrite; L-2 is unchanged.

## 2026-09-10 — Compatibility committed; personal release and account/sync prep (`L-1`)

Signed `17d87c2` commits the compatibility interlock, its checkpoint and preserved evidence. A production
package was then built from that clean source into `.dev/releases/17d87c2/app`; the live `dist/` was not
overwritten. All ten candidate files and eleven predecessor files were hash-checked. The packaged runner
now accepts an isolated release root and report path. Three native package cases pass, including exact
HTTP/file parity and encrypted edit/lock/reopen while offline at both entries. TypeScript, focused lint/
format, budget (327.2 kB) and origin isolation pass. The [build and report](./storage-conformance-runs/2026-09-10-personal-upgrade-prep/manifest.json) are preserved.

The [handoff procedure](./personal-app-upgrade.md) is ready. Current lock/close confirmation has been
requested from the author; the preview still serves the verified predecessor. Preparation and HTTP
verification do not establish a personal browser update. The new policy may require a final normal
close/reopen after its first download before the Version field shows `17d87c2`.

[Account/sync prep](./account-sync-prep.md) reconciles the clean L-2 worktree/ref at `d24732b`: the slot
verifier and tests are already identical here; no account service or enrollment implementation is pending
there. The first code slice is durable account challenges and passkey verification, kept pending until
recovery confirmation and promotion are implemented. The author's chosen path is promotion here and
adoption on the actual second pre-encryption device without merging its old writing. No account service,
account ceremony or relay was started. L-2's checkpoint remains unchanged. This outcome precedes L-1's rewrite.

## 2026-09-10 — Personal upgrade server handoff verified; browser confirmation pending (`L-1`)

After the author confirmed the current lock/close request, the predecessor preview was stopped and
replaced with the prepared `17d87c2` package on the same loopback port 8082. The HTTPS origin and
Tailscale route are unchanged; the build and server remain in this worktree/Codex session. The old
`dist/` is intact. Relay remains off and no personal browser operation was automated.

All ten release files plus the root HTML alias returned 200 and matched the clean-source build's SHA-256
hashes through both loopback and the personal HTTPS origin: 22 matching responses. The read-only
[HTTP handoff evidence](./storage-conformance-runs/2026-09-10-personal-upgrade-prep/handoff-http.json)
is preserved separately from the preparation manifest. This establishes what the server serves; the
author's normal browser reopen, Version `17d87c2`, writing and later-edit recovery checks remain pending.
This outcome precedes the L-1 checkpoint update; L-2 is unchanged.

## 2026-09-10 — Personal upgrade reached after hard reload (`L-1`)

The author reports Version `8db7070` on the first normal load, unchanged after a soft reload, then
Version `17d87c2` after a hard reload. This confirms the new app was reached but does not establish
the active service-worker controller or the package used by a subsequent normal/offline reopen. Writing
and a new edit surviving lock, full close and normal reopen still need confirmation for this handoff.

The new package already includes the waiting-release notice in the menu and startup screen; the cached
predecessor lacks it. Its instruction is to lock, close all tabs/app windows and reopen once an update is
ready. The author's suggestion for an update message is therefore covered for later releases, though
this personal observation has not exercised the notice. No app code or server change was made in response.
This outcome precedes the L-1 checkpoint update; L-2 remains unchanged.

## 2026-09-10 — Personal application upgrade confirmed (`L-1`)

After the requested edit, lock, full close, normal reopen and unlock, the author confirms the edit survives
and Version remains `17d87c2`. This closes the bounded personal same-format application handoff. The
result is author-reported; no personal browser automation or independent export comparison was performed.
The personal server-off check was not repeated for this release; the prepared exact-package native tests
already cover offline edit/reopen at both entries. Future waiting-update notice behavior was not exercised
by this personal handoff from the older app that lacked it.

The verified release remains served from this worktree/Codex session at the unchanged origin; relay remains
off. The prior build and external recovery files remain retained. Account/sync preparation is complete;
the next bounded implementation is durable account challenges and passkey verification with private test
endpoints, keeping account activation, recovery, promotion and content access outside this first slice.
This outcome precedes the L-1 checkpoint update; L-2 remains unchanged.

## 2026-09-10 — Personal preview paused for account implementation (`L-1`)

At the author’s request, stopped the personal preview after the successful `17d87c2` normal-reopen/edit
check. Account-core testing uses separate disposable servers and does not require this preview. The
release files and unchanged Tailscale route remain available for a later restart; relay remains off.
This outcome precedes the L-1 checkpoint update; L-2 is unchanged.

## 2026-09-10 — Private account challenge and passkey core (`L-1`)

Signed `187b636` commits the personal application handoff, exact-package runner and account/sync prep.
The personal preview is stopped by request. The first account core now owns durable service-issued
registration, confirmation and discoverable sign-in challenges in SQLite. Registration stages a unique
attested key, then requires a fresh assertion proving possession; accounts stay pending. Sign-in against
synthetic active accounts creates historical proof receipts, with no session, relay, content or admission
grant. Cancellation, expiry, key/account state and challenge consumption are rechecked in the commit.
Identical retries recover one result after abort/lost-response/restart; changed completed proofs refuse.

The reviewed WebAuthn verifier is pinned to 14.0.0. The newest release failed the repository's dependency-age
policy; no exception was made. Mandatory UV/discovery, Ed25519/ES256, exact same-origin policy, attested ID,
user handle, key encoding and purpose checks are explicit. SQLite WAL/FULL commits progress and result
atomically. Only a token-protected loopback test adapter exists. See the [contract](./account-core.md).

The [preserved campaign](./account-conformance-runs/2026-09-10-account-core.md) passes 29 tests: 12 focused
cases, 240 generated histories across two ledgers, ten real SIGKILL/reopen cases, two native/HTTP cases,
and three controls that actually demonstrate duplicate results, wrong-purpose acceptance and substituted
key acceptance after guard removal. The initial Host probe used fetch, which rewrote that header; a raw
HTTP probe corrected the harness and passes. 825 existing unit tests, TypeScript, focused static checks,
isolated application build/budget (327.2 kB) and origin isolation pass. No existing app build was replaced.

The next bounded phase is recovery sealing, saved-code confirmation and restart-owned account finalization;
Local promotion and the first authority/binding issuer follow. No personal account or passkey was created,
no local writing/custody/index was changed, and relay remains off. Full product conformance, actual device
coverage, production sessions/restore, residue and independent review remain open. No debt/matrix status
changed. This outcome precedes the L-1 checkpoint rewrite; L-2 remains byte-for-byte unchanged.

### Account-core concurrency repair and final evidence (2026-09-10)

Final review added a real competing-process case and reproduced a spurious invalid-proof refusal when
confirmation completed between the initial challenge inspection and a separate credential read. The
initial transaction now snapshots the challenge and credential together; final commit still rechecks
current state and recovers a competing winner's receipt. The before/after evidence is retained with the
account campaign. All 30 final tests pass, including the added regression, 240 generated histories and
three acceptance controls with before/after state snapshots. The generated histories themselves did not
find this particular inter-process gap. The earlier 29-test result above records the pre-repair campaign.
This addendum precedes the L-1 checkpoint correction; L-2 is unchanged.

## 2026-09-10 — Private recovery sealing and restart-owned finalization (`L-1`)

Signed `e9477aa` commits the account challenge/passkey core. The next bounded slice now generates a
125-bit recovery code and seals the recovery scalar, root commitment and bootstrap signer together.
The browser owner commits only sealed material before displaying the code; re-entry checks the complete
payload and both keypairs before requesting a fresh operation-bound passkey assertion. It retains the
exact two-proof request before sending it, so renderer death or a lost response resumes one finalization.
The service commits exact preparation/receipt bytes under SQLite and rechecks current eligibility,
expiry, cancellation and both proofs. Accounts remain pending for authenticated Local promotion.
See the [contract](./account-recovery.md) and [evidence](./account-conformance-runs/2026-09-10-account-recovery.md).

All 25 recovery campaign tests pass: 160 generated histories, six real SIGKILL cases, independent crypto
reconstruction, three observed acceptance controls, and disposable native-browser coverage of IndexedDB
aborts, owner exclusion/cancellation, renderer death, browser restart and saved-proof response recovery.
All 30 account-core regressions (240 more generated histories) and all 825 existing unit tests pass.
The generated recovery ledger initially modeled expiry before a foreign-ID refusal; correcting that
harness expectation made the seed pass. The crash harness also needed to observe the renderer crash
instead of awaiting its CDP command response. Neither was a discovered production defect. TypeScript,
focused static checks and isolated application build/budget/origin checks pass. The complete check chain
was not run; no debt/matrix status changed.

Next is trusted authority-root ownership/bootstrap and promotion preparation for this existing Local
workspace. The first lineage/genesis, mandatory-custody device credentials, recovery generation wraps
and authenticated index restart handoff must use the exact confirmed recovery result. Activation and
personal enrollment remain gated on that work; sync and second-device adoption follow. Pending-attempt
abandonment/reset and wider production lifecycle remain open. The personal preview and relay remain
off, with release files and origin unchanged. This outcome precedes the L-1 rewrite; L-2 is unchanged.

## 2026-09-10 — Private authority root and verified Local promotion preflight (`L-1`)

Signed `0f1a073` commits recovery sealing, saved-code confirmation and restart-owned finalization.
This slice adds an explicitly initialized private Ed25519 service root, sealed under a separate operator
wrapping key with SQLite WAL/FULL commit and cold factor/pin verification. Missing/partial/damaged state
refuses without automatic rekeying. The optional private proof endpoint signs only a fixed-purpose,
client-nonce-bound bootstrap statement. Clients require a pin supplied independently by trusted
operator/application configuration; no actual personal pin or operator secret was provisioned.

The read-only Local promotion preflight factor-authenticates the ready claim and current carriers,
requires Local routing with no admission material, cold-replays encrypted content plus journal, refuses
pending dependencies, and verifies the pinned service proof under slot exclusion. It returns a stable
proposed lineage/recovery context using the existing principal, workspace, store, root and genesis intent.
It creates no carrier, content/custody/index change, checkpoint, recipient grant, epoch or activation.
The [contract](./account-authority.md) specifies the next promotion-write owners and their boundaries.

[Evidence](./account-conformance-runs/2026-09-10-account-authority.md): all 13 authority/preflight tests
pass, including 160 generated root histories, 40 generated native histories, actual initialization
process deaths and competing creators, native journal/read-only/cancellation/imported-claim coverage,
and two actual bad-acceptance controls. All 55 core/recovery regressions (400 additional generated
histories) and 825 existing unit tests pass. TypeScript, focused static checks and isolated app build
checks pass. The preliminary native page CSP blocked journal WebAssembly; correcting the disposable app
harness resolved it while leaving API CSP unchanged. Generated histories found no production defect.
The full check chain was not run and no whole-protocol debt/matrix status changed.

Next bounded write phase: authenticated durable promotion intent and fresh device credentials sealed
under mandatory custody, preserving Local classification, current generation and counters until the
exact prepared result is complete. The following genesis/service/index handoff must compose certified
recipients, recovery wraps and checkpoint semantics before activating an Account workspace. The actual
second pre-encryption device will adopt this workspace later without importing its old writing. The
personal preview and relay remain stopped; the origin, predecessor build and verified release remain
unchanged. This outcome precedes the L-1 rewrite; L-2 remains byte-for-byte unchanged.


## 2026-09-10 — Private Local promotion intent and prepared device custody

Signed `e96107b` commits the preceding root/preflight phase. The next bounded component now retains a
factor-authenticated promotion interlock, durably reserves direct-root seal invocations, and prepares
fresh X25519/Ed25519 device credentials without replacing the Local claim, original credentials,
content-key envelope, journal, store, generation or index. Interrupted reservations consume new budget
on retry; a committed preparation cold-opens the exact winning credentials. Ordinary Local readers
remain excluded until explicit abandonment or a later verified account handoff.

The private service signs fixed-purpose current pending-account observations, requiring a live confirmed
registration/recovery. Atomic idempotent abandonment cancels that registration while retaining audit and
historical receipt rows. Local abandonment removes only the authenticated marker and its prepared-key
references, preserving writing and consumed budgets. Recovery owner reset requires a pinned service
abandonment and authenticated Local census; it keeps the recovery capability while any promotion or
unknown Local reference remains. There is still no activation, ordinary account UI or sync.

[Contract](./account-promotion.md) and [preserved evidence](./account-conformance-runs/2026-09-10-account-promotion.md):
18 new tests, 120 generated service and 45 generated native histories, two observed acceptance controls,
SQLite SIGKILL and renderer-death/transaction-abort boundaries pass. All 69 account/authority/recovery
regressions, 13 writer-lifetime cases, 17 Local-genesis cases, five compatibility cases and 825 existing
unit tests pass. TypeScript, focused static checks, isolated app build and 13 final gates pass; budget
328.0/350.0 kB. Crash-wait and copied-fixture dependency problems were corrected in the harness.
A directed native reproduction caught and fixed a preflight refactor race: caller options are again
copied before lock acquisition, so the inspected slot cannot diverge from its acquired permit. No
production counterexample from the generated histories or whole-protocol debt payment is claimed.

The personal preview/relay remain off; original `dist/` and `.dev/releases/17d87c2/app` stay intact. Next
is journal-inclusive genesis checkpoint and exact device/recovery wraps, followed by current-state
service admission and verified index handoff. This outcome was appended before replacing L-1 progress;
L-2 remains byte-for-byte unchanged.


## 2026-09-10 — Journal-inclusive private genesis candidate and exact generation wraps

Signed `a4e1c15` commits durable Local promotion preparation. Its next bounded phase now cold-replays
the encrypted database plus synchronous journal, preserves the existing Yjs state and attribution,
and retains a signed encrypted genesis candidate with exactly the prepared device and confirmed recovery
key wraps. Both saved factors are required; both wraps must independently open to the current content
key, and the decrypted checkpoint must match the source's integrated state and derived SV/DS.

One authenticated version-2 promotion carrier holds the candidate. Strict atomic replacement, abort,
renderer death, cancellation/draining, competing owners and exact restart are covered. All other Local
carriers and spent budgets are retained. The previous reader refuses the new format. The candidate
proposes epoch 1; it is not a certified epoch, SemanticAdmission, account activation or index switch.

[Contract](./account-promotion.md) and [preserved evidence](./account-conformance-runs/2026-09-10-account-genesis.md):
17 new tests, 100 generated HPKE/OpenSSL comparisons, 40 generated native delivery/interruption/forgery
histories and two observed semantic bad-acceptance controls pass. Refreshed promotion/recovery/authority
campaigns (57 tests), 13 writer-lifetime cases, 17 Local-genesis cases and 825 unit tests pass. TypeScript,
focused lint/format, isolated build and 13 final gates pass; initial JavaScript remains 328.0/350.0 kB.

A directed integration reproduction found an incorrect card field (`authorActorId` instead of `author`)
that the original hand-built fixture repeated. The owner now uses the existing `cardAuthor` accessor;
fixtures use real app constructors and generated tests include actual section ordering and human/system
attribution. The before-fix refusal is preserved. This was a review/directed-test finding, not an original
property-generator discovery. An old-reader expected-message assertion was also corrected in the harness.
No further production counterexample or whole-protocol debt payment is claimed.

Next is current-state service admission with exact recipient certification, the first head and an
independently verified retained receipt; verified Local-to-Account index handoff follows as its own
boundary. The personal preview and relay remain off; the predecessor build and verified release remain
intact. This outcome precedes the L-1 rewrite; L-2 is unchanged.


## 2026-09-10 — Private first-epoch service admission and retained receipt

Signed `280f616` commits journal-inclusive genesis preparation and exact generation wraps. Its next
bounded phase now retains an exact recipient approval plus recovery-bootstrap origin endorsement,
obtains a durable service offer with separately sealed acceptance custody, and signs the offered
checkpoint manifest and SemanticAdmission after independently reopening/replaying the Local source.
The service rechecks current registration, confirmed passkey/recovery and exact proofs, then atomically
activates the account and stores its signed first-epoch receipt. The client verifies and retains the
complete result in one authenticated version-3 promotion carrier.

The Local index, claim, writing, journal, keys, credentials, counters and generation remain retained.
There is no index handoff, default account UI or encrypted relay yet. Lost replies, crash/restart,
competing processes/owners and cancelled acknowledgements preserve exact committed outcomes. After
admission, abandonment refuses; cancelled proposals retain audit rows while freeing their reservation
for a fresh registration. Old readers and ordinary Local editing refuse the new carrier.

[Contract](./account-admission.md) and [preserved evidence](./account-conformance-runs/2026-09-10-account-admission.md):
34 new tests, 80 generated service and 30 generated native histories, independent OpenSSL/LP and
plaintext replay oracles, three observed bad-acceptance controls, four SQLite SIGKILL boundaries and
six renderer/IDB interruption boundaries pass. All 104 refreshed account/recovery/authority/promotion/
genesis regressions, 13 writer-lifetime and 17 Local-genesis cases, and 825 unit tests pass. TypeScript,
focused static checks, isolated build and 13 final gates pass; initial JavaScript 328.0/350.0 kB.

Directed tests caught two implementation defects: comparing equivalent request objects in different
field order, and cancelled proposals permanently reserving the retained workspace. Requests are now
normalized before comparison and non-cancelled rows alone hold workspace/lineage uniqueness. Before/
after evidence is retained. The older preparation fault control also needed its text mutation scoped
to its intended owner; final bad acceptance is observed again. No additional generated counterexample,
whole-protocol debt payment or matrix change is claimed.

Next is verified Local-to-Account index handoff and owned startup classification, preserving principal,
workspace, database and generation. Encrypted relay, account UI and the author's second-device fresh
adoption follow. The personal preview and relay remain off; retained builds remain intact. This outcome
was appended before replacing L-1 progress; L-2 is unchanged.


## 2026-09-10 — Verified private Account index handoff and offline startup classification

Signed `beed8cf` commits the preceding first-admission phase. Its next bounded component now obtains a
root-signed binding for the admitted account's current confirmed credential, verifies the exact retained
receipt and source under both saved factors, and requires a fresh account passkey assertion before
selecting the existing store as Account. A version-4 authenticated carrier owns prepared/selected
progress across strict index replacement and its acknowledgement. Principal, workspace, database,
content key, generation and counters remain intact; the Local claim stays as authenticated provenance
under the interlock, not a second selectable workspace.

Owned startup rechecks the selected route, receipt, binding, custody, device wrap and full source replay,
requiring the device-lock code plus a fresh passkey but no network or recovery code. It releases its
permit after returning metadata. Account editing and writer lifetime integration follow before relay;
this classification result is not an ongoing read/write capability.

[Contract](./account-handoff.md) and [preserved evidence](./account-conformance-runs/2026-09-10-account-handoff.md):
21 new tests, 60 generated service histories, 24 generated native histories, 200 independent DER
signature cases, two observed bad-acceptance controls and six renderer/IDB interruption boundaries pass.
All 138 account/recovery/authority/promotion/genesis/admission regressions, 13 writer-lifetime,
17 Local-genesis, 17 Local-clear and 15 owned-startup cases, plus 825 unit tests pass. TypeScript,
focused static checks, isolated build and 13 final gates pass; initial JS is 328.2/350.0 kB.

A real disposable Chromium ES256 ceremony reproduced a defect in the committed offline verifier:
WebAuthn DER was passed to WebCrypto as if it were fixed-width r || s. Strict DER conversion repairs
it; independent OpenSSL fixtures replace the old fixture's matching raw-format assumption. The same
directed test caught a new SPKI parser's missing point-format byte. Storage regression harnesses needed
an unnecessary eager protocol import removed, and the future-schema expected result corrected to the
existing update-required behavior. Before/after evidence is retained. These were directed findings;
the generated histories found no additional counterexample. No whole-protocol debt payment is claimed.

Next is Account editing/writer lifetime integration, including cold recovery of edits beyond the frozen
genesis, invalidation, lock and drain. Encrypted relay and fresh adoption by the author's actual old
second device follow. Personal preview/relay remain off and retained builds remain intact. This outcome
was appended before replacing L-1 progress; L-2 is unchanged.


## 2026-09-10 — Private Account editing and writer lifetime

Signed `649925f` commits verified Account handoff and offline classification. The next bounded component
now owns an actual admitted Account workspace, journal, content carrier and undo history. Every open
rechecks the selected route, authenticated provenance/custody, first-epoch receipt and pinned binding
with a fresh passkey assertion plus device-lock code. The first open verifies frozen genesis and strictly
retains v5 `account-active` progress before initialization or editing. Later opens verify genesis ancestry
while recovering later database/journal edits and durable pending updates. The original store, identities,
keys, credentials, generation, signed genesis and receipt remain retained.

The private Account editor holds an exclusive slot permit for its entire lifetime. Another editor waits
until lock/close; concurrent Account editors remain an extension. Cancellation/pagehide invalidate stale
handles, drain native work, destroy canonical/projection/undo state and erase custody caches before permit
release. A detected generation change closes the owner. The public receive path refuses until an
Account relay receiver exists. Default UI and relay remain disconnected.

[Contract](./account-editing.md) and [preserved evidence](./account-conformance-runs/2026-09-10-account-editing.md):
16 new native tests, 24 generated editing/reopen/crash histories, 200 generated ancestry comparisons,
two observed bad-acceptance controls, activation commit interruptions, pending-dependency delivery and
cancellation/drain pass. All 55 admission/handoff regressions, 13 writer-lifetime, 15 ordered-admission,
10 workspace-projection and 17 Local-genesis cases, plus 825 unit tests pass. TypeScript, focused static
checks, isolated build and 13 final gates pass; initial JavaScript is 328.3/350.0 kB.

The generated campaign found a fixture defect: its crash helper closed the page still used by later
workspace creation. Separate creation/editing pages repair it. A stale flat-copy admission harness now
copies and hashes its complete source dependency tree. Initial Account/custody composition was moved
into its own module after a dynamic dependency cycle broke single-file test bundles. Review tightened
composed disposal and registration during cancellation. Before/after evidence is retained; the final
generators found no production counterexample. No whole-protocol debt payment is claimed.

Next is the encrypted outbound spool under the selected exact-byte retry/refusal contract, then envelope
acceptance and the content-blind durable service. The personal preview/relay remain off and retained
builds stay intact. This outcome precedes the L-1 rewrite; L-2 remains unchanged.

### 2026-09-10 — Private outbound codec and durable-capture preparation

Committed the preceding Account editing phase as signed `d10cf8b`. Built the internal envelope codec,
with v1 reference readback and v2 required for new seals. V2 binds workspace, credential and generation
into network-key derivation; explicit versioned routes refuse downgrade. Bounded canonical wire/body
parsers, independent digest/signature checks, authenticated opening and captured async inputs are tested.
No codec call grants lineage, actor, acceptance or publication authority.

Preparation reproduced two nonce-budget defects in the old construction: repeated crashed mints and
successors escape position-based counts, and v1 credentials share a key despite separate budgets. Updated
TRD §7.4, the S0-4 allocator contract, selection annotation and all three affected authority-map pins.
Every seal now requires its own proposed durable reservation; network positions remain separate.
A native Account journal/renderer-crash reproduction establishes that outgoing observers cannot retain
outbound obligations. The actual editor preserves the accepted writing correctly through that failure.

[Preserved evidence](./account-conformance-runs/2026-09-10-account-outbound.md): 19 codec tests, five
preparation tests, two native/control tests, 100 generated codec cases, 1,000 generated preparation
histories, three model controls and three actual codec bad-acceptance controls pass. All 844 unit tests
pass. Source hashes, generated inputs, counterexamples and logs are retained; final static/build/gate
results accompany them. The only harness defect found was treating an inventory object as an array.

The [implementation contract](./account-outbound.md) makes durable source capture the next bounded phase:
retain encrypted intent identity, attribution and exact update bytes at admission, through journal flush
and content compaction, behind an authenticated format fence. Begin from verified frozen genesis;
already-edited v5 Account histories require a separate catch-up checkpoint before publication. No real
Account exists, so this does not redo the author's Local migration. Native spool allocation, refusal-proof
framing, response verification and relay integration remain subsequent work. No whole debt is paid, and
personal builds/servers are untouched. This outcome was appended before replacing L-1 progress; L-2 stays
byte-for-byte unchanged.

### 2026-09-10 — Durable Account source capture at admission

Committed outbound preparation and v2 key-domain corrections as signed `18ceb40`. Added the private
source-capturing Account lifecycle behind authenticated promotion v6. Verified frozen v4 genesis drains
its old journal before activation; already-edited v5 history refuses automatic attribution recovery and
keeps its writing. The old reader and ordinary Account journal owner refuse v6.

Each admitted slice journals a canonical encrypted capsule with stable identity, authenticated route,
prepared signer and original per-transaction actor/update bytes. Pressured admission atomically commits
raw content and the source obligation. Exact intent/byte deduplication closes the journal/DB crash overlap;
conflicting reuse refuses. Pending Yjs structs and deletions retain their original frames. Compaction
validates and retains every outbound source. Public receive, network positions, envelopes and sending stay
outside this owner. Local formats and the personal installation are unchanged.

[Preserved evidence](./account-conformance-runs/2026-09-10-account-capture.md): 15 native capture cases,
16 generated native histories, seven source tests with 450 generated property cases, two actual capture
guard controls, and the full 851-test unit suite pass. Prior Account editing (16 cases), ordered admission
(15), workspace admission (10) and compaction (21 plus all eight detected controls) pass. Review found and
fixed accumulating retry reservations; an actual-module control reproduces it. The initial Unicode failure
was a test generator splitting a surrogate pair, not a demonstrated storage defect. Source hashes,
generated native inputs, failed-run diagnostics, controls and final static/build/gate evidence are retained.

The regression campaign also repaired the compaction harness's fixed-port/startup-cleanup failure and
incomplete flat source snapshot. It now uses a free port, closes failed startup and snapshots the full
module graph. The injected startup-failure check exits promptly. The separate process occupying the old
port was left alone; the final compaction campaign passes.

[The carrier contract](./account-source-capture.md) defines the semantic layout, bounds, transferred source
buffers, no-op behavior, activation fence and retained-history assumptions. No whole debt is paid. Next is
owned position allocation and exact persisted v2 envelopes, with a distinct durable reservation before
every encryption invocation; response/refusal-proof authority and relay submission follow later. Personal
preview/relay remain off and retained builds intact. This outcome precedes the L-1 rewrite; L-2 is unchanged.


### 2026-09-10 — Private Account position allocation and exact persisted envelopes

Committed source capture as signed `7210b7d`. Added the private v7 spool owner under the same exclusive
Account lifetime. It assigns a contiguous network position to each retained original source transaction,
strictly commits a separate fresh grant before every network encryption invocation, and returns only
persisted, verified v2 bytes signed by the prepared certified credential. A crash abandons invocation
permission; a persisted envelope retains identical bytes. Actors, pending update frames and every source
capsule survive compaction and restart. Old capture readers refuse the authenticated v7 fence.

Review and a native reproduction uncovered a design defect in the initial append-only ledger: deleting
the final envelope left a legal unfinished position and allowed different wire bytes at an already-exposed
position. The repaired private content counter v2 authenticates a hash-chain witness, atomically advanced
with each ledger entry. Every census verifies completeness. Missing final/all ledger rows refuse against
retained metadata; interrupted v7/witness activation resumes before admission. A control removing the actual
verifier reproduces the defect. Coordinated restoration of old metadata and matching ledger remains outside
local rollback detection. Local v1 counter and record bytes remain unchanged.

[Preserved evidence](./account-conformance-runs/2026-09-10-account-spool.md): 24 native spool cases, eight
generated native histories, six unit tests with 300 generated property cases, actual early-return,
invocation-reuse and witness-removal controls, and all 857 unit tests pass. Source capture's 15 native cases
and compaction's 21 cases/eight mutation controls pass. A reused compaction evidence directory correctly
refused overwrite; the final run uses a fresh directory. Failed pre-repair diagnostics, superseded evidence,
source hashes and final static/build/gate results are retained. The generated tests did not discover the
missing-final-row defect; directed review and reproduction did.

[The spool contract](./account-spool.md) records native transaction boundaries, metadata framing, key and
actor domains, cancellation/drain, indefinite source/envelope retention and rollback/performance limits.
No sending or acceptance/removal authority is exposed. Next is the authenticated response/refusal-proof
carrier and verification; durable relay integration follows. No whole conformance debt is paid and no real
Account is provisioned. Personal preview/relay remain off and retained builds stay intact. This outcome is
appended before replacing L-1 progress; L-2 is unchanged.


### 2026-09-10 — Authenticated Account responses and submission proofs

Committed the spool phase as signed `7082fa7`. Added canonical private response bytes while preserving
the selected refusal/link/head signed messages. Refusals bind all five envelope subject fields plus the
attempt parent and verify under the currently held certified acceptance key. Exact-position acceptance
proofs reconstruct the link from retained local predecessors; a proved different leaf is conflict evidence,
while an unprovable prefix is unknown. Refusal IDs exclude signatures and survive ordinary re-signing.

A separate device-signed submission wrapper binds the exact unchanged v2 envelope bytes, lineage and parent
refusal ID. Verification rejects proof substitution, foreign positions, stale proof keys and changed wire.
It authenticates a closure claim without pretending to prove the future service's permanent decision store.
The Account owner's new inspectResponse method obtains subject, chain and key from authenticated retained
state and performs no writes. Closing drains pending crypto and withholds late evidence. No durable delivery
transition, successor minting or relay dispatch is added.

[Preserved evidence](./account-conformance-runs/2026-09-10-account-decisions.md): 12 verifier unit tests with
300 generated cases, six native tests including eight generated histories and five effective actual-module
controls, the 24-case spool regression, and all 869 unit tests pass. Existing signed-message/vector readback
and an independent Node/OpenSSL oracle substantiate framing and signatures. The sole initial native failure
used a nonexistent test editing helper; the corrected admitted-input adapter passes and the failure log is
retained. This phase's generated campaign demonstrated no implementation/design counterexample.

The standalone campaign is added to pnpm check; direct Node entrypoints ran the focused campaigns. The final
response run pins completed wiring. The regression/unit/build code ran before the scripts.check-only addition;
its exact package file and explicit difference check are retained. Source hashes, histories, controls and
final static/build/gate outcomes accompany the [contract](./account-decisions.md). No whole debt is paid.

Next is lifecycle-owned durable decision evidence and exact signed submission bytes, with authority rechecks,
reader fencing, ledger completeness and native commit/crash coverage. Service permanence and successors under
changed authority remain separate. Personal servers stay off, retained builds intact, and no real Account is
provisioned. This outcome is appended before replacing L-1 progress; L-2 remains unchanged.


### 2026-09-10 — Owned Account delivery evidence and exact signed submissions

Committed response verification and submission proof framing as signed `81a4655`. The private v8
`account-delivering` owner now persists exact first-attempt signed submissions and original verified
response bytes. It derives acceptance, closure, finalization and contradiction from those bytes on every
census and cold open. Accepted heads cover the whole local prefix; earlier refusals and incompatible
final heads contradict in either arrival order. Valid contradictory evidence halts outbound work while
preserving Local editing and every source capsule.

The v8 reader fence precedes admission and delivery writes. New proof/submission records extend the
existing completeness witness in the same strict content transaction. Authority and a fresh proposed
ledger census are rechecked after signing/sealing before the commit path. Unknown completion resolves by
readback of exact stored bytes; missing rows refuse against retained current metadata. Earlier accepted
submissions leave eligibility without deletion. No dispatch, successor encryption or service permanence
is implemented. The [contract](./account-delivery.md) records first-epoch, exclusion and rollback limits.

[Preserved evidence](./account-conformance-runs/2026-09-10-account-delivery.md): four unit tests include
500 generated proof histories against an independent proposition oracle; 19 native cases include eight
generated commit/restart histories and four effective actual-module controls. The controls expose lost
submission persistence, resurrection after missing closure, missed prefix contradiction, and commit after
authority changes during signing. The 24-case spool, six-case response and 21-case compaction regressions
(with eight compaction controls) pass, as do all 873 unit tests in 78 files. No implementation/design
counterexample was demonstrated by this phase's generators.

The first retention assertion incorrectly forbade a new empty Yjs capsule on reopen; it now verifies
retention of every original identity and byte sequence. An overlapping full unit run exceeded the existing
five-second limit on the spool property test; the unchanged suite passes when run after browser completion.
Both diagnostics are retained alongside exact source hashes, histories, control outputs and static/build/gate
results. The isolated application build preserves the personal release and stopped preview/relay. No real
Account is provisioned and no whole debt is paid.

Next is durable service acceptance/refusal decisions enforcing one accepted digest or permanent closure,
then relay integration and a one-device encrypted round trip. This outcome is appended before replacing
L-1 progress; L-2 remains unchanged.


### 2026-09-11 — Private service acceptance and permanent refusal decisions

Committed lifecycle-owned delivery evidence and exact submissions as `2cb42a2`. The private Account
service now verifies exact signed submissions against its retained creating-member certification, recovery
endorsement, first-epoch receipt and acceptance custody. Schema 4 adds append-only ciphertext/response
rows and a signed completeness witness; the row and witness commit together under SQLite WAL/FULL.
Acceptance/refusal signatures return only after commit. Lost replies recover the exact original response.

The service enforces contiguous acceptance and one accepted digest per position. An epoch-generation
mismatch under a valid device signature permanently closes the exact subject; unknown epochs, gaps,
invalid proofs, unavailable storage and missing parent authority create no permanent refusal. A closure
survives restamping, restart and later acceptance of a different digest. Any successor proof must resolve
in the service's own issued ledger and use current certified authority. This adds no client re-mint or
general lineage-advancement capability. Current v8 clients remain halted after closure.

A coherent authority/ledger snapshot is rechecked inside the final immediate transaction after async
verification. Missing rows against retained signed witness, tampered records/custody and changed membership
refuse without repair. Explicit offline v3 upgrade preserves prior admission; older readers reject v4.
Coordinated metadata+ledger rollback remains outside this bounded argument. The
[contract](./account-service-delivery.md) records request dispositions, exact hash/signing domains and limits.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-service-delivery.md): 31 service cases,
including 80 generated histories, four effective actual-module controls, SIGKILL on both sides of both
decision kinds and competing-process races, plus one real-v8-browser integration test. The browser test
recovers a deliberately lost acceptance reply through a test bridge; no transport endpoint or relay loop
is added. All 30 Account core, 25 recovery, 34 admission and 14 authority regression tests pass, as do all
873 unit tests in 78 files. Isolated build, static checks and repository gates accompany the result.

The first direct Node run exposed an implementation integration defect: a browser-compiled TypeScript
parameter property in the shared envelope parser was unsupported by Node strip-only execution. Equivalent
field initialization repairs startup without changing wire bytes. Two older mutation fixture copiers also
omitted the newly imported modules; copying the complete service/protocol TypeScript directories restores
their effective controls. Initial diagnostics and passing reruns are retained. The generated histories
found no additional design or implementation counterexample.

Next is private authenticated submission transport and bounded ciphertext/proof readback before delivery
and reconnect integration. No personal Account or service is provisioned; the Local release and predecessor
remain intact and personal preview/relay stay stopped. No whole debt is paid. This outcome is appended
before replacing L-1 progress; L-2 is unchanged.


### 2026-09-11 — Private authenticated submission transport and bounded readback

Committed the private schema-4 service decisions as `96a2040`. The v8 lifecycle now sends only its
already persisted earliest submission over the private HTTP adapter and records original acceptance or
refusal evidence through its existing witnessed commit barrier. Unknown, malformed, stale and lost replies
retain exact retry bytes. Dispatch adds no allocation or encryption invocation. No storage-format upgrade
is required.

The [readback contract](./account-transport.md) adds a device-signed selector bound to the pinned service,
origin, workspace, creating credential, lineage, epoch head, cursor, limit, nonce and short expiry. The
service derives the verification key from current retained membership and reauthenticates its witnessed
ledger; the operator token remains only a development gate. The complete snapshot is rechecked before
fixed-purpose acceptance-key signing. Pages contain contiguous exact ciphertext/proof pairs, a bound request
hash, accepted extent and continuation, including authenticated empty/end results. Limits are eight entries
and 10 MiB per page, with smaller pages when necessary.

The actual owner verifies each page, envelope and original head against its own authority and reconstructed
predecessors. This one-device readback requires exact retained spool bytes and rejects regression behind
retained acceptance. It does not decrypt/apply downloaded content, persist a receive cursor or infer a
checkpoint baseline from a head. Submit and read run under the exclusive capture queue; close invalidates,
aborts and drains fetch before releasing the slot and custody.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-transport.md): all 17 new service/native
tests pass, including 60 generated histories, maximum-envelope page boundaries and three effective actual
code mutations. Native HTTP tests cover lost replies and cold retry, operator-only/foreign/malformed reads,
stale/reordered/false-extent pages, validly signed wrong-predecessor heads, redirect/oversize replies, and
late fetch settlement during close. Existing service delivery (32 tests, including 80 histories), browser
delivery (four properties and 19 native cases, including eight generated durable histories), Account core
(30), and all 873 unit tests in 78 files pass. Isolated build and final checks accompany the result.

The first direct service test used an unsupported credential state in its fault setup; it now uses the
existing non-confirmed state. No production counterexample was demonstrated by these new generators.
Expiry-window replay, clock agreement, full scans/backlog performance and coordinated restore/rollback
remain explicit limits. The personal Local release/predecessor, factors and browser were not operated on;
personal preview/relay remain stopped. No whole debt is paid.

Next is a lifecycle-owned one-device delivery/reconnect driver, using these exact-byte operations and
bounded retry, before authenticated inbound replay and second-device enrollment/adoption. This outcome
is appended before replacing L-1 progress; L-2 is unchanged.


### 2026-09-11 — Owned one-device delivery and reconnect

Committed private submission transport/readback as `e1a5029`. The explicit private sending factory now
attaches one driver to the factor-owned v8 lifetime, preserving the manual factories. It drains captured
Local work through existing durable position/invocation/envelope/submission operations and sends the
oldest pending wrapper first. Unknown outcomes never trigger a new seal for an existing envelope or wrapper.
Durable owned status, not transport return values, determines progress and permanent stops.

The [driver contract](./account-driver.md) defines one active pass, one timer, coalesced revision wakes,
1–30 second backoff, offline/Local-pressure pauses, explicit retry and lifecycle cleanup. Backoff does not
hold the storage task queue. Closure/conflict/finalization halt publication while Local editing remains
available. Close clears the token reference, detaches listeners/timers, aborts and drains existing work
before slot/custody release. The private status distinguishes starting, working, idle, retrying, offline,
blocked and closed. No format, service schema, default-app entrypoint or personal configuration changed.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-driver.md): eight property/unit cases
include 200 generated scheduler histories; 14 Node/native cases include eight generated browser histories,
three effective controls and a polling reproduction. Actual native tests cover rapid edits, exact retries
after lost replies, cold restart before further seals, permanent halts with later Local edits, Local storage
failure/retry, and close during fetch/backoff. Existing transport/readback (17 tests) and v8 delivery
(four properties plus 19 native cases) pass. The final full suite passes 881 tests in 79 files; isolated
build, static checks and 13 repository gates accompany the result.

Two implementation defects were uncovered and fixed: a synchronous observer could close the scheduler
before it nevertheless invoked work, and the driver briefly announced idle between accepted envelopes
while backlog remained. Directed tests/controls and final status assertions retain their reproductions.
The new native harness also inherited an async-predicate polling mistake: this installed Playwright can
return false immediately because it sees a truthy Promise. An explicit awaited poll loop repairs the new
waits; a live reproduction is retained. Older unrelated async waits still warrant a separate audit.
An initial generated run exhausted 110 seconds; per-history cleanup, progress output and a bounded
180-second case/300-second stage budget retain useful evidence. No additional production defect was
demonstrated by the final generated campaign.

Original campaign source snapshots are retained. Two driver fixture files, not invoked by the older
transport/delivery campaigns, were subsequently repaired and verified by the final driver campaign. A
final assertion strengthening the existing driver unit test is covered by the final full suite. Every
production/runtime input matches; the final source snapshot and superseded-test list make those differences
explicit. No whole debt is paid. The personal release/predecessor and browser/factors remain intact and
personal preview/relay stay stopped.

Next is bounded prep for authenticated inbound replay: establish the receive baseline, distinguish read
membership from publisher authority, specify the receive commit/cursor and reader fence, and build
independent counterexamples before enabling receipt of new remote content. This outcome is appended
before replacing L-1 progress; L-2 is unchanged.


### 2026-09-11 — Authenticated inbound replay preparation

Committed the owned delivery/reconnect driver as `8dd06fb`. The
[inbound contract](./account-inbound.md) now distinguishes the independently held semantic baseline,
reader membership, publisher authority, per-stream acceptance links, durable receive progress and Yjs
materialization. Proposed v2 read/page bytes bind separate reader and publisher credentials; the existing
v1 service/transport remains unchanged. The first runtime scope remains the creating publisher at epoch 1,
generation 1, with fresh-reader/two-publisher authority supplied only by synthetic preparation fixtures.

The planned v9 reader fence and inbound event retain original signed request/page bytes (including envelope
and proof), while content, event and metadata witness commit together before editor promotion. Pending
structs/deletions retain original framing; compaction cannot erase them. Remote bytes bypass source capture.
The local batch limit requires an explicit bounded first receive policy: one entry, at most 512 KiB wire,
255 updates and 512 KiB decoded updates, then the actual 4 MiB/256-record check. No new runtime formats,
service routes, database schema, personal Account, browser or factor were changed in this preparation.

[Evidence](./account-conformance-runs/2026-09-11-account-inbound-prep.md) preserves 25 preparation cases,
300 generated histories (seed 9142026), independent Node/OpenSSL wire fixtures, seven effective shortcut
controls, 43 existing primitive regressions and the 906-test/80-file unit suite. Isolated build, static
checks and 13 repository gates accompany the result. Tests demonstrated false baseline authority, missing
deletion coverage, cursor-before-content loss, dropped pending deletions, a local edit depending on an
uncommitted remote input, conflated publisher cursors and source relabeling. These are counterexamples to
proposed shortcuts, not claims that the current production owner enables those paths.

A directed mutable-input test found a defect in the new executable candidate: it verified parsed bytes but
saved the caller's later mutation. The candidate now owns bounded copies before async crypto and rechecks
lifetime even before returning a duplicate. The failing reproduction is retained; the final test includes
closure during duplicate verification. The final generated histories found no additional counterexample.
The model assumes atomic JS assignment and independently established authority, and caches prior verified
event objects for restart. Native durability, authenticated stored-wire replay, issuance and complete v2
parser conformance remain implementation obligations. No whole-protocol debt is paid.

The pnpm wrapper stalled without output before launching the campaign; its task process was stopped and
the checked-in Node runner executed directly. Its cause was not diagnosed; neither a successful pnpm wrapper
run nor the whole pnpm check is claimed. The personal Local release/predecessor are intact, preview/relay
remain stopped and L-2 is unchanged. This outcome is appended before replacing L-1.

Next bounded build: closed inbound record and v2 read/page codecs plus first-epoch verification under an
independently supplied owner context, with canonical framing, baseline/actor/prefix/bounds and mutable-input
controls. Native v9 activation and atomic receive storage follow that verified byte boundary; editor
promotion and service/enrollment integration follow their own checkpoints.


### 2026-09-11 — Closed inbound bytes and first-epoch verification

Committed inbound preparation as `ee42c45`. The [byte/verifier boundary](./account-inbound-verification.md)
now implements closed v2 read/page codecs and the future encrypted inbound event, preserving exact signed
request/page bytes. V1 readback, v8 sending and Local formats remain unchanged. The low-level verifier
requires independently supplied genesis, membership, actor, service, generation and received-prefix context;
it cannot install that authority or advance a cursor itself.

Verification checks the outstanding reader-signed request, service page signature, exact request hash,
held prefix, acceptance proof, member-signed envelope, decrypted actor and original Yjs framing. Old
positions also recheck the independently retained original proof/envelope. Detached received updates and
records, conflicts without plaintext, and empty/duplicate observations remain distinct. Stored replay
rechecks original signatures and recomputed outer metadata after request expiry. The first receiver is
bounded to one entry, 512 KiB wire, 255 updates and 512 KiB decoded updates, then actual local batch limits.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-inbound-codecs.md): 34 codec/verifier cases,
eight effective actual source-removal controls, 400 generated signed inputs, 500 wire mutations, 68
regressions (including the prior 300 generated histories), and all 948 unit tests in 82 files pass. Direct
Node import, isolated build, static checks and 13 repository gates accompany the result. The generated
oracles use authored Yjs bytes and independently framed Node/OpenSSL evidence, not production encoders.

A directed test found and fixed a lifetime defect: replacing the caller's assertion during crypto bypassed
closure. Binding the original assertion and clock once repairs it; the failing reproduction is preserved.
Final guards cover empty, duplicate and last-decrypt completion. The final generated campaign found no
additional defect. A runner artifact collision was also repaired: regression outputs now have their own
directory and no longer overwrite the new codec's generated inputs. Mutation bundles emit Yjs's duplicate
import warning; only raw bytes cross their independent module boundaries.

This is one-event byte/crypto/lifetime evidence, not a native witness census, content coverage, semantic
genesis admission or enrollment proof. No v9 activation, storage owner, editor receive path, service route
or personal Account is enabled. The registered Node runner ran directly; no whole pnpm check is claimed.
No whole debt is paid. Personal release/predecessor, browser/factors and origin remain intact; personal
preview/relay remain stopped. This outcome is appended before replacing L-1 progress; L-2 is unchanged.

Next is native v9 reader-fence activation and an atomic original content/event/witness batch under the
factor-owned permit, with complete stored-wire replay and native abort/crash/lost-ack coverage. The private
self-stream must derive its context from actual admitted genesis; fresh readers/publishers remain synthetic
until enrollment exists. Remote editor promotion and v2 service integration follow their own checkpoints.


### 2026-09-11 — Native inbound activation and atomic receive storage

Committed the closed inbound formats/verifier as `8378596`. The [private v9 receive store](./account-receive.md)
now derives its first-stream authority from actual factor/passkey-owned admission and semantic genesis,
activates an authenticated reader fence, signs its own outstanding request and verifies returned pages.
The factory exposes storage/status/close operations, with no editor, sender, transport route or enrollment.
Default Local startup and the personal installation do not enter it.

Each receive commits original Yjs updates, its exact signed event and the complete metadata witness in one
native transaction. Reservation remains separate and is burned on abort. Before commit the owner rechecks
promotion/custody authority, received state, request expiry and witness. Cold replay reauthenticates the
entire retained event census and original signatures from the admitted baseline, separately checking actual
content/deletion/pending coverage. Empty/duplicate replies grant no durable new progress. A conflicting
accepted digest is retained without plaintext promotion and stops receipt.

The existing compactor retains evidence and original pending frames until the disk union integrates. Remote
input never enters the local source-capture journal. Closure drains work before permit/custody release;
transient successful verifier plaintext is owned before the outer task's final check so cleanup can erase
it even when closure wins that continuation.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-receive.md): 17 native tests, including
12 generated histories, cover activation/receive commit cuts, renderer death, lost acknowledgement, cold
replay, missing or corrupted content/evidence, locally reauthenticated invalid signatures/baselines,
pending dependency handoff, conflict, old readers, bounds/quota retry, authority changes and close draining.
Four effective native source controls and eight retained primitive controls accompany 45 property/primitive
tests, including 200 new generated coverage cases. The full suite passes 951 tests in 83 files; the existing
v8 campaign passes four properties and 19 native cases, including eight generated histories. Isolated build,
static checks and 13 repository gates accompany the result.

The v8 regression found a compatibility defect: the new extension ceiling made the v7 factory refuse v8
at an earlier boundary with a different error. The old factory still refused safely. Restoring the prior
v8 ceiling for older factories, and allowing v9 only for its explicit owner, makes both original activation
assertions pass. The failing campaign and exact source are preserved. The generated campaigns found no
additional counterexample. New native waits explicitly await predicates; historical v8 waits are not
credited as new polling-conformance evidence.

Scope remains one actual admitted creating credential at epoch 1/generation 1. Arbitrary envelopes in the
native fixture use disposable credentials and do not establish fresh-reader/writer issuance or safe cloning.
General lineage/baseline/membership transitions, backlog performance, revocation, finalization and restore
remain open. No whole pnpm check or whole debt payment is claimed. The v9 store has no editor yet and fences
its older editing factory. Personal release/predecessor, browser/factors and server state are unchanged.

Next is ordered remote editor promotion under this same lifetime, followed by v2 service/transport and
real two-gate enrollment/adoption. This outcome is appended before replacing L-1 progress; L-2 is unchanged.


## 2026-09-11 — Ordered remote editor integration (`L-1`)

Committed native receive as `f6e4cf4`. Assessed all 25 root-packet findings, seven test-gap subitems
and twelve historical resolved items against the current repository. The requested `resposnse` blocks
remain uncommitted in that packet. Scope and severity were qualified where a claim exceeded its evidence;
F-01's red AAD gate was independently reproduced after the static assessment.

The [private v9 editor](./account-receive-editor.md) now composes the actual admitted lifetime with an
internal ordered receive handoff. Signed-page verification, original content/event/witness commit and
authenticated readback precede synchronous canonical/projection publication. Later local intent remains
unprepared; no raw editor receive or caller-held mutable receipt grants authority. Original pending
structs/deletions survive replay/compaction. Conflicting evidence halts receipt while local editing remains
available. Closure drains native work; a successful commit followed by failed readback/publication requires
cold replay before editing. Original received frames never become local source capsules or human undo.

New v9 startup/source-free commands avoid the F-08 empty-capsule overhead while preserving ordered
history/selection transitions and deletion updates. Older capture/spool/delivery factories retain their
historical behavior; existing sources are not pruned. No new marker version or network format was required.

[Evidence](./account-conformance-runs/2026-09-11-account-receive-editor.md): 957 unit tests, 54 focused
unit/property cases including 200 generated queue histories, 12 native editor cases including ten generated
histories, two effective source controls, existing 17 native receive and 19 native delivery regressions,
isolated app build, TypeScript/scoped lint/format and 13 repository gates pass. All final campaign hashes
match. The AAD gate still fails; no full `pnpm check` pass is claimed. A missing returned account binding
introduced during composition was caught, repaired and preserved with its exact failing source. The two
native harness corrections and their logs are retained. Final generated runs found no additional defect.

Next is the validation-baseline repair exposed by F-01/F-02, before v2 service receive transport and
reader/publisher resolution. Exact Account encodings/vectors, admission capacity, fresh service activation
assertion and the other accepted review follow-ups remain prerequisites to real Account use. No personal
release, browser, factor, server, L-2 document or whole debt was changed/paid.


## 2026-09-11 — Aggregate validation baseline restored (`L-1`)

Committed ordered remote editor integration as `19586b6`, excluding the annotated review. Then archived
that review unchanged under [implementation reviews](./review/implementation/README.md) and committed it
separately as `500630f`, as authorized. Historical uncommitted-at-assessment notes remain historical.

[Validation repair](./validation-baseline.md) closes this bounded F-01/F-02/F-20 phase. The private v2
generator now participates in normal vector commands and the field-elision audit, with 20 isolated
HKDF/AAD/signature negatives and unchanged positive wires. Four storage campaigns preserve their source
import trees and hashes, and the journal mutation targets its actual snapshot. Property/stage deadlines
are explicit. A startup resource leak, a timing-sensitive lifecycle mutation oracle, a compatibility
fixture readiness race, and a message-dependent refusal assertion were found and repaired; failed evidence
and the strengthened controls are retained.

[The actual aggregate](./account-conformance-runs/2026-09-11-validation-baseline.md), `pnpm check`, passed
in 73.2 minutes against the complete patch in an isolated checkout: 958 unit tests, 225 field elisions,
all storage/migration/application/Account gates through ordered remote editor, four startup-error controls,
and all required mutation controls. The repaired carrier property run covers six saved regressions,
120 generated histories and 11,461 recovery comparisons. Earlier interrupted/failed attempts are
not credited as passing. Source hashes and personal bundle hashes were checked after the run.

No production protocol or personal installation changed, and no whole-protocol debt is paid. Other
historical tests were exercised, not comprehensively audited for every possible weak oracle. The remaining
accepted review findings still gate real Account use. Next is explicit v2 service reader/publisher
resolution, followed by owned receive transport and v9 sender composition, then enrollment/adoption.
This outcome is appended before replacing L-1 progress; L-2 is unchanged.


## 2026-09-11 — Private v2 service reader/publisher resolution (`L-1`)

Committed the completed validation-baseline repair and evidence as `e835243`. Built the next bounded
[service read phase](./account-service-inbound.md): a separate private v2 HTTP route with role lookups in
verified first-epoch membership, reader-signed request binding, exact original envelope/proof pages,
complete witnessed census and current authority recheck under SQLite exclusion before fixed-purpose
signing. Expiry and custody are checked on both sides of signing; reads add no persistent state. V1 remains
closed and the first-epoch creating-member/schema-4 scope remains explicit.

Corrected the prior F-11 disposition: the WebAuthn credential ID and certified workspace signing ID are
different namespaces. Comparing them would reject valid users. The existing candidate/member binding
stays; the shared service snapshot now binds the passkey row to its completed registration result. The
historical review is unchanged, and the corrected explanation and negatives are in this phase's contract.

[Evidence](./account-conformance-runs/2026-09-11-account-service-inbound.md): 19 service tests including
60 generated histories, eight effective source omissions and two SIGKILL cuts; one actual owned browser
HTTP/receive/cold-replay case; all 958 unit tests; affected service/v1-transport/inbound regressions; scoped
static checks and a fresh isolated build/trace chain pass. The original trace failure due to stale root
receipts is retained. Final review strengthened a parser negative and the complete new campaign was rerun.
No generated counterexample was found. Source hashes and all 21 personal bundle files were checked.

No full aggregate was rerun for this patch, and no whole-protocol debt, personal installation or historical
L-2 state changed. The next small build is the owned v2 receive HTTP adapter under existing admission and
lifetime; reconnect scheduling and v9 sender composition follow. Real enrollment/adoption, production
activation and the remaining accepted review gates stay open. Appended before replacing L-1 progress.


## 2026-09-11 — Owned v2 receive HTTP transport (`L-1`)

Committed private v2 service reader/publisher resolution and its evidence as `9598ca6`. The next bounded
[receive HTTP adapter](./account-receive-transport.md) adds `receiveNext(operatorToken)` to the private v9
ordered editor owner. It signs from authenticated durable progress, fetches one page on the explicit v2
route, retains exact request binding and enqueues verification/commit/publication through admission.
Overlapping calls return busy. Callers supply no cursor, signing keys, membership or promotion callback.

The carrier fetch task ends before entry into the editor FIFO, avoiding a self-deadlock. Existing ordering
preserves both local edits admitted while HTTP waits and later local intents queued behind receive.
Shared HTTP streaming now checks actual byte bounds and complete declared lengths, aborts on close or
deadline, and drains cancellation before releasing its reader and the owner's permit. Superseded or
invalid pages refuse; lost replies advance no cursor. Response buffers stay owned even when the final
lifetime check rejects. No new durable format, sender, reconnect loop, Account UI or enrollment is added.

[Evidence](./account-conformance-runs/2026-09-11-account-receive-transport.md) includes nine native HTTP
cases with before/after commit crashes, two cancellation/drain cuts and local ordering; 16 generated native
histories; 200 generated stream partitions; 200 existing controlled queue interleavings; and four effective
source omissions. All 964 unit tests and affected v1 transport, v2 service and ordered-editor campaigns pass.
The isolated build, budget/origin and fresh prerequisite/trace chain pass. Initial test assertion/type/lint
repairs are recorded. Generated histories found no counterexample; this is not another full aggregate run.

An operational mistake ran a validation build in the root and replaced predecessor `dist/`. No server was
started. It was restored from the saved upgrade-test copy and all eleven saved hashes match; all ten
retained personal release files remain unchanged. The correct isolated build also passed. Restoration
provenance is retained in the evidence rather than describing `dist/` as untouched throughout the turn.

The historical review and L-2 checkpoint are unchanged. No real Account/factors, personal browser, routing,
server, deployment or whole-protocol debt was activated/changed/paid. Next is bounded owned receive polling
and reconnect, then explicit v9 outbound composition; all accepted review gates before real Account use
remain open. This outcome is appended before replacing L-1 progress.


## 2026-09-11 — Owned receive polling and reconnect (`L-1`)

Committed the completed receive HTTP phase and evidence as `1ceb88d`. Added the explicit private
[polling/reconnect owner](./account-receive-driver.md) around the existing v9 editor/receiver. Its caller
receives runtime status and explicit retry, while request/page operations stay internal. One pass and at
most one timer poll five seconds after a verified end, yield 50 ms between pages and back off unknown
results at 1/2/4/8/16/30 seconds. Actual authenticated durable progress determines advancement.

Offline and Local-pressure pauses cancel scheduling. The owner checks readiness again immediately before
fetch after queued verification. Error/conflict halts are separate from temporary readiness and survive
edits, restoration and online events; only explicit retry rechecks them. Skipped passes do not report a
verified end or reset the unknown streak. Close clears listeners/timers/token references, aborts network
work and drains the active pass under the same permit. The manual v9 receiver and v8 sender remain separate.

A focused review reproduced a new scheduler defect: Local pressure raised by a status observer just before
the first owned step erased the pending attempt, leaving ordinary restoration stalled. Retaining that
attempt until the step starts fixes it. The failing module/output, passing regression, 100 generated
observer-pause cases and an effective mutation recreating the stall are retained. Four other scheduler
omissions expose overlap, missing end polling, online clearing of a halt and dispatch after observer close;
two native omissions expose fetch after the final offline/pressure gate changes.

[Evidence](./account-conformance-runs/2026-09-11-account-receive-driver.md) records five directed native
cases, ten generated native histories, 400 independent deferred clock/event schedules, 100 observer-pause
histories and seven effective controls. The affected manual HTTP and v8 sender campaigns pass. All 974
unit tests pass on the final tree with two workers; an earlier ten-timeout run during concurrent browser/
build work remains recorded as failed. The isolated build, budget/origin and fresh trace chain pass.
No complete aggregate was rerun. The generated final histories found no further counterexample.

Both personal package directories retain all 21 saved hashes. Preview/relay, personal browser/factors,
origin/routing, historical review and L-2 remain unchanged. No real Account, enrollment, deployment or
whole-protocol debt is activated/paid. Next is bounded prep and explicit outbound composition under the
v9 owner; the remaining accepted review gates still precede real Account use. Appended before L-1 rewrite.


## 2026-09-11 — Private v9 outbound/receive composition (`L-1` seat)

Receive polling/reconnect was committed as `83eed0b`. The next bounded phase now joins original-source
publication and signed v2 readback under one v9 custody/content owner, admission FIFO and completeness
witness. [Contract](./account-outbound-composition.md); [preserved evidence](./account-conformance-runs/2026-09-11-account-sync.md).

The explicit private `openOwnedSyncingAccountWorkspace` keeps preparation, submission and raw receive
operations internal. The extracted envelope algorithm preserves capsule/index/hash identity, committed
invocation grants and exact saved wire bytes; old v7/v8 factories retain their refusal rules. The v9
delivery census includes the receive ledger in the single witness. A self-stream acceptance must match
the locally persisted envelope, with no synthetic source reconciliation. This creating-member round trip
is neither enrollment nor safe cloning of a credential history.

One scheduler alternates due send/receive passes, yields after each position/page, retains local wakes,
keeps independent backoff/halts, rechecks dispatch readiness and drains both lanes before permit release.
Native controls uncovered a network-refusal classification error that closed valid Local content. The
repair and an effective mutation are preserved. Retained receive conflict also halts both lanes without
closing the local editor.

Validation: all 980 unit tests (two workers); seven directed native composition cases; eight generated
native histories; 400 new deferred clock/event histories; ten effective omission controls; manual v9 HTTP,
v8 sending, extracted spool and polling-receiver regression campaigns; type/lint/format and isolated
build/budget/origin/trace checks. The generated native campaign passed its original 300-second deadline
in 291 seconds; only its outer test/runner deadlines were then widened to 420/450 seconds, retaining the
seed, histories and assertions. Exact executed inputs and that delta are archived. The entire historical
`pnpm check` aggregate was not rerun; `e835243` remains its recorded baseline.

This reaches the synthetic creating-member ciphertext round-trip seam in sequencing §3.5. Before real
Account admission, the next bounded phase is row-7 manifest AND semantic-admission descriptor capacity
and explicit versioning. Fresh activation assertion binding, crypto registry/recovery-vector alignment,
invocation power-loss accounting, diagnostics, performance and the other accepted review gates remain.
No whole-protocol debt is paid. All 21 personal package hashes, historical review, L-2 and stopped
personal preview/relay are unchanged. New composition work remains uncommitted at this checkpoint.


## 2026-09-11 — Admission coverage bounds and v2 signatures (`L-1` seat)

Outbound composition was committed as `6398e33`. The bounded F-03 repair and descriptor portion of
F-21 are complete: [contract](./account-admission-bounds.md), [preserved evidence](./account-conformance-runs/2026-09-11-account-admission-bounds.md).

The immutable v1 reproduction establishes both raw-hex LP ceilings: 32,767 descriptor bytes fit;
32,768 refuse. Real synthetic Yjs histories exceed that ceiling with checkpoints below 216 kB.
Manifest and SemanticAdmission both advance to v2, signing separate SHA-256 hashes of decoded
opaque descriptors. Raw bytes and local three-way rederivation remain mandatory. The combined
16 MiB pair bound fits the existing service envelope limit; it is not a browser performance promise.
Checkpoint encryption remains v1 and its ciphertext vector is unchanged.

Old private completions/receipts, mixed and unknown versions refuse without rewriting authenticated
client progress or admitted service rows. No real Account receipt exists. Pre-completion requests and
service offers remain resumable. Neither silent signature reinterpretation nor automatic fixture
reset is introduced. Larger, honestly signed coverage does not become semantic evidence by signature
alone: correctly signed lies pass the content-blind service and fail client-derived coverage.

Validation passes: five protocol tests with 80 shrinking-enabled generated cases plus exact boundaries,
six native long-history/refusal/cold-replay cases, four independent implementation vectors and 92 field
mutations, six effective descriptor/semantic omission probes, all 225 existing field-isolation checks,
all 980 units, complete 17-test genesis and 34-test admission campaigns, and the full composed-sync
campaign with its generated histories and controls. The isolated build/budget/origin/trace chain and
type/lint/targeted-format/whitespace checks pass. Authority entries were reread and re-pinned. No full
historical aggregate was rerun; no whole-protocol debt or performance gate is paid. Harness setup
failures and the earlier sampled-property run remain separate from final passing evidence.

The next bounded phase is an operation-bound fresh account assertion at first service activation
(F-04), with prep for exact retries, expiration, cancellation and atomic consumption before implementation.
Crypto registry/recovery alignment, invocation power-loss accounting and the other accepted review gates
remain before real Account use. All 21 personal package hashes, stopped preview/relay, personal browser,
historical review and L-2 remain unchanged. This phase is uncommitted. Appended before the L-1 rewrite.


## 2026-09-11 — Fresh assertion bound to first activation (`L-1` seat)

The descriptor phase was committed as `4f71bac`. [First-activation binding](./account-activation.md)
now requires a fresh WebAuthn assertion over the exact pin/account/request/offer/completion and actual
registration passkey, with a service nonce and expiry. The signed challenge is retained before prompting.
Proof consumption, receipt v2, observed counter and activation share one FULL-synchronous transaction.
Handoff and service delivery require the passkey identified in that receipt. Raw assertions are not stored.

The private client owns its existing slot/custody permit through assertion UI and drains cancellation.
A lost committed reply cold-recovers the same receipt with no second prompt. Expired pending challenges
renew only for the retained completion; old receipts and missing consumed records refuse without
rewriting history. Schema 5 requires explicit offline upgrade of v4. No real Account receipt exists.

[Evidence](./account-conformance-runs/2026-09-11-account-activation.md) preserves the immutable missing-proof
reproduction, independent ES256/Ed25519 and context/LP oracles, 120 shrinking-enabled service histories,
effective service/client omissions and a shrunk stale-proof control, concurrent proofs, process SIGKILL,
renderer death and deferred assertion cancellation. All 25 bounded tests pass. All 980 units, 49 selected
registration/recovery checks, complete genesis/admission/handoff/service-delivery/descriptor campaigns,
composed sync and isolated build/budget/origin/trace checks pass. The full historical aggregate was not
rerun. A final deterministic race test exposed and repaired mismatched concurrent receipt readback; the client
already refused it. Final activation/admission checks cover that repair; broader regressions preceded it.
The passing generated histories established no additional defect.

F-04 is closed at this private seam. Next is Account crypto-contract/vector prep: census actual runtime
constructions and trust roots, pin durable root-signed encodings and genesis head-vector membership,
and plan interoperable recovery/vector alignment. The invocation power-loss and other accepted review
gates remain before real Account use. All 21 personal package hashes, stopped personal preview/relay,
historical review and L-2 remain unchanged. New activation work remains uncommitted at this checkpoint.


## 2026-09-11 — Account crypto-contract and vector prep (`L-1` seat)

Fresh first activation was committed as `2ba50aa`. [Bounded F-05/F-06 prep](./account-crypto-prep.md)
now pins the current private source inventory, first-authority field order and recovery payload decisions.
[Evidence](./account-conformance-runs/2026-09-11-account-crypto-prep.md) records 157 source files, 89
literal/template entries, 22 classified groups and six explicit manual entrypoints. A new aggregate gate
checks source/classification drift without pretending that label coverage proves cryptographic soundness.

The first-genesis accepted-head vector is selected as empty; member-at-zero is not an alternate encoding.
Rows 5/7 and the TRD still need that explicit exception in phase A. First epoch, offer, receipt v2 and
activation keep their current domain/LP/hash/recursive JSON order, including nested signatures. Recovery
keeps raw X25519 scalar, binary root commitment and raw Ed25519 bootstrap seed in 32-byte segments,
with exactly 112 ciphertext bytes. The old 48-byte vector remains historical and refused by the current
parser. TRD §13.8 already requires all three ingredients; its missing exact layout and the stale vector
are the remaining inconsistency. The historical review was not rewritten.

Six focused tests pass, including 300 shrinking-enabled scanner cases and inventory omission/drift
controls. Independent Node probes match six signed message formats, reordered nested properties, hash
and nonce derivations, both genesis-head digests, and old/current recovery seals with public-key/root/
digest correspondence. They are prep probes, not complete field negatives or published fixed vectors.
The unchanged eight-document authority check and all 19 vector-currentness/coverage commands pass,
as do targeted lint/format checks. Stalled pnpm launchers were stopped; the same checked script bodies
ran directly via installed Node. Full units/native/build/aggregate were not repeated for a prep-only change.

F-05/F-06 stay open. The implementation is divided into A: first-authority formats/map/vectors;
B: recovery payload/digests/challenges and raw-export prefix; C: envelope/submission/read/response/witness;
D: service/local custody and encrypted Account ledger/witness bridges. Next is A. Other review and real
Account gates remain. Runtime code, all 21 personal package hashes, stopped personal preview/relay,
historical review and L-2 are unchanged; unrelated root files were left untouched. New prep remains
uncommitted. Appended before replacing only L-1.


## 2026-09-11 — Private first-authority formats, map and vectors (`L-1` seat)

Crypto-contract prep was committed as `9cf5c98`. [Phase A](./account-first-authority.md) is complete:
existing first-epoch/candidate/certification/origin/offer/receipt-v2/activation/observation/slot bytes and
structural digests now have an exact byte home, source-site construction records, map dependencies and
fixed executable vectors. TRD §§7.6/13.5 and rows 5/7 state the first-genesis-only empty accepted-head
exception; a member-at-zero entry is not an alternate encoding. No runtime message or version changed.

The checker joins the production source census to 17 specified constructions, 16 visibly open B/C/D/Local
groups and one non-cryptographic exclusion. Six added map entries keep service serialization under its
availability bound, creating/origin keys factor-grounded, and coverage locally rederived. It checks 40
entries, 46 chains and nine swept documents. Zero open map-rule entries no longer masks unfinished Account
construction coverage; F-05/F-06 remain open for later groups. Relevant TRD/row-7 pins were reread; no
AEAD discipline, root permission or whole-protocol debt was changed.

[Final preserved evidence](./account-conformance-runs/2026-09-11-account-first-authority.md) records all 27
campaign stages passing: 17 fixed vectors, 399 input negatives, 333 encoded-field omission controls, six
production digest omissions, 19 registry controls and eight new tests. Two hundred shrinking-enabled
recursive property reorderings pass. Genuine signed wrong-purpose/scope/key-namespace values and nested
extra-field/version/array changes refuse. A signed descriptor lie still requires independent coverage;
the signed zero-position baseline refuses. The fixed WebAuthn assertion verifies against its actual key.
The related 12 admission-core tests (including 80 generated histories), all 28 existing slot-verifier tests,
all 20 vector/coverage commands, and targeted lint/format checks pass. These probes found no new runtime
defect. Harness review strengthened nested/domain controls before the final campaign.

The fixture's checkpoint/wrap/recovery ciphertext is opaque dummy content, not encryption or Yjs coverage
evidence. No full unit/native/build/historical aggregate was repeated. Exact command/results/source hashes
are preserved, and no executable input changed after the final run. Runtime, all 21 personal package
hashes, historical review, stopped personal preview/relay and L-2 remain unchanged; unrelated root files
were left untouched. Next is B: current recovery payload/digest/challenge vectors and raw-export-prefix
assertions, with row-14/TRD alignment. This phase remains uncommitted. Appended before replacing only L-1.


## 2026-09-11 — Recovery payload, digest and challenge vector alignment (`L-1` seat)

First-authority group A was committed as `43b42b1`. Group B now aligns TRD §13.8, row 14, the recovery
byte home and executable vectors with the existing strict 96-byte payload / 112-byte ciphertext. The
original scalar-only corpus and generator hashes are preserved as historical evidence; the current
reader still refuses that layout. F-12's missing export assertion reproduced before repair. Generation
now requires each algorithm's exact 48-byte PKCS#8 prefix/length before taking raw bytes, refuses before
sealing, and clears its exported buffers. This is a portability/correctness check on provider exports,
not a demonstrated attacker-input exploit. Existing valid runtime and signature bytes are unchanged.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-recovery-contract.md) records all 35
stages passing: 13 fixed constructions, 64 encoded substitutions and 64 omissions, authentic malformed
payloads, four effective production guard removals, eight export-format refusals and their omission
controls, and 200 shrinking-enabled root/scope/normalization/payload cases. The actual generator,
opener, digest/challenge/confirmation functions and HPKE recipient bridge match independent encodings.
No additional defect was found by the generated cases. Native recovery's 25 tests, 160 ledger histories,
service SIGKILL, browser restart/renderer death and actual WebAuthn pass; the existing 100-case HPKE
campaign, all 980 units, typecheck, admission/slot regressions, and all 21 vector commands also pass.

First-authority's 17-vector/399-negative/333-omission corpus is retained byte-for-byte, including its
200 reorderings. The map now joins 23 specified constructions, 13 open groups and one non-crypto
exclusion through 45 entries and 53 chains. New registry controls prevent losing the recovery corpus,
primitive role, negative evidence or factor guard. F-05/F-06 remain open. The first sandbox native bind
was refused; the permitted disposable native run passed. A subsequent harness correction separated
per-stage evidence files, and the final complete campaign passed with matching source pins.

Next is group C: envelope/submission/read/response and service-witness byte contracts. Checkpoint/
startup and service/local custody/ledger bridges remain group D. Total-loss recovery, replacement,
rotation, enrollment, invocation power-loss accounting and broader Account readiness gates remain.
No personal state or real Account changed; the 21 package hashes, historical review, stopped personal
preview/relay and L-2 are preserved. No production build or historical aggregate was repeated. The
new phase remains uncommitted. Appended before replacing only L-1.


## 2026-09-11 — Encrypted transport, acceptance and service-witness byte contracts (`L-1` seat)

Recovery group B was committed as `e74fbaa`. Group C is complete: current envelope v1/v2, submission,
refusal/head/response, both read transports and service witness/chain now have exact ordered byte homes,
source-site/map joins and independent fixed vectors. No production code, wire version or schema changed.
Service signatures retain their availability bound; member attribution, held authority, prefix reconstruction,
plaintext semantics and durable admission remain distinct obligations.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-transport-contract.md) records all 36
stages passing with 760 matching source pins: 37 fixed cases, nine reused envelope positives, 314 encoded
substitutions and 314 omissions, 8,924 truncated carrier prefixes, six verification-message omission controls,
and 200 shrinking-enabled independently encrypted/accepted histories. The actual v2 inbound verifier opens
and replays the two fixed Yjs updates as AB. Actual service custody signs all fixed acceptance purposes;
service chain/verifier bodies are exercised in a disposable source copy and through durable regressions.

All 69 service/transport/inbound tests pass, including 200 retained generated histories, browser cold
replay, lost HTTP replies, maximum-size pages, witness damage, process SIGKILL and competing decisions.
The initial campaign found an obsolete registration-omission control: fresh activation's independent
credential binding now blocks its original attack even with the older check removed. The repaired control
retains that refusal and isolates changed registration provenance with current credential/activation intact.
The failed evidence is retained. No runtime repair was necessary. All 983 units in 88 files, typecheck,
retained A/B conformance tests, all 22 vector commands, targeted lint/format and map/registry checks pass.

The registry now names 47 specified records, seven open and one non-crypto exclusion; the authority map
has 49 entries and 57 permitted chains over 11 swept documents. Ten new controls enforce transport corpus,
home, role, guard, signer and negative evidence obligations even with updated aggregate hashes. Existing
A/B bytes and checks remain intact. F-05/F-06 stay open; byte agreement does not establish whole-protocol
correctness, current membership, invocation power-loss accounting or coordinated-rollback resistance.

Next is group D's bounded first part, D1: service root and acceptance-key custody KDF/seal/format contracts,
operator authority and tamper controls. Local promotion/capsules, counter-witness coupling and checkpoint/
startup bridges follow separately. All 21 personal package hashes, historical review, personal servers and
L-2 remain untouched; no real Account/factor/operator key or pin was provisioned. No personal production
build or historical aggregate was run. This phase remains uncommitted. Appended before replacing only L-1.


## 2026-09-11 — Service root and acceptance-key custody contracts (`L-1` seat)

The user requested staging, not committing: the completed group C transport phase is staged as 114 files.
Its exact index patch hash was saved and remains unchanged. D1, the service-custody portion of group D,
is now complete and unstaged. Exact root/acceptance KDF, AAD, seed, seal and provider-format contracts join
four new construction records to the existing authority map; the remaining D/Local work stays open.

Focused tests reproduced unchecked PKCS#8 algorithm bytes in both creators, key generation after
acceptance custody had closed, and an exported acceptance seed retained when RNG failed before its
cleanup block. The repair adds shared strict Ed25519 PKCS#8/SPKI export checks, checks close before
creation and puts post-export operations inside cleanup. Existing valid stored bytes, versions and
signatures are unchanged. These are provider-format correctness and bounded cleanup/lifecycle defects,
not a demonstrated attacker-controlled provider or real-user-key disclosure.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-service-custody.md) records all 39
stages passing with 771 matching input pins: eight independent fixed cases, 39 input substitutions,
24 encoded omissions, 19 primitive AEAD refusals, 16 provider-export mutations and eight effective
production-source guard controls. Two hundred shrinking-enabled histories cold-open independently sealed
roots from SQLite and reject authentically resealed wrong acceptance seeds. Actual creation, all three
KDF layers, cold recovery and fixed-purpose signing match the vectors. No further runtime defect was
found by the generated histories. An initially non-isolating empty-vs-zero HKDF salt mutation was corrected.

All 14 authority regressions pass, including 160 generated and 40 native histories, initialization SIGKILL,
competing setup and Local+journal preflight. All 69 service/transport/inbound regressions, 983 units,
typecheck, retained A/B/C conformance, all 23 vector commands and targeted lint/format pass. Seven new
registry controls prevent missing D1 corpus/owner/export/AEAD/negative obligations. The map has 52 entries,
59 permitted-root chains and 12 swept documents; the registry has 51 specified records, six open and one
non-crypto exclusion. The reviewed runtime census is 158 sources and the same 89 labels/templates.

Next is D2: versioned local promotion authentication and deterministic lineage/attempt identities.
Account capsules, spool/inbound/delivery, counter-witness coupling, checkpoint/startup and inherited
Local/migration bridge disposition follow separately. F-05/F-06 remain open. Host randomness, unrewound/
unbranched histories, operator secret distribution, rotation/restore and complete protocol correctness
are not established by these bytes. All 21 personal package hashes, historical review, personal servers,
L-2 and the staged transport patch remain unchanged; no real Account, factor, operator secret or pin
was provisioned. D1 remains unstaged. Appended before replacing only L-1.


## 2026-09-11 — Local promotion authentication and deterministic identities (`L-1` seat)

At the user's request, group C transport was committed unsigned as `d098bd4` and D1 service custody
unsigned as `d24ca66`, preserving their separate boundaries. A reminder to sign them later was scheduled.
D2 is complete and remains unstaged/uncommitted. It specifies the current v1–v9 promotion carrier,
13 stage combinations, scoped MAC key/payload, retained handoff property order and lineage/attempt hashes.
No production code, valid stored bytes, versions or schema changed.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-promotion-contract.md) records all
41 stages passing with 781 matching input pins: 16 independent fixed vectors, 2,912 input mutations
(1,841 parser refusals and 1,071 MAC refusals), 2,938 encoded omission witnesses and 449 additional parser
refusals. Two hundred shrinking-enabled authentication histories perform 1,372 commit/reopen/tamper/
reorder operations with no counterexample. Native tests authenticate all 13 carrier stages through real
Local custody; ten authentic source/budget/collision lies refuse and are accepted only after removing
the actual source guard. Three native verification-message controls accept altered omitted fields while
WebCrypto HMAC verification remains operative. No runtime defect was reproduced in this bounded phase.

The contract preserves several narrower compatibility rules: most objects reconstruct field order,
but handoff destination order remains authenticated and unlock-binding reordering refuses; lineage uses
ASCII LP even though Local custody permits Unicode slots; genesis actors must remain ordered. The old
preparation narrative now accurately places complete parsing after the signing helper's MAC invocation
and before retained-read verification. Valid MACs still grant no current service eligibility, nested
signature validity, private-key correspondence, replay coverage or handoff permission.

All 80 promotion/genesis/admission/handoff regressions pass, including 260 generated service histories,
139 generated native histories and 200 ES256 conversion samples, interrupted commits, lost replies,
renderer/process deaths, actual passkey/offline handoff and semantic forgery refusal. All 983 units,
typecheck, retained A/B/C/D1 contracts, 24 vector commands and targeted lint/format pass. Nine registry
controls enforce MAC authority, role, version/source coverage and negative/omission evidence. The map
has 54 entries, 62 permitted-root chains and 13 swept documents; 53 constructions are specified,
five remain open and one is excluded. Runtime census remains 158 sources/89 labels.

Next is D3: Account capsule and ledger byte contracts, their hash chain and explicit counter-witness
dependencies. Inherited Local custody/store/journal, checkpoint/startup and migration-only disposition
follow separately. F-05/F-06 and wider readiness gates remain open. All 21 personal package hashes,
24 prior vector files, production sources, historical review, L-2 and unrelated root files are preserved.
Personal preview/relay remain stopped; no real Account/factor/operator secret or pin was provisioned.
Appended before replacing only L-1.


## 2026-09-11 — Account capsule and ledger byte contracts (`L-1` seat)

D2 was committed unsigned as `1897848` at the user's request; the signing reminder now includes it
alongside C `d098bd4` and D1 `d24ca66`. D3 is complete and remains unstaged/uncommitted. Source, spool,
delivery and inbound carriers, whole-source and held-receipt hashes, the shared ledger chain and its
authenticated counter dependency now have exact byte contracts. No production code or persistent
format changed, and no runtime defect was reproduced in this bounded phase.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-ledger-contract.md) records all
42 stages passing with 795 matching input pins. Twenty independent vectors cover ten carriers,
eight chain extensions and two digests. All 118 carrier mutations are refused or change canonical bytes;
118 encoded omissions, 13,876 truncated prefixes and 80 other framing cases refuse. All 73 receipt leaf
mutations change the baseline hash or refuse. Two hundred shrinking-enabled generated ledger histories,
seed 5110917, cover 2,563 events, retries, unfinished positions and missing records with no counterexample.
Matching old ledger/witness prefixes remain accepted, explicitly preserving the rollback limitation.

Eight effective weakening cases remove actual identity/digest/source, witness, ordering, coverage or
digest-input checks while real cryptography remains operative. A separate defence control confirms that
removing only the early count check still refuses through final pair equality. Correctly encrypted/signed
different originals refuse before exposure. Existing native receive controls re-encrypt false service
evidence with valid Local AEAD and a valid counter MAC; cold replay still reauthenticates and refuses it.

All 75 native capture/spool/delivery/receive tests pass, including 44 generated browser histories,
strict commit interruptions, missing tails, close/activation fences, journal/compaction preservation,
pending dependency recovery and content/evidence atomicity. All 983 units in 88 files,
typecheck, retained A/B/C/D1/D2 contracts, 25 vector commands and targeted lint/format pass. Nine new
registry omission controls enforce corpus, witness, role, source and negative-evidence dependencies.
Six specified D3 records replace the open Account-ledger record: the registry has 59 specified, four
open and one exclusion; the map has 58 entries, 70 permitted-root chains and 14 swept documents.
Runtime census remains 158 sources/89 labels and templates.

Next is D4: authenticated counter and witness byte contracts, the bounded Account-to-Local bridge for
v1/v2 counter payloads, scoped metadata keys/MACs and atomic counter/witness ownership. Inherited
store/journal/custody, checkpoint/startup and migration-only disposition remain separate where not
covered. F-05/F-06, wider readiness and invocation power-loss/rollback/clone assumptions remain open.
All 21 personal package hashes, 25 prior tracked vector files, production sources, historical review,
L-2 and unrelated root files are preserved. Personal preview/relay remain stopped; no real Account,
factor, operator secret or pin was provisioned. Appended before replacing only L-1.


## 2026-09-11 — Authenticated content counter and witness contracts (`L-1` seat)

D3 was committed unsigned as `24bc3a4` at the user's request. The signing reminder includes it alongside
C `d098bd4`, D1 `d24ca66` and D2 `1897848`. D4 is complete and remains unstaged/uncommitted. It specifies
the scoped metadata HKDF, initialization witness, counter v1/v2 MAC bytes, structured-clone parsing and
reservation/event ownership without changing production code or persistent formats.

D4 corrects the earlier D3/spool claim of strict content commits. Native instrumentation confirms that
these transactions request and report relaxed durability. This is the already-open F-15 issue, not a
newly repaired runtime defect: transaction atomicity and renderer-crash recovery do not establish
power-loss persistence of invocation grants. Current contracts are corrected; historical evidence stays
unchanged. No strict-persistence repair or F-15 closure is claimed.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-counter-contract.md) records all
43 stages passing with 806 matching input pins. Eight independent fixed cases include Unicode
scope framing and numeric multi-generation ordering. Eighty input mutations produce 47 parser refusals
and 33 changed authenticated payloads; 95 encoded omission witnesses and 88 malformed parser cases pass.
Two hundred shrinking-enabled allocation histories, seed 5110918, cover 1,443 successful reservations
and 13 ceiling refusals with no counterexample. Root ID is intentionally absent from key info and bound
by every metadata message. Helper generation-change cases do not qualify production Account rotation.

Six helper source controls remove actual binding, comparison or allocator checks. Native tests additionally
prove the MAC-comparison race at the transaction boundary and show that omitting reservation persistence
invokes AES before allocation even though the later rewind guard still refuses. Real custody derivation
and stored MACs match the independent oracle. Eight correctly MACed semantic lies refuse, and a final
transaction abort retains the burned reservation while publishing neither event nor witness.

The ten new helper/native tests, 41 existing spool/receive native regressions (including 20 generated
browser histories), all 983 units in 88 files, typecheck, retained A/B/C/D1/D2/D3 contracts,
26 vector commands and targeted lint/format pass. Review found a missing-MAC fixture conversion that
could fail before production parsing; it now preserves field absence and requires the runtime refusal
code. The interrupted initial campaign and the complete corrected campaign are preserved.

Four D4 records join the map: 63 constructions specified, four open and one exclusion; 61 map entries,
75 permitted-root chains and 15 swept documents. Nine new registry controls enforce owner, byte and
negative-evidence obligations. Runtime census remains 158 sources/89 labels and templates. The next
bounded phase is D5's inherited store and synchronous journal byte bridges. Other custody, checkpoint/
startup, migration provenance, F-05/F-06, F-15 and wider Account readiness remain separate.

All 21 personal package hashes, 26 prior tracked vector files, production sources, historical review,
L-2 and unrelated root files are preserved. Personal preview/relay remain stopped. No real Account,
factor, operator secret or pin was provisioned. Appended before replacing only L-1.


## 2026-09-11 — Inherited store and synchronous journal byte bridges (`L-1` seat)

D4 was committed unsigned as `837cd14` at the user's request. The existing signing reminder now includes
C `d098bd4`, D1 `d24ca66`, D2 `1897848`, D3 `24bc3a4` and D4. D5 is complete and remains unstaged/
uncommitted. It specifies current store naming, store KDF/record AAD and synchronous journal KDF/AEAD/
carrier ownership, preserving all production sources and existing valid stored formats.

The inherited row-2 statement that nonce safety was unconditional was corrected to the finite-use
collision bound and fresh-randomness assumption; flushing does not reset invocation count. Current
factor custody rejects malformed Unicode before name derivation, while the typed low-level name helper
itself aliases lone surrogates with U+FFFD. Neither finding requires changing current valid bytes.
No new runtime defect was reproduced. Rotation, clone/restore assumptions, whole-WASM provenance and
F-15's relaxed-durability/power-loss accounting remain separate.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-store-contract.md) records 46 passing
stages with 823 matching input pins: eleven new independent vectors, six inherited stored-record cases,
four inherited journal cases, 44 field mutations and 44 encoded omission witnesses. The generated byte
histories cover 160 shrinking-enabled runs and 1,195 steps, seed 5110919, without a counterexample.
Parser, maximum-size and Unicode checks pass. Six source binding omissions, one base64 canonicality
omission and one actual custody KDF omission are detected with real cryptography still operative.

Three native tests inspect actual factor-opened key derivation, raw carrier plaintext/bytes, writer and
ordinal restart, exact flush payloads, and eight changed record/journal fields. The KDF control still
reads its own ciphertext but fails the independent byte oracle. Two content and six journal inherited
native cases pass; five matching source mutants are detected. All 28 existing WASM checks, 983 units
in 88 files, typecheck, retained A/B/C/D1/D2/D3/D4 contracts, 27 vector commands and lint/format pass.
The initial focused fixture's key-usage assumption was corrected for read-only enrollment derivation.
A passing first full campaign was followed by stronger complete-plaintext assertions and a passing final
campaign; the earlier summary/pins and native output are preserved with that explanation.

Four constructions replace remaining-shared-store: 67 specified, three open and one exclusion; 66 map
entries, 80 permitted-root chains, 16 swept documents. Eight registry controls enforce the new evidence
obligations. Runtime census stays 158 sources/89 labels and templates. D6 will qualify inherited factor
custody, envelopes and actual v2 credential/key-check/metadata bytes. Checkpoint/startup and Local/migration
provenance remain separately open, as do F-05/F-06, F-15 and broader Account readiness.

All 21 personal package hashes, 27 prior tracked vectors, production code, historical review, L-2 and
unrelated root files are preserved. No personal build/server, real Account/factor/operator secret or pin
was provisioned. Logs, reports and five native mutant source files were copied exactly; a manifest lists
omitted duplicate frozen source trees. Appended before replacing only L-1.


## 2026-09-11 — Inherited factor custody and v2 credential/metadata byte bridges (`L-1` seat)

D5 was committed unsigned as `add6fd7` at the user's request. The existing reminder now includes six
unsigned commits: C `d098bd4`, D1 `d24ca66`, D2 `1897848`, D3 `24bc3a4`, D4 `837cd14` and D5.
D6 is complete and remains unstaged/uncommitted. It pins v1 factor/generation-envelope bytes, v2
private-credential seals, local Ed25519/X25519 correspondence and custody metadata KDF/MAC/ownership.

A generated parser test reproduced a real contract defect: String(state) admitted arrays and boxed
strings; boxed protected state also preserved the original valid metadata MAC. Fast-check shrank the
case to boxed state with three reservations in one shrink. Ordinary open independently refused it with
creation-pending, so no successful unlock, disclosure or authority bypass was reproduced. The one-line
repair requires primitive state strings. Native structured-clone tests confirm repair-required at parsing,
restore the old acceptance as a control, and retain the old owner's refusal. Valid formats are unchanged.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-local-custody.md) records 46 passing
stages and 835 matching input pins. Fifteen independent vectors and the unchanged three inherited factor
seals/two generation envelopes agree with actual builders/openers. All 115 field mutations and 115
encoded omission witnesses pass. There are 106 counted nested-parser refusals, six private-format
failure cases and logical clearing tests. Ten helper source controls and native verification/comparison
controls remain effective with real crypto operations. The original failing state property, fixture,
production file and replay instructions are preserved separately from the passing campaign.

After the fix, all 100 generated state cases pass, seed 5110920. Two hundred shrinking-enabled metadata
histories, seed 5110921, cover 1,539 reservation/completion/reparse/tamper steps without another failure.
Four native tests (six results including two nested comparison runs) verify real custody derivation,
independent private/public correspondence, complete metadata MACs, cold opening, 17 cleared temporary
buffers, valid-tag wrong-key refusal, state rejection and a changed prior-MAC race before root sealing.
All 13 inherited custody cases and five mutants pass their detection criteria, including actual renderer
death, concurrent creation, abort, scope, lifetime, cancellation and synthetic profile-copy probes.
All 983 units in 88 files, typecheck, earlier A/B/C/D1–D5 contracts, 28 vector commands and lint/format pass.

Five constructions replace remaining-shared-custody: 72 specified, two open and one exclusion. The map
has 73 entries, 90 permitted-root chains and 17 swept documents; nine new registry controls enforce D6
obligations. The runtime census remains 158 sources/89 labels, with only custodyRecord.ts's hash updated
for the repair. D7 is the next bounded phase: Account genesis checkpoint and persisted-startup byte
bridges. Local/migration provenance, PRF ceremonies, general rotation, default-durability/power-loss
accounting, F-05/F-06, F-15 and broader Account/release gates remain open.

All 21 personal package hashes, 28 prior tracked vector files, historical review, L-2 and unrelated root
files are preserved. Production change is confined to the strict state guard. No personal build/server,
real Account, factor, operator secret or pin was provisioned. The evidence manifest records selected
exact copies and omitted duplicate source/profile material. Appended before replacing only L-1.


## 2026-09-11 — Account genesis checkpoint and persisted-startup byte bridges (`L-1` seat)

D6 was committed unsigned as `3585a1b` at the user's request; the existing reminder includes all seven
unsigned C/D1–D6 commits. D7 is complete and remains unstaged/uncommitted. Production code, current
cipher/manifest versions, the prior vectors and personal installation are unchanged.

The [D7 contract](./account-crypto/checkpoint.md) qualifies exact checkpoint KDF/AAD, closed genesis
carrier and persisted startup predicates. Inherited cipher bytes agree, but the generation-3/epoch-9
fixture's IDs and prose plaintext are not a current supported Yjs genesis. Startup must already hold
its admitted genesis in recovered database/journal; it cannot substitute AEAD success for the pinned
receipt, member/factor/passkey/scope and full replay checks. Per-seal freshness remains probabilistic
and conditional on nonrepeating randomness and unrewound/unbranched histories.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-checkpoint-contract.md): all 49
stages pass with 849 matching source pins. Six independent vectors, 48 field/cipher checks,
15 encoded omissions, 44 parser refusals, seven helper source controls and six registry controls pass.
All 250 cipher, 200 Yjs deletion/pending/reorder and 24 native cold-replay histories pass with shrinking
enabled and no production counterexample. Early property/expected-message mistakes were harness-only
and corrected before the final campaign.

Four native tests match actual producer/startup bytes, prove retained retry does not reseal, cold-open
offline without writes, preserve a later edit, and refuse removed journal or erased content. Omitting
selected/active coverage checks actually accepts damaged state. Removing startup workspace from KDF
refuses valid state. Local-MAC-authenticated receipt/candidate/checkpoint alterations refuse before
opening, and the original restored state succeeds. Observed checkpoint buffers clear; no whole-heap,
filesystem or power-loss guarantee is inferred.

Inherited genesis and handoff campaigns pass, including renderer/commit interruption and genuine-signer
semantic forgeries. All 983 unit tests/88 files, typecheck, prior A/B/C/D1–D6 contracts, 29 vector commands
and lint/format pass. Two constructions replace the checkpoint group: 74 specified, one open and one
exclusion; 77 map entries, 96 permitted-root chains, 18 swept homes. Service availability proofs remain
separate from content authority. Census stays 158 sources/89 labels with no source-hash changes.

D8 will disposition the remaining Local/migration-only provenance group before aggregate F-05/F-06
closure can be considered. Live Account dependencies cannot be waved away as migration-only. No new
migration tooling, real Account onboarding or deployment is authorized by that disposition. F-15,
successor epochs/checkpoints, second-device enrollment/adoption, broader Account/release gates and
independent review remain open. All 21 personal hashes, 29 prior tracked vectors, historical review,
L-2 and unrelated root files are preserved. Appended before replacing only L-1.


## 2026-09-11 — Signed contract history and retained Local provenance (`L-1` seat)

D7 was committed signed as `5555238`. The seven unsigned C/D1–D6 commits were recreated with verified
signatures and unchanged trees, messages and author/committer metadata. The original chain remains at
`codex/pre-sign-contract-history-2026-09-11`, preserving historical evidence references. The
[mapping](./account-conformance-runs/2026-09-11-signed-contract-history.json) records old/new IDs.
All eight signatures verify `G`; no push occurred and the signing reminder is paused.

D8 is complete and remains unstaged/uncommitted. Its [contract](./account-crypto/local-provenance.md)
specifies the four Local claim labels consumed by Account promotion/startup, including retained imported
selection and cleanup bytes. Eight other labels have four explicit inherited Local/migration dispositions
outside current Account acceptance, with exact label/primitive/scope and historical-evidence pins.
The shared cleanup payload remains a live dependency. Native throwing barriers demonstrate the four
excluded operations are not invoked on the tested Account paths; direct probes exercise each barrier.
Incomplete authenticated cleanup progress does not assert source absence or invoke deletion on startup.

[Final evidence](./account-conformance-runs/2026-09-11-account-local-provenance.md): 50 passing stages,
864 matching source pins, eight independent fixed vectors, 51 field mutations, 46 encoded omissions,
230 actual input mutations (190 parser/40 crypto refusals), seven source omission controls, 250
shrinking-enabled helper histories and 20 native histories. Four native tests, seven selected inherited
Local-genesis failure cases/two matching mutants, ten new registry controls, 983 units/88 files,
typecheck, earlier contracts and 30 vector commands pass. No production counterexample was found;
runtime and valid formats are unchanged. New native imported claims use synthetic authenticated
provenance, not a fresh whole-migration ceremony.

Registry: 78 specified, zero open, four inherited outside Account acceptance and one non-crypto
exclusion. Map: 80 entries/102 chains/19 homes. Runtime census: unchanged 158 sources/89 labels/templates.
All 21 saved package hashes, 30 prior tracked vectors, historical review and L-2 are preserved. Personal
servers remain stopped; unrelated root files and real Account/browser/secrets are untouched.

Next is the aggregate A/B/C/D1–D8 F-05/F-06 closure audit, including inherited limits. Zero open groups
does not itself close those findings. F-15, remaining review and broader Account/release gates remain.


## 2026-09-11 — Aggregate Account crypto-contract closure (`L-1` seat)

D8 is signed and committed as `393ef43`; all nine C/D1–D8 signatures verify `G`. The aggregate audit
is complete and remains unstaged/uncommitted. The historical review and earlier receipts are unchanged.

[Current dispositions](./review/implementation/account-crypto-closure.md) close F-05 and F-06 for the
current private first-epoch Account protocol. F-05's source/map/byte/vector omissions are repaired across
A/B/C/D1–D8, with the initial empty-head rule explicit and the four inherited Local/migration groups
separately scoped. F-06's TRD/row-14/runtime/current vectors agree on the 96-byte payload/112-byte
ciphertext; historical scalar-only bytes remain preserved and refused. Other findings and broader
protocol/release obligations are not closed by these decisions.

[Aggregate evidence](./account-conformance-runs/2026-09-11-account-crypto-audit.md): 71 stages,
870 matching source pins, 237 Node tests/36 files including all 27 declared files
and 100 tests/11 native files. The separate slot/transport unit bridges and 30 vector
commands pass, with no skipped test or timeout. Eleven corpora contain 159 fixed cases, 4,332 published
input negatives and 4,106 encoded omissions; their different evidence levels are explicitly recorded.
The source/field assessment and six manual entrypoints supplement registry counts. Historical source
comparison distinguishes intervening B/D1/D6 repairs from unchanged D6–D8 source. No new production
defect was found. Stale checker/registry status text is corrected and a reproducible aggregate runner
is exposed as `pnpm account:crypto-audit`.

Production sources, existing tests, 31 prior tracked vector files, all 21 personal package hashes,
historical review and L-2 are unchanged. Personal servers remain stopped, unrelated root files untouched,
and no real Account/browser/secrets/routing changes occurred. The full D8 unit receipt remains valid at
unchanged source; this audit reruns the directly referenced unit bridges.

Next is F-15 reservation durability, beginning with its failure model and transaction inventory, before
any strict-persistence change. Page/renderer loss, power loss and restore/clone branching must remain
distinct. Enrollment/adoption, later epochs, recovery/finalization and other review/release gates remain.


## 2026-09-11 — Strict reservation persistence and invocation accounting (`L-1` seat)

The aggregate F-05/F-06 audit was committed signed as `ec889d9`; all ten C/D1–D8/audit signatures verify.
[F-15](./review/implementation/reservation-durability.md) now has a concrete grant inventory and supported
failure model. A pre-repair owner/AES reproduction loses an unflushed completed grant: count 1 versus
2 observed invocations. The repair requests strict persistence for custody writes and shared content
allocation/final ledger commits, and both helpers verify reported strict before bodies run. Promotion's
existing strict writes gain that check. Refusal drains native work, including a failed-abort race.
Network attempts require the final encrypted event/witness commit before encryption. Stored bytes are unchanged.

[Evidence](./account-conformance-runs/2026-09-11-account-reservation-durability.md): all 50 stages and
855 source pins pass; 133 Node tests, 47 native storage component cases, 18 detected component mutants,
983 units, type checking, 30 vector commands and targeted lint/format. The new 20 tests include 4,000
generated loss/retry histories with effective durability/order controls, real custody/content AES,
unsupported capability and native settlement, and outbound grant/abandonment tests. One fresh read-only
candidate review found no concrete remaining bypass/regression; its construction-error documentation
observation was confirmed and corrected. The original undercount no longer reproduces under modeled
strict persistence, and normal owner regressions pass.

F-15 is fixed at this private seam conditional on accurate initial budgets, corrected writers and storage
honoring strict semantics. Browser reporting is not a physical flush measurement; past undercounts,
restored/branched profiles and other platforms remain unqualified. SC-01 stays page/navigation scope.
F-05/F-06 closure and all 31 prior vectors remain unchanged. The broad historical root check was not rerun.

Next: F-21.3 cross-account admission-capability isolation and restart conformance with two valid accounts.
All 21 personal package hashes, stopped personal servers, historical packet and L-2 are preserved. No
real Account/factor/operator key/pin/origin/browser change. New F-15 work is unstaged/uncommitted.
This outcome was appended before the L-1 rewrite.


## 2026-09-11 — Cross-account admission capability isolation (`L-1` seat)

F-15 was committed signed as `c10dee3`; all eleven C/D1–D8/audit/F-15 signatures verify `G`.
The prior 855 source pins were rechecked after commit hooks with no drift. The current F-21.3 phase
is complete and remains unstaged/uncommitted. No production code or valid protocol bytes changed.

[Current disposition](./review/implementation/account-isolation.md): F-21.3 is closed for the private
registration/recovery/admission capability boundary. The existing unknown-token generated command did
not test recognized neighboring authority; the older activation swap fixture also used separate DBs.
The new fixture has two valid accounts in one core/authority, with distinct workspace/lineage/signing
identities and real Ed25519/ES256 passkeys, avoiding false isolation from uniqueness collisions.

[Preserved evidence](./account-conformance-runs/2026-09-11-account-isolation.md): 44 stages, 205 Node
tests, 865 matching source pins, types, 30 vector commands, census/map/registry, lint and format pass.
The 23 new tests cover 148 directed mixed requests, eight live-recovery swaps, 160 shrinking-enabled
histories plus complete before/after-commit loss histories, six SIGKILL cases and two live service
processes. Refusals preserve every logical service/authority row; legal actions preserve the neighbor
and retain exact offers/challenges/receipts across retry. The state oracle predicts lifecycle, counters,
activation proof hashes and receipt retention independently of core predicates, while observing and
pinning first-issued random bytes. No production counterexample was found.

All three omission controls are detected. A recognized-but-unbound token returns a neighboring signed
offer while the original unknown token still refuses. Removing the explicit pending target accepts a
crossed abandonment request. Removing the account predicate from proposal cancellation changes the
neighbor; the generated control shrinks with seed `112104`, path `0:1:1:2:2:2`. Initial focused binding
expectation/callback-return mistakes were harness-only and corrected before final execution.

Affected admission, activation, account-core, recovery, handoff, bounds and service-delivery regressions
pass, including selected native browser cases. The new service payloads are synthetic content-blind
fixtures; inherited native checks exercise actual encrypted content/custody. Full Vitest, aggregate
crypto audit and broad storage campaigns were not rerun for this test-only change. Process death does
not establish power-loss behavior or qualify a platform. Other F-21 subfindings remain separately scoped.

Next is F-21.7: real service-issued permanent refusal and competing-digest/conflict evidence through the
actual browser delivery owner, including lost reply/restart and useful controls. Remaining parser,
delivery-oracle, neutral-residue, diagnostic/performance and broader Account/release gates remain open.
All 21 personal package hashes, 31 prior vector files, historical review and L-2 are preserved. Personal
servers remain stopped; no real Account, browser, factor, operator key, pin, origin or routing change
occurred. Unrelated root files remain untouched. Appended before replacing only L-1.


## 2026-09-12 — Service-issued refusal and conflict composition (`L-1` seat)

F-21.3 was committed signed as `2bbb4c6`; all twelve C/D1–D8/audit/F-15/isolation signatures verify `G`.
All 865 prior source pins matched after the commit hooks. The new F-21.7 phase is complete and remains
unstaged/uncommitted. No production code, protocol bytes or vector changed.

[Current disposition](./review/implementation/account-decision-composition.md) closes F-21.7 for the
private first-epoch issuer/browser-owner boundary. Actual `decideSubmission` closes a synthetic device's
signed generation-mismatch subject and returns that exact refusal to its original browser submission.
A separate valid competing envelope obtains a real winning head. Neither response is minted by a
fixture acceptance signer. The alternate device behavior is deliberately faulty/branched and does not
establish a supported clone or successor API.

[Preserved campaign](./account-conformance-runs/2026-09-12-account-decision-composition.md): 47
stages, 112 Node tests, 40 selected unit cases, 875 matching source pins, types, 30 vector
commands, census/map/registry, lint and format pass. All 24 new tests pass, including four service
SIGKILL cuts, four renderer response-commit cuts, 16 generated retry/reopen histories and 12 generated
refusal/successor arrival histories, with shrinking enabled. No production counterexample was found.

The oracle compares exact retained source/envelope/submission/proof rows, counter monotonicity, spool
positions, network invocation counts and visible writing. Refusal-first retains two proofs; conflict-first
retains only the winning head. Both halt publication while Local writing remains available. All three
source omission controls expose their predicted false durable return or incorrect publication readiness.
Existing service, response-verifier, delivery, automatic sender and composed-sync regressions also pass.

Initial focused failures were test assumptions: reopening may append a canonical empty Yjs capture,
the sender hides its raw pending method, and send closure does not require a shared receive halt.
Final checks require every old capsule exactly and permit only the precise same-route/actor no-op as
an unexplained addition. A competing self-stream is refused before inbound persistence with Local
editing active; the existing receive diagnostic remains `operation-failed`. No diagnostic repair is
claimed. The initial log is retained as diagnostic evidence without a separately pinned initial source.

Next is the remaining F-21.1 parser coverage inventory and targeted structured mutations, crediting
D2/D3/group-C evidence already present. F-21.6's unit oracle, neutral residue scanning, diagnostics,
maintenance and broader Account/release gates remain. Full Vitest, the aggregate crypto audit, broad
storage and inherited generated-sync campaigns were not rerun for this test-only change. Native death
is not power-loss qualification. All 21 personal package hashes, 31 prior vector files, historical
review and L-2 are preserved. Personal servers and real Account/browser/secrets remain untouched.
Appended before replacing only L-1.


## 2026-09-12 — Remaining closed-parser conformance (`L-1` seat)

F-21.7 was committed signed as `f0b6acd`; its 875 source pins agree with the committed files, and the
13 signed C/D1–D8/audit/F-15/isolation/composition commits remain recorded. This new phase is complete
and remains unstaged/uncommitted.

[Current F-21.1 disposition](./review/implementation/account-parser-conformance.md) addresses the six
named parsers at their current private first-epoch boundary. Inventory credited A/C/D2/D3's existing
structured/framing/generated evidence before adding the missing cases. New mutations found string
coercion in promotion stage, spool source hash and three Account index fields, plus sparse credential,
genesis actor and genesis wrap arrays skipping validation. Five type predicates and three dense array
traversals repair four production files. No valid byte format, version, key or authority edge changed.
The census and six existing construction-site line locations are refreshed; prior vectors remain exact.

[Preserved campaign](./account-conformance-runs/2026-09-12-account-parser-conformance.md): 46 stages,
141 Node tests, 44 selected unit cases, 884 source pins, types, 30 vector commands,
census/map/registry, lint and format pass. The 34 new tests include 14,491 incompatible nested-type
cases, 3,350 generated cases and twelve effective omission controls. Frozen signed-baseline replay
shrinks both generated coercion defects to one singleton array (seeds 112101/112104, path `0:0`).
It also reproduces sparse/index acceptance before the repair. Native IndexedDB connection readback
preserves holes and rejects the malformed records while valid records parse. Declared genesis size
edges and a valid capsule at exactly 2 MiB are exercised directly through parsers.

Existing A/C/D2/D3 contracts, service admission and native promotion/genesis/spool owners pass.
One initial harness error supplied hex where Node verification required a KeyObject; corrected before
final execution. Initial diagnostic logs are retained without inventing initial source provenance;
final frozen-baseline controls provide pinned before/after evidence. Parsing is not authentication or
eligibility, and native database reopening is not renderer death or power-loss qualification. Full
Vitest, aggregate crypto audit and other broader owner/storage campaigns were not rerun.

Next is F-21.6's named delivery unit oracle, crediting D3/F-21.7 and preserving order-sensitive evidence
rather than demanding false full-state permutation equality. Other review, Account and deployment
obligations remain separate. All 21 personal package hashes, 31 vectors, historical review and L-2
are unchanged. No personal server, browser, Account, factor, operator key, pin, origin or routing change
occurred. Unrelated root files remain untouched. Appended before replacing only L-1.


## 2026-09-12 — Delivery evidence oracle strengthening (`L-1` seat)

Parser conformance was committed signed as `77b0bb6`; its 884 source pins agree with committed/current
files and all fourteen recent signatures verify `G`. This new F-21.6 phase is complete and remains
unstaged/uncommitted. No production code, valid format, registry or vector changed.

[Current disposition](./review/implementation/account-delivery-oracle.md) addresses the named delivery
unit oracle and retained-evidence gap. A constraint-domain interpretation replaces the transition-like
pairwise oracle and compares every `DeliveryState` field and publication status after every forward,
reverse and shuffled prefix. First refusal IDs and final cutoffs are intentionally order-sensitive.
Exact sentinel maps/references and evidence immutability are checked. Pure folding beyond conflict is
separate from the owner's refusal of new proof writes after the first contradictory proof.

[Preserved campaign](./account-conformance-runs/2026-09-12-account-delivery-oracle.md): 43 stages,
79 Node tests, 24 selected unit cases, 893 matching source pins, types, 30 vector
commands, census/map/registry, lint and format pass. The 500 generated unit histories produce 1,500
orderings and 9168 prefix checks (seed 1121060, no counterexample/shrink). A separate finite
interpretation agrees on all 2,197 triples against 80 concrete worlds. All twelve source controls are
detected; four still match every field of the actual old oracle extracted from the signed baseline.

Six new native tests cover both orders of contradictory refusal IDs/final cutoffs and two retention
faults through compaction/cold restart, checking exact first values, proof/submission/source/envelope
bytes and witness counts. Their synthetic acceptance signatures do not implement real finalization.
Existing D3/C, the full native delivery suite and F-21.7's genuine service-issued order histories pass.
No production defect or unexplained test failure was found. Full Vitest, aggregate crypto audit and
broader Account/storage/platform campaigns were not rerun; this is not power-loss qualification.

Next is F-21.2's remaining admission evidence inventory: credit A/D7/genesis/admission tests, distinguish
current raw coverage bounds from obsolete LP-bound prose, and cover only missing client-owned
coverage/size cases. Other review, privacy, Account and deployment gates remain. All 21 personal package
hashes, 31 vectors, historical review and L-2 are preserved. No personal server, browser, Account,
factor, operator key, pin, origin or routing changed. Unrelated root files remain untouched.
Appended before replacing only L-1.


## 2026-09-12 — Remaining admission coverage and size evidence (`L-1` seat)

Delivery-oracle work was committed signed as `3b0a1ba`; its 893 source pins agree with committed/current
files. All fifteen recent signatures verify `G`. This new F-21.2 phase is complete, unstaged/uncommitted.
No production code, protocol format, limit, registry or vector changed.

[Current disposition](./review/implementation/account-admission-evidence.md) credits the earlier bounds
protocol/native tests, A/D7 and later genesis/admission/parser evidence rather than repeating the old
blanket absence claim. New cases fill receipt-resume and exact owner size gaps. Real HTTP service-issued
SV/DS lies carry valid signatures and pass content-blind verification, but fail the client owner's own
cold replay. Independent Node/OpenSSL verification and decrypted checkpoint rederivation provide the
separate check. Test-planted authenticated receipted carriers isolate the cold branch.

[Preserved campaign](./account-conformance-runs/2026-09-12-account-admission-evidence.md): 44 stages,
75 Node tests, 898 source pins, types, 30 vector commands, census/map/registry, lint and format
pass. Twelve new native cases include twelve generated histories (seed 1121026, no counterexample),
three actual Yjs snapshots at 16 MiB minus/exact/plus one, and six explicitly injected combined coverage
edges. Allowed snapshots seal once and cold-retry without writes/reseals. Oversize snapshots refuse
before sealing; oversized injected coverage refuses before requested/send. All source/cold replay hashes
are retained. Three distinct source omissions are effective at those exact boundaries. The snapshot
omission still encounters a later parser refusal, so it establishes early-seal prevention rather than
sole protection against oversized persistence. Existing bounds/A/D7/genesis/admission regressions pass.

No production defect was found. A focused harness failure reused a closed setup page; separate case/
generated-history fixture lifetimes fixed it. Loopback sandbox refusal was environmental. Full Vitest,
aggregate crypto audit, unrelated campaigns, other platforms, power loss, real Account capacity and
whole-profile residue remain outside this evidence. Personal 21 package hashes, 31 vector files,
historical review and L-2 are unchanged. No personal server/browser/Account/factor/key/pin/origin/routing
changed; unrelated root files remain untouched. Next is F-21.4 neutral plaintext-residue preparation:
carrier/representation inventory, permitted plaintext, lifecycle points and effective leak controls,
with logical carrier and filesystem profile claims kept distinct. Appended before replacing only L-1.


## 2026-09-12 — Neutral plaintext-residue preparation (`L-1` seat)

Admission coverage/size work was committed signed as `f118127`; all sixteen recent signatures verify
`G`. Its 898 source pins still match committed/current files. The new F-21.4 preparation is complete,
unstaged/uncommitted. F-21.4 itself remains open; no scanner or runtime confidentiality test ran.

The [contract](./account-residue-testing.md), [23-entry surface inventory](./account-residue-prep/surfaces.json)
and [current disposition](./review/implementation/account-residue-evidence.md) distinguish logical
browser/service carriers, physical profile/SQLite residue and copied-profile custody. Existing C13,
known legacy cleanup and byte-contract evidence retain their actual scope. Source navigation has
83 lexical matches and 71 pinned files; it is not a complete reachable-writer census.

The first executable R1 phase requires independently collected values and matching before hashing,
all discovered keys/stores, calibrated encodings and planted leaks per surface, incomplete results for
missing coverage, and live/cold recovery checks separate from the scan. P0–P7 cover Local creation,
journal-only admission, flush/compaction/lock/reopen, real browser recovery preparation, lost promotion
reply, Account delivery and named failure branches. Twenty-four generated variations follow directed
cases as an exploration budget. Fragmentation, compression and opaque key material limit a negative
result. Packaged SW/export/migration/clear and physical residue remain subsequent phases.

Current device labels use encrypted document metadata; the plaintext device helper is legacy.
Recovery preparation retains a sensitive retry capability and exact finalization request, requiring
separate reporting and actual browser-owner exercise. The native ready() helper alone misses that row.
PRD acceptance item 13's promptless copied-profile expectation contradicted the already selected
mandatory-factor contract; corrected without changing the historical review or claiming new evidence.
No production code or protocol format changed.

[Static prep evidence](./account-conformance-runs/2026-09-12-account-residue-prep.md) records source/link/
JSON checks and preservation. All 21 personal package files, 31 vectors, historical review and L-2
are unchanged. No personal browser/profile/recovery file, server, real Account, factor, operator key,
pin, origin or routing changed. Unrelated root files remain untouched. Appended before replacing only L-1.


## 2026-09-12 — R1 neutral logical-carrier residue evidence (`L-1` seat)

Residue preparation was committed signed as `6a9c9c4`; all seventeen recent signatures verify `G`.
The new bounded R1 implementation is complete, unstaged/uncommitted. F-21.4 remains open for wider
flows and physical/platform evidence. No production code, protocol format, dependency or vector changed.

The [independent scanner](./account-residue-r1.md) enumerates unknown browser stores/keys, raw clone
values, live-page session storage, CacheStorage, cookies, OPFS, all current service/authority SQL tables
and captured page/service diagnostics. It matches before hashes/report redaction, handles calibrated
encodings and reports missing/unreadable/budget-limited acquisition as incomplete. Opaque key contents
and physical profile/SQLite/WAL/deleted bytes remain outside the claim. IPC fence bytes are scanned;
only the separate stability comparison excludes the known observer frames.

[Final evidence](./account-conformance-runs/2026-09-12-account-residue.md): 7 stages, 16 Node cases,
144 calibration cells, 26 directed checkpoints, 24 generated histories, 871 matching source pins,
types, scoped lint and format pass without skips or timeout. The seed is `1121040`, with 0 shrinks
and no counterexample. The 155 checkpoint reports include 154 complete observations without prohibited
matches and the deliberately planted native journal side-write, which is detected after an acknowledged
edit. All collector/encoding omission controls are effective. Expected writing survives independent
live/cold checks through real Local, recovery, promotion, capture/spool/delivery and Account owners.
Recovery retry capability matches are reported at their two documented sensitive fields, not called
public metadata. A valid incorrect factor, cancellation and failed journal storage exercise named
failure paths. Generated schedules vary placement, flush/lock/reopen, compaction, reply loss and edits.

Development found detector escape/diagnostic gaps and fixture setup mistakes, not a production defect.
The first unarchived focused generated attempt exhausted 270 seconds; it is incomplete evidence.
Explicit receive retry avoids waiting solely for the ordinary five-second poll. The budget remains
270 seconds and the final generated stage finishes in 223.7 seconds. The runner now requires nonzero
case/point evidence and records per-history progress. Earlier passing-run evidence is distinguished
from the final diagnostic/factor refinements. All 482 original artifacts are indexed; a verified
compressed archive preserves 472 JSON observations, including raw synthetic values and controller
needle/factor manifests outside the tested app/service domain.

Next is packaged UI/service-worker/export and synthetic migration/clear residue evidence using this
instrument; physical containers and supported-platform custody remain later gates. Fragmented markers,
arbitrary transformations and unknown key material cannot be qualified by this negative scan. No full
Vitest, aggregate crypto/vector execution or unrelated native campaign was rerun for this harness-only
phase. All 21 personal package files, 31 vectors, historical review and L-2 are preserved. No personal
browser/profile/recovery, server, real Account, factor, operator key, pin, origin or routing changed.
Unrelated root files remain untouched. Appended before replacing only L-1.


## 2026-09-12 — Same-source implementation review addenda reconciled (L-1 seat)

R1 neutral logical-carrier residue evidence was committed signed as `27e5b6f`; its signature verifies
`G`. The 144 calibration cells, 26 directed checkpoints and 24 generated histories retain the scope
and source pins recorded in that commit. No implementation repair follows in this intake.

The user requested assessment of the two root packets, with a brief `resposnse` block for each finding,
followed by organization into the current implementation review set. The annotated
[N packet](./review/implementation/96a2040-1ceb88d.md) and
[P packet](./review/implementation/1ceb88d-393ef43.md) now live beside the original F packet.
There are 67 response blocks covering 47 distinct leaf IDs: nine N and seven P findings plus the
prior F status rows. Every original addendum byte is recoverable by removing marked additions;
the original F archive remains unchanged. The [intake record](./review/implementation/addenda-2026-09-12.json)
pins original/annotated packets, the assessment revision and 80 referenced evidence files.

The [shared findings index](./review/implementation/findings.md) preserves F/N/P IDs and routes nine
extensions into existing work items. F-21 remains an umbrella, not an extra finding. This implementation
review namespace remains separate from the original Stage 0 work-item/debt registry. Later F-03/F-04,
F-05/F-06, F-11/F-12, F-15 and F-21.1/2/3/6/7 outcomes are credited within their recorded limits;
F-21.4 remains partial after R1. N-05's hash derivation is already pinned; N-07 is already registered.

F-07/N-01/N-02/P-01 now has high Account-liveness priority, with N-03/P-02/P-03 as related task and
scheduler work. Static code establishes repeated full-history verification/replay and expiry-to-halt;
the reported timings and exact thresholds were not rerun. Polling schedules after completion and is
single-flight, so the claimed inevitable infinite idle queue is overstated. The proposed witness-only
cache omits content/source coverage inputs and does not remove new-event growth. The next bounded
phase should measure and specify safe invalidation/expiry behavior before optimizing it. This moves
ahead of the remaining packaged/export/migration residue extension without discarding that work.

F-10/N-08/P-07 remains actionable diagnostics work without a shown activation bypass; F-20/N-06/P-05
retains load/aggregate orchestration work despite the later passing crypto aggregate. P-06 is unswept
duplicate phase prose, not reopening the original F-05 closure. F-08/N-04 and N-09 remain on retained
v8 surfaces, while v9 has the relevant empty-source/halt-priority guards. P-04's navigation concern is
addressed by the index's existing-history crosswalk: seven tree pairs and signed-replacement ancestry
were checked; historical IDs/receipts and the local backup ref remain intact, with no push or tag.

This was static repository and existing-artifact assessment, not new test execution, benchmarking,
exploit validation or a whole-repository review. No production code, tests, formats, keys, counters,
formal debts, personal files, server, Account, factor, origin or routing changed. New review documents
remain unstaged/uncommitted. The unrelated root `done ` remains untouched. Appended before replacing
only L-1 below; L-2 remains unchanged.


## 2026-09-12 — Account sync-liveness measurements and repair contract (L-1 seat)

The prior review intake is signed `1372c39`. The user explicitly retired intermediate Account v8
product paths: no customer or personal dogfood data ever used them. F-08/N-04 and N-09 need no further
product hardening. Internal preparation dependencies remain temporarily; shared v9 obligations remain.
The decision journal and current index record this without rewriting historical responses.

Added the [measurement protocol and first repair boundary](./account-sync-liveness.md), disposable
Account/browser/service probes, held-fetch and expiry controls, and generated full-verifier coverage
histories. The [assessment](./review/implementation/account-sync-liveness.md) and
[raw archive](./account-conformance-runs/2026-09-12-account-liveness/README.md) retain final and preliminary
evidence. This phase changes no production sync code and claims no performance repair or release capacity.

The corrected `node scripts/account-liveness/run.mjs` campaign (also `pnpm account:liveness`) passes
all seven stages, six top-level tests including 40 seeded coverage histories, and 883 source checks.
It grows a genuine private v9 creating-member owner through 24 input jobs, including three deletions
and an 8,400-byte paste; actual source/accepted/received positions grow from three to 35. Expected text
survives cold opens in ordinary and instrumented bundles. Median three-call status sets grow from
91 to 1,388 ms on this host, invoking five full inbound verifications and 15 to 175 coverage rebuilds.
One ordinary idle read invokes eight inbound verifications; no inevitable queued-poll growth is claimed.

A held genuine response blocks durable flush while an edit is acknowledged. A final-commit-only clock
shift makes a genuine receive page halt at position four; fresh unshifted retry reaches five, and cold
reopen preserves writing. The event witness still verifies when required content is removed; the full
coverage verifier rejects it. Generated reordered/duplicate/deletion/snapshot cases and a faulty
witness-only cache expose this missing-input problem, including an invisible pending original.

Raw inspection of the preliminary passing campaign found two reads inside nominal one-poll windows.
The corrected boundary explicitly awaits setup's working-to-idle transition and asserts one measured
service read. Preliminary and earlier unfrozen pilot data remain labelled; no observations were silently
discarded. Stage watchdogs preserve raw logs, and every admitted job now saves partial progress.
The separate installed Yjs source/ESM/CJS, lock/workspace patch, peer-resolution and runtime check passes.
No full `pnpm check`, independent security audit, physical-residue or platform qualification is claimed.

Next implement the owner-scoped verified view for exactly unchanged retained storage; full cold/change
verification and complete mutation/ownership/buffer-erasure controls remain mandatory. Incremental
append/coverage verification, owned fetch separation, classified expiry retry and scheduling follow.
F-07/N-01/N-02/P-01 and N-03 stay open for repair; P-02/P-03 retain their bounded design scope. Wider
residue, Account, platform and release work remains. All 21 personal package files, 31 prior vectors,
historical review packets and L-2 remain unchanged. Personal servers remain stopped; no personal
browser/profile, Account, factor, operator key, pin or routing changed. New work is unstaged/uncommitted;
unrelated root `done ` is untouched. Appended before replacing only L-1.


## 2026-09-12 — Sync-liveness unchanged-view repair (L-1)

Committed measurement/preparation unsigned as `0e07fe4` (including four generated evidence files under
the ignored coverage directory). Reactivated the existing signing reminder for unsigned descendants of
`1372c39`, excluding the already-signed old C–D6 chain. The user authorizes continued bounded unsigned
commits until the sync-liveness tasks are complete.

Completed the first [repair boundary](./account-sync-liveness-repairs.md): v9-only complete ciphertext
view matching and detached verified inbound/delivery results, preserving cold/change/full validation,
metadata, allocation, current-owner and projection checks. No format bytes changed. Full unit suite:
995 tests pass. The [source-pinned campaign](./account-conformance-runs/2026-09-12-account-liveness-view/README.md)
passes all eight stages, with native tampering/compaction/reopen and 40 coverage plus 60 invalidation
histories. Growth took about 128 seconds on this host; unchanged status views perform no full inbound
verification. Next is incremental event verification and reusable content coverage, before network and
scheduler boundaries. No personal package/browser/server/Account or L-2 changes. Appended before L-1 update.


## 2026-09-12 — L-1 sync-liveness: incremental event verification and coverage

Following unsigned `280221e`, implemented private v9 exact-row decryption reuse, owner-local crypto
memoization with context/predecessor binding, semantic replay on changed views, and one coverage
reconstruction per exact content set. Full-oracle differential/native tamper/compaction/reopen and
generated source/coverage mutation checks pass in the eight-stage
[incremental campaign](./account-conformance-runs/2026-09-12-account-liveness-incremental/README.md).
The unchanged 24-job run took 59,263 ms, descriptively versus 128,091 ms after phase 1. Protocol formats
and personal package files remain unchanged. This closes boundary 2; owned network separation and
expiry retry follow under the user's authorization for unsigned phase commits through liveness completion.


## 2026-09-12 — L-1 sync-liveness: owned HTTP and classified expiry

Following unsigned `879ce38`, separated private v9 HTTP wait from serialized carrier work while retaining
the same tracked writer lifetime. Ordered reentry rechecks authority and exact retained request or
submission. Actual expiry is refused at the native write guard and enters automatic bounded fresh
retry; other failures retain diagnostics. The [nine-stage campaign](./account-conformance-runs/2026-09-12-account-liveness-network/README.md),
21 native ownership/mutation cases and full 996-test unit suite pass. Local flush finishes during held
read/submission responses; close/stream drain retain the permit and invalid/superseded answers do not
advance progress. Remaining liveness work is P-02/P-03 scheduling and service verification costs.


## 2026-09-12 — L-1 sync-liveness sequence complete: scheduler and service reuse

Following unsigned `902d352`, durable send progress now expedites idle receive without bypassing backoff
or halts; only successful local outgoing admissions wake send. The service core reuses exact event
crypto under fresh authority and predecessor binding while retaining every SQL/semantic/witness/commit
check, with bounded cache ownership. The [combined campaign](./account-conformance-runs/2026-09-12-account-liveness-complete/README.md)
passes all 12 stages and all 890 source pins. The full unit suite passes 999 tests in 91 files.
Native bursts show send wakes exactly equal local admissions. Service restart, corruption, process death,
concurrent writers, 80 decision and 60 inbound generated histories, coverage and lifecycle controls pass.
The 24-job run takes 60,606 ms versus the initial 256,010 ms; terminal status-set median is 87.9 ms versus
1,388 ms. One-host descriptive evidence closes F-07/N-01/N-02/P-01, N-03 and P-02/P-03 only within this
private v9 composition, not general history capacity, proof pruning or release qualification.

All 21 personal package files, 31 prior vectors, historical review packets and L-2 are unchanged;
personal services remain stopped. The signing reminder is active for all unsigned descendants of signed
`1372c39`; the older C–D6 chain is already signed. This completes the user's authorized automatic
unsigned-commit liveness sequence. Next work is F-21.4's retained privacy-evidence extension.


## 2026-09-12 — L-1 bounded privacy extension after sync liveness

The [extended campaign](./account-conformance-runs/2026-09-12-privacy-extended/README.md) passes nine
stages, 23 Node cases, 60 generated container histories, 24 R1 histories and 899 source pins.
Packaged UI/worker/ZIP/offline restart, synthetic migration/import restart/source cleanup/Local clear
and observable profile/service DB/WAL bytes are covered. Generated testing found an overly broad ZIP
signature detector; its exact counterexample and fixed replay are preserved. Logical source cleanup
passes, while raw closed-profile LevelDB still contains legacy plaintext after deletion. F-21.4 remains
partial for wider platform/opener/opaque-format/fragmentation evidence. No production code changed.
All 21 personal package files, 31 prior vectors and L-2 remain unchanged; personal services stay stopped.
The user authorizes continued unsigned phases through failure/recovery and storage/responsiveness.
Appended before replacing L-1.


## 2026-09-12 — L-1 bounded diagnostics and admission refusals

Following unsigned privacy `67304f3`, F-10/N-08/P-07 are closed for the private composition by typed
unsigned hints, closed bounded parsing and memory-only redacted operation/phase/code diagnostics.
All three promotion refusal stages preserve progress and retry to a verified receipt. Unknown results
still grant no decision/finality authority. The [ten-stage campaign](./account-conformance-runs/2026-09-12-failure-diagnostics/README.md)
passes the full 1,003-test unit suite, 72 Node cases, generated activation/delivery/inbound and 150
malformed-hint cases, with source pins verified. F-09 read-only recovery follows. Personal files,
prior vectors, archived reviews and L-2 remain unchanged. Appended before advancing L-1.

## 2026-09-12 — L-1 authenticated read-only partial Local recovery

Following diagnostics `8ebccfd`, F-09 now offers a current-format Local salvage ZIP from refused startup,
requiring authenticated claim/custody and preserving journal-inclusive original carriers. Every result
is partial; no repair/reset/nonce allocation occurs. The [eight-stage campaign](./account-conformance-runs/2026-09-12-local-recovery/README.md)
passes 1,007 units, 30 generated histories, packaged UI export/cancellation, custody/trim controls and
packaged migration/privacy regressions; 909 source pins agree. Account/custody-loss/unsupported-schema
recovery remains outside this boundary. Appended before advancing L-1 to storage/responsiveness.

## 2026-09-12 — L-1 owned automatic content maintenance

Following Local recovery `01b3036`, F-16's missing scheduler is repaired behind durable idle admission.
Existing exact-coverage guards, pending originals, Account proof history and close/drain semantics remain.
The [nine-stage campaign](./account-conformance-runs/2026-09-12-content-maintenance/README.md) passes
1,011 units, 24 generated flush/idle schedules, 35 native cases and the trim controls. Real packaged
editing reduces 140 updates to one state and cold-replays exact writing. An incomplete grouped-deadline
attempt and test-double typecheck failure are retained. Separate Account stages pass with their existing
deadlines. No hard storage bound or ledger pruning is claimed. Appended before advancing L-1.

## 2026-09-12 — L-1 equivalent projection fast path and archive memo

Following automatic maintenance `70e6d5b`, F-17 now avoids normalization when full integrated bytes
are already identical, retaining every SV/DS/pending/content/publication guard and the full fallback.
Derived archive caching is bounded, exact-text invalidated, detached and owner-cleared. The
[eleven-stage campaign](./account-conformance-runs/2026-09-12-editor-projection/README.md) passes 1,015
units, 150 differential and 100 archive generated histories, existing 500 fork cases, 100 native pending
and 100 native delivery histories plus guard-removal controls. On one host at 100k items, comparison
median improves 97.4 → 23.8 ms and controlled command acceptance 190.2 → 121.2 ms. Large-history and
supported-device responsiveness remain qualification work. Appended before advancing L-1 to F-19.

## 2026-09-12 — L-1 retained marker resource repair and bounded sequence checkpoint

Following projection `063cd72`, F-19 stores a single genesis candidate through a versioned retained
reference while preserving original logical signed/MACed bytes and all current-state checks. Direct
byte comparison removes expanded hex/string-array allocation. The [fourteen-stage campaign](./account-conformance-runs/2026-09-12-retained-marker/README.md)
passes 1,015 units, 64 Node cases, 150 new generated histories and independent existing protocol,
parser, long-admission, refusal, sync and privacy controls, with 917 unchanged source pins. A synthetic
1 MiB checkpoint's median comparison is 684.6 → 46.4 ms and retained JSON is approximately halved.
The generator's invalid-domain counterexample is retained; no product bound was relaxed.

This closes the authorized bounded sequence from privacy through failure/recovery and storage/
responsiveness. F-21.4 platform/opener/opaque evidence, Account/key-loss recovery, F-17 device/large-history
responsiveness and F-19 full admission capacity remain explicitly partial. F-16's scheduler does not
prune proof history or bound all disk growth. [Release-validation prep](./private-release-validation-prep.md)
is next: F-20/N-06/P-05 aggregate coverage/reliability and P-06 prose, then private Account cutover and
second-device adoption/enrollment. Personal packages (21 files), prior vectors (31), historical reviews
and L-2 are unchanged. The unsigned-signing reminder remains active. Appended before replacing L-1.

## 2026-09-12 — L-1 Q review intake at 9ff48b5

Assessed and archived the same source's [393ef43..9ff48b5 addendum](./review/implementation/393ef43-9ff48b5.md)
with 38 `resposnse` blocks: all 30 prior status IDs and eight new Q findings. Original prose is
recoverable byte-for-byte; the prior F/N/P packets and intake manifest are unchanged. The
[shared index](./review/implementation/findings.md) now covers 55 leaf IDs and routes Q-02/Q-03 to
F-07, Q-01/Q-04 into validation prerequisites, and Q-05–Q-08 to distinct follow-ups.

Read-only registry execution confirms 158→165 sources and eight changed sites. An in-memory probe of
the actual service cache reproduces all 15 request-size/row-count eviction results; its exact source
and output are retained in the [intake record](./review/implementation/addendum-393ef43-9ff48b5.json).
Static inspection confirms the three stale controls and receive-expiry reason collapse. Git/raw-file
inventory confirms archive growth and personal path presence. Browser timings, native failures and
the full aggregate were not rerun. No runtime vulnerability is inferred from red validation alone.

F-07 is partial: earlier reductions stand, but practical carrier-load/copy and cache-size costs need
further repair. Proposed removal of publication checks and count-only expiry halts are not accepted
without their missing ownership/recovery contracts. Corrected current-facing committed/uncommitted
statements (Q-07) and documented the authorized eleven-commit unsigned boundary (Q-06), preserving
historical receipts. No production/harness code, source pins, cryptographic bytes, personal instance,
service or Git history was changed. The intake is left uncommitted. Appended before updating L-1;
L-2 remains unchanged. Implementation work is not started by this review intake.

## 2026-09-12 — L-1 restored construction inventory and live omission controls

Committed the Q intake unsigned as `409fbd0`, then repaired Q-01/Q-04. Reviewed seven new and twenty
changed runtime sources; domain labels/site paths/kinds are unchanged, eight site line positions are
updated, and four unlabelled verification/recovery entrypoints are explicit. The source census and
authority gate match current code. No production code or cryptographic bytes changed.

The [13-stage campaign](./account-conformance-runs/2026-09-12-validation-controls/README.md) passes on
936 unchanged source pins: all corrected controls, 18 registry/origin tests, the full content/receive/
receive-transport suites, and shared preflight execution inside liveness, residue and private failure
phases. The last includes all 1,015 unit tests. Content has 13 passing cases and five detected mutants;
receive covers 12 native generated histories and transport covers 16. Source hashes, outcomes and
unsuccessful attempts are retained in a bounded archive with declared workspace-path normalization.

The first repair attempt disproved the review's reuse-only fix: startup also calls full coverage.
Each guard now independently refuses the missing-content history; only their joint omission admits
it. HTTP and content mutations target their actual guards and give precise anchor errors. The origin
gate accepts a selected disposable build, preserving the personal offline package. Current origin,
authority, retention, selection, update-limit, WASM, debt and trace checks pass; final receipt refresh
follows checkpoint edits. This is not the full contract/crypto or release aggregate.

Q-01/Q-04 are complete within scope. Next is Q-03, then Q-02 and Q-05, before complete release
qualification. Personal packages, vectors, historical packets and L-2 remain unchanged. The review
commit and earlier chain remain intentionally unsigned; this phase's changes are left uncommitted.
Appended before updating L-1.

## 2026-09-12 — Q-03 compact authenticated service-cache context (`L-1`)

After unsigned validation-control repair `dceec5c`, removed full promotion JSON from every service
ledger cache entry's context. Freshly authenticated `auth.scope.request` already binds the complete
request; full authority, generation, predecessor, exact row bytes, witness and commit checks remain.
[Evidence](./account-conformance-runs/2026-09-12-q03/README.md) records the original 1 MiB failure
(118 warm/cold verifies), then 13 warm versus 118 cold at both 64 KiB and 1 MiB checkpoints with 35
4 KiB-body rows. Four cache tests, 31 current service-delivery tests including 80 generated histories,
19 service-inbound tests, types, scoped lint/format and refreshed authority inventory pass. Retained
failed attempts include a retired v8 native fixture blocked by sandbox localhost access and final
census formatting corrected separately. Q-03 closes this cache context defect, not cache capacity,
full-history costs or full release qualification. Q-02 follows. Personal artifacts and L-2 preserved.

## 2026-09-12 — Q-02 carrier work and retained workload (`L-1`)

After unsigned Q-03 `2dcd897`, reproduced the ordinary 80-edit/30-burst workload: thirty positions,
112.7 seconds to drain, then 36 full loads for one instrumented edit. Bulk transactional row/key reads,
selected verified-result copies and two duplicate-view reductions preserve current checks. The same
[workload and regressions](./account-conformance-runs/2026-09-12-q02-carrier/README.md) pass; burst now
90.1 seconds and still thirty positions, subsequent single edit 31 loads / 3.97 seconds. All eight
stages pass, including 1,016 unit tests, complete content controls and 23 native ownership/tampering/
held-network/abort tests. Cold replay matches. This closes the carrier subphase, not Q-02: bounded
same-actor original-source batching follows. Full history/capacity and release qualification remain.

## 2026-09-13 — Q-02 bounded original-source batching (`L-1`)

After unsigned carrier reduction `77a2753`, added the explicitly specified/pinned private v9
`position-batch` allocation: 2–32 same-actor originals, at most 64 KiB, exact capsule/index/hash order
and separate original envelope updates. Persisted allocations freeze membership; fresh grants and
exact envelope retry retain their boundaries. [Evidence](./account-conformance-runs/2026-09-12-q02-batch/README.md)
passes 1,018 units, 34 parser tests and the updated 18-stage liveness campaign, including 120 generated
batch histories, semantic omission controls, six commit/renderer-death cases and lost-reply/later-edit
separation. The original thirty-edit burst drains in 9.70 seconds / three positions versus 112.66 /
thirty before Q-02. Cold writing/source coverage match. Individual edit cost remains linear in history
(2.72–2.87 seconds near eighty positions); local admission loop remains 6.14 seconds. Capacity and
responsiveness qualification remain explicit. Prior vectors, historical ledger sections and L-2 preserved.


## 2026-09-13 — Q-05 observable receive expiry and automatic recovery (`L-1`)

After unsigned Q-02 batching `7cbb063`, both receive schedulers retain `request-expired` separately
from evidence halts, with capped fresh-request backoff. The receive owner emits closed verify/commit
expiry observations into the existing 32-event non-persisted diagnostic buffer. Pressure still
controls readiness, and durable progress/conflict remain authoritative.

The [four-stage follow-up and 18-stage combined liveness evidence](./account-conformance-runs/2026-09-12-q05/README.md)
passes with unchanged pins: all 1,022 unit tests, 160 generated expiry schedules, 100 diagnostic
histories and three consecutive native commit expiries followed by automatic fresh recovery. Five
distinct requests, exact bounded diagnostics, no expiry-time prefix advance and exact cold writing
are observed. Current Q-03 cache, Q-02 batch, ownership/crash/tamper and growth cases pass again.

Q-03 and Q-05 are repaired; Q-02's bounded carrier/burst repair is complete, with full-history capacity
and responsiveness limits explicit under F-07/F-17/F-19. The next package is F-20/N-06/P-05 graph,
coverage/deadline work and P-06 prose before an immutable release aggregate. No full release, Account
cutover or public qualification is claimed. Personal files, prior vectors, historical packets/debts
and L-2 remain unchanged. All intermediate commits are authorized unsigned and the existing reminder
tracks their chain. Appended before replacing L-1.


## 2026-09-13 — Release-validation family inventory, phase 1 (`L-1`)

Added the [checked validation inventory](./release-validation-graph.md) at `d03e473` plus this phase's
changes: 122 package scripts, 78 campaign entrypoints, 261 test files (255 required and six retired
standalone v8 product exclusions), 12 catalogues, 29 current vector corpora and 83 registered
constructions. Direct proposed test coverage is distinguished from current wrapper selection; dynamic
case counts and variants remain execution obligations. Unknown families, package cycles, stale
exclusions, missing generator/test/vector mappings and changed helper inputs refuse the snapshot.

The [bounded six-check evidence](./account-conformance-runs/2026-09-13-validation-inventory/README.md)
passes: inventory, ten checker tests including 160 independent generated DAGs, types, lint, format and
authority. Real file/policy omissions exercise the checker. A separate silent package-manager attempt
was stopped and retained; the exact Node commands pass. No package-manager repair or aggregate is
claimed. Runtime code, personal package files, prior vectors, historical review records/debts and L-2
are unchanged; no personal service, profile, factor or key was used. This phase is left uncommitted.

The concrete next package is the finite execution manifest and shared bounded stage runner. The
inventory exposes later campaigns missing from `check`, 18 full-vector-chain references, new native
batch tests absent from old wrappers, incomplete case-census checks, historical deadline failures,
inherited crypto-audit source-pin omissions and unsafe in-place build defaults. P-06 prose and the
immutable aggregate follow. The obsolete Lima/deployed-old-writer rehearsal is explicitly optional;
private migration remains the product scope. Appended before replacing the L-1 checkpoint.


## 2026-09-13 — Release-validation execution foundation, phase 2a (`L-1`)

Committed the inventory unsigned as `f13bdd1`, preserving review-tracked hashes. Added the
[finite obligation manifest and bounded runner](./release-validation-execution.md): 258 required test
files, 11 catalogues with 163 cases/54 discriminating mutants, 29 vector corpora and 83 registry entries.
Catalogue expansion refuses unsupported syntax without importing campaigns. Exact Node case outcomes,
source/dependency/runtime identity, ordered receipts, artifact verification and process drain govern
reuse. Current crypto-audit inputs replace its incomplete inherited source list.

Real controls exercise missing/skipped cases, stale reports, changed helper/dependency bytes, survived
mutations, timeout/cancellation, TERM-resistant children, zero-exit orphaning, detached attempts and
output floods. A flood exposed a repeated-signal error; stopping is now idempotent and signal/log
failures remain failures. The first five-stage disposable run passed 19 exact cases and two static
checks. The [evidence packet](./account-conformance-runs/2026-09-13-validation-runner/README.md) separates
that intermediate run from the passing eight final gates (32 tests, 480 generated histories) and
the final five-stage, 20-case disposable selection. Thirty repaired flood probes explicitly prove
drain; the injected persistent-uncertainty control still refuses.

This closes the runner foundation, not the complete phase-2 graph: 447 adapter obligations remain
blocked. Next is native content catalogue census/process ownership, then remaining family/wrapper
integration and deadlines before P-06 and an immutable aggregate. No native campaigns, complete vector
chain, release qualification or personal operation are claimed. Existing unsigned hashes remain;
the delivered signing reminder is paused. This work is left uncommitted. Appended before replacing L-1.


## 2026-09-13 — Content catalogue execution adapter, phase 2b (`L-1`)

Committed the runner foundation unsigned as `f14c68f`, preserving the in-flight review's hashes.
Connected the full content catalogue and selected unreadable-load control to the shared disposable
owner. All 13 baselines and five mutations pass their intended oracles. The parent checks exact case
and mutation populations, actual assertion evidence, discriminating baseline/mutant assertions,
source patches/hashes, a fresh nonce and completion. Installed Chromium bundle bytes join identity.
The standalone command retains its options and report files, and a missing report cannot pass.

The owner launches Chromium and separately drains its group and the Vite worker group. Six native
controls cover completion, timeout, cancellation, worker/browser death and startup deadline, with
listener closure and no matching test-profile processes. The first full run exposed Vite's port-zero
fallback to 5173 in its recorded URLs. Direct binding through Vite's initialized HTTP server repairs
it; controls now occupy the configured port and use real Vite, and the repaired full campaign records
OS-assigned ports. No content assertion or production storage code changed.

The [bounded evidence](./account-conformance-runs/2026-09-13-content-adapter/README.md) retains initial
and repaired runs, source/dependency/browser identities and scope limits. The non-native controls
include 160 new generated census/false-detection histories (640 total with prior controls). The
manifest has 596 obligations, 445 blocked; ten other catalogues retain 150 cases/49 mutations. The
next single adapter is journal (17 cases/six mutations), then remaining families and wrapper
postconditions before P-06 and immutable aggregate qualification. No personal browser, profile,
service, build, Account, factor or key was used; earlier vectors, packets/debts and L-2 are preserved.
The content phase remains uncommitted. Appended before replacing L-1.


## 2026-09-13 — Journal catalogue execution adapter, phase 2c (`L-1`)

Committed content unsigned as `b9f0984`, preserving the in-flight review's earlier hashes. Added the
journal catalogue to the owned native runner: 17 baselines with 93 assertions and six mutations pass.
Content and journal share an explicitly limited report reconciler while retaining distinct source,
case, worker, scope and variant identities. Mutation targets require pinned source bytes and an actual
change. The journal command retains default/selected/no-mutant options and report files; unsupported
custom browser overrides explicitly refuse. Existing journal scenarios and production code are unchanged.

The [bounded evidence](./account-conformance-runs/2026-09-13-journal-adapter/README.md) preserves the full
journal campaign, its six-case/four-mutation store-contract selection, baseline-only selection, full
content regression and six native cleanup controls. The full journal worker completes in 74.7 seconds
inside the 120-second deadline (98.2 seconds including preparation/final checks). Four new tests include
160 generated subset/omission histories, bringing non-native runner/control coverage to 39 tests and
800 generated histories. This is adapter assurance, not a larger population of product histories or
whole-platform latency qualification. Account wrapper prerequisites/postconditions remain separate.

The manifest has 597 obligations with 442 unresolved, covering 261 required test files and the same
163 catalogue cases/54 mutants. Nine catalogue adapters remain (133 cases/43 mutants); admission's
15 cases/six mutants are next. Remaining test families, wrapper selections and measured deadlines
precede P-06 and the immutable aggregate. Personal package files, prior vectors, historical review
records/debts and L-2 are preserved; no personal app/profile/service/build, recovery material, Account,
factor or key was used. This journal phase remains uncommitted. Appended before replacing L-1.


## 2026-09-13 — Admission catalogue execution adapter, phase 2d (`L-1`)

Committed journal unsigned as `1a86453`, preserving the in-flight review's earlier hashes. Connected
admission's 15 baseline cases/64 assertions and six mutations to the shared disposable owner. The
adapter explicitly binds the existing `ordered-admission-browser` scope. Two distinct mutations of
`C03.ordered-refusal` must each fail their own previously passing assertion; one detection cannot
stand in for the other. All six mutation anchors match current source uniquely. Existing admission
scenarios, catalogue patches and production code are unchanged.

The [bounded evidence](./account-conformance-runs/2026-09-13-admission-adapter/README.md) retains the
full native run, selected refusal-order case with both mutations, explicit baseline-only selection,
selected content/journal regressions and six native ownership controls. The full worker completes in
58.9 seconds inside its 120-second deadline (81.9 seconds including preparation/final checks). Four
new tests include 160 generated subset/omission histories; the complete runner controls now include
43 non-native tests and 960 generated histories. These are validation-infrastructure controls, not
additional product histories or a supported-device performance claim.

The manifest has 598 obligations with 439 unresolved, covering 262 required test files and the same
163 catalogue cases/54 mutations. Eight catalogue adapters remain (118 cases/37 mutations); the
editor-admission catalogue's 12 cases/three mutations is next. Its source targets and actual editor
assertions require a separate review before extending the adapter. Remaining test families, wrapper
postconditions and deadlines precede P-06 and immutable aggregate validation. Personal package files,
prior vectors, historical reviews/debts and L-2 remain unchanged; no personal app/profile/service/build,
recovery material, Account, factor or key was used. This admission phase remains uncommitted.
Appended before replacing L-1.


## 2026-09-13 — Editor-admission catalogue execution adapter, phase 2e (`L-1`)

Committed admission unsigned as `4fc3af0`, preserving review-tracked hashes. Connected the Goals
CodeMirror catalogue to the shared owner: 12 baselines/61 assertions and three discriminating
mutations pass. Candidate `editor`, report scope and full editor patch paths are bound explicitly.
Two pressure-case mutations require separate editor/history assertion evidence. The source overlay
now includes the shared Account protocol files. Existing scenarios and production code are unchanged.

Native execution exposed runner defects. Report-directory overlays resolved a second CodeMirror copy;
multicaret failed until overlays moved inside the disposable checkout. A native equal-byte module
identity control fails before this repair and passes afterward. JSON also erased the undefined values
in export-refusal assertions. A tagged assertion encoding preserves them distinctly from null, while
retaining the original comparisons. Report rejection exposed an undefined field that prevented failure
receipt serialization; malformed reports now leave complete failed receipts. A browser startup control
observed an invalid endpoint read followed by a valid file. Fragmented-publication controls reproduce
premature refusal; bounded retries now require a complete endpoint and still enforce startup expiry.

The [evidence packet](./account-conformance-runs/2026-09-13-editor-admission-adapter/README.md) retains
initial failures, passing native and selected runs, and all seven native ownership controls. The full
worker took 67.3 seconds within its 120-second deadline. Selected content/journal/admission
regressions pass. Static gates include 51 non-native tests and 1,120 generated validation histories;
these are adapter controls, not extra product histories. Nine disposable infrastructure stages pass
36 exact cases and two static checks. Composition and preparation profiling retain their one-host limits.

The manifest has 599 obligations with 436 unresolved, covering 263 required test files and the same
163 catalogue cases/54 mutations. Seven catalogue adapters remain (106 cases/34 mutations). Next is
workspace-admission's ten cases/four mutations, followed by remaining families/wrapper postconditions
and deadlines before P-06 and immutable aggregate validation. No personal operation occurred; prior
vectors, historical reviews/debts and L-2 are unchanged. This editor-admission phase remains uncommitted.
Appended before replacing L-1.


## 2026-09-13 — Workspace-admission catalogue execution adapter, phase 2f (`L-1`)

Committed editor-admission unsigned as `3f1afc5`, preserving review-tracked hashes. Connected the
workspace catalogue to the shared disposable owner: ten baselines/62 assertions and four mutations
pass. The explicit binding retains candidate `workspace`, scope `workspace-admission-browser` and
full `src/crdt/` patch paths. Each history mutation must change its own pinned source and fail its
specific previously passing assertion. Tagged reports preserve nested undefined initialization
values, null command results, false refusals and zero distinctly. Original scenarios, catalogue
patches and production code are unchanged.

The [bounded evidence](./account-conformance-runs/2026-09-13-workspace-admission-adapter/README.md)
retains the full native run, selected system/remote/nested history run (three cases/three mutations),
baseline-only initialization, selected editor multicaret/pressure regression and seven native ownership
controls. The full worker took 43.1 seconds inside its 120-second deadline; the command took 64.7
seconds including preparation/final checks. Four new adapter tests include 160 generated selections,
bringing non-native runner controls to 55 tests and 1,280 generated validation histories. Ten disposable
infrastructure stages pass 40 cases and two static checks. These are adapter controls and one-host
measurements, not additional product histories or whole-workspace performance qualification.

The manifest has 600 obligations with 433 unresolved, covering 264 required test files and the same
163 catalogue cases/54 mutations. Six catalogue adapters remain (96 cases/30 mutations); owned-startup's
15 cases/three mutations is next. Remaining test families, wrapper postconditions and deadlines precede
P-06 and immutable aggregate validation. No personal operation occurred; prior vectors, historical
reviews/debts and L-2 are unchanged. This workspace-admission phase remains uncommitted.
Appended before replacing L-1.


## 2026-09-13 — Owned-startup catalogue execution adapter, phase 2g (`L-1`)

Committed workspace-admission unsigned as `ddd77a3`, preserving review-tracked hashes. Connected the
retained-workspace startup catalogue to the shared disposable owner: 15 baselines/96 assertions and
three mutations pass. The explicit binding retains candidate `startup`, scope `owned-startup-browser`
and full source paths. Probe side effects, orphan classification and reclassification after permit grant
each require their own changed source bytes and specific failing assertion. Tagged evidence preserves
zero mounted editors/channels and undefined writing/export values in refused or pending opens.
Original scenarios, catalogue patches and production code are unchanged.

The [bounded evidence](./account-conformance-runs/2026-09-13-owned-startup-adapter/README.md) retains the
full native run, selected classification cases and all three mutations, baseline-only replay/cancel/
renderer-restart cases, the nested workspace-history regression and seven native ownership controls.
The full stage took 41.6 seconds inside its 120-second deadline; the command took 62.9 seconds including
preparation/final checks. Four new tests include 160 generated startup selections, bringing non-native
runner controls to 59 tests and 1,440 generated validation histories. Eleven disposable infrastructure
stages pass 44 cases and two static checks. These are adapter controls and one-host observations, not
additional product histories or complete startup/platform qualification.

The manifest has 601 obligations with 430 unresolved, covering 265 required test files and the same
163 catalogue cases/54 mutations. Five catalogue adapters remain (81 cases/27 mutations); Local genesis
with 17 cases/four mutations is next. Remaining test families, wrapper postconditions and deadlines
precede P-06 and immutable aggregate validation. No personal operation occurred; prior vectors,
historical reviews/debts and L-2 are unchanged. This owned-startup phase remains uncommitted.
Appended before replacing L-1.


## 2026-09-13 — Local-genesis catalogue execution adapter, phase 2h (`L-1`)

Committed owned-startup unsigned as `6348b6c`, preserving review-tracked hashes. Connected Local genesis
to the shared disposable owner: 17 baselines/160 assertions and four mutations pass. Candidate `genesis`,
scope `local-genesis-browser` and full source paths are explicit bindings. The nine generated crash
cases retain a separately reviewed case-to-commit-boundary map; omitted, substituted or relabeled
boundaries refuse. Confirmation, missing completed state, progress authentication and legacy index
mutation controls each require their own changed bytes and specific failing assertion.

The first native run exposed an evidence-encoder gap: the retained initial custody record contains
Uint8Array values. The plain-value encoder refused during the creator race after reporting only the
first case. The new byte-array tag preserves type and contents through JSON. A focused probe fails
before and passes after the repair; 160 generated nested claims compare encoded equality against native
equality, including byte changes, subarray offsets and array/object substitutions. Unsupported typed
views and decorated byte arrays still refuse. No product record, scenario assertion or catalogue patch
changed. The old custom-browser advice in the genesis guide now matches the pinned runner.

The [bounded evidence](./account-conformance-runs/2026-09-13-local-genesis-adapter/README.md) preserves the
failed run and passing full run, the seven-case/two-mutation Account provenance selection, baseline-only
counter crash, selected startup reclassification/replay and seven native ownership controls. The full
stage took 73.8 seconds inside its 120-second deadline; the command took 95.2 seconds including
preparation/final checks. Five new tests bring non-native runner controls to 64 tests and 1,760 generated
validation histories. Twelve infrastructure stages pass 49 cases and two static checks. These are
adapter controls and one-host observations, not additional product histories or platform qualification.

The manifest has 602 obligations with 427 unresolved, covering 266 required test files and the same
163 catalogue cases/54 mutations. Four catalogue adapters remain (64 cases/23 mutations); Local clear's
17 cases/five mutations is next. The Account provenance wrapper retains its other prerequisites and
postconditions. Remaining test families, wrappers and deadlines precede P-06 and immutable aggregate
validation. No personal operation occurred; prior vectors, historical reviews/debts and L-2 are unchanged.
This Local-genesis phase remains uncommitted. Appended before replacing L-1.


## 2026-09-13 — Local-clear catalogue adapter, phase 2i (`L-1`)

Committed Local genesis unsigned as `be5d6a0`.

The Local-clear catalogue now uses the shared disposable owner. All **17 baseline cases, 172
assertions and five intended mutations** pass. Seven generated crash cases have independently reviewed
case-to-boundary bindings: intent, content deletion, journal stage, custody stage, index stage, index
deletion and terminal clearing. A missing or substituted boundary refuses credit. Original scenarios,
fixture hooks and production code are unchanged.

The cases retain real blocked IndexedDB deletion, partial/refused journal removal, native transaction
aborts, renderer death, factor-authenticated keyless resumption, low-level key-access guards, writer
exclusion, target rechecks and cancellation while deletion remains pending. The mutations independently
exercise blocked-as-success, journal-before-content, retained genesis opener, skipped resume
verification and bypassed component guard. Each must change its pinned source and fail its specific
previously passing assertion. Tagged evidence preserves nested inventories and unavailable error values.

The [evidence packet](./account-conformance-runs/2026-09-13-local-clear-adapter/README.md) retains the full
campaign, selected blocked/ordering/factor/guard controls, baseline-only index-stage restart, selected
Local-genesis regression and seven native ownership controls. The full stage took **53.7 seconds**
within its existing 120-second deadline. Selected runs and native ownership checks may overlap;
these are host observations, not performance qualification. Four new tests include 160 generated
selection/evidence faults (seed 130912), bringing non-native controls to 68 and generated validation
histories to 1,920. Thirteen infrastructure stages pass 53 exact cases and two static checks.

Default catalogue, exact package leaf and campaign alias resolve. Standalone case/no-mutant/output
options and JSON/Markdown reports remain; custom browser overrides and existing output directories
refuse. Account removal, service revocation, multi-workspace custody, partial genesis cleanup, default
application cutover, physical power loss and forensic erasure remain outside this catalogue.

The manifest has 603 obligations, 424 unresolved and 267 required test files. Three catalogue
adapters remain (47 cases/18 mutations): content trim, custody and write-session. No personal
operation occurred; historical reviews, formal debts, prior vectors and L-2 are preserved. Appended
before replacing L-1; this adapter is ready for its unsigned commit.


## 2026-09-13 — Content-trim catalogue adapter, phase 2j (`L-1`)

Committed Local clear unsigned as `f1926f9`.

The content-trim catalogue passes **21 baseline cases, 128 assertions and eight mutations** through
the shared disposable owner. Scope `content-trim-browser`, candidate `trim` and `src/crdt/` patch paths
are explicit. Original production code, fixture hooks, scenario assertions and mutations are unchanged.
Exact source coverage, tagged assertion evidence, case selection, source faults and server closure are
checked independently of the campaign success labels.

The cases retain disk-union semantics, late reserved sequence commits, concurrent compactors,
unresolved Yjs structs/deletions, changed or unreadable records, replacement damage, native aborts,
renderer crashes after reservation/publication/deletion, crypto drain, generation changes and journal
checks before publication, after publication and inside the deleting transaction. The range-delete
mutation must lose the late record; the incomplete-merge mutation must violate struct retention.
The two journal mutations have different source sites and case identities despite sharing an assertion
name; neither can satisfy the other. Every mutation needs its own changed bytes and specific failure.

The [evidence packet](./account-conformance-runs/2026-09-13-content-trim-adapter/README.md) retains the full
run, four selected late/dependency/journal cases with four mutations, baseline-only publication crash,
Local-clear journal/cancellation regression and final gates. The full stage took **60.3 seconds**
inside 120 seconds. Startup, drain, log and report bounds remain unchanged. Four new tests include 160
generated selection/evidence faults (seed 130913). All 72 non-native runner tests pass, totaling 2,080
generated validation histories. Fourteen infrastructure stages pass 57 exact cases and two static
checks. Existing native ownership controls are unchanged; their seven passing results remain in the
preceding Local-clear packet. Timings are one-host observations, not workload qualification.

Standalone options and JSON/Markdown reports remain; custom Chromium and existing outputs refuse.
Default catalogue, exact package leaf and campaign alias resolve. Generation retirement, Account
admission, day archival, default maintenance scheduling, power loss and platform capacity remain
outside this component evidence. Enclosing wrapper postconditions remain separate obligations.

The manifest has 604 obligations, 421 unresolved and 268 required test files. Custody and write-session
remain (26 cases/ten mutations). Appended before replacing L-1; ready for an unsigned phase commit.


## 2026-09-13 — Custody catalogue adapter, phase 2k (`L-1`)

Committed compaction unsigned as `d65bda0`.

The custody catalogue passes **13 baseline cases, 73 assertions and five mutations** through the
shared owner. Candidate `custody`, scope `custody-component-browser` and short `src/crdt/` patch paths
are explicit. Original confirmation, creator race, native abort, interrupted creation, metadata,
partial/missing/legacy custody, authority, ceiling, lifetime and cancellation assertions remain unchanged.

The copied-profile case requires four distinct persistent browsers: ordinary source/copy and planted
opener source/copy. Each additional browser inherits the worker process group; the existing detached-
child guard stays enabled. Context close now sends `Browser.close`, waits for clean process exit and
checks singleton-lock removal before a source can be copied. Whole-directory digests must match before
launching the copy. Only the stale DevTools endpoint file is removed after that comparison. The parent
checks names, worker identity, pinned executable, owned paths, closure, copy bindings and all eight
attack/factor/positive-control assertions. Copies retain the original read/decrypt-only scenario.

Four native ownership controls verify cold-copy persistence, live-copy refusal, timeout, cancellation
and worker death, with absent profile processes and refused CDP listeners after drain. Their first run
found browser discovery under the isolated HOME; the parent now supplies its already pinned executable
explicitly. Initial failed controls and passing rerun are retained. The seven existing Chromium controls
also pass. No guard was disabled and no deadline or product oracle was weakened.

The [evidence packet](./account-conformance-runs/2026-09-13-custody-adapter/README.md) retains full and
selected runs, standalone profile-only baseline, compaction completion/drain regression and final
gates. The full stage took **43.4 seconds** inside 120 seconds. Five new adapter tests include 160
generated selections/evidence faults (seed 130914), bringing non-native controls to 77 and generated
histories to 2,240. Fifteen infrastructure stages pass 62 exact cases and two static checks. Eleven
native controls run separately; the native test files remain unresolved as nested aggregate stages.

Default catalogue, exact package leaf and campaign alias resolve. Standalone options and reports remain;
custom browsers/existing outputs refuse. These are synthetic profiles on one macOS/Chromium host with
mock keychain/basic password store. No personal profile, writable cloned store history, native-keychain
qualification, complete attacker proof, PRF ceremony or Account authority is claimed. Production code,
fixture probes and scenario assertions are unchanged.

The manifest has 606 obligations, 419 unresolved and 270 required test files. Write-session is the
last catalogue adapter (13 cases/five mutations). Appended before replacing L-1; ready for an
unsigned commit. Prior hashes, historical reviews/debts, personal files, vectors and L-2 are preserved.


## 2026-09-13 — Write-session catalogue adapter, phase 2l (`L-1`)

Committed custody unsigned as `2c5f4b9`.

The final catalogue adapter passes **13 baseline cases, 56 assertions and five mutations** through
the shared owner. Scope `C04-component-browser` and candidate `write-session` are explicit. The old
catalogue omits patch filenames because every fault targets `src/crdt/writeSession.ts`; only this
reviewed binding supplies that default. A conflicting path refuses, while other catalogues still
require their own file. The original path/hash fields remain and the worker now overlays/pins the
complete runtime source population. Every reported case also needs its empty unexpected-page-error
postcondition; a success label cannot hide browser errors.

The first full run passed twelve cases and detected all five mutations but timed out in navigation.
The old document had already been restored with a closed session; the test awaited a fresh load event
that a BFCache restore need not emit. `goBack` now waits for navigation commit, followed by the original
page-readiness and capability assertions. The eight-second timeout and all safety assertions remain.
The focused repair and full rerun observed the restored document, refused its saved callback and
released its old permit. This is one-host restoration evidence, not universal BFCache qualification.

The [evidence packet](./account-conformance-runs/2026-09-13-write-session-adapter/README.md) retains both
full attempts, focused navigation, selected freeze/drain/detached/stale cases with all five mutations,
baseline-only dedicated-worker lifetime, custody lifetime/cancellation regression and final gates.
The passing full stage took **33.3 seconds** within 120 seconds. Four new tests include 160 generated
selections/evidence faults (seed 130915), bringing non-native runner tests to 81 and generated histories
to 2,400. Sixteen infrastructure stages pass 66 exact cases and two static checks. The unchanged eleven
native ownership controls retain their passing evidence in the preceding custody packet.

No production lifecycle behavior changed. Real freeze, renderer death, failed-cleanup exclusion,
dedicated-worker termination, cancellation and native work drain remain. Standalone options and reports
remain; custom browsers/existing outputs refuse. Default catalogue, package leaf and campaign alias
resolve. Synthetic cache/write probes do not establish full product transitions, key retirement,
Account authority, hostile-code containment or platform capacity. Wrapper postconditions remain separate.

All eleven current catalogue families now have adapters: 163 cases/54 mutations. This turn also
committed Local genesis `be5d6a0`, Local clear `f1926f9` and compaction `d65bda0` unsigned. The final
manifest has 607 obligations, 416 unresolved: 257 test-file, 96 command and 63 campaign rows. These
are execution-integration obligations, not 416 product defects. General test and wrapper adapters
precede P-06, the vector prerequisite chain and immutable aggregate. Appended before replacing L-1;
ready for the requested unsigned commit. No personal operation or history rewrite occurred.


## 2026-09-13 — R review intake and unsigned-history preparation (L-1)

Assessed the root `9ff48b5..d03e473` packet at `6ba7c22`, thirteen commits later. Archived it at
`docs/review/implementation/9ff48b5-d03e473.md` with 27 `resposnse` blocks (23 prior status IDs and
R-01–R-04), preserving original-byte reconstruction. The shared review set now has 59 leaf IDs and
132 response blocks across four addenda; the original F packet's historical responses remain separate.

R-01 reproduced with synthetic service fixtures and the actual receiver verifier: 614,400-byte input
accepted/served as 614,698 bytes, then refused with `size`; smaller wire fits and 4 MiB service refusal
provide bounds controls. This checks size/framing, not writing import or a full scheduler/reopen flow.
Persistent progress blockage is confirmed in mechanism, not permanent loss of writing. The repair
must align visible wire bounds and sender/receiver semantics, retain terminal causes and specify the
limits of content-blind validation. It precedes a durable Account cutover. No runtime fix was made.

R-02 corrects the current “uncommitted” sentence and labels historical snapshots. R-03 remains open
under N-06/F-20: both focused tests pass, with the unchanged 120-history property taking 2.636 seconds;
this does not refute the loaded-host timeout. R-04 reproduces 83 archive lint errors and 1,170 format
files across Account/storage archives and live sources. It joins general-runner integration with
explicit immutable-evidence exclusions, not evidence reformatting/deletion. Read-only construction
registry passes (78 specified, four inherited, one excluded, zero open); no aggregate was rerun.

Prepared all thirty unsigned descendants after signed `1372c39`, including original trees/metadata,
plus a 126-file tracked-text reference census. The proposed signing sweep retains original objects,
verifies identical-tree replacements and signatures before moving the branch, preserves historical
receipts, migrates three real executable baseline lookups, regenerates affected plans and adds one
signed reconciliation commit. No signer, new commit, backup ref or history mutation was invoked.
The user must explicitly confirm being at the keyboard before signing starts. Intake/preparation
remain uncommitted for that signed reconciliation. Personal files, runtime/tests, historical packets,
formal debts, prior vectors, package output and L-2 remain unchanged.


## 2026-09-13 — Sign the thirty reviewed phase commits and reconcile current references (L-1)

After explicit keyboard confirmation, signed all thirty original commits `0e07fe4..6ba7c22` after
signed base `1372c39`. The verified signed replacement tip is `3e53b4a`; every tree, message byte,
author and committer field is identical to its original, with only signatures and parent IDs changed.
Each replacement has a good configured SSH signature. The original tip remains under
`codex/pre-sign-review-history-2026-09-13`; the earlier C–D6 backup is retained. The branch moved once
with an expected-old-value update, preserving all eleven intake files and the other 103 original refs.

The permanent crosswalk is `docs/account-conformance-runs/2026-09-13-signed-review-history.json`.
Current phase navigation now points to signed counterparts. Original review packet text, intake
manifests, phase scope/source pins, archived outputs, commit messages and append-only prior outcomes
keep their exact original IDs/bytes. Three real executable before-source lookups in the private-release
runner and old-reader ledger fixture use full signed counterpart IDs, with identical source trees.
Arbitrary hash-shaped unit-test labels remain unchanged. The generated graph/manifest were refreshed
by their owning tools; all 607 obligations, 416 unresolved IDs and coverage counts remain unchanged.

Focused validation passes 31 inventory/manifest/stage tests and two actual old-reader/batch-control
tests, with no failure, skip or cancellation. The latter still proves the old format reader refuses
the new allocation and that omitted guards admit forbidden outcomes. Normalized compressed logs,
the exact four-file validation-input patch and bounded control evidence accompany the crosswalk.
This checkpoint includes the R review intake and current workflow reconciliation as a separate signed
commit. Its signature is verified after commit; its own hash is not embedded in its tree.

No immutable release aggregate or production repair is claimed. Personal package hashes, all 31 prior
vectors, historical reviews/evidence, formal debt files and L-2 are preserved. R-02/Q-06's selected
signing chain is closed; R-01 precedes durable Account cutover. General test/wrapper integration still
includes R-03/N-06 deadlines and R-04 style scope, followed by P-06 and immutable release validation.


## 2026-09-13 — R-01 current service/receiver bounds and size diagnostics (L-1)

Starting at signed `4bb0904`, current v2 seals and the owned sender share the receiver's 512 KiB
complete-wire, 255-update and 512 KiB decoded-update bounds. Preflight precedes new positions and
invocations, including resumed unsealed positions. The service rejects new oversized decisions
without issuing an acceptance/refusal or changing its witness, while broad historical codecs,
service census, pagination and exact decision retries remain available.

A fresh candidate review found the historical pending-wire bypass. An unsubmitted old wire now stops
before submission persistence; an existing submission retains exact retry and receives a bounded
terminal size hint. Receive wire/count and HTTP declared/streamed oversize preserve Local and its
cursor and halt automatic polling. Explicit retry supplies no authority to skip or replace writing.
A service-to-real-receiver 256-update counterexample records the remaining malicious-member boundary:
content-blind acceptance cannot prove encrypted semantics. Its trust/recovery disposition is explicit;
Account supersession/restore is not added here.

124 focused unit tests, 38 service/transport tests, 16 planning tests and twelve selected native cases
pass, including actual forbidden-allocation control and historical pending/restart cases. Typecheck,
scoped style, current construction registry and affected vector checks pass. Initial fixture failures,
timeouts and the large-paste responsiveness limitation are retained. Native historical setup needs
measured deadlines; the existing sync native stage now allows 600 seconds. This staged evidence is not
a full wrapper campaign or immutable release aggregate. No runtime implementation commit is made in
this turn. See `docs/review/implementation/service-receiver-bounds.md` and the normalized evidence at
`docs/account-conformance-runs/2026-09-13-r01-bounds/`.

All personal/package/vector preservation hashes and L-2 are unchanged; historical reviews/intakes,
formal debts, root `done ` and signing backups remain untouched. The manifest stays at 607 obligations,
416 unresolved. General test/wrapper integration with R-03/N-06 and R-04 is next; P-06 and the immutable
aggregate follow. Multi-member recovery and large-paste/capacity validation remain open.


## 2026-09-13 — First general validation integration: Vitest property suites (L-1)

R-01 is committed as `5872dc5`; its SSH signature verifies. The first general adapter now resolves
five R-03/N-06 test-file obligations with 62 exact cases and unchanged 515 seeded histories. A finite
AST census handles literal nested suites and scalar tables without importing them. Runtime reports
reconcile exact identities, completion, non-passing outcomes and module errors under the existing
owned process boundary. Missing/zero/skipped/pending cases cannot pass. Whole commands and native
wrappers remain independently blocked.

All five generated properties receive explicit 60-second deadlines inside 180-second single-file
stages, with one fork, bounded output, partial progress, heartbeat and TERM/KILL cleanup. Comparison
of normalized TypeScript ASTs against the signed base proves assertions/seeds/run counts unchanged
apart from those five timeout arguments. The prior deadlines also pass on this host; historical
loaded-host failures are not re-reproduced or dismissed. The final generated cases take 1.1–6.2 seconds;
the complete disposable selection passes in 67.9 seconds including preparation and fingerprints.

All 91 non-native runner/control tests pass, including 2,560 generated control histories. Four actual
Vitest process tests retain nine receipts: success plus required omission, skip, zero-case,
counterexample, inner timeout, outer timeout/child drain, cancellation and detached-child refusals.
The first controls caught lost timeout messages when a placeholder stack hid the actual message;
both now survive. A faulty table-context skip fixture is corrected, with failed evidence retained.
Existing catalogue adapter regressions pass; the eleven browser ownership controls were not rerun.

The manifest now has 609 obligations, 412 unresolved (253 test-file, 96 command, 63 campaign).
Five old rows resolved; two new runner-control files were discovered, one still requiring deliberate
nested-owner aggregate integration. The phase's new work remains uncommitted. Evidence lives at
`docs/account-conformance-runs/2026-09-13-vitest-properties/`; current scope is in
`docs/release-validation-execution.md`. Remaining Vitest/Node/Playwright and exact wrapper integration,
R-04 style gates, P-06 prose and the immutable selected aggregate precede private Account rehearsal.
Personal/package/vector bytes, historical review/evidence, signing backups, formal debts and L-2
remain unchanged. No personal app/server/profile, Account cutover or release qualification occurred.

Final verification for this phase also checks the file argument itself cannot substitute a Vitest
flag. All 62 cases pass again in 56.2 seconds, with the exact final selected runner/test bytes. The
earlier 67.9-second result remains in the packet. Twenty-six affected runner tests pass after this
last check; the prior fifteen process-owner and fifty adapter regressions remain applicable. Final
typecheck, scoped lint/format, authority/registry, inventory and manifest checks pass; full release
selection still correctly refuses unresolved obligations. The evidence packet remains below 120 kB.


## 2026-09-13 — Reviewed ordinary Vitest and Node protocol adapters (L-1)

The preceding property adapter phase is signed and verified as `8acdee4`. This phase adds explicit
reviewed ownership dispositions for 77 Vitest and ten Node protocol files: 810 new cases. Together
with the prior five property files, the disposable `general-tests` selection passes all 92 files /
872 cases in 581.6 seconds including preparation and fingerprints, with confirmed group drain for
every stage. Exact independent case lists, unchanged finite bounds and controlled environments remain.
No product/test body, assertion, seed or test deadline changes. Whole commands retain separate credit.

The Node reporter now preserves wrapped error/counterexample diagnostics and partial completed-case
progress. Actual before/after controls use the signed old reporter and a seeded failing property;
a second control times out a stuck test and verifies both preserved progress and process drain.
All 98 non-native runner/control tests pass, with 2,720 generated control histories. Typecheck,
scoped style, inventory/manifest readback, signature and authority checks pass. No selection or
regression retry was needed. Existing eleven browser ownership controls retain prior evidence.

The manifest now has 610 obligations and 325 unresolved: 166 test-file, 96 command and 63 campaign
rows. The remaining test rows are 14 Vitest, 136 Node and 16 Playwright files. All eleven catalogue
adapters remain resolved (163 cases/54 mutations). At 688,333 bytes the manifest still meets its
700 kB ceiling; further expansion needs a compact representation preserving every obligation and
case identity. Generated registrations, remaining fixture/process review, deliberate nested owners,
exact wrapper postconditions and R-04 full style gates precede P-06 and the immutable aggregate.

The new implementation remains uncommitted. Bounded receipts, Node failure controls, exact source
patch and test-preservation pins live at
`docs/account-conformance-runs/2026-09-13-general-test-adapters/`, within a prospective 250 kB ceiling.
No personal app/server/profile, Account cutover or release qualification occurred. Personal/package
and prior vector bytes, historical reviews/evidence, formal debts, signing backups, root `done ` and
L-2 remain unchanged.


## 2026-09-13 — Generated-registration adapters and compact manifest (L-1)

The preceding general adapter set is signed and verified as `38e4995`. A finite declaration reader
now expands thirteen additional Vitest files (209 cases) and the Account-core Node loop suite
(13 cases). It handles constant data, for-of/tuple bindings, nested suite tables, the reviewed scalar/
object title formats and pinned JSON vector inputs. Planning does not import tests or execute helper
functions. The final disposable general selection passes all 106 files / 1,094 cases in 723.7
seconds, including preparation/fingerprints, with confirmed drain throughout. The previous 872 exact
case identities and all selected product test bodies, titles, assertions, seeds and deadlines remain
unchanged. Whole package/wrapper obligations stay separate.

Actual controls cover generated runtime names, vector-payload drift without title changes, missing
and skipped cases. The runner now refuses registration-data metadata on non-Vitest stages, closing
a reproduced preflight validation gap; unsupported inherited-property predicates also refuse.
All 106 non-native runner/control tests pass, including 2,880 generated control histories. Typecheck,
scoped style, planning, signature and authority checks pass. The eleven existing native ownership
controls retain prior evidence; no browser campaign reran.

The first control run had an arithmetic expectation error, not lost product coverage; exact comparison
with the prior manifest proved preservation of all 872 old identities. The first general run was
intentionally cancelled after fifty passes for the guard repair; its cancellation/drain receipts and
the failing before-control are retained alongside the final run. No deadline increase or reduced test
population turned a failing product case into credit.

The manifest writes one complete obligation per line without changing its parsed schema or values.
It is 552,986 bytes within the existing 700 kB ceiling. There are 611 obligations, 311 unresolved:
152 test-file (one Vitest, 135 Node, sixteen Playwright), 96 command and 63 campaign. Infrastructure
now has nineteen stages: seventeen test files / 84 cases and two static checks. All eleven catalogue
adapters remain resolved (163 cases/54 mutations). `accountDelivery.test.ts` still needs a dedicated
helper-table/duplicate-title identity disposition. Remaining Node fixture/process ownership review,
Playwright, deliberate nested owners, exact wrappers and R-04 precede P-06 and the immutable aggregate.

This new phase remains uncommitted. The evidence packet at
`docs/account-conformance-runs/2026-09-13-generated-registration-adapters/` retains complete final and
partial receipts, controls, exact source patch and preservation evidence within a prospective 300 kB
ceiling. Personal/package/vector bytes, historical reviews/evidence, formal debts, signing backups,
root `done ` and L-2 remain untouched. No personal service, Account cutover or release qualification
occurred.


## 2026-09-13 — Account fixture and delivery-table adapters (L-1)

The generated-registration phase is signed and verified as `f9111ea`. The next bounded selection
adds ten Node files (44 cases) covering core ceremonies, authority and admission, plus the last
Vitest file (twelve delivery cases). All eleven files / 56 cases pass in 75.339 seconds including
snapshot work, with every process group drained. Existing product properties run 980 histories;
no assertion, seed, history count or deadline was reduced. No product selection needed a retry.

Six contradictory-delivery scenarios previously produced four distinct formatted titles. Stable
scenario labels now give all six exact identities; helper construction moves into opaque test-body
builders. AST comparison proves the six event expressions, two assertions and all code outside the
table unchanged. The 500-history delivery oracle remains required. Node fixtures use synthetic
credentials, temporary SQLite, copied-source mutants and inherited IPC crash workers; they do not
open personal services or native browsers. Whole wrappers and optional artifact postconditions
retain separate obligations.

All 110 non-native runner/control tests pass with 3,040 generated control histories. A real IPC
control passes after intentional worker death and refuses/drains a leaked fork despite its passing
case report. Existing Vitest runtime controls now exercise labeled builders as well. Typecheck,
scoped style, inventory/manifest, authority, signature and expected full-release refusal pass.
Eleven native ownership controls retain prior evidence; no browser campaign reran.

The general selections now contain 117 files / 1,150 cases: all 96 Vitest files and 21 Node files.
All previous 106 stage rows/contracts and 1,094 identities are unchanged and retain earlier evidence;
they were not rerun as a combined selection at this revision. The manifest has 612 obligations,
300 unresolved: 141 test-file (125 Node, sixteen Playwright), 96 command, 63 campaign. Infrastructure
has twenty stages: eighteen pure test files / 87 cases and two static checks. The manifest is
565,549 bytes within its unchanged 700 kB ceiling. All eleven catalogue adapters stay resolved.

The new phase remains uncommitted. The bounded packet at
`docs/account-conformance-runs/2026-09-13-account-fixture-adapters/` retains exact reports, source patch,
identity/history preservation, controls and timings within a prospective 150 kB ceiling. Its first
packer check used a stale L-2 baseline; signed-HEAD/current-hash comparison confirmed L-2 unchanged.
All personal/package/vector pins, prior archives, formal debts, signing backups and product runtime
remain unchanged. Remaining Node service fixtures, native/Playwright ownership, exact wrappers and
R-04 precede P-06 and the immutable aggregate; no Account cutover or release qualification occurred.


## 2026-09-13 — Recovery, promotion, activation and handoff service adapters (L-1)

The preceding Account fixture phase is signed and verified as `5334a7c`. Eleven further Node files
add 56 cases: recovery 24, promotion 6, activation 20 and handoff 6. Their synthetic SQLite, recovery/
passkey proofs, copied-source mutants and inherited IPC crash workers are explicitly reviewed.
Native sibling fixtures and whole-wrapper artifacts retain separate obligations.

The activation core uses a boolean conditional in two existing names. A five-line finite-reader
extension admits boolean guards while refusing nonboolean truthiness, active helper calls and
conditional registrations. All product source/test bodies, titles, assertions, seeds, populations
and deadlines remain unchanged. The new positive properties retain 660 histories; the separate
activation stale-proof control must fail and shrink at seed 9110402.

The shared parser change was checked against both the expanded Account and previous generated
selections at identical frozen inputs. Account passes 22 files / 112 cases in 127.643 seconds;
generated registration passes fourteen files / 222 cases in 129.785 seconds, including snapshot work.
All 36 files / 334 cases pass with every group drained. All 111 non-native runner/control tests pass
with 3,200 generated histories. One new negative-control assertion initially used the wrong error
capitalization; the actual refusal was correct, the expectation is corrected, and both logs remain.
No product selection needed repair, retry, population reduction or a longer deadline.

Typecheck, scoped style, planning, signature, authority and expected incomplete-release refusal
pass. All previous 117 general rows/contracts and 1,150 identities are unchanged. General selections
now contain 128 files / 1,206 cases: all 96 Vitest files and 32 Node files. Other 92 general files
retain earlier evidence, not a fresh full run. The manifest retains 612 obligations / 289 unresolved:
130 test-file (114 Node, sixteen Playwright), 96 command, 63 campaign. Infrastructure still has twenty
stages: eighteen pure test files / 88 cases plus two checks. The manifest is 577,448 bytes under the
unchanged 700 kB ceiling; all eleven catalogue adapters remain resolved.

This phase is uncommitted. The compact evidence at
`docs/account-conformance-runs/2026-09-13-service-fixture-adapters/` retains both full selection
reports, controls, exact source patch and preservation pins within a prospective 150 kB ceiling.
Personal/package/vector bytes, frozen L-2, prior evidence, formal debts and signing backups remain
unchanged. Next review service delivery and inbound-read fixtures; other Node/native/Playwright
ownership, exact wrappers, R-04 and P-06 still precede the immutable aggregate and human Account prep.


## 2026-09-13 — Service delivery and inbound-read fixture adapters (L-1)

The preceding recovery/promotion/activation/handoff phase is signed and verified as `95fa715`.
Eight more Node files add 52 cases: delivery 32 and inbound read 20. Explicit fixture review covers
synthetic SQLite/custody, copied-source mutants, binary IPC crash/race workers, a competing SQLite
subprocess and an in-memory receiver build. Product source/tests, titles, assertions, seeds,
populations and deadlines are unchanged. Native and optional wrapper evidence remain separate;
the retired v8 delivery native fixture stays excluded.

Two files use historical Git source that checkout fingerprints alone omit. Their stage contracts
now pin the exact reference, full revision, source path and SHA-256. Bounded reads and prelaunch,
pre-reuse and postexecution checks bind those bytes into result identity. Synthetic Git replacement
controls change history without changing the checkout fingerprint; launch/reuse refuse and an
otherwise passing case receives a failed, drained receipt. Replanning changed bytes changes its key.
Binary Uint8Array IPC works; a passing case with a leaked fork still fails and drains.

The disposable delivery selection passes all eight files / 52 cases in 119.579 seconds, including
snapshot work, with every group drained. It retains 140 passing generated product histories. All
114 non-native runner/control tests pass with 3,360 generated histories. The first reuse control
expected an explicit false field where fresh receipts omit it; corrected assertion and both logs
remain. Generic formatting initially included the intentionally compact manifest; scoped style and
exact writer-layout checks pass without reformatting it. The silent pnpm typecheck was terminated;
direct local TypeScript passed. No product test needed a change, retry or deadline increase.

Planning, authority, signature, whitespace, scoped lint/format and expected release refusal pass.
All 128 previous general contracts and 1,206 identities remain unchanged and retain earlier evidence.
General selections now contain 136 files / 1,258 cases: 96 Vitest and 40 Node files. There are 612
manifest obligations / 281 unresolved: 122 test-file (106 Node, sixteen Playwright), 96 command,
63 campaign. The manifest is 588,519 bytes under the unchanged 700 kB ceiling; all eleven catalogue
adapters remain resolved. Infrastructure remains twenty stages / 88 pure cases plus two checks.

This phase is uncommitted. The packet at
`docs/account-conformance-runs/2026-09-13-delivery-fixture-adapters/` retains complete receipts,
controls, historical inputs, exact source patch and preservation pins within its 150 kB ceiling.
Personal/package/vector files, L-2, prior evidence, formal debts and signing backups are unchanged.
Next is the Account isolation service fixture family; remaining Node/native/Playwright ownership,
exact wrappers, R-04 and P-06 precede the immutable aggregate and human Account preparation.


## 2026-09-13 — Account isolation service fixture adapters (L-1)

The preceding delivery/inbound fixture phase is signed and verified as `dbf5eb5`. Five isolation
files add 23 cases: core 8, recovery 2, generated 3, controls 3 and restart 7. Explicit review covers
two synthetic accounts sharing temporary service/authority databases, per-history cleanup, real
crossed credentials, copied-source mutants and the inherited admission IPC worker. The existing
census and process owner suffice unchanged; product source/tests, names, assertions, seeds,
populations and deadlines remain byte-identical to the signed base.

The disposable isolation selection passes all five files / 23 cases in 56.245 seconds, including
snapshot work, with every process group drained. It retains 160 passing histories at seed 112103
and two directed reply-loss histories. The abandonment-scope control at seed 112104 must fail and
shrink; its requested budget of eighty is not eighty passing histories. The transition oracle
checks full durable rows but seeds some initial offer fields from the implementation; this scope
is explicit. Optional wrapper history/counterexample exports remain separate obligations.

All 88 pure runner/census/adapter tests pass. Direct local TypeScript, scoped lint/format, exact
manifest layout, planning, signature, authority, whitespace and expected release refusal pass.
No product test needed a change, retry, population reduction or deadline increase. The unchanged
owner/reporters retain previous evidence for 26 non-native process and eleven native ownership
controls. All 136 prior general contracts / 1,258 identities remain unchanged and retain earlier
execution evidence. General selections now contain 141 files / 1,281 cases: 96 Vitest and 45 Node.

The manifest retains 612 obligations / 276 unresolved: 117 test-file (101 Node, sixteen Playwright),
96 command and 63 campaign. Its 593,705 bytes stay under the unchanged 700 kB ceiling. All eleven
catalogue adapters remain resolved. The whole isolation wrapper stays blocked; its existing call
to retired delivery-v8 native tests needs disposition before certification, alongside exact exports
and ordered prerequisites. Ordinary isolation file success does not revive that path.

This phase is uncommitted. The packet at
`docs/account-conformance-runs/2026-09-13-isolation-fixture-adapters/` retains complete selection
receipts, exact source patch, 45 source/helper pins, prior contracts and preservation within 150 kB.
Personal/package/vector bytes, L-2, prior evidence, formal debts and signing backups are unchanged.
Next review ledger-contract runtime fixtures, including in-memory builds and the historical batch
reader. Remaining Node/native/Playwright ownership, wrappers, R-04 and P-06 precede the immutable
aggregate and human Account preparation. No personal Account, browser, service or root build ran.


## 2026-09-13 — Ledger-contract runtime fixture adapters (L-1)

The preceding isolation fixture phase is signed and verified as `01c4447`. Three ledger files add
fourteen cases: batch 2, controls 5 and formats 7. Their Vite builds disable configuration loading
and disk output and evaluate the actual ledger modules with explicit Yjs injection. Product code,
tests, case names, assertions, seeds, populations, vectors and deadlines remain unchanged.

The historical input validator adds only `src/crdt/spoolRecord.ts`, pinning the batch reader from
`284a97a27dc3344fcb7c55a8757a2a41c74fe0b9`. Its reference/revision/path/hash enter the stage contract
and prelaunch/reuse/postexecution checks. Existing limits and owner rules are unchanged. Synthetic
Git replacement controls now exercise both the service path and this exact CRDT path, including
changed history with unchanged checkout identity and rejection after an otherwise passing test.

The disposable selection passes three files / fourteen cases in 29.743 seconds, including snapshot
work, with every selected process group drained. All 200 generated histories at seed 5110917 remain,
as does the explicit coordinated-rollback limitation. All 88 pure adapter tests, direct TypeScript,
scoped style, exact manifest layout, planning, authority and expected release refusal pass.

The first unfiltered owner run passed twenty tests and reported orphaned-child on an expected-pass
historical control using the existing service path. The failure log is retained; its first receipt
was removed by teardown. Cause remains unresolved. Optional historical receipt capture was added;
the focused two-test and full 21-test owner reruns pass without changing owner rules or bounds.
Twelve complete historical receipts from those reruns are retained (eight passes, four required
drift failures, all drained). Keep the initial failure open for owner/loaded-host aggregate
reliability investigation. The five unchanged Vitest process and eleven native owner controls retain
prior evidence. No product selection failed or needed a change, retry or increased deadline.

The first packer encountered binary macOS xcrun_db files in captured output. The corrected archive
preserves them as hashed base64; no tests reran for packaging. The packet at
`docs/account-conformance-runs/2026-09-13-ledger-fixture-adapters/` retains full selection reports,
owner logs/receipts, historical/source/vector pins, exact patch and preservation within 150 kB.

All 141 prior general contracts / 1,281 identities are unchanged and retain earlier evidence.
General selections now contain 144 files / 1,295 cases: 96 Vitest and 48 Node. The manifest retains
612 obligations / 273 unresolved: 114 test-file (98 Node, sixteen Playwright), 96 command, 63 campaign.
It is 597,511 bytes under its unchanged 700 kB ceiling; all eleven catalogues remain resolved.
This phase is uncommitted. Personal/package/vector bytes, L-2, prior archives and formal debts are
unchanged. Next review recovery/transport/service-custody contract controls and export fixtures;
other Node/native/Playwright ownership, wrappers, R-04 and P-06 precede the immutable aggregate.


## 2026-09-13 — Recovery, transport and service-custody contract fixture adapters (L-1)

The preceding ledger fixture phase is signed and verified as `54722df`. Five Node files add nineteen
cases: recovery controls 2 and exports 1, transport controls 4, service-custody controls 8 and exports
4. The existing finite census handles their generated names without evaluation. The stage owner,
reporters, historical-input rules, product code/tests, assertions, vectors and deadlines are unchanged.

Recovery source mutants retain authentic context/root/key-pair counterexamples and malformed-export
checks. Transport controls alter messages passed to actual signature verification, with independently
signed omitted-field messages. Custody mutants use exact source anchors, temporary SQLite files and
actual owner methods; crypto mocks restore and handles close. Export checks cover captured owned
buffers and refusal boundaries, without claiming forensic erasure. No browser, listener or build ran.

The disposable selection passes all five files / nineteen cases in 33.004 seconds, including snapshot
work, with every selected group drained. All 88 pure adapter checks, direct TypeScript, scoped style,
planning, authority, signature, exact manifest layout and expected release refusal pass. No product
selection failed or required a retry, repair or larger bound. The existing 160-history policy-change
control includes the new files; these product fixtures use fixed matrices rather than new histories.
The packet at `docs/account-conformance-runs/2026-09-13-contract-fixture-adapters/` retains full stage
receipts, exact patch, 51 source/helper/wrapper pins and preservation within the 150 kB ceiling.

All 144 prior general contracts / 1,295 identities retain earlier evidence unchanged. The 21 Node
owner, five Vitest process and eleven native controls were not rerun. The ledger phase's initial
orphaned-child classification remains unresolved despite later passing controls; preserve it for
owner/loaded-host reliability work. This phase does not establish its cause or a fix.

General selections contain 149 files / 1,314 cases: 96 Vitest and 53 Node. The Account subset has
43 files / 220 cases. The manifest retains 612 obligations / 268 unresolved: 109 test-file (93 Node,
sixteen Playwright), 96 command, 63 campaign. Its 602,471 bytes remain below 700 kB; all eleven
catalogues remain resolved. Whole wrappers and optional evidence exports retain separate obligations.
This phase is uncommitted. All personal/package/vector pins, L-2, prior archives and formal debts are
unchanged. Next review the remaining protocol-preparation and registry fixtures, then other Node/
native/Playwright owners and exact wrappers; R-04 and P-06 precede the immutable aggregate.


## 2026-09-13 — Protocol preparation and registry fixture adapters (L-1)

The preceding contract-control/export phase is signed and verified as `8db2ee7`. Eight files add
43 cases: admission protocol 5, receipt 3, size 9, crypto census 5, crypto probes 1, registry 12,
genesis crypto 3 and outbound preparation 5. All eight files and product sources are unchanged.

Two files are browser-backed despite their names. The shared promotion fixture now borrows owned
Chromium over CDP, closes each isolated context, and registers cleanup before setup. Pure controls
reject missing/malformed endpoints and connection-to-launch fallback; a real native control closes
and reconnects isolated contexts while the owned browser survives. Standalone launch behavior remains.
The native files retain their existing campaign's six-minute bounds; other files use three minutes.
Individual test timeouts, counts and seeds are unchanged. Builds stay in memory; HTTP services,
profiles, SQLite stores, authenticators and keys are disposable.

A pre-change census refusal exposed the numeric >= in the size test's signed boundary title.
The finite declaration reader now supports only finite numeric comparisons of that operator,
with 160 generated signed-title controls and coercion/helper/conditional-registration refusals.
Both historical sources at `6398e33` enter admission-bounds' contract. The validator adds only
account-protocol/admission.ts; existing historical checks enforce both sources. Nine captured
historical control receipts cover all three locator families (six passes, three required refusals).

The owned selection passes eight files / 43 cases in 308.094 seconds, including fingerprint work;
all worker/browser groups drain. Generated populations remain 80 protocol inputs, 12 native receipt
histories, 300 census inputs, 100 HPKE seals and 1,000 outbound-model histories. Snapshot size edges
are real Yjs documents; coverage-size edges are explicitly injected descriptors. Outbound preparation
is model evidence, and registry controls retain obligations rather than execute every referenced test.

All 90 pure adapter checks, 21 Node owner tests, 12 native owner tests, direct TypeScript, scoped
style, planning and authority pass. Five unchanged Vitest process tests retain prior evidence. The
ledger phase's initial orphan classification remains unresolved; these passes establish no fix.
The packet at `docs/account-conformance-runs/2026-09-13-preparation-fixture-adapters/` retains full
receipts, exact patch, 271 pins, historical/browser identities and preservation within 150 kB.

All 149 prior general contracts / 1,314 identities remain unchanged. General selections contain
157 files / 1,357 cases: 96 Vitest and 61 Node. Account has 51 files / 263 cases. The 613,242-byte
manifest retains 612 obligations / 260 unresolved: 101 test-file (85 Node, sixteen Playwright),
96 command and 63 campaign. All eleven catalogues remain resolved. Optional exports and whole
wrappers are separate. This phase is uncommitted. All personal/package/vector pins, L-2, historical
archives and formal debts remain unchanged. Next review delivery-oracle and parser-conformance
fixtures; remaining owners, wrappers, R-04 and P-06 precede immutable aggregate validation.


## 2026-09-13 — Delivery-oracle and parser-conformance fixture adapters (L-1)

Protocol preparation and registry fixtures are signed and verified as `950fe83`. The new
`oracle-parser-fixtures` selection adds seven files / 46 cases: delivery controls 12, finite oracle 1,
parser baseline 3, controls 12, objects 7, submission 3 and wires 8. The seven test files, their
helpers, product sources, assertions, seeds, populations and per-test deadlines are unchanged.

The pre-change census refused the delivery controls' imported table. A narrow static reader now
accepts only that reviewed helper's named controls export and literal key/two-string patch pairs.
It pins the full helper bytes without importing dependencies, executing the helper or invoking
functions. Unknown consumers/imports, dynamic tables, mutable exports, invalid keys and symlinks
refuse. A 160-population property (seed 130925) checks independently derived order and identities;
changing a patch without changing names changes its pin. Before-launch/reuse and postexecution
controls retain two passing receipts and one required drift refusal, all drained.

The old delivery oracle at `77b0bb6239f7b7a48c4a52c74d3e3f39e39994a3` and all four parser baseline
sources at `f0b6acd2e624d89034c88706d4053a830ab50cc6` enter their two stage contracts. Historical
validation adds four exact paths. Its seven synthetic locators retain 21 receipts: fourteen passes
and seven required drift refusals. Neither helper nor Git changes can silently reuse an old receipt.

The owned selection passes seven files / 46 cases in 54.046 seconds including fingerprint work;
every group drains. It retains 3,350 parser inputs across eleven seeded properties, two historical
properties that must fail and shrink, twelve delivery mutations and twelve parser mutations.
The finite oracle cross-check covers 80 worlds / 2,197 three-proof histories over three positions.
Four delivery faults still match the historical reduced oracle while failing full-state comparison.
Parser positives establish structure and independent bytes, not signature authority. The submission
mutation removes both redundant consumption/re-encoding guards. Real Yjs wire edges remain bounded
resource observations, not complexity or workload qualification.

All 92 pure adapter tests, 23 Node owner tests, five Vitest process controls, direct TypeScript,
scoped style, planning and authority checks pass. Twelve unchanged native ownership controls retain
the preparation packet evidence. The ledger phase's earlier expected-pass orphan classification
remains unresolved despite later passes; this phase establishes no fix.

The packet at `docs/account-conformance-runs/2026-09-13-oracle-parser-fixture-adapters/` retains full
receipts, exact patch, source/helper pins, historical/registration controls and preservation within
150 kB. All 157 prior general contracts / 1,357 identities remain unchanged and retain prior evidence.
General selections contain 164 files / 1,403 cases: 96 Vitest and 68 Node; Account has 58 files /
309 cases. The 624,464-byte manifest retains 612 obligations / 253 unresolved: 94 test-file
(78 Node, sixteen Playwright), 96 command and 63 campaign. All eleven catalogues remain resolved.

This phase is uncommitted. Optional JSON reports, native siblings and whole wrappers remain separate.
All personal/package/vector pins, L-2, historical archives and formal debts remain unchanged.
Next review the three transport service fixtures, followed by browser-backed receive fixtures and
remaining owners/wrappers. R-04 and P-06 precede the immutable aggregate and human Account walkthrough.


## 2026-09-13 — Shared transport service fixture integration and stale size-test repair (L-1)

Delivery-oracle/parser integration is signed and verified as `a20e678`. The new
`transport-service-fixtures` selection covers three files / ten cases: controls 2, generated 1,
service 7. The service fixtures invoke real authority/core/SQLite directly with synthetic admission,
recovery and WebAuthn state. No HTTP listener or browser is involved. The retained v1 readback
contract stays required; its two retired v8 browser files and old wrapper command remain excluded.

The initial adapter assertion incorrectly expected that wrapper to remain pending; it was corrected
to preserve the existing exclusion. The first owned run then exposed a stale product-test assumption:
it submitted 4 MiB+16 ciphertext after R-01 narrowed fresh admission to a 512 KiB complete envelope.
The service correctly refused, so page-through was zero rather than the fixture's expected two.

The repaired case asserts fresh refusal, seeds exact historical decisions using the signed pre-R-01
service implementation at `4bb09042f37f68ec31f0d82587af608f599eb096`, and uses current code for cold
readback and exact retries. The historical source enters its receipt contract through the existing
locator/checks. The expanded case hit its old 40-second inner timeout; its final 90-second allowance
matches the existing equivalent inbound historical fixture. The outer three-minute stage bound is
unchanged. A new case checks 512 KiB admission and 512 KiB+1 refusal without consuming the position,
then exact count-bounded readback after restart. No production limit or owner behavior changed.

The final owned selection passes all ten cases in 89.377 seconds including fingerprint work;
every group drains. The unchanged generated campaign retains sixty 4–16-command histories, seed
9112026, endOnFailure:true and its 45-second timeout. Two exact source mutations remove signature
verification or the final snapshot comparison; independent page/proof signatures demonstrate the
unauthorized result, while current-service controls refuse. Inventory comparisons cover promotions
and delivery_decisions, not every database byte. Large payloads are synthetic signed ciphertext,
not a browser decryption, Yjs replay or capacity claim. Restart reopens connections, not processes.

All 92 pure adapter tests, direct TypeScript, scoped lint/format, inventory/manifest, authority,
signature and whitespace checks pass. The unchanged 23 Node owner, five Vitest process and twelve
native ownership controls retain prior evidence. Their files and owner implementation are pinned.
The ledger phase's earlier expected-pass orphan classification remains unresolved; no fix is claimed.

The packet at `docs/account-conformance-runs/2026-09-13-transport-service-fixtures/` preserves the
initial failed owned run, expanded-fixture timeout, final passing receipts, exact patch, historical
source pin, prior evidence and preservation within 150 kB. All 164 prior contracts / 1,403 identities
remain unchanged. General selections contain 167 files / 1,413 cases (96 Vitest, 71 Node); Account
has 61 files / 319 cases. The 627,361-byte manifest retains 612 obligations / 250 unresolved:
91 test-file (75 Node, sixteen Playwright), 96 command, 63 campaign. All eleven catalogues remain
resolved. This phase is uncommitted. Personal/package/vector pins, L-2, archives and debts are
unchanged. Browser receive-transport fixtures are next; other owners, wrappers, R-04 and P-06 precede
the immutable aggregate and human Account walkthrough.


## 2026-09-14 — Browser receive-transport fixtures in the owned validation runner (`L-1`)

Transport service fixtures remain staged at tree `6abb609`; the SSH signing agent refused the requested commit. Signing is pending; new phase changes remain unstaged.

The `receive-transport-fixtures` selection integrates controls 4, generated 1 and native 9: three
files / fourteen exact cases. Product source, controls/generated tests and shared helpers remain unchanged. The native
overflow assertion now requires the exact R-01 response-too-large refusal. Existing owned-CDP support suffices. Complete-file deadlines retain the standalone
wrapper's 90/330/120 seconds, with 15-second browser startup and five-second drain grace.
The sixteen generated histories retain seed 9112042, endOnFailure:true and the 300-second test bound.

All fourteen cases pass in 411.739 seconds including fingerprint work; every worker and browser
group drains. Four exact omission controls remain effective. The real v2 HTTP case exercises two
accepted positions and an empty cold tail; other native/generated responses use signed independent
fixture pages or controlled fetch/stream failures. Nine directed cases include request supersession,
ordered publication, local admission during fetch, cancellation drain, renderer crashes before/after
IDB commit and cold retry. Generated histories compare writing, durable prefix and local source count
after each of six to nine actions. Cold means a new page in the same context; renderer crash does not
establish browser/process/power-loss persistence. No capacity or whole-wrapper claim follows.

All 92 pure runner checks and 12 native ownership controls pass, alongside direct TypeScript,
scoped style, planning and authority checks. The first new planning assertion used a nonexistent
receive-polling filename; it now correctly checks the still-blocked receive-driver path. Its failure
log is retained. The first owned run exposed a stale native overflow assertion: it expected unknown
or AdmissionError where R-01 intentionally returns rejected/response-too-large/recorded:false. The
repair requires that exact result and preserves no-cursor/no-storage-change assertions. All initial
receipts are retained; the final full selection passes within unchanged deadlines. Unchanged
Node owner/Vitest-process controls (23/5) retain pinned earlier evidence. The ledger phase's initial
expected-positive orphan classification remains unresolved; this phase establishes no fix.

All 167 prior general contracts / 1,413 identities retain their prior evidence unchanged. General
selections now contain 170 files / 1,427 cases (96 Vitest, 74 Node), including 64 Account files /
333 cases. Manifest: 612 obligations / 247 unresolved (88 test-file: 72 Node and sixteen Playwright;
96 command; 63 campaign), 630,760 bytes. All eleven catalogues remain resolved.
The [packet](./account-conformance-runs/2026-09-13-receive-transport-fixtures/README.md) preserves complete receipts, browser/input identities, exact source patch,
source/helper pins, ownership evidence, prior contracts and preservation. The run's HEAD was
`a20e678` with the staged prior phase present; its full frozen source identity
is retained. This is bounded evidence, not an immutable aggregate. The new phase remains uncommitted.

All 21 personal/package pins, 31 prior vectors and L-2 are byte-identical. Personal servers/profile,
root build, recovery/factor files, root `done `, historical archives, formal debts and signing backups
remain untouched. Next review the four browser receive-driver fixtures for polling and reconnect,
then remaining native/Playwright/nested owners and wrappers before R-04, P-06 and the immutable run.


## 2026-09-14 — Receive-driver polling/reconnect fixture integration (`L-1`)

Both preceding phases are now signed and verified: transport service `b0e7828` and browser receive
transport `fa80a53`. The former exactly matches the previously recorded `6abb609` staged tree.
Historical evidence retains its actual execution revision and signing status at capture; current
navigation records closure. No history rewrite, evidence substitution or aggregate rerun follows.

The new `receive-driver-fixtures` selection adds four files / seventeen cases: scheduler controls 5,
generated 1, native dispatch controls 2 and native 9. Only the last three files need owned Chromium.
Product source, all four selected tests and their helpers are unchanged. Existing ownership and
finite census suffice. Final file bounds are 90/270/90/180 seconds, with 15-second browser startup and
five-second drain grace. Ten generated histories keep seed 9112052, endOnFailure:true and 240 seconds.

All seventeen cases pass in the final owned run in 424.417 seconds, including fingerprint work;
every worker and browser group drains. The five virtual-clock omissions and two native dispatch
controls remain effective. Generated histories compare writing, durable progress, capture count and
reopen cursor after five to seven publish/local/lost/offline/halt/restart actions. Nine native cases
cover real service polling after later acceptance, loss/backoff, sticky halt, storage failure,
close/exclusion drain and four R-01 size refusals with explicit retry. Offline is a simulated
navigator signal; generated pages are signed fixture responses. Reopen uses a fresh page in the same
context. This is not real network-loss, second-device, crash, power-loss or capacity qualification.

All 92 pure runner checks, direct TypeScript, scoped style, inventory/manifest, authority and
signature checks pass. Unchanged owner/Vitest-process/native controls (23/5/12) retain pinned prior
evidence. The initial native file timed out after seven passing cases. Its old 120-second bound preceded
the four R-01 additions to the original five-case suite. Both wrapper and adapter now allow
180 seconds for that file; all individual 45-second case limits remain. The first failure, partial
case report and signed history proving the expansion are retained. Test bodies need no repair. The ledger phase's initial
expected-positive historical-control orphan classification remains unresolved; no fix is claimed.

All 170 prior contracts / 1,427 case identities remain unchanged. General selections now contain
174 files / 1,444 cases (96 Vitest, 78 Node), including 68 Account files / 350 cases. Manifest:
612 obligations / 243 unresolved (84 test-file: 68 Node and sixteen Playwright; 96 command; 63 campaign),
634,913 bytes. All eleven catalogues remain resolved: 163 cases / 54 mutations.
The [packet](./account-conformance-runs/2026-09-14-receive-driver-fixtures/README.md) retains full receipts, browser/source pins, exact patch, prior contracts,
signature reconciliation and preservation. The new phase remains uncommitted; it is not an immutable
aggregate and does not discharge whole-wrapper ordering, prerequisites or optional JSON outputs.

All 21 personal/package pins, 31 prior vectors and L-2 are byte-identical. Personal profiles/servers,
root build, recovery/factors, historical archives, root `done `, formal debts and signing backups
remain untouched. Next: the five Account sync/composition fixture files, including review of their
historical-input and browser ownership requirements, before remaining native/wrapper integration.


## 2026-09-14 — Account sync/composition fixture integration (`L-1`)

The preceding receive-driver phase is signed and verified as `8bd6a07`. Historical evidence keeps
its actual execution identity and signing status at capture. The new `sync-fixtures` selection adds
five complete files / 29 cases: batch 7, scheduler controls 5, generated 1, native controls 4, native 12.
Only the scheduler controls run without Chromium. File bounds are 300/90/450/150/600 seconds; the
batch allowance comes from the prior liveness ownership group, while the other four match the sync
wrapper. Browser startup remains 15 seconds and drain grace five seconds. Wrappers are unchanged.

All 29 cases pass in 990.122 seconds, including fingerprint work. Every worker/browser group drains.
Six batch cases crash the renderer before/after position, attempt and envelope commits; a seventh
compares exact retry after an accepted reply is lost and later edits arrive. Eight actual-service
histories retain seed 9112062, five to seven actions, endOnFailure:true and their 420-second test limit.
They compare text, captures, source-to-position mapping, send/read progress and encryption invocation
counts after each action. Five scheduler omissions, five omissions in four native control cases and
one native preflight omission remain effective. Twelve native cases include shared permit drain,
local admission during sealing, receive conflict and R-01 fitting/oversized/historical spool restart.

The first focused scheduler run failed all five controls before their assertions: R-01 added a real
EnvelopeSizeError import that the copied module resolved beneath test-results. The fixture now
resolves that exact import to the current protocol module, retaining the actual class, its dependencies
and every mutation/assertion. Before/after logs and signed-history provenance are retained. No product
code changed. The historical browser builder's git reads now have five-second/2-MiB limits. The native
receipt pins both pre-R-01 preparation/delivery source files at `4bb09042f37f68ec31f0d82587af608f599eb096`.
The builder combines those two files with one current sealer mutation, not a complete historical app.

All 92 pure runner checks and 23 Node owner checks pass, with actual before-launch/reuse/midrun
historical drift controls for both new paths. Direct TypeScript, scoped style, inventory/manifest,
authority and signature checks pass. Unchanged Vitest-process/native-owner controls (5/12) retain
pinned earlier evidence. The ledger phase's first expected-positive historical service-path orphan
classification remains unresolved; this phase establishes no fix for it.

All 174 prior general contracts / 1,444 identities are unchanged. General selections now contain
179 files / 1,473 cases (96 Vitest, 83 Node), including 73 Account files / 379 cases. Manifest:
612 obligations / 238 unresolved (79 test-file: 63 Node and sixteen Playwright; 96 command; 63 campaign),
641,301 bytes. All eleven catalogues remain resolved: 163 cases / 54 mutations.
The [packet](./account-conformance-runs/2026-09-14-sync-fixtures/README.md) retains full receipts, input/browser identities, exact source patch,
source/helper pins, control receipts, prior contracts and preservation. The new phase is uncommitted;
it is bounded evidence, not an immutable aggregate or whole-wrapper qualification. Batch's seven
JSON exports are written inside the disposable checkout and are not retained as output obligations;
other optional exports remain disabled. Report/order/prerequisite contracts remain to integrate.

Offline means a simulated navigator signal or routed request/response loss. Reopen uses a new page
in the same context; renderer death does not establish browser crash, power loss or second-device
behavior. All 21 personal/package pins, 31 prior vectors and L-2 remain byte-identical. Personal
profiles/servers, root build, recovery/factors, historical archives, root `done `, formal debts and
signing backups remain untouched. Next: the core receive and ordered editor native fixtures, including
their historical reader and durable-publication controls, before other owners/wrappers and release work.


## 2026-09-14 — Core receive and ordered editor native fixture integration (`L-1`)

The preceding sync/composition phase is signed and verified as `0a7d6d4`. Historical receipts retain
their actual execution identities and signing status at capture. `receive-editor-fixtures` adds two
complete native files / 29 cases: ordered editor 12 and core receive 17. Both use the existing owned
Chromium/CDP fixture. File bounds remain 480/300 seconds, with 15-second browser startup and five-second
drain grace; individual case deadlines, all test bodies, seeds and populations remain unchanged.
The historical reader's git show now has five-second/2-MiB limits. No product or wrapper code changes.

All 29 cases pass in 636.540 seconds including fingerprint work; worker and browser groups drain.
The core file pins `8378596:src/crdt/promotionRecord.ts` in its receipt and confirms the old reader
rejects v9. Its native cases exercise atomic content/evidence commits, activation and receive renderer
crashes, pending Yjs originals across compaction, authenticated cold replay, conflict, held crypto/close,
255-update-plus-event retry and authority changes during sealing. Coverage, witness, split-content and
stored-page mutations retain their distinct assertions; each individual coverage omission still refuses,
while omitting both admits missing content. Synthetic v8 activation/fencing does not revive v8 support.

Twelve core generated histories retain seed 9182026, one to three receive operations with commit cuts
and optional compaction/reopen, ordinary shrinking and their 180-second case bound. They compare the
cursor at each step and after crash/retry, then final replayed text. Ten editor histories retain seed
9202026, three to six actions, endOnFailure:true and 200 seconds. They compare writing, receive progress
and local source counts after each action and writing/source counts after final reopen. No new all-action
coverage requirement is inferred. Inbound pages/proofs are independently signed fixtures; setup uses an
actual synthetic service, but this selection does not exercise its receive HTTP route.

Editor directed cases verify publication only after durable commit, no remote recapture/undo/outgoing,
queued Local preparation after publication, pending structs/deletes, pressure/discard, continued Local
editing after malformed input or conflict, and close/observer-close recovery. Early-publication and
local-relabel source mutations expose prohibited visible text or extra source capsules. Reopen means a
fresh page within the same browser context; CDP renderer death is not browser crash, power loss or a
separate device. Optional JSON exports and wrapper ordering/prerequisites remain separate obligations.

All 92 pure runner checks, direct TypeScript, scoped style, inventory/manifest, authority and signature
checks pass. The historical locator grammar and owner implementation are unchanged; their existing
promotionRecord prelaunch/reuse/midrun drift controls retain earlier evidence. Unchanged Node owner,
Vitest-process and native-owner checks (23/5/12) were not rerun. The ledger phase's initial expected-pass
historical service-path orphan classification remains unresolved; this phase establishes no fix.

All 179 prior general contracts / 1,473 identities are unchanged. General selections now contain
181 files / 1,502 cases (96 Vitest, 85 Node), including 75 Account files / 408 cases. The 646,527-byte
manifest retains 612 obligations / 236 unresolved: 77 test-file (61 Node, sixteen Playwright),
96 command and 63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
The [packet](./account-conformance-runs/2026-09-14-receive-editor-fixtures/README.md) preserves complete receipts, frozen input/browser identities, the exact
patch, source/helper pins, historical signatures, prior contracts and preservation. This new work is
uncommitted and is not an immutable aggregate. All 52 personal/vector pins and L-2 are byte-identical;
personal profiles/servers/build/recovery/factors, historical archives, formal debts, signing backups
and root `done ` remain untouched. Next: the Account spool native fixture, followed by delivery and
other native/wrapper integration before release validation and private Account preparation.

Timing qualification: the core Node run took 297.025 seconds against its 300-second deadline. The
301.462-second stage total also includes preparation/drain work. Preserve the narrow headroom at the
loaded-host reliability gate; this passing run leaves the existing deadline unchanged.


## 2026-09-14 — Account spool native fixture integration (`L-1`)

The preceding receive/editor phase is signed and verified as `2e05910`. `spool-fixture` adds one
complete native file / 24 cases, using the existing owned Chromium/CDP adapter. The original four-minute
file deadline, 30-second directed and 180-second generated case limits, 15-second browser startup and
five-second drain grace are unchanged. Only the active historical-reader Git read gains five-second /
2-MiB bounds. Product code, test bodies, seeds/populations, mutation bodies and wrapper are unchanged.

All 24 cases pass in 244.474 seconds including fingerprint work; worker and browser groups drain.
Node execution took 214.892 seconds against the 240-second deadline; stage time was 219.332
seconds. The complete selection includes fingerprint/setup/drain overhead. This single pass does not
qualify loaded-host reliability.
The receipt pins `7210b7d:src/crdt/promotionRecord.ts`, used by the old-reader rejection control. The
existing historical allowlist and prelaunch/reuse/midrun drift controls already cover this path; other
historical branches in imported helpers stay dormant under the sanitized environment. Intermediate
v6-to-v7 activation/fencing in synthetic fixtures does not add app support or revive retired v8.

Six before/after position, attempt and envelope commit cuts use real IndexedDB abort/completion hooks
and renderer death. Four more cuts interrupt marker and metadata activation before editor exposure.
Cases preserve exact stored wire bytes and sources through compaction/reopen, compare positions and
source indices, verify prepared-signer signatures and refuse the former Local key. Mixed capsules retain
separate human/system frames, including a large source and an unresolved pending child. These assertions
use the current wire verifier; they do not independently decrypt every output frame.

Authenticated-at-rest source/wire/attempt/ledger corruption must refuse reopening without changing the
recorded database inventory or causing another observed envelope encryption. A witness mismatch can
reject before deeper wire verification; no claim is made that each validation layer was reached. Close
during held crypto keeps the slot until drain, withholds wire and preserves a later edit. The lowered
budget admits two encryptions and refuses a third; it does not promise no position was allocated.
Controls expose returned-but-unpersisted wire, two invocations backed by one durable attempt after crash,
and reminting the same position with different bytes when the missing-tail witness check is removed.

Eight generated histories retain seed 9502026, numRuns:8, endOnFailure:true and 180 seconds. Two to four
steps mix Unicode edits, ordinary preparation, compaction and before/after allocation/attempt/envelope
crashes. At each step they check writing, previously observed exact wire, contiguous positions, unique
source references and a durable-attempt bound against Node-observed browser encryption calls. Final
draining checks source-count coverage and the invocation bound, then closes. There is no unconditional
final cold reopen, all-boundary-coverage assertion or shrinking campaign. The observer checks invocation
counts, not nonce uniqueness. Twelve explicit directed renderer crashes supplement the generated cuts.

The base registers cleanup before setup and creates synthetic credentials, temporary loopback service /
SQLite state and browser contexts. Builds are in memory. Setup uses actual private registration,
preparation, admission and handoff; spooled writing is not sent. New-page reopen shares a browser context;
renderer death is not browser-process crash, power loss or another device. Optional JSON exports remain
disabled; wrapper saved-output, ordering and prerequisite postconditions need separate integration.

All 92 pure runner checks, direct TypeScript, scoped style, inventory/manifest, authority and signatures
pass. Unchanged Node owner/Vitest-process/native-owner controls (23/5/12) retain pinned earlier evidence
rather than new execution. The ledger phase's initial expected-pass historical service-path orphan
classification remains unresolved; this phase establishes no fix. Core receive previously used 297.025
of its 300-second Node deadline; narrow headroom remains at the loaded-host reliability gate.

All 181 prior general contracts / 1,502 identities remain unchanged. General selections now contain
182 files / 1,526 cases (96 Vitest, 86 Node), including 76 Account files / 432 cases. The 650,727-byte
manifest retains 612 obligations / 235 unresolved: 76 test-file (60 Node, sixteen Playwright),
96 command and 63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
The [packet](./account-conformance-runs/2026-09-14-spool-fixture/README.md) retains complete receipts, frozen input/browser identities, the exact patch,
source/helper pins, historical signatures, prior contracts and preservation. This new phase remains
uncommitted; it does not establish the immutable aggregate. All 52 personal/vector pins and L-2 are
byte-identical. Personal profiles/services/builds/recovery/factors, historical archives, formal debts,
signing backups and root `done ` are untouched. Next: the delivery native fixture, followed by remaining
native/wrapper integration, R-04, P-06 and the immutable run before private Account preparation.


## 2026-09-14 — Account delivery native fixture integration (`L-1`)

The preceding spool phase is signed and verified as `9bf77c7`. `delivery-native-fixture` adds one
complete native file / 19 cases using the existing owned Chromium/CDP adapter. The original eight-minute
file bound remains. Ordinary directed cases retain 30 seconds, contradictory proofs 60, authority and
leaf-only controls 40, generated histories 100. Browser startup remains 15 seconds, drain grace five.
Only the active historical-reader Git read gains five-second/2-MiB limits. Product code, test bodies,
mutation bodies, generated seed/population, wrapper, owner and census remain unchanged.

All 19 cases pass in 280.555 seconds including fingerprint work; worker/browser groups drain. Node
execution took 252.008 seconds against its 480-second deadline; stage time was 256.362 seconds.
The complete selection includes preparation/fingerprint/drain overhead. One run does not qualify
loaded-host reliability. The receipt pins `81a4655:src/crdt/promotionRecord.ts` for old-reader refusal.
Existing historical allowlist and prelaunch/reuse/midrun drift controls already cover this path.
Other imported historical branches remain dormant under the sanitized environment. Synthetic v7-to-v8
activation/fencing through the private fixture factory does not revive retired v8 product support.

Exact first-submission bytes survive duplicate preparation, compaction and cold reopen. Acceptance
suppresses the pending submission while retaining its stored bytes, sources and envelopes, and permits
the next position. Closed, finalized and conflicting evidence halts outbound preparation while a later
Local edit survives restart. Invalid malformed/foreign-key/wrong-epoch responses and exact duplicates
leave the recorded persistent inventory unchanged. Four submission/response and two activation commit
cuts use actual IDB abort/completion hooks and renderer death. Missing final submission/response rows
refuse reopen against the retained witness without further inventory changes. Coordinated rollback of
both metadata and ledger is outside that observation.

Five directed contradictory-proof scenarios retain two responses and recover conflict after reopening:
refusal/prefix acceptance in either order, different refusals, and final cutoff/later head in either
order. The leaf-only mutation yields closed instead of conflict in both arrival orders; unmutated cold
replay recovers conflict from the retained proofs. Early-return mutation exposes ready bytes absent from
pending storage. Omitting the witness resurrects ready/pending state after deleting a closure response.
Paused signing plus close retains the slot until drain and withholds uncommitted submission bytes.
Restoring an earlier authenticated marker during signing makes current code refuse; omitting the
recheck returns and persists a submission. This tests the recheck point, not atomicity against an
arbitrary same-origin writer after that point.

Eight generated histories retain seed 9812027, numRuns:8, endOnFailure:true and 100 seconds. Every
history creates two envelope positions, crashes once before/after a submission commit and compares
exact retry bytes. Three to six accepted/refused/finalized/conflicting/junk answers are checked at each
step against a separate oracle for recordedness, state, accepted prefix, response count and pending
eligibility. Optional compaction and an unconditional final new-page reopen compare complete delivery
status, original envelope bytes and retained source capsules. This generated case does not directly
compare final visible text or require all answer kinds/both cut sides; no shrinking coverage is claimed.

The independent Node/OpenSSL response oracle opens only the disposable service acceptance seal using
the synthetic operator key, closes its read-only DB and erases intermediate buffers. Foreign-key
negatives use the pinned antireplay vector; subjects come from the current envelope decoder. Setup uses
actual synthetic registration/preparation/admission/handoff, but prepared writing is not dispatched and
the responses are not HTTP service decisions. Base cleanup precedes setup; builds are in memory and
histories use distinct workspaces in a shared context/service. Six directed and eight generated renderer
crashes are not browser-process death, power loss or another device. Optional JSON exports, wrapper
saved-output/ordering/prerequisite postconditions and malicious-member recovery remain separate.

All 92 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged Node owner/Vitest-process/native-owner checks (23/5/12) retain pinned earlier evidence rather
than new execution. The ledger phase's first expected-pass historical service-path orphan classification
remains unresolved despite later passes. Core receive previously used 297.025 of its 300-second Node
bound. Those observations remain at the owner/loaded-host gate; this phase establishes no fix.

All 182 prior general contracts / 1,526 identities remain unchanged. General selections now contain
183 files / 1,545 cases (96 Vitest, 87 Node), including 77 Account files / 451 cases. The 654,205-byte
manifest retains 612 obligations / 234 unresolved: 75 test-file (59 Node, sixteen Playwright),
96 command and 63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
The [packet](./account-conformance-runs/2026-09-14-delivery-native-fixture/README.md) retains complete receipts, exact patch, frozen input/browser identities,
source/helper/vector pins, historical signatures, prior contracts and preservation. This new phase is
uncommitted and is not an immutable aggregate. All 52 personal/vector pins and L-2 remain byte-identical;
personal profiles/services/builds/recovery/factors, historical archives, formal debts, signing backups
and root `done ` are untouched. Next: the Account decisions native fixture, then remaining native/wrapper
integration, R-04, P-06 and the immutable run before private Account preparation.


## 2026-09-14 — Account decisions native fixture integration (`L-1`)

The preceding delivery phase is signed and verified as `d85036e`. `decisions-native-fixture` adds one
complete native file / six cases under existing owned Chromium/CDP. The original 120-second file bound
remains, with four ordinary cases at 30 seconds, the mutation case at 45 and generated histories at 90.
Browser startup stays 15 seconds, drain grace five. Product code, test bodies, helpers, mutations,
vectors, wrapper, owner and census are unchanged. This phase adds runner registration and evidence only.

All six cases pass in 94.874 seconds including fingerprint work; worker/browser groups drain. Node
execution took 67.424 seconds against 120; stage time was 71.743 seconds. The complete
selection includes preparation/fingerprint/drain overhead; one run does not qualify loaded-host
reliability. No historical reader is invoked. Both antireplay and private-envelope runtime vectors
are pinned in frozen source identity and the packet; they are not registration-data inputs.

Owned inspection returns accepted/refused evidence without changing exact envelopes, source capsules,
spool status or the native IDB/localStorage inventory. A directed new-page reopen compares envelope
bytes and re-inspects accepted evidence. Foreign-key, wrong subject/epoch/parent, foreign-prefix and
malformed proofs stay unknown; a proved different accepted digest is conflict. An unminted position
is unknown. Later-position positives reconstruct predecessor links with the independent Node/OpenSSL
oracle. These are read-only evidence checks, not persisted terminal delivery transitions.

Close during paused refusal verification keeps the slot from a competing Web Lock until verification
drains. Cancelled continuations withhold evidence, stale inspection refuses, and a fresh owner can
inspect the same proof. This file contains graceful close and same-context new-page reopen; it invokes
no renderer-crash or whole-browser/power-loss boundary.

Eight generated histories retain seed 9622026, numRuns:8, endOnFailure:true and 90 seconds. Two to five
answers draw accepted/refused/foreign-key/foreign-prefix/conflict/junk. Each answer is checked against
its expected evidence kind and unchanged IDB/localStorage inventory. Spool status is compared before
closing; final unconditional new-page reopen compares exact envelope bytes. Source capsules, counters
and visible text are not separately compared after final reopen. The title's broader wording must not
be used as evidence of those final assertions. No all-kind coverage or shrinking claim is made.

Five uniquely anchored mutations expose wrong-key, wrong-epoch and unanchored-head admission, and
altered-parent or mismatched-position submission acceptance. The parent mutation changes the shared
message builder for signing and verifying in the mutant bundle, signs there, then substitutes another
valid refusal; it does not demonstrate replacement of an existing unmutated signature. These are
primitive controls with synthetic vector keys, not durable successor minting or remint authorization.

The independent Node/OpenSSL oracle reads only the disposable acceptance seal, closes its read-only
DB and clears intermediate buffers. Subjects use the current envelope decoder. Synthetic service setup
performs actual registration/preparation/admission/handoff; prepared writing is not dispatched and
responses are not service HTTP decisions. Base cleanup precedes setup; builds are in memory. Generated
histories share a context/service with distinct workspaces. Optional JSON output, vector regeneration,
wrapper saved-output/ordering/prerequisite contracts and wider lineage/closure enforcement remain separate.

All 92 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged Node owner/Vitest-process/native-owner checks (23/5/12) retain earlier pinned evidence rather
than new execution. The initial ledger owner orphan classification remains unresolved despite later
passes. Core receive previously used 297.025 of its 300-second Node bound; both observations remain at
the owner/loaded-host gate, with no fix established by this phase.

All 183 prior general contracts / 1,545 identities remain unchanged. General selections now contain
184 files / 1,551 cases (96 Vitest, 88 Node), including 78 Account files / 457 cases. The 655,629-byte
manifest retains 612 obligations / 233 unresolved: 74 test-file (58 Node, sixteen Playwright),
96 command and 63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
The [packet](./account-conformance-runs/2026-09-14-decisions-native-fixture/README.md) retains complete receipts, exact patch, frozen input/browser identities,
source/helper/vector pins, base signature, prior contracts and preservation. This new phase is
uncommitted and is not an immutable aggregate. All 52 personal/vector pins and L-2 are byte-identical;
personal profiles/services/builds/recovery/factors, historical archives, formal debts, signing backups
and root `done ` remain untouched. Next: Account capture native fixtures, then remaining native/wrapper
integration, R-04, P-06 and the immutable run before private Account preparation.


## 2026-09-14 — Account capture native fixture integration (`L-1`)

The preceding decisions phase is signed and verified as `fb81e00`. `capture-native-fixture` adds one
complete native file / fifteen cases under existing owned Chromium/CDP. The original 180-second file
bound remains, with fourteen directed cases at 30 seconds and generated histories at 90. Browser startup
stays 15 seconds, drain grace five. Product code, native test bodies, populations, mutations, wrapper,
owner and census are unchanged. Only the active historical-reader Git read gains 5-second/2-MiB bounds.

All fifteen cases pass in 182.651 seconds including fingerprint work; worker/browser groups drain.
Node execution took 153.177 seconds against 180; stage time was 157.293 seconds. A single
passing run does not qualify loaded-host reliability. The old-reader control pins reference, revision,
path and exact bytes for `18ceb40:src/crdt/promotionRecord.ts`. Existing historical drift controls cover
that path; other imported historical branches remain dormant. Synthetic v4-to-v6 activation and v5/
historical-reader refusal do not broaden the supported private v9 product route.

Journal recovery preserves accepted text, human attribution, the Account credential and the exact new
capsule through renderer crash, new-page reopen and compaction. Activation before commit aborts a real
IDB transaction after request success; activation after commit holds completion before renderer death.
Neither exposes an editor prematurely. Quota refusal plus an aborted outbound transaction leaves input
pending, visible text and captures unchanged; retry admits once and survives reopen. Failed journal
removal retains exact overlap through crash recovery. Two uniquely anchored mutations expose lost
capsules despite visible writing and acceptance of a wrong-workspace capsule by the decoder. The latter
never appends its altered capsule and gives no persisted cross-workspace result.

Sixteen histories retain seed 9322026, numRuns:16, endOnFailure:true and 90 seconds. Each of two to six
Unicode insert/delete steps chooses flush, compact, reopen or renderer crash, then compares visible
master text and retained capsule IDs/bytes. The comparison map is refreshed after each edit and can
mask a same-ID change during that edit; it establishes retention across the selected boundary, not
universal equality to first-observed bytes. Histories close without an unconditional final cold reopen.
No all-boundary coverage or shrinking claim is made. This oracle limit remains a follow-up, not a new
product defect or reason to remove the useful boundary coverage.

Exclusive lifetime checks queue another editor before passkey proof, cancellation and stale-surface
refusal after synthetic pagehide. Held native flush completion keeps the slot until close drains;
all documents observed through getText instrumentation are destroyed before release. The event is not
real navigation/BFCache, and instrumentation is not an exhaustive heap inventory. Wrong pin/code/passkey/
actor and public receive refuse without inventory mutation. Human edit/undo and system bulk attribution
survive compaction and reopen. Low-level test capture ingress retains original pending child/delete
frames until the parent arrives, with expected pending and Local text after recovery.

Capsule overhead on 10,000 characters forces database admission after synchronous oversize refusal and
recovers full-length text. Its byte comparison lacks a separate equal-length assertion; the atomic
abort oracle is the separate pressured case. Wrong workspace/credential/principal/epoch and changed
source under an existing ID refuse without inventory changes; this case does not vary generation.
There are four explicit directed renderer crashes plus generated choices. CDP renderer death and
same-context new-page reopen do not establish browser-process crash, power loss or second-device behavior.

The existing base registers cleanup before setup, borrows the owned CDP endpoint and uses in-memory
builds, synthetic factors and a disposable service/SQLite store. Actual preparation, registration,
admission and handoff run there; no writing is sent to a peer or real Account. Generated histories share
a context/service with distinct workspaces. Optional JSON exports and original wrapper saved-output,
ordering and prerequisite contracts remain separate unresolved obligations.

All 92 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged Node owner/Vitest-process/native-owner checks (23/5/12) retain pinned earlier evidence. The
initial ledger owner orphan classification remains unresolved despite later passes. Core receive
previously used 297.025 of its 300-second Node bound; both observations stay at the owner/loaded-host
gate, with no fix established here.

All 184 prior general contracts / 1,551 identities remain unchanged. General selections now contain
185 files / 1,566 cases (96 Vitest, 89 Node), including 79 Account files / 472 cases. The 658,511-byte
manifest retains 612 obligations / 232 unresolved: 73 test-file (57 Node, sixteen Playwright),
96 command and 63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
The [packet](./account-conformance-runs/2026-09-14-capture-native-fixture/README.md) retains complete receipts, exact patch, frozen input/browser identities,
source/helper pins, base/historical signatures, prior contracts and preservation. This new phase is
uncommitted and is not an immutable aggregate. All 52 personal/vector pins and L-2 are byte-identical;
personal profiles/services/builds/recovery/factors, historical archives, formal debts, signing backups
and unrelated root files remain untouched. Next: Account editing native fixtures (sixteen static cases),
then remaining native/wrapper integration, R-04, P-06 and the immutable run before private Account prep.


## 2026-09-14 — Account editing native fixture integration (`L-1`)

The preceding capture phase is signed and verified as `599bba9`. `editing-native-fixture` adds one
complete native file / sixteen cases under existing owned Chromium/CDP. The file allowance is repaired to
300 seconds and generated editing to 180; fifteen other cases retain 30 seconds. Browser startup
stays 15 seconds, drain grace five. Product code, test assertions, populations, mutations,
owner and census are unchanged. The historical-reader Git read gains 5-second/2-MiB bounds; the wrapper
and adapter share the repaired file deadline.

All sixteen cases pass in 213.811 seconds including fingerprint work; worker/browser groups drain.
Node execution took 185.176 seconds against 300; stage time was 189.376 seconds. One run
does not qualify loaded-host reliability. The old-reader control pins reference, full revision, path
and exact bytes for `649925f:src/crdt/promotionRecord.ts`. Existing historical drift controls cover this
path. Other imported historical branches stay dormant. Synthetic v4-to-v5 editing activation does not
broaden the supported private v9 route or revive retired v8 support.

The initial 120-second selection timed out after twelve passing cases. A separate progress-only loader
diagnostic gave the complete file 240 seconds while keeping the 90-second generated case limit.
Nineteen histories completed and history twenty reached its fourth reopen before that case expired;
all fifteen other cases passed. This identified progressing work constrained by both bounds, without
an assertion counterexample. Both failed/partial runs, the progress trace and diagnostic hook are
preserved. The passing selection above is a fresh uninstrumented run after the deadline repair; the complete
24-history case took 106.814 seconds within its new 180-second limit.

Directed recovery checks edit/undo/compaction and new-page reopen; one reopen blocks Account HTTP
requests, without stopping the service or putting the whole browser offline. Before-activation commit
aborts an actual IDB transaction after request success; post-commit holds completion at v5 then kills
the renderer. Neither exposes an editor early. Non-custody DB rows and localStorage remain unchanged
at those boundaries. Wrong pin/code/passkey/actor and public receive refuse without inventory mutation.

Exclusive ownership queues before passkey proof, drains cancelled native flush and revokes stale
handles after synthetic pagehide. Only getText-observed documents are counted for destruction before
permit release; this is not a full heap inventory or actual navigation/BFCache. Deliberately rewriting
an authenticated counter to generation 2 closes the current owner on its next durability check and
refuses reopen without a matching opener. This is fault injection, not a supported rotation procedure.
Two active, uniquely anchored mutations produce specific bad results: opening empty writing after
content erasure when ancestry checking is removed, and opening/editing with an invalid assertion when
passkey refusal is removed. The helper's identity mutation is dormant and receives no control credit.

The 200-case browser-memory ancestry campaign retains seed 9282026, numRuns:200, endOnFailure:true and
30 seconds. It checks later insert/delete and optional unrelated pending child state against an
independent string model, accepts known ancestry, rejects an empty replacement and compares encoded
current bytes before/after inspection. It does not separately compare pending dependency bookkeeping
or establish 200 persistent crash recoveries. A separate native pending-child case inserts through a
low-level test carrier, preserves Local edits and integrates the parent after new-page reopen.

The 24 native editing histories retain seed 9292026, numRuns:24, endOnFailure:true and the repaired
180-second bound. Each
fresh promoted workspace receives one to six edits/optional undos compared to an independent string
model. The 250-ms flush callback is suppressed before each step. Flush and compaction run explicitly;
crash uses CDP renderer death, while journal mode closes gracefully. Every step creates a new page,
reopens, checks writing and compares custody plus logical promotion progress to a fixed pre-edit
snapshot. That helper normalizes retained genesis references; equality of all raw content/journal/
counter/source bytes is not asserted. No all-mode coverage or shrinking claim is made.

Refused storage leaves pending writing outside the document and outgoing callbacks; discard rejects
its ticket, and a later accepted edit survives reopen. Queued option changes cannot substitute slot,
actor or pin. Missing/closed/empty-store selected indexes refuse without mutation. Aborting a held
synthetic passkey callback keeps the permit until the callback drains, with no activation. The native
file has one explicit directed renderer crash plus generated crash choices, not whole-browser death,
power loss or another-device coverage.

The existing base registers cleanup before setup, borrows owned CDP, builds in memory and uses
synthetic factors and disposable service/SQLite stores. Registration/preparation/admission/handoff
run there; no writing is sent to a peer or real Account. Generated native histories share a context/
service with distinct workspaces. Optional JSON exports, wrapper ordering, saved-output and prerequisite
contracts remain separate unresolved obligations.

All 92 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged Node owner/Vitest-process/native-owner checks (23/5/12) retain pinned earlier evidence.
The initial ledger owner orphan classification, core receive's prior 297.025-of-300-second headroom,
and capture's map-refresh/byte-length oracle follow-ups remain open; this phase establishes no fix.

All 185 prior general contracts / 1,566 identities remain unchanged. General selections now contain
186 files / 1,582 cases (96 Vitest, 90 Node), including 80 Account files / 488 cases. The 661,533-byte
manifest retains 612 obligations / 231 unresolved: 72 test-file (56 Node, sixteen Playwright),
96 command and 63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
The [packet](./account-conformance-runs/2026-09-14-editing-native-fixture/README.md) retains complete receipts, exact patch, frozen input/browser identities,
source/helper pins, base/historical signatures, prior contracts and preservation. This new phase is
uncommitted and is not an immutable aggregate. All 52 personal/vector pins and L-2 are byte-identical;
personal profiles/services/builds/recovery/factors, historical archives, formal debts, signing backups
and unrelated root files remain untouched. Next: Account handoff native fixtures (fifteen static cases),
then remaining native/wrapper integration, R-04, P-06 and the immutable run before private Account prep.


## 2026-09-14 — Account handoff native fixture integration (`L-1`)

The preceding editing phase is signed and verified as `2e77b02`. `handoff-native-fixture` adds one
complete native file / fifteen cases under existing owned Chromium/CDP. The file allowance is repaired
from 120 to 180 seconds in the adapter and direct wrapper; fourteen directed cases retain 30 seconds
and generated histories 90. Browser startup remains 15 seconds, drain grace five. Product code, native
test bodies, populations, mutation, census and browser owner are unchanged. The wrapper changes only
its deadline. The active historical promotion-reader Git read gains 5-second/2-MiB bounds; its exact `beed8cf:src/crdt/promotionRecord.ts` bytes are pinned.
The old-slot-verifier branch is dormant under the sanitized environment and gains no execution credit.

All fifteen cases pass in 148.775 seconds including fingerprint work; worker/browser groups drain.
Node execution took 121.212 seconds within 180; stage time was 124.093 seconds. The
24-history case took 60.098 seconds within 90. One run does not qualify loaded-host reliability.

The initial uninstrumented selection hit its two-minute outer deadline during the final provenance
case, after fourteen passing cases. All 24 generated histories had completed in 59.596 seconds, within
their 90-second allowance. The final case had no terminal result, so the initial run receives no
completion credit. Its full timeout receipts and input archive hashes are retained. Only the file
allowance changes to three minutes; the passing result above comes from a fresh full selection.

The browser ES256 positive uses navigator.credentials.get with a CDP virtual authenticator containing
a synthetic credential, then classifies after reloading with Account HTTP requests aborted. Other
assertions use synthetic Node credentials through a browser binding. This is browser WebAuthn/DER
evidence, not a personal/hardware authenticator or full offline-platform result. Classification needs
no recovery code and leaves serialized native inventory unchanged.

Six directed cuts cover prepared marker, selected index and selected marker before/after commit.
Before cuts abort actual IDB transactions after request success; after cuts hold completion and kill
the renderer. All resume in new pages, preserve already-retained handoff data, compare source inventory
and repeat selection without further changes. There are three directed renderer deaths. The stable
inventory comparison excludes only this slot's promotion marker and slot-index row. Binding and
passkey replay refusals precede mutation; five damaged routes and removed/tampered provenance refuse
without repair. Cancellation keeps the permit until held index acknowledgement drains. Its assertion
checks competitor progress, not the cancelled call's returned value.

The actual passkey guard mutation first observes current-code refusal, then selects and classifies
with an invalid signature after removing that guard. Its current source anchor was checked unique;
the helper itself checks presence. The historical reader and previous Local operations refuse the
selected carrier without new network calls or inventory changes. No Account editor or transport is
attached by this phase.

Twenty-four histories retain seed 9272026, numRuns:24, endOnFailure:true and 90 seconds. One to eight
insert/delete operations mix disk/journal persistence and optional reverse delivery. An independent
string model checks master writing. The Node/OpenSSL oracle opens the recovery envelope, HPKE wrap
and checkpoint; the shared browser Yjs decoder compares it to expected state before handoff. The
oracle does not independently implement Yjs or clear every intermediate synthetic secret buffer.
Generated faults choose none, aborted prepared/index/selected commits, lost binding reply or wrong
passkey credential. Reload and retry select the expected principal/workspace while preserving inventory
outside the authorized rows. One to three further reloads stub fetch to throw, omit the recovery code,
compare the complete classification result and require unchanged post-selection inventory. These are
page reloads, not generated renderer deaths; no all-fault or shrinking claim is made. Plaintext is not
independently decrypted again after selection.

The base registers cleanup before setup, borrows owned CDP, builds in memory and uses temporary
service/SQLite stores and synthetic factors. Registration/recovery/preparation/genesis/admission/binding
run there; no writing reaches a peer or real Account. Optional JSON exports are disabled. The wrapper's
core/ES256 sibling files and saved-output/scheduling/ownership contracts remain separate obligations.
Existing historical drift controls cover the pinned promotion path; no vector regeneration is claimed.

All 92 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged Node owner/Vitest-process/native-owner checks (23/5/12) retain prior evidence. Initial ledger
owner orphan classification, prior core receive headroom and capture oracle follow-ups remain open.
Editing's earlier timeout, diagnostic and measured deadline repair remain preserved historical evidence.
All 186 prior general contracts / 1,582 case identities and retired-v8 exclusions remain unchanged.
General selections now contain 187 files / 1,597 cases (96 Vitest, 91 Node), including 81 Account files /
503 cases. The 664,284-byte manifest retains 612 obligations / 230 unresolved: 71 test-file
(55 Node, sixteen Playwright), 96 command and 63 campaign. All eleven catalogues remain resolved
(163 cases / 54 mutations). The [packet](./account-conformance-runs/2026-09-14-handoff-native-fixture/README.md) preserves complete receipts, exact patch,
frozen input/browser identities, source/helper pins, base/historical signatures, prior contracts and
preservation. This new phase is uncommitted and is not an immutable aggregate. All 52 personal/vector
pins and L-2 remain unchanged; personal profiles/services/builds/recovery/factors, historical archives,
formal debts, signing backups and unrelated root files remain untouched. Next: Account admission native
fixtures (fifteen static cases), then remaining integration, R-04, P-06 and immutable validation.


## 2026-09-14 — Account admission native fixture integration (`L-1`)

The preceding handoff phase is signed and verified as `bd484a6`. `admission-native-fixture` adds one
complete native file / fifteen cases under the existing owned Chromium/CDP adapter. All fifteen pass
in 143.427 seconds including fingerprint work; Node execution took 113.829 seconds within 180,
stage time 118.284, and all 30 generated histories 59.692 within their unchanged 90-second bound.
Worker and browser groups drain. This new phase remains uncommitted; it is not an immutable aggregate.

Before the first native run, the adapter and direct wrapper received a three-minute outer allowance,
based on the preceding handoff's measured 121.212-second execution and admission's larger generated
population. No admission timeout is claimed. Fourteen directed cases retain 30 seconds, generated
histories 90, browser startup 15 and drain grace five. Product code, native test bodies, oracles,
populations, census and owner are unchanged. The wrapper changes only its allowance from 120 to 180
seconds. The active historical reader `280f616:src/crdt/promotionRecord.ts` gains exact source pins and
5-second/2-MiB Git bounds. Inherited genesis/base-promotion mutations remain dormant.

The basic admission retains admission-receipted, no longer reports pending preparation and returns the identical
receipt after reloading the same page, with unchanged post-admission inventory. Abandonment refuses.
Six requested/offered/receipted before/after commit cuts abort actual IDB transactions before completion
or hold completed acknowledgements and kill the renderer. All reopen new pages in the same context,
preserve any retained offer/receipt and finish admission. Three directed cuts kill renderers; none
kills a browser or service process. The filtered cross-admission inventory excludes every application-
upgrade row in done.custody, not only the current slot's marker. All other serialized database rows
and localStorage compare equal, including the Local index. Cross-slot writes to excluded promotion
rows and forensic profile equality are outside that oracle.

Lost begin/finish replies execute the service call before throwing; reload retries recover the exact
service offer/receipt. Abandonment after an offered result removes preparation while preserving the
filtered Local carriers. A lost committed reply cannot authorize abandonment or mutate retained
inventory. With final receipt acknowledgement held, cancellation keeps a competing page queued until
release, after which the competitor receives a receipt. The cancelled call's returned value is not
asserted. A queued-input case changes slotId and draft.authRoot after calling admission and still
obtains the original account's offer; it does not exhaust every option.

The receipt mutation first observes current-code rejection of a corrupted finish signature, leaving
admission-offered. It then forces retry through the retained offer and an altered committed receipt
returned by challenge; removing the unique final verifyReceipt(answer, request, options.pin, parts)
call actually retains an invalid-signature receipt at admission-receipted. Other verifier sites remain.
This is a specific acceptance oracle, not evidence of successfully reopening that forged receipt.
The helper checks anchor presence; current-source uniqueness was independently checked. The historical
version-2 reader and earlier Local/preparation/genesis operations refuse retained admission without
new network calls or inventory changes.

Thirty histories retain seed 9242026, numRuns:30 and endOnFailure:true. One to ten insert/delete edits
mix database and journal persistence with optional reversed delivery. Faults include no fault, lost
begin/finish replies, aborted requested/offered/receipted commits and changed offer signatures. Reload
and retry preserve retained/lost service results and filtered source inventory; one to three further
reloads return the exact receipt. Read-only SQLite checks require an active account, exactly one
admitted promotion row and stored receipt JSON equal to the returned receipt. The service remains
live within each history. No generated renderer death, shrinking or all-fault-coverage assertion is
claimed.

An independent string model derives expected master text. The Node/OpenSSL oracle reconstructs LP
and hash messages and verifies epoch, offer, receipt, origin, certified set, checkpoint manifest and
semantic admission signatures. It independently opens the recovery envelope, HPKE wrap and checkpoint.
Node Yjs replay derives exact SV/DS, checks admitted coverage and no pending structs/deletes; the shared
browser decoder compares full fixture state and cards/order. Yjs semantics remain shared, and not all
intermediate synthetic secret/plaintext buffers are zeroed. This does not prove arbitrary semantic
truth to a content-blind service or qualify malicious-member recovery.

The base registers cleanup before setup, borrows owned loopback CDP, builds in memory and uses temporary
service/SQLite stores and synthetic credentials/factors. Activation uses a Node fixture assertion via
a browser binding, not navigator.credentials.get or a personal authenticator. Optional JSON exports
are disabled. Core/restart/control siblings and wrapper output/scheduling/ownership remain separate
obligations. No vector is read by this selected file. No Account index handoff, editor, transport,
offline Account startup, peer adoption or real Account admission is established here.

All 92 pure runner checks, direct TypeScript, scoped style, planning, authority and signature checks
pass. The first runner attempt found a duplicate stale assertion still treating admission as unreviewed;
its log is retained and the complete suite passed after removing that assertion. Unchanged Node owner,
Vitest-process and native-owner controls (23/5/12) retain prior evidence. Initial ledger orphan
classification, prior core receive headroom, capture map-refresh/byte-length follow-ups and historical
editing/handoff deadline evidence remain visible. All 187 prior contracts / 1,597 case identities and
retired-v8 exclusions are unchanged. General selections now contain 188 files / 1,612 cases (96 Vitest,
92 Node); Account has 82 files / 518 cases. The 666,953-byte manifest has 612 obligations / 229 unresolved:
70 test-file (54 Node, sixteen Playwright), 96 command and 63 campaign. All eleven catalogues remain
resolved (163 cases / 54 mutations).

The [packet](./account-conformance-runs/2026-09-14-admission-native-fixture/README.md) retains complete receipts, exact patch, frozen input/browser identities,
source/helper pins, base/historical signatures, prior contracts and preservation. All 52 personal/vector
pins, L-2, historical evidence/debts/signing backups and unrelated root files remain untouched. Next:
Account genesis native fixtures (fourteen static cases), then remaining integration, R-04, P-06 and
the immutable aggregate before private Account preparation and human adoption.


## 2026-09-14 — Account genesis native fixture integration (`L-1`)

The preceding admission phase is signed and verified as `b201784`. `genesis-native-fixture` adds one
complete native file / fourteen cases under the existing owned Chromium/CDP adapter. All fourteen pass
in 97.153 seconds including fingerprint work; Node execution took 69.345 seconds within 180,
stage time 72.933, and all 40 generated histories 35.478 within their unchanged 90-second bound.
Worker and browser groups drain. This new phase remains uncommitted; it is not an immutable aggregate.

Before the first native run, the adapter and wrapper received a three-minute outer allowance informed
by preceding admission/handoff execution (113.829/121.212 seconds) and this larger generated population.
No genesis timeout is claimed. Thirteen directed cases retain 30 seconds, generated histories 90,
browser startup 15 and drain grace five. Product code, native bodies, oracles, populations, census
and owner remain unchanged. The wrapper changes only its allowance from 120 to 180 seconds.
The active `a4e1c15:src/crdt/promotionRecord.ts` reader gains exact pins and 5-second/2-MiB Git bounds.
The inherited promotion MAC mutant is dormant; snapshot/wrap semantic mutants run at their current,
uniquely checked refusal throws. The helper itself checks anchor presence.

The primary case preserves full database/journal state and attribution under reversed delivery,
independently opens the recovery wrap/checkpoint and compares full fixture state. It requires unchanged
custody metadata, two wraps and proposed epoch 1; two absent JSON sentinels are a limited plaintext
check, not broader privacy qualification. Reloading the same page returns exact candidate bytes.
Preceding preparation leaves inventory unchanged, ordinary Local reading refuses the retained format,
and authenticated abandonment removes the marker without changing other source carriers.

The filtered inventory excludes every application-upgrade row in done.custody/entries, not only the
current slot's marker. Remaining serialized database rows and localStorage compare equal. Cross-slot
changes to excluded promotion rows are outside that oracle, as is forensic profile equality. The
snapshot helper exposes logical shape and is not an authentication oracle.

Two commit cuts abort the actual IDB transaction after request success or hold completion and kill the
renderer. Both reopen new pages in the same context and recover full state. Before commit retains
prepared; after commit returns the exact won candidate. There is one renderer death, no browser or
service process crash. Existing boundary waits retain the 30-second case cap without an early-result
diagnostic. Wrong factors, foreign account, changed recovery public key and current service abandonment
refuse with unchanged inventory; unbound actor/card attribution refuses without rewriting content.

Five forgeries carry valid candidate signatures and promotion MACs but alter checkpoint plaintext,
recovery-wrap key, coverage, recipient or actor. All refuse without changing poisoned inventory.
Removing the checkpoint coverage refusal actually admits incomplete state, detected by independent
decryption and full-state inequality. Removing the wrap equality refusal actually admits a candidate
that fails independent recovery opening. These are specific bad-acceptance outcomes; fixture signing
uses production message/custody helpers. The previous-format reader refuses preparation/abandonment
without network or inventory changes. Five malformed raw marker edits also refuse unchanged, but are
not re-signed and do not isolate parser checks from MAC/signature refusal. Restoring the marker permits
exact retry. Cancellation holds a competing page until acknowledgement drains; it then returns the
exact retained candidate. The cancelled call's return value is not asserted.

Forty histories retain seed 9222026, numRuns:40 and endOnFailure:true. One to twelve insert/delete edits
mix database/journal persistence with optional reverse delivery, pre-commit abort and same-page reload.
An independent string model derives master text; a parity model derives the two cards' order. Exact
system/human author identities, decoded full state and coverage compare with the seeded fixture.
Repeated genesis returns identical bytes, one of five signed semantic forgeries refuses, authenticated
abandonment succeeds and filtered source inventory stays unchanged. No generated renderer death,
service restart, shrinking or explicit all-fault-coverage assertion is claimed. Histories share one
context/service and use fresh slots/accounts; earlier abandoned slots remain in inventory comparisons.

The Node/OpenSSL oracle independently opens the recovery envelope, HPKE recovery wrap and AES-GCM
checkpoint. Yjs decoding and application projections remain shared. This file does not independently
open the device wrap or verify the candidate signature, and not all intermediate synthetic oracle
buffers are zeroed. The separately integrated crypto sibling retains its own vector/interoperability
evidence and was not rerun. No runtime vector is read by this native file.

The base registers cleanup before setup, borrows owned loopback CDP, builds in memory and uses temporary
service/SQLite stores and synthetic factors. Registration/recovery/preparation run there; the candidate
is not admitted or sent to a peer. Setup assertions use Node fixture credentials, not a browser/hardware
ceremony. Optional ACCOUNT_REPORT_DIR exports are disabled. Wrapper crypto/output/scheduling/ownership
obligations remain separate. No issued epoch, service admission, Account index, editor/transport,
offline Account startup, personal admission or second-device result is established here.

All 92 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged Node owner/Vitest-process/native-owner controls (23/5/12) retain prior evidence. Initial
ledger orphan classification, core receive headroom, capture map-refresh/byte-length follow-ups and
historical editing/handoff deadline evidence remain visible. All 188 prior general contracts / 1,612
identities and retired-v8 exclusions remain unchanged. General selections now contain 189 files /
1,626 cases (96 Vitest, 93 Node); Account has 83 files / 532 cases. The 669,301-byte manifest has
612 obligations / 228 unresolved: 69 test-file (53 Node, sixteen Playwright), 96 command and 63 campaign.
All eleven catalogues remain resolved (163 cases / 54 mutations).

The [packet](./account-conformance-runs/2026-09-14-genesis-native-fixture/README.md) retains complete receipts, exact patch, frozen input/browser identities,
source/helper pins, base/historical signatures, prior contracts and preservation. All 52 personal/vector
pins, L-2, historical evidence/debts/signing backups and unrelated root files remain untouched. Next:
Account promotion native fixtures (twelve static cases), then remaining integration, R-04, P-06 and
the immutable aggregate before private Account preparation and human adoption.


## 2026-09-14 — Account promotion native fixture integration (`L-1`)

The preceding genesis phase is signed and verified as `25c8be8`. `promotion-native-fixture` adds one
complete native file / twelve cases under existing owned Chromium/CDP. All twelve pass in 73.219
seconds including fingerprint work; Node execution took 44.949 within the existing 120-second file
allowance, stage time 48.734, and all 45 histories 16.727 within their existing 60-second limit.
Worker/browser groups drain. Eleven directed cases retain 30 seconds, browser startup 15 and drain
grace five. Product code, native bodies, helpers, wrapper, populations, seed, census and owner remain
unchanged. This native file needs no historical-source or registration-data adapter. New work remains
uncommitted and is not an immutable aggregate.

The main case journals fixed writing and seeds synthetic authenticated imported-claim metadata. It
requires two additional seal reservations, unchanged original envelope/credentials/seals/store/root
fields, different new credential IDs and exact prepared output/snapshot after same-page reload.
Wrong code adds no network call; a foreign account refuses. Abandonment restores previously observed
text without refunding budget, repeats as no-promotion and leaves the old registration ineligible.
Its whole-inventory comparison excludes all of done.custody. Other databases and localStorage remain
equal, but exact imported-claim/all-custody equality is not independently asserted. This is synthetic
provenance, not an importer replay or forensic profile comparison.

Four reserved/prepared before/after cuts abort real IDB transactions at request success or hold actual
completion then kill the renderer. All reopen new pages in the same context. Before-reserved and
after-prepared spend two additional seals; after-reserved and before-prepared spend four on retry.
Committed prepared credentials retain their winning descriptors, original Local credentials remain,
and fixed text is readable after abandonment. Two directed cuts kill renderers; no browser, service
process or power-loss crash is induced. Existing boundary waits retain the directed case limit.

Forty-five histories retain seed 9192026, numRuns:45, endOnFailure:true and an explicit completed-run
count of 45. Two to nine labels select prepare/restart/wrong/tamper/abort/abandon/edit. A separate
scalar ledger starts at three seals and adds two on first successful preparation; preparation steps
compare budget and exact repeated results. Tampered marker IDs refuse authentication and are restored
by the fixture. Pre-reservation abort reloads before retry; writing refuses while prepared, and
abandonment makes the retired account's subsequent preparation refuse. Restarts are same-page reloads.
Some labels fall through to ordinary preparation when their fault preconditions do not hold; there
is no all-fault coverage assertion, generated renderer death or shrinking. Counter/inventory equality
is not checked after every action, successful unprepared edits do not assert journalled status, and
this property has no independent plaintext/full-state/crypto oracle. Histories share context/service
with fresh slots/accounts.

The MAC control changes the preparation ID, observes current authentication refusal, removes the
uniquely checked authentication throw and actually obtains the substituted ID. The helper checks
anchor presence; uniqueness was separately checked. Missing completed content metadata refuses with
identical inventory and no additional network calls. A validly re-MACed near-exhausted budget refuses
without inventory changes; zero network calls are not asserted for that second refusal.

Concurrent preparers converge at budget five. The cancellation case holds a transport wrapper before
its actual inspect request, aborts and checks a competing page has not completed. Release lets the
request settle; the cancelled call must not return success and the competitor returns the original
result. It does not hold an already in-flight HTTP reply or query pending locks. Lost abandonment
replies retain the exact prepared snapshot, and an aborted marker deletion retains its ID; reload
permits cleanup without refunding budget.

Recovery-owner cleanup covers unsaved and service-cancelled code preparation. Lost committed replies
retain awaiting-code until a fresh owner acquisition empties progress and sees no eligible pending
preparation. The two iterations use separate slots/registrations; despite the existing title, the
case does not explicitly re-register the same old slot after cleanup. Another case confirms recovery
with a synthetic assertion, refuses unknown Local references before network, keeps finalization-pending
while promotion exists, and clears recovery only after promotion abandonment. This is not a broad
account reset or factor/key-loss recovery result.

The base registers cleanup before setup, builds in memory, borrows owned loopback CDP and uses temporary
service/SQLite stores and synthetic factors. Node fixture assertions are not browser/hardware passkey
ceremonies. Optional ACCOUNT_REPORT_DIR exports remain disabled. Core sibling/service-history/process-
death and wrapper saved-output/scheduling/ownership obligations remain separate. No vector or historical
reader runs in this native file. No genesis checkpoint, service activation/admission, issued epoch,
Account index, editor/transport, offline startup, personal Account or second-device adoption follows.

All 92 runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged Node owner/Vitest-process/native-owner controls (23/5/12) retain prior evidence. Initial ledger
orphan classification, core receive headroom, capture map-refresh/byte-length follow-ups and historical
editing/handoff deadline evidence remain visible. All 189 prior general contracts / 1,626 identities
and retired-v8 exclusions remain unchanged. General selections contain 190 files / 1,638 cases
(96 Vitest, 94 Node); Account has 84 files / 544 cases. The 671,721-byte manifest has 612 obligations /
227 unresolved: 68 test-file (52 Node, sixteen Playwright), 96 command and 63 campaign. All eleven
catalogues remain resolved (163 cases / 54 mutations).

The [packet](./account-conformance-runs/2026-09-14-promotion-native-fixture/README.md) retains complete receipts, exact patch, frozen inputs/browser identity,
source/helper pins, base signature, prior contracts and preservation. All 52 personal/vector pins,
L-2, historical evidence/debts/signing backups and unrelated root files remain untouched. Next:
Account authority native fixtures (four static cases), then remaining integration, R-04, P-06 and
the immutable aggregate before private Account preparation and human adoption.


## 2026-09-14 — Account authority native fixture integration (`L-1`)

The preceding promotion phase is signed and verified as `f59d5f2`. `authority-native-fixture` adds
one complete native file / four cases. All pass in 63.453 seconds including fingerprint work;
Node execution took 28.635 within 120, stage time 32.592, and all 40 histories 21.182 within 40.
Worker/browser groups drain. The main case retains 30 seconds, cancellation and input snapshot 20,
startup 15 and drain grace five. The file allowance follows the existing authority wrapper bound.

Native setup now registers cleanup before asynchronous setup, closes the fresh context, and borrows
validated loopback CDP through the existing shared browser helper. Nested finalizers retain server
close, operator-key zeroing and temporary-directory removal if another cleanup step fails. Standalone
campaigns retain their launch path. Product code, all test bodies and identities, browser helpers,
wrapper, generated population/seed and all limits remain unchanged. No runtime historical-source or
registration-data input is needed. New work is uncommitted and is not an immutable aggregate.

The main case journals fixed writing, checks its recovered entry and Local scope, compares retained
logical IndexedDB/localStorage values before and after preflight, observes text through production
recovery, and requires the exact preflight result after page reload. A synthetic authenticated imported
claim retains the same context and inventory; this is not an importer replay. The configured pin is
supplied by fixture initialization separately from the proof reply, not by real operator distribution.
Recovery confirmation checks a 128-character signature with a generated challenge and production digest;
it does not independently verify that signature or finalize recovery at the service.

Wrong code and pending Yjs dependencies refuse before an additional authority HTTP call. A different
configured authRoot refuses with pin-changed; heads material refuses with admission-material. A direct
HTTP probe verifies a same-origin signed proof and observes 403 for one foreign Origin. This does not
exhaust signature/nonce/parser or policy mutations. The inventory is a logical key/value census,
including Uint8Array bytes; it does not establish forensic or physical power-loss preservation.

Cancellation holds a prove wrapper before HTTP, aborts, observes another tab has not acquired, then
releases the wrapper and requires non-success from the cancelled call plus successful subsequent
acquisition/inspection. It does not delay an already in-flight HTTP reply or query lock-manager state.
The input-snapshot case immediately replaces top-level caller fields and requires the first slot and
principal. It does not force acquisition behind a competing lock or mutate nested pin fields.

Forty histories retain seed 9182026, numRuns:40, endOnFailure:true and an explicit completed count.
One to eight labels select inspect/wrong-code/restart/disk-edit/journal-edit in fresh Local slots under
one shared service/context. Non-edit actions compare before/after inventory and successful inspections
retain the first observed context for repeated equality. Edit actions skip the comparison and do not
assert journalled status. This is an observed-context/inventory oracle, not an independent expected
writing or cryptographic model. No generated fault control, shrinking or action-coverage assertion is
present. Restarts reload the same page; this native file induces no renderer, browser or service death.

All 92 runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
The unchanged 23 Node-owner, five Vitest-process and twelve native-owner controls retain prior evidence.
Existing ledger orphan classification, core receive headroom, capture map-refresh/byte-length follow-ups
and historical editing/handoff deadline evidence remain visible. All 190 prior general contracts /
1,638 identities and retired-v8 exclusions are unchanged. General selections contain 191 files /
1,642 cases (96 Vitest, 95 Node); Account has 85 files / 548 cases. The 672,735-byte manifest has 612
obligations / 226 unresolved: 67 test-file (51 Node, sixteen Playwright), 96 command, 63 campaign.
All eleven catalogues remain resolved (163 cases / 54 mutations).

The [packet](./account-conformance-runs/2026-09-14-authority-native-fixture/README.md) retains complete receipts, exact patch, frozen inputs/browser identity,
source/helper pins, base signature, prior contracts and preservation. All 52 personal/vector pins,
L-2 and historical evidence/debts/signing backups remain unchanged. Optional counterexample JSON and
whole-wrapper output/scheduling/ownership remain separate obligations; service-only sibling controls
are not rerun here. This read-only preflight grants no epoch/admission/recipient authority and does not
establish prepared promotion, activation, Account index/editor/transport, full recovery/adoption or a
personal/hardware ceremony. Next: Account recovery native fixture (one case), preserving its actual
persistent-profile browser restarts and virtual WebAuthn semantics when integrating ownership.


## 2026-09-14 — Account recovery native fixture integration (`L-1`)

The preceding authority phase is signed and verified as `be8749f`. `recovery-native-fixture` adds
one complete native file / one case. It passes in 33.310 seconds including fingerprint work;
Node execution took 8.529 within the existing 120-second wrapper/file allowance and stage time 11.013.
The scenario retains its original 40-second timeout. Worker and auxiliary browser groups drain.
There are no generated histories in this file. New work is uncommitted, not an immutable aggregate.

The recovery scenario must restart a complete persistent browser twice. Its owned path now uses the
existing custody persistent-profile helper, with bounded reopen support: at most two reopens, only
after the prior generation has closed cleanly. It removes stale port publication, preserves startup/
close bounds and origin filtering, and records each generation's PID/endpoint/exit and prior-PID link.
All scenario browsers inherit the worker group, so outer cleanup can drain them on worker death.
The existing Chromium-CDP stage also owns its ordinary auxiliary browser; that is not the persistent
profile used by this scenario. Standalone campaigns retain their original Playwright launch path.

Cleanup registers before service setup and uses nested finalizers. The original recovery scenario
body, case identity and timeout, production code, recovery fixtures and wrapper remain unchanged.
New final ownership assertions require three distinct browser PIDs, one profile directory, clean exit
for all generations and exact predecessor links. Complete recovery-profiles.json records are retained
with the stage receipts as supplemental fixture evidence; this adds no general result adapter.

The case uses actual navigator.credentials create/get with a CDP virtual resident-key, user-verifying
ctap2 authenticator. Registration begin/finish calls the service directly from Node; recovery operations
use loopback HTTP. Credentials are explicitly exported/restored after the first clean full browser
restart. This is emulated passkey persistence, not operating-system or hardware ceremony evidence.
Draft-generation IDB abort leaves empty state; confirmation abort leaves null finalization and a
service recovery ceremony. These are request-time transaction aborts, not physical power loss.

Cold reopen retains awaiting-code, refuses replacement generation and rejects a wrong saved code
without prompting. One retained row's JSON excludes the literal code and has null finalization;
this is a logical-row check, not a whole-profile privacy oracle. Another tab cannot acquire a held
owner. Cancellation delays a begin wrapper before HTTP and keeps exclusion until settlement, then
rejects as closed; it does not delay an already in-flight reply.

A held finish wrapper is reached after finalization is durable. Page.crash kills the renderer; a new
page sees finalization-pending. Resume commits service recovery and then loses its reply; local and
service recovery IDs agree. A second full browser restart resumes the exact committed result without
another assertion. The fixture restores no virtual credentials after this second restart. Unexpected
finish stage and changed target context refuse. The context is synthetic and does not run promotion
preflight. The service account stays pending; this is recovery-code preparation/confirmation, not
admission, new-device account recovery or personal adoption. No service or browser process is forcibly
killed in this scenario; the two full browser restarts are clean and the renderer crash is deliberate.

All fourteen native-owner controls pass: eight existing CDP controls and six persistent-profile controls.
The latter retain cold-copy, timeout, cancellation and worker-death coverage and add clean three-generation
reopen plus worker death after reopening. Reopen refuses live/unknown/excess attempts and an injected
failed-close record; that injection is not an OS close failure. Positive reopen checks localStorage
survival; post-reopen worker death checks no matching profile process or CDP listener remains.

All 92 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged 23 Node-owner and five Vitest-process controls retain earlier evidence. No historical-source
or runtime registration-data input is needed. Independent-crypto/generated/mutation/service-death
siblings and whole-wrapper output/scheduling/ownership remain separate obligations. Existing ledger
orphan classification, core receive headroom, capture map-refresh/byte-length follow-ups and historical
editing/handoff deadline evidence remain visible.

All 191 prior general contracts / 1,642 identities and retired-v8 exclusions remain unchanged.
General selections contain 192 files / 1,643 cases (96 Vitest, 96 Node); Account has 86 files / 549 cases.
The 673,303-byte manifest has 612 obligations / 225 unresolved: 66 test-file (50 Node, sixteen Playwright),
96 command, 63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
The [packet](./account-conformance-runs/2026-09-14-recovery-native-fixture/README.md) retains complete receipts/profile records, native-owner controls, exact patch,
frozen input/browser identities, source pins, base signature, prior contracts and preservation.
All 52 personal/vector pins, L-2 and historical evidence/debts/signing backups are unchanged.
Next: Account core native fixtures (two cases), then remaining integration, R-04, P-06 and the immutable
aggregate before private Account preparation and human work.


## 2026-09-14 — Account core native fixture integration (`L-1`)

The preceding recovery phase is signed and verified as `4a52665`. `core-native-fixture` adds one
complete file / two cases. Both pass in 28.533 seconds including fingerprint work; Node execution
took 2.906 within the existing 120-second wrapper/file allowance and stage time 5.354. Worker and
browser groups drain. The browser case retains 30 seconds and HTTP case ten; startup stays fifteen
and drain grace five. This native file has no generated histories, deliberate mutants, runtime
registration data or historical-source reads. New work is uncommitted, not an immutable aggregate.

The browser case now borrows validated loopback CDP through the unchanged shared owner and explicitly
creates/closes a fresh context. Both cases register nested cleanup before asynchronous service setup.
Standalone campaigns retain the helper's direct browser launch. Production code, fixture utilities,
both complete scenario bodies and identities, shared owner code, wrapper and deadlines remain unchanged.
The file uses browser evaluation directly; it builds no Vite/application UI bundle.

The first case exercises navigator.credentials create/get using a virtual ctap2 internal authenticator
with resident keys, user verification and automatic presence. HTTP begin/finish perform registration
and confirmation, and exactly one resident credential must exist. It does not separately assert the
allowCredentials list, operating-system passkey persistence or a human/hardware prompt.
The service is closed and reopened on the same SQLite path and port in the same Node process, while
the browser/authenticator remain live. Replaying the saved finish request must return the exact prior
result. This is service-object restart, not service process death, browser restart or crash recovery.

Authentication refuses while the account is pending. The fixture directly changes accounts.state to
active in SQLite, then retries the same login proof and requires account-proof. This synthetic setup
bypasses production activation, signed membership and admission; no Account content access follows.
After automatic presence is disabled, AbortSignal.timeout(150) must yield TimeoutError from a browser
credential request. Explicit service cancellation then returns cancelled and resume refuses cancelled.
This does not establish automatic UI-to-service cancellation or every late-assertion race.

The HTTP-only case requires 403 for empty Authorization, one foreign Origin and an actual hostile Host
sent with node:http. A 131,073-byte whitespace body returns 413 at the ordinary 131,072-byte JSON limit;
a subsequent valid begin returns 200. These are selected policy boundaries, not an exhaustive malformed
header/parser/streaming/denial-of-service campaign, byte-equality check for refused state, or coverage
of the separate admission/delivery body limits.

All 92 runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
The unchanged 23 Node-owner, five Vitest-process and fourteen native-owner controls retain prior
evidence, including recovery's recent profile-reopen/death controls. Generated/mutation/service-death
siblings, optional ACCOUNT_REPORT_DIR exports and whole-wrapper output/scheduling/ownership remain
separate obligations. Existing ledger orphan classification, core receive headroom, capture
map-refresh/byte-length follow-ups and historical editing/handoff deadline evidence remain visible.

All 192 prior general contracts / 1,643 identities and retired-v8 exclusions remain unchanged.
General selections contain 193 files / 1,645 cases (96 Vitest, 97 Node); Account has 87 files / 551 cases.
The 673,989-byte manifest has 612 obligations / 224 unresolved: 65 test-file (49 Node, sixteen Playwright),
96 command, 63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
The [packet](./account-conformance-runs/2026-09-14-core-native-fixture/README.md) retains complete receipts, exact patch, frozen input/browser identities,
source/helper pins, base signature, prior contracts and preservation. All 52 personal/vector pins,
L-2 and historical evidence/debts/signing backups remain unchanged. No Local content, recovery-code
preparation, authority-root distribution, real activation/admission, Account index/editor/transport or
personal/second-device adoption is performed. Next: Account activation native fixtures (five cases),
then remaining integration, R-04, P-06 and the immutable aggregate before private Account preparation.


## 2026-09-14 — Account activation native fixture integration (`L-1`)

The preceding core phase is signed and verified as `76ac103`. `activation-native-fixture` adds
one complete native file / five cases. All pass in 49.384 seconds including fingerprint work;
Node execution took 20.043 within the existing 180-second native wrapper/file allowance and stage time
22.997. Worker/browser groups drain. Every case retains 30 seconds; startup stays fifteen and drain
grace five. Product, native tests, fixtures, helpers, wrapper, owner and limits remain unchanged.
Only registration/selection, expected populations and documentation change. New work is uncommitted,
not an immutable aggregate.

The fixture chain builds promotion/genesis/admission bundles in memory and uses the existing owned-CDP
browser with fresh contexts, temporary SQLite stores, synthetic factors and early nested cleanup.
It runs Local genesis, fixed journal seeding, recovery preparation, promotion/genesis and private
activation/admission routes. Activation assertions use an exposed Node synthetic-authenticator binding;
no navigator.credentials or hardware/browser WebAuthn ceremony is used in these five cases.

Two omission controls first capture an authentic challenge at the assertion callback. The signature
case substitutes zero signature bytes; the target case reuses one target's authentic challenge for a
separately prepared target. Current code must reject with the specific error and zero prompts. Removing
the relevant check in an in-memory build must actually reach the callback once and throw prompt-reached;
the marker stays admission-offered. These controls establish refusal before assertion prompting, not
forged service acceptance. The target anchor and signature block start are unique in the reviewed
source; the removed signature span contains only its awaited verification. Anchor review is retained.

Cancellation holds an assertion callback, verifies abort propagation, starts a competing tab for the
same target and waits for a pending lock observation. Neither operation settles before release. Once
the original assertion settles, the cancelled owner has made zero finish calls and the competing owner
returns a promotion-receipt. The first returned value is not separately checked for a specific
cancellation error. This is synthetic callback settlement, not physical passkey cancellation.

Two cases actually kill renderers using Page.crash: while the assertion callback is held, or after
finish has returned its HTTP reply but before delivery to the caller. New pages in the same context
recover promotion-receipts. The first needs one assertion; the committed lost-finish case needs none.
The test compares against the captured reply when truthy; it does not separately assert capture presence.
Browser and service processes remain live. No complete profile restart or physical power loss is induced.
The fixed seeded writing is not independently reconstructed after activation, and the later Account
index handoff is not performed by this native file.

There are no generated histories or shrinking here; the wrapper's 120-history claim belongs to its
separate core stage. Shared helpers contain optional historical readers but only baseline bundles are
called, so no historical-source input is needed. Optional ACCOUNT_REPORT_DIR JSON exports, wrapper
XML/reproduction/scheduling/ownership and service-only cryptographic/history controls remain separate.

All 92 runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged 23 Node-owner, five Vitest-process and fourteen native-owner controls retain prior evidence.
Existing ledger orphan classification, core receive headroom, capture map-refresh/byte-length follow-ups
and historical editing/handoff deadline evidence remain visible. All 193 prior general contracts /
1,645 identities and retired-v8 exclusions remain unchanged. General selections contain 194 files /
1,650 cases (96 Vitest, 98 Node); Account has 88 files / 556 cases. The 675,149-byte manifest has 612
obligations / 223 unresolved: 64 test-file (48 Node, sixteen Playwright), 96 command, 63 campaign.
All eleven catalogues remain resolved (163 cases / 54 mutations).

The [packet](./account-conformance-runs/2026-09-14-activation-native-fixture/README.md) retains complete receipts, control-anchor review, exact patch, frozen input/
browser identities, source/helper pins, base signature, prior contracts and preservation. All 52
personal/vector pins, L-2 and historical evidence/debts/signing backups remain unchanged. No human
confirmation wording, OS passkey, general membership/revocation, Account index/editor/transport,
personal/second-device adoption or deployment follows. Next: Account service inbound native fixture
(one case), then remaining integration, R-04, P-06 and the immutable aggregate before private Account prep.


## 2026-09-14 — Account service inbound native fixture integration (`L-1`)

The preceding activation phase is signed and verified as `bc536f3`. `service-inbound-native-fixture`
adds one complete file / one case. It passes in 46.865 seconds including fingerprint work;
Node execution took 15.488 within the existing 90-second native wrapper/file allowance and stage time
19.272. Worker/browser groups drain; a targeted post-run process check finds the browser gone.
The case retains sixty seconds, startup fifteen and drain grace five. Product, native tests, helpers,
wrapper, owner and limits remain unchanged. Only registration/selection, expected populations and
documentation change. New work is uncommitted, not an immutable aggregate.

The fixture uses in-memory builds, the existing owned-CDP browser, a temporary service database and
synthetic credentials. One selected Account creates and submits two envelopes through its browser-owned
delivery workspace. Its storage-only receive owner signs v2 read requests and verifies/persists original
service response bytes. Reads travel through Node fetch with an explicit Origin header. This exercises
service HTTP interoperability with the browser-owned receiver, not browser receive transport, CORS
or automatic polling/reconnect. It publishes and receives the same workspace's own stream, not a second
device's independently created content.

The v1 endpoint and zeroed v2 read signature return 409. Foreign Origin, wrong content type and wrong
bearer return 403; a 4097-byte request returns 413. These checks assert statuses, not independent
before/after service-state equality or exhaustive bounds. Two single-entry pages preserve the exact
original submission envelope bytes, through=2 and successive next positions 1 and 2. The independent
helper extracts envelope bytes; production code decodes the pages and verifies them. The independent
v1 page-proof oracle is not called.

Repeating each signed query returns identical bytes. The duplicate final page reports duplicate and
the receive cursor is 2. Despite the source comment, this does not inject a lost HTTP response or check
that a service database census stays unchanged. Closing the owner and replacing its page in the same
browser context recovers cursor 2; the next read reports empty. No renderer/browser/service process
crash or fresh profile is induced, and recovered visible writing is not independently compared.
Both envelopes were already created locally; this is not reconstruction solely from downloaded pages.

No generated histories, omission controls or historical readers run in this native file. Shared helper
branches for historical readers/mutations are not called. Complete wrapper execution, service-only
histories/controls/restart cuts, report outputs and reproduction remain separate obligations.

All 92 runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged 23 Node-owner, five Vitest-process and fourteen native-owner controls retain prior evidence.
All 194 prior general contracts / 1,650 identities and retired-v8 exclusions remain unchanged.
General selections now contain 195 files / 1,651 cases (96 Vitest, 99 Node); Account has 89 files /
557 cases. The 675,744-byte manifest retains 612 obligations / 222 unresolved: 63 test-file
(47 Node, sixteen Playwright), 96 command and 63 campaign. All eleven catalogues remain resolved
(163 cases / 54 mutations). These are integration obligations, not defect counts.

The [packet](./account-conformance-runs/2026-09-14-service-inbound-native-fixture/README.md) retains complete receipts, exact patch, frozen input/browser identities,
source/helper pins, base signature, prior contracts and preservation. All 52 personal/vector pins,
L-2 and historical evidence/debts/signing backups remain unchanged. Existing ledger orphan
classification, core receive headroom, capture map-refresh/byte-length follow-ups and historical
editing/handoff deadline evidence remain open. Next: Account delivery-oracle native fixture, six
cases including two controls; its computed names need registration review. Remaining integration,
R-04 and P-06 precede the immutable aggregate and private Account preparation.


## 2026-09-14 — Account delivery-oracle native fixture integration (`L-1`)

The preceding service inbound phase is signed and verified as `a946620`.
`delivery-oracle-native-fixture` adds one complete file / six cases: refusals and final heads in both
orders, plus two forward-order mutation controls. All pass in 143.695 seconds including fingerprint
work; Node execution took 113.095 within the existing 120-second native wrapper/file allowance and
stage time 117.760. Only 6.905 seconds of Node headroom remains; retain this at the loaded-host gate.
Worker/browser groups drain. Every case retains sixty seconds, startup fifteen and
drain grace five. Product, native tests/helpers, owner, wrapper and limits remain unchanged.
New integration work is uncommitted, not an immutable aggregate.

Static registration previously refused the fixture's string-plus-boolean titles. A small finite-data
interpreter extension admits string/boolean concatenation in either order; boolean arithmetic,
object/function coercion, dynamic calls and null/undefined concatenation still refuse. The new generated
test fails before repair and passes 160 populations afterward for both Node and Vitest. Six exact
native identities are explicitly pinned; all 195 prior general contracts / 1,651 identities are unchanged.
No test/helper module is executed during planning, and no historical/data input is needed for these
inline declaration loops.

The native fixture uses in-memory builds, owned CDP, temporary service custody and a synthetic Account.
Its independent Node signer opens the fixture's acceptance seal and creates contradictory proofs;
these are not claims issued by the live HTTP service state machine. The import-free constraint reference
predicts accepted prefix, first refusal identity, first final cutoff, conflict/publication and exact
submission/response wires. A unique test-only observation hook copies those fields from describeDelivery
in baseline and mutant builds. Native assertions compare the full state after proofs, orderly page
replacement and compaction. Shared active delivery code is exercised; retired-v8 exclusions stay intact.

Two unique, single-hit mutations replace the first refusal identity or first final cutoff with the last.
Each control must differ from the full-state reference after the second proof while publication remains
conflict; a positive mismatch count is required. The assertion does not separately name the wrong field;
the constrained mutation and retained anchor review identify the intended defect. Baselines must match.

After closing the editor, the logical authenticated ledger census checks original heads/outbound rows,
exact retained response-wire order and a witness event increase of one per retained proof. Duplicates
and later terminal claims report recorded=false. The census does not compare physical ciphertext files
or assert its returned counter. Visible master text, original envelopes and each original capture are
compared across reopen/compaction. Additional captures must have the expected principal/human actor and
empty [0,0] updates; they are not forbidden by count. The instrumented done/env/v2 encryption invocation
count stays unchanged after preparation; this does not mean zero disk writes or all crypto activity.

Cold closes a page and opens another in the same context. There are no renderer/browser/service crash
cuts, fresh-profile restores, generated native histories or historical readers. Wrapper outputs,
service-issued decision composition, finite-world/oracle histories and broader vector/control campaigns
remain separate obligations.

All 93 pure runner checks, five current Vitest-process controls, direct TypeScript, scoped style,
planning, authority and signatures pass. Unchanged 23 Node-owner and fourteen native-owner controls
retain earlier evidence. General selections contain 196 files / 1,657 cases (96 Vitest, 100 Node);
Account has 90 files / 563 cases. The 677,364-byte manifest retains 612 obligations / 221 unresolved:
62 test-file (46 Node, sixteen Playwright), 96 command and 63 campaign. All eleven catalogues remain
resolved (163 cases / 54 mutations). These are integration obligations, not defect counts.

The [packet](./account-conformance-runs/2026-09-14-delivery-oracle-native-fixture/README.md) retains full receipts, the pre-repair counterexample, control anchors, exact
patch, frozen input/browser identities, source/helper pins, base signature, prior contracts and
preservation. All 52 personal/vector pins, L-2 and historical evidence/debts/signing backups remain
unchanged. Ledger orphan classification, core receive and delivery-oracle headroom, capture map-refresh/byte-length
follow-ups and historical editing/handoff deadline evidence remain open. Next: Account parser-conformance
native fixture, one case; then remaining integration, R-04, P-06 and the immutable aggregate before
private Account preparation.


## 2026-09-14 — Account parser-conformance native fixture integration (`L-1`)

The preceding delivery-oracle phase is signed and verified as `ed48158`.
`parser-conformance-native-fixture` adds one complete native file / one case. It passes in 28.975
seconds including fingerprint work; Node execution took 2.598 within the existing 120-second native
wrapper/file allowance and stage time 5.119. Worker/browser groups drain. The case retains thirty
seconds, startup fifteen and drain grace five. Product, native tests/helpers, registration interpreter,
owner, wrapper and limits are unchanged. Only selection/registration, expected populations and docs
change. New integration work is uncommitted, not an immutable aggregate.

The native case writes eight internal samples to real IndexedDB: one structurally valid v9
account-receiving record and seven malformed variants. They remain one reporter case. The fixture
comes from the independent promotion-contract builder; typed byte arrays are reconstructed in the
browser before storage. After closing and reopening the database connection, the case checks that
index-1 holes remain absent in credentials, genesis.actors and genesis.wraps. It requires the positive
to parse and all seven variants to throw. Array-wrapped stage, promotionId, requestDigest and epochHead
are the other four malformed variants.

The entrypoint is current parsePromotion, including nested genesis/handoff parsers. This is structural
refusal after storage, not promotion authentication, MAC/signature verification, selected workspace
startup or writing recovery. The positive has synthetic placeholder credentials and a zero MAC;
acceptance means structural validity only. No exact parser error or parsed-output equality is asserted.
The test title's cold readback is a database connection reopen in the same page/JavaScript realm.
It does not restart the page, browser or service, inject a crash, or copy a profile.

The existing promotion fixture supplies owned CDP, a disposable context, temporary loopback service
databases and early nested cleanup. Its Local creation, account registration, recovery preparation
and promotion methods are not called. Vite bundles stay in memory. No generated histories, omission
controls or historical transforms execute. The complete wrapper's six-parser matrices, old-parser
comparison, controls, vectors, reporting and reproduction remain separate obligations. Shared helpers'
optional git-show branches do not create historical inputs for this baseline browser bundle.

All 93 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged 23 Node-owner, fourteen native-owner and five Vitest-process controls retain earlier evidence;
the Vitest evidence comes from the preceding signed phase with the current registration interpreter.
All 196 prior general contracts / 1,657 identities and exclusions remain unchanged. General selections
now contain 197 files / 1,658 cases (96 Vitest, 101 Node); Account has 91 files / 564 cases.
The 677,982-byte manifest retains 612 obligations / 220 unresolved: 61 test-file (45 Node, sixteen
Playwright), 96 command and 63 campaign. All eleven catalogues remain resolved (163 cases /
54 mutations). These are integration obligations, not defect counts.

The [packet](./account-conformance-runs/2026-09-14-parser-conformance-native-fixture/README.md) retains complete receipts, exact patch, frozen input/browser identities,
source/helper pins, base signature, prior contracts and preservation. All 52 personal/vector pins,
L-2 and historical evidence/debts/signing backups remain unchanged. Ledger orphan classification,
core receive and delivery-oracle headroom, capture map-refresh/byte-length follow-ups and prior
editing/handoff deadline evidence remain open. Next: Account promotion-contract native fixture,
three cases; then remaining integration, R-04, P-06 and the immutable aggregate before private
Account preparation.


## 2026-09-14 — Account promotion-contract native fixture integration (`L-1`)

The preceding parser-conformance phase is signed and verified as `85d964a`.
`promotion-contract-native-fixture` adds one complete native file / three cases. It passes in 36.446
seconds including fingerprint work; Node execution took 8.325 within the existing 180-second native
wrapper/file allowance and stage time 10.860. Worker/browser groups drain; the recorded disposable
browser PID is absent afterward. Cases retain sixty seconds, startup fifteen and drain grace five.
Product, runtime helpers, registration interpreter, owner, wrapper and limits are unchanged.
New runner integration and a native control repair are uncommitted, not an immutable aggregate.

The fixture creates synthetic Local custody, registers an Account, confirms recovery and prepares
promotion through the existing owned CDP context and temporary loopback service. In-memory Vite
exports expose test signing and digest seams. Each input restores the saved prepared marker before
directly installing a test row. All reads occur in the same page.

The first case checks thirteen stage/version carriers from v1 through v9. Correct-MAC records must
return their expected stage through readPromotion; changing the marker ID afterward must cause the
exact authentication failure. Nested genesis/admission/handoff payloads are fixture substitutions,
not completed service-authorized transitions. This tests the shared reader's carrier grammar, MAC
and source binding, not nested proof authorization, index selection or cold writing reconstruction.
Reading a v8 carrier does not restore retired-v8 product support.

The second case authenticates ten source, budget and credential-collision lies. Current code rejects
each with the exact source-or-budget refusal; an in-memory omission of that one guard accepts each.
The source-generation comparison exists but is not independently varied by this native case.
The third case omits three HMAC-message bindings: marker ID, pending confirmation receipt ID and
v9 handoff destination promotion ID. Baseline reads refuse. A verification hook removes the matching
field and delegates to the original WebCrypto verifier; the read must accept and the interception
counter must be positive. The hook does not return true unconditionally and is restored in finally.

Review found a real control weakness: assigning a fixed leading `a` to a receipt already beginning
with `a` made no change. A saved source-extraction check reproduces that defect in the signed base.
All three binding substitutions now toggle the first character and assert inequality. The native
pending case deliberately starts with `a` before signing, exercising the old no-op edge every run.
The repaired substitution passes 160 generated input sets (seed 140902), checking actual change and
valid-width identifier alphabets across three prefixes and target paths. This is fixture hardening,
not evidence of a production protocol defect. The generated check is supplementary saved evidence;
the native test retains the deterministic edge and guard. Reporter identities remain three cases.

All 93 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged 23 Node-owner, fourteen native-owner and five Vitest-process controls retain prior evidence.
All 197 prior general contracts / 1,658 identities and exclusions remain unchanged. General selections
now contain 198 files / 1,661 cases (96 Vitest, 102 Node); Account has 92 files / 567 cases.
The 678,973-byte manifest retains 612 obligations / 219 unresolved: sixty test-file (44 Node, sixteen
Playwright), 96 command and 63 campaign. All eleven catalogues remain resolved (163 cases /
54 mutations). These are integration obligations, not defect counts.

The [packet](./account-conformance-runs/2026-09-14-promotion-contract-native-fixture/README.md) retains receipts, exact patch, frozen input/browser identities, source/helper
pins, base signature, generated before/after evidence and preservation. No native generated histories,
crashes or historical readers run. Wrapper matrices, broader vectors/controls and report postconditions
remain separate obligations. All 52 personal/vector pins, L-2 and historical evidence/debts/signing
backups remain unchanged. Ledger orphan classification, core receive/delivery-oracle headroom,
capture oracle follow-ups and prior deadline evidence remain open. Next: Account checkpoint-contract
native fixture, four cases; then remaining integration, R-04, P-06 and the immutable aggregate before
private Account preparation.


## 2026-09-14 — Account checkpoint-contract native fixture integration (`L-1`)

The preceding promotion-contract phase is signed and verified as `b3b70d8`.
`checkpoint-contract-native-fixture` adds one complete native file / four cases. It passes in 146.819
seconds including fingerprint work; Node execution took 114.457 within the existing 300-second native
wrapper/file allowance and stage time 119.122. Worker/browser groups drain; the recorded disposable
browser PID is absent afterward. Three directed cases retain forty seconds and the generated case
120 seconds; startup retains fifteen and drain grace five. Product, native tests/helpers, registration
interpreter, owner, wrapper and limits are unchanged. New integration work is uncommitted and does
not qualify an immutable aggregate.

The fixture creates synthetic Local custody, Account recovery and real temporary-service admission/
handoff. Its startup setup navigates the existing page to the fixture origin, replacing the JavaScript
realm and reinstalling in-memory bundles and hooks while retaining storage. Browser/context/service
stay alive. This exercises persisted startup after navigation, without a crash, profile copy or power loss.

The byte case independently unwraps the synthetic generation key and reproduces the genesis
ciphertext through Node/OpenSSL LP, HKDF and AES-GCM oracles. A repeated genesis call returns the same
candidate with one observed seal. Startup succeeds with fetch disabled and no recovery code. It leaves
serialized IndexedDB/localStorage inventory unchanged and checks decrypt-only non-extractable key
usage, KDF info/salt, checkpoint AAD/ciphertext/tag length, no new seals and zeroed observed temporary
buffers. Removing workspace from startup KDF info makes startup refuse. Instrumentation covers
checkpoint operations and observed buffers, not the whole heap, key-store representation or filesystem.

The coverage case deletes journal writing from a selected destination, then erases content and journal
from an active destination. Baseline startup must refuse with the exact retained-source error without
changing inventory. Omitting the corresponding selected/active coverage predicate accepts each damaged
state. Restoring the journal recovers classification; a later admitted edit is compared after editor
close/navigation/open. Together with startupWorkspace these are three uniquely anchored, executed
source controls, not additional reporter cases.

The authority case recomputes a local marker MAC around five damaged fields: receipt signature,
candidate signature and checkpoint salt, nonce or ciphertext. Every input refuses before observed
checkpoint operations and leaves inventory unchanged. Restoring the marker accepts; a wrong authority
pin separately refuses. These generic refusal assertions leave nested service proofs unauthenticated;
they do not isolate every verifier or establish GCM refusal of a fully reauthorized changed checkpoint.

The final case runs 24 shrinking-enabled histories with seed 5110932. Generated insert/delete operations
choose database or journal persistence and optional reversed delivery, with a mandatory journal-only
operation. Each history and shrink attempt uses a new scope. An independent string-splice calculation
checks seeded master text; admission/handoff and reloaded startup succeed. Removing the journal must
refuse without inventory change; restoring it permits classification. Generated histories do not open
the final editor to compare full cards/metadata independently of production coverage checks.
No failure or shrink was observed. Optional wrapper report JSON/history arrays are not emitted because
this selection leaves ACCOUNT_REPORT_DIR unset; fixed source/seed and reporter receipts are retained.

All 93 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
The initial pure log retains two corrected integration bookkeeping failures: a nonexistent blocked-file
example and a missing five-minute expected deadline. Unchanged 23 Node-owner, fourteen native-owner
and five Vitest-process controls retain prior evidence. All 198 prior general contracts / 1,661 identities
and exclusions remain unchanged. General selections now contain 199 files / 1,665 cases (96 Vitest,
103 Node); Account has 93 files / 571 cases. The 680,137-byte manifest retains 612 obligations /
218 unresolved: 59 test-file (43 Node, sixteen Playwright), 96 command and 63 campaign. All eleven
catalogues remain resolved (163 cases / 54 mutations). These are integration obligations, not defects.

The [packet](./account-conformance-runs/2026-09-14-checkpoint-contract-native-fixture/README.md) preserves receipts, exact patch, frozen source/browser identities, helper/control
pins, base signature and preservation. No historical transforms or optional vector-file reads execute.
Complete wrapper matrices, broader regressions and vector/report postconditions remain separate.
All 52 personal/vector pins, L-2 and historical evidence/debts/signing backups remain unchanged.
Existing ledger orphan classification, receive/delivery-oracle headroom, capture oracle follow-ups
and deadline evidence remain open. Next: Account counter-contract native fixture, five cases; then
remaining integration, R-04, P-06 and the immutable aggregate before private Account preparation.


## 2026-09-14 — Account counter-contract native fixture integration (`L-1`)

The preceding checkpoint-contract phase is signed and verified as `3ea2c19`.
`counter-contract-native-fixture` adds one complete native file / five cases. It passes in 47.159
seconds including fingerprint work; Node execution took 12.285 within the existing 300-second native
wrapper/file allowance and stage time 16.829. Worker/browser groups drain; the recorded disposable
browser PID is absent afterward. Cases retain forty seconds, startup fifteen and drain grace five.
Product, runtime/crypto helpers, interpreter, browser owner and wrapper remain unchanged. The fixture's
setup/cleanup changes; all five test bodies and identities remain byte-identical. New work is uncommitted
and does not qualify an immutable aggregate.

The fixture previously launched Chromium directly and registered cleanup only after successful launch.
It now borrows owned CDP through the existing openFixtureBrowser helper, creates an explicit isolated
context for each of seven instances and registers cleanup before listening or connecting. Nested finally
blocks attempt context, browser connection and loopback server closure despite earlier failures; listen
errors reject setup. Standalone launch remains available outside the runner through the shared helper.
A saved source-extraction probe reproduces the old setup leak with mocked resources; nine current
setup/teardown/success scenarios pass. Those mocks verify cleanup ordering, not whether a failed native
close releases resources. Eight existing real browser-owner controls also pass, including isolated
Account reconnect, deadlines, cancellation and worker/browser death. Their evidence is retained.

The native fixture enrolls synthetic custody and initializes a content store with a no-op creation
check. Its server serves fixture HTML; it does not provision an Account service or admission receipt.
Node/OpenSSL independently derives the metadata key and verifies a browser HMAC probe, counter v1/v2
MACs and initialization witness MACs. The non-ASCII slot exercises UTF-8 length-prefix encoding.
Browser key traces check exact info, empty salt, non-extractability and sign/verify usage. One spool
event survives navigation/reconfiguration, and an ordinary content reader refuses the v2 counter.
Root ID is authenticated in the payload rather than included in the selected metadata KDF info.

Eight correctly MACed allocation/witness lies refuse: counter intent, active generation, range,
spool hash/count, reservation ceiling and witness intent/state. Restoring originals permits one-row
readback after navigation. These generic refusal checks do not isolate each sub-check or prove that
all storage is unchanged. The transaction-abort case burns one reservation while keeping the spool
counter witness equal and committing no event. Retry consumes another reservation and commits one
event. Metadata readwrite transactions request and report strict durability; physical power loss is
not tested. The checked witness here is the spool witness in the counter, not every custody field.

Two uniquely anchored source controls demonstrate ordering. Removing the MAC portion of equalCounter
lets an event overwrite a counter whose stored MAC changes after authentication; baseline rejects with
an authentication error and the race hook must run. Skipping durable reservation lets AES execute once
without a persisted allocation; the later rewind guard still refuses. Baseline also invokes AES once,
with allocation already present. This control distinguishes allocation-before-encryption from eventual
refusal. The races are deterministic in-page interleavings, not multi-tab scheduling histories.

Navigation replaces the page realm while keeping its context, browser and server alive. Synthetic
factor/generation values retained by the Node fixture are reconfigured explicitly. No native generated
histories, renderer crashes, profile restores or historical readers run. ACCOUNT_REPORT_DIR is unset;
optional native wrapper reports are not emitted. Full format/vector controls, spool/receive regressions,
report postconditions and immutable aggregate qualification remain separate obligations.

All 93 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
The prior 23 Node-owner, fourteen native-owner and five Vitest-process controls retain historical
evidence, supplemented by the current eight browser-owner controls. All 199 prior general contracts /
1,665 identities and exclusions remain unchanged. General selections now contain 200 files / 1,670
cases (96 Vitest, 104 Node); Account has 94 files / 576 cases. The 681,463-byte manifest retains
612 obligations / 217 unresolved: 58 test-file (42 Node, sixteen Playwright), 96 command and 63 campaign.
All eleven catalogues remain resolved (163 cases / 54 mutations). These are integration obligations,
not defect counts.

The [packet](./account-conformance-runs/2026-09-14-counter-contract-native-fixture/README.md) preserves receipts, exact patch, frozen source/browser identities, control/helper
pins, cleanup reproduction, owner evidence, base signature and preservation. All 52 personal/vector
pins, L-2 and historical evidence/debts/signing backups remain unchanged. Existing ledger orphan
classification, receive/delivery-oracle headroom, capture oracle follow-ups and deadline evidence stay
open. Next: Account store-contract native fixture, three cases; then remaining integration, R-04,
P-06 and the immutable aggregate before private Account preparation.


## 2026-09-14 — Account store-contract native fixture integration (`L-1`)

Counter-contract is signed and verified as `9a5bf1d`. The store-contract selection adds one complete
native file / three cases, passing in 33.535 seconds including fingerprinting.
Node execution takes 5.683 of the existing 300-second file bound;
stage time is 8.298. Cases retain forty seconds. Worker and browser
groups drain, and the recorded browser PID is absent afterward.

Independent Node HKDF/AES and noble XChaCha checks verify all seeded record/journal bytes, KDF info,
identity encoding and key properties. Page navigation followed by explicit synthetic custody
reconfiguration recovers the data; a fresh writer adds a third journal entry, and flush preserves
all seven fixed frames while emptying the journal. Five record alterations and three journal-key
alterations refuse. The latter case reopens sessions within the same page; it is not a browser restart.
One checked source control removes storeId from the real custody KDF. Its local roundtrip succeeds,
but the independent byte oracle detects incompatible ciphertext.

Fixture setup now borrows owned CDP and creates an isolated context, with early nested cleanup and
listen-error rejection. This lifecycle block is byte-identical to the signed counter fixture; its nine
modeled cleanup and eight real browser-owner controls retain pinned prior evidence, without rerunning.
The previous store fixture already registered server cleanup before launch; no prior setup leak is
claimed here. All three test bodies, product, runtime/crypto helpers, owner, interpreter and wrapper
remain unchanged. Synthetic custody is directly initialized; no Account admission service, generated
histories, crash cuts, physical power-loss checks or historical readers run. Optional wrapper reports
are not emitted. Full vector/format/wrapper and immutable aggregate qualification remain separate.

All 93 pure runner checks, TypeScript, scoped style, inventory, manifest, authority and signatures pass.
All 200 prior general contracts / 1,670 identities and exclusions are unchanged. General selections
now contain 201 files / 1,673 cases (96 Vitest, 105 Node); Account has 95 files / 579 cases.
The 682,490-byte manifest has 612 obligations / 216 unresolved: 57 test files
(41 Node, sixteen Playwright), 96 commands and 63 campaigns. All eleven catalogues remain resolved
(163 cases / 54 mutations). These are integration obligations, not defect counts.

The [packet](./account-conformance-runs/2026-09-14-store-contract-native-fixture/README.md) retains receipts, exact patch, frozen source/browser identities, control/helper
pins, prior owner evidence, base signature and preservation checks. All 52 personal/vector pins and
L-2 remain unchanged. Existing ledger orphan classification, receive/delivery-oracle headroom, capture
oracle follow-ups and earlier deadline evidence remain open. Next: local custody/provenance fixtures,
then the remaining Account suites in bounded signed groups under the current authorization. Stop if
signing blocks; do not commit unsigned. R-04, P-06 and the immutable aggregate precede private Account
preparation; this selection does not qualify that aggregate.


## 2026-09-14 — Account Local provenance native fixture integration (`L-1`)

Store-contract is signed and verified as `fdcf265`. Local provenance adds one complete native file /
four cases, passing in 99.288 seconds including fingerprinting. Node execution takes
68.767 of the existing 300-second file bound; stage time is
72.784. Case limits remain 60/30/30/90 seconds, startup fifteen and
drain grace five. Worker/browser groups drain; the recorded disposable browser PID is absent afterward.

Independent factor opening, HKDF and HMAC encoders verify fresh/imported/cleanup-v1/v2 Local claim bytes.
The fixture then performs real preparation/genesis/admission/handoff and navigates to Account startup.
It preserves exact claims and inventory without network or calls into four guarded clear/import/source/
fingerprinting entry points; direct probes prove the throwing barriers work. Imported and cleanup
claims are synthetically factor-authenticated, so this validates their consumption, not migration or
source cleanup creation. The disposable Account service and software authenticator do not qualify
human passkey/PRF behavior or a real Account admission receipt.

One checked source control omits claim-MAC refusal. Before promotion, the baseline rejects a changed
MAC while the omission admits preflight; after handoff, marker binding still prevents the omission
from accepting the changed winning claim. Three preactive import/clear marker specimens block startup
without measured inventory changes. Twenty shrinking-enabled histories at seed 5110941 vary cleanup
version/progress and changed provenance fields; authentication refusal preserves inventory, and exact
restoration permits Account startup. No failure or shrunk counterexample was observed. Navigation
replaces the page realm while retaining the browser/context/service; no crash, power-loss or profile
restore campaign is claimed.

Only six runner/registration-test files and generated snapshots change. Product, test bodies, fixture
chain, runtimes/oracles, interpreter, reporter, owner and wrappers are unchanged. Optional native
wrapper JSON reports are not emitted; full vector/format/wrapper and immutable aggregate qualification
remain separate. All 93 pure runner tests, TypeScript, scoped style, planning, authority and signatures
pass. Prior owner controls retain pinned evidence rather than a new run. All 201 prior general
contracts / 1,673 identities and exclusions are unchanged. General selections now contain 202 files /
1,677 cases (96 Vitest, 106 Node); Account has 96 files / 583 cases. The 683,630-byte
manifest has 612 obligations / 215 unresolved: 56 test-file (40 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations). These are integration
obligations, not defect counts.

The [packet](./account-conformance-runs/2026-09-14-local-provenance-native-fixture/README.md) retains exact receipts/patch, frozen sources/browser identities, source-control
anchors, prior owner evidence, signed base and preservation checks. All 52 personal/vector pins, L-2
and historical evidence/debts/signing backups remain unchanged. Existing ledger orphan classification,
receive/delivery-oracle headroom, capture oracle follow-ups and earlier deadline evidence remain open.
Next: local-custody registration and ownership. Its nested Node subtests are deliberately refused by
the current census/reporter, so they need a separate bounded disposition; the refusal policy was not
relaxed here. Continue the other Account suites with signed intermediate commits under the current
user authorization, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account Local custody native fixture integration (`L-1`)

The preceding phase is signed and verified as `8fed0da`. **Account Local custody native fixture** adds 1 complete
file(s) / 5 cases. The selection passes in 31.729 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-local-custody-native-fixture/README.md).

The former two nested comparison scenarios are promoted to named top-level cases; their empty
container disappears. First-three test bodies remain byte-identical. Normalized AST comparison
preserves both promoted assertion bodies after context/evidence-variable renames. The pair's former
40-second shared allowance becomes 20 seconds each; the other cases retain forty seconds and the
file retains 300. A modeled execution of old/new scenario registration confirms the passing combined
standalone report is unchanged. Actual optional report files are not emitted by this selection.

Fixture setup now borrows owned CDP with explicit isolated contexts and early nested cleanup. The
lifecycle block matches the signed store/counter fixtures; prior cleanup/owner evidence is pinned,
not rerun. The old custody fixture already had server cleanup registered before browser launch.
Product, runtime/oracle/browser helpers, interpreter, reporter, owner and wrapper remain unchanged;
general nested-test registration still refuses.

Independent factor/HKDF/AES/HMAC/public-key checks establish persisted custody bytes and native key
properties. Correctly authenticated wrong private-key pairs refuse; signing/wrapping correspondence
omissions permit opening. Changed metadata refuses until its authentication guard is omitted, and a
wrong factor preserves the record. Array/boxed-string states refuse at parsing; the coercion control
accepts their parser shape but the ordinary owner still refuses creation-pending. No authority bypass
is claimed from that parser defect.

The real stored-MAC race fires in both promoted scenarios. Baseline remains creating and performs
zero root encryptions; omitting the MAC comparison completes protected custody with three. Five
uniquely anchored mutant bundles execute. Logical zeroing of observed owned temporary buffers passes;
this does not establish physical heap erasure or whole-profile secrecy. Synthetic custody is directly
enrolled with a no-op creation check; no real Account service/admission, human passkey/PRF, generated
histories, crash/profile restore or power-loss campaign runs. Navigation retains the browser/context.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 202 prior general contracts / 1,677 identities and exclusions remain unchanged.
General selections now contain 203 files / 1,682 cases (96 Vitest,
107 Node); Account has 97 files / 588 cases.
The 684,946-byte manifest retains 612 obligations / 214 unresolved:
55 test-file (39 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account admission bounds. There are 26 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account admission bounds native fixture integration (`L-1`)

The preceding phase is signed and verified as `474aeaa`. **Account admission bounds native fixture** adds 1 complete
file / 6 cases. The selection passes in 55.543 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-admission-bounds-native-fixture/README.md).

All six native test bodies and identities remain unchanged, with the existing 180-second file bound
and 60/60/30/30/30/30-second case limits. Node execution took 27.837 seconds and the stage 31.733.
The inherited fixture owns isolated Chromium contexts and disposable loopback Account services;
software authentication and synthetic custody do not qualify a human passkey/PRF ceremony or a real
Account receipt. Fresh-page retry closes/replaces the page within the same live browser/context/service.

Two deterministic Yjs stress specimens use 12,000 writer incarnations or delete ranges, producing
admitted state-vector/delete-set coverage above 32,767 bytes. Independent Node/OpenSSL signature,
recovery/HPKE and checkpoint opening checks replay the plaintext and derive matching coverage without
pending dependencies. The oracle shares the installed Yjs implementation; it is not an independent
CRDT implementation. Retry preserves exact receipt, marker and measured inventory.

Two correctly signed and root-MACed false coverage claims pass cryptographic verification but are
refused as changed retained completions, before any finish submission and without measured carrier/
storage changes. Historical modules refuse current v2 state; the current owner refuses a genuine
historically generated v1 offered carrier without changing it. A one-anchor COVERAGE_LIMIT=32 control
with a 100-writer specimen refuses before admission begin or requested-carrier writes. That reduced
bound checks ordering, not the exact production-size frontier. No native fast-check histories,
renderer/service crashes, power-loss or profile-restore tests run in this selection.

Both historical files from 6398e33da4fd4b5b413de23078a04707557599bf enter the receipt contract:
account-protocol/admission.ts and src/crdt/promotionAdmission.ts. The latter exact path is added to the
historical-input allowlist. Fixture Git reads gain five-second and 2 MiB limits; bundles require two
historical substitutions. These are two old modules composed with current dependencies, not a complete
historical app or support for shipping retired v8 paths. Product, native cases, browser/oracle/history
helpers, inherited owners, census, reporter and wrapper remain unchanged.

All 23 Node-owner checks pass, with ten historical path variants covering prelaunch/reuse/midrun drift
and replanned receipt separation. Thirty historical receipts remain in raw control output and the
owner log; this packet also archives all stage artifacts for the new path's three receipts. During-run
changed history fails even when the test itself passes, with groups drained. This does not resolve the
earlier ledger orphan classification. Prior native/Vitest owner evidence stays pinned rather than rerun.
Optional native wrapper reports are disabled; full protocol/vector/generated campaigns, wrapper output
postconditions and aggregate qualification remain separate.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 203 prior general contracts / 1,682 identities and exclusions remain unchanged.
General selections now contain 204 files / 1,688 cases (96 Vitest,
108 Node); Account has 98 files / 594 cases.
The 686,736-byte manifest retains 612 obligations / 213 unresolved:
54 test-file (38 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account reservation durability. There are 25 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account reservation durability fixtures integration (`L-1`)

The preceding phase is signed and verified as `fa9f782`. **Account reservation durability fixtures** adds 3 complete
files / 20 cases. The selection passes in 69.247 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-reservation-durability-fixtures/README.md).

Three complete files preserve 3 model, 15 native and 2 network-attempt cases. All retain their
300-second wrapper/file bounds and original case limits. Node/stage timings are recorded per file.
Only native setup/cleanup is adapted to owned CDP and isolated contexts; its lifecycle block matches
the signed store/counter fixture through context creation. All test bodies and identities, product,
runtimes/browser helpers, wrappers, census, reporters and ownership helpers remain unchanged.

The pure allocation model passes 4,000 histories at seed 150915, up to 300 commands, with independent
committed/flushed/invoked/retained counts, two actors and three domains. Directed lifetime checks
consume sixteen invocations per domain without retaining ciphertext and require twelve refusals.
Strict completion is a persistence assumption of this model, not a measured hardware fact. Relaxed
and early policy controls produce shrunk undercounts. An auxiliary run of the unchanged model file
retains both counterexamples, seeds and shrink paths; it repeats the same population. The relaxed
history is start/complete/invoke/power; the early history fails at invoke before commitment. Neither
shrunk history is claimed globally minimal.

Actual custody/content AES follows completed strictly reported reservations. Injected failure after
real content AES burns a sequence; a modeled rollback to the latest strict snapshot retains the
count, and page reload/reconfiguration plus retry preserves two event rows. Fourteen native boundary
cases cover content/custody strict, default, relaxed, missing, throwing-getter, throwing-options and
throwing-abort modes. Strict capability permits one write-body call; unsupported modes permit none,
and asynchronous refusal settles after abort/completion. Readonly use remains available. The custody
wrapper specimens are intentionally synthetic rows, not reusable custody records.

The two spool cases count an attempt even when actual envelope encryption is abandoned, and refuse
a downgraded grant before any envelope AES. Retry succeeds with grant/invocation/stored-attempt counts
matched. These prepare local network envelopes using a synthetic Account bootstrap service; they do
not deliver to a second device. Seventeen isolated fixture instances run. Synthetic direct custody,
software authentication and browser-reported durability do not establish human PRF/passkey behavior,
physical disk flush, profile restore/clone safety, real Account admission or whole-profile secrecy.

No native fast-check histories, renderer/service crashes or physical power cuts are credited. The
4,000 histories belong to the pure model. Optional reports are unset in the owned selection; only
the auxiliary model run emits its three reports. Exact owned receipts and auxiliary report identity
are archived. Prior owner controls retain signed evidence, including the admission-bounds expansion
of historical drift checks. Broader wrapper/regression/output/aggregate qualification remains separate.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 204 prior general contracts / 1,688 identities and exclusions remain unchanged.
General selections now contain 207 files / 1,708 cases (96 Vitest,
111 Node); Account has 101 files / 614 cases.
The 691,196-byte manifest retains 612 obligations / 210 unresolved:
51 test-file (35 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account outbound. There are 22 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account outbound native fixture integration (`L-1`)

The preceding phase is signed and verified as `19dfffe`. **Account outbound native fixture** adds 1 complete
file / 2 cases. The selection passes in 33.351 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-outbound-native-fixture/README.md).

The two native test bodies and identities, inherited fixtures, product, owners, census, reporters
and wrapper remain unchanged. The complete file retains its 60-second wrapper bound, with 30/45-second
case limits. The codec case builds the actual envelope verifier in memory under Node WebCrypto.
Signature, digest and route guard omissions are uniquely anchored; each accepts the predicted bad
envelope that the baseline refuses. The private-envelope vector file is pinned in the frozen source
identity. This is a content-blind codec boundary, not relay membership, authorization or decryption.

The other case opens the lower-level Account editing fixture, delays its flush with a test-only timer
shim, and makes an outgoing observer throw. The accepted edit adds a synchronous encrypted journal
entry while the measured database remains unchanged. An actual Page.crash is observed; replacing the
page in the same live context recovers the edit. Compaction does not replay an observer installed
after reopen, and session recovery includes a state record but no outbound record.

That gap demonstrates why an asynchronous observer cannot serve as a durable outbox at this editing
boundary. It is not evidence of lost data in the completed captured/spooled sync composition, which
this fixture does not open. No Account relay or second device is connected. One renderer crash runs;
the browser, context and synthetic bootstrap service stay alive. The fixture uses generated service/
authority secrets, a software authenticator and retained synthetic factor options, not personal data,
a human PRF/passkey ceremony, a real Account receipt or a physical power-loss test.

Only six runner/registration-test files and generated snapshots change. Inherited historical-reader
branches are not selected. OUTBOUND_REPORT_DIR remains unset, so optional codec/counterexample JSON
exports are not emitted. Exact owned receipts, source/browser identities and the vector hash are
archived. Vector regeneration, complete preparation/wrapper outputs and aggregate qualification remain
separate. Prior owner controls retain pinned signed evidence, including admission-bounds drift checks.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 207 prior general contracts / 1,708 identities and exclusions remain unchanged.
General selections now contain 208 files / 1,710 cases (96 Vitest,
112 Node); Account has 102 files / 616 cases.
The 691,932-byte manifest retains 612 obligations / 209 unresolved:
50 test-file (34 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account decision composition. There are 21 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account directed decision composition fixtures integration (`L-1`)

The preceding phase is signed and verified as `02a1bfe`. **Account directed decision composition fixtures** adds 2 complete
files / 12 cases. The selection passes in 210.759 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-decision-directed-fixtures/README.md).

Twelve unchanged cases in two complete files retain five-minute wrapper/file bounds: three 45-second omission controls, three 45-second direct delivery cases, four 50-second automatic sender cases and two 50-second shared sync scheduler cases. Only six runner/registration-test files and generated snapshots change. Product, inherited fixtures, oracles, owners, census, reporters and wrapper are unchanged.

Three in-memory source mutations separately omit response persistence, closure retention or conflict state. Each anchor is unique and the transformed bundle is checked once. Genuine synthetic-service replies remain cryptographically verified. The controls observe the predicted false ready state; missing persistence is independently exposed by the retained response census. They do not forge issuer keys or bypass signature validation.

The nine directed cases cover actual loopback HTTP accepted/closed/conflict evidence, duplicate and altered-proof no-ops, cold reopen and compaction, automatic sender halts with and without a lost reply, and lane-specific shared scheduler halts. They assert exact original source rows, response bytes, service rows, prior captures and no extra seal invocation. Later Local edits remain durable while send is halted; retained halt prevents cold redispatch.

A synthetic competing signed request induces service closure or conflict. Service proofs are independently checked against the expected subject. Service and SQLite readers reopen around the cases, but no service process or renderer is killed in these two files. Cold creates a fresh page in the same live isolated browser context. Separate restart/order/generated files remain blocked.

Twelve disposable fixture instances use generated service/authority secrets, synthetic retained factor options, a software authenticator and loopback services. This is no human passkey/PRF ceremony, real Account admission, second device, personal origin/profile/build, physical power loss or whole-profile erasure test. Shared driver fixtures are dependencies; excluded retired-v8 test files are not admitted. No historical input branch is selected.

ACCOUNT_REPORT_DIR remains unset in the owned selection, so optional auxiliary decision reports are not emitted. Exact reporter cases, receipts, frozen source/browser identities and transformation hashes are retained. Full wrapper preparation/output and immutable aggregate qualification remain separate. Existing ledger orphan classification, receive/delivery-oracle headroom, capture oracle follow-ups and prior deadline evidence remain open.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 208 prior general contracts / 1,710 identities and exclusions remain unchanged.
General selections now contain 210 files / 1,722 cases (96 Vitest,
114 Node); Account has 104 files / 628 cases.
The 694,839-byte manifest retains 612 obligations / 207 unresolved:
48 test-file (32 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account decision restart, ordering and generated histories. There are 19 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account decision restart and history fixtures integration (`L-1`)

The preceding phase is signed and verified as `d0735a6`. **Account decision restart and history fixtures** adds 3 complete
files / 12 cases. The selection passes in 392.379 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-decision-history-fixtures/README.md).

Twelve unchanged cases across three complete files retain five-minute wrapper/file limits: eight restart cases at 45 seconds each, two fixed order cases at 45 seconds and one generated order case at 210 seconds, and one generated decision case at 240 seconds. Only six runner/registration-test files and generated snapshots change. Product, test bodies, inherited fixtures, oracles, owners, census, reporters and wrapper remain unchanged.

Four forked synthetic service workers actually SIGKILL themselves before/after decide-submission commit, for closed and conflict outcomes. Four actual Page.crash cuts bracket browser response persistence. Exact service replies/rows and original browser source rows are checked after reopen/retry; durable proof alone determines the cold state. Browser/context and bootstrap service stay alive during renderer cuts. These are process cuts, not browser/OS or physical power loss; retained synthetic secrets support test reopen.

Two directed arrival histories and twelve generated histories (seed 112108) compare the complete permitted proof set when a genuinely issued refusal and accepted successor arrive in either order. Generation chooses 3–8 operations from refusal/winner/restart/retry-service/compact, then appends refusal/winner/restart. The oracle requires at least one retained-only-winner and one retained-refusal-plus-winner history. Conflict remains terminal, original source/spool/envelopes remain exact, and reopening/compaction cannot reseal.

Sixteen generated decision histories (seed 112107) choose closed/conflict and 5–12 operations from deliver/lose/duplicate/invalid/edit/compact/restart, then append deliver/restart/duplicate. A genuine reply is deliberately withheld before the command sequence. Assertions check all seven operations were exercised, exact retained proof/source/service rows, durable later writing, and unchanged seal counts. These are 28 fixed-seed property histories plus two directed histories, not exhaustive order coverage.

Twelve disposable fixture instances execute: one shared by each generated property, two for fixed orders and eight for restart cases. Generated histories use fresh synthetic slots within a shared fixture. Service/authority secrets, software authenticators, factor options and competing signed requests are synthetic. No personal data/profile/origin/build, human passkey/PRF ceremony, real Account admission receipt, second device or whole-profile erasure is exercised. Excluded retired-v8 files and unselected historical source branches remain excluded.

ACCOUNT_REPORT_DIR remains unset, so optional per-history/metrics JSON files are not emitted by this selection. Reporter outcomes establish that the fixed-seed in-test assertions passed; they do not provide separately archived command-by-command traces. Exact owned receipts, case identities and source/browser pins are retained. Full wrapper preparation/output and immutable aggregate qualification remain separate.

The first pure runner check detected a newly introduced selection-order mismatch. Registration now follows the existing lexical manifest order; its failing log is retained alongside the passing rerun. No native test was run against that mistaken registration, and no product or fixture repair was needed. Prior owner/headroom/oracle observations and existing deadline evidence remain open.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 210 prior general contracts / 1,722 identities and exclusions remain unchanged.
General selections now contain 213 files / 1,734 cases (96 Vitest,
117 Node); Account has 107 files / 640 cases.
The 698,111-byte manifest retains 612 obligations / 204 unresolved:
45 test-file (29 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account failure and recovery fixtures. There are 16 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account failure and recovery fixtures integration (`L-1`)

The preceding phase is signed and verified as `d1eff10`. **Account failure and recovery fixtures** adds 3 complete
files / 5 cases. The selection passes in 48.891 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-failure-fixtures/README.md).

Five unchanged cases across three complete files retain the existing private-release native group allowance of 120 seconds per admitted file. The three admission cases and HTTP case each retain a 60-second case limit; the service case has no explicit inner timeout and is bounded by its file stage. This does not qualify the original combined 120-second wrapper stage.

Three synthetic admission transport refusals return expired once at begin/challenge/finish. The retained marker stays admission-requested for begin or admission-offered otherwise, has no receipt, and an exact retry reaches a promotion receipt. These hints never serve as authenticated receipts. No renderer crash or generated histories run in this group.

The service case throws a sentinel error from an actually reached before-commit hook. It checks an unknown/storage-unavailable response, a submit/commit diagnostic and no PRIVATE substring in the returned diagnostic list. This is a focused diagnostic redaction assertion, not a complete log/diagnostic memory bound or whole-profile privacy proof.

The HTTP case sends a one-byte invalid read-v2 request through an actual loopback service. The client returns null decision bytes and an exact invalid-request response diagnostic. This is invalid-request handling rather than an induced network/storage outage. The fixture writes its default focused http-hint report inside the disposable execution checkout; it is removed with that checkout. The exact answer/diagnostic assertions and owned reporter receipt are retained, without auxiliary JSON credit. Optional admission/service reports remain unset.

The residue fixture shared by HTTP now uses the existing owned-CDP helper and closes its explicitly created context. Nested finally blocks attempt browser, service and directory cleanup even if an earlier close fails. Standalone execution retains the original launch fallback. Test bodies, collection/matching code, service fixture, product, owners, census, reporters and wrapper remain unchanged. Full residue suites retain separate unresolved obligations; HTTP success does not qualify their privacy collectors.

Four disposable browser fixture instances plus one Node service fixture use generated secrets, software authenticators, retained synthetic factor options and private loopback services. No human PRF/passkey, real Account receipt, second device, personal profile/origin/build, physical power loss or forensic-erasure claim. Excluded retired-v8 files and unselected historical branches remain excluded.

All prior general contracts and exclusions remain unchanged; existing ledger orphan classification, receive/delivery-oracle headroom, capture oracle follow-ups and deadline evidence remain open. Exact owned receipts, source/browser pins and the changed-fixture patch are archived. Whole wrapper/output and immutable aggregate qualification remain separate.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 213 prior general contracts / 1,734 identities and exclusions remain unchanged.
General selections now contain 216 files / 1,739 cases (96 Vitest,
120 Node); Account has 110 files / 645 cases.
The 699,942-byte manifest retains 612 obligations / 201 unresolved:
42 test-file (26 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account liveness instrumentation and service-cache fixtures. There are 13 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account liveness Node fixtures integration (`L-1`)

The preceding phase is signed and verified as `b5b83ce`. **Account liveness Node fixtures** adds 2 complete
files / 6 cases. The selection passes in 39.235 seconds including
fingerprinting. Worker groups drain; this selection launches no browser.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-liveness-node-fixtures/README.md).

Six cases in two complete Node files retain their 60-second wrapper/file limits and have no explicit inner timeout. No Chromium fixture is launched. Two instrumentation checks and four service-cache cases run; three of those cache cases construct synthetic service stores. Product, cache implementation, instrumentation, probe and shared fixtures remain unchanged.

The declaration array now uses literal 65536/1048576 rather than 64*1024/1024*1024. The former arithmetic was refused by the finite registration reader. A source comparison establishes that only this declaration and its explanatory comment changed; every test body is unchanged and the two byte sizes and resulting titles are identical. The census reader is not broadened.

Instrumentation checks all thirteen current source anchors, refusal on missing/duplicate anchors, and exact clock/verification seams. A synthetic instrumented module preserves awaited completion, result and throw behavior. The probe sees expected call/size counters and a real digest, refuses stop while active, and excludes a sentinel argument from its result. These are focused instrument invariants rather than timing/performance qualification.

Two service cases submit 35 larger rows under 64 KiB/1 MiB checkpoints. Warm and cold reads match, and the cold path performs exactly 105 additional signature checks. Changed request digest and checkpoint bytes refuse until restored. A four-row case also checks changed SQL digest, account state and response bytes; the logical inventory is unchanged for the earlier read comparison.

The cache unit case checks owned bytes, context-sensitive misses, eviction after 513 keys, no caching of a 17 MiB input and clearing across in-flight work. The delayed result cannot repopulate the cleared cache. These are structural reuse and invalidation assertions, not a real Account device, browser responsiveness, physical memory census or exhaustive corruption proof.

The compact manifest grows to 701575 bytes. The writer ceiling and independent regression assertion both move from 700000 to 750000 bytes, with no schema/layout change, removed obligations or altered prior general contracts. The failed check from initially updating only the test ceiling is retained. Runtime reporter/log limits remain unchanged.

Optional liveness reports are written inside the disposable execution checkout and removed with it. Exact case assertions/outcomes, owned receipts, source identities and patch are retained; no separately retained performance reports or whole wrapper-output credit is claimed. Existing owner/headroom/oracle observations, prior deadline evidence and immutable aggregate qualification remain separate.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 216 prior general contracts / 1,739 identities and exclusions remain unchanged.
General selections now contain 218 files / 1,745 cases (96 Vitest,
122 Node); Account has 112 files / 651 cases.
The 701,575-byte manifest retains 612 obligations / 199 unresolved:
40 test-file (24 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account controlled liveness and verified-view browser fixtures. There are 11 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account controlled liveness and verified-view browser fixtures integration (`L-1`)

The preceding phase is signed and verified as `16d1612`. **Account controlled liveness and verified-view browser fixtures** adds 2 complete
files / 2 cases. The selection passes in 72.783 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-liveness-browser-fixtures/README.md).

Two complete unchanged cases retain the existing controlled file/case limits of 200/180 seconds and verified-view limits of 180/150 seconds. The shared liveness fixture now borrows the established owned-CDP browser and retains its explicitly created context for cleanup. Nested finally blocks attempt context, browser, service and temporary-directory cleanup. Standalone launch fallback remains. Product, test bodies, instrumentation, probe, oracles, census, reporters and wrapper are unchanged.

The controlled case holds genuine read-v2 and submit responses at the route boundary. A later Local edit is accepted, its explicit flush settles within the five-second test wait, and a fresh receive-status storage read completes before the response is released. The case then compares writing after cold reopen. This verifies progress under the two held HTTP boundaries, not arbitrary network schedules or a universal latency bound.

A test-only commit clock shift induces exactly three expired incoming read attempts. The receive cursor stays unchanged and diagnostics contain only code/operation/phase. Removing the shift permits automatic recovery without manual retry or an online wake. At least four distinct signed requests are observed; final status clears failure/reason, and later writing survives cold offline reopen. Timings and detailed optional diagnostics are not separately retained by the general case runner.

The verified-view case activates the independent cold verification oracle, observes positive oracle checks, then sees zero inbound-ledger and delivery-verification calls for a warm status sample. Compaction and cold reopen preserve text. Seven actual IDB changes separately alter ciphertext, nonce, content/source presence, placement, counter MAC or active generation. Every status read must reject. Restoring saved carrier bytes and reopening recovers the exact expected writing; status after close also rejects.

These are two disposable browser/service fixture instances with synthetic authority/service secrets, software authentication and retained factor options. Cold replaces the page within the live context; no process is killed. The view case restores captured test carrier bytes deliberately and is not a production restore procedure. No personal profile/origin/build, human PRF/passkey ceremony, real Account receipt, second-device adoption, physical power loss or whole-profile erasure is exercised.

Measurement transforms and clock seams are uniquely anchored by the existing instrument; its separate six-case Node fixture has signed evidence. The browser test callbacks and all mutation/assertion logic remain unchanged. The full growing-history and ordinary-scheduling workload files remain blocked until their own integration. No generated history campaign runs here.

Optional reports live inside the disposable execution checkout and are removed with it. Exact owned case outcomes, file timings, source/browser identities and changed-fixture patch are archived. This selection does not retain a separate performance report, qualify the whole wrapper/output campaign or establish immutable release readiness. Prior owner/headroom/capture-oracle observations and deadline evidence remain open.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 218 prior general contracts / 1,745 identities and exclusions remain unchanged.
General selections now contain 220 files / 1,747 cases (96 Vitest,
124 Node); Account has 114 files / 653 cases.
The 702,696-byte manifest retains 612 obligations / 197 unresolved:
38 test-file (22 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account ordinary-scheduling workload fixture. There are 9 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account ordinary-scheduling workload fixture integration (`L-1`)

The preceding phase is signed and verified as `c85e548`. **Account ordinary-scheduling workload fixture** adds 1 complete
file / 1 cases. The selection passes in 208.542 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-liveness-workload-fixture/README.md).

One complete unchanged workload case retains its 750-second wrapper/file and 720-second case limits. Only six runner/registration-test files and generated snapshots change. Product, shared fixture, test body, instrumentation, probe, oracle, census, reporters and wrapper remain unchanged. The already-qualified owned-CDP fixture supplies one disposable browser/context and synthetic service.

After synthetic Local promotion and sync setup, a fresh page loads the ordinary product bundle with measurement transforms disabled and crypto wrappers restored. Eighty sequential edits each await actual send and receive progress without expedited receive retries. The source logs milestones at 10, 40 and 80 positions and checks expected writing after each edit. These are a fixed directed workload, not generated histories.

Thirty further edits are spaced by 40-millisecond host timers. The subsequent prefix advances by at least one and at most thirty positions, permitting real batching. An instrumented cold reopen preserves writing, then one measured edit reaches the next prefix. A final uninstrumented offline reopen preserves the complete expected text.

The case asserts functional progress, prefix/batching bounds and cold content equality; it does not assert per-edit or round-trip latency ceilings. The only total duration bounds are the existing case/file deadlines. A single passing host run is not a loaded-host reliability or broad responsiveness guarantee. Instrumentation is disabled for the 80-edit/burst sequence but the synthetic service retains its measurement support.

Cold means a replacement page in the same live isolated browser context. No browser/renderer/service process is killed, no physical power loss is attempted, and no second device connects. Generated authority/service secrets, software authentication and retained factor options support this synthetic path. No personal profile/origin/build, human PRF/passkey ceremony, real Account receipt or forensic-erasure claim is involved.

Detailed workload/timing reports are written inside the disposable execution checkout and removed with it. A read-only inspection during execution observed status running with all 80 sequential edits recorded. Cleanup finished before a stable raw report copy could be captured. The general Node reporter also suppresses per-test stdout, so milestone console output is not archived. The exact passing case receipt, file timing and frozen source/browser identities are retained; no latency table or whole wrapper-output credit is claimed. The distinct growing-history fixture remains blocked until its own stage.

All prior general contracts and exclusions, personal/vector pins, L-2 and historical evidence remain unchanged. Existing ledger orphan classification, receive/delivery-oracle headroom, capture-oracle follow-ups and deadline evidence remain open. Full wrapper/campaign outputs and immutable release qualification are separate.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 220 prior general contracts / 1,747 identities and exclusions remain unchanged.
General selections now contain 221 files / 1,748 cases (96 Vitest,
125 Node); Account has 115 files / 654 cases.
The 703,271-byte manifest retains 612 obligations / 196 unresolved:
37 test-file (21 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account growing-history liveness fixture. There are 8 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account growing-history liveness fixture integration (`L-1`)

The preceding phase is signed and verified as `379b115`. **Account growing-history liveness fixture** adds 1 complete
file / 1 cases. The selection passes in 54.628 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-liveness-growth-fixture/README.md).

One complete unchanged growing-history case retains its 930-second wrapper/file and 900-second case limits. Only six runner/registration-test files and generated snapshots change. Product, native body, owned fixture, instrument, probe, oracles, census, reporters and wrapper remain unchanged. One disposable browser/context and synthetic service execute a fixed directed sequence; no generated property histories run.

At 0, 8, 16 and 24 editing jobs, the test compares every captured source reference in order against spool positions including additional sources, and requires send/receive prefixes equal the spool length. It samples delivery/receive/spool status three times per size. Two ordinary receive-poll samples, before and after growth, each require exactly one service census; a working-to-idle setup transition is excluded from the observation.

Three batches of eight edits include a 7000-byte paste and three tail deletions. Every edit must produce the expected text. Each batch waits for genuine send/receive progress without expedited receive retries, and the measured send-wake size must equal an independently counted outgoing local-admission callback count. This detects the tested remote-promotion wake regression; it is not an exhaustive proof over every possible causal schedule.

Cold pages reopen with instrumentation disabled and enabled in turn, preserving exact expected text; each takes three status samples. The case records those samples but does not assert a latency threshold or compare the full measured/unmeasured status objects against each other. The separate Node instrument fixtures provide their focused result/await/throw controls. The total case/file deadline is the only end-to-end duration bound here.

Cold is replacement of the page within the live isolated browser context; no process crash or physical power loss occurs. The path uses generated secrets, software authenticators, synthetic Local-to-Account promotion and retained factor options. No personal profile/origin/build, human PRF/passkey ceremony, real Account receipt, second-device adoption or forensic-erasure claim is involved.

The optional final growth report was copied read-only while the selection ran, using two matching reads and a SHA-256 record. Its path is checked against the owned receipt checkout and its capture time against the selection interval. It records passed, 24 jobs, 17 growth/polling samples, six controls and cold reopen. This auxiliary observation is archived separately from the authoritative owned case receipt; it is not a new performance threshold, wrapper/output or immutable aggregate qualification. Per-test stdout remains suppressed by the existing Node reporter.

All prior general contracts and exclusions, personal/vector pins, L-2 and historical evidence remain unchanged. Existing ledger orphan classification, receive/delivery-oracle headroom, capture-oracle follow-ups and previous deadline observations stay open. Single-host functional/timing evidence does not establish broad responsiveness or loaded-host reliability.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 221 prior general contracts / 1,748 identities and exclusions remain unchanged.
General selections now contain 222 files / 1,749 cases (96 Vitest,
126 Node); Account has 116 files / 655 cases.
The 703,831-byte manifest retains 612 obligations / 195 unresolved:
36 test-file (20 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account residue matcher and container fixtures. There are 7 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account residue matcher and container fixtures integration (`L-1`)

The preceding phase is signed and verified as `de8f421`. **Account residue matcher and container fixtures** adds 2 complete
files / 14 cases. The selection passes in 29.429 seconds including
fingerprinting. Worker groups drain; this selection launches no browser.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-residue-node-fixtures/README.md).

Fourteen complete cases cover the neutral residue matcher and bounded container readers, including 60 generated nested-container histories at seed 1209214. Both Node files receive a 60-second bound, drawn from the existing private-release neutral wrapper. No browser, Account workspace or personal profile is opened. Only the six registration files, generated snapshots and the Python ZIP producer call bounds change; test callbacks and product source remain unchanged.

The matcher exercises all fifteen declared representations, exact byte views and property keys, randomized needles, raw-before-hash and omitted-base64 controls, missing or unreadable surfaces, byte/depth limits, worker timeout, legacy carriers and observer-looking markers. The fragmented-record control deliberately does not detect a split needle: that remains an unqualified limitation. Static import checks cover five explicitly listed modules, not an exhaustive transitive or computed import graph.

Container controls cover independent Python stored/deflated ZIP, Node gzip and nested encodings, corrupt or truncated data, CRC errors, unsupported compression and budgets. Generated strings pass through one to four gzip layers around base64 content; corrupted gzip must be refused. File controls distinguish an empty logical SQL result from bytes retained in SQLite/WAL after deletion, and treat symlinks and insufficient budgets as incomplete. This is synthetic scanner calibration, not a forensic-erasure guarantee.

The ZIP producer now has a five-second timeout and one-MiB output ceiling per call. Its host Python 3.9.6 launcher, executable and 58 loaded file pins match before and after the selection, with PATH checked against both owned receipts. These observed pins are archived, but are not yet bound by the general runner frozen-input contract. Explicit external-tool binding remains necessary before immutable aggregate qualification. No Python installation or update occurred.

All prior contracts, exclusions, owner evidence and 52 personal/vector pins remain unchanged. Wrapper qualification, full output retention and immutable aggregate validation remain open. The runner currently omits per-test stdout and removes optional default reports with its disposable checkout; these file results are supported by owned case receipts, not by a claim that every wrapper report was retained.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 222 prior general contracts / 1,749 identities and exclusions remain unchanged.
General selections now contain 224 files / 1,763 cases (96 Vitest,
128 Node); Account has 118 files / 669 cases.
The 706,567-byte manifest retains 612 obligations / 193 unresolved:
34 test-file (18 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account residue calibration native fixtures. There are 5 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account residue calibration native fixtures integration (`L-1`)

The preceding phase is signed and verified as `9e243ca`. **Account residue calibration native fixtures** adds 1 complete
file / 2 cases. The selection passes in 36.080 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-residue-calibration-fixture/README.md).

Two complete unchanged native cases retain the canonical residue wrapper file bound of 150 seconds and 120/90-second case bounds. Six registration files and generated snapshots change. Existing product, neutral collectors, representations, matcher, browser/service fixture, test bodies and wrappers remain unchanged. Two isolated contexts run under one owned browser; no personal profile or origin is opened.

The matrix plants all fifteen declared representations across ten required acquisition surfaces, excluding six inapplicable cookie encodings: 144 cells. A clean scan must be complete with no prohibited match; the planted scan must detect every exact needle/surface pair with no issues. Each of the ten whole-surface omissions must both lose its planted match and report a missing collector.

The second case plants twelve independent markers in structured clones, keys, blobs, exact typed-array views, maps, sets, files, numeric arrays, chunk boundaries, headers, cookies and diagnostics. Four intentional collector faults must lose the corresponding match. Missing collection, tiny budgets and unsupported clone values must produce issues. Non-extractable CryptoKey metadata is observed; its underlying contents are outside this scanner assertion.

These controls calibrate detection on declared synthetic surfaces and representations. They do not prove absence in every physical browser carrier or establish forensic erasure. Optional wrapper report files are not retained by this general case adapter; owned receipts establish the full two-case result. Formal host-Python binding from the neutral container phase, wrapper/output contracts and immutable aggregate qualification remain separate.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 224 prior general contracts / 1,763 identities and exclusions remain unchanged.
General selections now contain 225 files / 1,765 cases (96 Vitest,
129 Node); Account has 119 files / 671 cases.
The 707,310-byte manifest retains 612 obligations / 192 unresolved:
33 test-file (17 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account residue lifecycle and service-file native fixtures. There are 4 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account residue lifecycle and service-file native fixtures integration (`L-1`)

The preceding phase is signed and verified as `c5e2112`. **Account residue lifecycle and service-file native fixtures** adds 2 complete
files / 4 cases. The selection passes in 52.677 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-residue-lifecycle-fixtures/README.md).

Four complete unchanged cases retain their existing 240-second file bounds: three lifecycle cases (180/60/60 seconds) and one service-file case (180 seconds). Six registration files, the shared Chromium launcher, two existing owner-control files and generated snapshots change. Product code, the four residue test bodies, synthetic browser/service fixture, acquisition and matching helpers, and wrappers remain unchanged. Five fixture instances run in two owned disposable browsers.

The lifecycle requires at least five synchronous admitted writes held solely in the encrypted journal while content-row counts remain unchanged. Flush must empty that journal; compaction and cold page replacement must preserve the exact projection. Recovery preparation checks the specific allowed retry-key exposures, then actual HTTP selection includes a lost final reply. Later Account edits, compaction and cold replay must retain the expected content. Software authenticators and generated factors exercise the private flow; this is not a human ceremony or a personal Account receipt.

Wrong-factor and cancelled opens refuse access. A real Storage.setItem override throws QuotaExceededError for encrypted journal keys; the test requires that failure to occur and verifies fallback persistence through cold reopen. The paired write-path control deliberately plants a plaintext side record after an acknowledged edit and requires the neutral scanner to detect it. These are directed controls, not generated histories or physical process/power failures.

The separate service-file case drives synthetic Local-to-Account HTTP delivery and observes the actual service directory twice after a barrier. Both observations must agree, the bounded acquired-file scan must be complete with no prohibited writing/factor sentinel, and it must include a real WAL. The intentional retry marker is excluded. This establishes the tested acquired-file result, not physical disk erasure or universal carrier coverage.

Existing host-Python identity binding, default report/stdout retention, owner classification/headroom and capture-oracle follow-ups remain open. Owned case receipts establish these four results; original wrapper campaign and output contracts, immutable validation and personal Account preparation remain separate.

The first native attempt refused all three lifecycle cases with uncaptured-worker, including the empty checkpoint. A separate diagnostic probe identified a chrome-extension worker; no product worker was inferred from that URL. The shared direct Chromium launcher now supplies the two extension-disabling flags already present in installed Playwright defaults. The uncaptured-worker refusal remains unchanged. The native owner control checks an empty worker census then observes a deliberately created real Blob worker; the existing startup control pins both flags. All 24 Node-owner and 14 native-owner cases are rerun, including timeout, cancellation, death and group/listener cleanup. The failed lifecycle receipt and diagnostic probe are retained alongside the passing final run. This changes the browser launch inputs; earlier native receipts retain their original input identities and are not recast as reruns under these flags.

The first ownership recheck passed 13/14 native controls; browser-death cleanup recorded kill EPERM and refused group-drain credit. Its PID was subsequently absent, but that later observation does not repair the failed receipt. Browser signaling now retries EPERM within each existing TERM/KILL grace interval and still requires ESRCH for drain. A new Node-owner control injects transient and persistent signal denial, requiring recovery only in the former and a failed drain result in the latter. Both the failed ownership log/receipt and successful requalification are retained. No deadline was enlarged and persistent uncertainty is not treated as success.

This packet alone uses a 175,000-byte ceiling, expanded from the usual 150,000 to preserve both failed attempts, the diagnostic probe and the full 24/14 owner requalification logs. The next ordinary integration packet returns to the usual ceiling.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 225 prior general contracts / 1,765 identities and exclusions remain unchanged.
General selections now contain 227 files / 1,769 cases (96 Vitest,
131 Node); Account has 121 files / 675 cases.
The 708,782-byte manifest retains 612 obligations / 190 unresolved:
31 test-file (15 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account residue generated native histories. There are 2 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account residue generated native histories integration (`L-1`)

The preceding phase is signed and verified as `15884e1`. **Account residue generated native histories** adds 1 complete
file / 1 cases. The selection passes in 254.795 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-residue-generated-fixture/README.md).

One complete unchanged native case retains its existing 330-second file bound, 300-second case bound and fast-check 270-second interruption limit with interruption treated as failure. Seed 1121040 selects 24 operation schedules; each attempt independently generates synthetic markers, factors and cryptographic randomness after compilation. Six registration files and generated snapshots change; product code, property body, browser/service fixture, collectors, matcher and wrappers remain unchanged.

Each history varies one to three Local edits, front insertion, flush and page reopen, optional compaction and lost final reply, followed by one or two Account edits. Checkpoints require a complete logical scan with no prohibited plaintext match, subject to the explicit recovery retry-key exposure policy. Reopening must preserve exactly the independently assembled text. The terminal assertions require all 24 runs, no property failure and no interruption. The generated case does not introduce new omission mutants, process crashes or physical power-loss simulation.

Twenty-four isolated fixture instances share one stage-owned Chromium process. Cold means replacement of the page within its isolated context; the factor material is held by the synthetic controller. This is not a personal browser, a human passkey ceremony, a real Account admission receipt, second-device adoption or forensic-erasure evidence.

The optional final property report and the 24 history records are copied read-only while the stage runs, with matching repeated reads and hashes. Their source checkout and capture time are checked against the owned receipt and selection interval. They supplement the exact owned case result; they do not qualify the original wrapper's full output contract. The general reporter still suppresses per-test stdout, and raw checkpoint reports otherwise disappear with the disposable checkout.

Prior general contracts, exclusions, the newly repaired browser owner, 52 personal/vector pins and L-2 remain unchanged. Earlier failed receipts retain their original identities. Host-Python binding, complete output contracts, owner/headroom and capture-oracle observations, wrapper campaigns and immutable aggregate qualification remain separate.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 227 prior general contracts / 1,769 identities and exclusions remain unchanged.
General selections now contain 228 files / 1,770 cases (96 Vitest,
132 Node); Account has 122 files / 676 cases.
The 709,377-byte manifest retains 612 obligations / 189 unresolved:
30 test-file (14 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. Next: Account packaged UI and persistent-profile residue fixtures. There are 1 Account files left; continue in signed
bounded groups as authorized, stopping if signing blocks rather than committing unsigned.


## 2026-09-14 — Account packaged UI and persistent-profile residue fixtures integration (`L-1`)

The preceding phase is signed and verified as `1135e75`. **Account packaged UI and persistent-profile residue fixtures** adds 1 complete
file / 2 cases. The selection passes in 53.480 seconds including
fingerprinting. Worker/browser groups drain, and recorded disposable browser PIDs are absent afterward.
Precise Node/stage timings, deadlines and scope limits are in the [packet](./account-conformance-runs/2026-09-14-residue-packaged-fixture/README.md).

The final two unchanged Account cases now run under an explicit inherited-profile fixture contract. The 240-second file bound and 180/240-second case bounds remain unchanged. The runner binds installed Chromium bytes, supplies the owned output root and executable, and leaves profile lifetimes inside its guarded Node process group. No unused CDP browser is started for this fixture kind. Missing or mismatched kind/variant/startup metadata refuses during planning. Ordinary CDP and Vitest contracts remain unchanged.

The packaged fixture reuses the existing custody profile owner, which requires a clean actual browser exit and released singleton locks before reading or reopening a profile. Two isolated synthetic profiles create three browser lifetimes, including one true whole-profile reopen. The existing viewport and context interface are retained; nested teardown closes profiles and the loopback server even after an earlier close fails. Both extension-disabling flags now also apply to this shared profile launcher. Standalone campaigns retain their original Playwright launch path.

Fresh Local UI creation, an actual edit, explicit ZIP export, lock, packaged service-worker readiness, closed-profile acquisition and offline reopen all pass. The export must include the intended writing and exclude the factor. A planted marker in an actual service-worker console must be detected. The unchanged fresh physical assertion requires zero prohibited matches; it does not require an empty issue list. In this particular observed run the acquired-file result was complete-no-prohibited-match with no issues. That observation is retained separately from the narrower executable assertion.

The migration case exercises synthetic source and journal data, recovery files, restart and verification, import and selection, later writing, authenticated source cleanup, and Local clear interrupted after custody removal then resumed. Logical scans must pass at the specified points. The final acquired-file scan also reported complete-no-prohibited-match with no issues in this run; its result is observational and the case does not promise physical deletion of legacy plaintext. Neither case establishes forensic erasure or coverage of every possible filesystem carrier.

All 24 Node-owner, five Vitest-process and fourteen native-owner controls pass. Six persistent-profile controls now execute the explicit new fixture kind, covering clean close/copy, timeout, cancellation, worker death, bounded reopen and death after reopen. Eight existing CDP controls also pass. Direct post-run checks find all three recorded packaged browser PIDs absent, no process referencing either synthetic profile, and all three CDP listeners refusing connections. The original failed ownership evidence remains preserved in its earlier packet.

Final outcome, export, worker-control, profile-lifetime and asset reports were copied read-only during the selection with matching repeated reads and per-file hashes. Their checkout and capture interval are checked against the owned receipt. These bounded auxiliary observations preserve the actual profile results; complete wrapper-output contracts and immutable aggregate qualification remain separate. All product sources and both test bodies remain unchanged. Temporary packaged builds precede secret generation; no personal app, profile, root dist or packaged dogfood release was changed.

This completes the Account suite integration group: 123 files / 678 cases. The general runner has 229 integrated files / 1772 cases, with all eleven catalogues still resolved. Remaining integration is 29 non-Account test files (nine other Node suites, four nested-owner files, sixteen Playwright files), 96 command rows and 63 campaign rows. These are integration obligations, not defect counts. Host-Python input binding, full output retention, existing headroom/oracle observations, R-04 style, P-06 prose and the immutable aggregate remain before private Account app/service preparation and human passkey/recovery/adoption validation.

All 93 pure runner checks, TypeScript, scoped style, planning, authority and signatures
pass. All 228 prior general contracts / 1,770 identities and exclusions remain unchanged.
General selections now contain 229 files / 1,772 cases (96 Vitest,
133 Node); Account has 123 files / 678 cases.
The 710,121-byte manifest retains 612 obligations / 188 unresolved:
29 test-file (13 Node, sixteen Playwright), 96 command,
63 campaign. All eleven catalogues remain resolved (163 cases / 54 mutations).
These are integration obligations, not defect counts.

Exact receipts/patch, frozen source/browser identities, source-control pins, prior owner evidence,
base signature and preservation checks are archived. All 52 personal/vector pins, L-2 and historical
evidence/debts/signing backups remain unchanged. Ledger orphan classification, receive/delivery-oracle
headroom, capture oracle follow-ups and prior deadline evidence remain open. Wrapper/aggregate
qualification is separate. The authorized Account suite integration group is complete. The next
proposed group is the remaining non-Account Node fixtures, starting with storage-marker and origin
controls; implementation of that group has not started.


## 2026-09-14 — Other Node marker, origin and legacy observer controls (`L-1`)

Other Node marker, origin and legacy observer controls passes 18 cases in 4 files. Four unchanged files retain their 18 exact cases and 550 generated inputs (150 marker, 100 saved-file, 200 byte-decoder and 100 paged-inventory inputs). All stages use a 60-second file bound and the existing inherited process-group guard. Origin checks use disposable output; legacy host controls use files and protocol stubs. No browser, host denial policy or personal installation is used. These controls do not establish production old-writer exclusion or qualify their campaign wrappers.

All 93 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `94d4926b` has a verified signature. 229 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 233 files / 1,790 cases. 25 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: native marker, packaged maintenance and partial Local recovery fixtures.

[Evidence](./account-conformance-runs/2026-09-14-other-node-controls/README.md).


## 2026-09-14 — Other native marker, maintenance and partial-recovery fixtures (`L-1`)

Other native marker, maintenance and partial-recovery fixtures passes 5 cases in 4 files. Three newly integrated cases cover stored marker references through v9 sync/cold retry and tamper refusal without writes, automatic compaction after 140 edits with exact replay, and cancelled/completed partial ZIP recovery with all original carriers preserved. Their existing 120-second file limits are retained. The preceding phase introduced a fixture-name allowlist that rejected existing maintenance/recovery callers even outside the owned runner; both names are now admitted. The qualification selection also reruns both unchanged Account packaged cases, for five passing cases in four files. The marker uses an owned CDP browser; packaged cases use owned persistent profiles inside the guarded worker group. Independent ZIP interpretation still uses host Python without general external-tool identity binding; complete wrapper-output and forensic-erasure claims remain outside this result.

All 93 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `ef5112aa` has a verified signature. 233 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 236 files / 1,793 cases. 22 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: nested process-group ownership for the remaining two harness suites, then runner self-tests.

[Evidence](./account-conformance-runs/2026-09-14-other-native-fixtures/README.md).


## 2026-09-14 — Registered harness groups and current storage lifecycle fixtures (`L-1`)

Registered harness groups and current storage lifecycle fixtures passes 18 cases in 2 files. The 14 cleanup-supervisor cases pass under registered group leaders, preserving their generated diagnostics and failure controls. Three obsolete fixed-port failure expectations are replaced by actual custody/content/journal worker cases that succeed on ephemeral loopback ports while the former ports remain occupied; each verifies clean server and process closure. Storage-properties retains its real fixed-port failure assertion and borrows owned Chromium to reach it. All four 25-second case bounds remain, with a 120-second file bound. The first stale-expectation run and a subsequent browser-identity refusal are retained. The group owner writes an intent before launch, publishes the leader before payload execution, prevents late payload start after closure and separately binds the actual worker PID for custody. Unknown registration or failed closure storage cannot prove drain. All 50 final ownership controls pass: 31 stage, five Vitest and fourteen native, including abrupt death, TERM resistance, late launch and closure-marker failure. This is cooperative ownership for reviewed tests, not hostile-code confinement. The other Node group is complete: nine files / 39 cases. Full campaign output retention, production old-writer exclusion and immutable qualification remain separate.

All 93 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `e7b98bcd` has a verified signature. 236 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 238 files / 1,811 cases. 20 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: the four runner self-test files, followed by browser application tests.

[Evidence](./account-conformance-runs/2026-09-14-other-harness-fixtures/README.md).


Signing checkpoint: the signed commit attempt for the completed harness phase failed with
“agent refused operation” (exit 128). The source, evidence and checkpoint remain staged on signed
`e7b98bcd`; no unsigned commit was made. Work stopped before runner self-tests and browser application
tests, as instructed. Resume with the staged signed commit.


## 2026-09-14 — Runner self-test integration and nested stage environment ownership (`L-1`)

Runner self-test integration and nested stage environment ownership passes 68 cases in 6 files. The four runner self-test files now run with exact independent Node case census and registered group ownership; their two native files bind installed Chromium without launching an unused outer browser. The combined qualification contains all 50 self-tests and the 18 previously integrated cleanup/lifecycle regression cases. The first owned run exposed inherited NODE_TEST_CONTEXT suppressing nested Node execution and inner ownership refusals being charged to the outer stage. An explicit stage boundary now supplies its fresh environment and scoped violation sink; ordinary children retain the inherited guard. Reviewed boundaries allow temporary fixtures and the existing disposable checkout output. The initial nesting failures, checkout-boundary refusal and macOS /var versus /private/var alias refusal are retained. Boundary checks resolve existing paths before comparing ownership, including symlink targets. The additional registered stage leader remains in the cleanup census. No case or file deadline was increased. All other Node suites and runner self-test files are integrated; browser application tests remain next. This cooperative process ownership is not hostile-code confinement, and wrapper/output contracts and immutable qualification remain separate.

All 93 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `ff61b085` has a verified signature. 238 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 242 files / 1,861 cases. 16 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: browser application adapter controls and Local startup/editor fixtures, then the remaining browser application files.

[Evidence](./account-conformance-runs/2026-09-14-runner-self-tests/README.md).


## 2026-09-14 — Owned Playwright adapter and Local startup/editor fixtures (`L-1`)

Owned Playwright adapter and Local startup/editor fixtures passes 10 cases in 3 files. The first browser application selection includes eight existing Local startup/editor cases and two new native adapter control cases. The existing application assertions remain, including 20 generated compose/history inputs at seed 8941 and a separate ledger before/after reload. Static binding-aware registration reading expands exact file/suite/project identities without executing hooks or test modules; it distinguishes RegExp.test from the imported test binding. Owned runs borrow Chromium over CDP, start ephemeral loopback Vite inside the guarded worker group and refuse server reuse or framework-launched browsers. Normal standalone Playwright behavior is retained. Reports require terminal success, exact collected and completed cases, one worker, no retries/repetition/unexpected skips, clean framework results and closed server. Inline/file attachments retain bounded exact bytes, size and SHA-256; the generated histories are included. Native controls exercise actual omission, skip, assertion/hook failure, timeout, cancellation, partial progress and attachment retention. The initial no-discovery fixture failure and subsequent public-metadata reconciliation refusal are retained; normal Vite discovery and the public top-level fullyParallel field correct those adapter mistakes. Five pure adapter controls include 160 generated population checks. File bounds are explicit (300 seconds for each Local file and 120 for native controls); existing case bounds are unchanged. This is Local application and runner evidence, not a private Account admission receipt or immutable release qualification. Other browser families, complete wrapper/output contracts and real-device measurements remain separate.

All 98 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `25a204f3` has a verified signature. 242 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 245 files / 1,871 cases. 14 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: packaged Local, storage compatibility and private migration browser fixtures, then upgrade, geometry and latency files.

[Evidence](./account-conformance-runs/2026-09-14-browser-local-fixtures/README.md).


## 2026-09-14 — Packaged Local, compatibility and private migration browser fixtures (`L-1`)

Packaged Local, compatibility and private migration browser fixtures passes 16 cases in 4 files. Three additional Playwright files contribute 14 cases: three packaged Local cases, six storage compatibility cases and five seeded private migration rehearsals. Qualification also reruns the two native browser-adapter controls. The package is built only in the disposable stage, served as exact files on an ephemeral loopback host without HTML fallback, and checked for real precache assets, byte equality and accepted offline writing at both entry points. Development fixtures retain their original Vite configurations; private migration retains its full optimization entry set. Existing application assertions and case deadlines are unchanged. Coverage includes live writer fencing, queued/cancelled opens, renderer death, journal-only future schema, exact source retention, saved-file verification, resumed import, authenticated cleanup and later writing. Source-input/preservation attachments are retained with exact bounded bytes. New file bounds are 180 seconds for the package, 270 for compatibility and 540 for private migration. Private rehearsal ZIP decoding uses host Python; external-tool identity binding remains owed before immutable qualification, as in earlier residue controls. These seeded tests establish no production old-writer exclusion, personal Account admission or whole-release result. Wrapper build/budget/origin/output obligations remain separate.

All 98 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `228031a1` has a verified signature. 245 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 248 files / 1,885 cases. 11 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: application upgrade browser fixtures, followed by geometry and latency files.

[Evidence](./account-conformance-runs/2026-09-14-browser-storage-fixtures/README.md).


## 2026-09-14 — Application upgrade browser fixtures (`L-1`)

Application upgrade browser fixtures covers 10 case dispositions (9 passed; 1 explicitly not applicable) in 2 files. Seven upgrade cases run against two disposable builds and the existing switchable release server: exact asset bytes, first-install offline reopen, multi-tab waiting, interrupted and wrong-byte downloads with retry, renderer death and compatible rollback, and the immediate-activation sensitivity control. The optional actual-predecessor case is explicitly not applicable because no predecessor build is supplied; its named reason must match exactly and it grants no predecessor-upgrade evidence. The independent predecessor-input/wrapper obligation remains open. Two native adapter controls rerun ordinary passing/omitted/skipped/failed census and cancellation/deadline ownership. All application assertions and 35-second case bounds remain unchanged; the 240-second file bound includes both builds. The server factory preserves the standalone fixed-port command while owned runs use an ephemeral loopback server. The reconciler accepts only the exact declared non-applicable case/reason and still refuses every unexpected skip, inverted outcome, retry or annotation. Evidence counts distinguish passes from explicitly unexercised dispositions. This bounded selection is not immutable release qualification.

All 98 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `703990b2` has a verified signature. 248 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 249 files / 1,893 case dispositions (1 not applicable). 10 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: geometry layout/editor browser fixtures, then interaction and latency fixtures.

[Evidence](./account-conformance-runs/2026-09-14-browser-upgrade-fixtures/README.md).


## 2026-09-14 — Integration of geometry layout and editor fixtures (`L-1`)

Integration of geometry layout and editor fixtures covers 50 case dispositions (50 passed; 0 explicitly not applicable) in 4 files. Four Playwright files contribute 50 desktop/Android-emulated cases: breadcrumbs and outline focus, static/mounted card geometry and edit guards, viewport and panel layout, and caret/live-preview line heights. All existing assertions, input fixtures, factor-unlock setup and 30-second per-case bounds are retained. Each file uses a fresh disposable packaged build and an ephemeral exact-file server under the owned Chromium group, with one worker, no retries and exact project/case reconciliation. File deadlines are 240 seconds except layout at 360 seconds; these include preparation and both projects. Android is browser emulation, not real-device performance evidence. The compact manifest is 747448 bytes; its writer and independent test ceiling move prospectively from 750000 to 800000 bytes for the remaining explicit project registrations, with no schema/layout change or deleted obligations. Runtime log/report bounds are unchanged. Predecessor-upgrade evidence and wrapper/build/output obligations remain separate.

All 98 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `763fa7d3` has a verified signature. 249 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 253 files / 1,943 case dispositions (1 not applicable). 6 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: geometry interaction browser fixtures, then latency fixtures.

[Evidence](./account-conformance-runs/2026-09-14-browser-geometry-layout/README.md).


## 2026-09-14 — Integration of geometry interaction fixtures (`L-1`)

Integration of geometry interaction fixtures covers 46 case dispositions (36 passed; 10 explicitly not applicable) in 5 files. Four files declare 44 project/case dispositions: 34 exercised cases and 10 exact device-specific non-applicable cases. Mouse grip and wheel interactions remain desktop-only; touch hold/arbitration cases run only in the Android project. Every non-applicable identity and original reason is independently enumerated, must still exist in the source census, and must match the actual skip annotation exactly. Pure corruption controls cover all 11 named non-applicable dispositions including the previously retained predecessor case; unlisted skips still refuse. The qualification also reruns both native browser-adapter failure/deadline/drain controls. Application assertions and per-case bounds are unchanged. The owned package covers card reorder, touch/navigation arbitration, Local reopen without relay/plaintext identity caches, bounded native wheel behavior, menus, preference persistence, editor focus and deferred/frozen writing. File bounds are 180 seconds except workflow at 360 seconds, with desktop and Android emulation run serially. Emulation supplies no real-device latency evidence. Only the two latency test files remain unintegrated; command/campaign expansion, wrapper outputs and immutable qualification remain separate.

All 98 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `d30b6468` has a verified signature. 253 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 257 files / 1,987 case dispositions (11 not applicable). 2 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: journal latency browser fixtures and measurement retention, then application latency setup and integration.

[Evidence](./account-conformance-runs/2026-09-14-browser-geometry-interaction/README.md).


## 2026-09-14 — Integration of journal latency fixtures and measurement retention (`L-1`)

Integration of journal latency fixtures and measurement retention covers 6 case dispositions (6 passed; 0 explicitly not applicable) in 2 files. The journal file contributes four desktop/Android-emulated cases: published-vector reproduction and the existing payload/level microbenchmark on each project. The configured origin, viewport, device scale, user agent and touch options are now passed to the manually created contexts; Android retains its existing four-times CPU throttle and the fine-clock isolation assertion. The selected historical construction, payload sizes, seven measurement levels, sampling rules and one-millisecond budget assertions are unchanged. These measurements do not cover the full production admission path, and a throttled single-write tail does not establish a handset p95. Each run must retain exactly 44 project/metric rows with finite values, positive sample counts, interpretations and bounded canonical bytes. Missing, duplicate, substituted, malformed, truncated or oversized output refuses independently of test success. Measurements live beside the owned case report, so partial rows survive worker interruption; the native timeout and cancellation controls prove this and drain browser, server and subprocesses. Global setup resets only that fresh output. The final qualification includes the two native controls. File allowance is 720 seconds including build, both projects and benchmark preparation; existing 300-second case bounds remain. The first successful diagnostic run preceded the partial-output retention improvement and supplies no final qualification credit. Standalone result filenames remain compatible; the wrapper/output qualification backlog is not closed by this one artifact contract.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `e29e3510` has a verified signature. 257 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 258 files / 1,991 case dispositions (11 not applicable). 1 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: application latency fixture repair and integration, then recap the completed suite groups and remaining command/campaign qualification work.

[Evidence](./account-conformance-runs/2026-09-14-browser-journal-latency/README.md).


## 2026-09-14 — Integration of current Local application latency fixtures (`L-1`)

Integration of current Local application latency fixtures executed all 12 project/cases and retained all 30 measurements with no skips or retries. Native validation FAILED: the two project teardowns report three deferred timing overruns; the adapter independently rejects out-of-budget measurements. This is completed adapter integration, not passing performance qualification. The last browser file now creates and unlocks the current mandatory-factor Local workspace instead of assuming plaintext startup. Its manually created contexts receive the configured origin and device options. The unchanged 20-day × 15-card and 400-line workload is admitted through the UI, drained, cold-reopened and fully verified on both projects. A locked read-only probe counts the sole existing encrypted store and journal; it aborts accidental DB creation and reports ciphertext/nonce payload and UTF-8 journal bytes, never physical allocation. Two guarded, metadata-only timing marks bracket the real factor-unlocked carrier load/decryption and Yjs replay/owner initialization. Missing timing marks refuse instead of becoming zero. The authority census changes only the hashes of these two source files; classifications and construction labels are unchanged. Factor entry is excluded explicitly: launch-to-prompt and confirmation-to-editor are separate measured segments, whose sums retain the existing cold/warm numeric budgets. Actual viewport and CPU rate are included in every measurement note. Input completion is asserted for both 120-keystroke typing tests. The first run preserved a desktop card-typing p95 of 16.7 ms and exposed an Android fixture timeout clicking Lock workspace in a closed off-screen menu. The repaired helper opens that menu normally; no execution allowance or performance threshold was increased. Timing assertion failures are collected until project teardown, with functional failures still immediate, so later measurements survive a slow earlier result. All nine numeric budget predicates are independently checked by the output adapter; controls reject threshold equality and malformed/missing/repeated metrics. The final desktop card-typing p95 is 18.3 ms and the CPU-throttled Android value is 84.2 ms against <16 ms; Android card focus is 61.4 ms against <50 ms. Other timing checks pass in this observation: cold application work totals 254.2/817.3 ms, warm 229.0/737.2 ms, and encrypted load/replay 6.4/27.5 ms, desktop/Android respectively. The full retained rows preserve precision. These are observations on this host with a 4x-throttled emulator, including wide viewports for seeded editor work; they do not establish handset performance or isolate the cause of an overrun. Both projects and their browser/server/worker groups drain. The failure and earlier fixture defect remain preserved; no rerun is used to erase the measured overrun. All declared test-file adapters are integrated, but native performance qualification and the command/campaign/immutable-release gates remain open.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `d8b8e00e` has a verified signature. 258 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 259 files / 2,003 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: focused application latency calibration and profiling, followed by remaining command/campaign adapters and immutable release qualification.

[Evidence](./account-conformance-runs/2026-09-14-browser-application-latency/README.md).


## 2026-09-14 — Calibrate Local input latency and isolate admission costs (`L-1`)

Calibrate Local input latency and isolate admission costs covers 4 case dispositions (4 passed; 0 explicitly not applicable) in 1 files. A separate owned diagnostic executes two reverse-order blocks of 120 trusted keys per textarea, bare CodeMirror and admitted card on desktop and CPU-4x Android emulation. Both projects use 1280x900 and the unchanged UI-seeded, fully cold-verified 300-card/400-line corpus. All 1,440 raw timing samples, 12 p95 rows and four source-mapped CPU profiles are retained; profiled typing is separate from timing and all added writing survives lock/reopen. Desktop card p95 is 17.2/18.3 ms; Android is 92.9/93.7 ms. Controls vary: desktop textarea 1.6/1.4, bare CodeMirror 1.9/15.5; Android textarea 7/6, bare CodeMirror 8.6/19 ms. Sampling over 60 additional card keys attributes 647.2/3106.6 ms inclusive to private preparation and 237.1/1105.2 ms to projection verification (desktop/Android); nested inclusive values must not be added. These are sampled aggregates, not per-key quantiles or causal speedup estimates. The first attempt was cancelled after read-only inspection found the app service worker replacing the control page with the unlock UI; its receipt, drain evidence and exact patch are retained. Controls now use a separate disposable context with service workers blocked and explicit title/input assertions; the application context is unchanged. Control assets use their own URL prefix. The pilot has no relaxed timing assertions: its success means complete diagnostic evidence only. Original application fixtures, 30-metric census and all nine budgets remain unchanged and the preceding performance gate remains failed. No production source, custody, admission, transport or personal app artifact changes. The standalone latency command excludes this owned-only diagnostic; its explicit runner selection includes exactly four cases. Sampling and limitations were specified before the pilot in docs/latency-diagnosis.md. The two native browser-runner controls also pass, including omission, skip, hook failure, deadline, cancellation and process drain.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `dbc64150` has a verified signature. 259 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,007 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: a bounded admitted-workspace performance repair targeting measured document/history copying and projection verification, with staging/undo/delivery regressions and the unchanged application budget gate; then remaining command/campaign adapters and immutable qualification.

[Evidence](./account-conformance-runs/2026-09-14-application-latency-diagnosis/README.md).


## 2026-09-14 — Reduce complete projection comparison cost without skipping verification (`L-1`)

Reduce complete projection comparison cost without skipping verification completes the bounded comparison repair; the unchanged packaged application gate remains failed. All 12 project/cases execute without skips or retries and retain all 30 metrics. Two project teardowns fail on card typing p95: 16.2 ms desktop and 77.2 ms CPU-4x Android emulation against <16 ms. Focus is 8.1/44.2 ms against <50; startup/replay, compose and navigation meet their existing bounds in this run. The process group drains. The earlier 18.3/84.2 ms typing and 7.4/61.4 ms focus observations remain historical evidence; this cross-run change is not a controlled causal estimate. Both browser projects seed and cold-verify 300 cards and 400 Goals lines through the real Local UI. No budget, deadline or recorder changes, personal-app update, or release qualification. Only the Yjs seam changes production behavior: a bounded eligibility probe selects a complete encoding comparison that retains long writeString values at exact byte offsets. Matching all bytes, offsets and string values proves original encoding equality; any difference reconstructs the original bytes and uses the existing exact-byte/GC-normalized fallback. State vectors, deletions and exact pending bookkeeping still run on every transition. Document/history forks, admission ordering, persistence and wire formats are unchanged. The final full unit suite passes 96 files / 1,030 tests; 150 existing and 200 new generated comparison histories agree with the frozen always-normalizing reference, and 500 fork histories remain. Ignoring retained strings fails two tests. Native pending and original-order delivery each pass 100 generated histories and their directed crash/pressure cases. Native content/publication mutants are detected. The owned workspace-admission catalogue passes ten cases and four mutations with a drained process group. The initial native pending invocation placed its output outside the unchanged Vite allow-list; that harness error and the corrected-location pass are both retained. A test-generator setup error (undefined inserted directly into Y.Array) is retained and corrected without product changes. All exploratory, intermediate and final performance samples and final bundle identities survive. The final alternating comparison-only medians (baseline/candidate) are 1.555/0.280 ms at 1k items, 3.295/3.296 at 10k and 17.791/17.825 at 100k, with 100k visible characters. Sequential full-command results remain mixed. These are dependent single-host observations, not population or causal estimates. The bounded construction and decision conditions were specified in docs/f17-comparison.md.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `5ffce895` has a verified signature. 259 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,010 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: a bounded document/history fork-cost repair preserving private staging, refused-edit isolation, undo and pending delivery, followed by the unchanged application gate; remaining command/campaign adapters and immutable qualification follow.

[Evidence](./account-conformance-runs/2026-09-14-f17-comparison/README.md).


## 2026-09-14 — Reduce detached document fork cost while preserving runtime semantics (`L-1`)

Reduce detached document fork cost while preserving runtime semantics completes the bounded runtime-fork repair; the unchanged packaged application gate still fails on CPU-4x Android card typing. All 12 project/cases execute without skips or retries and retain all 30 measurements. Desktop card typing is 15.2 ms and meets <16; Android is 69.4 ms and fails <16. Focus is 7.4/35.7 ms against <50. Startup/replay, compose and navigation also meet their unchanged bounds. One project teardown reports the collected overrun and the process group drains. Previous typing was 16.2/77.2 ms; this cross-run change is descriptive, not a controlled causal estimate. Both projects seed and cold-verify 300 cards and 400 Goals lines through the real Local UI, with seeded editor work at 1280x900. No threshold, deadline, recorder, personal app or deployment changes; this is not handset or immutable-release qualification. Only src/crdt/yjs.ts changes production behavior. Detached documents use V2 struct compression with paired private encoder/decoder overrides for V1 legacy JSON and independent UTF-8 string semantics. Binary views, including leaves nested inside arbitrary arrays/objects, detach before temporary update bytes are cleared. Pending update bytes, missing-clock maps and pending deletions still copy exactly without replay; runtime redone links and deep undo stacks remain. Both private drafts, per-transition comparison, admission order and persistent/outbound V1 formats are unchanged. The naïve public-codec swap fails three tests; its exact patch and original added test source are retained. The signed baseline fails the new nested-binary regression, establishing a pre-existing V1 temporary-buffer aliasing defect; the repair preserves those values without claiming personal writing was affected. The final unit suite passes 96 files / 1,035 tests. Two hundred generated Unicode/nested-content cases compare with the frozen V1 reference and test isolation both ways; 150 generated undo/redo histories compare repeated forks with an unforked reference and check selection-metadata isolation. Existing 500 fork and 350 comparison histories remain. Pending-map aliasing and omission of redone links each fail their intended control. Native pending and original-order delivery each pass 100 generated histories plus their directed crash/pressure cases. The owned workspace-admission catalogue passes ten cases and four mutations with process drain. Final alternating fork medians are 0.695/0.415, 3.119/1.779 and 36.897/22.252 ms baseline/candidate at 1k/10k/100k items over 100k visible characters. That satisfies the prospective >=20% fork-gain rule with no consistent >10% regression in another stratum. Sequential whole-command timings remain mixed: 13.585/15.210, 26.115/23.815 and 130.601/116.110 ms. Every pilot/final sample and bundle identity survives; the naïve pilot is not evidence for the revised candidate. These are dependent single-host observations, not population or causal estimates. The prospective protocol, refinement prompted by semantic failures, final source patch/pins and negative controls are retained.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `e2c93b05` has a verified signature. 259 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,015 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: isolate the remaining undo-history and duplicate-preparation costs with the revised runtime, then choose a bounded ownership or history-copy repair that preserves staging and full verification; remaining command/campaign adapters and immutable qualification follow.

[Evidence](./account-conformance-runs/2026-09-14-f17-forks/README.md).


## 2026-09-14 — Profile residual preparation and undo-history copying (`L-1`)

Profile residual preparation and undo-history copying covers 4 case dispositions (4 passed; 0 explicitly not applicable) in 1 files. No production, test, manifest or authority-contract changes. The unchanged browser diagnostic retains 1,440 raw timings, twelve p95 rows and four mapped CPU profiles, with cold-reopen checks. Card p95 is 15.0/16.4 ms desktop and 73.0/73.9 ms CPU-4x Android in the two blocks. The separate application budget gate remains failed at its last 15.2/69.4 ms observation. Across separate 60-key profiles, stack copying uses 157.8/738.2 ms desktop/Android, alongside 166.4/752.5 ms for the admission draft and 148.2/730.9 ms for the history draft. Nested totals overlap. Native structuredClone is not isolated from inline callback work. Nine controlled Node strata retain all 360 measured forks: at 1,000 undo groups, full history medians are 1.848, 8.802 and 559.527 ms with zero, one and 100 selection targets; corresponding document medians are 1.153, 1.180 and 1.348 ms. Fixed document state within pairs and metadata strata helps localize copying cost; increasing stratum order, dependent host/JIT/GC observations, stress-only target layout and zero redo/redone coverage limit inference. The prospective protocol, raw profiles/mapped nodes, probe, all samples, analysis and source-map hashes are retained; complete generated maps remain in the raw run. No application speedup or budget closure is claimed. The next bounded attempt preserves deep isolation and both drafts while specializing known selection metadata, with arbitrary metadata falling back to the existing clone. The personal app, server and deployment remain untouched.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `1fd04afa` has a verified signature. 260 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,015 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: prototype fully detached selection-metadata copying with structuredClone fallback, generated value/alias/undo controls and balanced baseline/candidate timing before the unchanged application gate; duplicate preparation and the remaining command/campaign and immutable qualification work remain.

[Evidence](./account-conformance-runs/2026-09-14-f17-history-profile/README.md).


## 2026-09-14 — History metadata optimization assessment (`L-1`)

History metadata optimization assessment covers 15 case dispositions (15 passed; 0 explicitly not applicable) in 1 files. Both metadata fast paths are rejected and all production bytes are restored to signed 8c5fdaee. The first recursive dispatcher passes focused correctness but improves the 1,000-group one/100-target strata by only 5.1%/20.1%; direct constructors improve them by 10.3%/30.5%. Neither satisfies the predeclared >=20% rule in both strata. Each distinct implementation has its own fixed nine-stratum, five-warmup, twenty-alternating-pair observation: all 720 measured forks, source patches, bundle hashes, ranges and failed acceptance decisions are preserved. These dependent single-host observations do not estimate a customer workload or application speedup. Three new retained cases add 200 generated reference-graph/isolation checks, fallback values/cycles/accessor behavior and 150 undo/redo histories with restored master/card selections against an unforked reference. Sharing a nested ID fails the intended isolation assertion in both discarded candidates; a shallow-copy mutation fails the same assertion in the retained baseline. The full unit suite passes 96 files / 1,038 tests. The owned runner executes the changed suite as an explicitly bounded subset, with all 15 cases passing and process drain. Only the changed suite, two runner denominator fixtures and their reviewed planning/case registrations change executable validation coverage; source, authority labels, exclusions and selection membership are unchanged. No runtime/native/application campaign is rerun after restoring production; the conditional optimization gate was not reached. The last independent application gate remains failed at 15.2/69.4 ms desktop/CPU-4x typing. The personal browser, server, package and deployment remain untouched.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `8c5fdaee` has a verified signature. 259 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,018 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: specify and test a workspace-only preparation handoff bound to its accepted basis, with canonical ownership, refusal/disposal, Account source coverage and full per-transition verification preserved; then attempt removal of the duplicate draft under unchanged budgets.

[Evidence](./account-conformance-runs/2026-09-14-f17-metadata/README.md).


## 2026-09-14 — Workspace preparation ownership contract and baseline controls (`L-1`)

Workspace preparation ownership contract and baseline controls covers 57 case dispositions (57 passed; 0 explicitly not applicable) in 3 files. Defines the workspace-only preparation contract without changing production or removing a draft. The future handoff binds owner identity, accepted revision, current writer, queue job and slice; it consumes a preparation once, retains the same bytes/history for storage retry, and requires a fresh binding for remaining slices. Canonical privacy, complete post-promotion comparison, Account original-source replay/coverage, acknowledgement ordering and cleanup ownership remain mandatory. Four new cases cover 80 generated retry/discard/remote histories against an independent accepted-text/revision ledger and cold carriers, no-op revisions and writer collision, actual private-history disposal on discard and drained close, and 160 generated source-coverage checks with pending structs, missing clocks and pending delete sets. All four deliberate faults fail their intended assertions: a stale draft, premature promotion, leaked history and omitted source verification. These are baseline production tests, not proof that the unimplemented capability rejects forged or stale contexts. The full unit suite passes 96 files / 1,042 tests, and the owned runner executes all 57 cases across the three changed suites with process drain. Only those suites, two denominator fixtures and their reviewed inventory/manifest records change executable validation coverage; all selection membership and exclusions stay fixed. Initial fixture assumptions about synchronous queue completion and nested Yjs update emission, plus an incorrect import, were corrected before qualification; original failed logs remain. No runtime/native/application campaign or timing was rerun. The last independent application gate remains failed at 15.2/69.4 ms desktop/CPU-4x typing. Personal browser, server, package and deployment remain untouched.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `213ada08` has a verified signature. 257 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,022 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: implement the private preparation context and handoff ownership component, with actual foreign/stale/reuse/wrong-slice and disposal controls while retaining the current editor path; then gate Local integration against the legacy path and unchanged application budgets, with Account source activation separately checked.

[Evidence](./account-conformance-runs/2026-09-14-f17-preparation-contract/README.md).


## 2026-09-14 — Private workspace preparation handoff component (`L-1`)

Private workspace preparation handoff component covers 20 case dispositions (20 passed; 0 explicitly not applicable) in 1 files. Adds the private workspacePreparation component without connecting it to admission or the editor. Frozen identity contexts bind the verified local head, job, slice, accepted revision and writer. Preparation is synchronous and one-shot; scoped history/buffers transfer ownership, verification precedes source custody capture, retries borrow the identical retained result, and close revokes authority while awaiting active writes before disposal. Adoption requires the same job/slice at exactly the next revision and successful full comparison before transferring history; verification failure after promotion is terminal. The component has no canonical reference or public workspace export; its integration callbacks must retain complete comparison, actual transaction-derived updates, queue reservations and independent Account source coverage. Twenty component cases use actual Yjs histories and source/canonical comparisons, including 120 generated accepted-text/revision/undo/cold-replay traces. Eight deliberate mutations fail their intended assertions. New tests first exposed two resource-cleanup gaps in this unconnected component: late async results and incomplete collection of a closing command's returned buffers; both are repaired with original source/tests/output retained. A control initially timed out because its fixture failed to release an unexpectedly successful borrow; its cleanup is corrected and the original failure remains. The first full unit run, concurrent with other validation, timed out in two unchanged five-second cases: Account liveness and position decisions. The same default full command then passes alone at unchanged limits: 97 files / 1,062 tests. This supports the bounded functional checkpoint, not closure of loaded-host timing headroom; concurrency as the cause is not established. The owned runner passes all 20 new cases with process drain. One reviewed suite and 20 cases are added; all 260 prior general contracts, exclusions, crypto labels and prior runtime source bytes are preserved. The runtime census adds only the new unconnected component. No application/native campaign or performance timing is run; the last independent application gate remains failed at 15.2/69.4 ms desktop/CPU-4x typing. Personal app, server, package and deployment remain untouched.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `6c5502fd` has a verified signature. 260 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 261 files / 2,042 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: integrate the private handoff into Local admission with matching job/slice publication, preserving the generic path as a reference; compare both paths through command/undo/selection, retry/discard, remote and shutdown histories plus native crash/pressure checks before a prospectively specified performance comparison; Account source activation remains separately gated.

[Evidence](./account-conformance-runs/2026-09-14-f17-handoff/README.md).


## 2026-09-14 — Release-validation status and record reconciliation (`L-1`)

At signed `82daaac0`, the inventory/manifest checks confirm 616 obligations: no unresolved test-file
adapters, 96 command and 63 campaign obligations. All eleven catalogues and 261 general files /
2,042 case dispositions (11 not applicable) are integrated; this is not an aggregate pass. The
application gate still fails CPU-4x Android typing; the private handoff component is unconnected.
After its Local integration/reference and performance gates, resume wrapper certification, remaining
input/output/headroom/style/prose work and one immutable qualification run.

Audited all eight phases from `dbc64150` through `82daaac0`: signatures verify, completed/decisions/
performance records each append in every commit, and all 391 indexed compressed payloads and packet
metadata hashes match. All 52 personal/vector pins and L-2 match. Corrected stale execution-overview
counts (612/276/188 to 616/280/159), the findings heading claiming general test integration remained,
and the phase-1 table's misleading “Current count” label. Historical measurements, failed attempts,
phase receipts and tested revisions remain unchanged. No runtime test, timing or aggregate was rerun.
[Audit](./account-conformance-runs/2026-09-14-release-status-audit.json).


## 2026-09-14 — Private Local preparation handoff integration (`L-1`)

Private Local preparation handoff integration covers 155 case dispositions (155 passed; 0 explicitly not applicable) in 8 files. Connects the private Local handoff through explicit internal constructor registration; the default Local opener and every Account factory retain the generic reference path. Shared workspace commands capture actual transactions and preserve history, selections and result values. Candidate preparation omits the first canonical-derived draft, binds the verified job/slice/revision/writer, leases bytes through storage, retries the same preparation, copies a remainder before erasure, and performs full canonical comparison before adoption/publication. No-op transitions still advance revision; remote writer collisions renew the writer. Publication source and revision must match the adopted candidate. Post-promotion failure is terminal and preserves its projection-mismatch cause. The 23 original workspace cases run under both strategies; each also runs no-op/writer-collision and reentrant-observer controls plus the same 80 generated histories (seed 140925). Independent text/revision/undo/redo/cold-replay and selection/retry-count assertions accompany two Local-specific close/adoption cases: 54 workspace cases total. Eight affected files pass 155 dispositions through the owned runner. Native pending-state and original-order delivery each pass directed cases plus 100 generated histories. The final owned workspace catalogue passes ten cases and four mutations with drain. The first pending-state campaign found a new integration gap: a Local initialization publication relabeled as remote was tolerated after adoption. Binding its source fixes the existing directed counterexample; original source, failed report, repair pass and a new source-check mutation are retained. Two unit mutations separately detect skipped adoption comparison and premature byte erasure. Full units pass alone at unchanged limits: 97 files / 1,093 tests. The reviewed general set is now 261 files / 2,073 dispositions, including the same 11 not applicable; 260 prior general contracts and all original workspace reference cases remain. The crypto census changes only four runtime source hashes; domains, labels, groups and other source hashes remain unchanged. No performance measurement, default activation, Account source activation, package change or personal-browser operation occurs. The last application typing gate remains 15.2/69.4 ms desktop/CPU-4x Android, with Android failing <16 ms.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `0c84e5cc` has a verified signature. 260 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 261 files / 2,073 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: prospectively specify and run balanced candidate/reference whole-command measurements, retaining the signed baseline as a comparison, and the unchanged application latency gate before deciding default Local activation; Account source/capture activation remains separately gated.

[Evidence](./account-conformance-runs/2026-09-14-f17-local-handoff/README.md).


## 2026-09-14 — Private Local performance comparison and activation disposition (`L-1`)

The prospectively frozen B/R/C comparison passes its relative criteria: 54 sessions, 3,456 measured
commands, six balanced orders, all semantic/replay assertions passing. The private candidate improves
paired medians by 10.2%/12.0% versus current reference/signed `0c84e5cc` at 10,000 items and
29.7%/29.0% at 100,000 items; the medium result is narrow. Tail and reference-baseline regression
rules pass, with all raw observations and warning output retained. This synthetic Node comparison
does not measure encrypted storage or paint.

The unchanged application gate on a disposable candidate activation variant fails Android card
typing: 63.5 ms p95 against <16 ms; desktop is 12.9 ms. Other budgeted metrics pass. All twelve
cases execute, all thirty measurements survive, no retry occurs, and processes drain normally.
The prospective document's seven-per-project count was a clerical error; the exact frozen stage
always contains six per project. The original protocol and this correction both remain.

Do not activate Local by default. Keep the candidate private and F-17 partial. The last reference
application observation is still 15.2/69.4 ms; do not treat the separate candidate run as a paired
browser speedup estimate. Next diagnose remaining candidate browser cost before choosing another
repair. General integration remains 261 files / 2,073 dispositions (11 N/A), with 96 command and
63 campaign obligations; no aggregate or physical-device qualification follows. No product source,
test, adapter, personal package or browser changes occur in this performance phase.
[Protocol and results](./f17-local-performance.md);
[evidence](./account-conformance-runs/2026-09-14-f17-local-performance/README.md).


## 2026-09-15 — Physical Pixel 9a companion comparison (`L-1`)

Run four fresh synthetic Local origins in fixed R/C/C/R order on the author's Pixel 9a,
Android 17 and Chrome 152.0.7977.83. Every session verifies the complete 20-day × 15-card and
400-line Goals corpus after reopening, collects 120 trusted keys per typing surface, and preserves
the exact measured card text through another lock/reopen. All 960 samples and all four successful
semantic checks survive; the measured campaign completes without retries and removes its Chrome
debugging forward.

Card p95 is 107.9/87.1/86.9/108.3 ms in session order: C is 19.3% and 19.8% lower in the two
opposite-order pairs, but all four card measurements fail <16 ms. Compose p95 is 14.8/14.4/14.2/15.7
ms; compose, focus, cold/warm application work and replay budgets pass in every session. The native
keyboard-open viewport matches across typing samples. Actual event gaps include USB/browser command
completion before the fixed 50 ms pause; input cadence is not equal across variants. Temperature
rises 34.6→37.6 °C at 81% charge. This one-phone automated-input comparison does not qualify the
on-screen keyboard path or a device fleet.

Setup qualification found and repaired fixture-only JavaScript escaping, asynchronous factor/text
readiness, and tap/focus/selection/viewport races. Earlier failed attempts and diagnostic observations
remain separate from the four comparison runs. The independently checked packet preserves exact
adapter/recorder/build metadata, raw samples and prior source/preservation pins. No product default
changes; F-17 and the failed emulation gate remain open. Adapter obligations stay 96 command /
63 campaign, with no remaining test-file adapter. Next: the operator's on-screen keyboard,
autocorrect/composition, undo and lock/reopen exercise, then bounded card-path profiling before
another optimization. Temporary test servers and the dedicated adb server remain for that exercise;
the debugging endpoint is disconnected. [Evidence](./account-conformance-runs/2026-09-15-f17-pixel9a/README.md).


## 2026-09-15 — Close the phone comparison and resume candidate diagnosis

The operator cancels the remaining physical-device campaign, including the planned manual
keyboard exercise. Preserve its completed four-session evidence without claiming that exercise
passed. The fixture server exited cleanly after removing its five owned USB reverse forwards;
the dedicated ADB server on port 5047 is stopped. Keep the emulation reference values and use
roughly 1.5 times card-typing latency for planning only: C 87.0/63.5 = 1.37; R 108.1/69.4 = 1.56.
These separate sessions are not a controlled hardware calibration or evidence for other metrics.
Resume the [bounded private-candidate browser profile](./f17-local-profile.md) once, with unchanged
samples and source-mapped attribution before another repair. Default activation stays refused.


## 2026-09-15 — Attribute remaining private Local card work

The unchanged owned browser diagnostic passes once on the isolated Local handoff variant:
4 cases, no retries/skips, 1,440 raw timings, 4 CPU profiles, exact text/cold-reopen checks and
process drain (208.584-second stage). Full maps independently reproduce 2,168 mapped nodes;
79 mapped application source files match the activated candidate. Original workspace identity
is unchanged during execution. Card diagnostic p95 is 14.6/13.7 ms desktop and 80.5/68.7 ms
CPU-4x Android across the two blocks; these do not replace the prior 12.9/63.5 ms application
gate observation. The later bare-CodeMirror tail persists and limits timing interpretation.
Across separate 60-key profiles, full history copying takes 345.2/1,558.4 ms desktop/Android,
including document copying 170.3/770.1 and stack copying 172.4/778.8. Full comparison uses
190.2/804.8 ms and publication/listeners 61.4/489.9 ms. Nested totals overlap; callback self time
does not isolate structuredClone. Native/unmapped and GC samples are retained.

Next define and test an ownership contract for private immutable selection snapshots: detach
at capture, safely reuse only owned sealed values, detach on restore, and prove foreign/stale
reference, nested-alias, undo/redo and lifetime behavior. Keep generic history forks fully detached,
full verification and durable admission unchanged. Both rejected metadata copiers remain rejected;
no speedup or default activation follows from this diagnosis. F-17 is partial; adapter obligations
remain 0 test-file / 96 command / 63 campaign. [Protocol and next phase](./f17-local-profile.md);
[evidence](./account-conformance-runs/2026-09-15-f17-local-profile/README.md).


## 2026-09-15 — Selection-snapshot ownership contract and baseline controls

Define the [private selection-snapshot contract](./f17-selection-snapshots.md): capture a detached
payload once behind an owner-issued opaque token, reuse only same-owner tokens in explicitly owned
metadata, restore detached selections, and invalidate on owner close without erasing snapshots a
live sibling history still needs. Generic metadata forks remain fully detached. Weak-key lifetime
must not be replaced by a strong global registry; shallow freezing does not establish immutability.
The component and its owner/forgery/closed-token controls are the next phase, not implemented here.

Six owned suites pass 118 cases with no skips/retries and process drain. Four new registrations
cover 96 generated retained-branch histories, frozen/lookalike generic metadata, and 80 generated
master/card ledger histories under each current preparation strategy. The independent ledger
checks text, selections, undo/redo, revision, failed-write retry/discard, remote prefixes and cold
replay. Three faults are detected: shallow nested sharing, empty before capture and stale after
capture. The first sharing attempt failed earlier at prototype normalization; production-shaped
cloned fixture metadata makes the corrected control reach the intended alias assertion. Both
attempts remain. No production defect was identified and all runtime bytes remain unchanged.

All 17 selected runner/registration checks, TypeScript, scoped source style, inventory/manifest and
authority checks pass. Exactly four cases and one denominator-title update are reviewed; all other
contracts, deadlines and exclusions remain. General integration is 261 files / 2,077 dispositions
(11 not applicable). Wrapper obligations remain 0 test-file / 96 command / 63 campaign. Full unit,
native and timing aggregates are not rerun in this baseline-only phase. F-17 remains partial, the
application gate remains failed, and the rough 1.5× Pixel card estimate remains planning context.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-contract/README.md).


## 2026-09-15 — Unmounted private selection-snapshot owner

Implement [the private selection owner](./f17-selection-owner.md) without connecting it to the
editor. Capture detaches and validates a complete selection Map behind a fresh opaque token;
restore returns a fresh graph; metadata fork reuses recognized tokens in a new outer Map. Foreign,
forged, cloned and closed-owner tokens refuse. A private WeakMap supplies identity and lifetime,
with no strong inventory or per-branch revocation. Reentrant close during capture prevents issuance.
History-to-owner binding and workspace shutdown ordering remain explicit integration obligations.

Seven owned suites pass **127 cases**, including nine new component cases and the unchanged
adjacent history/admission/delivery regressions, with no skips/retries and process groups drained.
The component runs 200 generated graph/isolation examples (seed 150903), 160 independent branch/
group lifetime histories (150904), and 80 malformed sparse-array examples (150905). The last
property exposed a defect in the initial unmounted validator: extra properties could disguise
holes from a key-count/Array.every check. Requiring consecutive array indexes fixes the retained
minimal counterexample. Original source/test, failed run and repaired pass survive. Four deliberate
faults are detected: borrowed input, lent restore payload, shared owner registry and invalidation
of a token retained by a sibling branch. GC timing and forensic erasure are not claimed.

All 17 selected runner checks, TypeScript, scoped source format/lint, inventory/manifest, crypto
census and authority checks pass. One reviewed source and one nine-case adapter are added; prior
runtime files, contracts, deadlines, exclusions and crypto classifications are preserved apart from
the exact denominator-test title update. General integration is **262 files / 2,086 dispositions
(11 not applicable)**. The 96 command / 63 campaign obligations remain. Five prior phase packets,
52 personal/vector pins, append-only record prefixes and L-2 are preserved. No full unit, native
or performance aggregate is run in this unmounted phase; the application gate remains failed at
12.9/63.5 ms desktop/CPU-4x Android card p95. No default activation or speedup is claimed.

Next integrate an explicit private Local variant with workspace/history owner binding and all
metadata producers/consumers converted together. Retain the generic reference and current Local
handoff for comparison. Generated/native retry, discard, grouping, slicing, remote, reentrancy and
close checks precede a new prospective performance comparison and the unchanged application gate.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-owner/README.md).


## 2026-09-15 — Explicit private Local selection-snapshot integration

Integrate [owner-bound selection history](./f17-selection-integration.md) through the explicit
internal `local-snapshots` variant. Default Local/Account and the existing reference/Local-handoff
paths remain available. A workspace capability binds even empty histories to its live owner;
generic forks refuse owned histories. Group before/after capture, history fork, undo/redo metadata
transfer and detached restore now use recognized opaque tokens together. History documents, stacks,
ranges and restored selections stay detached. No token or history handle is exposed to the UI.
Private admission retains its complete comparison, revision/job/slice/writer binding, byte leases,
retry and source guards. Teardown disposes histories after write/preparation drain, then closes the
snapshot owner. A targeted startup check found a new cleanup gap: synchronous opener throws escaped
the initial Promise.catch. A surrounding try/catch repairs it; original source/test and red/green
runs are preserved. The defect preceded history allocation and is not evidence of content loss.

All **86 workspace cases** pass, including the same 27 shared cases under three variants, existing
Local controls, and new activation/startup/close checks. The new seam suite passes five cases,
including 120 generated retained-branch/cursor histories (seed 150906). Existing accepted-state
and independent master/card selection ledgers run 80 histories per variant (140925/150902).
Thirteen affected and timing-follow-up owned suites pass **215 cases** with no skips/retries and
process groups drained. Five deliberate faults fail their intended assertions: missing history
binding, cloned tokens, stale after capture, omitted undo transfer and premature owner close.

Native pending-state and original-order delivery campaigns each pass directed cases plus **100
generated histories** (seed 8941), explicitly selecting the new variant in disposable Chromium
profiles. The owned workspace catalogue passes **10 cases and all four mutations**, with browser
and process drain. The first native run passed all ten cases but its whole-state pending-history
mutation destroyed the active candidate and timed out before reaching the privacy assertion. The
replacement fault exposes the candidate undo stack without replacing the accepted document; the
original error run and both catalogue definitions remain, with the same assertion and limits. Full units initially pass 99 files / 1,141 tests before startup repair; the next
run times out in the same two unchanged five-second Account-liveness/position-decision cases noted
previously. Both pass in isolation, and one unchanged full repeat after repair passes **99 files /
1,141 tests**. All runs remain; the cause is not established and loaded-host qualification stays open.

All 21 selected runner checks, types, scoped source style, inventory/manifest, census and authority
checks pass. Registration adds five seam cases and thirty workspace cases while retaining every
previous case and contract except the denominator-title update and the reviewed pending-history
mutation target repair. General integration is **263 files /
2,121 dispositions (11 not applicable)**, with 0 test-file / 96 command / 63 campaign obligations
remaining. Only the Yjs seam, admitted workspace and the snapshot owner's descriptive comment change
runtime source bytes in this phase. Crypto classifications, six prior packets, 52 personal/vector
pins, append-only prefixes and L-2 remain intact. No performance measurement or default activation
occurs. F-17 remains partial and the application gate remains 12.9/63.5 ms desktop/CPU-4x Android
card p95, with Android failing <16 ms. Next specify and run a balanced comparison with the reference,
existing Local handoff and appropriate signed baseline before the unchanged application gate.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-integration/README.md).


## 2026-09-15 — Private Local selection-snapshot performance decision

The [prospective four-variant comparison](./f17-selection-performance.md) completes **64 fresh
sessions, 5,248 warmups and 4,096 measured insertions**, with all exact text/caret/revision/history
and canonical cold-replay checks passing. B is complete signed `0c84e5cc`; R/H/S share current
runtime/dependency bytes with explicit reference, Local-handoff and Local-snapshot selection.
Four balanced orders cover three 100,000-character document item-count strata plus a deeper
10,000-item history growing from 256 to 320 undo groups. The memory carrier excludes encryption,
IndexedDB and paint; this is a host engineering comparison, not fleet qualification.

The snapshot increment over H is **2.9%** at 10,000 items with shallow history and **10.3%** with
deeper history. The prospective rule requires >=10% in both, so the relative gate **fails**.
Cumulative S/R and S/B benefits and all median/p95 regression guardrails pass. At 100,000 items
S is 0.7% slower than H by median paired ratio; the substantial cumulative gain comes from the
existing handoff. Preserve the mixed result rather than declaring a broad snapshot speedup.

The unchanged application gate runs **once** on a disposable current-source build with exactly
one runtime patch selecting `local-snapshots` at the Local opener. All twelve cases execute and
all thirty measurement rows are retained; browser, process group and localhost server drain.
Card p95 is **12.2/75.1 ms desktop/CPU-4x Android** against <16 ms. Android focus is
**54.2 ms** against <50 ms; both Android budgets fail. The remaining budgeted metrics pass. The failure is reported through the deferred afterAll budget hook,
not a navigation correctness failure. The earlier H observation (12.9/63.5 ms) is a separate,
unpaired run; its difference from this run is not a controlled browser treatment effect.

Default Local and Account retain the reference. No runtime, adapter, manifest, census or registry
changes occur in this phase. F-17 stays partial; general integration remains **263 files / 2,121
dispositions (11 not applicable)** and unresolved obligations remain **0 test-file / 96 command /
63 campaign**. Seven preceding evidence packets, 52 personal/vector pins, append-only prefixes
and L-2 are preserved. The packet embeds all command observations, helper/protocol bytes,
application measurements/receipts and preservation data; large pinned inputs and bundles remain
under ignored local test-results with hashes. No personal app, phone, relay or deployment changes.

Next: Review and sign the accumulated bounded phases, then profile the snapshot application variant to separate remaining document/history fork, full comparison and publication costs before choosing another repair. Retain the unchanged budgets and failed measurements.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-performance/README.md).

| Seed items / history | Signed B | Current R | Handoff H | Snapshots S |
| --- | ---: | ---: | ---: | ---: |
| 1,000 / 24–88 groups | 12.41 | 12.57 | 12.26 | 11.84 |
| 10,000 / 24–88 groups | 21.06 | 21.21 | 18.53 | 18.06 |
| 100,000 / 24–88 groups | 92.34 | 94.57 | 63.85 | 64.48 |
| 10,000 / 256–320 groups | 22.74 | 22.81 | 20.51 | 18.48 |

Values are medians of four session medians, in milliseconds. Decisions use the retained paired
ratios, not ratios of this summary table. Raw within-session timings are dependent.


## 2026-09-15 — Reconcile the F-17 signed commit backlog

Eight completed bounded phases are grouped into five newly signed descendant commits above
`0c84e5cc`: `67d31c75` Local handoff; `a245fb7f` its performance/Pixel/profile evidence;
`ffc0d370` selection contract and unmounted owner; `15eb389c` private Local snapshot integration;
and `e2d42fac` the final performance decision. All five signatures verify. A following documentation
commit carries this reconciliation. No existing commit or historical receipt identity is rewritten.

The final content commit contains all 219 original pending files byte-for-byte. The handoff,
component and integration checkpoints match respectively 1,059, 1,061 and 1,062 non-document
files of their retained frozen phase inputs, including tests/runners/configuration; corresponding
registry/census snapshots also match. The grouping uses exact saved versions where available,
combines related phases where useful, and recovers append-only records by verified byte prefixes.
Unavailable intermediate mutable summaries are not invented; the current checkpoint is reconciled
here. All 177 files across eight original evidence packets, 52 personal/vector pins and L-2 remain
unchanged. Three unrelated root files are left untracked and untouched.

[Commit map and reproducible checks](./account-conformance-runs/2026-09-15-f17-commit-backlog/README.md).
The original phase results are not reruns at the new commit IDs. F-17 remains partial, defaults
remain reference, and the latest application gate remains failed at 12.2/75.1 ms desktop/CPU-4x
card p95, with Android focus 54.2 ms. Counts remain 263 files / 2,121 dispositions (11 not applicable),
with 0 test-file / 96 command / 63 campaign obligations unresolved. No runtime or test changes,
measurement campaign, personal app operation or deployment occur during this bookkeeping turn.

The backlog through this performance phase is closed. Next profile the snapshot application's
remaining document/history fork, complete comparison and publication costs before another repair;
retain the unchanged budgets, failed observations and loaded-host uncertainty.


## 2026-09-15 — F-17 exploratory optimization round 1

Three isolated agent prototypes (primitive-string fork transport, bounded comparison scratch pooling, and conservative private publication reuse) compose above signed `20a535c4`. All twelve serial browser timing sessions pass exact text, undo/redo and cold reopen. On the held-aside full corpus, B/C/C/B gives about 9.4% paired median improvement; paired p95 improvements are 8.6% early and 5.6% later. These are incremental exploratory gains; the application budget remains unmet. Combined focused checks pass 5 files /126 cases and TypeScript. Review found and repaired boxed-string sharing eligibility and stale publication after surrogate normalization; publication now conservatively excludes emoji-bearing snapshots. A separate profiling postcheck exposed a premature immediate Undo assertion; a bounded follow-up reproduces the unchanged immediate read and observes the same action settle within 160 ms, then passes redo/cold reopen. All failed evidence remains.

Allocation sampling suggests less churn with slightly more retained heap; it does not establish a GC-time improvement. Keep the combined patch as the next experimental baseline, then remove components in controlled comparisons and target remaining editor/rendering/history costs. No main runtime/test/default changes, full suites or release gate runs occur. Counts remain 263 files /2,121 dispositions (11 not applicable), with 0 test-file /96 command /63 campaign obligations unresolved. F-17 remains partial. [Assessment](./f17-exploration-r1.md); [patches, data and logs](./performance-experiments/2026-09-15-f17-r1/README.md).


## 2026-09-15 — F-17 exploratory component removal and editor projection

Round one is signed and signature-verified as `cc0f85c5`. Round two keeps primitive-string preparation reuse, bounded comparison pooling and an editor projection shortcut as the next experimental combination. Two forward/reverse ablation blocks show conditional median gains of about 5.8%/5.9% for preparation, 5.5%/6.7% for pooling and 2.9%/3.3% for publication, early/later respectively; these are not additive effects. Publication is parked because its requested-Unicode guard is mixed early and slower in both later comparisons, with substantial host variation and an explicitly retained setup-assertion limitation. Its useful ordinary-text result and patch survive.

The editor shortcut removes unchanged-text scans and redundant CodeMirror selection transactions while retaining every authoritative read. Review preserved forced composition-end reconciliation. Against preparation + pooling, four serial full-corpus sessions give 3.3% early /4.0% later paired median gains; p95 gains are 5.0%/7.3%, including one individual later p95 regression of 1.0%. A separate single Unicode pair with explicit setup assertions passes and gives 2.4%/2.5% median gains. It is a guard observation, not a broad effect estimate. No direct net comparison against the previous complete combination is claimed.

All 18 fresh browser sessions /1,440 measured keys /1,872 warmup keys pass exact typing, bounded undo/redo and cold reopen; browsers and loopback servers drain. The selected composition passes 4 focused files /127 cases and TypeScript. Earlier helpers, raw data, component patches and the complete selected patch are retained. No full unit/native/release or new memory/profile campaign runs. Main runtime/tests/defaults remain unchanged; F-17 remains partial. Counts stay 263 files /2,121 dispositions (11 not applicable), with 0 test-file /96 command /63 campaign obligations unresolved. The latest unchanged application gate stays 12.2/75.1 ms desktop/CPU4 card p95, with Android focus 54.2 ms.

Next profile the selected combination and make another bounded optimization decision; reserve native IME/pending/remote, scratch-lifetime/memory and unchanged application-gate qualification for RC entry. The Rust/Wasm assessment identifies a substantial potential engine/integration migration, with existing journal encryption already using a narrow Wasm kernel. It starts no migration. Prior evidence, personal/package/vector pins and L-2 remain unchanged. [Assessment](./f17-exploration-r2.md); [source and evidence](./performance-experiments/2026-09-15-f17-r2/README.md).


## 2026-09-15 — F-17 selected-combination profile and primitive any strings

Round two is signed and signature-verified as `602e4cee`. Two full-corpus diagnostic profiles identify repeated native UTF-8 encoding in top-level Yjs value strings as a remaining target: dominant fork callsites take 1340/1351 ms inclusive and complete comparison 999/996 ms across 60 profiled keys; all encodeInto self samples total 515/468 ms. Inclusive values overlap, and sampled allocation (225.3/223.8 MB including collected objects) is neither retained heap nor comparable to round one's smaller profiling corpus.

The candidate extends existing private immutable-string fork transport and complete comparison fields to primitive ContentAny strings. Only the Yjs seam differs at runtime from the prior selected preparation + pool + editor combination. Nested objects, binary detachment, native outgoing format, full normalization, pending dependency checks and scratch cleanup remain. Eight new focused cases, including 150 generated differential cases, plus 126 affected regressions pass; TypeScript and scoped formatting pass. Two deliberate faults are detected, including a generated false-equality counterexample. The initial unsupported-undefined fixture failure and formatting failure are retained; exact candidate runtime bytes are restored before build.

Four serial ordinary-text sessions selected/candidate/candidate/selected all pass. Paired median gains are **12.7% early /13.7% later**, with **29.7% /30.1% p95 gains**; every individual comparison favors the candidate. Median-of-session values fall from 53.90/55.55 to 47.05/47.95 ms, and p95 from 72.85/74.40 to 51.20/52.00 ms. The separate explicit-Unicode pair passes and improves medians by 7.8%/11.0%. All six timing sessions /480 measured keys /624 warmups and both separate diagnostic sessions pass exact text, bounded undo/redo and cold reopen, with browser/server drain. No candidate memory profile or full release gate ran; p95 gains do not establish a GC-time reduction. Small session count, dependent keys and host variation remain explicit.

Retain the extension in the experimental combination, preserving all prior patches and observations. Next share one per-snapshot UI card lookup across the nine Collections; emitted-source inspection confirms repeated index construction, while React Compiler already caches some other components. Keep the detached authoritative projection fresh and use focused guards plus another short paired screen. Native/private-codec/scratch-memory and unchanged application qualification remain ahead of RC entry. Main runtime/tests/defaults are unchanged; F-17 stays partial and the latest actual gate remains 12.2/75.1 ms desktop/CPU4 card p95 with Android focus 54.2 ms. Counts remain 263 files /2,121 dispositions (11 not applicable), with 0 test-file /96 command /63 campaign obligations unresolved. Prior packet, personal/package/vector pins, append-only records and L-2 are preserved. [Assessment](./f17-exploration-r3.md); [source and evidence](./performance-experiments/2026-09-15-f17-r3/README.md).


## 2026-09-15 — F-17 shared UI card lookup experiment

Round three is signed and signature-verified as `55ab217e`. This increment shares a detached-snapshot card lookup from WorkspaceUiProvider across Collections, preserving every authoritative read, current memberships/actions/status and last-ID-wins/missing-ID behavior. Only two UI runtime files differ from the selected combination. The actual React Compiler build confirms removal of the Collection Map construction site and its placement in the provider memo; these are static sites, not measured execution/allocation counts or an exactly-once guarantee.

Seven new cases include 50 generated publication histories; six affected files add 42 cases. All 49 unique focused cases, TypeScript and scoped formatting pass. Deliberately stale-index and wrong-key faults fail five/seven and seven/seven cases, including generated counterexamples; source is restored before final checks/build. No candidate correctness failure is observed. The unavailable formatter discovery and premature all-session analysis invocation are retained tooling/orchestration errors, with no timing session discarded or rerun.

All six serial browser sessions /480 measured keys /624 warmups pass text, bounded undo/redo, cold reopen and browser/server closure. Two opposite-order ordinary pairs yield 0.3% early /2.7% later median gains. Later p95 improves 4.9%, but early p95 worsens 8.0% in both pairs. A separate explicit-Unicode guard passes, with mixed timing and later p95 worsening 7.6%. Small session count and 40-sample block p95 limit inference; no causal population effect, GC/heap benefit or budget pass is established.

Preserve the UI-only and complete patches as an optional component, but keep round three's preparation + pool + editor + primitive value-string combination as the selected baseline. Deferring selection reflects the mixed tail result, not a minimum percentage win requirement. Next refresh CPU/allocation profiles of that combination before choosing one narrow comparison-byte, document/history allocation or membership repair. Native/private-codec/scratch-memory and unchanged application qualification remain ahead of RC entry.

Main runtime/tests/defaults are unchanged. F-17 stays partial; the latest actual gate remains 12.2/75.1 ms desktop/CPU4 card p95 with Android focus 54.2 ms. Counts remain 263 files /2,121 dispositions (11 not applicable), with 0 test-file /96 command /63 campaign obligations unresolved. The previous packet's 74 file identities, 52 personal/package/vector pins, append-only records and L-2 are preserved. Personal app/server, phone, relay and deployment remain untouched. [Assessment](./f17-exploration-r4.md); [source and evidence](./performance-experiments/2026-09-15-f17-r4/README.md).


## 2026-09-15 — F-17 application workspace/history growth diagnostic

Following signed `ac0b84ce`, the operator adopts architectural cost reduction while retaining the R3 combination. Eight serial fresh encrypted Local sessions cross 300/600 seeded cards with retained/cleared history after 1,000 trusted editor keys, in two reversed blocks. A build-only hook proves identical canonical/history-document bytes, content, selections, revision/group/writer across clear. Actual deep undo ranges are 1,010–1,090 versus 8–88. All 1,280 main timing samples and 7,424 untimed setup/warmup keys survive; exact text, one-key undo/redo, cold reopen and owned process drain pass. Six real-Yjs hook cases include two discriminating faults; both small native smoke branches pass.

The first full attempt's immediate accelerated-setup text check fails; a separate reproduction observes delayed visibility settle within 548.6 ms, reaches 1,002 groups and passes undo/redo/reopen. The original 80 measured samples, repro 160 and smoke 32 remain separate from the main comparison. Before campaign-v2, only the untimed 100-key checkpoint changes to a 3,000 ms bounded exact-text wait. Product deadlines, measured 50 ms gaps and all factorial conditions remain unchanged. No product input-loss repair is claimed.

Paired 600/300 deep median ratios are 1.593 with history retained and 1.452 after clearing; all individual size comparisons increase. Retained/cleared median ratios are 1.053 at 600 cards and a mixed 0.959 at 300. Actual struct counts are 2,797/5,577 and remain constant early→deep; the edited card adds 1,001 encoded bytes. Whole-document work is the clearer priority, but this does not isolate individual functions or establish strict complexity. Clearing history does not measure persistent buffers' full benefit because both arms still fork the document. Accelerated setup, append typing, two selection targets, one host and few session replicates limit generalization.

Next: conservative repaired-basis eligibility for the text command's one pre-repair scan, preserving queued-remote, source, refusal/retry/discard and ownership behavior. Incremental publication, persistent buffers with full verification, then incremental verification's proof/policy follow separately. Static repair prep is retained; no optimization is implemented here. No full suite, CPU/allocation profile, phone campaign or application gate runs. Main runtime/tests/defaults and counts remain unchanged: 618 obligations; 263 files /2,121 dispositions (11 not applicable); 0 test-file /96 command /63 campaign unresolved. F-17 remains partial; last gate 12.2/75.1 ms card p95 and 54.2 ms Android focus remain. All 66 previous-packet files, 52 personal/vector pins, root perspective, L-2 and append-only prefixes verify. [Assessment](./f17-growth-r1.md); [evidence](./performance-experiments/2026-09-15-f17-growth-r1/README.md).


## 2026-09-15 — F-17 membership-repair eligibility experiment

The growth diagnostic is committed signed and signature-verified as `62b19f94`. The next isolated candidate adds a per-owner WeakSet of repaired histories. Successful command execution records only that candidate; trusted forks inherit from the accepted basis, and every remote event invalidates before apply/publication. Only text on a known repaired basis skips its single pre-command scan. Structural/undo/redo repair, full verification, source capture, pending/refusal/retry/discard and existing history ownership remain. The unconditional adapter supplies the differential oracle; no public workspace flag authorizes the shortcut.

Nine affected files pass 176 tests, including 18 new cases and 60 generated differential histories. Dirty remote subscriber input and later pending membership dependencies repair before the queued repair command. Account system/human source bytes reconstruct the complete accepted state. Missing remote invalidation and premature accepted-cleanliness faults fail all four selected owner-mode assertions each. TypeScript and the final focused repeat pass. Initial sparse-checkout and fixture-type corrections remain; no runtime correctness repair was needed.

All six serial browser sessions /480 measured keys /624 warmups pass exact text, bounded undo/redo, existing cold-corpus/edited-card reopen checks and owned process drain. Two opposite-order ordinary pairs yield 5.5% early /10.1% later median gains, with 12.1%/9.4% p95 gains. Individual later median gains vary 4.50%–15.64%; Unicode medians improve 4.86%/4.41%. Every paired median/p95 favors the candidate, but this small screen establishes no fleet, memory, GC, long-history or budget claim. The first loopback launch was sandbox-blocked before browser creation; its log and drained parent record remain without a child result. New identities run the unchanged measurement with host permission.

Retain repair eligibility on the R3 combination. Next incremental publication, then persistent text-history buffers with full verification, then incremental verification's separate proof/policy decision. Keep optional UI/publication patches. No main runtime/test/default, full-gate or release-adapter change occurs: F-17 stays partial; last gate is 12.2/75.1 ms card p95 and 54.2 ms Android focus. Counts remain 618 obligations; 263 files /2,121 dispositions (11 not applicable); 0 test-file /96 command /63 campaign unresolved. The prior packet, 52 personal/package/vector pins, root perspective, append-only prefixes and L-2 verify unchanged. New phase work is uncommitted. [Assessment](./f17-repair-r1.md); [source and evidence](./performance-experiments/2026-09-15-f17-repair-r1/README.md).


## 2026-09-15 — F-17 incremental publication experiment

The membership-repair phase is signed and signature-verified as `e0a87263`. The next isolated candidate keeps a private accepted-revision projection cache, observes actual changed Yjs types, refreshes changed and normalization-sensitive fields, and falls back for structural/unknown changes or stale plans. Remote input invalidates before apply/publication, every public read remains detached, and full verification remains. Other owner modes retain the full reader. The new cache is not integrated into main runtime or default activation.

Final controls pass 218 unique tests in 13 files, including nine new cases /60 generated histories, prior normalization/editor controls, TypeScript and scoped formatting. Missing normalization refresh, ignored structural fallback and aliased output faults each trigger their designated assertion. A real candidate defect returned stale undo counts after the existing out-of-band history-clear diagnostic; reading the two current scalar stack lengths repairs it. A separate split-pair fixture had already normalized its input before the intended fork; its setup assertion is corrected using distinct writer items. Original source/tests/failures and final controls remain. Timing runs only after fault restoration and builds.

All six serial browser sessions /480 measured keys /624 warmups pass text, bounded undo/redo, existing corpus/edited-card reopen checks and owned process drain. Ordinary early median effects reverse sign; later medians regress 3.7% and 21.0% across opposite-order pairs, with p95 regressions 9.3% and 27.1%. Median paired ratios give 1.1% early /12.3% later median regression and 0.3%/18.2% p95 regression. The separate Unicode guard also regresses, by 8.2%/1.3% at the median. No sample is discarded or rerun. The small screen does not establish stable effect size, causality, memory/GC, deep-history or population claims.

Park this implementation as an optional patch; keep R3 preparation + comparison pool + editor shortcut + primitive value-string reuse + membership-repair eligibility as the selected combination. Preserve the new controls and useful source-work reduction. Public whole-snapshot cloning remains; no profile attributes the regression. Next persistent text-history buffers with full verification, then incremental verification's separate proof/policy. Native ownership/memory/Account composition and the unchanged application gate still precede RC entry.

Main runtime/tests/defaults and release counts remain unchanged: 618 obligations; 263 files /2,121 dispositions (11 not applicable); 0 test-file /96 command /63 campaign unresolved. F-17 stays partial; last actual gate remains 12.2/75.1 ms card p95 and 54.2 ms Android focus. All 416 frozen source/bundle/helper identities, the previous packet, 52 personal/package/vector pins, original control inputs, root perspective, signed append-only prefixes and L-2 verify unchanged. Personal app/server, phone, relay and deployment remain untouched. New phase is uncommitted. [Assessment](./f17-publication-r1.md); [source and evidence](./performance-experiments/2026-09-15-f17-publication-r1/README.md).


## 2026-09-15 — F-17 persistent text-history buffer experiment

The publication phase is signed and signature-verified as `85a58bd4`. The next isolated candidate introduces explicit retirement and one-time reownership of a previous accepted state, permitting two Local document/history objects to alternate. A saved native delta brings the retired buffer forward, followed by full undo/redo stack copying and a full comparison with the accepted basis before editing. Existing post-admission full verification remains. Actual text-only changes authorize retirement; remote/structural/undo/metadata paths reset it. A conservative normalization guard excludes surrogate-bearing and unsupported shapes, so the Unicode condition uses fresh forks.

All 224 unique affected tests across 15 files pass, including 14 new cases /60 new generated histories. Premature retirement, omitted catch-up and shared-history faults are detected. Real object identity, mutable range/metadata detachment, consumed-byte erasure, selection, slicing, undo/redo, refusal/retry/discard, write-lease close and cold replay are checked. An initial close-fixture assumption and mistaken negative-zero expectation are corrected. A native-fork probe confirms that sparse holes and extra/nonenumerable properties change; the original guard's eligibility gap is repaired. Original source/tests/failures survive.

The first four browser sessions all pass but do not favor the candidate. Final lifetime review finds an unnecessary strong lastAdopted reference after finish/close; the current bounded slot now supplies that identity. The complete original frozen source/build/control snapshot and 320 measured keys /416 warmups remain separate. After repair, 121 affected ownership/workspace cases, TypeScript and all three faults pass again. The rebuilt final candidate completes six fresh sessions /480 measurements /624 warmups, all passing semantic, treatment and process-drain checks. Every ordinary candidate block records exactly 40 reuses; selected and Unicode blocks record zero. All 418 final source/bundle/helper identities remain frozen.

Final ordinary paired medians regress 6.8% early /4.0% later, with 5.0%/4.3% p95 regressions; every individual ordinary pair is slower. Unicode fallback medians regress 3.2%/2.1%, with mixed p95. The small descriptive screen does not establish cause, stable effect size, GC/heap, long-session or population claims. No sample is discarded or pooled across the two versions.

Preserve this implementation and its retirement controls as an optional prototype; keep R3 + membership-repair eligibility selected. Next measure the added catch-up comparison and stack-copy costs against the saved fork, and specify replay-basis equivalence before considering a cheaper replacement for the prototype's added check. The existing post-admission comparison stays fixed. Incremental stack mirroring, wider normalization eligibility and native ownership/crash/memory/Account qualification remain; incremental verification of the existing canonical check is a separate later proof/policy decision.

Main runtime/tests/defaults and release counts are unchanged: 618 obligations; 263 files /2,121 dispositions (11 not applicable); 0 test-file /96 command /63 campaign unresolved. F-17 stays partial; last actual gate remains 12.2/75.1 ms card p95 and 54.2 ms Android focus. No aggregate receipt or budget change is added. Previous packet, 52 personal/package/vector pins, root perspective, signed append-only prefixes and L-2 verify unchanged. Personal app/server, phone, relay and deployment remain untouched. New phase is uncommitted. [Assessment](./f17-buffers-r1.md); [source and evidence](./performance-experiments/2026-09-15-f17-buffers-r1/README.md).


## 2026-09-15 — F-17 replay cost accounting and bounded equivalence

The first buffer phase is signed and signature-verified as `aa54be31`. Four fixed instrumented application sessions /320 measured keys separate the added comparison (11.03/10.75 ms early/later) from native replay (0.95/0.97 ms), full catch-up stack copying (0.09/0.47 ms) and the selected fresh document fork (8.97/8.85 ms). These are component means, with inclusive scopes distinguished; no quantile subtraction or causal speedup is inferred from them.

The replay variant replaces only the prototype's added full comparison with an exact-predecessor/native-delta invariant and an idle transaction fence. Every existing full post-admission canonical comparison, writer/revision/slice check and complete detached history copy remains. Transactional drift still refuses before another append. Raw private-field/payload/stack/delta mutation is explicitly outside the sole-mutator contract and not validated by replay; a directed test demonstrates that limitation. The later canonical check is not used to justify a wrong pre-write basis. Pinned-source reasoning covers normalization exclusions, text-only transitions, old redone links, reset and disposal.

All 227 tests /16 files pass, including three new cases /100 generated replay histories (seed 171511) and the retained 60 workspace histories (171510). The new histories compare integrated/deleted state, per-clock redone relations, full stacks, nested-value detachment, native replay and later complete undo/redo. Four faults detect a missing idle fence, premature retirement, omitted replay and shared mutable stacks. TypeScript project compilation and scoped formatting pass. The failed formatter path and ineffective initial compiler invocation survive with corrections; no in-contract counterexample remains from this bounded campaign.

Six separate application sessions /480 measured keys /624 warmups pass text, bounded undo/redo, marker/count corpus checks, edited-card reopen and owned process drain. Both ordinary pairs favor replay: median paired gains 21.1% early /20.5% later, with p95 gains 21.5%/19.8%. Medians of session medians move 45.90→36.20 ms early and 45.65→36.30 ms later. Every ordinary candidate block actually reuses 40 histories; selected and Unicode reuse zero. The Unicode fallback median improves 2.6% early and regresses 0.7% later; its p95 improves 9.3%/1.5%. All ten diagnostic/performance sessions remain separate and retained. One host, two ordinary pairs, dependent keys and an unverified later history depth limit inference. Surrogates anywhere in the guarded history, including valid emoji, still disable reuse.

Recommend R3 + repair eligibility + replay buffers for the RC combination. Park the UI/publication candidates and the first guarded buffer variant. At the operator's direction this closes the optimization round: choose/freeze the combination, integrate it and qualify native ownership/crash/close/memory, shared Account effects and the unchanged application gate. Larger rewrites, incremental stack mirroring, broader normalization and incremental canonical verification become later work. Record any accepted latency shortfall explicitly as release debt without changing a failing receipt. This phase does not activate defaults or complete RC qualification.

Main runtime/tests and release counts remain unchanged: 618 obligations; 263 files /2,121 dispositions (11 not applicable); 0 test-file /96 command /63 campaign unresolved. F-17 remains partial; last actual gate remains 12.2/75.1 ms desktop/CPU4 card p95 and 54.2 ms Android focus. Both source/build freezes, the preceding packet, 52 personal/package/vector pins, root perspective, append-only prefixes and L-2 verify unchanged. Personal app/server, phone, relay and deployment remain untouched. New phase is uncommitted. [Assessment](./f17-replay-r1.md); [source and evidence](./performance-experiments/2026-09-15-f17-replay-r1/README.md).
