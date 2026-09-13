# Release-validation execution — foundation and content adapter

The inventory is committed unsigned as `f13bdd1` and the foundation as `f14c68f`. The foundation supplies a finite obligation manifest,
an exact-case Node adapter, a shared bounded stage runner and a disposable execution entrypoint.
It **does not complete the release execution graph**. The original phase-2 proposal grouped the
runner foundation and every native/wrapper adapter together; inspection showed that the latter
requires its own bounded integration phases. Keep that work ahead of P-06 and the immutable run.

The [manifest](./release-validation-manifest.json) now contains 596 obligations, including all 260 current
required test files, 11 current catalogues with **163 cases and 54 discriminating mutations**, 29
vector corpora, 83 registry entries and exact selected package/phase command variants. Six retired
v8 test files remain excluded. Registry entry `remaining-coordination-names` remains explicitly
non-cryptographic: its disposition is checked by the live authority/registry check, not credited as
a cryptographic test. Whole-wrapper obligations stay separate from direct test-file obligations.

**445 obligations remain blocked.** This is a count of unresolved manifest rows, not defects or
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
```

The first two commands check reviewed snapshots. Planning may report `blocked` while the snapshot
check succeeds. `node scripts/release-validation/plan.mjs --require-complete` must currently exit
nonzero. `execute.mjs --selection release` likewise refuses; it is not a partial aggregate command.
After reviewing input or selection changes, explicitly regenerate the inventory with `check.mjs
--record`, then the manifest with `plan.mjs --record`. Each artifact has a 700 kB ceiling.

`infrastructure` runs six stages: the identity, inventory, manifest and content-adapter test files (23 exact cases),
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

## Next bounded integration

Integrate the journal catalogue's **17 baseline cases and six mutations** with the same owned browser
boundary, reviewing its report and source-patch assumptions independently. Then extend the adapters
to remaining catalogue, Node, Vitest, Playwright and wrapper families, retaining their postconditions
and measured per-suite deadlines. Ten catalogues (150 cases/49 mutations) still need adapters.
Vector reuse becomes meaningful when consumers explicitly depend on the same successful identity.

Only after every required obligation resolves should P-06's prose sweep and the complete selected
immutable run proceed. No personal app/server/profile, release deployment or Account cutover is
part of this work. The [foundation evidence](./account-conformance-runs/2026-09-13-validation-runner/README.md)
retains its earlier bounded scope.
