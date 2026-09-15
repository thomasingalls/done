# F-17 at `55ab217e`: the per-keystroke path has to become O(edit)

Reviewer assessment, 2026-09-15. Tip `55ab217e` (signed chain, 110 commits above `1372c39`). This is
a design perspective on the remaining card-typing gap, not a release receipt and not a bug packet. The
numbers marked "author" come from the F-17 records in `docs/`; the numbers marked "probe" come from two
Node probes I ran in this session (section 7) on the latency corpus through the real admission pipeline
with a memory carrier. Node numbers are for ratios and shape; they are not phone latencies.

## 1. Where a keystroke's time goes

One character typed into a card runs this sequence synchronously inside the key handler
(`src/editor/admittedEditor.ts:86-94` refuses the change in CodeMirror and submits an intent;
the text appears only after `project()` at `:194` reads the accepted state back):

1. `prepareWorkspace` forks the accepted history: a whole-document fork (`forkDoc`, `src/crdt/yjs.ts:107`)
   plus a copy of every undo and redo stack item with `structuredClone(meta)` per item
   (`forkHistory`, `yjs.ts:499-545`). The reference path additionally clones the canonical document
   (`prepareIntent`, `src/crdt/admissionDocument.ts:35`).
2. `runWorkspaceCommand` runs `repairCardMemberships` twice, before and after the command
   (`src/crdt/workspaceCommands.ts:137,283`); each pass walks every day, section, entry, location and card.
3. The update bytes are sealed and appended to the journal (sub-millisecond on the Pixel 9a, TRD §12).
4. Promotion applies the bytes to the canonical document and then runs `sameDocState`
   (`yjs.ts:228`): state vector and delete set, then a complete re-encoding of both documents.
5. `emit()` calls every subscriber with no argument. The React hook calls `workspace.read()`
   (`src/ui/workspaceUi.tsx:85-91`), which materialises every card's text and every day's membership
   (`src/crdt/admittedWorkspace.ts:546-589`); nine `Collection`s each rebuild a Map of all cards
   (`src/ui/Collection.tsx:70`) and `App` rebuilds a Set of all placed ids (`src/ui/App.tsx:60-63`).

Every step except 3 does work proportional to the workspace or to the undo depth. The edit itself is
20 bytes. The table gives the per-key attribution on CPU-4x emulation from the author's 60-key profiles
(inclusive sampled time divided by 60; rows overlap) and the isolated cost of each component in the probe.

| Component | Author, CPU-4x Android, ms per key | Probe, Node, ms | Proportional to |
| --- | ---: | ---: | --- |
| Canonical clone (reference path only) | 12.5 | 2.26 | document |
| History fork: document | 12.2 to 12.8 | 2.32 | document |
| History fork: stack copy | 12.3 to 13.0 | 0 to 4.9 (0 to 500 items) | undo depth |
| Complete comparison | 12.9 to 16.6 | 2.14 | document |
| Membership repair, two passes | 5.9 | 0.54 | cards and days |
| Publication: `read()`, listeners, renders | 8.2 to 8.7 | 0.24 (`read()` alone) | cards and days |
| Apply one keystroke's update | not profiled | 0.003 | edit |
| Snapshot equality (state vector plus delete set) | not profiled | 0.012 | clients and deletions |
| Delta since the previous state vector | not profiled | 0.008 | edit plus delete set |
| `EditorState.create` for a card with markdown | not profiled | 0.026 | card |

End to end in the probe (memory carrier, no encryption, no paint, UI `read()` subscribed), medians over
120 keys at undo depth about 420, after the seeded 300 cards and 400 Goals lines:

