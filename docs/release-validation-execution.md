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

Following signed replay evidence `902cc397` and the selected RC integration, the current [manifest](./release-validation-manifest.json) contains
629 obligations, including all 292 current
required test files, 11 current catalogues with **163 cases and 54 discriminating mutations**, 29
vector corpora, 83 registry entries and exact selected package/phase command variants. Six retired
v8 test files remain excluded. Registry entry `remaining-coordination-names` remains explicitly
non-cryptographic: its disposition is checked by the live authority/registry check, not credited as
a cryptographic test. Whole-wrapper obligations stay separate from direct test-file obligations.

**116 obligations remain blocked: 74 command and 42 campaign rows; no test-file rows remain.**
These require certification of the complete wrappers and their selected prerequisites/postconditions;
they are not 116 missing product tests. The compiler still refuses whole-release execution before
making a checkout.
Dynamic wrapper maps, before-source performance variants, conditional test selection, mutation
postconditions and native process ownership have not been guessed from previous green summaries.
Catalogue data is resolved through a finite AST interpreter; unknown syntax refuses without import.

## Checkpoint and remaining sequence

The earlier F-17 backlog was recorded in five verified signed commits through `e2d42fac`,
including runtime/test checkpoint `15eb389c`. Subsequent integration, lifetime and headroom work
is signed through `e38be54c`; Local activation is signed as `83b5f157`, preparation wrappers as
`5cbad3fa` and report-file retention as `9e4a1d9e`. Account core wrapper integration is signed as `d41a0a56`; recovery wrapper integration is signed as `4e8a8f3a`. Authority wrapper integration is signed as `e18a77df`. Promotion wrapper integration is signed as `b31be6c0`. Genesis wrapper integration is signed as `d38a0ab0`. Admission wrapper integration is signed as `b9d4efa2`. Handoff wrapper integration is signed as `9b7f02ea`. Editing wrapper integration is signed as `61e53cdb`. Outbound is signed as `49cbb1e2`. Capture is signed as `652fd13f`. Spool is signed as `d107f244`. Decisions is signed as `21198b4f`. Delivery is signed as `6ca643f5`. Service-delivery is signed as `9234a706`. Inbound preparation is signed as `9937b8b7`. Inbound codecs is signed as `70788d4e`. Receive is signed as `ccffd280`. Receive-editor is signed as `d178d349`. Receive-transport is signed as `a05369a1`. Receive-driver is ready for signed commit. [Commit map and identity checks](./account-conformance-runs/2026-09-15-f17-commit-backlog/README.md)
connect these commits to the original phase receipts without changing those receipts' revision IDs.
This is bookkeeping, not a new immutable aggregate result.

All eleven catalogue adapters (163 cases / 54 mutations) and all general test-file
adapters are integrated. After selected F-17 combination integration, the current set is
**272 files / 2,198 dispositions, including 11 explicitly not applicable**.
That includes the complete 123-file / 678-case Account group, other Node suites, runner self-tests
and browser application files. The 20 infrastructure test files account for the other required files.
These are reviewed execution contracts backed by bounded phase receipts at their recorded revisions;
they are not a passing full aggregate at the current head.

The application-latency adapter exposed F-17: the last reference card-typing observation is
15.2/69.4 ms desktop/CPU-4x Android against <16 ms. The private Local handoff passes functional gates
and the [prospective command comparison](./f17-local-performance.md) against current reference and
signed baseline. Its unchanged application gate still fails: **12.9/63.5 ms** on the disposable
candidate variant. Other budgeted metrics pass; all twelve cases execute and processes drain.
The physical Pixel 9a companion subsequently completes R/C/C/R with card p95 of
107.9/87.1/86.9/108.3 ms: C improves both paired comparisons but every card budget still fails.
All 960 trusted-key samples and exact edited-card cold-reopen checks survive; other measured budgets
pass. At that checkpoint Local and Account retained the reference; F-17 remains partial. The operator cancels remaining phone/manual work. Keep emulation as the reference, with a rough
1.5× phone card-latency estimate for planning. The [candidate profile](./f17-local-profile.md) passes all four cases, retaining 1,440 timings
and four profiles. History copying, complete comparison and publication remain substantial.
The [selection-snapshot contract and baseline controls](./f17-selection-snapshots.md) now pass
118 owned cases and three fault controls. The subsequent [unmounted owner](./f17-selection-owner.md)
passes nine component cases, 127 affected owned cases and four fault controls. A generated sparse
input found and fixed an initial validator defect. The subsequent [explicit private Local integration](./f17-selection-integration.md) passes 86 workspace
cases, 215 owned cases, both 100-history native campaigns and the ten-case/four-mutation workspace
catalogue. Five new unit faults are detected; a synchronous startup cleanup gap is repaired. The
final full repeat passes 99 files / 1,141 tests, with an intervening two-case timeout run retained.
The subsequent [snapshot comparison](./f17-selection-performance.md) completes 64 sessions with semantic checks passing but misses the incremental gain rule (2.9% shallow versus 10.3% deeper-history improvement over H). All regression guardrails pass. The single unchanged application gate still fails Android card typing at 12.2/75.1 ms desktop/CPU-4x. Android focus also exceeds <50 ms at 54.2 ms. Default activation was refused at that checkpoint. Wrapper counts remain unchanged. [Phone evidence](./account-conformance-runs/2026-09-15-f17-pixel9a/README.md).

The exploratory sequence uses focused controls and short serial browser screens with all main runtime/tests/defaults unchanged. It adds no release receipts or resolved obligations. [Round one](./f17-exploration-r1.md), signed `cc0f85c5`, records the initial combined gain. [Round two](./f17-exploration-r2.md), signed `602e4cee`, retains preparation + comparison pooling + an editor shortcut, while parking publication after mixed requested-Unicode evidence. [Round three](./f17-exploration-r3.md), signed `55ab217e`, profiles that combination and extends string reuse to primitive Yjs values. Its six timing sessions /480 keys, two profiles and 134 focused cases pass, with two faults caught. Paired median/p95 gains are about 13%/30% over its comparator, with a passing separate Unicode guard. These are conditional exploratory effects, not additive percentages or a release budget pass.

[Round four](./f17-exploration-r4.md) shares a detached-snapshot UI card lookup across Collections. Its emitted-build check, 49 focused cases (including 50 generated histories), TypeScript and two fault controls pass in their intended roles. All six browser sessions /480 measured keys pass correctness and closure. Ordinary later median improves 2.7%, but early p95 worsens 8% in both opposite-order pairs; the Unicode timing is mixed. Preserve the tested UI patch as an optional component and retain round three as the selected baseline. No CPU/allocation or full-gate campaign runs in this round. The operator subsequently adopts the architectural sequence below. R4 is signed as `ac0b84ce`. Private-codec/ownership/native/memory checks and the unchanged application gate remain ahead of selected RC entry.

The [application growth diagnostic](./f17-growth-r1.md) keeps R3 fixed and crosses 300/600 seeded cards with retained/cleared history after 1,000 trusted keys. All eight main sessions /1,280 samples, actual intervention/state/depth checks, one-key undo/redo and cold reopen pass with process drain. Six focused hook cases include two fault controls; both native smoke branches pass. A failed immediate-read setup attempt and its passing bounded-settlement reproduction remain separate. Doubling seeded cards raises paired deep medians 59.3% with history retained and 45.2% after clearing; the clear-history effect is modest at 600 and mixed at 300. Prioritize whole-document work while retaining the existing improvements. The diagnostic is signed as `62b19f94`; the repair-eligibility experiment below completes the next bounded step. No product optimization, full gate or release-adapter change occurs in this diagnostic. Its small, accelerated, one-host workload does not qualify general long sessions, memory or handsets.

The [membership-repair eligibility experiment](./f17-repair-r1.md) adds a private repaired-history fact with conservative remote invalidation before apply/publication. Only eligible text skips its one pre-command scan; existing verification, source capture, non-text repair and history ownership remain. Nine affected files /176 tests pass, including 18 new cases /60 generated differential histories; both faults are caught in four owner modes, and TypeScript passes. All six browser sessions /480 measured keys pass semantic/closure checks. Ordinary paired median gains are 5.5% early /10.1% later, with later pair effects 4.50%–15.64%; Unicode gains are 4.86%/4.41%, and every p95 pair improves. Retain repair eligibility on R3, with optional UI/publication patches separate. The initial sandbox listen failure contains no timing and remains recorded. This repair phase is signed and signature-verified as `e0a87263`; main runtime/tests/defaults, adapter counts and the last actual application gate are unchanged.

The [incremental publication experiment](./f17-publication-r1.md) then passes 218 tests /13 files, including nine new cases /60 generated histories, TypeScript and three discriminating faults. It preserves detached reads, actual-change classification, remote/structural fallback and full verification, with explicit fork-normalization refresh. A diagnostic history-clear check catches stale cached undo counts; the scalar-count repair and original failure remain. All six browser sessions /480 measured keys pass semantic and process-drain checks, but early ordinary timing is mixed and later median/p95 regresses in both pairs (median paired regressions 12.3%/18.2%). The Unicode guard is also slower. Park the optional publication patch; keep R3 + repair eligibility selected. The publication phase is signed and signature-verified as `85a58bd4`. Defaults, counts, release receipts and the last actual gate remain unchanged.

The [persistent text-history buffer experiment](./f17-buffers-r1.md) introduces explicit retirement/reownership and two alternating histories, retaining complete stack copies, a catch-up comparison and the existing post-admission full check. All 224 tests /15 files pass, including 14 new cases /60 generated histories and three faults. A normalization eligibility gap and unnecessary adopted-state reference are repaired; original controls and four initial sessions remain. The final six sessions /480 measured keys pass correctness and drain, with receipts proving 40 reuses per ordinary candidate block and zero in the selected/Unicode paths. Ordinary paired medians regress 6.8% early /4.0% later; p95 regresses 5.0%/4.3%. Preserve this as an optional prototype and keep R3 + repair eligibility selected. The phase is signed and signature-verified as `aa54be31`; release counts/defaults/receipts remain unchanged.

The [replay cost/equivalence phase](./f17-replay-r1.md) completes the operator's final optimization round. Four instrumented sessions measure the added comparison at about 11 ms, native replay at 1 ms and fresh document fork at 9 ms; complete stack copying is about 0.1 ms early /0.4–0.5 ms later. The restricted exact-predecessor/native-delta invariant and idle transaction fence replace only the prototype's added comparison. All existing full canonical checks remain. The raw private-field mutation boundary is explicit. Controls pass 227 tests /16 files, 100 new generated histories plus 60 retained workspace histories, TypeScript and four faults. Six separate application sessions /480 measured keys pass semantics, actual reuse/fallback and drain; ordinary paired median gains are 21.1%/20.5% early/later and p95 gains 21.5%/19.8%. Emoji-bearing histories still fall back, with mixed small fallback median changes.

The replay phase is signed and signature-verified as `902cc397`. It recommended R3 + repair
eligibility + replay buffers, with UI/publication and the first buffer comparison parked. That
experimental phase left main runtime, defaults and counts unchanged; the following integration
has now selected and maintained the combination. Broader normalization, incremental history/
verification and larger rewrites remain later work.

