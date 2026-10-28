# Phase128 — encrypted native checkpoint storage

Adds an auxiliary append-only encrypted preparation cache with authenticated strict allocation
before every sealing attempt, atomic head/chunk exchange, exact readback, native prefix and current
key/context binding. Receipt plaintext is consumed and erased before task handoff; a sealed delta
is reauthenticated with fresh ownership before allocation. Original content stays unchanged.
Credential-free device removal deletes its derived cache, leaving other devices/unknown formats
alone. The conservative verifier identity covers owned sources, build plugins/configuration,
lockfile, vendor patches and generated WASM; actual Vite integration follows separately.

49 directed unit cases and4 real Chromium IndexedDB/crypto interruption cases pass, including
renderer death after reservation or commit, abort, lost readback, prefix mutation and owner expiry.
Typecheck passes. Initial fixture/type errors are retained. Native fixture keys are explicitly
synthetic; these tests do not establish factor-custody or composed scheduling qualification.
No application wiring, service automation, phone test, release preparation or deployment.

Inventory integration initially refused the new `.native.mjs` suffix. Renamed only this new test
to the established `.node.mjs` convention; retained the failed record logs. No old test changed.
