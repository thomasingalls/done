# Private Account editing lifetime — bounded evidence

Parent: signed `649925f` (`Select verified Account handoff and classify offline startup`).
[Contract](../account-editing.md). This private owner attaches verified Account access to the existing
admitted workspace, journal, content carrier and undo history. It holds an **exclusive slot permit for
the full editing lifetime**. Another Account editor waits until close; concurrent Account editing,
default UI and relay integration are later work. Existing Local shared-writer behavior is retained.

## Result and evidence

`node scripts/account-editing/run.mjs` (the exact `account:editing` package target) passed at
`test-results/account-editing/2026-09-10T18-35-12.942Z`: **16 tests, 110.64 seconds**, no failed, cancelled
or skipped tests and no campaign timeout. The runner has a 120-second deadline and streams progress.

- Every open authenticates the selected route, retained provenance/custody, first-epoch receipt,
  independently pinned binding and device wrap, with a fresh passkey assertion and the device-lock
  code. It needs no recovery code or service. The actor must match the retained principal. Caller
  mutation while queued cannot substitute slot, identity or pin. Missing, closed or changed routes
  refuse without repair. Wrong pin, valid-format wrong factor, invalid assertion and wrong actor do
  not advance activation or expose a document.
- A first open verifies the exact frozen genesis, then strictly advances the one authenticated
  promotion carrier from selected v4 to v5 `account-active`. Neither admitted initialization nor an
  edit precedes that commit's acknowledgement. Abort before commit and actual renderer death after
  commit both cold-resume. The index, original custody, genesis, credentials, keys and counters are
  retained. The actual committed `649925f` reader and ordinary Local/handoff owners refuse v5.
- Subsequent opens independently verify the original checkpoint and replay current database plus
  journal. A detached fork must remain unchanged when the checkpoint is applied: current integrated
  coverage must already include genesis, while later deletion and durable pending dependencies may
  remain. Missing source is refused, never silently filled in from the checkpoint. The actual editor
  reopens later edits, supports undo, and survives exact-coverage compaction.
- **24 generated editing histories**, seed `9292026`, vary insertion, deletion, undo, synchronous
  journal retention, explicit flush, compaction, close/reopen and renderer death. An independent string
  model supplies expected writing after every operation and cold reopen. Custody and full authenticated
  promotion provenance must stay byte-identical after activation. The generator suppresses only the
  admission flush timer so journal cases really exercise that recovery path; explicit flush still runs.
  Inputs and observed states are preserved. Histories stop on failure without unbounded shrinking.
- **200 generated ancestry comparisons**, seed `9282026`, vary initial text, later insert/delete and
  unrelated missing dependencies. Independent text expectations accompany the production coverage
  check; a missing-genesis document must refuse, and encoded source bytes must remain unchanged.
  A separate native case persists a dependent tail, opens/edits offline, then supplies its parent and
  verifies both the local edit and completed remote text. Test-only carrier access injects that state;
  the public Account editor's receive path refuses because no authenticated relay receiver exists yet.
- Storage quota plus an aborted forced content commit keeps the unaccepted edit out of the document
  and outgoing observations. Discard/retry recovers without admitting it. Outgoing callbacks observe
  accepted local bytes; they do not authorize relay publication.
- A pending native flush retains the permit after cancellation until its acknowledgement drains.
  Document/canonical/undo cleanup runs before permit release; stale editor and text handles refuse
  read/write/export. Pagehide closes access. A queued second editor performs no passkey ceremony until
  it owns the permit. Abort during a pending passkey likewise drains the ceremony without activation.
  A deliberately injected, correctly authenticated generation change triggers the real content fence
  and closes the Account lifetime; reopening that unsupported generation refuses.
- **Two observed bad-acceptance controls**: disabling the passkey check actually opens and edits with
  an invalid assertion; disabling ancestry verification actually opens an empty replacement after the
  encrypted source records are removed. Normal code refuses both. JSON artifacts record bad outcomes.

Refreshed regressions against the final source:

| Campaign | Passing result |
| --- | --- |
| First-epoch admission | 34 tests |
| Account handoff/startup | 21 tests |
| Writer lifetime | 13 native cases; five deliberate faults detected |
| Ordered admission | 15 native cases; six deliberate faults detected |
| Workspace commands/projection | 10 native cases; four deliberate faults detected |
| Local genesis | 17 native cases; four deliberate faults detected |
| Existing unit suite | 825 tests in 73 files, 52.21 seconds, two workers |

TypeScript, focused lint/format, isolated application build and 13 final repository/build gates pass.
Initial JavaScript is **328.3 / 350.0 kB**. Build output is at `test-results/account-editing/app-build`,
with an isolated `build-checks/dist` symlink. The personal predecessor `dist/` and verified
`.dev/releases/17d87c2/app` remain intact. This was not a full `pnpm check` invocation.

[Preserved inventory](./2026-09-10-account-editing/manifest.json) includes source hashes, logs, JUnit,
generated inputs/outcomes, controls, regressions, findings, unit/build/static output and final gates.
`runs.json` identifies original run directories. All credentials and writing in these artifacts are
disposable fixtures. The personal preview and relay remain off; no real account or factors were created.

## Findings and corrections

Initial Account composition inside shared custody introduced an unnecessary dynamic dependency cycle
that could not form the existing single-file browser test bundles. Explicit bundler options did not
resolve it. Account composition now has its own module, while shared custody exposes the small internal
carrier seam it needs. The before logs and passing smoke test are retained; no bundler override remains.

The generated editing campaign initially failed at history 2 because the base genesis fixture retained
its original creation page, while the crash helper had closed and replaced that page. The fixture now
keeps a separate creation page alive and crashes only editing pages. The seed/path/counterexample and
before/after logs are retained. This was a generator-discovered **harness defect**, not lost writing or
a protocol counterexample. The corrected 24 histories pass.

The older ordered-admission runner copied a manually enumerated flat subset of modules and could not
resolve the promotion dependency. It was stopped after repeated module-load timeouts. It now preserves
the source directory layout and copies/hashes the complete source and account-protocol trees, including
mutated copies. Its six controls again detect their intended faults. Workspace and Local genesis copied
harnesses also pass; no production guard was weakened to accommodate them.

Review tightened disposal ordering and cleanup registration during cancellation. Composed canonical and
projection destruction now run before native permit release, and failed cleanup registration destroys
the newly created canonical document. Native drain/abort tests and the shared regressions pass. The
final generators found no production counterexample; their passing result is bounded by the schedules
and state they represent.

## Next boundary and limits

Next is the encrypted outbound spool, starting with the selected S0-4 exact-byte retry and refusal
contract. Keep local content allocation separate from network position allocation, durably retain exact
message bytes before sending, and define journal-inclusive recovery so a lost reply cannot remint a
position. Signing must use the certified prepared device credential. Network envelope/acceptance and
content-blind durable service work follow that local boundary; the old plaintext relay stays off.

This phase retains one epoch/generation and serializes Account editor sessions. It provides no
authenticated incoming relay, external acceptance evidence, cross-device convergence, offline
revocation freshness, full profile-rollback/clone protection, physical power-loss guarantee, production
root distribution/restore or full platform matrix. Account rotation/clear/delete, enrollment, full
recovery and default product integration remain open. The author's actual old second device still
adopts fresh custody and the first device's writing; it does not import or merge its own old writing.
No debt or selection-matrix status changes.
