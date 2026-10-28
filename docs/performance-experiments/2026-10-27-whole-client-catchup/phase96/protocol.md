# Phase96 — Whole-client catch-up comparison (prospective)

Development only; no release prep, signing, push or deployment. Reference R is cumulative93 tree
a1ad3e3a81563a049e1d4b65aaff91dabe6516ba; candidate C is95 tree
761f4f9669b8208bcea1d5263a53d50047bb6adb. Rebuild both clients, same compiler/dependencies/options/
version/date; batch coordinated-2000, baseline read/install/retention/automatic1. Latest unchanged
server sources C shared by both variants. Difference under test: accountReceive/inboundLedger
read-only projection, not server caches or authority relaxation.

## Decision and units

Test whether the previously demonstrated reduced copying improves whole browser catch-up without
regressing live editing or exact preservation. Target here is the fixed native Chromium desktop lab,
not the actual Android opening delay. A complete restored journey is the analysis unit. Individual
keys are correlated observations within it, not independent replicates. Finite engineering crossover
R,C,C,R brackets temporal drift; two journeys per arm are descriptive evidence, insufficient for
population effects or statistical significance claims. Do not add repetitions based on a desired
outcome. Fixture/harness pilots occur before freezing and are not acceptance observations.

## Fixture and resource envelope

Old /tmp private fixture has expired. Recreate fresh disposable accounts using production UI,
virtual WebAuthn and genuine device-owned encrypted publications. Account H:6 devices,1024 backlog
positions and24 planning cards/~13k Goals characters. M:2 devices,256 positions,12 cards/~4k Goals.
Q:2 devices,32 positions,6 cards/~1k Goals; quiet peers caught up before export. Each run restores
the same stopped service DB and all device browser snapshots. Initial injection is disclosed; cold
reopen guards reuse the real profile without reinjection. No production data/provider/key/profile.
Service native Linux1CPU/1GiB/zero swap/pids128, readonly root, no extra capabilities. Same localhost
origin53781 and current production admission/rate bounds. Four browser roots/10 device contexts.
Both client artifacts and the shared source/image/apparatus/fixture receive immutable identity hashes.
Verify first-run installed worker belongs to selected rebuilt client, not an earlier cached build.

## Measured workload and guardrails

Six stale H1..H5/M1 receivers reconnect together while Q0 receives120 trusted focused visible keys,
500ms apart. Capture complete local/peer rendering times, request timing/refusals, catch-up completion,
service CPU/RSS/cgroup and event loop. Retain original gates unchanged: local p95<=16ms; complete
peer p95<=2500ms, all120 by30s after typing; all6 replays<=600s; automatic original/pending convergence
<=120s after load clears/reconnect. Missing keys are censored failures, never a subset pass. Long
background replay does not extend the original live deadline. Preserve every failed attempt/log.

Retain exact full Markdown equality, encrypted retained-delivery prefix identity, pending offline
writing across lock/cold profile reopen without reinjection, reverse edits, undo/redo, offline peer
cold reopen and cross-account isolation. Independently verify stored envelope/ciphertext/wrapper/
accepted-head signatures and contiguous prefixes with native Node/OpenSSL; all seed records remain
byte-exact and background accounts receive no new writing. Authority, fresh ledger/witness, signer,
nonce, conflict, authorization and commit checks remain production-owned and unchanged.

Also exercise non-overlapping H sessions in both directions: original sender's genuine upload is
already accepted and service-restored; only stale H1 opens and catches up, with every sender closed.
Then H1 confirms another real accepted edit, locks/closes, and only H0 opens to receive it. Report
unlock-to-edit and total catch-up separately from realtime2.5s gate; bulk1024 replay is not claimed
to be a per-key realtime latency observation. Check exact exports and cold persistence in each arm.

## Analysis, error model and stop rules

Freeze artifacts/apparatus after fixture preflight; run serial R,C,C,R heavy journeys and the same
order non-overlap journeys. Report every journey's original gates, quantiles, completion times,
resource/refusal totals and paired descriptive changes; do not silently discard instability. Clock
brackets bound host/renderer timestamp alignment. Reconstruct quantiles/gates independently from
raw event/length timelines, validate focus/trust/visibility and profile/source/resource identities.
Hold acceptance for any data/security guard failure or candidate threshold miss. Small or noisy
changes mean no whole-client speedup established. Automatic retention can change effective retained
history: record it, do not suppress it merely to magnify the optimized component. No CPU emulation,
real-phone/native-typing or full qualification claim follows from this lab.
