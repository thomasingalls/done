# Phase74 — persistent local-maintenance status and retry

2026-10-26 · follows frozen73 `3cb6a7cbe0bab0933285439771b6a4f75af5e2c4`.

## Behavior and product choices

Ordinary deferrals remain quiet. Capacity, unavailable history and ineligible history show a local
explanation and Check again in Data. Its collapsed summary carries “Maintenance paused”; it does
not force open or shift the editor. Capacity copy preserves the distinction between technical history
and the user's writing, with no suggestion to delete notes. Pending retry is disabled/labelled queued.
Storage or verification halt says lock/reopen and offers no retry or data-erasure action.

A narrow optional DeviceRoster port publishes stable frozen snapshots, contains observer exceptions,
and schedules the same removal owner. Explicit retry clears a parked hint only; it retains the
threshold, quiet window, one-flight gate, cooldown/backoff and all current proof/mutation checks.
It cannot clear a halted or closed owner. No counters, writing, key or evidence crosses the port.
Status is ephemeral. Abort publishes close once and detaches observers; startup/storage UI still owns
closed-workspace failures. Service snapshot/pruning remains separately labelled and controlled.

## Evidence

25 units/components pass: all16 prior scheduler cases plus four new status/retry cases and five UI
cases. They cover stable snapshots, subscriber cleanup/throwing observers, retry through the same
revision and backoff, disabled/closed/halted states, quiet transient outcomes, all three persistent
refusals, queued/running/success presentation, collapsed summary semantics and absence of unsafe retry.
The two existing disposable native cases pass: actual removal/undo/redo/cold reopen and disabled/
close cancellation. A focused native rerun adds assertions that the real composed DeviceRoster port
exists and publishes running; every previous assertion and deadline remains. This is integration
validation, not another historical depth/phone-performance campaign.

TypeScript, focused lint/format and default build pass. Reviewed census/planning readback, independent
conservation and final prerequisites/traceability are retained with their raw logs. Conversion remains
disabled in the default build. This phase does not touch personal profiles, preview8443, production,
the real Git index or sealed61–73. It is an unsigned sequential patch.
