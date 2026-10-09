# Private Account response evidence and submission proofs — 2026-09-10

Signed `7082fa7` commits the preceding spool phase. This checkpoint implements canonical response framing,
refusal and acceptance-proof verification, a device-signed submission wrapper that binds its parent refusal,
and read-only inspection through the real private Account owner.
[Implementation contract](../account-decisions.md).

The final campaign is `test-results/account-decisions/2026-09-10T21-02-40.243Z`.
[Summary](./2026-09-10-account-decisions/summary.json),
[440 source hashes](./2026-09-10-account-decisions/sources.json),
[native histories](./2026-09-10-account-decisions/generated.json),
[five actual controls](./2026-09-10-account-decisions/controls.json) and
[evidence manifest](./2026-09-10-account-decisions/manifest.json) preserve the result.

| Evidence | Result and scope |
| --- | --- |
| Unit verifier tests | 12 pass; selected message/vector readback, exact subject and current-key checks, link reconstruction, conflict evidence, stable refusal IDs, canonical/bounded framing, exact envelope/parent signatures and async input capture |
| Generated chain histories | 200, seed 9612026, each 1–8 positions; independent Node/OpenSSL oracle signs exact, conflicting and unanchored heads and wrong-epoch refusals |
| Generated successor proofs | 100, seed 9612027; parent ID, original position, lineage, current-key and independent signing-input checks |
| Native owner cases | Six pass, 40.51 seconds; real Account certification and custody, no-write inventory, exact wire retention, unknown/conflicting answers, later-position reconstruction, close/drain and controls |
| Native generated histories | Eight, seed 9622026, each 2–5 answers; exact stored inventory, sources, wire and counters remain intact through response histories and cold reopen |
| Actual verifier controls | Removing signature, envelope-epoch, reconstructed-link, wrapper-parent or successor-position checks permits the corresponding invalid evidence/submission |
| Full spool regression | 24 native cases pass, 129.89 seconds, including eight generated crash histories; its six unit/property tests pass as well |
| Full unit suite | 869 tests / 77 files pass, 56.76 seconds |
| Final validation | Isolated application build, TypeScript, scoped lint/format and 13 gates; exact outcomes in adjacent logs/JSON |

The native owner derives the queried subject and predecessor chain from authenticated persisted envelopes.
Its acceptance key comes from the retained first-epoch receipt already authenticated by startup. Transport
supplies neither key nor predecessor link. An authenticated leaf at the queried position yields accepted
or conflict evidence only after reconstructing its signed link; an unprovable prefix remains unknown.
All five refusal subject fields and the attempt's parent must match. Inspection grants no durable state
change, and a cancelled owner withholds even an otherwise valid result until its task can no longer publish.

The submission wrapper hashes the complete unchanged v2 wire and binds its parent refusal ID under the
certified device signature. A re-signed identical refusal message preserves the ID and wrapper signature;
a different valid proof does not. The codec can verify an immediate successor proof, but cannot establish
that a service durably issued it or permanently closed its digest. That remains a service transaction
obligation. The Account owner has no submission-signing or dispatch API in this phase.

[Findings and scope](./2026-09-10-account-decisions/findings.json) distinguish the one fixture failure from
implementation evidence. The first later-position test called a nonexistent editing method; using the
established admitted-input adapter fixed it. The failing diagnostic is preserved. No implementation or
design counterexample was demonstrated by this phase's generated campaign; the actual controls show that
the tested guards are effective, not that the whole protocol is correct.

The response campaign is wired into `pnpm account:decisions` and `pnpm check`. Direct Node entrypoints ran
the campaigns; no whole `pnpm check` execution is claimed. The final response run pins the completed check
wiring. Spool regression/unit/build code is identical, but ran before the final scripts.check-only addition;
[its exact package bytes](./2026-09-10-account-decisions/package-at-regression.json) are retained. Verification
checks that this script addition is the only package difference and all other regression source hashes match.

This phase implements only the first private lineage and an exact-position head proof. General lineage
advancement, batched proofs, checkpoint baselines, durable accepted/closed records, successor minting,
service permanence, relay dispatch, finalization and multi-device behavior remain open. No whole conformance
debt is paid. The personal release `.dev/releases/17d87c2/app`, predecessor `dist/`, browser and factors were
not operated on; preview and relay remain off. Next is owned durable decision recording and exact signed
submission persistence, before relay integration.