Once the application gate has an acceptable disposition, resume command/campaign wrapper certification, including exact dependency/vector
reuse and complete output retention. Resolve the host-Python input binding, recorded timeout/owner/
oracle observations, whole-tree style scope (R-04) and remaining construction prose (P-06), then run
the complete selected graph at one immutable revision for the declared workload/platform scope.
The subsequent private Account rehearsal and human recovery/adoption milestones are described in
[the release plan](./private-release-validation-prep.md#what-follows-validation).

The [2026-09-14 record audit](./account-conformance-runs/2026-09-14-release-status-audit.json) verifies
the eight recent signatures, append-only records and 391 archived payload hashes. This checkpoint is
explicitly revision-bound; [progress](./progress.md) carries the active phase and the checked manifest
carries current counts. Keep this overview reconciled when subsequent integration changes its scope.

The [selected RC integration](./f17-rc-integration.md) now carries the exact measured replay
runtime into maintained code and tests. The full suite passes 107 files/1,209 tests; two owned
epochs pass 29 Vitest files/365 cases plus ten native workspace cases/four mutations. Both native
100-history campaigns and nine isolated faults pass. Eight new file obligations and 68 cases
increase planning counts; the 159 unresolved wrappers are unchanged. Earlier codec tests missing
from the combined patch are restored. Only the planning manifest's administrative size ceiling
increases (800,000→850,000); execution/report/log/performance limits are unchanged.

The [lifetime/composition assessment](./f17-rc-lifetime.md), now signed as `52a6aa80`, passes 152
history/scratch observations and three faults; ten complete Account files pass 102 cases. Its two
core-receive timeouts remain preserved. The subsequent single-round fixture repair passes **17 core
receive cases in 149.007s/300s** and **12 ordered-editor cases in 150.515s/480s** in one owned
attempt, with both groups drained. Receive loads its full browser bundle once per inherited setup;
test bodies, generated seeds/counts, deadlines and runtime remain unchanged. Only ten fixture hashes
and the inventory digest change. This clears the bounded headroom blocker, not all Account files
under one new input identity. [Repair evidence](./account-conformance-runs/2026-09-15-core-receive-headroom/README.md).

The selected Local combination is now the repository default after the
[application gate and explicit RC disposition](./f17-rc-activation.md). The unchanged gate remains
**failed**: Android card p95 38.7 ms (<16 required), settled navigation 113.6 ms (<100 required).
Desktop card is 9.0 ms, Android focus 35.4 ms and the other budgets pass. All twelve bodies/thirty
measurement rows complete with resource drain. The initial exception rule did not allow navigation;
a separate documented post-measurement RC amendment follows the operator's broader authorization.

The same candidate input then passes 147 owned unit cases, ten native catalogue cases/four mutations,
and eight normal Local application cases (20 generated histories). The measured one-line factory
change is applied exactly; Account/internal defaults stay reference. Counts/registrations/limits are
unchanged. [Open F-17 RC debt](./review/implementation/f17-rc-latency-debt.json) is a manual product
disposition, not a test waiver or immutable pass. No personal app/server or phone is changed.
[Current receipts](./account-conformance-runs/2026-09-15-f17-rc-activation/README.md).

**Preparation wrappers are signed as `5cbad3fa`. Owned file-output retention now passes** 68 cases
in six owned executions plus exact report reuse. The real crypto probe report survives checkout
removal; two faults are detected, and original setup failures are retained. Ordinary command variants
are unchanged. [Current report-retention evidence](./account-conformance-runs/2026-09-15-wrapper-file-output/README.md).
This phase adds one test-file and one report-variant obligation; it leaves 94 command/62 campaign rows
unresolved. Next integrate the Account core wrapper with owned files and semantic postconditions.
File custody alone does not establish those postconditions or close other output locations. The
new phase is uncommitted. The failed F-17 receipt stays visible through qualification and immutable
reporting; larger optimization remains deferred.

## Commands and current execution scope

```sh
node scripts/release-validation/check.mjs
node scripts/release-validation/plan.mjs
node --test --test-concurrency=1 test/release-validation/*.test.mjs
node scripts/release-validation/execute.mjs --selection wrapper-file-output
node scripts/release-validation/execute.mjs --selection wrapper-preparation
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
node scripts/release-validation/execute.mjs --selection activation-native-fixture
node scripts/release-validation/execute.mjs --selection service-inbound-native-fixture
node scripts/release-validation/execute.mjs --selection delivery-oracle-native-fixture
node scripts/release-validation/execute.mjs --selection parser-conformance-native-fixture
node scripts/release-validation/execute.mjs --selection promotion-contract-native-fixture
node scripts/release-validation/execute.mjs --selection checkpoint-contract-native-fixture
node scripts/release-validation/execute.mjs --selection counter-contract-native-fixture
node scripts/release-validation/execute.mjs --selection store-contract-native-fixture
node scripts/release-validation/execute.mjs --selection local-provenance-native-fixture
node scripts/release-validation/execute.mjs --selection local-custody-native-fixture
node scripts/release-validation/execute.mjs --selection admission-bounds-native-fixture
node scripts/release-validation/execute.mjs --selection reservation-durability-fixtures
node scripts/release-validation/execute.mjs --selection outbound-native-fixture
node scripts/release-validation/execute.mjs --selection decision-directed-fixtures
node scripts/release-validation/execute.mjs --selection decision-history-fixtures
node scripts/release-validation/execute.mjs --selection failure-fixtures
node scripts/release-validation/execute.mjs --selection liveness-node-fixtures
node scripts/release-validation/execute.mjs --selection liveness-browser-fixtures
node scripts/release-validation/execute.mjs --selection liveness-workload-fixture
node scripts/release-validation/execute.mjs --selection liveness-growth-fixture
node scripts/release-validation/execute.mjs --selection residue-node-fixtures
node scripts/release-validation/execute.mjs --selection residue-calibration-fixture
node scripts/release-validation/execute.mjs --selection residue-lifecycle-fixtures
node scripts/release-validation/execute.mjs --selection residue-generated-fixture
node scripts/release-validation/execute.mjs --selection residue-packaged-fixture
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
(93 exact cases), the live authority/registry check and the inventory freshness check. It does not run the package
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

## Account activation native fixture — phase 2ao

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

## Account service inbound native fixture — phase 2ap

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

## Account delivery-oracle native fixture — phase 2aq

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

## Account parser-conformance native fixture — phase 2ar

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

## Account promotion-contract native fixture — phase 2as

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

## Account checkpoint-contract native fixture — phase 2at

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

## Account counter-contract native fixture — phase 2au

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

## Account store-contract native fixture — phase 2av

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

## Account Local provenance native fixture — phase 2aw

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

## Account Local custody native fixture — phase 2ax

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

## Account admission bounds native fixture — phase 2ay

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

## Account reservation durability fixtures — phase 2az

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

## Account outbound native fixture — phase 2ba

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

## Account directed decision composition fixtures — phase 2bb

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

## Account decision restart and history fixtures — phase 2bc

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

## Account failure and recovery fixtures — phase 2bd

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

## Account liveness Node fixtures — phase 2be

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

## Account controlled liveness and verified-view browser fixtures — phase 2bf

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

## Account ordinary-scheduling workload fixture — phase 2bg

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

## Account growing-history liveness fixture — phase 2bh

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

## Account residue matcher and container fixtures — phase 2bi

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

## Account residue calibration native fixtures — phase 2bj

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

## Account residue lifecycle and service-file native fixtures — phase 2bk

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

## Account residue generated native histories — phase 2bl

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

## Account packaged UI and persistent-profile residue fixtures — phase 2bm

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


## Other Node marker, origin and legacy observer controls (`L-1`)

Other Node marker, origin and legacy observer controls passes 18 cases in 4 files. Four unchanged files retain their 18 exact cases and 550 generated inputs (150 marker, 100 saved-file, 200 byte-decoder and 100 paged-inventory inputs). All stages use a 60-second file bound and the existing inherited process-group guard. Origin checks use disposable output; legacy host controls use files and protocol stubs. No browser, host denial policy or personal installation is used. These controls do not establish production old-writer exclusion or qualify their campaign wrappers.

All 93 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `94d4926b` has a verified signature. 229 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 233 files / 1,790 cases. 25 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: native marker, packaged maintenance and partial Local recovery fixtures.

[Evidence](./account-conformance-runs/2026-09-14-other-node-controls/README.md).


## Other native marker, maintenance and partial-recovery fixtures (`L-1`)

Other native marker, maintenance and partial-recovery fixtures passes 5 cases in 4 files. Three newly integrated cases cover stored marker references through v9 sync/cold retry and tamper refusal without writes, automatic compaction after 140 edits with exact replay, and cancelled/completed partial ZIP recovery with all original carriers preserved. Their existing 120-second file limits are retained. The preceding phase introduced a fixture-name allowlist that rejected existing maintenance/recovery callers even outside the owned runner; both names are now admitted. The qualification selection also reruns both unchanged Account packaged cases, for five passing cases in four files. The marker uses an owned CDP browser; packaged cases use owned persistent profiles inside the guarded worker group. Independent ZIP interpretation still uses host Python without general external-tool identity binding; complete wrapper-output and forensic-erasure claims remain outside this result.

All 93 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `ef5112aa` has a verified signature. 233 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 236 files / 1,793 cases. 22 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: nested process-group ownership for the remaining two harness suites, then runner self-tests.

[Evidence](./account-conformance-runs/2026-09-14-other-native-fixtures/README.md).


## Registered harness groups and current storage lifecycle fixtures (`L-1`)

Registered harness groups and current storage lifecycle fixtures passes 18 cases in 2 files. The 14 cleanup-supervisor cases pass under registered group leaders, preserving their generated diagnostics and failure controls. Three obsolete fixed-port failure expectations are replaced by actual custody/content/journal worker cases that succeed on ephemeral loopback ports while the former ports remain occupied; each verifies clean server and process closure. Storage-properties retains its real fixed-port failure assertion and borrows owned Chromium to reach it. All four 25-second case bounds remain, with a 120-second file bound. The first stale-expectation run and a subsequent browser-identity refusal are retained. The group owner writes an intent before launch, publishes the leader before payload execution, prevents late payload start after closure and separately binds the actual worker PID for custody. Unknown registration or failed closure storage cannot prove drain. All 50 final ownership controls pass: 31 stage, five Vitest and fourteen native, including abrupt death, TERM resistance, late launch and closure-marker failure. This is cooperative ownership for reviewed tests, not hostile-code confinement. The other Node group is complete: nine files / 39 cases. Full campaign output retention, production old-writer exclusion and immutable qualification remain separate.

All 93 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `e7b98bcd` has a verified signature. 236 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 238 files / 1,811 cases. 20 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: the four runner self-test files, followed by browser application tests.

[Evidence](./account-conformance-runs/2026-09-14-other-harness-fixtures/README.md).


## Runner self-test integration and nested stage environment ownership (`L-1`)

Runner self-test integration and nested stage environment ownership passes 68 cases in 6 files. The four runner self-test files now run with exact independent Node case census and registered group ownership; their two native files bind installed Chromium without launching an unused outer browser. The combined qualification contains all 50 self-tests and the 18 previously integrated cleanup/lifecycle regression cases. The first owned run exposed inherited NODE_TEST_CONTEXT suppressing nested Node execution and inner ownership refusals being charged to the outer stage. An explicit stage boundary now supplies its fresh environment and scoped violation sink; ordinary children retain the inherited guard. Reviewed boundaries allow temporary fixtures and the existing disposable checkout output. The initial nesting failures, checkout-boundary refusal and macOS /var versus /private/var alias refusal are retained. Boundary checks resolve existing paths before comparing ownership, including symlink targets. The additional registered stage leader remains in the cleanup census. No case or file deadline was increased. All other Node suites and runner self-test files are integrated; browser application tests remain next. This cooperative process ownership is not hostile-code confinement, and wrapper/output contracts and immutable qualification remain separate.

All 93 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `ff61b085` has a verified signature. 238 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 242 files / 1,861 cases. 16 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: browser application adapter controls and Local startup/editor fixtures, then the remaining browser application files.

[Evidence](./account-conformance-runs/2026-09-14-runner-self-tests/README.md).


## Owned Playwright adapter and Local startup/editor fixtures (`L-1`)

Owned Playwright adapter and Local startup/editor fixtures passes 10 cases in 3 files. The first browser application selection includes eight existing Local startup/editor cases and two new native adapter control cases. The existing application assertions remain, including 20 generated compose/history inputs at seed 8941 and a separate ledger before/after reload. Static binding-aware registration reading expands exact file/suite/project identities without executing hooks or test modules; it distinguishes RegExp.test from the imported test binding. Owned runs borrow Chromium over CDP, start ephemeral loopback Vite inside the guarded worker group and refuse server reuse or framework-launched browsers. Normal standalone Playwright behavior is retained. Reports require terminal success, exact collected and completed cases, one worker, no retries/repetition/unexpected skips, clean framework results and closed server. Inline/file attachments retain bounded exact bytes, size and SHA-256; the generated histories are included. Native controls exercise actual omission, skip, assertion/hook failure, timeout, cancellation, partial progress and attachment retention. The initial no-discovery fixture failure and subsequent public-metadata reconciliation refusal are retained; normal Vite discovery and the public top-level fullyParallel field correct those adapter mistakes. Five pure adapter controls include 160 generated population checks. File bounds are explicit (300 seconds for each Local file and 120 for native controls); existing case bounds are unchanged. This is Local application and runner evidence, not a private Account admission receipt or immutable release qualification. Other browser families, complete wrapper/output contracts and real-device measurements remain separate.

All 98 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `25a204f3` has a verified signature. 242 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 245 files / 1,871 cases. 14 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: packaged Local, storage compatibility and private migration browser fixtures, then upgrade, geometry and latency files.

[Evidence](./account-conformance-runs/2026-09-14-browser-local-fixtures/README.md).


## Packaged Local, compatibility and private migration browser fixtures (`L-1`)

Packaged Local, compatibility and private migration browser fixtures passes 16 cases in 4 files. Three additional Playwright files contribute 14 cases: three packaged Local cases, six storage compatibility cases and five seeded private migration rehearsals. Qualification also reruns the two native browser-adapter controls. The package is built only in the disposable stage, served as exact files on an ephemeral loopback host without HTML fallback, and checked for real precache assets, byte equality and accepted offline writing at both entry points. Development fixtures retain their original Vite configurations; private migration retains its full optimization entry set. Existing application assertions and case deadlines are unchanged. Coverage includes live writer fencing, queued/cancelled opens, renderer death, journal-only future schema, exact source retention, saved-file verification, resumed import, authenticated cleanup and later writing. Source-input/preservation attachments are retained with exact bounded bytes. New file bounds are 180 seconds for the package, 270 for compatibility and 540 for private migration. Private rehearsal ZIP decoding uses host Python; external-tool identity binding remains owed before immutable qualification, as in earlier residue controls. These seeded tests establish no production old-writer exclusion, personal Account admission or whole-release result. Wrapper build/budget/origin/output obligations remain separate.

All 98 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `228031a1` has a verified signature. 245 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 248 files / 1,885 cases. 11 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: application upgrade browser fixtures, followed by geometry and latency files.

[Evidence](./account-conformance-runs/2026-09-14-browser-storage-fixtures/README.md).


## Application upgrade browser fixtures (`L-1`)

Application upgrade browser fixtures covers 10 case dispositions (9 passed; 1 explicitly not applicable) in 2 files. Seven upgrade cases run against two disposable builds and the existing switchable release server: exact asset bytes, first-install offline reopen, multi-tab waiting, interrupted and wrong-byte downloads with retry, renderer death and compatible rollback, and the immediate-activation sensitivity control. The optional actual-predecessor case is explicitly not applicable because no predecessor build is supplied; its named reason must match exactly and it grants no predecessor-upgrade evidence. The independent predecessor-input/wrapper obligation remains open. Two native adapter controls rerun ordinary passing/omitted/skipped/failed census and cancellation/deadline ownership. All application assertions and 35-second case bounds remain unchanged; the 240-second file bound includes both builds. The server factory preserves the standalone fixed-port command while owned runs use an ephemeral loopback server. The reconciler accepts only the exact declared non-applicable case/reason and still refuses every unexpected skip, inverted outcome, retry or annotation. Evidence counts distinguish passes from explicitly unexercised dispositions. This bounded selection is not immutable release qualification.

All 98 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `703990b2` has a verified signature. 248 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 249 files / 1,893 case dispositions (1 not applicable). 10 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: geometry layout/editor browser fixtures, then interaction and latency fixtures.

[Evidence](./account-conformance-runs/2026-09-14-browser-upgrade-fixtures/README.md).


## Integration of geometry layout and editor fixtures (`L-1`)

Integration of geometry layout and editor fixtures covers 50 case dispositions (50 passed; 0 explicitly not applicable) in 4 files. Four Playwright files contribute 50 desktop/Android-emulated cases: breadcrumbs and outline focus, static/mounted card geometry and edit guards, viewport and panel layout, and caret/live-preview line heights. All existing assertions, input fixtures, factor-unlock setup and 30-second per-case bounds are retained. Each file uses a fresh disposable packaged build and an ephemeral exact-file server under the owned Chromium group, with one worker, no retries and exact project/case reconciliation. File deadlines are 240 seconds except layout at 360 seconds; these include preparation and both projects. Android is browser emulation, not real-device performance evidence. The compact manifest is 747448 bytes; its writer and independent test ceiling move prospectively from 750000 to 800000 bytes for the remaining explicit project registrations, with no schema/layout change or deleted obligations. Runtime log/report bounds are unchanged. Predecessor-upgrade evidence and wrapper/build/output obligations remain separate.

All 98 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `763fa7d3` has a verified signature. 249 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 253 files / 1,943 case dispositions (1 not applicable). 6 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: geometry interaction browser fixtures, then latency fixtures.

[Evidence](./account-conformance-runs/2026-09-14-browser-geometry-layout/README.md).


## Integration of geometry interaction fixtures (`L-1`)

Integration of geometry interaction fixtures covers 46 case dispositions (36 passed; 10 explicitly not applicable) in 5 files. Four files declare 44 project/case dispositions: 34 exercised cases and 10 exact device-specific non-applicable cases. Mouse grip and wheel interactions remain desktop-only; touch hold/arbitration cases run only in the Android project. Every non-applicable identity and original reason is independently enumerated, must still exist in the source census, and must match the actual skip annotation exactly. Pure corruption controls cover all 11 named non-applicable dispositions including the previously retained predecessor case; unlisted skips still refuse. The qualification also reruns both native browser-adapter failure/deadline/drain controls. Application assertions and per-case bounds are unchanged. The owned package covers card reorder, touch/navigation arbitration, Local reopen without relay/plaintext identity caches, bounded native wheel behavior, menus, preference persistence, editor focus and deferred/frozen writing. File bounds are 180 seconds except workflow at 360 seconds, with desktop and Android emulation run serially. Emulation supplies no real-device latency evidence. Only the two latency test files remain unintegrated; command/campaign expansion, wrapper outputs and immutable qualification remain separate.

All 98 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `d30b6468` has a verified signature. 253 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 257 files / 1,987 case dispositions (11 not applicable). 2 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: journal latency browser fixtures and measurement retention, then application latency setup and integration.

[Evidence](./account-conformance-runs/2026-09-14-browser-geometry-interaction/README.md).


## Integration of journal latency fixtures and measurement retention (`L-1`)

Integration of journal latency fixtures and measurement retention covers 6 case dispositions (6 passed; 0 explicitly not applicable) in 2 files. The journal file contributes four desktop/Android-emulated cases: published-vector reproduction and the existing payload/level microbenchmark on each project. The configured origin, viewport, device scale, user agent and touch options are now passed to the manually created contexts; Android retains its existing four-times CPU throttle and the fine-clock isolation assertion. The selected historical construction, payload sizes, seven measurement levels, sampling rules and one-millisecond budget assertions are unchanged. These measurements do not cover the full production admission path, and a throttled single-write tail does not establish a handset p95. Each run must retain exactly 44 project/metric rows with finite values, positive sample counts, interpretations and bounded canonical bytes. Missing, duplicate, substituted, malformed, truncated or oversized output refuses independently of test success. Measurements live beside the owned case report, so partial rows survive worker interruption; the native timeout and cancellation controls prove this and drain browser, server and subprocesses. Global setup resets only that fresh output. The final qualification includes the two native controls. File allowance is 720 seconds including build, both projects and benchmark preparation; existing 300-second case bounds remain. The first successful diagnostic run preceded the partial-output retention improvement and supplies no final qualification credit. Standalone result filenames remain compatible; the wrapper/output qualification backlog is not closed by this one artifact contract.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `e29e3510` has a verified signature. 257 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 258 files / 1,991 case dispositions (11 not applicable). 1 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: application latency fixture repair and integration, then recap the completed suite groups and remaining command/campaign qualification work.

[Evidence](./account-conformance-runs/2026-09-14-browser-journal-latency/README.md).


## Integration of current Local application latency fixtures (`L-1`)

Integration of current Local application latency fixtures executed all 12 project/cases and retained all 30 measurements with no skips or retries. Native validation FAILED: the two project teardowns report three deferred timing overruns; the adapter independently rejects out-of-budget measurements. This is completed adapter integration, not passing performance qualification. The last browser file now creates and unlocks the current mandatory-factor Local workspace instead of assuming plaintext startup. Its manually created contexts receive the configured origin and device options. The unchanged 20-day × 15-card and 400-line workload is admitted through the UI, drained, cold-reopened and fully verified on both projects. A locked read-only probe counts the sole existing encrypted store and journal; it aborts accidental DB creation and reports ciphertext/nonce payload and UTF-8 journal bytes, never physical allocation. Two guarded, metadata-only timing marks bracket the real factor-unlocked carrier load/decryption and Yjs replay/owner initialization. Missing timing marks refuse instead of becoming zero. The authority census changes only the hashes of these two source files; classifications and construction labels are unchanged. Factor entry is excluded explicitly: launch-to-prompt and confirmation-to-editor are separate measured segments, whose sums retain the existing cold/warm numeric budgets. Actual viewport and CPU rate are included in every measurement note. Input completion is asserted for both 120-keystroke typing tests. The first run preserved a desktop card-typing p95 of 16.7 ms and exposed an Android fixture timeout clicking Lock workspace in a closed off-screen menu. The repaired helper opens that menu normally; no execution allowance or performance threshold was increased. Timing assertion failures are collected until project teardown, with functional failures still immediate, so later measurements survive a slow earlier result. All nine numeric budget predicates are independently checked by the output adapter; controls reject threshold equality and malformed/missing/repeated metrics. The final desktop card-typing p95 is 18.3 ms and the CPU-throttled Android value is 84.2 ms against <16 ms; Android card focus is 61.4 ms against <50 ms. Other timing checks pass in this observation: cold application work totals 254.2/817.3 ms, warm 229.0/737.2 ms, and encrypted load/replay 6.4/27.5 ms, desktop/Android respectively. The full retained rows preserve precision. These are observations on this host with a 4x-throttled emulator, including wide viewports for seeded editor work; they do not establish handset performance or isolate the cause of an overrun. Both projects and their browser/server/worker groups drain. The failure and earlier fixture defect remain preserved; no rerun is used to erase the measured overrun. All declared test-file adapters are integrated, but native performance qualification and the command/campaign/immutable-release gates remain open.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `d8b8e00e` has a verified signature. 258 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 259 files / 2,003 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: focused application latency calibration and profiling, followed by remaining command/campaign adapters and immutable release qualification.

[Evidence](./account-conformance-runs/2026-09-14-browser-application-latency/README.md).


## Calibrate Local input latency and isolate admission costs (`L-1`)

Calibrate Local input latency and isolate admission costs covers 4 case dispositions (4 passed; 0 explicitly not applicable) in 1 files. A separate owned diagnostic executes two reverse-order blocks of 120 trusted keys per textarea, bare CodeMirror and admitted card on desktop and CPU-4x Android emulation. Both projects use 1280x900 and the unchanged UI-seeded, fully cold-verified 300-card/400-line corpus. All 1,440 raw timing samples, 12 p95 rows and four source-mapped CPU profiles are retained; profiled typing is separate from timing and all added writing survives lock/reopen. Desktop card p95 is 17.2/18.3 ms; Android is 92.9/93.7 ms. Controls vary: desktop textarea 1.6/1.4, bare CodeMirror 1.9/15.5; Android textarea 7/6, bare CodeMirror 8.6/19 ms. Sampling over 60 additional card keys attributes 647.2/3106.6 ms inclusive to private preparation and 237.1/1105.2 ms to projection verification (desktop/Android); nested inclusive values must not be added. These are sampled aggregates, not per-key quantiles or causal speedup estimates. The first attempt was cancelled after read-only inspection found the app service worker replacing the control page with the unlock UI; its receipt, drain evidence and exact patch are retained. Controls now use a separate disposable context with service workers blocked and explicit title/input assertions; the application context is unchanged. Control assets use their own URL prefix. The pilot has no relaxed timing assertions: its success means complete diagnostic evidence only. Original application fixtures, 30-metric census and all nine budgets remain unchanged and the preceding performance gate remains failed. No production source, custody, admission, transport or personal app artifact changes. The standalone latency command excludes this owned-only diagnostic; its explicit runner selection includes exactly four cases. Sampling and limitations were specified before the pilot in docs/latency-diagnosis.md. The two native browser-runner controls also pass, including omission, skip, hook failure, deadline, cancellation and process drain.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `dbc64150` has a verified signature. 259 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,007 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: a bounded admitted-workspace performance repair targeting measured document/history copying and projection verification, with staging/undo/delivery regressions and the unchanged application budget gate; then remaining command/campaign adapters and immutable qualification.

[Evidence](./account-conformance-runs/2026-09-14-application-latency-diagnosis/README.md).


## Reduce complete projection comparison cost without skipping verification (`L-1`)

Reduce complete projection comparison cost without skipping verification completes the bounded comparison repair; the unchanged packaged application gate remains failed. All 12 project/cases execute without skips or retries and retain all 30 metrics. Two project teardowns fail on card typing p95: 16.2 ms desktop and 77.2 ms CPU-4x Android emulation against <16 ms. Focus is 8.1/44.2 ms against <50; startup/replay, compose and navigation meet their existing bounds in this run. The process group drains. The earlier 18.3/84.2 ms typing and 7.4/61.4 ms focus observations remain historical evidence; this cross-run change is not a controlled causal estimate. Both browser projects seed and cold-verify 300 cards and 400 Goals lines through the real Local UI. No budget, deadline or recorder changes, personal-app update, or release qualification. Only the Yjs seam changes production behavior: a bounded eligibility probe selects a complete encoding comparison that retains long writeString values at exact byte offsets. Matching all bytes, offsets and string values proves original encoding equality; any difference reconstructs the original bytes and uses the existing exact-byte/GC-normalized fallback. State vectors, deletions and exact pending bookkeeping still run on every transition. Document/history forks, admission ordering, persistence and wire formats are unchanged. The final full unit suite passes 96 files / 1,030 tests; 150 existing and 200 new generated comparison histories agree with the frozen always-normalizing reference, and 500 fork histories remain. Ignoring retained strings fails two tests. Native pending and original-order delivery each pass 100 generated histories and their directed crash/pressure cases. Native content/publication mutants are detected. The owned workspace-admission catalogue passes ten cases and four mutations with a drained process group. The initial native pending invocation placed its output outside the unchanged Vite allow-list; that harness error and the corrected-location pass are both retained. A test-generator setup error (undefined inserted directly into Y.Array) is retained and corrected without product changes. All exploratory, intermediate and final performance samples and final bundle identities survive. The final alternating comparison-only medians (baseline/candidate) are 1.555/0.280 ms at 1k items, 3.295/3.296 at 10k and 17.791/17.825 at 100k, with 100k visible characters. Sequential full-command results remain mixed. These are dependent single-host observations, not population or causal estimates. The bounded construction and decision conditions were specified in docs/f17-comparison.md.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `5ffce895` has a verified signature. 259 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,010 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: a bounded document/history fork-cost repair preserving private staging, refused-edit isolation, undo and pending delivery, followed by the unchanged application gate; remaining command/campaign adapters and immutable qualification follow.

[Evidence](./account-conformance-runs/2026-09-14-f17-comparison/README.md).


## Reduce detached document fork cost while preserving runtime semantics (`L-1`)

Reduce detached document fork cost while preserving runtime semantics completes the bounded runtime-fork repair; the unchanged packaged application gate still fails on CPU-4x Android card typing. All 12 project/cases execute without skips or retries and retain all 30 measurements. Desktop card typing is 15.2 ms and meets <16; Android is 69.4 ms and fails <16. Focus is 7.4/35.7 ms against <50. Startup/replay, compose and navigation also meet their unchanged bounds. One project teardown reports the collected overrun and the process group drains. Previous typing was 16.2/77.2 ms; this cross-run change is descriptive, not a controlled causal estimate. Both projects seed and cold-verify 300 cards and 400 Goals lines through the real Local UI, with seeded editor work at 1280x900. No threshold, deadline, recorder, personal app or deployment changes; this is not handset or immutable-release qualification. Only src/crdt/yjs.ts changes production behavior. Detached documents use V2 struct compression with paired private encoder/decoder overrides for V1 legacy JSON and independent UTF-8 string semantics. Binary views, including leaves nested inside arbitrary arrays/objects, detach before temporary update bytes are cleared. Pending update bytes, missing-clock maps and pending deletions still copy exactly without replay; runtime redone links and deep undo stacks remain. Both private drafts, per-transition comparison, admission order and persistent/outbound V1 formats are unchanged. The naïve public-codec swap fails three tests; its exact patch and original added test source are retained. The signed baseline fails the new nested-binary regression, establishing a pre-existing V1 temporary-buffer aliasing defect; the repair preserves those values without claiming personal writing was affected. The final unit suite passes 96 files / 1,035 tests. Two hundred generated Unicode/nested-content cases compare with the frozen V1 reference and test isolation both ways; 150 generated undo/redo histories compare repeated forks with an unforked reference and check selection-metadata isolation. Existing 500 fork and 350 comparison histories remain. Pending-map aliasing and omission of redone links each fail their intended control. Native pending and original-order delivery each pass 100 generated histories plus their directed crash/pressure cases. The owned workspace-admission catalogue passes ten cases and four mutations with process drain. Final alternating fork medians are 0.695/0.415, 3.119/1.779 and 36.897/22.252 ms baseline/candidate at 1k/10k/100k items over 100k visible characters. That satisfies the prospective >=20% fork-gain rule with no consistent >10% regression in another stratum. Sequential whole-command timings remain mixed: 13.585/15.210, 26.115/23.815 and 130.601/116.110 ms. Every pilot/final sample and bundle identity survives; the naïve pilot is not evidence for the revised candidate. These are dependent single-host observations, not population or causal estimates. The prospective protocol, refinement prompted by semantic failures, final source patch/pins and negative controls are retained.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `e2c93b05` has a verified signature. 259 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,015 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: isolate the remaining undo-history and duplicate-preparation costs with the revised runtime, then choose a bounded ownership or history-copy repair that preserves staging and full verification; remaining command/campaign adapters and immutable qualification follow.

[Evidence](./account-conformance-runs/2026-09-14-f17-forks/README.md).


## Profile residual preparation and undo-history copying (`L-1`)

Profile residual preparation and undo-history copying covers 4 case dispositions (4 passed; 0 explicitly not applicable) in 1 files. No production, test, manifest or authority-contract changes. The unchanged browser diagnostic retains 1,440 raw timings, twelve p95 rows and four mapped CPU profiles, with cold-reopen checks. Card p95 is 15.0/16.4 ms desktop and 73.0/73.9 ms CPU-4x Android in the two blocks. The separate application budget gate remains failed at its last 15.2/69.4 ms observation. Across separate 60-key profiles, stack copying uses 157.8/738.2 ms desktop/Android, alongside 166.4/752.5 ms for the admission draft and 148.2/730.9 ms for the history draft. Nested totals overlap. Native structuredClone is not isolated from inline callback work. Nine controlled Node strata retain all 360 measured forks: at 1,000 undo groups, full history medians are 1.848, 8.802 and 559.527 ms with zero, one and 100 selection targets; corresponding document medians are 1.153, 1.180 and 1.348 ms. Fixed document state within pairs and metadata strata helps localize copying cost; increasing stratum order, dependent host/JIT/GC observations, stress-only target layout and zero redo/redone coverage limit inference. The prospective protocol, raw profiles/mapped nodes, probe, all samples, analysis and source-map hashes are retained; complete generated maps remain in the raw run. No application speedup or budget closure is claimed. The next bounded attempt preserves deep isolation and both drafts while specializing known selection metadata, with arbitrary metadata falling back to the existing clone. The personal app, server and deployment remain untouched.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `1fd04afa` has a verified signature. 260 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,015 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: prototype fully detached selection-metadata copying with structuredClone fallback, generated value/alias/undo controls and balanced baseline/candidate timing before the unchanged application gate; duplicate preparation and the remaining command/campaign and immutable qualification work remain.

[Evidence](./account-conformance-runs/2026-09-14-f17-history-profile/README.md).


## History metadata optimization assessment (`L-1`)

History metadata optimization assessment covers 15 case dispositions (15 passed; 0 explicitly not applicable) in 1 files. Both metadata fast paths are rejected and all production bytes are restored to signed 8c5fdaee. The first recursive dispatcher passes focused correctness but improves the 1,000-group one/100-target strata by only 5.1%/20.1%; direct constructors improve them by 10.3%/30.5%. Neither satisfies the predeclared >=20% rule in both strata. Each distinct implementation has its own fixed nine-stratum, five-warmup, twenty-alternating-pair observation: all 720 measured forks, source patches, bundle hashes, ranges and failed acceptance decisions are preserved. These dependent single-host observations do not estimate a customer workload or application speedup. Three new retained cases add 200 generated reference-graph/isolation checks, fallback values/cycles/accessor behavior and 150 undo/redo histories with restored master/card selections against an unforked reference. Sharing a nested ID fails the intended isolation assertion in both discarded candidates; a shallow-copy mutation fails the same assertion in the retained baseline. The full unit suite passes 96 files / 1,038 tests. The owned runner executes the changed suite as an explicitly bounded subset, with all 15 cases passing and process drain. Only the changed suite, two runner denominator fixtures and their reviewed planning/case registrations change executable validation coverage; source, authority labels, exclusions and selection membership are unchanged. No runtime/native/application campaign is rerun after restoring production; the conditional optimization gate was not reached. The last independent application gate remains failed at 15.2/69.4 ms desktop/CPU-4x typing. The personal browser, server, package and deployment remain untouched.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `8c5fdaee` has a verified signature. 259 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,018 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: specify and test a workspace-only preparation handoff bound to its accepted basis, with canonical ownership, refusal/disposal, Account source coverage and full per-transition verification preserved; then attempt removal of the duplicate draft under unchanged budgets.

[Evidence](./account-conformance-runs/2026-09-14-f17-metadata/README.md).


## Workspace preparation ownership contract and baseline controls (`L-1`)

Workspace preparation ownership contract and baseline controls covers 57 case dispositions (57 passed; 0 explicitly not applicable) in 3 files. Defines the workspace-only preparation contract without changing production or removing a draft. The future handoff binds owner identity, accepted revision, current writer, queue job and slice; it consumes a preparation once, retains the same bytes/history for storage retry, and requires a fresh binding for remaining slices. Canonical privacy, complete post-promotion comparison, Account original-source replay/coverage, acknowledgement ordering and cleanup ownership remain mandatory. Four new cases cover 80 generated retry/discard/remote histories against an independent accepted-text/revision ledger and cold carriers, no-op revisions and writer collision, actual private-history disposal on discard and drained close, and 160 generated source-coverage checks with pending structs, missing clocks and pending delete sets. All four deliberate faults fail their intended assertions: a stale draft, premature promotion, leaked history and omitted source verification. These are baseline production tests, not proof that the unimplemented capability rejects forged or stale contexts. The full unit suite passes 96 files / 1,042 tests, and the owned runner executes all 57 cases across the three changed suites with process drain. Only those suites, two denominator fixtures and their reviewed inventory/manifest records change executable validation coverage; all selection membership and exclusions stay fixed. Initial fixture assumptions about synchronous queue completion and nested Yjs update emission, plus an incorrect import, were corrected before qualification; original failed logs remain. No runtime/native/application campaign or timing was rerun. The last independent application gate remains failed at 15.2/69.4 ms desktop/CPU-4x typing. Personal browser, server, package and deployment remain untouched.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `213ada08` has a verified signature. 257 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 260 files / 2,022 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: implement the private preparation context and handoff ownership component, with actual foreign/stale/reuse/wrong-slice and disposal controls while retaining the current editor path; then gate Local integration against the legacy path and unchanged application budgets, with Account source activation separately checked.

[Evidence](./account-conformance-runs/2026-09-14-f17-preparation-contract/README.md).


## Private workspace preparation handoff component (`L-1`)

Private workspace preparation handoff component covers 20 case dispositions (20 passed; 0 explicitly not applicable) in 1 files. Adds the private workspacePreparation component without connecting it to admission or the editor. Frozen identity contexts bind the verified local head, job, slice, accepted revision and writer. Preparation is synchronous and one-shot; scoped history/buffers transfer ownership, verification precedes source custody capture, retries borrow the identical retained result, and close revokes authority while awaiting active writes before disposal. Adoption requires the same job/slice at exactly the next revision and successful full comparison before transferring history; verification failure after promotion is terminal. The component has no canonical reference or public workspace export; its integration callbacks must retain complete comparison, actual transaction-derived updates, queue reservations and independent Account source coverage. Twenty component cases use actual Yjs histories and source/canonical comparisons, including 120 generated accepted-text/revision/undo/cold-replay traces. Eight deliberate mutations fail their intended assertions. New tests first exposed two resource-cleanup gaps in this unconnected component: late async results and incomplete collection of a closing command's returned buffers; both are repaired with original source/tests/output retained. A control initially timed out because its fixture failed to release an unexpectedly successful borrow; its cleanup is corrected and the original failure remains. The first full unit run, concurrent with other validation, timed out in two unchanged five-second cases: Account liveness and position decisions. The same default full command then passes alone at unchanged limits: 97 files / 1,062 tests. This supports the bounded functional checkpoint, not closure of loaded-host timing headroom; concurrency as the cause is not established. The owned runner passes all 20 new cases with process drain. One reviewed suite and 20 cases are added; all 260 prior general contracts, exclusions, crypto labels and prior runtime source bytes are preserved. The runtime census adds only the new unconnected component. No application/native campaign or performance timing is run; the last independent application gate remains failed at 15.2/69.4 ms desktop/CPU-4x typing. Personal app, server, package and deployment remain untouched.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `6c5502fd` has a verified signature. 260 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 261 files / 2,042 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: integrate the private handoff into Local admission with matching job/slice publication, preserving the generic path as a reference; compare both paths through command/undo/selection, retry/discard, remote and shutdown histories plus native crash/pressure checks before a prospectively specified performance comparison; Account source activation remains separately gated.

[Evidence](./account-conformance-runs/2026-09-14-f17-handoff/README.md).


## Private Local preparation handoff integration (`L-1`)

Private Local preparation handoff integration covers 155 case dispositions (155 passed; 0 explicitly not applicable) in 8 files. Connects the private Local handoff through explicit internal constructor registration; the default Local opener and every Account factory retain the generic reference path. Shared workspace commands capture actual transactions and preserve history, selections and result values. Candidate preparation omits the first canonical-derived draft, binds the verified job/slice/revision/writer, leases bytes through storage, retries the same preparation, copies a remainder before erasure, and performs full canonical comparison before adoption/publication. No-op transitions still advance revision; remote writer collisions renew the writer. Publication source and revision must match the adopted candidate. Post-promotion failure is terminal and preserves its projection-mismatch cause. The 23 original workspace cases run under both strategies; each also runs no-op/writer-collision and reentrant-observer controls plus the same 80 generated histories (seed 140925). Independent text/revision/undo/redo/cold-replay and selection/retry-count assertions accompany two Local-specific close/adoption cases: 54 workspace cases total. Eight affected files pass 155 dispositions through the owned runner. Native pending-state and original-order delivery each pass directed cases plus 100 generated histories. The final owned workspace catalogue passes ten cases and four mutations with drain. The first pending-state campaign found a new integration gap: a Local initialization publication relabeled as remote was tolerated after adoption. Binding its source fixes the existing directed counterexample; original source, failed report, repair pass and a new source-check mutation are retained. Two unit mutations separately detect skipped adoption comparison and premature byte erasure. Full units pass alone at unchanged limits: 97 files / 1,093 tests. The reviewed general set is now 261 files / 2,073 dispositions, including the same 11 not applicable; 260 prior general contracts and all original workspace reference cases remain. The crypto census changes only four runtime source hashes; domains, labels, groups and other source hashes remain unchanged. No performance measurement, default activation, Account source activation, package change or personal-browser operation occurs. The last application typing gate remains 15.2/69.4 ms desktop/CPU-4x Android, with Android failing <16 ms.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates pass. The preceding commit `0c84e5cc` has a verified signature. 260 prior general contracts and all exclusions are preserved; 52 personal/vector pins and L-2 remain unchanged.

General integration now covers 261 files / 2,073 case dispositions (11 not applicable). 0 test-file, 96 command and 63 campaign obligations remain. These counts describe integration coverage, not defect counts. Wrapper/output, host-Python binding, prior owner/headroom/oracle observations, R-04/P-06 and immutable aggregate qualification remain separate. Next: prospectively specify and run balanced candidate/reference whole-command measurements, retaining the signed baseline as a comparison, and the unchanged application latency gate before deciding default Local activation; Account source/capture activation remains separately gated.

[Evidence](./account-conformance-runs/2026-09-14-f17-local-handoff/README.md).

## Next bounded integration

The accumulated phases are signed through `e2d42fac`. Next profile the snapshot application variant to separate remaining document/history fork, full comparison and publication costs before choosing another repair. Retain the unchanged budgets and failed measurements.
[Latest comparison and gate](./f17-selection-performance.md). Account activation, wrapper
certification and immutable qualification remain separately gated.


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

Next: The accumulated phases are signed through `e2d42fac`. Next profile the snapshot application variant to separate remaining document/history fork, full comparison and publication costs before choosing another repair. Retain the unchanged budgets and failed measurements.
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

## 2026-09-15 — Command/campaign wrapper preparation integration

The Local activation and explicit RC latency-debt checkpoint is signed and signature-verified as
`83b5f157`. The first wrapper slice now executes the real crypto preparation check-mode campaign,
including registry/home/manual-entry/snapshot postconditions. Its package command shares that
campaign obligation. The exact two-file Node command expands a reviewed glob, preserves default
file concurrency and executes all six cases together after the campaign. Serial single-file
receipts do not discharge it. Extra arguments, environment variants and changed glob membership
refuse. Existing catalogue/check aliases now also match argv boundaries and empty environment.

The Node reporter retains passing-test stdout, stderr and diagnostics in the owner's bounded log.
The signed reporter passes a control while dropping those messages; the new reporter retains them.
Oversized passing-test output fails log-limit and drains. This is text exposed through Node reporter
events; optional campaign files and arbitrary binary streams are not claimed as preserved here.
Summary entries now explicitly say whether an exact same-owner receipt was reused.

The final owned epoch passes three full planning suites (26 cases), all 33 runner controls, all
29 vector checks, the actual crypto preparation campaign and its grouped Node command (six cases).
An additional identical vector consumer reuses the original key under the same frozen inputs.
That is 35 executions plus one reuse, 65 cases, and all groups drained. Runner controls take
107.911 seconds against their unchanged 120-second stage bound; retain that headroom observation.
This bounded vector selection does not include AAD coverage or whole traceability/package checks.

The first direct planning pass was 25/26 because a denominator assertion still expected 31 runner
cases instead of 33. The corrected assertion is qualified by the final full planning suites.
The direct runner pass was 32/33: an existing historical-input control reported orphaned-child.
Its complete log remains, but that test removed its original temporary receipt. The later owned
pass does not explain or close the intermittent classification issue. An intermediate inventory
preflight also refused the new summary-writer source bytes before the reviewed refresh.

The first owned epoch passed three planning suites, then was explicitly cancelled with drain after
a separate crypto preflight found the activation source pin stale. Refresh exactly the
admittedWorkspace.ts source hash in docs/account-crypto/census.json; every other census field,
label and group remains identical. The final epoch uses those repaired inputs; earlier failure,
cancellation and successful receipts remain separate. No runtime, personal app, server, performance
budget, protocol or test exclusion changes in this phase.

Counts remain 626 obligations and 290 required files. General integration is 271 files/2,191
case dispositions (11 not applicable), reflecting two new runner controls; three new infrastructure
controls are separate. Unresolved obligations fall from 96 command/63 campaign to **94 command/62
campaign**, with zero test-file obligations. This is adapter coverage, not an immutable release pass.
F-17's failed budgets and explicit RC debt are unchanged. Next: owned file-output retention for
report-producing campaigns, then the first multi-stage Account wrapper with exact prerequisites
and report postconditions. The new phase is uncommitted.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-preparation/README.md).

## 2026-09-15 — Owned campaign report-file retention

Preparation wrapper integration is signed and signature-verified as `5cbad3fa`. Add opt-in
`account-reports-v1` stage output custody: the owner creates a fresh report directory outside the
disposable checkout and supplies ACCOUNT_REPORT_DIR. The contract binds required file paths,
cumulative bytes, entry count and depth to execution/reuse identity. Unmanaged report-directory
environment overrides refuse. Bounded traversal rejects unsupported paths, symlinks, hard links and
non-regular files. Reads are capped and include file identity/size checks; successful inventories
hash every retained file and include empty directories. Reuse and prerequisite validation check
both bytes and complete tree membership, so an added file cannot borrow the old receipt.

Cooperative polling stops a violating writer. After producer drain, a bounded inventory and files
enter the stage receipt even when the test fails, times out or is cancelled. Required-file absence
refuses a zero exit. Partial/incomplete inventories stay explicit, and oversized files remain in the
owned output directory without receiving artifact credit. File presence/integrity is not semantic
report validation, and polling is not a hard disk quota or hostile-code filesystem sandbox. Existing
unowned output locations and larger campaign adapters remain separate obligations.

Seven new controls include 80 generated binary trees, missing/changed files, link and size/depth/
entry limits, checkout removal, exact reuse and changed-bound identity, added-file prerequisite
refusal, failed exit, cancellation and timeout. Two isolated faults fail their intended assertions:
omitting required-report checks and omitting tree-membership checks before reuse. All seven cases
complete for each mutant, and exact patches/source bytes, diagnostics and inner receipts are retained.
An initial mutant setup omitted a transitive helper and failed at module import; that is preserved
as a setup failure, not fault detection. The first planning run refused an outdated inventory and
the new file's absent deadline expectation; the reviewed refresh/expectation correction then passes.

One fresh owned epoch passes **68 cases in six executions**: three whole planning suites (27 cases),
the unchanged 33-case runner suite, all seven report-retention controls, and the existing one-case
crypto preparation contract probe under a separate report-writing variant. A seventh request reuses
that probe's exact receipt key and rechecks its report tree. Every group drains. The real
contract-probes.json survives removal of the disposable checkout, with six message/signature probes,
recovery payload lengths and verification outcomes intact. The runner suite takes 101.478s against
its unchanged 120s stage bound; older orphan/headroom observations stay open. No ordinary preparation
command gains an environment change or borrowed variant credit. Scoped lint/format and planning
checks pass; runtime, package/dependency, vector, census and F-17 debt bytes are unchanged.

Counts become **628 obligations, 291 required files, 272 general files/2,198 case dispositions**
(11 not applicable): one new seven-case test file plus one independently registered report variant,
and one new infrastructure assertion. Unresolved rows are identical: **zero test-file /94 command /
62 campaign**. This infrastructure phase does not close another wrapper or establish immutable
qualification. The new work is uncommitted. Next: integrate the Account core wrapper with its exact
selected cases/process contract, owned reports and semantic postconditions, then continue bounded
wrapper families. F-17's failed budgets and explicit RC disposition remain unchanged.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-file-output/README.md).


## 2026-09-15 — Account core wrapper integration

Owned report-file retention is signed and signature-verified as `9e4a1d9e`. Integrate the actual
Account core campaign, preserving its five-file order, default Node file concurrency, 120-second
bound and five-second termination grace. Owned execution adds a terminal case reporter, borrows the
owner's disposable Chromium and retains its output directory after checkout removal. Standalone
execution keeps its existing output location and spec/JUnit reporters; owned execution retains those
reporters too. The owner drains the campaign, Node children, crash workers and browser. Exact package
argv/environment aliases the campaign; changed arguments or environment cannot borrow its receipt.

The contract requires all ten report files with a 4 MiB /32-entry /one-level bound. Beyond custody,
reconcile the exact 30-case terminal census, successful wrapper summary/code/no timeout or launch
error, source hashes against the owned input snapshot, and all three baseline/mutant distinctions:
replay result identity, wrong-purpose refusal and substituted-key refusal. Source-pin checking uses
the wrapper's declared report scope; the runner separately binds complete source/dependency/tool
inputs. The owned Node census is authoritative for case outcomes. JUnit and run.log are retained
auxiliary evidence, not independently parsed or credited as separate test oracles. Existing optional
counterexamples and ledger diagnostics stay within the retained report tree and its explicit bounds.

The final disposable epoch passes **60 cases in four executions**: 30 planning cases across three
whole suites, then all 30 Account core cases. The campaign takes **8.103s /120s**; all groups drain.
A fifth request reuses the exact campaign receipt and revalidates its ten report files. The files
survive deletion of the copied checkout. Three new infrastructure assertions cover command identity,
required ownership/report contracts and generated/directed report corruptions. The 160 generated
summary corruptions, eleven directed corruptions and ten missing-file checks all refuse.

Four synthetic process controls verify valid evidence, zero-exit failed summary, zero-exit
non-discriminating replay and incomplete terminal reporting. A fifth synthetic execution deliberately
omits the semantic reconciliation call and admits the failed summary; the baseline rejects it.
A second isolated fault omits replay discrimination and admits the otherwise invalid paired report.
Both faults discriminate. Synthetic case claims are instrumentation controls, not Account executions.
The first native attempt, inside the execution sandbox, passed 30 planning cases but Chromium exited
with SIGABRT before any campaign body. The outside-sandbox retry passes with the same input identity.
Retain the first failure and browser receipt without credit; do not infer a runtime repair.

Inventory/manifest checks, scoped lint/format, and whitespace checks pass. Counts remain **628
obligations, 291 required files, 272 general files/2,198 dispositions (11 not applicable)**; the three
new cases belong to the existing infrastructure file. Unresolved wrappers decrease from 156 to
**154: zero test-file /93 command /61 campaign**. Runtime, dependencies, package commands, vector/
census inputs, F-17 debt, prior archives and the L-2 checkpoint are unchanged. No personal browser,
server, relay, device or deployment operation occurs. This phase is uncommitted; next is the Account
recovery wrapper with its own grouped selection and report postconditions. Immutable aggregate and
private Account/human recovery-adoption qualification remain ahead.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-core/README.md).


## 2026-09-15 — Account recovery wrapper integration

Account core wrapper integration is signed and signature-verified as `d41a0a56`. Integrate the actual
recovery campaign, preserving its six-file order, default Node file concurrency, 120-second bound,
five-second grace and spec/JUnit reporters. Owned execution adds a terminal case reporter and a
retained output directory. The native recovery case already uses persistent browsers in its inherited
worker group; certify that fixture directly, with pinned Chromium and its existing 15-second startup
bound, without launching an additional unused CDP browser. Its lifecycle records join the owned report
tree when ACCOUNT_REPORT_DIR is supplied; the prior case-report-adjacent fallback remains for other
native invocations. Exact argv/empty-environment commands alias the campaign; variants refuse.

Require ten files under 4 MiB /32-entry /one-level bounds. Reconcile all 25 terminal case outcomes,
summary success/code/no timeout or launch error, source hashes, both recovery/passkey baseline-mutant
pairs, substituted-root evidence and three clean browser lifetimes. Profile records must use three
distinct PIDs, one native worker, one exact owned profile, pinned browser executable and an ordered
predecessor/reopen chain; each browser must close successfully. These are cooperative fixture
observations plus the owner's independent group-drain check, not OS attestation. The native test's
virtual passkey restoration remains explicitly simulated. The owned Node census is the case authority;
JUnit/logs are auxiliary, not independently parsed or credited. Whole-profile residue testing remains
outside this wrapper phase.

The final owned epoch passes **93 cases in six executions**: 38 planning cases in four whole suites,
25 recovery campaign cases and the 30-case Account core regression. Recovery takes **11.900s /120s**,
including 160 generated durable-ledger histories, independent crypto, factor/root controls, SIGKILL
service restarts, IndexedDB aborts, renderer death and three persistent-browser incarnations. Every
process group drains. A seventh request reuses the exact recovery receipt and revalidates its report
tree. All ten recovery reports, including the three lifecycle records, survive copied-checkout deletion.

Four new infrastructure assertions cover invocation/ownership contracts, 16 directed report
corruptions, ten missing files and 100 generated profile histories with 14 broken-chain variants each.
Four synthetic process controls distinguish valid evidence from zero-exit failed summary, missing
passkey refusal and broken profile predecessor. A fifth synthetic run omits semantic reconciliation
and admits the invalid summary that the baseline rejects. A second isolated fault removes the reopen
predecessor check and admits the broken chain. Both faults discriminate. Synthetic case/lifecycle
claims are instrumentation controls, not Account cases or actual browser restarts.

A pre-change Account-fixture planning run exposes an outdated assertion that all Account wrappers
remain blocked, including already integrated core/preparation. Preserve that failure. Replace those
stale assertions with positive checks for their exact resolved adapters, add recovery's disposition,
and retain the unintegrated wrapper checks. All four planning cases subsequently pass. No product
repair is inferred. Inventory/manifest, scoped lint/format and whitespace checks pass.

Counts stay **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not
applicable)**. Four new cases belong to an existing infrastructure file. Unresolved wrappers decrease
from 154 to **152: zero test-file /92 command /60 campaign**. Runtime, package/dependency, crypto-census/
vector and F-17 debt bytes, old archives and the L-2 checkpoint are unchanged. No personal browser,
server, relay, device or deployment operation occurs. This phase is uncommitted. Next: Account
authority wrapper integration with its own selected tests and report postconditions, followed by
remaining wrappers/qualification repairs, immutable aggregate and private Account/human rehearsal.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-recovery/README.md).


## 2026-09-15 — Account authority wrapper integration

Recovery wrapper integration is signed and signature-verified as `4e8a8f3a`. Integrate the actual
Account authority wrapper with its five-file order, default Node concurrency, 120-second bound and
five-second grace unchanged. Owned execution adds the terminal reporter, disposable CDP browser and
retained report directory; spec/JUnit output and standalone behavior remain. Exact argv with an
empty user environment aliases the campaign. Weaker result/report/browser contracts and changed
arguments or environment refuse. Other wrappers retain their unresolved dispositions.

Require six reports under 4 MiB /32-entry /one-level bounds: sources, summary, JUnit, log and both
pin/nonce controls. Besides exact 14-case terminal completion and successful summary/code/no timeout,
verify the wrapper's source hashes against owned inputs, including src/crdt and the generated sealer.
Both controls must record baseline refusal and mutant acceptance of the supplied proof pin. The pin
control must substitute an actual authority root while retaining the requested nonce and policy; the
nonce control must replay a different challenge while retaining the expected pin. Independently
verify both archived Ed25519 signatures using Node crypto and explicit length-prefixed message bytes.
A valid response signature establishes neither trust in its self-declared root nor challenge freshness.
The owned Node census remains the case authority; JUnit/logs are auxiliary evidence, not independent
oracles. Optional counterexample reports stay in the bounded retained tree.

The final owned epoch passes **81 cases in six executions**: 42 planning cases in four complete
suites, all 14 authority cases and the 25-case recovery wrapper regression. Authority takes
**30.635s /120s**; recovery takes 11.021s /120s. This includes the unchanged 160 generated authority
service histories and 40 generated native Local preflight histories, encrypted-root/cold-restart,
SIGKILL and competing initialization controls, Local database+journal preflight and cancellation
exclusion. Every process/browser group drains. A seventh request reuses the exact authority receipt
and rechecks the six reports after the recovery regression. Reports survive copied-checkout deletion.

Four new infrastructure cases cover exact invocation/ownership, eleven directed report corruptions,
six missing files and 100 generated signed control pairs with ten invalid variants each. Five
synthetic process controls distinguish valid reports from zero-exit failed summary, unsubstituted
root, unreplayed challenge and invalid signature. A sixth synthetic execution deliberately omits
semantic reconciliation and admits the bad summary that the baseline refuses. A second isolated
fault removes signature verification and admits the damaged proof. Both faults discriminate. Synthetic
case claims are instrumentation controls, not Account executions. Scoped lint/format, inventory/
manifest and whitespace checks pass; no new validation failure occurs. Prior failures remain archived.
The existing wrapper-blocked assertions advance to explicit positive authority-contract checks.

Counts remain **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not
applicable)**. The four new cases belong to an existing infrastructure file. Unresolved wrappers
fall from 152 to **150: zero test-file /91 command /59 campaign**. Runtime, package/dependency,
crypto-census/vector and F-17 debt bytes, prior archives and L-2's checkpoint are unchanged. No personal
browser, server, relay, device or deployment operation occurs. This phase is uncommitted. Next:
Account promotion wrapper integration with its own selected tests and report postconditions, then
remaining wrappers/qualification repairs, immutable aggregate and private Account/human rehearsal.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-authority/README.md).


## 2026-09-15 — Account promotion wrapper integration

Authority wrapper integration is signed and signature-verified as `e18a77df`. Integrate the actual
promotion wrapper's core/native selection, order, default Node concurrency, 120-second bound and
five-second grace. Owned execution adds the terminal reporter, disposable CDP browser and retained
report directory; spec/JUnit output and standalone invocation remain. Exact argv with empty user
environment aliases the campaign. Weaker result/report/browser contracts and altered invocation
refuse; other wrappers retain their dispositions.

Require six reports within 4 MiB /32 entries /one-level bounds: sources, summary, JUnit, log,
current-state control and MAC control. Reconcile all 18 terminal cases, successful summary/code/no
timeout and exact wrapper source hashes against complete owned inputs, including cross-family
fixtures. The service control retains baseline/mutant success flags and observed eligible status.
The MAC control now retains original, substituted and accepted intent IDs: a changed intent must
actually be accepted by the mutant while the baseline refuses. Report checks corroborate the real
assertions; they do not independently replay service state or browser authentication. The owned
Node census is the case authority, with JUnit/log as auxiliary evidence. Failure diagnostics remain
in the bounded tree. Production runtime and protocol checks are unchanged.

The owned epoch passes **78 cases in six executions**: 46 planning cases in four complete suites,
18 promotion cases and 14 authority regression cases. Promotion takes **56.497s /120s**;
authority takes 33.131s /120s. Promotion includes the existing 120 generated service and
45 generated native histories, before/after commit SIGKILL or renderer crashes, exact preparation
resume, journal/content/identity preservation, abandonment retries, custody counter bounds,
competing preparers and cancellation exclusion. Every process/browser group drains. A seventh
request reuses the exact promotion receipt after the authority regression; all six reports remain
after copied-checkout removal.

Four new infrastructure cases cover exact invocation/ownership, eleven directed report corruptions,
six missing files and 100 generated control pairs with eight invalid variants each. Five synthetic
process controls distinguish valid reports from zero-exit failed summary, ineligible mutant result,
unchanged intent and acceptance of the wrong intent. A sixth execution omits semantic reconciliation
and accepts the invalid summary; an isolated adapter fault omits the actual-substitution check and
accepts an unchanged intent. Both faults discriminate. Synthetic case claims are instrumentation,
not Account executions. Planning, scoped lint/format, inventory/manifest and whitespace checks pass.
No new campaign or test failure occurs; earlier failures remain preserved. The previous blocked
promotion assertion advances to a positive exact-contract check.

Counts remain **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not
applicable)**. Four additional cases belong to an existing infrastructure file. Unresolved wrappers
fall from 150 to **148: zero test-file /90 command /58 campaign**. Runtime, package/dependency,
crypto-census/vector and F-17 debt bytes, prior archives and L-2's checkpoint remain unchanged. No
personal browser, server, relay, device or deployment operation occurs. This phase is uncommitted.
Next: Account genesis wrapper integration, then remaining wrappers/qualification repairs, immutable
aggregate and private Account/human rehearsal.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-promotion/README.md).


## 2026-09-15 — Account genesis wrapper integration

Promotion wrapper integration is signed and signature-verified as `b31be6c0`. Integrate the actual
genesis crypto/native grouping, order, default Node concurrency, 180-second bound and five-second
grace. Owned execution adds the terminal reporter, disposable CDP browser and retained reports;
standalone invocation and spec/JUnit output remain. Exact argv with empty user environment aliases
the campaign. Preserve the historical reader at `a4e1c15:src/crdt/promotionRecord.ts`: the contract
binds reference, full revision and byte hash, and the existing owner checks it before/after execution
and receipt reuse. Missing, substituted or changed history metadata refuses. This is the first
Account wrapper using the existing historical-input mechanism; generic case adapters retain their
previous requirements.

Require seven reports under 4 MiB /32-entry /one-level limits: source hashes, summary, JUnit, log,
snapshot control, wrap control and generated histories. Reconcile all 17 terminal outcomes,
successful summary/code/no timeout and exact wrapper source hashes, including the published vector,
src/lib and cross-family fixtures. Both semantic controls now retain original and accepted candidates.
Snapshot requires a changed checkpoint and different expected/decoded state hashes; wrap requires
changed recovery ciphertext and the recorded independent-oracle refusal. Require baseline refusal,
a changed signature and unchanged unrelated candidate fields. These checks corroborate actual native
assertions; they do not independently verify signatures, decrypt candidates or recover omitted state.
No recovery factors are exported. Require seed 9222026, 40 passing history records and the declared
operation bounds, without claiming independent regeneration of the seeded schedule or semantic replay.
The owned Node census remains the case authority; JUnit/logs are auxiliary. Optional diagnostics remain
in the bounded output tree. Production runtime/protocol and the existing oracle are unchanged.

The owned epoch passes **86 cases in six executions**: 51 planning cases across four complete suites,
17 genesis cases and 18 promotion regression cases. Genesis takes **80.249s /180s**; promotion
regression takes 51.509s /120s. Genesis includes 100 generated HPKE seals through the
independent Node/OpenSSL oracle and 40 generated native delivery/interruption histories, journal-inclusive
state and attribution, before/after IDB/renderer boundaries, five signed forgery kinds, retained
artifacts, cancellation exclusion and the historical reader. Every process/browser group drains.
A seventh request reuses the exact genesis receipt after promotion regression. Seven reports survive
copied-checkout removal, and the historical blob is included in the lossless evidence archive.

Five new infrastructure cases cover grouped selection/historical pins, weaker contracts, eleven
directed report corruptions, seven missing reports, 100 generated semantic-control pairs with twelve
invalid variants each and 160 generated history omissions/corruptions. Five synthetic process runs
accept valid reports and refuse zero-exit failed summary, indistinguishable snapshot state, unchanged
wrap ciphertext and missing history. A sixth run omits the semantic hook and admits the bad summary.
An isolated adapter fault omits the snapshot-state difference check and admits equal hashes. Both
faults discriminate. Synthetic case claims are instrumentation controls, not Account tests. Planning,
scoped lint/format, inventory/manifest and whitespace checks pass. No new campaign/test failure occurs;
prior failures remain preserved. Genesis's blocked assertion advances to a positive exact contract.

Counts remain **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not
applicable)**. Five additional cases belong to an existing infrastructure file. Unresolved wrappers
fall from 148 to **146: zero test-file /89 command /57 campaign**. Runtime, package/dependency,
crypto-census/vector and F-17 debt bytes, previous archives and L-2's checkpoint are unchanged.
No personal browser, server, relay, device or deployment operation occurs. This phase is uncommitted.
Next: Account admission wrapper integration, remaining wrapper/qualification repairs, immutable
aggregate and private Account/human rehearsal.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-genesis/README.md).


## 2026-09-15 — Account admission wrapper integration

Genesis wrapper integration is signed and signature-verified as `d38a0ab0`. Integrate the actual
core/restart/controls/native grouping, preserving order, default Node concurrency, 180-second bound
and five-second grace. Owned execution adds terminal reporting, a disposable CDP browser and retained
reports; standalone invocation and spec/JUnit output remain. Exact argv and empty user environment
alias the campaign. Bind `280f616:src/crdt/promotionRecord.ts` through the existing historical-input
checks before/after execution and reuse. Unknown or weakened invocation, history, result, output and
browser contracts refuse.

Require nine reports within 4 MiB /32-entry /one-level limits: sources, summary, JUnit, log, origin/
certification/receipt controls and generated service/native histories. Reconcile all 34 terminal
outcomes, successful summary/code/no timeout and exact wrapper source hashes against owned inputs.
Enriched approval reports retain actual baseline result, active account state, original/corrupted
signature and expected account/request digest. Require receipt/activation target agreement and the
intended zero signature. The receipt control retains its before/after marker stages and actual stored
receipt; require offered baseline refusal, receipted mutant state and exact retention of the invalid
receipt. These report checks corroborate actual service/native assertions; they do not independently
verify signatures or passkey assertions. The existing Node/OpenSSL and plaintext-replay oracles are
unchanged. No secret factors are added to reports.

Require all 80 service histories with seed 9232026; replay their recorded commands to compare the
reported pending/offered/active/cancelled final state. Require 30 passing native histories with seed
9242026 and the declared operation/fault/retry bounds. This does not independently regenerate the
seeded schedule or re-execute browser/database semantics. The owned terminal census remains the case
authority; JUnit/logs are auxiliary. Optional failure diagnostics stay in the bounded tree.

The owned epoch passes **107 cases in six executions**: 56 planning cases across four complete suites,
34 admission cases and 17 genesis regression cases. Admission takes **121.704s /180s**;
genesis regression takes 83.453s /180s. Admission includes the existing 80 service and 30
native histories, SQLite SIGKILL boundaries and competing processes, lost replies, IDB/renderer
interruptions, retained Local state, independent receipt/coverage checks and the historical reader.
Every process/browser group drains. A seventh request reuses the exact admission receipt after the
genesis regression; all nine reports survive copied-checkout removal. Historical reader bytes are
included in the lossless archive.

Five new infrastructure cases cover exact invocation/history contracts, eleven directed report
corruptions, nine missing files, 100 generated control sets with twelve invalid variants each and
160 generated service histories compared with an independent event-order formula plus ten corrupted
report variants each. Five synthetic process runs accept valid reports and refuse zero-exit failed
summary, inactive approval result, unretained receipt and inconsistent service ledger. A sixth run
omits reconciliation and admits the invalid summary; an isolated adapter fault omits the ledger
comparison and admits the wrong final state. Both faults discriminate. Synthetic case claims are
instrumentation controls, not Account tests. Planning, scoped lint/format, inventory/manifest and
whitespace checks pass. No new campaign/test failure occurs; prior failures remain preserved.

Counts stay **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not
applicable)**. Five added cases belong to an existing infrastructure file. Unresolved wrappers fall
from 146 to **144: zero test-file /88 command /56 campaign**. Runtime, package/dependency, crypto-census/
vector and F-17 debt bytes, previous archives and L-2's checkpoint are unchanged. No personal browser,
server, relay, device or deployment operation occurs. This phase is uncommitted. Next: Account handoff
wrapper integration, remaining wrapper/qualification repairs, immutable aggregate and private
Account/human rehearsal.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-admission/README.md).


## 2026-09-15 — Account handoff wrapper integration

Admission is signed and signature-verified as `b9d4efa2`. Handoff preserves the actual core/es256/native
grouping, default Node concurrency, 180-second bound and five-second grace. Owned execution adds terminal
reporting, the disposable CDP browser and retained output. Exact argv and empty user environment alias the
campaign. Pin `beed8cf:src/crdt/promotionRecord.ts` before/after execution and reuse. The inactive
`HANDOFF_SLOT_BASELINE` variant is not selected or inherited by the owner. Standalone invocation and
spec/JUnit output remain available; weaker invocation, result, history, output and browser contracts refuse.

Require nine reports within 4 MiB /32-entry /one-level bounds: sources, summary, JUnit, log, credential/
passkey controls and generated DER/service/native evidence. Reconcile all 21 terminal outcomes, successful
summary/code/no timeout and exact wrapper source hashes against owned inputs. Credential evidence now
includes the actual refused baseline, original binding, substituted key, accepted binding and public
service root. Independently verify both binding signatures using locally constructed row-12 bytes and
Node/OpenSSL, require a changed key, and require the otherwise identical binding target. Passkey evidence
records the actual injected zero signature, unchanged baseline storage, expected target and actual selected/
classified routes. Require exact route agreement. No secret factors are added to reports.

Independently verify all 200 retained P-256 DER signatures with Node/OpenSSL, seed 9262026. This corroborates
signature evidence; the original grouped test remains authority for runtime DER-to-P1363 conversion and
malformed-DER refusal. Require 60 passing service histories at seed 9252026 and final activation consistent
with the recorded commands; require 24 passing native histories at seed 9272026 and their declared
operation/fault/retry bounds. These checks do not regenerate the seed schedule or replay browser/database
semantics. The owned terminal census remains case authority; JUnit/logs are auxiliary.

The owned epoch passes **116 cases in six executions**: 61 planning cases in four full suites, 21 handoff
and 34 admission regression cases. Handoff takes **137.063s /180s**; admission takes
128.411s /180s. Handoff includes generated DER/service/native histories, actual browser
ES256 assertion, offline startup, IDB abort/renderer interruption, source-inventory and content-replay
assertions, historical-reader refusal and cancellation drain. Every process/browser group drains. A seventh
request reuses the exact handoff receipt after admission; all nine reports survive copied-checkout removal.
Both historical reader blobs are retained in the lossless archive.

Five new infrastructure cases cover exact invocation/history, weaker contracts, twelve directed report
corruptions, nine missing files, 80 generated control sets with twelve corruptions each (seed 150941),
80 generated DER reports with five corruptions each (seed 150942), and 160 service command histories with
ten corruptions each (seed 150943). Six synthetic process runs accept valid reports, reject zero-exit
failed summary, unchanged credential key, mismatched route and invalid DER, and show an omitted report hook
admits a failed summary. A second isolated adapter fault omits DER verification and admits an invalid
signature. Both deliberate faults discriminate. Synthetic case claims are instrumentation controls, not
Account executions. Preliminary planning failures from a duplicate import and stale blocked-wrapper
assertion are preserved with the passing retry; no owned campaign failure occurred. The existing Node
reporter listener-limit and experimental API diagnostics remain visible and are not claimed fixed.

Counts stay **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not applicable)**.
Five added cases belong to an existing infrastructure file. Unresolved wrappers fall from 144 to
**142: zero test-file /87 command /55 campaign**. Runtime, package/dependency, crypto-census/vector and
F-17 debt bytes, earlier archives and L-2 checkpoint are unchanged. No personal browser, server, relay,
device or deployment operation occurs. This phase is uncommitted. Next: Account editing wrapper integration,
remaining wrapper/qualification repairs, immutable aggregate and private Account/human rehearsal.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-handoff/README.md).


## 2026-09-15 — Account editing wrapper integration

Handoff is signed and signature-verified as `9b7f02ea`. Editing preserves the wrapper's complete native
invocation, 300-second bound and five-second grace. Owned execution adds terminal reporting, the disposable
CDP browser and retained output. Exact argv and empty user environment alias the campaign. Pin
`649925f:src/crdt/promotionRecord.ts` before/after execution and reuse. Standalone invocation and spec/JUnit
output remain available; weaker invocation, result, history, output and browser contracts refuse.

Require eight reports within 4 MiB /32-entry /one-level bounds: sources, summary, JUnit, log, ancestry/
passkey controls and generated ancestry/native evidence. Reconcile all 16 terminal outcomes, successful
summary/code/no timeout and exact wrapper source hashes against owned inputs. Ancestry control evidence
now records the original writing and actual unchanged refusal baseline before the mutant opens an empty
replacement. Passkey evidence records unchanged refusal baseline, actual injected zero signature, opening
text and unauthorized edit. Require an originally nonempty workspace, the expected empty ancestry mutant,
and the actual unauthorized prefix applied to the passkey mutant's original text. No secret factors are
added to reports; all writing remains synthetic fixture data.

Require 200 ancestry histories at seed 9282026, now retaining observed text, accepted descendant, refused
missing genesis and before/after source hashes. Recompute text using the recorded splice and require source
hash equality. Require 24 native histories at seed 9292026, their operation/mode/undo bounds, every recorded
reopened observation and final state. A separate string fold checks each edit/undo result; tests use a
mutable UTF-16 array-splice oracle. This is report reconciliation, not independent reconstruction of Yjs
ancestry, regeneration of the seeded schedule or browser/database replay. Original native assertions and
source inventories remain; the terminal census is case authority and JUnit/logs are auxiliary.

The owned epoch passes **103 cases in six executions**: 66 planning cases in four full suites, 16 editing
and 21 handoff regression cases. Editing takes **207.660s /300s**; handoff takes
142.745s /180s. Editing includes activation commit interruption, journal-only recovery,
compaction, exclusive lifetime and cancellation/native drain, stale-handle invalidation, pending
dependencies, generation and routing refusals, 200 ancestry comparisons, 24 editing histories and historical
reader refusal. Every process/browser group drains. A seventh request reuses the exact editing receipt after
handoff; all eight reports survive copied-checkout removal. Both historical reader blobs are archived.

Five new infrastructure cases cover exact invocation/history, weaker contracts, twelve directed report
corruptions, eight missing files, 100 generated control sets with eleven corruptions each (seed 150944),
100 ancestry histories with eight corruptions each (seed 150945), and 160 native command sequences with
eleven corruptions each (seed 150946). Six synthetic process runs accept valid reports and reject zero-exit
failed summary, empty original ancestry, missing unauthorized edit and incorrect intermediate observation;
an omitted report hook admits a failed summary. A separate adapter fault omits the intermediate-observation
check and admits the wrong observation with an otherwise correct final state. Both faults discriminate.
Synthetic case claims are instrumentation controls, not Account executions. Planning and owned campaigns
pass without a new failure. Existing reporter listener-limit and experimental API diagnostics are retained;
this phase does not claim to repair them.

Counts stay **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not applicable)**.
Five added cases belong to an existing infrastructure file. Unresolved wrappers fall from 142 to
**140: zero test-file /86 command /54 campaign**. Runtime, package/dependency, crypto-census/vector and
F-17 debt bytes, earlier archives and L-2 checkpoint are unchanged. No personal browser, server, relay,
device or deployment operation occurs. This phase is uncommitted. Next: Account outbound wrapper integration,
remaining wrapper/qualification repairs, immutable aggregate and private Account/human rehearsal.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-editing/README.md).


## 2026-09-15 — Account outbound wrapper integration

Editing is signed and signature-verified as `61e53cdb`. Outbound preserves its five ordered children:
legacy/current vector checks (15 seconds each), preparation Node tests (30 seconds), envelope Vitest
(30 seconds, original maxWorkers=2), and native tests (60 seconds). Owned execution adds a 150-second
aggregate bound, five-second grace, disposable CDP browser, a completion trace and distinct nonce-bound
Node/Vitest case reports. Original argv, order, child deadlines, spec/verbose/JUnit output and standalone
invocation remain. Exact command aliases the campaign. Two vector commands remain exit-only checks;
the three terminal test reports supply the actual 29-case census. No historical-reader input is invoked
by outbound; the editing regression retains its reviewed historical reader pin.

The new shared campaign-reporting helper records start/completion around each child and refuses overlap,
repetition and work after completion. After all producers drain, reconcile exact trace order, argv, bounds,
exit status, completion and every child's complete case report. A zero wrapper exit cannot substitute for
missing, failed, stale, reordered or incomplete child results. This is cooperative instrumentation, not
hostile-code isolation. Require 18 files (19 inventory entries including their subdirectory) within
4 MiB /40-entry /two-level limits. Require successful summary and exact wrapper source hashes, the model
budget/key-domain counterexamples, three model faults, three actual codec mutations, 1,000 preparation
histories (seed 9312026), 100 codec histories (seed 9302026), and journal-only crash recovery after an
outgoing observer throws. Codec controls now retain original/accepted envelopes and expected routes;
require the intended signature, ciphertext or route difference. Recovery evidence records actual accepted
and reopened text and observer count. No production runtime or crypto construction changes.

Model counterexamples remain preparation evidence, not newly discovered defects in the current writer.
The key-budget example is arithmetic plus key derivation, not billions of actual encryptions. Report
reconciliation checks recorded mutations, bounds and completeness; it does not independently replay the
model/Yjs or regenerate schedules. Existing native/codec assertions remain the execution authority.

The owned epoch passes **116 cases in six executions**: 71 planning cases in four full suites, 29 outbound
and 16 editing regression cases. Outbound takes **12.483s /150s**; editing takes
207.146s /300s. Every group drains. A seventh request reuses the exact outbound receipt after
editing; all 18 files survive checkout removal. Five new infrastructure cases cover instrumentation,
contract identity, missing reports, semantic controls and two 160-history corruption campaigns (seeds
150947/150948). Eight synthetic process runs accept valid evidence and reject zero-exit failed summary,
wrong step order, missing Node case, ineffective codec fault and missing Vitest report. Deliberately
omitting the semantic hook or child census admits the corresponding invalid evidence: both controls
discriminate. Synthetic claims are not additional Account test executions.

Two planning failures exposed the 850 kB manifest limit, first in its writer then its independent test.
The complete contract snapshot measures 857,891 bytes; retain the same lossless row representation and
raise only the prospective planning ceiling to 1,000,000 bytes. Runtime report/log/file limits do not change.
Both failed logs are retained. The final owned planning suites and native campaigns pass. Existing reporter
and experimental API diagnostics remain recorded without a repair claim.

Counts remain **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not applicable)**.
Unresolved integration falls from 140 to **138: zero test-file /85 command /53 campaign**. Runtime,
package/dependency, crypto census/vectors, F-17 debt, prior archives and L-2 checkpoint are unchanged.
No personal browser, server, relay, device or deployment operation occurs. Next: Account capture wrapper
integration, remaining wrappers/qualification repairs, immutable aggregate and private Account/human rehearsal.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-outbound/README.md).


## 2026-09-15 — Account capture wrapper and first-observation oracles

Outbound is signed and verified as `49cbb1e2`. Capture preserves the exact ordered Vitest source-capsule
properties (30 seconds, maxWorkers=2) and native capture invocation (180 seconds, original spec/JUnit).
Owned execution adds the shared completion trace and separate nonce-bound child reports, a 210-second
aggregate bound with five-second grace, and disposable CDP browser. Pin
`18ceb40:src/crdt/promotionRecord.ts` before/after execution and reuse. Exact command aliases the campaign;
weaker arguments, environment, history, output, case or browser contracts refuse. Standalone remains available.

Repair both recorded capture oracle weaknesses. Generated native histories now retain a cloned first
observation of every capsule and compare it before adding new ones. Reopen/flush/compaction/crash must
preserve every prior record and all original metadata/actor/bytes, with no duplicate, lost or substituted
capsules. Reopen/crash may add the v6 empty human initialization capsule only with the same route and
exact [0,0] source bytes; such additions become first observations for later comparisons. Reports retain initial capsules, each admitted/recovered set and actual reopened text for all
16 histories (seed 9322026). Independent report reconciliation keeps its own first observations and folds
the recorded Unicode edit commands. It does not independently replay Yjs or regenerate the random schedule.
The overhead case compares complete nested byte arrays, replacing a prefix-only `every` predicate that
accepted truncated or empty updates. Its actual oversize refusal and original/saved bytes are retained.

Retention controls now record a working baseline's added capsule, observed text and the mutant's lost
capsules. Route controls record the actual wrong and expected workspace and baseline refusal/mutant
acceptance. Require those concrete differences, not label strings. Require ten files (eleven inventory
entries) within 4 MiB /40-entry /two-level limits: summary, exact source pins, JUnit, logs, both child case
reports, controls, generated histories and overhead bytes. Existing native assertions remain authority;
report validation is corroboration, not independent storage/crypto replay.

The owned epoch passes **128 cases in six executions**: 76 planning cases in four full suites, 23 capture
(8 Vitest /15 native), and 29 outbound regression cases. Capture takes **167.775s /210s**; outbound
regression takes 11.455s /150s. Every group drains. A seventh request reuses capture's exact receipt
after the regression; all ten reports survive disposable checkout removal. Five new infrastructure cases
cover exact contracts, independent child domains, output omissions, 160 generated report corruptions
(seed 150949) and 160 generated first-observation comparisons (150950). The old overwrite and byte-prefix
predicates demonstrably admit the same changes the repaired oracles reject.

Eight synthetic process runs accept valid reports and reject zero-exit failed summary, changed first
observation, missing native case, ineffective retention fault and truncated bytes. Deliberately omitting
the semantic hook or native census causes corresponding invalid reports to pass; both faults discriminate.
These synthetic case claims are not additional Account executions. All local planning tests initially
pass, but the new report corruption case spends 45.8 seconds constructing full-array error diagnostics.
Checking length before byte contents retains all assertions and 160 generated cases while reducing that
case to 1.1 seconds. Preserve both timing logs; the complete owned suites pass under their unchanged bounds.
An initial stage-construction probe exposed the missing explicit capture historical-kind allowlist entry;
adding the reviewed kind retains the exact historical pin checks. The first owned native run fails on an
extra capsule after reopen: the newly added exact-count rule was too strict for v6 initialization, whose
source intentionally records an empty human [0,0] source. Preserve that failed epoch and source; permit
only route-matching empty initialization records on reopen/crash, retaining all prior expectations.
Generated controls reject a nonempty initializer, changed route or initializer at a flush boundary. The
final native run verifies this explicit allowance. Failed-case evidence initially contains the history
and count mismatch; the repaired reporter now saves each observed transition before checking it.

Counts remain **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not applicable)**.
Unresolved integration falls from 138 to **136: zero test-file /84 command /52 campaign**. The capture
comparison-map/byte-length follow-ups are closed for these exercised fixtures. Host-Python binding,
historical owner/orphan observations, delivery-oracle headroom, R-04/P-06 and immutable qualification remain.
Runtime/dependencies, crypto census/vectors, F-17 debt, prior archives and L-2 remain unchanged. No personal
browser/server/relay/device/deployment operation occurs. Next: Account spool wrapper, remaining qualification
repairs, immutable aggregate and private Account/human rehearsal.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-capture/README.md).


## 2026-09-15 — Account spool wrapper integration

Capture is signed and verified as `652fd13f`. Spool preserves both exact child invocations: spool-record
Vitest properties with maxWorkers=2 /30 seconds and the native campaign with original spec/JUnit /240
seconds. Owned execution adds the shared ordered completion trace, distinct nonce-bound child reports,
270-second aggregate bound with five-second grace and disposable CDP browser. Pin
`7210b7d:src/crdt/promotionRecord.ts` before/after execution and reuse. Exact command aliases the campaign;
weaker invocation, output, browser, historical and result contracts refuse. Standalone remains available.

Require eleven files (twelve inventory entries) within 4 MiB /40-entry /two-level limits. Reconcile all
30 outcomes, successful ordered stages/summary, exact wrapper source pins, early-return and grant-reuse
controls, missing-final-row baseline/mutant and eight generated histories (seed 9502026). Early-return
reports now include the actual returned envelope and observed absence before/after renderer death.
Grant reuse records actual observed invocation/attempt counts. The missing-tail baseline retains its
exposed bytes, actual incomplete-ledger refusal and unchanged invocation count. The existing witness
mutation must remint different bytes at the same position. Leftover missing-tail counterexamples refuse
passing-wrapper credit.

Generated reports now retain each command, before/after recovery ledger, external invocation counts,
persisted envelopes, reopened text and final source reference counts. The adapter checks monotone
observed invocation/grant counts, complete distinct grant events, contiguous immutable source positions,
exact persisted-wire continuity and final complete id/index coverage of captured sources. A separate
text fold checks every observed edit. Bounded generated-report sizes (128 grants, 64 positions/capsules,
32 sources per capsule) prevent small malformed numeric fields causing unbounded allocation; these are
fixture-evidence bounds, not new product limits. Native/codec assertions remain authority; reconciliation
does not independently decrypt or replay storage/Yjs, regenerate schedules or prove grant counts outside
the fixture's WebCrypto observation hook.

The owned epoch passes **134 cases in six executions**: 81 planning cases in four full suites, 30 spool
(6 Vitest /24 native), and 23 capture regression cases. Spool takes **228.836s /270s**; capture
regression takes 169.698s /210s. All groups drain. A seventh request reuses the exact spool receipt
after capture; eleven reports survive checkout removal. Both selected historical readers are retained.
Five new infrastructure cases cover exact contracts, separate child domains, source/output omissions,
160 generated control corruptions (seed 150951), and 160 generated history corruptions (150952).

Eight synthetic process runs accept valid reports and reject zero-exit failed summary, changed persisted
wire, missing native case, ineffective grant-reuse control and incomplete final source coverage. Omitting
the semantic hook or child census admits the corresponding invalid evidence; both deliberate faults
discriminate. Synthetic claims are not additional Account executions. Local planning and owned campaigns
pass without a new failure. Earlier capture-oracle failures and other historical observations retain
their original archives. Reporter/experimental API diagnostics remain without a repair claim.

Counts remain **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not applicable)**.
Unresolved integration falls from 136 to **134: zero test-file /83 command /51 campaign**. Runtime,
package/dependencies, crypto census/vectors, F-17 debt, previous archives and L-2 are unchanged. No personal
browser/server/relay/device/deployment work occurs. Next: Account decisions wrapper, remaining qualification
repairs, immutable aggregate and private Account/human rehearsal.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-spool/README.md).


## 2026-09-15 — Account decisions wrapper integration

Spool is signed and verified as `d107f244`. Decisions preserves its exact position-decision Vitest
invocation (maxWorkers=2 /30 seconds) and native invocation (spec/JUnit /120 seconds). Owned execution
adds the shared ordered trace, distinct nonce-bound child reports, 150-second aggregate bound with
five-second grace and disposable CDP browser. Exact command aliases the campaign; weaker contracts
refuse. Decisions invokes no historical reader; its spool regression pins and retains
`7210b7d:src/crdt/promotionRecord.ts`. Standalone invocation remains available.

Require nine files (ten inventory entries) within 4 MiB /40-entry /two-level limits: exact source pins,
summary, JUnit/logs, both child reports, control evidence and generated histories. Each of the five native
proof controls now runs the normal verifier on the same bad bytes used by its mutant. Signature/epoch
controls change `unknown` to usable `refused` evidence; the link control changes `unknown` to `accepted`.
Submission controls change an actual signature/subject rejection to acceptance. Retain responses,
expected subject/authority, original and accepted decoded submissions, actual wire, public key/route,
and baseline reason. Canonicalize the accepted submission from the bytes actually checked so unrelated
in-memory helper fields cannot masquerade as wire fields.

Reconciliation requires exact ordered controls, baseline/mutant outcomes, intended epoch/parent/position
differences, unchanged envelope/signature/lineage and agreement between recorded fields and response/
submission framing. An independent SHA-256/length-prefix calculation checks that the link control really
has the wrong predecessor. This is structural/observational corroboration, not independent signature
verification; actual native/codec checks remain the cryptographic execution authority.

The eight generated histories (seed 9622026) now retain every observed decision and storage digest,
original/after source snapshots and counters, plus cold-reopened wire and retained sources. Require the
expected accepted/refused/conflict/unknown classification for each command, unchanged storage digests,
sources/counters during inspection, exact reopened wire and retention of every original source. Additional
startup records are not credited as inspection writes. Hash equality records native observations; it is
not independent storage replay or regeneration of the random schedule.

The owned epoch passes **134 cases in six executions**: 86 planning cases in four full suites, 18 decisions
(12 Vitest /6 native), and 30 spool regression cases. Decisions takes **75.266s /150s**; spool
regression takes 230.171s /270s. All groups drain. A seventh request reuses the exact decisions
receipt after spool; all nine reports survive checkout removal. Five new infrastructure cases cover
exact contracts, separate child domains and output omissions, 160 generated proof-report corruptions
(seed 150953), and 160 generated observation/storage corruptions (150954). A correct-predecessor control
with coherently rewritten bytes specifically refuses ineffective-link credit.

Eight synthetic process runs accept valid evidence and reject zero-exit failed summary, wrong decision,
missing native case, ineffective verifier baseline and changed reopened wire. Omitting the semantic hook
or child census admits the corresponding invalid evidence; both deliberate faults discriminate. Synthetic
claims are not additional Account executions. Planning and owned campaigns pass without a new failure.
Prior capture-oracle and other historical failures remain in their original archives; reporter and
experimental API diagnostics remain without a repair claim.

Counts remain **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not applicable)**.
Unresolved integration falls from 134 to **132: zero test-file /82 command /50 campaign**. Runtime,
package/dependencies, crypto census/vectors, F-17 debt, earlier archives and L-2 remain unchanged. No
personal browser/server/relay/device/deployment work occurs. Next: Account delivery wrapper, remaining
qualification repairs, immutable aggregate and private Account/human rehearsal.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-decisions/README.md).


## 2026-09-15 — Account delivery wrapper integration

Decisions is signed and verified as `21198b4f`. Delivery preserves its exact Vitest invocation
(maxWorkers=2 /30 seconds) and native invocation (spec/JUnit /480 seconds), including all 12 property
and 19 native cases. Owned execution adds the shared ordered trace, distinct nonce-bound child reports,
510-second aggregate bound, five-second grace and disposable CDP browser. The exact command aliases
the campaign; weaker contracts refuse. Pin `81a4655:src/crdt/promotionRecord.ts` for the invoked historical
reader. Synthetic v7-to-v8 activation/fencing does not revive retired v8 product support.

Require twelve files (thirteen inventory entries) within 4 MiB /40-entry /two-level bounds: exact source
pins, successful summary, JUnit/logs, both child reports, three control reports, generated histories and the unit-history report.
The early-return control retains actual ready bytes and empty pending storage, then normal-code ready
bytes and exact persisted pending submission. Missing closure records its prior closed status, an actual
normal-code incomplete/commitment refusal after deletion, then omitted-witness ready status and pending
bytes. Authority records normal/mutant returnedness and durable counts; prefix controls retain actual
mutant and cold-replayed status in both proof orders instead of hardcoded labels.

Eight generated histories retain seed 9812027 and original population, cut sides and 100-second case
bound. Save each response observation before asserting it: bytes, recordedness, status and pending
submissions. Retain original sources/envelopes, post-crash pending bytes, prepared/duplicate submission,
pre-reopen status and final cold-reopened status/envelopes/sources. Reconciliation checks exact commit
recovery and retries, duplicate response consistency, proof-derived status/accepted prefix/response
count, pending eligibility and original source/wire retention. Its separate event oracle consumes the
recorded kind and position; it does not independently verify signatures, regenerate seeds or replay disk.
Native assertions and independent fixture response signing remain the execution authority. No visible-text,
whole-profile, arbitrary concurrent writer or power-loss claim is added.

The owned epoch passes **140 cases in six executions**: 91 planning cases in four full suites,
31 delivery and 18 decisions regression cases. Delivery takes **276.253s /510s**; decisions takes
82.269s /150s. All groups drain. A seventh request reuses the exact delivery receipt; twelve
reports survive checkout removal. Five new infrastructure cases include two 160-run report-corruption
campaigns (seeds 150955/150956). Nine synthetic process runs reject zero-exit bad summary, failed unit histories, incorrect
status, missing native case, ineffective baseline and changed recovered wire. Removing the semantic hook
or child census admits the corresponding fault; both controls discriminate. Synthetic reports are not
additional Account executions.

Initial adapter construction refused a new RegExp.test assertion as unresolved nested test registration.
The assertion now uses assert.match; original failed-registration source is retained. No census weakening
or test identity change occurred. The first owned epoch passed all 140 cases and reuse, but its final scratch inventory assertion failed:
13 entries instead of 12 revealed the existing unit-histories.json output missing from the required list.
Make it mandatory and require all 500 generated histories (seed 1121060), zero failures/skips/shrinks/
interruption, original configuration and a plausible three-order prefix count. The final epoch reruns
all 140 cases and reuse under the corrected contract. Both epochs, the failed script/log/source, five
focused repair checks and separate report-failure process control are retained. Existing
reporter/experimental API diagnostics, prior failures and owner/headroom observations remain without a
repair claim; this single-host run does not establish loaded-host reliability. The first owned manifest suite
uses 57.591s of its unchanged 60-second bound; the final suite uses 57.649s.
Its small remaining margin needs attention before adding
further wrapper cases; this result does not justify raising the bound.

Counts remain **628 obligations, 291 required files, 272 general files/2,198 dispositions (11 not applicable)**.
Unresolved integration falls from 132 to **130: zero test-file /81 command /49 campaign**. Runtime,
package/dependencies, crypto census/vectors, F-17 debt, earlier archives and L-2 remain unchanged. No
personal browser/server/relay/device/deployment operation occurs. Next: Account service-delivery wrapper,
including disposition of its retired native child, then remaining qualification repairs and immutable
aggregate/private human rehearsal. [Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-delivery/README.md).


## 2026-09-15 — Account service-delivery wrapper integration

Delivery is signed and verified as `6ca643f5`. The service-delivery wrapper now runs only its four
required service files (core/generated/restart/controls), preserving all 32 cases, exact argv, default
Node file concurrency, spec/JUnit and 90-second child bound. Remove its already-retired v8 HTTP browser
child; all six existing product-test exclusions remain. V9 interoperability remains required elsewhere.
Owned execution adds the ordered trace, distinct service report, 95-second aggregate/five-second grace,
and ten retained report files. This service stage acquires no browser. Its delivery regression uses a
separate disposable CDP fixture. Pin `2cb42a2:account-service/core.ts` for the invoked old reader and bound
that Git read to five seconds/2 MiB; the regression keeps `81a4655`.

The four actual service mutation controls now retain normal-code outcomes beside the mutant result.
Normal commit persists acceptance; generation mismatch refuses; membership changed during verification
and a missing closure ledger return unknown without a new decision. Mutants respectively return acceptance
without persistence, accept the wrong generation, commit after membership becomes pending, or resurrect
the missing closure. Require actual outcomes, row counts and account states; baseline subjects use
independent synthetic workspaces except the witness control's same damaged ledger.

Eighty generated histories (seed 9822026, 3–16 commands, unchanged 45-second case bound) retain every
command observation before assertions, inventory digests, projected ledger rows, captured request hashes,
first/final response bytes, proof classifications and cold-retry bytes. Reconciliation checks read-only
inventory equality, exact retries, before/after commit rows, permanent row identity, contiguous acceptance,
response framing/subject agreement and final retained responses. The compact row projection covers ordinal,
kind, position and digest. It does not independently authenticate signatures, reproduce ciphertext, replay
the database or regenerate schedules; existing Node/OpenSSL proof assertions and directed exact-submission
tests remain execution authority. Inventory scope remains promotions and delivery decisions, not the whole
profile. No browser interoperability or deployment claim is added to this service stage.

The owned epoch passes **159 cases in seven executions**: 96 planning cases in five full suites,
32 service-delivery and 31 delivery regression cases. Service takes **23.776s /95s**; delivery takes
269.083s /510s. All groups drain. An eighth request reuses the exact service receipt, and ten files
survive checkout removal within the unchanged 4 MiB /40-entry /two-level report bounds. The new five-case
`campaign-wrappers.test.mjs` infrastructure file keeps additional wrapper controls out of the existing
manifest suite. That suite remains at its original 70 cases and 60-second limit, passing in 56.718s;
this is not loaded-host headroom qualification. Two 160-run corruption campaigns (150957/150958) and eight
synthetic process runs reject incomplete zero-exit evidence. Omitting semantic reconciliation or the child
census admits the corresponding fault; both controls discriminate. Synthetic reports are not additional
service executions. No new planning/native failure occurs; previous failures and diagnostics remain.

The initial gzip archive exceeded its fixed 1,000,000-byte budget. Retain that packaging failure and
original script; XZ compression preserves all payload bytes under the same ceiling. No campaign or
resource limit is weakened.

The new resolved infrastructure file changes totals to **629 obligations /292 required files**. General
coverage stays **272 files /2,198 dispositions (11 not applicable)**. Unresolved integration falls from 130
to **128: zero test-file /80 command /48 campaign**. Runtime, dependencies, crypto census/vectors, F-17 debt,
previous archives and L-2 remain unchanged. No personal browser/server/relay/device/deployment work occurs.
Next: transport wrapper disposition/integration, then remaining wrapper families and qualification repairs,
immutable aggregate and private human rehearsal. [Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-service-delivery/README.md).


## 2026-09-15 — Account inbound preparation wrapper integration

Service-delivery is signed and verified as `9234a706`. The intervening transport/driver disposition was
already complete: both whole campaigns are excluded, with shared tests still required. Do not revive
those retired wrappers. Inbound preparation now preserves two original Vitest invocations, maxWorkers=2,
verbose/JUnit output, 60-second child limits and all 72 cases (25 preparation, 47 primitives). Owned
execution adds ordered child reports, a 120-second aggregate/five-second grace, two pinned JSON vector
registration inputs and sixteen required report files within 4 MiB /40 entries /two levels. No browser or
historical source read is required. Multi-file Vitest module reconciliation compares the exact unordered
census so scheduling order cannot cause false refusal; duplicates, missing/failed modules and retries fail.

The existing 300 generated histories (seed 9142026, 4–24 actions) retain actual post-action cursor, visible
text, pending flag, capture count and exact ordered wire/proof ledger hash, plus final drain observations.
Reports save after each complete history and on caught failures; process death can lose the active history.
An independent event-accounting oracle applies gap/duplicate/close/before/after rules and replays the
fixture's plaintext Yjs baseline/updates without importing the candidate receiver. It corroborates text,
pending dependencies, original wire/proof identity and no recapture. This report check does not independently
bind plaintext to encrypted envelopes/signatures or reproduce native storage. Existing test assertions
still perform crypto verification and full sameDocState comparison. Seven counterexamples now retain actual
observations, including accepted versus held-baseline refusal, lost genesis, missing split-commit content,
pending deletion, early promotion, global cursor and relabelled bytes.

The epoch passes **205 cases in seven executions**: 101 planning cases in five suites, 72 inbound preparation
and 32 unchanged service-delivery regression cases. Inbound preparation takes **17.409s /120s**;
service regression takes 23.721s /95s. All groups drain; an eighth request reuses the exact inbound
receipt and all sixteen files survive checkout removal. The unchanged 70-case manifest suite passes in
54.783s /60s, with no loaded-host headroom claim. Five new infrastructure cases include two 160-run
corruption campaigns (150959/150960). Eight synthetic process runs and two omitted-check mutations reject
incomplete zero-exit evidence and discriminate omitted semantic/child-Vitest reconciliation. These are not
additional receiver executions. An initial focused test used a campaign-row ID instead of the existing
retired command exclusion's argv; its failure log remains. The first synthetic control root omitted the
mandatory vector inputs and was refused before child launch; copying those unchanged inputs fixes setup.
Both setup logs remain. No product failure or limit relaxation occurs.

Totals stay **629 obligations /292 required files** and 272 general files /2,198 dispositions (11 not
applicable). Unresolved integration falls from 128 to **126: zero test-file /79 command /47 campaign**.
Runtime, package/dependencies, vectors/crypto census, F-17 debt, prior archives and L-2 remain unchanged.
Next: inbound-codecs wrapper integration, then remaining families/qualification repairs, immutable
aggregate and private human rehearsal. No personal browser/server/relay/device/deployment work occurs.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-inbound-prep/README.md).


## 2026-09-15 — Account inbound-codecs wrapper integration

Inbound preparation is signed and verified as `9937b8b7`. The codec wrapper preserves all three original
commands: two Vitest invocations (42 codec/control and 72 preparation/primitive regression cases),
maxWorkers=2, verbose/JUnit and 60-second child limits, followed by the exact 15-second Node import probe.
Owned execution adds a 135-second aggregate/five-second grace, distinct child reports, pinned vector
registration inputs and 28 required files. Preparation evidence stays in its original regression-artifacts
namespace. No native/browser fixture or historical reader is used. The import probe remains exit-only,
not an invented additional case.

The eight real compiled-source guard-removal controls now retain actual normal refusals, mutated received
results, actor/update count/prefix details, closed-lifetime state, baseline mismatch and retained-buffer
comparisons as applicable. Mutation reports retain before/after source hashes, applied replacements/hit
counts and bundle hashes. Reconciliation reconstructs each exact source edit against the phase-pinned
accountInbound.ts input, including the extra prefix-proof import. Bundle bytes are not independently
recompiled or authenticated by this report oracle; the actual Vite control execution supplies that evidence.

Four hundred generated signed updates (seed 9152026) retain authored text/nonce/update bytes, independent
expected record hash, actual live/cold record hashes, full returned update bytes and forbidden-actor refusal.
Reconciliation independently replays plaintext Yjs and checks exact byte/hash agreement. Five hundred
changed-wire cases (seed 9162026) retain the original page hash, index/mask, before/after byte and actual
refusal. Partial reports save after completed cases; an interrupted active case need not survive.
Independent request/page/record framing is checked alongside actual observed bytes, with original request
hash and reader/publisher separation. The existing 300-history preparation evidence is also reconciled.
None of this adds independent signature authentication, native persistence or production activation claims.

The epoch passes **292 cases in seven executions**: 106 planning in five suites, 114 codec-wrapper cases
and 72 unchanged preparation-wrapper regression cases. Codecs take **23.110s /135s** and preparation
15.571s /120s; all groups drain. Exact codec receipt reuse passes, and 28 files survive checkout removal
in a 30-entry inventory within the unchanged 4 MiB /40-entry /two-level bounds. The original manifest suite
keeps 70 cases and its 60-second limit, passing in 56.083s. Five new infrastructure cases include two
160-run corruption campaigns (150961/150962). Eight synthetic zero-exit runs and two omitted semantic/
child-Vitest hooks discriminate; these are not additional codec executions. The first synthetic launcher omitted the regression report directory and
failed file inventory after its child exited nonzero; its partial output/log/receipt and corrected setup
remain. The real qualification epoch passed without repair or limit relaxation. Prior observations remain.

Inventory stays **629 obligations /292 required files**, 272 general files /2,198 dispositions (11 not
applicable). Unresolved integration falls from 126 to **124: zero test-file /78 command /46 campaign**.
Runtime, package/dependencies, vectors/crypto census, F-17 debt, prior archives and L-2 remain unchanged.
Next: Account receive wrapper integration, then remaining families/qualification repairs, immutable
aggregate and private human rehearsal. No personal browser/server/relay/device/deployment work occurs.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-inbound-codecs/README.md).


## 2026-09-15 — Account receive wrapper integration

Inbound codecs is signed and verified as `70788d4e`. Receive preserves its original three-file Vitest
invocation (45 cases), maxWorkers=2, verbose output and 60-second limit, followed by all 17 native cases
with original Node/spec/JUnit command and 300-second child limit. Owned execution adds a 360-second
aggregate/five-second grace, distinct child reports, disposable CDP fixture and 24 required report files.
The invoked old marker reader is pinned as `8378596:src/crdt/promotionRecord.ts`; its existing five-second/
2-MiB Git read bounds remain. No other history input is inferred from unused inherited helper branches.

Four native controls now retain actual normal/cold/readback errors and mutated receipt progress. Coverage
requires each single omission to refuse before the joint omission admits missing content; witness removal
resets progress; split writes fail authenticated readback/cold replay; page-signature removal admits
locally reauthenticated bad service evidence. Original compiled mutation checks remain in the fixture.
The 12 generated histories (9182026, 1–3 actions) retain authored frames, original envelopes, actual commit-
cut cursor, retry result, recovered status, the request/page that really committed, final inbound events,
content rows and replayed text/pending state. Report reconciliation checks exact framing/bytes, original
ordered event links, commit-cut retry disposition and content coverage by independent plaintext Yjs replay.
Applying originals must leave snapshots unchanged and introduce no pending dependencies. This corroborates
the native assertions; it does not independently authenticate signatures, local AEAD/witnesses or storage.

Two hundred unit ledger histories (9172026) now have a distinct report containing original insert/deletion/
merged bytes and actual refusal reasons. Their plaintext and deletion coverage are independently replayed.
Codec mutation/400 generated recovery/500 wire corruption reports remain required and use the previous
adapter. Native observations save after completed steps, with final rows before assertions; unit/codec
reports save completed cases. Interrupted active work may be absent, and incomplete reports cannot pass.

The first focused corruption run overflowed Node's async-resource tracking after recreating identical
Yjs unit fixtures hundreds of thousands of times in one synchronous test. Cache exact input-tuple replay
within each report reconciliation while continuing to check every observation. The unchanged five controls
then pass in 4.32s; the original failing log and adapter/test source are retained. Recording the complete
plan separately exceeded its one-million-byte cap (1,005,453 compact JSON bytes). Prospectively set a
four-MiB planning-file cap with exact JSON round-trip and overflow checks, retaining every case/command.
The first owned epoch then stopped in generated-registration planning because its separate cap assertion
still used one million; align that assertion and retain all three completed stage receipts before rerunning
the entire epoch. Neither Account campaign had started. Campaign deadlines, runtime report caps and the
one-million-byte evidence archive limit are unchanged.

The owned epoch passes **287 cases in seven executions**: 111 planning cases in five suites, 62 receive
wrapper cases and 114 unchanged codec-wrapper regression cases. Receive takes **145.872s /360s**;
codecs take 21.493s /135s. All groups drain. Exact receive reuse passes; 24 report files survive checkout
removal in a 25-entry inventory within 4 MiB /40-entry /two-level limits. The unchanged 70-case manifest
suite passes in 53.706s /60s. Five new infrastructure cases include two 160-run corruptions
(150963/150964); eight synthetic zero-exit runs and two omitted semantic/native-census checks discriminate.
Synthetic report controls are not additional Account receive executions. No loaded-host headroom claim.

Inventory stays **629 obligations /292 required files**, 272 general files /2,198 dispositions (11 not
applicable). Unresolved integration falls from 124 to **122: zero test-file /77 command /45 campaign**.
Runtime, package/dependencies, vectors/crypto census, F-17 debt, prior archives and L-2 remain unchanged.
Next: Account receive-editor wrapper integration, then remaining families/qualification repairs, immutable
aggregate and private human rehearsal. No personal browser/server/relay/device/deployment work occurs.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-receive/README.md).


## 2026-09-15 — Account receive-editor wrapper integration

Receive is signed and verified as `ccffd280`. Receive-editor preserves its original typecheck (30 seconds),
four-file Vitest invocation (139 cases, maxWorkers=2, verbose, 60 seconds) and Node native invocation
(12 cases, spec/JUnit, 480 seconds). Owned execution adds a 570-second aggregate/five-second grace,
disposable CDP fixture, distinct property/native reports and 13 required files. Successful typecheck
output may be empty; its log must exist and its exact exit-only command must complete. No historical
input is invoked by this campaign; unused ancestor old-reader branches are not falsely included.

Ten generated histories (9202026, 3–6 actions) now retain initial text and source capsules, actual outcome,
visible text, receipt status and full capture identities/bytes after every completed action and final cold
reopen. Independent text/position accounting checks the ordered remote prefixes and local suffixes. It
requires no source allocation on remote/duplicate/invalid/compact/restart actions, exactly one for each
local action, and byte-for-byte continuity of every previously observed source. First observations are
never overwritten. These report checks corroborate native assertions; signature/AEAD and full Yjs coverage
remain the original tests' responsibility. The 139 property cases retain their original generated tests
and assertions; they do not claim additional persisted per-history reports.

Normal before/after receive-commit cuts now retain held visibility, pending result, queued-local visibility,
cold receipt/source state and actual retry results. Both actual compiled mutation controls retain measured
observations: early publication becomes visible before commit but disappears on normal cold recovery;
relabeling creates a capsule containing the exact original remote bytes. Generated observations save per
completed action and before final assertions; partial active work may be absent and cannot pass. Existing
native deadlines, generated count, seed, endOnFailure and prompt browser-context closure remain unchanged.

The owned epoch passes **329 cases in seven executions**: 116 planning in five suites, 151 receive-editor
and 62 unchanged receive regression cases. Receive-editor takes **149.702s /570s**; receive takes
153.991s /360s. All groups drain. Exact receive-editor reuse passes; 13 files survive checkout removal in
a 14-entry inventory within 4 MiB /24 entries /two levels. The unchanged 70-case manifest suite passes in
57.578s /60s. Five new infrastructure cases include two 160-run corruptions (150965/150966);
eight synthetic zero-exit runs and two omitted semantic/native-census hooks discriminate. Synthetic
controls are not additional Account runs; timings do not qualify loaded-host reliability.

Inventory stays **629 obligations /292 required files**, 272 general files /2,198 dispositions (11 not
applicable). Unresolved integration falls from 122 to **120: zero test-file /76 command /44 campaign**.
Runtime, dependencies, vectors/crypto census, F-17 debt, prior archives and L-2 remain unchanged. Next:
Account receive-transport wrapper integration, then further families/qualification repairs, immutable
aggregate and private human rehearsal. No personal browser/server/relay/device/deployment actions occur.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-receive-editor/README.md).


## 2026-09-15 — Account receive-transport wrapper integration

Receive-editor is signed and verified as `d178d349`. Receive-transport retains five original child
commands: typecheck (60 seconds), two-file Vitest (15 cases, maxWorkers=2/verbose, 60 seconds), then native
(9 cases/120 seconds), controls (4/90 seconds) and generated (1/330 seconds), each with its original
Node concurrency=1/spec/JUnit. Owned execution adds a 660-second aggregate/five-second grace, disposable
CDP fixture, four distinct case reports and 19 required files. Standalone children retain detached groups;
owned children inherit the runner's group so stage cancellation can drain all descendants. No historical
reader or vector input is invoked. Typecheck remains exit-only and may have an empty retained log.

Sixteen generated HTTP histories (9112042, 6–9 actions including forced lost/receive/restart boundaries)
now retain initial text/capsules, original wires, every actual request, the candidate signed page and
chosen response body (null for aborted transport, malformed bytes for corrupt response), actual operation
result, visible text, receipt status and full source identities/bytes. The candidate page is not falsely
claimed delivered after an aborted request. Incremental saves retain completed observations and a final
cold-reopened state; existing completed flags, coverage census, seed/count/endOnFailure and immediate
context closure remain. Interrupted active work can be absent and cannot pass complete reconciliation.

Independent report checks require request positions to follow durable progress, canonical request/page
framing and request hashes, exact original wire binding, correct lost/corrupt/received dispositions,
ordered text and observed receipt progress. Prior source identities/bytes must remain unchanged; only
local actions allocate one new source. Queue controls now retain actual initial/published text and result,
while cancellation controls retain both premature settlement and settlement after cancellation completes.
Flight/response-bound observations remain measured. These checks corroborate the original compiled
mutations and native assertions; service signatures, local authentication and CRDT correctness remain
with those tests. The 15 unit cases retain their original assertions and property coverage.

The epoch passes **301 cases in seven executions**: 121 planning cases in five suites, 29 receive-transport
cases and 151 unchanged receive-editor cases. Receive-transport takes **202.259s /660s**; editor takes
148.047s /570s. All process groups drain. Exact reuse passes; 19 files survive checkout removal in a
20-entry inventory within 4 MiB /32 entries /two levels. The unchanged 70-case manifest suite passes in
58.674s /60s. The manifest suite has only 1.326 seconds of observed margin; review its headroom before immutable qualification. Five new infrastructure cases include two 160-run corruptions (150967/150968);
eight synthetic zero-exit runs and two omitted semantic/native-census hooks discriminate. These synthetic
runs are report/process controls, not additional Account executions; timings do not qualify loaded-host
reliability. All original campaign and infrastructure deadlines remain.

Totals stay **629 obligations /292 required files** and 272 general files /2,198 dispositions (11 not
applicable). Unresolved integration falls from 120 to **118: zero test-file /75 command /43 campaign**.
Runtime, package/dependencies, vectors/crypto census, F-17 debt, previous archives and L-2 remain unchanged.
Next: Account receive-driver wrapper integration, then further families/qualification repairs, immutable
aggregate and private human rehearsal. No personal browser/server/relay/device/deployment actions occur.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-receive-transport/README.md).


## 2026-09-15 — Account receive-driver wrapper integration

Receive-transport is signed and verified as `a05369a1`. Receive-driver retains six original child
commands: typecheck (60 seconds), two-file Vitest (19 cases, maxWorkers=2/verbose, 60 seconds), native
(9 cases/180 seconds, including four R-01 size cases), scheduler controls (5/90 seconds), native controls
(2/90 seconds) and generated (1/270 seconds). All Node commands retain concurrency=1/spec/JUnit. Owned
execution adds a 750-second aggregate/five-second grace, disposable CDP fixture, five distinct case reports
and 25 required files. Owned children inherit the runner group; standalone detached groups remain.
No historical reader or vector input is invoked. Typecheck remains exit-only with its log retained.

Five actual scheduler mutation controls now retain before/after-disposal status, call counts and timer
counts. They distinguish overlap, missing polling, online clearing a halt, dispatch after observer close,
and stranded resume; disposal must report closed status and no timers. Two native dispatch controls retain
actual held/closed receiver status and network-call counts for baseline versus omitted offline/pressure
guards. The original effective source mutations and assertions remain mandatory.

Ten native histories (9112052, 5–7 actions with forced publish/restart) now retain original wires, actual
requests, candidate pages/chosen response bodies, initial/source state, action request windows, transient
offline/lost/halt observations, final text/status/captures and cold restart queries. Independent report
accounting follows durable query positions through data/empty/lost/corrupt replies, checks canonical
framing/hash/wire agreement and confirms restart begins at the recovered cursor. It checks authored text,
source allocation only on local actions, and full first-observation source-byte continuity. Idle/working
observations permit an unchanged background empty poll; they cannot fabricate progress. Completed records
save incrementally and before final assertions. Interrupted active work can be absent and cannot pass.

The original 400/100/80 generated unit campaigns remain within the 19 unit cases with their independent
clock/authority/lifetime assertions; this phase does not claim new per-history unit reports. Native owners
retain signature/authentication/CRDT authority. Timers in report observations corroborate the actual source
controls; offline reconciliation does not rerun the scheduler or authenticate service evidence.

The owned epoch passes **191 cases in seven executions**: 126 planning cases in five suites, 36 driver
cases and 29 unchanged transport cases. Driver takes **186.877s /750s**; transport takes 190.284s /660s.
Every group drains; exact reuse passes. Twenty-five files survive checkout removal in a 26-entry inventory
within 4 MiB /40 entries /two levels. The unchanged 70-case manifest suite passes in 55.025s /60s;
its earlier 58.674-second observation remains recorded, and loaded-host headroom is not qualified. Five
new infrastructure cases include two 160-run corruptions (150969/150970); eight synthetic zero-exit runs
and two omitted semantic/native-census hooks discriminate. Synthetic controls are not Account executions.
All original campaign and infrastructure deadlines remain.

Totals stay **629 obligations /292 required files** and 272 general files /2,198 dispositions (11 not
applicable). Unresolved integration falls from 118 to **116: zero test-file /74 command /42 campaign**.
Runtime, package/dependencies, vectors/crypto census, F-17 debt, previous archives and L-2 remain unchanged.
Next: Account sync/composition wrapper integration, then further families/qualification repairs, immutable
aggregate and private human rehearsal. No personal browser/server/relay/device/deployment actions occur.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-receive-driver/README.md).
