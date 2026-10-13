# Non-deleting Account baseline owner — 2026-10-13

The carrier/compatibility phase is committed signed as **`13b265a3`** (`G`). This phase connects its
first-anchor installer and cold reader to real original and joined Account owners, behind
**`VITE_ACCOUNT_BASELINE_INSTALL=1`**. This work is committed signed as **`bb9c7e82`** (`G`). No automatic installation or UI
control is added, no personal account is converted, and no history is deleted. Publication and general
release validation remain paused.

This is an integration experiment, not the history-growth optimization yet. An anchored owner
continues to supply the intact, fully verified history to its live consumers. The durable baseline
and suffix are independently replayed and compared with that history on opening and subsequent full
loads. Any disagreement or failure of a persisted anchor refuses the operation; there is no fallback
that ignores the anchor. Timing on the busy host is not performance evidence.

## Installer and journal boundary

The private composed workspace exposes `installLocalBaseline()` only with the switch enabled.
The call joins the existing ordered admission queue as an owned operation. Earlier inputs finish;
later inputs remain pending until installation settles. It uses an empty promotion to settle that
queue job without applying an update, replacing the canonical Yjs document, changing its revision,
or rebuilding its UndoManager.

While holding that admission fence, the operation:

1. Flushes the scoped journal on the existing serialized storage tail. This preserves the usual
   exact cleanup rules; a journal entry that could not be removed still prevents installation.
2. Captures the real owner activity/lifecycle token and requires an empty scoped journal. The
   exclusive Account Web Lock remains held throughout all native/crypto settlement.
3. Reads/authenticates the entire physical census. Prepares the bounded candidate from verified
   protocol/content state, then independently compares baseline-plus-suffix with the full replay,
   including source selection and continuation positions. A new ineligible cut returns `skipped`.
4. Uses the committed carrier primitive: complete fresh authority checks, exact all-store comparisons,
   durable reservation before encryption, and an atomic pointer/chunk commit. Journal emptiness and
   activity/lifetime are checked synchronously at each transaction boundary.
5. Retires its old warm view, reloads the committed representation, authenticates/replays it, then
   releases the queue. New input still goes through synchronous encrypted journal custody before
   application. The operation itself never deletes a content, heads, or outbound row.

A completed anchor is detected and reverified on retry, returning `already-installed` without another
reservation or chunk write. A failure after reservation burns the range in v2, as before; a new attempt
must build from the new census. A renderer death after the final native commit is recovered by the
ordinary private Account opening path. Closing while crypto is outstanding cancels authority immediately
but keeps exclusion until settlement; no late anchor may publish.

Expected new-candidate ineligibility and journal/activity interruption can be skipped. Corruption or an
authority failure follows the existing blocked-admission behavior; its FIFO ticket remains pending until
retry/close. A failure while validating an **existing** anchor is never downgraded to candidate ineligibility.

## Storage and cold-reader adaptation

`localBaselineMetadata.ts` is an internal allocation adapter. Legacy semantic reducers receive the
existing v2 allocation shape, but its MAC is always checked in the **v3 domain**, including the immutable
baseline pointer. Every later reservation and spool-witness write persists v3 and that pointer. No
ordinary `parseCounter` behavior is loosened, no old MAC authenticates a new pointer, and no persisted
counter is downgraded. Pointer replacement/downgrade during one ownership lifetime is refused.

The owner reads exact metadata keys with a bounded request; chunk values are loaded only by the bounded
carrier reader. Ordinary history records may not occupy the chunk allocation range. It authenticates
the pointer and encrypted payload, matches its counter with the complete census, verifies baseline
protocol/content continuation, compares it with full history, then repeats fresh authority. Decoded
snapshots and transient candidate/plaintext buffers are erased when the operation ends.

The integration reaches:

- Original Account cold classification, its scoped Local-origin census, and the live receiving owner.
- Joined Account cold verification and its live owner, using joined custody identities separately from
  the account writing identities.
- The independently authenticated native history source used by checkpoint/membership preparation.
  This reader required its own adapter; merely teaching the editor about v3 was insufficient.

The preliminary census only recognizes the closed inventory. Authentication and full replay remain the
owner's responsibility; census recognition cannot authorize opening or writing. Generic Local and
ordinary Account readers still refuse v3. The switch is required to reopen a disposable anchored
profile; turning it off is not a rollback procedure.

For this experiment, anchored stores **disable the warm-load fast path and content compaction**. Compaction
returns `retained` after verification and deletes nothing. Full row verification and comparison remain
available throughout the phase. Ordinary unanchored owners retain their existing warm/compaction paths.
Scoped caller copies and selection leases remain as before; the private pointer is copied on input/output.

## Focused evidence

[Logs, commands and source hashes](./development-evidence/2026-10-13-local-baseline-owner/README.md)
record the result. The tests use disposable generated content and credentials, never the real accounts.

- Original-owner native tests cover installation with unchanged history bytes; later v3 reservations,
  submission and acceptance; undo/redo across installation; post-anchor compaction retaining everything;
  and cold opening with later writing intact.
- Held-crypto input proves the queue fence: the later input is not displayed early, its journal write
  occurs before application, and its undo still works after installation.
- Retained journal cleanup, custody mutation during candidate preparation, close/cancellation, and a
  lost reply after committed installation exercise actual owner boundaries. Damaged chunks, counter
  MAC, and old history each refuse cold opening.
- The packaged original/joined journey installs both anchors, syncs later writing in both directions,
  creates/verifies checkpoint 1, continues the original owner across invitation/cancellation epochs 4/5,
  and cold-opens both owners. Full reference comparison remains enabled.
- Focused unit checks cover the carrier and allocation adapter, replay, warm-content regressions,
  startup/genesis, compaction, storage compatibility and session settlement. An ordinary-build native
  check confirms no installer is exposed and input still works.

Initial harness corrections are recorded in the evidence note. A concurrent unit run hit the existing
five-second multi-chunk test timeout; a serial rerun is used for correctness evidence. No threshold was
relaxed and no latency claim is inferred. Renderer death is not proof of power-loss durability.

## Remaining boundaries and next slice

The subsequent [non-deleting lifecycle phase](./account-local-baseline-lifecycle.md) extends the rotation,
replacement and detached/handoff readers described below. These were the boundary at this checkpoint.

Only a first, current-generation anchor with `history: complete` is supported. The 4 MiB encoded
baseline and pending-source bounds remain. Whole-profile rollback still has no external monotonic
witness. This phase does not make generation rotation, replacement of an installed anchor, reduced
history export/salvage/clear, or deployment/rollback of anchored production profiles supported.

Next: define and implement the baseline-preserving generation/replacement lifecycle and adapt its
remaining full-history readers, still without deletion. Then settle old network-flight/checkpoint
proof retention and the restored-journal/database pairing rule before building an exact atomic deletion
transition. Reader-before-writer rollout and compatible application rollback remain explicit publication
requirements. These integration tests do not authorize deletion or public activation.
