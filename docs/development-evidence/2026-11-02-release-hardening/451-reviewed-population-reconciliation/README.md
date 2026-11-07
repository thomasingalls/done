# Reviewed population reconciliation — phase 451

**2,573 is the correct reviewed population.** The three cases were added during
hardening but were never added to the old 2,562-case expectation. They predate the
new accepted-row guard file. Phase 450's failing result remains unchanged.

| Addition | Source and introduction | Cases |
| --- | --- | ---: |
| Worker self-envelope omission / original advance-to-one control | `test/account-sync/native-controls.test.mjs`, `303d08cf2449db9220fb628d542517b8d3935ff1`, phase 353 | 1 |
| Foreground-settlement and fixed input-quiet warm-audit control | `test/account-sync/native.test.mjs`, `a569532c74fccc70a16eb3c272afdce3a4b71231`, phase 371 | 1 |
| Warm semantic-oracle disagreement closes the owner and preserves writing on cold replay | same file/commit, phase 371 | 1 |
| New original-versus-strict accepted-row guard unit file | phase 450 | 8 |

Therefore **2,562 + 3 + 8 = 2,573**. The last old denominator update is signed
commit `30b8a9ddd9f0ac61755f9f85e25a4ad4bbb195a1` (phase 89). Compare registrations
against its exact source bytes rather than learning a denominator from a green run.

The independent projection reads every one of the **279** existing reviewed
stages at that counter commit and now. Old source yields 2,562 unique case IDs;
current existing source yields 2,565. The bidirectional set difference contains
exactly the three named additions and **zero removals**. The new guard file is a
separate eight-case population, already observed passing at runtime in phase 450;
it contributes one new reviewed stage, making 280. Six imported registration-data
inputs are byte-identical. Every currently selected browser mapping remains the
same. The sole changed relevant browser configuration changes only the approved
local dev web-server fixture command, with no project/registration change.

Current source census IDs are also checked against the compiled manifest in the
opposite direction. This checks agreement between independent artifacts; no test
body is imported/executed to infer the static population. It is population
accounting, not execution or qualification of the three native cases in this run.
The original phase 353/371 outcomes and later checkpoints remain their evidence.

Change only the old population test's title and expected value, **2,570→2,573**.
Refresh its required planning snapshot. File/stage denominators from phase 450
stay 96 reviewed Vitest files, 280 general stages and 115 reviewed Vitest stages.
No test, assertion, skip, deadline, fixture budget, gate, trust or format rule is
removed or weakened.

Rerunning the **exact failed three-file census/policy command** passes all **16**
tests. The inventory snapshot records the same 735 files / 729 required / six
excluded and remains planning data only. `git diff --check` is clean. All original
phase 450 failure material and previous patch bytes remain intact.

Keep two diagnostic observer failures: the first used the direct Node reader for
a generated registration loop; the second mistook the Playwright reader's array
return for a `.cases` object. Correct the private observer to use the actual
reader interfaces; no production reader, test source, guard or adapter changes.
The successful full projection and original observer versions are retained.

[Evidence](./evidence.json) references historical sources by exact commit/path and
pins the original local census/provenance outputs. No source archives, evidence
objects, profiles or full power logs are added. Freeze this bounded patch before
continuing the previously authorized once-each native/browser preflight. No app
or timing run occurs in this phase; no commit, push or deployment.
