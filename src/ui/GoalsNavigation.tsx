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
  readonly catalog: readonly DocumentHeading[];
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
        (
          panel.current?.querySelector<HTMLButtonElement>('.goals-outline-item') ?? panel.current
        )?.focus({ preventScroll: true });
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

  const show = (
    button: HTMLButtonElement,
    kind: 'outline' | 'local',
    heading: DocumentHeading | null = null,
  ) => {
    if (
      open?.kind === kind &&
      open.from === (heading?.from ?? null) &&
      trigger.current === button
    ) {
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
    const choice = kind === 'local' ? headingMenu(all, heading) : null;
    const ancestry = heading ? headingPathFrom(all, heading.from) : [];
    trigger.current = button;
    setOpen({
      kind,
      prefix: ancestry.map((value) => value.title).join(' › '),
      from: heading?.from ?? null,
      document: view.state.doc,
      headings: choice?.headings ?? all,
      catalog: all,
      title: heading?.title ?? 'Goals',
    });
  };
  const navigate = (from: number, snapshot: Text | undefined, drill = false) => {
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
    const heading = drill ? open?.catalog.find((value) => value.from === from) : null;
    if (drill && !heading) {
      close();
      return;
    }
    view.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: 0 }) });
    if (drill && heading && open) {
      setOpen({
        ...open,
        kind: 'local',
        from,
        title: heading.title,
        prefix: headingPathFrom(open.catalog, from)
          .map((value) => value.title)
          .join(' › '),
        headings: headingMenu(open.catalog, heading).headings,
      });
    } else close();
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

  const caret = (heading: DocumentHeading | null) => (
    <button
      type="button"
      className="goals-crumb-menu"
      aria-label={`Sections inside ${heading?.title ?? 'Goals'}`}
      aria-expanded={open?.kind === 'local' && open.from === (heading?.from ?? null)}
      aria-controls="goals-heading-menu"
      data-heading-from={heading?.from}
      onClick={(event) => show(event.currentTarget, 'local', heading)}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="m4.5 2 4 4-4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

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
              onClick={(event) => show(event.currentTarget, 'outline')}
            >
              <span className="goals-breadcrumb-root">Goals</span>
            </button>
            {caret(null)}
            <span className="goals-breadcrumb-trail" ref={trail}>
              {path.map((heading) => (
                <span className="goals-breadcrumb-piece" key={`${heading.from}:${heading.level}`}>
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
                  {caret(heading)}
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
          tabIndex={-1}
        >
          <p className="goals-heading-menu-title">{`Inside ${open.title}`}</p>
          {open.headings.length === 0 && (
            <p className="goals-outline-empty">No subsections here.</p>
          )}
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
