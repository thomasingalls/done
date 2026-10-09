# Account authority wrapper — 2026-09-15

Signed base: `4e8a8f3a` (recovery wrapper integration). This phase runs the actual authority wrapper
with all five files in their original order, default Node file concurrency, its 120s campaign bound
and 5s grace. Owned execution adds terminal reporting, a disposable CDP browser and retained output;
existing spec/JUnit reporters and standalone behavior remain. This phase is uncommitted here.

The final owned epoch passes **81 cases in six executions**: 21 manifest, five general-planning,
12 generated-planning, four Account-fixture planning, 14 actual authority and 25 recovery regression
cases. Authority takes **30.635s /120s** and recovery 11.021s /120s. The authority campaign includes
160 generated service histories and 40 generated browser preflight histories, independent proof bytes,
encrypted-root recovery, competing initialization/SIGKILL, Local database+journal reads and cancellation
exclusion. All worker/browser groups drain. A seventh request reuses the exact authority receipt and
revalidates its six files after the recovery regression. Reports survive copied-checkout deletion.

The six required reports are sources.json, summary.json, results.xml, run.log, control-pin.json and
control-nonce.json. The complete tree, including optional counterexamples, is bounded to 4 MiB /
32 entries /one level. Reconciliation requires the exact terminal census and totals, a successful
summary/code/no timeout or launch error, source hashes matching the owner snapshot (including src/crdt
and the generated sealer), and the two specific control distinctions:

- The pin control records baseline refusal and mutant acceptance of an actual substituted root,
  with the requested nonce and policy unchanged.
- The nonce control records baseline refusal and mutant acceptance of an old challenge response,
  with the expected pin unchanged.

The adapter independently verifies both archived Ed25519 signatures using Node crypto and explicit
length-prefixed message bytes. A valid self-signature supplies neither a trusted root nor freshness.
The complete case census demonstrates that the test bodies ran their assertions; JSON labels alone
are not execution credit. The owned Node census is the case authority, with JUnit/logs as auxiliary
evidence rather than independently parsed or separately credited test oracles.

Four new infrastructure cases cover exact invocation/ownership contracts, eleven directed report
corruptions, six missing files and 100 generated signed control pairs with ten invalid variants each.
The generated pairs use fresh signing keys and seeded service-ID/nonce inputs. Synthetic process
controls and isolated faults exercise the runner's refusal path:

| Control | Expected and observed result |
| --- | --- |
| Valid synthetic evidence | Pass |
| Failed summary with exit zero | Refuse summary |
| Pin control uses the expected root, exit zero | Refuse absent root substitution |
| Nonce control uses the requested challenge, exit zero | Refuse absent replay |
| Invalid signature, exit zero | Refuse signature |
| Omit semantic reconciliation; emit failed summary | Mutant admits; baseline refuses |
| Omit signature verification; supply damaged proof | Mutant admits; baseline refuses |

The first six rows are synthetic process runs; all groups drain. The last directly compares isolated
adapters on the retained report bytes. Both deliberate faults discriminate. Synthetic case claims are
**not Account test executions**. The real campaign is the owned epoch above. These checks do not claim
whole-profile residue protection, hostile-code confinement or personal Account readiness.

Inventory/manifest, scoped lint/format and whitespace checks pass. No new validation failure occurs;
previous failure archives remain intact. The planning test now positively checks authority's resolved
contract while retaining blocked assertions for unintegrated wrappers. Counts stay 628 obligations,
291 required files and 272 general files/2,198 dispositions (11 not applicable); four cases were added
to an existing infrastructure file. One command and one campaign resolve: **150 remain unresolved —
91 command and 59 campaign, with zero test-file rows**. Next is Account promotion wrapper integration,
then remaining wrappers/qualification repairs, immutable aggregate and private Account/human rehearsal.
F-17's failed gate and explicit RC debt remain unchanged. No runtime, package/dependency, crypto-census/
vector, personal app/server/relay/device or deployment change occurs.

Verify from the repository root:

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-authority/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-authority/verify.py --raw --current
```

The lossless content-addressed archive retains **176 payloads /594,550 compressed bytes**, below the
1 MiB archive bound: owned receipts and reported artifacts, actual JSON/JUnit/log files, current
adapter/wrapper/tests/plans, synthetic sources/receipts, both mutant sources, prospective protocol,
commands, check logs and preservation observations. SHA-256 and byte lengths bind each base64 payload.
The verifier checks case census, exact reuse, artifact/tree hashes, control relationships, synthetic
outcomes and mutant identities. It verifies the archive without rerunning cryptographic checks or
test campaigns; signature-check execution is evidenced by the retained stage and fault receipts.

`raw-artifacts.json` binds the larger source/dependency and Chromium inventories under
`/private/tmp/done-wrapper-account-authority/owned/` by hash/size. `--raw` needs those files and checks
the real source report against the frozen input snapshot. `--current` compares archived current
code/test/plan inputs with this working tree; future edits may legitimately fail that comparison.
Historical receipt revisions/input identities remain unchanged. Browser profiles and unrelated
fixture directories are not evidence payloads. This is bounded wrapper qualification, not an
immutable whole-release result or personal Account rehearsal.
