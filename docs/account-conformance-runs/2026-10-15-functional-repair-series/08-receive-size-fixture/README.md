# Phase 08: distinguish envelope bytes from HTTP framing

Parent overlay `18d4d16c1005184571c043ab86659f73bcfd25b7`, signed base `a6fa2298cf3233893e3cbb9809190da6a8dc72bc`. No commits, publication or qualification.

The original 600 KiB wire becomes more than the 1,057,280-byte HTTP page ceiling after hex framing. Its old inbound-size expectation therefore stops at the earlier response-too-large guard. The red reproduction preserves that exact mismatch.

The decoded-wire case now uses 512 KiB of document input: its full signed envelope exceeds the 512 KiB envelope cap, while its independently signed/framed page fits the HTTP ceiling. Explicit independent byte-length assertions establish the intended boundary. The original 600 KiB payload remains as a separate wire-http case and must exceed the HTTP ceiling. The count fixture must fit the envelope byte bound, distinguishing count refusal from byte refusal; declared and streamed HTTP failures remain. All five cases preserve zero receive progress and Local writing, refuse automatic retry, require explicit retry and preserve accepted writing on cold reopen. Production bounds, code, signatures and deadlines are unchanged.

**Results:** the complete receive-driver native file passes all ten cases, no skips. All 59 Account fixture/wrapper planning cases pass after exact population updates: 686→687 Node cases, 698→699 including twelve delivery cases, receive-driver native 9→10 and wrapper 36→37. Every old case, assertion, six child commands, inherited process ownership, file-output requirement and deadline remains. Only the changed population-array block is reformatted; the inherited deferred regex layout is untouched. Initial stale census failures, the intermediate missed aggregate count, and the reviewed formatter candidate diff are retained.

Planning remains 851 obligations / 310 unresolved. No aggregate campaign, pinned Node 24 CI or whole-suite/real-provider readiness is claimed. Logs and source pins are retained; no profiles, service keys or user data are copied. Small planning checks overlapped native work, so durations are not performance measurements.
