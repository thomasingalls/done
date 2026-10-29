# Continuation notes before169 — do not declare conversion complete early

Completed to166: internal cohort+admitted Window mirror.167 frozen async raw-journal/channel components.
168 in progress: real WorkerRuntime, async raw journal reading/native account join, production worker
entry+client+recovery stream, no SAB/transforms; eight actual-account Chromium cases and26 native
Chromium/Firefox cases pass. Two stale-fence mutations detected. Full unit passes2289+existing skip
after one old fixture wait and a new deterministic test. Still finish old native campaigns and168packet.

169 composition:
- Extract AccountReceive composition generically over a small workspace port (status/whenDurable/
  subscribe/outgoing/onStatus/close), keeping old page factory exact. Worker retains the real native
  account owner, scheduler, verification, authority/history/prepared-finish closures; Window retains
  actual createAdmissionOwner/createAdmittedWorkspace/Undo.
- Worker creates Window mirror via nested channel request during open; register real carrier in
  Worker before awaiting createMirror so Window loadRecovery/flush can reenter. No fake workspace.
- Worker registry IDs are bounded one-shot continuations, not serialized proof leases/functions.
  Window starts actual native commit/fresh finish checks at its existing FIFO head, applies only
  exact durable verified frames, holds its head through receipt/consumption and rejects stale roots.
  Keep pending-promotion exclusion through acknowledgment where needed. Do not pretend the original
  synchronous immediate-apply permission can cross threads; introduce explicit async continuation.
- All generation/authority/route/retention mutations needing sync journal checks must reserve Window
  admission, flush real journal before changing route, hold through completion, and refresh Window
  journal binding/route BEFORE pending inputs resume. Membership changes epoch; local maintenance
  changes journal era; cached opening binding would otherwise seal unrecoverable old-era entries.
  Hot rebind narrow keys only, same identity/root/store, genuine cohort, erase old/new buffers on fail.
  Generation changes often close the existing owner already; mirror must close with it.
- Input-priority preparation outside FIFO cannot use stale raw snapshot as commit authority.168
  WorkerRuntime.journal.pinned refuses outside opening/explicit Window fence. Full preparation may
  initially use an explicit Window reservation conservatively; preserve resumable chunks/cancellation.
- Window activity transport must coalesce to one outstanding call. Current168 sends every event,
  which can fill8-call budget while Worker busy; retain visibility/freeze/online transitions and
  latest input activity (bounded Map event-kind+state sorted by monotone sequence is a candidate).
- Replace all global document/global listeners in AccountReceive/notifications with fixed runtime
  ports. Node-inert fallback is needed when no document/global listener exists; do not replace locks.
- Window mirror needs publishReceivePage setting matching original batching. Keep original batching,
  local flushing, backoff and publication deadlines; no peer performance measurements yet.

170 UI/login/ceremonies:
- NetworkLogin must live with Worker native keys; expose only UI view getSnapshot/subscribe/connect/
  signOut through a typed facade, never root/session secrets to Window. Existing UI types name the
  concrete class; narrow those view types. Legacy private access is opaque; can proxy encrypted HTTP
  bytes through its real Window capability without parsing heavy data there, or carefully mint the
  real private access in Worker without adding a generic token/export backdoor.
- Fresh PromotionOpening and RecoveryOpening are WeakMap capabilities intentionally NOT serializable.
  Current168 client refuses them and NetworkLogin until coordinated integration exists. Do NOT clone
  a verified-success flag or add caller-supplied approve/consume callbacks in Worker: that can turn
  factor possession into passkey bypass. Do NOT silently add another passkey request in fresh setup.
  Need move relevant fresh ceremony/nonce ownership into same persistent Worker or transfer signed
  ceremony data using a Worker-issued fresh one-shot nonce and original cryptographic verification.
  A Worker-owned fresh nonce+independent signed assertion/context verification can mint the original
  Worker-local opaque capability; no serialized proof lease or arbitrary nonce import. Consider full
  setup/recovery coordinator Worker ownership if smaller cross-ceremony port cannot preserve this.
- Preserve all first-device/joined/recovery/local/offline routes, existing protected workspaces and
  ordinary migration/refusal behavior. Active local workspace heavy owners also need consideration.
- Actual Vite needs worker.format='es' once default app imports Worker client. Existing precache
  scans final directory so includes Worker chunks; test exact artifact offline/update/mixed clients.
- Worker bootstrap currently streams original state/update records. To move long replay itself off
  Window, consider explicit UI bootstrap-state type from Worker authenticated replay, including Yjs
  pending state, rather than inventing native records/seq IDs. Original journal dirty/durability
  status must remain truthful. This is a separate bounded slice, not forgery of native receipts.

Only after actual app conversion+functional closure run the original Goals80wpm seven-sentence,
focus/refocus and peer/catch-up workloads against unchanged16ms/2.5s/all-marker/30s gates. No CUA,
actual devices, preview8443, release prep, commits or push. Keep old failures and sequential patches.
