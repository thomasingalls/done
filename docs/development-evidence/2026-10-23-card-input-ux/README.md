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
