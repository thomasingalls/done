# Private outbound preparation — 2026-09-10

Signed `d10cf8b` commits the preceding Account editing phase. This checkpoint implements a private
network envelope codec and makes the next durability boundary concrete. It does **not** implement a
native spool or encrypted relay. [Contract and corrections](../account-outbound.md).

The final runner output is `test-results/account-outbound/2026-09-10T19-13-18.375Z`.
[Summary](./2026-09-10-account-outbound/summary.json),
[source hashes](./2026-09-10-account-outbound/sources.json) and
[evidence hashes](./2026-09-10-account-outbound/manifest.json) preserve the exact run.

| Evidence | Result and scope |
| --- | --- |
| Existing v1 vectors | Unchanged byte/reference verification; new v1 minting refused |
| Private v2 vectors | Five independent Node/OpenSSL constructions, including different credential and generation |
| Codec tests | 19 pass, including exact wire bytes, separate signature/seal bindings, explicit route/version, malformed input and input mutation during crypto |
| Generated codec cases | 100, seed 9302026; exact body/envelope roundtrip and mutated-wire refusal |
| Preparation tests | Five pass; old model counterexamples plus corrected split-reservation proposal |
| Generated preparation histories | 1,000, seed 9312026; capture, crash, compaction, allocation, invocation accounting, exact retry and conditional progress |
| Model controls | Listener-only capture, counter-only grant and send-before-persistence each produce an independent oracle violation |
| Actual codec controls | Removing signature, digest or route guard permits the corresponding bad content-blind acceptance |
| Native Account reproduction | Accepted journal-only edit survives failed observer and renderer death; no outgoing replay/outbound record is reconstructed; real compaction preserves writing |
| Full unit suite | 844 tests / 74 files pass, 48.80 seconds |
| Static/build/gates | Final results retained in the adjacent JSON/log files; isolated app build and 13 gates |

The two nonce-budget counterexamples execute the existing model declarations and the v1 key derivation.
Repeated pre-promote crashes count three invocations as one; a successor also escapes its count. Actual
v1 HKDF equality shows different credential budgets share a key. These demonstrate defects in the old
construction/model, not an existing production network sender. The new v2 codec fixes key separation;
the future native owner still owes strict per-invocation reservations.

The current Account editor is behaving correctly: outgoing observers are notifications, and its journal
preserves the document despite observer failure. That real reproduction establishes why capture must be
part of admission. An initial test incorrectly treated the fixture's localStorage object as an array;
[the harness repair](./2026-09-10-account-outbound/findings.json) records the failed assertion and correction.
The model's tokens and atomic commits remain a proposal, not evidence of native spool durability.

The new codec is not imported by the default app or Account editor. No personal browser, Account factor,
operator key, preview server, relay, `.dev/releases/17d87c2/app`, or predecessor `dist/` was changed.
There is no physical power-loss, multi-device/profile-clone, finalization, revocation or whole-protocol
claim. No conformance debt is paid. The next phase is versioned, authenticated durable source capture;
network positions, exact persisted envelopes and verified response integration follow it.
