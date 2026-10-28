# Phase97 — Whole-client comparison: gates pass, speedup not established

Both complete clients were rebuilt in96. All eight frozen journeys finish: R,C,C,R heavy/editing and
R,C,C,R non-overlapping sessions. Same stopped encrypted seed, same current server/policy,110 assets
per client and distinct selected-worker hashes. Four browser roots/ten devices in the heavy case;
server native Linux1CPU/1GiB/zero-swap/pids128. No actual account/profile/phone/provider was accessed.

| Whole journey metric | Reference R (two runs) | Candidate C (two runs) | Original gate |
|---|---:|---:|---:|
| Local typing p95 |4.4,4.8ms|5.0,5.5ms|16ms|
| Complete120-key peer p95 |0.711,0.761s|0.767,0.746s|2.5s|
| Slowest competing backlog replay |227.656,212.955s|219.875,222.621s|600s|
| Non-overlap1024-position catch-up |144.291,145.285s|145.330,145.286s|Reported separately|
| Reverse fresh edit after writer closes |0.821,0.819s|0.821,0.815s|Continuation/preservation|

All four heavy runs retain16ms local/2.5s complete peer/30s final delivery/600s replay/120s automatic
continuation, without missing observations/subset credit. Every120-key series is complete and trusted,
focused and visible. Reference peer drift is7.1%; reference maximum-replay drift is-6.5%. Medians show
candidate peer+2.7%, maximum replay+0.4%, non-overlap replay+0.36%; local p95 is+.65ms. These tiny,
finite desktop comparisons establish **no whole-client speedup**, and do not justify a population
regression claim either. Keep the higher observed local values visible. Do not promote94's clear
copy-component improvement as an end-to-end win. Two journeys per arm/workload are units; keys are
correlated observations. [Complete descriptive result and limitations](whole-summary.json).

## Preservation and independent checks

Every exact full Markdown export, pending sealed-record prefix, same-profile offline cold reopen
without reinjection, original/pending automatic convergence, reverse edit, undo/redo, final offline
peer reopen and cross-account isolation check passes. All other devices are closed before each
non-overlap receiver opens; the reverse writer confirms genuine acceptance before closing. Native
Node/OpenSSL independently verifies envelope/ciphertext/wrapper/accepted-head signatures and complete
prefixes. Every seed row remains byte-exact. Heavy runs add124 accepted Q positions each; non-overlap
runs add one H position each; unrelated accounts are unchanged. No authority/history/nonce/witness/
commit/policy/format check was removed. Device cold opens are desktop lab results, not phone attribution.

Raw-time reconstruction independently agrees with all gates and profile/source/resource identities.
Delaying the peer series3000ms fails the unchanged2.5s gate; missing peers cannot gain complete-series
credit; a false retained-record guard is rejected by the independent reviewer. A real nonce change
in a disposable DB copy fails independent envelope-signature verification. The measured databases
and frozen apparatus remain untouched. All raw successful journeys, failures from96 and fault receipts
are retained; private keys/profiles/tickets/DBs remain outside Git. Known-secret-value scan accompanies
the final checkpoint. Thirteen ordinary source/static checks pass; runtime/tests/inventory remain
byte-exact to95, including every old qualification block. Generalized qualification stays paused.

## Limits and next bounded question

The old seed requested roughly13k Goals characters but exported5000 before leaving for invitation;
M/Q export4157/1049. Both arms use that exact fixture. The1024/256/32 accepted backlogs and24/12/6
planning-card requests are verified, but the claimed13k Goals workload was not established. Seed
paste/admission readiness needs its own check; this does not establish application data loss. No
fixture was changed after outcomes appeared. A small Git metadata review overlaps late C2 bulk
replay after typing; no builds or test suites overlap measurement. Preserve these limits.

H1 issues1544–1548 read HTTP requests while catching1024 positions (about1288–1292 single plus256–257
grouped requests), all200. This stable large request mix is the next trace candidate: distinguish
unchanged-publisher probes, grouped-read cadence, response verification/application and fresh-state
checks before choosing another repair. Counts alone do not classify responses or isolate CPU; neither
network throttling nor idle-publisher causation is established here. Keep every original gate/security
boundary. The service consumes211–224CPU seconds over each whole heavy journey, which includes guards;
it is supporting context, not a measured decomposition of client versus service time.

No new runtime repair, old-test change, staged/signed commit, push, release preparation or deployment.
Preview8443 remains on frozen92 UX.96/97 are sequential unsigned patch artifacts after95.
