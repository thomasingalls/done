import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { masterLineSelection } from '../src/editor/masterLineSelection';

describe('admitted Goals line removal', () => {
  it('deletes exactly the selected lines, including a contiguous suffix and its separator', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .array(fc.constantFrom('a', ' ', '🙂', 'é', '中'), { maxLength: 12 })
            .map((s) => s.join('')),
          { minLength: 1, maxLength: 20 },
        ),
        fc.array(fc.integer({ min: -2, max: 24 }), { maxLength: 30 }),
        (lines, selected) => {
          const text = lines.join('\n');
          const selection = masterLineSelection(text, selected);
          const state = EditorState.create({ doc: text });
          const actual = selection
            ? state
                .update({
                  changes: selection.ranges.map(({ anchor, head }) => ({
                    from: anchor,
                    to: head,
                    insert: '',
                  })),
                })
                .state.doc.toString()
            : text;
          expect(actual).toBe(lines.filter((_, index) => !selected.includes(index)).join('\n'));
        },
      ),
      { numRuns: 1000, seed: 8941 },
    );
  });
});
