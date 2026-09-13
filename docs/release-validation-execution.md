# Release-validation execution — catalogue and reviewed general test adapters

The signed inventory is `a38bb6b`, foundation `568c2a5`, content `a44f09d`,
journal `b60a5c7`, admission `4eb1071`, editor-admission `ad475bc`,
workspace-admission `de6c65d`, owned-startup `4a908b0`, Local genesis `ebefde0`,
Local clear `d0e982c`, compaction `893def3`, custody `b32f7c2` and write-session
`3e53b4a`. The [crosswalk](./account-conformance-runs/2026-09-13-signed-review-history.json)
retains original unsigned IDs and proves each tree unchanged. Historical receipts retain the original
revision identity; the final aggregate must run at its own selected immutable revision.
The foundation supplies a finite obligation manifest,
an exact-case Node adapter, a shared bounded stage runner and a disposable execution entrypoint.
It **does not complete the release execution graph**. The original phase-2 proposal grouped the
runner foundation and every native/wrapper adapter together; inspection showed that the latter
requires its own bounded integration phases. Keep that work ahead of P-06 and the immutable run.

The [manifest](./release-validation-manifest.json) now contains 612 obligations, including all 276 current
required test files, 11 current catalogues with **163 cases and 54 discriminating mutations**, 29
vector corpora, 83 registry entries and exact selected package/phase command variants. Six retired
v8 test files remain excluded. Registry entry `remaining-coordination-names` remains explicitly
non-cryptographic: its disposition is checked by the live authority/registry check, not credited as
a cryptographic test. Whole-wrapper obligations stay separate from direct test-file obligations.

**253 obligations remain blocked.** This is a count of unresolved manifest rows, not defects or
missing tests in the product. The compiler refuses release execution before making a checkout.
Dynamic wrapper maps, before-source performance variants, conditional test selection, mutation
postconditions and native process ownership have not been guessed from previous green summaries.
Catalogue data is resolved through a finite AST interpreter; unknown syntax refuses without import.

## Commands and current execution scope

```sh
node scripts/release-validation/check.mjs
node scripts/release-validation/plan.mjs
node --test --test-concurrency=1 test/release-validation/*.test.mjs
node scripts/release-validation/execute.mjs --selection infrastructure
node scripts/release-validation/execute.mjs --selection vitest-properties
node scripts/release-validation/execute.mjs --selection vitest-reviewed
node scripts/release-validation/execute.mjs --selection node-protocol
node scripts/release-validation/execute.mjs --selection general-tests
node scripts/release-validation/execute.mjs --selection generated-tests
node scripts/release-validation/execute.mjs --selection account-fixtures
node scripts/release-validation/execute.mjs --selection service-fixtures
node scripts/release-validation/execute.mjs --selection delivery-fixtures
node scripts/release-validation/execute.mjs --selection isolation-fixtures
node scripts/release-validation/execute.mjs --selection ledger-fixtures
node scripts/release-validation/execute.mjs --selection contract-fixtures
node scripts/release-validation/execute.mjs --selection preparation-fixtures
node scripts/release-validation/execute.mjs --selection oracle-parser-fixtures
node scripts/release-validation/execute.mjs --selection content
node scripts/release-validation/execute.mjs --selection content-control
node scripts/release-validation/execute.mjs --selection journal
node scripts/release-validation/execute.mjs --selection admission
node scripts/release-validation/execute.mjs --selection editor-admission
node scripts/release-validation/execute.mjs --selection workspace-admission
node scripts/release-validation/execute.mjs --selection owned-startup
node scripts/release-validation/execute.mjs --selection local-genesis
node scripts/release-validation/execute.mjs --selection local-clear
node scripts/release-validation/execute.mjs --selection content-trim
node scripts/release-validation/execute.mjs --selection custody
node scripts/release-validation/execute.mjs --selection write-session
```

The first two commands check reviewed snapshots. Planning may report `blocked` while the snapshot
check succeeds. `node scripts/release-validation/plan.mjs --require-complete` must currently exit
nonzero. `execute.mjs --selection release` likewise refuses; it is not a partial aggregate command.
After reviewing input or selection changes, explicitly regenerate the inventory with `check.mjs
--record`, then the manifest with `plan.mjs --record`. Each artifact has a 700 kB ceiling.

`infrastructure` runs twenty stages: eighteen identity, policy, census and adapter test files
(92 exact cases), the live authority/registry check and the inventory freshness check. It does not run the package
`check` chain, traceability, native browsers, the crypto-audit campaign or the release aggregate.
The process-control (including Vitest) and native ownership test files run separately because they deliberately
create additional runner owners to test their failure handling; they are not certified as nested
stages under the inherited-group adapter. The wildcard test command above includes native Chromium
controls and therefore needs the installed browser and permission to launch disposable test profiles.

The separate `vectors` selection contains 29 generator `--check` stages. Generator success retains
each generator's own published-versus-executed comparison; it is not a new independent assertion-
strength oracle. It does not include the additional `vectors:coverage` command or replace the full
package vector chain. This selection is executable but has **not been run in this phase**. Existing
standalone campaign prerequisites remain. Native wrappers do not yet consume shared cached results.

## Input and receipt identity

The execution entrypoint snapshots every tracked source/document/evidence input plus new files in
the reviewed source/test/config/documentation roots. New helpers and removed tracked inputs change
identity. Unrelated untracked root files, ignored personal builds and profiles are not copied.
It fingerprints actual installed dependency files and symlink targets, not just lockfile/version
names, plus the Node executable bytes, version, architecture, platform and baseline revision.

Two existing pnpm metadata links point into the saved project (`.package-map.json` and
`.pnpm-workspace-state-v1.json`). Their exact bytes are copied as regular files. Other external
dependency links refuse. Generated dependency caches `.cache`, `.vite`, `.vite-temp` and `.tmp`
are excluded and are not copied. No dependency installation, download or package-manager execution
is performed. The earlier silent `pnpm` wrapper remains undiagnosed.

A temporary checkout carries the original Git history for existing history-aware checks, with
copied source and dependency bytes and a clean receipt/output scope. Source and dependency files
are not shared through hard links. The entrypoint verifies the original and disposable fingerprints
after copying and at completion; each stage verifies its disposable inputs before and after running.
This is a checked snapshot, not an OS-enforced immutable filesystem or hostile-code sandbox.

Reuse is limited to successful results issued by the **same live runner owner**. Its identity binds
the checkout, input/runtime fingerprints, exact argv, controlled environment contract, explicit
variant, expected case set, bounds, process policy and ordered prerequisite result identities.
The receipt records the actual generated environment, nonce and artifact hashes. Changed result
artifacts, stale dependencies, invented receipts or changed inputs refuse reuse. Failed or partially
written directories never count as a result. No cross-process or historical receipt cache is trusted.
Transitive package aliases retain ordered prerequisite receipts, including future traceability use.

