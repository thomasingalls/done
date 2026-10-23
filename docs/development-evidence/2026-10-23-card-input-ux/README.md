# Card focus, mobile quick entry and duplication

2026-10-23. Active bounded work after immutable UX patches 37–41 (base commit
`c4a66c79ddfc924c4c1f9b978428f544b16b4a61`; cumulative tree
`5eb2840f2df03dca52639c161baa3b0aad3444d3`). This packet owns this workstream;
`docs/progress.md` belongs to another seat. No merge or deployment is authorized.

## Contracts and exit conditions

- **42 — Leaving an automatically focused card.** Reproduce outside blur after a split/merge;
  close the editor without stealing focus or losing accepted writing. Preserve internal action
  keyboard navigation, explicit Enter/Escape and frozen/Done protections.
- **43 — Mobile quick entry.** Investigate invisible text separately from keyboard composition
  confirmation. Preserve multiline entry and accepted-only, durable submission. A synthetic
  composition counterexample establishes only that sequence, not the cause of the operator’s
  intermittent Android observation; physical-device confirmation remains distinct.
- **44 — Duplicate to Scheduled.** Add an admitted, undoable copy from each live card section
  on a writable day, with identical multiline text and new identity, retaining the source.
  Preserve the Next cap, Done’s source-edit protection and frozen-day policy.

Choose evidence before repair, retain failed attempts, append outcomes to completed.md before
advancing this active checkpoint. Keep patches 37–41 immutable and prepare sequential patches.

## Phase42 outcome

Eight counterexamples fail against cumulative patch41: four split/merge × outside click/action Tab
sequences in two layout projects. Outside click can briefly appear successful before focus is reclaimed
while typing. The repair clears the parent’s request on both editor blur and action-to-outside blur.
Internal focus is preserved; Enter/Escape still return to the static card. Combined focus/task run:
24 passed,2 existing platform skips; card-command unit cases, TypeScript and focused lint pass.

Initial reference launch rejected an invalid abbreviated build revision; corrected to the full base
revision with dirty suffix. A premature candidate start encountered the reference’s still-owned port;
rerun only after reference completion. Both failed logs are retained. Mac bindings are driven under a
Mac platform/UA in desktop and mobile layouts; this is not a physical Gboard keyboard result.

Phase42 exit recorded in completed.md. Active work advances to the quick-entry investigation.

## Phase43 outcome and unresolved observation

The operator identified Gboard but deliberately declined to guess a trigger; suggestion taps also work
normally. The native textarea keeps ordinary/composing input visible in the exercised sequences.
A separate bug is demonstrated: Enter with native isComposing, legacy keyCode229 or tracked composition
is wrongly cancelled and submits/clears the draft. Three of five baseline unit cases fail; all four
browser counterexamples fail at the IME-owned key. The repaired six unit cases pass, as do four browser
journeys using real Chromium preedit events via CDP plus an explicit composing key event. Final unit
coverage also releases a cancelled session on blur. TypeScript and focused lint pass.

The first attempt to copy the unit fixture used the reference working directory by mistake; that copy
failed and the reference lacked explicit valid build metadata. The corrected run copies the new test
by absolute path and provides full metadata. No product conclusion rests on that launch attempt.

The tests establish composition handling, drafts across rerenders, pending/refused submissions, Shift-Enter
and saved-card reopen. Chromium CDP is not Gboard on a phone. UX-13 remains open; the focus repair may
remove one overlapping symptom but no cause is asserted. Phase43 exit is recorded in completed.md.
Active work advances to Duplicate.

## Phase44 outcome

The semantic command identifies the source, reads its accepted predecessor at execution and calls
existing compose into same-day Scheduled with source ID provenance. The source is unchanged, the copy
has a new identity/current actor, and discrete undo, freeze and storage admission are reused.
Locked Done exposes Duplicate without exposing guarded move controls. Frozen/archived cards remain static.

Twenty new positive unit counterexamples fail against patch41; five refusal controls already pass.
Twenty-five new cases pass across reference, local-handoff, local-snapshots, account-snapshots and
account-text preparation. Full workspace file:238 passed/1 existing named skip (239 total). Cases
check exact multiline/trailing text, source identity, undo/redo, replay of carrier bytes, queued edits
before duplication, no speculative publication, full Next and freeze after a queued predecessor.
All six desktop/mobile-layout browser cases fail at the absent button on the reference, then pass
with the repair, testing independent editing and undo/reopen. Type/lint/format pass. Removing only
the newly added describe block reproduces the old workspace test file byte for byte.

Phase44 exit recorded in completed.md. Active work advances to combined validation and inventory
freshness. Formal release qualification remains paused; these checks do not assign new credit.

## Phase45 combined validation and handoff

- Full Vitest:159 files,1914 passed,1 existing named skip (1915 total).
- Full production-frontend geometry:150 passed,24 existing platform skips (174 total), one worker/no retries.
- TypeScript, Yjs patch check, Vite production build,232.7/350kB initial-JS gzip budget,
 57-file origin-isolation check and affected formatting pass.
-27 adapter/inventory cases pass. The old general census failed at2511 vs2536 and changes only
 two exact values/title words. Removing the new workspace describe restores every old source byte.

Planning inventory first correctly refused stale inputs. The first review mistakenly expected runtime
source hashes in a graph that inventories tests/planning inputs; that review failed before regeneration.
The corrected independent review checks exactly four new required test files, their six changed/new
input hashes, four workspace declaration sites and115-line property-location shifts. All other fields,
existing dispositions and blocks remain. The four new files receive no aggregate credit:887 obligations/
343 unresolved; formal qualification remains paused. Runtime identity is separately recorded against
356 source files in the phase44 tree and110 built files.

The read-only preview preflight first tried incorrect GET config routes, then the actual POST route
without its required Origin. Both failed before any gateway stop. After reading the application route
contract, the correct same-origin public-config request matched its original hash. The frontend
gateway alone was replaced; API PID52585 and its data remained running. Normal TLS checks verify60
built assets plus two deep links; fresh Chromium1280/420 contexts check merge/outside focus, composing
quick entry and Duplicate with no page errors. No existing browser profile/account was used.

Preview: https://mbp.tail0e0d4.ts.net:8443, Version c4a66c79-dirty, worker bbdf2a6c9379. The visible
version label is unchanged for this cumulative uncommitted source; the service-worker content changed.
Use the sidebar update or a normal reload to adopt it. Original preview build is retained for rollback.

Phase45 exit is recorded in completed.md. The patch sequence is prepared and verification checks its
exact replay/cumulative tree without changing the real Git index. Nothing is committed, pushed or
deployed to production. UX-13’s physical Android/Gboard observation remains open.

## Reproduction

Use the installed Node24 runtime and repository dependencies; no package install/lockfile change was
needed. `reproduction/playwright.card-input.config.ts` selects isolated Vite source/reference41;
`playwright.card-input-built.config.ts` serves the production build. All contexts are disposable.
The inventory review takes the prior planning snapshot as its first argument (extract the snapshot
from patch41’s resulting tree) and compares it with the current source. Absolute scratch paths in
these configs identify this run and need replacement on another machine. Logs/receipts retain
failed attempts; a passing rerun does not erase them.
