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

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { NEXT_CAP, type Section } from '../crdt/days';
import { useWorkspaceUi } from './workspaceUi';
import {
  documentHeadings,
  scrollAwareBreadcrumb,
  type DocumentHeading,
} from '../editor/breadcrumbs';
import type { ISODate } from '../lib/date';
import { GoalsOutline } from './GoalsOutline';

export interface GoalsProps {
  /** Copies land on the day in view, which is the one the user is looking at. */
  date: ISODate;
  ref?: React.Ref<HTMLElement>;
  /** Lets the shell coordinate focus with the narrow panel's snap animation. */
  onEditorReady?: (view: EditorView | null) => void;
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

export const Goals = ({ date, ref, onEditorReady }: GoalsProps): React.ReactElement => {
  const { execute, mountEditor, removeMasterLines } = useWorkspaceUi();
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const outlineTrigger = useRef<HTMLButtonElement>(null);
  const outlinePanel = useRef<HTMLElement>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY);
  const [headingPath, setHeadingPath] = useState<readonly DocumentHeading[]>([]);
  const [headingOutline, setHeadingOutline] = useState<readonly DocumentHeading[]>([]);
  const [outlineOpen, setOutlineOpen] = useState(false);

  // A ref because the editor is built once and the binding inside it must not
  // capture the props of the render that happened to build it.
  const copyTo = useRef<(section: Section, lines: readonly string[]) => void>(() => {});
  copyTo.current = (section, lines) => void execute({ kind: 'copy', to: { date, section }, lines });

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const track: Extension = EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) setSelection(selectedLines(update.state));
    });

    const handle = mountEditor(
      parent,
      { kind: 'master' },
      [
        track,
        scrollAwareBreadcrumb(setHeadingPath),
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
      'Everything. Tasks, projects, someday-maybes, notes to self.',
    );
    editor.current = handle.view;
    setSelection(selectedLines(handle.view.state));
    onEditorReady?.(handle.view);

    return () => {
      onEditorReady?.(null);
      editor.current = null;
      handle.destroy();
      setHeadingPath([]);
      setHeadingOutline([]);
      setOutlineOpen(false);
    };
  }, [onEditorReady, mountEditor]);

  useEffect(() => {
    if (!outlineOpen) return;
    const closeOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (outlineTrigger.current?.contains(target) || outlinePanel.current?.contains(target))
        return;
      setOutlineOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [outlineOpen]);

  const toggleOutline = useCallback(() => {
    if (!outlineOpen && editor.current) {
      // Opening is an explicit, infrequent action, so finish the full-document
      // heading projection here even if the incremental parser was still idle.
      setHeadingOutline(documentHeadings(editor.current.state, 50));
    }
    setOutlineOpen((open) => !open);
  }, [outlineOpen]);

  const navigateFromOutline = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const from = Number(event.currentTarget.dataset['headingFrom']);
    const view = editor.current;
    if (!view || !Number.isFinite(from)) return;

    view.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: 0 }) });
    setOutlineOpen(false);
  }, []);

  const closeOutlineOnEscape = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Escape' || !outlineOpen) return;
      event.preventDefault();
      event.stopPropagation();
      setOutlineOpen(false);
      outlineTrigger.current?.focus();
    },
    [outlineOpen],
  );

  const count = selection.text.filter((line) => line.trim().length > 0).length;
  const disabled = count === 0;
  const breadcrumb = ['Goals', ...headingPath.map((heading) => heading.title)].join(' › ');
  const activeHeading = headingPath.at(-1)?.from;

  useEffect(() => {
    if (!outlineOpen || activeHeading === undefined) return;
    const frame = window.requestAnimationFrame(() => {
      outlinePanel.current
        ?.querySelector<HTMLElement>('[aria-current="location"]')
        ?.scrollIntoView({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeHeading, outlineOpen]);

  return (
    <aside className="goals" aria-label="Goals" ref={ref} onKeyDownCapture={closeOutlineOnEscape}>
      <header className="panel-header">
        <h2 className="panel-title">
          <button
            type="button"
            className="goals-breadcrumbs"
            aria-label={`${breadcrumb}. Open document outline`}
            aria-expanded={outlineOpen}
            aria-controls="goals-outline"
            title={breadcrumb}
            ref={outlineTrigger}
            onClick={toggleOutline}
          >
            <span className="goals-breadcrumb-root">Goals</span>
            {headingPath.length > 0 ? (
              <span className="goals-breadcrumb-trail" aria-hidden="true">
                <span className="goals-breadcrumb-trail-text">
                  {'› '}
                  {headingPath.map((heading) => heading.title).join(' › ')}
                </span>
              </span>
            ) : null}
            <span className="goals-outline-indicator" aria-hidden="true">
              <OutlineIcon />
            </span>
          </button>
        </h2>
      </header>

      {outlineOpen ? (
        <GoalsOutline
          headings={headingOutline}
          activeHeading={activeHeading}
          ref={outlinePanel}
          onHeadingClick={navigateFromOutline}
        />
      ) : null}

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
          onClick={() => removeMasterLines(selection.lines)}
        >
          Remove
        </button>
      </footer>
    </aside>
  );
};

const OutlineIcon = (): React.ReactElement => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      d="m3.5 5.75 4.5 4.5 4.5-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
