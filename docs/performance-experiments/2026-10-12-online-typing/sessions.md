# All unprofiled typing observations

At signed `9ba0ae63`, with the probe identified in `source-identity.json`. Each row is a fresh
restored session of 120 keys at CPU-4x. Online includes the 75 ms proxy and ten peer edits.
Every row passes convergence, one-step undo/redo and cold offline replay. No timing row was
failed, omitted or retried. Queue-wait sums count each waiting input; they are not wall time.

| Session | Handler median / p95 / max ms | Frame median / p95 / max ms | Sum input wait ms | Remote overlap % | Long tasks / max ms |
| --- | --- | --- | ---: | ---: | --- |
| card-12000-offline-1 | 5.7 / 7.2 / 28.0 | 16.6 / 20.1 / 50.6 | 3.0 | 0.0 | 0 / 0 |
| card-12000-offline-2 | 5.5 / 7.2 / 25.9 | 16.5 / 20.1 / 46.1 | 4.4 | 0.0 | 0 / 0 |
| card-12000-online-1 | 5.8 / 8.3 / 20.6 | 17.9 / 431.4 / 773.4 | 4581.7 | 90.9 | 137 / 148 |
| card-12000-online-2 | 5.8 / 7.2 / 24.5 | 17.7 / 510.4 / 718.7 | 4907.7 | 93.8 | 137 / 141 |
| goals-12000-offline-1 | 8.2 / 10.2 / 32.1 | 18.0 / 22.2 / 51.8 | 1.9 | 0.0 | 1 / 50 |
| goals-12000-offline-2 | 9.0 / 11.2 / 30.6 | 19.4 / 23.6 / 49.2 | 4.0 | 0.0 | 0 / 0 |
| goals-12000-online-1 | 9.0 / 12.2 / 32.3 | 19.9 / 496.0 / 724.0 | 4243.3 | 92.4 | 136 / 165 |
| goals-12000-online-2 | 8.8 / 12.6 / 34.3 | 19.9 / 432.2 / 708.5 | 3810.4 | 91.8 | 139 / 150 |
| goals-3000-offline-1 | 7.7 / 10.6 / 31.9 | 17.4 / 22.9 / 50.6 | 1.8 | 0.0 | 1 / 50 |
| goals-3000-offline-2 | 7.4 / 10.1 / 35.5 | 17.1 / 21.7 / 55.6 | 5.8 | 0.0 | 1 / 55 |
| goals-3000-online-1 | 7.7 / 11.4 / 34.1 | 18.4 / 491.2 / 709.5 | 4881.1 | 93.1 | 145 / 168 |
| goals-3000-online-2 | 7.8 / 10.4 / 33.8 | 18.2 / 488.0 / 668.8 | 4648.8 | 93.0 | 139 / 138 |
| goals-64000-offline-1 | 13.5 / 17.0 / 43.6 | 23.8 / 29.8 / 64.2 | 4.2 | 0.0 | 1 / 63 |
| goals-64000-offline-2 | 12.7 / 15.6 / 42.4 | 22.6 / 28.2 / 61.7 | 5.6 | 0.0 | 1 / 61 |
| goals-64000-online-1 | 13.3 / 17.6 / 38.3 | 24.5 / 493.1 / 833.4 | 4548.0 | 90.2 | 131 / 180 |
| goals-64000-online-2 | 13.5 / 17.7 / 40.3 | 24.6 / 431.8 / 805.8 | 4368.1 | 90.3 | 129 / 164 |
