# Receiver capability and blocked-open metadata repair

**Bounded repairs committed as signed `6eeb7d5f`, 2026-10-15.** Verification base: signed
`faadbff5d41eab72434af4193f774d50f1ac577c`. The operator authorized receiver compatibility first,
then the blocked-upgrade metadata write, with new regressions and no changes to old tests without
approval. Merge, deployment and aggregate qualification remain paused. The local 8443 preview stays
on its immutable `fcb659c3` frontend while repository checks use disposable services and profiles.

## Contract and completion

1. A session host without membership/history continuation must retain ordinary authenticated
   two-way delivery, restart recovery and offline Local writing. It must not request an unsupported
   history endpoint. An enabled host still checks history before ordinary receive. Authenticated
   installed/inherited history must not be bypassed by a false public capability hint or a failed
   endpoint; advertisement is a scheduling hint, not authority to discard a required history check.
2. An app refused by its storage compatibility interlock must preserve its complete persisted
   census, including public discovery hints. Fresh Local startup and previously prepared offline
   startup must remain available. Protected workspace custody and explicit removal remain intact.

Use counterexamples before each repair, then challenge successful/failed/changed capability and
interruption boundaries. Preserve source identity, original failed attempts, exact commands and
limits. Existing tests/harnesses remain byte-identical unless the operator separately approves a
concrete patch. Passing focused checks does not close the recorded red full-suite baseline.

The governing contracts include TRD §13.3, the [history receive ordering boundary](../../account-history-receive-ordering.md),
[reader-first rollback rules](../../account-local-retention-reader-rollout.md), and the
[storage compatibility refusal](../../storage-compatibility.md). No crypto format, signature,
history proof, storage interlock or authority verifier is weakened in this slice.

## Implementation and counterexamples

The new legacy-host case fails on the unchanged saved runtime because its first new writing never
arrives. The repaired owner reads the live continuation hint inside its authenticated serialized
state task. It omits history only while the legacy context has no history requirement. Retained
installed/inherited history, later membership epochs/generations or a requirement already observed
in that lifetime keep the history check. Required 404/unavailable replies do not fall through to
ordinary receive. This changes request scheduling, not receipt/signature/coverage verification.

The first metadata unit draft reports five failures and two passes. Both browser censuses reproduce
the write: a 404 creates the Local-only hint; an available service creates pin/mode/membership hints.
The repair acquires the existing shared Local permit after the response, checks compatibility and
rechecks a pin which may have changed before its synchronous metadata effect. A queued upgrade is
rechecked after acquisition. Undefined intents and failed probes do not grant writes. Compatible
discovery retains prepared offline behavior and leaves no fresh custody database.

A promoted Account legitimately understands its authenticated Local interlock. Ordinary discovery
cannot persist its hints there, but may return the public locator for the selected factor/passkey
owner. The initial metadata draft propagated this interlock refusal; review refined it to omit cache
writes instead. Live capability refresh also cannot wait behind an active Account's exclusive permit.
A new unit check then caught a freshly fetched capability being replaced by the absent disk hint;
the final version retains it in memory independently. Neither public value grants opening authority.

## Verification and retained failures

- Receiver repair: both new cases and the unchanged original session journey pass, covering two-way
  delivery, service restart, offline reopen and false-hint/unavailable-history refusal after cold replay.
- Both exact-census browser cases and three unchanged history journeys pass. The original unchanged
  two-live-writer compatibility case also passes its complete persisted-census comparison.
- The broader matrix passes 26 cases without skips/retries, before the final live-capability refinement.
  The final nine-case run passes eight and fails a new fixture that created a separate Account rather
  than promoting Local. The corrected fixture explicitly proves Local's interlock, authenticates its
  reopen, retains writing, leaves public pin caching refused and observes the advertised history
  request. It and both census cases pass on that same final runtime. Original tests were unchanged
  at that checkpoint; the subsequent four-file fixture approval is recorded below.
