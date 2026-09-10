# Private promotion genesis candidate — bounded evidence

Parent: signed `a4e1c15` (`Prepare authenticated Local promotion and durable device custody`).
[Contract](../account-promotion.md#genesis-candidate-boundary-private-phase-2026-09-10).
This component retains an encrypted, journal-inclusive genesis proposal and exactly two content-key
wraps under the prepared promotion owner. It preserves Local content, identities, attribution, counters
and routing. It has no service admission, certified epoch, Account classification or encrypted sync.
The personal preview and relay remain off.

## Final evidence

`pnpm account:genesis` ran from `test-results/account-genesis/2026-09-10T16-34-24.041Z`:

- **17 tests pass**, 40.16 seconds, no failed/cancelled/skipped tests.
- Runtime and independent Node/OpenSSL implementations both open the existing published AES-256 HPKE
  generation vector. **100 generated wraps**, seed `9212026`, interoperate with the independent oracle;
  changed info/ciphertext and low-order recipients refuse.
- **40 generated native histories**, seed `9222026`, combine text insertion/deletion, real card-section
  reordering, disk versus journal persistence, reversed update delivery, precommit abort, restart and
  correctly signed/MACed snapshot, wrap, coverage, recipient or actor forgeries. An independent string
  and card-order model supplies visible-state expectations. An OpenSSL recipient unwrap and checkpoint
  decrypt feed a separate Yjs replay; full application JSON, card identities/authors/order, SV/DS and
  absence of pending dependencies must match. Each history resumes exact committed bytes and explicitly
  abandons without changing other persisted carriers. Failures stop without shrinking indefinitely.
- Native abort before the marker commit and renderer death after its commit; competing owners;
  cancellation while a completed transaction's acknowledgement is held; exact resumption after reload.
  A blocked competitor acquires only after the cancelled owner drains the pending operation.
- Wrong factors, foreign account/recovery, current service abandonment, unknown formats, unexpected
  fields/heads/recipients, foreign actors and unbound card authors refuse without changing storage.
  The actual `a4e1c15` version-1 promotion reader refuses the new version-2 carrier before networking;
  ordinary Local readers remain excluded, and invoking the prior preparation API does not rekey it.
- **Two observed bad-acceptance controls**: removing the snapshot comparison accepts a correctly signed
  checkpoint omitting later writing; removing the opened-key comparison accepts a recovery wrap carrying
  a different generation key. The independent recovery path demonstrates the lost writing/unreadable
  checkpoint. Both normal implementations refuse. Control JSON contains the actual accepted artifacts.

Affected regressions were refreshed against the final source:

| Campaign | Result |
| --- | --- |
| Promotion preparation | 18 tests, including 120 generated service and 45 native histories, process/renderer death and acceptance controls |
| Recovery preparation | 25 tests, including 160 generated histories, browser/process interruption and acceptance controls |
| Authority/preflight | 14 tests, including 160 generated root and 40 native histories and acceptance controls |
| Writer lifetime | 13 native cases and all five deliberate faults detected |
| Local genesis | 17 native cases and all four deliberate faults detected |
| Existing unit suite | 825 tests in 73 files |

TypeScript, focused lint/format, an isolated application build, and all 13 final repository/build gates
pass. Initial JavaScript is **328.0 / 350.0 kB**. The isolated output is under the final genesis run's
`app-build`, exposed only to build checks through a `dist` symlink in that run's `build-checks` directory.
The retained personal `dist/` and `.dev/releases/17d87c2/app` were not overwritten.

[Preserved evidence inventory](./2026-09-10-account-genesis/manifest.json) contains source hashes, logs,
JUnit, generated native histories, observed controls, regression reports, build/unit output and final
gates. This was not a full `pnpm check` invocation or a complete device/browser matrix.

## Findings and correction

Review against the application's real card accessors exposed a production integration mistake: the
first implementation looked for `authorActorId`, whereas cards persist `author`. Its hand-built fixture
repeated the same assumption (and used a synthetic day-order field), so the initial directed/generated
campaigns did not detect the mistake. Replacing the fixture with `registerWorkspaceActor`, `openTree`,
`newCard`, `registerCard` and `ensureDay` made the focused test fail with `Genesis card has unbound
attribution` before any candidate commit. That failing log is preserved as `card-schema-reproduction.log`.

The owner now uses the existing `cardAuthor` accessor. Tests use actual day sections and canonical
locations, with two cards retaining human/system attribution. Generated histories reorder those real
section arrays and check their order against an independent model. The complete refreshed campaign
passes. This defect was found by review and a directed integration reproduction, **not** by the original
property generator. It illustrates why independent input construction matters as well as independent
result checks. The final generated campaign found no additional production counterexample.

An earlier compatibility assertion expected a different refusal message: the old reader correctly
rejected the new field as `Malformed preparation`. The harness now accepts that legitimate refusal;
its initial failed-run log/summary are preserved separately. No timeout or production acceptance was
involved in that assertion failure.

One full unit run exceeded the existing five-second deadline in the generated pending-projection test
while other campaigns were running. The final full suite used `--maxWorkers=2` and passed all 825 tests
in 47.94 seconds with the same test deadlines. Both logs are retained; no timeout threshold or test was
relaxed for this result.

## Limits and next boundary

The native evidence covers the represented single-generation, current-schema Local preparation on
this host's disposable Chromium/SQLite profiles. It does not establish whole-protocol correctness,
power-loss durability, safety under profile cloning/rollback or broken randomness, all platform support,
or resistance to hostile code in the key-holding origin. The candidate's 16 MiB bound is a private
preparation refusal bound, not a performance/latency acceptance result. No debt or matrix status changed.

Next: atomically admit the exact proposal at the service while checking live pending account/recovery
eligibility, certify the exact recipient keys and first authorization/acceptance head, and retain a
complete independently verified receipt under this owner. That receipt must bind the actual candidate
and client semantic evidence, not substitute a bare digest for replay. The following bounded phase
owns the verified Local-to-Account index handoff and restart classification. Account UI, encrypted relay,
second-device adoption, recovery/revocation and broader product conformance remain open.
