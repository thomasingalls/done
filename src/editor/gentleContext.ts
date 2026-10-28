/** View-only context: no text transactions, forced parsing, or retained content outside this view. */
import { ensureSyntaxTree, syntaxTree, syntaxTreeAvailable } from '@codemirror/language';
import { RangeSet, StateEffect, type EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode, Tree } from '@lezer/common';

interface Span {
  readonly from: number;
  readonly to: number;
}
interface Heading extends Span {
  readonly level: number;
}
export interface GentleContextPlan {
  readonly section: Span;
  readonly headings: readonly Span[];
}
const HEADING = /^(?:ATX|Setext)Heading([1-6])$/u;
const CONTAINERS = new Set(['Document', 'Blockquote', 'BulletList', 'OrderedList', 'ListItem']);
const measureContext = StateEffect.define<DecorationSet>();

/** Skip inline syntax and code/prose subtrees; cap pathological authored block structure. */
const within = (
  root: SyntaxNode,
  from: number,
  to: number,
  level: number,
  forward: boolean,
  budget: { left: number },
): Heading | null => {
  const pending = [root];
  while (pending.length && budget.left-- > 0) {
    const node = pending.pop()!;
    if (node.from > to || node.to < from) continue;
    const match = HEADING.exec(node.name);
    if (match) {
      if (node.from >= from && node.from <= to && Number(match[1]) <= level)
        return { from: node.from, to: node.to, level: Number(match[1]) };
      continue;
    }
    if (!CONTAINERS.has(node.name)) continue;
    let child = forward ? node.lastChild : node.firstChild;
    while (child && budget.left-- > 0) {
      pending.push(child);
      child = forward ? child.prevSibling : child.nextSibling;
    }
  }
  return null;
};

const findHeading = (
  tree: Tree,
  position: number,
  through: number,
  level: number,
  forward: boolean,
  budget: { left: number },
): Heading | null => {
  let node: SyntaxNode | null = tree.resolveInner(position, forward ? 1 : -1);
  while (node.parent && !CONTAINERS.has(node.parent.name)) node = node.parent;
  while (node && budget.left > 0) {
    if (forward && node.from > through) return null;
    const found = within(
      node,
      forward ? position + 1 : 0,
      forward ? through : position,
      level,
      forward,
      budget,
    );
    if (found) return found;
    while (node && !(forward ? node.nextSibling : node.prevSibling)) node = node.parent;
    node = node ? (forward ? node.nextSibling : node.prevSibling) : null;
  }
  return null;
};

/** Numeric ranges only. An incomplete parse or exhausted lookup leaves ordinary contrast. */
export const gentleContextPlan = (
  state: EditorState,
  through = state.doc.length,
): GentleContextPlan | null => {
  const head = state.selection.main.head;
  const end = Math.min(state.doc.length, Math.max(head, through));
  if (!syntaxTreeAvailable(state, end)) return null;
  const tree = ensureSyntaxTree(state, end, 0);
  if (!tree || tree.length < end) return null;
  const budget = { left: 4096 };
  // Resolve inside a heading when the caret is exactly at its first character.
  const at = tree.resolveInner(head, 1);
  let current: SyntaxNode | null = at;
  while (current && !HEADING.test(current.name)) current = current.parent;
  const match = current ? HEADING.exec(current.name) : null;
  const active =
    current && match
      ? { from: current.from, to: current.to, level: Number(match[1]) }
      : findHeading(tree, head, end, 6, false, budget);
  if (!active || budget.left <= 0) return null;
  const parent =
    active.level > 1 && active.from > 0
      ? findHeading(tree, active.from - 1, end, active.level - 1, false, budget)
      : null;
  const next = findHeading(tree, head, end, active.level, true, budget);
  if (budget.left <= 0) return null;
  return {
    section: { from: active.from, to: next?.from ?? end + 1 },
    headings: parent ? [parent, active] : [active],
  };
};

