import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { documentHeadings, headingPathFrom, type DocumentHeading } from '../editor/breadcrumbs';
import { headingMenu } from '../editor/headingNavigation';
import { GoalsOutline } from './GoalsOutline';

interface Props {
  path: readonly DocumentHeading[];
  readEditor: () => EditorView | null;
  document: Text | undefined;
  onClose?: (() => void) | undefined;
}
interface OpenMenu {
  readonly kind: 'outline' | 'local';
  readonly prefix: string;
  readonly from: number | null;
  readonly document: Text;
  readonly headings: readonly DocumentHeading[];
  readonly title: string;
  readonly siblings: boolean;
}

/** Ephemeral navigation only; the root retains the entire page outline. */
export const GoalsNavigation = ({
  path,
  readEditor,
  document: currentDocument,
  onClose,
}: Props): React.ReactElement => {
  const [open, setOpen] = useState<OpenMenu | null>(null);
  const header = useRef<HTMLElement>(null),
    panel = useRef<HTMLElement>(null),
    trail = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const activeHeading = path.at(-1)?.from;
  const breadcrumb = ['Goals', ...path.map((heading) => heading.title)].join(' › ');
  const close = (restore = false) => {
    setOpen(null);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    setOpen(null);
  }, [currentDocument]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !header.current?.contains(event.target) &&
        !panel.current?.contains(event.target)
      )
        setOpen(null);
    };
    document.addEventListener('pointerdown', outside, true);
    const frame = requestAnimationFrame(() => {
      if (open.kind === 'local')
        panel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
      else
        panel.current
          ?.querySelector<HTMLElement>('[aria-current="location"]')
          ?.scrollIntoView({ block: 'nearest' });
    });
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      cancelAnimationFrame(frame);
    };
  }, [open]);
  useEffect(() => {
    if (trail.current) trail.current.scrollLeft = trail.current.scrollWidth;
  }, [path]);

  const show = (button: HTMLButtonElement, heading?: DocumentHeading) => {
    if (open && trigger.current === button) {
      close();
      return;
    }
    const view = readEditor();
    if (!view) return;
    const all = documentHeadings(view.state, 50);
    if (
      heading &&
      !all.some(
        (current) =>
          current.from === heading.from &&
          current.level === heading.level &&
          current.title === heading.title,
      )
    ) {
      close();
      return;
    }
    const choice = heading ? headingMenu(all, heading) : null;
    const ancestry = heading ? headingPathFrom(all, heading.from) : [];
    const prefix = (choice?.siblings ? ancestry.slice(0, -1) : ancestry)
      .map((value) => value.title)
      .join(' › ');
    trigger.current = button;
    setOpen({
      kind: choice ? 'local' : 'outline',
      prefix,
      from: heading?.from ?? null,
      document: view.state.doc,
      headings: choice?.headings ?? all,
      title: heading?.title ?? 'Goals',
      siblings: choice?.siblings ?? false,
    });
  };
  const navigate = (from: number, snapshot: Text | undefined, restoreFocus = false) => {
    const view = readEditor();
    if (
      !view ||
      !snapshot ||
      view.state.doc !== snapshot ||
      !Number.isInteger(from) ||
      from < 0 ||
      from > snapshot.length
    ) {
      close();
      return;
    }
    view.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: 0 }) });
    close();
    // A leaf's trigger can disappear after scrolling to its sibling. The root
    // stays mounted, keeps keyboard navigation nearby and never opens an IME.
    if (restoreFocus)
      header.current
        ?.querySelector<HTMLButtonElement>('.goals-breadcrumbs')
        ?.focus({ preventScroll: true });
  };
  const keys = (event: KeyboardEvent<HTMLElement>) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (
      open.kind !== 'local' ||
      !panel.current?.contains(event.target as Node) ||
      !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
    )
      return;
    const buttons = [...panel.current.querySelectorAll<HTMLButtonElement>('button')];
    if (!buttons.length) return;
    event.preventDefault();
    event.stopPropagation();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus({ preventScroll: true });
  };

  return (
    <>
      <header className="panel-header" ref={header} onKeyDownCapture={keys}>
        <h2 className="panel-title" aria-label="Goals">
          <span className="goals-navigation">
            <button
              type="button"
              className="goals-breadcrumbs"
              aria-label={`${breadcrumb}. Open document outline`}
              aria-expanded={open?.kind === 'outline'}
              aria-controls="goals-outline"
              title={breadcrumb}
              onClick={(event) => show(event.currentTarget)}
            >
              <span className="goals-breadcrumb-root">Goals</span>
              <span className="goals-outline-indicator" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <path
                    d="m3.5 5.75 4.5 4.5 4.5-4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
            <span className="goals-breadcrumb-trail" ref={trail}>
              {path.map((heading) => (
                <span className="goals-breadcrumb-piece" key={`${heading.from}:${heading.level}`}>
                  <span aria-hidden="true" className="goals-crumb-separator">
                    ›
                  </span>
                  <button
                    type="button"
                    className="goals-crumb-label"
                    title={heading.title}
                    aria-label={`Go to ${heading.title}`}
                    onClick={() => {
                      const view = readEditor();
                      if (!view || view.state.doc !== currentDocument) return;
                      const current = documentHeadings(view.state, 50).find(
                        (value) =>
                          value.from === heading.from &&
                          value.level === heading.level &&
                          value.title === heading.title,
                      );
                      if (current) navigate(current.from, currentDocument);
                    }}
                  >
                    <span className="goals-breadcrumb-trail-text">{heading.title}</span>
                  </button>
                  <button
                    type="button"
                    className="goals-crumb-menu"
                    aria-label={`Sections inside ${heading.title}`}
                    aria-expanded={
                      open?.kind === 'local' &&
                      open.title === heading.title &&
                      open.from === heading.from
                    }
                    aria-controls="goals-heading-menu"
                    data-heading-from={heading.from}
                    onClick={(event) => show(event.currentTarget, heading)}
                  >
                    <span aria-hidden="true">⌄</span>
                  </button>
                </span>
              ))}
            </span>
          </span>
        </h2>
        {onClose && (
          <button type="button" className="panel-action" aria-label="Close Goals" onClick={onClose}>
            Close
          </button>
        )}
      </header>
      {open?.kind === 'outline' && (
        <div onKeyDownCapture={keys}>
          <GoalsOutline
            headings={open.headings}
            activeHeading={activeHeading}
            ref={panel}
            onHeadingClick={(event) =>
              navigate(Number(event.currentTarget.dataset['headingFrom']), open.document, true)
            }
          />
        </div>
      )}
      {open?.kind === 'local' && (
        <nav
          className="goals-outline goals-heading-menu"
          id="goals-heading-menu"
          aria-label={`Sections inside ${open.title}`}
          ref={panel}
          onKeyDownCapture={keys}
        >
          <p className="goals-heading-menu-title">
            {open.siblings ? `Beside ${open.title}` : `Inside ${open.title}`}
          </p>
          <ol className="goals-outline-list">
            {open.headings.map((heading) => (
              <li key={`${heading.from}:${heading.level}`}>
                <button
                  type="button"
                  className="goals-outline-item"
                  data-heading-from={heading.from}
                  onClick={() => navigate(heading.from, open.document, true)}
                >
                  <span>{heading.title}</span>
                  <span className="goals-heading-location">
                    {[open.prefix, heading.title].filter(Boolean).join(' › ')} · line{' '}
                    {open.document.lineAt(heading.from).number}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </>
  );
};
