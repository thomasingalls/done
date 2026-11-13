# Phase 559 — hex encoding without an array of one string per byte

The coordinating session asked on 2026-11-13 for the bytes-to-hex and hex-to-bytes routines in `src`, `account-protocol` and `account-service` to be surveyed and measured before anything was built. The queued item was "the per-byte array in `hex()`", to be treated as a hypothesis. A replacement was to be built only if it at least halved the routine's time or peak memory at 8 MiB and above, on a call site that large input reaches, and the share of phase 542's codec cost owed to these routines was to be measured with and without it.

Base: phases 557 and 558, tree `4ef09a61b8da0101e356e1c9dd5e69f29dfbd476`, uncommitted on commit `bfb512c70`.

## Result

**The hypothesis held, for both bytes-to-hex routines.** `hex` in `src/crdt/custodyCrypto.ts` and its twin in `account-protocol/recovery.ts` filled a JavaScript array with one two-character string per byte and joined it. In this Node (26.13.1), at 8 MiB that took 151.6 ms per call (210.6 ms for the first call in a process) and raised the process's peak memory by 182.5 MiB; at 32 MiB, 567.7 ms and 642.2 MiB. From 64 bytes both now write one 16-bit slot of two ASCII digits per byte and decode it once with a `TextDecoder`: 13.3 ms and 32.6 MiB at 8 MiB, 48.3 ms and 128.9 MiB at 32 MiB as first built (13.6 and 51 ms in the final run). That is 11.4 to 11.8 times faster with about a fifth of the peak rise at 8 and 32 MiB, and 9 to 11 times faster from 64 KiB to 1 MiB. Below 64 bytes they run the base code (see "Short inputs keep the base code" below).

**And for a third.** `src/crdt/legacySource.ts` had its own helper, `toString(16)` per byte through `Array.from`, over up to 16 MiB of legacy rows (`MAX_BYTES`), once per legacy observation. At 16 MiB it took 1,494 ms and raised the peak by 1,041 MiB. It now uses the shared `hex`, which takes 28.5 ms and 65.0 MiB there.

**Short inputs keep the base code (after review).** The coordinating session measured phase 559 as first written in Playwright's WebKit 26.5. At 16 bytes it was 1.6 to 1.8 times slower than the base routine, and many call sites hash nonces and ids that short. The rule for this routine is no slower than the base at any size, in Chromium or WebKit, page or Worker. Both routines now run their base code unchanged below `HEX_SLOTS_FROM` = 64 bytes and the slot path from 64. In both engines, page and dedicated Worker, the final routines are within 0.94 to 1.05 of the base below 64 bytes, with overlapping round-to-round spreads, and 0.57 to 0.64 at 64 bytes. They are 0.11 to 0.19 at 8 MiB. The threshold, the candidates and the tables are under [In Chromium and WebKit](#in-chromium-and-webkit).

**Large input reaches them.** The survey ([survey.md](./survey.md)) found these call sites:
- the local-baseline codec (snapshot up to about 4 MiB on write and about 16 MiB on read);
- the promotion payload, which carries the genesis and catch-up checkpoint ciphertexts as hex and is re-encoded before every submission;
- freshly encrypted content, history and replacement checkpoints (plaintext up to 16 MiB);
- the joined-account and legacy-cleanup row comparisons (4 and 16 MiB);
- on the service, every ledger row's submission inside `snapshotBytes`;
- the legacy source observation's digest over every legacy row.

**Share of the phase 542 codec.** Measured with the codec running the base `hex` and then the final one, one operation, size and arm per process, three runs each:

| operation | encoded | time, first call | time, repeated calls | peak rise |
|---|---|---|---|---|
| encode with self-decode | 8 MiB | 186.2 → 55.0 ms (70% removed) | 163.3 → 46.0 ms (72%) | 190.8 → 53.3 MiB (72%) |
| decode | 8 MiB | 136.4 → 47.2 ms (65%) | 97.9 → 39.3 ms (60%) | 112.4 → 29.2 MiB (74%) |
| authentication payload | 8 MiB | 138.3 → 49.1 ms (64%) | 99.5 → 40.0 ms (60%) | 120.5 → 37.3 MiB (69%) |
| decode | 32 MiB | 471.0 → 186.1 ms (60%) | 408.4 → 164.9 ms (60%) | 381.6 → 83.0 MiB (78%) |
| authentication payload | 32 MiB | 471.3 → 190.0 ms (60%) | 412.1 → 165.5 ms (60%) | 409.5 → 83.0 MiB (80%) |

So `hex` was 60 to 72% of the codec's time and 69 to 80% of its own peak rise at these sizes. The same matrix with phase 559 as first written gave 56 to 73% and 69 to 80% ([tables.md](./tables.md)). Encoding at 32 MiB was not measured, because this build writes at most 8 MiB (`LARGE_LOCAL_BASELINE_WRITE_LIMIT`). The process peak for an 8 MiB encode, harness included, went from 602 to 249 MiB.

