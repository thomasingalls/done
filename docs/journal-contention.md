# Journal snapshot contention — bounded repair

The core reproduction checkpoint is committed as `a292103`. This repair addresses its journal-read
contention finding only. Pending Yjs forks, delivery-order behavior and migration remain subsequent work.

`createJournalOwner.readSnapshot` permits **three total capture attempts**, counting the existing synchronous
invocation capture in `flushJournal` and `loadRecovery`. Only `JournalError('journal-changed')` qualifies.
After the first failed capture the owner yields with a 0 ms timer; after the second it yields with an 8 ms
timer. Those delays are scheduling requests, not a wall-clock deadline: background throttling and suspended
renderers can delay callbacks. The attempt count bounds work; session cancellation removes the pending
timer and prevents another attempt. Every retry runs under the same live writer task and permit.

The successful fast path still captures synchronously when the API is invoked. If that capture changes,
the replacement snapshot may include later peer entries. The queue keeps later local input behind the
durability barrier while acquisition is pending. No failed capture reaches content reservation, sealing,
publication or cleanup. Once capture succeeds, the existing content operation executes once. Its failure
is not retried by this helper. Journal-first recovery ordering and exact identity/value-matched cleanup
are unchanged; decoded snapshots are erased on success, failure and close.

The third changed capture produces **`journal-busy`**. Admission then blocks with that specific pressure
code and retains unaccepted input for explicit Retry/discard. It neither calls this corruption nor starts
an indefinite background loop. Ordinary open reports `{kind: 'busy', reason: 'journal-read-contention'}`
when initialization or recovery exhausts the budget; cancellation still takes precedence. No startup
disposition grants creation, deletion or migration authority.

Unreadable storage, malformed frames, failed authentication and missing openers fail immediately. A
captured immutable value that is observed being replaced now latches `repair-required`; disappearance
can be a conforming cleanup and remains retryable churn. A replacement observed before the first capture
still needs the existing authentication/event checks: these observations do not exclude hostile unlocked
code or nonparticipating old writers. The maintenance compactor's synchronous journal preflight is not
wrapped in an operation retry, since that would risk repeating later mutation work.

## Verification contract

The native `scripts/journal-contention/run.mjs` suite uses actual factor custody, IndexedDB, localStorage,
Web Locks, crypto, the journal owner and workspace admission. It freezes and hashes source inputs. The
named cases require transient peer append/cleanup races to complete without human Retry; subsequent queued
input must promote in order. Sustained churn must stop after three captures, preserve every journal entry,
perform no content seals and recover through an explicit later retry. Startup must distinguish busy from
unavailable/repair. Close and initialization cancellation must remove an outstanding native timer, prevent
late reads/seals, clear key caches and release the permit. Extending only that timer makes cancellation
deterministic; CDP pausing controls the cross-tab capture boundary without replacing storage results.

Generated histories vary zero through six peer appends and flush versus recovery. They check capture
budgets, exact content-seal accounting, no-op payload recovery and retained entries. Generated churn uses
a reentrant peer append at enumeration, so it supplies a controlled interleaving rather than a frequency
estimate for normal typing. The finite input alphabet also has a 100-run unit property. Unit lifetime
doubles do not establish native exclusion; the browser cancellation/permit checks own that evidence.

Focused mutations remove retry, enlarge its budget, retry a real storage failure or seal before capture.
Each must fail its specified assertion on a separate frozen copy. Unexpected exceptions/timeouts never
count as detections. JSON reports retain inputs and the first generated failing history. The native
campaign stops at that failure without shrinking; its simple read-budget alphabet is also covered by the
shrinking unit property. The existing journal regression's disappearing-entry case now first commits both
payloads, then simulates delayed cleanup, and requires complete recovery after the new internal retry.

```sh
node scripts/journal-contention/run.mjs --runs 100 --output test-results/journal-contention/new-run
node scripts/journal-contention/run.mjs --mutant skip-retry --output test-results/journal-contention/new-mutant
node_modules/.bin/vitest run test/journalSnapshot.test.ts
```

Use a fresh output directory and set `CHROMIUM_PATH` if needed. `--case` selects one named browser case;
the other mutant IDs are `exceed-budget`, `retry-storage-failure` and `seal-before-capture`.
`storage:contention` joins the project check chain. This is one Chromium/macOS execution surface, not a
supported-platform or input-latency acceptance result. The earlier simultaneous-typing campaign did not
reproduce routine contention; this repair does not strengthen that frequency claim.
