# Phase129 — resumable first-reference verifier

Adds optional preparation adapters to physical opening, witness, spool, membership, delivery,
inbound/history checks and pending-aware coverage. Exact content basis plus original updates bind
coverage receipts. Semantic ordering, current completeness witness and final candidate/reference/
readback comparisons run afresh. No global crypto memoization or cached accepted ledger.

22 directed cases pass, including a real mixed own/peer/history protocol reconstructed through
fresh authenticated slices, exact uninterrupted frontier comparison (apart from fresh journal era),
fresh completeness refusal and corrupt original ciphertext. Types pass; initial test type/lint
errors retained and corrected. Adapters remain unwired in the application until the next phase.
Service automation remains off; the2.5s peer gate is unchanged and not claimed by these tests.