The crypto-audit wrapper now obtains its source population from the same fresh scope and separately
pins installed dependency bytes. It rechecks both population and bytes at completion. This repairs
the seven identified missing runtime inputs without rewriting historical evidence. That wrapper's
native execution/census modernization remains open; its full campaign was not rerun here.

## Process and case boundaries

The first ownership adapter supports cooperative POSIX Node stages and inherited process groups.
It forces its preload onto Node descendants and refuses detached-child requests, even when test code
catches that refusal. Existing browser/wrapper families that intentionally detach need a reviewed
adapter; they are not made compatible by removing their cleanup semantics.

Deadlines, cancellation and output limits stop the group. TERM has an explicit grace period, then
KILL has a bounded drain check. Leader exit and pipe closure are tracked separately: a zero-exit
leader leaving an orphan fails and drains; waiting indefinitely for inherited pipes is forbidden.
Repeated output after stopping cannot cause repeated signal attempts. Signal and log-write failures
are retained as failures. Thirty before-repair flood probes in each environment exposed transient
`EPERM` group probes both inside and outside the sandbox; this was not sandbox-specific. Uncertain
probes now retry within grace and require an explicit `ESRCH` before crediting drain. Persistent
uncertainty still fails; the before/after experiments and an injected persistent control are retained. A checkout whose process group cannot be proved drained is retained.
Logs stream to a bounded artifact during execution; JSON reports are size-checked before parsing.
Bounds govern child execution and drain; source hashing/copying is separate preparation work.

The Node adapter accepts only direct, literal, top-level registrations. It compares exact file/title
identities and outcomes, refuses duplicates, zero/missing/extra/skipped/todo/cancelled cases and checks
the terminal Node summary. Generated test registration needs a further reviewed census adapter.
Mutation results must identify the expected discriminating assertion; a nonzero exit alone is not
detection. Effective controls remove actual case registrations, skip a real Node case, omit or change
reported cases, replay a stale nonce, change helper/dependency bytes, survive a mutation and exercise
timeout/cancellation/orphan/detached/output failures with real child processes.

## Content catalogue adapter — phase 2b

The full `content` selection executes all **13 baseline cases and five mutations**. `content-control`
selects Q-04's unreadable-load baseline plus `swallow-unreadable-record`; it has a distinct variant
identity. The standalone `node scripts/content/run.mjs` delegates to the same disposable owner and
retains `--case`, `--no-mutants`, `--output`, `report.json` and `report.md`. Duplicate/unknown options
and cases refuse. A publication failure cannot return success. Only the default content command and
campaign alias are discharged by the full catalogue receipt; nested Account/private wrappers retain
their unresolved selections and postconditions. The new worker is an internal owned entrypoint.

The stage owner launches installed Chromium itself into a fresh profile and owns its POSIX group.
The worker connects to its fresh loopback CDP endpoint and owns Vite and its source overlays in the
worker group. Chromium's installed bundle files/symlinks join the input identity; no browser download
or personal profile is used. The parent terminates and verifies both groups on success, cancellation,
timeout, startup failure or either process dying. Unexpected browser exit fails the stage. The
cooperative process guard still refuses detached Node children; this is not an OS containment claim.

Vite is bound through its public HTTP server's initialization hook with port zero. The first native
run showed that Vite's high-level `listen` turned configured zero into 5173; the corrected run records
actual OS-assigned ports. A native control occupies the configured port and verifies the test server
can still start elsewhere. HMR is disabled for this fixed-source campaign. Contexts retain the existing
request routing and real IndexedDB/WebCrypto/Web Locks/renderer-death cases. Browser background logs
are retained; this is not an assertion that Chromium itself makes no background network requests.

The adapter independently compares exact baseline/mutation IDs, a fresh report nonce, successful
completion, consistent assertion evidence and source populations/hashes. Each requested mutation
must have its specific assertion present and passing in the baseline, failing in the mutant, with
an exact unique source patch and the expected changed source hash. A reported `detected` label alone
cannot pass. Server variants and closure records must match the selection. Parent receipts add the
actual browser/worker drain results and bounded artifacts.

Bounds are 15 seconds for browser startup, 120 seconds for the full content worker (90 for a single
case), and separate 5-second TERM/KILL drain grace periods per group. Worker and browser logs each
have a 4 MiB ceiling; the parsed content report has a 4 MiB ceiling. Copying/fingerprinting is separate
preparation: the repaired full stage took 47.3 seconds, and its full command including preparation and
final checks took 70.4 seconds on this host. These are measured observations, not a universal runtime
or workload guarantee. The native report's original content-carrier limitations remain unchanged.

The [content adapter evidence](./account-conformance-runs/2026-09-13-content-adapter/README.md) preserves
initial and repaired runs. It includes the full catalogue, selected variants, exact mutation evidence,
35 non-native tests with 640 generated histories, and six native Vite/Chromium ownership controls.
The latter check completion, timeout, cancellation, worker/browser death and startup deadline; actual
listener refusal, explicit group disappearance and no matching disposable-profile processes are
required. Synthetic census controls also reject stale reports, missing assertions, unchanged mutant
source bytes and falsely claimed detections. No production storage code or catalogue assertion was
changed in this adapter phase.

## Journal catalogue adapter — phase 2c

The `journal` selection executes **17 baseline cases and six mutations**. The standalone
`node scripts/journal/run.mjs` uses the same disposable stage and retains `--case`, `--no-mutants`,
`--output`, `report.json` and `report.md`. Its old arbitrary `CHROMIUM_PATH` override now explicitly
refuses: this adapter certifies the installed, byte-pinned Playwright Chromium only. Unknown/duplicate
options, mismatched worker/family contracts and existing output directories refuse.

Content and journal now share the carrier selection/report reconciler, with an explicit two-family
allowlist. Both still bind their own catalogue, worker, report scope, candidates and stage variant.
Unsupported families gain no execution credit from the shared code. Mutation targets must occur in
the independently pinned source population and must actually change source bytes. The native journal
worker keeps its existing scenarios and assertions, Vite aliases, source overlays and content-fixture
imports. It connects to parent-owned Chromium and uses the already-verified ephemeral Vite listener;
server closure and per-case progress are included in the owned report.

The full native journal run passed all 17 cases (93 baseline assertions) and all six discriminating
mutations. These retain real renderer death before flush, native quota refusal, unreadable carrier
refusal, aborted/partial flush, changed exact entries, cleanup failure, cross-tab handoff, frozen and
concurrent writers, and WASM disposal. The host append smoke still has its original narrow scope:
20 unthrottled samples at each of four payload sizes, not a supported-population latency conclusion.
No production storage code, catalogue mutation or scenario assertion changed in this phase.

