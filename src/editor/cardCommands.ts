/**
 * What a card editor does that a document editor does not (TRD §5.4).
 *
 * Three behaviours, all of them boundary conditions rather than editing:
 * splitting into a new card, merging into the previous one, and leaving. The
 * operations themselves live in `crdt/moves.ts` — this is the gesture, not the
 * transaction.
 */

import { type Extension } from '@codemirror/state';
import { type Command, EditorView, keymap } from '@codemirror/view';

/**
 * PRD §10: "three consecutive returns splits into a new card. Three is a
 * starting guess — likely too undiscoverable, and expected to drop to two or
 * one once the interaction proves out. It is a tunable, not a decision."
 *
 * So it is a named constant, and the serializer does not depend on its value
 * (see the note in crdt/serialize.ts on why cards are list items).
 */
export const CARD_SPLIT_RETURNS = 3;

export interface CardHooks {
  /**
   * Split at `at`, with the remainder from `tailFrom` becoming the new card.
   * The two differ by the returns that triggered the split: they are the
   * gesture, so they belong to neither half.
   */
  split: (at: number, tailFrom: number) => boolean;
  /** Backspace at position 0. Returns the caret position in the previous card. */
  mergeBackwards: () => number | null;
  leave: () => void;
}

/** How many newlines sit immediately before `pos`. */
export const trailingReturns = (text: string, pos: number): number => {
  let count = 0;
  while (count < pos && text[pos - count - 1] === '\n') count += 1;
  return count;
};

const splitOnReturns =
  (hooks: CardHooks): Command =>
  (view) => {
    const range = view.state.selection.main;
    if (!range.empty) return false;

    const before = view.state.doc.sliceString(0, range.from);
    const returns = trailingReturns(before, before.length);
    if (returns < CARD_SPLIT_RETURNS - 1) return false;

    // The returns themselves are consumed by the gesture: the first half keeps
    // the text before them, the second half starts after the caret.
    return hooks.split(range.from - (CARD_SPLIT_RETURNS - 1), range.from);
  };

const mergeAtStart =
  (hooks: CardHooks): Command =>
  (view) => {
    const range = view.state.selection.main;
    if (!range.empty || range.from !== 0) return false;
    return hooks.mergeBackwards() !== null;
  };

/**
 * "`Escape` blurs and unmounts back to static" (TRD §5.4) — in that order.
 * Blurring is what unmounts, via the blur handler the card installs; the hook
 * only clears the list's record of which card it was steering focus to.
 */
const leave =
  (hooks: CardHooks): Command =>
  (view) => {
    view.contentDOM.blur();
    hooks.leave();
    return true;
  };

/**
 * Placed ahead of the document bindings so these win — CodeMirror's keymap
 * precedence follows extension order, and `Enter` and `Backspace` both have
 * perfectly good document-level meanings that must not fire first.
 */
export const cardKeymap = (hooks: CardHooks): Extension =>
  keymap.of([
    { key: 'Enter', run: splitOnReturns(hooks) },
    { key: 'Backspace', run: mergeAtStart(hooks) },
    { key: 'Escape', run: leave(hooks) },
  ]);

/** Unmounts back to static when focus goes elsewhere (TRD §4.4). */
export const blurToStatic = (onBlur: () => void): Extension =>
  EditorView.domEventHandlers({
    blur() {
      onBlur();
      return false;
    },
  });
