# Approved census repair checkpoint — phase 450

**Stopped on the first failing validation command, as the operator requested.**
Typecheck, lint and all eight permanent guard tests pass. The selected
release-validation census/policy command passes 15 tests and fails one:
`test/release-validation/general-tests.test.mjs:36` observes **2,573** reviewed
cases against the proposed expectation **2,570**. The three-case difference is
unreconciled. Do not merely raise the count or declare it stale without provenance.
The first failing result and all logs remain. No browser spec or timed cell runs.

## Approved repair and permanent controls

`test/inbound-native/fixtures.ts` changes exactly the four Playwright matcher calls
(kind, credential, position, digest) to strict Node assertions, plus the import.
An independent inverse edit restores the **entire original file byte for byte**.
No decoder, SQL, branch, loop, return or existing non-accepted-kind throw changes.
Other helper functions still use their original Playwright assertions.

`test/acceptedRows.test.ts` preserves the exact original census implementation as
a test-only oracle, with only its function/expect binding names rebased. Its
inverse proof restores that original function byte for byte. Eight unit cases
cover valid census equality; wrong kind, credential, position, digest; malformed
submission and response; and both SQL branches/duplicate counts. The synthetic
source database is constructed and closed; **each census reads a private copy**.
Every case checks source bytes and the source directory's exact file list, so a
read-only SQLite sidecar cannot silently alter a source fixture. No account/profile
or network credential is used. The test passes eight cases in 533 ms overall.

The new file is explicitly registered in the existing reviewed Vitest policy.
The planning inventory snapshot records 735 files / 729 required / six excluded,
with all previous obligations retained. The proposed exact-denominator fixture
adds the expected eight cases (2,562→2,570), one reviewed file and one stage. Its
runtime check instead finds 2,573. This pending discrepancy keeps the checkpoint
red; registration does not grant aggregate execution credit.

## Check outcomes

| Command | Outcome |
| --- | --- |
| Typecheck | pass |
| Existing lint rules | pass |
| New permanent guard unit file | 8 passed |
| Inventory/policy and reviewed-population tests | 15 passed, 1 failed: 2,573 versus 2,570 |

The inventory `--record` operation succeeds as planning data only. It does not
execute tests or settle the reviewed-population discrepancy. Keep the failed
proposed expectation in this checkpoint; no follow-up repair or rerun has occurred.
No deadline, skip, guard, population limit, trust or format changes.

All five fairness cases (including the genuine unfair-build sensitivity),
past-index, dense, group-cut, idle and owners remain **unrun in this phase**. Their
bodies/configurations are unchanged. The timed-path assertion-loop audit is not
complete and no host-clear handshake or Stage 5 timing begins. Existing app-code
checkpoint/preflight evidence is not regraded.

The operator's separate 250 ms batch-cap observation is recorded in the hardening
plan for Stage 6: genuine service load can end a batch before a quiet suffix and
remove the shortcut, leaving native rotation after up to eight busy logical
positions. That is not a wall-time promise. This is an existing-code observation,
not a new load measurement, cap change or gate waiver.

[Evidence](./evidence.json) pins committed unchanged sources, the changed working
files and original local logs separately. No evidence-object files, source archives,
profiles or full power logs are added. Sequential patch 450 is a **non-green
checkpoint** for review, not a release-ready commit. Stop here; no commit, push,
publication or deployment.
