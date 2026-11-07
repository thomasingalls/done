# Phase185 — bounded public session and UI ports

2026-10-29. Subscribe to the original Worker login, sync and local/service-maintenance status.
Send at most one status request plus one coalesced latest snapshot, with monotone sequence IDs,
closed bounded fields and stable immutable Window caches. Only public labels/counts/timestamps
cross; no credential, proof, journal, writing, diagnostic event history or arbitrary method invocation.
Status is presentation, never durability or permission. Explicit commands invoke the original login,
retry, verified roster, remove and history operations with live checks before and after awaits.
Original authoritative operations/queues/crypto remain byte-identical. UI type-only widening emits
identical JavaScript; local retry dispatch returns no invented synchronous success result. Service
history automation stays off. Terminal remove outcomes still need their own retirement-safe port.

Ten added controlled cases cover coalescing, capture, accessor/replay/capability refusal, immutable
React snapshots, original action dispatch, close/late result and failed delivery.33 affected unit cases,
98 metadata, types, lint, format and independent boundary audit pass.443 runtime sources/198 domain
homes; all old obligations/blocks retained; one new test source required/uncredited. No full-unit run
in this phase;182's full unit result is prior-source evidence, not current acceptance.

The first native run caught a new bridge defect: integer-only timestamp validation refused the
original scheduler's fractional idle-recheck jitter and retired the channel. Two native cases failed,
three passed. The added regression calls the ORIGINAL idleReceiveInterval and fails before the fix.
Repair only the bridge timestamp predicate to finite, bounded, nonnegative numeric times; counters
remain integers. Original scheduling, deadlines, jitter, backoff and authority checks do not change.
Afterward all five selected actual Worker cases pass: primary/joined publication with synchronous
Window sealed input; native context/journal-era conversion; native retirement; public UI ports reading
original verified roster/login, retries, sign-out and exact original Page cold reopening, one passkey.
Preserve both runs, preimage and build identities. Native cases are functional, not timing acceptance.
Final source maps match actual source bytes. Ten owned containers absent. No real profiles/factors,
computer use, staging/signing/push, preview8443, release preparation or deployment.

Continue independent passkey cancellation, fresh configuration hints, retirement-safe terminal UI,
resumable preparation, Local/ceremony lifetimes and default/offline integration. Default app remains
Page; conversion incomplete. Phase182's joined deep-backlog30s result remains open. Only after full
functional conversion measure unchanged16ms input/2.5s peer/all-marker/30s delivery gates.
