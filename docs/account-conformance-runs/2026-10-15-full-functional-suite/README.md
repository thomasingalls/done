# Signed repair, local preview and full functional checks

**Date:** 2026-10-15 · **Source:** signed `5afdd0ad3d478e19c86f28e4db042a2d77d70c13` ·
**Status:** completed with retained failures; no green full-suite or release claim.

The continuation completed all 85 command entries: 36 passed and 49 failed. These are command
outcomes, including repeated wrappers, not 49 independent defects. The final follow-ups below
supersede the intermediate pending notes. The next retained-state repair has its own
[bounded packet](../2026-10-15-multi-tab-setup/README.md).

The operator requested a signed commit of the passkey/Local-access repair, an update of the existing
8443 preview, and the full functional suite while retrying the original Firefox-private/Bitwarden
flow. The [repair packet](../2026-10-15-passkey-local-access/README.md) retains its bounded contract,
focused regressions, real-provider observations and unresolved original report. This run does not
resume the aggregate release-qualification campaign, merge a branch or publish an application.

The signed commit is complete. The existing frontend gateway now serves an immutable build in
`.dev/preview-builds/5afdd0ad`; the separately running account service and existing Tailscale route
are retained. The served `assets/AccountSetupApp-BQqbzmO4.js` matches that saved build byte for byte
(SHA-256 `3a1ae16248a35ef86ba62b684262e32a72a1a9c162f41b2e8459be04924a8e2c`). Public configuration
before and after is identical. Cached-client adoption requires the app's update action; the gateway
response does not establish which module the operator's Firefox is running.

## Run boundary and environment

Checks run against a disposable Git clone at `/private/tmp/done-full-suite-5afdd0ad`, detached at the
signed source. Logs and the continuation ledger are outside that checkout at
`/private/tmp/done-full-suite-5afdd0ad-evidence`. Application source stays unchanged while checks run.
The preview uses its saved build, independent of test builds and test data.

The normal `pnpm check` chain is followed. After a failing command, the continuation executes every
remaining command separately and retains each result rather than losing coverage to shell short
circuiting. Additional finite browser/runtime test commands, relay integration tests, standalone
enrollment/successor checks and execution-adapter regressions are included. Interactive watch mode
does not constitute an additional finite suite. Latency measurements, cold-VM/platform qualification
and the paused aggregate remain separate.

Local runtime is Node **26.11.1**, while CI specifies **24.18.0**. The package-manager archive for
pinned pnpm **11.20.0** was checked against the official registry's SHA-512 integrity. Existing root
dependency bytes were materialized into a self-contained tree, retaining internal links and
relocating only generated launchers. No external dependency links remain. Dependency-layout warnings
are retained, with automatic installation disabled for test commands. The relay's separate frozen
lockfile was installed into a disposable directory with install scripts disabled.

The first system-pnpm invocation attempted automatic dependency reconciliation and failed DNS;
another initial run refused external dependency links before native tests. These are environment
failures, retained independently of the subsequent materialized run. A sandboxed relay invocation
stalled before a test socket existed; the unchanged command passed all seven cases with loopback
permission. None of these retries changes an assertion or earns broader platform credit.

## Interim findings

- All 149 Vitest files pass: **1,763 passed, one existing named skip**. Contract/vector/static checks
  preceding them pass. The self-contained storage harness and write-session campaign pass.
- Custody, content, journal, admission and trim complete their functional cases but encounter stale
  mutation anchors. The proposed repair preserves every case, assertion, mutation and uniqueness
  guard; no existing test has been changed without approval.
- Three frozen browser snapshots omit the account-protocol sources their current imports require.
  Those failures are retained. The proposed repair includes the missing source tree in their copied
  and hashed input lists.
- The Local creation campaign timed out after ten passing cases, with interruption/abort/cancellation
  cases incomplete. That run overlapped a separately launched successor browser suite. The isolated
  index-interruption case passes; a complete campaign with no competing browser tests remains due.
- The successor suite reports **83 passes and six failures**, including two test files that fail to
  load generated module chunks, stale mutation controls, a stored-format assertion and a cold
  discovery assertion. The latter two assertions fail again in a focused unchanged recheck. They
  remain unresolved; they are not disposed of as harmless fixture drift.

Subsequent observations while the continuation is active:

- Legacy export passes 16 named checks, 60 generated histories and seven fault controls. Legacy
  import, selection, cleanup and coordinator snapshots also omit account-protocol inputs. Cleanup
  repeatedly failed to load the same fixture; its partial report/events were preserved and its
  existing supervisor interrupt handler stopped its owned workers. It remains failed/incomplete,
  with no credit for unexecuted cases. No test or deadline was edited.
- The host campaign finishes with 60 generated histories and a passing command, retaining its
  **unsupported-host** disposition. This is not a supported-platform migration guarantee.
- Private migration reports three passes and two failures. Its development page requests a named
  React compiler-runtime export that the generated module does not provide. The observed module
  exports only a default; optimizer metadata marks it as requiring interop. Cause remains open.
