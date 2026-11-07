# Phase 485 — final index fixture stops on a Worker request failure

Do not continue app runs. The plain hardened native owner fails a Worker request
while growing the fictional 2,048-position fixture toward 3,072. It confirms 76
additional positions, 2,055 through 2,130, then the acceptance-status poll fails:

`WorkerChannelError: Worker operation could not finish.`

The failing call is `compositionStatus().sync.send.acceptedThrough`, grow.spec.ts
line 42. The wrapper exits 1 after 139.286 s, without hitting its deadline. The
native request failed; the exact error code was not captured. Existing logs do
not establish owner closure, writing loss, an integrity failure or the responsible
guard. Do not classify this as apparatus solely because the copied fixture result
contains `apparatusOnly: true`; that label describes fixture preparation's purpose.

A read-only SQL check after service shutdown finds 77 more accepted delivery
rows, with maximum position 2,131, rather than the 76 whose status the test had
confirmed. These are stored service fields, not a new cryptographic acceptance
proof. No claim that pending writing was lost or that the next profile opens.
Do not reopen, mutate or retry the failed state before deciding the next phase.

The recipe is inverse-byte exact to phase 464 except its title, input fixture,
2,048 backlog precondition and 3,072 output metadata. The same 1,024 individually
accepted edits, per-position 30 s check, 30-minute setup ceiling, archive checks,
Goals size and unchanged old-reader snapshots remain. All 125 plain ordinary
assets and native delegate are the existing 470/473 bytes. The new 484 index
observer build was not used. No source, guard, limit, gate or deadline changed.

Preserve the failed profile, state, result, service logs, browser error context
and five-second external host/windowed power records behind the local manifest.
No favorable rerun. The six exact-counter consumer controls pass, but the prepared
486 reader spec has not run and earns no credit. The complete 3072 fixture was
not produced. Nine of ten report-only journeys remain complete; the previous
36/36 blocking passes stay recorded, but this new functional stop prevents closing
Stage 5 / the Stage 6 landing report. No commit, push, publication or deployment.
