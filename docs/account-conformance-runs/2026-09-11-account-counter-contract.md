# Authenticated counter and witness contracts — 2026-09-11

**Result: D4 complete; new work is unstaged/uncommitted.** D3 was committed unsigned as `24bc3a4`
and added to the signing reminder with C `d098bd4`, D1 `d24ca66` and D2 `1897848`. No production code,
persistent format or personal installation changed. D4 adds the metadata contracts and their tests.

[Contract](../account-crypto/content-counter.md), [vectors](../../test/vectors/account-counter.json),
[summary](./2026-09-11-account-counter-contract/summary.json),
[source pins](./2026-09-11-account-counter-contract/sources.json),
[preservation](./2026-09-11-account-counter-contract/preservation.json),
[patch](./2026-09-11-account-counter-contract/working.patch),
[patch manifest](./2026-09-11-account-counter-contract/patch.json).

Final execution: `node scripts/account-counter-contract/run.mjs`, Node v26.8.2,
`test-results/account-counter-contract/2026-09-11T17-54-49.173Z`, 17:54:49–18:01:02 UTC.
All **43 stages pass**, without timeout, with **806 matching input pins** after execution.
The package entry is `pnpm account:counter-contract`. Browser profiles, loopback servers and service
fixtures are disposable; bundles remain in memory. The personal app and relay remain stopped.

The phase corrects a documentation error: D3 and the earlier spool contract called content commits
strict, while the actual helper requests **relaxed durability**. Native instrumentation confirms both
the requested and effective option. This agrees with the already-open F-15 finding. Transaction
atomicity and renderer-crash recovery do not establish OS/power-loss persistence of invocation grants.
No strict-durability repair or F-15 closure is claimed. D3's historical evidence remains unchanged;
its current contract and spool prose now point to this correction.