export const gentleLineIsClear = (
  state: EditorState,
  from: number,
  to: number,
  plan: GentleContextPlan,
): boolean =>
  (from >= plan.section.from && from < plan.section.to) ||
  plan.headings.some((heading) => from < heading.to && to >= heading.from) ||
  state.selection.ranges.some((range) =>
    range.empty ? state.doc.lineAt(range.head).from === from : from < range.to && to >= range.from,
  );

/** A paragraph-only edit cannot change heading ownership if both parser block paths map exactly. */
const paragraphEdit = (update: ViewUpdate): boolean => {
  let safe = true;
  const before = syntaxTree(update.startState),
    after = syntaxTree(update.state);
  update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    if (!safe) return;
    if (
      inserted.lines !== 1 ||
      update.startState.doc.lineAt(fromA).number !== update.startState.doc.lineAt(toA).number ||
      !syntaxTreeAvailable(update.startState, toA) ||
      !syntaxTreeAvailable(update.state, toB)
    ) {
      safe = false;
      return;
    }
    const paragraph = (tree: Tree, from: number, to: number): SyntaxNode | null => {
      let node: SyntaxNode | null = tree.resolveInner(from, -1);
      while (node && node.name !== 'Paragraph') node = node.parent;
      return node && from >= node.from && to <= node.to ? node : null;
    };
    let oldNode = paragraph(before, fromA, toA),
      newNode = paragraph(after, fromB, toB);
    if (!oldNode || !newNode) {
      safe = false;
      return;
    }
    while (oldNode && newNode) {
      if (
        oldNode.name !== newNode.name ||
        update.changes.mapPos(oldNode.from, -1) !== newNode.from ||
        update.changes.mapPos(oldNode.to, 1) !== newNode.to
      ) {
        safe = false;
        return;
      }
      oldNode = oldNode.parent;
      newNode = newNode.parent;
    }
    if (oldNode || newNode) safe = false;
  });
  return safe;
};

/** Numeric interval cache, owned by one editor. No heading titles or workspace content are retained. */
class ContextInterval {
  private tree: Tree | null = null;
  private plan: GentleContextPlan | null = null;
  private owner: Span = { from: 0, to: 0 };
  private through = 0;

  update(update: ViewUpdate): void {
    if (!this.tree) return;
    if (
      update.transactions.some((transaction) => transaction.reconfigured) ||
      this.tree !== syntaxTree(update.startState) ||
      (!update.docChanged && this.tree !== syntaxTree(update.state)) ||
      (update.docChanged && !paragraphEdit(update))
    ) {
      this.tree = null;
      return;
    }
    if (update.docChanged) {
      const position = (value: number, association: number) =>
        value > update.startState.doc.length
          ? update.changes.mapPos(update.startState.doc.length, association) + 1
          : update.changes.mapPos(value, association);
      const span = (value: Span): Span => ({
        from: position(value.from, -1),
        to: position(value.to, 1),
      });
      if (this.plan)
        this.plan = { section: span(this.plan.section), headings: this.plan.headings.map(span) };
      this.owner = span(this.owner);
      this.through = position(this.through, 1);
    }
    this.tree = syntaxTree(update.state);
  }

  get(state: EditorState, through: number): GentleContextPlan | null {
    const head = state.selection.main.head;
    if (
      this.tree === syntaxTree(state) &&
      through <= this.through &&
      head >= this.owner.from &&
      head < this.owner.to &&
      syntaxTreeAvailable(state, through)
    )
      return this.plan;
    this.plan = gentleContextPlan(state, through);
    this.tree = syntaxTree(state);
    this.through = through;
    // Cache only proven parse coverage. Unknown/budget-exhausted scope is restricted to this caret.
    this.owner = { from: head, to: head + 1 };
    if (!syntaxTreeAvailable(state, through)) {
      this.tree = null;
      return this.plan;
    }
    if (this.plan) {
      const budget = { left: 4096 };
      const next = findHeading(this.tree, head, through, 6, true, budget);
      if (budget.left > 0)
        this.owner = { from: this.plan.section.from, to: next?.from ?? through + 1 };
    }
    return this.plan;
  }
}

