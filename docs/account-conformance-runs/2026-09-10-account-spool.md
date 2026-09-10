# Private Account allocation and persisted envelopes — 2026-09-10

Signed `7210b7d` commits durable source capture. This checkpoint adds private v7 ownership of network
positions, distinct durable grants for each encryption invocation, and exact persisted v2 envelopes.
[Implementation contract](../account-spool.md). Every original source remains retained; this owner has no
sending, acceptance, closed, deletion or successor capability.

The final campaign is `test-results/account-spool/2026-09-10T20-38-23.268Z`.
[Summary](./2026-09-10-account-spool/summary.json),
[430 source hashes](./2026-09-10-account-spool/sources.json),
[native histories](./2026-09-10-account-spool/generated.json),
[controls](./2026-09-10-account-spool/controls.json) and
[evidence manifest](./2026-09-10-account-spool/manifest.json) preserve its inputs and results.

| Evidence | Result and scope |
| --- | --- |
| Native spool | 24 cases pass, 132.99 seconds; activation, grants, native commit abort/lost reply, renderer death, exact wire restart, prepared signer, actors, source integrity, cancellation/drain, metadata witness and bounds |
| Native generated histories | Eight, seed 9502026, each 2–4 steps; real edits interleaved with position/attempt/envelope commit faults and compaction; independent text and external crypto observations |
| Ledger properties | 150 histories, seed 9512026, up to seven positions with 0–2 abandoned grants per position; real encrypted/signed wire, exact source coverage, missing grants/final row/all ledger and changed witness refusal |
| Route properties | 150 substitutions, seed 9512027; workspace, credential, principal, epoch and generation mismatches refuse |
| Unit spool tests | Six pass; closed/canonical framing, source/hash/actor/signature verification, sequencing, placement, invocation limits, metadata v2 and unchanged v1 MAC bytes |
| Actual controls | Returning before persistence loses the returned envelope; reusing a grant produces two native encryption calls against one durable count; removing the witness verifier remints an exposed position after its last row disappears |
| Boundary controls | Reduced budget refuses the third invocation before AES; the previous committed promotion parser refuses v7 |
| Source capture regression | 15 native cases pass, including its 16 generated histories and retention/route controls |
| Compaction regression | 21 cases pass; all eight mutation controls are detected |
| Full unit suite | 857 tests / 76 files pass, 56.13 seconds |
| Final checks | Isolated build, TypeScript, scoped lint/format and 13 gates; exact outcomes in adjacent logs/JSON |

Review found a design defect that the initial 19-case passing campaign missed. A native reproduction
deleted the final persisted envelope after its bytes had been exposed; the initial owner treated the
remaining ledger as unfinished and returned different bytes for the same network position. The original
[failing diagnostic](./2026-09-10-account-spool/pre-repair-missing-tail.log) and superseded campaign summary
are retained as historical evidence, not passing validation. The current actual-module
[witness-removal control](./2026-09-10-account-spool/missing-tail-control.json) reproduces that behavior
with pinned source inputs. The generated campaign did not discover this defect.

The repair adds an authenticated completeness witness to private content counter v2. Every ledger entry
and the next signed hash/count commit atomically. Counter reservation, source flush and compaction
preserve that witness. Every census verifies it before exposure, replay, allocation or deletion. Missing
final rows and complete ledger loss now refuse while current metadata remains. Promotion v7 precedes
witness activation, which precedes admission; both activation commits have before/after crash coverage.
Restoring old authenticated metadata together with its matching ledger remains outside this protection.

[Findings](./2026-09-10-account-spool/findings.json) also record lifecycle initialization/drain review and
the regression invocation retry: a reused compaction output directory correctly refused overwrite. The
final direct Node run uses a fresh directory. Its source hashes and report are preserved separately.
No pnpm-wrapper execution is claimed: direct Node entrypoints ran the same campaign scripts.

One original transaction becomes one envelope, preserving actor and exact update bytes, including pending
Yjs frames. Sources and encrypted wire accumulate; this is not a large-backlog performance certification.
The witness adds a private authenticated metadata format while Local v1 bytes remain unchanged. There is
no physical power-loss, coordinated profile rollback/clone, multi-device or whole-protocol correctness
claim, and no conformance debt is paid.

The personal `.dev/releases/17d87c2/app` and predecessor `dist/` remain intact. Preview/relay stay off;
no personal browser or Account/factor provisioning was performed. Next is concrete authenticated
response/refusal-proof framing and verification, then content-blind durable relay integration.
