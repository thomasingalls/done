# Aggregate validation baseline repair

This bounded phase addresses F-01, F-02 and F-20 in the
[annotated implementation review](./review/implementation/af8941e-96a2040.md). It changes validation,
not the encrypted-store or Account protocol. The archived review retains its original assessment date;
later dispositions and evidence belong here and in the checkpoint.

## Private v2 envelope coverage

Both vector commands now include the private envelope generator. Its independent Node/OpenSSL oracle
registers HKDF info, AES-GCM AAD and the signature message, with 20 published isolating negatives.
The existing five positive vectors, including every ciphertext, signature and wire byte, remain unchanged.

The elision audit removes one field, regenerates the base, and requires exactly the corresponding
negative to authenticate. An AAD substitution retains the original key; an HKDF-info substitution retains
the original AAD. This separates overlapping workspace, credential and generation bindings instead of
mistaking a changed key for evidence that AAD binds a field. Signature substitutions retain the original
signature. WebCrypto independently consumes the published negatives after first authenticating the base.

## Native harness source and resource ownership

Custody, content, journal and carrier-property campaigns snapshot `src/`, `account-protocol/` and the
generated WASM binding with their relative paths intact. Aliases point into that snapshot, and manifests
record the original paths and hashes. Mutation anchors still require a unique match. The journal
read-order control now targets `loadRecovery`, where its snapshot actually exists.

These runners retain distinct strict loopback ports. Each closes its Vite server even when listening
fails. `pnpm storage:harness`, included in `pnpm check`, deliberately occupies each port and requires an
exit-2 report within 20 seconds, with no credited mutation. A printed error followed by a live process
fails this regression. Fixtures use disposable browser state only.

The property runner awaits native predicates with an explicit timeout and clears operation timers when
work finishes. The two 150-case spool properties have explicit 30- and 15-second deadlines. The Account
delivery native stage has an eight-minute deadline while retaining its existing heartbeat, per-case
limits and failure artifacts. Counts and assertions were not reduced to make deadlines pass.

## Additional gap exposed by the aggregate

One full-check attempt let the intentional `release-before-drain` mutation survive the lifecycle test.
Checking whether the competing renderer had entered was timing-sensitive: its callback could still be
pending after an illegal release. The test now also records local work-release and disposal events and
requires work release to precede disposal. This directly tests the drain boundary even if the other
renderer runs late. The mutation is credited only when that assertion fails against a passing baseline.
Native lock and worker polling in that harness now awaits each predicate outside the page polling loop.

A later aggregate reached storage compatibility and exposed another fixture race: navigation completed
before the module initialized `window.compat`. The test now waits explicitly for the requested fixture
method. A regression holds module initialization behind a release gate; it passes with the readiness
wait and fails when that wait is removed. This fixes test startup without changing application behavior.

The Account suffix exposed a message-based refusal assertion in the ordered-editor test. Flipping a
random signature character sometimes produced invalid hex, so a correct parser refusal did not contain
the expected word. The case now deliberately tests malformed hex and a canonical but invalid signature,
requires the `receive-refused` code, and checks unchanged visible content and source captures before
continuing with a valid page and authenticated conflict. This strengthens the test without changing the
production refusal contract.

## Evidence and limits

Execution results, source manifests, failed attempts and mutation counterexamples are recorded in the
[phase evidence](./account-conformance-runs/2026-09-11-validation-baseline.md). Full-check builds run in a
disposable checkout so the author's retained Local release and `dist/` are untouched. A partial chain,
superseded attempt, timeout or survived mutation is never described as a passing aggregate.

This repair does not close the review's protocol bounds, fresh activation assertion, Account construction
registry, recovery alignment, invocation-grant power-loss accounting or product/deployment findings.
Chromium fixture evidence is not a supported-platform, raw-profile restore or OS/power-loss guarantee.
