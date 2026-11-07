# Fairness retry — phase 446

The operator requested another attempt before tracing, independently of the
previous run's false noise predicate. Exactly one application test was rerun:
`continuous native fairness known-backlog normal`, on an exact fresh clone of the
same closed fictional seed. Every source/config hash, frozen build asset and
original/cloned seed is checked unchanged. The browser, body, assertions and
120-second test deadline are the same as phase445. No new instrumentation or
tracing is added. Both test results and host logs remain available.

**The same failure reproduces.** The receiver sees sparse markers20and40but not60
before hot writing stops. It fails the original assertion at fairness.spec.ts:261
in67.987seconds. Later full-archive, Undo and ordinary offline cold checks are not
reached; durable loss or owner closure is not established. This is a failed
functional preflight, not a timed matrix journey or acceptance result.

Fourteen five-second host observations show swap fixed at16,064.31MiBwith no
increases. Only the known test runner/worker Node PIDs exceed100%; no observed
sequence even for those PIDs spans more than10seconds. No further automatic noise
retry is invoked. Phase445's failed result is not regraded or replaced.

Keep two pre-execution harness failures: the first filter selected zero tests,
and the next controller had a mistaken output-directory literal before startup.
Neither executed an app test. The corrected controller lists exactly one test
before execution. Keep the reviewer's initial message/location-field assertion
failure and the exact-field correction too; it required no application rerun.

[Evidence](./evidence.json) references tracked inputs by commit/path and local
artifacts by SHA-256 and size. No sources, profiles or full power logs are copied
into the repo. No app/fixture-code repair, assertion/guard/limit change, further
case, tracing, timed matrix, commit, push or deployment occurs. Stage5remains held
for the next bounded diagnosis of the sparse-publisher path.