**What is left in the codec is mostly `lowerHexBytes`.** A third arm uses the engine's own `Uint8Array` `toHex` and `fromHex` as a floor (not equivalent: the build target cannot rely on them and `fromHex` accepts upper case). On it a 32 MiB decode takes 71.7 ms against 186.1 ms with this phase. By the routine measurements below, about 100 ms of the difference is `lowerHexBytes` decoding the 32-million-character snapshot field, and about 20 ms is `hex` against `toHex`.

**Built:** both `hex` routines, which now return the same string for every `Uint8Array` and keep every refusal, and the legacy source observation, which now uses the shared `hex` and so hashes the same JSON to the same digest.

**Not built:**
- `lowerHexBytes`. The best option measured halves its time without more memory (below), but it is a parser of peer- and service-supplied input. At this build's 8 MiB write ceiling it saves about 15 ms per decode, against about 90 ms and 80 MiB per decode from `hex`. It is held as HEX-DECODE.
- `unhex`. Same loop plus a regular expression, same cost. Its large callers are checkpoint ciphertexts (installable only to about 1.33 MiB) and coverage vectors.

No stored format, wire message, limit, alphabet or recorded decision changes.

## The routines measured

`scripts/performance/hex-cost/routines.mjs`, one routine and size per process, three processes per cell, five timed reps each (small inputs repeat inside a rep). The peak rise is the process's `maxRSS` after the first call less before it, so input and harness are excluded. All numbers are medians over the three runs; [tables.md](./tables.md) has every cell with its min–max spread.

**The final routines in Node** (join below 64 bytes, slots from 64; `run.sh final`), repeated calls, base → custodyCrypto and recovery:

| bytes | 1 | 8 | 16 | 32 | 48 | 63 | 64 | 128 | 1 KiB | 1 MiB | 8 MiB | 32 MiB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base | 30 ns | 130 ns | 250 ns | 420 ns | 590 ns | 770 ns | 790 ns | 1.53 µs | 11.9 µs | 17.7 ms | 157.1 ms | 601.4 ms |
| custodyCrypto | 30 ns | 120 ns | 230 ns | 410 ns | 600 ns | 770 ns | 350 ns | 430 ns | 1.8 µs | 1.5 ms | 13.6 ms | 50.9 ms |
| recovery | 30 ns | 120 ns | 230 ns | 420 ns | 590 ns | 770 ns | 320 ns | 420 ns | 1.6 µs | 1.5 ms | 13.5 ms | 52.4 ms |

Below 64 bytes both run the base code and measure from 2% slower (48 bytes, inside the spread) to 10% faster than this probe's copy of it. From 64 bytes they are 2.3 to 2.4 times faster, and 11.5 to 11.8 times faster at 8 and 32 MiB. The peak rise at 8 MiB is 32.6 against 182.4 MiB. The table below and the second part of [tables.md](./tables.md) are from phase 559 as first written, with slots at every length; above 64 bytes that is the same path. The raw rows are in `raw-final.jsonl` and `raw-codec-final.jsonl` (final routines) and `raw-routines.jsonl`, `raw-codec.jsonl` and `raw-legacy.jsonl` (first build).

| routine | 16 B | 32 B | 1 KiB | 64 KiB | 1 MiB | 8 MiB | 32 MiB |
|---|---|---|---|---|---|---|---|
| base `hex` (both files), rep | 248 ns | 404 ns | 11.7 µs | 0.81 ms | 16.3 ms | 151.6 ms | 567.7 ms |
| base `hex`, peak rise | — | — | — | 3.6 MiB | 25.6 MiB | 182.5 MiB | 642.2 MiB |
| custodyCrypto `hex` now, rep | 242 ns | 268 ns | 1.8 µs | 0.09 ms | 1.5 ms | 13.3 ms | 48.3 ms |
| recovery `hex` now, rep | 252 ns | 281 ns | 1.6 µs | 0.09 ms | 1.5 ms | 13.3 ms | 49.3 ms |
| `hex` now, peak rise | — | — | — | 1.5 MiB | 4.6 MiB | 32.6 MiB | 128.9 MiB |
| option: two byte tables, one decode | 233 ns | 280 ns | 2.3 µs | 0.13 ms | 2.2 ms | 18.2 ms | 68.9 ms |
| option: chunked `String.fromCharCode` (4,096 bytes) | 251 ns | 395 ns | 9.6 µs | 0.61 ms | 11.9 ms | 81.8 ms (61.0 MiB) | 324.1 ms (184.3 MiB) |
| floor: `Uint8Array.prototype.toHex` | 23 ns | 27 ns | 0.2 µs | 0.01 ms | 0.14 ms | 0.8 ms (16.5 MiB) | 7.0 ms (64.5 MiB) |
| `lowerHexBytes`, rep (input is twice as many characters) | 107 ns | 183 ns | 5.9 µs | 0.36 ms | 6.6 ms | 53.7 ms (8.7 MiB) | 214.3 ms (32.7 MiB) |
| `unhex` | 134 ns | 212 ns | 6.2 µs | 0.36 ms | 6.6 ms | 53.9 ms (8.6 MiB) | 208.8 ms (32.7 MiB) |
| option: `lowerHexBytes` through `encodeInto` and a nibble table | 260 ns | 294 ns | 4.0 µs | 0.24 ms | 4.9 ms | 41.1 ms (24.7 MiB) | 163.0 ms (96.8 MiB) |
| floor: `Uint8Array.fromHex` | 198 ns | 236 ns | 0.5 µs | 0.02 ms | 0.27 ms | 2.3 ms (8.5 MiB) | 8.6 ms (32.6 MiB) |

