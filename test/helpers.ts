import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type StateCommand, type Transaction } from '@codemirror/state';
import type { Decoration, DecorationSet } from '@codemirror/view';

export const stateFor = (doc: string, cursor = 0): EditorState => {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(cursor),
    extensions: [markdown({ base: markdownLanguage, addKeymap: false })],
  });
  // Force a complete parse: the incremental parser's default budget is fine in
  // a running editor but leaves the tail of a document untyped in a test.
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
};

/** Cursor placed on the line containing `needle`, at its first character. */
export const stateAtLineOf = (doc: string, needle: string): EditorState => {
  const index = doc.indexOf(needle);
  if (index < 0) throw new Error(`"${needle}" is not in the document`);
  return stateFor(doc, index);
};

export interface FlatDecoration {
  from: number;
  to: number;
  kind: 'replace' | 'mark' | 'line' | 'widget';
  class: string | null;
  text: string;
}

export const flatten = (set: DecorationSet, doc: string): FlatDecoration[] => {
  const out: FlatDecoration[] = [];
  const cursor = set.iter();
  while (cursor.value) {
    const value = cursor.value as Decoration & {
      spec: { class?: string; widget?: unknown };
      point: boolean;
    };
    const isLine = cursor.from === cursor.to && value.spec.class !== undefined && value.point;
    const kind: FlatDecoration['kind'] = value.spec.widget
      ? 'widget'
      : isLine
        ? 'line'
        : value.spec.class !== undefined
          ? 'mark'
          : 'replace';
    out.push({
      from: cursor.from,
      to: cursor.to,
      kind,
      class: value.spec.class ?? null,
      text: doc.slice(cursor.from, cursor.to),
    });
    cursor.next();
  }
  return out;
};

export const hiddenText = (set: DecorationSet, doc: string): string[] =>
  flatten(set, doc)
    .filter((decoration) => decoration.kind === 'replace' || decoration.kind === 'widget')
    .map((decoration) => decoration.text);

export const lineClasses = (set: DecorationSet, doc: string): string[] =>
  flatten(set, doc)
    .filter((decoration) => decoration.kind === 'line')
    .map((decoration) => decoration.class as string);

/** Applies a StateCommand without a view, returning the resulting state. */
export const run = (
  state: EditorState,
  command: StateCommand,
): { state: EditorState; handled: boolean } => {
  let next = state;
  const handled = command({
    state,
    dispatch: (transaction: Transaction) => {
      next = transaction.state;
    },
  });
  return { state: next, handled };
};

export const whole = (state: EditorState): { from: number; to: number }[] => [
  { from: 0, to: state.doc.length },
];
