# Unprofiled sessions

Each row is a separate restored session; p95 is not pooled across keys. All sessions pass full text, last-key undo/redo, convergence and cold offline replay. CPU-4x, 75 ms per request, 120 keys.

| Session | Frame median / p95 / max (ms) | Keys >100 ms | Long tasks / max (ms) | Full authority / reused checks | Local queue wait (ms) |
| --- | --- | --- | --- | --- | --- |
| candidate-active-1 | 17.4 / 210.6 / 298.1 | 10 / 120 | 71 / 157 | 0 / 191 | 1702.7 |
| candidate-active-2 | 17.4 / 207.2 / 255.6 | 10 / 120 | 71 / 149 | 0 / 197 | 1626.0 |
| candidate-backlog-1 | 18.5 / 162.2 / 231 | 9 / 120 | 26 / 169 | 1 / 260 | 1214.7 |
| candidate-backlog-2 | 16.2 / 136.7 / 149.5 | 11 / 120 | 28 / 145 | 1 / 270 | 1061.9 |
| candidate-silent-1 | 16.5 / 20.8 / 59.9 | 0 / 120 | 60 / 96 | 0 / 99 | 36.4 |
| candidate-silent-2 | 16.7 / 20.9 / 41.8 | 0 / 120 | 60 / 86 | 0 / 99 | 30.7 |
| reference-active-1 | 18.2 / 398.4 / 613.5 | 10 / 120 | 129 / 150 | 91 / 0 | 3565.2 |
| reference-active-2 | 17.6 / 390.3 / 574.7 | 10 / 120 | 128 / 148 | 90 / 0 | 3367.2 |
| reference-backlog-1 | 16.9 / 324.3 / 490.4 | 11 / 120 | 136 / 155 | 119 / 0 | 2842.3 |
| reference-backlog-2 | 15.9 / 314.5 / 466.2 | 12 / 120 | 152 / 144 | 134 / 0 | 3066.4 |
| reference-silent-1 | 16.9 / 21.9 / 78.7 | 0 / 120 | 146 / 109 | 89 / 0 | 138.3 |
| reference-silent-2 | 17 / 23.2 / 76.9 | 0 / 120 | 142 / 107 | 89 / 0 | 106.1 |

See `summary.json` for per-session pacing, dispatch proxy, copies, job overlap, requests and driver progress. The aggregate receive position initializes on first online work and includes the own stream; it is not a count of newly received peer positions. Diagnostic profiles are excluded.
