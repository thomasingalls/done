# Phase186 — scoped passkey cancellation across the Worker boundary

2026-10-29. Preserve each original proof's AbortSignal through a monotone prompt ID and an explicit
cancel request. Window owns a separate native AbortController per browser prompt. Only the original
Worker owner creates/verifies challenges; no nonce choices, proof flags or reusable signature leases
are added. One prompt remains in flight until provider settlement, cancellation prevents late result
use and erases owned buffers, and an old cancel cannot cancel a newer prompt. Root retirement still
withdraws input immediately and aborts Window browser UI. Failed delivery of an independent cancel
retires the owner rather than leaving an unowned prompt. No asynchronous storage effect is abandoned.

Ten new controlled cases include actual bidirectional MessagePorts with the proof call pending,
provider refusal/retry, before-await capture, accessors/bounds/replay, cancel delivery failure, late
results and ownership/erasure.35 affected unit cases and98 metadata/type/lint/format checks pass.
Six real headless Worker cases pass: wrong code, bad passkey, opening cancellation, signed-read
mutation refusal, native publication with synchronous Window admission, and original session
sign-out/cold read. Actual native authentication, nonce/signature checks, queues and lifetimes remain
byte-identical. Final built source maps match actual source. Six owned containers absent.

Sensitivity: omit ONLY the independent AbortSignal listener in a private copied module. Both scoped
cancel tests fail; unchanged module passes. Earlier fault runs retained an unhandled rejection in a
failing fixture; a second accidentally discovered a retained preimage as another test. Fix only the
new fixture's rejection ownership and put the preimage outside test discovery. The final isolated
control fails exactly the two intended assertions with no unhandled errors. No application source
was replaced for the control. Native virtual passkeys establish these tested paths, not every real
provider/mobile user-activation behavior.

444 runtime sources/198 domain homes; all old obligation rows/blocks remain; new source required/
uncredited. No full-unit rerun or latency/qualification credit. Default app remains Page; conversion
incomplete. Continue fresh advisory configuration, retirement-safe terminal UI, resumable preparation,
Local/ceremony lifetimes and default/offline integration, then unchanged16ms/2.5s/30s measurements.
Phase182's late joined-backlog outcome remains open. No staging/signing/push, preview8443, release
work, deployment, service automation, computer use or real user profiles/data.
