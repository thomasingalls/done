# Focused verification

No generalized campaign or release gate ran.

## New recovery boundaries

`node --test --test-concurrency=1 test/account-cold-recovery/native.test.mjs`: **9 pass**, no failed attempts. Uses real IndexedDB, journal, custody crypto, lifecycle permits and the actual recovery helper over disposable Account fixtures. See `logs/boundary.log`.

- Opt-in unchanged snapshot: one semantic validation; unchanged default: two. Two separate opted-in calls each validate once.
- Delete a row or authentically re-encrypt substituted bytes between initialization and load: second validation runs and refuses the changed semantic snapshot.
- Change ciphertext or counter MAC between reads: fresh authentication refuses before delivering recovery.
- Authenticated counter-only reservation change with unchanged rows: second validation receives the new counter.
- Journal append after the initial content validation: recovery sees the new entry while content validation is reused.
- Throw during validation or abort before its late completion: no callback delivery, exposed plaintext buffers are erased, and a subsequent recovery independently validates.
- Change the actual identity condition from exact identity to any earlier success: the helper delivers a missing-row snapshot. This is an effective control of this boundary, not a claim that every higher-level Account check would also accept it.

## Existing native integration checks

**8 pass** in `logs/native.log`, using:

```sh
ACCOUNT_LEDGER_MODE=incremental ACCOUNT_BATCH_MODE=coordinated-2000 \
ACCOUNT_REPORT_DIR=<existing directory> \
node --test --test-concurrency=1 \
  --test-name-pattern='cold replay refuses missing|pending remote deletion|one owner advances|lost reply and unavailable|hidden-page batch close|abort during a pending passkey' \
  test/account-receive/native.test.mjs test/account-receive-editor/native.test.mjs \
  test/account-sync/native.test.mjs test/account-editing/native.test.mjs
```

Covers missing/changed content, ledger event and ciphertext; pending Yjs structs/deletions through compaction/open; journal death; submit-receipt advancement; exact lost-reply retry; and pending-passkey cancellation. Existing native coverage/completeness controls remain effective. The stale older ledger-order mutation from the first packet was not rerun or credited here.

## Browser and build checks

- **22 primary matched opens**, **12 supplemental frame opens**, all pass with first locally accepted edits. No failed measured browser attempt. Samples and protocols remain separated.
- Separately profiled deep open preserves a new offline edit through lock/reopen (`logs/candidate-profile.log`).
- Ordinary build: online deep-history and offline joined-device edit/reopen pass; both application profiling globals are absent (`logs/ordinary-deep.log`, `logs/ordinary-receiver.log`). These are functional checks, not extra matched samples.
- TypeScript, targeted oxfmt/oxlint, patched Yjs, ordinary Vite build, initial bundle budget and built-origin scan pass. Scratch origin scan warns about absent Git metadata while successfully scanning built files. Exact application source hashes match both candidate and ordinary archives.
- Each recovery call disposes its existing content-owner cache. New tests observe erasure of buffers exposed to validation/recovery; internal cache cleanup also relies on the existing `createContentOwner.dispose → clearView → eraseVerified` path, which was not replaced.

No full suite, phone run, production deployment, membership-policy change or validation-campaign resumption occurred.
