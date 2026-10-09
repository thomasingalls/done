# Retained Local claim contracts and inherited provenance — 2026-09-11

**D8 complete; new work remains unstaged/uncommitted.** D7 was committed signed as `5555238`.
The seven earlier unsigned C/D1–D6 commits were recreated with verified signatures, unchanged trees,
messages and author/committer metadata. The [exact mapping](./2026-09-11-signed-contract-history.json)
records both chains. Original commits remain reachable through
`codex/pre-sign-contract-history-2026-09-11`; historical evidence references remain valid. No push or
other branch rewrite occurred. The signing reminder is paused because all eight signatures verify `G`.

[Contract](../account-crypto/local-provenance.md), [vectors](../../test/vectors/account-local-provenance.json),
[summary](./2026-09-11-account-local-provenance/summary.json),
[source pins](./2026-09-11-account-local-provenance/sources.json),
[preservation](./2026-09-11-account-local-provenance/preservation.json),
[patch](./2026-09-11-account-local-provenance/working.patch),
[patch manifest](./2026-09-11-account-local-provenance/patch.json).

Execution: `node scripts/account-local-provenance/run.mjs` (package command
`pnpm account:local-provenance`), Node v26.8.2.
Run: `test-results/account-local-provenance/2026-09-11T19-54-07.896Z`.
Started 2026-09-11T19:54:08.022Z; completed 2026-09-11T19:56:20.534Z.
All **50 stages pass**, without timeouts, and **864 source pins match** after execution.
Production code, stored formats and the prior vector corpus are unchanged.

Four remaining labels are live Account dependencies: the Local claim key, fresh progress MAC,
selected-import MAC and cleanup wrapper. Promotion preflight and persisted startup still authenticate
the retained Local claim. Imported selection and cleanup fields therefore cannot be excluded simply
because migration finished. The cleanup parser and payload encoder remain inside current evidence.

Eight other labels receive four separate `inherited` dispositions: Local clear, pre-active import,
legacy-source observation and cleanup fingerprints. They remain cryptographic constructions outside
current Account acceptance, with pinned historical contracts/evidence and native boundary controls.
This is not fresh whole-Local or migration qualification. The registry enforces their exact labels,
primitive roles, scope, evidence and operational boundaries; it reports them separately from specified
and non-crypto constructions.

