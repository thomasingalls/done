# Account correctness before incremental activation

2026-10-11, based on signed `95923cd8`; full source identity in [source.json](./source.json).
This is the first bounded slice in the operator-approved order: correctness findings, request
scheduling and budget isolation, activation, then further storage optimization. Release validation
remains paused. No default switch or deployment change is included.

## Epoch equivalence

The reference verifies the exact local event boundary established by authority installation. The
incremental path only compared each new event with the last retained event's epoch. Immediately
after adoption, that last retained event can still have the old epoch. Another old-epoch event
could pass until the next reference audit or cold open.

The differential test now builds the historical prefix under its own epoch, verifies the membership
installation, and rebuilds the indexes before continuing. It appends a distinct, validly signed
old-epoch final acceptance for an existing position with a matching spool witness. The reference
rejects it at the adoption boundary. Before the repair, incremental verification accepted it:
[epoch-before.log](./epoch-before.log). A first attempted duplicate-response probe was rejected by
the existing duplicate rule; it was replaced by this distinct valid proof to discriminate the epoch
check itself.

New appended ledger events now require the installed route's exact epoch. Historical source
capsules remain available for current-key retries; authority changes and history installation still
take the full verifier. The same test continues through valid current-epoch events and compares
full and incremental state at each append. Membership and current-key retry checks pass.

## Verified-view ownership

The Account owner serializes storage tasks, including verification. The generic verified-view
helper nevertheless allowed overlapping callers to borrow predecessor buffers; one completion
could erase bytes another extension was still using. A controlled overlapping call reproduces
erased predecessor bytes in [overlap-before.log](./overlap-before.log). This is a helper-level
reproduction, not an observed concurrent production load or a claim of stored data loss.

The helper now rejects an overlapping verification before it touches retained state or runs its
callbacks. It adds no historical copies and preserves existing failure/close invalidation. A
native test holds the first real Account validation open while issuing two more readers; neither
enters validation until the first is released, and the detached results agree. The unit regression
also requires rejected overlap to leave the predecessor and successful first result intact.

## Self-read decision propagation

After an unknown submit outcome, a verified self-read proof is passed to the delivery owner.
Its `unknown` or `blocked` recording result used to be discarded. With no durable receive progress,
the scheduler then treated the attempt as a transient unknown and backed off. A native control
injecting that decline at `recordResponse` demonstrates the wrong `retrying` state:
[self-before.log](./self-before.log).

A declined local decision now returns a rejected receive result and the existing operation-failed
halt. An already-retained acceptance remains valid even when `recorded` is false. Proof bytes are
still erased on every path. Native controls cover both decline kinds: no receive advancement, no
loss of local writing, no halt reset by an online event, explicit retry recovery, and cold reopen.
Ordinary lost-submit reconciliation still passes. This does not change HTTP capacity handling,
network backoff, service budgets, or the initial enrollment repair.

## Focused results

- **39 unit tests**: verified view, incremental coverage, receive ledger/driver and sync scheduler.
- **12 Node tests**: generation replay, membership boundaries and current-key retry authority.
- **7 native tests in incremental mode with reference audit on every append**: normal receipt
  progression/compaction/reopen, lost reply, submission and response aborts, both self-decision
  declines, and concurrent reader ordering.
- **4 native tests in reference mode**: lost reply, both self-decision declines and reader ordering.
- TypeScript, targeted lint, formatting, diff checks and the reference-default packaged build pass.

Browser runs were sequential and used disposable fixture state. No performance timing claim is
made from these correctness runs. Native seams live only in the test bundle; no diagnostic globals
were added to application source. Runtime changes are preserved in [runtime.patch](./runtime.patch).

```sh
node node_modules/vitest/vitest.mjs run test/verifiedRecords.test.ts test/incrementalLedger.test.ts \
  test/accountReceiveLedger.test.ts test/accountReceiveDriver.test.ts test/accountSyncDriver.test.ts
node --test test/account-membership/generations.test.mjs test/account-membership/adoption.test.mjs \
  test/account-membership/retry.test.mjs
ACCOUNT_LEDGER_MODE=incremental ACCOUNT_LEDGER_AUDIT=every node --test \
  --test-name-pattern='self-read decision|concurrent Account readers|one owner advances|lost submit answer|native (submission|response) abort' \
  test/account-sync/native.test.mjs
ACCOUNT_LEDGER_MODE=reference node --test \
  --test-name-pattern='self-read decision|concurrent Account readers|lost submit answer' \
  test/account-sync/native.test.mjs
```

For before controls, apply the test changes to the signed base while retaining the corrected
cross-generation fixture's actual adoption boundary. The overlap and self-read controls likewise
run against the original helper and receive composition, respectively.

## Next

Request amplification and service budget sharing remain the activation blockers. Remove unnecessary
submission-triggered reads without suppressing peer or authority discovery, then measure sustained
single-device and two-device delivery. The incremental path remains opt-in. Further cold-load,
copying and accepted-prefix retention work is deferred until after that activation decision.
