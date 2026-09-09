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
