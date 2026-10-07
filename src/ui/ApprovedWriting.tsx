import { useEffect, useRef } from 'react';
import { renderStatic } from '../editor/staticRender';
import type { ZipEntry } from '../lib/zip';
function ReadOnlyMarkdown({ text }: { text: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current!;
    renderStatic(element, text);
    for (const input of element.querySelectorAll('input')) input.disabled = true;
    return () => element.replaceChildren();
  }, [text]);
  return <div ref={host} className="cm-content static-markdown" />;
}
export function ApprovedWriting({ entries }: { entries: ZipEntry[] }) {
  return (
    <div className="approved-writing" aria-label="Read-only account writing">
      {entries.map((entry) => (
        <section key={entry.path}>
          <h2>
            {entry.path === 'master.md'
              ? 'Goals'
              : entry.path === 'unfiled.md'
                ? 'Unfiled'
                : entry.path.replace('days/', '').replace('.md', '')}
          </h2>
          <ReadOnlyMarkdown text={entry.content} />
        </section>
      ))}
    </div>
  );
}
