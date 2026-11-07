# Phase163 — worker ownership contract and native feasibility

2026-10-28. **A real established account owner can run in a dedicated worker** with native storage,
the original crypto/verifiers and a Window passkey/journal bridge. The final kernel passes14 native
browser cases and14 protocol cases. It preserves exact writing through Undo/Redo, interruption,
lost acknowledgments and a cold reopen by the unchanged shipping app. This is a feasibility result,
**not a production threading change or a measured repair of the Goals stalls**.

The [contract](contract.md) defines the boundary and remaining editor/compatibility work. The
original [phase162 stalls and failed controls](../../2026-10-28-goals-stalls/phase162/README.md)
remain unresolved by this kernel. Keep16ms input,2.5s peer/all-marker and30s delivery gates; none is
earned here. General qualification remains paused, including the935/389 aggregate obligations.

## What actually ran

- Source `8d6d42c1c723f3dff7c7822b2358a813dc8c16e6`, runtime-equivalent to released b6f0160a;
  all440 recorded runtime/source identities and all86 original frontend files remain unchanged.
- Copied fictional H **first-device** account/profile and a fresh copied native service state for
  each case. Real IndexedDB/localStorage/Web Locks; actual virtual-authenticator assertions verified
  by the existing account owner. Wrong-code and altered-signature cases require real refusal.
  No production account, browser profile, factor or credential is included in this packet.
- Dedicated-worker `openOwnedReceivingAccountWorkspace`, its actual admitted text/Undo path and
 16 repeated native receive-status loads. Automatic sync/maintenance and warm audit scheduling are
  off in the manual kernel. Source-equivalent Docker development service,1CPU/1GiB/no swap,
  loopback-only gateway. This is not a final-image or active peer-sync benchmark.
- Node24.18.0, installed headless desktop Chrome, no CPU throttle, Playwright1.62.0. Independent
  ordinary textarea input completes while the worker performs its repeated loads. It is a
  functional concurrency check, not a Goals latency or phone-return measurement.
- Only `/worker-lab/` receives experimental isolation headers. Its synchronous storage mailbox
  blocks only the worker; every storage operation reaches fresh actual Window localStorage.
  Shared memory is not selected as a product requirement. Production headers are unchanged.

The build declares every adaptation: module-local activity ports; one liveness check at the
existing effect gate; a numeric raw-key cleanup observer; two account/joined mode literals changed
to shared; and a lock-manager port that performs a real nonqueued native shared join. No repository
runtime or old test changes. The laboratory coordination changes are substantial enough that this
kernel **must not be enabled as an editor adapter**. Independent review reconstructs the precise
transformed bytes from the unchanged sources.

## Final checks and what they establish

| Native case | Required result |
| --- | --- |
| Established owner, append, flush, Undo/Redo, original frontend reopen | Exact original archive; actual Window sealed-journal write precedes append reply; exact final archive after fresh normal opening. |
| Genuine passkey assertion with one signature bit altered; wrong local factor | Refusal, no usable owner, permit release; valid fresh authentication still opens the original writing. |
| Close while passkey initialization is held | No late ready, new command refused, native permit drained. |
| Cancel before Window journal write | No accepted reply; original writing on recovery. |
| Cancel after sealed journal write / forcibly kill worker before reply | Uncertain acknowledgment; recovery contains exactly one edit. Forced termination earns no graceful-erasure credit. |
| Native journal quota refusal | No accepted reply; original writing on reopen. |
| Retirement notification; actual page navigation | Old incarnation cannot continue; native permit released; fresh incarnation/passkey reopens exact writing. |
| Duplicate open; second supervisor canceled while queued | No leaked reservation; original owner remains usable and exact. |
| Deliberately orphaned real worker | New supervisor waits at the exclusive existing-name barrier until that worker exits. |
| Older exclusive owner queues between endpoint lease and worker join | Shared join refuses without queueing or stealing; cleanup lets the older owner proceed. |

The successful graceful close observes two raw journal buffers cleared to zero and both native
slot leases released. This is not proof of physical erasure of every non-extractable CryptoKey or
of a killed process's memory. The14 pure protocol cases cover closed schemas, detached/shared/
oversized payloads, sequence/owner mismatch, queue capacity, close/refusal and stale replies. These
are new diagnostic regressions with **no aggregate qualification credit**.

