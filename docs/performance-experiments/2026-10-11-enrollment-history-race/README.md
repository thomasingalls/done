# Enrollment opening: concurrent history snapshot refusal

2026-10-11. Bounded investigation after signed client receive commit `34f9b0b9`.
No publication, deployment or release qualification. All accounts, writing and credentials in
these checks are disposable. The frontend bundle and browser assertions remain unchanged.

## Finding

The [client receive packet](../2026-10-11-client-receive/README.md) retained one failed second-device
opening after certification. That original run did not capture the refusal body. Reproducing the
same flow now identifies a concrete service regression with the same visible symptom:

1. Both devices complete the comparison and content certification. The first device publishes its
   handoff checkpoint, then reopens its editor and resumes ordinary uploads.
2. The joining device requests `/account/history/v1/checkpoint` while opening its writing.
3. The server captures the original publisher's authority and ledger, then awaits cryptographic
   verification. The first device can commit a legitimate upload during that await.
4. The server later captures the joining device's empty stream. Its comparison includes the original
   publisher's `promotion.delivery_witness`, which has advanced. It throws
   `Empty publisher authority changed` instead of restarting its existing snapshot retry loop.
5. The handler collapses that exception to HTTP 409 `{ok:false, refusal:"unavailable"}`. The client
   stays certified and displays the generic service refusal; the editor does not open.

The two checks involved were introduced by service optimization `c609d8c7`, already present in the
deployed-source parent. They are not part of the client receive scheduling change. This establishes
a reachable service defect, not a measured change in its frequency caused by the client work.
The original uninstrumented occurrence cannot retrospectively be assigned an exact refusal body.

The same error classification existed in retained checkpoint-cut verification: a fresh cut read
could see a later append than its earlier verified publisher snapshot. A separate deterministic
test reproduces that refusal on a single-device account with an admitted history checkpoint.

## Repair and boundaries

Only those two explicit snapshot mismatches raise the private `HistorySnapshotChanged` signal.
The handler rolls back any transaction and restarts complete verification from a fresh capture,
within its existing **four-attempt** bound. Four moving snapshots return `state-changed`, without
returning a mixed page or committing a catalog. The request bytes, signature and expiry stay fixed.

Invalid signatures, corrupt rows, lost authority and transaction-time authorization are still
checked normally. This does not retry arbitrary `unavailable` errors, skip the witness comparison,
extend an enrollment lifetime or weaken a verification boundary. It changes no schema, wire format,
credential ceremony, notification scheduling or frontend behavior. Temporary server diagnostics
were removed from the final source.

## Evidence

| Observation | Outcome |
| --- | --- |
| Original service, six natural packaged pairings | Three passed; three failed on the joining history read with `409 unavailable` |
| Temporary server diagnostic, stop after first failure, maximum three pairings | Two passed; third failed at `Empty publisher authority changed` |
| Five directed controls on original service | Three failed expectations: one concurrent upload, continuous-change bound, and checkpoint-cut append; authority and row-damage refusals passed |
| Same five controls on repaired service | All five passed |
| Repaired service, six identical natural pairings | All six opened both editors; no history `unavailable` refusal |
| Focused history, pruning and publisher-tip regressions | 35 passed, including one of the five directed controls |
| Original stopped-receive notice and manual recovery browser journey | Passed in 46.8 seconds, including initial enrollment and subsequent two-way editing |

The diagnostic runner reports its configured maximum-failures stop as an additional runner error;
it is not a fourth pairing. Earlier fixture setup omitted the required session owner and was
corrected before the retained directed before/after comparison. One new test index-signature access
failed typecheck and was corrected; the final typecheck passes.

The original invalid-receive-page, delayed notice and manual retry browser journey passes against
the repaired service. Final typecheck, lint, formatting and diff checks pass. This is focused
regression work, not a generalized enrollment campaign.

The directed tests interleave a genuine signed upload during real WebCrypto verification; they do
not stub acceptance or bypass cryptography. They also prove the four-attempt bound and continued
refusal of authority loss and damaged old ciphertext. The browser sequence uses the ordinary
product buttons with a virtual passkey; it adds route/status/refusal-code observations only.
Expected `authority-changed` and `grant-required` authorization responses still occur and recover.

Six passing repaired journeys are limited evidence, not a zero-failure-rate guarantee. The ordered
before/after runs are not a randomized latency experiment; their durations include assertions and
must not be used as performance gains. No phone, WAN or larger-membership claim follows. The service
can still return `state-changed` under sustained concurrent changes; that bounded refusal remains
safe and leaves the saved attempt available to retry.

## Retained files and reproduction

`samples/` contains sanitized request observations and outcomes for every natural/diagnostic/repaired
pairing. `checks/` retains before/after controls and browser/regression logs, including failures.
`identity/` records the signed parent, runtime patch and exact unchanged frontend hashes.
`manifest.json` hashes the retained files. Database files, passkeys, codes, account IDs, request
bodies and tokens are excluded. The original synthetic service directories remain under
`/tmp/done-enrollment-refusal/` and are not part of this packet.

Commands from the repository root, with installed dependencies:

```sh
node --test --test-name-pattern='history read' test/account-ceremony/content-transfer.test.mjs test/account-history/service.test.mjs
node --test --test-timeout=20000 test/account-history/service.test.mjs test/account-history/pruning.test.mjs test/account-service-delivery/publisher-tips.test.mjs
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts test/packaged-account/enrollment-open.spec.ts --repeat-each=6
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts test/packaged-account/sync-status.spec.ts
```

The packaged checks use local ports 53221/53222; run them serially. Each creates fresh disposable
state. To reproduce the directed failure, use the new tests with `historyCheckpoint.ts` from
`34f9b0b9`; do not replace a live checkout's working file without preserving its edits. For the
temporary diagnostic, log the caught exception only in the disposable service. The retained log
identifies the exact failure site; no diagnostic exception output remains enabled in product code.
