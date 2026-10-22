# Phase 19: read conflicts and publication/retry pacing

Prospective diagnostic protocol, written before instrumentation or running the app.

Decision: identify the returned read 409 predicates and separate writer publication, reader verification/application, and scheduler waiting. Base is cumulative patch 18 (held); no runtime repair is presumed.

Units: complete diagnostic journeys, with correlated HTTP requests and scheduler passes nested within them. No per-request independence or population inference. Two fixed runs of the existing seeded H6/M2/Q2 workload, 120 trusted writer keystrokes at 500ms, original 30s peer-delivery deadline. Stop competing load at 90s after input starts, whether or not delivery completes; this is a diagnostic censoring boundary, not a replacement for the 600s backlog gate. Then observe original-writing convergence for the existing 120s continuation bound.

Instrumentation: a fresh copy of exact cumulative-18 server/client inputs; append-only closed-label events, positions, predicate booleans, byte counts and SHA256 identities. No keys, codes, request bodies, content, tokens or personal browser access. Client compilation uses coordinated-2000 and otherwise the original flags. Record all transforms/source identities. Diagnostic clocks and instrumented timings establish ordering/mechanisms, not a performance acceptance comparison. Existing phase-18 measured results stay authoritative.

Falsifiers: (1) a four-attempt state-changed read must have four failed native guards, with attributable predicate(s); otherwise do not claim its cause. (2) a retry delay must match scheduler completion/due/begin timestamps, not the gap between HTTP starts. (3) publication delay requires writer input-to-submission and completion timestamps, and receive delay requires peer request/apply timestamps; no assumption that a few 409s explain the entire tail. (4) if the diagnostic observer drops events or mismatches source/HTTP identities, retain the run and limit its claims.

Security invariants: no authority, session, grant, scope, lifetime, ledger, proof, ownership, snapshot, expiry or quarantine check changes. Native guard return values and four-attempt retry cap unchanged. Admission limits16/64 and original16ms/2500ms performance gates unchanged. Temporary source changes are diagnostic copies only.

Exit: reproducible causal trace or explicitly bounded unresolved result; sensitive evidence review, independent reconstruction of traced outcomes, sensitivity checks of the observer/analysis, next repair contract, sequential patch19 with no application-runtime changes unless separately justified. Preserve failed runs. No signing/staging/push, preview8443 change, merge, deployment or general qualification.