| Evidence | Result |
| --- | --- |
| [Fixed bytes](./2026-09-11-account-local-provenance/local-provenance-contract/fixed.json) | Eight independent key/fresh-stage/imported/cleanup-v1/v2 cases match current helpers and real HMAC verification. Initial custody is independently factor-sealed and authenticated. |
| [Bindings](./2026-09-11-account-local-provenance/local-provenance-contract/bindings.json) | 51 discriminating field mutations and 46 encoded-field omission witnesses. |
| [Actual input leaves](./2026-09-11-account-local-provenance/local-provenance-contract/input-leaves.json) | 230 mutations: 190 parser refusals and 40 cryptographic refusals, reported separately. |
| [Source controls](./2026-09-11-account-local-provenance/local-provenance-contract/source-controls.json) | Seven real-source omissions cover key scope/root, initial MAC, stage, selecting MAC, cleanup cursor and cleanup digest. The weakened stage authenticator accepts a changed stage, proving the control is effective. |
| [Framing](./2026-09-11-account-local-provenance/local-provenance-contract/framing.json) | An 81,200-byte cleanup-v2 wrapper authenticates; v1 refuses its LP overflow. JSON escaping keeps lone UTF-16 units distinct from replacement characters. Both valid stored versions remain unchanged. |
| [Claim properties](./2026-09-11-account-local-provenance/local-provenance-contract/properties.json) | 250 shrinking-enabled histories, seed 5110940, cover stages, imported provenance, cleanup versions/cursors, round trips and changed fields. No counterexample. |
| [Native claim owners](./2026-09-11-account-local-provenance/local-provenance-native/native-claims.json) | Fresh/imported/cleanup-v1/v2 claims traverse actual preparation, admission and handoff. Offline cold Account classification preserves storage and the exact claim; the MAC independently reconstructs from factor-opened synthetic custody. Four throwing operational barriers remain uncalled, and four direct probes prove they are installed. |
| [Native MAC control](./2026-09-11-account-local-provenance/local-provenance-native/native-mac-control.json) | A damaged claim MAC refuses before promotion; omitting verification admits preflight. After promotion, the marker's exact claim-MAC binding still refuses the damaged claim. Restoring original bytes reopens Account. |
| [Native blockers](./2026-09-11-account-local-provenance/local-provenance-native/native-blockers.json) | A pre-active import row, malformed Local-clear row and valid-shaped unauthenticated clear row refuse Account access without writes or invoking excluded crypto/deletion owners. |
| [Native properties](./2026-09-11-account-local-provenance/local-provenance-native/native-properties.json) | 20 shrinking-enabled fresh-scope histories, seed 5110941, mutate imported/cleanup fields and cursors, refuse without writes and reopen after exact restoration. No counterexample. |
| [Inherited Local genesis](./2026-09-11-account-local-provenance/local-genesis-native/native/report.md) | Seven selected claim/content/ready/index crash, commit-abort, missing-state and authentication cases pass. Both matching source mutants are detected: forgotten completed stage and skipped progress authentication. This is the named subset, not a new full migration campaign. |
| [Registry controls](./2026-09-11-account-local-provenance/registry/local-provenance-registry-controls.json) | Ten controls reject missing live obligations, hiding a live claim, absent/stale historical evidence, absent native barriers, primitive erasure and non-crypto disguise. |
| [Units](./2026-09-11-account-local-provenance/unit.log) and tools | 983 tests in 88 files, typecheck, earlier A/B/C/D1–D7 helper contracts, 30 vector commands, authority map, census, lint and formatting pass. D8 adds six helper tests and four native tests. |

The independent encoder uses Node/OpenSSL without production byte builders. Browser WebCrypto may
share primitive implementations; independence here concerns byte reconstruction. Source controls alter
disposable in-memory bundles with unique-anchor assertions, never production files. Imported native
provenance is synthetically factor-authenticated: earlier migration campaigns remain the evidence for
its original creation ceremony. The barriers establish the tested paths, not universal reachability.

The native campaign includes incomplete cleanup cursors. A valid MAC authenticates retained progress;
it does not prove source absence or successful deletion. Account startup does not require completion or
invoke cleanup. The separate Local-clear owner checks completion/source absence. D8 preserves this
existing contract and does not restart source migration or host-exclusion research.

No production counterexample was found. Preliminary harness corrections fixed omission-tuple indexing,
a byte mutation that hex decoding had truncated into a no-op, payload size for the v1 overflow witness,
an expected preflight result name, and the old registry test's assumption that an open group still existed.
They are not runtime defects. All final evidence above comes from the single passing frozen campaign.
Renderer death, logical buffer clearing and transaction completion do not establish power-loss durability,
forensic erasure, clone/restore safety or whole-profile residue results.

The registry now has **78 specified, zero open, four inherited outside Account acceptance and one
non-crypto exclusion**. The map has 80 entries, 102 permitted-root chains and 19 swept homes. The runtime
census remains 158 sources and 89 labels/templates. All 21 personal package hashes, 30 prior tracked
vector files, production sources, historical review and L-2 match the baseline. Personal preview/relay
remain stopped; no real Account, factor, operator key, browser, pin, origin or routing was changed.
Unrelated root files remain untouched. The [raw inventory](./2026-09-11-account-local-provenance/raw-files.json)
hashes all 607 run files; 177 reports/logs and changed mutant sources are preserved exactly.
Redundant frozen source copies are omitted and reconstructible from the signed base, patch and runner.

**Next: aggregate A/B/C/D1–D8 closure review for F-05/F-06.** Reconcile runtime coverage, primitive roles,
exact byte homes, executed fields, effective controls and inherited limits before making an explicit
disposition. Zero open labels is necessary, not sufficient. F-15, other accepted review findings and
broader Account/release gates remain separate; this phase does not authorize real provisioning.
