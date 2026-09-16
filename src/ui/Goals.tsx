/**
 * Goals — the master list (PRD §7.1, §7.3).
 *
 * A document, freely structured, with no date attached, and it **never freezes**
 * (PRD §6). Everything lives here: tasks, projects, someday-maybes, notes to
 * self. Nesting is allowed and never required.
 *
 * Copy leaves the original in Goals. Explicit Move transfers the selected lines
 * as one undoable action; Remove remains an independent action.
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
import { isFrozen } from '../crdt/freeze';
import { masterLineBody } from '../lib/masterLineBody';
import { useWorkspaceUi } from './workspaceUi';
import {
  documentHeadings,
  scrollAwareBreadcrumb,
  type DocumentHeading,
} from '../editor/breadcrumbs';
import type { ISODate } from '../lib/date';
import { GoalsOutline } from './GoalsOutline';
import { GoalsActionsMenu, type GoalsMenuAction } from './GoalsActionsMenu';

export interface GoalsProps {
  /** Copies land on the day in view, which is the one the user is looking at. */
  date: ISODate;
  today: ISODate;
  ref?: React.Ref<HTMLElement>;
  /** Lets the shell coordinate focus with the narrow panel's snap animation. */
  onEditorReady?: (view: EditorView | null) => void;
  onClose?: (() => void) | undefined;
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

export const Goals = ({
  date,
  today,
  ref,
  onEditorReady,
  onClose,
}: GoalsProps): React.ReactElement => {
  const { execute, mountEditor, removeMasterLines, snapshot, status } = useWorkspaceUi();
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const outlineTrigger = useRef<HTMLButtonElement>(null);
  const outlinePanel = useRef<HTMLElement>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY);
  const [headingPath, setHeadingPath] = useState<readonly DocumentHeading[]>([]);
  const [headingOutline, setHeadingOutline] = useState<readonly DocumentHeading[]>([]);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  const [pending, setPending] = useState(false);
  const [transferError, setTransferError] = useState('');
  const transferring = useRef(false);
  const nextSpace = Math.max(
    0,
    NEXT_CAP - (snapshot.days.find((day) => day.date === date)?.next.length ?? 0),
  );
  const unavailable = pending || status.state !== 'active';
  const removeDisabled = unavailable || !selection.text.some((line) => line.length > 0);
  const transferDisabled = (section: Section, selected = selection): boolean => {
    const items = selected.text.filter((line) => masterLineBody(line).length > 0).length;
    return (
      unavailable ||
      isFrozen(date, today) ||
      items === 0 ||
      (section === 'next' && items > nextSpace)
    );
  };

  useEffect(() => {
    if (!transferError) return;
    const timer = window.setTimeout(() => setTransferError(''), 4000);
    return () => window.clearTimeout(timer);
  }, [transferError]);

  useEffect(() => setTransferError(''), [date]);

  // A ref because the editor is built once and the binding inside it must not
  // capture the props of the render that happened to build it.
  const transferTo = useRef<
    (section: Section, selected: Selection, action: 'copy' | 'move') => void
  >(() => {});
  transferTo.current = (section, selected, action) => {
    if (transferring.current || transferDisabled(section, selected)) return;
    transferring.current = true;
    setMode(action);
    setPending(true);
    setTransferError('');
    void execute(
      action === 'copy'
        ? { kind: 'copy', to: { date, section }, lines: selected.text }
        : {
            kind: 'move-from-master',
            to: { date, section },
            lines: selected.lines.map((line, index) => ({ line, text: selected.text[index]! })),
          },
      { feedback: 'local' },
    )
      .then((result) => {
        if (typeof result === 'number' && result > 0) setMode('copy');
        else if (result === 0 || result === false)
          setTransferError(
            action === 'move' ? 'Nothing moved. Try again.' : 'Nothing copied. Try again.',
          );
      })
      .finally(() => {
        transferring.current = false;
        setPending(false);
      });
  };

  const removeSelected = () => {
    if (transferring.current || removeDisabled) return;
    transferring.current = true;
    setPending(true);
    setTransferError('');
    void removeMasterLines(selection.lines, { feedback: 'local' })
      .then((removed) => {
        if (!removed) setTransferError('Nothing removed. Try again.');
      })
      .finally(() => {
        transferring.current = false;
        setPending(false);
      });
  };

  const menuAction = (action: GoalsMenuAction) => {
    if (action === 'remove') {
      removeSelected();
      return;
    }
    if (transferring.current || unavailable || !snapshot[action]) return;
    transferring.current = true;
    setPending(true);
    setTransferError('');
    void execute({ kind: action }, { feedback: 'local' })
      .then((result) => {
        if (result === false || result === null)
          setTransferError(`Could not ${action}. Try again.`);
      })
      .finally(() => {
        transferring.current = false;
        setPending(false);
      });
  };

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
              transferTo.current('next', selectedLines(view.state), 'copy');
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

  const actionLabel = mode === 'copy' ? 'Copy' : 'Move';
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
    <aside
      className="goals"
      id="goals"
      aria-label="Goals"
      ref={ref}
      onKeyDownCapture={closeOutlineOnEscape}
    >
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
        {onClose && (
          <button type="button" className="panel-action" aria-label="Close Goals" onClick={onClose}>
            Close
          </button>
        )}
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
        <div
          className="goals-action-buttons"
          role="group"
          aria-label="Selected lines"
          aria-busy={pending}
        >
          <fieldset className="goals-transfer-mode" disabled={pending}>
            <legend>Transfer selected lines</legend>
            {(['copy', 'move'] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="goals-transfer-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => {
                    setMode(value);
                    setTransferError('');
                  }}
                />
                <span>{value === 'copy' ? 'Copy to' : 'Move to'}</span>
              </label>
            ))}
          </fieldset>
          <GoalsActionsMenu
            undoDisabled={unavailable || !snapshot.undo}
            redoDisabled={unavailable || !snapshot.redo}
            removeDisabled={removeDisabled}
            onAction={menuAction}
          />
          <div className="goals-destinations">
            <button
              type="button"
              className="card-action"
              disabled={transferDisabled('next')}
              title={`${actionLabel} to Next — at most ${NEXT_CAP}`}
              onClick={() => transferTo.current('next', selection, mode)}
            >
              Next
            </button>
            <button
              type="button"
              className="card-action"
              disabled={transferDisabled('scheduled')}
              title={`${actionLabel} to Scheduled on the day in view`}
              onClick={() => transferTo.current('scheduled', selection, mode)}
            >
              Scheduled
            </button>
            <button
              type="button"
              className="card-action"
              disabled={transferDisabled('done')}
              title={`${actionLabel} to Done`}
              onClick={() => transferTo.current('done', selection, mode)}
            >
              Done
            </button>
          </div>
        </div>
        {transferError && (
          <p className="goals-transfer-error" role="status" aria-label="Transfer result">
            {transferError}
          </p>
        )}
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
