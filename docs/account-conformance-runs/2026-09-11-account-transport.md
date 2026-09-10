# Private submission transport and readback evidence — 2026-09-11

The preceding service-decision phase was committed as `96a2040`. This checkpoint adds private HTTP
submission and authenticated bounded ciphertext/proof readback under the existing v8 lifecycle.
[Contract](../account-transport.md).

Final campaign: `test-results/account-transport/2026-09-10T22-23-47.441Z` (UTC timestamp; September 11 locally).
[Summary](./2026-09-11-account-transport/summary.json),
[466 source hashes](./2026-09-11-account-transport/sources.json),
[generated histories](./2026-09-11-account-transport/generated.json),
[findings and limits](./2026-09-11-account-transport/findings.json), and
[evidence manifest](./2026-09-11-account-transport/manifest.json).

| Evidence | Result |
| --- | --- |
| Service and codec campaign | Nine tests pass, 23.37 seconds, including 60 generated histories and two service controls |
| Generated histories | Seed 9112026, 60 histories of 4–16 append/read/restart/replay/tamper operations; independent Node/OpenSSL request/page framing, original ciphertext/proof retention, reconstructed accepted links and complete bounded page walks |
| Page bounds | Maximum envelopes produce smaller pages within 10 MiB; count bounds, empty/end pages and past-end refusal; malformed/noncanonical and oversized frames refuse |
| Authentication controls | Removing device signature verification discloses a signed page to a foreign key; removing final state comparison discloses after membership becomes inactive |
| Native HTTP campaign | Eight tests pass, 51.84 seconds: actual v8 send/read, exact persisted wire, lost reply/cold retry, request gates, stale/reordered/false-extent pages, signed wrong-predecessor heads, malformed/redirect/oversize replies and drained close during submit/read fetch |
| Native binding control | Actual removal of exact request-hash verification makes the owner accept a stale signed page for its fresh nonce; intact owner refuses |
| Service delivery regression | 31 service tests plus one real-browser case pass; 80 generated histories, SIGKILL/competition and original decision controls retained |
| Browser delivery regression | Four property tests plus 19 native cases pass; eight generated durable histories, native commits, refusal/conflict/finalization and witness/authority controls retained |
| Account core regression | 30 tests pass, including existing private HTTP, process and mutation coverage |
| Full unit suite | 873 tests in 78 files pass |
| Final checks | Isolated build at `test-results/account-transport/app-build`, TypeScript, scoped lint/format and 13 repository gates; adjacent artifacts retain results |

The read selector is signed by the enrolled device. The service resolves that key from its authenticated
current membership, not a supplied key, registration receipt, position head or development operator token.
A separately domain-separated acceptance-key signature binds each response to the exact request and its
nonce, ciphertext/proof list, extent and continuation. The client reconstructs predecessors from retained
local envelopes before checking individual acceptance proofs. Readback grants no receive/mint authority
and writes no content, cursor or acceptance evidence. Submission records only verified original responses
through the existing v8 witness/native-commit path.

The initial direct service run used the nonexistent credential state `revoked` as a test fault; SQLite
correctly rejected the setup. The corrected test uses existing non-confirmed `staged`, then verifies
that replay refuses. No production counterexample was demonstrated by the generated campaign. The
three mutation controls demonstrate their specific failure modes, not whole-protocol correctness.

Sources for the final campaign and retained regressions match current files. The new runner is wired
into `pnpm account:transport` and `pnpm check`; direct Node commands ran the focused/regression checks,
not the entire check script. Build output was isolated and the existing chunk-size warning remains;
the explicit bundle-budget gate is recorded separately.

This is one-device private readback of already retained spool bytes, not inbound editor delivery or
second-device enrollment. Requests are replayable for the exact bounded selector during their short
expiry window while current membership holds; clocks must overlap that window. Whole-ledger scans,
retention, restore/rollback and backlog performance remain open. Personal release/browser/factors were
not operated on, personal preview/relay remain off, and no whole debt is paid. Next is the owned private
one-device delivery/reconnect driver.
