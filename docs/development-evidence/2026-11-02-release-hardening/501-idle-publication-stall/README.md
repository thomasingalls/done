# Phase 501 — idle-send stall captured after 582 positions

The original 30-second position assertion fails at expected 2,637, observed 2,636 after 582 new confirmations. The whole setup lasts 451.182 s, inside its original 1,800 s case. The first offline reduction completes in 42.856 s. Two 256-position boundaries complete in 16.354 and 17.347 s, preserving whole writing, service tuples and persisted new baselines. No 3,072 fixture is produced.

Unlike phase 495, this attempt preserves the failed browser state and bounded trace. The workspace is active/durable, with no pending items or pressure. The send lane is idle, failures zero and no next attempt. Receive remains healthy and completes subsequent reads. No negative channel frame, unhandled error, non-200 response or unresolved HTTP request is observed. The strict observer on a private stopped-service copy confirms 582 new contiguous accepted positions and no extra acceptance. No refusal or owner closure is established.

The Window archive has 583 extra characters, including the edit whose position assertion failed. That does not yet prove the edit is untransmitted. The fixture assumes one edit always requires exactly one new position, while coordinated envelope preparation may include multiple sources. A canonical receiving device will discriminate: does fully caught-up writing include all 583 characters, or only the 582-confirmation candidate? Do not label the empty send queue a lost wake until source coverage is known.

Run one normal reader using the original witness profile and an independent copy of this stopped service state. Wait for the actual canonical committed aggregate, then compare the full archive with both precise candidates and require every unrelated byte unchanged. This is a diagnostic of the same known setup failure, not a new performance experiment, 3,072 result or gate pass. If neither candidate matches, or there is a refusal/closure, stop. Keep every previous failure and all original assertions/deadlines.

The offline fixture repair remains apparatus-only; online gates stay unchanged. No app source, security check, format, limit, deadline, commit, push or deployment change.
