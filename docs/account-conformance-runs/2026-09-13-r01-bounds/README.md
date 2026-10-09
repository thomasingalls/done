# R-01 bounded repair evidence — 2026-09-13

[Contract, result and limits](../../review/implementation/service-receiver-bounds.md).
The base is signed `4bb0904`. `summary.json` records input hashes and both raw and normalized log
hashes. Logs are normalized for repository/temporary paths and terminal color before deterministic
gzip compression. Original transient logs remain in the local temporary directory; these normalized
copies are the retained repository evidence. `source-patch.diff.gz` reconstructs the runtime/test/
wrapper change from the signed base. Previous archives and review/intake bytes are unchanged.

Final checks: 124 unit tests, 38 service/transport tests, 16 planning tests and twelve selected native
cases passed. Native evidence is staged: `native-sender-final.log.gz` contains three passing singleton/
omission cases and two failed historical bundle cases. `native-history-pass.log.gz` supersedes those
two failures after fixture repair and asserts the sealed-versus-submitted distinction explicitly.
The other native receipts cover four receive-size cases, the 256-record transaction abort/retry and
two current composed/polling regressions. No full wrapper campaign or immutable aggregate is claimed.

The retained early failures include a missing Vite output-array normalization, a missing test import,
a scheduler test that left its other lane pending, a missing old-bundle export, insufficient historical
fixture deadlines and a wrong assumption about bootstrap position order. An initial UI-paste fixture
also exceeded 90 seconds; these single-source protocol tests do not close F-19 paste responsiveness.
The final historical native cases ran in about 107 and 131 seconds under 240-second deadlines. The
expanded `account:sync` native stage has a finite 600-second budget; its whole wrapper is not qualified
by these directed runs.

Reproduce from the repository root (all browser commands use disposable synthetic profiles/services):

```sh
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/vitest/vitest.mjs run --maxWorkers=2 test/networkEnvelope.test.ts test/spoolBatch.test.ts test/outboundSpool.test.ts test/spoolRecord.test.ts test/accountInboundCodec.test.ts test/accountReceiveDriver.test.ts test/accountSyncDriver.test.ts test/privateDeliveryHttp.test.ts test/diagnostics.test.ts
node --test test/account-service-delivery/core.test.mjs test/account-service-inbound/core.test.mjs test/account-transport-contract/formats.test.mjs
node --test --test-name-pattern='R-01' test/account-receive-driver/native.test.mjs test/account-sync/native.test.mjs
node --test --test-name-pattern='batch limit refuses' test/account-receive/native.test.mjs
node --test --test-name-pattern='one owner sends|invalid page halts' test/account-sync/native.test.mjs test/account-receive-driver/native.test.mjs
node --test test/release-validation/inventory.test.mjs test/release-validation/manifest.test.mjs
node scripts/generate-private-envelope-vectors.mjs --check
node scripts/generate-envelope-vectors.mjs --check
node scripts/account-transport-contract/vectors.mjs --check
```

The 32 generated wire profiles, 120 existing source/burn histories and 200 signed transport mutation
histories retain their seeds. A separate service-to-real-receiver case deliberately accepts 256 small
encrypted updates and then refuses them at receive, with a successful 255-update control. It records
the malicious-member residual rather than pretending the service can inspect ciphertext semantics.
The original size probe source remains in the immutable R intake's `localChecks.boundsProbe.source`.
The live construction registry passes with 78 specified, four inherited and one excluded construction.
All 21 pinned personal/package files, 31 prior vectors and L-2 match their preservation hashes.