The full stage took **74.7 seconds** (98.2 seconds for the command including preparation/final checks)
on this host, inside the existing 120-second worker deadline. Browser startup remains bounded at
15 seconds, single-case workers at 90 seconds, and TERM/KILL drain grace at 5 seconds per group. Log
and parsed-report ceilings remain 4 MiB each. These measured campaign times do not establish a
universal deadline or product workload guarantee.

The [journal adapter evidence](./account-conformance-runs/2026-09-13-journal-adapter/README.md) also
records the existing store-contract command's exact six-case selection/four applicable mutations,
a selected no-mutant handoff case, the full content regression and native ownership controls. The
wrapper's remaining prerequisites and report postconditions are still unresolved; running its nested
journal command is not a complete Account store-contract campaign. Only the default journal catalogue,
package leaf and campaign alias are discharged. The adapter's 160 new generated subset/omission
controls bring the runner/control total to 800 generated histories across 39 non-native tests; six
native ownership tests separately verify failure cleanup. These are validation-infrastructure controls,
not another 800 journal product histories.

## Admission catalogue adapter — phase 2d

The admission catalogue now uses the same owned browser/Vite boundary. The complete standalone
campaign passes **15 baseline cases, 64 assertions and six discriminating mutations**. Unlike the two
carrier reports, admission retains its existing `ordered-admission-browser` scope, bound explicitly
along with its worker, candidate, catalogue and variant. The shared adapter allows exactly content,
journal and admission. It does not infer support from a family name or generic report shape.

The original assertions retain pending Yjs struct/delete recovery, synchronous journal receipt,
private refused input, head-only preparation, forced retry, committed remote dependencies, slicing,
byte capacity, durability barriers, close/key disposal, unreadable repair and cross-tab delivery.
These use synthetic commands/projections; actual CodeMirror and transport integration remain a later
catalogue. No production code, catalogue patch or scenario assertion changed.

Two mutations of `C03.ordered-refusal` require separate detection: early publication and early queued
preparation. The adapter verifies both exact changed source hashes and distinct assertion failures;
one result, a duplicate or an unrelated failure cannot discharge both. Four new adapter tests include
160 generated selections (seed 130906), bringing the non-native control suite to 43 tests and 960
generated validation histories. Six native ownership controls separately pass; they deliberately
exercise failure receipts and require stopped processes and listeners.

The [admission evidence](./account-conformance-runs/2026-09-13-admission-adapter/README.md) retains the
full run, the selected refusal-order case with both mutations, its explicit no-mutant variant and
selected content/journal regressions. JSON/Markdown report publication and explicit output remain
supported. Custom `CHROMIUM_PATH` overrides refuse because the owned runner pins the installed
Playwright Chromium. Existing output refuses without changing its previous report.

The full worker took **58.9 seconds**, within its 120-second deadline; the command took 81.9 seconds
including preparation/final checks. Single-case workers retain a 90-second deadline, browser startup
15 seconds, per-group TERM/KILL grace 5 seconds and log/report limits 4 MiB. These are host observations,
not supported-population latency evidence. Default catalogue, package leaf and campaign alias are
resolved; enclosing wrapper postconditions are not credited automatically.

## Editor-admission catalogue adapter — phase 2e

The Goals CodeMirror catalogue passes **12 baseline cases, 61 assertions and three mutations**
through the shared owner. Its existing candidate is `editor`, its scope `editor-admission-browser`,
and its patch paths already start at `src/editor/`. These are explicit family bindings. The worker
also copies/hashes Account protocol sources, completing the shared source population. Original typing,
multicaret, checkbox, pressure/retry, history, export, remote, BroadcastChannel, paste, composition,
close/repair and preparation-profile assertions are unchanged.

The first native run caught a runner defect: overlays beside reports sat outside the checkout and
resolved another copy of CodeMirror. The fixture's selection then failed in the editor's copy.
All four owned workers now write overlays beneath the disposable checkout, keeping bare dependency
resolution there. Reports, logs and receipts remain in the requested evidence directory. A native
control with equal package bytes in two installations fails before this move and passes afterward.
It uses the catalogue's `noDiscovery` setting; an initial generic probe allowed Vite prebundling and
therefore failed to discriminate this condition. That probe is not credited as a passing repair control.

A second run passed the product assertions but could not publish a valid receipt: plain JSON dropped
undefined export-refusal values. Editor reports now declare `tagged-json-v1`, an injective encoding of
supported plain assertion values, with explicit undefined/null, negative zero and object/array tags.
The parent validates tag structure and recomputes equality without treating missing fields as evidence.
Unsupported values refuse. Existing scenario comparisons remain intact. Report parsing/reconciliation
failure now leaves a failed receipt without an undefined `cases` property; it cannot break receipt
serialization. Other families keep their existing untagged reports until individually reviewed.

A native startup control also encountered an invalid endpoint read, while its retained file was valid
later. Focused fragmented-file controls establish that the old reader refused incomplete publication.
The owner now retries within the same startup deadline, accepts only a complete port/UUID path and
records retry counts. An incomplete file still times out and its process group drains. This is a
browser-launch repair, not a change to application connectivity.

The [bounded evidence](./account-conformance-runs/2026-09-13-editor-admission-adapter/README.md) retains
both failed full runs, the native failure/control evidence, the final full run, selected pressure
variants and selected content/journal/admission regressions. The final worker took **67.3 seconds**
within its 120-second deadline. Nine infrastructure stages pass 36 cases/two static checks; 51
non-native tests include 160 new generated editor selections (1,120 validation histories total).
Seven native controls separately exercise actual browser/Vite ownership and module identity.

Worker/startup/drain/output bounds remain unchanged. Profiling is diagnostic on this host; the Blink
composition probe does not qualify native IMEs or device populations. Application startup, complete
workspace commands and Account authority remain outside this catalogue. Standalone case/no-mutant/
output options and JSON/Markdown report files remain supported; custom browser overrides and existing
outputs refuse. Default catalogue, package leaf and campaign alias resolve, not enclosing wrappers.

## Workspace-admission catalogue adapter — phase 2f

The shared workspace catalogue passes **ten baseline cases, 62 assertions and four mutations**
through the same disposable owner. Candidate `workspace`, scope `workspace-admission-browser` and
full patch paths are explicit bindings. The worker copies the same complete runtime source population,
keeps overlays inside its checkout and binds each Vite server to an OS-assigned loopback port. The
original Goals/card history, structural command, pending/refusal, system work, cross-tab, received
update, nested Yjs undo/redo, business-rule and actor-initialization scenarios remain unchanged.