## Preserve the unsuccessful candidates

| Attempt | Observation / disposition |
| --- | --- |
| native-owner-01 | Initial owner-open failure after a storage lookup; preserve generic failure. |
| native-owner-02 | Diagnostic stack isolates TextDecoder refusing a SharedArrayBuffer-backed view. Copy into an ordinary buffer before decode. |
| native-owner-03 | Initial single-worker-permit proof passes; insufficient to fence a surviving queued Window callback, so not the final ownership design. |
| bounded-controls-04 |6 runner passes/3 failures. Two inner cases pass but teardown fails; abrupt loss fails its native permit-release guard. Wake blocked storage on termination. A separate stale teardown timer can stop a later server; capture its original container and cancel the timer on exit. |
| build-05 / bounded-controls-05 | Build correctly rejects an unexpected extra transform. The outer shell continued against stale assets; interrupt, retain exit130, and invalidate the entire run. Subsequent launchers require closed matching inputs/assets and stop on build failure. |
| bounded-controls-06 | All9 refuse. Generic shared Local sessions correctly reject Account markers; actual private account sessions are exclusive. Preserve refusal; never weaken compatibility to make the prototype pass. |
| bounded-controls-07 |9 pass after explicit reservation/barrier/cohort adaptation. Not a production lock change. |
| bounded-controls-08 |13 pass including native orphan, duplicate/queued supervisor and real navigation controls. Mixed older-exclusive ordering is still untested at this point. |
| join-before-09 | The bounded diagnostic itself passes by observing a **rejected candidate**: pending exclusive→shared requests behind the Window lease, with no opening reply until cancellation. This is the deadlock counterexample, not successful ownership. |
| final-controls-10 |14 native cases pass after nonqueued join repair;14 protocol cases pass. No repeated performance baseline or speedup estimate. |

The final original-frontend reopen is important: it checks the real persisted profile without
reinjection, rather than making a new reader agree with its own serializer. Source/attempt identities,
driver versions, receipts and original results/logs are retained. All65 known disposable containers
are removed; the preview on8443 is untouched.

## Evidence and reproduction

- [Identities](identities.json): initial source catalog, exact final build/asset/transformation map,
  fictional archive hashes, retained source versions and final reproduction paths.
- [Final browser log](reports/final-controls-10/console.log.gz),
  [positive native result](reports/final-controls-10/result.json.gz),
  [launch/input receipt](reports/final-controls-10/receipt.json.gz),
  [message-protocol log](reports/channel-tests-final.log.gz),
  [owned-container cleanup](cleanup.json).
- [Mixed-owner before](reports/join-before-09/old-exclusive-interleaving/result.json.gz) and
  [after](reports/final-controls-10/old-exclusive-interleaving/result.json.gz).
- [Independent review](review.py) checks observed archive bytes, journal/reply ordering, native
  interleaving, permit/cleanup results, refusal/recovery controls, exact source transformations and
  packet identities. Its deliberately corrupted evidence controls must refuse missing guards,
  a too-early acknowledgment and altered writing. [Result](review.json).
- [Reproduction instructions](reproduction.md); source is retained as `.txt` to keep this lab out
  of the production test census. Early version snapshots are retrospective preservation, not a
  claim that every early failed run had a pre-execution immutable receipt. Final launch hashes
  the actual driver inputs and checks the complete successful build asset identity.

The independent audit first refused an overbroad time slice (later Undo/Redo writes were compared
with the earlier append reply), then two inaccurate acquisition-count assumptions. The corrected
audit uses actual open→append call boundaries and named account/joined factories; it preserves
exactly-one-write/time-order and untouched-exclusive-owner assertions. [Audit failures](reports/review-failures.log)
and [ordinary checks](ordinary-checks.json) remain visible. Repository formatting rules exclude
these documentation targets; no formatter pass is claimed.

## Remaining boundary

First extract explicit runtime environment/lifetime ports with unchanged page execution. Then
integrate worker ownership with the admitted Window mirror/journal and production-compatible
cohort fencing. Require actual Goals paragraph, native IME/Undo/crash, competing old-owner and peer
gates before claiming improvement. Joined-device UI, mobile suspension, full network catch-up,
authority/generation transitions and large-archive delta messaging are not established here.
Download/verification/display decoupling remains a separate subsequent slice. No signing, push,
preview update, activation, release preparation or deployment.
