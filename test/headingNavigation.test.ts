import { describe, expect, it } from 'vitest';
import { childHeadings, headingMenu } from '../src/editor/headingNavigation';
import { documentHeadings } from '../src/editor/breadcrumbs';
import { stateFor } from './helpers';

const headings = documentHeadings(
  stateFor('# Work\n### Site\n#### Launch\n### Admin\n# Home\n## Launch'),
);
describe('local breadcrumb navigation retains authored hierarchy', () => {
  it('root children are only top-level authored headings', () => {
    expect(childHeadings(headings, null).map((h) => h.title)).toEqual(['Work', 'Home']);
  });
  it('child menus honor skipped heading levels without flattening descendants', () => {
    expect(childHeadings(headings, headings[0]!.from).map((h) => h.title)).toEqual([
      'Site',
      'Admin',
    ]);
  });
  it('a heading with children offers those children', () => {
    const menu = headingMenu(headings, headings[1]!);
    expect(menu.siblings).toBe(false);
    expect(menu.headings.map((h) => h.title)).toEqual(['Launch']);
  });
  it('a leaf has no children and never substitutes siblings', () => {
    const menu = headingMenu(headings, headings[3]!);
    expect(menu.siblings).toBe(false);
    expect(menu.headings).toEqual([]);
  });
  it('the root caret lists H1 only, leaving orphan/skipped headings in the full outline', () => {
    const all = documentHeadings(stateFor('## Loose\n# Area\n### Deep\n# Other'));
    expect(headingMenu(all, null).headings.map((h) => h.title)).toEqual(['Area', 'Other']);
    expect(all.map((h) => h.title)).toEqual(['Loose', 'Area', 'Deep', 'Other']);
  });
  it('empty outlines remain empty', () => {
    expect(childHeadings([], null)).toEqual([]);
  });
  it('duplicate labels keep distinct source positions', () => {
    const values = documentHeadings(stateFor('# Area\n## Same\n## Same'));
    const menu = headingMenu(values, values[0]!);
    expect(menu.headings.map((h) => h.title)).toEqual(['Same', 'Same']);
    expect(menu.headings[0]!.from).not.toBe(menu.headings[1]!.from);
  });
});