class GentleContext {
  decorations: DecorationSet = Decoration.none;
  private readonly context = new ContextInterval();
  private alive = true;
  private scheduled = false;
  private generation = 0;
  private readonly viewport: VisualViewport | null;
  private readonly window: Window;
  private readonly onViewport: () => void;
  constructor(view: EditorView) {
    this.window = view.dom.ownerDocument.defaultView ?? window;
    this.viewport = this.window.visualViewport;
    this.onViewport = () => this.schedule(view);
    this.viewport?.addEventListener('resize', this.onViewport);
    this.viewport?.addEventListener('scroll', this.onViewport);
    this.schedule(view);
  }
  update(update: ViewUpdate): void {
    this.context.update(update);
    if (update.docChanged) this.decorations = this.decorations.map(update.changes);
    const measurement = update.transactions
      .flatMap((transaction) => transaction.effects)
      .find((effect) => effect.is(measureContext));
    if (measurement) this.decorations = measurement.value;
    if (
      !measurement &&
      (update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.geometryChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state))
    )
      this.schedule(update.view);
  }
  schedule(view: EditorView): void {
    if (!this.alive || this.scheduled) return;
    this.scheduled = true;
    const generation = ++this.generation;
    view.requestMeasure({
      key: this,
      read: (measured) => {
        const box = measured.scrollDOM.getBoundingClientRect();
        const host = measured.dom.getBoundingClientRect();
        const caret = measured.coordsAtPos(measured.state.selection.main.head);
        const viewport = this.window.visualViewport;
        const top = Math.max(box.top, viewport?.offsetTop ?? 0);
        const bottom = Math.min(
          box.bottom,
          viewport ? viewport.offsetTop + viewport.height : this.window.innerHeight,
        );
        const left = Math.max(box.left, viewport?.offsetLeft ?? 0);
        const right = Math.min(
          box.right,
          viewport ? viewport.offsetLeft + viewport.width : this.window.innerWidth,
        );
        const visible =
          !!caret &&
          box.height > 0 &&
          host.width > 0 &&
          caret.bottom > top &&
          caret.top < bottom &&
          caret.right >= left &&
          caret.left <= right;
        return { state: measured.state, visible };
      },
      write: (measurement, measured) => {
        this.scheduled = false;
        // CodeMirror is still updating during its measurement writes. Only
        // dispatch after that transaction, and never revive a retired/stale view.
        this.window.queueMicrotask(() => {
          if (!this.alive || generation !== this.generation) return;
          if (measured.state !== measurement.state) {
            this.schedule(measured);
            return;
          }
          let next = Decoration.none;
          if (measurement.visible) {
            const through = Math.max(
              measured.state.selection.main.head,
              ...measured.visibleRanges.map((range) => range.to),
            );
            const plan = this.context.get(measured.state, through);
            if (plan) {
              const decorations = [];
              const seen = new Set<number>();
              for (const range of measured.visibleRanges) {
                for (
                  let number = measured.state.doc.lineAt(range.from).number;
                  number <= measured.state.doc.lineAt(range.to).number;
                  number++
                ) {
                  const line = measured.state.doc.line(number);
                  if (seen.has(line.from)) continue;
                  seen.add(line.from);
                  if (!gentleLineIsClear(measured.state, line.from, line.to, plan))
                    decorations.push(Decoration.line({ class: 'cm-gentle-dim' }).range(line.from));
                }
              }
              next = Decoration.set(decorations, true);
            }
          }
          if (!RangeSet.eq([this.decorations], [next]))
            measured.dispatch({ effects: measureContext.of(next) });
        });
      },
    });
  }
  destroy(): void {
    this.alive = false;
    this.viewport?.removeEventListener('resize', this.onViewport);
    this.viewport?.removeEventListener('scroll', this.onViewport);
    this.decorations = Decoration.none;
  }
}

/** Installed only on Goals. Removing the extension restores ordinary contrast immediately. */
export const gentleContextView = () =>
  ViewPlugin.fromClass(GentleContext, {
    decorations: (value) => value.decorations,
    eventHandlers: {
      scroll(_event, view) {
        this.schedule(view);
      },
    },
  });
