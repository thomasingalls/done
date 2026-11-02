# Explicit historical replay mode — private lab repair

`verify` remains private. It derives `live` versus `stored` from the presence of the original saved-record argument or the new saved-physical-record argument. No network/RPC boolean, hint, caller-supplied prefix or parser result can set stored mode on `verifyInboundPage`/range verification. `verifyStoredInbound` remains the only route supplying those saved-byte arguments; all saved bytes are still treated as untrusted until canonical framing, exact tuple, original signatures, scope, chain, entry crypto, current owner/authority and coverage/witness checks succeed. Stored mode is not proof of authenticity.

Every former expectedRecord semantic gate was reviewed:
- Live expiry: now guarded by `mode === live`; historical request expiry is not made into an event lifetime. Current owner/authority checks still run around awaits for both modes.
- Empty page: stored mode refuses, live empty handling unchanged.
- Duplicate result: stored mode refuses, valid live duplicate behavior unchanged.
- New dense transient-record creation: only live received results can use that path; stored physical outputs retain original captured bytes.
- Legacy byte equality: `expectedRecord && exactEquality` remains a separate legacy byte-comparison check, not the discriminator for replay mode. P checks its independently reconstructed event tuple against the captured dense view and returns captured physical bytes.
- P dense branch restores the old branch's `kind === received` requirement, erasing failed result buffers and closing only the scope it owns.

All four actual caller paths are covered with genuine signed/crypto histories in new private tests: inboundLedger full/index replay, handoffHistory interior-cut replay, membershipReading post-certified-cut suffix, replacementSource accepted-cut appendStored. Both P0 and P1 exercise requests expired by31s under the test lifetime, while identical expired live frames still refuse. Legacy/dense saved receipts, empty/duplicate refusal, corruption, wrong baseline, per-entry signature/decrypt counts and exposed P0/P1 flags are retained. Native interior-cut probe waits31 real seconds before cold; no clock is changed.

Fault sensitivity: first caller draft used an aliased vi.hoisted call which did not expose P in the two copied reader files; first fault run caught direct/member/replacement but missed ledger/handoff. Retained unchanged as an inconvenient result. The new tests now use actual vi.hoisted, explicitly assert the P exposure and sign request expiry30000. Reintroducing only the old mode omission then makes five selected controls fail: direct stored replay plus all four real caller paths. Restoring the good source is hash checked. No timed fault journey occurs. Complete repaired focused run passes157 cases; strict TS first finds two unused new-test imports, attempt2 passes after import-only cleanup. No old canonical test or assertion changes.

Private source diff, controls, both fault attempts, logs and exact input hashes remain for evidence. This is not a production fix or hardening approval. Old dense format/fence/rollback/handoff contracts and capacity→owner-error mapping remain open. The stage source/assets freeze prevents further silent repair during screening.

Landing is not authorized. Harden this stored/live discriminator separately from the owned-page optimization and the still-unreleased dense format. Preserve old-tab fencing, rollback/handoff format/version contracts, scope ownership and erasure controls; exercise independent prefix/witness oracles and cancellation/mutation faults. The later grown snapshot-building owner-error and paired-writer workspace closure are unresolved findings, not grounds to relax verification or journal fencing.
