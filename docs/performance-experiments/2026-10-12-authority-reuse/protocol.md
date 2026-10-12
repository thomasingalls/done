# Unchanged-authority authentication: prospective protocol

Base: signed `9bf9f3c6`. This is the second bounded online typing repair, not release validation.
Keep existing storage/wire formats, received-dependency durability, admission ordering and undo.

An exclusive v9 owner may retain an exact private copy of the scoped custody inventory only
after authenticating that same inventory and matching its expected authority. Every subsequent
check must freshly read the complete bounded inventory, including keys, unknown fields and
clear/import interlocks. Only exact equality skips repeated parsing, factor opening, MAC checks
and payload encoding. This does not defer corruption detection to an audit. No raw keys are
retained by the memo. Changed inventories take the complete verifier; they cannot adopt authority.
Resume, explicit adoption, history custody refresh, failure, disposal and a new owner invalidate
reuse. A late verification cannot reinstall after invalidation. Caller buffers cannot alias it.

Hypothesis: removing repeated authentication and duplicate inventory reads will remove most of
the 3.71–4.86 s custody-payload CPU category seen in the preceding diagnostic windows. No frame
latency gain is assumed; ledger comparison and remote queue waits remain. The mechanism criterion
is reuse without repeated authentication on unchanged data, immediate refusal of damaged data,
and successful fresh verification on lifecycle invalidation. Reference mode disables reuse.

Reuse the preceding packet's prospective measurement protocol: two fresh restored sessions per
arm for silent peer, active peer and 600-position backlog, CPU-4x on B, 75 ms account-request
delay, 120 keys at requested 150 ms spacing in Project 2, 120 cards and 12 KB Goals. Reverse
arm order in repetition two. The session is the analysis unit. Use identical instrumentation,
service and paired fixtures. Add authentication/reuse counters; retain per-session frame p95,
handler/dispatch proxy, queue waits, long tasks, key pacing, accepted/received progress, requests,
loads and copies. Separate diagnostic profiles from unprofiled timing. Preserve all writing,
last-key undo/redo, peer text, export convergence and offline cold replay in every observation.
Stop on correctness failure; retain failed attempts and separately name harness repairs.

After this slice, online/backlog p95 above 50 ms or backlog >5% of keys above 100 ms triggers
prepared remote handoff, not a third general shrinking pass. Profile residual long tasks to
identify splittable work requiring budgeted yielding (aim 8 ms slices). That handoff remains a
separate implementation phase. Two repetitions are local engineering evidence, not confidence
intervals, physical-phone results or proof of meeting the 16 ms TRD target. CDP pacing can
undersample pre-handler blocking; report actual gaps and do not call keydown timing physical latency.

Commands, source/bundle/fixture hashes, failed attempts, numeric results and checks will be retained
in this packet. Exclude private paired fixture databases, credentials and application writing.