The four mutations separately expose pending history, admit system bulk work into human history,
admit received work into human history and lose Yjs redone links. Each must change the exact pinned
source and fail its own previously passing assertion. Workspace reports also require `tagged-json-v1`:
nested undefined initialization values cannot become null, and false/null business results remain
distinct from zero or missing evidence. Existing scenario comparisons are unchanged. Four new adapter
tests check exact selection, identity, mutation evidence and 160 generated subsets/faults (seed 130908).
All 55 non-native runner controls pass, including 1,280 generated validation histories.

The [bounded evidence](./account-conformance-runs/2026-09-13-workspace-admission-adapter/README.md)
retains the full run, selected system/remote/nested history cases with their three mutations,
baseline-only initialization and selected editor multicaret/pressure regression. All seven native
ownership controls pass separately. Ten infrastructure stages pass 40 exact cases and two static
checks. The full worker took **43.1 seconds** inside its 120-second deadline; the command took 64.7
seconds including preparation/final checks. These are observations on this host, not supported-device
performance qualification. Startup/drain/log/report bounds remain unchanged.

Standalone `--case`, `--no-mutants`, `--output` and JSON/Markdown reports remain supported. Custom
browser overrides and existing output directories refuse. The default catalogue, exact package leaf
and campaign alias resolve; passing a catalogue does not discharge the enclosing package check chain.
Full application startup/classification, migration, compaction, Account authority and native IME/device
coverage remain outside the original workspace fixture. No production behavior was changed here.

## Owned-startup catalogue adapter — phase 2g

The retained-workspace startup catalogue passes **15 baseline cases, 96 assertions and three mutations**
through the shared owner. Candidate `startup`, scope `owned-startup-browser` and full patch paths are
explicit bindings. The worker copies the complete runtime source population, keeps overlays inside the
disposable checkout and binds Vite to OS-assigned loopback ports. The original absence, orphan/missing/
misrouted carrier, legacy route, interrupted creation, clear marker, corrupt ciphertext, factor,
post-grant reclassification, cancelled replay, renderer restart, future schema and independent-workspace
scenarios are unchanged. Fixture database enumeration detects side effects while production-path
`indexedDB.databases()` remains disabled and asserted unused.

The mutations create a database during a probe, misclassify surviving orphan material as fresh, and
skip classification after acquiring the shared lifetime. Each must change its own pinned source and
fail its specific previously passing assertion; another refusal or an earlier inspection cannot stand
in for that evidence. Tagged reports retain zero mounts/channels and unavailable writing/export values
through JSON serialization. Missing values, null and false substitutions refuse. Four new adapter tests
include 160 generated subsets and evidence faults (seed 130909). All 59 non-native runner controls pass,
including 1,440 generated validation histories.

The [bounded evidence](./account-conformance-runs/2026-09-13-owned-startup-adapter/README.md) retains the
full campaign, selected absence/orphan/recheck cases with all three mutations, baseline-only replay/
restart and a selected nested workspace-history regression. Seven native ownership controls pass.
Eleven infrastructure stages pass 44 exact cases and two static checks. The full stage took **41.6
seconds** inside its 120-second deadline; the command took 62.9 seconds including preparation/final
checks. These observations do not qualify a device population. Startup/drain/log/report bounds remain.

Standalone case/no-mutant/output options and JSON/Markdown reports remain supported; browser overrides
and existing outputs refuse. Default catalogue, exact package leaf and campaign alias resolve without
crediting enclosing wrapper postconditions. Synthetic enrollment, Local identity/index installation and
receive authority remain fixture boundaries. Creation/migration resumption, clear execution, default-app
cutover, Account authority, OS/power-loss and native IME/device qualification remain outside this
catalogue. No production behavior was changed here.

## Local-genesis catalogue adapter — phase 2h

The Local-genesis catalogue passes **17 baseline cases, 160 assertions and four mutations** through
the shared owner. Candidate `genesis`, scope `local-genesis-browser` and full patch paths are explicit
bindings. Nine cases are generated from durable boundaries: claim, reservation, custody, content
progress, witness, counter, ready witness, ready progress and index. The parent separately binds each
case ID to its boundary field, rejecting omitted or substituted crash points. Removing a boundary from
the generator also changes the independently expected census. The original races, native aborts,
cancellation/drain, authenticated resumption, missing/damaged state and index/scope scenarios remain.

The first run failed during report encoding after publishing G01: the creator-race identity assertion
contains Uint8Array values, which the plain-value encoder refused. The reviewed `uint8array` tag now
preserves these values as canonical byte arrays, distinctly from ordinary arrays and numeric-key
objects. Subarray offsets do not alter value equality; altered bytes do. Other typed views, Buffer and
extra enumerable byte-array properties refuse. No product comparison or record encoding changed.
A focused before/after probe and 160 generated nested-claim comparisons against native Node equality
exercise this extension to `tagged-json-v1`; plain-value tags remain unchanged. Failed report encoding
still leaves the parent's failed receipt, drain evidence and bounded log, rather than success.

Five new tests cover exact generated selections, crash-boundary evidence, the four specific mutation
assertions, nested report values, 160 subset/fault histories (seed 130910) and 160 byte-array histories
(seed 130911). All 64 non-native controls pass, with 1,760 generated validation histories across the
runner. Twelve infrastructure stages pass 49 exact cases and two static checks.

The [bounded evidence](./account-conformance-runs/2026-09-13-local-genesis-adapter/README.md) preserves
both full attempts, the exact seven-case/two-mutation selection used by Account local provenance,
baseline-only counter crash, selected startup reclassification/replay and seven native ownership
controls. The passing full stage took **73.8 seconds** inside its 120-second deadline; the command
took 95.2 seconds including preparation/final checks. These are host observations, not supported-device
performance qualification. Startup/drain/log/report bounds remain unchanged.

Standalone case/no-mutant/output options and JSON/Markdown reports remain; custom browsers and existing
outputs refuse. The genesis guide's reproduction instructions now match this pinned-browser contract.
Default catalogue, exact package leaf and campaign alias resolve. Account local provenance's enclosing
wrapper retains its other prerequisites and postconditions; this selected regression is not its whole
campaign receipt. No personal genesis, Account onboarding, default-app cutover, physical power loss or
raw profile-clone recovery was performed or qualified.

## Local-clear catalogue adapter — phase 2i

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

## Content-trim catalogue adapter — phase 2j

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

## Custody catalogue adapter — phase 2k

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

## Write-session catalogue adapter — phase 2l

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

## Vitest property adapter — phase 2m

The first general test-file adapter resolves the five known R-03/N-06 deadline suites before
expanding the remaining Node/Vitest families. `vitest-properties` executes **62 cases and 515 seeded
histories** across `spoolBatch`, `accountInboundPrep`, `legacyImport`, `legacySelection` and
`legacyCleanup`. Only those reviewed files receive new execution credit. The full package test
command and their native/Account/migration wrappers remain distinct, unresolved obligations.

