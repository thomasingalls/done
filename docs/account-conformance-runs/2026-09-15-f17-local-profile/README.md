# Private Local candidate: remaining browser cost

The unchanged owned browser diagnostic passes once on the private Local handoff variant above
signed `0c84e5cc`. Four cases pass, without skips/retries, retaining 1,440 timing samples and four
CPU profiles. Full-corpus and exact added-card text checks pass through cold reopen. The
208.584-second stage drains its worker/browser/server groups. Original workspace identity is
unchanged during execution; the isolated variant adds only the explicit Local handoff argument.

Diagnostic card p95 is 14.6/13.7 ms desktop and 80.5/68.7 ms CPU-4x Android across the two blocks.
The second bare-CodeMirror block has a higher tail in both projects. These observations do not
replace the application gate, which remains failed at its earlier candidate 12.9/63.5 ms observation.

Separate 60-key profiles identify full history copying (345.2/1,558.4 ms desktop/Android), including
document copying (170.3/770.1) and stack copying (172.4/778.8); complete comparison uses
190.2/804.8 ms and publication/listeners 61.4/489.9 ms. Nested totals overlap. Callback self time
does not isolate native metadata cloning. All sampled time, including native/unmapped and GC,
is retained. Raw frames and full maps independently reproduce 2,168 mappings; 79 application
source files match the activated candidate.

Next specify and test private immutable selection-snapshot ownership before implementing reuse.
Keep generic metadata forks fully detached, safe capture/restore/lifetime behavior, full document
verification and durable admission. Both earlier metadata copiers remain rejected. This diagnosis
does not establish a speedup, default activation or release qualification.

The operator cancels remaining phone/manual work. The fixture server, five owned USB forwards
and dedicated ADB server are closed. Preserve emulation as reference; use roughly 1.5× card latency
for planning (C 87.0/63.5 = 1.37; R 108.1/69.4 = 1.56), without treating separate runs as calibrated
hardware equivalence. The frozen phone packet remains unchanged.

[Protocol, results and next contract](../../f17-local-profile.md); [compact results](./summary.json).
`artifacts.json.gz` contains content-addressed UTF-8 payloads for cases (including all raw profiles,
mapped nodes and timing samples), measurements, receipts/logs, the prospective protocol, exact
activation, analysis/scripts, source/preservation pins and phone closure. Full maps and full
source/dependency/browser inventories stay local, bound by [raw hashes](./raw-artifacts.json).
This is a diagnostic packet, not the remaining immutable release/rebuild qualification.

Run `python3 docs/account-conformance-runs/2026-09-15-f17-local-profile/verify.py --raw` while local
large artifacts exist; omit `--raw` for the retained evidence checks. The verifier recomputes
quantiles and sampled-ancestor totals, checks source activation and preserves all 52 personal/vector
pins, three previous phase packets, append-only record prefixes and the other seat's progress.
Inventory/manifest checks pass: 616 obligations, 159 unresolved (96 command / 63 campaign).
Those counts describe integration, not passed release tests. No product source or budget changes.
