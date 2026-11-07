# Phase183 — native withdrawal retires its Worker and Window mirror

2026-10-29. Bind the actual active native carrier signal to channel retirement in both raw/manual
and composed Account openings. A native withdrawal closes the channel synchronously; Window root
abort immediately stops admission. Existing drain, native member-release barrier and synchronous
Window key disposal remain unchanged. Remove listeners once, including already-aborted roots/native
owners and ordinary parent shutdown. This binding grants no permit, authority, key or retry bypass.
Memoize the Worker close promise before channel/abort dispatch can synchronously reenter it; keep the
original drain body, with listener cleanup after owner disposal. Direct internal close also withdraws
the Window rather than leaving its mirror active. Never await root drain inside native abort dispatch.

The real before test suppresses only Window retirement hints. Its native Account owner receives the
ordinary retirement event, releases its actual member permit, yet Window remains active in BOTH
manual and composed modes: both fail the unchanged5s observation deadline. Retain state=active,
ignored=1/memberHeld=0 and the exact before build/driver identity. After repair both cases pass,
refuse attempted input without a journal append, release native holders and erase Window key buffers.
Four affected original cases (normal busy-Worker input/Undo/cold reopen, passkey cancellation, committed
reply loss and native receive apply loss) also pass. Six native cases total, no source transforms or
shared memory; included final source bodies match exactly. Eight owned containers absent.

Six added controlled signal cases and50 affected unit cases pass, plus98 metadata/type/lint/format.
No full-unit rerun this phase: phase182's2417/one-skip result is prior-source evidence. Independent
AST audit checks entry changes only at lifetime binding/reentrant close, the original actual drain
body, and byte-identical native authority/history/storage/mixed-owner/admission algorithms. All old
obligations/blocks remain exact; one new test source required/uncredited,441 runtime sources/198
unchanged domain homes. No old tests changed. No qualification or timing credit.

Next finish automatic context coordination, UI/session ports, resumable preparation and Local/ceremony/
offline integration. Joined deep-backlog late-marker continuation from182 remains unresolved, with
its30s deadline unchanged. Default app remains Page. Do not measure acceptance before complete
functional conversion; preserve16ms input/2.5s peer/all-marker/30s gates. No staging/signing/push,
preview8443, release/service automation, computer use or real user data.
