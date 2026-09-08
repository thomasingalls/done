export const cases = [
  ['E11.repair', 'Known journal damage disables ordinary editor and export'],
  ['E12.multicaret', 'Native input and admitted delete preserve multiple selections'],
  ['E09.pending-death', 'Renderer death before forced commit loses only the unaccepted input'],
  ['E10.checkbox', 'The actual task-box widget submits an admitted command'],
  ['E01.typing', 'Real typing, formatting, undo and export share the accepted boundary'],
  [
    'E02.pressure',
    'Refused native typing and paste stay private through a failed commit and retry',
  ],
  ['E03.remote', 'Remote content commits before text and history rebasing'],
  ['E04.cross-tab', 'Actual BroadcastChannel receive commits before a dependent edit'],
  ['E05.paste', 'Unicode paste slices and accepted undo retain a cold-recoverable prefix'],
  ['E06.composition', 'Blink composition commit passes through admission'],
  ['E07.close', 'Close clears the visible surface and refuses ordinary export'],
  ['E08.profile', 'Record full-clone preparation scaling on this browser host'],
].map(([id, title]) => ({ id, title }));
export const mutants = [
  {
    id: 'history-before-receipt',
    file: 'src/editor/admittedText.ts',
    case: 'E02.pressure',
    assertion: 'pending-not-in-history',
    from: 'candidate = transaction?.state ?? state;',
    to: 'candidate = transaction?.state ?? state; accepted = candidate;',
  },
  {
    id: 'ordinary-view-before-receipt',
    file: 'src/editor/admittedEditor.ts',
    case: 'E02.pressure',
    assertion: 'pending-not-in-editor',
    from: "return input({ name: 'insert', text: inserted }, at);",
    to: "view.update([view.state.update({changes: {from, to, insert: inserted}})]); return input({ name: 'insert', text: inserted }, at);",
  },
  {
    id: 'remote-in-undo',
    file: 'src/editor/admittedText.ts',
    case: 'E03.remote',
    assertion: 'undo-preserves-remote',
    from: 'Transaction.addToHistory.of(false)',
    to: 'Transaction.addToHistory.of(true)',
  },
];
