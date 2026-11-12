# done — Active slice

**This file is disposable, and that is its function.** It holds the slice of work that is active right now
and nothing else. Nothing of record value lives here: decisions go to [decisions.md](./decisions.md), and
closed work goes to [completed.md](./completed.md).

## How this file works

**Everything below the rule is replaced wholesale when the active slice changes.** Not amended, not struck
through, not archived in place — deleted and rewritten. A working document that accretes is a working
document nobody reads, and the two files that _are_ records already exist.

**One thing must happen first.** When a slice closes, write its outcome into
[completed.md](./completed.md) _before_ rewriting this file. That ordering is the only thing protecting
the record, because after the rewrite the evidence is gone.

**It grows a tree when the slice deepens.** If work goes deeper without the slice changing — an item turns
out to have four parts, one of which has three — nest it. Nesting is free and says something true about
the shape of the work. What is _not_ allowed is a second top-level slice **inside one document**: two active
slices in one document means it has stopped answering the question it exists to answer, and one of them is
really next-up.

**The file is a stream of documents, one per seat, separated by `---` as YAML separates its own.** The
original rule assumed one slice because it assumed one worker, and that assumption broke the first time two
gates ran in parallel seats — `L-1` in its worktree and `L-2` in another, neither waiting on the other,
neither with anywhere honest to say so. A seat owns its own document and edits nothing below or above the
separator, which is what keeps the wholesale-replacement rule intact per document and keeps two live sessions
out of each other's paragraphs. Each document opens with its keys, because once there is more than one the
first question is always *whose is this, and where is it running* — gate, seat, branch, status, and what
blocks it.

**One document per seat is a ceiling, not a target.** A second document is a claim that two gates genuinely
do not block each other, checkable at `action-tree.md`'s prerequisites — not a place to park work that is
really next-up. When a seat's slice closes, its outcome goes to [completed.md](./completed.md) and **its
document is deleted**, separator and all.

**A document whose seat is gone is closed at the operator's direction, from any seat.** The separator
rule assumed every seat lives long enough to close its own document. `L-2`'s did not: its work carried
on under other seats and merged, and its document stood untouched from 2026-08-29 to 2026-10-10,
naming as next a service that had already been deployed. Leaving it alone was the rule working as
written and the file failing at the one question it exists to answer. So when a seat no longer exists,
the operator may direct any seat to write that document's outcome into
[completed.md](./completed.md) and delete it. The bar is both halves — the seat is gone, and the
operator said so. A live seat's document is still nobody else's to edit.

**Status vocabulary**, deliberately small: **not started** · **in flight** · **done** · **blocked** (which
must name what it is blocked on).

**Being wrong here is cheap.** This file is allowed to lag by a day. It is not allowed to describe a slice
that is no longer active.

---

## Active slice: editing latency (`F-17`)

```yaml
gate: L-1 # F-17; the open debt names "L-1 Local editor responsiveness work" as owner
seat: /Users/thomasingalls/Code/done
branch: claude/f17-editing-latency
status: in flight # deployed behaviour measured; order of repair not yet chosen
scope: meet the typing and navigation budgets on the Local and Account paths with every admission guarantee intact
blocks_on: the operator's choice of repair order
release_validation: paused until explicit operator resumption
updated: 2026-10-10
```

**Why this is the slice.** On 2026-10-10 the operator called editing latency catastrophic for the
product and the work to do now, and put architecture changes in scope up to a wholesale
rearchitecture, provided the product guarantees survive. The public installation at
`https://done.oxidationlabs.com` serves `5501f7b9`; its rollout is closed in
[completed.md](./completed.md).

**What is measured.** The last application gate (2026-09-15, Local factory, `local-snapshots`) fails
two budgets on CPU-4x Android emulation: card typing **38.7 ms** p95 against <16 ms, and settled
`goTo` navigation **113.6 ms** against <100 ms. Desktop card typing is 9.0 ms. The debt and its
closure criterion are [f17-rc-latency-debt.json](./review/implementation/f17-rc-latency-debt.json);
the experiment history is in [performance.md](./performance.md).

**What the operator observes is worse than that, on desktop, and it is now measured.** Reported
2026-10-10 from the public installation: input latency obvious at an ordinary typing speed, the saving
indicator flickering, more pronounced with sync. A diagnostic the same day reproduces it against a
local service ([packet](./performance-experiments/2026-10-10-account-desktop-typing/README.md)). Local
typing is fine at 4.0/6.4 ms p50/p95. On the Account path key-to-paint is 16.9/82 ms on a fresh
account and 711/1,400 ms after 2,020 edits, because each edit triggers a re-validation of every stored
account record on the main thread, and keystrokes queue behind it. The cost is about 0.35 ms per key
for every prior edit, the stored rows never shrink, and stopping the service does not remove it.