The first call in a process costs more for the base `hex`: 210.6 ms at 8 MiB and 584.6 ms at 32 MiB, against 13.1 and 49.9 ms with slots. In Node the slots alone were level with the base at 16 bytes and faster from 32. Browsers differ: see In Chromium and WebKit, which is why the final routines keep the base code below 64 bytes.

Three more `lowerHexBytes` options were tried in a scratch script, which is kept with its output ([lower-options.mjs.txt](./lower-options.mjs.txt), [lower-options.jsonl](./lower-options.jsonl)):

| option | 8 MiB, first call | 8 MiB, peak rise | 32 MiB, first call | 32 MiB, peak rise |
|---|---|---|---|---|
| the current `lowerHexBytes` | 51.4 ms | 9.1 MiB | 202.5 ms | 33.2 MiB |
| a 65,536-entry pair table on `charCodeAt` | 42.2 ms | 9.0 MiB | 166.1 ms | 33.0 MiB |
| the whole string through `encodeInto`, then the pair table | 24.5 ms | 24.7 MiB | 94.7 ms | 97.0 MiB |
| the same in 32,768-pair chunks | 22.7 ms | 9.2 MiB | 86.9 ms | 33.5 MiB |

The chunked one halves the time without extra memory. It meets the build bar for the routine and is held as HEX-DECODE, for the reasons under Result.

The legacy source's helper was measured in a second set of runs, beside the current `hex` in the same session, up to its 16 MiB bound (medians of three; [tables.md](./tables.md)):

| routine | 16 B | 32 B | 1 KiB | 64 KiB | 1 MiB | 8 MiB | 16 MiB |
|---|---|---|---|---|---|---|---|
| legacy helper, rep | 940 ns | 1.65 µs | 45.8 µs | 3.26 ms | 89.4 ms | 722.5 ms | 1,439.3 ms |
| legacy helper, first call and peak rise | — | — | — | — | 95.7 ms, 98.6 MiB | 746.0 ms, 489.5 MiB | 1,494.2 ms, 1,040.9 MiB |
| shared `hex` now, rep | 280 ns | 320 ns | 1.7 µs | 0.14 ms | 1.6 ms | 14.0 ms | 26.3 ms |
| shared `hex` now, first call and peak rise | — | — | — | — | 2.6 ms, 4.6 MiB | 14.1 ms, 32.7 MiB | 28.5 ms, 65.0 MiB |

**Host.** This Mac; nothing from vitest, `node --test` or Playwright was running during any recorded timed run ([overlap.log](./overlap.log)). An unrelated Lean build from another project, one core at full load, ran during the Node final-routine and codec runs after the browser review. One codec run of that set was discarded because its arm self-check could not tell the final routine from the base (both contain a join now); the probe now looks for the decode first, and the codec matrix was rerun. One earlier timing of the legacy helper ran while a `node --test` suite was running; it was discarded and the helper measured again. The load average was 2.6 to 6 and an unrelated Lean process from another project had been running earlier. One rep in each 32 MiB `hex` cell has a GC outlier near 158 ms; the medians are unaffected. The recorded matrix ran on the probe text before `oxfmt` reformatted two of its files and one lint comment was added. The only other changes to the probe since are the legacy helper's arm and its loop in `run.sh` (the legacy cells were run with the same loop by hand) and printing small timings to more decimals. A first matrix before that, with coarser small-size timings, gave the same results within run-to-run spread; it is not kept.

## In Chromium and WebKit

[hex-browsers.cjs.txt](./hex-browsers.cjs.txt) is a probe that started from the coordinating session's review script. It takes the routines from the sources themselves: the base tree through `git show`, the working tree from disk, and TypeScript stripped by Node's `stripTypeScriptTypes`. It runs them in Playwright's bundled Chromium 151.0.7922.34 and WebKit 26.5, on a bare page and in a dedicated Worker, and closes each browser afterwards.

