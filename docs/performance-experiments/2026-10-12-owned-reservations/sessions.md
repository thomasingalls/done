# Individual unprofiled sessions

All times in ms; MB uses 10^6 bytes. Elapsed waits overlap and are not CPU totals.

| Session | Frame median / p95 / max | Long tasks / max | Full-load MB | Record-copy MB | Local wait total / max | >100 ms keys | B receive-status / sent delta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| candidate-active-1 | 17.4 / 403.2 / 600 | 134 / 154 | 0.0 | 115.2 | 3923.3 / 530 | 11/120 | 11 / 4 |
| candidate-active-2 | 17.5 / 408.3 / 660.9 | 132 / 143 | 0.0 | 115.2 | 3705.2 / 591.1 | 10/120 | 11 / 4 |
| candidate-backlog-1 | 17.3 / 334.2 / 497.4 | 140 / 172 | 0.0 | 24.5 | 3048.5 / 434.6 | 12/120 | 28 / 5 |
| candidate-backlog-2 | 17.2 / 366.5 / 716.1 | 133 / 182 | 0.0 | 24.6 | 3811.0 / 640.7 | 12/120 | 28 / 5 |
| candidate-silent-1 | 17 / 21.5 / 46.9 | 145 / 108 | 0.0 | 204.9 | 33.1 / 29.7 | 0/120 | 8 / 8 |
| candidate-silent-2 | 18 / 24.2 / 76 | 138 / 114 | 0.0 | 194.0 | 113.2 / 54.7 | 0/120 | 7 / 7 |
| reference-active-1 | 17.9 / 504.7 / 747.3 | 139 / 161 | 82.6 | 154.4 | 4701.7 / 670.9 | 11/120 | 8 / 4 |
| reference-active-2 | 20.4 / 523.4 / 772.2 | 131 / 213 | 79.0 | 147.4 | 4673.5 / 702.8 | 10/120 | 7 / 3 |
| reference-backlog-1 | 17.4 / 399 / 605.5 | 132 / 163 | 20.8 | 38.4 | 4495.5 / 521.9 | 14/120 | 28 / 5 |
| reference-backlog-2 | 17.7 / 351.6 / 516.2 | 136 / 146 | 20.8 | 38.4 | 3246.6 / 454.6 | 11/120 | 28 / 5 |
| reference-silent-1 | 17.3 / 21 / 69.3 | 143 / 140 | 122.0 | 247.8 | 145.7 / 47.9 | 0/120 | 6 / 6 |
| reference-silent-2 | 20.9 / 26.8 / 42.7 | 133 / 165 | 114.8 | 229.7 | 3.6 / 0.8 | 0/120 | 6 / 6 |

Received-through is the driver’s aggregate progress indicator, including own accepted progress; it is not exclusively a peer-publisher cursor. All four backlog sessions show 0→28 on that indicator and 0→5 accepted outbound during typing. The receive driver starts at zero before its first online refresh, so this is not a count of newly received peer positions. The backlog remains pending throughout typing. Complete exported writing converges afterward.

| Session | Input-handler median / p95 / max | Event timestamp→handler median / p95 / max | Observed key gaps median / p95 / max |
| --- | --- | --- | --- |
| candidate-active-1 | 5.8 / 7.5 / 24.7 | 0.5 / 1.8 / 9.8 | 174.4 / 237.0 / 316.2 |
| candidate-active-2 | 5.7 / 7.7 / 27.2 | 0.5 / 5.1 / 73.3 | 177.8 / 240.8 / 279.9 |
| candidate-backlog-1 | 5.5 / 7.7 / 22.6 | 0.6 / 4.4 / 7 | 171.8 / 231.8 / 293.0 |
| candidate-backlog-2 | 5.3 / 8.5 / 29.9 | 0.5 / 5.8 / 7.8 | 170.3 / 230.8 / 242.7 |
| candidate-silent-1 | 5.6 / 7.6 / 25.8 | 0.4 / 2 / 5.4 | 182.1 / 230 / 236.6 |
| candidate-silent-2 | 6.2 / 8.1 / 25.2 | 0.5 / 1.4 / 70.1 | 175.1 / 234.4 / 240.5 |
| reference-active-1 | 5.6 / 7.6 / 27.6 | 0.5 / 2.1 / 59.1 | 177.7 / 279.2 / 311.3 |
| reference-active-2 | 6.3 / 10.6 / 26 | 0.5 / 5.3 / 144.7 | 182.4 / 268.9 / 392.1 |
| reference-backlog-1 | 5.5 / 7.6 / 25.6 | 0.6 / 4.9 / 19.1 | 177.7 / 234.1 / 313.8 |
| reference-backlog-2 | 5.5 / 7.2 / 24.5 | 0.5 / 5.6 / 20.8 | 179.2 / 237.8 / 302.8 |
| reference-silent-1 | 5.9 / 7.6 / 26.6 | 0.5 / 2.1 / 123.1 | 171.1 / 245.0 / 294.7 |
| reference-silent-2 | 7.3 / 9.8 / 24.2 | 0.5 / 2.2 / 159.1 | 179.1 / 291.4 / 408.3 |
