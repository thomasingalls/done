# Phase 548 — an action too large for one update saves in slices or is refused alone

The operator approved "split where it reasonably can and refuse cleanly otherwise" on 2026-11-12, from the investigation report on the stalled save ([investigations/16](../investigations/16-slow-catch-up-and-stalled-save.md)). The 16 KiB admission update limit (`MAX_JOURNAL_UPDATE`, `src/crdt/journalCodec.ts:6`) and the journal format are unchanged.

## What was wrong (reproduced)

A composed card of about 16,200 single-byte characters, or about 5,400 three-byte ones, never saved. The compose command builds the whole card in one transaction and returns no remaining slice. The admission queue refuses a prepared update over 16 KiB with `slice-required` (`src/crdt/admissionQueue.ts:773-782`) and its pump blocks on the error (`:376-385`). The input stays pending in memory, retry prepares the same update again, and the workspace stays blocked, which also closes the sync gate (`local-storage`, `src/crdt/accountReceive.ts:3610`). The page shows "Waiting to save…" and "Input is waiting for storage." with Retry and Discard; only Discard or a reload ends it. The same happened for Duplicate, Done for now, merging into the previous card, splitting, copying or moving a long Goals line, moving Next to Goals, Undo of a removal, Redo of a paste, formatting many lines at once, and deleting a heavily edited range. A paste into a card was the only large edit that worked, because text inserts slice. On the phase 547 source the new tests below show every one of these over the limit staying pending with the queue blocked.

## Decision context: no recorded decision is amended

Three 2026-09-08 entries govern this:
- The ordered-admission decision says oversized adapter output blocks before sealing, and failed local preparation holds the suffix for retry or discard. The workspace adapter was meant to slice: "commands that need slicing return a strictly smaller remaining byte intent".
- The editor-admission decision says unsupported large command output "refuses visibly".
- The workspace design note (`docs/workspace-admission.md`) recorded the interim state: large commands "block visibly; general large-command slicing remains owed".

This phase changes the workspace adapter, not the queue. The adapter now keeps every prepared update within the limit. It splits compose, and it completes every other oversized command as a no-op whose business result names the refusal. That is the visible refusal the editor-admission decision asks for, and it fits the workspace decision's rule that a completed refusal must not be confused with a storage failure.

The queue's own guard is unchanged. So is the test that pins it, `test/admissionQueue.test.ts:350` ("enforces prepared-update size before sealing, preserving a resumable pending input"). That test uses a synthetic adapter and still describes the queue's behaviour for an adapter that breaks the contract. Its premise, that the adapter slices when retried, never held for the commands above: none of them returned a remaining slice, so a retry could never succeed. The two design notes (`workspace-admission.md`, `editor-admission.md`) and `ordered-admission.md` now say what happens instead.

## The change

**Refusal at the adapter** (`src/crdt/admittedWorkspace.ts:414-437`):
- After a command runs on its private fork, an update over 16 KiB is never handed to the queue. The adapter discards the fork and returns an unchanged fork of the basis with the result `too-large-for-one-action` and an empty update.
- The queue completes this as a no-op, so its ticket settles at once. Nothing is written or sent, and the queue and the sync gate stay open.
- In the local-snapshots preparation the scope now takes ownership of the history only after the size is known (`:283-310`, `:436`). Before, it took it before the command ran, and could not later be handed the unchanged fork.
- The direct text path (account-text) returns a change over the limit to the general path, which refuses it (`:539`).

**Compose splits** (`src/crdt/workspaceCommands.ts:330-357`), following the paste design:
- A compose whose text is over 14 KiB of UTF-8 (`COMPOSE_WHOLE_BYTES`, 2 KiB under the limit) creates its card from the first text slice. The rest is a text-insert intent at the end of the new card, in the same group.
- Slices come from the same helper the paste slicer now calls (`sliceInsertText`, `:96-101`): at most 1,000 UTF-16 units, never ending inside a surrogate pair.
- The compose's undo step is left open so the text slices join it (`src/crdt/moves.ts:96-102`, `compose(..., { open })`).
- Later slices are marked `continuation`. Their receipt keeps the first slice's result, the new card's id, on both the general and the direct path (`admittedWorkspace.ts:415`, `:590`).
- Below the bound, a compose is one update as before.

