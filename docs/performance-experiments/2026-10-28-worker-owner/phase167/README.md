# Phase167 — asynchronous encrypted journal endpoint and bounded channel

2026-10-29. Continue the authorized worker conversion after166. Add internal components only; all420
prior runtime sources remain byte-identical. Default execution stays on the page until the owner,
admission/receive, maintenance and application integration phases finish. No performance measurement.

The real opaque Window cohort selects its sole public index route and independently checks the
principal/workspace database derivation. It can capture stable encrypted journal pages and perform
value-matched cleanup only: no append, key export, decryption or arbitrary storage command. Each
page is at most32Ki characters; snapshots have two credits and a16Mi-character recovery-only bound.
The existing1MiB admission watermark is untouched. Cleanup validates every scoped key/value before
any deletion, limits each call to16 entries, and retains changed/unavailable entries. Raw capture
IDs confer no verification authority. Close invalidates calls and clears retained captures.

The bidirectional native MessagePort channel bounds messages to1MiB, including binary backing
allocations, and eight outstanding/inbound calls per endpoint. It checks closed schemas, sequence,
incarnation, method and reply identity; refuses accessors, executable/prototyped payloads, cycles,
shared/detached bytes and oversized/sparse graphs. Reentrant calls in both directions can finish.
Inputs/results are owned copies; reply bytes are erased after native copying and stale replies on
receipt. Close rejects pending work and notifies the peer. There is no shared-memory wait, fake
localStorage or configurable native lock manager.

**Evidence:**23 new cases plus28 prior focused cases pass (51 total), including native Node
MessagePorts and fake IndexedDB. Typecheck/lint/format and98 metadata cases pass. Browser-worker
composition is the next phase; Node transport tests do not establish browser/service integration or
performance. Preserve the initial generic SessionTask type error and new sparse-array lint refusal;
fix only new files. New crypto inventory422 sources with unchanged198 domains. Both new test rows
remain required/uncredited:942 obligations/396 unresolved, every old manifest row retained. No old
tests/runtime, encrypted formats, authentication or16ms/2.5s/30s gates change.

Run the two named new Vitest files plus windowAccountMirror/accountWorkerCohort, typecheck and the
recorded metadata command in167-checks.json.gz with Node24.18.0. The [audit](review.py) independently
checks original-source hashes, prior obligation rows, observed outputs and fixed bounds. See the
[selected continuation](plan.md) and [next boundary](next-boundary.md). The default account still
runs on the page; this is not a stall-fix claim. No staging/signing/push, preview change or release.
