# After171: actual worker receive and journal fences — selected next implementation

171 generic AccountWorkspacePort/factory extraction keeps original page factory call and entire
coordinator body AST-identical except binding factory result. New runtime Worker-only manual
composition gate uses actual installed runtime and original native/account authentication. Default
app still page. Before declaring conversion done: full receive, mutation route/era rebinding,
fresh ceremonies/login, Local and default artifact/offline integration all remain.

172 next bounded prerequisite: an actual journal-flushed Window FIFO fence. Existing OwnedReceiveQueue
DOES NOT flush local journal before commit! A prior workspace.whenDurable() outside the queue is
racy: input can seal before the final receive/mutation job reaches head. Don't pretend it suffices.
Can add a third internal createAdmissionOwner bind callback OwnedJournalFenceQueue, implemented by
receiveOwned(Uint8Array.of(1), async ...). Inside its actual head callback: capture queue[0], await
backgroundFlush if present, assert live/head, await existing flush(), then mint opaque WeakSet-branded
AdmissionFence with check() checking live, original head identity, and an expiring active boolean.
No need to alter existing process/receiveOwned paths. Callback may publish through a guarded once-only
original promote; default promote([]) if no frames. Expire in finally. Expose checkAdmissionFence only,
never a public mint. No method added to application workspace. Callback is internal and real queue
required; structural fake/expired fences refuse. Page factory can return third fence capability in
its internal queues result, keeping old original body unchanged except binding extra callback.
Regressions: same-head flush covers input admitted between an earlier barrier and fence; local input
cannot be admitted while fence held; fresh journal empty before callback, exact flush uncertainty
retains; token rejects after return/abort, structural forgeries and reentrant reuse; original Undo
and no empty publication. Existing controlled test carriers can model I/O, native campaigns later.

173 Window mirror controller: keep public createWindowAccountMirror returning only old workspace,
add private controller returning real enqueue/prepare/fence and safe journal rebind. Extract opening
validation once, preserve exact scope/root/incarnation/database and actual cohort. Refresh narrow
journal key/binding/route under genuine current AdmissionFence AFTER actual journal flush; create a
new codec, erase old/new temporary copies, same original canonical/Undo. Rebind must finish before
queued Window input resumes, and fail closed on scope/generation/authority mismatch. Membership
changes epoch; local retention changes journal era; a constant166 route is data-loss bug if activated.
Register transient erasure once; avoid accumulating disposer closures after every route change.
Add publishReceivePage policy to mirror matching original page factory.

174 receive bridge: do NOT serialize PreparedReceiveFinish or fake synchronous immediate permission.
Native runCaptureTask serializes storage tail. Actual preparedPromotion must get explicit async
cross-thread finish, keeping original fresh checks and pendingPromotions exclusion through Window
apply ACK. Window holds original FIFO head while Worker holds the native capture task through ACK.
For unprepared/history receive, synchronous promote callbacks inside task.step also need an explicit
async extension that retains native task through ACK, preserving old page path exactly. Original
synchronous task.step must never accept a Promise. A copied frame after task release cannot count
as synchronous original apply authority. Bind operation IDs to incarnation, one-shot and bounded,
erase chunks/cancel dangling callbacks, no proofs/keys in generic callbacks. Message cap1MiB means
original4MiB receive frames need bounded tiled transfer, not a new smaller read/receive limit.

All authority/era mutations must cross Window fence and rebind before input resumes. adoptSuccessor/
installMembership currently run on native capture tail but outside Window admission! Wrap only final
mutation under reservation if possible (verify first outside); don't leave Window sealing old epoch.
checkCommit freshness still original. Worker code cannot fetch journal snapshots as future permissions.
Automatic resumable retention prep remains input-prioritized; final commit under Window fence only.
NetworkLogin and opaque PromotionOpening/RecoveryOpening remain in same Worker or independently
verified fresh Worker-issued ceremony nonce; no bool approvals, proof clones or extra passkey prompt.

Then actual worker root entry/client composition, coalesced status/UI device surfaces, all app paths,
Local owner lifetime, offline asset precache/update, and finally original performance measurements.
16ms/2.5s/all-marker/30s gates unchanged; service automation off. No commits/preview/release/production.
