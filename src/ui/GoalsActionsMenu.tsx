import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export type GoalsMenuAction = 'undo' | 'redo' | 'remove';

interface GoalsActionsMenuProps {
  undoDisabled: boolean;
  redoDisabled: boolean;
  removeDisabled: boolean;
  onAction: (action: GoalsMenuAction) => void;
}

export const GoalsActionsMenu = ({
  undoDisabled,
  redoDisabled,
  removeDisabled,
  onAction,
}: GoalsActionsMenuProps): React.ReactElement => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const startAtEnd = useRef(false);

  useEffect(() => {
    if (!open) return;
    const items = menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const first = startAtEnd.current ? items?.[items.length - 1] : items?.[0];
    (first ?? menu.current)?.focus({ preventScroll: true });
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab') {
      // Resume the page's normal tab order from the menu trigger.
      close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const items = [
      ...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ];
    if (items.length === 0) return;
    const index = items.findIndex((item) => item === document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus({ preventScroll: true });
  };

  const select = (action: GoalsMenuAction) => {
    close();
    onAction(action);
  };

  return (
    <div
      className="goals-more"
      ref={root}
      onKeyDown={handleKeys}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="goals-more-trigger"
        aria-label="More Goals actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="goals-actions-menu"
        ref={trigger}
        onClick={() => {
          startAtEnd.current = false;
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          event.stopPropagation();
          startAtEnd.current = event.key === 'ArrowUp';
          setOpen(true);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="3" cy="8" r="1.5" fill="currentColor" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <circle cx="13" cy="8" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          className="goals-actions-menu"
          id="goals-actions-menu"
          role="menu"
          aria-label="Goals actions"
          tabIndex={-1}
          ref={menu}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={undoDisabled}
            title="Undo the most recent workspace action"
            onClick={() => select('undo')}
          >
            Undo
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={redoDisabled}
            title="Redo the most recent undone workspace action"
            onClick={() => select('redo')}
          >
            Redo
          </button>
          <div className="goals-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="goals-menu-remove"
            disabled={removeDisabled}
            onClick={() => select('remove')}
          >
            Remove selected lines
          </button>
        </div>
      )}
    </div>
  );
};