- Ten new unit cases and seven unchanged storage-compatibility cases pass. Nine unchanged native
  history-installation/HTTP cases pass. The pre-approval full unit attempt is red: 1,772 pass, seven old-fixture
  cases fail, and the single existing named skip remains. Its two failing files lack the newly needed
  secure-context/Web Locks/IndexedDB fixture wiring. The approved wiring and rerun follow below.
- A uniquely applied hint-only history control is detected after verified cold reopening: the expected
  history request count stays zero. The first control build failed on an indentation-sensitive anchor;
  no mutant/browser evidence is credited to that failure. The corrected control builds and fails at
  the intended detector. The receiver source is unchanged by the later configuration refinement.
- One initial browser collection fails on an extra parenthesis in the new test; its report is retained.
  One planning attempt runs while new tests are still being authored and detects inventory drift.
  Fresh sequential inventory/plan checks pass afterward, retaining the aggregate blocked state.
- Final build/typecheck, required Yjs patch, scoped lint and origin checks pass; initial JS is
  231.6/350 kB. Local Node is 26.11.1; no CI Node 24 or new Firefox/Bitwarden walkthrough is claimed.

## Approval and handoff

The [four-file fixture patch](reproduction/pending-old-fixtures.patch) adds unit-only browser
wiring to two files and updates the two exact census fixtures for ten new cases (2,443 → 2,453).
The operator explicitly approved it, and the applied diff is byte-identical to the saved patch.
Every existing assertion, test, deadline and release block is retained. The original
[old-file boundary proof](receipts/old-test-boundary.json) records the pre-approval state; the new
[approval boundary proof](approval/old-test-boundary.json) verifies the exact approved diff and that
no other tracked old test changed. All 411 original source/configuration pins still match.

The [approval results](approval/results.json) record 22 affected unit passes and 17 census passes.
The full unit population passes with two workers: 151 files, 1,779 cases and the one existing named
skip. Two default-worker attempts are retained: three five-second timeouts while another runner
overlaps, then one multi-chunk baseline timeout after that runner ends. Reducing concurrency passes
the same population with the same deadlines; a green default-worker run is not established.
The first broader runner attempt passes 271 and fails 18 under sandbox restrictions, including
explicit loopback/process-inspection denials. The permitted rerun passes all 289 cases, with two
files at a time and zero skips. Scoped fixture lint and inventory/manifest rechecks pass. These are
tests of the runner; aggregate qualification remains paused. No CI Node 24 or new actual-provider
walkthrough was run.

The [artifact index](artifact-index.json) retains 53 hashed artifacts, normalized logs, source pins,
the reproduction patch, both saved candidate inventories and the failed attempts above. The
[result receipt](receipts/results.json) separates the initial focused evidence from earlier attempts.
The additive [approval index](approval/artifact-index.json) retains 17 further artifacts, including
the failed attempts, passing reruns, exact patch and boundary/source proofs. All 53 original artifacts
are preserved and their hashes reverified.
The repaired source was uncommitted at that verification checkpoint. Source inventory keeps 393 files and all 195 crypto domains;
only the two runtime hashes change. Planning retains 846 obligations and 305 unresolved obligations.
The broader full-suite baseline remains red and aggregate qualification remains paused.

Preview `fcb659c3`, its backend and user data remain untouched. At that checkpoint no commit, push,
merge or deployment occurred. The operator subsequently requested the commit; signed
`6eeb7d5f300bca252f32823e9be2be1b0546f25d` contains the verified source and its SSH signature verifies.
No new signed build, preview refresh or cached-client adoption is claimed. The following
[remaining-failure packet](../2026-10-15-remaining-functional-failures/README.md) records the commit and
the separately approved fixture follow-up. Outcomes were appended to `docs/completed.md` before
advancing active state. The other seat's `docs/progress.md` remains untouched.
