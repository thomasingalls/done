# Initial conversion preparation outside admission — prospective protocol

Base: signed `75a3e94b`. General release validation and public activation remain paused.

First profile the repaired first conversion at 1,201 accepted own positions, using the previous
packet's genuine admission/publication fixture and native Chromium CPU profiler. Record total
conversion time, foreground long tasks, 10 ms timer gaps and complete crypto/work counts. Map
remaining synchronous work before choosing any additional CPU repair. These observations locate
work; one profile is not a stable speed estimate. Host contention remains a limitation.

Then prepare the authenticated exact deletion plan outside the input FIFO, on the serialized
storage owner. Input must remain journal-before-apply and invalidate preparation. No stale plan may
reserve a nonce, install an era or delete a row. Final queue entry must check lifetime, activity,
complete fresh authority, unsettled attempts, journal and exact inventory; mutation/readback stay
fenced. Preserve the live document and UndoManager. No format, authority or deletion rule is relaxed.

Controls: input during preparation (prompt admission, skipped conversion, no mutation), authority
and inventory changes between preparation and final entry, closed owner, journal arrival, and
existing atomic abort/crash/retry/readback controls. Test successful final exchange with queued input
and undo/redo separately from interrupted preparation. Retain full post-commit verification.

Measure successful conversion and input interruption separately. Compare unchanged native work for
successful cuts; measure CPU-1x and one diagnostic CPU-4x deep cut and intervention. A bounded
improvement must let input interrupt preparation without waiting for the full conversion; it need
not make the final atomic transaction or full readback instantaneous. Report remaining fenced time
and long tasks explicitly. Do not infer a release gate or phone performance from this fixture.

## Profile-driven amendment before comparison

The frozen `75a3e94b` diagnostic completed: 5.737 s, longest task 448 ms, with two
large synchronous censuses. Inclusive samples attribute 781 ms to inbound inspection and 758 ms
to its nested delivery inspection (overlap); inventory cloning contributes 183 ms self, largely
inside strict exchange checks. The repair extends the existing generator census through delivery,
spool and source records, and uses synchronous borrowed-byte comparisons without deep copies.
All synchronous callers drain the same generator; only the baseline full replay and existing
cooperative caller yield. No parsing, classification, authority or exact comparison is omitted.

Run three alternating quiet reference/candidate pairs from one closed synthetic state. Add one
profiled candidate CPU-4x quiet cut and three interrupted observations (reference CPU-1x, candidate
CPU-1x/4x). The input timer is 50 ms; separately the native control holds actual baseline-signing
crypto to prove input can pass during preparation. Record exact final FIFO duration using numeric
profiling-only metrics. Interrupted cuts are expected to skip, not to delete after the edit.
