# Phase181 — real Window final queues for composed Worker operations

2026-10-29. Add internal bidirectional data handoffs for the original composed runtime. Prepared
receive settles its original native preparation before requesting the actual Window prepare FIFO.
Keep the original native finish capability in the Worker; consume its acknowledged variant only at
the Window final head, keeping native checking alive through synchronous original-frame application
and reply. A mutation instead reserves the real branded Window journal fence before original native
commit, copies fresh context inside the final checking task, rebinds the existing mirror and publishes
original frames before ACK. Operation callbacks, proofs and tasks never cross the channel. Bound and
copy staged bytes before dispatch, stream64KiB parts, enforce exact phase/id/one-use application,
erase all owned buffers, and retain actual generic results inside the Worker.

11 new controlled cases exercise real Window admission over actual MessagePorts, multi-part original
Yjs frames/local Undo, queued input using the refreshed route, same-call input copies, malformed and
replayed messages, missing/duplicate/oversized handoffs, cancellation and lost apply reply. They are
not Account authentication or native-lock evidence.48 focused cases,98 metadata/type/lint/format
checks pass. The initial omitted-handoff test hit the unchanged5s deadline: native refusal left the
Window queue blocked while the outer Worker call awaited it. Retire the root directly in the native
handler's rejection path, before waiting for the outer call; the same test now rejects and closes.
Keep the failed run and do not lengthen its deadline. Original native receive, acknowledgment,
Window mirror, runtime/client and Page admission sources remain byte-identical to phase180. Every old
manifest obligation and block remains, one new test file required/uncredited. No old tests changed.

These queues are not yet selected by the application. Next connect the original composed scheduler
and bootstrap, then complete Local/ceremony/offline integration. Phase180's full2400unit result is
prior-source evidence; this phase runs affected checks only. No latency or activation credit. Preserve
16ms input/2.5s peer/all-marker/30s gates. No staging/signing/push/preview/release/service automation,
computer use or real user data.
