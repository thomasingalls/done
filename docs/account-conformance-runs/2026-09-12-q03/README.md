# Q-03 — compact authenticated service-cache context

Parent: unsigned `dceec5c`. [Contract and outcome](../../review/implementation/liveness-followups.md#q-03-result).
The final result is `q03-final/result.json`; commands, frozen sources, exact pre-result contract and
runner are retained in `q03-2026-09-12T21-32-57+00-00/`. Functional stages passed; the sole final failure
was regenerated census formatting, corrected and checked in `q03-final/`. The before repair failure
and earlier overbroad sandbox-blocked v8 run are retained. No complete release aggregate is claimed.

Both 64 KiB and 1 MiB checkpoints with 35 rows (4 KiB source bodies) produce identical cold/warm results
with 13 warm and 118 cold verifications. Tampered request/digest refuse. Existing cache ownership,
eviction, close, membership, row integrity, generated service histories and crash controls pass.

Replay the commands in the functional summary; the directed command is
`node --test test/account-liveness/service-cache.test.mjs`. `archive-files.json` records original
local report hashes and normalized copies. Only absolute workspace prefixes are normalized; gzip is
lossless. No personal data, profile, service or installed build was changed.
