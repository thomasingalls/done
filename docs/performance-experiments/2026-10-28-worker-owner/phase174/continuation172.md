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

# Further concrete design notes after173 (observer slice inserted)

174 mirror rebind refactor: extract a synchronous closed-schema consume/capture helper first; it owns
copies and erases incoming material in finally. Constructor registers one root disposer before any
await, tracks temporary materials in a Set, and erases all partial key copies on failure/cancel.
Keep existing public createWindowAccountMirror -> workspace. Private controller returns actual
workspace/receive/prepare/journalFence, plus rebind(token,material). Only requireAdmissionFence(token,
actualMirrorCarrier) permits rebind, checked before/after every await and before synchronous swap.
Root/scope/database/incarnation/principal/workspace/credential fixed. Generation and route epoch
never regress; an existing era binding cannot disappear. Flush-at-head is172 actual API; independently
confirm old journal is freshly empty before replacing codec, route and binding. Preserve canonical
and Undo. Create new codec before disposing old, erase temporary keys; close root without awaiting
inside its own queue callback on authorized rebind failure (await close there deadlocks drain).
Unqualified forged token simply refuses/erases input; native-committed mismatch fails root closed.
Return only old workspace via existing API; controller never appears on application workspace.
Mirror needs original publishReceivePage batching flag. Small same-generation journal-key equality
fingerprint (Window SHA256 over32bytes, private/zero on root close, not authority) can prevent a bad
hot rebind from sealing unrecoverable writing; do not retain raw JS journal-key copies after WASM
import. Generation-key changes still rely on actual authenticated Worker, never approval flags.

Worker async promotion must hold actual native task through Window ACK. Calling public
copyMirrorOpening() while that task is held deadlocks (it queues another runCaptureTask). For changed
route/binding, capture narrow material directly with the already-held actual task/owner/route, using
same original custody API. No forged task, reentrant fake task or cached receipt. If operation native
task has already ended (e.g. local removal result), Window FIFO remains held so a new authentic
copyMirrorOpening task can run before queued Window input resumes; other mutation paths must also
reserve Window fence first. Fresh Window journal pages are data only, never future mutation proof.

All owner mutations need audit: adoptSuccessor/installMembership currently write on native tail but
outside Window FIFO; first verify independently then reserve Window only for actual commit/rebind.
Read-only prep must not block Window input for its full CPU phase. Read channels bound1MiB while
original pending receive bound4MiB: tile verified frames, retain exact IDs/bytes, no new lower limit.