**A ceiling before queueing** (`admittedWorkspace.ts:716-728`, `:1066-1067`):
- A compose or paste over 1,048,576 UTF-16 units (the paste bound that already existed, now also applied to compose) is refused before anything is queued, with a typed `ActionTooLarge` (`src/crdt/actionSize.ts`).
- So is any action whose encoded intent could not fit the queue's 4 MiB reservation even when the queue is empty. That reservation is twice the intent plus 16 KiB, so the largest intent is 2,088,960 bytes.
- Before this, the first of these threw a developer message ("Split the input source before admission.") and the second reported a full queue.

**What the person sees.** Every refusal shows one sentence, in the workspace banner and under an editor:

> That text is too long for one action. Split it into smaller cards, or paste it into a card in parts.

- `execute` returns `undefined` for a refusal, so the compose field keeps its draft and is editable again. Callers that word their own messages (Goals copy, move, Undo and Redo) say nothing more (`src/ui/workspaceUi.tsx:155-171`).
- Removing Goals lines reports the same sentence instead of "Nothing removed" (`workspaceUi.tsx:138-144`, `src/ui/Goals.tsx:160`).
- An editor action shows it under the editor and stays editable; Retry and Discard stay hidden (`src/editor/admittedEditor.ts:44-63`).

## Which commands split and which are refused

| Command | Over 16 KiB | Why |
|---|---|---|
| Compose | split | It is new text, like a paste into a card. |
| Duplicate, Done for now | refused | Splitting leaves a copy missing its tail. |
| Merge into the previous card | refused | Splitting leaves half a merge. |
| Split a card | refused | Splitting leaves the tail partly moved. |
| Copy or move Goals lines into cards | refused | A partial copy, or lines removed from Goals before their cards are whole. |
| Next to Goals | refused | Text half appended to Goals with the cards already removed. Filing one unfiled card to Goals takes the same refusal; it is not tested, because a test cannot easily make a long unfiled card. |
| Undo, Redo | refused | They restore stored history; there is nothing to slice. |
| Formatting many lines, deleting a fragmented range | refused | One CodeMirror change; a partial result is a different edit. |

**A split compose, as a paste into a card already behaves:**
- **Crash between slices.** Every slice is written to content storage before the next is prepared. A crash keeps the card with its saved slices and loses the rest, which existed only in the page (tested: a crash during the third slice reopens with the first 2,000 units).
- **Undo.** One Undo removes the whole card. Redo of a card over 16 KiB is refused with the sentence, exactly as Redo of a long paste now is; before, both stalled.
- **Another device.** Each slice is its own update, so another device sees the card appear with its first slice and grow until it is whole and identical (tested, slice by slice).

**Multi-byte text.** All sizes are bytes. Slices protect UTF-16 surrogate pairs (one code point), not grapheme clusters. A combining mark or a ZWJ emoji sequence can therefore be divided between two slices: another device can briefly show a broken glyph, and the final text is identical (tested with emoji at every boundary, combining accents and family emoji).

## The new ceiling

One compose or paste carries at most 1,048,576 UTF-16 units of text, and at most a 2,088,960-byte encoded intent: about 2.09 million single-byte characters or 696,000 three-byte characters, whichever binds first. At the bound the action is refused before queueing with the sentence above; it is never a stall. Below it a long compose saves in 1,000-unit slices, each a separate content write, so the time grows with length (measured below). Everything that does not split is refused once its single update would exceed 16 KiB.

## A device already stuck when it updates

**The stuck input does not survive a reload.**
- An oversized input is held only in the admission queue's memory. It was never journalled, because preparation failed before sealing. Closing the owner rejects and erases it.
- Tested: the queue state is rebuilt with an adapter returning an oversized update, then closed. Nothing was written. The updated build opens active over the same storage and saves the same 20 KiB text, split.
- In the browser on the phase 547 build, a stuck 200,000-character compose was reloaded: no card, no pending input and an empty compose field; a small card then saved and arrived.

**What the person must do to update.** On the old build, "Reload to update" first waits for durability, which refuses while the queue is blocked (`admissionQueue.ts:1219-1223`), so the update notice says "The app could not update…". The person must press Discard pending input, which keeps the draft in the compose field (tested in the browser), or close every window. The draft is lost on reload unless copied. The updated build cannot help a page that is still running the old build.