**The Account path also runs the slower preparation.** Every Account constructor
(`accountWorkspace.ts`, `accountCapture.ts`, `accountSpool.ts`, `accountReceive.ts`) calls
`createAdmittedWorkspace` without a preparation mode and so gets `reference`: whole-document forks, an
undo-stack copy and complete canonical comparisons per command. Only the Local factory selects
`local-snapshots`. On the measured small workspace that synchronous work is about 3 ms p50, but its
p95 grows with undo depth to 56 ms after about 2,200 edits. No application latency gate has been run
on the Account path, and none has measured it on the September gate's seeded corpus.

**Where a keystroke goes today.** The editor intercepts input and submits a command
(`src/editor/admittedEditor.ts`). Preparation forks or replays a second workspace-history document
and runs the command there (`src/crdt/admittedWorkspace.ts`). The update is sealed and journalled
synchronously, canonical state is promoted, and the two documents are compared in full. Publication
then rebuilds a whole-workspace snapshot for React (`src/ui/workspaceUi.tsx`) and dispatches the
accepted text back into CodeMirror. The synchronous encrypted write, the one step the contract
requires inside the handler, measured 35–240 µs on a Pixel 9a (TRD §12). On the Account path the
keystroke then causes the asynchronous work the measurement found: journal flushes, envelope
preparation, delivery and the read-back of the device's own position, each re-validating the stored
ledger. [client-trace.md](./performance-experiments/2026-10-10-account-desktop-typing/client-trace.md)
has every step.

