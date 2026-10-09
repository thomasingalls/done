import type { MouseEventHandler, Ref } from 'react';
import type { DocumentHeading } from '../editor/breadcrumbs';

interface GoalsOutlineProps {
  headings: readonly DocumentHeading[];
  activeHeading?: number | undefined;
  onHeadingClick: MouseEventHandler<HTMLButtonElement>;
  ref?: Ref<HTMLElement>;
}

/** A view-only heading projection; navigation remains owned by Goals. */
export const GoalsOutline = ({
  headings,
  activeHeading,
  onHeadingClick,
  ref,
}: GoalsOutlineProps): React.ReactElement => (
  <nav className="goals-outline" id="goals-outline" aria-label="Document outline" ref={ref}>
    {headings.length > 0 ? (
      <ol className="goals-outline-list">
        {headings.map((heading) => (
          <li key={`${heading.from}:${heading.level}`}>
            <button
              type="button"
              className="goals-outline-item"
              data-level={heading.level}
              data-heading-from={heading.from}
              aria-current={heading.from === activeHeading ? 'location' : undefined}
              title={heading.title}
              onClick={onHeadingClick}
            >
              {heading.title}
            </button>
          </li>
        ))}
      </ol>
    ) : (
      <p className="goals-outline-empty">Headings will appear here as you add them.</p>
    )}
  </nav>
);
