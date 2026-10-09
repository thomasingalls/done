# Other-device removal and forward rotation

Product scope approved 2026-10-08: remove another device, keeping the requesting device connected.
Self-removal and the last-device case remain local-clear/recovery work. This is part of
[device lifecycle](./account-device-lifecycle.md), not release qualification.

## The boundary being implemented

Removal has three distinct events: requested, service-committed, and activated on a device. A request
or a relay refusal is not a completed removal. The service commits the authorization successor, a
client-generated next content key's exact distribution, and the removed credential's authenticated
final accepted-write head together. Existing copies cannot be erased. An offline remaining device can
still produce old-generation writing until it observes and activates the successor.

The private protocol verifies preparation, intent, outcome and finalization evidence. The committed
rotation successor now extends verified membership/history, retaining historical authorship while
ending current access. The private service now commits the preparation/fence and atomic rotation with historical delivery.
Protected transport, native retained custody, successor opener installation and original/joined local
activation are implemented. Devices now exposes confirmed other-device removal for the first rotation. Passive discovery closes the old
writer after retaining its verified successor; unlocking resumes activation. Removed devices retain
a writable detached copy and start no content or notification driver.

## Stable cutoff before the intent

The selected transition intent includes the exact cutoff vector. Signing a moving snapshot and then
refusing it when the removed device writes again would strand the request: an unsigned refusal cannot
license discarding/reminting a pending key at the same target generation.

The producer therefore needs a durable preparation before generating/submitting the rotation:

1. A current certified device signs the exact parent, other target and retry nonce. The client retains
   this request before sending it. A pending target is allowed because approval may already have exposed
   the old key. Other unrelated pending members are not carried through this first removal flow.
2. The service authenticates the parent and actual publisher ledgers, retains the preparation and exact
   cutoff vector, and fences **only the target's** new accepted writes atomically. Existing accepted
   requests remain answerable. Comparison/key-delivery/certification for that target must also stop.
3. An exact retry returns that saved preparation. Other certified devices keep writing. Their committed
   successor boundaries may advance monotonically beyond the preparation; the target boundary cannot.
4. No timer silently reopens the target stream. A service restart retains the fence. Another authorized
   remaining owner can finish the same prepared removal; service and retained-client composition now
   support this exact-parent/target takeover. The original actor cannot replace its own saved nonce.
   A competing membership operation must serialize against the preparation rather than invalidate a
   saved rotation's parent without an authenticated terminal outcome.

This preparation is a private producer addition; it does not change the selected row-15 intent/outcome
bytes. It can temporarily stop the target's network publication before removal completes. It must remain
visibly pending while unfinished. The fence is not itself revocation or a local-write prohibition.

## Exact rotation bytes and authority

Use the selected `done/transition/v1` and `done/transition-out/v1` LP grammars, kind `rotate`, target
`parent.generation + 1`. Payload parts are `cutoff`, `excluded`, `recovery-wrap`, `wraps`, in that order.
Private credential IDs are fixed canonical hex; vectors are strictly ordered and duplicate-free. A wrap
value is the exact fixed 32-byte HPKE encapsulation followed by the 48-byte ciphertext/tag, encoded as
hex. Each device wrap's key is resolved from the verified **parent certified set**, never a mutable
roster or a service-supplied replacement key. Recovery authority must match the parent's certified
recovery-state digest and root. The initial producer excludes exactly one other credential.

The device signs the selected intent. Persist the pending key and exact request before transmission.
Only a verified service outcome distinguishes committed from superseded; malformed/unsigned errors,
timeouts and lost responses remain pending. A committed outcome starts installation; it does not
license dropping the previous opener. A superseded outcome requires authenticating the winning
successor and reevaluating the removal before another request.

Finalization uses the selected `done/accept-head/v1` bytes with `final:true`, including position zero
and the empty link for a never-writing device. This signature binds the exact prepared target cutoff
at the committed epoch. Receivers must still compare it against their independently replayed accepted
prefix; a signature over a claimed link is not replay evidence.

## Remaining bounded implementation steps

- Client key production and retained exact-intent retry are implemented and tested with real HPKE
  recipient keys. Native original/joined custody now retains the exact proposal and winning proof,
  installs the authenticated successor self opener, and survives lost commit replies/cold reopen.
  Local generation-two activation now resumes across interrupted content/custody commits; journal-only
  work is retained, and new edits survive cold reopen. Old keys and the apply record remain.
- Durable service preparation/fence and atomic successor, wraps, finalization and outcome are implemented
  in private schema 20. History, survivor discovery and scoped authorization compose with the rotation.
  Old-generation work from remaining authorized offline devices keeps its historical admission path.
  Protected HTTP/client transport and the retained producer compose through lost replies/restart.
  Removed-device terminal discovery now has a separate proof-only grant, including exposed pending
  targets; it returns no transitions after their removal. A different remaining owner can finish the
  exact prepared target, and the original intent resolves against the authenticated winner.
- Passive discovery and activation handoff are implemented under the exclusive writer barrier. Native activation now
  includes synchronous journal and retained outbound work. Follow TRD §13.7 / SC-03/04 applying order. Keep predecessor keys until
  successor checkpoint admission and a fresh journal-inclusive retirement census permit retirement.
- Devices action and pending-operation/restart UX are implemented. Product original/joined removal
  passes lost committed replies, byte-identical restart, survivor activation and detached-copy editing.
  The final three-device check passes with an offline survivor writing after removal committed; that
  writing survives activation and delivery. Subsequent admissions/rotations remain gated.
  The encrypted native apply record binds the actual account recipient, separately from local-storage
  credentials. Old keys/apply records remain pending checkpoint and retirement obligations.

The retained `:8443` installation now serves implementation `2bea3437` on schema 20, after a fresh
confirmed quiet point, complete offline backup and preservation/HTTPS checks. See the
[cutover runbook](./packaged-account-development.md). Operator browser uptake and writing checks remain
pending; release validation remains paused.


## Repeatable-lifecycle qualification (2026-10-08)

The later operator decision in [repeatable lifecycle](./account-repeatable-lifecycle.md) qualifies the
historical-key survivor-upload rule above. Rotation alone retains it. A later device admission raises
the minimum generation for **new** upload decisions to that admission's generation, because the
replacement receives only its current key. Already accepted history remains exact; future old-key
attempts require a signed retired-generation refusal and durable re-encryption of the same original
edits. Cancellation does not lower the floor. This is not old-key retirement or source deletion.
