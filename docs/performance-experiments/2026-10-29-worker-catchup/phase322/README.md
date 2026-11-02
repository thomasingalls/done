# Phase 322 — baseline serialization evidence; cold-stop triggered

**Evidence only. No optimization build, hardening, acceptance credit or release work.** Application source/builds and fictional browser profiles stay in the private lab; this patch contains evidence and documentation only. All earlier phases and failures remain unchanged.

## Stop and coverage

Seven replacement journeys reached drain. The six unprofiled journeys pass native receive, Undo and exact cold reopening. The first profiled 0 ms diagnostic passes drain and Undo, then its original cold opening fails with `NotAllowedError` from WebAuthn. The runner stops immediately (child exit 3); the diagnostic itself exits 1. This is a cold-flow failure, not an observed database-content mismatch. Root cause is unresolved. A second DevTools session was used for profiling and detached before cold; the virtual authenticator was installed by the original test session. That ordering is a candidate harness interaction, **not a proven explanation**. No repair, retry, further timed cell or treatment build follows the stop.

The profiled 50 ms diagnostic is not reached. The operator-added 75 ms block, batched/concurrent/both comparison, (a)/(b) screen, live-writing metrics and timing ablations are **not reached**. `prepare75.py` is an unexecuted draft, not a run declaration or result. The current baseline source has observation-only instrumentation; no candidate optimization is implemented. All gates, deadlines, budgets, signature/authority/ledger/witness/commit checks and default-off policies remain unchanged.

Eight earlier attempts failed before the browser because Docker was unavailable. They remain failed in the original block. The operator restarted Docker; a separately named replacement block was declared. Nothing is overwritten or promoted by rerunning. An apparatus setup EOF lookup failure, the completed observation build and a slow analysis implementation terminated and replaced by an equivalent sweep implementation are retained too.

## Pre-build contract reading

See [contract reading](./CONTRACT-READ.md). Rotation and final maintenance commit retain the real page FIFO journal fence across native commit and context rebind. Undo needs original frames applied to the current document/Undo state, with the original native finish capability and current-authority checks; Yjs commutativity does not establish signed-chain acceptance. Ordinary Worker receive already commits and reads back before page preparation. A proposed direct handoff must also avoid holding the native storage tail while a preceding page-local flush waits on it. No such handoff was built.

Interrupted maintenance loses the unsaved slice because its scoped observation/task has been invalidated. The bounded saved-delta path checkpoints while the task is still live, then saves under fresh checks. Previously saved slices survive and are authenticated/matched on resume. Queue priority is a yield rather than an authority fence, so an earlier checkpoint could be designed for pure-priority interruption; saving arbitrary work after a throw is not safe. No guard/retry/capacity behavior changed.

The existing `receivePrefetch.ts` matches commit `460fefd8` exactly (SHA-256 `bb89aa9ae1ad800d52ad896279ad9a95d8fb02269702f18865dd0c461e4b0499`). It already provides two concurrent individual reads and ordered prefix collection. Normal multi-read aggregation bypasses that path. Future combined experiments must start from it. The operator-supplied old 600-position, 75 ms comparison is not a matched comparison to this 1,025-position G8/P1 fixture.

## Every reached drain

|Run|Added RTT|Profile|Drain s|Positions at 30 s|30 s predicate|Cold|Page↔Worker messages|Charged bytes|Budget refusals|
|---|---:|---|---:|---:|---|---|---:|---:|---:|
|baseline-retry-01-rtt0|0 ms|no|23.098|1025|pass|exact|6360|1591129|0|
|baseline-retry-02-rtt50|50 ms|no|49.441|640|FAIL|exact|7824|1934457|0|
|baseline-retry-03-rtt50|50 ms|no|52.993|608|FAIL|exact|7982|1972346|0|
|baseline-retry-04-rtt0|0 ms|no|24.369|1025|pass|exact|6482|1618998|0|
|baseline-retry-05-rtt0|0 ms|no|25.300|1025|pass|exact|6560|1639674|0|
|baseline-retry-06-rtt50|50 ms|no|49.957|632|FAIL|exact|7726|1911646|0|
|baseline-retry-07-rtt0-profile|0 ms|yes|23.336|1025|pass|FAIL: passkey|6422|1605238|0|

All run-level failures stay visible; one failing replicate fails its cell. The 0 ms unprofiled cell has three passing predicates; the 50 ms cell fails 30 s in all three. The separately profiled diagnostic is not acceptance evidence, and its cold failure triggers the global stop. **Input p95 and peer p95 are not measured**: this closed-sender deep journey has one local Undo input, not a live typing/peer-latency workload. No zero or passing value is imputed.

