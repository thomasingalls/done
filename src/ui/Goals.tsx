/**
 * Goals — the master list (PRD §7.1, §7.3).
 *
 * A document, freely structured, with no date attached, and it **never freezes**
 * (PRD §6). Everything lives here: tasks, projects, someday-maybes, notes to
 * self. Nesting is allowed and never required.
 *
 * The one flow out of it is deliberately two steps (PRD §4): **copy to** places
 * a copy in a day's collection and leaves master alone; **remove** is a separate
 * action that deletes the lines. They are never one action, and the shape of
 * this footer is that rule made visible.
 */

import { useEffect, useRef, useState } from 'react';
import { type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  NEXT_CAP,
  copyFromMaster,
  removeFromMaster,
  type Section,
  type Store,
  type Workspace,
} from '../crdt';
import { createEditor, type EditorHandle } from '../editor/createEditor';
import type { ISODate } from '../lib/date';

export interface GoalsProps {
  store: Store;
  workspace: Workspace;
  /** Copies land on the day in view, which is the one the user is looking at. */
  date: ISODate;
  ref?: React.Ref<HTMLElement>;
}

interface Selection {
  /** Zero-based, the form the text operations take. */
  lines: number[];
  text: string[];
}

const EMPTY: Selection = { lines: [], text: [] };

export const selectedLines = (state: EditorState): Selection => {
  const numbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    // Selection ranges are half-open. If a non-empty selection ends exactly at
    // the next line's start, none of that line is selected and Copy/Remove must
    // not include it.
    const inclusiveEnd = range.empty ? range.to : Math.max(range.from, range.to - 1);
    const last = state.doc.lineAt(inclusiveEnd).number;
    for (let line = first; line <= last; line++) numbers.add(line);
  }
  const lines = [...numbers].sort((a, b) => a - b);
  return {
    lines: lines.map((line) => line - 1),
    text: lines.map((line) => state.doc.line(line).text),
  };
};

export const Goals = ({ store, workspace, date, ref }: GoalsProps): React.ReactElement => {
  const host = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY);

  // A ref because the editor is built once and the binding inside it must not
  // capture the props of the render that happened to build it.
  const copyTo = useRef<(section: Section, lines: readonly string[]) => void>(() => {});
  copyTo.current = (section, lines) => void copyFromMaster(workspace, { date, section }, lines);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const track: Extension = EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) setSelection(selectedLines(update.state));
    });

    const handle: EditorHandle = createEditor({
      parent,
      text: store.master,
      awareness: store.awareness,
      undo: store.undo,
      origin: workspace.origin,
      placeholder: 'Everything. Tasks, projects, someday-maybes, notes to self.',
      extra: [
        track,
        keymap.of([
          {
            key: 'Mod-Shift-c',
            preventDefault: true,
            run: (view) => {
              copyTo.current('next', selectedLines(view.state).text);
              return true;
            },
          },
        ]),
      ],
    });
    setSelection(selectedLines(handle.view.state));

    return () => handle.destroy();
  }, [store, workspace.origin]);

  const count = selection.text.filter((line) => line.trim().length > 0).length;
  const disabled = count === 0;

  return (
    <aside className="goals" aria-label="Goals" ref={ref}>
      <header className="panel-header">
        <h2 className="panel-title">Goals</h2>
      </header>

      <div className="goals-body">
        <div className="editor-host" ref={host} />
      </div>

      <footer className="goals-actions">
        <span className="goals-hint">
          {disabled ? 'Put the cursor on a line to copy it out.' : `${count} selected`}
        </span>
        <button
          type="button"
          className="card-action"
          disabled={disabled}
          title={`Copy to Next — at most ${NEXT_CAP}`}
          onClick={() => copyTo.current('next', selection.text)}
        >
          To Next
        </button>
        <button
          type="button"
          className="card-action"
          disabled={disabled}
          title="Copy to Scheduled on the day in view"
          onClick={() => copyTo.current('scheduled', selection.text)}
        >
          To Scheduled
        </button>
        <button
          type="button"
          className="card-action"
          disabled={disabled}
          title="Copy to Done"
          onClick={() => copyTo.current('done', selection.text)}
        >
          To Done
        </button>
        {/*
         * Separate, and never bundled with a copy (PRD §4). Clearing completed
         * items from the master list is manual only — there is no auto-archive.
         */}
        <button
          type="button"
          className="card-action card-action-danger"
          disabled={disabled}
          title="Delete the selected lines from the master list"
          onClick={() => void removeFromMaster(workspace, store.master, selection.lines)}
        >
          Remove
        </button>
      </footer>
    </aside>
  );
};
