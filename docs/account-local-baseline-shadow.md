# Local Account baseline shadow integration — 2026-10-13

The [format/replay phase](./account-local-baseline-replay.md) is committed **signed `c50e3741`**.
This next slice connects that experiment to the real exclusive Account storage owner. It remains
**read-only shadow work**: no baseline is persisted, no history or journal entry is deleted by the
experiment, and no baseline result enters the live editor, outbound driver or receive verifier.
The existing reader remains authoritative. General release validation remains paused.

## Entry and lifetime

Build with `VITE_ACCOUNT_BASELINE_SHADOW=1` to expose `checkLocalBaseline()` on the internal composed
syncing workspace handle. The ordinary application does not expose that method. There is no UI,
timer, automatic audit trigger or default activation. The replay implementation loads on the first
explicit call. A small codec/authentication helper is available to the private carrier; the stored
record parser does not recognize a baseline record.

The shadow object retains one plaintext candidate and its independently held expected anchor only
in the unlocked owner lifetime. It returns fixed result kinds/reasons and byte/row counts, never
writing, keys, identities, MACs, baseline bytes or live ledger objects. Subsequent calls compare
baseline plus the current suffix with a fresh full reference. The candidate is erased on a failed
or invalidated comparison, authority invalidation, resume or disposal. Closing/reopening begins
again from the full store; no rollback or durable-anchor guarantee is implied.

## Establishing a real cut

1. Enter the same storage queue as ordinary flush, receive, submission and authority work, under
   the existing exclusive Web Lock. The predecessor task and its native transactions must finish
   before the shadow task starts. Network flights do not hold this queue and acquire no shadow
   authority; any eventual durable result still has to enter the queue.
2. Require a synchronously authenticated **empty scoped journal**, then perform the complete fresh
   custody inventory check. The check has the existing unchanged-bytes authentication reuse, not a
   cached permission to skip reading custody. A retained journal, including failed cleanup after a
   successful content commit, skips the experiment. The experiment never flushes or clears it.
3. Read counter and every physical row/key in one readonly IndexedDB transaction. Authenticate the
   counter, placement, generation, sealed records and ordinary Account payloads. This always takes
   a complete disk census, even when the live owner has a warm view. Reuse of unchanged decrypted
   bytes still requires an exact comparison with those freshly read sealed bytes.
4. Supply detached rows, counter, identity, held authority/key context and task-bound metadata
   authentication to the pure builder/reader. The signer accepts only the bounded, closed draft
   baseline authentication domain; it cannot sign arbitrary counter/witness payloads. Its callback
   scope expires when the census consumer returns. Temporary census and replay buffers are erased.
5. Compare a fresh full reference with baseline plus suffix: exact encoded Yjs state, own/peer
   frontiers, checkpoint state, acceptance/refusal state, invocation accounting, surviving positions,
   submissions/responses, next position and next selectable source indexes. Historical maps that
   the baseline intentionally replaces are not required to remain byte-for-byte present.
6. Repeat the complete fresh custody inventory check, check the journal again synchronously, and
   publish only if the owner/task and captured input/lifecycle token still match. There is no await
   between the final eligibility check and retaining the candidate/report.

Synchronous local admission remains available while preparation awaits I/O/crypto. A journal append,
route suspension/installation, hide/freeze/resume or page lifecycle change invalidates the in-flight
cut. The next guarded operation abandons it. Input is already journalled before application under
the existing rule; the shadow path never applies a document or swaps an undo stack. The token is not
updated per keystroke in ordinary builds with the experiment off.

This experiment does not make full replay inexpensive or move it to a worker. A call occupies the
storage queue; synchronous replay work can also delay the main thread. Input invalidation is a
correctness boundary, not proof of a latency budget. There is deliberately no automatic cadence.

## Results and failures

- `matched / created` or `matched / continued`: the captured full history and draft agree on the
  checked state and next operations. The result is diagnostic, not installation/deletion authority.
- `skipped / activity-or-journal`: no eligible quiet cut; normal editing and journal recovery retain
  their existing behavior. A later explicit call can try again.
- `skipped / ineligible`, `history-required` or `scope`: the draft cannot represent this cut/context.
  In particular, a new authority, checkpoint installation or old in-flight receipt still needs full
  history. A later call may construct a fresh candidate under the then-current authority.
- `refused / draft-replay` or `comparison-mismatch`: erase the candidate, return a fixed diagnostic
  and continue using the existing reader. No raw error text or content is put in this report.

Actual carrier authentication/transaction failures and the final fresh custody check are outside
the draft-error handler. They propagate through the owner's existing refusal/closure behavior.
Cancellation invalidates immediately but does not release the Web Lock before owned native/crypto
work settles. The shadow result cannot reinstall after cancellation.

## Finding and evidence

The first native run found that the draft codec assumed every identity field was hexadecimal.
The actual custody contract permits named slot IDs. The codec now uses the existing bounded custody
identity parser for slot/principal/workspace, retaining hexadecimal rules for store/root IDs.
The draft is not stored anywhere, so this correction needs no migration or reader rollout.

[Focused evidence](./development-evidence/2026-10-13-local-baseline-shadow/README.md) includes 89
Vitest tests, six opted-in Chromium cases and an ordinary-build check that the method is absent.
The native cases exercise the real journal, encrypted
IndexedDB, Web Lock, metadata key and original-device Account owner: unchanged disk/journal across
shadow calls, offline and accepted network suffixes, live input/undo, failed journal cleanup, resume,
cold reopening, final custody changes, held native flush completion and close with pending crypto.
Fake-IDB cases separately prove fresh all-store reads, immediate old-row/metadata refusal, abort,
caller isolation, scoped authentication and callback expiry.

The previous pure fixtures still cover certified peers, checkpoint cuts and completed historical
key retries. This phase does **not** add a native joined-device/rotation/checkpoint-install journey,
an automatic runner, a generalized fault matrix or a performance campaign. Test/build durations
are not comparative performance evidence on the busy host. Nothing was run against personal writing.

## Next boundary

Complete retention-aware authority/checkpoint transitions and old-read/outstanding-operation
consumers, including native joined-device evidence. An intact-history fallback is acceptable for
shadow comparison but cannot be the only answer after deletion. Then settle durable encrypted
anchoring/chunking and reader/writer compatibility fences before building an atomic installer.
Actual removal, exact journal/restore handling and preservation of a live undo stack across an
installer remain later work. This phase authorizes none of those effects.