- **Identity.** Every routine's output is compared with the base routine's on:
  - every byte value alone and all 256 together;
  - every length from 0 to 130;
  - offset views either side of 32 and 64;
  - the first four inputs of each timed pool;
  - one 8 MiB + 1 input.

  The final run made 1,836 comparisons per realm and the selection run 2,295, with none differing in any realm.
- **Timing.** Each cell is the median of 7 rounds (5 when selecting) of about 200 ms. Each round runs every routine over a pool of 256 inputs (8 at 1 MiB, 1 at 8 MiB), and the order rotates each round.
- **Output.** [hex-browsers-select.out](./hex-browsers-select.out) and [hex-browsers-final.out](./hex-browsers-final.out) hold the spreads; [browser-tables.md](./browser-tables.md) holds every table.

**Choosing the threshold** (selection run, ratio to the base routine): with the slot path at every length (phase 559 as first written), each realm's figures are:

| bytes | Chromium page | Chromium Worker | WebKit page | WebKit Worker |
|---|---|---|---|---|
| 1 | 3.21 | 3.39 | 10.52 | 9.38 |
| 8 | 1.03 | 1.01 | 2.82 | 2.84 |
| 16 | 0.65 | 0.65 | 1.68 | 1.73 |
| 24 | 0.50 | 0.51 | 1.29 | 1.33 |
| 32 | 0.42 | 0.42 | 0.97 | 1.04 |
| 40 | 0.89 | 0.85 | 0.84 | 0.88 |
| 48 | 0.76 | 0.74 | 0.76 | 0.79 |
| 64 | 0.69 | 0.68 | 0.61 | 0.64 |
| 128 | 0.38 | 0.38 | 0.41 | 0.42 |

One `TextDecoder` call costs about 200 ns in WebKit and about 100 ns in Chromium, whatever the length, about what the base routine spends on 32 bytes in WebKit and on 8 in Chromium. From 64 bytes the slot path is at least 31% faster in all four realms; at 48 it is 21 to 26% faster, at 40 11 to 16%, and at 32 level in WebKit. The threshold is 64, the smallest power of two with that margin. The margin leaves room for devices not measured. Candidate thresholds of 32, 48 and 64 were run as well. Below its threshold each runs the base code. It measured 0.95 to 1.09 of the base routine in single cells, with spreads that overlap the base routine's, and the slot path's figures above. The final run, with seven rounds, puts the chosen routine at 0.94 to 1.05 below the threshold.

**The final routines against the base**, median of 7 rounds, base → current (ratio):

**custodyNow against base** (median of 7 rounds; ratio below 1 is faster)

| bytes | chromium page | chromium Worker | webkit page | webkit Worker |
|---|---|---|---|---|
| 1 B | 33 ns → 31 ns (0.94) | 33 ns → 32 ns (0.97) | 21 ns → 22 ns (1.05) | 20 ns → 21 ns (1.05) |
| 8 B | 116 ns → 115 ns (0.99) | 117 ns → 116 ns (0.99) | 81 ns → 81 ns (1.00) | 80 ns → 81 ns (1.01) |
| 12 B | 164 ns → 163 ns (0.99) | 166 ns → 163 ns (0.98) | 113 ns → 114 ns (1.01) | 112 ns → 113 ns (1.01) |
| 16 B | 208 ns → 206 ns (0.99) | 210 ns → 209 ns (1.00) | 148 ns → 148 ns (1.00) | 146 ns → 146 ns (1.00) |
| 20 B | 253 ns → 252 ns (1.00) | 253 ns → 253 ns (1.00) | 174 ns → 174 ns (1.00) | 172 ns → 174 ns (1.01) |
| 24 B | 297 ns → 296 ns (1.00) | 298 ns → 298 ns (1.00) | 200 ns → 199 ns (0.99) | 197 ns → 196 ns (0.99) |
| 32 B | 380 ns → 379 ns (1.00) | 378 ns → 377 ns (1.00) | 256 ns → 258 ns (1.01) | 252 ns → 254 ns (1.01) |
| 40 B | 473 ns → 472 ns (1.00) | 472 ns → 471 ns (1.00) | 312 ns → 312 ns (1.00) | 307 ns → 308 ns (1.00) |
| 48 B | 555 ns → 554 ns (1.00) | 552 ns → 551 ns (1.00) | 369 ns → 368 ns (1.00) | 365 ns → 365 ns (1.00) |
| 56 B | 635 ns → 633 ns (1.00) | 640 ns → 639 ns (1.00) | 426 ns → 424 ns (1.00) | 422 ns → 418 ns (0.99) |
| 63 B | 714 ns → 716 ns (1.00) | 709 ns → 707 ns (1.00) | 488 ns → 493 ns (1.01) | 483 ns → 483 ns (1.00) |
| 64 B | 729 ns → 442 ns (0.61) | 721 ns → 421 ns (0.58) | 498 ns → 313 ns (0.63) | 493 ns → 315 ns (0.64) |
| 65 B | 740 ns → 487 ns (0.66) | 733 ns → 440 ns (0.60) | 526 ns → 315 ns (0.60) | 500 ns → 319 ns (0.64) |
| 128 B | 1422 ns → 535 ns (0.38) | 1406 ns → 508 ns (0.36) | 980 ns → 408 ns (0.42) | 971 ns → 407 ns (0.42) |
| 1 KiB | 10.8 µs → 1787 ns (0.17) | 10.8 µs → 1753 ns (0.16) | 7357 ns → 1836 ns (0.25) | 7357 ns → 1827 ns (0.25) |
| 1 MiB | 11.54 ms → 1.55 ms (0.13) | 11.52 ms → 1.55 ms (0.13) | 7.36 ms → 1.39 ms (0.19) | 10.25 ms → 1.42 ms (0.14) |
| 8 MiB | 119.75 ms → 12.67 ms (0.11) | 122.50 ms → 13.19 ms (0.11) | 61.50 ms → 11.39 ms (0.19) | 62.25 ms → 11.50 ms (0.18) |

