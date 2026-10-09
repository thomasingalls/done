# Private service key custody — 2026-09-11

**Result: D1 complete; new work remains unstaged.** The previous transport phase was staged as
114 files without committing. Its exact index patch hash is saved in the
[staging boundary](./2026-09-11-account-service-custody/staged-transport-boundary.json) and remains
unchanged. The service-custody work adds an exact byte home, eight independent vectors and four
construction records. Other D/Local obligations remain open.

[Contract](../account-crypto/service-custody.md),
[fixed corpus](../../test/vectors/account-service-custody.json),
[summary](./2026-09-11-account-service-custody/summary.json),
[source pins](./2026-09-11-account-service-custody/sources.json).

Runtime changes are confined to the root and acceptance custody owners and a shared Ed25519 export
checker. Both creators now assert PKCS#8 prefix/length, and public-key extraction asserts SPKI
prefix/length. Acceptance creation refuses after close before generating a key and clears its exported
seed if validation, public export, randomness or derivation fails. The successful stored bytes and
signatures remain unchanged; no schema or wire migration is introduced.

The [initial reproductions](./2026-09-11-account-service-custody/before-repair.log) failed in four
places: malformed PKCS#8 algorithm bytes were accepted in each creator, a closed acceptance owner
generated another key, and RNG failure before derivation retained an exported seed. These are
provider-format and lifecycle/cleanup defects. They do not demonstrate attacker-controlled exports,
client acceptance of a forged signature or disclosure of a real user's key.

Final execution: `node scripts/account-service-custody/run.mjs`, Node v26.8.2, run
`test-results/account-service-custody/2026-09-11T15-47-22.340Z`. All **39 stages pass**, no timeout,
with **771 input pins** verified after execution. The package entry is `pnpm account:service-custody`;
the installed Node entry was used directly. Native fixtures use disposable SQLite/Chromium/loopback
instances and in-memory Vite builds. No personal server, packaged build or real Account was used.

| Evidence | Result |
| --- | --- |
| [Fixed construction](./2026-09-11-account-service-custody/custody-contract/fixed.json) | Eight cases reproduce both actual creators, all three KDF input/output pairs, root cold-open/recoverPin/proof, acceptance opening, and exact DER/carrier representations. All fixed-purpose acceptance signatures match group C. |
| [Primitive bindings](./2026-09-11-account-service-custody/custody-contract/bindings.json) | 39 substitutions, 24 encoded-field omissions, 19 AEAD refusals. Authentic changed plaintext remains valid AEAD and requires the owner's separate key-correspondence check. |
| [Owner refusals](./2026-09-11-account-service-custody/custody-contract.log) | Eighteen tests cover held/stored pins, operator key, proposal, public key, salt/nonce/ciphertext, versions/lengths, authentic wrong seeds, property order, 16 export mutations, cleanup failures and closed ownership. |
| [Generated cold openings](./2026-09-11-account-service-custody/custody-contract/properties.json) | 200 histories, seed 5110915, shrinking enabled: independently sealed roots cold-open from actual SQLite; wrong-seed acceptance payloads are authentically resealed and refused. |
| Production guard controls | Eight disposable source mutants remove expected-pin, root/acceptance correspondence, proposal AAD, private/public export assertion, cleanup or early-close guards. Each recreates its specific failure. [Pin control](./2026-09-11-account-service-custody/custody-contract/control-expected-pin.json), [cleanup control](./2026-09-11-account-service-custody/custody-contract/control-cleanup.json). No cryptographic verification boolean is forced true. |
| [Authority regressions](./2026-09-11-account-service-custody/authority-regressions.log) | 14 tests, including 160 generated authority histories, 40 native histories, both initialization SIGKILL boundaries, competing setup, Local+journal preflight and cancellation. |
| Service / transport regressions | All 69 tests: service decisions (32), HTTP transport (17), service inbound (20), including 200 generated histories, maximum-size pages, native cold replay and crash/race cases. |
| [Full units](./2026-09-11-account-service-custody/unit.log) | All 983 tests in 88 files pass; typecheck passes. Retained A/B/C fixed and generated contract suites also pass. |
| [Registry](./2026-09-11-account-service-custody/registry/service-custody-registry-controls.json) | Seven new controls preserve the corpus, exported owner, unlabelled export checks, AEAD map dependency, carrier role and negative data. Missing negatives fail even after repinning the corpus. Existing controls remain effective. |
| Map and tooling | 52 entries, 59 permitted-root chains, 12 swept documents; 51 specified records, six open, one non-crypto exclusion. All 23 vector commands and targeted lint/format pass. The reviewed runtime census now includes the new helper: 158 sources, unchanged 89 labels. |

The independent oracle uses Node/OpenSSL without importing production encoders; that does not imply
independent underlying cryptographic libraries. A trial empty-salt mutation to one zero byte was not
isolating because of HMAC key padding; the current negative uses a nonzero salt. Provider/GC copies
cannot be promised erased by clearing one exported buffer. One seed per salt-derived key remains
conditional on nonrepeating randomness and unrewound/unbranched histories. Operator secret distribution,
service-key rotation, restore/clone safety and production deployment are not qualified here.

The next bounded part is **D2: local promotion authentication and deterministic identities**, covering
versioned promotion MAC payloads and lineage/attempt digests. Account capsules, spool/inbound/delivery,
counter-witness coupling, checkpoint/startup and inherited Local bridge dispositions remain later work.
F-05/F-06 remain open. The 21 personal package hashes, historical review, L-2 and staged transport patch
are preserved. D1 does not establish real Account or second-device readiness.
