# Account recovery wrapper — 2026-09-15

Signed base: `d41a0a56` (Account core wrapper integration). This bounded phase executes the actual
recovery wrapper with all six files in their existing order, default Node file concurrency, 120s
campaign bound and 5s termination grace. Owned execution adds its terminal reporter and retained
reports; spec/JUnit output and standalone command behavior remain. The phase is uncommitted here.

The native recovery test already launches persistent browsers inside the guarded worker group.
The wrapper adapter selects that fixture directly, pins Chromium and retains the three browser
lifecycle records under ACCOUNT_REPORT_DIR. This avoids an additional unused CDP browser. The helper's
15s startup bound and actual same-profile restarts remain. Other native invocations retain their
previous case-report-adjacent output fallback.

The final owned epoch passes **93 cases in six executions**: 17 manifest, five general-planning,
12 generated-planning, four Account-fixture planning, 25 actual recovery and 30 Account core regression
cases. Recovery takes **11.900s /120s**. This includes the existing 160 generated durable-ledger histories,
independent cryptographic checks, recovery/passkey/root controls, SIGKILL service restarts, IndexedDB
aborts, renderer death and three persistent-browser incarnations. All groups drain. A seventh request
reuses the exact recovery receipt and revalidates its report tree after the core regression.

All ten recovery files survive copied-checkout deletion: sources.json, summary.json, results.xml,
run.log, control-root.json, recovery-profiles.json and four recovery/passkey baseline/mutant reports.
The tree is bounded to 4 MiB /32 entries /one level, including optional failure diagnostics. The
adapter requires terminal completion and the exact case census, successful summary/code/no timeout,
source hashes matching owned inputs, both factor-control distinctions, substituted-root evidence
with the sealed envelope unchanged, and three distinct clean browser lifetimes through one owned
profile and an exact predecessor chain. The owner independently checks group drain.

Four new infrastructure cases cover exact command/ownership contracts, 16 directed report corruptions,
ten missing files, and 100 generated profile histories with 14 breakage variants for each. Four
synthetic process controls plus two deliberate faults establish that successful-looking claims
cannot bypass those checks:

| Control | Expected and observed result |
| --- | --- |
| Valid synthetic reports | Pass |
| Failed summary with zero exit | Refuse summary |
| Passkey baseline claims successful finalization, zero exit | Refuse absent factor distinction |
| Wrong prior PID in reopen chain, zero exit | Refuse broken chain |
| Omit semantic reconciliation and emit failed summary | Mutant admits; baseline refuses |
| Omit predecessor check and supply the broken chain | Mutant admits; baseline refuses |

The first five rows use synthetic worker processes (all drained); the final row directly compares
isolated adapters on retained report bytes. Synthetic case/profile claims are **not Account test
executions or actual browser restarts**. The real native evidence is in the owned campaign above.
Reported PIDs are cooperative fixture observations, not OS attestations, and virtual passkey
restoration is explicitly simulated. JUnit/logs are auxiliary evidence; the owned Node census is the
case authority. This is not whole-profile residue testing, a disk quota or hostile-code confinement.

A pre-change planning run exposed a stale assertion that all Account wrappers remained blocked,
including already integrated core/preparation. `account-fixtures-before.log` preserves the one-case
failure. The test now positively checks the exact resolved core/preparation/recovery adapters while
retaining refusal checks for the other wrappers. All four planning cases pass afterward. No product
repair is inferred. The core phase's earlier Chromium abort and previous archives remain unchanged.

Inventory/manifest, scoped lint/format and whitespace checks pass. Counts remain 628 obligations,
291 required files and 272 general files/2,198 dispositions (11 not applicable). The four new tests
are cases in an existing infrastructure file. This phase resolves one command and one campaign:
**152 obligations remain unresolved — 92 command and 60 campaign, with no test-file rows**. Next is
Account authority wrapper integration. Immutable aggregate, other qualification repairs and private
Account/human rehearsal remain ahead. F-17's failed gate and explicit RC debt are unchanged.
No runtime, package/dependency, crypto-census/vector, personal browser/server/relay/device or deployment
change occurs.

Verify from the repository root:

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-recovery/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-recovery/verify.py --raw --current
```

The lossless content-addressed archive contains **181 payloads /628,533 compressed bytes**, below the
1 MiB archive bound: owned receipts/artifacts, actual JSON/JUnit/log reports, current adapter/wrapper/
fixtures/tests/plans, synthetic worker sources and receipts, both mutant sources, commands/protocol,
check logs, the initial stale-assertion failure and preservation observations. SHA-256 and exact byte
lengths bind each base64 payload. The verifier checks case census, exact reuse, artifact inventories,
real factor/root/profile evidence, synthetic outcomes, fault identities and the preserved failure.
It verifies evidence without rerunning the tests.

`raw-artifacts.json` binds the larger source/dependency and Chromium inventories in
`/private/tmp/done-wrapper-account-recovery/owned/` by hash/size. `--raw` requires those files and checks
the real report's source hashes against the frozen input snapshot. `--current` compares the archived
current code/test/plan inputs with this working tree; future edits may legitimately fail that check.
Historical receipt revisions and input identities remain unchanged. Browser profiles and unrelated
temporary fixture directories are not evidence payloads. This is bounded wrapper qualification,
not an immutable whole-release result or personal Account rehearsal.
