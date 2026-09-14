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

**224 obligations remain blocked.** This is a count of unresolved manifest rows, not defects or
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
node scripts/release-validation/execute.mjs --selection transport-service-fixtures
node scripts/release-validation/execute.mjs --selection receive-transport-fixtures
node scripts/release-validation/execute.mjs --selection receive-driver-fixtures
node scripts/release-validation/execute.mjs --selection sync-fixtures
node scripts/release-validation/execute.mjs --selection receive-editor-fixtures
node scripts/release-validation/execute.mjs --selection spool-fixture
node scripts/release-validation/execute.mjs --selection delivery-native-fixture
node scripts/release-validation/execute.mjs --selection decisions-native-fixture
node scripts/release-validation/execute.mjs --selection capture-native-fixture
node scripts/release-validation/execute.mjs --selection editing-native-fixture
node scripts/release-validation/execute.mjs --selection handoff-native-fixture
node scripts/release-validation/execute.mjs --selection admission-native-fixture
node scripts/release-validation/execute.mjs --selection genesis-native-fixture
node scripts/release-validation/execute.mjs --selection promotion-native-fixture
node scripts/release-validation/execute.mjs --selection authority-native-fixture
node scripts/release-validation/execute.mjs --selection recovery-native-fixture
node scripts/release-validation/execute.mjs --selection core-native-fixture
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
within 150 kB. Signed `a20e678` closes this phase; no immutable aggregate or whole-wrapper credit is claimed.

## Shared transport service fixtures — phase 2x

Signed `a20e678` closes the oracle/parser phase. `transport-service-fixtures` adds three files /
ten cases: controls 2, generated 1, service 7. Real authority/core/SQLite calls use synthetic
WebAuthn/recovery/admission state. No HTTP server or browser runs. Existing Node ownership suffices;
no finite-reader or owner implementation changes. The two retired v8 browser files and old transport
wrapper command remain excluded. Shared v1 service readback stays required; v2 receive is separate.

The initial owned run exposed a stale test: fresh 4 MiB+16 ciphertext submissions correctly failed
R-01's 512 KiB envelope admission bound, leaving an empty stream. The repaired test first checks
that refusal, seeds historical decisions using signed pre-R-01 `account-service/delivery.ts` at
`4bb09042f37f68ec31f0d82587af608f599eb096`, and uses current code for cold readback/exact retries.
The source enters its receipt contract through the existing historical checks. A new case proves
512 KiB admission and one-byte-larger refusal without consuming the position, then count-bounded
pages after restart. Inventory assertions compare promotions and delivery_decisions, not every
SQLite byte or table. Large payloads are signed synthetic ciphertext, not browser decryption evidence.

Expanded historical work hit the old 40-second test timeout. Its final 90-second allowance matches
the existing equivalent inbound fixture; the three-minute stage bound and five-second drain grace
remain. The sixty generated 4–16-command histories retain seed 9112026, endOnFailure:true and their
45-second test timeout. Two exact source mutations remove signature verification or final snapshot
comparison; independently checked signed pages demonstrate the unauthorized result. Current controls
require refusal. Restart means connection reopen, not process death or power loss.

The final selection passes ten cases in 89.377 seconds including fingerprint work; all groups drain.
All 92 pure adapter checks, direct TypeScript, scoped style, inventory/manifest, authority and signature
checks pass. The unchanged 23 Node owner, five Vitest process and twelve native controls retain prior
evidence. The earlier expected-positive orphan classification remains unresolved; no fix is claimed.
The [packet](./account-conformance-runs/2026-09-13-transport-service-fixtures/README.md) preserves the
initial failed selection, expanded-fixture timeout, final receipts, exact patch, historical/source pins
and preservation. An earlier new planning assertion misclassified the already-retired wrapper; its
corrected exclusion check and original failure log are also retained. Product source is unchanged.
All 164 prior contracts / 1,403 identities remain unchanged. General selections now cover 167 files /
1,413 cases (96 Vitest, 71 Node), with 61 Account files / 319 cases. Signed `b0e7828` closes this phase.

## Browser receive-transport fixtures — phase 2y

Transport service fixtures are signed `b0e7828`, matching the recorded `6abb609` tree.
Browser receive-transport fixtures are signed `fa80a53`. Both signatures are verified; historical
evidence retains its actual execution identity and signing status at capture. `receive-transport-fixtures` adds three files / fourteen cases (controls 4, generated 1,
native 9) through the existing owned-CDP adapter. Product code, control/generated tests and shared
helpers are unchanged. A stale native overflow assertion is corrected to the exact R-01 refusal. Preserve the original wrapper's individual 90/330/120-second file
bounds, 15-second browser startup and five-second drain grace. Earlier admission-evidence browser
files retain six minutes. No finite-census or stage-owner implementation change was needed.

