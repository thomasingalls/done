import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { selectedLines } from '../src/ui/Goals';

describe('master-list line selection', () => {
  it('does not include a line when a half-open selection ends at its start', () => {
    const state = EditorState.create({
      doc: 'one\ntwo',
      selection: { anchor: 0, head: 4 },
    });

    expect(selectedLines(state)).toEqual({ lines: [0], text: ['one'] });
  });

  it('still treats a collapsed cursor as selecting its current line', () => {
    const state = EditorState.create({
      doc: 'one\ntwo',
      selection: { anchor: 4 },
    });

    expect(selectedLines(state)).toEqual({ lines: [1], text: ['two'] });
  });
});
