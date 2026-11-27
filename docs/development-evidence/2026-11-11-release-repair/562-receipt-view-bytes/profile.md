# CPU profile of the base all72 case

One run of the base text: `vitest run test/inboundReceiptViews.test.ts --maxWorkers=1 -t all72 --execArgv=--cpu-prof --execArgv=--cpu-prof-interval=200` (Node 26.13.1, 200 µs sampling), split by [profsplit.py.txt](./profsplit.py.txt). The case function is line 31 of Vite's transformed file (line 41 of the base source). `index.js:1696` is chai's assertion wrapper, which every matcher goes through; `index.js:1225` is Vitest 4.1.10's `toEqual` and `index.js:1264` its `toMatchObject` (`@vitest/expect/dist/index.js`); `equals index.js:211` is the general recursive equality both use. The profile file (438 KB) was not kept.

## By direct callee of the case function

# CPU.20261113.102445.16658.0.001.cpuprofile: 3240 ms sampled; under the case function: 2774 ms
| ms | share of case | direct callee of the case function |
|---:|---:|---|
| 2707 | 97.6% | `(anonymous) index.js:1696` |
| 25 | 0.9% | `inspect inboundReceiptViews.test.ts:14` |
| 21 | 0.7% | `pageFixture fixtures.ts:8` |
| 11 | 0.4% | `expect test.DNmyFkvJ.js:4090` |
| 4 | 0.1% | `entries inboundRecord.ts:366` |
| 3 | 0.1% | `referenceBytes fixtures.ts:47` |
| 3 | 0.1% | `(case function self)` |
| 0 | 0.0% | `proxyGetter index.js:1626` |

## By the first four frames below the case function (top 20)

# CPU.20261113.102445.16658.0.001.cpuprofile: 3240 ms sampled; under the case function: 2774 ms
| ms | share of case | direct callee of the case function |
|---:|---:|---|
| 2693 | 97.1% | `(anonymous) index.js:1696 > (anonymous) index.js:1147 > (anonymous) index.js:1225 > equals index.js:211` |
| 24 | 0.9% | `inspect inboundReceiptViews.test.ts:14 > inspectInboundReceipt inboundRecord.ts:330 > captureInboundReceiptSyntax inboundRecord.ts:291 > decodePageSyntax inboundRecord.ts:268` |
| 7 | 0.3% | `expect test.DNmyFkvJ.js:4090 > setState index.js:752` |
| 3 | 0.1% | `pageFixture fixtures.ts:8 > (anonymous) fixtures.ts:11 > entry fixtures.ts:63 > authority fixtures.ts:40` |
| 3 | 0.1% | `(anonymous) index.js:1696 > _Assertion index.js:1402 > proxify index.js:1623 > __name index.js:3` |
| 3 | 0.1% | `(case function self)` |
| 3 | 0.1% | `entries inboundRecord.ts:366 > decodePositionResponse positionDecision.ts:103 > encodePositionResponse positionDecision.ts:64 > headMessage positionDecision.ts:56` |
| 2 | 0.1% | `pageFixture fixtures.ts:8 > context oracle.ts:35 > sources fixtures.ts:154 > entry fixtures.ts:63` |
| 2 | 0.1% | `(anonymous) index.js:1696 > (anonymous) index.js:1147 > (anonymous) index.js:1264 > equals index.js:211` |
| 2 | 0.1% | `pageFixture fixtures.ts:8 > sources fixtures.ts:154 > Doc yjs.mjs:422 > uuidv4 random.js:35` |
| 2 | 0.1% | `(anonymous) index.js:1696 > (anonymous) index.js:1147 > (anonymous) index.js:1264 > getObjectSubset index.js:674` |
| 2 | 0.1% | `pageFixture fixtures.ts:8 > sources fixtures.ts:154 > entry fixtures.ts:63 > fields fixtures.ts:19` |
| 2 | 0.1% | `(anonymous) index.js:1696 > (anonymous) index.js:1147 > (anonymous) index.js:1388 > proxyGetter index.js:1626` |
| 2 | 0.1% | `(anonymous) index.js:1696 > (anonymous) index.js:1147 > (anonymous) index.js:1388 > (anonymous) index.js:1799` |
| 1 | 0.0% | `pageFixture fixtures.ts:8 > sources fixtures.ts:154 > entry fixtures.ts:63 > authority fixtures.ts:40` |
| 1 | 0.0% | `(anonymous) index.js:1696 > (anonymous) index.js:1147` |
| 1 | 0.0% | `pageFixture fixtures.ts:8 > sources fixtures.ts:154 > applyUpdate yjs.mjs:1764 > applyUpdateV2 yjs.mjs:1748` |
| 1 | 0.0% | `expect test.DNmyFkvJ.js:4090` |
| 1 | 0.0% | `referenceBytes fixtures.ts:47` |
| 1 | 0.0% | `pageFixture fixtures.ts:8 > sources fixtures.ts:154 > insert yjs.mjs:7325 > transact yjs.mjs:3400` |
