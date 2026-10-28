# Phase130 — owned resumable preparation and automatic continuation

Application preparation now reads authenticated native checkpoints and uses the first-reference
receipts. A voluntary pause authenticates its delta while the read task is still live, erases its
journal, and returns a one-use handoff. After read settlement a fresh serialized owner repeats
readiness/authority/context/prefix/delta checks before allocator reservation, encryption, atomic
save and exact readback. Disposal retires queued handoffs. Original content and the final strict
cut, independent candidate and authenticated readback remain intact. Success removes stale cache.

A saved slice yields the event loop and the local policy continues without polling or ordinary
refusal backoff changes. The new native automatic regression exposed a real integration defect:
its own durability barrier published admission status, resetting the ten-second editing quiet
clock. Two60s timeouts are retained. Diagnostics showed five saved checkpoints and a sixth attempt,
without failed authority/storage checks. Status now refreshes readiness; accepted writing and input
still reset quiet. The same deadline passes:23 attempts complete, including22 saved checkpoints,
with real journal/crypto/allocator/strict native operations. Only growth and new-work thresholds are
lowered in that synthetic automatic fixture; production's10s quiet/2s target are unchanged.

Full Vitest:187 files,2176 pass/1 existing skip.32 focused policy/owner/progress cases pass after the
repair. Distinct native coverage:21 pre-existing strict removal/lifecycle cases (conditional authority
case separately run in its explicit mode),4 encrypted crash/abort/reopen cases,2 composed account
cases. Together27 pass across modes. The composed manual check saves progress without changing
logical rows, destroys/reopens the renderer, admits new writing, completes the real reduction,
checks undo and cold-reopens again. The owner unit also observes an actual cached row-opening hit.
Types, changed-source lint/format and diagnostic build pass. Build/isolation and ordinary bookkeeping
are checked separately; this is no release artifact or general qualification.

New resume opt-in defaults off:requires `VITE_ACCOUNT_RETENTION_RESUME=1`, all reader/writer gates,
production/noHMR and exact generated verifier-source identity. Service automation stays off.
The2.5s peer p95 gate remains unchanged and unqualified for heavy preparation versus live editing.
No timing gate was lowered, no final validation skipped, no phone claim made.2s bounds new unchecked
work only; native capture/hash/encryption/replay overhead and one nonpreemptible operation remain.
General qualification stays blocked at930 obligations/384 unresolved; every previous obligation and
security assertion remains. No signing, push, computer use, preview update or release work.

Ordinary-check pass exposed two bookkeeping refusals: an entrypoint named the nested private
method rather than exported createContentOwner (corrected); and the read-only inventory runner
sizes raw JSON before reading its smaller canonical formatted snapshot, whereas --record sizes
that snapshot. Preserve the failed checks and repair the representation mismatch separately in131;
the700kB budget is retained. Phase130 does not claim an all-ordinary-check pass.
