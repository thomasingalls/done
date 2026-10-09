/**
 * Live preview (TRD §5.2).
 *
 * The document CodeMirror holds is literal markdown. Nothing here mutates it —
 * every affordance is a view-layer decoration computed from the Lezer syntax
 * tree, which is what makes byte-for-byte round-tripping automatic rather than
 * something to defend.
 *
 * Two rules govern the whole file:
 *
 *   1. Syntax characters are visible on the line the cursor is on, hidden
 *      elsewhere.
 *   2. **Line height must not change** between those two states.
 *
 * Rule 2 is why formatting marks are emitted *unconditionally* and only the
 * `replace` decorations are conditional. TRD §5.2 step 4 reads as though the
 * formatting mark were part of the hidden branch; doing that would restyle a
 * heading line as the cursor entered it and move the text under the cursor,
 * which is the failure rule 2 exists to prevent. So the content keeps its
 * formatting in both states and only the syntax characters come and go — which
 * is also what Obsidian does.
 */

import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { toggleTaskAt } from './commands';

const HIDDEN = Decoration.replace({});

const mark = (cls: string) => Decoration.mark({ class: cls });

const MARK = mark('cm-md-mark');
const STRONG = mark('cm-md-strong');
const EM = mark('cm-md-em');
const STRIKE = mark('cm-md-strike');
const CODE = mark('cm-md-code');
const LINK = mark('cm-md-link');
const LIST_MARK = mark('cm-md-list-mark');

/**
 * Sized to sit inside the line box: at 0.95em tall against a line height of
 * 1.6, neither the top nor the bottom of the inline box can reach past the
 * strut, so the widget cannot grow the line. `test/geometry` holds that down.
 */
/**
 * Widgets that can render without a view, so the static card render (TRD §4.4)
 * can walk the same decoration set the editor walks. `WidgetType.toDOM` takes
 * an `EditorView`, and the static render has none — this is the narrow opening
 * that lets both sides share one widget rather than two that look alike.
 */
export interface StaticWidget {
  staticDOM: () => HTMLElement;
}

export const isStaticWidget = (widget: WidgetType): widget is WidgetType & StaticWidget =>
  typeof (widget as Partial<StaticWidget>).staticDOM === 'function';

class TaskCheckbox extends WidgetType implements StaticWidget {
  constructor(readonly checked: boolean) {
    super();
  }

  override eq(other: TaskCheckbox): boolean {
    return other.checked === this.checked;
  }

  staticDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-md-task';
    el.dataset['checked'] = String(this.checked);
    el.setAttribute('role', 'checkbox');
    el.setAttribute('aria-checked', String(this.checked));
    return el;
  }

  override toDOM(): HTMLElement {
    return this.staticDOM();
  }

  /** Let the click reach the plugin's handler rather than being swallowed. */
  override ignoreEvent(): boolean {
    return false;
  }
}

interface LineSpan {
  from: number;
  to: number;
}

/** Line-number spans touched by the cursor or a selection. */
const activeSpans = (state: EditorState): LineSpan[] =>
  state.selection.ranges.map((range) => ({
    from: state.doc.lineAt(range.from).number,
    to: range.empty ? state.doc.lineAt(range.from).number : state.doc.lineAt(range.to).number,
  }));

const spansIntersect = (spans: LineSpan[], first: number, last: number): boolean =>
  spans.some((span) => span.from <= last && span.to >= first);

/** Extends a syntax range over the single space that follows it. */
const withTrailingSpace = (state: EditorState, to: number): number =>
  state.doc.sliceString(to, to + 1) === ' ' ? to + 1 : to;

const parentName = (node: SyntaxNodeRef): string => node.node.parent?.name ?? '';

const HEADING = /^(?:ATX|Setext)Heading([1-6])$/;

/**
 * Pure so it can be tested without a view (TRD §11 keeps the live-preview
 * behaviour under test; a `ViewPlugin` would drag layout into those tests).
 */
export interface DecorationOptions {
  /**
   * Whether the cursor's line reveals its syntax. False for the static card
   * render (TRD §4.4), which has no cursor: the same decorations, computed once,
   * with nothing revealed. Sharing this function is what makes the static render
   * and the mounted editor one markdown-to-HTML path rather than two that have
   * to be kept in step.
   */
  reveal?: boolean;
}