| Variant | Median ms per key | p95 | Same, corpus doubled to 600 cards |
| --- | ---: | ---: | ---: |
| `reference` (production default) | 10.7 | 13.7 | 21.0 median, 24.0 p95 |
| `local-handoff` | 8.4 | 11.9 | |
| `local-snapshots` (author's best variant) | 5.6 | 8.8 | |

Doubling the corpus doubles the per-key cost. That is the signature of O(document) work per key.

## 2. Three reasons the current program does not reach the target

**2.1 The remaining factor is not available from constants.** Three exploratory rounds took the CPU-4x
median from about 75 ms to 47 ms by making the same O(document) work cheaper (V2 fork codecs, string
reuse, comparison pooling). The bare CodeMirror control on the same profile measures 7.3 to 8.6 ms p95 in
its first block and 18.0 to 19.1 ms in its second (`docs/f17-local-profile.md`, `f17-history-profile.md`).
The 16 ms p95 budget therefore leaves at most 5 to 8 ms for everything the application adds per key.
Getting from 47 ms of application work to 5 ms is a further 9x. Each remaining term in section 1 scales
with the workspace, so shaving 10 to 30 percent off each one, as the rounds have done, cannot deliver it.

**2.2 The cost grows with every keystroke of the session, and the gate cannot see it.** Each input is its
own undo group by design (`docs/editor-admission.md`, `group = ++nextGroup` at
`admittedWorkspace.ts:407`), so the undo stack gains one item per keystroke and every later keystroke
copies the whole stack. The gate types 120 keys at a depth of about 400. A long session looks different
(probe, medians per block of 100 keys, UI read subscribed):

| Keys typed in session | Undo depth | `reference` ms per key | `local-snapshots` ms per key | O(edit) sequence, section 3 |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 402 | 10.5 | 5.4 | 0.050 |
| 400 | 702 | 14.7 | 5.7 | 0.059 |
| 800 | 1,102 | 19.4 | 6.2 | 0.062 |
| 1,200 | 1,502 | 24.1 | 6.8 | 0.069 |

The reference path costs about 12 microseconds per retained undo item per key in Node. The author's own
history probe shows the same slope amplified by selection metadata (8.8 ms per fork at 1,000 groups with
one target, `docs/f17-history-profile.md`). The snapshot variant flattens the metadata term but still
copies the stack arrays and delete sets of every item per key. Three paragraphs of writing is 1,500 to
3,000 keystrokes. On the Pixel 9a, at the observed 1.5x over emulation and about 5x over Node, the
reference path would be well past 100 ms per key by the end of such a session. Nothing in the current
gate or in the release-validation graph measures this.

**2.3 On a 60 Hz phone the recorder's floor is one frame, so the budget as measured is unattainable
there for any implementation.** The recorder measures from the trusted `keydown` timestamp to a task
queued after the next `requestAnimationFrame` (`test/latency/recorder.ts:66-101`). On real hardware the
callback runs at the next display frame, so before any application work the sample already spans up to
one frame, 16.7 ms at 60 Hz, and its p95 sits just under that. The Pixel 9a companion measured a plain
textarea at 14.2 to 15.7 ms p95 across four sessions with frame intervals of 16.6 to 16.7 ms
(`docs/f17-pixel9a.md`); that is the floor. It leaves under 2 ms for CodeMirror and admission combined. Emulation has no such floor (textarea 1.4 ms on desktop, 5.9 ms on CPU-4x), which is why the
number is meaningful there and not on the phone. The phone target should be restated as the difference
between card p95 and textarea p95 in the same session (the frame cadence cancels), or the recorder
should start at input dispatch rather than the hardware timestamp. This is a measurement finding, not a
proposal to relax the emulated budget.

## 3. Proposal: make the per-key path O(edit) and keep the invariants

The normative floor is the storage contract: nothing is acknowledged before a durable carrier exists,
there is no optimistic document tier, and input stays ordered (`docs/storage-contract.md` SC-01/02).
None of the changes below touch that floor. The full-encoding comparison per transition, the per-key
history fork and the two-draft structure are phase-doc policy, each recorded as not yet performance
accepted (`docs/pending-projection.md:28-29`, `docs/workspace-admission.md:28-31`). Those are the terms
to change, and each change below names what it preserves.

**3.1 Persistent double-buffered histories instead of a fork per key.** Keep two long-lived gc:false
history documents with their UndoManagers, A and B, identical between commands. A text command runs on
the trailing buffer, which is the private draft; the accepted buffer is untouched, exactly as `pending`
is untouched today. On a journalled append, apply the same bytes to the canonical document and to the
accepted buffer with an untracked origin, then mirror the single stack transition that the command
produced (one pushed or extended item: copy its two delete sets and its metadata, O(1)), and swap the
roles. On a refused append, the trailing buffer simply holds the prepared state until retry, as `pending`
does now; no rollback exists because nothing accepted changed. On discard, rebuild the trailing buffer by
the existing fork; discard is rare and user-initiated. Undo, redo, structural commands and anything that
sets `Item.redone` links take the existing fork path for now; they are user-paced. Remote deliveries
apply to both buffers with the untracked origin, as they apply to one buffer today.

Preserved: the private draft, refused edits never change accepted state or human undo groups, the
canonical document is never lent, the UndoManager mechanics and metadata shapes, and the ownership seams
already built for `local-handoff` (the preparation context can hand out the trailing buffer instead of a
fresh fork). Cost per key: O(edit) plus one stack item. The section 2.2 table's last column is this
sequence simulated with the pinned Yjs primitives on the same corpus: 0.05 to 0.07 ms per key, flat
over 1,200 keys, with both buffers and the canonical document byte-equal at the end.

**3.2 Verify each transition by induction, and re-verify the whole document on idle.** The reproduced
divergence that motivated the full comparison was in pending-struct bookkeeping and deleted content,
which state vectors alone miss (`docs/decisions.md:1986-1990`, `docs/storage-contract.md:50-51`). The
per-key check that covers it is: state vector and delete set equality (`Y.equalSnapshots`, 12
microseconds), byte equality of the new-struct delta since the previously verified basis on both
documents (8 microseconds), and the existing exact comparison of pending bytes and the missing-clock map.
If the two documents were equal at revision n and applying the same bytes produced the same delta and
the same clocks and deletions, they are equal at n+1. Keep the complete `sameDocState` at startup (it
runs there today), after every slow-path transition, after remote deliveries, at close, and on the
existing 750 ms idle window, with a counter so it also runs every N transitions during sustained typing.
The property that changes is when unchanged state is re-verified: immediately today, at the next idle
or slow-path transition under this rule. The only way unchanged state can diverge between transitions is
a mutation of the projection document outside admission, which the ownership rules already forbid; a
`beforeTransaction` guard on the history documents that rejects foreign origins turns that rule into a
cheap runtime check. This needs its own decision record because `docs/pending-projection.md` currently
says every accepted transition checks normalized integrated content.

**3.3 Run membership repair only when membership can change.** `transactionAffectsMembership`
(`src/crdt/days.ts:168`) already decides this for the store's own observer. A text transaction on a
card or on Goals cannot change membership, so both repair passes can be skipped for it; keep them for
structural commands and after remote deliveries, where the existing `cardMembershipIssues` check lives.
Repair is idempotent, so this changes no accepted state. About 6 ms per key on CPU-4x by the author's
round-3 profile.

**3.4 Publish incrementally with stable identities.** Maintain the `WorkspaceSnapshot` as a cached
structure updated from each transaction's changed types (Yjs reports `changedParentTypes`; the text
observer already exists per surface), so that unchanged card and day entries keep their object identity.
Then `Collection` can memoise its lookup on the `cards` array identity, `App` can memoise `placed`, and
the nine Collections stop rebuilding indexes while someone types in one card. Deliver through
`useSyncExternalStore` with a stable snapshot object so consumers that did not change do not render. The
edited card already renders from its own text surface while editing (`src/ui/Card.tsx:105-109`), so the
static tree needs nothing per key. About 8 to 10 ms per key on CPU-4x by the profiles.

