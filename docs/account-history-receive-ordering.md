# History maintenance and prepared receive ordering — 2026-10-13

Base: signed `f75a19e7`, [budgeted retention preparation](./account-local-retention-preparation-tasks.md).
This is a focused correctness repair. Retention is still private; release validation is still paused.

## Reproduced mechanism

The preceding checkpoint/repeated-cut/cold-open journey once returned the joined device to the
account chooser during a history inspection. Five subsequent runs passed without a repair. Three
additional diagnostic repetitions in this phase also passed. Those passes did not resolve the failure.

A controlled interleaving now reproduces that symptom on the signed base:

1. A prepared receive finishes storage/readback and captures its final-application context. Even an
   empty response stages an empty handoff and retains that context until application completes.
2. `devices.history()` enters the serialized storage tail before final application. History maintenance
   refreshes the live custody references in `finally`, including after an inspection with no mutation.
3. The receive's complete final check detects that its captured context has been superseded and
   refuses with `ReceiveAuthorityChanged` / `receive-refused`.
4. Admission closes an owner whose staged receive did not complete application. The joined-device UI
   then returns to the chooser. That refusal/closure is the intended safe response to a stale context;
   the defect is allowing ordinary history inspection to produce that context change mid-handoff.

The retained diagnostic records **zero** update frames, the stale-context refusal, and the closed
owner at `/accounts`. This establishes a real ordering defect matching the earlier symptom. The
original failure lacks that trace, so its exact cause cannot retrospectively be proved. The defect
is in history/receive composition, not the baseline byte format or the new budget-yield algorithm.

## Repair and boundaries

The workspace-facing history operation first waits for `workspace.whenDurable()` **outside** the
storage tail and admission FIFO. Existing prepared receives can finish; local input retains its
normal journal-before-apply path while waiting. History's asynchronous network/verification work is
not placed in the input FIFO.

That wait alone has a race: another receive can finish staging before history reaches storage.
Immediately after the complete current-authority check, the history storage task therefore refuses
if `pendingPromotions` is nonzero. It does so **before any history effect or custody refresh**. A
private `HistoryReceivePending` error tells the outer helper to drain again, with at most three
attempts. Another receive cannot stage during the serialized history task. If it runs later, it
captures the refreshed custody context.

Only this explicitly pre-effect refusal retries automatically. Drain failures, changed authority,
storage failures and ambiguous history mutation results propagate unchanged. Repeated contention
returns a retryable maintenance error rather than claiming success or starving indefinitely. The
existing device transition getter remains live through the workspace wrapper.

Complete fresh authority checks, final-application invalidation, staged-suffix failure handling,
journal/activity/era fences, baseline deletion proofs, native atomic exchange and readback remain.
The repair neither publishes partially verified state nor accepts a stale context. It replaces no
document or UndoManager and changes no storage, receipt or service format.

## Focused evidence

The [evidence manifest](./development-evidence/2026-10-13-history-receive-ordering/manifest.json)
records source hashes, diagnostic source, before/after logs and the deliberately failing control.

The packaged checkpoint regression forces three interleavings after reduced-history cold reopening:

- an empty receive held before final application;
- a content receive held there while a local edit remains possible, then history inspection, local
  undo/redo and continued remote delivery;
- a receive staged after history's initial drain, requiring the storage-tail guard and a second drain.

The test retains the existing checkpoint, exact cut, cold reopen and owner-active assertions. Its
hooks exist only in the test bundle; no runtime global or bypass grants authority. Omitting just
the storage-tail guard (`HISTORY_HANDOFF_CONTROL=omit-pending-check`) passes the first two cases but
fails the third: only one drain occurs instead of two. The pre-repair held-receive diagnostic
independently demonstrates the eventual stale-context refusal and owner closure.

Final checks pass: **71 unit tests**, **seven native receive controls**, **three reduced-history
lifecycle/checkpoint journeys**, and **two ordinary packaged history journeys** (lost publication
reply, interrupted installation, repeated snapshots and continued two-way editing). The native
controls retain complete fresh-authority refusal, read/clear invalidation, renderer-death replay of
undisplayed receipts with later journalled input, and undo/redo. TypeScript, scoped lint/format,
ordinary build, Yjs patch, origin isolation and the **138.3 kB / 350 kB** initial-JS budget also pass.

The first repaired packaged attempt stopped during test-bundle construction because a literal probe
anchor included indentation; no browser journey ran. The anchor was corrected without weakening
any product assertion or increasing a timeout. An extra passing repetition used the omission
environment variable before the omission transform had been installed; it is retained as an
ordinary repaired repetition, **not** counted as a negative control.

This is not performance evidence or exhaustive lifecycle qualification. Public trigger/cadence,
capacity behavior, reader-first publication/rollback and current-device measurements remain separate.
No deployment or personal browser storage was changed.
