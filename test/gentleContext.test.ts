import { EditorSelection, EditorState, StateEffect } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { describe, expect, it } from 'vitest';
import { gentleContextPlan, gentleLineIsClear } from '../src/editor/gentleContext';
import { stateFor } from './helpers';

const text = [
  'loose note',
  '# Work',
  'work note',
  '## Site',
  'site note',
  '### Launch',
  'current task',
  'child note',
  '### Later',
  'later note',
  '# Home',
  'home note',
].join('\n');
const clear = (state: EditorState): string[] => {
  const plan = gentleContextPlan(state);
  if (!plan) return [];
  return Array.from({ length: state.doc.lines }, (_, index) => state.doc.line(index + 1))
    .filter((line) => line.text && gentleLineIsClear(state, line.from, line.to, plan))
    .map((line) => line.text);
};

describe('gentle context is a numeric view projection', () => {
  it('keeps the active section and two nearest authored headings, not unrelated parent prose', () => {
    expect(clear(stateFor(text, text.indexOf('current task')))).toEqual([
      '## Site',
      '### Launch',
      'current task',
      'child note',
    ]);
  });
  it('counts authored ancestors across skipped levels', () => {
    const doc = '# Area\narea note\n#### Deep\ncurrent\n# Other\nelsewhere';
    expect(clear(stateFor(doc, doc.indexOf('current')))).toEqual([
      '# Area',
      '#### Deep',
      'current',
    ]);
  });
  it('includes child subsections when the caret belongs to the parent section', () => {
    expect(clear(stateFor(text, text.indexOf('site note')))).toEqual([
      '# Work',
      '## Site',
      'site note',
      '### Launch',
      'current task',
      'child note',
      '### Later',
      'later note',
    ]);
  });
  it('treats a heading-start caret as belonging to that heading', () => {
    expect(clear(stateFor(text, text.indexOf('### Later')))).toEqual([
      '## Site',
      '### Later',
      'later note',
    ]);
  });
  it('keeps both physical lines of a setext ancestor clear', () => {
    const doc = 'Area\n====\nold note\n## Child\ncurrent\n# Other';
    expect(clear(stateFor(doc, doc.indexOf('current')))).toEqual([
      'Area',
      '====',
      '## Child',
      'current',
    ]);
  });
  it('does not interpret heading-looking code as section boundaries', () => {
    const doc = '# Work\n```\n# fake\n```\ncurrent\n# Other';
    expect(clear(stateFor(doc, doc.indexOf('current')))).toEqual([
      '# Work',
      '```',
      '# fake',
      '```',
      'current',
    ]);
  });
  it('keeps ordinary contrast before the first heading', () => {
    expect(gentleContextPlan(stateFor(text, 0))).toBeNull();
  });
  it('keeps selected writing outside the caret section clear with half-open boundaries', () => {
    const state = stateFor(text)
      .update({
        effects: StateEffect.appendConfig.of(EditorState.allowMultipleSelections.of(true)),
      })
      .state.update({
        selection: EditorSelection.create(
          [
            EditorSelection.range(0, text.indexOf('# Work')),
            EditorSelection.cursor(text.indexOf('current task')),
          ],
          1,
        ),
      }).state;
    const plan = gentleContextPlan(state)!;
    expect(gentleLineIsClear(state, 0, 'loose note'.length, plan)).toBe(true);
    const work = state.doc.lineAt(text.indexOf('# Work'));
    expect(gentleLineIsClear(state, work.from, work.to, plan)).toBe(false);
  });
  it('refuses to invent a scope from an incomplete parser tree', () => {
    const state = EditorState.create({
      doc: '# Work\n' + 'paragraph\n\n'.repeat(20_000),
      extensions: [markdown()],
    });
    expect(gentleContextPlan(state)).toBeNull();
  });
  it('uses completed parse work beyond the state’s initial tree fragment', () => {
    const doc = '# Work\n' + 'paragraph\n\n'.repeat(600) + '# Home\ncurrent';
    expect(clear(stateFor(doc, doc.length))).toEqual(['# Home', 'current']);
  });
  it('bounds lookup through pathological unrelated block structure', () => {
    const doc = '# Work\n' + 'paragraph\n\n'.repeat(5000) + 'current';
    expect(gentleContextPlan(stateFor(doc, doc.length))).toBeNull();
  });
});
