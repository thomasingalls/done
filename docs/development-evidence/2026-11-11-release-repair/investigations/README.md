# Investigation reports from the release repair

Sixteen reports written by delegated agents on 2026-11-11 and 2026-11-12, while the release-repair
slice was in progress. The operator asked for them to be kept because they will save time later.
Each is filed as it was delivered, with a short note at the top saying what happened next.

Read them with three cautions:

- Most are from reading the code. Each report says which of its claims were run and which were
  read or inferred; a timing in a report read from code is an estimate.
- Some were later corrected. Where that happened, the note at the top says so and names the report
  that corrects it.
- Line numbers are from the commit named in each note and have moved since.

What was built from them is in the phase records beside this folder. What was held back is in the
[product backlog](../../../product-backlog.md), under "Held from the release repair".

## The incident, first passes

| Report | Question | Outcome |
|---|---|---|
| [01](./01-start-up-initial.md) | Why is start-up slow? | Pointed at the tightened index rule; phase 538 |
| [02](./02-sign-in-lock-out.md) | Why could the desktop not sign in during the phone's maintenance? | Unexplained |
| [03](./03-sync-initial.md) | Why does sync take twenty minutes and not finish? | Phases 538 to 541 |
| [04](./04-reduction-start-and-cancel.md) | What starts and cancels local reduction? | Phases 539 and 540 |
| [05](./05-reduction-size-limit.md) | Which size limit stopped the desktop's reduction? | Phases 541 and 542 |

## Performance

| Report | Question | Outcome |
|---|---|---|
| [06](./06-start-up-double-verification.md) | Does start-up need to verify saved history twice? | No; four replays today. Fix queued behind a measurement |
| [07](./07-foreground-invalidation.md) | What does returning to the app cost, and what does it protect? | One part built in phase 545; two options held |
| [08](./08-foreground-replay-probe.md) | Does a reduced device rebuild its document per saved batch? | Yes, measured; fixed in phase 545 |
| [09](./09-send-path.md) | What does one sent position cost, and did the release change it? | First fixes queued |
| [10](./10-reduction-slicing.md) | Why does a first reduction cost the square of history? | Slice-budget change queued |
| [11](./11-reduction-handoff-collision.md) | Can a receive collide with reduction's final step? | Yes, rarely; fixed in phase 546 |
| [12](./12-service-concurrency.md) | Is the service starved by running on one thread? | No; a global cache wipe is the problem. Scoping approved |
| [16](./16-slow-catch-up-and-stalled-save.md) | Why did a reduced device take 150 s to catch up, and why did a 20 KB card never save? | Two defects, both reproduced; fixes queued |

## History snapshots and pruning

| Report | Question | Outcome |
|---|---|---|
| [13](./13-automatic-history-pruning.md) | What stands between the switched-off automatic history and shipping it? | Staged plan; phases 546 and 547 fix what it found in today's flow |
| [14](./14-behind-devices-and-refusal-messages.md) | What happens to a device behind a prune, and what do service refusals show? | First part superseded by 15; the refusal inventory stands |
| [15](./15-behind-device-test-matrix.md) | The same, with tests built to trip the failure | A lost phone recovers; the reduced-peer strand is real |

## Supporting files

[support](./support/) holds the specs, probes, test-only seams and run output behind reports 13 to
16, each stored with a `.txt` suffix so nothing treats it as a test or a source. They ran in
scratch copies with hooks that do not exist in the repository; HIST-TEST-HOOKS in the product
backlog describes what adding them properly would take.
