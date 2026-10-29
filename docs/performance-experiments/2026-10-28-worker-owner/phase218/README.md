# Phase218 — bounded acknowledged UI presentation lifetime

2026-10-29. One in-flight display frame plus latest replacement, immutable owned capture before caller
mutation, safe monotone sequence and version, at most8 flush waiters (matching actual channel credits).
Only acknowledgments at or beyond a waiter's observed version resolve it. Abort/close rejects current
AND future flushes; late replies cannot send pending state or reopen the publisher. Transport failure
reports once and keeps failure. Owned bytes erased after acknowledgment/retirement. This carries UI
presentation only, never a proof cache, native permission, login or private approval.

Seven new tests plus original affected27:34 focused pass. Deliberate new abort-between-publish-and-
microtask test FAILED on initial draft; preimage retained. Final send checks closed again before actual
transport; exact test passes. Other cases cover1000 coalesced updates/monotone2 actual sends, late ack,
post-abort flush, failed send, source mutation, oversized backing/accessors and eight-waiter bound.
Native controller drops retired pending/initial input references; Window checks safe integer sequence.
All other native controller/control/opening AST exact after scoped changes. Original coordinator, Task/
root joins, crypto/history/authority/private approval WeakMaps/login/handoff/canonical admission byte
unchanged217. No dependencies or stored formats change.

34 focused/99 metadata/type/lint/format/independent audit pass. Actual Chrome3 on rebuilt source: held
provider abort/actual cleanup/no late ready; cancelled Account opening and fresh-Worker retry with exact
packaged cold writing; complete new account registration/recovery/explicit approval/edit/original Page
cold. Three exact containers absent; final source-map identities exact. No old test/assertion/deadline
changes. New tests required/uncredited, qualification paused. Native adapter still not default.

Next reuse actual lifetime/UI composition for device connection and recovery, then PWA/offline/mixed
clients/default activation.182/187/205 remain open. No performance acceptance or real staging/signing/
push/preview8443/release/deploy/CUA/service-history automation. Full conversion precedes16ms/2.5s/30s.
