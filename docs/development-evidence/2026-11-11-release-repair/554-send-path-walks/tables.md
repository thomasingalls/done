
#### Unreduced device

| Seed | Peer | Median local ms, before → after | p95 local ms, before → after | Whole-graph walks per send, before → after (objects per walk) | Runs × sends |
|---:|---|---|---|---|---|
| 300 | idle | 242.5 → 210.4 | 281.9 → 252.3 | 38.0 → 12.0 (9,678) | 3×30 and 3×30 |
| 300 | typing | 244.2 → 224.6 | 301.7 → 292.7 | 40.4 → 13.56 (9,745) | 3×30 and 3×30 |
| 1,000 | idle | 587.4 → 514.8 | 657.9 → 637.0 | 38.0 → 12.0 (30,807) | 3×30 and 3×30 |
| 1,000 | typing | 597.0 → 503.6 | 671.7 → 611.9 | 41.72 → 14.26 (30,867) | 3×30 and 3×30 |
| 3,000 | idle | 1,836.3 → 1,509.5 | 1,999.8 → 1,696.3 | 38.0 → 12.0 (91,176) | 3×30 and 3×30 |
| 3,000 | typing | 1,852.8 → 1,526.4 | 2,089.8 → 1,738.3 | 44.21 → 16.4 (91,049) | 3×30 and 3×30 |

Step-0 timers per sent position, peer idle, ms (before → after):

| Timer | 300 | 1,000 | 3,000 |
|---|---|---|---|
| indexUsage | 20.13 → 0.0 | 61.82 → 0.0 | 214.54 → 0.0 |
| receiptTurnWalk | 12.92 → 0.0 | 40.73 → 0.0 | 135.0 → 0.0 |
| extendLedger | 17.74 → 5.75 | 48.22 → 11.85 | 163.84 → 34.53 |
| loadElapsed | 155.69 → 128.19 | 433.56 → 365.25 | 1464.04 → 1177.05 |
| proposalCheck | 31.83 → 28.86 | 94.99 → 93.27 | 353.31 → 309.03 |
| installOwned | 13.45 → 13.79 | 47.57 → 48.7 | 160.1 → 157.81 |
| verifyCompare | 24.59 → 25.18 | 79.0 → 82.77 | 251.86 → 253.13 |
| verifyPrefix | 12.54 → 12.34 | 39.26 → 41.32 | 127.09 → 126.61 |
| selectProjection | 11.34 → 11.35 | 36.54 → 39.98 | 130.5 → 134.05 |
| warmShapeCheck | 30.19 → 31.12 | 65.42 → 70.78 | 281.88 → 296.24 |
| expectedChain | 7.02 → 7.22 | 23.1 → 24.26 | 75.89 → 80.26 |
| envelopeSelection | 8.31 → 8.41 | 23.93 → 26.88 | 63.96 → 66.07 |

Walks per send by site, peer idle (before → after): 300: index usage 14.0 → 0.0, receipt turn 12.0 → 0.0, adoption erase 12.0 → 12.0; 1,000: index usage 14.0 → 0.0, receipt turn 12.0 → 0.0, adoption erase 12.0 → 12.0; 3,000: index usage 14.0 → 0.0, receipt turn 12.0 → 0.0, adoption erase 12.0 → 12.0
Reduction inside a measured window: before False, after False

#### Reduced device

| Seed | Peer | Median local ms, before → after | p95 local ms, before → after | Whole-graph walks per send, before → after (objects per walk) | Runs × sends |
|---:|---|---|---|---|---|
| 300 | idle | 256.4 → 266.4 | 296.3 → 335.3 | 42.0 → 24.0 (754) | 3×30 and 3×30 |
| 300 | typing | 260.5 → 261.0 | 325.7 → 389.2 | 45.11 → 26.67 (872) | 3×30 and 3×30 |
| 1,000 | idle | 204.8 → 199.7 | 265.4 → 257.8 | 42.0 → 24.0 (754) | 3×30 and 3×30 |
| 1,000 | typing | 186.1 → 191.6 | 297.7 → 265.5 | 44.73 → 26.4 (854) | 3×30 and 3×30 |
| 3,000 | idle | 187.2 → 188.1 | 239.8 → 262.1 | 42.0 → 24.0 (754) | 3×30 and 3×30 |
| 3,000 | typing | 195.8 → 200.3 | 269.8 → 264.1 | 44.8 → 26.46 (870) | 3×30 and 3×30 |

Step-0 timers per sent position, peer idle, ms (before → after):

| Timer | 300 | 1,000 | 3,000 |
|---|---|---|---|
| indexUsage | 1.04 → 0.0 | 1.04 → 0.0 | 0.98 → 0.0 |
| receiptTurnWalk | 1.2 → 0.0 | 1.26 → 0.0 | 1.2 → 0.0 |
| extendLedger | 3.44 → 2.42 | 3.45 → 2.45 | 3.27 → 2.44 |
| loadElapsed | 185.91 → 192.58 | 121.41 → 118.72 | 112.67 → 116.56 |
| proposalCheck | 47.17 → 49.94 | 41.75 → 41.57 | 40.12 → 40.39 |
| installOwned | 2.68 → 2.89 | 2.7 → 2.85 | 2.67 → 2.97 |
| verifyCompare | 1.09 → 1.14 | 1.08 → 1.02 | 0.97 → 1.03 |
| verifyPrefix | 1.37 → 1.39 | 1.37 → 1.45 | 1.36 → 1.38 |
| selectProjection | 1.05 → 1.09 | 1.07 → 1.03 | 1.04 → 1.1 |
| warmShapeCheck | 83.88 → 85.73 | 15.42 → 15.66 | 14.78 → 15.64 |
| expectedChain | 0.61 → 0.62 | 0.68 → 0.63 | 0.63 → 0.62 |
| envelopeSelection | 0.79 → 0.88 | 0.92 → 0.9 | 0.82 → 0.95 |

Walks per send by site, peer idle (before → after): 300: index usage 6.0 → 0.0, receipt turn 12.0 → 0.0, adoption erase 24.0 → 24.0; 1,000: index usage 6.0 → 0.0, receipt turn 12.0 → 0.0, adoption erase 24.0 → 24.0; 3,000: index usage 6.0 → 0.0, receipt turn 12.0 → 0.0, adoption erase 24.0 → 24.0
Reduction inside a measured window: before False, after False
