import { ensureSyntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { headingsThrough } from './breadcrumbs';
import { normalizeGoalsContext, type GoalsContext } from '../crdt/days';

/** Explicit transfer only. Source positions, never the scroll breadcrumb or text matching. */
export const goalsContextsForLines = (
  state: EditorState,
  lines: readonly { readonly line: number; readonly text: string }[],
): readonly (GoalsContext | null)[] => {
  const selected = lines
    .map((value, index) => ({ ...value, index }))
    .filter(
      ({ line, text }) =>
        Number.isInteger(line) &&
        line >= 0 &&
        line < state.doc.lines &&
        state.doc.line(line + 1).text === text,
    )
    .sort((a, b) => a.line - b.line);
  const result: (GoalsContext | null)[] = lines.map(() => null);
  // One-line lookahead recognizes a selected Setext title before its underline.
  const through = selected.length
    ? state.doc.line(Math.min(state.doc.lines, selected.at(-1)!.line + 2)).to
    : 0;
  if (!through) return result;
  // A partial tree must not invent a shallower source path. Missing coverage
  // omits optional context, never blocks or modifies the selected writing.
  const tree = ensureSyntaxTree(state, through, 50);
  if (!tree || tree.length < through) return result;
  const headings = headingsThrough(state, through, 0);
  const stack: (typeof headings)[number][] = [];
  let next = 0;
  for (const value of selected) {
    const from = state.doc.line(value.line + 1).from;
    // A selected heading used as a title excludes itself from its ancestors.
    while (next < headings.length && headings[next]!.from < from) {
      const heading = headings[next++]!;
      while (stack.length && stack.at(-1)!.level >= heading.level) stack.pop();
      stack.push(heading);
    }
    const ownHeading = headings[next];
    let enclosing = tree.resolveInner(from, 1);
    while (enclosing.parent && !/^(?:ATX|Setext)Heading[1-6]$/u.test(enclosing.name))
      enclosing = enclosing.parent;
    const enclosingLevel = /^(?:ATX|Setext)Heading([1-6])$/u.exec(enclosing.name)?.[1];
    const ownLevel =
      ownHeading && state.doc.lineAt(ownHeading.from).number === value.line + 1
        ? ownHeading.level
        : enclosingLevel
          ? Number(enclosingLevel)
          : null;
    const ancestors =
      ownLevel !== null ? stack.filter((heading) => heading.level < ownLevel) : stack;
    result[value.index] = normalizeGoalsContext(
      ancestors.map(({ level, title }) => ({ level, title })),
    );
  }
  return result;
};
