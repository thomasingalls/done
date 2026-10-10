# Packaged Account failure investigation

Started 2026-10-10, based on signed `0332a9ea` (full ID in [base.json](./base.json)).
This follows the activation hold in the [consumer performance packet](../2026-10-10-account-consumers/README.md).
Release validation remains paused. All browser accounts are disposable.

## Findings

Two distinct failure modes have bounded reproductions. They do not establish a defect in the
incremental ledger or selection metadata. Nor does a successful rerun, by itself, establish that
every failure in the older packet had these causes; those runs did not record scheduler deadlines.

### Post-maintenance delivery: test recovery did not wake the sender

The history test aborts both devices' submit requests while it creates/verifies a snapshot and
interrupts the receiver's installation. Later it removes those route interceptions and waits
15 seconds for new writing to appear on the other device. The first device has stayed browser-online
throughout, so removing the fault does not emit an online event. New local writing intentionally
preserves an unknown-outcome retry timer; it must not hammer the server on each keystroke.

Two natural diagnostic runs passed. At fault removal their sender had four failed attempts and
about 5.5/6.4 seconds left on its timer. To discriminate timing from missing writing, the same
journey then retained the submit fault until six failures established the existing 30-second cap.
The original 15-second assertion was retained. After it failed, the probe observed for up to a
further 35 seconds and still reported the original failure.

The captured sender had **29.0 seconds remaining** when the assertion began and **14.0 seconds
remaining** when it failed. The new writing arrived **15.52 seconds after the failed deadline**;
the sender's accepted position advanced from 3 to 5. This reproduces the apparent missing-edit
failure as delayed delivery, with no ledger mismatch or permanent storage block in that run.
See [backoff-summary.json](./backoff-summary.json), [forced-backoff.json](./forced-backoff.json)
and [backoff-before.log](./backoff-before.log).

Repair: remove both submit faults before taking the second browser online; announce recovery to
the first browser with the ordinary `online` event. The 15-second assertion is unchanged. A new
fake-clock scheduler regression verifies the 30-second backoff, its preservation through a local
edit, and the explicit online wake. The same native journey forced to six failures then passes
with the repaired recovery step. Production scheduler behavior is unchanged.

The hidden `Retry storage` button in a shell's text is not evidence of a storage error. Its DOM
node exists even when the control is hidden. Retired scheduler errors during navigation likewise
must not be confused with the status of a new owner.

### Enrollment: a second stale grant stopped automatic continuation

The initial two-device coordinator retried `NetworkAuthorityChanged` once immediately. If the
retry also received that refusal, it escaped into the UI's generic error handler, which disables
background refresh. The durable approval could be intact while the first device remained at
“Finishing content access” and the joining device had already certified.

There is a real source of multiple grant invalidations: the service grant fingerprint includes the
content-transfer row. Saving delivery and later installing/certifying it each change the captured
authority evidence. The natural traces show multiple authority-change refusals around this period;
timing determines whether they land in the same continuation. A deterministic test refuses two
successive first-device `deliver` requests. Before the fix, it reproduces the permanent
`Account authorization refused: authority-changed` alert and the certification wait fails.
See [enrollment-before.log](./enrollment-before.log).

Repair: keep the one immediate retry under a freshly opened permit and authenticated bootstrap.
A second authority-change refusal, or exhausted bounded capacity retries, returns a waiting view
with a transient-retry marker. The UI uses its existing 2.5-second retry interval even when an
otherwise healthy notification stream would normally allow a 60-second repair poll. The marker
disappears after a successful continuation; it is not durable authority or an enrollment stage.

Each attempt still reads and verifies saved progress. Competing heads still use the existing
restart checks. No grant is treated as permission to create a replacement comparison, delivery or
membership transition. Other errors still reach the stopped-error UI. The new tests require one
approval decision, identical delivery request bytes across retries, eventual certified opening,
and continued stopping for an insufficient-scope refusal.

HTTP 429s were present in successful and failed runs. They are retry pressure, not evidence that
all failures share one rate-limit cause. Service rate limits and transport retry bounds are unchanged.

## Evidence and focused checks

`natural-0.json` and `natural-1.json` contain the two initial passing runs' request status/action
timeline and bounded scheduler snapshots. `forced-backoff.json` records the failed capped-backoff
control; `forced-backoff-after.json` records the successful counterpart. Only paths, action names,
refusal objects, statuses and scheduler metadata are retained, not request credentials or writing.
The old failure remains a failed result; its later arrival does not turn it into a pass.

`scheduler-diagnostic.patch` applies to the base solely to capture bounded owner status and errors.
`history-diagnostic.patch` applies to the repaired history test to select the scratch diagnostic
build and add snapshots/late-arrival observation. It uses `FORCE_SEND_BACKOFF=1` for the capped
control. To reproduce the *before* control, omit the newly added recovery event and restore the old
offline/unroute ordering. Temporary diagnostic product code and test copies are not installed in
the final application/test suite.

Focused commands:

```sh
VITE_ACCOUNT_LEDGER=incremental node node_modules/vite/bin/vite.js build
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts \
  test/packaged-account/enrollment-retry.spec.ts test/packaged-account/history.spec.ts \
  --grep 'initial approval resumes|insufficient enrollment scope|two native device owners|returning editor'
node node_modules/vitest/vitest.mjs run test/accountSyncDriver.test.ts
node --test --test-name-pattern='scope/authority refusal|pending device admission|capacity retries' \
  test/account-sessions/scoped-client.test.mjs
```

Final checks passed with the ordinary incremental candidate build, without diagnostic hooks:

- **5 packaged browser tests:** recovery after repeated authority/capacity refusals; permanent
  insufficient-scope refusal stays stopped; snapshot maintenance with two-way delivery; returning
  editor after pruning. See [packaged-final.log](./packaged-final.log).
- **14 scheduler tests**, including the capped-backoff/online-wake regression.
- **3 scoped transport tests** for authority/scope refusal, pending admission and bounded capacity
  retries. The coordinator repair does not relax transport authority checks.
- TypeScript, targeted lint, formatting and the packaged build pass.

The forced six-failure history control separately passed after the repair; the failed before
controls remain recorded above. [source.json](./source.json) and [runtime.patch](./runtime.patch)
identify the runtime repair against the signed base. These focused checks resolve the reproduced
failure mechanisms, not every possible enrollment or delivery failure.

The optimization remains opt-in, public deployment is unchanged, and release validation remains
paused. This investigation does not activate the incremental path by default.
