# Phase170 — bounded advisory activity and worker-aware lifecycle consumers

2026-10-29. One in-flight activity call plus a bounded latest sample for each kind/state pair replaces
per-event RPC. Repeated input cannot consume the channel's seven other credits. Retained samples drain
in observed order, ending with the latest actual Window state. Snapshot data are detached; close,
abort or failure clears queued work and late replies cannot revive it. No polling/timer, shared
memory or lock override. Activity is advisory, never native mutation or verification permission.

Existing Account sync, receive, maintenance and notification listeners now consume the fixed runtime
ports, with owned cleanup. Page behavior and scheduler retry/publication timing are unchanged; Node
without document/listeners stays inert and visible. An installed worker receives forwarded Window
activity instead of consulting nonexistent document globals. Final Window FIFO/native checks remain
required for effects; delayed activity cannot replace them. Service automation remains disabled.

The preserved original per-event handler fills eight real MessagePort request credits and refuses92
of100 rapid events. The replacement handles10,000 events with one outstanding call, preserves
hidden/offline/resume ordering, leaves seven owner credits, and detects transport failure. Eight new
unit cases plus focused old sync/maintenance/notification cases pass (80total).28 native Chromium/
Firefox cases pass, including a busy worker accepting unrelated native journal work during the
coalesced burst.98 metadata cases and six unchanged notification-server regressions pass. Type/lint
checks pass. Initial direct Node strip-only loading of a parameter property and sandbox EPERM on
loopback listeners are retained; explicit transform-types and authorized disposable loopback checks
succeed. Those initial failures are tooling results, not application defects.

Full unit outcome is recorded in170-unit-full.log.gz and checked by review.py.430 runtime sources
retain198 domain labels/owners; only construction source-line references move. All previous
qualification rows remain identical; the new test is required/uncredited:947 obligations/401
unresolved. No performance gate was measured or changed. Default app is still on the page: actual
worker-owned receive/admission/maintenance and ceremony integration remain next. Prior long combined
journal observer timeouts stay unresolved. No preview, real staging/signing/push or release work.
