# Membership proof work — prospective protocol

Base signed `b656553a`. Release validation remains paused. This is bounded product performance work.

## Contract and proposed intervention

Thread an optional cooperative checkpoint through the membership discovery proof chain. Client calls
use the existing 8 ms budget with owner/context/lifetime checks; service callers without a checkpoint
retain all verification. Checkpoints occur between asynchronous proof operations, never in a native
transaction or synchronous editor apply. A single parse/crypto operation can exceed the target.

Within one private discovery/adoption operation, use the immutable genesis anchor captured at owned
startup after a complete fresh authority check. Verify the reply signature, request binding, ancestry,
request actor and lifetime once. Transfer its branded verified history privately to adoption, which
still freshly checks the complete inventory and checks the captured owner context/payload identity,
current authority and expiry. No shared history cache or public caller-supplied verified token. A
competing context invalidates the handoff. Direct adoption remains the independently verified path;
changed membership still performs its existing authenticated custody read and write checks.

## Prediction and decision

Predict that unchanged discovery needs one chain verification instead of two, and avoids the two
extra full joined-custody authentications per discovery, without changing ordinary fresh inventory
checks. Expect >=25% reduction in typing-window generic signature calls per completed discovery and
>=25% reduction in the maximum long task in active-peer and backlog sessions. Do not promise a 50 ms
frame-p95 pass: the fresh final authority IO remains. Adopt only if correctness passes, duplicate-work
reduction is demonstrated, and both matched repetitions improve the maximum long task >=25% in both
modes without a repeated >20% frame-p95 regression or stopped progress. Mixed timing results warrant
one named diagnostic/repeat, not a generalized campaign or relaxed integrity checks.

## Design and measurements

Serial restored-session comparison: reference then candidate in repetition one, reverse in repetition
two; active-peer and 600-position backlog (eight sessions). Same 120 cards/~60 KB, 12 KB Goals,
~400-character target card, 120 keys at requested 150 ms gaps, CPU-4x receiver, 75 ms request delay.
Both use shared final-apply/proof attribution; no CPU sampling in the comparison. Flags retain the
reference. Session is the analysis unit; dependent keys/calls are not independent replicates. Report
long tasks, frame median/p95/max, final read/apply spans, completed work counts, discovery and signature
counts. Unequal work counts cannot establish throughput. Two repetitions are directional evidence,
not population precision. Instrumentation overhead, automated-input undersampling, desktop-to-phone
transfer and scheduling drift remain limitations; reversed order limits but cannot eliminate drift.

## Guardrails and focused checks

Every session must preserve exact local text, last-key undo/redo, peer writing, export convergence and
cold offline replay, without unexpected HTTP refusals. Focused checks compare verification with and
without checkpoints; cancellation during a real yield; response/signature/request/ancestry rejection;
no reuse after expiry, changed custody or competing authority; unchanged/successor/removal paths.
Retain existing native prepared-handoff undo and crash tests. No format/schema, journal admission,
undo, deployment or release-qualification changes. Retain numeric logs, exact source/build/probe and
fixture hashes, failures and amendments; exclude private fixture material.


## Analysis clarification after the first active pair

The retained typing requests count completed HTTP replies, while a proof verification may straddle
the measurement-window boundary. Consequently signatures per completed HTTP discovery is a proxy,
not an exact per-completed-verification count. Keep it labeled that way in the comparison. After the
serial matrix, use the diagnostic owner exposure to force one complete unchanged discovery per arm
and count its verifier calls from start through the private installation result. This is a named
mechanism check, not another latency sample; it supplies the exact operation-level duplicate-work
criterion without changing the predeclared long-task or frame-p95 conditions.
