export const cases = [
  {
    id: 'L01.success',
    title:
      'Explicit clear removes content, journal, every opener and index, retaining only the terminal marker',
  },
  {
    id: 'L02.blocked',
    title: 'Blocked native content deletion retains the writer permit and every later carrier',
  },
  {
    id: 'L03.refused',
    title: 'Refused content deletion leaves journal, custody and index untouched',
  },
  ...[
    'intent',
    'content-delete',
    'stage-journal',
    'stage-custody',
    'stage-index',
    'index-delete',
    'stage-cleared',
  ].map((boundary, i) => ({
    id: `L${String(i + 4).padStart(2, '0')}.kill-${boundary}`,
    title: `Renderer death after ${boundary} resumes authenticated cleanup`,
    boundary,
  })),
  {
    id: 'L11.journal',
    title: 'Partial and refused journal deletion retain openers and resume after death',
  },
  {
    id: 'L12.aborts',
    title:
      'Aborted intent, custody cleanup and index removal remain resumable at their prior stage',
  },
  {
    id: 'L13.factor',
    title: 'After removing content openers, only the valid factor can finish index cleanup',
  },
  {
    id: 'L14.guards',
    title: 'Pending intent blocks low-level key access, ordinary open and new genesis',
  },
  {
    id: 'L15.lifetime',
    title: 'Clear waits for a live writer and preserves unrelated Local state',
  },
  {
    id: 'L16.recheck',
    title: 'Stale targets and unknown references refuse before destructive work',
  },
  {
    id: 'L17.cancel',
    title: 'Cancellation during blocked native deletion drains before permit release',
  },
];
export const mutants = [
  {
    id: 'blocked-as-success',
    file: 'src/crdt/localClearStorage.ts',
    case: 'L02.blocked',
    assertion: 'blocked-delete-not-complete',
    from: 'if (!task.signal.aborted) blocked();',
    to: 'if (!task.signal.aborted) blocked(); resolve();',
  },
  {
    id: 'journal-before-content',
    file: 'src/crdt/localClear.ts',
    case: 'L03.refused',
    assertion: 'delete-refusal-keeps-journal',
    from: "await deleteLocalContent(task, record.target, () => notify(options, 'content', true));",
    to: "removeLocalJournal(task, record.target); await deleteLocalContent(task, record.target, () => notify(options, 'content', true));",
  },
  {
    id: 'retain-genesis-opener',
    file: 'src/crdt/localClearStorage.ts',
    case: 'L01.success',
    assertion: 'terminal-has-no-content-openers',
    from: 'for (const row of remove) {',
    to: "for (const row of remove.filter(r => !(Array.isArray(r.key) && r.key[1] === 'local-genesis-v1'))) {",
  },
  {
    id: 'skip-resume-authentication',
    file: 'src/crdt/localClear.ts',
    case: 'L13.factor',
    assertion: 'wrong-factor-cannot-finish-keyless-clear',
    from: 'await auth.verify(record);',
    to: ';',
  },
  {
    id: 'allow-component-open',
    file: 'src/crdt/custody.ts',
    case: 'L14.guards',
    assertion: 'component-refuses-before-key-access',
    from: 'await assertNoLocalClear(task, a.slotId);',
    to: ';',
  },
];
