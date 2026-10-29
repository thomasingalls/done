# Phase180 — bounded editor scheduling observations for the Worker coordinator

2026-10-29. Keep the real Window admission/canonical document/Undo and synchronous sealed journal.
A scheduling bridge retains one outstanding request and one merged latest status with document/local
flags. It dispatches after the input handler, coalesces 10,000 edits without unbounded credits and
erases the original owned outgoing bytes. No fake empty update, writing content or pressure cause is
sent. A minimal Worker workspace port exposes the actual subscriptions used by existing composition;
its status is advisory. whenDurable always requests and awaits the original Window durability barrier,
including a live check after reply. Sequence/schema/cancel checks prevent stale observations reviving
an owner. Close stops observers and awaits genuine native cleanup, once. The authenticated internal
factory receives existing owner closures so it need not open a second native owner for bootstrap.

11 added controlled cases pass;40 focused,2400 full unit cases/one existing skip,98 metadata, type,
lint and format checks pass. These are protocol/scheduling evidence, not native/auth or latency proof.
Source AST normalization checks only the reviewed factory context and equivalent local-change
adapter; every existing native check, queue and scheduler body otherwise matches phase179. All old
obligation rows/blocks remain exact, with the new test source required but uncredited;437 sources,
198 domain homes. No old tests changed. Initial type failures (an accidental extra call argument,
optional maintenance narrowing), the test fixture's erroneous post-unsubscribe erasure expectation
and the first audit's omitted new destructuring normalization remain in the packet alongside repairs.
The test now independently distinguishes subscribed byte erasure from events after unsubscription.

Next wire the original composed runtime to this port and the native task-held receive/context
handoffs, then finish Local/ceremony/offline integration. Default app remains Page. Unchanged16ms
input/2.5s peer/all-marker/30s gates await complete functional conversion. No staging/commits/push,
preview8443, release work, service automation, computer use or real user data.
