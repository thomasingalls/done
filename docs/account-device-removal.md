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
ending current access. The private service now persists the preparation/fence, but does not yet commit a rotation, install
keys, grant live access or enable a product control. The generation-one native owner explicitly refuses rotation adoption.

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
   remaining owner can finish the same prepared removal; this takeover needs service/client composition.
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
  recipient keys and a simulated committed persistence port. Native custody wiring remains.
- Durable service preparation/fence and exact retry/restart are implemented in private schema 19.
  Atomic successor, wraps, finalization and outcome, followed by history/discovery/session composition,
  remain next. Old-generation work from remaining
  authorized offline devices keeps its valid historical admission path.
- Actual local generation activation under the exclusive writer barrier, including synchronous journal
  and retained outbound work. Follow TRD §13.7 / SC-03/04 applying order. Keep predecessor keys until
  successor checkpoint admission and a fresh journal-inclusive retirement census permit retirement.
- Devices action and progress; removed-device detached copy; disposable removal, remaining-device
  writes and cold reopen, including lost replies and interrupted installation.

The retained `:8443` installation remains unchanged until a new quiet point and backed-up upgrade.
