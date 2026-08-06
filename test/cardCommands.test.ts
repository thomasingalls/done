/**
 * TRD §5.4: what a card editor does that a document editor does not.
 *
 * The split threshold is "a starting guess — likely too undiscoverable, and
 * expected to drop to two or one once the interaction proves out" (PRD §10), so
 * these tests are written against the constant rather than against the number
 * three. Changing the constant must not require changing a test.
 */

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { CARD_SPLIT_RETURNS, cardKeymap, trailingReturns } from '../src/editor/cardCommands';

const views: EditorView[] = [];
afterEach(() => {
  while (views.length) views.pop()?.destroy();
});

interface Calls {
  split: [number, number][];
  merges: number;
  leaves: number;
}

const editor = (doc: string, cursor: number) => {
  const calls: Calls = { split: [], merges: 0, leaves: 0 };

  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        cardKeymap({
          split: (at, tailFrom) => {
            calls.split.push([at, tailFrom]);
            return true;
          },
          mergeBackwards: () => {
            calls.merges += 1;
            return 0;
          },
          leave: () => {
            calls.leaves += 1;
          },
        }),
      ],
    }),
  });
  views.push(view);

  const press = (key: string): void => {
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  };

  return { view, calls, press };
};

describe('counting returns', () => {
  it('counts only the ones immediately before the position', () => {
    expect(trailingReturns('a\n\n', 3)).toBe(2);
    expect(trailingReturns('a\n\nb', 4)).toBe(0);
    expect(trailingReturns('', 0)).toBe(0);
    expect(trailingReturns('\n\n\n', 3)).toBe(3);
  });
});

describe('the split gesture', () => {
  const returns = '\n'.repeat(CARD_SPLIT_RETURNS - 1);

  it('does not fire before the threshold', () => {
    const { calls, press } = editor(
      `text${'\n'.repeat(CARD_SPLIT_RETURNS - 2)}`,
      4 + CARD_SPLIT_RETURNS - 2,
    );
    press('Enter');
    expect(calls.split).toEqual([]);
  });

  it('fires on the return that reaches it, and consumes the ones before', () => {
    const doc = `text${returns}`;
    const { calls, press } = editor(doc, doc.length);
    press('Enter');
    expect(calls.split).toEqual([[4, doc.length]]);
  });

  it('leaves the tail of the card to the new one', () => {
    const doc = `head${returns}tail`;
    const { calls, press } = editor(doc, 4 + returns.length);
    press('Enter');
    // The first half keeps `head`; the second starts at `tail`.
    expect(calls.split).toEqual([[4, 4 + returns.length]]);
  });

  it('does not fire with a selection, which is a replacement rather than a split', () => {
    const doc = `text${returns}`;
    const { view, calls, press } = editor(doc, doc.length);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    press('Enter');
    expect(calls.split).toEqual([]);
  });
});

describe('the merge gesture', () => {
  it('fires on backspace at the very start', () => {
    const { calls, press } = editor('second card', 0);
    press('Backspace');
    expect(calls.merges).toBe(1);
  });

  it('does not fire anywhere else', () => {
    const { calls, press } = editor('second card', 3);
    press('Backspace');
    expect(calls.merges).toBe(0);
  });
});

describe('leaving', () => {
  it('unmounts back to static on Escape (TRD §4.4)', () => {
    const { calls, press } = editor('a card', 3);
    press('Escape');
    expect(calls.leaves).toBe(1);
  });
});
