/**
 * The canonical markdown form of a day (TRD §4.5, §9).
 *
 * There is exactly one serializer. Compaction writes it into `archive` and
 * export writes it into a file, which is the point: the destructive operation
 * and the one the user can inspect share a code path, so compaction is
 * continuously exercised by something safe (TRD §10.4).
 *
 * ## Why cards are list items
 *
 * §9 says "collections serialize as lists of cards separated by blank lines".
 * Read as *blank-line-delimited blocks* that is ambiguous the moment a card
 * contains a blank line — which it can, since the split gesture is three
 * returns and two of them leave one behind — and §11 requires that `compact →
 * parse` reproduce arbitrary collections exactly. So a card is written as a
 * markdown list item: the first line after `- `, the rest indented by two. Card
 * boundaries are then the only lines starting at column 0, whatever the card
 * contains, and the result is still a list of cards separated by blank lines.
 *
 * The alternative was to forbid blank lines inside cards by dropping the split
 * threshold to two returns. That would make the storage format depend on a
 * number PRD §10 explicitly calls a tunable, which is the wrong direction for
 * the dependency to run.
 *
 * ## Byte-exactness
 *
 * Round-tripping is a requirement, not an aspiration, so the rules are
 * mechanical rather than pretty:
 *
 * - Every line of a card is prefixed — `- ` for the first, two spaces for the
 *   rest — except *empty* lines, which stay empty so the output carries no
 *   trailing whitespace. Whitespace-only lines are indented like any other and
 *   so survive intact.
 * - An empty first line writes `-` alone rather than `- ` plus a trailing space.
 * - Exactly one blank line separates cards, and exactly one sits on each side of
 *   a section heading. Parsing removes exactly one in each place, so a card that
 *   legitimately ends in a blank line keeps it.
 *
 * Headings are matched **in document order** rather than by search, so a card
 * whose text happens to contain `## Done` cannot be mistaken for the section
 * itself. Every line of a card is indented, so in practice no card line reaches
 * column 0 at all — the ordering rule is belt to that brace.
 */

import { SECTIONS, archiveOf, cardBody, cardsIn, dayAt, type Section } from './days';
import type { ISODate } from '../lib/date';
import type { YDoc } from './yjs';

const HEADINGS: Record<Section, string> = {
  next: '## Next',
  scheduled: '## Scheduled',
  done: '## Done',
};

/**
 * What a serialized day contains, independent of where it is stored.
 *
 * A day *is* its three collections, so the day file and the `archive` a
 * compacted day holds are the same format read by the same parser — which is
 * what makes "exactly one serializer" (TRD §9) literally true rather than
 * nearly true. `Collections` is the name compaction uses for the same shape.
 */
export interface DayContent {
  next: string[];
  scheduled: string[];
  done: string[];
}

export type Collections = DayContent;

export const emptyCollections = (): Collections => ({ next: [], scheduled: [], done: [] });

export const emptyDayContent = emptyCollections;

/* -------------------------------------------------------------------------- */
/* Cards                                                                       */

const encodeCard = (body: string): string[] => {
  const [first = '', ...rest] = body.split('\n');
  return [
    first === '' ? '-' : `- ${first}`,
    ...rest.map((line) => (line === '' ? '' : `  ${line}`)),
  ];
};

const isCardStart = (line: string): boolean => line === '-' || line.startsWith('- ');

const decodeCard = (lines: readonly string[]): string =>
  lines
    .map((line, index) => {
      if (index === 0) return line === '-' ? '' : line.slice(2);
      return line.startsWith('  ') ? line.slice(2) : line;
    })
    .join('\n');

const collectionLines = (bodies: readonly string[]): string[] => {
  const out: string[] = [];
  bodies.forEach((body, index) => {
    if (index > 0) out.push('');
    out.push(...encodeCard(body));
  });
  return out;
};

/**
 * Splits a section body into cards. The blank line before each card start is
 * the separator this serializer wrote, so exactly one is removed — anything
 * beyond it belonged to the card that ended there.
 */
const parseCollection = (lines: readonly string[]): string[] => {
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (isCardStart(line)) starts.push(index);
  });

  return starts.map((start, position) => {
    const end = starts[position + 1] ?? lines.length;
    const slice = lines.slice(start, end);
    if (position < starts.length - 1 && slice.at(-1) === '') slice.pop();
    return decodeCard(slice);
  });
};

/* -------------------------------------------------------------------------- */
/* Days                                                                        */

/** A heading, a blank line, the body, and a blank line. Always all four. */
const sectionLines = (heading: string, body: readonly string[]): string[] => [
  heading,
  '',
  ...body,
  '',
];

/**
 * The three collections, in section order. This is a whole day file (TRD §9)
 * and also what `archive` holds (§4.5) — the same bytes either way.
 */
export const serializeDay = (content: DayContent): string =>
  SECTIONS.flatMap((name) => sectionLines(HEADINGS[name], collectionLines(content[name]))).join(
    '\n',
  );

export const serializeCollections = serializeDay;

/**
 * Heading positions, matched in document order so a stray `## Done` inside a
 * card cannot be mistaken for the section itself.
 */
const findHeadings = (lines: readonly string[], headings: readonly string[]): number[] => {
  const found: number[] = [];
  let from = 0;
  for (const heading of headings) {
    const index = lines.indexOf(heading, from);
    if (index < 0) {
      found.push(-1);
      continue;
    }
    found.push(index);
    from = index + 1;
  }
  return found;
};

/**
 * Strips the blank line the writer put after a heading and before the next one.
 * Exactly one at each end, so a final card that genuinely ends in a blank line
 * keeps it.
 */
const trimOneEachEnd = (lines: readonly string[]): string[] => {
  const out = [...lines];
  if (out[0] === '') out.shift();
  if (out.at(-1) === '') out.pop();
  return out;
};

const parseSections = (source: string, headings: readonly string[]): (string[] | undefined)[] => {
  const lines = source.split('\n');
  const positions = findHeadings(lines, headings);

  return positions.map((position, index) => {
    if (position < 0) return undefined;
    const next = positions.slice(index + 1).find((value) => value >= 0) ?? lines.length;
    return trimOneEachEnd(lines.slice(position + 1, next));
  });
};

export const parseDay = (source: string): DayContent => {
  const [next, scheduled, done] = parseSections(source, [
    HEADINGS.next,
    HEADINGS.scheduled,
    HEADINGS.done,
  ]);

  return {
    next: parseCollection(next ?? []),
    scheduled: parseCollection(scheduled ?? []),
    done: parseCollection(done ?? []),
  };
};

export const parseCollections = parseDay;

/* -------------------------------------------------------------------------- */
/* Reading a live day                                                          */

export const readDayContent = (doc: YDoc, date: ISODate): DayContent => {
  const day = dayAt(doc, date);
  const archive = archiveOf(day);
  // A compacted day has no collections left; the archive is where they went.
  if (archive) return parseCollections(archive.toString());

  const content = emptyCollections();
  for (const name of SECTIONS) {
    content[name] = cardsIn(doc, date, name).map(cardBody);
  }
  return content;
};

export const readCollections = readDayContent;
