# Phase 18 — Explicit full-unit-suite file worker budget

Parent overlay: `079f6b1d0f0b6604493b87cf98a4b5fad8b260bb`. Vite's test configuration changes only its maximum independent file workers to two. Runtime source, cases, test deadlines and explicit concurrency exercised inside cases are unchanged.

Earlier retained default-worker Node 26 runs timed out. Fresh default runs now pass on both Node 24 (after phase 17's separate cleanup correction) and Node 26, so a deterministic current default failure is **not** claimed. The fresh Node 26 default probe briefly overlapped the focused nine-case cleanup check; it is a pass, not a controlled performance baseline. The two-file cap is an explicit reproducible resource policy, not evidence that all possible machine-load timeouts are eliminated. It makes the local gate slower on this host; timings are functional-run observations, not a benchmark.

The complete default command with the new configured budget passes sequentially on pinned Node 24.18.0 and local Node 26.11.1: **151 files, 1,779 passes and the same single named skip** on each. Independent comparison of complete JSON reports confirms all 1,780 case identities and statuses exactly equal the phase-17 full default-policy result. No CLI file filter or maxWorkers override is used for these final runs. Lint/format/inventory pass; original failures remain in the earlier receiver/full-suite packets.

Planning remains 855 obligations / 314 unresolved and qualification paused. No release/deployment or hosted-Linux-CI pass is claimed. No signing, commits, publication or preview changes.
