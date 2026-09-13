# Release-validation execution — foundation and six catalogue adapters

The inventory is committed unsigned as `f13bdd1`, the foundation as `f14c68f`,
content as `b9f0984`, journal as `1a86453`, admission as `4fc3af0`, editor-admission as `3f1afc5` and workspace-admission as `ddd77a3`.
The foundation supplies a finite obligation manifest,
an exact-case Node adapter, a shared bounded stage runner and a disposable execution entrypoint.
It **does not complete the release execution graph**. The original phase-2 proposal grouped the
runner foundation and every native/wrapper adapter together; inspection showed that the latter
requires its own bounded integration phases. Keep that work ahead of P-06 and the immutable run.

The [manifest](./release-validation-manifest.json) now contains 601 obligations, including all 265 current
required test files, 11 current catalogues with **163 cases and 54 discriminating mutations**, 29
vector corpora, 83 registry entries and exact selected package/phase command variants. Six retired
v8 test files remain excluded. Registry entry `remaining-coordination-names` remains explicitly
non-cryptographic: its disposition is checked by the live authority/registry check, not credited as
a cryptographic test. Whole-wrapper obligations stay separate from direct test-file obligations.

**430 obligations remain blocked.** This is a count of unresolved manifest rows, not defects or
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
node scripts/release-validation/execute.mjs --selection content
node scripts/release-validation/execute.mjs --selection content-control
node scripts/release-validation/execute.mjs --selection journal
node scripts/release-validation/execute.mjs --selection admission
node scripts/release-validation/execute.mjs --selection editor-admission
node scripts/release-validation/execute.mjs --selection workspace-admission
node scripts/release-validation/execute.mjs --selection owned-startup
```

The first two commands check reviewed snapshots. Planning may report `blocked` while the snapshot
check succeeds. `node scripts/release-validation/plan.mjs --require-complete` must currently exit
nonzero. `execute.mjs --selection release` likewise refuses; it is not a partial aggregate command.
After reviewing input or selection changes, explicitly regenerate the inventory with `check.mjs
--record`, then the manifest with `plan.mjs --record`. Each artifact has a 700 kB ceiling.

`infrastructure` runs eleven stages: the identity, inventory, manifest, content-adapter, journal-adapter,
admission-adapter, editor-admission-adapter, workspace-admission-adapter and owned-startup-adapter test files
(44 exact cases),
the live authority/registry check and the inventory freshness check. It does not run the package
`check` chain, traceability, native browsers, the crypto-audit campaign or the release aggregate.
The process-control and native content-ownership test files run separately because they deliberately
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

## Next bounded integration

Integrate Local genesis's **17 baseline cases and four mutations**, reviewing factor confirmation,
creator races, generated crash boundaries, authenticated resumption and index exclusion first. Then
resolve remaining catalogue, Node, Vitest, Playwright and wrapper families with their postconditions and
measured deadlines. Five catalogues (81 cases/27 mutations) still need adapters. Vector reuse becomes
meaningful when consumers depend on the same successful identity.

Only after every required obligation resolves should P-06's prose sweep and the complete selected
immutable run proceed. No personal app/server/profile, release deployment or Account cutover is
part of this work. The [foundation evidence](./account-conformance-runs/2026-09-13-validation-runner/README.md)
retains its earlier bounded scope.
