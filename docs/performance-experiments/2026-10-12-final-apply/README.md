# Final apply and protocol verification stalls

2026-10-12. Prepared handoff is committed **signed `02829405`**. This is a bounded investigation of
that build, with test-only instrumentation. No production code, authority check, undo behavior, stored
format or deployment changes. Release validation remains paused.

**The next repair should target fresh custody inventory reads and repeated membership proof work.**
The final handoff is largely waiting for its authority check, not applying Yjs updates. The largest
CPU tasks contain repeated proof verification, with parsing, encoding and crypto calls; calling them
simply “parser stalls” would be misleading.

## Final handoff: fresh read dominates

Two sessions without CPU sampling, both desktop CPU-4x and 75 ms added service delay:

| Condition | Final jobs | Storage queue, total / max | Fresh authority, total / max | Apply + publication, total / max |
|---|---:|---:|---:|---:|
| Ten active peer edits | 7 | 3.4 / 1.0 ms | 369.8 / 86.9 ms | 65.2 / 11.1 ms |
| 600-position backlog | 14 | 5.9 / 0.8 ms | 584.5 / 70.3 ms | 119.7 / 11.4 ms |

Fresh authority accounts for about **82–84%** of these stages' total elapsed time. Inside it, fresh
inventory read accounts for 341.1 / 534.4 ms, and exact inventory equality for 26.6 / 48.0 ms. Median
read is 33.8 / 34.4 ms; median equality is 3.8 / 3.7 ms. Read elapsed includes database open, native
scheduling/cursor work and task-budget waits. It is **not a CPU measurement**, nor does this experiment
separate all those components. Long-task overlap alone does not explain the long read tails: several
50–87 ms checks overlap no long task, or only its last 3–4 ms.

Canonical Yjs apply totals only 1.7 / 5.9 ms; live projection apply 0.7 / 1.2 ms. Full projection
comparison costs 34.6 / 65.9 ms, and publication 13.4 / 25.1 ms, nested within the apply column. The
actual post-check phase has medians 9.3 / 8.5 ms. It still matters, but removing or weakening its full
comparison or replacing the undo history is not justified by these measurements.

The two separate CPU-profile sessions reproduce the split: authority takes 313.7 / 550.3 ms and
apply/publication 67.4 / 127.8 ms (active / backlog). They are diagnostics, not additional repetitions
in a speedup estimate.

## Protocol work: repeated verified history, not one huge parse