| Evidence | Result |
| --- | --- |
| [Fixed bytes](./2026-09-11-account-counter-contract/counter-contract/fixed.json) | Eight independent cases: scoped metadata HKDF, creating/ready witnesses, two v1 counters and three v2 counters. Includes Unicode LP byte lengths, numeric generation sorting and generation keys above the array-index range. Actual helpers reproduce the messages and HMACs. Five KDF input substitutions reproduce independent results. Root ID is deliberately absent from key info and included in every metadata MAC payload. |
| [Input bindings](./2026-09-11-account-counter-contract/counter-contract/bindings.json) | 80 metadata input mutations: 47 parser refusals, 33 distinct payloads rejecting the old MAC. All 95 encoded-field omission witnesses distinguish full authentication from an omitted message while WebCrypto HMAC remains operative. These witnesses are not 95 source mutants. |
| [Parsers](./2026-09-11-account-counter-contract/counter-contract/parsers.json) | 88 malformed structured-clone cases refuse. Missing/unknown keys, invalid generation/count/sum bounds, malformed MAC and spool objects are checked; MAC/reserved/spool data are detached. Negative zero serializes as zero. There is no invented canonical JSON wire parser for these stored objects. |
| [Generated allocation histories](./2026-09-11-account-counter-contract/counter-contract/properties.json) | 200 histories, seed 5110918, with 1,443 successful reservation steps and 13 ceiling refusals. An independent integer ledger checks allocation, generation changes and preserved witness state; retained counters are reparsed, reordered, reauthenticated and tampered with. Shrinking enabled; no failure and no shrink occurred. Later-generation cases qualify helper syntax/accounting, not a production rotation protocol. |
| [Helper controls](./2026-09-11-account-counter-contract/counter-contract/controls.json) | Six actual source changes remove root/state/spool message bindings, exact MAC comparison, allocation-sum validation or the reservation ceiling. The weakened paths accept their counterexamples while baseline checks refuse. Crypto success results are not forced true. |
| [Native custody](./2026-09-11-account-counter-contract/counter-native/native-kdf.json) | Actual factor-opened custody metadata derivation matches independent info/HMAC bytes. V1 initializes, V2 activates, one event cold-reopens, and an ordinary reader refuses V2. The test independently checks stored counter/witness MACs; its additional synthetic key derivation is not the sole evidence for the production call. |
| [Authentic semantic lies](./2026-09-11-account-counter-contract/counter-native/native-semantic.json) | Eight correctly MACed substitutions refuse: counter intent, active generation, reserved range, ledger hash/count, per-generation ceiling, witness intent and creating state. A valid MAC does not replace the corresponding owner checks. |
| [Native atomicity](./2026-09-11-account-counter-contract/counter-native/native-atomic.json) | Aborting the final native transaction retains the already-burned reservation but neither event nor witness advancement. Retry consumes a fresh reservation and commits one event. Instrumentation records relaxed durability; this is not a power-loss test. |
| [Native MAC race](./2026-09-11-account-counter-contract/counter-native/native-race-control.json) | Changing the stored MAC after asynchronous authentication causes refusal before sealing. Removing only the actual MAC comparison overwrites the changed metadata and commits. This exercises the same helper control at a real transaction boundary. |
| [Reservation control](./2026-09-11-account-counter-contract/counter-native/native-reservation-control.json) | Removing actual reservation persistence invokes AES with no retained allocation. The later rewind guard still refuses the operation, but cannot undo that invocation. Baseline persists allocation first. This is a seventh distinct source modification, in addition to the six helper controls. |
| Existing Account owners | All 41 native regressions pass: [spool](./2026-09-11-account-counter-contract/spool-regressions.log) 24 and [receive](./2026-09-11-account-counter-contract/receive-regressions.log) 17. Includes eight generated spool histories and twelve generated receive histories, commit cuts/renderer death, authenticated false service evidence, pending updates, compaction, close/fence checks and missing tails. Spool retains stop-on-first-failure; receive permits shrinking. |
| [Registry controls](./2026-09-11-account-counter-contract/registry/counter-registry-controls.json) | Nine additional omission controls enforce D4 corpus, MAC owner, native ledger dependency, parser/owner obligations, source occurrence, primitive role and negative/omission data even after repinning altered corpora. |
| [Units](./2026-09-11-account-counter-contract/unit.log) and tools | All 983 units in 88 files, typecheck, retained A/B/C/D1/D2/D3 contracts, all 26 vector commands and targeted lint/format pass. |

The first campaign was intentionally interrupted during receive regressions after review found a fixture
conversion issue: a missing MAC could throw before calling the production parser. The corrected helper
preserves missing fields, and these refusal checks now require the runtime's `repair-required` code.
The interrupted run, its exact earlier fixture and the explicit stop reason are
[preserved](./2026-09-11-account-counter-contract/preliminary/interruption.json). No runtime failure
caused that interruption. The final campaign uses and verifies the corrected source pins.

The oracle imports no production encoder/parser/KDF. It shares Node/OpenSSL primitives with some runtime
paths; independence means byte reconstruction and the allocation model, not a second cryptographic
primitive implementation. The new native owner fixtures use synthetic slot authority and the actual
chain verifier, not a real Account ceremony. The existing spool/receive suites supply their separate
full-composition evidence. No new runtime defect was reproduced; only the durability prose was corrected.

Four D4 constructions are now specified. The registry has 63 specified, four open and one non-crypto
exclusion; the map has 61 entries, 75 permitted-root chains and 15 swept documents. The runtime census
remains 158 sources and 89 labels/templates. The unfinished shared-store record retains the store,
store-name and journal constructions instead of silently qualifying them with counter evidence.

Next is **D5: inherited store and synchronous journal byte bridges**. Remaining custody, checkpoint/
startup, migration provenance, F-05/F-06, F-15 and wider Account readiness remain open. All 21 personal
package hashes, 26 prior tracked vector files, historical review and L-2 are preserved. No real Account,
factor, operator secret or pin was provisioned, and no personal build/server was started.
