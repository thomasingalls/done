# Admission coverage and size campaign — 2026-09-12

Baseline: signed `3b0a1ba54ead617bf1c994fffbaa1844b4a59eec`. Command: `node scripts/account-admission-evidence/run.mjs`
(also `pnpm account:admission-evidence`). Node `v26.8.2`.
UTC execution: `2026-09-11T23:21:10.757Z` through `2026-09-11T23:26:29.716Z`.

**Passed: 44 stages, 75 Node tests, 898 unchanged source pins.**
Types, all 30 vector commands, census/map/registry, lint and format pass. No skips or stage timeout.
No production code, protocol format, byte limit, registry or vector changed.

| Stage | Executed tests |
| --- | ---: |
| registry | 13 |
| receipt | 3 |
| size | 9 |
| bounds-protocol | 5 |
| bounds-native | 6 |
| first-authority | 6 |
| genesis | 14 |
| admission | 15 |
| checkpoint | 4 |

[Source pins](./2026-09-12-account-admission-evidence/sources.json),
[summary](./2026-09-12-account-admission-evidence/summary.json), logs/JUnit and structured reports are
in [the archive](./2026-09-12-account-admission-evidence/). Its 105 original JSON/log/XML files are
byte-identical to `test-results/account-admission-evidence/2026-09-11T23-21-10.623Z`. This new phase is complete, unstaged/uncommitted.

## New evidence and credited regressions

Twelve new native test cases execute the remaining F-21.2 receipt and size boundaries:

- Two directed service-issued SV/DS lies refuse at lost-`begin`, final answer through challenge's
  committed receipt, and cold retained-receipt paths. Signatures are independently checked with
  Node/OpenSSL, and decrypted checkpoint replay yields different real descriptors.
- Twelve generated text/disk/journal/arrival histories exercise lost reply and cold receipt refusal.
  Seed `1121026`; 12 runs, 0 shrinks, no failure/counterexample.
  [Fast-check result and histories](./2026-09-12-account-admission-evidence/receipt/receipt-generated.json)
  are retained. This is one generated test case, not twelve additional Node cases.
- Three real retained Yjs text snapshots encode to 16 MiB minus one, exactly the limit, and one byte
  above. Allowed sizes seal once and cold retry returns the same candidate without further writes or
  seals. The larger one refuses before encryption or writes. Cold replay/source hashes remain exact.
- Six explicitly injected SV/DS descriptor pairs exercise actual combined byte-limit edges with either
  field dominant. Over-limit input refuses before `admission-requested` and `begin`; the real retained
  source completes admission after removing injection. These are not huge Yjs coverage histories.

Three distinct production-source omissions are effective in test bundles: dropping local parts from
retained receipt verification returns the false receipt; dropping the coverage preflight writes
`admission-requested` and reaches `begin`; dropping the early snapshot bound performs checkpoint
encryption before the later candidate parser refuses. No signature bypass or production test API is
introduced. Correctly MACed lying carriers and descriptor injection are explicit fixture boundaries.

The earlier admission-bounds protocol/native campaign already covered v2/old LP compatibility, real
long Yjs histories, full protocol byte limits, signed offered lies and a lowered owner limit. Those
checks pass again, as do A, native D7, native genesis and native admission (including their existing
generated/cut/retry evidence). They retain their own seeds/scope; they are not relabelled as new cases.

## Failed focused attempts and limits

A sandboxed attempt failed on loopback `listen EPERM` before application cases could run. Disposable
native execution then ran with the required process permissions. One focused coverage loop failed
because its inherited setup helper retained a page that a previous iteration closed. The new cases
now use separate fixture lifetimes; the full new focused suite subsequently passed all twelve cases.
The generated receipt suite also creates and disposes a fixture per history, including shrink attempts.
These were harness/environment issues, not a reproduced production defect. No verbatim focused console
archive exists; the archive above contains the complete final campaign outputs.

No production defect was found. Full Vitest, aggregate crypto audit, unrelated Account/storage campaigns,
other supported-platform/power-loss qualification, real enrollment capacity and whole-profile residue
were not tested by this phase. Native execution uses disposable Chromium and loopback services. New
bundles stayed in memory; the personal servers stayed stopped.

[Preservation](./2026-09-12-account-admission-evidence/preservation.json) verifies 21 personal package
hashes, 31 prior vector files, historical review and L-2. All fifteen recent signatures verify `G`.
The prior delivery campaign's 893 source pins agree with committed/current files; only the current
package script differs. Unrelated root files and the personal Local installation remain untouched.

See the [inventory and test contract](../account-admission-evidence.md) and
[current F-21.2 disposition](../review/implementation/account-admission-evidence.md).
