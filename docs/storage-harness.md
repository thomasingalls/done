# Shared encrypted-store harness

The harness runs the same browser schedules against the three immutable implementations in
[`catalog.mjs`](../scripts/storage-conformance/catalog.mjs). It extracts each commit into a fresh,
ignored output directory and calls its actual storage, key, application, editor and clear APIs through
[thin adapters](../test/storage-conformance/adapters). It does not merge or repair candidate code.
The latest recorded execution is [2026-09-08](./storage-conformance-runs/2026-09-08.md).

## Run

With project dependencies and Playwright Chromium already installed:

```sh
pnpm storage:conformance
# Equivalent, without invoking the package-manager shim:
node scripts/storage-conformance/run.mjs
```

All three commit objects must exist locally. The runner never fetches branches, installs packages or
uses the user's browser profile. Every run creates its own output directory under
`test-results/storage-conformance/`. An existing output path is refused. External browser requests are
blocked; Vite serves the fixture on loopback. `CHROMIUM_PATH` can select an installed executable.

For a focused investigation:

```sh
node scripts/storage-conformance/run.mjs --candidate contract --case C07.late-reservation,C08.other-writer
node scripts/storage-conformance/run.mjs --candidate codex --case C03.pending-input --no-mutants
```

Candidate ids are `codex`, `contract`, `encrypted`. `--case` records a selected-subcase scope; it cannot
be presented as a whole-protocol run. `--no-mutants` omits mutation controls and is for investigation.
`--output <new-directory>` chooses the artifact directory. `--keep-profiles` retains the synthetic
original/copied profiles; by default those profiles are removed after recording their content digests.

Exit status is **0** when the selected assertions pass, **1** for failed assertions, undetected mutations
or remaining production obligations, and **2** for a harness/environment error. A full run against these
pins is expected to return 1. Failing conformance is a result to inspect, not a reason to invert the
assertions or weaken the gate. The normal unit suite separately tests the reporter's refusal of missing
cases, fabricated passes and mutation results unsupported by the named oracle.

## Evidence and boundaries

The initial catalog has 19 executable subcases across C01–C13/C16, plus explicit remaining obligations
covering all 16 matrix requirements. Each full run executes 57 unmodified-candidate subcases and three
mutation controls. A passing subcase establishes its specific oracle; the larger matrix obligations
remain unpaid. The [acceptance matrix](./storage-conformance.md) is the authority for their scope.

`report.json` records full candidate revisions, archive/source hashes before and after execution,
lockfiles, actual runtime versions, harness/adapter hashes, assertions with observations and expected
values, schedules, errors and missing capabilities. `report.md` is its readable projection. Each case
also records localStorage and IndexedDB inventories, including out-of-line keys, and the observed fault
boundaries in `checkpoints.json`. CryptoKey objects are inventoried by type, algorithm, usages and
extractability; that inventory does not export their underlying key bytes.

The runner invokes the real `openStore`, CodeMirror `createEditor`, persistence methods and clear paths.
For Codex's low-level input API, its adapter prepares a Yjs candidate update and passes it to the actual
`admitUpdate`; mutating that candidate's persistence document directly would exercise its receive path
and bypass the journal. No adapter supplies a missing durability, replay, trim or retirement mechanism.

Receive cases inject a Yjs update at the provider-document seam supplied by the production sync
controller. This exercises its actual editor/persistence bridge. It does **not** exercise a future
Stage 4 encrypted wire verifier or service. The short receive case and the update beyond the 16-KiB
journal ceiling are separate: incidental journalling of small remote updates can mask causal loss.
Pending-input cases inspect real editor text, canonical and transport documents, ordinary export output
and undo depth. Native OS IME and the complete action matrix remain owed.

Fault injection pauses WebCrypto record encryption, rejects a journal append or content deletion, or
delays delivery of the completion event for an already committed state-record transaction. That last
boundary lets another page's earlier reservation commit before trim deletes its observed inputs.
The runner verifies the sequence gap and the late row's presence; a schedule that does not reach its
required gate is a harness error. The encrypted bytes and persistence operations remain the candidate's.

Renderer death uses CDP `Page.crash`, without `destroy()` or an unload flush. Freeze uses
`Page.setWebLifecycleState` with a second page querying the origin's LockManager. The lock probe checks
for a shared holder while the writer is frozen; it does not certify slot-name binding, transitions,
workers or mixed-version exclusion. Those require the absent integrated coordinator.

The copied-profile case closes a fresh persistent Chromium profile, copies every file and checks
content digests before reopening the copy at the same origin without a factor. It includes a known
content control when the copy opens. This is a same-host test under Playwright's Chromium launch
settings, including its mock keychain, not a supported-platform or OS-forensics claim. If a copy refuses,
the case cannot credit factor protection without a valid-factor positive control. All three current
pins lack that control and future-receiver protection.

Clear cases use a synthetic authorized slot inventory to name the target of the production removal
operation. They do not fabricate or certify an Account binding. Full ClearIntent/resume, terminal
markers, shared roots and authorization remain separate obligations. Likewise, missing generation,
checkpoint, receiver and import APIs are named as `not-implemented`, never supplied by a protocol model.

## Mutation controls and extension

Three mutations are applied only to isolated copies of contract-pass: snapshot the live document in
place of merged disk updates, delete by sequence range, and skip unreadable trim input. Every mutation
has one exact source anchor and records its before/after hash. A control is detected only when the
unmodified case passes and the mutant fails its named oracle. A crash, unrelated assertion failure or
already-failing baseline does not count. Both the original and mutated runs retain their observations.
These three controls validate their named trim cases, not every future guard in the matrix.

To add a synthesized implementation, pin its exact commit in the catalog and supply an adapter exposing
`fixture(name)`, the candidate namespace, and production path references. The fixture owns identity
mapping and calls the existing production `open`/`clear` methods; `browser.mjs` supplies the common input,
observation and browser-fault interface. Keep all requirement assertions in `scenarios.mjs`. Add shared
scenarios for newly available lifecycle APIs before replacing their remaining-obligation entries.
Never make adapters journal refused input, merge trim coverage, repair metadata or retire keys themselves.

Passing this command never updates `debts.json` or pays a release gate. Complete evidence at the relevant
gate must be reviewed against the entire obligation, including the still-missing controls and support
population.

The new [write-session lifecycle component](./write-session.md) has a separate `pnpm storage:session`
command for its bounded C04 schedules and five guard-removal mutants. It uses the same evidence reporter,
but tests the current production component rather than any of these immutable candidates. A passing
lifecycle result does not change their recorded outcomes or supply the missing storage integration.
