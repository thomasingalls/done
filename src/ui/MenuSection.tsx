import type { ReactNode } from 'react';

/** Native disclosure keeps forms and in-flight status owners mounted while collapsed. */
export function MenuSection({
  title,
  children,
  notice,
}: {
  title: string;
  children: ReactNode;
  notice?: string | undefined;
}) {
  return (
    <details className="menu-section menu-disclosure" data-menu-section={title}>
      <summary>
        <h2 className="menu-heading">{title}</h2>
        {notice && <span className="menu-section-notice">{notice}</span>}
      </summary>
      <div className="menu-section-content" role="region" aria-label={title}>
        {children}
      </div>
    </details>
  );
}