The finite AST census supports direct literal tests, nested literal suites and scalar literal
`it.each` tables with one `%s`. Unknown aliases, loops, conditional registration, modifiers, dynamic
tables/titles and duplicate identities refuse without importing test code. Suite/title arrays avoid
ambiguous concatenation. The parent compares the exact independently enumerated case set and module
identity with the installed Vitest public reporting API. Empty, omitted, duplicate, skipped, pending,
retried, repeated, inverted or filtered outcomes, module/suite errors and missing terminal completion
refuse. An exit code alone cannot discharge these files.

The normal `vite.config.ts` and `test/setup.ts` remain, including the existing Node/jsdom environment
annotations and synthetic IndexedDB. Each file runs in a separate stage with one inherited Vitest fork,
no file parallelism, zero retries and the owned reporter. The same owner freezes/copies source and
installed dependency bytes, emits 15-second heartbeats and enforces **180 seconds per file**, bounded
logs/reports, and separate five-second TERM/KILL drain grace periods. Partial case reports and progress
logs survive timeout/cancellation; a partial report cannot pass. Real controls require the worker group
and its additional child to disappear. These are cooperative POSIX process controls, not containment
of hostile test code.

All five generated properties now have explicit **60-second** test deadlines. Their assertions,
seeds and history counts are unchanged; normalized TypeScript AST comparison against signed `5872dc5`
checks that only these timeout arguments differ. R-03 retains seed 1209032 / 120 histories. The four
N-06 properties retain 300 / 25 / 30 / 40 histories and their original seeds. Ordinary case and hook
deadlines remain. This is a finite host-margin choice informed by the following measurements and
previous loaded-host failures, not a promise that an arbitrarily loaded machine will finish in time.

| Generated property | Previous limit | Before, this host | Current limit | First after, this host |
| --- | ---: | ---: | ---: | ---: |
| Spool source/actor/burn | 5 s default | 2.58 s | 60 s | 2.59 s |
| Inbound delivery/crash/compaction | 30 s | 6.16 s | 60 s | 6.17 s |
| Import text/resumptions | 30 s | 2.98 s | 60 s | 3.03 s |
| Selection interruption | 30 s | 1.08 s | 60 s | 1.08 s |
| Cleanup Unicode/interruption | 30 s | 2.47 s | 60 s | 2.32 s |

The first post-deadline selection passes all 62 cases, with no skips/cancellations and all five groups
drained, in **67.9 seconds including preparation** (5.9–11.9 seconds per stage). A final run after
checking that a file argument cannot be a Vitest flag also passes all 62 cases in **56.2 seconds**,
with 5.3–10.6 seconds per stage and 1.0–5.0 seconds per generated property. The before run also passed
on this host; these measurements do not reproduce the historical load failures.
Six new census/manifest tests include 160 generated population faults. Four actual Vitest process
controls cover success, real registration removal, runtime skip, zero cases, a shrinking counterexample,
inner test timeout, outer timeout with a child, cancellation and a caught detached-child refusal.
Together with existing regressions, **91 non-native runner tests / 2,560 generated control histories**
pass. The eleven existing browser ownership controls retain their earlier evidence; no browser campaign
was rerun here.

The controls exposed a real reporter defect: Vitest timeout errors can put their useful message outside
a placeholder stack trace. The reporter now retains both, plus case durations and fast-check seed/path/
counterexample text. A first skip fixture used a nonexistent table callback context; the corrected
control skips a real case through its actual runtime context. Failed attempts and nine exact process
receipts (one expected pass, eight required refusals) accompany the
[bounded evidence](./account-conformance-runs/2026-09-13-vitest-properties/README.md).

## Reviewed Vitest and Node files — phase 2n

The explicit `general-tests.json` policy adds **77 Vitest files / 744 cases** and **ten Node protocol
files / 66 cases**. Including the previous property selection, `vitest-reviewed` has 82 files / 806
cases, `node-protocol` has ten files / 66 cases and `general-tests` has **92 files / 872 cases**.
All 92 files pass in 581.6 seconds including snapshot preparation and repeated fingerprints, with
confirmed group drain. No product/test body, assertion, seed, history count or deadline changes.
The first property adapter is signed and verified as `8acdee4`; phase 2n is committed as `38e4995`.

Policy validation checks the reviewed files against the fresh inventory, rejecting removed/excluded
files and changed runners. Parsable new files stay blocked until their fixtures/processes are reviewed.
The Vitest path contract now accepts reviewed dotted filenames, TSX and `vite/` tests while refusing
flags and traversal. Existing pinned config/setup, one fork, reporter/census reconciliation, 180-second
stage deadlines, five-second grace and output/report limits stay unchanged. The ordinary suites use
fake storage, injected transport, jsdom, Yjs simulations and disposable service-worker/build fixtures.

The Node protocol set covers checkpoint, counter, first-authority, Local custody, Local provenance,
promotion, recovery, service custody, store and transport format contracts. Helpers bundle in memory
or use synthetic temporary SQLite state. Each literal top-level case gets its independent exact Node
census and the inherited process-group owner. Optional wrapper report outputs, mutation variants,
ordered prerequisites and native campaigns remain separate obligations; file success cannot credit them.

A real Node reporter defect is repaired: wrapped assertion errors previously lost their useful
fast-check seed/path/counterexample text. The reporter now retains structured diagnostics and bounded
log output, saves completed-case progress while running and requires terminal completion for success.
The control runs the actual reporter from signed `8acdee4`, proves its diagnostic loss, then checks
current error preservation. A stuck second test leaves the completed first case after owned timeout
and confirmed drain. Three required failed control receipts retain that evidence.

All **98 non-native runner/control tests / 2,720 generated control histories** pass, including 160
new generated removed/excluded/changed-invocation controls. The full file selection and regression
checks needed no retry or larger deadline. Typecheck, scoped style, inventory/manifest and authority
checks pass; full release planning still refuses. The eleven existing native ownership controls retain
prior evidence. The [bounded packet](./account-conformance-runs/2026-09-13-general-test-adapters/README.md)
contains all exact reports, logs, ownership events, timings, source pins and the exact implementation
patch within 250 kB. Current host timing does not establish loaded-host or cross-platform capacity.

## Generated registrations — phase 2o

The reviewed set adds **thirteen Vitest files / 209 cases** and **one Node file / thirteen cases**.
`generated-tests` selects those fourteen files / 222 cases. The combined `general-tests` selection
passes **106 files / 1,094 cases** in 723.7 seconds including preparation/fingerprints, with
confirmed drain for every stage. The previous 872 identities are unchanged. All selected product test
bodies, titles, assertions, seeds, history counts and deadlines remain byte-identical to `38e4995`.