`recovery.ts`'s routine against its own base gives the same picture (0.97 to 1.01 below 64 bytes, 0.57 to 0.63 at 64, 0.11 to 0.18 at 8 MiB; [browser-tables.md](./browser-tables.md)). Below 64 bytes the routine is the base code plus one comparison. The two cells at 1.05 (WebKit, 1 byte, 20 to 21 ns against 21 to 22 ns) are 1 ns, inside both routines' spreads. In the same run `recovery.ts`'s untouched base routine also measured 1.05 against the other copy of the base code there.

The selection run ran first. The final run ran after the comment above `HEX_SLOTS_FROM` had been reworded, and nothing else changed. The final run's process reached its 590 s bound while WebKit was closing, after every result had printed; no Playwright process was left. Nothing from vitest, `node --test` or Playwright ran beside either run. An unrelated Lean build from another project started in the last seconds of the final run, after its timing had ended ([overlap.log](./overlap.log)).

## The change and why it is equivalent

Both files make the same change. Below `HEX_SLOTS_FROM` = 64 bytes each runs its base code unchanged, with the same string table and the same join; only an `if` around it is new. From 64 bytes each takes the new path:

```ts
const HEX_SLOTS_FROM = 64;
// in hex(b), after the unchanged empty-view guard:
if (b.length < HEX_SLOTS_FROM) {
  const parts = new Array<string>(b.length); // the base code, as it was
  for (let i = 0; i < b.length; i++) parts[i] = hexByte[b[i]!]!;
  return parts.join('');
}
// the slot path, with these tables beside the unchanged string table:
const hexPairs = (() => {
  const pairs = new Uint16Array(256),
    ascii = new Uint8Array(pairs.buffer);
  for (let n = 0; n < 256; n++) {
    ascii[2 * n] = '0123456789abcdef'.charCodeAt(n >> 4);
    ascii[2 * n + 1] = '0123456789abcdef'.charCodeAt(n & 15);
  }
  return pairs;
})();
const asciiText = new TextDecoder();
const ascii = new Uint16Array(b.length);
for (let i = 0; i < b.length; i++) ascii[i] = hexPairs[b[i]!]!;
return asciiText.decode(ascii);
```

- **The threshold.** Phase 559 as first written used the slot path at every length. The coordinating session's review measured it slower than the base routine at 16 bytes in WebKit (1.6 to 1.8 times). WebKit is the engine phones run. This seat's measurement (see In Chromium and WebKit) found one `TextDecoder` call costs about as much as joining 32 bytes' strings in WebKit, so the slot path was up to ten times slower at 1 byte, and three times slower at 1 byte in Chromium. From 64 bytes it was at least 31% faster in both engines, page and Worker. At 48 it was 21 to 26% faster, at 40 11 to 16%, and at 32 level. The threshold is the smallest power of two with a clear margin in all four realms, which leaves room for devices not measured.
- **Below the threshold** the code is the base code. Equivalence there is identity: the same table, loop and join.
- **Same characters on the slot path.** For byte value `n` the base table held `n.toString(16).padStart(2, '0')`: the high digit then the low digit, lower case. The new table holds the same two characters as ASCII bytes in that order. They are written through a byte view, so the 16-bit slot has them in memory order on either byte order. Copying the slot into the output keeps that order.
- **Same decoding.** UTF-8 decoding of bytes `0x30`–`0x39` and `0x61`–`0x66` gives exactly those characters. No byte there can begin a byte-order mark, which is the only thing a default `TextDecoder` drops, and none can be malformed. `decode` reads the view's bytes, all `2 × length` of them.
- **Same input reads.** The loop reads `b[i]` for `i` below `b.length`, as before. A view with a byte offset, a view over a larger buffer, a pooled `Buffer` and a length-tracking view of a resizable buffer read the same bytes.
- **Same refusals.** The guard is unchanged in both files and runs before either path. A view over a detached buffer has length 0, so it always reaches `b.subarray(0, 0)`, which throws `TypeError: Cannot perform Construct on a detached ArrayBuffer`, whatever length the view had. A fixed view left out of bounds by shrinking a resizable buffer also has length 0 and throws a `RangeError` there. A missing input throws the same `TypeError` reading `length`. A live empty view returns `''`. In `recovery.ts`, as before, an empty live view goes on past the guard to the join path and returns `''` from joining an empty array. No refusal is possible on either path for a non-empty input: both only read `b[i]` below `b.length`.
- **No argument limit.** Nothing is spread or passed through `apply`, and nothing is chunked, so phase 558's limit does not apply. No guard in `test/argumentSpreads.test.ts` was needed.

