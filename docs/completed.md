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
