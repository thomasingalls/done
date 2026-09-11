# Inbound byte formats and verification evidence — 2026-09-11

Committed inbound preparation as `ee42c45`. This phase implements the
[closed byte/verifier boundary](../account-inbound-verification.md) alongside unchanged v1 readback.
No v9 activation, receive storage, editor promotion, service route or enrollment is enabled.

Campaign: `test-results/account-inbound-codecs/2026-09-11T00-00-13.798Z`, executed as
`node scripts/account-inbound-codecs/run.mjs` (registered as `pnpm account:inbound-codecs`).
[Summary](./2026-09-11-account-inbound-codecs/summary.json),
[sources](./2026-09-11-account-inbound-codecs/sources.json),
[independent bytes](./2026-09-11-account-inbound-codecs/independent-bytes.json),
[generated inputs](./2026-09-11-account-inbound-codecs/generated.json),
[findings and limits](./2026-09-11-account-inbound-codecs/findings.json),
[manifest](./2026-09-11-account-inbound-codecs/manifest.json).

| Check | Evidence |
| --- | --- |
| Codec/verification | 34 cases pass: exact independent bytes, closed framing, malformed/bounded fields, signature and request binding, held prefix, actor, duplicate/conflict, pending Yjs originals, stored replay and lifetime |
| Generated signed inputs | 400, seed 9152026: authored update bytes and independently framed records, live/stored equality, independently re-signed forbidden actors |
| Wire mutations | 500, seed 9162026: nonzero byte changes refused; test and seed reproduce inputs |
| Actual source controls | Eight removed guards demonstrably admit prohibited outcomes: page signature, request binding, prefix proof, actor, stored-record binding, batch count, input copying and final close check |
| Implementation defect | Replacing the lifetime assertion during crypto bypassed closure. Original callback binding fixes it; the failing log and passing directed regression are retained |
| Regressions | 68 tests in five files, including the prior 300 generated model histories and seven effective shortcut controls |
| Shared Node import | The new protocol module imports directly in Node and decodes the independently framed request with distinct reader and publisher |
| Full suite | 948 tests in 82 files pass |
| Build/static/gates | Isolated application build, TypeScript, scoped lint/format and 13 repository gates; adjacent artifacts record results |

The verifier requires independently authenticated owner context. A signed response cannot choose its
baseline, reader/publisher membership, generation key or accepted predecessor. Successful results own
detached original updates and exact signed evidence; they grant no cursor or membership authority.
Old duplicates/conflicts require rechecking independently retained original acceptance too. Stored replay
rechecks original signatures and all outer metadata while allowing the old request's expiry to have passed.
The first receive cap is one entry, 512 KiB envelope wire, 255 updates and 512 KiB decoded updates, with
the final local batch byte/count check. Empty/duplicate observations create no durable progress.

The [lifetime counterexample](./2026-09-11-account-inbound-codecs/lifetime-counterexample.log) is a defect in
the first implementation of this new primitive. It now retains the original assertion and clock callbacks,
checks closure around crypto and before every successful return, and erases owned key/plaintext copies
when they do not transfer to the caller. The final generated campaign found no additional defect.

The initial runner also let preparation regressions overwrite the codec's generated-case artifact.
The final run places prior model outputs under `regression-artifacts/`, preserving both sets separately.
All campaign source hashes match the final inputs. Unit/runtime inputs are identical; the runner-only
artifact-directory repair was verified by the final campaign. Control bundles emit Yjs's duplicate-import
warning; only raw bytes cross their independent module boundaries.

This is not native durability or enrollment evidence. Synthetic contexts assume admitted genesis and
membership; one stored event's reauthentication does not establish a complete witness census, native
record AEAD or content coverage. No browser is started, and no async Playwright wait is credited. The
isolated app build checks integration but does not ship this unused verifier; tests execute it directly.
No whole `pnpm check` or whole-protocol debt payment is claimed. Personal Local release/predecessor,
browser/factors, server state and L-2 remain unchanged.

Next: factor-owned v9 activation and atomic original content/event/witness storage, complete cold replay,
old-reader refusal and native abort/crash/lost-ack tests. Editor and v2 service integration follow.