The shared fixture creates a fresh context and synthetic custody/member/recovery state against a
temporary loopback Account service. Cleanup is registered before setup. Each context closes, browser
connections disconnect and fixture services close; the stage owner separately drains owned Chromium.
The 16 generated histories close each context immediately while base service/connection cleanup runs
at the outer test's end. In-memory Vite builds use the disposable checkout, without a root build.

The real v2 HTTP case submits two positions and checks durable read progress and cold empty tail.
Other directed cases use signed independent fixture pages or controlled HTTP/stream failures for
refusal, truncation, overflow, redirects, loss, stale responses, single-flight, request supersession,
ordered publication, local admission during fetch, cancellation drain and before/after IDB commit
renderer crash retry. Cold means a fresh page in the same context. These are not power-loss or full
browser-crash tests. Four exact omission controls remain effective: queue, flight, bound and drain.

The sixteen generated histories retain seed 9112042, endOnFailure:true and the 300-second test
bound. Each six-to-nine-action history compares text, durable receive prefix and local capture count
after receive/local/lost/corrupt/restart/compact; every action type must occur. Restarts close cleanly;
renderer deaths are separate directed cases. Signed generated pages are fixture responses, not
randomized real-service delivery. Dormant historical helper controls are not invoked and their ambient
flags are not inherited, so no new historical input contract is credited.

All fourteen cases pass in 411.739 seconds including fingerprint work, with worker and browser
groups drained. All 92 pure runner checks and 12 native ownership controls pass, with direct TypeScript,
scoped style, planning and authority. The initial new planning assertion used a nonexistent polling
filename; corrected to receive-driver, its failure log is preserved. The first owned run also failed
the stale overflow assertion: explicit rejected/response-too-large/recorded:false was not one of its
old expected outcomes. Eight other native cases passed and both groups drained. The repaired assertion
requires the exact rejection and retains no-cursor/no-storage-change checks. The full selection then
passes within unchanged deadlines; complete initial receipts are preserved. The 23 Node owner and five Vitest process controls retain pinned prior evidence.
The earlier expected-positive owner orphan classification remains unresolved; no fix is claimed.

All 167 prior contracts / 1,413 identities remain unchanged. General selections now contain 170 files /
1,427 cases (96 Vitest, 74 Node), with 64 Account files / 333 cases. The [packet](./account-conformance-runs/2026-09-13-receive-transport-fixtures/README.md) retains full
receipts, browser/source pins, ownership evidence, exact patch and preservation. Its source patch is
relative to the preceding staged transport tree; the execution retains its actual HEAD and full input
fingerprint. New documentation/evidence does not make this an immutable aggregate. Signed `fa80a53`
closes this phase. Optional JSON exports and the wrapper's original order/prerequisites remain separate.

## Receive-driver polling/reconnect fixtures — phase 2z

Transport service `b0e7828` and receive transport `fa80a53` are signed and verified. The former matches
the preceding packet's recorded staged tree exactly. Archived receipts and signing-status-at-capture
text remain unchanged; current navigation records closure. `receive-driver-fixtures` adds four files /
seventeen cases: scheduler controls 5, generated 1, native dispatch controls 2, native 9.

The scheduler controls need only Node and a copied TypeScript module under the disposable checkout's
ignored test-results directory. Its type-only import is erased by Node. A virtual clock and held
operation promises expose overlap, missing idle polling, cleared sticky halt, observer cancellation
and lost resume; each source replacement requires an exact anchor. Only three files use the existing
owned-CDP browser. Final file deadlines are 90/270/90/180 seconds; per-test bounds,
15-second browser startup and five-second drain grace remain. No owner or finite-reader changes.

Ten generated browser histories retain seed 9112052, endOnFailure:true and 240 seconds. Five to seven
publish/local/lost/offline/halt/restart actions compare writing, durable receive progress and local
capture count at each step, including reopen request cursor. All action types must occur. Fixture
pages are signed independently; generated histories do not exercise randomized real-service delivery.

Nine native cases cover real service empty-to-later-acceptance polling with fresh requests and no
local wake; lost replies/backoff plus local editing; sticky invalid-page halt; aborted native receive
and Local repair; close/exclusion drain and prompt backoff close; four R-01 wire/count/declared/streamed
size refusals that preserve Local and retry only explicitly. Two native controls inject offline or
journal pressure at the final dispatch boundary: baseline fetches zero times, bypass fetches once.
Offline/online uses a navigator override and synthetic events. Reopen is a fresh page in the same
context with clean close, not a browser crash, power-loss or real second-device test.

