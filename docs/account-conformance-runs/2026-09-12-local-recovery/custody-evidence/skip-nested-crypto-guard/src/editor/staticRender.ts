/**
 * Cards render static until focused (TRD §4.4).
 *
 * A card is not a mounted editor by default. It renders as HTML from its
 * markdown, and an editor mounts only on focus. That does three jobs at once:
 * one or two live CodeMirror instances at a time regardless of list length,
 * Done-guarding (PRD §5), and freezing (§4.5) — cards in a frozen day never
 * mount at all.
 *
 * ## Hard constraint: static render and mounted editor must be pixel-identical
 *
 * The way that is met here is structural rather than diligent. The static
 * renderer has no idea of its own about what markdown looks like: it builds the
 * *same decoration set* the live-preview extension builds, with the cursor line
 * suppressed, and walks it. The classes, the hidden ranges and the checkbox
 * widget are therefore the same objects produced by the same code, and there is
 * no second markdown-to-HTML implementation to drift.
 *
 * What is not shared is the container's own geometry — font, line height,
 * wrapping, padding — because CodeMirror injects those as an unlayered
 * stylesheet at runtime and an app stylesheet cannot reach them (the same
 * problem, in the other direction, as the note at the top of theme.ts). Both
 * sides read the same custom properties, and `test/geometry/cards.spec.ts`
 * measures one against the other, which is the regression test §11 asks for.
 */

import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import type { Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { buildDecorations, isStaticWidget } from './livePreview';

/** A parse budget: cards are short, and a card that somehow is not stays legible. */
const PARSE_MS = 200;

const parseState = (text: string): EditorState => {
  const state = EditorState.create({
    doc: text,
    // Position 0 would put a cursor on line 1 and reveal its syntax; the
    // decoration builder is told to reveal nothing instead, so this is only a
    // valid selection and not a claim about where a cursor is.
    selection: EditorSelection.single(0),
    extensions: [markdown({ base: markdownLanguage, addKeymap: false })],
  });
  ensureSyntaxTree(state, state.doc.length, PARSE_MS);
  return state;
};

interface Piece {
  from: number;
  to: number;
  class?: string;
  widget?: WidgetType;
  point: boolean;
}

const piecesOf = (set: DecorationSet): Piece[] => {
  const out: Piece[] = [];
  const cursor = set.iter();
  while (cursor.value) {
    const { spec, point } = cursor.value as Decoration & {
      spec: { class?: string; widget?: WidgetType };
      point: boolean;
    };
    out.push({
      from: cursor.from,
      to: cursor.to,
      ...(spec.class === undefined ? {} : { class: spec.class }),
      ...(spec.widget === undefined ? {} : { widget: spec.widget }),
      point,
    });
    cursor.next();
  }
  return out;
};

const isLineDecoration = (piece: Piece): boolean =>
  piece.point && piece.from === piece.to && piece.class !== undefined;

/** A `Decoration.replace`: text that is not shown, with or without a widget. */
const isReplace = (piece: Piece): boolean => piece.class === undefined;

/**
 * Wraps a run of text in every mark covering it, largest outermost, so nested
 * formatting (`***x***`) nests in the DOM the way CodeMirror nests it.
 */
const wrap = (content: string, marks: readonly Piece[]): Node => {
  let node: Node = document.createTextNode(content);
  for (const mark of [...marks].sort((a, b) => a.to - a.from - (b.to - b.from))) {
    const span = document.createElement('span');
    span.className = mark.class as string;
    span.append(node);
    node = span;
  }
  return node;
};

/**
 * Renders `text` into `host`, replacing whatever was there.
 *
 * The DOM shape mirrors CodeMirror's — one element per line, inline spans for
 * marks — because that is what makes the two renders comparable at all. The
 * container classes are the app's own (`md-line`) rather than CodeMirror's,
 * since `cm-line` carries a vendor stylesheet that only exists once an editor
 * has been constructed somewhere on the page.
 */
export const renderStatic = (host: HTMLElement, text: string): void => {
  const state = parseState(text);
  const pieces = piecesOf(
    buildDecorations(state, [{ from: 0, to: state.doc.length }], { reveal: false }),
  );

  const fragment = document.createDocumentFragment();

  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    const element = document.createElement('div');

    const lineClass = pieces.find(
      (piece) => isLineDecoration(piece) && piece.from === line.from,
    )?.class;
    element.className = lineClass ? `md-line ${lineClass}` : 'md-line';

    const marks = pieces.filter(
      (piece) =>
        !isLineDecoration(piece) &&
        piece.class !== undefined &&
        piece.from < line.to &&
        piece.to > line.from,
    );

    const hidden = pieces
      .filter((piece) => isReplace(piece) && piece.from < line.to && piece.to > line.from)
      .sort((a, b) => a.from - b.from);

    const emit = (from: number, to: number): void => {
      if (to <= from) return;
      const covering = marks.filter((mark) => mark.from <= from && mark.to >= to);
      const cuts = new Set<number>([from, to]);
      for (const mark of marks) {
        if (mark.from > from && mark.from < to) cuts.add(mark.from);
        if (mark.to > from && mark.to < to) cuts.add(mark.to);
      }
      if (cuts.size > 2) {
        const points = [...cuts].sort((a, b) => a - b);
        for (let index = 0; index < points.length - 1; index++) {
          emit(points[index] as number, points[index + 1] as number);
        }
        return;
      }
      element.append(wrap(state.doc.sliceString(from, to), covering));
    };

    let position = line.from;
    for (const piece of hidden) {
      if (piece.from > position) emit(position, Math.min(piece.from, line.to));
      if (piece.widget && isStaticWidget(piece.widget)) element.append(piece.widget.staticDOM());
      position = Math.max(position, Math.min(piece.to, line.to));
    }
    emit(position, line.to);

    // An empty line still needs a line box, and an empty <div> has none.
    if (element.childNodes.length === 0) element.append(document.createElement('br'));

    fragment.append(element);
  }

  host.replaceChildren(fragment);
};
