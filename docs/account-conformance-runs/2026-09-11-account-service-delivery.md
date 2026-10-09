# Private service acceptance/refusal evidence — 2026-09-11

Committed the preceding v8 delivery phase as `2cb42a2`. This checkpoint adds durable private service
acceptance/refusal decisions and a signed completeness witness under existing acceptance-key custody.
[Implementation contract](../account-service-delivery.md).

Final campaign: `test-results/account-service-delivery/2026-09-10T22-03-24.558Z` (UTC; September 11 locally).
[Summary](./2026-09-11-account-service-delivery/summary.json),
[458 source hashes](./2026-09-11-account-service-delivery/sources.json),
[generated inputs](./2026-09-11-account-service-delivery/generated.json), and
[evidence manifest](./2026-09-11-account-service-delivery/manifest.json) preserve the result.

| Evidence | Result and scope |
| --- | --- |
| Service campaign | 31 tests pass, 20.04 seconds; exact retries, permanent closures, current membership/route, issued parents, unknown dispositions, corruption, explicit schema upgrade, cancellation, process crashes, competition and controls |
| Generated histories | 80, seed 9822026, each 3–16 operations; independent Node/OpenSSL framing/signatures and a ledger model of permanent subjects, one accepted leaf, contiguous prefix and exact durable retries through unknown commits |
| Process boundaries | SIGKILL before/after both accepted and refused commits; two processes competing over different leaves; acceptance racing refusal for the same exact subject |
| Actual controls | Rollback instead of commit returns an unbacked signature; omitted generation policy accepts an invalid generation; omitted fresh snapshot check accepts after membership changes; omitted witness verification permits acceptance after deletion of a permanent closure |
| Native browser | One test passes, 9.09 seconds; actual v8 persisted submissions receive owned service heads through a test bridge, lose a reply, cold-retry exact bytes and retain locally recorded acceptance |
| Account core regression | 30 pass, including native ceremonies, process death, properties and actual controls |
| Recovery regression | 25 pass, including the explicit old-schema fixture, key custody, native and process boundaries |
| Admission regression | 34 pass, including 80 service histories, 30 native histories, retained receipts and competing processes |
| Authority regression | 14 pass, including 160 authority histories, 40 native histories and process/custody controls |
| Full unit suite | 873 tests in 78 files pass, 50.61 seconds; shared envelope/response/submission codecs included |
| Final checks | Isolated application build, TypeScript, scoped lint/format and 13 gates; results retained in adjacent artifacts |

A service reply is returned only after its exact request/response row and signed next witness commit.
A valid proof on a retry authenticates stored state; it cannot reverse an earlier refusal or replace an
accepted leaf. Out-of-order/future/invalid requests and unavailable authority produce unsigned unknown
results. The only implemented permanent-refusal policy is a signed generation mismatch under the known
immutable first epoch. Correct v8 clients emit that epoch's certified generation.

The original admission receipt authenticates the creating credential and acceptance key; the request cannot
supply either as authority. Parent proof signatures additionally require an earlier issued closure in the
same service ledger. Service verification of successors is exercised, while client re-minting and general
lineage advancement remain unimplemented. Ciphertext is retained without decryption or plaintext validation.

[Findings](./2026-09-11-account-service-delivery/findings.json) preserve the initial implementation and fixture
failures. Direct Node startup rejected a shared TypeScript parameter property; equivalent field initialization
repairs it without changing wire bytes. Two old mutation harnesses omitted new imported modules from their
isolated copies; complete service/protocol copies let the original controls execute again. Their failure logs
and passing regressions are retained. Generated histories demonstrated no additional design or implementation
counterexample; actual controls substantiate specific boundaries, not whole-protocol correctness.

All final source snapshots match current files. The earlier passing admission/authority runs are also checked
against their exact current inputs. The new runner is wired into `pnpm account:service-delivery` and
`pnpm check`; direct Node entrypoints ran these campaigns, not the whole check command. The application build
is isolated at `test-results/account-service-delivery/app-build`. The personal release, predecessor build,
browser and factors were not operated on; personal preview and relay remain off.

Append-only retention/full scans, coordinated metadata+ledger rollback and whole-service restore remain
limits. No real Account is provisioned, no delivery endpoint or relay loop ships, and no whole debt is paid.
Next is private authenticated submission transport and bounded ciphertext/proof readback.
