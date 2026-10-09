# Account capsule and ledger contracts — 2026-09-11

**Result: D3 complete; new work is unstaged and uncommitted.** D2 was committed unsigned as
`1897848` at the user's request and added to the existing signing reminder alongside C `d098bd4`
and D1 `d24ca66`. This phase changes documentation, test/vector tooling and construction registrations.
No production code, stored format, carrier version, real Account or personal installation changed.

[Byte contract](../account-crypto/account-ledger.md),
[fixed corpus](../../test/vectors/account-ledger.json),
[summary](./2026-09-11-account-ledger-contract/summary.json),
[source pins](./2026-09-11-account-ledger-contract/sources.json),
[preservation](./2026-09-11-account-ledger-contract/preservation.json),
[working patch](./2026-09-11-account-ledger-contract/working.patch),
[patch manifest](./2026-09-11-account-ledger-contract/patch.json).

Final execution: `node scripts/account-ledger-contract/run.mjs`, Node v26.8.2, run
`test-results/account-ledger-contract/2026-09-11T16-51-25.630Z`, 16:51:25–17:01:24 UTC.
All **42 stages pass**, without timeout, and **795 input pins** match after execution.
The package entry is `pnpm account:ledger-contract`; the installed Node entry was run directly.
Native cases use disposable SQLite, loopback servers and Chromium profiles. Vite builds remain in memory.

| Evidence | Result |
| --- | --- |
| [Fixed bytes](./2026-09-11-account-ledger-contract/ledger-contract/fixed.json) | 20 vectors: ten carrier variants, eight chain extensions, the whole-source digest and the held receipt baseline digest. Actual encoders and native digests match the independently reconstructed bytes. |
| [Carrier fields](./2026-09-11-account-ledger-contract/ledger-contract/bindings.json) | 118 leaf mutations: 101 parser refusals and 17 accepted, distinct canonical encodings. All 118 encoded-field omissions refuse. The 17 accepted mutations establish byte inclusion, not independent authentication. |
| [Framing](./2026-09-11-account-ledger-contract/ledger-contract/framing.json) | All 13,876 truncated prefixes refuse, plus 80 noncanonical/malformed framing cases covering whitespace, BOM, escape/number spellings, UTF-8 and extra fields. Source bounds and original Yjs validity have separate [capture checks](./2026-09-11-account-ledger-contract/ledger-contract/capture.json). |
| [Baseline](./2026-09-11-account-ledger-contract/ledger-contract/baseline-bindings.json) | All 73 receipt leaf mutations are distinguished: 42 change the reconstructed receipt hash; 31 refuse through parsing or the held-context checks. The hash includes nested signatures and is not itself service or factor authority. |
| [Composed replay](./2026-09-11-account-ledger-contract/ledger-contract/union.json) | The actual census reconstructs spool, delivery and inbound events; authenticated member/source correspondence, signed acceptance, cold-expiry handling and a real conflicting accepted body are checked separately. Source capsules and ordinary content are excluded from the witness event union. |
| [Generated ledger histories](./2026-09-11-account-ledger-contract/ledger-contract/properties.json) | 200 histories, seed 5110917, covering 2,563 events: contiguous positions, repeated attempts, unfinished positions, retained prefixes and omitted events are compared with an independent ledger. Shrinking is enabled; there was no failure and therefore no shrink. These are in-memory ledger histories, separate from browser crash tests. Matching old ledger/witness prefixes deliberately remain accepted, documenting the rollback limit. |
| [Source controls](./2026-09-11-account-ledger-contract/ledger-contract/control-source.json) and [authentication controls](./2026-09-11-account-ledger-contract/ledger-contract/control-source-authentication.json) | Removing the actual identity, source-digest or decrypted-original correspondence check accepts a conflicting identity, wrong source hash or separately and correctly signed/encrypted wrong original. The production checks refuse the same inputs. |
| [Witness controls](./2026-09-11-account-ledger-contract/ledger-contract/control-witness.json) | Removing only the early count comparison still refuses through final pair equality. Removing both count comparisons accepts a wrong count; omitting the final hash comparison accepts a wrong hash. This distinguishes a redundant defence from an ineffective test. |
| [Semantic controls](./2026-09-11-account-ledger-contract/ledger-contract/control-semantic-order.json) and [digest control](./2026-09-11-account-ledger-contract/ledger-contract/control-chain.json) | Actual guard omissions accept a signed submission before its persisted envelope or valid receive evidence without disk content. Omitting raw previous-hash bytes from the actual native digest input aliases two distinct prior histories. Signature, AEAD and digest success results are never forced true. |
| Existing native owners | 75 tests pass: [capture](./2026-09-11-account-ledger-contract/capture-regressions.log) 15, [spool](./2026-09-11-account-ledger-contract/spool-regressions.log) 24, [delivery](./2026-09-11-account-ledger-contract/delivery-regressions.log) 19, [receive](./2026-09-11-account-ledger-contract/receive-regressions.log) 17. Includes 44 generated browser histories (16 capture, eight spool, eight delivery, 12 receive), strict commit interruption, close/activation fencing, journal and compaction preservation, missing tails and effective source mutants. Capture/spool/delivery histories retain their existing stop-on-first-failure configuration; receive permits shrinking. |
| Cold inbound authority | Existing receive tests re-encrypt false retained service evidence under valid Local AEAD and recompute a valid counter MAC. Cold replay still refuses; its stored-page-verification omission control accepts the same invalid page. Content/evidence splitting is separately rejected by coverage readback. |
| [Registry controls](./2026-09-11-account-ledger-contract/registry/ledger-registry-controls.json) | Nine new controls enforce corpus coverage, witness dependency/obligation, canonicality, the unlabelled receipt digest, exact source occurrence, chain role and negative/omission evidence. Repinning edited corpora does not conceal missing negatives. |
| [Units](./2026-09-11-account-ledger-contract/unit.log) and tools | 983 units in 88 files, typecheck, retained A/B/C/D1/D2 contracts, all 25 vector commands, targeted lint/format and inventory checks pass. |

The twelve new Node tests include eight effective weakening cases and the additional redundant-count
defence control. Independent reconstruction reuses the transport/first-authority oracle and Node/OpenSSL
primitives; it is not a second implementation of those cryptographic primitives. Control bundles share
one Yjs instance with the baseline to avoid constructor identity differences. The fixed chain examples
establish bytes; semantic replay comes from the separate ledger tests.

Six D3 construction records replace `remaining-local-account-ledger`. The registry now has 59 specified
records, four open and one non-crypto exclusion. The map has 58 entries and 70 permitted-root chains
across 14 swept documents. Runtime census remains 158 sources and 89 labels/templates. No runtime
defect was reproduced in this bounded phase, so no runtime repair was made.

This closes Account carrier/chain bytes and their explicit dependencies, not all Local cryptography or
allocator correctness. Enclosing records authenticate payloads; the retained counter authenticates a
witness; ordered semantic checks establish exact originals, acceptance and receive coverage. A matching
old authenticated counter and ledger can still be replayed together after rollback. Hashes alone do not
establish current membership, device freshness, source durability or clone safety.

Next is **D4: authenticated counter and witness byte contracts**, the bounded Account-to-Local bridge
for v1/v2 counter payloads, scoped metadata keys/MACs and atomic counter/witness ownership. Inherited
store/journal/custody, checkpoint/startup and migration-only dispositions remain separate where not
covered. F-05/F-06 and real Account readiness remain open. All 21 personal package hashes, 25 prior
tracked vector files, historical review, L-2, stopped personal servers and unrelated root files are
preserved. No personal production build, real provisioning or historical aggregate was run.
