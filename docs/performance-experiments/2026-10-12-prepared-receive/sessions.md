# Matched sessions

Unprofiled runs only; each row is a fresh restored session. Quantiles are median / p95 / max.

| Session | Frame ms | Keys >100 ms | Long tasks / max ms | Local queue wait ms |
|---|---:|---:|---:|---:|
| candidate-active-1 | 23.4 / 85.4 / 109.3 | 3/120 | 27 / 145 | 316.3 |
| candidate-active-2 | 23.2 / 60.2 / 142.6 | 2/120 | 29 / 124 | 240.5 |
| candidate-backlog-1 | 23.5 / 101.9 / 120.2 | 6/120 | 23 / 135 | 516.9 |
| candidate-backlog-2 | 22.5 / 98.3 / 125.9 | 5/120 | 21 / 148 | 611.0 |
| candidate-silent-1 | 23.3 / 33 / 84.8 | 0/120 | 21 / 76 | 53.9 |
| candidate-silent-2 | 21.8 / 27.6 / 63.4 | 0/120 | 20 / 68 | 38.7 |
| reference-active-1 | 22.9 / 179.1 / 370.8 | 9/120 | 73 / 183 | 1381.9 |
| reference-active-2 | 22.6 / 147.3 / 255.7 | 7/120 | 72 / 179 | 1018.1 |
| reference-backlog-1 | 22.3 / 165.3 / 242.5 | 10/120 | 30 / 191 | 1197.1 |
| reference-backlog-2 | 23.1 / 133.1 / 181.4 | 7/120 | 31 / 210 | 686.3 |
| reference-silent-1 | 22.6 / 31.5 / 111.2 | 1/120 | 63 / 96 | 128.8 |
| reference-silent-2 | 22.6 / 28.2 / 51.9 | 0/120 | 60 / 98 | 31.5 |

All sessions collect 120 frame samples and preserve exact local text, last-key undo/redo, peer
writing, complete export convergence and cold offline replay. All typing HTTP responses are 200.
No final comparison session was dropped or replaced. The interrupted earlier pilot is excluded.

## Work and interpretation

| Session | Remote final/whole jobs | Remote elapsed ms / max | Receive aggregate at typing end | Sender accepted at typing end |
|---|---:|---:|---:|---:|
| candidate-active-1 | 7 | 412.2 / 74.5 | 623 | 8 |
| candidate-active-2 | 7 | 347.8 / 70.4 | 623 | 8 |
| candidate-backlog-1 | 14 | 818.4 / 87.5 | 66 | 7 |
| candidate-backlog-2 | 14 | 767.5 / 92.7 | 67 | 8 |
| candidate-silent-1 | 0 | 0 / 0 | 617 | 10 |
| candidate-silent-2 | 0 | 0 / 0 | 617 | 10 |
| reference-active-1 | 7 | 1841.4 / 307.2 | 623 | 8 |
| reference-active-2 | 7 | 1900.3 / 309.5 | 623 | 8 |
| reference-backlog-1 | 16 | 2964.1 / 225.2 | 75 | 8 |
| reference-backlog-2 | 16 | 2964.2 / 224.2 | 74 | 7 |
| reference-silent-1 | 0 | 0 / 0 | 617 | 10 |
| reference-silent-2 | 0 | 0 / 0 | 617 | 10 |

The candidate remote job measures **final apply plus its authority recheck**, whereas reference
remote jobs include verification and persistence. These elapsed spans are not CPU costs.
Preparation and other storage work continue outside this span; no claim is made that they disappeared.
Receive totals include initial and own-stream progress; they are not counts of new peer positions.
The first backlog candidate completes 14 final receive jobs versus 16 reference jobs; compare
responsiveness together with work progress and eventual convergence, not as a fixed-work speedup.

Observed median key gaps and full request/work counts are in `summary.json`. CDP waits for browser
delivery and can miss pre-handler blocking; physical-device latency remains unmeasured here.