The finite reader handles constant lexical data, for-of loops, tuple bindings, nested suite tables,
reviewed `%s`/`%i`/`%j` titles, JSON vector imports and explicit UTF-8 reads. Function metadata stays
opaque. Helper calls, unknown control flow/predicates, inherited-property keys and duplicate titles
refuse. JSON input paths are scoped below `test/vectors/`, reject symlinks and have a size bound;
their hashes enter the stage contract and are checked before launch even when names are unchanged.
Planning does not import test modules. Runtime reports still reconcile against independent exact names.

The new Vitest files use fake storage, in-memory builds, Yjs simulations and partial model schedules.
The Account-core Node suite uses synthetic temporary SQLite fixtures and an inherited competing Node
process; no real Account or personal service is involved. Older model evidence retains its existing
scope limitations. Wrapper optional reports, prerequisites and mutation campaigns remain separate.

The manifest now writes one complete obligation per line. Parsing preserves the entire schema, rows,
contracts, identities, selections, ordering and blocked obligations. Its 552,986 bytes fit the existing
700 kB ceiling; no obligation or case was removed for size. The snapshot writer owns this generated
layout, which R-04 must distinguish from general source formatting.

All **106 non-native runner/control tests / 2,880 generated histories** pass. Actual generated Vitest
controls test names, vectors, nested suites, nullable/object/tuple rows, drift, omission and skip.
Thirteen final process-control receipts retain three expected passes and ten required failures.
An initial arithmetic control expectation was corrected after exact baseline comparison; no old case
was lost. A separate negative control reproduced acceptance of vector metadata on non-Vitest stages.
That metadata now refuses before any path read. The first product selection was deliberately cancelled
for this guard repair after fifty passes, with confirmed drain; it supplies no whole-selection credit.
The final run restarts from the tightened source. No deadline or product test population was reduced.

Typecheck, scoped style, planning and authority checks pass. The [packet](./account-conformance-runs/2026-09-13-generated-registration-adapters/README.md)
retains final and partial receipts, before-controls, exact source patch and preservation pins within a
300 kB ceiling. Eleven native ownership controls retain earlier evidence; no browser campaign reran.
Phase 2o is signed and verified as `f9111ea`; it does not qualify a loaded-host or immutable aggregate.

## Account fixtures and delivery identities — phase 2p

`account-fixtures` adds ten Node files / 44 cases for Account core, authority and admission, plus
`test/accountDelivery.test.ts` / twelve cases. All eleven files / 56 cases pass in 75.339 seconds
including snapshot work, with every group drained. Their existing properties run 980 histories;
assertions, seeds, history counts and deadlines are unchanged. No selection retry was needed.

Six delivery histories previously produced only four unique titles because `%j` used the first tuple
argument. Six stable labels and opaque builders preserve the exact event expressions and assertions;
an AST comparison also proves every node outside the table unchanged. Planning still does not execute
helpers. Temporary SQLite, synthetic credentials, copied-source mutants and inherited IPC crash
workers fit the existing Node owner. The explicit policy grants no browser or wrapper credit.

All 110 non-native runner/control tests pass with 3,040 generated control histories. A passing IPC
case deliberately leaking its worker is refused and drained; normal intentional worker death passes.
Actual Vitest controls exercise labeled builders alongside existing data drift/omission/skip checks.
Typecheck, scoped style, planning and authority checks pass. The [packet](./account-conformance-runs/2026-09-13-account-fixture-adapters/README.md)
retains full selected reports, controls, exact source patch and preservation checks within 150 kB.
The evidence packer's stale L-2 hash was corrected against signed HEAD; L-2 was never changed.

The general selections now contain 117 files / 1,150 cases, including all 96 Vitest files and 21 Node
files. The previous 106 file stages and 1,094 identities remain exactly unchanged and retain earlier
evidence, not a fresh combined run at this revision. Whole Vitest/package invocations still have
separate configuration, ordering and aggregate obligations. Phase 2p is signed and verified as `5334a7c`.

## Recovery, promotion, activation and handoff service fixtures — phase 2q

The `service-fixtures` subset adds eleven Node files / 56 cases. It uses the existing exact Node
census and inherited group owner after explicit fixture review. Recovery contributes five files /
24 cases, promotion one / six, activation three / twenty, handoff two / six. Temporary SQLite,
synthetic credentials/recovery proofs, copied-source mutants and inherited IPC crash workers remain
disposable. Native sibling fixtures and wrapper artifact obligations remain separate.

The finite data reader now handles boolean conditional expressions used by two existing activation
test names. It refuses nonboolean guards, active helper calls and conditional test registration;
only the selected data branch is read. Product source and tests remain entirely unchanged, including
titles, assertions, seeds, populations and deadlines. New passing properties run 660 histories; the
activation stale-proof control must separately fail and shrink. Its optional wrapper export remains
an independent obligation.

The expanded `account-fixtures` selection passes 22 files / 112 cases in 127.643 seconds. The prior
`generated-tests` selection passes fourteen files / 222 cases in 129.785 seconds. Both use identical
frozen source/dependency/runtime inputs; every group drains. All 111 non-native runner/control tests
pass with 3,200 generated histories, including 160 new boolean-name histories and actual Node/Vitest
reporter checks. The initial control's error-capitalization mismatch is retained; no product test
needed repair, retry or a longer deadline. Typecheck, scoped style, planning and authority checks pass.

The [packet](./account-conformance-runs/2026-09-13-service-fixture-adapters/README.md) retains all
36 file receipts / 334 cases, controls, exact patch and source/test preservation within 150 kB. All
previous 117 general stage contracts and 1,150 identities remain unchanged. General selections now
contain 128 files / 1,206 cases: 96 Vitest and 32 Node files. Other 92 general files retain earlier
evidence, not a new combined run. This phase remains uncommitted and does not qualify an aggregate.

## Service delivery and inbound-read fixtures — phase 2r

Signed `95fa715` closes the preceding service phase. The `delivery-fixtures` subset adds eight Node
files / 52 cases: delivery core/generated/controls/restart contribute 32, inbound read contributes 20.
The disposable selection passes in 119.579 seconds, including snapshot/fingerprints, with every group
drained and all 140 generated product histories retained. Product source/tests, names, assertions,
seeds, populations and deadlines remain unchanged. Temporary SQLite, copied mutants, binary IPC
crash/race workers, a competing SQLite subprocess and an in-memory receiver build are reviewed.
No browser, HTTP listener or root build is used. The retired v8 delivery native fixture stays excluded;
inbound native and optional wrapper artifact obligations remain separate.

Two historical `git show` dependencies now have explicit stage pins: original reference, full
revision, path and SHA-256. The same source expression is read with bounded time/output and checked
before launch/reuse and after execution. Pins enter receipt identity; unsupported adapter metadata
refuses. Synthetic replacement controls expose changed historical bytes despite unchanged checkout
identity, reject stale reuse and reject an otherwise passing case after source drift. This remains
a cooperative input check, not protection against transient or hostile repository changes.

