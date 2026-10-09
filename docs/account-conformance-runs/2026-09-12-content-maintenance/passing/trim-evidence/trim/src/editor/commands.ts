/**
 * Editor commands (TRD §5.4).
 *
 * These are `StateCommand`s wherever possible: they need state and dispatch,
 * not layout, which keeps them testable without a rendered view.
 */

import {
  type ChangeSpec,
  EditorSelection,
  type EditorState,
  type Line,
  type StateCommand,
} from '@codemirror/state';
import type { Command, EditorView } from '@codemirror/view';

/** `- [ ] `, `* [x] `, `1. [ ] ` — the list marker plus a task box. */
export const TASK_ITEM = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;
/** `- `, `* `, `1. ` — a list marker with no task box. */
export const LIST_ITEM = /^(\s*(?:[-*+]|\d+[.)])\s+)/;

/**
 * The change that toggles, adds, or promotes the task box on one line.
 * Returns null only for a line nothing sensible can be done to.
 */
export const taskChangeForLine = (line: Line): ChangeSpec | null => {
  const task = TASK_ITEM.exec(line.text);
  if (task) {
    const at = line.from + (task[1] as string).length + 1;
    return { from: at, to: at + 1, insert: task[2] === ' ' ? 'x' : ' ' };
  }

  const list = LIST_ITEM.exec(line.text);
  if (list) {
    return { from: line.from + (list[0] as string).length, insert: '[ ] ' };
  }

  const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
  return { from: line.from + indent, insert: '- [ ] ' };
};

/** Click-to-toggle. Deliberately leaves the selection where it was. */
export const toggleTaskAt = (view: EditorView, pos: number): boolean => {
  const change = taskChangeForLine(view.state.doc.lineAt(pos));
  if (!change) return false;
  view.dispatch({ changes: change, userEvent: 'input.toggle-task' });
  return true;
};

/** Keystroke-to-toggle, across every line the selection touches. */
export const toggleTask: StateCommand = ({ state, dispatch }) => {
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const change = taskChangeForLine(state.doc.line(n));
      if (change) changes.push(change);
    }
  }
  if (changes.length === 0) return false;
  dispatch(state.update({ changes, userEvent: 'input.toggle-task' }));
  return true;
};

/**
 * Idempotent wrapping (TRD §5.4). Pressing the binding twice returns the
 * document *and* the selection to where they started, which is the part that
 * usually gets missed: leaving the selection over the markers means the second
 * press wraps again instead of unwrapping.
 */
export const toggleWrap = (marker: string): StateCommand => {
  const len = marker.length;
  return ({ state, dispatch }) => {
    let acted = false;

    const spec = state.changeByRange((range) => {
      let { from, to } = range;
      if (from === to) {
        const word = state.wordAt(from);
        if (word) {
          from = word.from;
          to = word.to;
        }
      }

      const before = state.doc.sliceString(Math.max(0, from - len), from);
      const after = state.doc.sliceString(to, Math.min(state.doc.length, to + len));

      // Already wrapped from the outside — unwrap.
      if (before === marker && after === marker) {
        acted = true;
        return {
          changes: [
            { from: from - len, to: from },
            { from: to, to: to + len },
          ],
          range: EditorSelection.range(from - len, to - len),
        };
      }

      // The selection includes the markers — unwrap from the inside.
      const inner = state.doc.sliceString(from, to);
      if (inner.length >= len * 2 && inner.startsWith(marker) && inner.endsWith(marker)) {
        acted = true;
        return {
          changes: [
            { from, to: from + len },
            { from: to - len, to },
          ],
          range: EditorSelection.range(from, to - len * 2),
        };
      }

      acted = true;
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range: EditorSelection.range(from + len, to + len),
      };
    });

    if (!acted) return false;
    dispatch(state.update(spec, { userEvent: 'input.format', scrollIntoView: true }));
    return true;
  };
};

export const toggleBold = toggleWrap('**');
export const toggleItalic = toggleWrap('*');
export const toggleStrikethrough = toggleWrap('~~');
export const toggleInlineCode = toggleWrap('`');

/**
 * Escape leaves the editor. On desktop this is the way out of the Tab-indent
 * trap; in Phase 2 it is also what unmounts a card editor back to static.
 */
export const blurEditor: Command = (view) => {
  view.contentDOM.blur();
  return true;
};

/** Exposed for tests: the word-expansion rule the wrap commands use. */
export const wordAround = (state: EditorState, pos: number): { from: number; to: number } | null =>
  state.wordAt(pos);
