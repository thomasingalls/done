/**
 * The daily journal (PRD §3).
 *
 * A document, not a collection: the unit of interaction is the whole text, and
 * strong structure would make it worse. It records *what actually got done*,
 * which is often not lifted from anywhere — so nothing here tries to relate it
 * to the master list, except the one explicit promote action PRD §4 asks for.
 *
 * It stays editable indefinitely, including on frozen days (PRD §6): the freeze
 * protects commitment records from retroactive editing, not the prose.
 */

import { useEffect, useRef } from 'react';
import { type Extension } from '@codemirror/state';
import { type Command, type EditorView, keymap } from '@codemirror/view';
import {
  dayAt,
  ensureDay,
  journalOf,
  promoteJournalLine,
  type Store,
  type Workspace,
} from '../crdt';
import { createEditor, type EditorHandle } from '../editor/createEditor';
import { renderStatic } from '../editor/staticRender';
import type { ISODate } from '../lib/date';
import { useYWatch } from './useYjs';

export interface JournalProps {
  store: Store;
  workspace: Workspace;
  date: ISODate;
  /** Only the day in focus mounts an editor (TRD §8.1). */
  active: boolean;
}

export const Journal = ({ store, workspace, date, active }: JournalProps): React.ReactElement => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // Read for the static render; the mounted editor gets its content from the
  // binding, not from here.
  const text = useYWatch(store.days, () => journalOf(dayAt(store.doc, date))?.toString() ?? '');

  const promoteCurrentLine = (): void => {
    const editor = view.current;
    if (!editor) return;
    const line = editor.state.doc.lineAt(editor.state.selection.main.head).number - 1;
    promoteJournalLine(workspace, store.master, date, line);
  };

  useEffect(() => {
    const parent = host.current;
    if (!parent || !active) return;

    /*
     * Materialising the day here is the one place this design pays for lazy
     * days. A `Y.Text` has to exist before an editor can bind to it, so the day
     * you are *looking at* is created even if you never type — while days you
     * never navigate to still occupy nothing, which is the property TRD §4.2
     * was protecting. The alternative, binding on the first keystroke, loses
     * that keystroke or needs a second editor to catch it.
     */
    const day = ensureDay(store.doc, workspace.systemOrigin, date);
    const journal = journalOf(day);
    if (!journal) return;

    const promote: Command = () => {
      promoteCurrentLine();
      return true;
    };

    const extra: Extension[] = [
      keymap.of([{ key: 'Mod-Shift-m', run: promote, preventDefault: true }]),
    ];

    const handle: EditorHandle = createEditor({
      parent,
      text: journal,
      awareness: store.awareness,
      undo: store.undo,
      origin: workspace.origin,
      // The day body is the scrolling region (TRD §8.2), so the journal grows
      // with its content rather than scrolling inside itself. That is the same
      // shape a card has, and therefore the same theme.
      surface: 'card',
      placeholder: 'What got done today?',
      extra,
    });
    view.current = handle.view;

    return () => {
      handle.destroy();
      view.current = null;
    };
    // `promoteCurrentLine` reads refs and props that are stable for a mounted
    // day; rebuilding the editor when it changes identity would be a re-mount
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, date, store, workspace.origin]);

  useEffect(() => {
    if (active) return;
    const parent = host.current;
    if (parent) renderStatic(parent, text);
  }, [active, text]);

  return (
    <section className="journal" aria-label="Journal">
      <h2 className="collection-heading">
        <span>Journal</span>
        {active && (
          <button
            type="button"
            className="collection-action"
            title="Promote the current line to the master list"
            onClick={promoteCurrentLine}
          >
            To master
          </button>
        )}
      </h2>
      <div className={active ? 'journal-host' : 'journal-host md-render'} ref={host} />
    </section>
  );
};
