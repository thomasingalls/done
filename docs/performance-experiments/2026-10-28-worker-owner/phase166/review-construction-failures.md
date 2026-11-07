# Preserved check construction failures

The initial new mirror tests had two failures: a quiescence assertion resumed before the prior queue-finally microtask, and a pending input used selection1 before its predecessor was accepted. Correct the new fixtures to start in a new task and use accepted selection0. The first failure also exposed a fixture cleanup hook waiting on its own unreleased test gate. Preserve the failed252-case log and corrected252-pass/one-skip run. No admission/FIFO implementation was weakened.

Initial types rejected the generic Uint8Array backing type and two deliberate readonly-field fixture mutations. Copy into an ordinary buffer and make the test-only cast explicit. All corrections are in new test files. A first formatter check flags only the new mirror test; format that new file. Keep all initial logs.

The erased-JavaScript audit initially tried importing an API path absent from TypeScript7.0.2. Use the installed compiler CLI on separate before/after files; their comment-free emitted bytes match. The first source-map audit wrongly expected the worker-transformed runtimePorts hash in the Window bundle; the second expected transformed source text despite MagicString preserving original sourcesContent. Correct the audit to check original source identities and independently reconstruct worker-only transforms. Neither check failure is a native/runtime failure.

The first native mirror attempt authenticates successfully, then refuses the full recovery reply at the bounded bridge. That attempt lacks numeric wire attribution. The final run on the same fictional fixture observes full recovery exceeding4MiB while the exact-content projection is50,159 accounted bytes. Preserve the initial refusal without claiming its unrecorded numeric census. No wire bound is raised.

The first retained-result audit used a wrong relative census path. Its second attempt correctly rejected the failed planning check: the sole drift was the newly formatted mirror test hash. Keep both failed audits and the original failed check. Refresh the reviewed input hash, then rerun the two read-only planning checks. No existing test or obligation changed.

The next audit found that the packet copier compressed native JSON without appending its .gz carrier suffix. Rename those carriers without changing bytes; retain that failed audit.
