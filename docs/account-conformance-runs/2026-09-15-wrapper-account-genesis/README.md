# Account genesis wrapper integration — 2026-09-15

Signed base: `b31be6c0` (Account promotion wrapper). This is bounded runner integration,
not an immutable release aggregate or personal Account rehearsal.

Preserve the actual crypto/native grouping, default Node concurrency, 180-second campaign deadline
and five-second grace. Owned execution adds terminal reporting, a disposable CDP browser and seven
required reports under 4 MiB /32-entry /one-level limits: sources, summary, JUnit, log, snapshot/wrap
controls and generated histories. The contract also binds the historical reader
`a4e1c15:src/crdt/promotionRecord.ts` by reference, full revision and byte hash. The owner checks those
historical inputs before/after execution and receipt reuse. Its historical bytes are archived.

Require all 17 terminal outcomes, successful summary/code/no timeout and wrapper source hashes matching
complete owned inputs, including the published vector, src/lib and cross-family fixtures. The snapshot
control must record an altered checkpoint and different decoded/expected state hashes. The wrap control
must record changed recovery ciphertext and independent-oracle refusal. Both retain the original and
accepted candidates, with baseline refusal, re-signing and unchanged unrelated fields. Require 40 passing
history records with seed 9222026 and the declared operation bounds.

These report checks corroborate native assertions. They do not independently verify candidate signatures,
decrypt candidates, recover omitted state, regenerate the seeded history schedule or replay its semantics.
No recovery factors are exported. The original Node/OpenSSL oracle and production protocol/runtime are
unchanged. JUnit/logs are auxiliary; the owned terminal census is the case authority.

## Qualification

| Selection | Passed cases | Elapsed / bound |
| --- | ---: | ---: |
| Manifest planning | 30 | 18.592s /60s |
| General-test planning | 5 | 5.824s /60s |
| Generated-test planning | 12 | 4.831s /60s |
| Account fixture planning | 4 | 5.380s /60s |
| Actual genesis wrapper | 17 | 80.249s /180s |
| Promotion wrapper regression | 18 | 51.509s /120s |

**86 real cases pass in six executions.** A seventh request reuses the exact genesis receipt after
promotion regression. Every process/browser group drains, and seven genesis reports survive copied-checkout
removal. Genesis includes 100 generated HPKE seals through the independent Node/OpenSSL oracle, 40 generated
native delivery/interruption histories, journal-inclusive state and attribution, IDB/renderer boundaries,
signed forgeries, cancellation exclusion and historical-reader refusal.

Input identity: `fe2783ed7e42de78257ef6707df5e83c36927d41d207bef5c432520343a85d6d`.
Genesis receipt key: `589d2dada0b59c6540456386f1a13ea91994479b107f28e056159d1ad4e5a84e`.

Five new infrastructure cases cover invocation/historical pins, weaker contracts, eleven directed report
corruptions, seven missing reports, 100 semantic-control pairs with twelve invalid variants each (seed
150937) and 160 generated history omissions/corruptions (seed 150938). Five synthetic process controls
accept valid reports and reject zero-exit failed summary, identical snapshot state, unchanged wrap ciphertext
and missing history. A sixth run omits reconciliation and admits the invalid summary; an isolated adapter
fault omits the snapshot-state difference check and admits identical hashes. Both faults discriminate.
Synthetic case claims are instrumentation controls, not Account executions. No new campaign/test failure
occurred; previous failures and archives remain unchanged.

## Retained evidence

`artifacts.json.gz` contains 192 losslessly retained, content-addressed payloads: prospective
protocol, qualification/control helpers, exact mutants, receipts, terminal cases, ownership/browser/file
inventories, every receipt-bound report/log, current adapter/tests/oracle, historical reader bytes,
planning checks, phase diff and preservation record. `summary.json` binds the archive hash and qualification
summary. The archive is 725,435 bytes, below the prospective 1 MiB budget.

Large complete source/dependency/browser input inventories remain externally hash-bound in
`raw-artifacts.json`, under `/private/tmp/done-wrapper-account-genesis/owned/`. Their availability is required
for `--raw`; this archive does not contain a portable installation of dependencies and Chromium.

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-genesis/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-genesis/verify.py --raw --current
```

The verifier checks payload hashes, exact contracts/cases/totals, complete artifact/report inventories,
recorded semantic differences, historical reader bytes, process drain, reuse and both mutation source
hashes. `--raw` checks the external input pins; `--current` compares archived code/planning bytes with the
checkout and should fail after subsequent changes to those files.

Counts remain 628 obligations /291 required files /272 general files /2,198 dispositions (11 not applicable).
One command and one campaign resolve: **146 unresolved = 0 test-file +89 command +57 campaign**. These are
integration counts, not aggregate passes. Next: Account admission wrapper integration. Host-input binding,
historical ownership/headroom observations, remaining oracle/style/prose/artifact work, immutable
qualification and private Account/human rehearsal remain open. The F-17 timing gate and explicit RC debt
retain their recorded failures and product disposition.