export const buildDecorations = (
  state: EditorState,
  ranges: readonly { from: number; to: number }[],
  options: DecorationOptions = {},
): DecorationSet => {
  const decorations: Range<Decoration>[] = [];
  const spans = options.reveal === false ? [] : activeSpans(state);
  const tree = syntaxTree(state);
  const emitted = new Set<string>();

  /** Deduped because adjacent visible ranges can present the same node twice. */
  const add = (from: number, to: number, decoration: Decoration, key: string): void => {
    const id = `${from}:${to}:${key}`;
    if (emitted.has(id)) return;
    emitted.add(id);
    decorations.push(decoration.range(from, to));
  };

  const push = (from: number, to: number, decoration: Decoration, key: string): void => {
    if (to <= from) return; // empty mark and replace ranges are meaningless
    add(from, to, decoration, key);
  };

  const lineDecoration = (from: number, to: number, cls: string): void => {
    let pos = from;
    while (pos <= to) {
      const line = state.doc.lineAt(pos);
      add(line.from, line.from, Decoration.line({ class: cls }), `line:${cls}`);
      if (line.to >= to) break;
      pos = line.to + 1;
    }
  };

  const isActive = (from: number, to: number): boolean =>
    spansIntersect(spans, state.doc.lineAt(from).number, state.doc.lineAt(to).number);

  const hide = (from: number, to: number): void => {
    if (from >= to) return;
    if (isActive(from, to)) return;
    push(from, to, HIDDEN, 'hide');
  };

  const enter = (node: SyntaxNodeRef): void => {
    const { name, from, to } = node;

    const heading = HEADING.exec(name);
    if (heading) {
      lineDecoration(from, to, `cm-md-heading cm-md-h${heading[1]}`);
      return;
    }

    switch (name) {
      case 'Blockquote':
        lineDecoration(from, to, 'cm-md-quote');
        return;

      case 'FencedCode':
      case 'CodeBlock':
        lineDecoration(from, to, 'cm-md-codeblock');
        return;

      case 'HorizontalRule':
        lineDecoration(from, to, 'cm-md-hr');
        hide(from, to);
        return;

      case 'StrongEmphasis':
        push(from, to, STRONG, 'strong');
        return;
      case 'Emphasis':
        push(from, to, EM, 'em');
        return;
      case 'Strikethrough':
        push(from, to, STRIKE, 'strike');
        return;
      case 'InlineCode':
        push(from, to, CODE, 'code');
        return;
      case 'Link':
        push(from, to, LINK, 'link');
        return;

      case 'HeaderMark':
        push(from, to, MARK, 'mark');
        // Setext underlines are the whole line; hiding one would leave a blank
        // line behind, so only ATX hashes are hidden.
        if (parentName(node).startsWith('ATXHeading')) hide(from, withTrailingSpace(state, to));
        return;

      case 'EmphasisMark':
      case 'StrikethroughMark':
        push(from, to, MARK, 'mark');
        hide(from, to);
        return;

      case 'CodeMark':
        push(from, to, MARK, 'mark');
        // Fences stay visible. Hiding them would leave the block bracketed by
        // blank lines, which reads worse than the three backticks it replaced.
        if (parentName(node) === 'InlineCode') hide(from, to);
        return;

      case 'CodeInfo':
        push(from, to, MARK, 'mark');
        return;

      case 'LinkMark':
      case 'URL':
      case 'LinkTitle':
        // Images are a permanent non-goal (PRD §12), so image syntax is left
        // raw rather than given a rendering the app will never support.
        if (parentName(node) !== 'Link') return;
        push(from, to, MARK, 'mark');
        hide(from, to);
        return;

      case 'QuoteMark':
        push(from, to, MARK, 'mark');
        hide(from, withTrailingSpace(state, to));
        return;

      case 'ListMark': {
        const isTask = node.node.parent?.getChild('Task') != null;
        if (!isTask) {
          push(from, to, LIST_MARK, 'listmark');
          return;
        }
        push(from, to, MARK, 'mark');
        hide(from, withTrailingSpace(state, to));
        return;
      }

      case 'TaskMarker': {
        const checked = /[xX]/.test(state.doc.sliceString(from, to));
        if (isActive(from, to)) {
          push(from, to, MARK, 'mark');
          return;
        }
        push(from, to, Decoration.replace({ widget: new TaskCheckbox(checked) }), 'task');
        return;
      }

      default:
        return;
    }
  };

  for (const range of ranges) {
    tree.iterate({ from: range.from, to: range.to, enter });
  }

  return Decoration.set(decorations, true);
};

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state, view.visibleRanges);
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildDecorations(update.view.state, update.view.visibleRanges);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * Checkbox clicks. Handled here rather than inside the widget because the
 * widget has no view, and `posAtDOM` at click time is correct where a position
 * captured at render time would go stale.
 */
const checkboxClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement | null;
    const box = target?.closest('.cm-md-task');
    if (!box) return false;
    toggleTaskAt(view, view.posAtDOM(box));
    return true;
  },
});

export const livePreview = (): Extension => [livePreviewPlugin, checkboxClicks];
