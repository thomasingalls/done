# Phase191 — Local native lifetime without changing shared-writer semantics

2026-10-29. TRD6.1/SC-03 explicitly allows shared Local writers. Preserve that policy rather than
serializing old Local Pages or changing storage format. Reuse the Window cleanup owner with a Local-only
shared supervisor/shared old-slot branch; Account keeps original exclusive supervisor and opening barrier.
Both actual contexts hold native shared old-slot fences. A unique exclusive member prevents concurrent
Worker replay. Before any key-owning phase, the actual Window independently queries that member/slot's
native Worker client and pins it with a native lock. Each original phase checks those Window holders
and pin, then obtains its own REAL shared native Lock using ifAvailable. Queued exclusive transitions
cause refusal, never a nested deadlock behind the root's own shared permit. Ticket replay in a new Worker
has a different actual client and cannot match the pinned identity; same-realm incarnation is one-shot.
No exclusive operations inside the root: close it and the Window, then use the ordinary transition owner.

Root close invalidates before dispatch, drains original registered cleanup and phase jobs, then releases
its physical fences. Cleanup failure retains both until context death. Window anchor withdraws before
native drain and pin survives until Window erasure; failed cleanup does not become a release receipt.
This is coordination, not custody/authentication/proof. It is not yet wired to Local content or default UI.

Nine new unit cases/23 affected tests pass.98 metadata/type/lint/format checks pass.448 runtime sources,
198 domain homes; one new required/uncredited source, prior obligations/blocks unchanged. Independent
AST specialization removes explicit Local-only additions and recovers the exact original Account cohort;
all original native crypto, Account/Local policy, admission, journal and history implementations byte exact.
Initial audit-normalizer draft traversed parent before removing an empty declaration and failed; corrected
normalizer matches exact body. First type command used an absent optional compiler package, and one
new test used ES2024 Promise.withResolvers against ES2022 types; original compiler and compatible new
helper pass. These diagnostics remain, not product failures or evidence of passing earlier drafts.

Three initial and five final native browser cases pass: two real Local Workers plus old shared Page
lock coexist; actual phase lock; pending exclusive refuses new phase and then runs only after both drains;
missing Window pin refuses; replacement Worker cannot replay; failed cleanup retains both physical
fences, hard Worker death releases its member but Window endpoint survives. Original Account busy-Worker
synchronous sealed admission/Undo/exact cold reopen and captured-caller-fields controls also pass.
Actual production bodies built untransformed and source-map matched. Eight owned containers absent.
Disposable fictional profiles only, no computer use/real factors. No performance/full-suite/qualification
credit. Default app still Page; conversion and separate182/187 backlog outcomes remain open. Next Local
native journal/recovery and Window mirror, then same-realm ceremonies/default/offline integration before
unchanged16ms input/2.5s peer/30s delivery measurements. No staging/commit/push/preview/release/deploy.
