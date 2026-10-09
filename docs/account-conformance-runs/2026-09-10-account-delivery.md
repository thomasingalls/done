# Private Account durable delivery evidence — 2026-09-10

Signed `81a4655` commits the preceding response/proof phase. This checkpoint implements the private v8
lifecycle owner for exact signed first-attempt submissions and authenticated response evidence.
[Implementation contract](../account-delivery.md).

The campaign is `test-results/account-delivery/2026-09-10T21-36-17.043Z`.
[Summary](./2026-09-10-account-delivery/summary.json),
[447 source hashes](./2026-09-10-account-delivery/sources.json),
[generated histories](./2026-09-10-account-delivery/generated.json), and
[evidence manifest](./2026-09-10-account-delivery/manifest.json) preserve the inputs and outcomes.

| Evidence | Result and scope |
| --- | --- |
| Focused unit suite | Four tests pass; 500 generated histories, seed 9812026, each 1–40 proofs; independent accumulated-proposition oracle checks every prefix and reverse order |
| Native delivery suite | 19 tests pass, 212.31 seconds; reader fence, exact first/next submission, commit abort/renderer death on both sides, no-op invalid/duplicates, missing rows, closure/conflict/finalization, compaction and Local editing |
| Native generated histories | Eight, seed 9812027; 3–6 responses after a before/after submission commit fault; independently signed proofs, exact retry, record-count/status/eligibility oracle, retention and cold restart |
| Persistence and witness controls | Returning before persistence exposes unsaved signed bytes; omitting witness verification permits missing closure to resurrect pending work |
| Prefix control | Actual leaf-only mutation misses a contradiction in both orders; the real reader derives conflict from those retained proofs |
| Authority and cancellation | Closing drains paused signing before releasing exclusion; restored prior authenticated authority refuses before commit, while an omitted-recheck control persists the submission |
| Spool regression | Six unit/property tests and 24 native cases pass, including eight generated crash histories |
| Response regression | 12 unit/property tests and six native cases pass, including eight generated histories and five verifier controls |
| Content compaction regression | All 21 directed cases pass; eight guard-removal controls expose their intended failures |
| Full unit suite | All 873 tests in 78 files pass on the unchanged rerun after browser completion |
| Static/build/gates | Isolated application build, TypeScript, scoped lint/format and 13 gates; outputs retained in adjacent logs and JSON |

Every new proof/submission commits with its next authenticated completeness witness. Cold readback derives
status from original signed bytes. Acceptance suppresses pending delivery without deleting sources or
wrappers. A signed head proves the whole reconstructed local prefix, making earlier closures contradictory
in either order. Valid contradictory evidence halts outbound work and retains Local editing; invalid or
missing ledger evidence refuses opening. This distinguishes an authenticated service inconsistency from
unauthenticated storage damage.

[Findings and scope](./2026-09-10-account-delivery/findings.json) retain both initial diagnostics. The first
retention assertion required the entire capsule array to stay identical across reopen, which added an
empty Yjs capture; it now checks exact retention by original identity. The first full unit run overlapped
several browser campaigns and the existing 150-history spool test exceeded its five-second timeout without
reporting a counterexample. The unchanged full suite passes after browser completion; no timeout was raised.
No implementation/design counterexample was demonstrated by this phase's generated campaign. Actual
controls substantiate the tested guards, not whole-protocol correctness.

The campaign is wired as `pnpm account:delivery` and into `pnpm check` before all final source snapshots.
Direct Node entrypoints ran these campaigns; no whole `pnpm check` execution is claimed. Source hashes in
both Account regressions and the compaction report are checked against the same current files. The build
uses `test-results/account-delivery/app-build`, preserving the author's retained release and predecessor.

This phase owns only the first authenticated private epoch. It adds no relay dispatch, permanent service
decision issuer, successor minting, lineage advancement or real Account provisioning. All source and ledger
rows remain retained; full scans/backlog performance and coordinated metadata+ledger rollback remain limits.
The personal preview and relay remain stopped. Next is durable service acceptance/refusal decisions before
an encrypted relay round trip.
