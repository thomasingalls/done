import { describe, expect, it } from 'vitest';
import { buildDecorations } from '../src/editor/livePreview';
import { flatten, hiddenText, lineClasses, stateAtLineOf, stateFor, whole } from './helpers';

const build = (state: ReturnType<typeof stateFor>) => buildDecorations(state, whole(state));

describe('syntax reveal follows the cursor', () => {
  const doc = 'a **bold** word\n\nanother *line* here';

  it('hides syntax on lines the cursor is not on', () => {
    const state = stateFor(doc, doc.indexOf('another'));
    expect(hiddenText(build(state), doc)).toEqual(['**', '**']);
  });

  it('reveals every syntax character on the cursor line', () => {
    const state = stateFor(doc, doc.indexOf('bold'));
    expect(hiddenText(build(state), doc)).toEqual(['*', '*']);
  });

  it('reveals across a multi-line selection', () => {
    const state = stateFor(doc, 0).update({
      selection: { anchor: 0, head: doc.length },
    }).state;
    expect(hiddenText(build(state), doc)).toEqual([]);
  });
});

describe('formatting is applied in both states', () => {
  // The load-bearing property behind "line height must not change" (TRD §5.2):
  // if the mark were conditional, entering a line would resize it.
  const doc = '# Heading\n\ntext **strong** here';

  it('marks strong emphasis whether or not the cursor is on the line', () => {
    const away = flatten(build(stateFor(doc, 0)), doc);
    const on = flatten(build(stateFor(doc, doc.indexOf('strong'))), doc);
    const strongOf = (decorations: typeof away) =>
      decorations.filter((d) => d.class === 'cm-md-strong').map((d) => [d.from, d.to]);

    expect(strongOf(away)).toEqual(strongOf(on));
    expect(strongOf(away)).toHaveLength(1);
  });

  it('keeps the heading line class when the cursor enters the heading', () => {
    expect(lineClasses(build(stateFor(doc, doc.indexOf('text'))), doc)).toContain(
      'cm-md-heading cm-md-h1',
    );
    expect(lineClasses(build(stateFor(doc, 2)), doc)).toContain('cm-md-heading cm-md-h1');
  });
});

describe('constructs', () => {
  it('hides the ATX hashes and the space after them', () => {
    const doc = '## Two\n\nbody';
    const state = stateFor(doc, doc.indexOf('body'));
    expect(hiddenText(build(state), doc)).toEqual(['## ']);
  });

  it('leaves a setext underline alone, which would otherwise become a blank line', () => {
    const doc = 'Title\n=====\n\nbody';
    const state = stateFor(doc, doc.indexOf('body'));
    expect(hiddenText(build(state), doc)).toEqual([]);
  });

  it('hides link brackets and the URL but not the text', () => {
    const doc = 'elsewhere\n\nsee [the docs](https://example.com) for more';
    const state = stateAtLineOf(doc, 'elsewhere');
    expect(hiddenText(build(state), doc).join('')).toBe('[](https://example.com)');
  });

  it('leaves image syntax raw, because images are a permanent non-goal', () => {
    const doc = 'before\n\n![alt](pic.png)';
    const state = stateFor(doc, 0);
    expect(hiddenText(build(state), doc)).toEqual([]);
  });

  it('hides a blockquote marker and gives the line a quote class', () => {
    const doc = 'para\n\n> quoted';
    const state = stateFor(doc, 0);
    expect(hiddenText(build(state), doc)).toEqual(['> ']);
    expect(lineClasses(build(state), doc)).toContain('cm-md-quote');
  });

  it('keeps fence marks visible and classes the block lines', () => {
    const doc = 'para\n\n```js\ncode\n```';
    const state = stateFor(doc, 0);
    expect(hiddenText(build(state), doc)).toEqual([]);
    expect(lineClasses(build(state), doc).filter((c) => c === 'cm-md-codeblock')).toHaveLength(3);
  });

  it('replaces a task marker with a checkbox and hides the list bullet', () => {
    const doc = 'para\n\n- [x] done thing';
    const state = stateFor(doc, 0);
    const decorations = flatten(build(state), doc);
    expect(decorations.find((d) => d.kind === 'widget')?.text).toBe('[x]');
    expect(hiddenText(build(state), doc)).toContain('- ');
  });

  it('keeps the bullet on a plain list item', () => {
    const doc = 'para\n\n- plain item';
    const state = stateFor(doc, 0);
    expect(hiddenText(build(state), doc)).toEqual([]);
    expect(flatten(build(state), doc).some((d) => d.class === 'cm-md-list-mark')).toBe(true);
  });

  it('hides a horizontal rule and draws it as a line class instead', () => {
    const doc = 'para\n\n---\n\nmore';
    const state = stateFor(doc, 0);
    expect(hiddenText(build(state), doc)).toEqual(['---']);
    expect(lineClasses(build(state), doc)).toContain('cm-md-hr');
  });

  it('treats caret notation as ordinary text', () => {
    const doc = '- [ ] Draft the migration plan ^k3f9x2\n\nelsewhere';
    expect(hiddenText(build(stateAtLineOf(doc, 'elsewhere')), doc)).not.toContain('^k3f9x2');
    expect(hiddenText(build(stateAtLineOf(doc, 'Draft')), doc)).not.toContain('^k3f9x2');
  });
});

describe('the decoration set is well formed', () => {
  const doc = [
    '# Heading',
    '',
    'Some **bold**, *italic*, ~~struck~~, `code`, [link](https://example.com).',
    '',
    '- [ ] task',
    '- plain',
    '',
    '> quote',
    '',
    '---',
    '',
    '```js',
    'const x = 1;',
    '```',
  ].join('\n');

  it('emits decorations in ascending order', () => {
    const decorations = flatten(build(stateFor(doc, 0)), doc);
    for (let i = 1; i < decorations.length; i++) {
      expect(decorations[i]!.from).toBeGreaterThanOrEqual(decorations[i - 1]!.from);
    }
  });

  it('never nests one replacement inside another', () => {
    const replaced = flatten(build(stateFor(doc, 0)), doc).filter(
      (d) => d.kind === 'replace' || d.kind === 'widget',
    );
    for (let i = 1; i < replaced.length; i++) {
      expect(replaced[i]!.from).toBeGreaterThanOrEqual(replaced[i - 1]!.to);
    }
  });

  it('leaves every piece of prose visible', () => {
    const state = stateFor(doc, 0);
    const replaced = flatten(build(state), doc).filter(
      (d) => d.kind === 'replace' || d.kind === 'widget',
    );

    let rendered = '';
    let pos = 0;
    for (const decoration of replaced) {
      rendered += doc.slice(pos, decoration.from);
      pos = decoration.to;
    }
    rendered += doc.slice(pos);

    for (const word of [
      'Heading',
      'bold',
      'italic',
      'struck',
      'code',
      'link',
      'task',
      'plain',
      'quote',
      'const x = 1;',
    ]) {
      expect(rendered).toContain(word);
    }
    // The URL is the one thing hidden that contains letters.
    expect(rendered).not.toContain('example.com');
  });
});
