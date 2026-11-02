# Phase 275 — same-carrier exact reuse for unreduced baselines

2026-10-30. Extend the existing private exact-evidence path in contentStore only. An opted-in
nonwarm one-shot reader or exclusive warm unreduced Account carrier may retain its completed proof
after fresh full row/chunk reads, complete authenticated counter equality, exact ciphertext equality,
verifier-owned authority identity and before/after lifetime checks. v3 completed proof need not have
a logical journal-era projection. First full physical/reference comparison is unchanged. Every new
carrier verifies independently. No cross-owner transfer, persisted trust, old task retention, format,
key/domain or API change. Reduced rolling warm/incremental continuation and its audit stay unchanged.
Validator invocation and detached caller projections remain. Direct reference/transition/retention
consumers, invalidation, failures, changed evidence or capability reconstruction force full replay.

The exact 23-case regression archived red in phase274 now passes. Four old affected suites also
pass: 70 cases total. Three isolated guard faults are detected: skipped chunk bytes, final authority
and final view/lifetime. Two failed fault-apparatus attempts (missing setup, then schema fixture) are
preserved; no success credit from those attempts. Only the disposable copy was faulted and restored.
Old tests and assertions are untouched. Types, scoped lint/format and seven repository contracts pass.
Full Vitest: 2,789 pass / one pre-existing skip in 276 files. Metadata checks: sandboxed run 143/145
passes, two process-ownership historical controls report orphaned-child. The unchanged full 38-case
stage suite passes with native process inspection outside the sandbox; original refusal logs remain.
No deadlines or process-drain assertions were weakened.

Independent metadata reconciliation retains all 1,026 prior obligations, exclusions and selections;
new required uncredited regression adds one row (1,027 total, 481 blocked). Runtime inventory remains
503 files, only contentStore source identity changes from prior cumulative state; crypto domain homes
remain exact. No campaign qualification is claimed. Current reuse contract has an appended follow-up;
historical phase122 rationale is retained.

Native cold after-check is next, with actual rebuilt production flags/default limits and original
15s cold/180s case deadlines. This phase establishes code/unit semantics, not latency or phone input.
Normal Page/Worker comparison remains held. No release preparation, commit, push, deployment,
preview or computer use. All original performance and security gates remain in force.
