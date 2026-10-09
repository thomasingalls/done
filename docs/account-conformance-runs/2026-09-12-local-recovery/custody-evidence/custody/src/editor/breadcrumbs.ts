/**
 * Scroll-aware document location for the Goals header (PRD §7.7, TRD §8.6).
 *
 * The heading path is a projection over the one markdown document. It neither
 * mutates nor mirrors the Y.Text, and it follows the first visibly scrolled
 * line rather than the selection or CodeMirror's overscanned viewport.
 */

import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { type EditorState, type Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNodeRef, Tree } from '@lezer/common';

export interface DocumentHeading {
  level: number;
  title: string;
  from: number;
}

export type BreadcrumbListener = (path: readonly DocumentHeading[]) => void;

const HEADING = /^(?:ATX|Setext)Heading([1-6])$/u;

/** Marks that describe inline markdown rather than heading label content. */
const OMITTED_MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'LinkMark',
  'LinkTitle',
]);

const headingTitle = (state: EditorState, heading: SyntaxNodeRef, tree: Tree): string => {
  const omitted: { from: number; to: number }[] = [];

  tree.iterate({
    from: heading.from,
    to: heading.to,
    enter: (node) => {
      const linkDestination = node.name === 'URL' && node.node.parent?.name === 'Link';
      if (OMITTED_MARKS.has(node.name) || linkDestination) {
        omitted.push({ from: node.from, to: node.to });
      }
    },
  });

  let title = '';
  let position = heading.from;
  // Tree iteration is in source order, so omitted ranges already arrive in
  // the order needed to stitch their intervening text together.
  for (const range of omitted) {
    if (range.from < position) continue;
    title += state.doc.sliceString(position, range.from);
    position = range.to;
  }
  title += state.doc.sliceString(position, heading.to);

  return title.replaceAll(/\s+/gu, ' ').trim() || 'Untitled';
};

const headingsThrough = (
  state: EditorState,
  through: number,
  timeout = 10,
): readonly DocumentHeading[] => {
  const tree = ensureSyntaxTree(state, through, timeout) ?? syntaxTree(state);
  const headings: DocumentHeading[] = [];

  tree.iterate({
    from: 0,
    to: through,
    enter: (node) => {
      const match = HEADING.exec(node.name);
      if (!match) return;
      headings.push({
        level: Number(match[1]),
        title: headingTitle(state, node, tree),
        from: node.from,
      });
    },
  });

  return headings;
};

/** Flat, source-ordered representation shared by the breadcrumb and outline. */
export const documentHeadings = (
  state: EditorState,
  timeout?: number,
): readonly DocumentHeading[] => headingsThrough(state, state.doc.length, timeout);

export const headingPathFrom = (
  headings: readonly DocumentHeading[],
  position: number,
): readonly DocumentHeading[] => {
  const path: DocumentHeading[] = [];
  for (const heading of headings) {
    if (heading.from > position) break;
    let parent = path.at(-1);
    while (parent !== undefined && parent.level >= heading.level) {
      path.pop();
      parent = path.at(-1);
    }
    path.push(heading);
  }
  return path;
};

/**
 * Returns the markdown heading ancestry in force at `position`.
 *
 * The incremental parser may not have reached a distant scroll position yet,
 * so ask it for the prefix containing the visible line. The bounded parse is
 * normally a reuse of existing fragments; returning the available tree keeps
 * location reporting non-blocking if an unusually large prefix exceeds it.
 */
export const headingPathAt = (state: EditorState, position: number): readonly DocumentHeading[] => {
  const clamped = Math.max(0, Math.min(position, state.doc.length));
  const through = state.doc.lineAt(clamped).to;
  return headingPathFrom(headingsThrough(state, through), clamped);
};

const sameHeadings = (
  first: readonly DocumentHeading[],
  second: readonly DocumentHeading[],
): boolean =>
  first.length === second.length &&
  first.every(
    (heading, index) =>
      heading.level === second[index]?.level &&
      heading.title === second[index]?.title &&
      heading.from === second[index]?.from,
  );

class ScrollBreadcrumb {
  private path: readonly DocumentHeading[] = [];

  constructor(
    view: EditorView,
    private readonly listener: BreadcrumbListener,
  ) {
    this.schedule(view);
  }

  update(update: ViewUpdate): void {
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.geometryChanged ||
      syntaxTree(update.startState) !== syntaxTree(update.state)
    ) {
      this.schedule(update.view);
    }
  }

  /** Coalesced with CodeMirror's own layout reads during scroll and edits. */
  schedule(view: EditorView): void {
    view.requestMeasure({
      key: this,
      read: (measured) => {
        const scrollEdge = measured.scrollDOM.getBoundingClientRect().top;
        const height = Math.max(0, (scrollEdge - measured.documentTop) / measured.scaleY);
        return measured.lineBlockAtHeight(height).from;
      },
      write: (position, measured) => {
        const next = headingPathAt(measured.state, position);
        if (sameHeadings(this.path, next)) return;
        this.path = next;
        this.listener(next);
      },
    });
  }
}

const scrollBreadcrumbPlugin = ViewPlugin.fromClass<ScrollBreadcrumb, BreadcrumbListener>(
  ScrollBreadcrumb,
  {
    eventHandlers: {
      scroll(_event, view) {
        this.schedule(view);
      },
    },
  },
);

/** Installed only on the long-form document surface, never on card editors. */
export const scrollAwareBreadcrumb = (listener: BreadcrumbListener): Extension =>
  scrollBreadcrumbPlugin.of(listener);