- Development Local startup reports seven passes and eight failures; packaged startup reports one
  pass and two failures. Old credential-first entry states and ambiguous `Open Goals` locators stop
  cases before their later security assertions. The geometry matrix reports 106 passes and two
  failures, both at the former relay-status text. Existing tests remain unchanged.
- Application-upgrade checks encounter old entry-helper timeouts and do not complete their whole
  campaign. Their precache-byte check passes; the existing predecessor skip remains visible.
- Storage compatibility reports four passes and two failures. An independent recursive comparison
  of the failing census shows one changed value: `localStorage['done.application.local-only']`
  changes from absent to `'1'` while an upgrade is blocked. Encrypted carrier contents are identical
  in that comparison. The exact no-write assertion remains failed; this write requires contract
  review. The other failure stops at an old unlock control.
- Account core, recovery, authority, promotion, genesis, editing, outbound, spool and decisions pass.
  Spool includes all 24 native cases and its fault controls. Admission reports 32 passes and two
  stale-control-anchor failures. Handoff reports 19 passes and two exact-shape failures on the added
  `detached: false` field, stopping its generated histories early. Capture reports 14 passes and one
  missing/ambiguous fault-control failure. These failures remain in the command ledger.

The operator explicitly approved both exact patches: five general-test census values for the nine
new unit cases, and eight existing harness files repairing mutation anchors/snapshot inputs. They
are applied to the working branch and a separate disposable rerun checkout. The original full-run
checkout remains unchanged. The census regression passes all five tests. The normal inventory
policy admits the two new unit files; the refreshed graph/plan retains **840 obligations and 301
unresolved obligations**. This is planning evidence, not qualification. All eight approved native
harness reruns subsequently passed, preserving their mutation controls.

Additional Account findings retained while the continuation is active:

- Delivery, inbound preparation/codecs, receive-editor, activation and crypto-preparation pass.
  Service-delivery and transport/custody wrappers repeatedly encounter the same stale generation
  and current mutation anchors; their witness control is refused by ledger-integrity before the
  intended bad outcome. Capture and driver controls also have source-copy/anchor failures.
- Receive and admission-bounds substitute one historical module into a current caller that now
  requires additional exports. Those historical dependency closures fail to load; current
  production exports exist. No parse-only substitute or weaker historical check has been accepted.
- Service-inbound has three failures, including a generated-history baseline mismatch. Receive
  transport expects an exception for a superseded owner; current code returns an unrecorded unknown
  result. The existing assertion remains failed; a separate diagnostic will check the actual result
  and independently verify that receive progress and original synthetic writing are unchanged.
- Receive-driver reports a refusal-reason mismatch. Sync reports a reference/default/rollback case
  failure because an internal metrics property exists on the test global where the assertion expects
  it absent. These are unresolved mismatches, not established harmless changes.
- First-authority and recovery-contract checks reach their formatting checks after their preceding
  registry, vector and functional cases pass. They fail on construction-registry JSON formatting;
  recovery also identifies an old test entry's formatting. Existing test files are left untouched.
- Promotion-contract passes its promotion, genesis and admission regression stages, then fails the
  same two handoff route-shape assertions. Later stages receive no execution credit.

## Final follow-ups and custody

- Isolated genesis passes all 17 baseline cases; three controls still error and the whole campaign
  remains red. Both successor behavior failures also occur on prior signed `42ebdd12`, using the
  same dependency bytes. That excludes introduction by `5afdd0ad`; it does not establish correctness.
- The superseded-owner diagnostic observes `{kind: 'unknown', recorded: false}`, zero receive
  progress and unchanged synthetic writing. The old exception assertion remains failed.
- Session transport fails again alone with `receive:network-unavailable`. Supplying the required
  historical upgrade checkout reaches the upgrade, then stops at an old `schema 5 → 8` expectation;
  the actual result is `schema 5 → 11`. Later retention assertions do not receive execution credit.
- The fresh-realm metrics diagnostic confirms that the inherited fixture explicitly enables the
  property; ordinary unprofiled/reference bundles do not expose it in the fresh realm. The exact
  counter refusal disagrees with a documented Local-baseline compatibility fence. Both old tests
  remain unchanged pending a separately approved correction.
- Capturing the browser adapter's original child log identifies a missing copied
  `vitest-dispositions.mjs`, rather than a browser timing failure. After the explicitly approved
  module-copy and second census correction, all **289** release-runner regression tests pass.
  Earlier failed reports and the unchanged diagnostic are retained.
- The five-file test formatting proposal stays unapplied at the operator's request. Four proposed
  layout changes concern today's approved catalogue edits; the old recovery entry dates to
  `42ad6b7e` on October 9. The construction JSON formatting proposal was also reverted. Its passing
  first-authority rerun applies only to that proposal, not the current unformatted state.

[Artifact index](artifact-index.json) records 637 retained artifacts, original and normalized hashes,
source identities, and the 8 MiB packet budget. Text logs are compressed; source and failed histories
remain available without preserving private service databases or browser profiles. The
[failure map](failures.md) separates restored harness reachability from remaining product/contract
disagreements. The outcome was appended to `docs/completed.md` before closing this active slice.
The other workstream's `docs/progress.md` remains untouched.