**The legacy source observation.** `src/crdt/legacySource.ts` drops its own helper and imports `hex` from `./custodyCrypto` (which imports nothing). For every `Uint8Array`, `Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')` and the shared `hex` give the same string, so the JSON hashed for the observation digest, and the digest, are unchanged. The helper's refusal of a detached view (a `TypeError` from the array iterator) becomes the shared guard's `TypeError` with another message; the rows it hashes are fresh copies made one line after they are read, so none can be detached.

Two differences remain in the shared routines, and neither can reach a caller:
- **Non-`Uint8Array` input.** For a plain array holding a value outside 0–255, the base routine joined an empty string for that element, and the new one writes two NUL characters. The parameter is typed `Uint8Array` and every call site passes one.
- **Inputs past about 256 MiB.** Both throw, because the result exceeds the engine's string length, but the error may differ. The largest bound on any input is 72 MiB.

**Memory.** Below 64 bytes nothing changes. From 64 bytes: the base routine held an array of `n` pointers (8 bytes each in Node, 4 in Chromium with pointer compression, 8 in WebKit) beside the `2n`-character result. The new one holds `2n` bytes of slots beside the result. The slots and the result hold the same hex text that the base routine's result held. The slots are garbage after the call, as the base routine's array was.

## What runs differently

The two routines return the same strings. From 64 bytes they are faster and use less memory; below it they run the base code. The legacy observation computes the same digest faster. No check changes, runs less often or on different input. No other caller is touched.

## Tests

**New: `test/hexEncoding.test.ts` (25 cases, about 1 s).** The base text of both routines is kept in the file as the reference. Node's own `Buffer` hex encoder serves as a second oracle. `SLOTS_FROM` = 64 in the test mirrors `HEX_SLOTS_FROM` in the sources.

- **Equivalence controls** (5 per routine, 10 in all; they pass on both sources):
  - every byte value alone (the join path), and all 256 together and reversed (the slot path);
  - either side of the threshold: 63, 64 and 65 bytes, each with every byte value at every position across 37 shifted fills;
  - lengths 0 to 3, and either side of 16, 32, 64, 256, 4,096, 65,536 and 1 MiB;
  - views at odd and even byte offsets, over a larger buffer, at the end of a buffer, and pooled `Buffer`s (16- and 33-byte views take the join path, 4,091 and 4,099 the slot path);
  - one input of 8,388,609 bytes (8 MiB + 1), compared with the reference in full.
- **Refusal controls** (4 per routine, 8 in all; they pass on both sources). Every refusal happens at the empty-input guard, before either path: a detached view and a fixed view left out of bounds both have length 0, and a missing input fails reading its length. Non-empty views take one path or the other and cannot refuse.
  - views over a detached buffer with lengths 0, 1, 16, 11 at offset 5, and 4,096: the same `TypeError` and message as the reference (the guard);
  - live empty views return `''` (the guard; in `recovery.ts` the join path, as before);
  - a resizable buffer of 160 bytes shrunk or grown to 0, 6, 24, 48, 120 and 300 under a fixed 16-byte view, a fixed 100-byte view, a fixed empty view and a length-tracking view: the same output or the same `RangeError` as the reference. Out-of-bounds views reach the guard. In-bounds 16-byte views and short tracked lengths take the join path; the 100-byte view and tracked lengths of 64 or more take the slot path;
  - `undefined` and `null`: the same error (the guard).
- **Cost** (5 cases):
  - A control: a counter wrapped around `Array.prototype.join` sees the base routines join exactly one array of 4,096 elements for 4,096 bytes, and none at 4,097. It passes on both sources.
  - **Fails on the base source, one case per routine:** at 8,388,609 bytes, no array with at least that many elements may be joined while `hex` runs, and the output must equal the reference. The base routines join one such array every call, so this is deterministic. It trips on the base routine whatever the host's speed or memory.
  - **Fails on the base source, one case per routine:** at 63 bytes exactly one 63-element array is joined (the base code is kept where it is faster in WebKit), and at 64 bytes none. The base routines fail the second half; phase 559 as first written fails the first.
