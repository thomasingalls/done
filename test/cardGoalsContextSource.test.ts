import { expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { stateFor } from './helpers';
import { goalsContextsForLines } from '../src/editor/cardGoalsContext';
const capture = (text: string, needles: string[]) => {
  const state = stateFor(text);
  const rows = text.split('\n');
  return goalsContextsForLines(
    state,
    needles.map((text) => ({ line: rows.indexOf(text), text })),
  );
};
it('uses authored headings at the selected line, including skipped levels and inline formatting', () => {
  expect(capture('# **Work**\n### [Site](https://example.com)\n- task', ['- task'])).toEqual([
    [
      { level: 1, title: 'Work' },
      { level: 3, title: 'Site' },
    ],
  ]);
});
it('does not add the selected heading itself or invent list-parent tags', () => {
  expect(capture('# Work\n## Site\n- parent\n  - child', ['## Site', '  - child'])).toEqual([
    [{ level: 1, title: 'Work' }],
    [
      { level: 1, title: 'Work' },
      { level: 2, title: 'Site' },
    ],
  ]);
});
it('Setext headings count and fenced pseudo-headings do not', () => {
  expect(capture('Work\n====\n```\n# fake\n```\n- task', ['Work', '- task'])).toEqual([
    null,
    [{ level: 1, title: 'Work' }],
  ]);
});
it('keeps duplicate titles in their actual branches and respects caller row order', () => {
  expect(capture('# Work\n## Same\nfirst\n# Home\n## Same\nsecond', ['second', 'first'])).toEqual([
    [
      { level: 1, title: 'Home' },
      { level: 2, title: 'Same' },
    ],
    [
      { level: 1, title: 'Work' },
      { level: 2, title: 'Same' },
    ],
  ]);
});
it('changed or invalid source rows omit context rather than matching equal text elsewhere', () => {
  const state = stateFor('# Work\n- task');
  expect(
    goalsContextsForLines(state, [
      { line: 0, text: '- task' },
      { line: 9, text: '- task' },
      { line: 1.5, text: '- task' },
    ]),
  ).toEqual([null, null, null]);
});
it('missing parser coverage leaves optional context absent and source untouched', () => {
  const state = EditorState.create({ doc: '# Work\n- task' });
  expect(goalsContextsForLines(state, [{ line: 1, text: '- task' }])).toEqual([null]);
  expect(state.doc.toString()).toBe('# Work\n- task');
});
it('unheaded writing and overly long heading labels stay ordinary cards', () => {
  expect(capture('a note\n- task', ['- task'])).toEqual([null]);
  expect(capture('# ' + 'x'.repeat(1025) + '\n- task', ['- task'])).toEqual([null]);
});
it('a selected sibling or root heading excludes the previous section as well as itself', () => {
  expect(capture('# Work\n## Earlier\nnote\n## Later\n# Home', ['## Later', '# Home'])).toEqual([
    [{ level: 1, title: 'Work' }],
    null,
  ]);
  expect(capture('# Work\n> ## Earlier\nnote\n> ## Later', ['> ## Later'])).toEqual([
    [{ level: 1, title: 'Work' }],
  ]);
  expect(capture('# Work\nEarlier\n=======\nnote\nLater\n=====', ['Later'])).toEqual([null]);
});
it('every physical line of a multiline Setext title excludes its own heading', () => {
  expect(
    capture('# Work\nFirst title\nsecond title\n---\n- task', [
      'First title',
      'second title',
      '- task',
    ]),
  ).toEqual([
    [{ level: 1, title: 'Work' }],
    [{ level: 1, title: 'Work' }],
    [
      { level: 1, title: 'Work' },
      { level: 2, title: 'First title second title' },
    ],
  ]);
});
