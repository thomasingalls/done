# Account sync liveness: measurement and repair contract

Baseline: signed `1372c39`. F-07/N-01/N-02/P-01, with N-03/P-02/P-03.
This first bounded phase measures the current private v9 owner and specifies the repair boundary.
It does not optimize production code or qualify release capacity. V8 has no customer or dogfood data
and is not a product compatibility target; its current setup/test dependencies may remain temporarily.

## Decision and design

Use a mechanism benchmark plus controlled fault experiments. The decision is which repeated work and
task boundaries to change without weakening complete authentication, content coverage or lifecycle
ownership. Primary quantities are validator/replay calls per operation and the current owner's response
to a valid page expiring locally. Secondary quantities are elapsed owner/service time, crypto calls,
input acknowledgement, durable flush delay, receive delay and content/source growth.

The observation unit is an operation or scheduler pass. Samples within a single growing synthetic
workspace are dependent; they are not independent users. The target is the current private creating-member
v9 implementation on this host/Chromium, not the supported hardware population. Record runtime versions,
host load, source pins, exact history and timeouts. Use real genesis, recovery, activation, handoff,
capture/spool/delivery preparation and the actual service; no personal account or profile participates.

## Planned measurements and controls

- Instrument named validators and storage operations in disposable test bundles, and the service through
  a test-process module hook. Record counts, inclusive elapsed body time and argument sizes only. Nested
  durations overlap and must not be summed. Crypto wrappers include promise settlement. Check return,
  throw and asynchronous behavior of the instrument; require every declared source anchor exactly once.
- Grow one actual composed owner through 24 additional input jobs, mixing insertion and deletion and
  including a larger paste. Observe at 0, 8, 16 and 24 added jobs. Collect three status samples at each
  point while the scheduler is gated offline, without collector calls inside the measured operation.
  Ordinary polling and burst measurements retain the production scheduler; explicit retry used to drain
  setup/backlog is labelled and cannot prove natural polling latency.
- Compare instrumented and ordinary bundles on the same retained terminal history. Raw timings are a
  descriptive pilot, with all observations retained; three repeats do not support tail-latency estimates,
  universal cliff counts, a population capacity claim or a statistical speedup claim.
- Hold a genuine read response, accept a Local edit, and request a flush. Show whether flush settles
  before releasing the fetch. Then release and verify the edit through cold reopen. A held barrier
  establishes ordering; the fixture delay is not an estimate of usual network latency.
- Advance a test-only receive clock after a genuine response but before its commit, without expiring
  service issuance or passkey state. Observe expiry, retained content and scheduler halt. Restore the
  clock and explicitly retry a fresh request; distinguish a recoverable halt from an irrecoverable store.
  Retain an unshifted valid-page control. Never change production expiry to make this experiment pass.
- Exercise dependent/pending Yjs originals and deletion in a separate real-verifier fixture. Removing
  content while retaining identical ledger evidence must invalidate coverage even though the event
  witness is unchanged. This constrains the proposed cache; it does not endorse forged persisted state.

## Decision rule and limits

Repeated full-history verification on an unchanged authenticated view, fetch-induced flush blocking,
or expiry of a genuine response halting an otherwise readable owner justifies the corresponding repair.
No timing threshold is needed to establish those mechanisms. If a proposed counterexample is not observed,
report it and narrow the claim; do not manufacture an expected failure. Missing/aborted work is incomplete
evidence. Keep bounded stage deadlines and per-operation progress; stop a stage rather than silently
dropping large histories. Do not run another resource-heavy campaign concurrently.

The pilot has no power calculation because it estimates mechanisms and descriptive cost, not a population
treatment effect. Host load, history order, JIT/cache warming, instrument overhead and one-browser sampling
confound a general timing claim. Record them, use repeated retained-state samples and an uninstrumented
comparison, and defer release-capacity conclusions to a declared population/workload experiment.

## Required repair invariants

The existing spool witness commits ledger events, not the entire content/source set. A cache needs a
trusted, complete view identity plus explicit invalidation on every content/source/ledger mutation,
compaction, rollback, owner replacement and relevant journal transition. Cold open must authenticate
the complete retained state. A matching counter or witness alone cannot excuse missing content.

Separate reusable cryptographic verification from content-coverage reconstruction, and authenticate a
new event incrementally against its verified predecessor. Preserve conflicting evidence, exact source
bytes, deletion/pending dependencies and publication halts. Keep the old full verifier as an oracle
  during the repair and use deliberate missing/changed-input controls.

Prepare an owned exact request, end its serialized carrier task, fetch under the session's cancellation
and drain ownership, then re-enter through ordered admission with current-state checks. This releases
the task queue, not the lifetime slot permit. A superseded request or changed authority must still refuse.

Define receive freshness at explicit boundaries before changing it: signed service authorization,
local verification and commit binding are distinct. Expiry alone should permit bounded fresh-request
retry; corruption and authenticated conflict must remain halted. Send progress may expedite receive
only after durable accepted-prefix advance; remote-only promotion must not fabricate a local send wake.
Preserve single-flight fairness, offline gates, backoff, closure and exact ciphertext retry.

## First implementation boundary after measurement

Build a private, owner-scoped verified view for **unchanged retained storage** first. Preserve the
current full verifier on cold open and any changed or unknown view. This is deliberately narrower
than an incremental append/compaction verifier: its acceptance criterion is removing redundant crypto
and replay within one unchanged view, with exactly the same refusals as the full verifier.