All 114 non-native runner/control tests pass with 3,360 generated histories. Binary Uint8Array IPC
is exercised and leaked workers still fail despite passing cases. An initial fresh-receipt field
assertion and generic formatter scope error are corrected with both logs retained. The intentionally
compact manifest retains its exact writer layout. The stalled pnpm typecheck was terminated; direct
local TypeScript passes. No product selection needed repair, retry or a larger deadline.

The [packet](./account-conformance-runs/2026-09-13-delivery-fixture-adapters/README.md) retains complete
receipts, historical/source pins, controls and exact patch. All 128 prior general contracts / 1,206
identities remain unchanged and retain earlier evidence. General selections now contain 136 files /
1,258 cases: 96 Vitest and 40 Node files; Account fixtures contain thirty files / 164 cases. Eleven
native owner controls retain earlier evidence. This new phase is uncommitted, not an aggregate.

## Account isolation service fixtures — phase 2s

Signed `dbf5eb5` closes the preceding delivery/inbound phase. `isolation-fixtures` adds five Node
files / 23 cases for shared-service core, recovery, generated histories, controls and restart. The
existing census and owner suffice unchanged. Synthetic accounts share temporary core/authority
databases; per-history teardown releases handles and directories, and inherited admission workers
cover six SIGKILL boundaries and concurrent service processes. No browser, HTTP listener or root
build is used. All product source/tests, identities, assertions, seeds and deadlines are unchanged.

The disposable selection passes in 56.245 seconds, including snapshot work, with every group
drained. The 160 histories at seed 112103 and two directed loss histories remain. Seed 112104 must
fail and shrink the abandonment-scope mutant; its eighty-run budget is not credited as positive
histories. The row oracle models per-account durable transitions and validates binding fields but
seeds some initial offer fields from the implementation. Optional exported histories, metrics and
counterexamples retain independent wrapper obligations.

All 88 pure runner/census/adapter tests, direct typecheck, scoped style, exact manifest layout,
planning and authority checks pass. There were no product test changes, retries or increased
bounds. The unchanged owner/reporters retain prior evidence for 26 non-native process and eleven
native controls. All 136 previous general contracts / 1,258 identities remain unchanged. General
selections now contain 141 files / 1,281 cases (96 Vitest, 45 Node); Account has 35 files / 187 cases.
The [packet](./account-conformance-runs/2026-09-13-isolation-fixture-adapters/README.md) retains exact
receipts, patch, source/helper pins and preservation. This phase remains uncommitted, not an aggregate.

The isolation wrapper remains blocked with its ordered prerequisites and optional exports. Its
existing call to retired delivery-v8 native tests needs disposition before wrapper certification;
this file selection does not revive that fixture.

## Ledger-contract runtime fixtures — phase 2t

Signed `01c4447` closes the preceding isolation phase. The `ledger-fixtures` selection adds three
Node files / fourteen cases: batch 2, controls 5, formats 7. Actual ledger modules and mutants build
in memory with Vite configuration loading/output disabled and explicit Yjs injection. Product
code/tests, names, assertions, seeds, vectors and deadlines are unchanged. The corpus has twenty
entries, ten carriers; its bytes enter ordinary source identity. Wrapper exports, standalone vector
checks and native prerequisites remain independent obligations.

The exact historical path `src/crdt/spoolRecord.ts` is newly supported for the batch reader at
`284a97a27dc3344fcb7c55a8757a2a41c74fe0b9`. Reference/revision/path/hash enter its stage contract and
prelaunch/reuse/postexecution checks under unchanged bounds. Actual historical drift controls run
against both this path and the previous Account-service path; other src paths remain unsupported.

The disposable selection passes in 29.743 seconds, including 200 generated histories and all groups
drained. The property preserves its coordinated-rollback limitation. All 88 pure adapter tests and
the final 21-test owner suite pass, as do direct TypeScript, scoped style, planning and authority.
No product selection failed or needed repair, retry or a larger deadline. Prior 141 general
contracts / 1,281 identities remain unchanged; general selections now contain 144 files / 1,295
cases (96 Vitest, 48 Node), with 38 Account files / 201 cases. Five Vitest process and eleven native
owner controls retain previous evidence.

The initial owner run reported orphaned-child on an expected-positive historical service-path
control. Its log remains but teardown removed that first receipt. Cause remains unresolved; no
owner implementation or bound changed. Optional receipt capture was added, then the focused and
unfiltered reruns passed. Keep this observation for owner/loaded-host aggregate reliability, without
claiming later passes establish a fix. The [packet](./account-conformance-runs/2026-09-13-ledger-fixture-adapters/README.md)
retains full selection receipts, twelve later historical-control receipts and both failing/passing
logs. Its packer was corrected to preserve binary xcrun_db files as hashed base64; no tests reran
for packaging. This new phase remains uncommitted, not an immutable aggregate.

## Contract controls and export fixtures — phase 2u

Signed `54722df` closes the preceding ledger phase. The `contract-fixtures` selection adds five Node
files / nineteen cases: recovery controls 2 and exports 1, transport controls 4, service-custody
controls 8 and exports 4. Exact case names are statically enumerated by the unchanged finite census.
The stage owner, reporters, product code/tests, vectors, assertions and deadlines are unchanged.

Recovery mutants use authentic malformed payloads and actual context/root/key-pair/export guards.
Transport controls omit fields from messages supplied to real signature verification, using
independent signatures; successful checks do not cover all owner/finalization/entry predicates.
Service-custody controls use copied source, exact guard anchors, temporary SQLite files and actual
owner methods. Mocks restore and handles close. Captured private-export buffer clearing is a bounded
buffer assertion, not forensic erasure. No browser, listener or build runs in this selection.

The disposable run passes all five files / nineteen cases in 33.004 seconds, with every group drained.
All 88 pure adapter checks, direct TypeScript, scoped style, planning, authority and expected release
refusal pass. No product selection failed or needed repair, retry or a larger deadline. The existing
160-history policy-change control includes the new files; these product fixtures use fixed matrices.
Prior 144 general contracts / 1,295 identities remain unchanged and retain earlier execution evidence.
General selections now contain 149 files / 1,314 cases (96 Vitest, 53 Node); Account has 43 files /
220 cases. The [packet](./account-conformance-runs/2026-09-13-contract-fixture-adapters/README.md) retains
complete stage receipts, exact patch, 51 source/helper/wrapper pins and preservation within 150 kB.
This phase remains uncommitted, not an immutable aggregate.

