# Phase245 — correct civil-date fixture and failure-safe diagnostic collection

2026-10-30 Europe/Paris, still Oct29 UTC. Phase244 failed trajectory remains invalid/failed.
New separately identified diagnostic only: same exact marker-dist/source edits/build and fixed
current server/workload/flags/limits, fresh state/profiles, no concurrent heavy work, no retries.
Use timezoneId UTC for both initial and cold contexts: effective today Oct29 as in all four matched
valid runs, fixture Oct27 remains editable. Date.now, monotonic clocks, proof expiry and server time
are real. Abort preflight if UTCdate is no longer Oct29. No freeze policy override or source change.

Retain every original assertion/deadline. Add freeze=false and editing=true guards BEFORE every
marker attempt, rather than counting keyboard delivery as admission. Collector runs after original
new-delivery assertion AND in finally on failure, copying only original allowlisted events/counters
and Boolean card state/civil date/timezone. Add actual Worker/driver clock brackets after measured
work; no assumed cross-realm clock equality. No writing, credentials or proofs in these additions.

Verify diagnostic source/assets unchanged, actual source-map/reverse QA remains valid. Record this
new harness diff and exact run identity. This repairs an apparatus limitation, not a favorable retry
of a completed performance journey. Trace/guards/locale may affect timing, so no acceptance credit.
If it fails, retain the assertion and captured events; do not extend30s or erase the original failure.
All gates and security guarantees unchanged. No release prep, preview8443, phone or deployment.
