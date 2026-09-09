# Core review reproductions — 2026-09-09

Baseline: **da5def9**, which commits phase fourteen's export preparation. This checkpoint reproduces the
three selected review findings without changing production code, fixing the defects, continuing migration
or paying an acceptance debt. The reviewer supplied prose but no saved random cases; the campaigns below
use our existing compaction corpus and independently generated cases. Frequencies are not directly comparable
with the reviewer's search.

## Results

| Question | Observation | Disposition |
| --- | --- | --- |
| Does journal churn block admission? | A peer append or completed cleanup during a CDP-paused native snapshot produces `journal-changed`; later input remains private/blocked for three flush intervals and succeeds after explicit Retry. | Error propagation and persistent blocking reproduced under controlled interleaving. Routine simultaneous typing frequency is unproven. |
| Can a serialized pending fork diverge from canonical? | Production draft/history forks and the initial-document serialization pattern strand the known corpus. The actual workspace promotion leaves the editor and export at `base0` while canonical contains `aaaabase0`. | Reproduced through native production custody/admission/workspace/editor/export paths with deliberately supplied pending updates. |
| Can original update framing strand in pinned Yjs? | 169 of 50,000 arbitrary permutations retain pending state and wrong visible text after all original records arrive. A seven-record case survives shrinking and saved replay. | Reproduced in Yjs 13.6.31. Sender-ordered and complete-join arms have no observed failures under their stated generators. |

## Journal interleaving and its limits

The browser runner uses actual native IndexedDB/localStorage, factor enrollment, Web Locks, WASM journal
sealing, the admission owner and workspace editor. Source code is copied and hashed before execution.
No storage errors are substituted in the cross-tab schedules. An observer around `Object.keys(localStorage)`
captures the first enumeration, pauses the renderer with CDP, and allows a separate tab to either append
through the real workspace owner or flush/commit/delete the captured journal entries. Resuming the first
tab exposes the changed native key census to its recheck. Both schedules reject `whenDurable` with
`journal-changed`, enter `blocked`, retain a subsequently submitted `C` privately for 750 ms, and recover
after explicit Retry. A separate same-task reentrant peer append pins the propagation mechanism; that
schedule alone would not be evidence of ordinary two-tab execution.

The native counterchecks matter:

- While the first tab spends **500 ms in one uninterrupted synchronous snapshot task**, a second tab
  successfully appends within that interval. The first tab sees the same key census before/after and its
  flush succeeds. Wall-clock start/end times establish actual overlap. Unlike CDP pause, this introduces
  no debugger nested event loop or JavaScript yield.
- Five rounds of simultaneous keyboard input on two real CodeMirror surfaces pass with no channel, and
  another five pass with the actual workspace BroadcastChannel. Each round types 160 characters per tab,
  for **3,200 total keystrokes** in the final run. Automatic 250 ms flushing remains enabled; explicit
  durability barriers and expected accepted-text lengths also settle each round. No `journal-changed` or
  blocked state is observed. The preceding exploratory run independently completed the same typing count.

These results do not establish that routine simultaneous typing triggers the error on Chromium. The
debugger pause can change renderer event processing; the uninterrupted result demonstrates a stable
storage view in that measured task, not a universal platform guarantee. Other supported browsers and
process schedules remain untested. The claim that this is the normal two-tab case is therefore stronger
than the evidence obtained here. The error class still reaches an explicit human-retry state when exposed.
`startupRefusal({code:'journal-changed'})` also maps to `unavailable`; this is a direct mapping probe, not
a reproduced full cold-start interleaving.

## Pending clones and actual workspace promotion

The existing four-edit compaction corpus emits seven original records from three authors (IDs 101–103).
The fixture uses `master`, `lane1` and `lane2` text roots, with a separate input-string ledger. Apply
records **3, 1, 5**, serialize/clone, then deliver **0, 2, 4, 6**. Original framing in the original document
recovers `aaaabase0`; `cloneDocument`, `forkWorkspaceHistory` and a fresh initial-document serialization
retain `base0` plus pending structs. Before dependency delivery, both visible master texts are empty.
Their integrated state vectors also match; the pending missing-clock maps differ.

The native workspace reproduction opens an initialized encrypted fixture and supplies 3, 1, 5 through
`workspace.receive`. A local settings change then runs the production draft/history preparation and
promotion. Delivering the remaining originals completes canonical state but leaves the accepted workspace,
CodeMirror state and Markdown export at `base0`. The carrier retains the original updates. In independent
fresh fixtures, both closing/reopening and a subsequent Undo command restore `aaaabase0`. The latter
serializes the history again after the basis exists; it is an observed recovery control, not a proposed
repair contract. Thus the review's “until reopen” description is too restrictive for this corpus.

**A visible comparison only at promotion is insufficient:** the texts agree at that point, and diverge
after subsequent remote dependency delivery. A fix must preserve or recover pending information and keep
checking the relationship as the basis changes. The production channel also emits serialized snapshots,
but this checkpoint does not reproduce this malformed pending episode through ordinary channel ordering.
The cold-join campaign below uses complete donor snapshots and finds no failure. Synthetic receive authority
and the deliberately supplied three-root corpus must not be mistaken for demonstrated reachability from
ordinary application edits or an authenticated Account transport.