## Tests

New:
- `test/oversizedActions.test.ts`: 286 cases.
  - Each command above at just under the limit (15,000 bytes; 6,000 for indenting), just over (16,500), 64 KiB and 200 KiB, in single-byte and three-byte text, across the reference, local-snapshots and account-text preparations. Each ticket must settle within 4 s and the queue must stay active, then a following card must save.
  - The split-compose cases: bound and slice sizes, surrogate pairs and graphemes, two-device convergence, Undo and Redo, crash between slices.
  - Fragmented deletion, the one-action ceiling, and the already-stuck device.
  - Large starting documents are built directly, not through admission, so only the action under test is admitted. The file runs in about 30 s.
- `test/oversizedActionsUi.test.tsx`: 4 cases.
  - The compose field keeps its draft and says the text is too long for a refused result and for the ceiling.
  - Goals line removal.
  - An editor action.

**On the phase 547 source** ([base-tree runs](./base-tree-runs.txt); the new `actionSize.ts` constants were added so the files load):
- 224 of the 290 cases fail and 66 pass. The 66 are the "just under" cases: 60 for the refusal group, which already fit, and 6 for the 15,000-byte composes, which fitted in one update before this phase.
- Every over-limit command case fails with "Ticket did not settle" (the queue blocked).
- The split-compose, fragmented-deletion and stuck-device cases time out on the stalled compose.
- The ceiling case fails with "expected function to throw".
- The four UI cases fail on the cleared draft, the "Check storage" sentence, a `true` result and an empty editor message.

**Mutation controls** ([mutation-controls.txt](./mutation-controls.txt), each applied alone to a copy of the final tree):

| Removed piece | Result |
|---|---|
| the adapter's refusal | 6 of 6 "duplicate just over" fail (stall) |
| compose splitting | 6 of 6 "compose just over" fail |
| the open undo step | 6 of 6 "compose 64 KiB" fail (Undo leaves a partial card) |
| keeping the compose result through slices | 6 of 6 "compose 200 KiB" fail |
| the ceiling before queueing | 3 of 3 ceiling cases fail |
| the direct path's size guard | the account-text fragmented deletion stalls |
| ownership after the size check | 60 of 88 local-snapshots cases fail |
| `execute`'s handling of a refused result | 1 UI case fails |
| `execute`'s handling of the ceiling | 1 UI case fails |
| the editor's message | 1 UI case fails |
| the Goals removal message | 1 UI case fails |

The direct-path guard was first run against the file without the fragmented deletion and nothing failed. That case was added because of it.

## Browser runs, before and after

[Raw output](./browser-runs.txt). The service was started the production way in a copy, with two paired devices. A composes each card; the run times it until the compose field clears and checks it arrives on B; both exports are compared at the end.

Host load average 4.3 to 6.8 during both runs. Another session's Playwright run was active on this Mac.

| Card | Before: saved? | Before: what the page shows | After: time to save | After: on device B |
|---|---|---|---|---|
| 5,000 single-byte | yes, 21 ms | | 24 ms | 0.8 s |
| 15,000 single-byte | yes, 146 ms | | 248 ms (split) | 1.1 s |
| 17,000 single-byte | no; still waiting at 90 s | "Input is waiting for storage." | 370 ms | 1.2 s |
| 5,500 three-byte (16.5 KB) | no; still waiting at 90 s | same | 141 ms | 1.0 s |
| 200,000 single-byte | no; still waiting at 90 s | same | 14.5 s | 14.9 s |
| 70,000 three-byte (210 KB) | no; still waiting at 90 s | same | 3.7 s | 5.7 s |

**Before (phase 547 build):**
- Each stalled card kept its draft. Discard pending input left the draft in an editable field, with "That action was not saved. Check storage and try again.".
- Reloading the page stuck on the 200,000-character card brought it back with no card, no pending input, an empty compose field and no status line.
- After each stall a small card saved and reached B.

**After:**
- Every card saved and reached B.
- Once B finished receiving, both devices' exports were identical (312,711 bytes).
- The first after run compared the exports while B was still receiving the last card's slices. It found B short of that card only; it is kept in the raw output, and the spec now exports again until B matches.

