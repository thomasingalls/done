import { type DocumentHeading } from './breadcrumbs';

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

/** Each caret belongs to the word before it. Root lists H1s; leaves have no child menu items. */
export const headingMenu = (
  headings: readonly DocumentHeading[],
  heading: DocumentHeading | null,
): { readonly siblings: false; readonly headings: readonly DocumentHeading[] } => ({
  siblings: false,
  headings: heading ? childHeadings(headings, heading.from) : headings.filter((h) => h.level === 1),
});
