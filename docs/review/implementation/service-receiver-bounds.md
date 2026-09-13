# R-01 — current admission bounds and terminal size diagnostics

This bounded repair starts at signed `4bb0904`. The intake's independent sender produced a
614,698-byte envelope from 614,400 update bytes: the service accepted and served it, then the real
receiver refused it with `InboundError.reason = size`. The 16 KiB control fit. The original probe is
preserved in the R intake, and before/after runs belong to this phase's evidence.

## Contract and compatibility

| Boundary | Current behavior |
| --- | --- |
| New sender position and each seal invocation | Preflight at most 255 original updates, 512 KiB decoded update bytes and 512 KiB complete wire, including all framing and the 16-byte GCM tag. Known size failure consumes neither position nor invocation. |
| New envelope seal | Same profile before cryptography, using the exact captured body and header. No change to key schedule, AAD, signature or serialization. |
| New service decision | After authenticating the sender and resolving earlier decisions, enforce the actual wire length before issuing an acceptance or refusal. Oversize creates no ledger/witness change and returns unsigned `envelope-size`. |
| Historical sealed wire without submission | Refuse before persisting a new submission. Retain the source, sealed wire and allocation evidence. |
| Historical persisted submission | Permit exact retry: it may already have been accepted. A new-service size hint stops automatic retries without closing or replacing that position. |
| Historical accepted ledger | Keep broad v1/v2 codec readback, full witness verification, pagination and exact accepted/refused retries. Never tighten the decoder used by the service census. |
| Receiver and scheduler | Keep the 512 KiB wire/decoded and 255-update caps, plus the whole 4 MiB/256-record transaction cap. Report `inbound-size` or HTTP `response-too-large`; retain the durable cursor and stop automatic retry. |

The 32-source/64 KiB batching target is separate. A fitting single original larger than 64 KiB still
works. Preflight does not split, truncate or silently discard an original update. Exact-limit wires
are allowed; a plaintext of 512 KiB generally does not fit because framing/tag bytes also count.
The broader 4 MiB/256-update structural codec remains a historical reader, not the new sender policy.

All diagnostic reasons are closed vocabulary in a 32-entry, memory-only ring. No raw exception text,
writing, tokens or identifiers are added. A size hint has no protocol authority: manual retry can
recheck state, but cannot grant a replacement position, acceptance, key or counter. Local writing
remains retained. Service and client upgrades must travel together to get the new unsigned hint;
an older service does not enforce this current admission profile.

## Nonconforming members and recovery

The content-blind service cannot validate encrypted counts, actor claims, decryption or Yjs semantics.
An independently signed, correctly encrypted 256-update envelope can be under 2 KiB, pass the service,
and fail this receiver's 255-update bound. A retained service-to-real-receiver regression demonstrates
this residual, with a successful 255-update control. Arbitrary malformed ciphertext can cause the
same availability problem even with one update. Adding a cleartext claimed count would not prove its
truth. This patch closes the conforming-client mismatch and service-visible size admission gap; it
**does not establish progress against a malicious authenticated member**.

Trust policy for the current private creating-member workflow: the admitted member is trusted to
produce conforming, decryptable updates. The receiver still distrusts each proposed update for
safety and fails closed. General multi-member release needs an explicit malicious-member recovery
contract under membership/revocation and F-09; this private disposition is not that recovery feature.

An already accepted oversized, undecryptable or semantically invalid position cannot safely be
skipped or overwritten. Later accepted links depend on it, and local recovery may depend on its
updates. Preserve Local, the exact service ledger and recovery material. A future compatible receiver
may consume a merely oversized valid entry after a reviewed capacity/transaction change. Otherwise
recovery needs an authenticated new baseline/lineage or an explicit restore into a fresh workspace,
with a stated content-loss boundary. Neither automatic supersession nor Account restore is implemented
here. No real Account admission exists in the personal installation, so this phase performs no
personal migration or cleanup.

## Review and validation scope

A fresh read-only investigator traced the shared codec/census and pre-allocation boundaries. One
fresh read-only candidate reviewer confirmed the encrypted-count residual and found the historical
pending-wire retry gap. The latter is included in the repair; the former has the explicit trust and
recovery disposition above, plus an executable service-to-receiver counterexample.

Tests cover generated exact wire edges and varying header lengths, 255/256 counts, independent service
submission (including generation-refusal successors), historical maximal ledger pagination/retries,
unsealed restart preflight, browser receive halts, and composed sender singleton/pending states.
The sender omission control removes the actual pre-allocation check and must expose a persisted
unsealed position; simply observing an exception is insufficient. The 255-update native transaction
control still exercises all 256 records through quota abort, retry and cold recovery.

Early test attempts and fixture failures are retained. The initial 80 KiB UI-paste test exceeded its
90-second deadline; a second blocked-state assumption was also wrong. The final fixture seeds one
actual Yjs original through the owned capture carrier, so it tests the intended singleton boundary.
These results do not establish large-paste responsiveness; that remains in F-19 capacity validation.
The native historical bundle retains the current module exports while using the old sealer policy and
the pinned old allocation/submission owners. The service compatibility fixture uses the actual signed
pre-repair decision implementation against disposable SQLite, followed by current-code readback.

General runner integration, R-03/N-06 property deadlines, R-04 whole-tree style scope, P-06 crypto prose
and an immutable release aggregate remain separate. Historical review/intake/vector/evidence bytes,
formal debts, L-2 and personal packages/state are preserved.

## Result — 2026-09-13

The bounded repair passes: 124 focused unit tests, 38 service/transport tests, 16 inventory/manifest
tests and twelve selected native cases (four receive-size cases, five sender cases including the
allocation omission control, the 256-record transaction case, and two current regressions). The unit
set includes 32 generated wire-boundary profiles and the unchanged 120 source/burn histories; the
transport set includes 200 signed mutation histories. Typecheck, scoped lint/format, unchanged envelope
and transport vectors, and the live construction registry pass. The production census still has 165
sources/89 labels: ten source files changed and seven construction-site coordinates moved, with exact
equality of domains and site paths after removing line numbers.

[Retained evidence](../../account-conformance-runs/2026-09-13-r01-bounds/README.md) distinguishes final
checks from failed or preliminary fixture runs. The corrected native historical cases take about
107 and 131 seconds; their per-test deadline is 240 seconds. The existing Account sync native stage
now has a finite 600-second budget for the expanded set. The wrapper/full release aggregate has not
been rerun or qualified here. The manifest remains 607 obligations / 416 unresolved; no coverage credit
was invented for this repair. All 21 pinned personal/package files, 31 prior vector files and L-2
match their preservation hashes. The root `done ` item remains untouched.

R-01's conforming-client mismatch, service-visible size gate, pending-state diagnostics and explicit
trust/recovery disposition are complete within this scope. General validation-runner integration
(R-03/N-06 and R-04), then P-06 and the selected immutable aggregate, is next. General malicious-member
recovery and large-paste/workload capacity remain open. This phase is not yet committed.
