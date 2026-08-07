import { describe, expect, it } from 'vitest';
import { documentHeadings, headingPathAt } from '../src/editor/breadcrumbs';
import { stateFor } from './helpers';

const titlesAt = (doc: string, needle: string): string[] => {
  const position = doc.indexOf(needle);
  if (position < 0) throw new Error(`Missing fixture text: ${needle}`);
  return headingPathAt(stateFor(doc), position).map((heading) => heading.title);
};

describe('scroll-aware heading paths', () => {
  const document = [
    'Loose text',
    '',
    '# Work',
    'work body',
    '### Skipped level',
    'deep body',
    '## Project',
    'project body',
    '### Phase',
    'phase body',
    '# Personal',
    'personal body',
  ].join('\n');

  it('uses only the root before the first heading', () => {
    expect(titlesAt(document, 'Loose text')).toEqual([]);
  });

  it('keeps authored ancestry, including skipped levels', () => {
    expect(titlesAt(document, 'deep body')).toEqual(['Work', 'Skipped level']);
    expect(titlesAt(document, 'phase body')).toEqual(['Work', 'Project', 'Phase']);
  });

  it('drops equal and deeper headings when their section ends', () => {
    expect(titlesAt(document, 'personal body')).toEqual(['Personal']);
  });

  it('makes a heading active when that heading is the visible line', () => {
    expect(titlesAt(document, '## Project')).toEqual(['Work', 'Project']);
  });

  it('normalizes setext headings and removes inline markdown marks', () => {
    const doc = [
      'Area with **weight** and [a link](https://example.com)',
      '======================================================',
      'body',
      '',
      '## Project with `code` and *emphasis*',
      'nested body',
    ].join('\n');

    expect(titlesAt(doc, 'body')).toEqual(['Area with weight and a link']);
    expect(titlesAt(doc, 'nested body')).toEqual([
      'Area with weight and a link',
      'Project with code and emphasis',
    ]);
  });

  it('labels an empty authored heading without demanding content', () => {
    const doc = '#\nbody';
    expect(titlesAt(doc, 'body')).toEqual(['Untitled']);
  });
});

describe('document outline', () => {
  it('keeps every heading in source order with its authored level', () => {
    const state = stateFor('# Work\nbody\n### Phase\nbody\n# Personal');
    expect(documentHeadings(state).map(({ level, title }) => ({ level, title }))).toEqual([
      { level: 1, title: 'Work' },
      { level: 3, title: 'Phase' },
      { level: 1, title: 'Personal' },
    ]);
  });
});
