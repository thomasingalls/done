# Q-02 bounded original-source batching

Parent: unsigned `77a2753`. [Contract and result](../../review/implementation/liveness-followups.md#q-02-batching-result).
The five-stage outer campaign and nested 18-stage liveness campaign pass with unchanged source pins.
Commands, runner, tested contract, generated seeds, mutation results and native crash outcomes are
retained in their run folders. The complete unit suite has 1,018 cases; parser coverage has 34 tests.

Thirty edits after eighty individually settled edits create **3 positions and drain in 9.70 seconds**,
versus 30 / 112.66 seconds before Q-02 and 30 / 90.11 seconds after carrier collection/projection.
The local admission loop still takes 6.14 seconds, and individual round trips near eighty positions
remain 2.72–2.87 seconds. Timings are machine-specific inclusive measurements, not percentiles or
capacity guarantees. Source coverage and cold writing match; startup position count also changes
because initial originals can batch. Each original byte array and its actor/kind is kept unchanged.

Batching is opt-in for the composed private v9 sender. Its durable allocation fixes 2–32 references
with one actor/kind and at most 64 KiB original bytes. One invocation grant seals that group; later
edits cannot enter it. Six renderer-death cases, reply-loss exact retry, later-source separation,
120 generated histories, independent byte framing and effective actor/order/size/body-substitution
controls pass. The old reader refuses the new entry. Historical vectors are unchanged; ledger §8
is the explicit extension. Existing source and position tests retain full source-coverage assertions.

Run `node scripts/account-liveness/run.mjs` for the updated campaign, plus the exact unit/parser
commands recorded in the outer summary. Full release/platform/capacity qualification remains open.
Only workspace prefixes are normalized in these report copies; original paths/hashes are in
`archive-files.json`, and gzip is lossless. No personal app, profile, factors or server was touched.
