# Phase178 — preserve distinct physical custody and logical joined Account identities

2026-10-29. The original joined owner deliberately seals in its physical Local principal/workspace/
root/database while source capsules identify the logical Account principal/workspace. The Window
mirror now validates both namespaces independently, binds UI identity to the logical actor and keeps
journal-era bindings/database derivation physical. Hot rebind explicitly fixes both logical route
fields as well as all physical scope/root/database/credential fields; epoch/generation/era remain
monotone. No native verifier, factor check, key derivation, journal format or receipt changes.

Nine controlled cases test genuine distinct namespaces, same-handler sealing, logical capsule route,
Undo across epoch changes, malformed/spoofed logical actor, forbidden hot swaps, physical database
and physical era binding. Four new cases fail before the repair. Removing only the fixed logical
workspace guard makes its regression resolve instead of refuse; actual checkout stays unchanged.
Initial after-test expected an inner rebind error, but the original queue reports its close outcome;
retain that failure and assert the unchanged closed admission, aborted root and erased incoming keys.
All original mirror/rebind test ASTs remain identical; shared fixture defaults preserve primary scope.

Full2384unit cases/one existing skip,68focused cases,98metadata/type/lint/format and21 rebuilt native
account cases pass. The new genuinely joined profile asserts distinct physical/logical IDs and an
enrollment slot, compares exact writing with an independently opened original Page reader, seals
synchronously without an RPC, native-flushes, retains Undo/Redo, advances a real native journal era,
seals/flushes again and cold-reopens exact writing through the original joined Page path. All20 prior
Worker/Page/receive cases pass too. Included source bodies match without transforms/shared memory;
25 owned containers are absent. New test remains required/uncredited:436sources/198domains,958
obligations/412 unresolved; every prior obligation remains exact.

Keep failed native attempts: a new helper seed argument was initially passed to test rather than
laboratory, selecting the primary profile and then incorrectly cold-opening it as joined. Metadata
field-name diagnostics showed the primary marker unchanged across maintenance, identifying fixture
selection rather than a product migration defect. Correct seed then showed this joined profile was
behind the primary account archive; use its original Page reader as the independent local baseline.
Explicit ID/slot assertions now prevent that wrong-seed false positive. Native maintenance/security
checks were retained. Private fictional factors/profiles excluded. Earlier attempt hashes/logs remain;
only final build has complete emitted-source identity comparison.

Default app remains Page. Continue actual original workspace/sync composition and fresh context
handoff, resumable automatic preparation, ceremonies, Local ownership and offline/app integration.
Only then unchanged16ms input/2.5s peer/all-marker/30s measurements. No preview/staging/signing/push/
release or service history automation.
