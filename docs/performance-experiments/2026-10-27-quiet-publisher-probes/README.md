# Unchanged-publisher discovery — 2026-10-27

[105: reused observations, source cases and prospective probe](phase105/README.md) →
[106: failed counter guard and independent fixture basis](phase106/README.md) →
[107: interrupted needle wait and cold diagnosis](phase107/README.md) →
[108: guarded outcomes, corrected counter interpretation and next repair](phase108/README.md).

Four currently certified idle peers still get roughly1024 repeated checks per1024-change catch-up.
Two narrow late-peer baseline writes arrive in about0.9–1.1s, including a genuinely withheld wake
frame. These are individual observations, not p95 or candidate speedup evidence. Recommend an
experimental750ms per-publisher recheck budget with expiry/invalidation/generation fences and full
future gate validation. No runtime or old-test change, release prep or deployment.
