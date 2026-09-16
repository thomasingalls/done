/** Synchronous semantic text commands shared by the text and workspace adapters. */
import { EditorSelection, findClusterBreak, type StateCommand } from '@codemirror/state';
import {
  undo,
  redo,
  indentMore,
  indentLess,
  insertNewline,
  moveLineUp,
  moveLineDown,
} from '@codemirror/commands';
import { deleteMarkupBackward } from '@codemirror/lang-markdown';
import { continueList } from './keymap';
import {
  toggleBold,
  toggleItalic,
  toggleInlineCode,
  toggleStrikethrough,
  toggleTask,
} from './commands';
import type { TextAction } from './admittedText';
const deleteCluster =
  (forward: boolean): StateCommand =>
  ({ state, dispatch }) => {
    const spec = state.changeByRange((range) => {
      let from = range.from,
        to = range.to;
      if (range.empty) {
        const line = state.doc.lineAt(from);
        const next = forward
          ? from === line.to
            ? Math.min(state.doc.length, from + 1)
            : line.from + findClusterBreak(line.text, from - line.from, true)
          : from === line.from
            ? Math.max(0, from - 1)
            : line.from + findClusterBreak(line.text, from - line.from, false);
        from = Math.min(from, next);
        to = Math.max(to, next);
      }
      return { changes: { from, to }, range: EditorSelection.cursor(from) };
    });
    dispatch(state.update(spec, { userEvent: forward ? 'delete.forward' : 'delete.backward' }));
    return true;
  };
export const textCommands: Record<Exclude<TextAction['name'], 'insert'>, StateCommand> = {
  backspace: (target) => deleteMarkupBackward(target) || deleteCluster(false)(target),
  delete: deleteCluster(true),
  moveLineUp,
  moveLineDown,
  enter: (target) => continueList(target) || insertNewline(target),
  indent: indentMore,
  outdent: indentLess,
  bold: toggleBold,
  italic: toggleItalic,
  code: toggleInlineCode,
  strike: toggleStrikethrough,
  task: toggleTask,
  undo,
  redo,
};
