# Local promotion contracts — 2026-09-11

**Result: D2 complete; new work is unstaged and uncommitted.** Group C was committed unsigned as
`d098bd4`, D1 unsigned as `d24ca66`, at the user's request. A separate reminder was scheduled to sign
them later. This phase changes documentation, test/vector tooling and construction registrations only.
No production code, carrier version, persistent bytes, real Account or personal installation changed.

[Byte contract](../account-crypto/local-promotion.md),
[fixed corpus](../../test/vectors/account-promotion.json),
[summary](./2026-09-11-account-promotion-contract/summary.json),
[source pins](./2026-09-11-account-promotion-contract/sources.json),
[preservation](./2026-09-11-account-promotion-contract/preservation.json).

Final execution: `node scripts/account-promotion-contract/run.mjs`, Node v26.8.2, run
`test-results/account-promotion-contract/2026-09-11T16-18-15.927Z`, 16:18:16–16:22:07 UTC.
All **41 stages pass**, without timeout, and **781 input pins** match after execution.
The package entry is `pnpm account:promotion-contract`; the installed Node entry was run directly.
Native cases use disposable SQLite, loopback servers and Chromium profiles; Vite builds stay in memory.

| Evidence | Result |
| --- | --- |
| [Fixed stage bytes](./2026-09-11-account-promotion-contract/promotion-contract/fixed.json) | Thirteen accepted stage/version combinations reproduce the independent MAC payload and HMAC. A fixed derived-key case and two deterministic digest cases bring the published corpus to 16. WebCrypto keys remain non-extractable with sign/verify usages. |
| [Input bindings](./2026-09-11-account-promotion-contract/promotion-contract/input-bindings.json) | 2,912 input-leaf changes: 1,841 parser refusals and 1,071 changed payloads whose old MAC refuses. Includes nested signatures, typed byte arrays, nulls and empty arrays. Per-stage files retain every outcome. |
| [Encoded omissions](./2026-09-11-account-promotion-contract/promotion-contract/encoded-omissions.json) | 2,938 independent encoded omissions, including fields inside the double-serialized pending object. Changed values invalidate the full HMAC; deleting the field makes the pair indistinguishable. These are byte-level witnesses, not 2,938 production-source mutants. |
| [Parser boundaries](./2026-09-11-account-promotion-contract/promotion-contract/parser.json) | 449 directed refusals: stage/version mismatch, removed/extra fields, wrong MAC lengths, malformed source, credentials, seal budget and handoff binding. |
| [Ordering](./2026-09-11-account-promotion-contract/promotion-contract/ordering.json) | Reconstructed object order is invariant. Handoff destination order is retained: reordering most destination properties changes the MAC; reordering its unlock binding refuses structurally. Genesis actor reversal refuses. |
| [Names and KDF](./2026-09-11-account-promotion-contract/promotion-contract/identities.json) | Exact info/key and lineage/attempt results; changed included inputs bind, deliberately omitted context fields stay omitted. Unicode custody framing and ASCII lineage constraints are distinguished. |
| [Generated authentication histories](./2026-09-11-account-promotion-contract/promotion-contract/properties.json) | 200 histories, seed 5110916, 1,372 operations: commits, typed-clone reopen, arbitrary leaf tamper and property reorder maintain the last accepted marker. Shrinking enabled; no failure and therefore no shrink occurred. These are crypto/carrier histories, not browser crash histories. |
| [Native reader](./2026-09-11-account-promotion-contract/promotion-native/native-versions.json) | All 13 stage carriers authenticate against real factor-opened Local custody; all changed IDs with old MACs refuse. Nested later-stage fixtures qualify the reader only, not a full transition at each stage. |
| [Authentic semantic controls](./2026-09-11-account-promotion-contract/promotion-native/native-source-controls.json) | Ten correctly MACed source/claim/custody/budget/collision lies refuse; removing the actual current-source guard accepts each same lie. Principal/workspace substitutions also change the pending draft so structural consistency cannot mask the intended comparison. |
| [Native message controls](./2026-09-11-account-promotion-contract/promotion-native/native-message-controls.json) | Three actual native HMAC verification-message omissions accept substituted identity, pending receipt ID or handoff promotion ID. Full production verification refuses; WebCrypto verification remains operative in the control. |
| Existing owner regressions | 80 tests pass: [promotion](./2026-09-11-account-promotion-contract/promotion-regressions.log) 18, [genesis](./2026-09-11-account-promotion-contract/genesis-regressions.log) 14, [admission](./2026-09-11-account-promotion-contract/admission-regressions.log) 27, [handoff](./2026-09-11-account-promotion-contract/handoff-regressions.log) 21. Includes 260 generated service histories, 139 generated native histories, 200 ES256 conversion samples, renderer/process death, lost replies, exact replay coverage, foreign-owner refusal and actual passkey/offline handoff. |
| [Units](./2026-09-11-account-promotion-contract/unit.log) and tools | All 983 unit tests in 88 files, typecheck, retained A/B/C/D1 contract tests, all 24 vector commands, targeted lint/format and source inventory pass. |
| [Registry controls](./2026-09-11-account-promotion-contract/registry/promotion-registry-controls.json) | Nine new controls enforce D2 corpus, MAC authority/guard/role, omission obligation, digest source occurrence, version ownership and negative/omission data; repinning edited corpora does not suppress the latter failures. |

The map now has 54 entries and 62 permitted-root chains across 13 swept documents. The construction
registry has 53 specified records, five open and one non-crypto exclusion. The runtime census remains
158 sources and 89 labels; all production source bytes and 24 prior vector files are unchanged.

Preliminary test expectations were corrected to reflect existing behavior: genesis actors are ordered;
lineage uses ASCII LP despite custody accepting Unicode; the handoff unlock-binding comparison is order
sensitive; retained promotion must be entered through the promotion-specific slot permit. These were
harness/specification corrections, not reproduced runtime defects. Final tests explicitly retain those
boundaries. The previous preparation narrative also incorrectly said full parsing preceded signing;
it now says signing parses its result and retained reads parse before verification.

This evidence does not turn a valid Local MAC into current service eligibility, a verified nested
signature, key correspondence, checkpoint coverage or handoff permission. Fixed later-stage reader
fixtures intentionally do not establish those semantics; the existing owner regressions provide their
separate bounded evidence. The oracle shares Node/OpenSSL as a cryptographic provider with some runtime
paths and reuses the independently written first-authority schema/fixture. Independence here refers to
byte reconstruction, not a second independently implemented primitive library.

Next is **D3: Account capsule and ledger byte contracts**, including source capture, spool allocation/
attempt/envelope entries and chain, delivery/inbound carriers, and explicit counter-witness dependencies.
Inherited Local custody/store/journal, checkpoint/startup and migration-only dispositions remain open.
F-05/F-06 and real Account readiness remain open. All 21 personal package hashes, historical review,
L-2, stopped personal servers and unrelated root files are preserved.
