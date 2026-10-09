# Account admission wrapper integration — 2026-09-15

Signed base: `d38a0ab0` (Account genesis wrapper). This is bounded runner integration,
not an immutable release aggregate or personal Account rehearsal.

Preserve the actual core/restart/controls/native grouping, default Node concurrency, 180-second campaign
limit and five-second grace. Owned execution adds terminal reporting, a disposable CDP browser and nine
required reports under 4 MiB /32-entry /one-level bounds: sources, summary, JUnit, log, origin/certification/
receipt controls and generated service/native histories. Pin the historical reader
`280f616:src/crdt/promotionRecord.ts` by reference, full revision and hash, checked before/after execution
and reuse. Its bytes and the genesis regression’s `a4e1c15` reader bytes are archived.

Require all 34 terminal outcomes, successful summary/code/no timeout and wrapper source hashes matching
owned inputs. Approval controls now retain baseline result, active account state, original/corrupted
signature and expected account/request digest. Require the intended zero signature and matching receipt/
activation targets. The receipt control records offered baseline refusal, receipted mutant state and
exact stored/accepted receipt equality with the corrupted signature. These checks corroborate service/native
assertions; they do not independently verify signatures or passkey assertions. Existing Node/OpenSSL and
plaintext-replay receipt oracles are unchanged. No secret factors are added to the reports.

Require 80 service histories at seed 9232026 and replay their recorded commands to check final ledger
states. Require 30 passing native histories at seed 9242026 and declared operation/fault/retry bounds.
This is not independent regeneration of the seeded schedule or browser/database replay. The owned terminal
census is the case authority; JUnit/logs remain auxiliary.

## Qualification

| Selection | Passed cases | Elapsed / bound |
| --- | ---: | ---: |
| Manifest planning | 35 | 23.484s /60s |
| General-test planning | 5 | 7.070s /60s |
| Generated-test planning | 12 | 4.887s /60s |
| Account fixture planning | 4 | 5.882s /60s |
| Actual admission wrapper | 34 | 121.704s /180s |
| Genesis wrapper regression | 17 | 83.453s /180s |

**107 real cases pass in six executions.** A seventh request reuses the exact admission receipt after
genesis regression. Every process/browser group drains; nine admission reports survive copied-checkout
removal. Admission includes 80 service histories, 30 native histories, SQLite SIGKILL boundaries and
competing processes, lost replies, IDB/renderer interruption, retained Local state, independent receipt/
coverage checks and historical-reader refusal.

Input identity: `06f3ffac39d3cbd995b1ba5da2e045fbd1fda053377eb3c3689f5f4c06c75f23`.
Admission receipt key: `197d11f9583f0c711331f11ab784f5231ab50e2c676797669df5563b58879ba7`.

Five new infrastructure cases cover invocation/history pins, weaker contracts, eleven directed report
corruptions, nine missing files, 100 control sets with twelve invalid variants each (seed 150939), and
160 generated service histories compared with an independent event-order formula and ten corrupted
report variants each (seed 150940). Five synthetic process runs accept valid reports and reject zero-exit
failed summary, inactive approval result, unretained receipt and inconsistent service ledger. A sixth run
omits reconciliation and admits the invalid summary; an isolated adapter fault omits the ledger comparison
and admits a wrong final state. Both faults discriminate. Synthetic case claims are instrumentation controls,
not Account executions. No new campaign/test failure occurred; previous failures and archives remain intact. The Node reporter listener-limit and experimental API diagnostics also appear in the preceding genesis epoch; their logs remain retained, and this phase does not claim to repair them.

## Retained evidence

`artifacts.json.gz` contains 214 losslessly retained, content-addressed payloads: prospective
protocol, qualification/control helpers, exact mutants, receipts, terminal cases, ownership/browser/file
inventories, every receipt-bound report/log, current adapter/tests/oracle, historical reader bytes,
planning checks, phase diff and preservation record. `summary.json` binds the archive hash and qualification
summary. The archive is 792,082 bytes, below the prospective 1 MiB budget.

Large complete source/dependency/browser input inventories remain externally hash-bound in
`raw-artifacts.json`, under `/private/tmp/done-wrapper-account-admission/owned/`. Their availability is
required for `--raw`; this archive does not contain a portable installation of dependencies and Chromium.

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-admission/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-admission/verify.py --raw --current
```

The verifier checks payload hashes, exact contracts/cases/totals, artifact/report inventories, recorded
activation/receipt targets and service final states, historical bytes, process drain, reuse and mutation
source hashes. `--raw` checks external input pins; `--current` compares archived code/planning bytes with
the checkout and should fail after subsequent changes to those files.

Counts remain 628 obligations /291 required files /272 general files /2,198 dispositions (11 not applicable).
One command and one campaign resolve: **144 unresolved = 0 test-file +88 command +56 campaign**. These are
integration counts, not aggregate passes. Next: Account handoff wrapper integration. Host-input binding,
historical ownership/headroom observations, remaining oracle/style/prose/artifact work, immutable
qualification and private Account/human rehearsal remain open. The F-17 timing gate and explicit RC debt
retain their recorded failures and product disposition.
