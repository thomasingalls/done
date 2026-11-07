# Phase 524 — Undo diagnostic precondition hold and saved traffic trace

**Date:** 2026-11-07. Outside Stage 5, with zero gate credit. The operator requested one bounded A/B diagnostic before any fix or spec change. The six standalone tries were declared on plain510; the first completed the522desktop prelude through return`!`, including the original20second post-return wait, but never met literalCaseA. No Mod-z or Redo was pressed. Remaining tries are held for the operator’s choice, not treated as passes or failures of Undo.

No app, frozen spec, assertion, wait, gate, deadline, budget, limit or format changed. This is not a Goals gate rerun. The new standalone driver reads only public admission status/undo counters, preserves input/prelude waits, and adds a passive keydown observer plus the requested10ms/10second text polling tail. That tail was not reached. There is no profiler, trust shortcut, forced maintenance or artificially held queue.

## Literal busy trigger is unavailable on this Account Window path

A1 waited120seconds for the public Window admission status to have `maintenance === 'running'` after the original return settling wait. It never did. Across1772public status observations, maintenance was always absent; `pendingItems` reached2, with40positive-pending observations after return+20seconds. The final public snapshot was active/durable, pending0, with both `snapshot.undo` and `workspace.read().undo` equal781, redo0, and Undo enabled by snapshot. Focus remained in Goals. This is a failed trigger precondition, not a10second Undo nonresponse, and not a lost-history finding.

The source confirms the distinction. `windowAccountMirror.ts` creates its Window admission carrier without `compactContent`; `admissionQueue.ts` returns from `scheduleMaintenance` when that port is absent. Only the discretionary content-compaction branch can assign public admission `maintenance = 'running'`. Worker automatic local-history status (`sessionStatus.local.phase = 'running'`) is a different public presentation and is not substituted. This is why the literalCaseA cannot be manufactured by waiting longer on the plain Account Window mirror.

The opening question also mentions `pendingItems > 0`; the case instructions specifically name maintenance`running`. An asynchronous clarification asks whether to use positive pending items for the busy arm or stop. Neither condition nor diagnostic recipe is silently changed. The original attempt, declaration, helper bytes, profile, status transitions, host/windowed power logs and timeout remain intact.

No(a), (b) or(c) conclusion about a Mod-z press is supported yet. The positive undo depth at the end of this unpressed attempt establishes only that history was present there. It says nothing about eventual Undo under load. No app or test repair starts under this hold.

## Saved-only read of522r1/r2 traffic

No new measurement or tracing build was used for this subquestion. The sources are the immutable522result files, frozen source, and read-only SQL queries on private copies of the saved fictional service databases. Original database bytes are untouched. No credential, plaintext writing or new authority is needed.

| Saved run | Submit after resume | Browser result / duration | Next non-submit request after resume | Previous receive end → next request |
|---|---:|---|---:|---:|
| r1-goals-desktop | +552.272ms | 200 /19.961ms | membership at+3994.316ms |17045.083ms |
| r2-goals-desktop | +640.490ms | net::ERR_ABORTED /22.939ms | membership at+16149.358ms |19538.119ms |

The previous read ends at resume−13050.768ms inr1 and resume−3388.761ms inr2. `idleReceiveInterval` uses15000+Math.random()*5000ms while the notification stream is healthy, and5000ms otherwise. Thus both observed round-to-round gaps fit the existing healthy-stream15–20second cadence; the large difference when measured from resume is consistent with a different phase of that existing clock plus jitter. It is not proof of a new16second backoff starting at the aborted submit. Saved records lack the scheduler due times and per-operation completion boundaries, so this is a consistency argument, not a causal proof excluding queued/storage work.

The service metrics report only200responses (286r1,288r2). The saved H2publisher ledger has58accepted positions and no refused rows in each run, starting from fixtureposition1; each browser records57submit calls. This supports caution about interpreting browser`ERR_ABORTED` as a lost submission. The old recorder has no request-body/response digest pairing or complete in-flight ledger, so aggregate counts alone do not byte-bind the particular aborted call to an accepted row or prove client receipt verification.

The exact cancellation source of the22.939ms fetch remains **unobservable in the saved records**. Source paths include parent/lifetime/login cancellation,10second transport deadlines and bounded response/body cancellation. A browser loading-failed string alone identifies none of these. The records do not preserve abort reason, initiator stack, response headers/body or scheduler status at that operation. The10second/15second configured timeouts cannot simply be relabelled as a23ms timeout measured from HTTP start; any earlier deadline/auth wait would need evidence. No claim of a server refusal, permanent owner close, throttling, harmless browser artifact or known cancellation cause is made.

## Stop pending the trigger decision

The six-case diagnostic has not been completed and earns no acceptance credit. The Stage5matrix remains as523recorded it:21carried,11passing reruns,1failed Undo guard,3unrun. No Goals retry or release work started. The existing post-reduction typing-cost debt remains.

Sequential documentation patch524 records this apparatus precondition and the read-only traffic findings. The operator’s trigger choice is required before another diagnostic app run. The real index remains empty; no push, publication or deployment.