The final selection passes all seventeen cases in 424.417 seconds with all worker/browser groups
drained. All 92 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures
pass. Product source, selected tests/helpers, assertions and populations are unchanged. The initial
native file hit its 120-second deadline after seven passing cases; signed history shows that bound
predated four R-01 additions to the original five-case suite. Both adapter and wrapper now allow
180 seconds for the whole file while all 45-second case limits remain. The initial partial report,
full failure receipts and signed provenance are retained. Unchanged Node owner/Vitest-process/native
controls (23/5/12) retain pinned prior evidence. The earlier expected-positive owner orphan classification remains unresolved.

All 170 prior contracts / 1,427 identities remain unchanged. General selections now contain 174 files /
1,444 cases (96 Vitest, 78 Node), including 68 Account files / 350 cases. The [packet](./account-conformance-runs/2026-09-14-receive-driver-fixtures/README.md) retains
full receipts, browser/source identities, exact patch, prior contracts, signature reconciliation and
preservation. This new phase is uncommitted. Frozen bounded evidence is not an immutable aggregate;
optional JSON outputs and original wrapper ordering/prerequisites require separate postconditions.

## Account sync/composition fixtures — phase 2aa

Receive-driver fixtures are now signed and verified as `8bd6a07`; historical receipts retain their
execution identities. `sync-fixtures` adds five files / 29 cases: batch 7, scheduler controls 5,
generated 1, native controls 4 and native 12. The scheduler file runs in Node; the other four borrow
the owned CDP browser through the reviewed promotion fixture chain. File limits are 300/90/450/150/600
seconds; browser startup remains 15 seconds and drain grace five seconds. Batch receives the prior
liveness ownership group's 300-second ceiling as a complete file, not credit for that whole group.
Other four bounds match the current sync wrapper. Per-case deadlines and generated population remain.

The first focused scheduler run failed every case before assertions. R-01 added a real protocol
EnvelopeSizeError import that became invalid when copying the module beneath test-results. The
fixture now rewrites exactly that import to the actual current protocol module and keeps every
mutation/assertion. Before/after logs and signed-history evidence are retained. The historical build
uses two actual pre-R-01 sources at `4bb09042f37f68ec31f0d82587af608f599eb096`, preparation and delivery,
plus one current sealer mutation. Both Git inputs are pinned in the native receipt; git reads are
bounded to five seconds and 2 MiB. This is a composite fixture, not a complete historical app.

All 29 cases pass in 990.122 seconds including fingerprint work, with worker/browser groups drained.
Six batch cases exercise actual renderer death before/after IDB position/attempt/envelope commits.
The seventh compares exact retry and grouping [8,3] after a lost accepted reply and later edits.
Eight generated actual-service histories keep seed 9112062, numRuns:8, endOnFailure:true and a
420-second test bound. Five to seven actions cover edit/offline-edit/lost-send/lost-read/compact/restart;
after each action writing, captures, source-to-position mapping, send/read progress and invocation
counts agree. Five virtual-clock scheduler omissions, five native omissions in four cases, and one
native preflight omission remain effective. Twelve native cases also cover close/shared permit drain,
local admission during sealing, retained receive conflict and current refusal/restart of old oversized
sealed or prepared submissions, preserving originals and avoiding another seal invocation.

Simulated navigator connectivity and routed HTTP losses do not establish real network behavior.
Fresh-page reopen is within one context; renderer crash does not establish browser-process/power-loss
persistence or second-device adoption. Batch's report import loads liveness/residue helper modules,
but never invokes their separate browser/service constructors. Seven batch JSON reports go beneath
ignored test-results in the disposable checkout and are not retained as output postconditions here.
Other optional JSON exports remain disabled. Original wrappers and their ordering/prerequisites remain
separate obligations. Product source is unchanged; only the copied import and Git-read bounds change
in selected fixtures.

All 92 pure runner and 23 Node owner checks pass, including real historical drift before launch/reuse
and during execution for both added paths. Direct TypeScript, scoped style, planning, authority and
signature checks pass. Unchanged five Vitest-process and twelve native-owner controls retain earlier
evidence. The first expected-positive historical service-path orphan classification remains unresolved.
All 174 prior contracts / 1,444 identities are unchanged. General selections now contain 179 files /
1,473 cases (96 Vitest, 83 Node), including 73 Account files / 379 cases. The [packet](./account-conformance-runs/2026-09-14-sync-fixtures/README.md)
retains full receipts, exact patch, browser/input identities, source/helper pins, owner controls and
preservation. This new phase remains uncommitted; frozen execution is not an immutable aggregate.

## Core receive and ordered editor native fixtures — phase 2ab

The preceding sync/composition phase is signed and verified as `0a7d6d4`. `receive-editor-fixtures`
adds two complete files / 29 cases: ordered editor 12 and core receive 17. Both use the existing owned
CDP browser. File bounds retain their wrapper limits of 480/300 seconds, with browser startup 15
seconds and drain grace five seconds. Per-test bounds remain 45/40 seconds, with 200/180 seconds for
the editor/core generated campaigns. Test bodies, seeds, populations, product code and wrappers remain
unchanged. Only the historical-reader Git read gains five-second/2-MiB bounds.