**Saving at the ceiling, in Node** ([ceiling-probe.txt](./ceiling-probe.txt), account-text preparation, in-memory carrier): 1,048,576 single-byte characters saved whole in 113.8 s, as 1,049 slices whose largest update was 1,396 bytes. 696,000 three-byte characters, just under the encoded-intent bound, had not finished after about 23 minutes and was stopped. Each slice prepares against a fork of the whole document and re-encodes the remaining intent, so the cost grows with the square of the length. The browser figures above show 200 KB saving in 4 to 15 s.

**So the ceiling is a clean refusal, but long before it a save is too slow to be usable.** "Waiting to save…" can show for minutes while the queue works. Pastes into a card have had the same bound and the same cost all along. A lower one-action bound (for example 256 KiB, about 15 s in the browser here) would be a new limit, so it is left for an operator decision.

## Runs on the final tree (this seat)

- **New and neighbouring tests:** 30 files, 843 cases (842 passed and 1 existing skip), in 36 s. The two new files were run again after the last test edit: 290 of 290.
  - New: `oversizedActions`, `oversizedActionsUi`.
  - Importers of `admittedWorkspace`: `workspaceAdmission`, `doneForNow`, `cardGoalsContextAdmission`, `membershipEligibility`, `pendingProjection`, `sourceCapture`, `workspaceBridge`, `localAppStartup`.
  - Importers of `workspaceCommands`: `selectionHistory`, `selectionSnapshots`.
  - The queue and its preparation: `admissionQueue`, `workspacePreparation`.
  - UI and editor: `workspaceUiStatus`, `unfiledPanel`, `goals`, `compose`, `admittedEditorProjection`, `admittedClipboard`, `admittedText`.
  - Compose and the undo-step helper used across `moves`: `moves`, `cap`, `cardArrival`, `cardGoalsContext`, `sections`, `freeze`, `attribution`, `convergence`, `multiDevice`.
  - Left out: browser specs that import `admittedWorkspace` (`test/local-baseline/*.spec.ts`, the inbound-continuation driver) and the local-app editor specs that pin "Input is waiting for storage.", whose storage-refusal path is unchanged.
- `pnpm typecheck`; `oxfmt --check` and `oxlint` on every changed source and test file.
- The nine adapter files from CI: 178 of 178.
- `pnpm validation:inventory`: 10 of 10.
- `pnpm account:crypto-prep`: 6 of 6.
- At review, on the final tree: the full unit suite (`pnpm test --maxWorkers=1`), 349 files, 3,641 passed and 1 existing skip, in 321 s; then `pnpm typecheck`, `pnpm build`, the ten contract checks, the inventory and plan checks, `pnpm account:crypto-prep`, the nine adapter files, the packaged-application routing tests (`test/account-application/*.test.mjs`) and `pnpm trace:check`.

**Bookkeeping** per [development.md](../../../development.md#release-bookkeeping):
- Both new files join the reviewed Vitest selection. The case denominator moves from 2,711 to 3,001, the reviewed files from 112 to 114, the general stages from 297 to 299 and the reviewed Vitest stages from 131 to 133.
- The planning inventory moves to 1,122 obligations, with 555 unresolved as before.
- The runtime census adds `src/crdt/actionSize.ts` and new hashes for five changed sources.
- No changed line adds a domain label or a cryptographic call and no label site moved, so the construction registry is unchanged.
- Every string literal of 16 or more characters in `vite/`, `test/` and `scripts/` that occurs in the base versions of the six edited sources occurs the same number of times now (31 checked). "Split the input source before admission." is gone; it occurred nowhere under those directories.

## Limits

- Timings are Node with an in-memory carrier, or headless Chromium on a shared Mac with other agents' browser tests running; host load is recorded with each run.
- No device was used.
- The browser run measures compose only; the refusal group and Undo are covered by unit tests over the real workspace and admission owner.
- A ZWJ sequence can still be divided between slices: the text is identical once all slices arrive, but not while they do.
- Copying many short Goals lines whose total exceeds 16 KiB is refused, although it could be split per card; that is left for a later decision.
- Saving near the one-action ceiling takes minutes (above); the ceiling itself is not lowered here.
- Redo of a card or paste over 16 KiB is refused, so undoing a long card cannot be redone; the text is gone unless the person still has it elsewhere.
- No deployment.

[Identities and results](./evidence.json).
