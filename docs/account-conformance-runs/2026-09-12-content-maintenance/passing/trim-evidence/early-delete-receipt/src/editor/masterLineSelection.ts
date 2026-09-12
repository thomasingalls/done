import { EditorSelection } from '@codemirror/state';

/** Select whole line groups for one admitted deletion, taking the separator before a terminal group. */
export const masterLineSelection = (
  text: string,
  selected: readonly number[],
): { ranges: { anchor: number; head: number }[]; main: number } | null => {
  const lines = text.split('\n');
  let offset = 0;
  const starts = lines.map((line) => {
    const at = offset;
    offset += line.length + 1;
    return at;
  });
  const groups: { first: number; last: number }[] = [];
  for (const line of [...new Set(selected)]
    .filter((line) => Number.isInteger(line) && line >= 0 && line < lines.length)
    .sort((a, b) => a - b)) {
    const group = groups.at(-1);
    if (group && group.last + 1 === line) group.last = line;
    else groups.push({ first: line, last: line });
  }
  return groups.length
    ? EditorSelection.create(
        groups.map(({ first, last }) =>
          EditorSelection.range(
            last === lines.length - 1 ? Math.max(0, starts[first]! - 1) : starts[first]!,
            last === lines.length - 1 ? text.length : starts[last + 1]!,
          ),
        ),
      ).toJSON()
    : null;
};
