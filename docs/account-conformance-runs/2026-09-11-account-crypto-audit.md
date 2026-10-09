# Aggregate Account byte-contract audit — 2026-09-11

**F-05 and F-06 close for the current private first-epoch Account protocol.** The
[review and individual dispositions](../review/implementation/account-crypto-closure.md) explain why,
including the limits of inherited Local/migration evidence. D8 was committed signed as `393ef43`;
all nine C/D1–D8 commits verify `G`. New audit work remains unstaged/uncommitted.

[Summary](./2026-09-11-account-crypto-audit/summary.json),
[construction/evidence crosswalk](./2026-09-11-account-crypto-audit/crosswalk.json),
[source pins](./2026-09-11-account-crypto-audit/sources.json),
[historical source comparison](./2026-09-11-account-crypto-audit/prior-evidence.json),
[preservation](./2026-09-11-account-crypto-audit/preservation.json),
[patch](./2026-09-11-account-crypto-audit/working.patch),
[patch manifest](./2026-09-11-account-crypto-audit/patch.json).

Execution: `node scripts/account-crypto-audit/run.mjs` (also exposed as `pnpm account:crypto-audit`),
Node v26.8.2; 2026-09-11T20:33:41.153Z–2026-09-11T20:47:20.534Z.
Run: `test-results/account-crypto-audit/2026-09-11T20-33-40.590Z`.
All **71 stages pass**, with **870 matching source pins**, no timeouts or skipped tests.
There are **237 Node tests in 36 files**, including all **27 registry-declared files**
and **100 tests in 11 native files**. The separate slot-unlock/v2 transport unit bridges
and all **30 vector commands** pass. The runner rejects empty/skipped/failed Node test reports and
checks that every declared test file executed; those checks do not infer semantic coverage from counts.

| Phase | Specified constructions | Fixed cases | Published input negatives | Encoded omission controls |
| --- | --- | --- | --- | --- |
| A | 17 | 17 | 399 | 333 |
| B | 6 | 13 | 64 | 64 |
| C | 24 | 37 | 314 | 314 |
| D1 | 4 | 8 | 39 | 24 |
| D2 | 2 | 16 | 2931 | 2938 |
| D3 | 6 | 20 | 234 | 118 |
| D4 | 4 | 8 | 85 | 95 |
| D5 | 4 | 11 | 53 | 44 |
| D6 | 5 | 15 | 135 | 115 |
| D7 | 2 | 6 | 27 | 15 |
| D8 | 4 | 8 | 51 | 46 |
| Total | 78 | 159 | 4,332 | 4,106 |

Corpus counts are heterogeneous: parser refusals, changed encodings and primitive omission controls
are not all full-owner adversarial histories. The source review inspected the actual encoder/comparison
loops, verifier tests and effective controls, with their reported boundaries. Independent encoders import
no production byte builders; Node/OpenSSL and browser WebCrypto may share primitive implementations.
The current registry has four separately inherited groups outside Account acceptance and one non-crypto
exclusion in addition to these 78 specified constructions. Map: 80 entries/102 permitted-root chains/
19 swept homes. Runtime census: unchanged 158 files/89 labels/templates/six manual entrypoints.

The campaign freshly executes current byte, MAC/AEAD/signature, parser, genuine wrong-evidence,
source-omission and generated tests across A/B/C/D1–D8. Native capture/spool/delivery/receive owners
exercise their retained crash, aborted-commit, replay, journal/compaction, lifecycle and witness controls.
Native D2/D4–D8 tests link the byte helpers to actual persisted owners. Recovery crypto/properties,
service process restart, browser recovery and HPKE bridges also execute. Historical generated tests
retain their existing seeds and shrinking settings; no claim that all inherited properties shrink is made.

No runtime defect was found. Only stale construction/checker status reporting was corrected. The new
aggregate runner and current disposition document make the closure evidence reproducible; the normal
authority/inventory checkers report registration/classification without declaring a finding closed.
Production code, stored formats, current vectors and all existing tests are unchanged.

The [historical comparison](./2026-09-11-account-crypto-audit/prior-evidence.json) retains the prior
successful summaries and lists source drift: B's recovery export check, D1's service export/custody
repair and new keyEncoding helper, and D6's record-state parser. D6–D8 production pins match current
source. Older receipts remain evidence at their original source; they are not rewritten after signing
or relabelled as current execution. The D8 full suite receipt (983 tests/88 files) is retained; this
audit reruns the directly referenced unit bridges, rather than repeating the unchanged full unit suite.

The [manual primitive query](./2026-09-11-account-crypto-audit/primitive-sites.txt) supported navigation
through sign/verify, KDF, AEAD and digest calls. It includes wrappers/imports and is not an exhaustive
primitive census or call-graph proof. The review separately dispositions standard HPKE/WebAuthn,
unlabelled hashes, Local custody/WASM and migration-only digest producers. Dependencies, other languages,
future call paths and arbitrary string assembly are not qualified merely by the prefix scan.

The retained Local cleanup MAC authenticates progress, not plaintext absence. The first-genesis-only
head-vector and checkpoint rules do not define successor epochs. Recovery payload agreement does not
implement replacement or total-loss recovery. No renderer-kill or logical clearing test establishes
power-loss persistence or whole-profile erasure. F-15 and the other Account/release gates remain open.

All 257 raw campaign files are preserved exactly in the
[raw manifest](./2026-09-11-account-crypto-audit/raw-files.json). All 21 personal package hashes,
31 prior tracked vector files, historical review and L-2 are preserved. Personal preview/relay remain
stopped; no personal browser, Account, factor, operator key, pin, origin or routing change occurred.
Unrelated root files remain untouched. Native fixtures use synthetic SQLite/Chromium/loopback contexts
and in-memory bundles; the personal package was not built.

**Next bounded phase: F-15 reservation durability, starting with the failure model and transaction
inventory.** Identify which custody/content reservations and network-attempt grants must survive before
encryption can execute; specify strict persistence/refusal and test lost-unflushed-grant schedules
without treating native renderer death as an OS durability test. Restore/clone branching and general
release qualification stay separate. No real Account provisioning is authorized by this audit.