**What any design must keep** (TRD §6's journal and admission rules, SC-01/02):

- A locally originated update is sealed and journalled synchronously, before its handler returns.
- Nothing becomes authoritative without a durable carrier. A handler that meets a refusal returns
  with the document equal to recoverable state, and the input is held as pending.
- Later input cannot bypass an uncommitted predecessor.
- Pending content is absent from ordinary editor text, export, accepted undo and transport.
- Received updates are persisted before canonical promotion and never enter human undo.
- What the user is shown equals accepted canonical state.
- No update exceeds `MAX_UPDATE`; large commands slice.
- Undo is actor-scoped across text and structure, and Account source capture keeps each
  transaction's actor and bytes.

**What the three read-only studies found.** They ran beside the measurement, are retained in the same
[packet](./performance-experiments/2026-10-10-account-desktop-typing/README.md), and agree with it on
where the cost is.

- *Client trace* ([client-trace.md](./performance-experiments/2026-10-10-account-desktop-typing/client-trace.md)).
  Every storage task reloads and re-validates the whole local ledger, by its count about 30 times per
  delivered position, and nothing trims capsule, spool, delivery or inbound rows. Flushes, send-path
  flushes, received pages and compaction all occupy the head of the queue that admits keystrokes. The
  device reads its own positions back one at a time and replays them through the editor path.
- *Protocol audit* ([protocol-audit.md](./performance-experiments/2026-10-10-account-desktop-typing/protocol-audit.md)).
  The wire protocol is not the problem; the implementation departs from the TRD in four places. §7.1
  says nothing on the write path may await sync state, yet sync runs in the admission queue. The TRD
  asks for flush-interval batching, heads amortised over a run, one `(seq, link)` per credential and
  no verification on local replay; the code sends a position every 50 ms pass, keeps a head per
  position in an append-only log, and re-verifies its own envelopes. The service reads a publisher's
  whole decision ledger on every request and has one rate limit shared by all clients.
- *CRDT study* ([crdt-study.md](./performance-experiments/2026-10-10-account-desktop-typing/crdt-study.md)).
  What Yjs lacks here is a transaction model, not a merge algorithm or a format. Computing a text
  edit's update bytes before applying them removes the fork and comparison with no format change, and
  is the first piece of any engine the project might later own. A new format would have to admit
  signed Yjs-format envelopes from devices offline across the cutover.

**Next: choose the order of repair with the operator.** The measurements rank the causes: ledger
re-validation per transaction, keystrokes queued behind asynchronous work, undo-stack copying under
`reference` preparation, then constant factors (hex, a `Y.Doc` per record, byte compares). None of the
first three needs a wire-format change. Record the chosen order in [sessions.md](./sessions.md). The
editing-core changes and the recorder's floor remain open behind them: the bare-CodeMirror control has
itself recorded 15–19 ms p95 on later blocks under the current recorder.

**Next-up, not this slice.** Acceptable post-setup usability: an opt-in way to use the app without
entering credentials repeatedly. The operator named it on 2026-10-10 as the phase after performance.

**Not in this slice.** The open operations and product items listed at the previous slice's close in
[completed.md](./completed.md). Release validation, which stays paused on purpose.


---

## Active slice: release repair — full-check fallback after 2026-11-08

```yaml
gate: release repair after the 2026-11-08 rollout
seat: /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1
branch: claude/done-card-ux-patches-1e566a
status: in flight # phases 538 to 550 on this branch; none confirmed on the affected account
scope: restore usable start-up and sync for accounts the release pushed onto the full-check path
blocks_on: operator commit, merge and deployment decisions; a reading from the affected account
release_validation: paused; planning inventory 1125 / 555 unresolved
updated: 2026-11-12
```

**Active outcome.** A two-device production account became unusable after the release: many-minute waits behind "Input is waiting to be saved." and four to five minutes per sent position on a desktop that had never reduced. Phase 538 stops refusing the ledger index on retained bytes, which the operator approved on 2026-11-11. Phase 539 lets a device on the full-check path hold routine sync so reduction can run. Phase 540 lets a running reduction on any device skip routine idle receive polls. Phase 541 lets reduction continue past the resumable cache instead of parking. Phase 542 lets reduction write a baseline past the released 4 MiB ceiling, up to 8 MiB and readable to 32 MiB, in a new carrier used only above 4 MiB; the operator approved the carrier and both limits on 2026-11-11. Phase 543 makes a parked reduction say which limit or condition stopped it, with sizes where known. Phase 544 stops any device or the service from publishing, admitting or pruning past a history snapshot that devices cannot install (about 1.33 MiB of document state), says so with sizes in History maintenance, and names a receive halt caused by one. Phase 545 makes a reduced device's baseline replay build its document once instead of once per saved capsule (a forced read or cold open went from 7 + N whole-document builds to 4; in Node, 6.3 s to 1.1 s at an 8 MiB baseline with 200 capsules), and keeps a return to the app due until a full read completes, as the 2026-10-12 decision requires. Phase 546 amends phase 539's hold: a held window that ends without progress (a saved slice or a completed removal) is not repeated on the same history, and a saved account attempt (history snapshot, approval or rotation in progress) blocks the hold, parks reduction until history changes and says so; before, such a device held send and receive about 83% of every hour while the attempt existed. It also makes a busy Worker handoff slot at reduction's save or commit an interruption to retry instead of a halt. Phase 547, approved by the operator on 2026-11-11 for the manual History maintenance flow only, stops two devices that create a snapshot at once from leaving one with a snapshot it can neither send nor discard (the two-device case was a deadlock), offers Discard for every saved snapshot of this device's that no device admitted and says what discarding affects, and reports positions accepted since the last verified snapshot against the 4,096-position replay bound: a warning past 3,072, a plain statement past 4,096, and creating or verifying past it stops before any replay with both numbers. Automatic history stays off and unchanged. Phase 548, approved by the operator on 2026-11-12, stops a card or action over the 16 KiB admission update limit from blocking the device: a long compose (over 14 KiB) now saves in 1,000-unit text slices in one undo step, as a paste into a card already did, and every other command that would exceed the limit (duplicate, Done for now, merge, split, Goals copy and move, Next to Goals, Undo, Redo, formatting many lines) is refused alone with "That text is too long for one action…", leaving the queue and sync running; before, the first such action blocked the device's writing and sync until Discard or a reload. Phase 549, approved by the operator on 2026-11-12 ("Finish uninterrupted"), stops a reduced device discarding its completed background oracle replay: from the moment the replay returns until it is recorded, queued work waits instead of interrupting it, which amends phases 469, 416 and 417 for that window only. With a 300 ms round trip on the returning device, the lost-phone catch-up went from not finished after 180 s in two runs (66 of 66 oracle replays discarded) to 65.5 s and 135.5 s (an unreduced device took 90.1 s), with queued work waiting at most 92 ms behind the window; without the delay both builds caught up in about 24 s. Phase 550, approved by the operator on 2026-11-12 ("Verify the cut", then "Fold at once"), lets a reduced device install a history snapshot whose cut falls inside history it reduced, when that snapshot moves a receive cursor forward: it reads the publisher's accepted chain from the cut to its retained frontier and requires it to end at the link it kept, refuses as integrity if it does not, and names "history-unverified" when the service holds no answer. Such an installation is committed only when a reduction can follow at once, and that reduction skips the growth threshold and cooldown, so older builds can open the store again 10.2 to 10.3 s after the commit; until then, and in three residual cases (capacity first met by the fold, a device closed in the window, writing entered after the commit while sending fails), an older build shows "Worker operation could not finish." and writes nothing. Before, a device reduced past a snapshot's cut skipped it and could not catch up once the history it lacked was pruned. The branch also carries signed phases 535 to 537.

**Next.** Operator review, merge and deployment decisions. Then confirm on the affected account, which is the only evidence that phase 538 addresses its cause. The affected desktop's reduction stopped at the preparation budget while reading saved history, so its saved records are near 32 MiB; phase 541 is the repair for that, and phase 542 raises the 4 MiB encoded-baseline ceiling, which may have been the next limit it met, to 8 MiB for writing and 32 MiB for reading. Whether it would have bound is not known: an installed service snapshot costs about four bytes per byte in every later baseline, so it binds near a 0.65 MiB document; the phone's current baseline size would settle it. A workspace above about 1.33 MiB of document state can no longer get a service snapshot, so its service history cannot be pruned; an oversized snapshot admitted before phase 544 still halts receive on devices that fetch history. Skipping such a snapshot, or raising the install bound, needs an operator decision (phase 544 record). A slow sync sidebar on both devices may still be cold-start work: phase 545's replay fix applies to cold opens too, but nothing has been measured on the devices, and whether the symptom follows a resume or a reload is not known. A sign-in refusal seen on the desktop during the phone's maintenance is unexplained and needs the service log. Whether either device holds a saved account attempt is not known; after phase 546, History on this device says so when one blocks reduction, and after phase 547 History maintenance names a saved snapshot and offers Discard for it. How many positions the affected account has accepted since its last verified snapshot is not known; past 4,096 no snapshot can be made, and after phase 547 checking history says so. Everything held back from this slice is listed in [product-backlog.md](./product-backlog.md) under "Held from the release repair", and the agents' investigation reports are kept in [investigations](./development-evidence/2026-11-11-release-repair/investigations/README.md).

**Evidence and limits.** [Phase 538 record](./development-evidence/2026-11-11-release-repair/538-index-retained-bytes/README.md), [phase 539 record](./development-evidence/2026-11-11-release-repair/539-reduction-sync-hold/README.md), [phase 540 record](./development-evidence/2026-11-11-release-repair/540-reduction-poll-deferral/README.md), [phase 541 record](./development-evidence/2026-11-11-release-repair/541-reduction-past-cache-budget/README.md), [phase 542 record](./development-evidence/2026-11-11-release-repair/542-large-reduced-baseline/README.md), [phase 543 record](./development-evidence/2026-11-11-release-repair/543-capacity-cause/README.md), [phase 544 record](./development-evidence/2026-11-11-release-repair/544-snapshot-install-bound/README.md), [phase 545 record](./development-evidence/2026-11-11-release-repair/545-replay-coverage-view/README.md), [phase 546 record](./development-evidence/2026-11-11-release-repair/546-hold-progress-bound/README.md), [phase 547 record](./development-evidence/2026-11-11-release-repair/547-snapshot-race-discard-bound/README.md), [phase 548 record](./development-evidence/2026-11-11-release-repair/548-oversized-actions/README.md), [phase 549 record](./development-evidence/2026-11-11-release-repair/549-completed-replay-kept/README.md) and [phase 550 record](./development-evidence/2026-11-11-release-repair/550-verified-cut-fold/README.md). No device run; phase 542 measured hex checks in WebKit, Chromium and Firefox and reduction time and memory in Node, and phase 545 measured replay builds and times in Node. `pnpm test:local-baseline` fails 5 of 5 on this branch and four of them on main as well, so the draft-4 path has no real-browser coverage. The account's row and byte counts were not observed.

**Rollback.** Revert phase 550, then 549, then 548, then 547, then 546, then 545, then 544, then 543, then 542, then 541, then 540, then 539, then 538; each builds on the one before except 538. Phases 538 to 541 and 543 to 550 change no stored format, wire or limit; phase 544 adds refusals only, and reverting it lets oversized snapshots be published again. Phase 542 adds a stored carrier: a device that wrote one shows "This workspace needs a compatible app" under an older build and opens again under a newer one; no device needs repair. Reverting phase 550 leaves a store that holds a verified installation not yet folded unopenable by the reverted build until a build with phase 550 folds it; a folded store opens under either.
