/**
 * TRD §4.4: the static card render.
 *
 * What is testable without a browser is that both renders come from the same
 * decoration set — same classes, same hidden ranges, same widget. The geometry
 * half ("pixel-identical") needs a browser that lays things out and lives in
 * test/geometry/cards.spec.ts.
 */

import { describe, expect, it } from 'vitest';
import { buildDecorations } from '../src/editor/livePreview';
import { renderStatic } from '../src/editor/staticRender';
import { hiddenText, stateFor, whole } from './helpers';

const render = (markdown: string): HTMLElement => {
  const host = document.createElement('div');
  renderStatic(host, markdown);
  return host;
};

const lines = (host: HTMLElement): HTMLElement[] => [
  ...host.querySelectorAll<HTMLElement>('.md-line'),
];

describe('the static render', () => {
  it('produces one line box per line, so an empty line still takes space', () => {
    const host = render('one\n\nthree');
    expect(lines(host)).toHaveLength(3);
    expect(lines(host)[1]?.textContent).toBe('');
    expect(lines(host)[1]?.querySelector('br')).not.toBeNull();
  });

  it('hides syntax, because nothing has a cursor on it', () => {
    const host = render('a **bold** word');
    expect(host.textContent).toBe('a bold word');
    expect(host.querySelector('.cm-md-strong')?.textContent).toBe('bold');
  });

  it('hides exactly what the editor hides when the cursor is elsewhere', () => {
    const markdown = '# Heading\n\ntext with **strong** and `code`';
    // The editor's own answer, with the cursor parked on a line of its own.
    const state = stateFor(`${markdown}\n`, markdown.length + 1);
    expect(hiddenText(buildDecorations(state, whole(state)), `${markdown}\n`)).toEqual([
      '# ',
      '**',
      '**',
      '`',
      '`',
    ]);
    expect(render(markdown).textContent).toBe('Headingtext with strong and code');
  });

  it('carries the line classes headings and quotes are drawn with', () => {
    const host = render('# Heading\n> quoted\n---');
    expect(lines(host)[0]?.className).toContain('cm-md-h1');
    expect(lines(host)[1]?.className).toContain('cm-md-quote');
    expect(lines(host)[2]?.className).toContain('cm-md-hr');
  });

  it('renders the task checkbox as the widget, not as brackets', () => {
    const host = render('- [x] done task');
    const box = host.querySelector('.cm-md-task');
    expect(box).not.toBeNull();
    expect(box?.getAttribute('aria-checked')).toBe('true');
    // The space after `[x]` is text, not syntax; the editor keeps it too.
    expect(host.textContent).toBe(' done task');
  });

  it('nests formatting the way the editor nests it', () => {
    const host = render('***both***');
    // Lezer nests strong inside emphasis for `***`, and the render follows the
    // tree rather than having an opinion of its own.
    const em = host.querySelector('.cm-md-em');
    expect(em).not.toBeNull();
    expect(em?.querySelector('.cm-md-strong')?.textContent).toBe('both');
  });

  it('hides a block marker, which is not markdown syntax', () => {
    // The marker is hidden from the caret onwards; the space before it is
    // ordinary text, which is what the editor does with it as well.
    expect(render('a line ^k3f9x2').textContent).toBe('a line ');
  });

  it('leaves image syntax raw, since images are a permanent non-goal', () => {
    expect(render('![alt](x.png)').textContent).toBe('![alt](x.png)');
  });

  it('replaces its host rather than appending to it', () => {
    const host = document.createElement('div');
    renderStatic(host, 'first');
    renderStatic(host, 'second');
    expect(lines(host)).toHaveLength(1);
    expect(host.textContent).toBe('second');
  });
});
