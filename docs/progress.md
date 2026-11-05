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

## Active slice: release hardening — format contract and idle audit

```yaml
gate: release-hardening
seat: /Users/thomasingalls/.codex/worktrees/7fda/done
branch: codex/reduce-goals-context-overhead
status: in flight
scope: remaining approved Stage3.2 format hardening after cleared functional checkpoint
blocks_on: floor lifecycle/old-reader controls; complete binary readers/writer and rollback evidence
updated: 2026-11-03
```

**Scope.** [Operator hardening plan](./release-hardening-2026-11-02.md), its
November3 unit amendment, and [approved writer-on contract](./account-inbound-page-receipts.md).
Bounded sequential patches, no lab work or unlisted speed experiments. All other
gates, limits, budgets, deadlines and security checks stay. No computer use,
commit, push, publication or deployment.

**Checkpoint cleared.** [385](./development-evidence/2026-11-02-release-hardening/385-clean-host-nine-reruns/README.md)
passes all nine complete commands at original120s, full units104.723–110.332s,
298files/2985cases/one existing skip each. Actual sidecars and internal durations,
fseventsd CPU/RSS, swap and display logs are preserved; all52133start pins exact,
index empty. New daemon PID88698 verified.240s fallback unused. All83commands have
passing segments across381/382/383/385, not a final monolithic hardened-build check.
Old failures stay immutable; no causal timing or release credit is claimed.

**Floor activation checked on Page.**
[386](./development-evidence/2026-11-02-release-hardening/386-authenticated-floor-activation/README.md)
uses the existing full-authentication/carrier-initialization hook and fresh saved
MAC/exact snapshot/native-task checks, including the CAS guard. Five new native
Page controls and five unchanged joined-parser controls pass; omission fails.
Full unit298files/2985cases/one existing skip passes105.42s at120s. All prior
failures stay; expected runtime census/source-site/pin drift was reviewed without
changing classifications or open obligations. Ordinary writing remains off.

**Genuine Worker/Joined opening checked.**
[387](./development-evidence/2026-11-02-release-hardening/387-genuine-worker-floor/README.md)
uses normal packaged UI/private service/virtual WebAuthn, no authentication or native
acquire seam. Original/Joined real cohorts preserve marked custody and two-way
writing through lock/navigation/cold opening. The first prefix-lock assumption
failed; exact-slot and independent supervisor checks pass. New family registered
as required; all old dispositions stay. Runtime/Vitest population exact to386.

**Explicit private stored mode checked.**
[388](./development-evidence/2026-11-02-release-hardening/388-explicit-stored-mode/README.md)
separates saved-request semantics from optional legacy-byte equality. Six new
actual-verifier controls pass; before failures and live-only omission retained.
Full unit298files/2985cases/one existing skip passes106.61s at120s, all16current
Node/native controls and types/quality/registry/inventory pass. No old guard/test
or row format change. Binary physical mode/received-kind and all four aged
stored callers plus31s interior-cut cold remain after integration.

**Shared syntax/logical home checked, not yet wired.**
[389](./development-evidence/2026-11-02-release-hardening/389-shared-receipt-views/README.md)
adds admitted count before lazy views, true request epoch and actual index/position/
link/original-byte projections, plus physical+entry memo slots. Eight cases cover
all72extents;93focused pass. Full299files/2993cases/one existing skip passes107.81s
at120s. Old codec guard ASTs exact; classification/typecheck development failures
preserved. No authority trust, binary writing, caller compatibility or performance
credit follows. Parsed-page reuse remains pending.

**Owned syntax core checked.**
[390](./development-evidence/2026-11-02-release-hardening/390-owned-receipt-syntax/README.md)
shares one parsed original per owned physical codec/inspection turn. Four new
count controls fail before, five pass after;98focused checks and full300files/
2998cases/one existing skip pass (109.01s at120s). All old codec predicates and
semantic guard calls remain. No authentication trust or timed performance/RAM
claim follows. The verifier and actual readers still need integration.

**Authenticated scopes checked.**
[391](./development-evidence/2026-11-02-release-hardening/391-authenticated-receipt-scopes/README.md)
carries native marker floors after committed ACK and replaces parent floors with
retained readings' own floors. Scoped binary syntax requires that scope's floor;
no verification trust follows. Five new controls fail before, six pass after.
Full301files/3004cases/one existing skip passes108.31s at120s;10Page/parser cases
and a rebuilt genuine Worker/Joined cold journey pass. Actual binary semantic
callers and their memo floor scopes remain unwired.

**Binary stored core checked, not app-integrated.**
[392](./development-evidence/2026-11-02-release-hardening/392-binary-stored-receipt-core/README.md)
privately captures saved raw/syntax/context, verifies every selected entry and
metadata with failure erasure, and returns one owned physical extent. Twelve new
controls cover aged/interior signed pages and actual parser/crypto counts;10fail
before,109focused pass after. Full302files/3016cases/one existing skip passes
107.46s at120s. Six old stored-core checks and their anchored omission control
remain effective. No native binary cold or commit/qualification credit follows.

**Next bounded outcome.** Encoding-floor scopes and complete binary stored/read
integration through all ten direct readers and indirect consumers, then owned
pages/dense writer/G8/range4/B/index/audit/reservation controls. Keep physical
witness rows distinct from logical entries. Continue floor lifecycle/rewriter/
first-write/lost-reply/pending-writing and genuine old artifacts, plus same-tree
writer-off image.387does not isolate first floor write task mode. Ordinary writing
remains off; no binary or final rollback-image proof yet. No new ceremony,
serialized authority, cross-owner assertion reuse, trust/wire/gate/limit change;
stop/report as the operator requires.

**Still required.** Stage4's stale-turn audit control after format integration,
full coherent-source checkpoints, release-profile assets, all Stage5 replicates and
Stage6 landing report. Do not turn functional unit timings into acceptance credit.

This seat edits only this document; the other seat above is unchanged.
