# Private automatic local retention — 2026-10-26

This slice adds a scheduler to the existing composed Account removal owner. It does not enable
conversion in the public app. The compatible reader remains on; installer, retention writer and
new `VITE_ACCOUNT_RETENTION_AUTO` policy flags all default off. All four flags must be on to schedule
an attempt. There is no new server protocol, durable format, migration or user action here.

## Evidence reused

The [history-depth study](performance-experiments/2026-10-13-retention-depth/README.md) already establishes
that retained local protocol history can dominate opening: its 1,201-position fixture improved from
3.594s to 0.141s after reduction. That is historical fixture evidence, not a diagnosis of the operator's
current account. [Preparation scheduling](account-local-retention-handoff.md),
[bounded evidence reuse](account-local-retention-evidence-reuse.md), and the later
[preparation-task repair](account-local-retention-preparation-tasks.md) already address the remaining
known preparation stalls. The last comparison reported CPU-4x maximum tasks of 483ms versus 97ms,
with no >=50ms task in its three desktop candidates. Do not repeat those repairs or depth sweeps.
These figures select the next work; they do not predict performance on today's account or phone.

The earlier preparation-task packet retains an unexplained lifecycle failure followed by five passing
reruns. [Receive/history ordering](account-history-receive-ordering.md) subsequently repairs a reproduced
handoff race; a causal link to that earlier failure was not established. Neither result is erased here.

## Policy and ownership

The growth hint is just a revision and physical ledger-record count from the existing successful
owner validation. No additional scan, decryption, dry run or request is performed to collect it.
Authority invalidation or failed/interrupted validation clears it. A baseline's physical suffix count
is used after conversion, so a large retained document alone does not trigger repeated reductions.
Hints are unavailable to transport/application callers and never authorize a cut.

The initial private policy tries at 1,024 records after 10 seconds of quiet, only when visible,
admission is active/durable with no pending items or pressure, and the owner is live. Browser input,
pointer activity, visibility, accepted workspace changes and admission-status events reset quiet.
Offline local maintenance is allowed: network reachability is not a deletion proof or prerequisite.
There is at most one scheduled timer and one attempt. Successful removal has a 30-minute cooldown;
new growth must still reach the threshold. These are conservative starting values, not measured optima.

A skipped attempt backs off at least one minute and requires another event to retry. Capacity,
ineligible and history-required refusals park the unchanged revision/count until the hint changes.
No unchanged refusal is periodically replanned. Unexpected results or owner errors halt automatic
attempts for that owner lifetime. Abort clears the timer immediately; release detaches subscriptions
and DOM listeners. Retry/cooldown state is ephemeral, so reopening can revisit a refusal. There is
no public capacity/refusal UI in this private slice; that and activation remain separate work.

## Security and scope

Scheduling invokes the exact existing `removeLocalHistory(expectedRevision)` method. Preparation
stays outside admission. Current custody/authority, outstanding receive/promotion, durable attempts,
journal/activity, independent replay, complete inventory equality, allocation burns, authenticated
readback, absolute cuts and the strict atomic exchange stay in the owner. Activity can interrupt
preparation; uncertain mutation still closes the owner. The scheduler cannot accept, weaken, or
replace any verification. Existing reader and journal-era fences remain. Live Y.Doc/UndoManager and
visible Goals/day writing remain; covered operational history is reduced, not old writing by age.

This is local ledger maintenance. Automatic server checkpoints/admission/pruning, retention of
user-visible history, shrinking live CRDT content, product rollout and real-profile conversion are
separate decisions. The two retained server snapshot and multi-device admission rules are unchanged.
Current account slowness is still an observation, not an attributed production incident.

## Focused evidence

See [phase73](development-evidence/2026-10-26-automatic-local-retention/phase73/README.md). Deterministic
policy regressions cover gates, actual thresholds, quiet/retry/cooldown, fresh hints, refusals and
abort/error behavior. Disposable native IndexedDB tests exercise actual removal, undo/redo, cold reopen,
disabled policy and release cancellation. Their threshold-only probe avoids fabricating a large
history; they keep the actual ten-second quiet interval and every verification/mutation boundary.
This is new integration evidence, not another performance campaign or general release qualification.

## Follow-up74–75 — status and explicit release activation

The initial private implementation above is extended by [status/retry74](development-evidence/2026-10-26-automatic-local-retention/phase74/README.md)
and the [activation/rollback runbook](./account-local-retention-activation.md). Persistent refusals are
now surfaced under Data; explicit Check again may revisit an unchanged parked hint, preserving quiet,
retry delay and all owner checks. It cannot clear a halt. Ordinary deferrals stay quiet.

A single explicit automatic release build opt-in now defaults all required capabilities together,
while refusing contradictory zero overrides. Runtime still requires all four flags. Ordinary builds
remain reader-only; the selected activated release is automatic for users. Compatible rollback stops
future scheduling as clients adopt it, retaining reduced data and editing. The original evidence,
failures, format/proof boundaries and remaining production-account attribution limits stand.


## Follow-up2026-10-27 — visible progress and bounded diagnostics

[Phase124](performance-experiments/2026-10-27-maintenance-continuation/phase124/README.md) adds
fixed-label stage/count progress from the actual owner, an indeterminate/record-subphase sidebar
indicator, and bounded lifetime-local attempts/interruption/completion diagnostics. These facts
never authorize a cut or survive a new owner. Reporting errors and stale callbacks cannot alter
verification/storage. All scheduling and refusal policy above remains.