Core receive pins `8378596:src/crdt/promotionRecord.ts` and checks old-reader refusal of v9. Existing
historical locator/owner controls already cover this path. The activation fixture's intermediate v8
state and fencing checks do not revive v8 shipment. Four directed renderer crashes cover receive and
activation before/after commit. Other cases test original content/evidence atomicity, duplicate handling,
compaction and expired cold replay, missing/corrupt records, valid local AEAD/witness over invalid
service proof, pending Yjs dependencies, retained conflict, close drain, native quota retry and authority
change during sealing. A 256-update input refuses before reservation; 255 updates plus an event survive
abort/retry. Coverage omissions test both individually redundant guards and their effective joint removal;
witness, split-content and stored-page source mutations retain their specific readback/admission oracles.

Editor cases require remote publication after durable commit with no local source/undo/outgoing event,
then preparation of queued Local input. They exercise both commit-side renderer crashes, pending
structs/deletes across compaction, pressure and suffix discard, refusal/conflict with continued Local
editing, close with a second page waiting on the same slot, and observer-triggered close followed by
full cold replay. Early-publication and local-relabel mutations expose premature visible text and an
extra source capsule, respectively; the early-publication control also crashes its renderer.

All 29 cases pass in 636.540 seconds including fingerprint work; worker/browser groups drain.
Twelve core generated histories retain seed 9182026, numRuns:12, ordinary shrinking and a 180-second
case bound. One to three operations mix commit cuts, compaction and cold reopen; cursor checks occur
at each step and after crash/retry, then final replayed text is compared. Ten editor histories retain
seed 9202026, numRuns:10, endOnFailure:true and 200 seconds. Three to six actions draw from receive,
local, duplicate, invalid, compact and restart. Writing/cursor/source counts are checked after each
action and writing/source counts after final reopen. The suite has no all-action-coverage assertion;
a duplicate action before the first receive is a no-op.

The fixture service provides setup and authority. Inbound envelopes use separate browser framing and
WebCrypto under synthetic member keys; pages/acceptance proofs use the independent Node/OpenSSL oracle.
This does not execute a real receive HTTP route. Core histories share a context/service across distinct
workspaces; editor histories promptly close their separate contexts. Base cleanup is registered before
setup and the owner drains Chromium. New-page reopen and renderer death do not establish full browser
crash, power loss or second-device behavior. Optional JSON exports remain disabled; their saved-output
postconditions and original wrapper ordering/prerequisites remain separate obligations.

All 92 pure runner checks, direct TypeScript, scoped style, planning, authority and signatures pass.
Unchanged Node owner, Vitest-process and native-owner checks (23/5/12) retain pinned earlier evidence;
the historical allowlist, owner implementation and existing promotionRecord drift controls are unchanged.
The ledger phase's first expected-positive orphan classification remains unresolved. All 179 prior
contracts / 1,473 identities are unchanged. General selections now contain 181 files / 1,502 cases
(96 Vitest, 85 Node), including 75 Account files / 408 cases. The [packet](./account-conformance-runs/2026-09-14-receive-editor-fixtures/README.md) retains full
receipts, exact patch, browser/input identities, source/helper pins, signatures and preservation. This
new work remains uncommitted; bounded execution does not establish an immutable aggregate.

The core Node run took 297.025 seconds against its 300-second deadline; its 301.462-second stage
receipt includes preparation/drain overhead. This narrow margin remains a loaded-host reliability
observation, not a reason to change a currently passing deadline.

## Account spool native fixture — phase 2ac

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

## Account delivery native fixture — phase 2ad

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

## Account decisions native fixture — phase 2ae

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

## Account capture native fixture — phase 2af

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

## Account editing native fixture — phase 2ag

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

## Account handoff native fixture — phase 2ah

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

## Account admission native fixture — phase 2ai

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

## Account genesis native fixture — phase 2aj

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

## Account promotion native fixture — phase 2ak

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

## Account authority native fixture — phase 2al

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

## Account recovery native fixture — phase 2am

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

## Account core native fixture — phase 2an

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

## Next bounded integration

All eleven catalogues remain resolved: 163 cases and 54 mutations. The manifest has 612 obligations /
**224 blocked rows**: 65 test-file, 96 command, 63 campaign. All Vitest files have adapters; 49 Node
and sixteen Playwright files remain. Next review Account activation native fixtures (five cases), then
remaining owners/wrapper postconditions. Keep retired-v8 exclusions and ordered vector/traceability
prerequisites. Existing ledger orphan classification, core receive headroom, capture oracle follow-ups
and deadline evidence remain open. R-04 style scopes/full checks and P-06 prose precede the immutable
run, then private Account app/service preparation and human passkey/recovery/adoption work.
