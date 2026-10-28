# Phase124 — local maintenance progress and restart observability

Parent123. No computer use. Presentation/diagnostics only: fixed stage names, bounded record
counts, relative elapsed time and lifetime-local attempt/interruption/completion counters.
No writing, IDs, keys, plaintext, ciphertext, or durable progress format. No schedule, quiet,
retry, authority, eligibility or deletion-proof change. Reporting never authorizes an effect.

Report real boundaries: durability, native inventory, opened records, original verification,
candidate construction/coverage, final current-state check, installation and readback. Never
claim a whole-operation percentage from a subphase's count. Observers cannot mutate snapshots,
throw into storage work, keep updating after an attempt ends, or publish across owner closure.
Coalesce repeated record updates; publish stage changes and a completed count immediately.

Keep all existing no-report status behavior, exact refusal handling and one-flight guards.
UI distinguishes an interrupted attempt from active checking, preserves existing failure copy,
and keeps the indicator in the sidebar. Native evidence must exercise the real automatic owner,
not a fake removal callback. No physical-phone speed or cross-lock resumption claim.
