import { headingPathFrom, type DocumentHeading } from './breadcrumbs';

/** Same authored hierarchy as the full outline, including skipped heading levels. */
export const childHeadings = (
  headings: readonly DocumentHeading[],
  parent: number | null,
): readonly DocumentHeading[] => {
  const stack: DocumentHeading[] = [],
    result: DocumentHeading[] = [];
  for (const heading of headings) {
    while (stack.length && stack.at(-1)!.level >= heading.level) stack.pop();
    if ((stack.at(-1)?.from ?? null) === parent) result.push(heading);
    stack.push(heading);
  }
  return result;
};

export const headingMenu = (
  headings: readonly DocumentHeading[],
  heading: DocumentHeading,
): { readonly siblings: boolean; readonly headings: readonly DocumentHeading[] } => {
  const children = childHeadings(headings, heading.from);
  if (children.length) return { siblings: false, headings: children };
  const parent = headingPathFrom(headings, heading.from).at(-2)?.from ?? null;
  return { siblings: true, headings: childHeadings(headings, parent) };
};
