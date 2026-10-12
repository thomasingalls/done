# Received-history opening: prospective protocol

Recorded before changing the runtime from signed d1e5e5ea. Release validation stays paused.

Decision: replace repeated whole-workspace coverage checks only if a conservative positive proof agrees with the independent fork/apply/full-state reference, including pending data. No receipt or stored-format change. The audit remains independent.

Primary observation: click-to-second-editor-frame on the same synthetic 120-card deep-received fixture (600+ receipts, SHA-256 426a1199ecc320e6df8caa77264efc9ae08255a88f39db1a1c89cd65632be868), offline after packaged-app warmup. Run three unprofiled cold browser contexts per condition, then one CPU profile. Record native crypto counts, post-GC heap, complete Markdown archive digest and first-edit cold replay. Synthetic credentials and database remain outside Git.

Hypothesis: proving already-integrated structs, resolvable dependencies and already-deleted intervals costs work proportional to update size rather than workspace size per receipt. Pending or uncertain cases must use the old proof. Clocks alone are insufficient: an already-known ID can carry a missing dependency. Predicted gain on this fixture: at least 25% versus the matched baseline; 2.5 seconds is a product budget, not a promised outcome. Full verification still includes receipt signatures and ownership boundaries.

Secondary change if the profile supports it: avoid allocating re-encoded receipt bytes during decoding, preserving every current field/extent/size check. Compare malformed inputs to the old decoder contract.

Correctness controls: independent generated mixed-type / deletion / out-of-order / GC histories, missing origins/parents, pending deletes and structs, malformed updates, byte immutability, no negative cache. Account cold reopening must export the same complete archive, accept an edit and reopen with it. Focused unit/native tests only. A failing correctness control blocks adoption regardless of speed.

Interpretation: within-machine repeated benchmark, not a population estimate or phone result. Alternate a final baseline confirmation after the candidate to expose machine drift. Keep profiled runs separate. Investigate if an unprofiled baseline confirmation differs over 15% from initial median or memory rises over 15%. Report ranges, not significance. No background browser campaigns in this session.
