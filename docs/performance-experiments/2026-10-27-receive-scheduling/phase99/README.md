# Phase99 — Source falsifiers and the next bounded repair

No runtime patch. Turn98's observations into discriminating source replays, keep the failed bulk
reader result, and select a smaller repair whose scope preserves remote-publisher latency.

## Existing scheduler, exact source

Type-erase the actual production createReceiveSelection function, not a rewritten scheduling model.
With six eligible publishers and one1024-position backlog, put this device between two empty peers.
Hold the clock inside its recent verified-self-check window to isolate ordering from expiry. It
still checks itself256 times before delivery, versus once when the same device immediately follows
the productive stream. Both orders keep257 productive HTTP-like selections and256 checks for each
other quiet stream. The real trace includes257 self checks: it also observes a final idle sweep
before Playwright's polling assertion notices completion. The initial diagnostic expected257 in
the delivery-only model and fails; retain it, correct that expectation to256, and do not fit a wall
speedup from the synthetic count. The model grants no page, storage or authorization evidence.

The reason is specific: completed(empty peer) sets productive=false. skipOwn accepts the existing
recent verified check only when the immediately previous publisher is own or productive. An unrelated
empty peer can therefore defeat a check that is still fresh. This does not prove the broader peer
polling policy is wrong; every other publisher must still have prompt opportunities for new work.

Type-erase the unchanged createSyncScheduler too, then give it49 unknown results separated by real
progress under a deterministic clock. Every failure resets to the first1000ms retry delay; remote
hints do not override it. Total scheduled wait is49000ms. This reproduces the floor seen after49
native capacity refusals (~49.437s inter-read gaps); it does not reclassify generic unknowns as capacity
without the separate native trace. Exercise the real ScopedRequestBudget: four signed inner reads
consume four units, failed atomic top-up keeps admission charge, and one depleted key refills at the
unchanged16 work units/s. Domain authorization is not exercised by that internal budget test.

## Previous evidence retained

[The bulk custody experiment](../../2026-10-12-bulk-custody/README.md) already failed its adoption
threshold, and [earlier live-sync attribution](../../2026-10-21-live-sync-attribution/README.md)
identified similar byte-comparison/cursor samples.98's profile supplies no reason to enable that
opt-in reader or repeat its eight runs now. Fresh complete inventory/authentication/commit checks
remain required. The exact native capacity subcondition is not directly instrumented; per-session
work exhaustion is the leading explanation in this isolated case, not a measured safe capacity.

All31 unchanged selection/sync-scheduler tests and22 unchanged budget/HTTP-batch cases pass. The first
budget invocation passes14 and blocks8 at sandbox listen EPERM, before their assertions; rerun all22
with loopback access, retaining both logs. All905 old test/helper files and runtime inputs remain
byte-exact to97. Neither diagnostic replay is credited as a new qualified test case. All912 existing
obligations/367 unresolved blocks remain; no release qualification resumes.

## Next bounded implementation contract

Fix publisher-order dependence of **existing self-read suppression first**, rather than introducing
new delays for every other device. Use current authenticated retained peer cursors to supply an
ephemeral backlog scheduling hint. Keep the recent verified self-check, expiry/clock-rollback and
reset/credential-binding checks; current unresolved self-submission must always bypass suppression.
The hint cannot advance progress, accept a reply, extend a grant or replace any fresh state check.
Keep every non-self publisher's original turn/order and the four-page useful turn, all proof/page/
witness/current-authority/commit checks, byte bounds, rate/burst/concurrency policy and failure backoff.

Before implementation, falsify all publisher orders with backlogged/idle/removed peers, pending self,
wrong credential, failed/unverified self check, clock expiry/rollback and authority reset. Exercise
the actual composed receiver too, then rebuild candidate and compare restored whole journeys with
editing under the original16ms local/2.5s complete peer/30s delivery/600s replay/120s continuation.
Require no remote discovery or undo/durability regression; keep every outcome. Do not infer a win from
reduced request count alone. Any broader quiet-peer deferral is separate: define notification and
fallback discovery latency before it can alter new work's path. No interval/product choice is made here.

Prepared98/99 are sequential unsigned diagnostic patches after97. No implementation, old-test edit,
policy change, signing, push, preview restart, release preparation or deployment in this series.
