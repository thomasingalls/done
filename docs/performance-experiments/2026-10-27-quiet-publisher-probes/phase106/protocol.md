# Unchanged remote-publisher investigation, after104

## Decision and scope
Determine whether unchanged-peer reads are still repeated, which scheduling conditions require them,
and what bounded next repair can reduce them without hiding fresh remote writing. Diagnostic only:
no product/client/service runtime, old-test, rate, backoff, format or trust-boundary change. Preserve
2.5s complete-peer/16ms typing/30s delivery/600s replay/120s continuation gates for any future candidate.
Current cumulative104 tree a8a55c109d13317a35e83602ff3a6eddb5a4f027; real index stays empty. Continue
unsigned sequential105+ after104, preserving previous cumulative work. No release prep or preview update.

## Design and units
105 is secondary analysis of all eight frozen102 journeys plus exact current-source replay.102 raw
files, observer/identity and independent native audits are the measurement homes; hash/read them,
never edit them. Whole journeys are independent engineering units for descriptive ranges; repeated
requests and synthetic event histories are correlated/deterministic, not population replicates.
Classify attempts by hashed publisher and current native accepted stream counts. HTTP200 is a transport
observation, not independent validation of an empty page's signature. For forward non-overlap windows,
original stream tips are stable; classify those request targets/cursors as unchanged using native seed
and final accepted records. Separate429s and batch inner attempts from actual executed work.

Report the fixed-cursor request counts and response-to-next-request gaps. Optional fixed-timestamp
pruning sensitivity for250/500/750/1000/5000ms is a scheduling opportunity calculation only: it omits
changed wall time, verification completion and hints. Do not predict saved HTTP/native work or time.
A source replay uses the unchanged production selection function, type-erased, to confirm the cause.
Source sketches demonstrate why5s remote deferral, sliding quiet clocks, notification-only caching,
and clearing without an in-flight generation fence are insufficient. Sketches are not runtime oracles.
Mixed-publisher batches are assessed against the actual framing, service and group-verifier contracts.

## Narrow actual-client baseline probe (106)
Two fixed journeys on the exact latest103 client build (runtime exact to104) and unchanged shared
reference service/native image from101; disposable existing H6/M2/Q2 stopped fixture only. Reuse
110-file artifact; no rebuild needed. Same native1CPU/1GiB/no-swap/pids128 readonly service on isolated
localhost53781; preview8443 untouched. Chromium roots H1/H2, real persisted fixture DBs and restored
virtual test authenticators. Keep private keys/codes/profiles/DBs outside Git.

Fixed order: normal wake hints, then withhold wake hints. A common bounded notification-stream
observer preserves ready/heartbeats/headers/bytes/cancellation; the second intentionally removes only
whole exact content/hint frames. Prove observer transparency under chunk partition/cancel/error/non-
notification cases before dispatch. Counters contain closed frame names only. This is a fault probe,
not a timing candidate comparison. No service observer/CPU profiling or concurrent validators.

Open H1/H2 offline from exact seed; hold only H2 receive-read routes unavailable so H2 can publish
independently without first replaying H0. H1 goes online and starts the existing1024-position H0
backlog. Require H1 notification ready, hot read cursor>=33, then successful fixed-cursor reads of all four unchanged remote streams. Reconcile the target H2
identity from its first outgoing request after reconnect, and require its earlier quiet reply to fall
between the hot threshold and the offer. This avoids decrypting fixture credential identities offline.
Offer one short synthetic marker in H2's existing H day card and go online. Record host/renderer
clock brackets, trusted input, confirmed UI upload position, H1 direct DOM-mutation observation,
closed notification counters and hashed outgoing read metadata. Confirm marker upload within30s;
report host dispatch-to-peer latency against2500ms as one observation, not a p95 or full gate.
Renderer input-event-to-peer is secondary. Independent review intersects before/after clock-offset
brackets (including1ms host quantization) and uses the host-dispatch-to-peer upper bound. Missing or
inconsistent brackets hold the result. Keep the original600s replay deadline from H1 reconnect.
Require actual withheld wake frame in the fault case, so an unexercised fault cannot pass.

Close H2 after confirmed upload; H1 finishes all1024 old positions within600s. Removing only the
single marker from H1's whole export must equal the seed's fully caught-up archive. H1 locks and
cold reopens offline in the same profile without reinjection and exports exactly its final archive.
Independent Node/OpenSSL audit retains all seed envelope/prefix identities, permits only the expected
one new H publisher position and leaves M/Q unchanged. Hash actual worker/artifact/resource identities.
No keys/writing/body bytes in retained reports; only whitelisted counts/hashes/times/status/booleans.

## Decision and limits
Preserve every failure and all missing/censored observations. No outcome-driven additional journeys.
If the current probe already misses2500ms, investigate that before adding quiet deferral. If it passes,
choose a bounded experimental per-publisher recheck policy only after source/liveness cases pass;
future implementation still needs genuine late-peer arrival under normal/lost hints and the original
whole-client2.5s gate. Hints may force fresh work but never confer authority or override retry backoff.
Per-publisher deadlines must not slide with unrelated writing, and in-flight results must not resurrect
quiet state invalidated by a later hint/reset. First/new/conflicted/pending-self/authority/clock-reset
cases must recheck. All-idle sweep/slow repair polling stay unchanged. No production speedup/phone/
Firefox/WAN/general qualification claim from these diagnostics. Known Goals seed is5000 chars, not13k.

## Amendment after the aborted first normal journey, before corrected dispatch
The initial diagnostic stopped at an overly strong local-counter assumption: H2 UI acceptance0,
independently verified native seed acceptance1, final UI acceptance2. Independent native audit proves
all seed rows exact and exactly one new H2 position2; unrelated accounts unchanged. This is retained
as a failed/aborted primary, with no latency or journey-preservation credit, not relabeled a passing
pilot. The intended new-write invariant is exactly one new native position, not local counter delta1
when the saved client has not yet retained a previously accepted receipt.

Retain the original greater-than-local-before check. Bind the stronger final equality to the target
publisher's independently signed native seed tip plus1. The target identity comes from the actual
outgoing request; native seed tips are reverified outside the app. Include the initial0-versus1
client/service acceptance gap as a workload limitation: offer latency includes initial receipt retry
and grant bootstrap, not just quiet-peer discovery. Freeze a fresh corrected normal/withheld pair,
same app/server/fixture/resources/gates; no further primary journeys selected to obtain a win. Stop
and preserve any new failure. All failed sources/results remain in105/106 and private scratch.