- **The legacy source observation** (2 cases). These run the real `inspectLegacySource` over fake IndexedDB and a stubbed `localStorage`, as `test/legacySource.test.ts` does. The legacy store holds two real Yjs updates of 4,250,000 characters each, 8.5 MB in all, under the reader's 16 MiB bound.
  - A control: the observation's digest equals the SHA-256 of its JSON computed independently with Node's encoder, and both rows and their dependencies read back. It passes on both sources.
  - **Fails on the base source:** while the observation runs, no array as long as its shorter row is joined, and the digest is still the expected one. The base helper joins one per row.

**On the base source** ([run](./base-tree-run.txt)), with all three sources at their base text: the five cost cases fail. Two are at 8 MiB + 1 ("expected 1 to be 0"), two are the threshold cases (at 64 bytes the base joins: "expected 1 to be 0"), and one is the legacy observation ("expected 2 to be 0" for its two rows). The 20 controls pass.

**Cost evidence.** Time and peak memory are in the probe and this record, not in assertions. The unit test asserts the structural cause: no per-byte array is joined.

**Equivalence on the codec, as a side effect of the probe.** Every encode run checks that its record equals, byte for byte, the payload the probe built with Node's `Buffer`. Every decode re-encodes through `hex` and refuses unless the result matches its input exactly (`decodeLocalBaseline`'s canonical check). All 45 codec runs completed. The 15 that ran the current routine (3 encodes at 8 MiB, and 12 decodes or authentication payloads at 8 and 32 MiB) show it producing byte-identical records at those sizes.

## Mutation controls

[Output](./mutation-controls.txt), script [mutation-controls.py.txt](./mutation-controls.py.txt). Each mutation was applied alone to the final source, the whole test file was run, and the file was restored byte for byte. The set was rerun in full after the browser review, on the final sources and test: 25 trip and 2 survive by design. Case counts are in brackets.

- **The choice of path, each file:**
  - the join path for every length, which is the base routine (`custodyCrypto.ts` 3, `recovery.ts` 2): the 8 MiB cost case and the threshold case, plus the legacy cost case for `custodyCrypto.ts`;
  - the slot path for every length, which is phase 559 as first written (1 each): the threshold case;
  - the comparison inverted (3 and 2): as for the join path everywhere;
  - the threshold one byte late, `<=` in `custodyCrypto.ts`, and one byte early, `< 63` in `recovery.ts` (1 each): the threshold case.
- **The join path only:**
  - a wrong digit for byte 0xab in `custodyCrypto.ts`'s string table (5): every byte value alone, the length sweep, either side of the threshold, and both legacy cases, through the digest's own hex;
  - upper-case digits in `recovery.ts`'s string table (5);
  - the join path reading the whole buffer instead of the view (`custodyCrypto.ts`, 2): the views and resizable cases;
  - the join path dropping its last byte (`recovery.ts`, 6).
- **The slot path only:**
  - a wrong digit for byte 0xab in the pair table (6 each): all values together, the length sweep, views, either side of the threshold, the 8 MiB input and the 8 MiB cost case's output check;
  - the two digits of a pair swapped (`custodyCrypto.ts`, 9) and upper-case pair digits (`recovery.ts`, 7);
  - the last byte dropped (`custodyCrypto.ts`, 9) and one slot too many (`recovery.ts`, 7);
  - the whole buffer read instead of the view (2 each).
- **The guard before both paths:**
  - no detached-buffer refusal for empty views (2 each): the detached and resizable cases;
  - a missing input returning `''` (`custodyCrypto.ts`, 1).
- **The legacy observation:**
  - its base helper restored (1): the legacy cost case;
  - rows hashed without their first byte (2): both legacy cases.
- **Survives: a little-endian-only pair table** (`pairs[n] = high | low << 8`). It is equivalent on this little-endian host. The table is built through a byte view so that it is right on either order, and no test can show the difference here.
- **Survives: Node's `Buffer` in place of `TextDecoder`.** It is equivalent in Node, and the tests run only in Node. It would not load in a browser.

## Bookkeeping