## Larger bare-Yjs ordering campaign

All arms use seed **8941**, four to 22 generated edits, three fully synchronized source authors, three
text roots, insertion/deletion and small multiline/Unicode strings. Every generated source is checked
against a separate sequential string model, and an in-order original replay must complete before the
alternative delivery is evaluated. Nonempty initial roots make each delivery alphabet total. The final
oracles require both the expected text and no pending structs/deletion sets after the complete basis arrives.

| Arm | Histories | Violations | Delivery rule |
| --- | --- | --- | --- |
| Arbitrary original-record permutation | 50,000 | 169 | May reverse records from the same sender; all records arrive exactly once. All failures have wrong text and pending structs; 165 also have pending deletion sets. |
| Sender-ordered original records | 50,000 | 0 observed | Random interleaving of the three authors' FIFO queues. |
| Complete donor snapshot with early tail delivery | 50,000 | 0 observed | A complete prefix snapshot arrives after some original tail updates; the remaining tail follows in source order. |

These are **150,000 histories**, not a bound on production failure probability. The source authors fully
synchronize between edits; genuine concurrent source editing, receiver-local edits during join, editor
commands and arbitrary pending donor snapshots are outside these generators. Random queue interleavings
are not uniformly distributed over all valid orders. The zero counts neither prove library correctness
nor establish the whole channel contract.

Fast-check shrank the first permutation failure **133 times** and saved its seed, shrink path, input history,
original wire bytes and observed state. Saved JSON replay repeats the exact outcome. Removing three no-op
input edits preserves every wire byte, leaving four meaningful edits and seven records. Its failing order
is **2, 3, 4, 6, 0, 1, 5**. Expected texts are `aabase0`, `aabase1`, `base2`; actual texts are `abase0`,
`base1`, `base2`, with missing-clock entries for clients 102 and 103 even though all seven records arrived.

Exhausting all **5,040 permutations** of those seven records yields **78 failures**. All **210 sender-ordered
permutations** complete. For the pinned failing order, an empty update does not repair it; re-delivering the
originals in source order, replaying its own complete serialized state into a fresh document, or supplying
a fresh complete donor snapshot does. These are corpus-specific probes, not general fixes. In particular,
serializing a still-incomplete union caused the separate clone failure above.

## Evidence and reproduction commands

The raw reports are copied byte-for-byte from ignored `test-results/core-reproductions` directories:

- [Native nine-case report](./storage-conformance-runs/2026-09-09-core-browser.json): final
  `browser-confirmation/report.json`, including independent reopen/Undo controls, all three controlled
  churn probes, uninterrupted overlap and both keyboard campaigns.
- [150,000-history report](./storage-conformance-runs/2026-09-09-core-yjs-ordering.json):
  `yjs-final/report.json`, including the first and shrunk failures.
- [Saved-case replay](./storage-conformance-runs/2026-09-09-core-yjs-replay.json):
  `yjs-corpus-replay/report.json`, read from the checked-in [fixture](../test/core-reproductions/original-order.json).
- [Exhaustive seven-record report](./storage-conformance-runs/2026-09-09-core-yjs-corpus.json):
  `corpus-final/report.json`, including byte-preserving no-op pruning and recovery probes.

The native run uses Chromium **151.0.7922.34**, macOS arm64 and Node **26.8.1**. Every recorded input hash
and frozen native source copy is verified. Reports use `completed-reproduction` to mean the investigation
executed; `violationReproduced` identifies a reproduced defect. It is not a conformance pass. Unexpected
exceptions and failed experimental controls are harness errors and exit nonzero.

```sh
node scripts/core-reproductions/yjs-ordering.mjs --seed 8941 --runs 50000 --output test-results/core-reproductions/new-campaign
node scripts/core-reproductions/yjs-ordering.mjs --replay test/core-reproductions/original-order.json --output test-results/core-reproductions/new-replay
node scripts/core-reproductions/yjs-corpus.mjs test-results/core-reproductions/new-exhaustive
node scripts/core-reproductions/browser.mjs --rounds 5 --output test-results/core-reproductions/new-browser
```

Use a fresh output directory each time. Set `CHROMIUM_PATH` if Playwright's default Chromium is unavailable.
These are explicit investigation runners, outside the normal passing-conformance check chain. The clone
corpus assertions intentionally pin current bad behavior and must be revised alongside any eventual fix.
Fifty-one existing admission/workspace/storage-property/seam tests pass; typecheck and focused lint/format
pass. No production file changed. The full unit suite, build, platform matrix and unrelated encrypted-store
browser suites were not rerun for this reproduction-only checkpoint.

Migration remains paused. The next bounded work is to design and test the journal-churn disposition and
pending-projection repair against these cases before returning to destination/import work. The other
review findings (recovery tooling, maintenance/costs, custody row limits, nonce-budget wording and neutral
plaintext scanning) were not reproduced or fixed in this selected three-case investigation.
