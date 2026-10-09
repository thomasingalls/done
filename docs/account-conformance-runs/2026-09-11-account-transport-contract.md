# Private encrypted transport byte alignment — 2026-09-11

**Result: group C complete.** Recovery group B was committed as `e74fbaa`. Current envelope v1/v2,
submission, refusal/head/response, both read transports and service witness/chain now have exact byte
homes, registered source/map dependencies and independent executable vectors. Production code, wire
versions and schemas are unchanged. One stale service-inbound mutation control was repaired.

[Exact contract](../account-crypto/transport.md),
[fixed corpus](../../test/vectors/account-transport.json),
[summary](./2026-09-11-account-transport-contract/summary.json),
[source pins](./2026-09-11-account-transport-contract/sources.json).

Final execution: `node scripts/account-transport-contract/run.mjs`, Node v26.8.2, run
`test-results/account-transport-contract/2026-09-11T15-22-40.354Z`. All **36 stages pass**, no timeout;
all **760 source pins** match after execution. Package command: `pnpm account:transport-contract`.
The installed Node entry was used directly. Native fixtures use disposable SQLite/Chromium/loopback
HTTP instances and in-memory Vite bundles. No personal app build, server or real Account was used.

| Evidence | Result |
| --- | --- |
| [Fixed formats](./2026-09-11-account-transport-contract/formats/fixed.json) | 37 cases agree with independent Node/OpenSSL bytes and actual encoders, signers, KDF, seal/open and verifier calls. Nine existing envelope positives remain unchanged; v1 reads and v2 minting stay distinct. |
| [Encoded bindings](./2026-09-11-account-transport-contract/formats/encoded-bindings.json) | 314 field substitutions, 314 omission controls, 105 signature checks and 14 AEAD refusals. These are encoding/primitive controls, separately identified from owner checks. |
| [Framing](./2026-09-11-account-transport-contract/formats/framing.json) | All 8,924 truncated prefixes across 14 carrier cases refuse, as do appended bytes and oversized frames. Of 134 changed frames, 52 refuse parsing and 82 remain syntactically valid: parsing is not authentication. Canonical JSON/version and ordinary Uint8Array copy behavior are checked. |
| [Verification controls](./2026-09-11-account-transport-contract/formats/verification-controls.json) | Removing envelope hash, parent ID, final, v1 page-through or witness-request fields at the actual verification-message boundary rescues an independently signed bad claim. The sixth control, v2 page-through, runs through the actual inbound verifier in the unit suite. Verification itself is never replaced by a true result. |
| [Generated contract cases](./2026-09-11-account-transport-contract/formats/properties.json) | 200 shrinking-enabled histories, seed 5110914. Independently encrypted envelopes and reconstructed accepted prefixes agree; changed nested proofs and reordered multi-entry pages refuse without a new page signature. |
| [Service witness](./2026-09-11-account-transport-contract/formats/witness.json) | Two fixed events, accepted and refused, bind exact submission/response hashes, count and five scope fields. Null is permitted only at zero. Actual internal chain/verifier bodies are exposed only in an in-memory source copy; durable paths are tested separately below. |
| [Service decisions](./2026-09-11-account-transport-contract/service-delivery.log) | 32 tests: 80 generated histories, signed closure/parent rules, witness damage, commit uncertainty, SIGKILL, competing service processes and a native browser round trip. |
| [Transport](./2026-09-11-account-transport-contract/transport.log) | 17 tests: 60 generated histories, maximum-size pages, genuine service guard controls, exact HTTP retry after lost response, stale/reordered/malformed evidence and close/drain behavior. |
| [Service inbound](./2026-09-11-account-transport-contract/service-inbound.log) | 20 tests: 60 generated histories, both reader/publisher roles, eight effective omission controls, native HTTP cold replay, size bounds, post-signing expiry/custody, concurrent membership changes and SIGKILL. |
| [Registry](./2026-09-11-account-transport-contract/registry/transport-registry-controls.json) | Ten new controls, plus retained A/B controls. Missing C corpus/home/hash registration, carrier/digest misclassification, wrong signer/guard and missing negative/omission data fail; updated aggregate hashes cannot hide absent negative evidence. |
| [Authority map](./2026-09-11-account-transport-contract/authority.log) | 49 entries, 57 permitted-root chains, 11 swept documents; 47 specified records, seven explicitly open and one non-crypto exclusion. Service evidence remains availability-only. |
| [Full unit suite](./2026-09-11-account-transport-contract/unit.log) | All 983 tests in 88 files pass. The new v2 fixed-page test verifies and replays two Yjs updates as `AB`, with held membership/prefix/expiry/namespace refusals. Typecheck passes. |
| Retained vectors and tooling | A's 17 fixed cases/399 negatives/333 omissions and 200 reorderings; B's 13 fixed cases/64 substitutions/64 omissions and 200 generated payload cases; all 22 current vector commands, including 225-field AAD coverage; targeted lint/format pass. |

The first campaign exposed a **stale test control, not a runtime bypass**. Its
[failure](./2026-09-11-account-transport-contract/prior-run/service-inbound.log) expected removal of
the registration credential comparison to admit a replaced current passkey. Fresh activation had added
an independent check against the signed activation credential, so the mutant correctly still refused.
The [repaired control](./2026-09-11-account-transport-contract/service-inbound/control-registration.json)
retains that refusal, then changes only the saved registration credential while keeping current credential
and activation consistent. Baseline refusal and mutant signed-page escape now isolate the intended guard.
The prior summary/source pins and failed stage are retained; the complete final campaign passes.

Important tested boundaries: refusal ID excludes its signature but parent verification remains mandatory;
the returned acceptance leaf must reconstruct the signed link from the owner's previous link; request
hashes include the complete signed request; page signatures cover exact nested bytes. Lower-level page
verification is not membership or entry admission. The fixed distinct reader/publisher keys exercise roles,
not a newly implemented enrollment mechanism. The service witness does not detect coordinated rollback
of ledger and witness to a consistent past state. Independent encodings do not imply independent underlying
cryptographic libraries or establish the host's unrewound/unbranched-history assumptions.

No new production defect was found in this bounded campaign. F-05/F-06 remain open for group D and the
explicit inherited Local bridge disposition. Next is **D1: service root and acceptance-key custody**, a
bounded first part of D; local promotion/capsules, counter-witness coupling and checkpoint/startup bridges
follow separately. This result does not establish real Account readiness, general lineage transitions,
second-device enrollment, invocation-grant power-loss safety, deployment or complete protocol correctness.
All 21 personal package hashes, historical review and L-2 remain unchanged. This phase remains uncommitted.