Following [development.md](../../../development.md#release-bookkeeping); details in [evidence.json](./evidence.json):
- **Registration.** `test/hexEncoding.test.ts` is in `scripts/release-validation/general-tests.json`. Denominators move in `test/release-validation/general-tests.test.mjs` and `generated-tests.test.mjs`:
  - the case denominator, 3,066 to 3,091;
  - reviewed Vitest files, 121 to 122;
  - general stages, 306 to 307;
  - reviewed Vitest stages, 140 to 141.
- **Planning inventory.** Recorded with `scripts/release-validation/check.mjs --record` and `plan.mjs --record` after reviewing the drift. The drift was the new test file, the three registration files, the construction registry and the three probe files (`codec.probe.ts`, `routines.mjs`, `vitest.config.ts`). It was recorded again twice. The first time, the test's tables had been made statically resolvable and only the test file's hash moved. The second time, the legacy cases, the legacy arm in `routines.mjs`, the eleventh registry line and the denominators had moved. It was recorded a third time after the browser review, when the test, the codec probe's arm label, ten registry lines and the denominators had moved. Obligations go from 1,135 to 1,136; unresolved stay at 561.
- **Runtime census.** Recorded after review, and again after the browser review. Three source hashes changed. No domain label or crypto call is in a changed line. Eleven label sites moved from the base:
  - five in `custodyCrypto.ts`, 24 lines down;
  - five in `recovery.ts`, 23 lines down;
  - `done/legacy-source-observation/v1` in `legacySource.ts`, 2 lines up.
- **Construction registry.** The same eleven `sourceSites` lines move in `docs/account-crypto/constructions.json`, and each new line holds its label. The registry check behind `account:crypto-audit` (`checkConstructionRegistry`) reports no failures and 16 open constructions, as before this phase. With the base registry lines put back as a control, it reports six constructions whose source sites changed.
- **Source-text anchors** (phase 556's rule): every string literal of 16 or more characters in `vite/`, `test/` and `scripts/` that occurs in the base text of the three sources occurs the same number of times now: 57 occurrences. That includes the mutation anchors of `scripts/legacy-source/run.mjs`. The new test and probe are left out of that rule because they quote the base routines as their reference.
- **Decision and notes.** A 2026-11-13 entry in `docs/decisions.md`, which records the change and amends nothing, and the seat section of `docs/progress.md`. Three items are added under "Held from the release repair" in `docs/product-backlog.md`: HEX-DECODE, SEND-PROMOTION-HEX and SVC-SNAPSHOT-HEX.

## Runs

- the new test file on the final tree (25 passed) and on the base sources (5 failed, 20 passed);
- the 55 Vitest files that import any of the three changed modules, the new one and `test/legacySource.test.ts` included (644 passed; [related-run.txt](./related-run.txt));
- the Node suites over the protocol module ([node-runs.txt](./node-runs.txt)):
  - `account:recovery`, `account:recovery-contract`, `account:authority`, `account:service-delivery`, `account:crypto-prep` and `test/account-ceremony/content-transfer.test.mjs`, on the first build;
  - `account:recovery`, `account:recovery-contract`, `account:crypto-prep` and the release-validation tests again on the final routines;
- the browser probe in Chromium and WebKit, page and Worker ([hex-browsers.cjs.txt](./hex-browsers.cjs.txt));
- typecheck, `oxfmt --check` and `oxlint` on the changed sources, the test and the probe;
- the runtime census check, `check.mjs` and `plan.mjs` after recording, and `test/release-validation` general, generated and inventory tests.

Not run: the full unit suite, `pnpm build`, `trace:check`, `account:crypto-audit` (its registry step was run alone), and the browser and native suites, among them `storage:legacy-source`, whose native Chromium run is the legacy observation's real-browser coverage.

## At review

The coordinating session read the three source diffs and the test on 2026-11-13. Its first browser run is what led to the threshold (see [In Chromium and WebKit](#in-chromium-and-webkit)). After the revision it ran the following on the final tree.

- **Full unit suite:** 359 files, 3,746 cases passed, 1 skipped, none failed (3,721 before this phase plus the 25 new cases). No other test process was running when it started.
- **Its own control:** with the slot path in `account-protocol/recovery.ts` dropping each byte's high bit, 7 of the 25 cases fail. Source restored byte for byte.
- **Its own browser run**, with a separate script that carries a copy of both routines (old, and final with the threshold), median of 5 rounds per size: the strings are identical in Chromium 151 and WebKit 26.5, page and dedicated Worker. Below 64 bytes the final routine is within 2% of the old one in all four (8, 16, 32 and 63 bytes). At 64 bytes it takes 0.58 to 0.83 of the old time, and at 1 KiB to 8 MiB 0.10 to 0.43. The WebKit page was the slowest realm in that run (0.83 at 64 bytes, 0.33 to 0.43 at 1 KiB and above); the tables above have it at 0.63 and 0.19 to 0.25.
- Also run: typecheck, build, contract and bookkeeping checks, the history, service delivery and service inbound node tests, and the CI session, authority and quarantine steps.

## Not verified

- **Phones and other devices.** The routine was timed in Node and in Playwright's desktop Chromium 151 and WebKit 26.5 on one Mac, page and Worker; no phone and no Safari build was measured. Memory was measured in Node only, and the codec and legacy figures are Node only.
  - In Chromium, pointer compression halves the base routine's array, so the memory saving there is smaller than measured: about `6n` bytes falls to `4n`, not `10n` to `4n`.
  - Whether a browser's `TextDecoder` copies its input first, which would add `2n` bytes for the call, was not checked.
- **Whole reductions.** Only the codec was measured. Phase 542's whole-reduction probe was not rerun, so the effect on a reduction's time and peak is not known beyond the codec's share.
- **Big-endian hosts.** The table is built to be right on either byte order, but no test can show that on this host.
