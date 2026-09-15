# Account handoff wrapper integration — 2026-09-15

Signed base: `b9d4efa2` (Account admission wrapper). This is bounded runner integration,
not an immutable release aggregate or personal Account rehearsal.

Preserve core/es256/native grouping, default Node concurrency, 180-second campaign limit and five-second
grace. Owned execution adds terminal reporting, a disposable CDP browser and nine required reports under
4 MiB /32-entry /one-level bounds: sources, summary, JUnit, log, credential/passkey controls and generated
DER/service/native evidence. Pin `beed8cf:src/crdt/promotionRecord.ts` by reference, full revision and hash,
checked before/after execution and reuse. Its bytes and the admission regression's `280f616` reader bytes
are archived. The inactive `HANDOFF_SLOT_BASELINE` environment variant is not selected or inherited.

Require all 21 terminal outcomes, successful summary/code/no timeout and wrapper source hashes matching
owned inputs. Credential reports now retain the actual refusal, original binding, substituted key,
accepted binding and public service root. Independently verify both signatures from locally constructed
row-12 bytes using Node/OpenSSL. Require a different key with otherwise identical target. Passkey reports
retain the actual injected zero signature, unchanged baseline storage, expected target and actual routes;
require exact selected/classified route agreement. No secret factors are added.

Independently verify 200 retained P-256 DER signatures at seed 9262026. This corroborates signature
evidence; the original grouped test remains authority for runtime DER-to-P1363 conversion and malformed
DER refusal. Require 60 service histories at seed 9252026 with final activation matching recorded commands,
and 24 passing native histories at seed 9272026 with declared bounds. These checks do not regenerate seeded
schedules or replay browser/database semantics. The terminal census is case authority; JUnit/logs are auxiliary.

## Qualification

| Selection | Passed cases | Elapsed / bound |
| --- | ---: | ---: |
| Manifest planning | 40 | 29.543s /60s |
| General-test planning | 5 | 6.152s /60s |
| Generated-test planning | 12 | 4.800s /60s |
| Account fixture planning | 4 | 5.705s /60s |
| Actual handoff wrapper | 21 | 137.063s /180s |
| Admission wrapper regression | 34 | 128.411s /180s |

**116 real cases pass in six executions.** A seventh request reuses the exact handoff receipt after
admission regression. Every process/browser group drains; nine handoff reports survive copied-checkout
removal. Handoff includes 200 DER cases, 60 service histories, 24 native histories, actual browser ES256,
offline startup, IDB/renderer interruption, inventory/content assertions and historical-reader refusal.

Input identity: `770889452a50b4eb1f1a9727dd2d5cd08155cd030c471d3578fab076098436ca`.
Handoff receipt key: `f1aff478d95695287b7fc83cb2b571139380a30b052d1e7b621a4d90a344ed58`.

Five new infrastructure cases cover exact invocation/history, weaker contracts, twelve directed report
corruptions, nine missing files, 80 generated control sets with twelve corruptions each (150941), 80 DER
reports with five corruptions each (150942), and 160 service command histories with ten corruptions each
(150943). Six synthetic process runs accept valid reports, reject zero-exit failed summary, unchanged key,
mismatched route and invalid DER, and show an omitted hook admits a failed summary. A separate adapter fault
omits DER verification and admits an invalid signature. Both faults discriminate; synthetic case claims
are instrumentation controls, not Account executions.

Preliminary planning failures (duplicate import, then a stale blocked-wrapper assertion) and their passing
retry are retained. No owned campaign failed. Reporter listener-limit and experimental API diagnostics
also occur in the prior admission archive; their logs remain retained without a repair claim.

## Retained evidence

`artifacts.json.gz` contains 207 losslessly retained, content-addressed payloads: scope,
qualification/control helpers, exact mutants, receipts, terminal cases, ownership/browser/file inventories,
every receipt-bound report/log, current adapter/tests, historical reader bytes, planning failures/checks,
phase diff and preservation record. `summary.json` binds its hash and qualification summary. The archive
is 887,301 bytes, within the 1 MiB budget.

Large complete source/dependency/browser inventories remain externally hash-bound in `raw-artifacts.json`,
under `/private/tmp/done-wrapper-account-handoff/owned/`. Their availability is required for `--raw`;
the archive is not a portable installation of dependencies and Chromium.

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-handoff/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-handoff/verify.py --raw --current
```

The verifier requires Python and Node. It checks payload hashes, contracts/cases/totals, report inventories,
binding signatures and DER with Node/OpenSSL (no repository import), credential/route/activation consistency,
historical bytes, drain, reuse and mutation hashes. `--raw` checks external input pins; `--current` compares
archived code/planning bytes against this checkout and should fail after subsequent changes to those files.

Counts remain 628 obligations /291 required files /272 general files /2,198 dispositions (11 not applicable).
One command and campaign resolve: **142 unresolved = 0 test-file +87 command +55 campaign**. These are
integration counts, not aggregate passes. Next: Account editing wrapper integration. Remaining wrapper,
host-input, ownership/headroom, oracle/style/prose/artifact work precedes immutable qualification and the
private Account/human rehearsal. F-17 timing failures and explicit RC debt remain unchanged.
