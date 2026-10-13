# Exact local retention dry-run evidence — 2026-10-13

Base: signed **`af5f0d87`** (`G`). This implementation is uncommitted; `manifest.json` records
its source hashes and the compressed logs. [Contract](../../account-local-retention-dry-run.md).
All accounts, credentials, writing and fault injections are disposable. No personal profile or
service changed. No history deletion, reduced-format activation, publication or general release
validation was performed. No performance result is inferred on this busy host.

## Checks and outcomes

Installed tools were used directly, as in the preceding phases. No dependency installation or
package verification bypass was needed.

- `node node_modules/vitest/vitest.mjs run --maxWorkers=1 test/localBaseline.test.ts test/localBaselineLifecycle.test.ts test/retentionFences.test.ts test/localBaselineAnchor.test.ts test/journalCodec.test.ts test/journalSnapshot.test.ts test/sourceCapture.test.ts`
  — **117 tests / seven files pass**. Six new cases cover exact projected inventories, partial
  capsules, attempt burns/reservation holes, next allocations and successive projected cuts,
  pending/unsettled/actual encoded-capacity skips, damaged/unknown evidence refusal, caller mutation,
  wrong lifetime/intent and retirement/disposal. The generated planner control runs 12 histories
  with seed `131027`; the preceding 12-history rebase control remains. Every generated candidate
  replays against intact history and rejects a changed old row. Existing authority, rotation,
  checkpoint, source/journal and native-anchor unit controls pass after extracting the shared
  readonly metadata authenticator.
- `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 node --test test/local-baseline/owner.native.mjs`
  — **28 cases passed, two new harness assertions failed, one ordinary-build case skipped**.
  The two failures expected blocked admission on storage corruption; the actual carrier correctly
  closed the owner. The final assertions require closure and a rejected plan, then exact byte
  preservation. Rerunning `--test-name-pattern='changed after capture'` passes **both cases**.
  Thus all **30 enabled cases** have passing evidence; there was no subsequent full-file rerun.
  Twenty-three are existing owner/anchor/era controls, seven are new planner controls. The packet
  preserves the full-file failure and diagnosis, not only the final subset pass.
- The seven new native cases establish: exact readonly operation before anchoring, after v3 and
  after the v4 era/rebase; stale read rejection and a usable new request; undo/redo and cold replay;
  queued journal-before-apply input; retained-journal refusal; fresh authority change during crypto;
  renderer death with no allocation/cut followed by a successful retry; and row/chunk corruption
  after capture with no successful plan. The settled readonly control throws on **any** attempted
  content-database readwrite transaction and compares all four stores, including raw metadata.
- `node --test --test-name-pattern='ordinary Account workspace' test/local-baseline/owner.native.mjs`
  — **one passes**: no installation, replacement, era or dry-run method; ordinary editing persists.
- `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts transition-owner.spec.ts`
  — **one packaged journey passes**, with real original/joined owners, bidirectional writing,
  undo/redo, retained history, checkpoint verification, epochs 4/5 and both cold reopenings. New
  assertions require planned empty projected suffixes at revisions 2 and 3 on both devices, and a
  `durable-attempt` skip while the producer still owes its authenticated checkpoint completion.
- TypeScript, changed-file lint/format and `git diff --check` pass. The ordinary build, Yjs patch,
  bundle budget and origin isolation pass; initial JavaScript remains **138.3 kB gzip / 350.0 kB**.
  Build completion was observed directly in tool output; `static.log.gz` retains the subsequent
  budget/origin checks against that output, plus the recorded static-check completion.

## Test corrections

The first unit attempt tried to construct an unknown protocol row through a helper that computes a
valid protocol witness; the helper refused before reaching the planner. The corrected control seals
the invalid row into an otherwise valid inventory and requires planner refusal before signing.

The initial native attempt read an unset browser global without `window.`, and expected a benign
planner skip where `whenDurable()` had already refused journal cleanup. These are corrected to
observe the flag safely and require the earlier refusal. The five directed cases then passed. The
full-file run found the two closure-versus-blocked assertions described above; the diagnostic logs
show `closed` with a rejected admission ticket. No product guard or refusal was weakened.

The first packaged attempt stopped before a dry run: installation returned `pending-promotion`
while a concurrently prepared receive was finishing. Its preceding shadow match does not guarantee
that promotion has drained. The harness now polls that **specific** allowed refusal for up to
15 seconds before requiring `installed`. The final journey passes with the same owner fence.

## Limits

The planner authenticates complete physical history and a predecessor baseline, constructs the new
candidate from that predecessor plus suffix, and checks an in-memory projection. It does not write a
reduced carrier. The new plan's successor era, deletion list and anchor stay ephemeral, and the real
owner returns only a summary before disposal. Existing metadata replacement controls still exercise
the old non-deleting installer. Actual atomic deletion, post-deletion native cold/lifecycle opening,
reservation/commit crash recovery and public compatibility/rollback remain later work.

Exact projection preserves semantic obligations; it is not a benchmark, an arbitrary-restore proof,
key-retirement authorization or durable reclamation. `docs/progress.md` remains untouched. Builds,
browser profiles, databases and traces stay ignored under test-results, not in this packet.