Counters count sends once on both realms, split by method and call/reply in [page-methods.csv](./page-methods.csv). Bytes are the existing `workerMessageBytes` logical charge, not V8 serialized-wire or transfer size. Snapshots are collected at observed drain, sequentially Window then Worker; a few status/quiet exchanges can follow the exact final commit. They are observation-window totals, not reconstructed exact last-commit totals. In the profiled diagnostic there are 1,133 Window `workspaceFrames` calls, 238 `workspaceFinish` calls and 238 page-prepare replies; the Worker snapshot includes one additional preparing flight. No field values or writing are counted as independent replicates.

## What the new attribution establishes

The following partition is disjoint by precedence (prefix comparison, client validation, native receive, empty/single read, then new preparation/network/page spans). It is elapsed wall time, including awaits, **not CPU**. Inclusive raw spans are retained; they are not simply added. The old-style remainder is 13.0–14.6 s in these unprofiled 0 ms runs, rather than assuming the earlier roughly 8 s reproduces under this host and added observers.

|0 ms unprofiled run|Old-style remainder s|Preparation now attributed s|Network now attributed s|Page handoff now attributed s|Still unattributed s|
|---|---:|---:|---:|---:|---:|
|baseline-retry-01-rtt0|13.040|2.234|6.042|0.783|3.981|
|baseline-retry-04-rtt0|13.882|2.473|6.394|0.812|4.204|
|baseline-retry-05-rtt0|14.612|2.578|6.733|0.906|4.395|

This attributes about 9.1–10.2 s of the current remainder, but leaves 4.0–4.4 s unresolved. It does not retroactively identify every millisecond of phase 313. With 50 ms added response latency, network collection accounts for 26.6–27.7 s; drain is 49.4–53.0 s versus 23.1–25.3 s at 0 ms. This is strong serial-latency sensitivity in these runs, not a quantified guarantee that a proposed overlap removes it.

The only page CPU profile lasts 25.864 s, including about 2.484 s of observation/snapshot tail after drain recognition. Across the whole profile about 25.301 s is idle and **0.563 s is non-idle sampled time**, including harness/observation work. An approximate drain clip gives 0.522 s non-idle/22.858 s idle over 23.380 s. Therefore these samples do not support attributing eight seconds to page CPU. Largest identified application self sample is the Worker-channel receive handler (~39.5 ms); many native/program samples remain unattributed. Source-mapped frames and all samples are retained in [profile analysis](./page-profile-analysis.json) and the raw compressed CPU profile. This is a Window-only sample, not a Worker CPU trace or exclusive wait explanation. The clip uses the acknowledged profiler-start epoch without a before/after bracket, so whole-profile numbers are the more robust statement.

## Controls and limits

RTT injection delays each non-SSE account response write/end by the selected 50 ms, copying buffers before delay and preserving their order. This adds response-delivery latency; it is not a realistic WAN model. Static assets, hints/SSE, all limits and deadlines are unchanged. The 75 ms extension was not executed. Docker remains 1 CPU/1 GiB, and every attempted journey has the external 5 s host CPU/top-executable log. Host aggregate busy medians in completed runs are 52.3–61.8%; Docker/Chrome/Firefox/WindowServer/system work are not an isolated host. No build or heavy analysis ran during the replacement block; analysis ran after the cold stop. Between-run and historical comparisons remain host-qualified.

An independent check recomputes all seven 1,025-position crossing times, channel totals, source/build/harness identities, index state and canonical inputs. No event overflow or budget refusal is observed. All 844 old expectation-call AST nodes, 94 test-call names and 26 old wait-call nodes remain; one observation wait is added. The original config is byte-exact. These are syntax-node counts, not executed test counts. All 1,552 canonical source inputs match the starting map, signed HEAD remains `0ab9cbc8`, real index empty, no commits/merges/deployment. No old-root source/build is changed.

[Stop record](./evidence/STOP.json.gz), [independent check](./independent-check.json), [observer AST check](./observer-ast-check.json), [full drain analysis](./baseline-analysis.json), [evidence index](./evidence-index.json).

Next work remains operator-directed after this stop: establish why the profiled cold passkey failed, then resume the added 75 ms baseline and declared comparisons without treating this diagnostic as a pass. No hardening begins.

[Final source/record check](./final-check.json) confirms immutable prior record prefixes and parent lab source/assets/harness. The human-readable CSV uses LF; its original CRLF bytes are retained in the raw gzip. [Packaging failures](./packaging-notes.md) are retained separately from the runtime cold failure.
