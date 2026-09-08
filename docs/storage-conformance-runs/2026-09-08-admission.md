# Ordered admission execution — 2026-09-08

**Scope:** phase-five production admission over the real factor-unlocked journal/content carriers, with
a private canonical Yjs document. The [component guide](../ordered-admission.md) specifies its API and
limits. This is not actual editor/IME/undo/transport integration, L-1 closure or a whole-contract pass.

The [complete admission report](./2026-09-08-admission.json) records **15 passing cases, 64 passing
assertions, six detected source mutations, zero harness/page errors, exit 0**. The
[journal regression](./2026-09-08-admission-journal-regression.json) passes **17 cases / 93 assertions**
and detects its **six** prior mutants, exit 0, including actual quota, freeze/death and chunked flush.

Both use Chromium **151.0.7922.34**, Playwright **1.62.0**, Node **26.8.1**, Vite **8.1.5**, macOS arm64.
They pin HEAD `9e60c6a` (the committed journal checkpoint) plus dirty-tree source hashes. Admission freezes
all **15 production modules**, including its three new modules, the Yjs seam and all custody/content/journal
dependencies. Its **33 recorded inputs** include the command/receive fixture, native fault fixtures,
runner/catalog/schedules, unit tests, component guide, contract, package/lockfile and WASM source/build
inputs. The regression records 28 inputs. Saved JSON reports are value-identical to the raw reports, and
every recorded input hash was checked against the completed tree.

## Exercised boundaries

| Case | Observed result |
| --- | --- |
| C01.pending-struct | An unresolved received struct is invisible but committed; after local input and actual renderer death, replay retains it and later basis delivery integrates it |
| C03.synchronous | Local canonical state and its detached projection update before handler return, after a stored journal receipt; actual renderer death preserves the accepted edit |
| C03.ordered-refusal | Quota forces content; while native sealing is paused, the first edit remains private, the second is unprepared, both tickets are pending and no publication occurs; renderer death recovers neither unacknowledged input |
| C03.retry | Content request success followed by abort leaves one counted invocation and no visible edit; retry uses a second content invocation and prepares the following intent against the accepted predecessor; cold replay is ordered |
| C01.remote-basis | A 17 KiB remote dependency remains private while native crypto is paused, then commits before publication; its deletion commits before dependent local preparation and offline cold replay |
| C02.pending-delete | Delete bytes received before their missing structs persist; local input and cold replay retain the pending deletion so later basis delivery cannot resurrect deleted text |
| C03.slicing | A 2500-character command prepares 1000-character slices; death while sealing slice two preserves exactly the first accepted/content-committed prefix |
| C03.capacity | Byte capacity refuses before enqueueing a large candidate, retains the previously admitted pending input and lets it complete |
| C03.barrier | A durability barrier waits behind pending input and ahead of a later intent; the later suffix can remain journal-only until a second barrier |
| C03.timer | The actual 250 ms timer flushes the journal to content and clears it, changing the owner to durable |
| C04.close | Closing while native encryption is paused refuses the input ticket, blocks exclusion until draining, withholds late content/publication and clears every captured WASM instance |
| C09.persisted-yjs | A real content carrier seals malformed Yjs bytes; admission open refuses with repair-required, retains the record and disposes its WASM owner |
| C09.runtime-repair | A now-unreadable journal blocks ordinary snapshots and pending discard, preserving the exact legacy entry |
| C03.validation | Authority-refused and malformed receive inputs never reach content or publication; a following valid local intent succeeds |
| C04.cross-tab | The receiving tab starts empty; sender update and dependent input remain private/unprepared while receive sealing is paused, then commit/promote in order and survive cold replay |

The fixture's projection and emitted-update inventory consume the **production accepted boundary**.
They do not claim to be CodeMirror, accepted undo, ordinary application export or a transport provider.
The command language, identity authority and receive validator are synthetic. An encrypted byte carrier
alone does not make arbitrary network input authorized; actual protocol validation remains required at
the integration boundary. The pending-struct/delete cases exercise retained unresolved information,
not a promise that missing, unacknowledged remote dependencies can be invented offline.

## Mutation controls and harness corrections

Each mutation runs against its own frozen production source. Detection requires the named assertion to
fail and its unmodified baseline to pass; unrelated page/execution errors are never detections.

| Mutation | Discriminating assertion |
| --- | --- |
| Publish before a forced content commit | Refused prefix remains private |
| Prepare queued input early | Only the head is prepared |
| Publish receive before content completion | Remote input remains private until commit |
| Retry a previously refused head through the journal | Retry consumes the second content invocation |
| Resolve durability immediately | Barrier waits for prior input |
| Ignore byte capacity | Byte capacity refuses |

Development run 01 passed 13/14 scenarios. Its receive-completion counter was attached after the carrier's
promise-settling listener; Chromium ran a microtask between the two listeners for the same native complete
event, so the fixture counted completion too late. The paused-commit and offline-recovery assertions passed.
The observer was moved to transaction creation, before the carrier installs its listener. The corrected
run passed all 15 cases and six mutants; final run 02 additionally makes the cross-tab receiver start empty
and pauses its content commit. Only final run 02 is this receipt's admission evidence.

## Validation and remaining work

Full Vitest passes **574 tests / 49 files**, including **20** new controlled-carrier admission tests.
They cover copied inputs/snapshots/events, stable local writer clocks and collision response, strict
update bounds, multi-slice progression, rejected async preparation, explicit suffix discard, retry and
flush failure, timers, reentrant observers and close during pending work. These tests use the real
admission owner and Yjs with controlled byte carriers; the browser scenarios supply actual encrypted
storage and lifecycle evidence.

Type checking, focused lint/format, build/budget/origin checks, vector generators/AAD coverage, WASM
verification and relevant contract/governance/traceability checks pass. Initial gzipped JavaScript remains
**306.3 kB / 350.0 kB** because the application is not wired to this owner. No primitive or selected carrier
encoding changes. The literal complete `pnpm check` chain, geometry, and separate unchanged custody,
content and phase-one browser suites were not rerun; the journal regression and admission scenarios use
their actual shared lifecycle and custody. `pnpm storage:admission` is included in the check chain.

The 256-job / 4 MiB conservative reservation bounds pending byte ownership; it is not a total-process
memory bound. Each command prepares against a full private Yjs clone. That cost grows with the document
and requires profiling/possible optimization before editor integration and low-end performance acceptance.
No admission p95 or supported-population budget is certified here. Operation-specific slicing, IME,
accepted undo and real transport semantics need their actual adapters and observation surfaces.

Complete identity/index/startup/clear/migration, exact trim, PRF, receiver/transition/reference composition,
supported platforms and independent review remain open. Full snapshots refuse known repair-required state;
the later UI must also respond to status by disabling its affected surfaces. Component close is logical
ownership disposal, not forensic clearing of all JavaScript/Yjs allocations. Existing raw-clone, localStorage
cleanup and old-writer-cutover limits remain in force. No debt is paid; only three matrix input pins change.