The unchanged 21 Node owner, five Vitest process and eleven native controls retain previous evidence;
they were not rerun. The ledger phase's initial orphaned-child classification on an expected-positive
historical service-path control remains unresolved despite later focused/full passes. Keep it for
owner/loaded-host aggregate reliability investigation. This phase establishes no repair.

Crypto-provider exports.test.mjs cases do not discharge optional ACCOUNT_REPORT_DIR JSON exports.
The three wrappers and their saved-output, ordered vector and native prerequisite obligations remain
blocked. The v2 page-extent sibling is referenced by source inventory, with prior Vitest execution
evidence; it is not an additional runtime case in this selection.

## Protocol preparation and registry fixtures — phase 2v

Signed `8db2ee7` closes the preceding contract phase. The `preparation-fixtures` selection adds eight
files / 43 cases: protocol 5, receipt 3, size 9, crypto census 5, crypto probes 1, registry 12,
genesis crypto 3, outbound preparation 5. The eight test files and product sources are unchanged.

Receipt and size fixtures use native Chromium and a temporary HTTP service. The shared promotion
fixture now borrows owned CDP, closes each context and registers cleanup before setup; failed or
missing owned connections cannot fall back to launch. Standalone campaigns keep their launch path.
The native files retain their existing six-minute campaign bounds; other files use three minutes,
with per-test deadlines and history populations unchanged. Browser startup/drain limits stay intact.

Static census adds only finite numeric >= for the signed boundary title that previously refused.
Admission-bounds pins both sources read at `6398e33`: account-protocol/admission.ts and
account-service/authority.ts. The exact new protocol locator receives prelaunch/reuse/postexecution
checks. Nine captured historical receipts cover the three locator families (six passes, three
required drift refusals); older stage contracts are unchanged.

The owned selection passes in 308.094 seconds with all groups drained. Generated populations are
80 protocol inputs, 12 native receipt histories, 300 census inputs, 100 HPKE seals and 1,000 outbound
model histories. Real Yjs snapshot edges and injected coverage descriptors retain distinct claims.
Registry controls preserve required evidence rather than execute all referenced obligations; earlier
outbound models do not validate the current writer. Optional JSON exports remain separate.

All 90 pure adapter tests, 21 Node owner tests, 12 native owner tests, direct TypeScript, scoped
style, planning and authority pass. Five Vitest process tests retain prior evidence. The ledger
phase's initial orphan classification remains unresolved; later passes do not establish a fix.
All 149 prior general contracts / 1,314 identities remain unchanged. General selections now include
157 files / 1,357 cases (96 Vitest, 61 Node), with 51 Account files / 263 cases. The
[packet](./account-conformance-runs/2026-09-13-preparation-fixture-adapters/README.md) retains full
receipts, 271 pins, historical/browser identities, exact patch and preservation within 150 kB.
Signed `950fe83` closes this bounded phase; it is not an immutable aggregate.

## Delivery-oracle and parser-conformance fixtures — phase 2w

Signed `950fe83` closes preparation/registry integration. `oracle-parser-fixtures` adds seven files /
46 cases: delivery controls 12, finite oracle 1, parser baseline 3, controls 12, objects 7,
submission 3 and wires 8. All selected test files, helpers, product sources, assertions, seeds,
populations and per-test deadlines are unchanged. New Node stages keep the standard three-minute
file bound and five-second drain grace. They use in-memory Vite builds, without native browsers.

The delivery control titles use an imported table. A pre-change census refused it. The new reader
accepts only the reviewed helper's named controls export and literal key/two-string patch pairs,
without importing dependencies, executing its body or invoking functions. Its full bytes enter the
contract. A 160-population property checks independent case order and identity; malformed, mutable,
dynamic, unreviewed and symlink inputs refuse. Changes before launch/reuse or during execution
refuse even if names stay identical; three captured owner receipts show two passes and one required
refusal. Existing Vitest JSON inputs retain their path scope and now also receive an explicit final
byte check, in addition to the complete source fingerprint.

The old delivery oracle at `77b0bb6239f7b7a48c4a52c74d3e3f39e39994a3` and four parser baseline sources
at `f0b6acd2e624d89034c88706d4053a830ab50cc6` enter two stage contracts. Four exact new historical
locators are admitted. Twenty-one historical owner receipts cover seven locators: fourteen passes,
seven required drift refusals, all drained. Older contracts retain their exact identities.

The selection passes in 54.046 seconds including fingerprint work. It retains 3,350 seeded parser
inputs, two historical properties that must fail and shrink, twelve delivery mutations and twelve
parser mutations. The finite oracle cross-check covers 80 worlds / 2,197 three-proof histories over
three positions; it grants no signature authority. Four mutations escape the old reduced oracle but
fail full-state comparison. The submission mutation removes both redundant consumption/re-encoding
guards. Real Yjs wire-boundary tests are not CPU/memory/workload qualification. The earlier 500
full delivery histories retain their separate unchanged Vitest evidence; they were not rerun here.

All 92 pure controls, 23 Node ownership checks, five Vitest process checks, direct TypeScript, scoped
style, planning and authority pass. Twelve native ownership controls retain the preparation evidence.
The ledger phase's initial expected-positive orphan classification remains unresolved despite later
passes; these results establish no fix. All 157 prior general contracts / 1,357 identities remain
unchanged. General selections now contain 164 files / 1,403 cases (96 Vitest, 68 Node), including
58 Account files / 309 cases. The [packet](./account-conformance-runs/2026-09-13-oracle-parser-fixture-adapters/README.md)
retains full receipts, exact patch, source/helper pins, historical/registration controls and preservation
within 150 kB. This phase is uncommitted; no immutable aggregate or whole-wrapper credit is claimed.

## Next bounded integration

All eleven current catalogue adapters remain resolved: 163 cases and 54 mutations. The manifest has
612 obligations / **253 blocked rows**: 94 test-file, 96 command and 63 campaign obligations.
All Vitest files have adapters; 78 Node and sixteen Playwright files remain. Next review the three
transport service fixtures (controls, generated histories and service cases), then browser-backed
receive fixtures. Review actual effects and historical sources; filenames alone do not grant
ownership credit. Other Node fixtures, native browsers, Playwright, nested owners and exact wrapper
postconditions follow. Optional ACCOUNT_REPORT_DIR exports remain disabled in these file selections.
Resolve retired-v8 wrapper invocations without reviving support. R-04 needs explicit archive/generated
style scopes, live-source repairs and full checks. Preserve ordered vector/traceability prerequisites
and the open owner/loaded-host reliability observation.

Only after every required obligation resolves should P-06's remaining cryptographic prose sweep and
the complete immutable selected run proceed. State workload/platform/claim dispositions before
private Account app/service walkthrough prep and human passkey/recovery/adoption work. No personal
app/server/profile or Account cutover occurred in this validation sequence.