**3.5 Reuse the editor state per target.** `runWorkspaceCommand` creates a fresh markdown-parsing
`EditorState` for the target text on every command (`workspaceCommands.ts:146-154`). Keeping one state
per target between commands and applying `state.update` makes this O(edit); the cost is small for a
card and 0.5 ms for the 400-line Goals text in Node, so this is last.

## 4. Expected result

Using the round-3 attribution for the selected experimental combination on CPU-4x (47 ms median):
removing the fork term (22 ms) and the comparison term (17 ms) leaves about 8 ms, of which membership
repair and publication are most of the rest; after 3.3 and 3.4 the application's own per-key work is
in the 1 to 2 ms range and the measured latency is CodeMirror's, whose bare control sits at 7 to 9 ms
with a second-block tail of 18 to 19 ms that the control itself exhibits. That is the 5 to 6x from the
current combination and about 7x from the gate's 75 ms, with the per-key cost no longer growing with
the session or the workspace. On the Pixel 9a the honest target is card p95 within a few milliseconds
of the textarea p95 in the same session; the current 87 to 108 ms against 14 to 16 ms should close to a
single-digit difference.

Rust or Wasm does not change this picture: moving O(document) work per key into Wasm keeps it
O(document) with a smaller constant, and the round-2 assessment already notes that a partial port that
reconstructs JS-owned objects per edit can be counterproductive. Do the complexity change in JavaScript
first; Wasm remains available afterwards for constants, as it already is for the journal seal.