The unprofiled active/backlog sessions both make **eight full `readJoinedAccount` calls**, four from
[discovery preparation](../../../src/crdt/accountReceive.ts#L1657) and four from
[membership adoption](../../../src/crdt/accountReceive.ts#L1440). Those are separate from the positive
unchanged-inventory memo: the active run records 159 authority reuses and zero memo authentications;
backlog records 241 reuses and one initial authentication. The full reads still happen after a fresh
`assertCurrent` because these callers retrieve the authenticated anchor/state independently.

Those two sessions each call `verifyReceipt` **80 times**, `verifyCertificationSuccessor` **16 times**,
and the generic protocol signature verifier **865 / 868 times** over the measured typing window.
These are aggregate call counts, not all attributed to inbound receipts. Source tracing explains the
repetition: each discovery response verifies a membership chain, and `adoptMembership` verifies that
chain again before it discovers that the epoch is unchanged. Nested history constructors also revisit
prior admission/certification proofs. This is valid conservative verification with repeated work.

The three largest unprofiled tasks are 134–138 ms active and 115–130 ms backlog. All overlap the
admission/certification verification chain. Recorded synchronous parser intervals cover at least
4–11 ms of those tasks; this is a **lower bound**, because sub-millisecond spans are aggregated rather
than individually retained. The largest instrumented individual parse is 9.3 / 10.2 ms (`parseJoined`).
Its activation checkpoint parse includes validating/decoding ciphertext hex that is immediately
retained as a string. That is an opportunity, but it does not explain the whole 100+ ms task.

The CPU-profile sessions have maxima 129 / 146 ms. Samples in those tasks include native `verify`,
encoding, canonical message construction, hex parsing and digest calls. The instrumentation's own
`begin`/`end` calls are also visible, so their absolute durations are perturbed. The earlier
[unmodified diagnostic profiles](../2026-10-12-prepared-receive/README.md) support the presence of the
same kinds of bursts. These profiles do not establish the exact CPU share of every asynchronous
verification call, and nested elapsed durations must not be added.

Current cooperation yields around storage-task operations. It cannot split the internal proof chain
under one `await verifyMembershipChain(...)`; the discovery verifier also runs on the network owner.
An `await` of a crypto promise is not a promise to give input a rendering opportunity between every
step. The observation is the long task; the code explains why the existing 8 ms checkpoint cannot
bound it.

## Recommended bounded repairs

1. **Make the fresh authority read cheaper, retaining it on every final apply.**
   `slotCustodyRows` currently opens the known database, validates its layout, and walks the scoped
   inventory with a cursor. Start with a bounded bulk inventory read under one readonly transaction;
   consider retaining the validated database connection for the exclusive owner's lifetime if native
   open cost remains significant. Preserve all keys and values, unknown-row detection, the 32-row
   refusal, exact positive comparison and authenticated fallback. Test prefix edge cases (including
   array suffixes), extra/missing/changed rows, abort, version change and close/drain. Do not replace
   this with a stale authority token, a MAC-only comparison, or a check performed earlier in prep.
   The current measurement selects this target; it does not promise a particular saving from bulk IO.
2. **Address membership verification bursts, first without changing what is checked.**
   Thread a private cooperative checkpoint through the warm discovery/history verification path,
   including guarded crypto boundaries, so a complete proof chain cannot monopolize one task.
   Recheck cancellation/lifetime and captured authority after each yield; no yield inside the native
   commit callback or synchronous final apply. Then eliminate duplicate verified-history work within
   a single owned discovery/adoption operation where a captured, verified result can be transferred
   safely. A longer-lived positive history memo is a separate optimization: it must compare exact
   owned proof bytes/objects, not just epoch/head, and retain fresh response signature, request,
   expiry, rollback and competing-authority checks.
3. **Keep final promotion synchronous against the live document and undo stack.**
   After the two repairs, remeasure active-peer and backlog typing. If the fresh-read FIFO wait still
   dominates, design a ready-to-apply handoff that can acquire the editor only after fresh validation
   and apply immediately under the same live storage task. Never hold storage while waiting behind
   a forced local write: that would recreate the deadlock guarded in the prepared-handoff tests.
   This further scheduling design is not implemented or assumed safe by this packet.

A standalone rewrite of the hex helper or an undo/projection shortcut is not the best next slice.
The former is smaller than the repeated protocol work; the latter targets only a minority of final
handoff time and has a much more delicate correctness boundary.

## Evidence and limits

All four restored sessions pass exact local text, last-key undo/redo, peer text preservation, export
convergence and cold offline replay. Typing-window completed account requests are all HTTP 200.
The fixture has 120 cards (~60 KB card text), 12 KB Goals, and a ~400-character edited card, with
120 requested keystrokes at 150 ms gaps. No real accounts or phone were used. Input automation can
undersample pre-handler blocking. This is an attribution study, not comparative performance or
release qualification; it establishes no new latency pass, speedup, throughput or population claim.

One initial instrumentation build failed because the installed TypeScript 7 package exposes a
version shim, not its old parser API. The probe was changed to the already-installed Babel parser;
no browser session ran with the failed build. Both build logs are retained.

[Prospective protocol](protocol.md), [per-session summary](summary.json), [source/build identities](source-identity.json),
[archive manifest](manifest.json) and [numeric evidence](evidence.tar.gz). The archive contains spans,
CPU profiles, source-map attribution and logs, excluding private browser/service fixtures and state.
The test-only probe is retained alongside it. No repair was applied after observing these results.
