# Custody nonvisual state observer — phase357

**The complete account:local-custody command passes.** Its native stage passes15 baseline cases (all13 original cases plus2 observer regressions), and all5 original source mutations fail their exact discriminating assertions. Full units, vectors, typecheck, scoped lint and the original format stage also pass. [All attempts, identities and checks](./evidence.json).

## What failed and what is proved

Phase355 records the two mutation timeouts on both clean signed89b11fe2 and the candidate, with13 normal scenarios passing. The failure-only observation then captured a timed-out control whose producer had already rejected, performed the forbidden encryptions and released all locks. The underlying operation had settled; the observer missed it. A later unrepaired full run with additional timestamps passed all five controls. Keep that inconvenient pass: a green after-run alone cannot prove the repair, and the exact cause of every earlier intermittent timeout is not established.

The installed Playwright1.62 waitForFunction implementation uses animation frames by default and tests a predicate's immediate truthiness. An asynchronous predicate returns a truthy Promise before its resolved false value; the old fixture used asynchronous native-lock queries too. State, cryptography and native ownership conditions should not depend on painting, nor accept a false asynchronous result.

The fixture now uses a Node timer-backed waiter that awaits each page evaluation and retries false results. The existing8000ms deadline is a single shared constant used by both the page and the waiter; a watchdog bounds the entire wait, including an outstanding predicate. Every exit clears its polling/deadline timers, and late results cannot schedule another observation. Predicate errors remain errors. Production code, authority, crypto, storage and guards are unchanged.

## Independent regressions and faults

The new frame case installs its override before Playwright captures builtins, holds real key generation until the waiters sampled pending state, then releases it. A direct old frame wait cannot observe the completed state; the repaired waiter can, and actual creation reaches protected custody. The first draft replaced the page function too late and failed its delivery precondition (no intercepted frame request). Preserve that failed draft as an undelivered harness fault, not an unexpected successful negative control.

The new async case holds real key generation until the subject predicate has actually returned false. Independent timer observations establish both that precondition and the native operation's later completion. The repaired waiter returns true only after completion. This covers asynchronous native-lock waits as well as synchronous state checks.

Two faults were declared before execution. Restoring default-frame waiting makes the frame case fail exactly timer-observes-custody-completion-without-frames, while native creation still completes. Restoring numeric Playwright waiting without awaiting the predicate makes the async case fail exactly async-state-wait-rechecks-false-result. Neither is accepted merely because a process timed out; both named assertions fail, and the good helper's exact hash is restored after each fault. These are harness sensitivity checks, not extra custody-security mutation credit.

All60 original custody assertions retain identical parsed arguments; all5 mutation records and all13 old case definitions/order are unchanged. Only the two new case IDs are added to the independent adapter census. All5 adapter tests pass. The broader catalogue quote formatting stays byte-identical to HEAD after removing the two new entries; the operator's broader formatting deferral remains. Formatting of new/changed blocks and scoped lint pass; no old case or deadline was removed or relaxed. The inventory remains676test files,670required,6excluded, with existing qualification blocks.

Failure-only snapshots and native-lock observations stay in the test harness for future diagnosis. Temporary normal-path timing probes do not land; their source snapshots and runs remain here. These fixture modules are not app entry points. Run directories named356 predate the separately approved formatting checkpoint; original names/results are preserved.

Append the outcome before advancing progress. Recovery whole-command rerun, checkpoint, local provenance and final receipt/trace checks remain before Stage2. No application changes after Stage1, no format/trust/budget/default changes, no publication or deployment.