The first view identity must compare the complete snapshot inputs: store/scope/generation, authenticated
counter and witness bytes, every record key, kind, generation, sequence, nonce and ciphertext, and every
other marker/authority input consumed by validation. Enumeration, structural bounds and lifecycle/current
projection checks still run. A trusted owner-local revision may avoid repeated work inside a task only
when the task itself owns the immutable snapshot; a caller-supplied revision, next sequence, cached
counter or spool witness is insufficient. Comparing the entire retained ciphertext view is still linear
in retained bytes, but can avoid repeatedly decrypting and replaying the same history. Treat missing,
added or altered rows as a changed view, including a source capsule excluded from the event witness.

Keep at most the latest verified view, inside the existing factor/lifecycle owner. It contains immutable
internal verification results; return owned copies where callers currently erase buffers. Never lend a
cached mutable byte array to those callers. Do not publish a candidate before its verification and final
current-owner checks finish. Close, lock, loss of ownership, failed verification and generation change
must erase/invalidate it. A changed view takes the full path; it must not match an older cached success.
Journal admission/projection checks remain separate and mandatory: reuse of a disk-validation result
must not imply that a newly admitted or pending document has been validated.

Required repair tests: compare full and reused results/refusals over generated histories; exercise every
input above, missing content with unchanged events, invisible pending updates, deletion, compaction,
rollback and failed commits; cold reopen; double-close/abort; caller buffer erasure. Include controls
that deliberately omit content/source identity or reuse results across owner replacement. Measure the
same status workloads before/after and verify fewer calls, without claiming a latency win from counts
alone. Keep unsupported v8 entry points outside the new product compatibility obligation.

After that boundary, separately implement incremental append verification and one reusable coverage
reconstruction per content view. Every new event still needs its signature, exact predecessor and
publication checks; incremental coverage must preserve pending/delete state and be compared with the
full oracle. Exact compaction coverage is a separate mutation transition, not an excuse to discard proof.

Split network waiting from the carrier queue as a following bounded change: prepare the exact signed
request under a task, register the fetch with the same lifetime owner, then re-enter ordered admission
with the exact response and request identity. Hold the lifetime permit until fetch cancellation/drain
settles. Revalidate the current prefix, authority, generation and publication state before committing.
The controlled held-response test then changes from a reproduction into a regression requiring flush
to settle while the response is held, with close/abort and stale-response cases added.

For expiry, initially retain the current authorization/commit deadline. Return a specifically classified
transient expiry and schedule a bounded fresh-request retry through existing single-flight/backoff
rules. Do not turn generic verification failures into retries, remove the signed deadline, or endlessly
retry an operation that cannot complete inside it. A subsequent deadline-policy change needs an explicit
contract decision and service/client boundary tests. Send-to-receive wake and remote-only send wake
refinement come with this scheduler work, preserving conflict halts, fairness and offline gates.

## Workload details fixed before the recorded campaign

Input jobs run back-to-back, each awaiting admission: this is a closed-loop burst, not a specified human
typing rate. Jobs 6, 18 and 24 delete the last three characters; job 12 inserts 8,400 ASCII bytes. Others
append the literal job number in brackets. The controller maintains the expected string independently.
Record the actual capsule/accepted/received counts and require them to agree at each observation;
job count is not assumed to equal source positions. Two idle observations wait for the ordinary next
poll after setup drain, without issuing another retry. Scheduler timelines contain status only.

A status sample explicitly calls deliveryStatus, receiveStatus, then spoolStatus. Scheduler gating,
setup drains and shape inspection occur outside those samples. Editing/poll windows end with a gate
change after their completion; there is no validating collector call inside those windows. Ordinary
comparison bundles remove both source probes and crypto wrappers; fixed comparison order and JIT/cache
warming still prevent interpreting the difference as a causal overhead estimate.

The clock intervention changes **only the final receive commit check** by +60 seconds and records that
the guard fired. The actual signed request, service response and earlier verification use real time.
This identifies that expiry branch; it is not a simulated 60-second wall-clock network outage. The
held-fetch observation lasts 250 ms after admission and stays below the real 10-second HTTP timeout.
The 40 seeded property histories vary delivery order, duplicate originals and full snapshot replacement
in an independent two-publisher verifier fixture. They do not claim native multi-member composition.

Run `pnpm account:liveness` (equivalently `node scripts/account-liveness/run.mjs`). It pins sources,
checks types/probes, executes the coverage properties, then the controlled native and growth trials,
and checks scoped lint/format. Native stage budgets are 200 and 930 seconds; individual waits are also
bounded. Reports and raw logs remain in the dated test-results directory on failure or timeout.

**Measurement boundary correction after the first recorded run.** The first campaign's idle windows
included a setup read as well as the ordinary poll: `settle` could observe an already-current prefix
before its newly scheduled retry began. Retain that run as preliminary evidence, not as one-poll cost.
The corrected trial waits for the setup receive working-to-idle transition before resetting probes,
then requires exactly one service census in each measured idle window. Other measurements retain their
recorded scope. The runner also pins the generated journal WASM sources, and each admitted job writes
partial progress so a later timeout preserves the completed prefix of its editing burst.