## 5. Order of work and how to gate each step

1. **Publication and repair (3.3, 3.4, 3.5).** No admission semantics change. Gate with the existing
   `browser-latency-diagnosis` selection; expect the card p95 to drop by roughly the repair and
   publication terms on both projects.
2. **Double buffer for text commands (3.1) with the full comparison still on every key.** Behind the
   existing explicit preparation selector, next to `local-handoff` and `local-snapshots`, so the
   reference stays for comparison. Reuse the generated ledger histories, retry, discard, remote and close
   controls already written for the handoff and snapshot variants; add a mutation that shares a delete
   set between buffers and one that skips the stack mirror, each of which must fail. Expect the fork term
   to disappear from the profile.
3. **Verification by induction (3.2)** with its decision record, the foreign-origin guard, the idle full
   check, and a control that mutates the projection document outside admission and must be caught by
   the next full check. Expect the comparison term to disappear.
4. **Add two measurements to the diagnostic:** a 1,000-key block so undo-depth growth is visible, and the
   card-minus-textarea difference for the phone. Rerun the unchanged application gate last.

Each step is independently reversible and each has a profile signature to confirm it did what it claims.
Steps 1 and 2 are the ones with no policy decision attached and should run first.

## 6. Risks

- Yjs internals: the mirror uses the same `undoStack`, `insertions`, `deletions`, `meta` and
  `Item.redone` fields that `forkHistory` already uses; the dependency on the pinned v13 seam does not
  widen, but it does not narrow either.
- Undo and redo stay on the fork path until the redone-link mirror is written; an undo during a long
  session costs one fork, which today every keystroke costs.
- Memory: two long-lived gc:false histories instead of one plus a transient fork per key. Peak is
  unchanged (the transient fork exists during every preparation today); steady state gains one document.
- The induction rule changes when a silent projection divergence is detected, from the same transition
  to the next full check. The foreign-origin guard and the idle check bound that window; the decision
  record should say so explicitly.
- The `local-snapshots` selection-token machinery becomes unnecessary once no stack is cloned per key;
  it can stay as the metadata copier for the slow path.

## 7. Probe details

Two vitest files outside `test/`, in this session's scratchpad (`perf-probe/probe.test.ts`,
`perf-probe/growth.test.ts`, results in `results.json` and `growth.json`), run with the repository's
vitest through a scratch config that allows the repository path. They open `createAdmittedWorkspace`
with the same memory carrier shape as `test/workspaceAdmission.test.ts`, seed 400 Goals lines and
20 x 15 cards through `compose`, add one scheduled card on today, and type into it through
`workspace.text().input` with a subscribed listener that calls `workspace.read()`. Component timings
use a detached document built from `workspace.snapshot()`. The O(edit) simulation uses `forkDoc`,
`workspaceUndo`, `Y.equalSnapshots`, `Y.encodeStateAsUpdate` and `Y.applyUpdate` from the pinned seam
and checks `sameDocState` on both buffers at the end. The worktree is unchanged at `55ab217e`.
